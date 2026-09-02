from pathlib import Path
import os

import dj_database_url
from celery.schedules import crontab
from corsheaders.defaults import default_headers


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
    # Before the view and before authentication, so everything downstream shares one scope.
    # See doodee/request_cache.py for what it memoises and why it is per-request, not Redis.
    "doodee.request_cache.RequestCacheMiddleware",
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

# Recorded, not just defaulted. Without DATABASE_URL this silently runs on a SQLite file, which
# is the right thing for a management command on a laptop and a disaster on a deployment: the API
# would come up, serve requests, and write everything to a file inside the container that the
# next `docker compose up --build` throws away. `require_production_services()` below turns that
# into a refusal to boot, and these flags are how it knows.
USING_SQLITE_FALLBACK = not os.getenv("DATABASE_URL")

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=60,
        # Matters more under gthread than it did under sync workers. A persistent connection is
        # held per thread, so a connection that Postgres closed while its thread was idle would
        # otherwise be handed to the next request and fail it. This checks liveness once per
        # request instead, which is a round-trip cheaper than reconnecting every time.
        conn_health_checks=True,
        # Production points at Supabase's *transaction* pooler, which hands a server connection
        # back to the pool at the end of every transaction rather than holding it for the
        # session. That is what makes ~60 gunicorn threads survivable against a pool of 15 — but
        # a server-side cursor outlives its transaction, so the next statement against it lands
        # on a different backend and fails with "cursor does not exist". Django only opens them
        # for `.iterator()`, which is rare here, so paying for client-side fetching is cheap
        # next to sizing the whole thread pool down to the pooler.
        disable_server_side_cursors=True,
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
# Behind a TLS-terminating reverse proxy (see Caddyfile) gunicorn is reached over plain HTTP on
# loopback, so without this Django reports every request as insecure. The API does not care —
# it authenticates with a bearer token and runs no CSRF check — but the admin does: Django
# compares the browser's `Origin: https://api.doodee.app` against a request it believes is
# http://, rejects the login POST, and the only symptom is "CSRF verification failed" on a form
# that looks entirely normal. Bank transfers are confirmed in the admin, so an admin nobody can
# log into is an admin that cannot take money.
#
# Trusting this header is only safe because the proxy sets it on every request it forwards and
# gunicorn is bound to 127.0.0.1 (compose.prod.yaml), so nothing else can reach it to forge one.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# The four settings `manage.py check --deploy` asks for, every one of them keyed off DEBUG rather
# than switched on flat. That is not timidity. Each of them breaks a plain-http localhost in a
# way that reads as a bug rather than as a policy — an admin login form that accepts the password
# and then returns to itself, a redirect to an https port nothing is listening on — and a
# hardening switch that breaks development is a switch the next person turns off to get their
# work done. It is then off in production too, which is the only place it was ever doing anything.
#
# Turning them on production-only does mean they are never exercised locally, so the reasoning
# for each is written down here rather than left to be rediscovered on the server.

# Redirect http to https. This one is safe *only* because SECURE_PROXY_SSL_HEADER above is set
# and actually honoured, and it is worth being exact about why, because getting it wrong does not
# degrade the API, it removes it.
#
# SecurityMiddleware redirects when `request.is_secure()` is false, and `is_secure()` reads
# SECURE_PROXY_SSL_HEADER out of settings *at request time* (django/http/request.py, the `scheme`
# property) — not when the middleware is constructed. So the order of these two assignments in
# this file does not matter, and neither does the middleware order; what matters is only that the
# header is trusted at all. If it were not, every request Caddy forwards over loopback http would
# look insecure, Django would answer each one with a 301 to the https URL the browser had just
# requested, and the browser would follow that loop until it gave up. The site would be entirely
# down and the logs would show nothing but 301s.
#
# It is honoured: Caddy sets X-Forwarded-Proto on every request it proxies (see Caddyfile), and
# gunicorn is published to 127.0.0.1 only (compose.prod.yaml), so the header is both always
# present on real traffic and unforgeable by anything that is not the proxy.
SECURE_SSL_REDIRECT = not DEBUG
# The one exception, and it is the container health probe. It speaks plain http to 127.0.0.1
# inside the container and has no proxy in front of it to set the forwarded header, so without
# this it would be answered with a 301 to https://api.doodee.app/healthz — sending the probe out
# to DNS, the internet and Caddy and back. A liveness check that fails when the certificate
# expires is not checking whether this process is alive. Matched against `request.path` with the
# leading slash stripped, hence no slash in the pattern.
SECURE_REDIRECT_EXEMPT = [r"^healthz$"]

# HSTS: one hour to begin with, not a year. max-age is the only header here that cannot be taken
# back — a browser that has seen it refuses to speak http to this host for the full duration, and
# the only way to shorten that is to serve a smaller max-age over a *working* https connection,
# which is precisely what is unavailable when the certificate is the thing that broke. Every
# visitor who already cached a year is locked out for the rest of that year.
#
# An hour is long enough to prove the header is really being served on production traffic, and
# short enough that a mistake ages out over lunch. Raise it deliberately once a Let's Encrypt
# renewal has been watched to succeed unattended, in steps — a day, a week, then a year.
SECURE_HSTS_SECONDS = 0 if DEBUG else 3600
# Nothing is served under api.doodee.app, so this covers no additional host today. It is set
# because it costs nothing here and because `check --deploy` counts its absence as a warning, and
# a runbook step that is expected to print warnings is a runbook step nobody reads.
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
# SECURE_HSTS_PRELOAD is deliberately NOT set. Submitting to the preload list writes the promise
# into browser binaries, where our own max-age no longer governs it and removal takes months of
# release cycles rather than an hour. It would also buy nothing: `.app` is already on the preload
# list as an entire TLD, so browsers refuse plain http to every name under it regardless of what
# we send. That is the same fact docs/DEPLOY.md opens with, and it is why the header above is a
# belt beside an existing brace rather than the thing keeping this site on https.

# With the settings above in place, `manage.py check --deploy` on a production-shaped process
# reports exactly one remaining warning: W021, "you have not set SECURE_HSTS_PRELOAD". Silenced
# rather than fixed, because the fix is the irreversible step above that we are choosing not to
# take. A runbook check whose expected output is "1 issue" is a check whose next reader makes it
# green, and the way to make this one green is to submit the domain to a list that browsers ship
# in their binaries. Silencing it makes the expected output "no issues", so a real regression
# stands out instead of hiding in the noise of an argument we already had, in writing, above.
SILENCED_SYSTEM_CHECKS = ["security.W021"]

# The API sets no cookie at all — it authenticates with a Firebase bearer token and runs no CSRF
# check — so these two govern exactly one surface: /admin. That is the surface where a bank
# transfer becomes a paid entitlement (docs/DEPLOY.md section 10), which makes the session cookie
# of whoever confirms payments the most valuable credential this deployment holds. Secure means
# the browser will not attach it to a plain-http request, including one an attacker induces on a
# shared network for the sole purpose of watching the cookie go past.
#
# Off under DEBUG because a Secure cookie is dropped by any browser on a non-https origin that is
# not localhost — and this project is tested from a real phone on the same wifi (DEPLOY section
# 9, step 4), which is http to a LAN address. The symptom is not an error: the login POST
# succeeds, redirects, and arrives back at the login form, for ever.
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

# Defaults to https:// for each configured host rather than being a second list to keep in step
# with DJANGO_ALLOWED_HOSTS by hand. localhost is skipped: it is served over http in development,
# and an https:// origin that never occurs would only be noise.
CSRF_TRUSTED_ORIGINS = [item for item in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",") if item] or [
    f"https://{host}" for host in ALLOWED_HOSTS
    if host not in ("localhost", "127.0.0.1") and not host.startswith("*")
]
CORS_ALLOWED_ORIGINS = [item for item in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5180").split(",") if item]
if DEBUG:
    CORS_ALLOWED_ORIGIN_REGEXES = [
        r"^http://localhost:\d+$",
        r"^http://127\.0\.0\.1:\d+$",
    ]
# Scan upload, simulation, preview and chat all *require* `Idempotency-Key` (see views.py), so
# the browser has to be allowed to send it. Left to the library default it is not: the preflight
# answers 200 while omitting the header, the browser refuses to issue the real request, and
# `fetch` throws exactly as it does for an unreachable host — which is what the web client then
# reports. The API demanded a header no browser was permitted to send, and every server-side
# test passed anyway, because a DRF test client does not run preflights.
#
# Extending the library's defaults rather than restating them, so a header it adds later is not
# silently dropped here.
CORS_ALLOW_HEADERS = (*default_headers, "idempotency-key")
# On by default so the feature is usable out of the box. data.md still requires clinician,
# privacy and validation review before any public medical launch, so a real deployment must
# set SIMULATION_ENABLED=false deliberately until those are done.
SIMULATION_ENABLED = os.getenv("SIMULATION_ENABLED", "true").lower() == "true"
# Promo codes grant paid entitlement for free and may be redeemed without limit, so anyone who
# learns a code keeps renewing. Turn this off in any environment real users can reach.
# Default off. It used to default on, and `docs/DEPLOY.md` and `docs/SETUP.md` both tell you to
# turn it off for production — which makes it opt-out, and an opt-out switch that hands out the
# top tier for free is one forgotten line away from a leaked code renewing forever. There is no
# way to revoke a grant already issued, either: `entitlement.promo_expires_at` reads
# `PromoRedemption` and never joins back to `PromoCode.is_active`.
REDEEM_CODES_ENABLED = os.getenv("REDEEM_CODES_ENABLED", "false").lower() == "true"
# Chat bills a third party per turn, so it stays off unless switched on deliberately — and it
# reports itself unavailable anyway without ANTHROPIC_API_KEY (see doodee/chat.py).
CHAT_ENABLED = os.getenv("CHAT_ENABLED", "true").lower() == "true"
# Chat allowances and the per-hour abuse ceilings live on `Plan` and `SiteSetting` respectively,
# both editable in the admin. Nothing about them belongs here.
# Sample scans, so chat, the score card and the paid gates can be exercised without a camera.
# Defaults to DEBUG: on a real deployment this would let anyone mint a "completed" scan they
# never took, which pollutes every count in the admin overview.
DEMO_SCANS_ENABLED = os.getenv("DEMO_SCANS_ENABLED", str(DEBUG)).lower() == "true"

# Which plan's allowances a redeemed PromoCode hands out. The code grants "vip", which is not a
# sellable tier and has no Plan row of its own (migration 0011), so its quotas have to be
# borrowed from a plan that does exist. Pointing it at the top tier is deliberate: a promo code
# is given out to be impressive.
PROMO_GRANTS_PLAN = os.getenv("PROMO_GRANTS_PLAN", "pro")

# ---- ชวนเพื่อน (referral)
#
# The reward amount, the monthly cap, the claim window, the verification requirement and every
# withdrawal limit are NOT here. They are business decisions that change without a deploy, so they
# live on `SiteSetting` (one row, one admin page). Only the two things an operator cannot sensibly
# edit at runtime remain:
#
# Which coupon row the invited friend is granted. This names a database row rather than setting a
# policy number — the discount itself (10%, capped at ฿100) is edited on that coupon.
REFERRAL_INVITEE_COUPON = os.getenv("REFERRAL_INVITEE_COUPON", "FRIEND10")
# The key that encrypts stored bank account numbers. A secret kept in the database it protects is
# not protecting anything, so this one stays in the environment. With it unset, saving a payout
# account fails closed rather than degrading to plaintext.
PAYOUT_ENCRYPTION_KEY = os.getenv("PAYOUT_ENCRYPTION_KEY", "")

# What a chat turn costs, for the admin cost report. Per million tokens in USD, matching
# Anthropic's published rates for whichever model CHAT_MODEL points at — update both together.
# The report labels the result an estimate: the exchange rate below is a constant we choose,
# and the invoice from Anthropic is always the real number.
# Was declared twice, the first assignment (default "5") overwritten on the very next line and
# never read. Removed rather than kept as a comment: two lines that look like configuration and
# disagree is worse than one line that is the configuration.
CHAT_PRICE_IN_USD_PER_MTOK = float(os.getenv("CHAT_PRICE_IN_USD_PER_MTOK", "0.20"))
CHAT_PRICE_CACHED_IN_USD_PER_MTOK = float(os.getenv("CHAT_PRICE_CACHED_IN_USD_PER_MTOK", "0.02"))
CHAT_PRICE_OUT_USD_PER_MTOK = float(os.getenv("CHAT_PRICE_OUT_USD_PER_MTOK", "1.20"))
USD_THB_RATE = float(os.getenv("USD_THB_RATE", "35"))

# Skin vision now runs on the same model as chat (`skin_vision.MODEL`), so these default to the
# same rates. They stay separate variables rather than collapsing into CHAT_PRICE_*: the two are
# free to diverge again the moment either side changes model, and a photograph arrives as
# thousands of input tokens rather than a sentence, so the per-call cost differs by orders of
# magnitude even when the per-token price does not.
SKIN_VISION_PRICE_IN_USD_PER_MTOK = float(os.getenv("SKIN_VISION_PRICE_IN_USD_PER_MTOK", "0.20"))
SKIN_VISION_PRICE_CACHED_IN_USD_PER_MTOK = float(os.getenv("SKIN_VISION_PRICE_CACHED_IN_USD_PER_MTOK", "0.02"))
SKIN_VISION_PRICE_OUT_USD_PER_MTOK = float(os.getenv("SKIN_VISION_PRICE_OUT_USD_PER_MTOK", "1.20"))
# Turns the LLM cost card red once the month's spend passes this. Sized against the ~฿570 of
# the ฿1,000 budget that is not the VPS.
LLM_BUDGET_THB_PER_MONTH = float(os.getenv("LLM_BUDGET_THB_PER_MONTH", "570"))
LLM_BUDGET_ADMISSION_RATIO = float(os.getenv("LLM_BUDGET_ADMISSION_RATIO", "0.90"))
CHAT_GLOBAL_CONCURRENCY = int(os.getenv("CHAT_GLOBAL_CONCURRENCY", "30"))

# Email. Off by default in exactly the sense SENTRY_DSN is off by default: without EMAIL_HOST
# every message is printed to the console, so local runs and CI send nothing to anybody and a
# forgotten configuration cannot mail real users from a developer's laptop.
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend" if os.getenv("EMAIL_HOST")
    else "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "true").lower() == "true"
EMAIL_TIMEOUT = int(os.getenv("EMAIL_TIMEOUT", "10"))
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "DOODEE <no-reply@doodee.app>")

# The LocMem fallback is the more dangerous of the two, because nothing about it looks broken.
# Every rate limit in this project is a `cache` counter — the chat hourly ceiling
# (views._chat_rate_limited), the preview mutex (`cache.add`, views.SimulationViewSet.preview),
# the visit limiter, the coupon and referral failure counters. LocMem is per-process, so with N
# gunicorn workers each ceiling silently becomes N times its configured value and `cache.add`
# stops being a mutex at all. Nothing errors; the limits just quietly do not hold.
USING_LOCMEM_CACHE = not os.getenv("REDIS_CACHE_URL")

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
    # There was no throttling of any kind here. Every per-user limit in this project is a
    # hand-rolled cache counter on one specific expensive action — the chat hourly ceiling, the
    # preview mutex — and those are good, but nothing at all stood between a single client and
    # the API as a whole. A loop over `POST /scans/` was bounded only by how fast Celery fell
    # behind, and one script could saturate every gunicorn thread.
    #
    # These throttles are the floor under those specific limits, not a replacement for them:
    # ScopedRateThrottle only applies to a view that sets `throttle_scope`, so the two compose.
    #
    # They store counters in `CACHES["default"]`, which is why settings.require_production_services
    # refuses to boot on LocMemCache: per-process counters would multiply every rate below by the
    # worker count.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Generous: one dashboard route change is several queries, and a real user browsing fast
        # should never see a 429. This is here to stop a script, not to shape normal use.
        "user": "240/min",
        "anon": "30/min",
        # The expensive paths, by what they actually cost us.
        # A scan is 3-7 image uploads, a decode per image and a MediaPipe run in a worker.
        "scan_create": "6/hour",
        # A preview is a full MediaPipe + OpenCV warp in the web process (views.py:640).
        "preview": "20/hour",
        # Money. Sits under the per-plan monthly quota and the hourly ceiling in SiteSetting.
        "chat": "30/hour",
    },
}
CELERY_BROKER_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = None
CELERY_TASK_IGNORE_RESULT = True
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_RESULT_SERIALIZER = "json"
CELERY_TASK_TIME_LIMIT = 180
CELERY_TASK_SOFT_TIME_LIMIT = 165
CELERY_TASK_ROUTES = {
    "doodee.tasks.process_scan": {"queue": "cv"},
    "doodee.tasks.process_simulation": {"queue": "cv"},
    # Shares the cv queue rather than getting its own. It is one HTTP call per completed scan
    # for consenting users only, so it cannot starve scan processing at any plausible volume —
    # and a queue nobody watches is worse than a queue that is slightly mixed. Split it out if
    # a vision-provider outage ever shows up as scan latency.
    "doodee.tasks.process_skin_vision": {"queue": "cv"},
    "doodee.tasks.reconcile_heavy_jobs": {"queue": "maintenance"},
    # Not `cv`. The retention sweep must not queue behind a face render, and the cv worker runs
    # with `--max-tasks-per-child=50` for mediapipe's sake — a sweep is nothing like that work.
    "doodee.tasks.cleanup_expired_data": {"queue": "maintenance"},
}
# Renewal reminders. Plain Celery beat rather than django-celery-beat: one daily job does not
# need a database-backed scheduler and an admin screen to edit it.
#
# 02:00 UTC is 09:00 in Bangkok. A reminder that arrives at 3am reads as spam whatever it says.
#
# The job is safe to run repeatedly — see `Notification`'s unique dedupe key — which matters
# because beat has no memory across restarts and will happily re-fire a schedule it thinks it
# missed. Nothing here is the *authority* on entitlement either: `sync_entitlement` still expires
# access on read, so beat not running costs reminders, never correctness.
CELERY_BEAT_SCHEDULE = {
    "reconcile-heavy-jobs": {
        "task": "doodee.tasks.reconcile_heavy_jobs",
        "schedule": 60.0,
    },
    "renewal-reminders": {
        "task": "doodee.tasks.send_renewal_reminders",
        "schedule": crontab(hour=2, minute=0),
    },
    # Hourly, and unlike the two above this one is not a convenience. `Scan.expires_at` is the
    # promise the product makes about how long a face photograph is kept — thirty days for an
    # adult, twenty-four hours for a minor — and nothing else enforces it. `sync_entitlement`
    # can expire access on read because access is checked on read; a stored image is not read
    # before it is kept.
    #
    # Hourly rather than daily because the minor window is twenty-four hours: a daily sweep at a
    # fixed time would keep a minor's photographs for up to forty-eight.
    "cleanup-expired-data": {
        "task": "doodee.tasks.cleanup_expired_data",
        "schedule": crontab(minute=0),
    },
}

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


def require_production_services():
    """Refuse to serve on a development fallback. Raises `ImproperlyConfigured`.

    Called from the two real entrypoints — `config.wsgi` for gunicorn, and Celery's
    `worker_init` / `beat_init` signals — and deliberately not from this module's body.
    Importing settings happens for every `manage.py` command, including the `collectstatic`
    baked into the Dockerfile, which has neither a database nor a Redis and does not need one.
    Enforcing at import would make the image unbuildable.

    The failures this prevents are both silent. A missing `DATABASE_URL` means the API comes up
    on a SQLite file inside the container; a missing `REDIS_CACHE_URL` means every rate limit
    becomes per-worker and the preview mutex stops excluding anything. Neither raises on its own,
    and both are the kind of thing found weeks later in a bill or an incident.
    """
    from django.core.exceptions import ImproperlyConfigured

    if DEBUG:
        return
    missing = []
    if USING_SQLITE_FALLBACK:
        missing.append(
            "DATABASE_URL is unset, so this process would run on a SQLite file inside the "
            "container and lose every write when it is replaced"
        )
    if USING_LOCMEM_CACHE:
        missing.append(
            "REDIS_CACHE_URL is unset, so the cache would be per-process: every rate limit "
            "multiplies by the worker count and cache.add() stops working as a mutex"
        )
    if "console" in EMAIL_BACKEND:
        missing.append(
            "EMAIL_HOST is unset, so every notification would be printed to this container's "
            "stdout instead of sent — renewal reminders and the message telling a customer "
            "their payment was confirmed both go nowhere, and nothing raises"
        )
    if missing:
        raise ImproperlyConfigured(
            "Refusing to start with DJANGO_DEBUG=false and a development fallback in place:\n  - "
            + "\n  - ".join(missing)
        )
