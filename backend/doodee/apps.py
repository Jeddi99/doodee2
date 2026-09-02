from django.apps import AppConfig


class DoodeeConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "doodee"
    # The heading above the model list on the admin index. "DOODEE" in capitals read as a
    # section nobody had named; this says what is under it.
    verbose_name = "ข้อมูลระบบ DOODEE"

    def ready(self):
        """Make a User print as their email everywhere, not as their Firebase uid.

        `authentication.py` sets `username = f"firebase:{uid}"`, so the stock `User.__str__`
        — which returns the username — rendered `firebase:5CnFw1prsVQQcoFe9TjSLTkflJ02` in
        every admin column, autocomplete and foreign-key dropdown. On the order queue that is
        not merely ugly: confirming a bank transfer means matching a slip to a buyer, and a
        Firebase uid matches nothing a bank ever prints. `search_fields` already searched
        `user__email`, so the page could be searched by a value it refused to show.

        Patched here rather than per-admin because six changelists start with `user`, and a
        seventh will be written later by someone who does not know this.

        Falls back to the username for rows with no email (the DEBUG-only `dev-guest` account),
        so nothing renders blank.
        """
        from django.contrib.auth.models import User

        User.add_to_class("__str__", lambda self: self.email or self.get_username())
