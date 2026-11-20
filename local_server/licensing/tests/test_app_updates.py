import hashlib
import shutil
import tempfile
from unittest.mock import MagicMock, patch

import requests
from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.urls import reverse

from licensing import appupdates
from licensing.models import AppRelease

PAYLOAD = b'installer-bytes' * 1000
SHA = hashlib.sha256(PAYLOAD).hexdigest()


def _item(**over):
    base = {
        'id': 1, 'slug': 'kassir', 'platform': 'windows', 'version': '1.2.0', 'is_required': False,
        'size_mb': '0.1', 'sha256': SHA, 'notes': ['yangi'], 'download_url': 'https://ona.example/media/k.exe',
    }
    base.update(over)
    return base


def _fake_get(data=PAYLOAD, fail=False):
    resp = MagicMock()
    resp.raise_for_status.side_effect = requests.HTTPError('500') if fail else None
    resp.iter_content.return_value = [data[i:i + 4096] for i in range(0, len(data), 4096)]
    resp.__enter__ = lambda s: s
    resp.__exit__ = lambda *a: False
    return resp


class VersionCompareTests(TestCase):
    def test_numeric_not_lexical(self):
        self.assertTrue(appupdates.is_newer('1.10.0', '1.9.9'))
        self.assertFalse(appupdates.is_newer('1.2.0', '1.2'))
        self.assertTrue(appupdates.is_newer('1.2.1', '1.2'))
        self.assertTrue(appupdates.is_newer('0.1.0', ''))  # versiyasi noma'lum ilova yangilanadi


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix='bola-test-media-'))
class AppReleaseSyncTests(TestCase):
    def tearDown(self):
        from django.conf import settings
        shutil.rmtree(settings.MEDIA_ROOT, ignore_errors=True)

    def test_new_release_is_queued_and_downloaded_with_sha_check(self):
        pks = appupdates.sync_releases([_item()])
        self.assertEqual(len(pks), 1)
        with patch('licensing.appupdates.requests.get', return_value=_fake_get()):
            self.assertTrue(appupdates.download_release(pks[0]))
        r = AppRelease.objects.get(pk=pks[0])
        self.assertEqual(r.status, 'ready')
        self.assertEqual(r.file.read(), PAYLOAD)
        # Qayta sinxronlash (o'zgarishsiz): qayta yuklanmaydi.
        self.assertEqual(appupdates.sync_releases([_item()]), [])

    def test_sha_mismatch_is_rejected_and_file_not_kept(self):
        pks = appupdates.sync_releases([_item(sha256='0' * 64)])
        with patch('licensing.appupdates.requests.get', return_value=_fake_get()):
            self.assertFalse(appupdates.download_release(pks[0]))
        r = AppRelease.objects.get(pk=pks[0])
        self.assertEqual(r.status, 'failed')
        self.assertIn('sha256', r.error)
        self.assertFalse(r.file)

    def test_network_error_marks_failed_and_retries_only_after_cooldown(self):
        pks = appupdates.sync_releases([_item()])
        with patch('licensing.appupdates.requests.get', side_effect=requests.ConnectionError('down')):
            with self.assertRaises(requests.ConnectionError):
                appupdates.download_release(pks[0])
        self.assertEqual(AppRelease.objects.get(pk=pks[0]).status, 'failed')
        self.assertEqual(appupdates.sync_releases([_item()]), [])  # darhol qayta urinilmaydi
        from datetime import timedelta
        from django.utils import timezone
        AppRelease.objects.filter(pk=pks[0]).update(updated_at=timezone.now() - timedelta(minutes=20))
        self.assertEqual(appupdates.sync_releases([_item()]), pks)

    def test_new_version_replaces_old_file(self):
        pks = appupdates.sync_releases([_item()])
        with patch('licensing.appupdates.requests.get', return_value=_fake_get()):
            appupdates.download_release(pks[0])
        old = AppRelease.objects.get(pk=pks[0]).file.name
        new_bytes = b'v2' * 5000
        new = _item(version='1.3.0', sha256=hashlib.sha256(new_bytes).hexdigest())
        self.assertEqual(appupdates.sync_releases([new]), pks)
        with patch('licensing.appupdates.requests.get', return_value=_fake_get(new_bytes)):
            self.assertTrue(appupdates.download_release(pks[0]))
        r = AppRelease.objects.get(pk=pks[0])
        self.assertEqual((r.version, r.file.read()), ('1.3.0', new_bytes))
        self.assertNotEqual(r.file.name, old)
        from django.core.files.storage import default_storage
        self.assertFalse(default_storage.exists(old))

    def test_release_removed_on_ona_is_deleted_locally(self):
        appupdates.sync_releases([_item()])
        appupdates.sync_releases([])
        self.assertEqual(AppRelease.objects.count(), 0)

    def test_non_http_download_url_is_ignored(self):
        self.assertEqual(appupdates.sync_releases([_item(download_url='file:///etc/passwd')]), [])
        self.assertEqual(AppRelease.objects.count(), 0)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix='bola-test-media-'))
class AppUpdateEndpointTests(TestCase):
    def tearDown(self):
        from django.conf import settings
        shutil.rmtree(settings.MEDIA_ROOT, ignore_errors=True)

    def _ready(self, slug='kassir', platform='windows', version='1.2.0', required=False):
        r = AppRelease(slug=slug, platform=platform, version=version, is_required=required,
                       sha256=SHA, status='ready', notes=['n'])
        r.file.save(f'{slug}.exe', ContentFile(PAYLOAD), save=False)
        r.save()
        return r

    def _check(self, **q):
        return self.client.get(reverse('app-update-check'), q).json()

    def test_newer_version_is_announced(self):
        r = self._ready()
        data = self._check(slugs='kassir', platform='windows', current='1.0.0')
        self.assertTrue(data['available'])
        self.assertFalse(data['required'])
        self.assertEqual(data['latest']['version'], '1.2.0')
        self.assertEqual(data['latest']['download_url'], f'/api/license/app-updates/{r.pk}/download/')

    def test_required_flag_only_when_behind(self):
        self._ready(required=True)
        self.assertTrue(self._check(slugs='kassir', platform='windows', current='1.1.9')['required'])
        up_to_date = self._check(slugs='kassir', platform='windows', current='1.2.0')
        self.assertEqual((up_to_date['available'], up_to_date['required']), (False, False))

    def test_platform_and_slug_filter(self):
        self._ready()
        self.assertFalse(self._check(slugs='kassir', platform='android', current='0')['available'])
        self.assertFalse(self._check(slugs='ofitsiant', platform='windows', current='0')['available'])

    def test_multiple_slugs_pick_highest(self):
        self._ready(slug='ofitsiant', platform='android', version='2.0.0')
        self._ready(slug='manager', platform='android', version='2.1.0')
        data = self._check(slugs='ofitsiant,manager', platform='android', current='1.0.0')
        self.assertEqual(data['latest']['version'], '2.1.0')

    def test_not_ready_release_is_not_announced(self):
        r = self._ready()
        AppRelease.objects.filter(pk=r.pk).update(status='downloading')
        self.assertFalse(self._check(slugs='kassir', platform='windows', current='0')['available'])

    def test_download_streams_file_and_404s_when_not_ready(self):
        r = self._ready()
        resp = self.client.get(reverse('app-update-download', args=[r.pk]))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(b''.join(resp.streaming_content), PAYLOAD)
        self.assertIn('attachment', resp['Content-Disposition'])
        AppRelease.objects.filter(pk=r.pk).update(status='failed')
        self.assertEqual(self.client.get(reverse('app-update-download', args=[r.pk])).status_code, 404)

    @override_settings(LICENSE_ENFORCEMENT=True)
    def test_reachable_when_system_is_blocked(self):
        from licensing.models import LicenseState
        from django.utils import timezone
        LicenseState.objects.create(
            license_key='k', hardware_hash='h', activated_at=timezone.now(), is_blocked=True, blocked_reason='remote_command',
        )
        resp = self.client.get(reverse('app-update-check'), {'platform': 'windows', 'current': '0'})
        self.assertEqual(resp.status_code, 200)
