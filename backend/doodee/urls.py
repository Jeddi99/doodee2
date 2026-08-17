from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ChatViewSet, OrderViewSet, ProcedureList, ScanViewSet, SimulationViewSet, delete_account,
    plans, redeem, session, validate_coupon_view,
)


router = DefaultRouter()
router.register("scans", ScanViewSet, basename="scan")
router.register("simulations", SimulationViewSet, basename="simulation")
router.register("chat", ChatViewSet, basename="chat")
router.register("orders", OrderViewSet, basename="order")

urlpatterns = [
    *router.urls,
    path("session/", session),
    path("procedures/", ProcedureList.as_view()),
    path("procedures/<slug:procedure_id>/", ProcedureList.as_view()),
    path("plans/", plans),
    # Prices the total after a discount without spending the coupon — a limited code must
    # not be held just because someone typed it into a box.
    path("coupons/validate/", validate_coupon_view),
    path("redeem/", redeem),
    path("account/", delete_account),
]
