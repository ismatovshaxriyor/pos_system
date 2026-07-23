import uuid
from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from core import services
from core.models import Category, Product, Table, TableZone, Order, OrderItem, User

class PublicQRMenuTests(TestCase):
    def tearDown(self):
        if hasattr(self, 'multiplier_patcher'):
            self.multiplier_patcher.stop()
        super().tearDown()

    def setUp(self):
        import unittest.mock as mock
        self.multiplier_patcher = mock.patch("core.services._decode_multiplier", return_value=1.0)
        self.multiplier_patcher.start()

        self.zone = TableZone.objects.create(name='Asosiy Zal')
        self.table = Table.objects.create(name='Stol #5', zone=self.zone, capacity=4)
        self.category = Category.objects.create(name='Kebablar')
        self.product1 = Product.objects.create(category=self.category, name='Tovuq Kabob', price=Decimal('25000'), is_available=True)
        self.product2 = Product.objects.create(category=self.category, name='Go\'sht Kabob', price=Decimal('35000'), is_available=True)
        self.product_unavailable = Product.objects.create(category=self.category, name='Tugagan Taom', price=Decimal('10000'), is_available=False)
        self.manager = User.objects.create_user(username='manager', password='password123')

    def test_public_menu_unauthenticated(self):
        """Mijoz autentifikatsiyasiz ochiq menyuni ko'ra oladi."""
        url = reverse('public-menu')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['name'], 'Kebablar')
        products = data[0]['products']
        # Faqat mavjud taomlar (is_available=True) chiqishi kerak
        product_names = [p['name'] for p in products]
        self.assertIn('Tovuq Kabob', product_names)
        self.assertIn('Go\'sht Kabob', product_names)
        self.assertNotIn('Tugagan Taom', product_names)

    def test_public_table_live_status_empty_order(self):
        """Buyurtmasiz stol skanerlanganda stol ma'lumotlari va current_order=None qaytishi kerak."""
        url = reverse('public-table-live', kwargs={'qr_code': self.table.qr_code})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['table_name'], 'Stol #5')
        self.assertEqual(data['zone_name'], 'Asosiy Zal')
        self.assertEqual(str(data['qr_code']), str(self.table.qr_code))
        self.assertIsNone(data['current_order'])

    def test_public_table_live_status_with_active_order(self):
        """Faol buyurtmali stol skanerlanganda hisob summasi va taomlar ko'rinishi kerak."""
        waiter = User.objects.create_user(username='+998901112233', role='waiter')
        order = Order.objects.create(table=self.table, waiter=waiter, status='in_progress')
        item1 = OrderItem.objects.create(order=order, product=self.product1, quantity=2, price=Decimal('25000'))
        item2 = OrderItem.objects.create(order=order, product=self.product2, quantity=1, price=Decimal('35000'))
        services.calculate_order_financials(order)

        url = reverse('public-table-live', kwargs={'qr_code': self.table.qr_code})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsNotNone(data['current_order'])
        current_order = data['current_order']
        self.assertEqual(current_order['status'], 'in_progress')
        self.assertEqual(len(current_order['items']), 2)
        # Summa: (2 * 25000) + (1 * 35000) = 85000
        self.assertEqual(Decimal(str(current_order['final_amount'])), Decimal('85000.00'))

    def test_public_table_invalid_qr_code(self):
        """Mavjud bo'lmagan QR UUID berilganda 404 qaytishi kerak."""
        fake_uuid = uuid.uuid4()
        url = reverse('public-table-live', kwargs={'qr_code': fake_uuid})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 404)

    def test_call_waiter_api(self):
        """Ofitsiant chaqirish API yuborilganda Notification yaratilishi va 200 OK qaytishi kerak."""
        url = reverse('public-call-waiter', kwargs={'qr_code': self.table.qr_code})
        response = self.client.post(url, {'reason': 'Hisob so\'raldi'}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'ok')
        from core.models import Notification
        notif = Notification.objects.filter(payload__table_id=self.table.id).first()
        self.assertIsNotNone(notif)
        self.assertIn('Stol #5', notif.message)

    def test_call_waiter_demo_mode(self):
        """qr_code='demo' bo'lganda ham call-waiter 200 OK qaytarishi va birinchi stol uchun bildirishnoma yaratishi kerak."""
        url = reverse('public-call-waiter', kwargs={'qr_code': 'demo'})
        response = self.client.post(url, {'reason': 'Demo chaqiruv'}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'ok')
        from core.models import Notification
        notif = Notification.objects.filter(payload__reason='Demo chaqiruv').first()
        self.assertIsNotNone(notif)

    def test_table_qr_code_image_generation(self):
        """Menejer stol uchun QR kod PNG rasmini yuklab ola olishi kerak."""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.manager)
        url = reverse('table-qr-code', kwargs={'pk': self.table.pk})
        response = client.get(url + '?domain=filial1.hamrohpos.uz')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'image/png')
        self.assertTrue(len(response.content) > 100)
