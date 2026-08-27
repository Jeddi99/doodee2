"""The three packages the product actually sells, monthly and yearly.

requirement.md names ฟรี / พลัส ฿499 / โปร ฿799. Migration 0011 had seeded free / member ฿149 /
clinic, which is what the backend has been answering with since.

`member` is NOT deleted and NOT repriced. It is closed to new sales (`is_active=False`) and given
the allowances it effectively already had, so anyone holding it keeps exactly what they bought:
`Order.plan` is PROTECT, `activate()` prices from `order.plan`, and a plan row referenced by a real
transaction is a record of that transaction rather than a piece of configuration. Repricing it to
฿499 would silently triple the next renewal for people who never agreed to that.

Yearly is a separate row rather than a discount field on the monthly one. `mrr_satang()` already
divides a YEAR interval by 12 (analytics.py), `_period_end()` already gives it 365 days
(billing.py), and the pricing page can compute "ประหยัด 17%" from two rows it already fetches — so
a discount column would add a second way to express a price and nothing else.

Every row here is `get_or_create` for the same reason 0011 gives: prices belong to the admin after
the first deploy, so this must never overwrite a figure somebody has since edited. The `member` and
`clinic` allowances are the one exception and are set with an explicit `update` — 0021 gave every
existing row the free tier's stingy defaults, and leaving those in place would strip paying members
and clinic partners of access the next time `entitlement.current_plan()` was consulted.
"""

from django.db import migrations


FEATURES_FREE = ["report", "questions"]
FEATURES_PLUS = [
    "single-reference", "multi-reference", "try-on", "report", "questions", "pdf", "tracking",
    "development-plan",
]
FEATURES_PRO = [*FEATURES_PLUS, "compare"]

# Monthly-equivalent allowances, shared by a tier's monthly and yearly rows. A yearly subscriber
# buys a longer commitment, not a bigger monthly bucket.
PLUS_LIMITS = {
    "simulation_previews_per_month": 20,
    "simulation_saves_per_month": 20,
    "chat_turns_per_month": 50,
    "analysis_depth": "full",
    "has_development_plan": True,
    "tier_rank": 10,
}
PRO_LIMITS = {
    "simulation_previews_per_month": -1,
    "simulation_saves_per_month": -1,
    "chat_turns_per_month": -1,
    "analysis_depth": "full",
    "has_development_plan": True,
    "tier_rank": 20,
}

NEW_PLANS = [
    {
        "code": "plus", "name_th": "พลัส", "name_en": "Plus",
        "description_th": "ผลวิเคราะห์ครบ พร้อมแผนพัฒนาตนเอง จำลองใบหน้าได้ 20 ครั้งต่อเดือน",
        "description_en": "Full analysis, a personal development plan, and 20 simulations a month.",
        "price_satang": 49900, "interval": "month", "features": FEATURES_PLUS,
        "grants_group": "plus_member", "self_serve": True, "sort_order": 1, **PLUS_LIMITS,
    },
    {
        # Ten months' money for twelve months' access. Priced as a round number rather than as
        # 499 x 12 x 0.83, because a price list is read by people.
        "code": "plus_year", "name_th": "พลัส รายปี", "name_en": "Plus yearly",
        "description_th": "แผนพลัสแบบรายปี จ่ายเท่า 10 เดือน ใช้ได้ 12 เดือน",
        "description_en": "Plus, billed yearly. Pay for ten months, use twelve.",
        "price_satang": 499000, "interval": "year", "features": FEATURES_PLUS,
        "grants_group": "plus_member", "self_serve": True, "sort_order": 2, **PLUS_LIMITS,
    },
    {
        "code": "pro", "name_th": "โปร", "name_en": "Pro",
        "description_th": "ผลวิเคราะห์ครบ แผนพัฒนาตนเอง จำลองใบหน้าและแชทได้ไม่จำกัด",
        "description_en": "Full analysis, development plan, unlimited simulations and chat.",
        "price_satang": 79900, "interval": "month", "features": FEATURES_PRO,
        "grants_group": "pro_member", "self_serve": True, "sort_order": 3, **PRO_LIMITS,
    },
    {
        "code": "pro_year", "name_th": "โปร รายปี", "name_en": "Pro yearly",
        "description_th": "แผนโปรแบบรายปี จ่ายเท่า 10 เดือน ใช้ได้ 12 เดือน",
        "description_en": "Pro, billed yearly. Pay for ten months, use twelve.",
        "price_satang": 799000, "interval": "year", "features": FEATURES_PRO,
        "grants_group": "pro_member", "self_serve": True, "sort_order": 4, **PRO_LIMITS,
    },
]

# What these plans could already do before 0021 handed them the free tier's defaults. Simulation
# was gated only on "not free" (`_simulation_locked`), saving was capped at three a month for
# everybody, and chat used CHAT_PAID_TURNS = 300. Written back verbatim: this is a migration that
# must not change what anyone is entitled to.
LEGACY_LIMITS = {
    "member": {
        "simulation_previews_per_month": -1,
        "simulation_saves_per_month": 3,
        "chat_turns_per_month": 300,
        "analysis_depth": "full",
        "has_development_plan": True,
        "tier_rank": 10,
        "is_active": False,
    },
    "clinic": {
        "simulation_previews_per_month": -1,
        "simulation_saves_per_month": -1,
        "chat_turns_per_month": -1,
        "analysis_depth": "full",
        "has_development_plan": True,
        # Above every consumer tier: a partner holding both must never resolve to the cheaper one.
        "tier_rank": 30,
        # Pushed to the end of the price list. 0011 gave it sort_order 2, which the four new rows
        # now sit across — leaving it there drops "คลินิกพาร์ทเนอร์" between พลัส and พลัส รายปี.
        "sort_order": 9,
    },
}

FREE_LIMITS = {
    "simulation_previews_per_month": 0,
    "simulation_saves_per_month": 3,
    "chat_turns_per_month": 5,
    "analysis_depth": "partial",
    "has_development_plan": False,
    "tier_rank": 0,
}


def seed(apps, schema_editor):
    Plan = apps.get_model("doodee", "Plan")
    for plan in NEW_PLANS:
        Plan.objects.get_or_create(code=plan["code"], defaults=plan)
    for code, limits in (*LEGACY_LIMITS.items(), ("free", FREE_LIMITS)):
        Plan.objects.filter(code=code).update(**limits)


def unseed(apps, schema_editor):
    Plan = apps.get_model("doodee", "Plan")
    # Only rows nobody has bought. PROTECT on Order.plan would refuse anyway; this states why.
    Plan.objects.filter(code__in=[p["code"] for p in NEW_PLANS], orders__isnull=True).delete()
    Plan.objects.filter(code="member").update(is_active=True)


class Migration(migrations.Migration):
    dependencies = [("doodee", "0021_plan_quotas")]
    operations = [migrations.RunPython(seed, unseed)]
