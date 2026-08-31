"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, RefreshCw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { assessLivePixelQuality, type QualitySeverity } from "@/lib/scoring";
import { FaceMeshDetector } from "@/lib/mediapipe";
import { evaluateFaceGuide, type FaceGuide, type PoseTarget } from "@/lib/face-guide";
import { useIsMobile } from "@/lib/use-is-mobile";
import { ThemeToggle } from "@/components/ThemeToggle";

type LiveQuality = {
  blur: QualitySeverity;
  lighting: QualitySeverity;
};

export type SequenceFrames = Partial<Record<PoseTarget, HTMLImageElement>>;

interface CameraCaptureProps {
  open: boolean;
  autoCapture?: boolean;
  autoCaptureFrameCount?: number;
  // Phase 636 — ms between burst frames. Callers that want a real
  // ~1-2s burst (vs. this component's original quick same-pose retry
  // burst) pass a larger value; default keeps existing callers
  // (SurgeryFlow, which only keeps frame 1 anyway) at their prior timing.
  autoCaptureIntervalMs?: number;
  onClose: () => void;
  onPermissionDenied?: () => void;
  onCapture: (image: HTMLImageElement) => void;
  onCaptureBatch?: (images: HTMLImageElement[]) => void;
  // Phase 620 — guided 4-pose live scan. When set, the dialog walks the
  // user through each target pose in order (front/left/right/up),
  // auto-capturing a frame per pose instead of the single-shot or
  // same-pose burst-capture (`autoCapture`) paths. `onCapture` /
  // `onCaptureBatch` are simply not invoked while a sequence is active.
  poseSequence?: PoseTarget[];
  onSequenceComplete?: (frames: SequenceFrames) => void;
}

const AUTO_CAPTURE_FOCUS_DELAY_MS = 4000;

/**
 * Live in-browser camera capture. Opens a `<video>` stream from
 * `navigator.mediaDevices.getUserMedia` (front-facing by default),
 * shows a viewfinder, and on capture freezes a canvas frame, encodes
 * it as a JPEG, and hands an HTMLImageElement back via `onCapture`.
 *
 * Falls back gracefully if the user denies permission or the device
 * has no camera — shows an inline error and a close button.
 */
export function CameraCapture({
  open,
  autoCapture = false,
  autoCaptureFrameCount = 3,
  autoCaptureIntervalMs = 140,
  onClose,
  onPermissionDenied,
  onCapture,
  onCaptureBatch,
  poseSequence,
  onSequenceComplete,
}: CameraCaptureProps) {
  const { t, lang } = useT();
  const isMobile = useIsMobile();
  const cameraTextRef = useRef(t.camera);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Phase 192q — Gate getUserMedia behind an explicit user gesture on
  // mobile. Auto-starting the stream on mount on a mid-range Android
  // costs ~200-400ms of main-thread time (permission UI + decoder init
  // + first frame layout) and immediately spawns the rAF detect loop +
  // MediaPipe lazy-load. Desktop still auto-starts because the cost is
  // negligible and skipping a click is real UX. Mobile users tap the
  // "Start camera" affordance once they've finished framing the dialog.
  const [started, setStarted] = useState(false);
  // Phase 192q — Suppress the detect-overlay ring transition
  // shadow when the user has prefers-reduced-motion. The ring color
  // still updates (signal preserved); only the animated easing is
  // dropped. Matches the OnboardingWizard pattern (Phase 192o).
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || !document.hidden
  );
  // Phase 187 — Token that detects a stale `getUserMedia` resolution
  // (e.g. user clicked Cancel while the browser permission prompt was
  // up, then later granted). Each `startStream` invocation increments;
  // a `stopStream` also increments. The async getUserMedia caller
  // compares the token captured at start vs the current value and bails
  // out if they differ.
  const streamTokenRef = useRef(0);
  const detectorRef = useRef<FaceMeshDetector | null>(null);
  const guideCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qualityCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureBusyRef = useRef(false);
  const autoCaptureTimerRef = useRef<number | null>(null);
  const autoCaptureFocusTimerRef = useRef<number | null>(null);
  const guideCanvasSizeRef = useRef({ width: 0, height: 0 });
  const qualityInflightRef = useRef(false);
  // Phase 620 — guided 4-pose sequence state. Refs mirror the state so
  // the detect-loop closure (which doesn't re-run per capture) always
  // reads the current step without needing it in its effect deps.
  const [sequenceStepIndex, setSequenceStepIndex] = useState(0);
  const sequenceStepIndexRef = useRef(0);
  const sequenceFramesRef = useRef<SequenceFrames>({});
  const sequenceCaptureTimerRef = useRef<number | null>(null);
  const poseSequenceRef = useRef<PoseTarget[] | undefined>(poseSequence);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [previewWarm, setPreviewWarm] = useState(false);
  const [autoCaptureFocusReady, setAutoCaptureFocusReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [liveQuality, setLiveQuality] = useState<LiveQuality | null>(null);
  // Phase 140 — live face-pose guidance.
  const [guide, setGuide] = useState<FaceGuide>({
    status: "no-face",
    hint_th: "ให้ใบหน้าอยู่ในกรอบก่อน",
    hint_en: "Place your face inside the frame",
    readiness: 0,
  });

  useEffect(() => {
    cameraTextRef.current = t.camera;
  }, [t.camera]);

  useEffect(() => {
    poseSequenceRef.current = poseSequence;
  }, [poseSequence]);

  useEffect(() => {
    sequenceStepIndexRef.current = sequenceStepIndex;
  }, [sequenceStepIndex]);

  const stopStream = useCallback(() => {
    streamTokenRef.current += 1;
    setStarting(false);
    const s = streamRef.current;
    if (s) {
      for (const track of s.getTracks()) track.stop();
    }
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, []);

  const startStream = useCallback(async () => {
    const cameraText = cameraTextRef.current;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(cameraText.unsupported);
      return;
    }
    const token = ++streamTokenRef.current;
    setStarting(true);
    setReady(false);
    setPreviewWarm(false);
    setLiveQuality(null);
    setError(null);
    try {
      const cameraWidth = isMobile ? 360 : 720;
      const cameraHeight = isMobile ? 480 : 960;
      const frameRate = { ideal: 60, max: 60 };
      const baseVideoConstraints = {
        width: { ideal: cameraWidth, max: isMobile ? 480 : 960 },
        height: { ideal: cameraHeight, max: isMobile ? 720 : 1280 },
        frameRate,
      };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...baseVideoConstraints,
            facingMode: facing === "environment" ? { exact: facing } : facing,
          },
          audio: false,
        });
      } catch (cameraError) {
        if (
          facing !== "environment" ||
          !(cameraError instanceof Error) ||
          !["OverconstrainedError", "NotFoundError"].includes(cameraError.name)
        ) {
          throw cameraError;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...baseVideoConstraints,
            facingMode: { ideal: facing },
          },
          audio: false,
        });
      }
      if (token !== streamTokenRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
        await waitForFirstCameraFrame(v);
        if (token === streamTokenRef.current) setReady(true);
      }
    } catch (err) {
      const denied = err instanceof Error && err.name === "NotAllowedError";
      const msg = denied
        ? cameraText.denied
        : err instanceof Error
          ? err.message
          : cameraText.failed;
      setError(msg);
      if (denied) onPermissionDenied?.();
    } finally {
      if (token === streamTokenRef.current) setStarting(false);
    }
  }, [facing, isMobile, onPermissionDenied]);

  // Phase 192q — On mobile, defer stream init until the user taps
  // "Start camera". Desktop auto-starts (`started` flipped true below).
  useEffect(() => {
    if (!open) {
      stopStream();
      setReady(false);
      setPreviewWarm(false);
      setStarting(false);
      setError(null);
      setStarted(false);
      setLiveQuality(null);
      setGuide({
        status: "no-face",
        hint_th: "ให้ใบหน้าอยู่ในกรอบก่อน",
        hint_en: "Place your face inside the frame",
        readiness: 0,
      });
      setSequenceStepIndex(0);
      sequenceStepIndexRef.current = 0;
      sequenceFramesRef.current = {};
      return;
    }
    if (!isMobile || autoCapture) setStarted(true);
  }, [autoCapture, open, isMobile, stopStream]);

  useEffect(() => {
    if (!open || !started) return;
    void startStream();
    return () => stopStream();
  }, [open, started, startStream, stopStream]);

  useEffect(() => {
    if (!open || !ready || error || !pageVisible) {
      setPreviewWarm(false);
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const warm = (): void => {
      if (!cancelled) setPreviewWarm(true);
    };
    const idleApi = window as unknown as {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number }
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const warmDelay = isMobile ? 3600 : 1200;
    if (typeof idleApi.requestIdleCallback === "function") {
      idleId = idleApi.requestIdleCallback(warm, { timeout: warmDelay });
    } else {
      timeoutId = window.setTimeout(warm, warmDelay);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null && typeof idleApi.cancelIdleCallback === "function") {
        idleApi.cancelIdleCallback(idleId);
      }
    };
  }, [open, ready, error, isMobile, pageVisible]);

  useEffect(() => {
    if (autoCaptureFocusTimerRef.current !== null) {
      window.clearTimeout(autoCaptureFocusTimerRef.current);
      autoCaptureFocusTimerRef.current = null;
    }
    setAutoCaptureFocusReady(false);
    if (!open || !ready || !autoCapture || error || !pageVisible) return;

    autoCaptureFocusTimerRef.current = window.setTimeout(() => {
      autoCaptureFocusTimerRef.current = null;
      setAutoCaptureFocusReady(true);
    }, AUTO_CAPTURE_FOCUS_DELAY_MS);

    return () => {
      if (autoCaptureFocusTimerRef.current !== null) {
        window.clearTimeout(autoCaptureFocusTimerRef.current);
        autoCaptureFocusTimerRef.current = null;
      }
    };
  }, [autoCapture, error, facing, open, pageVisible, ready]);

  // Phase 192q — Read prefers-reduced-motion once and on change. The
  // overlay ring drops its color-transition easing when
  // this is true. Status color is preserved; only the motion is gated.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent): void =>
      setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = (): void => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  // Phase 34 → 147 → 148 — live quality readout, now stays out of the
  // way when MediaPipe is busy. Both run on the main thread; when
  // detect is mid-flight, doing a parallel pixel readback just steals
  // paint budget from the viewfinder.
  useEffect(() => {
    if (!open || !ready || !previewWarm || error || !pageVisible) return;
    let cancelled = false;
    let idleId: number | null = null;
    let rafId: number | null = null;
    const idleApi = window as unknown as {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number }
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const runQualityCheck = (): void => {
      if (cancelled) return;
      if (document.hidden || detectInflightRef.current) return;
      const v = videoRef.current;
      if (!v) return;
      if (qualityInflightRef.current) return;
      qualityInflightRef.current = true;
      try {
        if (!qualityCanvasRef.current) {
          qualityCanvasRef.current = document.createElement("canvas");
        }
        const q = assessLivePixelQuality(v, {
          canvas: qualityCanvasRef.current,
          sampleSize: isMobile ? 24 : 48,
        });
        setLiveQuality((prev) =>
          prev?.blur === q.blur && prev.lighting === q.lighting
            ? prev
            : { blur: q.blur, lighting: q.lighting }
        );
      } catch {
        // Ignore — readback can fail when the stream pauses
      } finally {
        qualityInflightRef.current = false;
      }
    };
    const id = window.setInterval(() => {
      if (typeof idleApi.requestIdleCallback === "function") {
        idleId = idleApi.requestIdleCallback(runQualityCheck, {
          timeout: isMobile ? 3000 : 800,
        });
      } else {
        rafId = window.requestAnimationFrame(runQualityCheck);
      }
    }, isMobile ? 6500 : 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (idleId !== null && typeof idleApi.cancelIdleCallback === "function") {
        idleApi.cancelIdleCallback(idleId);
      }
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      qualityInflightRef.current = false;
    };
  }, [open, ready, previewWarm, error, isMobile, pageVisible]);

  // Phase 140 — live face-pose guidance. Lazy-loads the face-mesh
  // detector once the camera is up, then runs a downscaled snapshot
  // through it at ~5 Hz. Each result feeds `evaluateFaceGuide` and
  // the resulting hint drives the on-screen coach pill + ring color.
  // Phase 148 — shared ref so the live-quality timer can pause when
  // detect is in flight. Both run on the main thread; coordinating
  // them stops them from stealing each other's paint budget.
  const detectInflightRef = useRef(false);
  // Latest guide-status snapshot the detect loop can read without
  // adding to the effect's dependency array.
  const guideStatusRef = useRef<FaceGuide["status"]>("no-face");

  useEffect(() => {
    guideStatusRef.current = guide.status;
  }, [guide.status]);

  useEffect(() => {
    if (!open || !ready || !previewWarm || error || !pageVisible) return;
    let cancelled = false;
    let timeoutId: number | null = null;

    void (async () => {
      try {
        await waitForIdle(isMobile ? 1800 : 500);
        if (cancelled) return;
        if (!detectorRef.current) {
          detectorRef.current = await FaceMeshDetector.load();
        }
      } catch {
        return;
      }
      if (cancelled) return;

      // Phase 148 — adaptive detect cadence. The old fixed 350ms tick
      // hammered MediaPipe even when the user was already aligned —
      // and each detect (~80-200ms) starved the video element's paint
      // budget, dropping the viewfinder to single-digit fps. Now the
      // cadence scales with guide status:
      // Mobile runs slower because each detect can visibly compete
      // with video paint on low-end devices.
      const GAP_BY_STATUS: Record<FaceGuide["status"], number> = isMobile
        ? {
            "no-face": 2200,
            framing: 3200,
            pose: 4200,
            ready: 9000,
          }
        : {
            "no-face": 800,
            framing: 1100,
            pose: 1500,
            ready: 3000,
          };
      // Phase 148 — snapshot resolution dropped 240 → 160. MediaPipe
      // FaceLandmarker is happy at this size — landmark accuracy at
      // the guide threshold doesn't measurably change, but each
      // drawImage + detect call gets ~40-50% cheaper.
      const MAX_SIDE = isMobile ? 64 : 128;

      function scheduleNext() {
        if (cancelled || document.hidden) return;
        const gap = GAP_BY_STATUS[guideStatusRef.current] ?? 500;
        timeoutId = window.setTimeout(tick, gap);
      }

      function runDetect() {
        if (document.hidden || detectInflightRef.current || cancelled) {
          scheduleNext();
          return;
        }
        const v = videoRef.current;
        const d = detectorRef.current;
        if (
          !v ||
          !d ||
          v.videoWidth === 0 ||
          v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          v.paused
        ) {
          scheduleNext();
          return;
        }
        detectInflightRef.current = true;
        try {
          if (!guideCanvasRef.current) {
            guideCanvasRef.current = document.createElement("canvas");
          }
          const canvas = guideCanvasRef.current;
          const scale = Math.min(
            1,
            MAX_SIDE / Math.max(v.videoWidth, v.videoHeight)
          );
          const tw = Math.max(1, Math.round(v.videoWidth * scale));
          const th = Math.max(1, Math.round(v.videoHeight * scale));
          if (
            guideCanvasSizeRef.current.width !== tw ||
            guideCanvasSizeRef.current.height !== th
          ) {
            canvas.width = tw;
            canvas.height = th;
            guideCanvasSizeRef.current = { width: tw, height: th };
          }
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            detectInflightRef.current = false;
            scheduleNext();
            return;
          }
          ctx.imageSmoothingEnabled = false;
          if (facing === "user") {
            ctx.save();
            ctx.translate(tw, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(v, 0, 0, tw, th);
            ctx.restore();
          } else {
            ctx.drawImage(v, 0, 0, tw, th);
          }
          const result = d.detect(canvas);
          const sequenceTarget =
            poseSequenceRef.current?.[sequenceStepIndexRef.current] ?? "front";
          const next = evaluateFaceGuide(result?.landmarks ?? null, sequenceTarget);
          if (!cancelled) {
            setGuide((prev) =>
              prev.status === next.status && prev.hint_th === next.hint_th
                ? prev
                : next
            );
          }
        } catch {
          /* one bad frame — try again */
        } finally {
          detectInflightRef.current = false;
          scheduleNext();
        }
      }

      function tick() {
        if (cancelled || document.hidden) return;
        const ric = (
          window as unknown as {
            requestIdleCallback?: (
              cb: () => void,
              opts?: { timeout: number }
            ) => number;
          }
        ).requestIdleCallback;
        if (typeof ric === "function") {
          ric(runDetect, { timeout: isMobile ? 1200 : 250 });
        } else {
          window.requestAnimationFrame(runDetect);
        }
      }

      tick();
    })();

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [open, ready, previewWarm, error, facing, isMobile, pageVisible]);

  // Dispose the detector when the dialog closes for good.
  useEffect(() => {
    if (open) return;
    captureBusyRef.current = false;
    setBusy(false);
    const d = detectorRef.current;
    detectorRef.current = null;
    if (d) {
      try {
        d.dispose();
      } catch {
        /* no-op */
      }
    }
    if (guideCanvasRef.current) {
      guideCanvasRef.current.width = 0;
      guideCanvasRef.current.height = 0;
      guideCanvasRef.current = null;
    }
    if (qualityCanvasRef.current) {
      qualityCanvasRef.current.width = 0;
      qualityCanvasRef.current.height = 0;
      qualityCanvasRef.current = null;
    }
    if (captureCanvasRef.current) {
      captureCanvasRef.current.width = 0;
      captureCanvasRef.current.height = 0;
      captureCanvasRef.current = null;
    }
    guideCanvasSizeRef.current = { width: 0, height: 0 };
  }, [open]);

  const captureFrameImage = useCallback(async (): Promise<HTMLImageElement | null> => {
    const v = videoRef.current;
    if (!v || !ready || v.videoWidth === 0 || v.videoHeight === 0) {
      return null;
    }
    await nextAnimationFrame();
    if (v.videoWidth === 0 || v.videoHeight === 0) throw new Error("video");
    const canvas =
      captureCanvasRef.current ?? document.createElement("canvas");
    captureCanvasRef.current = canvas;
    const maxCaptureSide = isMobile ? 720 : 1024;
    const jpegQuality = isMobile ? 0.84 : 0.9;
    const scale = Math.min(
      1,
      maxCaptureSide / Math.max(v.videoWidth, v.videoHeight)
    );
    canvas.width = Math.max(1, Math.round(v.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = isMobile ? "medium" : "high";
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", jpegQuality)
    );
    if (!blob) throw new Error("toBlob");
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = "async";
    return new Promise((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("image"));
      };
      img.src = url;
    });
  }, [facing, isMobile, ready]);

  async function capture() {
    if (sequenceActive) {
      await captureSequenceStep();
      return;
    }
    const v = videoRef.current;
    if (
      !v ||
      !ready ||
      busy ||
      captureBusyRef.current ||
      v.videoWidth === 0 ||
      v.videoHeight === 0
    ) {
      return;
    }
    captureBusyRef.current = true;
    setBusy(true);
    const releaseCapture = () => {
      captureBusyRef.current = false;
      setBusy(false);
    };
    try {
      await nextAnimationFrame();
      if (v.videoWidth === 0 || v.videoHeight === 0) {
        throw new Error("video");
      }
      const canvas =
        captureCanvasRef.current ?? document.createElement("canvas");
      captureCanvasRef.current = canvas;
      const maxCaptureSide = isMobile ? 720 : 1024;
      const jpegQuality = isMobile ? 0.84 : 0.9;
      const scale = Math.min(
        1,
        maxCaptureSide / Math.max(v.videoWidth, v.videoHeight)
      );
      canvas.width = Math.max(1, Math.round(v.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = isMobile ? "medium" : "high";
      // Mirror horizontally for the front camera so the saved image
      // matches what the user saw in the viewfinder.
      if (facing === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/jpeg", jpegQuality)
      );
      if (!blob) throw new Error("toBlob");
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        // Phase 192c — DO NOT revoke on onload. iOS Safari's blob
        // registry honors revoke aggressively → the downstream
        // ScanFlow preview `<img src={previewUrl}>` mounts AFTER this
        // callback and renders a blank because the URL is already
        // gone. Caller's clearPreview() owns the revoke now.
        releaseCapture();
        onCapture(img);
        onClose();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setError(t.camera.failed);
        releaseCapture();
      };
      img.src = url;
    } catch {
      setError(t.camera.failed);
      releaseCapture();
    }
  }

  const captureAutoBatch = useCallback(async () => {
    if (busy || captureBusyRef.current) return;
    captureBusyRef.current = true;
    setBusy(true);
    const images: HTMLImageElement[] = [];
    try {
      const frameCount = Math.max(
        1,
        Math.min(10, Math.round(autoCaptureFrameCount))
      );
      for (let index = 0; index < frameCount; index += 1) {
        const image = await captureFrameImage();
        if (image) images.push(image);
        await waitForMs(autoCaptureIntervalMs);
      }
      if (images.length === 0) throw new Error("empty");
      if (onCaptureBatch) {
        onCaptureBatch(images);
      } else {
        const [first, ...rest] = images;
        for (const image of rest) revokeImageObjectUrl(image);
        onCapture(first!);
      }
      onClose();
    } catch {
      for (const image of images) revokeImageObjectUrl(image);
      setError(t.camera.failed);
    } finally {
      captureBusyRef.current = false;
      setBusy(false);
    }
  }, [
    autoCaptureFrameCount,
    autoCaptureIntervalMs,
    busy,
    captureFrameImage,
    onCapture,
    onCaptureBatch,
    onClose,
    t.camera.failed,
  ]);

  // Phase 620 — guided 4-pose sequence capture. Captures ONE frame for
  // the current target pose (not a batch), stores it, and advances the
  // step. On the last step, hands the full frame set to
  // `onSequenceComplete` and closes — mirrors `captureAutoBatch`'s
  // busy-guard pattern but never calls `onCapture`/`onCaptureBatch`.
  const captureSequenceStep = useCallback(async () => {
    if (busy || captureBusyRef.current) return;
    const targets = poseSequenceRef.current;
    const target = targets?.[sequenceStepIndexRef.current];
    if (!targets || !target) return;
    captureBusyRef.current = true;
    setBusy(true);
    try {
      const image = await captureFrameImage();
      if (!image) throw new Error("empty");
      sequenceFramesRef.current = {
        ...sequenceFramesRef.current,
        [target]: image,
      };
      const nextIndex = sequenceStepIndexRef.current + 1;
      if (nextIndex >= targets.length) {
        const frames = sequenceFramesRef.current;
        sequenceFramesRef.current = {};
        sequenceStepIndexRef.current = 0;
        setSequenceStepIndex(0);
        onSequenceComplete?.(frames);
        onClose();
      } else {
        sequenceStepIndexRef.current = nextIndex;
        setSequenceStepIndex(nextIndex);
      }
    } catch {
      setError(t.camera.failed);
    } finally {
      captureBusyRef.current = false;
      setBusy(false);
    }
  }, [busy, captureFrameImage, onClose, onSequenceComplete, t.camera.failed]);

  const sequenceActive = !!poseSequence && poseSequence.length > 0;
  const sequenceCaptureReady =
    sequenceActive &&
    ready &&
    guide.status === "ready" &&
    (!liveQuality ||
      (liveQuality.blur !== "bad" && liveQuality.lighting !== "bad"));

  useEffect(() => {
    if (
      !open ||
      !sequenceCaptureReady ||
      busy ||
      starting ||
      error ||
      captureBusyRef.current
    ) {
      if (sequenceCaptureTimerRef.current !== null) {
        window.clearTimeout(sequenceCaptureTimerRef.current);
        sequenceCaptureTimerRef.current = null;
      }
      return;
    }
    if (sequenceCaptureTimerRef.current !== null) return;
    sequenceCaptureTimerRef.current = window.setTimeout(() => {
      sequenceCaptureTimerRef.current = null;
      void captureSequenceStep();
    }, 700);
    return () => {
      if (sequenceCaptureTimerRef.current !== null) {
        window.clearTimeout(sequenceCaptureTimerRef.current);
        sequenceCaptureTimerRef.current = null;
      }
    };
  }, [busy, captureSequenceStep, error, open, sequenceCaptureReady, starting]);

  const autoCaptureReady =
    autoCapture &&
    ready &&
    autoCaptureFocusReady &&
    guide.status === "ready" &&
    (!liveQuality ||
      (liveQuality.blur !== "bad" && liveQuality.lighting !== "bad"));
  const autoCaptureFocusPending =
    autoCapture &&
    ready &&
    !autoCaptureFocusReady &&
    guide.status === "ready" &&
    (!liveQuality ||
      (liveQuality.blur !== "bad" && liveQuality.lighting !== "bad"));

  const switchCamera = useCallback(() => {
    if (!ready || busy || starting || error) return;
    stopStream();
    setReady(false);
    setPreviewWarm(false);
    setLiveQuality(null);
    setFacing((current) =>
      current === "user" ? "environment" : "user"
    );
  }, [busy, error, ready, starting, stopStream]);

  useEffect(() => {
    if (
      !open ||
      !autoCaptureReady ||
      busy ||
      starting ||
      error ||
      captureBusyRef.current
    ) {
      if (autoCaptureTimerRef.current !== null) {
        window.clearTimeout(autoCaptureTimerRef.current);
        autoCaptureTimerRef.current = null;
      }
      return;
    }
    if (autoCaptureTimerRef.current !== null) return;
    autoCaptureTimerRef.current = window.setTimeout(() => {
      autoCaptureTimerRef.current = null;
      void captureAutoBatch();
    }, 2000);
    return () => {
      if (autoCaptureTimerRef.current !== null) {
        window.clearTimeout(autoCaptureTimerRef.current);
        autoCaptureTimerRef.current = null;
      }
    };
  }, [autoCaptureReady, busy, captureAutoBatch, error, open, starting]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="doodee-camera-dialog theme-locked-dark !fixed !bottom-auto !left-1/2 !top-1/2 !flex w-[calc(100vw-1rem)] max-w-lg !-translate-x-1/2 !-translate-y-1/2 flex-col gap-0 !overflow-hidden !rounded-[1.75rem] !border-[#263149] !bg-[#050816] p-0 !text-white !shadow-[0_34px_92px_rgba(0,0,0,0.84)] sm:w-[calc(100vw-2rem)]"
        style={{
          maxHeight:
            "calc(100svh - max(env(safe-area-inset-top), 0.25rem) - max(env(safe-area-inset-bottom), 0.25rem) - 0.5rem)",
        }}
      >
        <div className="shrink-0 border-b border-white/10 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <div className="flex items-start justify-between gap-3 pr-11">
            <div className="min-w-0">
              <DialogTitle className="text-2xl text-white">{t.camera.title}</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-white/55">
                {t.camera.subtitle}
              </DialogDescription>
            </div>
            <ThemeToggle />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
        <div className="relative mx-auto h-[clamp(260px,44svh,430px)] w-full max-w-[390px] flex-none overflow-hidden rounded-[1.25rem] bg-[#18120d] sm:h-[clamp(320px,52dvh,520px)]">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <Camera className="h-8 w-8 text-warn" />
              <p className="text-sm text-warn">{error}</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-contain"
              style={{
                transform: facing === "user" ? "scaleX(-1)" : undefined,
              }}
            />
          )}

          {open && !started && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <Camera className="h-8 w-8 text-white" />
              <button
                type="button"
                onClick={() => setStarted(true)}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#06b6d4]/30 bg-[#052b36] px-5 text-sm font-semibold text-white shadow-[0_16px_34px_-24px_rgba(6,182,212,0.55)] transition hover:bg-[#063544] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06b6d4]/45"
              >
                <Camera className="h-4 w-4" />
                {lang === "th" ? "เริ่มกล้อง" : "Start camera"}
              </button>
            </div>
          )}

          {open && started && starting && !error && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#241f1a]/80 p-6 text-center"
            >
              <Loader2 className="h-8 w-8 animate-spin text-white" />
              <p className="text-sm font-semibold text-white">
                {lang === "th" ? "กำลังขอสิทธิ์ใช้กล้อง..." : "Requesting camera access..."}
              </p>
            </div>
          )}

          {ready && !error && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
            >
              <div
                className={`absolute inset-3 rounded-[1.25rem] border-2 ${reducedMotion ? "" : "transition-colors duration-200"} ${ringClass(guide.status, reducedMotion)}`}
              />
            </div>
          )}

          {ready && !error && sequenceActive && (
            <SequenceStepTracker
              targets={poseSequence!}
              currentIndex={sequenceStepIndex}
            />
          )}

          {ready && !error && liveQuality && (
            <LiveQualityPill quality={liveQuality} />
          )}

          {ready && !error && (
            <FaceGuidePill guide={guide} lang={lang} />
          )}

          {busy && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#241f1a]/70 p-6 text-center"
            >
              <Loader2 className="h-8 w-8 animate-spin text-white" />
              <p className="text-sm font-semibold text-white">
                {lang === "th" ? "กำลังตรวจรูป..." : "Checking photo..."}
              </p>
            </div>
          )}
        </div>

        {ready && !error && (
          <div className="shrink-0">
            <CameraReadinessChecklist
              guide={guide}
              liveQuality={liveQuality}
              autoCaptureReady={autoCaptureReady}
              autoCaptureFocusPending={autoCaptureFocusPending}
              lang={lang}
            />
          </div>
        )}
        </div>

        <div
          className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#050816] px-4 pt-3 shadow-[0_-18px_42px_-34px_rgba(6,182,212,0.55)]"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#263149] bg-[#0b1020] px-4 py-2 text-sm font-semibold text-white/78 transition hover:border-[#06b6d4]/40 hover:bg-[#11182b] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/35"
          >
            <X className="h-3.5 w-3.5" />
            {t.camera.cancel}
          </button>
          <button
            type="button"
            onClick={switchCamera}
            disabled={!ready || busy || starting || error !== null}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#263149] bg-[#0b1020] px-4 py-2 text-sm font-semibold text-white/78 transition hover:border-[#06b6d4]/40 hover:bg-[#11182b] hover:text-white disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/35"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t.camera.flip}
          </button>
          <button
            type="button"
            onClick={capture}
            disabled={!ready || busy || starting || error !== null}
            className={`inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6f7f]/35 ${
              guide.status === "ready"
                ? "bg-[#052b36] text-[#67e8f9] shadow-[0_16px_34px_-24px_rgba(6,182,212,0.55)] hover:bg-[#063544]"
                : "bg-white text-[#050816] shadow-[0_16px_34px_-24px_rgba(255,255,255,0.35)] hover:bg-white/90"
            }`}
          >
            <Camera className="h-4 w-4" />
            {busy ? "…" : t.camera.capture}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function waitForIdle(timeout: number): Promise<void> {
  const idleApi = window as unknown as {
    requestIdleCallback?: (
      cb: () => void,
      opts?: { timeout: number }
    ) => number;
  };
  const requestIdle = idleApi.requestIdleCallback;
  if (typeof requestIdle === "function") {
    return new Promise((resolve) =>
      requestIdle(() => resolve(), { timeout })
    );
  }
  return new Promise((resolve) =>
    window.setTimeout(resolve, Math.min(timeout, 500))
  );
}

function waitForFirstCameraFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let done = false;
    let timeoutId: number | null = null;
    const finish = (): void => {
      if (done) return;
      done = true;
      video.removeEventListener("loadeddata", finish);
      video.removeEventListener("canplay", finish);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      resolve();
    };
    const frameApi = video as unknown as {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };

    if (typeof frameApi.requestVideoFrameCallback === "function") {
      frameApi.requestVideoFrameCallback(finish);
    }
    video.addEventListener("loadeddata", finish, { once: true });
    video.addEventListener("canplay", finish, { once: true });
    timeoutId = window.setTimeout(finish, 650);
  });
}

function worstOf(...severities: QualitySeverity[]): QualitySeverity {
  if (severities.includes("bad")) return "bad";
  if (severities.includes("warn")) return "warn";
  return "ok";
}

function ringClass(status: FaceGuide["status"], reducedMotion: boolean): string {
  if (status === "ready") {
    return reducedMotion
      ? "border-good"
      : "border-good";
  }
  if (status === "pose") {
    return reducedMotion
      ? "border-yellow-300/80"
      : "border-yellow-300/80";
  }
  if (status === "framing") {
    return reducedMotion
      ? "border-warn/85"
      : "border-warn/85";
  }
  return reducedMotion
    ? "border-white/35"
    : "border-white/55";
}

function FaceGuidePill({
  guide,
  lang,
}: {
  guide: FaceGuide;
  lang: "th" | "en";
}) {
  const text = lang === "th" ? guide.hint_th : guide.hint_en;
  const tone =
    guide.status === "ready"
      ? "border-[#06b6d4]/30 bg-[#052b36] text-[#67e8f9]"
      : guide.status === "pose"
        ? "border-[#f59e0b]/30 bg-[#2a1806] text-[#fde68a]"
        : guide.status === "framing"
          ? "border-[#f59e0b]/30 bg-[#2a1806] text-[#fde68a]"
          : "border-[#263149] bg-[#0b1020] text-white/72";
  return (
    <div
      className={`pointer-events-none absolute left-1/2 bottom-3 -translate-x-1/2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] max-w-[88%] ${tone}`}
    >
      {guide.status === "ready" ? (
        <Check className="h-3 w-3" />
      ) : (
        <span
          aria-hidden
          className={`block h-1.5 w-1.5 rounded-full ${
            guide.status === "no-face"
              ? "bg-white/45"
              : guide.status === "framing"
                ? "bg-warn"
                : "bg-yellow-300"
          }`}
        />
      )}
      <span className="text-center leading-snug">{text}</span>
    </div>
  );
}

function SequenceStepTracker({
  targets,
  currentIndex,
}: {
  targets: PoseTarget[];
  currentIndex: number;
}) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-[#263149] bg-[#0b1020]/90 px-2.5 py-1.5">
      {targets.map((target, i) => (
        <span
          key={target}
          aria-hidden
          className={`block h-2 w-2 rounded-full transition-colors ${
            i < currentIndex
              ? "bg-[#06b6d4]"
              : i === currentIndex
                ? "bg-white"
                : "bg-white/25"
          }`}
        />
      ))}
    </div>
  );
}

function LiveQualityPill({
  quality,
}: {
  quality: { blur: QualitySeverity; lighting: QualitySeverity };
}) {
  const { t } = useT();
  const overall = worstOf(quality.blur, quality.lighting);
  const dotTone =
    overall === "bad"
      ? "bg-warn"
      : overall === "warn"
        ? "bg-yellow-400"
        : "bg-good";
  const label =
    overall === "bad"
      ? t.camera.qualityBad
      : overall === "warn"
        ? t.camera.qualityWarn
        : t.camera.qualityOk;
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#263149] bg-[#0b1020] px-3 py-1 text-[11px] font-medium text-white/72 shadow-[0_12px_28px_-22px_rgba(0,0,0,0.72)]">
      <span aria-hidden className={`block h-2 w-2 rounded-full ${dotTone}`} />
      <span>{label}</span>
    </div>
  );
}

function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function revokeImageObjectUrl(image: HTMLImageElement): void {
  if (!image.src.startsWith("blob:")) return;
  try {
    URL.revokeObjectURL(image.src);
  } catch {}
}

function CameraReadinessChecklist({
  guide,
  liveQuality,
  autoCaptureReady,
  autoCaptureFocusPending,
  lang,
}: {
  guide: FaceGuide;
  liveQuality: LiveQuality | null;
  autoCaptureReady: boolean;
  autoCaptureFocusPending: boolean;
  lang: "th" | "en";
}) {
  const items = [
    {
      label: lang === "th" ? "มองตรง" : "Look straight",
      ok: guide.status === "ready",
    },
    {
      label: lang === "th" ? "แสงพอ" : "Enough light",
      ok: !liveQuality || liveQuality.lighting !== "bad",
    },
    {
      label: lang === "th" ? "หน้าอยู่ในกรอบ" : "Face in frame",
      ok: guide.status === "pose" || guide.status === "ready",
    },
    {
      label: lang === "th" ? "ไม่เบลอ" : "Not blurry",
      ok: !liveQuality || liveQuality.blur !== "bad",
    },
  ];
  return (
    <div className="space-y-2.5 border-t border-white/10 px-4 py-2.5 sm:px-5 sm:py-3">
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className={`flex min-h-8 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${
              item.ok
                ? "border-[#06b6d4]/25 bg-[#052b36] text-[#67e8f9]"
                : "border-[#263149] bg-[#0b1020] text-white/58"
            }`}
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full ${
                item.ok ? "bg-[#06b6d4] text-white" : "bg-white/10 text-transparent"
              }`}
            >
              <Check className="h-3 w-3" />
            </span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      <p className="text-center text-xs font-medium text-white/58">
        {autoCaptureReady
          ? lang === "th"
            ? "นิ่งไว้ ระบบกำลังเลือกภาพที่ดีที่สุด"
            : "Hold still. DOODEE is selecting the best frame."
          : autoCaptureFocusPending
            ? lang === "th"
              ? "รอให้กล้องโฟกัสภาพให้คมก่อน"
              : "Let the camera focus before capture."
          : lang === "th"
            ? "จัดหน้าให้อยู่ในกรอบ ระบบจะถ่ายให้อัตโนมัติเมื่อพร้อม"
            : "Align your face. The system will capture automatically when ready."}
      </p>
    </div>
  );
}
