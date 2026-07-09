from celery import shared_task
from django.utils import timezone
from datetime import timedelta

from .models import Restaurant

OFFLINE_THRESHOLD = timedelta(minutes=3)


@shared_task
def mark_offline_restaurants():
    """
    3 daqiqadan beri heartbeat yubormagan restoranlarni "Oflayn" deb
    belgilaydi. Har 60 soniyada Celery Beat orqali ishga tushadi.
    """
    cutoff = timezone.now() - OFFLINE_THRESHOLD
    updated = Restaurant.objects.filter(
        is_online=True, last_seen__lt=cutoff,
    ).update(is_online=False)
    return updated
