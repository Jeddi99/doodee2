import uuid

from django.conf import settings
from django.core.validators import MinLengthValidator
from django.db import models

from . import request_cache


class FirebaseIdentity(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="firebase_identity",
        verbose_name="ผู้ใช้",
    )
    firebase_uid = models.CharField(
        max_length=128, unique=True, verbose_name="รหัสผู้ใช้ Firebase",
        help_text="รหัสที่ Firebase ออกให้ตอนสมัคร ใช้ค้นหาผู้ใช้เวลามีปัญหาเรื่องล็อกอิน",
    )

    class Meta:
        verbose_name = "บัญชี Firebase"
        verbose_name_plural = "บัญชี Firebase"

    def __str__(self):
        return self.firebase_uid


class ConsentEvent(models.Model):
    class Purpose(models.TextChoices):
        ANALYSIS = "analysis", "วิเคราะห์ใบหน้า"
        STORAGE = "storage", "เก็บภาพและประวัติ"
        SIMULATION = "simulation", "จำลองผลในเครื่อง"
        # Separate from ANALYSIS because analysis and simulation both run on this system,
        # while a typed chat question sends the scan's twelve measurements to an external
        # model. Numbers derived from a face leaving is not the same as being measured, and
        # consent to be measured is not consent to be forwarded.
        #
        # This purpose still forwards numbers only — chat.py sends no images. Face images
        # leave this system under exactly one purpose, SKIN_VISION below, and only for users
        # who turned it on.
        CHAT = "chat", "ส่งตัวเลขให้โมเดลภายนอก (แชท)"
        # And separate again from CHAT, by the same argument one step further along. CHAT
        # forwards twelve numbers; this forwards the photograph they were derived from. A
        # measurement can be argued to be about a face without being of one — an image cannot,
        # and it carries everything the user did not choose to have measured. Consent to send
        # numbers is not consent to send the picture, so this is its own opt-in, off unless
        # asked for, and revocable in settings. Nothing reads a face image out of this system
        # without a row here.
        SKIN_VISION = "skin_vision", "ส่งภาพใบหน้าให้โมเดลภายนอก (วิเคราะห์ผิว)"
        # Every other purpose here asks about what may be done with the user's face. This one asks
        # whose face it is, and it exists because the file picker made that a question. A live
        # capture carries a weak but real answer — somebody sat in front of the camera and turned
        # their head on request — and an uploaded file carries none at all. Nothing in the pipeline
        # can tell the difference: `_decode` measures light and blur, `_validate_pose_set` measures
        # head angle, and a sharp well-lit photograph of somebody else passes both. So the answer
        # is asked for and written down rather than detected, and `_scan_fields` refuses an upload
        # that arrives without one.
        PHOTO_OWNER = "photo_owner", "ยืนยันว่าภาพที่อัปโหลดเป็นใบหน้าของตนเอง"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, verbose_name="ผู้ใช้",
    )
    purpose = models.CharField(max_length=16, choices=Purpose.choices, verbose_name="ยินยอมเรื่องอะไร")
    policy_version = models.CharField(
        max_length=32, verbose_name="เวอร์ชันนโยบาย",
        help_text="เวอร์ชันของข้อความที่ผู้ใช้เห็นตอนกดยินยอม ใช้พิสูจน์ว่าเขาตกลงกับข้อความชุดไหน",
    )
    accepted = models.BooleanField(default=True, verbose_name="ยินยอม")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="เมื่อ")

    class Meta:
        verbose_name = "การให้ความยินยอม"
        verbose_name_plural = "การให้ความยินยอม"


class Scan(models.Model):
    class Status(models.TextChoices):
        UPLOADING = "uploading", "กำลังอัปโหลด"
        QUEUED = "queued", "รอคิว"
        PROCESSING = "processing", "กำลังประมวลผล"
        COMPLETED = "completed", "เสร็จแล้ว"
        FAILED = "failed", "ล้มเหลว"
        CANCELLED = "cancelled", "ยกเลิก"
        DELETION_PENDING = "deletion_pending", "รอลบ"

    class ScanMode(models.TextChoices):
        FULL = "full", "ครบ 7 มุม"
        STANDARD = "standard", "หน้าตรงและด้านข้างสองข้าง"
        FAST = "fast", "เร็ว 3 มุม"
        # Front only, framed closer. Produces `skin_analysis` and no craniofacial metrics, so
        # it must never be picked up as "the user's latest scan" by the pages that read shape —
        # see `latest_craniofacial_scan`.
        SKIN = "skin", "วิเคราะห์ผิว (ระยะใกล้)"

    class AgeBand(models.TextChoices):
        ADULT = "adult", "18 ปีขึ้นไป"
        MINOR = "minor", "ต่ำกว่า 18 ปี"

    class CaptureMethod(models.TextChoices):
        # No `demo` member: `is_demo` already answers that, and two fields that can disagree about
        # the same fact is a bug waiting to be written.
        WEB_CAMERA = "web_camera", "กล้องบนเว็บ"
        MOBILE_CAMERA = "mobile_camera", "กล้องบนแอปมือถือ"
        # Set when *any* angle came from a file rather than the camera, not only when all of them
        # did. A scan is one unit of analysis and cannot be half a camera scan: everything an
        # operator reads into "web_camera" — that tracking ran, that framing was enforced by the
        # capture UI, that the subject was present when the shutter fired — is false of a scan
        # holding one uploaded photograph, so calling it a camera scan would be the same untruth
        # the missing member used to guard against.
        #
        # Not `web_upload`, although the two above name a surface. A photo-library picker on the
        # mobile app should report this same value, and which surface it was is recoverable from
        # UserAttribution.device anyway. If per-angle provenance is ever wanted it belongs as a
        # {view: source} map beside `image_objects`, where it can be exact, rather than as a
        # combinatorial spread of enum members here.
        UPLOAD = "upload", "อัปโหลดรูป"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="scans", verbose_name="ผู้ใช้",
    )
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.QUEUED, db_index=True, verbose_name="สถานะ",
    )
    progress = models.PositiveSmallIntegerField(default=0, verbose_name="ความคืบหน้า (%)")
    idempotency_key = models.CharField(max_length=128, blank=True, default="", verbose_name="รหัสกันส่งซ้ำ")
    attempt_count = models.PositiveSmallIntegerField(default=0, verbose_name="จำนวนครั้งที่ประมวลผล")
    started_at = models.DateTimeField(null=True, blank=True, verbose_name="เริ่มประมวลผลเมื่อ")
    finished_at = models.DateTimeField(null=True, blank=True, verbose_name="จบประมวลผลเมื่อ")
    age_band = models.CharField(max_length=8, choices=AgeBand.choices, verbose_name="ช่วงอายุ")
    reference_age_band = models.CharField(max_length=16, default="18_35", verbose_name="ช่วงอายุกลุ่มอ้างอิง")
    reference_profile = models.CharField(max_length=12, default="neutral", verbose_name="โปรไฟล์กลุ่มอ้างอิง")
    reference_population = models.CharField(max_length=8, default="TH", verbose_name="ประชากรอ้างอิง")
    scan_mode = models.CharField(
        max_length=16, choices=ScanMode.choices, default=ScanMode.FULL, verbose_name="โหมดการสแกน",
    )
    # Blank, not defaulted to web_camera: the mobile app builds its own multipart body and does
    # not send this yet, so a default would file every iOS scan under "browser". Unknown has to
    # read as unknown.
    capture_method = models.CharField(
        max_length=16, choices=CaptureMethod.choices, blank=True, default="", verbose_name="วิธีถ่ายภาพ",
    )
    image_objects = models.JSONField(default=dict, verbose_name="ไฟล์ภาพ")
    # Sample data, not a real person. Carried on the row rather than inferred from the absence
    # of images, because a real scan whose photos expired looks identical and the two must
    # never be described to the user with the same words.
    is_demo = models.BooleanField(
        default=False, verbose_name="เป็นข้อมูลตัวอย่าง",
        help_text="ข้อมูลตัวอย่างที่ระบบสร้างเอง ไม่ใช่คนจริง อย่านับรวมในรายงาน",
    )
    analysis_data = models.JSONField(null=True, blank=True, verbose_name="ผลวิเคราะห์")
    formula_version = models.CharField(max_length=16, default="2026.1", verbose_name="เวอร์ชันสูตรคำนวณ")
    error_code = models.CharField(max_length=40, blank=True, verbose_name="รหัสข้อผิดพลาด")
    error_message = models.CharField(max_length=500, blank=True, verbose_name="ข้อความข้อผิดพลาด")
    expires_at = models.DateTimeField(
        verbose_name="หมดอายุ", help_text="ถึงเวลานี้แล้วภาพจะถูกลบอัตโนมัติ ผลวิเคราะห์ยังอยู่",
    )
    deletion_requested_at = models.DateTimeField(null=True, blank=True, verbose_name="ผู้ใช้ขอลบเมื่อ")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="สร้างเมื่อ")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="แก้ไขล่าสุด")

    class Meta:
        ordering = ("-created_at",)
        constraints = (
            models.UniqueConstraint(
                fields=("user", "idempotency_key"), condition=~models.Q(idempotency_key=""),
                name="unique_scan_idempotency_key",
            ),
        )
        indexes = (models.Index(fields=("status", "created_at"), name="doodee_scan_status_created_idx"),)
        verbose_name = "การสแกน"
        verbose_name_plural = "การสแกน"


class Simulation(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "รอคิว"
        PROCESSING = "processing", "กำลังประมวลผล"
        COMPLETED = "completed", "เสร็จแล้ว"
        FAILED = "failed", "ล้มเหลว"
        CANCELLED = "cancelled", "ยกเลิก"
        DELETION_PENDING = "deletion_pending", "รอลบ"

    class Kind(models.TextChoices):
        PREVIEW = "preview", "พรีวิวชั่วคราว"
        SAVED = "saved", "บันทึก"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scan = models.ForeignKey(Scan, on_delete=models.CASCADE, related_name="simulations", verbose_name="การสแกน")
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.QUEUED, db_index=True, verbose_name="สถานะ",
    )
    progress = models.PositiveSmallIntegerField(default=0, verbose_name="ความคืบหน้า (%)")
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.SAVED, db_index=True, verbose_name="ชนิด")
    idempotency_key = models.CharField(max_length=128, blank=True, default="", verbose_name="รหัสกันส่งซ้ำ")
    attempt_count = models.PositiveSmallIntegerField(default=0, verbose_name="จำนวนครั้งที่ประมวลผล")
    started_at = models.DateTimeField(null=True, blank=True, verbose_name="เริ่มประมวลผลเมื่อ")
    finished_at = models.DateTimeField(null=True, blank=True, verbose_name="จบประมวลผลเมื่อ")
    # `region` and `preset_id` hold the first selection so rows written before stacking, and
    # readers that only know about one, keep working. `selections` is the whole stack.
    region = models.CharField(max_length=16, verbose_name="บริเวณ")
    preset_id = models.CharField(max_length=80, blank=True, verbose_name="รูปแบบที่เลือก")
    selections = models.JSONField(default=list, verbose_name="รายการที่เลือกทั้งหมด")
    source_view = models.CharField(max_length=24, blank=True, verbose_name="มุมภาพต้นทาง")
    parameters = models.JSONField(default=dict, verbose_name="ค่าที่ใช้จำลอง")
    measurements = models.JSONField(default=list, verbose_name="ค่าที่วัดได้")
    related_procedures = models.JSONField(default=list, verbose_name="หัตถการที่เกี่ยวข้อง")
    model_version = models.CharField(max_length=80, verbose_name="เวอร์ชันโมเดล")
    before_object = models.CharField(max_length=500, blank=True, verbose_name="ไฟล์ภาพก่อน")
    after_object = models.CharField(max_length=500, blank=True, verbose_name="ไฟล์ภาพหลัง")
    # Only the canonical three-view engine fills this. It renders front and both profiles from
    # one fused model, and `after_object` above is just whichever of them the request asked for;
    # the other two would otherwise be discarded after being paid for. Empty for every simulation
    # rendered by the single-image engine, which is what `{}` means here — not "not yet uploaded".
    view_objects = models.JSONField(default=dict, blank=True, verbose_name="ไฟล์ภาพรายมุม")
    error_code = models.CharField(max_length=40, blank=True, verbose_name="รหัสข้อผิดพลาด")
    error_message = models.CharField(max_length=500, blank=True, verbose_name="ข้อความข้อผิดพลาด")
    expires_at = models.DateTimeField(verbose_name="หมดอายุ")
    deletion_requested_at = models.DateTimeField(null=True, blank=True, verbose_name="ผู้ใช้ขอลบเมื่อ")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="สร้างเมื่อ")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="แก้ไขล่าสุด")

    class Meta:
        ordering = ("-created_at",)
        constraints = (
            models.UniqueConstraint(
                fields=("scan", "idempotency_key"), condition=~models.Q(idempotency_key=""),
                name="unique_simulation_idempotency_key",
            ),
        )
        indexes = (models.Index(fields=("status", "created_at"), name="doodee_sim_status_created_idx"),)
        verbose_name = "การจำลองผล"
        verbose_name_plural = "การจำลองผล"


class PromoCode(models.Model):
    """A code that grants time-limited paid entitlement without a payment provider.

    Built for testing the entitlement path end to end. Codes are reusable without limit, so
    `is_active` is the kill switch for one that leaks, and settings.REDEEM_CODES_ENABLED turns
    the whole endpoint off.
    """

    code = models.CharField(
        max_length=64, unique=True, validators=(MinLengthValidator(8),), verbose_name="โค้ด",
        help_text="อย่างน้อย 8 ตัวอักษร ใช้ซ้ำได้ไม่จำกัดจำนวนคน ถ้าโค้ดหลุดให้ปิด “เปิดใช้งาน” แทนการลบ",
    )
    # Days granted from the moment of redemption. 0 makes an already-expired grant, which is
    # how the expiry path gets tested without waiting or editing the database.
    days = models.PositiveSmallIntegerField(
        default=7, verbose_name="ให้สิทธิ์กี่วัน",
        help_text="นับจากวันที่กดใช้โค้ด ใส่ 0 = หมดอายุทันที (ใช้ทดสอบเท่านั้น)",
    )
    is_active = models.BooleanField(default=True, verbose_name="เปิดใช้งาน")
    note = models.CharField(
        max_length=200, blank=True, verbose_name="บันทึกช่วยจำ",
        help_text="เขียนไว้ว่าโค้ดนี้แจกใคร งานอะไร ผู้ใช้ไม่เห็นข้อความนี้",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="สร้างเมื่อ")

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "โค้ดรับสิทธิ์"
        verbose_name_plural = "โค้ดรับสิทธิ์"

    def __str__(self):
        return self.code


class PromoRedemption(models.Model):
    """One row per successful redemption: both the audit trail and the entitlement itself.

    Current entitlement is the newest unexpired `expires_at`, so redeeming again resets the
    window to `now + days` rather than stacking, and every attempt stays on the record.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="promo_redemptions",
        verbose_name="ผู้ใช้",
    )
    promo_code = models.ForeignKey(
        PromoCode, on_delete=models.PROTECT, related_name="redemptions", verbose_name="โค้ดรับสิทธิ์",
    )
    redeemed_at = models.DateTimeField(auto_now_add=True, verbose_name="ใช้เมื่อ")
    expires_at = models.DateTimeField(verbose_name="สิทธิ์หมดอายุ")

    class Meta:
        ordering = ("-redeemed_at",)
        indexes = (models.Index(fields=("user", "expires_at")),)
        verbose_name = "การใช้โค้ดรับสิทธิ์"
        verbose_name_plural = "การใช้โค้ดรับสิทธิ์"


class SimulationPreviewUsage(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="simulation_preview_usage",
        verbose_name="ผู้ใช้",
    )
    period = models.DateField(verbose_name="เดือน", help_text="วันที่ 1 ของเดือนที่นับโควตานี้")
    count = models.PositiveSmallIntegerField(default=0, verbose_name="ใช้ไปแล้ว (ครั้ง)")

    class Meta:
        constraints = (models.UniqueConstraint(fields=("user", "period"), name="unique_preview_usage_period"),)
        verbose_name = "โควตาพรีวิวการจำลอง"
        verbose_name_plural = "โควตาพรีวิวการจำลอง"


class ChatConversation(models.Model):
    """One DOODEE Chat thread.

    `scan` is the scan whose numbers were put in front of the model. It is nullable and
    SET_NULL rather than CASCADE: deleting a scan must not silently erase the conversation the
    user had about it, and `Scan.expires_at` means scans go away on their own.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_conversations",
        verbose_name="ผู้ใช้",
    )
    scan = models.ForeignKey(
        "Scan", null=True, blank=True, on_delete=models.SET_NULL, related_name="chat_conversations",
        verbose_name="การสแกนที่อ้างถึง",
        help_text="ตัวเลขจากการสแกนนี้คือสิ่งที่ส่งให้โมเดล ถ้าว่างแปลว่าการสแกนถูกลบไปแล้ว",
    )
    title = models.CharField(max_length=120, blank=True, verbose_name="ชื่อห้อง")
    # Stored as the key, not a foreign key: a role the admin later switches off must leave the
    # conversations that used it readable, and `ChatRole.resolve()` already falls back safely.
    role = models.CharField(
        max_length=32, blank=True, verbose_name="โรลที่ใช้",
        help_text="เลือกตอนเปิดห้อง เปลี่ยนกลางห้องไม่ได้ เพราะจะทำให้ prompt cache พังทุกเทิร์น",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="เริ่มเมื่อ")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="ตอบล่าสุด")

    class Meta:
        ordering = ("-updated_at",)
        indexes = (models.Index(fields=("user", "-updated_at")),)
        verbose_name = "ห้องแชท"
        verbose_name_plural = "ห้องแชท"


class ChatMessage(models.Model):
    class Role(models.TextChoices):
        USER = "user", "ผู้ใช้"
        ASSISTANT = "assistant", "DOODEE"

    conversation = models.ForeignKey(
        ChatConversation, on_delete=models.CASCADE, related_name="messages", verbose_name="ห้องแชท",
    )
    role = models.CharField(max_length=9, choices=Role.choices, verbose_name="ผู้พูด")
    content = models.TextField(verbose_name="ข้อความ")
    # Kept per message so the real cost per turn is auditable in admin rather than estimated.
    # `cached_input_tokens` is what prompt caching actually saved; without it there is no way
    # to tell whether the cache is being hit.
    input_tokens = models.PositiveIntegerField(default=0, verbose_name="โทเค็นขาเข้า")
    cached_input_tokens = models.PositiveIntegerField(
        default=0, verbose_name="โทเค็นที่อ่านจากแคช",
        help_text="ยิ่งมากยิ่งประหยัด ถ้าเป็น 0 ตั้งแต่ข้อความที่สองแปลว่าแคชไม่ทำงาน",
    )
    # Billed at 1.25x the input rate and paid on the first turn of every conversation. Without
    # it the cost report reads low against the real invoice, which is the one number an
    # estimate must never do.
    cache_write_tokens = models.PositiveIntegerField(default=0, verbose_name="โทเค็นที่เขียนลงแคช")
    output_tokens = models.PositiveIntegerField(default=0, verbose_name="โทเค็นขาออก")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="เมื่อ")

    class Meta:
        ordering = ("created_at", "id")
        indexes = (models.Index(fields=("conversation", "created_at")),)
        verbose_name = "ข้อความแชท"
        verbose_name_plural = "ข้อความแชท"


class ChatUsage(models.Model):
    """Turns spent this calendar month, metered the same way as SimulationPreviewUsage.

    Same shape deliberately: the free tier is capped hard, and paid plans get a soft cap that
    exists to bound the damage from a stolen account rather than to ration the feature.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_usage", verbose_name="ผู้ใช้",
    )
    period = models.DateField(verbose_name="เดือน", help_text="วันที่ 1 ของเดือนที่นับโควตานี้")
    count = models.PositiveIntegerField(
        default=0, verbose_name="ใช้ไปแล้ว (ครั้ง)",
        help_text="นับเฉพาะคำถามที่พิมพ์เอง คำถามสำเร็จรูปไม่กินโควตาเพราะไม่ได้เรียกโมเดล",
    )

    class Meta:
        constraints = (models.UniqueConstraint(fields=("user", "period"), name="unique_chat_usage_period"),)
        verbose_name = "โควตาแชท"
        verbose_name_plural = "โควตาแชท"


class AIUsageLedger(models.Model):
    class Status(models.TextChoices):
        RESERVED = "reserved", "กันงบแล้ว"
        SETTLED = "settled", "คิดเงินจริงแล้ว"
        REFUNDED = "refunded", "คืนงบแล้ว"
        UNCERTAIN = "uncertain", "รอตรวจสอบ"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ai_usage_ledger")
    idempotency_key = models.CharField(max_length=128)
    provider = models.CharField(max_length=16)
    model = models.CharField(max_length=96)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.RESERVED, db_index=True)
    reserved_satang = models.PositiveIntegerField(default=0)
    actual_satang = models.PositiveIntegerField(default=0)
    input_tokens = models.PositiveIntegerField(default=0)
    cached_input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    settled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = (models.UniqueConstraint(fields=("user", "idempotency_key"), name="unique_ai_usage_request"),)
        indexes = (models.Index(fields=("status", "created_at"), name="doodee_aiu_status_created_idx"),)


class Plan(models.Model):
    """A sellable tier.

    `code` is the same string `_user_plan()` returns, so there is exactly one vocabulary for
    entitlement across the API, the admin and the pricing page — the ported pricing panel had
    invented its own (`plus`/`pro`) that matched nothing the server knew about.

    Money is satang, integer, always. A float baht column loses a satang to rounding somewhere
    between the discount and the provider, and reconciliation then never balances.
    """

    class Interval(models.TextChoices):
        MONTH = "month", "รายเดือน"
        YEAR = "year", "รายปี"
        ONCE = "once", "จ่ายครั้งเดียว"

    class AnalysisDepth(models.TextChoices):
        PARTIAL = "partial", "บอกบางส่วน (คะแนนรวมและตัวเด่น)"
        FULL = "full", "บอกครบทุกค่า"

    # Sentinel for "no ceiling on this plan". A nullable column would mean every reader has to
    # decide what None means, and half of them would decide wrong; -1 is checked in one place
    # (`entitlement.quota`) and never leaves it.
    UNLIMITED = -1

    code = models.CharField(
        max_length=32, unique=True, verbose_name="รหัสแผน",
        help_text="รหัสภายในระบบ เช่น free, member, clinic ห้ามแก้หลังเปิดขายแล้ว เพราะสิทธิ์ของผู้ใช้ผูกกับค่านี้",
    )
    name_th = models.CharField(max_length=80, verbose_name="ชื่อแผน (ไทย)")
    name_en = models.CharField(max_length=80, verbose_name="ชื่อแผน (อังกฤษ)")
    description_th = models.CharField(max_length=300, blank=True, verbose_name="คำอธิบาย (ไทย)")
    description_en = models.CharField(max_length=300, blank=True, verbose_name="คำอธิบาย (อังกฤษ)")
    price_satang = models.PositiveIntegerField(
        default=0, verbose_name="ราคา (สตางค์)",
        help_text="กรอกเป็นสตางค์ ไม่ใช่บาท เช่น ฿149.00 ให้ใส่ 14900 (คอลัมน์ “ราคา” ในตารางแปลงเป็นบาทให้แล้ว)",
    )
    interval = models.CharField(
        max_length=8, choices=Interval.choices, default=Interval.MONTH, verbose_name="รอบการเก็บเงิน",
    )
    # Feature ids the pricing table ticks. A list rather than columns because the marketing
    # table changes far more often than the entitlement rules behind it.
    features = models.JSONField(
        default=list, blank=True, verbose_name="รายการฟีเจอร์",
        help_text="รหัสฟีเจอร์ที่จะติ๊กถูกในตารางราคาบนหน้าเว็บ",
    )
    # ---- What the plan actually allows.
    #
    # These were literal numbers in views.py — `3` written four separate times, and chat had
    # exactly two ceilings for every plan that has ever existed (ChatSetting.free_turns and
    # .paid_turns). Three tiers with three different allowances cannot be said that way. Moved
    # here so the pricing table, the enforcement check and the admin all read one row, and so a
    # quota change is an admin edit rather than a deploy.
    simulation_previews_per_month = models.IntegerField(
        default=0, verbose_name="ดูผลจำลองได้ (ครั้ง/เดือน)",
        help_text="นับทุกครั้งที่กดดูผลจำลอง (ตัวที่กินเครื่อง) · ใส่ -1 = ไม่จำกัด · 0 = ใช้ไม่ได้เลย",
    )
    simulation_saves_per_month = models.IntegerField(
        default=3, verbose_name="บันทึกภาพจำลองได้ (ครั้ง/เดือน)",
        help_text="การกดบันทึกเก็บไว้ในประวัติ · ใส่ -1 = ไม่จำกัด",
    )
    chat_turns_per_month = models.IntegerField(
        default=5, verbose_name="แชทได้ (ข้อความ/เดือน)",
        help_text="นับเฉพาะคำถามที่พิมพ์เอง คำถามสำเร็จรูปไม่กินโควตา · ใส่ -1 = ไม่จำกัด "
                  "(ยังมีเพดานรายชั่วโมงกันบัญชีถูกยึดอยู่)",
    )
    analysis_depth = models.CharField(
        max_length=8, choices=AnalysisDepth.choices, default=AnalysisDepth.PARTIAL,
        verbose_name="ความละเอียดของผลวิเคราะห์",
        help_text="“บอกบางส่วน” = เห็นคะแนนรวมกับตัวเด่นสองสามตัว ที่เหลือถูกซ่อนไว้ตั้งแต่ฝั่งเซิร์ฟเวอร์",
    )
    has_development_plan = models.BooleanField(
        default=False, verbose_name="ได้แผนพัฒนาตนเอง",
        help_text="แผนที่สร้างจากค่าที่วัดได้ของผู้ใช้เอง",
    )
    # Which plan wins when someone holds two at once — a leftover monthly and a new yearly, or a
    # promo grant on top of a purchase. Highest rank is the one they get.
    tier_rank = models.PositiveSmallIntegerField(
        default=0, verbose_name="ระดับของแผน",
        help_text="ใช้ตัดสินว่าถ้าผู้ใช้มีสิทธิ์ซ้อนกันหลายแผน จะได้สิทธิ์ของแผนไหน · เลขมากชนะ",
    )
    # The group granted on payment, or blank for a tier that grants nothing (free) or that is
    # not sold self-serve. Named rather than a FK so a fresh database orders migrations freely.
    grants_group = models.CharField(
        max_length=64, blank=True, verbose_name="กลุ่มสิทธิ์ที่ได้รับ",
        help_text="ชื่อกลุ่มที่ผู้ใช้จะถูกใส่เข้าไปเมื่อจ่ายเงินสำเร็จ เช่น pro_member เว้นว่างสำหรับแผนฟรี",
    )
    # Off for tiers that need a conversation before they can start — the clinic partnership is
    # an agreement, not a checkout.
    self_serve = models.BooleanField(
        default=True, verbose_name="ให้ซื้อเองได้",
        help_text="ปิดไว้ = หน้าเว็บจะแสดงปุ่ม “ติดต่อทีมงาน” แทนปุ่มสั่งซื้อ (ใช้กับแผนคลินิกพาร์ทเนอร์)",
    )
    is_active = models.BooleanField(
        default=True, verbose_name="เปิดขาย",
        help_text="ปิดแล้วแผนนี้จะหายจากหน้าราคาทันที คนที่ซื้อไปแล้วยังใช้ได้ตามปกติ",
    )
    sort_order = models.PositiveSmallIntegerField(
        default=0, verbose_name="ลำดับการแสดง", help_text="เลขน้อยอยู่ซ้าย",
    )

    class Meta:
        ordering = ("sort_order", "price_satang")
        verbose_name = "แผน"
        verbose_name_plural = "แผน"

    def __str__(self):
        # Read by operators in every plan dropdown and filter, so it shows baht and the Thai
        # name. `code` stays first because that is the string entitlement is keyed on.
        return f"{self.name_th or self.code} · ฿{self.price_satang / 100:,.2f} ({self.code})"


class Coupon(models.Model):
    """A discount on a Plan purchase.

    Deliberately NOT merged with PromoCode. PromoCode hands out free entitlement for a number
    of days and never touches money; this reduces the price of an order. They share nothing but
    the word "code", and folding them together would put a marketing discount on the same
    switch as a free-access grant.
    """

    class DiscountType(models.TextChoices):
        PERCENT = "percent", "ลดเป็นเปอร์เซ็นต์"
        FIXED = "fixed", "ลดเป็นจำนวนเงิน"

    code = models.CharField(
        max_length=64, unique=True, validators=(MinLengthValidator(4),), verbose_name="โค้ด",
        help_text="อย่างน้อย 4 ตัวอักษร ลูกค้าพิมพ์โค้ดนี้ตอนสั่งซื้อ (ไม่ต้องสนตัวพิมพ์เล็กใหญ่)",
    )
    discount_type = models.CharField(
        max_length=8, choices=DiscountType.choices, default=DiscountType.PERCENT, verbose_name="ประเภทส่วนลด",
    )
    # Percent (1-100) or satang, depending on discount_type.
    discount_value = models.PositiveIntegerField(
        verbose_name="ส่วนลด",
        help_text="ถ้าเลือก “ลดเป็นเปอร์เซ็นต์” ใส่ 20 = ลด 20% · ถ้าเลือก “ลดเป็นจำนวนเงิน” ใส่เป็นสตางค์ เช่น 5000 = ลด ฿50",
    )
    # 0 means unlimited. `used_count` is only ever moved under select_for_update.
    max_uses = models.PositiveIntegerField(
        default=0, verbose_name="จำกัดจำนวนครั้ง", help_text="ใส่ 0 = ใช้ได้ไม่จำกัดจำนวนครั้ง",
    )
    used_count = models.PositiveIntegerField(
        default=0, verbose_name="ใช้ไปแล้ว (ครั้ง)",
        help_text="ระบบนับให้เองเมื่อมีคนจ่ายเงินสำเร็จ ไม่ควรแก้มือ",
    )
    once_per_user = models.BooleanField(
        default=True, verbose_name="หนึ่งคนใช้ได้ครั้งเดียว",
        help_text="เปิดไว้ = คนเดิมใช้โค้ดนี้ซ้ำไม่ได้",
    )
    # Only meaningful for PERCENT. A percentage with no ceiling is fine on a ฿499 monthly plan and
    # is not fine on a ฿4,990 yearly one: the referral discount is specified as "10% แต่ไม่เกิน
    # ฿100", which cannot be said with the two columns above.
    max_discount_satang = models.PositiveIntegerField(
        default=0, verbose_name="ลดได้ไม่เกิน (สตางค์)",
        help_text="เพดานของส่วนลดแบบเปอร์เซ็นต์ ใส่เป็นสตางค์ เช่น 10000 = ลดได้ไม่เกิน ฿100 · "
                  "0 = ไม่มีเพดาน · ไม่มีผลกับส่วนลดแบบจำนวนเงิน",
    )
    # A code nobody can type unless it was handed to them personally. This is what makes the
    # invitee's referral discount possible — `code` is a single global string, so without this
    # anyone who saw a friend's checkout screen could use it — and it is also how an admin sends
    # a coupon straight into one account rather than publishing it.
    requires_grant = models.BooleanField(
        default=False, verbose_name="ต้องได้รับสิทธิ์ก่อนถึงใช้ได้",
        help_text="เปิดไว้ = ใช้ได้เฉพาะคนที่ระบบหรือแอดมินมอบสิทธิ์ให้ (ดูที่ “สิทธิ์ใช้คูปอง”) "
                  "คนอื่นพิมพ์โค้ดนี้จะขึ้นว่าไม่พบโค้ด",
    )
    valid_from = models.DateTimeField(
        null=True, blank=True, verbose_name="เริ่มใช้ได้", help_text="เว้นว่าง = ใช้ได้ทันที",
    )
    valid_until = models.DateTimeField(
        null=True, blank=True, verbose_name="ใช้ได้ถึง", help_text="เว้นว่าง = ไม่มีวันหมดอายุ",
    )
    min_amount_satang = models.PositiveIntegerField(
        default=0, verbose_name="ยอดขั้นต่ำ (สตางค์)",
        help_text="ราคาแผนต้องไม่ต่ำกว่านี้ถึงใช้โค้ดได้ ใส่เป็นสตางค์ · 0 = ไม่มีขั้นต่ำ",
    )
    # Empty means every plan.
    applies_to_plans = models.ManyToManyField(
        Plan, blank=True, related_name="coupons", verbose_name="ใช้ได้กับแผน",
        help_text="ไม่เลือกอะไรเลย = ใช้ได้กับทุกแผน",
    )
    is_active = models.BooleanField(
        default=True, verbose_name="เปิดใช้งาน", help_text="ปิดแล้วโค้ดใช้ไม่ได้ทันที ใช้กรณีโค้ดหลุด",
    )
    note = models.CharField(
        max_length=200, blank=True, verbose_name="บันทึกช่วยจำ", help_text="ลูกค้าไม่เห็นข้อความนี้",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="สร้างเมื่อ")

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "คูปองส่วนลด"
        verbose_name_plural = "คูปองส่วนลด"

    def __str__(self):
        return self.code


class Order(models.Model):
    """One purchase attempt. Created before the provider is contacted, never after.

    An order that exists without a payment is a lead; a payment that arrives without an order
    is unattributable money. So the record comes first.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "รอชำระเงิน"
        PAID = "paid", "จ่ายแล้ว"
        FAILED = "failed", "ล้มเหลว"
        REFUNDED = "refunded", "คืนเงินแล้ว"
        CANCELLED = "cancelled", "ยกเลิก"

    class Provider(models.TextChoices):
        # Bank transfer confirmed by a superuser in admin. The only provider that works before
        # a merchant account exists, and the fallback whenever one is down.
        MANUAL = "manual", "โอนเงิน (ยืนยันเอง)"
        OMISE = "omise", "Omise (PromptPay)"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders", verbose_name="ผู้ซื้อ",
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="orders", verbose_name="แผน")
    coupon = models.ForeignKey(
        Coupon, null=True, blank=True, on_delete=models.PROTECT, related_name="orders",
        verbose_name="คูปองที่ใช้",
    )
    subtotal_satang = models.PositiveIntegerField(verbose_name="ราคาก่อนลด (สตางค์)")
    discount_satang = models.PositiveIntegerField(default=0, verbose_name="ส่วนลด (สตางค์)")
    # Credit earmarked at checkout. The matching negative CreditLedger row is written when the
    # order is activated, not here — a pending order that is never paid must not spend anything,
    # exactly as an abandoned checkout must not burn a coupon.
    credit_satang = models.PositiveIntegerField(
        default=0, verbose_name="ใช้เครดิต (สตางค์)",
        help_text="เครดิตที่ผู้ซื้อเลือกใช้กับคำสั่งซื้อนี้ · หักหลังส่วนลดคูปอง",
    )
    total_satang = models.PositiveIntegerField(
        verbose_name="ยอดที่ต้องจ่าย (สตางค์)",
        help_text="ราคาก่อนลด ลบ ส่วนลด ลบ เครดิต · คอลัมน์ในตารางแปลงเป็นบาทให้แล้ว",
    )
    currency = models.CharField(max_length=3, default="THB", verbose_name="สกุลเงิน")
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING, verbose_name="สถานะ",
        help_text="แก้ช่องนี้เองไม่ได้ · เปิดสิทธิ์โดยติ๊กคำสั่งซื้อในหน้ารายการ แล้วเลือก "
                  "\"ยืนยันการชำระเงิน — เปิดสิทธิ์ให้ผู้ใช้\" จากเมนู Action",
    )
    provider = models.CharField(
        max_length=10, choices=Provider.choices, default=Provider.MANUAL, verbose_name="ช่องทางชำระเงิน",
    )
    # Unique when set, so replaying a provider callback cannot create a second paid order for
    # the same charge. Enforced by the constraint below rather than by application code.
    provider_charge_id = models.CharField(
        max_length=128, blank=True, verbose_name="รหัสรายการจากผู้ให้บริการ",
        help_text="รหัสอ้างอิงจาก Omise ใช้ตรวจสอบย้อนหลังเวลาเงินมีปัญหา",
    )
    note = models.CharField(
        max_length=200, blank=True, verbose_name="บันทึกช่วยจำ",
        help_text="เช่น เลขที่สลิปโอนเงิน หรือเหตุผลที่ยกเลิก",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="สั่งซื้อเมื่อ")
    paid_at = models.DateTimeField(null=True, blank=True, verbose_name="จ่ายเมื่อ")

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "คำสั่งซื้อ"
        verbose_name_plural = "คำสั่งซื้อ"
        constraints = (
            models.UniqueConstraint(
                fields=("provider", "provider_charge_id"),
                condition=models.Q(provider_charge_id__gt=""),
                name="unique_provider_charge",
            ),
        )
        indexes = (models.Index(fields=("user", "-created_at")),)

    def __str__(self):
        return f"#{self.pk} {self.plan_id} ฿{self.total_satang / 100:,.2f} ({self.get_status_display()})"


class CouponRedemption(models.Model):
    """Written only when an order is actually paid, never when one is created.

    Counting at creation would let an abandoned checkout burn a limited coupon.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="coupon_redemptions",
        verbose_name="ผู้ใช้",
    )
    coupon = models.ForeignKey(Coupon, on_delete=models.PROTECT, related_name="redemptions", verbose_name="คูปอง")
    order = models.OneToOneField(
        Order, on_delete=models.CASCADE, related_name="coupon_redemption", verbose_name="คำสั่งซื้อ",
    )
    redeemed_at = models.DateTimeField(auto_now_add=True, verbose_name="ใช้เมื่อ")

    class Meta:
        ordering = ("-redeemed_at",)
        indexes = (models.Index(fields=("user", "coupon")),)
        verbose_name = "การใช้คูปอง"
        verbose_name_plural = "การใช้คูปอง"


class CouponGrant(models.Model):
    """Permission for one account to use one `requires_grant` coupon.

    Written by the referral flow when an invited account signs up, and by an admin sending a
    coupon to somebody directly. It is deliberately not a coupon of its own: reusing `Coupon`
    means `validate_coupon`, `discount_for`, `CouponRedemption`, the admin screens, the usage
    report and the CSV export all already work on referral discounts, and there is one place
    where "what does this code take off the price" is decided rather than two.

    `used_order` is set when the grant is actually spent, at activation rather than at checkout,
    for the same reason `CouponRedemption` is: an abandoned checkout must not burn it.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="coupon_grants",
        verbose_name="ผู้ใช้",
    )
    coupon = models.ForeignKey(
        Coupon, on_delete=models.CASCADE, related_name="grants", verbose_name="คูปอง",
    )
    referral = models.ForeignKey(
        "Referral", null=True, blank=True, on_delete=models.SET_NULL, related_name="coupon_grants",
        verbose_name="มาจากการชวนเพื่อน",
        help_text="ว่างไว้ = แอดมินมอบให้เอง ไม่ได้มาจากระบบชวนเพื่อน",
    )
    used_order = models.OneToOneField(
        "Order", null=True, blank=True, on_delete=models.SET_NULL, related_name="coupon_grant",
        verbose_name="ใช้กับคำสั่งซื้อ",
    )
    expires_at = models.DateTimeField(
        null=True, blank=True, verbose_name="สิทธิ์หมดอายุ", help_text="เว้นว่าง = ไม่มีวันหมดอายุ",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="ได้รับเมื่อ")

    class Meta:
        ordering = ("-created_at",)
        constraints = (
            models.UniqueConstraint(fields=("user", "coupon"), name="unique_coupon_grant"),
        )
        verbose_name = "สิทธิ์ใช้คูปอง"
        verbose_name_plural = "สิทธิ์ใช้คูปอง"

    def __str__(self):
        return f"{self.coupon_id} → {self.user_id}"


class ReferralCode(models.Model):
    """One shareable code per account.

    Minted on first read rather than at signup: most accounts never open the invite screen, and
    a code nobody has seen is a row nobody needs.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="referral_code",
        verbose_name="ผู้ใช้",
    )
    code = models.CharField(
        max_length=16, unique=True, verbose_name="โค้ดชวนเพื่อน",
        help_text="โค้ดที่ผู้ใช้เอาไปแชร์ ระบบสร้างให้อัตโนมัติ",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="สร้างเมื่อ")

    class Meta:
        verbose_name = "โค้ดชวนเพื่อน"
        verbose_name_plural = "โค้ดชวนเพื่อน"

    def __str__(self):
        return self.code


class Referral(models.Model):
    """One invited account, and whether the inviter has earned anything for it.

    `invitee` is a OneToOne on purpose. "One reward per person, ever" is then a database
    constraint rather than a rule some code path can forget, and the classic referral fraud —
    the same account claimed by several inviters, or claimed twice — is refused by Postgres
    before any of this module runs.

    The reward is not paid here. It vests inside `billing.activate()` when the invited account
    pays for something, because a reward paid at signup is a reward paid for creating an email
    address.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "รอเพื่อนจ่ายเงิน"
        QUALIFIED = "qualified", "ได้รางวัลแล้ว"
        # Held back for a human to look at rather than paid or dropped: over the monthly cap, or
        # something about the pair looked like one person with two accounts.
        HELD = "held", "พักไว้ให้ตรวจสอบ"
        REJECTED = "rejected", "ไม่อนุมัติ"
        CLAWED_BACK = "clawed_back", "เรียกคืนรางวัลแล้ว"

    inviter = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="referrals_made",
        verbose_name="ผู้ชวน",
    )
    invitee = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="referred_by",
        verbose_name="เพื่อนที่ถูกชวน",
        help_text="หนึ่งบัญชีถูกชวนได้ครั้งเดียวตลอดไป ฐานข้อมูลบังคับไว้ ไม่ใช่โค้ด",
    )
    # Snapshotted, so a row still explains itself if the inviter's code is ever regenerated.
    code = models.CharField(max_length=16, verbose_name="โค้ดที่ใช้")
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.PENDING, db_index=True,
        verbose_name="สถานะ",
    )
    qualifying_order = models.ForeignKey(
        "Order", null=True, blank=True, on_delete=models.SET_NULL, related_name="referrals",
        verbose_name="คำสั่งซื้อที่ทำให้ได้รางวัล",
    )
    # sha256 of the signup IP salted with SECRET_KEY, held only while a payout decision is open
    # and cleared the moment the row leaves `pending`. DailyActive's docstring sets this
    # codebase's position — it records no IP anywhere, deliberately — and this is the narrowest
    # exception that still catches somebody inviting themselves: a one-way digest, kept for days
    # rather than forever, and only where real money turns on the answer.
    signup_ip_hash = models.CharField(
        max_length=64, blank=True, verbose_name="ลายนิ้วมือ IP ตอนสมัคร",
        help_text="ค่าแฮชทางเดียว ใช้ดูว่าผู้ชวนกับเพื่อนเป็นคนเดียวกันหรือเปล่า "
                  "ระบบลบทิ้งเองเมื่อตัดสินเรื่องรางวัลเสร็จ",
    )
    note = models.CharField(
        max_length=200, blank=True, verbose_name="บันทึกช่วยจำ", help_text="ผู้ใช้ไม่เห็นข้อความนี้",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="ชวนเมื่อ")
    qualified_at = models.DateTimeField(null=True, blank=True, verbose_name="ได้รางวัลเมื่อ")

    class Meta:
        ordering = ("-created_at",)
        indexes = (models.Index(fields=("inviter", "status")),)
        verbose_name = "การชวนเพื่อน"
        verbose_name_plural = "การชวนเพื่อน"

    def __str__(self):
        return f"{self.inviter_id} → {self.invitee_id} ({self.get_status_display()})"


class CreditLedger(models.Model):
    """Every movement of in-app credit. Append-only, signed, never edited.

    There is deliberately no balance column anywhere. A cached balance and a ledger disagree
    exactly once — at the worst possible moment, for the worst possible reason — and this is
    money, and since withdrawals were added it is money that leaves the building. The balance is
    `Sum('amount_satang')` and it is always derivable from rows an operator can read.

    A clawback is a new negative row, never a deletion or an edit of the row that granted the
    reward: the admin for this model refuses both, because the history of a payout dispute is the
    only thing that can settle it.
    """

    class Kind(models.TextChoices):
        REFERRAL_REWARD = "referral_reward", "รางวัลชวนเพื่อน"
        ORDER_SPEND = "order_spend", "ใช้จ่ายค่าสมาชิก"
        WITHDRAWAL = "withdrawal", "ขอถอนเงิน"
        ADMIN_ADJUST = "admin_adjust", "แอดมินปรับยอด"
        CLAWBACK = "clawback", "เรียกคืนรางวัล"
        REFUND = "refund", "คืนเครดิต"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="credit_entries",
        verbose_name="ผู้ใช้",
    )
    # Signed: negative rows are spends and clawbacks. PositiveIntegerField plus a direction column
    # would let a row be written that says "+" and means "−".
    amount_satang = models.IntegerField(
        verbose_name="จำนวน (สตางค์)",
        help_text="บวก = ได้รับเครดิต · ลบ = ใช้หรือถูกเรียกคืน · ใส่เป็นสตางค์ เช่น 3000 = ฿30",
    )
    kind = models.CharField(max_length=16, choices=Kind.choices, verbose_name="ประเภท")
    referral = models.ForeignKey(
        Referral, null=True, blank=True, on_delete=models.SET_NULL, related_name="credit_entries",
        verbose_name="การชวนเพื่อนที่เกี่ยวข้อง",
    )
    order = models.ForeignKey(
        "Order", null=True, blank=True, on_delete=models.SET_NULL, related_name="credit_entries",
        verbose_name="คำสั่งซื้อที่เกี่ยวข้อง",
    )
    note = models.CharField(max_length=200, blank=True, verbose_name="หมายเหตุ")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="เมื่อ")

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = (models.Index(fields=("user", "-created_at")),)
        verbose_name = "รายการเครดิต"
        verbose_name_plural = "รายการเครดิต"

    def __str__(self):
        return f"{self.user_id} {self.amount_satang / 100:+,.2f} ({self.get_kind_display()})"


class Subscription(models.Model):
    """Entitlement with an end date.

    The group membership is what `_user_plan()` actually reads; this row is the reason the
    group is there and when it should come off. Expiry is applied on read (see views) rather
    than by a scheduled job, for the same reason `_vip_expires_at` is: a job that stops running
    leaves paid entitlement switched on for everyone, forever.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "ใช้งานอยู่"
        CANCELLED = "cancelled", "ยกเลิกแล้ว"
        EXPIRED = "expired", "หมดอายุ"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="subscriptions", verbose_name="ผู้ใช้",
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions", verbose_name="แผน")
    order = models.ForeignKey(
        Order, null=True, blank=True, on_delete=models.SET_NULL, related_name="subscriptions",
        verbose_name="คำสั่งซื้อที่เป็นต้นทาง",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE, verbose_name="สถานะ")
    current_period_end = models.DateTimeField(
        verbose_name="สิทธิ์ถึงวันที่",
        help_text="ถึงวันนี้แล้วระบบจะถอดสิทธิ์ให้เองตอนผู้ใช้เปิดแอป ไม่ต้องรอ cron",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True, verbose_name="ยกเลิกเมื่อ")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="เริ่มเมื่อ")

    class Meta:
        ordering = ("-current_period_end",)
        indexes = (models.Index(fields=("user", "status", "current_period_end")),)
        verbose_name = "สมาชิกรายเดือน"
        verbose_name_plural = "สมาชิกรายเดือน"


class Notification(models.Model):
    """Something the app needs to tell one user about, and a record that it was told.

    In-app first: the row IS the notification, and email and push are two optional deliveries of
    the same row rather than three separate systems that can disagree about what was sent.

    `dedupe_key` is what makes the renewal reminder job safe to run twice. The unique constraint
    is on (user, kind, dedupe_key), so a beat task re-firing after a container restart inserts
    nothing rather than sending a second "your plan expires in three days" at 3am.
    """

    class Kind(models.TextChoices):
        RENEWAL_DUE = "renewal_due", "ใกล้ครบกำหนดต่ออายุ"
        RENEWAL_LAPSED = "renewal_lapsed", "สมาชิกหมดอายุแล้ว"
        REFERRAL_REWARD = "referral_reward", "ได้รางวัลชวนเพื่อน"
        REFERRAL_JOINED = "referral_joined", "เพื่อนสมัครแล้ว"
        COUPON_GRANTED = "coupon_granted", "ได้รับคูปอง"
        ORDER_PAID = "order_paid", "ยืนยันการชำระเงินแล้ว"
        WITHDRAWAL_PAID = "withdrawal_paid", "โอนเงินที่ขอถอนแล้ว"
        WITHDRAWAL_REJECTED = "withdrawal_rejected", "คำขอถอนเงินไม่ผ่าน"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications",
        verbose_name="ผู้ใช้",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices, verbose_name="ประเภท")
    # Rendered when the row is written rather than at read time, so the message a user saw stays
    # what they saw even after the wording in code changes.
    title = models.CharField(max_length=120, verbose_name="หัวข้อ")
    body = models.CharField(max_length=400, blank=True, verbose_name="ข้อความ")
    payload = models.JSONField(
        default=dict, blank=True, verbose_name="ข้อมูลเพิ่มเติม",
        help_text="เช่น รหัสแผนหรือคำสั่งซื้อ ให้หน้าเว็บพาไปหน้าที่ถูกต้อง",
    )
    dedupe_key = models.CharField(
        max_length=80, blank=True, verbose_name="กันส่งซ้ำ",
        help_text="งานที่รันซ้ำจะเขียนแถวเดิมไม่สำเร็จ แทนที่จะส่งซ้ำ",
    )
    read_at = models.DateTimeField(null=True, blank=True, verbose_name="อ่านเมื่อ")
    emailed_at = models.DateTimeField(null=True, blank=True, verbose_name="ส่งอีเมลเมื่อ")
    pushed_at = models.DateTimeField(null=True, blank=True, verbose_name="ส่ง push เมื่อ")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="เมื่อ")

    class Meta:
        ordering = ("-created_at",)
        constraints = (
            models.UniqueConstraint(
                fields=("user", "kind", "dedupe_key"),
                condition=models.Q(dedupe_key__gt=""),
                name="unique_notification_dedupe",
            ),
        )
        indexes = (models.Index(fields=("user", "-created_at")),)
        verbose_name = "การแจ้งเตือน"
        verbose_name_plural = "การแจ้งเตือน"

    def __str__(self):
        return f"{self.get_kind_display()} → {self.user_id}"


class PushToken(models.Model):
    """Where to reach one installation of the app.

    Several rows per user is normal — a phone and a tablet — and a token belongs to a device, not
    a person, so `token` is unique on its own: reinstalling on a shared device must move the token
    to whoever signed in last rather than send their notifications to the previous owner.
    """

    class Platform(models.TextChoices):
        IOS = "ios", "iOS"
        ANDROID = "android", "Android"
        WEB = "web", "เว็บ"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_tokens",
        verbose_name="ผู้ใช้",
    )
    token = models.CharField(max_length=255, unique=True, verbose_name="โทเค็นอุปกรณ์")
    platform = models.CharField(
        max_length=8, choices=Platform.choices, default=Platform.WEB, verbose_name="แพลตฟอร์ม",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="ลงทะเบียนเมื่อ")
    last_seen_at = models.DateTimeField(auto_now=True, verbose_name="ใช้ล่าสุด")

    class Meta:
        ordering = ("-last_seen_at",)
        verbose_name = "อุปกรณ์รับการแจ้งเตือน"
        verbose_name_plural = "อุปกรณ์รับการแจ้งเตือน"

    def __str__(self):
        return f"{self.get_platform_display()} · {self.user_id}"


class DailyActive(models.Model):
    """One row per user per day they used the app. The whole of the usage analytics.

    Nothing recorded who was here before this: the app authenticates with Firebase tokens and
    never calls django.contrib.auth.login(), so `User.last_login` is null for every account.
    Only side effects were visible — a scan, a chat turn, an order — which counts people who
    *did* something and misses everyone who opened the app, read their score card and left.

    Deliberately just (user, date). No IP, no user agent, no page path: this app measures
    faces, and a behavioural log is a much heavier thing to hold than a visit count. Anything
    beyond "how many people, which day" needs a reason better than "it might be useful".
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="daily_active", verbose_name="ผู้ใช้",
    )
    date = models.DateField(verbose_name="วันที่")

    class Meta:
        ordering = ("-date",)
        constraints = (models.UniqueConstraint(fields=("user", "date"), name="unique_daily_active"),)
        # Every report groups by date across all users, never by user.
        indexes = (models.Index(fields=("date",)),)
        verbose_name = "ผู้ใช้งานรายวัน"
        verbose_name_plural = "ผู้ใช้งานรายวัน"

    def __str__(self):
        return f"{self.user_id} @ {self.date}"


class Visit(models.Model):
    """How many times the site was opened, and from which link. Counts, not people.

    An aggregate row, not a log. There is no identifier of any kind here — no visitor id, no
    cookie, no IP hash — so there is no way to ask what one visitor did, and nothing in this
    table needs a consent gate. A stable pseudonymous id would be personal data whether or not
    it were hashed, which is the same argument `DailyActive` above makes against page paths.

    Duplicate arrivals are filtered on the client, which stores only a date string and posts at
    most once per browser per day. So `hits` is "browsers that opened the site", not "people":
    one person on a phone and a laptop is two. The admin page says so in those words, because a
    number labelled "ผู้เข้าชม" that quietly means something else is worse than no number.

    Written by a JavaScript POST, which is also most of the bot defence: the endpoint appears in
    no HTML, so a crawler that does not run scripts never finds it. Not expired by
    cleanup_expired_data — there is nothing personal here to expire, and deleting at a year
    would make year-on-year comparison impossible. That omission is deliberate.
    """

    date = models.DateField(verbose_name="วันที่")
    source = models.CharField(max_length=32, default="direct", verbose_name="แหล่งที่มา")
    medium = models.CharField(max_length=32, default="direct", verbose_name="ช่องทาง")
    campaign = models.CharField(max_length=32, default="direct", verbose_name="แคมเปญ")
    # Normalised against a whitelist before it gets here (see attribution.clean_path). A free
    # path column is how the page-path log this app refuses to keep would grow back, one campaign
    # link with an id in it at a time.
    landing_path = models.CharField(max_length=32, default="/", verbose_name="หน้าที่เข้ามา")
    device = models.CharField(
        max_length=8,
        choices=(("mobile", "มือถือ"), ("desktop", "คอมพิวเตอร์")),
        default="desktop",
        verbose_name="อุปกรณ์",
    )
    hits = models.PositiveIntegerField(default=0, verbose_name="จำนวนครั้ง")

    class Meta:
        ordering = ("-date",)
        constraints = (
            models.UniqueConstraint(
                fields=("date", "source", "medium", "campaign", "landing_path", "device"),
                name="unique_visit_bucket",
            ),
        )
        # Every report groups by date over all buckets, never by bucket over all dates.
        indexes = (models.Index(fields=("date",)),)
        verbose_name = "ผู้เข้าชมเว็บ"
        verbose_name_plural = "ผู้เข้าชมเว็บ"

    def __str__(self):
        return f"{self.date} · {self.source}/{self.campaign} · {self.hits}"


class UserAttribution(models.Model):
    """Which link brought this account here. First touch, written once, never updated.

    Unlike `Visit` this *is* personal data — a marketing channel attached to someone who can be
    identified — which is exactly why it is a separate table rather than a column on Visit.

    It therefore has to be declared in the privacy policy, and it is not yet: LoginPage still
    links `#privacy` at a document that does not exist. The sentence to add when it does:

        แหล่งที่มาของการเข้าเว็บ (เช่น ลิงก์จากโฆษณา) ถูกเก็บเป็นตัวเลขรวมรายวันโดยไม่ระบุตัวบุคคล
        และสำหรับบัญชีที่สมัครแล้วจะเก็บว่ามาจากช่องทางไหนหนึ่งครั้ง

    It dies with the account through the cascade; note
    that `delete_account` only removes the User row immediately when there are no scan images to
    purge first, so on that path this row outlives the request by as long as the cleanup takes.
    That is the same posture as `Order` and `DailyActive`, not a new one.

    Overwriting on a later visit would credit whichever ad the user happened to click most
    recently for a decision they had already made, so `attach_attribution` only ever creates.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attribution", verbose_name="ผู้ใช้",
    )
    source = models.CharField(max_length=32, default="direct", verbose_name="แหล่งที่มา")
    medium = models.CharField(max_length=32, default="direct", verbose_name="ช่องทาง")
    campaign = models.CharField(max_length=32, default="direct", verbose_name="แคมเปญ")
    landing_path = models.CharField(max_length=32, default="/", verbose_name="หน้าที่เข้ามา")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="บันทึกเมื่อ")

    class Meta:
        ordering = ("-created_at",)
        # Grouped by source or by campaign on every row of the marketing report.
        indexes = (models.Index(fields=("source",)), models.Index(fields=("campaign",)))
        verbose_name = "ที่มาของผู้ใช้"
        verbose_name_plural = "ที่มาของผู้ใช้"

    def __str__(self):
        return f"{self.user_id} ← {self.source}/{self.campaign}"


class ChatSetting(models.Model):
    """How DOODEE Chat behaves, editable without a deploy.

    One row, always pk=1. A settings table rather than more environment variables because the
    people who tune a chatbot's voice are not the people who redeploy containers.

    What is deliberately NOT here: the safety rules. `chat.py` appends them to whatever is
    written below, on every request, and nothing in the admin can remove them. The product
    tells users on the score card and in its consent copy that it will not judge appearance or
    give medical advice; a text box that could quietly retract that promise would make the
    promise worthless.
    """

    class Provider(models.TextChoices):
        GEMINI = "gemini", "Google Gemini — เร็ว ประหยัด และฉลาด"
        ANTHROPIC = "anthropic", "Anthropic (Claude) — สำหรับใช้งานจริง"
        OPENAI = "openai", "OpenAI / OpenAI-compatible"

    class Model(models.TextChoices):
        GEMINI_2_5_FLASH = "gemini-2.5-flash", "Gemini 2.5 Flash — แนะนำ รวดเร็วและแม่นยำ"
        GEMINI_2_0_FLASH = "gemini-2.0-flash", "Gemini 2.0 Flash — ความเร็วสูง"
        OPUS = "claude-opus-5", "Opus 5 — ฉลาดที่สุด แพงที่สุด"
        SONNET = "claude-sonnet-5", "Sonnet 5 — สมดุล"
        HAIKU = "claude-haiku-4-5-20251001", "Haiku 4.5 — เร็วและถูกที่สุด"

    class Effort(models.TextChoices):
        LOW = "low", "ต่ำ — ตอบเร็ว ประหยัด"
        MEDIUM = "medium", "กลาง"
        HIGH = "high", "สูง — คิดละเอียด ช้าและแพงขึ้น"

    persona = models.TextField(
        blank=True, verbose_name="บุคลิกและวิธีตอบ",
        help_text="เขียนว่าอยากให้ AI พูดจาแบบไหน เช่น สั้น เป็นกันเอง เรียกผู้ใช้ว่า “คุณ” "
                  "· กฎความปลอดภัย (ห้ามตัดสินความสวย ไม่ใช่คำวินิจฉัยแพทย์ ห้ามรับประกันผล) "
                  "ระบบต่อท้ายให้เสมอและลบไม่ได้ · เว้นว่างได้",
    )
    provider = models.CharField(
        max_length=16, choices=Provider.choices, default=Provider.GEMINI, verbose_name="ผู้ให้บริการ",
        help_text="คีย์ของแต่ละเจ้าเก็บใน .env ไม่ได้เก็บในฐานข้อมูล — "
                  "Gemini ใช้ GEMINI_API_KEY (หรือ GOOGLE_API_KEY) · Anthropic ใช้ ANTHROPIC_API_KEY · เจ้าอื่นใช้ CHAT_API_KEY",
    )
    model = models.CharField(
        max_length=96, default="gemini-2.5-flash", verbose_name="โมเดล",
        help_text="Gemini: gemini-2.5-flash · gemini-2.0-flash — "
                  "Anthropic: claude-opus-5 · claude-sonnet-5 · claude-haiku-4-5-20251001 — "
                  "Groq: openai/gpt-oss-120b — OpenRouter: ใส่ชื่อที่ลงท้าย :free — "
                  "Ollama: llama3.2 · เปลี่ยนแล้วมีผลกับข้อความถัดไปทันที ไม่ต้อง deploy",
    )
    base_url = models.CharField(
        max_length=200, blank=True, default="", verbose_name="ที่อยู่ API (เฉพาะ OpenAI-compatible)",
        help_text="Groq: https://api.groq.com/openai/v1 — "
                  "OpenRouter: https://openrouter.ai/api/v1 — "
                  "Ollama บนเครื่องเดียวกัน: http://host.docker.internal:11434/v1 · "
                  "เว้นว่างเมื่อใช้ Gemini หรือ Anthropic",
    )
    effort = models.CharField(
        max_length=8, choices=Effort.choices, default=Effort.LOW, verbose_name="ระดับการคิด",
    )
    max_tokens = models.PositiveIntegerField(
        default=1000, verbose_name="ความยาวคำตอบสูงสุด (โทเค็น)",
        help_text="ประมาณ 1,500 โทเค็น ≈ 3-4 ย่อหน้า · ยิ่งมากยิ่งจ่ายแพงต่อคำตอบ",
    )
    # `free_turns` and `paid_turns` used to live here. They could express exactly two allowances
    # for every tier that has ever existed, and the product now sells three, so the monthly
    # ceiling moved to `Plan.chat_turns_per_month` — still editable without a deploy, just on the
    # row that decides every other allowance too. They are not kept as read-only leftovers: a
    # number in the admin that nothing reads is worse than no number at all.
    #
    # The abuse bound `paid_turns` was really for did not move with it. That job belongs to
    # `settings.CHAT_HOURLY_CEILING`, because a plan sold as unlimited has no monthly ceiling to
    # hide behind and a stolen Pro account would otherwise run at the budget until someone
    # noticed the invoice.
    updated_at = models.DateTimeField(auto_now=True, verbose_name="แก้ไขล่าสุด")

    class Meta:
        verbose_name = "ตั้งค่า AI แชท"
        verbose_name_plural = "ตั้งค่า AI แชท"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.provider == self.Provider.OPENAI and not self.base_url.strip():
            # Caught here rather than at request time: an empty URL would surface to a user as
            # "chat is down", hours after the setting was saved and by someone else.
            raise ValidationError({"base_url": "ต้องใส่ที่อยู่ API เมื่อเลือก OpenAI-compatible"})

    def save(self, *args, **kwargs):
        # Pinned so "add another" can never produce a second row that silently does nothing.
        self.pk = 1
        super().save(*args, **kwargs)
        # So a read later in the same request sees this write rather than the pre-save row.
        request_cache.clear("ChatSetting.current")

    @classmethod
    def current(cls):
        """The live settings, creating the row from the model defaults on first read.

        Once the row exists an operator's edits win and nothing outside the admin can move them.
        That is the intended trade — one place to look, and it is the admin.

        Memoised per request: one `GET /session/` used to read this row several times over, from
        the view, from `chat_enabled()` and from the chat rate limiter, and nothing between those
        calls can change it. Scope ends with the request, so an admin edit lands on the next one.
        """
        return request_cache.get_or_set(
            "ChatSetting.current", lambda: cls.objects.get_or_create(pk=1)[0]
        )

    def __str__(self):
        return "ตั้งค่า AI แชท"


class ChatTopic(models.Model):
    """The suggested-question chips.

    Only the wording, order and visibility live here. The *answers* are computed in
    `chat_facts.py` from the scan's own numbers — that is what makes them free and impossible
    to hallucinate — so a topic cannot be invented from the admin, only reworded or hidden.
    """

    key = models.CharField(
        max_length=32, unique=True, verbose_name="รหัสหัวข้อ",
        help_text="ผูกกับสูตรคำนวณคำตอบในโค้ด แก้ไม่ได้",
    )
    label_th = models.CharField(max_length=120, verbose_name="คำถาม (ไทย)")
    label_en = models.CharField(max_length=160, verbose_name="คำถาม (อังกฤษ)")
    is_active = models.BooleanField(
        default=True, verbose_name="แสดงบนหน้าแชท",
        help_text="ปิดแล้วปุ่มนี้จะหายจากหน้าแชททันที",
    )
    sort_order = models.PositiveSmallIntegerField(default=0, verbose_name="ลำดับ", help_text="เลขน้อยอยู่ก่อน")

    class Meta:
        ordering = ("sort_order", "id")
        verbose_name = "คำถามสำเร็จรูปในแชท"
        verbose_name_plural = "คำถามสำเร็จรูปในแชท"

    def label(self, lang):
        return self.label_en if lang == "en" else self.label_th

    def __str__(self):
        return self.label_th


class ChatRole(models.Model):
    """The voice the user picks in the chat header.

    Tone only. Every role can do exactly the same things — answer from the scan's own numbers
    and suggest the reversible, non-medical steps the product already promises — because
    `chat.py` appends the same safety rules to all of them. A role changes *how* something is
    said, never *what may be said*, and the rules end by saying so in as many words.

    Bound to a conversation rather than a message: the system block carries the prompt-cache
    breakpoint, so a voice that changed mid-thread would miss the cache on every turn.
    """

    key = models.CharField(
        max_length=32, unique=True, verbose_name="รหัสโรล",
        help_text="ใช้อ้างอิงในโค้ดและเก็บไว้กับห้องแชท แก้ไม่ได้",
    )
    label_th = models.CharField(max_length=60, verbose_name="ชื่อโรล (ไทย)")
    label_en = models.CharField(max_length=80, verbose_name="ชื่อโรล (อังกฤษ)")
    description_th = models.CharField(
        max_length=160, blank=True, verbose_name="คำอธิบายสั้น (ไทย)",
        help_text="ข้อความใต้ชื่อโรลบนหน้าแชท บอกผู้ใช้ว่าเลือกแล้วจะได้คำตอบแบบไหน",
    )
    description_en = models.CharField(max_length=200, blank=True, verbose_name="คำอธิบายสั้น (อังกฤษ)")
    persona = models.TextField(
        verbose_name="น้ำเสียง",
        help_text="เขียนว่าโรลนี้พูดยังไง · กฎความปลอดภัยระบบต่อท้ายให้เสมอและลบไม่ได้ "
                  "รวมถึงกฎที่ว่าน้ำเสียงเปลี่ยนได้แค่วิธีพูด ไม่เปลี่ยนสิ่งที่พูดได้",
    )
    is_active = models.BooleanField(
        default=True, verbose_name="เปิดใช้งาน", help_text="ปิดแล้วปุ่มนี้จะหายจากหน้าแชททันที",
    )
    is_default = models.BooleanField(
        default=False, verbose_name="เป็นค่าเริ่มต้น",
        help_text="โรลที่ห้องใหม่ใช้เมื่อผู้ใช้ไม่ได้เลือก · ควรเปิดไว้ตัวเดียว",
    )
    sort_order = models.PositiveSmallIntegerField(default=0, verbose_name="ลำดับ", help_text="เลขน้อยอยู่ก่อน")

    class Meta:
        ordering = ("sort_order", "id")
        verbose_name = "โรลของ AI แชท"
        verbose_name_plural = "โรลของ AI แชท"

    def label(self, lang):
        return self.label_en if lang == "en" else self.label_th

    def description(self, lang):
        return self.description_en if lang == "en" else self.description_th

    @classmethod
    def resolve(cls, key):
        """The role for `key`, falling back to the default and then to None.

        Never raises on an unknown or switched-off key: a stale role id from an old browser
        tab should get the house voice, not a 500.
        """
        active = cls.objects.filter(is_active=True)
        if key:
            found = active.filter(key=key).first()
            if found:
                return found
        return active.filter(is_default=True).first() or active.first()

    def __str__(self):
        return self.label_th


class SiteSetting(models.Model):
    """Every operational number that is a business decision rather than a code decision.

    One row, always pk=1, the same shape as `ChatSetting` — and for the same reason its docstring
    gives: the people who decide what a referral is worth are not the people who redeploy
    containers. Before this existed, changing ฿30 to ฿50 meant editing `settings.py`, rebuilding an
    image and restarting; now it is one field on one admin page.

    What is deliberately NOT here:

    * **Plan prices and quotas.** They belong on `Plan`, one row per tier, because they differ per
      tier and this table has exactly one row.
    * **The invited friend's discount.** It has to be a real `Coupon` for `validate_coupon` and
      `discount_for` to work on it, so it lives on the `FRIEND10` row. The admin fieldset here
      links to it so nobody has to know that.
    * **`PAYOUT_ENCRYPTION_KEY`.** A secret kept in the database it protects is not protecting
      anything. That one stays in the environment.

    Read at call time, never cached in a module global: an admin edit has to take effect on the
    next request, which is the entire point.
    """

    # ---- ชวนเพื่อน
    referral_enabled = models.BooleanField(
        default=True, verbose_name="เปิดระบบชวนเพื่อน",
        help_text="ปิดแล้วรับโค้ดชวนใหม่ไม่ได้ทันที · รางวัลที่จ่ายไปแล้วไม่กระทบ",
    )
    reward_satang = models.PositiveIntegerField(
        default=3000, verbose_name="รางวัลผู้ชวน (สตางค์)",
        help_text="ใส่เป็นสตางค์ เช่น 3000 = ฿30 · จ่ายเมื่อเพื่อนที่ถูกชวนจ่ายเงินครั้งแรก "
                  "· แก้แล้วมีผลกับรายการถัดไป รางวัลที่จ่ายไปแล้วไม่เปลี่ยนย้อนหลัง",
    )
    max_qualified_per_month = models.PositiveIntegerField(
        default=10, verbose_name="จ่ายรางวัลได้สูงสุด (คน/เดือน/ผู้ชวนหนึ่งคน)",
        help_text="เกินจากนี้ระบบจะพักรายการไว้ให้คนตรวจสอบ ไม่ได้ปฏิเสธและไม่ได้จ่ายเงียบๆ · ใส่ 0 = ไม่จำกัด",
    )
    claim_window_hours = models.PositiveIntegerField(
        default=24, verbose_name="ใช้โค้ดชวนได้ภายใน (ชั่วโมงหลังสมัคร)",
        help_text="requirement กำหนดว่าส่วนลดนี้ให้ตอนสมัครใหม่ ไม่ใช่ให้คนที่มีบัญชีอยู่แล้วมากรอกทีหลัง · ใส่ 0 = ไม่จำกัดเวลา",
    )
    require_verified_email = models.BooleanField(
        default=True, verbose_name="ต้องยืนยันตัวตนก่อนรับโค้ดชวน",
        help_text="อีเมลที่ยืนยันแล้ว หรือเข้าสู่ระบบด้วย Google · ปิดแล้ว “ต้องมีการยืนยันตัวตน” จะไม่มีผลจริง "
                  "และอีเมลปลอมสร้างได้ฟรีในขณะที่รางวัลเป็นเงินจริง",
    )

    # ---- การถอนเงิน
    withdrawal_enabled = models.BooleanField(
        default=True, verbose_name="เปิดให้ถอนเงิน",
        help_text="ปิดแล้วขอถอนใหม่ไม่ได้ · รายการที่ค้างอยู่ยังต้องจัดการให้เสร็จ",
    )
    withdrawal_min_satang = models.PositiveIntegerField(
        default=30000, verbose_name="ถอนขั้นต่ำ (สตางค์)",
        help_text="ใส่เป็นสตางค์ เช่น 30000 = ฿300 · ตั้งต่ำเกินไปจะกลายเป็นงานโอนเงินทีละ ฿30 ด้วยมือ",
    )
    withdrawal_hold_days = models.PositiveIntegerField(
        default=0, verbose_name="รางวัลต้องอยู่ครบกี่วันก่อนถอนได้",
        help_text="ตอนนี้ตั้ง 0 ได้เพราะรับเงินทาง PromptPay และโอนธนาคาร ซึ่งเรียกคืนไม่ได้ "
                  "· ถ้าวันไหนเปิดรับบัตรเครดิต ต้องตั้งค่านี้ให้ยาวกว่าระยะเวลาที่บัตรขอเงินคืนได้",
    )

    # ---- สมาชิก
    subscription_grace_days = models.PositiveIntegerField(
        default=3, verbose_name="ผ่อนผันหลังหมดอายุ (วัน)",
        help_text="คนที่โอนเงินช้าไปหนึ่งวันยังเป็นลูกค้าอยู่ · สถานะในรายงานยังขึ้นว่าหมดอายุตามจริง "
                  "เปลี่ยนแค่ว่าปิดสิทธิ์เมื่อไร",
    )

    # ---- เพดานกันการใช้งานผิดปกติ
    chat_hourly_ceiling = models.PositiveIntegerField(
        default=60, verbose_name="แชทได้สูงสุด (ครั้ง/ชั่วโมง)",
        help_text="ไม่ใช่โควตาของแผน แต่เป็นเพดานกันบัญชีถูกยึดแล้วยิงจนงบหมด · ใช้กับทุกแผนรวมถึงแผนไม่จำกัด",
    )
    preview_hourly_ceiling = models.PositiveIntegerField(
        default=120, verbose_name="ดูผลจำลองได้สูงสุด (ครั้ง/ชั่วโมง)",
        help_text="เหตุผลเดียวกับเพดานแชท · จำกัดว่าหนึ่งบัญชีกิน CPU ได้เท่าไรในหนึ่งชั่วโมง",
    )

    # ---- การรับเงิน
    #
    # Where a customer sends money, and where they send the slip. Deliberately here rather than
    # in code or in the client bundle: it is a business fact that changes without a deploy, and
    # the same reasoning that put the referral reward here applies to it.
    #
    # Deliberately *not* encrypted, unlike `PayoutAccount`. That table holds a customer's own
    # account and exists to be kept secret; this one is the company's and exists to be read by
    # strangers. Encrypting it would only stop the people who need it.
    #
    # `create_order` refuses while `transfer_account_number` and `slip_contact` are blank. An
    # order a customer has no way to pay is worse than no order: they believe they have bought
    # something, and the first thing the product does to them is fail silently.
    transfer_bank = models.CharField(
        max_length=60, blank=True, verbose_name="ธนาคารที่รับโอน",
        help_text="เช่น กสิกรไทย · เว้นว่างได้ถ้ารับเฉพาะพร้อมเพย์",
    )
    transfer_account_name = models.CharField(
        max_length=120, blank=True, verbose_name="ชื่อบัญชีที่รับโอน",
        help_text="ชื่อที่ลูกค้าจะเห็นตอนโอน ต้องตรงกับบัญชีจริง",
    )
    transfer_account_number = models.CharField(
        max_length=40, blank=True, verbose_name="เลขบัญชี / พร้อมเพย์",
        help_text="ลูกค้าเห็นเลขนี้เต็ม ๆ เพราะต้องโอนเข้ามา · ว่างอยู่ = ขายไม่ได้ ระบบจะปฏิเสธคำสั่งซื้อ",
    )
    slip_contact = models.CharField(
        max_length=120, blank=True, verbose_name="ส่งสลิปมาที่",
        help_text="เช่น LINE @doodee หรืออีเมล · ว่างอยู่ = ขายไม่ได้ เพราะลูกค้าไม่รู้จะส่งหลักฐานไปทางไหน",
    )

    updated_at = models.DateTimeField(auto_now=True, verbose_name="แก้ไขล่าสุด")

    @property
    def can_accept_transfers(self):
        """Whether a customer told to pay by transfer has both halves of the instruction.

        Both, not either: an account number with nowhere to send the slip leaves the money
        arrived and the order still pending, and a contact with no account number leaves them
        asking where to send it.
        """
        return bool(self.transfer_account_number.strip() and self.slip_contact.strip())

    def payment_instructions(self):
        """What the checkout screen shows after an order is placed, or None when unsellable."""
        if not self.can_accept_transfers:
            return None
        return {
            "bank": self.transfer_bank,
            "account_name": self.transfer_account_name,
            "account_number": self.transfer_account_number,
            "slip_contact": self.slip_contact,
        }

    class Meta:
        verbose_name = "ตั้งค่าระบบสมาชิกและชวนเพื่อน"
        verbose_name_plural = "ตั้งค่าระบบสมาชิกและชวนเพื่อน"

    def save(self, *args, **kwargs):
        # Pinned so "add another" can never produce a second row that silently does nothing.
        self.pk = 1
        super().save(*args, **kwargs)
        request_cache.clear("SiteSetting.current")

    @classmethod
    def current(cls):
        """Memoised per request, for the reason ChatSetting.current gives: `entitlement._grace`,
        the chat ceiling and the preview ceiling all read this row within one request."""
        return request_cache.get_or_set(
            "SiteSetting.current", lambda: cls.objects.get_or_create(pk=1)[0]
        )

    def __str__(self):
        return "ตั้งค่าระบบสมาชิกและชวนเพื่อน"


class PayoutAccount(models.Model):
    """Where one user's withdrawn money is sent. One per account.

    The number is **encrypted at rest** and only `number_last4` is ever plain. That is not
    ceremony: this table is the single place in the product holding customer bank details, a
    database dump is the realistic way it leaks, and four digits are enough for a person to
    recognise their own account while being useless to anybody else.

    Reading the full number requires the key from the environment and an explicit, audited action
    in the admin — see `payout.decrypt_number` and `PayoutAccountAdmin.reveal_account_number`.
    """

    class Method(models.TextChoices):
        PROMPTPAY = "promptpay", "พร้อมเพย์"
        BANK = "bank", "บัญชีธนาคาร"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payout_account",
        verbose_name="ผู้ใช้",
    )
    method = models.CharField(
        max_length=10, choices=Method.choices, default=Method.PROMPTPAY, verbose_name="ช่องทางรับเงิน",
    )
    bank = models.CharField(
        max_length=40, blank=True, verbose_name="ธนาคาร",
        help_text="เว้นว่างเมื่อรับเงินทางพร้อมเพย์",
    )
    account_name = models.CharField(
        max_length=120, verbose_name="ชื่อบัญชี",
        help_text="ต้องตรงกับชื่อในบัญชีจริง ไม่งั้นโอนไม่ผ่าน",
    )
    # Fernet ciphertext. Bytes rather than text so nothing is tempted to print it as a string.
    number_encrypted = models.BinaryField(verbose_name="เลขบัญชี (เข้ารหัสไว้)")
    number_last4 = models.CharField(
        max_length=4, verbose_name="เลขท้าย",
        help_text="เก็บไว้แบบอ่านได้ตัวเดียว เพื่อให้ผู้ใช้จำบัญชีตัวเองได้โดยไม่ต้องถอดรหัส",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="เพิ่มเมื่อ")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="แก้ไขล่าสุด")

    class Meta:
        verbose_name = "บัญชีรับเงิน"
        verbose_name_plural = "บัญชีรับเงิน"

    @property
    def masked(self):
        return f"••••{self.number_last4}"

    def __str__(self):
        label = self.get_method_display() if self.method == self.Method.PROMPTPAY else self.bank
        return f"{label} {self.masked} · {self.account_name}"


class WithdrawalRequest(models.Model):
    """A user asking for their credit as real money, and the record of what an operator did.

    There is no automated payout rail. An admin reads this queue, makes the transfer by hand and
    records the reference — the same shape as `Order.Provider.MANUAL`, in the opposite direction.

    Three live states rather than two. `approved` means "checked, not yet sent", which is a real
    thing that is true between triaging requests in the morning and going to the bank in the
    afternoon; collapsing it into `paid` would mean an operator either marks money sent before it
    is, or keeps the queue in their head.

    The credit is deducted when the request is **created**, not when it is paid. See
    `payout.request_withdrawal` for why.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "รอตรวจสอบ"
        APPROVED = "approved", "อนุมัติแล้ว รอโอน"
        PAID = "paid", "โอนแล้ว"
        REJECTED = "rejected", "ไม่อนุมัติ"
        CANCELLED = "cancelled", "ผู้ใช้ยกเลิก"

    # The states in which the money is still committed and has not been returned.
    OPEN_STATUSES = ("pending", "approved")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="withdrawals",
        verbose_name="ผู้ขอถอน",
    )
    amount_satang = models.PositiveIntegerField(
        verbose_name="จำนวนที่ขอถอน (สตางค์)",
        help_text="คอลัมน์ในตารางแปลงเป็นบาทให้แล้ว",
    )
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING, verbose_name="สถานะ",
        help_text="อย่าแก้ช่องนี้มือ ให้ใช้ปุ่มด้านบน มิฉะนั้นเครดิตกับสถานะจะไม่ตรงกัน",
    )
    # A copy of the payout details as they stood when the request was made, ciphertext included.
    # A user who edits their bank account afterwards must not silently redirect a payout already
    # sitting in an operator's queue, and the record of where money actually went has to outlive
    # any later edit.
    destination = models.JSONField(
        default=dict, verbose_name="ปลายทางตอนที่ขอถอน",
        help_text="สำเนาข้อมูลบัญชี ณ เวลาที่กดขอถอน · ถ้าผู้ใช้แก้บัญชีทีหลัง รายการนี้ไม่เปลี่ยนตาม",
    )
    reference = models.CharField(
        max_length=120, blank=True, verbose_name="อ้างอิงการโอน",
        help_text="เลขอ้างอิงหรือเลขที่สลิป · ต้องกรอกก่อนถึงจะบันทึกว่าโอนแล้วได้",
    )
    note = models.CharField(max_length=200, blank=True, verbose_name="บันทึกช่วยจำ")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="withdrawals_reviewed", verbose_name="ผู้ตรวจสอบ",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True, verbose_name="ตรวจสอบเมื่อ")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="ขอเมื่อ")
    paid_at = models.DateTimeField(null=True, blank=True, verbose_name="โอนเมื่อ")

    class Meta:
        ordering = ("-created_at",)
        # The admin queue reads exactly this: oldest open request first.
        indexes = (models.Index(fields=("status", "created_at")),)
        verbose_name = "คำขอถอนเงิน"
        verbose_name_plural = "คำขอถอนเงิน"

    @property
    def masked_destination(self):
        data = self.destination or {}
        label = data.get("bank") or "พร้อมเพย์"
        return f"{label} ••••{data.get('number_last4', '')} · {data.get('account_name', '')}"

    def __str__(self):
        return f"#{self.pk} ฿{self.amount_satang / 100:,.2f} ({self.get_status_display()})"
