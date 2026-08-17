from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from doodee.demo_data import create_demo_scan
from doodee.models import Scan


class Command(BaseCommand):
    help = "Create a completed sample scan so the gated features can be used without a camera"

    def add_arguments(self, parser):
        parser.add_argument("email", help="Email of the account to give the sample scan to")
        parser.add_argument("--profile", default="neutral", help="Reference profile (default: neutral)")
        parser.add_argument("--replace", action="store_true", help="Delete existing demo scans first")

    def handle(self, *args, **options):
        User = get_user_model()
        user = User.objects.filter(email=options["email"]).first()
        if not user:
            # Creating the account here would mean minting a login nobody asked for.
            raise CommandError(f"No account with email {options['email']}")

        existing = Scan.objects.filter(user=user, is_demo=True)
        if options["replace"]:
            self.stdout.write(f"removed {existing.count()} existing demo scan(s)")
            existing.delete()
        elif existing.exists():
            raise CommandError("That account already has a demo scan. Pass --replace to rebuild it.")

        scan = create_demo_scan(user, profile=options["profile"])
        scores = scan.analysis_data["reference_scores"]
        self.stdout.write(self.style.SUCCESS(
            f"demo scan {scan.id} for {user.email}: overall {scores['overall_score']}/100 "
            f"from {len(scores['metrics'])} measurements"
        ))
