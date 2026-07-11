from decimal import Decimal

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from .models import (
    User, Table, Category, Product, Order, OrderItem, Payment,
    StaffDevice, Notification,
)

TABLE_STATUS_CHOICES = ('free', 'occupied_by_me', 'occupied')

class UserSerializer(serializers.ModelSerializer):
    # AbstractUser'da blank=True (ixtiyoriy) - lekin bu yerda telefon
    # raqamidan boshqa hech qanday shaxsni aniqlovchi ma'lumot bo'lmasin
    # uchun majburiy qilib qo'yilgan.
    first_name = serializers.CharField(required=True, allow_blank=False)

    class Meta:
        model = User
        # is_staff API orqali umuman ko'rsatilmaydi/yozilmaydi (nested
        # holatda ham - received_by/waiter/cashier va h.k. shu serializer'ni
        # qayta ishlatadi) - bosh admin holatini API mijozlari bilishi/
        # o'zgartirishi shart emas, faqat Ona orqali (_provision_admin_user)
        # yoki lokal Django admin orqali boshqariladi.
        fields = ('id', 'username', 'first_name', 'last_name', 'role')

class TableSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()

    class Meta:
        model = Table
        fields = ('id', 'name', 'capacity', 'is_active', 'status', 'created_at', 'updated_at')

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
        fields = ('id', 'user', 'device_id', 'device_label', 'is_active', 'last_login_at', 'created_at')

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

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'

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
