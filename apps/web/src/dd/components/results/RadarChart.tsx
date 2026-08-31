"use client";

import { memo, useMemo } from "react";
import { m } from "framer-motion";
import type { Category } from "@/lib/scoring";
import { useT } from "@/lib/i18n";

interface RadarChartProps {
  categoryScores: Partial<Record<Category, number>>;
}

const SIZE = 400;
const CENTER = SIZE / 2;
const RADIUS = 112;
const LABEL_OFFSET = 56;
const RINGS = 5;
const GRID_STROKE = "var(--doodee-radar-grid, rgba(248,250,252,0.18))";
const AXIS_STROKE = "var(--doodee-radar-axis, rgba(248,250,252,0.14))";
const DATA_FILL = "var(--doodee-radar-fill, rgba(125,211,252,0.16))";
const DATA_STROKE = "var(--doodee-radar-stroke, #67e8f9)";
const DOT_FILL = "var(--doodee-radar-dot, #e9d5ff)";
const DOT_STROKE = "var(--doodee-radar-dot-stroke, #050816)";
const LABEL_FILL = "var(--doodee-radar-label, #f8fafc)";
const LABEL_MUTED_FILL = "var(--doodee-radar-label-muted, rgba(248,250,252,0.78))";
const LABEL_HALO = "var(--doodee-radar-label-halo, rgba(5,8,22,0.92))";

const CATEGORIES_ORDER: Category[] = [
  "harmony",
  "angularity",
  "dimorphism",
  "eye-area",
  "features",
  "symmetry",
];

function vertex(index: number, total: number, r: number) {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / total;
  return {
    x: CENTER + r * Math.cos(angle),
    y: CENTER + r * Math.sin(angle),
  };
}

function labelAnchor(x: number) {
  if (x > CENTER + 24) return "start";
  if (x < CENTER - 24) return "end";
  return "middle";
}

function labelPosition(index: number, total: number) {
  const v = vertex(index, total, RADIUS + LABEL_OFFSET);
  const textAnchor = labelAnchor(v.x);
  return {
    x: textAnchor === "start" ? SIZE - 96 : textAnchor === "end" ? 96 : v.x,
    y: Math.max(38, Math.min(SIZE - 34, v.y)),
    textAnchor,
  };
}

function RadarChartImpl({ categoryScores }: RadarChartProps) {
  const { t } = useT();
  const cats = useMemo(
    () => CATEGORIES_ORDER.filter((c) => categoryScores[c] !== undefined),
    [categoryScores],
  );
  const total = cats.length;

  const rings = useMemo(() => {
    const out: string[] = [];
    for (let r = 1; r <= RINGS; r++) {
      const ringR = (r / RINGS) * RADIUS;
      const points = cats.map((_, i) => {
        const v = vertex(i, total, ringR);
        return `${v.x.toFixed(1)},${v.y.toFixed(1)}`;
      });
      out.push(points.join(" "));
    }
    return out;
  }, [cats, total]);

  const userPoints = useMemo(
    () =>
      cats
        .map((c, i) => {
          const score = categoryScores[c] ?? 0;
          const r = (Math.max(0, Math.min(10, score)) / 10) * RADIUS;
          const v = vertex(i, total, r);
          return `${v.x.toFixed(1)},${v.y.toFixed(1)}`;
        })
        .join(" "),
    [cats, categoryScores, total],
  );

  const labels = useMemo(
    () =>
      cats.map((c, i) => {
        const v = labelPosition(i, total);
        return {
          x: v.x,
          y: v.y,
          label: t.category[c],
          score: categoryScores[c] ?? 0,
          textAnchor: v.textAnchor,
        };
      }),
    [cats, categoryScores, total, t.category],
  );

  const userDots = useMemo(
    () =>
      cats.map((c, i) => {
        const score = categoryScores[c] ?? 0;
        const r = (Math.max(0, Math.min(10, score)) / 10) * RADIUS;
        return vertex(i, total, r);
      }),
    [cats, categoryScores, total],
  );

  if (total < 3) return null;

  const ariaSummary = cats
    .map((c) => `${t.category[c]} ${(categoryScores[c] ?? 0).toFixed(1)}/10`)
    .join(", ");

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="doodee-radar-chart mx-auto h-auto w-full max-w-sm overflow-hidden"
      role="img"
      aria-label={`${t.result.radarLabel}: ${ariaSummary}`}
    >
      {rings.map((points, i) => (
        <polygon
          key={i}
          points={points}
          fill="none"
          stroke={GRID_STROKE}
          strokeWidth={i === RINGS - 1 ? 1.25 : 1}
          opacity={0.35 + (i / (RINGS - 1)) * 0.5}
        />
      ))}
      {cats.map((_, i) => {
        const v = vertex(i, total, RADIUS);
        return (
          <line
            key={i}
            x1={CENTER}
            y1={CENTER}
            x2={v.x}
            y2={v.y}
            stroke={AXIS_STROKE}
            strokeWidth="1"
          />
        );
      })}
      <m.polygon
        points={userPoints}
        fill={DATA_FILL}
        stroke={DATA_STROKE}
        strokeWidth="2"
        strokeLinejoin="round"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
      />
      {userDots.map((d, i) => (
        <circle
          key={i}
          cx={d.x.toFixed(1)}
          cy={d.y.toFixed(1)}
          r="2.5"
          fill={DOT_FILL}
          stroke={DOT_STROKE}
          strokeWidth="1"
        />
      ))}
      {labels.map((l, i) => (
        <text
          key={i}
          x={l.x.toFixed(1)}
          y={l.y.toFixed(1)}
          textAnchor={l.textAnchor}
          dominantBaseline="middle"
          fill={LABEL_FILL}
          stroke={LABEL_HALO}
          strokeLinejoin="round"
          strokeWidth="4"
          paintOrder="stroke"
          style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0" }}
        >
          <tspan x={l.x.toFixed(1)} dy="-0.35em">
            {l.label}
          </tspan>
          <tspan
            x={l.x.toFixed(1)}
            dy="1.2em"
            fill={LABEL_MUTED_FILL}
            style={{ fontSize: "10px", fontWeight: 700 }}
          >
            {l.score.toFixed(1)}
          </tspan>
        </text>
      ))}
    </svg>
  );
}

export const RadarChart = memo(RadarChartImpl);
