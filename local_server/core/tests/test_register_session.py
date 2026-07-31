"""
Kassa (bugungi savdo) sessiyasi: yopish - yangi buyurtma to'sib qo'yish
(qarang test_orders.py) + barcha ochiq Attendance'ni avtomatik check-out
qilish; ochish - kassir ochsa menejerlarga bildirishnoma, menejer ochsa yo'q.
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token

from core.models import Attendance, Notification, RegisterSession, User


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


class RegisterSessionTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000091', role='manager')
        self.cashier = User.objects.create_user(username='+998900000092', role='cashier')
        self.waiter = User.objects.create_user(username='+998900000093', role='waiter')

    def test_retrieve_auto_creates_singleton_open_by_default(self):
        self.assertFalse(RegisterSession.objects.filter(pk=1).exists())
        resp = self.client.get(reverse('registersession-detail', args=[1]), **_auth_header(self.waiter))
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['is_open'])
        self.assertTrue(RegisterSession.objects.filter(pk=1, is_open=True).exists())

    def test_close_forbidden_for_waiter(self):
        resp = self.client.post(reverse('registersession-close'), **_auth_header(self.waiter))
        self.assertEqual(resp.status_code, 403)

    def test_close_allowed_for_cashier(self):
        resp = self.client.post(reverse('registersession-close'), **_auth_header(self.cashier))
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['is_open'])
        session = RegisterSession.objects.get(pk=1)
        self.assertFalse(session.is_open)
        self.assertEqual(session.closed_by_id, self.cashier.id)

    def test_close_allowed_for_manager(self):
        resp = self.client.post(reverse('registersession-close'), **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)

    def test_close_rejects_already_closed(self):
        RegisterSession.objects.create(pk=1, is_open=False)
        resp = self.client.post(reverse('registersession-close'), **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 400)

    def test_close_auto_checks_out_all_open_attendance(self):
        att1 = Attendance.objects.create(user=self.cashier, check_in_latitude=1, check_in_longitude=1)
        att2 = Attendance.objects.create(user=self.waiter, check_in_latitude=1, check_in_longitude=1)
        # Allaqachon yopilgan - tegilmasligi kerak (ikki marta check-out bo'lib qolmasin).
        already_closed = Attendance.objects.create(
            user=self.manager, check_in_latitude=1, check_in_longitude=1,
        )
        already_closed.check_out = already_closed.check_in
        already_closed.save(update_fields=['check_out'])

        resp = self.client.post(reverse('registersession-close'), **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['checked_out_count'], 2)

        att1.refresh_from_db()
        att2.refresh_from_db()
        self.assertIsNotNone(att1.check_out)
        self.assertIsNotNone(att2.check_out)
        # Har biri o'ziga xos .save() orqali yopilgani uchun tarix yozuvi bor.
        self.assertTrue(att1.history.filter(check_out__isnull=False).exists())

    def test_open_forbidden_for_waiter(self):
        RegisterSession.objects.create(pk=1, is_open=False)
        resp = self.client.post(reverse('registersession-open'), **_auth_header(self.waiter))
        self.assertEqual(resp.status_code, 403)

    def test_open_rejects_already_open(self):
        resp = self.client.post(reverse('registersession-open'), **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 400)

    def test_open_by_manager_sends_no_notification(self):
        RegisterSession.objects.create(pk=1, is_open=False)
        resp = self.client.post(reverse('registersession-open'), **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['is_open'])
        self.assertFalse(Notification.objects.filter(notif_type='register_opened_by_cashier').exists())

    def test_open_by_cashier_notifies_managers(self):
        RegisterSession.objects.create(pk=1, is_open=False)
        resp = self.client.post(reverse('registersession-open'), **_auth_header(self.cashier))
        self.assertEqual(resp.status_code, 200)
        notif = Notification.objects.get(notif_type='register_opened_by_cashier')
        self.assertIsNone(notif.recipient)  # None = barcha menejerlarga broadcast
        self.assertEqual(notif.payload['opened_by'], self.cashier.id)

        session = RegisterSession.objects.get(pk=1)
        self.assertEqual(session.opened_by_id, self.cashier.id)
