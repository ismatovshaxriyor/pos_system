import calendar
from datetime import timedelta

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import License, Restaurant


def compute_default_license_expiry(from_dt=None):
    """
    Standart litsenziya muddati: joriy oyning oxirigacha + 2 kunlik
    to'lov muhlati. Masalan, restoran 10-iyulda yaratilsa, litsenziya
    2-avgust kuni soat 23:59:59 da tugaydi (31-iyul oxiri + 2 kun).
    """
    now = from_dt or timezone.now()
    last_day = calendar.monthrange(now.year, now.month)[1]
    end_of_month = now.replace(day=last_day, hour=23, minute=59, second=59, microsecond=0)
    return end_of_month + timedelta(days=2)


@receiver(post_save, sender=Restaurant)
def create_default_license(sender, instance, created, **kwargs):
    """
    Yangi restoran yaratilganda avtomatik litsenziya ochadi - operator har
    safar qo'lda "Add license" qilmasin. Muddat qisqa bo'lgani uchun (joriy
    oy + 2 kun), agar to'lov davom etmasa, LicenseAdmin orqali `expires_at`
    ni yangilash operatorning navbatdagi ishi bo'ladi.
    """
    if not created:
        return
    License.objects.create(restaurant=instance, expires_at=compute_default_license_expiry())
