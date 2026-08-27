"""One admin page for every operational number that is a business decision.

The reward a referral pays, the cap on how many pay out in a month, the claim window, the
withdrawal minimum, the grace period and the two per-hour abuse ceilings were all constants in
`settings.py`, or — in the case of the simulation ceiling — a literal `120` in `views.py`. Changing
any of them meant an image rebuild and a restart, which is the wrong requirement for "what is a
referral worth".

They move onto a singleton row, exactly as `ChatSetting` already does for the chat model and voice,
and for the reason that docstring gives: the people who decide these numbers are not the people who
redeploy containers.

The row is seeded from the environment variables that were driving the behaviour up to this
migration, so a running deployment comes out the other side with the figures it already had — an
operator's tuned value is carried over rather than reset to a default. After this, the environment
variables are dead and are deleted from `settings.py` in the same commit; the row is the authority.
"""

import os

from django.db import migrations, models


def _int(name, default):
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return int(default)


def _bool(name, default="true"):
    return os.getenv(name, default).lower() == "true"


def seed(apps, schema_editor):
    SiteSetting = apps.get_model("doodee", "SiteSetting")
    SiteSetting.objects.update_or_create(pk=1, defaults={
        "referral_enabled": _bool("REFERRAL_ENABLED"),
        "reward_satang": _int("REFERRAL_REWARD_SATANG", 3000),
        "max_qualified_per_month": _int("REFERRAL_MAX_QUALIFIED_PER_MONTH", 10),
        "claim_window_hours": _int("REFERRAL_CLAIM_WINDOW_HOURS", 24),
        "require_verified_email": _bool("REFERRAL_REQUIRE_VERIFIED_EMAIL"),
        "withdrawal_enabled": True,
        "withdrawal_min_satang": 30000,
        "withdrawal_hold_days": 0,
        "subscription_grace_days": _int("SUBSCRIPTION_GRACE_DAYS", 3),
        "chat_hourly_ceiling": _int("CHAT_HOURLY_CEILING", 60),
        # The literal that was in views.py until this migration.
        "preview_hourly_ceiling": 120,
    })


def unseed(apps, schema_editor):
    apps.get_model("doodee", "SiteSetting").objects.filter(pk=1).delete()


class Migration(migrations.Migration):
    dependencies = [("doodee", "0025_seed_referral_coupon")]

    operations = [
        migrations.CreateModel(
            name="SiteSetting",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("referral_enabled", models.BooleanField(
                    default=True, verbose_name="เปิดระบบชวนเพื่อน",
                    help_text="ปิดแล้วรับโค้ดชวนใหม่ไม่ได้ทันที · รางวัลที่จ่ายไปแล้วไม่กระทบ",
                )),
                ("reward_satang", models.PositiveIntegerField(
                    default=3000, verbose_name="รางวัลผู้ชวน (สตางค์)",
                    help_text="ใส่เป็นสตางค์ เช่น 3000 = ฿30 · จ่ายเมื่อเพื่อนที่ถูกชวนจ่ายเงินครั้งแรก "
                              "· แก้แล้วมีผลกับรายการถัดไป รางวัลที่จ่ายไปแล้วไม่เปลี่ยนย้อนหลัง",
                )),
                ("max_qualified_per_month", models.PositiveIntegerField(
                    default=10, verbose_name="จ่ายรางวัลได้สูงสุด (คน/เดือน/ผู้ชวนหนึ่งคน)",
                    help_text="เกินจากนี้ระบบจะพักรายการไว้ให้คนตรวจสอบ ไม่ได้ปฏิเสธและไม่ได้จ่ายเงียบๆ · ใส่ 0 = ไม่จำกัด",
                )),
                ("claim_window_hours", models.PositiveIntegerField(
                    default=24, verbose_name="ใช้โค้ดชวนได้ภายใน (ชั่วโมงหลังสมัคร)",
                    help_text="requirement กำหนดว่าส่วนลดนี้ให้ตอนสมัครใหม่ ไม่ใช่ให้คนที่มีบัญชีอยู่แล้วมากรอกทีหลัง · ใส่ 0 = ไม่จำกัดเวลา",
                )),
                ("require_verified_email", models.BooleanField(
                    default=True, verbose_name="ต้องยืนยันตัวตนก่อนรับโค้ดชวน",
                    help_text="อีเมลที่ยืนยันแล้ว หรือเข้าสู่ระบบด้วย Google · ปิดแล้ว “ต้องมีการยืนยันตัวตน” จะไม่มีผลจริง "
                              "และอีเมลปลอมสร้างได้ฟรีในขณะที่รางวัลเป็นเงินจริง",
                )),
                ("withdrawal_enabled", models.BooleanField(
                    default=True, verbose_name="เปิดให้ถอนเงิน",
                    help_text="ปิดแล้วขอถอนใหม่ไม่ได้ · รายการที่ค้างอยู่ยังต้องจัดการให้เสร็จ",
                )),
                ("withdrawal_min_satang", models.PositiveIntegerField(
                    default=30000, verbose_name="ถอนขั้นต่ำ (สตางค์)",
                    help_text="ใส่เป็นสตางค์ เช่น 30000 = ฿300 · ตั้งต่ำเกินไปจะกลายเป็นงานโอนเงินทีละ ฿30 ด้วยมือ",
                )),
                ("withdrawal_hold_days", models.PositiveIntegerField(
                    default=0, verbose_name="รางวัลต้องอยู่ครบกี่วันก่อนถอนได้",
                    help_text="ตอนนี้ตั้ง 0 ได้เพราะรับเงินทาง PromptPay และโอนธนาคาร ซึ่งเรียกคืนไม่ได้ "
                              "· ถ้าวันไหนเปิดรับบัตรเครดิต ต้องตั้งค่านี้ให้ยาวกว่าระยะเวลาที่บัตรขอเงินคืนได้",
                )),
                ("subscription_grace_days", models.PositiveIntegerField(
                    default=3, verbose_name="ผ่อนผันหลังหมดอายุ (วัน)",
                    help_text="คนที่โอนเงินช้าไปหนึ่งวันยังเป็นลูกค้าอยู่ · สถานะในรายงานยังขึ้นว่าหมดอายุตามจริง "
                              "เปลี่ยนแค่ว่าปิดสิทธิ์เมื่อไร",
                )),
                ("chat_hourly_ceiling", models.PositiveIntegerField(
                    default=60, verbose_name="แชทได้สูงสุด (ครั้ง/ชั่วโมง)",
                    help_text="ไม่ใช่โควตาของแผน แต่เป็นเพดานกันบัญชีถูกยึดแล้วยิงจนงบหมด · ใช้กับทุกแผนรวมถึงแผนไม่จำกัด",
                )),
                ("preview_hourly_ceiling", models.PositiveIntegerField(
                    default=120, verbose_name="ดูผลจำลองได้สูงสุด (ครั้ง/ชั่วโมง)",
                    help_text="เหตุผลเดียวกับเพดานแชท · จำกัดว่าหนึ่งบัญชีกิน CPU ได้เท่าไรในหนึ่งชั่วโมง",
                )),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="แก้ไขล่าสุด")),
            ],
            options={
                "verbose_name": "ตั้งค่าระบบสมาชิกและชวนเพื่อน",
                "verbose_name_plural": "ตั้งค่าระบบสมาชิกและชวนเพื่อน",
            },
        ),
        migrations.RunPython(seed, unseed),
    ]
