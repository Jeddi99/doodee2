"""Seeds the three tiers the product actually has.

The ported pricing panel hardcoded `free` / `plus` / `pro` at ฿0 / ฿149 / ฿299 — names the
backend had never heard of. `_user_plan()` returns `free`, `vip`, `member` or `clinic`, and
entitlement is decided by the `pro_member` and `clinic_partner` groups, so those are the codes
here and the panel now reads them from the API instead of holding its own list.

`vip` is absent on purpose: it comes from a redeemed PromoCode, not from a purchase, and
putting it on the price list would advertise something with no way to buy it.

Clinic is `self_serve=False`. A clinic partnership is an agreement, not a checkout, and the
group it grants (`clinic_partner`) is not a consumer tier — selling it from a card form would
hand out partner access to anyone with ฿299.
"""

from django.db import migrations


FEATURES_BASE = ["report", "questions"]
FEATURES_MEMBER = [
    "single-reference", "multi-reference", "try-on", "report", "questions", "pdf", "tracking",
]
FEATURES_CLINIC = [
    "single-reference", "multi-reference", "try-on", "report", "questions", "pdf", "tracking",
    "compare",
]

PLANS = [
    {
        "code": "free", "name_th": "ฟรี", "name_en": "Free",
        "description_th": "ทดลองใช้ ไม่มีภาพอ้างอิง",
        "description_en": "A personal trial without reference images.",
        "price_satang": 0, "features": FEATURES_BASE, "grants_group": "",
        "self_serve": True, "sort_order": 0,
    },
    {
        "code": "member", "name_th": "สมาชิก", "name_en": "Member",
        "description_th": "จำลองผล ภาพอ้างอิง รายงาน PDF และการติดตามผล",
        "description_en": "Simulation, reference images, PDF report and tracking.",
        "price_satang": 14900, "features": FEATURES_MEMBER, "grants_group": "pro_member",
        "self_serve": True, "sort_order": 1,
    },
    {
        "code": "clinic", "name_th": "คลินิกพาร์ทเนอร์", "name_en": "Clinic partner",
        "description_th": "สำหรับคลินิก ต้องทำข้อตกลงก่อนเปิดใช้งาน",
        "description_en": "For clinics. Requires an agreement before access is granted.",
        "price_satang": 29900, "features": FEATURES_CLINIC, "grants_group": "clinic_partner",
        "self_serve": False, "sort_order": 2,
    },
]


def seed(apps, schema_editor):
    Plan = apps.get_model("doodee", "Plan")
    for plan in PLANS:
        # update_or_create rather than create: this migration must be safe on a database that
        # already has rows from an earlier run, and prices belong under admin's control after
        # the first deploy — so only rows that are genuinely missing get written.
        Plan.objects.get_or_create(code=plan["code"], defaults=plan)


def unseed(apps, schema_editor):
    Plan = apps.get_model("doodee", "Plan")
    # Only plans nobody has bought. A Plan referenced by an Order is a record of a real
    # transaction, and PROTECT would refuse anyway — this makes the reason explicit.
    Plan.objects.filter(code__in=[p["code"] for p in PLANS], orders__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [("doodee", "0010_coupon_plan_order_coupon_applies_to_plans_and_more")]
    operations = [migrations.RunPython(seed, unseed)]
