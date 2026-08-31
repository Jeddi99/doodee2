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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDemoScan, getScan, getScans, getSession } from "../lib/api";
import { errorMessage } from "../lib/apiError";
import { dashboardGate } from "../lib/dashboardGate";
import { statusPollInterval } from "../lib/pollInterval.js";
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
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  CircleUserRound,
  FlaskConical,
  Globe,
  ImageOff,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Droplets,
  Sparkles,
  Target,
  WandSparkles,
  X,
} from "lucide-react";
import Brand from "../Brand";
import NotificationBell from "../components/NotificationBell";
import {
  analysisCatalog,
  methodLabels,
  metricGroups,
  type AnalysisMetric,
  type MetricGroup,
  type MetricMethod,
} from "../analysisCatalog";
import { latestCraniofacialScan } from "../lib/latestScan";

type AppView =
  | "overview"
  | "analysis"
  | "plan"
  | "simulate"
  | "doodeegpt"
  | "tryon"
  | "history"
  | "pricing"
  | "settings"
  | "scorecard"
  | "referral"
  | "profile"
  | "skin";
type PillarId = "harmony" | "angularity" | "dimorphism" | "features";
type FaceAngle = "front" | "side";
type AnalysisMode = "results" | "library";

/* Rows come from lib/dashboardData now. The old fixed status union described qijek's five
   hardcoded verdicts; the real status names how far a measurement sits from the reference. */
type RatioMetric = RatioRow;


/** qijek switched these five with location.hash; doodee gives each its own URL. */
export const VIEW_ROUTES: Record<AppView, string> = {
  overview: "/home",
  analysis: "/analysis",
  plan: "/plan",
  simulate: "/simulation",
  doodeegpt: "/doodee-gpt",
  tryon: "/try-on",
  history: "/history",
  pricing: "/pricing",
  settings: "/settings",
  scorecard: "/score-card",
  referral: "/referral",
  profile: "/profile",
  skin: "/skin",
};

/** The views that render the scan photograph itself, and so cannot draw without one. */
const IMAGE_BACKED_VIEWS = new Set<AppView>(["overview", "analysis", "plan", "simulate"]);

/** doodee-only destinations. They sit in their own sidebar section rather than crowding the
 *  five-item topbar nav qijek designed. */
const accountViews: { id: AppView; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "scorecard", label: "Score card" },
  { id: "skin", label: "Skin" },
  { id: "referral", label: "Invite" },
  { id: "tryon", label: "Try-on" },
  { id: "history", label: "History" },
  { id: "pricing", label: "Plans" },
  { id: "settings", label: "Settings" },
];

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

/**
 * The scan photograph, and why it is missing when it is.
 *
 * A completed scan without a photo is the *normal* state after 30 days: `purge_scan_images`
 * (backend/doodee/tasks.py:118) deletes the images and empties `image_objects` while keeping
 * the row and its measurements. The two reasons a URL can be absent need different words —
 * `images_expired` is permanent and is the privacy promise being kept, while a signing failure
 * is temporary and worth a refresh — so the flag comes from the server rather than being
 * guessed from the absence itself.
 *
 * Carried in context rather than threaded as a prop because five components render the photo
 * and none of them should have to know the difference.
 */
type ScanPhotoState = { url: string | null; expired: boolean; demo: boolean };
const ScanPhotoContext = createContext<ScanPhotoState>({ url: null, expired: false, demo: false });

function ScanPhoto({ alt, className }: { alt: string; className?: string }) {
  const { url, expired, demo } = useContext(ScanPhotoContext);
  const { locale } = useLocale();
  const th = locale !== "en";
  if (url) return <img src={url} alt={alt} className={className} />;
  // Demo first: a sample scan also has empty image_objects, so `images_expired` is true for it
  // too — and "your photo was deleted" would be a straight falsehood about a photo that never
  // existed.
  const title = demo
    ? th ? "ข้อมูลตัวอย่าง" : "Sample data"
    : expired
      ? th ? "ภาพถูกลบแล้ว" : "Photo deleted"
      : th ? "โหลดภาพไม่ได้" : "Photo unavailable";
  const detail = demo
    ? th ? "ตัวเลขสมมติ ไม่มีภาพใบหน้าจริง" : "Invented numbers. There is no real face here."
    : expired
      ? th ? "ตามกำหนด 30 วัน ค่าที่วัดได้ยังอยู่ครบ" : "On schedule after 30 days. Your measurements are still here."
      : th ? "ลองรีเฟรชหน้านี้อีกครั้ง" : "Try refreshing the page.";
  return (
    <span className={`scan-photo-placeholder ${className || ""}`} role="img" aria-label={`${alt} — ${title}. ${detail}`}>
      {demo ? <FlaskConical aria-hidden="true" /> : expired ? <ShieldCheck aria-hidden="true" /> : <ImageOff aria-hidden="true" />}
      <strong>{title}</strong>
      <small>{detail}</small>
    </span>
  );
}

/** Inverse of PILLAR_CATEGORIES in lib/dashboardData, for grouping rows under a pillar tab. */
/**
 * Labels for the plan codes that have no sellable `Plan` row behind them, or that need wording of
 * their own. Everything else takes its name from the server (`session.plan_name_th/_en`), which is
 * the row an admin actually edits.
 *
 * This map used to be the *only* source, and it silently predated the ฟรี/พลัส/โปร tiers — so every
 * Plus and Pro subscriber saw "…" in the sidebar where their plan name belongs. A hardcoded client
 * copy of a server-owned list falls behind the day somebody adds a tier, which is why the fallback
 * now runs the other way round.
 */
const PLAN_LABELS: Record<string, string> = {
  free: "Free plan",
  // Granted by a redeemed code. `current_plan()` lends it Pro's *allowances*, so the server-side
  // name would read "โปร" — true of what they can do, false about what they hold.
  vip: "VIP",
  member: "Member",
  clinic: "Clinic partner",
};

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



export function GlassCard({
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
  openView,
  onUnlock,
}: {
  openView: (view: AppView) => void;
  onUnlock: () => void;
}) {
  const { pillars, rows, strengths, improvements, overall } = useScanData();
  const { locale } = useLocale();
  const th = locale !== "en";
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"summary" | "ratios" | "insights" | "scorecard">("summary");
  const [selectedPillar, setSelectedPillar] = useState<PillarId | "all">("all");
  const [selectedRatio, setSelectedRatio] = useState<RatioMetric | null>(null);

  const unlockedCount = pillars.filter((item) => !item.locked).length;
  const overallVal = overall !== null ? overall : parseFloat(pillars[0]?.score || "0");
  const scoreDisplay = overallVal.toFixed(1);

  // SVG Gauge calculations
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (Math.min(10, Math.max(0, overallVal)) / 10) * circumference;

  const filteredRows = selectedPillar === "all" ? rows : rows.filter((r) => pillarOf(r.category) === selectedPillar);

  return (
    <div className="app-view app-overview app-overview--modern">
      {/* Sub-tabs Navigation */}
      <nav className="doodee-subtabs" aria-label="Overview tabs">
        <button
          type="button"
          className={activeTab === "summary" ? "is-active" : ""}
          onClick={() => setActiveTab("summary")}
        >
          <LayoutGrid size={16} />
          <span>{th ? "ภาพรวม" : "Summary"}</span>
        </button>
        <button
          type="button"
          className={activeTab === "ratios" ? "is-active" : ""}
          onClick={() => setActiveTab("ratios")}
        >
          <SlidersHorizontal size={16} />
          <span>{th ? "สัดส่วน 12 ค่า" : "12 Measurements"}</span>
        </button>
        <button
          type="button"
          className={activeTab === "insights" ? "is-active" : ""}
          onClick={() => setActiveTab("insights")}
        >
          <Target size={16} />
          <span>{th ? "จุดเด่น & การพัฒนา" : "Insights"}</span>
        </button>
        <button
          type="button"
          className={activeTab === "scorecard" ? "is-active" : ""}
          onClick={() => setActiveTab("scorecard")}
        >
          <BarChart3 size={16} />
          <span>{th ? "การ์ดคะแนน" : "Score Card"}</span>
        </button>
      </nav>

      {/* TAB 1: SUMMARY */}
      {activeTab === "summary" && (
        <>
          {/* Hero Face Summary Card */}
          <GlassCard className="doodee-hero-score-card">
            <div className="doodee-hero-score-card__faces">
              <figure className="doodee-face-thumb">
                <ScanPhoto alt="Front view" />
                <figcaption>{th ? "หน้าตรง" : "Front"}</figcaption>
              </figure>
              <figure className="doodee-face-thumb">
                <ScanPhoto alt="Side profile" className="is-side" />
                <figcaption>{th ? "ด้านข้าง" : "Side"}</figcaption>
              </figure>
            </div>

            <div className="doodee-hero-score-card__gauge">
              <div className="doodee-gauge-wrapper">
                <svg className="doodee-gauge-svg" viewBox="0 0 160 160">
                  <circle
                    className="doodee-gauge-bg"
                    cx="80"
                    cy="80"
                    r={radius}
                    strokeWidth="12"
                  />
                  <circle
                    className="doodee-gauge-meter"
                    cx="80"
                    cy="80"
                    r={radius}
                    strokeWidth="12"
                    strokeDasharray={circumference}
                    strokeDashoffset={progressOffset}
                  />
                </svg>
                <div className="doodee-gauge-content">
                  <strong>{scoreDisplay}</strong>
                  <small>/10</small>
                </div>
              </div>
              <div className="doodee-gauge-info">
                <span className="doodee-badge doodee-badge--primary">
                  {th ? "ความสมดุลใกล้เคียงเกณฑ์" : "High Balance Index"}
                </span>
                <h2>{th ? "ผลวิเคราะห์สัดส่วนใบหน้า" : "Facial Analysis Score"}</h2>
                <p>
                  {th
                    ? "คำนวณเปรียบเทียบกับกลุ่มอ้างอิงคนไทยอายุ 18-35 ปี โดยประเมินความสมดุล 12 มิติ"
                    : "Calibrated against Thai adult reference standard (18-35 yrs) across 12 facial dimensions."}
                </p>
              </div>
            </div>

            <div className="doodee-hero-score-card__actions">
              <button
                type="button"
                className="doodee-btn doodee-btn--primary"
                onClick={() => openView("doodeegpt")}
              >
                <MessageCircle size={16} />
                <span>{th ? "ถาม AI เกี่ยวกับผลนี้" : "Ask Gemini AI"}</span>
              </button>
              <button
                type="button"
                className="doodee-btn doodee-btn--secondary"
                onClick={() => openView("simulate")}
              >
                <WandSparkles size={16} />
                <span>{th ? "จำลองรูปหน้า" : "Simulation"}</span>
              </button>
              <button
                type="button"
                className="doodee-btn doodee-btn--ghost"
                onClick={() => navigate("/scan")}
              >
                <RefreshCw size={15} />
                <span>{th ? "สแกนใหม่" : "New Scan"}</span>
              </button>
            </div>
          </GlassCard>

          {/* 4 Pillars Grid (2x2) */}
          <div className="doodee-section-header">
            <div>
              <span className="eyebrow">{th ? "4 มิติหลักของใบหน้า" : "4 Core Pillars"}</span>
              <h3>{th ? "ความสมดุลและโครงสร้างรูปหน้า" : "Harmony & Structural Ratios"}</h3>
            </div>
            <span className="doodee-tag">{unlockedCount} / {pillars.length} {th ? "ปลดล็อกแล้ว" : "Unlocked"}</span>
          </div>

          <section className="doodee-pillar-grid-clean" aria-label="Score pillars">
            {pillars.map((item) => {
              const scoreVal = parseFloat(item.score || "0");
              const pct = Math.min(100, Math.max(0, scoreVal * 10));
              return (
                <GlassCard
                  key={item.id}
                  className={`doodee-pillar-card ${item.locked ? "is-locked" : ""}`}
                >
                  <div className="doodee-pillar-card__head">
                    <div className="doodee-pillar-icon">
                      <span className={`pillar-mark pillar-mark--${item.id}`} />
                      <h4>{item.label}</h4>
                    </div>
                    <strong className="doodee-pillar-score">
                      {item.score}
                      <small>/10</small>
                    </strong>
                  </div>

                  <div className="doodee-progress-bar">
                    <div
                      className={`doodee-progress-bar__fill doodee-progress-bar__fill--${item.id}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <p className="doodee-pillar-note">{item.note}</p>

                  <div className="doodee-pillar-footer">
                    {item.locked ? (
                      <button
                        type="button"
                        className="doodee-btn-link doodee-btn-link--lock"
                        onClick={onUnlock}
                      >
                        <LockKeyhole size={14} /> {th ? "ปลดล็อกคะแนนเต็ม" : "Unlock Full Pillar"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="doodee-btn-link"
                        onClick={() => {
                          setSelectedPillar(item.id);
                          setActiveTab("ratios");
                        }}
                      >
                        <span>{th ? "ดูค่าที่วัดได้" : "View Measurements"}</span>
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </section>
        </>
      )}

      {/* TAB 2: RATIOS (12 Measurements) */}
      {activeTab === "ratios" && (
        <div className="doodee-ratios-tab">
          <div className="doodee-filter-chips">
            <button
              type="button"
              className={selectedPillar === "all" ? "is-active" : ""}
              onClick={() => setSelectedPillar("all")}
            >
              {th ? "ทั้งหมด" : "All (12)"}
            </button>
            {pillars.map((p) => (
              <button
                key={p.id}
                type="button"
                className={selectedPillar === p.id ? "is-active" : ""}
                onClick={() => setSelectedPillar(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <GlassCard className="doodee-ratios-card">
            <div className="ratio-table" role="table" aria-label="Measurements list">
              {filteredRows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="ratio-row"
                  onClick={() => setSelectedRatio(r)}
                >
                  <div className="ratio-row__info">
                    <strong>{r.name}</strong>
                    {/* `value` and `ideal` already carry the unit — formatMeasure() adds it.
                        Re-reading observed/reference/unit off the row was reading fields
                        RatioRow never had, so the whole line rendered blank. */}
                    <small>{r.value} ({th ? "อ้างอิง" : "reference"}: {r.ideal})</small>
                  </div>
                  <div className="ratio-row__score">
                    <span className="doodee-badge doodee-badge--outline">{r.status}</span>
                    <b>{r.score}/10</b>
                    <ArrowRight size={16} />
                  </div>
                </button>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* TAB 3: INSIGHTS */}
      {activeTab === "insights" && (
        <section className="insight-grid">
          <InsightList kind="strength" items={strengths} />
          <InsightList kind="improve" items={improvements} />
        </section>
      )}

      {/* TAB 4: SCORECARD */}
      {activeTab === "scorecard" && (
        <div className="doodee-scorecard-tab">
          <Suspense fallback={<div className="app-view" aria-busy="true" />}>
            <ScoreCardPanel />
          </Suspense>
        </div>
      )}

      {/* Ratio Details Modal if opened */}
      {selectedRatio && (
        <RatioModal
          metric={selectedRatio}
          index={rows.indexOf(selectedRatio)}
          total={rows.length}
          onClose={() => setSelectedRatio(null)}
        />
      )}
    </div>
  );
}

/* The tab ids stay English so the active-tab comparison never depends on the locale;
   only their labels are translated. */
const RATIO_TABS = ["overview", "simulate", "celebrities", "edit"] as const;
type RatioTab = (typeof RATIO_TABS)[number];

const RATIO_MODAL_COPY = {
  th: {
    close: "ปิด",
    closeDetails: "ปิดรายละเอียดสัดส่วน",
    photoAlt: (name: string) => `ค่าที่วัดได้ของ${name}`,
    score: "คะแนน",
    reference: "ค่าอ้างอิง",
    ideal: (value: string) => `ค่าอ้างอิง ${value}`,
    tabs: { overview: "ภาพรวม", simulate: "จำลอง", celebrities: "ตัวอย่าง", edit: "แก้ไข" },
    about: "เกี่ยวกับสัดส่วนนี้",
    mayIndicate: "อาจบ่งบอกถึง",
    affected: "ค่าที่เกี่ยวข้อง",
    simulateTitle: "ดูแนวทางที่เป็นไปได้",
    simulateBody: "เปิดค่านี้ในสตูดิโอจำลอง เพื่อเทียบภาพตัวอย่างการเปลี่ยนแปลง",
    celebritiesTitle: "ตัวอย่างอ้างอิง",
    celebritiesBody: "ใช้เทียบช่วงของสัดส่วน ไม่ใช่เทียบหน้าตาโดยรวมของใคร",
    editTitle: "แก้ไขจุดอ้างอิง",
    editBody: "ปรับค่านี้ได้ถ้าจุดอ้างอิงที่จับมาคลาดเคลื่อน",
  },
  en: {
    close: "Close",
    closeDetails: "Close ratio details",
    photoAlt: (name: string) => `Your ${name} measurement`,
    score: "Score",
    reference: "Reference",
    ideal: (value: string) => `Ideal ${value}`,
    tabs: { overview: "Overview", simulate: "Simulate", celebrities: "Celebrities", edit: "Edit" },
    about: "About this ratio",
    mayIndicate: "May indicate",
    affected: "Affected measurements",
    simulateTitle: "See a direction.",
    simulateBody: "Open this measurement in Simulate to compare an illustrative change.",
    celebritiesTitle: "Reference examples.",
    celebritiesBody: "Compare the ratio range, not a person's overall appearance.",
    editTitle: "Correct the landmark.",
    editBody: "Adjust this measurement if the captured landmark is inaccurate.",
  },
} as const;

function RatioModal({
  metric,
  index,
  total,
  onClose,
}: {
  metric: RatioMetric;
  index: number;
  total: number;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const c = RATIO_MODAL_COPY[locale === "en" ? "en" : "th"];
  const [tab, setTab] = useState<RatioTab>("overview");
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
        aria-label={c.closeDetails}
      />
      <section className="ratio-modal app-glass">
        <header>
          <span>
            {index + 1} / {total}
          </span>
          <h2 id="ratio-modal-title">{metric.name}</h2>
          <button type="button" onClick={onClose} aria-label={c.close}>
            <X />
          </button>
        </header>
        <div className="ratio-modal__hero">
          <figure>
            <ScanPhoto alt={c.photoAlt(metric.name)} />
            <span>{metric.value}</span>
          </figure>
          <div className="ratio-modal__score">
            <span className="eyebrow">{c.score}</span>
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
              <span>{c.reference}</span>
            </div>
            <b>{metric.value}</b>
            <p>{c.ideal(metric.ideal)}</p>
          </div>
        </div>
        <nav>
          {RATIO_TABS.map((item) => (
            <button
              className={tab === item ? "is-active" : ""}
              type="button"
              onClick={() => setTab(item)}
              key={item}
            >
              {c.tabs[item]}
            </button>
          ))}
        </nav>
        {tab === "overview" ? (
          <div className="ratio-modal__content">
            <div>
              <span className="eyebrow">{c.about}</span>
              <p>{metric.detail}</p>
            </div>
            <div>
              <span className="eyebrow">{c.mayIndicate}</span>
              <p>{metric.mayIndicate}</p>
            </div>
            <div>
              <span className="eyebrow">{c.affected}</span>
              <div className="ratio-chips">
                {metric.affected.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        ) : tab === "simulate" ? (
          <div className="ratio-modal__empty">
            <WandSparkles />
            <h3>{c.simulateTitle}</h3>
            <p>{c.simulateBody}</p>
          </div>
        ) : tab === "celebrities" ? (
          <div className="ratio-modal__empty">
            <CircleUserRound />
            <h3>{c.celebritiesTitle}</h3>
            <p>{c.celebritiesBody}</p>
          </div>
        ) : (
          <div className="ratio-modal__empty">
            <SlidersHorizontal />
            <h3>{c.editTitle}</h3>
            <p>{c.editBody}</p>
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
  onUnlock,
  openView,
}: {
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
  const photo = useContext(ScanPhotoContext);
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
          <ScanPhoto alt="Front view" />
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
          <ScanPhoto className="is-side" alt="Side view" />
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
          <ScanPhoto alt={`Your ${angle} facial analysis`} />
          {/* The overlay only means something on top of a face. Drawn over the placeholder it
              would read as landmarks measured on an empty box. */}
          {photo.url ? (
            <svg viewBox="0 0 600 760" aria-hidden="true">
              <path d="M145 230H455M130 327H470M157 468H443M188 596H412M300 185V630" />
              <circle cx="300" cy="327" r="5" />
              <circle cx="300" cy="468" r="5" />
            </svg>
          ) : null}
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
          onClose={() => setSelectedMetric(null)}
        />
      )}
      </div>
      {analysisMode === "library" && <MeasurementLibrary onUnlock={onUnlock} />}
    </div>
  );
}

/* qijek's `Plan` view lived here: a hardcoded action list with a "Current 7.4 -> target 8.2"
 * header and an "Expected impact +0.4 pts" on every row. Those numbers existed nowhere in the
 * system, and chat.py's safety rules forbid the product from stating how much any action would
 * change a score — a predicted gain from a cosmetic procedure is exactly the claim it promises
 * not to make. Replaced by views/DevelopmentPlanPanel.tsx, which is built from the user's own
 * measurements by the API. */

/* qijek's Simulate was a six-item picker with a fake "preview is ready" toast. doodee already
 * has a working stacked simulation against POST /simulations/preview/ with per-region locking
 * and quota handling, so that view is rendered inside this shell instead of being replaced by
 * the mock. Its internals are restyled in phase 5. */
const SimulationView = lazy(() => import("../components/SimulationView"));
/* Try-on keeps its existing component: 672 lines of canvas makeup geometry that the shell has
 * no reason to touch. The three presentational views are rebuilt on qijek's own cards. */
const TryOnView = lazy(() => import("../components/TryOnView"));
const HistoryPanel = lazy(() => import("./views/HistoryPanel"));
const PricingPanel = lazy(() => import("./views/PricingPanel"));
const SettingsPanel = lazy(() => import("./views/SettingsPanel"));
const ScoreCardPanel = lazy(() => import("./views/ScoreCardPanel"));
const ReferralPanel = lazy(() => import("./views/ReferralPanel"));
const ProfilePanel = lazy(() => import("./views/ProfilePanel"));
const SkinPanel = lazy(() => import("./views/SkinPanel"));
// Replaces the hardcoded `Plan` mock below, which promised a target score and a per-action
// point gain. No such figure exists in this system, and chat.py's rules forbid stating one.
const DevelopmentPlanPanel = lazy(() => import("./views/DevelopmentPlanPanel"));
/* Chat talks to /api/v1/chat/ and runs its own queries, so it is a lazy view like the rest
 * rather than a component threaded through DashboardPage state. */
const ChatPanel = lazy(() => import("./views/ChatPanel"));

function ProfileMenu({
  openView,
  planLabel,
  th,
}: {
  openView: (view: AppView) => void;
  planLabel: string;
  th: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="doodee-profile-menu-container" ref={menuRef}>
      <button
        type="button"
        className={`doodee-profile-trigger ${open ? "is-active" : ""}`}
        onClick={() => setOpen(!open)}
        aria-label="Profile and settings"
      >
        <CircleUserRound size={18} />
        <span className="doodee-profile-trigger__badge">{planLabel}</span>
      </button>

      {open && (
        <div className="doodee-profile-dropdown" role="menu">
          <div className="doodee-profile-dropdown__header">
            <strong>{th ? "บัญชีของฉัน" : "My Account"}</strong>
            <span className="doodee-badge doodee-badge--primary">{planLabel}</span>
          </div>

          <div className="doodee-profile-dropdown__list">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openView("profile");
              }}
            >
              <CircleUserRound size={15} />
              <span>{th ? "ข้อมูลโปรไฟล์" : "Profile"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openView("skin");
              }}
            >
              <Droplets size={15} />
              <span>{th ? "วิเคราะห์ผิว" : "Skin Analysis"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openView("pricing");
              }}
            >
              <Sparkles size={15} />
              <span>{th ? "อัปเกรดแพ็กเกจ" : "Plans & Billing"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openView("settings");
              }}
            >
              <Settings2 size={15} />
              <span>{th ? "ตั้งค่าระบบวิเคราะห์" : "Settings"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.open("mailto:support@doodee.ai", "_blank");
              }}
            >
              <CircleHelp size={15} />
              <span>{th ? "ช่วยเหลือ & ติดต่อทีมงาน" : "Help & Support"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage({ view }: { view: AppView }) {
  const navigate = useNavigate();
  const { locale, chooseLocale } = useLocale();
  const th = locale !== "en";
  // The most recent scan is the one the dashboard describes. /analysis may name a specific one
  // through ?scan_id=, which is how ScanPage hands off straight after an upload.
  const requestedScanId = new URLSearchParams(window.location.search).get("scan_id");
  const scanList = useQuery({ queryKey: ["scans"], queryFn: getScans });
  const sessionQuery = useQuery({ queryKey: ["session"], queryFn: getSession });
  // A special-cased label first, then the plan's own name from the server, then a placeholder
  // while the session is still loading. Only the last of those should ever be seen.
  const planLabel =
    PLAN_LABELS[sessionQuery.data?.plan] ??
    (locale === "en" ? sessionQuery.data?.plan_name_en : sessionQuery.data?.plan_name_th) ??
    "…";
  const scanId = requestedScanId || latestCraniofacialScan(scanList.data)?.id;
  const scanQuery = useQuery({
    queryKey: ["scan", scanId],
    queryFn: () => getScan(scanId),
    enabled: Boolean(scanId),
    // Celery does the analysis, so keep polling until it settles — but only on the views that
    // render the waiting state. Every other panel reads this scan's finished data and would
    // otherwise poll a progress bar nobody is looking at, on every route, forever.
    refetchInterval: (query) => statusPollInterval(query, IMAGE_BACKED_VIEWS.has(view)),
  });
  const scan = scanQuery.data;
  // ScanSerializer.get_front_url only signs a URL once the scan completes, so this is null
  // while Celery is still working — which is exactly when the handoff state should show.
  const scanImage = scan?.front_url || null;
  const scanData = useMemo<ScanData>(
    () => ({
      pillars: pillarsFor(scan, locale),
      rows: ratioRows(scan, locale),
      strengths: strengthsFor(scan, 3, locale),
      improvements: improvementsFor(scan, 3, locale),
      overall: overallScore(scan),
      availability: catalogAvailability(scan),
    }),
    [scan, locale],
  );
  const queryClient = useQueryClient();
  const seedDemo = useMutation({
    mutationFn: createDemoScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [toast, setToast] = useState("");
  const activeLabel = useMemo(
    () => {
      const labels: Record<AppView, { th: string; en: string }> = {
        overview: { th: "วิเคราะห์รูปหน้า", en: "Face Analysis" },
        analysis: { th: "สัดส่วน 12 ค่า", en: "Measurements" },
        plan: { th: "แผนพัฒนา", en: "Plan" },
        simulate: { th: "สตูดิโอจำลอง", en: "Simulation Studio" },
        doodeegpt: { th: "DOODEE AI Chat", en: "DOODEE AI Chat" },
        tryon: { th: "สตูดิโอสไตล์", en: "Style Try-on" },
        history: { th: "ประวัติการสแกน", en: "Scan History" },
        pricing: { th: "แพ็กเกจ & สิทธิพิเศษ", en: "Plans & Rewards" },
        settings: { th: "ตั้งค่าระบบ", en: "Settings" },
        scorecard: { th: "การ์ดคะแนน", en: "Score Card" },
        referral: { th: "ชวนเพื่อนรับ 30฿", en: "Invite Friends" },
        profile: { th: "โปรไฟล์ของฉัน", en: "My Profile" },
        skin: { th: "วิเคราะห์ผิว", en: "Skin Analysis" },
      };
      return th ? (labels[view]?.th ?? "ภาพรวม") : (labels[view]?.en ?? "Overview");
    },
    [view, th],
  );

  // Only the views that describe a scan need one. Settings, plans, history and try-on must stay
  // reachable before a first capture — bouncing them to /scan would trap a new account.
  const needsScan = !accountViews.some((item) => item.id === view);
  // Send the user to capture only once we know there is genuinely nothing to show — not while
  // the scan list is still loading, and not while Celery is still analysing an existing scan.
  const hasNoScan = scanList.isSuccess && !scanId;
  // With sample data available the redirect is skipped: bouncing to the camera is the one door
  // that cannot be opened while developing (no camera in a headless browser, no MediaPipe on a
  // laptop that is only meant to be checking a coupon form), and it made chat, the score card
  // and the paid gates unreachable. The chooser below offers both doors instead.
  // Waits for /session/ to answer. Reading `demo_scans_enabled` off an unresolved query gives
  // `undefined`, which redirected to the camera on the very first render — before the flag that
  // was supposed to prevent it had arrived.
  const demoResolved = sessionQuery.isSuccess || sessionQuery.isError;
  const demoAvailable = sessionQuery.data?.demo_scans_enabled === true;
  useEffect(() => {
    if (needsScan && hasNoScan && demoResolved && !demoAvailable) navigate("/scan", { replace: true });
  }, [needsScan, hasNoScan, demoResolved, demoAvailable, navigate]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUnlockOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const openView = (next: AppView) => {
    setMenuOpen(false);
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
  const handleSignOut = async () => {
    try {
      const { firebaseSignOut } = await import("../lib/firebase");
      await firebaseSignOut();
    } catch (err) {
      // Swallowing this silently is what hid the wrong import name here: the sign-out threw,
      // /login bounced straight back in, and nothing said why. Leaving on /login without a
      // session cleared would repeat that, so surface it and stay put.
      console.error("Sign out failed", err);
      return;
    }
    navigate("/login");
  };

  const loadError = scanList.error || scanQuery.error;
  if (loadError) {
    const rawErr = errorMessage(loadError) || (loadError as Error).message || "";
    const isAuthErr =
      rawErr.toLowerCase().includes("account is disabled") ||
      rawErr.toLowerCase().includes("authentication") ||
      rawErr.toLowerCase().includes("token") ||
      rawErr.toLowerCase().includes("401");

    return (
      <main className="doodee-app doodee-app--handoff">
        <div
          className="app-load-error"
          role="alert"
          style={{
            maxWidth: 480,
            margin: "80px auto",
            textAlign: "center",
            padding: "40px 28px",
            background: "rgba(255, 255, 255, 0.85)",
            backdropFilter: "blur(24px)",
            borderRadius: "24px",
            boxShadow: "0 20px 60px rgba(15, 23, 42, 0.08)",
            border: "1px solid rgba(22, 40, 66, 0.08)",
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              margin: "0 auto 18px",
              borderRadius: "16px",
              background: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertCircle size={28} />
          </div>
          <strong
            style={{
              fontSize: "1.25rem",
              fontWeight: 800,
              color: "#0f172a",
              marginBottom: "8px",
              display: "block",
            }}
          >
            {th ? "ไม่สามารถโหลดข้อมูลการวิเคราะห์ได้" : "We could not load your analysis."}
          </strong>
          <p
            style={{
              color: "#64748b",
              fontSize: "13.5px",
              lineHeight: 1.55,
              marginBottom: "24px",
            }}
          >
            {isAuthErr
              ? th
                ? "บัญชีนี้ถูกปิดการใช้งาน หรือเซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง"
                : "Your account is disabled or your session has expired. Please sign in again."
              : rawErr}
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                void scanList.refetch();
                void scanQuery.refetch();
              }}
              style={{
                padding: "10px 20px",
                borderRadius: "12px",
                background: "var(--app-ink, #0f172a)",
                color: "#fff",
                border: 0,
                fontWeight: 600,
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={15} /> {th ? "ลองใหม่อีกครั้ง" : "Try again"}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                padding: "10px 20px",
                borderRadius: "12px",
                background: "rgba(239, 68, 68, 0.08)",
                color: "#dc2626",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                fontWeight: 600,
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
              }}
            >
              <LogOut size={15} /> {th ? "ออกจากระบบ" : "Sign out"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Wait on the *analysis*, never on the photo. `purge_scan_images` deletes the images 30 days
  // after a scan and keeps the measurements, so "completed with no photo" is the normal steady
  // state for every account — gating the render on the image turned that state into a
  // permanently blank page. ScanPhoto explains the gap where the photo used to be instead.
  if (needsScan && hasNoScan && demoAvailable)
    return (
      <main className="doodee-app doodee-app--handoff">
        <div className="app-load-error demo-chooser" role="status">
          <strong>{th ? "ยังไม่มีผลสแกน" : "No scan yet"}</strong>
          <p>
            {th
              ? "สแกนจริงต้องใช้กล้องและถ่ายสามมุม หรือจะใช้ข้อมูลตัวอย่างเพื่อดูการ์ดคะแนน แชท และแผนก่อนก็ได้"
              : "A real scan needs a camera and three angles. Or load sample measurements to try the score card, chat and plans first."}
          </p>
          <div className="demo-chooser__actions">
            <button type="button" onClick={() => navigate("/scan")}>
              {th ? "สแกนจริง" : "Start a real scan"}
            </button>
            <button
              className="is-secondary"
              type="button"
              onClick={() => seedDemo.mutate()}
              disabled={seedDemo.isPending}
            >
              {seedDemo.isPending
                ? th ? "กำลังสร้าง…" : "Creating…"
                : th ? "ใช้ข้อมูลตัวอย่าง" : "Use sample data"}
            </button>
          </div>
          {seedDemo.error ? <small role="alert">{errorMessage(seedDemo.error)}</small> : null}
          <small>
            {th
              ? "ข้อมูลตัวอย่างเป็นตัวเลขสมมติ ไม่ใช่ใบหน้าจริง และไม่มีภาพประกอบ"
              : "Sample data is invented numbers, not a real face, and comes with no photographs."}
          </small>
        </div>
      </main>
    );

  const gate = dashboardGate(scan);
  if (IMAGE_BACKED_VIEWS.has(view) && gate === "failed")
    return (
      <main className="doodee-app doodee-app--handoff">
        <div className="app-load-error" role="alert">
          <strong>This scan could not be analysed.</strong>
          <p>{scan.error_message || "Capture three angles again in good, even light."}</p>
          <button type="button" onClick={() => navigate("/scan")}>
            <RefreshCw size={16} /> New scan
          </button>
        </div>
      </main>
    );
  if (IMAGE_BACKED_VIEWS.has(view) && gate === "waiting")
    return <main className="doodee-app doodee-app--handoff" aria-busy="true" />;
  return (
    <ScanPhotoContext.Provider value={{ url: scanImage, expired: scan?.images_expired === true, demo: scan?.is_demo === true }}>
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

        {/* Profile Card & Plan badge */}
        <button
          className="sidebar-profile"
          type="button"
          onClick={() => openView("profile")}
          aria-label="My profile"
        >
          <CircleUserRound />
          <span>
            <strong>{th ? "โปรไฟล์ของฉัน" : "My Profile"}</strong>
            <small>{planLabel}</small>
          </span>
          <Settings2 />
        </button>

        {/* Quick New Scan CTA */}
        <div className="sidebar-section">
          <button className="sidebar-new sidebar-new--primary" type="button" onClick={() => navigate("/scan")}>
            <Plus /> {th ? "เริ่มสแกนใบหน้า" : "New Face Scan"}
          </button>
        </div>

        {/* Latest Scan Thumbnail */}
        {scanId ? (
          <button
            className="history-card is-active"
            type="button"
            onClick={() => openView("overview")}
          >
            <ScanPhoto alt="Latest scan" />
            <span>
              <strong>{th ? "ผลสแกนล่าสุด" : "Latest Scan"}</strong>
              <small>{scanData.overall === null ? (th ? "กำลังวิเคราะห์…" : "Analysing…") : `Overall ${scanData.overall.toFixed(1)}/10`}</small>
            </span>
            <ArrowRight />
          </button>
        ) : (
          <button className="history-card is-empty" type="button" onClick={() => navigate("/scan")}>
            <span>
              <strong>{th ? "ยังไม่มีผลสแกน" : "No scan yet"}</strong>
              <small>{th ? "ถ่ายสามมุมเพื่อเริ่มต้น" : "Capture three angles"}</small>
            </span>
            <ArrowRight />
          </button>
        )}

        {/* Main 4 Core Hubs Navigation */}
        <nav className="sidebar-nav" aria-label="Dashboard Hubs">
          <span>{th ? "เมนูหลัก" : "Core Features"}</span>
          <button
            className={view === "overview" || view === "analysis" || view === "plan" ? "is-active" : ""}
            type="button"
            onClick={() => openView("overview")}
          >
            <LayoutGrid />
            <span>{th ? "วิเคราะห์รูปหน้า" : "Face Analysis"}</span>
          </button>
          <button
            className={view === "simulate" || view === "tryon" ? "is-active" : ""}
            type="button"
            onClick={() => openView("simulate")}
          >
            <WandSparkles />
            <span>{th ? "สตูดิโอจำลอง" : "Simulation Studio"}</span>
          </button>
          <button
            className={view === "doodeegpt" ? "is-active" : ""}
            type="button"
            onClick={() => openView("doodeegpt")}
          >
            <MessageCircle />
            <span>{th ? "DOODEE AI Chat" : "DOODEE AI Chat"}</span>
          </button>
          <button
            className={view === "pricing" ? "is-active" : ""}
            type="button"
            onClick={() => openView("pricing")}
          >
            <Sparkles />
            <span>{th ? "แพ็กเกจ & สิทธิพิเศษ" : "Plans & Rewards"}</span>
          </button>
        </nav>

        {/* Secondary Navigation Tools */}
        <nav className="sidebar-nav" aria-label="Account Tools">
          <span>{th ? "เครื่องมือ & รางวัล" : "Tools & Rewards"}</span>
          <button
            className={view === "scorecard" ? "is-active" : ""}
            type="button"
            onClick={() => openView("scorecard")}
          >
            <BarChart3 />
            <span>{th ? "การ์ดคะแนน (Percentile)" : "Score Card"}</span>
          </button>
          <button
            className={view === "skin" ? "is-active" : ""}
            type="button"
            onClick={() => openView("skin")}
          >
            <Droplets />
            <span>{th ? "วิเคราะห์ผิว" : "Skin Analysis"}</span>
          </button>
          <button
            className={view === "referral" ? "is-active" : ""}
            type="button"
            onClick={() => openView("referral")}
          >
            <Share2 />
            <span>{th ? "ชวนเพื่อนรับ 30฿" : "Invite (Get 30฿)"}</span>
          </button>
          <button
            className={view === "history" ? "is-active" : ""}
            type="button"
            onClick={() => openView("history")}
          >
            <RefreshCw />
            <span>{th ? "ประวัติการสแกน" : "Scan History"}</span>
          </button>
        </nav>

        <div className="sidebar-foot">
          <button type="button" onClick={() => openView("settings")}>
            <Settings2 size={14} /> {th ? "ตั้งค่าระบบ" : "Settings"}
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
          <nav aria-label="Analysis sections" className="app-topbar-nav">
            <button
              className={view === "overview" || view === "analysis" || view === "plan" ? "is-active" : ""}
              type="button"
              onClick={() => openView("overview")}
            >
              {th ? "วิเคราะห์รูปหน้า" : "Face Analysis"}
            </button>
            <button
              className={view === "simulate" || view === "tryon" ? "is-active" : ""}
              type="button"
              onClick={() => openView("simulate")}
            >
              {th ? "สตูดิโอจำลอง" : "Studio"}
            </button>
            <button
              className={view === "doodeegpt" ? "is-active" : ""}
              type="button"
              onClick={() => openView("doodeegpt")}
            >
              {th ? "DOODEE AI" : "DOODEE AI"}
            </button>
            <button
              className={view === "pricing" ? "is-active" : ""}
              type="button"
              onClick={() => openView("pricing")}
            >
              {th ? "แพ็กเกจ" : "Plans"}
            </button>
          </nav>
          <div className="app-tools">
            {/* 1. Share Button */}
            <button
              type="button"
              className="doodee-tool-btn"
              onClick={share}
              title={th ? "แชร์ผลวิเคราะห์" : "Share Analysis"}
              aria-label="Share"
            >
              <Share2 size={17} />
            </button>

            {/* 2. Language Switcher Button */}
            <button
              type="button"
              className="doodee-lang-toggle"
              onClick={() => chooseLocale(th ? "en" : "th")}
              title={th ? "เปลี่ยนภาษาเป็น English" : "Switch to Thai"}
              aria-label="Switch Language"
            >
              <Globe size={15} />
              <span>{locale.toUpperCase()}</span>
            </button>

            {/* 3. Notifications Bell */}
            <NotificationBell />

            {/* 4. Profile & Settings Menu */}
            <ProfileMenu
              openView={openView}
              planLabel={planLabel}
              th={th}
            />
          </div>
        </header>

        <div className="app-content">
          {view === "overview" && (
            <Overview
              openView={openView}
              onUnlock={() => setUnlockOpen(true)}
            />
          )}
          {view === "analysis" && (
            <Analysis
              openView={openView}
              onUnlock={() => setUnlockOpen(true)}
            />
          )}
          {view === "plan" && (
            <Suspense fallback={<div className="app-view" aria-busy="true" />}>
              <DevelopmentPlanPanel />
            </Suspense>
          )}
          {view === "simulate" && (
            <Suspense fallback={<div className="app-view" aria-busy="true" />}>
              <SimulationView lang={locale} onNavigate={(route: string) => navigate(`/${route}`)} />
            </Suspense>
          )}
          {view === "doodeegpt" && <ChatPanel />}
          <Suspense fallback={<div className="app-view" aria-busy="true" />}>
            {view === "tryon" && <TryOnView lang={locale} />}
            {view === "history" && <HistoryPanel />}
            {view === "pricing" && <PricingPanel />}
            {view === "settings" && <SettingsPanel />}
            {view === "scorecard" && <ScoreCardPanel />}
            {view === "referral" && <ReferralPanel />}
            {view === "profile" && <ProfilePanel />}
            {view === "skin" && <SkinPanel />}
          </Suspense>
        </div>

        {/* Floating Mobile Bottom Navigation Bar */}
        <nav className="doodee-mobile-bottom-bar" aria-label="Mobile Navigation">
          <button
            type="button"
            className={view === "overview" || view === "analysis" ? "is-active" : ""}
            onClick={() => openView("overview")}
          >
            <LayoutGrid size={20} />
            <span>{th ? "วิเคราะห์" : "Analysis"}</span>
          </button>
          <button
            type="button"
            className={view === "simulate" || view === "tryon" ? "is-active" : ""}
            onClick={() => openView("simulate")}
          >
            <WandSparkles size={20} />
            <span>{th ? "จำลอง" : "Studio"}</span>
          </button>
          <button
            type="button"
            className={view === "doodeegpt" ? "is-active" : ""}
            onClick={() => openView("doodeegpt")}
          >
            <MessageCircle size={20} />
            <span>{th ? "AI แชท" : "AI Chat"}</span>
          </button>
          <button
            type="button"
            className={view === "pricing" || view === "profile" || view === "referral" ? "is-active" : ""}
            onClick={() => openView("pricing")}
          >
            <Sparkles size={20} />
            <span>{th ? "แพ็กเกจ" : "Plans"}</span>
          </button>
        </nav>
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
    </ScanPhotoContext.Provider>
  );
}
