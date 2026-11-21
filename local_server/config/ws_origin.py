"""
WebSocket `Origin` tekshiruvi - Django'ning `ALLOWED_HOSTS` mantig'i bilan bir xil.

Channels'ning `AllowedHostsOriginValidator`i `ALLOWED_HOSTS` elementlarini URL sifatida o'zi qayta
parse qiladi, shu sababli `config.hosts.PrivateLANHost` (xususiy LAN IP'ni qabul qiluvchi naqsh) u yerda
mos kelmaydi: HTTP `http://192.168.x.x:8000` ishlaydi, `ws://192.168.x.x:8000/ws/events/` esa `403`
bilan rad etilardi - ilovalar real-vaqt kanaliga LAN IP orqali ulana olmasdi (React Native `Origin:
http://<ip>:<port>` yuboradi). Bu yerda hostname Django'ning o'z `validate_host()`i bilan tekshiriladi.

`Origin` bo'lmagan yoki hostname'siz (`null`, `file://`) ulanishlarga ruxsat beriladi: bular brauzer
sahifasi emas (mobil/Electron mijoz), autentifikatsiya esa cookie emas, so'rov satridagi token orqali -
Origin tekshiruvi (CSRF himoyasi) bu yerda qo'shimcha xavfsizlik bermaydi, faqat haqiqiy mijozni
to'sib qo'yadi.
"""
from urllib.parse import urlparse

from channels.security.websocket import OriginValidator
from django.conf import settings
from django.http.request import validate_host


class AllowedHostsOriginValidator(OriginValidator):
    def __init__(self, application):
        super().__init__(application, settings.ALLOWED_HOSTS)

    def valid_origin(self, parsed_origin):
        hostname = parsed_origin.hostname if parsed_origin is not None else None
        if not hostname:
            return True
        allowed = settings.ALLOWED_HOSTS
        if settings.DEBUG and not allowed:
            allowed = ['.localhost', '127.0.0.1', '[::1]']
        return validate_host(hostname, allowed)
