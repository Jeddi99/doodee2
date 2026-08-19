"""Seed the chip rows from the topics defined in chat_facts.py.

Seeded rather than left empty so the admin opens on the wording that is already live, instead
of a blank table an operator has to guess the shape of. `update_or_create` on `key` keeps a
later topic added in code from needing a hand-written migration, and never overwrites wording
an operator has already changed.
"""

from django.db import migrations


def seed(apps, schema_editor):
    from doodee.chat_facts import TOPICS

    ChatTopic = apps.get_model("doodee", "ChatTopic")
    for order, (key, (label_th, label_en), _builder) in enumerate(TOPICS):
        ChatTopic.objects.update_or_create(
            key=key,
            defaults={"sort_order": order},
            create_defaults={"label_th": label_th, "label_en": label_en, "sort_order": order},
        )


def unseed(apps, schema_editor):
    apps.get_model("doodee", "ChatTopic").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("doodee", "0016_chatsetting_chattopic")]
    operations = [migrations.RunPython(seed, unseed)]
