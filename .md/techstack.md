# DOODEE — Tech Stack

สรุปจากไฟล์จริงในโปรเจกต์ ณ 2026-08-27 · ทุกเวอร์ชันอ้างจาก `backend/requirements.txt`,
`apps/*/package.json`, `backend/Dockerfile` และ `compose.yaml` — ถ้าตัวเลขไม่ตรง ให้เชื่อไฟล์เหล่านั้น

---

## ภาพรวม

Monorepo แบบ npm workspaces (`package.json` → `workspaces: ["apps/*", "packages/*"]`)
มี 3 ส่วนที่ deploy แยกกัน แต่คุยกันด้วย REST API ตัวเดียว

```
apps/web        Vite + React      → Vercel (static)          localhost:5173
apps/mobile     Expo + RN         → native dev build
backend/        Django + DRF      → Docker (gunicorn)        localhost:8001
packages/shared TypeScript        โค้ดที่ web กับ mobile ใช้ร่วมกัน
api/geo.js      Vercel function   ตรวจประเทศจาก header เพื่อเลือกภาษา
```

Auth เป็น **Firebase token ฝั่งเดียว** — ไม่มี session cookie, ไม่มี CSRF ในเส้นทาง API
Django สร้าง `User` ให้เองตอน request แรกที่มี token (`backend/doodee/authentication.py`)

---

## Backend

| ชั้น | ของที่ใช้ | เวอร์ชัน / หมายเหตุ |
|---|---|---|
| ภาษา | Python | 3.11-slim (`backend/Dockerfile`) |
| Framework | Django | `~=5.2.0` |
| API | Django REST Framework | `>=3.16,<4` |
| CORS | django-cors-headers | `>=4.7,<5` — allow list จาก `CORS_ORIGINS` |
| WSGI | gunicorn | `>=23,<24` · 2 workers, timeout 120 |
| Static | whitenoise | `>=6.8,<7` — gunicorn ไม่เสิร์ฟ static เอง ถ้าไม่มีอันนี้ admin ไม่มี CSS |
| DB | PostgreSQL | 16-alpine · ต่อผ่าน `dj-database-url` + `psycopg2-binary` |
| Cache / Queue | Redis | 7-alpine · db 0 = Celery broker, db 1 = cache |
| Async | Celery | `>=5.5,<6` · worker concurrency 2 |
| Scheduler | Celery beat | งานเดียว: `send_renewal_reminders` ทุก 02:00 |
| Auth | firebase-admin | `>=6.4,<8` — verify ID token ฝั่ง server |
| CV | MediaPipe | `0.10.18` (pin ตรง) · `MEDIAPIPE_DISABLE_GPU=1` |
| CV | opencv-python-headless | `>=4.10,<5` |
| Math | numpy | `>=1.26,<3` |
| LLM | anthropic | `>=0.75,<1` |
| Crypto | cryptography | `>=42,<52` — Fernet เข้ารหัสเลขบัญชีธนาคาร |
| Error report | sentry-sdk[django] | `>=2.20,<3` — ปิดเองถ้าไม่มี `SENTRY_DSN` |

**Locale**: `LANGUAGE_CODE = "th"`, `TIME_ZONE = "Asia/Bangkok"`, `USE_TZ = True`

**Admin site แทนที่ของ Django**: `INSTALLED_APPS` ใส่ `doodee.admin_apps.DoodeeAdminConfig`
ไม่ใช่ `django.contrib.admin` เพื่อให้หน้าแรกมีภาพรวมระบบ และมีหน้า `/admin/reports/`
กับ `/admin/marketing/` เพิ่มเข้ามาผ่าน `DoodeeAdminSite.get_urls()`

**สังเกต**: ไม่มี `django.contrib.admin` และไม่มี `django.contrib.humanize` ใน `INSTALLED_APPS`
ตัวจัดรูปเงินเขียนเองที่ `backend/doodee/templatetags/doodee_money.py` (filter `satang`)

---

## Frontend (web)

| ชั้น | ของที่ใช้ | เวอร์ชัน |
|---|---|---|
| Build | Vite | `^8.1.1` + `@vitejs/plugin-react` `^6.0.3` |
| UI | React / React DOM | `^19.2.7` |
| Router | react-router-dom | `7.18.2` (pin ตรง) |
| Data fetching | @tanstack/react-query | `^5.90.2` |
| Auth | firebase (client SDK) | `^12.17.0` · `signInWithPopup` ไม่ใช่ redirect |
| CV บนเบราว์เซอร์ | @mediapipe/tasks-vision | `0.10.35` (pin ตรง) — FaceLandmarker ใน Web Worker |
| Icon | lucide-react | `^1.26.0` |
| Export ภาพ | html-to-image | `^1.11.13` |
| Lint | oxlint | `^1.71.0` |
| Types | TypeScript (`tsc --noEmit`) | `@types/react` `^19.2.17` |
| Test | `node:test` + `--experimental-strip-types` | ไม่มี Jest/Vitest |

**หมายเหตุเรื่อง test**: `node:test` **ไม่ auto-discover** ไฟล์ — ต้องเติมชื่อไฟล์ใหม่เข้าไปใน
script `test` ของ `apps/web/package.json` เอง ไม่งั้นเทสต์ไม่ถูกรันและไม่มีใครรู้

**ไฟล์ที่เป็น `.jsx`/`.js` ปนกับ `.tsx`/`.ts`** — ไม่ได้แปลงทั้งหมด ตั้งใจปน

---

## Frontend (mobile)

| ชั้น | ของที่ใช้ | เวอร์ชัน |
|---|---|---|
| Framework | Expo | `~57.0.0` |
| RN | react-native | `0.86.0` · react `19.2.3` |
| Routing | expo-router | `~57.0.2` |
| Auth | expo-auth-session + firebase | `~57.0.5` / `^12.4.0` |
| กล้อง | react-native-vision-camera | `5.1.1` + face-detector `2.0.6` + resizer + worklets |

**รันใน Expo Go ไม่ได้** — VisionCamera เป็น native module ต้อง `expo run:ios` / `run:android`

---

## บริการภายนอก

| บริการ | ใช้ทำอะไร | ที่อยู่ในโค้ด |
|---|---|---|
| **Firebase Authentication** | ตัวตนผู้ใช้ทั้งระบบ (Google + email/password) | `authentication.py`, `lib/firebase.js` |
| **Supabase Postgres + Storage** | ฐานข้อมูล managed และภาพใน private bucket `face-scans` | `DATABASE_URL`, `backend/doodee/storage.py` |
| **OpenAI GPT-5.6 Luna** | DOODEE Chat production · reasoning low · 1,000 output tokens | `backend/doodee/chat.py` |
| **Anthropic / OpenAI-compatible** | provider สำรองที่เลือกได้จาก `/admin` โดยไม่มี automatic failover | `chat.py` |
| **Opn Payments (Omise)** | PromptPay + webhook · secret key ไม่เคยอยู่ในไฟล์ที่ commit | `backend/doodee/omise.py` |
| **Sentry** | error report · ปิดเองถ้าไม่มี DSN | `config/settings.py` |
| **Vercel** | host `apps/web` + edge function ตรวจประเทศ | `vercel.json`, `api/geo.js` |

---

## สถาปัตยกรรมที่ควรรู้ก่อนแก้

**1. การวิเคราะห์ใบหน้ารันเองทั้งหมด ไม่ส่งภาพออกนอกระบบ**
MediaPipe + OpenCV ทำงานใน Celery worker ของเราเอง ไม่มี image API ภายนอก
ส่วนแชทส่งแค่ตัวเลขที่วัดได้ ไม่เคยส่งภาพ

**2. ภาพมีวันหมดอายุ**
ผู้ใหญ่ 30 วัน / ผู้เยาว์ 24 ชั่วโมง · ลบด้วย `manage.py cleanup_expired_data` (ต้องรันทุกชั่วโมงบน production)
ผลวิเคราะห์ยังอยู่หลังภาพถูกลบ — dashboard ต้องรับสภาพนี้ได้

**2.1 งานภาพไม่รันใน API**
client ใหม่ขอ signed upload ที่ `POST /scans/uploads/`, อัปโหลดตรงเข้า private Storage แล้ว `commit`
ทั้ง scan และ preview/saved simulation รันในคิว `cv`; ฐานข้อมูลเป็น source of truth และ maintenance worker
นำงาน queued/stuck กลับเข้าคิวทุกนาที งานใหม่ถูกหยุดเมื่อคิวถึง 100 หรือรายการเก่าสุดรอเกิน 10 นาที

**2.2 Production แยก failure domain**
`compose.prod.yaml` แยก Redis broker แบบ AOF ออกจาก Redis cache, แยก `cv` worker จาก maintenance worker
และมี process lane สำหรับ chat (`127.0.0.1:8002`) กับ multipart scan เก่า (`127.0.0.1:8003`)
reverse proxy ต้อง route `/api/v1/chat/` ไป 8002 และเฉพาะ `POST /api/v1/scans/` ไป 8003; ที่เหลือไป 8001
Supabase Storage ต้องอนุญาต CORS `PUT` จาก origin ของ web app และคง bucket เป็น private
ถ้าไม่ได้ใช้ Supabase Data API ให้ปิด exposure ของ schema ที่ Django ใช้; migration ใช้ direct URI
(`MIGRATION_DATABASE_URL`) ส่วน runtime ใช้ pooler URI (`DATABASE_URL`) เท่านั้น

**3. ตัวเลขในรายงานคำนวณสดทุกครั้ง**
`backend/doodee/analytics.py` ไม่มีตารางสรุปและไม่มี nightly rollup โดยเจตนา
ข้อยกเว้นเดียวคือ `Visit` ซึ่งเป็นตัวนับ ไม่ใช่สรุปของตารางอื่น

**4. Endpoint ที่ไม่ต้องล็อกอินมี 2 อันเท่านั้น**
`POST /api/v1/webhooks/omise/` (ตรวจ HMAC แทน) และ `POST /api/v1/visit/` (ตัวนับผู้เข้าชม)
นอกนั้น DRF default = `IsAuthenticated` ทั้งหมด

**5. ห้ามให้ตัวนับผู้เข้าชมผ่าน `lib/api.js`**
`request()` เรียก `signInAnonymously()` เองถ้าไม่มีคนล็อกอิน แล้ว server จะสร้าง Django user จริง
`lib/visit.js` จึงใช้ `fetch` ดิบ ไม่ใส่ header `Authorization`

**6. เงินเป็น satang (integer) เสมอ**
ไม่มีที่ไหนเก็บหรือส่งเป็นทศนิยม แปลงเป็นบาทตอนแสดงผลเท่านั้น

---

## คำสั่งที่ใช้จริง

```bash
# รันทั้งระบบ
cp .env.example .env
docker compose up --build        # postgres, redis, api, worker, beat
npm install
npm run dev:web                  # http://localhost:5173

# แก้ tasks.py หรือ simulation_engine.py แล้วต้องสั่งเอง — worker ไม่ reload
docker compose restart worker

# ตรวจก่อน commit
docker compose exec api python manage.py test doodee     # 521 tests
npm run test:web                                          # 149 tests
npm run test:shared
npm run build:web
npm run lint --workspace @doodee/web
npm run typecheck --workspace @doodee/mobile
```

**Port**: web `5173` · Django `8001` (host) → `8000` (container) · Postgres/Redis ไม่ publish ออกมา

---

## สิ่งที่ยังไม่มี

- ไม่มี CI/CD pipeline ใน repo (ไม่มี `.github/workflows/`)
- ไม่มีเอกสารนโยบายความเป็นส่วนตัวจริง — `LoginPage.tsx` ยังลิงก์ `href="#privacy"` ที่ว่างเปล่า
  ทั้งที่ระบบเก็บข้อมูลชีวมิติและ `UserAttribution` แล้ว
- `main.py` ที่ root กับ `pyproject.toml` (`requires-python = ">=3.14"`, `dependencies = []`)
  ไม่ได้ใช้กับ backend จริง — backend ใช้ `backend/requirements.txt` บน Python 3.11
  `.venv` ที่ root ว่างเปล่า ใช้งานไม่ได้ ต้องรันผ่าน Docker
- ยังไม่ผ่าน clinician review / security review / validation study
  ต้องคง `SIMULATION_ENABLED=false` จนกว่าจะครบ (ดู README)
