import uuid
from datetime import datetime, time, timedelta
from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token
from core.models import Category, Order, OrderItem, Product, Table, User
from core.views import RESTAURANT_TZ

def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}

class OrderLogicTests(TestCase):
    def tearDown(self):
        if hasattr(self, 'multiplier_patcher'):
            self.multiplier_patcher.stop()
        super().tearDown()
        self.multiplier_patcher.stop()


    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000081', role='manager')
        self.table = Table.objects.create(name='Test Table')
        self.category = Category.objects.create(name='Test Category')
        self.product = Product.objects.create(category=self.category, name='Test Product', price=Decimal('25000'))
        self.order = Order.objects.create(table=self.table, waiter=self.manager)
        import unittest.mock as mock
        self.multiplier_patcher = mock.patch("core.services._decode_multiplier", return_value=1.0)
        self.multiplier_patcher.start()

        
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

    def test_create_with_client_sync_uuid_is_idempotent(self):
        # Oflayn mijoz o'zi yaratgan sync_uuid bilan yuboradi; javob
        # yo'qolib retry qilinsa, dublikat buyurtma ochilmasligi kerak.
        client_uuid = str(uuid.uuid4())
        url = reverse('order-list')
        payload = {"table_id": self.table.id, "sync_uuid": client_uuid}

        first = self.client.post(
            url, payload, content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(first.status_code, 201)
        # Mijoz yuborgan UUID aynan saqlangan bo'lishi shart - aks holda
        # retry'dagi qidiruv hech qachon mos kelmaydi.
        self.assertEqual(first.data['sync_uuid'], client_uuid)

        retry = self.client.post(
            url, payload, content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.data['id'], first.data['id'])
        self.assertEqual(
            Order.objects.filter(sync_uuid=client_uuid).count(), 1,
        )

    def test_create_with_invalid_sync_uuid_returns_400(self):
        response = self.client.post(
            reverse('order-list'), {"sync_uuid": "bu-uuid-emas"},
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(response.status_code, 400)

    def test_create_order_with_items_dispatches_print_jobs(self):
        url = reverse('order-list')
        payload = {
            "table_id": self.table.id,
            "items": [
                {"product_id": self.product.id, "quantity": 2, "note": "Oshxonaga test"}
            ]
        }
        response = self.client.post(
            url, payload, content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(response.status_code, 201)
        
        # Verify order exists, has status 'in_progress', and items are created
        order_id = response.data['id']
        order = Order.objects.get(id=order_id)
        self.assertEqual(order.status, 'in_progress')
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.items.first().product_id, self.product.id)
        self.assertEqual(order.items.first().quantity, 2)
        self.assertEqual(order.items.first().note, "Oshxonaga test")
        
        # Verify a print job was created for this order
        self.assertTrue(order.print_jobs.exists())
        print_job = order.print_jobs.first()
        self.assertEqual(print_job.status, 'pending')

    def test_update_order_with_items_modifies_correctly(self):
        # Create an order with one item
        order = Order.objects.create(table=self.table, waiter=self.manager, status='in_progress')
        item1 = OrderItem.objects.create(
            order=order, product=self.product, quantity=1, price=self.product.price, is_printed=True
        )

        url = reverse('order-detail', args=[order.id])
        payload = {
            "items": [
                {"id": item1.id, "product_id": self.product.id, "quantity": 5, "note": "Yangilangan matn"},
                {"product_id": self.product.id, "quantity": 2, "note": "Yangi taom"}
            ]
        }
        response = self.client.patch(
            url, payload, content_type='application/json', **_auth_header(self.manager)
        )
        self.assertEqual(response.status_code, 200)

        # Check item1 updated correctly
        item1.refresh_from_db()
        self.assertEqual(item1.quantity, 5)
        self.assertEqual(item1.note, "Yangilangan matn")

        # Check new item created
        self.assertEqual(order.items.count(), 2)
        new_item = order.items.exclude(id=item1.id).get()
        self.assertEqual(new_item.quantity, 2)
        self.assertEqual(new_item.note, "Yangi taom")
        self.assertTrue(new_item.is_printed)

        # Check print jobs: should print only the new item
        print_jobs = order.print_jobs.all()
        # Since send_order_to_kitchen was called during update for the new item, it should create a new PrintJob
        self.assertEqual(print_jobs.count(), 1)
        self.assertEqual(print_jobs.first().items_snapshot[0]['note'], "Yangi taom")

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


class OrderDateFilterTests(TestCase):
    """
    Afitsiant/kassir/menejer '?date=' orqali buyurtmalar tarixini kun
    bo'yicha ko'radi - kun chegarasi Django'ning global TIME_ZONE (UTC) emas,
    RESTAURANT_TZ (Asia/Tashkent) bo'yicha hisoblanadi (core/views.py).
    """
    def tearDown(self):
        if hasattr(self, 'multiplier_patcher'):
            self.multiplier_patcher.stop()
        super().tearDown()
        self.multiplier_patcher.stop()


    def setUp(self):
        self.waiter = User.objects.create_user(username='+998900000090', role='waiter')
        self.other_waiter = User.objects.create_user(username='+998900000091', role='waiter')
        self.table = Table.objects.create(name='Test Table')

        self.today_order = Order.objects.create(table=self.table, waiter=self.waiter)
        self.yesterday_order = Order.objects.create(table=self.table, waiter=self.waiter)
        self.other_waiter_today_order = Order.objects.create(table=self.table, waiter=self.other_waiter)

        now_local = timezone.now().astimezone(RESTAURANT_TZ)
        today_start = datetime.combine(now_local.date(), time(hour=10), tzinfo=RESTAURANT_TZ)
        # Mahalliy kun boshlanishidan 1 soat OLDIN (masalan 00:30) - UTC
        # bo'yicha hali "kechagi kun" bo'lib qolishi mumkin bo'lgan holat.
        just_after_midnight = datetime.combine(now_local.date(), time(hour=0, minute=30), tzinfo=RESTAURANT_TZ)
        yesterday_start = today_start - timedelta(days=1)

        Order.objects.filter(pk=self.today_order.pk).update(created_at=just_after_midnight)
        Order.objects.filter(pk=self.yesterday_order.pk).update(created_at=yesterday_start)
        Order.objects.filter(pk=self.other_waiter_today_order.pk).update(created_at=today_start)
        import unittest.mock as mock
        self.multiplier_patcher = mock.patch("core.services._decode_multiplier", return_value=1.0)
        self.multiplier_patcher.start()


    def test_date_today_excludes_yesterday_and_respects_local_midnight(self):
        response = self.client.get(
            reverse('order-list'), {"date": "today"}, **_auth_header(self.waiter),
        )
        self.assertEqual(response.status_code, 200)
        ids = [o['id'] for o in response.data['results']]
        self.assertIn(self.today_order.id, ids)
        self.assertNotIn(self.yesterday_order.id, ids)
        # Boshqa afitsiantning bugungi buyurtmasi hali ham ko'rinmaydi -
        # date filtri waiter scoping'ini bekor qilmaydi.
        self.assertNotIn(self.other_waiter_today_order.id, ids)

    def test_explicit_iso_date_filters_correctly(self):
        yesterday_date = (timezone.now().astimezone(RESTAURANT_TZ).date() - timedelta(days=1)).isoformat()
        response = self.client.get(
            reverse('order-list'), {"date": yesterday_date}, **_auth_header(self.waiter),
        )
        self.assertEqual(response.status_code, 200)
        ids = [o['id'] for o in response.data['results']]
        self.assertIn(self.yesterday_order.id, ids)
        self.assertNotIn(self.today_order.id, ids)

    def test_invalid_date_returns_400(self):
        response = self.client.get(
            reverse('order-list'), {"date": "bugun-emas"}, **_auth_header(self.waiter),
        )
        self.assertEqual(response.status_code, 400)

    def test_manager_sees_all_waiters_orders_for_the_date(self):
        manager = User.objects.create_user(username='+998900000092', role='manager')
        response = self.client.get(
            reverse('order-list'), {"date": "today"}, **_auth_header(manager),
        )
        ids = [o['id'] for o in response.data['results']]
        self.assertIn(self.today_order.id, ids)
        self.assertIn(self.other_waiter_today_order.id, ids)
        self.assertNotIn(self.yesterday_order.id, ids)
