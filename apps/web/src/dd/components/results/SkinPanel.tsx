"use client";

import { Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { SkinResult } from "@/lib/scoring";
import { ScoreBar } from "./ScoreBar";

interface SkinPanelProps {
  skin: SkinResult;
}

export function SkinPanel({ skin }: SkinPanelProps) {
  const { t } = useT();
  const avg = (skin.uniformity + skin.clarity + skin.glow) / 3;
  const [r, g, b] = skin.meanRgb;
  return (
    <div className="space-y-4 rounded-2xl border border-[#241f1a]/10 bg-white/55 p-5 text-[#241f1a] shadow-[0_18px_55px_-42px_rgba(36,31,26,0.32)] backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#075f6d]" />
          <h3 className="text-base font-medium">{t.skin.heading}</h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            aria-hidden
            className="inline-block h-5 w-5 rounded-full border border-[#241f1a]/10"
            style={{ background: `rgb(${r},${g},${b})` }}
          />
          <span className="font-semibold tabular-nums text-[#241f1a]">
            {avg.toFixed(1)} / 10
          </span>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-[#5b5148]">
        {t.skin.note}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <SkinStat label={t.skin.uniformity} value={skin.uniformity} />
        <SkinStat label={t.skin.clarity} value={skin.clarity} />
        <SkinStat label={t.skin.glow} value={skin.glow} />
      </div>
      <p className="text-[10px] font-medium leading-relaxed text-[#5b5148]">
        {t.skin.privacyNote}
      </p>
    </div>
  );
}

function SkinStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2 rounded-xl border border-[#241f1a]/10 bg-white/40 p-3 text-[#241f1a] backdrop-blur-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#5b5148]">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-[#241f1a]">
          {value.toFixed(1)}
        </span>
      </div>
      <ScoreBar score={value} />
    </div>
  );
}
