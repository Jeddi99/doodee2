"use client";

/**
 * Phase 127 — AI Surgery Preview.
 *
 * Lets the user pick a cosmetic-procedure preset, then sends their face
 * photo + the procedure's prompt to Gemini 2.5 Flash Image (Nano Banana).
 * Renders the generated "after" image side-by-side with the original via
 * a draggable slider — the classic surgeon's before/after comparison.
 *
 * Safety:
 *   - Big disclaimer on the card: AI-imagined, not surgical preview.
 *   - Conservative prompt rules baked into ai-gemini-image.ts (preserve
 *     identity, subtle changes, no exaggeration).
 *   - No medical claims rendered.
 */

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Clock,
  Download,
  RefreshCw,
  RotateCcw,
  Scissors,
  Sparkles,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
// Phase 180 — `loadApiKey` removed; Gemini calls now hit server proxy.
import {
  alignAfterToBeforeFace,
  callGeminiProcedureVariantGrid,
  findProcedureInfo,
  PROCEDURES,
  type Intensity,
  type ProcedureDef,
  type ProcedureInfo,
  type ProcedureKey,
  type ProcedureVariantId,
  type ProcedureVariantGridResult,
} from "@/lib/ai-gemini-image";
import {
  CORE_PROCEDURES,
  PROCEDURE_AREAS,
  coreProcedureKeys,
} from "@/lib/ai-procedure-catalog";
import {
  getProcedureRegions,
  renderDiffHeatmap,
  runObedienceCheck,
  type ObedienceReport,
} from "@/lib/obedience-check";
import {
  validateProcedurePreviewPostCheck,
  type ProcedurePreviewPostCheckReport,
} from "@/lib/procedure-preview-postcheck";
import {
  validateProcedureVariantOrder,
  type ProcedureVariantOrderReport,
} from "@/lib/procedure-variant-order";
import { detectPreviewLandmarks } from "@/lib/procedure-mask";
import {
  assessProcedureBaseline,
  type ProcedureDirectionReport,
} from "@/lib/procedure-preview-semantics";
import { ObediencePanel } from "@/components/results/ObediencePanel";
import { savePreview } from "@/lib/procedure-preview-history";
import { saveImage, isLikelyIOS } from "@/lib/download-image";
import { useT } from "@/lib/i18n";
import { humanizeError } from "@/lib/humanizeError";
// Phase 192u — global paywall gate. When a preview gen fails because the
// user's preview quota ran out (or premium expired → downgraded to 0
// quota), route them to the subscription dialog instead of the generic
// error overlay.
import { useQuotaGate, openGateFromError } from "@/lib/quota-gate";
import type { Gender } from "@/types";

interface SurgeryPreviewCardProps {
  image: HTMLImageElement;
  gender: Gender;
  /** Phase 133 — when set (e.g. from the AI recommendation list), the
   *  card opens that procedure's preview immediately. */
  initialPicked?: ProcedureKey | null;
  /** Phase 133 — called when the preview dialog closes so a parent
   *  (the recommendation list) can clear the queued selection. */
  onPreviewClosed?: () => void;
  /** Phase 137 — when the parent is walking a queue of procedures
   *  one-by-one, this tells the dialog what step we're on so the user
   *  sees "Reviewing 2 of 3" and knows more results are coming. */
  queueProgress?: { index: number; total: number };
  selectionSeed?: readonly SeededProcedureSelection[];
}

interface SeededProcedureSelection {
  key: ProcedureKey;
}

const PREVIEW_INTENSITY: Intensity = "normal";
const ACTIVE_PROCEDURE_KEYS = new Set<ProcedureKey>(coreProcedureKeys());
const BASELINE_GATED_PROCEDURE_KEYS = new Set<ProcedureKey>([
  "botox_crows_feet",
  "botox_forehead",
]);

type BaselineAvailability =
  | "checking"
  | "available"
  | "not-visible"
  | "unavailable";

function isActiveProcedureKey(key: ProcedureKey): boolean {
  return ACTIVE_PROCEDURE_KEYS.has(key);
}

function semanticIntensityForVariant(variant: ProcedureVariantId): Intensity {
  if (variant === "A") return "normal";
  if (variant === "B") return "normal";
  return "strong";
}

// Phase 611 — picker runs on the curated core catalog: 5 facial areas +
// body (weight loss). Legacy keys stay valid for old saved previews but
// are no longer offered here.

function kindBadge(
  kind: ProcedureDef["kind"],
  lang: "th" | "en",
): {
  label: string;
  className: string;
} {
  if (kind === "injectable") {
    return {
      label: lang === "th" ? "หัตถการ" : "Procedure",
      className: "border-[#067e96]/25 bg-[#eff8f8]/70 text-[#067e96] backdrop-blur-md",
    };
  }
  if (kind === "non_invasive") {
    return {
      label: lang === "th" ? "ไม่ผ่าตัด" : "Non-invasive",
      className: "border-[#2f7d5f]/25 bg-[#effaf5] text-[#2f7d5f]",
    };
  }
  return {
    label: lang === "th" ? "ผ่าตัด" : "Surgical",
    className: "border-[#9a6a2f]/25 bg-[#fff7e8] text-[#8a5a24]",
  };
}

function isProcedureDef(value: ProcedureDef | undefined): value is ProcedureDef {
  return Boolean(value);
}

export function SurgeryPreviewCard({
  image,
  gender,
  initialPicked,
  onPreviewClosed,
  queueProgress,
  selectionSeed,
}: SurgeryPreviewCardProps) {
  const { lang } = useT();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<ProcedureKey | null>(null);
  const [selected, setSelected] = useState<ProcedureKey | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [baselineAvailability, setBaselineAvailability] = useState<
    Partial<Record<ProcedureKey, BaselineAvailability>>
  >({});
  const [baselineDiagnostics, setBaselineDiagnostics] = useState<
    Partial<Record<ProcedureKey, ProcedureDirectionReport | null>>
  >({});
  // Phase 615 — this card renders inside an `<m.div initial={{y:8}}
  // animate={{y:0}}>` wrapper (SurgeryFlow.tsx). Framer Motion leaves the
  // `transform` inline style on that div permanently (it never clears it
  // back to none after the animation settles), and per the CSS spec any
  // non-none `transform` on an ancestor makes it the containing block for
  // `position: fixed` descendants. That silently turned the "selected
  // procedure" action panel below from viewport-fixed into
  // motion-div-relative, so it rendered wherever that div's flow put it
  // instead of pinned above the bottom nav — the "no generate button"
  // bug. Portal it straight to <body> (same technique MobilePricingNav
  // already uses) so it's guaranteed to be fixed against the real
  // viewport regardless of any animated ancestor.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checking = Object.fromEntries(
      [...BASELINE_GATED_PROCEDURE_KEYS].map((key) => [key, "checking"]),
    ) as Partial<Record<ProcedureKey, BaselineAvailability>>;
    setBaselineAvailability(checking);
    setBaselineDiagnostics({});

    void detectPreviewLandmarks(image)
      .then((detected) => {
        if (cancelled) return;
        const next: Partial<Record<ProcedureKey, BaselineAvailability>> = {};
        const diagnostics: Partial<
          Record<ProcedureKey, ProcedureDirectionReport | null>
        > = {};
        for (const key of BASELINE_GATED_PROCEDURE_KEYS) {
          const procedure = PROCEDURES.find((item) => item.key === key);
          if (!detected || !procedure) {
            next[key] = "unavailable";
            diagnostics[key] = null;
            continue;
          }
          const baseline = assessProcedureBaseline({
            image,
            landmarks: detected.landmarks,
            procedure,
          });
          diagnostics[key] = baseline;
          next[key] = baseline === null
            ? "unavailable"
            : baseline.passed
              ? "available"
              : "not-visible";
        }
        setBaselineDiagnostics(diagnostics);
        setBaselineAvailability(next);
      })
      .catch(() => {
        if (cancelled) return;
        const unavailable = Object.fromEntries(
          [...BASELINE_GATED_PROCEDURE_KEYS].map((key) => [key, "unavailable"]),
        ) as Partial<Record<ProcedureKey, BaselineAvailability>>;
        setBaselineAvailability(unavailable);
      });

    return () => {
      cancelled = true;
    };
  }, [image]);
  // Phase 180 — Gemini always available via server proxy; no per-user
  // key gating. Server returns 503 if `GEMINI_API_SECRET` isn't set.
  const hasKey = true;

  // Phase 133 — when the parent (RecommendPanel) hands us an initial
  // procedure, open the dialog immediately. Reset back to null when the
  // dialog closes so the same selection can be re-clicked later.
  useEffect(() => {
    if (
      initialPicked &&
      isActiveProcedureKey(initialPicked) &&
      (!BASELINE_GATED_PROCEDURE_KEYS.has(initialPicked) ||
        baselineAvailability[initialPicked] === "available")
    ) {
      setPicked(initialPicked);
      setOpen(true);
    }
  }, [baselineAvailability, initialPicked]);

  useEffect(() => {
    if (!selectionSeed || selectionSeed.length === 0) return;
    const next = selectionSeed.find(
      (item) =>
        isActiveProcedureKey(item.key) &&
        (!BASELINE_GATED_PROCEDURE_KEYS.has(item.key) ||
          baselineAvailability[item.key] === "available"),
    );
    if (!next) return;
    setSelected(next.key);
    setPicked(null);
    setOpen(false);
  }, [baselineAvailability, selectionSeed]);

  useEffect(() => {
    setSelected((current) => {
      if (!current || !BASELINE_GATED_PROCEDURE_KEYS.has(current)) return current;
      return baselineAvailability[current] === "available" ? current : null;
    });
  }, [baselineAvailability]);

  function toggleProcedure(key: ProcedureKey) {
    if (
      BASELINE_GATED_PROCEDURE_KEYS.has(key) &&
      baselineAvailability[key] !== "available"
    ) return;
    setSelected((prev) => (prev === key ? null : key));
  }

  function clearSelection() {
    setSelected(null);
    setConfirmOpen(false);
  }

  function confirmGenerate() {
    if (!selected) return;
    setConfirmOpen(false);
    setPicked(selected);
    setOpen(true);
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setPicked(null);
      onPreviewClosed?.();
    }
  }

  const selectedProcedures = (selected ? [selected] : [])
    .filter(
      (key) =>
        isActiveProcedureKey(key) &&
        (!BASELINE_GATED_PROCEDURE_KEYS.has(key) ||
          baselineAvailability[key] === "available"),
    )
    .map((key) => PROCEDURES.find((p) => p.key === key))
    .filter(isProcedureDef);
  return (
    <div
      className={`space-y-5 transition-[padding] duration-300 ${selectedProcedures.length > 0 ? "pb-64" : ""}`}
    >
      {process.env.NODE_ENV !== "production" && (
        <output
          data-testid="procedure-baseline-qa-diagnostics"
          data-qa={JSON.stringify(baselineDiagnostics)}
          className="sr-only"
        >
          {JSON.stringify(baselineDiagnostics)}
        </output>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#3f6268]">
            {lang === "th" ? "เลือกหัตถการเอง" : "Pick your own"}
          </p>
          <h3 className="font-serif italic font-light text-2xl">
            {lang === "th"
              ? "ดูทิศทางภาพก่อนตัดสินใจจริง"
              : "Review a direction before you decide"}
          </h3>
          <p className="text-xs text-muted/80 max-w-md leading-relaxed">
            {lang === "th"
              ? "เลือกหัตถการเพื่อดูภาพอ้างอิงเชิงทิศทาง โดยคงโครงหน้าเดิมไว้"
              : "Choose a procedure to view a directional reference while preserving your original face."}
          </p>
          <p className="inline-flex rounded-full border border-warn/25 bg-warn/[0.05] px-2 py-1 text-[10px] font-medium text-warn/90">
            {lang === "th"
              ? "โหมดเลือกเอง - ไม่ใช่คำแนะนำจาก AI"
              : "Manual preview - not an AI recommendation"}
          </p>
        </div>
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#241f1a] shadow-[0_14px_28px_-22px_rgba(36,31,26,0.65)]">
          <Scissors className="h-4 w-4 text-white" />
        </div>
      </div>

      {/* Warning banner */}
      <div className="rounded-xl border border-warn/25 bg-warn/[0.05] p-3 flex items-start gap-2.5">
        <AlertTriangle className="h-3.5 w-3.5 text-warn/90 mt-0.5 flex-none" />
        <p className="text-[11px] text-warn/90 leading-relaxed">
          {lang === "th"
            ? "ภาพอ้างอิงเป็นแนวคิดเท่านั้น ไม่ใช่ผลลัพธ์ทางการแพทย์จริง โปรดปรึกษาแพทย์ผู้เชี่ยวชาญก่อนตัดสินใจทำหัตถการใด ๆ"
            : "Directional reference only, not a medical prediction. Consult a board-certified specialist before any procedure."}
        </p>
      </div>

      {/* Procedure picker grouped by category */}
      <div className="space-y-4">
        {PROCEDURE_AREAS.map((cat) => {
          const items = CORE_PROCEDURES[cat.key]
            .map((key) => PROCEDURES.find((p) => p.key === key))
            .filter(isProcedureDef);
          if (items.length === 0) return null;
          return (
            <div key={cat.key} className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-[#6a6259]">
                {lang === "th" ? cat.label_th : cat.label_en}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((p) => {
                  const badge = kindBadge(p.kind, lang);
                  const isSelected = selected === p.key;
                  const unsupported = p.key === "body_fat_reduction";
                  const baselineStatus = BASELINE_GATED_PROCEDURE_KEYS.has(p.key)
                    ? baselineAvailability[p.key] ?? "checking"
                    : null;
                  const baselineBlocked = baselineStatus !== null &&
                    baselineStatus !== "available";
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => toggleProcedure(p.key)}
                      data-procedure-key={p.key}
                      aria-pressed={isSelected}
                      disabled={!hasKey || unsupported || baselineBlocked}
                      className={`group text-left rounded-xl border px-3 py-2.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        isSelected
                          ? "border-[#067e96]/45 bg-[#eef8f8]/70 shadow-[0_18px_44px_-36px_rgba(6,126,150,0.4)] backdrop-blur-md"
                          : "border-[#241f1a]/10 bg-white/50 backdrop-blur-md hover:border-[#3f6268]/25 hover:bg-white/68"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[#241f1a] truncate">
                          {lang === "th" ? p.label_th : p.label_en}
                        </p>
                        {isSelected ? (
                          <Check className="h-3.5 w-3.5 flex-none text-[#067e96]" />
                        ) : (
                          <Sparkles className="h-3 w-3 text-[#3f6268]/70 opacity-0 group-hover:opacity-100 transition flex-none" />
                        )}
                      </div>
                      <p className="text-[11px] text-[#6a6259] mt-0.5">
                        {lang === "th" ? p.hint_th : p.hint_en}
                      </p>
                      <span
                        className={`mt-1.5 inline-block rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      {unsupported && (
                        <span className="ml-1.5 mt-1.5 inline-block rounded-full border border-warn/25 bg-warn/[0.06] px-2 py-0.5 text-[9px] uppercase tracking-wider text-warn/90">
                          {lang === "th" ? "ต้องใช้ภาพเต็มตัว" : "Full-body capture required"}
                        </span>
                      )}
                      {baselineBlocked && (
                        <span className="ml-1.5 mt-1.5 inline-block rounded-full border border-warn/25 bg-warn/[0.06] px-2 py-0.5 text-[9px] uppercase tracking-wider text-warn/90">
                          {baselineStatus === "checking"
                            ? lang === "th"
                              ? "กำลังตรวจภาพ"
                              : "Checking photo"
                            : baselineStatus === "not-visible"
                              ? lang === "th"
                                ? "ภาพนี้ยังไม่เห็นริ้วรอยเป้าหมาย"
                                : "No visible target in this photo"
                              : lang === "th"
                                ? "ตรวจจุดเป้าหมายจากภาพนี้ไม่ได้"
                                : "Target cannot be verified from this photo"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {mounted &&
        selectedProcedures.length > 0 &&
        createPortal(
          <div className="doodee-selected-procedure-panel fixed inset-x-3 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-xl space-y-3 rounded-2xl border border-[#067e96]/20 bg-[#eef8f8]/95 p-3.5 shadow-[0_22px_70px_-34px_rgba(6,126,150,0.6)] backdrop-blur-md sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[min(28rem,calc(100vw-3rem))]">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#241f1a] px-2 text-[13px] font-semibold text-white">
                    1
                  </span>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#067e96]">
                    {lang === "th" ? "รายการที่เลือก" : "Selected"}
                  </p>
                </div>
                <p className="mt-1 truncate text-xs font-medium text-[#241f1a]">
                  {selectedProcedures[0]
                    ? lang === "th"
                      ? selectedProcedures[0].label_th
                      : selectedProcedures[0].label_en
                    : ""}
                </p>
                <p className="mt-1 text-[10px] text-[#6f625a]">
                  {lang === "th"
                    ? "เลือกได้ 1 หัตถการต่อครั้ง ระบบจะสร้าง 4 แบบให้เลือกทรง"
                    : "Choose 1 procedure per preview. Doodee generates 4 directions."}
                </p>
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex min-h-[44px] flex-none items-center justify-center rounded-full border border-[#241f1a]/10 bg-white/50 px-3 text-[11px] font-medium text-[#6f625a] backdrop-blur-md transition hover:bg-white/70 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/30"
              >
                {lang === "th" ? "ล้าง" : "Clear"}
              </button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                data-testid="surgery-generate-preview"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#241f1a] px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_36px_-26px_rgba(36,31,26,0.72)] transition hover:bg-[#342d27] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
              >
                <Sparkles className="h-4 w-4" />
                {lang === "th" ? "สร้าง 4 แบบ · ใช้ 1 เครดิต" : "Generate 4 options · uses 1 credit"}
              </button>
            </div>
          </div>,
          document.body
        )}

      {!hasKey && (
        <p className="text-[11px] text-[#6a6259] text-center italic">
          {lang === "th"
            ? "ระบบภาพอ้างอิงยังไม่พร้อมใช้งาน"
            : "Reference image service is not available right now"}
        </p>
      )}

      <PreviewDialog
        open={open}
        onOpenChange={handleOpenChange}
        procedureKey={picked}
        image={image}
        gender={gender}
        queueProgress={queueProgress}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          overlayClassName="doodee-confirm-generate-overlay bg-[#02040c]/50"
          className="doodee-confirm-generate-dialog max-w-md rounded-3xl border border-[#241f1a]/10 bg-[#fffaf2] p-0 text-[#241f1a] shadow-[0_30px_90px_-50px_rgba(36,31,26,0.55)]"
        >
          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <DialogTitle className="text-xl font-semibold text-[#241f1a]">
                  {lang === "th" ? "ยืนยันก่อนสร้างภาพ" : "Confirm before generating"}
                </DialogTitle>
                <DialogDescription className="text-xs leading-relaxed text-[#6f625a]">
                  {lang === "th"
                    ? "ใช้ 1 เครดิตเมื่อสร้างภาพอ้างอิงสำเร็จเท่านั้น"
                    : "Uses 1 credit only when a usable reference is created."}
                </DialogDescription>
              </div>
              <span className="inline-flex flex-none items-center gap-1 rounded-full border border-[#067e96]/25 bg-[#eef8f8]/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#067e96] backdrop-blur-md">
                <Wallet className="h-3 w-3" />
                {lang === "th" ? "4 แบบ" : "4 options"}
              </span>
            </div>

            <div className="space-y-2 rounded-2xl border border-[#241f1a]/10 bg-white/50 p-3 backdrop-blur-md">
              {selectedProcedures.map((p, index) => (
                <div
                  key={p.key}
                  className="flex items-center gap-2 rounded-xl bg-white/40 px-3 py-2 backdrop-blur-md"
                >
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full border border-[#067e96]/25 bg-[#eef8f8]/70 px-2 text-[11px] font-semibold text-[#067e96] backdrop-blur-md">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#241f1a]">
                    {lang === "th" ? p.label_th : p.label_en}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                data-testid="surgery-cancel-generate"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[#241f1a]/10 bg-white/50 px-4 text-sm font-medium text-[#6f625a] backdrop-blur-md transition hover:bg-white/70 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/30"
              >
                {lang === "th" ? "ยกเลิก" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={confirmGenerate}
                data-testid="surgery-confirm-generate"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#241f1a] px-4 text-sm font-semibold text-white shadow-[0_18px_36px_-26px_rgba(36,31,26,0.72)] transition hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
              >
                <Sparkles className="h-4 w-4" />
                {lang === "th" ? "ยืนยัน · ใช้ 1 เครดิตภาพ" : "Confirm · use 1 image credit"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Preview dialog with before/after slider
// ============================================================================

/**
 * Phase 151 — bundles everything we cache per (procedure, intensity)
 * so the cache survives intensity toggles AND the "Show what changed"
 * heatmap toggle without burning extra work each time.
 */
type CachedSlot = {
  requestKey: string;
  result: ProcedureVariantGridResult;
  obedienceByVariant: Partial<Record<ProcedureVariantId, ObedienceReport | null>>;
  heatmapByVariant: Partial<Record<ProcedureVariantId, string | null>>;
  // Phase 621 — how many of the 4 generated variants the post-check
  // (identity drift / visual artifact) actually excluded from display.
  // Surfaced in the UI so "only 1 option showed up" reads as an
  // explained quality filter instead of an unexplained bug. Always 0
  rejectedCount: number;
};

type PreviewQaReason =
  | "passed"
  | "too-weak"
  | "wrong-direction"
  | "identity-drift"
  | "locality"
  | "other"
  | "order";

type PreviewQaVariantAttempt = {
  id: ProcedureVariantId;
  source: "provider" | "deterministic";
  reason: PreviewQaReason;
  postCheckCode: ProcedurePreviewPostCheckReport["code"];
  semanticCode?: string;
  obedienceSeverity?: ObedienceReport["severity"];
  meanDiff?: number;
  controlMeanDiff?: number;
  changedRatio?: number;
  p90Diff?: number;
  beforeDirectionalRidgeEnergy?: number;
  afterDirectionalRidgeEnergy?: number;
  beforeControlDirectionalRidgeEnergy?: number;
  afterControlDirectionalRidgeEnergy?: number;
  sideDirectionalRatios?: number[];
  sideControlDirectionalRatios?: number[];
  directionMetric?: string;
  directionRatio?: number;
  identityRatio?: number;
  qualityIssues?: NonNullable<ProcedurePreviewPostCheckReport["quality"]>["issues"];
  maxDriftMeanDiff?: number;
  driftRegions?: Array<{
    region: string;
    meanDiff: number;
    changedPixelRatio: number;
  }>;
};

type PreviewQaDiagnostics = {
  procedureKey: ProcedureKey;
  attempts: PreviewQaVariantAttempt[];
  order: ProcedureVariantOrderReport;
  sourceConsistent: boolean;
  accepted: boolean;
  reasons: PreviewQaReason[];
};

function qaReasonForPostCheck(
  report: ProcedurePreviewPostCheckReport
): PreviewQaReason {
  if (report.ok) return "passed";
  if (report.code === "effect-too-weak") return "too-weak";
  if (report.code === "effect-wrong-direction") return "wrong-direction";
  if (report.code === "identity-drift") return "identity-drift";
  return "other";
}

const PREVIEW_WORKFLOW_TIMEOUT_MS = 165_000;

function PreviewDialog({
  open,
  onOpenChange,
  procedureKey,
  image,
  gender,
  queueProgress,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  procedureKey: ProcedureKey | null;
  image: HTMLImageElement;
  gender: Gender;
  queueProgress?: { index: number; total: number };
}) {
  const { lang } = useT();
  // Phase 192u — gate hook at the component top level (hooks rule). The
  // generation catch below references openGate to pop the paywall when the
  // preview proxy throws a quota-exhaustion / 402 error.
  const { openGate } = useQuotaGate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historySaveError, setHistorySaveError] = useState<string | null>(null);
  const [qaDiagnostics, setQaDiagnostics] =
    useState<PreviewQaDiagnostics | null>(null);
  const [attempt, setAttempt] = useState(0);
  const intensity = PREVIEW_INTENSITY;
  const [selectedVariantId, setSelectedVariantId] =
    useState<ProcedureVariantId>("A");
  // Phase 151 — show/hide pixel-diff heatmap overlay.
  const [showDiff, setShowDiff] = useState(false);
  // Phase 151 — per-intensity slot now bundles the result, obedience
  // report, and the lazily-rendered diff heatmap so flipping intensity
  // and toggling "Show what changed" don't re-fire any work.
  const [slotsByIntensity, setSlotsByIntensity] = useState<
    Partial<Record<Intensity, CachedSlot>>
  >({});
  const slotsRef = useRef<Partial<Record<Intensity, CachedSlot>>>({});
  // Phase 192n — AbortController for in-flight generation. The route
  // burns quota BEFORE the upstream Gemini call (see /api/ai/image-gen
  // line ~143), so client-side abort cannot reliably save quota — but
  // it DOES stop the client from waiting on a 5-15s call the user no
  // longer cares about, free the upload bandwidth, and surface a clean
  // "cancelled" state instead of a dangling spinner. Honest framing in
  // the toast: "ยกเลิกแล้ว" — the quota cost may still apply.
  const abortRef = useRef<AbortController | null>(null);

  const procedure = procedureKey
    ? PROCEDURES.find((p) => p.key === procedureKey)
    : undefined;
  const imageKey = previewSourceImageKey(image);
  const requestKey = procedure
    ? `${procedure.key}:${gender}:${intensity}:${imageKey}`
    : "";

  const cachedSlot = slotsByIntensity[intensity] ?? null;
  const slot = cachedSlot?.requestKey === requestKey ? cachedSlot : null;
  const result = slot?.result ?? null;
  const rejectedVariantCount = slot?.rejectedCount ?? 0;
  const selectedVariant =
    result?.variants.find((variant) => variant.option.id === selectedVariantId) ??
    result?.variants[0] ??
    null;
  const activeVariantId = selectedVariant?.option.id ?? selectedVariantId;
  const obedience = slot?.obedienceByVariant?.[activeVariantId] ?? null;
  const heatmapUrl = slot?.heatmapByVariant?.[activeVariantId] ?? null;

  useEffect(() => {
    slotsRef.current = slotsByIntensity;
  }, [slotsByIntensity]);

  // Reset per-intensity cache when the procedure being previewed
  // changes (new dialog open or queue-step advance).
  useEffect(() => {
    slotsRef.current = {};
    setSlotsByIntensity({});
    setShowDiff(false);
    setSelectedVariantId("A");
    setQaDiagnostics(null);
  }, [procedure?.key, imageKey, gender]);

  useEffect(() => {
    if (!open || !procedure) return;
    // Pin to a local for TS narrowing inside the async helper below.
    const targetProcedure = procedure;
    // Cache hit — show the prior gen, skip the API call.
    if (slotsRef.current[intensity]?.requestKey === requestKey) {
      setBusy(false);
      setError(null);
      return;
    }
    let cancelled = false;
    // Phase 192n — fresh AbortController per effect run. The user-facing
    // cancel button calls .abort(), which flips both the local `cancelled`
    // guard (via the signal listener below) and tears down the in-flight
    // fetch through ai-gemini-image's signal plumbing where supported.
    const localCtrl = new AbortController();
    abortRef.current = localCtrl;
    localCtrl.signal.addEventListener("abort", () => {
      cancelled = true;
    });
    setError(null);
    setHistorySaveError(null);
    setBusy(true);
    const workflowWatchdog = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      if (!localCtrl.signal.aborted) localCtrl.abort();
      if (abortRef.current === localCtrl) abortRef.current = null;
      setBusy(false);
      setError(humanizeError(new Error("preview-client-timeout"), lang));
    }, PREVIEW_WORKFLOW_TIMEOUT_MS);
    // Phase 180 — Gemini calls go through `/api/ai/image-gen` which
    // requires the user's Supabase JWT. Pull it once + pass via idToken.
    runSurgery();
    async function runSurgery(): Promise<void> {
      let token: string | null = null;
      try {
        const { getAccessToken } = await import("@/lib/supabase/auth-client");
        token = await getAccessToken(true);
        if (!token) throw new Error("auth-token-missing");
      } catch (e) {
        clearTimeout(workflowWatchdog);
        if (!cancelled) {
          setError(humanizeError(e, lang));
          setBusy(false);
        }
        return;
      }
      if (cancelled) return;
      const requestPreview = (): Promise<ProcedureVariantGridResult> =>
        callGeminiProcedureVariantGrid({
          image,
          procedure: targetProcedure,
          gender,
          ...(token ? { idToken: token } : {}),
          intensity,
          signal: localCtrl.signal,
        });
      requestPreview()
        .then(async (r) => {
          if (cancelled) return r;
          const targetRegions = getProcedureRegions(targetProcedure.key);
          const inspectCandidate = async (
            candidateUrl: string,
            variantId: ProcedureVariantId
          ): Promise<{
            passed: boolean;
            reason: PreviewQaReason;
            obedience: ObedienceReport | null;
            postCheck: ProcedurePreviewPostCheckReport;
          }> => {
            const postCheck = await validateProcedurePreviewPostCheck({
              beforeImage: image,
              afterImageDataUrl: candidateUrl,
              procedures: [targetProcedure],
              stage: "final",
              intensity: semanticIntensityForVariant(variantId),
            });
            if (!postCheck.ok) {
              if (postCheck.code === "effect-not-applicable") {
                throw new Error("preview-effect-not-applicable");
              }
              return {
                passed: false,
                reason: qaReasonForPostCheck(postCheck),
                obedience: null,
                postCheck,
              };
            }
            try {
              const obedience = await runObedienceCheck({
                beforeImage: image,
                alignedAfterUrl: candidateUrl,
                expectedRegions: targetRegions.regions,
                global: targetRegions.global,
              });
              if (!obedience) {
                return {
                  passed: false,
                  reason: "locality",
                  obedience: null,
                  postCheck,
                };
              }
              return {
                passed: obedience.severity === "none",
                reason:
                  obedience.severity === "none" ? "passed" : "locality",
                obedience,
                postCheck,
              };
            } catch {
              return {
                passed: false,
                reason: "locality",
                obedience: null,
                postCheck,
              };
            }
          };
          const processVariants = async (forceDeterministic: boolean) => {
            const passedVariants: ProcedureVariantGridResult["variants"] = [];
            const obedienceByVariant: Partial<
              Record<ProcedureVariantId, ObedienceReport | null>
            > = {};
            const postCheckByVariant: Partial<
              Record<ProcedureVariantId, ProcedurePreviewPostCheckReport>
            > = {};
            const diagnostics: PreviewQaVariantAttempt[] = [];
            let rejectedCount = r.providerRejectedCount ?? 0;
            for (const variant of r.variants) {
              let source = forceDeterministic ? "deterministic" as const : variant.source;
              let sourceUrl = forceDeterministic
                ? safeOriginalPreviewUrl(image)
                : variant.imageDataUrl;
              let normalized = sourceUrl;
              try {
                normalized = await alignAfterToBeforeFace(
                  image,
                  sourceUrl,
                  r.editContract,
                  variant.option.id
                );
              } catch {
                normalized = safeOriginalPreviewUrl(image);
              }
              let inspected = await inspectCandidate(normalized, variant.option.id);
              const recordInspection = (
                inspectedSource: "provider" | "deterministic"
              ): void => {
                const stats = inspected.postCheck.effect?.stats;
                const direction = inspected.postCheck.effect?.direction;
                diagnostics.push({
                  id: variant.option.id,
                  source: inspectedSource,
                  reason: inspected.reason,
                  postCheckCode: inspected.postCheck.code,
                  ...(inspected.postCheck.effect?.code
                    ? { semanticCode: inspected.postCheck.effect.code }
                    : {}),
                  ...(inspected.obedience
                    ? {
                        obedienceSeverity: inspected.obedience.severity,
                        maxDriftMeanDiff:
                          inspected.obedience.maxDriftMeanDiff,
                        driftRegions: inspected.obedience.drift.map((item) => ({
                          region: item.region,
                          meanDiff: item.meanDiff,
                          changedPixelRatio: item.changedPixelRatio,
                        })),
                      }
                    : {}),
                  ...(stats
                    ? {
                        meanDiff: stats.meanDiff,
                        controlMeanDiff: stats.controlMeanDiff,
                        changedRatio: stats.changedRatio,
                        p90Diff: stats.p90Diff,
                        beforeDirectionalRidgeEnergy:
                          stats.beforeDirectionalRidgeEnergy,
                        afterDirectionalRidgeEnergy:
                          stats.afterDirectionalRidgeEnergy,
                        beforeControlDirectionalRidgeEnergy:
                          stats.beforeControlDirectionalRidgeEnergy,
                        afterControlDirectionalRidgeEnergy:
                          stats.afterControlDirectionalRidgeEnergy,
                        sideDirectionalRatios:
                          stats.sideBeforeDirectionalRidgeEnergy.map(
                            (value, index) =>
                              value > 0.0001
                                ? (stats.sideAfterDirectionalRidgeEnergy[index] ??
                                    value) / value
                                : 1
                          ),
                        sideControlDirectionalRatios:
                          stats.sideBeforeControlDirectionalRidgeEnergy.map(
                            (value, index) =>
                              value > 0.0001
                                ? (stats.sideAfterControlDirectionalRidgeEnergy[
                                    index
                                  ] ?? value) / value
                                : 1
                          ),
                      }
                    : {}),
                  ...(direction
                    ? {
                        directionMetric: direction.metric,
                        directionRatio: direction.ratio,
                      }
                    : {}),
                  ...(inspected.postCheck.drift
                    ? { identityRatio: inspected.postCheck.drift.ratio }
                    : {}),
                  ...(inspected.postCheck.quality
                    ? { qualityIssues: inspected.postCheck.quality.issues }
                    : {}),
                });
              };
              recordInspection(source ?? "provider");
              if (
                !inspected.passed &&
                !forceDeterministic &&
                variant.source !== "deterministic"
              ) {
                rejectedCount += 1;
                source = "deterministic";
                sourceUrl = safeOriginalPreviewUrl(image);
                normalized = await alignAfterToBeforeFace(
                  image,
                  sourceUrl,
                  r.editContract,
                  variant.option.id
                );
                inspected = await inspectCandidate(normalized, variant.option.id);
                recordInspection("deterministic");
              }
              if (!inspected.passed || !inspected.obedience) {
                rejectedCount += 1;
                continue;
              }
              obedienceByVariant[variant.option.id] = inspected.obedience;
              postCheckByVariant[variant.option.id] = inspected.postCheck;
              passedVariants.push({
                ...variant,
                imageDataUrl: normalized,
                ...(source ? { source } : {}),
              });
            }
            const order = validateProcedureVariantOrder(postCheckByVariant);
            return {
              passedVariants,
              obedienceByVariant,
              diagnostics,
              rejectedCount,
              sourceConsistent:
                new Set(
                  passedVariants.map((variant) => variant.source ?? "provider")
                ).size <= 1,
              order,
            };
          };
          const providerProcessed = await processVariants(false);
          let processed = providerProcessed;
          let diagnosticAttempts = [...providerProcessed.diagnostics];
          if (
            processed.passedVariants.length !== 4 ||
            !processed.sourceConsistent ||
            !processed.order.ok
          ) {
            processed = await processVariants(true);
            diagnosticAttempts = [
              ...diagnosticAttempts,
              ...processed.diagnostics,
            ];
          }
          if (cancelled) return r;
          const accepted =
            processed.passedVariants.length === 4 &&
            processed.sourceConsistent &&
            processed.order.ok;
          const reasons = new Set<PreviewQaReason>(
            diagnosticAttempts
              .map((item) => item.reason)
              .filter((reason) => reason !== "passed")
          );
          if (!providerProcessed.order.ok) reasons.add("order");
          if (!processed.order.ok) reasons.add("order");
          setQaDiagnostics({
            procedureKey: targetProcedure.key,
            attempts: diagnosticAttempts,
            order: processed.order,
            sourceConsistent: processed.sourceConsistent,
            accepted,
            reasons: [...reasons],
          });
          if (!accepted) {
            throw new Error("preview-semantic-rejected");
          }
          const passedVariants = processed.passedVariants;
          const obedienceByVariant = processed.obedienceByVariant;
          const rejectedCount = 0;
          const final: ProcedureVariantGridResult = {
            ...r,
            variants: passedVariants,
          };
          if (passedVariants.some((variant) => variant.source === "deterministic")) {
            delete final.description;
          }
          if (cancelled) return r;
          setSlotsByIntensity((prev) => {
            const next = {
              ...prev,
              [intensity]: {
                requestKey,
                result: final,
                obedienceByVariant,
                heatmapByVariant: {},
                rejectedCount,
              },
            };
            slotsRef.current = next;
            return next;
          });
          clearTimeout(workflowWatchdog);
          setBusy(false);
          setError(null);
          // Phase 135 — keep a copy of the generated preview so the user
          // can revisit it later without burning another generation.
          void (async () => {
            try {
              const compactSet = (maxSide: number, quality: number) =>
                Promise.all(
                  final.variants.map(async (variant) => ({
                    id: variant.option.id,
                    afterDataUrl: await compactPreviewDataUrl(
                      variant.imageDataUrl,
                      maxSide,
                      quality
                    ),
                  }))
                );
              const variants = await compactSet(640, 0.84);
              if (cancelled) return;
              const beforeDataUrl = sourceImageToDataUrl(image, 640, 0.84);
              const saved = savePreview({
                timestamp: Date.now(),
                procedureKey: targetProcedure.key,
                intensity,
                beforeDataUrl,
                variants,
                ...(final.description ? { description: final.description } : {}),
              });
              if (saved === null) throw new Error("preview-history-storage-full");
              setHistorySaveError(null);
            } catch (saveError: unknown) {
              if (!cancelled) {
                setHistorySaveError(
                  saveError instanceof Error
                    ? saveError.message
                    : "preview-history-save-failed"
                );
              }
            }
          })();
          return final;
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            // Phase 192u — out-of-quota / premium-expired → paywall, not the
            // error overlay. openGateFromError returns false for an AbortError
            // (and the !cancelled guard already filters user-cancel), so an
            // aborted generation never reaches here. Clear the spinner before
            // returning so the dialog isn't left mid-load behind the gate.
            if (openGateFromError(e, openGate)) {
              setBusy(false);
              return;
            }
            if (slotsRef.current[intensity]?.requestKey !== requestKey) {
              setError(humanizeError(e, lang));
            }
          }
        })
        .finally(() => {
          clearTimeout(workflowWatchdog);
          if (!cancelled) setBusy(false);
        });
    }
    return () => {
      cancelled = true;
      clearTimeout(workflowWatchdog);
      // Phase 192n — also abort the controller on effect cleanup so a
      // dialog close mid-generation lets any signal-aware downstream
      // (future ai-gemini-image plumbing) tear down its fetch.
      if (!localCtrl.signal.aborted) localCtrl.abort();
      if (abortRef.current === localCtrl) abortRef.current = null;
      // Phase 190 — reset busy on cleanup so rapid open/close doesn't
      // leave the spinner armed forever when the dialog reopens with a
      // pending request still in-flight.
      setBusy(false);
    };
  }, [
    open,
    procedure,
    requestKey,
    attempt,
    intensity,
    image,
    gender,
    lang,
    openGate,
  ]);

  // Phase 151 — lazy heatmap render. Only fires the per-pixel diff
  // computation when the user actually toggles "Show what changed" on,
  // and only once per intensity slot (result cached on the slot).
  useEffect(() => {
    if (!showDiff) return;
    if (!selectedVariant?.imageDataUrl) return;
    if (heatmapUrl) return;
    let cancelled = false;
    const variantId = activeVariantId;
    renderDiffHeatmap(image, selectedVariant.imageDataUrl)
      .then((url) => {
        if (cancelled || !url) return;
        setSlotsByIntensity((prev) => {
          const current = prev[intensity];
          if (!current) return prev;
          return {
            ...prev,
            [intensity]: {
              ...current,
              heatmapByVariant: {
                ...current.heatmapByVariant,
                [variantId]: url,
              },
            },
          };
        });
      })
      .catch(() => {
        /* heatmap is best-effort UI sugar; never block the preview */
      });
    return () => {
      cancelled = true;
    };
  }, [
    showDiff,
    selectedVariant?.imageDataUrl,
    activeVariantId,
    heatmapUrl,
    intensity,
    image,
  ]);

  if (!procedure) return null;

  // Phase 192n — iOS-safe download. Replaces the inline `<a download>`
  // with the shared saveImage helper. On iPhone the helper invokes the
  // Web Share API so the user can pick "Save to Photos"; elsewhere it
  // falls back to the anchor download that worked before.
  function download() {
    if (!selectedVariant?.imageDataUrl) return;
    void saveImage(
      selectedVariant.imageDataUrl,
      `doodee-preview-${procedure!.key}-${selectedVariant.option.id}-${Date.now()}.png`,
    );
  }

  function cancelGeneration() {
    const ctrl = abortRef.current;
    if (ctrl && !ctrl.signal.aborted) ctrl.abort();
    abortRef.current = null;
    setBusy(false);
    setError(lang === "th" ? "ยกเลิกแล้ว" : "Cancelled");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="doodee-procedure-preview-dialog flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] min-w-0 select-none flex-col gap-0 overflow-hidden overflow-x-hidden rounded-[1.75rem] p-0 !left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 !border-white/10 !bg-[#070b1a] !text-white !shadow-[0_30px_100px_-50px_rgba(6,182,212,0.35)] !backdrop-blur-xl sm:w-[calc(100vw-2rem)] sm:max-w-5xl">
        {process.env.NODE_ENV !== "production" && qaDiagnostics && (
          <output
            data-testid="procedure-preview-qa-diagnostics"
            data-qa={JSON.stringify(qaDiagnostics)}
            className="sr-only"
          >
            {JSON.stringify(qaDiagnostics)}
          </output>
        )}
        <div className="shrink-0 space-y-1 border-b border-white/10 px-4 pb-3 pr-12 pt-5 sm:px-6 sm:pt-6">
          {queueProgress && queueProgress.total > 1 && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan/25 bg-cyan/10 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-cyan">
              <span className="font-medium tabular-nums">
                {queueProgress.index + 1} / {queueProgress.total}
              </span>
              <span>
                {lang === "th" ? "ปิดเพื่อดูรายการถัดไป" : "close to continue"}
              </span>
            </div>
          )}
          <DialogTitle className="text-xl leading-tight sm:text-2xl">
            {lang === "th" ? procedure.label_th : procedure.label_en}
          </DialogTitle>
          <DialogDescription className="mt-1 max-w-2xl text-xs leading-relaxed text-white/65">
            {lang === "th" ? procedure.hint_th : procedure.hint_en}
          </DialogDescription>
        </div>

        <div className="no-scrollbar min-h-0 min-w-0 flex-1 touch-pan-y space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 sm:px-5 sm:py-5">
          <div className={result && !busy && !error ? "procedure-result-ready" : undefined}>
            <BeforeAfter
              beforeUrl={image.src}
              afterUrl={selectedVariant?.imageDataUrl ?? null}
              busy={busy}
              error={error}
              lang={lang}
              heatmapUrl={heatmapUrl}
              showDiff={showDiff}
            />
          </div>

          {result && !busy && !error && (
            <VariantGridPicker
              result={result}
              selectedId={activeVariantId}
              onSelect={(id) => {
                setSelectedVariantId(id);
                setShowDiff(false);
              }}
              lang={lang}
              rejectedCount={rejectedVariantCount}
            />
          )}

          {result && !busy && !error && historySaveError && (
            <p
              role="status"
              className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[11px] text-warn"
            >
              {lang === "th"
                ? "แสดงผลได้ แต่พื้นที่จัดเก็บไม่พอสำหรับบันทึกภาพทั้ง 4 ระดับ"
                : "The result is ready, but this device could not save all 4 levels."}
            </p>
          )}
          {process.env.NODE_ENV !== "production" && historySaveError && (
            <output data-qa-history-save className="sr-only">
              {historySaveError}
            </output>
          )}

          {/* Phase 151 — obedience guardrail + "Show what changed" toggle.
              Sits between the slider and the controls so the user reads
              the chip before deciding to inspect the diff. */}
          {result && !busy && !error && (
            <ObediencePanel
              report={obedience}
              showDiff={showDiff}
              onToggleDiff={() => setShowDiff((v) => !v)}
              lang={lang}
            />
          )}

          {/* Phase 130 — intensity picker. Lets user dial the AI from
              "tasteful" to "obvious" since Gemini often plays it safe. */}
          {result?.description && (
            <p className="rounded-2xl border border-[#241f1a]/10 bg-white/50 px-4 py-3 text-[12px] leading-relaxed text-[#4d463f] backdrop-blur-md">
              {result.description}
            </p>
          )}

          {/* Phase 134 — pros / cons / cost / downtime panel.
              Shown ONLY after the image has generated successfully, so the
              user reads it side-by-side with the visual outcome. */}
          {result && !busy && !error && (
            <ProsConsPanel procedure={procedure} lang={lang} />
          )}

          {/* Disclaimer */}
          <div className="flex items-start gap-2.5 rounded-2xl border border-warn/25 bg-warn/10 p-3 backdrop-blur-md">
            <AlertTriangle className="h-3.5 w-3.5 text-warn/90 mt-0.5 flex-none" />
            <p className="text-[11px] text-warn/90 leading-relaxed">
              {lang === "th"
                ? "ภาพนี้เป็นภาพอ้างอิงเพื่อประกอบการตัดสินใจ ผลจริงอาจแตกต่าง โปรดปรึกษาแพทย์ผู้เชี่ยวชาญก่อนตัดสินใจ"
                : "This is a decision-support reference. Real results may differ. Consult a board-certified specialist before deciding."}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-white/10 bg-[#050816]/88 px-3 py-3 backdrop-blur-md sm:px-5">
          {/* Phase 192n — Cancel button only visible while a generation
              is in flight. Calls abort + clears the spinner so the user
              isn't trapped staring at 5-15s of "Building your preview…"
              with no escape. Quota is charged only after usable output. */}
          {busy && (
            <button
              type="button"
              onClick={cancelGeneration}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-warn/40 bg-warn/10 px-4 py-2 text-xs text-warn hover:bg-warn/15 transition"
            >
              <X className="h-3.5 w-3.5" />
              {lang === "th" ? "ยกเลิก" : "Cancel"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              // Phase 146 — Regenerate bypasses the intensity cache by
              // dropping the current intensity's saved slot, then
              // bumping `attempt` to force the effect to re-run.
              setSlotsByIntensity((prev) => {
                const next = { ...prev };
                delete next[intensity];
                return next;
              });
              setShowDiff(false);
              setAttempt((a) => a + 1);
            }}
            disabled={busy}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.08] px-4 py-2 text-xs text-white backdrop-blur-md transition hover:bg-white/[0.12] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`}
            />
            {lang === "th" ? "เตรียมใหม่" : "Generate again"}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!result || busy}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-cyan/25 bg-cyan/10 px-4 py-2 text-xs text-cyan transition hover:bg-cyan/15 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {lang === "th" ? "ดาวน์โหลด" : "Download"}
          </button>
          {/* Phase 192n — iOS-only hint: explain "long-press the image
              to save" as a fallback path for users whose share sheet
              choice fails or for whom Save-to-Photos is hidden. */}
          {isLikelyIOS() && result && !busy && (
            <span className="mt-0.5 basis-full text-right text-[10px] italic text-white/55">
              {lang === "th"
                ? "เคล็ดลับ: แตะค้างที่ภาพเพื่อบันทึกลง Photos ได้เช่นกัน"
                : "Tip: long-press the image to save to Photos as well"}
            </span>
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-[#050816] transition hover:bg-white/90"
          >
            <X className="h-3.5 w-3.5" />
            {lang === "th" ? "ปิด" : "Close"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Before/After slider
// ============================================================================

function VariantGridPicker({
  result,
  selectedId,
  onSelect,
  lang,
  rejectedCount,
}: {
  result: ProcedureVariantGridResult;
  selectedId: ProcedureVariantId;
  onSelect: (id: ProcedureVariantId) => void;
  lang: "th" | "en";
  rejectedCount: number;
}) {
  const deterministicOnly =
    result.variants.length > 0 &&
    result.variants.every((variant) => variant.source === "deterministic");
  const resultCount = result.variants.length;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-white">
            {lang === "th"
              ? "เปรียบเทียบความชัด 4 ระดับ"
              : "Compare 4 strength levels"}
          </p>
          <p className="mt-0.5 text-[11px] text-white/55">
            {deterministicOnly
              ? lang === "th"
                ? "หัตถการเดียว ทรงเดียว ไล่ระดับ 1–4 บนภาพเดิม"
                : "One procedure and one direction, increased from level 1 to 4 on the original photo."
              : lang === "th"
                ? `หัตถการเดียว ทรงเดียว ไล่ระดับ 1–${resultCount}`
                : `One procedure and one direction, increased from level 1 to ${resultCount}.`}
          </p>
        </div>
        <span className="rounded-full border border-cyan/25 bg-cyan/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan">
          {lang === "th"
            ? `${resultCount} ผลลัพธ์`
            : `${resultCount} ${resultCount === 1 ? "result" : "results"}`}
        </span>
      </div>
      {rejectedCount > 0 && (
          // Phase 621 — without this, a photo that fails post-check on 3
          // of 4 variants just silently shows 1 option with no
          // explanation, which reads as "the AI is broken" in the field.
          <p className="mb-3 rounded-xl border border-warn/25 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-warn">
            {lang === "th"
              ? `ซ่อน ${rejectedCount} แบบเพราะไม่ผ่านการตรวจสอบคุณภาพ (หน้าเพี้ยนหรือภาพผิดปกติ) — ลองแตะ "เตรียมใหม่" เพื่อสร้างใหม่`
              : `${rejectedCount} option${rejectedCount > 1 ? "s" : ""} hidden — didn't pass the quality check (face drift or a visual artifact). Try "Regenerate" for a fresh set.`}
          </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {result.variants.map((variant) => {
          const active = variant.option.id === selectedId;
          return (
            <button
              key={variant.option.id}
              type="button"
              data-testid={`procedure-variant-option-${variant.option.id}`}
              aria-pressed={active}
              onClick={() => onSelect(variant.option.id)}
              className={`group relative overflow-hidden rounded-2xl border bg-[#050816] text-left transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/40 ${
                active
                  ? "border-cyan/70 shadow-[0_0_0_1px_rgba(6,182,212,0.35),0_18px_50px_-30px_rgba(6,182,212,0.45)]"
                  : "border-white/10 hover:border-white/24"
              }`}
            >
              {variant.source === "deterministic" && (
                <span
                  data-testid="deterministic-fallback-label"
                  className="absolute right-2 top-2 z-10 rounded-full border border-warn/35 bg-[#050816]/85 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-warn backdrop-blur-md"
                >
                  {lang === "th" ? "ปรับด้วยโครงหน้า" : "Local fallback"}
                </span>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={variant.imageDataUrl}
                alt={variant.option.label_en}
                className="aspect-[4/5] w-full bg-[#050816] object-contain object-center"
                draggable={false}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#050816]/90 via-[#050816]/56 to-transparent p-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                      active
                        ? "bg-cyan text-[#050816]"
                        : "bg-white/14 text-white"
                    }`}
                  >
                    {variant.option.level}
                  </span>
                  <span className="min-w-0 truncate text-[11px] font-semibold text-white">
                    {lang === "th"
                      ? variant.option.label_th
                      : variant.option.label_en}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BeforeAfter({
  beforeUrl,
  afterUrl,
  busy,
  error,
  lang,
  heatmapUrl,
  showDiff,
}: {
  beforeUrl: string;
  afterUrl: string | null;
  busy: boolean;
  error: string | null;
  lang: "th" | "en";
  heatmapUrl?: string | null;
  showDiff?: boolean;
}) {
  const [split, setSplit] = useState(50);
  const wrapRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Phase 131 — read the BEFORE image's natural aspect ratio once and
  // force the container to that ratio. Both images then fill the same
  // box via `object-cover` regardless of the AI output's aspect.
  // This fixes the misalignment issue where before/after had different
  // framing because the AI returned a differently-sized canvas.
  const [beforeAspect, setBeforeAspect] = useState<number | null>(null);
  // Phase 192q — stale-decode race fix. If beforeUrl changed mid-decode
  // (e.g., user re-confirms a new photo before the previous Image
  // finished loading), the prior img.onload still fired and stomped
  // beforeAspect with the OLD photo's ratio. Null the handler in cleanup
  // + cancelled flag so only the most recent effect run can update state.
  useEffect(() => {
    if (!beforeUrl) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0) setBeforeAspect(w / h);
    };
    img.src = beforeUrl;
    return () => {
      cancelled = true;
      img.onload = null;
      img.src = "";
    };
  }, [beforeUrl]);

  function onMove(clientX: number) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = clientX - rect.left;
    setSplit(Math.max(0, Math.min(100, (x / rect.width) * 100)));
  }

  function onTouchStart(e: TouchEvent<HTMLDivElement>): void {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchMove(e: TouchEvent<HTMLDivElement>): void {
    const touch = e.touches[0];
    const start = touchStartRef.current;
    if (!touch || !start) return;
    const dx = Math.abs(touch.clientX - start.x);
    const dy = Math.abs(touch.clientY - start.y);
    if (dx < dy + 8) return;
    onMove(touch.clientX);
  }

  function clearTouchStart(): void {
    touchStartRef.current = null;
  }

  // Phase 184 — Keyboard support for the before/after slider. Without
  // arrow-key handling the slider was unusable for non-mouse users (WCAG
  // 2.1.1 keyboard). Arrow keys nudge ±2 %; Home/End jump to extremes.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    let next = split;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = Math.max(0, split - 2);
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = Math.min(100, split + 2);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 100;
        break;
      case "PageDown":
        next = Math.max(0, split - 10);
        break;
      case "PageUp":
        next = Math.min(100, split + 10);
        break;
      default:
        return;
    }
    e.preventDefault();
    setSplit(next);
  }

  const frameWidthClass =
    beforeAspect !== null && beforeAspect < 0.85
      ? "max-w-[390px] sm:max-w-[420px]"
      : "max-w-[680px]";

  return (
    <div
      ref={wrapRef}
      role="slider"
      tabIndex={0}
      aria-label="Before / after comparison slider"
      aria-valuenow={Math.round(split)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`relative mx-auto h-[min(54dvh,500px)] min-h-[260px] w-full ${frameWidthClass} min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-[#050816] shadow-[0_22px_70px_rgba(0,0,0,0.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/40 sm:h-[min(62dvh,560px)] sm:min-h-[320px]`}
      // Phase 192n — touch-action: pan-y lets vertical page-scroll
      // pass through the slider on mobile. Without this the finger that
      // lands on the slider is "captured" by onTouchMove and the page
      // becomes unscrollable while the slider is under the thumb. We
      // still capture horizontal drags via onTouchMove for the wipe.
      style={{
        touchAction: "pan-y",
      }}
      onMouseMove={(e) => e.buttons === 1 && onMove(e.clientX)}
      onMouseDown={(e) => onMove(e.clientX)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={clearTouchStart}
      onTouchCancel={clearTouchStart}
      onKeyDown={handleKeyDown}
    >
      {/* Before image — absolute fill, object-cover so we always know
          exactly how it crops, no matter the container size. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeUrl}
        alt="before"
        className="absolute inset-0 h-full w-full object-contain object-center"
        draggable={false}
      />

      {/* After image clipped — same absolute fill + object-cover so it
          aligns pixel-for-pixel with the before image regardless of the
          AI output's native dimensions. */}
      <AnimatePresence>
        {afterUrl && !busy && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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
        )}
      </AnimatePresence>

      {/* Phase 151 — pixel-diff heatmap overlay. Sits above both image
          layers so it's visible regardless of the slider position; the
          user sees where the AI changed pixels at a glance. */}
      <AnimatePresence>
        {showDiff && heatmapUrl && afterUrl && !busy && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heatmapUrl}
              alt="diff heatmap"
              className="absolute inset-0 h-full w-full object-contain object-center opacity-55 mix-blend-multiply"
              draggable={false}
            />
          </m.div>
        )}
      </AnimatePresence>

      {/* Vertical handle */}
      {afterUrl && !busy && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: `${split}%` }}
        >
          <div className="absolute top-0 bottom-0 -translate-x-1/2 w-[3px] bg-white/72 shadow-[0_0_0_1px_rgba(36,31,26,0.18),0_14px_34px_rgba(36,31,26,0.26)]" />
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-11 w-11 rounded-full border border-white/70 bg-white/74 shadow-[0_14px_34px_rgba(36,31,26,0.24)] backdrop-blur-md flex items-center justify-center">
            <span className="text-[#241f1a] text-xs font-bold tabular-nums">
              ↔
            </span>
          </div>
        </div>
      )}

      {/* Labels */}
      <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-[#050816]/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-[0_10px_24px_rgba(0,0,0,0.22)] backdrop-blur-md">
        {lang === "th" ? "ก่อน" : "before"}
      </div>
      {afterUrl && !busy && (
        <div className="absolute right-3 top-3 rounded-full border border-cyan/25 bg-cyan/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan shadow-[0_10px_24px_rgba(0,0,0,0.22)] backdrop-blur-md">
          {lang === "th" ? "หลัง (อ้างอิง)" : "after reference"}
        </div>
      )}

      {/* Busy overlay */}
      {busy && <PortraitGenerationBusy lang={lang} combo={false} />}

      {/* Error overlay */}
      {error && !busy && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#050816]/88 p-6 text-center text-white backdrop-blur-md">
          <AlertTriangle className="h-6 w-6 text-warn/90" />
          <p className="text-sm font-semibold text-white">
            {lang === "th"
              ? "สร้างภาพอ้างอิงไม่สำเร็จ"
              : "Reference image failed."}
          </p>
          <p className="max-w-md text-[11px] leading-relaxed text-white/65">
            {error === "no-api-key"
              ? lang === "th"
                ? "ระบบภาพอ้างอิงยังไม่พร้อมใช้งาน"
                : "Reference image service is not available right now"
              : error}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!afterUrl && !busy && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#050816]/72 backdrop-blur-md">
          <p className="text-sm text-white/60">
            {lang === "th"
              ? "ภาพอ้างอิงจะแสดงที่นี่"
              : "Reference image will appear here"}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Phase 134 — Pros / Cons / facts panel
// ============================================================================

export function PortraitGenerationBusy({
  lang,
  combo,
}: {
  lang: "th" | "en";
  combo: boolean;
}) {
  const steps =
    lang === "th"
      ? ["อ่านภาพต้นฉบับ", "ล็อกใบหน้าหลัก", "ปรับเฉพาะจุดที่เลือก", "จัดแนวภาพหลัง"]
      : [
          "Read reference image",
          "Preserve identity",
          "Apply selected edits",
          "Align result",
        ];

  // Phase 627 — real generation takes ~10-25s and the old checklist showed
  // all 4 steps identically the whole time, which read as "stuck" rather
  // than "working". Cycle a fake-but-honest active step so the UI always
  // looks like it's making progress; loops instead of stopping at step 4
  // so it never falsely claims "done" while still waiting on Gemini.
  const [activeStep, setActiveStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 2600);
    return () => clearInterval(id);
  }, [steps.length]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 overflow-hidden bg-[#050816]/88 p-6 text-center text-white backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.08)_1px,transparent_1px)] bg-[size:34px_34px] opacity-40" />
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border border-cyan/30 shadow-[0_0_32px_rgba(6,182,212,0.28)]" />
        <div className="relative h-full w-full animate-spin rounded-full border-2 border-white/15 border-t-cyan motion-reduce:animate-none" />
      </div>
      <m.p
        key={activeStep}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative text-sm font-semibold text-white"
      >
        {lang === "th"
          ? combo
            ? "กำลังเตรียมภาพอ้างอิงรวม..."
            : "กำลังเตรียมภาพอ้างอิง..."
          : combo
            ? "Preparing combined portrait reference..."
            : "Preparing portrait reference..."}
      </m.p>
      <div className="relative grid w-full max-w-sm gap-2 text-left sm:grid-cols-2">
        {steps.map((label, i) => {
          const done = i < activeStep;
          const active = i === activeStep;
          return (
            <m.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45,
                ease: [0.22, 1, 0.36, 1],
                delay: i * 0.08,
              }}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-medium transition-colors duration-300 ${
                active
                  ? "border-cyan/50 bg-cyan/[0.12] text-white shadow-[0_0_22px_-6px_rgba(6,182,212,0.45)]"
                  : done
                    ? "border-cyan/[0.18] bg-white/[0.06] text-white/70"
                    : "border-cyan/[0.15] bg-white/[0.08] text-white/45"
              }`}
            >
              {done ? (
                <Check className="h-3 w-3 flex-none text-cyan" />
              ) : active ? (
                <span className="relative flex h-2 w-2 flex-none">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan/70 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan" />
                </span>
              ) : (
                <span className="h-2 w-2 flex-none rounded-full border border-white/25" />
              )}
              <span className="truncate">{label}</span>
            </m.div>
          );
        })}
      </div>
      <div className="relative h-1 w-full max-w-sm overflow-hidden rounded-full bg-white/10">
        <m.div
          className="h-full w-1/3 rounded-full bg-gradient-to-r from-cyan/20 via-cyan to-cyan/20 motion-reduce:hidden"
          animate={{ x: ["-100%", "220%"] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
        />
      </div>
      <p className="relative max-w-sm text-[11px] leading-relaxed text-white/55">
        {lang === "th"
          ? "กำลังจัดรายละเอียดให้ตรงกับรายการที่เลือก โปรดรอสักครู่"
          : "Preparing the selected refinements. Please keep this window open."}
      </p>
    </div>
  );
}

function ProsConsPanel({
  procedure,
  lang,
}: {
  procedure: ProcedureDef;
  lang: "th" | "en";
}) {
  const info = findProcedureInfo(procedure.key);
  if (!info) return null;

  const pros = lang === "th" ? info.pros_th : info.pros_en;
  const cons = lang === "th" ? info.cons_th : info.cons_en;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#241f1a]/10 bg-white/50 backdrop-blur-md">
      {/* Quick facts row */}
      <div className="grid grid-cols-2 gap-px bg-[#241f1a]/10 sm:grid-cols-4">
        <FactCell
          icon={<Clock className="h-3.5 w-3.5 text-[#3f6268]" />}
          label={lang === "th" ? "พักฟื้น" : "Downtime"}
          value={lang === "th" ? info.downtime_th : info.downtime_en}
        />
        <FactCell
          icon={<Sparkles className="h-3.5 w-3.5 text-[#3f6268]" />}
          label={lang === "th" ? "ผลอยู่" : "Lasts"}
          value={lang === "th" ? info.duration_th : info.duration_en}
        />
        <FactCell
          icon={<Wallet className="h-3.5 w-3.5 text-good/85" />}
          label={lang === "th" ? "ราคาประมาณ" : "Cost (approx)"}
          value={info.cost_thb}
        />
        <FactCell
          icon={
            <RotateCcw
              className={`h-3.5 w-3.5 ${
                info.reversible ? "text-good/85" : "text-warn/85"
              }`}
            />
          }
          label={lang === "th" ? "กลับคืนได้?" : "Reversible?"}
          value={
            info.reversible
              ? lang === "th"
                ? "ใช่ (ละลายได้)"
                : "Yes (dissolvable)"
              : lang === "th"
                ? "ไม่ — ถาวร"
                : "No — permanent"
          }
        />
      </div>

      {/* Pros + Cons two-column */}
      <div className="grid grid-cols-1 gap-px bg-[#241f1a]/10 sm:grid-cols-2">
        <div className="space-y-2 bg-white/40 p-4 backdrop-blur-md">
          <p className="text-[10px] uppercase tracking-[0.2em] text-good/85 flex items-center gap-1.5">
            <Check className="h-3 w-3" />
            {lang === "th" ? "ข้อดี" : "Pros"}
          </p>
          <ul className="space-y-1.5">
            {pros.map((p, i) => (
              <li
                key={i}
                className="flex gap-1.5 text-[12px] leading-relaxed text-[#4d463f]"
              >
                <span className="text-good/70 flex-none">·</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2 bg-white/40 p-4 backdrop-blur-md">
          <p className="text-[10px] uppercase tracking-[0.2em] text-warn/90 flex items-center gap-1.5">
            <XCircle className="h-3 w-3" />
            {lang === "th" ? "ข้อเสีย / ความเสี่ยง" : "Cons / Risks"}
          </p>
          <ul className="space-y-1.5">
            {cons.map((c, i) => (
              <li
                key={i}
                className="flex gap-1.5 text-[12px] leading-relaxed text-[#4d463f]"
              >
                <span className="text-warn/70 flex-none">·</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FactCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1 bg-white/40 p-3 backdrop-blur-md">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#6a6259]">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-[11px] leading-snug text-[#241f1a]">{value}</p>
    </div>
  );
}

// Ensure typed-import side effect (the file consumes ProcedureInfo via
// findProcedureInfo, but TS doesn't otherwise verify ProcedureInfo is
// used — keep this no-op type reference so future refactors don't drop
// the import accidentally).
export type { ProcedureInfo };

/**
 * Convert an already-loaded source image into a data: URL so it can be
 * persisted in localStorage. Uses a downscale cap so the saved record
 * doesn't blow past browser quota. JPEG quality 0.85 — fine for a
 * 320 × 240-class thumbnail.
 */
function sourceImageToDataUrl(
  img: HTMLImageElement,
  maxSide = 800,
  quality = 0.85
): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w === 0 || h === 0) return img.src;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.src;
  ctx.drawImage(img, 0, 0, tw, th);
  try {
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function compactPreviewDataUrl(
  src: string,
  maxSide: number,
  quality: number,
  timeoutMs = 8_000
): Promise<string> {
  if (process.env.NODE_ENV === "test") return Promise.resolve(src);
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    const timeout = setTimeout(() => finish(src), timeoutMs);
    image.onload = () => {
      try {
        finish(sourceImageToDataUrl(image, maxSide, quality));
      } catch {
        finish(src);
      }
    };
    image.onerror = () => finish(src);
    image.src = src;
  });
}

function safeOriginalPreviewUrl(img: HTMLImageElement): string {
  try {
    return sourceImageToDataUrl(img);
  } catch {
    return img.currentSrc || img.src;
  }
}

function previewSourceImageKey(image: HTMLImageElement): string {
  const src = image.currentSrc || image.src || "inline";
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  return `${src}:${width}x${height}`;
}
