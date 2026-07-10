from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token

from core.models import Category, Notification, Product, User


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


class ProductPriceChangeNotificationTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='+998900000080', role='manager', is_staff=True)
        self.manager = User.objects.create_user(username='+998900000081', role='manager')
        self.category = Category.objects.create(name='Taomlar')
        self.product = Product.objects.create(category=self.category, name='Osh', price=15000)

    def _patch(self, user, **data):
        url = reverse('product-detail', args=[self.product.id])
        return self.client.patch(url, data, content_type='application/json', **_auth_header(user))

    def test_manager_price_change_creates_broadcast_notification(self):
        self._patch(self.manager, price="20000")

        notification = Notification.objects.get(notif_type='price_changed')
        self.assertIsNone(notification.recipient)
        self.assertEqual(notification.payload['product_id'], self.product.id)
        self.assertEqual(notification.payload['changed_by'], self.manager.id)

    def test_admin_price_change_creates_no_notification(self):
        self._patch(self.admin, price="20000")
        self.assertFalse(Notification.objects.filter(notif_type='price_changed').exists())

    def test_manager_editing_non_price_field_creates_no_notification(self):
        self._patch(self.manager, name="Osh (yangi)")
        self.assertFalse(Notification.objects.filter(notif_type='price_changed').exists())

    def test_manager_patch_with_same_price_creates_no_notification(self):
        self._patch(self.manager, price="15000")
        self.assertFalse(Notification.objects.filter(notif_type='price_changed').exists())


class NotificationViewSetTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='+998900000090', role='manager', is_staff=True)
        self.other_admin = User.objects.create_user(username='+998900000091', role='manager', is_staff=True)
        self.waiter = User.objects.create_user(username='+998900000092', role='waiter')
        self.broadcast = Notification.objects.create(
            recipient=None, notif_type='price_changed', message='test',
        )
        self.targeted = Notification.objects.create(
            recipient=self.waiter, notif_type='custom', message='shaxsiy',
        )

    def test_admin_sees_broadcast_notifications(self):
        response = self.client.get(reverse('notification-list'), **_auth_header(self.admin))
        ids = [n['id'] for n in response.data]
        self.assertIn(self.broadcast.id, ids)

    def test_waiter_does_not_see_broadcast_meant_for_admins_only_if_targeted_elsewhere(self):
        # Bu misolda broadcast (recipient=None) barcha ADMIN uchun - oddiy
        # xodim faqat o'ziga tegishli (targeted) bildirishnomani ko'radi.
        response = self.client.get(reverse('notification-list'), **_auth_header(self.waiter))
        ids = [n['id'] for n in response.data]
        self.assertIn(self.targeted.id, ids)
        self.assertNotIn(self.broadcast.id, ids)

    def test_mark_read_updates_flags(self):
        url = reverse('notification-mark-read', args=[self.targeted.id])
        response = self.client.post(url, content_type='application/json', **_auth_header(self.waiter))

        self.assertEqual(response.status_code, 200)
        self.targeted.refresh_from_db()
        self.assertTrue(self.targeted.is_read)
        self.assertIsNotNone(self.targeted.read_at)

    def test_waiter_cannot_mark_read_someone_elses_notification(self):
        url = reverse('notification-mark-read', args=[self.targeted.id])
        response = self.client.post(url, content_type='application/json', **_auth_header(self.other_admin))
        self.assertEqual(response.status_code, 404)
