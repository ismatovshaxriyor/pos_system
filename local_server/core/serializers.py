from decimal import Decimal

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from .models import (
    User, Table, Category, Product, Order, OrderItem, Payment,
    StaffDevice, Notification, RestaurantConfig, Attendance, TableZone,
    Printer, PrintJob,
)

TABLE_STATUS_CHOICES = ('free', 'occupied_by_me', 'occupied')

class UserSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(required=True, allow_blank=False)

    class Meta:
        model = User
        fields = ('id', 'username', 'first_name', 'last_name', 'role')

class TableZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = TableZone
        fields = ('id', 'name', 'created_at', 'updated_at')

class TableSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    zone = TableZoneSerializer(read_only=True)
    zone_id = serializers.PrimaryKeyRelatedField(
        queryset=TableZone.objects.all(), source='zone', write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Table
        fields = ('id', 'name', 'capacity', 'is_active', 'status', 'zone', 'zone_id', 'created_at', 'updated_at')

    @extend_schema_field(serializers.ChoiceField(choices=TABLE_STATUS_CHOICES))
    def get_status(self, obj):
        """
        `free`/`occupied_by_me`/`occupied` - so'rovchi kimligiga qarab
        farqlanadi (shu sababli bu qiymat hech qachon WebSocket orqali
        tayyor holda yuborilmaydi, faqat shu joyda so'rov vaqtida
        hisoblanadi). Buyurtma/ofitsiant tafsiloti bu serializerda umuman
        nested qilinmagani uchun boshqa xodimga tegishli buyurtma haqida
        hech narsa sizib chiqmaydi.
        """
        request = self.context.get('request')
        active_order = obj.orders.filter(status__in=('new', 'in_progress')).order_by('-created_at').first()
        if not active_order:
            return 'free'
        if request and active_order.waiter_id == request.user.id:
            return 'occupied_by_me'
        return 'occupied'

class StaffDeviceSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = StaffDevice
        fields = ('id', 'user', 'device_id', 'device_label', 'is_active', 'is_approved', 'last_login_at', 'created_at')

class WaiterLoginSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=15)
    password = serializers.CharField(max_length=128)
    device_id = serializers.CharField(max_length=255)
    device_label = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ('id', 'notif_type', 'message', 'payload', 'is_read', 'read_at', 'created_at')
        read_only_fields = fields

class DeviceRegisterSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=15)
    code = serializers.CharField(max_length=12)
    device_id = serializers.CharField(max_length=255)
    pin = serializers.CharField(max_length=6)
    device_label = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')

class PinLoginSerializer(serializers.Serializer):
    device_id = serializers.CharField(max_length=255)
    pin = serializers.CharField(max_length=6)

class AuthTokenResponseSerializer(serializers.Serializer):
    """`DeviceRegisterView`/`PinLoginView` javobi - faqat OpenAPI hujjatlash uchun."""
    token = serializers.CharField()
    user = UserSerializer()

class RegistrationCodeResponseSerializer(serializers.Serializer):
    """`generate-registration-code` action javobi - faqat OpenAPI hujjatlash uchun."""
    code = serializers.CharField()
    expires_at = serializers.DateTimeField()
    user = UserSerializer()

class ErrorDetailSerializer(serializers.Serializer):
    """Xatolik javoblari (`{"detail": "..."}`) - faqat OpenAPI hujjatlash uchun."""
    detail = serializers.CharField()

class StatusMessageSerializer(serializers.Serializer):
    """Oddiy `{"status": "..."}` javoblari (masalan `close`) - faqat OpenAPI hujjatlash uchun."""
    status = serializers.CharField()

class PrinterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Printer
        fields = ('id', 'name', 'ip_address', 'port', 'is_active', 'created_at', 'updated_at')

class CategorySerializer(serializers.ModelSerializer):
    printer = PrinterSerializer(read_only=True)
    printer_id = serializers.PrimaryKeyRelatedField(
        queryset=Printer.objects.all(), source='printer', write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Category
        fields = ('id', 'name', 'image', 'printer', 'printer_id', 'created_at', 'updated_at')

class ProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), source='category', write_only=True
    )

    class Meta:
        model = Product
        fields = (
            'id', 'category', 'category_id', 'sync_uuid', 'is_synced', 'created_at', 'updated_at',
            'name', 'price', 'barcode', 'image', 'is_available', 'cost_price', 'tax_rate', 'is_deleted',
        )
        # O'chirish faqat DELETE /api/products/<id>/ (soft-delete) orqali;
        # o'chirilgan mahsulot ro'yxatlardan chiqib ketadi, tiklash - Django
        # admin orqali.
        read_only_fields = ('is_deleted',)

class OrderItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    # Soft-delete qilingan mahsulotni yangi buyurtmaga qo'shib bo'lmaydi -
    # menyudan olib tashlangan, lekin eski OrderItem'lar PROTECT tufayli
    # unga ishora qilishda davom etadi.
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_deleted=False), source='product', write_only=True
    )

    class Meta:
        model = OrderItem
        fields = ('id', 'product', 'product_id', 'quantity', 'price', 'status', 'note', 'modifiers', 'is_voided')
        # status (oshxona oqimi) va is_voided (void/refund) uchun hali API
        # oqimi qurilmagan - client ularni to'g'ridan-to'g'ri yoza olmasin,
        # aks holda keyinchalik qo'shiladigan tekshiruvli action'lar
        # chetlab o'tiladi. price - narx doim serverda Product.price'dan.
        read_only_fields = ('price', 'status', 'is_voided')

class PaymentSerializer(serializers.ModelSerializer):
    received_by = UserSerializer(read_only=True)

    class Meta:
        model = Payment
        fields = ('id', 'amount', 'method', 'received_by', 'created_at', 'is_voided', 'refunded_of', 'reference')
        # is_voided/refunded_of - void/refund oqimi hali qurilmagan; client
        # ularni yozolmaydi (amount_paid hisobiga ta'sir qilardi).
        read_only_fields = ('received_by', 'created_at', 'is_voided', 'refunded_of')

class DiscountSerializer(serializers.Serializer):
    """`set_discount` action so'rov tanasi uchun - haqiqiy validatsiya."""
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))
    discount_reason = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    waiter = UserSerializer(read_only=True)
    cashier = UserSerializer(read_only=True)
    table = TableSerializer(read_only=True)

    table_id = serializers.PrimaryKeyRelatedField(
        queryset=Table.objects.all(), source='table', write_only=True, required=False, allow_null=True
    )

    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    final_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    balance_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Order
        fields = (
            'id', 'sync_uuid', 'table', 'table_id', 'waiter', 'cashier', 'order_type', 'total_amount', 'tax_amount', 'service_charge',
            'discount_amount', 'discount_reason', 'final_amount', 'amount_paid', 'balance_due',
            'status', 'note', 'guest_count', 'items', 'payments', 'created_at',
        )
        # tax_amount/service_charge - moliyaviy maydonlar, discount_amount
        # bilan bir xil tamoyil: client to'g'ridan-to'g'ri yozolmaydi (hozircha
        # ularni to'ldiradigan server-tomon oqim ham yo'q - qiymatlar 0).
        read_only_fields = (
            'total_amount', 'waiter', 'cashier', 'discount_amount', 'discount_reason',
            'status', 'tax_amount', 'service_charge',
        )


class RestaurantConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurantConfig
        fields = ('id', 'latitude', 'longitude', 'attendance_radius', 'created_at', 'updated_at')


class AttendanceSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = Attendance
        fields = (
            'id', 'user', 'check_in', 'check_out',
            'check_in_latitude', 'check_in_longitude',
            'check_out_latitude', 'check_out_longitude',
            'created_at', 'updated_at'
        )
        read_only_fields = fields


class CheckInSerializer(serializers.Serializer):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6)


class CheckOutSerializer(serializers.Serializer):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6)


class PrintJobSerializer(serializers.ModelSerializer):
    printer_name = serializers.CharField(source='printer.name', read_only=True)
    table_name = serializers.CharField(source='order.table.name', read_only=True, default="Takeaway")
    waiter_name = serializers.CharField(source='order.waiter.first_name', read_only=True, default="Noma'lum")

    class Meta:
        model = PrintJob
        fields = ('id', 'printer', 'printer_name', 'order', 'table_name', 'waiter_name', 'items_snapshot', 'status', 'created_at', 'updated_at')
        read_only_fields = ('id', 'items_snapshot', 'created_at', 'updated_at')

