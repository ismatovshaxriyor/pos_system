from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token

from core.models import Category, Order, Product, Table, User


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


class ProductWritePermissionTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='+998900000040', role='manager', is_staff=True)
        self.manager = User.objects.create_user(username='+998900000041', role='manager')
        self.cashier = User.objects.create_user(username='+998900000042', role='cashier')
        self.waiter = User.objects.create_user(username='+998900000043', role='waiter')
        self.category = Category.objects.create(name='Ichimliklar')
        self.product = Product.objects.create(category=self.category, name='Choy', price=5000)

    def _patch_price(self, user):
        url = reverse('product-detail', args=[self.product.id])
        return self.client.patch(
            url, {"price": "7000"}, content_type='application/json', **_auth_header(user),
        )

    def test_admin_can_edit_price(self):
        self.assertEqual(self._patch_price(self.admin).status_code, 200)

    def test_manager_can_edit_price(self):
        self.assertEqual(self._patch_price(self.manager).status_code, 200)

    def test_cashier_cannot_edit_price(self):
        self.assertEqual(self._patch_price(self.cashier).status_code, 403)

    def test_waiter_cannot_edit_price(self):
        self.assertEqual(self._patch_price(self.waiter).status_code, 403)

    def test_any_authenticated_user_can_read_products(self):
        response = self.client.get(reverse('product-list'), **_auth_header(self.waiter))
        self.assertEqual(response.status_code, 200)

    def test_manager_can_create_product_with_category(self):
        response = self.client.post(
            reverse('product-list'),
            {"category_id": self.category.id, "name": "Qahva", "price": "12000"},
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['category']['id'], self.category.id)
        product = Product.objects.get(name='Qahva')
        self.assertEqual(product.category_id, self.category.id)


class OrderQuerysetScopingTests(TestCase):
    def setUp(self):
        self.waiter_a = User.objects.create_user(username='+998900000050', role='waiter')
        self.waiter_b = User.objects.create_user(username='+998900000051', role='waiter')
        self.manager = User.objects.create_user(username='+998900000052', role='manager')
        self.table = Table.objects.create(name='1-stol')
        self.order_a = Order.objects.create(table=self.table, waiter=self.waiter_a)
        self.order_b = Order.objects.create(table=self.table, waiter=self.waiter_b)

    def test_waiter_only_sees_own_orders_in_list(self):
        response = self.client.get(reverse('order-list'), **_auth_header(self.waiter_a))

        self.assertEqual(response.status_code, 200)
        ids = [o['id'] for o in response.data['results']]
        self.assertIn(self.order_a.id, ids)
        self.assertNotIn(self.order_b.id, ids)

    def test_waiter_gets_404_for_other_waiters_order(self):
        url = reverse('order-detail', args=[self.order_b.id])
        response = self.client.get(url, **_auth_header(self.waiter_a))
        self.assertEqual(response.status_code, 404)

    def test_manager_sees_all_orders(self):
        response = self.client.get(reverse('order-list'), **_auth_header(self.manager))

        ids = [o['id'] for o in response.data['results']]
        self.assertIn(self.order_a.id, ids)
        self.assertIn(self.order_b.id, ids)


class UserManagementPermissionTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='+998900000060', role='manager', is_staff=True)
        self.waiter = User.objects.create_user(username='+998900000061', role='waiter')

    def test_only_admin_can_list_users(self):
        response = self.client.get(reverse('user-list'), **_auth_header(self.waiter))
        self.assertEqual(response.status_code, 403)

    def test_admin_can_list_users(self):
        response = self.client.get(reverse('user-list'), **_auth_header(self.admin))
        self.assertEqual(response.status_code, 200)

    def test_any_authenticated_user_can_read_own_me(self):
        response = self.client.get(reverse('user-me'), **_auth_header(self.waiter))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], self.waiter.username)
