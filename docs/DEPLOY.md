# ขึ้น production — doodee.app

`SETUP.md` จบที่ "รันบนเครื่องตัวเองได้" เอกสารนี้รับช่วงต่อจากตรงนั้น

**อย่าเริ่มเอกสารนี้จนกว่า `npm run doctor` บนเครื่องตัวเองจะผ่านครบ** ปัญหาที่แก้ได้ใน 2 นาทีบนเครื่องตัวเอง
จะกลายเป็นการไล่หาสาเหตุครึ่งวันเมื่อมี TLS, DNS, reverse proxy และ CORS มาบังหน้าพร้อมกันสี่ชั้น

---

## หน้าตาของระบบเมื่อขึ้นแล้ว

```
เบราว์เซอร์
   │
   ├── https://doodee.app ─────────────► Vercel (React build จาก apps/web)
   │
   └── https://api.doodee.app ─────────► VPS: Caddy :443
                                            │  (TLS จบที่นี่ ต่อไปเป็น HTTP บน loopback)
                                            ├── /api/v1/chat/*   → 127.0.0.1:8002  chat-api
                                            ├── POST /api/v1/scans/ → 127.0.0.1:8003  legacy-upload-api
                                            └── ทุกอย่างที่เหลือ + /admin → 127.0.0.1:8001  api
                                                    │
                                    Supabase Postgres (สิงคโปร์) + Supabase Storage
                                    Redis + Redis cache (ในเครื่อง VPS)
```

**frontend กับ backend อยู่คนละที่ คนละโดเมน** — นั่นคือเหตุผลที่ `CORS_ORIGINS` สำคัญมากบน production
ทั้งที่บนเครื่องตัวเองแทบไม่ต้องคิดถึงมันเลย

---

## ⚠️ สามอย่างที่พังบ่อยที่สุดตอน deploy ครั้งแรก

> **1. `.app` ไม่มี http ให้ถอยกลับไป**
>
> `.app` อยู่ใน HSTS preload list ของเบราว์เซอร์ทุกตัว เบราว์เซอร์จะเปลี่ยน `http://` เป็น `https://`
> **ก่อน** ส่ง request ออกไปด้วยซ้ำ ถ้า TLS ยังไม่พร้อม เว็บจะเปิดไม่ได้เลย ไม่ใช่แค่ขึ้นเตือนว่าไม่ปลอดภัย
>
> แปลว่า A record ต้องชี้ถูกและ Caddy ต้องขอใบรับรองสำเร็จ **ก่อน** จะทดสอบอะไรได้ทั้งสิ้น

> **2. เข้า `/admin` แล้วขึ้น CSRF verification failed**
>
> Caddy ปิด TLS แล้วส่งต่อเป็น HTTP ธรรมดา Django จึงคิดว่า request ไม่ปลอดภัยและปฏิเสธฟอร์ม login
> `settings.py` แก้ไว้แล้วด้วย `SECURE_PROXY_SSL_HEADER` + `CSRF_TRUSTED_ORIGINS`
> ที่ตั้งค่าอัตโนมัติจาก `DJANGO_ALLOWED_HOSTS`
>
> **ถ้ายังเจออาการนี้ แปลว่า `DJANGO_ALLOWED_HOSTS` ไม่มี `api.doodee.app`** — API จะยังทำงานปกติทุกอย่าง
> เพราะใช้ bearer token ไม่มี CSRF มีแต่หน้าแอดมินที่พัง ซึ่งทำให้เข้าใจผิดว่า "ระบบดีอยู่"

> **3. `docker compose -f compose.prod.yaml up` เฉย ๆ = ผิด**
>
> `compose.prod.yaml` เป็น **overlay** ไม่ใช่ไฟล์เดี่ยว ต้องใช้คู่กับ `compose.yaml` เสมอ:
>
> ```sh
> docker compose -f compose.yaml -f compose.prod.yaml up -d --build
> ```
>
> รันเดี่ยวจะขาด service ครึ่งหนึ่ง รันแต่ `compose.yaml` อย่างเดียวจะได้ development config
> บน production — bind-mount โค้ดจาก host, gunicorn `--reload`, และเปิดพอร์ตออกอินเทอร์เน็ต

---

# 1. ก่อนเริ่ม — เตรียมให้ครบ

- [ ] `npm run doctor` บนเครื่องตัวเองผ่านครบ (ยกเว้น omise)
- [ ] Supabase project สิงคโปร์ + bucket `face-scans` แบบ private
- [ ] **Supabase connection string สองเส้น** จาก Project Settings → Database:
      **Session pooler** URI → `DATABASE_URL` · **Direct connection** URI → `MIGRATION_DATABASE_URL`
      (compose.prod บังคับให้มีทั้งคู่ ไม่มีแล้วไม่ยอมขึ้น)
- [ ] `firebase-service-account.json` ของ project ใหม่
- [ ] VPS Ubuntu 24.04 สิงคโปร์ **2GB ก็พอ, 4GB สบาย** (ดู "เครื่องต้องใหญ่แค่ไหน" ท้ายไฟล์) · จด public IP
- [ ] A record `api.doodee.app` → IP ของ VPS (ตั้งไว้ล่วงหน้าแล้วรอ DNS กระจาย)

ตรวจว่า DNS พร้อมจริงก่อนไปต่อ:

```sh
dig +short api.doodee.app          # ต้องได้ IP ของ VPS ไม่ใช่ค่าว่าง
```

---

# 2. ตั้งเครื่อง VPS

```sh
ssh root@<IP>

# Docker
curl -fsSL https://get.docker.com | sh

# Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# ไฟร์วอลล์ — เปิดสามพอร์ตนี้เท่านั้น
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```

> พอร์ต 8001/8002/8003 **ไม่ต้องเปิด** `compose.prod.yaml` bind ไว้ที่ `127.0.0.1` อยู่แล้ว
> ถ้าเปิดพอร์ตพวกนี้ออกอินเทอร์เน็ต = Django แบบไม่เข้ารหัสเปิดโล่งข้าม Caddy ไปเลย

---

# 3. ส่งโค้ดและความลับขึ้นเครื่อง

**โค้ดมาทาง git ความลับมาทาง scp** — สองช่องทางแยกกันจริง ๆ ไม่ใช่แค่พูดว่าแยก

```sh
# บน VPS — repo เป็น public ไม่ต้องใช้ token
git clone -b main https://github.com/Jeddi99/doodee2 /opt/doodee
```

```sh
# บนเครื่องตัวเอง — ความลับสองไฟล์นี้ไม่มีใน git และต้องไม่มีวันมี
scp .env.production root@<IP>:/opt/doodee/.env
scp firebase-service-account.json root@<IP>:/opt/doodee/
```

> **สังเกตชื่อปลายทาง: `.env` ไม่ใช่ `.env.production`**
> `docker compose` อ่านไฟล์ชื่อ `.env` ในโฟลเดอร์โปรเจกต์เท่านั้น ไม่เคยอ่าน `.env.production`
> ไฟล์ที่เตรียมไว้อย่างดีจะไม่มีผลอะไรเลยถ้าวางผิดชื่อ และจะเห็นเป็น
> `set the Supabase direct MIGRATION_DATABASE_URL in .env` ทั้งที่ค่ามันอยู่ในไฟล์ข้าง ๆ

> **เหตุผลที่ใช้ `git clone` แทน `rsync`** — สองข้อ:
> `rsync -av "./"` จะกวาด `.env` และ `firebase-service-account.json` ไปด้วยโดยไม่ต้องสั่ง (มันไม่รู้จัก
> `.gitignore`) การอ้างว่า "ความลับส่งแยก" จึงเป็นเท็จ · และ `--exclude .git` ทำให้ `/opt/doodee`
> ไม่ใช่ repo แปลว่าไม่มีทางถอยกลับด้วย git ตอนที่ต้องการมันที่สุด

---

# 4. `.env` ฝั่ง production — ต่างจากเครื่องตัวเอง

บน VPS แก้ `/opt/doodee/.env` ให้ต่างจากของเดิมตรงนี้:

```sh
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=api.doodee.app
CORS_ORIGINS=https://doodee.app,https://www.doodee.app
DATABASE_URL=<Supabase transaction pooler URI — พอร์ต 6543>
MIGRATION_DATABASE_URL=<Supabase direct URI — พอร์ต 5432>
DEMO_SCANS_ENABLED=false
REDEEM_CODES_ENABLED=false
SKIN_VISION_ENABLED=false
SIMULATION_ENABLED=<ดูคำเตือนด้านล่าง>
SENTRY_ENVIRONMENT=production
VITE_API_URL=https://api.doodee.app/api/v1
```

> `DJANGO_SECRET_KEY` ต้องเป็นค่าใหม่ที่สุ่มมา ไม่ใช่ `replace-me` และไม่ใช่ค่าเดียวกับเครื่องตัวเอง
> `python3 -c "import secrets; print(secrets.token_urlsafe(50))"`

**`CORS_ORIGINS` ต้องเป็น `https://` และห้ามมี `/` ปิดท้าย** — เทียบแบบตรงตัวอักษรกับ `Origin` header
ที่เบราว์เซอร์ส่งมา ผิดตัวเดียวก็ block

> **⚠️ รหัสผ่านที่มี `$` จะถูกกินหายไปเงียบ ๆ**
>
> `docker compose` ขยายตัวแปรใน `.env` ก่อนใช้ — รหัส `p$ssw0rd` จะกลายเป็น `p` เพราะ `$ssw0rd`
> ถูกอ่านเป็นชื่อตัวแปรที่ไม่มีค่า รหัสผ่านที่ Supabase สุ่มมามี `$` บ่อยมาก
>
> เขียน `$` เป็น `$$` ใน `.env` — อาการถ้าลืมคือ Postgres ปฏิเสธรหัสผ่าน ซึ่งหน้าตาเหมือน
> "คัดลอกรหัสมาผิด" ทุกประการ และจะไล่หาผิดทางอยู่นาน

> **ทำไม transaction pooler ไม่ใช่ session pooler**
>
> `settings.py:68` ตั้ง `conn_max_age=60` — แต่ละ thread ที่แตะ DB ยึด connection ไว้ ทั้ง stack
> เปิดราว 60 thread (`api` 3×8, `chat-api` 2×15, `legacy-upload-api` 1×2, celery และ beat อีก 4)
> แต่ Supabase ขนาด Nano ให้ pool แค่ **15**
>
> transaction pooler คืน connection ให้ pool ทุกครั้งที่จบ transaction แทนที่จะยึดไว้ทั้ง session
> จึงรับ 60 thread ได้ · `settings.py` ตั้ง `disable_server_side_cursors=True` มาคู่กันแล้ว
> เพราะ cursor ฝั่งเซิร์ฟเวอร์อยู่ข้ามคำสั่งไม่ได้ในโหมดนี้
>
> **แต่ migration ต้องใช้ direct URI** — DDL ต้องการ session เดียวต่อเนื่อง

---

# 5. Caddy

```sh
cp /opt/doodee/Caddyfile /etc/caddy/Caddyfile
mkdir -p /var/log/caddy
# caddy รันเป็น user `caddy` ไม่ใช่ root — ไม่ chown ให้ มันเขียนไฟล์ log ไม่ได้
# แล้ว config โหลดไม่ผ่าน แล้ว reload ถูกปฏิเสธ โดย error ไปชี้ที่บล็อก log ไม่ใช่ที่สิทธิ์
chown caddy:caddy /var/log/caddy
caddy validate --config /etc/caddy/Caddyfile     # ต้องขึ้น "Valid configuration"
systemctl reload caddy
```

Caddy จะขอใบรับรอง Let's Encrypt เองภายในไม่กี่วินาที ดูว่าสำเร็จไหม:

```sh
journalctl -u caddy -n 30 --no-pager | grep -i "certificate obtained"
```

---

# 6. ขึ้นระบบ

```sh
cd /opt/doodee
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
```

ลำดับที่ compose จัดให้เอง: `redis` + `redis-cache` พร้อม → `migrate` รัน **ครั้งเดียวจนจบ**
→ แล้ว `api`, `chat-api`, `legacy-upload-api`, `worker`, `maintenance-worker`, `beat` จึงเริ่ม

> migrate แยกเป็น container ของตัวเองโดยตั้งใจ ไม่ได้เป็น `migrate && gunicorn` เหมือน dev
> เพราะทุกครั้งที่ api restart มันจะ migrate ซ้ำ และถ้า restart พร้อมกันสองตัวจะแย่งกันเอง

```sh
docker compose -f compose.yaml -f compose.prod.yaml exec api python manage.py createsuperuser
```

---

# 7. Vercel

1. Import repo → **Root Directory ต้องเป็นรากของ repo ไม่ใช่ `apps/web`**
   `vercel.json` ที่รากตั้ง `buildCommand: npm run build:web` และ `outputDirectory: apps/web/dist`
   ไว้ให้แล้ว ไม่ต้องกรอกเอง แค่ปล่อยให้ Vercel อ่านไฟล์นั้นเจอ — ถ้าตั้ง root เป็น `apps/web`
   มันจะอ่านไม่เจอและ build ผิด เพราะ workspace `@doodee/shared` อยู่นอกโฟลเดอร์นั้น
2. Environment Variables ใส่ให้ครบ — **Vercel ไม่ได้อ่าน `.env` ในเครื่องคุณ**:
   `VITE_API_URL=https://api.doodee.app/api/v1` และ `VITE_FIREBASE_*` ทั้ง 5 ตัว
3. Domains → เพิ่ม `doodee.app` และ `www.doodee.app`

> `VITE_*` ถูกฝังลง bundle **ตอน build** ไม่ใช่ตอนรัน แก้ค่าใน Vercel แล้วต้อง **redeploy** ถึงจะมีผล
> นี่คือเหตุผลเดียวกับที่ `VITE_OMISE_PUBLIC_KEY` เปิดเผยได้แต่ `OMISE_SECRET_KEY` ไม่ได้ —
> อะไรที่ขึ้นต้นด้วย `VITE_` คือของที่อยู่ในมือผู้ใช้ทุกคนที่เปิดเว็บ

# 8. Firebase

Authentication → Settings → **Authorized domains** → เพิ่ม `doodee.app` และ `www.doodee.app`
ไม่ใส่ = popup login เด้งขึ้นมาแล้วปิดตัวเองทันทีโดยไม่มี error ให้เห็น

---

# 9. ตรวจทีละชั้น

ไล่จากล่างขึ้นบน อย่าข้าม — แต่ละคำสั่งตัดความเป็นไปได้ออกไปหนึ่งชั้น

```sh
# ชั้น 1 — Django ขึ้นและต่อ Supabase ได้
docker compose -f compose.yaml -f compose.prod.yaml exec api \
  python manage.py check_production_config          # → Production configuration OK

# ชั้น 2 — บริการภายนอกต่อติดจากบน VPS
docker compose -f compose.yaml -f compose.prod.yaml exec api \
  python manage.py check_services

# ชั้น 3 — Caddy + TLS + routing
curl -I https://api.doodee.app/api/v1/session/      # → HTTP/2 403
```

**`403` คือผลลัพธ์ที่ถูกต้อง** แปลว่า TLS ผ่าน, Caddy หาปลายทางเจอ, Django ตอบ, และ auth ทำงาน
(ไม่มี token ก็ต้องถูกปฏิเสธ) — ถ้าได้ `200` ต่างหากที่น่ากลัว

> **ทำไม 403 ไม่ใช่ 401** ซึ่งเป็นสิ่งที่ทุกคนคาดหวังจาก endpoint ที่ต้องล็อกอิน:
> DRF จะตอบ 401 ก็ต่อเมื่อ authentication class มีเมธอด `authenticate_header()` ที่บอกได้ว่าจะขอ
> credential แบบไหนกลับมา (ไปเป็นหัวข้อ `WWW-Authenticate`) — `FirebaseAuthentication`
> (`backend/doodee/authentication.py`) ไม่ได้นิยามไว้ DRF จึงลด `NotAuthenticated` เป็น 403 ตามสเปก
> ถ้าอยากได้ 401 ต้องเพิ่มเมธอดนั้น ไม่ใช่แก้ที่ Caddy

| ผลที่ได้ | ชั้นที่พัง |
|---|---|
| `could not resolve host` | DNS — A record ยังไม่กระจาย |
| ค้างแล้ว timeout | ufw ปิด 443 หรือ Caddy ไม่ได้รัน |
| `502 Bad Gateway` | Caddy ทำงาน แต่ container ปลายทางตาย → `docker compose logs api` |
| `400 Bad Request` | `DJANGO_ALLOWED_HOSTS` ไม่มี `api.doodee.app` |
| `403` | ✅ ถูกต้อง |

```sh
# ชั้น 4 — chat เข้าพอร์ตแยกจริงไหม
docker compose -f compose.yaml -f compose.prod.yaml logs chat-api --tail 20

# ชั้น 5 — beat ยิงงานลบภาพหมดอายุจริงไหม
# `cleanup-expired-data` ต้องโผล่ในตารางตอน beat บูต และต้องยิงจริงทุกต้นชั่วโมง
docker compose -f compose.yaml -f compose.prod.yaml logs beat | grep cleanup-expired-data
docker compose -f compose.yaml -f compose.prod.yaml logs maintenance-worker | grep cleanup_expired_data
```

> **ข้อนี้สำคัญกว่าที่หน้าตามันดู** — `Scan.expires_at` คือคำสัญญาที่ผลิตภัณฑ์ให้ไว้ว่า
> ภาพใบหน้าจะถูกเก็บ 30 วัน (ผู้ใหญ่) และ 24 ชั่วโมง (ผู้เยาว์) และ**ไม่มีอย่างอื่นบังคับมันเลย**
> ถ้า beat ไม่ยิงงานนี้ ภาพจะอยู่ตลอดไปโดยไม่มีอะไรฟ้อง
>
> เคยเป็นแบบนั้นมาแล้ว: คำสั่ง `cleanup_expired_data` เขียนไว้ครบและมีเทสต์ แต่ไม่มีอะไรตั้งเวลาให้เลย
> จนกระทั่งเพิ่มเข้า `CELERY_BEAT_SCHEDULE` — จึงต้องตรวจข้อนี้ทุกครั้งที่ deploy ใหม่

**ชั้น 6 — จากเบราว์เซอร์จริง**

1. `https://doodee.app` โหลดขึ้น มีกุญแจ
2. Sign in with Google → เข้า dashboard ได้
3. เปิด Network tab → เห็น `Authorization: Bearer eyJ…` ยิงไป `api.doodee.app` ได้ **200**
4. `/scan` ถ่าย 3 มุมบนมือถือจริง → ได้ผลวิเคราะห์
5. Chat พิมพ์คำถาม → ได้คำตอบ
6. `https://api.doodee.app/admin` → login ได้ **และมี CSS ครบ** (ไม่มี CSS = whitenoise/collectstatic พัง)
7. Sentry เห็น event แรก
8. `/assessment` ขึ้น findings + กราฟการกระจาย + mesh
9. จำลองหัตถการหนึ่งรายการ → ภาพที่ได้**มีลายน้ำ "EDUCATIONAL SIMULATION"** มุมขวาล่าง

> `Cannot reach the API` บนหน้าเว็บมีสองสาเหตุที่หน้าตาเหมือนกันเป๊ะ: **CORS block** กับ **เซิร์ฟเวอร์ตาย**
> แยกได้ที่ Network tab เท่านั้น — CORS จะเห็น request ที่ status `(failed)` พร้อม error CORS ใน console
> ส่วนเซิร์ฟเวอร์ตายจะไม่มี response เลย

---

> **ตรวจอีกครั้งหลังผ่านไป 24 ชั่วโมง** — สแกนของผู้เยาว์ที่หมดอายุต้องหายจาก Supabase Storage จริง
> นี่คือข้อเดียวที่ทดสอบก่อน deploy ไม่ได้ และเป็นข้อที่ผิดแล้วเสียหายที่สุด

---

# 10. ขายของวันแรก — โอนเงิน

ยังไม่ต้องมี Stripe หรือ Omise ระบบรองรับอยู่แล้ว:

ผู้ใช้กดสั่งซื้อ → ได้ `Order` สถานะ pending (`provider="manual"`) → โอนเงินมา →
คุณเข้า `/admin` → Orders → ยืนยัน → สิทธิ์ขึ้นทันที

**ต้องเข้า `/admin` ได้ ไม่งั้นเก็บเงินไม่ได้เลย** — นี่คือเหตุผลที่ข้อ 2 ในหัวข้อ "สามอย่างที่พังบ่อย"
สำคัญกว่าที่ดูเผิน ๆ

---

# ถอยกลับเมื่อพัง

ใช้ได้เพราะข้อ 3 ใช้ `git clone` — `/opt/doodee` เป็น repo จริง มี history ให้ถอย

```sh
cd /opt/doodee
docker compose -f compose.yaml -f compose.prod.yaml down
git log --oneline -5              # หา commit ที่รู้ว่าดี
git checkout <commit ก่อนหน้า>
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
```

`.env` กับ `firebase-service-account.json` ไม่ถูกแตะเพราะไม่ได้อยู่ใน git — `git checkout` ไม่ทับให้

ฐานข้อมูลอยู่ที่ Supabase ไม่ได้อยู่ในเครื่อง — ลบ container ทิ้งข้อมูลไม่หาย
แต่ **migration ไม่ถอยกลับเอง** ถ้า deploy ที่พังมี migration ต้องถอยด้วย `migrate doodee <หมายเลขก่อนหน้า>`
โดยชี้ `DATABASE_URL` ไปที่ **direct URI** ชั่วคราว ไม่ใช่ pooler

---

# เครื่องต้องใหญ่แค่ไหน — วัดแล้ว

เดิมไฟล์นี้เขียนว่า 8GB โดยไม่มีการวัดรองรับ นี่คือตัวเลขจริง

**วิธีวัด** — sample `docker stats` ทุกวินาที ระหว่างสั่ง render จริงหกครั้ง สองเธรดพร้อมกัน
(ตรงกับ `--concurrency=2` ของ worker บน production) ที่ `max_side=1280`:

```sh
while true; do docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'; sleep 1; done
```

| container | idle | peak ตอน render |
|---|---:|---:|
| `worker` (render สามมุม ×2 พร้อมกัน) | 238 MiB | **375 MiB** |
| `api` (ตอนเป็นตัว render เอง) | 253 MiB | **452 MiB** |
| `beat` | 122 MiB | 122 MiB |
| `redis` | 11 MiB | 11 MiB |
| **dev stack รวม** | **679 MiB** | **752 MiB** |

การ render สามมุมหนึ่งครั้งกิน **~140–200 MiB** เหนือ idle · สองงานพร้อมกันไม่ได้กินสองเท่า
เพราะโมเดล fused กับ mediapipe ใช้ร่วมกัน

**ประมาณการของ production** (ไม่ใช่ผลวัด — prod overlay ต้องต่อ Supabase จึงรันในเครื่องไม่ได้)
โทโพโลยีจริงมี 8 คอนเทนเนอร์ ตัด `postgres` ออก (ใช้ Supabase) แล้วเพิ่ม `chat-api`,
`legacy-upload-api`, `maintenance-worker`, `redis-cache`:

```
api 452 + chat-api ~250 + legacy-upload ~200 + worker 375
  + maintenance-worker ~240 + beat 122 + redis 11 + redis-cache ~10   ≈ 1.7 GiB peak
```

**สรุป: 2GB คือขั้นต่ำที่ใช้ได้จริง · 4GB คือสบาย · 8GB ที่เขียนไว้เดิมเกินไปประมาณ 5 เท่า**

> เลขนี้มีผลกับกระเป๋าเงินโดยตรง — 8GB ที่สิงคโปร์ราว $48/เดือน ส่วน 2GB ราว $12
> ถ้าวันหนึ่งย้ายออกจาก Oracle Always Free ให้ใช้ตารางนี้เลือกขนาด ไม่ใช่เลขที่เดาไว้
