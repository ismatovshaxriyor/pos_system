from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from django.core.cache import cache

from .models import Restaurant, ErrorLog, RemoteCommand

OFFLINE_THRESHOLD = timedelta(minutes=3)


@shared_task
def mark_offline_restaurants():
    """
    Heartbeat yubormay qo'ygan restoranlarni "Oflayn" deb belgilaydi.
    Har 60 soniyada Celery Beat orqali ishga tushadi.

    Ikki signal birga tekshiriladi: Redis'dagi restaurant_metrics_<id>
    kaliti (HeartbeatView har heartbeat'da 180s TTL bilan yozadi - tez yo'l)
    VA DB'dagi last_seen (heartbeat DB yozuvini tejash uchun uni ~5 daqiqada
    bir yangilaydi). Faqat keshga tayanish Redis restart/flush'da butun
    flotni birdan noto'g'ri "oflayn" qilib yuborar edi; faqat last_seen esa
    tirik restoranni ham (yozuvi 5 daqiqagacha eskirishi mumkinligi uchun)
    oflayn deb belgilardi.
    """
    threshold = timezone.now() - OFFLINE_THRESHOLD
    offline_ids = [
        r.id
        for r in Restaurant.objects.filter(is_online=True).only('id', 'last_seen')
        if not cache.get(f"restaurant_metrics_{r.id}")
        and (r.last_seen is None or r.last_seen < threshold)
    ]

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
