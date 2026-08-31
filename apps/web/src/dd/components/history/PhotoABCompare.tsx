"use client";

/**
 * Phase 139 — visual A/B compare for two saved scans.
 *
 * Renders a draggable slider that wipes between the two `photoDataUrl`s,
 * with overall-score overlays on each side. Skips silently when either
 * record is missing a saved photo (older records pre Phase 138).
 */

import { useEffect, useRef, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { ArrowLeftRight, Camera, TrendingDown, TrendingUp } from "lucide-react";
import type { ScanRecord } from "@/lib/scan-history";
import { useT } from "@/lib/i18n";

interface PhotoABCompareProps {
  earlier: ScanRecord;
  later: ScanRecord;
}

export function PhotoABCompare({ earlier, later }: PhotoABCompareProps) {
  const { lang } = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(50);
  const [aspect, setAspect] = useState<number | null>(null);

  // Use the EARLIER photo's aspect ratio as the canvas — keeps the
  // before/after slider consistent with the surgery-preview pattern.
  useEffect(() => {
    const src = earlier.photoDataUrl ?? later.photoDataUrl;
    if (!src) return;
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0) setAspect(w / h);
    };
    img.src = src;
  }, [earlier.photoDataUrl, later.photoDataUrl]);

  // Both photos required — skip the panel entirely when either is
  // missing, so older records don't get a broken half-slider.
  if (!earlier.photoDataUrl || !later.photoDataUrl) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-[#241f1a]/15 bg-white/40 p-4 backdrop-blur-md">
        <Camera className="mt-0.5 h-3.5 w-3.5 flex-none text-[#8f8379]" />
        <p className="text-[11px] leading-relaxed text-[#625a52]">
          {lang === "th"
            ? "ต้องมีรูปที่บันทึกไว้ทั้งสองรายงานจึงจะแสดงภาพเปรียบเทียบได้ — รายการเก่าจะแสดงเฉพาะตัวเลข"
            : "Visual comparison needs saved photos from both reports. Older records show numbers only."}
        </p>
      </div>
    );
  }

  function onMove(clientX: number) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = clientX - rect.left;
    setSplit(Math.max(0, Math.min(100, (x / rect.width) * 100)));
  }

  const overallDelta = later.overall - earlier.overall;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[#7c746d]">
          <ArrowLeftRight className="h-3 w-3" />
          {lang === "th" ? "เลื่อนเพื่อเปรียบเทียบภาพ" : "Drag to compare"}
        </p>
        <DeltaBadge delta={overallDelta} lang={lang} />
      </div>
      <div
        ref={wrapRef}
        className="relative cursor-ew-resize select-none overflow-hidden rounded-2xl border border-[#241f1a]/10 bg-white/35 backdrop-blur-md"
        // Phase 192n — touch-action: pan-y so vertical page-scroll
        // passes through this A/B compare slider on mobile. Without
        // it the slider's onTouchMove captured the gesture and the
        // history page became scroll-locked when finger landed here.
        style={{
          ...(aspect ? { aspectRatio: aspect } : {}),
          touchAction: "pan-y",
        }}
        onMouseMove={(e) => e.buttons === 1 && onMove(e.clientX)}
        onMouseDown={(e) => onMove(e.clientX)}
        onTouchMove={(e) => e.touches[0] && onMove(e.touches[0].clientX)}
      >
        {/* Earlier photo — full layer */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={earlier.photoDataUrl}
          alt={lang === "th" ? "รูปรายงานครั้งก่อน" : "earlier report"}
          className="absolute inset-0 w-full h-full object-cover object-center"
          draggable={false}
        />
        {/* Later photo — clipped */}
        <AnimatePresence>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 0 0 ${split}%)` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={later.photoDataUrl}
              alt={lang === "th" ? "รูปรายงานครั้งหลัง" : "later report"}
              className="absolute inset-0 w-full h-full object-cover object-center"
              draggable={false}
            />
          </m.div>
        </AnimatePresence>

        {/* Handle */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: `${split}%` }}
        >
          <div className="absolute bottom-0 top-0 w-[2px] -translate-x-1/2 bg-white/72 shadow-[0_8px_24px_-16px_rgba(36,31,26,0.55)]" />
          <div className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/68 shadow-[0_14px_34px_-26px_rgba(36,31,26,0.55)] backdrop-blur-md">
            <ArrowLeftRight className="h-[1.1rem] w-[1.1rem] text-[#0d0b1f]" />
          </div>
        </div>

        {/* Score chips */}
        <ScoreChip
          align="left"
          label={lang === "th" ? "ก่อน" : "earlier"}
          date={earlier.timestamp}
          score={earlier.overall}
          lang={lang}
        />
        <ScoreChip
          align="right"
          label={lang === "th" ? "หลัง" : "later"}
          date={later.timestamp}
          score={later.overall}
          lang={lang}
          accent
        />
      </div>
    </div>
  );
}

function ScoreChip({
  align,
  label,
  date,
  score,
  lang,
  accent = false,
}: {
  align: "left" | "right";
  label: string;
  date: number;
  score: number;
  lang: "th" | "en";
  accent?: boolean;
}) {
  const dateStr = new Date(date).toLocaleDateString(
    lang === "th" ? "th-TH" : "en-US",
    { calendar: "gregory", timeZone: "Asia/Bangkok", day: "numeric", month: "short" }
  );
  return (
    <div
      className={`absolute top-3 ${align === "left" ? "left-3" : "right-3"} rounded-xl border border-white/60 backdrop-blur-md px-3 py-1.5 space-y-0.5 ${
        accent ? "bg-[#241f1a]/85 text-white" : "bg-white/70 text-[#241f1a]"
      }`}
    >
      <p
        className={`text-[9px] uppercase tracking-wider ${
          accent ? "text-white/85" : "text-[#625a52]"
        }`}
      >
        {label} · {dateStr}
      </p>
      <p className="text-sm font-medium tabular-nums leading-none">
        {score.toFixed(1)}
      </p>
    </div>
  );
}

function DeltaBadge({ delta, lang }: { delta: number; lang: "th" | "en" }) {
  if (Math.abs(delta) < 0.05) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#241f1a]/10 bg-white/70 px-2 py-0.5 text-[10px] text-[#625a52] backdrop-blur-md">
        {lang === "th" ? "เท่าเดิม" : "no change"}
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] tabular-nums ${
        up
          ? "border-good/30 bg-good/[0.08] text-good"
          : "border-warn/30 bg-warn/[0.08] text-warn"
      }`}
    >
      {up ? (
        <TrendingUp className="h-2.5 w-2.5" />
      ) : (
        <TrendingDown className="h-2.5 w-2.5" />
      )}
      {up ? "+" : "−"}
      {Math.abs(delta).toFixed(1)}
    </span>
  );
}
