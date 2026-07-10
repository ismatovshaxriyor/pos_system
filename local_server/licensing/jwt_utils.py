import jwt
from django.conf import settings
from django.utils import timezone


class LicenseTokenError(Exception):
    """Token yaroqsiz, muddati o'tgan yoki qurilmaga mos kelmaydi."""


def _get_public_key():
    """
    Faollashtirishda Ona'dan olingan kalit (LicenseState.public_key)
    ustunlik qiladi - shu bilan har bir Bola qurilmasiga
    LICENSE_PUBLIC_KEY_FILE'ni qo'lda nusxalash shart emas. Hali
    faollashmagan yoki eski Ona javob bermagan bo'lsa, statik
    fayl/env sozlamasiga (settings.LICENSE_PUBLIC_KEY) qaytadi - masalan
    birinchi marta o'rnatishda yoki bazasi bo'sh disaster-recovery
    holatida.

    Lazy import - modul darajasida import qilinsa AppRegistryNotReady
    xavfi bor (settings.py yuklanish paytida licensing.models hali tayyor
    bo'lmasligi mumkin).
    """
    from .models import LicenseState

    state = LicenseState.load()
    if state and state.public_key:
        return state.public_key
    return settings.LICENSE_PUBLIC_KEY


def verify_token(token, hardware_hash):
    """
    JWT tokenni Ona serverning public kaliti bilan OFLAYN tekshiradi.
    Muvaffaqiyatli bo'lsa claims dict qaytaradi, aks holda LicenseTokenError
    ko'taradi. Soat og'ishiga chidamli (LICENSE_CLOCK_SKEW_SECONDS leeway).
    """
    if not token:
        raise LicenseTokenError("Token mavjud emas.")

    public_key = _get_public_key()

    try:
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            issuer="pos-ona",
            leeway=settings.LICENSE_CLOCK_SKEW_SECONDS,
        )
    except jwt.ExpiredSignatureError:
        if settings.LICENSE_EXP_GRACE_SECONDS <= 0:
            raise LicenseTokenError("Token muddati tugagan.")
        # Grace davri ichida ekanligini qo'lda tekshiramiz (imzoni tasdiqlab).
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            issuer="pos-ona",
            options={"verify_exp": False},
        )
        exp = payload.get("exp", 0)
        now = int(timezone.now().timestamp())
        if now > exp + settings.LICENSE_EXP_GRACE_SECONDS:
            raise LicenseTokenError("Token muddati tugagan (grace davri ham tugadi).")
    except jwt.InvalidTokenError as exc:
        raise LicenseTokenError(f"Token yaroqsiz: {exc}")

    if payload.get("hw") != hardware_hash:
        raise LicenseTokenError("Qurilma mos kelmadi.")

    return payload
