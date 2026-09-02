from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def healthz(request):
    """Is this process alive? Answers 200 and a small JSON body, and touches nothing else.

    Deliberately no database query, no Redis call, no Celery ping. A liveness probe answers one
    question — did this gunicorn worker get far enough through the stack to run a view — and
    adding a `SELECT 1` quietly changes it into a different question, whose answer is the same
    for every container at once. During a Supabase blip all three api services would report
    unhealthy simultaneously while being perfectly capable of serving; anything wired to act on
    that (a watchdog, an orchestrator, another service's `depends_on: service_healthy`) would
    then restart every process, and each restart reconnects, at the moment the database is least
    able to absorb a herd of reconnections. That is how a probe meant to catch a wedged worker
    turns a two-minute database wobble into an outage that outlives it.

    Whether the dependencies are reachable is a real question, and it already has two answers
    that a person asks once, on purpose: `check_production_config` and `check_services`
    (docs/DEPLOY.md section 9).

    Outside `api/v1/` so that DRF's defaults — FirebaseAuthentication and IsAuthenticated — do
    not apply. That is the whole point: the runbook needs one URL whose good answer is
    unambiguous without holding a credential. It is also exempt from SECURE_SSL_REDIRECT (see
    settings.SECURE_REDIRECT_EXEMPT), because the container probe reaches it over plain http on
    loopback with no proxy in front to say otherwise.
    """
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    # No trailing slash, and the healthcheck in compose.prod.yaml requests it without one too:
    # with APPEND_SLASH a mismatch would answer 301 rather than 200, so the probe would be
    # asserting on a redirect instead of on the view actually running.
    path("healthz", healthz),
    path("api/v1/", include("doodee.urls")),
]
