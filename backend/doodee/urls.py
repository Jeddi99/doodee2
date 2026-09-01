from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ChatViewSet, NotificationViewSet, OrderViewSet, MetricCatalogList, ProcedureCategoryList, ProcedureList, ScanViewSet, SimulationViewSet,
    attribution_view, cancel_withdrawal, credits, delete_account, demo_scan, omise_webhook,
    pay_order, payout_account, plans, profile, redeem, referral_claim, referral_overview,
    register_push_token, session, skin_vision_consent, validate_coupon_view, visit, withdrawals,
)


router = DefaultRouter()
router.register("scans", ScanViewSet, basename="scan")
router.register("simulations", SimulationViewSet, basename="simulation")
router.register("chat", ChatViewSet, basename="chat")
router.register("orders", OrderViewSet, basename="order")
router.register("notifications", NotificationViewSet, basename="notification")

urlpatterns = [
    # Ahead of the router: its detail route matches `scans/<pk>/` with `[^/.]+`, which would
    # capture "demo" as a scan id and answer 404 before this ever runs.
    path("scans/demo/", demo_scan),
    *router.urls,
    path("session/", session),
    path("consent/skin-vision/", skin_vision_consent),
    # Unauthenticated by design — the second and last such route in this file, after the Omise
    # webhook below. It counts people who have no account, so it cannot require one; the view's
    # docstring explains why attaching an auth class here would corrupt the signup numbers.
    path("visit/", visit),
    # The authenticated half of the same story: which link brought this account here.
    path("attribution/", attribution_view),
    # หน้าโปรไฟล์ — identity, plan, quotas, benefits and receipts in one read, because the page
    # is one answer and four endpoints would be four loading states.
    path("profile/", profile),
    # The characteristics the product claims to read, and what backs each one. Its own route
    # rather than part of a scan's payload: it is the same answer for everyone and is asked for
    # before there is a scan to attach it to.
    path("metric-catalog/", MetricCatalogList.as_view()),
    path("procedures/", ProcedureList.as_view()),
    # The 13 headings, so a client can group the list without hardcoding them.
    path("procedures/categories/", ProcedureCategoryList.as_view()),
    # `str`, not `slug`: catalog ids are source refs like "1.1", and the slug converter's
    # character class has no dot in it, so a slug route answers 404 for every real id.
    path("procedures/<str:procedure_id>/", ProcedureList.as_view()),
    path("orders/<int:order_id>/pay/", pay_order),
    # Unauthenticated by design — Omise has no Firebase token. Signature verified instead.
    path("webhooks/omise/", omise_webhook),
    path("plans/", plans),
    # Prices the total after a discount without spending the coupon — a limited code must
    # not be held just because someone typed it into a box.
    path("coupons/validate/", validate_coupon_view),
    path("redeem/", redeem),
    # ชวนเพื่อน. `claim` only records the invitation and hands over the friend's discount; the
    # inviter's credit vests inside billing.activate() when that friend actually pays.
    path("referral/", referral_overview),
    path("referral/claim/", referral_claim),
    path("credits/", credits),
    # Withdrawing that credit as money. Nothing here moves any: a request reserves the amount
    # against the ledger, and an operator makes the transfer by hand from the admin queue.
    path("payout-account/", payout_account),
    path("withdrawals/", withdrawals),
    path("withdrawals/<int:withdrawal_id>/cancel/", cancel_withdrawal),
    path("push-tokens/", register_push_token),
    path("account/", delete_account),
]
