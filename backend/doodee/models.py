import uuid

from django.conf import settings
from django.core.validators import MinLengthValidator
from django.db import models


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
        # Separate from ANALYSIS because it is the only purpose that sends anything off this
        # system. Analysis and simulation both run here; a typed chat question sends the
        # scan's twelve measurements to Anthropic. Photographs are never sent (see chat.py),
        # but numbers derived from a face still leave, and consent to be measured is not
        # consent to be forwarded.
        CHAT = "chat", "ส่งตัวเลขให้โมเดลภายนอก (แชท)"

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
        QUEUED = "queued", "รอคิว"
        PROCESSING = "processing", "กำลังประมวลผล"
        COMPLETED = "completed", "เสร็จแล้ว"
        FAILED = "failed", "ล้มเหลว"
        DELETION_PENDING = "deletion_pending", "รอลบ"

    class ScanMode(models.TextChoices):
        FULL = "full", "ครบ 7 มุม"
        STANDARD = "standard", "หน้าตรงและด้านข้างสองข้าง"
        FAST = "fast", "เร็ว 3 มุม"

    class AgeBand(models.TextChoices):
        ADULT = "adult", "18 ปีขึ้นไป"
        MINOR = "minor", "ต่ำกว่า 18 ปี"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="scans", verbose_name="ผู้ใช้",
    )
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.QUEUED, db_index=True, verbose_name="สถานะ",
    )
    progress = models.PositiveSmallIntegerField(default=0, verbose_name="ความคืบหน้า (%)")
    age_band = models.CharField(max_length=8, choices=AgeBand.choices, verbose_name="ช่วงอายุ")
    reference_age_band = models.CharField(max_length=16, default="18_35", verbose_name="ช่วงอายุกลุ่มอ้างอิง")
    reference_profile = models.CharField(max_length=12, default="neutral", verbose_name="โปรไฟล์กลุ่มอ้างอิง")
    reference_population = models.CharField(max_length=8, default="TH", verbose_name="ประชากรอ้างอิง")
    scan_mode = models.CharField(
        max_length=16, choices=ScanMode.choices, default=ScanMode.FULL, verbose_name="โหมดการสแกน",
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
        verbose_name = "การสแกน"
        verbose_name_plural = "การสแกน"


class Simulation(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "รอคิว"
        PROCESSING = "processing", "กำลังประมวลผล"
        COMPLETED = "completed", "เสร็จแล้ว"
        FAILED = "failed", "ล้มเหลว"
        DELETION_PENDING = "deletion_pending", "รอลบ"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scan = models.ForeignKey(Scan, on_delete=models.CASCADE, related_name="simulations", verbose_name="การสแกน")
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.QUEUED, db_index=True, verbose_name="สถานะ",
    )
    progress = models.PositiveSmallIntegerField(default=0, verbose_name="ความคืบหน้า (%)")
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
    error_code = models.CharField(max_length=40, blank=True, verbose_name="รหัสข้อผิดพลาด")
    error_message = models.CharField(max_length=500, blank=True, verbose_name="ข้อความข้อผิดพลาด")
    expires_at = models.DateTimeField(verbose_name="หมดอายุ")
    deletion_requested_at = models.DateTimeField(null=True, blank=True, verbose_name="ผู้ใช้ขอลบเมื่อ")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="สร้างเมื่อ")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="แก้ไขล่าสุด")

    class Meta:
        ordering = ("-created_at",)
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
    total_satang = models.PositiveIntegerField(
        verbose_name="ยอดที่ต้องจ่าย (สตางค์)", help_text="ราคาก่อนลด ลบ ส่วนลด · คอลัมน์ในตารางแปลงเป็นบาทให้แล้ว",
    )
    currency = models.CharField(max_length=3, default="THB", verbose_name="สกุลเงิน")
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING, verbose_name="สถานะ",
        help_text="อย่าแก้ช่องนี้มือเพื่อเปิดสิทธิ์ ให้ใช้ปุ่ม “ยืนยันการชำระเงิน” ด้านบนแทน มิฉะนั้นผู้ใช้จะไม่ได้สิทธิ์",
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
        ANTHROPIC = "anthropic", "Anthropic (Claude) — สำหรับใช้งานจริง"
        OPENAI = "openai", "OpenAI-compatible (Groq / OpenRouter / Ollama) — สำหรับทดสอบ"

    class Model(models.TextChoices):
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
        max_length=16, choices=Provider.choices, default=Provider.ANTHROPIC, verbose_name="ผู้ให้บริการ",
        help_text="คีย์ของแต่ละเจ้าเก็บใน .env ไม่ได้เก็บในฐานข้อมูล — "
                  "Anthropic ใช้ ANTHROPIC_API_KEY · เจ้าอื่นใช้ CHAT_API_KEY (Ollama ไม่ต้องใช้คีย์)",
    )
    model = models.CharField(
        max_length=96, default=Model.OPUS, verbose_name="โมเดล",
        help_text="Anthropic: claude-opus-5 · claude-sonnet-5 · claude-haiku-4-5-20251001 — "
                  "Groq: llama-3.3-70b-versatile — OpenRouter: ใส่ชื่อที่ลงท้าย :free — "
                  "Ollama: llama3.2 · เปลี่ยนแล้วมีผลกับข้อความถัดไปทันที ไม่ต้อง deploy",
    )
    base_url = models.CharField(
        max_length=200, blank=True, verbose_name="ที่อยู่ API (เฉพาะ OpenAI-compatible)",
        help_text="Groq: https://api.groq.com/openai/v1 — "
                  "OpenRouter: https://openrouter.ai/api/v1 — "
                  "Ollama บนเครื่องเดียวกัน: http://host.docker.internal:11434/v1 · "
                  "เว้นว่างเมื่อใช้ Anthropic",
    )
    effort = models.CharField(
        max_length=8, choices=Effort.choices, default=Effort.LOW, verbose_name="ระดับการคิด",
    )
    max_tokens = models.PositiveIntegerField(
        default=1500, verbose_name="ความยาวคำตอบสูงสุด (โทเค็น)",
        help_text="ประมาณ 1,500 โทเค็น ≈ 3-4 ย่อหน้า · ยิ่งมากยิ่งจ่ายแพงต่อคำตอบ",
    )
    free_turns = models.PositiveIntegerField(
        default=5, verbose_name="โควตาแผนฟรี (ครั้ง/เดือน)",
        help_text="นับเฉพาะคำถามที่พิมพ์เอง คำถามสำเร็จรูปไม่กินโควตา",
    )
    paid_turns = models.PositiveIntegerField(
        default=300, verbose_name="โควตาแผนจ่ายเงิน (ครั้ง/เดือน)",
        help_text="เพดานกันบัญชีถูกยึดแล้วยิงจนงบหมด ไม่ใช่การจำกัดการใช้งานปกติ",
    )
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

    @classmethod
    def current(cls):
        """The live settings, creating the row from the environment on first read.

        The env vars are the starting point, not the authority: once the row exists an
        operator's edits win, and changing the variable afterwards does nothing. That is the
        intended trade — one place to look, and it is the admin.
        """
        from django.conf import settings as django_settings

        return cls.objects.get_or_create(pk=1, defaults={
            "free_turns": django_settings.CHAT_FREE_TURNS,
            "paid_turns": django_settings.CHAT_PAID_TURNS,
        })[0]

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
