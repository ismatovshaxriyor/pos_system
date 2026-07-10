from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

BROADCAST_GROUP = 'restaurant'


def broadcast_event(event_type, payload, group=BROADCAST_GROUP):
    """
    Istalgan view/servis shuni chaqirib real-vaqt xabar yuboradi - consumer
    yoki routing'ga tegish shart emas. Yangi event turi qo'shish uchun shu
    funksiyani yangi `event_type` bilan chaqirish kifoya, consumer o'zgarishi
    shart emas.

    Payload YENGIL bo'lishi kerak (masalan {"table_id": N}), tayyor holat
    emas - ko'p hollarda holat so'rovchiga NISBIY (masalan stol
    band/bo'sh/o'zimniki), shuning uchun WS xabari faqat "qayta so'rang"
    signali, tayyor qiymat tashuvchisi emas.
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(group, {
        'type': 'broadcast.message',
        'payload': {'event': event_type, 'data': payload},
    })


def force_disconnect(user_id):
    """Qurilma revoke qilinganda shu foydalanuvchining ochiq WS ulanishini uzadi."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(f'user_{user_id}', {'type': 'force.disconnect'})
