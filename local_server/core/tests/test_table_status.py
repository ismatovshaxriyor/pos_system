from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token

from core.models import Order, Table, User


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


class TableStatusTests(TestCase):
    def setUp(self):
        self.waiter_a = User.objects.create_user(username='+998900000070', role='waiter')
        self.waiter_b = User.objects.create_user(username='+998900000071', role='waiter')
        self.table = Table.objects.create(name='2-stol')

    def _get_status(self, user):
        response = self.client.get(reverse('table-list'), **_auth_header(user))
        row = next(t for t in response.data['results'] if t['id'] == self.table.id)
        return row['status']

    def test_no_order_is_free(self):
        self.assertEqual(self._get_status(self.waiter_a), 'free')

    def test_own_active_order_is_occupied_by_me(self):
        Order.objects.create(table=self.table, waiter=self.waiter_a, status='new')
        self.assertEqual(self._get_status(self.waiter_a), 'occupied_by_me')

    def test_other_waiters_active_order_is_just_occupied(self):
        Order.objects.create(table=self.table, waiter=self.waiter_b, status='in_progress')
        self.assertEqual(self._get_status(self.waiter_a), 'occupied')

    def test_completed_order_frees_the_table(self):
        Order.objects.create(table=self.table, waiter=self.waiter_b, status='completed')
        self.assertEqual(self._get_status(self.waiter_a), 'free')

    def test_cancelled_order_frees_the_table(self):
        Order.objects.create(table=self.table, waiter=self.waiter_b, status='cancelled')
        self.assertEqual(self._get_status(self.waiter_a), 'free')

    def test_no_waiter_identity_leaks_for_occupied_table(self):
        Order.objects.create(table=self.table, waiter=self.waiter_b, status='new')
        response = self.client.get(reverse('table-list'), **_auth_header(self.waiter_a))
        row = next(t for t in response.data['results'] if t['id'] == self.table.id)
        self.assertNotIn('waiter', row)
        self.assertNotIn('orders', row)
