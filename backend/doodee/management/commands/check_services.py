"""Ask every external service whether it actually works.

A key sitting in `.env` proves nothing: it can be a test key on a live project, a revoked key,
or the right key for the wrong account. Each check below performs the cheapest real call the
provider offers and reports what came back.

Secrets are never printed — only whether they are present, and what the provider said.

    docker compose exec api python manage.py check_services
    docker compose exec api python manage.py check_services --skip anthropic
"""

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.core.management.base import BaseCommand

OK, FAIL, SKIP = "ok", "fail", "skip"


class Result:
    def __init__(self, name, purpose):
        self.name = name
        self.purpose = purpose
        self.status = SKIP
        self.detail = ""
        self.fix = ""

    def ok(self, detail=""):
        self.status, self.detail = OK, detail
        return self

    def fail(self, detail, fix=""):
        self.status, self.detail, self.fix = FAIL, detail, fix
        return self

    def skip(self, detail, fix=""):
        self.status, self.detail, self.fix = SKIP, detail, fix
        return self


def _missing(result, *names):
    """True (and marks the result) when any of `names` is absent from the environment."""
    absent = [name for name in names if not os.getenv(name)]
    if absent:
        result.skip(f"ยังไม่ได้ตั้ง {', '.join(absent)}")
    return bool(absent)


def check_database():
    result = Result("Postgres", "เก็บข้อมูลทั้งหมด")
    try:
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return result.ok("ต่อได้")
    except Exception as exc:  # noqa: BLE001 - any failure is a failure worth printing
        return result.fail(str(exc)[:160], "ตรวจ DATABASE_URL และว่า container postgres รันอยู่")


def check_redis():
    result = Result("Redis", "คิวงานสแกน และตัวนับผู้เข้าใช้รายวัน")
    try:
        from django.core.cache import cache

        cache.set("check_services", "1", 10)
        if cache.get("check_services") != "1":
            return result.fail("เขียนได้แต่อ่านกลับมาไม่ตรง", "ตรวจ REDIS_URL")
        return result.ok("อ่านเขียนได้")
    except Exception as exc:  # noqa: BLE001
        return result.fail(str(exc)[:160], "ตรวจ REDIS_URL และว่า container redis รันอยู่")


def check_firebase():
    result = Result("Firebase Admin", "ตรวจ token ของผู้ใช้ทุกคำขอ")
    if _missing(result, "FIREBASE_PROJECT_ID"):
        return result
    try:
        import firebase_admin
        from firebase_admin import auth as firebase_auth
        from firebase_admin._auth_utils import InvalidIdTokenError

        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        # Verifying a deliberately invalid token still proves the credentials loaded and the
        # project resolved: bad credentials fail while loading, long before the token is read,
        # so reaching "this token is malformed" means everything upstream of it worked.
        try:
            firebase_auth.verify_id_token("not-a-real-token")
        except InvalidIdTokenError:
            return result.ok("credentials ใช้ได้ (ปฏิเสธ token ปลอมถูกต้อง)")
        return result.fail("ยอมรับ token ปลอม — ผิดปกติ", "ตรวจ firebase-service-account.json")
    except Exception as exc:  # noqa: BLE001
        return result.fail(str(exc)[:160], "ตรวจ firebase-service-account.json และ FIREBASE_PROJECT_ID")


def check_supabase():
    result = Result("Supabase Storage", "เก็บภาพใบหน้า")
    if _missing(result, "SUPABASE_URL", "SUPABASE_SECRET_KEY"):
        return result
    # Probes the object endpoint the app itself uses, not the bucket-admin API: the admin API
    # needs a header `storage.py` does not send, so a pass there would not mean uploads work.
    # Asking for an object that cannot exist separates the two answers cleanly — 404 means the
    # bucket was found and the key was accepted, 401/403 means it was not.
    from doodee.storage import download_image

    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "face-scans")
    try:
        download_image("check-services/does-not-exist.probe")
        return result.ok(f"bucket '{bucket}' อ่านได้")
    except HTTPError as exc:
        # Supabase answers a missing bucket with HTTP 400 and a 404 inside the body, so the
        # status line alone would report a rejected key when the key is fine.
        body = {}
        try:
            body = json.loads(exc.read().decode())
        except Exception:  # noqa: BLE001 - the error path must not raise its own error
            pass
        code = str(body.get("code", ""))
        if code == "NoSuchBucket" or "bucket not found" in str(body.get("message", "")).lower():
            return result.fail(
                f"คีย์ผ่าน แต่ไม่มี bucket ชื่อ '{bucket}'",
                "สร้าง bucket นี้ที่ Supabase → Storage (ตั้งเป็น private) หรือแก้ SUPABASE_STORAGE_BUCKET "
                "· ถ้าไม่มี bucket การสแกนจะอัปโหลดภาพไม่ได้",
            )
        # The object genuinely was not there, which is the answer we were fishing for.
        if exc.code == 404 or code in ("NoSuchKey", "NotFound"):
            return result.ok(f"bucket '{bucket}' ใช้ได้ · คีย์ผ่าน")
        if exc.code in (400, 401, 403):
            return result.fail(f"คีย์ถูกปฏิเสธ ({body.get('message', exc.code)})",
                               "ตรวจ SUPABASE_SECRET_KEY (ต้องเป็น service/secret key ไม่ใช่ anon)")
        return result.fail(f"HTTP {exc.code}", "ตรวจ SUPABASE_URL")
    except URLError as exc:
        return result.fail(f"ต่อไม่ได้: {exc.reason}", "ตรวจ SUPABASE_URL และอินเทอร์เน็ต")


def check_gemini(config):
    """Google Gemini — the production default, and what this deployment is set to.

    Lists the models rather than generating anything: it proves the key and the model name for
    free, where a one-token completion would bill. The key is read exactly as `chat._gemini_reply`
    reads it, `GEMINI_API_KEY` then `GOOGLE_API_KEY`, and deliberately never falls back to
    `CHAT_API_KEY` — `chat_enabled` refuses that fallback so the feature cannot report itself off
    while still answering, and a check that disagreed would send someone hunting the wrong key.
    """
    result = Result("แชท (Gemini)", "DOODEE Chat (คำถามพิมพ์เอง)")
    key = os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
    if not key:
        return result.skip(
            "ยังไม่ได้ตั้ง GEMINI_API_KEY",
            "ขอคีย์ฟรีที่ aistudio.google.com/apikey แล้วใส่ใน .env — ดู docs/SETUP.md",
        )
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
    try:
        with urlopen(Request(url), timeout=20) as response:
            body = json.loads(response.read().decode())
    except HTTPError as exc:
        if exc.code in (400, 401, 403):
            return result.fail(f"คีย์ถูกปฏิเสธ (HTTP {exc.code})",
                               "ตรวจ GEMINI_API_KEY ที่ aistudio.google.com/apikey แล้ว restart api")
        return result.fail(f"HTTP {exc.code}")
    except URLError as exc:
        return result.fail(f"ต่อไม่ได้: {exc.reason}", "ตรวจอินเทอร์เน็ตของ container")

    # The REST API returns names as "models/gemini-2.5-flash"; the admin stores the bare name.
    names = [(item.get("name") or "").removeprefix("models/") for item in body.get("models") or []]
    if config.model not in names:
        suggestion = ", ".join(n for n in names if n.startswith("gemini-2.5"))[:80] or ", ".join(names[:3])
        return result.fail(
            f"คีย์ผ่าน แต่ไม่มีรุ่น '{config.model}' ที่ตั้งไว้",
            f"เปลี่ยนรุ่นที่ /admin → ตั้งค่า AI แชท เป็นรุ่นที่มีจริง เช่น {suggestion or '—'}",
        )
    return result.ok(f"{config.model} · เรียกได้ {len(names)} รุ่น")


def check_chat_provider():
    """Whichever provider the admin has actually selected — not always Anthropic.

    Asking Anthropic while the chat is pointed at Groq gives an answer that is true and
    useless: "skipped", when what the operator wants to know is whether chat works.

    Gemini was missing from this branch while being both the documented default and what the
    database actually held, so the report named Anthropic, called it unconfigured, and advised
    signing up for a service the deployment does not use — costing money and still leaving chat
    untested. Every member of `ChatSetting.Provider` is answered here now.
    """
    from doodee.models import ChatSetting

    config = ChatSetting.current()
    if config.provider == ChatSetting.Provider.GEMINI:
        return check_gemini(config)
    if config.provider != ChatSetting.Provider.OPENAI:
        return check_anthropic()

    result = Result("แชท (OpenAI-compatible)", "DOODEE Chat (คำถามพิมพ์เอง)")
    if not config.base_url.strip():
        return result.fail("เลือก OpenAI-compatible แต่ไม่ได้ตั้งที่อยู่ API",
                           "ตั้งที่ /admin → ตั้งค่า AI แชท")

    from doodee.chat import USER_AGENT

    headers = {"User-Agent": USER_AGENT}
    if os.getenv("CHAT_API_KEY"):
        headers["Authorization"] = f"Bearer {os.environ['CHAT_API_KEY']}"
    url = f"{config.base_url.rstrip('/')}/models"
    try:
        with urlopen(Request(url, headers=headers), timeout=20) as response:
            body = json.loads(response.read().decode())
    except HTTPError as exc:
        if exc.code in (401, 403):
            return result.fail(f"คีย์ถูกปฏิเสธ (HTTP {exc.code})",
                               "ตรวจ CHAT_API_KEY ใน .env แล้ว restart api")
        return result.fail(f"HTTP {exc.code}", "ตรวจที่อยู่ API ที่ตั้งไว้ในแอดมิน")
    except URLError as exc:
        return result.fail(f"ต่อไม่ได้: {exc.reason}", "ตรวจที่อยู่ API และอินเทอร์เน็ต")

    names = [item.get("id") for item in body.get("data") or []]
    if config.model not in names:
        return result.fail(
            f"เรียกได้ {len(names)} รุ่น แต่ไม่มี '{config.model}' ที่ตั้งไว้",
            f"เปลี่ยนโมเดลในแอดมินเป็นรุ่นที่มีจริง เช่น {', '.join(names[:3]) or '—'}",
        )
    return result.ok(f"{config.base_url} · {config.model} · เรียกได้ {len(names)} รุ่น")


def check_anthropic():
    result = Result("Anthropic", "DOODEE Chat (คำถามพิมพ์เอง)")
    if _missing(result, "ANTHROPIC_API_KEY"):
        result.fix = "สมัครที่ platform.claude.com แล้วใส่ใน .env — ตั้ง billing alert ด้วย"
        return result
    try:
        from anthropic import Anthropic

        from doodee.chat import MODEL

        client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        # One token out. Enough to prove the key, the model name and the billing state, and it
        # costs a fraction of a satang.
        message = client.messages.create(
            model=MODEL, max_tokens=1, messages=[{"role": "user", "content": "hi"}]
        )
        return result.ok(f"เรียก {message.model} ได้")
    except Exception as exc:  # noqa: BLE001 - the SDK raises a family of errors
        text = str(exc)
        if "authentication" in text.lower() or "401" in text:
            return result.fail("คีย์ถูกปฏิเสธ", "ตรวจว่าคัดลอกคีย์ครบและยังไม่ถูกเพิกถอน")
        if "credit" in text.lower() or "billing" in text.lower():
            return result.fail("บัญชีไม่มีเครดิต", "เติมเครดิตที่ platform.claude.com")
        if "not_found" in text or "model" in text.lower():
            return result.fail(f"โมเดลใช้ไม่ได้: {text[:100]}", "ตรวจชื่อโมเดลใน doodee/chat.py")
        return result.fail(text[:160])


def check_omise():
    result = Result("Omise", "รับเงินผ่าน PromptPay")
    if _missing(result, "OMISE_SECRET_KEY"):
        result.fix = "ต้องมีบัญชี merchant (จดทะเบียนธุรกิจ) ที่ omise.co"
        return result
    import base64

    key = os.environ["OMISE_SECRET_KEY"]
    token = base64.b64encode(f"{key}:".encode()).decode()
    try:
        request = Request("https://api.omise.co/account", headers={"Authorization": f"Basic {token}"})
        with urlopen(request, timeout=15) as response:
            body = json.loads(response.read().decode())
        live = "LIVE" if body.get("livemode") else "TEST"
        detail = f"บัญชี {body.get('email', '?')} · โหมด {live}"
        if not os.getenv("OMISE_WEBHOOK_SECRET"):
            # The charge half works without it, but nothing is ever marked paid, so this is a
            # failure and not a warning: money would arrive and no plan would open.
            return result.fail(
                f"{detail} — แต่ยังไม่ได้ตั้ง OMISE_WEBHOOK_SECRET",
                "คัดลอกจาก dashboard.omise.co → Webhooks · ถ้าไม่มี webhook จะไม่มีใครได้สิทธิ์แม้จ่ายเงินแล้ว",
            )
        return result.ok(f"{detail} · webhook secret ตั้งแล้ว")
    except HTTPError as exc:
        if exc.code == 401:
            return result.fail("คีย์ถูกปฏิเสธ", "ตรวจ OMISE_SECRET_KEY (ต้องขึ้นต้นด้วย skey_)")
        return result.fail(f"HTTP {exc.code}")
    except URLError as exc:
        return result.fail(f"ต่อไม่ได้: {exc.reason}")


def check_payout_key():
    """The cipher for users' bank account numbers.

    Not an external service, but it fails the same way one does: absent or malformed, every
    attempt to save a payout account raises `payout_not_configured`, and the person only finds
    out when they try to withdraw. Round-tripping a value proves the key is usable rather than
    merely present — `payout._fernet` rejects a malformed key outright and deliberately never
    falls back to storing the number in the clear.
    """
    result = Result("คีย์เข้ารหัสบัญชีธนาคาร", "เข้ารหัสเลขบัญชีของผู้ใช้ก่อนเก็บ")
    from django.conf import settings

    key = (settings.PAYOUT_ENCRYPTION_KEY or "").strip()
    if not key:
        return result.skip(
            "ยังไม่ได้ตั้ง PAYOUT_ENCRYPTION_KEY",
            'สร้างด้วย: python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())" · ถ้าไม่ตั้ง ผู้ใช้จะบันทึกบัญชีรับเงินไม่ได้',
        )
    try:
        from cryptography.fernet import Fernet

        cipher = Fernet(key.encode())
        if cipher.decrypt(cipher.encrypt(b"probe")) != b"probe":
            return result.fail("เข้ารหัสแล้วถอดกลับไม่ตรง")
        return result.ok("คีย์ใช้ได้")
    except Exception as exc:  # noqa: BLE001
        return result.fail(
            f"คีย์ผิดรูปแบบ: {str(exc)[:80]}",
            "ต้องเป็น Fernet key (base64 32 ไบต์) สร้างใหม่ด้วยคำสั่งใน .env.example",
        )


def check_firebase_consistency():
    """Backend, service account and web client must all name the same Firebase project.

    Any two of the three disagreeing produces "Invalid Firebase token" in the browser and
    nothing at all in the log to say why: the token is real, correctly signed, and issued by a
    different project than the one verifying it. `compose.yaml` already guards the case where the
    key file is missing entirely; this is the quieter version where every file exists and one of
    them names the wrong project.
    """
    result = Result("Firebase (โปรเจกต์ตรงกัน)", "ฝั่งเว็บกับฝั่งเซิร์ฟเวอร์ต้องเป็นโปรเจกต์เดียวกัน")
    backend_id = os.getenv("FIREBASE_PROJECT_ID", "")
    if not backend_id:
        return result.skip("ยังไม่ได้ตั้ง FIREBASE_PROJECT_ID")

    found = {"FIREBASE_PROJECT_ID": backend_id}
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    if credentials_path and os.path.exists(credentials_path):
        try:
            with open(credentials_path) as handle:
                found["ไฟล์ service account"] = json.load(handle).get("project_id", "")
        except Exception as exc:  # noqa: BLE001
            return result.fail(f"อ่านไฟล์ service account ไม่ได้: {str(exc)[:80]}")
    elif credentials_path:
        return result.fail(
            f"ไม่พบไฟล์ {credentials_path}",
            "วาง firebase-service-account.json ไว้ที่รากโปรเจกต์",
        )

    # `VITE_*` belongs to the browser bundle, but compose loads the whole `.env` into this
    # container too, so it arrives here as an ordinary variable. Reading the file instead would
    # have found nothing: only ./backend is mounted, and /app/.env does not exist.
    web_id = os.getenv("VITE_FIREBASE_PROJECT_ID", "")
    if web_id:
        found["VITE_FIREBASE_PROJECT_ID"] = web_id

    unique = {value for value in found.values() if value}
    if len(unique) > 1:
        detail = " · ".join(f"{name}={value or '(ว่าง)'}" for name, value in found.items())
        return result.fail(
            f"ไม่ตรงกัน: {detail}",
            "ทั้งสามที่ต้องเป็นโปรเจกต์เดียวกัน ไม่งั้นหน้าเว็บจะขึ้น Invalid Firebase token",
        )
    return result.ok(f"ตรงกันทั้งหมด: {backend_id}")


CHECKS = {
    "database": check_database,
    "redis": check_redis,
    "firebase": check_firebase,
    "firebase-project": check_firebase_consistency,
    "supabase": check_supabase,
    "anthropic": check_chat_provider,
    "omise": check_omise,
    "payout": check_payout_key,
}


class Command(BaseCommand):
    help = "ตรวจว่าบริการภายนอกทุกตัวใช้งานได้จริง (ไม่แสดงค่าคีย์)"

    def add_arguments(self, parser):
        parser.add_argument("--skip", nargs="*", default=[], choices=sorted(CHECKS),
                            help="ข้ามการตรวจบางตัว เช่น --skip anthropic")
        parser.add_argument("--only", nargs="*", default=[], choices=sorted(CHECKS),
                            help="ตรวจเฉพาะที่ระบุ")

    def handle(self, *args, **options):
        names = options["only"] or [n for n in CHECKS if n not in options["skip"]]
        results = [CHECKS[name]() for name in names]

        width = max(len(r.name) for r in results)
        marks = {OK: (" ok ", self.style.SUCCESS), FAIL: ("FAIL", self.style.ERROR),
                 SKIP: ("ข้าม", self.style.WARNING)}
        for r in results:
            mark, style = marks[r.status]
            self.stdout.write(f"{style(f'[{mark}]')} {r.name.ljust(width)}  {r.detail}")
            self.stdout.write(f"        {self.style.WARNING(r.purpose)}")
            if r.fix:
                self.stdout.write(f"        → {r.fix}")

        failed = [r for r in results if r.status == FAIL]
        skipped = [r for r in results if r.status == SKIP]
        self.stdout.write("")
        summary = f"ผ่าน {len(results) - len(failed) - len(skipped)}/{len(results)}"
        if failed:
            self.stdout.write(self.style.ERROR(f"{summary} · มีปัญหา: {', '.join(r.name for r in failed)}"))
        elif skipped:
            self.stdout.write(self.style.WARNING(f"{summary} · ยังไม่ได้ตั้งค่า: {', '.join(r.name for r in skipped)}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"{summary} · ทุกบริการใช้งานได้"))
