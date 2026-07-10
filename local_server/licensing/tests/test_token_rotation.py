from datetime import timedelta

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
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
HARDWARE_OVERRIDE_RAW = "rotation-test-hw"


def _make_token(hw, start_delta, ttl_days=7):
    """`start_delta` dan boshlab `ttl_days` kunlik token - ketma-ket batch
    tokenlarni simulyatsiya qilish uchun (har biri o'z "haftasi" boshida
    nbf'ga ega bo'ladi)."""
    start = timezone.now() + start_delta
    claims = {
        "iss": "pos-ona",
        "sub": "restaurant-1",
        "license_id": "license-1",
        "hw": hw,
        "iat": int(start.timestamp()),
        "nbf": int(start.timestamp()) - 60,
        "exp": int((start + timedelta(days=ttl_days)).timestamp()),
    }
    return jwt.encode(claims, PRIVATE_PEM, algorithm="RS256")


def _token_dict(hw, start_delta, ttl_days=7):
    token = _make_token(hw, start_delta, ttl_days)
    exp = timezone.now() + start_delta + timedelta(days=ttl_days)
    return {"token": token, "expires_at": exp.isoformat()}


@override_settings(
    LICENSE_PUBLIC_KEY=PUBLIC_PEM,
    HARDWARE_ID_OVERRIDE=HARDWARE_OVERRIDE_RAW,
    LICENSE_CLOCK_SKEW_SECONDS=300,
    LICENSE_EXP_GRACE_SECONDS=0,
)
class CurrentValidTokenTests(TestCase):
    def setUp(self):
        hardware._cached_fingerprint = None
        self.addCleanup(self._cleanup)
        self.test_hw = hardware.get_hardware_fingerprint()

    def _cleanup(self):
        hardware._cached_fingerprint = None

    def _state(self, **overrides):
        defaults = dict(
            license_key='abc123',
            hardware_hash=self.test_hw,
            restaurant_name='Test Restoran',
            activated_at=timezone.now(),
            last_renewed_at=timezone.now(),
        )
        defaults.update(overrides)
        return LicenseState.objects.create(**defaults)

    def test_valid_current_token_needs_no_rotation(self):
        current = _token_dict(self.test_hw, timedelta(days=0))
        pending = [_token_dict(self.test_hw, timedelta(days=7))]
        state = self._state(
            jwt_token=current['token'],
            token_expires_at=current['expires_at'],
            pending_tokens=pending,
        )

        claims, error = state.current_valid_token(self.test_hw)

        self.assertIsNone(error)
        self.assertIsNotNone(claims)
        state.refresh_from_db()
        self.assertEqual(state.jwt_token, current['token'])
        self.assertEqual(state.pending_tokens, pending)

    def test_expired_current_token_promotes_ready_pending_token(self):
        # First week already expired; the second pre-issued token's window
        # (started a week ago, still has ~6 days left) is the one now due.
        expired = _make_token(self.test_hw, timedelta(days=-8), ttl_days=7)
        ready = _token_dict(self.test_hw, timedelta(days=-7), ttl_days=7)
        future = _token_dict(self.test_hw, timedelta(days=0), ttl_days=7)
        state = self._state(
            jwt_token=expired,
            token_expires_at=timezone.now() - timedelta(days=1),
            pending_tokens=[ready, future],
        )

        claims, error = state.current_valid_token(self.test_hw)

        self.assertIsNone(error)
        state.refresh_from_db()
        self.assertEqual(state.jwt_token, ready['token'])
        self.assertEqual(state.pending_tokens, [future])

    def test_all_tokens_exhausted_blocks(self):
        expired = _make_token(self.test_hw, timedelta(days=-8), ttl_days=7)
        state = self._state(
            jwt_token=expired,
            token_expires_at=timezone.now() - timedelta(days=1),
            pending_tokens=[],
        )

        claims, error = state.current_valid_token(self.test_hw)

        self.assertIsNone(claims)
        self.assertIsNotNone(error)

    def test_pending_token_not_yet_due_keeps_system_blocked(self):
        expired = _make_token(self.test_hw, timedelta(days=-8), ttl_days=7)
        # This pending token's window hasn't started yet - there is a real
        # gap (e.g. renewal never ran before going offline).
        not_yet_due = _token_dict(self.test_hw, timedelta(days=3), ttl_days=7)
        state = self._state(
            jwt_token=expired,
            token_expires_at=timezone.now() - timedelta(days=1),
            pending_tokens=[not_yet_due],
        )

        claims, error = state.current_valid_token(self.test_hw)

        self.assertIsNone(claims)
        self.assertIsNotNone(error)
        state.refresh_from_db()
        # Nothing promoted - the not-yet-valid token stays queued for later.
        self.assertEqual(state.jwt_token, expired)
        self.assertEqual(state.pending_tokens, [not_yet_due])

    def test_pending_token_bound_to_other_hardware_is_skipped(self):
        expired = _make_token(self.test_hw, timedelta(days=-8), ttl_days=7)
        wrong_hw = _token_dict("some-other-hardware", timedelta(days=-7), ttl_days=7)
        state = self._state(
            jwt_token=expired,
            token_expires_at=timezone.now() - timedelta(days=1),
            pending_tokens=[wrong_hw],
        )

        claims, error = state.current_valid_token(self.test_hw)

        self.assertIsNone(claims)
        self.assertIsNotNone(error)
