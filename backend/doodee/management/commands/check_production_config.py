from django.core.exceptions import ImproperlyConfigured
from django.core.management.base import BaseCommand, CommandError

from config.settings import require_production_services


class Command(BaseCommand):
    help = "Refuse a deployment that would run on a development fallback (SQLite, LocMemCache)"

    def handle(self, *args, **options):
        """A gate, not a report: exits non-zero so `check_production_config && celery …` stops.

        The api container does not need this — config/wsgi.py runs the same check when gunicorn
        imports it, and a failed import stops the worker booting. Celery has no equivalent hook:
        exceptions raised from `worker_init` receivers are swallowed by Celery's own signal
        dispatch, so a worker with no database happily reports `ready`. Chaining this command in
        front of the worker and beat commands is what makes them refuse.
        """
        try:
            require_production_services()
        except ImproperlyConfigured as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS("Production configuration OK"))
