"""The coupon an invited friend receives.

requirement.md: "เพื่อนที่ถูกชวนได้ส่วนลด 10% 100 บาท 1 ครั้ง เมื่อสมัครสมาชิกครั้งแรกโดยใช้โค้ด" —
ten percent, capped at ฿100, once per account.

It is an ordinary `Coupon` rather than a mechanism of its own. That is the whole reason
`max_discount_satang` and `requires_grant` were added to the model instead: with them, the invited
friend's discount runs through `validate_coupon`, `discount_for`, `CouponRedemption`, the admin
screens, the usage report and the CSV export exactly as every other discount does, and there is one
place where "what does this take off the price" is decided.

`requires_grant` is what keeps it private. `code` is a single global string, so without it anybody
who saw a friend's checkout screen could type FRIEND10 and get the discount without ever having
been invited.
"""

from django.db import migrations


CODE = "FRIEND10"


def seed(apps, schema_editor):
    Coupon = apps.get_model("doodee", "Coupon")
    Coupon.objects.get_or_create(code=CODE, defaults={
        "discount_type": "percent",
        "discount_value": 10,
        # ฿100. Without the cap, 10% of the ฿4,990 yearly plan is ฿499 — five times what was
        # offered, on the plan most likely to be bought with a discount in hand.
        "max_discount_satang": 10000,
        "once_per_user": True,
        "requires_grant": True,
        # Unlimited total uses: the ceiling on this coupon is how many people get invited, which
        # `CouponGrant` already controls one account at a time.
        "max_uses": 0,
        "is_active": True,
        "note": "ส่วนลดสำหรับเพื่อนที่ถูกชวน · ระบบมอบสิทธิ์ให้อัตโนมัติตอนสมัคร ห้ามแจกโค้ดนี้เอง",
    })


def unseed(apps, schema_editor):
    Coupon = apps.get_model("doodee", "Coupon")
    # Only if nobody has actually spent it. A coupon attached to a paid order is a record of a
    # real transaction, and Order.coupon is PROTECT, so this states the reason rather than
    # letting the delete fail with a foreign-key error.
    Coupon.objects.filter(code=CODE, orders__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [("doodee", "0024_referral_credit_notification")]
    operations = [migrations.RunPython(seed, unseed)]
