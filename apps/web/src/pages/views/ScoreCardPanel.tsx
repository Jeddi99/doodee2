import { useQuery } from "@tanstack/react-query";
import { ImageOff, LockKeyhole, ScanFace } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../DashboardPage";
import { getScans, getScoreCard, getSession } from "../../lib/api";

/**
 * Similarity score card, entitlement-gated.
 *
 * Deliberately not a beauty ranking. The backend's z is two-tailed — z = 0 is "closest to the
 * Thai reference mean" — so a "top N%" framing would put the most atypical face first. Every
 * label here reads as closeness to the reference, which is also what the scoring module calls
 * itself (`experimental_reference_similarity`). DESIGN.md rules out both the dark theme and the
 * ranking, so this uses qijek's light GlassCard.
 */

/** Curve geometry, matched to the path drawn in DistributionCurve below. */
const CURVE = { centreX: 380, baselineY: 174, peakHeight: 136, sigmaPx: 61.4, minX: 42, maxX: 718 };

function markerPoint(z: number) {
  // The drawn path is a normal; place the marker at the same z on it.
  const x = Math.min(CURVE.maxX, CURVE.centreX + z * CURVE.sigmaPx);
  const y = CURVE.baselineY - CURVE.peakHeight * Math.exp(-((x - CURVE.centreX) ** 2) / (2 * CURVE.sigmaPx ** 2));
  return { x, y };
}

function DistributionCurve({ z, label }: { z: number; label: string }) {
  const { x, y } = markerPoint(z);
  const labelAbove = y > 90;
  return (
    <svg
      className="score-curve"
      viewBox="0 0 760 220"
      role="img"
      aria-label={`ตำแหน่งของคุณบนการแจกแจงของกลุ่มอ้างอิง: ${label}`}
    >
      <defs>
        <linearGradient id="scoreCardCurveFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1687ff" stopOpacity=".2" />
          <stop offset="1" stopColor="#1687ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="score-curve__grid" d="M40 174H720M40 128H720M40 82H720" />
      <path
        className="score-curve__fill"
        d="M42 174C158 174 195 167 249 140C308 111 322 44 380 38C438 44 452 111 511 140C565 167 602 174 718 174V200H42Z"
      />
      <path
        className="score-curve__line"
        d="M42 174C158 174 195 167 249 140C308 111 322 44 380 38C438 44 452 111 511 140C565 167 602 174 718 174"
      />
      {/* Near the peak the curve leaves no headroom, so the label goes below the marker
          instead of colliding with it. */}
      <line className="score-curve__marker" x1={x} y1={labelAbove ? y - 60 : y + 14} x2={x} y2={labelAbove ? 181 : 181} />
      <circle cx={x} cy={y} r="7" />
      <text
        x={Math.max(CURVE.minX + 24, Math.min(x, CURVE.maxX - 24))}
        y={labelAbove ? y - 72 : y + 34}
        textAnchor="middle"
      >
        คุณ
      </text>
      <text className="score-curve__axis" x={CURVE.centreX} y="200" textAnchor="middle">
        ค่าเฉลี่ยกลุ่มอ้างอิง
      </text>
    </svg>
  );
}

// Two photos, front and side, as the card was designed. Both are optional: the numbers
// outlive the photographs by design, so a card with neither still reads correctly.
const PORTRAITS = [
  { field: "front_url", caption: "หน้าตรง", alt: "ภาพหน้าตรงของคุณ" },
  { field: "side_url", caption: "ด้านข้าง", alt: "ภาพด้านข้างของคุณ" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  proportions: "สัดส่วนรวม",
  eyes: "ดวงตา",
  nose: "จมูก",
  lips: "ริมฝีปาก",
  chin: "คาง",
};

export default function ScoreCardPanel() {
  const navigate = useNavigate();
  const session = useQuery({ queryKey: ["session"], queryFn: getSession });
  const scans = useQuery({ queryKey: ["scans"], queryFn: getScans });
  const scanId = new URLSearchParams(window.location.search).get("scan_id") || scans.data?.[0]?.id;
  const locked = session.data?.score_card_locked === true;

  const card = useQuery({
    queryKey: ["score-card", scanId],
    queryFn: () => getScoreCard(scanId),
    // Never fire while the gate is unresolved or closed: a 403 in the network tab is noise,
    // and the answer is already known.
    enabled: Boolean(scanId) && session.isSuccess && !locked,
    retry: false,
  });

  if (session.isPending || scans.isPending) {
    return <div className="app-view" aria-busy="true" />;
  }

  if (locked) {
    return (
      <div className="app-view score-card-view">
        <div className="app-page-title">
          <span className="eyebrow">การ์ดคะแนน</span>
          <h1>เฉพาะสมาชิก</h1>
        </div>
        <GlassCard className="score-card-locked">
          <LockKeyhole />
          <h2>การ์ดคะแนนเปิดให้สมาชิก</h2>
          <p>
            ผลวิเคราะห์และประวัติการสแกนของคุณยังใช้ได้ตามปกติ การ์ดนี้เพิ่มการเทียบกับกลุ่มอ้างอิง
            คนไทย 240 คน อายุ 18–35 ปี
          </p>
          <div className="score-card-locked__actions">
            <button type="button" onClick={() => navigate("/settings")}>
              ใช้โค้ดรับสิทธิ์
            </button>
            <button type="button" onClick={() => navigate("/pricing")}>
              ดูแผน
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (!scanId) {
    return (
      <div className="app-view score-card-view">
        <GlassCard className="score-card-locked">
          <ScanFace />
          <h2>ยังไม่มีผลสแกน</h2>
          <p>ถ่ายสามมุมเพื่อสร้างการ์ดคะแนน</p>
          <div className="score-card-locked__actions">
            <button type="button" onClick={() => navigate("/scan")}>
              เริ่มสแกน
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (card.isPending) return <div className="app-view" aria-busy="true" />;

  if (card.error) {
    return (
      <div className="app-view score-card-view">
        <GlassCard className="score-card-locked">
          <h2>ยังสร้างการ์ดไม่ได้</h2>
          <p>ผลวิเคราะห์ของสแกนนี้ยังไม่เสร็จ หรือยังไม่มีค่าที่วัดได้มากพอ</p>
        </GlassCard>
      </div>
    );
  }

  const data = card.data;
  const percentile = data.similarity_percentile as number | null;

  return (
    <div className="app-view score-card-view">
      <div className="app-page-title">
        <span className="eyebrow">การ์ดคะแนน</span>
        <h1>เทียบกับกลุ่มอ้างอิง</h1>
        <p>
          วัดจาก {data.metric_count} ค่า เทียบกับคนไทย {data.sample_size} คน อายุ {data.age_range} ปี
        </p>
      </div>

      <GlassCard className="score-card">
        <div className="score-card__portraits">
          {PORTRAITS.map(({ field, caption, alt }) =>
            data[field] ? (
              <figure key={field}>
                {/* No crossOrigin and no download affordance: the URL is a short-lived signed
                    link to the user's own photo, and it should not outlive the page. */}
                <img src={data[field]} alt={alt} loading="lazy" />
                <figcaption>{caption}</figcaption>
              </figure>
            ) : (
              <figure key={field} className="is-empty">
                <div className="score-card__portrait-empty" aria-hidden="true">
                  <ImageOff size={20} />
                </div>
                <figcaption>{caption}</figcaption>
              </figure>
            ),
          )}
          <div className="score-card__headline">
            <strong>
              {data.overall_score ?? "—"}
              <small>/100</small>
            </strong>
            <span>ดัชนีความใกล้ค่าอ้างอิง</span>
          </div>
        </div>

        {/* Said once, under the photos, rather than left as two silent grey boxes. The card
            itself is built from analysis_data, which survives the photos being deleted. */}
        {(!data.front_url || !data.side_url) && (
          <p className="score-card__portrait-note" role="status">
            {data.images_expired
              ? "ภาพถ่ายถูกลบตามกำหนด 30 วันแล้ว ตัวเลขและคะแนนทั้งหมดยังอยู่ครบ"
              : "ยังไม่มีภาพสำหรับมุมนี้ — สแกนใหม่แบบเก็บภาพด้านข้างจะแสดงได้ครบทั้งสองมุม"}
          </p>
        )}

        {percentile !== null ? (
          <div className="score-card__percentile">
            <strong>{percentile}%</strong>
            {/* The one sentence that keeps the whole card honest: this measures closeness to
                the cohort mean, not attractiveness. */}
            <span>ของกลุ่มอ้างอิงอยู่ห่างจากค่าเฉลี่ยมากกว่าคุณ</span>
          </div>
        ) : (
          <p className="score-card__withheld" role="status">
            คุณอยู่นอกกลุ่มอ้างอิง (คนไทย อายุ 18–35 ปี) จึงไม่แสดงการเทียบเป็นเปอร์เซ็นต์ —
            ตัวเลขที่วัดได้ยังใช้ได้ตามปกติ
          </p>
        )}

        {percentile !== null && typeof data.marker_z === "number" ? (
          <DistributionCurve z={data.marker_z} label={`${percentile}%`} />
        ) : null}

        {data.categories?.length ? (
          <div className="score-card__categories">
            {data.categories.map((category: { key: string; score: number; metric_count: number }) => (
              <article key={category.key}>
                <span>{CATEGORY_LABELS[category.key] || category.key}</span>
                <strong>{category.score}</strong>
                <i style={{ width: `${category.score}%` }} />
                <small>{category.metric_count} ค่า</small>
              </article>
            ))}
          </div>
        ) : null}

        <footer className="score-card__caveat">
          <p>
            การเทียบเป็นเปอร์เซ็นต์คำนวณโดย <strong>สมมติว่าค่าที่วัดแต่ละตัวเป็นอิสระต่อกัน</strong>{" "}
            เพราะงานวิจัยต้นทางไม่ได้เผยแพร่ความสัมพันธ์ระหว่างค่า ตัวเลขนี้จึงเป็นการประมาณ
            ไม่ใช่ค่าที่แม่นยำ
          </p>
          <p>
            นี่คือการวัดความใกล้ค่าเฉลี่ยของกลุ่มอ้างอิง <strong>ไม่ใช่การให้คะแนนความสวยงาม</strong>{" "}
            และไม่ใช่คำวินิจฉัยทางการแพทย์
          </p>
        </footer>
      </GlassCard>
    </div>
  );
}
