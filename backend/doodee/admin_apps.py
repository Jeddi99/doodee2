from django.contrib.admin.apps import AdminConfig


class DoodeeAdminConfig(AdminConfig):
    """Swaps in the overview index while leaving `admin.site` as the registration target, so
    every existing @admin.register in admin.py keeps working untouched.

    Its own module for two reasons: a second AppConfig subclass in doodee/apps.py makes
    Django's default-config discovery ambiguous, and admin_site.py imports models at module
    level, which is too early during app population.
    """

    default_site = "doodee.admin_site.DoodeeAdminSite"
