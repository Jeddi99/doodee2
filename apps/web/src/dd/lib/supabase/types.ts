/**
 * Phase 152 — Supabase row types for the DOODEE v2 billing schema.
 *
 * Mirrors `supabase/migrations/0001_init_billing.sql`. Pure Supabase Auth —
 * every billing table is keyed by `user_id UUID` referencing `auth.users(id)`.
 */

import type { Gender, SubscriptionTier } from "@/types";
import type {
  AgeRange,
  AestheticReference,
  ProfileGoal,
} from "@/lib/user-prefs";

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "trialing"
  | "none";

export type UsageOperation =
  | "scan_analysis"
  | "ai_advice"
  | "procedure_recommend"
  | "surgery_preview"
  | "combo_preview";

// Phase 192ad — Single source of truth for per-op THB cost. Server AI
// routes now write authoritative usage_log rows after a real provider
// call (see Finding 3), so the cost map lives here next to UsageOperation
// instead of being duplicated in /api/usage/track. Keep this aligned with
// the provider pricing the spend dashboard reads.
export const COST_PER_OP_THB: Record<UsageOperation, number> = {
  scan_analysis: 1,
  ai_advice: 2,
  procedure_recommend: 2,
  surgery_preview: 3,
  combo_preview: 5,
};

export type QuotaKind = "scans" | "previews";

export type PaymentRevenueMode = "live" | "test";

export interface ProfileRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_dev: boolean;
  /** Phase 158.23 — non-null marks the user as banned (soft delete). */
  banned_at: string | null;
  banned_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionRow {
  user_id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  scans_quota: number;
  scans_used: number;
  previews_quota: number;
  previews_used: number;
  /** Phase 158.23 — admin-granted bonus credits added on top of plan quota. */
  credit_override_scans: number;
  credit_override_previews: number;
  updated_at: string;
}

/**
 * Phase 158.23 — append-only audit trail for privileged admin actions.
 * Insert via `recordAuditLog` in `lib/api/admin-audit.ts`.
 */
export interface AdminAuditRow {
  id: string;
  timestamp: string;
  admin_user_id: string | null;
  admin_email: string | null;
  action: string;
  target_user_id: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
}

/**
 * Phase 158.24 — Promo coupons + redemption log.
 */
export type CouponKind =
  | "percent_off"
  | "amount_off_thb"
  | "free_credits"
  | "tier_grant"; // Phase 170 — "PRO 7 days" style promos

export interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  kind: CouponKind;
  percent_off: number | null;
  amount_off_thb: number | null;
  free_scans: number;
  free_previews: number;
  expires_at: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  stripe_coupon_id: string | null;
  stripe_promo_code_id: string | null;
  created_by: string | null;
  created_at: string;
  disabled_at: string | null;
  /** Phase 170 — tier_grant kind: which tier to upgrade to. */
  grant_tier: "plus" | "pro" | null;
  /** Phase 170 — tier_grant kind: how many days the grant lasts. */
  grant_days: number | null;
  /**
   * Phase 191 — tier_grant kind: override the standard per-tier scan
   * quota. NULL means "use the tier default" (PRO=30, PLUS=10).
   */
  grant_scans: number | null;
  /**
   * Phase 191 — tier_grant kind: override the standard per-tier preview
   * quota. NULL means "use the tier default" (PRO=20, PLUS=5).
   */
  grant_previews: number | null;
}

export interface CouponRedemptionRow {
  id: string;
  coupon_id: string;
  user_id: string | null;
  redeemed_at: string;
  effect: Record<string, unknown> | null;
}

export interface UsageLogRow {
  id: number;
  user_id: string;
  op: UsageOperation;
  cost_thb: number;
  model: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type ProductEventName =
  | "site_visit"
  | "page_view"
  | "scan_started"
  | "scan_completed"
  | "scan_camera_opened"
  | "scan_camera_closed"
  | "scan_camera_denied"
  | "scan_camera_captured"
  | "scan_album_fallback_opened"
  | "scan_album_captured"
  | "surgery_camera_opened"
  | "surgery_camera_closed"
  | "surgery_camera_denied"
  | "surgery_camera_captured"
  | "surgery_album_fallback_opened"
  | "surgery_album_captured"
  | "onboarding_completed"
  | "face_profile_created"
  | "report_lock_viewed"
  | "intro_offer_viewed"
  | "intro_offer_clicked"
  | "intro_offer_dismissed"
  | "checkout_started"
  | "payment_succeeded"
  | "payment_failed"
  | "journal_viewed";

export interface ProductEventRow {
  id: number;
  user_id: string | null;
  anonymous_id: string | null;
  session_id: string | null;
  event: ProductEventName;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ProductFunnelSummaryRow {
  site_visitors: number | string | null;
  site_visits: number | string | null;
  scan_started_users: number | string | null;
  scan_completed_users: number | string | null;
  paywall_viewed_users: number | string | null;
  pay_clicked_users: number | string | null;
  checkout_started_users: number | string | null;
  payment_succeeded_users: number | string | null;
}

export interface UserProfileRow {
  user_id: string;
  gender: Gender;
  age_range: AgeRange;
  goal: ProfileGoal;
  aesthetic_reference: AestheticReference;
  analysis_consent_version: string | null;
  improvement_consent: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: number;
  user_id: string;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  tier: Exclude<SubscriptionTier, "free">;
  amount_thb: number;
  status: string;
  paid_at: string;
  method?: string | null;
}
