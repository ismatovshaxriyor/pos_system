from rest_framework import authentication
from rest_framework import exceptions
from tenants.models import License
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from .ip import client_ip

FAIL_WINDOW_SECONDS = 600


class UnknownLicenseKey(exceptions.AuthenticationFailed):
    """Bazada yo'q kalit - faqat shu holat brute-force hisoblagichiga yoziladi."""


def _fail_key(ip):
    return f'licauth_fail:{ip}'


class DummyUser:
    """
    Bu tizimda Bola so'rovlari haqiqiy Django foydalanuvchisiga emas,
    litsenziyaga tegishli - lekin DRF'ning har doim yoqilgan default
    `UserRateThrottle`si `request.user.is_authenticated` bo'lsa
    `request.user.pk`ni cache kaliti sifatida o'qiydi, va bu view
    ishlashidan OLDIN, `dispatch()` ichida chaqiriladi - shuning uchun
    `pk` yo'qligi har qanday so'rovni (bo'sh bo'lsa ham) `AttributeError`
    bilan 500'ga olib kelardi (`ActivationView`dan tashqari - u
    `throttle_classes = [AnonRateThrottle]` bilan buni chetlab o'tgan,
    qolgan barcha litsenziya-autentifikatsiyali view'lar - Renew,
    Heartbeat, CommandResult, ErrorLog, OrderSync - shu xatoga duch
    kelgan). `pk`ni litsenziya id'siga bog'lash shart - aks holda barcha
    restoranlar bitta umumiy 100/daqiqa throttle hisoblagichini bo'lishib
    olar edi (`ident=None` hammaga bir xil cache kalit bo'lar edi).
    """
    is_authenticated = True

    def __init__(self, pk):
        self.pk = pk


class LicenseAuthentication(authentication.BaseAuthentication):
    """
    Custom authentication class that uses the License key.
    Format: Authorization: License <license_key>
    (Or 'Token' if we prefer keeping it standard)
    """
    keyword = 'Token'

    def authenticate(self, request):
        auth = authentication.get_authorization_header(request).split()

        if not auth or auth[0].lower() != self.keyword.lower().encode():
            return None

        if len(auth) == 1:
            msg = 'Invalid token header. No credentials provided.'
            raise exceptions.AuthenticationFailed(msg)
        elif len(auth) > 2:
            msg = 'Invalid token header. Token string should not contain spaces.'
            raise exceptions.AuthenticationFailed(msg)

        try:
            token = auth[1].decode()
        except UnicodeError:
            msg = "Litsenziya kaliti sarlavhasi noto'g'ri (yaroqsiz belgilar bor)."
            raise exceptions.AuthenticationFailed(msg)

        # DRF throttle'lari autentifikatsiyadan KEYIN ishlaydi, shuning uchun noto'g'ri kalit
        # bilan urinish ularga umuman tushmaydi - brute-force'ga qarshi alohida hisoblagich.
        limit = getattr(settings, 'LICENSE_AUTH_FAIL_LIMIT', 0)
        ip = client_ip(request)
        if limit and cache.get(_fail_key(ip), 0) >= limit:
            raise exceptions.Throttled(wait=FAIL_WINDOW_SECONDS)
        try:
            return self.authenticate_credentials(token)
        except UnknownLicenseKey:
            if limit:
                key = _fail_key(ip)
                if cache.add(key, 1, FAIL_WINDOW_SECONDS) is False:
                    try:
                        cache.incr(key)
                    except ValueError:
                        cache.set(key, 1, FAIL_WINDOW_SECONDS)
            raise

    def authenticate_credentials(self, key):
        try:
            license_obj = License.objects.get(key=key)
        except License.DoesNotExist:
            raise UnknownLicenseKey("Litsenziya kaliti noto'g'ri.")

        if not license_obj.is_active:
            raise exceptions.AuthenticationFailed('Litsenziya faol emas.')
            
        if license_obj.expires_at < timezone.now():
            raise exceptions.AuthenticationFailed('Litsenziya muddati tugagan.')

        return (DummyUser(license_obj.id), license_obj)


class HeartbeatAuthentication(LicenseAuthentication):
    """
    Heartbeat va buyruq natijasi endpointlari uchun "yumshoq" auth: litsenziya
    kaliti mavjud bo'lishi kifoya - is_active/expires_at tekshirilmaydi. Shu
    orqali o'chirilgan/muddati o'tgan litsenziyaga ega restoran ham aloqada
    qoladi va "sen bloklandingiz" signalini (license_active=False) qabul
    qila oladi. Faollashtirish/yangilash esa qat'iy LicenseAuthentication'da
    qoladi - o'lik litsenziyaga hech qachon yangi token berilmaydi.
    """

    def authenticate_credentials(self, key):
        try:
            license_obj = License.objects.get(key=key)
        except License.DoesNotExist:
            raise UnknownLicenseKey("Litsenziya kaliti noto'g'ri.")

        return (DummyUser(license_obj.id), license_obj)
