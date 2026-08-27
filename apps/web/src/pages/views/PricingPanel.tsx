import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";
import { GlassCard } from "../DashboardPage";
import { createOrder, getPlans, getReferral, getSession, validateCoupon } from "../../lib/api";
import { errorMessage } from "../../lib/apiError";
import { baht, planPairs, yearlySavingPercent } from "../../lib/referral";
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
  "development-plan": { th: "แผนพัฒนาตนเอง", en: "Personal development plan" },
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
    note: "โควตาของแต่ละแผนแสดงอยู่บนการ์ด แผนฟรีดูผลวิเคราะห์ได้บางส่วนและยังไม่มีการจำลองใบหน้า",
    monthly: "รายเดือน",
    yearly: "รายปี",
    save: (percent: number) => `ประหยัด ${percent}%`,
    perMonthEquivalent: (amount: string) => `เท่ากับ ${amount}/เดือน`,
    creditAvailable: (amount: string) => `คุณมีเครดิต ${amount}`,
    useCredit: "ใช้เครดิตกับคำสั่งซื้อนี้",
    creditApplied: "หักเครดิต",
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
    note: "Each plan's allowances are on its card. The free tier shows part of the analysis and includes no simulations.",
    monthly: "Monthly",
    yearly: "Yearly",
    save: (percent: number) => `Save ${percent}%`,
    perMonthEquivalent: (amount: string) => `${amount}/month equivalent`,
    creditAvailable: (amount: string) => `You have ${amount} in credit`,
    useCredit: "Use my credit on this order",
    creditApplied: "Credit applied",
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

  // Whatever the caller asked for. The profile's ใช้สิทธิ์ button lands here with the benefit
  // named in the URL, so it can be applied before the user does anything.
  const params = new URLSearchParams(window.location.search);
  const requestedCoupon = params.get("coupon") || "";
  const requestedCredit = params.get("credit") === "1";

  // Grants this account holds and has not spent. The Invite panel already tells the user these
  // are "ใส่ให้อัตโนมัติตอนคุณสั่งซื้อ ไม่ต้องพิมพ์โค้ด" — which was untrue until this query and
  // the effect below existed, because `createOrder` only ever sent a code the user had typed and
  // clicked "ใช้โค้ด" on. Same query key the Invite panel uses, so it is usually already cached.
  const referral = useQuery({ queryKey: ["referral"], queryFn: getReferral });
  const heldDiscount = referral.data?.available_discounts?.[0]?.code ?? "";

  const [code, setCode] = useState(requestedCoupon);
  // Which plan the coupon was priced against — a coupon valid for `member` says nothing about
  // `clinic`, so the quote is never shown on a card it was not calculated for.
  const [quote, setQuote] = useState<{ plan: string; quote: Quote } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [placed, setPlaced] = useState<{ plan: string; total: number } | null>(null);
  // One toggle for the whole table rather than a per-card control: the choice is "how do I want
  // to pay", not "how do I want to pay for this particular tier".
  const [billing, setBilling] = useState<"month" | "year">("month");
  const [useCredit, setUseCredit] = useState(true);
  // Guards the effect below: applying once is help, re-applying every time the user clears the
  // box is the field fighting them.
  const [autoApplied, setAutoApplied] = useState(false);

  const creditBalance = Number(session.data?.credit_balance_satang || 0);

  const apply = useMutation({
    // `code` is passed rather than read from state: the auto-apply effect below sets both in the
    // same tick, and the closure would otherwise validate the previous value.
    mutationFn: ({ plan, code: given }: { plan: string; code?: string }) =>
      validateCoupon((given ?? code).trim(), plan),
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
    mutationFn: ({ plan }: { plan: string }) =>
      createOrder(plan, quote?.quote.coupon ?? null, useCredit && creditBalance > 0),
    onSuccess: (data: { plan: string; total_satang: number }) => {
      setPlaced({ plan: data.plan, total: data.total_satang });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      // Credit is spent when the order settles, and a fully-covered order settles immediately —
      // so both the balance and the plan on the session may have just changed.
      queryClient.invalidateQueries({ queryKey: ["session"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
  });

  const quoteFor = (planCode: string) => (quote?.plan === planCode ? quote.quote : null);

  // The card for each tier at the chosen billing interval, falling back to the monthly row for
  // a tier with no yearly counterpart (free, and clinic, which is not sold self-serve anyway).
  const pairs: { monthly: ApiPlan; yearly: ApiPlan | null }[] = planPairs(plans.data ?? []);
  const visible: { plan: ApiPlan; monthly: ApiPlan; yearly: ApiPlan | null }[] = pairs.map((pair) => ({
    plan: billing === "year" && pair.yearly ? pair.yearly : pair.monthly,
    monthly: pair.monthly,
    yearly: pair.yearly,
  }));

  // The plan the auto-applied coupon is priced against. A coupon is validated per plan, so it has
  // to be quoted against exactly one — and it has to be one the user can actually buy. Pricing it
  // against the tier they are already on puts "ลด ฿49.90" on the only card with no order button.
  const buyable = visible.filter(
    (entry) => entry.plan.price_satang > 0 && entry.plan.self_serve && entry.monthly.code !== currentPlan,
  );
  const defaultPlan = (buyable.find((entry) => entry.monthly.code === "plus") ?? buyable[0])?.plan.code;

  useEffect(() => {
    // Runs once, when there is something to apply and a plan to price it against. Without it the
    // Invite panel's "ระบบจะใส่ให้อัตโนมัติ" was simply false: nothing put a held grant on an
    // order unless the user typed the code themselves.
    if (autoApplied || !defaultPlan) return;
    const wanted = requestedCoupon || heldDiscount;
    if (!wanted) return;
    setAutoApplied(true);
    setCode(wanted);
    // The server re-checks the grant, so this can only ever apply something the user really
    // holds — a `requires_grant` coupon is refused to anybody else exactly as if it did not exist.
    apply.mutate({ plan: defaultPlan, code: wanted });
  }, [autoApplied, defaultPlan, requestedCoupon, heldDiscount, apply]);

  useEffect(() => {
    // `?credit=1` from the profile's ใช้สิทธิ์ button. Only ever turns it on: arriving with the
    // parameter means the user asked for it, and it must not fight them if they untick it after.
    if (requestedCredit) setUseCredit(true);
  }, [requestedCredit]);

  return (
    <div className="app-view pricing-view">
      <div className="app-page-title">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.heading}</h1>
        <p>{copy.intro}</p>
      </div>

      <div className="price-billing" role="group" aria-label={copy.eyebrow}>
        {(["month", "year"] as const).map((value) => (
          <button
            className={billing === value ? "is-selected" : ""}
            type="button"
            key={value}
            onClick={() => { setBilling(value); setQuote(null); setCouponError(""); }}
            aria-pressed={billing === value}
          >
            {value === "month" ? copy.monthly : copy.yearly}
          </button>
        ))}
      </div>

      {creditBalance > 0 && (
        <label className="price-credit">
          <input
            type="checkbox"
            checked={useCredit}
            onChange={(event) => setUseCredit(event.target.checked)}
          />
          <span>
            <strong>{copy.creditAvailable(baht(creditBalance))}</strong>
            {copy.useCredit}
          </span>
        </label>
      )}

      <div className="price-plans">
        {visible.map(({ plan, monthly, yearly }) => {
          const isCurrent = currentPlan === plan.code;
          const priced = quoteFor(plan.code);
          const paid = plan.price_satang > 0;
          // Only the middle tier is highlighted, as in the ported design — derived from the
          // catalog rather than a `featured` flag no admin can reach.
          const featured = monthly.code === "plus";
          const saving = billing === "year" ? yearlySavingPercent(monthly, yearly) : null;
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
                {/* Inline, under the price. Absolutely positioned it collided with the plan title:
                    the card's only free corner is the top right, and `.price-badge` ("แนะนำ")
                    already owns that — on the recommended tier both were drawn at once. Computed
                    from the two rows the API already returned, so a price change moves it. */}
                {saving !== null && <span className="price-saving">{copy.save(saving)}</span>}
                {plan.interval === "year" && paid ? (
                  <span className="price-equivalent">
                    {copy.perMonthEquivalent(baht(Math.round(plan.price_satang / 12)))}
                  </span>
                ) : null}
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
                    {copy.ordered} · {copy.total} {baht(placed?.total ?? 0)}
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
