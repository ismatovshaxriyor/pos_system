from rest_framework.test import APITestCase

from core.models import RestaurantConfig, User


class RestaurantConfigPrivacyTests(APITestCase):
    """Telegram bot tokeni/chat id faqat menejerga ko'rinadi; boshqa maydonlar hamma xodimga ochiq."""

    def setUp(self):
        RestaurantConfig.objects.update_or_create(
            pk=1, defaults={'name': 'Demo', 'telegram_bot_token': '123:SECRET', 'telegram_chat_id': '-1001'},
        )
        self.manager = User.objects.create_user(username='+998901110011', password='x', first_name='M', role='manager')
        self.waiter = User.objects.create_user(username='+998901110012', password='x', first_name='W', role='waiter')

    def test_manager_sees_telegram_credentials(self):
        self.client.force_authenticate(self.manager)
        data = self.client.get('/api/restaurant-config/1/').data
        self.assertEqual(data['telegram_bot_token'], '123:SECRET')
        self.assertEqual(data['telegram_chat_id'], '-1001')

    def test_waiter_does_not_see_telegram_credentials(self):
        self.client.force_authenticate(self.waiter)
        data = self.client.get('/api/restaurant-config/1/').data
        self.assertEqual(data['telegram_bot_token'], '')
        self.assertEqual(data['telegram_chat_id'], '')
        self.assertEqual(data['name'], 'Demo')

    def test_waiter_cannot_update_config(self):
        self.client.force_authenticate(self.waiter)
        res = self.client.patch('/api/restaurant-config/1/', {'name': 'Hack'}, format='json')
        self.assertEqual(res.status_code, 403)
