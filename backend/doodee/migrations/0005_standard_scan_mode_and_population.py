from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("doodee", "0004_reference_scores_and_preview_usage")]

    operations = [
        migrations.AddField(model_name="scan", name="reference_population", field=models.CharField(default="TH", max_length=8)),
        migrations.AlterField(
            model_name="scan",
            name="scan_mode",
            field=models.CharField(
                choices=[("full", "7 views"), ("standard", "Front and both profiles"), ("fast", "3 views")],
                default="full",
                max_length=16,
            ),
        ),
    ]
