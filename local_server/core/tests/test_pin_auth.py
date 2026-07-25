from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token

from core.models import DeviceRegistrationCode, StaffDevice, User


class DeviceRegisterViewTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='+998900000001', role='manager', is_staff=True)
        self.staff = User.objects.create_user(username='+998900000002', role='waiter')
        self.registration = DeviceRegistrationCode.objects.create(
            user=self.staff, code='ABCD1234', created_by=self.admin,
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        self.url = reverse('auth-device-register')

    def _post(self, **overrides):
        data = {
            "phone": self.staff.username, "code": self.registration.code,
            "device_id": "device-1", "pin": "482913", "device_label": "Test phone",
        }
        data.update(overrides)
        return self.client.post(self.url, data, content_type='application/json')

    def test_valid_code_creates_active_device_and_token(self):
        response = self._post()

        self.assertEqual(response.status_code, 201)
        self.assertIn('token', response.data)
        self.assertNotIn('pin', response.data)
        self.assertNotIn('pin_hash', response.data)

        device = StaffDevice.objects.get(user=self.staff)
        self.assertTrue(device.is_active)
        self.assertEqual(device.device_id, 'device-1')

        self.staff.refresh_from_db()
        self.assertNotEqual(self.staff.pin_hash, '')
        self.assertFalse(self.staff.has_usable_password())

        self.registration.refresh_from_db()
        self.assertIsNotNone(self.registration.used_at)

    def test_expired_code_rejected(self):
        self.registration.expires_at = timezone.now() - timedelta(minutes=1)
        self.registration.save()

        response = self._post()

        self.assertEqual(response.status_code, 400)
        self.assertFalse(StaffDevice.objects.filter(user=self.staff).exists())

    def test_used_code_rejected(self):
        self.registration.used_at = timezone.now()
        self.registration.save()

        response = self._post()

        self.assertEqual(response.status_code, 400)

    def test_retrying_same_request_after_a_successful_but_lost_response_is_idempotent(self):
        # Regressiya: restoran WiFi'sida javob klientga yetib bormasa (spotty
        # WiFi - shu loyihada boshqa joylarda ham hujjatlashtirilgan muammo),
        # klient AYNAN o'sha (kod, device_id, pin)ni qayta yuboradi. Birinchi
        # so'rov aslida muvaffaqiyatli bo'lgan bo'lsa, ikkinchisi xato emas -
        # xuddi shu tokenni qaytarishi kerak, aks holda kassir "kod noto'g'ri"
        # deb chalkashib qolar edi, holbuki qurilmasi allaqachon ishlaydi.
        first = self._post()
        self.assertEqual(first.status_code, 201)

        second = self._post()

        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.data['token'], first.data['token'])
        self.assertEqual(StaffDevice.objects.filter(user=self.staff, is_active=True).count(), 1)

    def test_used_code_retried_with_different_pin_still_rejected(self):
        # Yuqoridagi idempotentlik faqat AYNAN bir xil (kod, device_id, pin)
        # qayta yuborilganda ishlashi kerak - boshqa PIN bilan urinish hali
        # ham rad etilishi kerak (aks holda ishlatilgan kod cheksiz qayta
        # foydalanish teshigiga aylanardi).
        self._post()

        response = self._post(pin='999999')

        self.assertEqual(response.status_code, 400)

    def test_wrong_code_rejected(self):
        response = self._post(code='WRONGCODE')

        self.assertEqual(response.status_code, 400)

    def test_admin_user_cannot_redeem_code(self):
        # Admin foydalanuvchi uchun kod umuman yaratilmaydi, lekin himoya
        # ikki qavatli bo'lishi kerak - to'g'ridan-to'g'ri kod bilan
        # urinilsa ham rad etiladi.
        response = self._post(phone=self.admin.username, code='ANYCODE')

        self.assertEqual(response.status_code, 400)

    def test_invalid_pin_format_rejected(self):
        response = self._post(pin='12')

        self.assertEqual(response.status_code, 400)

    def test_reregistration_evicts_previous_device(self):
        self._post()
        old_token = Token.objects.get(user=self.staff).key

        new_registration = DeviceRegistrationCode.objects.create(
            user=self.staff, code='NEWCODE1', created_by=self.admin,
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        response = self.client.post(self.url, {
            "phone": self.staff.username, "code": new_registration.code,
            "device_id": "device-2", "pin": "112233",
        }, content_type='application/json')

        self.assertEqual(response.status_code, 201)
        old_device = StaffDevice.objects.get(device_id='device-1')
        self.assertFalse(old_device.is_active)
        new_device = StaffDevice.objects.get(device_id='device-2')
        self.assertTrue(new_device.is_active)
        # Eski token o'chirilib, xuddi shu userga yangisi berilgan bo'lishi kerak.
        self.assertNotEqual(Token.objects.get(user=self.staff).key, old_token)


class PinLoginViewTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.staff = User.objects.create_user(username='+998900000003', role='waiter')
        self.staff.pin_hash = make_password('482913')
        self.staff.save(update_fields=['pin_hash'])
        self.device = StaffDevice.objects.create(user=self.staff, device_id='device-9', is_active=True)
        self.url = reverse('auth-pin-login')

    def test_correct_pin_returns_token(self):
        response = self.client.post(
            self.url, {"device_id": "device-9", "pin": "482913"}, content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('token', response.data)
        self.assertNotIn('pin', response.data)

    def test_correct_pin_updates_last_login_at(self):
        # Regressiya: last_login_at xotirada o'rnatilib, hech qachon
        # saqlanmas edi - admin panelda doim bo'sh ko'rinardi.
        self.assertIsNone(self.device.last_login_at)

        response = self.client.post(
            self.url, {"device_id": "device-9", "pin": "482913"}, content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        self.device.refresh_from_db()
        self.assertIsNotNone(self.device.last_login_at)

    def test_wrong_pin_rejected(self):
        response = self.client.post(
            self.url, {"device_id": "device-9", "pin": "000000"}, content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)

    def test_unknown_device_rejected_with_same_generic_message_as_wrong_pin(self):
        known_device_response = self.client.post(
            self.url, {"device_id": "device-9", "pin": "000000"}, content_type='application/json',
        )
        unknown_device_response = self.client.post(
            self.url, {"device_id": "does-not-exist", "pin": "000000"}, content_type='application/json',
        )

        self.assertEqual(known_device_response.status_code, unknown_device_response.status_code)
        self.assertEqual(known_device_response.data['detail'], unknown_device_response.data['detail'])

    def test_revoked_device_rejected(self):
        self.device.is_active = False
        self.device.save()

        response = self.client.post(
            self.url, {"device_id": "device-9", "pin": "482913"}, content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)

    def test_lockout_after_max_attempts(self):
        for _ in range(5):
            self.client.post(
                self.url, {"device_id": "device-9", "pin": "000000"}, content_type='application/json',
            )

        response = self.client.post(
            self.url, {"device_id": "device-9", "pin": "482913"}, content_type='application/json',
        )

        self.assertEqual(response.status_code, 429)


    def test_shift_switch_another_cashier_login_on_same_device(self):
        # Kassir 2 yaratamiz va unga boshqa 6-xonali PIN o'rnatamiz
        cashier2 = User.objects.create_user(username='+998900000004', role='cashier')
        cashier2.pin_hash = make_password('654321')
        cashier2.save(update_fields=['pin_hash'])

        # Kassir 2 ayni shu kassa planshetida (device-9) o'z PIN kodi bilan kiradi
        response = self.client.post(
            self.url, {"device_id": "device-9", "pin": "654321"}, content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['username'], cashier2.username)

        # StaffDevice endi Kassir 2 ga o'tgan bo'lishi kerak
        self.device.refresh_from_db()
        self.assertEqual(self.device.user, cashier2)

    def test_shift_switch_evicts_incoming_cashiers_other_active_device(self):
        # Regressiya: agar kiruvchi kassir (cashier2) allaqachon BOSHQA
        # kassa terminaliga faol+tasdiqlangan holda bog'langan bo'lsa, uni
        # shu (device-9) terminalga bog'lash avval eski qurilmasini evict
        # qilmasdan `uniq_active_approved_device_per_user` constraint'ini
        # buzib IntegrityError (500) berardi - kassir umuman kira olmasdi.
        cashier2 = User.objects.create_user(username='+998900000005', role='cashier')
        cashier2.pin_hash = make_password('654321')
        cashier2.save(update_fields=['pin_hash'])
        other_device = StaffDevice.objects.create(
            user=cashier2, device_id='device-other-terminal', is_active=True, is_approved=True,
        )
        Token.objects.create(user=cashier2)

        response = self.client.post(
            self.url, {"device_id": "device-9", "pin": "654321"}, content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['user']['username'], cashier2.username)

        self.device.refresh_from_db()
        self.assertEqual(self.device.user, cashier2)

        other_device.refresh_from_db()
        self.assertFalse(other_device.is_active)

