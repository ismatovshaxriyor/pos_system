import logging
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from django.utils import timezone

from licensing import hardware
from licensing.log_handler import DatabaseErrorLogHandler
from licensing.models import ErrorLog, LicenseState
from licensing.tasks import cleanup_error_logs, send_error_logs


def _mock_response(status_code, data=None):
    response = MagicMock()
    response.status_code = status_code
    response.text = ''
    if data is not None:
        response.json.return_value = data
    return response


def _make_record(level=logging.ERROR, msg="xato yuz berdi", exc_info=None):
    return logging.LogRecord(
        name='licensing.tests', level=level, pathname=__file__, lineno=1,
        msg=msg, args=(), exc_info=exc_info,
    )


class DatabaseErrorLogHandlerTests(TestCase):
    def test_error_level_creates_row(self):
        handler = DatabaseErrorLogHandler()
        handler.emit(_make_record(level=logging.ERROR, msg="ERROR sinovi"))

        self.assertEqual(ErrorLog.objects.count(), 1)
        row = ErrorLog.objects.get()
        self.assertEqual(row.level, 'ERROR')
        self.assertEqual(row.message, "ERROR sinovi")

    def test_critical_level_creates_row(self):
        handler = DatabaseErrorLogHandler()
        handler.emit(_make_record(level=logging.CRITICAL, msg="CRITICAL sinovi"))

        row = ErrorLog.objects.get()
        self.assertEqual(row.level, 'CRITICAL')

    def test_warning_not_captured_via_real_logger_dispatch(self):
        # emit() o'zi darajani filtrlamaydi (bu logger.callHandlers()
        # ishi) - shu sabab haqiqiy logger orqali sinaymiz.
        handler = DatabaseErrorLogHandler(level=logging.ERROR)
        logger = logging.getLogger('licensing.tests.level_filter')
        logger.setLevel(logging.DEBUG)
        logger.addHandler(handler)
        logger.propagate = False
        self.addCleanup(logger.removeHandler, handler)

        logger.warning("bu yozilmasligi kerak")
        logger.error("bu yozilishi kerak")

        self.assertEqual(ErrorLog.objects.count(), 1)
        self.assertEqual(ErrorLog.objects.get().message, "bu yozilishi kerak")

    def test_exception_captures_traceback(self):
        handler = DatabaseErrorLogHandler()
        try:
            raise ValueError("sinov istisnosi")
        except ValueError:
            import sys
            handler.emit(_make_record(exc_info=sys.exc_info()))

        row = ErrorLog.objects.get()
        self.assertIn("ValueError", row.traceback)
        self.assertIn("sinov istisnosi", row.traceback)

    def test_handler_swallows_db_write_failure(self):
        handler = DatabaseErrorLogHandler()
        with patch('licensing.models.ErrorLog.objects.create', side_effect=Exception("db down")):
            # Should not raise.
            handler.emit(_make_record())

        self.assertEqual(ErrorLog.objects.count(), 0)

    def test_reentrant_emit_does_not_recurse(self):
        handler = DatabaseErrorLogHandler()
        call_count = {"n": 0}

        def _side_effect(**kwargs):
            call_count["n"] += 1
            # Simulate the DB write itself logging an error, which would
            # otherwise recurse straight back into this same handler.
            handler.emit(_make_record(msg="nested"))
            raise Exception("db down")

        with patch('licensing.models.ErrorLog.objects.create', side_effect=_side_effect):
            handler.emit(_make_record(msg="outer"))

        self.assertEqual(call_count["n"], 1)


@override_settings(HARDWARE_ID_OVERRIDE='dev-macbook')
class SendErrorLogsTaskTests(TestCase):
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

    def _make_error_log(self, **overrides):
        defaults = dict(level='ERROR', message='xato', occurred_at=timezone.now())
        defaults.update(overrides)
        return ErrorLog.objects.create(**defaults)

    def test_no_activation_is_noop(self):
        self._make_error_log()
        send_error_logs.run()  # should not raise, no state to load
        self.assertFalse(ErrorLog.objects.get().is_reported)

    @patch('licensing.tasks.OnaClient.post_error_logs')
    def test_no_unreported_rows_is_noop(self, mock_post):
        self._activated_state()
        send_error_logs.run()
        mock_post.assert_not_called()

    @patch('licensing.tasks.OnaClient.post_error_logs')
    def test_successful_push_marks_rows_reported(self, mock_post):
        self._activated_state()
        self._make_error_log()
        mock_post.return_value = _mock_response(200)

        send_error_logs.run()

        row = ErrorLog.objects.get()
        self.assertTrue(row.is_reported)
        self.assertIsNotNone(row.reported_at)

    @override_settings(ERROR_LOG_BATCH_SIZE=2)
    @patch('licensing.tasks.OnaClient.post_error_logs')
    def test_batch_size_cap_respected(self, mock_post):
        self._activated_state()
        now = timezone.now()
        for i in range(5):
            self._make_error_log(message=f"xato {i}", occurred_at=now + timezone.timedelta(seconds=i))
        mock_post.return_value = _mock_response(200)

        send_error_logs.run()

        sent_events = mock_post.call_args.args[1]
        self.assertEqual(len(sent_events), 2)
        self.assertEqual(sent_events[0]['message'], 'xato 0')
        self.assertEqual(sent_events[1]['message'], 'xato 1')
        self.assertEqual(ErrorLog.objects.filter(is_reported=True).count(), 2)

    @patch('licensing.tasks.OnaClient.post_error_logs')
    def test_rejected_response_leaves_rows_unreported(self, mock_post):
        self._activated_state()
        self._make_error_log()
        mock_post.return_value = _mock_response(400)

        send_error_logs.run()

        self.assertFalse(ErrorLog.objects.get().is_reported)

    @patch('licensing.tasks.OnaClient.post_error_logs')
    def test_network_error_is_swallowed(self, mock_post):
        import requests
        self._activated_state()
        self._make_error_log()
        mock_post.side_effect = requests.ConnectionError("offline")

        send_error_logs.run()  # should not raise

        self.assertFalse(ErrorLog.objects.get().is_reported)


class CleanupErrorLogsTaskTests(TestCase):
    def _make_error_log(self, **overrides):
        defaults = dict(level='ERROR', message='xato', occurred_at=timezone.now())
        defaults.update(overrides)
        return ErrorLog.objects.create(**defaults)

    @override_settings(ERROR_LOG_RETENTION_DAYS=14)
    def test_old_reported_rows_deleted(self):
        old = self._make_error_log(
            is_reported=True, reported_at=timezone.now() - timezone.timedelta(days=20),
        )

        cleanup_error_logs.run()

        self.assertFalse(ErrorLog.objects.filter(id=old.id).exists())

    @override_settings(ERROR_LOG_RETENTION_DAYS=14)
    def test_recent_reported_rows_kept(self):
        recent = self._make_error_log(
            is_reported=True, reported_at=timezone.now() - timezone.timedelta(days=1),
        )

        cleanup_error_logs.run()

        self.assertTrue(ErrorLog.objects.filter(id=recent.id).exists())

    @override_settings(ERROR_LOG_RETENTION_DAYS=14, ERROR_LOG_MAX_UNREPORTED=5000)
    def test_unreported_old_rows_untouched_by_retention_alone(self):
        old_unreported = self._make_error_log(
            is_reported=False, occurred_at=timezone.now() - timezone.timedelta(days=30),
        )

        cleanup_error_logs.run()

        self.assertTrue(ErrorLog.objects.filter(id=old_unreported.id).exists())

    @override_settings(ERROR_LOG_MAX_UNREPORTED=3)
    def test_overflow_cap_deletes_oldest_unreported_when_over_limit(self):
        now = timezone.now()
        rows = [
            self._make_error_log(message=f"xato {i}", occurred_at=now + timezone.timedelta(seconds=i))
            for i in range(5)
        ]

        cleanup_error_logs.run()

        remaining = set(ErrorLog.objects.values_list('message', flat=True))
        self.assertEqual(remaining, {"xato 2", "xato 3", "xato 4"})
