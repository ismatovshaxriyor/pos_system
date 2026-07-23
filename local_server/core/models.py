import uuid
from decimal import Decimal
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator, MinValueValidator
from django.db.models import Sum
from django.utils import timezone
from simple_history.models import HistoricalRecords

class BaseModel(models.Model):
    sync_uuid = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True, unique=True)
    is_synced = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Abstract bazaga qo'yilgan HistoricalRecords - har bir konkret
    # subklass (Table, Category, Product, Order, ...) uchun avtomatik
    # o'zining Historical<Model> jadvalini hosil qiladi, har birida alohida
    # e'lon qilish shart emas. `inherit=True` shart - aks holda
    # simple_history subklasslarni kuzatmaydi (ogohlantirish beradi).
    history = HistoricalRecords(inherit=True)

    class Meta:
        abstract = True

class User(AbstractUser, BaseModel):
    ROLE_CHOICES = (
        ('manager', 'Manager'),
        ('cashier', 'Cashier'),
        ('waiter', 'Waiter'),
    )
    
    phone_regex = RegexValidator(
        regex=r'^\+?(998)?\d{9}$',
        message="Telefon raqami +998xxxxxxxxx, 998xxxxxxxxx yoki xxxxxxxxx formatida bo'lishi kerak."
    )
    username = models.CharField(
        max_length=15,
        unique=True,
        validators=[phone_regex],
        verbose_name='Telefon raqam'
    )
    
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='waiter')

    # Admin (is_staff=True) telefon+parol bilan kiradi - o'zgarishsiz. Boshqa
    # xodim (manager/cashier/waiter) uchun qurilmaga bog'langan 6 xonali PIN -
    # shu maqsadda alohida maydon: agar PIN oddiy `password`ga yozilsa, sizib
    # chiqqan PIN qurilma tekshiruvisiz /api/auth/login/ orqali ham ishlab
    # qolar edi - butun qurilma-bog'lash talabini bekor qilardi.
    pin_hash = models.CharField(max_length=128, blank=True, default='')

    def save(self, *args, **kwargs):
        # Alohida "admin" roli yo'q - menejer (is_staff'idan qat'i nazar)
        # allaqachon to'liq huquqqa ega (IsAdminStaff/IsManagerOrAdmin role
        # bo'yicha tekshiradi). is_staff'ni ham shu rolega avtomatik bog'lash
        # orqali HAR bir menejer (nafaqat Ona orqali avtoprovision qilingan
        # bosh hisob) telefon+parol bilan kiradi va DeviceTokenAuthentication/
        # WS auth'dagi qurilma tekshiruvidan ozod bo'ladi - PIN+qurilma oqimi
        # endi faqat kassir/afitsiant uchun qoladi (generate_registration_code
        # is_staff foydalanuvchi uchun kod berishni allaqachon rad etadi).
        if self.role == 'manager':
            self.is_staff = True
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.username} ({self.role})"

class StaffDevice(BaseModel):
    """
    PIN bilan kiradigan xodimning tasdiqlangan qurilmasi. Bir vaqtning
    o'zida bir foydalanuvchida faqat bitta FAOL qurilma bo'ladi (qisman
    unique constraint'lar bilan majburlanadi) - yangi ro'yxatga olish
    eskisini avtomatik chetlashtiradi. Revoke qilish soft (is_active=False),
    hard delete emas - audit tarixi saqlanadi.
    """
    user = models.ForeignKey(User, related_name='devices', on_delete=models.CASCADE)
    device_id = models.CharField(max_length=255, db_index=True)
    device_label = models.CharField(max_length=100, blank=True, default='')
    is_active = models.BooleanField(default=True)
    is_approved = models.BooleanField(default=True)  # [NEW] Manager tasdig'i flagi
    last_login_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user'], condition=models.Q(is_active=True, is_approved=True),
                name='uniq_active_approved_device_per_user',
            ),
            models.UniqueConstraint(
                fields=['device_id'], condition=models.Q(is_active=True, is_approved=True),
                name='uniq_active_approved_device_id',
            ),
        ]

    def __str__(self):
        status = "approved" if self.is_approved else "pending"
        return f"{self.user.username} - {self.device_label or self.device_id[:8]} ({status})"

class DeviceRegistrationCode(BaseModel):
    """
    Admin tomonidan generatsiya qilinadigan bir martalik kod - xodim shu
    kodni telefonida kiritib, o'z qurilmasini birinchi marta tasdiqlaydi
    (trust-on-first-use emas, admin tasdig'i shart).
    """
    user = models.ForeignKey(User, related_name='registration_codes', on_delete=models.CASCADE)
    code = models.CharField(max_length=12, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')

    def is_valid(self):
        return self.used_at is None and self.expires_at > timezone.now()

    def __str__(self):
        return f"{self.user.username} - {self.code}"

class Notification(BaseModel):
    """
    Bir marta qurilgan, qayta ishlatiladigan bildirishnoma infratuzilmasi -
    birinchi qo'llanilishi narx o'zgarishi haqida adminga xabar berish,
    kelajakda boshqa hodisalar uchun ham shu model ishlatiladi.
    """
    recipient = models.ForeignKey(
        User, null=True, blank=True, related_name='notifications', on_delete=models.CASCADE,
    )  # None = barcha menejerlarga (role='manager') mo'ljallangan broadcast
    notif_type = models.CharField(max_length=50)
    message = models.CharField(max_length=500)
    payload = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.notif_type}: {self.message[:50]}"

class TableZone(BaseModel):
    """
    Stollarni guruhlash uchun hududlar (Zal, Ko'cha, VIP, va h.k.)
    """
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        verbose_name = "Stol Hududi"
        verbose_name_plural = "Stol Hududlari"

    def __str__(self):
        return self.name


class Table(BaseModel):
    zone = models.ForeignKey(TableZone, related_name='tables', on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=50)
    capacity = models.PositiveIntegerField(default=4)
    is_active = models.BooleanField(default=True)
    qr_code = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)

    def __str__(self):
        zone_name = f" ({self.zone.name})" if self.zone else ""
        return f"{self.name}{zone_name}"

class Printer(BaseModel):
    name = models.CharField(max_length=100)
    ip_address = models.CharField(
        max_length=50, blank=True, null=True,
        help_text="Bo'sh - virtual printer (chek faqat oshxona ekranida ko'rinadi). "
                  "To'ldirilgan - ESC/POS baytlar shu manzilga TCP orqali avtomatik yuboriladi.",
    )
    port = models.IntegerField(default=9100)
    chars_per_line = models.PositiveIntegerField(
        default=48,
        help_text="Bir qatordagi belgilar soni: 80mm qog'oz (XP-Q80A) - 48, 58mm - 32.",
    )
    is_active = models.BooleanField(default=True)

    @property
    def is_network(self):
        """IP kiritilgan printerga jismonan (ESC/POS, TCP 9100) chop etishga urinamiz."""
        return bool(self.ip_address and self.ip_address.strip())

    def __str__(self):
        return self.name

class Category(BaseModel):
    name = models.CharField(max_length=100)
    image = models.ImageField(upload_to='categories/', null=True, blank=True)
    printer = models.ForeignKey(Printer, on_delete=models.SET_NULL, null=True, blank=True, related_name='categories')

    def __str__(self):
        return self.name

class Product(BaseModel):
    category = models.ForeignKey(Category, related_name='products', on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    barcode = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    image = models.ImageField(upload_to='products/', null=True, blank=True)
    is_available = models.BooleanField(default=True)
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    is_deleted = models.BooleanField(default=False)

    def __str__(self):
        return self.name

class Order(BaseModel):
    STATUS_CHOICES = (
        ('new', 'New'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    )
    ORDER_TYPE_CHOICES = (
        ('dine_in', 'Dine-in'),
        ('takeaway', 'Takeaway'),
        ('delivery', 'Delivery'),
    )
    table = models.ForeignKey(Table, related_name='orders', on_delete=models.SET_NULL, null=True, blank=True)
    waiter = models.ForeignKey(User, related_name='orders_taken', on_delete=models.SET_NULL, null=True)
    cashier = models.ForeignKey(User, related_name='orders_cashed', on_delete=models.SET_NULL, null=True, blank=True)
    # Kreditga (qarzga) yopilganda bog'lanadi - qolgan summa shu mijoz balansiga
    # yoziladi (qarz daftar). String referens - Customer quyiroqda e'lon qilingan.
    customer = models.ForeignKey('Customer', related_name='orders', on_delete=models.SET_NULL, null=True, blank=True)

    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES, default='dine_in')
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    service_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_reason = models.CharField(max_length=255, blank=True, default='')
    note = models.TextField(blank=True, default='')
    guest_count = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')

    def __str__(self):
        return f"Order #{self.id} - {self.status}"

    @property
    def total_amount(self):
        from .services import calculate_order_financials
        total, _, _ = calculate_order_financials(self)
        return total

    @property
    def final_amount(self):
        from .services import calculate_order_financials
        _, final, _ = calculate_order_financials(self)
        return final

    @property
    def amount_paid(self):
        return self.payments.filter(is_voided=False).aggregate(total=models.Sum('amount'))['total'] or Decimal('0')

    @property
    def balance_due(self):
        from .services import calculate_order_financials
        _, _, balance = calculate_order_financials(self)
        return balance

class OrderItem(BaseModel):
    STATUS_CHOICES = (
        ('new', 'New'),
        ('preparing', 'Preparing'),
        ('ready', 'Ready'),
        ('served', 'Served'),
    )
    order = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, related_name='order_items', on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)  # Price at the time of order
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    note = models.CharField(max_length=255, blank=True, default='')
    modifiers = models.JSONField(default=dict, blank=True)
    is_voided = models.BooleanField(default=False)
    is_printed = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.quantity}x {self.product.name} (Order #{self.order.id})"

class Payment(BaseModel):
    METHOD_CHOICES = (
        ('cash', 'Cash'),
        ('card', 'Card'),
        ('other', 'Other'),
    )

    order = models.ForeignKey(Order, related_name='payments', on_delete=models.CASCADE)
    amount = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))],
    )
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='cash')
    received_by = models.ForeignKey(
        User, related_name='payments_received', on_delete=models.SET_NULL, null=True, blank=True,
    )
    is_voided = models.BooleanField(default=False)
    refunded_of = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='refunds')
    reference = models.CharField(max_length=100, blank=True, default='')

    class Meta:
        ordering = ('created_at',)
        indexes = [models.Index(fields=['order', 'created_at'])]
        constraints = [
            models.CheckConstraint(check=models.Q(amount__gt=0), name='payment_amount_positive'),
        ]

    def __str__(self):
        return f"{self.amount} ({self.method}) - Order #{self.order_id}"


class Customer(BaseModel):
    """
    Qarz daftar mijozi. `balance` - joriy umumiy qarz qoldig'i (denormalizatsiya,
    `DebtTransaction.amount` yig'indisi bilan bir xil tutiladi, har doim
    tranzaksiya ichida F() bilan atomik yangilanadi). Musbat balans = mijoz
    restoranga qarzdor.
    """
    first_name = models.CharField(max_length=100, verbose_name='Ism')
    last_name = models.CharField(max_length=100, blank=True, default='', verbose_name='Familya')
    # Ixtiyoriy - bo'sh bo'lsa regex tekshiruvi run_validators'da o'tkazib
    # yuboriladi (bo'sh qiymat empty_values ichida). User bilan bir xil format.
    phone = models.CharField(
        max_length=15, blank=True, default='', db_index=True,
        validators=[User.phone_regex], verbose_name='Telefon',
    )
    note = models.TextField(blank=True, default='')
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ('-balance', 'first_name')
        verbose_name = 'Mijoz (qarz daftar)'
        verbose_name_plural = 'Mijozlar (qarz daftar)'

    def __str__(self):
        name = f"{self.first_name} {self.last_name}".strip()
        return f"{name} ({self.phone})" if self.phone else name


class DebtTransaction(BaseModel):
    """
    Mijoz qarzi harakatlari - append-only ledger. `Customer.balance = Σ amount`.
    `amount` ishorali: `credit_sale` = +（buyurtma kreditga yopildi),
    `repayment` = − (mijoz qarzni to'ladi), `adjustment` = ± (qo'lda tuzatish).
    """
    TXN_TYPE_CHOICES = (
        ('credit_sale', 'Kreditga sotuv'),
        ('repayment', "Qarz to'lash"),
        ('adjustment', 'Tuzatish'),
    )
    customer = models.ForeignKey(Customer, related_name='debt_transactions', on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=12, decimal_places=2)  # ishorali
    txn_type = models.CharField(max_length=20, choices=TXN_TYPE_CHOICES)
    order = models.ForeignKey(Order, null=True, blank=True, on_delete=models.SET_NULL, related_name='debt_transactions')
    method = models.CharField(max_length=20, blank=True, default='')  # repayment uchun (cash/card/other)
    note = models.CharField(max_length=255, blank=True, default='')
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ('-created_at',)
        indexes = [models.Index(fields=['customer', 'created_at'])]

    def __str__(self):
        return f"{self.customer} {self.txn_type} {self.amount}"


class RestaurantConfig(BaseModel):
    """
    Restoranning umumiy sozlamalari (singleton).
    """
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text="Kenglik (Latitude)")
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text="Uzunlik (Longitude)")
    attendance_radius = models.PositiveIntegerField(default=100, help_text="Ruxsat berilgan radius (metrlarda)")

    class Meta:
        verbose_name = "Restoran Sozlamasi"
        verbose_name_plural = "Restoran Sozlamalari"

    def save(self, *args, **kwargs):
        self.pk = 1  # Singleton bo'lishini ta'minlaydi
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Restoran Koordinatalari: {self.latitude}, {self.longitude} (Radius: {self.attendance_radius}m)"


class Attendance(BaseModel):
    """
    Xodimlarning kelib-ketish davomati jurnali.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='attendances')
    check_in = models.DateTimeField(auto_now_add=True)
    check_out = models.DateTimeField(null=True, blank=True)
    
    # Check-in vaqtidagi xodim koordinatalari (audit uchun)
    check_in_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_in_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    
    # Check-out vaqtidagi koordinatalar
    check_out_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    check_out_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    class Meta:
        ordering = ('-check_in',)
        verbose_name = "Davomat"
        verbose_name_plural = "Davomatlar"

    def __str__(self):
        return f"{self.user.username} - {self.check_in}"

class PrintJob(BaseModel):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('printed', 'Printed'),
        ('failed', 'Failed'),
    )
    printer = models.ForeignKey(Printer, related_name='jobs', on_delete=models.CASCADE)
    order = models.ForeignKey(Order, related_name='print_jobs', on_delete=models.CASCADE)
    items_snapshot = models.JSONField()  # Printed items list: [{"name": str, "quantity": int, "note": str, "modifiers": dict}]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    def __str__(self):
        return f"Job #{self.id} - Printer: {self.printer.name} (Order #{self.order_id})"


# ==============================================================================
# OMBOR (Inventory: ingredient + retsept + kirim + harakat ledger)
# ==============================================================================

class Supplier(BaseModel):
    """Ta'minotchi (xomashyo yetkazib beruvchi)."""
    name = models.CharField(max_length=200, verbose_name='Nomi')
    phone = models.CharField(max_length=15, blank=True, default='', validators=[User.phone_regex])
    note = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ('name',)
        verbose_name = "Ta'minotchi"
        verbose_name_plural = "Ta'minotchilar"

    def __str__(self):
        return self.name


class Ingredient(BaseModel):
    """
    Ombordagi yagona zaxira birligi (xomashyo YOKI to'g'ridan-to'g'ri sotiladigan
    mahsulot uchun ham). `current_stock` - joriy qoldiq (denormalizatsiya,
    `StockMovement.quantity` yig'indisi bilan bir xil tutiladi, har doim
    tranzaksiya ichida `select_for_update` bilan yangilanadi). `min_stock` -
    past-zaxira ogohlantirish chegarasi. `cost_price` - oxirgi kirim narxi
    (birlik uchun, tannarx/foyda hisobida ishlatiladi).
    """
    UNIT_CHOICES = (
        ('kg', 'Kilogramm'),
        ('g', 'Gramm'),
        ('l', 'Litr'),
        ('ml', 'Millilitr'),
        ('dona', 'Dona'),
    )
    name = models.CharField(max_length=200, verbose_name='Nomi')
    unit = models.CharField(max_length=10, choices=UNIT_CHOICES, default='dona', verbose_name='Birlik')
    current_stock = models.DecimalField(max_digits=12, decimal_places=3, default=0, verbose_name='Joriy qoldiq')
    min_stock = models.DecimalField(max_digits=12, decimal_places=3, default=0, verbose_name='Minimal qoldiq')
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name='Tannarx (birlik)')
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL, related_name='ingredients')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ('name',)
        verbose_name = 'Ingredient (ombor)'
        verbose_name_plural = 'Ingredientlar (ombor)'

    @property
    def is_low(self):
        return self.current_stock < self.min_stock

    def __str__(self):
        return f"{self.name} ({self.current_stock} {self.unit})"


class ProductIngredient(BaseModel):
    """
    Retsept qatori: bitta `Product`ning 1 donasiga kerak bo'ladigan ingredient
    miqdori. To'g'ridan-to'g'ri sotiladigan mahsulot (suv, gazak) = 1 ta
    ingredientli retsept - shu tarzda bitta zaxira mexanizmi (Ingredient +
    StockMovement) ikkala holatni ham qoplaydi.
    """
    product = models.ForeignKey(Product, related_name='recipe', on_delete=models.CASCADE)
    # PROTECT - retseptda ishlatilayotgan ingredientni tasodifan o'chirib
    # bo'lmasin (avval retseptdan olib tashlash kerak).
    ingredient = models.ForeignKey(Ingredient, related_name='used_in', on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, verbose_name='1 mahsulotga miqdor')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['product', 'ingredient'], name='uniq_product_ingredient'),
        ]
        verbose_name = 'Retsept qatori'
        verbose_name_plural = 'Retsept qatorlari'

    def __str__(self):
        return f"{self.product.name}: {self.quantity} {self.ingredient.unit} {self.ingredient.name}"


class Purchase(BaseModel):
    """Ta'minotchidan kirim hujjati (bir nechta ingredient bitta xaridda)."""
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL, related_name='purchases')
    note = models.CharField(max_length=255, blank=True, default='')
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ('-created_at',)
        verbose_name = 'Kirim (xarid)'
        verbose_name_plural = 'Kirimlar (xaridlar)'

    @property
    def total_cost(self):
        return sum((i.quantity * i.unit_cost for i in self.items.all()), Decimal('0'))

    def __str__(self):
        return f"Purchase #{self.id} - {self.supplier or 'Nomalum'}"


class PurchaseItem(BaseModel):
    purchase = models.ForeignKey(Purchase, related_name='items', on_delete=models.CASCADE)
    ingredient = models.ForeignKey(Ingredient, related_name='purchase_items', on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.quantity} {self.ingredient.unit} {self.ingredient.name}"


class StockMovement(BaseModel):
    """
    Ombor harakati - append-only ledger. `Ingredient.current_stock = Σ quantity`.
    `quantity` ishorali: purchase = +, sale = −, adjustment = ±, waste = −.
    """
    MOVEMENT_TYPE_CHOICES = (
        ('purchase', 'Kirim'),
        ('sale', 'Sotuv'),
        ('adjustment', 'Tuzatish'),
        ('waste', 'Yoqotish'),
    )
    ingredient = models.ForeignKey(Ingredient, related_name='movements', on_delete=models.CASCADE)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)  # ishorali
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_TYPE_CHOICES)
    order = models.ForeignKey(Order, null=True, blank=True, on_delete=models.SET_NULL, related_name='stock_movements')
    purchase = models.ForeignKey(Purchase, null=True, blank=True, on_delete=models.SET_NULL, related_name='movements')
    note = models.CharField(max_length=255, blank=True, default='')
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ('-created_at',)
        indexes = [models.Index(fields=['ingredient', 'created_at'])]
        verbose_name = 'Ombor harakati'
        verbose_name_plural = 'Ombor harakatlari'

    def __str__(self):
        return f"{self.ingredient.name} {self.movement_type} {self.quantity}"


