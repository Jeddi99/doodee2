import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImageUp, RotateCcw, ShieldCheck, Volume2, VolumeX, X } from "lucide-react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useNavigate } from "react-router-dom";
import Brand from "../Brand";
import { uploadScan } from "../lib/api";
import { errorMessage } from "../lib/apiError";
import { readOnboardingAnswers } from "../lib/onboardingAnswers";
import { useLocale } from "../useLocale";
import { createCaptureVoice, silentVoice, type CaptureVoice } from "../lib/captureVoice";
import {
  bitmapFromDataUrl, classifyDecodeFailure, cropToJpeg, dataUrlToFile, decodeOriented, fitBitmap,
  isSideways, MAX_DETECT_EDGE, MAX_SUBMIT_EDGE,
} from "../lib/captureImage";
import { prepareUpload, type StillReading } from "../lib/uploadSlot";
import { ANALYSIS_CONSENT_VERSION } from "./OnboardingPage";
import {
  candidateScore,
  captureSteps,
  findMatchingCaptureStep,
  getAutoFrame,
  getFaceBox,
  getPoseSignature,
  getNextCaptureStep,
  isPoseWindowStable,
  measurePose,
  smoothAutoFrame,
  type FrameQuality,
  type FaceBox,
  type FaceObservation,
  type FacePose,
  type PoseSignature,
  type Quality,
  type QualityCode,
} from "../scanQuality";

/**
 * captureSteps is front + left_profile + right_profile, which is exactly the `standard` mode in
 * backend/doodee/analysis_engine.py. `full` additionally uploads front_smile, the obliques and
 * basal, but analyze_images() only ever reads front and the two profiles — so standard costs
 * nothing in measurements and saves four uploads.
 */
const SCAN_MODE = "standard";

/**
 * The wording of the "these photos are of me" confirmation the user agreed to.
 *
 * Its own version, separate from the analysis consent, because it is a different promise about a
 * different thing: analysis consent covers being measured, this covers whose face was submitted.
 * Bumping it makes previously-given confirmations stale, which is the point of recording it.
 */
export const UPLOAD_ATTESTATION_VERSION = "2026.1";

/** Where a filled slot's photograph came from. Drives `capture_method` and the review step. */
type CaptureSource = "camera" | "upload";

type Phase = "loading" | "scanning" | "review" | "complete" | "error";
type WorkerOutput =
  | { type: "ready" }
  | { type: "result"; landmarks: NormalizedLandmark[] | null; timestamp: number; frameQuality?: FrameQuality; observation?: FaceObservation }
  | { type: "stillResult"; requestId: number; landmarks: NormalizedLandmark[] | null; frameQuality?: FrameQuality; observation?: FaceObservation }
  | { type: "error"; message: string };

const emptyCaptures = () => captureSteps.map(() => null as string | null);
const emptySources = () => captureSteps.map(() => null as CaptureSource | null);
type Candidate = { score: number };
const emptyCandidates = () => captureSteps.map(() => null as Candidate | null);
const emptyCandidateCounts = () => captureSteps.map(() => 0);

function referencePosition(index: number) {
  return ["100% 0%", "0% 0%", "50% 100%"][index];
}

export default function ScanPage() {
  const navigate = useNavigate();
  const { copy, locale } = useLocale();
  const [uploadError, setUploadError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerBusyRef = useRef(false);
  const rafRef = useRef(0);
  const videoFrameCallbackRef = useRef(0);
  const fpsSampleRef = useRef({ startedAt: 0, frames: 0 });
  const lowFpsSamplesRef = useRef(0);
  const performanceFallbackAppliedRef = useRef(false);
  const navigationTimerRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const runningRef = useRef(false);
  const activeStepRef = useRef(0);
  const captureLockedRef = useRef(false);
  const lastVideoTimeRef = useRef(-1);
  const lastDetectionRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const poseWindowRef = useRef<PoseSignature[]>([]);
  const capturesRef = useRef<(string | null)[]>(emptyCaptures());
  const bestCandidatesRef = useRef<(Candidate | null)[]>(emptyCandidates());
  const candidateCountsRef = useRef<number[]>(emptyCandidateCounts());
  const lastCandidateAtRef = useRef<number[]>(emptyCandidateCounts());
  const lastFaceBoxRef = useRef<FaceBox | null>(null);
  const autoFrameRef = useRef({ centerX: 0.5, centerY: 0.5, zoom: 1.18 });
  const [phase, setPhase] = useState<Phase>("loading");
  const [activeStep, setActiveStep] = useState(0);
  const [quality, setQuality] = useState<Quality>({ valid: false, code: "finding_face", score: 0 });
  const [holdProgress, setHoldProgress] = useState(0);
  // Spoken guidance is on by default: the profile steps are the reason it exists, and a user who
  // needs it most is the one least able to discover a toggle while their head is turned away.
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const voiceRef = useRef<CaptureVoice>(silentVoice);
  // Tracks the invalid -> valid edge, so the "in the window" tone fires once per hold rather than
  // on every frame of it.
  const poseWasValidRef = useRef(false);
  const voiceLangRef = useRef("th-TH");
  const [captures, setCaptures] = useState<(string | null)[]>(emptyCaptures);
  const [sources, setSources] = useState<(CaptureSource | null)[]>(emptySources);
  // Mirrored in a ref for the same reason `capturesRef` is: `processLandmarks` and the capture
  // callbacks run outside React's render cycle and would otherwise read a stale array.
  const sourcesRef = useRef<(CaptureSource | null)[]>(emptySources());
  const [uploadStatus, setUploadStatus] = useState<{ step: number; code: QualityCode | null } | null>(null);
  const [uploadNotice, setUploadNotice] = useState("");
  const [attested, setAttested] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadStepRef = useRef(0);
  // Several slots can be in flight at once, so answers are matched back by id rather than assumed
  // to arrive in the order they were asked for.
  const stillWaitersRef = useRef(new Map<number, (reading: StillReading) => void>());
  const stillRequestRef = useRef(0);
  const [cameraFps, setCameraFps] = useState(0);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    voiceRef.current.close();
    voiceRef.current = silentVoice;
    runIdRef.current += 1;
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    if (videoRef.current && videoFrameCallbackRef.current && "cancelVideoFrameCallback" in videoRef.current) {
      videoRef.current.cancelVideoFrameCallback(videoFrameCallbackRef.current);
    }
    videoFrameCallbackRef.current = 0;
    workerBusyRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  /**
   * Tear the worker down. Separate from `stopCamera` on purpose.
   *
   * The worker used to be created inside `startCamera` and terminated by `stopCamera`, which left
   * no landmarker at all in precisely the situations the upload path exists for: camera permission
   * refused, no camera fitted, or capture already finished. Nothing about the worker needs a video
   * stream, so its lifetime is the page's, not the camera's.
   */
  const disposeWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    workerBusyRef.current = false;
    // Anything still waiting gets a "no face" rather than a promise that never settles.
    stillWaitersRef.current.forEach((resolve) => resolve({ landmarks: null }));
    stillWaitersRef.current.clear();
  }, []);

  const startFpsMeter = useCallback(() => {
    const video = videoRef.current;
    if (!video || !("requestVideoFrameCallback" in video)) return;
    fpsSampleRef.current = { startedAt: performance.now(), frames: 0 };
    const countFrame: VideoFrameRequestCallback = (now) => {
      if (!streamRef.current || !videoRef.current) return;
      const sample = fpsSampleRef.current;
      sample.frames += 1;
      const elapsed = now - sample.startedAt;
      if (elapsed >= 1000) {
        const fps = Math.round(sample.frames * 1000 / elapsed);
        setCameraFps(fps);
        lowFpsSamplesRef.current = fps > 0 && fps < 18 ? lowFpsSamplesRef.current + 1 : 0;
        if (lowFpsSamplesRef.current >= 2 && !performanceFallbackAppliedRef.current) {
          performanceFallbackAppliedRef.current = true;
          const track = streamRef.current?.getVideoTracks()[0];
          void track?.applyConstraints({
            width: { ideal: 1280 },
            height: { ideal: 960 },
            frameRate: { ideal: 30 },
          }).catch(() => undefined);
        }
        fpsSampleRef.current = { startedAt: now, frames: 0 };
      }
      videoFrameCallbackRef.current = videoRef.current.requestVideoFrameCallback(countFrame);
    };
    videoFrameCallbackRef.current = video.requestVideoFrameCallback(countFrame);
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return "";
    return cropToJpeg(video, video.videoWidth, video.videoHeight, lastFaceBoxRef.current);
  }, []);

  const updateAutoFrame = useCallback((landmarks: NormalizedLandmark[], close: boolean) => {
    const target = getAutoFrame(landmarks, close);
    const next = smoothAutoFrame(autoFrameRef.current, target);
    autoFrameRef.current = next;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.style.setProperty("--capture-zoom", next.zoom.toFixed(3));
    viewport.style.setProperty("--capture-pan-x", `${((next.centerX - 0.5) * next.zoom * 100).toFixed(2)}%`);
    viewport.style.setProperty("--capture-pan-y", `${((0.5 - next.centerY) * next.zoom * 100).toFixed(2)}%`);
  }, []);

  /**
   * qijek stashed the front frame in sessionStorage and called it done. Here the three angles
   * go to POST /scans/, which queues the Celery analysis; /analysis then polls its status.
   */
  const submitScan = useCallback(async (
    frames: (string | null)[],
    frameSources: (CaptureSource | null)[],
  ) => {
    setUploadError("");
    const answers = readOnboardingAnswers();
    // A scan is one unit of analysis and cannot be half a camera scan. If any angle came from a
    // file, none of what "web_camera" implies to whoever reads the report — that tracking ran,
    // that framing was machine-enforced, that the subject was there at capture time — is true of
    // it, so the whole scan is reported as an upload.
    const uploaded = frameSources.some((item) => item === "upload");
    try {
      const files: Record<string, File> = {};
      await Promise.all(
        captureSteps.map(async (captureStep, index) => {
          const frame = frames[index];
          if (frame) files[captureStep.id] = await dataUrlToFile(frame, captureStep.id);
        }),
      );
      const queued = await uploadScan(files, {
        ageBand: answers?.ageBand || "adult",
        referenceAgeBand: answers?.referenceAgeBand || "18_35",
        referenceProfile: answers?.referenceProfile || "neutral",
        referencePopulation: answers?.referencePopulation || "TH",
        consentVersion: answers?.consentVersion || ANALYSIS_CONSENT_VERSION,
        scanMode: SCAN_MODE,
        captureMethod: uploaded ? "upload" : "web_camera",
        uploadAttestationVersion: uploaded ? UPLOAD_ATTESTATION_VERSION : "",
      });
      navigate(`/analysis?scan_id=${encodeURIComponent(queued.id)}`);
    } catch (error) {
      setUploadError(errorMessage(error) || (error as Error)?.message || "Upload failed.");
      setPhase("error");
    }
  }, [navigate]);

  /**
   * Put a frame in a slot and move the flow on.
   *
   * Shared by live capture and upload, which is what makes an uploaded photograph
   * indistinguishable from a captured one everywhere downstream: by the time it gets here it is
   * the same face-cropped JPEG data URL, so the thumbnails, `dataUrlToFile` and `uploadScan` never
   * learn that a file picker exists.
   */
  const commitFrame = useCallback((
    index: number,
    frame: string,
    source: CaptureSource,
    advanceDelayMs = 0,
  ) => {
    const nextCaptures = [...capturesRef.current];
    nextCaptures[index] = frame;
    capturesRef.current = nextCaptures;
    setCaptures(nextCaptures);
    const nextSources = [...sourcesRef.current];
    nextSources[index] = source;
    sourcesRef.current = nextSources;
    setSources(nextSources);

    if (nextCaptures.every(Boolean)) {
      stopCamera();
      // An all-camera scan still submits the instant the third angle lands, with no extra click.
      // Anything holding an uploaded photograph has to pass through the attestation first, and a
      // required checkbox cannot be honoured by a function that has already sent the request.
      if (nextSources.every((item) => item === "camera")) {
        setPhase("complete");
        void submitScan(nextCaptures, nextSources);
      } else {
        setPhase("review");
      }
      return;
    }

    const advance = () => {
      const nextStep = getNextCaptureStep(nextCaptures, index);
      if (nextStep < 0) return;
      activeStepRef.current = nextStep;
      setActiveStep(nextStep);
      lastFaceBoxRef.current = null;
      setHoldProgress(candidateCountsRef.current[nextStep] / captureSteps[nextStep].hold.candidates);
      setQuality({ valid: false, code: "position_for_step", score: 0 });
      captureLockedRef.current = false;
    };
    if (advanceDelayMs) window.setTimeout(advance, advanceDelayMs);
    else advance();
  }, [stopCamera, submitScan]);

  const finishCapture = useCallback(() => {
    const frame = captureFrame();
    if (!frame) return;
    captureLockedRef.current = true;
    voiceRef.current.shutter();
    setHoldProgress(1);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 130);
    // The delay lets the shutter flash finish before the next angle's instruction replaces it.
    commitFrame(activeStepRef.current, frame, "camera", 650);
  }, [captureFrame, commitFrame]);

  const processLandmarks = useCallback((
    landmarks: NormalizedLandmark[] | null,
    now: number,
    frameQuality?: FrameQuality,
    observation?: FaceObservation,
  ) => {
    if (landmarks && !captureLockedRef.current) {
      const pose: FacePose | undefined = observation
        ? { yaw: observation.yaw, pitch: observation.pitch, roll: observation.roll }
        : undefined;
      const matchedStep = findMatchingCaptureStep(landmarks, capturesRef.current, activeStepRef.current, frameQuality, pose);
      if (matchedStep !== activeStepRef.current) {
        activeStepRef.current = matchedStep;
        setActiveStep(matchedStep);
        poseWindowRef.current = [];
        setHoldProgress(candidateCountsRef.current[matchedStep] / captureSteps[matchedStep].hold.candidates);
      }
      lastFaceBoxRef.current = getFaceBox(landmarks);
      updateAutoFrame(landmarks, captureSteps[matchedStep].close);
    }

    const currentStep = activeStepRef.current;
    // How still this step wants the head held and how many frames it scores. The profiles ask
    // for less of both: see the note on `captureSteps`.
    const hold = captureSteps[currentStep].hold;
    const framingZoom = landmarks
      ? getAutoFrame(landmarks, captureSteps[currentStep].close).zoom
      : autoFrameRef.current.zoom;
    let measured = landmarks
      ? measurePose(landmarks, currentStep, frameQuality, framingZoom, observation)
      : { valid: false, code: "no_face" as const, score: 0 };

    if (landmarks) {
      const pose = getPoseSignature(landmarks, now, observation);
      poseWindowRef.current = [...poseWindowRef.current.filter((item) => now - item.at <= 900), pose];
      if (measured.valid && !isPoseWindowStable(poseWindowRef.current, hold.yawTolerance, hold.positionTolerance, hold.pitchTolerance)) {
        measured = {
          valid: false,
          code: poseWindowRef.current.length < 4 ? "checking_angle" : "hold_still",
          score: 0,
        };
      }
    } else {
      poseWindowRef.current = [];
    }

    if (!measured.valid || captureLockedRef.current) {
      if (now - lastUiUpdateRef.current > 90) {
        setHoldProgress(candidateCountsRef.current[currentStep] / captureSteps[currentStep].hold.candidates);
        setQuality(measured);
        lastUiUpdateRef.current = now;
      }
      return;
    }

    if (now - lastCandidateAtRef.current[currentStep] >= 110) {
      lastCandidateAtRef.current[currentStep] = now;
      const score = candidateScore(frameQuality);
      const best = bestCandidatesRef.current[currentStep];
      if (!best || score > best.score) {
        bestCandidatesRef.current[currentStep] = { score };
      }
      candidateCountsRef.current[currentStep] = Math.min(hold.candidates, candidateCountsRef.current[currentStep] + 1);
    }

    const progress = candidateCountsRef.current[currentStep] / hold.candidates;
    if (now - lastUiUpdateRef.current > 70) {
      setHoldProgress(progress);
      setQuality({ ...measured, code: "selecting_frame" });
      lastUiUpdateRef.current = now;
    }
    const best = bestCandidatesRef.current[currentStep];
    if (candidateCountsRef.current[currentStep] >= hold.candidates && best && !captureLockedRef.current) {
      finishCapture();
    }
  }, [captureFrame, finishCapture, updateAutoFrame]);

  /**
   * The landmarker worker, created on first need and reused for the life of the page.
   *
   * `startCamera` used to inline this, so the upload path could not run without a camera. It also
   * installed the message handler inside the init promise, where it doubled as the handshake; the
   * handler is permanent now and routes by message type, because still results arrive long after
   * init has resolved.
   */
  const ensureWorker = useCallback(async () => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("../faceLandmarker.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<WorkerOutput>) => {
      if (data.type === "result") {
        workerBusyRef.current = false;
        processLandmarks(data.landmarks, data.timestamp, data.frameQuality, data.observation);
        return;
      }
      if (data.type === "stillResult") {
        const resolve = stillWaitersRef.current.get(data.requestId);
        stillWaitersRef.current.delete(data.requestId);
        resolve?.({ landmarks: data.landmarks, frameQuality: data.frameQuality, observation: data.observation });
      }
    };
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("worker-timeout")), 12000);
        worker.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("worker-error"));
        };
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
    } catch (error) {
      worker.terminate();
      throw error;
    }
    workerRef.current = worker;
    return worker;
  }, [processLandmarks]);

  /**
   * Measure one still image in the worker.
   *
   * The bitmap is copied rather than transferred. Transferring is cheaper, but the caller may hold
   * the only reference to an image it still has to crop from — when a photograph is already small
   * enough, the detection copy and the full-size one are the same object — and a transferred
   * bitmap is detached on this side. A copy of something capped at 512px is not worth the class of
   * bug that avoids.
   */
  const detectStill = useCallback(async (bitmap: ImageBitmap): Promise<StillReading> => {
    const worker = await ensureWorker();
    const requestId = (stillRequestRef.current += 1);
    return new Promise<StillReading>((resolve) => {
      stillWaitersRef.current.set(requestId, resolve);
      worker.postMessage({ type: "still", bitmap, requestId });
    });
  }, [ensureWorker]);

  /**
   * Stop looking at the camera without giving up the stream.
   *
   * Deliberately not `stopCamera`: re-acquiring `getUserMedia` after every trip to the file picker
   * costs a second of black screen and re-prompts for permission on some Android builds. The track
   * is disabled so the sensor is not draining a battery behind a file dialog.
   */
  const pauseCapture = useCallback(() => {
    captureLockedRef.current = true;
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = false; });
  }, []);

  const resumeCapture = useCallback(() => {
    if (!streamRef.current) return;
    streamRef.current.getVideoTracks().forEach((track) => { track.enabled = true; });
    // Cleared because a stability window spanning the pause would compare poses either side of a
    // gap and read the discontinuity as someone holding perfectly still.
    poseWindowRef.current = [];
    lastVideoTimeRef.current = -1;
    lastDetectionRef.current = 0;
    if (capturesRef.current.every(Boolean)) return;
    captureLockedRef.current = false;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(() => void detectionLoop());
  }, []);

  const detectionLoop = useCallback(() => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const worker = workerRef.current;
    if (video && worker && streamRef.current && video.readyState >= 2) {
      const now = performance.now();
      if (!workerBusyRef.current && video.currentTime !== lastVideoTimeRef.current && now - lastDetectionRef.current >= 180) {
        workerBusyRef.current = true;
        lastVideoTimeRef.current = video.currentTime;
        lastDetectionRef.current = now;
        const resizeWidth = 512;
        const resizeHeight = 384;
        void createImageBitmap(video, 0, 0, video.videoWidth, video.videoHeight, {
          resizeWidth,
          resizeHeight,
          resizeQuality: "low",
        }).then((bitmap) => {
          if (!runningRef.current || !workerRef.current) {
            bitmap.close();
            workerBusyRef.current = false;
            return;
          }
          workerRef.current.postMessage({ type: "frame", bitmap, timestamp: now }, [bitmap]);
        }).catch(() => {
          workerBusyRef.current = false;
        });
      }
    }
    if (runningRef.current) rafRef.current = requestAnimationFrame(detectionLoop);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    if (soundOnRef.current && voiceRef.current === silentVoice) {
      voiceRef.current = createCaptureVoice(voiceLangRef.current);
    }
    voiceRef.current.reset();
    poseWasValidRef.current = false;
    const runId = runIdRef.current;
    setPhase("loading");
    setError("");
    const resetCaptures = emptyCaptures();
    capturesRef.current = resetCaptures;
    setCaptures(resetCaptures);
    const resetSources = emptySources();
    sourcesRef.current = resetSources;
    setSources(resetSources);
    setUploadStatus(null);
    setUploadNotice("");
    setAttested(false);
    setActiveStep(0);
    activeStepRef.current = 0;
    poseWindowRef.current = [];
    captureLockedRef.current = false;
    bestCandidatesRef.current = emptyCandidates();
    candidateCountsRef.current = emptyCandidateCounts();
    lastCandidateAtRef.current = emptyCandidateCounts();
    lastFaceBoxRef.current = null;
    lowFpsSamplesRef.current = 0;
    performanceFallbackAppliedRef.current = false;
    lastDetectionRef.current = 0;
    lastVideoTimeRef.current = -1;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
            frameRate: { ideal: 60 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 1920 }, height: { ideal: 1440 }, frameRate: { ideal: 60 } },
        });
      }
      if (runId !== runIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      track.contentHint = "motion";
      const initialSettings = track.getSettings();
      if ((initialSettings.frameRate ?? 30) < 18) {
        performanceFallbackAppliedRef.current = true;
        await track.applyConstraints({
          width: { ideal: 1280 },
          height: { ideal: 960 },
          frameRate: { ideal: 30 },
        }).catch(() => undefined);
      }
      lowFpsSamplesRef.current = 0;
      autoFrameRef.current = { centerX: 0.5, centerY: 0.5, zoom: 1.18 };
      viewportRef.current?.style.setProperty("--capture-zoom", "1.18");
      viewportRef.current?.style.setProperty("--capture-pan-x", "0%");
      viewportRef.current?.style.setProperty("--capture-pan-y", "0%");
      setCameraFps(Math.round(track.getSettings().frameRate ?? 0));
      if (!videoRef.current) {
        stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (runId !== runIdRef.current) return;
      startFpsMeter();
      setPhase("scanning");
      setQuality({ valid: false, code: "starting", score: 0 });
      await ensureWorker();
      if (runId !== runIdRef.current) {
        stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
        return;
      }
      runningRef.current = true;
      setQuality({ valid: false, code: "position_for_step", score: 0 });
      rafRef.current = requestAnimationFrame(() => void detectionLoop());
    } catch {
      if (runId !== runIdRef.current) return;
      stopCamera();
      setError("cameraDenied");
      setPhase("error");
    }
  }, [detectionLoop, ensureWorker, startFpsMeter, stopCamera]);

  useEffect(() => {
    void startCamera();
    return () => {
      stopCamera();
      disposeWorker();
      if (navigationTimerRef.current) window.clearTimeout(navigationTimerRef.current);
    };
  }, [startCamera, stopCamera]);

  const openPicker = useCallback((index: number) => {
    pendingUploadStepRef.current = index;
    setUploadStatus(null);
    setUploadNotice("");
    pauseCapture();
    const input = fileInputRef.current;
    if (!input) return;
    // Without this, picking the same file again after a rejection fires no `change` event at all
    // and the button appears dead.
    input.value = "";
    // Cancelling a file dialog fires nothing — no event of any kind — so the only way to know the
    // user backed out is that focus returns to the window. Installed at click time so it cannot
    // outlive the dialog it belongs to.
    window.addEventListener("focus", () => {
      window.setTimeout(() => {
        if (!fileInputRef.current?.files?.length) resumeCapture();
      }, 300);
    }, { once: true });
    input.click();
  }, [pauseCapture, resumeCapture]);

  const onFilePicked = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const requestedStep = pendingUploadStepRef.current;
    // `code: null` is "still working". A real code would have to be borrowed from the live
    // vocabulary to mean this, and a value that means two things is how the wrong sentence ends
    // up on screen.
    setUploadStatus({ step: requestedStep, code: null });
    setUploadNotice("");

    // The DOM-shaped half of `prepareUpload`, built here so that module stays free of canvas and
    // worker calls and can be tested under `node --test`.
    const ports = {
      decode: async (picked: File) => {
        const decoded = await decodeOriented(picked);
        const full = await fitBitmap(decoded, MAX_SUBMIT_EDGE);
        if (full !== decoded) decoded.close();
        // Always a separate bitmap, even when the photograph is small enough that no resize is
        // needed. `full` is what the crop is drawn from, and handing one object to two consumers
        // is how one of them gets closed out from under the other.
        const oversized = Math.max(full.width, full.height) > MAX_DETECT_EDGE;
        const detect = oversized ? await fitBitmap(full, MAX_DETECT_EDGE) : await createImageBitmap(full);
        return { full, detect, width: full.width, height: full.height };
      },
      detect: detectStill,
      crop: (source: ImageBitmap, width: number, height: number, box: Parameters<typeof cropToJpeg>[3]) =>
        cropToJpeg(source, width, height, box),
      reread: bitmapFromDataUrl,
      classifyFailure: classifyDecodeFailure,
      isSideways,
      release: (source: ImageBitmap) => source.close(),
    };

    let outcome;
    try {
      outcome = await prepareUpload(file, requestedStep, capturesRef.current, ports);
    } catch {
      outcome = { ok: false as const, code: "unreadable_image" as QualityCode };
    }
    if (!outcome.ok) {
      setUploadStatus({ step: requestedStep, code: outcome.code });
      resumeCapture();
      return;
    }
    setUploadStatus(null);
    const notices: string[] = [];
    if (outcome.stepIndex !== requestedStep) notices.push("moved");
    if (outcome.warning === "relax_expression") notices.push("smile");
    setUploadNotice(notices.join(","));
    commitFrame(outcome.stepIndex, outcome.dataUrl, "upload");
    // Only resumes if slots remain; `commitFrame` has already stopped the camera otherwise.
    resumeCapture();
  }, [commitFrame, detectStill, resumeCapture]);

  /** Empty a filled slot and go back to it. Offered for camera frames too — a delete control that
   * appears only on uploaded tiles reads as a bug rather than a rule. */
  const clearSlot = useCallback((index: number) => {
    const nextCaptures = [...capturesRef.current];
    nextCaptures[index] = null;
    capturesRef.current = nextCaptures;
    setCaptures(nextCaptures);
    const nextSources = [...sourcesRef.current];
    nextSources[index] = null;
    sourcesRef.current = nextSources;
    setSources(nextSources);
    bestCandidatesRef.current[index] = null;
    candidateCountsRef.current[index] = 0;
    lastCandidateAtRef.current[index] = 0;
    activeStepRef.current = index;
    setActiveStep(index);
    setHoldProgress(0);
    setUploadStatus(null);
    setUploadNotice("");
    setAttested(false);
    setQuality({ valid: false, code: "position_for_step", score: 0 });
    if (streamRef.current) {
      setPhase("scanning");
      resumeCapture();
    } else {
      void startCamera();
    }
  }, [resumeCapture, startCamera]);

  const step = captureSteps[activeStep];
  const capturedCount = captures.filter(Boolean).length;
  const stepCopy = (index: number) => copy.scan.steps[captureSteps[index].id];
  // One register when the words are about a person in front of a camera, another when they are
  // about a file that already exists. See `QualityCode`.
  const qualityText = (code: QualityCode, register: "live" | "still" = "live") =>
    copy.scan.quality[register][code];
  const liveMessage = quality.code === "position_for_step"
    ? stepCopy(activeStep).short
    : qualityText(quality.code);

  voiceLangRef.current = locale === "en" ? "en-US" : "th-TH";
  soundOnRef.current = soundOn;

  /**
   * The spoken half of the guidance, driven from the same `quality` the text is drawn from so the
   * two can never say different things.
   *
   * Corrections are spoken; `selecting_frame` is not. Once the pose is right the user's job is to
   * stop moving, and narrating that is an instruction to act at the exact moment acting would
   * ruin the frame -- the rising tone already says "hold" without asking for anything.
   */
  useEffect(() => {
    const voice = voiceRef.current;
    if (quality.valid) {
      if (!poseWasValidRef.current) {
        poseWasValidRef.current = true;
        voice.ready();
      }
      return;
    }
    poseWasValidRef.current = false;
    voice.say(quality.code, liveMessage);
  }, [quality, liveMessage]);
  useEffect(() => {
    if (soundOn) return;
    voiceRef.current.close();
    voiceRef.current = silentVoice;
  }, [soundOn]);

  const hasUpload = sources.some((item) => item === "upload");

  return (
    <main className="capture-page">
      <input
        ref={fileInputRef}
        type="file"
        // Deliberately not a narrower list: on iOS, restricting `accept` is what switches off the
        // automatic HEIC-to-JPEG conversion the photo library would otherwise do for us. The type
        // is checked after the file arrives instead.
        accept="image/*"
        hidden
        onChange={(event) => void onFilePicked(event)}
      />
      <header className="capture-header">
        <Brand />
        <div className="capture-header__state">
          <span>{copy.scan.autoCapture}</span><i />
          {copy.scan.progress.replace("%d", String(capturedCount)).replace("%d", String(captureSteps.length))}
        </div>
        <a className="capture-close" href="/" aria-label={copy.scan.exit}><X size={20} /></a>
      </header>

      <section className="capture-layout">
        <div
          ref={viewportRef}
          className={`capture-viewport ${step.close ? "is-close-capture" : ""}`}
        >
          <video ref={videoRef} autoPlay muted playsInline aria-label={copy.scan.preview} />
          <div className="capture-arc" aria-hidden="true"><span /></div>
          <div className={`capture-face-guide ${quality.valid ? "is-ready" : ""}`} aria-hidden="true" />
          <div className="capture-viewport__meta">
            <span><ShieldCheck size={15} /> {copy.scan.onDevice}</span>
            <span>{cameraFps ? copy.scan.fpsLive.replace("%d", String(cameraFps)) : copy.scan.fpsTarget}</span>
          </div>
          <button
            type="button"
            className="capture-sound-toggle"
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              // Built here rather than in the effect below because this click is a user
              // gesture and the effect is not -- an AudioContext created outside one is born
              // suspended, so turning sound back on mid-scan would leave it mute.
              if (next && runningRef.current) voiceRef.current = createCaptureVoice(voiceLangRef.current);
            }}
            aria-pressed={soundOn}
            aria-label={soundOn ? copy.scan.voiceOn : copy.scan.voiceOff}
            title={soundOn ? copy.scan.voiceOn : copy.scan.voiceOff}
          >
            {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          {flash && <div className="capture-flash" />}
          {phase === "loading" && (
            <div className="capture-loading" role="status"><span />{copy.scan.loading}</div>
          )}
        </div>

        <aside className="capture-panel">
          {phase === "complete" ? (
            <div className="capture-complete" role="status">
              <span><Check size={28} /></span>
              <h1>{copy.scan.complete}</h1>
              <p>{copy.scan.completeBody}</p>
            </div>
          ) : (
            <>
              {phase === "error" ? (
                <div className="capture-error" role="alert">
                  <h1>{uploadError ? copy.scan.uploadFailed : copy.scan.cameraUnavailable}</h1>
                  <p>{uploadError || (error === "cameraDenied" ? copy.scan.cameraDenied : error)}</p>
                  <button type="button" onClick={() => void startCamera()}>
                    <RotateCcw size={17} /> {copy.scan.retry}
                  </button>
                  {/* The whole point of the feature reaches this branch: someone whose camera was
                      refused still has a way through, and it must not be hidden behind the retry
                      button that just failed them. */}
                  <button type="button" className="capture-upload-cta" onClick={() => openPicker(activeStep)}>
                    <ImageUp size={17} /> {copy.scan.upload.cta}
                  </button>
                  <small>{copy.scan.upload.hint}</small>
                </div>
              ) : phase === "review" ? (
                <div className="capture-review">
                  <h1>{copy.scan.review.title}</h1>
                  <p>{copy.scan.review.body}</p>
                  <label className="capture-consent">
                    <input
                      type="checkbox"
                      checked={attested}
                      onChange={(event) => setAttested(event.target.checked)}
                    />
                    <span>{copy.scan.review.attestation}</span>
                  </label>
                  <button
                    type="button"
                    className="capture-review__submit"
                    disabled={!attested}
                    onClick={() => {
                      setPhase("complete");
                      void submitScan(capturesRef.current, sourcesRef.current);
                    }}
                  >
                    {copy.scan.review.submit}
                  </button>
                  {!attested && <small>{copy.scan.review.submitBlocked}</small>}
                </div>
              ) : (
                <div className="capture-copy">
                  <h1>{stepCopy(activeStep).short}</h1>
                  <p>{liveMessage}</p>
                  <div className="capture-hold" aria-label={quality.valid ? copy.scan.holdLabel : liveMessage}>
                    <span />
                    <span className={quality.valid ? "is-tracking" : ""} />
                    <span />
                  </div>
                  <div className="capture-timer" aria-hidden={!quality.valid}>
                    <div><span style={{ transform: `scaleX(${holdProgress})` }} /></div>
                    <b>{Math.round(holdProgress * 100)}%</b>
                  </div>
                  <small>{quality.valid ? copy.scan.hintCapturing : copy.scan.hintMoving}</small>
                  <button type="button" className="capture-upload-cta" onClick={() => openPicker(activeStep)}>
                    <ImageUp size={16} /> {copy.scan.upload.cta}
                  </button>
                </div>
              )}

              {uploadStatus && (
                <div
                  className={`capture-upload-status ${uploadStatus.code ? "is-rejected" : "is-checking"}`}
                  role={uploadStatus.code ? "alert" : "status"}
                >
                  <strong>{stepCopy(uploadStatus.step).label}</strong>
                  <p>{uploadStatus.code ? qualityText(uploadStatus.code, "still") : copy.scan.upload.checking}</p>
                  {uploadStatus.code && (
                    <button type="button" onClick={() => openPicker(uploadStatus.step)}>
                      {copy.scan.upload.chooseAnother}
                    </button>
                  )}
                </div>
              )}

              {uploadNotice && (
                <div className="capture-upload-notice" role="status">
                  {uploadNotice.split(",").map((notice) => (
                    <p key={notice}>
                      {notice === "moved"
                        ? copy.scan.upload.movedToStep.replace("%s", stepCopy(activeStep).label)
                        : copy.scan.upload.smileWarning}
                    </p>
                  ))}
                </div>
              )}

              <div className="capture-steps">
                {captureSteps.map((item, index) => {
                  const captured = captures[index];
                  const isDone = Boolean(captured);
                  const isActive = index === activeStep;
                  const uploaded = sources[index] === "upload";
                  return (
                    <div
                      className={`capture-step ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""} ${uploaded ? "is-uploaded" : ""}`}
                      key={item.id}
                      aria-current={isActive ? "step" : undefined}
                    >
                      <div
                        className={`capture-step__image ${item.close ? "is-close" : ""}`}
                        style={captured ? {
                          backgroundImage: `url(${captured})`,
                          backgroundSize: item.close ? "220%" : "cover",
                          backgroundPosition: item.close ? "center 27%" : "center",
                        } : { backgroundPosition: referencePosition(index) }}
                      />
                      <span>{stepCopy(index).label}</span>
                      {isDone && <i><Check size={14} /></i>}
                      {isDone ? (
                        <button
                          type="button"
                          className="capture-step__redo"
                          onClick={() => clearSlot(index)}
                        >
                          {copy.scan.upload.redo}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="capture-step__upload"
                          aria-label={copy.scan.upload.forStep.replace("%s", stepCopy(index).label)}
                          onClick={() => openPicker(index)}
                        >
                          <ImageUp size={15} />
                        </button>
                      )}
                      {uploaded && <em className="capture-step__badge">{copy.scan.upload.badge}</em>}
                    </div>
                  );
                })}
              </div>

              {phase !== "review" && (
                <div className="capture-technical">
                  {copy.scan.technical.map((line, index) => (
                    <span key={line}>{index > 0 && <i />}{line}</span>
                  ))}
                </div>
              )}
              {hasUpload && phase !== "review" && (
                <small className="capture-upload-hint">{copy.scan.upload.hint}</small>
              )}
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
