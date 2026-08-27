"""Paying referral credit out as real money.

Two halves, and they are separate on purpose.

**Storing where to send it.** This is the only place in the product that holds a customer's bank
details, so the number is encrypted with a key that lives in the environment and never in the
database it protects. With no key configured, saving **fails closed** — a missing key must never
degrade into writing account numbers in plaintext, because that failure is invisible until the
day the database leaks.

**Moving the money.** There is no payout rail: an admin reads the queue, makes the transfer by
hand and records the reference. That is the same manual shape `Order.Provider.MANUAL` already
uses for taking money, run in the opposite direction, and it means no code here ever touches a
bank — it records decisions a person made.

The credit is deducted from the ledger when a withdrawal is **requested**, not when it is paid.
That is the opposite of `billing._spend_credit`'s timing and deliberately so: an unpaid order is
somebody who changed their mind, but an unpaid withdrawal is money the user has already asked to
remove. Leaving it spendable would let the same ฿300 be requested twice, or be requested and then
spent on a subscription while an operator is standing at the bank. Rejecting or cancelling writes
a positive row back.
"""

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .authentication import identity_is_verified
from .models import CreditLedger, PayoutAccount, SiteSetting, WithdrawalRequest


class PayoutError(ValueError):
    """Carries a stable machine code; the client shows a different message for each."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


# The banks a Thai retail transfer realistically goes to. A fixed list rather than free text so
# the admin making the transfer reads a bank name rather than whatever the user typed.
BANKS = (
    ("kbank", "กสิกรไทย (KBANK)"),
    ("scb", "ไทยพาณิชย์ (SCB)"),
    ("bbl", "กรุงเทพ (BBL)"),
    ("ktb", "กรุงไทย (KTB)"),
    ("bay", "กรุงศรีอยุธยา (BAY)"),
    ("ttb", "ทหารไทยธนชาต (TTB)"),
    ("gsb", "ออมสิน (GSB)"),
    ("baac", "ธ.ก.ส. (BAAC)"),
    ("uob", "ยูโอบี (UOB)"),
    ("cimb", "ซีไอเอ็มบี ไทย (CIMB)"),
    ("lhb", "แลนด์ แอนด์ เฮ้าส์ (LHB)"),
    ("kkp", "เกียรตินาคินภัทร (KKP)"),
    ("tisco", "ทิสโก้ (TISCO)"),
    ("ghb", "อาคารสงเคราะห์ (GHB)"),
)
BANK_CODES = {code for code, _label in BANKS}


# ---------------------------------------------------------------- encryption


def _fernet():
    """The cipher, or PayoutError. Never a silent fallback to plaintext."""
    key = (settings.PAYOUT_ENCRYPTION_KEY or "").strip()
    if not key:
        raise PayoutError("payout_not_configured")
    from cryptography.fernet import Fernet

    try:
        return Fernet(key.encode())
    except Exception as exc:
        # A malformed key is a deployment mistake, and treating it as "no encryption" would be
        # the worst possible recovery.
        raise PayoutError("payout_not_configured") from exc


def encrypt_number(number):
    return _fernet().encrypt(str(number).encode())


def decrypt_number(payout_account):
    """The full account number. Every caller must be an audited admin action."""
    data = payout_account.number_encrypted
    if isinstance(data, memoryview):
        # psycopg hands back a memoryview for a BinaryField.
        data = data.tobytes()
    return _fernet().decrypt(bytes(data)).decode()


def normalize_number(value):
    """Digits only. Users type account numbers with dashes, spaces and sometimes a leading zero
    they are unsure about — none of that changes the account, and keeping it would mean two
    records of the same account never compare equal."""
    return "".join(character for character in str(value or "") if character.isdigit())


def validate_number(method, number):
    """Length checks only, and deliberately loose.

    A Thai bank account is 10–15 digits depending on the bank, and a PromptPay ID is a 10-digit
    mobile number or a 13-digit national ID. Anything tighter would reject a real account the day
    a bank changes its format, and the transfer is made by a person who will notice a wrong
    number long before the format check would have.
    """
    if method == PayoutAccount.Method.PROMPTPAY:
        if len(number) not in (10, 13):
            raise PayoutError("invalid_promptpay_id")
    elif len(number) < 10 or len(number) > 15:
        raise PayoutError("invalid_account_number")


# ---------------------------------------------------------------- the account


@transaction.atomic
def save_account(user, method, bank, account_name, number):
    """Create or replace this user's payout account. Returns it.

    Replacing is a plain overwrite: there is one account per user, and a `WithdrawalRequest`
    already in flight carries its own snapshot of where it was going, so nothing in the queue is
    affected by an edit made after it was queued.
    """
    method = str(method or "").strip().lower()
    if method not in PayoutAccount.Method.values:
        raise PayoutError("invalid_method")

    bank = str(bank or "").strip().lower()
    if method == PayoutAccount.Method.BANK and bank not in BANK_CODES:
        raise PayoutError("invalid_bank")
    if method == PayoutAccount.Method.PROMPTPAY:
        bank = ""

    account_name = str(account_name or "").strip()
    if not account_name:
        raise PayoutError("account_name_required")

    number = normalize_number(number)
    validate_number(method, number)

    # Encrypted before the row is touched, so a missing key leaves nothing half-written.
    ciphertext = encrypt_number(number)
    account, _ = PayoutAccount.objects.update_or_create(user=user, defaults={
        "method": method,
        "bank": bank,
        "account_name": account_name,
        "number_encrypted": ciphertext,
        "number_last4": number[-4:],
    })
    return account


def account_summary(account):
    """What the user and the admin list may see. Never the number."""
    if not account:
        return None
    return {
        "method": account.method,
        "bank": account.bank,
        "bank_label": dict(BANKS).get(account.bank, ""),
        "account_name": account.account_name,
        "number_last4": account.number_last4,
        "masked": account.masked,
        "updated_at": account.updated_at,
    }


# ---------------------------------------------------------------- the balance


def _balance(user):
    return CreditLedger.objects.filter(user=user).aggregate(
        total=Sum("amount_satang"),
    )["total"] or 0


def withdrawable(user, now=None):
    """Balance minus rewards too young to withdraw.

    The hold window is 0 today, because PromptPay and manual bank transfer cannot be reversed —
    nobody can pay ฿449, collect ฿30 in cash and then claw the payment back. It exists as a
    setting because the day a card provider is added that stops being true, and the fix has to be
    an admin edit rather than a release.
    """
    now = now or timezone.now()
    balance = _balance(user)
    hold_days = SiteSetting.current().withdrawal_hold_days
    if not hold_days:
        return max(0, balance)

    from datetime import timedelta

    # Positive rows younger than the window are held back. Spends are never held: money already
    # gone cannot become withdrawable later.
    immature = CreditLedger.objects.filter(
        user=user, amount_satang__gt=0, created_at__gt=now - timedelta(days=hold_days),
    ).aggregate(total=Sum("amount_satang"))["total"] or 0
    return max(0, balance - immature)


def open_request(user):
    return WithdrawalRequest.objects.filter(
        user=user, status__in=WithdrawalRequest.OPEN_STATUSES,
    ).first()


# ---------------------------------------------------------------- requesting


@transaction.atomic
def request_withdrawal(user, amount_satang=None, request=None, now=None):
    """Ask for `amount_satang` (or the whole withdrawable balance) as money.

    Writes the negative ledger row immediately — see the module docstring. Raises `PayoutError`
    with a machine code for every refusal.
    """
    config = SiteSetting.current()
    if not config.withdrawal_enabled:
        raise PayoutError("withdrawal_disabled")

    now = now or timezone.now()
    account = PayoutAccount.objects.filter(user=user).first()
    if not account:
        raise PayoutError("no_payout_account")

    if config.require_verified_email and request is not None and not identity_is_verified(
        getattr(request, "auth", None)
    ):
        # The same bar the referral claim uses. Money leaving the building is not the moment to
        # be laxer about who is asking than the moment it was earned.
        raise PayoutError("identity_not_verified")

    if open_request(user):
        # One at a time. Two open requests could each be sized against the same balance, and an
        # operator paying both would send more than the user holds.
        raise PayoutError("withdrawal_already_pending")

    available = withdrawable(user, now)
    amount = int(amount_satang) if amount_satang else available
    if amount <= 0 or amount > available:
        raise PayoutError("amount_exceeds_balance")
    if amount < config.withdrawal_min_satang:
        raise PayoutError("below_minimum")

    withdrawal = WithdrawalRequest.objects.create(
        user=user,
        amount_satang=amount,
        destination={
            "method": account.method,
            "bank": account.bank,
            "bank_label": dict(BANKS).get(account.bank, ""),
            "account_name": account.account_name,
            "number_last4": account.number_last4,
            # The ciphertext travels with the snapshot so a later edit cannot redirect a payout
            # that is already queued. It is no more readable here than it is on the account.
            "number_encrypted": bytes(account.number_encrypted).decode("latin-1"),
        },
    )
    CreditLedger.objects.create(
        user=user, amount_satang=-amount, kind=CreditLedger.Kind.WITHDRAWAL,
        note=f"คำขอถอน #{withdrawal.pk}",
    )
    return withdrawal


def destination_number(withdrawal):
    """The full number this payout should go to. An audited admin action, like the account's."""
    ciphertext = (withdrawal.destination or {}).get("number_encrypted")
    if not ciphertext:
        raise PayoutError("no_destination_recorded")
    return _fernet().decrypt(ciphertext.encode("latin-1")).decode()


# ---------------------------------------------------------------- the queue


def _refund(withdrawal, note):
    """Put the money back as a new positive row. Never by deleting the negative one."""
    CreditLedger.objects.create(
        user=withdrawal.user, amount_satang=withdrawal.amount_satang,
        kind=CreditLedger.Kind.REFUND, note=note,
    )


@transaction.atomic
def cancel_withdrawal(withdrawal):
    """The user changing their mind. Only while nobody has acted on it yet."""
    withdrawal = WithdrawalRequest.objects.select_for_update().get(pk=withdrawal.pk)
    if withdrawal.status != WithdrawalRequest.Status.PENDING:
        raise PayoutError("withdrawal_not_cancellable")
    withdrawal.status = WithdrawalRequest.Status.CANCELLED
    withdrawal.save(update_fields=("status",))
    _refund(withdrawal, f"ยกเลิกคำขอถอน #{withdrawal.pk}")
    return withdrawal


@transaction.atomic
def approve(withdrawal, by):
    """Checked and queued for transfer. No money moves here and none is returned."""
    withdrawal = WithdrawalRequest.objects.select_for_update().get(pk=withdrawal.pk)
    if withdrawal.status != WithdrawalRequest.Status.PENDING:
        raise PayoutError("withdrawal_not_pending")
    withdrawal.status = WithdrawalRequest.Status.APPROVED
    withdrawal.reviewed_by = by
    withdrawal.reviewed_at = timezone.now()
    withdrawal.save(update_fields=("status", "reviewed_by", "reviewed_at"))
    return withdrawal


@transaction.atomic
def mark_paid(withdrawal, by, reference):
    """Record a transfer that has actually happened.

    The reference is required. Without it this row says money left with no way to prove it did,
    which is exactly the record a payout dispute needs.
    """
    reference = str(reference or "").strip()
    if not reference:
        raise PayoutError("reference_required")

    withdrawal = WithdrawalRequest.objects.select_for_update().get(pk=withdrawal.pk)
    if withdrawal.status not in WithdrawalRequest.OPEN_STATUSES:
        raise PayoutError("withdrawal_not_open")

    now = timezone.now()
    withdrawal.status = WithdrawalRequest.Status.PAID
    withdrawal.reference = reference
    withdrawal.reviewed_by = by
    withdrawal.reviewed_at = withdrawal.reviewed_at or now
    withdrawal.paid_at = now
    withdrawal.save(update_fields=("status", "reference", "reviewed_by", "reviewed_at", "paid_at"))

    # The credit already left the ledger when the request was made; paying it is the transfer
    # actually happening, which the ledger has nothing more to say about.
    from .notifications import notify

    notify(
        withdrawal.user,
        kind="withdrawal_paid",
        title="โอนเงินให้แล้ว",
        body=f"เราโอน ฿{withdrawal.amount_satang / 100:,.2f} เข้าบัญชี {withdrawal.masked_destination} แล้ว",
        dedupe_key=f"withdrawal-paid:{withdrawal.pk}",
        payload={"withdrawal_id": withdrawal.pk},
    )
    return withdrawal


@transaction.atomic
def reject(withdrawal, by, note=""):
    """Refuse it and give the credit back."""
    withdrawal = WithdrawalRequest.objects.select_for_update().get(pk=withdrawal.pk)
    if withdrawal.status not in WithdrawalRequest.OPEN_STATUSES:
        raise PayoutError("withdrawal_not_open")

    withdrawal.status = WithdrawalRequest.Status.REJECTED
    withdrawal.note = note or withdrawal.note
    withdrawal.reviewed_by = by
    withdrawal.reviewed_at = timezone.now()
    withdrawal.save(update_fields=("status", "note", "reviewed_by", "reviewed_at"))
    _refund(withdrawal, f"คืนเครดิตจากคำขอถอน #{withdrawal.pk}")

    from .notifications import notify

    notify(
        withdrawal.user,
        kind="withdrawal_rejected",
        title="คำขอถอนเงินไม่ผ่าน",
        body=(f"เครดิต ฿{withdrawal.amount_satang / 100:,.2f} คืนเข้าบัญชีของคุณแล้ว"
              + (f" · {note}" if note else "")),
        dedupe_key=f"withdrawal-rejected:{withdrawal.pk}",
        payload={"withdrawal_id": withdrawal.pk},
    )
    return withdrawal
