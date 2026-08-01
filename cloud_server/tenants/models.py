import re
import secrets
import uuid
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models

RESERVED_SUBDOMAINS = {
    'admin', 'api', 'www', 'website', 'app', 'static', 'media',
    'public', 'test', 'dev', 'staging', 'mail', 'blog', 'support',
    'help', 'status', 'auth', 'login', 'dashboard', 'root',
}


def validate_subdomain(value):
    if not value:
        return
    subdomain = value.lower().strip()
    if len(subdomain) < 3:
        raise ValidationError("Subdomen kamida 3 ta belgidan iborat bo'lishi kerak.")
    if len(subdomain) > 40:
        raise ValidationError("Subdomen 40 ta belgidan oshmasligi kerak.")
    if not re.match(r'^[a-z0-9]+(?:-[a-z0-9]+)*$', subdomain):
        raise ValidationError("Subdomen faqat kichik lotin harflari, raqamlar va chiziqcha ('-') dan iborat bo'lishi kerak.")
    if subdomain in RESERVED_SUBDOMAINS:
        raise ValidationError(f"'{subdomain}' nomi tizim tomonidan band qilingan, boshqa subdomen tanlang.")


class Restaurant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    subdomain = models.SlugField(
        max_length=50,
        unique=True,
        null=True,
        blank=True,
        validators=[validate_subdomain],
        help_text="Restoran uchun unikal subdomen (masalan: 'sim-sim')",
    )
    address = models.TextField(blank=True, null=True)
    contact_info = models.CharField(max_length=100, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    is_online = models.BooleanField(default=False)
    desired_version = models.CharField(max_length=50, blank=True, default='')
    telegram_bot_token = models.CharField(max_length=200, blank=True, default='', help_text="Fail-safe Telegram bot tokeni")
    telegram_chat_id = models.CharField(max_length=100, blank=True, default='', help_text="Fail-safe Telegram admin/group chat_id")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class RestaurantStatus(models.Model):
    """
    Bolaning oxirgi heartbeat'ida yuborgan metrikalari. Har bir restoran
    uchun bitta qator - eski qiymatlar ustidan yoziladi (tarix emas).
    """
    restaurant = models.OneToOneField(Restaurant, related_name='status', on_delete=models.CASCADE)
    cpu_percent = models.FloatField(null=True, blank=True)
    ram_percent = models.FloatField(null=True, blank=True)
    disk_percent = models.FloatField(null=True, blank=True)
    app_version = models.CharField(max_length=50, blank=True, default='')
    unsynced_count = models.IntegerField(null=True, blank=True)
    last_order_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.restaurant.name} holati"

# 0/O, 1/I kabi chalkash belgilarsiz - local_server/core/services.py'dagi
# DeviceRegistrationCode.CODE_ALPHABET bilan bir xil pattern.
LICENSE_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def generate_license_key():
    """
    XXXX-XXXX-XXXX (mobil ilovada qo'lda kiritish uchun) - avvalgi
    40-belgili secrets.token_hex(20)'dan farqli, faqat QR/paste bilan
    kiritsa bo'ladigan uzunlikda edi.
    """
    groups = (''.join(secrets.choice(LICENSE_KEY_ALPHABET) for _ in range(4)) for _ in range(3))
    return '-'.join(groups)

class License(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant = models.OneToOneField(Restaurant, related_name='license', on_delete=models.CASCADE)
    key = models.CharField(max_length=40, default=generate_license_key, unique=True, editable=False)
    hardware_hash = models.CharField(max_length=128, blank=True, null=True)
    expires_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"License for {self.restaurant.name}"


class RestaurantAdminAccount(models.Model):
    """
    Restoranning bosh menejer hisobi - Ona tomonda yaratiladi va Bola
    birinchi marta faollashtirilganda (ActivationView javobi orqali)
    lokal core.User sifatida avtomatik ko'chiriladi. Shu orqali Ona
    markazdan "qaysi restoranda kim admin" ekanligini bilib turadi.

    Parol HECH QACHON ochiq holda saqlanmaydi yoki tarmoq orqali
    yuborilmaydi - faqat Django-mos xesh (`password_hash`) uzatiladi,
    Bola uni qayta xeshламай to'g'ridan-to'g'ri ishlatadi.
    """
    phone_regex = RegexValidator(
        regex=r'^\+?(998)?\d{9}$',
        message="Telefon raqami +998xxxxxxxxx, 998xxxxxxxxx yoki xxxxxxxxx formatida bo'lishi kerak.",
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant = models.OneToOneField(Restaurant, related_name='admin_account', on_delete=models.CASCADE)
    phone = models.CharField(max_length=15, unique=True, validators=[phone_regex])
    full_name = models.CharField(max_length=200, blank=True, default='')
    password_hash = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def set_password(self, raw_password):
        from django.contrib.auth.hashers import make_password
        self.password_hash = make_password(raw_password)

    def __str__(self):
        return f"{self.full_name or self.phone} ({self.restaurant.name})"


class RemoteCommand(models.Model):
    """
    Ona'dan Bolaga yuboriladigan masofaviy buyruq. Bolalar odatda NAT
    ortida bo'lgani uchun buyruqlar push qilinmaydi - Bola heartbeat
    javobida navbatdagi (pending) buyruqlarni oladi (polling).
    """
    COMMAND_CHOICES = (
        ('block_system', "Tizimni bloklash"),
        ('unblock_system', "Blokdan chiqarish"),
        ('force_license_renew', "Litsenziyani majburiy yangilash"),
        ('force_sync', "Majburiy sinxronizatsiya"),
        ('update_app', "Yangilanishni o'rnatish"),
        ('restart_services', "Servislarni qayta ishga tushirish"),
    )
    STATUS_CHOICES = (
        ('pending', "Kutilmoqda"),
        ('sent', "Yuborildi"),
        ('acknowledged', "Qabul qilindi"),
        ('completed', "Bajarildi"),
        ('failed', "Xato"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant = models.ForeignKey(Restaurant, related_name='commands', on_delete=models.CASCADE)
    command_type = models.CharField(max_length=30, choices=COMMAND_CHOICES)
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending', db_index=True)
    result = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['created_at']
        indexes = [models.Index(fields=['restaurant', 'status'])]

    def __str__(self):
        return f"{self.get_command_type_display()} - {self.restaurant.name} ({self.status})"


class ErrorLog(models.Model):
    """
    Bola'dan qabul qilingan ERROR/CRITICAL log voqealari. `id` — Bola
    tomonida generatsiya qilingan UUID (event_uuid); shu bilan qayta
    yuborilgan (retry) partiyalar bulk_create(ignore_conflicts=True) orqali
    tabiiy ravishda dublikatsiz qoladi.
    """
    LEVEL_CHOICES = (
        ('ERROR', 'ERROR'),
        ('CRITICAL', 'CRITICAL'),
    )

    id = models.UUIDField(primary_key=True, editable=False)
    restaurant = models.ForeignKey(Restaurant, related_name='error_logs', on_delete=models.CASCADE)
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, db_index=True)
    logger_name = models.CharField(max_length=200, blank=True, default='')
    message = models.TextField()
    traceback = models.TextField(blank=True, default='')
    module = models.CharField(max_length=200, blank=True, default='')
    func_name = models.CharField(max_length=200, blank=True, default='')
    line_no = models.PositiveIntegerField(null=True, blank=True)
    occurred_at = models.DateTimeField(db_index=True)   # Bola'ning o'z soati - soat farqi (clock skew) mumkin
    received_at = models.DateTimeField(db_index=True)    # Ona'ning o'z soati - saralash/filtrlash shu bo'yicha
    is_resolved = models.BooleanField(default=False, db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        'auth.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='resolved_error_logs',
    )
    resolution_note = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-received_at']
        indexes = [
            models.Index(fields=['restaurant', 'is_resolved']),
            models.Index(fields=['level', 'is_resolved']),
        ]

    def __str__(self):
        return f"[{self.level}] {self.restaurant.name} - {self.message[:60]}"

class SyncedOrder(models.Model):
    id = models.UUIDField(primary_key=True, editable=False)  # mapped to sync_uuid
    restaurant = models.ForeignKey(Restaurant, related_name='synced_orders', on_delete=models.CASCADE)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    service_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    final_amount = models.DecimalField(max_digits=12, decimal_places=2)
    order_type = models.CharField(max_length=20, default='dine_in')
    status = models.CharField(max_length=20)
    waiter_name = models.CharField(max_length=100, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-closed_at']

    def __str__(self):
        return f"SyncedOrder {self.id} - {self.restaurant.name}"

class SyncedOrderItem(models.Model):
    id = models.UUIDField(primary_key=True, editable=False) # local item's sync_uuid
    order = models.ForeignKey(SyncedOrder, related_name='items', on_delete=models.CASCADE)
    product_name = models.CharField(max_length=200)
    quantity = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.quantity}x {self.product_name} ({self.order.id})"

class SyncedPayment(models.Model):
    id = models.UUIDField(primary_key=True, editable=False) # local payment's sync_uuid
    order = models.ForeignKey(SyncedOrder, related_name='payments', on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=20)
    is_voided = models.BooleanField(default=False)
    received_at = models.DateTimeField()

    def __str__(self):
        return f"{self.amount} ({self.method}) - Order {self.order.id}"


class DemoRequest(models.Model):
    """
    Veb-sayt (hamrohpos.uz) orqali demoga kelgan so'rovlar va xabarlar.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant_name = models.CharField(max_length=200)
    contact_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=50)
    branch_count = models.CharField(max_length=50, blank=True, default='')
    note = models.TextField(blank=True, default='')
    is_contacted = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.restaurant_name} - {self.contact_name} ({self.phone})"


class MobileApp(models.Model):
    """
    Xodim ilovalarining (Manager/Kassir/Ofitsiant) e'lon qilingan versiyalari
    - veb-sayt (hamrohpos.uz)ning "Ilovalar" sahifasi shu yerdan yuklab olish
    havolasini oladi. Bitta markazda boshqariladi (fleet update'lar kabi) -
    har bir restoran o'zining local_server'ida emas, shu yerda.

    Bitta xodim roli (masalan Kassir) bir nechta platformada chiqishi mumkin
    (Android planshet VA Windows kassa terminali) - shu sabab noyoblik
    `slug` yolg'iz emas, `(slug, platform)` juftligi bo'yicha: har bir rol
    har bir platforma uchun alohida qator, lekin bitta rolning bir platformada
    ikkita "joriy" versiyasi bo'lishi mumkin emas.
    """
    PLATFORM_CHOICES = (
        ('android', 'Android'),
        ('windows', 'Windows'),
    )

    slug = models.SlugField(max_length=30, help_text="masalan: manager, kassir, ofitsiant")
    name = models.CharField(max_length=100)
    role = models.CharField(max_length=200, help_text="Qisqa tavsif, masalan: 'Kassa va to'lovlar'")
    version = models.CharField(max_length=30)
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES, default='android')
    size_mb = models.DecimalField(max_digits=6, decimal_places=1)
    min_os = models.CharField(max_length=50, blank=True, default='', help_text="masalan 'Android 8.0' yoki 'Windows 10 64-bit'")
    is_required = models.BooleanField(default=False, help_text="Majburiy yangilanish sifatida belgilansinmi")
    apk_file = models.FileField(upload_to='mobile_apps/', help_text="Admin shu yerdan o'rnatuvchi faylni (APK yoki Windows uchun EXE/MSI) yuklaydi - havola emas, fayl o'zi bizning serverda saqlanadi.")
    notes = models.JSONField(default=list, blank=True, help_text="O'zgarishlar ro'yxati (matn qatorlari)")
    is_active = models.BooleanField(default=True, help_text="O'chirilsa ro'yxatda ko'rinmaydi")
    released_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'platform']
        constraints = [
            models.UniqueConstraint(fields=['slug', 'platform'], name='unique_mobileapp_slug_platform'),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_platform_display()}) v{self.version}"


class PricingPlan(models.Model):
    """
    Veb-sayt (hamrohpos.uz)ning "Narx" bo'limidagi tariflar (Tarif A/B/C) -
    matn, narx yorlig'i va xususiyatlar ro'yxati to'liq admin orqali
    sozlanadi, frontend'da qattiq kodlanmagan.
    """
    tier_label = models.CharField(max_length=50, help_text="masalan: 'Tarif A'")
    title = models.CharField(max_length=100, help_text="masalan: 'Boshlang'ich'")
    subtitle = models.CharField(max_length=200, blank=True, default='', help_text="masalan: 'Bitta zal, bitta kassa'")
    price_label = models.CharField(max_length=50, default='KELISHUV', help_text="masalan: 'KELISHUV' yoki '500 000 so'm/oy'")
    cta_label = models.CharField(max_length=50, default="Bog'lanish", help_text="Tugma matni, masalan: 'Bog'lanish' yoki 'Narxni kelishish'")
    is_highlighted = models.BooleanField(default=False, help_text="Markazda ajratib ko'rsatiladi ('Ko'p tanlanadi' belgisi bilan)")
    is_active = models.BooleanField(default=True, help_text="O'chirilsa sahifada ko'rinmaydi")
    order = models.PositiveIntegerField(default=0, help_text="Chapdan o'ngga tartib - kichik son oldinroq turadi")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.tier_label} - {self.title}"


class PricingFeature(models.Model):
    """PricingPlan kartasidagi bitta qator (masalan '3 kassa terminali')."""
    plan = models.ForeignKey(PricingPlan, related_name='features', on_delete=models.CASCADE)
    text = models.CharField(max_length=200)
    is_included = models.BooleanField(default=True, help_text="Yo'q bo'lsa xira (o'chirilgan) ko'rinishda chiziladi")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.plan.tier_label}: {self.text}"

