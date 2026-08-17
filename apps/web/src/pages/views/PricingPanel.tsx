import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";
import { GlassCard } from "../DashboardPage";
import { createOrder, getPlans, getSession, validateCoupon } from "../../lib/api";
import { errorMessage } from "../../lib/apiError";
import { useLocale } from "../../useLocale";

/**
 * In-app plans, on qijek's GlassCard rhythm, priced from the API.
 *
 * The ported panel hardcoded free / plus / pro at ฿0 / ฿149 / ฿299 — plan ids the backend had
 * never heard of, since `_user_plan()` answers free / vip / member / clinic. The list now comes
 * from GET /plans/, so `isCurrent` compares against something real and a price change is one
 * admin edit rather than a deploy.
 *
 * There is still no card form: that needs an Omise merchant account, which needs a registered
 * company. Ordering therefore opens a pending order settled by bank transfer and confirmed by
 * a superuser in admin — a real way to sell, on the same entitlement path a provider webhook
 * will use later.
 */

const FEATURE_LABELS: Record<string, { th: string; en: string }> = {
  "single-reference": { th: "ภาพอ้างอิงหนึ่งภาพ", en: "Single consultation reference" },
  "multi-reference": { th: "ภาพอ้างอิงหลายภาพ", en: "Multiple reference images" },
  "try-on": { th: "ลองผม ตา ปาก", en: "Hair / eye / lip try-on" },
  report: { th: "คำแนะนำจากรายงาน", en: "Personal report guidance" },
  questions: { th: "คำถามสำหรับปรึกษาแพทย์", en: "Prioritised consultation questions" },
  pdf: { th: "รายงาน PDF", en: "PDF report" },
  tracking: { th: "ติดตามความคืบหน้า", en: "Progress tracking" },
  compare: { th: "เทียบหลายภาพ", en: "Multi-photo comparison" },
};
const FEATURE_ORDER = Object.keys(FEATURE_LABELS);

const COPY = {
  th: {
    eyebrow: "แผน",
    heading: "เริ่มจากความชัดเจน",
    intro: "ทุกแผนใช้ค่าที่วัดได้ชุดเดียวกัน แผนแบบเสียเงินเพิ่มภาพอ้างอิงและรายงาน",
    perMonth: "/เดือน",
    perYear: "/ปี",
    current: "แผนปัจจุบันของคุณ",
    included: "รวมอยู่แล้ว",
    order: "สั่งซื้อ",
    contact: "ติดต่อทีมงาน",
    couponLabel: "โค้ดส่วนลด",
    apply: "ใช้โค้ด",
    remove: "เอาออก",
    discount: "ส่วนลด",
    total: "ยอดที่ต้องชำระ",
    ordered: "สร้างคำสั่งซื้อแล้ว",
    orderedBody:
      "โอนเงินตามยอดด้านบน แล้วส่งสลิปให้ทีมงาน สิทธิ์จะเปิดหลังทีมงานยืนยันการชำระเงิน",
    note: "บัญชีฟรีจำลองผลได้ 3 ครั้งต่อเดือน การบันทึกภาพเต็มจำกัด 3 ครั้งต่อเดือนทุกแผน",
    couponErrors: {
      invalid_coupon: "ไม่พบโค้ดนี้",
      coupon_expired: "โค้ดหมดอายุแล้ว",
      coupon_not_started: "โค้ดนี้ยังใช้ไม่ได้",
      coupon_exhausted: "โค้ดถูกใช้ครบแล้ว",
      coupon_already_used: "คุณใช้โค้ดนี้ไปแล้ว",
      coupon_minimum_not_met: "ยอดยังไม่ถึงขั้นต่ำของโค้ดนี้",
      coupon_not_valid_for_plan: "โค้ดนี้ใช้กับแผนนี้ไม่ได้",
      too_many_attempts: "ลองมากเกินไป รอสักครู่แล้วลองใหม่",
    } as Record<string, string>,
  },
  en: {
    eyebrow: "Plans",
    heading: "Start with clarity.",
    intro: "Every plan uses the same measurements. Paid plans add references and reports.",
    perMonth: "/month",
    perYear: "/year",
    current: "Your current plan",
    included: "Included",
    order: "Order",
    contact: "Contact us",
    couponLabel: "Discount code",
    apply: "Apply",
    remove: "Remove",
    discount: "Discount",
    total: "Amount due",
    ordered: "Order created",
    orderedBody:
      "Transfer the amount above and send us the slip. Access opens once we confirm the payment.",
    note: "Free accounts get three simulation previews a month. Saving a full image is capped at three per month on every plan.",
    couponErrors: {
      invalid_coupon: "No such code",
      coupon_expired: "This code has expired",
      coupon_not_started: "This code is not active yet",
      coupon_exhausted: "This code has been fully used",
      coupon_already_used: "You have already used this code",
      coupon_minimum_not_met: "The total is below this code's minimum",
      coupon_not_valid_for_plan: "This code does not apply to this plan",
      too_many_attempts: "Too many attempts. Wait a moment and try again.",
    } as Record<string, string>,
  },
};

/** Satang to baht, for display only. Nothing is ever stored or sent as a decimal. */
function baht(satang: number) {
  return `฿${(satang / 100).toLocaleString(undefined, {
    minimumFractionDigits: satang % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

type ApiPlan = {
  code: string;
  name_th: string;
  name_en: string;
  description_th: string;
  description_en: string;
  price_satang: number;
  interval: string;
  features: string[];
  self_serve: boolean;
};

type Quote = { discount_satang: number; total_satang: number; coupon: string };

export default function PricingPanel() {
  const { locale } = useLocale();
  const lang = locale === "en" ? "en" : "th";
  const copy = COPY[lang];
  const queryClient = useQueryClient();

  const session = useQuery({ queryKey: ["session"], queryFn: getSession });
  const plans = useQuery({ queryKey: ["plans"], queryFn: getPlans });
  const currentPlan = session.data?.plan;

  const [code, setCode] = useState("");
  // Which plan the coupon was priced against — a coupon valid for `member` says nothing about
  // `clinic`, so the quote is never shown on a card it was not calculated for.
  const [quote, setQuote] = useState<{ plan: string; quote: Quote } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [placed, setPlaced] = useState<{ plan: string; total: number } | null>(null);

  const apply = useMutation({
    mutationFn: ({ plan }: { plan: string }) => validateCoupon(code.trim(), plan),
    onSuccess: (data: Quote, { plan }) => {
      setCouponError("");
      setQuote({ plan, quote: data });
    },
    onError: (error: Error) => {
      setQuote(null);
      const detail = errorMessage(error);
      setCouponError(copy.couponErrors[detail] || detail);
    },
  });

  const order = useMutation({
    mutationFn: ({ plan }: { plan: string }) => createOrder(plan, quote?.quote.coupon ?? null),
    onSuccess: (data: { plan: string; total_satang: number }) => {
      setPlaced({ plan: data.plan, total: data.total_satang });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const quoteFor = (planCode: string) => (quote?.plan === planCode ? quote.quote : null);

  return (
    <div className="app-view pricing-view">
      <div className="app-page-title">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.heading}</h1>
        <p>{copy.intro}</p>
      </div>

      <div className="price-plans">
        {(plans.data ?? []).map((plan: ApiPlan) => {
          const isCurrent = currentPlan === plan.code;
          const priced = quoteFor(plan.code);
          const paid = plan.price_satang > 0;
          // Only the middle tier is highlighted, as in the ported design — derived from the
          // catalog rather than a `featured` flag no admin can reach.
          const featured = plan.code === "member";
          return (
            <GlassCard
              className={`pricing-plan${featured ? " plan-featured" : ""}${isCurrent ? " is-current" : ""}`}
              key={plan.code}
            >
              {featured && <span className="price-badge">{lang === "th" ? "แนะนำ" : "Recommended"}</span>}
              <div className="price-copy">
                <h3>{lang === "th" ? plan.name_th : plan.name_en}</h3>
                <strong>
                  {baht(priced ? priced.total_satang : plan.price_satang)}
                  {paid && <small>{plan.interval === "year" ? copy.perYear : copy.perMonth}</small>}
                </strong>
                {priced && priced.discount_satang > 0 ? (
                  <span className="price-discount">
                    {copy.discount} {baht(priced.discount_satang)} · {baht(plan.price_satang)}
                  </span>
                ) : null}
                <p>{lang === "th" ? plan.description_th : plan.description_en}</p>
              </div>
              <ul>
                {FEATURE_ORDER.map((id) => {
                  const included = plan.features.includes(id);
                  return (
                    <li className={included ? "" : "is-excluded"} key={id}>
                      {included ? <Check /> : <Minus />}
                      {FEATURE_LABELS[id][lang]}
                    </li>
                  );
                })}
              </ul>

              {isCurrent ? (
                <span className="pricing-current" role="status">
                  {copy.current}
                </span>
              ) : !paid ? (
                <span className="pricing-current">{copy.included}</span>
              ) : !plan.self_serve ? (
                /* A clinic partnership is an agreement, not a checkout — selling the
                   clinic_partner group from a form would hand partner access to anyone. */
                <a className="pricing-contact" href="mailto:hello@doodee.app">
                  {copy.contact}
                </a>
              ) : placed?.plan === plan.code ? (
                <div className="pricing-placed" role="status">
                  <strong>
                    {copy.ordered} · {copy.total} {baht(placed.total)}
                  </strong>
                  <p>{copy.orderedBody}</p>
                </div>
              ) : (
                <div className="pricing-buy">
                  <label>
                    <span>{copy.couponLabel}</span>
                    <input
                      value={code}
                      onChange={(event) => {
                        setCode(event.target.value);
                        setQuote(null);
                        setCouponError("");
                      }}
                      placeholder="DOODEE20"
                      aria-label={copy.couponLabel}
                    />
                    <button
                      type="button"
                      onClick={() => apply.mutate({ plan: plan.code })}
                      disabled={!code.trim() || apply.isPending}
                    >
                      {copy.apply}
                    </button>
                  </label>
                  {couponError ? (
                    <small className="pricing-coupon-error" role="alert">
                      {couponError}
                    </small>
                  ) : null}
                  <button
                    className="pricing-order"
                    type="button"
                    onClick={() => order.mutate({ plan: plan.code })}
                    disabled={order.isPending}
                  >
                    {copy.order} · {baht(priced ? priced.total_satang : plan.price_satang)}
                  </button>
                  {order.error ? (
                    <small className="pricing-coupon-error" role="alert">
                      {errorMessage(order.error)}
                    </small>
                  ) : null}
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>

      <p className="pricing-note">{copy.note}</p>
    </div>
  );
}
