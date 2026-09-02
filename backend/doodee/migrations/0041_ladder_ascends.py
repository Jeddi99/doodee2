"""Make the price list ascend: free gets previews, `member` stays shut, `clinic` goes.

Measured off the seeded rows, more money bought less. ฿499 พลัส granted ten previews and 100 chat
turns where ฿149 สมาชิก granted unlimited previews and 300 turns; ฿299 คลินิกพาร์ทเนอร์ carried
`tier_rank` 30, above ฿799 โปร, so a partner account holding both resolved to the cheaper row. And
the free tier advertised three saved simulations it could never spend, because `_simulation_locked`
refuses both the preview *and* the save route whenever a plan grants zero previews.

Three changes, all of them to data that 0011 and 0022 seeded, which is why this is a migration and
not a shell command run once against production:

* **free gets three previews.** Three rather than two because the free row already sells three
  saves, and previews and saves are metered separately — `SimulationPreviewUsage` counts one,
  `entitlement.used(SAVES)` counts SAVED rows for the other — so three previews is exactly one
  look before each save. Two would leave the third save to be spent blind, which is the same
  defect as today one rung further down: an allowance the plan advertises and the user cannot
  usefully reach. It is not more than three because a preview is a full MediaPipe + OpenCV warp
  inside the web process, and because the free tier is a trial, not a product.

* **`member` is confirmed closed.** 0022 set `is_active=False` and this restates it rather than
  trusting a side effect five migrations back. `is_active` is the flag that retires a plan, not
  `self_serve`: `_plan()` filters the order lookup on `is_active`, so an inactive row cannot be
  bought at all, while `self_serve=False` would leave ฿149 on the pricing page behind a "contact
  us" button for a tier we do not sell. It also matters to `entitlement._granted_by_group`, which
  orders on `-is_active` so that the `pro_member` group — shared by `member` and `pro` — resolves
  to the plan still on sale. Its price and its allowances are untouched: `Order.plan` is PROTECT
  and a row behind a real payment is a record of that payment.

* **`clinic` is deleted.** Verified unreferenced before removal, and skipped rather than forced if
  that ever stops being true. It was never sold: no order, no subscription, nobody in
  `clinic_partner`. Its only lasting effect was `tier_rank=30`, which put a ฿299 row above ฿799.

The `clinic_partner` Group is deliberately left alone. It is `admin.py`'s vocabulary — the user
list annotates an "effective plan" off group membership, and `UserAdmin`'s membership form reads
the same names — and removing it belongs with that file rather than with the price list. With no
Plan naming it, it now grants no entitlement, which is the correct reading of a withdrawn tier.
"""

from django.db import migrations, models


# The free row's own save allowance, mirrored so the reason for the number is visible here. If
# somebody raises the saves, the previews have to move with them or the last save goes back to
# being blind.
FREE_PREVIEWS = 3


def ascend(apps, schema_editor):
    Plan = apps.get_model("doodee", "Plan")
    Order = apps.get_model("doodee", "Order")
    Subscription = apps.get_model("doodee", "Subscription")

    Plan.objects.filter(code="free").update(simulation_previews_per_month=FREE_PREVIEWS)
    Plan.objects.filter(code="member").update(is_active=False)

    clinic = Plan.objects.filter(code="clinic").first()
    if not clinic:
        return
    # Checked rather than assumed. PROTECT would refuse the delete anyway, but a migration that
    # dies halfway through a deploy is a worse answer than one that leaves a row it cannot safely
    # remove — so a referenced clinic row is retired in place instead, below Pro where it can no
    # longer outrank a tier that costs more than twice as much.
    if Order.objects.filter(plan=clinic).exists() or Subscription.objects.filter(plan=clinic).exists():
        Plan.objects.filter(pk=clinic.pk).update(is_active=False, self_serve=False, tier_rank=15)
        return
    clinic.delete()


def descend(apps, schema_editor):
    Plan = apps.get_model("doodee", "Plan")
    Plan.objects.filter(code="free").update(simulation_previews_per_month=0)
    # Restored exactly as 0011 seeded it and 0022 amended it, so a rollback lands on the row the
    # earlier migrations would have produced rather than on a half-remembered version of it.
    # `member` is not reopened here: 0022 owns that flag and its own reverse puts it back.
    Plan.objects.get_or_create(code="clinic", defaults={
        "name_th": "คลินิกพาร์ทเนอร์", "name_en": "Clinic partner",
        "description_th": "สำหรับคลินิก ต้องทำข้อตกลงก่อนเปิดใช้งาน",
        "description_en": "For clinics. Requires an agreement before access is granted.",
        "price_satang": 29900, "interval": "month", "grants_group": "clinic_partner",
        "features": [
            "single-reference", "multi-reference", "try-on", "report", "questions", "pdf",
            "tracking", "compare",
        ],
        "self_serve": False, "sort_order": 9, "tier_rank": 30,
        "simulation_previews_per_month": -1, "simulation_saves_per_month": -1,
        "chat_turns_per_month": -1, "analysis_depth": "full", "has_development_plan": True,
    })


class Migration(migrations.Migration):
    dependencies = [("doodee", "0040_alter_order_note")]

    operations = [
        # Admin copy that named two plans as the examples of what a plan code looks like: one
        # retired, one about to stop existing. Help text is read by the person editing prices.
        migrations.AlterField(
            model_name="plan",
            name="code",
            field=models.CharField(
                help_text="รหัสภายในระบบ เช่น free, plus, pro ห้ามแก้หลังเปิดขายแล้ว เพราะสิทธิ์ของผู้ใช้ผูกกับค่านี้",
                max_length=32, unique=True, verbose_name="รหัสแผน",
            ),
        ),
        migrations.AlterField(
            model_name="plan",
            name="self_serve",
            field=models.BooleanField(
                default=True,
                help_text="ปิดไว้ = หน้าเว็บจะแสดงปุ่ม “ติดต่อทีมงาน” แทนปุ่มสั่งซื้อ (ใช้กับแผนที่ต้องคุยกันก่อน เช่น แผนพาร์ทเนอร์)",
                verbose_name="ให้ซื้อเองได้",
            ),
        ),
        migrations.RunPython(ascend, descend),
    ]
