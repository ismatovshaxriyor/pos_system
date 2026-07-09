from unittest.mock import MagicMock, patch

import requests
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from licensing import hardware
from licensing.models import LicenseState


def _mock_response(status_code, data):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = data
    return response


@override_settings(HARDWARE_ID_OVERRIDE='dev-macbook')
class ActivateViewTests(TestCase):
    def setUp(self):
        hardware._cached_fingerprint = None
        self.addCleanup(self._reset_cache)
        self.url = reverse('license-activate')

    def _reset_cache(self):
        hardware._cached_fingerprint = None

    @patch('licensing.views.OnaClient.activate')
    def test_successful_activation_persists_state(self, mock_activate):
        expires_at = (timezone.now() + timezone.timedelta(days=7)).isoformat()
        mock_activate.return_value = _mock_response(200, {
            "token": "fake.jwt.token",
            "expires_at": expires_at,
            "restaurant": {"id": "11111111-1111-1111-1111-111111111111", "name": "Test Restoran"},
            "detail": "Tizim muvaffaqiyatli faollashtirildi.",
        })

        response = self.client.post(self.url, {"license_key": "abc123"}, content_type='application/json')

        self.assertEqual(response.status_code, 200)
        state = LicenseState.load()
        self.assertIsNotNone(state)
        self.assertEqual(state.restaurant_name, "Test Restoran")
        self.assertEqual(state.jwt_token, "fake.jwt.token")
        self.assertFalse(state.is_blocked)

    @patch('licensing.views.OnaClient.activate')
    def test_ona_rejection_is_passed_through(self, mock_activate):
        mock_activate.return_value = _mock_response(403, {"detail": "Qurilma mos kelmadi."})

        response = self.client.post(self.url, {"license_key": "abc123"}, content_type='application/json')

        self.assertEqual(response.status_code, 403)
        self.assertIsNone(LicenseState.load())

    @patch('licensing.views.OnaClient.activate')
    def test_network_error_returns_503(self, mock_activate):
        mock_activate.side_effect = requests.ConnectionError("no route")

        response = self.client.post(self.url, {"license_key": "abc123"}, content_type='application/json')

        self.assertEqual(response.status_code, 503)

    def test_missing_license_key_returns_400(self):
        response = self.client.post(self.url, {}, content_type='application/json')
        self.assertEqual(response.status_code, 400)
