"""
Mijoz IP'sini ishonchli aniqlash (throttle/brute-force limitlari uchun).

DRF'ning standart `get_ident()` si `NUM_PROXIES` o'rnatilmasa butun
`X-Forwarded-For` qatorini kalit qiladi - mijoz o'zi bu sarlavhaga har safar
boshqa qiymat yozib, IP bo'yicha limitlarni butunlay aylanib o'ta oladi.

Prod'da Django FAQAT Cloudflare tunnel -> nginx (`website`) orqali ochiq (public
port yo'q), Cloudflare esa `CF-Connecting-IP` ni har doim O'ZI yozadi (mijoz
yuborgan qiymat ustidan). Shu sabab shu sarlavhaga ishonamiz. Sarlavha kelmasa
(dev, `127.0.0.1:8001` ga to'g'ridan-to'g'ri so'rov) - `REMOTE_ADDR`.
"""
from django.conf import settings


def client_ip(request) -> str:
    header = getattr(settings, 'CLIENT_IP_HEADER', '')
    if header:
        value = request.META.get(header, '').strip()
        if value:
            return value
    return request.META.get('REMOTE_ADDR', '') or 'unknown'
