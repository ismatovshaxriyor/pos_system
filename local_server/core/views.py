import uuid
import zoneinfo
from datetime import date as date_cls, datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.generic import TemplateView
from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework import viewsets, permissions, status, mixins
from rest_framework.authtoken.models import Token
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from . import escpos, services
from .models import User, Table, Category, Product, Order, OrderItem, Payment, StaffDevice, Notification, RestaurantConfig, Attendance, TableZone, Printer, PrintJob, Customer
from .permissions import IsAdminStaff, IsManagerOrAdmin
from .realtime import broadcast_event
from .serializers import (
    UserSerializer, TableSerializer, CategorySerializer,
    ProductSerializer, OrderSerializer, OrderItemSerializer,
    PaymentSerializer, DiscountSerializer, CreditCloseSerializer,
    StaffDeviceSerializer, NotificationSerializer,
    RegistrationCodeResponseSerializer, ErrorDetailSerializer, StatusMessageSerializer,
    RestaurantConfigSerializer, AttendanceSerializer, CheckInSerializer, CheckOutSerializer,
    TableZoneSerializer, PrinterSerializer, PrintJobSerializer, LiveTableSalesSerializer,
    PublicCategorySerializer, PublicTableLiveSerializer,
)

ORDER_FINISHED_STATUSES = ('completed', 'cancelled')

# Restoran jismonan O'zbekistonda - Django'ning global TIME_ZONE (UTC) bo'yicha
# "bugun"ni hisoblash tungi soat 24:00 atrofidagi buyurtmalarni ~5 soatga
# noto'g'ri kunga tashlab yuborardi (masalan mahalliy 00:30dagi buyurtma UTC
# bo'yicha hali "kechagi kun"). ?date= filtri shuning uchun kun chegarasini
# har doim shu zonada hisoblaydi, saqlangan created_at UTC bo'lib qolaveradi.
RESTAURANT_TZ = zoneinfo.ZoneInfo('Asia/Tashkent')

class TableZoneViewSet(viewsets.ModelViewSet):
    queryset = TableZone.objects.all()
    serializer_class = TableZoneSerializer
    permission_classes = [permissions.IsAuthenticated, IsManagerOrAdmin]

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
        summary="Xodim uchun 6-xonali bir martalik ro'yxatdan o'tish kodi yaratish",
        description="Menejer tomonidan kassir/xodim uchun 15 daqiqalik 6-xonali raqamli ro'yxatdan o'tish kodi generatsiya qilinadi.",
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

    @extend_schema(
        request=None,
        responses={200: LiveTableSalesSerializer(many=True)},
    )
    @action(detail=False, methods=['get'], url_path='live-sales')
    def live_sales(self, request):
        """
        Kassir uchun jonli stol-sotuvlari xaritasi: har bir BAND stol
        (`new`/`in_progress` buyurtmali) uchun joriy buyurtma summasi. Summalar
        `services.calculate_order_financials` orqali hisoblanadi - anti-piracy
        multiplier hisobga olinadi (aks holda bloklangan litsenziyada raqamlar
        xato bo'lardi). WS `table_status_changed` eventi kelganda klient shu
        endpoint'ni qayta so'raydi (payload yengil "qayta so'rang" signali).

        Faqat kassir/menejer uchun - afitsiantga boshqa stollardagi summalarni
        ochib qo'ymaslik uchun (TableSerializer.status ham xuddi shu sababdan
        so'rovchiga nisbiy). Menejer hammasini ko'radi.
        """
        if request.user.role not in ('cashier', 'manager'):
            return Response({'detail': "Faqat kassir yoki menejer uchun."}, status=status.HTTP_403_FORBIDDEN)

        # Litsenziya konteksti (anti-piracy multiplier) global va so'rov davomida
        # o'zgarmaydi - bir marta olib, har buyurtmaga uzatamiz (aks holda har
        # stol uchun qayta o'qilardi).
        from licensing.jwt_utils import LicenseContext

    @action(detail=True, methods=['get'], url_path='qr-code')
    def qr_code(self, request, pk=None):
        """
        Stol uchun QR kod tasvirini (PNG) Zümrad & Oltin brendingida generatsiya qilib beradi.
        Domain request headers (Host) yoki `domain` query parametri orqali aniqlanadi.
        """
        table = self.get_object()
        domain = request.query_params.get('domain', request.get_host())
        scheme = 'https' if request.is_secure() or 'hamrohpos.uz' in domain else 'http'
        qr_url = f"{scheme}://{domain}/table/{table.qr_code}/"

        import io
        import qrcode
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(qr_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#001712", back_color="#e3c282")

        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)

        from django.http import HttpResponse
        response = HttpResponse(buffer.getvalue(), content_type='image/png')
        response['Content-Disposition'] = f'inline; filename="qr_table_{table.id}.png"'
        return response
        license_ctx = LicenseContext.from_active_state()

        active_orders = Order.objects.filter(
            status__in=('new', 'in_progress'), table__isnull=False,
        ).select_related('table', 'table__zone', 'waiter').prefetch_related('items', 'payments')

        rows = []
        for order in active_orders:
            total, final, balance = services.calculate_order_financials(order, context=license_ctx)
            # Prefetch qilingan to'lovlardan hisoblaymiz - qo'shimcha so'rovsiz.
            amount_paid = sum(
                (p.amount for p in order.payments.all() if not p.is_voided), Decimal('0'),
            )
            rows.append({
                'table_id': order.table_id,
                'table_name': order.table.name,
                'zone': order.table.zone.name if order.table.zone else None,
                'order_id': order.id,
                'waiter': order.waiter.first_name if order.waiter else None,
                'guest_count': order.guest_count,
                'item_count': sum(i.quantity for i in order.items.all() if not i.is_voided),
                'total_amount': total,
                'final_amount': final,
                'amount_paid': amount_paid,
                'balance_due': balance,
                'opened_at': order.created_at,
            })
        return Response(LiveTableSalesSerializer(rows, many=True).data)

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
        if self.action in ('set_discount', 'cancel', 'close_on_credit'):
            return [permissions.IsAuthenticated(), IsManagerOrAdmin()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = Order.objects.select_related('table', 'waiter', 'cashier').prefetch_related(
            'items__product', 'payments__received_by',
        )
        user = self.request.user
        if user.role == 'waiter':
            qs = qs.filter(waiter=user)

        # ?date=today yoki ?date=YYYY-MM-DD - afitsiant/kassir/menejer
        # buyurtmalar tarixini kunlar bo'yicha ko'rishi uchun (masalan
        # afitsiant o'zining bugungi buyurtmalarini kuzatishi). Waiter uchun
        # yuqoridagi filter bilan birlashib, faqat o'zining shu kungi
        # buyurtmalarini beradi.
        date_param = self.request.query_params.get('date')
        if date_param:
            if date_param == 'today':
                target_date = timezone.now().astimezone(RESTAURANT_TZ).date()
            else:
                try:
                    target_date = date_cls.fromisoformat(date_param)
                except ValueError:
                    raise ValidationError(
                        {'date': "YYYY-MM-DD formatida yoki 'today' bo'lishi kerak."},
                    )
            day_start = datetime.combine(target_date, time.min, tzinfo=RESTAURANT_TZ)
            qs = qs.filter(created_at__gte=day_start, created_at__lt=day_start + timedelta(days=1))

        return qs.order_by('-created_at')

    @extend_schema(
        request=OrderSerializer,
        responses={201: OrderSerializer, 200: OrderSerializer}
    )
    def create(self, request, *args, **kwargs):
        # Oflayn-birinchi mijoz uchun idempotent yaratish: mijoz o'zi
        # generatsiya qilgan sync_uuid bilan yuboradi; so'rov takrorlansa
        # (javob yo'qolgan/retry) yangi buyurtma ochilmasdan mavjudi
        # qaytariladi. sync_uuid modelda editable=False bo'lgani uchun
        # serializer uni e'tiborsiz qoldiradi - shu sababli qiymat quyida
        # perform_create'ga alohida uzatiladi, aks holda birinchi so'rovda
        # tasodifiy UUID saqlanib, retry hech qachon mos kelmas edi.
        raw_sync_uuid = request.data.get('sync_uuid') if isinstance(request.data, dict) else None
        client_sync_uuid = None
        if raw_sync_uuid:
            try:
                client_sync_uuid = uuid.UUID(str(raw_sync_uuid))
            except (ValueError, TypeError):
                return Response(
                    {'detail': "sync_uuid yaroqli UUID bo'lishi kerak."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            existing_order = Order.objects.filter(sync_uuid=client_sync_uuid).first()
            if existing_order:
                serializer = self.get_serializer(existing_order)
                return Response(serializer.data, status=status.HTTP_200_OK)

        self._client_sync_uuid = client_sync_uuid
        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError:
            # Ikki parallel retry bir xil sync_uuid bilan poyga qildi -
            # birinchisi yutgan, mavjud buyurtmani qaytaramiz.
            existing_order = (
                Order.objects.filter(sync_uuid=client_sync_uuid).first()
                if client_sync_uuid else None
            )
            if existing_order is None:
                raise
            serializer = self.get_serializer(existing_order)
            return Response(serializer.data, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        extra = {}
        client_sync_uuid = getattr(self, '_client_sync_uuid', None)
        if client_sync_uuid is not None:
            extra['sync_uuid'] = client_sync_uuid
        order = serializer.save(waiter=self.request.user, **extra)
        if order.status == 'in_progress':
            broadcast_event('order_updated', {'order_id': order.id})
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

            _, _, balance_due = services.calculate_order_financials(order)
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
        request=CreditCloseSerializer,
        responses={
            200: OrderSerializer,
            400: OpenApiResponse(ErrorDetailSerializer, description="Buyurtma allaqachon yopilgan yoki qarzi yo'q."),
            404: OpenApiResponse(ErrorDetailSerializer, description="Mijoz topilmadi."),
        },
    )
    # Ruxsat get_permissions()'da (IsManagerOrAdmin) - qarzga yozish moliyaviy
    # jihatdan nozik amal, chegirma/bekor qilish bilan bir xil darajada.
    @action(detail=True, methods=['post'], url_path='close-on-credit')
    def close_on_credit(self, request, pk=None):
        """
        Buyurtmani mijozga (kreditga) yozib yopadi: qolgan qarz mijoz balansiga
        qo'shiladi (`DebtTransaction(credit_sale)`), buyurtma `completed` bo'ladi.
        Avval qisman naqd to'lov qo'shilgan bo'lsa - faqat QOLGAN qarz yoziladi.
        Strict `close` (to'liq to'lov talab qiladi) o'zgarmaydi.
        """
        order = self.get_object()

        serializer = CreditCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = get_object_or_404(
            Customer, pk=serializer.validated_data['customer_id'], is_active=True,
        )

        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order.pk)
            if order.status in ORDER_FINISHED_STATUSES:
                return Response(
                    {'detail': 'Order already completed or cancelled'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            _, _, balance_due = services.calculate_order_financials(order)
            if balance_due <= 0:
                return Response(
                    {'detail': "Buyurtmada qarz yo'q - oddiy yopish (close) dan foydalaning."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            services.record_credit_sale(
                order=order, customer=customer, amount=balance_due, created_by=request.user,
            )
            order.customer = customer
            order.status = 'completed'
            order.cashier = request.user
            order.save(update_fields=['customer', 'status', 'cashier', 'updated_at'])

        broadcast_event('order_updated', {'order_id': order.id})
        if order.table_id:
            broadcast_event('table_status_changed', {'table_id': order.table_id})

        return Response(OrderSerializer(order, context={'request': request}).data)

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
            
        services.send_order_to_kitchen(order)
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
        description="Buyurtmaga bitta yoki bir nechta mahsulot qo'shish. So'rov tanasida bitta obyekt yoki obyektlar ro'yxati (JSON massiv) yuborilishi mumkin.",
        request=OrderItemSerializer,
        responses={
            201: StatusMessageSerializer,
            400: OpenApiResponse(description="Validatsiya xatosi (masalan noto'g'ri product_id)."),
        },
    )
    @action(detail=True, methods=['post'])
    def add_item(self, request, pk=None):
        order = self.get_object()
        data = request.data
        is_many = isinstance(data, list)

        serializer = OrderItemSerializer(data=data, many=is_many)
        serializer.is_valid(raise_exception=True)
        items_data = serializer.validated_data if is_many else [serializer.validated_data]

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

            for item_data in items_data:
                product = item_data['product']
                quantity = item_data.get('quantity', 1)
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=quantity,
                    price=product.price,
                    note=item_data.get('note', ''),
                    modifiers=item_data.get('modifiers') or {},
                )

        if order.status == 'in_progress':
            services.send_order_to_kitchen(order)

        broadcast_event('order_updated', {'order_id': order.id})
        # Stol summasi o'zgardi - kassirning jonli stol-sotuvlari xaritasi
        # /api/tables/live-sales/ ni qayta so'rashi uchun signal.
        if order.table_id:
            broadcast_event('table_status_changed', {'table_id': order.table_id})

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

            _, _, balance_due = services.calculate_order_financials(order)
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
        # To'lov stolning qolgan qarzini o'zgartirdi - jonli stol-sotuvlari signal.
        if order.table_id:
            broadcast_event('table_status_changed', {'table_id': order.table_id})

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

            if new_amount > services.calculate_order_financials(order)[0]:
                return Response(
                    {'detail': f"Chegirma summasi buyurtma summasidan ({services.calculate_order_financials(order)[0]} so'm) katta bo'lishi mumkin emas."},
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
            # Chegirma stol summasini o'zgartirdi - jonli stol-sotuvlari signal.
            if order.table_id:
                broadcast_event('table_status_changed', {'table_id': order.table_id})

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

    @extend_schema(request=None, responses={200: StaffDeviceSerializer, 400: OpenApiResponse(ErrorDetailSerializer)})
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        device = self.get_object()
        try:
            approved = services.approve_device(device.pk, request.user)
        except services.ServiceError as exc:
            return Response({"detail": exc.message}, status=exc.status)
        return Response(StaffDeviceSerializer(approved).data)


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
        tables = Table.objects.filter(is_active=True).select_related('zone')
        table_zones = TableZone.objects.all()

        # context={'request': ...} hammasiga - ImageField'lar (category/product
        # rasmi) kontekstsiz nisbiy URL (/media/...) qaytaradi, ViewSet'lar
        # esa absolyut qaytaradi; mobil mijoz ikkala ko'rinishga duch
        # kelmasligi kerak.
        context = {'request': request}
        return Response({
            'user': UserSerializer(user, context=context).data,
            'categories': CategorySerializer(categories, many=True, context=context).data,
            'products': ProductSerializer(products, many=True, context=context).data,
            'table_zones': TableZoneSerializer(table_zones, many=True, context=context).data,
            'tables': TableSerializer(tables, many=True, context=context).data,
            'active_orders': OrderSerializer(orders_qs, many=True, context=context).data,
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


class PrinterViewSet(viewsets.ModelViewSet):
    queryset = Printer.objects.all()
    serializer_class = PrinterSerializer
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses={200: dict})
    @action(detail=False, methods=['get'], url_path='category-options')
    def category_options(self, request):
        """
        Yangi printer yaratilganda unga qaysi kategoriyalarni bog'lash
        mumkinligini tanlash uchun yengil ro'yxat. Bu qasddan to'liq
        `CategoryViewSet` (u `IsManagerOrAdmin` bilan cheklangan va
        nom/rasm kabi tahririy maydonlarni ham ochadi) o'rniga faqat shu
        tanlov uchun kerakli maydonlarni qaytaradi - shuning uchun
        printerni boshqara oladigan har qanday xodim (manager bo'lishi
        shart emas, kitchen dashboard'ning xizmat hisobi ham) kategoriya
        nomi/rasmini o'zgartira olmasdan turib qaysi kategoriya qaysi
        printerga chop etilishini ko'ra/bog'lay oladi.
        """
        categories = Category.objects.select_related('printer').order_by('name').values(
            'id', 'name', 'printer_id', 'printer__name',
        )
        return Response(list(categories))

    @extend_schema(request=None, responses={200: StatusMessageSerializer, 400: OpenApiResponse(ErrorDetailSerializer)})
    @action(detail=True, methods=['post'], url_path='set-categories')
    def set_categories(self, request, pk=None):
        """Shu printerga aynan qaysi kategoriyalar bog'langanini to'liq almashtiradi (tanlanmaganlari bo'shatiladi)."""
        printer = self.get_object()
        category_ids = request.data.get('category_ids', [])
        if not isinstance(category_ids, list):
            return Response({'detail': "category_ids ro'yxat bo'lishi kerak."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            Category.objects.filter(printer=printer).exclude(id__in=category_ids).update(printer=None)
            Category.objects.filter(id__in=category_ids).update(printer=printer)

        return Response({'status': 'Kategoriyalar yangilandi'})

    @extend_schema(
        request=None,
        responses={
            200: StatusMessageSerializer,
            400: OpenApiResponse(ErrorDetailSerializer, description="Printerga IP manzil kiritilmagan (virtual printer)."),
            502: OpenApiResponse(ErrorDetailSerializer, description="Printerga ulanib bo'lmadi."),
        },
    )
    @action(detail=True, methods=['post'], url_path='test-print')
    def test_print(self, request, pk=None):
        """
        Jismoniy printerni sozlashda tekshirish: ESC/POS test chekni sinxron
        yuboradi (lotin/kirill kodlash namunalari, ustun eni, avtokesish).
        Ataylab task navbatiga qo'ymaydi - sozlayotgan odam natijani darhol
        bilishi kerak; 5s timeout so'rovni cheklab turadi.
        """
        printer = self.get_object()
        if not printer.is_network:
            return Response(
                {'detail': "Bu printerga IP manzil kiritilmagan - avval ip_address maydonini to'ldiring."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = escpos.render_test_ticket(
            printer_name=printer.name,
            endpoint=f"{printer.ip_address}:{printer.port}",
            width=printer.chars_per_line or escpos.DEFAULT_WIDTH,
        )
        try:
            escpos.send_tcp(printer.ip_address.strip(), printer.port, payload, timeout=5.0)
        except OSError as exc:
            return Response(
                {'detail': f"Printerga ulanib bo'lmadi ({printer.ip_address}:{printer.port}): {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({'status': 'Test chek yuborildi'})


class PrintJobViewSet(viewsets.ModelViewSet):
    queryset = PrintJob.objects.all().order_by('-created_at')
    serializer_class = PrintJobSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # ?printer=<id> - bitta stansiya sahifasi (kitchen_dashboard.html)
        # faqat o'ziga tegishli navbatni so'raydi, boshqa printerlarning
        # cheklarini butunlay olib kelmasdan.
        qs = super().get_queryset()
        printer_id = self.request.query_params.get('printer')
        if printer_id:
            qs = qs.filter(printer_id=printer_id)
        return qs

    @action(detail=True, methods=['post'], url_path='mark-printed')
    def mark_printed(self, request, pk=None):
        job = self.get_object()
        job.status = 'printed'
        job.save(update_fields=['status', 'updated_at'])
        broadcast_event('print_job_updated', {'job_id': job.id, 'status': 'printed'})
        return Response({'status': 'Job marked as printed'})

    @action(detail=True, methods=['post'], url_path='mark-failed')
    def mark_failed(self, request, pk=None):
        job = self.get_object()
        job.status = 'failed'
        job.save(update_fields=['status', 'updated_at'])
        broadcast_event('print_job_updated', {'job_id': job.id, 'status': 'failed'})
        return Response({'status': 'Job marked as failed'})


# Oshxona ekrani jismoniy qurilma sifatida restoran ichida turadi - xodimdan
# har safar telefon+parol talab qilish noqulay (umumiy planshet/monitor).
# Shu sababli bu sahifada login ekrani yo'q: doimiy, oldindan tayinlangan
# xizmat hisobi (pastda) ga tegishli token+device_id sahifa render
# qilinganda shablonga ko'rinmas holda joylab beriladi.
#
# Xavfsizlik chegarasi: bu hisob har doim `role='cashier'` va `is_staff=False`
# bo'lib qoladi - `IsManagerOrAdmin`ning yozish tekshiruvi `user.is_staff or
# user.role == 'manager'` ekanini unutmang (Auth quirks - is_staff=True bu
# yerda moliyaviy amallarni (chegirma/bekor qilish/mahsulot-jadval
# sozlamalari) ham ochib qo'yardi). "view-source" orqali token oshkor
# bo'lishi mumkinligi tan olingan-va-qabul qilingan tavakkal - blast radius
# oddiy kassir darajasidan oshmasligi kerak.
KITCHEN_SERVICE_USERNAME = '+998000000001'
KITCHEN_SERVICE_DEVICE_ID = 'kitchen-dashboard-service'


class KitchenDashboardView(TemplateView):
    """
    `printer_id` URL kwarg'i bo'lmasa - barcha printerlar ro'yxati (stansiya
    tanlash sahifasi). Bo'lsa - shu bitta printerning navbati (jismoniy
    stansiya ekrani uchun katta, sodda ko'rinish - qarang: shablon).
    """
    template_name = 'core/kitchen_dashboard.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['ws_token'] = self._get_or_create_service_token()
        context['ws_device_id'] = KITCHEN_SERVICE_DEVICE_ID

        printer_id = kwargs.get('printer_id')
        if printer_id is not None:
            printer = get_object_or_404(Printer, pk=printer_id)
            context['station_printer_id'] = printer.id
            context['station_printer_name'] = printer.name
        else:
            context['station_printer_id'] = None
            context['station_printer_name'] = ''
        return context

    @staticmethod
    def _get_or_create_service_token():
        user, created = User.objects.get_or_create(
            username=KITCHEN_SERVICE_USERNAME,
            defaults={'role': 'cashier', 'first_name': 'Oshxona ekrani'},
        )
        if created:
            # Parol orqali hech qachon kirilmaydi - shuning uchun
            # /api/auth/login/ orqali bu hisobga kirish imkonsiz qolishi
            # kerak (faqat quyidagi StaffDevice+Token orqali).
            user.set_unusable_password()
            user.save(update_fields=['password'])

        device, _ = StaffDevice.objects.get_or_create(
            user=user, device_id=KITCHEN_SERVICE_DEVICE_ID,
            defaults={'device_label': 'Oshxona ekrani (avto)', 'is_active': True, 'is_approved': True},
        )
        if not device.is_active or not device.is_approved:
            device.is_active = True
            device.is_approved = True
            device.save(update_fields=['is_active', 'is_approved', 'updated_at'])

        token, _ = Token.objects.get_or_create(user=user)
        return token.key


# ==============================================================================
# PUBLIC QR CODE MENU & LIVE TABLE VIEWS
# ==============================================================================

class PublicMenuView(APIView):
    """
    Ochiq raqamli menyu API: Har qanday mijoz autentifikatsiyasiz menyu
    va taomlar narxi hamda mavjudligini ko'rishi mumkin.
    """
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Ochiq menyu",
        description="Barcha aktiv kategoriyalar va ulardagi mavjud taomlar menyusini qaytaradi.",
        responses={200: PublicCategorySerializer(many=True)}
    )
    def get(self, request):
        categories = Category.objects.all().order_by('name')
        serializer = PublicCategorySerializer(categories, many=True, context={'request': request})
        return Response(serializer.data)


def _get_public_table(qr_code):
    """
    qr_code bo'yicha stolni aniqlaydi. Agar qr_code == 'demo' bo'lsa
    yoki yaroqsiz bo'lsa, bazadagi birinchi faol stolni moslab beradi.
    """
    if str(qr_code).lower() == 'demo':
        table = Table.objects.filter(is_active=True).first()
        if not table:
            table = Table.objects.create(name='Demo Stol', is_active=True)
        return table

    try:
        table_uuid = uuid.UUID(str(qr_code))
        return get_object_or_404(Table, qr_code=table_uuid, is_active=True)
    except (ValueError, TypeError):
        table = Table.objects.filter(is_active=True).first()
        if not table:
            table = Table.objects.create(name='Demo Stol', is_active=True)
        return table


class PublicTableLiveView(APIView):
    """
    Ochiq stol holati API: Mijoz stoldagi QR kodni skanerlaganda (qr_code UUID)
    shu stolning joriy holati va faol buyurtmasidagi narxlarni ko'ra oladi.
    """
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Stolning jonli hisobi",
        description="QR UUID orqali stolni topadi va undagi faol buyurtma taomlari hamda jami summasini qaytaradi.",
        responses={200: PublicTableLiveSerializer}
    )
    def get(self, request, qr_code):
        table = _get_public_table(qr_code)
        serializer = PublicTableLiveSerializer(table, context={'request': request})
        return Response(serializer.data)


class PublicCallWaiterView(APIView):
    """
    Mijoz tomonidan stoldan ofitsiantni chaqirish (yoki hisob so'rash) API'si.
    WebSocket orqali barcha faol afitsiantlar va kassa ekraniga real-vaqtda bildirishnoma yuboradi.
    """
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Ofitsiantni chaqirish",
        description="QR UUID bo'yicha stolni topib, afitsiant va kassa ekraniga chaqiruv yuboradi.",
        responses={200: StatusMessageSerializer}
    )
    def post(self, request, qr_code):
        table = _get_public_table(qr_code)
        reason = request.data.get('reason', 'Ofitsiant chaqiruvi')

        # Active order waiter or general broadcast
        active_order = table.orders.filter(status__in=['new', 'in_progress']).order_by('-created_at').first()
        recipient = active_order.waiter if active_order and active_order.waiter else None

        message = f"{table.name} stolidan chaqiruv: {reason}"
        notif = Notification.objects.create(
            recipient=recipient,
            notif_type='system',
            message=message,
            payload={
                'event_type': 'call_waiter',
                'table_id': table.id,
                'table_name': table.name,
                'reason': reason,
            }
        )

        broadcast_event(
            event_type='call_waiter',
            payload={
                'notification_id': notif.id,
                'table_id': table.id,
                'table_name': table.name,
                'reason': reason,
                'message': message,
                'created_at': timezone.now().isoformat(),
            }
        )

        return Response({'status': 'ok', 'message': 'Ofitsiantga xabar yuborildi.'}, status=status.HTTP_200_OK)


class QRAppView(TemplateView):
    """
    Mijozlar stoldagi QR kodni skanerlaganda ochiladigan React (Vite) Single Page App shabloni.
    """
    template_name = 'core/qr_app.html'





