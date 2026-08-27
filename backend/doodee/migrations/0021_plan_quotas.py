"""Per-plan allowances.

The numbers these replace were literals in views.py — `3` written out four separate times — and
two columns on ChatSetting that between them could describe exactly two tiers. Three packages with
three different allowances cannot be said that way.

Defaults here are the *free* tier's, deliberately. A column that defaulted to the generous figure
would hand every existing free account a paid allowance the moment this migration ran; a column
that defaults to the mean figure would be wrong for everybody. 0021 makes every plan stingy and
0022 sets the real numbers per row, so at no point between the two is anything given away.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("doodee", "0020_seed_chat_roles")]

    operations = [
        migrations.AddField(
            model_name="plan",
            name="simulation_previews_per_month",
            field=models.IntegerField(
                default=0, verbose_name="ดูผลจำลองได้ (ครั้ง/เดือน)",
                help_text="นับทุกครั้งที่กดดูผลจำลอง (ตัวที่กินเครื่อง) · ใส่ -1 = ไม่จำกัด · 0 = ใช้ไม่ได้เลย",
            ),
        ),
        migrations.AddField(
            model_name="plan",
            name="simulation_saves_per_month",
            field=models.IntegerField(
                default=3, verbose_name="บันทึกภาพจำลองได้ (ครั้ง/เดือน)",
                help_text="การกดบันทึกเก็บไว้ในประวัติ · ใส่ -1 = ไม่จำกัด",
            ),
        ),
        migrations.AddField(
            model_name="plan",
            name="chat_turns_per_month",
            field=models.IntegerField(
                default=5, verbose_name="แชทได้ (ข้อความ/เดือน)",
                help_text="นับเฉพาะคำถามที่พิมพ์เอง คำถามสำเร็จรูปไม่กินโควตา · ใส่ -1 = ไม่จำกัด "
                          "(ยังมีเพดานรายชั่วโมงกันบัญชีถูกยึดอยู่)",
            ),
        ),
        migrations.AddField(
            model_name="plan",
            name="analysis_depth",
            field=models.CharField(
                choices=[("partial", "บอกบางส่วน (คะแนนรวมและตัวเด่น)"), ("full", "บอกครบทุกค่า")],
                default="partial", max_length=8, verbose_name="ความละเอียดของผลวิเคราะห์",
                help_text="“บอกบางส่วน” = เห็นคะแนนรวมกับตัวเด่นสองสามตัว ที่เหลือถูกซ่อนไว้ตั้งแต่ฝั่งเซิร์ฟเวอร์",
            ),
        ),
        migrations.AddField(
            model_name="plan",
            name="has_development_plan",
            field=models.BooleanField(
                default=False, verbose_name="ได้แผนพัฒนาตนเอง",
                help_text="แผนที่สร้างจากค่าที่วัดได้ของผู้ใช้เอง",
            ),
        ),
        migrations.AddField(
            model_name="plan",
            name="tier_rank",
            field=models.PositiveSmallIntegerField(
                default=0, verbose_name="ระดับของแผน",
                help_text="ใช้ตัดสินว่าถ้าผู้ใช้มีสิทธิ์ซ้อนกันหลายแผน จะได้สิทธิ์ของแผนไหน · เลขมากชนะ",
            ),
        ),
    ]
