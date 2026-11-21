from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase, override_settings
from rest_framework.authtoken.models import Token

from config.asgi import application
from config.hosts import PrivateLANHost
from core.models import User

IN_MEMORY_CHANNEL_LAYERS = {
    'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'},
}

# config/ws_origin.AllowedHostsOriginValidator: Origin hostname'i ALLOWED_HOSTS bo'yicha
# (PrivateLANHost bilan) tekshiriladi; Origin umuman bo'lmasa ruxsat (mobil/Electron mijoz).
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

        # Qurilma saqlanishi `devices_changed` signalini ham yuboradi (core/realtime_signals.py) - u
        # `force_disconnect`dan oldin kelishi mumkin; ulanish baribir yopilishi kerak.
        output = await communicator.receive_output(timeout=5)
        while output['type'] == 'websocket.send':
            output = await communicator.receive_output(timeout=5)
        self.assertEqual(output['type'], 'websocket.close')

        await communicator.disconnect()


@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNEL_LAYERS, ALLOWED_HOSTS=['localhost', PrivateLANHost()])
class EventsOriginTests(TransactionTestCase):
    """Regressiya: LAN IP orqali WebSocket (React Native `Origin: http://<ip>:8000`) 403 bilan rad etilardi."""

    def setUp(self):
        import unittest.mock as mock
        self.license_patcher = mock.patch('licensing.middleware.is_license_blocked', return_value=False)
        self.license_patcher.start()
        user = User.objects.create_user(username='+998900000101', role='manager')
        self.token = Token.objects.create(user=user)

    def tearDown(self):
        self.license_patcher.stop()
        super().tearDown()

    async def _connect(self, headers):
        communicator = WebsocketCommunicator(application, f"/ws/events/?token={self.token.key}", headers=headers)
        connected, _ = await communicator.connect()
        await communicator.disconnect()
        return connected

    async def test_private_lan_ip_origin_is_accepted(self):
        self.assertTrue(await self._connect([(b'origin', b'http://192.168.1.50:8000')]))
        self.assertTrue(await self._connect([(b'origin', b'http://10.162.36.253:8000')]))

    async def test_no_origin_header_is_accepted(self):
        self.assertTrue(await self._connect([]))

    async def test_null_and_file_origin_is_accepted(self):
        self.assertTrue(await self._connect([(b'origin', b'null')]))
        self.assertTrue(await self._connect([(b'origin', b'file://')]))

    async def test_foreign_origin_is_rejected(self):
        self.assertFalse(await self._connect([(b'origin', b'http://evil.example.com')]))
        self.assertFalse(await self._connect([(b'origin', b'http://8.8.8.8:8000')]))
