"""
Hisobot va analitika endpointlari (afitsiant kunlik sotuvi + admin dashboard).

Muhim: haqiqiy TUSHUM doim `Payment.amount` yig'indisidan olinadi - buyurtma
summasi (`Order.total_amount`/`final_amount`) `calculate_order_financials`
ichidagi anti-piracy multiplier'ni ko'taradi (yaroqsiz litsenziyada ataylab
buziladi), shuning uchun jamlangan tushum hisobiga yaramaydi. To'langan pul esa
`Payment` qatorlarida toza saqlanadi - ishonchli manba shu.
"""
from datetime import date as date_cls, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Sum, Count, F, DecimalField
from django.db.models.functions import TruncHour, TruncDay
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, OpenApiParameter
from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Order, OrderItem, Payment, User, Attendance,
    Customer, DebtTransaction, Ingredient, StockMovement, Purchase,
)
from .permissions import IsAdminStaff
from .views import RESTAURANT_TZ

# price*quantity yig'indilari uchun output_field (aks holda Sum turi noaniq).
_MONEY_FIELD = DecimalField(max_digits=18, decimal_places=2)


def day_bounds(date_param):
    """
    `?date=today` yoki `?date=YYYY-MM-DD` -> (target_date, day_start, day_end).
    `OrderViewSet.get_queryset` bilan bir xil mantiq: kun chegarasi har doim
    `RESTAURANT_TZ` (Asia/Tashkent) da hisoblanadi, saqlangan `created_at` UTC
    bo'lib qolaveradi (UTC-yarim-tun buyurtmani noto'g'ri kunga tashlab
    yubormasligi uchun). None/'today' -> bugun.
    """
    if not date_param or date_param == 'today':
        target = timezone.now().astimezone(RESTAURANT_TZ).date()
    else:
        try:
            target = date_cls.fromisoformat(date_param)
        except ValueError:
            raise ValidationError({'date': "YYYY-MM-DD formatida yoki 'today' bo'lishi kerak."})
    start = datetime.combine(target, time.min, tzinfo=RESTAURANT_TZ)
    return target, start, start + timedelta(days=1)


def _range_bounds(request):
    """
    `?from=YYYY-MM-DD&to=YYYY-MM-DD` -> (start, end_exclusive). Ikkalasi ham
    ixtiyoriy; berilmasa bugun. `to` shu kunni ham qamrab olishi uchun +1 kun.
    """
    from_param = request.query_params.get('from')
    to_param = request.query_params.get('to')
    if not from_param and not to_param:
        _, start, end = day_bounds('today')
        return start, end
    try:
        from_date = date_cls.fromisoformat(from_param) if from_param else timezone.now().astimezone(RESTAURANT_TZ).date()
        to_date = date_cls.fromisoformat(to_param) if to_param else from_date
    except ValueError:
        raise ValidationError({'detail': "from/to YYYY-MM-DD formatida bo'lishi kerak."})
    start = datetime.combine(from_date, time.min, tzinfo=RESTAURANT_TZ)
    end = datetime.combine(to_date, time.min, tzinfo=RESTAURANT_TZ) + timedelta(days=1)
    return start, end


def _revenue_by_method(payments_qs):
    """Naqd/karta/boshqa bo'yicha tushum + umumiy. `payments_qs` void'dan tozalangan bo'lishi kerak."""
    by_method = {'cash': Decimal('0'), 'card': Decimal('0'), 'other': Decimal('0')}
    for row in payments_qs.values('method').annotate(total=Sum('amount')):
        by_method[row['method']] = row['total'] or Decimal('0')
    total = sum(by_method.values(), Decimal('0'))
    return by_method, total


def _money(value):
    """Decimal -> string (DRF DecimalField(coerce_to_string=True) bilan bir xil format)."""
    return str((value or Decimal('0')).quantize(Decimal('0.01')))


class MySalesSummaryView(APIView):
    """
    Afitsiant/kassirning KUNLIK jamlangan sotuvi (bir so'rovda).
    `GET /api/reports/my-summary/?date=today`. Buyurtma tafsiloti uchun mavjud
    `GET /api/orders/?date=today` (waiter-scoped) qoladi - bu faqat jamlanma.

    Tushum `Payment.created_at` oynasidan (bugun qabul qilingan pul), buyurtma/
    taom sonlari esa `Order.created_at` oynasidan olinadi - ikkovi tunda farq
    qilishi mumkin, shuning uchun ataylab ajratilgan.
    """
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter('date', str, description="'today' yoki YYYY-MM-DD (standart: today)"),
            OpenApiParameter('waiter', int, description="Faqat menejer: boshqa afitsiant id'si"),
        ],
        responses={200: dict},
    )
    def get(self, request):
        target, start, end = day_bounds(request.query_params.get('date'))
        user = request.user

        waiter_param = request.query_params.get('waiter')
        if waiter_param:
            if user.role != 'manager':
                return Response(
                    {'detail': "Boshqa xodim hisobotini faqat menejer ko'radi."},
                    status=403,
                )
            target_user = get_object_or_404(User, pk=waiter_param)
        else:
            target_user = user

        payments = Payment.objects.filter(
            is_voided=False, order__waiter=target_user,
            created_at__gte=start, created_at__lt=end,
        )
        by_method, total_revenue = _revenue_by_method(payments)

        orders = Order.objects.filter(
            waiter=target_user, created_at__gte=start, created_at__lt=end,
        )
        order_count = orders.filter(status='completed').count()
        open_count = orders.filter(status__in=('new', 'in_progress')).count()
        cancelled_count = orders.filter(status='cancelled').count()

        item_count = OrderItem.objects.filter(
            order__waiter=target_user, is_voided=False,
            order__created_at__gte=start, order__created_at__lt=end,
        ).aggregate(t=Sum('quantity'))['t'] or 0

        avg = total_revenue / order_count if order_count else Decimal('0')

        return Response({
            'date': str(target),
            'waiter_id': target_user.id,
            'waiter_name': target_user.first_name,
            'order_count': order_count,
            'open_order_count': open_count,
            'cancelled_count': cancelled_count,
            'item_count': item_count,
            'total_revenue': _money(total_revenue),
            'avg_order_value': _money(avg),
            'by_method': {k: _money(v) for k, v in by_method.items()},
        })


# ==============================================================================
# ADMIN DASHBOARD (menejer-gated: IsAdminStaff)
# ==============================================================================

class DashboardView(APIView):
    """
    Menejer uchun bosh KPI paneli. `GET /api/reports/dashboard/?date=today`.
    Tushum `Payment.amount`dan (haqiqiy pul), qarz/ombor esa yangi
    modellardan olinadi.
    """
    permission_classes = [IsAdminStaff]

    @extend_schema(
        parameters=[OpenApiParameter('date', str, description="'today' yoki YYYY-MM-DD")],
        responses={200: dict},
    )
    def get(self, request):
        target, start, end = day_bounds(request.query_params.get('date'))

        payments = Payment.objects.filter(is_voided=False, created_at__gte=start, created_at__lt=end)
        by_method, total_revenue = _revenue_by_method(payments)

        completed = Order.objects.filter(status='completed', created_at__gte=start, created_at__lt=end)
        order_count = completed.count()
        avg_check = total_revenue / order_count if order_count else Decimal('0')
        discount_total = completed.aggregate(t=Sum('discount_amount'))['t'] or Decimal('0')

        open_orders = Order.objects.filter(status__in=('new', 'in_progress'))
        occupied_tables = open_orders.filter(table__isnull=False).values('table').distinct().count()
        active_staff = Attendance.objects.filter(check_out__isnull=True).count()

        top_products = [
            {'name': r['product__name'], 'quantity': r['qty'], 'revenue': _money(r['revenue'])}
            for r in OrderItem.objects.filter(
                is_voided=False, order__created_at__gte=start, order__created_at__lt=end,
            ).values('product__name').annotate(
                qty=Sum('quantity'),
                revenue=Sum(F('price') * F('quantity'), output_field=_MONEY_FIELD),
            ).order_by('-qty')[:10]
        ]

        hourly = [
            {'hour': r['hour'].astimezone(RESTAURANT_TZ).strftime('%H:00'), 'revenue': _money(r['total'])}
            for r in payments.annotate(hour=TruncHour('created_at', tzinfo=RESTAURANT_TZ))
            .values('hour').annotate(total=Sum('amount')).order_by('hour')
        ]

        total_debt = Customer.objects.aggregate(t=Sum('balance'))['t'] or Decimal('0')
        debtor_count = Customer.objects.filter(balance__gt=0).count()

        active_ingredients = Ingredient.objects.filter(is_active=True)
        low_stock_count = active_ingredients.filter(current_stock__lt=F('min_stock')).count()
        inventory_value = active_ingredients.aggregate(
            v=Sum(F('current_stock') * F('cost_price'), output_field=_MONEY_FIELD),
        )['v'] or Decimal('0')

        return Response({
            'date': str(target),
            'revenue': {
                'total': _money(total_revenue),
                'by_method': {k: _money(v) for k, v in by_method.items()},
                'order_count': order_count,
                'avg_check': _money(avg_check),
                'discount_total': _money(discount_total),
            },
            'floor': {
                'occupied_tables': occupied_tables,
                'open_orders': open_orders.count(),
                'active_staff': active_staff,
            },
            'debts': {
                'total_outstanding': _money(total_debt),
                'debtor_count': debtor_count,
            },
            'inventory': {
                'low_stock_count': low_stock_count,
                'total_value': _money(inventory_value),
            },
            'top_products': top_products,
            'hourly_revenue': hourly,
        })


class SalesReportView(APIView):
    """
    Sotuv analitikasi. `GET /api/reports/sales/?from=&to=&group_by=day|waiter|product|category`.
    day/waiter tushumi `Payment.amount`dan; product/category esa `OrderItem`
    (narx×miqdor)dan - to'lov qatori taomga bog'lanmagani uchun.
    """
    permission_classes = [IsAdminStaff]

    @extend_schema(parameters=[
        OpenApiParameter('from', str, description='YYYY-MM-DD (standart: bugun)'),
        OpenApiParameter('to', str, description='YYYY-MM-DD (standart: from)'),
        OpenApiParameter('group_by', str, description='day | waiter | product | category'),
    ])
    def get(self, request):
        start, end = _range_bounds(request)
        group_by = request.query_params.get('group_by', 'day')

        payments = Payment.objects.filter(is_voided=False, created_at__gte=start, created_at__lt=end)
        by_method, total_revenue = _revenue_by_method(payments)

        if group_by == 'day':
            rows = [
                {'key': r['day'].astimezone(RESTAURANT_TZ).strftime('%Y-%m-%d'),
                 'revenue': _money(r['revenue']), 'payment_count': r['count']}
                for r in payments.annotate(day=TruncDay('created_at', tzinfo=RESTAURANT_TZ))
                .values('day').annotate(revenue=Sum('amount'), count=Count('id')).order_by('day')
            ]
        elif group_by == 'waiter':
            rows = [
                {'key': r['order__waiter__first_name'] or "Noma'lum",
                 'waiter_id': r['order__waiter__id'], 'revenue': _money(r['revenue'])}
                for r in payments.values('order__waiter__id', 'order__waiter__first_name')
                .annotate(revenue=Sum('amount')).order_by('-revenue')
            ]
        elif group_by in ('product', 'category'):
            field = 'product__name' if group_by == 'product' else 'product__category__name'
            rows = [
                {'key': r[field] or "Noma'lum", 'quantity': r['qty'], 'revenue': _money(r['revenue'])}
                for r in OrderItem.objects.filter(
                    is_voided=False, order__created_at__gte=start, order__created_at__lt=end,
                ).values(field).annotate(
                    qty=Sum('quantity'),
                    revenue=Sum(F('price') * F('quantity'), output_field=_MONEY_FIELD),
                ).order_by('-revenue')
            ]
        else:
            raise ValidationError({'group_by': 'day | waiter | product | category bo\'lishi kerak.'})

        return Response({
            'group_by': group_by,
            'total_revenue': _money(total_revenue),
            'by_method': {k: _money(v) for k, v in by_method.items()},
            'rows': rows,
        })


class StaffReportView(APIView):
    """
    Xodimlar samaradorligi (kunlik). `GET /api/reports/staff/?date=today`.
    Har afitsiant bo'yicha tushum + yopilgan buyurtma soni, hozir ishdagilar.
    """
    permission_classes = [IsAdminStaff]

    @extend_schema(parameters=[OpenApiParameter('date', str, description="'today' yoki YYYY-MM-DD")])
    def get(self, request):
        target, start, end = day_bounds(request.query_params.get('date'))

        revenue_rows = Payment.objects.filter(
            is_voided=False, created_at__gte=start, created_at__lt=end,
        ).values('order__waiter__id', 'order__waiter__first_name').annotate(
            revenue=Sum('amount'), payment_count=Count('id'),
        ).order_by('-revenue')

        order_counts = {
            r['waiter']: r['c'] for r in Order.objects.filter(
                status='completed', created_at__gte=start, created_at__lt=end,
            ).values('waiter').annotate(c=Count('id'))
        }

        waiters = [
            {
                'waiter_id': r['order__waiter__id'],
                'waiter_name': r['order__waiter__first_name'] or "Noma'lum",
                'revenue': _money(r['revenue']),
                'payment_count': r['payment_count'],
                'completed_orders': order_counts.get(r['order__waiter__id'], 0),
            }
            for r in revenue_rows
        ]

        clocked_in = [
            {'user_id': a.user_id, 'name': a.user.first_name, 'role': a.user.role, 'check_in': a.check_in}
            for a in Attendance.objects.filter(check_out__isnull=True).select_related('user')
        ]

        return Response({'date': str(target), 'waiters': waiters, 'clocked_in': clocked_in})


class InventoryReportView(APIView):
    """
    Ombor holati. `GET /api/reports/inventory/?date=today`. Umumiy qiymat,
    past-zaxira ro'yxati, bugungi sarf/kirim.
    """
    permission_classes = [IsAdminStaff]

    @extend_schema(parameters=[OpenApiParameter('date', str, description="'today' yoki YYYY-MM-DD")])
    def get(self, request):
        target, start, end = day_bounds(request.query_params.get('date'))

        active = Ingredient.objects.filter(is_active=True)
        total_value = active.aggregate(
            v=Sum(F('current_stock') * F('cost_price'), output_field=_MONEY_FIELD),
        )['v'] or Decimal('0')

        low = active.filter(current_stock__lt=F('min_stock')).order_by('name')
        low_list = [
            {'id': i.id, 'name': i.name, 'unit': i.unit,
             'current_stock': str(i.current_stock), 'min_stock': str(i.min_stock)}
            for i in low
        ]

        # Sotuv harakatlari manfiy - sarfni musbat ko'rsatish uchun -Σ.
        consumed = StockMovement.objects.filter(
            movement_type='sale', created_at__gte=start, created_at__lt=end,
        ).aggregate(q=Sum('quantity'))['q'] or Decimal('0')

        purchases_today = Purchase.objects.filter(created_at__gte=start, created_at__lt=end)
        purchased_cost = Decimal('0')
        for p in purchases_today.prefetch_related('items'):
            purchased_cost += p.total_cost

        return Response({
            'date': str(target),
            'ingredient_count': active.count(),
            'total_value': _money(total_value),
            'low_stock_count': low.count(),
            'low_stock': low_list,
            'consumed_units_today': str(-consumed),
            'purchased_cost_today': _money(purchased_cost),
        })


class DebtsReportView(APIView):
    """
    Qarzdorlar jamlanmasi. `GET /api/reports/debts/?date=today`.
    """
    permission_classes = [IsAdminStaff]

    @extend_schema(parameters=[OpenApiParameter('date', str, description="'today' yoki YYYY-MM-DD")])
    def get(self, request):
        target, start, end = day_bounds(request.query_params.get('date'))

        total_debt = Customer.objects.aggregate(t=Sum('balance'))['t'] or Decimal('0')
        top_debtors = [
            {'id': c.id, 'name': f"{c.first_name} {c.last_name}".strip(),
             'phone': c.phone, 'balance': _money(c.balance)}
            for c in Customer.objects.filter(balance__gt=0).order_by('-balance')[:50]
        ]

        credit_today = DebtTransaction.objects.filter(
            txn_type='credit_sale', created_at__gte=start, created_at__lt=end,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        repaid_today = DebtTransaction.objects.filter(
            txn_type='repayment', created_at__gte=start, created_at__lt=end,
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')  # manfiy

        return Response({
            'date': str(target),
            'total_outstanding': _money(total_debt),
            'debtor_count': Customer.objects.filter(balance__gt=0).count(),
            'top_debtors': top_debtors,
            'credit_sales_today': _money(credit_today),
            'repayments_today': _money(-repaid_today),
        })
