from rest_framework import serializers

from .models import ChatConversation, ChatMessage, Order, Plan, Scan, Simulation
from .storage import signed_url


class ScanSerializer(serializers.ModelSerializer):
    analysis_tier = serializers.SerializerMethodField()
    missing_optional_views = serializers.SerializerMethodField()
    front_url = serializers.SerializerMethodField()
    has_profile_images = serializers.SerializerMethodField()
    images_expired = serializers.SerializerMethodField()

    class Meta:
        model = Scan
        fields = (
            "id", "status", "progress", "age_band", "reference_age_band", "reference_profile", "reference_population",
            "scan_mode", "analysis_data", "formula_version",
            "analysis_tier", "missing_optional_views", "front_url", "has_profile_images", "images_expired",
            "is_demo",
            "error_code", "error_message", "expires_at", "created_at",
        )
        read_only_fields = fields

    def get_has_profile_images(self, obj):
        """Lets clients gate profile presets on the photos that exist, not the mode name."""
        return any((obj.image_objects or {}).get(view) for view in ("left_profile", "right_profile"))

    def get_analysis_tier(self, obj):
        return (obj.analysis_data or {}).get("analysis_tier") or obj.scan_mode

    def get_missing_optional_views(self, obj):
        return (obj.analysis_data or {}).get("missing_optional_views")

    def get_images_expired(self, obj):
        """The photos were deleted on schedule, and are never coming back.

        `purge_scan_images` (tasks.py:118) empties `image_objects` 30 days after a scan while
        keeping the row and its `analysis_data` — biometrics go, derived numbers stay. Without
        this flag a client cannot tell that permanent state apart from a signing failure it
        should retry, and the honest message for each is different.
        """
        return obj.status == Scan.Status.COMPLETED and not (obj.image_objects or {})

    def get_front_url(self, obj):
        object_name = (obj.image_objects or {}).get("front")
        if obj.status != Scan.Status.COMPLETED or not object_name:
            return None
        try:
            return signed_url(object_name)
        except Exception:
            # Storage being unreachable is temporary; `images_expired` stays False so the
            # client offers a retry rather than claiming the photo was deleted.
            return None


class SimulationSerializer(serializers.ModelSerializer):
    before_url = serializers.SerializerMethodField()
    after_url = serializers.SerializerMethodField()
    preset = serializers.SerializerMethodField()

    class Meta:
        model = Simulation
        fields = (
            "id", "scan_id", "status", "progress", "region", "preset", "selections", "source_view", "measurements",
            "related_procedures", "model_version", "before_url", "after_url", "error_code", "error_message",
            "expires_at", "created_at",
        )
        read_only_fields = fields

    def _url(self, obj, field):
        object_name = getattr(obj, field)
        if obj.status != Simulation.Status.COMPLETED or not object_name:
            return None
        try:
            return signed_url(object_name)
        except Exception:
            return None

    def get_before_url(self, obj):
        return self._url(obj, "before_object")

    def get_after_url(self, obj):
        return self._url(obj, "after_object")

    def get_preset(self, obj):
        from .procedures import get_preset

        return get_preset(obj.preset_id)


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        # Token counts are cost accounting, not something the user asked for; they stay in
        # admin. `content` is already the user's own text and the model's reply.
        fields = ("id", "role", "content", "created_at")
        read_only_fields = fields


class ChatConversationSerializer(serializers.ModelSerializer):
    """List shape: enough for the sidebar without loading every message body."""

    message_count = serializers.IntegerField(source="messages.count", read_only=True)

    class Meta:
        model = ChatConversation
        fields = ("id", "title", "scan_id", "message_count", "created_at", "updated_at")
        read_only_fields = fields


class ChatConversationDetailSerializer(ChatConversationSerializer):
    messages = ChatMessageSerializer(many=True, read_only=True)

    class Meta(ChatConversationSerializer.Meta):
        fields = (*ChatConversationSerializer.Meta.fields, "messages")
        read_only_fields = fields


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        # Prices go out in satang; formatting to baht is the client's job, and doing it here
        # would mean a float on the wire.
        fields = (
            "code", "name_th", "name_en", "description_th", "description_en",
            "price_satang", "interval", "features", "self_serve", "sort_order",
        )
        read_only_fields = fields


class OrderSerializer(serializers.ModelSerializer):
    plan = serializers.SlugRelatedField(slug_field="code", read_only=True)
    coupon = serializers.SlugRelatedField(slug_field="code", read_only=True)

    class Meta:
        model = Order
        fields = (
            "id", "plan", "coupon", "subtotal_satang", "discount_satang", "total_satang",
            "currency", "status", "provider", "created_at", "paid_at",
        )
        read_only_fields = fields
