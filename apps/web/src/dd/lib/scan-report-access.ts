import { isCurrentPaidSubscription } from "@/lib/subscription-status";
import type { SubscriptionRow } from "@/lib/supabase/types";

export interface ScanReportAccessState {
  pending: boolean;
  hasPaidPlan: boolean;
  hasQuota: boolean;
  canAccessReport: boolean;
  canShowPaywall: boolean;
  isFreeUser: boolean;
}

function remainingScans(row: SubscriptionRow): number {
  return Math.max(
    0,
    row.scans_quota + row.credit_override_scans - row.scans_used
  );
}

export function getScanReportAccessState(
  subscription: SubscriptionRow | null,
  loading: boolean
): ScanReportAccessState {
  const hasRow = subscription !== null;
  const hasPaidPlan = hasRow && isCurrentPaidSubscription(subscription);
  const hasQuota = hasRow && remainingScans(subscription) > 0;
  // Phase 306 — "limbo" guard. When the subscription fetch fails or hasn't
  // produced a row yet (`!loading && !hasRow` — e.g. a transient /api/quota
  // error, a missing token, malformed JSON), the OLD logic returned BOTH
  // canAccessReport=false AND canShowPaywall=false. ScanFlow gates its
  // `setFrontBusy(false)` on one of those two being true, so that state left
  // the analysis spinner stuck FOREVER. Treat "unknown subscription" as
  // optimistic access: the server-side quota gate (consumeQuota in the AI
  // routes) is the real enforcement — a free user who is genuinely out of
  // quota still gets a 402 → paywall — so being optimistic here can't leak a
  // free report, it only prevents the hang.
  const canAccessReport = loading || !hasRow || hasPaidPlan || hasQuota;
  // Paywall only fires when we KNOW the user is a free, out-of-quota account
  // (hasRow). Unknown/limbo never shows the paywall — it rides canAccessReport.
  const canShowPaywall = !loading && hasRow && !hasPaidPlan && !hasQuota;

  return {
    pending: loading,
    hasPaidPlan,
    hasQuota,
    canAccessReport,
    canShowPaywall,
    isFreeUser: !hasPaidPlan,
  };
}
