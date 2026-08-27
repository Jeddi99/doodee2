import os

from django.core.wsgi import get_wsgi_application


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
application = get_wsgi_application()

# After get_wsgi_application() so Django is configured, and here rather than in settings.py
# because this module is imported by gunicorn and by nothing else — not by collectstatic, not by
# the test runner. See require_production_services for what it refuses and why.
#
# Imported from the module rather than reached through django.conf.settings: LazySettings only
# proxies UPPERCASE names, so settings.require_production_services() is an AttributeError.
from config.settings import require_production_services  # noqa: E402  (must follow app loading)

require_production_services()

