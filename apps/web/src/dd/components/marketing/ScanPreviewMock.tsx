"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { animate, m, useReducedMotion } from "framer-motion";
import { CheckCircle2, Gauge, ShieldCheck, TrendingUp } from "lucide-react";
import { useT } from "@/lib/i18n";

interface RadarPoint {
  label: string;
  score: number;
}

const SIZE = 280;
const CENTER = SIZE / 2;
const RADIUS = 96;
const RINGS = 4;

function vertex(index: number, total: number, r: number) {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / total;
  return {
    x: CENTER + r * Math.cos(angle),
    y: CENTER + r * Math.sin(angle),
  };
}

interface ScanPreviewMockProps {
  overallLabel: string;
  tierLabel: string;
  tierTagline: string;
  points: RadarPoint[];
  planTitle: string;
  planItems: string[];
  outOfLabel: string;
}

export function ScanPreviewMock({
  overallLabel,
  tierLabel,
  tierTagline,
  points,
  planTitle,
  planItems,
  outOfLabel,
}: ScanPreviewMockProps) {
  const { lang } = useT();
  const shouldReduceMotion = useReducedMotion();
  const total = points.length;
  const rings: string[] = [];

  for (let r = 1; r <= RINGS; r++) {
    const ringR = (r / RINGS) * RADIUS;
    const pts = points.map((_, i) => {
      const v = vertex(i, total, ringR);
      return `${v.x.toFixed(1)},${v.y.toFixed(1)}`;
    });
    rings.push(pts.join(" "));
  }

  const userPoints = points
    .map((p, i) => {
      const r = (Math.max(0, Math.min(10, p.score)) / 10) * RADIUS;
      const v = vertex(i, total, r);
      return `${v.x.toFixed(1)},${v.y.toFixed(1)}`;
    })
    .join(" ");

  const labels = points.map((p, i) => {
    const v = vertex(i, total, RADIUS + 26);
    return { x: v.x, y: v.y, label: p.label, score: p.score };
  });

  const [overall, setOverall] = useState(0);
  useEffect(() => {
    if (shouldReduceMotion) {
      setOverall(8.2);
      return;
    }

    const ctrl = animate(0, 8.2, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setOverall,
    });
    return () => ctrl.stop();
  }, [shouldReduceMotion]);

  return (
    <div className="relative mx-auto w-full max-w-md">
      <FloatingBadge
        className="-left-4 -top-6"
        icon={<Gauge className="h-3.5 w-3.5 text-[#056f82]" />}
        kicker={lang === "th" ? "ปรับบริบท" : "Calibration"}
        label={lang === "th" ? "ไทย / เอเชีย" : "Thai / Asian"}
        delay={0.6}
      />
      <FloatingBadge
        className="-right-4 top-1/3"
        icon={<TrendingUp className="h-3.5 w-3.5 text-[#2f6f66]" />}
        kicker={lang === "th" ? "สรุปผล" : "Reading"}
        label={lang === "th" ? "ฐานเปรียบเทียบชัด" : "Baseline clarity"}
        delay={0.85}
      />
      <FloatingBadge
        className="-bottom-4 -left-2"
        icon={<ShieldCheck className="h-3.5 w-3.5 text-good" />}
        kicker={lang === "th" ? "ความเป็นส่วนตัว" : "Privacy"}
        label={lang === "th" ? "ประเมินในเบราว์เซอร์" : "Browser assessment"}
        delay={1.1}
      />

      <div className="relative space-y-6 overflow-hidden rounded-[2rem] border border-[#241f1a]/10 bg-white/60 p-6 shadow-[0_28px_80px_-56px_rgba(23,20,18,0.44)] backdrop-blur-md sm:p-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#067e96]/30 to-transparent" />

        <div className="flex items-baseline justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#887f75]">
              {overallLabel}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-6xl font-light italic tabular-nums text-[#241f1a]">
                {overall.toFixed(1)}
              </span>
              <span className="text-xs tabular-nums text-[#887f75]">
                / {outOfLabel}
              </span>
            </div>
          </div>
          <div className="space-y-0.5 text-right">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#887f75]">
              {tierLabel}
            </p>
            <p className="font-semibold text-[#056f82]">
              {lang === "th" ? "ฐานเปรียบเทียบชัด" : "Baseline clarity"}
            </p>
            <p className="text-[10px] text-[#887f75]">{tierTagline}</p>
          </div>
        </div>

        <div className="relative">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="h-auto w-full"
            role="img"
            aria-label={lang === "th" ? "ตัวอย่างเรดาร์คะแนน" : "Score radar preview"}
          >
            <defs>
              <radialGradient id="radar-fill" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(6,126,150,0.2)" />
                <stop offset="100%" stopColor="rgba(47,111,102,0.08)" />
              </radialGradient>
            </defs>
            {rings.map((pts, i) => (
              <polygon
                key={i}
                points={pts}
                fill="none"
                stroke="rgba(23,20,18,0.08)"
                strokeWidth="0.8"
              />
            ))}
            {points.map((_, i) => {
              const v = vertex(i, total, RADIUS);
              return (
                <line
                  key={i}
                  x1={CENTER}
                  y1={CENTER}
                  x2={v.x}
                  y2={v.y}
                  stroke="rgba(23,20,18,0.08)"
                  strokeWidth="0.8"
                />
              );
            })}
            <m.polygon
              points={userPoints}
              fill="url(#radar-fill)"
              stroke="rgba(6,126,150,0.82)"
              strokeWidth="1.8"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
            />
            {points.map((p, i) => {
              const r = (Math.max(0, Math.min(10, p.score)) / 10) * RADIUS;
              const v = vertex(i, total, r);
              return (
                <m.circle
                  key={i}
                  cx={v.x}
                  cy={v.y}
                  r="2.5"
                  fill="#241f1a"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    duration: 0.3,
                    delay: 0.5 + i * 0.07,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              );
            })}
            {labels.map((l, i) => (
              <text
                key={i}
                x={l.x.toFixed(1)}
                y={l.y.toFixed(1)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="rgba(23,20,18,0.68)"
                style={{ fontSize: "10px", letterSpacing: "0.02em" }}
              >
                {l.label}
              </text>
            ))}
          </svg>
        </div>

        <div className="space-y-3 rounded-2xl border border-[#241f1a]/10 bg-white/40 p-4 backdrop-blur-md">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#887f75]">
            {planTitle}
          </p>
          <ol className="space-y-2">
            {planItems.map((item, i) => (
              <m.li
                key={i}
                className="flex items-center gap-3 text-sm"
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.3, delay: 0.45 + i * 0.08 }}
              >
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border border-[#241f1a]/10 bg-white/60 text-[10px] tabular-nums text-[#056f82] backdrop-blur-md">
                  {i + 1}
                </span>
                <span className="text-[#4f4841]">{item}</span>
              </m.li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function FloatingBadge({
  className,
  icon,
  kicker,
  label,
  delay,
}: {
  className: string;
  icon: ReactNode;
  kicker: string;
  label: string;
  delay: number;
}) {
  return (
    <m.div
      className={`absolute z-10 hidden sm:block ${className}`}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.6, delay }}
    >
      <div className="flex items-center gap-2 rounded-2xl border border-[#241f1a]/10 bg-white/60 px-3 py-2 shadow-[0_18px_40px_-30px_rgba(23,20,18,0.45)] backdrop-blur-md">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/40">
          {icon}
        </div>
        <div className="space-y-0.5">
          <p className="text-[9px] uppercase leading-none tracking-[0.14em] text-[#887f75]">
            {kicker}
          </p>
          <p className="text-[11px] font-semibold leading-tight text-[#241f1a]">
            {label}
          </p>
        </div>
        <CheckCircle2 className="h-3.5 w-3.5 text-good" />
      </div>
    </m.div>
  );
}
