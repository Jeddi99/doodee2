import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q


def use_luna(apps, schema_editor):
    apps.get_model("doodee", "ChatSetting").objects.update(
        provider="openai", model="gpt-5.6-luna", base_url="https://api.openai.com/v1",
        effort="low", max_tokens=1000,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("doodee", "0028_visit_userattribution_scan_capture_method"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="scan", name="status",
            field=models.CharField(choices=[("uploading", "กำลังอัปโหลด"), ("queued", "รอคิว"), ("processing", "กำลังประมวลผล"), ("completed", "เสร็จแล้ว"), ("failed", "ล้มเหลว"), ("cancelled", "ยกเลิก"), ("deletion_pending", "รอลบ")], db_index=True, default="queued", max_length=24, verbose_name="สถานะ"),
        ),
        migrations.AddField(model_name="scan", name="idempotency_key", field=models.CharField(blank=True, default="", max_length=128, verbose_name="รหัสกันส่งซ้ำ")),
        migrations.AddField(model_name="scan", name="attempt_count", field=models.PositiveSmallIntegerField(default=0, verbose_name="จำนวนครั้งที่ประมวลผล")),
        migrations.AddField(model_name="scan", name="started_at", field=models.DateTimeField(blank=True, null=True, verbose_name="เริ่มประมวลผลเมื่อ")),
        migrations.AddField(model_name="scan", name="finished_at", field=models.DateTimeField(blank=True, null=True, verbose_name="จบประมวลผลเมื่อ")),
        migrations.AddConstraint(model_name="scan", constraint=models.UniqueConstraint(condition=~Q(idempotency_key=""), fields=("user", "idempotency_key"), name="unique_scan_idempotency_key")),
        migrations.AddIndex(model_name="scan", index=models.Index(fields=["status", "created_at"], name="doodee_scan_status_created_idx")),
        migrations.AlterField(
            model_name="simulation", name="status",
            field=models.CharField(choices=[("queued", "รอคิว"), ("processing", "กำลังประมวลผล"), ("completed", "เสร็จแล้ว"), ("failed", "ล้มเหลว"), ("cancelled", "ยกเลิก"), ("deletion_pending", "รอลบ")], db_index=True, default="queued", max_length=24, verbose_name="สถานะ"),
        ),
        migrations.AddField(model_name="simulation", name="kind", field=models.CharField(choices=[("preview", "พรีวิวชั่วคราว"), ("saved", "บันทึก")], db_index=True, default="saved", max_length=8, verbose_name="ชนิด")),
        migrations.AddField(model_name="simulation", name="idempotency_key", field=models.CharField(blank=True, default="", max_length=128, verbose_name="รหัสกันส่งซ้ำ")),
        migrations.AddField(model_name="simulation", name="attempt_count", field=models.PositiveSmallIntegerField(default=0, verbose_name="จำนวนครั้งที่ประมวลผล")),
        migrations.AddField(model_name="simulation", name="started_at", field=models.DateTimeField(blank=True, null=True, verbose_name="เริ่มประมวลผลเมื่อ")),
        migrations.AddField(model_name="simulation", name="finished_at", field=models.DateTimeField(blank=True, null=True, verbose_name="จบประมวลผลเมื่อ")),
        migrations.AddConstraint(model_name="simulation", constraint=models.UniqueConstraint(condition=~Q(idempotency_key=""), fields=("scan", "idempotency_key"), name="unique_simulation_idempotency_key")),
        migrations.AddIndex(model_name="simulation", index=models.Index(fields=["status", "created_at"], name="doodee_sim_status_created_idx")),
        migrations.CreateModel(
            name="AIUsageLedger",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("idempotency_key", models.CharField(max_length=128)),
                ("provider", models.CharField(max_length=16)),
                ("model", models.CharField(max_length=96)),
                ("status", models.CharField(choices=[("reserved", "กันงบแล้ว"), ("settled", "คิดเงินจริงแล้ว"), ("refunded", "คืนงบแล้ว"), ("uncertain", "รอตรวจสอบ")], db_index=True, default="reserved", max_length=12)),
                ("reserved_satang", models.PositiveIntegerField(default=0)),
                ("actual_satang", models.PositiveIntegerField(default=0)),
                ("input_tokens", models.PositiveIntegerField(default=0)),
                ("cached_input_tokens", models.PositiveIntegerField(default=0)),
                ("output_tokens", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("settled_at", models.DateTimeField(blank=True, null=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ai_usage_ledger", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "indexes": [models.Index(fields=["status", "created_at"], name="doodee_aiu_status_created_idx")],
                "constraints": [models.UniqueConstraint(fields=("user", "idempotency_key"), name="unique_ai_usage_request")],
            },
        ),
        migrations.AlterField(model_name="chatsetting", name="provider", field=models.CharField(choices=[("anthropic", "Anthropic (Claude) — สำหรับใช้งานจริง"), ("openai", "OpenAI / OpenAI-compatible")], default="openai", max_length=16, verbose_name="ผู้ให้บริการ", help_text="คีย์ของแต่ละเจ้าเก็บใน .env ไม่ได้เก็บในฐานข้อมูล — Anthropic ใช้ ANTHROPIC_API_KEY · เจ้าอื่นใช้ CHAT_API_KEY (Ollama ไม่ต้องใช้คีย์)")),
        migrations.AlterField(model_name="chatsetting", name="model", field=models.CharField(default="gpt-5.6-luna", help_text="Anthropic: claude-opus-5 · claude-sonnet-5 · claude-haiku-4-5-20251001 — Groq: llama-3.3-70b-versatile — OpenRouter: ใส่ชื่อที่ลงท้าย :free — Ollama: llama3.2 · เปลี่ยนแล้วมีผลกับข้อความถัดไปทันที ไม่ต้อง deploy", max_length=96, verbose_name="โมเดล")),
        migrations.AlterField(model_name="chatsetting", name="base_url", field=models.CharField(blank=True, default="https://api.openai.com/v1", help_text="Groq: https://api.groq.com/openai/v1 — OpenRouter: https://openrouter.ai/api/v1 — Ollama บนเครื่องเดียวกัน: http://host.docker.internal:11434/v1 · เว้นว่างเมื่อใช้ Anthropic", max_length=200, verbose_name="ที่อยู่ API (เฉพาะ OpenAI-compatible)")),
        migrations.AlterField(model_name="chatsetting", name="max_tokens", field=models.PositiveIntegerField(default=1000, help_text="ประมาณ 1,500 โทเค็น ≈ 3-4 ย่อหน้า · ยิ่งมากยิ่งจ่ายแพงต่อคำตอบ", verbose_name="ความยาวคำตอบสูงสุด (โทเค็น)")),
        migrations.RunPython(use_luna, migrations.RunPython.noop),
    ]
