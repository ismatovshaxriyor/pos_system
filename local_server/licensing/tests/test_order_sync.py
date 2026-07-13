from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.utils import timezone

from core.models import Category, Order, OrderItem, Payment, Product, User
from licensing.models import LicenseState
from licensing.tasks import sync_completed_orders


def _mock_response(status_code, data):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = data
    return response


class SyncCompletedOrdersTests(TestCase):
    def tearDown(self):
        if hasattr(self, 'multiplier_patcher'):
            self.multiplier_patcher.stop()
        super().tearDown()
        self.multiplier_patcher.stop()


    def setUp(self):
        LicenseState.objects.create(
            license_key='abc123',
            hardware_hash='x' * 64,
            restaurant_name='Test Restoran',
            activated_at=timezone.now(),
        )
        self.waiter = User.objects.create_user(
            username='+998900000091', role='waiter', first_name='Ali',
        )
        category = Category.objects.create(name='Taomlar')
        self.product = Product.objects.create(
            category=category, name='Osh', price=Decimal('30000'),
        )
        self.order = Order.objects.create(waiter=self.waiter, status='completed')
        OrderItem.objects.create(
            order=self.order, product=self.product, quantity=2, price=Decimal('30000'),
        )
        Payment.objects.create(order=self.order, amount=Decimal('60000'), method='cash')
        import unittest.mock as mock
        self.multiplier_patcher = mock.patch("core.services._decode_multiplier", return_value=1.0)
        self.multiplier_patcher.start()


    def test_not_activated_is_noop(self):
        LicenseState.objects.all().delete()
        # Faollashtirilmagan holatda jim chiqib ketishi kerak
        sync_completed_orders.run()

    @patch('licensing.tasks.OnaClient.post_orders')
    def test_completed_order_sent_and_marked_synced(self, mock_post):
        mock_post.return_value = _mock_response(
            201, {"synced_uuids": [str(self.order.sync_uuid)]},
        )

        sync_completed_orders.run()

        (license_key, orders_data) = mock_post.call_args[0]
        self.assertEqual(license_key, 'abc123')
        self.assertEqual(len(orders_data), 1)

        payload = orders_data[0]
        self.assertEqual(payload['sync_uuid'], str(self.order.sync_uuid))
        # Pul qiymatlari string bo'lib ketadi (float emas - aniqlik)
        self.assertEqual(Decimal(payload['total_amount']), Decimal('60000'))
        self.assertEqual(Decimal(payload['final_amount']), Decimal('60000'))
        self.assertEqual(payload['waiter_name'], 'Ali')
        self.assertEqual(len(payload['items']), 1)
        self.assertEqual(Decimal(payload['items'][0]['price']), Decimal('30000'))
        self.assertEqual(len(payload['payments']), 1)

        self.order.refresh_from_db()
        self.assertTrue(self.order.is_synced)

    @patch('licensing.tasks.OnaClient.post_orders')
    def test_voided_items_excluded_from_payload(self, mock_post):
        # total_amount void qatorlarni hisobga olmaydi - payload'dagi
        # itemlar ham shunga mos bo'lishi kerak, aks holda Ona tomonda
        # itemlar yig'indisi buyurtma summasidan oshib ketadi.
        OrderItem.objects.create(
            order=self.order, product=self.product, quantity=5,
            price=Decimal('30000'), is_voided=True,
        )
        mock_post.return_value = _mock_response(
            201, {"synced_uuids": [str(self.order.sync_uuid)]},
        )

        sync_completed_orders.run()

        (_, orders_data) = mock_post.call_args[0]
        payload = orders_data[0]
        self.assertEqual(len(payload['items']), 1)
        self.assertEqual(Decimal(payload['total_amount']), Decimal('60000'))

    @patch('licensing.tasks.OnaClient.post_orders')
    def test_open_orders_never_sent(self, mock_post):
        Order.objects.create(waiter=self.waiter, status='new')
        Order.objects.create(waiter=self.waiter, status='in_progress')
        mock_post.return_value = _mock_response(
            201, {"synced_uuids": [str(self.order.sync_uuid)]},
        )

        sync_completed_orders.run()

        (_, orders_data) = mock_post.call_args[0]
        self.assertEqual(len(orders_data), 1)
        self.assertEqual(orders_data[0]['sync_uuid'], str(self.order.sync_uuid))

    @patch('licensing.tasks.OnaClient.post_orders')
    def test_rejected_batch_stays_unsynced(self, mock_post):
        mock_post.return_value = _mock_response(400, {"detail": "yaroqsiz"})

        sync_completed_orders.run()

        self.order.refresh_from_db()
        self.assertFalse(self.order.is_synced)

    @patch('licensing.tasks.OnaClient.post_orders')
    def test_only_acked_uuids_marked_synced(self, mock_post):
        other = Order.objects.create(waiter=self.waiter, status='cancelled')
        # Ona faqat bittasini tasdiqlaydi (masalan ikkinchisi tenant
        # to'qnashuvi tufayli rad etilgan)
        mock_post.return_value = _mock_response(
            201, {"synced_uuids": [str(self.order.sync_uuid)]},
        )

        sync_completed_orders.run()

        self.order.refresh_from_db()
        other.refresh_from_db()
        self.assertTrue(self.order.is_synced)
        self.assertFalse(other.is_synced)
