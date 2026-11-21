from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token

from core.models import Category, OrderTemplate, Product, User


def _auth(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {'HTTP_AUTHORIZATION': f'Token {token.key}'}


class OrderTemplateTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000091', role='manager')
        self.waiter = User.objects.create_user(username='+998900000092', role='waiter')
        cat = Category.objects.create(name='Taomlar')
        self.osh = Product.objects.create(category=cat, name='Osh', price=Decimal('30000'))
        self.salat = Product.objects.create(category=cat, name='Salat', price=Decimal('12000'))
        self.choy = Product.objects.create(category=cat, name='Choy', price=Decimal('5000'))
        self.url = reverse('ordertemplate-list')

    def _create(self, **over):
        body = {
            'name': 'Standart', 'sort_order': 1,
            'items': [
                {'product_id': self.osh.id, 'quantity': 1},
                {'product_id': self.salat.id, 'quantity': 1},
                {'product_id': self.choy.id, 'quantity': 2, 'note': 'Limonsiz'},
            ],
            **over,
        }
        return self.client.post(self.url, body, content_type='application/json', **_auth(self.manager))

    def test_manager_creates_and_everyone_reads(self):
        resp = self._create()
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(len(resp.json()['items']), 3)
        listed = self.client.get(self.url, **_auth(self.waiter))
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()[0]['name'] if isinstance(listed.json(), list) else listed.json()['results'][0]['name'], 'Standart')

    def test_waiter_cannot_write(self):
        resp = self.client.post(
            self.url, {'name': 'X', 'items': [{'product_id': self.osh.id}]},
            content_type='application/json', **_auth(self.waiter),
        )
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(OrderTemplate.objects.count(), 0)

    def test_validation(self):
        self.assertEqual(self._create(items=[]).status_code, 400)
        self.assertEqual(self._create(name='   ').status_code, 400)
        self.assertEqual(self._create(items=[{'product_id': self.osh.id, 'quantity': 0}]).status_code, 400)
        self.assertEqual(self._create(items=[{'product_id': self.osh.id, 'quantity': 100}]).status_code, 400)
        self.assertEqual(self._create(items=[{'product_id': 99999}]).status_code, 400)
        self.assertEqual(OrderTemplate.objects.count(), 0)

    def test_deleted_product_cannot_be_added(self):
        self.choy.is_deleted = True
        self.choy.save()
        self.assertEqual(self._create().status_code, 400)

    def test_duplicate_products_are_merged(self):
        resp = self._create(items=[
            {'product_id': self.osh.id, 'quantity': 2},
            {'product_id': self.osh.id, 'quantity': 3},
            {'product_id': self.osh.id, 'quantity': 1, 'note': 'Achchiq'},
        ])
        self.assertEqual(resp.status_code, 201, resp.content)
        items = sorted(resp.json()['items'], key=lambda i: i['note'])
        self.assertEqual([(i['quantity'], i['note']) for i in items], [(5, ''), (1, 'Achchiq')])

    def test_update_replaces_items_and_patch_without_items_keeps_them(self):
        tid = self._create().json()['id']
        url = reverse('ordertemplate-detail', args=[tid])
        resp = self.client.patch(
            url, {'items': [{'product_id': self.osh.id, 'quantity': 2}]},
            content_type='application/json', **_auth(self.manager))
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual([(i['product_id'], i['quantity']) for i in resp.json()['items']], [(self.osh.id, 2)])
        resp = self.client.patch(url, {'name': 'Yangi'}, content_type='application/json', **_auth(self.manager))
        self.assertEqual(resp.json()['name'], 'Yangi')
        self.assertEqual(len(resp.json()['items']), 1)

    def test_delete(self):
        tid = self._create().json()['id']
        resp = self.client.delete(reverse('ordertemplate-detail', args=[tid]), **_auth(self.manager))
        self.assertEqual(resp.status_code, 204)
        self.assertEqual(OrderTemplate.objects.count(), 0)

    def test_bootstrap_has_only_active_templates_without_deleted_products(self):
        self._create(name='Faol')
        self._create(name='Nofaol', is_active=False)
        self.choy.is_deleted = True
        self.choy.save()
        boot = self.client.get(reverse('bootstrap'), **_auth(self.waiter)).json()
        names = [t['name'] for t in boot['order_templates']]
        self.assertEqual(names, ['Faol'])
        self.assertEqual({i['product_id'] for i in boot['order_templates'][0]['items']}, {self.osh.id, self.salat.id})

    def test_ordering_by_sort_order(self):
        self._create(name='B', sort_order=2)
        self._create(name='A', sort_order=1)
        boot = self.client.get(reverse('bootstrap'), **_auth(self.waiter)).json()
        self.assertEqual([t['name'] for t in boot['order_templates']], ['A', 'B'])

    def test_realtime_menu_changed_after_items_exist(self):
        with mock.patch('core.realtime_signals.broadcast_event') as bc:
            with self.captureOnCommitCallbacks(execute=True):
                self._create()
        self.assertIn(mock.call('menu_changed', mock.ANY), bc.call_args_list)
