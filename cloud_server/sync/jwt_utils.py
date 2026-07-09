from datetime import timedelta

import jwt
from django.conf import settings
from django.utils import timezone


def issue_license_token(license_obj):
    """
    License obyekti uchun RS256 bilan imzolangan JWT token yasaydi.
    Faqat Ona serverda ishlaydi (private key shu yerda).
    Qaytaradi: (token_str, expires_at_datetime)
    """
    now = timezone.now()
    exp = now + timedelta(days=settings.LICENSE_TOKEN_TTL_DAYS)

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
