from pathlib import Path
import os

import dj_database_url


BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "unsafe-development-key")
DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() == "true"
ALLOWED_HOSTS = [item for item in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if item]

INSTALLED_APPS = [
    # Replaces django.contrib.admin so the index carries the operational overview.
    "doodee.admin_apps.DoodeeAdminConfig",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "doodee",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Must sit directly after SecurityMiddleware and before everything else: gunicorn serves
    # no static files of its own, so without this the admin renders unstyled.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    # Searched before app directories, which is the only way to override a template contrib
    # already ships at the same path — django.contrib.admin sits ahead of doodee in
    # INSTALLED_APPS, so an app-level admin/index.html would never be reached.
    "DIRS": [BASE_DIR / "templates"],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=60,
    )
}
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "th"
TIME_ZONE = "Asia/Bangkok"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
# collectstatic writes here (see backend/Dockerfile); WhiteNoise serves from it.
# Overridable because compose bind-mounts ./backend over /app/backend for hot reload, which
# would hide anything collected inside it — the image points this at /app/staticfiles instead.
STATIC_ROOT = Path(os.getenv("DJANGO_STATIC_ROOT", BASE_DIR / "staticfiles"))
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    # Compresses and fingerprints admin assets so they can be cached forever.
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
CORS_ALLOWED_ORIGINS = [item for item in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if item]
# On by default so the feature is usable out of the box. data.md still requires clinician,
# privacy and validation review before any public medical launch, so a real deployment must
# set SIMULATION_ENABLED=false deliberately until those are done.
SIMULATION_ENABLED = os.getenv("SIMULATION_ENABLED", "true").lower() == "true"
# Promo codes grant paid entitlement for free and may be redeemed without limit, so anyone who
# learns a code keeps renewing. Turn this off in any environment real users can reach.
REDEEM_CODES_ENABLED = os.getenv("REDEEM_CODES_ENABLED", "true").lower() == "true"
# Chat bills a third party per turn, so it stays off unless switched on deliberately — and it
# reports itself unavailable anyway without ANTHROPIC_API_KEY (see doodee/chat.py).
CHAT_ENABLED = os.getenv("CHAT_ENABLED", "true").lower() == "true"
# Turns per calendar month. Free is a hard cap; the paid figure is a soft cap whose job is to
# bound the bill if an account is stolen, not to ration the feature.
CHAT_FREE_TURNS = int(os.getenv("CHAT_FREE_TURNS", "5"))
CHAT_PAID_TURNS = int(os.getenv("CHAT_PAID_TURNS", "300"))
# Sample scans, so chat, the score card and the paid gates can be exercised without a camera.
# Defaults to DEBUG: on a real deployment this would let anyone mint a "completed" scan they
# never took, which pollutes every count in the admin overview.
DEMO_SCANS_ENABLED = os.getenv("DEMO_SCANS_ENABLED", str(DEBUG)).lower() == "true"

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": os.getenv("REDIS_CACHE_URL", "redis://localhost:6379/1"),
    }
} if os.getenv("REDIS_CACHE_URL") else {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["doodee.authentication.FirebaseAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}
CELERY_BROKER_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_RESULT_SERIALIZER = "json"
CELERY_TASK_TIME_LIMIT = 180
CELERY_TASK_SOFT_TIME_LIMIT = 165

# Error reporting. Off unless SENTRY_DSN is set, so local and CI runs send nothing.
if os.getenv("SENTRY_DSN"):
    import sentry_sdk

    sentry_sdk.init(
        dsn=os.environ["SENTRY_DSN"],
        environment=os.getenv("SENTRY_ENVIRONMENT", "production"),
        # This app handles face scans. send_default_pii would attach request bodies and
        # user identifiers to every event, so it stays off.
        send_default_pii=False,
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
    )
