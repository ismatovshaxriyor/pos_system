from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework import viewsets, permissions, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from . import services
from .models import User, Table, Category, Product, Order, OrderItem, Payment, StaffDevice, Notification
from .permissions import IsAdminStaff, IsManagerOrAdmin
from .realtime import broadcast_event
from .serializers import (
    UserSerializer, TableSerializer, CategorySerializer,
    ProductSerializer, OrderSerializer, OrderItemSerializer,
    PaymentSerializer, DiscountSerializer,
    StaffDeviceSerializer, NotificationSerializer,
    RegistrationCodeResponseSerializer, ErrorDetailSerializer, StatusMessageSerializer,
)

ORDER_FINISHED_STATUSES = ('completed', 'cancelled')

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action == 'me':
            return [permissions.IsAuthenticated()]
        return [IsAdminStaff()]

    @action(detail=False, methods=['get'])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    @extend_schema(
        request=None,
        responses={
            201: RegistrationCodeResponseSerializer,
            400: OpenApiResponse(ErrorDetailSerializer, description="Admin foydalanuvchi uchun kod yaratib bo'lmaydi."),
        },
    )
    @action(detail=True, methods=['post'], url_path='generate-registration-code')
    def generate_registration_code(self, request, pk=None):
        user = self.get_object()
        try:
            registration = services.generate_registration_code(user, created_by=request.user)
        except services.ServiceError as exc:
            return Response({'detail': exc.message}, status=exc.status)
        return Response({
            'code': registration.code,
            'expires_at': registration.expires_at,
            'user': UserSerializer(user).data,
        }, status=status.HTTP_201_CREATED)

class TableViewSet(viewsets.ModelViewSet):
    queryset = Table.objects.all()
    serializer_class = TableSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]

class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]

    def perform_update(self, serializer):
        old_price = serializer.instance.price
        product = serializer.save()
        if product.price != old_price and not self.request.user.is_staff:
            message = (
                f"Narx o'zgartirildi: {product.name} {old_price} -> {product.price} "
                f"({self.request.user.username})"
            )
            Notification.objects.create(
                recipient=None, notif_type='price_changed', message=message,
                payload={
                    'product_id': product.id, 'old_price': str(old_price),
                    'new_price': str(product.price), 'changed_by': self.request.user.id,
                },
            )
            broadcast_event('price_changed', {'product_id': product.id, 'message': message})

class OrderViewSet(viewsets.ModelViewSet):
    # OpenAPI sxema-introspeksiyasi uchun (masalan path parametr turini
    # aniqlash) - haqiqiy runtime filtrlash get_queryset() orqali bo'ladi.
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        # Chegirma qo'yish - moliyaviy jihatdan nozik amal, faqat
        # menejer/admin uchun. Qolgan barcha action (yaratish, to'lov
        # qo'shish, yopish) kassir/afitsiant ham bajarishi kerak bo'lgani
        # uchun oddiy IsAuthenticated'da qoladi.
        if self.action == 'set_discount':
            return [permissions.IsAuthenticated(), IsManagerOrAdmin()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = Order.objects.select_related('table', 'waiter', 'cashier').prefetch_related(
            'items__product', 'payments__received_by',
        )
        user = self.request.user
        if user.role == 'waiter' and not user.is_staff:
            qs = qs.filter(waiter=user)
        return qs

    def perform_create(self, serializer):
        order = serializer.save(waiter=self.request.user)
        if order.table_id:
            broadcast_event('table_status_changed', {'table_id': order.table_id})

    @extend_schema(
        request=None,
        responses={
            200: StatusMessageSerializer,
            400: OpenApiResponse(ErrorDetailSerializer, description="Buyurtma allaqachon yopilgan yoki to'liq to'lanmagan."),
        },
    )
    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        order = self.get_object()
        if order.status == 'completed':
            return Response({'detail': 'Order already completed'}, status=status.HTTP_400_BAD_REQUEST)

        balance_due = order.balance_due
        if balance_due > 0:
            return Response(
                {'detail': f"Buyurtma to'liq to'lanmagan. Qolgan qarz: {balance_due} so'm."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.status = 'completed'
        order.cashier = request.user
        order.save()

        if order.table_id:
            broadcast_event('table_status_changed', {'table_id': order.table_id})

        return Response({'status': 'Order closed successfully'})

    @extend_schema(
        request=OrderItemSerializer,
        responses={
            201: StatusMessageSerializer,
            400: OpenApiResponse(description="Validatsiya xatosi (masalan noto'g'ri product_id)."),
        },
    )
    @action(detail=True, methods=['post'])
    def add_item(self, request, pk=None):
        order = self.get_object()
        serializer = OrderItemSerializer(data=request.data)
        if serializer.is_valid():
            product = serializer.validated_data['product']
            quantity = serializer.validated_data.get('quantity', 1)
            price = product.price

            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=quantity,
                price=price
            )

            # Update total amount
            order.total_amount += price * quantity
            order.save()

            return Response({'status': 'Item added'}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @extend_schema(
        request=PaymentSerializer,
        responses={
            201: PaymentSerializer,
            400: OpenApiResponse(
                ErrorDetailSerializer,
                description="To'lov summasi qolgan qarzdan oshib ketgan yoki buyurtma yopilgan/bekor qilingan.",
            ),
        },
    )
    @action(detail=True, methods=['post'])
    def add_payment(self, request, pk=None):
        order = self.get_object()
        if order.status in ORDER_FINISHED_STATUSES:
            return Response(
                {'detail': "Yopilgan yoki bekor qilingan buyurtmaga to'lov qo'shib bo'lmaydi."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PaymentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        amount = serializer.validated_data['amount']

        with transaction.atomic():
            # Bir nechta kassa terminali bir vaqtda shu order'ga to'lov
            # qo'shishi mumkin (split-payment) - qatorni qulflab, eng so'nggi
            # balance_due'ni shu tranzaksiya ichida qayta o'qiymiz, aks holda
            # ikki parallel so'rov orasidagi race overpayment'ga olib kelishi
            # mumkin.
            order = Order.objects.select_for_update().get(pk=order.pk)
            balance_due = order.balance_due
            if amount > balance_due:
                return Response(
                    {'detail': f"To'lov summasi qolgan qarzdan ({balance_due} so'm) oshib ketdi."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            payment = Payment.objects.create(
                order=order,
                amount=amount,
                method=serializer.validated_data.get('method', 'cash'),
                received_by=request.user,
            )

        broadcast_event('order_updated', {'order_id': order.id})

        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=DiscountSerializer,
        responses={
            200: OrderSerializer,
            400: OpenApiResponse(
                ErrorDetailSerializer,
                description="Yopilgan/bekor qilingan buyurtmaga chegirma qo'yib bo'lmaydi yoki chegirma summasi buyurtma summasidan katta.",
            ),
        },
    )
    @action(detail=True, methods=['post'])
    def set_discount(self, request, pk=None):
        order = self.get_object()
        if order.status in ORDER_FINISHED_STATUSES:
            return Response(
                {'detail': "Yopilgan yoki bekor qilingan buyurtmaga chegirma qo'llab bo'lmaydi."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = DiscountSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_amount = serializer.validated_data['discount_amount']
        new_reason = serializer.validated_data.get('discount_reason', '')
        if new_amount > order.total_amount:
            return Response(
                {'detail': f"Chegirma summasi buyurtma summasidan ({order.total_amount} so'm) katta bo'lishi mumkin emas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_amount = order.discount_amount
        order.discount_amount = new_amount
        order.discount_reason = new_reason
        order.save(update_fields=['discount_amount', 'discount_reason'])

        if new_amount != old_amount and not request.user.is_staff:
            message = (
                f"Chegirma qo'llandi: Buyurtma #{order.id} {old_amount} -> {new_amount} so'm "
                f"({request.user.username})"
            )
            Notification.objects.create(
                recipient=None, notif_type='discount_applied', message=message,
                payload={
                    'order_id': order.id, 'old_discount': str(old_amount),
                    'new_discount': str(new_amount), 'changed_by': request.user.id,
                },
            )
            broadcast_event('discount_applied', {'order_id': order.id, 'message': message})

        return Response(OrderSerializer(order, context={'request': request}).data)

class OrderItemViewSet(viewsets.ModelViewSet):
    queryset = OrderItem.objects.all()
    serializer_class = OrderItemSerializer
    permission_classes = [permissions.IsAuthenticated]

class StaffDeviceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StaffDevice.objects.select_related('user').all()
    serializer_class = StaffDeviceSerializer
    permission_classes = [IsAdminStaff]

    @extend_schema(request=None, responses={200: ErrorDetailSerializer})
    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        device = self.get_object()
        services.revoke_device(device, kicked_by=request.user)
        return Response({'detail': "Qurilma chetlashtirildi."})

class NotificationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    # OpenAPI sxema-introspeksiyasi uchun - haqiqiy runtime filtrlash
    # get_queryset() orqali bo'ladi.
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Q(recipient=user)
        if user.is_staff:
            qs |= Q(recipient__isnull=True)
        return Notification.objects.filter(qs).order_by('-created_at')

    @extend_schema(request=None, responses={200: StatusMessageSerializer})
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save(update_fields=['is_read', 'read_at'])
        return Response({'status': 'ok'})
