import asyncio
import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from .realtime import BROADCAST_GROUP

# Restoran WiFi routerlarining NAT/conntrack jadvali odatda bir necha
# daqiqada bo'sh ulanishni "unutadi" - shunda ulanish brauzerda ochiq
# ko'rinib tursa ham server tomonga hech narsa yetib bormaydi (onclose
# hech qachon chaqirilmasdan). Davriy ping shu jadvalni "band" ushlab
# turadi va mijozga tirikligini bildiradi (kitchen_dashboard.html shu
# ping asosida "zombi" ulanishni ham aniqlaydi).
PING_INTERVAL_SECONDS = 20


class EventsConsumer(AsyncWebsocketConsumer):
    """
    Yagona qayta ishlatiladigan real-vaqt kanal - stol holati, narx
    bildirishnomasi va keyingi barcha event turlari shu bitta consumer
    orqali o'tadi. Yangi event qo'shish uchun bu faylga tegish shart emas:
    core.realtime.broadcast_event() ni yangi event_type bilan chaqirish
    kifoya.
    """

    async def connect(self):
        user = self.scope.get('user')
        if user is None or not user.is_authenticated:
            await self.close(code=4001)
            return

        if await database_sync_to_async(self._is_license_blocked)():
            await self.close(code=4402)
            return

        self.user_group = f'user_{user.id}'
        await self.channel_layer.group_add(BROADCAST_GROUP, self.channel_name)
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        await self.accept()
        self._ping_task = asyncio.create_task(self._ping_loop())

    async def disconnect(self, close_code):
        if hasattr(self, '_ping_task'):
            self._ping_task.cancel()
        await self.channel_layer.group_discard(BROADCAST_GROUP, self.channel_name)
        if hasattr(self, 'user_group'):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)

    async def _ping_loop(self):
        # broadcast_event() bilan bir xil {"event": ..., "data": ...} shaklida
        # - mijozlar allaqachon noma'lum event turlarini e'tiborsiz
        # qoldirishga mo'ljallangan, shuning uchun bu yangi xabar formati
        # qo'shmaydi, faqat yangi event_type qo'shadi.
        try:
            while True:
                await asyncio.sleep(PING_INTERVAL_SECONDS)
                await self.send(text_data=json.dumps({'event': 'ping', 'data': {}}))
        except asyncio.CancelledError:
            pass

    @staticmethod
    def _is_license_blocked():
        from licensing.middleware import is_license_blocked
        return is_license_blocked()

    async def broadcast_message(self, event):
        await self.send(text_data=json.dumps(event['payload']))

    async def force_disconnect(self, event):
        await self.close(code=4403)
