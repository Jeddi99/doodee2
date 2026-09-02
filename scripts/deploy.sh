#!/usr/bin/env bash
#
# deploy.sh — run this ON THE SERVER. It is docs/DEPLOY.md steps 3, 6 and 9 with the parts a
# tired person gets wrong taken out of their hands.
#
#   sudo bash /opt/doodee/scripts/deploy.sh
#
# Safe to run twice, and expected to be: the git pull is fast-forward-only, `compose up -d` only
# recreates what changed, and Django migrations are idempotent by construction. Running it again
# after fixing one thing is the normal way to use it, not a recovery procedure.
#
# What it deliberately does NOT do is decide that a deploy worked. Every "it came up" signal
# available on a machine is a weak one — a container can be Up for days with every thread parked
# on a dead socket, and `/api/v1/session/` answers 403 both when authentication is working and
# when the Firebase key has expired. So this script ends by running the checks from DEPLOY.md
# section 9 and printing what each one actually returned. If any of them is not what it should
# be, it says which, and exits non-zero. There is no path through this file that prints success
# over a stack that is not serving.
#
# Everything the runbook does that a script should not: obtaining TLS certificates, pointing DNS,
# choosing an admin password, adding domains in the Vercel and Firebase dashboards. Those are
# listed at the end so you know what is still yours to do.
set -euo pipefail
# Off for the same reason as in preflight.sh: this script splits DJANGO_ALLOWED_HOSTS on commas,
# and a value of `*` would otherwise be expanded into the contents of the working directory.
set -f

APP_DIR="${APP_DIR:-/opt/doodee}"
REPO_URL="${REPO_URL:-https://github.com/Jeddi99/doodee2}"
BRANCH="${BRANCH:-main}"

# Compose overlay order is not a preference. compose.prod.yaml is an overlay: on its own it is
# missing half the services, and compose.yaml on its own is the development configuration —
# ./backend bind-mounted over the built code, gunicorn --reload, and the Django ports published
# on 0.0.0.0 where the whole internet can reach an unencrypted Django past Caddy. Both files,
# in this order, every time. That is why nobody types this by hand any more.
COMPOSE_FILES=(-f compose.yaml -f compose.prod.yaml)

# Migrations against Supabase from Singapore take a while on the first run, when every table in
# the schema is being created. The healthcheck budget covers compose.prod.yaml's start_period of
# 60s plus three 30s intervals, with room for the mediapipe import on a 2 vCPU box.
MIGRATE_TIMEOUT="${MIGRATE_TIMEOUT:-600}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-420}"

if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_YEL=$'\033[33m'; C_GRN=$'\033[32m'; C_DIM=$'\033[2m'; C_BLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_RED=''; C_YEL=''; C_GRN=''; C_DIM=''; C_BLD=''; C_OFF=''
fi

failures=0

step()  { printf '\n%s==> %s%s\n' "$C_BLD" "$1" "$C_OFF"; }
ok()    { printf '%s  ok   %s %s\n' "$C_GRN" "$C_OFF" "$1"; }
bad()   { printf '%s  FAIL %s %s\n' "$C_RED" "$C_OFF" "$1"; failures=$((failures + 1)); }
warn()  { printf '%s  WARN %s %s\n' "$C_YEL" "$C_OFF" "$1"; }
note()  { printf '%s       %s%s\n' "$C_DIM" "$1" "$C_OFF"; }

# Abort for problems that make the rest of the script meaningless — no repo, no .env, a failed
# preflight. Anything found after the containers are up is counted instead, so that one bad check
# does not hide the other four.
die() { printf '\n%s  FAIL %s %s\n\n' "$C_RED" "$C_OFF" "$1"; exit 1; }

dc() { docker compose "${COMPOSE_FILES[@]}" "$@"; }

# Reads one key out of a dotenv file without sourcing it. Sourcing would execute a value
# containing $(...) or a backtick, and this file is the one place on the machine where every
# production secret is sitting in plain text.
env_get() {
  awk -v want="$2" '
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
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
      gsub(/^"|"$/, "", v)
      found = 1; val = v
    }
    END { if (found) print val }
  ' "$1"
}

# curl never fails this script. A connection refused, a DNS miss and a TLS handshake failure all
# have to come back as a value that can be reported next to the value that was expected, because
# "which of these five checks failed" is the entire output of this script.
http_code() {
  local url="$1"; shift
  curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@" "$url" 2>/dev/null || true
}

printf '\n%sdoodee deploy%s  %s  branch %s\n' "$C_BLD" "$C_OFF" "$APP_DIR" "$BRANCH"

# --------------------------------------------------------------------------------------------
# 1. Tools
# --------------------------------------------------------------------------------------------
step "Checking the tools this needs"
command -v git >/dev/null 2>&1    || die "git is not installed — see docs/DEPLOY.md step 2"
command -v curl >/dev/null 2>&1   || die "curl is not installed — see docs/DEPLOY.md step 2"
command -v docker >/dev/null 2>&1 || die "docker is not installed — run: curl -fsSL https://get.docker.com | sh"
# `docker compose` (the v2 plugin), not `docker-compose` (the retired Python v1). v1 does not
# understand the `!override` tags or the `depends_on: condition: service_completed_successfully`
# that compose.prod.yaml relies on to sequence migrate before api, and it fails in ways that read
# as YAML errors rather than as a version problem.
docker compose version >/dev/null 2>&1 \
  || die "the 'docker compose' v2 plugin is missing — compose.prod.yaml uses !override and service_completed_successfully, neither of which the old docker-compose v1 understands"
docker info >/dev/null 2>&1 \
  || die "cannot talk to the Docker daemon — is it running, and are you root or in the docker group?"
ok "git, curl and docker compose v2 are available"

# --------------------------------------------------------------------------------------------
# 2. The code — clone or fast-forward
#
# git rather than rsync, and this is worth stating because rsync is the obvious tool and it is
# wrong twice over. `rsync -av ./` does not read .gitignore, so it takes .env and
# firebase-service-account.json along with the code and the claim that secrets travel separately
# stops being true. And excluding .git leaves /opt/doodee as a directory rather than a repository,
# which removes the rollback in DEPLOY.md's last section at the exact moment it is wanted.
#
# --ff-only rather than a plain pull: a merge commit created on the server, in the dark, by a
# pull that could not fast-forward is a state nobody wants to reason about at the end of a long
# day. If it cannot fast-forward, something is different here and you want to know before a build.
# --------------------------------------------------------------------------------------------
step "Getting the code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH" || die "git fetch failed — check the network and that origin is reachable"
  git -C "$APP_DIR" checkout --quiet "$BRANCH" || die "could not check out $BRANCH in $APP_DIR"
  if ! git -C "$APP_DIR" merge --ff-only --quiet "origin/$BRANCH"; then
    die "cannot fast-forward $APP_DIR to origin/$BRANCH — there are local commits or local edits here. Look at 'git -C $APP_DIR status' before going further; do not force it blind."
  fi
  ok "fast-forwarded to origin/$BRANCH ($(git -C "$APP_DIR" rev-parse --short HEAD))"
elif [ -e "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null || true)" ]; then
  # Almost always this is secrets scp'd into an empty directory before the clone. git refuses to
  # clone into a non-empty directory, and the fix is an order-of-operations one, not a git one.
  die "$APP_DIR already has files in it but is not a git repository. docs/DEPLOY.md step 3 clones first and copies the secrets in second — move what is there aside, clone, then copy .env and firebase-service-account.json back."
else
  git clone --quiet -b "$BRANCH" "$REPO_URL" "$APP_DIR" || die "git clone of $REPO_URL failed"
  ok "cloned $REPO_URL into $APP_DIR ($(git -C "$APP_DIR" rev-parse --short HEAD))"
fi

cd "$APP_DIR"

# --------------------------------------------------------------------------------------------
# 3. The secrets — and the filename that eats an evening
#
# docker compose reads exactly one env file automatically, and it is called `.env`. It has never
# read `.env.production`. So the file you spent an hour getting right, sitting in this directory
# under the name you gave it locally, has no effect whatsoever — and the error you get is
# `set the Supabase direct MIGRATION_DATABASE_URL in .env`, which sends you looking for a missing
# value that is in fact present, correct, and eighteen inches away in the next file along.
#
# The scp line in DEPLOY.md step 3 renames on the way (`scp .env.production root@IP:/opt/doodee/.env`).
# Forgetting the rename is the single most common way to lose the first hour of a deploy, so it
# gets its own message rather than a generic "no .env found".
# --------------------------------------------------------------------------------------------
step "Checking the secrets are here, under the right names"
if [ ! -f "$APP_DIR/.env" ]; then
  if [ -f "$APP_DIR/.env.production" ]; then
    die "there is a .env.production here but no .env — docker compose only ever reads a file called '.env', so this one is being ignored completely. Rename it:  mv $APP_DIR/.env.production $APP_DIR/.env  (the scp in DEPLOY.md step 3 does the rename for you: scp .env.production root@<IP>:$APP_DIR/.env)"
  fi
  die "no .env in $APP_DIR — copy it up from your laptop:  scp .env.production root@<IP>:$APP_DIR/.env"
fi
if [ -f "$APP_DIR/.env.production" ]; then
  warn "both .env and .env.production are in $APP_DIR — only .env is read; delete or move the other one so nobody edits the wrong file later"
fi
ok ".env is present and named .env"

if [ ! -f "$APP_DIR/firebase-service-account.json" ]; then
  die "firebase-service-account.json is missing from $APP_DIR — compose bind-mounts it with create_host_path:false so the stack will refuse to start rather than mount an empty directory in its place. Copy it up:  scp firebase-service-account.json root@<IP>:$APP_DIR/"
fi
ok "firebase-service-account.json is present"

# --------------------------------------------------------------------------------------------
# 4. Preflight, again, here
#
# It was already run on the laptop against .env.production. It runs again because what is on this
# machine is a different file: it travelled over scp, it may have been hand-edited here (DEPLOY.md
# step 4 says to), and the laptop copy may not be the copy that arrived. The check that matters is
# the one performed on the bytes that compose is about to read.
# --------------------------------------------------------------------------------------------
step "Running preflight against $APP_DIR/.env"
if [ ! -f "$APP_DIR/scripts/preflight.sh" ]; then
  die "scripts/preflight.sh is missing from the checkout — is $APP_DIR really this repository?"
fi
if ! bash "$APP_DIR/scripts/preflight.sh" "$APP_DIR/.env" "$APP_DIR/firebase-service-account.json"; then
  die "preflight failed. Nothing has been built or started. Fix $APP_DIR/.env and run this script again — it is safe to re-run."
fi

# The API hostname is read back out of the env file rather than hardcoded, so the verification
# below keeps working on the day this stack is deployed to a different domain. Django's
# CommonMiddleware answers 400 DisallowedHost to any request whose Host header is not in this
# list, healthcheck and curl included, so the loopback probes have to send it too.
API_HOST="${API_HOST:-$(env_get "$APP_DIR/.env" DJANGO_ALLOWED_HOSTS | awk -F, '{print $1}')}"
[ -n "$API_HOST" ] || die "could not read DJANGO_ALLOWED_HOSTS from $APP_DIR/.env"

# --------------------------------------------------------------------------------------------
# 5. Build and start
# --------------------------------------------------------------------------------------------
step "Building and starting the stack"
note "docker compose ${COMPOSE_FILES[*]} up -d --build"
if ! dc up -d --build; then
  printf '\n%slast 40 lines of the migrate container, which is where this usually stops:%s\n' "$C_DIM" "$C_OFF"
  dc logs --tail 40 migrate 2>/dev/null || true
  die "compose up failed. Nothing below ran. The most common causes are a bad DATABASE_URL/MIGRATION_DATABASE_URL and a \$ in a password that was not written as \$\$."
fi
ok "compose up returned"

# --------------------------------------------------------------------------------------------
# 6. Wait for the one-shot migrate container
#
# migrate is its own container on purpose (compose.prod.yaml:41): as a `migrate && gunicorn`
# prefix it would re-run on every api restart, and two api containers restarting together would
# race each other through the same migration. api depends on it with
# service_completed_successfully, so compose has usually already waited by the time `up` returns
# — but "usually" is doing work in that sentence, and a migrate that exited non-zero is the
# difference between a stack that is broken now and a stack that is broken in a way nobody
# noticed until a query hit a column that does not exist.
# --------------------------------------------------------------------------------------------
step "Waiting for migrations to finish"
migrate_deadline=$(( $(date +%s) + MIGRATE_TIMEOUT ))
migrate_code=""
while :; do
  migrate_cid="$(dc ps -aq migrate 2>/dev/null | tail -n1 || true)"
  if [ -n "$migrate_cid" ]; then
    migrate_state="$(docker inspect -f '{{.State.Status}}' "$migrate_cid" 2>/dev/null || echo unknown)"
    case "$migrate_state" in
      exited|dead)
        migrate_code="$(docker inspect -f '{{.State.ExitCode}}' "$migrate_cid" 2>/dev/null || echo 1)"
        break ;;
    esac
  fi
  if [ "$(date +%s)" -ge "$migrate_deadline" ]; then
    bad "migrations did not finish within ${MIGRATE_TIMEOUT}s"
    dc logs --tail 40 migrate 2>/dev/null || true
    die "migrate is still running or never started. A migrate that hangs is usually MIGRATION_DATABASE_URL pointing at the transaction pooler (6543) instead of the direct connection (5432): DDL needs one continuous session and the pooler cannot give it one."
  fi
  sleep 5
done

if [ "$migrate_code" != "0" ]; then
  printf '\n%slast 40 lines of migrate:%s\n' "$C_DIM" "$C_OFF"
  dc logs --tail 40 migrate 2>/dev/null || true
  die "the migrate container exited with code $migrate_code. Nothing downstream of this is trustworthy — the schema is in an unknown state. Read the log above before re-running."
fi
ok "migrations completed"

# --------------------------------------------------------------------------------------------
# 7. Wait for the healthchecks
#
# Three containers take requests and all three have a /healthz probe (compose.prod.yaml). They
# are slow probes — 30s interval, 60s start_period — because each run starts a Python interpreter
# and doing that every five seconds in three containers on a 2 vCPU box costs real CPU to learn
# nothing. That is why this wait is generous.
#
# Worth being clear about what `healthy` buys: Docker (unlike Swarm or Kubernetes) never restarts
# a container for being unhealthy. The probe is a diagnosis, not a cure. Its value is telling
# "gunicorn is dead" apart from "gunicorn is Up and answering nothing", which are the same 502 to
# everyone outside.
# --------------------------------------------------------------------------------------------
step "Waiting for the serving containers to report healthy"
health_deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
for svc in api chat-api legacy-upload-api; do
  while :; do
    cid="$(dc ps -q "$svc" 2>/dev/null | tail -n1 || true)"
    if [ -n "$cid" ]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}nohealthcheck{{end}}' "$cid" 2>/dev/null || echo gone)"
      case "$status" in
        healthy)        ok "$svc is healthy"; break ;;
        nohealthcheck)  warn "$svc has no healthcheck defined; skipping"; break ;;
      esac
      running="$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || echo false)"
      if [ "$running" != "true" ]; then
        bad "$svc is not running"
        dc logs --tail 40 "$svc" 2>/dev/null || true
        die "$svc exited instead of serving. config/wsgi.py calls require_production_services() at import, so a missing DATABASE_URL, REDIS_CACHE_URL or EMAIL_HOST stops gunicorn before it binds — the reason will be in the log above."
      fi
    fi
    if [ "$(date +%s)" -ge "$health_deadline" ]; then
      bad "$svc did not become healthy within ${HEALTH_TIMEOUT}s (last status: ${status:-unknown})"
      dc logs --tail 40 "$svc" 2>/dev/null || true
      break
    fi
    sleep 10
  done
done

# --------------------------------------------------------------------------------------------
# 8. Verification — DEPLOY.md section 9, from the bottom up
#
# Each check removes one layer from the list of things that could be wrong, so they run in order
# and every result is printed whether it passed or not. A deploy where four checks pass and one
# fails is not a deploy that worked; the summary at the end says so.
# --------------------------------------------------------------------------------------------
step "Verifying"

# Layer 1 — Django is up and can reach Supabase. This is the only check that talks to the
# database, and it is first because everything above it is meaningless if the database is not
# reachable from this machine.
if config_out="$(dc exec -T api python manage.py check_production_config 2>&1)"; then
  ok "check_production_config passed (Django is configured for production and can reach Supabase)"
else
  bad "check_production_config failed inside the api container"
  printf '%s%s%s\n' "$C_DIM" "$config_out" "$C_OFF"
fi

# Layer 3, loopback half — is it gunicorn or is it Caddy? Asking the container directly, on the
# port compose publishes to 127.0.0.1, separates "the app is broken" from "the proxy, DNS or TLS
# in front of the app is broken". Doing them in the other order is how an afternoon goes into
# Caddy config for a Django that was never listening.
#
# The Host header is not optional here: with DJANGO_ALLOWED_HOSTS=api.doodee.app, a request
# arriving as Host: 127.0.0.1 is answered 400 DisallowedHost by a completely healthy process.
local_code="$(http_code "http://127.0.0.1:8001/healthz" -H "Host: $API_HOST")"
if [ "$local_code" = "200" ]; then
  ok "GET /healthz on 127.0.0.1:8001 → 200 (gunicorn is serving)"
else
  bad "GET /healthz on 127.0.0.1:8001 → $local_code (expected 200) — this is the app itself, before Caddy is involved"
  [ "$local_code" = "400" ] && note "400 here means DJANGO_ALLOWED_HOSTS does not contain the hostname this probe sent"
fi

# Layer 3, public half — DNS resolves, Caddy has a certificate, Caddy found the upstream, and
# gunicorn reached the view. /healthz deliberately touches no database: it answers "is this
# process alive", not "is Supabase up", which is layer 1's question and was asked once, above.
public_health="$(http_code "https://$API_HOST/healthz")"
if [ "$public_health" = "200" ]; then
  ok "GET https://$API_HOST/healthz → 200"
else
  bad "GET https://$API_HOST/healthz → $public_health (expected 200)"
  case "$public_health" in
    000) note "no HTTP response at all: DNS has not propagated, ufw is blocking 443, Caddy is not running, or the certificate was never obtained. Check: dig +short $API_HOST  and  journalctl -u caddy -n 30 --no-pager" ;;
    502) note "Caddy is up and the container behind it is not answering — but the loopback check above tells you which of the two is at fault" ;;
    400) note "DJANGO_ALLOWED_HOSTS does not contain $API_HOST" ;;
    301|302) note "a redirect loop here usually means Caddy is not sending X-Forwarded-Proto" ;;
  esac
fi

# Layer 3.5 — an unauthenticated request is still refused. 403 rather than 401 because DRF
# downgrades NotAuthenticated to 403 when the authentication class defines no
# authenticate_header(), and FirebaseAuthentication does not define one. A 200 here would mean
# the API is open to anyone; that is the failure this check is looking for.
#
# It is not evidence that authentication works. An expired Firebase service account, a broken
# FirebaseAuthentication and a misconfigured permission class all produce this same 403. It says
# the door is shut, nothing more.
session_code="$(http_code "https://$API_HOST/api/v1/session/")"
if [ "$session_code" = "403" ]; then
  ok "GET https://$API_HOST/api/v1/session/ → 403 (unauthenticated requests are refused)"
elif [ "$session_code" = "200" ]; then
  bad "GET https://$API_HOST/api/v1/session/ → 200 — an unauthenticated request was ANSWERED. Do not leave this running."
else
  bad "GET https://$API_HOST/api/v1/session/ → $session_code (expected 403)"
fi

# Layer 5 — both Celery queues have a consumer.
#
# This is the check that looks least urgent and is not. The two workers consume different queues
# (compose.prod.yaml): `worker` takes cv, `maintenance-worker` takes maintenance and celery. A
# queue with no consumer produces no error anywhere — the upload succeeds, the worker logs
# "ready", and the scan sits at status=queued for ever. It has happened here before, with the
# dev-side worker missing --queues entirely.
#
# The maintenance queue carries cleanup_expired_data, which is the only thing enforcing the
# promise that a minor's face photographs are deleted after 24 hours. Nothing else deletes them,
# and nothing complains if nobody does.
queues_out="$(dc exec -T worker celery -A config inspect active_queues --timeout 20 2>&1 || true)"
for q in cv maintenance; do
  if printf '%s' "$queues_out" | grep -Eq "[\"']name[\"'][[:space:]]*:[[:space:]]*[\"']${q}[\"']"; then
    ok "Celery queue '$q' has a consumer"
  else
    bad "Celery queue '$q' has no consumer — tasks routed there will queue for ever with no error anywhere"
    [ "$q" = "maintenance" ] && note "the maintenance queue runs cleanup_expired_data, the only thing that deletes expired face scans"
  fi
done
if ! printf '%s' "$queues_out" | grep -q "name"; then
  note "no worker replied to celery inspect at all — check: docker compose ${COMPOSE_FILES[*]} logs worker maintenance-worker"
fi

# --------------------------------------------------------------------------------------------
# 9. Summary
# --------------------------------------------------------------------------------------------
printf '\n'
dc ps
printf '\n'

if [ "$failures" -gt 0 ]; then
  printf '%s%d verification check(s) failed. This stack is NOT serving correctly — do not announce it.%s\n' "$C_RED" "$failures" "$C_OFF"
  printf '%sThe containers are left running so you can read the logs:  docker compose %s logs -f%s\n\n' \
    "$C_DIM" "${COMPOSE_FILES[*]}" "$C_OFF"
  exit 1
fi

printf '%sAll verification checks passed.%s\n\n' "$C_GRN" "$C_OFF"
cat <<EOF
Still yours to do — docs/DEPLOY.md has these and this script cannot:

  - create the admin account (interactive, and the password is yours to choose):
      docker compose ${COMPOSE_FILES[*]} exec api python manage.py createsuperuser
    Bank transfers are confirmed in the admin, so without this you cannot take money.
  - Vercel: import the repo with Root Directory at the repo root, set VITE_API_URL and the five
    VITE_FIREBASE_* variables, add doodee.app and www.doodee.app. VITE_* are baked in at build
    time, so changing one needs a redeploy, not a restart.
  - Firebase: Authentication -> Settings -> Authorized domains -> add doodee.app and
    www.doodee.app. Missing this makes the Google login popup close itself with no error.
  - The browser pass in DEPLOY.md section 9, layer 6: sign in, run a real scan on a real phone,
    open https://$API_HOST/admin and confirm it loads WITH its CSS, and check Sentry got an event.
  - Come back in 24 hours and confirm an expired minor's scan is really gone from Supabase
    Storage. It is the one check that cannot be run before the deploy and the worst one to fail.
EOF
exit 0
