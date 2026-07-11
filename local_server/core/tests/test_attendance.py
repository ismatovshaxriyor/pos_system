from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from core.models import User, RestaurantConfig, Attendance
from core import services


class AttendanceTestCase(APITestCase):
    def setUp(self):
        # 1. Test foydalanuvchilarini yaratish
        self.manager = User.objects.create_user(
            username='+998901234567',
            password='password123',
            first_name='Manager',
            role='manager'
        )
        self.waiter = User.objects.create_user(
            username='+998907654321',
            password='password123',
            first_name='Waiter',
            role='waiter'
        )

        # 2. Restoran sozlamalarini yaratish (Toshkent markazi atrofida)
        self.config = RestaurantConfig.objects.create(
            latitude=Decimal('41.311081'),
            longitude=Decimal('69.240562'),
            attendance_radius=100  # 100 metr radius
        )

    def test_haversine_distance_calculation(self):
        # Toshkent markazidan ~50 metr uzoqlikdagi nuqta
        lat_near = Decimal('41.311300')
        lon_near = Decimal('69.241000')
        distance = services.calculate_haversine_distance(
            self.config.latitude, self.config.longitude,
            lat_near, lon_near
        )
        self.assertTrue(distance < 100)

        # Toshkent markazidan ~300 metr uzoqlikdagi nuqta
        lat_far = Decimal('41.313000')
        lon_far = Decimal('69.243000')
        distance_far = services.calculate_haversine_distance(
            self.config.latitude, self.config.longitude,
            lat_far, lon_far
        )
        self.assertTrue(distance_far > 100)

    def test_check_in_within_radius_success(self):
        # Ruxsat berilgan hudud ichida check-in qilish
        self.client.force_authenticate(user=self.waiter)
        response = self.client.post('/api/attendance/check-in/', {
            'latitude': '41.311200',
            'longitude': '69.240700'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Attendance.objects.count(), 1)
        
        attendance = Attendance.objects.first()
        self.assertEqual(attendance.user, self.waiter)
        self.assertIsNone(attendance.check_out)

    def test_check_in_outside_radius_fails(self):
        # Hududdan tashqarida check-in qilish rad etilishi kerak
        self.client.force_authenticate(user=self.waiter)
        response = self.client.post('/api/attendance/check-in/', {
            'latitude': '41.315000',
            'longitude': '69.245000'
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Siz ishxonadan juda uzoqdasiz", response.data['detail'])

    def test_double_check_in_fails(self):
        # Ketma-ket ikki marta check-in qilish taqiqlanadi
        self.client.force_authenticate(user=self.waiter)
        
        # Birinchi check-in
        response = self.client.post('/api/attendance/check-in/', {
            'latitude': '41.311200',
            'longitude': '69.240700'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Ikkinchi check-in urinishi
        response2 = self.client.post('/api/attendance/check-in/', {
            'latitude': '41.311200',
            'longitude': '69.240700'
        })
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("yopilmagan check-in mavjud", response2.data['detail'])

    def test_check_out_success(self):
        # Check-in qilib, keyin muvaffaqiyatli check-out qilish
        self.client.force_authenticate(user=self.waiter)
        
        # Check-in
        self.client.post('/api/attendance/check-in/', {
            'latitude': '41.311200',
            'longitude': '69.240700'
        })
        
        # Check-out
        response = self.client.post('/api/attendance/check-out/', {
            'latitude': '41.311100',
            'longitude': '69.240600'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        attendance = Attendance.objects.first()
        self.assertIsNotNone(attendance.check_out)

    def test_restaurant_config_permissions(self):
        # Faqat manager koordinatalarni o'zgartira oladi
        self.client.force_authenticate(user=self.waiter)
        response = self.client.put('/api/restaurant-config/1/', {
            'latitude': '41.300000',
            'longitude': '69.200000',
            'attendance_radius': 150
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.manager)
        response2 = self.client.put('/api/restaurant-config/1/', {
            'latitude': '41.300000',
            'longitude': '69.200000',
            'attendance_radius': 150
        })
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        
        self.config.refresh_from_db()
        self.assertEqual(self.config.attendance_radius, 150)
