import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "../DashboardPage";
import { getSkinTrend } from "../../lib/api";
import { position, runPath, trendRows, trendSeries } from "../../lib/skinTrend";
import { useLocale } from "../../useLocale";

/**
 * One signal's history, six times over.
 *
 * ## Why six charts and not one
 *
 * The six signals do not share a scale — `texture` lives near 0.02 and `tone_spread` near 15. On
 * one pair of axes, five of them would be a flat line along the bottom; on two axes, the crossing
 * point of the two scales is a picture the data never made. Small multiples are the answer to
 * "several measures, same shape, different units", and each panel gets the whole height for its
 * own range.
 *
 * With one series per panel there is no legend: the title names the line, and colour is not being
 * asked to tell two things apart.
 *
 * ## The gap is the point
 *
 * The server returns runs rather than a flat list, because `comparison_break` decided some pairs
 * of scans may not be compared — a different room, a different exposure, or a change in how the
 * measurement itself is defined. Those breaks are drawn as *absence*: separate paths, both
 * endpoints still plotted, and a marker in the space between carrying the reason.
 *
 * A dashed line across the gap was the obvious alternative and it is wrong. Dashes still join the
 * two points to the eye and still invite a slope to be read across them, which is exactly the
 * reading the backend refused to endorse — the difference would be the light, not the user.
 */

const COPY = {
  th: {
    title: "แนวโน้มข้ามครั้ง",
    lead: "แต่ละช่องคือสัญญาณเดียว ตามเวลาที่สแกน · ช่องว่างคือช่วงที่เทียบกันไม่ได้",
    empty: "ต้องมีอย่างน้อยสองสแกนที่เทียบกันได้จึงจะเห็นแนวโน้ม",
    table: "ดูเป็นตาราง",
    chart: "ดูเป็นกราฟ",
    date: "วันที่",
    value: "ค่า",
    unreadable: "อ่านค่าไม่ได้",
    breaks: {
      engine_version: "เปลี่ยนวิธีวัด จึงไม่เทียบกับค่าก่อนหน้า",
      brightness: "ความสว่างต่างกันมากเกินกว่าจะเทียบกัน",
      colour_cast: "สีของแสงต่างกันมากเกินกว่าจะเทียบกัน",
      white_balance: "การปรับสมดุลสีขาวต่างกัน จึงไม่เทียบกัน",
      unreadable: "มีสแกนที่อ่านค่าไม่ได้คั่นอยู่",
    } as Record<string, string>,
  },
  en: {
    title: "Across scans",
    lead: "One signal per panel, over time. A gap is a pair we could not honestly compare.",
    empty: "Two comparable scans are needed before a trend means anything.",
    table: "Show as a table",
    chart: "Show as a chart",
    date: "Date",
    value: "Value",
    unreadable: "Could not be read",
    breaks: {
      engine_version: "How this is measured changed, so it is not compared to what came before",
      brightness: "Too far apart in brightness to compare",
      colour_cast: "Too far apart in the colour of the light to compare",
      white_balance: "Corrected differently, so they are not compared",
      unreadable: "A scan in between could not be read",
    } as Record<string, string>,
  },
} as const;

const WIDTH = 260;
const HEIGHT = 72;
const PAD = 8;

type Run = { break_reason: string | null; points: Record<string, unknown>[] };

/**
 * The shapes `lib/skinTrend.js` hands back. Declared here rather than there because that module
 * is plain JavaScript on purpose — it is exercised by `node --test`, where the geometry is the
 * thing worth pinning and a type annotation would be noise.
 */
type TrendPoint = { scanId: string; capturedAt: string; at: number; value: number; x: number; y: number };
type TrendRun = { breakReason: string | null; points: TrendPoint[] };
type TrendRow = {
  scan_id: string;
  captured_at: string;
  readable: boolean;
  signals: Record<string, number | null>;
  breakReason: string | null;
};

export default function SkinTrend({ signalLabels }: { signalLabels: Record<string, string> }) {
  const { locale } = useLocale();
  const copy = COPY[locale === "en" ? "en" : "th"];
  const [asTable, setAsTable] = useState(false);
  const trend = useQuery({ queryKey: ["skin-trend"], queryFn: getSkinTrend });

  const series: Run[] = trend.data?.series ?? [];
  const drawn = Object.keys(signalLabels)
    .map((key) => ({ key, data: trendSeries(series, key) }))
    .filter((item) => item.data.count >= 2);

  if (trend.isLoading || !series.length) return null;

  if (!drawn.length) {
    return (
      <GlassCard className="skin-trend">
        <h2>{copy.title}</h2>
        <p>{copy.empty}</p>
      </GlassCard>
    );
  }

  const rows = trendRows(series);
  const dateOf = (value: string) =>
    new Date(value).toLocaleDateString(locale === "en" ? "en-GB" : "th-TH", {
      day: "numeric", month: "short", year: "numeric",
    });

  return (
    <GlassCard className="skin-trend">
      <div className="skin-trend__head">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.lead}</p>
        </div>
        {/* Not a nicety: the table is where an unreadable scan gets to say what went wrong, and
            where the history is readable without seeing the chart at all. */}
        <button type="button" className="skin-vision__toggle" onClick={() => setAsTable(!asTable)}>
          {asTable ? copy.chart : copy.table}
        </button>
      </div>

      {asTable ? (
        <table className="skin-trend__table">
          <thead>
            <tr>
              <th scope="col">{copy.date}</th>
              {Object.entries(signalLabels).map(([key, label]) => (
                <th scope="col" key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows as TrendRow[]).map((row: TrendRow) => (
              <tr key={row.scan_id as string}>
                <th scope="row">
                  {dateOf(row.captured_at)}
                  {row.breakReason ? (
                    <small> · {copy.breaks[row.breakReason] || row.breakReason}</small>
                  ) : null}
                </th>
                {Object.keys(signalLabels).map((key) => {
                  const value = row.signals?.[key];
                  return (
                    <td key={key}>
                      {row.readable && typeof value === "number" ? value.toFixed(2) : copy.unreadable}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="skin-trend__grid">
          {drawn.map(({ key, data }) => (
            <figure key={key} className="skin-trend__chart">
              <figcaption>
                {signalLabels[key]}
                <span>{data.min.toFixed(2)} – {data.max.toFixed(2)}</span>
              </figcaption>
              <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={signalLabels[key]}>
                {(data.runs as TrendRun[]).map((run: TrendRun, index: number) => {
                  const previous = data.runs[index - 1];
                  const gapAt = previous
                    ? (position(previous.points[previous.points.length - 1], WIDTH, HEIGHT, PAD)[0]
                       + position(run.points[0], WIDTH, HEIGHT, PAD)[0]) / 2
                    : null;
                  return (
                    <g key={run.points[0].scanId}>
                      {gapAt !== null && (
                        <g className="skin-trend__break">
                          {/* A fence, not a bridge. */}
                          <line x1={gapAt} y1={2} x2={gapAt} y2={HEIGHT - 2} />
                          <title>{copy.breaks[run.breakReason || ""] || copy.breaks.unreadable}</title>
                        </g>
                      )}
                      {run.points.length > 1 && (
                        <path d={runPath(run.points, WIDTH, HEIGHT, PAD)} className="skin-trend__line" />
                      )}
                      {run.points.map((point: TrendPoint) => {
                        const [x, y] = position(point, WIDTH, HEIGHT, PAD);
                        return (
                          <g key={point.scanId}>
                            {/* Hit area far larger than the 8px mark, for touch. */}
                            <circle cx={x} cy={y} r={14} fill="transparent" />
                            <circle cx={x} cy={y} r={4} className="skin-trend__dot" />
                            <title>{`${dateOf(point.capturedAt)} · ${point.value.toFixed(2)}`}</title>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            </figure>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
