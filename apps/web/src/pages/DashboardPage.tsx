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
import { getMetricCatalog, getPlans, getScan, getScanAssessment, getScans, getSession } from "../lib/api";
import { baht } from "../lib/referral";
import { errorMessage } from "../lib/apiError";
import { dashboardGate } from "../lib/dashboardGate";
import { describeScanFailure } from "../lib/scanFailure";
import { statusPollInterval } from "../lib/pollInterval.js";
import type { InsightRow, RatioRow } from "../lib/dashboardData";
import {
  CATALOG_SIZE,
  catalogAvailability,
  type CatalogEntry,
  improvementsFor,
  overallScore,
  pillarsFor,
  ratioRows,
  METRIC_SIMULATION_REGION,
  METRIC_VIEW,
  type ReferenceCohort,
  referenceCohortFor,
  strengthsFor,
  type ViewScore,
  viewScoresFor,
} from "../lib/dashboardData";
import { curvePath, type Distribution, scoreX } from "../lib/distributionCurve";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  CircleUserRound,
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
  Droplets,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import Brand from "../Brand";
import NotificationBell from "../components/NotificationBell";
import { latestCraniofacialScan } from "../lib/latestScan";
import { coverFit } from "../lib/makeupGeometry.js";
import { allSegments, referenceSegments, viewGeometry } from "../lib/metricLines.js";

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
  | "assessment"
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
  assessment: "/assessment",
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
  { id: "assessment", label: "Assessment" },
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
  views: ReturnType<typeof viewScoresFor>;
  cohort: ReferenceCohort;
  availability: ReturnType<typeof catalogAvailability>;
  /**
   * The stored analysis itself, for the one thing derived rows cannot carry: the coordinates
   * each measurement was taken between. `lib/metricLines` reads `metric_geometry` off this.
   */
  analysisData: Record<string, unknown> | null;
};

const emptyScanData: ScanData = {
  pillars: pillarsFor(null),
  rows: [],
  strengths: [],
  improvements: [],
  overall: null,
  views: viewScoresFor(null),
  cohort: referenceCohortFor(null),
  availability: catalogAvailability(null),
  analysisData: null,
};

/** Shared row shape for the strengths and improvements cards. `lib/dashboardData` builds them. */
type InsightItem = InsightRow;

/** How many insight rows are visible before the card is expanded. */
const INSIGHT_PREVIEW = 3;

/** How many ratio rows a partial-depth plan may read. See `analysisRedacted` in `Analysis`. */
const FREE_RATIO_ROWS = 3;

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
type ScanPhotoState = { views: Record<string, string>; expired: boolean };
const ScanPhotoContext = createContext<ScanPhotoState>({ views: {}, expired: false });

/**
 * Which stored photograph the word "side" refers to on this scan.
 *
 * The order `ScanSerializer.side_url` uses, so this screen and the score card can never show two
 * different profiles for one scan. Null when no profile was captured — a front-only scan has no
 * side photograph, and there is nothing to substitute for it.
 */
const PROFILE_VIEWS = ["left_profile", "right_profile", "left_oblique", "right_oblique"] as const;
const profileViewKey = (views: Record<string, string>) =>
  PROFILE_VIEWS.find((view) => views[view]) ?? null;

/** Resolves an on-screen angle to the stored view whose photograph it names. */
const photoViewKey = (views: Record<string, string>, angle: FaceAngle) =>
  angle === "front" ? (views.front ? "front" : null) : profileViewKey(views);

/**
 * One of the scan's photographs, named by the angle it is meant to be.
 *
 * The angle is load-bearing rather than decorative. Every ScanPhoto on this screen used to read
 * one `front_url` out of context, so the Side button, the "ด้านข้าง" figure on the overall card
 * and the whole `analysis-face-card--side` panel were the *front* photograph — panned and scaled
 * 1.16x by a CSS rule written to make it pass for a profile. `view_urls` carries a signed link
 * per captured view (`ScanSerializer.get_view_urls`), so the side is now the side, and a scan
 * with no profile says so instead of showing the front face again under a different label.
 */
function ScanPhoto({
  alt,
  className,
  angle = "front",
  style,
}: {
  alt: string;
  className?: string;
  angle?: FaceAngle;
  style?: React.CSSProperties;
}) {
  const { views, expired } = useContext(ScanPhotoContext);
  const { locale } = useLocale();
  const th = locale !== "en";
  const key = photoViewKey(views, angle);
  if (key) return <img src={views[key]} alt={alt} className={className} style={style} />;
  // Three absences, three sentences. A deleted photo is the privacy promise being kept, a
  // missing profile is a scan that was only ever taken from the front, and everything else is a
  // signing failure worth a refresh.
  const missingProfile = angle === "side" && Boolean(views.front);
  const title = expired
    ? th ? "ภาพถูกลบแล้ว" : "Photo deleted"
    : missingProfile
      ? th ? "ไม่มีภาพด้านข้าง" : "No side photo"
      : th ? "โหลดภาพไม่ได้" : "Photo unavailable";
  const detail = expired
    ? th ? "ตามกำหนด 30 วัน ค่าที่วัดได้ยังอยู่ครบ" : "On schedule after 30 days. Your measurements are still here."
    : missingProfile
      ? th ? "สแกนนี้ถ่ายเฉพาะหน้าตรง" : "This scan was captured from the front only."
      : th ? "ลองรีเฟรชหน้านี้อีกครั้ง" : "Try refreshing the page.";
  return (
    <span className={`scan-photo-placeholder ${className || ""}`} role="img" aria-label={`${alt} — ${title}. ${detail}`}>
      {expired ? <ShieldCheck aria-hidden="true" /> : <ImageOff aria-hidden="true" />}
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

/**
 * The two ranked lists, and the three numbers that used to be written into them.
 *
 * The counter read "3 of 18" and the button "Show 15 more". This scan is scored on twelve
 * measurements at most, both cards rank the same twelve, and neither eighteen nor fifteen exists
 * anywhere in the system — nor did pressing the button ever add a row, because the caller handed
 * this component exactly three items and expanding only changed the label. Every figure here is
 * now `items.length`, which is the ranking it was actually given.
 *
 * The third was the status chip: a strength has no severity of its own, so the fallback printed
 * "Ideal" on every one of them. `deviationStatus` never returns that word and the scorer never
 * makes that claim — the closest it says is that a measurement sits near a published mean. Both
 * cards now carry the real band, so there is nothing left to fall back to.
 */
function InsightList({
  kind,
  items,
}: {
  kind: "strength" | "improve";
  items: InsightItem[];
}) {
  const [open, setOpen] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const { locale } = useLocale();
  const th = locale !== "en";
  const visible = expanded ? items : items.slice(0, INSIGHT_PREVIEW);
  const hidden = items.length - visible.length;
  if (!items.length) return null;
  return (
    <GlassCard className={`insight-panel insight-panel--${kind}`}>
      <header>
        <div>
          {/* The wording AssessmentView uses for the same two rankings. "What already works" is a
              verdict on a face; what these actually rank is distance from a published mean. */}
          <span className="eyebrow">
            {kind === "strength"
              ? th ? "ใกล้ค่าอ้างอิง" : "Closest to the reference"
              : th ? "ต่างจากค่าอ้างอิง" : "Furthest from the reference"}
          </span>
          <h2>
            {kind === "strength"
              ? th ? "ค่าที่ใกล้ค่าเฉลี่ยที่ตีพิมพ์ที่สุด" : "Nearest the published means."
              : th ? "ค่าที่ห่างจากค่าเฉลี่ยที่ตีพิมพ์ที่สุด" : "Furthest from the published means."}
          </h2>
        </div>
        <span className="insight-count">
          {th
            ? `${visible.length} จาก ${items.length} ค่า`
            : `${visible.length} of ${items.length} measured`}
        </span>
      </header>
      <div className="insight-list">
        {visible.map((item, index) => (
          <button
            className={open === index ? "is-open" : ""}
            type="button"
            onClick={() => setOpen(open === index ? -1 : index)}
            key={item.name}
          >
            <span className="insight-status">{item.level}</span>
            <strong>{item.name}</strong>
            <b>
              {item.score}
              <small>{item.scoreUnit}</small>
            </b>
            <ChevronDown />
            <div className="insight-detail">
              <p>{item.detail}</p>
              <small>{th ? "ค่าที่วัดได้" : "Measured against"}</small>
              {item.ratios.map((ratio) => (
                <span key={ratio}>{ratio}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
      {/* Absent rather than inert once everything fits, which is the normal case on a scan with
          few scored measurements. */}
      {(hidden > 0 || expanded) && (
        <button
          className="insight-more"
          type="button"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? th ? "แสดงน้อยลง" : "Show fewer"
            : th ? `แสดงอีก ${hidden} ค่า` : `Show ${hidden} more`}
          <ChevronDown />
        </button>
      )}
    </GlassCard>
  );
}

/* A locked score, shown as a blurred spinning reel rather than a dash.
 *
 * Ported from project-qijek. Presentational only — it renders no value, because
 * there is none to render: `lib/dashboardData.ts` reports anything the backend
 * could not score as locked instead of inventing a number, and this must not be
 * the place that quietly invents one. The digits are decoration behind a blur,
 * marked aria-hidden, with the real meaning carried by the aria-label. */
/** The subset of GET /plans/ this screen reads. Mirrors PricingPanel's shape. */
type PlanRow = {
  code: string;
  name_th: string;
  name_en: string;
  // Served by `PlanSerializer` and edited in the admin. The unlock dialog renders this instead of
  // the sentence that used to be written here, which promised things the system does not do.
  description_th: string;
  description_en: string;
  price_satang: number;
  interval: string;
  self_serve: boolean;
};

const lockedReelDigits = ["7", "2", "9", "4", "1", "8", "3", "6", "0", "5", "7"];

function LockedNumber({
  suffix = "/10",
  compact = false,
}: {
  suffix?: string;
  compact?: boolean;
}) {
  const { locale } = useLocale();
  return (
    <span
      className={`locked-number ${compact ? "locked-number--compact" : ""}`}
      aria-label={locale === "th" ? "คะแนนที่ยังไม่ปลดล็อก" : "Locked numeric result"}
    >
      <span className="locked-number__blur" aria-hidden="true">
        <span className="locked-number__reel locked-number__reel--first">
          <span>
            {lockedReelDigits.map((digit, index) => (
              <i key={`a-${index}`}>{digit}</i>
            ))}
          </span>
        </span>
        <span className="locked-number__dot">.</span>
        <span className="locked-number__reel locked-number__reel--second">
          <span>
            {lockedReelDigits.map((digit, index) => (
              <i key={`b-${index}`}>{digit}</i>
            ))}
          </span>
        </span>
      </span>
      {suffix && <small aria-hidden="true">{suffix}</small>}
    </span>
  );
}

/* Where this face's overall score sits among the scores this deployment holds.
 *
 * The shape is `distribution.curve` off `GET /scans/<id>/assessment/` — a kernel
 * density estimate of one score per person, which is what the assessment screen
 * plots from the same payload. It replaces a fixed decorative bell: that path was
 * the same drawing for everybody, sitting under a card headed "Overall score" and
 * flanked by a "Lower / Reference range / Higher" legend, which is a picture of a
 * population rather than one. With two users the real curve is two bumps, and two
 * bumps is what two users look like.
 *
 * The marker is the reader's own score on the same 0–100 axis the curve is drawn
 * on. It used to be their *similarity percentile*, mapped across a curve of no
 * particular axis at all; the two numbers answer different questions and cannot
 * share a scale. With no score the curve draws unmarked rather than defaulting to
 * the middle, which would quietly tell every viewer they are average.
 *
 * The box matches the old path's extents exactly so the card looks unchanged. */
const CURVE_BOX = { left: 42, right: 718, baseline: 174, peak: 38 };
const CURVE_FLOOR = 200;

function ScoreCurve({
  distribution,
  score,
  label,
}: {
  distribution: Distribution | undefined;
  score: number | null;
  label: string | null;
}) {
  const path = curvePath(distribution?.curve, CURVE_BOX);
  // Nothing measured, nothing drawn. An empty axis is honest; a bell with no sample
  // behind it is the thing this card was showing before.
  if (!path) return null;
  const x = score === null ? null : scoreX(score, CURVE_BOX);
  return (
    <svg
      className="score-curve"
      viewBox="0 0 760 220"
      role="img"
      aria-label={label ?? "Score distribution"}
    >
      <defs>
        <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1687ff" stopOpacity=".2" />
          <stop offset="1" stopColor="#1687ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="score-curve__grid" d="M40 174H720M40 128H720M40 82H720" />
      <path
        className="score-curve__fill"
        d={`${path}V${CURVE_FLOOR}H${CURVE_BOX.left}Z`}
      />
      <path className="score-curve__line" d={path} />
      {x !== null && (
        <>
          <line className="score-curve__marker" x1={x} y1="80" x2={x} y2="181" />
          <circle cx={x} cy="145" r="7" />
          {label && (
            <text x={x} y="66" textAnchor="middle">
              {label}
            </text>
          )}
        </>
      )}
    </svg>
  );
}

function Overview({
  scanId,
  openView,
  onUnlock,
}: {
  scanId: string | undefined;
  openView: (view: AppView) => void;
  onUnlock: () => void;
}) {
  const { pillars, strengths, improvements } = useScanData();
  const { locale } = useLocale();
  const th = locale !== "en";

  const unlockedCount = pillars.filter((item) => !item.locked).length;
  // Summed off the pillars rather than read from `coverage`, so the number under the overall score
  // and the numbers under each pillar chip can never disagree: they come from one count.
  const scoredMetrics = pillars.reduce((total, item) => total + item.metricCount, 0);
  // The pillar the card headlines. qijek hardcodes `pillars[0]` and marks "harmony"
  // active; here it is whichever pillar is actually readable, so an account whose
  // first pillar is locked does not get a headline with nothing under it.
  const current = pillars.find((item) => !item.locked) ?? pillars[0];

  // The curve. Same query key AssessmentView uses, so opening the assessment
  // costs nothing and the two screens draw one shape from one payload.
  const assessment = useQuery({
    queryKey: ["assessment", scanId],
    queryFn: () => getScanAssessment(scanId),
    enabled: Boolean(scanId),
  });
  const assessmentData = assessment.data as
    | { overall_score?: number | null; distribution?: Distribution }
    | undefined;
  const distribution = assessmentData?.distribution;
  const overall = typeof assessmentData?.overall_score === "number" ? assessmentData.overall_score : null;
  // The count travels with the shape, in the legend rather than a footnote: a curve
  // that does not say how many people are in it looks identical whether it is six or
  // six hundred. Below `reliable_at` the screen says so instead of implying a rank.
  const drawn = distribution?.drawn_sample_size ?? 0;
  const curveCaption = assessment.isPending
    ? // Nothing yet, rather than "no scores to compare against": a request in flight is not an
      // empty population, and for the second or so it takes they look identical on screen.
      ""
    : !distribution?.curve?.length
    ? th
      ? "ยังไม่มีคะแนนให้เทียบ"
      : "No scores to compare against yet"
    : distribution.reliable === false
      ? th
        ? `จาก ${drawn} คะแนน · ยังน้อยกว่า ${distribution.reliable_at} จึงเป็นการเทียบคร่าว ๆ`
        : `${drawn} scores · fewer than ${distribution.reliable_at}, so a rough comparison`
      : th
        ? `จาก ${drawn} คะแนน`
        : `${drawn} scores`;

  return (
    <div className="app-view app-overview">
      <section className="app-pillar-grid" aria-label={th ? "คะแนนรายมิติ" : "Score pillars"}>
        {pillars.map((item) => (
          <button
            className={`pillar-card app-glass ${item.id === current?.id ? "is-active" : ""} ${item.locked ? "is-locked" : ""}`}
            data-pillar={item.id}
            type="button"
            // A pillar nothing can measure must not open the pricing modal. Paying would not
            // reveal it, because no published reference measures it — offering the upgrade there
            // is selling something that does not exist.
            disabled={item.lockReason === "unmeasurable"}
            title={item.lockReason === "unmeasurable" ? item.note : undefined}
            onClick={() =>
              item.lockReason === "unmeasurable"
                ? undefined
                : item.locked
                  ? onUnlock()
                  : openView("analysis")
            }
            key={item.id}
          >
            <span className={`pillar-art pillar-art--${item.id}`} aria-hidden="true" />
            <span className="pillar-card__head">
              <i className={`pillar-mark pillar-mark--${item.id}`} />
              {item.label}
              <ArrowRight />
            </span>
            {/* A blurred number is a promise that a number exists behind it. For `unmeasurable`
                none does, so the card shows an em dash and says why, rather than teasing a score
                no plan and no rescan will ever reveal. */}
            <strong
              className={
                !item.locked
                  ? undefined
                  : item.lockReason === "unmeasurable"
                    ? "pillar-score--none"
                    : "locked-score-shell"
              }
            >
              {item.locked ? (
                item.lockReason === "unmeasurable" ? (
                  "—"
                ) : (
                  <LockedNumber />
                )
              ) : (
                <>
                  {item.score}
                  <small>/10</small>
                </>
              )}
            </strong>
            {/* How many measurements the score rests on. Without it a 9.9 from two numbers sits
                beside an overall of 7.8 from twelve and reads as the more confident of the two;
                a reader asked which one was fabricated, and the honest answer was that both were
                real and the page had not said what either was made of. `pillarsFor` was already
                computing the count. */}
            {!item.locked && item.metricCount > 0 && (
              <span className="pillar-basis">
                {th ? `จาก ${item.metricCount} ค่าวัด` : `from ${item.metricCount} measurements`}
              </span>
            )}
            {item.locked ? (
              <span className="pillar-unlock">
                {item.lockReason === "unmeasurable" ? (
                  th ? "ยังไม่มีค่ามาตรฐานให้เทียบ" : "No published reference"
                ) : (
                  <>
                    <LockKeyhole /> {th ? "ปลดล็อกคะแนน" : "Unlock your score"}
                  </>
                )}
              </span>
            ) : (
              <span className="pillar-unlock pillar-unlock--open">
                <ArrowRight />{" "}
                {th ? `ดูค่าที่วัดได้ · ${item.label}` : `View ${item.label} ratios`}
              </span>
            )}
          </button>
        ))}
      </section>

      <GlassCard className="overall-card">
        <header>
          <div>
            {/* This card shows the overall score, which is what the chart beside it has always
                plotted and what its marker reads. It used to print `current.score` — whichever
                pillar happened to be selected — under a heading that said "Overall score", so a
                reader saw 9.9 here and 7.8 on the marker an inch away and asked which was made
                up. Neither was: 9.9 was one pillar built on two measurements, 7.8 the average of
                all of them. The pillar's own figure is on its chip above, next to the number of
                measurements behind it, which is where a per-pillar score belongs. */}
            <span className="eyebrow">{th ? "คะแนนภาพรวม" : "Overall score"}</span>
            <h1>{th ? "ใบหน้าของคุณเทียบค่าอ้างอิง" : "Your face against the reference"}</h1>
          </div>
          <span className="overall-card__count">
            {th
              ? `${unlockedCount} จาก ${pillars.length} มิติ`
              : `${unlockedCount} of ${pillars.length} pillars`}
          </span>
        </header>
        <div className="overall-card__body">
          <div className="overall-score">
            <strong>{overall === null ? "—" : (overall / 10).toFixed(1)}</strong>
            <span>/10</span>
            {/* What the average was taken over. A score with no basis printed beside it invites
                exactly the comparison that went wrong here — two numbers that look equally solid
                when one rests on six times as many measurements as the other. */}
            <p>{overall === null
              ? (th ? "สแกนนี้ยังไม่มีคะแนนภาพรวม" : "This scan has no overall score yet")
              : th
                ? `เฉลี่ยจากค่าที่วัดได้ ${scoredMetrics} ค่า ใน ${unlockedCount} มิติ`
                : `Averaged across ${scoredMetrics} measurements in ${unlockedCount} pillars`}</p>
            <div className="score-portrait-pair">
              <figure>
                <ScanPhoto alt={th ? "ภาพหน้าตรงของคุณ" : "Your front scan"} />
                <figcaption>{th ? "หน้าตรง" : "Front"}</figcaption>
              </figure>
              <figure>
                <ScanPhoto
                  alt={th ? "ภาพด้านข้างของคุณ" : "Your side scan"}
                  className="is-side"
                  angle="side"
                />
                <figcaption>{th ? "ด้านข้าง" : "Side"}</figcaption>
              </figure>
            </div>
          </div>
          <div className="overall-distribution">
            <div>
              <ScoreCurve
                distribution={distribution}
                score={overall}
                label={
                  overall === null
                    ? null
                    : th
                      ? `คุณ · ${(overall / 10).toFixed(1)}`
                      : `YOU · ${(overall / 10).toFixed(1)}`
                }
              />
              {/* The axis is the 0–100 score the curve is drawn over, so its ends are
                  labelled with the numbers they are. It used to read
                  "Lower / Reference range / Higher", which described a published
                  cohort that was never the thing being plotted. */}
              <div className="curve-legend">
                <span>0</span>
                <span>{curveCaption}</span>
                <span>100</span>
              </div>
            </div>
            {/* The unlock button that used to sit here is gone with the bell it sat
                on. It offered the reference-similarity percentile, which is real and
                genuinely gated — but `_redact_assessment` does not withhold the
                distribution, so a lock centred over this curve would say the chart is
                paid for when it is not. The figure and its own CTA live on the score
                card, which the sidebar links to; bring the button back here only if
                something on this card actually becomes entitlement-gated. */}
          </div>
        </div>
      </GlassCard>

      <section className="insight-grid">
        <InsightList kind="strength" items={strengths} />
        <InsightList kind="improve" items={improvements} />
      </section>
    </div>
  );
}

/* The tab strip, and what happened to the three tabs that used to render nothing.
 *
 * "Simulate", "Celebrities" and "Edit" each opened a card holding an icon, a heading and a
 * sentence describing a feature — an illustrative before/after, a set of faces to compare the
 * ratio range against, a control for correcting a mis-detected landmark. None of the three had
 * any code behind it, and a tab whose only content is a description of itself is an
 * advertisement inside a paid screen that the reader cannot tell from a feature which failed to
 * load.
 *
 * "Celebrities" is now "Reference cohort". There is no celebrity facial-measurement data in
 * either repository, so building that tab truthfully would have meant running photographs of
 * named public figures through the pipeline ourselves — likeness and publicity-rights exposure
 * on a product that charges money — and fabricating the numbers instead is the mock being
 * removed. The published Thai cohort answers the question the reader actually has: how do my
 * proportions sit against other people's? It is real, already computed on every scan, and
 * legally clean. Renamed rather than left under the old label, because a tab called Celebrities
 * that shows reference data is its own small lie.
 *
 * "Simulate" is a real link now, but only for the four measurements that feed a region the
 * simulator can aim at (`reference_scoring.REFERENCE_TARGETS`, mirrored as
 * `METRIC_SIMULATION_REGION`). For the other eight there is no published target to move toward,
 * so the tab is absent rather than present-and-inert.
 *
 * "Edit" stays out. It is the landmark-correction screen, a separate port that has not started;
 * bring the tab back when that screen exists and there is an endpoint that accepts a corrected
 * landmark and rescores against it. Nothing supports it today — landmarks are re-detected on
 * demand and never stored (views.py:1155) — so an Edit tab can only describe itself.
 */
const RATIO_TABS = ["overview", "reference", "simulate"] as const;
type RatioTab = (typeof RATIO_TABS)[number];

const RATIO_MODAL_COPY = {
  th: {
    close: "ปิด",
    closeDetails: "ปิดรายละเอียดสัดส่วน",
    photoAlt: (name: string) => `ค่าที่วัดได้ของ${name}`,
    score: "คะแนน",
    reference: "ตรงค่าอ้างอิง",
    // The two ends of the score bar. `metric_score` is 100 - 20|z|, so the right end is the
    // published mean and the left is five standard deviations from it.
    farFromReference: "ห่าง 5 SD",
    ideal: (value: string) => `ค่าอ้างอิง ${value}`,
    tabs: { overview: "ภาพรวม", reference: "กลุ่มอ้างอิง", simulate: "จำลอง" },
    about: "เกี่ยวกับสัดส่วนนี้",
    mayIndicate: "อาจบ่งบอกถึง",
    affected: "ค่าที่เกี่ยวข้อง",
    comparison: "ค่าของคุณเทียบเกณฑ์",
    comparisonBody: (observed: string, reference: string) => `ค่าที่วัดได้ ${observed} · ค่าอ้างอิง ${reference}`,
    deviation: (z: string) => `ห่างจากค่าเฉลี่ย ${z} SD`,
    cohort: "กลุ่มอ้างอิง",
    // The population name comes from the study and is English ("Thai adults"), so it is listed as
    // a value rather than folded into the sentence — translating it here would be inventing a
    // cohort name the source never used.
    cohortBody: (count: number, population: string, ageRange: string) =>
      `ค่าเฉลี่ยที่ตีพิมพ์จาก ${count} คน · ${population} · อายุ ${ageRange} ปี`,
    cohortUnknown: "ผลสแกนนี้ไม่ได้บันทึกไว้ว่าใช้กลุ่มอ้างอิงใด จึงบอกไม่ได้ว่าเทียบกับใคร",
    cohortSource: "ที่มาของค่าอ้างอิง",
    reading: "อ่านค่านี้อย่างไร",
    readingBody: "เป็นความใกล้เคียงกับค่าเฉลี่ยที่ตีพิมพ์ ไม่ใช่คะแนนความสวย และไม่ใช่การวินิจฉัย",
    outsideAge: "คุณอยู่นอกช่วงอายุของกลุ่มอ้างอิง คะแนนไม่ได้ปรับตามอายุ",
    outsidePopulation: "ค่าอ้างอิงมาจากประชากรไทย ไม่ได้ปรับตามประเทศที่คุณเลือก",
    simulateTitle: "ดูค่านี้ในสตูดิโอจำลอง",
    simulateBody: (region: string) =>
      `ค่านี้เป็นหนึ่งในค่าที่ใช้คำนวณเป้าหมายของบริเวณ${region} เปิดโหมดเทียบค่าอ้างอิงเพื่อดูภาพจำลอง`,
    simulateAction: "เปิดสตูดิโอจำลอง",
    regions: { nose: "จมูก", lips: "ริมฝีปาก", chin: "คาง" },
  },
  en: {
    close: "Close",
    closeDetails: "Close ratio details",
    photoAlt: (name: string) => `Your ${name} measurement`,
    score: "Score",
    reference: "At the reference",
    // The two ends of the score bar. `metric_score` is 100 - 20|z|, so the right end is the
    // published mean and the left is five standard deviations from it.
    farFromReference: "5 SD away",
    ideal: (value: string) => `Ideal ${value}`,
    tabs: { overview: "Overview", reference: "Reference cohort", simulate: "Simulate" },
    about: "About this ratio",
    mayIndicate: "May indicate",
    affected: "Affected measurements",
    comparison: "Your value against the reference",
    comparisonBody: (observed: string, reference: string) => `Measured ${observed} · Reference ${reference}`,
    deviation: (z: string) => `${z} SD from the mean`,
    cohort: "Reference cohort",
    cohortBody: (count: number, population: string, ageRange: string) =>
      `Published means from ${count} ${population}, aged ${ageRange}`,
    cohortUnknown: "This scan did not record which cohort it was scored against, so there is nobody to name.",
    cohortSource: "Source",
    reading: "How to read this",
    readingBody: "Closeness to a published mean, not an attractiveness score and not a diagnosis.",
    outsideAge: "You are outside the reference age range, and the score is not adjusted for that.",
    outsidePopulation: "The reference values are Thai and are not adjusted for the country you selected.",
    simulateTitle: "Open this in the simulation studio",
    simulateBody: (region: string) =>
      `This measurement is one of the values behind the ${region} reference target. Reference mode shows an illustrative render of it.`,
    simulateAction: "Open the simulation studio",
    regions: { nose: "nose", lips: "lips", chin: "chin" },
  },
} as const;

/** A signed z, printed the way the improvements card prints it, so the sign always shows. */
const signedDeviation = (z: number) => {
  const rounded = Math.round(z * 10) / 10;
  return rounded > 0 ? `+${rounded}` : String(rounded);
};

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
  const navigate = useNavigate();
  const c = RATIO_MODAL_COPY[locale === "en" ? "en" : "th"];
  const { cohort } = useScanData();
  const [tab, setTab] = useState<RatioTab>("overview");
  // The measurement only gets a Simulate tab if it feeds a region the simulator has a published
  // target for. Eight of the twelve do not, and for those the tab is not rendered at all.
  const region = METRIC_SIMULATION_REGION[metric.id];
  const tabs = RATIO_TABS.filter((item) => item !== "simulate" || region);
  const openSimulation = () => {
    // The scan being read, when the analysis screen was opened on a specific one — otherwise the
    // studio would silently switch to the latest scan and simulate a different face.
    const scanId = new URLSearchParams(window.location.search).get("scan_id");
    const query = new URLSearchParams({ region, target: "reference" });
    if (scanId) query.set("scan_id", scanId);
    navigate(`${VIEW_ROUTES.simulate}?${query}`);
  };
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
            {/* The photograph this measurement was read off, not whichever one was to hand.
                Three of the twelve are profile angles, and showing a front face beside a
                nasolabial angle says the angle was measured there. */}
            <ScanPhoto alt={c.photoAlt(metric.name)} angle={METRIC_VIEW[metric.id] ?? "front"} />
            <span>{metric.value}</span>
          </figure>
          <div className="ratio-modal__score">
            <span className="eyebrow">{c.score}</span>
            <strong>
              {metric.score.toFixed(1)}
              <small>/10</small>
            </strong>
            {/* Where the marker sits, and what the ends of the bar mean.
                `metric_score` is `100 - 20|z|`, so the right-hand end of this bar is the
                published mean itself and the left is five standard deviations off it. The
                "Reference" caption was pinned to the midpoint by the stylesheet, which put the
                reference where a score of 5.0 sits and made every reading of this bar wrong by
                half its width. The marker was also clamped into 8-92%, so a 0.0 and a 0.8 landed
                on the same pixel — a floor and a ceiling on a figure that has neither. */}
            <div className="ratio-range">
              <i style={{ left: `${metric.score * 10}%` }} />
              <span style={{ left: 0, transform: "none" }}>{c.farFromReference}</span>
              <span style={{ left: "100%", transform: "translateX(-100%)" }}>{c.reference}</span>
            </div>
            <b>{metric.value}</b>
            <p>{c.ideal(metric.ideal)}</p>
          </div>
        </div>
        {/* The stylesheet lays this strip out as `repeat(4,1fr)`, from when there were four
            tabs. There are two or three now depending on the measurement, and a fixed four
            columns left the last one or two quarters as blank strip. Counted here rather than
            pinned in CSS so the strip follows the tabs that actually render. */}
        <nav style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map((item) => (
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
        ) : tab === "reference" ? (
          <div className="ratio-modal__content">
            <div>
              <span className="eyebrow">{c.comparison}</span>
              <p>{c.comparisonBody(metric.value, metric.ideal)}</p>
              <div className="ratio-chips">
                <span>{c.deviation(signedDeviation(metric.normalizedDeviation))}</span>
                <span>{metric.status}</span>
              </div>
            </div>
            <div>
              <span className="eyebrow">{c.cohort}</span>
              {/* Named, never implied. "Compared against the reference" is not a comparison the
                  reader can weigh until they can see which population, which age band and how
                  many people — and a scan that did not record its cohort says so instead of
                  borrowing the current one, which may not be what it was scored against. */}
              <p>
                {cohort.known
                  ? c.cohortBody(cohort.sampleSize!, cohort.population!, cohort.ageRange ?? "—")
                  : c.cohortUnknown}
              </p>
              {cohort.source && (
                <div className="ratio-chips">
                  {/* Inside a chip span so it picks up the chip's own size and padding rather
                      than sitting at body size beside them. A citation nobody can follow is a
                      weaker claim than one they can, so the link is the study itself. */}
                  <span>
                    <a href={cohort.source} target="_blank" rel="noreferrer">
                      {c.cohortSource}
                    </a>
                  </span>
                  {cohort.version && <span>{cohort.version}</span>}
                </div>
              )}
            </div>
            <div>
              <span className="eyebrow">{c.reading}</span>
              <p>{c.readingBody}</p>
              {/* The score is never rescaled for either mismatch, so a reader outside the cohort
                  has to be told the number was computed against people unlike them. Same two
                  flags, and the same wording, AssessmentView shows above its findings. */}
              {cohort.outsideAgeRange && <p><strong>{c.outsideAge}</strong></p>}
              {cohort.outsidePopulation && <p><strong>{c.outsidePopulation}</strong></p>}
            </div>
          </div>
        ) : (
          <div className="ratio-modal__empty">
            <WandSparkles />
            <h3>{c.simulateTitle}</h3>
            <p>{c.simulateBody(c.regions[region])}</p>
            <button type="button" onClick={openSimulation}>
              {c.simulateAction}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function MeasurementLibrary({ onUnlock }: { onUnlock: () => void }) {
  const { availability } = useScanData();
  const { locale } = useLocale();
  const th = locale !== "en";
  // Served, not hardcoded. This screen used to render a 102-entry list written into the client,
  // of which exactly twelve could be filled in — matched by lowercasing the English display name
  // against a lookup table. The server now serves the catalogue it actually measures against,
  // and every row says what backs it and, when nothing does, why not.
  const catalog = useQuery<{
    items: CatalogEntry[];
    groups: { key: string; name_th: string; name_en: string }[];
    coverage: { measured: number; not_measured: number; with_reference: number; from_skin_scan: number };
  }>({ queryKey: ["metric-catalog"], queryFn: getMetricCatalog });
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("All");
  const [status, setStatus] = useState<"All" | "measured" | "not_measured">("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items: CatalogEntry[] = catalog.data?.items ?? [];
  const groups: { key: string; name_th: string; name_en: string }[] = catalog.data?.groups ?? [];
  const coverage = catalog.data?.coverage;
  const groupName = (key: string) => {
    const found = groups.find((item) => item.key === key);
    return found ? (th ? found.name_th : found.name_en) : key;
  };

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (group === "All" || item.group === group) &&
        (status === "All" || item.status === status) &&
        (!term ||
          item.name_th.toLowerCase().includes(term) ||
          item.name_en.toLowerCase().includes(term)),
    );
  }, [items, group, status, query]);

  const selected = items.find((item) => item.id === selectedId) ?? filtered[0] ?? items[0] ?? null;
  const scoredRow = selected ? availability.scoredFor(selected) : null;
  const measuredRow = selected && !scoredRow ? availability.measuredFor(selected) : null;

  if (catalog.isPending) {
    return (
      <section className="metric-library" aria-label="Measurement library">
        <GlassCard className="metric-library__head">
          <div><p>{th ? "กำลังโหลดรายการที่วัดได้…" : "Loading the measurement catalogue…"}</p></div>
        </GlassCard>
      </section>
    );
  }

  return (
    <section className="metric-library" aria-label="Measurement library">
      <GlassCard className="metric-library__head">
        <div>
          <span className="eyebrow">Measurement library</span>
          <h1>{th ? `${items.length} ลักษณะที่พูดถึง` : `${items.length} characteristics`}</h1>
          {/* Two different numbers, and conflating them is what the old screen did. `measured`
              is what this product can read at all; `availableCount` is what *this scan* has a
              published reference to be scored against. */}
          <p>{th
            ? `วัดได้ ${coverage?.measured ?? 0} รายการ · มีค่าอ้างอิงให้เทียบ ${coverage?.with_reference ?? 0} รายการ · สแกนนี้ให้คะแนนได้ ${availability.availableCount} ค่า`
            : `${coverage?.measured ?? 0} can be measured · ${coverage?.with_reference ?? 0} have a published reference · this scan scored ${availability.availableCount}`}</p>
        </div>
        <dl>
          <div>
            <dt>{th ? "วัดได้" : "Measured"}</dt>
            <dd>{coverage?.measured ?? 0}</dd>
          </div>
          <div>
            <dt>{th ? "ยังวัดไม่ได้" : "Not measured"}</dt>
            <dd>{coverage?.not_measured ?? 0}</dd>
          </div>
          <div>
            <dt>{th ? "ต้องสแกนผิว" : "Needs a skin scan"}</dt>
            <dd>{coverage?.from_skin_scan ?? 0}</dd>
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
              placeholder={th ? "ค้นหา" : "Search measurements"}
              aria-label="Search measurements"
            />
          </label>
          {/* Was "landmark / needs scale / side profile" — three labels invented on the client
              that nothing on the server ever agreed to. This filter is the server's own
              `status`, which is derived from whether anything actually backs the row. */}
          <div className="metric-methods" aria-label="Measurement status">
            {(["All", "measured", "not_measured"] as const).map((item) => (
              <button
                className={status === item ? "is-active" : ""}
                type="button"
                onClick={() => setStatus(item)}
                key={item}
              >
                {item === "All" ? (th ? "ทั้งหมด" : "All")
                  : item === "measured" ? (th ? "วัดได้" : "Measured")
                    : (th ? "ยังวัดไม่ได้" : "Not measured")}
              </button>
            ))}
          </div>
        </div>
        <div className="metric-groups" aria-label="Measurement categories">
          {["All", ...groups.map((item) => item.key)].map((item) => (
            <button
              className={group === item ? "is-active" : ""}
              type="button"
              onClick={() => setGroup(item)}
              key={item}
            >
              {item === "All" ? (th ? "ทั้งหมด" : "All") : groupName(item)}
            </button>
          ))}
        </div>
        <div className="metric-library__body">
          <div className="metric-catalog">
            {filtered.map((item) => (
              <button
                className={selected?.id === item.id ? "is-active" : ""}
                type="button"
                onClick={() => setSelectedId(item.id)}
                key={item.id}
              >
                <span>{String(item.number).padStart(3, "0")}</span>
                <div>
                  <strong>{th ? item.name_th : item.name_en}</strong>
                  <small>{groupName(item.group)}</small>
                </div>
                <em className={`metric-method metric-method--${item.status === "measured" ? "landmark" : "scale"}`}>
                  {item.status === "measured" ? (th ? "วัดได้" : "Measured") : (th ? "ยังวัดไม่ได้" : "Not measured")}
                </em>
                <ChevronDown />
              </button>
            ))}
            {!filtered.length && (
              <div className="metric-catalog__empty">
                <Search />
                <strong>{th ? "ไม่พบรายการที่ตรง" : "No matching measurement"}</strong>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setGroup("All");
                    setStatus("All");
                  }}
                >
                  {th ? "ล้างตัวกรอง" : "Clear filters"}
                </button>
              </div>
            )}
          </div>
          {selected && (
            <aside className="metric-detail">
              <span className={`metric-method metric-method--${selected.status === "measured" ? "landmark" : "scale"}`}>
                {selected.status === "measured" ? (th ? "วัดได้" : "Measured") : (th ? "ยังวัดไม่ได้" : "Not measured")}
              </span>
              <h2>{th ? selected.name_th : selected.name_en}</h2>
              <dl>
                <div>
                  <dt>{th ? "อ่านจาก" : "Read from"}</dt>
                  <dd>
                    {selected.metrics.length > 0 && (th ? "การวัดจากจุดบนใบหน้า" : "Landmark measurements")}
                    {selected.reference.length > 0 && (th ? " · ค่าอ้างอิงที่ตีพิมพ์" : " · a published reference")}
                    {selected.skin_signals.length > 0 && (th ? " · การสแกนผิว" : " · a skin scan")}
                    {selected.status === "not_measured" && (th ? "—" : "—")}
                  </dd>
                </div>
                <div>
                  <dt>{th ? "ผลของสแกนนี้" : "Current result"}</dt>
                  {/* Three states, not two. A row can be scored against a published mean, or
                      measured with no norm to compare it to, or not measured at all — and the
                      middle one used to be shown as "Not measured yet", which was false. */}
                  {scoredRow ? (
                    <dd>
                      {scoredRow.value}
                      <small> · {th ? "ค่าอ้างอิง" : "reference"} {scoredRow.ideal}</small>
                    </dd>
                  ) : measuredRow ? (
                    <dd>
                      {measuredRow.value}
                      <small> · {th ? "วัดได้ แต่ยังไม่มีค่าอ้างอิงให้เทียบ" : "measured, with no published norm to compare against"}</small>
                    </dd>
                  ) : (
                    <dd className="is-locked">
                      <LockKeyhole /> {th ? "ยังวัดไม่ได้" : "Not measured"}
                    </dd>
                  )}
                </div>
              </dl>
              {/* The server's own reason, in the server's own words. Telling someone "we do not
                  measure your hairline" is the answer; inventing a hairline score is not. */}
              {(th ? selected.note_th : selected.note_en) && (
                <div className="metric-limit">
                  <CircleHelp />
                  <p>{th ? selected.note_th : selected.note_en}</p>
                </div>
              )}
              <button type="button" onClick={onUnlock}>
                {th ? "ปลดล็อกผลวิเคราะห์เต็ม" : "Unlock complete analysis"} <ArrowRight />
              </button>
            </aside>
          )}
        </div>
      </GlassCard>
      <div className="measurement-policy">
        <strong>{th ? "กติกาการวัด" : "Measurement rules"}</strong>
        <span>{th ? "ไม่บอกเป็นมิลลิเมตรถ้าไม่มีตัวอ้างอิงขนาด" : "No millimetres without scale calibration."}</span>
        <span>{th ? "ไม่ให้คะแนนการยื่นถ้าไม่มีภาพด้านข้าง" : "No projection score without a side view."}</span>
        <span>{th ? "ไม่วินิจฉัยผิวจากภาพถ่ายมือถือ" : "No skin diagnosis from a phone photo."}</span>
        <span>{th ? "ไม่มีคะแนนความสวยสากล" : "No universal beauty score."}</span>
      </div>
    </section>
  );
}

function UnlockModal({
  onClose,
  openView,
}: {
  onClose: () => void;
  openView: (view: AppView) => void;
}) {
  const { locale } = useLocale();
  const th = locale !== "en";
  // The price came over from project-qijek as a hardcoded "$19.99 / month".
  // This product bills in THB and its plans live in Django, so a figure written
  // here is wrong the moment pricing changes — and wrong today, in the wrong
  // currency. PricingPanel already reads GET /plans/; the same source is used
  // here so the two screens cannot disagree about what a plan costs.
  const plans = useQuery({ queryKey: ["plans"], queryFn: getPlans });
  const plan = (plans.data as PlanRow[] | undefined)
    ?.filter((row) => row.interval !== "year" && row.self_serve && row.price_satang > 0)
    .sort((a, b) => a.price_satang - b.price_satang)[0];
  /* The "unlocking" stage is gone.
   *
   * It was a `setTimeout` of 1050ms behind a scanning animation, a progress bar and the line
   * "Preparing your full analysis. Checking all 85 facial characteristics." Nothing was being
   * prepared and nothing was being checked: this is a price list, the analysis finished before
   * the screen it was opened from could render, and the only thing the timer measured was
   * itself. A progress bar that tracks a timer is the same fiction as a score that tracks
   * nothing — it just tells the lie in motion. */

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
      <section className="unlock-modal app-glass unlock-modal--offer">
        <button
          className="unlock-modal__close"
          type="button"
          onClick={onClose}
          aria-label="Close"
        >
          <X />
        </button>
          <div className="unlock-offer">
            <div className="unlock-modal__heading">
              <div className="unlock-orb">
                <LockKeyhole />
              </div>
              <div>
                <span className="eyebrow">{th ? "\u0e41\u0e1e\u0e47\u0e01\u0e40\u0e01\u0e08" : "Plans"}</span>
                <h2 id="unlock-title">
                  {th ? "\u0e14\u0e39\u0e04\u0e48\u0e32\u0e17\u0e35\u0e48\u0e27\u0e31\u0e14\u0e44\u0e14\u0e49\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14" : "See every measurement this scan produced."}
                </h2>
                {/* The plan's own description, written by whoever edits the price list. The
                    three sentences here before it — "Unlock every detail", "Full analysis, clear
                    limits and a plan that updates with you" — described a product nobody had
                    specified, and the four ticks below promised "all 85 analysis checks" (paying
                    does not make an unmeasured characteristic measurable), a "monthly" plan
                    (`development_plan.py` has no cadence at all) and a "consultation report"
                    (nothing in this system produces one). What a plan grants is a server-owned
                    list on the plan row; the pricing screen renders it against the allowances
                    `entitlement.quota` enforces, and this dialog links there rather than keeping
                    a second copy that can disagree with it. */}
                <p>{plan ? (th ? plan.description_th : plan.description_en) : ""}</p>
              </div>
            </div>
            <div className="unlock-price">
              {plan ? (
                <>
                  <strong>{baht(plan.price_satang)}</strong>
                  <span>/ {th ? "เดือน" : "month"}</span>
                  <small>{th ? plan.name_th : plan.name_en}</small>
                </>
              ) : (
                /* Never a stand-in number: an invented price is worse than no
                   price. The plan list is one request away and the button below
                   still reaches the real pricing screen. */
                <small>{th ? "ดูราคาที่หน้าแพ็กเกจ" : "See plans for pricing"}</small>
              )}
            </div>
            {/* Was <a href="/login">, which sent an already-signed-in user back
                to sign in. The purchase lives on the pricing screen. */}
            <button
              type="button"
              onClick={() => {
                onClose();
                openView("pricing");
              }}
            >
              {th ? "ดูแพ็กเกจ" : "See plans"} <ArrowRight />
            </button>
            <button className="unlock-modal__free" type="button" onClick={onClose}>
              {th ? "\u0e14\u0e39\u0e1c\u0e25\u0e17\u0e35\u0e48\u0e21\u0e35\u0e15\u0e48\u0e2d\u0e44\u0e1b" : "Continue with what is shown"}
            </button>
            <small>
              {th
                ? "\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e01\u0e32\u0e23\u0e28\u0e36\u0e01\u0e29\u0e32\u0e40\u0e17\u0e48\u0e32\u0e19\u0e31\u0e49\u0e19 \u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e01\u0e32\u0e23\u0e27\u0e34\u0e19\u0e34\u0e08\u0e09\u0e31\u0e22 \u0e41\u0e25\u0e30\u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e01\u0e32\u0e23\u0e27\u0e31\u0e14\u0e04\u0e38\u0e13\u0e04\u0e48\u0e32\u0e02\u0e2d\u0e07\u0e04\u0e19"
                : "Educational guidance only. Results are not a diagnosis or a measure of human worth."}
            </small>
          </div>
      </section>
    </div>
  );
}

/**
 * The measured spans, drawn on the photograph they were measured on.
 *
 * This card was empty. What used to sit here was a fixed decorative path — five rules and two
 * dots at constant coordinates in a 600x760 box — laid over the customer's own photograph where
 * measured landmarks belong; it was removed because nothing served the coordinates to replace it
 * with. `analysis_data.metric_geometry` now carries them: for every emitted number, the endpoints
 * the server divided, normalised 0..1 against the stored image (`analysis_engine._metric_geometry`).
 * Every line below was measured by the same code that produced the figure beside it.
 *
 * Three deliberate choices:
 *
 * - The mapping is `lib/metricLines`, not a table of landmark indices kept here. The server says
 *   which two points a ratio divides, so a drawn line and its number cannot disagree.
 * - The SVG carries the photograph's own pixel size as its viewBox and `xMidYMid slice`, which is
 *   exactly `object-fit: cover` with a centred `object-position`. The `<img>` beneath is pinned to
 *   the same alignment inline, so the two scale together by construction rather than by a
 *   correction factor — the failure that used to put the try-on's blush on the jaw.
 * - Nothing is drawn when there is no geometry, which is the normal state for every scan analysed
 *   before the field existed and for every scan past its 30-day image purge. An empty photograph
 *   is the honest picture of "we did not keep the points"; a plausible line is not.
 */
function MeasuredFace({
  analysisData,
  viewKey,
  activeKey,
  keys,
  label,
}: {
  analysisData: Record<string, unknown> | null;
  viewKey: string | null;
  activeKey: string | null;
  keys: string[];
  label: string;
}) {
  const drawing = useMemo(() => {
    if (!analysisData || !viewKey) return null;
    const view = viewGeometry(analysisData, viewKey);
    const size = view?.image_size;
    if (!view || !Array.isArray(size) || !(size[0] > 0 && size[1] > 0)) return null;
    const [width, height] = size as [number, number];
    // Identity fit: the SVG's viewBox *is* the stored image, so a normalised point is simply its
    // pixel position. `coverFit` is still what computes it, so the one mapping the try-on and the
    // overlay share stays the one mapping.
    const fit = coverFit({ width, height }, { width, height });
    const context = allSegments(view, keys, fit).filter(
      (segment: { points: { x: number; y: number }[] }) => segment.points.length > 1,
    );
    const active = activeKey ? referenceSegments(view, activeKey, fit) : [];
    if (!context.length && !active.length) return null;
    return { width, height, context, active };
  }, [analysisData, viewKey, activeKey, keys]);

  if (!drawing) return null;
  const line = (points: { x: number; y: number }[]) =>
    points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return (
    <svg
      className="analysis-face-lines"
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label}
    >
      {/* Every other span this pillar covers, held back so the selected one reads as selected. */}
      {drawing.context.map((segment: { points: { x: number; y: number }[] }, index: number) => (
        <path
          key={`context-${index}`}
          d={line(segment.points)}
          opacity={0.34}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* The highlighted row. `denominator` and `baseline` come back first from
          `referenceSegments`, so "divided by what" is drawn under the span itself. */}
      {drawing.active.map((segment: { role: string; points: { x: number; y: number }[] }, index: number) => (
        <path
          key={`active-${index}`}
          d={line(segment.points)}
          stroke={segment.role === "measured" ? "#5ac8ff" : "rgba(255,255,255,.72)"}
          strokeDasharray={segment.role === "measured" ? undefined : "5 5"}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {drawing.active
        .filter((segment: { role: string }) => segment.role === "measured")
        .flatMap((segment: { points: { x: number; y: number }[] }, index: number) =>
          segment.points.map((point, at) => (
            <circle key={`dot-${index}-${at}`} cx={point.x} cy={point.y} r={Math.max(drawing.width, drawing.height) / 190} />
          )),
        )}
    </svg>
  );
}

/**
 * What backs one of the two figures in the Front/Side strip, on hover.
 *
 * Worth saying because the two are averaged over different numbers of measurements — nine on the
 * front photograph and three angles on the profiles — and a side score that is missing because
 * the profiles were never captured must not look like a side score of nothing.
 */
const viewScoreTitle = (view: ViewScore | undefined, name: FaceAngle) =>
  view?.scored
    ? `Average of ${view.metricCount} measurements read off the ${name} view`
    : `This scan has no scored ${name} measurements`;

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
  const { pillars, rows, strengths, improvements, views, analysisData } = useScanData();
  const { views: photoViews } = useContext(ScanPhotoContext);
  const { locale } = useLocale();
  const th = locale !== "en";
  // The two numbers beside the two photographs, averaged over the measurements read off
  // each one. They belong to the scan, not to the pillar tab: the strip used to print one
  // constant on the front button whenever the harmony tab was open and the word Locked
  // otherwise, and a second constant on the side button — the same two strings for every
  // customer, next to that customer's own face. `DashboardPage.test.js` keeps them out.
  const frontView = views.find((item) => item.key === "front");
  const sideView = views.find((item) => item.key === "side");
  const unlockedCount = pillars.filter((item) => !item.locked).length;
  /**
   * The rows for the pillar *and* the photograph on screen.
   *
   * The angle used to change the picture and nothing else, so pressing Side left nine front
   * measurements sitting under a heading reading "Your Side Ratios", with the card over the
   * profile photograph captioned "SIDE · Midface height" — a measurement named after a view it
   * was not taken from. `METRIC_VIEW` mirrors `reference_scoring.VIEW_OF`, which is where the
   * server records which photograph each observation was read off, and it is also what decides
   * whether the overlay has a span to draw: a front key has no geometry on a profile view, so an
   * unfiltered list would silently draw nothing for half the rows.
   */
  const list = rows.filter(
    (row) => pillarOf(row.category) === pillar && (METRIC_VIEW[row.id] ?? "front") === angle,
  );
  const visible = showAll ? list : list.slice(0, 7);
  const activePillar = pillars.find((item) => item.id === pillar);
  /**
   * Whether this pillar is readable, from the pillar itself.
   *
   * It used to be `pillar !== "harmony"` — a constant, and one the rest of the product
   * contradicted on screen: the overview's pillar cards print real Angularity and Features
   * scores from `reference_scores.categories`, and clicking through to the same pillar here
   * covered every row with a padlock and offered to sell it back. `pillarsFor` already decides
   * this per scan, and it is the only thing that can: a category the backend did not score is
   * locked, a category no published reference measures is `unmeasurable`, and a category this
   * scan scored is neither.
   */
  const pillarLocked = activePillar?.locked ?? true;
  /**
   * Whether this account's plan withholds the deeper rows, decided by the server.
   *
   * The gate here used to be `index > 2` — the fourth row onwards padlocked for everybody,
   * including a Pro subscriber who had already paid for them, under a button offering to sell
   * what they hold. `analysis_depth` is the entitlement that actually governs how much of an
   * analysis a plan may read, and `GET /session/` publishes it exactly so the rule is not
   * re-decided in the client (views.py:152).
   *
   * It is still only a curtain: `GET /scans/<id>/status/` serves `reference_scores` in full to
   * every plan, so the withheld figures are already in the browser. Making the lock real means
   * redacting them there, the way `score_card` and `skin-trend` already do — a backend change,
   * noted here rather than papered over.
   */
  const session = useQuery({ queryKey: ["session"], queryFn: getSession });
  const analysisRedacted = session.data?.score_card_redacted === true;
  // The photograph on screen, and the geometry that goes with it, are the same view — the
  // measured spans are stored per captured view and cannot be drawn on any other one.
  const geometryView = photoViewKey(photoViews, angle);
  const activeRow = list[activeIndex] ?? list[0] ?? null;

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
          All {CATALOG_SIZE}
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
            {/* An em dash, never a zero, when the view was not scored: a front-only scan
                has no side measurements at all, and 0.0 would read as a bad result
                rather than as an absent one. */}
            <strong title={viewScoreTitle(frontView, "front")}>{frontView?.score ?? "—"}</strong>
          </span>
        </button>
        <button
          className={angle === "side" ? "is-active" : ""}
          type="button"
          onClick={() => setAngle("side")}
        >
          <ScanPhoto className="is-side" alt="Side view" angle="side" />
          <span>
            <small>Side</small>
            <strong title={viewScoreTitle(sideView, "side")}>{sideView?.score ?? "—"}</strong>
          </span>
        </button>
        <div>
          {/* What this scan produced, not what the catalogue can measure in principle. The
              eyebrow read "{CATALOG_SIZE} analysis checks" above a pillar holding two or three
              rows, which is a count of the product rather than of the reader's result. */}
          <span className="eyebrow">
            {th
              ? `${rows.length} ค่าที่ให้คะแนนได้ในสแกนนี้`
              : `${rows.length} scored on this scan`}
          </span>
          <strong>
            {activePillar?.label} analysis
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
          {/* The lines are drawn in the SVG's own coordinate space, which is the photograph's
              pixel grid. Alignment is pinned here rather than left to the stylesheet, whose rule
              for this card offsets the crop to 31% and, on `--side`, panned and scaled the front
              photo by 1.16 to pass it off as a profile. Either would slide the face out from
              under a line that was measured on it. */}
          <ScanPhoto
            alt={`Your ${angle} facial analysis`}
            angle={angle}
            style={{ objectPosition: "50% 50%", transform: "none" }}
          />
          <MeasuredFace
            analysisData={analysisData}
            viewKey={geometryView}
            activeKey={pillarLocked ? null : activeRow?.id ?? null}
            keys={pillarLocked ? [] : list.map((row) => row.id)}
            label={
              th
                ? `เส้นที่ใช้วัด${activeRow ? activeRow.name : ""}บนภาพของคุณ`
                : `The spans ${activeRow ? activeRow.name : "these ratios"} was measured across on your own photograph`
            }
          />
          <div className="analysis-face-overlay">
            <span>
              {angle} {activePillar?.label}
            </span>
            {/* Three states, and the middle one used to be missing. A pillar this scan did not
                score reads as unscored; a pillar no published reference measures says that
                instead, because paying does not reveal it. With no row under the cursor at all
                the slot is empty — it used to interpolate `undefined/10`. */}
            <strong>
              {activePillar?.lockReason === "unmeasurable"
                ? th ? "ยังให้คะแนนไม่ได้" : "Not measurable"
                : pillarLocked
                  ? th ? "สแกนนี้ยังไม่ได้ให้คะแนน" : "Not scored on this scan"
                  : activeRow
                    ? `${activeRow.score.toFixed(1)}/10`
                    : "—"}
            </strong>
            <small>{pillarLocked ? activePillar?.note : activeRow?.name}</small>
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
                {activePillar?.label}
              </span>
              <h1>Your {angle === "front" ? "Front" : "Side"} Ratios</h1>
            </div>
            <div>
              <button type="button" onClick={() => openView("doodeegpt")}>
                <MessageCircle /> Ask DOODEE GPT
              </button>
              {/* Was "Unlock 70+ ratios". There is no seventy anywhere in this system: the
                  catalogue holds {CATALOG_SIZE} entries, `analysis_engine` measures 51 of them
                  and only the 12 with a published mean can be scored. The button now offers
                  what the plans page actually sells, without naming a count it cannot back. */}
              <button className="ratio-unlock" type="button" onClick={onUnlock}>
                <LockKeyhole /> {th ? "ดูแพ็กเกจ" : "See plans"}
              </button>
            </div>
          </header>
          {/* The pillar's own note, from `pillarsFor`. The four sentences written here included
              "How selected traits compare with your chosen reference" over Dimorphism — there is
              no chosen reference, no trait comparison, and no published study that measures the
              pillar at all, which is precisely what its note says. */}
          <p className="ratio-panel__intro">{activePillar?.note}</p>
          <div className="ratio-list">
            {visible.map((metric, index) => {
              const locked = pillarLocked || (analysisRedacted && index >= FREE_RATIO_ROWS);
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
                  {/* The bar used to be drawn at full score under a padlocked figure, so the
                      length of the fill gave away the number the row claimed to be hiding. A
                      locked row draws no bar at all. */}
                  <div className="ratio-row__track">
                    {!locked && (
                      <>
                        <i style={{ width: `${metric.score * 10}%` }} />
                        <b style={{ left: `${metric.score * 10}%` }} />
                      </>
                    )}
                  </div>
                  <em className={locked ? "locked-metric-value" : undefined}>
                    {locked ? <LockKeyhole /> : metric.value}
                  </em>
                  <span className="ratio-score">
                    {locked ? <LockedNumber suffix="" compact /> : metric.score.toFixed(1)}
                  </span>
                  <ChevronDown />
                </button>
              );
            })}
            {/* Nothing to list, and three different reasons for it. The panel used to render an
                empty list under a heading that promised ratios. */}
            {!visible.length && (
              <p className="ratio-panel__intro">
                {activePillar?.lockReason === "unmeasurable"
                  ? activePillar.note
                  : rows.some((row) => pillarOf(row.category) === pillar)
                    ? th
                      ? `ค่าของมิตินี้ไม่ได้วัดจากภาพ${angle === "front" ? "หน้าตรง" : "ด้านข้าง"}`
                      : `No measurement in this pillar is read off the ${angle} photograph.`
                    : th
                      ? "สแกนนี้ไม่มีค่าที่ให้คะแนนได้ในมิตินี้"
                      : "This scan produced no scored measurements for this pillar."}
              </p>
            )}
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
      {/* The four letters were a progress meter with the first one always filled: H marked done
          and A, D, F pending, on every account, whatever the scan measured. Filled from the same
          `pillars` the row above counts now, so the picture and the sentence beside it agree.

          The three buttons were "Start Angularity / Dimorphism / Features", which promised work
          that could be started. Two of them only switch tab, and the third switched to a pillar
          no published reference measures — the overview's own card disables it for exactly that
          reason. Unmeasurable pillars are dropped and the rest say what they do. */}
      <GlassCard className="continue-analysis">
        {/* The letter is the pillar's id, not its label: a Thai label's first character is not an
            initial and four of them in four boxes is noise. Decoration either way — the reading
            is which of them are filled, and the sentence beside it says the same thing in words,
            which is why the strip is hidden from assistive technology rather than duplicated. */}
        <div className="continue-analysis__letters" aria-hidden="true">
          {pillars.map((item) => (
            <span key={item.id} className={item.locked ? undefined : "is-done"}>
              {item.id.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
        <div>
          <span className="eyebrow">{th ? "ความครอบคลุม" : "Coverage"}</span>
          <h2>
            {th
              ? `ให้คะแนนได้ ${unlockedCount} จาก ${pillars.length} มิติ`
              : `${unlockedCount} of ${pillars.length} pillars scored`}
          </h2>
          {/* Was "Complete every pillar for a more accurate full-face view", which reads as an
              instruction the reader can follow. They cannot: what is scored is decided by which
              photographs were captured and which measurements have a published mean. */}
          <p>
            {th
              ? "จำนวนมิติที่ให้คะแนนได้ขึ้นกับภาพที่ถ่ายไว้ และค่าที่มีงานวิจัยตีพิมพ์ไว้ให้เทียบ"
              : "What can be scored depends on the photographs captured and on which measurements have a published reference."}
          </p>
        </div>
        <div className="continue-analysis__actions">
          {pillars
            .filter((item) => item.id !== pillar && item.lockReason !== "unmeasurable")
            .map((item) => (
              <button key={item.id} type="button" onClick={() => setPillar(item.id)}>
                {th ? `ดู${item.label}` : `View ${item.label}`}
              </button>
            ))}
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
// Findings, the distribution and the mesh. Its own view rather than a tab inside the score
// card: the card answers "how close to the reference", this answers "which parts, and what
// a clinic does about them", and they are read at different moments.
const AssessmentView = lazy(() => import("../components/AssessmentView"));
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
                window.open("mailto:hello@doodee.app", "_blank");
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
  // One signed link per photograph this scan actually holds. `ScanSerializer` only signs them
  // once the scan completes, so this is empty while Celery is still working — which is exactly
  // when the handoff state should show. `front_url` is folded in because it is the one link the
  // serializer guarantees, and the two must never disagree about which photo is the front.
  const scanPhotos = useMemo<ScanPhotoState>(
    () => ({
      views: {
        ...((scan?.view_urls as Record<string, string> | undefined) ?? {}),
        ...(scan?.front_url ? { front: scan.front_url as string } : {}),
      },
      expired: scan?.images_expired === true,
    }),
    [scan],
  );
  const scanData = useMemo<ScanData>(
    () => ({
      pillars: pillarsFor(scan, locale),
      rows: ratioRows(scan, locale),
      // The whole ranking, not a top three: `InsightList` shows three and says how many more
      // there are, and it can only count them if it is holding them.
      strengths: strengthsFor(scan, undefined, locale),
      improvements: improvementsFor(scan, undefined, locale),
      overall: overallScore(scan),
      views: viewScoresFor(scan),
      cohort: referenceCohortFor(scan),
      availability: catalogAvailability(scan),
      analysisData: (scan?.analysis_data as Record<string, unknown> | undefined) ?? null,
    }),
    [scan, locale],
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [toast, setToast] = useState("");
  const activeLabel = useMemo(
    () => {
      const labels: Record<AppView, { th: string; en: string }> = {
        overview: { th: "วิเคราะห์รูปหน้า", en: "Face Analysis" },
        // No count. It read "สัดส่วน 12 ค่า" while a front-only scan scores nine.
        analysis: { th: "ค่าที่วัดได้", en: "Measurements" },
        plan: { th: "แผนพัฒนา", en: "Plan" },
        simulate: { th: "สตูดิโอจำลอง", en: "Simulation Studio" },
        doodeegpt: { th: "DOODEE AI Chat", en: "DOODEE AI Chat" },
        tryon: { th: "สตูดิโอสไตล์", en: "Style Try-on" },
        history: { th: "ประวัติการสแกน", en: "Scan History" },
        pricing: { th: "แพ็กเกจ & สิทธิพิเศษ", en: "Plans & Rewards" },
        settings: { th: "ตั้งค่าระบบ", en: "Settings" },
        scorecard: { th: "การ์ดคะแนน", en: "Score Card" },
        assessment: { th: "ผลวิเคราะห์เชิงลึก", en: "Assessment" },
        referral: { th: "ชวนเพื่อนรับ 30฿", en: "Invite Friends" },
        profile: { th: "โปรไฟล์ของฉัน", en: "My Profile" },
        skin: { th: "วิเคราะห์ผิว", en: "Skin Analysis" },
      };
      return th ? (labels[view]?.th ?? "ภาพรวม") : (labels[view]?.en ?? "Overview");
    },
    [view, th],
  );

  // Only the views that describe a scan need one. Settings, plans, history and try-on must stay
  // reachable before a first capture — bouncing those out too would leave a new account with
  // nowhere to go but the landing page it just came from.
  const needsScan = !accountViews.some((item) => item.id === view);
  // Redirect only once we know there is genuinely nothing to show — not while the scan list is
  // still loading, and not while Celery is still analysing an existing scan. `scanId` comes from
  // `latestCraniofacialScan`, which ignores demo rows, so an account holding only sample data
  // reads as "no scan" here and is sent back rather than shown invented numbers.
  const hasNoScan = scanList.isSuccess && !scanId;
  // Back to the landing page, not to /scan. These screens describe a scan; without one there is
  // nothing to describe, and the landing page is where the capture flow is introduced and
  // started. Sending someone straight into the camera skips that.
  useEffect(() => {
    if (needsScan && hasNoScan) navigate("/", { replace: true });
  }, [needsScan, hasNoScan, navigate]);

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
  const gate = dashboardGate(scan);
  if (IMAGE_BACKED_VIEWS.has(view) && gate === "failed")
    return (
      <main className="doodee-app doodee-app--handoff">
        <div className="app-load-error" role="alert">
          <strong>{th ? "สแกนนี้วิเคราะห์ไม่สำเร็จ" : "This scan could not be analysed."}</strong>
          {/* `error_message` is one fixed English sentence ending "Retake the indicated images",
              and nothing indicated them. The view and the correction are both in `error_code`,
              which the server already wrote down — `describeScanFailure` says them out loud. */}
          <p>{describeScanFailure(scan.error_code, th).text}</p>
          <button type="button" onClick={() => navigate("/scan")}>
            <RefreshCw size={16} /> {th ? "สแกนใหม่" : "New scan"}
          </button>
        </div>
      </main>
    );
  if (IMAGE_BACKED_VIEWS.has(view) && gate === "waiting")
    return <main className="doodee-app doodee-app--handoff" aria-busy="true" />;
  return (
    <ScanPhotoContext.Provider value={scanPhotos}>
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
              scanId={scanId}
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
            {view === "assessment" && <AssessmentView lang={th ? "th" : "en"} onNavigate={openView as (view: string) => void} />}
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
      {unlockOpen && (
        <UnlockModal onClose={() => setUnlockOpen(false)} openView={openView} />
      )}
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
