from datetime import timedelta
import os
from unittest.mock import patch

import cv2
import numpy as np
from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import ConsentEvent, Scan, Simulation
from .analysis_engine import (
    POSE_TARGETS, SCAN_VIEW_MODES, _validate_pose_set, analyze_images, measured_views, pose_from_matrix,
)
from .simulation_engine import constrain_region_and_watermark, validate_parameters
from .storage import _headers
from .views import SCAN_VIEWS


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
        payload.update(age_band="adult", analysis_consent_version="2026.1")
        response = self.client.post("/api/v1/scans/", payload, format="multipart")
        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(upload_image.call_count, 7)
        delay.assert_called_once()
        self.assertTrue(ConsentEvent.objects.filter(user=self.user, purpose="analysis").exists())

    @patch("doodee.views.process_scan.delay")
    @patch("doodee.views.upload_image", side_effect=lambda name, data, content_type: name)
    def test_upload_allows_fast_mode(self, upload_image, delay):
        payload = {view: image_file(view) for view in SCAN_VIEW_MODES["fast"]}
        payload.update(age_band="adult", analysis_consent_version="2026.1", scan_mode="fast")
        response = self.client.post("/api/v1/scans/", payload, format="multipart")
        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(upload_image.call_count, 3)
        delay.assert_called_once()

    @patch("doodee.views.delete_image")
    @patch("doodee.views.upload_image")
    def test_storage_failure_deletes_successful_parallel_uploads(self, upload_image, delete_image):
        upload_image.side_effect = lambda name, data, content_type: (_ for _ in ()).throw(RuntimeError("storage down")) if name.endswith("/basal") else name
        payload = {view: image_file(view) for view in SCAN_VIEWS}
        payload.update(age_band="adult", analysis_consent_version="2026.1")
        response = self.client.post("/api/v1/scans/", payload, format="multipart")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(delete_image.call_count, 6)
        self.assertFalse(Scan.objects.exists())

    def test_minor_scans_are_not_returned_in_history(self):
        Scan.objects.create(user=self.user, age_band="minor", expires_at=timezone.now() + timedelta(hours=24))
        Scan.objects.create(user=self.user, age_band="adult", expires_at=timezone.now() + timedelta(days=30))
        response = self.client.get("/api/v1/scans/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["age_band"], "adult")

    def test_minor_cannot_request_simulation(self):
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
            "parameters": {"bridge_height": 10},
            "simulation_consent_version": "2026.1",
        }, format="json")
        self.assertEqual(response.status_code, 400)


class SimulationSafetyTest(TestCase):
    def test_parameters_are_closed_and_bounded(self):
        self.assertEqual(validate_parameters("nose", {"bridge_height": 10}), {"bridge_height": 10.0})
        with self.assertRaisesRegex(ValueError, "invalid_parameters"):
            validate_parameters("nose", {"free_prompt": 10})
        with self.assertRaisesRegex(ValueError, "invalid_parameters"):
            validate_parameters("nose", {"bridge_height": 101})

    @patch("doodee.analysis_engine._landmarks")
    def test_generated_pixels_are_clipped_to_region_and_watermarked(self, landmarks):
        points = np.full((478, 3), 0.5, dtype=np.float64)
        for index, xy in {168: (.48, .3), 193: (.42, .42), 417: (.58, .42), 98: (.4, .58), 327: (.6, .58), 2: (.5, .62), 1: (.5, .5)}.items():
            points[index, :2] = xy
        landmarks.return_value = points
        original = np.full((300, 300, 3), 128, dtype=np.uint8)
        generated = np.zeros_like(original)
        generated[:, :, 2] = 255
        _, original_bytes = cv2.imencode(".jpg", original)
        _, generated_bytes = cv2.imencode(".jpg", generated)
        output = constrain_region_and_watermark(original_bytes.tobytes(), generated_bytes.tobytes(), "nose")
        decoded = cv2.imdecode(np.frombuffer(output, np.uint8), cv2.IMREAD_COLOR)
        self.assertTrue(np.allclose(decoded[10, 10], [128, 128, 128], atol=3))
        self.assertGreater(decoded[150, 150, 2], decoded[150, 150, 0])
        self.assertLess(decoded[-30, 10].mean(), 40)


class PoseQualityTest(TestCase):
    @patch("doodee.analysis_engine._decode")
    def test_invalid_image_error_names_the_failed_view(self, decode):
        decode.side_effect = lambda data: (_ for _ in ()).throw(ValueError("invalid_image")) if data == b"bad" else np.zeros((10, 10, 3))
        images = {view: (b"bad" if view == "left_oblique" else b"ok") for view in SCAN_VIEWS}
        with self.assertRaisesRegex(ValueError, "invalid_image:left_oblique"):
            analyze_images(images)

    def test_rejects_front_images_reused_as_profiles(self):
        poses = {
            view: {"yaw": 0, "pitch": 20 if view == "basal" else 0, "roll": 0}
            for view in SCAN_VIEWS
        }
        with self.assertRaisesRegex(ValueError, r"pose_left_profile:yaw:-60"):
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
        self.assertEqual(measured_views("full"), {"front", "left_profile", "right_profile"})


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
