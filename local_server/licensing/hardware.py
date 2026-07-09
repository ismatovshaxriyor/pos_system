import hashlib
import uuid
from pathlib import Path

from django.conf import settings

_cached_fingerprint = None

# Motherboard UUID (0400 - odatda faqat root o'qiy oladi; konteyner root
# sifatida ishlaydi). Docker Desktop (macOS/Windows) da bu VM'ning UUID'i
# bo'ladi va VM qayta yaratilganda o'zgarishi mumkin - shu sabab dev/test
# muhitida HARDWARE_ID_OVERRIDE ishlatiladi.
_PRODUCT_UUID_PATH = Path('/sys/class/dmi/id/product_uuid')
_MACHINE_ID_PATH = Path('/etc/machine-id')


def _read_product_uuid():
    try:
        return _PRODUCT_UUID_PATH.read_text().strip()
    except (OSError, PermissionError):
        return None


def _read_machine_id():
    try:
        value = _MACHINE_ID_PATH.read_text().strip()
        return value or None
    except (OSError, PermissionError):
        return None


def _read_mac_address():
    """
    uuid.getnode() konteyner ichida har `docker-compose up`/qayta yaratishda
    o'zgarishi mumkin bo'lgan virtual MAC qaytarishi mumkin (masalan, Docker
    bridge tarmog'i "locally administered" 02:xx:xx:xx:xx:xx turidagi MAC
    beradi). Faqat ikkala shart bajarilgan MAC "haqiqiy" hisoblanadi:
      - multicast bit o'chirilgan (unicast)
      - "locally administered" bit o'chirilgan (ROM'ga yozilgan, dasturiy
        o'rnatilmagan)
    Aks holda None qaytariladi - chaqiruvchi keyingi manbaga o'tadi yoki
    xato beradi (noto'g'ri "barqaror" ID qabul qilishdan ko'ra xavfsizroq).
    """
    node = uuid.getnode()
    first_octet = (node >> 40) & 0xFF
    if first_octet & 0x01:  # multicast bit
        return None
    if first_octet & 0x02:  # locally administered bit (VM/konteyner/dasturiy)
        return None
    return f"{node:012x}"


def get_hardware_fingerprint():
    """
    Qurilmaning barqaror, unikal barmoq izini sha256 xesh ko'rinishida
    qaytaradi. Natija jarayon davomida keshlanadi (fayl I/O har so'rovda
    takrorlanmasin).
    """
    global _cached_fingerprint
    if _cached_fingerprint:
        return _cached_fingerprint

    if settings.HARDWARE_ID_OVERRIDE:
        raw = f"override:{settings.HARDWARE_ID_OVERRIDE}"
    else:
        raw = _read_product_uuid() or _read_machine_id() or _read_mac_address()
        if not raw:
            raise RuntimeError(
                "Qurilma barmoq izini aniqlab bo'lmadi. Dev/test muhitida "
                "HARDWARE_ID_OVERRIDE env o'zgaruvchisini belgilang."
            )

    _cached_fingerprint = hashlib.sha256(raw.encode()).hexdigest()
    return _cached_fingerprint
