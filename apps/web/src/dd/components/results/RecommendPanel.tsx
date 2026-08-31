"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Wallet,
  Wand2,
} from "lucide-react";
import {
  callGeminiProcedureRecommend,
  findProcedure,
  findProcedureInfo,
  formatBaht,
  PROCEDURES,
  summarizeSelection,
  type AnatomyLayer,
  type Intensity,
  type ProcedureKey,
  type RecommendItem,
  type RecommendResult,
} from "@/lib/ai-gemini-image";
import { useT } from "@/lib/i18n";
import { humanizeError } from "@/lib/humanizeError";
import { useQuotaGate, openGateFromError } from "@/lib/quota-gate";
import { remainingQuota } from "@/lib/quota";
import { useSubscription } from "@/lib/use-subscription";
import type { Gender } from "@/types";
import type { RecommendMetricsSummary } from "@/lib/recommend-metrics-summary";

interface RecommendPanelProps {
  image: HTMLImageElement;
  gender: Gender;
  /** Phase 638 — full computeAll metrics for `image`, same pipeline
   * /scan uses. Sent alongside the photo so the AI recommendation is
   * grounded in measured data. Null when unavailable (falls back to
   * photo-only analysis server-side). */
  metrics: RecommendMetricsSummary | null;
  onTry: (items: RecommendedPreviewRequest[]) => void;
}

export interface RecommendedPreviewRequest {
  key: ProcedureKey;
  intensity: Intensity;
}

function impactBadge(
  impact: RecommendItem["impact"],
  lang: "th" | "en"
): { label: string; className: string; dotClass: string } {
  if (impact === "high") {
    return {
      label: lang === "th" ? "ผลกระทบสูง" : "High impact",
      className: "border-[#7a5bd6]/25 bg-[#f3efff]/70 text-[#5b43ad] backdrop-blur-md",
      dotClass: "bg-[#7a5bd6]",
    };
  }
  if (impact === "low") {
    return {
      label: lang === "th" ? "ผลกระทบต่ำ" : "Low impact",
      className: "border-[#241f1a]/10 bg-white/45 text-[#766e65] backdrop-blur-md",
      dotClass: "bg-[#9a9188]",
    };
  }
  return {
    label: lang === "th" ? "ผลกระทบปานกลาง" : "Medium impact",
    className: "border-[#067e96]/25 bg-[#eef8f8]/70 text-[#067e96] backdrop-blur-md",
    dotClass: "bg-[#067e96]",
  };
}

function anatomyLayerBadge(
  layer: AnatomyLayer,
  lang: "th" | "en"
): { label: string; className: string } {
  const labels: Record<AnatomyLayer, { th: string; en: string }> = {
    bone: { th: "โครงสร้าง", en: "Bone" },
    muscle: { th: "กล้ามเนื้อ", en: "Muscle" },
    fat: { th: "ไขมัน", en: "Fat" },
    skin: { th: "ผิว", en: "Skin" },
    volume: { th: "วอลุ่ม", en: "Volume" },
    dental: { th: "ฟัน/รอยยิ้ม", en: "Dental" },
  };
  return {
    label: lang === "th" ? labels[layer].th : labels[layer].en,
    className: "border-[#241f1a]/10 bg-white/50 text-[#6f625a] backdrop-blur-md",
  };
}

function recommendRequestKey(image: HTMLImageElement, gender: Gender): string {
  const imageKey = image.currentSrc || image.src || `${image.naturalWidth}`;
  return `${gender}:${imageKey}:${image.naturalWidth}x${image.naturalHeight}`;
}

interface RecommendPanelCacheEntry {
  result: RecommendResult;
  selected: ProcedureKey[];
}

const recommendPanelCache = new Map<string, RecommendPanelCacheEntry>();

function readRecommendPanelCache(
  key: string
): RecommendPanelCacheEntry | null {
  return recommendPanelCache.get(key) ?? null;
}

function writeRecommendPanelCache(
  key: string,
  result: RecommendResult | null,
  selected: ReadonlySet<ProcedureKey>
): void {
  if (!result) return;
  recommendPanelCache.set(key, {
    result,
    selected: Array.from(selected),
  });
}

export function RecommendPanel({
  image,
  gender,
  metrics,
  onTry,
}: RecommendPanelProps) {
  const { lang } = useT();
  const { openGate } = useQuotaGate();
  const { subscription, loading: quotaLoading } = useSubscription();
  const requestKey = useMemo(
    () => recommendRequestKey(image, gender),
    [image, gender]
  );
  const cachedState = readRecommendPanelCache(requestKey);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendResult | null>(
    () => cachedState?.result ?? null
  );
  const [resultKey, setResultKey] = useState<string | null>(() =>
    cachedState ? requestKey : null
  );
  const [selected, setSelected] = useState<Set<ProcedureKey>>(
    () => new Set(cachedState?.selected ?? [])
  );
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const autoFetchKeyRef = useRef<string | null>(null);
  const langRef = useRef(lang);
  const openGateRef = useRef(openGate);
  const requestIdRef = useRef(0);

  const hasKey = true;

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    openGateRef.current = openGate;
  }, [openGate]);

  useEffect(() => {
    const cached = readRecommendPanelCache(requestKey);
    setErr(null);
    if (cached) {
      setResult(cached.result);
      setResultKey(requestKey);
      setSelected(new Set(cached.selected));
      return;
    }
    setResult(null);
    setResultKey(null);
    setSelected(new Set());
  }, [requestKey]);

  useEffect(() => {
    if (resultKey !== requestKey) return;
    writeRecommendPanelCache(requestKey, result, selected);
  }, [requestKey, result, resultKey, selected]);

  const fetchRecs = useCallback(async (force = false) => {
    if (!force) {
      const cached = readRecommendPanelCache(requestKey);
      if (cached) {
        setErr(null);
        setResult(cached.result);
        setResultKey(requestKey);
        setSelected(new Set(cached.selected));
        return;
      }
    } else {
      recommendPanelCache.delete(requestKey);
    }
    if (inFlightKeysRef.current.has(requestKey)) return;
    if (
      !quotaLoading &&
      subscription &&
      remainingQuota(subscription, "scans") <= 0
    ) {
      setErr(null);
      setResult(null);
      setResultKey(null);
      setSelected(new Set());
      openGateRef.current({ kind: "scans", tier: subscription.tier });
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    inFlightKeysRef.current.add(requestKey);
    setBusy(true);
    setErr(null);
    setResult(null);
    setResultKey(null);
    setSelected(new Set());
    try {
      const { getAccessToken } = await import("@/lib/supabase/auth-client");
      const idToken = (await getAccessToken(true)) ?? undefined;
      if (!idToken) throw new Error("auth-token-missing");
      const r = await callGeminiProcedureRecommend({
        image,
        gender,
        ...(idToken ? { idToken } : {}),
        ...(metrics ? { metrics } : {}),
      });
      if (requestIdRef.current === requestId) {
        setResult(r);
        setResultKey(requestKey);
      }
    } catch (e) {
      if (openGateFromError(e, openGateRef.current)) {
        return;
      }
      if (requestIdRef.current === requestId) {
        setErr(humanizeError(e, langRef.current));
      }
    } finally {
      inFlightKeysRef.current.delete(requestKey);
      if (requestIdRef.current === requestId) {
        setBusy(false);
      }
    }
  }, [image, gender, metrics, quotaLoading, requestKey, subscription]);

  useEffect(() => {
    if (!hasKey || quotaLoading) return;
    if (autoFetchKeyRef.current === requestKey) return;
    autoFetchKeyRef.current = requestKey;
    void fetchRecs();
  }, [hasKey, quotaLoading, requestKey, fetchRecs]);

  function toggle(key: ProcedureKey) {
    setSelected((prev) => {
      if (prev.has(key)) return new Set<ProcedureKey>();
      return new Set<ProcedureKey>([key]);
    });
  }

  const selectedOrdered = useMemo(() => {
    if (!result) return [] as ProcedureKey[];
    return result.items.map((it) => it.key).filter((k) => selected.has(k));
  }, [result, selected]);

  const selectedItems = useMemo(() => {
    if (!result) return [] as RecommendItem[];
    return result.items.filter((it) => selected.has(it.key));
  }, [result, selected]);

  const summary = useMemo(
    () => summarizeSelection(selectedOrdered),
    [selectedOrdered]
  );

  const longestDowntimeLabel = useMemo(() => {
    if (!summary.longestDowntimeKey) return null;
    const info = findProcedureInfo(summary.longestDowntimeKey);
    const def = findProcedure(summary.longestDowntimeKey);
    if (!info || !def) return null;
    return {
      label: lang === "th" ? def.label_th : def.label_en,
      downtime: lang === "th" ? info.downtime_th : info.downtime_en,
    };
  }, [summary.longestDowntimeKey, lang]);

  function simulateSelected() {
    if (selectedItems.length === 0) return;
    setErr(null);
    const key = selectedOrdered[0];
    if (!key) return;
    onTry([{ key, intensity: "strong" }]);
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#067e96]">
            {lang === "th" ? "ประเด็นก่อนปรึกษา" : "Consult priorities"}
          </p>
          <h3 className="text-2xl font-semibold text-[#241f1a]">
            {lang === "th"
              ? "ควรเริ่มจากจุดไหน"
              : "Where should you start?"}
          </h3>
          <p className="max-w-md text-xs leading-relaxed text-[#6f625a]">
            {lang === "th"
              ? "จัดลำดับประเด็นจากรูปของคุณ แล้วเลือก 1 รายการเพื่อสร้างภาพหลังหัตถการ 4 แบบ"
              : "Suggested consult questions are generated from visible aesthetic cues. Choose 1 item to generate 4 after options."}
          </p>
        </div>
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-[#067e96]/20 bg-[#eef8f8]/70 text-[#067e96] shadow-[0_16px_34px_-28px_rgba(6,126,150,0.75)] backdrop-blur-md">
          <Wand2 className="h-4 w-4" />
        </div>
      </div>

      {!hasKey && (
        <div className="rounded-xl border border-warn/30 bg-warn/[0.06] p-3 flex items-start gap-2.5">
          <AlertTriangle className="h-3.5 w-3.5 text-warn/90 mt-0.5 flex-none" />
          <p className="text-[11px] text-warn/90 leading-relaxed">
            {lang === "th"
              ? "การจัดลำดับประเด็นยังไม่พร้อมใช้งาน"
              : "Consult-priority review is not available right now"}
          </p>
        </div>
      )}

      {busy && (
        <div className="relative flex flex-col items-center gap-3.5 overflow-hidden rounded-2xl border border-[#241f1a]/10 bg-white/55 p-7 shadow-[0_18px_55px_-42px_rgba(36,31,26,0.32)] backdrop-blur-md">
          <div className="relative h-12 w-12 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full border border-[#067e96]/25" />
            <span className="absolute inset-0 animate-ping rounded-full bg-[#067e96]/10" />
            <Loader2 className="relative h-6 w-6 animate-spin text-[#067e96]" />
          </div>
          <p className="text-lg font-semibold text-[#241f1a]">
            {lang === "th"
              ? "กำลังประเมินรูปของคุณ..."
              : "Reviewing your photo..."}
          </p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#8d8378]">
            {lang === "th" ? "ใช้เวลาประมาณ 5-15 วินาที" : "Usually 5-15 seconds"}
          </p>
        </div>
      )}

      {err && !busy && (
        <div className="rounded-xl border border-bad/40 bg-bad/[0.06] p-3.5 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-bad/95 mt-0.5 flex-none" />
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-[12px] text-bad/95 leading-relaxed break-words">
              {err === "no-api-key"
                ? lang === "th"
                  ? "การจัดลำดับประเด็นยังไม่พร้อมใช้งาน"
                  : "Consult-priority review is not available right now"
                : err}
            </p>
            {hasKey && (
              <button
                type="button"
                onClick={() => void fetchRecs(true)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#241f1a]/10 bg-white/50 px-4 py-2 text-[11px] font-medium text-[#241f1a] backdrop-blur-md transition hover:bg-white/70 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/30"
              >
                <RefreshCw className="h-3 w-3" />
                {lang === "th" ? "ลองใหม่" : "Retry"}
              </button>
            )}
          </div>
        </div>
      )}

      {result && !busy && (
        <>
          {result.items.length === 0 ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void fetchRecs(true)}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#241f1a]/10 bg-white/50 px-4 py-2 text-xs font-medium text-[#6f625a] backdrop-blur-md transition hover:border-[#241f1a]/20 hover:bg-white/70 hover:text-[#241f1a] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/30"
              >
                <RefreshCw className="h-3 w-3" />
                {lang === "th" ? "ประเมินใหม่" : "Re-analyze"}
              </button>
            </div>
          ) : (
            <>
          <ul className="space-y-2.5">
            {result.items.map((it, i) => {
              const def = PROCEDURES.find((p) => p.key === it.key);
              if (!def) return null;
              const checked = selected.has(it.key);
              const badge = impactBadge(it.impact, lang);
              const layerBadge = anatomyLayerBadge(it.anatomy_layer, lang);
              return (
                <li key={it.key}>
                  <button
                    type="button"
                    onClick={() => toggle(it.key)}
                    aria-pressed={checked}
                    className={`group relative w-full overflow-hidden rounded-2xl border p-3.5 pl-4 text-left transition-transform duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/30 ${
                      checked
                        ? "border-[#067e96]/45 bg-[#eef8f8]/70 shadow-[0_18px_44px_-34px_rgba(6,126,150,0.35)] backdrop-blur-md"
                        : "border-[#241f1a]/10 bg-white/45 backdrop-blur-md hover:border-[#241f1a]/20 hover:bg-white/60"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`absolute left-0 top-0 bottom-0 w-[3px] transition-opacity duration-200 ${
                        checked
                          ? "bg-[#067e96] opacity-100"
                          : "opacity-0"
                      }`}
                    />
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full border text-[13px] font-semibold leading-none transition ${
                          checked
                            ? "border-[#067e96]/35 bg-white/65 text-[#067e96] backdrop-blur-md"
                            : "border-[#241f1a]/10 bg-white/50 text-[#6f625a] backdrop-blur-md"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="min-w-0 break-words text-sm font-semibold tracking-tight text-[#241f1a]">
                            {lang === "th" ? def.label_th : def.label_en}
                          </p>
                          <span className="inline-flex items-center rounded-full border border-[#241f1a]/10 bg-white/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#241f1a] backdrop-blur-md">
                            {lang === "th"
                              ? `P${it.priority}${it.priority === 1 ? " จุดหลัก" : ""}`
                              : `P${it.priority}${it.priority === 1 ? " main" : ""}`}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] ${badge.className}`}
                          >
                            <span
                              aria-hidden
                              className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`}
                            />
                            {badge.label}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] ${layerBadge.className}`}
                          >
                            {layerBadge.label}
                          </span>
                        </div>
                        <p className="text-[13px] font-medium leading-relaxed text-[#403932]">
                          {lang === "th" ? it.reason_th : it.reason_en}
                        </p>
                        <div className="grid grid-cols-1 gap-1.5 rounded-xl border border-[#241f1a]/10 bg-white/60 p-2.5 text-[10px] leading-relaxed text-[#6f625a] backdrop-blur-md sm:grid-cols-2">
                          <DetailLine
                            label={lang === "th" ? "เห็นจากรูป" : "Visible cue"}
                            value={lang === "th" ? it.visible_cue_th : it.visible_cue_en}
                          />
                          <DetailLine
                            label={lang === "th" ? "เหตุผลที่เลือก" : "Why this"}
                            value={
                              lang === "th"
                                ? it.why_this_key_th
                                : it.why_this_key_en
                            }
                          />
                          <DetailLine
                            label={lang === "th" ? "ไม่เลือกอย่างอื่นเพราะ" : "Why not others"}
                            value={
                              lang === "th"
                                ? it.why_not_other_keys_th
                                : it.why_not_other_keys_en
                            }
                          />
                          <DetailLine
                            label={lang === "th" ? "ภาพอ้างอิงควรสื่อ" : "Reference should show"}
                            value={
                              lang === "th"
                                ? it.expected_change_th
                                : it.expected_change_en
                            }
                          />
                        </div>
                        <p className="text-[10px] leading-relaxed text-[#8d8378]">
                          {lang === "th" ? def.hint_th : def.hint_en}
                        </p>
                      </div>
                      <span className="flex-none mt-0.5">
                        {checked ? (
                          <CheckCircle2 className="h-5 w-5 text-[#067e96]" />
                        ) : (
                          <Circle className="h-5 w-5 text-[#b8afa6] transition-colors group-hover:text-[#6f625a]" />
                        )}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected.size > 0 && (
            <div className="space-y-3 rounded-2xl border border-[#241f1a]/10 bg-white/50 p-3.5 shadow-[0_16px_50px_-40px_rgba(36,31,26,0.3)] backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#241f1a] px-2 text-[13px] font-semibold text-white">
                  {selected.size}
                </span>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#6f625a]">
                  {lang === "th" ? "รายการที่เลือก" : "selected item"}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3">
                {(summary.costMin > 0 || summary.costMax > 0) && (
                  <SummaryStat
                    icon={<Wallet className="h-3.5 w-3.5 text-good/85" />}
                    label={lang === "th" ? "งบประมาณรวม" : "Total budget"}
                    value={`${formatBaht(summary.costMin)} - ${formatBaht(summary.costMax)} ${
                      lang === "th" ? "บาท" : "THB"
                    }${summary.costPartial ? "*" : ""}`}
                  />
                )}
                {longestDowntimeLabel && (
                  <SummaryStat
                    icon={<Clock className="h-3.5 w-3.5 text-[#067e96]" />}
                    label={lang === "th" ? "พักฟื้นนานสุด" : "Longest recovery"}
                    value={longestDowntimeLabel.downtime}
                    hint={longestDowntimeLabel.label}
                  />
                )}
                <SummaryStat
                  icon={<Layers className="h-3.5 w-3.5 text-[#7a5bd6]" />}
                  label={lang === "th" ? "ประเภทที่เลือก" : "Procedure type"}
                  value={[
                    summary.surgicalCount > 0
                      ? `${summary.surgicalCount} ${lang === "th" ? "ผ่าตัด" : "surgical"}`
                      : null,
                    summary.injectableCount > 0
                      ? `${summary.injectableCount} ${lang === "th" ? "ฉีด" : "injectable"}`
                      : null,
                    summary.nonInvasiveCount > 0
                      ? `${summary.nonInvasiveCount} ${lang === "th" ? "ไม่ผ่าตัด" : "non-invasive"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" / ")}
                />
              </div>
              {summary.costPartial && (
                <p className="text-[9px] italic text-[#8d8378]">
                  {lang === "th"
                    ? "* บางรายการยังไม่มีช่วงราคาที่แน่นอน ยอดนี้รวมเฉพาะรายการที่คำนวณได้"
                    : "* Some items do not have a defined price range. Total covers priced items only."}
                </p>
              )}
            </div>
          )}

          <div className="flex min-w-0 flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void fetchRecs(true)}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#241f1a]/10 bg-white/50 px-4 py-2 text-xs font-medium text-[#6f625a] backdrop-blur-md transition hover:border-[#241f1a]/20 hover:bg-white/70 hover:text-[#241f1a] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/30"
            >
              <RefreshCw className="h-3 w-3" />
              {lang === "th" ? "ประเมินใหม่" : "Re-analyze"}
            </button>
            <div className="hidden flex-1 sm:block" />
            <button
              type="button"
              onClick={simulateSelected}
              disabled={selected.size === 0}
              className="inline-flex min-h-[44px] max-w-full items-center justify-center gap-1.5 rounded-lg bg-[#241f1a] px-4 py-1.5 text-xs font-medium text-white shadow-[0_16px_34px_-24px_rgba(36,31,26,0.55)] transition hover:bg-[#342d27] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35 max-sm:flex-1"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {lang === "th" ? "สร้าง 4 แบบ" : "Generate 4 options"}
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px]">
                {lang === "th" ? "1 เครดิต" : "1 credit"}
              </span>
            </button>
          </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8d8378]">
        {label}
      </p>
      <p className="mt-0.5 break-words text-[#403932]">{value}</p>
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 space-y-1 rounded-xl border border-[#241f1a]/10 bg-white/50 px-3 py-2.5 backdrop-blur-md">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-[#8d8378]">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="break-words text-[12px] font-semibold leading-snug tabular-nums text-[#241f1a]">
        {value}
      </p>
      {hint && (
        <p className="truncate text-[10px] italic text-[#8d8378]">
          {hint}
        </p>
      )}
    </div>
  );
}
