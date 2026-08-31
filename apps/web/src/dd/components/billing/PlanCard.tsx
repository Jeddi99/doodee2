"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CreditCard,
  Crown,
  Loader2,
  QrCode,
  ScanFace,
  ShieldCheck,
  type LucideIcon,
  X,
} from "lucide-react";
import type { CheckoutMethod } from "@/lib/billing";
import type { PlanConfig, PlanFeatures } from "@/lib/plans";
import type { Translations } from "@/locales/types";
import type { SubscriptionTier } from "@/types";

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  plus: 1,
  pro: 2,
};

const FEATURE_ORDER: Array<keyof PlanFeatures> = [
  "surgeryPreview",
  "comboPreview",
  "tryOn",
  "aiAdvice",
  "procedureRecommend",
  "pdfExport",
  "aiCoach",
  "multiPhotoCompare",
  "watermarked",
];

const FEATURE_LABELS: Record<
  keyof PlanFeatures,
  { th: string; en: string; invert?: boolean }
> = {
  surgeryPreview: { th: "ภาพอ้างอิงก่อนปรึกษา", en: "Pre-consult reference" },
  comboPreview: { th: "ภาพอ้างอิงหลายประเด็น", en: "Multi-area reference" },
  tryOn: { th: "Try-on ผม / ตา / ริมฝีปาก", en: "Try-on for makeup, hair, and eyes" },
  aiAdvice: { th: "คำแนะนำรายงาน", en: "Report guidance" },
  procedureRecommend: {
    th: "จัดลำดับคำถามก่อนปรึกษา",
    en: "Clinic question priorities",
  },
  pdfExport: { th: "รายงาน PDF", en: "PDF report" },
  aiCoach: { th: "โค้ชติดตามผล", en: "Follow-up coach" },
  multiPhotoCompare: { th: "เปรียบเทียบหลายรูป", en: "Multi-photo compare" },
  watermarked: {
    th: "ไม่มีลายน้ำบนภาพ",
    en: "No watermark on output",
    invert: true,
  },
};

interface PlanCardProps {
  plan: PlanConfig;
  currentTier?: SubscriptionTier;
  renewalTier?: Exclude<SubscriptionTier, "free"> | null;
  onSelect: (tier: SubscriptionTier, method: CheckoutMethod) => void;
  onManage?: (tier: SubscriptionTier) => void;
  canManageBilling?: boolean;
  busy?: boolean;
  disabled?: boolean;
  lang: "th" | "en";
  t: Translations["upgrade"]["payment"];
}

const PLAN_ICON: Record<SubscriptionTier, LucideIcon> = {
  free: ScanFace,
  plus: ShieldCheck,
  pro: Crown,
};

function featureOn(plan: PlanConfig, key: keyof PlanFeatures): boolean {
  const meta = FEATURE_LABELS[key];
  const raw = plan.features[key];
  return meta.invert ? !raw : raw;
}

export function PlanCard({
  plan,
  currentTier,
  renewalTier = null,
  onSelect,
  onManage,
  canManageBilling = false,
  busy = false,
  disabled = false,
  lang,
  t,
}: PlanCardProps) {
  const [method, setMethod] = useState<CheckoutMethod>("promptpay");
  const isRenewal = renewalTier === plan.tier;
  const isCurrent = currentTier === plan.tier && !isRenewal;
  const isHighlight = plan.recommended === true;
  const isFree = plan.tier === "free";
  const currentRank = currentTier ? TIER_RANK[currentTier] : 0;
  const planRank = TIER_RANK[plan.tier];
  const isDowngrade = !isCurrent && currentRank > planRank && plan.tier !== "free";
  const isPortalCta = !isFree && canManageBilling && (isCurrent || isDowngrade);
  const isCheckoutCta = !isFree && !isPortalCta;
  const showMethodChooser = isCheckoutCta;
  const effectiveMethod: CheckoutMethod = showMethodChooser ? method : "card";
  const ctaDisabled = disabled || busy || (isCurrent && isFree);

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border bg-white/60 p-4 shadow-[0_22px_60px_-46px_rgba(36,31,26,0.48)] backdrop-blur-md sm:p-5 ${
        isHighlight
          ? "border-[#7a5bd6]/30 ring-1 ring-[#7a5bd6]/10"
          : "border-white/60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <PlanBadge tier={plan.tier} />
        {isHighlight && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5e45b8] shadow-[0_10px_24px_-22px_rgba(36,31,26,0.36)]">
            <Crown className="h-3 w-3" />
            {lang === "th" ? "แนะนำ" : "Recommended"}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-4">
        <div className="min-w-0 flex-1 pt-1">
          <p
            className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${tierLabelColor(plan.tier)}`}
          >
            {plan.tier === "free" ? "Free" : plan.label_en}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#6f625a]">
            {lang === "th" ? plan.blurb_th : plan.blurb_en}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-[#241f1a]/10 pt-5">
        {isFree ? (
          <p className="font-serif text-[2.75rem] italic leading-none text-[#241f1a] sm:text-5xl">
            {lang === "th" ? "ฟรี" : "Free"}
            <span className="ml-2 font-sans text-base not-italic text-[#6f625a]">฿0</span>
          </p>
        ) : (
          <p className="flex items-baseline gap-1 font-serif italic leading-none text-[#241f1a] tabular-nums">
            <span className="font-sans text-2xl not-italic text-[#6f625a]">฿</span>
            <span className="text-[3.25rem] sm:text-6xl">{plan.priceThb}</span>
            <span className="ml-1 font-sans text-xs not-italic text-[#6f625a]">
              /{lang === "th" ? "เดือน" : "mo"}
            </span>
          </p>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <QuotaChip
          label={lang === "th" ? "ประเมิน / เดือน" : "Assessments / mo"}
          value={plan.scansQuota}
        />
        <QuotaChip
          label={lang === "th" ? "ภาพอ้างอิง / เดือน" : "References / mo"}
          value={plan.previewsQuota}
        />
      </div>

      <ul className="mt-5 flex-1 space-y-2.5 border-t border-[#241f1a]/10 pt-5">
        {FEATURE_ORDER.map((key) => {
          const on = featureOn(plan, key);
          const meta = FEATURE_LABELS[key];
          return (
            <li key={key} className="flex items-start gap-2.5 text-[12px] leading-snug">
              <span
                className={`plan-feature-state mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  on
                    ? "plan-feature-state-on border-[#067e96]/30 bg-[#eff8f8]/70 text-[#056f82]"
                    : "plan-feature-state-off border-[#241f1a]/10 bg-white/35 text-[#6f625a]"
                }`}
              >
                {on ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
              </span>
              <span className={on ? "text-[#342d27]" : "text-[#6f625a]"}>
                {lang === "th" ? meta.th : meta.en}
              </span>
            </li>
          );
        })}
      </ul>

      {showMethodChooser && (
        <PaymentMethodChooser
          method={method}
          onChange={setMethod}
          tier={plan.tier}
          isHighlight={isHighlight}
          t={t}
        />
      )}

      <button
        type="button"
        onClick={() => {
          if (ctaDisabled) return;
          if (isPortalCta) {
            onManage?.(plan.tier);
            return;
          }
          onSelect(plan.tier, effectiveMethod);
        }}
        disabled={ctaDisabled}
        aria-busy={busy || undefined}
        className={`mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-default disabled:opacity-70 disabled:active:scale-100 ${ctaClass(
          plan.tier,
          isHighlight,
          isCurrent && isFree
        )}`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          !(isCurrent && isFree) && <ArrowRight className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate">
          {busy
            ? lang === "th"
              ? "กำลังเปิดหน้าชำระเงิน..."
              : "Opening secure checkout..."
            : ctaText({ isCurrent, isFree, isDowngrade, isRenewal, isPortalCta, lang, plan })}
        </span>
      </button>
    </div>
  );
}

function PlanBadge({ tier }: { tier: SubscriptionTier }) {
  const Icon = PLAN_ICON[tier];
  return (
    <span
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${planBadgeClass(
        tier
      )}`}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </span>
  );
}

function QuotaChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/55 bg-white/40 px-3 py-2.5 shadow-[0_10px_24px_-22px_rgba(36,31,26,0.34)] backdrop-blur sm:py-3">
      <p className="font-serif text-[2rem] italic leading-none text-[#241f1a] tabular-nums sm:text-4xl">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-medium text-[#6f625a]">{label}</p>
    </div>
  );
}

function PaymentMethodChooser({
  method,
  onChange,
  tier,
  isHighlight,
  t,
}: {
  method: CheckoutMethod;
  onChange: (next: CheckoutMethod) => void;
  tier: SubscriptionTier;
  isHighlight: boolean;
  t: Translations["upgrade"]["payment"];
}) {
  const accentText = isHighlight
    ? "text-[#5e45b8]"
    : tier === "pro"
      ? "text-[#056f82]"
      : "text-[#7a5bd6]";

  return (
    <div className="mt-5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6f625a]">
        {t.label}
      </p>
      <div
        role="radiogroup"
        aria-label={t.label}
        className="grid grid-cols-2 gap-1 rounded-xl border border-white/55 bg-white/35 p-1 backdrop-blur"
      >
        <MethodSegment
          selected={method === "promptpay"}
          onSelect={() => onChange("promptpay")}
          icon={<QrCode className="h-3.5 w-3.5" />}
          label={t.promptpay}
          hint={t.promptpayHint}
          accentText={accentText}
        />
        <MethodSegment
          selected={method === "card"}
          onSelect={() => onChange("card")}
          icon={<CreditCard className="h-3.5 w-3.5" />}
          label={t.card}
          hint={t.cardHint}
          accentText={accentText}
        />
      </div>
      {method === "promptpay" && (
        <p className={`mt-2 flex items-start gap-1.5 text-[11px] leading-snug ${accentText}`}>
          <CalendarClock className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{t.promptpayNote}</span>
        </p>
      )}
    </div>
  );
}

function MethodSegment({
  selected,
  onSelect,
  icon,
  label,
  hint,
  accentText,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  label: string;
  hint: string;
  accentText: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-h-[44px] flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35 ${
        selected
          ? "border-[#7a5bd6]/20 bg-white/60 shadow-[0_10px_24px_-22px_rgba(36,31,26,0.38)] backdrop-blur-md"
          : "border-transparent hover:bg-white/60"
      }`}
    >
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
          selected ? accentText : "text-[#5f574f]"
        }`}
      >
        {icon}
        {label}
      </span>
      <span className="text-[10px] leading-tight text-[#6f625a]">{hint}</span>
    </button>
  );
}

function ctaText({
  isCurrent,
  isFree,
  isDowngrade,
  isRenewal,
  isPortalCta,
  lang,
  plan,
}: {
  isCurrent: boolean;
  isFree: boolean;
  isDowngrade: boolean;
  isRenewal: boolean;
  isPortalCta: boolean;
  lang: "th" | "en";
  plan: PlanConfig;
}) {
  if (isRenewal) return lang === "th" ? `ต่ออายุ ${plan.label_en}` : `Renew ${plan.label_en}`;
  if (isCurrent && isFree) return lang === "th" ? "แพ็กเกจปัจจุบัน" : "Current plan";
  if (isPortalCta && isCurrent) return lang === "th" ? "จัดการแพ็กเกจ" : "Manage plan";
  if (isPortalCta && isDowngrade) return lang === "th" ? "จัดการแพ็กเกจในบิล" : "Manage plan in billing";
  if (isCurrent) return lang === "th" ? `ต่ออายุ ${plan.label_en}` : `Renew ${plan.label_en}`;
  if (isFree) return lang === "th" ? "ใช้แผนพื้นฐาน" : "Use basic plan";
  return lang === "th" ? `เลือกแพ็กเกจ ${plan.label_en}` : `Choose ${plan.label_en}`;
}

function tierLabelColor(tier: SubscriptionTier): string {
  if (tier === "pro") return "text-[#056f82]";
  if (tier === "plus") return "text-[#5e45b8]";
  return "text-[#6f625a]";
}

function planBadgeClass(tier: SubscriptionTier): string {
  if (tier === "pro") {
    return "border-white/60 bg-white/45 text-[#056f82] backdrop-blur";
  }
  if (tier === "plus") {
    return "border-white/60 bg-white/45 text-[#5e45b8] backdrop-blur";
  }
  return "border-white/60 bg-white/40 text-[#6f625a] backdrop-blur";
}

function ctaClass(
  tier: SubscriptionTier,
  highlight: boolean,
  isCurrent: boolean
): string {
  if (isCurrent) {
    return "border border-white/60 bg-white/45 text-[#6f625a] shadow-[0_12px_30px_-26px_rgba(36,31,26,0.34)] backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35";
  }
  if (highlight) {
    return "plan-cta-dark bg-[#241f1a] text-[#fffaf2] shadow-[0_18px_36px_-28px_rgba(36,31,26,0.65)] hover:bg-[#342d27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/40 [&_span]:text-[#fffaf2] [&_svg]:text-[#fffaf2] [&_svg]:stroke-[#fffaf2]";
  }
  if (tier === "pro") {
    return "plan-cta-dark bg-[#1d2828] text-[#fffaf2] shadow-[0_18px_36px_-28px_rgba(29,40,40,0.58)] hover:bg-[#273535] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067e96]/35 [&_span]:text-[#fffaf2] [&_svg]:text-[#fffaf2] [&_svg]:stroke-[#fffaf2]";
  }
  return "border border-white/60 bg-white/45 text-[#241f1a] shadow-[0_12px_30px_-26px_rgba(36,31,26,0.34)] backdrop-blur hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35";
}
