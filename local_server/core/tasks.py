"""
Oshxona cheklarini jismoniy ESC/POS printerlarga yuboruvchi Celery tasklar.

Virtual printerlar (ip_address bo'sh) bu oqimga umuman kirmaydi - ularning
joblari faqat oshxona ekranida (WS `new_print_job`) ko'rinadi va qo'lda
mark-printed qilinadi. IP kiritilgan printer uchun esa job yaratilishi bilan
`print_job_to_printer` navbatga qo'yiladi (`services.send_order_to_kitchen`,
`transaction.on_commit` orqali - job qatori commitdan oldin workerga
ko'rinmaydi) va muvaffaqiyatda job avtomatik `printed` bo'ladi.
"""
import logging
from datetime import timedelta

from celery import shared_task
from django.core.cache import cache
from django.utils import timezone

from . import escpos
from .realtime import broadcast_event

logger = logging.getLogger(__name__)

RETRY_COUNTDOWNS = (5, 15, 45)  # sek - tarmoq "hiqichog'i"ga chidaydi, lekin chekni uzoq kechiktirmaydi
SEND_TIMEOUT = 5.0
# Sweep chegaralari: navbatda unutilgan (masalan worker restartida yo'qolgan)
# joblarni qayta jonlantirish, juda eskirganini esa qayta chiqarMASdan failed
# deb yopish - 30 daqiqalik chekni to'satdan chiqarish oshxonani chalg'itadi,
# ofitsiant bu paytga qadar baribir og'zaki hal qilgan.
SWEEP_RESEND_AFTER = timedelta(seconds=90)
SWEEP_GIVEUP_AFTER = timedelta(minutes=30)
SWEEP_BATCH = 20


def _job_lock_key(job_id):
    return f"print_job_lock:{job_id}"


def _mark_failed(job):
    """Jobni failed qiladi + menejerlarga bildirishnoma. ERROR log Ona'ga ham boradi."""
    from .models import Notification

    job.status = 'failed'
    job.save(update_fields=['status', 'updated_at'])

    message = (
        f"Chek chiqmadi: '{job.printer.name}' ({job.printer.ip_address}:{job.printer.port}) - "
        f"Buyurtma #{job.order_id}. Printerni tekshiring, chekni oshxona ekranidan qo'lda chiqaring."
    )
    logger.error(
        "PrintJob #%s jismoniy printerga yuborilmadi (%s:%s, buyurtma #%s)",
        job.id, job.printer.ip_address, job.printer.port, job.order_id,
    )
    Notification.objects.create(
        recipient=None, notif_type='print_failed', message=message,
        payload={'job_id': job.id, 'printer_id': job.printer_id, 'order_id': job.order_id},
    )
    broadcast_event('print_job_updated', {'job_id': job.id, 'status': 'failed'})


@shared_task(bind=True, max_retries=len(RETRY_COUNTDOWNS))
def print_job_to_printer(self, job_id):
    """
    Bitta PrintJob'ni printerning raw TCP portiga (9100) yuboradi.
    Ulanish xatosida RETRY_COUNTDOWNS bo'yicha qayta urinadi; oxirgisi ham
    yiqilsa - failed + menejerlarga bildirishnoma (chek yo'qolib qolmasligi
    uchun oshxona ekranidan qo'lda chiqarish mumkinligicha qoladi).
    """
    from .models import PrintJob

    job = (
        PrintJob.objects.select_related('printer', 'order__table', 'order__waiter')
        .filter(pk=job_id).first()
    )
    if job is None:
        return 'not-found'
    if job.status != 'pending':
        # Oshxona ekranidan qo'lda belgilangan yoki parallel urinish yutgan.
        return f'skip:{job.status}'
    printer = job.printer
    if not printer.is_network:
        return 'skip:virtual'

    # Dispatch, sweep va celery-retry bir vaqtga to'g'ri kelganda chek ikki
    # marta chiqmasligi uchun Redis qulf (TTL socket timeoutdan ancha uzun).
    if not cache.add(_job_lock_key(job_id), 1, timeout=60):
        return 'locked'
    try:
        payload = escpos.render_kitchen_ticket(
            station_name=printer.name,
            order_id=job.order_id,
            table_name=job.order.table.name if job.order.table else 'Takeaway',
            waiter_name=job.order.waiter.first_name if job.order.waiter else "Noma'lum",
            items=job.items_snapshot,
            created_at=job.created_at,
            width=printer.chars_per_line or escpos.DEFAULT_WIDTH,
        )
        escpos.send_tcp(printer.ip_address.strip(), printer.port, payload, timeout=SEND_TIMEOUT)
    except OSError as exc:
        cache.delete(_job_lock_key(job_id))
        if self.request.retries >= self.max_retries:
            _mark_failed(job)
            return 'failed'
        raise self.retry(exc=exc, countdown=RETRY_COUNTDOWNS[self.request.retries])

    job.status = 'printed'
    job.save(update_fields=['status', 'updated_at'])
    broadcast_event('print_job_updated', {'job_id': job.id, 'status': 'printed'})
    cache.delete(_job_lock_key(job_id))
    return 'printed'


@shared_task
def sweep_stale_print_jobs():
    """
    Beat (har 2 daqiqada): IP'li printerlarda qolib ketgan `pending` joblarni
    qayta navbatga qo'yadi, SWEEP_GIVEUP_AFTER'dan eskilarini failed qiladi.
    Virtual printer joblariga tegmaydi - ular qo'lda boshqariladi.
    """
    from .models import PrintJob

    now = timezone.now()
    stale = (
        PrintJob.objects.filter(
            status='pending', printer__is_active=True,
            created_at__lt=now - SWEEP_RESEND_AFTER,
        )
        .exclude(printer__ip_address__isnull=True)
        .exclude(printer__ip_address='')
        .select_related('printer')
        .order_by('created_at')[:SWEEP_BATCH]
    )
    resent = failed = 0
    for job in stale:
        if job.created_at < now - SWEEP_GIVEUP_AFTER:
            _mark_failed(job)
            failed += 1
        else:
            print_job_to_printer.delay(job.id)
            resent += 1
    return {'resent': resent, 'failed': failed}
