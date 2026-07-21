from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase, override_settings
from rest_framework.authtoken.models import Token

from config.asgi import application
from core.models import User

IN_MEMORY_CHANNEL_LAYERS = {
    'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'},
}

# AllowedHostsOriginValidator (config/asgi.py) qat'iy tekshiradi: Origin
# header umuman bo'lmasa (WebsocketCommunicator sukut bo'yicha yubormaydi),
# ALLOWED_HOSTS'da '*' bo'lmagan holda ulanish TokenAuthMiddleware'gacha
# yetib bormasdan rad etiladi. Bu haqiqiy brauzer-klient uchun to'g'ri
# himoya, lekin test muhitida ALLOWED_HOSTS cheklangan (.env.example:
# localhost,127.0.0.1) - shu sabab muvaffaqiyatli ulanish kutilgan testlar
# mos Origin header'ini o'zi yuborishi kerak.
ORIGIN_HEADERS = [(b'origin', b'http://localhost')]


@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNEL_LAYERS)
class EventsConsumerTests(TransactionTestCase):
    # WebsocketCommunicator + database_sync_to_async alohida DB ulanish
    # konteksti bilan ishlaydi - TestCase'ning tashqi atomic tranzaksiyasi
    # bilan birga ishlatilsa ulanish "yopilib qoladi". TransactionTestCase
    # (truncate-based) shu muammoni oldini oladi.
    def setUp(self):
        import unittest.mock as mock
        self.license_patcher = mock.patch('licensing.middleware.is_license_blocked', return_value=False)
        self.license_patcher.start()
        self.user = User.objects.create_user(username='+998900000100', role='waiter')
        self.token = Token.objects.create(user=self.user)

    def tearDown(self):
        if hasattr(self, 'license_patcher'):
            self.license_patcher.stop()
        super().tearDown()




    async def test_unauthenticated_connect_is_rejected(self):
        communicator = WebsocketCommunicator(application, "/ws/events/")
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_invalid_token_connect_is_rejected(self):
        communicator = WebsocketCommunicator(application, "/ws/events/?token=not-a-real-token")
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_valid_token_connects_and_receives_broadcast(self):
        communicator = WebsocketCommunicator(
            application, f"/ws/events/?token={self.token.key}", headers=ORIGIN_HEADERS,
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        from asgiref.sync import sync_to_async
        from core.realtime import broadcast_event
        await sync_to_async(broadcast_event)('table_status_changed', {'table_id': 42})

        message = await communicator.receive_json_from(timeout=5)
        self.assertEqual(message, {'event': 'table_status_changed', 'data': {'table_id': 42}})

        await communicator.disconnect()

    async def test_revoke_device_disconnects_live_session(self):
        from asgiref.sync import sync_to_async
        from core.models import StaffDevice
        from core import services

        device = await sync_to_async(StaffDevice.objects.create)(
            user=self.user, device_id='ws-device', is_active=True,
        )

        communicator = WebsocketCommunicator(
            application, f"/ws/events/?token={self.token.key}", headers=ORIGIN_HEADERS,
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await sync_to_async(services.revoke_device)(device)

        output = await communicator.receive_output(timeout=5)
        self.assertEqual(output['type'], 'websocket.close')

        await communicator.disconnect()
