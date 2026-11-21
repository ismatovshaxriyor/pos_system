from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token

from core.authentication import KITCHEN_SERVICE_DEVICE_ID
from core.models import StaffDevice, User


class KitchenDashboardSecurityTests(TestCase):
    """Login'siz sahifa orqali kassir tokeni olinishi mumkin emas (prod'da)."""

    @override_settings(DEBUG=False, KITCHEN_DASHBOARD_ENABLED=False)
    def test_dashboard_is_404_in_production(self):
        self.assertEqual(self.client.get('/kitchen/printers/').status_code, 404)
        self.assertFalse(User.objects.filter(username='+998000000001').exists())

    @override_settings(DEBUG=False, KITCHEN_DASHBOARD_ENABLED=True)
    def test_dashboard_can_be_enabled_explicitly(self):
        self.assertEqual(self.client.get('/kitchen/printers/').status_code, 200)

    @override_settings(DEBUG=True)
    def test_dashboard_available_in_debug(self):
        self.assertEqual(self.client.get('/kitchen/printers/').status_code, 200)

    @override_settings(DEBUG=False, KITCHEN_DASHBOARD_ENABLED=False)
    def test_previously_leaked_service_token_is_rejected(self):
        user = User.objects.create_user(username='+998000000001', role='cashier')
        StaffDevice.objects.create(user=user, device_id=KITCHEN_SERVICE_DEVICE_ID, is_active=True, is_approved=True)
        token = Token.objects.create(user=user)
        res = self.client.get('/api/orders/', HTTP_AUTHORIZATION=f'Token {token.key}',
                              HTTP_X_DEVICE_ID=KITCHEN_SERVICE_DEVICE_ID)
        self.assertIn(res.status_code, (401, 403))
