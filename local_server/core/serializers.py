from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from .models import (
    User, Table, Category, Product, Order, OrderItem,
    StaffDevice, Notification,
)

TABLE_STATUS_CHOICES = ('free', 'occupied_by_me', 'occupied')

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'role', 'is_staff')

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
            'name', 'price', 'barcode', 'image', 'is_available',
        )

class OrderItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), source='product', write_only=True
    )

    class Meta:
        model = OrderItem
        fields = ('id', 'product', 'product_id', 'quantity', 'price')
        read_only_fields = ('price',)

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    waiter = UserSerializer(read_only=True)
    cashier = UserSerializer(read_only=True)
    table = TableSerializer(read_only=True)
    
    table_id = serializers.PrimaryKeyRelatedField(
        queryset=Table.objects.all(), source='table', write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Order
        fields = ('id', 'table', 'table_id', 'waiter', 'cashier', 'total_amount', 'status', 'items', 'created_at')
        read_only_fields = ('total_amount', 'waiter', 'cashier')
