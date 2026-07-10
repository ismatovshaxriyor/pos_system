from django.conf import settings
from django.core.cache import cache
from django.db import DatabaseError
from django.http import JsonResponse

from .hardware import get_hardware_fingerprint
from .models import LICENSE_VERIFY_CACHE_KEY, LicenseState

EXEMPT_PREFIXES = ('/api/license/',)

BLOCKED_RESPONSE = {"detail": "Tizim bloklandi. To'lovni amalga oshiring."}

OK_CACHE_TTL = 60
BLOCKED_CACHE_TTL = 10


class LicenseEnforcementMiddleware:
    """
    Kill-switch: litsenziya JWT tokeni yaroqsiz/muddati o'tgan yoki qurilma
    barmoq izi mos kelmasa, barcha /api/ so'rovlarini 402 bilan bloklaydi.

    /api/license/ (faollashtirish/status) va /admin/ ataylab bundan mustasno
    - menejer holatni ko'rishi va qayta faollashtirishi kerak.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not settings.LICENSE_ENFORCEMENT:
            return self.get_response(request)

        path = request.path
        if not path.startswith('/api/') or path.startswith(EXEMPT_PREFIXES):
            return self.get_response(request)

        if self._is_blocked():
            return JsonResponse(BLOCKED_RESPONSE, status=402)

        return self.get_response(request)

    def _is_blocked(self):
        verdict = cache.get(LICENSE_VERIFY_CACHE_KEY)
        if verdict is not None:
            return verdict

        blocked = self._compute_blocked()
        cache.set(LICENSE_VERIFY_CACHE_KEY, blocked, BLOCKED_CACHE_TTL if blocked else OK_CACHE_TTL)
        return blocked

    def _compute_blocked(self):
        try:
            state = LicenseState.load()
        except DatabaseError:
            # licensing_licensestate jadvali hali mavjud emas (migrate
            # bosqichida). DEBUG'da ochiq, prod'da yopiq (fail-closed).
            return not settings.DEBUG

        if state is None:
            return True

        if state.is_blocked:
            return True

        _, error = state.current_valid_token(get_hardware_fingerprint())
        return error is not None
