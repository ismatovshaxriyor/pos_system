from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token
from core.models import User, Table, TableZone, Category, Product, Order, OrderItem, Printer, PrintJob
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


class CashierPrintingTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000201', role='manager')
        self.table = Table.objects.create(name='Stol 5')
        self.cashier_printer = Printer.objects.create(name='Kassa Printeri', is_cashier=True)
        self.cat = Category.objects.create(name='Ovqatlar')
        self.product = Product.objects.create(category=self.cat, name='Osh', price=Decimal('30000'))

    def test_print_pre_bill_endpoint(self):
        order = Order.objects.create(table=self.table, waiter=self.manager, status='in_progress')
        OrderItem.objects.create(order=order, product=self.product, quantity=2, price=self.product.price)

        url = reverse('order-print-pre-bill', args=[order.id])
        response = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(response.status_code, 200)

        job = PrintJob.objects.filter(order=order, job_type='pre_bill').first()
        self.assertIsNotNone(job)
        self.assertEqual(job.printer, self.cashier_printer)
        self.assertEqual(job.items_snapshot['final_amount'], float(order.final_amount))

    def test_automatic_receipt_print_on_close(self):
        order = Order.objects.create(table=self.table, waiter=self.manager, status='in_progress')
        OrderItem.objects.create(order=order, product=self.product, quantity=1, price=self.product.price)

        pay_amount = order.final_amount
        pay_url = reverse('order-add-payment', args=[order.id])
        self.client.post(pay_url, {"amount": float(pay_amount), "method": "cash"}, content_type='application/json', **_auth_header(self.manager))

        close_url = reverse('order-close', args=[order.id])
        response = self.client.post(close_url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(response.status_code, 200)

        job = PrintJob.objects.filter(order=order, job_type='receipt').first()
        self.assertIsNotNone(job)
        self.assertEqual(job.printer, self.cashier_printer)
        self.assertEqual(job.items_snapshot['final_amount'], float(order.final_amount))

    def test_service_charge_rate_config(self):
        from core.models import RestaurantConfig
        config, _ = RestaurantConfig.objects.get_or_create(pk=1)
        config.service_charge_rate = Decimal('10.00')
        config.save()

        order = Order.objects.create(table=self.table, waiter=self.manager, status='in_progress')
        OrderItem.objects.create(order=order, product=self.product, quantity=2, price=Decimal('50000'))

        expected_service_charge = (order.total_amount * Decimal('0.10')).quantize(Decimal('0.01'))
        self.assertEqual(order.calculated_service_charge, expected_service_charge)

    def test_pre_bill_snapshot_includes_service_charge_rate(self):
        # Chekda foizni ko'rsatish uchun (escpos._service_charge_label)
        # snapshot 'service_charge_rate'ni ham olib yurishi kerak.
        from core.models import RestaurantConfig
        config, _ = RestaurantConfig.objects.get_or_create(pk=1)
        config.service_charge_rate = Decimal('10.00')
        config.save()

        order = Order.objects.create(table=self.table, waiter=self.manager, status='in_progress')
        OrderItem.objects.create(order=order, product=self.product, quantity=2, price=self.product.price)

        url = reverse('order-print-pre-bill', args=[order.id])
        response = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(response.status_code, 200)

        job = PrintJob.objects.filter(order=order, job_type='pre_bill').first()
        self.assertEqual(job.items_snapshot['service_charge_rate'], 10.0)

    def test_pre_bill_snapshot_service_charge_rate_zero_when_unset(self):
        order = Order.objects.create(table=self.table, waiter=self.manager, status='in_progress')
        OrderItem.objects.create(order=order, product=self.product, quantity=1, price=self.product.price)

        url = reverse('order-print-pre-bill', args=[order.id])
        self.client.post(url, content_type='application/json', **_auth_header(self.manager))

        job = PrintJob.objects.filter(order=order, job_type='pre_bill').first()
        self.assertEqual(job.items_snapshot['service_charge_rate'], 0)

    def test_pre_bill_snapshot_table_name_none_for_takeaway(self):
        # Chekda "Stol: Takeaway" kabi noqulay yozuv chiqmasligi uchun -
        # stolsiz buyurtmada snapshot table_name=None + order_type saqlaydi,
        # escpos._table_label shundan "Olib ketish" kabi tabiiy yorliq yasaydi.
        order = Order.objects.create(waiter=self.manager, status='in_progress', order_type='takeaway')
        OrderItem.objects.create(order=order, product=self.product, quantity=1, price=self.product.price)

        url = reverse('order-print-pre-bill', args=[order.id])
        self.client.post(url, content_type='application/json', **_auth_header(self.manager))

        job = PrintJob.objects.filter(order=order, job_type='pre_bill').first()
        self.assertIsNone(job.items_snapshot['table_name'])
        self.assertEqual(job.items_snapshot['order_type'], 'takeaway')

    def test_snapshot_table_name_includes_zone(self):
        # Chekda "5 (Ko'cha)" kabi ko'rinishi uchun snapshot endi bare
        # nom emas, `str(Table)` (zona bilan) saqlaydi.
        zone = TableZone.objects.create(name="Ko'cha")
        table = Table.objects.create(name='5', zone=zone)
        order = Order.objects.create(table=table, waiter=self.manager, status='in_progress')
        OrderItem.objects.create(order=order, product=self.product, quantity=1, price=self.product.price)

        url = reverse('order-print-pre-bill', args=[order.id])
        self.client.post(url, content_type='application/json', **_auth_header(self.manager))

        job = PrintJob.objects.filter(order=order, job_type='pre_bill').first()
        self.assertEqual(job.items_snapshot['table_name'], "5 (Ko'cha)")

    def test_payment_receipt_snapshot_includes_order_created_at_and_phone(self):
        from core.models import RestaurantConfig
        config, _ = RestaurantConfig.objects.get_or_create(pk=1)
        config.phone = '+998901234567'
        config.save()

        order = Order.objects.create(table=self.table, waiter=self.manager, status='in_progress')
        OrderItem.objects.create(order=order, product=self.product, quantity=1, price=self.product.price)

        pay_url = reverse('order-add-payment', args=[order.id])
        self.client.post(pay_url, {"amount": float(order.final_amount), "method": "cash"}, content_type='application/json', **_auth_header(self.manager))
        self.client.post(reverse('order-close', args=[order.id]), content_type='application/json', **_auth_header(self.manager))

        job = PrintJob.objects.filter(order=order, job_type='receipt').first()
        self.assertEqual(job.items_snapshot['order_created_at'], order.created_at.isoformat())
        self.assertEqual(job.items_snapshot['phone'], '+998901234567')



