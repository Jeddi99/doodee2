from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("doodee", "0002_add_scan_mode_to_scan")]

    operations = [
        migrations.AddField(model_name="simulation", name="preset_id", field=models.CharField(blank=True, max_length=80)),
        migrations.AddField(model_name="simulation", name="source_view", field=models.CharField(blank=True, max_length=24)),
        migrations.AddField(model_name="simulation", name="measurements", field=models.JSONField(default=list)),
        migrations.AddField(model_name="simulation", name="related_procedures", field=models.JSONField(default=list)),
        migrations.AlterField(model_name="consentevent", name="purpose", field=models.CharField(choices=[("analysis", "Analysis"), ("storage", "Storage and history"), ("simulation", "Local facial simulation")], max_length=16)),
    ]
