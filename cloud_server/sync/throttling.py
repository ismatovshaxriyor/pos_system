from rest_framework import throttling

from .ip import client_ip


class _ClientIPMixin:
    def get_ident(self, request):
        return client_ip(request)


class AnonThrottle(_ClientIPMixin, throttling.AnonRateThrottle):
    """AnonRateThrottle, lekin X-Forwarded-For soxtalashtirib bo'lmaydigan IP bilan."""


class UserThrottle(throttling.UserRateThrottle):
    pass


class DemoRequestThrottle(_ClientIPMixin, throttling.AnonRateThrottle):
    """Ommaviy demo-so'rov formasi: spam bazani va Telegram'ni to'ldirmasligi uchun qattiq limit."""
    scope = 'demo'


class LicenseCheckThrottle(_ClientIPMixin, throttling.AnonRateThrottle):
    """Litsenziya kalitini ommaviy tekshirish: kalit topishga urinishni sekinlashtiradi."""
    scope = 'license_check'
