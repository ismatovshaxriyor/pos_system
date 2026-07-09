import psutil
from django.conf import settings

from core.models import Order


def collect_metrics():
    """
    Ona serverga heartbeat orqali yuboriladigan yengil tizim metrikalari.
    """
    last_order = Order.objects.order_by('-created_at').values_list('created_at', flat=True).first()

    return {
        "cpu_percent": psutil.cpu_percent(interval=None),
        "ram_percent": psutil.virtual_memory().percent,
        "disk_percent": psutil.disk_usage('/').percent,
        "app_version": settings.APP_VERSION,
        "unsynced_count": Order.objects.filter(is_synced=False).count(),
        "last_order_at": last_order.isoformat() if last_order else None,
    }
