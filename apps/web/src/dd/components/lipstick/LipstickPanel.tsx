"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  Download,
  Layers,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  LIPSTICK_COLORS,
  applyLipstick,
  type LipstickColor,
} from "@/lib/lip-recolor";
import { saveBlob } from "@/lib/download-image";
import { useTrackedTimeout } from "@/lib/use-tracked-timeout";
import type { ScanPhoto } from "@/types";

interface LipstickPanelProps {
  scan: ScanPhoto;
  onReset: () => void;
}

export function LipstickPanel({ scan, onReset }: LipstickPanelProps) {
  const { t, lang } = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selected, setSelected] = useState<LipstickColor | null>(null);
  const [intensity, setIntensity] = useState(0.85);
  const [showOriginal, setShowOriginal] = useState(false);
  const [downloadOk, setDownloadOk] =
    useState<"idle" | "saving" | "ok" | "err">("idle");
  // Phase 192q — tracked timeouts so the download-status revert doesn't
  // fire on an unmounted panel after the user navigates away mid-async.
  const scheduleTimeout = useTrackedTimeout();

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = scan.image.naturalWidth || scan.image.width;
    canvas.height = scan.image.naturalHeight || scan.image.height;
    ctx.drawImage(scan.image, 0, 0, canvas.width, canvas.height);
    if (!selected || showOriginal) return;
    try {
      applyLipstick(ctx, scan.landmarks, selected, { intensity });
    } catch {
      // Leave original on failure.
    }
  }, [intensity, scan.image, scan.landmarks, selected, showOriginal]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  async function handleDownload() {
    if (downloadOk === "saving") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloadOk("saving");
    try {
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png")
      );
      if (!blob) throw new Error("no blob");
      const tag = selected?.key ?? "original";
      await saveBlob(blob, `doodee-lip-${tag}.png`);
      setDownloadOk("ok");
    } catch {
      setDownloadOk("err");
    } finally {
      scheduleTimeout(() => setDownloadOk("idle"), 1500);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-5 overflow-x-clip">
      {/* Phase 74: nudge toward the unified try-on hub */}
      <a
        href="/try-on?effect=lips"
        className="mx-auto flex w-full max-w-md min-w-0 flex-col items-stretch gap-2 rounded-xl border border-white/60 bg-white/45 px-4 py-3 text-xs text-[#5e45b8] shadow-[0_12px_32px_-28px_rgba(36,31,26,0.34)] backdrop-blur-md transition hover:bg-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between"
      >
        <span className="flex min-w-0 items-center gap-2 leading-relaxed">
          <Layers className="h-3.5 w-3.5 flex-none" />
          {t.tryOn.unifiedHubBanner}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 font-medium text-[#5e45b8]">
          {t.tryOn.unifiedHubCta}
          <ArrowRight className="h-3 w-3" />
        </span>
      </a>

      <div className="relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden rounded-2xl border border-white/60 bg-white/35 shadow-[0_18px_52px_-40px_rgba(36,31,26,0.38)] backdrop-blur-md">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={
            !selected || showOriginal
              ? t.lipstick.canvasAriaOriginal
              : t.lipstick.canvasAriaApplied.replace(
                  "{name}",
                  localizedName(selected, lang)
                )
          }
          className="w-full h-full object-contain block select-none"
        />
        <AnimatePresence>
          {selected && (
            <m.button
              type="button"
              onMouseDown={() => setShowOriginal(true)}
              onMouseUp={() => setShowOriginal(false)}
              onMouseLeave={() => setShowOriginal(false)}
              onTouchStart={() => setShowOriginal(true)}
              onTouchEnd={() => setShowOriginal(false)}
              onTouchCancel={() => setShowOriginal(false)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="absolute left-3 top-3 inline-flex h-11 max-w-[calc(100%-1.5rem)] items-center rounded-full border border-white/60 bg-white/55 px-3 text-[11px] text-[#241f1a] shadow-[0_10px_24px_-20px_rgba(36,31,26,0.4)] backdrop-blur-md transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35 select-none"
            >
              {showOriginal ? t.lipstick.original : t.lipstick.compareHold}
            </m.button>
          )}
        </AnimatePresence>
        {selected && (
          <div className="absolute right-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-full border border-white/60 bg-white/50 px-3 py-1 text-[11px] text-[#5e45b8] shadow-[0_10px_24px_-22px_rgba(122,91,214,0.38)] backdrop-blur-md">
            {localizedName(selected, lang)}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#766e65] text-center">
          {t.lipstick.paletteLabel}
        </p>
        <div className="mx-auto grid w-full max-w-md grid-cols-5 gap-2 sm:max-w-2xl sm:[grid-template-columns:repeat(13,_minmax(0,_1fr))]">
          {LIPSTICK_COLORS.map((c) => {
            const active = selected?.key === c.key;
            const css = `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setSelected(c)}
                aria-label={localizedName(c, lang)}
                aria-pressed={active}
                className={`group relative aspect-square rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60 ${
                  active
                    ? "border-[#241f1a] shadow-[0_12px_24px_-18px_rgba(36,31,26,0.55)]"
                    : "border-[#241f1a]/10 hover:border-[#241f1a]/30"
                }`}
                style={{ background: css }}
              >
                {active && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check className="h-4 w-4 text-white drop-shadow-[0_0_4px_rgba(0,0,0,0.6)]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="mx-auto flex w-full max-w-md min-w-0 items-center gap-3 px-1">
          <Sparkles className="h-3.5 w-3.5 text-[#5e45b8] flex-none" />
          <span className="text-[11px] text-[#6f625a] tabular-nums w-10">
            {t.lipstick.intensity}
          </span>
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.02}
            value={intensity}
            onChange={(e) => setIntensity(parseFloat(e.target.value))}
            className="slider-premium h-5 min-w-0 flex-1"
          />
          <span className="text-[11px] text-[#6f625a] tabular-nums w-9 text-right">
            {Math.round(intensity * 100)}%
          </span>
        </div>
      )}

      <div className="flex min-w-0 flex-wrap items-center justify-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => setSelected(null)}
          disabled={!selected}
          className="inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-lg border border-white/60 bg-white/45 px-3.5 py-2 text-center text-xs text-[#5f574f] shadow-[0_10px_26px_-24px_rgba(36,31,26,0.34)] backdrop-blur-md transition hover:bg-white/65 hover:text-[#241f1a] disabled:pointer-events-none disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
          {t.lipstick.reset}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloadOk === "saving"}
          className="inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-lg bg-[#241f1a] px-5 py-2 text-center text-sm font-medium text-white shadow-[0_16px_34px_-26px_rgba(36,31,26,0.58)] transition hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {downloadOk === "saving" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {downloadOk === "saving"
            ? t.tryOnV2.actions.saving
            : downloadOk === "ok"
            ? t.lipstick.saved
            : downloadOk === "err"
              ? t.lipstick.saveErr
              : t.lipstick.save}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={downloadOk === "saving"}
          className="inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-lg border border-white/60 bg-white/45 px-3.5 py-2 text-center text-xs text-[#5f574f] shadow-[0_10px_26px_-24px_rgba(36,31,26,0.34)] backdrop-blur-md transition hover:bg-white/65 hover:text-[#241f1a] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {t.lipstick.changePhoto}
        </button>
      </div>

      <p className="text-center text-[10px] text-[#7c746d] leading-relaxed max-w-sm mx-auto">
        {t.lipstick.privacyNote}
      </p>
    </div>
  );
}

function localizedName(c: LipstickColor, lang: "th" | "en"): string {
  if (lang !== "th") return c.name;
  const TH: Record<string, string> = {
    "nude-rose": "นู้ดโรส",
    "soft-mauve": "ม่วงนิ่ม",
    cocoa: "โกโก้",
    "rose-pink": "ชมพูโรส",
    "coral-peach": "พีชโคร่อล",
    "hot-pink": "ชมพูสด",
    "classic-red": "แดงคลาสสิก",
    cherry: "เชอร์รี",
    scarlet: "แดงสด",
    brick: "อิฐ",
    berry: "เบอร์รี",
    wine: "ไวน์",
    plum: "พลัม",
  };
  return TH[c.key] ?? c.name;
}
