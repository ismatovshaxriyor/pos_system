from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token

from core.models import User
from licensing.models import LicenseState


@override_settings(LICENSE_ENFORCEMENT=False)
class StatusPrivacyTests(TestCase):
    """Ommaviy endpointlar minimal ma'lumot beradi; token muddatlari faqat menejer/admin'ga."""

    def setUp(self):
        LicenseState.objects.update_or_create(
            pk=1, defaults={'restaurant_name': 'R', 'activated_at': timezone.now(), 'token_expires_at': timezone.now()},
        )
        self.manager = User.objects.create_user(username='+998900000301', role='manager', is_staff=True)
        self.waiter = User.objects.create_user(username='+998900000302', role='waiter')
        self.mt = Token.objects.create(user=self.manager)
        self.wt = Token.objects.create(user=self.waiter)

    def _get(self, token=None):
        kw = {'HTTP_HOST': 'localhost'}
        if token:
            kw['HTTP_AUTHORIZATION'] = f'Token {token.key}'
        return self.client.get('/api/license/status/', **kw).json()

    def test_anonymous_gets_only_minimal_fields(self):
        data = self._get()
        self.assertEqual(set(data), {'activated', 'restaurant_name', 'is_blocked', 'server_time'})

    def test_waiter_does_not_get_license_timing(self):
        self.assertNotIn('token_expires_at', self._get(self.wt))

    def test_manager_gets_full_details(self):
        data = self._get(self.mt)
        for key in ('token_expires_at', 'furthest_token_expiry', 'pending_tokens_count', 'blocked_reason'):
            self.assertIn(key, data)

    def test_bad_token_falls_back_to_minimal_not_error(self):
        res = self.client.get('/api/license/status/', HTTP_HOST='localhost', HTTP_AUTHORIZATION='Token nope')
        self.assertEqual(res.status_code, 200)
        self.assertNotIn('token_expires_at', res.json())

    def test_discovery_does_not_leak_version(self):
        data = self.client.get('/api/discovery/', HTTP_HOST='localhost').json()
        self.assertNotIn('version', data)
        self.assertEqual(data['service'], 'pos-bola')
