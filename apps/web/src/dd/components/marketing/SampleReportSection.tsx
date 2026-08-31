"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";

import type { Lang } from "@/lib/i18n";

type Localized = Record<Lang, string>;

const LOGIN_HREF = "/login" as never;

// Sample data — the heading literally reads "ตัวอย่างรายงาน / Sample report"
// so it is never mistaken for a real scan (CLAUDE.md real-screenshot rule).
type Axis = {
  th: string;
  en: string;
  value: number;
  /** screen-space angle in degrees: -90 = top, +90 = bottom */
  angle: number;
};

const AXES: Axis[] = [
  { th: "ความสมดุล", en: "Harmony", value: 7.5, angle: -90 },
  { th: "ความคม", en: "Definition", value: 8.2, angle: -30 },
  { th: "ลักษณะเฉพาะเพศ", en: "Dimorphism", value: 8.2, angle: 30 },
  { th: "บริเวณดวงตา", en: "Eye area", value: 6.8, angle: 90 },
  { th: "ลักษณะใบหน้า", en: "Features", value: 7.7, angle: 150 },
  { th: "ความสมมาตร", en: "Symmetry", value: 7.9, angle: 210 },
];

// Metric rows ordered top→bottom to read as a tidy column beside the radar.
const CARDS: Axis[] = [
  AXES[1]!, // ความคม
  AXES[0]!, // ความสมดุล
  AXES[4]!, // ลักษณะใบหน้า
  AXES[3]!, // บริเวณดวงตา
  AXES[2]!, // ลักษณะเฉพาะเพศ
  AXES[5]!, // ความสมมาตร
];

const STRENGTHS: { th: string; en: string; value: string }[] = [
  { th: "ความสมมาตรของมุมตา", en: "Eye-angle symmetry", value: "8.2" },
  { th: "ความเอียงของแนวปาก", en: "Lip-line tilt", value: "8.2" },
  { th: "องศาตาเฉียง", en: "Canthal tilt", value: "8.2" },
];

const IMPROVE: { th: string; en: string; value: string }[] = [
  { th: "ความเอียงมุมปาก", en: "Mouth-corner tilt", value: "0.4" },
  { th: "สามส่วนของใบหน้า", en: "Facial thirds", value: "3.0" },
  { th: "ความสมมาตรของกราม", en: "Jaw symmetry", value: "4.1" },
];

const copy = {
  label: { th: "โครงสร้างรายงาน · ข้อมูลตัวอย่าง", en: "Report direction · sample data" },
  heading: {
    th: "รายงานที่เปลี่ยนการสแกนใบหน้าให้เป็นคำถามที่ชัดขึ้น",
    en: "A report that turns a face scan into better questions",
  },
  body: {
    th: "อ่านภาพรวมก่อน แล้วค่อยลงรายละเอียดว่าอะไรโดดเด่น อะไรควรสำรวจก่อน และควรถามอะไรเมื่อไปคลินิก",
    en: "Start with the whole face, then see what stands out, what to explore first, and what to ask at a clinic.",
  },
  strengthsTitle: { th: "จุดแข็ง", en: "Strengths" },
  improveTitle: { th: "จุดที่คุ้มถ้าถามก่อน", en: "Worth checking first" },
  privacy: {
    th: "ข้อมูลของคุณปลอดภัย เราไม่เก็บภาพโดยไม่ได้รับอนุญาต",
    en: "Your data is private — we never store photos without consent.",
  },
  learnMore: { th: "เปิดรายงานของฉัน", en: "Open my report" },
} satisfies Record<string, Localized>;

const ANNOTATIONS: Record<Lang, readonly string[]> = {
  th: ["เห็นอะไรเด่น", "ควรสำรวจอะไรก่อน", "ควรถามอะไรที่คลินิก"],
  en: ["What stands out", "What to explore first", "What to ask at a clinic"],
};

// Radar geometry. The viewBox keeps a margin around the data circle so the
// outer labels stay inside the SVG box (no clipping when it scales down).
const CX = 240;
const CY = 182;
const R = 96; // data radius at value 10
const LR = 130; // label ring radius
const RINGS = [0.25, 0.5, 0.75, 1] as const;

function polar(angleDeg: number, radius: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [CX + Math.cos(rad) * radius, CY + Math.sin(rad) * radius];
}

function ringPath(scale: number): string {
  return (
    AXES.map((axis, i) => {
      const [x, y] = polar(axis.angle, R * scale);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ") + " Z"
  );
}

function dataPath(): string {
  return (
    AXES.map((axis, i) => {
      const [x, y] = polar(axis.angle, (R * axis.value) / 10);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ") + " Z"
  );
}

export function SampleReportSection({ lang }: { lang: Lang }) {
  return (
    <section
      id="report"
      className="landing-clinical-section mx-auto w-full max-w-[88rem] px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-36"
    >
      <div data-reveal className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-8">
          <p className="landing-section-label">{copy.label[lang]}</p>
          <h2 className="mt-5 max-w-[14ch] text-balance font-display text-[2.75rem] font-semibold leading-[0.98] tracking-normal text-[#071225] sm:text-5xl lg:text-[4rem]">
            {copy.heading[lang]}
          </h2>
          <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-[#53616d] sm:text-lg sm:leading-8">
            {copy.body[lang]}
          </p>
        </div>
        <div className="lg:col-span-4 lg:self-end">
          <ol className="border-t border-[#071225]/14">
            {ANNOTATIONS[lang].map((item, index) => (
              <li key={item} className="grid min-h-14 grid-cols-[2rem_1fr] items-center border-b border-[#071225]/14 text-sm font-semibold text-[#243443]">
                <span className="text-[#087e8b] tabular-nums">0{index + 1}</span>
                {item}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div data-reveal className="landing-report-sheet mt-12 overflow-hidden rounded-2xl border border-[#071225]/14 bg-white">
        <div className="grid lg:grid-cols-12">
          <div className="border-b border-[#071225]/12 p-5 sm:p-8 lg:col-span-7 lg:border-b-0 lg:border-r">
            <svg
              viewBox="0 0 480 400"
              className="mx-auto h-auto w-full max-w-[34rem] overflow-visible"
              fill="none"
              role="img"
              aria-label={lang === "th" ? "ตัวอย่างกราฟเรดาร์ภาพรวมใบหน้า" : "Sample face-overview radar chart"}
            >
              <g fill="none" stroke="rgba(7,18,37,0.10)" strokeWidth="1" strokeLinejoin="round">
                {RINGS.map((scale) => <path key={scale} d={ringPath(scale)} />)}
                {AXES.map((axis) => {
                  const [x, y] = polar(axis.angle, R);
                  return <line key={axis.en} x1={CX} y1={CY} x2={x} y2={y} stroke="rgba(7,18,37,0.07)" />;
                })}
              </g>
              <path d={dataPath()} fill="rgba(8,126,139,0.12)" stroke="#087e8b" strokeWidth="2" strokeLinejoin="round" />
              {AXES.map((axis) => {
                const [x, y] = polar(axis.angle, (R * axis.value) / 10);
                return <circle key={axis.en} cx={x} cy={y} r="3.4" fill="#087e8b" />;
              })}
              <g style={{ fontFamily: "var(--font-barlow), var(--font-sarabun), sans-serif" }}>
                {AXES.map((axis) => {
                  const [lx, ly] = polar(axis.angle, LR);
                  const cos = Math.cos((axis.angle * Math.PI) / 180);
                  const anchor = Math.abs(cos) < 0.01 ? "middle" : cos > 0 ? "start" : "end";
                  return (
                    <text key={axis.en} x={lx} y={ly} textAnchor={anchor}>
                      <tspan x={lx} fill="#53616d" fontSize="15" fontWeight={600}>{axis[lang]}</tspan>
                      <tspan x={lx} dy="18" fill="#071225" fontSize="17" fontWeight={700} className="tabular-nums">{axis.value.toFixed(1)}</tspan>
                    </text>
                  );
                })}
              </g>
            </svg>
          </div>

          <div className="lg:col-span-5">
            <div className="border-b border-[#071225]/12 px-5 py-4 text-sm font-semibold text-[#071225] sm:px-7">
              {lang === "th" ? "ภาพรวม 6 หมวด" : "Six-category overview"}
            </div>
            <dl>
              {CARDS.map((axis) => (
                <div key={axis.en} className="flex min-h-14 items-center justify-between gap-4 border-b border-[#071225]/10 px-5 py-3 last:border-b-0 sm:px-7">
                  <dt className="text-sm font-medium text-[#53616d]">{axis[lang]}</dt>
                  <dd className="font-display text-xl font-semibold tabular-nums text-[#071225]">{axis.value.toFixed(1)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="grid border-t border-[#071225]/12 sm:grid-cols-2">
          <ScoreList tone="good" title={copy.strengthsTitle[lang]} items={STRENGTHS.map((item) => ({ label: item[lang], value: item.value }))} />
          <ScoreList tone="improve" title={copy.improveTitle[lang]} items={IMPROVE.map((item) => ({ label: item[lang], value: item.value }))} />
        </div>

        <div className="flex flex-col gap-4 border-t border-[#071225]/12 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-start gap-2 text-sm font-medium leading-6 text-[#53616d]">
            <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-[#087e8b]" />
            {copy.privacy[lang]}
          </div>
          <Link href={LOGIN_HREF} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#071225] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#102541] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087e8b] focus-visible:ring-offset-2 focus-visible:ring-offset-white">
            {copy.learnMore[lang]}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

function ScoreList({
  tone,
  title,
  items,
}: {
  tone: "good" | "improve";
  title: string;
  items: { label: string; value: string }[];
}) {
  const isGood = tone === "good";
  const Icon = isGood ? TrendingUp : TrendingDown;
  const accent = isGood ? "text-[#087e8b]" : "text-[#7252b8]";
  return (
    <article className="border-b border-[#071225]/12 p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:p-8 sm:last:border-r-0">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
        <h3 className="font-display text-xl font-semibold leading-snug tracking-normal text-[#071225]">
          {title}
        </h3>
      </div>
      <ul className="mt-4 border-t border-[#071225]/10">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex min-h-11 items-center justify-between gap-3 border-b border-[#071225]/10 text-sm last:border-b-0"
          >
            <span className="leading-tight text-[#53616d]">{item.label}</span>
            <span className={`shrink-0 font-semibold tabular-nums ${accent}`}>
              {item.value}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
