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

class Table(BaseModel):
    name = models.CharField(max_length=50)
    capacity = models.PositiveIntegerField(default=4)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

class Category(BaseModel):
    name = models.CharField(max_length=100)
    image = models.ImageField(upload_to='categories/', null=True, blank=True)

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
        # Python darajasida filtrlash ataylab - .filter(is_voided=False)
        # prefetch keshini chetlab har order uchun yangi so'rov yuborar edi
        # (ro'yxat endpointida N+1).
        return sum(
            (item.price * item.quantity for item in self.items.all() if not item.is_voided),
            Decimal('0'),
        )

    @property
    def final_amount(self):
        return max(self.total_amount - self.discount_amount + self.tax_amount + self.service_charge, Decimal('0'))

    @property
    def amount_paid(self):
        """
        Har doim jonli DB agregatsiyasi - bir nechta kassa terminali bir
        vaqtda shu order'ga to'lov qo'shishi mumkin, keshlangan/prefetch
        qilingan qiymat overpayment tekshiruvini chetlab o'tishiga olib
        kelishi mumkin.
        """
        return self.payments.filter(is_voided=False).aggregate(total=Sum('amount'))['total'] or Decimal('0')

    @property
    def balance_due(self):
        return max(self.final_amount - self.amount_paid, Decimal('0'))

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


