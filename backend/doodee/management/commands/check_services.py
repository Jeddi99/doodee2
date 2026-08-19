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


CHECKS = {
    "database": check_database,
    "redis": check_redis,
    "firebase": check_firebase,
    "supabase": check_supabase,
    "anthropic": check_anthropic,
    "omise": check_omise,
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
