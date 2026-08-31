"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import { useQuotaGate } from "@/lib/quota-gate";

export function PaywallDialog() {
  const { t } = useT();
  const router = useRouter();
  const { reason, closeGate } = useQuotaGate();

  const open = reason !== null;

  const title =
    reason?.kind === "previews"
      ? t.paywall.outOfPreviewsTitle
      : reason?.kind === "feature"
        ? t.paywall.featureLockedTitle
        : t.paywall.outOfScansTitle;

  const body = reason?.tier === "free" ? t.paywall.bodyFree : t.paywall.bodyPaid;

  function handleViewPlans(): void {
    router.push("/upgrade");
    closeGate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeGate();
      }}
    >
      <DialogContent className="max-w-md gap-5 !border-white/60 !bg-white/68 !bg-none text-center !text-[#241f1a] !shadow-[0_26px_80px_-54px_rgba(36,31,26,0.5)] backdrop-blur-md">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#7a5bd6]/25 to-transparent"
        />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/60 bg-white/50 shadow-[0_14px_30px_-24px_rgba(36,31,26,0.35)]">
          <ShieldCheck className="h-6 w-6 text-[#236653]" />
        </div>

        <div className="space-y-2.5">
          <DialogTitle className="text-2xl text-[#241f1a]">{title}</DialogTitle>
          <DialogDescription className="mx-auto max-w-sm text-sm leading-relaxed text-[#5f574f]">
            {body}
          </DialogDescription>
        </div>

        <div className="mt-1 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleViewPlans}
            className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#241f1a] px-6 text-sm font-semibold text-white shadow-[0_16px_34px_-26px_rgba(36,31,26,0.48)] transition hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf7]"
          >
            <ArrowRight className="h-4 w-4" />
            {t.paywall.viewPlans}
          </button>
          <button
            type="button"
            onClick={closeGate}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/60 bg-white/45 px-6 text-sm font-medium text-[#5f574f] shadow-[0_12px_30px_-26px_rgba(36,31,26,0.34)] backdrop-blur transition hover:border-white/80 hover:bg-white/70 hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/40"
          >
            {t.paywall.later}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
