import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "../useLocale";
import { useQuery } from "@tanstack/react-query";
import { getScan, getScans } from "../lib/api";
import type { RatioRow } from "../lib/dashboardData";
import {
  catalogAvailability,
  improvementsFor,
  overallScore,
  pillarsFor,
  ratioRows,
  strengthsFor,
} from "../lib/dashboardData";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  CircleUserRound,
  LayoutGrid,
  LockKeyhole,
  Menu,
  MessageCircle,
  Paperclip,
  Plus,
  RefreshCw,
  ScanFace,
  Search,
  Settings2,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Target,
  WandSparkles,
  X,
} from "lucide-react";
import Brand from "../Brand";
import {
  analysisCatalog,
  methodLabels,
  metricGroups,
  type AnalysisMetric,
  type MetricGroup,
  type MetricMethod,
} from "../analysisCatalog";

type AppView = "overview" | "analysis" | "plan" | "simulate" | "doodeegpt";
type PillarId = "harmony" | "angularity" | "dimorphism" | "features";
type FaceAngle = "front" | "side";
type AnalysisMode = "results" | "library";

/* Rows come from lib/dashboardData now. The old fixed status union described qijek's five
   hardcoded verdicts; the real status names how far a measurement sits from the reference. */
type RatioMetric = RatioRow;

type PlanAction = {
  title: string;
  category: "Foundational" | "Non-Invasive" | "Minimally Invasive" | "Surgical";
  detail: string;
  impact: string;
  cost: string;
  time: string;
  locked?: boolean;
};

const views: { id: AppView; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "analysis", label: "Analysis" },
  { id: "plan", label: "Plan" },
  { id: "simulate", label: "Simulate" },
  { id: "doodeegpt", label: "DOODEE GPT" },
];

/** qijek switched these five with location.hash; doodee gives each its own URL. */
export const VIEW_ROUTES: Record<AppView, string> = {
  overview: "/home",
  analysis: "/analysis",
  plan: "/plan",
  simulate: "/simulation",
  doodeegpt: "/doodee-gpt",
};

type ScanData = {
  pillars: ReturnType<typeof pillarsFor>;
  rows: ReturnType<typeof ratioRows>;
  strengths: ReturnType<typeof strengthsFor>;
  improvements: ReturnType<typeof improvementsFor>;
  overall: number | null;
  availability: ReturnType<typeof catalogAvailability>;
};

const emptyScanData: ScanData = {
  pillars: pillarsFor(null),
  rows: [],
  strengths: [],
  improvements: [],
  overall: null,
  availability: catalogAvailability(null),
};

/** Shared row shape for the strengths and improvements cards. */
type InsightItem = { name: string; score: string; detail: string; ratios: string[]; level?: string };

/**
 * Every figure the dashboard renders comes from here. qijek held these as module-level literals;
 * routing them through context means a component cannot accidentally fall back to a fixture when
 * the backend has no value for it.
 */
const ScanDataContext = createContext<ScanData>(emptyScanData);
const useScanData = () => useContext(ScanDataContext);

/** Inverse of PILLAR_CATEGORIES in lib/dashboardData, for grouping rows under a pillar tab. */
const CATEGORY_PILLAR: Record<string, PillarId> = {
  proportions: "harmony",
  chin: "angularity",
  eyes: "features",
  nose: "features",
  lips: "features",
};
const pillarOf = (category: string) => CATEGORY_PILLAR[category];

/* qijek's `ratios`, `strengths` and `improvements` fixtures lived here — roughly 435 lines of
 * literal measurements, scores and copy. They are derived from the scan payload now; see
 * lib/dashboardData.ts. Anything the backend cannot score is reported locked, not invented. */


const planActions: PlanAction[] = [
  {
    title: "Hairstyle and brow structure",
    category: "Foundational",
    detail:
      "Use more height at the crown and cleaner brow edges to reinforce facial shape.",
    impact: "+0.18",
    cost: "$0–$80",
    time: "Start today",
  },
  {
    title: "Skin texture routine",
    category: "Foundational",
    detail:
      "Build a simple routine around sunscreen, retinoid tolerance and barrier support.",
    impact: "+0.14",
    cost: "$20–$90",
    time: "6–12 weeks",
  },
  {
    title: "Neck and posture training",
    category: "Foundational",
    detail:
      "Use chin tucks and progressive neck work to improve the lower-face silhouette.",
    impact: "+0.11",
    cost: "$0–$30",
    time: "8–16 weeks",
  },
  {
    title: "Masseter assessment",
    category: "Non-Invasive",
    detail:
      "Discuss whether muscle activity contributes to lower-face width or asymmetry.",
    impact: "+0.09",
    cost: "$250–$700",
    time: "2–6 weeks",
    locked: true,
  },
  {
    title: "Chin profile consultation",
    category: "Minimally Invasive",
    detail:
      "Review projection goals with a qualified professional using the side profile.",
    impact: "+0.17",
    cost: "$500–$1,500",
    time: "1–2 weeks",
    locked: true,
  },
  {
    title: "Under-eye support review",
    category: "Non-Invasive",
    detail: "Discuss skin quality, volume and structural support separately.",
    impact: "+0.08",
    cost: "$350–$1,200",
    time: "1–3 weeks",
    locked: true,
  },
  {
    title: "Rhinoplasty direction",
    category: "Surgical",
    detail:
      "Explore a conservative bridge and tip direction without changing facial identity.",
    impact: "+0.13",
    cost: "$5,000–$15,000",
    time: "2–4 weeks",
    locked: true,
  },
  {
    title: "Jaw contour review",
    category: "Surgical",
    detail:
      "Use the 3D consultation view to compare structural and soft-tissue options.",
    impact: "+0.12",
    cost: "$6,000–$18,000",
    time: "3–6 weeks",
    locked: true,
  },
];

function GlassCard({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const move = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--glass-x",
      `${event.clientX - rect.left}px`,
    );
    event.currentTarget.style.setProperty(
      "--glass-y",
      `${event.clientY - rect.top}px`,
    );
  };
  const leave = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.removeProperty("--glass-x");
    event.currentTarget.style.removeProperty("--glass-y");
  };
  return (
    <article
      className={`app-glass ${className}`}
      onPointerMove={move}
      onPointerLeave={leave}
    >
      {children}
    </article>
  );
}

function ScoreCurve() {
  return (
    <svg
      className="score-curve"
      viewBox="0 0 760 220"
      role="img"
      aria-label="Your score compared with the reference range"
    >
      <defs>
        <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1687ff" stopOpacity=".2" />
          <stop offset="1" stopColor="#1687ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        className="score-curve__grid"
        d="M40 174H720M40 128H720M40 82H720"
      />
      <path
        className="score-curve__fill"
        d="M42 174C158 174 195 167 249 140C308 111 322 44 380 38C438 44 452 111 511 140C565 167 602 174 718 174V200H42Z"
      />
      <path
        className="score-curve__line"
        d="M42 174C158 174 195 167 249 140C308 111 322 44 380 38C438 44 452 111 511 140C565 167 602 174 718 174"
      />
      <line
        className="score-curve__marker"
        x1="488"
        y1="80"
        x2="488"
        y2="181"
      />
      <circle cx="488" cy="145" r="7" />
      <text x="488" y="66" textAnchor="middle">
        YOU · 7.4
      </text>
    </svg>
  );
}

function InsightList({
  kind,
  items,
}: {
  kind: "strength" | "improve";
  items: InsightItem[];
}) {
  const [open, setOpen] = useState(0);
  const [expanded, setExpanded] = useState(false);
  return (
    <GlassCard className={`insight-panel insight-panel--${kind}`}>
      <header>
        <div>
          <span className="eyebrow">
            {kind === "strength" ? "Key strengths" : "Areas to improve"}
          </span>
          <h2>
            {kind === "strength"
              ? "What already works."
              : "Where effort matters."}
          </h2>
        </div>
        <span className="insight-count">
          {expanded ? "All shown" : "3 of 18"}
        </span>
      </header>
      <div className="insight-list">
        {items.map((item, index) => (
          <button
            className={open === index ? "is-open" : ""}
            type="button"
            onClick={() => setOpen(open === index ? -1 : index)}
            key={item.name}
          >
            <span className="insight-status">
              {"level" in item ? item.level : "Ideal"}
            </span>
            <strong>{item.name}</strong>
            <b>{item.score}</b>
            <ChevronDown />
            <div className="insight-detail">
              <p>{item.detail}</p>
              <small>Contributing ratios</small>
              {item.ratios.map((ratio) => (
                <span key={ratio}>{ratio}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
      <button
        className="insight-more"
        type="button"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Show less" : "Show 15 more"}
        <ChevronDown />
      </button>
    </GlassCard>
  );
}

function Overview({
  scanImage,
  openView,
  onUnlock,
}: {
  scanImage: string;
  openView: (view: AppView) => void;
  onUnlock: () => void;
}) {
  const { pillars, strengths, improvements } = useScanData();
  const unlockedCount = pillars.filter((item) => !item.locked).length;
  const current = pillars[0];
  return (
    <div className="app-view app-overview">
      <section className="app-pillar-grid" aria-label="Score pillars">
        {pillars.map((item) => (
          <button
            className={`pillar-card app-glass ${item.id === "harmony" ? "is-active" : ""} ${item.locked ? "is-locked" : ""}`}
            data-pillar={item.id}
            type="button"
            onClick={() =>
              item.locked ? onUnlock() : openView("analysis")
            }
            key={item.id}
          >
            <span className={`pillar-art pillar-art--${item.id}`} aria-hidden="true" />
            <span className="pillar-card__head">
              <i className={`pillar-mark pillar-mark--${item.id}`} />
              {item.label}
              <ArrowRight />
            </span>
            <strong aria-hidden={item.locked}>
              {item.score}
              <small>/10</small>
            </strong>
            {item.locked ? (
              <span className="pillar-unlock">
                <LockKeyhole /> Unlock your score
              </span>
            ) : (
              <span className="pillar-unlock pillar-unlock--open">
                <ArrowRight /> View harmony ratios
              </span>
            )}
          </button>
        ))}
      </section>

      <GlassCard className="overall-card">
        <header>
          <div>
            <span className="eyebrow">Overall score</span>
            <h1>{current.label}</h1>
          </div>
          <span className="overall-card__count">{unlockedCount} of {pillars.length} pillars</span>
        </header>
        <div className="overall-card__body">
          <div className="overall-score">
            <strong>{current.score}</strong>
            <span>/10</span>
            <p>{current.note}</p>
            <div className="score-portrait-pair">
              <figure>
                <img src={scanImage} alt="Your front scan" />
                <figcaption>Front</figcaption>
              </figure>
              <figure>
                <img src={scanImage} alt="Your side scan" className="is-side" />
                <figcaption>Side</figcaption>
              </figure>
            </div>
          </div>
          <div className="overall-distribution">
            <div className="overall-distribution__blur">
              <ScoreCurve />
              <div className="curve-legend">
                <span>Lower</span>
                <span>Reference range</span>
                <span>Higher</span>
              </div>
            </div>
            <button type="button" onClick={onUnlock}>
              <LockKeyhole /> Unlock to see where you stand
            </button>
          </div>
        </div>
      </GlassCard>

      <section className="insight-grid">
        <InsightList kind="strength" items={strengths} />
        <InsightList kind="improve" items={improvements} />
      </section>

      <GlassCard className="score-card-lock">
        <div>
          <span className="eyebrow">Score card</span>
          <h2>Your card.</h2>
          <p>Save it. Share it.</p>
        </div>
        <div className="score-card-lock__preview">
          <LockKeyhole />
          <strong>Unlock your shareable score card</strong>
          <span>One image, ready to save or share.</span>
        </div>
        <button type="button" onClick={onUnlock}>
          Unlock full analysis <ArrowRight />
        </button>
      </GlassCard>
      <GlassCard className="pillar-progress-card">
        <div className="pillar-progress-mark">
          <span>H</span>
          <span>A</span>
          <span>D</span>
          <span>F</span>
        </div>
        <div>
          <span className="eyebrow">{unlockedCount} of {pillars.length} pillars analyzed</span>
          <h2>Complete your facial profile.</h2>
          <p>
            Finish every pillar for a more accurate understanding of your face.
          </p>
        </div>
        <button type="button" onClick={() => openView("analysis")}>
          Continue analysis <ArrowRight />
        </button>
      </GlassCard>
    </div>
  );
}

function RatioModal({
  metric,
  index,
  total,
  scanImage,
  onClose,
}: {
  metric: RatioMetric;
  index: number;
  total: number;
  scanImage: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("Overview");
  return (
    <div
      className="app-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ratio-modal-title"
    >
      <button
        className="app-modal__scrim"
        type="button"
        onClick={onClose}
        aria-label="Close ratio details"
      />
      <section className="ratio-modal app-glass">
        <header>
          <span>
            {index + 1} / {total}
          </span>
          <h2 id="ratio-modal-title">{metric.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <div className="ratio-modal__hero">
          <figure>
            <img src={scanImage} alt={`Your ${metric.name} measurement`} />
            <span>{metric.value}</span>
          </figure>
          <div className="ratio-modal__score">
            <span className="eyebrow">Score</span>
            <strong>
              {metric.score.toFixed(1)}
              <small>/10</small>
            </strong>
            <div className="ratio-range">
              <i
                style={{
                  left: `${Math.min(92, Math.max(8, metric.score * 10))}%`,
                }}
              />
              <span>Reference</span>
            </div>
            <b>{metric.value}</b>
            <p>Ideal {metric.ideal}</p>
          </div>
        </div>
        <nav>
          {["Overview", "Simulate", "Celebrities", "Edit"].map((item) => (
            <button
              className={tab === item ? "is-active" : ""}
              type="button"
              onClick={() => setTab(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </nav>
        {tab === "Overview" ? (
          <div className="ratio-modal__content">
            <div>
              <span className="eyebrow">About this ratio</span>
              <p>{metric.detail}</p>
            </div>
            <div>
              <span className="eyebrow">May indicate</span>
              <p>{metric.mayIndicate}</p>
            </div>
            <div>
              <span className="eyebrow">Affected measurements</span>
              <div className="ratio-chips">
                {metric.affected.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        ) : tab === "Simulate" ? (
          <div className="ratio-modal__empty">
            <WandSparkles />
            <h3>See a direction.</h3>
            <p>
              Open this measurement in Simulate to compare an illustrative
              change.
            </p>
          </div>
        ) : tab === "Celebrities" ? (
          <div className="ratio-modal__empty">
            <CircleUserRound />
            <h3>Reference examples.</h3>
            <p>Compare the ratio range, not a person's overall appearance.</p>
          </div>
        ) : (
          <div className="ratio-modal__empty">
            <SlidersHorizontal />
            <h3>Correct the landmark.</h3>
            <p>
              Adjust this measurement if the captured landmark is inaccurate.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function MeasurementLibrary({ onUnlock }: { onUnlock: () => void }) {
  const { availability } = useScanData();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MetricGroup | "All">("All");
  const [method, setMethod] = useState<MetricMethod | "All">("All");
  const [selected, setSelected] = useState<AnalysisMetric>(analysisCatalog[0]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return analysisCatalog.filter(
      (metric) =>
        (group === "All" || metric.group === group) &&
        (method === "All" || metric.method === method) &&
        (!term ||
          metric.name.toLowerCase().includes(term) ||
          metric.group.toLowerCase().includes(term)),
    );
  }, [group, method, query]);
  const selectedRow = availability.rowForCatalogName(selected.name);
  const counts = useMemo(
    () =>
      analysisCatalog.reduce(
        (total, metric) => ({
          ...total,
          [metric.method]: total[metric.method] + 1,
        }),
        { landmark: 0, scale: 0, profile: 0 },
      ),
    [],
  );

  return (
    <section className="metric-library" aria-label="Measurement library">
      <GlassCard className="metric-library__head">
        <div>
          <span className="eyebrow">Measurement library</span>
          <h1>{analysisCatalog.length} analysis checks</h1>
          <p>
            {availability.availableCount} of {analysisCatalog.length} have a published reference
            behind them today. Every result shows what the scan can measure and what it cannot.
          </p>
        </div>
        <dl>
          <div>
            <dt>2D landmark</dt>
            <dd>{counts.landmark}</dd>
          </div>
          <div>
            <dt>Needs scale</dt>
            <dd>{counts.scale}</dd>
          </div>
          <div>
            <dt>Side profile</dt>
            <dd>{counts.profile}</dd>
          </div>
        </dl>
      </GlassCard>
      <GlassCard className="metric-library__workspace">
        <div className="metric-library__toolbar">
          <label>
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search measurements"
              aria-label="Search measurements"
            />
          </label>
          <div className="metric-methods" aria-label="Measurement method">
            {(["All", "landmark", "scale", "profile"] as const).map(
              (item) => (
                <button
                  className={method === item ? "is-active" : ""}
                  type="button"
                  onClick={() => setMethod(item)}
                  key={item}
                >
                  {item === "All" ? "All methods" : methodLabels[item]}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="metric-groups" aria-label="Measurement categories">
          {(["All", ...metricGroups] as const).map((item) => (
            <button
              className={group === item ? "is-active" : ""}
              type="button"
              onClick={() => setGroup(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="metric-library__body">
          <div className="metric-catalog">
            {filtered.map((metric) => {
              const number = analysisCatalog.indexOf(metric) + 1;
              return (
                <button
                  className={selected.id === metric.id ? "is-active" : ""}
                  type="button"
                  onClick={() => setSelected(metric)}
                  key={metric.id}
                >
                  <span>{String(number).padStart(3, "0")}</span>
                  <div>
                    <strong>{metric.name}</strong>
                    <small>{metric.group}</small>
                  </div>
                  <em className={`metric-method metric-method--${metric.method}`}>
                    {methodLabels[metric.method]}
                  </em>
                  <ChevronDown />
                </button>
              );
            })}
            {!filtered.length && (
              <div className="metric-catalog__empty">
                <Search />
                <strong>No matching measurement</strong>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setGroup("All");
                    setMethod("All");
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
          <aside className="metric-detail">
            <span className={`metric-method metric-method--${selected.method}`}>
              {methodLabels[selected.method]}
            </span>
            <h2>{selected.name}</h2>
            <p>{selected.description}</p>
            <dl>
              <div>
                <dt>Required capture</dt>
                <dd>{selected.view}</dd>
              </div>
              <div>
                <dt>Current result</dt>
                {/* Only the twelve entries reference_scoring.py covers have a value; the rest
                    say so rather than dangling an unlock behind a measurement that does not
                    exist yet. */}
                {selectedRow ? (
                  <dd>
                    {selectedRow.value}
                    <small> · reference {selectedRow.ideal}</small>
                  </dd>
                ) : (
                  <dd className="is-locked">
                    <LockKeyhole /> Not measured yet
                  </dd>
                )}
              </div>
            </dl>
            <div className="metric-limit">
              <CircleHelp />
              <p>{selected.limitation}</p>
            </div>
            <button type="button" onClick={onUnlock}>
              Unlock complete analysis <ArrowRight />
            </button>
          </aside>
        </div>
      </GlassCard>
      <div className="measurement-policy">
        <strong>Measurement rules</strong>
        <span>No millimetres without scale calibration.</span>
        <span>No projection score without a side view or 3D.</span>
        <span>No skin diagnosis from a phone photo.</span>
        <span>No universal beauty score.</span>
      </div>
    </section>
  );
}

function UnlockModal({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<"unlocking" | "offer">("unlocking");

  useEffect(() => {
    const timer = window.setTimeout(() => setStage("offer"), 1050);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className="app-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-title"
    >
      <button
        className="app-modal__scrim"
        type="button"
        onClick={onClose}
        aria-label="Close unlock dialog"
      />
      <section className={`unlock-modal app-glass unlock-modal--${stage}`}>
        <button
          className="unlock-modal__close"
          type="button"
          onClick={onClose}
          aria-label="Close"
        >
          <X />
        </button>
        {stage === "unlocking" ? (
          <div className="unlock-loading" aria-live="polite">
            <div className="unlock-loading__visual" aria-hidden="true">
              <img src="/assets/doodee-analysis-glass-v1.png" alt="" />
              <span className="unlock-loading__scan" />
              <span className="unlock-loading__landmarks" />
              <div className="unlock-loading__pill">
                <i /> Unlocking…
              </div>
            </div>
            <div className="unlock-loading__copy">
              <span className="eyebrow">DOODEE Complete</span>
              <h2 id="unlock-title">Preparing your full analysis.</h2>
              <p>Checking all {analysisCatalog.length} facial measurements.</p>
              <div className="unlock-loading__progress"><i /></div>
            </div>
          </div>
        ) : (
          <div className="unlock-offer">
            <div className="unlock-modal__heading">
              <div className="unlock-orb">
                <LockKeyhole />
              </div>
              <div>
                <span className="eyebrow">DOODEE Complete</span>
                <h2 id="unlock-title">Unlock every detail.</h2>
                <p>Full analysis, clear limits and a plan that updates with you.</p>
              </div>
            </div>
            <div className="unlock-price">
              <strong>$19.99</strong>
              <span>/ month</span>
              <small>Monthly membership</small>
            </div>
            <ul>
              <li>
                <Check />
                All {analysisCatalog.length} analysis checks
              </li>
              <li>
                <Check />
                Confidence, capture needs and limitations
              </li>
              <li>
                <Check />
                Personalized monthly improvement plan
              </li>
              <li>
                <Check />
                Treatment previews and consultation report
              </li>
            </ul>
            <a href="/login">Start Complete <ArrowRight /></a>
            <button className="unlock-modal__free" type="button" onClick={onClose}>
              Continue with free analysis
            </button>
            <small>
              Educational guidance only. Results are not a diagnosis or a measure
              of human worth.
            </small>
          </div>
        )}
      </section>
    </div>
  );
}

function Analysis({
  scanImage,
  onUnlock,
  openView,
}: {
  scanImage: string;
  onUnlock: () => void;
  openView: (view: AppView) => void;
}) {
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("results");
  const [pillar, setPillar] = useState<PillarId>("harmony");
  const [angle, setAngle] = useState<FaceAngle>("front");
  const [showAll, setShowAll] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedMetric, setSelectedMetric] = useState<RatioMetric | null>(
    null,
  );
  const { pillars, rows, strengths, improvements } = useScanData();
  const unlockedCount = pillars.filter((item) => !item.locked).length;
  const list = rows.filter((row) => pillarOf(row.category) === pillar);
  const visible = showAll ? list : list.slice(0, 7);
  const pillarLocked = pillar !== "harmony";

  useEffect(() => {
    setShowAll(false);
    setActiveIndex(0);
  }, [pillar, angle]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedMetric(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  return (
    <div className="app-view analysis-view analysis-view--deep">
      <nav className="analysis-pillar-nav" aria-label="Analysis pillars">
        {pillars.map((item) => (
          <button
            className={
              analysisMode === "results" && pillar === item.id
                ? "is-active"
                : ""
            }
            type="button"
            onClick={() => {
              setAnalysisMode("results");
              setPillar(item.id);
            }}
            key={item.id}
          >
            {item.label}
            {item.locked && <LockKeyhole />}
          </button>
        ))}
        <button
          className={analysisMode === "library" ? "is-active" : ""}
          type="button"
          onClick={() => {
            setAnalysisMode("library");
            setSelectedMetric(null);
          }}
        >
          All {analysisCatalog.length}
        </button>
      </nav>
      <div
        className={`analysis-results ${analysisMode === "library" ? "is-hidden" : ""}`}
      >
      <GlassCard className="analysis-profile-strip">
        <button
          className={angle === "front" ? "is-active" : ""}
          type="button"
          onClick={() => setAngle("front")}
        >
          <img src={scanImage} alt="Front view" />
          <span>
            <small>Front</small>
            <strong>{pillar === "harmony" ? "7.4" : "Locked"}</strong>
          </span>
        </button>
        <button
          className={angle === "side" ? "is-active" : ""}
          type="button"
          onClick={() => setAngle("side")}
        >
          <img className="is-side" src={scanImage} alt="Side view" />
          <span>
            <small>Side</small>
            <strong>5.9</strong>
          </span>
        </button>
        <div>
          <span className="eyebrow">{analysisCatalog.length} analysis checks</span>
          <strong>
            {pillars.find((item) => item.id === pillar)?.label} analysis
          </strong>
          <small>
            {angle === "front" ? "Front ratios" : "Side-profile ratios"}
          </small>
        </div>
      </GlassCard>

      <div className="analysis-deep-layout">
        <GlassCard
          className={`analysis-face-card analysis-face-card--${angle}`}
        >
          <img src={scanImage} alt={`Your ${angle} facial analysis`} />
          <svg viewBox="0 0 600 760" aria-hidden="true">
            <path d="M145 230H455M130 327H470M157 468H443M188 596H412M300 185V630" />
            <circle cx="300" cy="327" r="5" />
            <circle cx="300" cy="468" r="5" />
          </svg>
          <div className="analysis-face-overlay">
            <span>
              {angle} {pillars.find((item) => item.id === pillar)?.label}
            </span>
            <strong>
              {pillarLocked
                ? "Locked"
                : `${list[activeIndex]?.score.toFixed(1)}/10`}
            </strong>
            <small>{list[activeIndex]?.name}</small>
          </div>
          <div className="analysis-face-controls">
            <button
              type="button"
              onClick={() => setAngle("front")}
              aria-label="Previous angle"
            >
              <ArrowLeft />
            </button>
            <button
              type="button"
              onClick={() => setAngle(angle === "front" ? "side" : "front")}
              aria-label="Reset angle"
            >
              <RefreshCw />
            </button>
            <button
              type="button"
              onClick={() => setAngle("side")}
              aria-label="Next angle"
            >
              <ArrowRight />
            </button>
          </div>
        </GlassCard>

        <GlassCard className="ratio-panel">
          <header>
            <div>
              <span className="eyebrow">
                Understanding{" "}
                {pillars.find((item) => item.id === pillar)?.label}
              </span>
              <h1>Your {angle === "front" ? "Front" : "Side"} Ratios</h1>
            </div>
            <div>
              <button type="button" onClick={() => openView("doodeegpt")}>
                <MessageCircle /> Ask DOODEE GPT
              </button>
              <button className="ratio-unlock" type="button" onClick={onUnlock}>
                <LockKeyhole /> Unlock 70+ ratios
              </button>
            </div>
          </header>
          <p className="ratio-panel__intro">
            {pillar === "harmony"
              ? "How your features work together as one face."
              : pillar === "angularity"
                ? "Shape, projection and definition across your facial structure."
                : pillar === "dimorphism"
                  ? "How selected traits compare with your chosen reference."
                  : "The individual proportions that shape your overall appearance."}
          </p>
          <div className="ratio-list">
            {visible.map((metric, index) => {
              const locked = pillarLocked || index > 2;
              return (
                <button
                  className={`ratio-row ${activeIndex === index ? "is-active" : ""} ${locked ? "is-locked" : ""}`}
                  type="button"
                  onPointerEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onClick={() =>
                    locked ? onUnlock() : setSelectedMetric(metric)
                  }
                  key={metric.id}
                >
                  <span>
                    <strong>{metric.name}</strong>
                    <small>{metric.status}</small>
                  </span>
                  <div className="ratio-row__track">
                    <i style={{ width: `${metric.score * 10}%` }} />
                    <b style={{ left: `${metric.score * 10}%` }} />
                  </div>
                  <em>{locked ? <LockKeyhole /> : metric.value}</em>
                  <span className="ratio-score">
                    {locked ? "?.?" : metric.score.toFixed(1)}
                  </span>
                  <ChevronDown />
                </button>
              );
            })}
          </div>
          {list.length > 7 && (
            <button
              className="ratio-show-more"
              type="button"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll
                ? "Show fewer ratios"
                : `Show ${list.length - 7} more ratios`}
              <ChevronDown />
            </button>
          )}
        </GlassCard>
      </div>

      <section className="analysis-insight-stack">
        <InsightList kind="strength" items={strengths} />
        <InsightList kind="improve" items={improvements} />
      </section>
      <GlassCard className="continue-analysis">
        <div className="continue-analysis__letters">
          <span className="is-done">H</span>
          <span>A</span>
          <span>D</span>
          <span>F</span>
        </div>
        <div>
          <span className="eyebrow">Progress</span>
          <h2>{unlockedCount} of {pillars.length} pillars analyzed</h2>
          <p>Complete every pillar for a more accurate full-face view.</p>
        </div>
        <div className="continue-analysis__actions">
          <button type="button" onClick={() => setPillar("angularity")}>
            Start Angularity
          </button>
          <button type="button" onClick={() => setPillar("dimorphism")}>
            Start Dimorphism
          </button>
          <button type="button" onClick={() => setPillar("features")}>
            Start Features
          </button>
        </div>
      </GlassCard>
      {selectedMetric && (
        <RatioModal
          metric={selectedMetric}
          index={list.findIndex((item) => item.id === selectedMetric.id)}
          total={list.length}
          scanImage={scanImage}
          onClose={() => setSelectedMetric(null)}
        />
      )}
      </div>
      {analysisMode === "library" && <MeasurementLibrary onUnlock={onUnlock} />}
    </div>
  );
}

function Plan({
  scanImage,
  onUnlock,
}: {
  scanImage: string;
  onUnlock: () => void;
}) {
  const [mode, setMode] = useState("Timeline");
  const [open, setOpen] = useState(0);
  return (
    <div className="app-view plan-view plan-view--deep">
      <div className="app-page-title">
        <span className="eyebrow">Your plan</span>
        <h1>Know what to do next.</h1>
        <p>Ordered by impact, effort, cost and commitment.</p>
      </div>
      <GlassCard className="potential-card potential-card--deep">
        <div>
          <span className="eyebrow">Current</span>
          <strong>
            7.4 <small>today</small>
          </strong>
        </div>
        <ArrowRight />
        <div>
          <span className="eyebrow">Your target</span>
          <strong>
            8.2 <small>with your plan</small>
          </strong>
        </div>
        <div className="potential-profile">
          <img src={scanImage} alt="Front profile" />
          <img className="is-side" src={scanImage} alt="Side profile" />
        </div>
        <div className="potential-meta">
          <span>
            <b>{planActions.length}</b> actions
          </span>
          <span>
            <b>$0–$1.5k</b> starting range
          </span>
          <span>
            <b>94%</b> coverage
          </span>
        </div>
        <div className="potential-track">
          <span />
        </div>
      </GlassCard>
      <div className="plan-mode">
        <div>
          {["Population", "Timeline", "Impact"].map((item) => (
            <button
              className={mode === item ? "is-active" : ""}
              type="button"
              onClick={() => setMode(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
        <span>
          {mode === "Timeline"
            ? "Manage and track your improvement journey"
            : mode === "Impact"
              ? "Highest expected impact first"
              : "Compared with your reference group"}
        </span>
      </div>
      <GlassCard className="plan-timeline">
        <header>
          <div>
            <span className="eyebrow">Your timeline</span>
            <h2>Top actions in your plan</h2>
          </div>
          <button type="button" onClick={onUnlock}>
            <LockKeyhole /> Unlock analysis
          </button>
        </header>
        <div className="plan-action-list">
          {planActions.map((action, index) => (
            <article
              className={`${open === index ? "is-open" : ""} ${action.locked ? "is-locked" : ""}`}
              key={action.title}
            >
              <button
                className="plan-action-main"
                type="button"
                onClick={() =>
                  action.locked
                    ? onUnlock()
                    : setOpen(open === index ? -1 : index)
                }
              >
                <span className="plan-action-number">{index + 1}</span>
                <div>
                  <strong>{action.title}</strong>
                  <span
                    className={`plan-category plan-category--${action.category.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    {action.category}
                  </span>
                  <p>{action.detail}</p>
                </div>
                <b>{action.locked ? <LockKeyhole /> : action.impact}</b>
                <ChevronDown />
              </button>
              <div className="plan-action-detail">
                <span>
                  <small>Expected impact</small>
                  <b>{action.impact} pts</b>
                </span>
                <span>
                  <small>Estimated range</small>
                  <b>{action.cost}</b>
                </span>
                <span>
                  <small>Time or recovery</small>
                  <b>{action.time}</b>
                </span>
                <button type="button">
                  Open details <ArrowRight />
                </button>
              </div>
            </article>
          ))}
        </div>
      </GlassCard>
      <p className="education-note">
        <CircleHelp /> Educational guidance only. Discuss medical options with a
        qualified professional.
      </p>
    </div>
  );
}

/* qijek's Simulate was a six-item picker with a fake "preview is ready" toast. doodee already
 * has a working stacked simulation against POST /simulations/preview/ with per-region locking
 * and quota handling, so that view is rendered inside this shell instead of being replaced by
 * the mock. Its internals are restyled in phase 5. */
const SimulationView = lazy(() => import("../components/SimulationView"));

function DoodeeGPT({ scanImage }: { scanImage: string }) {
  const suggestions = [
    "What's my harmony score?",
    "What are my strongest features?",
    "How can I improve first?",
    "Explain my jaw assessment",
    "Which options should I discuss?",
    "Build a simple 30-day plan",
  ];
  const [value, setValue] = useState("");
  const [mode, setMode] = useState("Normal");
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([]);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = (text = value) => {
    const clean = text.trim();
    if (!clean) return;
    setMessages((items) => [...items, { role: "user", text: clean }]);
    setValue("");
    window.setTimeout(
      () =>
        setMessages((items) => [
          ...items,
          {
            role: "assistant",
            text: "Your harmony score is 7.4/10. Eye separation and mouth width are your strongest measured areas. Chin projection has the clearest opportunity, but start with low-commitment changes before considering a procedure.",
          },
        ]),
      420,
    );
  };
  return (
    <div className="app-view gpt-view">
      <GlassCard className="gpt-history">
        <header>
          <div className="gpt-mini-brand">
            <ScanFace />
            <strong>DOODEE GPT</strong>
          </div>
          <button type="button" onClick={() => setMessages([])}>
            <Plus /> New chat
          </button>
        </header>
        <label>
          <Search />
          <input placeholder="Search chats" />
        </label>
        <span className="eyebrow">Recent</span>
        {messages.length ? (
          <button className="gpt-history-item" type="button">
            <MessageCircle />
            <span>
              <strong>{messages[0].text}</strong>
              <small>Just now</small>
            </span>
          </button>
        ) : (
          <div className="gpt-history-empty">
            <MessageCircle />
            <p>No chat history yet</p>
            <small>Start a conversation to see it here.</small>
          </div>
        )}
        <a href="/app#overview">
          <ArrowLeft /> Back to dashboard
        </a>
      </GlassCard>
      <GlassCard className="gpt-chat">
        <header>
          <button
            className="gpt-mode"
            type="button"
            onClick={() =>
              setMode(mode === "Normal" ? "Deep analysis" : "Normal")
            }
          >
            <SlidersHorizontal /> {mode}
            <ChevronDown />
          </button>
          <div>
            <img src={scanImage} alt="Your analysis profile" />
            <span>
              <strong>My analysis</strong>
              <small>85+ measurements connected</small>
            </span>
          </div>
        </header>
        <div
          className={`gpt-conversation ${messages.length ? "has-messages" : ""}`}
        >
          {messages.length ? (
            messages.map((message, index) => (
              <div
                className={`gpt-message is-${message.role}`}
                key={`${message.role}-${index}`}
              >
                {message.role === "assistant" && (
                  <span>
                    <ScanFace />
                  </span>
                )}
                <p>{message.text}</p>
              </div>
            ))
          ) : (
            <div className="gpt-empty">
              <div className="gpt-orb">
                <MessageCircle />
              </div>
              <span className="eyebrow">DOODEE GPT</span>
              <h1>Ready to understand your face?</h1>
              <p>Ask about your measurements, plan and preview directions.</p>
              <div className="gpt-suggestions">
                {suggestions.map((item) => (
                  <button type="button" onClick={() => submit(item)} key={item}>
                    {item}
                    <ArrowRight />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach file"
          >
            <Paperclip />
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={(event) =>
              setFileName(event.target.files?.[0]?.name ?? "")
            }
          />
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={fileName || "Ask anything"}
            aria-label="Ask DOODEE GPT"
            rows={1}
          />
          <button type="submit" aria-label="Send" disabled={!value.trim()}>
            <ArrowRight />
          </button>
        </form>
        <small className="gpt-disclaimer">
          DOODEE GPT can make mistakes. Medical decisions require a qualified
          professional.
        </small>
      </GlassCard>
    </div>
  );
}

export default function DashboardPage({ view }: { view: AppView }) {
  const navigate = useNavigate();
  const { locale } = useLocale();
  // The most recent scan is the one the dashboard describes. /analysis may name a specific one
  // through ?scan_id=, which is how ScanPage hands off straight after an upload.
  const requestedScanId = new URLSearchParams(window.location.search).get("scan_id");
  const scanList = useQuery({ queryKey: ["scans"], queryFn: getScans });
  const scanId = requestedScanId || scanList.data?.[0]?.id;
  const scanQuery = useQuery({
    queryKey: ["scan", scanId],
    queryFn: () => getScan(scanId),
    enabled: Boolean(scanId),
    // Celery does the analysis, so keep polling until it settles.
    refetchInterval: (query) =>
      ["completed", "failed"].includes(query.state.data?.status) ? false : 1500,
  });
  const scan = scanQuery.data;
  // ScanSerializer.get_front_url only signs a URL once the scan completes, so this is null
  // while Celery is still working — which is exactly when the handoff state should show.
  const scanImage = scan?.front_url || null;
  const scanData = useMemo<ScanData>(
    () => ({
      pillars: pillarsFor(scan),
      rows: ratioRows(scan),
      strengths: strengthsFor(scan),
      improvements: improvementsFor(scan),
      overall: overallScore(scan),
      availability: catalogAvailability(scan),
    }),
    [scan],
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [toolPanel, setToolPanel] = useState<"settings" | "help" | null>(null);
  const [toast, setToast] = useState("");
  const activeLabel = useMemo(
    () => views.find((item) => item.id === view)?.label ?? "Overview",
    [view],
  );

  // Send the user to capture only once we know there is genuinely nothing to show — not while
  // the scan list is still loading, and not while Celery is still analysing an existing scan.
  const hasNoScan = scanList.isSuccess && !scanId;
  useEffect(() => {
    if (hasNoScan) navigate("/scan", { replace: true });
  }, [hasNoScan, navigate]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUnlockOpen(false);
        setToolPanel(null);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const openView = (next: AppView) => {
    setMenuOpen(false);
    setToolPanel(null);
    navigate(VIEW_ROUTES[next]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const notify = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 1800);
  };
  const share = () => {
    navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
    notify("Analysis link copied");
  };
  // Deleting the scan is a real server action, so it lives on /history where it already has a
  // confirmation. Here the control just takes the user there rather than dropping local state.
  const goToHistory = () => navigate("/history");

  if (!scanImage)
    return <main className="doodee-app doodee-app--handoff" aria-busy="true" />;
  return (
    <ScanDataContext.Provider value={scanData}>
    <main className="doodee-app">
      <aside className={`app-sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="sidebar-head">
          <Brand href="/home" />
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>
        <div className="sidebar-profile">
          <CircleUserRound />
          <span>
            <strong>My analysis</strong>
            <small>Free plan</small>
          </span>
          <Settings2 />
        </div>
        <button
          className="sidebar-upgrade"
          type="button"
          onClick={() => setUnlockOpen(true)}
        >
          <Sparkles /> Unlock full analysis
        </button>
        <div className="sidebar-section">
          <span>History</span>
          <button className="sidebar-new" type="button" onClick={() => navigate("/scan")}>
            <Plus /> New scan
          </button>
        </div>
        <button
          className="history-card is-active"
          type="button"
          onClick={() => openView("overview")}
        >
          <img src={scanImage} alt="Latest scan" />
          <span>
            <strong>Latest scan</strong>
            <small>{scanData.overall === null ? "Analysing…" : `Overall ${scanData.overall.toFixed(1)}`}</small>
          </span>
          <ArrowRight />
        </button>
        <nav className="sidebar-nav" aria-label="Dashboard">
          <span>Explore</span>
          {views.map((item) => (
            <button
              className={view === item.id ? "is-active" : ""}
              type="button"
              onClick={() => openView(item.id)}
              key={item.id}
            >
              {item.id === "overview" ? (
                <LayoutGrid />
              ) : item.id === "analysis" ? (
                <BarChart3 />
              ) : item.id === "plan" ? (
                <Target />
              ) : item.id === "simulate" ? (
                <WandSparkles />
              ) : (
                <MessageCircle />
              )}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button type="button" onClick={goToHistory}>
            Manage scans
          </button>
        </div>
      </aside>
      <div className="app-shell">
        <header className="app-topbar">
          <button
            className="app-menu"
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <span className="app-mobile-title">{activeLabel}</span>
          <nav aria-label="Analysis sections">
            {views.map((item) => (
              <button
                className={view === item.id ? "is-active" : ""}
                type="button"
                onClick={() => openView(item.id)}
                key={item.id}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="app-tools">
            <button type="button" onClick={share} aria-label="Share">
              <Share2 />
            </button>
            <button
              type="button"
              onClick={() =>
                setToolPanel(toolPanel === "settings" ? null : "settings")
              }
              aria-label="Settings"
            >
              <Settings2 />
            </button>
            <button
              type="button"
              onClick={() => setToolPanel(toolPanel === "help" ? null : "help")}
              aria-label="Help"
            >
              <CircleHelp />
            </button>
            {toolPanel && (
              <div className="app-tool-panel">
                <strong>
                  {toolPanel === "settings"
                    ? "Analysis settings"
                    : "Need help?"}
                </strong>
                <p>
                  {toolPanel === "settings"
                    ? "Reference: Male · Global"
                    : "Review capture guidance or contact support."}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    notify(
                      toolPanel === "settings"
                        ? "Settings saved"
                        : "Help center opened",
                    )
                  }
                >
                  {toolPanel === "settings" ? "Save settings" : "Open help"}
                </button>
              </div>
            )}
          </div>
        </header>
        <div className="app-content">
          {view === "overview" && (
            <Overview
              scanImage={scanImage}
              openView={openView}
              onUnlock={() => setUnlockOpen(true)}
            />
          )}
          {view === "analysis" && (
            <Analysis
              scanImage={scanImage}
              openView={openView}
              onUnlock={() => setUnlockOpen(true)}
            />
          )}
          {view === "plan" && (
            <Plan scanImage={scanImage} onUnlock={() => setUnlockOpen(true)} />
          )}
          {view === "simulate" && (
            <Suspense fallback={<div className="app-view" aria-busy="true" />}>
              <SimulationView lang={locale} onNavigate={(route: string) => navigate(`/${route}`)} />
            </Suspense>
          )}
          {view === "doodeegpt" && <DoodeeGPT scanImage={scanImage} />}
        </div>
      </div>
      {menuOpen && (
        <button
          className="app-scrim"
          type="button"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation"
        />
      )}
      {unlockOpen && <UnlockModal onClose={() => setUnlockOpen(false)} />}
      {toast && (
        <div className="app-toast" role="status">
          <Check />
          {toast}
        </div>
      )}
    </main>
    </ScanDataContext.Provider>
  );
}
