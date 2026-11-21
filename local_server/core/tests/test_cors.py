from django.test import TestCase


class CorsPolicyTests(TestCase):
    """CORS faqat kassir ilovasi (Electron) origin'lariga ochiq, begona saytlarga emas."""

    def _preflight(self, origin):
        return self.client.options(
            '/api/discovery/', HTTP_ORIGIN=origin, HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='authorization,x-device-id', HTTP_HOST='localhost',
        )

    def test_foreign_site_is_not_allowed(self):
        res = self._preflight('https://evil.example')
        self.assertNotIn('access-control-allow-origin', {k.lower() for k in res.headers})

    def test_electron_prod_origin_is_allowed(self):
        self.assertEqual(self._preflight('null').headers.get('access-control-allow-origin'), 'null')

    def test_electron_dev_origin_is_allowed(self):
        origin = 'http://localhost:5173'
        res = self._preflight(origin)
        self.assertEqual(res.headers.get('access-control-allow-origin'), origin)
        self.assertIn('x-device-id', res.headers.get('access-control-allow-headers', '').lower())
