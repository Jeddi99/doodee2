import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GlassCard } from "../DashboardPage";
import {
  cancelWithdrawal,
  getPayoutAccount,
  getWithdrawals,
  requestWithdrawal,
  savePayoutAccount,
} from "../../lib/api";
import { errorMessage } from "../../lib/apiError";
import { canWithdraw, checkNumber, isCancellable, normalizeNumber, shortfall } from "../../lib/payout";
import { baht } from "../../lib/referral";
import { useLocale } from "../../useLocale";

/**
 * Taking referral credit out as money.
 *
 * Two things the copy has to be honest about, because both surprise people otherwise:
 * the credit leaves the balance the moment it is requested rather than when it is paid, and the
 * transfer is made by a person, so it is not instant.
 *
 * The full account number is never displayed. The user typed it; the only party who needs to
 * read it back is an operator making the transfer, and they do that through an audited action in
 * the admin. This screen shows `••••1234` for a saved account and only accepts a whole number
 * when one is being replaced.
 */

const COPY = {
  th: {
    title: "ถอนเป็นเงิน",
    balance: "ถอนได้ตอนนี้",
    minimum: (amount: string) => `ถอนขั้นต่ำ ${amount}`,
    shortBy: (amount: string) => `อีก ${amount} ถึงจะถอนได้`,
    withdraw: "ขอถอนเงิน",
    manual: "ทีมงานโอนให้ด้วยมือ ปกติภายใน 1–3 วันทำการ",
    deducted: "เครดิตจะถูกหักทันทีที่กดขอถอน ถ้ารายการไม่ผ่านระบบจะคืนให้เต็มจำนวน",
    accountTitle: "บัญชีรับเงิน",
    promptpay: "พร้อมเพย์",
    bank: "บัญชีธนาคาร",
    accountName: "ชื่อบัญชี",
    number: "เลขบัญชี",
    promptpayNumber: "เบอร์มือถือ หรือเลขบัตรประชาชน",
    chooseBank: "เลือกธนาคาร",
    save: "บันทึกบัญชี",
    change: "เปลี่ยนบัญชี",
    cancel: "ยกเลิก",
    saved: "บันทึกแล้ว",
    nameHint: "ต้องตรงกับชื่อในบัญชีจริง ไม่งั้นโอนไม่ผ่าน",
    historyTitle: "ประวัติการถอน",
    empty: "ยังไม่เคยขอถอน",
    cancelRequest: "ยกเลิกคำขอ",
    reasons: {
      withdrawal_disabled: "ระบบถอนเงินปิดอยู่ชั่วคราว",
      withdrawal_already_pending: "มีคำขอถอนที่ยังไม่เสร็จอยู่ รอให้รายการนั้นจบก่อน",
      no_payout_account: "เพิ่มบัญชีรับเงินก่อนถึงจะถอนได้",
      no_balance: "ยังไม่มีเครดิตให้ถอน",
      below_minimum: "ยอดยังไม่ถึงขั้นต่ำ",
      payout_not_configured: "ระบบยังตั้งค่าการถอนเงินไม่เสร็จ จึงยังรับบัญชีรับเงินไม่ได้ ติดต่อทีมงาน",
      minimum_unknown: "ตอนนี้ยังอ่านยอดขั้นต่ำไม่ได้ ลองใหม่อีกครั้งในสักครู่",
    } as Record<string, string>,
    errors: {
      payout_not_configured: "ระบบยังตั้งค่าการถอนเงินไม่เสร็จ ติดต่อทีมงาน",
      invalid_promptpay_id: "พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก",
      invalid_account_number: "เลขบัญชีต้องมี 10–15 หลัก",
      invalid_bank: "เลือกธนาคารก่อน",
      account_name_required: "กรอกชื่อบัญชี",
      number_required: "กรอกเลขบัญชี",
      below_minimum: "ยอดยังไม่ถึงขั้นต่ำ",
      amount_exceeds_balance: "ยอดเกินเครดิตที่ถอนได้",
      identity_not_verified: "ต้องยืนยันอีเมลก่อน หรือเข้าสู่ระบบด้วย Google",
    } as Record<string, string>,
  },
  en: {
    title: "Withdraw",
    balance: "Available now",
    minimum: (amount: string) => `Minimum withdrawal ${amount}`,
    shortBy: (amount: string) => `${amount} to go`,
    withdraw: "Request a withdrawal",
    manual: "Transfers are made by hand, usually within 1–3 business days.",
    deducted: "The credit leaves your balance as soon as you ask. If the request is refused, it comes back in full.",
    accountTitle: "Where to send it",
    promptpay: "PromptPay",
    bank: "Bank account",
    accountName: "Account name",
    number: "Account number",
    promptpayNumber: "Mobile number or national ID",
    chooseBank: "Choose a bank",
    save: "Save account",
    change: "Change account",
    cancel: "Cancel",
    saved: "Saved",
    nameHint: "Must match the real account holder, or the transfer will fail.",
    historyTitle: "Withdrawal history",
    empty: "Nothing yet",
    cancelRequest: "Cancel request",
    reasons: {
      withdrawal_disabled: "Withdrawals are switched off at the moment.",
      withdrawal_already_pending: "You already have a request in progress.",
      no_payout_account: "Add an account before you can withdraw.",
      no_balance: "No credit to withdraw yet.",
      below_minimum: "Not enough to withdraw yet.",
      payout_not_configured: "Withdrawals are not fully set up here yet, so we cannot take your account details. Contact us.",
      minimum_unknown: "The minimum could not be read just now. Try again in a moment.",
    } as Record<string, string>,
    errors: {
      payout_not_configured: "Withdrawals are not fully set up yet. Contact us.",
      invalid_promptpay_id: "PromptPay is a 10-digit mobile number or a 13-digit national ID.",
      invalid_account_number: "An account number is 10–15 digits.",
      invalid_bank: "Choose a bank.",
      account_name_required: "Enter the account name.",
      number_required: "Enter the account number.",
      below_minimum: "Not enough to withdraw yet.",
      amount_exceeds_balance: "That is more than you can withdraw.",
      identity_not_verified: "Verify your email first, or sign in with Google.",
    } as Record<string, string>,
  },
};

type Bank = { code: string; label: string };

export default function WithdrawCard() {
  const { locale } = useLocale();
  const lang = locale === "en" ? "en" : "th";
  const copy = COPY[lang];
  const queryClient = useQueryClient();

  const account = useQuery({ queryKey: ["payout-account"], queryFn: getPayoutAccount });
  const withdrawals = useQuery({ queryKey: ["withdrawals"], queryFn: getWithdrawals });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ method: "promptpay", bank: "", account_name: "", number: "" });
  const [error, setError] = useState("");

  const refresh = () => {
    for (const key of ["payout-account", "withdrawals", "referral", "credits", "session"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
  const fail = (mutationError: Error) => {
    const detail = errorMessage(mutationError);
    setError(copy.errors[detail] || detail);
  };

  const save = useMutation({
    mutationFn: () => savePayoutAccount({ ...form, number: normalizeNumber(form.number) }),
    onSuccess: () => {
      setError("");
      setEditing(false);
      setForm({ ...form, number: "" });
      refresh();
    },
    onError: fail,
  });
  const withdraw = useMutation({
    mutationFn: () => requestWithdrawal(),
    onSuccess: () => { setError(""); refresh(); },
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: (id: number) => cancelWithdrawal(id),
    onSuccess: refresh,
    onError: fail,
  });

  if (withdrawals.isPending) return null;

  const state = withdrawals.data ?? {};
  const saved = account.data?.account;
  const banks: Bank[] = account.data?.banks ?? [];
  const balance = Number(state.withdrawable_satang || 0);
  /**
   * The floor, or null when the server did not state one.
   *
   * `Number(state.minimum_satang || 0)` read a missing field as ฿0, which is the worst default
   * available on this card: it printed "ถอนขั้นต่ำ ฿0" as a fact, and `canWithdraw`'s
   * `balance < minimum` can never fire against zero, so the button also went live on any balance
   * at all. The real floor is `SiteSetting.withdrawal_min_satang` — ฿300 — and the request would
   * have come back `below_minimum`. Unknown is now unknown: no figure is printed and the button
   * waits, rather than inviting a request the server will refuse.
   */
  const minimum =
    typeof state.minimum_satang === "number" ? state.minimum_satang : null;
  // Whether this deployment can store a bank account at all (PAYOUT_ENCRYPTION_KEY). Absent on an
  // older server, and treated as "yes" there — the previous behaviour, a 503 on submit, rather
  // than hiding a form that in fact works.
  const payoutConfigured = account.data?.payout_configured !== false;

  // A reason code, not a boolean — a disabled button with no explanation is a support message.
  const blocked = !payoutConfigured
    ? "payout_not_configured"
    : minimum === null
      ? "minimum_unknown"
      : canWithdraw({
        enabled: state.withdrawal_enabled !== false,
        hasAccount: Boolean(saved),
        hasOpenRequest: Boolean(state.has_open_request),
        balance,
        minimum,
      });
  const numberProblem = editing ? checkNumber(form.method, form.number) : "";

  return (
    <GlassCard className="referral-card referral-card--withdraw">
      <span className="eyebrow">{copy.title}</span>

      <strong className="referral-balance">{baht(balance)}</strong>
      <p className="referral-note">
        {copy.balance}
        {/* The minimum is only stated when the server stated one. */}
        {minimum !== null ? ` · ${copy.minimum(baht(minimum))}` : ""}
        {blocked === "below_minimum" && minimum !== null
          ? ` · ${copy.shortBy(baht(shortfall(balance, minimum)))}`
          : ""}
      </p>

      <button
        className="referral-withdraw"
        type="button"
        onClick={() => withdraw.mutate()}
        disabled={Boolean(blocked) || withdraw.isPending}
      >
        {copy.withdraw}
      </button>
      {/* The reason is always on screen, never only in a tooltip on a disabled control. */}
      {blocked && <p className="referral-note">{copy.reasons[blocked]}</p>}
      {/* Both of these describe what happens when a request goes through, so neither is said on
          a deployment where none can. */}
      {payoutConfigured && (
        <>
          <p className="referral-note">{copy.deducted}</p>
          <p className="referral-note">{copy.manual}</p>
        </>
      )}

      <h3>{copy.accountTitle}</h3>
      {/* The form is not drawn when nothing can be stored. It asked for a bank account, a name and
          a number, and `payout.save_account` fails closed without PAYOUT_ENCRYPTION_KEY — so every
          field was collected and then refused. The reason above the button already says so. */}
      {!payoutConfigured ? (
        <p className="referral-note">{copy.reasons.payout_not_configured}</p>
      ) : saved && !editing ? (
        <div className="referral-account">
          <span>
            {saved.method === "promptpay" ? copy.promptpay : saved.bank_label} · {saved.masked}
            <small>{saved.account_name}</small>
          </span>
          <button type="button" onClick={() => { setEditing(true); setError(""); }}>
            {copy.change}
          </button>
        </div>
      ) : (
        <form
          className="referral-account-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!numberProblem) save.mutate();
          }}
        >
          <div className="referral-method">
            {(["promptpay", "bank"] as const).map((value) => (
              <button
                className={form.method === value ? "is-selected" : ""}
                type="button"
                key={value}
                onClick={() => setForm({ ...form, method: value, bank: "" })}
                aria-pressed={form.method === value}
              >
                {value === "promptpay" ? copy.promptpay : copy.bank}
              </button>
            ))}
          </div>

          {form.method === "bank" && (
            <label>
              <span>{copy.bank}</span>
              <select
                value={form.bank}
                onChange={(event) => setForm({ ...form, bank: event.target.value })}
                required
              >
                <option value="">{copy.chooseBank}</option>
                {banks.map((bank) => (
                  <option value={bank.code} key={bank.code}>{bank.label}</option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span>{copy.accountName}</span>
            <input
              value={form.account_name}
              onChange={(event) => setForm({ ...form, account_name: event.target.value })}
              required
            />
            <small>{copy.nameHint}</small>
          </label>

          <label>
            <span>{form.method === "promptpay" ? copy.promptpayNumber : copy.number}</span>
            <input
              value={form.number}
              onChange={(event) => setForm({ ...form, number: event.target.value })}
              inputMode="numeric"
              autoComplete="off"
              required
            />
            {/* Only once they have typed something — telling somebody their empty field is
                invalid before they start is nagging, not help. */}
            {form.number && numberProblem ? (
              <small className="referral-error">{copy.errors[numberProblem]}</small>
            ) : null}
          </label>

          <div className="referral-account-actions">
            <button type="submit" disabled={Boolean(numberProblem) || save.isPending}>
              {copy.save}
            </button>
            {saved && (
              <button type="button" onClick={() => { setEditing(false); setError(""); }}>
                {copy.cancel}
              </button>
            )}
          </div>
        </form>
      )}

      {error && (
        <p className="referral-error" role="alert">
          {error}
        </p>
      )}

      <h3>{copy.historyTitle}</h3>
      <ul className="referral-ledger">
        {(state.results ?? []).slice(0, 6).map((row: {
          id: number; amount_satang: number; status: string; status_label: string;
        }) => (
          <li key={row.id}>
            <span>
              {row.status_label}
              {isCancellable(row) && (
                <button
                  className="referral-cancel"
                  type="button"
                  onClick={() => cancel.mutate(row.id)}
                  disabled={cancel.isPending}
                >
                  {copy.cancelRequest}
                </button>
              )}
            </span>
            <b>{baht(row.amount_satang)}</b>
          </li>
        ))}
        {!(state.results ?? []).length && <li className="is-empty">{copy.empty}</li>}
      </ul>
    </GlassCard>
  );
}
