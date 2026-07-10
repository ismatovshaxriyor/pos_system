import uuid
import secrets
from django.core.validators import RegexValidator
from django.db import models

class Restaurant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True, null=True)
    contact_info = models.CharField(max_length=100, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    is_online = models.BooleanField(default=False)
    desired_version = models.CharField(max_length=50, blank=True, default='')
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
