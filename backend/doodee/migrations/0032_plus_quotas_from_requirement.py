"""แผนพลัส: จำลองใบหน้า 20 → 10 ครั้ง, AI chat 50 → 100 ข้อความ

requirement.md sells Plus as "สามารถจำลองใบหน้าได้ 10 ครั้ง ใช้ ai chat ได้ 100 ข้อความต่อเดือน".
0022 seeded 20 and 50. That migration explains every other figure it chose and says nothing about
these two, so this is drift rather than a decision, and the document is the thing being sold.

**This reduces simulation for people who already bought Plus**, from 20 a month to 10. That is the
one thing 0022 refused to do to the `member` tier, and the reasoning there still holds — a plan row
referenced by a real transaction is a record of that transaction. It is done here because the
figure is wrong against the document the product is sold from, and leaving it wrong means the price
list and the entitlement disagree forever. Chat moves the other way, 50 → 100, so nobody loses
outright.

Only rows still carrying 0022's exact values are touched. An admin who has since tuned these
numbers made a decision about their own product, and a migration that overwrites it would be
correcting the wrong party. Same rule for the description strings: they are updated only where they
still read the sentence 0022 wrote, because "จำลองใบหน้าได้ 20 ครั้งต่อเดือน" printed on the pricing
page beside a 10-render allowance is a false advertisement, not a stale comment.

Nothing is written to `Subscription`. Allowances are resolved from the plan row on every read
(`entitlement.current_plan`), so this takes effect on the next request with no backfill and no
scheduled job to forget to run.
"""

from django.db import migrations


# What 0022 seeded, and what requirement.md asks for. Both counters move: `simulation_saves_per_month`
# is the other route to a rendered face (`SimulationViewSet.create`), and leaving it at 20 would sell
# "10 ครั้ง" while allowing 30.
OLD = {"simulation_previews_per_month": 20, "simulation_saves_per_month": 20, "chat_turns_per_month": 50}
NEW = {"simulation_previews_per_month": 10, "simulation_saves_per_month": 10, "chat_turns_per_month": 100}

PLUS_CODES = ("plus", "plus_year")

# 0022's exact wording, matched before replacing so an edited description survives.
DESCRIPTIONS = {
    "plus": {
        "description_th": (
            "ผลวิเคราะห์ครบ พร้อมแผนพัฒนาตนเอง จำลองใบหน้าได้ 20 ครั้งต่อเดือน",
            "ผลวิเคราะห์ครบ พร้อมแผนพัฒนาตนเอง จำลองใบหน้าได้ 10 ครั้งต่อเดือน แชทได้ 100 ข้อความต่อเดือน",
        ),
        "description_en": (
            "Full analysis, a personal development plan, and 20 simulations a month.",
            "Full analysis, a personal development plan, 10 simulations and 100 chat messages a month.",
        ),
    },
}


def _move(Plan, source, target):
    for code in PLUS_CODES:
        Plan.objects.filter(code=code, **source).update(**target)


def forwards(apps, schema_editor):
    Plan = apps.get_model("doodee", "Plan")
    _move(Plan, OLD, NEW)
    for code, fields in DESCRIPTIONS.items():
        for field, (was, becomes) in fields.items():
            Plan.objects.filter(code=code, **{field: was}).update(**{field: becomes})


def backwards(apps, schema_editor):
    Plan = apps.get_model("doodee", "Plan")
    _move(Plan, NEW, OLD)
    for code, fields in DESCRIPTIONS.items():
        for field, (was, becomes) in fields.items():
            Plan.objects.filter(code=code, **{field: becomes}).update(**{field: was})


class Migration(migrations.Migration):
    dependencies = [("doodee", "0031_alter_consentevent_purpose")]
    operations = [migrations.RunPython(forwards, backwards)]
