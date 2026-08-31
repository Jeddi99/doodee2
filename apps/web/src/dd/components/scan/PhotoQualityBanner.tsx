"use client";

import { AlertTriangle, Info, X } from "lucide-react";
import type { PhotoQualityReport } from "@/lib/scoring";
import { useT } from "@/lib/i18n";

interface PhotoQualityBannerProps {
  report: PhotoQualityReport;
  onRetake: () => void;
  onDismiss: () => void;
}

const SEVERITY_ORDER = { bad: 0, warn: 1, ok: 2 } as const;

export function PhotoQualityBanner({
  report,
  onRetake,
  onDismiss,
}: PhotoQualityBannerProps) {
  const { t } = useT();
  if (report.overall === "ok" || report.issues.length === 0) return null;

  // Show up to 3 most-severe issues. Sort bad > warn so the first
  // visible line is the worst one.
  const top = [...report.issues]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, 3);

  const isBad = report.overall === "bad";
  const Icon = isBad ? AlertTriangle : Info;
  const tone = isBad
    ? "border-[#b7791f]/25 bg-[#fff8ec]/70 text-[#8a5a13]"
    : "border-[#3f6268]/20 bg-[#eff8f8]/70 text-[#3f6268]";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative mb-4 rounded-2xl border ${tone} px-4 py-3 backdrop-blur-md`}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t.dialog.close}
        className="absolute right-2 top-2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[#766e65] transition hover:bg-white/70 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <Icon className="h-4 w-4 flex-none mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.18em]">
            {isBad ? t.photoQuality.titleBad : t.photoQuality.titleWarn}
          </p>
          <ul className="space-y-0.5 text-[12px] leading-relaxed">
            {top.map((issue) => (
              <li key={`${issue.check}-${issue.fixKey}`} className="text-[#4f4841]">
                · {fixMessage(issue.fixKey, t.photoQuality.fix)}
              </li>
            ))}
          </ul>
          {isBad && (
            <button
              type="button"
              onClick={onRetake}
              className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/60 bg-white/60 px-4 py-2 text-[11px] font-semibold text-[#4f4841] backdrop-blur-md transition hover:bg-white/80 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35"
            >
              {t.photoQuality.retake}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function fixMessage(
  key: string,
  map: Record<string, string>
): string {
  return map[key] ?? key;
}
