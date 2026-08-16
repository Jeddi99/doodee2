import csv
from datetime import timedelta

from django import forms
from django.contrib import admin, messages
from django.contrib.admin.models import LogEntry
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import UserChangeForm as DjangoUserChangeForm
from django.contrib.auth.models import Group, User
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Case, CharField, Count, Exists, OuterRef, Q, Subquery, Value, When
from django.http import HttpResponse
from django.utils import timezone

from .models import ConsentEvent, FirebaseIdentity, PromoCode, PromoRedemption, Scan, Simulation, SimulationPreviewUsage


MEMBERSHIP_GROUPS = ("pro_member", "clinic_partner")


class ConfirmingModelAdmin(admin.ModelAdmin):
    change_form_template = "admin/doodee/confirm_change_form.html"


def real_users(queryset):
    return queryset.filter(
        is_staff=False,
        firebase_identity__isnull=False,
    ).exclude(firebase_identity__firebase_uid="dev-guest-uid")


class UserChangeForm(DjangoUserChangeForm):
    membership = forms.ChoiceField(
        choices=(("free", "Free"), ("member", "Member"), ("clinic", "Clinic")),
        label="Permanent membership",
        help_text="Free removes only permanent membership. An active VIP promotion remains valid.",
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance.pk:
            groups = set(self.instance.groups.values_list("name", flat=True))
            self.fields["membership"].initial = (
                "clinic" if "clinic_partner" in groups else "member" if "pro_member" in groups else "free"
            )


class PlanFilter(admin.SimpleListFilter):
    title = "effective plan"
    parameter_name = "plan"

    def lookups(self, request, model_admin):
        return ((plan, plan.title()) for plan in ("free", "vip", "member", "clinic"))

    def queryset(self, request, queryset):
        return queryset.filter(_effective_plan=self.value()) if self.value() else queryset


class AccountTypeFilter(admin.SimpleListFilter):
    title = "account type"
    parameter_name = "account"

    def lookups(self, request, model_admin):
        return (("users", "Firebase users"), ("staff", "Staff"), ("superusers", "Superusers"))

    def queryset(self, request, queryset):
        if self.value() == "users":
            return real_users(queryset)
        if self.value() == "staff":
            return queryset.filter(is_staff=True, is_superuser=False)
        if self.value() == "superusers":
            return queryset.filter(is_superuser=True)
        return queryset


admin.site.unregister(User)


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    form = UserChangeForm
    change_form_template = "admin/doodee/confirm_change_form.html"
    change_user_password_template = "admin/doodee/user_change_password.html"
    change_list_template = "admin/auth/user/change_list.html"
    list_display = (
        "email", "firebase_uid", "account_type", "effective_plan", "vip_expires_at",
        "is_active", "date_joined", "last_login",
    )
    list_filter = (PlanFilter, AccountTypeFilter, "is_active")
    search_fields = ("email", "username", "firebase_identity__firebase_uid")
    ordering = ("-date_joined",)

    def has_module_permission(self, request):
        return request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_add_permission(self, request):
        return request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser

    def get_queryset(self, request):
        group_through = User.groups.through.objects.filter(user_id=OuterRef("pk"))
        active_vip = PromoRedemption.objects.filter(user_id=OuterRef("pk"), expires_at__gt=timezone.now())
        return super().get_queryset(request).select_related("firebase_identity").annotate(
            _is_clinic=Exists(group_through.filter(group__name="clinic_partner")),
            _is_member=Exists(group_through.filter(group__name="pro_member")),
            _is_vip=Exists(active_vip),
            _vip_expires_at=Subquery(active_vip.order_by("-expires_at").values("expires_at")[:1]),
        ).annotate(
            _effective_plan=Case(
                When(_is_clinic=True, then=Value("clinic")),
                When(_is_member=True, then=Value("member")),
                When(_is_vip=True, then=Value("vip")),
                default=Value("free"),
                output_field=CharField(),
            )
        )

    actions = ("deactivate_users", "reactivate_users", "grant_member", "revoke_membership", "export_csv")

    def _set_active(self, request, queryset, active):
        """Suspending a user is the account-level kill switch: FirebaseAuthentication rejects
        an inactive identity (authentication.py:50-51), so every API call stops immediately."""
        protected = queryset.filter(Q(is_staff=True) | Q(is_superuser=True))
        if protected.exists():
            self.message_user(
                request,
                f"ข้าม {protected.count()} บัญชี staff/superuser — ต้องแก้ทีละรายการ",
                level=messages.WARNING,
            )
        changed = queryset.exclude(Q(is_staff=True) | Q(is_superuser=True)).update(is_active=active)
        verb = "คืนสถานะ" if active else "ระงับ"
        self.message_user(request, f"{verb} {changed} บัญชีแล้ว")

    @admin.action(description="ระงับบัญชีที่เลือก")
    def deactivate_users(self, request, queryset):
        self._set_active(request, queryset, False)

    @admin.action(description="คืนสถานะบัญชีที่เลือก")
    def reactivate_users(self, request, queryset):
        self._set_active(request, queryset, True)

    @admin.action(description="ให้สิทธิ์ Member กับที่เลือก")
    def grant_member(self, request, queryset):
        group, _ = Group.objects.get_or_create(name="pro_member")
        for user in queryset:
            user.groups.add(group)
        self.message_user(request, f"ให้สิทธิ์ Member กับ {queryset.count()} บัญชีแล้ว")

    @admin.action(description="ถอนสิทธิ์ถาวรของที่เลือก (VIP ที่ยังไม่หมดอายุไม่กระทบ)")
    def revoke_membership(self, request, queryset):
        groups = Group.objects.filter(name__in=MEMBERSHIP_GROUPS)
        for user in queryset:
            user.groups.remove(*groups)
        self.message_user(request, f"ถอนสิทธิ์ถาวรของ {queryset.count()} บัญชีแล้ว")

    @admin.action(description="Export CSV")
    def export_csv(self, request, queryset):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="doodee-users.csv"'
        writer = csv.writer(response)
        writer.writerow(("id", "email", "firebase_uid", "plan", "vip_expires_at", "is_active", "date_joined"))
        for user in queryset:
            writer.writerow((
                user.id,
                user.email,
                getattr(getattr(user, "firebase_identity", None), "firebase_uid", ""),
                getattr(user, "_effective_plan", ""),
                getattr(user, "_vip_expires_at", "") or "",
                user.is_active,
                user.date_joined.isoformat(),
            ))
        return response

    def changelist_view(self, request, extra_context=None):
        counts = real_users(self.get_queryset(request)).aggregate(
            total=Count("pk"),
            free=Count("pk", filter=Q(_effective_plan="free")),
            vip=Count("pk", filter=Q(_effective_plan="vip")),
            member=Count("pk", filter=Q(_effective_plan="member")),
            clinic=Count("pk", filter=Q(_effective_plan="clinic")),
        )
        return super().changelist_view(request, {**(extra_context or {}), "plan_counts": counts})

    def get_fieldsets(self, request, obj=None):
        if obj and not obj.is_staff:
            return ((None, {"fields": (
                "username", "email", "firebase_uid", "account_type", "effective_plan", "vip_expires_at",
                "membership", "is_active", "date_joined", "last_login",
            )}),)
        fieldsets = list(super().get_fieldsets(request, obj))
        if obj:
            fieldsets.append(("Entitlement", {"fields": ("firebase_uid", "effective_plan", "vip_expires_at", "membership")}))
        return fieldsets

    def get_readonly_fields(self, request, obj=None):
        extra = ("firebase_uid", "account_type", "effective_plan", "vip_expires_at")
        if obj and not obj.is_staff:
            return extra + ("username", "email", "date_joined", "last_login")
        return tuple(super().get_readonly_fields(request, obj)) + extra

    @admin.display(description="Firebase UID")
    def firebase_uid(self, obj):
        identity = getattr(obj, "firebase_identity", None)
        return identity.firebase_uid if identity else "—"

    @admin.display(description="Account type")
    def account_type(self, obj):
        return "Admin" if obj.is_superuser else "Staff" if obj.is_staff else "Firebase" if getattr(obj, "firebase_identity", None) else "Django"

    @admin.display(ordering="_effective_plan", description="Plan")
    def effective_plan(self, obj):
        return obj._effective_plan.title()

    @admin.display(ordering="_vip_expires_at", description="VIP expires")
    def vip_expires_at(self, obj):
        return obj._vip_expires_at or "—"

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        if "membership" not in form.cleaned_data:
            return
        user = form.instance
        user.groups.remove(*Group.objects.filter(name__in=MEMBERSHIP_GROUPS))
        group_name = {"member": "pro_member", "clinic": "clinic_partner"}.get(form.cleaned_data["membership"])
        if group_name:
            user.groups.add(Group.objects.get_or_create(name=group_name)[0])

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        with transaction.atomic():
            return super().changeform_view(request, object_id, form_url, extra_context)

    def user_change_password(self, request, id, form_url=""):
        user = self.get_object(request, id)
        if not request.user.is_superuser or not user or not user.is_staff:
            raise PermissionDenied
        return super().user_change_password(request, id, form_url)


@admin.register(Scan)
class ScanAdmin(ConfirmingModelAdmin):
    list_display = ("id", "user", "age_band", "status", "progress", "created_at", "expires_at")
    list_filter = ("age_band", "status")
    search_fields = ("id", "user__email")
    readonly_fields = tuple(field.name for field in Scan._meta.fields)


@admin.register(Simulation)
class SimulationAdmin(ConfirmingModelAdmin):
    list_display = ("id", "scan", "region", "status", "created_at", "expires_at")
    list_filter = ("region", "status")
    readonly_fields = tuple(field.name for field in Simulation._meta.fields)


@admin.register(PromoCode)
class PromoCodeAdmin(ConfirmingModelAdmin):
    change_list_template = "admin/doodee/promocode/change_list.html"
    list_display = ("code", "days", "is_active", "redemption_count", "note", "created_at")
    list_filter = ("is_active",)
    search_fields = ("code", "note")
    list_editable = ("is_active",)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_redemptions=Count("redemptions"))

    @admin.display(ordering="_redemptions", description="Redemptions")
    def redemption_count(self, obj):
        return obj._redemptions


@admin.register(PromoRedemption)
class PromoRedemptionAdmin(ConfirmingModelAdmin):
    list_display = ("user", "promo_code", "redeemed_at", "expires_at")
    list_filter = ("promo_code",)
    search_fields = ("user__email", "user__username", "promo_code__code")
    readonly_fields = tuple(field.name for field in PromoRedemption._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(FirebaseIdentity, ConfirmingModelAdmin)
admin.site.register(SimulationPreviewUsage, ConfirmingModelAdmin)


@admin.register(ConsentEvent)
class ConsentEventAdmin(ConfirmingModelAdmin):
    list_display = ("user", "purpose", "policy_version", "accepted", "created_at")
    list_filter = ("purpose", "accepted")
    search_fields = ("user__email", "user__username", "policy_version")
    readonly_fields = tuple(field.name for field in ConsentEvent._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        """A consent record is legal evidence of what the user agreed to and when. Every field
        was already read-only, so the change form could not alter anything — this closes the
        remaining gap, where saving it still wrote a misleading "changed" entry to the log."""
        return False


@admin.register(LogEntry)
class LogEntryAdmin(admin.ModelAdmin):
    """Django writes one row here for every admin add/change/delete, and has done since the
    first migrate — it simply was not registered, so nobody could read it. Exposing it
    read-only turns an existing table into the audit trail with no new writes."""

    list_display = ("action_time", "user", "content_type", "object_repr", "action_label", "change_message")
    list_filter = ("action_flag", "content_type", "user")
    search_fields = ("object_repr", "change_message", "user__username", "user__email")
    date_hierarchy = "action_time"
    readonly_fields = tuple(field.name for field in LogEntry._meta.fields)

    ACTIONS = {1: "เพิ่ม", 2: "แก้ไข", 3: "ลบ"}

    @admin.display(ordering="action_flag", description="การกระทำ")
    def action_label(self, obj):
        return self.ACTIONS.get(obj.action_flag, obj.action_flag)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        """Deleting the audit trail from inside the audited surface defeats it."""
        return False

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser
