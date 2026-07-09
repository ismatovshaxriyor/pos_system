from datetime import timedelta

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from licensing import hardware
from licensing.models import LicenseState


def _generate_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


PRIVATE_PEM, PUBLIC_PEM = _generate_keypair()
HARDWARE_OVERRIDE_RAW = "offline-test-hw"


def _make_token(hw, exp_delta=timedelta(days=7)):
    now = timezone.now()
    claims = {
        "iss": "pos-ona",
        "sub": "restaurant-1",
        "license_id": "license-1",
        "hw": hw,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()) - 60,
        "exp": int((now + exp_delta).timestamp()),
    }
    return jwt.encode(claims, PRIVATE_PEM, algorithm="RS256")


@override_settings(
    LICENSE_PUBLIC_KEY=PUBLIC_PEM,
    HARDWARE_ID_OVERRIDE=HARDWARE_OVERRIDE_RAW,
    LICENSE_CLOCK_SKEW_SECONDS=300,
    LICENSE_EXP_GRACE_SECONDS=0,
)
class ApplyOfflineTokenViewTests(TestCase):
    def setUp(self):
        hardware._cached_fingerprint = None
        self.addCleanup(self._cleanup)
        self.test_hw = hardware.get_hardware_fingerprint()
        self.url = reverse('license-apply-offline-token')

    def _cleanup(self):
        hardware._cached_fingerprint = None

    def _activated_state(self, **overrides):
        defaults = dict(
            license_key='abc123',
            hardware_hash=self.test_hw,
            restaurant_name='Test Restoran',
            token_expires_at=timezone.now() + timedelta(days=1),
            activated_at=timezone.now(),
            last_renewed_at=timezone.now(),
        )
        defaults.update(overrides)
        return LicenseState.objects.create(**defaults)

    def test_valid_offline_token_extends_license(self):
        self._activated_state()
        new_token = _make_token(self.test_hw, exp_delta=timedelta(days=14))

        response = self.client.post(self.url, {"token": new_token}, content_type='application/json')

        self.assertEqual(response.status_code, 200)
        state = LicenseState.load()
        self.assertEqual(state.jwt_token, new_token)
        # New expiry should be ~14 days out, not the old ~1 day.
        self.assertGreater(state.token_expires_at - timezone.now(), timedelta(days=10))

    def test_offline_token_unblocks_license_inactive_state(self):
        self._activated_state(is_blocked=True, blocked_reason='license_inactive')
        new_token = _make_token(self.test_hw, exp_delta=timedelta(days=14))

        response = self.client.post(self.url, {"token": new_token}, content_type='application/json')

        self.assertEqual(response.status_code, 200)
        state = LicenseState.load()
        self.assertFalse(state.is_blocked)
        self.assertEqual(state.blocked_reason, '')

    def test_offline_token_does_not_clear_remote_command_block(self):
        # A block placed by an explicit remote command is a separate
        # concern from license expiry - an offline renewal shouldn't
        # silently lift it.
        self._activated_state(is_blocked=True, blocked_reason='remote_command')
        new_token = _make_token(self.test_hw, exp_delta=timedelta(days=14))

        response = self.client.post(self.url, {"token": new_token}, content_type='application/json')

        self.assertEqual(response.status_code, 200)
        state = LicenseState.load()
        self.assertTrue(state.is_blocked)
        self.assertEqual(state.blocked_reason, 'remote_command')

    def test_wrong_hardware_token_rejected(self):
        self._activated_state()
        new_token = _make_token("other-hw", exp_delta=timedelta(days=14))

        response = self.client.post(self.url, {"token": new_token}, content_type='application/json')

        self.assertEqual(response.status_code, 400)
        # Rejected token must not overwrite the existing (still-valid) state.
        state = LicenseState.load()
        self.assertEqual(state.jwt_token, '')

    def test_expired_token_rejected(self):
        self._activated_state()
        new_token = _make_token(self.test_hw, exp_delta=timedelta(days=-1))

        response = self.client.post(self.url, {"token": new_token}, content_type='application/json')

        self.assertEqual(response.status_code, 400)

    def test_not_activated_yet_rejected(self):
        response = self.client.post(
            self.url, {"token": _make_token(self.test_hw)}, content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_missing_token_returns_400(self):
        self._activated_state()
        response = self.client.post(self.url, {}, content_type='application/json')
        self.assertEqual(response.status_code, 400)
