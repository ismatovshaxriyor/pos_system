import uuid
from datetime import timedelta

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from django.core.exceptions import ValidationError
from tenants.models import (
    License, Restaurant, RestaurantStatus, RemoteCommand, RestaurantAdminAccount, ErrorLog,
    SyncedOrder, DemoRequest, validate_subdomain,
)
from tenants.tasks import mark_offline_restaurants
from tenants.signals import compute_default_license_expiry
from .jwt_utils import issue_license_token, issue_license_token_batch


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
        self.license = self.restaurant.license  # auto-created by post_save signal
        self.license.expires_at = timezone.now() + timedelta(days=30)
        self.license.save()
        self.url = reverse('sync-activate')

    def test_first_activation_binds_hardware(self):
        response = self.client.post(self.url, {
            "license_key": self.license.key,
            "hardware_hash": "a" * 64,
        }, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('tokens', response.data)
        self.assertGreater(len(response.data['tokens']), 0)
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
@override_settings(LICENSE_PRIVATE_KEY=PRIVATE_PEM, LICENSE_TOKEN_TTL_DAYS=7)
class TokenExpiryCapTests(TestCase):
    """
    Token muddati litsenziyaning expires_at'idan uzoqroq bo'lmasligini
    tekshiradi - aks holda litsenziya tugagandan keyin ham Bola bir necha
    kun ishlab qolishi mumkin edi.
    """

    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.license = self.restaurant.license  # auto-created by post_save signal

    def test_token_capped_when_license_expires_sooner_than_ttl(self):
        # Litsenziya atigi 2 kundan keyin tugaydi - TTL (7 kun)dan qisqaroq.
        self.license.expires_at = timezone.now() + timedelta(days=2)
        self.license.save()

        token, exp = issue_license_token(self.license)

        self.assertEqual(exp, self.license.expires_at)

    def test_token_uses_full_ttl_when_license_expires_later(self):
        # Litsenziya 30 kundan keyin tugaydi - TTL (7 kun)dan uzoqroq,
        # shuning uchun standart 7 kunlik token beriladi.
        self.license.expires_at = timezone.now() + timedelta(days=30)
        self.license.save()

        token, exp = issue_license_token(self.license)

        expected_max = timezone.now() + timedelta(days=7)
        self.assertLess(abs((exp - expected_max).total_seconds()), 5)


@override_settings(LICENSE_PRIVATE_KEY=PRIVATE_PEM, LICENSE_TOKEN_TTL_DAYS=7, LICENSE_TOKEN_BATCH_SIZE=4)
class TokenBatchIssuanceTests(TestCase):
    """
    Bir chaqiruvda bir nechta ketma-ket token yasalishini tekshiradi -
    shu orqali Bola internetsiz haftalar davomida oldindan tayyorlangan
    tokenlarni birin-ketin ishlatib turaveradi.
    """

    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.license = self.restaurant.license  # auto-created by post_save signal
        self.license.expires_at = timezone.now() + timedelta(days=60)
        self.license.save()

    def test_batch_returns_requested_count_of_sequential_tokens(self):
        tokens = issue_license_token_batch(self.license)

        self.assertEqual(len(tokens), 4)
        # Each token's window is exactly one TTL after the previous one's -
        # i.e. token[i+1] starts right where token[i] expires.
        for (_, prev_exp), (_, next_exp) in zip(tokens, tokens[1:]):
            gap = (next_exp - prev_exp).total_seconds() - timedelta(days=7).total_seconds()
            self.assertLess(abs(gap), 5)

    def test_batch_stops_at_license_expiry(self):
        # Only ~10 days left - TTL is 7 days, so at most 2 tokens fit before
        # hitting license.expires_at, not the full batch size of 4.
        self.license.expires_at = timezone.now() + timedelta(days=10)
        self.license.save()

        tokens = issue_license_token_batch(self.license)

        self.assertLessEqual(len(tokens), 2)
        self.assertEqual(tokens[-1][1], self.license.expires_at)


# override_settings shart: usiz test muhitdagi real LICENSE_PRIVATE_KEY'ga
# (keys/ mount yoki env) bog'lanib qoladi - kalit yo'q joyda (masalan CI)
# InvalidKeyError bilan yiqiladi.
@override_settings(LICENSE_PRIVATE_KEY=PRIVATE_PEM, LICENSE_TOKEN_TTL_DAYS=7)
class RenewTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.license = self.restaurant.license  # auto-created by post_save signal
        self.license.hardware_hash = "a" * 64
        self.license.expires_at = timezone.now() + timedelta(days=30)
        self.license.save()
        self.url = reverse('sync-renew')

    def _auth(self):
        return {"HTTP_AUTHORIZATION": f"Token {self.license.key}"}

    def test_renew_success(self):
        response = self.client.post(
            self.url, {"hardware_hash": "a" * 64},
            content_type='application/json', **self._auth(),
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('tokens', response.data)
        self.assertGreater(len(response.data['tokens']), 0)

    def test_renew_returns_current_public_key(self):
        # Bola bu qiymatni LicenseState.public_key'ga saqlaydi - agar bu
        # yerda qaytmasa, Ona'da LICENSE_PRIVATE_KEY rotatsiya qilinganda
        # allaqachon faollashtirilgan Bola'lar eski (endi mos kelmaydigan)
        # kalitni abadiy keshlab qolib, yangi tokenlarni tekshira olmay
        # noto'g'ri bloklanib qolar edi.
        response = self.client.post(
            self.url, {"hardware_hash": "a" * 64},
            content_type='application/json', **self._auth(),
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('public_key', response.data)
        self.assertIn('BEGIN PUBLIC KEY', response.data['public_key'])

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
        self.license = self.restaurant.license  # auto-created by post_save signal
        self.license.hardware_hash = "a" * 64
        self.license.expires_at = timezone.now() + timedelta(days=30)
        self.license.save()
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
        # Kesh kalitlarini test o'zi boshqaradi - Redis test yugurishlari
        # orasida tozalanmaydi, oldingi holat natijani buzmasin.
        cache.delete(f"restaurant_metrics_{stale.id}")
        cache.set(f"restaurant_metrics_{fresh.id}", {"cpu_percent": 1.0}, timeout=60)
        self.addCleanup(cache.delete, f"restaurant_metrics_{fresh.id}")

        mark_offline_restaurants.run()

        stale.refresh_from_db()
        fresh.refresh_from_db()
        self.assertFalse(stale.is_online)
        self.assertTrue(fresh.is_online)

    def test_cache_miss_alone_does_not_mark_recently_seen_offline(self):
        # Redis flush stsenariysi: kesh bo'sh, lekin last_seen yaqin -
        # restoran oflayn deb belgilanmasligi kerak (aks holda har Redis
        # restart butun flotni "oflayn" ko'rsatib yuboradi).
        recent = Restaurant.objects.create(
            name="Kesh yo'q, lekin tirik", is_online=True, last_seen=timezone.now(),
        )
        cache.delete(f"restaurant_metrics_{recent.id}")

        mark_offline_restaurants.run()

        recent.refresh_from_db()
        self.assertTrue(recent.is_online)


class RemoteCommandLifecycleTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.license = self.restaurant.license  # auto-created by post_save signal
        self.license.hardware_hash = "a" * 64
        self.license.expires_at = timezone.now() + timedelta(days=30)
        self.license.save()

        self.other_restaurant = Restaurant.objects.create(name="Boshqa Restoran")
        self.other_license = self.other_restaurant.license  # auto-created by post_save signal
        self.other_license.hardware_hash = "b" * 64
        self.other_license.expires_at = timezone.now() + timedelta(days=30)
        self.other_license.save()

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
        self.license = self.restaurant.license  # auto-created by post_save signal
        self.license.expires_at = timezone.now() + timedelta(days=30)
        self.license.save()
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


class AutoLicenseCreationTests(TestCase):
    def test_creating_restaurant_auto_creates_license(self):
        restaurant = Restaurant.objects.create(name="Yangi Restoran")

        self.assertTrue(License.objects.filter(restaurant=restaurant).exists())
        license_obj = restaurant.license
        self.assertTrue(license_obj.is_active)
        self.assertTrue(license_obj.key)

    def test_expiry_is_end_of_month_plus_two_days(self):
        from_dt = timezone.datetime(2026, 7, 10, 12, 0, 0, tzinfo=timezone.get_current_timezone())
        expiry = compute_default_license_expiry(from_dt)
        # 2026-07-31 23:59:59 + 2 days = 2026-08-02 23:59:59
        self.assertEqual(expiry.year, 2026)
        self.assertEqual(expiry.month, 8)
        self.assertEqual(expiry.day, 2)
        self.assertEqual(expiry.hour, 23)
        self.assertEqual(expiry.minute, 59)

    def test_expiry_handles_february_correctly(self):
        from_dt = timezone.datetime(2026, 2, 15, 9, 0, 0, tzinfo=timezone.get_current_timezone())
        expiry = compute_default_license_expiry(from_dt)
        # 2026 is not a leap year: Feb has 28 days -> 2026-02-28 + 2 days = 2026-03-02
        self.assertEqual(expiry.month, 3)
        self.assertEqual(expiry.day, 2)

    def test_only_one_license_per_restaurant_even_on_resave(self):
        restaurant = Restaurant.objects.create(name="Yangi Restoran")
        restaurant.name = "Yangilangan Nomi"
        restaurant.save()  # created=False this time - must not create a 2nd license

        self.assertEqual(License.objects.filter(restaurant=restaurant).count(), 1)


class ErrorLogIngestTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.license = self.restaurant.license  # auto-created by post_save signal
        self.license.hardware_hash = "a" * 64
        self.license.expires_at = timezone.now() + timedelta(days=30)
        self.license.save()
        self.url = reverse('sync-error-logs')

    def _auth(self, key=None):
        return {"HTTP_AUTHORIZATION": f"Token {key or self.license.key}"}

    def _event(self, **overrides):
        defaults = dict(
            id=str(uuid.uuid4()),
            level='ERROR',
            logger_name='django.request',
            message="Internal Server Error: /api/orders/1/",
            traceback='Traceback...',
            module='views',
            func_name='order_detail',
            line_no=42,
            occurred_at=timezone.now().isoformat(),
        )
        defaults.update(overrides)
        return defaults

    def test_batch_creates_rows(self):
        response = self.client.post(
            self.url, {"events": [self._event(), self._event()]},
            content_type='application/json', **self._auth(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['received'], 2)
        self.assertEqual(ErrorLog.objects.filter(restaurant=self.restaurant).count(), 2)

    def test_duplicate_ids_are_ignored_not_duplicated(self):
        event = self._event()

        self.client.post(
            self.url, {"events": [event]}, content_type='application/json', **self._auth(),
        )
        response = self.client.post(
            self.url, {"events": [event]}, content_type='application/json', **self._auth(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(ErrorLog.objects.filter(id=event['id']).count(), 1)

    def test_accepted_for_inactive_license(self):
        # Lenient auth: a blocked/expired restaurant must still be able to
        # report errors - it may be the most important one to hear from.
        self.license.is_active = False
        self.license.save()

        response = self.client.post(
            self.url, {"events": [self._event()]}, content_type='application/json', **self._auth(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(ErrorLog.objects.count(), 1)

    def test_rejects_unknown_key(self):
        response = self.client.post(
            self.url, {"events": [self._event()]},
            content_type='application/json', **self._auth("nope"),
        )
        self.assertEqual(response.status_code, 403)

    def test_batch_over_limit_rejected(self):
        events = [self._event(id=str(uuid.uuid4())) for _ in range(501)]

        response = self.client.post(
            self.url, {"events": events}, content_type='application/json', **self._auth(),
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(ErrorLog.objects.count(), 0)

    def test_malformed_event_rejects_whole_batch(self):
        good_event = self._event()
        bad_event = self._event(id=str(uuid.uuid4()), level='NOT_A_LEVEL')

        response = self.client.post(
            self.url, {"events": [good_event, bad_event]},
            content_type='application/json', **self._auth(),
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(ErrorLog.objects.count(), 0)

    def test_restaurant_attribution_ignores_any_client_supplied_restaurant_field(self):
        other_restaurant = Restaurant.objects.create(name="Boshqa Restoran")
        event = self._event(restaurant_id=str(other_restaurant.id))

        self.client.post(
            self.url, {"events": [event]}, content_type='application/json', **self._auth(),
        )

        row = ErrorLog.objects.get(id=event['id'])
        self.assertEqual(row.restaurant_id, self.restaurant.id)


class OrderSyncTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.license = self.restaurant.license  # auto-created by post_save signal
        self.license.hardware_hash = "a" * 64
        self.license.expires_at = timezone.now() + timedelta(days=30)
        self.license.save()
        self.url = reverse('sync-orders')

    def _auth(self):
        return {"HTTP_AUTHORIZATION": f"Token {self.license.key}"}

    def _order_payload(self, **overrides):
        payload = {
            "sync_uuid": str(uuid.uuid4()),
            "total_amount": "50000.00",
            "discount_amount": "0.00",
            "tax_amount": "0.00",
            "service_charge": "0.00",
            "final_amount": "50000.00",
            "order_type": "dine_in",
            "status": "completed",
            "waiter_name": "Ali",
            "closed_at": timezone.now().isoformat(),
            "items": [{
                "sync_uuid": str(uuid.uuid4()),
                "product_name": "Osh", "quantity": 2, "price": "25000.00",
            }],
            "payments": [{
                "sync_uuid": str(uuid.uuid4()),
                "amount": "50000.00", "method": "cash", "is_voided": False,
                "created_at": timezone.now().isoformat(),
            }],
        }
        payload.update(overrides)
        return payload

    def test_orders_stored_and_acked(self):
        payload = self._order_payload()
        response = self.client.post(
            self.url, {"orders": [payload]}, content_type='application/json', **self._auth(),
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['synced_uuids'], [payload['sync_uuid']])

        order = SyncedOrder.objects.get(id=payload['sync_uuid'])
        self.assertEqual(order.restaurant, self.restaurant)
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.payments.count(), 1)

    def test_resend_is_idempotent(self):
        payload = self._order_payload()
        for _ in range(2):
            response = self.client.post(
                self.url, {"orders": [payload]}, content_type='application/json', **self._auth(),
            )
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response.data['synced_uuids'], [payload['sync_uuid']])

        self.assertEqual(SyncedOrder.objects.count(), 1)
        order = SyncedOrder.objects.get(id=payload['sync_uuid'])
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.payments.count(), 1)

    def test_cannot_overwrite_other_restaurants_order(self):
        # Tenant izolyatsiyasi: bitta Bola boshqa restoranning sync_uuid'ini
        # (bila turib yoki UUID to'qnashuvida) qayta yoza olmasligi kerak.
        other = Restaurant.objects.create(name="Boshqa Restoran")
        payload = self._order_payload()
        SyncedOrder.objects.create(
            id=payload['sync_uuid'], restaurant=other,
            total_amount='1.00', discount_amount='0.00', final_amount='1.00',
            status='completed',
        )

        response = self.client.post(
            self.url, {"orders": [payload]}, content_type='application/json', **self._auth(),
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['synced_uuids'], [])

        order = SyncedOrder.objects.get(id=payload['sync_uuid'])
        self.assertEqual(order.restaurant, other)

    def test_requires_license_auth(self):
        # No authenticate_header -> DRF coerces 401 to 403 (see RenewTests note).
        response = self.client.post(
            self.url, {"orders": [self._order_payload()]}, content_type='application/json',
        )
        self.assertEqual(response.status_code, 403)

    def test_dead_license_can_still_sync(self):
        # HeartbeatAuthentication: bloklangan/o'chirilgan restoran ham sotuv
        # hisobotini yuborishda davom etishi kerak.
        self.license.is_active = False
        self.license.save()

        payload = self._order_payload()
        response = self.client.post(
            self.url, {"orders": [payload]}, content_type='application/json', **self._auth(),
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(SyncedOrder.objects.filter(id=payload['sync_uuid']).exists())


class PublicApiTests(TestCase):
    def test_public_stats(self):
        url = reverse('public-stats')
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertIn('active_restaurants', resp.data)
        self.assertIn('app_version', resp.data)

    def test_public_license_check_active(self):
        restaurant = Restaurant.objects.create(name="Rayhon Food")
        license_obj = restaurant.license
        license_obj.hardware_hash = "a" * 64
        license_obj.expires_at = timezone.now() + timedelta(days=30)
        license_obj.save()

        url = reverse('public-check-license')
        resp = self.client.post(
            url, {"license_key": license_obj.key}, content_type='application/json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'active')

    def test_public_license_check_not_found(self):
        url = reverse('public-check-license')
        resp = self.client.post(
            url, {"license_key": "NONEXISTENT-KEY"}, content_type='application/json',
        )
        self.assertEqual(resp.status_code, 404)

    def test_public_demo_request(self):
        url = reverse('public-demo-request')
        payload = {
            "restaurant_name": "Afsona Kafe",
            "contact_name": "Vali Rahimov",
            "phone": "+998901234567",
            "branch_count": "2 ta kassa",
            "note": "Demoga so'rov"
        }
        resp = self.client.post(url, payload, content_type='application/json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(DemoRequest.objects.filter(restaurant_name="Afsona Kafe").exists())


class SubdomainTests(TestCase):
    def test_validate_subdomain_success(self):
        validate_subdomain('sim-sim')
        validate_subdomain('rayhon123')

    def test_validate_subdomain_reserved(self):
        with self.assertRaises(ValidationError):
            validate_subdomain('admin')
        with self.assertRaises(ValidationError):
            validate_subdomain('api')
        with self.assertRaises(ValidationError):
            validate_subdomain('www')

    def test_validate_subdomain_invalid_chars(self):
        with self.assertRaises(ValidationError):
            validate_subdomain('sim_sim!')
        with self.assertRaises(ValidationError):
            validate_subdomain('ab')

    def test_public_subdomain_check_available(self):
        url = reverse('public-check-subdomain') + '?subdomain=sim-sim'
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['available'])
        self.assertEqual(resp.data['subdomain'], 'sim-sim')

    def test_public_subdomain_check_taken(self):
        Restaurant.objects.create(name="Sim Sim", subdomain="sim-sim")
        url = reverse('public-check-subdomain') + '?subdomain=sim-sim'
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['available'])

    def test_domain_routing_middleware_tenant_lookup(self):
        restaurant = Restaurant.objects.create(name="Caravan", subdomain="caravan")
        resp = self.client.get('/api/sync/public/stats/', HTTP_HOST='caravan.hamrohpos.uz')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.wsgi_request.restaurant, restaurant)


