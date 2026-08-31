"use client";

/**
 * Dynamic-import wrapper for ScanFlow.
 *
 * ScanFlow imports MediaPipe Tasks and onnxruntime-web. Loading it on
 * the client keeps the initial /scan shell responsive while the heavy
 * analysis code arrives as a separate chunk.
 */

import dynamic from "next/dynamic";

interface ScanFlowProps {
  hideIntro?: boolean;
}

const ScanFlow = dynamic<ScanFlowProps>(
  () => import("./ScanFlow").then((m) => ({ default: m.ScanFlow })),
  {
    ssr: false,
    loading: () => <ScanFlowSkeleton />,
  }
);

function ScanFlowSkeleton() {
  return (
    <div className="mx-auto max-w-2xl" aria-label="Loading scan engine">
      <div className="rounded-3xl border border-white/60 bg-white/55 p-8 shadow-[0_22px_70px_-54px_rgba(36,31,26,0.42)] backdrop-blur-md sm:p-10">
        <div className="mx-auto h-14 w-14 animate-pulse rounded-2xl border border-white/60 bg-white/45" />
        <div className="mx-auto mt-6 h-4 w-56 max-w-full animate-pulse rounded bg-white/45" />
        <div className="mx-auto mt-3 h-11 w-36 animate-pulse rounded-xl bg-white/40" />
      </div>
    </div>
  );
}

export function ScanFlowClient({ hideIntro = false }: ScanFlowProps) {
  return <ScanFlow hideIntro={hideIntro} />;
}
