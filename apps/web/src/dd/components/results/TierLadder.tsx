"use client";

import { Check } from "lucide-react";
import type { Gender } from "@/types";
import type { Tier } from "@/lib/scoring/tier";
import { useT } from "@/lib/i18n";

interface TierLadderProps {
  currentTier: Tier;
  gender: Gender;
}

function tiersFor(gender: Gender): Tier[] {
  const top = gender === "male" ? "gigachad" : "goddess";
  const second = gender === "male" ? "chad" : "stacy";
  const third = gender === "male" ? "chadlite" : "stacylite";
  return [top, second, third, "htn", "mtn", "ltn"];
}

const RANGES: Record<Tier, string> = {
  gigachad: "9.0+",
  chad: "8.0+",
  chadlite: "7.5+",
  goddess: "9.0+",
  stacy: "8.0+",
  stacylite: "7.5+",
  htn: "6.0+",
  mtn: "4.5+",
  ltn: "< 4.5",
};

export function TierLadder({ currentTier, gender }: TierLadderProps) {
  const { t } = useT();
  const order = tiersFor(gender);

  return (
    <ul className="space-y-2">
      {order.map((tier) => {
        const active = tier === currentTier;
        return (
          <li
            key={tier}
            aria-current={active ? "true" : undefined}
            className={`rounded-xl border p-3 transition-colors ${
              active
                ? "border-[#2f6f66]/35 bg-[#eff8f8]/70 backdrop-blur-md"
                : "border-[#241f1a]/10 bg-white/70"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-medium ${
                    active ? "text-[#241f1a]" : "text-[#4d453f]"
                  }`}
                >
                  {t.tier[tier]}
                </span>
                <span className="text-xs tabular-nums text-[#6f625a]">
                  {RANGES[tier]}
                </span>
              </div>
              {active && (
                <span
                  aria-hidden="true"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2f6f66]/10 text-[#2f6f66]"
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <p className="pt-1 text-xs leading-relaxed text-[#625a52]">
              {t.tierDescription[tier]}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
