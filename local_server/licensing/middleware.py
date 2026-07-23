from django.conf import settings
from django.core.cache import cache
from django.db import DatabaseError
from django.http import JsonResponse

from .hardware import get_hardware_fingerprint
from .models import LICENSE_VERIFY_CACHE_KEY, LicenseState
from .jwt_utils import LicenseContext

EXEMPT_PREFIXES = ('/api/license/', '/api/public/', '/api/discovery/')

BLOCKED_RESPONSE = {"detail": "Tizim bloklandi. To'lovni amalga oshiring."}

OK_CACHE_TTL = 60
BLOCKED_CACHE_TTL = 10


def _compute_blocked():
    try:
        state = LicenseState.load()
    except DatabaseError:
        return not settings.DEBUG

    if state is None or state.is_blocked:
        return True

    _, error = state.current_valid_token(get_hardware_fingerprint())
    return error is not None


def is_license_blocked():
    if not settings.LICENSE_ENFORCEMENT:
        return False

    verdict = cache.get(LICENSE_VERIFY_CACHE_KEY)
    if verdict is not None:
        return verdict

    blocked = _compute_blocked()
    cache.set(LICENSE_VERIFY_CACHE_KEY, blocked, BLOCKED_CACHE_TTL if blocked else OK_CACHE_TTL)
    return blocked


class LicenseEnforcementMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        if not path.startswith('/api/') or path.startswith(EXEMPT_PREFIXES):
            return self.get_response(request)

        # Qat'iy bloklash (Fail-Secure) - oldingi mantiq saqlanib qoladi
        if is_license_blocked():
            return JsonResponse(BLOCKED_RESPONSE, status=402)

        # Context'ni keyingi logikaga tayyorlab qo'yish
        request.license_context = LicenseContext.from_active_state()

        return self.get_response(request)
