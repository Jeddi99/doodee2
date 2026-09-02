#!/usr/bin/env bash
#
# preflight.sh — read an environment file and refuse the deploy before anything is copied to a
# server, rather than after a container has already booted on a bad value.
#
#   scripts/preflight.sh [ENV_FILE] [FIREBASE_KEY_JSON]
#
# Defaults to .env.production and firebase-service-account.json at the repo root, which is what
# docs/DEPLOY.md step 3 tells you to scp up. deploy.sh runs this same file again on the server,
# pointed at /opt/doodee/.env, so the checks that matter are enforced on both sides of the copy.
#
# Two rules govern everything below.
#
# The first is that this script NEVER prints the value of a variable, only its name. It is run on
# a laptop, in a terminal that gets screenshotted, pasted into chat and scrolled back through for
# days. A preflight that helpfully echoes DATABASE_URL to show you what is wrong with it has
# leaked the production database password to wherever that output ended up. Every message here
# names the variable and describes the fault; you go and look at the value yourself.
#
# The second is that each check exists because of a specific failure that does NOT announce
# itself. Anything that crashes loudly on boot does not need a preflight — compose will tell you.
# What is worth catching in advance is the class of mistake that boots green and is wrong: a
# blank SMTP password, a wildcard in ALLOWED_HOSTS, a `$` eaten by interpolation. The comment
# above each check is the reason it is there; if the reason ever stops being true, delete the
# check on purpose rather than deleting it because it looked like noise.
set -euo pipefail
# Pathname expansion off for the whole script. Two of the checks below split a value on commas
# with `for x in $value`, and DJANGO_ALLOWED_HOSTS=* is precisely the value the wildcard check
# exists to catch — left globbing on, the shell expands that `*` into the list of files in the
# current directory before the check ever sees it, and the check reports no wildcard found.
# Nothing here wants filename expansion, so it is simplest to turn it off once, here.
set -f

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$REPO_ROOT/.env.production}"
FIREBASE_KEY="${2:-$REPO_ROOT/firebase-service-account.json}"

# The domain docs/DEPLOY.md deploys to. Only used to warn that it is missing from
# DJANGO_ALLOWED_HOSTS; override when deploying the same stack to a different hostname.
EXPECTED_API_HOST="${EXPECTED_API_HOST:-api.doodee.app}"

errors=0
warnings=0

# Colour only when attached to a terminal, so piping this into a file or a CI log stays readable.
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_YEL=$'\033[33m'; C_GRN=$'\033[32m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_RED=''; C_YEL=''; C_GRN=''; C_DIM=''; C_OFF=''
fi

fail() { printf '%s  FAIL %s %s\n' "$C_RED" "$C_OFF" "$1"; errors=$((errors + 1)); }
warn() { printf '%s  WARN %s %s\n' "$C_YEL" "$C_OFF" "$1"; warnings=$((warnings + 1)); }
pass() { printf '%s  ok   %s %s\n' "$C_GRN" "$C_OFF" "$1"; }
note() { printf '%s       %s%s\n' "$C_DIM" "$1" "$C_OFF"; }

# --------------------------------------------------------------------------------------------
# Reading the env file
#
# Deliberately not `source`d. Sourcing an env file executes it: a value containing $(...) or a
# backtick would run as a command with this shell's privileges, and the whole point of this
# script is that it is pointed at files nobody has audited yet. It also gets the semantics wrong
# — `source` applies shell quoting rules, docker compose applies dotenv rules, and the checks
# below need to see what compose will see.
# --------------------------------------------------------------------------------------------

env_keys() {
  awk '
    { line = $0; sub(/\r$/, "", line) }                       # tolerate CRLF from a Windows editor
    line ~ /^[[:space:]]*#/ { next }
    {
      k = line
      sub(/^[[:space:]]+/, "", k)
      sub(/^export[[:space:]]+/, "", k)
      if (k !~ /^[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/) next
      sub(/[[:space:]]*=.*$/, "", k)
      print k
    }
  ' "$ENV_FILE"
}

# Prints the raw value for a key, or nothing if the key is absent. Last assignment wins, which is
# how dotenv resolves a key that appears twice — a duplicate near the bottom of a long file is a
# real way to be wrong, and reading the first one would make this script disagree with compose.
env_raw() {
  awk -v want="$1" '
    { line = $0; sub(/\r$/, "", line) }
    line ~ /^[[:space:]]*#/ { next }
    {
      k = line
      sub(/^[[:space:]]+/, "", k)
      sub(/^export[[:space:]]+/, "", k)
      if (k !~ /^[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/) next
      v = k
      sub(/[[:space:]]*=.*$/, "", k)
      if (k != want) next
      sub(/^[^=]*=/, "", v)
      found = 1; val = v
    }
    END { if (found) print val }
  ' "$ENV_FILE"
}

# Same as env_raw with the cosmetics removed: surrounding quotes and edge whitespace, the way a
# dotenv reader strips them. Everything else is left exactly as written, `$` included.
env_get() {
  local v
  v="$(env_raw "$1")"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  case "$v" in
    \"*\") v="${v#\"}"; v="${v%\"}" ;;
    \'*\') v="${v#\'}"; v="${v%\'}" ;;
  esac
  printf '%s' "$v"
}

env_has_key() {
  env_keys | grep -qx -- "$1"
}

# Empty and absent are the same failure from the deployed stack's point of view, but they are
# different mistakes to fix, so they get different sentences.
require_nonempty() {
  local key="$1" why="$2"
  if ! env_has_key "$key"; then
    fail "$key is not present in $(basename "$ENV_FILE") — $why"
    return 1
  fi
  if [ -z "$(env_get "$key")" ]; then
    fail "$key is present but empty — $why"
    return 1
  fi
  return 0
}

# Host and port out of a postgres:// URL, without printing either back at the user. Splits on the
# LAST `@` because a Supabase password routinely contains one, and splitting on the first would
# read half the password as the hostname and then report a nonsense host.
url_host() {
  printf '%s' "$1" | awk '
    { s = $0
      sub(/^[a-zA-Z0-9+.-]*:\/\//, "", s)
      n = index(s, "/"); if (n > 0) s = substr(s, 1, n - 1)
      while (match(s, /@/)) { s = substr(s, RSTART + 1) }
      n = index(s, ":"); if (n > 0) s = substr(s, 1, n - 1)
      print s }'
}

url_port() {
  printf '%s' "$1" | awk '
    { s = $0
      sub(/^[a-zA-Z0-9+.-]*:\/\//, "", s)
      n = index(s, "/"); if (n > 0) s = substr(s, 1, n - 1)
      n = index(s, "?"); if (n > 0) s = substr(s, 1, n - 1)
      while (match(s, /@/)) { s = substr(s, RSTART + 1) }
      n = index(s, ":"); if (n == 0) { print ""; next }
      print substr(s, n + 1) }'
}

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

printf '\n%spreflight%s  env file: %s\n\n' "$C_DIM" "$C_OFF" "$ENV_FILE"

# --------------------------------------------------------------------------------------------
# 0. The file itself
# --------------------------------------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  fail "environment file not found: $ENV_FILE"
  note "pass the path as the first argument, e.g. scripts/preflight.sh .env.production"
  printf '\n%s1 problem — nothing was checked.%s\n\n' "$C_RED" "$C_OFF"
  exit 1
fi
if [ ! -r "$ENV_FILE" ]; then
  fail "environment file is not readable: $ENV_FILE"
  exit 1
fi
pass "$(basename "$ENV_FILE") exists and is readable"

# --------------------------------------------------------------------------------------------
# 1. The three variables require_production_services() refuses to boot without
#
# backend/config/settings.py:422 raises ImproperlyConfigured when DJANGO_DEBUG is false and any
# of these is unset. Each one has a development fallback that works, which is exactly why the
# guard exists: no DATABASE_URL means SQLite inside the container (every write lost on the next
# rebuild), no REDIS_CACHE_URL means LocMemCache (every rate limit multiplied by the worker count
# and cache.add() no longer a mutex), no EMAIL_HOST means the console backend (every payment
# confirmation printed to stdout instead of sent).
#
# The guard is enough to stop the api serving, but it fires *on the server, after the build*.
# Catching it here costs a second instead of a rebuild cycle.
# --------------------------------------------------------------------------------------------
require_nonempty DATABASE_URL \
  "settings.require_production_services() refuses to boot without it; the api would otherwise fall back to a SQLite file inside the container" \
  && pass "DATABASE_URL is set"
require_nonempty REDIS_CACHE_URL \
  "settings.require_production_services() refuses to boot without it; the cache would fall back to per-process LocMemCache and every rate limit would multiply by the worker count" \
  && pass "REDIS_CACHE_URL is set"
require_nonempty EMAIL_HOST \
  "settings.require_production_services() refuses to boot without it; email would fall back to the console backend and payment confirmations would go to stdout" \
  && pass "EMAIL_HOST is set"

# --------------------------------------------------------------------------------------------
# 2. DJANGO_SECRET_KEY
#
# The one that needs a check most, because it is the one the boot guard does not cover.
# settings.py:10 reads it with a default: `os.getenv("DJANGO_SECRET_KEY", "unsafe-development-key")`.
# Leave it out of the env file and nothing complains at any point — the stack comes up green and
# signs every session cookie and password reset token with a string that is public knowledge in
# this repository. There is no symptom to notice. That is what makes it worth a check.
# --------------------------------------------------------------------------------------------
if require_nonempty DJANGO_SECRET_KEY \
  "it silently defaults to the development key in settings.py:10, which would sign session cookies and password-reset tokens with a value published in this repo"; then
  secret="$(env_get DJANGO_SECRET_KEY)"
  case "$secret" in
    unsafe-development-key)
      fail "DJANGO_SECRET_KEY is still the development fallback from settings.py:10 — generate one with: python3 -c 'import secrets; print(secrets.token_urlsafe(50))'" ;;
    replace-me|replace-me-*|changeme|change-me|build-only)
      fail "DJANGO_SECRET_KEY is still a placeholder — generate one with: python3 -c 'import secrets; print(secrets.token_urlsafe(50))'" ;;
    *)
      if [ "${#secret}" -lt 32 ]; then
        warn "DJANGO_SECRET_KEY is shorter than 32 characters, which is short enough to be worth checking it was not truncated on the way in"
      else
        pass "DJANGO_SECRET_KEY is set and is not the development fallback"
      fi ;;
  esac
fi
unset secret

# --------------------------------------------------------------------------------------------
# 3. MIGRATION_DATABASE_URL
#
# compose.prod.yaml:49 interpolates it as ${MIGRATION_DATABASE_URL:?...}, and `:?` treats empty
# exactly like unset — the variable being present on a line with nothing after the `=` does not
# save you. What you get is compose refusing the whole `up` with a message about .env, which is
# a fine error to receive but a slow one to receive at the end of a deploy.
#
# The port matters as much as the presence. Migrations are DDL and need one continuous session,
# which the transaction pooler (6543) cannot give them; docs/DEPLOY.md pairs the direct
# connection (5432) with this variable for that reason. Pointed at the pooler, migrate does not
# fail cleanly — it fails partway through, in ways that depend on which statement it reached.
# --------------------------------------------------------------------------------------------
if require_nonempty MIGRATION_DATABASE_URL \
  "compose.prod.yaml:49 interpolates it as \${MIGRATION_DATABASE_URL:?...}, and \`:?\` rejects empty as well as unset, so the whole stack refuses to come up"; then
  mig_port="$(url_port "$(env_get MIGRATION_DATABASE_URL)")"
  if [ "$mig_port" = "6543" ]; then
    warn "MIGRATION_DATABASE_URL uses the transaction pooler port (6543); migrations are DDL and need the direct connection on 5432, which is a single continuous session — see docs/DEPLOY.md step 4"
  elif [ "$mig_port" = "5432" ]; then
    pass "MIGRATION_DATABASE_URL is set and uses the direct connection port (5432)"
  elif [ -z "$mig_port" ]; then
    warn "MIGRATION_DATABASE_URL has no explicit port; it should be the Supabase direct connection on 5432, not the pooler"
  else
    warn "MIGRATION_DATABASE_URL uses a port that is neither 5432 nor 6543; the direct connection is expected here"
  fi
  unset mig_port
fi

# --------------------------------------------------------------------------------------------
# 4. DATABASE_URL — the pooler, and not the development database
#
# The mirror image of the check above. Every serving container holds a connection per thread
# (settings.py sets conn_max_age=60) and the stack opens roughly sixty threads against a Supabase
# pool of fifteen, so this one has to be the transaction pooler on 6543. Pointed at 5432 it works
# perfectly until real people arrive, and then the pool exhausts.
#
# A host of `postgres` or `localhost` means the file was copied from the development .env and
# never edited. On the VPS `postgres` resolves to the compose service that production does not
# even start (compose.prod.yaml puts it behind a profile), so this is not a subtle difference in
# behaviour — it is a stack that cannot reach a database at all, discovered after the build.
# --------------------------------------------------------------------------------------------
if [ -n "$(env_get DATABASE_URL)" ]; then
  db_host="$(lower "$(url_host "$(env_get DATABASE_URL)")")"
  db_port="$(url_port "$(env_get DATABASE_URL)")"
  case "$db_host" in
    postgres|localhost|127.0.0.1|db)
      fail "DATABASE_URL still points at the development database host — this looks like a copy of the local .env; it must be the Supabase transaction pooler URI (docs/DEPLOY.md step 4)" ;;
    "")
      warn "DATABASE_URL has no host that this script could read; check it is a full postgresql:// URI" ;;
    *)
      pass "DATABASE_URL points at a remote host, not the development database" ;;
  esac
  if [ "$db_port" = "5432" ]; then
    warn "DATABASE_URL uses the direct/session port (5432); serving traffic wants the transaction pooler on 6543 — the stack opens ~60 threads against a Supabase pool of 15 and will exhaust it once real users arrive, not during your own testing"
  elif [ "$db_port" = "6543" ]; then
    pass "DATABASE_URL uses the transaction pooler port (6543)"
  elif [ -z "$db_port" ]; then
    warn "DATABASE_URL has no explicit port; it should be the Supabase transaction pooler on 6543"
  else
    warn "DATABASE_URL uses a port that is neither 6543 nor 5432; the transaction pooler is expected here"
  fi
  unset db_host db_port
fi

# --------------------------------------------------------------------------------------------
# 5. EMAIL_HOST_PASSWORD
#
# The boot guard only looks at EMAIL_HOST, because that is what decides which backend Django
# loads (settings.py:290). With a host and a blank password the SMTP backend is selected, the
# stack boots healthy, and every send fails at the moment of sending — which is a background
# Celery task, so nobody watching the deploy sees anything. The first sign is a customer who paid
# and never got the confirmation.
# --------------------------------------------------------------------------------------------
require_nonempty EMAIL_HOST_PASSWORD \
  "the boot guard only checks EMAIL_HOST, so a blank password boots green and then fails at send time inside a Celery task where nobody sees it — payment confirmations and renewal reminders simply never arrive" \
  && pass "EMAIL_HOST_PASSWORD is set"

# --------------------------------------------------------------------------------------------
# 6. DJANGO_DEBUG
#
# settings.py:11 is `os.getenv("DJANGO_DEBUG", "false").lower() == "true"`, so anything that is
# not the word true reads as false and the default is already false. The reason to check anyway
# is that DEBUG=true does not only leak tracebacks: it switches off SESSION_COOKIE_SECURE,
# CSRF_COOKIE_SECURE, SECURE_SSL_REDIRECT and HSTS (settings.py:116 onward), and it makes
# require_production_services() return immediately, so every check in section 1 above stops being
# enforced at runtime. One word turns off the entire safety net.
# --------------------------------------------------------------------------------------------
if ! env_has_key DJANGO_DEBUG; then
  warn "DJANGO_DEBUG is not present; settings.py defaults it to false, but on a production env file it should say so explicitly"
else
  debug_val="$(lower "$(env_get DJANGO_DEBUG)")"
  if [ "$debug_val" = "false" ]; then
    pass "DJANGO_DEBUG is set to the production value"
  elif [ "$debug_val" = "true" ]; then
    fail "DJANGO_DEBUG is enabled — this disables the secure-cookie, SSL-redirect and HSTS settings and makes require_production_services() skip every check; it must be false"
  else
    fail "DJANGO_DEBUG is set to something that is neither true nor false; settings.py:11 will read it as false, but say false explicitly rather than relying on that"
  fi
  unset debug_val
fi

# --------------------------------------------------------------------------------------------
# 7. DJANGO_ALLOWED_HOSTS — the wildcard trap
#
# This is the check that looks like pedantry and is not. settings.py:198 derives
# CSRF_TRUSTED_ORIGINS from DJANGO_ALLOWED_HOSTS, and it skips any host starting with `*`
# because there is no such thing as a wildcard origin. So `DJANGO_ALLOWED_HOSTS=*` — which looks
# like the maximally permissive setting, the one you reach for to stop worrying about hosts —
# produces an EMPTY CSRF_TRUSTED_ORIGINS list.
#
# The result is a stack where every API route works perfectly (bearer tokens, no CSRF check) and
# only the admin login is broken, with a 403 that says "CSRF verification failed" on a form that
# looks entirely normal. And bank transfers are confirmed in the admin, so the one broken page is
# the one that takes money. Every signal available says the deploy went fine.
# --------------------------------------------------------------------------------------------
if require_nonempty DJANGO_ALLOWED_HOSTS \
  "settings.py:198 derives CSRF_TRUSTED_ORIGINS from it; without it Django answers 400 DisallowedHost to everything, including the container healthchecks"; then
  hosts="$(env_get DJANGO_ALLOWED_HOSTS)"
  has_wildcard=0
  usable_origin=0
  found_expected=0
  old_ifs="$IFS"; IFS=','
  for h in $hosts; do
    h="${h#"${h%%[![:space:]]*}"}"; h="${h%"${h##*[![:space:]]}"}"
    [ -z "$h" ] && continue
    case "$h" in
      \**) has_wildcard=1 ;;
      localhost|127.0.0.1) ;;
      *) usable_origin=1 ;;
    esac
    [ "$(lower "$h")" = "$(lower "$EXPECTED_API_HOST")" ] && found_expected=1
  done
  IFS="$old_ifs"

  if [ "$has_wildcard" -eq 1 ]; then
    fail "DJANGO_ALLOWED_HOSTS contains a wildcard entry — settings.py:198 skips wildcards when building CSRF_TRUSTED_ORIGINS, so the API stays perfectly healthy while the admin login 403s with 'CSRF verification failed', and the admin is where bank transfers are confirmed"
  fi
  if [ "$usable_origin" -eq 0 ] && [ -z "$(env_get CSRF_TRUSTED_ORIGINS)" ]; then
    fail "DJANGO_ALLOWED_HOSTS yields no usable https origin (only wildcards and/or localhost), so CSRF_TRUSTED_ORIGINS comes out empty and the admin login will 403 — set the real API hostname, or set CSRF_TRUSTED_ORIGINS explicitly"
  fi
  if [ "$has_wildcard" -eq 0 ] && [ "$usable_origin" -eq 1 ]; then
    pass "DJANGO_ALLOWED_HOSTS is set, has no wildcard, and yields a usable CSRF origin"
  fi
  if [ "$found_expected" -eq 0 ]; then
    warn "DJANGO_ALLOWED_HOSTS does not list $EXPECTED_API_HOST, which is the hostname docs/DEPLOY.md deploys to; if that is intentional, set EXPECTED_API_HOST to silence this"
  fi
  unset hosts has_wildcard usable_origin found_expected old_ifs
fi

# --------------------------------------------------------------------------------------------
# 8. Unescaped `$` — the one that has cost people whole afternoons
#
# docker compose interpolates `.env` before use, so a password written `p$ssw0rd` arrives as `p`
# — `$ssw0rd` was read as the name of a variable that does not exist and expanded to nothing. The
# escape is to double it: `$$`. Supabase generates passwords containing `$` often enough that
# this is not a hypothetical.
#
# What makes it expensive is the symptom. Postgres rejects the password, which is indistinguishable
# from having copied the password wrong, so the natural response is to go back to the Supabase
# dashboard and copy it again — carefully, character by character — and paste in exactly the same
# broken thing. The value in the file looks correct because it IS correct; it is what compose
# does to it on the way through that is not.
#
# Checked across every variable rather than the database URLs alone: the same rule applies to any
# value compose reads, and the next password with a `$` in it will be somewhere else.
# --------------------------------------------------------------------------------------------
dollar_offenders=""
for key in $(env_keys | sort -u); do
  val="$(env_get "$key")"
  case "$val" in
    *'$'*)
      # Remove every properly escaped pair; a `$` still standing is one compose will interpolate.
      stripped="${val//\$\$/}"
      case "$stripped" in
        *'$'*) dollar_offenders="$dollar_offenders $key" ;;
      esac
      ;;
  esac
done
unset key val stripped
if [ -n "$dollar_offenders" ]; then
  for key in $dollar_offenders; do
    fail "$key contains a single \$ that is not written as \$\$ — docker compose will interpolate it and silently drop everything from the \$ to the end of the word; write every literal \$ as \$\$"
  done
  note "the symptom is 'password authentication failed', which looks exactly like a mistyped password and is not"
  unset key
else
  pass "no value contains an unescaped \$ (every literal \$ is written \$\$)"
fi
unset dollar_offenders

# --------------------------------------------------------------------------------------------
# 9. CORS_ORIGINS — advisory, because it is compared character for character
#
# django-cors-headers matches CORS_ALLOWED_ORIGINS against the browser's Origin header exactly. A
# trailing slash or an http:// scheme never matches, and the failure surfaces in the browser as
# "Cannot reach the API", which is the same thing you see when the server is down. Warnings
# rather than failures because this variable is not part of the boot contract — but a warning
# here means the frontend will not talk to the backend.
# --------------------------------------------------------------------------------------------
if [ -n "$(env_get CORS_ORIGINS)" ]; then
  cors_bad=0
  old_ifs="$IFS"; IFS=','
  for o in $(env_get CORS_ORIGINS); do
    o="${o#"${o%%[![:space:]]*}"}"; o="${o%"${o##*[![:space:]]}"}"
    [ -z "$o" ] && continue
    case "$o" in
      */) warn "CORS_ORIGINS contains an entry with a trailing slash; Origin headers never have one, so that entry can never match and the browser will report 'Cannot reach the API'"; cors_bad=1 ;;
    esac
    case "$o" in
      https://*) ;;
      http://localhost*|http://127.0.0.1*) warn "CORS_ORIGINS still contains a localhost origin; harmless but it does not belong in a production env file" ;;
      *) warn "CORS_ORIGINS contains an entry that is not https://; doodee.app is on a .app domain, which browsers force to https before the request is sent, so a non-https origin can never match"; cors_bad=1 ;;
    esac
  done
  IFS="$old_ifs"
  [ "$cors_bad" -eq 0 ] && pass "CORS_ORIGINS entries are https with no trailing slash"
  unset cors_bad old_ifs o
else
  warn "CORS_ORIGINS is not set; settings.py falls back to localhost origins and the Vercel frontend will be blocked by CORS"
fi

# --------------------------------------------------------------------------------------------
# 10. firebase-service-account.json
#
# compose mounts this file with `create_host_path: false` precisely so that a missing file is an
# error rather than Docker helpfully creating an empty DIRECTORY at that path — which it does by
# default, and which surfaces much later as "Invalid Firebase token" in the browser with nothing
# in the logs pointing at a mount.
#
# Parsed rather than merely stat'd because the realistic failure is not absence, it is a partial
# or wrong file: an scp that was interrupted, or the JSON that Firebase shows on screen saved
# from a browser with the page furniture included. Both exist, both are non-empty, and neither is
# loadable.
#
# The parse is done in awk rather than python3/jq to keep this script's dependencies to what the
# runbook already assumes is on the machine. It is a structural check — balanced braces and
# brackets outside of strings, no unterminated string — which is what catches truncation.
# --------------------------------------------------------------------------------------------
if [ ! -f "$FIREBASE_KEY" ]; then
  fail "firebase-service-account.json not found at $FIREBASE_KEY — compose mounts it with create_host_path:false, so the stack will refuse to start rather than mount an empty directory"
elif [ ! -s "$FIREBASE_KEY" ]; then
  fail "$(basename "$FIREBASE_KEY") is empty — this is what a half-finished scp leaves behind"
elif ! awk '
    BEGIN { depth = 0; instr = 0; esc = 0; sawopen = 0; firstchar = "" }
    {
      line = $0
      n = length(line)
      for (i = 1; i <= n; i++) {
        c = substr(line, i, 1)
        if (firstchar == "" && c !~ /[[:space:]]/) firstchar = c
        if (instr) {
          if (esc) { esc = 0; continue }
          if (c == "\\") { esc = 1; continue }
          if (c == "\"") instr = 0
          continue
        }
        if (c == "\"") { instr = 1; continue }
        if (c == "{" || c == "[") { depth++; sawopen = 1; continue }
        if (c == "}" || c == "]") { depth--; if (depth < 0) exit 1; continue }
      }
      # A JSON string cannot contain a raw newline, so being mid-string at end of line is broken.
      if (instr) exit 1
    }
    END { if (depth != 0 || sawopen == 0 || firstchar != "{") exit 1; exit 0 }
  ' "$FIREBASE_KEY"; then
  fail "$(basename "$FIREBASE_KEY") is not valid JSON — most likely truncated by an interrupted copy, or saved from a browser view rather than downloaded"
else
  missing_fields=""
  for field in type project_id private_key client_email; do
    grep -q "\"$field\"[[:space:]]*:" "$FIREBASE_KEY" || missing_fields="$missing_fields $field"
  done
  if [ -n "$missing_fields" ]; then
    fail "$(basename "$FIREBASE_KEY") parses as JSON but is missing required field(s):$missing_fields — this is not a service account key"
  elif ! grep -q '"type"[[:space:]]*:[[:space:]]*"service_account"' "$FIREBASE_KEY"; then
    fail "$(basename "$FIREBASE_KEY") has a \"type\" that is not \"service_account\" — a Web API config or an OAuth client file will not authenticate the backend"
  else
    pass "$(basename "$FIREBASE_KEY") exists, parses as JSON, and looks like a service account key"
  fi
  unset missing_fields field
fi

# --------------------------------------------------------------------------------------------
# Summary
# --------------------------------------------------------------------------------------------
printf '\n'
if [ "$errors" -gt 0 ]; then
  printf '%s%d problem(s) and %d warning(s). Fix them in %s before this file is used to start anything.%s\n\n' \
    "$C_RED" "$errors" "$warnings" "$(basename "$ENV_FILE")" "$C_OFF"
  exit 1
fi
if [ "$warnings" -gt 0 ]; then
  printf '%sNo blocking problems, %d warning(s). Read them — every one of them describes something that boots green and is wrong.%s\n\n' \
    "$C_YEL" "$warnings" "$C_OFF"
  exit 0
fi
printf '%sAll preflight checks passed.%s\n\n' "$C_GRN" "$C_OFF"
exit 0
