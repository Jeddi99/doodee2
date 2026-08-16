import uuid

from django.conf import settings
from django.core.validators import MinLengthValidator
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
        SIMULATION = "simulation", "Local facial simulation"

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
        STANDARD = "standard", "Front and both profiles"
        FAST = "fast", "3 views"

    class AgeBand(models.TextChoices):
        ADULT = "adult", "18 or older"
        MINOR = "minor", "Under 18"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="scans")
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.QUEUED, db_index=True)
    progress = models.PositiveSmallIntegerField(default=0)
    age_band = models.CharField(max_length=8, choices=AgeBand.choices)
    reference_age_band = models.CharField(max_length=16, default="18_35")
    reference_profile = models.CharField(max_length=12, default="neutral")
    reference_population = models.CharField(max_length=8, default="TH")
    scan_mode = models.CharField(max_length=16, choices=ScanMode.choices, default=ScanMode.FULL)
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
    # `region` and `preset_id` hold the first selection so rows written before stacking, and
    # readers that only know about one, keep working. `selections` is the whole stack.
    region = models.CharField(max_length=16)
    preset_id = models.CharField(max_length=80, blank=True)
    selections = models.JSONField(default=list)
    source_view = models.CharField(max_length=24, blank=True)
    parameters = models.JSONField(default=dict)
    measurements = models.JSONField(default=list)
    related_procedures = models.JSONField(default=list)
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


class PromoCode(models.Model):
    """A code that grants time-limited paid entitlement without a payment provider.

    Built for testing the entitlement path end to end. Codes are reusable without limit, so
    `is_active` is the kill switch for one that leaks, and settings.REDEEM_CODES_ENABLED turns
    the whole endpoint off.
    """

    code = models.CharField(max_length=64, unique=True, validators=(MinLengthValidator(8),))
    # Days granted from the moment of redemption. 0 makes an already-expired grant, which is
    # how the expiry path gets tested without waiting or editing the database.
    days = models.PositiveSmallIntegerField(default=7)
    is_active = models.BooleanField(default=True)
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.code


class PromoRedemption(models.Model):
    """One row per successful redemption: both the audit trail and the entitlement itself.

    Current entitlement is the newest unexpired `expires_at`, so redeeming again resets the
    window to `now + days` rather than stacking, and every attempt stays on the record.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="promo_redemptions")
    promo_code = models.ForeignKey(PromoCode, on_delete=models.PROTECT, related_name="redemptions")
    redeemed_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ("-redeemed_at",)
        indexes = (models.Index(fields=("user", "expires_at")),)


class SimulationPreviewUsage(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="simulation_preview_usage")
    period = models.DateField()
    count = models.PositiveSmallIntegerField(default=0)

    class Meta:
        constraints = (models.UniqueConstraint(fields=("user", "period"), name="unique_preview_usage_period"),)


class ChatConversation(models.Model):
    """One DOODEE Chat thread.

    `scan` is the scan whose numbers were put in front of the model. It is nullable and
    SET_NULL rather than CASCADE: deleting a scan must not silently erase the conversation the
    user had about it, and `Scan.expires_at` means scans go away on their own.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_conversations")
    scan = models.ForeignKey("Scan", null=True, blank=True, on_delete=models.SET_NULL, related_name="chat_conversations")
    title = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)
        indexes = (models.Index(fields=("user", "-updated_at")),)


class ChatMessage(models.Model):
    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"

    conversation = models.ForeignKey(ChatConversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=9, choices=Role.choices)
    content = models.TextField()
    # Kept per message so the real cost per turn is auditable in admin rather than estimated.
    # `cached_input_tokens` is what prompt caching actually saved; without it there is no way
    # to tell whether the cache is being hit.
    input_tokens = models.PositiveIntegerField(default=0)
    cached_input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
        indexes = (models.Index(fields=("conversation", "created_at")),)


class ChatUsage(models.Model):
    """Turns spent this calendar month, metered the same way as SimulationPreviewUsage.

    Same shape deliberately: the free tier is capped hard, and paid plans get a soft cap that
    exists to bound the damage from a stolen account rather than to ration the feature.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_usage")
    period = models.DateField()
    count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = (models.UniqueConstraint(fields=("user", "period"), name="unique_chat_usage_period"),)
