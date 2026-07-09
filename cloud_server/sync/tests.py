from datetime import timedelta

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from tenants.models import License, Restaurant, RestaurantStatus, RemoteCommand, RestaurantAdminAccount
from tenants.tasks import mark_offline_restaurants


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


@override_settings(LICENSE_PRIVATE_KEY=PRIVATE_PEM, LICENSE_TOKEN_TTL_DAYS=7)
class ActivationTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.license = License.objects.create(
            restaurant=self.restaurant,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.url = reverse('sync-activate')

    def test_first_activation_binds_hardware(self):
        response = self.client.post(self.url, {
            "license_key": self.license.key,
            "hardware_hash": "a" * 64,
        }, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('token', response.data)
        self.license.refresh_from_db()
        self.assertEqual(self.license.hardware_hash, "a" * 64)

    def test_mismatched_hardware_rejected(self):
        self.license.hardware_hash = "a" * 64
        self.license.save()
        response = self.client.post(self.url, {
            "license_key": self.license.key,
            "hardware_hash": "b" * 64,
        }, content_type='application/json')
        self.assertEqual(response.status_code, 403)

    def test_inactive_license_rejected(self):
        self.license.is_active = False
        self.license.save()
        response = self.client.post(self.url, {
            "license_key": self.license.key,
            "hardware_hash": "a" * 64,
        }, content_type='application/json')
        self.assertEqual(response.status_code, 403)

    def test_expired_license_rejected(self):
        self.license.expires_at = timezone.now() - timedelta(days=1)
        self.license.save()
        response = self.client.post(self.url, {
            "license_key": self.license.key,
            "hardware_hash": "a" * 64,
        }, content_type='application/json')
        self.assertEqual(response.status_code, 403)

    def test_invalid_key_rejected(self):
        response = self.client.post(self.url, {
            "license_key": "does-not-exist",
            "hardware_hash": "a" * 64,
        }, content_type='application/json')
        self.assertEqual(response.status_code, 400)


@override_settings(LICENSE_PRIVATE_KEY=PRIVATE_PEM, LICENSE_TOKEN_TTL_DAYS=7)
class RenewTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.license = License.objects.create(
            restaurant=self.restaurant,
            hardware_hash="a" * 64,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.url = reverse('sync-renew')

    def _auth(self):
        return {"HTTP_AUTHORIZATION": f"Token {self.license.key}"}

    def test_renew_success(self):
        response = self.client.post(
            self.url, {"hardware_hash": "a" * 64},
            content_type='application/json', **self._auth(),
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('token', response.data)

    def test_renew_wrong_hardware(self):
        response = self.client.post(
            self.url, {"hardware_hash": "b" * 64},
            content_type='application/json', **self._auth(),
        )
        self.assertEqual(response.status_code, 403)

    def test_renew_inactive_license_refused_by_auth(self):
        # LicenseAuthentication doesn't set an authenticate_header, so DRF
        # coerces AuthenticationFailed's status from 401 to 403.
        self.license.is_active = False
        self.license.save()
        response = self.client.post(
            self.url, {"hardware_hash": "a" * 64},
            content_type='application/json', **self._auth(),
        )
        self.assertEqual(response.status_code, 403)


class HeartbeatTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.license = License.objects.create(
            restaurant=self.restaurant,
            hardware_hash="a" * 64,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.url = reverse('sync-heartbeat')

    def _auth(self, key=None):
        return {"HTTP_AUTHORIZATION": f"Token {key or self.license.key}"}

    def test_heartbeat_stores_metrics_and_marks_online(self):
        response = self.client.post(self.url, {
            "cpu_percent": 12.5, "ram_percent": 40.0, "disk_percent": 55.5,
            "app_version": "0.1.0", "unsynced_count": 3,
        }, content_type='application/json', **self._auth())

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['license_active'])
        self.assertEqual(response.data['commands'], [])

        self.restaurant.refresh_from_db()
        self.assertTrue(self.restaurant.is_online)
        self.assertIsNotNone(self.restaurant.last_seen)

        status_row = RestaurantStatus.objects.get(restaurant=self.restaurant)
        self.assertEqual(status_row.cpu_percent, 12.5)
        self.assertEqual(status_row.unsynced_count, 3)

    def test_heartbeat_accepted_for_inactive_license_but_reports_inactive(self):
        # Lenient auth: an inactive license can still heartbeat, but the
        # response tells the Bola to block itself.
        self.license.is_active = False
        self.license.save()

        response = self.client.post(self.url, {}, content_type='application/json', **self._auth())

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['license_active'])

    def test_heartbeat_rejects_unknown_key(self):
        # See RenewTests note: no authenticate_header set -> DRF coerces 401 to 403.
        response = self.client.post(self.url, {}, content_type='application/json', **self._auth("nope"))
        self.assertEqual(response.status_code, 403)


class MarkOfflineRestaurantsTests(TestCase):
    def test_stale_restaurant_marked_offline(self):
        stale = Restaurant.objects.create(
            name="Eski", is_online=True, last_seen=timezone.now() - timedelta(minutes=5),
        )
        fresh = Restaurant.objects.create(
            name="Yangi", is_online=True, last_seen=timezone.now(),
        )

        mark_offline_restaurants.run()

        stale.refresh_from_db()
        fresh.refresh_from_db()
        self.assertFalse(stale.is_online)
        self.assertTrue(fresh.is_online)


class RemoteCommandLifecycleTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.license = License.objects.create(
            restaurant=self.restaurant,
            hardware_hash="a" * 64,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.other_restaurant = Restaurant.objects.create(name="Boshqa Restoran")
        self.other_license = License.objects.create(
            restaurant=self.other_restaurant,
            hardware_hash="b" * 64,
            expires_at=timezone.now() + timedelta(days=30),
        )

    def _auth(self, license_obj):
        return {"HTTP_AUTHORIZATION": f"Token {license_obj.key}"}

    def test_pending_command_delivered_via_heartbeat_and_marked_sent(self):
        command = RemoteCommand.objects.create(
            restaurant=self.restaurant, command_type='block_system',
        )

        response = self.client.post(
            reverse('sync-heartbeat'), {}, content_type='application/json',
            **self._auth(self.license),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['commands']), 1)
        self.assertEqual(response.data['commands'][0]['command_type'], 'block_system')

        command.refresh_from_db()
        self.assertEqual(command.status, 'sent')
        self.assertIsNotNone(command.sent_at)

    def test_sent_command_not_redelivered(self):
        RemoteCommand.objects.create(
            restaurant=self.restaurant, command_type='block_system', status='sent',
        )

        response = self.client.post(
            reverse('sync-heartbeat'), {}, content_type='application/json',
            **self._auth(self.license),
        )

        self.assertEqual(response.data['commands'], [])

    def test_command_result_updates_status(self):
        command = RemoteCommand.objects.create(
            restaurant=self.restaurant, command_type='block_system', status='sent',
        )
        url = reverse('sync-command-result', kwargs={'command_id': command.id})

        response = self.client.post(
            url, {"status": "completed", "result": {"detail": "ok"}},
            content_type='application/json', **self._auth(self.license),
        )

        self.assertEqual(response.status_code, 200)
        command.refresh_from_db()
        self.assertEqual(command.status, 'completed')
        self.assertEqual(command.result, {"detail": "ok"})
        self.assertIsNotNone(command.completed_at)

    def test_command_result_cross_tenant_rejected(self):
        command = RemoteCommand.objects.create(
            restaurant=self.restaurant, command_type='block_system', status='sent',
        )
        url = reverse('sync-command-result', kwargs={'command_id': command.id})

        # other_license belongs to a different restaurant - must not be able
        # to report results for a command it doesn't own.
        response = self.client.post(
            url, {"status": "completed", "result": {}},
            content_type='application/json', **self._auth(self.other_license),
        )

        self.assertEqual(response.status_code, 404)


@override_settings(LICENSE_PRIVATE_KEY=PRIVATE_PEM, LICENSE_TOKEN_TTL_DAYS=7)
class ActivationAdminProvisioningTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.license = License.objects.create(
            restaurant=self.restaurant,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.url = reverse('sync-activate')

    def test_activation_includes_admin_hash_when_account_exists(self):
        admin_account = RestaurantAdminAccount(
            restaurant=self.restaurant, phone="+998901112233", full_name="Aziz Aliyev",
        )
        admin_account.set_password("Kuchli-Parol-1")
        admin_account.save()

        response = self.client.post(self.url, {
            "license_key": self.license.key, "hardware_hash": "a" * 64,
        }, content_type='application/json')

        self.assertEqual(response.status_code, 200)
        self.assertIn('admin', response.data)
        self.assertEqual(response.data['admin']['phone'], "+998901112233")
        self.assertEqual(response.data['admin']['full_name'], "Aziz Aliyev")
        # Hash must be a real Django hash, never the raw password.
        self.assertNotEqual(response.data['admin']['password_hash'], "Kuchli-Parol-1")
        self.assertTrue(response.data['admin']['password_hash'].startswith('pbkdf2_'))

    def test_activation_omits_admin_block_when_no_account(self):
        response = self.client.post(self.url, {
            "license_key": self.license.key, "hardware_hash": "a" * 64,
        }, content_type='application/json')

        self.assertEqual(response.status_code, 200)
        self.assertNotIn('admin', response.data)

    def test_activation_omits_admin_block_when_password_never_set(self):
        # An admin row created without ever setting a password shouldn't be
        # copied down - Bola would end up with an unusable empty-hash account.
        RestaurantAdminAccount.objects.create(
            restaurant=self.restaurant, phone="+998901112233",
        )

        response = self.client.post(self.url, {
            "license_key": self.license.key, "hardware_hash": "a" * 64,
        }, content_type='application/json')

        self.assertNotIn('admin', response.data)
