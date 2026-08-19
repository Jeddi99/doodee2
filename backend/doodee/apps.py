from django.apps import AppConfig


class DoodeeConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "doodee"
    # The heading above the model list on the admin index. "DOODEE" in capitals read as a
    # section nobody had named; this says what is under it.
    verbose_name = "ข้อมูลระบบ DOODEE"

