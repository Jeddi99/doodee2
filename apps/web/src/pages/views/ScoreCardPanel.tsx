import { useQuery } from "@tanstack/react-query";
import { ImageOff, LockKeyhole, ScanFace } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../DashboardPage";
import { getScans, getScoreCard, getSession } from "../../lib/api";
import { latestCraniofacialScan } from "../../lib/latestScan";

/**
 * Similarity score card, entitlement-gated.
 *
 * Deliberately not a beauty ranking. The backend's z is two-tailed — z = 0 is "closest to the
 * Thai reference mean" — so a "top N%" framing would put the most atypical face first. Every
 * label here reads as closeness to the reference, which is also what the scoring module calls
 * itself (`experimental_reference_similarity`). DESIGN.md rules out both the dark theme and the
 * ranking, so this uses qijek's light GlassCard.
 */

/*
 * REMOVED, on purpose: `DistributionCurve`, `markerPoint` and the `CURVE` geometry.
 *
 * It drew a bell as a pair of fixed cubics — `d="M42 174C158 174 195 167 249 140…"` — with a
 * marker placed on an assumed normal of sigma 61.4 screen pixels. Every viewer got the same
 * curve, because there is no curve in this payload to get: `GET /scans/<id>/score-card/`
 * (percentile.score_card) returns `similarity_percentile` and `marker_z` and nothing whatever
 * about a distribution. The shape was decoration wearing a statistic's clothes, which is the
 * one thing `DashboardPage.test.js` already refuses by name for the identical literal.
 *
 * It cannot be repaired by pointing it at the assessment screen's curve either. That curve is
 * `score_distribution.density_curve` over this deployment's own `overall_score` values — seven
 * of them today — while `marker_z` is `percentile.equivalent_z`, a chi-square tail against the
 * published 240-person Thai study translated into normal space. Two different populations and
 * two different quantities; plotting one marker on the other's axis would be a worse lie than
 * the drawing it replaced.
 *
 * WHAT WOULD BRING IT BACK: a `distribution` block on the score-card response, built the way
 * the assessment route already builds one, over the same quantity `marker_z` is measured in.
 * Then draw it with `curvePath(distribution.curve, …)` from `lib/distributionCurve.ts`, which
 * exists for exactly this and is what the dashboard now uses. Until that block is on the wire,
 * the percentile sentence below is the whole honest answer.
 */

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
  const scanId = new URLSearchParams(window.location.search).get("scan_id") || latestCraniofacialScan(scans.data)?.id;

  const card = useQuery({
    queryKey: ["score-card", scanId],
    queryFn: () => getScoreCard(scanId),
    enabled: Boolean(scanId) && session.isSuccess,
    retry: false,
  });

  if (session.isPending || scans.isPending) {
    return <div className="app-view" aria-busy="true" />;
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
  // The free tier now gets a real card with parts withheld, instead of a 403. `redacted` comes
  // from the server, which is also where the withholding happened — the locked figures are not
  // in this payload at all, so there is nothing here to reveal by inspecting it.
  const redacted = data.redacted === true;

  return (
    <div className="app-view score-card-view">
      <div className="app-page-title">
        <span className="eyebrow">การ์ดคะแนน</span>
        <h1>เทียบกับกลุ่มอ้างอิง</h1>
        {/* The cohort half of this sentence is only said when the scan carries a cohort to
            name. `reference` is absent on a scan scored before that block existed, and the
            template then rendered "เทียบกับคนไทย  คน อายุ  ปี" — a comparison with a
            population whose size and age band are both blank, which reads as a rendering fault
            and is really a claim with nothing behind it. */}
        <p>
          วัดจาก {data.metric_count} ค่า
          {data.sample_size && data.age_range
            ? ` เทียบกับคนไทย ${data.sample_size} คน อายุ ${data.age_range} ปี`
            : ""}
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

        {/* Two different reasons for a missing percentile, and they must not read the same.
            `similarity_percentile_locked` means "this exists, a paid plan shows it". A plain
            null means "you are outside the published cohort, so no honest number exists" —
            telling that user to upgrade would be selling something they cannot receive. */}
        {data.similarity_percentile_locked ? (
          <div className="score-card__percentile is-locked">
            <strong aria-hidden="true"><LockKeyhole /></strong>
            <span>
              การเทียบตำแหน่งกับกลุ่มอ้างอิงเปิดให้แผนพลัสและโปร
              <button type="button" onClick={() => navigate("/pricing")}>ดูแผน</button>
            </span>
          </div>
        ) : percentile !== null ? (
          <div className="score-card__percentile">
            {/* `similarity_percentile` is `round(survival * 100, 1)`, so a face far enough into
                the tail comes back as exactly 0.0 and rendered as "0%" — which claims that *no
                one* in the reference cohort sits further from the mean than this reader. What the
                server actually computed is "below the smallest figure this rounds to". This
                account is one of them, so it was on screen, not hypothetical. */}
            <strong>{percentile === 0 ? "<0.1%" : `${percentile}%`}</strong>
            {/* The one sentence that keeps the whole card honest: this measures closeness to
                the cohort mean, not attractiveness. */}
            <span>
              ของกลุ่มอ้างอิงอยู่ห่างจากค่าเฉลี่ยมากกว่าคุณ
              {/* The approximation warning, beside the number rather than only in the footer.
                  `percentile.similarity_percentile` sums z² over the metrics and reads it off a
                  chi-square with df = len(metrics) — which assumes the twelve measurements are
                  independent. They are not (midface and lower-face height both scale with the
                  same face), the published study reports no covariance matrix to do better with,
                  and that module's own docstring says the assumption "pushes the percentile
                  toward the extremes" and that "the UI has to state the assumption rather than
                  present this as exact".

                  On this account that is not theoretical: chi² = 33.4 on 12 degrees of freedom
                  gives 0.1%, which is drawn as a headline figure directly under an overall score
                  of 77/100. A reader who takes the big number at face value has been told
                  something the statistic cannot support, and the footer saying so 400px further
                  down is the arrangement DevelopmentPlanPanel already rejects in as many words —
                  a qualifier said once at the bottom of a page is not said beside the thing it
                  is about. */}
              {data.assumes_independent_metrics ? (
                <em className="score-card__approximate"> · ค่าประมาณ ไม่ใช่ค่าที่แม่นยำ (ดูหมายเหตุด้านล่าง)</em>
              ) : null}
            </span>
          </div>
        ) : (
          <p className="score-card__withheld" role="status">
            คุณอยู่นอกกลุ่มอ้างอิง (คนไทย อายุ 18–35 ปี) จึงไม่แสดงการเทียบเป็นเปอร์เซ็นต์ —
            ตัวเลขที่วัดได้ยังใช้ได้ตามปกติ
          </p>
        )}

        {data.categories?.length ? (
          <div className="score-card__categories">
            {data.categories.map((category: { key: string; score: number | null; metric_count: number; locked?: boolean }) => (
              /* A locked row keeps its name and its metric count. Seeing that a "จมูก" score
                 exists and is unreadable is honest; hiding the row would understate how much
                 the analysis actually covers. */
              <article className={category.locked ? "is-locked" : ""} key={category.key}>
                <span>{CATEGORY_LABELS[category.key] || category.key}</span>
                <strong>{category.locked ? <LockKeyhole size={16} /> : category.score}</strong>
                <i style={{ width: `${category.locked ? 0 : category.score}%` }} />
                <small>{category.metric_count} ค่า</small>
              </article>
            ))}
          </div>
        ) : null}

        {redacted && (
          <div className="score-card__upgrade">
            <p>
              แผนฟรีเห็นคะแนนรวมและหมวดที่ใกล้ค่าอ้างอิงที่สุดสองหมวด
              แผนพลัสและโปรเห็นครบทุกหมวด พร้อมตำแหน่งบนการแจกแจงและแผนพัฒนาตนเอง
            </p>
            <div className="score-card-locked__actions">
              <button type="button" onClick={() => navigate("/pricing")}>ดูแผน</button>
              <button type="button" onClick={() => navigate("/settings")}>ใช้โค้ดรับสิทธิ์</button>
            </div>
          </div>
        )}

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
