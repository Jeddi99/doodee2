"""Sample scans, so the four real features can be used without a camera.

DOODEE Chat, the score card, coupons and the admin screens all sit behind "you must have a
completed scan". Getting one means a working camera, MediaPipe, Celery and Supabase — which is
a lot of machinery to stand up before you can look at a coupon form. This builds a completed
scan from the same scoring code the real pipeline uses, so everything downstream sees exactly
the shape it would see in production.

What it does NOT do is invent a face. There are no images: fabricating a portrait would mean
either shipping a real person's photograph or generating one, and every screen that shows a
face would then be showing a fiction it presents as the user. `Scan.is_demo` marks the row so
the UI can say "sample data" rather than borrowing the "your photos were deleted" wording,
which would be a different and false claim.

The numbers are deterministic — no randomness — so a demo scan looks the same every time and a
screenshot taken today matches one taken next week.
"""

from datetime import timedelta

from django.utils import timezone

from .models import Scan
from .reference_scoring import CATEGORIES, reference_for, score_observations
from .skin_engine import ENGINE_VERSION, SIGNAL_CONFIDENCE

# Offsets in standard deviations from the Thai reference mean, per metric. Chosen to produce a
# believable spread rather than a flat profile: one clearly atypical metric (alar_width) so the
# "furthest from the reference" answers and the score card's marker have something to point at,
# and the rest close in, which is what most real scans look like.
DEMO_DEVIATIONS = {
    "midface_height": -0.5,
    "lower_face_height": 0.3,
    "intercanthal": -0.4,
    "eye_fissure": 0.2,
    "alar_width": 1.9,
    "nasofrontal_angle": -0.7,
    "nasolabial_angle": 0.5,
    "upper_lip_length": -0.2,
    "upper_vermillion": 0.6,
    "lower_vermillion": 0.4,
    "chin_height": -0.8,
    "facial_convexity_angle": 0.3,
}

# reference_for() reports these three in degrees and everything else as a ratio over the
# nasion-gnathion height, exactly as score_observations() expects to read them back.
ANGLE_KEYS = {"nasofrontal_angle", "nasolabial_angle", "facial_convexity_angle"}


def demo_observations(profile="neutral"):
    """The raw measurements a demo scan would have produced."""
    reference = reference_for(profile)
    denominator = reference["n_gn"][0]
    observations = {}
    for key in CATEGORIES:
        mean, sd = reference[key]
        if key in ANGLE_KEYS:
            base, spread = mean, sd
        else:
            base, spread = mean / denominator, sd / denominator
        observations[key] = base + spread * DEMO_DEVIATIONS.get(key, 0.0)
    return observations


# A readable, unremarkable skin frame. Values sit where the engine puts an ordinary photograph
# taken in even light: a mild under-eye shadow, cheeks a little warmer than the forehead, a
# slightly shinier T-zone. Deliberately not a dramatic one — the demo exists so the screens can
# be used, and a sample face with striking skin would be read as the product's idea of a
# problem to solve.
#
# `readable: True` with no advisories, because a demo that opened on "we could not read this
# photograph" would teach the wrong thing about a feature that is working.
DEMO_SKIN = {
    "engine_version": ENGINE_VERSION,
    "basis": "within_image_regional",
    "signals": {
        "undereye_shadow": 6.4,
        "tone_spread": 4.1,
        "cheek_redness": 2.2,
        "nose_redness": 3.5,
        "tzone_shine": 0.031,
        "texture": 0.0125,
    },
    "confidence": dict(SIGNAL_CONFIDENCE),
    # Left out on purpose: the per-region colour means. They describe a face, and this demo
    # deliberately has none — see the module docstring. The signals above are differences, so
    # they carry no portrait with them.
    "regions": {},
    "capture": {
        "brightness": 132.0,
        "colour_cast": 0.04,
        "shadow_ratio": 1.08,
        "max_clipped_fraction": 0.0,
        "white_balanced": True,
    },
    "advisories": [],
    "readable": True,
    "is_demo": True,
}


def demo_analysis_data(profile="neutral"):
    """A full `analysis_data` blob, scored by the real scoring module.

    Running the observations through `score_observations` rather than hand-writing the output
    means a change to the scoring rules shows up in the demo too — a hand-written fixture would
    quietly drift until it described a version of the product that no longer exists.
    """
    return {
        "reference_scores": score_observations(demo_observations(profile)),
        "analysis_tier": Scan.ScanMode.STANDARD,
        "missing_optional_views": [],
        "skin_analysis": dict(DEMO_SKIN),
        "is_demo": True,
    }


def create_demo_scan(user, profile="neutral", days=30):
    """A completed demo scan for `user`. Returns the Scan."""
    return Scan.objects.create(
        user=user,
        status=Scan.Status.COMPLETED,
        progress=100,
        age_band=Scan.AgeBand.ADULT,
        reference_age_band="18_35",
        reference_profile=profile,
        reference_population="TH",
        scan_mode=Scan.ScanMode.STANDARD,
        image_objects={},
        is_demo=True,
        analysis_data=demo_analysis_data(profile),
        expires_at=timezone.now() + timedelta(days=days),
    )
