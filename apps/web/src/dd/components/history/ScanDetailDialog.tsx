"use client";

import Image from "next/image";
import { Check, Link2, Loader2, Sparkles, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { BellCurve } from "@/components/results/BellCurve";
import { ReportDownloadButton } from "@/components/results/ReportDownloadButton";
import type { ScanRecord } from "@/lib/scan-history";
import type { Category } from "@/lib/scoring";
import { useT } from "@/lib/i18n";

interface ScanDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: ScanRecord | null;
  /** Toast state — `true` for ~1.8s after a successful share copy */
  sharedJustNow: boolean;
  sharePending: boolean;
  onShare: (record: ScanRecord) => void | Promise<void>;
  onDelete: (record: ScanRecord) => void;
}
function formatDate(ts: number, lang: "th" | "en"): string {
  return new Date(ts).toLocaleString(lang === "th" ? "th-TH" : "en-US", {
    calendar: "gregory",
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Phase 40 — full breakdown of a single saved scan. Opens when the
 * user clicks a row in `/history` (outside compare mode). Pure
 * read-only render of the persisted data — no recomputation.
 */
export function ScanDetailDialog({
  open,
  onOpenChange,
  record,
  sharedJustNow,
  sharePending,
  onShare,
  onDelete,
}: ScanDetailDialogProps) {
  const { t, lang } = useT();
  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Phase 192t — on mobile (<lg) behave like a near-full-height sheet:
          92dvh leaves a peek of backdrop at the top, w-[calc(100%-1rem)]
          uses nearly the full width. Desktop (lg+) reverts to the centered,
          comfortable max-w-xl with default height. Header + footer below are
          flex siblings of the scroll body, so they stay pinned. */}
      <DialogContent className="w-[calc(100%-1rem)] max-w-xl max-h-[92dvh] gap-0 overflow-hidden !border-white/60 !bg-white/60 p-0 text-[#241f1a] !shadow-[0_24px_80px_-48px_rgba(36,31,26,0.55)] backdrop-blur-md lg:w-[calc(100%-1.5rem)] lg:max-h-[100dvh]">
        <div className="border-b border-white/50 bg-white/40 px-6 pb-3 pt-6 pr-12 backdrop-blur">
          <DialogTitle className="font-serif text-3xl font-light italic text-[#241f1a]">{t.history.detailTitle}</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-[#625a52]">
            {formatDate(record.timestamp, lang)}
          </DialogDescription>
        </div>

        {/* Phase 192t — body scrolls between the pinned header/footer. On
            mobile the sheet is 92dvh, so cap the body at 68dvh to guarantee
            the header and the footer action row stay on-screen. */}
        <div className="min-w-0 px-5 py-5 space-y-5 max-h-[68dvh] lg:max-h-[70dvh] overflow-y-auto overscroll-contain">
          {/* Phase 138 → 147 — saved photo thumbnail. Renders the
              embedded JPEG when available; otherwise shows a tiny
              "no photo on file" hint so the user knows this is an
              older record (pre-Phase 138) — not a bug. */}
          {record.photoDataUrl ? (
            <div className="mx-auto max-w-xs overflow-hidden rounded-2xl border border-white/60 bg-white/35 backdrop-blur">
              <Image
                src={record.photoDataUrl}
                alt={lang === "th" ? "รูปจากรายงาน" : "Report photo"}
                width={320}
                height={420}
                unoptimized
                className="block h-auto max-h-[360px] w-full object-contain"
                draggable={false}
              />
            </div>
          ) : (
            <div className="mx-auto max-w-xs rounded-2xl border border-dashed border-white/60 bg-white/35 p-4 text-center backdrop-blur">
              <p className="text-[11px] italic leading-relaxed text-[#625a52]">
                {lang === "th"
                  ? "รายการนี้ไม่มีรูปแนบ — รายงานใหม่จะบันทึกรูปไว้ในประวัติบนอุปกรณ์นี้"
                  : "This record has no attached photo. New assessments save a local history photo on this device."}
              </p>
            </div>
          )}

          {/* Hero score */}
          <div className="text-center space-y-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#8f8379]">
              {t.result.overall}
            </p>
            <p className="font-serif text-7xl font-light italic leading-none tabular-nums text-[#241f1a]">
              {record.overall.toFixed(1)}
            </p>
            <p className="text-sm text-[#625a52]">{t.tier[record.tier]}</p>
            {(record.geometric !== undefined ||
              record.secondOpinion !== undefined ||
              record.learned !== undefined) && (
              <div className="mt-2 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-white/60 bg-white/40 px-3 py-1 text-[11px] tabular-nums text-[#625a52] backdrop-blur">
                {record.geometric !== undefined && (
                  <span>
                    <span className="text-[#8f8379]">{t.result.geometricShort}</span>{" "}
                    <span className="font-medium text-[#241f1a]">
                      {record.geometric.toFixed(1)}
                    </span>
                  </span>
                )}
                {record.secondOpinion !== undefined && (
                  <>
                    <span className="text-[#c8bfb4]">·</span>
                    <span>
                      <span className="text-[#8f8379]">{t.result.secondOpinionShort}</span>{" "}
                      <span className="font-medium text-[#241f1a]">
                        {record.secondOpinion.toFixed(1)}
                      </span>
                    </span>
                  </>
                )}
                {record.learned !== undefined && (
                  <>
                    <span className="text-[#c8bfb4]">·</span>
                    <span>
                      <span className="text-[#6f4fc8]">{t.result.learnedShort}</span>{" "}
                      <span className="font-medium text-[#6f4fc8]">
                        {record.learned.toFixed(1)}
                      </span>
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Bell curve */}
          <div className="max-w-sm mx-auto">
            <BellCurve
              score={record.overall}
              label={t.result.overallDistribution}
            />
          </div>

          {/* Radar summary */}
          {Object.keys(record.categories).length > 0 && (
            <div className="rounded-2xl border border-white/60 bg-white/35 p-4 backdrop-blur">
              <p className="mb-3 text-center text-[11px] uppercase tracking-[0.18em] text-[#8f8379]">
                {t.result.radarLabel}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.entries(record.categories) as Array<
                  [Category, number | undefined]
                >)
                  .filter((entry): entry is [Category, number] => {
                    return typeof entry[1] === "number";
                  })
                  .map(([category, score]) => (
                  <div
                    key={category}
                    className="rounded-xl border border-white/60 bg-white/40 px-3 py-2 backdrop-blur"
                  >
                    <p className="truncate text-[11px] text-[#625a52]">
                      {t.category[category]}
                    </p>
                    <p className="mt-1 font-serif text-2xl font-light italic leading-none text-[#241f1a] tabular-nums">
                      {score.toFixed(1)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calibration + views */}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/35 px-4 py-3 text-xs text-[#625a52] backdrop-blur">
            <span className="min-w-0 break-words">
              {t.calibration[record.options.gender]} ·{" "}
              {t.calibration[record.options.ethnicity]}
            </span>
            <span className="text-[10px] text-[#8f8379]">
              {record.views.side ? "Front + Side" : "Front only"}
            </span>
          </div>

          {/* Quality badge if present */}
          {record.quality && record.quality.overall !== "ok" && (
            <div
              className={`rounded-xl border px-4 py-3 text-[11px] leading-relaxed ${
                record.quality.overall === "bad"
                  ? "border-warn/40 bg-warn/[0.06] text-warn"
                  : "border-warn/30 bg-warn/[0.05] text-warn"
              }`}
            >
              {t.history.qualityHint.replace(
                "{n}",
                record.quality.issueCount.toString()
              )}
            </div>
          )}

          {/* Phase 138 — AI summary captured at scan time */}
          {record.aiReasoning && (
            <div className="space-y-2 rounded-2xl border border-white/60 bg-white/35 p-4 backdrop-blur">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-[#7a5bd6]" />
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#6f4fc8]">
                  {lang === "th" ? "สรุปจากรายงาน" : "Report summary"}
                </p>
              </div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#241f1a]">
                {record.aiReasoning}
              </p>
              {record.aiPerceived && (
                <div className="flex min-w-0 flex-wrap items-center gap-2 pt-1 text-[10px] text-[#625a52]">
                  <span className="max-w-full break-words rounded-full border border-white/60 bg-white/40 px-2 py-0.5 backdrop-blur">
                    {lang === "th" ? "สีหน้า" : "expression"}
                    {": "}
                    {record.aiPerceived.expression}
                  </span>
                  <span className="max-w-full break-words rounded-full border border-white/60 bg-white/40 px-2 py-0.5 backdrop-blur">
                    {lang === "th" ? "คุณภาพภาพ" : "photo quality"}
                    {": "}
                    {record.aiPerceived.photoQuality}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Phase 138 — Personalized advice captured at scan time */}
          {record.aiAdvice && record.aiAdvice.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-cyan">
                {lang === "th" ? "จุดที่พัฒนาได้" : "Areas to improve"}
              </p>
              <div className="space-y-2">
                {record.aiAdvice.map((a, i) => (
                  <div
                    key={i}
                    className="space-y-1 rounded-xl border border-white/60 bg-white/40 p-3 backdrop-blur"
                  >
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 break-words text-[12px] font-medium text-[#241f1a]">
                        {a.metric}
                      </p>
                      <span
                        className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                          a.difficulty === "easy"
                            ? "border-good/40 bg-good/10 text-good/90"
                            : a.difficulty === "mid"
                              ? "border-cyan/40 bg-cyan/10 text-cyan/90"
                              : "border-warn/40 bg-warn/10 text-warn/95"
                        }`}
                      >
                        {a.difficulty === "easy"
                          ? lang === "th"
                            ? "ง่าย"
                            : "Easy"
                          : a.difficulty === "mid"
                            ? lang === "th"
                              ? "กลาง"
                              : "Mid"
                            : lang === "th"
                              ? "ยาก"
                              : "Hard"}
                      </span>
                    </div>
                    <p className="text-[11px] italic leading-relaxed text-[#625a52]">
                      {a.observation}
                    </p>
                    {a.recommendations.length > 0 && (
                      <ul className="space-y-0.5 pt-1">
                        {a.recommendations.map((rec, ri) => (
                          <li
                            key={ri}
                            className="flex gap-1.5 text-[11px] leading-relaxed text-[#4f4740]"
                          >
                            <span className="flex-none text-[#7a5bd6]">·</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phase 138 — Projection ladder if present */}
          {record.aiPotential && (
            <div className="space-y-2 rounded-2xl border border-white/60 bg-white/35 p-4 backdrop-blur">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#6f4fc8]">
                {lang === "th" ? "ทำตามแล้วได้แค่ไหน" : "Projected if you follow through"}
              </p>
          <div className="grid grid-cols-1 gap-2 text-center min-[360px]:grid-cols-3">
                <div className="rounded-lg bg-good/[0.08] border border-good/30 p-2">
                  <p className="text-[10px] text-good/85 uppercase tracking-wider">
                    {lang === "th" ? "ง่าย" : "Easy"}
                  </p>
                  <p className="text-lg font-medium tabular-nums text-[#241f1a]">
                    {record.aiPotential.ifEasy.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg bg-cyan/[0.08] border border-cyan/30 p-2">
                  <p className="text-[10px] text-cyan/85 uppercase tracking-wider">
                    {lang === "th" ? "กลาง" : "Mid"}
                  </p>
                  <p className="text-lg font-medium tabular-nums text-[#241f1a]">
                    {record.aiPotential.ifMid.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-[#7a5bd6]/25 bg-[#f6f1ff] p-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#6f4fc8]">
                    {lang === "th" ? "ยาก" : "Hard"}
                  </p>
                  <p className="text-lg font-medium tabular-nums text-[#241f1a]">
                    {record.aiPotential.ifHard.toFixed(1)}
                  </p>
                </div>
              </div>
              {record.aiPotential.note && (
                <p className="text-[11px] italic leading-relaxed text-[#625a52]">
                  {record.aiPotential.note}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid min-w-0 gap-3 border-t border-[#241f1a]/10 px-5 py-3 sm:flex sm:justify-between">
          <button
            type="button"
            onClick={() => onDelete(record)}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-bad/35 px-4 py-2.5 text-sm font-medium text-bad transition hover:bg-bad/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad/35"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t.history.deleteRow}
          </button>
          <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <ReportDownloadButton
            record={record}
            variant="primary"
            size="default"
            className="w-full justify-center border border-white/60 bg-white/45 shadow-none backdrop-blur hover:bg-white/65 sm:w-auto"
          />
          <button
            type="button"
            onClick={() => void onShare(record)}
            disabled={sharePending}
            aria-busy={sharePending ? "true" : undefined}
            className={`inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35 sm:w-auto ${
              sharedJustNow
                ? "bg-good/15 border border-good/40 text-good"
                : "bg-[#241f1a] text-white hover:bg-[#342d27]"
            } disabled:pointer-events-none disabled:opacity-60`}
          >
            {sharePending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t.share.copyLink}
              </>
            ) : sharedJustNow ? (
              <>
                <Check className="h-3.5 w-3.5" />
                {t.share.copied}
              </>
            ) : (
              <>
                <Link2 className="h-3.5 w-3.5" />
                {t.share.copyLink}
              </>
            )}
          </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
