"""The referral system, in-app credit, and the notification spine.

Five new tables and three new columns. The two on Coupon are what make the invited friend's
"10% แต่ไม่เกิน ฿100" expressible at all — a percentage with no ceiling is fine against a ฿499
monthly plan and is not fine against a ฿4,990 yearly one — and what lets a coupon be issued to one
account instead of published to everybody.

Nothing here pays anybody. The reward vests in `billing.activate()`, when the invited account
actually pays for something.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('doodee', '0023_drop_chatsetting_turn_quotas'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='coupon',
            name='max_discount_satang',
            field=models.PositiveIntegerField(default=0, help_text='เพดานของส่วนลดแบบเปอร์เซ็นต์ ใส่เป็นสตางค์ เช่น 10000 = ลดได้ไม่เกิน ฿100 · 0 = ไม่มีเพดาน · ไม่มีผลกับส่วนลดแบบจำนวนเงิน', verbose_name='ลดได้ไม่เกิน (สตางค์)'),
        ),
        migrations.AddField(
            model_name='coupon',
            name='requires_grant',
            field=models.BooleanField(default=False, help_text='เปิดไว้ = ใช้ได้เฉพาะคนที่ระบบหรือแอดมินมอบสิทธิ์ให้ (ดูที่ “สิทธิ์ใช้คูปอง”) คนอื่นพิมพ์โค้ดนี้จะขึ้นว่าไม่พบโค้ด', verbose_name='ต้องได้รับสิทธิ์ก่อนถึงใช้ได้'),
        ),
        migrations.AddField(
            model_name='order',
            name='credit_satang',
            field=models.PositiveIntegerField(default=0, help_text='เครดิตที่ผู้ซื้อเลือกใช้กับคำสั่งซื้อนี้ · หักหลังส่วนลดคูปอง', verbose_name='ใช้เครดิต (สตางค์)'),
        ),
        migrations.AlterField(
            model_name='order',
            name='total_satang',
            field=models.PositiveIntegerField(help_text='ราคาก่อนลด ลบ ส่วนลด ลบ เครดิต · คอลัมน์ในตารางแปลงเป็นบาทให้แล้ว', verbose_name='ยอดที่ต้องจ่าย (สตางค์)'),
        ),
        migrations.CreateModel(
            name='PushToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.CharField(max_length=255, unique=True, verbose_name='โทเค็นอุปกรณ์')),
                ('platform', models.CharField(choices=[('ios', 'iOS'), ('android', 'Android'), ('web', 'เว็บ')], default='web', max_length=8, verbose_name='แพลตฟอร์ม')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='ลงทะเบียนเมื่อ')),
                ('last_seen_at', models.DateTimeField(auto_now=True, verbose_name='ใช้ล่าสุด')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='push_tokens', to=settings.AUTH_USER_MODEL, verbose_name='ผู้ใช้')),
            ],
            options={
                'verbose_name': 'อุปกรณ์รับการแจ้งเตือน',
                'verbose_name_plural': 'อุปกรณ์รับการแจ้งเตือน',
                'ordering': ('-last_seen_at',),
            },
        ),
        migrations.CreateModel(
            name='Referral',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=16, verbose_name='โค้ดที่ใช้')),
                ('status', models.CharField(choices=[('pending', 'รอเพื่อนจ่ายเงิน'), ('qualified', 'ได้รางวัลแล้ว'), ('held', 'พักไว้ให้ตรวจสอบ'), ('rejected', 'ไม่อนุมัติ'), ('clawed_back', 'เรียกคืนรางวัลแล้ว')], db_index=True, default='pending', max_length=12, verbose_name='สถานะ')),
                ('signup_ip_hash', models.CharField(blank=True, help_text='ค่าแฮชทางเดียว ใช้ดูว่าผู้ชวนกับเพื่อนเป็นคนเดียวกันหรือเปล่า ระบบลบทิ้งเองเมื่อตัดสินเรื่องรางวัลเสร็จ', max_length=64, verbose_name='ลายนิ้วมือ IP ตอนสมัคร')),
                ('note', models.CharField(blank=True, help_text='ผู้ใช้ไม่เห็นข้อความนี้', max_length=200, verbose_name='บันทึกช่วยจำ')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='ชวนเมื่อ')),
                ('qualified_at', models.DateTimeField(blank=True, null=True, verbose_name='ได้รางวัลเมื่อ')),
                ('invitee', models.OneToOneField(help_text='หนึ่งบัญชีถูกชวนได้ครั้งเดียวตลอดไป ฐานข้อมูลบังคับไว้ ไม่ใช่โค้ด', on_delete=django.db.models.deletion.CASCADE, related_name='referred_by', to=settings.AUTH_USER_MODEL, verbose_name='เพื่อนที่ถูกชวน')),
                ('inviter', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='referrals_made', to=settings.AUTH_USER_MODEL, verbose_name='ผู้ชวน')),
                ('qualifying_order', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='referrals', to='doodee.order', verbose_name='คำสั่งซื้อที่ทำให้ได้รางวัล')),
            ],
            options={
                'verbose_name': 'การชวนเพื่อน',
                'verbose_name_plural': 'การชวนเพื่อน',
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='CreditLedger',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount_satang', models.IntegerField(help_text='บวก = ได้รับเครดิต · ลบ = ใช้หรือถูกเรียกคืน · ใส่เป็นสตางค์ เช่น 3000 = ฿30', verbose_name='จำนวน (สตางค์)')),
                ('kind', models.CharField(choices=[('referral_reward', 'รางวัลชวนเพื่อน'), ('order_spend', 'ใช้จ่ายค่าสมาชิก'), ('admin_adjust', 'แอดมินปรับยอด'), ('clawback', 'เรียกคืนรางวัล'), ('refund', 'คืนเครดิต')], max_length=16, verbose_name='ประเภท')),
                ('note', models.CharField(blank=True, max_length=200, verbose_name='หมายเหตุ')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='เมื่อ')),
                ('order', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='credit_entries', to='doodee.order', verbose_name='คำสั่งซื้อที่เกี่ยวข้อง')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='credit_entries', to=settings.AUTH_USER_MODEL, verbose_name='ผู้ใช้')),
                ('referral', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='credit_entries', to='doodee.referral', verbose_name='การชวนเพื่อนที่เกี่ยวข้อง')),
            ],
            options={
                'verbose_name': 'รายการเครดิต',
                'verbose_name_plural': 'รายการเครดิต',
                'ordering': ('-created_at', '-id'),
            },
        ),
        migrations.CreateModel(
            name='CouponGrant',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('expires_at', models.DateTimeField(blank=True, help_text='เว้นว่าง = ไม่มีวันหมดอายุ', null=True, verbose_name='สิทธิ์หมดอายุ')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='ได้รับเมื่อ')),
                ('coupon', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='grants', to='doodee.coupon', verbose_name='คูปอง')),
                ('used_order', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='coupon_grant', to='doodee.order', verbose_name='ใช้กับคำสั่งซื้อ')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='coupon_grants', to=settings.AUTH_USER_MODEL, verbose_name='ผู้ใช้')),
                ('referral', models.ForeignKey(blank=True, help_text='ว่างไว้ = แอดมินมอบให้เอง ไม่ได้มาจากระบบชวนเพื่อน', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='coupon_grants', to='doodee.referral', verbose_name='มาจากการชวนเพื่อน')),
            ],
            options={
                'verbose_name': 'สิทธิ์ใช้คูปอง',
                'verbose_name_plural': 'สิทธิ์ใช้คูปอง',
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='ReferralCode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(help_text='โค้ดที่ผู้ใช้เอาไปแชร์ ระบบสร้างให้อัตโนมัติ', max_length=16, unique=True, verbose_name='โค้ดชวนเพื่อน')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='สร้างเมื่อ')),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='referral_code', to=settings.AUTH_USER_MODEL, verbose_name='ผู้ใช้')),
            ],
            options={
                'verbose_name': 'โค้ดชวนเพื่อน',
                'verbose_name_plural': 'โค้ดชวนเพื่อน',
            },
        ),
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('renewal_due', 'ใกล้ครบกำหนดต่ออายุ'), ('renewal_lapsed', 'สมาชิกหมดอายุแล้ว'), ('referral_reward', 'ได้รางวัลชวนเพื่อน'), ('referral_joined', 'เพื่อนสมัครแล้ว'), ('coupon_granted', 'ได้รับคูปอง'), ('order_paid', 'ยืนยันการชำระเงินแล้ว')], max_length=20, verbose_name='ประเภท')),
                ('title', models.CharField(max_length=120, verbose_name='หัวข้อ')),
                ('body', models.CharField(blank=True, max_length=400, verbose_name='ข้อความ')),
                ('payload', models.JSONField(blank=True, default=dict, help_text='เช่น รหัสแผนหรือคำสั่งซื้อ ให้หน้าเว็บพาไปหน้าที่ถูกต้อง', verbose_name='ข้อมูลเพิ่มเติม')),
                ('dedupe_key', models.CharField(blank=True, help_text='งานที่รันซ้ำจะเขียนแถวเดิมไม่สำเร็จ แทนที่จะส่งซ้ำ', max_length=80, verbose_name='กันส่งซ้ำ')),
                ('read_at', models.DateTimeField(blank=True, null=True, verbose_name='อ่านเมื่อ')),
                ('emailed_at', models.DateTimeField(blank=True, null=True, verbose_name='ส่งอีเมลเมื่อ')),
                ('pushed_at', models.DateTimeField(blank=True, null=True, verbose_name='ส่ง push เมื่อ')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='เมื่อ')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to=settings.AUTH_USER_MODEL, verbose_name='ผู้ใช้')),
            ],
            options={
                'verbose_name': 'การแจ้งเตือน',
                'verbose_name_plural': 'การแจ้งเตือน',
                'ordering': ('-created_at',),
                'indexes': [models.Index(fields=['user', '-created_at'], name='doodee_noti_user_id_663441_idx')],
                'constraints': [models.UniqueConstraint(condition=models.Q(('dedupe_key__gt', '')), fields=('user', 'kind', 'dedupe_key'), name='unique_notification_dedupe')],
            },
        ),
        migrations.AddIndex(
            model_name='referral',
            index=models.Index(fields=['inviter', 'status'], name='doodee_refe_inviter_77d619_idx'),
        ),
        migrations.AddIndex(
            model_name='creditledger',
            index=models.Index(fields=['user', '-created_at'], name='doodee_cred_user_id_1bae79_idx'),
        ),
        migrations.AddConstraint(
            model_name='coupongrant',
            constraint=models.UniqueConstraint(fields=('user', 'coupon'), name='unique_coupon_grant'),
        ),
    ]
