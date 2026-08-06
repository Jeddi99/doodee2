import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import timedelta

import cv2
import numpy as np
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ConsentEvent, Scan, Simulation
from .procedures import PROCEDURES
from .serializers import ScanSerializer, SimulationSerializer
from .analysis_engine import SCAN_VIEW_MODES, DEFAULT_SCAN_MODE, scan_views_for_mode
from .simulation_engine import validate_parameters
from .storage import delete_image, upload_image
from .tasks import cleanup_scan, process_scan, process_simulation, request_scan_deletion


SCAN_VIEWS = SCAN_VIEW_MODES["full"]
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024


@api_view(("GET",))
def session(request):
    return Response({"id": request.user.id, "email": request.user.email})


def _read_image(upload):
    if upload.content_type not in ALLOWED_TYPES:
        raise ValidationError({upload.name: "Only JPEG, PNG, and WebP images are accepted"})
    data = upload.read(MAX_IMAGE_BYTES + 1)
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise ValidationError({upload.name: "Each image must be between 1 byte and 10 MB"})
    if cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR) is None:
        raise ValidationError({upload.name: "Image could not be decoded"})
    return data


class ScanViewSet(viewsets.GenericViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin):
    serializer_class = ScanSerializer
    parser_classes = (MultiPartParser, FormParser)

    def get_queryset(self):
        return Scan.objects.filter(user=self.request.user).exclude(status=Scan.Status.DELETION_PENDING)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset().filter(age_band=Scan.AgeBand.ADULT)
        return Response(self.get_serializer(queryset, many=True).data)

    def create(self, request):
        age_band = request.data.get("age_band")
        if age_band not in Scan.AgeBand.values:
            raise ValidationError({"age_band": "Must be adult or minor"})
        consent_version = str(request.data.get("analysis_consent_version", "")).strip()
        if not consent_version:
            raise ValidationError({"analysis_consent_version": "Consent is required"})
        scan_mode = str(request.data.get("scan_mode", DEFAULT_SCAN_MODE)).strip().lower() or DEFAULT_SCAN_MODE
        if scan_mode not in SCAN_VIEW_MODES:
            raise ValidationError({"scan_mode": "Must be fast or full"})
        required_views = tuple(v for v in scan_views_for_mode(scan_mode))
        missing = [view for view in required_views if view not in request.FILES]
        if missing:
            raise ValidationError({"missing_views": missing})
        payloads = {view: _read_image(request.FILES[view]) for view in required_views}
        expires_at = timezone.now() + timedelta(hours=24 if age_band == Scan.AgeBand.MINOR else 30 * 24)
        uploaded = {}
        token = os.urandom(16).hex()
        upload_error = None
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {}
            for view in required_views:
                object_name = f"users/{request.user.id}/scans/{token}/{view}"
                future = pool.submit(upload_image, object_name, payloads[view], request.FILES[view].content_type)
                futures[future] = view
            for future in as_completed(futures):
                view = futures[future]
                try:
                    uploaded[view] = future.result()
                except Exception as exc:
                    upload_error = upload_error or exc
        if upload_error:
            for object_name in uploaded.values():
                try:
                    delete_image(object_name)
                except Exception:
                    pass
            return Response({"detail": "Image storage is temporarily unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            with transaction.atomic():
                scan = Scan.objects.create(
                    user=request.user,
                    age_band=age_band,
                    scan_mode=scan_mode,
                    image_objects=uploaded,
                    expires_at=expires_at,
                )
                ConsentEvent.objects.create(
                    user=request.user,
                    purpose=ConsentEvent.Purpose.ANALYSIS,
                    policy_version=consent_version,
                )
                if age_band == Scan.AgeBand.ADULT:
                    ConsentEvent.objects.create(
                        user=request.user,
                        purpose=ConsentEvent.Purpose.STORAGE,
                        policy_version=consent_version,
                    )
        except Exception:
            for object_name in uploaded.values():
                try:
                    delete_image(object_name)
                except Exception:
                    pass
            raise
        try:
            process_scan.delay(str(scan.id))
        except Exception:
            for object_name in uploaded.values():
                try:
                    delete_image(object_name)
                except Exception:
                    pass
            scan.delete()
            return Response({"detail": "Analysis queue is unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(self.get_serializer(scan).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=("get",))
    def status(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)

    def destroy(self, request, pk=None):
        request_scan_deletion(self.get_object())
        return Response(status=status.HTTP_204_NO_CONTENT)


class SimulationViewSet(viewsets.GenericViewSet, mixins.RetrieveModelMixin):
    serializer_class = SimulationSerializer

    def get_queryset(self):
        return Simulation.objects.filter(scan__user=self.request.user).exclude(status=Simulation.Status.DELETION_PENDING)

    def create(self, request):
        if not settings.SIMULATION_ENABLED:
            return Response({"detail": "Simulation is temporarily unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        consent_version = str(request.data.get("simulation_consent_version", "")).strip()
        if not consent_version:
            raise ValidationError({"simulation_consent_version": "Separate simulation consent is required"})
        try:
            scan = Scan.objects.get(pk=request.data.get("scan_id"), user=request.user)
        except (Scan.DoesNotExist, ValueError, TypeError):
            raise NotFound("Scan not found")
        if scan.age_band != Scan.AgeBand.ADULT:
            raise ValidationError({"scan_id": "Simulation is unavailable to minors"})
        if scan.status != Scan.Status.COMPLETED or scan.expires_at <= timezone.now() or not scan.image_objects.get("front"):
            raise ValidationError({"scan_id": "A completed scan with an unexpired front image is required"})
        region = request.data.get("region")
        try:
            parameters = validate_parameters(region, request.data.get("parameters"))
        except ValueError as exc:
            raise ValidationError({"parameters": str(exc)}) from exc
        active = self.get_queryset().filter(status__in=(Simulation.Status.QUEUED, Simulation.Status.PROCESSING)).exists()
        if active:
            return Response({"detail": "Only one simulation can run at a time"}, status=status.HTTP_409_CONFLICT)
        now = timezone.now()
        monthly = self.get_queryset().filter(
            created_at__year=now.year,
            created_at__month=now.month,
        ).exclude(status=Simulation.Status.FAILED).count()
        if monthly >= 3:
            return Response({"detail": "Monthly simulation quota reached"}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        daily = Simulation.objects.filter(created_at__date=now.date()).exclude(status=Simulation.Status.FAILED).count()
        if daily >= int(os.getenv("SIMULATION_DAILY_CAP", "100")):
            return Response({"detail": "Simulation is temporarily unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        simulation = Simulation.objects.create(
            scan=scan,
            region=region,
            parameters=parameters,
            model_version=os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image"),
            expires_at=now + timedelta(days=30),
        )
        ConsentEvent.objects.create(
            user=request.user,
            purpose=ConsentEvent.Purpose.SIMULATION,
            policy_version=consent_version,
        )
        try:
            process_simulation.delay(str(simulation.id))
        except Exception:
            simulation.delete()
            return Response({"detail": "Simulation queue is unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(self.get_serializer(simulation).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=("get",))
    def status(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)


class ProcedureList(APIView):
    def get(self, request, procedure_id=None):
        if procedure_id:
            procedure = next((item for item in PROCEDURES if item["id"] == procedure_id), None)
            if not procedure:
                raise NotFound("Procedure not found")
            return Response(procedure)
        region = request.query_params.get("region")
        return Response([item for item in PROCEDURES if not region or item["region"] == region])


@api_view(("DELETE",))
def delete_account(request):
    user = request.user
    user.is_active = False
    user.save(update_fields=("is_active",))
    scans = list(user.scans.exclude(status=Scan.Status.DELETION_PENDING))
    for scan in scans:
        request_scan_deletion(scan)
    if not scans:
        user.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
