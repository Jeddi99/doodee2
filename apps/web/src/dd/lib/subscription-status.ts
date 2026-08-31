import type { SubscriptionRow } from "@/lib/supabase/types";
import type { SubscriptionTier } from "@/types";

type PaidTier = Exclude<SubscriptionTier, "free">;

export function isPaidTier(tier: SubscriptionTier): tier is PaidTier {
  return tier === "plus" || tier === "pro";
}

export function isCurrentPaidSubscription(
  subscription: SubscriptionRow | null,
  now = Date.now()
): subscription is SubscriptionRow & { tier: PaidTier } {
  if (!subscription || !isPaidTier(subscription.tier)) return false;
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    return false;
  }
  if (!subscription.current_period_end) return true;
  const end = Date.parse(subscription.current_period_end);
  return Number.isFinite(end) && end > now;
}

export function activeBillingTier(
  subscription: SubscriptionRow | null,
  now = Date.now()
): SubscriptionTier {
  if (!subscription || subscription.tier === "free") return "free";
  return isCurrentPaidSubscription(subscription, now) ? subscription.tier : "free";
}

export function expiredPaidTier(
  subscription: SubscriptionRow | null,
  now = Date.now()
): PaidTier | null {
  if (!subscription || !isPaidTier(subscription.tier)) return null;
  return isCurrentPaidSubscription(subscription, now) ? null : subscription.tier;
}
