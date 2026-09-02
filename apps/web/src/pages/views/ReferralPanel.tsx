import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { GlassCard } from "../DashboardPage";
import { claimReferral, getCredits, getReferral, getSession } from "../../lib/api";
import { errorMessage } from "../../lib/apiError";
import {
  baht,
  describeDiscount,
  isValidReferralCode,
  normalizeReferralCode,
  shareUrl,
  takeStoredReferralCode,
} from "../../lib/referral";
import { useLocale } from "../../useLocale";
import WithdrawCard from "./WithdrawCard";

/**
 * ชวนเพื่อน — both halves of the deal, on one screen.
 *
 * The inviter's reward lands only when the friend they invited actually pays for something, and
 * it can then be spent on a subscription or withdrawn to a bank account. The conditions are
 * stated on the card rather than buried in terms: a reward whose conditions are a surprise is a
 * support ticket.
 *
 * Both conditions, now. There is a second one — `SiteSetting.max_qualified_per_month`, ten today
 * — and `billing.vest_referral_reward` sends everything past it to HELD for a person to look at
 * instead of paying it. This screen used to promise the amount "ต่อเพื่อนหนึ่งคน" with no ceiling
 * at all, so the eleventh friend in a month subscribed, nothing arrived, and the counter said
 * "รอเพื่อนสมัคร" (HELD is deliberately counted as pending, so as not to accuse anyone). The cap
 * is read from the payload rather than written here, because it is an admin field.
 *
 * No figure on this screen is a literal. Every amount comes from `GET /referral/`, which reads
 * `SiteSetting` — the row that exists so ฿30 can become ฿50 without a deploy.
 *
 * The invited friend has nothing to type. Their discount is bound to their account by a
 * `CouponGrant` on the server, so the checkout applies it — this screen only shows that it is
 * there and waiting.
 */

const COPY = {
  th: {
    eyebrow: "ชวนเพื่อน",
    heading: "ชวนเพื่อน ได้เครดิตทั้งคู่",
    intro: "เพื่อนได้ส่วนลดตอนสมัครครั้งแรก คุณได้เครดิตเมื่อเพื่อนสมัครสมาชิกแบบเสียเงิน",
    yourCode: "โค้ดของคุณ",
    copy: "คัดลอกลิงก์",
    copied: "คัดลอกแล้ว",
    invited: "ชวนไปแล้ว",
    pending: "รอเพื่อนสมัคร",
    qualified: "ได้เครดิตแล้ว",
    people: "คน",
    balance: "เครดิตของคุณ",
    balanceNote: "ใช้เป็นส่วนลดค่าสมาชิก หรือขอถอนเป็นเงินเข้าบัญชีก็ได้",
    useAtCheckout: "หักค่าสมาชิกได้ที่หน้าแผนตอนสั่งซื้อ หรือขอถอนเป็นเงินได้ที่การ์ดถัดไป",
    rewardNote: (amount: string) =>
      `คุณได้ ${amount} ต่อเพื่อนหนึ่งคน เมื่อเพื่อนที่ใช้โค้ดของคุณสมัครสมาชิกแบบเสียเงินครั้งแรก`,
    // Said on the card, not in terms. Beyond the cap the reward is not refused and not paid — it
    // waits for a person to look at it — and a user who is not told that simply sees a friend
    // subscribe and no credit arrive.
    rewardCap: (count: number) =>
      `จ่ายได้สูงสุด ${count} คนต่อเดือน เกินจากนั้นรายการจะถูกพักไว้ให้ทีมงานตรวจสอบก่อน`,
    historyTitle: "ประวัติเครดิต",
    empty: "ยังไม่มีรายการ",
    yourDiscount: "ส่วนลดที่รออยู่",
    discountNote: "ระบบจะใส่ให้อัตโนมัติตอนคุณสั่งซื้อ ไม่ต้องพิมพ์โค้ด",
    haveCode: "มีโค้ดชวนจากเพื่อน?",
    claim: "ใช้โค้ด",
    claimed: "รับส่วนลดแล้ว",
    unavailable: "ตอนนี้ยังโหลดข้อมูลการชวนเพื่อนไม่ได้",
    errors: {
      already_referred: "บัญชีนี้ใช้โค้ดชวนไปแล้ว หนึ่งบัญชีใช้ได้ครั้งเดียว",
      cannot_refer_yourself: "ใช้โค้ดของตัวเองไม่ได้",
      invalid_code: "ไม่พบโค้ดนี้",
      signup_window_passed: "โค้ดชวนใช้ได้เฉพาะตอนสมัครใหม่เท่านั้น",
      identity_not_verified: "ต้องยืนยันอีเมลก่อน หรือเข้าสู่ระบบด้วย Google",
      referral_disabled: "ระบบชวนเพื่อนปิดอยู่ชั่วคราว",
      too_many_attempts: "ลองมากเกินไป รอสักครู่แล้วลองใหม่",
    } as Record<string, string>,
  },
  en: {
    eyebrow: "Invite",
    heading: "Invite a friend, you both get something.",
    intro: "Your friend gets a discount on their first subscription. You get credit once they pay for one.",
    yourCode: "Your code",
    copy: "Copy link",
    copied: "Copied",
    invited: "Invited",
    pending: "Waiting",
    qualified: "Earned",
    people: "",
    balance: "Your credit",
    balanceNote: "Spend it on a subscription, or withdraw it to your bank account.",
    useAtCheckout: "Apply it on the Plans page, or withdraw it using the card below.",
    rewardNote: (amount: string) =>
      `${amount} per friend, paid when someone who used your code takes out their first paid subscription.`,
    rewardCap: (count: number) =>
      `Up to ${count} friends a month are paid automatically. Past that, a reward is held for us to review before it is paid.`,
    historyTitle: "Credit history",
    empty: "Nothing yet",
    yourDiscount: "Your discount is waiting",
    discountNote: "It is applied automatically at checkout. There is no code to type.",
    haveCode: "Got a code from a friend?",
    claim: "Use code",
    claimed: "Discount added",
    unavailable: "Your invite details could not be loaded just now.",
    errors: {
      already_referred: "This account has already used an invite code. One per account.",
      cannot_refer_yourself: "You cannot use your own code.",
      invalid_code: "No such code.",
      signup_window_passed: "An invite code only works on a newly created account.",
      identity_not_verified: "Verify your email first, or sign in with Google.",
      referral_disabled: "Invites are switched off at the moment.",
      too_many_attempts: "Too many attempts. Wait a moment and try again.",
    } as Record<string, string>,
  },
};

export default function ReferralPanel() {
  const { locale } = useLocale();
  const lang = locale === "en" ? "en" : "th";
  const copy = COPY[lang];
  const queryClient = useQueryClient();

  const session = useQuery({ queryKey: ["session"], queryFn: getSession });
  const referral = useQuery({ queryKey: ["referral"], queryFn: getReferral });
  const credits = useQuery({ queryKey: ["credits"], queryFn: getCredits });

  // Pre-filled from a ?ref= link that survived the trip through the sign-in provider, so an
  // invited user usually has nothing to type at all.
  const [code, setCode] = useState(() => {
    try {
      return takeStoredReferralCode(window.sessionStorage);
    } catch {
      return "";
    }
  });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const claim = useMutation({
    mutationFn: () => claimReferral(normalizeReferralCode(code)),
    onSuccess: () => {
      setError("");
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["referral"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (mutationError: Error) => {
      const detail = errorMessage(mutationError);
      setError(copy.errors[detail] || detail);
    },
  });

  const copyLink = async () => {
    const link = shareUrl(referral.data?.code, window.location.origin);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission was refused. The code is on screen and selectable, so the user
      // still has a way through — a thrown error here would be the only thing that broke.
      setCopied(false);
    }
  };

  if (session.data?.referral_enabled === false) return null;
  if (referral.isPending) return <div className="app-view" aria-busy="true" />;

  // `referral.data` is undefined once the query has settled with an error — a 503
  // `referral_disabled`, or simply a failed request. Falling through to `?? {}` drew the whole
  // screen out of missing values: an empty code box, "฿0 ต่อเพื่อนหนึ่งคน" as the offer, and
  // "฿0" as the balance. Every one of those is a plausible-looking number for a state in which
  // nothing is known, and the balance in particular is somebody's money.
  if (referral.error || !referral.data) {
    return (
      <div className="app-view referral-view">
        <div className="app-page-title">
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1>{copy.heading}</h1>
        </div>
        <GlassCard className="referral-card">
          <p className="referral-note" role="alert">
            {/* Through the same table the claim form uses, so `referral_disabled` reads as a
                sentence rather than as a machine code. */}
            {copy.errors[errorMessage(referral.error)] || copy.unavailable}
          </p>
        </GlassCard>
      </div>
    );
  }

  const stats = referral.data;
  const discounts = stats.available_discounts ?? [];
  const alreadyReferred = claim.isSuccess || discounts.length > 0;

  return (
    <div className="app-view referral-view">
      <div className="app-page-title">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.heading}</h1>
        <p>{copy.intro}</p>
      </div>

      <div className="referral-grid">
        <GlassCard className="referral-card referral-card--code">
          <span className="eyebrow">{copy.yourCode}</span>
          {/* Selectable text, not just a button: clipboard permission can be refused, and the
              code has to remain usable when it is. */}
          <strong className="referral-code">{stats.code}</strong>
          <button className="referral-copy" type="button" onClick={copyLink}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? copy.copied : copy.copy}
          </button>
          <p className="referral-note">{copy.rewardNote(baht(stats.reward_satang))}</p>
          {/* Only when the server states a cap. A number invented here would be the same class
              of mistake as the missing sentence it replaces, and `max_qualified_per_month: 0`
              genuinely means "no cap" rather than "nobody gets paid". */}
          {typeof stats.max_qualified_per_month === "number" && stats.max_qualified_per_month > 0 && (
            <p className="referral-note">{copy.rewardCap(stats.max_qualified_per_month)}</p>
          )}
          <div className="referral-stats">
            <span>
              <b>{stats.invited ?? 0}</b> {copy.invited} {copy.people}
            </span>
            <span>
              <b>{stats.pending ?? 0}</b> {copy.pending}
            </span>
            <span>
              <b>{stats.qualified ?? 0}</b> {copy.qualified}
            </span>
          </div>
        </GlassCard>

        <GlassCard className="referral-card referral-card--balance">
          <span className="eyebrow">{copy.balance}</span>
          <strong className="referral-balance">{baht(stats.credit_balance_satang)}</strong>
          {/* Said plainly and on the card. Credit that reads as withdrawable cash is a
              complaint, and the honest word for this is a discount. */}
          <p className="referral-note">{copy.balanceNote}</p>
          <p className="referral-note">{copy.useAtCheckout}</p>
          <h3>{copy.historyTitle}</h3>
          <ul className="referral-ledger">
            {(credits.data?.entries ?? []).slice(0, 8).map((entry: {
              amount_satang: number; kind_label: string; created_at: string;
            }, index: number) => (
              <li key={`${entry.created_at}-${index}`}>
                <span>{entry.kind_label}</span>
                <b className={entry.amount_satang < 0 ? "is-spend" : ""}>
                  {entry.amount_satang < 0 ? "−" : "+"}
                  {baht(Math.abs(entry.amount_satang))}
                </b>
              </li>
            ))}
            {!(credits.data?.entries ?? []).length && <li className="is-empty">{copy.empty}</li>}
          </ul>
        </GlassCard>

        <WithdrawCard />

        {discounts.length > 0 && (
          <GlassCard className="referral-card referral-card--discount">
            <span className="eyebrow">{copy.yourDiscount}</span>
            {discounts.map((discount: { code: string }) => (
              <strong className="referral-discount" key={discount.code}>
                {describeDiscount(discount, lang)}
              </strong>
            ))}
            <p className="referral-note">{copy.discountNote}</p>
          </GlassCard>
        )}

        {!alreadyReferred && (
          <GlassCard className="referral-card referral-card--claim">
            <span className="eyebrow">{copy.haveCode}</span>
            <form
              className="referral-claim"
              onSubmit={(event) => {
                event.preventDefault();
                if (isValidReferralCode(code)) claim.mutate();
              }}
            >
              <input
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase());
                  setError("");
                }}
                placeholder="AB2C3D4E"
                aria-label={copy.haveCode}
                autoComplete="off"
                maxLength={8}
              />
              <button type="submit" disabled={!isValidReferralCode(code) || claim.isPending}>
                {copy.claim}
              </button>
            </form>
            {error && (
              <p className="referral-error" role="alert">
                {error}
              </p>
            )}
          </GlassCard>
        )}
      </div>
    </div>
  );
}
