from django.contrib import admin

from .models import ConsentEvent, FirebaseIdentity, Scan, Simulation


@admin.register(Scan)
class ScanAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "age_band", "status", "progress", "created_at", "expires_at")
    list_filter = ("age_band", "status")
    search_fields = ("id", "user__email")
    readonly_fields = tuple(field.name for field in Scan._meta.fields)


@admin.register(Simulation)
class SimulationAdmin(admin.ModelAdmin):
    list_display = ("id", "scan", "region", "status", "created_at", "expires_at")
    list_filter = ("region", "status")
    readonly_fields = tuple(field.name for field in Simulation._meta.fields)


admin.site.register(FirebaseIdentity)


@admin.register(ConsentEvent)
class ConsentEventAdmin(admin.ModelAdmin):
    list_display = ("user", "purpose", "policy_version", "accepted", "created_at")
    list_filter = ("purpose", "accepted")
    readonly_fields = tuple(field.name for field in ConsentEvent._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
