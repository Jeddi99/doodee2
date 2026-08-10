# Doodee

Django/Python backend, Vite web app, and Expo mobile app for consent-based seven-view facial measurements and bounded, watermarked procedure simulation. Results are educational pre-consultation information, not diagnosis or a prediction of surgical outcome.

## Run locally

Requirements: Python 3.11, Node.js 22+, Docker.

```bash
cp .env.example .env
docker compose up --build
npm install
npm run dev:web
```

Editing backend code reloads the API automatically. The Celery worker does not reload, so run `docker compose restart worker` after changing `tasks.py` or `simulation_engine.py` — otherwise saved simulations keep rendering with the code the worker booted with.

Configure Firebase Authentication and a private Supabase `face-scans` bucket in `.env`. Simulations run locally with MediaPipe and OpenCV; no external image provider is used. Redis database 1 stores short-lived preview locks and fair-use counters. The web app runs at `http://localhost:5173`; Django runs at `http://localhost:8001`.

Free accounts receive three simulation previews per month. To grant unlimited member previews, assign the Django user to the `pro_member` or `clinic_partner` group in Django Admin. This repository does not implement checkout or payment webhooks.

For mobile, set the `EXPO_PUBLIC_*` values and create a native development build (VisionCamera does not run in Expo Go):

```bash
npm run ios --workspace @doodee/mobile
# or: npm run android --workspace @doodee/mobile
```

## Verify

```bash
cd backend && ../.venv/bin/python manage.py test doodee
cd .. && npm run build:web
npm run test:shared
npm run typecheck --workspace @doodee/mobile
```

Run the retention job hourly in production:

```bash
cd backend && python manage.py cleanup_expired_data
```

Before public medical use, complete clinician review, security/privacy review, and the planned validation study. Keep `SIMULATION_ENABLED=false` until those gates and production credentials are ready.
