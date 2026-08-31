"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, m } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CreditCard,
  Loader2,
  QrCode,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { billingConfigured, openCheckout } from "@/lib/billing";
import { useT } from "@/lib/i18n";
import { useTrackedTimeout } from "@/lib/use-tracked-timeout";

const REVEAL = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
} as const;

const STAGGER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
} as const;

const TERMS_ICONS: LucideIcon[] = [
  CreditCard,
  QrCode,
  RotateCcw,
  ShieldCheck,
];

type PaidPlanKey = "plus" | "pro";
type PlanKey = "free" | PaidPlanKey;

const PLAN_STYLE: Record<
  PlanKey,
  {
    shell: string;
    eyebrow: string;
    price: string;
    check: string;
    cta: string;
  }
> = {
  free: {
    shell: "border-[#241f1a]/10 bg-white/55 shadow-[0_22px_62px_-50px_rgba(36,31,26,0.38)] backdrop-blur-md",
    eyebrow: "text-[#625a52]",
    price: "text-[#241f1a]",
    check: "border-[#241f1a]/10 bg-white/45 text-[#625a52]",
    cta: "border-[#241f1a]/15 bg-white/55 text-[#241f1a] backdrop-blur-md hover:bg-white/70",
  },
  plus: {
    shell: "border-[#7a5bd6]/30 bg-white/65 shadow-[0_24px_70px_-50px_rgba(36,31,26,0.46)] ring-1 ring-[#7a5bd6]/10 backdrop-blur-md",
    eyebrow: "text-[#5e45b8]",
    price: "text-[#241f1a]",
    check: "border-[#241f1a]/15 bg-white/45 text-[#241f1a]",
    cta: "bg-[#241f1a] text-[#fffaf2] hover:bg-[#342d27]",
  },
  pro: {
    shell: "border-[#241f1a]/16 bg-white/50 backdrop-blur-md",
    eyebrow: "text-[#625a52]",
    price: "text-[#241f1a]",
    check: "border-[#241f1a]/10 bg-white/50 text-[#241f1a]",
    cta: "bg-[#1d2828] text-[#fffaf2] hover:bg-[#273535]",
  },
};

export function PricingPage() {
  const { t, lang } = useT();
  const [unconfigured, setUnconfigured] = useState<PaidPlanKey | null>(null);
  const [checkoutFailed, setCheckoutFailed] = useState<PaidPlanKey | null>(null);
  const [checkoutPending, setCheckoutPending] = useState<PaidPlanKey | null>(
    null
  );
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const scheduleTimeout = useTrackedTimeout();

  async function handleCheckout(plan: PaidPlanKey) {
    if (checkoutPending) return;
    setUnconfigured(null);
    setCheckoutFailed(null);
    if (!billingConfigured(plan)) {
      setUnconfigured(plan);
      scheduleTimeout(() => setUnconfigured(null), 4500);
      return;
    }

    setCheckoutPending(plan);
    try {
      const result = await openCheckout(plan);
      if (result === "unconfigured") {
        setUnconfigured(plan);
        scheduleTimeout(() => setUnconfigured(null), 4500);
      }
      if (result === "failed" || result === "promptpay-disabled") {
        setCheckoutFailed(plan);
        scheduleTimeout(() => setCheckoutFailed(null), 4500);
      }
    } finally {
      setCheckoutPending(null);
    }
  }

  return (
    <article className="app-glass-page mx-auto max-w-6xl space-y-16 pb-bottom-nav text-[#f8fafc]">
      <m.section
        initial="hidden"
        animate="visible"
        variants={STAGGER}
        className="relative overflow-hidden rounded-[1.5rem] border border-[#241f1a]/10 bg-white/50 px-5 py-10 text-center shadow-[0_28px_90px_-70px_rgba(36,31,26,0.5)] backdrop-blur-md sm:rounded-[2rem] sm:px-8 sm:py-12 md:py-16"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#7a5bd6]/35 to-transparent"
        />
        <m.p
          variants={REVEAL}
          className="inline-flex items-center gap-2 rounded-full border border-[#241f1a]/10 bg-white/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#625a52] backdrop-blur-md"
        >
          <ShieldCheck className="h-3 w-3 text-[#236653]" />
          {t.pricing.eyebrow}
        </m.p>
        <m.h1
          variants={REVEAL}
          className="mx-auto mt-5 max-w-3xl font-serif text-[2.35rem] font-light italic leading-[1.04] tracking-normal text-[#241f1a] sm:text-5xl md:text-6xl"
        >
          {t.pricing.title}
        </m.h1>
        <m.p
          variants={REVEAL}
          className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-[#625a52] md:text-base"
        >
          {t.pricing.subtitle}
        </m.p>
      </m.section>

      <m.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        variants={STAGGER}
        className="grid gap-4 md:grid-cols-3"
      >
        {t.landing.pricingPlans.map((plan) => {
          const style = PLAN_STYLE[plan.key];
          const featured = plan.key === "plus";
          return (
            <m.div
              key={plan.key}
              variants={REVEAL}
              className={`relative flex min-h-[480px] flex-col overflow-hidden rounded-[1.5rem] border p-5 transition sm:rounded-[1.75rem] md:min-h-[520px] md:p-7 ${
                style.shell
              } ${featured ? "md:-translate-y-3" : ""}`}
            >
              {plan.badge && (
                <span className="mb-5 inline-flex w-fit rounded-full border border-[#7a5bd6]/20 bg-[#f3efff]/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#5e45b8] backdrop-blur-md">
                  {plan.badge}
                </span>
              )}

              <div className="space-y-3">
                <p
                  className={`text-[11px] font-semibold uppercase tracking-[0.24em] ${style.eyebrow}`}
                >
                  {plan.name}
                </p>
                <div className="flex items-end gap-2">
                  <span
                    className={`font-serif text-[3.25rem] font-light italic leading-none tabular-nums sm:text-6xl ${style.price}`}
                  >
                    {plan.price}
                  </span>
                  <span className="pb-1 text-xs text-[#625a52]">
                    {plan.cadence}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-[#625a52]">
                  {plan.tagline}
                </p>
              </div>

              <ul
                className={`mt-6 space-y-3 border-t pt-6 text-sm ${
                  featured ? "border-[#241f1a]/15" : "border-[#241f1a]/10"
                }`}
              >
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border ${style.check}`}
                    >
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                    <span className="leading-relaxed text-[#4f4740]">
                      {perk}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-7">
                {plan.key === "free" ? (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className={`h-12 w-full rounded-full border text-sm font-semibold shadow-none transition active:scale-[0.98] ${style.cta}`}
                  >
                    <Link href="/scan">
                      {plan.cta}
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    disabled={checkoutPending !== null}
                    aria-busy={checkoutPending === plan.key}
                    onClick={() => handleCheckout(plan.key as PaidPlanKey)}
                    className={`h-12 w-full rounded-full text-sm font-semibold shadow-none transition active:scale-[0.98] ${style.cta}`}
                  >
                    {checkoutPending === plan.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    {checkoutPending === plan.key
                      ? lang === "th"
                        ? "กำลังเปิดหน้าชำระเงิน"
                        : "Opening secure checkout"
                      : plan.cta}
                  </Button>
                )}
              </div>
            </m.div>
          );
        })}
      </m.section>

      <m.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={STAGGER}
        className="space-y-5"
      >
        <m.div variants={REVEAL} className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#236653]">
            {t.pricing.termsEyebrow}
          </p>
          <h2 className="mt-2 font-serif text-3xl font-light italic tracking-normal md:text-4xl">
            {t.pricing.termsTitle}
          </h2>
        </m.div>
        <m.div variants={REVEAL} className="grid gap-3 md:grid-cols-4">
          {t.pricing.termsItems.map((item, index) => {
            const Icon = TERMS_ICONS[index] ?? ShieldCheck;

            return (
              <div
                key={item.label}
                className="rounded-2xl border border-[#241f1a]/10 bg-white/45 p-5 shadow-[0_18px_54px_-48px_rgba(36,31,26,0.34)] backdrop-blur-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#067e96]/20 bg-[#eff8f8]/70 text-[#056f82] backdrop-blur-md">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="mt-4 text-sm font-semibold text-[#241f1a]">
                  {item.label}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#625a52]">
                  {item.body}
                </p>
              </div>
            );
          })}
        </m.div>
      </m.section>

      <m.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={STAGGER}
        className="space-y-6"
      >
        <m.div variants={REVEAL} className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7a5bd6]">
            {t.pricing.comparisonEyebrow}
          </p>
          <h2 className="mt-2 font-serif text-3xl font-light italic tracking-normal md:text-4xl">
            {t.pricing.comparisonTitle}
          </h2>
        </m.div>
        <m.div variants={REVEAL} className="grid gap-3 md:grid-cols-3">
          {t.pricing.comparisonPoints.map((point) => (
            <div
              key={point.label}
              className="rounded-2xl border border-[#241f1a]/10 bg-white/50 p-5 shadow-[0_20px_60px_-48px_rgba(36,31,26,0.42)] backdrop-blur-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a5bd6]">
                {point.label}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#625a52]">
                {point.body}
              </p>
            </div>
          ))}
        </m.div>
      </m.section>

      <m.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        variants={STAGGER}
        className="space-y-6"
      >
        <m.div variants={REVEAL} className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7a5bd6]">
            {t.pricing.faqEyebrow}
          </p>
          <h2 className="mt-2 font-serif text-3xl font-light italic tracking-normal md:text-4xl">
            {t.pricing.faqTitle}
          </h2>
        </m.div>
        <m.div variants={REVEAL} className="mx-auto max-w-2xl space-y-2">
          {t.pricing.faq.map((item, i) => {
            const isOpen = openFaq === i;
            return (
              <div
                key={item.q}
                className={`rounded-2xl border bg-white/50 px-5 py-4 text-left shadow-[0_16px_46px_-40px_rgba(36,31,26,0.34)] backdrop-blur-md transition ${
                  isOpen ? "border-[#241f1a]/20" : "border-[#241f1a]/10"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/40"
                >
                  <span className="text-sm font-semibold text-[#241f1a]">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 flex-none text-[#7a5bd6] transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                </button>
                <div
                  className="grid-row-collapse"
                  data-open={isOpen ? "true" : "false"}
                  aria-hidden={!isOpen}
                >
                  <div>
                    <p className="pt-3 text-sm leading-relaxed text-[#625a52]">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </m.div>
      </m.section>

      <m.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={REVEAL}
        className="relative overflow-hidden rounded-[2rem] border border-[#241f1a]/10 bg-white/50 p-8 text-center text-[#241f1a] shadow-[0_24px_70px_-54px_rgba(36,31,26,0.45)] backdrop-blur-md md:p-12"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#067e96]/30 to-transparent"
        />
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[#067e96]/20 bg-[#eff8f8]/70 text-[#056f82] backdrop-blur-md">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <h2 className="mx-auto mt-4 max-w-xl font-serif text-3xl font-light italic tracking-normal md:text-4xl">
          {t.pricing.finalCtaTitle}
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-[#625a52]">
          {t.pricing.finalCtaBody}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button
            asChild
            size="lg"
            className="h-12 rounded-full bg-[#241f1a] px-7 text-[#fffaf2] shadow-none hover:bg-[#342d27]"
          >
            <Link href="/scan">
              {t.pricing.finalCtaPrimary}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 rounded-full border-[#241f1a]/10 bg-white/55 px-7 text-[#241f1a] backdrop-blur-md hover:bg-white/70 hover:text-[#241f1a]"
          >
            <Link href="/methodology">{t.pricing.finalCtaSecondary}</Link>
          </Button>
        </div>
      </m.section>

      <AnimatePresence>
        {(unconfigured || checkoutFailed) && (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="pointer-events-auto fixed bottom-[calc(64px+max(env(safe-area-inset-bottom),0.5rem)+0.5rem)] left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 px-2 lg:bottom-[max(env(safe-area-inset-bottom),1rem)]"
          >
            <div className="relative overflow-hidden rounded-2xl border border-[#241f1a]/10 bg-white/65 p-4 shadow-[0_24px_70px_-42px_rgba(36,31,26,0.52)] backdrop-blur-md">
              <button
                type="button"
                onClick={() => {
                  setUnconfigured(null);
                  setCheckoutFailed(null);
                }}
                aria-label="Dismiss payment notice"
                className="absolute right-2 top-2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-[#625a52] hover:text-[#241f1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a5bd6]/35"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-start gap-3 pr-6">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-[#067e96]/20 bg-[#eff8f8]/70 backdrop-blur-md">
                  <ShieldCheck className="h-4 w-4 text-[#056f82]" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#241f1a]">
                    {checkoutFailed
                      ? lang === "th"
                        ? "เปิดหน้าชำระเงินไม่สำเร็จ"
                        : "Payment could not start"
                      : t.landing.checkoutSoonTitle}
                  </p>
                  <p className="text-xs leading-relaxed text-[#625a52]">
                    {checkoutFailed
                      ? lang === "th"
                        ? "ลองอีกครั้งหรือเช็คการเชื่อมต่ออินเทอร์เน็ต"
                        : "Try again or check your internet connection."
                      : t.landing.checkoutSoonBody}
                  </p>
                </div>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </article>
  );
}
