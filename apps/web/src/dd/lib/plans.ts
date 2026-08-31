/**
 * Phase 152 → 158.17 — Plan catalog.
 *
 * Three tiers: free / plus / pro. Two quota families:
 *
 *   `scans`     — burned by ANY text-based AI analysis. Members:
 *                   - Full face scan with Gemini scoring (`callGeminiScore`)
 *                   - คำแนะนำหัตถการ / procedure-recommend text list
 *                     (`callGeminiProcedureRecommend`)
 *
 *   `previews`  — burned by ANY AI **image generation**. Members:
 *                   - Single procedure preview (`callGeminiSurgeryPreview`)
 *                   - Combo preview (`callGeminiComboPreview`)
 *                 Both cost 1 credit each — combo is one Gemini call no
 *                 matter how many procedures stacked.
 *
 *   FREE        — Makeup try-on (lip / eye / hair / blush)
 *                 runs entirely in-browser via MediaPipe + canvas
 *                 recolor utilities (`@/lib/makeover`). No Gemini call,
 *                 no quota burn. Gated by the `tryOn` plan feature flag
 *                 only — credit-wise it's free for all tiers.
 *
 * Add a new tier here, everything downstream picks it up automatically.
 */

import type { SubscriptionTier } from "@/types";

export interface PlanFeatures {
  /** Single-procedure preview (still 1 preview credit per call). */
  surgeryPreview: boolean;
  /** Combo preview (2-3 procedures in 1 image — still 1 preview credit). */
  comboPreview: boolean;
  /** Long-form AI advice paragraph after scan. */
  aiAdvice: boolean;
  /** AI procedure recommendation list. */
  procedureRecommend: boolean;
  /** Try-on makeup / hair / eye color — local canvas, gated by tier. */
  tryOn: boolean;
  /** Export full scan + previews as a PDF report. */
  pdfExport: boolean;
  /** progress plan (longitudinal, personalized advice across scans). */
  aiCoach: boolean;
  /** Side-by-side comparison across multiple scan dates. */
  multiPhotoCompare: boolean;
  /** Watermark on output. Free tier only. */
  watermarked: boolean;
}
export interface PlanConfig {
  tier: SubscriptionTier;
  label_th: string;
  label_en: string;
  /** Monthly price in THB. 0 for free. */
  priceThb: number;
  /** Env var name holding the Stripe Payment Link for this tier. */
  /** Full face scans allowed per billing period. */
  scansQuota: number;
  /** AI image gens allowed per period (surgery + combo together). */
  previewsQuota: number;
  features: PlanFeatures;
  /** Marketed as the highlighted recommended tier on the picker. */
  recommended?: boolean;
  /** One-line value prop shown under the price. */
  blurb_th: string;
  blurb_en: string;
}

export const PLAN_CATALOG: Record<SubscriptionTier, PlanConfig> = {
  free: {
    tier: "free",
    label_th: "พื้นฐาน",
    label_en: "Basic",
    priceThb: 0,
    scansQuota: 1,
    previewsQuota: 0,
    features: {
      surgeryPreview: false,
      comboPreview: false,
      aiAdvice: true,
      procedureRecommend: true,
      tryOn: false,
      pdfExport: false,
      aiCoach: false,
      multiPhotoCompare: false,
      watermarked: true,
    },
    blurb_th: "1 สแกนส่วนตัว ไม่มีภาพประกอบ",
    blurb_en: "1 private scan, no visual references",
  },
  plus: {
    tier: "plus",
    label_th: "Plus",
    label_en: "Plus",
    priceThb: 149,
    scansQuota: 10,
    previewsQuota: 5,
    features: {
      surgeryPreview: true,
      comboPreview: true,
      aiAdvice: true,
      procedureRecommend: true,
      tryOn: true,
      pdfExport: true,
      aiCoach: true,
      multiPhotoCompare: false,
      watermarked: false,
    },
    recommended: true,
    blurb_th: "10 สแกน + 5 ภาพประกอบ + ลองลุค + PDF + แผนติดตามผล",
    blurb_en: "10 scans + 5 visual references + try-on + PDF + progress plan",
  },
  pro: {
    tier: "pro",
    label_th: "Pro",
    label_en: "Pro",
    priceThb: 299,
    scansQuota: 30,
    previewsQuota: 20,
    features: {
      surgeryPreview: true,
      comboPreview: true,
      aiAdvice: true,
      procedureRecommend: true,
      tryOn: true,
      pdfExport: true,
      aiCoach: true,
      multiPhotoCompare: true,
      watermarked: false,
    },
    blurb_th: "30 สแกน + 20 ภาพประกอบ + PDF + แผนติดตามผล",
    blurb_en: "30 scans + 20 visual references + PDF + progress plan",
  },
};

export function getPlan(tier: SubscriptionTier): PlanConfig {
  return PLAN_CATALOG[tier];
}

export function getAllPlans(): PlanConfig[] {
  return [PLAN_CATALOG.free, PLAN_CATALOG.plus, PLAN_CATALOG.pro];
}

export function getPaidPlans(): PlanConfig[] {
  return [PLAN_CATALOG.plus, PLAN_CATALOG.pro];
}

export function planFeatureAvailable(
  tier: SubscriptionTier,
  feature: keyof PlanFeatures
): boolean {
  return Boolean(PLAN_CATALOG[tier].features[feature]);
}

/**
 * Map legacy tier strings to the current 3-tier scheme.
 * - weekly / monthly / starter / old "pro" → "plus"
 * - "premium" → "pro"
 */
export function normalizeLegacyTier(
  raw: string | null | undefined
): SubscriptionTier {
  switch (raw) {
    case "weekly":
    case "monthly":
    case "starter":
      return "plus";
    case "premium":
      return "pro";
    case "free":
    case "plus":
    case "pro":
      return raw;
    default:
      return "free";
  }
}
