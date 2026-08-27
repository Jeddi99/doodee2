import csv
import os
from datetime import timedelta

from django import forms
from django.contrib import admin, messages
from django.contrib.admin.models import CHANGE, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import UserChangeForm as DjangoUserChangeForm
from django.contrib.auth.models import Group, User
from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Case, CharField, Count, Exists, OuterRef, Q, Subquery, Sum, Value, When
from django.http import HttpResponse
from django.template.response import TemplateResponse
from django.utils import timezone

from .models import (
    ChatConversation, ChatMessage, ChatRole, ChatSetting, ChatTopic, ChatUsage, ConsentEvent, Coupon,
    CouponGrant, CouponRedemption, CreditLedger, DailyActive, FirebaseIdentity, Notification,
    Order, PayoutAccount, Plan, PromoCode, PromoRedemption, PushToken, Referral, ReferralCode,
    Scan, Simulation, SimulationPreviewUsage, SiteSetting, Subscription, UserAttribution, Visit,
    WithdrawalRequest,
)
from . import payout
from .billing import activate, claw_back


# Every group that stands for paid access. `plus_member` joined when the ฟรี/พลัส/โปร tiers
# replaced the single `member` plan; `revoke_membership` reads this list, and a group missing from
# it is a group the revoke action silently leaves behind.
MEMBERSHIP_GROUPS = ("plus_member", "pro_member", "clinic_partner")


class ConfirmingModelAdmin(admin.ModelAdmin):
    change_form_template = "admin/doodee/confirm_change_form.html"


class ExportCsvMixin:
    """A "download as CSV" action for any changelist.

    Pulled out of UserAdmin, which was the only model that had one — work.md asks for coupon
    usage history to be exportable, and an export that only covers accounts cannot answer a
    question about a discount campaign.

    Columns come from `csv_fields`, or from `list_display` when that is not set, so a new column
    on a changelist appears in its export without a second edit. Callables are rendered through
    the admin's own display method, which is what makes `฿149.00` come out as `฿149.00` rather
    than `14900`.
    """

    csv_fields = ()
    csv_filename = "doodee-export.csv"

    def _csv_value(self, obj, field):
        display = getattr(self, field, None)
        if callable(display):
            return display(obj)
        value = getattr(obj, field, "")
        return "" if value is None else value

    @admin.action(description="ดาวน์โหลดเป็นไฟล์ CSV")
    def export_csv(self, request, queryset):
        fields = self.csv_fields or tuple(self.list_display)
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{self.csv_filename}"'
        # Excel opens a UTF-8 file as mojibake without a BOM, and every label in this admin is
        # Thai. The export exists to be opened, not to be technically correct.
        response.write("﻿")
        writer = csv.writer(response)
        writer.writerow(fields)
        for obj in queryset:
            writer.writerow([self._csv_value(obj, field) for field in fields])
        return response


def person(user):
    """How a person should read in a list: their email.

    `User.__str__` is the username, and every account here is created by
    `FirebaseAuthentication` as `firebase:<uid>` — so a plain `user` column renders a 36-character
    opaque identifier. On the payout queue that is the column an operator reads before sending
    somebody money, which makes it the wrong thing to be unreadable.

    Falls back to the username, because an account genuinely can have no email (Firebase phone
    sign-in), and an empty cell would be worse than the uid.
    """
    if not user:
        return "—"
    return user.email or user.get_username()


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

    @admin.action(description="ดาวน์โหลดเป็นไฟล์ CSV")
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

    @admin.display(description="รหัสผู้ใช้ Firebase")
    def firebase_uid(self, obj):
        identity = getattr(obj, "firebase_identity", None)
        return identity.firebase_uid if identity else "—"

    @admin.display(description="ประเภทบัญชี")
    def account_type(self, obj):
        return "Admin" if obj.is_superuser else "Staff" if obj.is_staff else "Firebase" if getattr(obj, "firebase_identity", None) else "Django"

    @admin.display(ordering="_effective_plan", description="แผนที่ใช้อยู่")
    def effective_plan(self, obj):
        return obj._effective_plan.title()

    @admin.display(ordering="_vip_expires_at", description="VIP หมดอายุ")
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
    list_display = ("id", "user", "age_band", "status", "progress", "is_demo", "created_at", "expires_at")
    # is_demo is a filter because sample scans otherwise sit in the same list as real ones and
    # quietly inflate every count read off this page.
    list_filter = ("age_band", "status", "is_demo")
    search_fields = ("id", "user__email")
    readonly_fields = tuple(field.name for field in Scan._meta.fields)
    actions = ("delete_demo_scans",)

    @admin.action(description="ลบข้อมูลสแกนตัวอย่างที่เลือก")
    def delete_demo_scans(self, request, queryset):
        """Sample scans only. Real scans hold biometric data and are deleted through the
        retention path (request_scan_deletion), which also removes the stored images —
        a bulk delete here would orphan them in Supabase."""
        removed, _ = queryset.filter(is_demo=True).delete()
        kept = queryset.exclude(is_demo=True).count()
        self.message_user(request, f"{removed} sample scan(s) deleted.", messages.SUCCESS)
        if kept:
            self.message_user(
                request,
                f"{kept} real scan(s) were left alone — delete those from the account page so "
                "their images are removed too.",
                messages.WARNING,
            )


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

    @admin.display(ordering="_redemptions", description="ถูกใช้ไปแล้ว (ครั้ง)")
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


# LogEntry belongs to django.contrib.admin, so its name cannot be set on the model the way
# every DOODEE model sets its own. Renamed here rather than behind a proxy model: a proxy
# would mint a second set of permission rows and a migration, all to change one label.
# Display only — no field, table or permission is affected.
LogEntry._meta.verbose_name = "บันทึกการแก้ไข"
LogEntry._meta.verbose_name_plural = "บันทึกการแก้ไข"


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


class ChatMessageInline(admin.TabularInline):
    """Read-only: a conversation is a record of what was said, not something to edit.

    Editing an assistant turn here would rewrite history the user saw, and editing a user turn
    would put words in their mouth — neither has a legitimate operational use.
    """

    model = ChatMessage
    extra = 0
    can_delete = False
    fields = ("role", "content", "input_tokens", "cached_input_tokens", "output_tokens", "created_at")
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(ChatConversation)
class ChatConversationAdmin(ConfirmingModelAdmin):
    list_display = ("id", "user", "title", "scan", "turns", "tokens_out", "created_at", "updated_at")
    search_fields = ("id", "title", "user__email")
    readonly_fields = tuple(field.name for field in ChatConversation._meta.fields)
    inlines = (ChatMessageInline,)

    def get_queryset(self, request):
        # Annotated rather than counted per row: the plain list_display version is one query
        # per conversation, which is what makes admin list pages slow at a few thousand rows.
        return super().get_queryset(request).annotate(
            _turns=Count("messages"),
            _tokens_out=Sum("messages__output_tokens"),
        )

    @admin.display(ordering="_turns", description="จำนวนข้อความ")
    def turns(self, obj):
        return obj._turns

    @admin.display(ordering="_tokens_out", description="โทเค็นขาออก")
    def tokens_out(self, obj):
        return obj._tokens_out or 0

    def has_add_permission(self, request):
        return False


@admin.register(ChatUsage)
class ChatUsageAdmin(admin.ModelAdmin):
    """Editable on purpose, unlike the conversation log.

    Support needs a way to hand a turn back when a reply was unusable — the alternative is a
    shell, and every edit through here lands in the LogEntry audit trail.
    """

    list_display = ("user", "period", "count")
    list_filter = ("period",)
    search_fields = ("user__email",)
    autocomplete_fields = ("user",)


@admin.register(ChatSetting)
class ChatSettingAdmin(ConfirmingModelAdmin):
    """One row, edited in place. Add and delete are off so there is exactly one answer to
    "what is the chat doing right now"."""

    fieldsets = (
        ("สถานะตอนนี้", {"fields": ("status",)}),
        ("บุคลิกของ AI", {
            "fields": ("persona",),
            "description": (
                "<strong>กฎความปลอดภัยแก้จากตรงนี้ไม่ได้</strong> — ระบบต่อท้ายทุกครั้งที่ตอบ: "
                "ห้ามตัดสินว่าสวยหรือไม่สวย · ไม่ใช่คำวินิจฉัยทางการแพทย์ · ห้ามรับประกันผลหัตถการ · "
                "อ้างได้เฉพาะตัวเลขที่วัดจริง และกฎเหล่านี้มีผลเหนือข้อความที่เขียนด้านล่างเสมอ"
            ),
        }),
        ("โมเดลและค่าใช้จ่าย", {
            "fields": ("provider", "model", "base_url", "effort", "max_tokens"),
            "description": (
                "ยิ่งโมเดลใหญ่ ระดับการคิดสูง และคำตอบยาว ค่าใช้จ่ายต่อคำถามยิ่งสูง · "
                "<strong>คีย์ไม่ได้เก็บที่นี่</strong> ใส่ใน <code>.env</code> แล้ว restart: "
                "Anthropic ใช้ <code>ANTHROPIC_API_KEY</code> · เจ้าอื่นใช้ <code>CHAT_API_KEY</code> · "
                "<strong>OpenAI-compatible มีไว้ทดสอบ</strong> ไม่มี prompt caching (รายงานค่าใช้จ่ายจะขึ้นแคช 0) "
                "และโมเดลฟรีตัวเล็กทำตามกฎความปลอดภัยได้ไม่แน่นอนเท่า Claude — ไม่ควรเปิดให้ผู้ใช้จริง"
            ),
        }),
        # โควตาแชทย้ายไปอยู่ที่ “แผน” แล้ว (ช่อง “แชทได้ (ข้อความ/เดือน)” ของแต่ละแผน)
        # เพราะแพคเกจมีสามระดับ แต่ที่นี่เก็บได้แค่สองตัวเลข
        ("ระบบ", {"fields": ("updated_at",)}),
    )
    readonly_fields = ("status", "updated_at")

    @admin.display(description="แชทพิมพ์เอง")
    def status(self, obj):
        """Why free-text chat is on or off, in words an operator can act on.

        The verdict comes from `chat.chat_enabled()` rather than being re-derived here — two
        copies of this condition would disagree the first time either changed, and the whole
        point of this field is to be trusted. Only the explanation is written here.
        """
        from django.conf import settings as django_settings
        from django.utils.html import format_html

        from .chat import chat_enabled

        anthropic_key = bool(os.getenv("ANTHROPIC_API_KEY"))
        chat_key = bool(os.getenv("CHAT_API_KEY"))
        openai = obj.provider == ChatSetting.Provider.OPENAI

        if chat_enabled():
            where = obj.base_url if openai else "Anthropic"
            return format_html(
                '<strong style="color:var(--object-tools-bg,#417690)">พร้อมใช้งาน</strong> · {} · {}',
                where, obj.model,
            )

        if not django_settings.CHAT_ENABLED:
            reason = "ปิดจากไฟล์ .env (CHAT_ENABLED=false) — ปุ่มคำถามสำเร็จรูปยังใช้ได้ตามปกติ"
        elif openai:
            reason = "เลือก OpenAI-compatible แล้วแต่ยังไม่ได้ใส่ “ที่อยู่ API” ด้านล่าง"
        elif chat_key:
            # The exact trap that cost a real afternoon: the key is there, on the other setting.
            reason = ("เลือก Anthropic แต่ไม่มี ANTHROPIC_API_KEY ใน .env — "
                      "คุณมี CHAT_API_KEY อยู่แล้ว ถ้าจะใช้ Groq หรือ OpenRouter "
                      "ให้เปลี่ยน “ผู้ให้บริการ” ด้านล่างเป็น OpenAI-compatible แล้วใส่ที่อยู่ API")
        else:
            reason = "เลือก Anthropic แต่ไม่มี ANTHROPIC_API_KEY ใน .env (ใส่แล้วต้อง restart)"

        return format_html(
            '<strong style="color:var(--error-fg,#ba2121)">ปิดอยู่</strong> — {}<br>'
            '<span style="color:var(--body-quiet-color)">ANTHROPIC_API_KEY: {} · CHAT_API_KEY: {}</span>',
            reason, "มี" if anthropic_key else "ไม่มี", "มี" if chat_key else "ไม่มี",
        )

    def has_add_permission(self, request):
        return ChatSetting.objects.count() == 0

    def has_delete_permission(self, request, obj=None):
        """Deleting it would silently reset the chat to the values compiled into the code."""
        return False


@admin.register(ChatRole)
class ChatRoleAdmin(ConfirmingModelAdmin):
    """Voices the user picks between. Wording only — never capability.

    `key` is read-only and rows cannot be added or removed: each key is what gets stored on
    every conversation that used it, so inventing or deleting one would leave existing threads
    pointing at a voice that no longer exists.
    """

    list_display = ("label_th", "label_en", "key", "is_default", "is_active", "sort_order")
    list_editable = ("is_default", "is_active", "sort_order")
    list_filter = ("is_active",)
    readonly_fields = ("key",)
    fieldsets = (
        ("ชื่อที่ผู้ใช้เห็น", {"fields": ("key", "label_th", "label_en", "description_th", "description_en")}),
        ("น้ำเสียง", {
            "fields": ("persona",),
            "description": (
                "<strong>เขียนได้แค่ว่าพูดยังไง ไม่ใช่พูดอะไรได้</strong> — ระบบต่อกฎท้ายทุกครั้งและลบไม่ได้: "
                "ห้ามตัดสินว่าสวยหรือไม่สวย · ไม่ใช่คำวินิจฉัยทางการแพทย์ · ห้ามรับประกันผล · "
                "<strong>มุกตลกต้องเล่นกับตัวเลขหรือสถานการณ์ ห้ามเล่นกับหน้าของผู้ใช้</strong> · "
                "ห้ามอ้างตัวเลขว่าทำอะไรแล้วคะแนนจะขึ้นเท่าไร เพราะระบบไม่เคยคำนวณตัวเลขนั้น"
            ),
        }),
        ("การแสดงผล", {"fields": ("is_default", "is_active", "sort_order")}),
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ChatTopic)
class ChatTopicAdmin(ConfirmingModelAdmin):
    """Wording, order and visibility only.

    `key` is read-only and rows cannot be added or removed because each one is bound to a
    formula in chat_facts.py — a row with no formula behind it would be a button that answers
    nothing, and deleting a row would take the working button away with it.
    """

    list_display = ("label_th", "label_en", "key", "is_active", "sort_order")
    list_editable = ("is_active", "sort_order")
    list_filter = ("is_active",)
    readonly_fields = ("key",)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


def satang(value):
    """฿ from satang. Display only — nothing in the database is ever a decimal."""
    return f"฿{value / 100:,.2f}"


@admin.register(Plan)
class PlanAdmin(ConfirmingModelAdmin):
    list_display = (
        "code", "name_th", "price", "interval", "previews", "chat_turns", "analysis_depth",
        "has_development_plan", "grants_group", "self_serve", "is_active", "sort_order",
    )
    list_filter = ("interval", "is_active", "self_serve", "analysis_depth", "has_development_plan")
    search_fields = ("code", "name_en", "name_th")
    list_editable = ("is_active", "sort_order")

    @admin.display(ordering="simulation_previews_per_month", description="จำลอง/เดือน")
    def previews(self, obj):
        return "ไม่จำกัด" if obj.simulation_previews_per_month == Plan.UNLIMITED else obj.simulation_previews_per_month

    @admin.display(ordering="chat_turns_per_month", description="แชท/เดือน")
    def chat_turns(self, obj):
        return "ไม่จำกัด" if obj.chat_turns_per_month == Plan.UNLIMITED else obj.chat_turns_per_month

    @admin.display(ordering="price_satang", description="ราคา")
    def price(self, obj):
        return satang(obj.price_satang)

    def has_delete_permission(self, request, obj=None):
        """Deactivate, never delete.

        Orders PROTECT their plan, so deleting a sold tier fails anyway — and a plan removed
        from the database takes the price history of every past order with it.
        """
        return False


@admin.register(Coupon)
class CouponAdmin(ExportCsvMixin, ConfirmingModelAdmin):
    list_display = ("code", "discount", "uses", "once_per_user", "requires_grant", "valid_from", "valid_until", "is_active")
    list_filter = ("discount_type", "is_active", "once_per_user", "requires_grant")
    search_fields = ("code", "note")
    list_editable = ("is_active",)
    filter_horizontal = ("applies_to_plans",)
    readonly_fields = ("used_count", "created_at")
    actions = ("export_csv",)
    csv_filename = "doodee-coupons.csv"

    @admin.display(description="ส่วนลด")
    def discount(self, obj):
        if obj.discount_type == Coupon.DiscountType.PERCENT:
            capped = f" (ไม่เกิน {satang(obj.max_discount_satang)})" if obj.max_discount_satang else ""
            return f"{obj.discount_value}%{capped}"
        return satang(obj.discount_value)

    @admin.display(description="ใช้ไป / จำกัด")
    def uses(self, obj):
        return f"{obj.used_count} / {obj.max_uses or '∞'}"

    def save_model(self, request, obj, form, change):
        # Codes are compared uppercase everywhere, so a lowercase one created here would
        # simply never match — fail into the working shape rather than out of it.
        obj.code = obj.code.strip().upper()
        super().save_model(request, obj, form, change)


@admin.register(Order)
class OrderAdmin(ExportCsvMixin, ConfirmingModelAdmin):
    """Where a bank transfer becomes entitlement, until a payment provider exists.

    `mark_paid` is the only way to grant a paid plan through money right now, and it runs the
    same `billing.activate()` a provider webhook will call — so the grant, the coupon count and
    the subscription period are identical either way, and both are idempotent.
    """

    list_display = ("id", "user", "plan", "total", "discount", "credit_used", "coupon", "status", "provider", "created_at", "paid_at")
    list_filter = ("status", "provider", "plan")
    search_fields = ("id", "user__email", "provider_charge_id", "coupon__code")
    autocomplete_fields = ("user",)
    readonly_fields = (
        "subtotal_satang", "discount_satang", "credit_satang", "total_satang", "coupon",
        "provider_charge_id", "created_at", "paid_at",
    )
    actions = ("mark_paid", "mark_cancelled", "export_csv")
    csv_filename = "doodee-orders.csv"

    @admin.display(ordering="credit_satang", description="ใช้เครดิต")
    def credit_used(self, obj):
        return satang(obj.credit_satang) if obj.credit_satang else "—"

    @admin.display(ordering="total_satang", description="ยอดที่ต้องจ่าย")
    def total(self, obj):
        return satang(obj.total_satang)

    @admin.display(ordering="discount_satang", description="ส่วนลด")
    def discount(self, obj):
        return satang(obj.discount_satang) if obj.discount_satang else "—"

    def has_add_permission(self, request):
        """Orders come from checkout, not from admin.

        One typed in here would have a price nobody was quoted and no payment behind it.
        """
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.action(description="ยืนยันว่าได้รับเงินแล้ว และเปิดสิทธิ์ให้ผู้ใช้")
    def mark_paid(self, request, queryset):
        if not request.user.is_superuser:
            # This hands out paid entitlement. Staff who can edit users should not also be
            # able to grant it silently through a bulk action.
            raise PermissionDenied
        granted = 0
        skipped = 0
        for order in queryset:
            if order.status == Order.Status.PAID:
                skipped += 1
                continue
            activate(order)
            granted += 1
        if granted:
            self.message_user(request, f"{granted} order(s) confirmed and entitlement granted.", messages.SUCCESS)
        if skipped:
            self.message_user(request, f"{skipped} order(s) were already paid and were left alone.", messages.WARNING)

    @admin.action(description="ยกเลิกคำสั่งซื้อที่ยังไม่จ่าย")
    def mark_cancelled(self, request, queryset):
        # Paid orders are excluded rather than refused: cancelling one would strip the record
        # behind a subscription that is still running. Refunds are a provider operation.
        updated = queryset.exclude(status=Order.Status.PAID).update(status=Order.Status.CANCELLED)
        self.message_user(request, f"{updated} unpaid order(s) cancelled.", messages.SUCCESS)


@admin.register(Subscription)
class SubscriptionAdmin(ConfirmingModelAdmin):
    list_display = ("user", "plan", "status", "current_period_end", "order", "created_at")
    list_filter = ("status", "plan")
    search_fields = ("user__email",)
    autocomplete_fields = ("user",)
    readonly_fields = ("order", "created_at")


@admin.register(CouponRedemption)
class CouponRedemptionAdmin(ExportCsvMixin, ConfirmingModelAdmin):
    """The usage history work.md §1.2 asks to be exportable: who, when, which order, how much."""

    list_display = ("user", "coupon", "order", "discount_given", "redeemed_at")
    list_filter = ("coupon",)
    search_fields = ("user__email", "coupon__code")
    readonly_fields = tuple(field.name for field in CouponRedemption._meta.fields)
    actions = ("export_csv",)
    csv_filename = "doodee-coupon-usage.csv"

    @admin.display(description="ส่วนลดที่ได้")
    def discount_given(self, obj):
        return satang(obj.order.discount_satang) if obj.order_id else "—"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(SiteSetting)
class SiteSettingAdmin(ConfirmingModelAdmin):
    """The numbers a business decision can change, on one page, without a deploy.

    Everything here used to be a constant in `settings.py` (and one literal in `views.py`).
    Plan prices and quotas are deliberately NOT here — those differ per tier and belong on แผน,
    which is one row per tier rather than the single row this model holds.
    """

    fieldsets = (
        ("ชวนเพื่อน", {
            "fields": (
                "referral_enabled", "reward_satang", "max_qualified_per_month",
                "claim_window_hours", "require_verified_email",
            ),
            "description": (
                "รางวัลจ่ายเมื่อเพื่อนที่ถูกชวน <strong>จ่ายเงินครั้งแรก</strong> ไม่ใช่ตอนสมัคร — "
                "ถ้าจ่ายตอนสมัคร การสร้างอีเมลทิ้งๆ จะกลายเป็นอาชีพ · "
                "<strong>ส่วนลดของเพื่อนที่ถูกชวนแก้ที่คูปอง</strong> "
                '<a href="/admin/doodee/coupon/?q=FRIEND10">FRIEND10</a> '
                "เพราะต้องเป็นคูปองจริงระบบส่วนลดถึงจะคิดให้ได้"
            ),
        }),
        ("การถอนเงิน", {
            "fields": ("withdrawal_enabled", "withdrawal_min_satang", "withdrawal_hold_days"),
            "description": (
                "เครดิตที่ค้างอยู่ในระบบคือ<strong>เงินที่ต้องจ่ายจริง</strong> ดูยอดรวมได้ที่ "
                '<a href="/admin/reports/">หน้ารายงาน</a>'
            ),
        }),
        ("สมาชิก", {"fields": ("subscription_grace_days",)}),
        ("เพดานกันการใช้งานผิดปกติ", {
            "fields": ("chat_hourly_ceiling", "preview_hourly_ceiling"),
            "description": (
                "ไม่ใช่โควตาของแผน — โควตาอยู่ที่ <a href=\"/admin/doodee/plan/\">แผน</a> · "
                "ตัวเลขสองตัวนี้จำกัดว่าหนึ่งบัญชีใช้ได้เท่าไรใน<strong>หนึ่งชั่วโมง</strong> "
                "มีไว้กันบัญชีถูกยึดแล้วยิงจนงบหมด ใช้กับทุกแผนรวมถึงแผนที่ขายว่าไม่จำกัด"
            ),
        }),
        ("ระบบ", {"fields": ("updated_at",)}),
    )
    readonly_fields = ("updated_at",)

    def has_add_permission(self, request):
        """One row, always. `current()` creates it; "add another" would make a dead second row."""
        return not SiteSetting.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        """Straight into the one row — a list page for a single row is a wasted click."""
        from django.shortcuts import redirect

        return redirect("admin:doodee_sitesetting_change", SiteSetting.current().pk)


@admin.register(Referral)
class ReferralAdmin(ExportCsvMixin, ConfirmingModelAdmin):
    """Who invited whom, and whether it was paid.

    The two actions here are the whole human part of the referral system. Everything else
    decides itself; a referral in "พักไว้ให้ตรวจสอบ" is waiting on somebody in this screen,
    and money never moves without one of these buttons being pressed.
    """

    list_display = ("who_invited", "who_joined", "code", "status", "reward", "qualifying_order", "created_at", "qualified_at")
    list_filter = ("status",)
    search_fields = ("code", "inviter__email", "invitee__email")
    autocomplete_fields = ("inviter", "invitee")
    readonly_fields = (
        "inviter", "invitee", "code", "qualifying_order", "signup_ip_hash", "created_at",
        "qualified_at",
    )
    actions = ("approve_held", "reject", "claw_back_reward", "export_csv")
    csv_filename = "doodee-referrals.csv"

    @admin.display(ordering="inviter__email", description="ผู้ชวน")
    def who_invited(self, obj):
        return person(obj.inviter)

    @admin.display(ordering="invitee__email", description="เพื่อนที่ถูกชวน")
    def who_joined(self, obj):
        return person(obj.invitee)

    @admin.display(description="รางวัลที่จ่าย")
    def reward(self, obj):
        paid = sum(entry.amount_satang for entry in obj.credit_entries.all())
        return satang(paid) if paid else "—"

    def has_add_permission(self, request):
        """A referral is a record of something that happened, not something to type in."""
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.action(description="อนุมัติรายการที่พักไว้ และจ่ายรางวัล")
    def approve_held(self, request, queryset):
        if not request.user.is_superuser:
            # This moves money. Staff who can read the screen should not also be able to pay
            # from it, for the same reason `mark_paid` is superuser-only.
            raise PermissionDenied
        reward = SiteSetting.current().reward_satang
        paid = 0
        for referral in queryset.filter(status=Referral.Status.HELD):
            with transaction.atomic():
                referral.status = Referral.Status.QUALIFIED
                referral.qualified_at = timezone.now()
                referral.signup_ip_hash = ""
                referral.save(update_fields=("status", "qualified_at", "signup_ip_hash"))
                CreditLedger.objects.create(
                    user=referral.inviter,
                    amount_satang=reward,
                    kind=CreditLedger.Kind.REFERRAL_REWARD,
                    referral=referral,
                    note=f"อนุมัติโดย {request.user.get_username()}",
                )
            paid += 1
        self.message_user(request, f"อนุมัติและจ่ายรางวัล {paid} รายการ", messages.SUCCESS)

    @admin.action(description="ไม่อนุมัติ (ไม่จ่ายรางวัล)")
    def reject(self, request, queryset):
        updated = queryset.exclude(status=Referral.Status.QUALIFIED).update(
            status=Referral.Status.REJECTED
        )
        # Qualified rows are excluded rather than refused: the reward has already been paid, so
        # the operation that undoes it is a clawback, which writes the reversing ledger row.
        self.message_user(
            request, f"ไม่อนุมัติ {updated} รายการ · รายการที่จ่ายรางวัลไปแล้วให้ใช้ “เรียกคืนรางวัล”", messages.SUCCESS,
        )

    @admin.action(description="เรียกคืนรางวัลที่จ่ายไปแล้ว")
    def claw_back_reward(self, request, queryset):
        if not request.user.is_superuser:
            raise PermissionDenied
        reversed_count = 0
        for referral in queryset.filter(status=Referral.Status.QUALIFIED):
            if claw_back(referral, note=f"เรียกคืนโดย {request.user.get_username()}"):
                reversed_count += 1
        self.message_user(
            request,
            f"เรียกคืน {reversed_count} รายการ · รายการเดิมยังอยู่ในบัญชีเครดิต ระบบบันทึกเป็นแถวติดลบใหม่",
            messages.SUCCESS,
        )


def _audit(request, obj, message):
    """Write a LogEntry for something that is not a model edit.

    Reading a customer's bank number changes nothing and so leaves no trace of its own. Django
    has kept an audit table since the first migrate and `LogEntryAdmin` already exposes it
    read-only, so recording the read there puts it in the one place an operator already looks.
    """
    LogEntry.objects.log_action(
        user_id=request.user.pk,
        content_type_id=ContentType.objects.get_for_model(obj).pk,
        object_id=obj.pk,
        object_repr=str(obj),
        action_flag=CHANGE,
        change_message=message,
    )


@admin.register(PayoutAccount)
class PayoutAccountAdmin(admin.ModelAdmin):
    """The only table in the product holding customer bank details.

    Superuser-only, masked by default, and reading a full number is an explicit action that
    writes an audit row naming who read it. Four digits are enough for support to confirm they
    are looking at the right account; the rest is nobody's business until a transfer is due.
    """

    list_display = ("who", "method", "bank", "account_name", "masked", "updated_at")
    list_filter = ("method", "bank")
    search_fields = ("user__email", "account_name", "number_last4")
    autocomplete_fields = ("user",)
    readonly_fields = ("user", "method", "bank", "account_name", "masked", "created_at", "updated_at")
    exclude = ("number_encrypted", "number_last4")
    actions = ("reveal_account_number",)

    @admin.display(ordering="user__email", description="ผู้ใช้")
    def who(self, obj):
        return person(obj.user)

    @admin.display(description="เลขบัญชี")
    def masked(self, obj):
        return obj.masked

    def has_module_permission(self, request):
        return request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_add_permission(self, request):
        """The user enters their own. One typed here would be somebody guessing at it."""
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @admin.action(description="ดูเลขบัญชีเต็ม (ระบบบันทึกว่าใครกดดู)")
    def reveal_account_number(self, request, queryset):
        if not request.user.is_superuser:
            raise PermissionDenied
        for account in queryset:
            try:
                number = payout.decrypt_number(account)
            except payout.PayoutError:
                self.message_user(
                    request, "ยังไม่ได้ตั้งคีย์ถอดรหัส (PAYOUT_ENCRYPTION_KEY)", messages.ERROR,
                )
                return
            except Exception:
                # A row encrypted with a key that has since been rotated. Say so rather than
                # showing a stack trace to somebody who is trying to pay a customer.
                self.message_user(
                    request, f"ถอดรหัสบัญชีของ {account.user} ไม่ได้ — คีย์อาจถูกเปลี่ยน", messages.ERROR,
                )
                continue
            _audit(request, account, f"ดูเลขบัญชีเต็มของ {person(account.user)}")
            self.message_user(
                request,
                f"{person(account.user)} · {account.get_method_display()} {account.bank} · "
                f"{number} · {account.account_name}",
                messages.WARNING,
            )


@admin.register(WithdrawalRequest)
class WithdrawalRequestAdmin(ExportCsvMixin, ConfirmingModelAdmin):
    """The payout queue: people waiting for their money.

    The credit already left their balance when they asked (see `payout.request_withdrawal`), so
    every row here is either going to be paid or refunded — there is no third outcome, and one
    left sitting is somebody's money in limbo.

    All three actions are superuser-only, for the same reason `mark_paid` on orders is: reading
    the queue and sending money are different permissions.
    """

    list_display = (
        "id", "who", "amount", "status", "to_account", "reference", "created_at", "paid_at",
    )
    list_filter = ("status",)
    search_fields = ("user__email", "reference", "id")
    autocomplete_fields = ("user",)
    readonly_fields = (
        "user", "amount_satang", "destination_detail", "created_at", "paid_at", "reviewed_by",
        "reviewed_at",
    )
    exclude = ("destination",)
    actions = ("approve_selected", "mark_paid_selected", "reject_selected", "export_csv")
    csv_filename = "doodee-withdrawals.csv"

    @admin.display(ordering="user__email", description="ผู้ถอน")
    def who(self, obj):
        return person(obj.user)

    @admin.display(ordering="amount_satang", description="จำนวน")
    def amount(self, obj):
        return satang(obj.amount_satang)

    # NOT named `destination`: `list_display` resolves a model field before a method of the same
    # name, so the JSONField won and the changelist rendered the whole snapshot — ciphertext
    # included — instead of `••••0000`. The CSV export reads `list_display` too, so it went in
    # there as well.
    @admin.display(description="ปลายทาง")
    def to_account(self, obj):
        return obj.masked_destination

    @admin.display(description="ปลายทาง (ตอนที่ขอถอน)")
    def destination_detail(self, obj):
        data = obj.destination or {}
        return (
            f"{data.get('bank_label') or 'พร้อมเพย์'} · ••••{data.get('number_last4', '')} · "
            f"{data.get('account_name', '')}"
        )

    def has_add_permission(self, request):
        """Requests come from users. One created here would deduct nothing and pay somebody."""
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def _require_superuser(self, request):
        if not request.user.is_superuser:
            raise PermissionDenied

    @admin.action(description="อนุมัติ (ยังไม่ได้โอน)")
    def approve_selected(self, request, queryset):
        self._require_superuser(request)
        done = 0
        for withdrawal in queryset:
            try:
                payout.approve(withdrawal, by=request.user)
            except payout.PayoutError:
                continue
            done += 1
        self.message_user(
            request, f"อนุมัติ {done} รายการ · โอนเงินแล้วอย่าลืมกลับมากด “บันทึกว่าโอนแล้ว”",
            messages.SUCCESS,
        )

    @admin.action(description="บันทึกว่าโอนแล้ว")
    def mark_paid_selected(self, request, queryset):
        """Opens a page with one reference box per payout, then records them.

        A plain bulk action cannot ask a question, and the first version of this made the operator
        open each row, type the slip number, save through a confirm dialog, come back to the list
        and only then run the action — six steps for one transfer. Django's intermediate-action
        page collapses that to one.

        One box per row rather than one for the batch: each transfer has its own slip, and a
        single shared reference would file the same number against every payout, which is exactly
        the record that fails when somebody disputes one of them.
        """
        self._require_superuser(request)

        if "apply" in request.POST:
            paid, skipped, refused = 0, 0, 0
            for withdrawal in queryset:
                reference = (request.POST.get(f"reference_{withdrawal.pk}") or "").strip()
                if not reference:
                    # Left blank on purpose — paying four of five in a sitting is normal, and the
                    # fifth stays in the queue rather than blocking the four.
                    skipped += 1
                    continue
                try:
                    payout.mark_paid(withdrawal, by=request.user, reference=reference)
                except payout.PayoutError:
                    refused += 1
                    continue
                paid += 1
            if paid:
                self.message_user(request, f"บันทึกว่าโอนแล้ว {paid} รายการ", messages.SUCCESS)
            if skipped:
                self.message_user(
                    request, f"ข้าม {skipped} รายการที่ยังไม่ได้กรอกเลขอ้างอิง — ยังอยู่ในคิว",
                    messages.WARNING,
                )
            if refused:
                self.message_user(
                    request, f"{refused} รายการบันทึกไม่ได้ เพราะปิดไปแล้ว (โอนแล้ว/ไม่อนุมัติ/ยกเลิก)",
                    messages.WARNING,
                )
            return None

        return TemplateResponse(request, "admin/doodee/mark_paid.html", {
            **self.admin_site.each_context(request),
            "title": "บันทึกว่าโอนแล้ว",
            "queryset": queryset,
            # Pre-resolved so the template never has to reach through a relation for the email.
            "rows": [{"withdrawal": w, "who": person(w.user)} for w in queryset],
            "total": sum(w.amount_satang for w in queryset),
            "action_checkbox_name": admin.helpers.ACTION_CHECKBOX_NAME,
            "opts": self.model._meta,
        })

    @admin.action(description="ไม่อนุมัติ และคืนเครดิตให้ผู้ใช้")
    def reject_selected(self, request, queryset):
        self._require_superuser(request)
        done = 0
        for withdrawal in queryset:
            try:
                payout.reject(
                    withdrawal, by=request.user,
                    note=withdrawal.note or f"ไม่อนุมัติโดย {request.user.get_username()}",
                )
            except payout.PayoutError:
                continue
            done += 1
        self.message_user(request, f"ไม่อนุมัติ {done} รายการ · คืนเครดิตให้ผู้ใช้แล้ว", messages.SUCCESS)


@admin.register(CreditLedger)
class CreditLedgerAdmin(admin.ModelAdmin):
    """The credit ledger. Append-only, and enforced as such here.

    Neither editable nor deletable: the balance is the sum of these rows, so an edited row is a
    balance nobody can reconstruct and a deleted one is a payout with no history. A mistake is
    corrected by adding the opposite row, which is what "แอดมินปรับยอด" is for.
    """

    list_display = ("created_at", "who", "amount", "kind", "referral", "order", "note")
    list_filter = ("kind",)
    search_fields = ("user__email", "note")
    autocomplete_fields = ("user",)
    readonly_fields = ("referral", "order", "created_at")

    @admin.display(ordering="user__email", description="ผู้ใช้")
    def who(self, obj):
        return person(obj.user)

    @admin.display(ordering="amount_satang", description="จำนวน")
    def amount(self, obj):
        return f"{'+' if obj.amount_satang >= 0 else '−'}{satang(abs(obj.amount_satang))}"

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_add_permission(self, request):
        # Adding IS allowed, and is the only way to correct a balance — but only for someone who
        # could grant paid entitlement anyway.
        return request.user.is_superuser

    def save_model(self, request, obj, form, change):
        if not obj.kind:
            obj.kind = CreditLedger.Kind.ADMIN_ADJUST
        obj.note = obj.note or f"ปรับโดย {request.user.get_username()}"
        super().save_model(request, obj, form, change)


@admin.register(CouponGrant)
class CouponGrantAdmin(ConfirmingModelAdmin):
    """Sending a coupon straight into one account — work.md §2.2's "แจกคูปองเข้าบัญชีผู้ใช้".

    Adding a row here is the whole feature: pick a person and a `requires_grant` coupon, and
    only they can use it. Removing the row takes the offer back, provided it has not been spent.
    """

    list_display = ("who", "coupon", "source", "used_order", "expires_at", "created_at")
    list_filter = ("coupon",)
    search_fields = ("user__email", "coupon__code")
    autocomplete_fields = ("user",)
    readonly_fields = ("referral", "used_order", "created_at")

    @admin.display(ordering="user__email", description="ผู้ใช้")
    def who(self, obj):
        return person(obj.user)

    @admin.display(description="ที่มา")
    def source(self, obj):
        return "ระบบชวนเพื่อน" if obj.referral_id else "แอดมินมอบให้"

    def has_delete_permission(self, request, obj=None):
        # A spent grant is part of the record behind a paid order.
        return obj is None or obj.used_order_id is None


@admin.register(ReferralCode)
class ReferralCodeAdmin(ConfirmingModelAdmin):
    list_display = ("code", "user", "invited", "created_at")
    search_fields = ("code", "user__email")
    autocomplete_fields = ("user",)
    readonly_fields = ("code", "created_at")

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_invited=Count("user__referrals_made"))

    @admin.display(ordering="_invited", description="ชวนไปแล้ว")
    def invited(self, obj):
        return obj._invited

    def has_add_permission(self, request):
        """Codes are minted on first read. One typed here could collide or duplicate a user's."""
        return False


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    """Read-only: this is the record of what a user was told, and editing it rewrites history."""

    list_display = ("created_at", "user", "kind", "title", "read_at", "emailed_at", "pushed_at")
    list_filter = ("kind",)
    search_fields = ("user__email", "title", "dedupe_key")
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(PushToken)
class PushTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "platform", "created_at", "last_seen_at")
    list_filter = ("platform",)
    search_fields = ("user__email",)

    def has_add_permission(self, request):
        return False


@admin.register(DailyActive)
class DailyActiveAdmin(admin.ModelAdmin):
    """The raw visit log. Read-only: an editable usage figure is one nobody can trust."""

    list_display = ("date", "user")
    list_filter = ("date",)
    search_fields = ("user__email",)
    date_hierarchy = "date"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Visit)
class VisitAdmin(admin.ModelAdmin):
    """Arrival counts per source per day. Read-only, for the same reason as DailyActive.

    The summary worth reading is /admin/marketing/; this is here so a figure on that page can be
    traced to the rows behind it. There is no search box because there is nothing to search for:
    the table holds no identifier of any kind.
    """

    list_display = ("date", "source", "medium", "campaign", "landing_path", "device", "hits")
    list_filter = ("source", "campaign", "device")
    date_hierarchy = "date"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(UserAttribution)
class UserAttributionAdmin(admin.ModelAdmin):
    """Which link brought each account here. Read-only — first touch is a fact, not a setting."""

    list_display = ("who", "source", "medium", "campaign", "landing_path", "created_at")
    list_filter = ("source", "campaign")
    search_fields = ("user__email", "source", "campaign")
    date_hierarchy = "created_at"

    @admin.display(ordering="user__email", description="ผู้ใช้")
    def who(self, obj):
        return person(obj.user)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
