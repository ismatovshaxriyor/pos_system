from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token

from core.models import Category, Notification, Order, OrderItem, Payment, Product, Table, User


def _auth_header(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {"HTTP_AUTHORIZATION": f"Token {token.key}"}


class PaymentFlowTestsBase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='+998900000080', role='manager', is_staff=True)
        self.manager = User.objects.create_user(username='+998900000081', role='manager')
        self.cashier = User.objects.create_user(username='+998900000082', role='cashier')
        self.waiter = User.objects.create_user(username='+998900000083', role='waiter')
        self.table = Table.objects.create(name='3-stol')
        self.category = Category.objects.create(name='Taomlar')
        self.product = Product.objects.create(category=self.category, name='Osh', price=Decimal('25000'))
        self.order = Order.objects.create(table=self.table, waiter=self.waiter)
        OrderItem.objects.create(order=self.order, product=self.product, quantity=2, price=self.product.price)
        self.order.total_amount = Decimal('50000')
        self.order.save()

    def _add_payment(self, user, amount, method='cash'):
        url = reverse('order-add-payment', args=[self.order.id])
        return self.client.post(
            url, {"amount": str(amount), "method": method},
            content_type='application/json', **_auth_header(user),
        )

    def _close(self, user):
        url = reverse('order-close', args=[self.order.id])
        return self.client.post(url, content_type='application/json', **_auth_header(user))

    def _set_discount(self, user, amount, reason=''):
        url = reverse('order-set-discount', args=[self.order.id])
        return self.client.post(
            url, {"discount_amount": str(amount), "discount_reason": reason},
            content_type='application/json', **_auth_header(user),
        )


class SplitPaymentTests(PaymentFlowTestsBase):
    def test_split_payment_accumulates(self):
        r1 = self._add_payment(self.cashier, '20000', 'cash')
        r2 = self._add_payment(self.cashier, '30000', 'card')

        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r2.status_code, 201)

        self.order.refresh_from_db()
        self.assertEqual(self.order.amount_paid, Decimal('50000'))
        self.assertEqual(self.order.balance_due, Decimal('0'))
        self.assertEqual(Payment.objects.filter(order=self.order).count(), 2)

    def test_add_payment_returns_payment_representation(self):
        response = self._add_payment(self.cashier, '20000', 'cash')
        self.assertEqual(response.data['amount'], '20000.00')
        self.assertEqual(response.data['method'], 'cash')
        self.assertEqual(response.data['received_by']['id'], self.cashier.id)


class OverpaymentTests(PaymentFlowTestsBase):
    def test_single_overpayment_rejected(self):
        response = self._add_payment(self.cashier, '60000')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Payment.objects.count(), 0)

    def test_overpayment_rejected_after_partial_payment(self):
        self._add_payment(self.cashier, '40000')
        response = self._add_payment(self.cashier, '20000')

        self.assertEqual(response.status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.amount_paid, Decimal('40000'))

    def test_payment_amount_must_be_positive(self):
        self.assertEqual(self._add_payment(self.cashier, '0').status_code, 400)
        self.assertEqual(self._add_payment(self.cashier, '-100').status_code, 400)

    def test_add_payment_missing_amount_field_returns_field_errors(self):
        url = reverse('order-add-payment', args=[self.order.id])
        response = self.client.post(
            url, {"method": "cash"}, content_type='application/json', **_auth_header(self.cashier),
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('amount', response.data)


class CloseFlowTests(PaymentFlowTestsBase):
    def test_close_blocked_when_underpaid(self):
        self._add_payment(self.cashier, '30000')
        response = self._close(self.cashier)

        self.assertEqual(response.status_code, 400)
        self.order.refresh_from_db()
        self.assertNotEqual(self.order.status, 'completed')

    def test_close_succeeds_when_exactly_paid(self):
        self._add_payment(self.cashier, '20000', 'cash')
        self._add_payment(self.cashier, '30000', 'card')
        response = self._close(self.cashier)

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'completed')
        self.assertEqual(self.order.cashier, self.cashier)

    def test_close_succeeds_with_no_payments_when_fully_discounted(self):
        self._set_discount(self.manager, '50000')
        response = self._close(self.cashier)

        self.assertEqual(response.status_code, 200)


class DiscountTests(PaymentFlowTestsBase):
    def test_discount_reduces_balance_due(self):
        self._set_discount(self.manager, '10000')
        self.order.refresh_from_db()

        self.assertEqual(self.order.final_amount, Decimal('40000'))
        self.assertEqual(self.order.balance_due, Decimal('40000'))

        self._add_payment(self.cashier, '40000')
        response = self._close(self.cashier)
        self.assertEqual(response.status_code, 200)

    def test_discount_amount_cannot_exceed_total(self):
        response = self._set_discount(self.manager, '60000')
        self.assertEqual(response.status_code, 400)

    def test_discount_forbidden_for_cashier(self):
        self.assertEqual(self._set_discount(self.cashier, '5000').status_code, 403)

    def test_discount_forbidden_for_waiter(self):
        self.assertEqual(self._set_discount(self.waiter, '5000').status_code, 403)

    def test_manager_can_set_discount(self):
        self.assertEqual(self._set_discount(self.manager, '5000').status_code, 200)

    def test_admin_can_set_discount(self):
        self.assertEqual(self._set_discount(self.admin, '5000').status_code, 200)

    def test_discount_forbidden_on_completed_order(self):
        self._add_payment(self.cashier, '50000')
        self._close(self.cashier)

        response = self._set_discount(self.manager, '1000')
        self.assertEqual(response.status_code, 400)

    def test_discount_forbidden_on_cancelled_order(self):
        self.order.status = 'cancelled'
        self.order.save()

        response = self._set_discount(self.manager, '1000')
        self.assertEqual(response.status_code, 400)

    def test_manager_discount_creates_broadcast_notification(self):
        self._set_discount(self.manager, '5000')

        notification = Notification.objects.get(notif_type='discount_applied')
        self.assertIsNone(notification.recipient)
        self.assertEqual(notification.payload['order_id'], self.order.id)

    def test_admin_discount_creates_no_notification(self):
        self._set_discount(self.admin, '5000')
        self.assertFalse(Notification.objects.filter(notif_type='discount_applied').exists())

    def test_setting_same_discount_amount_creates_no_duplicate_notification(self):
        self._set_discount(self.manager, '5000')
        self._set_discount(self.manager, '5000')

        self.assertEqual(Notification.objects.filter(notif_type='discount_applied').count(), 1)


class PaymentForbiddenOnFinishedOrderTests(PaymentFlowTestsBase):
    def test_payment_forbidden_on_completed_order(self):
        self._add_payment(self.cashier, '50000')
        self._close(self.cashier)

        response = self._add_payment(self.cashier, '1000')
        self.assertEqual(response.status_code, 400)

    def test_payment_forbidden_on_cancelled_order(self):
        self.order.status = 'cancelled'
        self.order.save()

        response = self._add_payment(self.cashier, '1000')
        self.assertEqual(response.status_code, 400)


class OrderSerializerExposureTests(PaymentFlowTestsBase):
    def test_nested_payments_appear_in_order_detail(self):
        self._add_payment(self.cashier, '20000', 'card')

        url = reverse('order-detail', args=[self.order.id])
        response = self.client.get(url, **_auth_header(self.cashier))

        self.assertEqual(len(response.data['payments']), 1)
        self.assertEqual(response.data['payments'][0]['amount'], '20000.00')
        self.assertEqual(response.data['payments'][0]['method'], 'card')

    def test_discount_fields_not_writable_via_generic_patch(self):
        url = reverse('order-detail', args=[self.order.id])
        response = self.client.patch(
            url, {"discount_amount": "99999"}, content_type='application/json',
            **_auth_header(self.manager),
        )

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.discount_amount, Decimal('0'))
