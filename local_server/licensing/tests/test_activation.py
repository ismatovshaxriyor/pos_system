from unittest.mock import MagicMock, patch

import requests
from django.contrib.auth.hashers import make_password
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from core.models import User
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
            "tokens": [{"token": "fake.jwt.token", "expires_at": expires_at}],
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
    def test_batch_of_tokens_keeps_first_active_and_rest_pending(self, mock_activate):
        now = timezone.now()
        tokens = [
            {"token": "token-1", "expires_at": (now + timezone.timedelta(days=7)).isoformat()},
            {"token": "token-2", "expires_at": (now + timezone.timedelta(days=14)).isoformat()},
            {"token": "token-3", "expires_at": (now + timezone.timedelta(days=21)).isoformat()},
        ]
        mock_activate.return_value = _mock_response(200, {
            "tokens": tokens,
            "restaurant": {"id": "11111111-1111-1111-1111-111111111111", "name": "Test Restoran"},
            "detail": "Tizim muvaffaqiyatli faollashtirildi.",
        })

        response = self.client.post(self.url, {"license_key": "abc123"}, content_type='application/json')

        self.assertEqual(response.status_code, 200)
        state = LicenseState.load()
        self.assertEqual(state.jwt_token, "token-1")
        self.assertEqual(state.pending_tokens, tokens[1:])

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

    @patch('licensing.views.OnaClient.activate')
    def test_admin_data_provisions_local_manager_user(self, mock_activate):
        password_hash = make_password("Kuchli-Parol-1")
        expires_at = (timezone.now() + timezone.timedelta(days=7)).isoformat()
        mock_activate.return_value = _mock_response(200, {
            "tokens": [{"token": "fake.jwt.token", "expires_at": expires_at}],
            "restaurant": {"id": "11111111-1111-1111-1111-111111111111", "name": "Test Restoran"},
            "detail": "Tizim muvaffaqiyatli faollashtirildi.",
            "admin": {
                "phone": "+998901112233",
                "full_name": "Aziz Aliyev",
                "password_hash": password_hash,
            },
        })

        response = self.client.post(self.url, {"license_key": "abc123"}, content_type='application/json')

        self.assertEqual(response.status_code, 200)

        # Response must expose contact info but never the password hash.
        self.assertEqual(response.data['admin']['phone'], "+998901112233")
        self.assertNotIn('password_hash', response.data['admin'])

        user = User.objects.get(username="+998901112233")
        self.assertEqual(user.role, 'manager')
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.check_password("Kuchli-Parol-1"))

    @patch('licensing.views.OnaClient.activate')
    def test_no_admin_data_means_no_user_created(self, mock_activate):
        expires_at = (timezone.now() + timezone.timedelta(days=7)).isoformat()
        mock_activate.return_value = _mock_response(200, {
            "tokens": [{"token": "fake.jwt.token", "expires_at": expires_at}],
            "restaurant": {"id": "11111111-1111-1111-1111-111111111111", "name": "Test Restoran"},
            "detail": "Tizim muvaffaqiyatli faollashtirildi.",
        })

        response = self.client.post(self.url, {"license_key": "abc123"}, content_type='application/json')

        self.assertEqual(response.status_code, 200)
        self.assertNotIn('admin', response.data)
        self.assertEqual(User.objects.count(), 0)

    @patch('licensing.views.OnaClient.activate')
    def test_reactivation_updates_existing_admin_user_idempotently(self, mock_activate):
        User.objects.create(username="+998901112233", role='waiter')

        password_hash = make_password("Yangi-Parol-2")
        expires_at = (timezone.now() + timezone.timedelta(days=7)).isoformat()
        mock_activate.return_value = _mock_response(200, {
            "tokens": [{"token": "fake.jwt.token", "expires_at": expires_at}],
            "restaurant": {"id": "11111111-1111-1111-1111-111111111111", "name": "Test Restoran"},
            "detail": "Tizim muvaffaqiyatli faollashtirildi.",
            "admin": {
                "phone": "+998901112233",
                "full_name": "Aziz Aliyev",
                "password_hash": password_hash,
            },
        })

        self.client.post(self.url, {"license_key": "abc123"}, content_type='application/json')

        self.assertEqual(User.objects.count(), 1)
        user = User.objects.get(username="+998901112233")
        self.assertEqual(user.role, 'manager')
        self.assertTrue(user.check_password("Yangi-Parol-2"))
