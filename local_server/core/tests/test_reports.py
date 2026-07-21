from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token

from core.models import (
    Category, Customer, Ingredient, Order, OrderItem, Payment, Product, Table, User,
)


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


class ReportsTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000031', first_name='Boss', role='manager')
        self.cashier = User.objects.create_user(username='+998900000032', role='cashier')
        self.waiter = User.objects.create_user(username='+998900000033', first_name='Olim', role='waiter')
        self.category = Category.objects.create(name='Ovqatlar')
        self.product = Product.objects.create(category=self.category, name='Osh', price=Decimal('25000'))
        self.table = Table.objects.create(name='Stol 1')

        self.order = Order.objects.create(table=self.table, waiter=self.waiter, status='completed')
        OrderItem.objects.create(order=self.order, product=self.product, quantity=2, price=self.product.price)
        Payment.objects.create(order=self.order, amount=Decimal('30000'), method='cash', received_by=self.waiter)
        Payment.objects.create(order=self.order, amount=Decimal('20000'), method='card', received_by=self.waiter)

    # ---- Afitsiant kunlik summary (Feature 2) ----
    def test_my_summary_for_waiter(self):
        resp = self.client.get(reverse('reports-my-summary'), **_auth_header(self.waiter))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(Decimal(data['total_revenue']), Decimal('50000'))
        self.assertEqual(Decimal(data['by_method']['cash']), Decimal('30000'))
        self.assertEqual(Decimal(data['by_method']['card']), Decimal('20000'))
        self.assertEqual(data['order_count'], 1)
        self.assertEqual(data['item_count'], 2)

    def test_my_summary_waiter_cannot_view_other(self):
        resp = self.client.get(
            reverse('reports-my-summary') + f'?waiter={self.manager.id}', **_auth_header(self.waiter))
        self.assertEqual(resp.status_code, 403)

    def test_my_summary_manager_can_view_specific_waiter(self):
        resp = self.client.get(
            reverse('reports-my-summary') + f'?waiter={self.waiter.id}', **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Decimal(resp.json()['total_revenue']), Decimal('50000'))

    # ---- Dashboard (Feature 5) ----
    def test_dashboard_manager_ok(self):
        resp = self.client.get(reverse('reports-dashboard'), **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(Decimal(data['revenue']['total']), Decimal('50000'))
        self.assertEqual(data['revenue']['order_count'], 1)
        self.assertTrue(any(p['name'] == 'Osh' for p in data['top_products']))

    def test_dashboard_forbidden_for_cashier(self):
        resp = self.client.get(reverse('reports-dashboard'), **_auth_header(self.cashier))
        self.assertEqual(resp.status_code, 403)

    def test_dashboard_forbidden_for_waiter(self):
        resp = self.client.get(reverse('reports-dashboard'), **_auth_header(self.waiter))
        self.assertEqual(resp.status_code, 403)

    # ---- Sales report ----
    def test_sales_report_group_by_product(self):
        resp = self.client.get(
            reverse('reports-sales') + '?group_by=product', **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()['rows']
        self.assertEqual(rows[0]['key'], 'Osh')
        self.assertEqual(Decimal(rows[0]['revenue']), Decimal('50000'))  # 25000 * 2

    def test_sales_report_invalid_group_by(self):
        resp = self.client.get(
            reverse('reports-sales') + '?group_by=nonsense', **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 400)

    # ---- Staff report ----
    def test_staff_report_lists_waiter_revenue(self):
        resp = self.client.get(reverse('reports-staff'), **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)
        waiters = resp.json()['waiters']
        self.assertTrue(any(Decimal(w['revenue']) == Decimal('50000') for w in waiters))

    # ---- Inventory report ----
    def test_inventory_report(self):
        Ingredient.objects.create(name="Go'sht", unit='kg',
                                  current_stock=Decimal('10'), min_stock=Decimal('2'), cost_price=Decimal('80000'))
        Ingredient.objects.create(name='Tuz', unit='kg',
                                  current_stock=Decimal('1'), min_stock=Decimal('5'), cost_price=Decimal('3000'))
        resp = self.client.get(reverse('reports-inventory'), **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['low_stock_count'], 1)
        self.assertEqual(Decimal(data['total_value']), Decimal('803000'))  # 10*80000 + 1*3000

    # ---- Debts report ----
    def test_debts_report(self):
        Customer.objects.create(first_name='Ali', balance=Decimal('40000'))
        Customer.objects.create(first_name='Vali', balance=Decimal('10000'))
        resp = self.client.get(reverse('reports-debts'), **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(Decimal(data['total_outstanding']), Decimal('50000'))
        self.assertEqual(data['debtor_count'], 2)
