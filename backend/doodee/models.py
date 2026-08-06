import uuid

from django.conf import settings
from django.db import models


class FirebaseIdentity(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="firebase_identity")
    firebase_uid = models.CharField(max_length=128, unique=True)

    def __str__(self):
        return self.firebase_uid


class ConsentEvent(models.Model):
    class Purpose(models.TextChoices):
        ANALYSIS = "analysis", "Analysis"
        STORAGE = "storage", "Storage and history"
        SIMULATION = "simulation", "External AI simulation"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    purpose = models.CharField(max_length=16, choices=Purpose.choices)
    policy_version = models.CharField(max_length=32)
    accepted = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Scan(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        DELETION_PENDING = "deletion_pending", "Deletion pending"

    class ScanMode(models.TextChoices):
        FULL = "full", "7 views"
        FAST = "fast", "3 views"

    class AgeBand(models.TextChoices):
        ADULT = "adult", "18 or older"
        MINOR = "minor", "Under 18"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="scans")
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.QUEUED, db_index=True)
    progress = models.PositiveSmallIntegerField(default=0)
    age_band = models.CharField(max_length=8, choices=AgeBand.choices)
    scan_mode = models.CharField(max_length=8, choices=ScanMode.choices, default=ScanMode.FULL)
    image_objects = models.JSONField(default=dict)
    analysis_data = models.JSONField(null=True, blank=True)
    formula_version = models.CharField(max_length=16, default="2026.1")
    error_code = models.CharField(max_length=40, blank=True)
    error_message = models.CharField(max_length=500, blank=True)
    expires_at = models.DateTimeField()
    deletion_requested_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)


class Simulation(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        DELETION_PENDING = "deletion_pending", "Deletion pending"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scan = models.ForeignKey(Scan, on_delete=models.CASCADE, related_name="simulations")
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.QUEUED, db_index=True)
    progress = models.PositiveSmallIntegerField(default=0)
    region = models.CharField(max_length=16)
    parameters = models.JSONField(default=dict)
    model_version = models.CharField(max_length=80)
    before_object = models.CharField(max_length=500, blank=True)
    after_object = models.CharField(max_length=500, blank=True)
    error_code = models.CharField(max_length=40, blank=True)
    error_message = models.CharField(max_length=500, blank=True)
    expires_at = models.DateTimeField()
    deletion_requested_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
