from decimal import Decimal

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from .models import (
    User, Table, Category, Product, Order, OrderItem, Payment,
    StaffDevice, Notification, RestaurantConfig, Attendance, TableZone,
    Printer, PrintJob, Customer, DebtTransaction,
    Supplier, Ingredient, ProductIngredient, Purchase, PurchaseItem, StockMovement,
)

TABLE_STATUS_CHOICES = ('free', 'occupied_by_me', 'occupied')

class UserSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(required=True, allow_blank=False)
    # write_only - hech qachon javobda qaytmaydi. Faqat manager/waiter uchun
    # ishlatiladi (pastga, validate()ga qarang) - kassir/afitsiant (PIN+
    # qurilma orqali kiruvchi rollar) uchun haqiqiy password o'rnatilsa,
    # DeviceTokenAuthentication'ni butunlay chetlab, /api/auth/login/ orqali
    # qurilma tekshiruvisiz kirish imkoni ochilib qolar edi (User.pin_hash
    # yonidagi izohga qarang - local_server/core/models.py).
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)

    class Meta:
        model = User
        fields = ('id', 'username', 'first_name', 'last_name', 'role', 'password')

    def validate(self, attrs):
        role = attrs.get('role', getattr(self.instance, 'role', None))
        has_password = 'password' in attrs
        if role == 'cashier':
            if has_password:
                raise serializers.ValidationError({
                    'password': "Kassir uchun parol o'rnatilmaydi - registratsiya kodi orqali PIN beriladi.",
                })
        elif role in ('manager', 'waiter'):
            if self.instance is None and not has_password:
                raise serializers.ValidationError({
                    'password': "Menejer/ofitsiant yaratishda parol majburiy.",
                })
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=['password'])
        return user

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

class LiveTableSalesSerializer(serializers.Serializer):
    """
    Kassir jonli stol-sotuvlari javobi (GET /api/tables/live-sales/). Faqat
    o'qish/hujjatlash uchun - summalar view'da calculate_order_financials
    orqali hisoblanadi.
    """
    table_id = serializers.IntegerField()
    table_name = serializers.CharField()
    zone = serializers.CharField(allow_null=True)
    order_id = serializers.IntegerField()
    waiter = serializers.CharField(allow_null=True)
    guest_count = serializers.IntegerField()
    item_count = serializers.IntegerField()
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    final_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2)
    balance_due = serializers.DecimalField(max_digits=12, decimal_places=2)
    opened_at = serializers.DateTimeField()

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
        fields = ('id', 'name', 'ip_address', 'port', 'chars_per_line', 'is_active', 'created_at', 'updated_at')

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
    id = serializers.IntegerField(required=False)
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

class CustomerSlimSerializer(serializers.ModelSerializer):
    """Buyurtma ichida nested - balansni oshkor qilmaydi (afitsiant order o'qishida ko'rmasin)."""
    class Meta:
        model = Customer
        fields = ('id', 'first_name', 'last_name', 'phone')

class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = (
            'id', 'first_name', 'last_name', 'phone', 'note', 'balance',
            'is_active', 'created_at', 'updated_at',
        )
        # balance faqat kreditga-yopish/qarz-to'lash oqimi orqali o'zgaradi -
        # client to'g'ridan-to'g'ri yozolmaydi (aks holda qarz hisobi buzilardi).
        read_only_fields = ('balance',)

class DebtTransactionSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)

    class Meta:
        model = DebtTransaction
        fields = (
            'id', 'customer', 'amount', 'txn_type', 'order', 'method',
            'note', 'created_by', 'created_at',
        )
        read_only_fields = fields

class CreditCloseSerializer(serializers.Serializer):
    """`close_on_credit` action so'rov tanasi."""
    customer_id = serializers.IntegerField()

class RepaymentSerializer(serializers.Serializer):
    """`CustomerViewSet.repay` so'rov tanasi."""
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    method = serializers.ChoiceField(choices=Payment.METHOD_CHOICES, default='cash')
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, required=False)
    payments = PaymentSerializer(many=True, read_only=True)
    waiter = UserSerializer(read_only=True)
    cashier = UserSerializer(read_only=True)
    table = TableSerializer(read_only=True)
    customer = CustomerSlimSerializer(read_only=True)

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
            'id', 'sync_uuid', 'table', 'table_id', 'waiter', 'cashier', 'customer', 'order_type', 'total_amount', 'tax_amount', 'service_charge',
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

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        from django.db import transaction
        from . import services

        with transaction.atomic():
            order = super().create(validated_data)
            
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
            
            if items_data:
                order.status = 'in_progress'
                order.save(update_fields=['status', 'updated_at'])
                services.send_order_to_kitchen(order)
                
        return order

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        from django.db import transaction
        from . import services

        with transaction.atomic():
            instance = super().update(instance, validated_data)
            
            if items_data is not None:
                existing_items = {item.id: item for item in instance.items.all()}
                keep_item_ids = []
                new_items_created = False
                
                for item_data in items_data:
                    item_id = item_data.get('id')
                    product = item_data.get('product')
                    quantity = item_data.get('quantity', 1)
                    note = item_data.get('note', '')
                    modifiers = item_data.get('modifiers') or {}
                    
                    if item_id and item_id in existing_items:
                        item = existing_items[item_id]
                        item.quantity = quantity
                        item.note = note
                        item.modifiers = modifiers
                        if product:
                            item.product = product
                        item.save()
                        keep_item_ids.append(item.id)
                    else:
                        if product:
                            item = OrderItem.objects.create(
                                order=instance,
                                product=product,
                                quantity=quantity,
                                price=product.price,
                                note=note,
                                modifiers=modifiers,
                            )
                            keep_item_ids.append(item.id)
                            new_items_created = True
                            
                for item_id, item in existing_items.items():
                    if item_id not in keep_item_ids:
                        item.delete()
                        
                if new_items_created and instance.status == 'in_progress':
                    services.send_order_to_kitchen(instance)
                    
        return instance


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


# ==============================================================================
# OMBOR (Inventory)
# ==============================================================================

class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ('id', 'name', 'phone', 'note', 'is_active', 'created_at', 'updated_at')


class IngredientSlimSerializer(serializers.ModelSerializer):
    """Nested joylar uchun yengil ko'rinish (retsept/kirim/harakat ichida)."""
    class Meta:
        model = Ingredient
        fields = ('id', 'name', 'unit')


class IngredientSerializer(serializers.ModelSerializer):
    supplier = SupplierSerializer(read_only=True)
    supplier_id = serializers.PrimaryKeyRelatedField(
        queryset=Supplier.objects.all(), source='supplier', write_only=True, required=False, allow_null=True,
    )
    is_low = serializers.BooleanField(read_only=True)

    class Meta:
        model = Ingredient
        fields = (
            'id', 'name', 'unit', 'current_stock', 'min_stock', 'cost_price',
            'supplier', 'supplier_id', 'is_low', 'is_active', 'created_at', 'updated_at',
        )
        # Zaxira faqat harakat (kirim/sotuv/tuzatish) orqali o'zgaradi - ledger
        # yaxlitligi uchun. Boshlang'ich qoldiqni `adjust` action bilan qo'yiladi.
        read_only_fields = ('current_stock',)


class RecipeItemSerializer(serializers.ModelSerializer):
    """Retsept qatori (ProductIngredient)."""
    product = serializers.PrimaryKeyRelatedField(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_deleted=False), source='product', write_only=True,
    )
    ingredient = IngredientSlimSerializer(read_only=True)
    ingredient_id = serializers.PrimaryKeyRelatedField(
        queryset=Ingredient.objects.all(), source='ingredient', write_only=True,
    )

    class Meta:
        model = ProductIngredient
        fields = ('id', 'product', 'product_id', 'ingredient', 'ingredient_id', 'quantity')


class PurchaseItemSerializer(serializers.ModelSerializer):
    ingredient = IngredientSlimSerializer(read_only=True)
    ingredient_id = serializers.PrimaryKeyRelatedField(
        queryset=Ingredient.objects.all(), source='ingredient', write_only=True,
    )

    class Meta:
        model = PurchaseItem
        fields = ('id', 'ingredient', 'ingredient_id', 'quantity', 'unit_cost')


class PurchaseSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(many=True)
    supplier = SupplierSerializer(read_only=True)
    supplier_id = serializers.PrimaryKeyRelatedField(
        queryset=Supplier.objects.all(), source='supplier', write_only=True, required=False, allow_null=True,
    )
    total_cost = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Purchase
        fields = ('id', 'supplier', 'supplier_id', 'note', 'items', 'total_cost', 'created_at')
        read_only_fields = ('created_at',)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Kirimda kamida bitta ingredient bo'lishi kerak.")
        return value

    def create(self, validated_data):
        # Zaxirani qo'llash (StockMovement + current_stock) viewset perform_create'da
        # services.apply_purchase orqali - bu yerda faqat hujjat + qatorlar yaratiladi.
        items_data = validated_data.pop('items')
        purchase = Purchase.objects.create(**validated_data)
        PurchaseItem.objects.bulk_create([
            PurchaseItem(purchase=purchase, **item) for item in items_data
        ])
        return purchase


class StockMovementSerializer(serializers.ModelSerializer):
    ingredient_name = serializers.CharField(source='ingredient.name', read_only=True)
    created_by = UserSerializer(read_only=True)

    class Meta:
        model = StockMovement
        fields = (
            'id', 'ingredient', 'ingredient_name', 'quantity', 'movement_type',
            'order', 'purchase', 'note', 'created_by', 'created_at',
        )
        read_only_fields = fields


class StockAdjustSerializer(serializers.Serializer):
    """`IngredientViewSet.adjust` so'rov tanasi: new_quantity YOKI delta (bittasi)."""
    new_quantity = serializers.DecimalField(max_digits=12, decimal_places=3, required=False)
    delta = serializers.DecimalField(max_digits=12, decimal_places=3, required=False)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')

    def validate(self, attrs):
        has_new = attrs.get('new_quantity') is not None
        has_delta = attrs.get('delta') is not None
        if has_new == has_delta:
            raise serializers.ValidationError(
                "new_quantity yoki delta - aynan bittasini bering.",
            )
        return attrs


class PrintJobSerializer(serializers.ModelSerializer):
    printer_name = serializers.CharField(source='printer.name', read_only=True)
    table_name = serializers.CharField(source='order.table.name', read_only=True, default="Takeaway")
    waiter_name = serializers.CharField(source='order.waiter.first_name', read_only=True, default="Noma'lum")

    class Meta:
        model = PrintJob
        fields = ('id', 'printer', 'printer_name', 'order', 'table_name', 'waiter_name', 'items_snapshot', 'status', 'created_at', 'updated_at')
        read_only_fields = ('id', 'items_snapshot', 'created_at', 'updated_at')


# ==============================================================================
# PUBLIC QR CODE MENU & LIVE TABLE SERIALIZERS
# ==============================================================================

class PublicProductSerializer(serializers.ModelSerializer):
    """Mijozlar uchun ochiq taomlar ma'lumoti."""
    class Meta:
        model = Product
        fields = ('id', 'name', 'price', 'image', 'barcode', 'is_available')


class PublicCategorySerializer(serializers.ModelSerializer):
    """Mijozlar uchun ochiq kategoriyalar va ulardagi taomlar menyusi."""
    products = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ('id', 'name', 'image', 'products')

    def get_products(self, obj):
        products = obj.products.filter(is_deleted=False, is_available=True)
        return PublicProductSerializer(products, many=True, context=self.context).data


class PublicOrderItemSerializer(serializers.ModelSerializer):
    """Mijozlar uchun stoldagi buyurtma qilingan taomlar holati."""
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = OrderItem
        fields = ('id', 'product_name', 'quantity', 'price', 'status', 'modifiers', 'is_printed')


class PublicOrderSerializer(serializers.ModelSerializer):
    """Mijozlar uchun stoldagi faol buyurtma va uning umumiy hisob-kitobi."""
    items = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            'id', 'status', 'order_type', 'items',
            'tax_amount', 'service_charge', 'discount_amount',
            'total_amount', 'final_amount', 'created_at'
        )

    def get_items(self, obj):
        active_items = obj.items.filter(is_voided=False)
        return PublicOrderItemSerializer(active_items, many=True).data


class PublicTableLiveSerializer(serializers.Serializer):
    """Mijoz QR kodni skanerlaganda qaytadigan stol va undagi jonli hisob-kitob."""
    table_id = serializers.IntegerField(source='id')
    table_name = serializers.CharField(source='name')
    zone_name = serializers.CharField(source='zone.name', default='', allow_null=True)
    qr_code = serializers.UUIDField()
    current_order = serializers.SerializerMethodField()

    def get_current_order(self, obj):
        order = obj.orders.filter(status__in=['new', 'in_progress']).order_by('-created_at').first()
        if order:
            return PublicOrderSerializer(order).data
        return None


