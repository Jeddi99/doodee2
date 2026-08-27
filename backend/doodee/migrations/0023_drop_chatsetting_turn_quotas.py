"""Removes ChatSetting.free_turns and .paid_turns.

The monthly chat allowance now lives on `Plan.chat_turns_per_month`, one figure per tier, seeded
by 0022 and still editable in the admin without a deploy. These two columns could describe exactly
two allowances between them, which is one fewer than the product sells.

They are dropped rather than left in place read-only. An operator looking at "ตั้งค่า AI แชท" would
otherwise find two quota boxes that accept an edit, save it, and change nothing — the precise
failure this codebase's own comments keep warning about.

The abuse ceiling `paid_turns` was really for did not move to the Plan. `settings.CHAT_HOURLY_CEILING`
took that over, because a tier sold as unlimited has no monthly ceiling to fail against and needs
an hourly one more than a metered tier does.

Reversing this restores the columns at their original defaults. Whatever figures an operator had
tuned are gone — a dropped column takes its data with it, and nothing here could know them.
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("doodee", "0022_seed_tiers")]

    operations = [
        migrations.RemoveField(model_name="chatsetting", name="free_turns"),
        migrations.RemoveField(model_name="chatsetting", name="paid_turns"),
    ]
