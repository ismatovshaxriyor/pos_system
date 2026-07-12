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

    def test_start_moves_new_to_in_progress_only(self):
        url = reverse('order-start', args=[self.order.id])
        response = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'in_progress')

        # Qayta boshlash mumkin emas - faqat 'new' holatidan
        response = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(response.status_code, 400)

    def test_cancel_is_manager_gated(self):
        waiter = User.objects.create_user(username='+998900000082', role='waiter')
        order = Order.objects.create(table=self.table, waiter=waiter)
        url = reverse('order-cancel', args=[order.id])

        response = self.client.post(url, content_type='application/json', **_auth_header(waiter))
        self.assertEqual(response.status_code, 403)

        response = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, 'cancelled')

    def test_cancel_forbidden_on_completed_order(self):
        self.order.status = 'completed'
        self.order.save()
        url = reverse('order-cancel', args=[self.order.id])
        response = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(response.status_code, 400)

    def test_add_item_persists_note_modifiers_and_computes_total(self):
        url = reverse('order-add-item', args=[self.order.id])
        response = self.client.post(
            url,
            {
                "product_id": self.product.id, "quantity": 2,
                "note": "achchiq emas", "modifiers": {"olib_tashlansin": ["piyoz"]},
            },
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(response.status_code, 201)

        item = self.order.items.get()
        self.assertEqual(item.note, "achchiq emas")
        self.assertEqual(item.modifiers, {"olib_tashlansin": ["piyoz"]})
        self.assertEqual(item.price, Decimal('25000'))
        # total_amount endi DB ustuni emas - itemlardan hisoblanadi
        self.assertEqual(self.order.total_amount, Decimal('50000'))

    def test_add_item_bulk(self):
        url = reverse('order-add-item', args=[self.order.id])
        response = self.client.post(
            url,
            [
                {"product_id": self.product.id, "quantity": 1, "note": "taom 1"},
                {"product_id": self.product.id, "quantity": 2, "note": "taom 2"}
            ],
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.order.items.count(), 2)
        self.assertEqual(self.order.total_amount, Decimal('75000')) # (1 + 2) * 25000 = 75000

    def test_voided_items_excluded_from_total(self):
        self.order.items.create(product=self.product, quantity=1, price=Decimal('25000'))
        self.order.items.create(product=self.product, quantity=3, price=Decimal('25000'), is_voided=True)
        self.assertEqual(self.order.total_amount, Decimal('25000'))

    def test_product_delete_is_soft_and_blocks_ordering(self):
        del_url = reverse('product-detail', args=[self.product.id])
        response = self.client.delete(del_url, **_auth_header(self.manager))
        self.assertEqual(response.status_code, 204)

        # Qator DB'da qoladi (soft-delete) - eski buyurtmalar PROTECT bilan
        # unga ishora qilishda davom etadi
        self.product.refresh_from_db()
        self.assertTrue(self.product.is_deleted)
        self.assertFalse(self.product.is_available)

        # Ro'yxatdan yo'qoladi
        response = self.client.get(reverse('product-list'), **_auth_header(self.manager))
        self.assertEqual(response.status_code, 200)
        ids = [p['id'] for p in response.data['results']]
        self.assertNotIn(self.product.id, ids)

        # Yangi buyurtmaga qo'shib bo'lmaydi
        response = self.client.post(
            reverse('order-add-item', args=[self.order.id]),
            {"product_id": self.product.id, "quantity": 1},
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(response.status_code, 400)
