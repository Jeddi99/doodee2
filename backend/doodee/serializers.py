from rest_framework import serializers

from .models import Scan, Simulation
from .storage import signed_url


class ScanSerializer(serializers.ModelSerializer):
    analysis_tier = serializers.SerializerMethodField()
    missing_optional_views = serializers.SerializerMethodField()
    front_url = serializers.SerializerMethodField()
    has_profile_images = serializers.SerializerMethodField()

    class Meta:
        model = Scan
        fields = (
            "id", "status", "progress", "age_band", "reference_age_band", "reference_profile", "reference_population",
            "scan_mode", "analysis_data", "formula_version",
            "analysis_tier", "missing_optional_views", "front_url", "has_profile_images",
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

    def get_front_url(self, obj):
        object_name = (obj.image_objects or {}).get("front")
        if obj.status != Scan.Status.COMPLETED or not object_name:
            return None
        try:
            return signed_url(object_name)
        except Exception:
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
