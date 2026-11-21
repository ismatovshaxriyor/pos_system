from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from core.exceptions import GENERIC_VALIDATION, localize_message
from core.models import User


class LocalizeMessageTests(SimpleTestCase):
    """DRF'ning inglizcha standart xabarlari foydalanuvchiga o'zbekcha ko'rinishi kerak."""

    def test_known_drf_defaults_are_translated(self):
        cases = {
            'This field is required.': "Bu maydon to'ldirilishi shart.",
            'This field may not be null.': "Bu maydon bo'sh bo'lishi mumkin emas.",
            'This field may not be blank.': "Bu maydon bo'sh bo'lishi mumkin emas.",
            'A valid integer is required.': 'Butun son kiriting.',
            'A valid number is required.': 'Son kiriting.',
            'Ensure this field has no more than 100 characters.': "Ko'pi bilan 100 ta belgi bo'lishi mumkin.",
            'Ensure this value is greater than or equal to 0.': "Qiymat kamida 0 bo'lishi kerak.",
            'Ensure that there are no more than 2 decimal places.': "Kasr qismida ko'pi bilan 2 ta raqam bo'lishi mumkin.",
            '"x" is not a valid choice.': "Tanlangan qiymat ruxsat etilganlar ichida yo'q.",
            'Invalid pk "99" - object does not exist.': 'Tanlangan yozuv topilmadi.',
            'Unable to log in with provided credentials.': "Telefon raqami yoki parol noto'g'ri.",
            'Invalid token.': 'Sessiya yaroqsiz yoki tugagan. Qaytadan kiring.',
            'Authentication credentials were not provided.': 'Tizimga kirilmagan. Qaytadan kiring.',
            'You do not have permission to perform this action.': "Bu amalni bajarishga ruxsatingiz yo'q.",
            'Not found.': 'Topilmadi.',
            'Request was throttled. Expected available in 45 seconds.': "Juda ko'p urinish. 45 soniyadan keyin qayta urining.",
            'Request was throttled. Expected available in 1 second.': "Juda ko'p urinish. 1 soniyadan keyin qayta urining.",
            'Enter a valid IPv4 or IPv6 address.': "IP manzil noto'g'ri.",
        }
        for en, uz in cases.items():
            with self.subTest(en):
                self.assertEqual(localize_message(en), uz)

    def test_own_uzbek_messages_are_untouched(self):
        for msg in ("Kassa yopiq - yangi buyurtma qabul qilib bo'lmaydi.", "Qurilma yoki PIN noto'g'ri.", 'Tizim bloklandi.'):
            self.assertEqual(localize_message(msg), msg)


class ApiErrorResponseTests(APITestCase):
    """Real endpointlar: xabar aniq, o'zbekcha va nima xato ekanini aytadi."""

    def setUp(self):
        User.objects.create_user(username='+998901110000', password='togri-parol', first_name='M', role='manager')

    def test_wrong_password_says_phone_or_password_is_wrong(self):
        res = self.client.post('/api/auth/login/', {'username': '+998901110000', 'password': 'xato'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['detail'], "Telefon raqami yoki parol noto'g'ri.")
        self.assertEqual(res.data['fields'], {})

    def test_unknown_phone_gives_same_message_as_wrong_password(self):
        # Akkaunt bor-yo'qligini oshkor qilmaslik uchun ikkalasida bir xil xabar.
        res = self.client.post('/api/auth/login/', {'username': '+998909999999', 'password': 'xato'}, format='json')
        self.assertEqual(res.data['detail'], "Telefon raqami yoki parol noto'g'ri.")

    def test_missing_password_reports_field_error_in_uzbek(self):
        res = self.client.post('/api/auth/login/', {'username': '+998901110000'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['detail'], GENERIC_VALIDATION)
        self.assertEqual(res.data['fields'], {'password': ["Bu maydon to'ldirilishi shart."]})

    def test_unauthenticated_request_message(self):
        res = self.client.get('/api/orders/')
        self.assertIn(res.status_code, (401, 403))
        self.assertEqual(res.data['detail'], 'Tizimga kirilmagan. Qaytadan kiring.')

    def test_bad_token_message(self):
        self.client.credentials(HTTP_AUTHORIZATION='Token nomaqbul')
        res = self.client.get('/api/orders/')
        self.assertEqual(res.data['detail'], 'Sessiya yaroqsiz yoki tugagan. Qaytadan kiring.')

    def test_not_found_message(self):
        manager = User.objects.get(username='+998901110000')
        self.client.force_authenticate(manager)
        res = self.client.get('/api/orders/999999/')
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.data['detail'], 'Topilmadi.')
