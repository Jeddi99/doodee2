import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, RotateCcw, ShieldCheck, X } from "lucide-react";
import Brand from "../Brand";
import { uploadScan } from "../lib/api";
import { ANALYSIS_CONSENT_VERSION } from "./OnboardingPage";
import { errorMessage } from "../lib/apiError";
import { readOnboardingAnswers } from "../lib/onboardingAnswers";
import { cropToJpeg, dataUrlToFile } from "../lib/captureImage";
import { measureLighting, type SkinLighting, type SkinLightingSample } from "../lib/skinCapture";
import {
  captureSteps,
  getAutoFrame,
  getFaceBox,
  measurePose,
  smoothAutoFrame,
  type AutoFrame,
  type FaceBox,
  type FaceObservation,
  type FrameQuality,
  type LandmarkPoint,
  type Quality,
} from "../scanQuality";
import { useLocale } from "../useLocale";

/**
 * One close, evenly-lit front photograph, captured to be measured for skin.
 *
 * ## Why this is a page rather than a mode of `ScanPage`
 *
 * `ScanPage` is a three-slot state machine — a stepper, per-slot upload provenance, an
 * attestation, a review grid — and it works. Every branch it would grow for "one slot, no
 * stepper, an extra gate" is a new way to break the flow every other feature in the product
 * depends on, for a screen whose failure modes barely overlap with it. The machinery worth
 * sharing is shared by import: the same worker, the same `measurePose`, the same
 * `getAutoFrame`, the same `cropToJpeg`, the same upload call.
 *
 * ## What is different, and it is only two things
 *
 * **Framing.** `captureSteps` all set `close: false`, so `getAutoFrame` targets a face at 0.6 of
 * the frame. Skin measurement wants the pixels: this page passes `close: true`, the 0.82 target
 * that has been sitting unused in `scanQuality.ts` since it was written. That is roughly 1.9x
 * the face area at the same submitted resolution, which is why the submitted resolution does not
 * need to change — `skin_engine`'s texture band-pass is a fraction of face width, not a pixel
 * count, so framing nearer buys what a bigger JPEG would not.
 *
 * **Light.** The reason the page exists. `skin_engine` refuses a photograph whose cheeks differ
 * by more than 1.55 in lightness, and the studio reference shot in this repository measures 1.58
 * — ordinary window light puts a real person over the line. Until now they found that out after
 * uploading, from a screen showing advisories where numbers should be. Here the same three
 * questions are asked of the preview and answered while the user can still move.
 *
 * There is no "submit anyway". An escape hatch would put the user back exactly where they were —
 * upload, wait, read an advisory — having been warned twice on the way. The three-angle flow has
 * never offered one past `too_dark` either; this is the same rule with more things in it.
 */

const COPY = {
  th: {
    title: "สแกนผิว",
    lead: "ถ่ายหน้าตรงในระยะใกล้ ให้แสงเข้าเท่ากันทั้งสองข้าง",
    onDevice: "ประมวลผลบนเครื่องคุณ",
    loading: "กำลังเปิดกล้อง…",
    exit: "ออก",
    ready: "แสงและมุมใช้ได้ กำลังเก็บภาพ…",
    holdStill: "อยู่นิ่ง ๆ",
    reviewTitle: "ตรวจภาพก่อนส่ง",
    reviewBody: "ถ้าผมบังหน้าผาก หรือแว่นสะท้อนแสงเข้าตา ให้ถ่ายใหม่ — สองอย่างนี้ตัวตรวจในกล้องมองไม่เห็น",
    retake: "ถ่ายใหม่",
    submit: "ส่งวิเคราะห์ผิว",
    uploading: "กำลังส่ง…",
    cameraTitle: "เปิดกล้องไม่ได้",
    cameraBody: "อนุญาตให้เว็บใช้กล้องแล้วลองใหม่",
    uploadFailed: "ส่งไม่สำเร็จ",
    retry: "ลองใหม่",
    lighting: "สภาพแสง",
    shadow: "ความต่างสองแก้ม",
    cast: "สีของแสง",
    clipped: "ส่วนที่สว่างจนหาย",
  },
  en: {
    title: "Skin scan",
    lead: "A close, front-facing photo with the light even on both sides of your face",
    onDevice: "Processed on your device",
    loading: "Starting the camera…",
    exit: "Exit",
    ready: "Light and angle are good — capturing…",
    holdStill: "Hold still",
    reviewTitle: "Check the photo before sending",
    reviewBody: "Retake if hair covers your forehead or glasses catch the light across an eye — the live check cannot see either.",
    retake: "Retake",
    submit: "Analyse my skin",
    uploading: "Sending…",
    cameraTitle: "The camera could not start",
    cameraBody: "Allow camera access and try again.",
    uploadFailed: "Upload failed",
    retry: "Try again",
    lighting: "Lighting",
    shadow: "Cheek difference",
    cast: "Colour of light",
    clipped: "Blown out",
  },
} as const;

/** The single slot, shaped like a `captureSteps` entry so the shared gate works unchanged. */
const SKIN_STEP = { ...captureSteps[0], close: true } as const;

/** Consecutive good frames before the shutter, the same idea as the three-angle flow's burst. */
const STEADY_FRAMES = 4;
const DETECT_INTERVAL_MS = 180;

type Phase = "loading" | "scanning" | "review" | "uploading" | "error";

type WorkerOutput =
  | { type: "ready" }
  | { type: "error"; message: string }
  | {
      type: "result";
      landmarks: LandmarkPoint[] | null;
      timestamp: number;
      frameQuality?: FrameQuality;
      observation?: FaceObservation;
      lighting?: SkinLightingSample | null;
    };

export default function SkinScanPage() {
  const navigate = useNavigate();
  const { locale, copy: siteCopy } = useLocale();
  const copy = COPY[locale === "en" ? "en" : "th"];
  const quality = siteCopy.scan.quality.live;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const busyRef = useRef(false);
  const lastDetectionRef = useRef(0);
  const faceBoxRef = useRef<FaceBox | null>(null);
  const autoFrameRef = useRef<AutoFrame>({ centerX: 0.5, centerY: 0.5, zoom: 1.45 });
  const steadyRef = useRef(0);
  const lockedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("loading");
  const [gate, setGate] = useState<Quality>({ valid: false, code: "starting", score: 0 });
  const [lighting, setLighting] = useState<SkinLighting | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  /**
   * Decide on one detection.
   *
   * Pose first, then light. Both have to hold for `STEADY_FRAMES` in a row, so a reading that
   * flickers as the user moves does not fire the shutter on the one frame that happened to pass.
   */
  const onDetection = useCallback((
    landmarks: LandmarkPoint[] | null,
    frameQuality?: FrameQuality,
    observation?: FaceObservation,
    sample?: SkinLightingSample | null,
  ) => {
    if (lockedRef.current) return;
    const box = landmarks ? getFaceBox(landmarks) : null;
    faceBoxRef.current = box;
    if (landmarks) {
      const target = getAutoFrame(landmarks, SKIN_STEP.close);
      autoFrameRef.current = smoothAutoFrame(autoFrameRef.current, target);
      const { centerX, centerY, zoom } = autoFrameRef.current;
      viewportRef.current?.style.setProperty("--capture-zoom", String(zoom));
      viewportRef.current?.style.setProperty("--capture-pan-x", `${(0.5 - centerX) * 100}%`);
      viewportRef.current?.style.setProperty("--capture-pan-y", `${(0.5 - centerY) * 100}%`);
    }

    const pose = landmarks
      // Step 0 is `front`, which is exactly what this page captures — the gate is the same
      // one the three-angle flow runs, unchanged.
      ? measurePose(landmarks, 0, frameQuality, 1, observation)
      : ({ valid: false, code: "no_face", score: 0 } as Quality);

    const reading = sample ? measureLighting(sample) : null;
    setLighting(reading);

    // Pose reported first: "one side of your face is darker" about a frame with no face in it
    // would be describing a wall.
    if (!pose.valid) {
      steadyRef.current = 0;
      setGate(pose);
      return;
    }
    if (reading?.code) {
      steadyRef.current = 0;
      setGate({ valid: false, code: reading.code, score: pose.score });
      return;
    }

    steadyRef.current += 1;
    setGate({ valid: true, code: steadyRef.current >= STEADY_FRAMES ? "good" : "hold_still", score: pose.score });
    if (steadyRef.current < STEADY_FRAMES) return;

    const video = videoRef.current;
    if (!video?.videoWidth) return;
    lockedRef.current = true;
    runningRef.current = false;
    setFrame(cropToJpeg(video, video.videoWidth, video.videoHeight, faceBoxRef.current));
    setPhase("review");
    stopCamera();
  }, [stopCamera]);

  const detectionLoop = useCallback(() => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const now = performance.now();
    if (video?.videoWidth && !busyRef.current && now - lastDetectionRef.current >= DETECT_INTERVAL_MS) {
      lastDetectionRef.current = now;
      busyRef.current = true;
      createImageBitmap(video)
        .then((bitmap) => {
          // `lighting: true` is what turns the cheek sampling on in the worker. The three-angle
          // flow leaves it off, so it pays nothing for a check it does not need.
          workerRef.current?.postMessage({ type: "frame", bitmap, timestamp: now, lighting: true }, [bitmap]);
        })
        .catch(() => { busyRef.current = false; });
    }
    rafRef.current = requestAnimationFrame(detectionLoop);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setPhase("loading");
    setError("");
    setFrame(null);
    setLighting(null);
    steadyRef.current = 0;
    lockedRef.current = false;
    setGate({ valid: false, code: "starting", score: 0 });
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "user" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      });
      streamRef.current = stream;
      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      if (!workerRef.current) {
        const worker = new Worker(new URL("../faceLandmarker.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = ({ data }: MessageEvent<WorkerOutput>) => {
          if (data.type !== "result") return;
          busyRef.current = false;
          onDetection(data.landmarks, data.frameQuality, data.observation, data.lighting);
        };
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error("worker-timeout")), 12000);
          const settle = ({ data }: MessageEvent<WorkerOutput>) => {
            if (data.type !== "ready" && data.type !== "error") return;
            window.clearTimeout(timeout);
            worker.removeEventListener("message", settle);
            if (data.type === "ready") resolve();
            else reject(new Error(data.message));
          };
          worker.addEventListener("message", settle);
          worker.postMessage({ type: "init" });
        });
        workerRef.current = worker;
      }

      setPhase("scanning");
      runningRef.current = true;
      rafRef.current = requestAnimationFrame(detectionLoop);
    } catch {
      stopCamera();
      setError("");
      setPhase("error");
    }
  }, [detectionLoop, onDetection, stopCamera]);

  const submit = useCallback(async () => {
    if (!frame) return;
    setPhase("uploading");
    setError("");
    const answers = readOnboardingAnswers();
    try {
      const queued = await uploadScan(
        { front: await dataUrlToFile(frame, "front") },
        {
          ageBand: answers?.ageBand || "adult",
          referenceAgeBand: answers?.referenceAgeBand || "18_35",
          referenceProfile: answers?.referenceProfile || "neutral",
          referencePopulation: answers?.referencePopulation || "TH",
          consentVersion: answers?.consentVersion || ANALYSIS_CONSENT_VERSION,
          scanMode: "skin",
          captureMethod: "web_camera",
          uploadAttestationVersion: "",
        },
      );
      navigate(`/skin?scan_id=${encodeURIComponent(queued.id)}`);
    } catch (uploadError) {
      setError(errorMessage(uploadError) || (uploadError as Error)?.message || "");
      setPhase("error");
    }
  }, [frame, navigate]);

  useEffect(() => {
    void startCamera();
    return () => {
      stopCamera();
      workerRef.current?.terminate();
      workerRef.current = null;
    };
    // Once, on mount. `startCamera` is stable enough that re-running it here would restart the
    // camera on every render that changed a callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="capture-page">
      <header className="capture-header">
        <Brand />
        <div className="capture-header__state">
          <span>{copy.title}</span><i />
          {copy.lead}
        </div>
        <a className="capture-close" href="/skin" aria-label={copy.exit}><X size={20} /></a>
      </header>

      <section className="capture-layout">
        <div ref={viewportRef} className="capture-viewport is-close-capture">
          {frame ? (
            <img src={frame} alt={copy.reviewTitle} />
          ) : (
            <video ref={videoRef} autoPlay muted playsInline aria-label={copy.title} />
          )}
          <div className={`capture-face-guide ${gate.valid ? "is-ready" : ""}`} aria-hidden="true" />
          <div className="capture-viewport__meta">
            <span><ShieldCheck size={15} /> {copy.onDevice}</span>
          </div>
          {phase === "loading" && (
            <div className="capture-loading" role="status"><span />{copy.loading}</div>
          )}
        </div>

        <aside className="capture-panel">
          {phase === "error" ? (
            <div className="capture-error" role="alert">
              <h1>{error ? copy.uploadFailed : copy.cameraTitle}</h1>
              <p>{error || copy.cameraBody}</p>
              <button type="button" onClick={() => void startCamera()}>
                <RotateCcw size={17} /> {copy.retry}
              </button>
            </div>
          ) : phase === "review" || phase === "uploading" ? (
            <div className="capture-review">
              <h1>{copy.reviewTitle}</h1>
              <p>{copy.reviewBody}</p>
              <div className="capture-review__actions">
                <button type="button" onClick={() => void startCamera()} disabled={phase === "uploading"}>
                  <RotateCcw size={16} /> {copy.retake}
                </button>
                <button type="button" onClick={() => void submit()} disabled={phase === "uploading"}>
                  <Check size={16} /> {phase === "uploading" ? copy.uploading : copy.submit}
                </button>
              </div>
            </div>
          ) : (
            <div className="capture-guidance">
              <h1>{copy.title}</h1>
              <p role="status">{gate.code === "good" ? copy.ready : quality[gate.code] ?? copy.holdStill}</p>
              {lighting && (
                <dl className="skin-capture-readout">
                  <div>
                    <dt>{copy.shadow}</dt>
                    <dd>{lighting.shadowRatio.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>{copy.cast}</dt>
                    <dd>{lighting.colourCast.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>{copy.clipped}</dt>
                    <dd>{(lighting.clippedFraction * 100).toFixed(0)}%</dd>
                  </div>
                </dl>
              )}
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
