from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("doodee", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="scan",
            name="scan_mode",
            field=models.CharField(choices=[("full", "7 views"), ("fast", "3 views")], default="full", max_length=8),
        ),
    ]
