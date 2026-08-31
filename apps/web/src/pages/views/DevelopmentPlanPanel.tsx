import { useQuery } from "@tanstack/react-query";
import { LockKeyhole, ScanFace } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../DashboardPage";
import { getDevelopmentPlan, getScans, getSession } from "../../lib/api";
import { useLocale } from "../../useLocale";
import { latestCraniofacialScan } from "../../lib/latestScan";

/**
 * แผนพัฒนาตนเอง, built from this user's own measurements.
 *
 * This replaces a hardcoded mock that promised "Current 7.4 → Your target 8.2 with your plan"
 * and an "Expected impact: +0.4 pts" against every action. Those numbers came from nowhere —
 * no such figure exists anywhere in the system — and `chat.py`'s safety rules forbid the app
 * from stating one, because a predicted gain from a cosmetic procedure is exactly the claim the
 * product promises not to make. Everything on this page now comes from the API, and the API
 * will not produce a number like that.
 *
 * Items are ordered by distance from the reference average, and the copy says so in those
 * words. It is not a ranking by desirability and must never be phrased as one.
 */

const COPY = {
  th: {
    eyebrow: "แผนพัฒนาตนเอง",
    heading: "สิ่งที่ทำได้ด้วยตัวเอง",
    intro: "เรียงตามค่าที่ห่างจากค่าอ้างอิงมากที่สุด ไม่ใช่การจัดอันดับว่าอะไรดีหรือไม่ดี",
    locked: "แผนพัฒนาตนเองเปิดให้แผนพลัสและโปร",
    lockedBody:
      "แผนนี้สร้างจากค่าที่วัดได้ของคุณเอง บอกว่าค่าไหนห่างจากกลุ่มอ้างอิงมากที่สุด และมีอะไรที่ลองปรับเองได้บ้าง",
    plans: "ดูแผน",
    redeem: "ใช้โค้ดรับสิทธิ์",
    noScan: "ยังไม่มีผลสแกน",
    noScanBody: "ถ่ายสามมุมเพื่อสร้างแผน",
    startScan: "เริ่มสแกน",
    unavailable: "ยังสร้างแผนไม่ได้",
    unavailableBody: "ผลวิเคราะห์ของสแกนนี้ยังไม่เสร็จ หรือยังไม่มีค่าที่วัดได้มากพอ",
    tryThis: "ลองทำ",
    related: "หัตถการที่เกี่ยวข้อง",
    relatedNote: "ระบุไว้เพราะเกี่ยวข้องกับค่านี้ ไม่ใช่คำแนะนำให้ทำ",
    yours: "ค่าของคุณ",
    reference: "ค่าอ้างอิง",
  },
  en: {
    eyebrow: "Your plan",
    heading: "What you can try yourself.",
    intro: "Ordered by distance from the reference average — not a ranking of what is good or bad.",
    locked: "The development plan is on Plus and Pro",
    lockedBody:
      "It is built from your own measurements: which sit furthest from the reference group, and what you can reversibly try.",
    plans: "See plans",
    redeem: "Redeem a code",
    noScan: "No scan yet",
    noScanBody: "Capture three angles to build a plan.",
    startScan: "Start a scan",
    unavailable: "No plan yet",
    unavailableBody: "This scan has not finished scoring, or too few measurements came through.",
    tryThis: "Try this",
    related: "Related procedures",
    relatedNote: "Named because they relate to this measurement, not recommended.",
    yours: "Yours",
    reference: "Reference",
  },
};

const CATEGORY_LABELS: Record<string, { th: string; en: string }> = {
  proportions: { th: "สัดส่วนใบหน้า", en: "Facial proportions" },
  eyes: { th: "ดวงตา", en: "Eyes" },
  nose: { th: "จมูก", en: "Nose" },
  lips: { th: "ริมฝีปาก", en: "Lips" },
  chin: { th: "คาง", en: "Chin" },
};

type PlanItem = {
  key: string;
  category: string;
  label: string;
  observed: number;
  reference: number;
  unit: string;
  normalized_deviation: number;
  direction: string;
  actions: { action: string; why: string }[];
  related_procedures: string[];
};

function value(amount: number, unit: string) {
  return unit === "degree" ? `${Math.round(amount)}°` : amount.toFixed(3);
}

export default function DevelopmentPlanPanel() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const lang = locale === "en" ? "en" : "th";
  const copy = COPY[lang];

  const session = useQuery({ queryKey: ["session"], queryFn: getSession });
  const scans = useQuery({ queryKey: ["scans"], queryFn: getScans });
  const scanId = new URLSearchParams(window.location.search).get("scan_id") || latestCraniofacialScan(scans.data)?.id;
  const entitled = session.data?.development_plan_enabled === true;

  const plan = useQuery({
    queryKey: ["development-plan", scanId, lang],
    queryFn: () => getDevelopmentPlan(scanId, lang),
    // Not fired while the gate is unresolved or closed: the answer is already known, and a 403
    // in the network tab is noise.
    enabled: Boolean(scanId) && session.isSuccess && entitled,
    retry: false,
  });

  if (session.isPending || scans.isPending) {
    return <div className="app-view" aria-busy="true" />;
  }

  if (!entitled) {
    // A hard gate here, unlike the score card. There is no honest partial form of a plan:
    // half a suggestion is not a teaser, it is advice with the reason removed.
    return (
      <div className="app-view plan-view">
        <div className="app-page-title">
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1>{copy.locked}</h1>
        </div>
        <GlassCard className="score-card-locked">
          <LockKeyhole />
          <p>{copy.lockedBody}</p>
          <div className="score-card-locked__actions">
            <button type="button" onClick={() => navigate("/pricing")}>{copy.plans}</button>
            <button type="button" onClick={() => navigate("/settings")}>{copy.redeem}</button>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (!scanId) {
    return (
      <div className="app-view plan-view">
        <GlassCard className="score-card-locked">
          <ScanFace />
          <h2>{copy.noScan}</h2>
          <p>{copy.noScanBody}</p>
          <div className="score-card-locked__actions">
            <button type="button" onClick={() => navigate("/scan")}>{copy.startScan}</button>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (plan.isPending) return <div className="app-view" aria-busy="true" />;

  if (plan.error) {
    return (
      <div className="app-view plan-view">
        <GlassCard className="score-card-locked">
          <h2>{copy.unavailable}</h2>
          <p>{copy.unavailableBody}</p>
        </GlassCard>
      </div>
    );
  }

  const data = plan.data;
  const items: PlanItem[] = data.items ?? [];

  return (
    <div className="app-view plan-view">
      <div className="app-page-title">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.heading}</h1>
        <p>{copy.intro}</p>
      </div>

      {data.cohort_note && (
        <p className="plan-cohort-note" role="status">
          {data.cohort_note}
        </p>
      )}

      {!items.length ? (
        <GlassCard className="plan-empty">
          <p>{data.empty_reason}</p>
        </GlassCard>
      ) : (
        <div className="plan-item-list">
          {items.map((item, index) => (
            <GlassCard className="plan-item" key={item.key}>
              <header>
                <span className="plan-item-number">{index + 1}</span>
                <div>
                  {/* The measurement names the row; the category is a subtitle. Heading by
                      category alone put two "จมูก" cards side by side with opposite
                      directions, which reads as a bug rather than as two measurements. */}
                  <strong>{item.label}</strong>
                  <span className="plan-item-direction">
                    {CATEGORY_LABELS[item.category]?.[lang] || item.category} · {item.direction}
                  </span>
                </div>
                <dl className="plan-item-values">
                  <div>
                    <dt>{copy.yours}</dt>
                    <dd>{value(item.observed, item.unit)}</dd>
                  </div>
                  <div>
                    <dt>{copy.reference}</dt>
                    <dd>{value(item.reference, item.unit)}</dd>
                  </div>
                </dl>
              </header>

              <h3>{copy.tryThis}</h3>
              <ul className="plan-item-actions">
                {item.actions.map((action) => (
                  <li key={action.action}>
                    <strong>{action.action}</strong>
                    <span>{action.why}</span>
                  </li>
                ))}
              </ul>

              {item.related_procedures.length > 0 && (
                <div className="plan-item-procedures">
                  <h3>{copy.related}</h3>
                  <ul>
                    {item.related_procedures.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                  {/* Beside the list, every time. "Named, not recommended" said once at the
                      bottom of the page is not said beside the thing it is about. */}
                  <small>{copy.relatedNote}</small>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}

      <footer className="plan-caveat">
        <p>{data.limits}</p>
        <p>{data.disclaimer}</p>
      </footer>
    </div>
  );
}
