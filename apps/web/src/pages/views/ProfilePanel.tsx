import { useQuery } from "@tanstack/react-query";
// Only the two status icons survive. Decorative icons in card headings were the thing that made
// these cards look unlike every other card in the product — no qijek card has one, and "Current
// plan" never had one anyway, so the set was inconsistent with itself.
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../DashboardPage";
import { getProfile } from "../../lib/api";
import { benefitsFor, describeExpiry, formatDate, quotaRows } from "../../lib/profile";
import { baht, describeDiscount } from "../../lib/referral";
import { useLocale } from "../../useLocale";

/**
 * หน้าโปรไฟล์ — "what do I have", as opposed to Settings' "what do I change".
 *
 * requirement.md asks for this page by name and puts the referral benefits on it:
 * "ผู้ชวน/ผู้ถูกชวนเมื่อได้สิทธิ์แล้วจะเห็นปุ่มใช้สิทธิ์ในหน้าโปรไฟล์". Those buttons are here.
 *
 * ใช้สิทธิ์ navigates to checkout with the benefit already applied rather than spending anything
 * from this page. A profile is somewhere you look at your account; a button here that consumed a
 * one-time discount the moment it was pressed would be a trap, and the user would have no order
 * to show for it.
 *
 * One request backs the whole page (`GET /profile/`), so there is one loading state rather than
 * four cards each resolving at their own pace.
 */

/** Order statuses in the reader's language. `status_label` from the API is `get_status_display()`,
 *  and those choices are written in Thai for the admin — right there, wrong on an English page. */
const ORDER_STATUS: Record<string, { th: string; en: string }> = {
  pending: { th: "รอชำระเงิน", en: "Awaiting payment" },
  paid: { th: "จ่ายแล้ว", en: "Paid" },
  failed: { th: "ล้มเหลว", en: "Failed" },
  refunded: { th: "คืนเงินแล้ว", en: "Refunded" },
  cancelled: { th: "ยกเลิก", en: "Cancelled" },
};

const COPY = {
  th: {
    eyebrow: "โปรไฟล์",
    heading: "บัญชีของฉัน",
    intro: "สรุปว่าคุณมีอะไรอยู่บ้าง · การตั้งค่าและการลบบัญชีอยู่ที่หน้าตั้งค่า",
    account: "ข้อมูลบัญชี",
    joined: "สมัครเมื่อ",
    verified: "ยืนยันตัวตนแล้ว",
    unverified: "ยังไม่ได้ยืนยันตัวตน",
    verifyNow: "ไปยืนยัน",
    planTitle: "แผนปัจจุบัน",
    renew: "ต่ออายุ",
    upgrade: "ดูแผน",
    unlimited: "ไม่จำกัด",
    quotaTitle: "โควตาเดือนนี้",
    benefitsTitle: "สิทธิ์ของฉัน",
    noBenefits: "ตอนนี้ยังไม่มีสิทธิ์รออยู่ · ชวนเพื่อนเพื่อรับเครดิต",
    useBenefit: "ใช้สิทธิ์",
    creditNote: "ใช้เป็นส่วนลดค่าสมาชิก หรือขอถอนเป็นเงินก็ได้",
    discountNote: "ส่วนลดสำหรับค่าสมาชิกครั้งแรก ใช้ได้ครั้งเดียว",
    ordersTitle: "ประวัติการจ่ายเงิน",
    noOrders: "ยังไม่มีรายการ",
    creditUsed: "หักเครดิต",
    referralTitle: "ชวนเพื่อน",
    invited: "ชวนไปแล้ว",
    qualified: "ได้เครดิตแล้ว",
    seeInvite: "ไปหน้าชวนเพื่อน",
    seeSettings: "ตั้งค่าบัญชี",
  },
  en: {
    eyebrow: "Profile",
    heading: "My account",
    intro: "What you currently have. Preferences and account deletion live in Settings.",
    account: "Account",
    joined: "Joined",
    verified: "Identity verified",
    unverified: "Identity not verified",
    verifyNow: "Verify",
    planTitle: "Current plan",
    renew: "Renew",
    upgrade: "See plans",
    unlimited: "Unlimited",
    quotaTitle: "This month",
    benefitsTitle: "My benefits",
    noBenefits: "Nothing waiting right now. Invite a friend to earn credit.",
    useBenefit: "Use it",
    creditNote: "Spend it on a subscription, or withdraw it.",
    discountNote: "Off your first subscription. One use.",
    ordersTitle: "Payment history",
    noOrders: "Nothing yet",
    creditUsed: "Credit used",
    referralTitle: "Invite",
    invited: "Invited",
    qualified: "Earned",
    seeInvite: "Go to Invite",
    seeSettings: "Account settings",
  },
};

type Order = {
  id: number;
  plan_name_th: string;
  plan_name_en: string;
  subtotal_satang: number;
  discount_satang: number;
  credit_satang: number;
  total_satang: number;
  status: string;
  status_label: string;
  created_at: string;
};

export default function ProfilePanel() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const lang = locale === "en" ? "en" : "th";
  const copy = COPY[lang];

  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile });

  if (profile.isPending) return <div className="app-view" aria-busy="true" />;
  if (profile.error) {
    return (
      <div className="app-view profile-view">
        <GlassCard className="profile-card">
          <p>{lang === "en" ? "Could not load your profile." : "โหลดข้อมูลโปรไฟล์ไม่สำเร็จ"}</p>
        </GlassCard>
      </div>
    );
  }

  const data = profile.data;
  const plan = data.plan;
  const benefits = benefitsFor(data);
  const quotas = quotaRows(data, lang);
  const orders: Order[] = data.orders ?? [];
  const paid = plan.price_satang > 0;

  return (
    <div className="app-view profile-view">
      <div className="app-page-title">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.heading}</h1>
        <p>{copy.intro}</p>
      </div>

      <div className="profile-grid">
        <GlassCard className="profile-card">
          {/* The app's card shape everywhere else: a small uppercase category, then the value
              itself as the headline. "Current plan / Member" already read this way, which is why
              it looked more finished than its neighbours. */}
          <span className="eyebrow">{copy.account}</span>
          <strong className="profile-email">{data.account.email || "—"}</strong>
          <p className="profile-note">
            {copy.joined} {formatDate(data.account.joined_at, lang)}
          </p>
          {data.account.identity_verified ? (
            <p className="profile-verified">
              <BadgeCheck size={15} /> {copy.verified}
            </p>
          ) : (
            <p className="profile-unverified">
              <ShieldAlert size={15} /> {copy.unverified}
              <button type="button" onClick={() => navigate("/settings")}>{copy.verifyNow}</button>
            </p>
          )}
          <button className="profile-link" type="button" onClick={() => navigate("/settings")}>
            {copy.seeSettings}
          </button>
        </GlassCard>

        <GlassCard className="profile-card">
          <span className="eyebrow">{copy.planTitle}</span>
          <strong className="profile-plan">{lang === "en" ? plan.name_en : plan.name_th}</strong>
          {paid && <p className="profile-note">{baht(plan.price_satang)}</p>}
          {/* An expiry the reader has to work out from a date is an expiry they will miss, so the
              days are spelled out — and "no expiry" is a real answer for a hand-granted account,
              not a blank. */}
          <p className={plan.expiring_soon ? "profile-expiring" : "profile-note"}>
            {describeExpiry(plan.expires_at, lang)}
            {plan.vip_expires_at && !plan.expires_at
              ? ` · ${describeExpiry(plan.vip_expires_at, lang)}`
              : ""}
          </p>
          <button className="profile-cta" type="button" onClick={() => navigate("/pricing")}>
            {paid ? copy.renew : copy.upgrade}
          </button>
        </GlassCard>

        {/* Split out of the plan card. Holding plan + price + expiry + CTA + the whole quota list
            in one card made it 367px tall next to a 208px neighbour, which is what left the grid
            looking ragged. One card, one job. */}
        <GlassCard className="profile-card">
          <span className="eyebrow">{copy.quotaTitle}</span>
          <ul className="profile-quotas">
            {quotas.map((quota) => (
              <li key={quota.key}>
                <span>{quota.label}</span>
                {/* null means unlimited all the way to the label — a plan sold as unlimited must
                    never show a countdown. */}
                <b>{quota.unlimited ? copy.unlimited : quota.remaining}</b>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard className="profile-card profile-card--benefits">
          <span className="eyebrow">{copy.benefitsTitle}</span>
          {benefits.length === 0 ? (
            <p className="profile-note">{copy.noBenefits}</p>
          ) : (
            <ul className="profile-benefits">
              {benefits.map((benefit) => (
                <li key={benefit.kind === "credit" ? "credit" : benefit.discount.code}>
                  <span>
                    <strong>
                      {benefit.kind === "credit"
                        ? baht(benefit.amountSatang)
                        : describeDiscount(benefit.discount, lang)}
                    </strong>
                    <small>
                      {benefit.kind === "credit" ? copy.creditNote : copy.discountNote}
                    </small>
                  </span>
                  {/* Navigates rather than spends. Nothing here can be consumed by a stray click. */}
                  <button type="button" onClick={() => navigate(benefit.to)}>
                    {copy.useBenefit}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="profile-card">
          <span className="eyebrow">{copy.referralTitle}</span>
          <strong className="profile-code">{data.referral.code}</strong>
          <p className="profile-note">
            {copy.invited} {data.referral.invited} · {copy.qualified} {data.referral.qualified}
          </p>
          <button className="profile-link" type="button" onClick={() => navigate("/referral")}>
            {copy.seeInvite}
          </button>
        </GlassCard>

        <GlassCard className="profile-card profile-card--orders">
          <span className="eyebrow">{copy.ordersTitle}</span>
          {orders.length === 0 ? (
            <p className="profile-note">{copy.noOrders}</p>
          ) : (
            <ul className="profile-orders">
              {orders.map((order) => (
                <li key={order.id}>
                  <span>
                    <strong>{lang === "en" ? order.plan_name_en : order.plan_name_th}</strong>
                    <small>
                      {formatDate(order.created_at, lang)} ·{" "}
                      {ORDER_STATUS[order.status]?.[lang] ?? order.status_label}
                      {/* Shown because a receipt that omits the credit understates what the
                          customer actually put in. */}
                      {order.credit_satang > 0
                        ? ` · ${copy.creditUsed} ${baht(order.credit_satang)}`
                        : ""}
                    </small>
                  </span>
                  <b>{baht(order.total_satang)}</b>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
