from datetime import timedelta

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.cache import cache
from django.test import TestCase, override_settings
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
HARDWARE_OVERRIDE_RAW = "test-hw-fingerprint"


def _make_token(hw, exp_delta=timedelta(days=7), extra_claims=None):
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
    if extra_claims:
        claims.update(extra_claims)
    return jwt.encode(claims, PRIVATE_PEM, algorithm="RS256")


@override_settings(
    LICENSE_ENFORCEMENT=True,
    LICENSE_PUBLIC_KEY=PUBLIC_PEM,
    HARDWARE_ID_OVERRIDE=HARDWARE_OVERRIDE_RAW,
    LICENSE_CLOCK_SKEW_SECONDS=300,
    LICENSE_EXP_GRACE_SECONDS=0,
)
class LicenseEnforcementMiddlewareTests(TestCase):
    def setUp(self):
        hardware._cached_fingerprint = None
        cache.clear()
        # The actual sha256 fingerprint the middleware will compute for
        # HARDWARE_OVERRIDE_RAW - tokens must carry THIS as their "hw" claim,
        # not the raw override string.
        self.test_hw = hardware.get_hardware_fingerprint()
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        hardware._cached_fingerprint = None
        cache.clear()

    def _set_state(self, **kwargs):
        state = LicenseState.load() or LicenseState()
        for key, value in kwargs.items():
            setattr(state, key, value)
        state.save()
        return state

    def test_no_license_state_blocks(self):
        response = self.client.get('/api/tables/')
        self.assertEqual(response.status_code, 402)

    def test_valid_token_allows(self):
        self._set_state(jwt_token=_make_token(self.test_hw), hardware_hash=self.test_hw)
        response = self.client.get('/api/tables/')
        self.assertNotEqual(response.status_code, 402)

    def test_expired_token_blocks(self):
        self._set_state(
            jwt_token=_make_token(self.test_hw, exp_delta=timedelta(days=-1)),
            hardware_hash=self.test_hw,
        )
        response = self.client.get('/api/tables/')
        self.assertEqual(response.status_code, 402)

    def test_expired_within_grace_allows(self):
        with override_settings(LICENSE_EXP_GRACE_SECONDS=3600):
            self._set_state(
                jwt_token=_make_token(self.test_hw, exp_delta=timedelta(seconds=-60)),
                hardware_hash=self.test_hw,
            )
            response = self.client.get('/api/tables/')
            self.assertNotEqual(response.status_code, 402)

    def test_hardware_mismatch_blocks(self):
        self._set_state(jwt_token=_make_token("other-hw"), hardware_hash=self.test_hw)
        response = self.client.get('/api/tables/')
        self.assertEqual(response.status_code, 402)

    def test_is_blocked_flag_wins_over_valid_token(self):
        self._set_state(
            jwt_token=_make_token(self.test_hw), hardware_hash=self.test_hw, is_blocked=True,
        )
        response = self.client.get('/api/tables/')
        self.assertEqual(response.status_code, 402)

    @override_settings(LICENSE_ENFORCEMENT=False)
    def test_enforcement_disabled_allows(self):
        response = self.client.get('/api/tables/')
        self.assertNotEqual(response.status_code, 402)

    def test_exempt_license_path_allows(self):
        response = self.client.get('/api/license/status/')
        self.assertNotEqual(response.status_code, 402)

    def test_non_api_path_allows(self):
        response = self.client.get('/admin/')
        self.assertNotEqual(response.status_code, 402)
