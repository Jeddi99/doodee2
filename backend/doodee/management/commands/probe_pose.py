from django.core.management.base import BaseCommand

from doodee.analysis_engine import POSE_TARGETS, _landmarks


class Command(BaseCommand):
    help = (
        "Print yaw/pitch/roll for face photos in pose_targets.json coordinates, and name any "
        "view whose target the pose satisfies. Use this to check a sign convention against a "
        "real photo: a head turned to the subject's right must read positive yaw."
    )

    def add_arguments(self, parser):
        parser.add_argument("paths", nargs="+", help="Image files to measure")

    def handle(self, *args, **options):
        import cv2

        for path in options["paths"]:
            image = cv2.imread(path, cv2.IMREAD_COLOR)
            if image is None:
                self.stdout.write(f"{path}: unreadable")
                continue
            try:
                _, pose = _landmarks(image)
            except ValueError as exc:
                self.stdout.write(f"{path}: {exc}")
                continue
            matches = [
                view for view, target in POSE_TARGETS.items()
                if all(target[axis][0] <= pose[axis] <= target[axis][1] for axis in ("yaw", "pitch", "roll"))
            ]
            self.stdout.write(
                f"{path}: yaw={pose['yaw']:+.1f} pitch={pose['pitch']:+.1f} roll={pose['roll']:+.1f}"
                f" matches={','.join(matches) or 'none'}"
            )
