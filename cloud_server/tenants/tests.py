from datetime import timedelta

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.contrib.auth import get_user_model
from django.contrib import messages as django_messages
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .models import Restaurant, RestaurantAdminAccount, License, ErrorLog

User = get_user_model()


def _generate_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


PRIVATE_PEM, PUBLIC_PEM = _generate_keypair()


class RestaurantAdminMandatoryAccountTests(TestCase):
    """
    Ona admin panelida restoran yaratishda bosh menejer hisobini kiritish
    majburiy bo'lishi kerak (RestaurantAdminAccountInline min_num=1).
    """

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='ona_admin', email='ona@example.com', password='pass12345',
        )
        self.client.force_login(self.superuser)
        self.add_url = reverse('admin:tenants_restaurant_add')

    def _inline_management_data(self, total_forms=1, initial_forms=0):
        return {
            'admin_account-TOTAL_FORMS': str(total_forms),
            'admin_account-INITIAL_FORMS': str(initial_forms),
            'admin_account-MIN_NUM_FORMS': '1',
            'admin_account-MAX_NUM_FORMS': '1',
            'status-TOTAL_FORMS': '0',
            'status-INITIAL_FORMS': '0',
            'status-MIN_NUM_FORMS': '0',
            'status-MAX_NUM_FORMS': '1',
        }

    def test_creating_restaurant_without_admin_inline_is_rejected(self):
        data = {
            'name': "Yangi Restoran",
            'address': '', 'contact_info': '', 'is_active': 'on',
            'desired_version': '',
            'admin_account-0-phone': '', 'admin_account-0-full_name': '',
            'admin_account-0-password': '', 'admin_account-0-id': '',
            **self._inline_management_data(),
        }
        response = self.client.post(self.add_url, data)

        self.assertEqual(response.status_code, 200)  # re-renders form with errors, no redirect
        self.assertFalse(Restaurant.objects.filter(name="Yangi Restoran").exists())

    def test_creating_restaurant_with_admin_inline_succeeds(self):
        data = {
            'name': "Yangi Restoran",
            'address': '', 'contact_info': '', 'is_active': 'on',
            'desired_version': '',
            'admin_account-0-phone': '+998911112233',
            'admin_account-0-full_name': 'Aziz Aliyev',
            'admin_account-0-password': 'Kuchli-Parol-1',
            'admin_account-0-id': '',
            **self._inline_management_data(),
        }
        response = self.client.post(self.add_url, data)

        self.assertEqual(response.status_code, 302)  # redirect on success
        restaurant = Restaurant.objects.get(name="Yangi Restoran")
        account = RestaurantAdminAccount.objects.get(restaurant=restaurant)
        self.assertEqual(account.phone, '+998911112233')
        self.assertTrue(account.password_hash)


@override_settings(LICENSE_PRIVATE_KEY=PRIVATE_PEM, LICENSE_TOKEN_TTL_DAYS=7)
class GenerateOfflineTokenActionTests(TestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='ona_admin2', email='ona2@example.com', password='pass12345',
        )
        self.client.force_login(self.superuser)
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.license = self.restaurant.license  # auto-created by post_save signal
        self.license.hardware_hash = "a" * 64
        self.license.expires_at = timezone.now() + timedelta(days=30)
        self.license.save()
        self.changelist_url = reverse('admin:tenants_license_changelist')

    def _run_action(self):
        return self.client.post(self.changelist_url, {
            'action': 'generate_offline_token',
            '_selected_action': [str(self.license.pk)],
        }, follow=True)

    def test_generates_verifiable_token_for_bound_license(self):
        response = self._run_action()

        messages = list(response.context['messages'])
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0].level, django_messages.SUCCESS)

        # Extract the token (last line of the message) and verify it's a
        # real, correctly-signed token for this license's hardware.
        token = messages[0].message.strip().splitlines()[-1]
        payload = jwt.decode(token, PUBLIC_PEM, algorithms=["RS256"], issuer="pos-ona")
        self.assertEqual(payload['hw'], "a" * 64)
        self.assertEqual(payload['license_id'], str(self.license.id))

    def test_refuses_when_hardware_not_bound(self):
        self.license.hardware_hash = ''
        self.license.save()

        response = self._run_action()

        messages = list(response.context['messages'])
        self.assertEqual(messages[0].level, django_messages.WARNING)

    def test_refuses_when_license_expired(self):
        self.license.expires_at = timezone.now() - timedelta(days=1)
        self.license.save()

        response = self._run_action()

        messages = list(response.context['messages'])
        self.assertEqual(messages[0].level, django_messages.ERROR)


class ErrorLogAdminActionTests(TestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='ona_admin3', email='ona3@example.com', password='pass12345',
        )
        self.client.force_login(self.superuser)
        self.restaurant = Restaurant.objects.create(name="Test Restoran")
        self.error_log = ErrorLog.objects.create(
            id='11111111-1111-1111-1111-111111111111',
            restaurant=self.restaurant, level='ERROR', message="xato",
            occurred_at=timezone.now(), received_at=timezone.now(),
        )
        self.changelist_url = reverse('admin:tenants_errorlog_changelist')

    def _run_action(self, action):
        return self.client.post(self.changelist_url, {
            'action': action,
            '_selected_action': [str(self.error_log.pk)],
        }, follow=True)

    def test_mark_resolved_action_sets_fields_and_user(self):
        self._run_action('mark_resolved')

        self.error_log.refresh_from_db()
        self.assertTrue(self.error_log.is_resolved)
        self.assertIsNotNone(self.error_log.resolved_at)
        self.assertEqual(self.error_log.resolved_by, self.superuser)

    def test_mark_unresolved_action_clears_fields(self):
        self.error_log.is_resolved = True
        self.error_log.resolved_at = timezone.now()
        self.error_log.resolved_by = self.superuser
        self.error_log.save()

        self._run_action('mark_unresolved')

        self.error_log.refresh_from_db()
        self.assertFalse(self.error_log.is_resolved)
        self.assertIsNone(self.error_log.resolved_at)
        self.assertIsNone(self.error_log.resolved_by)

    def test_has_add_permission_is_false(self):
        response = self.client.get(reverse('admin:tenants_errorlog_add'))
        self.assertEqual(response.status_code, 403)
