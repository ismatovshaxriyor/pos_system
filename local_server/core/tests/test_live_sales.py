import unittest.mock as mock
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token

from core.models import Category, Order, OrderItem, Product, Table, User


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


class LiveTableSalesTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000001', role='manager')
        self.cashier = User.objects.create_user(username='+998900000002', role='cashier')
        self.waiter = User.objects.create_user(username='+998900000003', role='waiter')
        self.category = Category.objects.create(name='Ovqatlar')
        self.product = Product.objects.create(category=self.category, name='Osh', price=Decimal('25000'))
        self.busy_table = Table.objects.create(name='Stol 1')
        self.free_table = Table.objects.create(name='Stol 2')

        self.order = Order.objects.create(table=self.busy_table, waiter=self.waiter, status='in_progress')
        OrderItem.objects.create(order=self.order, product=self.product, quantity=2, price=self.product.price)

        self.multiplier_patcher = mock.patch("core.services._decode_multiplier", return_value=1.0)
        self.multiplier_patcher.start()
        self.addCleanup(self.multiplier_patcher.stop)

        self.url = reverse('table-live-sales')

    def test_cashier_sees_busy_table_with_running_total(self):
        resp = self.client.get(self.url, **_auth_header(self.cashier))
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row['table_id'], self.busy_table.id)
        self.assertEqual(row['item_count'], 2)
        self.assertEqual(Decimal(row['total_amount']), Decimal('50000'))
        self.assertEqual(Decimal(row['balance_due']), Decimal('50000'))

    def test_free_table_not_listed(self):
        resp = self.client.get(self.url, **_auth_header(self.manager))
        table_ids = [r['table_id'] for r in resp.json()]
        self.assertIn(self.busy_table.id, table_ids)
        self.assertNotIn(self.free_table.id, table_ids)

    def test_waiter_forbidden(self):
        resp = self.client.get(self.url, **_auth_header(self.waiter))
        self.assertEqual(resp.status_code, 403)

    def test_completed_order_excluded(self):
        self.order.status = 'completed'
        self.order.save()
        resp = self.client.get(self.url, **_auth_header(self.cashier))
        self.assertEqual(resp.json(), [])
