from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token
from core.models import Category, Order, Product, Table, User

def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}

class OrderLogicTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000081', role='manager')
        self.table = Table.objects.create(name='Test Table')
        self.category = Category.objects.create(name='Test Category')
        self.product = Product.objects.create(category=self.category, name='Test Product', price=Decimal('25000'))
        self.order = Order.objects.create(table=self.table, waiter=self.manager)
        
    def test_status_not_writable_via_generic_patch(self):
        url = reverse('order-detail', args=[self.order.id])
        response = self.client.patch(
            url, {"status": "completed"}, content_type='application/json',
            **_auth_header(self.manager)
        )
        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'new')

    def test_add_item_forbidden_on_completed_order(self):
        self.order.status = 'completed'
        self.order.save()
        url = reverse('order-add-item', args=[self.order.id])
        response = self.client.post(
            url, {"product_id": self.product.id, "quantity": 1},
            content_type='application/json', **_auth_header(self.manager)
        )
        self.assertEqual(response.status_code, 400)

    def test_add_item_forbidden_on_cancelled_order(self):
        self.order.status = 'cancelled'
        self.order.save()
        url = reverse('order-add-item', args=[self.order.id])
        response = self.client.post(
            url, {"product_id": self.product.id, "quantity": 1},
            content_type='application/json', **_auth_header(self.manager)
        )
        self.assertEqual(response.status_code, 400)

    def test_close_forbidden_on_cancelled_order(self):
        self.order.status = 'cancelled'
        self.order.save()
        url = reverse('order-close', args=[self.order.id])
        response = self.client.post(
            url, content_type='application/json', **_auth_header(self.manager)
        )
        self.assertEqual(response.status_code, 400)
