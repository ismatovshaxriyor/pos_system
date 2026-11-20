"""
ALLOWED_HOSTS uchun "restoran tarmog'i" naqshi.

Bola restoran WiFi'sida ishlaydi va ilovalar uni IP orqali topadi (mDNS / skaner), masalan
`http://192.168.1.50:8000`. Django esa Host sarlavhasi ALLOWED_HOSTS'da bo'lmasa so'rovni `400`
bilan rad etadi, IP diapazonini (CIDR) esa qo'llab-quvvatlamaydi. Har restoran o'z IP'sini `.env`ga
qo'lda yozishi kerak bo'lmasligi uchun shu naqsh xususiy IPv4 manzillarni (RFC 1918) qabul qiladi.

Faqat IP *literal*lari: `192.168.1.50` mos keladi, `192.168.1.50.evil.com` yoki jamoat IP (`8.8.8.8`) YO'Q.
"""
import ipaddress

_PRIVATE_NETS = (
    ipaddress.ip_network('10.0.0.0/8'),
    ipaddress.ip_network('172.16.0.0/12'),
    ipaddress.ip_network('192.168.0.0/16'),
)


def is_private_lan_ip(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.version == 4 and any(ip in net for net in _PRIVATE_NETS)


class PrivateLANHost(str):
    """
    ALLOWED_HOSTS elementi. Django `pattern == host` bilan solishtiradi (`django.utils.http.is_same_domain`),
    shu sababli `__eq__` xususiy IPv4 manzilga True qaytaradi. Qiymatning o'zi nuqta bilan boshlanmaydi,
    shuning uchun Django uni subdomain naqshi deb talqin qilmaydi.
    """

    def __new__(cls):
        return super().__new__(cls, 'private-lan')

    def lower(self):  # is_same_domain `pattern.lower()` chaqiradi - o'zimizni qaytaramiz.
        return self

    def __eq__(self, other):
        return isinstance(other, str) and is_private_lan_ip(other)

    def __ne__(self, other):
        return not self.__eq__(other)

    __hash__ = str.__hash__
