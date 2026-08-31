"use client";

/**
 * Phase 135 - saved-preview gallery.
 *
 * Shows a small grid of past generations so the user can compare results
 * without re-running the generator. Each tile opens a lightweight viewer
 * dialog with the before/after slider (re-using BeforeAfter from the
 * SurgeryPreviewCard module wouldn't bring the full generator stack -
 * we render a static slider here on the saved data: URLs).
 *
 * Phase 192s - UI polish pass: refined thumbnail
 * grid with hover/active lift + after-image zoom, a more inviting empty
 * state, and a polished n/10 counter + "view all" chip. The Phase 192k
 * empty-state / hideWhenEmpty / viewAllHref behavior and the Phase 192n
 * iOS-share + touchAction:pan-y slider are preserved exactly.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Download,
  History,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { PROCEDURES } from "@/lib/ai-gemini-image";
import {
  deleteSavedPreview,
  loadSavedPreviews,
  type SavedPreview,
  type SavedPreviewVariant,
} from "@/lib/procedure-preview-history";
import {
  procedureVariantOptions,
  type ProcedureVariantId,
} from "@/lib/procedure-variant-options";
import { saveImage, isLikelyIOS } from "@/lib/download-image";
import { useT } from "@/lib/i18n";

interface SavedPreviewsPanelProps {
  /** Set this whenever a new preview was just generated so the panel
   *  refreshes. The value itself isn't read - it's a "bump" counter. */
  refreshToken?: number;
  // Phase 192k - when true, render nothing at all if no items are stored
  // (preserves the original "invisible until you generate something"
  // behavior used by the inline mount inside SurgeryFlow). The History
  // page leaves this `false` so users see an empty-state with a CTA.
  hideWhenEmpty?: boolean;
  // Phase 192k - when present, render a "View all" deep-link in the
  // panel header (next to the n/10 counter) pointing to this href.
  // Used by the SurgeryFlow inline mount to bridge to /history?tab=previews.
  viewAllHref?: string;
}

export function SavedPreviewsPanel({
  refreshToken,
  hideWhenEmpty = false,
  viewAllHref,
}: SavedPreviewsPanelProps) {
  const { lang, t } = useT();
  const [items, setItems] = useState<SavedPreview[]>([]);
  const [openItem, setOpenItem] = useState<SavedPreview | null>(null);

  useEffect(() => {
    setItems(loadSavedPreviews());
  }, [refreshToken]);

  function handleDelete(id: string) {
    const next = deleteSavedPreview(id);
    setItems(next);
    if (openItem?.id === id) setOpenItem(null);
  }

  if (items.length === 0) {
    // Phase 192k // discoverability: surface an empty state at /history so
    // first-time users learn the gallery exists. SurgeryFlow keeps the
    // legacy "render nothing" behavior via hideWhenEmpty=true.
    if (hideWhenEmpty) return null;
    return (
      // Phase 192s - empty state made inviting: a trio of ghost preview
      // frames behind the icon hints at what the gallery becomes once the
      // user generates something. Pure transform/opacity, no filters.
      <div className="mx-auto max-w-2xl rounded-3xl border border-[#241f1a]/10 bg-white/55 p-8 text-center shadow-[0_18px_60px_rgba(36,31,26,0.08)] backdrop-blur-md md:p-10">
        <div className="relative mx-auto flex h-20 w-full max-w-[180px] items-end justify-center">
          <span
            aria-hidden
            className="absolute bottom-1 h-14 w-14 -translate-x-9 rotate-[-9deg] rounded-xl border border-[#241f1a]/10 bg-white/35 backdrop-blur-md"
          />
          <span
            aria-hidden
            className="absolute bottom-1 h-14 w-14 translate-x-9 rotate-[9deg] rounded-xl border border-[#241f1a]/10 bg-white/35 backdrop-blur-md"
          />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[#3f6268]/25 bg-[#eef3f2] text-[#3f6268] shadow-[0_14px_34px_rgba(36,31,26,0.10)]">
            <Wand2 className="h-7 w-7" />
          </div>
        </div>
        <h2 className="mt-6 font-serif text-3xl font-light italic text-[#241f1a]">
          {t.previewsHistory.emptyTitle}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#5f574f]">
          {t.previewsHistory.emptySubtitle}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={"/surgery" as never}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#241f1a] px-5 py-2.5 text-sm font-medium text-white shadow-[0_14px_28px_-22px_rgba(36,31,26,0.65)] transition-transform duration-200 hover:bg-[#342d27] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f6268]/40"
          >
            <Sparkles className="h-4 w-4" />
            {t.previewsHistory.emptyCta}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#3f6268] flex items-center gap-1.5">
            <History className="h-3 w-3" />
            {lang === "th" ? "ภาพอ้างอิงที่บันทึกไว้" : "Saved references"}
          </p>
          <h3 className="font-serif italic font-light text-xl text-[#241f1a]">
            {lang === "th"
              ? "เปรียบเทียบภาพอ้างอิงที่เคยเตรียมไว้"
              : "Compare references you prepared before"}
          </h3>
        </div>
        {/* Phase 192s - counter as a tabular pill + tap-scale view-all chip. */}
        <div className="flex max-w-full flex-none flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[#241f1a]/10 bg-white/50 px-2.5 py-1 text-[11px] text-[#6a6259] tabular-nums shadow-[0_10px_26px_-24px_rgba(36,31,26,0.28)] backdrop-blur-md">
            <span className="font-medium text-[#241f1a]">{items.length}</span>
            <span className="text-[#6a6259]">/10</span>
          </span>
          {viewAllHref && (
            <Link
              href={viewAllHref as never}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-[#3f6268]/25 bg-[#eef3f2] px-3.5 py-2 text-[11px] text-[#3f6268] transition-transform duration-200 hover:bg-[#e4eeee] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f6268]/40"
            >
              {t.previewsHistory.viewAll}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Phase 192s - gallery tiles: rounded-2xl with a hover/active lift,
          a slow after-image zoom on hover (transform-only), a bottom
          readable caption band, and a
          combo badge. The delete button stays opacity-0 -> group-hover but
          is always reachable via focus + tap-scale for touch. */}
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((it) => {
          const label = previewLabel(it, lang);
          const subtitle = previewSubtitle(it, lang);
          return (
            <li
              key={it.id}
              className="group relative overflow-hidden rounded-2xl border border-[#241f1a]/10 bg-white/50 shadow-[0_12px_30px_-26px_rgba(36,31,26,0.28)] backdrop-blur-md transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#3f6268]/25 hover:bg-white/65 hover:shadow-[0_14px_34px_rgba(36,31,26,0.10)] active:scale-[0.98]"
            >
              <button
                type="button"
                onClick={() => setOpenItem(it)}
                className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f6268]/40"
              >
                <div className="aspect-square overflow-hidden bg-white/35 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={savedPreviewVariants(it)[0]!.afterDataUrl}
                    alt={label}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    draggable={false}
                  />
                  {/* Bottom scrim - keeps the caption legible on bright photos. */}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-[46%] border-t border-white/45 bg-white/70 backdrop-blur-md"
                  />
                  {it.comboKeys && it.comboKeys.length > 1 && (
                    <span className="absolute left-2 top-2 rounded-full border border-[#3f6268]/20 bg-[#eef3f2]/95 text-[#3f6268] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] shadow-[0_8px_18px_rgba(36,31,26,0.12)]">
                      {lang === "th"
                        ? `รวม ${it.comboKeys.length}`
                        : `combo ${it.comboKeys.length}`}
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-2.5 space-y-0.5">
                    <p
                      className="text-[12px] font-semibold text-[#241f1a] truncate"
                      title={label}
                    >
                      {label}
                    </p>
                    <p
                      className="text-[10px] text-[#6a6259] truncate"
                      title={subtitle}
                    >
                      {subtitle}
                    </p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(it.id);
                }}
                aria-label={lang === "th" ? "ลบ" : "Delete"}
                className="absolute right-2 top-2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-bad/25 bg-white/70 text-bad/80 opacity-100 shadow-[0_8px_18px_rgba(36,31,26,0.12)] backdrop-blur-md transition hover:bg-bad/[0.08] hover:text-bad active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad/40 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          );
        })}
      </ul>

      <ViewerDialog
        item={openItem}
        onClose={() => setOpenItem(null)}
        onDelete={handleDelete}
      />
    </div>
  );
}

function ViewerDialog({
  item,
  onClose,
  onDelete,
}: {
  item: SavedPreview | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const { lang } = useT();
  const [split, setSplit] = useState(50);
  const [selectedVariantId, setSelectedVariantId] =
    useState<ProcedureVariantId>("A");

  useEffect(() => {
    setSplit(50);
    setSelectedVariantId(item ? savedPreviewVariants(item)[0]!.id : "A");
  }, [item]);

  if (!item) return null;
  const label = previewLabel(item, lang);
  const allLabels = procedureLabelsForCombo(item, lang);
  const variants = savedPreviewVariants(item);
  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ?? variants[0]!;

  // Phase 192n - iOS-safe download. The previous `<a download>` opened
  // the image in a new tab on iPhone (no save). saveImage uses the
  // share sheet so users can pick "Save to Photos".
  function downloadAfter() {
    if (!item) return;
    void saveImage(
      selectedVariant.afterDataUrl,
      `doodee-preview-${item.procedureKey}-${selectedVariant.id}-${item.timestamp}.png`,
    );
  }

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="doodee-procedure-preview-dialog flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] min-w-0 select-none flex-col gap-0 overflow-hidden overflow-x-hidden rounded-[1.75rem] p-0 !left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 !border-white/10 !bg-[#070b1a] !text-white !shadow-[0_30px_100px_-50px_rgba(6,182,212,0.35)] !backdrop-blur-xl sm:w-[calc(100vw-2rem)] sm:max-w-5xl">
        <div className="shrink-0 space-y-1 border-b border-white/10 px-4 pb-3 pr-12 pt-5 sm:px-6 sm:pt-6">
          <DialogTitle className="text-xl leading-tight sm:text-2xl">
            {label}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-white/65">
            {formatRelative(item.timestamp, lang)} /{" "}
            {intensityLabel(item.intensity, lang)}
          </DialogDescription>
          {allLabels.length > 1 && (
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {allLabels.map((l, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full border border-cyan/25 bg-cyan/[0.08] px-2 py-0.5 text-[10px] text-cyan"
                >
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="no-scrollbar min-h-0 min-w-0 flex-1 touch-pan-y space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 sm:px-5 sm:py-5">
          {variants.length > 1 && (
            <div
              className="grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 backdrop-blur-md"
              aria-label={lang === "th" ? "เลือกระดับความชัด" : "Choose preview strength"}
            >
              {variants.map((variant) => {
                const active = variant.id === selectedVariant.id;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    data-testid={`saved-preview-variant-${variant.id}`}
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedVariantId(variant.id);
                      setSplit(50);
                    }}
                    className={`min-h-[44px] rounded-xl border px-2 py-2 text-center transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/40 ${
                      active
                        ? "border-cyan/55 bg-cyan/10 text-cyan"
                        : "border-white/10 bg-white/[0.03] text-white/65 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    <span className="block text-xs font-bold">
                      {savedVariantLevel(item, variant)}
                    </span>
                    <span className="mt-0.5 block truncate text-[9px] leading-tight">
                      {savedVariantLabel(item, variant, lang)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <SavedBeforeAfter
            beforeUrl={item.beforeDataUrl}
            afterUrl={selectedVariant.afterDataUrl}
            split={split}
            onSplit={setSplit}
            lang={lang}
          />
          {item.description && (
            <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[12px] leading-relaxed text-white/72 backdrop-blur-md">
              {item.description}
            </p>
          )}
        </div>
        {/* Phase 192s - dialog actions get 180ms tap-scale feedback +
            focus rings. downloadAfter keeps the Phase 192n iOS share path. */}
        <div className="flex shrink-0 min-w-0 flex-wrap justify-end gap-2 border-t border-white/10 bg-[#050816]/88 px-3 py-3 backdrop-blur-md sm:px-5">
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-bad/40 bg-bad/[0.08] px-4 py-2 text-xs text-bad/95 transition-transform duration-200 hover:bg-bad/[0.14] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad/50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {lang === "th" ? "ลบรายการนี้" : "Delete"}
          </button>
          <button
            type="button"
            onClick={downloadAfter}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-cyan/30 bg-cyan/[0.08] px-4 py-2 text-xs text-cyan transition-transform duration-200 hover:bg-cyan/[0.14] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/40"
          >
            <Download className="h-3.5 w-3.5" />
            {lang === "th" ? "ดาวน์โหลด" : "Download"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-medium text-[#0d0b1f] transition-transform duration-200 hover:bg-white/90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/40"
          >
            <X className="h-3.5 w-3.5" />
            {lang === "th" ? "ปิด" : "Close"}
          </button>
          {/* Phase 192n - iOS-only hint for the long-press alternative. */}
          {isLikelyIOS() && (
            <span className="mt-0.5 basis-full text-right text-[10px] italic text-white/55">
              {lang === "th"
                ? "เคล็ดลับ: แตะค้างที่ภาพเพื่อบันทึกลง Photos ได้เช่นกัน"
                : "Tip: long-press the image to save to Photos as well"}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SavedBeforeAfter({
  beforeUrl,
  afterUrl,
  split,
  onSplit,
  lang,
}: {
  beforeUrl: string;
  afterUrl: string;
  split: number;
  onSplit: (v: number) => void;
  lang: "th" | "en";
}) {
  const [aspect, setAspect] = useState<number | null>(null);

  // Phase 192q - stale-decode race fix. The viewer dialog can flip
  // between saved entries quickly (arrow keys, next/prev); when the
  // user advances before the prior Image finished decoding, the old
  // onload fired and stomped aspect with the wrong photo's ratio.
  // cancelled flag + onload=null on cleanup keeps state monotonic.
  useEffect(() => {
    if (!beforeUrl) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0) setAspect(w / h);
    };
    img.src = beforeUrl;
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [beforeUrl]);

  function onMove(clientX: number, target: HTMLDivElement) {
    const rect = target.getBoundingClientRect();
    const x = clientX - rect.left;
    onSplit(Math.max(0, Math.min(100, (x / rect.width) * 100)));
  }

  const frameWidthClass =
    aspect !== null && aspect < 0.85
      ? "max-w-[390px] sm:max-w-[420px]"
      : "max-w-[680px]";

  return (
    <div
      data-testid="saved-preview-before-after"
      role="slider"
      tabIndex={0}
      aria-label="Before / after comparison slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(split)}
      className={`relative mx-auto h-[min(54dvh,500px)] min-h-[260px] w-full ${frameWidthClass} min-w-0 select-none overflow-hidden rounded-3xl border border-white/10 bg-[#050816] shadow-[0_22px_80px_-46px_rgba(6,182,212,0.55)] outline-none focus-visible:ring-2 focus-visible:ring-cyan/45 sm:h-[min(62dvh,560px)] sm:min-h-[320px]`}
      // Phase 192n - touch-action: pan-y so vertical page-scroll keeps
      // working when the user's finger lands on the slider. Without
      // this the slider's onTouchMove captured the gesture, blocking
      // scroll on the saved-previews viewer dialog.
      style={{
        touchAction: "pan-y",
      }}
      onMouseMove={(e) => e.buttons === 1 && onMove(e.clientX, e.currentTarget)}
      onMouseDown={(e) => onMove(e.clientX, e.currentTarget)}
      onTouchMove={(e) =>
        e.touches[0] && onMove(e.touches[0].clientX, e.currentTarget)
      }
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const delta = e.key === "ArrowRight" ? 5 : -5;
        onSplit(Math.max(0, Math.min(100, split + delta)));
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeUrl}
        alt="before"
        className="absolute inset-0 h-full w-full object-contain object-center"
        draggable={false}
      />
      <AnimatePresence>
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 0 0 ${split}%)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={afterUrl}
            alt="after"
            className="absolute inset-0 h-full w-full object-contain object-center"
            draggable={false}
          />
        </m.div>
      </AnimatePresence>
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{ left: `${split}%` }}
      >
        <div className="absolute top-0 bottom-0 w-[3px] -translate-x-1/2 bg-white/80 shadow-[0_0_0_1px_rgba(6,182,212,0.25),0_14px_34px_rgba(6,182,212,0.32)]" />
        <div className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-white/16 shadow-[0_14px_34px_rgba(6,182,212,0.28)] backdrop-blur-md">
          <span className="text-xs font-bold tabular-nums text-white">
            ↔
          </span>
        </div>
      </div>
      <div className="absolute left-3 top-3 rounded-full border border-white/20 bg-[#050816]/78 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-md">
        {lang === "th" ? "ก่อน" : "before"}
      </div>
      <div className="absolute right-3 top-3 rounded-full border border-cyan/30 bg-cyan/[0.12] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan shadow-[0_10px_24px_rgba(6,182,212,0.18)] backdrop-blur-md">
        {lang === "th" ? "หลัง" : "after"}
      </div>
    </div>
  );
}

function intensityLabel(
  i: SavedPreview["intensity"],
  lang: "th" | "en",
): string {
  if (i === "mild") return lang === "th" ? "อ่อน" : "Mild";
  if (i === "strong") return lang === "th" ? "เข้ม" : "Strong";
  return lang === "th" ? "ปกติ" : "Normal";
}

/**
 * Phase 137 - resolve a saved preview into its display title.
 *
 * Combo entries get a "combined N procedures" header (since one image
 * represents multiple procedures), and we render the per-procedure
 * names in the subtitle / chip strip. Single entries render the
 * procedure label directly.
 */
function previewLabel(item: SavedPreview, lang: "th" | "en"): string {
  if (item.comboKeys && item.comboKeys.length > 1) {
    return lang === "th"
      ? `รวม ${item.comboKeys.length} หัตถการ`
      : `${item.comboKeys.length} procedures combined`;
  }
  const def = PROCEDURES.find((p) => p.key === item.procedureKey);
  if (!def) return item.procedureKey;
  return lang === "th" ? def.label_th : def.label_en;
}

const VARIANT_ORDER: readonly ProcedureVariantId[] = ["A", "B", "C", "D"];

function savedPreviewVariants(item: SavedPreview): SavedPreviewVariant[] {
  if (item.variants && item.variants.length > 0) {
    return [...item.variants].sort(
      (a, b) => VARIANT_ORDER.indexOf(a.id) - VARIANT_ORDER.indexOf(b.id),
    );
  }
  return [{ id: "A", afterDataUrl: item.afterDataUrl! }];
}

function savedVariantLabel(
  item: SavedPreview,
  variant: SavedPreviewVariant,
  lang: "th" | "en",
): string {
  const saved = lang === "th" ? variant.label_th : variant.label_en;
  if (saved) return saved;
  const option = procedureVariantOptions(item.procedureKey).find(
    (candidate) => candidate.id === variant.id,
  );
  return option ? (lang === "th" ? option.label_th : option.label_en) : variant.id;
}

function savedVariantLevel(
  item: SavedPreview,
  variant: SavedPreviewVariant,
): number | string {
  return procedureVariantOptions(item.procedureKey).find(
    (candidate) => candidate.id === variant.id,
  )?.level ?? variant.id;
}

/** Tiles use this for the second line - when combo, list all names. */
function previewSubtitle(item: SavedPreview, lang: "th" | "en"): string {
  const stamp = `${formatRelative(item.timestamp, lang)} / ${intensityLabel(item.intensity, lang)}`;
  if (item.comboKeys && item.comboKeys.length > 1) {
    const names = procedureLabelsForCombo(item, lang).join(" / ");
    return names ? `${names} / ${stamp}` : stamp;
  }
  return stamp;
}

/** Names of every procedure in a combo, in saved order. Empty for non-combo. */
function procedureLabelsForCombo(
  item: SavedPreview,
  lang: "th" | "en",
): string[] {
  if (!item.comboKeys || item.comboKeys.length === 0) return [];
  const out: string[] = [];
  for (const k of item.comboKeys) {
    const def = PROCEDURES.find((p) => p.key === k);
    if (!def) continue;
    out.push(lang === "th" ? def.label_th : def.label_en);
  }
  return out;
}

function formatRelative(ts: number, lang: "th" | "en"): string {
  const diffMs = Date.now() - ts;
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return lang === "th" ? "เมื่อกี้" : "Just now";
  if (m < 60) return lang === "th" ? `${m} นาทีที่แล้ว` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === "th" ? `${h} ชั่วโมงที่แล้ว` : `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return lang === "th" ? `${d} วันที่แล้ว` : `${d}d ago`;
  const date = new Date(ts);
  return date.toLocaleDateString(lang === "th" ? "th-TH" : "en-US", {
    calendar: "gregory",
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
  });
}
