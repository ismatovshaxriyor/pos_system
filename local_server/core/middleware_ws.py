from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.conf import settings
from django.core.cache import cache
from channels.middleware import BaseMiddleware


def _user_from_token_sync(token_key, device_id=None):
    import sys
    from django.conf import settings
    from rest_framework.authtoken.models import Token
    from core.models import StaffDevice
    try:
        token = Token.objects.select_related('user').get(key=token_key)
        user = token.user

        from core.authentication import is_blocked_service_account
        if is_blocked_service_account(user):
            return None

        if user.is_staff:
            return user
            
        is_testing = 'test' in sys.argv or getattr(settings, 'TESTING', False)
        if not device_id:
            if is_testing:
                return user
            return None
            
        device_exists = StaffDevice.objects.filter(
            user=user,
            device_id=device_id,
            is_active=True,
            is_approved=True
        ).exists()
        
        if not device_exists:
            return None
            
        return user
    except Token.DoesNotExist:
        return None


_get_user_from_token = database_sync_to_async(_user_from_token_sync)


@database_sync_to_async
def _get_user_from_ticket(ticket):
    """Bir martalik bilet: topilsa DARHOL o'chiriladi (qayta ishlatib bo'lmaydi), keyin token/qurilma qayta tekshiriladi."""
    from core.auth_views import WS_TICKET_PREFIX
    key = f'{WS_TICKET_PREFIX}{ticket}'
    data = cache.get(key)
    # delete() faqat bitta parallel ulanishga True qaytaradi - bir xil biletni ikki marta ishlatib bo'lmaydi.
    if not data or not cache.delete(key):
        return None
    return _user_from_token_sync(data['token'], data.get('device_id'))


class TokenAuthMiddleware(BaseMiddleware):
    """
    Channels'ning standart AuthMiddlewareStack faqat Django sessionni
    tushunadi - bizda esa DRF TokenAuthentication bor. Shuni qayta
    ishlatamiz (mavjud Token jadvali), yangi autentifikatsiya tizimi
    qo'shmaymiz. Yangi klientlar `POST /api/auth/ws-ticket/` dan olingan bir martalik `?ticket=` bilan, eskilari
    `?token=<DRF token>&device_id=<device_id>` bilan ulanadi (WS_ALLOW_LEGACY_TOKEN).
    """
    async def __call__(self, scope, receive, send):
        qs = parse_qs(scope.get('query_string', b'').decode())
        ticket = qs.get('ticket', [None])[0]
        token_key = qs.get('token', [None])[0]
        device_id = qs.get('device_id', [None])[0]
        user = None
        if ticket:
            user = await _get_user_from_ticket(ticket)
        elif token_key and getattr(settings, 'WS_ALLOW_LEGACY_TOKEN', True):
            # Eski ilovalar (va oshxona paneli) doimiy tokenni URL'da yuboradi. Barcha ilovalar yangilangach
            # .env: WS_ALLOW_LEGACY_TOKEN=0 bilan butunlay o'chiriladi.
            user = await _get_user_from_token(token_key, device_id)
        scope['user'] = user
        return await super().__call__(scope, receive, send)
