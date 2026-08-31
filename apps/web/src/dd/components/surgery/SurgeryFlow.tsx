"use client";

/**
 * Phase 128 — standalone Procedure-preview flow.
 * Phase 133 — renamed surface to "หัตถการ" (procedures) and added the
 *  two-mode layout: AI recommendations + manual picker.
 *
 * Decoupled from `/scan`. Users land here, start from a camera reference,
 * confirm a camera/album reference, pick a gender for prompt calibration, then either:
 *   - read the AI's prioritized list of procedures and tick the ones
 *     they want to preview, OR
 *   - pick from the full procedure catalog manually.
 *
 * Both paths feed the same `SurgeryPreviewCard` dialog generator, so
 * downloads and disclaimers behave identically.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { m } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  ImagePlus,
  Loader2,
  Scissors,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { PhotoUpload } from "@/components/scan/PhotoUpload";
import { CameraCapture } from "@/components/scan/CameraCapture";
// Phase 180 — `ApiKeyDialog` removed. Gemini calls now go through
// `/api/ai/score` and `/api/ai/image-gen` server routes that read
// `GEMINI_API_SECRET`; the user never supplies a key.
import { SurgeryPreviewCard } from "@/components/results/SurgeryPreviewCard";
import {
  RecommendPanel,
  type RecommendedPreviewRequest,
} from "@/components/results/RecommendPanel";
import { SavedPreviewsPanel } from "@/components/results/SavedPreviewsPanel";
const ProcedureConsentDialog = dynamic(
  () =>
    import("@/components/results/ProcedureConsentDialog").then((m) => ({
      default: m.ProcedureConsentDialog,
    })),
  { ssr: false, loading: () => null }
);
import {
  acceptProcedureConsent,
  hasAcceptedProcedureConsent,
} from "@/lib/procedure-consent";
import { detectPreviewLandmarks } from "@/lib/procedure-mask";
import { computeAll, assessPhotoQuality } from "@/lib/scoring";
import {
  buildRecommendMetricsSummary,
  type RecommendMetricsSummary,
} from "@/lib/recommend-metrics-summary";
import {
  trackCameraAdoption,
  type CameraAdoptionEvent,
} from "@/lib/camera-adoption";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { loadUserPrefs, saveUserPrefs } from "@/lib/user-prefs";
import type { Gender, Landmarks } from "@/types";

type Mode = "choose" | "recommend" | "browse";
type QueuedPreview = RecommendedPreviewRequest;

// Phase 192n+ — static frame variants & gender list hoisted out of the
// render path so React doesn't allocate fresh objects on every paint.
const GENDERS = ["male", "female"] as const;
const MOTION_INITIAL = { opacity: 0, y: 8 } as const;
const MOTION_ANIMATE = { opacity: 1, y: 0 } as const;

function surgeryFaceReadErrorMessage(lang: "th" | "en"): string {
  return lang === "th"
    ? "ระบบอ่านใบหน้าในรูปนี้ไม่ได้ กรุณาเลือกรูปที่เห็นใบหน้าชัดหรือถ่ายใหม่อีกครั้ง"
    : "We could not read a face in this photo. Choose a clearer face photo or retake it.";
}

// Phase 638 — same quality gate as /scan now runs here too, so a photo
// that's readable but too unreliable to measure (off-angle, filtered,
// hair over the face, etc.) needs its own message distinct from "no
// face found at all".
function surgeryUnreliablePhotoMessage(lang: "th" | "en"): string {
  return lang === "th"
    ? "รูปนี้ยังวิเคราะห์ได้ไม่แม่นพอ กรุณาใช้รูปหน้าตรง แสงชัด ไม่ใส่ฟิลเตอร์"
    : "This photo is not reliable enough yet. Use a clear front-facing photo without filters.";
}

// Phase 639 — /surgery's gate is looser than /scan's: warn-level issues
// pass through with this advisory instead of blocking. A reference
// preview tolerates an imperfect photo better than the 60-metric scoring
// pipeline does, and QA found the shared >= 2-warns rejection blocked
// photos users reasonably consider "front-facing enough".
function surgeryQualityWarnMessage(lang: "th" | "en"): string {
  return lang === "th"
    ? "รูปนี้ใช้ได้ แต่มุม/แสง/ความชัดยังไม่นิ่ง ภาพอ้างอิงและคำแนะนำอาจคลาดเคลื่อนเล็กน้อย"
    : "This photo works, but angle/light/sharpness aren't ideal — references and recommendations may be slightly less accurate.";
}

function surgeryPhotoReadyHint(lang: "th" | "en"): string {
  return lang === "th"
    ? "ถ้าเห็นใบหน้าชัดและแสงพอ ใช้รูปนี้ได้เลย ระบบจะบล็อกเฉพาะรูปที่อ่านใบหน้าไม่ได้หรือคุณภาพต่ำมาก"
    : "If the face is clear and well-lit, this photo is fine. We only stop photos that can't be read or have very low quality.";
}

export function SurgeryFlow() {
  const { lang } = useT();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Phase 638 — full computeAll metrics for the confirmed photo, same
  // pipeline /scan uses. Sent alongside the photo to the AI-recommend
  // call so recommendations are grounded in measured data, not the
  // photo alone.
  const [metricsSummary, setMetricsSummary] =
    useState<RecommendMetricsSummary | null>(null);
  const [gender, setGender] = useState<Gender>("male");
  const [mode, setMode] = useState<Mode>("choose");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraAttempted, setCameraAttempted] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [albumFallbackOpen, setAlbumFallbackOpen] = useState(false);
  const [qualityGateError, setQualityGateError] = useState<string | null>(null);
  // Phase 639 — non-blocking advisory for warn-level quality issues.
  // Shown after confirm instead of rejecting the photo.
  const [qualityNotice, setQualityNotice] = useState<string | null>(null);
  // Phase 639 — landmarks of the confirmed photo, kept so metrics can be
  // recomputed when the user flips gender AFTER confirming (ideal ranges
  // are gender-dependent; without this the AI-recommend call would send
  // metrics scored against the wrong gender's ranges).
  const confirmedLandmarksRef = useRef<Landmarks | null>(null);
  const cameraTelemetryRef = useRef<Set<string>>(new Set());

  // Phase 133/134 — queue of procedure keys the user picked from the
  // AI recommendation list. We track the WHOLE queue + a cursor and
  // expose `queue[cursor]` as the active key to `SurgeryPreviewCard`.
  // When the preview dialog closes we advance the cursor; when the
  // cursor passes the end we reset both.
  //
  // This pattern is more robust than head/rest mutation because:
  //   1. No setTimeout hack to force re-fire — React reconciles the
  //      `initialPicked` prop change for us.
  //   2. Switching modes can simply reset both states without leaking.
  const [queue, setQueue] = useState<QueuedPreview[]>([]);
  const [cursor, setCursor] = useState(0);
  const [selectionSeed, setSelectionSeed] = useState<QueuedPreview[]>([]);
  const activeQueueItem = useMemo<QueuedPreview | null>(
    () =>
      queue.length > 0 && cursor < queue.length ? (queue[cursor] ?? null) : null,
    [queue, cursor]
  );
  const activeFromQueue = activeQueueItem?.key ?? null;
  const queueProgress = useMemo(
    () =>
      queue.length > 1 ? { index: cursor, total: queue.length } : undefined,
    [queue, cursor]
  );

  // Phase 135 — bump this whenever a preview dialog closes so the
  // saved-gallery panel re-reads storage and shows the latest result.
  // (The dialog has just saved on success, so close-time is the
  // earliest moment we can be sure persistence completed.)
  const [savedRefresh, setSavedRefresh] = useState(0);

  // Phase 135 — one-time consent gate. We check on every "use this
  // photo" confirm; if the user hasn't accepted, we hold the photo
  // in `pendingImage`/`pendingUrl` until they tap "Got it, let's go".
  const [consentOpen, setConsentOpen] = useState(false);
  const pendingConsentRef = useRef<{
    image: HTMLImageElement;
    url: string | null;
    metrics: RecommendMetricsSummary | null;
  } | null>(null);

  const handleConsentAccept = useCallback(() => {
    const pending = pendingConsentRef.current;
    acceptProcedureConsent();
    setConsentOpen(false);
    if (pending) {
      setImage(pending.image);
      setImageUrl(pending.url);
      setMetricsSummary(pending.metrics);
      setMode("choose");
      setQueue([]);
      setCursor(0);
      setSelectionSeed([]);
      pendingConsentRef.current = null;
    }
  }, []);

  const handleConsentCancel = useCallback(() => {
    setConsentOpen(false);
    pendingConsentRef.current = null;
  }, []);

  const previewUrlRef = useRef<string | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  useEffect(() => { previewUrlRef.current = previewUrl; }, [previewUrl]);
  useEffect(() => { imageUrlRef.current = imageUrl; }, [imageUrl]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current && previewUrlRef.current.startsWith("blob:")) {
        try { URL.revokeObjectURL(previewUrlRef.current); } catch {}
      }
      if (imageUrlRef.current && imageUrlRef.current.startsWith("blob:") && imageUrlRef.current !== previewUrlRef.current) {
        try { URL.revokeObjectURL(imageUrlRef.current); } catch {}
      }
    };
  }, []);

  useEffect(() => {
    const prefs = loadUserPrefs();
    setGender(prefs.gender);
  }, []);

  useEffect(() => {
    saveUserPrefs({ gender, ethnicity: "universal" });
  }, [gender]);

  // Phase 639 — keep the metrics summary in sync when the user flips
  // gender AFTER confirming the photo. Ideal ranges are gender-dependent,
  // so the summary computed at confirm-time would otherwise be scored
  // against the wrong gender's ranges when it reaches the AI-recommend
  // call. Recomputes from the stored landmarks; no re-detection needed.
  useEffect(() => {
    if (!image || !confirmedLandmarksRef.current) return;
    const scan = computeAll(
      { front: confirmedLandmarksRef.current },
      { gender, ethnicity: "universal" }
    );
    setMetricsSummary(buildRecommendMetricsSummary(scan));
  }, [gender, image]);

  const trackSurgeryCameraEvent = useCallback(
    (
      event: Extract<CameraAdoptionEvent, `surgery_${string}`>,
      metadata?: { reason?: "auto" | "manual" | "after_attempt" | "permission_denied" }
    ) => {
      const key = `${event}:${metadata?.reason ?? ""}`;
      if (cameraTelemetryRef.current.has(key)) return;
      cameraTelemetryRef.current.add(key);
      void trackCameraAdoption(event, metadata);
    },
    []
  );

  const handlePhoto = useCallback((img: HTMLImageElement, source: "camera" | "album") => {
    setUploadError(null);
    setQualityGateError(null);
    setCameraDenied(false);
    setAlbumFallbackOpen(false);
    setPreviewImage(img);
    trackSurgeryCameraEvent(
      source === "camera" ? "surgery_camera_captured" : "surgery_album_captured"
    );
    setPreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) {
        try { URL.revokeObjectURL(prev); } catch {}
      }
      return img.src;
    });
  }, [trackSurgeryCameraEvent]);

  const handlePhotoBatch = useCallback(
    (images: HTMLImageElement[]) => {
      const [first, ...rest] = images;
      for (const image of rest) {
        if (image.src.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(image.src);
          } catch {}
        }
      }
      if (first) handlePhoto(first, "camera");
    },
    [handlePhoto]
  );

  const handleUploadBusy = useCallback((busy: boolean) => {
    setUploadBusy(busy);
    if (busy) setUploadError(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!previewImage) return;
    setUploadBusy(true);
    setUploadError(null);
    setQualityGateError(null);
    let metrics: RecommendMetricsSummary | null = null;
    try {
      const detected = await detectPreviewLandmarks(previewImage);
      if (!detected) {
        setQualityGateError(surgeryFaceReadErrorMessage(lang));
        return;
      }
      // Phase 638 — same pipeline as /scan: full computeAll (all 60
      // metrics) + the shared photo-quality checks (confidence gate, hard
      // pose gate, face size, hair/lighting checks — see Phase 636/637).
      // Phase 639 — but with a LOOSER verdict than /scan: only an
      // overall-"bad" report blocks here. /scan's shouldRejectForScoring
      // also rejects on >= 2 warns, which QA found blocks photos users
      // reasonably consider front-facing enough for a reference preview.
      // Warn-level issues pass through with a non-blocking advisory.
      const { landmarks, blendshapes } = detected;
      const scan = computeAll(
        { front: landmarks },
        { gender, ethnicity: "universal" }
      );
      const report = assessPhotoQuality(
        previewImage,
        landmarks,
        scan.pose,
        blendshapes
      );
      if (report.overall === "bad") {
        setQualityGateError(surgeryUnreliablePhotoMessage(lang));
        return;
      }
      setQualityNotice(
        report.overall === "warn" ? surgeryQualityWarnMessage(lang) : null
      );
      confirmedLandmarksRef.current = landmarks;
      metrics = buildRecommendMetricsSummary(scan);
    } catch {
      setQualityGateError(surgeryFaceReadErrorMessage(lang));
      return;
    } finally {
      setUploadBusy(false);
    }
    // Phase 135 — gate the very first confirm with a consent dialog.
    // After they accept once, future visits skip the modal entirely.
    if (!hasAcceptedProcedureConsent()) {
      pendingConsentRef.current = { image: previewImage, url: previewUrl, metrics };
      setConsentOpen(true);
      return;
    }
    setImage(previewImage);
    setImageUrl(previewUrl);
    setMetricsSummary(metrics);
    setMode("choose");
    setQueue([]);
    setCursor(0);
    setSelectionSeed([]);
  }, [lang, previewImage, previewUrl, gender]);

  const reset = useCallback(() => {
    cameraTelemetryRef.current.clear();
    if (previewUrl && previewUrl.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {
        /* no-op */
      }
    }
    setImage(null);
    setImageUrl(null);
    setMetricsSummary(null);
    confirmedLandmarksRef.current = null;
    setPreviewImage(null);
    setPreviewUrl(null);
    setUploadBusy(false);
    setUploadError(null);
    setQualityGateError(null);
    setQualityNotice(null);
    setCameraOpen(false);
    setCameraAttempted(true);
    setCameraDenied(false);
    setAlbumFallbackOpen(false);
    setQueue([]);
    setCursor(0);
    setSelectionSeed([]);
    setMode("choose");
  }, [previewUrl]);

  const changeMode = useCallback(
    (next: Mode) => {
      // Switching tabs cancels any in-flight AI-recommend queue so the
      // user doesn't get a "ghost" preview popping up when they come
      // back to the recommend tab later.
      if (next !== mode) {
        setQueue([]);
        setCursor(0);
        if (next !== "browse") setSelectionSeed([]);
      }
      setMode(next);
    },
    [mode]
  );
  const handleRecommendMode = useCallback(
    () => changeMode("recommend"),
    [changeMode]
  );
  const handleBrowseMode = useCallback(() => changeMode("browse"), [changeMode]);

  const clearPreview = useCallback(() => {
    cameraTelemetryRef.current.clear();
    if (previewUrl && previewUrl.startsWith("blob:") && previewUrl !== imageUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {
        /* no-op */
      }
    }
    setPreviewImage(null);
    setPreviewUrl(null);
    setUploadError(null);
    setQualityGateError(null);
    setCameraOpen(false);
    setCameraAttempted(true);
    setCameraDenied(false);
    setAlbumFallbackOpen(false);
  }, [previewUrl, imageUrl]);

  const openCamera = useCallback(() => {
    setCameraAttempted(true);
    setAlbumFallbackOpen(false);
    setCameraOpen(true);
    trackSurgeryCameraEvent("surgery_camera_opened", { reason: "manual" });
  }, [trackSurgeryCameraEvent]);

  const closeCamera = useCallback(() => {
    setCameraAttempted(true);
    setCameraOpen(false);
    trackSurgeryCameraEvent("surgery_camera_closed", { reason: "manual" });
  }, [trackSurgeryCameraEvent]);

  const handleCameraDenied = useCallback(() => {
    setCameraAttempted(true);
    setCameraDenied(true);
    setAlbumFallbackOpen(true);
    setCameraOpen(false);
    trackSurgeryCameraEvent("surgery_camera_denied", { reason: "permission_denied" });
    trackSurgeryCameraEvent("surgery_album_fallback_opened", {
      reason: "permission_denied",
    });
  }, [trackSurgeryCameraEvent]);

  const openAlbumFallback = useCallback(() => {
    setAlbumFallbackOpen(true);
    trackSurgeryCameraEvent("surgery_album_fallback_opened", {
      reason: "after_attempt",
    });
  }, [trackSurgeryCameraEvent]);

  const handleTryRecommended = useCallback((items: RecommendedPreviewRequest[]) => {
    const first = items[0];
    if (!first) return;
    setSelectionSeed([first]);
    setMode("browse");
    setQueue([]);
    setCursor(0);
  }, []);

  const queueRef = useRef(queue);
  const cursorRef = useRef(cursor);
  queueRef.current = queue;
  cursorRef.current = cursor;

  // When the SurgeryPreviewCard dialog closes, advance the cursor —
  // `activeFromQueue` is derived (`queue[cursor]`), so the change in
  // cursor flips the prop and re-fires the open useEffect inside the
  // card. Live refs keep the delayed advance from acting on a replaced queue.
  const handlePreviewClosed = useCallback(() => {
    setSavedRefresh((n) => n + 1);
    if (queueRef.current.length === 0) return;
    setTimeout(() => {
      if (cursorRef.current + 1 >= queueRef.current.length) {
        setQueue([]);
        setCursor(0);
      } else {
        setCursor((c) => c + 1);
      }
    }, 300);
  }, []);

  const showIntake = !image && !previewImage;
  const showConfirm = !!previewImage && !image;
  const showPreview = !!image;
  const queueBusy = queue.length > 0;

  useEffect(() => {
    if (!showIntake || !cameraOpen) return;
    trackSurgeryCameraEvent("surgery_camera_opened", { reason: "auto" });
  }, [cameraOpen, showIntake, trackSurgeryCameraEvent]);

  return (
    // Phase 192t — pb-bottom-nav clears the fixed MobilePricingNav (<lg) so
    // the bottom-most interactive elements (confirm CTAs, the "เปลี่ยนรูปใหม่"
    // reset button, and the SavedPreviews "ดูทั้งหมด" view-all chip) never
    // hide under the nav; collapses to 0 at lg+ where the sidebar replaces it.
    <div className="space-y-4 pb-bottom-nav">
      <section
        className={`relative overflow-hidden rounded-[1.35rem] border border-white/60 bg-white/50 p-3 shadow-[0_18px_52px_-44px_rgba(36,31,26,0.34)] backdrop-blur-md sm:p-4 lg:p-5 ${
          showConfirm ? "hidden sm:block" : ""
        }`}
      >
        <div
          className={
            showIntake
              ? "grid gap-4 lg:grid-cols-[minmax(0,0.78fr)_minmax(300px,0.78fr)] lg:items-center"
              : "mx-auto max-w-3xl space-y-4 text-center"
          }
        >
          <div className="space-y-3">
            <div className="inline-flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0f6f7f] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.32)] backdrop-blur">
              <Scissors className="h-3 w-3" />
              {lang === "th" ? "วางแผนก่อนปรึกษา" : "Pre-consult planning"}
            </div>
            <div className="space-y-2">
              <h1
                className={`font-sans text-xl font-semibold leading-tight tracking-normal text-[#241f1a] sm:text-2xl lg:text-[1.7rem] ${
                  showIntake ? "max-w-xl" : "mx-auto max-w-3xl"
                }`}
              >
                {lang === "th"
                  ? "วางแผนหัตถการก่อนปรึกษาแพทย์"
                  : "Review procedure options before a consult"}
              </h1>
              <p
                className={`text-xs leading-relaxed text-[#5f574f] sm:text-sm ${
                  showIntake ? "max-w-lg" : "mx-auto max-w-xl"
                }`}
              >
                {lang === "th"
                  ? "อัปโหลดภาพใบหน้าเพื่อรีวิวโครงหน้า จัดลำดับประเด็นที่ควรถาม และดูภาพอ้างอิงประกอบการตัดสินใจ"
                  : "Upload a face photo to review facial structure, prioritize consult questions, and prepare a decision reference image."}
              </p>
            </div>

          </div>

          {showIntake && (
            <div className="space-y-3">
              {!albumFallbackOpen ? (
                <div className="relative mx-auto w-full max-w-[400px] overflow-hidden rounded-[1.25rem] border border-white/60 bg-white/55 p-3 text-center shadow-[0_18px_46px_-40px_rgba(36,31,26,0.42)] backdrop-blur-md sm:p-4">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#0f6f7f]/30 to-transparent"
                  />
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-white/65 bg-white/50 text-[#0f6f7f] shadow-[0_14px_30px_-24px_rgba(15,111,127,0.5)]">
                    <Camera className="h-4 w-4" />
                  </div>
                  <h2 className="mt-2.5 text-base font-semibold text-[#241f1a]">
                    {lang === "th"
                      ? "เริ่มจากกล้องเพื่อภาพอ้างอิงที่แม่นกว่า"
                      : "Start with camera for a cleaner reference"}
                  </h2>
                  <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-[#5f574f]">
                    {lang === "th"
                      ? "ใช้ภาพหน้าตรงจากกล้องก่อน เพื่อให้คำแนะนำและภาพอ้างอิงยึดกับใบหน้าปัจจุบันมากขึ้น"
                      : "Use a fresh front-facing camera capture so recommendations and references stay tied to the current face."}
                  </p>
                  <div className="mt-3 flex flex-col items-center justify-center gap-2 sm:flex-row">
                    <Button
                      type="button"
                      onClick={openCamera}
                      disabled={uploadBusy}
                      className="h-10 w-full max-w-[220px] gap-2 rounded-xl border border-[#171412] bg-[#171412] px-4 text-sm font-semibold text-[#fffaf2] shadow-[0_14px_30px_-24px_rgba(36,31,26,0.54)] hover:bg-[#2f2924]"
                    >
                      <Camera className="h-4 w-4" />
                      {lang === "th" ? "เปิดกล้อง" : "Open camera"}
                    </Button>
                    {cameraAttempted && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={openAlbumFallback}
                        disabled={uploadBusy}
                        className="h-10 w-full max-w-[240px] gap-2 rounded-xl border-white/60 bg-white/45 px-4 text-xs font-semibold text-[#4f4841] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.35)] backdrop-blur-md hover:bg-white/65 hover:text-[#241f1a]"
                      >
                        <ImagePlus className="h-4 w-4" />
                        {lang === "th" ? "เลือกรูปจากอัลบั้มแทน" : "Choose from album instead"}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <PhotoUpload
                    variant="hud"
                    cameraShortcut={false}
                    onPhoto={(img) => handlePhoto(img, "album")}
                    onError={setUploadError}
                    onBusyChange={handleUploadBusy}
                    disabled={uploadBusy}
                    promptText={
                      cameraDenied
                        ? lang === "th"
                          ? "เปิดกล้องไม่ได้ เลือกรูปหน้าตรงแทนได้"
                          : "Camera unavailable. Choose a front-facing photo instead."
                        : lang === "th"
                          ? "เลือกรูปหน้าตรงจากอัลบั้ม"
                          : "Choose a front-facing photo from your album"
                    }
                  />
                  <button
                    type="button"
                    onClick={openCamera}
                    disabled={uploadBusy}
                    className="mx-auto flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 text-xs font-semibold text-[#4f4841] backdrop-blur-md transition hover:bg-white/65 hover:text-[#241f1a] disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {lang === "th" ? "ลองเปิดกล้องอีกครั้ง" : "Try camera again"}
                  </button>
                </div>
              )}
              <CameraCapture
                open={showIntake && cameraOpen}
                autoCapture
                onClose={closeCamera}
                onPermissionDenied={handleCameraDenied}
                onCapture={(img) => handlePhoto(img, "camera")}
                onCaptureBatch={handlePhotoBatch}
              />
              {uploadBusy && <SurgeryUploadStatus lang={lang} />}
              {uploadError && (
                <p
                  role="alert"
                  aria-live="assertive"
                  className="rounded-2xl border border-[#b42318]/25 bg-white/55 px-4 py-3 text-sm font-medium text-[#b42318] backdrop-blur"
                >
                  {uploadError}
                </p>
              )}
              <p className="rounded-2xl border border-white/60 bg-white/40 px-3 py-2 text-[11px] leading-relaxed text-[#5f574f] shadow-[0_10px_28px_-24px_rgba(36,31,26,0.28)] backdrop-blur">
                {lang === "th"
                  ? "รูปอ้างอิงไม่ต้องเป๊ะทุกอย่าง แค่เห็นใบหน้าชัด ระบบจะใช้รูปนี้เป็นฐานก่อนสร้างภาพอ้างอิง"
                  : "The reference photo does not need to be perfect. If the face is clear, we can use it as the base for preview."}
              </p>
            </div>
          )}
        </div>
      </section>


      {/* Confirm preview */}
      {showConfirm && previewImage && previewUrl && (
        <m.div
          initial={MOTION_INITIAL}
          animate={MOTION_ANIMATE}
          className="space-y-5 rounded-[1.35rem] border border-white/60 bg-white/55 p-3 shadow-[0_18px_52px_-44px_rgba(36,31,26,0.34)] backdrop-blur-md sm:p-4"
        >
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-[#241f1a]">
              {lang === "th" ? "ตรวจสอบรูปก่อนเริ่ม" : "Confirm your photo"}
            </p>
            <p className="text-xs text-[#6a6259]">
              {lang === "th"
                ? "ใช้รูปนี้ใช่ไหม? ภาพอ้างอิงจะใช้รูปนี้เป็นฐาน"
                : "Use this photo? Reference views will use it as the base."}
            </p>
          </div>
          <div className="mx-auto flex max-w-md flex-col items-center gap-4">
            {qualityGateError ? (
              <div
                role="alert"
                className="flex w-full items-start gap-2 rounded-2xl border border-warn/25 bg-warn/[0.08] px-3 py-2 text-left text-[12px] leading-relaxed text-warn/95"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <span>{qualityGateError}</span>
              </div>
            ) : (
              <p className="w-full rounded-2xl border border-[#0f6f7f]/20 bg-[#eff8f8]/70 px-3 py-2 text-[12px] leading-relaxed text-[#3f6268]">
                {surgeryPhotoReadyHint(lang)}
              </p>
            )}
            <div className="relative flex max-h-[32dvh] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/60 bg-white/40 shadow-[0_18px_44px_-34px_rgba(36,31,26,0.36)] backdrop-blur sm:max-h-[56vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="preview"
                width={previewImage.naturalWidth}
                height={previewImage.naturalHeight}
                loading="lazy"
                decoding="async"
                className="block max-h-[32dvh] w-full object-contain sm:max-h-[56vh]"
              />
            </div>
            <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/45 p-2.5 shadow-[0_12px_30px_-26px_rgba(36,31,26,0.3)] backdrop-blur">
              <span className="pl-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0f6f7f]">
                {lang === "th" ? "รูปนี้ใช้ได้ถ้าเห็นหน้าชัด" : "Clear face is enough"}
              </span>
              <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/60 bg-white/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                {GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    disabled={uploadBusy}
                    className={`min-h-10 rounded-full px-4 text-xs transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6f7f]/35 ${
                      gender === g
                        ? "bg-[#241f1a] font-semibold text-white shadow-[0_12px_24px_-20px_rgba(36,31,26,0.62)]"
                        : "text-[#5f574f] hover:bg-white/60 hover:text-[#241f1a]"
                    }`}
                  >
                    {g === "male"
                      ? lang === "th"
                        ? "ชาย"
                        : "Male"
                      : lang === "th"
                        ? "หญิง"
                        : "Female"}
                  </button>
                ))}
              </div>
            </div>
            <div
              data-testid="surgery-confirm-photo-actions"
              className="flex w-full flex-row items-center justify-center gap-3"
            >
              <Button
                variant="outline"
                onClick={clearPreview}
                disabled={uploadBusy}
                className="order-1 h-11 flex-1 gap-1.5"
              >
                <X className="h-4 w-4" />
                {lang === "th" ? "เปลี่ยนรูป" : "Change photo"}
              </Button>
              <Button
                onClick={confirm}
                disabled={uploadBusy}
                data-testid="surgery-confirm-photo"
                className="order-2 h-11 flex-1 gap-1.5 bg-[#241f1a] font-medium text-white shadow-[0_18px_36px_-26px_rgba(36,31,26,0.72)] hover:bg-[#342d27]"
              >
                <Camera className="h-4 w-4" />
                {lang === "th" ? "ใช้รูปนี้" : "Use this photo"}
              </Button>
            </div>
          </div>
        </m.div>
      )}

      {/* Two-mode interaction */}
      {showPreview && image && (
        <m.div
          initial={MOTION_INITIAL}
          animate={MOTION_ANIMATE}
          className="space-y-8"
        >
          {mode === "choose" && (
            <div className="mx-auto max-w-2xl space-y-3">
            {qualityNotice && (
              <div
                role="status"
                data-testid="surgery-quality-notice"
                className="flex items-start gap-2 rounded-2xl border border-warn/25 bg-warn/[0.08] px-3 py-2 text-left text-[12px] leading-relaxed text-warn/95"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <span>{qualityNotice}</span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleBrowseMode}
                data-testid="surgery-choose-manual"
                className="group min-h-[128px] rounded-2xl border border-white/60 bg-white/50 p-4 text-left shadow-[0_16px_42px_-36px_rgba(36,31,26,0.34)] backdrop-blur-md transition hover:border-[#067e96]/30 hover:bg-white/65 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/30"
              >
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/60 bg-white/40 text-[#067e96] backdrop-blur transition group-hover:scale-[1.02]">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="block text-base font-semibold text-[#241f1a]">
                  {lang === "th" ? "เลือกเอง" : "Choose manually"}
                </span>
                <span className="mt-2 block text-xs leading-relaxed text-[#6f625a]">
                  {lang === "th"
                    ? "เลือกหัตถการได้ 1 รายการต่อครั้ง แล้วระบบจะสร้างภาพหลังหัตถการให้ 4 แบบ"
                    : "Choose 1 procedure per preview. Doodee generates 4 after options."}
                </span>
                <span className="mt-3 inline-flex rounded-full border border-good/25 bg-good/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-good">
                  {lang === "th" ? "ไม่ใช้สิทธิ์ประเมิน" : "No assessment credit"}
                </span>
              </button>

              <button
                type="button"
                onClick={handleRecommendMode}
                data-testid="surgery-choose-ai"
                className="group min-h-[128px] rounded-2xl border border-white/60 bg-white/50 p-4 text-left shadow-[0_16px_42px_-36px_rgba(36,31,26,0.34)] backdrop-blur-md transition hover:border-[#7a5bd6]/30 hover:bg-white/65 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/30"
              >
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/60 bg-white/40 text-[#7a5bd6] backdrop-blur transition group-hover:scale-[1.02]">
                  <Wand2 className="h-4 w-4" />
                </span>
                <span className="block text-base font-semibold text-[#241f1a]">
                  {lang === "th" ? "ให้ AI จัดลำดับประเด็น" : "Rank consult questions"}
                </span>
                <span className="mt-2 block text-xs leading-relaxed text-[#6f625a]">
                  {lang === "th"
                    ? "อ่านจุดที่ควรถามจากรูปก่อน แล้วคุณค่อยเลือกรายการไปทำภาพอ้างอิง"
                    : "Analyze consult priorities first, then choose which items to preview."}
                </span>
                <span className="mt-3 inline-flex rounded-full border border-warn/25 bg-warn/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-warn">
                  {lang === "th" ? "ใช้ 1 สิทธิ์" : "Uses 1 assessment"}
                </span>
              </button>
            </div>
            </div>
          )}

          {/* Mode pills */}
          {mode !== "choose" && (
          <div className="flex justify-center">
            <div className="grid w-full max-w-md grid-cols-2 items-center gap-1 rounded-full border border-white/60 bg-white/45 p-1 shadow-[0_14px_34px_-28px_rgba(36,31,26,0.32)] backdrop-blur-md">
              <button
                type="button"
                onClick={handleRecommendMode}
                disabled={queueBusy}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4 text-xs transition disabled:pointer-events-none disabled:opacity-50 ${
                  mode === "recommend"
                    ? "bg-[#241f1a] text-white font-medium"
                    : "text-[#6a6259] hover:bg-white/60 hover:text-[#241f1a]"
                }`}
              >
                <Wand2 className="h-3 w-3" />
                {lang === "th" ? "ดูประเด็นที่ควรถาม" : "Review consult questions"}
              </button>
              <button
                type="button"
                onClick={handleBrowseMode}
                disabled={queueBusy}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4 text-xs transition disabled:pointer-events-none disabled:opacity-50 ${
                  mode === "browse"
                    ? "bg-[#241f1a] text-white font-medium"
                    : "text-[#6a6259] hover:bg-white/60 hover:text-[#241f1a]"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                {lang === "th" ? "เลือกเอง" : "Choose manually"}
              </button>
            </div>
          </div>
          )}

          {queueBusy && (
            <div
              role="status"
              aria-live="polite"
              aria-busy="true"
              className="mx-auto flex max-w-sm items-center justify-center gap-2 rounded-full border border-white/60 bg-white/50 px-4 py-2 text-xs font-semibold text-[#067e96] shadow-[0_12px_30px_-24px_rgba(36,31,26,0.34)] backdrop-blur-md"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              <span>
                {lang === "th" ? "กำลังเตรียมภาพอ้างอิง..." : "Preparing reference image..."}
              </span>
            </div>
          )}

          {mode === "recommend" && (
            <RecommendPanel
              image={image}
              gender={gender}
              metrics={metricsSummary}
              onTry={handleTryRecommended}
            />
          )}

          {mode === "browse" && (
            <SurgeryPreviewCard
              image={image}
              gender={gender}
              selectionSeed={selectionSeed}
              onPreviewClosed={handlePreviewClosed}
            />
          )}

          {/* Hidden mount: handles the recommend-mode queue. Lives outside
              the visible card so the generator dialog still appears even
              when the user is on the "browse" mode after picking.
              Phase 192n+ — only mount when an active queue item exists,
              so idle recommend-mode doesn't pay for a second
              SurgeryPreviewCard tree. */}
          {mode === "recommend" && activeFromQueue && (
            <div className="sr-only" aria-hidden>
              <SurgeryPreviewCard
                image={image}
                gender={gender}
                initialPicked={activeFromQueue}
                onPreviewClosed={handlePreviewClosed}
                queueProgress={queueProgress}
              />
            </div>
          )}

          {/* Phase 135 — saved-preview gallery (only renders when there
              is at least one saved record). */}
          {/* Phase 192k // hideWhenEmpty preserves the legacy "invisible
              when nothing saved" behavior. The panel itself renders an
              inline "View all" deep-link when items exist via
              `viewAllHref`, so the bridge to /history?tab=previews lives
              right next to the items the user just generated. */}
          <SavedPreviewsPanel
            refreshToken={savedRefresh}
            hideWhenEmpty
            viewAllHref="/history?tab=previews"
          />

          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={reset}
              disabled={queueBusy}
              className="h-11 gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              {lang === "th" ? "เปลี่ยนรูปใหม่" : "Use a different photo"}
            </Button>
          </div>
        </m.div>
      )}

      {/* Phase 135 — one-time consent dialog (shows on first confirm). */}
      <ProcedureConsentDialog
        open={consentOpen}
        onAccept={handleConsentAccept}
        onCancel={handleConsentCancel}
      />
    </div>
  );
}

function SurgeryUploadStatus({ lang }: { lang: "th" | "en" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-white/60 bg-white/50 px-4 py-3 text-xs font-semibold text-[#067e96] shadow-[0_14px_34px_-28px_rgba(36,31,26,0.34)] backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        <span>{lang === "th" ? "กำลังเตรียมรูป..." : "Preparing photo..."}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {(lang === "th"
          ? ["อ่านไฟล์", "ปรับขนาด", "พร้อมตรวจโครงหน้า"]
          : ["Read file", "Resize", "Ready to review"]
        ).map((label, index) => (
          <div
            key={label}
            className="rounded-xl border border-white/60 bg-white/40 px-3 py-2 backdrop-blur"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#3f6268]">
              {index + 1}
            </p>
            <p className="mt-0.5 text-[11px] text-[#3d3731]">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
