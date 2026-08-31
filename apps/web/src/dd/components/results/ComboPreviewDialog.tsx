"use client";

/**
 * Phase 135 — combined-procedure preview dialog.
 *
 * Takes 2-3 procedure keys and runs them through a single image-gen
 * request so the user sees the stacked result in one picture. Shares
 * the same before/after slider treatment as the single-procedure
 * preview dialog.
 */

import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { m, AnimatePresence } from "framer-motion";
import { AlertTriangle, Download, RefreshCw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
// Phase 180 — `loadApiKey` removed; Gemini calls now hit server proxy.
import {
  alignAfterToBeforeFace,
  callGeminiComboPreview,
  findProcedure,
  MAX_COMBO_PROCEDURES,
  type Intensity,
  type ProcedureKey,
  type SurgeryPreviewResult,
} from "@/lib/ai-gemini-image";
import {
  mergeProcedureRegions,
  hasOverlappingProcedureRegions,
  renderDiffHeatmap,
  runObedienceCheck,
  type ObedienceReport,
} from "@/lib/obedience-check";
import { ObediencePanel } from "@/components/results/ObediencePanel";
import { PortraitGenerationBusy } from "@/components/results/SurgeryPreviewCard";
import { savePreview } from "@/lib/procedure-preview-history";
import { saveImage, isLikelyIOS } from "@/lib/download-image";
import { useT } from "@/lib/i18n";
import { humanizeError } from "@/lib/humanizeError";
import { validateProcedurePreviewPostCheck } from "@/lib/procedure-preview-postcheck";
// Phase 192u — global paywall gate. A combo gen that fails on preview-quota
// exhaustion (or premium expiry → 0-quota downgrade) routes to the
// subscription dialog instead of showing the generic error overlay.
import { useQuotaGate, openGateFromError } from "@/lib/quota-gate";
import type { Gender } from "@/types";

/**
 * Phase 151 — same bundle shape as SurgeryPreviewCard. Holds the result,
 * its obedience report, and the lazily-rendered diff heatmap so the cache
 * survives "Show what changed" toggles.
 */
type CachedSlot = {
  requestKey: string;
  result: SurgeryPreviewResult;
  obedience: ObedienceReport | null;
  heatmap: string | null;
};

interface ComboPreviewDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  procedureKeys: ProcedureKey[];
  image: HTMLImageElement;
  gender: Gender;
}

const PREVIEW_INTENSITY: Intensity = "strong";
const CLIENT_COMBO_RETRIES = 2;
const CLIENT_COMBO_RETRY_DELAY_MS =
  process.env.NODE_ENV === "test" ? 0 : 1400;

function comboRetryDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, CLIENT_COMBO_RETRY_DELAY_MS * attempt);
  });
}

function shouldRetryComboError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/auth|token|quota|402|401|forbidden|no-api-key|cancel/i.test(message)) {
    return false;
  }
  return /no-image|empty|timeout|network|fetch|failed|500|502|503|504/i.test(
    message,
  );
}

export function ComboPreviewDialog({
  open,
  onOpenChange,
  procedureKeys,
  image,
  gender,
}: ComboPreviewDialogProps) {
  const { lang } = useT();
  // Phase 192u — gate hook at the component top level (hooks rule). The
  // combo generation catch references openGate to pop the paywall when the
  // preview proxy throws a quota-exhaustion / 402 error.
  const { openGate } = useQuotaGate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const intensity = PREVIEW_INTENSITY;
  // Phase 151 — show/hide pixel-diff heatmap overlay.
  const [showDiff, setShowDiff] = useState(false);
  // Phase 151 — per-intensity slot now bundles result + obedience report
  // + lazily-rendered heatmap (same pattern as PreviewDialog).
  const [slotsByIntensity, setSlotsByIntensity] = useState<
    Partial<Record<Intensity, CachedSlot>>
  >({});
  const slotsRef = useRef<Partial<Record<Intensity, CachedSlot>>>({});
  // Phase 192n — AbortController for in-flight generation (combo). The
  // route consumes the "previews" quota slot before invoking Gemini, so
  // client-side cancel does NOT recover quota — but it does release the
  // UI from a 10-20s wait the user has lost interest in. Honest framing
  // in the surface message ("Cancelled / ยกเลิกแล้ว").
  const abortRef = useRef<AbortController | null>(null);

  const procedureSig = procedureKeys.slice(0, MAX_COMBO_PROCEDURES).join("|");
  const capped = useMemo(
    () => procedureSig.split("|").filter(Boolean) as ProcedureKey[],
    [procedureSig]
  );
  const procedures = useMemo(
    () =>
      capped
        .map((k) => findProcedure(k))
        .filter((p): p is NonNullable<ReturnType<typeof findProcedure>> => !!p),
    [capped]
  );
  const overCap = procedureKeys.length > MAX_COMBO_PROCEDURES;
  const imageKey = previewSourceImageKey(image);
  const requestKey = `${procedureSig}:${gender}:${intensity}:${imageKey}`;

  const cachedSlot = slotsByIntensity[intensity] ?? null;
  const slot = cachedSlot?.requestKey === requestKey ? cachedSlot : null;
  const result = slot?.result ?? null;
  const obedience = slot?.obedience ?? null;
  const heatmapUrl = slot?.heatmap ?? null;

  useEffect(() => {
    slotsRef.current = slotsByIntensity;
  }, [slotsByIntensity]);

  // Reset per-intensity cache when the combo set changes.
  useEffect(() => {
    slotsRef.current = {};
    setSlotsByIntensity({});
    setShowDiff(false);
    setError(null);
  }, [procedureSig, imageKey, gender]);

  useEffect(() => {
    if (!open || procedures.length === 0) return;
    if (hasOverlappingProcedureRegions(procedures.map((procedure) => procedure.key))) {
      setBusy(false);
      setError(humanizeError(new Error("preview-combo-overlap"), lang));
      return;
    }
    // Cache hit — show prior gen for this intensity, skip API.
    if (slotsRef.current[intensity]?.requestKey === requestKey) {
      setBusy(false);
      setError(null);
      return;
    }
    let cancelled = false;
    // Phase 192n — fresh AbortController per effect run. Cancel button
    // calls .abort(), which flips `cancelled` via the signal listener
    // and (when ai-gemini-image grows signal support) tears the fetch
    // down. Currently the local cancellation is sufficient.
    const localCtrl = new AbortController();
    abortRef.current = localCtrl;
    localCtrl.signal.addEventListener("abort", () => {
      cancelled = true;
    });
    setError(null);
    setBusy(true);
    runCombo();
    async function runCombo(): Promise<void> {
      // Phase 180 — server proxy auths via Supabase JWT.
      let token: string | undefined;
      try {
        const { getAccessToken } = await import("@/lib/supabase/auth-client");
        token = (await getAccessToken(true)) ?? undefined;
        if (!token) throw new Error("auth-token-missing");
      } catch (e) {
        if (!cancelled) {
          setError(humanizeError(e, lang));
          setBusy(false);
        }
        return;
      }
      let previewAttempt = 0;
      const requestPreview = async (): Promise<SurgeryPreviewResult> => {
        try {
          return await callGeminiComboPreview({
            image,
            procedures,
            gender,
            ...(token ? { idToken: token } : {}),
            intensity,
          });
        } catch (e) {
          if (
            !cancelled &&
            previewAttempt < CLIENT_COMBO_RETRIES &&
            shouldRetryComboError(e)
          ) {
            previewAttempt += 1;
            await comboRetryDelay(previewAttempt);
            return requestPreview();
          }
          throw e;
        }
      };
      requestPreview()
        .then(async (r) => {
          if (cancelled) return r;
          // Phase 146 — face-aware alignment (same approach as the
          // single-procedure dialog). Lands the AI face exactly where
          // the original face is in pixel space, with cover-center
          // fallback if landmark detection fails.
          // The raw provider image is aligned before local compositing.
          // The contract limits the local composite to selected regions.
          let normalized = r.imageDataUrl;
          try {
            normalized = await alignAfterToBeforeFace(
              image,
              r.imageDataUrl,
              r.editContract
            );
          } catch {
            normalized = safeOriginalPreviewUrl(image);
          }
          if (cancelled) return r;
          const meta = mergeProcedureRegions(procedures.map((p) => p.key));
          const inspectCandidate = async (
            candidateUrl: string
          ): Promise<ObedienceReport | null> => {
            const postCheck = await validateProcedurePreviewPostCheck({
              beforeImage: image,
              afterImageDataUrl: candidateUrl,
              procedures,
              stage: "final",
              intensity,
            });
            if (!postCheck.ok) {
              if (postCheck.code === "effect-not-applicable") {
                throw new Error("preview-effect-not-applicable");
              }
              return null;
            }
            try {
              const report = await runObedienceCheck({
                beforeImage: image,
                alignedAfterUrl: candidateUrl,
                expectedRegions: meta.regions,
                global: meta.global,
              });
              return report?.severity === "none" ? report : null;
            } catch {
              return null;
            }
          };
          // Phase 151 — measure drift for the combined modifications.
          // mergeProcedureRegions unions all the targeted regions across
          // the picked procedures and only flags edits OUTSIDE that union.
          let obedienceReport = await inspectCandidate(normalized);
          let source = r.source ?? "provider";
          if (!obedienceReport) {
            normalized = await alignAfterToBeforeFace(
              image,
              safeOriginalPreviewUrl(image),
              r.editContract
            );
            obedienceReport = await inspectCandidate(normalized);
            source = "deterministic";
          }
          if (!obedienceReport) {
            throw new Error("preview-locality-rejected");
          }
          const final: SurgeryPreviewResult = {
            ...r,
            imageDataUrl: normalized,
            source,
          };
          if (source === "deterministic") delete final.description;
          if (cancelled) return r;
          setSlotsByIntensity((prev) => {
            const next = {
              ...prev,
              [intensity]: {
                requestKey,
                result: final,
                obedience: obedienceReport,
                heatmap: null,
              },
            };
            slotsRef.current = next;
            return next;
          });
          setError(null);
          try {
            const beforeDataUrl = sourceImageToDataUrl(image);
            savePreview({
              timestamp: Date.now(),
              procedureKey: procedures[0]!.key,
              intensity,
              comboKeys: procedures.map((p) => p.key),
              beforeDataUrl,
              afterDataUrl: final.imageDataUrl,
              ...(final.description ? { description: final.description } : {}),
            });
          } catch {
            /* best-effort */
          }
          return final;
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            // Phase 192u — out-of-quota / premium-expired → paywall, not the
            // error overlay. openGateFromError returns false for an AbortError
            // (and the !cancelled guard already filters user-cancel), so an
            // aborted combo never reaches here. Clear the spinner before
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
          if (!cancelled) setBusy(false);
        });
    }
    return () => {
      cancelled = true;
      // Phase 192n — abort on cleanup so a dialog close mid-generation
      // tears down any signal-aware downstream + clears abortRef.
      if (!localCtrl.signal.aborted) localCtrl.abort();
      if (abortRef.current === localCtrl) abortRef.current = null;
      // Phase 190 — reset busy on cleanup so rapid open/close doesn't
      // leave the spinner armed forever when the dialog reopens.
      setBusy(false);
    };
  }, [
    open,
    attempt,
    intensity,
    requestKey,
    procedureSig,
    image,
    gender,
    lang,
    openGate,
    procedures,
  ]);

  // Phase 151 — lazy heatmap render (same flow as PreviewDialog).
  useEffect(() => {
    if (!showDiff) return;
    if (!result?.imageDataUrl) return;
    if (heatmapUrl) return;
    let cancelled = false;
    renderDiffHeatmap(image, result.imageDataUrl)
      .then((url) => {
        if (cancelled || !url) return;
        setSlotsByIntensity((prev) => {
          const current = prev[intensity];
          if (!current) return prev;
          return {
            ...prev,
            [intensity]: { ...current, heatmap: url },
          };
        });
      })
      .catch(() => {
        /* heatmap is best-effort sugar; never block the preview */
      });
    return () => {
      cancelled = true;
    };
  }, [showDiff, result?.imageDataUrl, heatmapUrl, intensity, image]);

  // Phase 192n — iOS-safe download via shared saveImage helper. Swaps
  // the inline `<a download>` for share-sheet-first behavior so iPhone
  // users actually save to Photos instead of opening the data URL in a
  // tab they have no choice but to close.
  function download() {
    if (!result?.imageDataUrl) return;
    void saveImage(
      result.imageDataUrl,
      `doodee-combo-${capped.join("-")}-${Date.now()}.png`,
    );
  }

  // Phase 192n — User cancel. Aborts the controller and surfaces the
  // cancelled state. Quota cost may already have been deducted server
  // side; we don't claim otherwise in the toast.
  function cancelGeneration() {
    const ctrl = abortRef.current;
    if (ctrl && !ctrl.signal.aborted) ctrl.abort();
    abortRef.current = null;
    setBusy(false);
    setError(lang === "th" ? "ยกเลิกแล้ว" : "Cancelled");
  }

  const labels = procedures.map((p) =>
    lang === "th" ? p.label_th : p.label_en,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="doodee-procedure-preview-dialog flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] min-w-0 select-none flex-col gap-0 overflow-hidden overflow-x-hidden rounded-[1.75rem] p-0 !left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 !border-white/10 !bg-[#070b1a] !text-white !shadow-[0_30px_100px_-50px_rgba(6,182,212,0.35)] !backdrop-blur-xl sm:w-[calc(100vw-2rem)] sm:max-w-5xl">
        <div className="shrink-0 border-b border-white/10 px-4 pb-3 pr-12 pt-5 sm:px-6 sm:pt-6">
          <DialogTitle className="text-xl leading-tight sm:text-2xl">
            {lang === "th"
              ? `ผสมรวม ${procedures.length} หัตถการ`
              : `${procedures.length} procedures combined`}
          </DialogTitle>
          <DialogDescription className="mt-2 flex min-w-0 flex-wrap gap-1.5 text-xs text-white/65">
            {labels.map((l, i) => (
              <span
                key={i}
                className="inline-flex max-w-full items-center break-words rounded-full border border-cyan/25 bg-cyan/10 px-2 py-0.5 text-[10px] text-cyan"
              >
                {l}
              </span>
            ))}
          </DialogDescription>
        </div>

        <div className="no-scrollbar min-h-0 min-w-0 flex-1 touch-pan-y space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 sm:px-5 sm:py-5">
          {overCap && (
            <p className="text-[11px] text-warn/90 italic">
              {lang === "th"
                ? `ใช้สูงสุด ${MAX_COMBO_PROCEDURES} หัตถการต่อรูป — เพื่อให้ผลคมชัด`
                : `Capped at ${MAX_COMBO_PROCEDURES} procedures per image for quality.`}
            </p>
          )}

          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(240px,0.72fr)_minmax(0,1.28fr)] lg:items-start">
            <div
              className={`min-w-0 space-y-3 lg:order-2 ${
                result && !busy && !error ? "procedure-result-ready" : ""
              }`}
            >
          <ComboBeforeAfter
            beforeUrl={image.src}
            afterUrl={result?.imageDataUrl ?? null}
            busy={busy}
            error={error}
            lang={lang}
            heatmapUrl={heatmapUrl}
            showDiff={showDiff}
          />

          {result?.source === "deterministic" && !busy && !error && (
            <p
              data-testid="deterministic-fallback-label"
              className="rounded-xl border border-warn/25 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-warn"
            >
              {lang === "th"
                ? "ผลจาก AI ไม่ผ่านการตรวจ ระบบจึงปรับเฉพาะจุดบนภาพเดิมด้วยโครงหน้า"
                : "AI output failed review. This result uses local facial geometry on the original photo."}
            </p>
          )}

          {/* Phase 151 — obedience guardrail + "Show what changed" toggle. */}
          {result && !busy && !error && (
            <ObediencePanel
              report={obedience}
              showDiff={showDiff}
              onToggleDiff={() => setShowDiff((v) => !v)}
              lang={lang}
            />
          )}
            </div>

            <aside className="min-w-0 space-y-3 lg:order-1 lg:sticky lg:top-0">
              <div className="rounded-2xl border border-[#241f1a]/10 bg-white/50 p-3 shadow-[0_14px_40px_rgba(36,31,26,0.06)] backdrop-blur-md sm:p-4">
                <p className="text-[10px] uppercase tracking-wider text-[#6a6259]">
                  {lang === "th" ? "รายการในภาพรวม" : "Items in this image"}
                </p>
                <div className="mt-3 space-y-2">
                  {procedures.map((item, index) => (
                    <div
                      key={item.key}
                      className="flex min-w-0 items-start gap-2 rounded-xl border border-[#241f1a]/10 bg-white/55 p-2.5"
                    >
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#241f1a] text-[11px] font-semibold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="break-words text-[12px] font-semibold text-[#241f1a]">
                          {lang === "th" ? item.label_th : item.label_en}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-[#6a6259]">
                          {lang === "th" ? item.hint_th : item.hint_en}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

          {result?.description && (
            <p className="rounded-2xl border border-[#241f1a]/10 bg-white/50 px-4 py-3 text-[12px] leading-relaxed text-[#4d463f] backdrop-blur-md">
              {result.description}
            </p>
          )}

          <div className="min-w-0 rounded-2xl border border-warn/25 bg-[#fff9ed]/70 p-3 flex items-start gap-2.5 backdrop-blur-md">
            <AlertTriangle className="h-3.5 w-3.5 text-warn/90 mt-0.5 flex-none" />
            <p className="text-[11px] text-warn/90 leading-relaxed">
              {lang === "th"
                ? "ภาพนี้เป็นการจำลองจากรายการที่เลือก ไม่ใช่คำแนะนำเพิ่มเติมและไม่ใช่ผลลัพธ์ทางการแพทย์จริง โปรดปรึกษาแพทย์ผู้เชี่ยวชาญก่อนตัดสินใจ"
                : "This is a simulation from the selected items, not an additional recommendation or a medical prediction. Consult a board-certified specialist before deciding."}
            </p>
          </div>
            </aside>
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 flex-wrap justify-end gap-2 border-t border-white/10 bg-[#050816]/88 px-3 py-3 backdrop-blur-md sm:px-5">
          {/* Phase 192n — Cancel only while a generation is running so
              the user isn't trapped waiting 10-20s for a combo they no
              longer want. See cancelGeneration for the honest quota
              caveat. */}
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
              // Phase 146 — bust the cache slot for this intensity then
              // bump attempt to force the effect to re-run with a fresh
              // generation request.
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
          {/* Phase 192n — iOS-only hint for users whose share-sheet
              choice doesn't expose Save-to-Photos cleanly. */}
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

function ComboBeforeAfter({
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
  const [aspect, setAspect] = useState<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Phase 192q — stale-decode race fix. Same pattern as
  // SurgeryPreviewCard BeforeAfter: a new beforeUrl while the previous
  // Image was still decoding made the old onload fire after the new
  // aspect was set, snapping the combo dialog back to the OLD ratio.
  // Cancelled flag + onload=null in cleanup keeps the state monotonic.
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

  const frameWidthClass =
    aspect !== null && aspect < 0.85
      ? "max-w-[390px] sm:max-w-[420px]"
      : "max-w-[680px]";

  return (
    <div
      ref={wrapRef}
      className={`relative mx-auto h-[min(54dvh,500px)] min-h-[260px] w-full ${frameWidthClass} min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-[#050816] shadow-[0_22px_70px_rgba(0,0,0,0.38)] sm:h-[min(62dvh,560px)] sm:min-h-[320px]`}
      // Phase 192n — touch-action: pan-y so vertical page-scroll passes
      // through the slider on mobile. Without this, finger-on-slider
      // captured the gesture and the user couldn't scroll the page
      // down to reach the controls underneath.
      style={{ touchAction: "pan-y" }}
      onMouseMove={(e) => e.buttons === 1 && onMove(e.clientX)}
      onMouseDown={(e) => onMove(e.clientX)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={clearTouchStart}
      onTouchCancel={clearTouchStart}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeUrl}
        alt="before"
        className="absolute inset-0 h-full w-full object-contain object-center"
        draggable={false}
      />
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
      {/* Phase 151 — pixel-diff heatmap overlay (same logic as
          SurgeryPreviewCard's BeforeAfter). Sits above both image
          layers so it stays visible regardless of slider position. */}
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
      <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-[#050816]/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-[0_10px_24px_rgba(0,0,0,0.22)] backdrop-blur-md">
        {lang === "th" ? "ก่อน" : "before"}
      </div>
      {afterUrl && !busy && (
        <div className="absolute right-3 top-3 rounded-full border border-cyan/25 bg-cyan/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan shadow-[0_10px_24px_rgba(0,0,0,0.22)] backdrop-blur-md">
          {lang === "th" ? "ภาพอ้างอิงรวม" : "combined reference"}
        </div>
      )}
      {busy && <PortraitGenerationBusy lang={lang} combo />}
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
    </div>
  );
}

/** Same helper logic as SurgeryPreviewCard — duplicated rather than
 *  re-exported because the original is colocated with its only caller. */
function sourceImageToDataUrl(img: HTMLImageElement, maxSide = 800): string {
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
  return canvas.toDataURL("image/jpeg", 0.85);
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
