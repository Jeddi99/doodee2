"""Close the simulator to the free tier: no previews, no saves.

0041 gave free three previews so that the three saves it already advertised could be spent — an
allowance the plan sold and the user could not reach. That reasoning was correct for the ladder as
it stood; the owner has since decided the free tier should not render a face at all, which removes
the problem at the other end. Both numbers go to zero together, because zero previews and a
non-zero save count is exactly the incoherence 0041 was written to fix, mirrored.

`_simulation_locked` already reads a plan-level zero and answers 403 on both the preview and the
save route, and `SimulationView` already replaces the whole screen with a lock and a link to the
price list when the session says so. So this is a data change and not a feature: nothing new is
built, a column returns to the value 0011 seeded it with.

What free keeps is deliberate and stated here so the next person moving these numbers can see the
shape of the tier rather than one column of it: the overall score, one pillar of the analysis, and
five chat turns. The analysis withholding is enforced in `percentile.redact` and
`ScanSerializer.get_analysis_data`, not here.
"""

from django.db import migrations


def close(apps, schema_editor):
    Plan = apps.get_model("doodee", "Plan")
    Plan.objects.filter(code="free").update(
        simulation_previews_per_month=0, simulation_saves_per_month=0,
    )


def reopen(apps, schema_editor):
    """Back to the state 0041 left: three of each, which is one look before each save."""
    Plan = apps.get_model("doodee", "Plan")
    Plan.objects.filter(code="free").update(
        simulation_previews_per_month=3, simulation_saves_per_month=3,
    )


class Migration(migrations.Migration):
    dependencies = [("doodee", "0041_ladder_ascends")]

    operations = [migrations.RunPython(close, reopen)]
