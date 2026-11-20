from rest_framework.test import APITestCase

from core.models import Printer, User


class PrinterApiFieldsTests(APITestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='+998901110021', password='x', first_name='M', role='manager')
        self.client.force_authenticate(self.manager)

    def test_is_cashier_is_readable_and_writable(self):
        res = self.client.post('/api/printers/', {'name': 'Kassa', 'is_cashier': True}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data['is_cashier'])
        self.assertTrue(Printer.objects.get(pk=res.data['id']).is_cashier)

    def test_print_job_exposes_job_type(self):
        from core.models import Order, PrintJob
        printer = Printer.objects.create(name='Oshxona')
        order = Order.objects.create(order_type='takeaway')
        PrintJob.objects.create(printer=printer, order=order, job_type='receipt', items_snapshot=[])
        res = self.client.get('/api/print-jobs/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['results'][0]['job_type'], 'receipt')
