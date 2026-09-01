# ต่อ API ทุกตัวจากศูนย์

คู่มือนี้พาตั้งค่าโปรเจกต์ DOODEE ตั้งแต่เครื่องเปล่าจนสแกนหน้าได้จริง

ทุกบริการตอบคำถามเดียวกัน 4 ข้อ: **ใช้ทำอะไร · ไม่มีแล้วเป็นยังไง · เอาคีย์มาจากไหน · เช็คยังไง**

---

## เช็คสถานะก่อนเสมอ

```sh
npm run doctor
```

ยิงเรียกทุกบริการจริง ไม่ใช่แค่ดูว่ามีคีย์ไหม แล้วบอกว่าตัวไหนพังพร้อมวิธีแก้ ไม่พิมพ์ค่าคีย์ออกมา

รันทุกครั้งที่แก้ `.env` และก่อนจะสงสัยว่าโค้ดพัง

```sh
npm run doctor -- --only supabase      # ตรวจเฉพาะตัวเดียว
```

---

## ⚠️ กับดักที่ทำให้เสียเวลามากที่สุด

> **`docker compose restart` ไม่โหลด `.env` ใหม่**

`restart` แค่รันโปรเซสเดิมด้วย environment เดิม คีย์ที่คุณเพิ่งเพิ่มจะ **ไม่เข้าไปในคอนเทนเนอร์**
และ `npm run doctor` จะยังบอกว่า "ยังไม่ได้ตั้ง" ทั้งที่คุณเห็นมันอยู่ในไฟล์ตรงหน้า

```sh
docker compose up -d        # ← แก้ .env แล้วใช้อันนี้
```

เคสจริงในโปรเจกต์นี้: `GEMINI_API_KEY` ถูกเพิ่มตอน 16:09 แต่คอนเทนเนอร์สร้างตอน 11:58
แชทเลยดูเหมือนไม่ได้ตั้งค่าอยู่หลายวัน ทั้งที่คีย์ถูกต้องมาตลอด

ตรวจว่าคอนเทนเนอร์เห็นค่าจริงไหม (ไม่โชว์ค่า):

```sh
docker compose exec api sh -c '[ -n "$GEMINI_API_KEY" ] && echo มีแล้ว || echo ยังว่าง'
```

> **อย่าเขียน `echo $GEMINI_API_KEY`** ค่าจะถูกพิมพ์ลง terminal และติดอยู่ใน log ถาวร
>
> และระวัง `${VAR:-ยังว่าง}` ด้วย — มันดูเหมือนปลอดภัยแต่ **พ่นค่าจริงออกมา**
> เพราะ `:-` แปลว่า "ถ้าว่างให้ใช้ค่านี้แทน" ไม่ใช่ "ซ่อนค่า" ใช้ `[ -n "$VAR" ]` แทนเสมอ
> (คู่มือฉบับแรกเขียนผิดข้อนี้ และทำคีย์หลุดจริงมาแล้ว 2 ครั้ง)

---

## กฎความปลอดภัย 4 ข้อ

1. **`.env` ห้ามขึ้น git** — อยู่ใน `.gitignore` แล้ว ส่วน `.env.example` **ไม่ได้อยู่** จึงห้ามใส่ค่าจริงลงไป
2. **bucket เก็บรูปต้องเป็น private** เป็นภาพใบหน้าคน ระบบใช้ signed URL อยู่แล้ว
3. **คีย์หลุดตาที่ไหนก็ตาม = เพิกถอนทันที** ทั้งใน terminal, screenshot, แชท หรือ log
4. **`REDEEM_CODES_ENABLED` และ `DEMO_SCANS_ENABLED` ต้องเป็น `false`** ในที่ที่ผู้ใช้จริงเข้าถึงได้

---

# 1. Postgres + Redis — ไม่ต้องสมัคร

**ใช้ทำอะไร** เก็บข้อมูลทั้งหมด และเป็นคิวงานสแกน
**ไม่มีแล้วเป็นยังไง** ระบบไม่ขึ้นเลย

มากับ `docker compose` อยู่แล้ว ไม่ต้องตั้งค่าอะไร

```sh
docker compose up -d
npm run doctor -- --only database redis
```

---

# 2. Firebase — ระบบล็อกอิน

**ใช้ทำอะไร** ตรวจตัวตนผู้ใช้ทุกคำขอ (ล็อกอินด้วย Google)
**ไม่มีแล้วเป็นยังไง** ล็อกอินไม่ได้ ใช้อะไรไม่ได้เลยนอกจากหน้าแรก

### เอามาจากไหน

1. console.firebase.google.com → **Add project**
2. **Authentication → Sign-in method → Google → Enable**
3. **Project settings → General → Your apps → Web app** (ไอคอน `</>`)
   คัดลอกค่าลง `.env`:
   ```
   VITE_FIREBASE_API_KEY=…
   VITE_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=<project-id>
   VITE_FIREBASE_STORAGE_BUCKET=…
   VITE_FIREBASE_APP_ID=…
   FIREBASE_PROJECT_ID=<project-id>
   ```
4. **Project settings → Service accounts → Generate new private key**
   ได้ไฟล์ JSON มา → เปลี่ยนชื่อเป็น `firebase-service-account.json` วางที่ **รากโปรเจกต์**

> ไฟล์นี้คือกุญแจระดับแอดมินของทั้งโปรเจกต์ ห้ามขึ้น git เด็ดขาด

### ข้อผิดพลาดที่เจอบ่อย

`FIREBASE_PROJECT_ID`, `project_id` ในไฟล์ JSON และ `VITE_FIREBASE_PROJECT_ID`
**ต้องเป็นโปรเจกต์เดียวกัน** ถ้าไม่ตรง หน้าเว็บจะขึ้น `Invalid Firebase token` โดยไม่มีอะไรใน log
บอกสาเหตุ เพราะ token นั้นถูกต้องทุกอย่าง แค่ออกมาจากคนละโปรเจกต์กับที่ตรวจ

```sh
npm run doctor -- --only firebase firebase-project
```

---

# 3. Supabase — เก็บภาพใบหน้า

**ใช้ทำอะไร** เก็บรูปที่สแกน แล้วออก signed URL อายุสั้นให้เบราว์เซอร์อัปโหลด
**ไม่มีแล้วเป็นยังไง** สแกนครบ 3 มุมแล้วส่งไม่ผ่าน ขึ้น `Image storage is temporarily unavailable`

### เอามาจากไหน

1. supabase.com → **New project** (ตั้งรหัส database แล้วจดไว้ ขอดูทีหลังไม่ได้)
2. **Storage → New bucket** ชื่อ `face-scans` → **ปิดสวิตช์ Public bucket**
3. **Project Settings → API Keys** คัดลอก 2 อย่าง:
   - **Project URL** → `SUPABASE_URL`
   - **`service_role` / secret key** → `SUPABASE_SECRET_KEY`

> ต้องเป็น **secret / service_role** ไม่ใช่ **anon** — anon key ไม่มีสิทธิ์ออก signed upload URL

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_…
SUPABASE_STORAGE_BUCKET=face-scans
```

### สร้างโปรเจกต์ใหม่ = เปลี่ยนทั้งคู่

คีย์เก่าใช้กับโปรเจกต์ใหม่ไม่ได้ ต้องเปลี่ยนทั้ง `SUPABASE_URL` และ `SUPABASE_SECRET_KEY` พร้อมกัน

### อ่านผลตรวจ

```sh
docker compose up -d && npm run doctor -- --only supabase
```

| ข้อความ | แปลว่า |
|---|---|
| `bucket 'face-scans' ใช้ได้ · คีย์ผ่าน` | เรียบร้อย |
| `ต่อไม่ได้: Name or service not known` | URL ผิด หรือโปรเจกต์ถูกลบไปแล้ว |
| `คีย์ผ่าน แต่ไม่มี bucket ชื่อ 'face-scans'` | ยังไม่ได้สร้าง bucket (ข้อ 2) |
| `คีย์ถูกปฏิเสธ` | ใช้ anon key อยู่ ต้องเปลี่ยนเป็น service_role |

---

# 4. แชท AI — เลือกได้ 3 เจ้า

**ใช้ทำอะไร** DOODEE Chat ตอบคำถามผู้ใช้
**ไม่มีแล้วเป็นยังไง** เฉพาะหน้าแชทตอบ 503 ส่วนอื่นทำงานปกติ

เลือกผู้ให้บริการที่ **`/admin` → ตั้งค่า AI แชท** ไม่ต้องแก้โค้ด
`npm run doctor` จะตรวจ **เจ้าที่เลือกไว้จริง** เท่านั้น

### Gemini (ค่าเริ่มต้น มีโควตาฟรี)

1. aistudio.google.com/apikey → **Create API key**
2. `GEMINI_API_KEY=…` ใน `.env`
3. แอดมิน → provider `gemini`, โมเดล `gemini-2.5-flash`

### Groq (ฟรี เร็วมาก เหมาะกับทดสอบ)

1. console.groq.com → คีย์ขึ้นต้น `gsk_`
2. `CHAT_API_KEY=gsk_…`
3. แอดมิน → provider `OpenAI-compatible`, base URL `https://api.groq.com/openai/v1`

### Anthropic (เสียเงิน)

1. platform.claude.com → เติมเครดิต → สร้างคีย์
2. `ANTHROPIC_API_KEY=…`
3. แอดมิน → provider `anthropic`

> **ตั้ง billing alert ด้วย** ทุกข้อความที่ผู้ใช้พิมพ์คือเงินจริง

```sh
npm run doctor -- --only anthropic
```

---

# 5. คีย์เข้ารหัสบัญชีธนาคาร — สร้างเอง ไม่ต้องสมัคร

**ใช้ทำอะไร** เข้ารหัสเลขบัญชีของผู้ใช้ก่อนเก็บลงฐานข้อมูล
**ไม่มีแล้วเป็นยังไง** ผู้ใช้บันทึกบัญชีรับเงินไม่ได้ ระบบชวนเพื่อนถอนเงินไม่ได้

```sh
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

ได้ค่ามาแล้วใส่ `PAYOUT_ENCRYPTION_KEY=…`

> **เปลี่ยนคีย์นี้ = เลขบัญชีที่เก็บไว้เดิมถอดรหัสไม่ได้ตลอดไป** ตั้งครั้งเดียวแล้วสำรองไว้ให้ดี

---

# 6. Omise — รับเงิน PromptPay

**ใช้ทำอะไร** ขายแพ็กเกจ
**ไม่มีแล้วเป็นยังไง** จ่ายเงินไม่ได้ ส่วนอื่นทำงานปกติ (โอนเงินยืนยันเองในแอดมินยังใช้ได้)

ต้องมีบัญชี merchant ซึ่ง**ต้องจดทะเบียนธุรกิจ** ระหว่างพัฒนาใช้ test key ได้เลย

1. dashboard.omise.co → **Keys**
   - `pkey_test_…` → `VITE_OMISE_PUBLIC_KEY` (อยู่ฝั่งเบราว์เซอร์ เปิดเผยได้ตามการออกแบบ)
   - `skey_test_…` → `OMISE_SECRET_KEY` (**ห้ามหลุด**)
2. **Webhooks** → เพิ่ม endpoint → คัดลอก signing secret → `OMISE_WEBHOOK_SECRET`

> **ไม่มี webhook secret = เงินเข้าแต่ไม่มีใครได้สิทธิ์** endpoint จะปฏิเสธทุก request แทนที่จะเชื่อคำขอที่ไม่ได้เซ็น
> `npm run doctor` ถือว่าเป็น **FAIL** ไม่ใช่คำเตือน

---

# 7. Sentry — ไม่บังคับ

**ใช้ทำอะไร** รวม error จาก production
เว้นว่างไว้ = ปิด ไม่มีอะไรถูกส่งออก

sentry.io → สร้าง project → คัดลอก DSN → `SENTRY_DSN=…`

---

## ลำดับที่แนะนำสำหรับเครื่องใหม่

```sh
cp .env.example .env
docker compose up -d
npm install
npm run doctor          # ดูว่าต้องต่ออะไรบ้าง
```

แล้วไล่ตามลำดับนี้ หยุดตรวจทุกขั้น:

1. **Firebase** — ไม่มีตัวนี้ล็อกอินไม่ได้ ทดสอบอย่างอื่นไม่ได้เลย
2. **Supabase** — ไม่มีตัวนี้สแกนไม่ได้ ซึ่งคือฟีเจอร์หลัก
3. **แชท** ถ้าจะใช้ · **Omise** ถ้าจะขายของ · **payout key** ถ้าจะเปิดระบบชวนเพื่อน

เป้าหมายคือ `npm run doctor` ผ่านครบ แล้วเข้า `/scan` ถ่าย 3 มุมจนได้ผลวิเคราะห์

ผ่านหมดแล้วและจะขึ้น production ต่อ → [`DEPLOY.md`](DEPLOY.md)

## ยังติดอยู่?

```sh
docker compose logs api --tail 50      # ฝั่งเซิร์ฟเวอร์บอกสาเหตุจริงเสมอ
```

ถ้าเบราว์เซอร์ขึ้น `Cannot reach the API` ให้เปิด Network tab ดูด้วย —
CORS block กับเซิร์ฟเวอร์ตาย หน้าตาเหมือนกันเป๊ะใน UI แต่คนละสาเหตุกันคนละเรื่อง
