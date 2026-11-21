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

    def test_restaurant_config_create_and_destroy_disabled(self):
        # Regressiya: singleton (save() pk=1ga majburlaydi) - POST orqali
        # ikkinchi qator yaratishga urinish IntegrityError (500) berardi. Endi
        # create/list mavjud emas (route'ning o'zi yo'q -> 404), destroy esa
        # route bor-u lekin metod ruxsat etilmagan (405) - faqat retrieve/
        # update qoladi.
        self.client.force_authenticate(user=self.manager)
        response = self.client.post('/api/restaurant-config/', {
            'latitude': '41.300000', 'longitude': '69.200000', 'attendance_radius': 150,
        })
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        response2 = self.client.delete('/api/restaurant-config/1/')
        self.assertEqual(response2.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class AttendanceListFilterTests(APITestCase):
    """`GET /api/attendance/?date=&user=` - tarix filtrlari (faqat menejer boshqalarni ko'radi)."""

    def setUp(self):
        self.manager = User.objects.create_user(username='+998901110001', password='x', first_name='M', role='manager')
        self.w1 = User.objects.create_user(username='+998901110002', password='x', first_name='W1', role='waiter')
        self.w2 = User.objects.create_user(username='+998901110003', password='x', first_name='W2', role='waiter')
        self.a1 = Attendance.objects.create(user=self.w1)
        self.a2 = Attendance.objects.create(user=self.w2)
        # check_in auto_now_add - kechagi sanaga qo'lda suramiz
        yesterday = timezone.now() - timezone.timedelta(days=1)
        Attendance.objects.filter(pk=self.a2.pk).update(check_in=yesterday)

    def _ids(self, **params):
        res = self.client.get('/api/attendance/', params)
        self.assertEqual(res.status_code, 200)
        return [r['id'] for r in res.data['results']]

    def test_manager_filters_by_date_and_user(self):
        self.client.force_authenticate(self.manager)
        today = timezone.localdate().isoformat()
        self.assertEqual(self._ids(date=today), [self.a1.id])
        self.assertEqual(self._ids(user=self.w2.id), [self.a2.id])
        self.assertEqual(self._ids(), [self.a1.id, self.a2.id])  # eng yangisi birinchi

    def test_waiter_sees_only_own_even_with_user_param(self):
        self.client.force_authenticate(self.w1)
        self.assertEqual(self._ids(user=self.w2.id), [self.a1.id])

    def test_bad_date_is_ignored(self):
        self.client.force_authenticate(self.manager)
        self.assertEqual(len(self._ids(date='nonsense')), 2)


class AttendanceOverviewTests(APITestCase):
    """`/api/attendance/me|on-shift|summary/` - smena holati, hozir kim ishda, ish soatlari."""

    def setUp(self):
        self.manager = User.objects.create_user(username='+998901111111', password='x', role='manager')
        self.cashier = User.objects.create_user(username='+998902222222', password='x', role='cashier')
        self.waiter = User.objects.create_user(username='+998903333333', password='x', role='waiter')
        self.waiter2 = User.objects.create_user(username='+998904444444', password='x', role='waiter')

    def _shift(self, user, start_ago_min, end_ago_min=None):
        now = timezone.now()
        a = Attendance.objects.create(user=user)
        # check_in auto_now_add - qiymatni update bilan o'rnatamiz (signal/tarix kerak emas)
        Attendance.objects.filter(pk=a.pk).update(
            check_in=now - timezone.timedelta(minutes=start_ago_min),
            check_out=(now - timezone.timedelta(minutes=end_ago_min)) if end_ago_min is not None else None,
        )
        return a

    def test_me_reports_open_shift(self):
        self.client.force_authenticate(user=self.waiter)
        r = self.client.get('/api/attendance/me/')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data['on_shift'])
        self.assertIsNone(r.data['attendance'])
        self._shift(self.waiter, 30)
        r = self.client.get('/api/attendance/me/')
        self.assertTrue(r.data['on_shift'])
        self.assertIsNotNone(r.data['attendance']['check_in'])

    def test_me_ignores_closed_and_others_shifts(self):
        self._shift(self.waiter, 120, 60)
        self._shift(self.waiter2, 30)
        self.client.force_authenticate(user=self.waiter)
        self.assertFalse(self.client.get('/api/attendance/me/').data['on_shift'])

    def test_on_shift_visible_to_cashier_and_manager_not_waiter(self):
        self._shift(self.waiter, 30)
        self._shift(self.waiter2, 90, 10)  # yopilgan - ro'yxatda bo'lmasligi kerak
        for u, code in ((self.cashier, 200), (self.manager, 200), (self.waiter, 403)):
            self.client.force_authenticate(user=u)
            r = self.client.get('/api/attendance/on-shift/')
            self.assertEqual(r.status_code, code, u.role)
            if code == 200:
                self.assertEqual([x['user']['id'] for x in r.data], [self.waiter.id])

    def test_summary_is_manager_only(self):
        for u in (self.cashier, self.waiter):
            self.client.force_authenticate(user=u)
            self.assertEqual(self.client.get('/api/attendance/summary/').status_code, 403)

    def test_summary_sums_minutes_and_marks_open_shift(self):
        self._shift(self.waiter, 300, 240)   # 60 daqiqa
        self._shift(self.waiter, 120, 90)    # 30 daqiqa
        self._shift(self.waiter2, 45)        # ochiq: ~45 daqiqa
        self.client.force_authenticate(user=self.manager)
        r = self.client.get('/api/attendance/summary/')
        self.assertEqual(r.status_code, 200)
        by_id = {x['user']['id']: x for x in r.data['staff']}
        self.assertEqual(by_id[self.waiter.id]['minutes'], 90)
        self.assertEqual(by_id[self.waiter.id]['shifts'], 2)
        self.assertFalse(by_id[self.waiter.id]['on_shift'])
        self.assertTrue(by_id[self.waiter2.id]['on_shift'])
        self.assertIn(by_id[self.waiter2.id]['minutes'], (44, 45, 46))
        # eng ko'p ishlagan birinchi
        self.assertEqual(r.data['staff'][0]['user']['id'], self.waiter.id)

    def test_summary_caps_forgotten_open_shift(self):
        """Unutilgan check-out kunlab hisoblanib ketmaydi - MAX_OPEN_SHIFT_HOURS bilan chegaralanadi."""
        self.client.force_authenticate(user=self.manager)
        self._shift(self.waiter, 3 * 24 * 60)  # 3 kun oldin boshlangan, hech qachon yopilmagan
        r = self.client.get('/api/attendance/summary/')
        row = next(x for x in r.data['staff'] if x['user']['id'] == self.waiter.id)
        self.assertEqual(row['minutes'], 16 * 60)
        self.assertTrue(row['on_shift'])

    def test_summary_date_range_filters(self):
        self._shift(self.waiter, 60 * 24 * 10, 60 * 24 * 10 - 60)  # 10 kun oldin
        self.client.force_authenticate(user=self.manager)
        self.assertEqual(self.client.get('/api/attendance/summary/').data['staff'], [])
        day = (timezone.now() - timezone.timedelta(days=10)).date().isoformat()
        r = self.client.get(f'/api/attendance/summary/?from={day}&to={day}')
        self.assertEqual(len(r.data['staff']), 1)
