from datetime import timedelta
from unittest.mock import patch

import cv2
import numpy as np
from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import ConsentEvent, Scan, Simulation
from .analysis_engine import _validate_pose_set, analyze_images
from .simulation_engine import constrain_region_and_watermark, validate_parameters
from .views import SCAN_VIEWS


def image_file(name):
    image = np.full((120, 120, 3), 128, dtype=np.uint8)
    cv2.line(image, (10, 10), (110, 110), (255, 255, 255), 3)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return SimpleUploadedFile(f"{name}.jpg", encoded.tobytes(), content_type="image/jpeg")


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
        front = np.zeros((478, 3), dtype=np.float64)
        front[234, 0], front[454, 0], front[1, 0] = 0.2, 0.8, 0.5
        front[33, :2], front[133, :2] = (.3, .4), (.4, .4)
        front[362, :2], front[263, :2] = (.6, .4), (.7, .4)
        points = {view: front.copy() for view in SCAN_VIEWS}
        with self.assertRaisesRegex(ValueError, "pose_left_oblique"):
            _validate_pose_set(points)


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
