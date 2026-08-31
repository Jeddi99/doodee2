"use client";

import { useT } from "@/lib/i18n";

interface BellCurveProps {
  score: number;
  label?: string;
}

function percentile(score: number): number {
  const clamped = Math.max(0, Math.min(10, score));
  return Math.round(10 + (clamped / 10) * 89);
}

const WIDTH = 280;
const HEIGHT = 118;
const GRAPH_HEIGHT = 88;
const STDEV = 1.667;
const SAMPLES = 60;
const PEAK_FRACTION = 0.9;

function curvePath(): string {
  const points: string[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const sx = -3 + (i / SAMPLES) * 6;
    const px = (i / SAMPLES) * WIDTH;
    const py =
      GRAPH_HEIGHT - GRAPH_HEIGHT * PEAK_FRACTION * Math.exp(-(sx * sx) / 2);
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return `M 0,${GRAPH_HEIGHT} L ${points.join(" L ")} L ${WIDTH},${GRAPH_HEIGHT} Z`;
}

const CURVE = curvePath();

export function BellCurve({ score, label }: BellCurveProps) {
  const { t } = useT();
  const stddev = (score - 5) / STDEV;
  const markerX = Math.max(0, Math.min(WIDTH, ((stddev + 3) / 6) * WIDTH));
  const markerLabelX = Math.max(24, Math.min(WIDTH - 24, markerX));
  const pct = percentile(score);
  const pctText = t.result.percentile.replace("{pct}", String(pct));

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={label ?? t.result.overallDistribution}
      >
        <path
          d={CURVE}
          fill="rgba(63,98,104,0.14)"
          stroke="rgba(63,98,104,0.58)"
          strokeWidth="1.25"
        />
        <line
          x1="0"
          y1={GRAPH_HEIGHT - 0.5}
          x2={WIDTH}
          y2={GRAPH_HEIGHT - 0.5}
          stroke="rgba(36,31,26,0.18)"
          strokeWidth="1"
        />
        <line
          x1={markerX}
          y1="18"
          x2={markerX}
          y2={GRAPH_HEIGHT}
          stroke="#241f1a"
          strokeWidth="1.75"
        />
        <circle
          cx={markerX}
          cy="18"
          r="4"
          fill="#3f6268"
          stroke="#fbfaf7"
          strokeWidth="1.5"
        />
        <text
          x={markerLabelX}
          y="11"
          textAnchor="middle"
          fill="#241f1a"
          stroke="#fbfaf7"
          strokeWidth="3"
          paintOrder="stroke"
          style={{ fontSize: "10px", fontWeight: 700 }}
        >
          {score.toFixed(1)}
        </text>
        <text
          x="0"
          y={HEIGHT - 4}
          fill="#5b5148"
          style={{ fontSize: "9px", fontWeight: 600 }}
        >
          0
        </text>
        <text
          x={WIDTH / 2}
          y={HEIGHT - 4}
          textAnchor="middle"
          fill="#7c746d"
          style={{ fontSize: "9px", fontWeight: 600 }}
        >
          5
        </text>
        <text
          x={WIDTH}
          y={HEIGHT - 4}
          textAnchor="end"
          fill="#5b5148"
          style={{ fontSize: "9px", fontWeight: 600 }}
        >
          10
        </text>
      </svg>
      <p className="text-center text-xs font-medium tabular-nums text-[#4d463f]">
        {pctText}
      </p>
    </div>
  );
}
