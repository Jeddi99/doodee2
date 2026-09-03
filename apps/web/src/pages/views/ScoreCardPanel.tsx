import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ImageOff, LockKeyhole, ScanFace } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../DashboardPage";
import { getScanAssessment, getScans, getScoreCard, getSession } from "../../lib/api";
import { toTenScale } from "../../lib/dashboardData";
import { curvePath, type Distribution, scoreX } from "../../lib/distributionCurve";
import { exportFailureText, scoreCardFileName } from "../../lib/imageExport";
import { latestCraniofacialScan } from "../../lib/latestScan";

/**
 * Similarity score card, entitlement-gated, in the form somebody would actually keep.
 *
 * Deliberately not a beauty ranking. The backend's z is two-tailed — z = 0 is "closest to the
 * Thai reference mean" — so a "top N%" framing would put the most atypical face first. Every
 * label here reads as closeness to the reference, which is also what the scoring module calls
 * itself (`experimental_reference_similarity`).
 *
 * The card is dark and the page around it is not. That is the one place the product's light
 * palette is set aside on purpose: this rectangle is an *image* — it is rendered to a PNG by the
 * button underneath it and then lives in a camera roll, next to photographs, away from every
 * piece of app chrome that would otherwise explain it. So it carries its own frame, its own
 * wordmark and its own caveat line, because the file has to be readable by someone who never
 * opened this screen. Nothing else on the route changes colour, and there is still no theme
 * switch.
 */

/*
 * THE CURVE, and why there is one again.
 *
 * A previous version of this file drew a bell as a pair of fixed cubics — `M42 174C158 174…` —
 * with the reader's marker placed on an assumed normal of sigma 61.4 *screen pixels*. Every
 * viewer got the same shape, because there was no shape in `GET /scans/<id>/score-card/` to get:
 * `percentile.score_card` returns `similarity_percentile` and `marker_z` and nothing whatever
 * about a distribution. That drawing was rightly deleted, and `views.test.js` bans the literal.
 *
 * What is plotted here is a different quantity from a different request, and the distinction is
 * the whole point:
 *
 *  * The percentile above the chart is against the *published Thai cohort* — a chi-square tail on
 *    `marker_z`, from `GET .../score-card/`. There is still no curve for it and none is drawn.
 *  * The curve is `distribution` off `GET /scans/<id>/assessment/`: a kernel density estimate of
 *    the `overall_score` values this deployment actually holds, one per person. Its marker is
 *    this reader's own `overall_score`, on the same 0–100 axis the curve is drawn over — the same
 *    payload, the same `curvePath`, and the same marker rule the overview card and the assessment
 *    screen already use, so three screens cannot draw three different shapes.
 *
 * Which is why the caption under it names DooDee's own users and their number rather than the
 * 240-person study named at the top of the page. Two populations, said twice, never merged.
 */

// Two photos, front and side, as the card was designed. Both are optional: the numbers outlive
// the photographs by design, so a card with neither still reads correctly. `view` is the key
// `dashboardData.viewScoresFor` scores that angle under, so the figure below each portrait is
// that angle's own average rather than the overall repeated twice.
const PORTRAITS = [
  { field: "front_url", view: "front", caption: "หน้าตรง", alt: "ภาพหน้าตรงของคุณ" },
  { field: "side_url", view: "side", caption: "ด้านข้าง", alt: "ภาพด้านข้างของคุณ" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  proportions: "สัดส่วนรวม",
  eyes: "ดวงตา",
  nose: "จมูก",
  lips: "ริมฝีปาก",
  chin: "คาง",
};

/**
 * The chart's own viewBox, in the units the SVG below is drawn in.
 *
 * `left`/`right` inset the axis so the marker dot at either extreme is not sliced in half by the
 * edge of the box, and `baseline`/`peak` leave room under the curve for the dot and above it for
 * the reader's label.
 */
const CURVE_BOX = { left: 10, right: 290, baseline: 88, peak: 16 };

/** The card's accent, as a value rather than a token: see the SVG below for why. */
const CURVE_INK = "#6fe3c8";

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

  // The same query key the overview card and the assessment screen use, so opening either of
  // them costs nothing and all three draw one curve from one payload. Its absence is survivable
  // — the chart is the only thing that reads it — so this never gates the card's own render.
  const assessment = useQuery({
    queryKey: ["assessment", scanId],
    queryFn: () => getScanAssessment(scanId),
    enabled: Boolean(scanId) && session.isSuccess,
    retry: false,
  });

  const shareRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * The card as a PNG.
   *
   * `html-to-image` re-fetches the portraits and inlines them, so the file that lands in the
   * downloads folder holds the photographs — which is the point of a card somebody can keep, and
   * also the one thing worth saying out loud next to the button: the signed links on this page
   * expire, and this file does not. The button sits outside the exported node rather than being
   * filtered out of it, so there is no arrangement in which it can print itself onto the image.
   *
   * Imported where it is used: the library is the largest dependency on this route and nobody who
   * merely opens the card should pay to download it.
   */
  async function saveCard() {
    const node = shareRef.current;
    if (!node || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await Promise.race([
        toPng(node, {
          pixelRatio: 3,
          backgroundColor: "#0b0f15",
          // No `cacheBust`: it appends a query parameter to every URL it fetches, and these are
          // signed links whose token is checked against the request as sent.
          //
          // `skipFonts` costs a little fidelity and buys a lot. Left on, the library walks every
          // stylesheet in the document and inlines every `@font-face` it finds as base64 — here
          // all thirty-one subsets of Manrope and Noto Sans Thai, Cyrillic and Vietnamese
          // included, none of which this card sets a single character in. That is roughly four
          // seconds and a megabyte of data URL for two typefaces. Every font stack on the card
          // names real fallbacks, so the file lands on the reader's system UI font — which has
          // Thai — rather than on nothing.
          skipFonts: true,
        }),
        // `html-to-image` resolves inside a `requestAnimationFrame`, which does not run while the
        // tab is in the background — send the tab behind another one mid-export and the promise
        // never settles, in either direction, with the network long since idle. There is nothing
        // to catch without this, and a button that says "saving…" for ever is worse than one that
        // admits it failed.
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("export_timeout")), 30_000)),
      ]);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = scoreCardFileName();
      link.click();
    } catch {
      // `exportFailureText` names the three causes apart, and 'encode' is the honest one here:
      // a portrait the library could not fetch is left as a gap rather than throwing, so a
      // rejection at this point is the canvas or the PNG, not the photograph.
      setSaveError(exportFailureText("encode", true));
    } finally {
      setSaving(false);
    }
  }

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

  // The ten-point scale the rest of the product prints. `toTenScale` is the same division the
  // pillar chips and the overview headline go through, so the card and the sidebar entry for the
  // same scan cannot show two different numbers.
  const overall = toTenScale(data.overall_score);
  const scan = (Array.isArray(scans.data) ? scans.data : []).find((item: { id?: string }) => item.id === scanId);
  const assessmentData = assessment.data as
    | { views?: { key: string; score: number | null; metric_count: number }[]; distribution?: Distribution }
    | undefined;
  /**
   * Front and side, from the server's own `views` block.
   *
   * Not from `dashboardData.viewScoresFor(scan)`, which is the obvious choice and the wrong one
   * here. That derives each angle by averaging the metrics on the scan payload — and those are
   * withheld by plan: `percentile.redact_reference_scores` strips `score` from every measurement
   * outside the two readable categories, so on a free account the front figure came out as the
   * mean of *two* readable measurements and printed itself as "หน้าตรง · 2 ค่า" beside an overall
   * built from all twelve. A real number, computed over the wrong nine.
   *
   * `GET .../assessment/` builds `views` before any withholding, from the whole metric list, and
   * `_redact_assessment` leaves the block alone. Front 8.4 over nine measurements and side 5.0
   * over three is what the same account's assessment screen shows.
   */
  const viewScores = new Map((assessmentData?.views ?? []).map((item) => [item.key, item]));
  // When the measurement was taken. On screen it is redundant — the sidebar says "latest scan"
  // — but the file this card becomes has no sidebar, and a score with no date on it is a claim
  // about a face with no claim about when.
  const measuredOn = scan?.created_at
    ? new Date(scan.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })
    : null;

  const distribution = assessmentData?.distribution;
  const curve = curvePath(distribution?.curve, CURVE_BOX);
  const markerX = typeof data.overall_score === "number" ? scoreX(data.overall_score, CURVE_BOX) : null;
  const drawn = distribution?.drawn_sample_size ?? 0;
  // The count travels with the shape, in the caption rather than a footnote: a curve that does
  // not say how many people are in it looks identical whether it is eight or eight hundred. And
  // below `reliable_at` it says so, instead of letting a marker on a two-bump curve read as a rank.
  const curveCaption = distribution?.reliable === false
    ? `เทียบกับผู้ใช้ DooDee ${drawn} คน · ยังน้อยกว่า ${distribution.reliable_at} คน จึงเป็นการเทียบคร่าว ๆ`
    : `เทียบกับคะแนนของผู้ใช้ DooDee ${drawn} คน`;

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

      <div className="score-card-stage">
        <div className="share-card-column">
          {/* Everything inside this node is what the PNG contains. */}
          <div className="share-card" ref={shareRef}>
            <header className="share-card__brand">
              <span className="share-card__mark">DOODEE</span>
              <span>{measuredOn ? `สแกน ${measuredOn}` : "การ์ดคะแนน"}</span>
            </header>

            <div className="share-card__faces">
              {PORTRAITS.map(({ field, view, caption, alt }) => {
                const angle = viewScores.get(view);
                const angleScore = toTenScale(angle?.score);
                return (
                  <figure key={field}>
                    <div className="share-card__ring">
                      {data[field] ? (
                        <img src={data[field]} alt={alt} loading="lazy" />
                      ) : (
                        <div className="share-card__ring-empty" aria-hidden="true">
                          <ImageOff size={18} />
                        </div>
                      )}
                    </div>
                    <strong>{angleScore === null ? "—" : angleScore.toFixed(1)}</strong>
                    {/* What the angle score averages, beside it. Front and side are means over
                        that angle's own metrics while the overall below is a mean of category
                        means, so the three numbers legitimately disagree — and a reader who
                        cannot see how many measurements are behind each one is left to guess
                        which of them was made up. */}
                    <figcaption>{angleScore === null ? caption : `${caption} · ${angle?.metric_count} ค่า`}</figcaption>
                  </figure>
                );
              })}
            </div>

            {/* Decorative only, and drawn in CSS for that reason: it is two hairlines joining the
                angle scores to the average of them, not a measurement of anything. */}
            <div className="share-card__join" aria-hidden="true" />

            <div className="share-card__headline">
              <strong>{overall === null ? "—" : overall.toFixed(1)}</strong>
              <small>/ 10</small>
              <span>ดัชนีความใกล้ค่าอ้างอิง · จากค่าที่วัดได้ {data.metric_count} ค่า</span>
            </div>

            {/* Two different reasons for a missing percentile, and they must not read the same.
                `similarity_percentile_locked` means "this exists, a paid plan shows it". A plain
                null means "you are outside the published cohort, so no honest number exists" —
                telling that user to upgrade would be selling something they cannot receive. */}
            {data.similarity_percentile_locked ? (
              <div className="share-card__rank is-locked">
                <LockKeyhole size={18} aria-hidden="true" />
                <span>การเทียบตำแหน่งกับกลุ่มอ้างอิงเปิดให้แผนพลัสและโปร</span>
              </div>
            ) : percentile !== null ? (
              <div className="share-card__rank">
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

                      It rides on the card itself rather than the page, because the card is the part
                      that gets saved as a file and sent to somebody: a qualifier that stays behind
                      on the screen has not qualified the thing that travelled. */}
                  {data.assumes_independent_metrics ? (
                    <em className="score-card__approximate"> · ค่าประมาณ ไม่ใช่ค่าที่แม่นยำ</em>
                  ) : null}
                </span>
              </div>
            ) : (
              <p className="score-card__withheld" role="status">
                คุณอยู่นอกกลุ่มอ้างอิง (คนไทย อายุ 18–35 ปี) จึงไม่แสดงการเทียบเป็นเปอร์เซ็นต์ —
                ตัวเลขที่วัดได้ยังใช้ได้ตามปกติ
              </p>
            )}

            {curve && (
              <figure className="share-card__curve">
                {/* Every colour here is a presentation attribute rather than a CSS class, and it
                    has to be. `html-to-image` deep-clones any <svg> it meets and stops there — it
                    copies computed styles onto the root element and onto no child of it — so a
                    class-styled path arrives in the PNG with its defaults: the area under this
                    curve came out as a solid black slab and the line and marker did not come out
                    at all. Attributes survive the clone, so the screen and the file agree.

                    For the same reason the fill is flat rather than a gradient: a `url(#…)`
                    reference resolves against a document the exported SVG cannot see. */}
                <svg viewBox="0 0 300 100" role="img" aria-label={curveCaption}>
                  <line
                    x1={CURVE_BOX.left}
                    x2={CURVE_BOX.right}
                    y1={CURVE_BOX.baseline}
                    y2={CURVE_BOX.baseline}
                    stroke="rgba(255, 255, 255, 0.1)"
                    strokeWidth="1"
                  />
                  <path d={`${curve}V${CURVE_BOX.baseline}H${CURVE_BOX.left}Z`} fill="rgba(111, 227, 200, 0.16)" />
                  <path d={curve} fill="none" stroke={CURVE_INK} strokeWidth="1.6" strokeLinejoin="round" />
                  {markerX !== null && (
                    <>
                      <line
                        x1={markerX}
                        x2={markerX}
                        y1={CURVE_BOX.peak}
                        y2={CURVE_BOX.baseline}
                        stroke="rgba(255, 255, 255, 0.34)"
                        strokeWidth="1"
                        strokeDasharray="2 3"
                      />
                      <circle cx={markerX} cy={CURVE_BOX.baseline} r="4" fill={CURVE_INK} stroke="#0f151c" strokeWidth="2" />
                    </>
                  )}
                </svg>
                <figcaption>{curveCaption}</figcaption>
              </figure>
            )}

            {/* Said once, under the photos, rather than left as two silent grey boxes. The card
                itself is built from analysis_data, which survives the photos being deleted. */}
            {(!data.front_url || !data.side_url) && (
              <p className="share-card__portrait-note" role="status">
                {data.images_expired
                  ? "ภาพถ่ายถูกลบตามกำหนด 30 วันแล้ว ตัวเลขและคะแนนทั้งหมดยังอยู่ครบ"
                  : "ยังไม่มีภาพสำหรับมุมนี้ — สแกนใหม่แบบเก็บภาพด้านข้างจะแสดงได้ครบทั้งสองมุม"}
              </p>
            )}

            {/* The sentence the file cannot leave without. Everything else on this card is a
                number, and a number in a camera roll has no context at all.

                A <p> rather than a <footer>: the stylesheet paints every bare `footer` element
                with the landing page's own background, which lands as a white slab across the
                bottom of this one. */}
            <p className="share-card__foot">
              วัดความใกล้ค่าเฉลี่ยของกลุ่มอ้างอิง — ไม่ใช่การให้คะแนนความสวยงาม และไม่ใช่คำวินิจฉัยทางการแพทย์
            </p>
          </div>

          <div className="share-card__actions">
            <button type="button" onClick={saveCard} disabled={saving}>
              <Download size={16} aria-hidden="true" />
              {saving ? "กำลังบันทึกภาพ…" : "ดาวน์โหลดการ์ด"}
            </button>
            {/* The trade the button makes, next to the button. Links to the photos on this page
                expire; a PNG of them does not. */}
            <p>ไฟล์ PNG · ภาพถ่ายบนการ์ดจะติดไปกับไฟล์และไม่หมดอายุเหมือนลิงก์บนหน้านี้</p>
            {saveError && <p className="share-card__error" role="status">{saveError}</p>}
          </div>
        </div>

        <GlassCard className="score-card">
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
    </div>
  );
}
