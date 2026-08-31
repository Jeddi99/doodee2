"use client";

/**
 * Phase 128 — dynamic-import wrapper for SurgeryFlow.
 *
 * Keeps the /surgery route bundle tiny — the SurgeryFlow component
 * pulls in PhotoUpload, ApiKeyDialog, and the heavy SurgeryPreviewCard
 * (which itself dynamic-imports the before/after slider). Lazy-loading
 * the whole tree gives the route a fast first paint with skeleton.
 */

import dynamic from "next/dynamic";
import { Scissors } from "lucide-react";

const SurgeryFlow = dynamic(
  () =>
    import("./SurgeryFlow").then((m) => ({
      default: m.SurgeryFlow,
    })),
  {
    ssr: false,
    loading: () => <SurgerySkeleton />,
  }
);

function SurgerySkeleton() {
  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/55 p-5 shadow-[0_22px_66px_-52px_rgba(36,31,26,0.36)] backdrop-blur-md sm:p-6 lg:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#0f6f7f]/20 bg-[#eff8f8]/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0f6f7f] backdrop-blur-md">
          <Scissors className="h-3 w-3 animate-pulse" />
          วางแผนก่อนปรึกษา
        </div>
        <h1 className="mt-4 max-w-3xl font-sans text-3xl font-semibold leading-tight text-[#241f1a] sm:text-4xl">
          วางแผนหัตถการก่อนปรึกษาแพทย์
        </h1>
        <p className="mt-3 max-w-xl text-sm text-[#5f574f]">
          กำลังเตรียมรายงานก่อนปรึกษา…
        </p>
        <div className="mt-8 max-w-xl">
          <div className="rounded-2xl border-2 border-dashed border-[#241f1a]/10 bg-white/45 p-12 backdrop-blur-md">
            <div className="mx-auto h-10 w-10 animate-pulse rounded-full bg-[#241f1a]/10" />
            <div className="mx-auto mt-4 h-3 w-48 animate-pulse rounded bg-[#241f1a]/10" />
            <div className="mx-auto mt-3 h-9 w-32 animate-pulse rounded-lg bg-[#241f1a]/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SurgeryFlowClient() {
  return <SurgeryFlow />;
}
