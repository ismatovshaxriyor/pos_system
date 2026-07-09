import uuid
import secrets
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

def generate_license_key():
    return secrets.token_hex(20)  # 40 chars long token

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
