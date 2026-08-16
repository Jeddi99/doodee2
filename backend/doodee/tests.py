from datetime import timedelta
import json
import os
from unittest.mock import patch

import cv2
import numpy as np
from django.contrib.admin.models import LogEntry
from django.contrib.auth.models import Group, User
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from django.core.cache import cache

from .models import ConsentEvent, FirebaseIdentity, PromoCode, PromoRedemption, Scan, Simulation, SimulationPreviewUsage
from .analysis_engine import (
    POSE_TARGETS, SCAN_VIEW_MODES, _distance, _isotropic, _validate_pose_set, analyze_images,
    measured_views, pose_from_matrix,
)
from .procedures import PROCEDURES, get_preset
from .reference_scoring import (
    CATEGORIES,
    MAX_REFERENCE_SHIFT, REFERENCE_TARGETS, metric_score, reference_for, reference_target, score_observations,
)
from .serializers import ScanSerializer
from .simulation_engine import (
    DEFAULT_MAX_SHIFT, _movement, measurement_for, merge_movements, resolve_preset, simulate, validate_preset,
)
from .storage import _headers
from .views import SCAN_VIEWS

# Stands in for the third value simulate() returns wherever the render itself is patched out.
FOCUS_BOX = {"x0": .3, "y0": .4, "x1": .7, "y1": .6}


def rendered(measurement, region="nose"):
    """What a patched simulate() hands back: bytes, one measurement per preset, boxes by region."""
    return b"webp", [{**measurement, "region": region}], {region: FOCUS_BOX}


def image_file(name):
    image = np.full((120, 120, 3), 128, dtype=np.uint8)
    cv2.line(image, (10, 10), (110, 110), (255, 255, 255), 3)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return SimpleUploadedFile(f"{name}.jpg", encoded.tobytes(), content_type="image/jpeg")


class StorageHeadersTest(SimpleTestCase):
    def test_secret_and_legacy_keys_use_their_supported_headers(self):
        with patch.dict(os.environ, {"SUPABASE_SECRET_KEY": "sb_secret_test"}):
            self.assertEqual(_headers(), {"apikey": "sb_secret_test"})
        with patch.dict(os.environ, {"SUPABASE_SECRET_KEY": "legacy.jwt"}):
            self.assertEqual(_headers(), {"apikey": "legacy.jwt", "Authorization": "Bearer legacy.jwt"})


@override_settings(SIMULATION_ENABLED=True)
class ScanApiTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("tester")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    @patch("doodee.views.process_scan.delay")
    @patch("doodee.views.upload_image", side_effect=lambda name, data, content_type: name)
    def test_upload_requires_and_queues_all_seven_views(self, upload_image, delay):
        payload = {view: image_file(view) for view in SCAN_VIEWS}
        payload.update(age_band="adult", reference_age_band="18_35", reference_profile="neutral", analysis_consent_version="2026.1")
        response = self.client.post("/api/v1/scans/", payload, format="multipart")
        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(upload_image.call_count, 7)
        delay.assert_called_once()
        self.assertTrue(ConsentEvent.objects.filter(user=self.user, purpose="analysis").exists())

    @patch("doodee.views.process_scan.delay")
    @patch("doodee.views.upload_image", side_effect=lambda name, data, content_type: name)
    def test_upload_allows_fast_mode(self, upload_image, delay):
        payload = {view: image_file(view) for view in SCAN_VIEW_MODES["fast"]}
        payload.update(age_band="adult", reference_age_band="18_35", reference_profile="neutral", analysis_consent_version="2026.1", scan_mode="fast")
        response = self.client.post("/api/v1/scans/", payload, format="multipart")
        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(upload_image.call_count, 3)
        delay.assert_called_once()

    @patch("doodee.views.process_scan.delay")
    @patch("doodee.views.upload_image", side_effect=lambda name, data, content_type: name)
    def test_upload_accepts_standard_mode_with_both_profiles(self, upload_image, delay):
        payload = {view: image_file(view) for view in SCAN_VIEW_MODES["standard"]}
        payload.update(age_band="adult", reference_age_band="18_35", reference_profile="neutral",
                       reference_population="TH", analysis_consent_version="2026.1", scan_mode="standard")
        response = self.client.post("/api/v1/scans/", payload, format="multipart")
        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(sorted(Scan.objects.get().image_objects), ["front", "left_profile", "right_profile"])

    @patch("doodee.views.process_scan.delay")
    @patch("doodee.views.upload_image", side_effect=lambda name, data, content_type: name)
    def test_reference_population_is_recorded_and_validated(self, upload_image, delay):
        def post(**changes):
            payload = {view: image_file(view) for view in SCAN_VIEW_MODES["standard"]}
            payload.update(age_band="adult", reference_age_band="18_35", reference_profile="neutral",
                           analysis_consent_version="2026.1", scan_mode="standard", **changes)
            return self.client.post("/api/v1/scans/", payload, format="multipart")

        self.assertEqual(post(reference_population="JP").status_code, 202)
        self.assertEqual(Scan.objects.get().reference_population, "JP")
        self.assertEqual(post(reference_population="XX").status_code, 400)

    @patch("doodee.views.delete_image")
    @patch("doodee.views.upload_image")
    def test_storage_failure_deletes_successful_parallel_uploads(self, upload_image, delete_image):
        upload_image.side_effect = lambda name, data, content_type: (_ for _ in ()).throw(RuntimeError("storage down")) if name.endswith("/basal") else name
        payload = {view: image_file(view) for view in SCAN_VIEWS}
        payload.update(age_band="adult", reference_age_band="18_35", reference_profile="neutral", analysis_consent_version="2026.1")
        response = self.client.post("/api/v1/scans/", payload, format="multipart")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(delete_image.call_count, 6)
        self.assertFalse(Scan.objects.exists())

    def test_session_reports_whether_simulation_is_switched_on(self):
        """The client needs this to say the feature is off before a button is pressed.

        Without it every simulation request came back 503 with a working-looking UI.
        """
        with override_settings(SIMULATION_ENABLED=True):
            self.assertIs(self.client.get("/api/v1/session/").data["simulation_enabled"], True)
        with override_settings(SIMULATION_ENABLED=False):
            self.assertIs(self.client.get("/api/v1/session/").data["simulation_enabled"], False)

    def test_minor_scans_are_not_returned_in_history(self):
        Scan.objects.create(user=self.user, age_band="minor", expires_at=timezone.now() + timedelta(hours=24))
        Scan.objects.create(user=self.user, age_band="adult", expires_at=timezone.now() + timedelta(days=30))
        response = self.client.get("/api/v1/scans/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["age_band"], "adult")

    def test_minor_cannot_request_simulation(self):
        # Entitled, so the refusal proves the minor rule and not merely the entitlement lock.
        self.user.groups.add(Group.objects.get_or_create(name="pro_member")[0])
        scan = Scan.objects.create(
            user=self.user,
            age_band="minor",
            status=Scan.Status.COMPLETED,
            image_objects={"front": "private/front"},
            expires_at=timezone.now() + timedelta(hours=24),
        )
        response = self.client.post("/api/v1/simulations/", {
            "scan_id": str(scan.id),
            "region": "nose",
            "preset_id": "nose-narrow",
            "simulation_consent_version": "2026.1",
        }, format="json")
        self.assertEqual(response.status_code, 400)


@override_settings(REDEEM_CODES_ENABLED=True)
class PromoCodeTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("redeemer")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.code = PromoCode.objects.create(code="DOODEEVIP", days=7)
        cache.clear()

    def redeem(self, code="DOODEEVIP"):
        return self.client.post("/api/v1/redeem/", {"code": code}, format="json")

    def plan(self):
        return self.client.get("/api/v1/session/").data

    def test_a_valid_code_grants_vip_and_lifts_the_preview_quota(self):
        response = self.redeem()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["plan"], "vip")
        session = self.plan()
        self.assertEqual(session["plan"], "vip")
        # Free accounts get a number here; anyone entitled gets null for unlimited.
        self.assertIsNone(session["preview_remaining"])
        self.assertAlmostEqual((session["vip_expires_at"] - timezone.now()).days, 6)

    def test_redeeming_again_resets_the_window_instead_of_stacking(self):
        self.redeem()
        first = PromoRedemption.objects.get().expires_at
        self.redeem()
        latest = self.plan()["vip_expires_at"]
        self.assertEqual(PromoRedemption.objects.count(), 2, "every redemption is recorded")
        self.assertLess((latest - first).total_seconds(), 60, "still seven days out, not fourteen")

    def test_entitlement_lapses_on_its_own_without_a_scheduled_job(self):
        expired = PromoCode.objects.create(code="EXPIREDNOW", days=0)
        self.client.post("/api/v1/redeem/", {"code": expired.code}, format="json")
        session = self.plan()
        self.assertEqual(session["plan"], "free")
        self.assertIsNone(session["vip_expires_at"])
        self.assertEqual(session["preview_remaining"], 3)

    def test_an_unknown_code_and_a_disabled_code_are_indistinguishable(self):
        self.code.is_active = False
        self.code.save(update_fields=("is_active",))
        disabled = self.redeem()
        unknown = self.redeem("NEVEREXISTED")
        self.assertEqual(disabled.status_code, 400)
        self.assertEqual(unknown.status_code, 400)
        self.assertEqual(disabled.data, unknown.data, "the response must not reveal which codes exist")

    def test_guessing_locks_the_hour_and_only_failures_count_toward_it(self):
        """Once the limit is hit nothing gets through, or guessing would still pay off.

        Successes must not advance the counter either, or normal use would lock itself out.
        """
        for _ in range(5):
            self.assertEqual(self.redeem().status_code, 200)
        for _ in range(10):
            self.assertEqual(self.redeem("WRONGCODE").status_code, 400)
        self.assertEqual(self.redeem("WRONGCODE").status_code, 429)
        self.assertEqual(self.redeem().status_code, 429, "a correct guess on attempt 11 must not win")

    def test_a_paying_member_is_never_demoted_by_redeeming(self):
        self.user.groups.add(Group.objects.get(name="pro_member"))
        self.assertEqual(self.redeem().data["plan"], "member")

    @override_settings(REDEEM_CODES_ENABLED=False)
    def test_the_whole_endpoint_can_be_switched_off(self):
        self.assertEqual(self.redeem().status_code, 503)
        self.assertIs(self.plan()["redeem_enabled"], False)


class MetricCatalogTest(SimpleTestCase):
    """The metric keys the web app has written labels for.

    `apps/web/src/data/faceMetrics.js` names every metric in Thai and English and records which
    landmark pair it measures. Adding a metric here without adding it there would put a raw key like
    `some_new_ratio` in front of a user, so the two catalogues are pinned to each other. Changing
    either side means changing both — and, if a formula changes rather than a name, bumping
    FORMULA_VERSION so old scans are not silently reinterpreted.
    """

    WEB_LABELLED_METRICS = {
        "alar_width_ratio", "brow_gap_asymmetry", "chin_height_ratio", "chin_width_ratio",
        "eye_width_asymmetry", "face_width_to_height", "intercanthal_ratio", "jaw_width_ratio",
        "left_brow_eye_gap_ratio", "left_eye_aspect_ratio", "left_eye_width_ratio",
        "left_profile_facial_convexity_ratio", "left_profile_nose_projection_ratio",
        "lower_face_height_ratio", "mandible_asymmetry", "midface_height_ratio", "mouth_width_ratio",
        "nose_length_ratio", "philtrum_ratio", "right_brow_eye_gap_ratio", "right_eye_aspect_ratio",
        "right_eye_width_ratio", "right_profile_facial_convexity_ratio",
        "right_profile_nose_projection_ratio", "upper_face_height_ratio", "upper_lower_lip_ratio",
        "visible_redness", "visible_texture", "visible_tone_unevenness", "zygomatic_width_ratio",
    }

    WEB_LABELLED_REFERENCE = {
        "alar_width", "chin_height", "eye_fissure", "facial_convexity_angle", "intercanthal",
        "lower_face_height", "lower_vermillion", "midface_height", "nasofrontal_angle",
        "nasolabial_angle", "upper_lip_length", "upper_vermillion",
    }

    def test_every_produced_metric_key_has_a_label_on_the_web(self):
        from .analysis_engine import FRONT_METRICS

        produced = {"face_width_to_height", *(key for key, *_ in FRONT_METRICS),
                    "right_eye_aspect_ratio", "left_eye_aspect_ratio", "upper_lower_lip_ratio",
                    "eye_width_asymmetry", "brow_gap_asymmetry", "mandible_asymmetry",
                    "visible_tone_unevenness", "visible_redness", "visible_texture"}
        for view in ("left_profile", "right_profile"):
            produced |= {f"{view}_nose_projection_ratio", f"{view}_facial_convexity_ratio"}
        self.assertEqual(produced, self.WEB_LABELLED_METRICS)

    def test_every_scored_reference_key_has_a_label_on_the_web(self):
        self.assertEqual(set(CATEGORIES), self.WEB_LABELLED_REFERENCE)

    def test_the_two_families_are_not_interchangeable(self):
        """Several concepts appear in both, on different denominators, so they must stay separate.

        `alar_width_ratio` divides by face width; `alar_width` divides by n-gn. Presenting them as one
        number would show a value that matches neither.
        """
        shared = {"midface_height", "lower_face_height", "intercanthal", "alar_width", "chin_height"}
        self.assertTrue(shared <= set(CATEGORIES))
        self.assertTrue({f"{name}_ratio" for name in shared} <= self.WEB_LABELLED_METRICS)


class SimulationSafetyTest(TestCase):
    def test_presets_are_closed_bounded_and_region_matched(self):
        self.assertEqual(validate_preset("nose", "nose-narrow")["delta"], -.04)
        self.assertEqual(len(PROCEDURES), 24)
        self.assertTrue(all(sum(preset["region"] == region for preset in PROCEDURES) == 4 for region in ("eyes", "nose", "lips", "cheeks", "jaw", "chin")))
        self.assertTrue(all(abs(preset["delta"]) <= .05 for preset in PROCEDURES))
        with self.assertRaisesRegex(ValueError, "preset_region_mismatch"):
            validate_preset("chin", "nose-narrow")
        with self.assertRaisesRegex(ValueError, "preset_region_mismatch"):
            validate_preset("cheeks", "hifu")

    @patch("doodee.simulation_engine._landmarks")
    def test_generated_pixels_are_clipped_to_region_and_watermarked(self, landmarks):
        points = np.full((478, 3), 0.5, dtype=np.float64)
        for index, xy in {10: (.5, .1), 152: (.5, .9), 234: (.2, .5), 454: (.8, .5), 168: (.48, .3), 193: (.42, .42), 417: (.58, .42), 98: (.4, .58), 327: (.6, .58), 2: (.5, .62), 1: (.5, .5)}.items():
            points[index, :2] = xy
        landmarks.return_value = points, {"yaw": 0, "pitch": 0, "roll": 0}
        original = np.full((300, 300, 3), 128, dtype=np.uint8)
        cv2.line(original, (105, 175), (195, 175), (255, 255, 255), 5)
        _, original_bytes = cv2.imencode(".png", original)
        output, measurements, focus_boxes = simulate(original_bytes.tobytes(), [get_preset("nose-narrow")])
        measurement, focus_box = measurements[0], focus_boxes["nose"]
        decoded = cv2.imdecode(np.frombuffer(output, np.uint8), cv2.IMREAD_COLOR)
        self.assertTrue(np.array_equal(decoded[10, 10], original[10, 10]))
        self.assertEqual(measurement["target_ratio"], round(measurement["before_ratio"] * .96, 5))
        self.assertEqual(measurement["region"], "nose")
        self.assertLess(decoded[-20, -20].mean(), 40)

        # The viewer zooms on this box, and it must mean the same thing on the untouched upload
        # as on this render, so it is fractions of the image and never pixels.
        self.assertTrue(all(0 <= focus_box[edge] <= 1 for edge in ("x0", "y0", "x1", "y1")))
        self.assertLess(focus_box["x0"], focus_box["x1"])
        self.assertLess(focus_box["y0"], focus_box["y1"])
        # Every nose landmark the warp moves has to sit inside it, or the zoom would crop the
        # very change it exists to show.
        for index in (98, 327, 168, 1):
            self.assertTrue(focus_box["x0"] <= points[index, 0] <= focus_box["x1"], index)
            self.assertTrue(focus_box["y0"] <= points[index, 1] <= focus_box["y1"], index)

    def test_control_point_motion_never_exceeds_three_percent(self):
        points = np.zeros((478, 3))
        movement = _movement(points, get_preset("jaw-narrow"), 1000, 800)
        self.assertLessEqual(max(abs(value) for delta in movement.values() for value in delta), 30)


class StackedMovementTest(SimpleTestCase):
    """Stacked regions add at any control point they share, then clamp once.

    Letting the last region win at a shared point would silently undo one the user had locked.
    The two profile presets are the pair that really overlaps: nose projection and chin
    projection both move points 1 and 152.
    """

    def setUp(self):
        self.pixels = np.zeros((478, 2))
        self.face_width, self.face_height = 1000, 800

    def merged(self, *preset_ids):
        return merge_movements(self.pixels, [get_preset(i) for i in preset_ids], self.face_width, self.face_height)

    def test_a_single_selection_moves_exactly_as_it_did_before_stacking(self):
        """Existing users must not see their image change because stacking was added."""
        for preset_id in ("jaw-narrow", "nose-narrow", "eyes-open", "chin-long", "chin-projection"):
            preset = get_preset(preset_id)
            merged, _capped = self.merged(preset_id)
            before = _movement(self.pixels, preset, self.face_width, self.face_height)
            self.assertEqual(merged, {index: tuple(offset) for index, offset in before.items()}, preset_id)

    def test_shared_points_add_and_are_clamped_once(self):
        merged, capped = self.merged("nose-tip-projection", "chin-projection")
        nose = _movement(self.pixels, get_preset("nose-tip-projection"), self.face_width, self.face_height)
        chin = _movement(self.pixels, get_preset("chin-projection"), self.face_width, self.face_height)
        # Point 152 sums under the ceiling and is left alone; point 1 sums over it and is cut.
        self.assertEqual(merged[152], (nose[152][0] + chin[152][0], 0))
        self.assertGreater(nose[1][0] + chin[1][0], self.face_width * DEFAULT_MAX_SHIFT)
        self.assertEqual(merged[1], (self.face_width * DEFAULT_MAX_SHIFT, 0))
        for dx, dy in merged.values():
            self.assertLessEqual(abs(dx), self.face_width * DEFAULT_MAX_SHIFT + 1e-9)
            self.assertLessEqual(abs(dy), self.face_height * DEFAULT_MAX_SHIFT + 1e-9)
        # Both regions asked for the point that was cut, so both are reported, not the stack.
        self.assertEqual(capped, {"nose": True, "chin": True})

    def test_regions_that_share_no_control_point_are_never_capped(self):
        """A jaw and a chin selection touch different points, so neither loses anything."""
        merged, capped = self.merged("jaw-narrow", "chin-long")
        self.assertEqual(sorted(merged), [152, 172, 397])
        self.assertEqual(capped, {"jaw": False, "chin": False})


def reference_scores_fixture(**overrides):
    """A completed scan's reference_scores, with observed values a little off the mean."""
    metrics = {
        "alar_width": {"observed": .380, "reference": .348, "normalized_deviation": .9},
        "upper_vermillion": {"observed": .070, "reference": .065, "normalized_deviation": .5},
        "lower_vermillion": {"observed": .090, "reference": .086, "normalized_deviation": .4},
        "chin_height": {"observed": .370, "reference": .370, "normalized_deviation": .0},
    }
    for key, value in overrides.items():
        metrics[key] = {**metrics[key], **value}
    return {
        "status": "experimental_reference_similarity",
        "metrics": [{"key": key, **value} for key, value in metrics.items()],
        "cohort_match": "within_reference_age_range",
        "population_match": "within_reference_population",
    }


class ReferenceTargetTest(SimpleTestCase):
    def test_target_points_toward_the_published_mean(self):
        target = reference_target(reference_scores_fixture(), "nose")
        # Observed sits above the mean, so the face must come in, not out.
        self.assertLess(target["delta"], 0)
        self.assertAlmostEqual(target["delta"], (.348 - .380) / .380, places=5)
        self.assertEqual(target["observed_ratio"], .38)
        self.assertEqual(target["reference_ratio"], .348)
        self.assertFalse(target["already_near_reference"])

    def test_lip_target_sums_the_two_vermillion_bands(self):
        target = reference_target(reference_scores_fixture(), "lips")
        self.assertEqual(target["observed_ratio"], round(.070 + .090, 5))
        self.assertEqual(target["reference_ratio"], round(.065 + .086, 5))
        # No pooled z: the study does not publish the covariance between the two bands.
        self.assertNotIn("normalized_deviation", target)
        self.assertEqual([item["key"] for item in target["per_key_deviation"]], ["upper_vermillion", "lower_vermillion"])

    def test_a_face_already_at_the_mean_is_not_worth_an_image(self):
        self.assertTrue(reference_target(reference_scores_fixture(), "chin")["already_near_reference"])
        near = reference_scores_fixture(chin_height={"observed": .3735})
        self.assertTrue(reference_target(near, "chin")["already_near_reference"])

    def test_regions_without_published_data_are_refused(self):
        for region in ("eyes", "cheeks", "jaw"):
            self.assertNotIn(region, REFERENCE_TARGETS)
            with self.assertRaisesRegex(ValueError, "region_without_reference_data"):
                reference_target(reference_scores_fixture(), region)

    def test_a_scan_without_reference_scores_cannot_be_targeted(self):
        with self.assertRaisesRegex(ValueError, "scan_has_no_reference_scores"):
            reference_target({"status": "minor_not_scored"}, "nose")
        with self.assertRaisesRegex(ValueError, "scan_is_missing_reference_metrics"):
            reference_target({"status": "experimental_reference_similarity", "metrics": []}, "nose")

    def test_no_field_reports_a_millimetre(self):
        """2D photos carry no scale, so any millimetre here would be invented."""
        target = reference_target(reference_scores_fixture(), "nose")
        self.assertEqual(target["unit"], "ratio")
        self.assertNotIn("mm", json.dumps(target))


class ReferenceMovementTest(SimpleTestCase):
    def points(self):
        pixels = np.zeros((478, 2))
        pixels[98], pixels[327] = (400, 500), (600, 500)  # 200px alar span
        pixels[0], pixels[17] = (500, 600), (500, 700)  # 100px lip height
        pixels[13], pixels[14], pixels[152] = (500, 640), (500, 660), (500, 900)
        return pixels

    def test_the_warp_moves_the_measured_span_not_the_face_width(self):
        """A preset sizes its step off face width, which overshoots a small feature badly."""
        preset = {"exact": True, "delta": -.10, "movement": "width", "region": "nose"}
        movement = _movement(self.points(), preset, 1000, 1200, MAX_REFERENCE_SHIFT)
        # 10% of a 200px span is 20px total, so each side moves 10px inward.
        self.assertEqual(movement[98], (10.0, 0))
        self.assertEqual(movement[327], (-10.0, 0))

    def test_the_ceiling_clamps_an_extreme_gap(self):
        preset = {"exact": True, "delta": -3.0, "movement": "width", "region": "nose"}
        movement = _movement(self.points(), preset, 1000, 1200, MAX_REFERENCE_SHIFT)
        self.assertEqual(abs(movement[98][0]), 1000 * MAX_REFERENCE_SHIFT)

    def test_presets_keep_the_original_three_percent_ceiling(self):
        """Regression: raising the ceiling for reference targets must not loosen presets.

        Called without an explicit ceiling, the default must still clamp at 3% — checked with
        a delta far past any catalog value, since every real preset stays under the cap.
        """
        runaway = {"delta": 1.0, "movement": "width", "region": "jaw"}
        movement = _movement(np.zeros((478, 2)), runaway, 1000, 800)
        self.assertEqual(max(abs(value) for delta in movement.values() for value in delta), 1000 * .03)
        catalog = _movement(np.zeros((478, 2)), get_preset("jaw-narrow"), 1000, 800)
        self.assertLessEqual(max(abs(value) for delta in catalog.values() for value in delta), 1000 * .03)


class ThaiReferenceScoreTest(SimpleTestCase):
    def test_transparent_linear_score_and_neutral_pool(self):
        self.assertEqual(metric_score(10, 10, 2), (100, 0.0))
        self.assertEqual(metric_score(12, 10, 2), (80, 1.0))
        self.assertEqual(metric_score(30, 10, 2)[0], 0)
        neutral = reference_for("neutral")
        self.assertAlmostEqual(neutral["midface_height"][0], (48.29 + 51.78) / 2)

    def test_a_non_thai_population_is_flagged_without_touching_the_numbers(self):
        observations = {"alar_width": .35, "chin_height": .38}
        thai = score_observations(observations, reference_population="TH")
        japan = score_observations(observations, reference_population="JP")
        self.assertEqual(thai["population_match"], "within_reference_population")
        self.assertEqual(japan["population_match"], "outside_reference_population")
        self.assertEqual(japan["reported_population"], "JP")
        self.assertEqual(thai["overall_score"], japan["overall_score"])
        self.assertEqual(thai["metrics"], japan["metrics"])

    def test_front_and_both_profiles_cover_every_reference_metric(self):
        """The 3-shot standard scan must score exactly what the 7-view scan scores."""
        front_only = {
            "midface_height": .44, "lower_face_height": .56, "intercanthal": .30, "eye_fissure": .25,
            "alar_width": .35, "upper_lip_length": .19, "upper_vermillion": .065, "lower_vermillion": .086,
            "chin_height": .37,
        }
        profile_angles = {"nasofrontal_angle": 131., "nasolabial_angle": 94., "facial_convexity_angle": 10.}
        self.assertEqual(score_observations(front_only)["coverage"]["scored_metrics"], 9)
        full = score_observations({**front_only, **profile_angles})
        self.assertEqual(full["coverage"]["scored_metrics"], full["coverage"]["available_reference_metrics"])
        self.assertEqual(full["coverage"]["scored_metrics"], 12)
        self.assertEqual([item["key"] for item in full["categories"]], ["proportions", "eyes", "nose", "lips", "chin"])

    def test_minor_and_unsupported_categories_never_receive_scores(self):
        minor = score_observations({"alar_width": .35}, age_band="minor")
        self.assertIsNone(minor["overall_score"])
        result = score_observations({"alar_width": .35, "unknown": 1})
        self.assertEqual([item["key"] for item in result["categories"]], ["nose"])
        self.assertFalse(result["golden_ratio_included"])


@override_settings(SIMULATION_ENABLED=True)
class SimulationApiTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("simulation-api")
        # Simulation is entitlement-only, so every case below starts from an entitled account.
        # The lock itself is covered by SimulationLockTest.
        self.user.groups.add(Group.objects.get_or_create(name="pro_member")[0])
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def scan(self, mode="full", analysis_data=None):
        images = {"front": "private/front"}
        if mode in ("full", "standard"):
            images.update(left_profile="private/left", right_profile="private/right")
        return Scan.objects.create(
            user=self.user, age_band="adult", scan_mode=mode, status="completed", image_objects=images,
            analysis_data={"reference_scores": analysis_data or reference_scores_fixture()},
            expires_at=timezone.now() + timedelta(days=1),
        )

    def post(self, scan, **changes):
        payload = {"scan_id": str(scan.id), "region": "nose", "preset_id": "nose-narrow", "simulation_consent_version": "2026.2-local"}
        payload.update(changes)
        return self.client.post("/api/v1/simulations/", payload, format="json")

    def preview(self, scan, **changes):
        payload = {"scan_id": str(scan.id), "region": "nose", "preset_id": "nose-narrow", "simulation_consent_version": "2026.3-local"}
        payload.update(changes)
        return self.client.post("/api/v1/simulations/preview/", payload, format="json")

    @patch("doodee.views.process_simulation.delay")
    def test_accepts_one_closed_preset_and_records_consent(self, delay):
        response = self.post(self.scan())
        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(response.data["preset"]["id"], "nose-narrow")
        self.assertTrue(ConsentEvent.objects.filter(user=self.user, purpose="simulation").exists())

    def test_requires_separate_consent(self):
        self.assertEqual(self.post(self.scan(), simulation_consent_version="").status_code, 400)

    def test_rejects_region_mismatch_and_multi_region_payload(self):
        scan = self.scan()
        self.assertEqual(self.post(scan, region="chin").status_code, 400)
        self.assertEqual(self.post(scan, region=["nose", "chin"]).status_code, 400)
        self.assertEqual(self.post(scan, parameters={"free_prompt": 1}).status_code, 400)

    def test_rejects_information_only_and_profile_preset_on_fast_scan(self):
        scan = self.scan("fast")
        self.assertEqual(self.post(scan, region="cheeks", preset_id="hifu").status_code, 400)
        self.assertEqual(self.post(scan, preset_id="nose-tip-projection").status_code, 400)

    @patch("doodee.views.process_simulation.delay")
    def test_profile_presets_follow_the_stored_photos_not_the_mode_name(self, delay):
        """A `standard` scan holds both profiles, so profile presets must run on it."""
        standard = self.scan("standard")
        self.assertEqual(self.post(standard, preset_id="nose-tip-projection").status_code, 202)

    def test_serializer_exposes_whether_profile_photos_exist(self):
        self.assertTrue(ScanSerializer(self.scan("standard")).data["has_profile_images"])
        self.assertFalse(ScanSerializer(self.scan("fast")).data["has_profile_images"])

    @patch("doodee.views.signed_url", return_value="https://signed.test/front")
    @patch("doodee.views.simulate", return_value=rendered({"key": "alar_width", "unit": "ratio"}))
    @patch("doodee.views.source_for_scan", return_value=(b"source", "private/front", "front"))
    def test_reference_target_runs_through_the_same_preview_path(self, source, simulate_preview, signed):
        response = self.preview(self.scan(), preset_id="reference:nose")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["already_near_reference"])
        self.assertEqual(response.data["cohort_match"], "within_reference_age_range")
        # Entitled accounts are unmetered, so there is no countdown to report.
        self.assertIsNone(response.data["entitlement"]["preview_remaining"])
        # The client cannot compute this itself: it has no landmarks for the stored scan.
        self.assertEqual(response.data["focus_box"], FOCUS_BOX)

    def test_a_face_already_at_the_mean_costs_no_quota(self):
        response = self.preview(self.scan(), region="chin", preset_id="reference:chin")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["already_near_reference"])
        self.assertIsNone(response.data["after_data_url"])
        self.assertIsNone(response.data["entitlement"]["preview_remaining"])
        self.assertFalse(SimulationPreviewUsage.objects.filter(user=self.user, count__gt=0).exists())

    def test_regions_without_reference_data_are_rejected(self):
        for region in ("eyes", "cheeks", "jaw"):
            response = self.preview(self.scan(), region=region, preset_id=f"reference:{region}")
            self.assertEqual(response.status_code, 400, region)
        # The region must match the id, so a chin target cannot be filed under the nose.
        self.assertEqual(self.preview(self.scan(), region="nose", preset_id="reference:chin").status_code, 400)

    @patch("doodee.views.process_simulation.delay")
    def test_saving_a_reference_target_records_how_it_was_derived(self, delay):
        response = self.post(self.scan(), preset_id="reference:nose")
        self.assertEqual(response.status_code, 202, response.data)
        simulation = Simulation.objects.get()
        self.assertEqual(simulation.preset_id, "reference:nose")
        self.assertLess(simulation.parameters["delta"], 0)

    @patch("doodee.views.process_simulation.delay")
    def test_monthly_quota_is_three(self, delay):
        scan = self.scan()
        for _ in range(3):
            Simulation.objects.create(scan=scan, region="nose", preset_id="nose-narrow", status="completed", model_version="local", expires_at=timezone.now() + timedelta(days=1))
        self.assertEqual(self.post(scan).status_code, 429)

    @patch("doodee.views.signed_url", return_value="https://signed.test/front")
    @patch("doodee.views.simulate", return_value=rendered({"key": "alar_width_ratio"}))
    @patch("doodee.views.source_for_scan", return_value=(b"source", "private/front", "front"))
    def test_an_entitled_account_is_not_metered_per_preview(self, source, simulate_preview, signed):
        """Instant rendering only works if entitled accounts have no monthly preview count.

        The free 3-a-month meter still exists but is unreachable behind the lock, so nothing
        may be written to it here.
        """
        scan = self.scan()
        payload = {"scan_id": str(scan.id), "region": "nose", "preset_id": "nose-narrow", "simulation_consent_version": "2026.3-local"}
        for _ in range(6):
            self.assertEqual(self.client.post("/api/v1/simulations/preview/", payload, format="json").status_code, 200)
        self.assertFalse(SimulationPreviewUsage.objects.filter(user=self.user).exists())
        self.assertIsNone(self.client.get("/api/v1/session/").data["preview_remaining"])


@override_settings(SIMULATION_ENABLED=True)
class StackedSimulationTest(TestCase):
    """Several regions in one image, and the old single-preset request beside it.

    The mobile app still sends `region`/`preset_id`, so both shapes are covered here: a stacked
    request that renders every region at once, and the old shape proving it did not regress.
    """

    def setUp(self):
        self.user = User.objects.create_user("stacker")
        self.user.groups.add(Group.objects.get_or_create(name="pro_member")[0])
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.scan = Scan.objects.create(
            user=self.user, age_band="adult", scan_mode="standard", status="completed",
            image_objects={"front": "private/front", "left_profile": "private/left", "right_profile": "private/right"},
            analysis_data={"reference_scores": reference_scores_fixture()},
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.fast_scan = Scan.objects.create(
            user=self.user, age_band="adult", scan_mode="fast", status="completed",
            image_objects={"front": "private/front"}, expires_at=timezone.now() + timedelta(days=1),
        )

    def preview(self, scan=None, **changes):
        payload = {"scan_id": str((scan or self.scan).id), "simulation_consent_version": "2026.3-local"}
        payload.update(changes)
        return self.client.post("/api/v1/simulations/preview/", payload, format="json")

    STACK = [{"region": "jaw", "preset_id": "jaw-narrow"}, {"region": "chin", "preset_id": "chin-long"}]

    def stacked_render(self):
        return (b"webp",
                [{"key": "jaw_width_ratio", "region": "jaw", "capped": False},
                 {"key": "chin_height_ratio", "region": "chin", "capped": True}],
                {"jaw": FOCUS_BOX, "chin": FOCUS_BOX})

    @patch("doodee.views.signed_url", return_value="https://signed.test/front")
    @patch("doodee.views.simulate")
    @patch("doodee.views.source_for_scan", return_value=(b"source", "private/front", "front"))
    def test_a_stack_renders_every_region_in_one_response(self, source, render, signed):
        render.return_value = self.stacked_render()
        response = self.preview(selections=self.STACK)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([p["id"] for p in render.call_args.args[1]], ["jaw-narrow", "chin-long"])
        self.assertEqual([m["region"] for m in response.data["measurements"]], ["jaw", "chin"])
        self.assertEqual(sorted(response.data["focus_boxes"]), ["chin", "jaw"])
        self.assertEqual(response.data["related_procedures"],
                         ["Jaw contouring", "Mandibular angle reduction", "Chin filler", "Chin implant", "Genioplasty"])

    @patch("doodee.views.signed_url", return_value="https://signed.test/front")
    @patch("doodee.views.simulate", return_value=rendered({"key": "alar_width_ratio"}))
    @patch("doodee.views.source_for_scan", return_value=(b"source", "private/front", "front"))
    def test_the_old_single_preset_request_is_unchanged(self, source, render, signed):
        """`apps/mobile` sends this shape and reads `preset` and `focus_box`, not the plurals."""
        response = self.preview(region="nose", preset_id="nose-narrow")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["preset"]["id"], "nose-narrow")
        self.assertEqual(response.data["focus_box"], FOCUS_BOX)
        self.assertEqual(len(response.data["measurements"]), 1)

    def test_sending_both_request_shapes_is_refused(self):
        response = self.preview(selections=self.STACK, region="nose", preset_id="nose-narrow")
        self.assertEqual(response.status_code, 400)
        self.assertIn("conflicting_selection_fields", json.dumps(response.data))

    def test_a_malformed_stack_is_refused_as_a_whole(self):
        for selections, code in (
            ([], "empty_selections"),
            ([{"region": "jaw", "preset_id": "jaw-narrow"}] * 2, "duplicate_region"),
            ([{"region": r, "preset_id": p} for r, p in
              (("jaw", "jaw-narrow"), ("chin", "chin-long"), ("nose", "nose-narrow"), ("lips", "lip-volume"),
               ("eyes", "eyes-open"), ("cheeks", "cheek-lift"), ("jaw", "jaw-wide"))], "too_many_selections"),
            ([{"region": "jaw", "preset_id": "jaw-narrow"}, {"region": "nose", "preset_id": "nose-tip-projection"}], "mixed_source_view"),
            ([{"region": "nose", "preset_id": "reference:nose"}, {"region": "jaw", "preset_id": "jaw-narrow"}], "reference_cannot_stack"),
        ):
            response = self.preview(selections=selections)
            self.assertEqual(response.status_code, 400, selections)
            self.assertIn(code, json.dumps(response.data), selections)

    @patch("doodee.views.simulate")
    def test_a_stack_that_cannot_be_rendered_is_never_partly_rendered(self, render):
        """A missing profile photo must stop the whole request before anything is warped.

        Rendering the regions that happen to resolve would return an image quietly missing one
        the user asked for, and they would have no way to tell.
        """
        response = self.preview(self.fast_scan, selections=[
            {"region": "chin", "preset_id": "chin-projection"}, {"region": "nose", "preset_id": "nose-tip-projection"},
        ])
        self.assertEqual(response.status_code, 400)
        self.assertIn("profile_photos_required:chin", json.dumps(response.data))
        render.assert_not_called()

    @patch("doodee.views.process_simulation.delay")
    def test_saving_a_stack_keeps_the_old_columns_populated(self, delay):
        payload = {"scan_id": str(self.scan.id), "selections": self.STACK, "simulation_consent_version": "2026.2-local"}
        response = self.client.post("/api/v1/simulations/", payload, format="json")
        self.assertEqual(response.status_code, 202, response.data)
        simulation = Simulation.objects.get()
        self.assertEqual(simulation.selections, self.STACK)
        self.assertEqual((simulation.region, simulation.preset_id), ("jaw", "jaw-narrow"))
        self.assertEqual([d["preset_id"] for d in simulation.parameters["deltas"]], ["jaw-narrow", "chin-long"])


@override_settings(SIMULATION_ENABLED=True, REDEEM_CODES_ENABLED=True)
class SimulationLockTest(TestCase):
    """Simulation is entitlement-only, and the lock lives on the server.

    Hiding the button is not a lock: anything the UI hides is still one curl away.
    """

    def setUp(self):
        self.user = User.objects.create_user("locked-out")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.scan = Scan.objects.create(
            user=self.user, age_band="adult", scan_mode="standard", status="completed",
            image_objects={"front": "private/front", "left_profile": "private/left", "right_profile": "private/right"},
            analysis_data={"reference_scores": reference_scores_fixture()},
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.payload = {"scan_id": str(self.scan.id), "region": "nose", "preset_id": "nose-narrow", "simulation_consent_version": "2026.3-local"}
        cache.clear()

    def preview(self):
        return self.client.post("/api/v1/simulations/preview/", self.payload, format="json")

    def create(self):
        return self.client.post("/api/v1/simulations/", self.payload, format="json")

    def test_a_free_account_is_refused_by_the_api_not_only_by_the_ui(self):
        self.assertEqual(self.preview().status_code, 403)
        self.assertEqual(self.create().status_code, 403)
        self.assertIs(self.client.get("/api/v1/session/").data["simulation_locked"], True)

    @patch("doodee.views.signed_url", return_value="https://signed.test/front")
    @patch("doodee.views.simulate", return_value=rendered({"key": "alar_width_ratio"}))
    @patch("doodee.views.source_for_scan", return_value=(b"source", "private/front", "front"))
    def test_redeeming_a_code_unlocks_it_and_expiry_locks_it_again(self, source, simulate_preview, signed):
        code = PromoCode.objects.create(code="UNLOCKME1", days=7)
        self.client.post("/api/v1/redeem/", {"code": code.code}, format="json")
        self.assertIs(self.client.get("/api/v1/session/").data["simulation_locked"], False)
        self.assertEqual(self.preview().status_code, 200)

        # Same account once the window has passed: no scheduled job, just an elapsed date.
        PromoRedemption.objects.filter(user=self.user).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertIs(self.client.get("/api/v1/session/").data["simulation_locked"], True)
        self.assertEqual(self.preview().status_code, 403)

    def test_a_paying_member_is_never_locked(self):
        self.user.groups.add(Group.objects.get_or_create(name="pro_member")[0])
        self.assertIs(self.client.get("/api/v1/session/").data["simulation_locked"], False)


class SavedSimulationWorkerTest(TestCase):
    """The saved-image worker shares `simulate()` with the live preview.

    Nothing else covers `process_simulation`, so a change to what `simulate()` returns would
    otherwise only surface as a failed simulation in production.
    """

    def setUp(self):
        self.user = User.objects.create_user("worker-owner")
        self.scan = Scan.objects.create(
            user=self.user, age_band="adult", scan_mode="standard", status="completed",
            image_objects={"front": "private/front"},
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.simulation = Simulation.objects.create(
            scan=self.scan, region="nose", preset_id="nose-narrow", model_version="test",
            expires_at=timezone.now() + timedelta(days=30),
        )

    @patch("doodee.tasks.upload_image")
    @patch("doodee.tasks.simulate", return_value=(b"\x89PNG after", [{"key": "alar_width_ratio", "region": "nose"}], {"nose": FOCUS_BOX}))
    @patch("doodee.tasks.source_for_scan", return_value=(b"\x89PNG source", "private/front", "front"))
    def test_the_worker_stores_a_simulation_from_what_simulate_returns(self, source, render, upload):
        from .tasks import process_simulation

        process_simulation(str(self.simulation.id))
        self.simulation.refresh_from_db()
        self.assertEqual(self.simulation.status, Simulation.Status.COMPLETED, self.simulation.error_message)
        self.assertEqual(self.simulation.measurements, [{"key": "alar_width_ratio", "region": "nose"}])
        self.assertEqual(self.simulation.source_view, "front")
        self.assertEqual(upload.call_count, 2)

    @patch("doodee.tasks.upload_image")
    @patch("doodee.tasks.simulate")
    @patch("doodee.tasks.source_for_scan", return_value=(b"\x89PNG source", "private/front", "front"))
    def test_the_worker_renders_a_whole_stack_in_one_pass(self, source, render, upload):
        render.return_value = (b"\x89PNG after",
                               [{"key": "jaw_width_ratio", "region": "jaw"}, {"key": "chin_height_ratio", "region": "chin"}],
                               {"jaw": FOCUS_BOX, "chin": FOCUS_BOX})
        self.simulation.selections = [{"region": "jaw", "preset_id": "jaw-narrow"}, {"region": "chin", "preset_id": "chin-long"}]
        self.simulation.region, self.simulation.preset_id = "jaw", "jaw-narrow"
        self.simulation.save()
        from .tasks import process_simulation

        process_simulation(str(self.simulation.id))
        self.simulation.refresh_from_db()
        self.assertEqual(self.simulation.status, Simulation.Status.COMPLETED, self.simulation.error_message)
        self.assertEqual([m["region"] for m in self.simulation.measurements], ["jaw", "chin"])
        # Both presets reach simulate() together, so one render holds both regions.
        self.assertEqual([p["id"] for p in render.call_args.args[1]], ["jaw-narrow", "chin-long"])
        expected = get_preset("jaw-narrow")["related_procedures"] + get_preset("chin-long")["related_procedures"]
        self.assertEqual(self.simulation.related_procedures, list(dict.fromkeys(expected)))

    @patch("doodee.tasks.upload_image")
    @patch("doodee.tasks.simulate", return_value=(b"\x89PNG after", [{"key": "alar_width_ratio", "region": "nose"}], {"nose": FOCUS_BOX}))
    @patch("doodee.tasks.source_for_scan", return_value=(b"\x89PNG source", "private/front", "front"))
    def test_a_row_saved_before_stacking_still_renders(self, source, render, upload):
        """Rows written before `selections` existed hold an empty list, not a one-item stack."""
        self.assertEqual(self.simulation.selections, [])
        from .tasks import process_simulation

        process_simulation(str(self.simulation.id))
        self.simulation.refresh_from_db()
        self.assertEqual(self.simulation.status, Simulation.Status.COMPLETED, self.simulation.error_message)
        self.assertEqual([p["id"] for p in render.call_args.args[1]], ["nose-narrow"])


class PoseQualityTest(TestCase):
    @patch("doodee.analysis_engine._decode")
    def test_invalid_image_error_names_the_failed_view(self, decode):
        decode.side_effect = lambda data: (_ for _ in ()).throw(ValueError("invalid_image")) if data == b"bad" else np.zeros((10, 10, 3))
        images = {view: (b"bad" if view == "left_oblique" else b"ok") for view in SCAN_VIEWS}
        with self.assertRaisesRegex(ValueError, "invalid_image:left_oblique"):
            analyze_images(images)

    def test_rejects_front_images_reused_as_profiles(self):
        poses = {
            view: {"yaw": 0, "pitch": -20 if view == "basal" else 0, "roll": 0}
            for view in SCAN_VIEWS
        }
        with self.assertRaisesRegex(ValueError, r"pose_left_profile:yaw:-55"):
            _validate_pose_set(poses, "full")

    def test_pose_error_names_axis_and_rounded_correction(self):
        poses = {"front": {"yaw": 13, "pitch": 0, "roll": 0}}
        with self.assertRaisesRegex(ValueError, r"pose_front:yaw:-5"):
            _validate_pose_set(poses, "fast")

    def test_a_view_that_produces_no_metrics_is_reported_but_does_not_fail_the_scan(self):
        """An oblique contributes no landmarks to any metric, so a tilted one is not fatal.

        A real 3-view scan was thrown away over right_oblique roll +7.1 against a 6 degree
        limit, on a photo the engine never measures.
        """
        poses = {
            "front": {"yaw": 0, "pitch": 0, "roll": 0},
            "left_oblique": {"yaw": -40, "pitch": 0, "roll": 0},
            "right_oblique": {"yaw": 40, "pitch": 0, "roll": 30},
        }
        self.assertEqual(_validate_pose_set(poses, "fast"), ["pose_right_oblique:roll:-20"])

    def test_measured_views_follow_the_metrics_the_engine_computes(self):
        self.assertEqual(measured_views("fast"), {"front"})
        self.assertEqual(measured_views("standard"), {"front", "left_profile", "right_profile"})
        self.assertEqual(measured_views("full"), {"front", "left_profile", "right_profile"})

    def test_standard_profiles_are_mandatory_and_have_no_skip_path(self):
        """A crooked side photo has to fail the scan; the flow offers no partial result."""
        poses = {
            "front": {"yaw": 0, "pitch": 0, "roll": 0},
            "left_profile": {"yaw": -68, "pitch": 0, "roll": 0},
            "right_profile": {"yaw": 40, "pitch": 0, "roll": 0},
        }
        with self.assertRaisesRegex(ValueError, r"pose_right_profile:yaw:\+15"):
            _validate_pose_set(poses, "standard")

    def test_basal_target_sits_on_the_chin_up_side_of_zero(self):
        """Positive pitch is chin-down here, so a chin-up view needs a negative window.

        With a positive window the app told people to tilt up while only tilting down
        satisfied it, and the stored "basal" photo was a top-down shot instead.
        """
        low, high = POSE_TARGETS["basal"]["pitch"]
        self.assertLess(high, 0)
        self.assertLess(low, high)

    def test_widened_profile_window_accepts_fifty_five_and_eighty(self):
        for yaw in (-80, -55):
            poses = {"front": {"yaw": 0, "pitch": 0, "roll": 0}, "left_profile": {"yaw": yaw, "pitch": 0, "roll": 0}}
            self.assertEqual(_validate_pose_set(poses, "standard"), [])


class IsotropicMeasurementTest(SimpleTestCase):
    """A ratio must describe the face, not the shape of the file it arrived in.

    MediaPipe normalises x by width and y by height, so on a 4:3 photo every width-over-height
    ratio came out 1.33x too small. A real scan stored alar/n_gn = 0.21277 against a Thai mean
    of 0.34364 (z = -3.5) purely because the photo was 742x557; corrected it reads 0.28343.
    """

    def points_for(self, width, height, span=300):
        """One physically square face — 300px wide, 300px tall — as MediaPipe would report it."""
        points = np.zeros((478, 3))
        points[234] = ((width / 2 - span / 2) / width, .5, 0)
        points[454] = ((width / 2 + span / 2) / width, .5, 0)
        points[10] = (.5, (height / 2 - span / 2) / height, 0)
        points[152] = (.5, (height / 2 + span / 2) / height, 0)
        return points

    def test_one_physical_square_reads_square_on_any_photo_shape(self):
        for width, height in ((600, 600), (800, 600), (557, 742)):
            fixed = _isotropic(self.points_for(width, height), np.zeros((height, width, 3), np.uint8))
            ratio = _distance(fixed, 234, 454) / _distance(fixed, 10, 152)
            self.assertAlmostEqual(ratio, 1.0, places=6, msg=f"{width}x{height}")

    def test_the_raw_coordinates_carry_the_distortion_this_removes(self):
        raw = self.points_for(800, 600)
        # 4:3 pixels: the same physical width spans fewer normalized units than the height.
        self.assertAlmostEqual(_distance(raw, 234, 454) / _distance(raw, 10, 152), .75, places=6)

    def test_vertical_distances_are_untouched(self):
        """Heights were already correct, so the fix must not move them."""
        raw = self.points_for(800, 600)
        fixed = _isotropic(raw, np.zeros((600, 800, 3), np.uint8))
        self.assertAlmostEqual(_distance(fixed, 10, 152), _distance(raw, 10, 152), places=9)


class PoseCoordinateParityTest(TestCase):
    """Locks server pose extraction to the web client's.

    The matrix below is the same one apps/web/src/lib/facePose.test.js uses, transposed from
    the MediaPipe JS column-major layout into the row-major layout MediaPipe Python returns.
    Both sides must land on identical angles, or on-device readiness and server validation
    disagree and every auto-captured photo gets rejected as a pose failure.
    """

    MATRIX = [
        0.999598742, -0.0193326753, -0.02070578, -0.028,
        0.0188124683, 0.999509752, -0.0250305254, -5.968,
        0.0211795289, 0.0246308949, 0.99947238, -39.293,
        0.0, 0.0, 0.0, 1.0,
    ]

    def test_pose_matches_the_web_client_on_the_same_matrix(self):
        pose = pose_from_matrix(self.MATRIX)
        self.assertAlmostEqual(pose["yaw"], 1.214, places=2)
        self.assertAlmostEqual(pose["pitch"], 1.412, places=2)
        self.assertAlmostEqual(pose["roll"], 1.078, places=2)

    def test_uniform_scale_is_removed_like_the_web_client(self):
        scaled = [
            value * 4 if index % 4 < 3 and index < 12 else value
            for index, value in enumerate(self.MATRIX)
        ]
        self.assertEqual(pose_from_matrix(scaled), pose_from_matrix(self.MATRIX))

    def test_a_degenerate_matrix_reports_no_rotation(self):
        self.assertEqual(pose_from_matrix([0.0] * 16), {"yaw": 0.0, "pitch": 0.0, "roll": 0.0})

    def test_yaw_tracks_the_sign_of_the_matrix_element_the_web_client_reads(self):
        """A head turned to the subject's right reads positive yaw.

        Verified against a real photo: apps/web/public/upgrade-assets/doodee-male-left-before.png
        shows a head turned to the subject's right and measures yaw +62.9, inside the
        right_profile target of [60, 75]. Degrees are not asserted here because removing the
        uniform scale makes them depend on the whole first column, only the sign is the contract.
        """
        def yaw_at(value):
            turned = list(self.MATRIX)
            turned[8] = value
            return pose_from_matrix(turned)["yaw"]

        self.assertGreater(yaw_at(0.5), 0)
        self.assertLess(yaw_at(-0.5), 0)
        self.assertAlmostEqual(yaw_at(0.5), -yaw_at(-0.5), places=6)

    def test_every_pose_target_midpoint_validates(self):
        poses = {
            view: {axis: sum(target[axis]) / 2 for axis in ("yaw", "pitch", "roll")}
            for view, target in POSE_TARGETS.items()
        }
        _validate_pose_set(poses)


class AnalyzeImagesModeTest(TestCase):
    def test_analyze_images_fast_mode_marks_and_tracks_optional_missing_views(self):
        images = {view: b"ok" for view in SCAN_VIEW_MODES["fast"]}

        points = np.column_stack((np.linspace(0.1, 0.9, 478), np.linspace(0.2, 0.8, 478), np.zeros(478)))
        image = np.zeros((10, 10, 3), dtype=np.uint8)
        poses = iter([
            {"yaw": 0, "pitch": 0, "roll": 0},
            {"yaw": -40, "pitch": 0, "roll": 0},
            {"yaw": 40, "pitch": 0, "roll": 0},
        ])

        with patch("doodee.analysis_engine._decode", return_value=image), patch(
            "doodee.analysis_engine._landmarks",
            side_effect=lambda _image: (points, next(poses)),
        ), patch("doodee.analysis_engine._skin_metrics", return_value=[]):
            result = analyze_images(images, scan_mode="fast")

        self.assertEqual(result["analysis_tier"], "fast")
        self.assertEqual(result["missing_optional_views"], ["front_smile", "left_profile", "right_profile", "basal"])
        self.assertFalse(any("side_profile" in metric["key"] for metric in result["metrics"]))


class RetentionTest(TestCase):
    @patch("doodee.management.commands.cleanup_expired_data.cleanup_simulation.delay")
    @patch("doodee.management.commands.cleanup_expired_data.cleanup_scan.delay")
    def test_cleanup_requeues_pending_deletions(self, cleanup_scan, cleanup_simulation):
        user = User.objects.create_user("pending-delete")
        scan = Scan.objects.create(
            user=user,
            age_band=Scan.AgeBand.ADULT,
            status=Scan.Status.DELETION_PENDING,
            expires_at=timezone.now() + timedelta(days=1),
        )
        simulation = Simulation.objects.create(
            scan=scan,
            status=Simulation.Status.DELETION_PENDING,
            region="nose",
            model_version="test",
            expires_at=timezone.now() + timedelta(days=1),
        )
        with self.captureOnCommitCallbacks(execute=True):
            call_command("cleanup_expired_data")
        cleanup_scan.assert_called_once_with(str(scan.id))
        cleanup_simulation.assert_called_once_with(str(simulation.id))


class UserAdminTest(TestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser("root", "root@example.com", "RootPassphrase!2026")
        self.staff = User.objects.create_user("staff", is_staff=True)
        self.free = self.firebase_user("free", "free-uid")
        self.vip = self.firebase_user("vip", "vip-uid")
        self.member = self.firebase_user("member", "member-uid")
        self.clinic = self.firebase_user("clinic", "clinic-uid")
        # Migration 0008 seeds both membership groups, so these always exist by now.
        self.member.groups.add(Group.objects.get(name="pro_member"))
        self.clinic.groups.add(self.member.groups.get(), Group.objects.get(name="clinic_partner"))
        promo = PromoCode.objects.create(code="ADMINVIP", days=7)
        PromoRedemption.objects.create(user=self.vip, promo_code=promo, expires_at=timezone.now() + timedelta(days=1))
        FirebaseIdentity.objects.create(user=self.staff, firebase_uid="staff-uid")
        FirebaseIdentity.objects.create(user=User.objects.create_user("guest"), firebase_uid="dev-guest-uid")

    @staticmethod
    def firebase_user(username, uid):
        user = User.objects.create_user(username, email=f"{username}@example.com")
        FirebaseIdentity.objects.create(user=user, firebase_uid=uid)
        return user

    def test_only_superusers_can_manage_users(self):
        url = "/admin/auth/user/"
        self.assertRedirects(self.client.get(url), f"/admin/login/?next={url}")
        self.client.force_login(self.staff)
        self.assertEqual(self.client.get(url).status_code, 403)
        self.client.force_login(self.superuser)
        self.assertEqual(self.client.get(url).status_code, 200)

    def test_summary_counts_real_users_once_and_cards_filter(self):
        self.client.force_login(self.superuser)
        response = self.client.get("/admin/auth/user/")
        self.assertEqual(response.context["plan_counts"], {
            "total": 4, "free": 1, "vip": 1, "member": 1, "clinic": 1,
        })
        response = self.client.get("/admin/auth/user/?account=users&plan=clinic")
        self.assertEqual(list(response.context["cl"].result_list), [self.clinic])

    def test_searches_firebase_uid(self):
        self.client.force_login(self.superuser)
        response = self.client.get("/admin/auth/user/?q=member-uid")
        self.assertEqual(list(response.context["cl"].result_list), [self.member])

    def test_membership_changes_are_exclusive_and_preserve_other_entitlements(self):
        self.client.force_login(self.superuser)
        other = Group.objects.create(name="other_permission")
        self.vip.groups.add(other)
        redemption = self.vip.promo_redemptions.get()
        url = f"/admin/auth/user/{self.vip.pk}/change/"

        for membership, expected in (("member", {"pro_member"}), ("clinic", {"clinic_partner"}), ("free", set())):
            response = self.client.post(url, {"membership": membership, "is_active": "on", "_save": "Save"})
            self.assertEqual(response.status_code, 302, response.context)
            permanent = set(self.vip.groups.filter(name__in=("pro_member", "clinic_partner")).values_list("name", flat=True))
            self.assertEqual(permanent, expected)

        self.assertTrue(self.vip.groups.filter(pk=other.pk).exists())
        self.assertTrue(PromoRedemption.objects.filter(pk=redemption.pk).exists())
        from .views import _user_plan
        self.assertEqual(_user_plan(self.vip), "vip")
        self.assertTrue(LogEntry.objects.filter(object_id=str(self.vip.pk)).exists())

    def test_password_change_is_staff_only_and_uses_validators(self):
        self.client.force_login(self.superuser)
        self.assertEqual(self.client.get(f"/admin/auth/user/{self.free.pk}/password/").status_code, 403)
        url = f"/admin/auth/user/{self.staff.pk}/password/"
        self.assertContains(self.client.get(url), "window.confirm")

        response = self.client.post(url, {"password1": "password", "password2": "password", "set-password": "1"})
        self.staff.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.staff.check_password("password"))
        self.assertTrue(response.context["form"].errors)

        password = "Str0ng!UniquePassphrase2026"
        self.assertEqual(self.client.post(url, {"password1": password, "password2": password, "set-password": "1"}).status_code, 302)
        self.staff.refresh_from_db()
        self.assertTrue(self.staff.check_password(password))

    def test_change_forms_confirm_but_delete_uses_django_confirmation_only(self):
        self.client.force_login(self.superuser)
        self.assertContains(self.client.get(f"/admin/auth/user/{self.free.pk}/change/"), "window.confirm")
        delete = self.client.get(f"/admin/auth/user/{self.free.pk}/delete/")
        self.assertEqual(delete.status_code, 200)
        self.assertNotContains(delete, "window.confirm")
