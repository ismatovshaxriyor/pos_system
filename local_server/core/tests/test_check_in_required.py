from decimal import Decimal

from rest_framework.test import APITestCase

from core.models import Attendance, Category, Product, RestaurantConfig, Table, User


class WaiterCheckInRequiredTests(APITestCase):
    """Ofitsiant restoran hududida ekanini tasdiqlamaguncha (check-in) buyurtma ocha olmaydi."""

    def setUp(self):
        self.waiter = User.objects.create_user(username='+998901110001', role='waiter', first_name='W')
        self.cashier = User.objects.create_user(username='+998901110002', role='cashier', first_name='C')
        self.table = Table.objects.create(name='1')
        self.product = Product.objects.create(
            category=Category.objects.create(name='K'), name='Osh', price=Decimal('40000'),
        )
        self.config = RestaurantConfig.objects.create(
            latitude=Decimal('41.311081'), longitude=Decimal('69.240562'), attendance_radius=150,
        )

    def _create_order(self, user):
        self.client.force_authenticate(user)
        return self.client.post('/api/orders/', {
            'table_id': self.table.id, 'items': [{'product_id': self.product.id, 'quantity': 1}],
        }, format='json')

    def test_waiter_without_check_in_is_blocked(self):
        res = self._create_order(self.waiter)
        self.assertEqual(res.status_code, 403)
        self.assertIn('smenani boshlang', res.data['detail'])

    def test_waiter_with_open_shift_can_order(self):
        Attendance.objects.create(user=self.waiter)
        self.assertEqual(self._create_order(self.waiter).status_code, 201)

    def test_checked_out_waiter_is_blocked_again(self):
        from django.utils import timezone
        Attendance.objects.create(user=self.waiter, check_out=timezone.now())
        self.assertEqual(self._create_order(self.waiter).status_code, 403)

    def test_cashier_is_exempt(self):
        self.assertEqual(self._create_order(self.cashier).status_code, 201)

    def test_not_enforced_without_restaurant_coordinates(self):
        # Koordinata yo'q - check-in imkonsiz, shuning uchun talab qo'llanmaydi (ofitsiant bloklanib qolmasin).
        RestaurantConfig.objects.update(latitude=None, longitude=None)
        self.assertEqual(self._create_order(self.waiter).status_code, 201)

    def test_can_be_switched_off(self):
        RestaurantConfig.objects.update(require_check_in_for_orders=False)
        self.assertEqual(self._create_order(self.waiter).status_code, 201)

    def test_radius_must_be_realistic(self):
        manager = User.objects.create_user(username='+998901110003', role='manager', first_name='M')
        self.client.force_authenticate(manager)
        bad = self.client.patch(f'/api/restaurant-config/{self.config.pk}/', {'attendance_radius': 200000000}, format='json')
        self.assertEqual(bad.status_code, 400)
        ok = self.client.patch(f'/api/restaurant-config/{self.config.pk}/', {'attendance_radius': 150}, format='json')
        self.assertIn(ok.status_code, (200,))
