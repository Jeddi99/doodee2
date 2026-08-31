"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Camera,
  ChevronsLeftRight,
  ChevronsRight,
  Download,
  Eye,
  Heart,
  ImagePlus,
  Loader2,
  RotateCcw,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
// Phase 182b — Dynamic-import CameraCapture. It owns ~510 lines that
// touch `getUserMedia` + a torch / autofocus setup; not needed until
// the user explicitly opens the camera dialog. Keeping it static was
// bloating the try-on chunk by ~30 KB of code that 90%+ of users never
// trigger on mobile (they upload from gallery, not the in-page camera).
import dynamic from "next/dynamic";
const CameraCapture = dynamic(
  () =>
    import("@/components/scan/CameraCapture").then((m) => ({
      default: m.CameraCapture,
    })),
  { ssr: false }
);
import { decodeOffThread } from "@/components/scan/PhotoUpload";
import { useT } from "@/lib/i18n";
import { HAIR_COLORS, type HairColor } from "@/lib/hair-recolor";
import { LIPSTICK_COLORS, type LipstickColor } from "@/lib/lip-recolor";
import { EYE_COLORS, type EyeColor } from "@/lib/eye-color-recolor";
import { BLUSH_COLORS, type BlushColor } from "@/lib/blush-recolor";
import {
  activeEffectCount,
  type EffectKey,
  type MakeoverLook,
} from "@/lib/makeover";
import { recordColorUse } from "@/lib/tryon-recent";
import { useTrackedTimeout } from "@/lib/use-tracked-timeout";
import { saveBlob } from "@/lib/download-image";
import type { ScanPhoto } from "@/types";
import {
  canvasToBlob,
  renderTryOnCanvas,
  renderTryOnCompare,
} from "./TryOnCanvas";
import { TryOnHudFrame } from "./TryOnHudFrame";

export type TryOnPanelStatus =
  | "idle"
  | "loading"
  | "processing"
  | "error"
  | "ready";

export type HairMaskStatus = "idle" | "loading" | "ready" | "error";

interface TryOnPanelProps {
  status: TryOnPanelStatus;
  scan?: ScanPhoto;
  statusText?: string;
  errorText?: string;
  onPhoto: (image: HTMLImageElement) => void | Promise<void>;
  onResetPhoto: () => void;
  initialEffect?: EffectKey;
  hairMask?: Uint8Array | null;
  hairMaskStatus?: HairMaskStatus;
  initialLook?: MakeoverLook | null;
  sharedLookActive?: boolean;
}

interface NamedColor {
  key: string;
  name: string;
  rgb: [number, number, number];
}

const LAYERS: EffectKey[] = ["hair", "eyes", "lips", "blush"];
const DEFAULT_INTENSITY: Record<EffectKey, number> = {
  hair: 0.55,
  eyes: 0.5,
  lips: 0.52,
  blush: 0.38,
};
const MIN_INTENSITY: Record<EffectKey, number> = {
  hair: 0.25,
  eyes: 0.2,
  lips: 0.25,
  blush: 0.18,
};
const ICONS: Record<EffectKey, LucideIcon> = {
  hair: Scissors,
  eyes: Eye,
  lips: Heart,
  blush: Sparkles,
};

export function TryOnPanel({
  status,
  scan,
  statusText,
  errorText,
  onPhoto,
  onResetPhoto,
  initialEffect = "hair",
  hairMask,
  hairMaskStatus = "idle",
  initialLook,
  sharedLookActive = false,
}: TryOnPanelProps) {
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const beforeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compareCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [look, setLook] = useState<MakeoverLook>(() => initialLook ?? {});
  const [tab, setTab] = useState<EffectKey>(initialEffect);
  const [downloadState, setDownloadState] =
    useState<"idle" | "saving" | "ok" | "err">("idle");
  const [renderBusy, setRenderBusy] = useState(false);
  // Phase 192q — tracked timeout so the download-state revert doesn't
  // fire on an unmounted panel after the user navigates away mid-async.
  const scheduleTimeout = useTrackedTimeout();
  const activeCount = useMemo(() => activeEffectCount(look), [look]);

  useEffect(() => {
    if (status !== "ready" || !scan) {
      setRenderBusy(false);
      return;
    }
    setRenderBusy(true);
    let frameId = 0;
    const timeoutId = window.setTimeout(() => {
      frameId = requestAnimationFrame(() => {
        renderTryOnCanvas(scan, look, hairMask, canvasRef);
        renderTryOnCompare(scan, canvasRef, beforeCanvasRef, compareCanvasRef);
        setRenderBusy(false);
      });
    }, 16);
    return () => {
      window.clearTimeout(timeoutId);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [status, scan, look, hairMask]);

  function queueRender() {
    if (status === "ready") setRenderBusy(true);
  }

  function replaceLook(next: MakeoverLook) {
    queueRender();
    setLook(next);
  }

  function mutateLook(updater: (prev: MakeoverLook) => MakeoverLook) {
    queueRender();
    setLook(updater);
  }

  function applyLayerColor(layer: EffectKey, color: NamedColor) {
    const intensity = getLayerValue(look, layer)?.intensity ?? DEFAULT_INTENSITY[layer];
    mutateLook((prev) => setLayer(prev, layer, color, intensity));
    recordColorUse(layer, color.key);
  }

  function updateIntensity(layer: EffectKey, intensity: number) {
    const current = getLayerValue(look, layer);
    if (!current) return;
    mutateLook((prev) => setLayer(prev, layer, current.color, intensity));
  }

  function clearLayer(layer: EffectKey) {
    mutateLook((prev) => removeLayer(prev, layer));
  }

  async function downloadCanvas() {
    if (downloadState === "saving") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloadState("saving");
    try {
      await yieldToPaint();
      const blob = await canvasToBlob(canvas);
      if (!blob) throw new Error("no blob");
      await saveBlob(blob, "doodee-tryon.png");
      setDownloadState("ok");
    } catch {
      setDownloadState("err");
    } finally {
      scheduleTimeout(() => setDownloadState("idle"), 1500);
    }
  }

  function clearAll() {
    replaceLook({});
  }

  function resetAll() {
    replaceLook({});
  }

  useEffect(() => {
    if (initialLook) {
      setRenderBusy(status === "ready");
      setLook(initialLook);
    }
  }, [initialLook, status]);

  const showControls = status === "ready";

  return (
    <div
      className={
        showControls
          ? "min-w-0 space-y-5 overflow-x-clip pb-bottom-nav"
          : "tryon-idle-panel min-w-0 overflow-x-clip"
      }
    >
      <div
        className={
          showControls
            ? "grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
            : "grid min-w-0 place-items-center"
        }
      >
        <div className="min-w-0 space-y-3">
          <TryOnHudFrame compact={status !== "ready"} subduedGuide={status === "ready"}>
            <StageContent
              status={status}
              scan={scan}
              statusText={statusText}
              errorText={errorText}
              activeCount={activeCount}
              renderBusy={renderBusy}
              hairMaskStatus={hairMaskStatus}
              canvasRef={canvasRef}
              onPhoto={onPhoto}
              onResetPhoto={onResetPhoto}
              sharedLookActive={sharedLookActive}
            />
          </TryOnHudFrame>
          <p className="text-center text-xs text-[#6d655c]">
            {t.tryOnV2.privacyFooter}
          </p>
        </div>

        {showControls ? (
          <LayerControlPanel
            activeTab={tab}
            activeCount={activeCount}
            look={look}
            scan={scan}
            beforeCanvasRef={beforeCanvasRef}
            compareCanvasRef={compareCanvasRef}
            downloadState={downloadState}
            busy={renderBusy}
            hairMaskStatus={hairMaskStatus}
            onTabChange={setTab}
            onSelectColor={applyLayerColor}
            onCustomColor={applyLayerColor}
            onIntensity={updateIntensity}
            onClearLayer={clearLayer}
            onClearAll={clearAll}
            onDownload={downloadCanvas}
            onResetAll={resetAll}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Phase 158.30 — Drag-to-compare before/after slider for the main stage.
 *
 * Layers:
 *   1. Bottom: the makeover canvas (full size, after).
 *   2. Top: the original photo revealed by translated wrappers.
 *   3. A vertical line + drag handle at the divider position.
 *
 * Uses pointer events for unified mouse + touch + pen. `touch-none` on
 * the container prevents the browser from interpreting the drag as a
 * scroll on mobile. Keyboard: focus the handle + arrow keys nudge ±2%.
 */
function BeforeAfterStage({
  scan,
  canvasRef,
  activeCount,
  renderBusy,
  hairMaskStatus,
  onResetPhoto,
  ariaLabel,
}: {
  scan: ScanPhoto;
  canvasRef: RefObject<HTMLCanvasElement>;
  activeCount: number;
  renderBusy: boolean;
  hairMaskStatus: HairMaskStatus;
  onResetPhoto: () => void;
  ariaLabel: string;
}) {
  const { t, lang } = useT();
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingPositionRef = useRef(50);
  const draggingRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isSwipingRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function pctFromX(clientX: number): number {
    const rect = rectRef.current ?? containerRef.current?.getBoundingClientRect();
    if (!rect) return 50;
    if (rect.width <= 0) return 50;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, pct));
  }

  function commitPosition(next: number): void {
    pendingPositionRef.current = next;
    setPosition(next);
  }

  function queuePosition(clientX: number, immediate = false): void {
    pendingPositionRef.current = pctFromX(clientX);
    if (immediate) {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      commitPosition(pendingPositionRef.current);
      return;
    }
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      commitPosition(pendingPositionRef.current);
    });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    draggingRef.current = true;
    rectRef.current = e.currentTarget.getBoundingClientRect();
    if (e.pointerType === "touch") {
      touchStartRef.current = { x: e.clientX, y: e.clientY };
      isSwipingRef.current = false;
    } else {
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* setPointerCapture can throw on some setups — non-fatal */
      }
      queuePosition(e.clientX, true);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!draggingRef.current) return;
    if (e.pointerType === "touch" && touchStartRef.current) {
      const dx = e.clientX - touchStartRef.current.x;
      const dy = e.clientY - touchStartRef.current.y;
      if (!isSwipingRef.current) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) {
          isSwipingRef.current = true;
          try {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
          } catch {}
        }
      }
      if (isSwipingRef.current) {
        queuePosition(e.clientX);
      }
    } else {
      queuePosition(e.clientX);
    }
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>): void {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    rectRef.current = null;
    touchStartRef.current = null;
    isSwipingRef.current = false;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPosition((p) => {
        const next = Math.max(0, p - 2);
        pendingPositionRef.current = next;
        return next;
      });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPosition((p) => {
        const next = Math.min(100, p + 2);
        pendingPositionRef.current = next;
        return next;
      });
    } else if (e.key === "Home") {
      e.preventDefault();
      commitPosition(0);
    } else if (e.key === "End") {
      e.preventDefault();
      commitPosition(100);
    }
  }

  const beforeLayerStyle: React.CSSProperties = {
    transform: `translate3d(calc(${position}% - 100%),0,0)`,
    willChange: "transform",
  };
  const beforeImageStyle: React.CSSProperties = {
    backgroundImage: `url("${scan.image.src}")`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "contain",
    transform: `translate3d(calc(100% - ${position}%),0,0)`,
    willChange: "transform",
  };
  const controlStyle: React.CSSProperties = {
    transform: `translate3d(${position}%,0,0)`,
    willChange: "transform",
  };
  const handleControlStyle: React.CSSProperties = {
    transform: `translate3d(clamp(22px, ${position}%, calc(100% - 22px)),0,0)`,
    willChange: "transform",
  };

  return (
    <div className="relative max-w-full min-w-0">
      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        className="relative mx-auto w-fit max-w-full overflow-hidden rounded-[28px] border border-white/60 bg-white/35 shadow-[0_24px_80px_rgba(36,31,26,0.12)] backdrop-blur-md touch-pan-y"
      >
        {/* Layer 1: after (makeover canvas, full) */}
        {/* Phase 192t — viewport-relative max-height so the preview can't
            grow so tall on a short phone that the palette / apply / save
            controls below it land under the fixed MobilePricingNav. 48dvh
            caps mobile; the 560px ceiling keeps the desktop size, min-h
            avoids a collapsed frame before the canvas paints. */}
        <canvas
          ref={canvasRef}
          width={scan.image.naturalWidth || scan.image.width}
          height={scan.image.naturalHeight || scan.image.height}
          className="block h-auto max-h-[48dvh] max-w-full sm:max-h-[560px]"
        />

        {/* Layer 2: before (original image, transform-revealed) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={beforeLayerStyle}
        >
          <div className="h-full w-full" style={beforeImageStyle} />
        </div>

        {renderBusy ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-[2px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/60 px-3 py-2 text-xs font-medium text-[#067e96] shadow-[0_12px_34px_rgba(36,31,26,0.10)] backdrop-blur-md">
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              {t.tryOnV2.stage.rendering}
            </div>
          </div>
        ) : null}

        {hairMaskStatus === "loading" ? (
          <div className="pointer-events-none absolute inset-x-4 bottom-14 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/60 px-3 py-1.5 text-[11px] font-medium text-[#067e96] shadow-[0_10px_24px_rgba(36,31,26,0.10)] backdrop-blur-md">
              <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
              {t.tryOnV2.stage.refiningHair}
            </div>
          </div>
        ) : null}

        {/* Labels */}
        <span className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/60 bg-white/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#625a52] backdrop-blur-md">
          {lang === "th" ? "ก่อน" : "Before"}
        </span>
        <span className="pointer-events-none absolute right-3 top-3 rounded-full border border-white/60 bg-white/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#067e96] backdrop-blur-md">
          {lang === "th" ? "หลัง" : "After"}
        </span>

        {/* Divider line */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-full"
          style={controlStyle}
        >
          <div className="h-full w-px bg-[#241f1a]/55" />
        </div>

        {/* Drag handle */}
        <div
          role="slider"
          aria-label={lang === "th" ? "เลื่อนเทียบก่อนและหลัง" : "Slide to compare before and after"}
          aria-valuenow={Math.round(position)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          onKeyDown={onKeyDown}
          style={handleControlStyle}
          className="group absolute inset-y-0 left-0 z-20 w-full focus:outline-none"
        >
          <div className="absolute left-0 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-white/60 bg-white/60 shadow-[0_12px_30px_rgba(36,31,26,0.18)] backdrop-blur-md transition group-focus:ring-2 group-focus:ring-[#067e96]/35">
            <ChevronsLeftRight className="h-4 w-4 text-[#241f1a]" />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onResetPhoto}
        className="absolute bottom-4 left-4 z-10 inline-flex min-h-11 items-center rounded-full border border-white/60 bg-white/60 px-4 py-2 text-sm font-medium text-[#241f1a] shadow-[0_10px_26px_-22px_rgba(36,31,26,0.34)] backdrop-blur-md transition hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-[#067e96]/35"
      >
        {t.tryOnV2.actions.changePhoto}
      </button>

      <p className="mt-2 text-center text-[11px] text-[#6d655c]">
        {lang === "th"
          ? `ลากแถบกลางเพื่อเทียบก่อน/หลัง · ${activeCount} เลเยอร์`
          : `Drag the divider to compare before/after · ${activeCount} layers`}
      </p>
    </div>
  );
}

function StageContent({
  status,
  scan,
  statusText,
  errorText,
  activeCount,
  renderBusy,
  hairMaskStatus,
  canvasRef,
  onPhoto,
  onResetPhoto,
  sharedLookActive,
}: {
  status: TryOnPanelStatus;
  scan?: ScanPhoto;
  statusText?: string;
  errorText?: string;
  activeCount: number;
  renderBusy: boolean;
  hairMaskStatus: HairMaskStatus;
  canvasRef: RefObject<HTMLCanvasElement>;
  onPhoto: (image: HTMLImageElement) => void | Promise<void>;
  onResetPhoto: () => void;
  sharedLookActive: boolean;
}) {
  const { t } = useT();
  if (status === "ready" && scan) {
    return (
      <BeforeAfterStage
        scan={scan}
        canvasRef={canvasRef}
        activeCount={activeCount}
        renderBusy={renderBusy}
        hairMaskStatus={hairMaskStatus}
        onResetPhoto={onResetPhoto}
        ariaLabel={t.tryOn.canvasAriaApplied.replace(
          "{n}",
          activeCount.toString()
        )}
      />
    );
  }
  if (status === "loading" || status === "processing") {
    return (
      <TryOnProcessingCard
        status={status}
        statusText={statusText ?? t.tryOnV2.stage.detecting}
        onResetPhoto={onResetPhoto}
      />
    );
  }
  if (status === "error") {
    return (
      <div className="rounded-3xl border border-warn/30 bg-white/45 px-8 py-10 text-center shadow-[0_24px_70px_rgba(36,31,26,0.08)] backdrop-blur-md">
        <p className="text-sm text-warn">{errorText}</p>
        <button
          type="button"
          onClick={onResetPhoto}
          className="mt-4 rounded-full border border-white/60 bg-white/45 px-4 py-2 text-xs text-[#241f1a] shadow-[0_10px_26px_-24px_rgba(36,31,26,0.34)] backdrop-blur-md transition hover:bg-white/65"
        >
          {t.scan.tryAnother}
        </button>
      </div>
    );
  }
  return (
    <TryOnUploadCard
      onPhoto={onPhoto}
      hint={t.tryOnV2.stage.hint}
      prompt={t.tryOnV2.stage.prompt}
      sharedLookActive={sharedLookActive}
    />
  );
}

function TryOnProcessingCard({
  status,
  statusText,
  onResetPhoto,
}: {
  status: "loading" | "processing";
  statusText: string;
  onResetPhoto: () => void;
}) {
  const { t } = useT();
  const progress = status === "loading" ? 42 : 72;
  return (
    <div
      aria-busy="true"
      className="w-full max-w-[430px] rounded-3xl border border-white/60 bg-white/45 px-6 py-7 text-center shadow-[0_24px_70px_rgba(36,31,26,0.10)] backdrop-blur-md sm:px-8"
    >
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-white/60 bg-white/45 shadow-[0_0_44px_rgba(6,126,150,0.14)]">
        <Loader2 className="h-8 w-8 animate-spin text-[#067e96] motion-reduce:animate-none" />
      </div>
      <p className="mt-5 text-sm font-medium text-[#241f1a]">{statusText}</p>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/50">
        <div
          className="h-full rounded-full bg-[#067e96] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-5 grid gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded-full bg-white/45"
            style={{ width: `${82 - i * 12}%`, animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onResetPhoto}
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-white/60 bg-white/45 px-4 py-2 text-sm font-medium text-[#241f1a] shadow-[0_10px_26px_-24px_rgba(36,31,26,0.34)] backdrop-blur-md transition hover:bg-white/65 focus:outline-none focus:ring-2 focus:ring-[#067e96]/35"
      >
        {t.tryOnV2.actions.changePhoto}
      </button>
    </div>
  );
}

function TryOnUploadCard({
  onPhoto,
  prompt,
  hint,
  sharedLookActive,
}: {
  onPhoto: (image: HTMLImageElement) => void | Promise<void>;
  prompt: string;
  hint: string;
  sharedLookActive: boolean;
}) {
  const { t, lang } = useT();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraFileRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const mountedRef = useRef(true);
  const uploadTokenRef = useRef(0);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      uploadTokenRef.current += 1;
    };
  }, []);

  function handleFile(file: File) {
    if (isPreparing) return;
    setLoadError(null);
    const name = file.name ?? "";
    if (
      file.type === "image/heic" ||
      file.type === "image/heif" ||
      /\.heic$/i.test(name) ||
      /\.heif$/i.test(name)
    ) {
      setLoadError(
        lang === "th"
          ? "ยังไม่รองรับไฟล์ HEIC โปรดอัปโหลด JPG หรือ PNG"
          : "HEIC is not supported. Upload a JPG or PNG."
      );
      return;
    }
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setLoadError(
        lang === "th"
          ? "ไฟล์ใหญ่เกิน 10 MB โปรดเลือกไฟล์ที่เล็กลง"
          : "File is over 10 MB. Upload a smaller image."
      );
      return;
    }
    const token = uploadTokenRef.current + 1;
    uploadTokenRef.current = token;
    setIsPreparing(true);
    decodeOffThread(file)
      .then(async (img) => {
        if (!mountedRef.current || uploadTokenRef.current !== token) {
          revokeBlobImage(img);
          return;
        }
        await onPhoto(img);
      })
      .catch(() => {
        if (mountedRef.current && uploadTokenRef.current === token) {
          setLoadError(t.scan.failed);
        }
      })
      .finally(() => {
        if (mountedRef.current && uploadTokenRef.current === token) {
          setIsPreparing(false);
        }
      });
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (isPreparing) return;
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (isPreparing) return;
        const file = e.dataTransfer.files[0];
        if (file?.type.startsWith("image/")) handleFile(file);
      }}
      aria-busy={isPreparing}
      className={`w-full max-w-[430px] rounded-3xl border px-5 py-5 text-center shadow-[0_24px_80px_rgba(36,31,26,0.12)] transition sm:px-8 sm:py-8 ${
        dragOver
          ? "border-[#067e96]/35 bg-white/60 backdrop-blur-md"
          : "border-white/60 bg-white/45 backdrop-blur-md"
      }`}
    >
      <Upload className="mx-auto h-7 w-7 text-[#067e96] sm:h-9 sm:w-9" strokeWidth={1.5} />
      <p className="mt-3 text-sm font-medium text-[#241f1a] sm:mt-4">{prompt}</p>
      {sharedLookActive ? (
        <p className="mt-2 text-[11px] text-[#067e96]">
          {t.tryOn.sharedLookHint}
        </p>
      ) : null}
      {loadError ? (
        <p role="alert" className="mt-2 text-[11px] text-warn">
          {loadError}
        </p>
      ) : null}
      {isPreparing ? (
        <InlineProgress label={t.tryOnV2.stage.preparing} progress={22} />
      ) : null}
      <div className="mt-4 flex flex-col justify-center gap-2.5 sm:mt-5 sm:flex-row sm:gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={isPreparing}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#241f1a] px-5 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(36,31,26,0.18)] transition hover:bg-[#332c25] focus:outline-none focus:ring-2 focus:ring-[#067e96]/35 disabled:cursor-not-allowed disabled:opacity-45 sm:w-[170px]"
        >
          {isPreparing ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
          {t.tryOnV2.stage.choose}
        </button>
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          disabled={isPreparing}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/60 bg-white/45 px-5 text-sm font-semibold text-[#067e96] shadow-[0_10px_26px_-24px_rgba(36,31,26,0.34)] backdrop-blur-md transition hover:bg-white/65 focus:outline-none focus:ring-2 focus:ring-[#067e96]/35 disabled:cursor-not-allowed disabled:opacity-45 sm:w-[170px]"
        >
          <Camera className="h-4 w-4" />
          {t.tryOnV2.stage.camera}
        </button>
      </div>
      <p className="mt-4 text-[10px] text-[#6d655c] sm:mt-5">{hint}</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onInputChange}
        disabled={isPreparing}
        className="hidden"
      />
      <input
        ref={cameraFileRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={onInputChange}
        disabled={isPreparing}
        className="hidden"
      />
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(image) => {
          setCameraOpen(false);
          void onPhoto(image);
        }}
      />
    </div>
  );
}

function InlineProgress({
  label,
  progress,
}: {
  label: string;
  progress: number;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-white/60 bg-white/40 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.48)] backdrop-blur">
      <div className="flex items-center gap-2 text-xs font-medium text-[#067e96]">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
        {label}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/50">
        <div
          className="h-full rounded-full bg-[#067e96] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function LayerControlPanel({
  activeTab,
  activeCount,
  look,
  scan,
  compareCanvasRef,
  beforeCanvasRef,
  downloadState,
  busy,
  hairMaskStatus,
  onTabChange,
  onSelectColor,
  onCustomColor,
  onIntensity,
  onClearLayer,
  onClearAll,
  onDownload,
  onResetAll,
}: {
  activeTab: EffectKey;
  activeCount: number;
  look: MakeoverLook;
  scan?: ScanPhoto;
  compareCanvasRef: RefObject<HTMLCanvasElement>;
  beforeCanvasRef: RefObject<HTMLCanvasElement>;
  downloadState: "idle" | "saving" | "ok" | "err";
  busy: boolean;
  hairMaskStatus: HairMaskStatus;
  onTabChange: (layer: EffectKey) => void;
  onSelectColor: (layer: EffectKey, color: NamedColor) => void;
  onCustomColor: (layer: EffectKey, color: NamedColor) => void;
  onIntensity: (layer: EffectKey, value: number) => void;
  onClearLayer: (layer: EffectKey) => void;
  onClearAll: () => void;
  onDownload: () => void;
  onResetAll: () => void;
}) {
  const { t } = useT();
  const current = getLayerValue(look, activeTab);
  const palette = getPalette(activeTab).slice(0, 8);
  const Icon = ICONS[activeTab];

  return (
    <aside className="min-w-0 rounded-3xl border border-white/60 bg-white/45 p-4 shadow-[0_24px_80px_rgba(36,31,26,0.10)] backdrop-blur-md sm:p-5 lg:sticky lg:top-6">
      <TabRow activeTab={activeTab} onTabChange={onTabChange} />
      <div className="mt-5 space-y-5">
        {busy && hairMaskStatus !== "loading" ? (
          <InlineProgress label={t.tryOnV2.stage.rendering} progress={58} />
        ) : null}

        <section>
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#6d655c]">
            <Icon className="h-3.5 w-3.5 text-[#067e96]" />
            {t.tryOnV2.tabs[activeTab]}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {palette.map((color) => (
              <ColorButton
                key={color.key}
                color={color}
                selected={current?.color.key === color.key}
                disabled={busy}
                onClick={() => onSelectColor(activeTab, color)}
              />
            ))}
            <CustomColorButton
              disabled={busy}
              onPick={(color) => onCustomColor(activeTab, color)}
            />
          </div>
        </section>

        <IntensitySlider
          value={current?.intensity ?? DEFAULT_INTENSITY[activeTab]}
          min={MIN_INTENSITY[activeTab]}
          disabled={busy || !current}
          onChange={(value) => onIntensity(activeTab, value)}
        />

        {hairMaskStatus === "loading" ? (
          <InlineProgress label={t.tryOnV2.stage.refiningHair} progress={66} />
        ) : null}

        <ActiveLayers
          look={look}
          activeCount={activeCount}
          disabled={busy}
          onClearAll={onClearAll}
          onClearLayer={onClearLayer}
        />

        <ComparePanel
          beforeCanvasRef={beforeCanvasRef}
          compareCanvasRef={compareCanvasRef}
        />

        <ActionButtons
          canDownload={Boolean(scan)}
          downloadState={downloadState}
          busy={busy}
          onDownload={onDownload}
          onResetAll={onResetAll}
        />
      </div>
    </aside>
  );
}

function TabRow({
  activeTab,
  onTabChange,
}: {
  activeTab: EffectKey;
  onTabChange: (layer: EffectKey) => void;
}) {
  const { t } = useT();
  return (
    <div className="grid max-w-full min-w-0 grid-cols-4 gap-1 rounded-full border border-white/60 bg-white/40 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-md">
      {LAYERS.map((layer) => {
        const Icon = ICONS[layer];
        const active = activeTab === layer;
        return (
          <button
            key={layer}
            type="button"
            onClick={() => onTabChange(layer)}
            className={`inline-flex min-h-[44px] min-w-0 items-center justify-center gap-1 rounded-full px-1.5 py-2 text-[11px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#067e96]/35 sm:gap-1.5 sm:px-3 sm:text-xs ${
              active
                ? "bg-[#241f1a] text-white shadow-[0_12px_28px_rgba(36,31,26,0.14)]"
                : "text-[#625a52] hover:text-[#241f1a]"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{t.tryOnV2.tabs[layer]}</span>
          </button>
        );
      })}
    </div>
  );
}

function ColorButton({
  color,
  selected,
  disabled,
  onClick,
}: {
  color: NamedColor;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={color.name}
      aria-pressed={selected}
      className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#067e96]/35 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <div
        className={`h-8 w-8 rounded-full border transition ${
          selected
            ? "border-[#067e96] ring-2 ring-[#067e96]/35 ring-offset-2 ring-offset-white"
            : "border-[#241f1a]/15"
        }`}
        style={{ background: rgbCss(color.rgb) }}
      />
    </button>
  );
}

function CustomColorButton({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (color: NamedColor) => void;
}) {
  const { lang } = useT();

  return (
    <label
      className={`relative flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-white/45 text-lg text-[#625a52] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-md transition focus-within:ring-2 focus-within:ring-[#067e96]/35 ${
        disabled
          ? "cursor-not-allowed opacity-45"
          : "cursor-pointer hover:scale-110 hover:text-[#241f1a]"
      }`}
    >
      +
      <input
        type="color"
        aria-label={lang === "th" ? "เลือกสีเอง" : "Custom color"}
        disabled={disabled}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none border-0 p-0 opacity-0"
        onChange={(e) => onPick(customColor(e.target.value))}
      />
    </label>
  );
}

function IntensitySlider({
  value,
  min,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const { t } = useT();
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#625a52]">{t.tryOnV2.controls.intensity}</span>
        <span className="tabular-nums text-[#241f1a]">
          {Math.round(value * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={1}
        step={0.02}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="slider-premium h-11 w-full disabled:opacity-40"
        aria-label={t.tryOnV2.controls.intensity}
      />
    </section>
  );
}

function ActiveLayers({
  look,
  activeCount,
  disabled,
  onClearAll,
  onClearLayer,
}: {
  look: MakeoverLook;
  activeCount: number;
  disabled: boolean;
  onClearAll: () => void;
  onClearLayer: (layer: EffectKey) => void;
}) {
  const { t } = useT();
  if (activeCount === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#241f1a]">
          {t.tryOnV2.controls.activeLayers}
        </p>
        <button
          type="button"
          onClick={onClearAll}
          disabled={disabled}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs text-[#5e45b8] transition hover:bg-white/55 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {t.tryOnV2.controls.clearAll}
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {LAYERS.map((layer) => {
          const value = getLayerValue(look, layer);
          if (!value) return null;
          return (
            <LayerChip
              key={layer}
              label={t.tryOnV2.tabs[layer]}
              color={rgbCss(value.color.rgb)}
              disabled={disabled}
              onRemove={() => onClearLayer(layer)}
            />
          );
        })}
      </div>
    </section>
  );
}

function LayerChip({
  label,
  color,
  disabled,
  onRemove,
}: {
  label: string;
  color: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/45 px-2.5 py-1 text-xs text-[#241f1a] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-md">
      <span className="h-3 w-3 rounded-full border border-[#241f1a]/15" style={{ background: color }} />
      {label}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${label}`}
        className="-mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6d655c] transition hover:bg-white/55 hover:text-[#241f1a] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function ComparePanel({
  beforeCanvasRef,
  compareCanvasRef,
}: {
  beforeCanvasRef: RefObject<HTMLCanvasElement>;
  compareCanvasRef: RefObject<HTMLCanvasElement>;
}) {
  const { t } = useT();
  return (
    <section className="space-y-3">
      <p className="text-sm font-medium text-[#241f1a]">
        {t.tryOnV2.compare.title}
      </p>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <Thumb label={t.tryOnV2.compare.before}>
          <canvas ref={beforeCanvasRef} className="h-full w-full object-cover" />
        </Thumb>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-white/45 text-[#625a52] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-md">
          <ChevronsRight className="h-4 w-4" />
        </span>
        <Thumb label={t.tryOnV2.compare.after} active>
          <canvas ref={compareCanvasRef} className="h-full w-full object-cover" />
        </Thumb>
      </div>
    </section>
  );
}

function Thumb({
  label,
  active = false,
  children,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative h-[100px] min-w-0 overflow-hidden rounded-xl border bg-white/35 backdrop-blur ${
        active ? "border-[#067e96]/35" : "border-white/60"
      }`}
    >
      {children}
      <div className="absolute inset-x-0 bottom-0 bg-white/60 px-2 py-1.5 text-center text-[11px] text-[#625a52] backdrop-blur-md">
        {label}
      </div>
    </div>
  );
}

function ActionButtons({
  canDownload,
  downloadState,
  busy,
  onDownload,
  onResetAll,
}: {
  canDownload: boolean;
  downloadState: "idle" | "saving" | "ok" | "err";
  busy: boolean;
  onDownload: () => void;
  onResetAll: () => void;
}) {
  const { t } = useT();
  const downloadText =
    downloadState === "saving"
      ? t.tryOnV2.actions.saving
      : downloadState === "ok"
      ? t.tryOnV2.actions.saved
      : downloadState === "err"
        ? t.tryOnV2.actions.saveErr
        : t.tryOnV2.actions.download;
  const saving = downloadState === "saving";
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={onDownload}
        disabled={!canDownload || saving || busy}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#241f1a] text-sm font-semibold text-white shadow-[0_16px_34px_rgba(36,31,26,0.18)] transition hover:bg-[#332c25] focus:outline-none focus:ring-2 focus:ring-[#067e96]/35 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {downloadText}
      </button>
      <button
        type="button"
        onClick={onResetAll}
        disabled={busy || saving}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/60 bg-white/45 text-sm text-[#625a52] shadow-[0_10px_26px_-24px_rgba(36,31,26,0.34)] backdrop-blur-md transition hover:bg-white/65 hover:text-[#241f1a] focus:outline-none focus:ring-2 focus:ring-[#067e96]/35 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <RotateCcw className="h-4 w-4" />
        {t.tryOnV2.actions.reset}
      </button>
    </section>
  );
}

function getPalette(layer: EffectKey): readonly NamedColor[] {
  if (layer === "hair") return HAIR_COLORS;
  if (layer === "eyes") return EYE_COLORS;
  if (layer === "lips") return LIPSTICK_COLORS;
  return BLUSH_COLORS;
}

function getLayerValue(look: MakeoverLook, layer: EffectKey) {
  if (layer === "hair") return look.hair;
  if (layer === "eyes") return look.eyes;
  if (layer === "lips") return look.lips;
  return look.blush;
}

function setLayer(
  look: MakeoverLook,
  layer: EffectKey,
  color: NamedColor,
  intensity: number
): MakeoverLook {
  if (layer === "hair") return { ...look, hair: { color: color as HairColor, intensity } };
  if (layer === "eyes") return { ...look, eyes: { color: color as EyeColor, intensity } };
  if (layer === "lips") return { ...look, lips: { color: color as LipstickColor, intensity } };
  return { ...look, blush: { color: color as BlushColor, intensity } };
}

function removeLayer(look: MakeoverLook, layer: EffectKey): MakeoverLook {
  if (layer === "hair") {
    const { hair: _removed, ...rest } = look;
    return rest;
  }
  if (layer === "eyes") {
    const { eyes: _removed, ...rest } = look;
    return rest;
  }
  if (layer === "lips") {
    const { lips: _removed, ...rest } = look;
    return rest;
  }
  const { blush: _removed, ...rest } = look;
  return rest;
}

function rgbCss(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function customColor(hex: string): NamedColor {
  const clean = hex.replace("#", "");
  const n = Number.parseInt(clean, 16);
  const rgb: [number, number, number] = [
    (n >> 16) & 255,
    (n >> 8) & 255,
    n & 255,
  ];
  return { key: `custom-${clean}`, name: "Custom", rgb };
}

function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function revokeBlobImage(image: HTMLImageElement): void {
  if (!image.src.startsWith("blob:")) return;
  try { URL.revokeObjectURL(image.src); } catch {}
}
