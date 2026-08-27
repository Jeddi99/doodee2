import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RotateCcw, ShieldCheck, X } from "lucide-react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { useNavigate } from "react-router-dom";
import Brand from "../Brand";
import { uploadScan } from "../lib/api";
import { errorMessage } from "../lib/apiError";
import { readOnboardingAnswers } from "../lib/onboardingAnswers";
import { ANALYSIS_CONSENT_VERSION } from "./OnboardingPage";
import {
  CANDIDATE_TARGET,
  candidateScore,
  captureSteps,
  faceCropRect,
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
} from "../scanQuality";

/**
 * captureSteps is front + left_profile + right_profile, which is exactly the `standard` mode in
 * backend/doodee/analysis_engine.py. `full` additionally uploads front_smile, the obliques and
 * basal, but analyze_images() only ever reads front and the two profiles — so standard costs
 * nothing in measurements and saves four uploads.
 */
const SCAN_MODE = "standard";

async function dataUrlToFile(dataUrl: string, view: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], `${view}.jpg`, { type: "image/jpeg" });
}

type Phase = "loading" | "scanning" | "complete" | "error";
type WorkerOutput =
  | { type: "ready" }
  | { type: "result"; landmarks: NormalizedLandmark[] | null; timestamp: number; frameQuality?: FrameQuality; observation?: FaceObservation }
  | { type: "error"; message: string };

const emptyCaptures = () => captureSteps.map(() => null as string | null);
type Candidate = { score: number };
const emptyCandidates = () => captureSteps.map(() => null as Candidate | null);
const emptyCandidateCounts = () => captureSteps.map(() => 0);

function referencePosition(index: number) {
  return ["100% 0%", "0% 0%", "50% 100%"][index];
}

export default function ScanPage() {
  const navigate = useNavigate();
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
  const [quality, setQuality] = useState<Quality>({ valid: false, message: "Finding your face…", score: 0 });
  const [holdProgress, setHoldProgress] = useState(0);
  const [captures, setCaptures] = useState<(string | null)[]>(emptyCaptures);
  const [cameraFps, setCameraFps] = useState(0);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    runIdRef.current += 1;
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    if (videoRef.current && videoFrameCallbackRef.current && "cancelVideoFrameCallback" in videoRef.current) {
      videoRef.current.cancelVideoFrameCallback(videoFrameCallbackRef.current);
    }
    videoFrameCallbackRef.current = 0;
    workerRef.current?.terminate();
    workerRef.current = null;
    workerBusyRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
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
    const crop = faceCropRect(lastFaceBoxRef.current, video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(crop.width, crop.height));
    canvas.width = Math.round(crop.width * scale);
    canvas.height = Math.round(crop.height * scale);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return "";
    context.drawImage(
      video,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvas.toDataURL("image/jpeg", 0.94);
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
  const submitScan = useCallback(async (frames: (string | null)[]) => {
    setUploadError("");
    const answers = readOnboardingAnswers();
    try {
      const files: Record<string, File> = {};
      await Promise.all(
        captureSteps.map(async (captureStep, index) => {
          const frame = frames[index];
          if (frame) files[captureStep.id] = await dataUrlToFile(frame, captureStep.id);
        }),
      );
      const queued = await uploadScan(
        files,
        answers?.ageBand || "adult",
        answers?.referenceAgeBand || "18_35",
        answers?.referenceProfile || "neutral",
        answers?.referencePopulation || "TH",
        answers?.consentVersion || ANALYSIS_CONSENT_VERSION,
        SCAN_MODE,
        // Every photo here comes off the live <video> element; there is no file picker in this
        // app. Sent explicitly so the report does not have to assume it.
        "web_camera",
      );
      navigate(`/analysis?scan_id=${encodeURIComponent(queued.id)}`);
    } catch (error) {
      setUploadError(errorMessage(error) || (error as Error)?.message || "Upload failed.");
      setPhase("error");
    }
  }, [navigate]);

  const finishCapture = useCallback(() => {
    const frame = captureFrame();
    if (!frame) return;
    captureLockedRef.current = true;
    setHoldProgress(1);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 130);
    const currentStep = activeStepRef.current;
    const nextCaptures = [...capturesRef.current];
    nextCaptures[currentStep] = frame;
    capturesRef.current = nextCaptures;
    setCaptures(nextCaptures);

    if (nextCaptures.every(Boolean)) {
      setPhase("complete");
      stopCamera();
      void submitScan(nextCaptures);
      return;
    }

    window.setTimeout(() => {
      const nextStep = getNextCaptureStep(nextCaptures, currentStep);
      if (nextStep < 0) return;
      activeStepRef.current = nextStep;
      setActiveStep(nextStep);
      lastFaceBoxRef.current = null;
      setHoldProgress(candidateCountsRef.current[nextStep] / CANDIDATE_TARGET);
      setQuality({ valid: false, message: captureSteps[nextStep].short, score: 0 });
      captureLockedRef.current = false;
    }, 650);
  }, [captureFrame, stopCamera, submitScan]);

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
        setHoldProgress(candidateCountsRef.current[matchedStep] / CANDIDATE_TARGET);
      }
      lastFaceBoxRef.current = getFaceBox(landmarks);
      updateAutoFrame(landmarks, captureSteps[matchedStep].close);
    }

    const currentStep = activeStepRef.current;
    const framingZoom = landmarks
      ? getAutoFrame(landmarks, captureSteps[currentStep].close).zoom
      : autoFrameRef.current.zoom;
    let measured = landmarks
      ? measurePose(landmarks, currentStep, frameQuality, framingZoom, observation)
      : { valid: false, message: "Move your face into view", score: 0 };

    if (landmarks) {
      const pose = getPoseSignature(landmarks, now, observation);
      poseWindowRef.current = [...poseWindowRef.current.filter((item) => now - item.at <= 900), pose];
      if (measured.valid && !isPoseWindowStable(poseWindowRef.current, 6, 0.03, 6)) {
        measured = {
          valid: false,
          message: poseWindowRef.current.length < 4 ? "Checking the angle…" : "Keep completely still",
          score: 0,
        };
      }
    } else {
      poseWindowRef.current = [];
    }

    if (!measured.valid || captureLockedRef.current) {
      if (now - lastUiUpdateRef.current > 90) {
        setHoldProgress(candidateCountsRef.current[currentStep] / CANDIDATE_TARGET);
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
      candidateCountsRef.current[currentStep] = Math.min(CANDIDATE_TARGET, candidateCountsRef.current[currentStep] + 1);
    }

    const progress = candidateCountsRef.current[currentStep] / CANDIDATE_TARGET;
    if (now - lastUiUpdateRef.current > 70) {
      setHoldProgress(progress);
      setQuality({ ...measured, message: "Selecting the clearest frame" });
      lastUiUpdateRef.current = now;
    }
    const best = bestCandidatesRef.current[currentStep];
    if (candidateCountsRef.current[currentStep] >= CANDIDATE_TARGET && best && !captureLockedRef.current) {
      finishCapture();
    }
  }, [captureFrame, finishCapture, updateAutoFrame]);

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
    const runId = runIdRef.current;
    setPhase("loading");
    setError("");
    const resetCaptures = emptyCaptures();
    capturesRef.current = resetCaptures;
    setCaptures(resetCaptures);
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
      setQuality({ valid: false, message: "Camera ready · Starting face tracking…", score: 0 });
      const worker = new Worker(new URL("../faceLandmarker.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("worker-timeout")), 12000);
        worker.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("worker-error"));
        };
        worker.onmessage = ({ data }: MessageEvent<WorkerOutput>) => {
          if (data.type === "ready") {
            window.clearTimeout(timeout);
            resolve();
            return;
          }
          if (data.type === "error") {
            window.clearTimeout(timeout);
            reject(new Error(data.message));
            return;
          }
          workerBusyRef.current = false;
          processLandmarks(data.landmarks, data.timestamp, data.frameQuality, data.observation);
        };
        worker.postMessage({ type: "init" });
      });
      if (runId !== runIdRef.current) {
        stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
        return;
      }
      runningRef.current = true;
      setQuality({ valid: false, message: "Move your face into the guide", score: 0 });
      rafRef.current = requestAnimationFrame(() => void detectionLoop());
    } catch {
      if (runId !== runIdRef.current) return;
      stopCamera();
      setError("Camera access is required. Allow camera access in your browser, then try again.");
      setPhase("error");
    }
  }, [detectionLoop, processLandmarks, startFpsMeter, stopCamera]);

  useEffect(() => {
    void startCamera();
    return () => {
      stopCamera();
      if (navigationTimerRef.current) window.clearTimeout(navigationTimerRef.current);
    };
  }, [startCamera, stopCamera]);

  const step = captureSteps[activeStep];
  const capturedCount = captures.filter(Boolean).length;

  return (
    <main className="capture-page">
      <header className="capture-header">
        <Brand />
        <div className="capture-header__state">
          <span>Auto capture</span><i />{capturedCount} of {captureSteps.length} complete
        </div>
        <a className="capture-close" href="/" aria-label="Exit face scan"><X size={20} /></a>
      </header>

      <section className="capture-layout">
        <div
          ref={viewportRef}
          className={`capture-viewport ${step.close ? "is-close-capture" : ""}`}
        >
          <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera preview" />
          <div className="capture-arc" aria-hidden="true"><span /></div>
          <div className={`capture-face-guide ${quality.valid ? "is-ready" : ""}`} aria-hidden="true" />
          <div className="capture-viewport__meta">
            <span><ShieldCheck size={15} /> On-device processing</span>
            <span>{cameraFps ? `${cameraFps} FPS live` : "60 FPS target"}</span>
          </div>
          {flash && <div className="capture-flash" />}
          {phase === "loading" && (
            <div className="capture-loading" role="status"><span />Opening camera and loading face tracking…</div>
          )}
        </div>

        <aside className="capture-panel">
          {phase === "error" ? (
            <div className="capture-error" role="alert">
              <h1>{uploadError ? "Upload failed." : "Camera unavailable."}</h1>
              <p>{uploadError || error}</p>
              <button type="button" onClick={() => void startCamera()}><RotateCcw size={17} /> Try again</button>
            </div>
          ) : phase === "complete" ? (
            <div className="capture-complete" role="status">
              <span><Check size={28} /></span>
              <h1>Capture complete.</h1>
              <p>Three verified angles are ready. Sending them for analysis…</p>
            </div>
          ) : (
            <>
              <div className="capture-copy">
                <h1>{step.short}</h1>
                <p>{quality.message}</p>
                <div className="capture-hold" aria-label={quality.valid ? "Selecting the best frame" : quality.message}>
                  <span />
                  <span className={quality.valid ? "is-tracking" : ""} />
                  <span />
                </div>
                <div className="capture-timer" aria-hidden={!quality.valid}>
                  <div><span style={{ transform: `scaleX(${holdProgress})` }} /></div>
                  <b>{Math.round(holdProgress * 100)}%</b>
                </div>
                <small>{quality.valid ? "Selecting the sharpest frame" : "Move naturally to any uncaptured angle"}</small>
              </div>

              <div className="capture-steps">
                {captureSteps.map((item, index) => {
                  const captured = captures[index];
                  const isDone = Boolean(captured);
                  const isActive = index === activeStep;
                  return (
                    <div
                      className={`capture-step ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`}
                      key={item.label}
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
                      <span>{item.label}</span>
                      {isDone && <i><Check size={14} /></i>}
                    </div>
                  );
                })}
              </div>

              <div className="capture-technical">
                <span>1.5–2 metres away</span><i />
                <span>High-resolution capture</span><i />
                <span>Hair away from face</span>
              </div>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
