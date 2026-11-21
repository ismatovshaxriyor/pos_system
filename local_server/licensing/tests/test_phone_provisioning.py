from django.test import TestCase

from core.models import User
from core.phone import normalize_phone
from licensing.views import _provision_admin_user


class PhoneProvisioningTests(TestCase):
    def test_normalize_variants(self):
        for raw in ('901234567', '998901234567', '+998901234567', '+998 90 123 45 67'):
            self.assertEqual(normalize_phone(raw), '+998901234567', raw)
        self.assertEqual(normalize_phone('admin'), 'admin')

    def test_provision_uses_canonical_username(self):
        """Ona'da `901234567` kiritilsa ham, ilova yuboradigan `+998901234567` bilan kirish mumkin bo'lsin."""
        _provision_admin_user({'phone': '901234567', 'full_name': 'Ali', 'password_hash': 'pbkdf2_sha256$1$x$y'})
        self.assertTrue(User.objects.filter(username='+998901234567', role='manager').exists())
        self.assertFalse(User.objects.filter(username='901234567').exists())

    def test_reprovision_does_not_duplicate(self):
        for phone in ('901234567', '+998901234567'):
            _provision_admin_user({'phone': phone, 'full_name': 'Ali', 'password_hash': 'pbkdf2_sha256$1$x$y'})
        self.assertEqual(User.objects.filter(username='+998901234567').count(), 1)

    def test_user_save_normalizes(self):
        u = User.objects.create(username='998901234568', role='waiter')
        self.assertEqual(u.username, '+998901234568')
