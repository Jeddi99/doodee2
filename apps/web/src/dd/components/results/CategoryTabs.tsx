"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  memo,
  startTransition,
} from "react";
import dynamic from "next/dynamic";
import { ArrowUpRight, ArrowDownRight, Wrench } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard } from "./MetricCard";
// Phase 192g — lazy-mount the metric detail dialog. It only opens when
// the user taps a score tile, and its heavy children (ZoomedFace,
// ScoreBar, BellCurve) shouldn't be in the initial bundle.
const MetricDetailDialog = dynamic(
  () =>
    import("./MetricDetailDialog").then((m) => ({
      default: m.MetricDetailDialog,
    })),
  { ssr: false, loading: () => <MetricDetailDialogLoading /> },
);
import { RadarChart } from "./RadarChart";
import { ScoreBar } from "./ScoreBar";
import type { ScanResult } from "@/lib/scoring";
import { METRIC_CATEGORY, type Category } from "@/lib/scoring";
import { useT } from "@/lib/i18n";
import type { MetricKey, MetricResult, ScanPhoto } from "@/types";

interface CategoryTabsProps {
  result: ScanResult;
  scan: { front: ScanPhoto; side?: ScanPhoto };
}

type MetricEntry = readonly [MetricKey, MetricResult];

function topN(
  entries: ReadonlyArray<MetricEntry>,
  n: number,
  ascending = false,
): MetricEntry[] {
  return [...entries]
    .filter(([, r]) => {
      if (r.flagged) return false;
      // Phase 99: drop low-confidence metrics from worst/best/plan
      // rankings. A metric scoring 0/10 because its underlying landmarks
      // are unreliable on this particular photo isn't an actionable
      // recommendation ("improve your gonial-angle" when the gonion was
      // detected on the user's collar isn't useful). Threshold 0.6 keeps
      // the bar mid-tier — borderline-pose scans still surface most
      // metrics; truly noisy scans drop them.
      if (typeof r.confidence === "number" && r.confidence < 0.6) return false;
      return true;
    })
    .sort(([, a], [, b]) => (ascending ? a.score - b.score : b.score - a.score))
    .slice(0, n);
}

function MetricDetailDialogLoading() {
  const { t } = useT();
  return (
    <div
      role="status"
      aria-label={t.result.metricDetail}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#241f1a]/45 p-4"
    >
      <div className="w-full max-w-lg rounded-3xl border border-[#241f1a]/10 bg-white/60 p-5 shadow-[0_24px_80px_-48px_rgba(36,31,26,0.55)] backdrop-blur-md">
        <div className="space-y-3">
          <div className="h-5 w-40 animate-pulse rounded-full bg-[#e7dfd2]" />
          <div className="h-3 w-full animate-pulse rounded-full bg-[#efe8dc]" />
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-[#efe8dc]" />
        </div>
        <div className="mt-5 h-48 animate-pulse rounded-2xl border border-[#241f1a]/10 bg-white/40 backdrop-blur-md" />
      </div>
    </div>
  );
}

export const CategoryTabs = memo(function CategoryTabs({
  result,
  scan,
}: CategoryTabsProps) {
  const { t } = useT();
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);
  const openMetricDetail = useCallback((key: MetricKey) => {
    startTransition(() => setOpenMetric(key));
  }, []);
  const closeMetricDetail = useCallback((open: boolean) => {
    if (open) return;
    startTransition(() => setOpenMetric(null));
  }, []);

  // Phase 192h — memoize the entries/categories/strengths/improvements
  // derivations. Each topN() call clones the entries array and runs a
  // filter+sort; with 5 categories and overview+plan tabs that was
  // ~10 unmemoized sorts per parent render. Gate them on result.metrics
  // so they only recompute when the underlying scan actually changes.
  const allEntries = useMemo<MetricEntry[]>(() => {
    const out: MetricEntry[] = [];
    for (const k of Object.keys(result.metrics) as MetricKey[]) {
      const r = result.metrics[k];
      if (r) out.push([k, r]);
    }
    return out;
  }, [result.metrics]);

  const activeCategories = useMemo(
    () => Array.from(new Set(allEntries.map(([k]) => METRIC_CATEGORY[k]))),
    [allEntries],
  );

  const openResult = openMetric ? result.metrics[openMetric] : undefined;

  const strengths = useMemo(() => topN(allEntries, 3), [allEntries]);
  const improvements = useMemo(() => {
    const strengthKeys = new Set(strengths.map(([k]) => k));
    return topN(allEntries, 3, true).filter(([k]) => !strengthKeys.has(k));
  }, [allEntries, strengths]);

  // Phase 192h — entriesIn is called once per active category during
  // render; memoize the lookup so the per-category filter doesn't re-run
  // when an unrelated piece of state (e.g. openMetric) changes.
  const entriesByCategory = useMemo(() => {
    const map = new Map<Category, MetricEntry[]>();
    for (const entry of allEntries) {
      const cat = METRIC_CATEGORY[entry[0]];
      const bucket = map.get(cat);
      if (bucket) bucket.push(entry);
      else map.set(cat, [entry]);
    }
    return map;
  }, [allEntries]);
  const entriesIn = useCallback(
    (cat: Category): MetricEntry[] => entriesByCategory.get(cat) ?? [],
    [entriesByCategory],
  );

  // Phase 192v (PERF): the per-category best/worst callouts used to call
  // topN() twice inside the category .map() on every render — the exact
  // unmemoized filter+sort the Phase 192h block was added to kill. With up
  // to 6 categories that was ~12 array clones+sorts per CategoryTabs render
  // (tab switch, dialog open, lang toggle). Precompute once, gated on the
  // memoized buckets so it only recomputes when the scan changes.
  const bestWorstByCategory = useMemo(() => {
    const map = new Map<
      Category,
      { best?: MetricEntry; worst?: MetricEntry }
    >();
    for (const [cat, bucket] of entriesByCategory) {
      const best = topN(bucket, 1)[0];
      const worst = topN(bucket, 1, true)[0];
      map.set(cat, { best, worst });
    }
    return map;
  }, [entriesByCategory]);

  // Phase 192h — prefetch the MetricDetailDialog chunk as soon as the
  // result is available. The dialog is dynamic()-loaded (~60KB), so
  // without this the first tile tap pays the cold module download at
  // click time. Best-effort: a failed prefetch just falls back to the
  // normal lazy load on tap (audit L7).
  useEffect(() => {
    if (!result) return;
    void import("./MetricDetailDialog").catch(() => {
      // best-effort — next tap pays the cost normally
    });
  }, [result]);

  return (
    <>
      <Tabs defaultValue="overview" className="doodee-readable-force min-w-0 w-full">
        <TabsList className="no-scrollbar w-full min-w-0 justify-start overflow-x-auto overscroll-x-contain">
          <TabsTrigger value="overview" className="shrink-0">
            {t.result.overview}
          </TabsTrigger>
          {activeCategories.map((cat) => (
            <TabsTrigger key={cat} value={cat} className="shrink-0">
              {t.category[cat]}
            </TabsTrigger>
          ))}
          <TabsTrigger value="__plan" className="shrink-0">
            {t.result.planTab}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-6">
            <section className="min-w-0 rounded-2xl border border-[#241f1a]/10 bg-white/50 p-5 text-[#241f1a] shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-xs font-medium uppercase tracking-widest text-[#5b5148]">
                  {t.result.radarLabel}
                </h3>
              </div>
              <RadarChart categoryScores={result.categories} />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {activeCategories.map((cat) => {
                  const avg = result.categories[cat];
                  if (avg === undefined) return null;
                  return (
                    <div
                      key={cat}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#241f1a]/10 bg-white/40 px-3 py-2 backdrop-blur-md"
                    >
                      <span className="min-w-0 text-xs font-medium leading-snug text-[#4f4740]">
                        {t.category[cat]}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-[#241f1a]">
                        {avg.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <CalloutList
                label={t.result.yourStrengths}
                iconUp
                items={strengths}
              />
              <CalloutList
                label={t.result.improvementAreas}
                items={improvements}
              />
            </div>

            <div className="space-y-2">
              {activeCategories.map((cat) => {
                const avg = result.categories[cat];
                if (avg === undefined) return null;
                return (
                  <div
                    key={cat}
                    className="space-y-2 rounded-2xl border border-[#241f1a]/10 bg-white/50 p-4 text-[#241f1a] shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] backdrop-blur-md"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">{t.category[cat]}</span>
                      <span className="font-semibold tabular-nums">
                        {avg.toFixed(1)} / 10.0
                      </span>
                    </div>
                    <ScoreBar
                      score={avg}
                      ariaLabel={`${t.category[cat]} ${avg.toFixed(1)} / 10`}
                    />
                  </div>
                );
              })}
            </div>

            <p className="pt-2 text-center text-xs text-[#5b5148]">
              {t.result.hint}
            </p>
          </div>
        </TabsContent>

        {activeCategories.map((cat) => {
          const entries = entriesIn(cat);
          const avg = result.categories[cat];
          const { best, worst } = bestWorstByCategory.get(cat) ?? {};
          const showWorst = worst && (!best || worst[0] !== best[0]);
          return (
            <TabsContent key={cat} value={cat}>
              <div className="space-y-4">
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed text-[#5b5148]">
                    {t.categoryDescription[cat]}
                  </p>
                  {avg !== undefined && (
                    <div className="space-y-2 rounded-2xl border border-[#241f1a]/10 bg-white/50 p-4 text-[#241f1a] shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] backdrop-blur-md">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium uppercase tracking-widest text-[#5b5148]">
                          {t.result.categoryAverage}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {avg.toFixed(1)} / 10.0
                        </span>
                      </div>
                      <ScoreBar
                        score={avg}
                        ariaLabel={`${t.category[cat]} ${avg.toFixed(1)} / 10`}
                      />
                    </div>
                  )}
                </div>

                {(best || showWorst) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {best && (
                      <MetricCallout
                        label={t.result.bestMetric}
                        metricKey={best[0]}
                        result={best[1]}
                        positive
                      />
                    )}
                    {showWorst && worst && (
                      <MetricCallout
                        label={t.result.worstMetric}
                        metricKey={worst[0]}
                        result={worst[1]}
                      />
                    )}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {entries.map(([k, r]) => (
                    <MetricCard
                      key={k}
                      metricKey={k}
                      result={r}
                      onSelect={openMetricDetail}
                    />
                  ))}
                </div>
              </div>
            </TabsContent>
          );
        })}

        <TabsContent value="__plan">
          <PlanTab entries={allEntries} onSelect={openMetricDetail} />
        </TabsContent>
      </Tabs>

      {openMetric && openResult && (
        <MetricDetailDialog
          open
          onOpenChange={closeMetricDetail}
          metricKey={openMetric}
          result={openResult}
          scan={scan}
        />
      )}
    </>
  );
});

function CalloutList({
  label,
  items,
  iconUp,
}: {
  label: string;
  items: ReadonlyArray<MetricEntry>;
  iconUp?: boolean;
}) {
  const { t } = useT();
  const Icon = iconUp ? ArrowUpRight : ArrowDownRight;
  const tone = iconUp ? "text-[#047857]" : "text-[#9a5a00]";
  return (
    <div className="min-w-0 space-y-3 rounded-2xl border border-[#241f1a]/10 bg-white/50 p-4 text-[#241f1a] shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] backdrop-blur-md">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone}`} />
        <h4 className="text-xs font-medium uppercase tracking-widest text-[#5b5148]">
          {label}
        </h4>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#241f1a]/10 bg-white/35 px-3 py-4 text-center text-xs text-[#5b5148] backdrop-blur-md">
          {t.result.planEmpty}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map(([k, r]) => (
            <li
              key={k}
              className="flex min-w-0 items-start justify-between gap-3 text-sm"
            >
              <span className="min-w-0 leading-snug">{t.metric[k]}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-[#241f1a]">
                {r.score.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MetricCallout({
  label,
  metricKey,
  result,
  positive,
}: {
  label: string;
  metricKey: MetricKey;
  result: MetricResult;
  positive?: boolean;
}) {
  const { t } = useT();
  const tone = positive
    ? "border-[#9ad9c1] bg-[#ecfdf6]"
    : "border-[#f3cd86] bg-[#fff7e8]";
  return (
    <div className={`min-w-0 space-y-1 rounded-xl border p-3 text-[#241f1a] ${tone}`}>
      <p className="text-[10px] font-medium uppercase tracking-widest text-[#5b5148]">
        {label}
      </p>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0 text-sm font-medium leading-snug">
          {t.metric[metricKey]}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {result.score.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function PlanTab({
  entries,
  onSelect,
}: {
  entries: ReadonlyArray<MetricEntry>;
  onSelect: (k: MetricKey) => void;
}) {
  const { t } = useT();
  const lowest = useMemo(() => topN(entries, 5, true), [entries]);
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-[#9a5a00]" />
          <h3 className="text-base font-medium text-[#241f1a]">
            {t.result.planHeading}
          </h3>
        </div>
        <p className="text-sm leading-relaxed text-[#5b5148]">
          {t.result.planSubtitle}
        </p>
      </header>

      {lowest.length === 0 ? (
        <div className="rounded-xl border border-[#241f1a]/10 bg-white/50 p-6 text-center text-sm text-[#5b5148] backdrop-blur-md">
          {t.result.planEmpty}
        </div>
      ) : (
        <ol className="space-y-3">
          {lowest.map(([k, r], idx) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => onSelect(k)}
                className="block w-full space-y-3 rounded-2xl border border-[#241f1a]/10 bg-white/50 p-4 text-left text-[#241f1a] shadow-[0_18px_46px_-38px_rgba(36,31,26,0.32)] backdrop-blur-md transition-colors hover:border-[#3f6268]/25 hover:bg-white/68 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f6268]/30"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                    <span className="text-xs text-[#6f625a] tabular-nums">
                      #{idx + 1}
                    </span>
                    <span className="min-w-0 text-sm font-medium leading-snug">
                      {t.metric[k]}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {r.score.toFixed(1)} / 10
                  </span>
                </div>
                <ScoreBar
                  score={r.score}
                  ariaLabel={`${t.metric[k]} ${r.score.toFixed(1)} / 10`}
                />
                <p className="text-xs leading-relaxed text-[#5b5148]">
                  {t.metricTip[k]}
                </p>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
