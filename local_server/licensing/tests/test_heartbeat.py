from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from django.utils import timezone

from licensing import hardware
from licensing.models import LicenseState
from licensing.tasks import renew_license_token, send_heartbeat


def _mock_response(status_code, data):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = data
    return response


@override_settings(HARDWARE_ID_OVERRIDE='dev-macbook')
class SendHeartbeatTests(TestCase):
    def setUp(self):
        hardware._cached_fingerprint = None
        self.addCleanup(self._reset_cache)

    def _reset_cache(self):
        hardware._cached_fingerprint = None

    def _activated_state(self, **overrides):
        defaults = dict(
            license_key='abc123',
            hardware_hash=hardware.get_hardware_fingerprint(),
            restaurant_name='Test Restoran',
            token_expires_at=timezone.now() + timezone.timedelta(days=7),
            activated_at=timezone.now(),
            last_renewed_at=timezone.now(),
        )
        defaults.update(overrides)
        return LicenseState.objects.create(**defaults)

    def test_no_state_is_noop(self):
        # Should not raise even though nothing is activated.
        send_heartbeat.run()

    @patch('licensing.tasks.OnaClient.heartbeat')
    def test_license_inactive_blocks_locally(self, mock_heartbeat):
        self._activated_state()
        mock_heartbeat.return_value = _mock_response(200, {
            "status": "ok", "license_active": False, "desired_version": "", "commands": [],
        })

        send_heartbeat.run()

        state = LicenseState.load()
        self.assertTrue(state.is_blocked)
        self.assertEqual(state.blocked_reason, 'license_inactive')

    @patch('licensing.tasks.OnaClient.heartbeat')
    def test_license_active_unblocks_previous_inactive_block(self, mock_heartbeat):
        self._activated_state(is_blocked=True, blocked_reason='license_inactive')
        mock_heartbeat.return_value = _mock_response(200, {
            "status": "ok", "license_active": True, "desired_version": "", "commands": [],
        })

        send_heartbeat.run()

        state = LicenseState.load()
        self.assertFalse(state.is_blocked)
        self.assertEqual(state.blocked_reason, '')

    @patch('licensing.tasks.OnaClient.heartbeat')
    def test_remote_command_block_is_not_cleared_by_license_active(self, mock_heartbeat):
        # A block placed by an explicit remote command must not be silently
        # lifted just because the license itself is still active.
        self._activated_state(is_blocked=True, blocked_reason='remote_command')
        mock_heartbeat.return_value = _mock_response(200, {
            "status": "ok", "license_active": True, "desired_version": "", "commands": [],
        })

        send_heartbeat.run()

        state = LicenseState.load()
        self.assertTrue(state.is_blocked)
        self.assertEqual(state.blocked_reason, 'remote_command')

    @patch('licensing.tasks.renew_license_token.delay')
    @patch('licensing.tasks.OnaClient.heartbeat')
    def test_expiring_soon_triggers_renewal(self, mock_heartbeat, mock_renew_delay):
        self._activated_state(token_expires_at=timezone.now() + timezone.timedelta(hours=1))
        mock_heartbeat.return_value = _mock_response(200, {
            "status": "ok", "license_active": True, "desired_version": "", "commands": [],
        })

        send_heartbeat.run()

        mock_renew_delay.assert_called_once()

    @patch('licensing.tasks.renew_license_token.delay')
    @patch('licensing.tasks.OnaClient.heartbeat')
    def test_pending_batch_tokens_delay_renewal(self, mock_heartbeat, mock_renew_delay):
        # The current token expires soon, but a batch of pre-issued pending
        # tokens covers weeks further out - renewal must be judged against
        # the furthest expiry in the batch, not just the active token.
        self._activated_state(
            token_expires_at=timezone.now() + timezone.timedelta(hours=1),
            pending_tokens=[
                {"token": "future-token", "expires_at": (timezone.now() + timezone.timedelta(days=20)).isoformat()},
            ],
        )
        mock_heartbeat.return_value = _mock_response(200, {
            "status": "ok", "license_active": True, "desired_version": "", "commands": [],
        })

        send_heartbeat.run()

        mock_renew_delay.assert_not_called()

    @patch('licensing.tasks.OnaClient.heartbeat')
    def test_network_error_is_swallowed(self, mock_heartbeat):
        import requests
        self._activated_state()
        mock_heartbeat.side_effect = requests.ConnectionError("offline")

        send_heartbeat.run()  # should not raise


@override_settings(HARDWARE_ID_OVERRIDE='dev-macbook')
class RenewLicenseTokenTests(TestCase):
    def setUp(self):
        hardware._cached_fingerprint = None
        self.addCleanup(self._reset_cache)

    def _reset_cache(self):
        hardware._cached_fingerprint = None

    def _activated_state(self, **overrides):
        defaults = dict(
            license_key='abc123',
            hardware_hash=hardware.get_hardware_fingerprint(),
            restaurant_name='Test Restoran',
            token_expires_at=timezone.now() + timezone.timedelta(days=7),
            activated_at=timezone.now(),
            last_renewed_at=timezone.now(),
        )
        defaults.update(overrides)
        return LicenseState.objects.create(**defaults)

    @patch('licensing.tasks.OnaClient.renew')
    def test_renewal_stores_first_token_as_active_and_rest_as_pending(self, mock_renew):
        self._activated_state()
        now = timezone.now()
        tokens = [
            {"token": "token-1", "expires_at": (now + timezone.timedelta(days=7)).isoformat()},
            {"token": "token-2", "expires_at": (now + timezone.timedelta(days=14)).isoformat()},
        ]
        mock_renew.return_value = _mock_response(200, {"tokens": tokens, "detail": "ok"})

        renew_license_token.run()

        state = LicenseState.load()
        self.assertEqual(state.jwt_token, "token-1")
        self.assertEqual(state.pending_tokens, tokens[1:])
