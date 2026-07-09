from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from licensing.models import LicenseState
from licensing.tasks import execute_remote_command


class ExecuteRemoteCommandTests(TestCase):
    def setUp(self):
        self.state = LicenseState.objects.create(
            license_key='abc123',
            hardware_hash='hw',
            restaurant_name='Test Restoran',
            activated_at=timezone.now(),
        )

    def _command(self, command_type, payload=None):
        return {"id": "cmd-1", "command_type": command_type, "payload": payload or {}}

    @patch('licensing.tasks.OnaClient.post_command_result')
    def test_block_system_sets_state(self, mock_post_result):
        execute_remote_command.run(self._command('block_system'))

        state = LicenseState.load()
        self.assertTrue(state.is_blocked)
        self.assertEqual(state.blocked_reason, 'remote_command')
        mock_post_result.assert_called_once_with('abc123', 'cmd-1', 'completed', {"detail": "Tizim bloklandi."})

    @patch('licensing.tasks.OnaClient.post_command_result')
    def test_unblock_system_clears_state(self, mock_post_result):
        self.state.is_blocked = True
        self.state.blocked_reason = 'remote_command'
        self.state.save()

        execute_remote_command.run(self._command('unblock_system'))

        state = LicenseState.load()
        self.assertFalse(state.is_blocked)
        self.assertEqual(state.blocked_reason, '')
        self.assertEqual(mock_post_result.call_args[0][2], 'completed')

    @patch('licensing.tasks.OnaClient.post_command_result')
    def test_force_sync_reports_completed_stub(self, mock_post_result):
        execute_remote_command.run(self._command('force_sync'))
        self.assertEqual(mock_post_result.call_args[0][2], 'completed')

    @patch('licensing.tasks.OnaClient.post_command_result')
    def test_restart_services_reports_failed(self, mock_post_result):
        execute_remote_command.run(self._command('restart_services'))
        self.assertEqual(mock_post_result.call_args[0][2], 'failed')

    @patch('licensing.tasks.OnaClient.post_command_result')
    def test_unknown_command_type_reports_failed(self, mock_post_result):
        execute_remote_command.run(self._command('does_not_exist'))
        self.assertEqual(mock_post_result.call_args[0][2], 'failed')

    @patch('licensing.tasks.OnaClient.post_command_result')
    @patch('licensing.tasks.renew_license_token.apply')
    def test_force_license_renew_success(self, mock_apply, mock_post_result):
        execute_remote_command.run(self._command('force_license_renew'))
        mock_apply.assert_called_once()
        self.assertEqual(mock_post_result.call_args[0][2], 'completed')

    @patch('licensing.tasks.OnaClient.post_command_result')
    @patch('licensing.tasks.renew_license_token.apply', side_effect=RuntimeError("no network"))
    def test_force_license_renew_failure_reported(self, mock_apply, mock_post_result):
        execute_remote_command.run(self._command('force_license_renew'))
        self.assertEqual(mock_post_result.call_args[0][2], 'failed')

    @patch('licensing.tasks._trigger_watchtower_update')
    @patch('licensing.tasks.OnaClient.post_command_result')
    def test_update_app_reports_completed_before_triggering_watchtower(
        self, mock_post_result, mock_watchtower,
    ):
        # The result must be posted BEFORE Watchtower is called, since
        # Watchtower recreates the very container running this task.
        calls = []
        mock_post_result.side_effect = lambda *a, **k: calls.append('post_result')
        mock_watchtower.side_effect = lambda: calls.append('watchtower')

        execute_remote_command.run(self._command('update_app', {"version": "1.2.3"}))

        self.assertEqual(calls, ['post_result', 'watchtower'])
        self.assertEqual(mock_post_result.call_args[0][2], 'completed')

    @patch('licensing.tasks._trigger_watchtower_update')
    @patch('licensing.tasks.OnaClient.post_command_result')
    def test_update_app_watchtower_failure_does_not_raise(self, mock_post_result, mock_watchtower):
        # A Watchtower call failure shouldn't crash the task - the result
        # was already reported as "started".
        import requests
        mock_watchtower.side_effect = requests.ConnectionError("network down")

        execute_remote_command.run(self._command('update_app'))
        mock_post_result.assert_called_once()
