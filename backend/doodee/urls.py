from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ProcedureList, ScanViewSet, SimulationViewSet, delete_account, redeem, session


router = DefaultRouter()
router.register("scans", ScanViewSet, basename="scan")
router.register("simulations", SimulationViewSet, basename="simulation")

urlpatterns = [
    *router.urls,
    path("session/", session),
    path("procedures/", ProcedureList.as_view()),
    path("procedures/<slug:procedure_id>/", ProcedureList.as_view()),
    path("redeem/", redeem),
    path("account/", delete_account),
]
