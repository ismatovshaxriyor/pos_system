from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from licensing.models import LicenseState, ScheduledUpdate
from licensing.tasks import execute_remote_command, in_update_window, run_scheduled_update


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


class ScheduledUpdateTests(TestCase):
    """`update_app` "oyna" rejimi: oynada + ochiq buyurtma yo'q bo'lsagina o'rnatiladi; majburiy - darhol."""

    def setUp(self):
        self.state = LicenseState.objects.create(
            license_key='abc123', hardware_hash='hw', restaurant_name='Test', activated_at=timezone.now(),
        )

    def _window_cmd(self, start='02:00', end='05:00'):
        return {"id": "cmd-w", "command_type": "update_app",
                "payload": {"version": "1.2.3", "mode": "window", "window": {"start": start, "end": end}}}

    def _at(self, hour, minute=0):
        from datetime import datetime
        return patch('licensing.tasks.timezone.localtime', return_value=datetime(2026, 11, 20, hour, minute))

    @patch('licensing.tasks._trigger_watchtower_update')
    @patch('licensing.tasks.OnaClient.post_command_result')
    def test_outside_window_is_acknowledged_and_waits(self, mock_post, mock_wt):
        with self._at(14):
            execute_remote_command.run(self._window_cmd())
        mock_wt.assert_not_called()
        self.assertEqual(mock_post.call_args[0][2], 'acknowledged')
        sched = ScheduledUpdate.objects.get(pk=1)
        self.assertEqual((sched.command_id, sched.version, sched.window_start, sched.window_end),
                         ('cmd-w', '1.2.3', '02:00', '05:00'))

    @patch('licensing.tasks._trigger_watchtower_update')
    @patch('licensing.tasks.OnaClient.post_command_result')
    def test_inside_window_with_no_open_orders_runs_immediately(self, mock_post, mock_wt):
        with self._at(3):
            execute_remote_command.run(self._window_cmd())
        mock_wt.assert_called_once()
        statuses = [c[0][2] for c in mock_post.call_args_list]
        self.assertEqual(statuses, ['acknowledged', 'completed'])
        self.assertFalse(ScheduledUpdate.objects.exists())

    @patch('licensing.tasks._active_orders_exist', return_value=True)
    @patch('licensing.tasks._trigger_watchtower_update')
    @patch('licensing.tasks.OnaClient.post_command_result')
    def test_open_orders_block_update_even_inside_window(self, mock_post, mock_wt, _orders):
        with self._at(3):
            execute_remote_command.run(self._window_cmd())
            run_scheduled_update()
        mock_wt.assert_not_called()
        self.assertTrue(ScheduledUpdate.objects.exists())

    @patch('licensing.tasks._active_orders_exist', return_value=False)
    @patch('licensing.tasks._trigger_watchtower_update')
    @patch('licensing.tasks.OnaClient.post_command_result')
    def test_beat_task_runs_once_window_opens(self, mock_post, mock_wt, _orders):
        with self._at(14):
            execute_remote_command.run(self._window_cmd())
            self.assertFalse(run_scheduled_update())
        mock_wt.assert_not_called()
        with self._at(2, 5):
            self.assertTrue(run_scheduled_update())
        mock_wt.assert_called_once()
        self.assertFalse(ScheduledUpdate.objects.exists())
        # Keyingi tekshiruv qayta o'rnatmaydi.
        with self._at(2, 10):
            self.assertFalse(run_scheduled_update())
        mock_wt.assert_called_once()

    @patch('licensing.tasks._trigger_watchtower_update')
    @patch('licensing.tasks.OnaClient.post_command_result')
    def test_force_ignores_window_and_clears_schedule(self, mock_post, mock_wt):
        ScheduledUpdate.objects.create(command_id='old', version='1.0.0')
        with self._at(14):
            execute_remote_command.run(
                {"id": "cmd-f", "command_type": "update_app", "payload": {"version": "1.2.3", "mode": "force"}},
            )
        mock_wt.assert_called_once()
        self.assertEqual(mock_post.call_args[0][2], 'completed')
        self.assertFalse(ScheduledUpdate.objects.exists())

    def test_window_math_wraps_midnight(self):
        from datetime import time
        self.assertTrue(in_update_window(time(23, 30), time(23, 0), time(5, 0)))
        self.assertTrue(in_update_window(time(4, 59), time(23, 0), time(5, 0)))
        self.assertFalse(in_update_window(time(5, 0), time(23, 0), time(5, 0)))
        self.assertFalse(in_update_window(time(12, 0), time(23, 0), time(5, 0)))
        self.assertTrue(in_update_window(time(3, 0), time(2, 0), time(5, 0)))
        self.assertTrue(in_update_window(time(12, 0), time(0, 0), time(0, 0)))  # start == end -> kun bo'yi

    @patch('licensing.tasks.OnaClient.post_command_result')
    def test_bad_window_values_fall_back_to_defaults(self, mock_post):
        from datetime import time
        from licensing.tasks import _parse_hhmm
        self.assertEqual(_parse_hhmm('xato', time(2, 0)), time(2, 0))
        self.assertEqual(_parse_hhmm(None, time(2, 0)), time(2, 0))
        self.assertEqual(_parse_hhmm('23:30', time(2, 0)), time(23, 30))
