from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("doodee", "0003_local_simulation_fields")]

    operations = [
        migrations.AddField(model_name="scan", name="reference_age_band", field=models.CharField(default="18_35", max_length=16)),
        migrations.AddField(model_name="scan", name="reference_profile", field=models.CharField(default="neutral", max_length=12)),
        migrations.CreateModel(
            name="SimulationPreviewUsage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("period", models.DateField()),
                ("count", models.PositiveSmallIntegerField(default=0)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="simulation_preview_usage", to=settings.AUTH_USER_MODEL)),
            ],
            options={"constraints": [models.UniqueConstraint(fields=("user", "period"), name="unique_preview_usage_period")]},
        ),
    ]
