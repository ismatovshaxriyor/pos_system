"""
Model yozilganda ochiq ilovalarga "qayta so'ra" signali yuborish (`core.realtime.broadcast_event`).

Nega signal (view'larga qo'lda `broadcast_event` qo'shish emas): ma'lumotni o'zgartiradigan yo'llar juda
ko'p - ViewSet'lar, `@action`lar, `services.*`, Django admin, Celery vazifalari. Model darajasidagi
`post_save`/`post_delete` ularning hammasini ushlaydi va biror yo'lni unutib qoldirib bo'lmaydi
(stol qo'shilganda kassada ko'rinmay qolgani aynan shundan edi). Buyurtma/to'lov/kassa oqimlari
o'zining aniq eventlarini yuboradi (views.py/services.py) - bu yerda ular yo'q.

Payload yengil: `{"id": pk}` - klient shu event kelganda tegishli ro'yxatni qayta so'raydi.
Signal handler HECH QACHON yozishni buzmaydi: yuborish xatosi faqat log'ga tushadi, yuborish esa
tranzaksiya commit'idan KEYIN (`on_commit`) - aks holda klient hali ko'rinmagan qatorni qayta so'rardi.
"""
import logging

from django.db import transaction
from django.db.models.signals import post_delete, post_save

from .realtime import broadcast_event

logger = logging.getLogger(__name__)

# model nomi -> (event nomi, payload kaliti)
EVENT_FOR_MODEL = {
    # Menyu va zal - ilova bootstrap'ida (DEFAULT_REFRESH_EVENTS).
    'Category': ('menu_changed', 'id'),
    'Product': ('menu_changed', 'id'),
    'OrderTemplate': ('menu_changed', 'id'),
    'OrderTemplateItem': ('menu_changed', 'id'),
    'Table': ('table_status_changed', 'table_id'),
    'TableZone': ('table_status_changed', 'table_id'),
    # Menejer ekranlari.
    'User': ('staff_changed', 'id'),
    'StaffDevice': ('devices_changed', 'id'),
    'Attendance': ('attendance_changed', 'id'),
    'Customer': ('customers_changed', 'id'),
    'DebtTransaction': ('customers_changed', 'id'),
    'Supplier': ('inventory_changed', 'id'),
    'Ingredient': ('inventory_changed', 'id'),
    'ProductIngredient': ('inventory_changed', 'id'),
    'Purchase': ('inventory_changed', 'id'),
    'PurchaseItem': ('inventory_changed', 'id'),
    'StockMovement': ('inventory_changed', 'id'),
    'Printer': ('printers_changed', 'id'),
    'RestaurantConfig': ('config_changed', 'id'),
}

# Faqat shu maydonlar o'zgargan save() "tinch" hisoblanadi - signal yubormaydi (har PIN-loginda
# `last_login_at` yangilanadi, menejer ro'yxatini har safar qayta yuklatish ortiqcha).
QUIET_UPDATE_FIELDS = {
    'StaffDevice': {'last_login_at', 'updated_at'},
    'User': {'last_login', 'updated_at'},
}


def _emit(event, key, pk):
    def send():
        try:
            broadcast_event(event, {key: pk})
        except Exception:  # noqa: BLE001 - real-vaqt xatosi yozishni buzmasligi kerak
            logger.warning('Real-vaqt signali yuborilmadi: %s', event, exc_info=True)

    transaction.on_commit(send)


def _handler(sender, instance, **kwargs):
    spec = EVENT_FOR_MODEL.get(sender.__name__)
    if spec is None or kwargs.get('raw'):  # raw - fixture yuklash
        return
    update_fields = kwargs.get('update_fields')
    quiet = QUIET_UPDATE_FIELDS.get(sender.__name__)
    if update_fields and quiet and set(update_fields) <= quiet:
        return
    _emit(spec[0], spec[1], instance.pk)


def connect_signals():
    from django.apps import apps

    for name in EVENT_FOR_MODEL:
        model = apps.get_model('core', name)
        uid = f'core.realtime.{name}'
        post_save.connect(_handler, sender=model, dispatch_uid=f'{uid}.save')
        post_delete.connect(_handler, sender=model, dispatch_uid=f'{uid}.delete')
