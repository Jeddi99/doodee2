interface ScoreBarProps {
  score: number;
  ariaLabel?: string;
}

function fillColor(score: number): string {
  if (score >= 8) return "#047857";
  if (score >= 5) return "#b7791f";
  return "#b42318";
}

export function ScoreBar({ score, ariaLabel }: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(10, score));
  const pct = (clamped / 10) * 100;
  const markerPct = Math.max(2, Math.min(98, pct));

  return (
    <div
      role="meter"
      aria-valuenow={Number(clamped.toFixed(1))}
      aria-valuemin={0}
      aria-valuemax={10}
      aria-label={ariaLabel || `Score ${score} out of 10`}
      className="relative h-3 w-full overflow-hidden rounded-full border border-[#241f1a]/10 bg-[#d9d0c4]"
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${pct}%`,
          background: fillColor(clamped),
        }}
      />
      <span
        aria-hidden
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#241f1a] shadow-[0_6px_14px_rgba(36,31,26,0.22)]"
        style={{ left: `${markerPct}%` }}
      />
    </div>
  );
}
