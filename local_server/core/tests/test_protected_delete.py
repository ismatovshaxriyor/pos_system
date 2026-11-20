from decimal import Decimal

from rest_framework.test import APITestCase

from core.models import Ingredient, Product, Category, ProductIngredient, User


class ProtectedDeleteTests(APITestCase):
    """`PROTECT` bilan bog'langan yozuvni o'chirish 500 emas, tushunarli 409 bo'lishi kerak."""

    def setUp(self):
        self.manager = User.objects.create_user(username='+998901119999', password='x', first_name='M', role='manager')
        self.client.force_authenticate(self.manager)

    def test_deleting_ingredient_used_in_recipe_returns_409(self):
        cat = Category.objects.create(name='Taom')
        product = Product.objects.create(category=cat, name='Osh', price=Decimal('30000'))
        ing = Ingredient.objects.create(name='Guruch', unit='kg')
        ProductIngredient.objects.create(product=product, ingredient=ing, quantity=Decimal('0.2'))

        res = self.client.delete(f'/api/ingredients/{ing.id}/')

        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['code'], 'protected')
        self.assertTrue(Ingredient.objects.filter(pk=ing.pk).exists())

    def test_unused_ingredient_deletes_normally(self):
        ing = Ingredient.objects.create(name='Tuz', unit='kg')
        res = self.client.delete(f'/api/ingredients/{ing.id}/')
        self.assertEqual(res.status_code, 204)
