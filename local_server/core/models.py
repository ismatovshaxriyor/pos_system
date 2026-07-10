import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.utils import timezone

class BaseModel(models.Model):
    sync_uuid = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True, unique=True)
    is_synced = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
    last_login_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user'], condition=models.Q(is_active=True),
                name='uniq_active_device_per_user',
            ),
            models.UniqueConstraint(
                fields=['device_id'], condition=models.Q(is_active=True),
                name='uniq_active_device_id',
            ),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.device_label or self.device_id[:8]}"

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
    )  # None = barcha adminlarga (is_staff=True) mo'ljallangan broadcast
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

    def __str__(self):
        return self.name

class Order(BaseModel):
    STATUS_CHOICES = (
        ('new', 'New'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    )
    table = models.ForeignKey(Table, related_name='orders', on_delete=models.SET_NULL, null=True, blank=True)
    waiter = models.ForeignKey(User, related_name='orders_taken', on_delete=models.SET_NULL, null=True)
    cashier = models.ForeignKey(User, related_name='orders_cashed', on_delete=models.SET_NULL, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')

    def __str__(self):
        return f"Order #{self.id} - {self.status}"

class OrderItem(BaseModel):
    order = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, related_name='order_items', on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(default=1)
    price = models.DecimalField(max_digits=10, decimal_places=2)  # Price at the time of order

    def __str__(self):
        return f"{self.quantity}x {self.product.name} (Order #{self.order.id})"

