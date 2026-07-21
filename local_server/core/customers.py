"""
Qarz daftar - mijozlar CRUD + qarz to'lash (repayment) + qarz tarixi.

Kreditga yopish oqimi buyurtma tomonida (`OrderViewSet.close_on_credit`) -
u yerda buyurtma qulflanishi kerak. Bu yerda mijoz ro'yxati, balansi va
to'lovlari boshqariladi.
"""
from django.db.models import Q
from django.db import transaction
from drf_spectacular.utils import extend_schema, OpenApiParameter
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from . import services
from .models import Customer
from .permissions import IsCashierOrManager, IsManagerOrAdmin
from .serializers import CustomerSerializer, DebtTransactionSerializer, RepaymentSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsCashierOrManager]

    def get_permissions(self):
        # Qarz daftar moliyaviy jihatdan nozik: afitsiant mijoz balansi/PII/
        # qarz tarixini umuman ko'rmasligi kerak (IsManagerOrAdmin SAFE
        # metodlarni afitsiantga ham ochib qo'yardi - shuning uchun bu yerda
        # ishlatilmaydi). O'qish va qarz to'lash (repay) - kassir yoki menejer;
        # mijoz yaratish/tahrirlash/o'chirish esa faqat menejer.
        if self.action in ('list', 'retrieve', 'transactions', 'repay'):
            return [IsCashierOrManager()]
        return [permissions.IsAuthenticated(), IsManagerOrAdmin()]

    def get_queryset(self):
        qs = Customer.objects.all()
        if self.request.query_params.get('has_debt') == 'true':
            qs = qs.filter(balance__gt=0)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(phone__icontains=search)
            )
        return qs.order_by('-balance', 'first_name')

    @extend_schema(responses={200: DebtTransactionSerializer(many=True)})
    @action(detail=True, methods=['get'])
    def transactions(self, request, pk=None):
        """Mijozning qarz harakatlari tarixi (kreditga sotuv + to'lovlar)."""
        customer = self.get_object()
        txns = customer.debt_transactions.select_related('created_by', 'order').all()
        return Response(DebtTransactionSerializer(txns, many=True).data)

    @extend_schema(
        request=RepaymentSerializer,
        responses={200: CustomerSerializer, 400: CustomerSerializer},
    )
    @action(detail=True, methods=['post'])
    def repay(self, request, pk=None):
        """
        Mijoz qarzni to'laydi: balans kamayadi, `DebtTransaction(repayment)`
        yoziladi. To'lov summasi joriy qarzdan oshib ketishi mumkin emas.
        """
        customer = self.get_object()

        serializer = RepaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        amount = serializer.validated_data['amount']

        with transaction.atomic():
            # Bir nechta terminal bir vaqtda to'lov qabul qilishi mumkin -
            # qatorni qulflab, eng so'nggi balansni shu tranzaksiyada o'qiymiz.
            customer = Customer.objects.select_for_update().get(pk=customer.pk)
            if amount > customer.balance:
                return Response(
                    {'detail': f"To'lov summasi mijoz qarzidan ({customer.balance} so'm) oshib ketdi."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            services.record_repayment(
                customer=customer, amount=amount,
                method=serializer.validated_data['method'],
                created_by=request.user,
                note=serializer.validated_data.get('note', ''),
            )
            customer.refresh_from_db()

        return Response(CustomerSerializer(customer).data)
