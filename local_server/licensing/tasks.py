import logging
from datetime import timedelta

import requests
from celery import shared_task
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .client import OnaClient
from .hardware import get_hardware_fingerprint
from .metrics import collect_metrics
from .models import ErrorLog, LicenseState
from core.models import Order

logger = logging.getLogger(__name__)

RENEWAL_LEAD_TIME = timedelta(days=2)


@shared_task(
    bind=True,
    autoretry_for=(requests.ConnectionError, requests.Timeout),
    retry_backoff=True,
    max_retries=3,
)
def renew_license_token(self):
    """
    Litsenziya tokenini Ona serverdan yangilaydi. Muvaffaqiyatsizlik halokatli
    emas - offline kunlarda tabiiy holat, keyingi urinish (kunlik jadval yoki
    heartbeat javobi) davom etadi.
    """
    state = LicenseState.load()
    if not state or not state.activated_at:
        logger.info("Litsenziya faollashtirilmagan - yangilash o'tkazib yuborildi.")
        return

    hardware_hash = get_hardware_fingerprint()
    client = OnaClient()
    response = client.renew(state.license_key, hardware_hash)

    if response.status_code != 200:
        logger.warning("Litsenziyani yangilash rad etildi: %s", response.text)
        return

    data = response.json()
    tokens = data['tokens']
    state.jwt_token = tokens[0]['token']
    state.token_expires_at = parse_datetime(tokens[0]['expires_at'])
    state.pending_tokens = tokens[1:]
    state.last_renewed_at = timezone.now()
    state.save()
    logger.info("Litsenziya tokeni muvaffaqiyatli yangilandi (%d ta oldindan tayyor).", len(tokens))


@shared_task
def send_heartbeat():
    """
    Har 60 soniyada Ona serverga tizim metrikalarini yuboradi. Javobdagi
    license_active bayrog'iga qarab lokal blokni qo'yadi/olib tashlaydi va
    navbatdagi masofaviy buyruqlarni bajarish uchun tarqatadi. Tarmoq
    xatolari kutilgan holat (restoran oflayn kunlar davomida ishlaydi) -
    shovqin qilmasdan faqat log darajasida qayd etiladi.
    """
    state = LicenseState.load()
    if not state or not state.activated_at:
        return

    hardware_hash = get_hardware_fingerprint()
    client = OnaClient()

    try:
        response = client.heartbeat(state.license_key, collect_metrics())
    except requests.RequestException as exc:
        logger.info("Heartbeat yuborilmadi (oflayn bo'lishi mumkin): %s", exc)
        return

    if response.status_code != 200:
        logger.warning("Heartbeat rad etildi: %s", response.text)
        return

    data = response.json()

    if data.get('license_active') is False:
        if state.blocked_reason != 'remote_command':
            state.is_blocked = True
            state.blocked_reason = 'license_inactive'
            state.save()
    elif state.blocked_reason == 'license_inactive':
        state.is_blocked = False
        state.blocked_reason = ''
        state.save()

    furthest_expiry = state.furthest_expiry
    if furthest_expiry and furthest_expiry - timezone.now() < RENEWAL_LEAD_TIME:
        renew_license_token.delay()

    for command in data.get('commands', []):
        # execute_remote_command is defined further down in this module.
        execute_remote_command.delay(command)


@shared_task
def send_error_logs():
    """
    Hali Onaga yuborilmagan xato yozuvlarini partiyalab yuboradi.
    Heartbeat'dan mustaqil task/endpoint - buzilgan payload heartbeat'ning
    litsenziya tekshiruvi/buyruq pollingiga hech qanday ta'sir qilmasligi
    kerak. Tarmoq xatosi kutilgan holat - faqat INFO darajada qayd etiladi
    (bu yerda logger.error() chaqirilsa, "Ona o'chgan" holatining o'zi yangi
    ErrorLog qatorini hosil qilib, aynan eng yomon paytda navbatni yanada
    shishirib yuborar edi).
    """
    state = LicenseState.load()
    if not state or not state.activated_at:
        return

    batch = list(
        ErrorLog.objects.filter(is_reported=False).order_by('occurred_at')[:settings.ERROR_LOG_BATCH_SIZE]
    )
    if not batch:
        return

    client = OnaClient()
    events = [
        {
            "id": str(row.event_uuid),
            "level": row.level,
            "logger_name": row.logger_name,
            "message": row.message,
            "traceback": row.traceback,
            "module": row.module,
            "func_name": row.func_name,
            "line_no": row.line_no,
            "occurred_at": row.occurred_at.isoformat(),
        }
        for row in batch
    ]

    try:
        response = client.post_error_logs(state.license_key, events)
    except requests.RequestException as exc:
        logger.info("Xato jurnali yuborilmadi (oflayn bo'lishi mumkin): %s", exc)
        return

    if response.status_code != 200:
        logger.warning("Xato jurnalini yuborish rad etildi: %s", response.text)
        return

    ErrorLog.objects.filter(id__in=[row.id for row in batch]).update(
        is_reported=True, reported_at=timezone.now(),
    )


@shared_task
def cleanup_error_logs():
    """
    Disk cheklangan - eskirgan xato yozuvlarini tozalaydi. Ikki bosqich:
    (1) muvaffaqiyatli yuborilgan va ERROR_LOG_RETENTION_DAYS'dan eski
    qatorlar o'chiriladi; (2) hali yuborilmagan qatorlar soni
    ERROR_LOG_MAX_UNREPORTED'dan oshsa (Ona uzoq vaqt ishlamay qolgan holat),
    eng eskilari ham qurbon qilinadi - disk to'lib butun tizim ishdan
    chiqishidan ko'ra ba'zi eski hisobotlarni yo'qotish afzal.
    """
    cutoff = timezone.now() - timedelta(days=settings.ERROR_LOG_RETENTION_DAYS)
    reported_deleted, _ = ErrorLog.objects.filter(is_reported=True, reported_at__lt=cutoff).delete()

    unreported_count = ErrorLog.objects.filter(is_reported=False).count()
    excess = unreported_count - settings.ERROR_LOG_MAX_UNREPORTED
    overflow_deleted = 0
    if excess > 0:
        stale_ids = list(
            ErrorLog.objects.filter(is_reported=False).order_by('occurred_at').values_list('id', flat=True)[:excess]
        )
        overflow_deleted, _ = ErrorLog.objects.filter(id__in=stale_ids).delete()
        logger.warning(
            "Xato jurnali cheklovdan oshdi (%d ta yuborilmagan) - eng eski "
            "%d ta yozuv disk sig'imi uchun o'chirildi.", unreported_count, overflow_deleted,
        )

    return {"reported_deleted": reported_deleted, "overflow_deleted": overflow_deleted}


@shared_task
def sync_completed_orders():
    """
    Boladagi yopilgan (completed/cancelled) buyurtmalarni Onaga sinxronlash
    uchun yuboradi. Har daqiqada ishlaydi.
    """
    state = LicenseState.load()
    if not state or not state.activated_at:
        return

    orders = Order.objects.filter(
        is_synced=False, 
        status__in=['completed', 'cancelled']
    ).prefetch_related('items__product', 'payments', 'waiter')[:200]
    
    if not orders:
        return

    orders_data = []
    for order in orders:
        items_data = []
        for item in order.items.all():
            items_data.append({
                "sync_uuid": str(item.sync_uuid),
                "product_name": item.product.name if item.product else 'Unknown',
                "quantity": item.quantity,
                "price": float(item.price)
            })
        
        payments_data = []
        for payment in order.payments.all():
            payments_data.append({
                "sync_uuid": str(payment.sync_uuid),
                "amount": float(payment.amount),
                "method": payment.method,
                "is_voided": getattr(payment, 'is_voided', False),
                "created_at": payment.created_at.isoformat()
            })
        
        orders_data.append({
            "sync_uuid": str(order.sync_uuid),
            "total_amount": float(order.total_amount),
            "discount_amount": float(order.discount_amount),
            "tax_amount": float(getattr(order, 'tax_amount', 0)),
            "service_charge": float(getattr(order, 'service_charge', 0)),
            "final_amount": float(order.final_amount),
            "order_type": getattr(order, 'order_type', 'dine_in'),
            "status": order.status,
            "waiter_name": order.waiter.get_full_name() or order.waiter.username if order.waiter else '',
            "closed_at": order.updated_at.isoformat(),
            "items": items_data,
            "payments": payments_data
        })

    client = OnaClient()
    try:
        response = client.post_orders(state.license_key, orders_data)
    except requests.RequestException as exc:
        logger.info("Sotuvlar sinxronlanmadi (oflayn bo'lishi mumkin): %s", exc)
        return

    if response.status_code != 201:
        logger.warning("Sotuvlarni sinxronlash rad etildi: %s", response.text)
        return
        
    data = response.json()
    synced_uuids = data.get('synced_uuids', [])
    if synced_uuids:
        Order.objects.filter(sync_uuid__in=synced_uuids).update(is_synced=True)


def _handle_block_system(payload):
    state = LicenseState.load()
    state.is_blocked = True
    state.blocked_reason = 'remote_command'
    state.save()
    return 'completed', {"detail": "Tizim bloklandi."}


def _handle_unblock_system(payload):
    state = LicenseState.load()
    state.is_blocked = False
    state.blocked_reason = ''
    state.save()
    return 'completed', {"detail": "Tizim blokdan chiqarildi."}


def _handle_force_license_renew(payload):
    try:
        renew_license_token.apply()
    except Exception as exc:  # noqa: BLE001 - report any renewal failure back to Ona
        return 'failed', {"detail": str(exc)}
    return 'completed', {"detail": "Litsenziya yangilandi."}


def _handle_force_sync(payload):
    return 'completed', {"detail": "Sinxronizatsiya hali joriy qilinmagan (MVP)."}


def _handle_restart_services(payload):
    return 'failed', {"detail": "Qo'llab-quvvatlanmaydi (docker.sock ataylab berilmagan)."}


def _trigger_watchtower_update():
    return requests.post(
        f"{settings.WATCHTOWER_URL}/v1/update",
        headers={"Authorization": f"Bearer {settings.WATCHTOWER_TOKEN}"},
        timeout=300,
    )


COMMAND_HANDLERS = {
    'block_system': _handle_block_system,
    'unblock_system': _handle_unblock_system,
    'force_license_renew': _handle_force_license_renew,
    'force_sync': _handle_force_sync,
    'restart_services': _handle_restart_services,
}


@shared_task(
    bind=True,
    autoretry_for=(requests.ConnectionError, requests.Timeout),
    retry_backoff=True,
    max_retries=3,
)
def execute_remote_command(self, command):
    """
    Ona'dan heartbeat javobi orqali kelgan bitta buyruqni bajaradi va
    natijasini Onaga qaytaradi. `command` = {"id", "command_type", "payload"}.
    """
    command_type = command.get('command_type')

    state = LicenseState.load()
    if not state:
        return
    client = OnaClient()

    if command_type == 'update_app':
        # Watchtower ushbu buyruqni bajarayotgan worker konteynerining
        # o'zini qayta yaratadi - shuning uchun natija AVVAL yuboriladi,
        # muvaffaqiyat tasdig'i esa keyingi heartbeat'dagi app_version
        # orqali tekshiriladi (Ona tomonda).
        client.post_command_result(
            state.license_key, command['id'], 'completed',
            {"detail": "Yangilanish boshlandi (Watchtower)."},
        )
        try:
            _trigger_watchtower_update()
        except requests.RequestException as exc:
            logger.warning("Watchtower so'rovi muvaffaqiyatsiz: %s", exc)
        return

    handler = COMMAND_HANDLERS.get(command_type)
    if handler is None:
        result_status, result = 'failed', {"detail": f"Noma'lum buyruq turi: {command_type}"}
    else:
        result_status, result = handler(command.get('payload') or {})

    client.post_command_result(state.license_key, command['id'], result_status, result)
