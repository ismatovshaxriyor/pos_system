from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token
from core.models import User, Table, Category, Product, Order, OrderItem, Printer, PrintJob
from core import services

def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}

class KitchenPrintingTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000101', role='manager')
        self.table = Table.objects.create(name='Stol 12')
        
        # Create Printers
        self.printer_soup = Printer.objects.create(name='Soup Printer (1)')
        self.printer_salad = Printer.objects.create(name='Salad Printer (2)')
        
        # Create Categories and link to Printers
        self.cat_soup = Category.objects.create(name='Suyuq ovqatlar', printer=self.printer_soup)
        self.cat_salad = Category.objects.create(name='Salatlar', printer=self.printer_salad)
        
        # Create Products
        self.product_shurva = Product.objects.create(category=self.cat_soup, name='Shurva', price=Decimal('20000'))
        self.product_mastava = Product.objects.create(category=self.cat_soup, name='Mastava', price=Decimal('18000'))
        self.product_achichik = Product.objects.create(category=self.cat_salad, name='Achichik-chuchuk', price=Decimal('10000'))

    def test_routing_and_grouping_on_order_start(self):
        # 1. Create order
        order = Order.objects.create(table=self.table, waiter=self.manager)
        
        # 2. Add items to order
        item1 = OrderItem.objects.create(order=order, product=self.product_shurva, quantity=2, price=self.product_shurva.price)
        item2 = OrderItem.objects.create(order=order, product=self.product_mastava, quantity=1, price=self.product_mastava.price)
        item3 = OrderItem.objects.create(order=order, product=self.product_achichik, quantity=1, price=self.product_achichik.price)
        
        # Initially, no print jobs exist and is_printed is False
        self.assertEqual(PrintJob.objects.count(), 0)
        self.assertFalse(item1.is_printed)
        
        # 3. Start the order (this triggers kitchen routing)
        url = reverse('order-start', args=[order.id])
        response = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(response.status_code, 200)
        
        # Verify PrintJobs
        # Should have created 2 print jobs (one for soup printer, one for salad printer)
        self.assertEqual(PrintJob.objects.count(), 2)
        
        # Check soup print job
        soup_job = PrintJob.objects.get(printer=self.printer_soup, order=order)
        self.assertEqual(soup_job.status, 'pending')
        # Should contain Shurva and Mastava
        names = [item['name'] for item in soup_job.items_snapshot]
        self.assertIn('Shurva', names)
        self.assertIn('Mastava', names)
        self.assertNotIn('Achichik-chuchuk', names)
        
        # Check salad print job
        salad_job = PrintJob.objects.get(printer=self.printer_salad, order=order)
        names = [item['name'] for item in salad_job.items_snapshot]
        self.assertEqual(len(names), 1)
        self.assertEqual(names[0], 'Achichik-chuchuk')
        
        # Verify items are marked as printed
        item1.refresh_from_db()
        item2.refresh_from_db()
        item3.refresh_from_db()
        self.assertTrue(item1.is_printed)
        self.assertTrue(item2.is_printed)
        self.assertTrue(item3.is_printed)

    def test_incremental_printing_on_add_item_in_progress(self):
        # 1. Create order in progress
        order = Order.objects.create(table=self.table, waiter=self.manager, status='in_progress')
        
        # Add initial item already printed
        item1 = OrderItem.objects.create(
            order=order, product=self.product_shurva, quantity=1, 
            price=self.product_shurva.price, is_printed=True
        )
        
        # 2. Add new item to in_progress order via API
        url = reverse('order-add-item', args=[order.id])
        response = self.client.post(
            url, {"product_id": self.product_achichik.id, "quantity": 3, "note": "achchiq bo'lsin"},
            content_type='application/json', **_auth_header(self.manager)
        )
        self.assertEqual(response.status_code, 201)
        
        # Verify PrintJobs
        # Should have created exactly 1 print job for the salad printer containing only the new item
        self.assertEqual(PrintJob.objects.count(), 1)
        job = PrintJob.objects.first()
        self.assertEqual(job.printer, self.printer_salad)
        self.assertEqual(len(job.items_snapshot), 1)
        self.assertEqual(job.items_snapshot[0]['name'], 'Achichik-chuchuk')
        self.assertEqual(job.items_snapshot[0]['quantity'], 3)
        self.assertEqual(job.items_snapshot[0]['note'], "achchiq bo'lsin")
        
        # The new item in DB should be marked is_printed=True
        new_item = OrderItem.objects.get(product=self.product_achichik, order=order)
        self.assertTrue(new_item.is_printed)
