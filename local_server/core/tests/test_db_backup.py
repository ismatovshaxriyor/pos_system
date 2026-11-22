"""Baza zaxirasini restoran Telegram botiga yuborish (Rohat, 2026-11-22)."""
from datetime import timedelta
from unittest import mock

import requests
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from core import services, tasks
from core.models import RestaurantConfig, User

TOKEN = '123456:SECRET-test-token'


def _fake_pg_dump(size):
    """`subprocess.run` o'rnini bosadi: `-f` dan keyingi faylga `size` bayt yozadi."""
    def run(cmd, **kwargs):
        with open(cmd[cmd.index('-f') + 1], 'wb') as f:
            f.write(b'x' * size)
        return mock.Mock(returncode=0)
    return run


class SendDbBackupServiceTests(TestCase):
    def setUp(self):
        RestaurantConfig.objects.update_or_create(
            pk=1, defaults={'name': 'Rohat Kafe', 'telegram_bot_token': TOKEN, 'telegram_chat_id': '-100500'},
        )

    def test_not_configured_does_nothing(self):
        RestaurantConfig.objects.filter(pk=1).update(telegram_bot_token='')
        with mock.patch('subprocess.run') as run:
            self.assertEqual(services.send_db_backup_to_telegram(), 'not_configured')
        run.assert_not_called()

    def test_dumps_and_sends_document_then_removes_temp_file(self):
        seen = {}

        def post(url, data=None, files=None, timeout=None):
            name, f, _ = files['document']
            seen.update(url=url, data=data, name=name, path=f.name, body=f.read())
            return mock.Mock(status_code=200, text='{"ok":true}')

        with mock.patch('subprocess.run', side_effect=_fake_pg_dump(1000)) as run, \
                mock.patch('requests.post', side_effect=post):
            self.assertEqual(services.send_db_backup_to_telegram(), 'sent')

        cmd = run.call_args.args[0]
        self.assertEqual(cmd[:2], ['pg_dump', '-Fc'])
        self.assertIn('PGPASSWORD', run.call_args.kwargs['env'])
        self.assertNotIn(run.call_args.kwargs['env']['PGPASSWORD'] or 'x' * 99, ' '.join(cmd))  # parol buyruqda emas
        self.assertTrue(seen['url'].endswith('/sendDocument'))
        self.assertEqual(seen['data']['chat_id'], '-100500')
        self.assertIn('Rohat Kafe', seen['data']['caption'])
        self.assertRegex(seen['name'], r'^rohat-kafe-\d{4}-\d{2}-\d{2}-\d{4}\.dump$')
        self.assertEqual(len(seen['body']), 1000)
        import os
        self.assertFalse(os.path.exists(seen['path']))

    def test_too_large_file_is_not_uploaded_owner_is_told(self):
        with mock.patch('subprocess.run', side_effect=_fake_pg_dump(10)), \
                mock.patch.object(services, 'TELEGRAM_FILE_LIMIT', 5), \
                mock.patch('requests.post') as post, \
                mock.patch.object(services, 'send_telegram_notification') as notify:
            self.assertEqual(services.send_db_backup_to_telegram(), 'too_large')
        post.assert_not_called()
        self.assertIn('50 MB', notify.call_args.args[0])

    def test_network_error_hides_bot_token(self):
        err = requests.ConnectionError(f"Max retries exceeded with url: /bot{TOKEN}/sendDocument")
        with mock.patch('subprocess.run', side_effect=_fake_pg_dump(10)), \
                mock.patch('requests.post', side_effect=err):
            with self.assertRaises(services.BackupNetworkError) as ctx:
                services.send_db_backup_to_telegram()
        self.assertNotIn(TOKEN, str(ctx.exception))

    def test_telegram_rejection_raises(self):
        with mock.patch('subprocess.run', side_effect=_fake_pg_dump(10)), \
                mock.patch('requests.post', return_value=mock.Mock(status_code=403, text='bot was kicked')):
            with self.assertRaises(RuntimeError):
                services.send_db_backup_to_telegram()


class SendDbBackupTaskTests(TestCase):
    def setUp(self):
        cache.delete(services.BACKUP_LAST_KEY)
        cache.delete('db_backup:lock')
        self.addCleanup(cache.delete, services.BACKUP_LAST_KEY)

    def test_success_is_remembered_and_scheduled_run_skips_while_fresh(self):
        with mock.patch.object(services, 'send_db_backup_to_telegram', return_value='sent') as send:
            self.assertEqual(tasks.send_db_backup(), 'sent')
            self.assertEqual(tasks.send_db_backup(), 'fresh')
            self.assertEqual(send.call_count, 1)
            self.assertEqual(tasks.send_db_backup(force=True), 'sent')  # kassa yopilishi har doim yuboradi
            self.assertEqual(send.call_count, 2)

    def test_scheduled_run_sends_when_last_backup_is_old(self):
        cache.set(services.BACKUP_LAST_KEY, timezone.now() - timedelta(hours=21))
        with mock.patch.object(services, 'send_db_backup_to_telegram', return_value='sent') as send:
            self.assertEqual(tasks.send_db_backup(), 'sent')
        send.assert_called_once()

    def test_failures_are_not_remembered_as_success(self):
        with mock.patch.object(services, 'send_db_backup_to_telegram', side_effect=services.BackupNetworkError('x')):
            self.assertEqual(tasks.send_db_backup(), 'network_error')
        with mock.patch.object(services, 'send_db_backup_to_telegram', side_effect=RuntimeError('pg_dump')):
            self.assertEqual(tasks.send_db_backup(), 'error')
        self.assertIsNone(cache.get(services.BACKUP_LAST_KEY))
        self.assertIsNone(cache.get('db_backup:lock'))


class RegisterCloseTriggersBackupTests(TestCase):
    def test_closing_register_queues_forced_backup(self):
        manager = User.objects.create_user(username='+998900000301', role='manager', first_name='M')
        with mock.patch('core.tasks.send_db_backup.delay') as delay, mock.patch('core.realtime.broadcast_event'):
            services.close_register(closed_by=manager)
        delay.assert_called_once_with(force=True)

    def test_broken_queue_does_not_block_register_close(self):
        manager = User.objects.create_user(username='+998900000302', role='manager', first_name='M')
        with mock.patch('core.tasks.send_db_backup.delay', side_effect=OSError('broker down')), \
                mock.patch('core.realtime.broadcast_event'):
            session, _ = services.close_register(closed_by=manager)
        self.assertFalse(session.is_open)
