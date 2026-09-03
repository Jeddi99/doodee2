"""requirement.md, executed.

`tests.py` tests the code that exists. This file tests the *document* — every sentence in
`.md/requirement.md` becomes an assertion against the running API, organised the way the document
is organised rather than the way the code is. The two catch different things: a unit test passes
when the code does what the code says, and this fails when the code does what the code says but
the document said something else.

Where a figure in the document and a figure in the database disagree, the test asserts the
document's figure and fails. It does not assert the seeded value with a comment explaining the
gap — a test rewritten to match the implementation is a test that has stopped testing.

Everything here goes through the HTTP API with an authenticated client, because "ฟรีเห็นแค่ส่วนน้อย"
is a claim about what a client can obtain, not about what a template renders. A tier that hides a
figure in the UI and still serves it over HTTP is not gated.
"""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from . import billing, entitlement, referral
from .demo_data import create_demo_scan
from .models import (
    CouponGrant, CreditLedger, FirebaseIdentity, Plan, Referral, SiteSetting, Subscription,
)

User = get_user_model()


# The three packages exactly as `.md/requirement.md` lists them. Read from the document, not from
# the migration — the point of this file is to notice when the two have drifted apart.
REQUIRED_PACKAGES = {
    "free": {
        "baht": 0,
        "analysis_depth": Plan.AnalysisDepth.PARTIAL,   # "บอกแค่ส่วนน้อย"
        "has_development_plan": False,                  # "ไม่มีแผนการพัณนา"
        # Zero, and it has been both. The document said "ไม่มีการจำลองใบหน้า", then said three a
        # month, and now says none again — each time because the owner decided it and the document
        # was changed with the decision. The figure is read from the document either way, which is
        # the point of this table: it is not the place the number is chosen.
        #
        # Both simulation columns move together. Zero previews with a non-zero save count is the
        # incoherence 0041 was written to remove — `_simulation_locked` gates the save route on the
        # preview quota, so saves the plan advertises would be unreachable.
        "simulations": 0,                               # "ไม่มีการจำลองใบหน้า"
        "chat_turns": 5,                                # "ai chat ได้ 5 ข้อความต่อเดือน"
    },
    "plus": {
        "baht": 499,
        "analysis_depth": Plan.AnalysisDepth.FULL,
        "has_development_plan": True,
        "simulations": 10,                              # "จำลองใบหน้าได้ 10 ครั้ง"
        "chat_turns": 100,                              # "ai chat ได้ 100 ข้อความต่อเดือน"
    },
    "pro": {
        "baht": 799,
        "analysis_depth": Plan.AnalysisDepth.FULL,
        "has_development_plan": True,
        "simulations": Plan.UNLIMITED,                  # "ไม่จำกัด"
        "chat_turns": Plan.UNLIMITED,                   # "ไม่จำกัด"
    },
}


def _user(name, **extra):
    """A user the reports will count.

    The FirebaseIdentity is not decoration: `admin.real_users` — which every analytics query
    filters through — excludes accounts without one, so a user built without it is invisible to
    exactly the dashboard rows this file is checking, and those tests would pass on an empty
    result set.
    """
    user = User.objects.create_user(username=name, email=f"{name}@example.com", **extra)
    FirebaseIdentity.objects.create(user=user, firebase_uid=f"uid-{name}")
    return user


def _subscribe(user, code, now=None):
    """Put `user` on plan `code` the way a real payment would, and return the subscription."""
    plan = Plan.objects.get(code=code)
    order = billing.create_order(user, plan)
    return billing.activate(order, now=now)


class PackageCatalogTest(TestCase):
    """แพคเกจการสมัคร — the three rows, their prices and their allowances."""

    def test_three_packages_are_on_sale(self):
        codes = set(Plan.objects.filter(is_active=True, self_serve=True).values_list("code", flat=True))
        for code in REQUIRED_PACKAGES:
            self.assertIn(code, codes, f"requirement.md sells {code}; it is not on the price list")

    def test_prices_match_the_document(self):
        for code, want in REQUIRED_PACKAGES.items():
            with self.subTest(plan=code):
                self.assertEqual(Plan.objects.get(code=code).price_satang, want["baht"] * 100)

    def test_analysis_depth_matches_the_document(self):
        for code, want in REQUIRED_PACKAGES.items():
            with self.subTest(plan=code):
                self.assertEqual(Plan.objects.get(code=code).analysis_depth, want["analysis_depth"])

    def test_development_plan_matches_the_document(self):
        for code, want in REQUIRED_PACKAGES.items():
            with self.subTest(plan=code):
                self.assertEqual(
                    Plan.objects.get(code=code).has_development_plan, want["has_development_plan"],
                )

    def test_simulation_allowance_matches_the_document(self):
        for code, want in REQUIRED_PACKAGES.items():
            with self.subTest(plan=code):
                self.assertEqual(
                    Plan.objects.get(code=code).simulation_previews_per_month, want["simulations"],
                )

    def test_chat_allowance_matches_the_document(self):
        for code, want in REQUIRED_PACKAGES.items():
            if "chat_turns" not in want:
                continue
            with self.subTest(plan=code):
                self.assertEqual(
                    Plan.objects.get(code=code).chat_turns_per_month, want["chat_turns"],
                )

    def test_yearly_rows_cost_less_than_twelve_months(self):
        """"มีส่วนลดพิเศษถ้าสมัครรายปี"."""
        for monthly, yearly in (("plus", "plus_year"), ("pro", "pro_year")):
            with self.subTest(plan=yearly):
                month = Plan.objects.get(code=monthly)
                year = Plan.objects.get(code=yearly)
                self.assertLess(year.price_satang, month.price_satang * 12)
                self.assertEqual(year.interval, Plan.Interval.YEAR)

    def test_yearly_grants_the_same_allowances_as_monthly(self):
        """A longer commitment, not a bigger monthly bucket."""
        for monthly, yearly in (("plus", "plus_year"), ("pro", "pro_year")):
            with self.subTest(plan=yearly):
                month = Plan.objects.get(code=monthly)
                year = Plan.objects.get(code=yearly)
                for field in ("simulation_previews_per_month", "chat_turns_per_month",
                              "analysis_depth", "has_development_plan"):
                    self.assertEqual(getattr(month, field), getattr(year, field), field)


class FreePackageTest(TestCase):
    """ฟรี — "บอกการวิเคราะห์ แต่บอกแค่ส่วนน้อย ไม่มีแผนการพัฒนา จำลองใบหน้าได้ 3 ครั้งต่อเดือน"."""

    def setUp(self):
        self.user = _user("free-user")
        self.scan = create_demo_scan(self.user)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_plan_is_free(self):
        self.assertEqual(entitlement.plan_code(self.user), "free")

    def test_session_advertises_the_free_limits(self):
        body = self.client.get("/api/v1/session/").json()
        self.assertTrue(body["score_card_redacted"])
        self.assertFalse(body["development_plan_enabled"])

    def test_analysis_is_shown_but_only_partly(self):
        """Not a wall and not the whole thing — the document asks for both halves."""
        response = self.client.get(f"/api/v1/scans/{self.scan.id}/score-card/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsNotNone(body.get("overall_score"), "free tier must still see the analysis")
        locked = [row for row in body.get("categories", []) if row.get("locked")]
        self.assertTrue(locked, "free tier must not receive every category")

    def test_locked_categories_carry_no_figures(self):
        """Redaction has to remove the number, not just set a flag beside it."""
        body = self.client.get(f"/api/v1/scans/{self.scan.id}/score-card/").json()
        for row in body.get("categories", []):
            if row.get("locked"):
                self.assertIsNone(row.get("score"), f"{row.get('key')} leaked a locked score")

    def test_no_development_plan(self):
        response = self.client.get(f"/api/v1/scans/{self.scan.id}/development-plan/")
        self.assertEqual(response.status_code, 403)

    def test_simulation_is_locked_rather_than_metered(self):
        """"ไม่มีการจำลองใบหน้า" — a plan-level zero, so both routes answer 403.

        This test has said both things. While the document sold three a month it asserted the
        absence of a 403; the owner has since closed the simulator to this tier and the document
        was changed with the decision, so it asserts the 403 instead.

        Both routes, because `_simulation_locked` gates them together — a save is a render too, and
        a tier that could save without previewing would be committing to a picture it never saw.
        403 rather than 429: a spent monthly allowance is rate-limiting and says something the user
        can wait out, while this is the tier not including the feature at all.
        """
        self.assertEqual(entitlement.quota(self.user, entitlement.PREVIEWS), 0)
        self.assertEqual(entitlement.quota(self.user, entitlement.SAVES), 0)
        for route, key in (("preview/", "k1"), ("", "k2")):
            with self.subTest(route=route or "create"):
                response = self.client.post(f"/api/v1/simulations/{route}", {
                    "scan_id": str(self.scan.id), "region": "nose", "preset_id": "x",
                    "simulation_consent_version": "1",
                }, format="json", HTTP_IDEMPOTENCY_KEY=key)
                self.assertEqual(response.status_code, 403, response.content)
                self.assertEqual(response.data["detail"], "simulation_requires_entitlement")

    def test_the_session_tells_the_client_before_it_asks(self):
        """The screen replaces itself with a lock; it must not discover this from a failed POST."""
        session = self.client.get("/api/v1/session/")
        self.assertTrue(session.data["simulation_locked"])

    def test_the_saves_it_advertises_can_be_reached(self):
        """The defect this replaced a 403 to fix, stated as arithmetic rather than as a route.

        A plan that sells saves has to sell at least as many previews, or the last save is
        committed without the user ever having seen what they were committing to.
        """
        free = Plan.objects.get(code="free")
        self.assertGreaterEqual(
            free.simulation_previews_per_month, free.simulation_saves_per_month,
            "the free tier advertises saves it has no preview left to decide on",
        )


class PlusPackageTest(TestCase):
    """พลัส ฿499 — full analysis, development plan, 10 simulations, 100 chat turns."""

    def setUp(self):
        self.user = _user("plus-user")
        _subscribe(self.user, "plus")
        self.scan = create_demo_scan(self.user)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_plan_is_plus(self):
        self.assertEqual(entitlement.plan_code(self.user), "plus")

    def test_analysis_is_complete(self):
        body = self.client.get(f"/api/v1/scans/{self.scan.id}/score-card/").json()
        self.assertFalse([row for row in body.get("categories", []) if row.get("locked")])

    def test_development_plan_is_served(self):
        response = self.client.get(f"/api/v1/scans/{self.scan.id}/development-plan/")
        self.assertEqual(response.status_code, 200)

    def test_simulation_allowance_is_ten(self):
        self.assertEqual(entitlement.quota(self.user, entitlement.PREVIEWS), 10)

    def test_chat_allowance_is_one_hundred(self):
        self.assertEqual(entitlement.quota(self.user, entitlement.CHAT_TURNS), 100)

    def test_allowances_are_finite(self):
        """Plus is capped; a None here would be Pro's entitlement sold at Plus's price."""
        for key in (entitlement.PREVIEWS, entitlement.CHAT_TURNS):
            with self.subTest(key=key):
                self.assertIsNotNone(entitlement.remaining(self.user, key))


class ProPackageTest(TestCase):
    """โปร ฿799 — full analysis, development plan, unlimited simulation and chat."""

    def setUp(self):
        self.user = _user("pro-user")
        _subscribe(self.user, "pro")
        self.scan = create_demo_scan(self.user)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_plan_is_pro(self):
        self.assertEqual(entitlement.plan_code(self.user), "pro")

    def test_analysis_is_complete(self):
        body = self.client.get(f"/api/v1/scans/{self.scan.id}/score-card/").json()
        self.assertFalse([row for row in body.get("categories", []) if row.get("locked")])

    def test_development_plan_is_served(self):
        self.assertEqual(
            self.client.get(f"/api/v1/scans/{self.scan.id}/development-plan/").status_code, 200,
        )

    def test_simulation_and_chat_are_uncapped(self):
        for key in (entitlement.PREVIEWS, entitlement.CHAT_TURNS):
            with self.subTest(key=key):
                self.assertIsNone(entitlement.quota(self.user, key))
                self.assertIsNone(entitlement.remaining(self.user, key))

    def test_session_reports_unlimited_as_null_not_a_number(self):
        """A sentinel that reaches the client renders as a countdown on a plan sold as unlimited."""
        body = self.client.get("/api/v1/session/").json()
        self.assertIsNone(body["preview_remaining"])
        self.assertIsNone(body["chat_remaining"])


class PackageSeparationTest(TestCase):
    """The tiers must actually differ from each other, not merely be named differently."""

    def test_each_tier_strictly_improves_on_the_one_below(self):
        free, plus, pro = (Plan.objects.get(code=code) for code in ("free", "plus", "pro"))
        self.assertLess(free.tier_rank, plus.tier_rank)
        self.assertLess(plus.tier_rank, pro.tier_rank)
        self.assertLess(free.price_satang, plus.price_satang)
        self.assertLess(plus.price_satang, pro.price_satang)

    def test_holding_two_plans_resolves_to_the_better_one(self):
        """A leftover monthly under a new yearly must not demote anybody."""
        user = _user("stacked")
        _subscribe(user, "plus")
        _subscribe(user, "pro")
        self.assertEqual(entitlement.plan_code(user), "pro")


class SubscriptionPeriodTest(TestCase):
    """"สมัคร 1 ครั้งใช้ได้ 1 เดือน / สมัคร 1 ครั้งใช้ได้ 1 ปี"."""

    def test_monthly_lasts_a_month(self):
        user = _user("monthly")
        now = timezone.now()
        subscription = _subscribe(user, "plus", now=now)
        self.assertEqual((subscription.current_period_end - now).days, 30)

    def test_yearly_lasts_a_year(self):
        user = _user("yearly")
        now = timezone.now()
        subscription = _subscribe(user, "plus_year", now=now)
        self.assertEqual((subscription.current_period_end - now).days, 365)

    def test_entitlement_is_live_while_the_period_runs(self):
        user = _user("live")
        _subscribe(user, "plus")
        self.assertEqual(entitlement.plan_code(user), "plus")


class RenewalTest(TestCase):
    """การต่ออายุสมาชิก — renewed in time keeps access, not renewed loses it."""

    def setUp(self):
        self.user = _user("renewer")
        self.now = timezone.now()
        self.subscription = _subscribe(self.user, "plus", now=self.now)

    def _expire(self, days_ago):
        Subscription.objects.filter(pk=self.subscription.pk).update(
            current_period_end=self.now - timedelta(days=days_ago),
        )
        # Groups outlive the subscription; `sync_entitlement` is what removes them.
        billing.sync_entitlement(self.user, now=self.now)

    def test_renewing_in_time_extends_rather_than_restarts(self):
        """An early renewal must not throw away time already paid for."""
        end = self.subscription.current_period_end
        renewed = _subscribe(self.user, "plus", now=self.now)
        self.assertEqual((renewed.current_period_end - end).days, 30)
        self.assertEqual(entitlement.plan_code(self.user), "plus")

    def test_lapsed_beyond_grace_loses_entitlement(self):
        grace = SiteSetting.current().subscription_grace_days
        self._expire(grace + 1)
        self.assertEqual(entitlement.plan_code(self.user), "free")

    def test_lapsed_inside_grace_keeps_entitlement(self):
        """Someone who transferred a day late is still a customer."""
        grace = SiteSetting.current().subscription_grace_days
        if grace < 1:
            self.skipTest("grace window is switched off")
        self._expire(1)
        self.assertEqual(entitlement.plan_code(self.user), "plus")

    def test_a_lapsed_account_is_reported_as_lapsed_even_inside_grace(self):
        """The report tells the truth; only the switch-off date moves."""
        grace = SiteSetting.current().subscription_grace_days
        if grace < 1:
            self.skipTest("grace window is switched off")
        self._expire(1)
        self.assertEqual(
            Subscription.objects.get(pk=self.subscription.pk).status, Subscription.Status.EXPIRED,
        )

    def test_renewing_after_lapse_restores_the_package(self):
        self._expire(SiteSetting.current().subscription_grace_days + 1)
        self.assertEqual(entitlement.plan_code(self.user), "free")
        _subscribe(self.user, "plus", now=self.now)
        self.assertEqual(entitlement.plan_code(self.user), "plus")

    def test_expiry_notice_is_sent_before_the_period_ends(self):
        """"เมื่อครบกำหนดระยะเวลา ผู้ใช้จะได้รับการแจ้งเตือนให้ต่ออายุ"."""
        from . import analytics
        Subscription.objects.filter(pk=self.subscription.pk).update(
            current_period_end=self.now + timedelta(days=3),
        )
        chased = [row["user_id"] for row in analytics.expiring_soon(days=7, now=self.now)]
        self.assertIn(self.user.pk, chased)


class ReferralRewardTest(TestCase):
    """ระบบชวนเพื่อน — ฿30 to the inviter, 10%/฿100 once to the friend."""

    def setUp(self):
        self.inviter = _user("inviter")
        self.invitee = _user("invitee")
        self.code = referral.code_for(self.inviter).code
        # "ต้องมีการยืนยันตัวตน เช่น อีเมล หรือ เบอร์มือถือ หรือ GOOGLE"
        self.verified = type("Request", (), {"auth": {"email_verified": True}, "META": {}})()

    def _claim(self):
        return referral.claim(self.invitee, self.code, request=self.verified)

    def test_reward_is_thirty_baht(self):
        self.assertEqual(SiteSetting.current().reward_satang, 3000)

    def test_friend_discount_is_ten_percent_capped_at_one_hundred(self):
        coupon = referral.invitee_coupon()
        self.assertIsNotNone(coupon, "the invited friend's coupon was never seeded")
        self.assertEqual(coupon.discount_type, "percent")
        self.assertEqual(coupon.discount_value, 10)
        self.assertEqual(coupon.max_discount_satang, 10000)

    def test_friend_discount_is_once_per_account(self):
        self.assertTrue(referral.invitee_coupon().once_per_user)

    def test_friend_discount_cannot_be_typed_in_without_an_invite(self):
        """A single global code on a checkout screen is worth nothing if anyone can use it."""
        self.assertTrue(referral.invitee_coupon().requires_grant)
        stranger = _user("stranger")
        with self.assertRaises(billing.CouponError):
            billing.validate_coupon(
                referral.invitee_coupon().code, Plan.objects.get(code="plus"), stranger,
            )

    def test_claiming_grants_the_friend_their_discount_immediately(self):
        self._claim()
        self.assertTrue(
            CouponGrant.objects.filter(user=self.invitee, coupon=referral.invitee_coupon()).exists(),
        )

    def test_the_cap_binds_on_the_yearly_plan(self):
        """10% of ฿4,990 is ฿499 — five times what was offered."""
        self._claim()
        coupon = referral.invitee_coupon()
        year = Plan.objects.get(code="plus_year")
        self.assertEqual(billing.discount_for(coupon, year.price_satang), 10000)

    def test_unverified_identity_cannot_claim(self):
        anonymous = type("Request", (), {"auth": {}, "META": {}})()
        with self.assertRaises(referral.ReferralError) as caught:
            referral.claim(self.invitee, self.code, request=anonymous)
        self.assertEqual(caught.exception.code, "identity_not_verified")

    def test_google_signin_counts_as_verification(self):
        google = type("Request", (), {
            "auth": {"firebase": {"sign_in_provider": "google.com"}}, "META": {},
        })()
        self.assertIsNotNone(referral.claim(self.invitee, self.code, request=google))

    def test_cannot_invite_yourself(self):
        with self.assertRaises(referral.ReferralError) as caught:
            referral.claim(self.inviter, self.code, request=self.verified)
        self.assertEqual(caught.exception.code, "cannot_refer_yourself")

    def test_one_account_can_only_be_invited_once(self):
        self._claim()
        other = referral.code_for(_user("other-inviter")).code
        with self.assertRaises(referral.ReferralError) as caught:
            referral.claim(self.invitee, other, request=self.verified)
        self.assertEqual(caught.exception.code, "already_referred")

    def test_reward_vests_on_the_friends_first_payment(self):
        self._claim()
        self.assertEqual(referral.credit_balance(self.inviter), 0)
        _subscribe(self.invitee, "plus")
        row = Referral.objects.get(invitee=self.invitee)
        if row.status == Referral.Status.HELD:
            self.skipTest("held for review; see shares_signup_address")
        self.assertEqual(referral.credit_balance(self.inviter), 3000)

    def test_reward_is_paid_once_not_per_renewal(self):
        self._claim()
        _subscribe(self.invitee, "plus")
        before = referral.credit_balance(self.inviter)
        _subscribe(self.invitee, "plus")
        self.assertEqual(referral.credit_balance(self.inviter), before)

    def test_inviter_sees_the_claim_button_once_the_reward_lands(self):
        """"ผู้ชวนเมื่อได้สิทธิ์แล้วจะเห็นปุ่มใช้สิทธิ์ในหน้าโปรไฟล์"."""
        self._claim()
        _subscribe(self.invitee, "plus")
        client = APIClient()
        client.force_authenticate(self.inviter)
        body = client.get("/api/v1/referral/").json()
        self.assertGreater(body.get("credit_balance_satang", 0), 0)
        self.assertEqual(body["qualified"], 1)

    def test_friend_sees_the_claim_button_once_the_discount_lands(self):
        """"ผู้ถูกชวนเมื่อได้สิทธิ์แล้วจะเห็นปุ่มใช้สิทธิ์ในหน้าโปรไฟล์"."""
        self._claim()
        client = APIClient()
        client.force_authenticate(self.invitee)
        body = client.get("/api/v1/referral/").json()
        discounts = body.get("available_discounts") or []
        self.assertEqual([row["code"] for row in discounts], [referral.invitee_coupon().code])
        self.assertEqual(discounts[0]["max_discount_satang"], 10000)


class ReferralSpendTest(TestCase):
    """The ฿30 has to be spendable, or it is a number on a screen."""

    def test_credit_reduces_the_next_order(self):
        user = _user("credited")
        CreditLedger.objects.create(
            user=user, amount_satang=3000, kind=CreditLedger.Kind.REFERRAL_REWARD,
        )
        plan = Plan.objects.get(code="plus")
        order = billing.create_order(user, plan, use_credit=True)
        self.assertEqual(order.total_satang, plan.price_satang - 3000)

    def test_credit_is_spent_only_once(self):
        user = _user("double-spender")
        CreditLedger.objects.create(
            user=user, amount_satang=3000, kind=CreditLedger.Kind.REFERRAL_REWARD,
        )
        plan = Plan.objects.get(code="plus")
        first = billing.create_order(user, plan, use_credit=True)
        second = billing.create_order(user, plan, use_credit=True)
        billing.activate(first)
        billing.activate(second)
        self.assertGreaterEqual(referral.credit_balance(user), 0)


class AdminDashboardTest(TestCase):
    """admin dashboard — every row the document lists must be answerable."""

    def test_visitor_source_and_campaign_are_reported(self):
        from . import analytics
        for field in ("source", "campaign"):
            with self.subTest(field=field):
                self.assertIsInstance(analytics.attribution_rows(field), list)

    def test_visit_count_is_reported(self):
        from . import analytics
        totals = analytics.visit_totals()
        for field in ("today", "week", "window"):
            with self.subTest(field=field):
                self.assertIn(field, totals)

    def test_capture_method_is_reported(self):
        from . import analytics
        self.assertIsInstance(analytics.capture_method_rows(), list)

    def test_the_funnel_covers_every_stage_the_document_lists(self):
        """ผู้เข้าชม → ล็อกอิน → สแกนหน้า → ชำระเงิน."""
        from . import analytics
        stages = [row["step"] for row in analytics.acquisition_funnel()]
        self.assertEqual(stages, ["ผู้เข้าชม", "สมัครสมาชิก", "สแกนสำเร็จ", "จ่ายเงิน"])

    def test_monthly_and_yearly_signups_are_counted_separately(self):
        from . import analytics
        mix = analytics.interval_mix()
        intervals = {row["interval"] for row in mix}
        self.assertIn(Plan.Interval.MONTH, intervals)
        self.assertIn(Plan.Interval.YEAR, intervals)

    def test_new_signups_and_renewals_are_counted_separately(self):
        """"จำนวนคนที่สมัคร" and "จำนวนคนที่ต่ออายุ" are different questions."""
        from . import analytics
        user = _user("counted")
        _subscribe(user, "plus")
        _subscribe(user, "plus")
        kinds = {row["kind"]: row for row in analytics.order_kind_rows()}
        self.assertIn("first", kinds)
        self.assertIn("renewal", kinds)
        self.assertEqual(kinds["first"]["total"], 1)
        self.assertEqual(kinds["renewal"]["total"], 1)
