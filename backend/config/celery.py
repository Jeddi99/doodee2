import os

from celery import Celery


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
app = Celery("doodee")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# No config guard here. Two reasons it cannot live in this module: config/__init__.py imports it,
# so anything at import time would also run for every manage.py command including the
# Dockerfile's collectstatic; and Celery's signal dispatch swallows exceptions raised from
# worker_init receivers, so a worker with no database would log the failure and report `ready`
# anyway. The worker and beat commands are gated by `manage.py check_production_config` instead —
# see compose.prod.yaml.

