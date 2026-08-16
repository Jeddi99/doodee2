from django.db import migrations


# Kept in step with MEMBERSHIP_GROUPS in doodee/admin.py, which is also where they were
# previously created — lazily, only once a superuser happened to set someone's membership.
# A fresh database therefore had neither group, while _user_plan() in views.py reads them
# by name on every request. Seeding them here makes the entitlement ladder exist from the
# first migrate instead of appearing as a side effect of unrelated admin activity.
MEMBERSHIP_GROUPS = ("pro_member", "clinic_partner")


def create_groups(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    for name in MEMBERSHIP_GROUPS:
        Group.objects.get_or_create(name=name)


def delete_groups(apps, schema_editor):
    """Only removes groups that nobody belongs to — a populated group means real
    entitlements, and dropping it would silently downgrade those users to free."""
    Group = apps.get_model("auth", "Group")
    for name in MEMBERSHIP_GROUPS:
        group = Group.objects.filter(name=name).first()
        if group and not group.user_set.exists():
            group.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("doodee", "0007_simulation_selections"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunPython(create_groups, delete_groups),
    ]
