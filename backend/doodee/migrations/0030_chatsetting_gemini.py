# Generated manually for Google Gemini 2.5 Flash support in ChatSetting

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('doodee', '0029_scaling_jobs'),
    ]

    operations = [
        migrations.AlterField(
            model_name='chatsetting',
            name='provider',
            field=models.CharField(
                choices=[
                    ('gemini', 'Google Gemini — เร็ว ประหยัด และฉลาด'),
                    ('anthropic', 'Anthropic (Claude) — สำหรับใช้งานจริง'),
                    ('openai', 'OpenAI / OpenAI-compatible'),
                ],
                default='gemini',
                help_text='คีย์ของแต่ละเจ้าเก็บใน .env ไม่ได้เก็บในฐานข้อมูล — Gemini ใช้ GEMINI_API_KEY (หรือ GOOGLE_API_KEY) · Anthropic ใช้ ANTHROPIC_API_KEY · เจ้าอื่นใช้ CHAT_API_KEY',
                max_length=16,
                verbose_name='ผู้ให้บริการ',
            ),
        ),
        migrations.AlterField(
            model_name='chatsetting',
            name='model',
            field=models.CharField(
                default='gemini-2.5-flash',
                help_text='Gemini: gemini-2.5-flash · gemini-2.0-flash — Anthropic: claude-opus-5 · claude-sonnet-5 · claude-haiku-4-5-20251001 — Groq: llama-3.3-70b-versatile — OpenRouter: ใส่ชื่อที่ลงท้าย :free — Ollama: llama3.2 · เปลี่ยนแล้วมีผลกับข้อความถัดไปทันที ไม่ต้อง deploy',
                max_length=96,
                verbose_name='โมเดล',
            ),
        ),
        migrations.AlterField(
            model_name='chatsetting',
            name='base_url',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Groq: https://api.groq.com/openai/v1 — OpenRouter: https://openrouter.ai/api/v1 — Ollama บนเครื่องเดียวกัน: http://host.docker.internal:11434/v1 · เว้นว่างเมื่อใช้ Gemini หรือ Anthropic',
                max_length=200,
                verbose_name='ที่อยู่ API (เฉพาะ OpenAI-compatible)',
            ),
        ),
    ]
