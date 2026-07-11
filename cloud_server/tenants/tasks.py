from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from django.core.cache import cache

from .models import Restaurant, ErrorLog, RemoteCommand

OFFLINE_THRESHOLD = timedelta(minutes=3)


@shared_task
def mark_offline_restaurants():
    """
    3 daqiqadan beri heartbeat yubormagan restoranlarni "Oflayn" deb
    belgilaydi. Har 60 soniyada Celery Beat orqali ishga tushadi.
    """
    restaurants = Restaurant.objects.filter(is_online=True)
    offline_ids = []
    for r in restaurants:
        if not cache.get(f"restaurant_metrics_{r.id}"):
            offline_ids.append(r.id)
            
    if offline_ids:
        Restaurant.objects.filter(id__in=offline_ids).update(is_online=False)
    
    return len(offline_ids)

@shared_task
def cleanup_old_data():
    """
    14 kundan eski xatolarni va tugatilgan/xato bo'lgan buyruqlarni o'chiradi
    """
    cutoff = timezone.now() - timedelta(days=14)
    deleted_errors, _ = ErrorLog.objects.filter(received_at__lt=cutoff).delete()
    deleted_commands, _ = RemoteCommand.objects.filter(
        created_at__lt=cutoff, 
        status__in=['completed', 'failed']
    ).delete()
    
    return {"deleted_errors": deleted_errors, "deleted_commands": deleted_commands}
