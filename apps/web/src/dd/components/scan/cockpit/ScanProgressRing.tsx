"use client";

import { useId } from "react";
import { useT } from "@/lib/i18n";

export function ScanProgressRing({
  value,
  labelTh,
  labelEn,
  size = 180,
}: {
  value: number;
  labelTh?: string;
  labelEn?: string;
  size?: number;
}) {
  const { t, lang } = useT();
  const id = useId().replace(/:/g, "");
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const label =
    lang === "th"
      ? labelTh ?? t.scanCockpit.progress.processing
      : labelEn ?? t.scanCockpit.progress.processing;

  return (
    <svg
      viewBox="0 0 180 180"
      className="max-w-full shrink-0"
      style={{ width: `min(${size}px, 100%)`, height: "auto" }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0f6f7f" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
      </defs>
      <circle
        cx="90"
        cy="90"
        r={radius}
        fill="none"
        stroke="rgba(36,31,26,0.10)"
        strokeWidth="12"
      />
      <circle
        cx="90"
        cy="90"
        r={radius}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 90 90)"
      />
      <text
        x="90"
        y="81"
        textAnchor="middle"
        className="fill-[#241f1a] font-serif text-[34px] font-light italic tabular-nums"
      >
        {Math.round(clamped)}%
      </text>
      <text
        x="90"
        y="105"
        textAnchor="middle"
        className="fill-[#3d3731] text-[10px] font-semibold uppercase tracking-[0.16em]"
      >
        {label}
      </text>
      <text
        x="90"
        y="123"
        textAnchor="middle"
        className="fill-[#5b5148] text-[9px] font-medium"
      >
        {t.scanCockpit.progress.aiAnalyzing}
      </text>
    </svg>
  );
}
