"use client";

import { useEffect, useRef, useState, memo } from "react";
import { Camera, ImagePlus, Loader2, Lock, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { CameraCapture } from "./CameraCapture";

interface PhotoUploadProps {
  onPhoto: (image: HTMLImageElement) => void;
  // Phase 192n — Optional error surface so HEIC rejection + decode
  // failures can reach the parent's error-render path (which is now
  // wired with role="alert" + aria-live="assertive"). When absent,
  // failures are silent — caller opted out of error UI on purpose.
  onError?: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  promptText?: string;
  variant?: "default" | "panel" | "hud";
  cameraShortcut?: boolean;
}

// Phase 192h — Off-thread decode for picked images.
//
// Symptom: a 12MP camera shot (4000x3000) blocked the main thread for
// 300-800ms inside the browser's implicit `<img src=blob:>` decode. The
// spinner froze and the preview tile stayed blank for nearly a second
// on mid-range Android. The pattern `img.src = url` triggers decode
// on the main thread when `onload` fires synchronously during paint.
//
// Fix: kick the decode off the main thread, then hand a real
// HTMLImageElement back to callers (ScanFlow + CameraCapture both rely
// on `.src`, `.naturalWidth`, `.naturalHeight`, and drawing the element
// to a canvas, so we cannot swap the API to ImageBitmap without
// touching ~10 call sites). Two-tier strategy:
//   1. `img.decode()` — modern, off-thread on all evergreen browsers,
//      preserves HTMLImageElement semantics, no canvas round-trip.
//   2. `onload` fallback for ancient browsers without HTMLImageElement.decode
//      (Safari < 13). Still on-thread but identical to the legacy code.
// The canvas + `createImageBitmap` round-trip path that an earlier draft
// considered was rejected because `canvas.toDataURL()` ALSO blocks the
// main thread on a 12MP image — re-introducing the freeze we're trying
// to fix, plus inflating memory ~33%.
//
// Phase 192n — EXIF orientation correction (B5).
//
// iPhones encode landscape/portrait shots with `EXIF Orientation=6`
// (rotate 90° CW). HTMLImageElement honors EXIF automatically when
// rendered as `<img>`, but `canvas.drawImage(img, ...)` does NOT —
// scanImageToDataUrl in ScanFlow ends up writing a sideways thumbnail
// and MediaPipe receives the wrong-orientation pixel grid, halving the
// landmark hit rate on real-world phone shots.
//
// Strategy: when `createImageBitmap(file, { imageOrientation: "from-image" })`
// is available (Chromium 79+, Firefox 77+, Safari 15+), it decodes
// off-thread AND bakes the EXIF rotation into the pixel buffer. We
// then draw the bitmap to an OffscreenCanvas (or DOM canvas as fallback)
// → blob → object URL → HTMLImageElement, so the existing API stays
// intact: callers still receive an HTMLImageElement whose naturalWidth/
// naturalHeight reflect the correctly-oriented pixels.
//
// Browsers without `createImageBitmap` (or without the
// `imageOrientation` option — Safari < 14) fall back to the legacy
// `img.decode()` path. Those browsers will silently render sideways
// canvas exports, which is the pre-fix behavior — acceptable since
// the affected share is < 2% globally.
// Phase 206 — Maximum dimension fed to MediaPipe. A 12 MP phone shot
// (4000×3000) causes the GPU delegate to allocate a ~48 MB texture which
// OOMs on many Android mid-range GPUs → synchronous WASM throw → the
// generic "เกิดข้อผิดพลาด" error. Capping at 1024 px reduces the texture
// to ~4 MB (~12× smaller) while keeping enough detail for 478-landmark
// detection. JPEG quality 0.85 balances skin-analysis accuracy vs size.
const MAX_DECODE_SIDE = 1024;
const DECODE_JPEG_QUALITY = 0.85;

// Helper: scale w×h so the longer side ≤ maxSide, preserving aspect.
function scaleDimensions(
  w: number,
  h: number,
  maxSide: number
): { tw: number; th: number } {
  const scale = Math.min(1, maxSide / Math.max(w, h, 1));
  return {
    tw: Math.max(1, Math.round(w * scale)),
    th: Math.max(1, Math.round(h * scale)),
  };
}

export async function decodeOffThread(file: File): Promise<HTMLImageElement> {
  if (
    typeof createImageBitmap === "function" &&
    typeof Blob !== "undefined" &&
    typeof URL !== "undefined"
  ) {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      // Phase 206 — resize to MAX_DECODE_SIDE before handing to MediaPipe.
      // Previous code drew at full bitmap dimensions; a 12 MP photo
      // stayed 12 MP through preview → detect → GPU crash.
      const { tw, th } = scaleDimensions(
        bitmap.width,
        bitmap.height,
        MAX_DECODE_SIDE
      );
      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        throw new Error("canvas-context-unavailable");
      }
      ctx.drawImage(bitmap, 0, 0, tw, th);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => {
        // JPEG 0.85: EXIF rotation is baked in + resized to ≤1024 px.
        // Keeps skin/feature detail for downstream MediaPipe + skin
        // analysis while staying well inside GPU texture budgets.
        canvas.toBlob((b) => resolve(b), "image/jpeg", DECODE_JPEG_QUALITY);
      });
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error("canvas-toblob-failed");
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      if (typeof img.decode === "function") {
        try {
          await img.decode();
        } catch (err) {
          URL.revokeObjectURL(url);
          throw err;
        }
      } else {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("image-load-failed"));
          };
        });
      }
      return img;
    } catch {
      // Fall through to legacy path — createImageBitmap can reject on
      // unusual color profiles or animated formats.
    }
  }
  // Legacy path — no createImageBitmap (Safari < 15). Load the file
  // as-is, then resize + recompress through a canvas so the returned
  // HTMLImageElement is still within the MAX_DECODE_SIDE budget.
  const rawUrl = URL.createObjectURL(file);
  const rawImg = new Image();
  rawImg.src = rawUrl;
  await (typeof rawImg.decode === "function"
    ? rawImg.decode().catch((err: unknown) => {
        URL.revokeObjectURL(rawUrl);
        throw err;
      })
    : new Promise<void>((resolve, reject) => {
        rawImg.onload = () => resolve();
        rawImg.onerror = () => {
          URL.revokeObjectURL(rawUrl);
          reject(new Error("image-load-failed"));
        };
      }));
  URL.revokeObjectURL(rawUrl);
  // Resize through canvas and re-encode at DECODE_JPEG_QUALITY.
  const w = rawImg.naturalWidth || rawImg.width;
  const h = rawImg.naturalHeight || rawImg.height;
  const { tw, th } = scaleDimensions(w, h, MAX_DECODE_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-context-unavailable");
  ctx.drawImage(rawImg, 0, 0, tw, th);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", DECODE_JPEG_QUALITY);
  });
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error("canvas-toblob-failed");
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  if (typeof img.decode === "function") {
    return img.decode().then(() => img).catch((err: unknown) => {
      URL.revokeObjectURL(url);
      throw err;
    });
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image-load-failed"));
    };
  });
}

export const PhotoUpload = memo(function PhotoUpload({
  onPhoto,
  onError,
  onBusyChange,
  disabled,
  promptText,
  variant = "default",
  cameraShortcut = true,
}: PhotoUploadProps) {
  const { t, lang } = useT();
  const prompt = promptText ?? t.scan.dropPrompt;
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [supportsCamera, setSupportsCamera] = useState(false);
  const [decodeBusy, setDecodeBusy] = useState(false);
  const mountedRef = useRef(true);
  const locked = Boolean(disabled || decodeBusy);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onBusyChange?.(decodeBusy);
  }, [decodeBusy, onBusyChange]);

  // Detect mobile/touch so we know whether to surface the camera shortcut.
  // The `capture` attribute is a no-op on desktop, but we hide the button to
  // avoid a useless second option.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const hasTouch =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const mobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    setIsMobile(hasTouch && mobileUA);
    setSupportsCamera(Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  function handleFile(file: File) {
    if (locked) return;
    // Phase 192n — HEIC reject (B5).
    const name = file.name ?? "";
    if (
      file.type === "image/heic" ||
      file.type === "image/heif" ||
      /\.heic$/i.test(name) ||
      /\.heif$/i.test(name)
    ) {
      const msg =
        lang === "th"
          ? "ยังไม่รองรับไฟล์ HEIC โปรดใช้ JPEG/PNG หรือเปลี่ยน iPhone เป็น Settings > Camera > Formats > Most Compatible"
          : "HEIC is not supported here. Use JPEG/PNG, or set iPhone to Settings > Camera > Formats > Most Compatible.";
      onError?.(msg);
      return;
    }
    // Phase 206 — File-size gate: reject > 10 MB before decode attempt.
    // Oversized files would take 2-3 s to decode and still produce an
    // image too large for the GPU even after canvas re-encode.
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      const msg =
        lang === "th"
          ? "ไฟล์ใหญ่เกิน 10 MB กรุณาใช้รูปที่เล็กกว่านี้"
          : "File exceeds 10 MB. Please use a smaller photo.";
      onError?.(msg);
      return;
    }
    // Phase 192c — DO NOT revoke on `onload`. Ownership passes to the
    // caller — `ScanFlow.clearPreview()` revokes the blob when the user
    // replaces the photo or finishes a scan.
    setDecodeBusy(true);
    onBusyChange?.(true);
    void decodeOffThread(file).then(onPhoto).catch(() => {
      // decodeOffThread already cleans up its own blob URL on failure.
      const msg =
        lang === "th"
          ? "ไม่สามารถอ่านรูปนี้ได้ โปรดใช้ไฟล์ JPEG หรือ PNG"
          : "Could not load the photo. Please use a JPEG or PNG image.";
      onError?.(msg);
    }).finally(() => {
      onBusyChange?.(false);
      if (mountedRef.current) setDecodeBusy(false);
    });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (locked) return;
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  }

  function openCamera() {
    if (locked) return;
    if (isMobile || !supportsCamera) {
      cameraInputRef.current?.click();
      return;
    }
    setCameraOpen(true);
  }

  if (variant === "panel" || variant === "hud") {
    return (
      <div
        aria-busy={locked}
        onDragOver={(e) => {
          e.preventDefault();
          if (locked) return;
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        // Phase 192s — panel drop surface restyle. Depth comes from a layered
        // gradient + inset highlight + drop shadow (cheap, compositor-safe)
        // rather than a heavy backdrop-blur, which janks on mid-range
        // Android. The active drag state lights the whole frame so
        // the target reads unmistakably. Logic (drag handlers, refs,
        // decode, HEIC reject) is untouched — surface only.
        className={`relative mx-auto w-full max-w-[460px] min-w-0 overflow-hidden rounded-[1.5rem] border px-4 py-5 text-center shadow-[0_22px_58px_-46px_rgba(36,31,26,0.32)] transition-colors duration-200 dark:shadow-[0_22px_58px_-46px_rgba(0,0,0,0.72)] sm:px-7 sm:py-7 ${
          dragOver
            ? "border-[#06b6d4]/45 bg-[#e9fbff] dark:bg-[#052b36]"
            : "border-[#241f1a]/10 bg-white/78 dark:border-[#263149] dark:bg-[#070b1a]"
        }`}
      >
        {/* Phase 192s — top hairline accent for the editorial upload card. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#241f1a]/20 to-transparent"
        />
        <div
          aria-hidden
          className={`mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors duration-200 sm:h-14 sm:w-14 ${
            dragOver
              ? "border-[#06b6d4]/30 bg-[#dff8ff] dark:bg-[#052b36]"
              : "border-[#241f1a]/10 bg-white/70 dark:border-[#263149] dark:bg-[#0b1020]"
          }`}
        >
          <Upload
            className={`h-5 w-5 transition-colors sm:h-7 sm:w-7 ${
              dragOver ? "text-[#0e7490] dark:text-[#67e8f9]" : "text-[#5f574f] dark:text-white/62"
            }`}
            strokeWidth={1.5}
          />
        </div>
        <p className="mt-3 text-base font-semibold leading-snug text-[#241f1a] dark:text-white sm:mt-5 sm:text-lg">
          {prompt}
        </p>
        {decodeBusy && <DecodeStatus lang={lang} />}
        {/* Phase 166 — camera-first on mobile: gradient/primary button is
            the camera; upload moves to the secondary slot. Desktop keeps
            both equally weighted (file picker is the dominant flow there). */}
        <div className="mt-4 flex flex-col items-center justify-center gap-2.5 sm:mt-6 sm:flex-row sm:gap-3">
          {!cameraShortcut ? (
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={locked}
              className="h-12 w-full max-w-[260px] gap-2 whitespace-normal rounded-xl border border-[#171412] bg-[#171412] px-5 text-sm font-semibold text-[#fffaf2] shadow-[0_16px_34px_-26px_rgba(36,31,26,0.58)] transition-transform hover:bg-[#2f2924] active:scale-[0.97] focus-visible:ring-[#0f6f7f]/35"
            >
              <ImagePlus className="h-4 w-4" />
              {t.scan.chooseFile}
            </Button>
          ) : isMobile ? (
            <>
              <Button
                type="button"
                onClick={openCamera}
                disabled={locked}
                className="h-12 w-full max-w-full gap-2 whitespace-normal rounded-xl border border-[#171412] bg-[#171412] px-5 text-sm font-semibold text-[#fffaf2] shadow-[0_16px_34px_-26px_rgba(36,31,26,0.58)] transition-transform hover:bg-[#2f2924] active:scale-[0.97] focus-visible:ring-[#0f6f7f]/35 sm:w-[150px]"
              >
                <Camera className="h-4 w-4" />
                {t.scan.takePhoto}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={locked}
                className="h-12 w-full max-w-full gap-2 whitespace-normal rounded-xl border-[#241f1a]/12 bg-white/70 px-5 text-sm font-semibold text-[#4b423a] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.28)] transition-transform hover:border-[#06b6d4]/40 hover:bg-white hover:text-[#241f1a] active:scale-[0.97] focus-visible:ring-[#06b6d4]/35 dark:border-[#263149] dark:bg-[#0b1020] dark:text-white/72 dark:shadow-[0_10px_24px_-22px_rgba(0,0,0,0.72)] dark:hover:bg-[#11182b] dark:hover:text-white sm:w-[150px]"
              >
                <ImagePlus className="h-4 w-4" />
                {t.scan.chooseFile}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={locked}
                className="h-12 w-full max-w-full gap-2 whitespace-normal rounded-xl border border-[#171412] bg-[#171412] px-5 text-sm font-semibold text-[#fffaf2] shadow-[0_16px_34px_-26px_rgba(36,31,26,0.58)] transition-transform hover:bg-[#2f2924] active:scale-[0.97] focus-visible:ring-[#0f6f7f]/35 sm:w-[150px]"
              >
                <ImagePlus className="h-4 w-4" />
                {t.scan.chooseFile}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={openCamera}
                disabled={locked}
                className="h-12 w-full max-w-full gap-2 whitespace-normal rounded-xl border-[#06b6d4]/25 bg-[#052b36] px-5 text-sm font-semibold text-[#67e8f9] shadow-[0_10px_24px_-22px_rgba(6,182,212,0.42)] transition-transform hover:border-[#06b6d4]/40 hover:bg-[#063544] active:scale-[0.97] focus-visible:ring-[#06b6d4]/35 sm:w-[150px]"
              >
                <Camera className="h-4 w-4" />
                {t.camera.open}
              </Button>
            </>
          )}
        </div>
        {/* Phase 190 — Add `aria-label` to the hidden file inputs.
            Switch-access / voice-control users can reach these inputs
            and previously got "file upload, unlabeled" with no clue
            what would happen. The visible buttons above carry labels
            via `t.scan.chooseFile` / `t.camera.open`; mirror them so
            screen readers always have context. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleChange}
          disabled={locked}
          aria-label={t.scan.chooseFile}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="user"
          onChange={handleChange}
          disabled={locked}
          aria-label={t.camera.open}
          className="hidden"
        />
        {/* Phase 192s — privacy reassurance as a centered chip so it reads
            as a deliberate trust signal, not throwaway fine print. */}
        <p className="mt-4 inline-flex max-w-full items-center justify-center gap-1.5 rounded-full border border-[#241f1a]/10 bg-white/70 px-3 py-1 text-[11px] font-medium text-[#5f574f] dark:border-[#263149] dark:bg-[#0b1020] dark:text-white/62 sm:mt-6">
          <Lock className="h-3 w-3 text-[#67e8f9]" strokeWidth={2} />
          <span className="min-w-0 leading-snug">{t.scan.privateNote}</span>
        </p>
        <CameraCapture
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={onPhoto}
        />
      </div>
    );
  }

  return (
    <div
      aria-busy={locked}
      onDragOver={(e) => {
        e.preventDefault();
        if (locked) return;
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      // Phase 192s — default drop zone restyle. Keeps the dashed-border
      // affordance (reads as "droppable") but pairs it with the icon tile +
      // serif prompt used by the panel variant so the two surfaces feel like
      // one design system. Resting and active states stay readable on light UI.
      className={`w-full max-w-full min-w-0 rounded-2xl border-2 border-dashed px-4 py-8 text-center shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] transition-all duration-200 dark:shadow-[0_18px_46px_-38px_rgba(0,0,0,0.72)] sm:p-10 ${
        dragOver
          ? "border-[#06b6d4]/45 bg-[#e9fbff] dark:bg-[#052b36]"
          : "border-[#241f1a]/12 bg-white/78 hover:border-[#06b6d4]/35 dark:border-[#263149] dark:bg-[#070b1a]"
      }`}
    >
      <div
        aria-hidden
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border transition-colors duration-200 ${
          dragOver
            ? "border-[#06b6d4]/30 bg-[#dff8ff] dark:bg-[#052b36]"
            : "border-[#241f1a]/10 bg-white/70 dark:border-[#263149] dark:bg-[#0b1020]"
        }`}
      >
        <Upload
          className={`h-7 w-7 transition-colors ${
            dragOver ? "text-[#0e7490] dark:text-[#67e8f9]" : "text-[#5f574f] dark:text-white/62"
          }`}
          strokeWidth={1.5}
        />
      </div>
      <p className="mt-4 text-base font-semibold leading-snug text-[#241f1a] dark:text-white">
        {prompt}
      </p>
      {decodeBusy && <DecodeStatus lang={lang} />}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={locked}
          className="max-w-full gap-1.5 whitespace-normal border border-[#171412] bg-[#171412] px-5 font-semibold text-[#fffaf2] shadow-[0_16px_34px_-26px_rgba(36,31,26,0.58)] transition-transform hover:bg-[#2f2924] active:scale-[0.97] focus-visible:ring-[#0f6f7f]/35"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {t.scan.chooseFile}
        </Button>
        {cameraShortcut && (
          <Button
            variant="outline"
            onClick={openCamera}
            disabled={locked}
            className="inline-flex max-w-full items-center gap-1.5 whitespace-normal border-[#06b6d4]/25 bg-[#e9fbff] px-5 font-semibold text-[#0e7490] shadow-[0_10px_24px_-22px_rgba(6,182,212,0.32)] transition-transform hover:border-[#06b6d4]/40 hover:bg-[#dff8ff] active:scale-[0.97] focus-visible:ring-[#06b6d4]/35 dark:bg-[#052b36] dark:text-[#67e8f9] dark:shadow-[0_10px_24px_-22px_rgba(6,182,212,0.42)] dark:hover:bg-[#063544]"
          >
            <Camera className="h-3.5 w-3.5" />
            {isMobile ? t.scan.takePhoto : t.camera.open}
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        disabled={locked}
        aria-label={t.scan.chooseFile}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleChange}
        disabled={locked}
        aria-label={t.scan.takePhoto}
        className="hidden"
      />
      {/* Phase 192s — privacy chip mirrors the panel variant for consistency. */}
      <p className="mt-6 inline-flex max-w-full items-center justify-center gap-1.5 rounded-full border border-[#241f1a]/10 bg-white/70 px-3 py-1 text-[11px] font-medium text-[#5f574f] dark:border-[#263149] dark:bg-[#0b1020] dark:text-white/62">
        <Lock className="h-3 w-3 text-[#67e8f9]" strokeWidth={2} />
        <span className="min-w-0 leading-snug">{t.scan.privateNote}</span>
      </p>
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={onPhoto}
      />
    </div>
  );
});

function DecodeStatus({ lang }: { lang: "th" | "en" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#06b6d4]/25 bg-[#052b36] px-3 py-1.5 text-xs font-semibold text-[#67e8f9]"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>{lang === "th" ? "กำลังตรวจรูป..." : "Checking photo..."}</span>
    </div>
  );
}
