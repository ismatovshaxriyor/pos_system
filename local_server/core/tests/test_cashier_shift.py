"""
Kassir smenasi: kassa terminaliga PIN bilan kirish smenani avtomatik boshlaydi
(GPS'siz), kassa yopilganda kassirlar tizimdan chiqariladi, kassa ochilganda
terminalga kirib turgan kassirlar smenaga o'tadi.
"""
from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token

from core.authentication import KITCHEN_SERVICE_USERNAME
from core.models import Attendance, DeviceRegistrationCode, RegisterSession, StaffDevice, User

PIN_A = '482913'
PIN_B = '715204'


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


def _open_shifts(user):
    return Attendance.objects.filter(user=user, check_out__isnull=True)


class PinLoginStartsShiftTests(TestCase):
    def setUp(self):
        cache.clear()
        self.cashier = User.objects.create_user(username='+998900000201', role='cashier', pin_hash=make_password(PIN_A))
        self.device = StaffDevice.objects.create(
            user=self.cashier, device_id='kassa-1', is_active=True, is_approved=True,
        )
        self.url = reverse('auth-pin-login')

    def _login(self, pin=PIN_A, device_id='kassa-1'):
        return self.client.post(self.url, {'device_id': device_id, 'pin': pin}, content_type='application/json')

    def test_cashier_login_starts_shift_without_coordinates(self):
        resp = self._login()
        self.assertEqual(resp.status_code, 200)
        shift = _open_shifts(self.cashier).get()
        self.assertIsNone(shift.check_in_latitude)
        self.assertIsNone(shift.check_in_longitude)

    def test_repeated_login_keeps_single_open_shift(self):
        self._login()
        self._login()
        self.assertEqual(_open_shifts(self.cashier).count(), 1)

    def test_login_while_register_closed_starts_no_shift(self):
        RegisterSession.objects.create(pk=1, is_open=False)
        resp = self._login()
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(_open_shifts(self.cashier).exists())

    def test_waiter_pin_login_starts_no_shift(self):
        waiter = User.objects.create_user(username='+998900000202', role='waiter', pin_hash=make_password(PIN_A))
        self.device.user = waiter
        self.device.save()
        resp = self._login()
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(Attendance.objects.exists())

    def test_terminal_swap_ends_previous_cashier_shift(self):
        self._login()
        other = User.objects.create_user(username='+998900000203', role='cashier', pin_hash=make_password(PIN_B))
        resp = self._login(pin=PIN_B)
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(_open_shifts(self.cashier).exists())
        self.assertEqual(_open_shifts(other).count(), 1)

    def test_device_registration_starts_cashier_shift(self):
        manager = User.objects.create_user(username='+998900000204', role='manager')
        cashier = User.objects.create_user(username='+998900000205', role='cashier')
        DeviceRegistrationCode.objects.create(
            user=cashier, code='KASSA234', created_by=manager,
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        resp = self.client.post(reverse('auth-device-register'), {
            'phone': cashier.username, 'code': 'KASSA234', 'device_id': 'kassa-2', 'pin': PIN_B,
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(_open_shifts(cashier).count(), 1)


class RegisterCloseLogsOutCashiersTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000211', role='manager')
        self.cashier = User.objects.create_user(username='+998900000212', role='cashier')
        self.waiter = User.objects.create_user(username='+998900000213', role='waiter')
        self.kitchen = User.objects.create_user(username=KITCHEN_SERVICE_USERNAME, role='cashier')
        for user in (self.cashier, self.waiter, self.kitchen):
            Token.objects.create(user=user)

    def test_close_deletes_only_cashier_tokens(self):
        resp = self.client.post(reverse('registersession-close'), **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(Token.objects.filter(user=self.cashier).exists())
        self.assertTrue(Token.objects.filter(user=self.waiter).exists())
        self.assertTrue(Token.objects.filter(user=self.manager).exists())
        # Oshxona ekrani xizmat hisobi kassir rolida, lekin u kassa terminali emas.
        self.assertTrue(Token.objects.filter(user=self.kitchen).exists())

    def test_cashier_closing_register_gets_response_then_is_logged_out(self):
        headers = _auth_header(self.cashier)
        resp = self.client.post(reverse('registersession-close'), **headers)
        self.assertEqual(resp.status_code, 200)
        resp = self.client.get(reverse('registersession-detail', args=[1]), **headers)
        self.assertEqual(resp.status_code, 401)


class RegisterOpenStartsShiftTests(TestCase):
    def setUp(self):
        RegisterSession.objects.create(pk=1, is_open=False)
        self.manager = User.objects.create_user(username='+998900000221', role='manager')

    def _cashier(self, phone, *, logged_in, device=True):
        user = User.objects.create_user(username=phone, role='cashier')
        if device:
            StaffDevice.objects.create(user=user, device_id=f'dev-{phone}', is_active=True, is_approved=True)
        if logged_in:
            Token.objects.create(user=user)
        return user

    def test_manager_opening_starts_shifts_of_logged_in_cashiers_only(self):
        logged_in = self._cashier('+998900000222', logged_in=True)
        logged_out = self._cashier('+998900000223', logged_in=False)
        no_device = self._cashier('+998900000224', logged_in=True, device=False)
        kitchen = User.objects.create_user(username=KITCHEN_SERVICE_USERNAME, role='cashier')
        StaffDevice.objects.create(user=kitchen, device_id='kitchen', is_active=True, is_approved=True)
        Token.objects.create(user=kitchen)

        resp = self.client.post(reverse('registersession-open'), **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(_open_shifts(logged_in).count(), 1)
        self.assertFalse(_open_shifts(logged_out).exists())
        self.assertFalse(_open_shifts(no_device).exists())
        self.assertFalse(_open_shifts(kitchen).exists())
        self.assertFalse(_open_shifts(self.manager).exists())

    def test_cashier_opening_starts_own_shift(self):
        cashier = self._cashier('+998900000225', logged_in=True, device=False)
        resp = self.client.post(reverse('registersession-open'), **_auth_header(cashier))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(_open_shifts(cashier).count(), 1)
