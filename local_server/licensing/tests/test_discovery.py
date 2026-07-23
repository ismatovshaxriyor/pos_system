import uuid
from django.conf import settings
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from licensing.models import LicenseState


class DiscoveryViewTests(TestCase):
    def test_discovery_unactivated_server(self):
        url = reverse('api-discovery')
        response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['service'], 'pos-bola')
        self.assertEqual(data['version'], getattr(settings, 'APP_VERSION', '0.3.0'))
        self.assertFalse(data['activated'])
        self.assertIsNone(data['restaurant_id'])
        self.assertEqual(data['restaurant_name'], 'Faollashtirilmagan Server')
        self.assertFalse(data['is_blocked'])
        self.assertIn('server_time', data)


    def test_discovery_activated_server(self):
        rest_id = uuid.uuid4()
        LicenseState.objects.create(
            pk=1,
            license_key="TESTKEY123",
            restaurant_id=rest_id,
            restaurant_name="Grand Restaurant",
            activated_at=timezone.now(),
            is_blocked=False,
        )

        url = reverse('api-discovery')
        response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['service'], 'pos-bola')
        self.assertTrue(data['activated'])
        self.assertEqual(data['restaurant_id'], str(rest_id))
        self.assertEqual(data['restaurant_name'], 'Grand Restaurant')
        self.assertFalse(data['is_blocked'])

    def test_license_discovery_url_alias(self):
        url = reverse('license-discovery')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['service'], 'pos-bola')
