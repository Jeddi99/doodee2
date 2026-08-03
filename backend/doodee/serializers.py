from rest_framework import serializers

from .models import Scan, Simulation
from .storage import signed_url


class ScanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Scan
        fields = (
            "id", "status", "progress", "age_band", "analysis_data", "formula_version",
            "error_code", "error_message", "expires_at", "created_at",
        )
        read_only_fields = fields


class SimulationSerializer(serializers.ModelSerializer):
    before_url = serializers.SerializerMethodField()
    after_url = serializers.SerializerMethodField()

    class Meta:
        model = Simulation
        fields = (
            "id", "scan_id", "status", "progress", "region", "parameters", "model_version",
            "before_url", "after_url", "error_code", "error_message", "expires_at", "created_at",
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

