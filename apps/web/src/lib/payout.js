// Withdrawing referral credit as money, client side. Pure functions only — every rule that
// decides whether money moves lives on the server, and these exist so the parts that only decide
// what a button says can be tested without a browser.

/** Digits only. Users type account numbers with dashes and spaces; none of it is the account. */
export const normalizeNumber = (value) =>
  String(value ?? "").replace(/\D/g, "");

/**
 * Whether this could be a real destination. Mirrors `payout.validate_number` on the server, and
 * is deliberately just as loose: a Thai account is 10–15 digits depending on the bank, a
 * PromptPay ID is a 10-digit mobile or a 13-digit national ID, and anything tighter would reject
 * a real account the day a bank changes format.
 *
 * Returns a reason code rather than a boolean so the field can say what is wrong.
 */
export function checkNumber(method, value) {
  const digits = normalizeNumber(value);
  if (!digits) return "number_required";
  if (method === "promptpay") {
    return digits.length === 10 || digits.length === 13 ? "" : "invalid_promptpay_id";
  }
  return digits.length >= 10 && digits.length <= 15 ? "" : "invalid_account_number";
}

/** `••••1234`, matching what the server sends back so a saved and an unsaved account look alike. */
export function maskAccount(value) {
  const digits = normalizeNumber(value);
  return digits ? `••••${digits.slice(-4)}` : "";
}

/**
 * Why the withdraw button is or is not available.
 *
 * A reason code, never a boolean: "you cannot withdraw" with no explanation is the single most
 * common way a payout screen generates support messages. Order matters — the most fixable
 * problem is reported first, so somebody with no bank account and no balance is told to add an
 * account rather than to go earn more credit.
 */
export function canWithdraw({ enabled = true, hasAccount, hasOpenRequest, balance, minimum }) {
  if (!enabled) return "withdrawal_disabled";
  if (hasOpenRequest) return "withdrawal_already_pending";
  if (!hasAccount) return "no_payout_account";
  if (!balance || balance <= 0) return "no_balance";
  if (balance < minimum) return "below_minimum";
  return "";
}

/** How far off the minimum somebody is, or 0 once they are over it. */
export const shortfall = (balance, minimum) =>
  Math.max(0, Number(minimum || 0) - Number(balance || 0));

/** Whether a request can still be taken back. Matches `payout.cancel_withdrawal`'s rule. */
export const isCancellable = (withdrawal) => withdrawal?.status === "pending";

/** Which requests are still live, i.e. the money has neither been sent nor returned. */
export const isOpen = (withdrawal) =>
  withdrawal?.status === "pending" || withdrawal?.status === "approved";
