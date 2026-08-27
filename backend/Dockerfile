FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 MEDIAPIPE_DISABLE_GPU=1
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
COPY backend /app/backend
WORKDIR /app/backend
# Outside /app/backend on purpose: compose bind-mounts ./backend there for hot reload, and a
# mount hides whatever the image put underneath it.
ENV DJANGO_STATIC_ROOT=/app/staticfiles
# Baked into the image so every container starts with the admin assets already collected.
# A dummy key is enough — collectstatic touches no database and no secret-dependent code.
RUN DJANGO_SECRET_KEY=build-only python manage.py collectstatic --noinput
# gthread, not the default sync worker. Every slow thing left in the request path is I/O —
# Anthropic, Supabase signing, Postgres — so a blocked thread costs a thread, not a whole worker.
# Sync workers served one request each, which meant two concurrent chat turns froze the API for
# everybody. 3 x 8 gives 24 slots on the same hardware.
#
# --max-requests recycles workers so a slow leak in mediapipe/opencv cannot accumulate forever;
# the jitter keeps all three from recycling on the same request.
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", \
     "-k", "gthread", "--workers", "3", "--threads", "8", \
     "--timeout", "60", "--graceful-timeout", "30", \
     "--max-requests", "2000", "--max-requests-jitter", "200"]

