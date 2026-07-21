from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token

from core.models import (
    Category, Ingredient, Notification, Order, OrderItem, Product,
    ProductIngredient, StockMovement, Supplier, Table, User,
)


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


class InventoryTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000021', role='manager')
        self.cashier = User.objects.create_user(username='+998900000022', role='cashier')
        self.supplier = Supplier.objects.create(name='Bozor ombori')
        self.category = Category.objects.create(name='Ovqatlar')
        self.product = Product.objects.create(category=self.category, name='Osh', price=Decimal('25000'))
        self.ingredient = Ingredient.objects.create(
            name="Go'sht", unit='kg', current_stock=Decimal('10'), min_stock=Decimal('5'),
        )

    # ---- Kirim (purchase) ----
    def test_purchase_increases_stock_and_cost_and_movement(self):
        url = reverse('purchase-list')
        resp = self.client.post(url, {
            'supplier_id': self.supplier.id,
            'items': [{'ingredient_id': self.ingredient.id, 'quantity': '5', 'unit_cost': '80000'}],
        }, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 201)
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.current_stock, Decimal('15'))
        self.assertEqual(self.ingredient.cost_price, Decimal('80000'))
        self.assertTrue(StockMovement.objects.filter(
            ingredient=self.ingredient, movement_type='purchase', quantity=Decimal('5')).exists())

    def test_purchase_is_manager_gated(self):
        url = reverse('purchase-list')
        resp = self.client.post(url, {
            'items': [{'ingredient_id': self.ingredient.id, 'quantity': '5'}],
        }, content_type='application/json', **_auth_header(self.cashier))
        self.assertEqual(resp.status_code, 403)

    # ---- Tuzatish (adjust) ----
    def test_adjust_absolute_new_quantity(self):
        url = reverse('ingredient-adjust', args=[self.ingredient.id])
        resp = self.client.post(url, {'new_quantity': '3', 'note': 'inventarizatsiya'},
                                content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.current_stock, Decimal('3'))
        self.assertTrue(StockMovement.objects.filter(
            ingredient=self.ingredient, movement_type='adjustment', quantity=Decimal('-7')).exists())

    def test_adjust_delta(self):
        url = reverse('ingredient-adjust', args=[self.ingredient.id])
        resp = self.client.post(url, {'delta': '2.5'},
                                content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.current_stock, Decimal('12.5'))

    def test_adjust_requires_exactly_one_of_new_or_delta(self):
        url = reverse('ingredient-adjust', args=[self.ingredient.id])
        resp = self.client.post(url, {'new_quantity': '3', 'delta': '1'},
                                content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 400)

    def test_low_stock_filter(self):
        Ingredient.objects.create(name='Tuz', unit='kg', current_stock=Decimal('1'), min_stock=Decimal('5'))
        url = reverse('ingredient-list')
        resp = self.client.get(url + '?low_stock=true', **_auth_header(self.manager))
        names = [i['name'] for i in resp.json()['results']]
        self.assertIn('Tuz', names)
        self.assertNotIn("Go'sht", names)

    # ---- Sotuvda avtomatik kamayish (consumption) ----
    def _order_with_recipe(self, recipe_qty, item_qty):
        ProductIngredient.objects.create(
            product=self.product, ingredient=self.ingredient, quantity=Decimal(recipe_qty))
        table = Table.objects.create(name='Stol 1')
        order = Order.objects.create(table=table, waiter=self.cashier, status='new')
        OrderItem.objects.create(order=order, product=self.product, quantity=item_qty, price=self.product.price)
        return order

    def test_start_consumes_recipe_ingredients(self):
        order = self._order_with_recipe(recipe_qty='2', item_qty=2)  # 2*2 = 4 kg
        url = reverse('order-start', args=[order.id])
        resp = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.current_stock, Decimal('6'))  # 10 - 4
        self.assertTrue(StockMovement.objects.filter(
            ingredient=self.ingredient, movement_type='sale', quantity=Decimal('-4'), order=order).exists())

    def test_crossing_min_stock_fires_low_stock_notification(self):
        order = self._order_with_recipe(recipe_qty='3', item_qty=2)  # 6 kg -> 10-6 = 4 < 5
        url = reverse('order-start', args=[order.id])
        self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertTrue(Notification.objects.filter(notif_type='low_stock').exists())

    def test_out_of_stock_warns_but_does_not_block_sale(self):
        self.ingredient.current_stock = Decimal('2')
        self.ingredient.save()
        order = self._order_with_recipe(recipe_qty='3', item_qty=2)  # need 6, only 2
        url = reverse('order-start', args=[order.id])
        resp = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 200)  # sotuv bloklanmaydi
        order.refresh_from_db()
        self.assertEqual(order.status, 'in_progress')
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.current_stock, Decimal('-4'))  # minusga tushadi

    def test_product_without_recipe_consumes_nothing(self):
        table = Table.objects.create(name='Stol 2')
        order = Order.objects.create(table=table, waiter=self.cashier, status='new')
        OrderItem.objects.create(order=order, product=self.product, quantity=1, price=self.product.price)
        url = reverse('order-start', args=[order.id])
        self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.current_stock, Decimal('10'))

    # ---- Retsept CRUD ----
    def test_recipe_item_create_and_filter(self):
        url = reverse('recipeitem-list')
        resp = self.client.post(url, {
            'product_id': self.product.id, 'ingredient_id': self.ingredient.id, 'quantity': '1.5',
        }, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(resp.status_code, 201)
        resp = self.client.get(url + f'?product={self.product.id}', **_auth_header(self.manager))
        results = resp.json()['results']
        self.assertEqual(len(results), 1)
        self.assertEqual(Decimal(results[0]['quantity']), Decimal('1.5'))

    def test_recipe_item_create_is_manager_gated(self):
        url = reverse('recipeitem-list')
        resp = self.client.post(url, {
            'product_id': self.product.id, 'ingredient_id': self.ingredient.id, 'quantity': '1',
        }, content_type='application/json', **_auth_header(self.cashier))
        self.assertEqual(resp.status_code, 403)
