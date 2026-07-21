from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token

from core.models import User


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


class CreateEmployeeTests(TestCase):
    """
    POST /api/users/ orqali yaratilgan xodim UserSerializer'ning
    password maydoni bo'lmagani tufayli hech qachon login qila olmasdi -
    parol jimgina tashlab yuborilar, User.password bo'sh qolar edi. Bu
    testlar aynan shu regressiyani ushlab turadi.
    """

    def setUp(self):
        self.admin = User.objects.create_user(username='+998900000090', role='manager', is_staff=True)

    def _create(self, payload):
        return self.client.post(
            reverse('user-list'), payload, content_type='application/json', **_auth_header(self.admin),
        )

    def test_creating_waiter_sets_a_working_password(self):
        response = self._create({
            'username': '+998900000091', 'first_name': 'Ali', 'last_name': 'Valiyev',
            'role': 'waiter', 'password': 'Parol12345!',
        })
        self.assertEqual(response.status_code, 201, response.data)

        user = User.objects.get(username='+998900000091')
        self.assertTrue(user.check_password('Parol12345!'))

        login = self.client.post(
            reverse('api_token_auth'),
            {'username': '+998900000091', 'password': 'Parol12345!'},
            content_type='application/json',
        )
        self.assertEqual(login.status_code, 200, login.data)

    def test_creating_manager_sets_a_working_password_and_is_staff(self):
        response = self._create({
            'username': '+998900000092', 'first_name': 'Nodira', 'last_name': 'Karimova',
            'role': 'manager', 'password': 'Parol12345!',
        })
        self.assertEqual(response.status_code, 201, response.data)

        user = User.objects.get(username='+998900000092')
        self.assertTrue(user.check_password('Parol12345!'))
        self.assertTrue(user.is_staff)

    def test_creating_waiter_without_password_is_rejected(self):
        response = self._create({
            'username': '+998900000093', 'first_name': 'Sardor', 'last_name': 'Toshpulatov',
            'role': 'waiter',
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data['fields'])

    def test_creating_cashier_with_password_is_rejected(self):
        # Kassir/afitsiant PIN+qurilma orqali kiradi - haqiqiy parol
        # o'rnatilsa DeviceTokenAuthentication'ni chetlab, /api/auth/login/
        # orqali qurilma tekshiruvisiz kirish imkoni ochilib qolardi.
        response = self._create({
            'username': '+998900000094', 'first_name': 'Bekzod', 'last_name': 'Yusupov',
            'role': 'cashier', 'password': 'Parol12345!',
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data['fields'])

    def test_creating_cashier_without_password_succeeds_with_unusable_password(self):
        response = self._create({
            'username': '+998900000095', 'first_name': 'Farangiz', 'last_name': 'Nazarova',
            'role': 'cashier',
        })
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(username='+998900000095')
        self.assertFalse(user.has_usable_password())
