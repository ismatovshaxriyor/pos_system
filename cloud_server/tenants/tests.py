from datetime import timedelta

import uuid as uuid_module

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.contrib.auth import get_user_model
from django.contrib import messages as django_messages
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .models import Restaurant, RestaurantAdminAccount, License, ErrorLog, RemoteCommand

User = get_user_model()


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


class RestaurantAdminMandatoryAccountTests(TestCase):
    """
    Ona admin panelida restoran yaratishda bosh menejer hisobini kiritish
    majburiy bo'lishi kerak (RestaurantAdminAccountInline min_num=1).
    """

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='ona_admin', email='ona@example.com', password='pass12345',
        )
        self.client.force_login(self.superuser)
        self.add_url = reverse('admin:tenants_restaurant_add')

    def _inline_management_data(self, total_forms=1, initial_forms=0):
        return {
            'admin_account-TOTAL_FORMS': str(total_forms),
            'admin_account-INITIAL_FORMS': str(initial_forms),
            'admin_account-MIN_NUM_FORMS': '1',
            'admin_account-MAX_NUM_FORMS': '1',
            'status-TOTAL_FORMS': '0',
            'status-INITIAL_FORMS': '0',
            'status-MIN_NUM_FORMS': '0',
            'status-MAX_NUM_FORMS': '1',
        }

    def test_creating_restaurant_without_admin_inline_is_rejected(self):
        data = {
            'name': "Yangi Restoran",
            'address': '', 'contact_info': '', 'is_active': 'on',
            'desired_version': '',
            'update_window_start': '02:00', 'update_window_end': '05:00',
            'admin_account-0-phone': '', 'admin_account-0-full_name': '',
            'admin_account-0-password': '', 'admin_account-0-id': '',
            **self._inline_management_data(),
        }
        response = self.client.post(self.add_url, data)

        self.assertEqual(response.status_code, 200)  # re-renders form with errors, no redirect
        self.assertFalse(Restaurant.objects.filter(name="Yangi Restoran").exists())

    def test_creating_restaurant_with_admin_inline_succeeds(self):
        data = {
            'name': "Yangi Restoran",
            'address': '', 'contact_info': '', 'is_active': 'on',
            'desired_version': '',
            'update_window_start': '02:00', 'update_window_end': '05:00',
            'admin_account-0-phone': '+998911112233',
            'admin_account-0-full_name': 'Aziz Aliyev',
            'admin_account-0-password': 'Kuchli-Parol-1',
            'admin_account-0-id': '',
            **self._inline_management_data(),
        }
        response = self.client.post(self.add_url, data)

        self.assertEqual(response.status_code, 302)  # redirect on success
        restaurant = Restaurant.objects.get(name="Yangi Restoran")
        account = RestaurantAdminAccount.objects.get(restaurant=restaurant)
        self.assertEqual(account.phone, '+998911112233')
        self.assertTrue(account.password_hash)


@override_settings(LICENSE_PRIVATE_KEY=PRIVATE_PEM, LICENSE_TOKEN_TTL_DAYS=7)
class GenerateOfflineTokenActionTests(TestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='ona_admin2', email='ona2@example.com', password='pass12345',
        )
        self.client.force_login(self.superuser)
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.license = self.restaurant.license  # auto-created by post_save signal
        self.license.hardware_hash = "a" * 64
        self.license.expires_at = timezone.now() + timedelta(days=30)
        self.license.save()
        self.changelist_url = reverse('admin:tenants_license_changelist')

    def _run_action(self):
        return self.client.post(self.changelist_url, {
            'action': 'generate_offline_token',
            '_selected_action': [str(self.license.pk)],
        }, follow=True)

    def test_generates_verifiable_token_for_bound_license(self):
        response = self._run_action()

        messages = list(response.context['messages'])
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0].level, django_messages.SUCCESS)

        # Extract the token (last line of the message) and verify it's a
        # real, correctly-signed token for this license's hardware.
        token = messages[0].message.strip().splitlines()[-1]
        payload = jwt.decode(token, PUBLIC_PEM, algorithms=["RS256"], issuer="pos-ona")
        self.assertEqual(payload['hw'], "a" * 64)
        self.assertEqual(payload['license_id'], str(self.license.id))

    def test_refuses_when_hardware_not_bound(self):
        self.license.hardware_hash = ''
        self.license.save()

        response = self._run_action()

        messages = list(response.context['messages'])
        self.assertEqual(messages[0].level, django_messages.WARNING)

    def test_refuses_when_license_expired(self):
        self.license.expires_at = timezone.now() - timedelta(days=1)
        self.license.save()

        response = self._run_action()

        messages = list(response.context['messages'])
        self.assertEqual(messages[0].level, django_messages.ERROR)


class ErrorLogAdminActionTests(TestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='ona_admin3', email='ona3@example.com', password='pass12345',
        )
        self.client.force_login(self.superuser)
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.error_log = ErrorLog.objects.create(
            id='11111111-1111-1111-1111-111111111111',
            restaurant=self.restaurant, level='ERROR', message="xato",
            occurred_at=timezone.now(), received_at=timezone.now(),
        )
        self.changelist_url = reverse('admin:tenants_errorlog_changelist')

    def _run_action(self, action):
        return self.client.post(self.changelist_url, {
            'action': action,
            '_selected_action': [str(self.error_log.pk)],
        }, follow=True)

    def test_mark_resolved_action_sets_fields_and_user(self):
        self._run_action('mark_resolved')

        self.error_log.refresh_from_db()
        self.assertTrue(self.error_log.is_resolved)
        self.assertIsNotNone(self.error_log.resolved_at)
        self.assertEqual(self.error_log.resolved_by, self.superuser)

    def test_mark_unresolved_action_clears_fields(self):
        self.error_log.is_resolved = True
        self.error_log.resolved_at = timezone.now()
        self.error_log.resolved_by = self.superuser
        self.error_log.save()

        self._run_action('mark_unresolved')

        self.error_log.refresh_from_db()
        self.assertFalse(self.error_log.is_resolved)
        self.assertIsNone(self.error_log.resolved_at)
        self.assertIsNone(self.error_log.resolved_by)

    def test_has_add_permission_is_false(self):
        response = self.client.get(reverse('admin:tenants_errorlog_add'))
        self.assertEqual(response.status_code, 403)


class ReleaseVersionActionTests(TestCase):
    """
    'Tanlangan Bolalarga YANGI VERSIYA yuborish' amali: bir marta versiya
    kiritiladi -> tanlangan barcha FAOL restoranlarga desired_version
    o'rnatiladi VA update_app buyrug'i navbatga qo'yiladi. Faol emaslar
    o'tkazib yuboriladi.
    """
    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='ona_release', email='rel@example.com', password='pass12345',
        )
        self.client.force_login(self.superuser)
        self.r1 = Restaurant.objects.create(name="Restoran A")
        self.r2 = Restaurant.objects.create(name="Restoran B")
        self.inactive = Restaurant.objects.create(name="Bloklangan", is_active=False)
        self.changelist_url = reverse('admin:tenants_restaurant_changelist')

    def _post(self, pks, extra=None):
        data = {'action': 'action_release_version', '_selected_action': [str(p) for p in pks]}
        data.update(extra or {})
        return self.client.post(self.changelist_url, data, follow=True)

    def test_intermediate_page_asks_for_version_and_sends_nothing(self):
        # 'apply' yo'q -> oraliq sahifa qaytadi, hali hech qanday buyruq yo'q.
        response = self._post([self.r1.pk, self.r2.pk])
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'name="version"')
        self.assertEqual(RemoteCommand.objects.count(), 0)

    def test_apply_sets_desired_version_and_enqueues_update_for_active(self):
        response = self._post(
            [self.r1.pk, self.r2.pk, self.inactive.pk],
            {'apply': '1', 'version': '0.1.2'},
        )
        self.assertEqual(response.status_code, 200)

        for r in (self.r1, self.r2):
            r.refresh_from_db()
            self.assertEqual(r.desired_version, '0.1.2')
            cmd = RemoteCommand.objects.get(restaurant=r, command_type='update_app')
            self.assertEqual(cmd.payload, {
                'version': '0.1.2', 'mode': 'window', 'window': {'start': '02:00', 'end': '05:00'},
            })

        # Faol emas restoranга tegilmaydi.
        self.inactive.refresh_from_db()
        self.assertEqual(self.inactive.desired_version, '')
        self.assertFalse(RemoteCommand.objects.filter(restaurant=self.inactive).exists())

    def test_force_mode_has_no_window(self):
        self._post([self.r1.pk], {'apply': '1', 'version': '0.1.2', 'mode': 'force'})
        cmd = RemoteCommand.objects.get(restaurant=self.r1, command_type='update_app')
        self.assertEqual(cmd.payload, {'version': '0.1.2', 'mode': 'force'})

    def test_window_uses_each_restaurants_own_window(self):
        import datetime
        self.r1.update_window_start = datetime.time(23, 30)
        self.r1.update_window_end = datetime.time(4, 0)
        self.r1.save()
        self._post([self.r1.pk], {'apply': '1', 'version': '0.1.2', 'mode': 'window'})
        cmd = RemoteCommand.objects.get(restaurant=self.r1, command_type='update_app')
        self.assertEqual(cmd.payload['window'], {'start': '23:30', 'end': '04:00'})

    def test_unknown_mode_falls_back_to_window(self):
        self._post([self.r1.pk], {'apply': '1', 'version': '0.1.2', 'mode': 'whenever'})
        cmd = RemoteCommand.objects.get(restaurant=self.r1, command_type='update_app')
        self.assertEqual(cmd.payload['mode'], 'window')

    def test_intermediate_page_offers_mode_choice(self):
        response = self._post([self.r1.pk])
        self.assertContains(response, 'name="mode"')

    def test_apply_without_version_sends_nothing(self):
        response = self._post([self.r1.pk], {'apply': '1', 'version': '   '})
        messages = list(response.context['messages'])
        self.assertEqual(messages[0].level, django_messages.ERROR)
        self.assertEqual(RemoteCommand.objects.count(), 0)


class OpsDashboardTests(TestCase):
    """Jonli monitor (/admin/ops/): kirish huquqi, ma'lumot shakli va amallar."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.superuser = User.objects.create_superuser('boss', password='pass-12345')
        self.staff = User.objects.create_user('staffer', password='pass-12345', is_staff=True)
        self.restaurant = Restaurant.objects.create(name='Anhor', subdomain='anhor')

    def test_anonymous_is_redirected_to_login(self):
        res = self.client.get('/admin/ops/')
        self.assertEqual(res.status_code, 302)
        self.assertIn('/admin/login/', res['Location'])

    def test_anonymous_api_gets_401_json(self):
        res = self.client.get('/admin/ops/api/snapshot/')
        self.assertEqual(res.status_code, 401)

    def test_staff_without_superuser_gets_404(self):
        self.client.force_login(self.staff)
        for url in ('/admin/ops/', '/admin/ops/api/snapshot/', '/admin/ops/api/history/'):
            self.assertEqual(self.client.get(url).status_code, 404, url)
        res = self.client.post('/admin/ops/api/action/', data='{}', content_type='application/json')
        self.assertEqual(res.status_code, 404)

    def test_superuser_sees_page_without_cache(self):
        self.client.force_login(self.superuser)
        res = self.client.get('/admin/ops/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('no-store', res['Cache-Control'])
        self.assertContains(res, 'Jonli monitor')

    def test_snapshot_shape(self):
        self.client.force_login(self.superuser)
        data = self.client.get('/admin/ops/api/snapshot/').json()
        self.assertEqual(set(data), {'server', 'fleet', 'events'})
        self.assertIn('percent', data['server']['cpu'])
        self.assertIn('db', data['server']['services'])
        self.assertTrue(data['server']['services']['db']['ok'])
        self.assertEqual(data['fleet']['summary']['total'], 1)
        row = data['fleet']['restaurants'][0]
        self.assertEqual(row['name'], 'Anhor')
        # Hali faollashtirilmagan: onlayn emas, "pending"
        self.assertEqual(row['state'], 'pending')

    def test_heartbeat_makes_restaurant_online_and_records_history(self):
        from . import ops
        ops.record_heartbeat(self.restaurant.id, {'cpu_percent': 12.0, 'ram_percent': 40.0, 'disk_percent': 95.0, 'app_version': '0.3.27'})
        from django.core.cache import cache
        cache.set(f'restaurant_metrics_{self.restaurant.id}', {'cpu_percent': 12.0, 'ram_percent': 40.0, 'disk_percent': 95.0, 'app_version': '0.3.27', 'unsynced_count': 3}, 180)
        row = ops.fleet_snapshot()['restaurants'][0]
        self.assertEqual(row['state'], 'online')
        self.assertEqual(row['version'], '0.3.27')
        self.assertTrue(any(a['code'] == 'disk' and a['level'] == 'critical' for a in row['alerts']))
        self.assertEqual(len(ops.restaurant_detail(self.restaurant.id)['history']), 1)

    def test_offline_and_license_alerts(self):
        from . import ops
        lic = self.restaurant.license
        lic.expires_at = timezone.now() - timedelta(days=2)
        lic.save()
        self.restaurant.last_seen = timezone.now() - timedelta(minutes=30)
        self.restaurant.save(update_fields=['last_seen'])
        row = ops.fleet_snapshot()['restaurants'][0]
        codes = {a['code'] for a in row['alerts']}
        self.assertIn('license_expired', codes)
        self.assertEqual(row['state'], 'expired')

    def test_outdated_version_is_flagged(self):
        from django.core.cache import cache
        from . import ops
        other = Restaurant.objects.create(name='Yangi', subdomain='yangi')
        cache.set(f'restaurant_metrics_{self.restaurant.id}', {'app_version': '0.3.20'}, 180)
        cache.set(f'restaurant_metrics_{other.id}', {'app_version': '0.3.27'}, 180)
        fleet = ops.fleet_snapshot()
        self.assertEqual(fleet['summary']['target_version'], '0.3.27')
        old = next(r for r in fleet['restaurants'] if r['name'] == 'Anhor')
        self.assertTrue(any(a['code'] == 'outdated' for a in old['alerts']))

    def test_action_block_enqueues_command_and_audits(self):
        from django.contrib.admin.models import LogEntry
        self.client.force_login(self.superuser)
        res = self.client.post(
            '/admin/ops/api/action/',
            data={'action': 'block', 'restaurant_ids': [str(self.restaurant.id)]}, content_type='application/json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(RemoteCommand.objects.filter(restaurant=self.restaurant, command_type='block_system', status='pending').exists())
        self.assertTrue(LogEntry.objects.filter(user=self.superuser, change_message__contains='Jonli monitor').exists())

    def test_action_update_sets_desired_version_and_payload(self):
        self.client.force_login(self.superuser)
        res = self.client.post(
            '/admin/ops/api/action/',
            data={'action': 'update', 'restaurant_ids': [str(self.restaurant.id)], 'params': {'version': '0.3.27', 'mode': 'force'}},
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.desired_version, '0.3.27')
        cmd = RemoteCommand.objects.get(restaurant=self.restaurant, command_type='update_app')
        self.assertEqual(cmd.payload['mode'], 'force')

    def test_action_update_requires_version(self):
        self.client.force_login(self.superuser)
        res = self.client.post(
            '/admin/ops/api/action/',
            data={'action': 'update', 'restaurant_ids': [str(self.restaurant.id)], 'params': {}}, content_type='application/json',
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(RemoteCommand.objects.exists())

    def test_unknown_action_and_bad_input_rejected(self):
        self.client.force_login(self.superuser)
        post = lambda body: self.client.post('/admin/ops/api/action/', data=body, content_type='application/json')
        self.assertEqual(post({'action': 'rm_rf', 'restaurant_ids': [str(self.restaurant.id)]}).status_code, 400)
        self.assertEqual(post({'action': 'block', 'restaurant_ids': 'x'}).status_code, 400)
        self.assertEqual(post({'action': 'block', 'restaurant_ids': ['not-a-uuid']}).status_code, 400)
        self.assertEqual(self.client.post('/admin/ops/api/action/', data='{bad', content_type='application/json').status_code, 400)

    def test_action_requires_post_and_csrf_is_enforced(self):
        from django.test import Client
        self.client.force_login(self.superuser)
        self.assertEqual(self.client.get('/admin/ops/api/action/').status_code, 405)
        strict = Client(enforce_csrf_checks=True)
        strict.force_login(self.superuser)
        res = strict.post('/admin/ops/api/action/', data={'action': 'block', 'restaurant_ids': [str(self.restaurant.id)]}, content_type='application/json')
        self.assertEqual(res.status_code, 403)
        self.assertFalse(RemoteCommand.objects.exists())

    def test_resolve_errors_and_mark_paid(self):
        from . import ops
        ErrorLog.objects.create(
            id=uuid_module.uuid4(), restaurant=self.restaurant, level='ERROR', message='boom',
            occurred_at=timezone.now(), received_at=timezone.now(),
        )
        res = ops.perform_action(self.superuser, 'resolve_errors', [self.restaurant.id])
        self.assertTrue(res['ok'])
        self.assertFalse(ErrorLog.objects.filter(is_resolved=False).exists())
        lic = self.restaurant.license
        lic.is_active = False
        lic.expires_at = timezone.now() - timedelta(days=1)
        lic.save()
        ops.perform_action(self.superuser, 'mark_paid', [self.restaurant.id])
        lic.refresh_from_db()
        self.assertGreater(lic.expires_at, timezone.now())
        self.assertFalse(lic.is_active)  # to'lov bloklashni yechmaydi (admin _mark_paid bilan bir xil)

    def test_offline_token_requires_bound_hardware(self):
        from . import ops
        res = ops.perform_action(self.superuser, 'offline_token', [self.restaurant.id])
        self.assertFalse(res['ok'])

    def test_detail_masks_license_key(self):
        from . import ops
        d = ops.restaurant_detail(self.restaurant.id)
        self.assertNotIn(self.restaurant.license.key, str(d))
        self.assertTrue(d['license']['key_masked'].endswith(self.restaurant.license.key[-4:]))

    def test_untrusted_error_text_is_returned_raw_but_json_escaped(self):
        """Bola xabari xom qaytadi (frontend textContent bilan chiqaradi) - JSON'da ekranlanadi."""
        from . import ops
        evil = '<img src=x onerror=alert(1)>'
        ErrorLog.objects.create(
            id=uuid_module.uuid4(), restaurant=self.restaurant, level='ERROR', message=evil,
            occurred_at=timezone.now(), received_at=timezone.now(),
        )
        self.client.force_login(self.superuser)
        res = self.client.get('/admin/ops/api/snapshot/')
        self.assertEqual(res['Content-Type'], 'application/json')
        self.assertEqual(res.json()['events']['errors'][0]['message'], evil)
        self.assertNotIn('innerHTML', open('tenants/templates/ops/dashboard.html').read().replace('innerHTML ishlatilmaydi', ''))

    def test_record_server_sample_caps_history(self):
        from . import ops
        for _ in range(3):
            ops.record_server_sample()
        self.assertEqual(len(ops.server_history()), 3)
        self.assertIn('cpu', ops.server_history()[-1])


class AdminPhoneNormalizationTests(TestCase):
    """Ona'da telefon qanday kiritilsa ham Bola username'i ilova yuboradigan +998XXXXXXXXX bo'lishi kerak."""

    def test_normalize_variants(self):
        from .models import normalize_phone
        for raw in ('901234567', '998901234567', '+998901234567', '+998 90 123 45 67', '90-123-45-67'):
            self.assertEqual(normalize_phone(raw), '+998901234567', raw)
        self.assertEqual(normalize_phone('admin'), 'admin')
        self.assertEqual(normalize_phone('12345'), '12345')

    def test_account_saved_in_canonical_form(self):
        from .models import RestaurantAdminAccount
        r = Restaurant.objects.create(name='Rohat', subdomain='rohat')
        acc = RestaurantAdminAccount.objects.create(restaurant=r, phone='901234567')
        acc.refresh_from_db()
        self.assertEqual(acc.phone, '+998901234567')


class PublishMobileAppCommandTests(TestCase):
    """`publish_mobile_app`: CI yig'gan ilovani SSH/stdin orqali e'lon qilish (release-staff-apps.yml)."""

    def setUp(self):
        import hashlib
        import shutil
        import tempfile
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)
        self.hashlib = hashlib

    def _file(self, content):
        import tempfile
        f = tempfile.NamedTemporaryFile(delete=False, dir=self.media, suffix='.bin')
        f.write(content)
        f.close()
        return f.name, self.hashlib.sha256(content).hexdigest()

    def _publish(self, content, version, slugs=('ofitsiant', 'manager'), platform='android', ext='apk', **extra):
        from io import StringIO
        from django.core.management import call_command
        path, sha = self._file(content)
        args = []
        for s in slugs:
            args += ['--slug', s]
        args += ['--platform', platform, '--app-version', version, '--filename', f'App-{version}.{ext}',
                 '--sha256', extra.pop('sha256', sha), '--file', path]
        for flag, value in extra.items():
            args += [f'--{flag}'] if value is True else [f'--{flag}', value]
        out = StringIO()
        call_command('publish_mobile_app', *args, stdout=out)
        return out.getvalue()

    def _apps(self):
        from .models import MobileApp
        return {a.slug: a for a in MobileApp.objects.filter(platform='android')}

    def _media_files(self):
        import os
        d = os.path.join(self.media, 'mobile_apps')
        return sorted(n for n in os.listdir(d) if not n.startswith('.')) if os.path.isdir(d) else []

    def test_creates_rows_for_every_slug_with_one_shared_file(self):
        self._publish(b'apk-1', '1.2.4', note='Yangi hisobot', required=True)
        apps = self._apps()
        self.assertEqual(set(apps), {'ofitsiant', 'manager'})
        for a in apps.values():
            self.assertEqual(a.version, '1.2.4')
            self.assertEqual(a.sha256, self.hashlib.sha256(b'apk-1').hexdigest())
            self.assertEqual(a.apk_file.name, 'mobile_apps/App-1.2.4.apk')
            self.assertTrue(a.is_required)
            self.assertEqual(a.notes, ['Yangi hisobot'])
        self.assertEqual(self._media_files(), ['App-1.2.4.apk'])

    def test_new_version_replaces_and_deletes_old_file(self):
        self._publish(b'apk-1', '1.2.4')
        self._publish(b'apk-2', '1.2.5')
        apps = self._apps()
        self.assertEqual({a.version for a in apps.values()}, {'1.2.5'})
        self.assertFalse(any(a.is_required for a in apps.values()))
        self.assertEqual(self._media_files(), ['App-1.2.5.apk'])

    def test_old_file_kept_while_another_row_still_uses_it(self):
        self._publish(b'apk-1', '1.2.4')
        self._publish(b'apk-2', '1.2.5', slugs=('manager',))
        self.assertEqual(self._apps()['ofitsiant'].version, '1.2.4')
        self.assertEqual(self._media_files(), ['App-1.2.4.apk', 'App-1.2.5.apk'])

    def test_sha256_mismatch_rejected_and_nothing_left_behind(self):
        from django.core.management.base import CommandError
        with self.assertRaisesMessage(CommandError, 'sha256'):
            self._publish(b'truncated', '1.2.4', sha256='0' * 64)
        self.assertEqual(self._apps(), {})
        self.assertEqual(self._media_files(), [])

    def test_same_version_same_file_is_a_noop(self):
        self._publish(b'apk-1', '1.2.4')
        out = self._publish(b'apk-1', '1.2.4')
        self.assertIn('allaqachon', out)
        self.assertEqual(self._media_files(), ['App-1.2.4.apk'])

    def test_same_version_different_file_needs_force(self):
        from django.core.management.base import CommandError
        self._publish(b'apk-1', '1.2.4')
        with self.assertRaisesMessage(CommandError, 'Versiyani oshiring'):
            self._publish(b'apk-other', '1.2.4')
        self._publish(b'apk-other', '1.2.4', force=True)
        self.assertEqual(self._apps()['manager'].sha256, self.hashlib.sha256(b'apk-other').hexdigest())

    def test_downgrade_needs_force(self):
        from django.core.management.base import CommandError
        self._publish(b'apk-2', '1.10.0')
        with self.assertRaisesMessage(CommandError, 'yangiroq versiya'):
            self._publish(b'apk-1', '1.9.9')
        self.assertEqual(self._apps()['manager'].version, '1.10.0')

    def test_wrong_extension_rejected(self):
        from django.core.management.base import CommandError
        with self.assertRaisesMessage(CommandError, 'kengaytmasi'):
            self._publish(b'x', '0.2.7', slugs=('kassir',), platform='windows', ext='apk')

    def test_published_release_reaches_heartbeat_payload(self):
        from django.test import RequestFactory
        from sync.views import _app_releases
        self._publish(b'exe-1', '0.2.7', slugs=('kassir',), platform='windows', ext='exe')
        items = _app_releases(RequestFactory().get('/'))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['slug'], 'kassir')
        self.assertEqual(items[0]['sha256'], self.hashlib.sha256(b'exe-1').hexdigest())
        self.assertTrue(items[0]['download_url'].endswith('/media/mobile_apps/App-0.2.7.exe'))


class ExtendLicenseExpiryTests(TestCase):
    """"To'lov qilindi": amaldagi muddatga +1 oy (signals.extend_license_expiry)."""

    def _dt(self, *args):
        import datetime
        return datetime.datetime(*args, tzinfo=datetime.timezone.utc)

    def test_active_license_gets_one_month(self):
        from .signals import extend_license_expiry
        now = self._dt(2026, 12, 1, 12)
        self.assertEqual(extend_license_expiry(self._dt(2026, 12, 2, 23, 59, 59), now), self._dt(2027, 1, 2, 23, 59, 59))

    def test_prepayment_is_not_lost(self):
        """Noyabrda oldindan to'lov: 2-dekabr -> 2-yanvar (avval 2-dekabrda qolib ketar edi)."""
        from .signals import extend_license_expiry
        now = self._dt(2026, 11, 23, 9)
        once = extend_license_expiry(self._dt(2026, 12, 2, 23, 59, 59), now)
        self.assertEqual(once, self._dt(2027, 1, 2, 23, 59, 59))
        self.assertEqual(extend_license_expiry(once, now), self._dt(2027, 2, 2, 23, 59, 59))

    def test_month_end_clamped(self):
        from .signals import add_one_month
        self.assertEqual(add_one_month(self._dt(2027, 1, 31, 23, 59, 59)), self._dt(2027, 2, 28, 23, 59, 59))
        self.assertEqual(add_one_month(self._dt(2026, 12, 15)), self._dt(2027, 1, 15))

    def test_expired_license_gets_at_least_current_month(self):
        from .signals import extend_license_expiry
        old = self._dt(2026, 12, 2, 23, 59, 59)
        # Muddat o'tgan kunning ertasiga to'landi - dekabr uchun: 2-yanvar.
        self.assertEqual(extend_license_expiry(old, self._dt(2026, 12, 3, 8)), self._dt(2027, 1, 2, 23, 59, 59))
        # 1-yanvarda to'landi: eski sana +1 oy (2-yanvar) ertasiga yana bloklaydi - joriy oy oxiri + 2 kun.
        self.assertEqual(extend_license_expiry(old, self._dt(2027, 1, 1, 8)), self._dt(2027, 2, 2, 23, 59, 59))


class MarkPaidAdminActionTests(TestCase):
    def setUp(self):
        self.superuser = get_user_model().objects.create_superuser(
            username='paid_admin', email='paid@example.com', password='pw-12345',
        )
        self.client.force_login(self.superuser)

    def test_admin_action_adds_one_month_per_license(self):
        from .signals import add_one_month
        r1 = Restaurant.objects.create(name='Birinchi', subdomain='birinchi')
        r2 = Restaurant.objects.create(name='Ikkinchi', subdomain='ikkinchi')
        far = timezone.now() + timedelta(days=40)
        License.objects.filter(restaurant=r2).update(expires_at=far)
        before1 = License.objects.get(restaurant=r1).expires_at
        res = self.client.post(reverse('admin:tenants_restaurant_changelist'), {
            'action': 'action_mark_paid', '_selected_action': [str(r1.pk), str(r2.pk)],
        }, follow=True)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(License.objects.get(restaurant=r1).expires_at, add_one_month(before1))
        self.assertEqual(License.objects.get(restaurant=r2).expires_at, add_one_month(far))
        msgs = [str(m) for m in django_messages.get_messages(res.wsgi_request)]
        self.assertTrue(any('2 ta litsenziya uzaytirildi' in m and 'Ikkinchi' in m for m in msgs), msgs)
