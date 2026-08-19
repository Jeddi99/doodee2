from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ChatViewSet, OrderViewSet, ProcedureList, ScanViewSet, SimulationViewSet, delete_account,
    demo_scan, omise_webhook, pay_order, plans, redeem, session, validate_coupon_view,
)


router = DefaultRouter()
router.register("scans", ScanViewSet, basename="scan")
router.register("simulations", SimulationViewSet, basename="simulation")
router.register("chat", ChatViewSet, basename="chat")
router.register("orders", OrderViewSet, basename="order")

urlpatterns = [
    # Ahead of the router: its detail route matches `scans/<pk>/` with `[^/.]+`, which would
    # capture "demo" as a scan id and answer 404 before this ever runs.
    path("scans/demo/", demo_scan),
    *router.urls,
    path("session/", session),
    path("procedures/", ProcedureList.as_view()),
    path("procedures/<slug:procedure_id>/", ProcedureList.as_view()),
    path("orders/<int:order_id>/pay/", pay_order),
    # Unauthenticated by design — Omise has no Firebase token. Signature verified instead.
    path("webhooks/omise/", omise_webhook),
    path("plans/", plans),
    # Prices the total after a discount without spending the coupon — a limited code must
    # not be held just because someone typed it into a box.
    path("coupons/validate/", validate_coupon_view),
    path("redeem/", redeem),
    path("account/", delete_account),
]
