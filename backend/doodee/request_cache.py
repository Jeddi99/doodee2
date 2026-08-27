"""Memoise a value for the duration of one request or one Celery task, and no longer.

The problem this solves is repetition inside a single request, not repetition across requests.
`SiteSetting.current()` and `ChatSetting.current()` are `get_or_create(pk=1)` — a database round
trip every call — and one `GET /session/` calls them from four unrelated places: the view itself,
`views._chat_rate_limited`, `views.SimulationViewSet.preview` and `entitlement._grace`. Nothing
in between can change them, so every call after the first is waste.

Why not Redis. A cross-request cache would have to be invalidated when the row changes, and the
row is changed in ways that never reach `Model.save()`: `SiteSetting.objects.filter(pk=1)
.update(...)` in tests and in migration 0026, and `update_or_create`. A cache keyed on save()
would serve a stale ceiling to a rate limiter, which is exactly the class of bug that is
invisible until it matters. Per-request scope has no invalidation problem at all: an admin edit
is visible on the next request, and a test that updates a row sees it immediately.

The scope is cleared by `RequestCacheMiddleware` at the end of each request and by Celery's
`task_prerun`/`task_postrun`. Outside both — a management command, a shell, an import — there is
no scope and every call falls through to the real function, which is the safe direction to fail.
"""

import threading

from celery.signals import task_postrun, task_prerun

_state = threading.local()


def _scope():
    return getattr(_state, "scope", None)


def begin():
    """Open a memoisation scope. Idempotent, and always paired with `end()`."""
    _state.scope = {}


def end():
    """Close the scope. Threads are reused under gthread, so this is not optional."""
    _state.scope = None


def get_or_set(key, produce):
    """`produce()`'s result, computed at most once per request.

    With no scope open — a management command, a test calling directly — this is a plain call
    through to `produce`. Falling back to "no caching" cannot cause a stale read.
    """
    scope = _scope()
    if scope is None:
        return produce()
    if key not in scope:
        scope[key] = produce()
    return scope[key]


def clear(key):
    """Forget one key inside the current scope, so a write is visible to later reads in it."""
    scope = _scope()
    if scope is not None:
        scope.pop(key, None)


class RequestCacheMiddleware:
    """Opens a scope per request and closes it even when the view raises.

    Must wrap the view, so anything that runs inside `process_request` of a middleware listed
    after this one is also covered.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        begin()
        try:
            return self.get_response(request)
        finally:
            # In a finally rather than after the call: an exception must not leave a populated
            # scope on a thread that gunicorn will hand to the next, unrelated request.
            end()


@task_prerun.connect
def _open_task_scope(**_kwargs):
    begin()


@task_postrun.connect
def _close_task_scope(**_kwargs):
    end()
