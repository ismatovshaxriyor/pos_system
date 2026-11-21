from unittest import mock

from django.core.cache import cache
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings
from django.urls import reverse

from tenants.models import Restaurant
from .ip import client_ip


class ClientIPTests(SimpleTestCase):
    """X-Forwarded-For soxtalashtirib bo'lmasligi kerak - throttle/brute-force kaliti shu IP."""

    def test_spoofed_x_forwarded_for_is_ignored(self):
        req = RequestFactory().get('/', HTTP_X_FORWARDED_FOR='1.2.3.4', REMOTE_ADDR='10.0.0.5')
        self.assertEqual(client_ip(req), '10.0.0.5')

    def test_cloudflare_header_is_used_when_present(self):
        req = RequestFactory().get('/', HTTP_CF_CONNECTING_IP='203.0.113.9', REMOTE_ADDR='172.18.0.5')
        self.assertEqual(client_ip(req), '203.0.113.9')

    @override_settings(CLIENT_IP_HEADER='')
    def test_header_can_be_disabled(self):
        req = RequestFactory().get('/', HTTP_CF_CONNECTING_IP='203.0.113.9', REMOTE_ADDR='172.18.0.5')
        self.assertEqual(client_ip(req), '172.18.0.5')


@override_settings(LICENSE_AUTH_FAIL_LIMIT=3)
class LicenseKeyBruteForceTests(TestCase):
    def setUp(self):
        cache.clear()
        self.url = reverse('sync-heartbeat')

    def tearDown(self):
        cache.clear()

    def _bad(self, ip='198.51.100.7'):
        return self.client.post(
            self.url, {}, format='json', HTTP_AUTHORIZATION='Token XXXX-XXXX-XXXX', HTTP_CF_CONNECTING_IP=ip,
        )

    def test_locks_out_after_too_many_unknown_keys(self):
        for _ in range(3):
            self.assertEqual(self._bad().status_code, 403)
        res = self._bad()
        self.assertEqual(res.status_code, 429)

    def test_lockout_is_per_ip(self):
        for _ in range(4):
            self._bad('198.51.100.7')
        self.assertEqual(self._bad('198.51.100.8').status_code, 403)

    def test_valid_key_still_works_for_other_clients(self):
        key = Restaurant.objects.create(name='R').license.key
        for _ in range(4):
            self._bad('198.51.100.7')
        res = self.client.post(
            self.url, {}, format='json', HTTP_AUTHORIZATION=f'Token {key}', HTTP_CF_CONNECTING_IP='198.51.100.99',
        )
        self.assertEqual(res.status_code, 200)


@override_settings(ADMIN_LOGIN_MAX_ATTEMPTS=3)
class AdminLoginThrottleTests(TestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_admin_login_is_rate_limited(self):
        codes = [
            self.client.post('/admin/login/', {'username': 'x', 'password': 'y'}, HTTP_CF_CONNECTING_IP='198.51.100.1').status_code
            for _ in range(5)
        ]
        self.assertNotIn(429, codes[:3])
        self.assertEqual(codes[-1], 429)

    def test_get_is_never_limited(self):
        for _ in range(6):
            self.assertNotEqual(self.client.get('/admin/login/', HTTP_CF_CONNECTING_IP='198.51.100.2').status_code, 429)


class PublicSurfaceTests(TestCase):
    def test_swagger_hidden_outside_debug(self):
        self.assertEqual(self.client.get('/api/docs/').status_code, 404)
        self.assertEqual(self.client.get('/api/schema/').status_code, 404)

    def test_cors_is_not_allow_all(self):
        res = self.client.options('/api/sync/public/stats/', HTTP_ORIGIN='https://evil.example', HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET')
        self.assertNotIn('access-control-allow-origin', {k.lower() for k in res.headers})

    @override_settings(TELEGRAM_BOT_TOKEN='t')
    def test_demo_request_html_is_escaped_in_telegram(self):
        captured = {}

        def fake_urlopen(req, timeout=None):
            captured['body'] = req.data.decode()

        with mock.patch.dict('os.environ', {'TELEGRAM_BOT_TOKEN': 't', 'TELEGRAM_CHAT_ID': '1'}), \
                mock.patch('sync.views.urllib.request.urlopen', fake_urlopen):
            res = self.client.post('/api/sync/public/demo-request/', {
                'restaurant_name': '<a href="http://evil">Bepul</a>', 'contact_name': 'A', 'phone': '+998', 'note': '<b>x</b>',
            }, content_type='application/json')
        self.assertEqual(res.status_code, 201)
        from urllib.parse import unquote_plus
        body = unquote_plus(captured['body'])
        self.assertNotIn('<a href', body)
        self.assertIn('&lt;a href', body)
        self.assertIn('&lt;b&gt;x&lt;/b&gt;', body)

    def test_demo_note_length_capped(self):
        res = self.client.post('/api/sync/public/demo-request/', {
            'restaurant_name': 'R', 'contact_name': 'A', 'phone': '+998', 'note': 'x' * 2001,
        }, content_type='application/json')
        self.assertEqual(res.status_code, 400)
