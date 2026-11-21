from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token

from core.models import (
    Attendance, Category, Customer, Ingredient, Printer, Product, StaffDevice, Table, TableZone, User,
)


class RealtimeSignalTests(TestCase):
    """Model yozilganda ochiq ilovalarga `*_changed` signali yuboriladi (core/realtime_signals.py)."""

    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000080', role='manager')
        self.auth = {'HTTP_AUTHORIZATION': f'Token {Token.objects.create(user=self.manager).key}'}
        patcher = mock.patch('core.realtime_signals.broadcast_event')
        self.bc = patcher.start()
        self.addCleanup(patcher.stop)

    def _events(self, fn):
        self.bc.reset_mock()
        with self.captureOnCommitCallbacks(execute=True):
            fn()
        return [c.args[0] for c in self.bc.call_args_list]

    def test_table_create_update_delete_via_api(self):
        events = self._events(lambda: self.client.post(
            reverse('table-list'), {'name': '9-stol'}, content_type='application/json', **self.auth))
        self.assertEqual(events, ['table_status_changed'])
        table = Table.objects.get(name='9-stol')
        self.bc.assert_called_with('table_status_changed', {'table_id': table.pk})

        events = self._events(lambda: self.client.patch(
            reverse('table-detail', args=[table.id]), {'name': '9A'}, content_type='application/json', **self.auth))
        self.assertEqual(events, ['table_status_changed'])
        events = self._events(lambda: self.client.delete(reverse('table-detail', args=[table.id]), **self.auth))
        self.assertEqual(events, ['table_status_changed'])

    def test_zone_menu_and_staff_models(self):
        self.assertEqual(self._events(lambda: TableZone.objects.create(name='Terrasa')), ['table_status_changed'])
        cat = None

        def make_cat():
            nonlocal cat
            cat = Category.objects.create(name='Ichimlik')

        self.assertEqual(self._events(make_cat), ['menu_changed'])
        self.assertEqual(
            self._events(lambda: Product.objects.create(name='Choy', price=Decimal('5000'), category=cat)),
            ['menu_changed'],
        )
        self.assertEqual(self._events(lambda: User.objects.create_user(username='+998900000081', role='waiter')), ['staff_changed'])

    def test_manager_screen_models(self):
        user = User.objects.create_user(username='+998900000082', role='cashier')
        self.assertEqual(self._events(lambda: Customer.objects.create(first_name='Ali', phone='+998900000083')), ['customers_changed'])
        self.assertEqual(self._events(lambda: Ingredient.objects.create(name='Un', unit='kg')), ['inventory_changed'])
        self.assertEqual(self._events(lambda: Printer.objects.create(name='Oshxona', ip_address='10.0.0.9')), ['printers_changed'])
        self.assertEqual(
            self._events(lambda: StaffDevice.objects.create(user=user, device_id='d-1', is_active=True, is_approved=True)),
            ['devices_changed'],
        )

    def test_quiet_device_login_update_does_not_broadcast(self):
        user = User.objects.create_user(username='+998900000084', role='cashier')
        device = StaffDevice.objects.create(user=user, device_id='d-2', is_active=True, is_approved=True)
        events = self._events(lambda: device.save(update_fields=['last_login_at', 'updated_at']))
        self.assertEqual(events, [])
        events = self._events(lambda: (setattr(device, 'is_active', False), device.save(update_fields=['is_active'])))
        self.assertEqual(events, ['devices_changed'])

    def test_broadcast_failure_never_breaks_the_write(self):
        self.bc.side_effect = RuntimeError('redis yo\'q')
        with self.captureOnCommitCallbacks(execute=True):
            Table.objects.create(name='Xato sinovi')
        self.assertTrue(Table.objects.filter(name='Xato sinovi').exists())

    def test_attendance_broadcasts(self):
        events = self._events(lambda: Attendance.objects.create(user=self.manager))
        self.assertEqual(events, ['attendance_changed'])
