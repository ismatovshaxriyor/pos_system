from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework import viewsets, permissions, status, mixins
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from . import services
from .models import User, Table, Category, Product, Order, OrderItem, Payment, StaffDevice, Notification, RestaurantConfig, Attendance
from .permissions import IsAdminStaff, IsManagerOrAdmin
from .realtime import broadcast_event
from .serializers import (
    UserSerializer, TableSerializer, CategorySerializer,
    ProductSerializer, OrderSerializer, OrderItemSerializer,
    PaymentSerializer, DiscountSerializer,
    StaffDeviceSerializer, NotificationSerializer,
    RegistrationCodeResponseSerializer, ErrorDetailSerializer, StatusMessageSerializer,
    RestaurantConfigSerializer, AttendanceSerializer, CheckInSerializer, CheckOutSerializer,
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

    def get_queryset(self):
        # Soft-delete qilingan mahsulotlar API'dan butunlay yashiriladi
        # (tiklash - Django admin orqali).
        return Product.objects.filter(is_deleted=False)

    def perform_destroy(self, instance):
        # OrderItem.product PROTECT - bir marta sotilgan mahsulotni hard
        # delete qilish ProtectedError (500) beradi. DELETE shuning uchun
        # soft-delete: menyudan yo'qoladi, tarixiy buyurtmalar esa
        # mahsulotga ishora qilishda davom etadi.
        instance.is_deleted = True
        instance.is_available = False
        instance.save(update_fields=['is_deleted', 'is_available', 'updated_at'])

    def perform_update(self, serializer):
        old_price = serializer.instance.price
        product = serializer.save()
        if product.price != old_price:
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
        # Chegirma qo'yish va bekor qilish - moliyaviy jihatdan nozik
        # amallar, faqat menejer/admin uchun. Qolgan barcha action (yaratish,
        # to'lov qo'shish, yopish) kassir/afitsiant ham bajarishi kerak
        # bo'lgani uchun oddiy IsAuthenticated'da qoladi.
        # Diqqat: bu override bor ekan, @action(permission_classes=...) bu
        # ViewSet'da ISHLAMAYDI - action darajasidagi ruxsatlar faqat shu
        # yerda e'lon qilinadi.
        if self.action in ('set_discount', 'cancel'):
            return [permissions.IsAuthenticated(), IsManagerOrAdmin()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = Order.objects.select_related('table', 'waiter', 'cashier').prefetch_related(
            'items__product', 'payments__received_by',
        )
        user = self.request.user
        if user.role == 'waiter':
            qs = qs.filter(waiter=user)
        return qs

    @extend_schema(
        request=OrderSerializer,
        responses={201: OrderSerializer, 200: OrderSerializer}
    )
    def create(self, request, *args, **kwargs):
        sync_uuid = request.data.get('sync_uuid')
        if sync_uuid:
            existing_order = Order.objects.filter(sync_uuid=sync_uuid).first()
            if existing_order:
                serializer = self.get_serializer(existing_order)
                return Response(serializer.data, status=status.HTTP_200_OK)
        return super().create(request, *args, **kwargs)

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

        with transaction.atomic():
            # Status/balans tekshiruvi lock ichida - aks holda parallel
            # add_item/add_payment bilan poyga: tekshiruvdan keyin, saqlashdan
            # oldin buyurtma o'zgarib qolishi mumkin (TOCTOU).
            order = Order.objects.select_for_update().get(pk=order.pk)
            if order.status in ORDER_FINISHED_STATUSES:
                return Response({'detail': 'Order already completed or cancelled'}, status=status.HTTP_400_BAD_REQUEST)

            balance_due = order.balance_due
            if balance_due > 0:
                return Response(
                    {'detail': f"Buyurtma to'liq to'lanmagan. Qolgan qarz: {balance_due} so'm."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            order.status = 'completed'
            order.cashier = request.user
            order.save()

        broadcast_event('order_updated', {'order_id': order.id})
        if order.table_id:
            broadcast_event('table_status_changed', {'table_id': order.table_id})

        return Response({'status': 'Order closed successfully'})

    @extend_schema(
        request=None,
        responses={
            200: StatusMessageSerializer,
            400: OpenApiResponse(ErrorDetailSerializer, description="Faqat 'new' holatdagi buyurtmalarni boshlash mumkin."),
        },
    )
    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        order = self.get_object()
        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order.pk)
            if order.status != 'new':
                return Response({'detail': "Faqat 'new' holatdagi buyurtmalarni boshlash mumkin."}, status=status.HTTP_400_BAD_REQUEST)
            order.status = 'in_progress'
            # updated_at (auto_now) update_fields ro'yxatida bo'lmasa
            # yangilanmaydi - sync closed_at shu maydonga tayanadi.
            order.save(update_fields=['status', 'updated_at'])
        broadcast_event('order_updated', {'order_id': order.id})
        if order.table_id:
            broadcast_event('table_status_changed', {'table_id': order.table_id})
        return Response({'status': 'Order started'})

    @extend_schema(
        request=None,
        responses={
            200: StatusMessageSerializer,
            400: OpenApiResponse(ErrorDetailSerializer, description="Yopilgan buyurtmani bekor qilib bo'lmaydi."),
        },
    )
    # Ruxsat get_permissions()'da (IsManagerOrAdmin) - bu yerda
    # permission_classes yozish befoyda, override uni bekor qiladi.
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        order = self.get_object()
        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order.pk)
            if order.status == 'completed':
                return Response({'detail': "Yakunlangan buyurtmani bekor qilib bo'lmaydi."}, status=status.HTTP_400_BAD_REQUEST)
            if order.status == 'cancelled':
                return Response({'detail': "Buyurtma allaqachon bekor qilingan."}, status=status.HTTP_400_BAD_REQUEST)

            order.status = 'cancelled'
            order.save(update_fields=['status', 'updated_at'])
        broadcast_event('order_updated', {'order_id': order.id})
        if order.table_id:
            broadcast_event('table_status_changed', {'table_id': order.table_id})
        return Response({'status': 'Order cancelled'})

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
        serializer.is_valid(raise_exception=True)
        product = serializer.validated_data['product']
        quantity = serializer.validated_data.get('quantity', 1)

        with transaction.atomic():
            # Status tekshiruvi lock ichida - lock'dan oldin tekshirilsa,
            # parallel close/cancel bilan poygada yopilgan buyurtmaga item
            # qo'shilib qolishi mumkin edi.
            order = Order.objects.select_for_update().get(pk=order.pk)
            if order.status in ORDER_FINISHED_STATUSES:
                return Response(
                    {'detail': "Yopilgan yoki bekor qilingan buyurtmaga mahsulot qo'shib bo'lmaydi."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=quantity,
                price=product.price,
                note=serializer.validated_data.get('note', ''),
                modifiers=serializer.validated_data.get('modifiers') or {},
            )

        broadcast_event('order_updated', {'order_id': order.id})

        return Response({'status': 'Item added'}, status=status.HTTP_201_CREATED)

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

        serializer = PaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        amount = serializer.validated_data['amount']

        with transaction.atomic():
            # Bir nechta kassa terminali bir vaqtda shu order'ga to'lov
            # qo'shishi mumkin (split-payment) - qatorni qulflab, statusni ham,
            # eng so'nggi balance_due'ni ham shu tranzaksiya ichida qayta
            # o'qiymiz, aks holda ikki parallel so'rov orasidagi race
            # overpayment'ga yoki yopilgan buyurtmaga to'lovga olib kelishi
            # mumkin.
            order = Order.objects.select_for_update().get(pk=order.pk)
            if order.status in ORDER_FINISHED_STATUSES:
                return Response(
                    {'detail': "Yopilgan yoki bekor qilingan buyurtmaga to'lov qo'shib bo'lmaydi."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

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
                reference=serializer.validated_data.get('reference', ''),
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

        serializer = DiscountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_amount = serializer.validated_data['discount_amount']
        new_reason = serializer.validated_data.get('discount_reason', '')

        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order.pk)
            if order.status in ORDER_FINISHED_STATUSES:
                return Response(
                    {'detail': "Yopilgan yoki bekor qilingan buyurtmaga chegirma qo'llab bo'lmaydi."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if new_amount > order.total_amount:
                return Response(
                    {'detail': f"Chegirma summasi buyurtma summasidan ({order.total_amount} so'm) katta bo'lishi mumkin emas."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            old_amount = order.discount_amount
            order.discount_amount = new_amount
            order.discount_reason = new_reason
            order.save(update_fields=['discount_amount', 'discount_reason', 'updated_at'])

        if new_amount != old_amount:
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
        if user.role == 'manager':
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

class BootstrapView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request):
        user = request.user
        
        orders_qs = Order.objects.filter(status__in=['new', 'in_progress']).prefetch_related('items__product')
        if user.role == 'waiter':
            orders_qs = orders_qs.filter(waiter=user)
        
        categories = Category.objects.all()
        products = Product.objects.filter(is_available=True, is_deleted=False)
        tables = Table.objects.filter(is_active=True)

        return Response({
            'user': UserSerializer(user).data,
            'categories': CategorySerializer(categories, many=True).data,
            'products': ProductSerializer(products, many=True).data,
            'tables': TableSerializer(tables, many=True, context={'request': request}).data,
            'active_orders': OrderSerializer(orders_qs, many=True, context={'request': request}).data,
        })


class RestaurantConfigViewSet(viewsets.ModelViewSet):
    queryset = RestaurantConfig.objects.all()
    serializer_class = RestaurantConfigSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsManagerOrAdmin()]

    def get_object(self):
        # Singleton ob'ektini qaytarish/yaratish
        obj, _ = RestaurantConfig.objects.get_or_create(pk=1)
        return obj


class AttendanceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AttendanceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'manager':
            return Attendance.objects.select_related('user').all()
        return Attendance.objects.filter(user=user)

    @extend_schema(
        request=CheckInSerializer,
        responses={201: AttendanceSerializer, 400: OpenApiResponse(ErrorDetailSerializer)}
    )
    @action(detail=False, methods=['post'], url_path='check-in')
    def check_in(self, request):
        serializer = CheckInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        latitude = serializer.validated_data['latitude']
        longitude = serializer.validated_data['longitude']
        
        try:
            attendance = services.check_in_employee(request.user, latitude, longitude)
        except services.ServiceError as exc:
            return Response({'detail': exc.message}, status=exc.status)
            
        return Response(AttendanceSerializer(attendance).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=CheckOutSerializer,
        responses={200: AttendanceSerializer, 400: OpenApiResponse(ErrorDetailSerializer)}
    )
    @action(detail=False, methods=['post'], url_path='check-out')
    def check_out(self, request):
        serializer = CheckOutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        latitude = serializer.validated_data['latitude']
        longitude = serializer.validated_data['longitude']
        
        try:
            attendance = services.check_out_employee(request.user, latitude, longitude)
        except services.ServiceError as exc:
            return Response({'detail': exc.message}, status=exc.status)
            
        return Response(AttendanceSerializer(attendance).data, status=status.HTTP_200_OK)

