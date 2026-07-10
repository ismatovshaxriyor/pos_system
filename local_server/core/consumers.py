import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from .realtime import BROADCAST_GROUP


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

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(BROADCAST_GROUP, self.channel_name)
        if hasattr(self, 'user_group'):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)

    @staticmethod
    def _is_license_blocked():
        from licensing.middleware import is_license_blocked
        return is_license_blocked()

    async def broadcast_message(self, event):
        await self.send(text_data=json.dumps(event['payload']))

    async def force_disconnect(self, event):
        await self.close(code=4403)
