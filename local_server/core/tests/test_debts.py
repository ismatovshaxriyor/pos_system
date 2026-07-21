import unittest.mock as mock
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token

from core.models import (
    Category, Customer, DebtTransaction, Order, OrderItem, Payment, Product, Table, User,
)


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


class QarzDaftarTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000011', role='manager')
        self.cashier = User.objects.create_user(username='+998900000012', role='cashier')
        self.waiter = User.objects.create_user(username='+998900000013', role='waiter')
        self.category = Category.objects.create(name='Ovqatlar')
        self.product = Product.objects.create(category=self.category, name='Osh', price=Decimal('30000'))
        self.table = Table.objects.create(name='Stol 1')
        self.customer = Customer.objects.create(first_name='Ali', last_name='Valiyev', phone='+998901112233')

        self.order = Order.objects.create(table=self.table, waiter=self.cashier, status='in_progress')
        OrderItem.objects.create(order=self.order, product=self.product, quantity=1, price=self.product.price)

        self.multiplier_patcher = mock.patch("core.services._decode_multiplier", return_value=1.0)
        self.multiplier_patcher.start()
        self.addCleanup(self.multiplier_patcher.stop)

    def test_close_on_credit_records_debt(self):
        url = reverse('order-close-on-credit', args=[self.order.id])
        resp = self.client.post(
            url, {'customer_id': self.customer.id},
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(resp.status_code, 200)
        self.order.refresh_from_db()
        self.customer.refresh_from_db()
        self.assertEqual(self.order.status, 'completed')
        self.assertEqual(self.order.customer_id, self.customer.id)
        self.assertEqual(self.customer.balance, Decimal('30000'))
        txn = DebtTransaction.objects.get(customer=self.customer, txn_type='credit_sale')
        self.assertEqual(txn.amount, Decimal('30000'))
        self.assertEqual(txn.order_id, self.order.id)

    def test_close_on_credit_after_partial_payment_only_debits_remainder(self):
        Payment.objects.create(order=self.order, amount=Decimal('10000'), received_by=self.cashier)
        url = reverse('order-close-on-credit', args=[self.order.id])
        resp = self.client.post(
            url, {'customer_id': self.customer.id},
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(resp.status_code, 200)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal('20000'))

    def test_close_on_credit_is_manager_gated(self):
        url = reverse('order-close-on-credit', args=[self.order.id])
        resp = self.client.post(
            url, {'customer_id': self.customer.id},
            content_type='application/json', **_auth_header(self.cashier),
        )
        self.assertEqual(resp.status_code, 403)

    def test_close_on_credit_rejects_fully_paid_order(self):
        Payment.objects.create(order=self.order, amount=Decimal('30000'), received_by=self.cashier)
        url = reverse('order-close-on-credit', args=[self.order.id])
        resp = self.client.post(
            url, {'customer_id': self.customer.id},
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(resp.status_code, 400)

    def test_repay_reduces_balance(self):
        self.customer.balance = Decimal('30000')
        self.customer.save()
        url = reverse('customer-repay', args=[self.customer.id])
        resp = self.client.post(
            url, {'amount': '12000', 'method': 'cash'},
            content_type='application/json', **_auth_header(self.cashier),
        )
        self.assertEqual(resp.status_code, 200)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal('18000'))
        self.assertTrue(
            DebtTransaction.objects.filter(customer=self.customer, txn_type='repayment', amount=Decimal('-12000')).exists()
        )

    def test_repay_rejects_overpayment(self):
        self.customer.balance = Decimal('10000')
        self.customer.save()
        url = reverse('customer-repay', args=[self.customer.id])
        resp = self.client.post(
            url, {'amount': '15000'},
            content_type='application/json', **_auth_header(self.cashier),
        )
        self.assertEqual(resp.status_code, 400)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal('10000'))

    def test_customer_create_is_manager_gated(self):
        url = reverse('customer-list')
        resp = self.client.post(
            url, {'first_name': 'Yangi', 'phone': '+998907778899'},
            content_type='application/json', **_auth_header(self.cashier),
        )
        self.assertEqual(resp.status_code, 403)

    def test_has_debt_filter(self):
        self.customer.balance = Decimal('5000')
        self.customer.save()
        Customer.objects.create(first_name='Nol', balance=Decimal('0'))
        url = reverse('customer-list')
        resp = self.client.get(url + '?has_debt=true', **_auth_header(self.manager))
        names = [c['first_name'] for c in resp.json()['results']]
        self.assertIn('Ali', names)
        self.assertNotIn('Nol', names)

    def test_waiter_cannot_read_customer_list(self):
        # Qarz balansi/PII afitsiantdan yopiq - IsManagerOrAdmin SAFE metodlarni
        # afitsiantga ochib qo'yardi, IsCashierOrManager esa yopadi.
        resp = self.client.get(reverse('customer-list'), **_auth_header(self.waiter))
        self.assertEqual(resp.status_code, 403)

    def test_waiter_cannot_read_debt_transactions(self):
        resp = self.client.get(
            reverse('customer-transactions', args=[self.customer.id]), **_auth_header(self.waiter),
        )
        self.assertEqual(resp.status_code, 403)

    def test_cashier_can_read_customer_list(self):
        # Kassir qarz to'lovini qabul qilishi uchun mijozni topa olishi kerak.
        resp = self.client.get(reverse('customer-list'), **_auth_header(self.cashier))
        self.assertEqual(resp.status_code, 200)
