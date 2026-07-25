from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token

from core import services
from core.models import DeviceRegistrationCode, StaffDevice, User


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


class GenerateRegistrationCodeActionTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='+998900000010', role='manager', is_staff=True)
        self.manager = User.objects.create_user(username='+998900000011', role='manager')
        self.waiter = User.objects.create_user(username='+998900000012', role='waiter')

    def test_admin_can_generate_code_for_waiter(self):
        url = reverse('user-generate-registration-code', args=[self.waiter.id])

        response = self.client.post(url, content_type='application/json', **_auth_header(self.admin))

        self.assertEqual(response.status_code, 201)
        self.assertIn('code', response.data)

    def test_waiter_cannot_generate_code(self):
        url = reverse('user-generate-registration-code', args=[self.waiter.id])

        response = self.client.post(url, content_type='application/json', **_auth_header(self.waiter))

        self.assertEqual(response.status_code, 403)

    def test_regular_manager_can_generate_code(self):
        """
        IsAdminStaff endi role == 'manager'ga bog'liq, is_staff'ga emas -
        alohida "admin" roli yo'q, PIN bilan kiruvchi oddiy menejer ham
        bosh (is_staff=True) hisob bilan bir xil huquqqa ega.
        """
        url = reverse('user-generate-registration-code', args=[self.waiter.id])

        response = self.client.post(url, content_type='application/json', **_auth_header(self.manager))

        self.assertEqual(response.status_code, 201)
        self.assertIn('code', response.data)

    def test_cannot_generate_code_for_admin_user(self):
        other_admin = User.objects.create_user(username='+998900000013', role='manager', is_staff=True)
        url = reverse('user-generate-registration-code', args=[other_admin.id])

        response = self.client.post(url, content_type='application/json', **_auth_header(self.admin))

        self.assertEqual(response.status_code, 400)

    def test_repeated_call_returns_same_code_instead_of_replacing_it(self):
        # Regressiya: har chaqiruv eski (hali amal qiluvchi) kodni o'chirib
        # yangisini yaratardi - agar bu ikkinchi marta (masalan tugma qayta
        # bosilib) chaqirilsa, xodimga aytilgan/yozib qo'yilgan birinchi kod
        # sababsiz ishlamay qolardi. Endi bitta amal qiluvchi kod bo'lsa,
        # u qayta ishlatiladi - yangilanmaydi.
        url = reverse('user-generate-registration-code', args=[self.waiter.id])

        first = self.client.post(url, content_type='application/json', **_auth_header(self.admin))
        second = self.client.post(url, content_type='application/json', **_auth_header(self.admin))

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.data['code'], second.data['code'])
        self.assertEqual(
            DeviceRegistrationCode.objects.filter(user=self.waiter, used_at__isnull=True).count(), 1,
        )

    def test_new_code_generated_once_previous_one_expired(self):
        url = reverse('user-generate-registration-code', args=[self.waiter.id])
        first = self.client.post(url, content_type='application/json', **_auth_header(self.admin))

        expired = DeviceRegistrationCode.objects.get(user=self.waiter)
        expired.expires_at = timezone.now() - timedelta(minutes=1)
        expired.save(update_fields=['expires_at'])

        second = self.client.post(url, content_type='application/json', **_auth_header(self.admin))

        self.assertEqual(second.status_code, 201)
        self.assertNotEqual(first.data['code'], second.data['code'])


class StaffDeviceViewSetTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='+998900000020', role='manager', is_staff=True)
        self.waiter = User.objects.create_user(username='+998900000021', role='waiter')
        self.device = StaffDevice.objects.create(user=self.waiter, device_id='device-x', is_active=True)
        self.waiter_token = Token.objects.create(user=self.waiter)

    def test_non_admin_cannot_list_devices(self):
        response = self.client.get(reverse('staffdevice-list'), **_auth_header(self.waiter))
        self.assertEqual(response.status_code, 403)

    def test_regular_manager_can_list_devices(self):
        manager = User.objects.create_user(username='+998900000022', role='manager')
        response = self.client.get(reverse('staffdevice-list'), **_auth_header(manager))
        self.assertEqual(response.status_code, 200)

    def test_admin_can_revoke_device_and_it_kills_the_token(self):
        url = reverse('staffdevice-revoke', args=[self.device.id])

        response = self.client.post(url, content_type='application/json', **_auth_header(self.admin))

        self.assertEqual(response.status_code, 200)
        self.device.refresh_from_db()
        self.assertFalse(self.device.is_active)
        self.assertFalse(Token.objects.filter(key=self.waiter_token.key).exists())

        # Eskirgan token bilan keyingi so'rov endi autentifikatsiyadan o'tmaydi.
        me_response = self.client.get(
            reverse('user-me'), HTTP_AUTHORIZATION=f'Token {self.waiter_token.key}',
        )
        self.assertEqual(me_response.status_code, 401)


class RevokeDeviceServiceTests(TestCase):
    def test_revoke_device_deletes_token(self):
        user = User.objects.create_user(username='+998900000030', role='waiter')
        device = StaffDevice.objects.create(user=user, device_id='device-y', is_active=True)
        Token.objects.create(user=user)

        services.revoke_device(device)

        device.refresh_from_db()
        self.assertFalse(device.is_active)
        self.assertFalse(Token.objects.filter(user=user).exists())
