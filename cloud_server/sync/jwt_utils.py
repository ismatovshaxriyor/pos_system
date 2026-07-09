from datetime import timedelta

import jwt
from django.conf import settings
from django.utils import timezone


def issue_license_token(license_obj):
    """
    License obyekti uchun RS256 bilan imzolangan JWT token yasaydi.
    Faqat Ona serverda ishlaydi (private key shu yerda).
    Qaytaradi: (token_str, expires_at_datetime)

    Token muddati HECH QACHON license.expires_at'dan uzoqroq bo'lmaydi -
    aks holda litsenziya muddati tugagandan keyin ham (oxirgi yangilashda
    olingan uzoq muddatli token tufayli) Bola bir necha kun ishlab qolishi
    mumkin edi. Shu bilan litsenziya muddati = amaldagi bloklash muddati.
    """
    now = timezone.now()
    max_exp = now + timedelta(days=settings.LICENSE_TOKEN_TTL_DAYS)
    exp = min(max_exp, license_obj.expires_at)

    claims = {
        "iss": "pos-ona",
        "sub": str(license_obj.restaurant_id),
        "license_id": str(license_obj.id),
        "hw": license_obj.hardware_hash,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()) - 60,
        "exp": int(exp.timestamp()),
    }

    token = jwt.encode(claims, settings.LICENSE_PRIVATE_KEY, algorithm="RS256")
    return token, exp
