import unittest.mock as mock
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token

from core import tasks
from core.models import (
    Category, Customer, DebtTransaction, Order, OrderItem, Payment, Product, RestaurantConfig,
    Table, User,
)


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


class QarzDaftarTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='+998900000011', role='manager')
        self.cashier = User.objects.create_user(username='+998900000012', role='cashier')
        self.waiter = User.objects.create_user(username='+998900000013', role='waiter')
        self.category = Category.objects.create(name='Ovqatlar')
        self.product = Product.objects.create(category=self.category, name='Osh', price=Decimal('30000'))
        self.table = Table.objects.create(name='Stol 1')
        self.customer = Customer.objects.create(first_name='Ali', last_name='Valiyev', phone='+998901112233')

        self.order = Order.objects.create(table=self.table, waiter=self.cashier, status='in_progress')
        OrderItem.objects.create(order=self.order, product=self.product, quantity=1, price=self.product.price)

        self.multiplier_patcher = mock.patch("core.services._decode_multiplier", return_value=1.0)
        self.multiplier_patcher.start()
        self.addCleanup(self.multiplier_patcher.stop)

    def test_close_on_credit_records_debt(self):
        url = reverse('order-close-on-credit', args=[self.order.id])
        resp = self.client.post(
            url, {'customer_id': self.customer.id},
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(resp.status_code, 200)
        self.order.refresh_from_db()
        self.customer.refresh_from_db()
        self.assertEqual(self.order.status, 'completed')
        self.assertEqual(self.order.customer_id, self.customer.id)
        self.assertEqual(self.customer.balance, Decimal('30000'))
        txn = DebtTransaction.objects.get(customer=self.customer, txn_type='credit_sale')
        self.assertEqual(txn.amount, Decimal('30000'))
        self.assertEqual(txn.order_id, self.order.id)
        self.assertIsNone(txn.due_date)  # kiritilmagan bo'lsa muddatsiz qoladi

    def test_close_on_credit_saves_due_date_when_provided(self):
        url = reverse('order-close-on-credit', args=[self.order.id])
        resp = self.client.post(
            url, {'customer_id': self.customer.id, 'due_date': '2026-08-15'},
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(resp.status_code, 200)
        txn = DebtTransaction.objects.get(customer=self.customer, txn_type='credit_sale')
        self.assertEqual(str(txn.due_date), '2026-08-15')

    def test_close_on_credit_dispatches_telegram_alert_after_commit(self):
        # Telegram xabari `select_for_update()` qulfi ichida emas, balki
        # tranzaksiya commit bo'lgandan KEYIN Celery'ga topshirilishi kerak -
        # aks holda sekin/ishlamay qolgan Telegram boshqa kassa terminalini
        # shu buyurtma/mijoz qatorida bloklab qo'yadi.
        url = reverse('order-close-on-credit', args=[self.order.id])
        with mock.patch.object(tasks.send_telegram_notification_task, 'delay') as delay:
            with self.captureOnCommitCallbacks(execute=True):
                resp = self.client.post(
                    url, {'customer_id': self.customer.id},
                    content_type='application/json', **_auth_header(self.manager),
                )
        self.assertEqual(resp.status_code, 200)
        delay.assert_called_once()
        (message,), _ = delay.call_args
        self.assertIn('YANGI QARZ', message)
        self.assertIn('Ali', message)
        self.assertIn(f"#{self.order.id}", message)
        self.assertIn('Kiritilmagan', message)  # due_date berilmagan

    def test_close_on_credit_telegram_alert_includes_due_date_when_provided(self):
        url = reverse('order-close-on-credit', args=[self.order.id])
        with mock.patch.object(tasks.send_telegram_notification_task, 'delay') as delay:
            with self.captureOnCommitCallbacks(execute=True):
                resp = self.client.post(
                    url, {'customer_id': self.customer.id, 'due_date': '2026-08-15'},
                    content_type='application/json', **_auth_header(self.manager),
                )
        self.assertEqual(resp.status_code, 200)
        (message,), _ = delay.call_args
        self.assertIn('15.08.2026', message)

    def test_close_on_credit_after_partial_payment_only_debits_remainder(self):
        Payment.objects.create(order=self.order, amount=Decimal('10000'), received_by=self.cashier)
        url = reverse('order-close-on-credit', args=[self.order.id])
        resp = self.client.post(
            url, {'customer_id': self.customer.id},
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(resp.status_code, 200)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal('20000'))

    def test_close_on_credit_allowed_for_cashier(self):
        url = reverse('order-close-on-credit', args=[self.order.id])
        resp = self.client.post(
            url, {'customer_id': self.customer.id},
            content_type='application/json', **_auth_header(self.cashier),
        )
        self.assertEqual(resp.status_code, 200)

    def test_close_on_credit_forbidden_for_waiter(self):
        url = reverse('order-close-on-credit', args=[self.order.id])
        resp = self.client.post(
            url, {'customer_id': self.customer.id},
            content_type='application/json', **_auth_header(self.waiter),
        )
        self.assertEqual(resp.status_code, 403)

    def test_close_on_credit_rejects_fully_paid_order(self):
        Payment.objects.create(order=self.order, amount=Decimal('30000'), received_by=self.cashier)
        url = reverse('order-close-on-credit', args=[self.order.id])
        resp = self.client.post(
            url, {'customer_id': self.customer.id},
            content_type='application/json', **_auth_header(self.manager),
        )
        self.assertEqual(resp.status_code, 400)

    def test_repay_reduces_balance(self):
        self.customer.balance = Decimal('30000')
        self.customer.save()
        url = reverse('customer-repay', args=[self.customer.id])
        resp = self.client.post(
            url, {'amount': '12000', 'method': 'cash'},
            content_type='application/json', **_auth_header(self.cashier),
        )
        self.assertEqual(resp.status_code, 200)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal('18000'))
        self.assertTrue(
            DebtTransaction.objects.filter(customer=self.customer, txn_type='repayment', amount=Decimal('-12000')).exists()
        )

    def test_repay_dispatches_telegram_alert_after_commit(self):
        self.customer.balance = Decimal('30000')
        self.customer.save()
        url = reverse('customer-repay', args=[self.customer.id])
        with mock.patch.object(tasks.send_telegram_notification_task, 'delay') as delay:
            with self.captureOnCommitCallbacks(execute=True):
                resp = self.client.post(
                    url, {'amount': '12000', 'method': 'cash'},
                    content_type='application/json', **_auth_header(self.cashier),
                )
        self.assertEqual(resp.status_code, 200)
        delay.assert_called_once()
        (message,), _ = delay.call_args
        self.assertIn("QARZ TO'LANDI", message)
        self.assertIn('Ali', message)

    def test_repay_rejects_overpayment(self):
        self.customer.balance = Decimal('10000')
        self.customer.save()
        url = reverse('customer-repay', args=[self.customer.id])
        resp = self.client.post(
            url, {'amount': '15000'},
            content_type='application/json', **_auth_header(self.cashier),
        )
        self.assertEqual(resp.status_code, 400)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal('10000'))

    def test_customer_create_allowed_for_cashier(self):
        url = reverse('customer-list')
        resp = self.client.post(
            url, {'first_name': 'Yangi', 'phone': '+998907778899'},
            content_type='application/json', **_auth_header(self.cashier),
        )
        self.assertEqual(resp.status_code, 201)

    def test_customer_create_forbidden_for_waiter(self):
        url = reverse('customer-list')
        resp = self.client.post(
            url, {'first_name': 'Yangi', 'phone': '+998907778899'},
            content_type='application/json', **_auth_header(self.waiter),
        )
        self.assertEqual(resp.status_code, 403)

    def test_has_debt_filter(self):
        self.customer.balance = Decimal('5000')
        self.customer.save()
        Customer.objects.create(first_name='Nol', balance=Decimal('0'))
        url = reverse('customer-list')
        resp = self.client.get(url + '?has_debt=true', **_auth_header(self.manager))
        names = [c['first_name'] for c in resp.json()['results']]
        self.assertIn('Ali', names)
        self.assertNotIn('Nol', names)

    def test_waiter_cannot_read_customer_list(self):
        # Qarz balansi/PII afitsiantdan yopiq - IsManagerOrAdmin SAFE metodlarni
        # afitsiantga ochib qo'yardi, IsCashierOrManager esa yopadi.
        resp = self.client.get(reverse('customer-list'), **_auth_header(self.waiter))
        self.assertEqual(resp.status_code, 403)

    def test_waiter_cannot_read_debt_transactions(self):
        resp = self.client.get(
            reverse('customer-transactions', args=[self.customer.id]), **_auth_header(self.waiter),
        )
        self.assertEqual(resp.status_code, 403)

    def test_cashier_can_read_customer_list(self):
        # Kassir qarz to'lovini qabul qilishi uchun mijozni topa olishi kerak.
        resp = self.client.get(reverse('customer-list'), **_auth_header(self.cashier))
        self.assertEqual(resp.status_code, 200)

    def test_customer_destroy_allowed_for_cashier(self):
        # Kassir menejer bilan teng huquqli - o'chirish ham mumkin.
        resp = self.client.delete(
            reverse('customer-detail', args=[self.customer.id]), **_auth_header(self.cashier),
        )
        self.assertEqual(resp.status_code, 204)

    def test_customer_destroy_forbidden_for_waiter(self):
        resp = self.client.delete(
            reverse('customer-detail', args=[self.customer.id]), **_auth_header(self.waiter),
        )
        self.assertEqual(resp.status_code, 403)


class TelegramDebtAlertTests(TestCase):
    """
    `services.send_telegram_notification` faqat `RestaurantConfig`dagi
    telegram_bot_token/chat_id ni ishlatishi kerak - `licensing.LicenseState`
    dagi maydonlar Ona tomonidan sozlanadigan tizim xatoligi ("fail-safe")
    kanaliga tegishli va mijoz PII/qarz ma'lumotlarini o'sha kanalga
    tushirib yubormasligi kerak (endi qasddan fallback qilinmaydi).
    """

    def test_no_config_skips_send(self):
        from core import services

        with mock.patch('requests.post') as post:
            sent = services.send_telegram_notification('salom')
        self.assertFalse(sent)
        post.assert_not_called()

    def test_license_state_fallback_is_not_used(self):
        from licensing.models import LicenseState
        from core import services

        LicenseState.objects.create(
            pk=1, license_key='TEST-0000-0000',
            telegram_bot_token='fail-safe-token', telegram_chat_id='fail-safe-chat',
        )
        with mock.patch('requests.post') as post:
            sent = services.send_telegram_notification('mijoz qarz xabari')
        self.assertFalse(sent)
        post.assert_not_called()

    def test_restaurant_config_sends_via_telegram_api(self):
        from core import services

        RestaurantConfig.objects.create(
            pk=1, telegram_bot_token='rc-token', telegram_chat_id='rc-chat',
        )
        with mock.patch('requests.post') as post:
            post.return_value = mock.Mock(status_code=200)
            sent = services.send_telegram_notification('mijoz qarz xabari')
        self.assertTrue(sent)
        post.assert_called_once()
        (url,), kwargs = post.call_args
        self.assertEqual(url, 'https://api.telegram.org/botrc-token/sendMessage')
        self.assertEqual(kwargs['json']['chat_id'], 'rc-chat')
        self.assertEqual(kwargs['json']['text'], 'mijoz qarz xabari')

    def test_task_delegates_to_service_function(self):
        with mock.patch('core.tasks.services.send_telegram_notification', return_value=True) as send:
            result = tasks.send_telegram_notification_task('xabar', parse_mode='HTML')
        send.assert_called_once_with('xabar', parse_mode='HTML')
        self.assertEqual(result, True)
