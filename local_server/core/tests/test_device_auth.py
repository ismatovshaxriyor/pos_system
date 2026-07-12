from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token
from core.models import User, StaffDevice

class DeviceAuthTests(TestCase):
    def setUp(self):
        self.waiter = User.objects.create_user(username='+998900000090', role='waiter')
        self.token = Token.objects.create(user=self.waiter)
        self.device = StaffDevice.objects.create(user=self.waiter, device_id='my-phone', is_active=True, is_approved=True)

    def test_authenticated_with_valid_device_header(self):
        response = self.client.get(
            reverse('user-me'),
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
            HTTP_X_DEVICE_ID='my-phone'
        )
        self.assertEqual(response.status_code, 200)

    def test_fails_with_invalid_device_header(self):
        response = self.client.get(
            reverse('user-me'),
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
            HTTP_X_DEVICE_ID='someone-elses-phone'
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("ruxsat berilmagan", response.data['detail'])

    def test_fails_with_inactive_device_header(self):
        self.device.is_active = False
        self.device.save()
        
        response = self.client.get(
            reverse('user-me'),
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
            HTTP_X_DEVICE_ID='my-phone'
        )
        self.assertEqual(response.status_code, 401)
