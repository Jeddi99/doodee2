"""Read the project's `.env` files into ``os.environ`` before anything reads a setting.

Compose passes ``backend/.env`` in through ``env_file``, so inside a container this finds nothing
left to do. On the host nothing read that file at all: Django takes every setting straight from
``os.getenv`` and the project has no dotenv dependency, so ``manage.py`` on the host ran with
whatever happened to be exported and silently ignored the file the README tells you to fill in.
A key written down correctly still produced ``available() is False``, which reads as a broken
provider rather than as a setting that was never loaded.

This module imports nothing from Django on purpose. ``config/settings.py`` calls it at the top,
before its own first ``os.getenv``, and settings is imported long before the app registry exists --
anything Django-aware here would be an import cycle. It lives under ``doodee`` rather than
``config`` for the same reason: ``config/__init__.py`` builds the Celery app, so importing any
module from that package while settings is still executing would re-enter settings.
"""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
# backend/.env is the documented one and wins; a repo-root .env is honoured after it so a
# single-file setup also works. Order matters only through setdefault: first writer wins.
DEFAULT_PATHS = (BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env")


def load_env(*paths: str | Path) -> None:
    """Load ``KEY=value`` lines, never overwriting a variable that is already set.

    ``setdefault`` rather than assignment, so a real environment variable always wins: the file is
    the convenience, the shell and compose are the override. That also makes this safe to call more
    than once and from more than one entry point.

    A bare ``api = ...`` line is routed by its value's prefix rather than by its name -- a Vercel
    gateway key is ``vck_``, a bfl.ai key is not -- because the name says nothing about which
    transport it opens, and a key sent to the wrong host fails as a 401 that reads like a revoked
    key. That is the shape the render prototype's own `.env` uses, so a key can be brought across
    by copying the line rather than by knowing which variable it belongs in.
    """
    for path in paths or DEFAULT_PATHS:
        path = Path(path)
        if not path.exists():
            continue
        # utf-8-sig: these files get edited on Windows, and a BOM would otherwise become part of
        # the first key's name -- which fails as "not set" while the file plainly shows it set.
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, _, value = line.partition("=")
            name, value = name.strip(), value.strip().strip("'\"")
            if not name or not value:
                continue
            if name == "api":
                name = "AI_GATEWAY_API_KEY" if value.startswith("vck_") else "BFL_API_KEY"
            os.environ.setdefault(name, value)
