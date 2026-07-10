from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware


@database_sync_to_async
def _get_user_from_token(token_key):
    from rest_framework.authtoken.models import Token
    try:
        return Token.objects.select_related('user').get(key=token_key).user
    except Token.DoesNotExist:
        return None


class TokenAuthMiddleware(BaseMiddleware):
    """
    Channels'ning standart AuthMiddlewareStack faqat Django sessionni
    tushunadi - bizda esa DRF TokenAuthentication bor. Shuni qayta
    ishlatamiz (mavjud Token jadvali), yangi autentifikatsiya tizimi
    qo'shmaymiz. Klient `?token=<DRF token>` query parametri bilan ulanadi.
    """
    async def __call__(self, scope, receive, send):
        qs = parse_qs(scope.get('query_string', b'').decode())
        token_key = qs.get('token', [None])[0]
        scope['user'] = await _get_user_from_token(token_key) if token_key else None
        return await super().__call__(scope, receive, send)
