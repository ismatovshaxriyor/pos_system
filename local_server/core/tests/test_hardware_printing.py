"""
Jismoniy (IP'li) ESC/POS printer oqimi: dispatch (send_order_to_kitchen ->
on_commit -> celery), print_job_to_printer task holatlari, sweep va
/api/printers/<id>/test-print/ action.
"""
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token

from core import tasks
from core.models import (
    User, Table, Category, Product, Order, OrderItem, Printer, PrintJob, Notification,
)
from core.services import ServiceError


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


def _make_job(printer, order):
    return PrintJob.objects.create(
        printer=printer, order=order,
        items_snapshot=[{'name': "Lag'mon", 'quantity': 1, 'note': '', 'modifiers': {}}],
    )


class HardwarePrintingBase(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000201', role='manager')
        self.table = Table.objects.create(name='Stol 1')
        self.network_printer = Printer.objects.create(name='Oshxona', ip_address='192.0.2.10')
        self.virtual_printer = Printer.objects.create(name='Virtual ekran')
        self.cat_net = Category.objects.create(name='Taomlar', printer=self.network_printer)
        self.product_net = Product.objects.create(
            category=self.cat_net, name="Lag'mon", price=Decimal('30000'),
        )


class PrinterIPValidationTests(HardwarePrintingBase):
    """
    `ip_address` cheklanmagan bo'lsa, `test-print`/oddiy chop etish oqimi
    (`escpos.send_tcp`) istalgan xodim ko'rsatgan manzilga TCP ulanadi -
    Docker'ning ichki xizmat nomlari (masalan "redis") yoki ochiq internet
    manzillariga SSRF vektori. Faqat LAN private IP qabul qilinishi kerak.
    """
    def _create(self, ip_address):
        url = reverse('printer-list')
        return self.client.post(
            url, {"name": "Yangi printer", "ip_address": ip_address},
            content_type='application/json', **_auth_header(self.manager),
        )

    def test_docker_service_hostname_rejected(self):
        response = self._create("redis")
        self.assertEqual(response.status_code, 400)

    def test_public_ip_rejected(self):
        response = self._create("8.8.8.8")
        self.assertEqual(response.status_code, 400)

    def test_loopback_rejected(self):
        response = self._create("127.0.0.1")
        self.assertEqual(response.status_code, 400)

    def test_link_local_rejected(self):
        response = self._create("169.254.1.5")
        self.assertEqual(response.status_code, 400)

    def test_private_lan_ip_accepted(self):
        response = self._create("192.168.1.50")
        self.assertEqual(response.status_code, 201, response.content)

    def test_blank_ip_accepted_virtual_printer(self):
        url = reverse('printer-list')
        response = self.client.post(
            url, {"name": "Virtual printer", "ip_address": ""},
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(response.status_code, 201, response.content)


class PrinterDuplicateIPTests(HardwarePrintingBase):
    """
    Ikki `Printer` bir xil IP bilan saqlanishi taqiqlanadi - aks holda bitta
    jismoniy qurilma buyurtmadagi har bir kategoriya-guruh uchun alohida
    PrintJob oladi va ketma-ket bir necha marta chek chiqarib tashlaydi
    (real holatda 5 ta printerga bitta IP kiritilib qolgani shu sabab
    muammo edi - `Printer.clean()`/`PrinterSerializer.validate()`).
    """
    def test_duplicate_ip_rejected_via_api(self):
        url = reverse('printer-list')
        response = self.client.post(
            url, {"name": "Ikkinchi oshxona", "ip_address": self.network_printer.ip_address},
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(response.status_code, 400, response.content)

    def test_duplicate_ip_rejected_at_model_level(self):
        dup = Printer(name='Nusxa', ip_address=self.network_printer.ip_address)
        with self.assertRaises(ValidationError):
            dup.full_clean()

    def test_saving_printer_without_ip_change_does_not_conflict_with_itself(self):
        self.network_printer.name = 'Oshxona (yangilangan)'
        self.network_printer.full_clean()
        self.network_printer.save()
        self.network_printer.refresh_from_db()
        self.assertEqual(self.network_printer.name, 'Oshxona (yangilangan)')


@override_settings(PRINTER_IP_POOL_START='10.0.0.1', PRINTER_IP_POOL_END='10.0.0.3')
class PrinterAutoIPAssignmentTests(HardwarePrintingBase):
    """
    `mac_address` kiritilib `ip_address` bo'sh qoldirilsa, `Printer.save()`
    `services.assign_next_printer_ip()` orqali PRINTER_IP_POOL diapazonidan
    bo'sh manzilni o'zi tanlaydi - bir nechta printerga qo'lda bir xil IP
    kiritilib qolish xatosi shu bilan oldini olinadi.
    """
    def test_assigns_first_free_ip_from_pool(self):
        printer = Printer.objects.create(name='Bar', mac_address='AA:BB:CC:DD:EE:01')
        self.assertEqual(printer.ip_address, '10.0.0.1')

    def test_skips_already_used_ip_in_pool(self):
        Printer.objects.create(name='Boshqa', ip_address='10.0.0.1')
        printer = Printer.objects.create(name='Dessert', mac_address='AA:BB:CC:DD:EE:02')
        self.assertEqual(printer.ip_address, '10.0.0.2')

    def test_explicit_ip_not_overridden_even_with_mac(self):
        printer = Printer.objects.create(
            name='Salqin', mac_address='AA:BB:CC:DD:EE:03', ip_address='10.0.0.3',
        )
        self.assertEqual(printer.ip_address, '10.0.0.3')

    def test_pool_exhausted_raises_clear_error(self):
        Printer.objects.create(name='P1', ip_address='10.0.0.1')
        Printer.objects.create(name='P2', ip_address='10.0.0.2')
        Printer.objects.create(name='P3', ip_address='10.0.0.3')
        with self.assertRaises(ServiceError):
            Printer.objects.create(name='P4', mac_address='AA:BB:CC:DD:EE:04')


class DispatchTests(HardwarePrintingBase):
    def test_start_dispatches_network_job_after_commit(self):
        order = Order.objects.create(table=self.table, waiter=self.manager)
        OrderItem.objects.create(
            order=order, product=self.product_net, quantity=1, price=self.product_net.price,
        )
        url = reverse('order-start', args=[order.id])
        with mock.patch.object(tasks.print_job_to_printer, 'delay') as delay:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(response.status_code, 200)
        job = PrintJob.objects.get(order=order, printer=self.network_printer)
        delay.assert_called_once_with(job.id)

    def test_virtual_printer_job_not_dispatched(self):
        cat_virtual = Category.objects.create(name='Ichimliklar', printer=self.virtual_printer)
        product = Product.objects.create(category=cat_virtual, name='Choy', price=Decimal('5000'))
        order = Order.objects.create(table=self.table, waiter=self.manager)
        OrderItem.objects.create(order=order, product=product, quantity=1, price=product.price)
        url = reverse('order-start', args=[order.id])
        with mock.patch.object(tasks.print_job_to_printer, 'delay') as delay:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(PrintJob.objects.filter(order=order).count(), 1)
        delay.assert_not_called()


class PrintTaskTests(HardwarePrintingBase):
    def _pending_job(self):
        order = Order.objects.create(table=self.table, waiter=self.manager)
        return _make_job(self.network_printer, order)

    def test_success_marks_printed_and_sends_escpos(self):
        job = self._pending_job()
        with mock.patch('core.tasks.escpos.send_tcp') as send:
            result = tasks.print_job_to_printer.apply(args=[job.id])
        self.assertEqual(result.result, 'printed')
        job.refresh_from_db()
        self.assertEqual(job.status, 'printed')
        send.assert_called_once()
        host, port, payload = send.call_args.args[:3]
        self.assertEqual(host, '192.0.2.10')
        self.assertEqual(port, 9100)
        self.assertIn(b"Lag'mon", payload)
        self.assertIsNone(cache.get(f'print_job_lock:{job.id}'))

    def test_transient_connection_error_retries_then_prints(self):
        # Eager (test) rejimda celery retry zanjirini darhol sinxron bajaradi:
        # 1-urinish OSError, 2-urinish muvaffaqiyat - qulf har urinishdan oldin
        # bo'shatilgan bo'lishi shart, aks holda 2-urinish 'locked' bo'lardi.
        job = self._pending_job()
        with mock.patch('core.tasks.escpos.send_tcp', side_effect=[OSError('refused'), None]) as send:
            result = tasks.print_job_to_printer.apply(args=[job.id])
        self.assertEqual(result.result, 'printed')
        self.assertEqual(send.call_count, 2)
        job.refresh_from_db()
        self.assertEqual(job.status, 'printed')
        self.assertIsNone(cache.get(f'print_job_lock:{job.id}'))

    def test_final_failure_marks_failed_and_notifies_managers(self):
        job = self._pending_job()
        with mock.patch('core.tasks.escpos.send_tcp', side_effect=OSError('refused')), \
                mock.patch.object(tasks.print_job_to_printer, 'max_retries', 0):
            result = tasks.print_job_to_printer.apply(args=[job.id])
        self.assertEqual(result.result, 'failed')
        job.refresh_from_db()
        self.assertEqual(job.status, 'failed')
        notif = Notification.objects.filter(notif_type='print_failed').first()
        self.assertIsNotNone(notif)
        self.assertIsNone(notif.recipient)  # barcha menejerlarga broadcast
        self.assertEqual(notif.payload['job_id'], job.id)

    def test_skips_non_pending_job(self):
        job = self._pending_job()
        job.status = 'printed'
        job.save(update_fields=['status'])
        with mock.patch('core.tasks.escpos.send_tcp') as send:
            result = tasks.print_job_to_printer.apply(args=[job.id])
        self.assertEqual(result.result, 'skip:printed')
        send.assert_not_called()

    def test_concurrent_lock_skips(self):
        job = self._pending_job()
        cache.add(f'print_job_lock:{job.id}', 1, timeout=60)
        try:
            with mock.patch('core.tasks.escpos.send_tcp') as send:
                result = tasks.print_job_to_printer.apply(args=[job.id])
            self.assertEqual(result.result, 'locked')
            send.assert_not_called()
        finally:
            cache.delete(f'print_job_lock:{job.id}')


class SweepTests(HardwarePrintingBase):
    def _aged_job(self, printer, minutes):
        order = Order.objects.create(table=self.table, waiter=self.manager)
        job = _make_job(printer, order)
        PrintJob.objects.filter(pk=job.pk).update(created_at=timezone.now() - timedelta(minutes=minutes))
        return job

    def test_resends_stale_fails_ancient_ignores_fresh_and_virtual(self):
        stale = self._aged_job(self.network_printer, 5)
        ancient = self._aged_job(self.network_printer, 45)
        fresh = _make_job(self.network_printer, Order.objects.create(table=self.table, waiter=self.manager))
        virtual_stale = self._aged_job(self.virtual_printer, 45)

        with mock.patch.object(tasks.print_job_to_printer, 'delay') as delay:
            summary = tasks.sweep_stale_print_jobs.apply().result

        self.assertEqual(summary, {'resent': 1, 'failed': 1})
        delay.assert_called_once_with(stale.id)
        ancient.refresh_from_db()
        self.assertEqual(ancient.status, 'failed')
        fresh.refresh_from_db()
        self.assertEqual(fresh.status, 'pending')
        virtual_stale.refresh_from_db()
        self.assertEqual(virtual_stale.status, 'pending')


class TestPrintActionTests(HardwarePrintingBase):
    def test_virtual_printer_returns_400(self):
        url = reverse('printer-test-print', args=[self.virtual_printer.id])
        response = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(response.status_code, 400)

    def test_success_sends_test_ticket(self):
        url = reverse('printer-test-print', args=[self.network_printer.id])
        with mock.patch('core.views.escpos.send_tcp') as send:
            response = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(response.status_code, 200)
        send.assert_called_once()
        host, port, payload = send.call_args.args[:3]
        self.assertEqual((host, port), ('192.0.2.10', 9100))
        self.assertIn(b'TEST CHEK', payload)

    def test_unreachable_printer_returns_502(self):
        url = reverse('printer-test-print', args=[self.network_printer.id])
        with mock.patch('core.views.escpos.send_tcp', side_effect=OSError('timeout')):
            response = self.client.post(url, content_type='application/json', **_auth_header(self.manager))
        self.assertEqual(response.status_code, 502)
