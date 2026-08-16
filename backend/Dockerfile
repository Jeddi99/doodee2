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
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "60"]

