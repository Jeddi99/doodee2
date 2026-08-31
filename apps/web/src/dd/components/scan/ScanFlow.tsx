"use client";

import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { m } from "framer-motion";
import { ArrowRight, Camera, Check, Clock3, ImagePlus, Loader2, Lock, Scissors, X } from "lucide-react";
import { PhotoUpload, decodeOffThread } from "./PhotoUpload";
import { CameraCapture, type SequenceFrames } from "./CameraCapture";
import type { PoseTarget } from "@/lib/face-guide";
import { LandmarkCanvas } from "./LandmarkCanvas";
import type { ScanStage } from "./ScanProgress";
import { ScanHudFrame } from "./cockpit/ScanHudFrame";
import { OverallScore } from "@/components/results/OverallScore";
import { FaceCard } from "@/components/results/FaceCard";
import { AnnotatedFaceDownload } from "@/components/results/AnnotatedFaceDownload";
import { PhotoQualityBanner } from "./PhotoQualityBanner";
import {
  ConsentCalibrationCard,
  type ConsentCaptureSource,
} from "./ConsentCalibrationCard";
import { CategoryTabs } from "@/components/results/CategoryTabs";
import { SkinPanel } from "@/components/results/SkinPanel";
import { AiSummaryCard } from "@/components/results/AiSummaryCard";
import { RoadmapCard } from "@/components/results/RoadmapCard";
import { ReportDownloadButton } from "@/components/results/ReportDownloadButton";
// Phase 167 — OnboardingTour removed. Replaced by `OnboardingWizard`
// mounted at the (app) layout level so it shows on first visit no
// matter which route the user lands on.
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { FaceMeshDetector } from "@/lib/mediapipe";
import { useMediaPipePreload } from "@/lib/use-mediapipe";
import {
  assessPhotoQuality,
  computeAll,
  foldSkinIntoOverall,
  foldSecondOpinion,
  foldQualityIntoConfidence,
  applyLearnedBlend,
  predictAttractiveness,
  reconcileWithAi,
  shouldRejectForScoring,
  tierFor,
  medianLandmarks,
  pickAnchorFrame,
  rejectPoseOutlierFrames,
  type PhotoQualityReport,
  type ScanResult,
} from "@/lib/scoring";
import {
  callGeminiScoreWithOutcome,
  type AiScorePhotoQualityContext,
  type AiScoreSource,
  type WeakMetric,
} from "@/lib/ai-gemini";
// Phase 171 — `notifySubscriptionChanged` no longer needed here; the
// quota API itself pushes the new row to the cache (Phase 158.35/36c).
import type { MetricKey } from "@/types";
import { analyzeSkin } from "@/lib/skin/analyzeSkin";
import { saveScan, type ScanRecord } from "@/lib/scan-history";
import {
  ANALYSIS_CONSENT_VERSION,
  loadUserPrefs,
  saveUserPrefs,
  type AgeRange,
  type AestheticReference,
  type ProfileGoal,
} from "@/lib/user-prefs";
import { useT } from "@/lib/i18n";
import { humanizeError } from "@/lib/humanizeError";
import { useSubscription } from "@/lib/use-subscription";
import { AnalysisSteps } from "./AnalysisSteps";
import { ScanPaywall } from "./ScanPaywall";
// Phase 192u — paywall gate: route quota-exhausted / feature-locked /
// server-402 failures into the app-level upgrade dialog instead of only
// showing the inline geometric-fallback banner.
import { useQuotaGate, openGateFromError } from "@/lib/quota-gate";
import { getAccessToken } from "@/lib/supabase/auth-client";
import { getScanReportAccessState } from "@/lib/scan-report-access";
import {
  trackCameraAdoption,
  type CameraAdoptionEvent,
} from "@/lib/camera-adoption";
import { openCheckout } from "@/lib/billing";
import {
  INTRO_OFFER_DELAY_MS,
  dismissIntroOffer,
  ensureIntroOfferState,
  markIntroOfferClicked,
} from "@/lib/intro-offer";
import { scoreBucket, trackProductEvent } from "@/lib/product-events";
import { syncUserProfile } from "@/lib/user-profile-sync";
import type { Gender, Ethnicity, Landmarks, ScanPhoto } from "@/types";

type IntakeMode = "camera" | "upload";

// Phase 192h — L1 audit fix. Schedule best-effort work off the critical
// path so the score paint isn't blocked by canvas.toDataURL +
// localStorage writes. Prefer requestIdleCallback (Chrome/Firefox/Edge);
// fall back to setTimeout(200) on Safari which lacks rIC. The 200ms
// fallback delay is chosen to land AFTER React commits + paints the
// score, while still being short enough to capture the persist before
// the user navigates away.
function deferIdle(cb: () => void): void {
  if (typeof window === "undefined") {
    cb();
    return;
  }
  const ric = (window as unknown as {
    requestIdleCallback?: (
      cb: () => void,
      opts?: { timeout?: number }
    ) => number;
  }).requestIdleCallback;
  if (typeof ric === "function") {
    ric(cb, { timeout: 2000 });
    return;
  }
  window.setTimeout(cb, 200);
}

function yieldToPaint(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function revokeImageObjectUrl(image: HTMLImageElement): void {
  if (!image.src.startsWith("blob:")) return;
  try {
    URL.revokeObjectURL(image.src);
  } catch {}
}

export function ScanFlow({ hideIntro = false }: { hideIntro?: boolean }) {
  const { t, lang } = useT();
  // Phase 192u — hook must be called at the component top level (rules of
  // hooks); `openGate` is referenced from inside the async catch blocks.
  const { openGate } = useQuotaGate();
  const { subscription, loading: subscriptionLoading } = useSubscription();

  const [showPaywall, setShowPaywall] = useState(false);
  const [analysisMinReached, setAnalysisMinReached] = useState(false);
  const [scanCompleted, setScanCompleted] = useState(false);
  const analysisMinReachedRef = useRef(false);
  const scanCompletedRef = useRef(false);

  const reportAccess = useMemo(
    () => getScanReportAccessState(subscription, subscriptionLoading),
    [subscription, subscriptionLoading]
  );
  const isFreeUser = reportAccess.isFreeUser;
  const hasReportAccess = reportAccess.canAccessReport;
  const hasFullReportAccess = reportAccess.hasPaidPlan;
  const canShowReportPaywall = reportAccess.canShowPaywall;

  const [front, setFront] = useState<ScanPhoto | null>(null);
  const [frames, setFrames] = useState<ScanPhoto[]>([]);
  const [side, setSide] = useState<ScanPhoto | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [frontError, setFrontError] = useState<string | null>(null);
  const [sideError, setSideError] = useState<string | null>(null);
  const [processingFront, setProcessingFront] = useState(false);
  const [processingSide, setProcessingSide] = useState(false);
  const [processingFrame, setProcessingFrame] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [learnedPending, setLearnedPending] = useState(false);
  // Phase 112/114 — Gemini-led scoring. Pending state is conveyed via
  // `scanStage === "ai"` (drives ScanProgress); we only keep the error here.
  const [aiError, setAiError] = useState<string | null>(null);
  // Phase 158.27 — Track which scoring source produced the visible result
  // so the OverallScore card can render a "Gemini AI" / "MediaPipe-only"
  // proof-of-work badge. Null = no scan run yet.
  const [aiSource, setAiSource] = useState<AiScoreSource | null>(null);
  // Phase 114 — preview/confirm step and visual progress stage.
  const [previewImage, setPreviewImage] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewBatchRef = useRef<HTMLImageElement[]>([]);
  const [captureSource, setCaptureSource] = useState<ConsentCaptureSource>("camera");
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("camera");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraAttempted, setCameraAttempted] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [scanStage, setScanStage] = useState<ScanStage>("model");
  const [qualityReport, setQualityReport] = useState<PhotoQualityReport | null>(null);
  const [qualityDismissed, setQualityDismissed] = useState(false);
  const [gender, setGender] = useState<Gender>("male");
  const ethnicity: Ethnicity = "universal";
  const [ageRange, setAgeRange] = useState<AgeRange>("not_set");
  const [goal, setGoal] = useState<ProfileGoal>("overall");
  const [aestheticReference, setAestheticReference] =
    useState<AestheticReference>("no_preference");
  const [analysisConsent, setAnalysisConsent] = useState(false);
  const [improvementConsent, setImprovementConsent] = useState(false);
  const [introOfferOpen, setIntroOfferOpen] = useState(false);
  const [introOfferExpiresAt, setIntroOfferExpiresAt] = useState<number | null>(null);
  const [introOfferBusy, setIntroOfferBusy] = useState(false);
  const [introOfferError, setIntroOfferError] = useState<
    "payment-unavailable" | null
  >(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const unreliablePhotoMessage =
    lang === "th"
      ? "รูปนี้ยังวิเคราะห์ได้ไม่แม่นพอ กรุณาใช้รูปหน้าตรง แสงชัด ไม่ใส่ฟิลเตอร์"
      : "This photo is not reliable enough yet. Use a clear front-facing photo without filters.";
  const detectorRef = useRef<FaceMeshDetector | null>(null);
  const scanRunIdRef = useRef(0);
  const activeFrontRunIdRef = useRef<number | null>(null);
  const trackedUrlsRef = useRef<Set<string>>(new Set());
  const cameraTelemetryRef = useRef<Set<string>>(new Set());
  const processingFrontRef = useRef(false);
  const processingSideRef = useRef(false);
  const processingFrameRef = useRef(false);
  const introOfferViewedRef = useRef(false);
  const faceProfileTrackedRef = useRef(false);
  const reportLockTrackedRef = useRef(false);

  const setFrontBusy = useCallback((busy: boolean) => {
    processingFrontRef.current = busy;
    setProcessingFront(busy);
  }, []);

  const beginFrontRun = useCallback(
    (runId: number) => {
      activeFrontRunIdRef.current = runId;
      setFrontBusy(true);
    },
    [setFrontBusy]
  );

  const finishFrontRun = useCallback(
    (runId: number) => {
      if (activeFrontRunIdRef.current !== runId) return;
      activeFrontRunIdRef.current = null;
      setFrontBusy(false);
    },
    [setFrontBusy]
  );

  const cancelActiveFrontRun = useCallback(() => {
    scanRunIdRef.current += 1;
    activeFrontRunIdRef.current = null;
    scanCompletedRef.current = false;
    analysisMinReachedRef.current = false;
    setScanCompleted(false);
    setAnalysisMinReached(false);
    setFrontBusy(false);
  }, [setFrontBusy]);

  function isCurrentFrontRun(runId: number): boolean {
    return (
      scanRunIdRef.current === runId &&
      activeFrontRunIdRef.current === runId
    );
  }

  function finishIfStaleFrontRun(runId: number): boolean {
    if (isCurrentFrontRun(runId)) return false;
    finishFrontRun(runId);
    return true;
  }

  const setSideBusy = useCallback((busy: boolean) => {
    processingSideRef.current = busy;
    setProcessingSide(busy);
  }, []);

  const setFrameBusy = useCallback((busy: boolean) => {
    processingFrameRef.current = busy;
    setProcessingFrame(busy);
  }, []);

  const trackScanCameraEvent = useCallback(
    (
      event: Extract<CameraAdoptionEvent, `scan_${string}`>,
      metadata?: { reason?: "auto" | "manual" | "after_attempt" | "permission_denied" }
    ) => {
      const key = `${event}:${metadata?.reason ?? ""}`;
      if (cameraTelemetryRef.current.has(key)) return;
      cameraTelemetryRef.current.add(key);
      void trackCameraAdoption(event, metadata);
    },
    []
  );

  const replacePreviewBatch = useCallback((images: HTMLImageElement[]) => {
    const nextUrls = new Set(images.map((image) => image.src));
    for (const image of previewBatchRef.current) {
      if (!nextUrls.has(image.src)) revokeImageObjectUrl(image);
    }
    previewBatchRef.current = images;
  }, []);

  const clearPreviewBatch = useCallback(() => {
    for (const image of previewBatchRef.current) {
      revokeImageObjectUrl(image);
    }
    previewBatchRef.current = [];
  }, []);

  // Track and cleanup blob URLs
  useEffect(() => {
    const currentUrls = new Set<string>();
    if (previewUrl && previewUrl.startsWith("blob:")) currentUrls.add(previewUrl);
    if (front?.image.src.startsWith("blob:")) currentUrls.add(front.image.src);
    if (side?.image.src.startsWith("blob:")) currentUrls.add(side.image.src);
    frames.forEach(f => {
      if (f.image.src.startsWith("blob:")) currentUrls.add(f.image.src);
    });

    // Revoke any URL that is in trackedUrlsRef but NOT in currentUrls
    trackedUrlsRef.current.forEach(url => {
      if (!currentUrls.has(url)) {
        try { URL.revokeObjectURL(url); } catch {}
        trackedUrlsRef.current.delete(url);
      }
    });

    // Add new URLs to tracking
    currentUrls.forEach(url => trackedUrlsRef.current.add(url));
  }, [previewUrl, front, side, frames]);

  // Cleanup on unmount
  useEffect(() => {
    const trackedUrls = trackedUrlsRef.current;
    const previewBatch = previewBatchRef;
    return () => {
      for (const image of previewBatch.current) {
        revokeImageObjectUrl(image);
      }
      previewBatch.current = [];
      trackedUrls.forEach(url => {
        try { URL.revokeObjectURL(url); } catch {}
      });
      trackedUrls.clear();
    };
  }, []);

  // Hydrate saved Face Profile prefs on mount for returning users.
  useEffect(() => {
    const prefs = loadUserPrefs();
    setGender(prefs.gender);
    setAgeRange(prefs.ageRange);
    setGoal(prefs.goal);
    setAestheticReference(prefs.aestheticReference);
    setAnalysisConsent(prefs.analysisConsentVersion === ANALYSIS_CONSENT_VERSION);
    setImprovementConsent(prefs.improvementConsent);
    setPrefsLoaded(true);
  }, []);

  // Persist on change.
  useEffect(() => {
    if (prefsLoaded) {
      const next = {
        gender,
        ethnicity,
        ageRange,
        goal,
        aestheticReference,
        analysisConsentVersion: analysisConsent ? ANALYSIS_CONSENT_VERSION : null,
        improvementConsent,
      };
      saveUserPrefs(next);
      void syncUserProfile(next);
    }
  }, [
    aestheticReference,
    ageRange,
    analysisConsent,
    ethnicity,
    gender,
    goal,
    improvementConsent,
    prefsLoaded,
  ]);

  // Preload + dispose lifecycle for MediaPipe — see Phase 23 (dispose
  // on unmount) + Phase 37 (idle preload). Encapsulated in a hook so
  // every page that owns a `detectorRef` shares the same pattern.
  useMediaPipePreload(detectorRef);

  async function ensureDetector(): Promise<FaceMeshDetector> {
    if (detectorRef.current) return detectorRef.current;
    const d = await FaceMeshDetector.load();
    detectorRef.current = d;
    return d;
  }

  /**
   * Phase 138 → 147 — downscale + JPEG-encode the scanned photo for the
   * saved record. Falls through successively smaller sizes when the
   * larger ones fail (rare, but happens with very large source images
   * on memory-constrained devices). Returns null only when absolutely
   * nothing worked — so the rest of persist still runs.
   */
  function scanImageToDataUrl(img: HTMLImageElement): string | null {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w === 0 || h === 0) return null;
    // Try 800 first, fall back to 600 then 400. Each step halves the
    // encoded size; 400px is still recognizable enough to act as a
    // gallery thumbnail.
    for (const maxSide of [800, 600, 400]) {
      const scale = Math.min(1, maxSide / Math.max(w, h));
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      try {
        ctx.drawImage(img, 0, 0, tw, th);
        return canvas.toDataURL("image/jpeg", 0.82);
      } catch {
        // Try the next, smaller fallback.
        continue;
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return null;
  }

  async function detect(
    image: HTMLImageElement
  ): Promise<{ landmarks: Landmarks; blendshapes: import("@/types").Blendshapes | null } | null> {
    const detector = await ensureDetector();
    await yieldToPaint();
    return detector.detect(image);
  }

  function persist(
    scan: ScanResult,
    qualityOverride?: PhotoQualityReport | null,
    image?: HTMLImageElement | null
  ) {
    const q = qualityOverride !== undefined && qualityOverride !== null ? qualityOverride : qualityReport;
    // Phase 138 — capture a compact JPEG of the scanned photo so the
    // history page can render thumbnails and let the user revisit a
    // scan with the original image intact. We cap at ~800px on the
    // long side + JPEG quality 0.85 so 20 records stay inside quota.
    let photoDataUrl: string | undefined;
    if (image) {
      try {
        const captured = scanImageToDataUrl(image);
        if (captured) photoDataUrl = captured;
      } catch {
        // Best-effort — never let a thumbnail issue break persist.
      }
    }
    saveScan({
      timestamp: Date.now(),
      overall: scan.overall,
      tier: tierFor(scan.overall, scan.options.gender),
      categories: scan.categories,
      options: scan.options,
      views: scan.views,
      geometric: scan.geometric,
      secondOpinion: scan.secondOpinion,
      learned: scan.learned,
      quality: q
        ? { overall: q.overall, issueCount: q.issues.length }
        : undefined,
      // Phase 138 — preserve everything the AI produced so re-opening
      // a saved scan shows the same personalized note + advice
      // without burning another generation request.
      ...(photoDataUrl ? { photoDataUrl } : {}),
      ...(scan.aiReasoning ? { aiReasoning: scan.aiReasoning } : {}),
      ...(typeof scan.aiRawScore === "number"
        ? { aiRawScore: scan.aiRawScore }
        : {}),
      ...(typeof scan.aiConfidence === "number"
        ? { aiConfidence: scan.aiConfidence }
        : {}),
      ...(scan.aiSource ? { aiSource: scan.aiSource } : {}),
      ...(scan.aiPerceived ? { aiPerceived: scan.aiPerceived } : {}),
      ...(scan.aiAdvice && scan.aiAdvice.length > 0
        ? { aiAdvice: scan.aiAdvice }
        : {}),
      ...(scan.aiPotential ? { aiPotential: scan.aiPotential } : {}),
    });
  }

  // Phase 28/29 — async learned-attractiveness inference. Runs AFTER the
  // sync scan result is set so the UI is responsive; updates the result
  // when the model returns. Fails silently when the model file is
  // missing (the system gracefully degrades to Phase 27 geometric+S).
  // Phase 29 does a 6-pass ensemble so this can take 1-3s (WASM) or
  // 0.3-0.8s (WebGPU) — `learnedPending` drives the UI indicator.
  async function runLearnedInference(
    image: HTMLImageElement,
    landmarks: Landmarks,
    scan: ScanResult,
    quality?: PhotoQualityReport | null
  ): Promise<void> {
    if (scan.aiSource === "ai" || typeof scan.aiScore === "number") return;

    setLearnedPending(true);
    try {
      const learned = await predictAttractiveness(image, landmarks);
      if (learned === null) return;
      const reblended = applyLearnedBlend(scan, learned);
      setResult(reblended);
      persist(reblended, quality, image);
    } catch {
      // No-op — failure already logged in the inference layer.
    } finally {
      setLearnedPending(false);
    }
  }

  // Phase 112/113 — Gemini Flash Lite-led scoring. Called SYNCHRONOUSLY
  // inside handleFrontPhoto when an API key is present so the user
  // sees a single render with the AI verdict already applied (no 2-stage
  // "geometric first → AI updates" flash). Returns the reconciled scan
  // or the original on any failure.
  function toAiPhotoQualityContext(
    quality: PhotoQualityReport | null | undefined,
    scan: ScanResult
  ): AiScorePhotoQualityContext | undefined {
    if (!quality) return undefined;
    return {
      overall: quality.overall,
      scanConfidence: scan.confidence,
      issues: quality.issues.map((issue) => ({
        check: issue.check,
        severity: issue.severity,
        value: issue.value,
      })),
    };
  }

  function trackFaceProfileCreated(scan: ScanResult): void {
    if (faceProfileTrackedRef.current) return;
    faceProfileTrackedRef.current = true;
    void trackProductEvent("face_profile_created", {
      source: "scan",
      ageRange,
      gender,
      goal,
      aestheticReference,
      scoreBucket: scoreBucket(scan.overall),
      dayLabel: "day_1",
    });
  }

  function trackScanStarted(): void {
    void trackProductEvent("scan_started", {
      source: "scan",
      ageRange,
      gender,
      goal,
      aestheticReference,
    });
  }

  function trackScanCompleted(scan: ScanResult): void {
    void trackProductEvent("scan_completed", {
      source: "scan",
      ageRange,
      gender,
      goal,
      aestheticReference,
      scoreBucket: scoreBucket(scan.overall),
    });
  }

  async function applyAiScore(
    image: HTMLImageElement,
    scan: ScanResult,
    quality?: PhotoQualityReport | null
  ): Promise<{ scan: ScanResult; source: AiScoreSource }> {
    // Phase 158.13 → 158.28 — AI is always on. Returns the source of the
    // final score so OverallScore can render a proof-of-work badge.
    // `callGeminiScoreWithOutcome` re-throws QuotaExhaustedError so the
    // caller can surface a clear upgrade CTA instead of a silent
    // MediaPipe fallback.
    setAiError(null);
    const weakMetrics: WeakMetric[] = (
      Object.entries(scan.metrics) as Array<
        [MetricKey, NonNullable<ScanResult["metrics"][MetricKey]>]
      >
    )
      .filter(([, m]) => m && !m.flagged && (m.confidence ?? 1) >= 0.55)
      .sort((a, b) => a[1].score - b[1].score)
      .slice(0, 5)
      .map(([k, m]) => ({
        metric: k,
        raw: m.raw,
        score: m.score,
        ideal: m.ideal,
      }));

    const idToken = await getAccessToken();
    const photoQuality = toAiPhotoQualityContext(quality, scan);
    try {
      const outcome = await callGeminiScoreWithOutcome({
        image,
        gender: scan.options.gender,
        ethnicity: scan.options.ethnicity,
        profileContext: {
          goal,
          aestheticReference,
        },
        weakMetrics,
        // Phase 207 — AI analysis always in Thai regardless of UI lang toggle.
        // Thai users expect Thai text from Gemini even if they switched UI to EN.
        lang: "th",
        ...(photoQuality ? { photoQuality } : {}),
        ...(idToken ? { idToken } : {}),
      });

      if (outcome.source === "ai" && outcome.result) {
        return { scan: reconcileWithAi(scan, outcome.result, quality), source: "ai" };
      }
      return { scan, source: outcome.source };
    } catch (err) {
      // Phase 158.28 — Quota exhaustion → tell the user to upgrade
      // instead of silently degrading to MediaPipe. Score still renders
      // (with the fallback badge) so they can see SOMETHING, but the
      // banner above directs them at /upgrade.
      const msg = err instanceof Error ? err.message : "unknown";
      // Phase 190 — raw err detail logged for ops, but the user only
      // ever sees a friendly i18n message (or the quota upgrade copy).
      if (typeof console !== "undefined") {
        console.warn("[ScanFlow] AI step failed:", err);
      }
      // Phase 192u — quota-exhausted / premium-expired → open the app-level
      // paywall dialog (primary UX). The MediaPipe-only score still renders
      // so the user sees SOMETHING; the inline setAiError copy below stays
      // as a fallback for the rare case the gate didn't match the error.
      if (openGateFromError(err, openGate)) {
        return { scan, source: "fallback" };
      }
      if (msg.startsWith("quota-exhausted")) {
        setAiError(
          lang === "th"
            ? "สิทธิ์ประเมินหมดแล้ว — อัปเกรดเพื่อประเมินต่อได้ที่เมนู 'แพ็กเกจ'"
            : "Assessment quota reached — upgrade in 'Plans' to continue.",
        );
      } else {
        setAiError(null);
      }
      return { scan, source: "fallback" };
    }
  }

  // Phase 114 — split: handleFrontPhoto now just shows a PREVIEW with
  // a confirm button. The actual scan runs in runFrontScan() only after
  // the user explicitly confirms. Lets users replace bad shots before
  // burning compute / API quota.
  const handleFrontPhoto = useCallback((image: HTMLImageElement, source: ConsentCaptureSource = "camera") => {
    cancelActiveFrontRun();
    setFrontError(null);
    setCameraDenied(false);
    setCaptureSource(source);
    replacePreviewBatch([image]);
    setPreviewImage(image);
    trackScanCameraEvent(
      source === "camera" ? "scan_camera_captured" : "scan_album_captured"
    );
    // src may be a blob URL — keep a separate handle so we can revoke it
    // when the user picks a different photo.
    setPreviewUrl(image.src);
  }, [cancelActiveFrontRun, replacePreviewBatch, trackScanCameraEvent]);

  const handleFrontPhotoBatch = useCallback(
    (images: HTMLImageElement[]) => {
      const first = images[0];
      if (!first) return;
      cancelActiveFrontRun();
      setFrontError(null);
      setCameraDenied(false);
      setCaptureSource("camera");
      replacePreviewBatch(images);
      setPreviewImage(first);
      setPreviewUrl(first.src);
      trackScanCameraEvent("scan_camera_captured");
    },
    [cancelActiveFrontRun, replacePreviewBatch, trackScanCameraEvent]
  );

  const clearPreview = useCallback(() => {
    cancelActiveFrontRun();
    clearPreviewBatch();
    if (previewUrl && previewUrl.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {
        /* no-op */
      }
    }
    setPreviewImage(null);
    setPreviewUrl(null);
    setFrontError(null);
  }, [cancelActiveFrontRun, clearPreviewBatch, previewUrl]);

  const handleMinTimeReached = useCallback(() => {
    analysisMinReachedRef.current = true;
    setAnalysisMinReached(true);

    if (scanCompletedRef.current) {
      activeFrontRunIdRef.current = null;
      setFrontBusy(false);
    }
  }, [setFrontBusy]);

  useEffect(() => {
    if (hasReportAccess && showPaywall) {
      setShowPaywall(false);
    }
  }, [hasReportAccess, showPaywall]);

  async function runFrontScan(image: HTMLImageElement) {
    if (processingFrontRef.current) return;
    const runId = ++scanRunIdRef.current;
    setFrontError(null);
    setShowPaywall(false);
    setAnalysisMinReached(false);
    setScanCompleted(false);
    analysisMinReachedRef.current = false;
    scanCompletedRef.current = false;
    beginFrontRun(runId);
    trackScanStarted();
    setScanStage("model");
    
    try {
      const detector = await ensureDetector();
      if (finishIfStaleFrontRun(runId)) return;
      setScanStage("detecting");
      await yieldToPaint();
      if (finishIfStaleFrontRun(runId)) return;
      const detected = detector.detect(image);
      if (!detected) {
        setFrontError(t.scan.noFace);
        finishFrontRun(runId);
        return;
      }
      const { landmarks, blendshapes } = detected;
      setScanStage("computing");
      const photo: ScanPhoto = {
        image,
        landmarks,
        ...(blendshapes ? { blendshapes } : {}),
      };
      setFront(photo);
      setFrames([photo]);
      setFrameError(null);
      
      const sideLandmarks = side?.landmarks;
      const scan = computeAll(
        sideLandmarks
          ? { front: landmarks, side: sideLandmarks }
          : { front: landmarks },
        { gender, ethnicity }
      );
      const skin = analyzeSkin(image, landmarks);
      const blended: ScanResult = skin
        ? foldSkinIntoOverall(scan, skin)
        : foldSecondOpinion(scan);
        
      const report = assessPhotoQuality(image, landmarks, blended.pose, blendshapes);
      setQualityReport(report);
      setQualityDismissed(false);
      if (shouldRejectForScoring(report)) {
        setFront(null);
        setFrames([]);
        setResult(null);
        setAiSource(null);
        setScanStage("model");
        setFrontError(unreliablePhotoMessage);
        finishFrontRun(runId);
        return;
      }
      
      const enriched = foldQualityIntoConfidence(blended, report);

      if (hasReportAccess) {
        setAiSource(null);
        setScanStage("ai");
        await yieldToPaint();
        if (finishIfStaleFrontRun(runId)) return;

        const finalizeScan = (scanToPersist: ScanResult): void => {
          deferIdle(() => {
            try {
              persist(scanToPersist, report, image);
            } catch (err) {
              if (typeof console !== "undefined") {
                console.warn("[ScanFlow] deferred persist failed:", err);
              }
            }
          });
        };

        const { scan: finalScan, source } = await applyAiScore(image, enriched, report);
        if (finishIfStaleFrontRun(runId)) return;

        setAiSource(source);
        setResult(finalScan);
        trackFaceProfileCreated(finalScan);
        trackScanCompleted(finalScan);
        scanCompletedRef.current = true;
        setScanCompleted(true);
        setScanStage("done");
        finalizeScan(finalScan);

        if (!isFreeUser || analysisMinReachedRef.current) {
          finishFrontRun(runId);
        }

      } else {
        setAiSource(null);
        setResult(enriched);
        trackFaceProfileCreated(enriched);
        trackScanCompleted(enriched);
        scanCompletedRef.current = true;
        setScanCompleted(true);
        setScanStage("done");

        deferIdle(() => {
          try {
            persist(enriched, report, image);
          } catch (err) {
            if (typeof console !== "undefined") {
              console.warn("[ScanFlow] deferred persist failed:", err);
            }
          }
        });

        if (!isFreeUser || analysisMinReachedRef.current) {
          finishFrontRun(runId);
        }
      }

    } catch (e) {
      if (typeof console !== "undefined") {
        console.warn("[ScanFlow] front scan failed:", e);
      }
      if (openGateFromError(e, openGate)) {
        setFront(null);
        setFrames([]);
        setResult(null);
        setQualityReport(null);
        finishFrontRun(runId);
        return;
      }
      const rawMessage = e instanceof Error ? e.message : String(e);
      setFront(null);
      setFrames([]);
      setResult(null);
      setQualityReport(null);
      setFrontError(`${humanizeError(e, lang)} (${rawMessage})`);
      finishFrontRun(runId);
    }
  }

  async function runFrontScanBatch(images: HTMLImageElement[]) {
    const [first] = images;
    if (!first) return;
    if (images.length === 1) {
      await runFrontScan(first);
      return;
    }
    if (processingFrontRef.current) return;
    const runId = ++scanRunIdRef.current;
    setFrontError(null);
    setShowPaywall(false);
    setAnalysisMinReached(false);
    setScanCompleted(false);
    analysisMinReachedRef.current = false;
    scanCompletedRef.current = false;
    beginFrontRun(runId);
    trackScanStarted();
    setScanStage("model");

    try {
      await ensureDetector();
      if (finishIfStaleFrontRun(runId)) return;
      setScanStage("detecting");
      await yieldToPaint();
      if (finishIfStaleFrontRun(runId)) return;

      const validFrames: ScanPhoto[] = [];
      // Phase 636 — burst capture sends up to 8 frames now (was capped
      // at 5 for the older quick-retry burst); process the whole batch.
      for (const image of images.slice(0, 10)) {
        const detected = await detect(image);
        if (!detected) continue;
        const { landmarks, blendshapes } = detected;
        const frameScan = computeAll({ front: landmarks }, { gender, ethnicity });
        const frameReport = assessPhotoQuality(
          image,
          landmarks,
          frameScan.pose,
          blendshapes
        );
        if (shouldRejectForScoring(frameReport)) continue;
        validFrames.push({
          image,
          landmarks,
          ...(blendshapes ? { blendshapes } : {}),
        });
      }

      if (finishIfStaleFrontRun(runId)) return;
      if (validFrames.length === 0) {
        setFrontError(unreliablePhotoMessage);
        finishFrontRun(runId);
        return;
      }

      setScanStage("computing");
      // Phase 636 — drop frames whose pose jumped relative to the rest
      // of the burst (motion blur / mid-blink) before taking the
      // median, so a single bad frame can't even enter the pool.
      const surviving = rejectPoseOutlierFrames(validFrames);
      const averaged =
        surviving.length > 1
          ? medianLandmarks(surviving.map((frame) => frame.landmarks))
          : surviving[0]!.landmarks;
      const anchor = pickAnchorFrame(surviving) ?? surviving[0]!;
      setFront(anchor);
      setFrames(surviving);
      setFrameError(null);

      const sideLandmarks = side?.landmarks;
      const scan = computeAll(
        sideLandmarks
          ? { front: averaged, side: sideLandmarks }
          : { front: averaged },
        { gender, ethnicity }
      );
      const skin = analyzeSkin(anchor.image, averaged);
      const blended: ScanResult = skin
        ? foldSkinIntoOverall(scan, skin)
        : foldSecondOpinion(scan);
      const report = assessPhotoQuality(
        anchor.image,
        averaged,
        blended.pose,
        anchor.blendshapes
      );
      setQualityReport(report);
      setQualityDismissed(false);
      if (shouldRejectForScoring(report)) {
        setFront(null);
        setFrames([]);
        setResult(null);
        setAiSource(null);
        setScanStage("model");
        setFrontError(unreliablePhotoMessage);
        finishFrontRun(runId);
        return;
      }

      const enriched = foldQualityIntoConfidence(blended, report);

      if (hasReportAccess) {
        setAiSource(null);
        setScanStage("ai");
        await yieldToPaint();
        if (finishIfStaleFrontRun(runId)) return;

        const finalizeScan = (scanToPersist: ScanResult): void => {
          deferIdle(() => {
            try {
              persist(scanToPersist, report, anchor.image);
            } catch (err) {
              if (typeof console !== "undefined") {
                console.warn("[ScanFlow] deferred persist failed:", err);
              }
            }
          });
        };

        const { scan: finalScan, source } = await applyAiScore(
          anchor.image,
          enriched,
          report
        );
        if (finishIfStaleFrontRun(runId)) return;

        setAiSource(source);
        setResult(finalScan);
        trackFaceProfileCreated(finalScan);
        trackScanCompleted(finalScan);
        scanCompletedRef.current = true;
        setScanCompleted(true);
        setScanStage("done");
        finalizeScan(finalScan);

        if (!isFreeUser || analysisMinReachedRef.current) {
          finishFrontRun(runId);
        }
      } else {
        trackScanCompleted(enriched);
        scanCompletedRef.current = true;
        setScanCompleted(true);

        if (canShowReportPaywall && analysisMinReachedRef.current) {
          finishFrontRun(runId);
          setShowPaywall(true);
        }
      }
    } catch (e) {
      if (typeof console !== "undefined") {
        console.warn("[ScanFlow] front scan batch failed:", e);
      }
      if (openGateFromError(e, openGate)) {
        setFront(null);
        setFrames([]);
        setResult(null);
        setQualityReport(null);
        finishFrontRun(runId);
        return;
      }
      const rawMessage = e instanceof Error ? e.message : String(e);
      setFront(null);
      setFrames([]);
      setResult(null);
      setQualityReport(null);
      setFrontError(`${humanizeError(e, lang)} (${rawMessage})`);
      finishFrontRun(runId);
    }
  }

  async function handleAddFrame(image: HTMLImageElement) {
    if (processingFrameRef.current) {
      revokeImageObjectUrl(image);
      return;
    }
    if (frames.length >= 5) {
      revokeImageObjectUrl(image);
      return;
    }
    setFrameError(null);
    setFrameBusy(true);
    try {
      const detected = await detect(image);
      if (!detected) {
        revokeImageObjectUrl(image);
        setFrameError(t.scan.noFace);
        return;
      }
      const { landmarks, blendshapes } = detected;
      const frameScan = computeAll({ front: landmarks }, { gender, ethnicity });
      const frameQuality = assessPhotoQuality(image, landmarks, frameScan.pose, blendshapes);
      if (shouldRejectForScoring(frameQuality)) {
        revokeImageObjectUrl(image);
        setFrameError(unreliablePhotoMessage);
        return;
      }
      const next: ScanPhoto[] = [
        ...frames,
        { image, landmarks, ...(blendshapes ? { blendshapes } : {}) },
      ];
      const averaged = medianLandmarks(next.map((f) => f.landmarks));
      const anchor = pickAnchorFrame(next) ?? next[0]!;
      setFrames(next);
      setFront(anchor);
      const sideLandmarks = side?.landmarks;
      const scan = computeAll(
        sideLandmarks
          ? { front: averaged, side: sideLandmarks }
          : { front: averaged },
        { gender, ethnicity }
      );
      // Skin analysis on the latest image is fine — skin patches are
      // averaged INSIDE analyzeSkin via 4 sample sites; running it on
      // the most-front-facing anchor frame gives the most representative
      // skin reading.
      const skin = analyzeSkin(anchor.image, averaged);
      const enriched: ScanResult = skin
        ? foldSkinIntoOverall(scan, skin)
        : foldSecondOpinion(scan);
      setResult(enriched);
      // Phase 192h — L1 audit fix. Same defer pattern as runFrontScan —
      // persist() runs canvas.toDataURL + localStorage write, both of
      // which block the score paint when batched into the same render.
      // Learned inference re-sets result on completion so it's also
      // safe to defer.
      deferIdle(() => {
        try {
          persist(enriched, null, anchor.image);
        } catch (err) {
          if (typeof console !== "undefined") {
            console.warn("[ScanFlow] deferred persist failed:", err);
          }
        }
        void runLearnedInference(anchor.image, averaged, enriched);
      });
    } catch (e) {
      // Phase 190 — friendly i18n message; raw error in console for ops.
      if (typeof console !== "undefined") {
        console.warn("[ScanFlow] frame scan failed:", e);
      }
      // Phase 192u — route a quota/feature error to the paywall first.
      if (openGateFromError(e, openGate)) {
        revokeImageObjectUrl(image);
        return;
      }
      const rawMessage = e instanceof Error ? e.message : String(e);
      setFrameError(`${humanizeError(e, lang)} (${rawMessage})`);
      revokeImageObjectUrl(image);
    } finally {
      setFrameBusy(false);
    }
  }

  async function handleSidePhoto(image: HTMLImageElement) {
    if (processingSideRef.current) {
      revokeImageObjectUrl(image);
      return;
    }
    setSideError(null);
    setSideBusy(true);
    try {
      const detected = await detect(image);
      if (!detected) {
        revokeImageObjectUrl(image);
        setSideError(t.scan.noFace);
        return;
      }
      const { landmarks, blendshapes } = detected;
      const photo: ScanPhoto = {
        image,
        landmarks,
        ...(blendshapes ? { blendshapes } : {}),
      };
      setSide(photo);
      if (front) {
        const scan = computeAll(
          { front: front.landmarks, side: landmarks },
          { gender, ethnicity }
        );
        // Re-run skin analysis on the front image so we don't lose the
        // skin block when the side scan recomputes the result. Apply
        // skin-fold + second-opinion (Phase 27) so the side path doesn't
        // skip the blend.
        const skin = analyzeSkin(front.image, front.landmarks);
        const enriched: ScanResult = skin
          ? foldSkinIntoOverall(scan, skin)
          : foldSecondOpinion(scan);
        setResult(enriched);
        // Phase 192h — L1 audit fix. Same defer pattern — persist()
        // runs canvas.toDataURL + localStorage write which would
        // otherwise be batched into the same render that paints
        // setResult(enriched).
        const captured = { image: front.image, landmarks: front.landmarks };
        deferIdle(() => {
          try {
            persist(enriched, null, captured.image);
          } catch (err) {
            if (typeof console !== "undefined") {
              console.warn("[ScanFlow] deferred persist failed:", err);
            }
          }
          void runLearnedInference(captured.image, captured.landmarks, enriched);
        });
      }
    } catch (e) {
      // Phase 190 — friendly i18n message; raw error in console for ops.
      if (typeof console !== "undefined") {
        console.warn("[ScanFlow] side scan failed:", e);
      }
      // Phase 192u — route a quota/feature error to the paywall first.
      if (openGateFromError(e, openGate)) {
        revokeImageObjectUrl(image);
        return;
      }
      const rawMessage = e instanceof Error ? e.message : String(e);
      setSideError(`${humanizeError(e, lang)} (${rawMessage})`);
      revokeImageObjectUrl(image);
    } finally {
      setSideBusy(false);
    }
  }

  function reset() {
    scanRunIdRef.current++;
    activeFrontRunIdRef.current = null;
    cameraTelemetryRef.current.clear();
    setFront(null);
    setFrames([]);
    setSide(null);
    setResult(null);
    setFrontError(null);
    setSideError(null);
    setFrameError(null);
    setQualityReport(null);
    setQualityDismissed(false);
    setAiSource(null);
    setAiError(null);
    setIntakeMode("camera");
    setCameraOpen(true);
    setCameraAttempted(true);
    setCameraDenied(false);
    clearPreview();
    setScanStage("model");
    setShowPaywall(false);
    setScanCompleted(false);
    setAnalysisMinReached(false);
    setFrontBusy(false);
    setSideBusy(false);
    setFrameBusy(false);
    analysisMinReachedRef.current = false;
    scanCompletedRef.current = false;
    faceProfileTrackedRef.current = false;
    reportLockTrackedRef.current = false;
    introOfferViewedRef.current = false;
  }

  // Recompute (without persisting) when the user toggles gender after a scan.
  // The new score is not saved to history — only an actual new photo upload
  // adds a record. Avoids noisy history of calibration tweaks.
  //
  // Phase 114 — when AI was used on the original scan, the AI verdict
  // stays (it's not derived from calibration; Gemini saw the actual face).
  // We do recompute the geometric per-metric breakdown so users can see
  // how the geometric pipeline would score under different demographics,
  // but `overall` + `categories` + `aiScore` are preserved from the AI run.
  useEffect(() => {
    if (!front?.landmarks) return;
    // Phase 192p — wrap the recompute in startTransition so toggling
    // gender yields back to the UI thread instantly; the heavy
    // computeAll + analyzeSkin work runs as a low-priority React update.
    // The user sees the segmented button's active state flip immediately
    // even on low-end mobile where the recompute can cost 80-150ms.
    startTransition(() => {
      const frontLandmarks =
        frames.length > 1
          ? medianLandmarks(frames.map((f) => f.landmarks))
          : front.landmarks;
      const scan = computeAll(
        side?.landmarks
          ? { front: frontLandmarks, side: side.landmarks }
          : { front: frontLandmarks },
        { gender, ethnicity }
      );
      const skin = analyzeSkin(front.image, frontLandmarks);
      const enriched: ScanResult = skin
        ? foldSkinIntoOverall(scan, skin)
        : foldSecondOpinion(scan);
      if (result?.aiSource === "ai" && typeof result.aiScore === "number") {
        setResult({
          ...enriched,
          overall: result.aiScore,
          categories: result.categories,
          aiRawScore: result.aiRawScore,
          aiScore: result.aiScore,
          aiReasoning: result.aiReasoning,
          aiConfidence: result.aiConfidence,
          aiSource: "ai",
          aiPerceived: result.aiPerceived,
          aiAdvice: result.aiAdvice,
          aiPotential: result.aiPotential,
        });
        return;
      }
      setResult(enriched);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender]);

  const paywallVisible = showPaywall && canShowReportPaywall;
  const showIntake = !front && !previewImage && !processingFront && !paywallVisible;
  const showPreview = !!previewImage && !processingFront && !front && !paywallVisible;
  const showProgress = processingFront;
  const showResults = front && result && !processingFront && !paywallVisible;
  const mobileNavHidden =
    cameraOpen || processingFront || processingSide || processingFrame;

  // Phase 192p — memoize callbacks + composite objects passed down so
  // sub-components (CalibrationPicker, CategoryTabs, PhotoQualityBanner,
  // MultiFramePanel) can sit behind React.memo without thrashing on
  // every parent render. setState fns from useState are already stable
  // — we only memoize derived handlers and inline objects.
  const dismissQuality = useCallback(() => setQualityDismissed(true), []);
  const categoryScan = useMemo(
    () => (front ? { front, side: side ?? undefined } : null),
    [front, side]
  );
  function onConfirmScan() {
    if (!previewImage || processingFrontRef.current) return;
    if (!analysisConsent) {
      setFrontError(
        lang === "th"
          ? "กรุณายินยอมให้ Doodee วิเคราะห์ใบหน้าเพื่อสร้างรายงานส่วนตัวก่อนเริ่มสแกน"
          : "Please consent to face analysis before starting the scan."
      );
      return;
    }
    const batch =
      previewBatchRef.current.length > 0
        ? previewBatchRef.current
        : [previewImage];
    void runFrontScanBatch(batch);
  }

  const openCamera = useCallback(() => {
    setCameraAttempted(true);
    setCameraOpen(true);
    trackScanCameraEvent("scan_camera_opened", { reason: "manual" });
  }, [trackScanCameraEvent]);
  const closeCamera = useCallback(() => {
    setCameraAttempted(true);
    setCameraOpen(false);
    trackScanCameraEvent("scan_camera_closed", { reason: "manual" });
  }, [trackScanCameraEvent]);
  const handleCameraDenied = useCallback(() => {
    setCameraAttempted(true);
    setCameraDenied(true);
    setCameraOpen(false);
    trackScanCameraEvent("scan_camera_denied", { reason: "permission_denied" });
  }, [trackScanCameraEvent]);
  const setIntakeModeWithTelemetry = useCallback(
    (next: IntakeMode) => {
      if (next === "upload") {
        trackScanCameraEvent("scan_album_fallback_opened", {
          reason: cameraDenied ? "permission_denied" : "after_attempt",
        });
      }
      setIntakeMode(next);
    },
    [cameraDenied, trackScanCameraEvent]
  );

  const openIntroOffer = useCallback(() => {
    const state = ensureIntroOfferState();
    if (state.dismissed || state.clicked || state.expiresAt <= Date.now()) return;
    setIntroOfferError(null);
    setIntroOfferExpiresAt(state.expiresAt);
    setIntroOfferOpen(true);
    if (!introOfferViewedRef.current && result) {
      introOfferViewedRef.current = true;
      void trackProductEvent("intro_offer_viewed", {
        source: "scan",
        ageRange,
        gender,
        goal,
        aestheticReference,
        offer: "new_user_plus_29",
        scoreBucket: scoreBucket(result.overall),
      });
    }
  }, [aestheticReference, ageRange, gender, goal, result]);

  const dismissOffer = useCallback(() => {
    dismissIntroOffer();
    setIntroOfferError(null);
    setIntroOfferOpen(false);
    void trackProductEvent("intro_offer_dismissed", {
      source: "scan",
      ageRange,
      gender,
      goal,
      aestheticReference,
      offer: "new_user_plus_29",
      ...(result ? { scoreBucket: scoreBucket(result.overall) } : {}),
    });
  }, [aestheticReference, ageRange, gender, goal, result]);

  const unlockIntroOffer = useCallback(async () => {
    if (introOfferBusy) return;
    setIntroOfferBusy(true);
    setIntroOfferError(null);
    void trackProductEvent("intro_offer_clicked", {
      source: "scan",
      ageRange,
      gender,
      goal,
      aestheticReference,
      offer: "new_user_plus_29",
      ...(result ? { scoreBucket: scoreBucket(result.overall) } : {}),
    });
    const checkout = await openCheckout("plus", "promptpay", {
      offer: "new_user_plus_29",
    });
    if (checkout === "checkout") {
      markIntroOfferClicked();
      return;
    }
    if (checkout === "offer-ineligible") {
      window.location.href = hasFullReportAccess
        ? "/history?journal=1"
        : "/upgrade";
      return;
    }
    setIntroOfferError("payment-unavailable");
    setIntroOfferBusy(false);
  }, [
    aestheticReference,
    ageRange,
    gender,
    hasFullReportAccess,
    goal,
    introOfferBusy,
    result,
  ]);

  useEffect(() => {
    if (!showResults || hasFullReportAccess || !result) return;
    const timer = window.setTimeout(openIntroOffer, INTRO_OFFER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hasFullReportAccess, openIntroOffer, result, showResults]);

  useEffect(() => {
    if (!showResults || hasFullReportAccess || !result) return;
    if (reportLockTrackedRef.current) return;
    reportLockTrackedRef.current = true;
    void trackProductEvent("report_lock_viewed", {
      source: "scan",
      ageRange,
      gender,
      goal,
      aestheticReference,
      scoreBucket: scoreBucket(result.overall),
    });
  }, [
    aestheticReference,
    ageRange,
    gender,
    goal,
    hasFullReportAccess,
    result,
    showResults,
  ]);

  useEffect(() => {
    if (!showIntake || intakeMode !== "camera" || !cameraOpen) return;
    trackScanCameraEvent("scan_camera_opened", { reason: "auto" });
  }, [cameraOpen, intakeMode, showIntake, trackScanCameraEvent]);

  return (
    // Phase 192t — pb-bottom-nav clears the fixed MobilePricingNav (<lg)
    // so the confirm-screen action row in normal flow never hides under
    // it; collapses to 0 at lg+ where the sidebar replaces the nav.
    <div
      data-mobile-nav-hidden={mobileNavHidden ? "true" : undefined}
      className={`scan-mobile-first w-full max-w-full min-w-0 pb-bottom-nav ${hideIntro ? "space-y-4" : "space-y-4 sm:space-y-10"}`}
    >
      {!hideIntro && (
        <div className="text-center space-y-1.5 sm:space-y-3">
          <h1 className="font-serif italic font-light text-[2.15rem] leading-none sm:text-4xl md:text-5xl">
            {t.scan.title}
          </h1>
          <p className="hidden text-muted text-sm sm:block">{t.scan.subtitle}</p>
        </div>
      )}

      {(showPreview || showResults) && (
        <CalibrationPicker
          gender={gender}
          onGender={setGender}
        />
      )}

      {aiError && (
        <div
          role="alert"
          aria-live="assertive"
          className="mx-auto flex max-w-2xl items-start gap-3 rounded-2xl border border-warn/40 bg-warn/[0.06] px-4 py-3 text-sm"
        >
          <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-warn/20 text-[10px] font-bold text-warn">
            !
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-warn">
              {lang === "th"
                ? "การประเมินเพิ่มเติมไม่พร้อมใช้งาน — แสดงผลจากโมเดลใบหน้าในเครื่อง"
                : "Additional review unavailable - showing on-device face analysis."}
            </p>
            <p className="mt-1 break-words text-[11px] text-warn/80">
              {lang === "th" ? "รายละเอียด" : "Details"}:{" "}
              <span className="font-mono">{aiError}</span>
            </p>
            <p className="mt-1 text-[11px] text-[#6a6259]">
              {lang === "th"
                ? "การสแกนครั้งนี้อาจถูกนับในโควต้าแล้ว"
                : "This scan may already count toward your quota."}
            </p>
          </div>
        </div>
      )}

      {showIntake && (
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <ScanHudFrame>
            <div className="relative z-10 mx-auto w-full max-w-[560px] min-w-0">
              <CameraFirstIntake
                mode={intakeMode}
                cameraOpen={cameraOpen}
                cameraAttempted={cameraAttempted}
                cameraDenied={cameraDenied}
                disabled={processingFront}
                onMode={setIntakeModeWithTelemetry}
                onOpenCamera={openCamera}
                onCloseCamera={closeCamera}
                onCameraDenied={handleCameraDenied}
                onPhoto={handleFrontPhoto}
                onPhotoBatch={handleFrontPhotoBatch}
                onError={setFrontError}
                poseSequence={
                  GUIDED_POSE_CAPTURE_ENABLED ? GUIDED_POSE_SEQUENCE : undefined
                }
              />
            </div>
          </ScanHudFrame>
          {frontError && (
            // Phase 192n — Upload/scan errors fire AFTER mount on async
            // failure. Without role="alert" + aria-live="assertive" the
            // bare <p> is silent to VoiceOver / NVDA, so a blind user
            // taps "scan", waits, and gets no feedback that anything
            // failed. aria-describedby is intentionally NOT wired here:
            // the error refers to the whole PhotoUpload (multiple
            // buttons/inputs), not a single owning control, so the
            // assertive live-region announcement is the right pattern.
            <p
              role="alert"
              aria-live="assertive"
              className="mx-auto max-w-2xl rounded-2xl border border-[#f59e0b]/30 bg-[#2a1806] px-4 py-3 text-center text-sm font-medium text-[#fde68a]"
            >
              {frontError}
            </p>
          )}
        </m.div>
      )}

      {showPreview && previewImage && previewUrl && (
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <ScanHudFrame compact>
            <div className="relative z-10 flex w-full flex-col items-center gap-4">
              <div className="text-center">
                {/* Phase 192f — pre-scan review copy from i18n dict. */}
                <p className="text-sm font-semibold text-[#241f1a] dark:text-white">
                  {t.scanConfirm.reviewBeforeScan}
                </p>
                <p className="mt-1 text-xs text-[#5f574f] dark:text-white/62">
                  {t.scanConfirm.lookStraight}
                </p>
              </div>
              {/* Phase 192t — viewport-relative height so the captured
                  preview, heading, and action buttons all fit within
                  100dvh minus the bottom nav without scrolling. Was a
                  fixed h-[290px]/sm:h-[330px] that, stacked under the upload
                  min-h + heading + buttons, pushed the action row into the
                  fixed nav zone on phones. max-h caps it; object-contain on
                  the <img> preserves aspect ratio. */}
              <div className="relative mx-auto flex h-[42dvh] max-h-[330px] min-h-[200px] w-full max-w-[380px] min-w-0 items-center justify-center overflow-hidden rounded-2xl border border-[#241f1a]/10 bg-white/70 shadow-[0_20px_48px_-38px_rgba(36,31,26,0.3)] dark:border-[#263149] dark:bg-[#0b1020] dark:shadow-[0_20px_48px_-38px_rgba(0,0,0,0.78)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="preview"
                  className="h-full w-full object-contain"
                />
              </div>
              <ScanConsentGate
                analysisConsent={analysisConsent}
                improvementConsent={improvementConsent}
                onAnalysisConsent={setAnalysisConsent}
                onImprovementConsent={setImprovementConsent}
              />
              <div className="flex w-full max-w-full flex-wrap items-center justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={clearPreview}
                  className="min-h-[44px] gap-1.5 border-[#241f1a]/12 bg-white/70 text-[#4b423a] shadow-[0_10px_28px_-24px_rgba(36,31,26,0.28)] hover:border-[#06b6d4]/40 hover:bg-white hover:text-[#241f1a] dark:border-[#263149] dark:bg-[#0b1020] dark:text-white/72 dark:shadow-[0_10px_28px_-24px_rgba(0,0,0,0.72)] dark:hover:bg-[#11182b] dark:hover:text-white"
                >
                  <X className="h-4 w-4" />
                  {/* Phase 192f */}
                  {t.scanConfirm.changePhoto}
                </Button>
                <Button
                  size="lg"
                  onClick={onConfirmScan}
                  disabled={!analysisConsent}
                  className="min-h-[44px] gap-1.5 bg-[#241f1a] font-medium text-white shadow-[0_18px_36px_-24px_rgba(36,31,26,0.65)] hover:bg-[#342d27]"
                >
                  <Check className="h-4 w-4" />
                  {/* Phase 206 — swap to retryScan copy when an error is
                      active so the user knows the button retries, not just
                      confirms a photo they've already tried scanning. */}
                  {frontError ? t.scanConfirm.retryScan : t.scanConfirm.confirmScan}
                </Button>
              </div>
            </div>
          </ScanHudFrame>
          <div className="mx-auto flex max-w-md flex-col items-center gap-4">
            {frontError && (
              // Phase 192n — Async detect/AI errors must reach screen
              // readers via role="alert" + aria-live="assertive";
              // otherwise the confirm-scan button looks broken to
              // anyone not watching the screen.
              <p
                role="alert"
                aria-live="assertive"
                className="rounded-2xl border border-[#f59e0b]/30 bg-[#2a1806] px-4 py-3 text-center text-sm font-medium text-[#fde68a]"
              >
                {frontError}
              </p>
            )}
          </div>
        </m.div>
      )}

      {showProgress && (
        <AnalysisSteps
          scanStage={scanStage}
          isFreeUser={isFreeUser}
          onMinTimeReached={handleMinTimeReached}
          onCancel={reset}
        />
      )}

      {paywallVisible && (
        <ScanPaywall
          onUnlockClick={openIntroOffer}
          onCancel={reset}
        />
      )}

      {showResults && front && result && (
        <m.div
          className="space-y-10 pt-6 sm:pt-8"
          initial="hidden"
          animate="visible"
          variants={RESULT_STACK_REVEAL}
        >
          {qualityReport && !qualityDismissed && (
            <m.div variants={REVEAL}>
              <PhotoQualityBanner
                report={qualityReport}
                onRetake={reset}
                onDismiss={dismissQuality}
              />
            </m.div>
          )}
          <m.div variants={RESULT_HERO_REVEAL}>
            <ResultTeaser
              result={result}
              locked={!hasFullReportAccess}
              onUnlock={openIntroOffer}
            />
          </m.div>
          <m.div variants={RESULT_HERO_REVEAL}>
            <OverallScore
              result={result}
              learnedPending={learnedPending}
              aiSource={aiSource}
            />
          </m.div>
          {hasFullReportAccess ? (
            <>
          {/* Phase 158.5 — shareable Face Card (big photo + score +
              watermark, downloadable as 1080x1920 PNG). Lives above the
              landmark canvas so the score block reads first. */}
          <m.div variants={RESULT_HERO_REVEAL}>
            <div className="scan-complete-pop">
              <FaceCard
                image={front.image}
                overall={result.overall}
                tier={tierFor(result.overall, result.options.gender)}
                categories={result.categories}
              />
            </div>
          </m.div>
          <m.div variants={REVEAL}>
            <ConsentCalibrationCard
              result={result}
              quality={qualityReport}
              source={captureSource}
            />
          </m.div>
          <m.div variants={REVEAL} className="flex flex-col items-center gap-4">
            <LandmarkCanvas
              image={front.image}
              landmarks={front.landmarks}
              maxWidth={640}
            />
            <AnnotatedFaceDownload scan={front} result={result} />
          </m.div>

          {/* Phase 158.12 — restore multi-frame averaging panel. */}
          <m.div variants={REVEAL}>
            <MultiFramePanel
              frames={frames.length > 0 ? frames : [front]}
              processing={processingFrame}
              error={frameError}
              onAdd={handleAddFrame}
            />
          </m.div>

          {/* Phase 158.12 — restore side-profile upload. handleSidePhoto
              still lives in ScanFlow but its UI was removed during the
              cockpit refactor. Lets users unlock side-view metrics
              (nose tip angle, philtrum-length, etc.). */}
          <m.div variants={REVEAL}>
            {!side ? (
              <div className="space-y-4 rounded-2xl border border-[#241f1a]/10 bg-white/82 p-4 text-[#241f1a] shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] dark:border-[#263149] dark:bg-[#070b1a] dark:text-white dark:shadow-[0_18px_46px_-38px_rgba(0,0,0,0.72)] sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-[#0f6f7f] font-bold">
                        {t.scan.addSideTitle}
                      </p>
                      <p className="text-sm text-[#5f574f] dark:text-white/62">
                        {t.scan.addSideDescription}
                      </p>
                    </div>
                    <span className="max-w-full rounded-full border border-[#06b6d4]/25 bg-[#052b36] px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-[#67e8f9]">
                      {t.scan.addSideBadge}
                    </span>
                  </div>
                  <PhotoUpload
                    onPhoto={handleSidePhoto}
                    onError={setSideError}
                    disabled={processingSide}
                    promptText={t.scan.dropSide}
                  />
                  {processingSide && (
                    <div className="flex items-center gap-2 text-sm text-[#5f574f] dark:text-white/62">
                      <Loader2 className="h-4 w-4 animate-spin text-[#67e8f9]" />
                      <span>
                        {lang === "th"
                          ? "กำลังตรวจรูปด้านข้าง..."
                          : "Checking side photo..."}
                      </span>
                    </div>
                  )}
                  {sideError && (
                    // Phase 192n — Side-profile upload async errors
                    // need the same a11y treatment as the front-photo
                    // sites: announce via role="alert" + assertive
                    // live region so blind users hear "no face" or
                    // network-fail copy instead of nothing.
                    <p
                      role="alert"
                      aria-live="assertive"
                      className="text-bad text-sm"
                    >
                      {sideError}
                    </p>
                  )}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#06b6d4]/25 bg-[#052b36] px-5 py-3 shadow-[0_14px_34px_-28px_rgba(0,0,0,0.72)]">
                <Check className="h-4 w-4 text-[#67e8f9]" />
                <p className="text-sm font-medium text-[#67e8f9]">{t.scan.sideAdded}</p>
              </div>
            )}
          </m.div>

          <m.div variants={REVEAL} id="scan-report">
            {categoryScan && (
              <CategoryTabs result={result} scan={categoryScan} />
            )}
          </m.div>

          {result.skin && (
            <m.div variants={REVEAL}>
              <SkinPanel skin={result.skin} />
            </m.div>
          )}

          {/* Phase 122 + 124 — personalized AI advice reorganized into a
              90-day roadmap by difficulty (now / lifestyle / long-term).
              Only renders when aiAdvice is present (Gemini was called with
              weakMetrics during the scan). */}
          {result.aiAdvice && result.aiAdvice.length > 0 && (
            <m.div variants={REVEAL}>
              <RoadmapCard result={result} />
            </m.div>
          )}
          <m.div variants={REVEAL}>
            <AiSummaryCard result={result} quality={qualityReport} />
          </m.div>

          {/* Phase 158.5 — surgery preview was moved out of the scan
              flow to its own /surgery surface. The scan page now
              focuses on score + breakdown only; this CTA points users
              who want to play with procedures to the dedicated page. */}
          <m.div variants={REVEAL}>
            <SurgeryCta />
          </m.div>

          <m.div
            variants={REVEAL}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            <Button variant="outline" onClick={reset}>
              {t.scan.scanAnother}
            </Button>
            <ReportDownloadButton
              record={buildEphemeralRecord(result, front.image, qualityReport)}
              size="default"
            />
            <CopyResultJson result={result} />
          </m.div>
            </>
          ) : (
            <m.div variants={REVEAL}>
              <LockedReportCard onUnlock={openIntroOffer} />
            </m.div>
          )}
        </m.div>
      )}
      <IntroOfferDialog
        open={introOfferOpen}
        expiresAt={introOfferExpiresAt}
        busy={introOfferBusy}
        error={introOfferError}
        onUnlock={unlockIntroOffer}
        onDismiss={dismissOffer}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) dismissOffer();
        }}
      />
    </div>
  );
}

export const IntroOfferDialog = memo(function IntroOfferDialog({
  open,
  expiresAt,
  busy,
  error,
  onUnlock,
  onDismiss,
  onOpenChange,
}: {
  open: boolean;
  expiresAt: number | null;
  busy: boolean;
  error: "payment-unavailable" | null;
  onUnlock: () => void;
  onDismiss: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { lang } = useT();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const remaining = Math.max(0, (expiresAt ?? now) - now);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="intro-offer-dialog theme-locked-dark max-w-md gap-0 overflow-hidden border-[#263149] bg-[#050816] p-0 text-white shadow-[0_34px_92px_rgba(0,0,0,0.84)]">
        <div className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
          <div className="space-y-2 pr-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#06b6d4]/25 bg-[#06b6d4]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#67e8f9]">
              <Clock3 className="h-3 w-3" />
              {lang === "th" ? "ข้อเสนอผู้ใช้ใหม่" : "New User Offer"}
            </span>
            <DialogTitle className="font-serif text-[1.55rem] font-light italic leading-[1.05] sm:text-3xl">
              {lang === "th"
                ? "รายงานเต็มพร้อมปลดล็อกแล้ว"
                : "Want your personal look plan?"}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-white/68">
              {lang === "th"
                ? "คุณเห็น teaser แล้ว ถ้าต้องการอ่านแผนเต็ม ปลดล็อก Plus 30 วันในราคาเปิดตัว 29 บาท"
                : "Your full report is ready. Unlock the personal plan, image previews, and first starting point."}
            </DialogDescription>
          </div>
          <div className="mt-5 rounded-2xl border border-[#263149] bg-[#0b1020] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <span className="inline-flex items-center rounded-full border border-[#a855f7]/25 bg-[#22133b] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#c4b5fd]">
                  {lang === "th" ? "ลด 80%" : "80% off"}
                </span>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/48">
                    {lang === "th" ? "Plus 30 วัน" : "Plus - 30 days"}
                  </p>
                  <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                    <p className="text-[2.35rem] font-semibold leading-none tracking-normal text-white">
                      {lang === "th" ? "29 บาท" : "฿29"}
                    </p>
                    <p className="pb-1 text-sm font-medium text-white/48">
                      <span className="line-through">
                        {lang === "th" ? "ปกติ 149 บาท" : "฿149"}
                      </span>
                    </p>
                  </div>
                  <p className="text-xs font-medium text-white/58">
                    {lang === "th"
                      ? "จ่ายครั้งเดียว ไม่ใช่รายเดือน"
                      : "One-time access, not monthly"}
                  </p>
                </div>
              </div>
              <div className="shrink-0 rounded-xl border border-[#06b6d4]/30 bg-[#052b36] px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#67e8f9]">
                  {lang === "th" ? "เหลือเวลา" : "Ends in"}
                </p>
                <p className="font-mono text-lg font-bold text-white">{timeLabel}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-white/74">
              {(lang === "th"
                ? [
                    "Full Personal Face Report",
                    "แผนปรับลุคส่วนตัว 7 วัน / 30 วัน",
                    "จุดที่ควรเริ่มก่อน พร้อมบริบทก่อนคุยคลินิก",
                    "Face Journal Day 1 / Day 7 / Day 30",
                  ]
                : [
                    "Full Personal Face Report",
                    "7-day and 30-day plan",
                    "Preview a look that fits you better",
                    "Face Journal Day 1 / Day 7 / Day 30",
                  ]
              ).map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-[#67e8f9]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-[#f59e0b]/30 bg-[#2a1806] px-3 py-2 text-sm text-[#fde68a]"
            >
              {lang === "th"
                ? "ยังเปิดหน้าชำระเงินไม่ได้ ลองอีกครั้ง หรือแจ้งแอดมินให้ตรวจ Stripe/PromptPay"
                : "Checkout could not open. Try again or ask support to check Stripe/PromptPay."}
            </div>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onUnlock}
              disabled={busy || remaining <= 0}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#050816] shadow-[0_0_40px_rgba(168,85,247,0.32)] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/45 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "th"
                ? "ปลดล็อก Plus 30 วัน - 29 บาท"
                : "Unlock Plus - ฿29"}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 bg-[#0b1020] px-5 text-sm font-medium text-white/72 transition hover:bg-[#11182b] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/45"
            >
              {lang === "th" ? "ไว้ทีหลัง" : "Later"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

// Phase 620 — guided 4-pose live scan (มองตรง → หันซ้าย → หันขวา →
// เงยหน้า). Implemented and unit-tested (see face-guide.test.ts +
// CameraCapture's poseSequence wiring), but kept OFF by default until
// it gets a real-device QA pass (iOS Safari + Android Chrome) — the
// existing single-pose `autoCapture` burst is hardened against a long
// history of mobile camera quirks that a new capture UI risks
// reintroducing. Flip to `true` once that pass is done.
const GUIDED_POSE_CAPTURE_ENABLED = false;
const GUIDED_POSE_SEQUENCE: PoseTarget[] = ["front", "left", "right", "up"];

export const CameraFirstIntake = memo(function CameraFirstIntake({
  mode,
  cameraOpen,
  cameraAttempted,
  cameraDenied,
  disabled,
  onMode,
  onOpenCamera,
  onCloseCamera,
  onCameraDenied,
  onPhoto,
  onPhotoBatch,
  onError,
  poseSequence,
}: {
  mode: IntakeMode;
  cameraOpen: boolean;
  cameraAttempted: boolean;
  cameraDenied: boolean;
  disabled: boolean;
  onMode: (mode: IntakeMode) => void;
  onOpenCamera: () => void;
  onCloseCamera: () => void;
  onCameraDenied: () => void;
  onPhoto: (image: HTMLImageElement, source: ConsentCaptureSource) => void;
  onPhotoBatch?: (images: HTMLImageElement[]) => void;
  onError: (message: string) => void;
  // Phase 620 — guided 4-pose live scan (front/left/right/up), opt-in
  // via the caller. Undefined preserves the existing single-pose
  // `autoCapture` burst behavior untouched.
  poseSequence?: PoseTarget[];
}) {
  const { lang } = useT();

  if (mode === "upload") {
    return (
      <div className="space-y-3">
        <PhotoUpload
          onPhoto={(image) => onPhoto(image, "album")}
          onError={onError}
          disabled={disabled}
          cameraShortcut={false}
          promptText={
            lang === "th"
              ? "เลือกรูปหน้าตรงจากอัลบั้ม"
              : "Choose a front-facing photo from your album"
          }
          variant="panel"
        />
        <button
          type="button"
          onClick={() => onMode("camera")}
          disabled={disabled}
          className="mx-auto flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#241f1a]/12 bg-white/70 px-4 text-xs font-semibold text-[#4b423a] transition hover:border-[#06b6d4]/40 hover:bg-white hover:text-[#241f1a] disabled:pointer-events-none disabled:opacity-50 dark:border-[#263149] dark:bg-[#0b1020] dark:text-white/72 dark:hover:bg-[#11182b] dark:hover:text-white"
        >
          <Camera className="h-3.5 w-3.5" />
          {lang === "th" ? "ใช้กล้องแทน" : "Use camera instead"}
        </button>
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[520px] overflow-hidden rounded-[1.75rem] border border-[#241f1a]/10 bg-white/82 p-5 text-center text-[#241f1a] shadow-[0_24px_64px_-40px_rgba(36,31,26,0.34)] backdrop-blur-md dark:border-[#263149] dark:bg-[#070b1a] dark:text-white dark:shadow-[0_24px_64px_-40px_rgba(0,0,0,0.88)] sm:p-7">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#0f6f7f]/30 to-transparent"
      />
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#06b6d4]/25 bg-[#052b36] text-[#67e8f9] shadow-[0_18px_36px_-28px_rgba(6,182,212,0.55)]">
        {cameraDenied ? <ImagePlus className="h-6 w-6" /> : <Camera className="h-6 w-6" />}
      </div>
      <h2 className="mt-4 text-xl font-semibold text-[#241f1a] dark:text-white">
        {cameraDenied
          ? lang === "th"
            ? "เปิดกล้องไม่ได้"
            : "Camera unavailable"
          : lang === "th"
            ? "เริ่มจากกล้องเพื่อคุณภาพที่แม่นกว่า"
            : "Start with camera for a cleaner scan"}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#5f574f] dark:text-white/64">
        {cameraDenied
          ? lang === "th"
            ? "คุณยังสามารถเลือกรูปหน้าตรงเพื่อวิเคราะห์ได้"
            : "You can still choose a front-facing photo for analysis."
          : lang === "th"
            ? "DOODEE ใช้กล้องเพื่อสแกนใบหน้าแบบเรียลไทม์ ภาพใช้เพื่อวิเคราะห์เท่านั้น"
            : "DOODEE uses your camera for real-time face framing. The photo is used for analysis only."}
      </p>
      <div className="mt-5 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
        <Button
          type="button"
          onClick={cameraDenied ? () => onMode("upload") : onOpenCamera}
          disabled={disabled}
          className="scan-primary-cta h-12 w-full max-w-[260px] gap-2 rounded-xl border border-[#06b6d4]/30 bg-[#052b36] px-5 text-sm font-semibold text-white shadow-[0_16px_34px_-26px_rgba(6,182,212,0.55)] hover:bg-[#063544] disabled:bg-[#052b36]/95 disabled:opacity-95"
        >
          {cameraDenied ? <ImagePlus className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {cameraDenied
            ? lang === "th"
              ? "เลือกรูปจากอัลบั้ม"
              : "Choose from album"
            : lang === "th"
              ? "เปิดกล้องเพื่อเริ่มสแกน"
              : "Open camera to start"}
        </Button>
        {(cameraDenied || cameraAttempted) && (
          <Button
            type="button"
            variant="outline"
            onClick={cameraDenied ? onOpenCamera : () => onMode("upload")}
            disabled={disabled}
            className="h-11 w-full max-w-[260px] gap-2 rounded-xl border-[#241f1a]/12 bg-white/70 px-5 text-xs font-semibold text-[#4b423a] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.28)] hover:border-[#06b6d4]/40 hover:bg-white hover:text-[#241f1a] dark:border-[#263149] dark:bg-[#0b1020] dark:text-white/72 dark:shadow-[0_10px_24px_-22px_rgba(0,0,0,0.72)] dark:hover:bg-[#11182b] dark:hover:text-white"
          >
            {cameraDenied ? <Camera className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
            {cameraDenied
              ? lang === "th"
                ? "ลองเปิดกล้องอีกครั้ง"
                : "Try camera again"
              : lang === "th"
                ? "เลือกรูปจากอัลบั้มแทน"
                : "Choose from album instead"}
          </Button>
        )}
      </div>
      <CameraCapture
        open={cameraOpen}
        autoCapture={!poseSequence}
        // Phase 636 — burst-capture standard: ~1-2s of frames, median
        // (not mean) across the survivors. 8 frames × 180ms ≈ 1.4s.
        autoCaptureFrameCount={8}
        autoCaptureIntervalMs={180}
        poseSequence={poseSequence}
        onClose={onCloseCamera}
        onPermissionDenied={onCameraDenied}
        onCapture={(image) => onPhoto(image, "camera")}
        onCaptureBatch={(images) => {
          if (onPhotoBatch) {
            onPhotoBatch(images);
            return;
          }
          const first = images[0];
          if (first) onPhoto(first, "camera");
        }}
        onSequenceComplete={(frames: SequenceFrames) => {
          // frames.front is the required primary capture; left/right/up
          // are optional support frames — averaging (Phase 21) already
          // handles a partial set the same way it handles a burst where
          // some frames failed detection.
          const ordered = [
            frames.front,
            frames.left,
            frames.right,
            frames.up,
          ].filter((img): img is HTMLImageElement => !!img);
          if (ordered.length === 0) return;
          if (onPhotoBatch) {
            onPhotoBatch(ordered);
            return;
          }
          onPhoto(ordered[0]!, "camera");
        }}
      />
    </div>
  );
});

const categoryFocusLabel: Record<string, { th: string; en: string }> = {
  harmony: { th: "ความสมดุล", en: "harmony" },
  angularity: { th: "โครงหน้า", en: "facial structure" },
  dimorphism: { th: "ลักษณะเฉพาะเพศ", en: "facial character" },
  "eye-area": { th: "บริเวณดวงตา", en: "eye area" },
  features: { th: "จุดเด่นใบหน้า", en: "features" },
  symmetry: { th: "ความสมมาตร", en: "symmetry" },
};

const teaserFocusLabel: Record<string, { th: string; en: string }> = {
  ...categoryFocusLabel,
  skin: { th: "ผิว", en: "skin" },
  hair: { th: "ทรงผม", en: "hair" },
  face_balance: { th: "สมดุลใบหน้า", en: "facial balance" },
  pre_clinic: { th: "เตรียมคุยคลินิก", en: "clinic prep" },
  overall: { th: "ลุครวม", en: "overall look" },
};

function teaserMetricLabel(value: string, lang: "th" | "en"): string {
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return teaserFocusLabel[key]?.[lang] ?? value.replace(/[_-]+/g, " ");
}

export const ScanConsentGate = memo(function ScanConsentGate({
  analysisConsent,
  improvementConsent,
  onAnalysisConsent,
  onImprovementConsent,
}: {
  analysisConsent: boolean;
  improvementConsent: boolean;
  onAnalysisConsent: (value: boolean) => void;
  onImprovementConsent: (value: boolean) => void;
}) {
  const { lang } = useT();
  return (
    <div className="w-full max-w-[520px] space-y-2 rounded-2xl border border-[#241f1a]/10 bg-white/82 p-4 text-left text-[#241f1a] shadow-[0_16px_36px_-30px_rgba(36,31,26,0.3)] dark:border-[#263149] dark:bg-[#070b1a] dark:text-white dark:shadow-[0_16px_36px_-30px_rgba(0,0,0,0.72)]">
      <label className="flex items-start gap-3 text-sm font-medium text-[#241f1a] dark:text-white/84">
        <input
          type="checkbox"
          checked={analysisConsent}
          onChange={(e) => onAnalysisConsent(e.target.checked)}
          className="mt-1 h-4 w-4 accent-[#06b6d4]"
        />
        <span>
          {lang === "th"
            ? "ฉันยินยอมให้ Doodee วิเคราะห์ใบหน้าเพื่อสร้างรายงานส่วนตัว"
            : "I consent to Doodee analyzing my face to create a personal report"}
        </span>
      </label>
      <label className="flex items-start gap-3 text-xs text-[#5f574f] dark:text-white/62">
        <input
          type="checkbox"
          checked={improvementConsent}
          onChange={(e) => onImprovementConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#0f6f7f]"
        />
        <span>
          {lang === "th"
            ? "ยินยอมให้ใช้ข้อมูลแบบไม่ระบุตัวตนเพื่อปรับปรุงระบบ"
            : "Allow anonymized data to improve the system"}
        </span>
      </label>
      <p className="text-[11px] leading-relaxed text-[#6a6259] dark:text-white/48">
        {lang === "th"
          ? "รูปหน้าตรง, landmark ดิบ, และ Face Journal photo จะไม่ถูกอัปโหลดโดยค่าเริ่มต้น"
          : "Raw face photos, raw landmarks, and Face Journal photos are not uploaded by default."}
      </p>
    </div>
  );
});

export const LockedReportCard = memo(function LockedReportCard({
  onUnlock,
}: {
  onUnlock: () => void;
}) {
  const { lang } = useT();
  const items =
    lang === "th"
      ? [
          "Full Personal Face Report",
          "แผนปรับลุคส่วนตัว 7 วัน / 30 วัน",
          "ภาพจำลองและ Procedure ideas for research, not medical advice",
          "Face Journal Day 1 / Day 7 / Day 30",
        ]
      : [
          "Full Personal Face Report",
          "7-day and 30-day personal look plan",
          "Image previews and procedure ideas for research, not medical advice",
          "Face Journal Day 1 / Day 7 / Day 30",
        ];
  return (
    <div className="mx-auto max-w-3xl rounded-3xl border border-[#263149] bg-[#070b1a] p-5 text-white shadow-[0_22px_58px_-46px_rgba(0,0,0,0.72)] sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#06b6d4]/25 bg-[#052b36] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#67e8f9]">
            <Lock className="h-3 w-3" />
            {lang === "th" ? "รายงานเต็มถูกล็อก" : "Full report locked"}
          </span>
          <div className="space-y-1">
            <h3 className="font-serif text-2xl font-light italic text-white">
              {lang === "th"
                ? "ปลดล็อกแผนปรับลุคส่วนตัว"
                : "Unlock your personal look plan"}
            </h3>
            <p className="text-sm leading-relaxed text-white/68">
              {lang === "th"
                ? "ฟรีแสดงคะแนนรวม จุดเด่น และจุดที่ควรเริ่มก่อน ส่วนรายงานละเอียดกับ preview อยู่ใน Plus"
                : "Free shows the score, one strength, and one starting point. Detailed report and previews are in Plus."}
            </p>
          </div>
          <ul className="grid gap-2 text-sm text-white/74 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-none text-[#67e8f9]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={onUnlock}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#050816] shadow-[0_0_34px_rgba(168,85,247,0.28)] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/45"
        >
          <Lock className="h-4 w-4" />
          {lang === "th" ? "ปลดล็อก Plus - 29 บาท" : "Unlock Plus - ฿29"}
        </button>
      </div>
    </div>
  );
});

export const ResultTeaser = memo(function ResultTeaser({
  result,
  locked,
  onUnlock,
}: {
  result: ScanResult;
  locked: boolean;
  onUnlock: () => void;
}) {
  const { lang } = useT();
  const aiFocus =
    result.aiAdvice
      ?.slice(0, 3)
      .map((item) => teaserMetricLabel(item.metric, lang))
      .filter(Boolean) ??
    [];
  const fallbackFocus = Object.entries(result.categories)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([key]) => categoryFocusLabel[key]?.[lang] ?? key);
  const focus = (aiFocus.length > 0 ? aiFocus : fallbackFocus)[0] ?? "-";
  const strength =
    Object.entries(result.categories)
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => categoryFocusLabel[key]?.[lang] ?? key)[0] ?? "-";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-[#263149] bg-[#070b1a] px-4 py-4 text-white shadow-[0_18px_46px_-38px_rgba(0,0,0,0.72)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#67e8f9]">
          Face Profile Day 1
        </p>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-white">
          {lang === "th" ? "จุดเด่น: " : "Strength: "}
          <span className="text-[#67e8f9]">{strength}</span>
          <span className="text-white/38"> · </span>
          {lang === "th" ? "จุดที่ควรเริ่มก่อน: " : "Start here: "}
          <span className="text-[#67e8f9]">{focus}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          if (locked) {
            onUnlock();
            return;
          }
          document.getElementById("scan-report")?.scrollIntoView({
            behavior: "smooth",
          });
        }}
        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-[#06b6d4]/25 bg-[#052b36] px-4 text-xs font-bold text-[#67e8f9] shadow-[0_10px_24px_-22px_rgba(6,182,212,0.35)] transition hover:bg-[#073646] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/45"
      >
        {locked
          ? lang === "th"
            ? "ปลดล็อก Plus - 29 บาท"
            : "Unlock Plus - ฿29"
          : lang === "th"
            ? "ดูรายงานเต็ม"
            : "View full report"}
      </button>
    </div>
  );
});

const SurgeryCta = memo(function SurgeryCta() {
  const { t, lang } = useT();
  // Headline copy is short enough to ship inline rather than via the
  // locale file. Localized in TH/EN; falls through to the t.scan label
  // for the button only.
  void t;
  return (
    <a
      href="/surgery"
      className="scan-surgery-cta block rounded-2xl border p-5 shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] transition focus-visible:outline-none focus-visible:ring-2"
    >
      <div className="flex items-center gap-4">
        <div className="scan-surgery-cta-icon flex h-10 w-10 flex-none items-center justify-center rounded-xl shadow-[0_14px_30px_-24px_rgba(36,31,26,0.55)]">
          <Scissors className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="scan-surgery-cta-accent text-[10px] uppercase tracking-[0.2em]">
            {lang === "th" ? "วางแผนก่อนปรึกษา" : "Pre-consult planning"}
          </p>
          <p className="scan-surgery-cta-title font-serif italic text-xl leading-tight">
            {lang === "th"
              ? "ดูประเด็นหัตถการบนรูปของคุณ"
              : "Review procedure questions on your photo"}
          </p>
          <p className="scan-surgery-cta-muted mt-1 text-xs">
            {lang === "th"
              ? "Procedure ideas for research, not medical advice · ดูภาพอ้างอิงก่อน/หลังแบบแนวคิด"
              : "Procedure ideas for research, not medical advice · directional before/after reference."}
          </p>
        </div>
        <ArrowRight className="scan-surgery-cta-accent h-4 w-4 flex-none" />
      </div>
    </a>
  );
});

const REVEAL = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

const RESULT_STACK_REVEAL = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { delayChildren: 0.04, staggerChildren: 0.09 },
  },
};

const RESULT_HERO_REVEAL = {
  hidden: { opacity: 0, y: 22, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.52, ease: [0.22, 1, 0.36, 1] },
  },
};

const AddFrameButton = memo(function AddFrameButton({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (image: HTMLImageElement) => void;
}) {
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Phase 192c — Don't revoke on onload. iOS Safari renders the
      // multi-frame thumbnail strip via `<img src={f.image.src}>` which
      // re-fetches from the same blob URL — revoking it before paint
      // leaves the tile blank on iOS.
      onAdd(img);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
    e.target.value = "";
  }
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      className="flex h-14 items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#263149] bg-[#0b1020] px-4 text-xs font-semibold text-white/72 transition hover:border-[#06b6d4]/40 hover:bg-[#11182b] hover:text-white disabled:pointer-events-none disabled:opacity-50"
      >
        + {t.multiFrame.addPrompt}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />
    </>
  );
});

const MultiFramePanel = memo(function MultiFramePanel({
  frames,
  processing,
  error,
  onAdd,
}: {
  frames: ScanPhoto[];
  processing: boolean;
  error: string | null;
  onAdd: (image: HTMLImageElement) => void;
}) {
  const { t, lang } = useT();
  const count = frames.length;
  const MAX = 5;
  if (count >= MAX) {
    return (
      <div className="rounded-2xl border border-[#263149] bg-[#070b1a] p-5 text-center space-y-1 text-white shadow-[0_18px_46px_-38px_rgba(0,0,0,0.72)]">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#67e8f9]">
          {t.multiFrame.label}
        </p>
        <p className="text-sm text-white/62">
          {t.multiFrame.maxed.replace("{n}", count.toString())}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-[#263149] bg-[#070b1a] p-5 space-y-4 text-white shadow-[0_18px_46px_-38px_rgba(0,0,0,0.72)]">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#67e8f9]">
            {t.multiFrame.label}
          </p>
          <h3 className="text-base font-medium text-white">{t.multiFrame.title}</h3>
        </div>
        <span className="rounded-full border border-[#263149] bg-[#0b1020] px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-white/62">
          {count} / {MAX}
        </span>
      </div>
      <p className="text-xs text-white/58 leading-relaxed">
        {t.multiFrame.body}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {frames.map((f, i) => (
          <div
            key={i}
            className="h-14 w-14 rounded-lg border border-[#263149] overflow-hidden bg-[#0b1020] relative"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.image.src}
              alt={`frame ${i + 1}`}
              className="h-full w-full object-cover"
            />
            <span className="absolute bottom-0.5 right-0.5 rounded border border-[#263149] bg-[#0b1020] px-1 text-[9px] font-semibold text-white">
              {i + 1}
            </span>
          </div>
        ))}
        {count < MAX && <AddFrameButton disabled={processing} onAdd={onAdd} />}
      </div>
      {processing && (
        <p className="text-xs text-white/62 flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          {lang === "th"
            ? "กำลังตรวจรูปที่เพิ่ม..."
            : "Checking added photo..."}
        </p>
      )}
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
});

const CopyResultJson = memo(function CopyResultJson({ result }: { result: ScanResult }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      const payload = {
        overall: result.overall,
        confidence: result.confidence,
        pose: result.pose,
        categories: result.categories,
        metrics: result.metrics,
        skin: result.skin,
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard denied — silently ignore
    }
  }, [result]);
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#263149] bg-[#0b1020] px-5 text-sm font-semibold text-white/72 shadow-[0_10px_28px_-24px_rgba(0,0,0,0.72)] transition hover:border-[#06b6d4]/40 hover:bg-[#11182b] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06b6d4]/35"
    >
      {copied ? "Copied" : "Copy JSON"}
    </button>
  );
});

interface CalibrationPickerProps {
  gender: Gender;
  onGender: (g: Gender) => void;
}

const CalibrationPicker = memo(function CalibrationPicker({
  gender,
  onGender,
}: CalibrationPickerProps) {
  const { t } = useT();
  // Phase 192p — hoist the four onClick handlers via useCallback so the
  // memoized SegButton children can shortcut their render path when only
  // a sibling toggles. Without these, every CalibrationPicker render
  // built fresh () => onX("..." ) arrow fns and SegButton's memo broke.
  const setMale = useCallback(() => onGender("male"), [onGender]);
  const setFemale = useCallback(() => onGender("female"), [onGender]);
  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-[#263149] bg-[#070b1a] px-3 py-3 shadow-[0_16px_42px_-34px_rgba(0,0,0,0.78)] sm:w-fit sm:px-4">
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-white/72 sm:gap-5">
        <span className="w-full text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-white/46 sm:w-auto">
          {t.scan.calibration}
        </span>
        <div className="flex items-center gap-1.5">
          <SegButton active={gender === "male"} onClick={setMale}>
            {t.calibration.male}
          </SegButton>
          <SegButton active={gender === "female"} onClick={setFemale}>
            {t.calibration.female}
          </SegButton>
        </div>
      </div>
    </div>
  );
});

const SegButton = memo(function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] rounded-lg px-3 py-1.5 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06b6d4]/35 ${
        active
          ? "bg-[#052b36] text-[#67e8f9] font-medium"
          : "text-white/62 hover:bg-[#11182b] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
});

/**
 * Phase 139 — assemble an in-memory ScanRecord for the report-download
 * button on the live scan result page. The user hasn't navigated to
 * history yet, but we already have everything we need on screen.
 * (Same shape as what `persist()` writes; we just don't put it in
 *  localStorage.)
 */
function buildEphemeralRecord(
  scan: import("@/lib/scoring").ScanResult,
  image: HTMLImageElement,
  quality: import("@/lib/scoring").PhotoQualityReport | null
): ScanRecord {
  const photoDataUrl = scanImageToReportThumb(image);
  return {
    timestamp: Date.now(),
    overall: scan.overall,
    tier: tierFor(scan.overall, scan.options.gender),
    categories: scan.categories,
    options: scan.options,
    views: scan.views,
    ...(scan.geometric !== undefined ? { geometric: scan.geometric } : {}),
    ...(scan.secondOpinion !== undefined
      ? { secondOpinion: scan.secondOpinion }
      : {}),
    ...(scan.learned !== undefined ? { learned: scan.learned } : {}),
    ...(quality
      ? { quality: { overall: quality.overall, issueCount: quality.issues.length } }
      : {}),
    ...(photoDataUrl ? { photoDataUrl } : {}),
    ...(scan.aiReasoning ? { aiReasoning: scan.aiReasoning } : {}),
    ...(typeof scan.aiRawScore === "number" ? { aiRawScore: scan.aiRawScore } : {}),
    ...(typeof scan.aiConfidence === "number"
      ? { aiConfidence: scan.aiConfidence }
      : {}),
    ...(scan.aiSource ? { aiSource: scan.aiSource } : {}),
    ...(scan.aiPerceived ? { aiPerceived: scan.aiPerceived } : {}),
    ...(scan.aiAdvice && scan.aiAdvice.length > 0
      ? { aiAdvice: scan.aiAdvice }
      : {}),
    ...(scan.aiPotential ? { aiPotential: scan.aiPotential } : {}),
  };
}

/** Same helper as `scanImageToDataUrl` inside the component but
 *  callable from this module-scoped function. */
function scanImageToReportThumb(
  img: HTMLImageElement,
  maxSide = 800
): string | undefined {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w === 0 || h === 0) return undefined;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(img, 0, 0, tw, th);
  try {
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return undefined;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
