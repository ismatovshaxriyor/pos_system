from datetime import timedelta

import jwt
from cryptography.hazmat.primitives import serialization
from django.conf import settings
from django.utils import timezone


def get_public_key_pem():
    """
    Private key'dan public qismini hosil qiladi - alohida saqlangan
    LICENSE_PUBLIC_KEY sozlamasi yo'q, shu bilan ikkalasi hech qachon
    bir-biridan ajralib qolmaydi (masalan private key almashtirilganda
    kimdir alohida public faylni yangilashni unutib qo'yishi mumkin edi).
    Faollashtirish javobida Bolaga yuboriladi - qarang: sync/views.py
    ActivationView.
    """
    private_key = serialization.load_pem_private_key(settings.LICENSE_PRIVATE_KEY.encode(), password=None)
    return private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()


def _build_token(license_obj, start, ttl_days):
    """
    `start`dan boshlab `ttl_days` kunlik JWT yasaydi. Token muddati HECH
    QACHON license.expires_at'dan uzoqroq bo'lmaydi - aks holda litsenziya
    muddati tugagandan keyin ham (oldindan olingan uzoq muddatli token
    tufayli) Bola bir necha kun ishlab qolishi mumkin edi. Shu bilan
    litsenziya muddati = amaldagi bloklash muddati.
    """
    exp = min(start + timedelta(days=ttl_days), license_obj.expires_at)

    claims = {
        "iss": "pos-ona",
        "sub": str(license_obj.restaurant_id),
        "license_id": str(license_obj.id),
        "hw": license_obj.hardware_hash,
        "iat": int(start.timestamp()),
        "nbf": int(start.timestamp()) - 60,
        "exp": int(exp.timestamp()),
    }

    token = jwt.encode(claims, settings.LICENSE_PRIVATE_KEY, algorithm="RS256")
    return token, exp


def issue_license_token(license_obj):
    """
    License obyekti uchun bitta RS256 JWT yasaydi (hozirgi paytdan boshlab).
    Faqat Ona serverda ishlaydi (private key shu yerda).
    Qaytaradi: (token_str, expires_at_datetime)

    Qo'lda tarqatiladigan oflayn yangilash kodlari uchun ishlatiladi (bitta
    qisqa token - Telegram/SMS orqali nusxalab yuborish qulay bo'lishi
    uchun). Doimiy avtomatik yangilash uchun `issue_license_token_batch`ga
    qarang.
    """
    return _build_token(license_obj, timezone.now(), settings.LICENSE_TOKEN_TTL_DAYS)


def issue_license_token_batch(license_obj, count=None):
    """
    Bittasi tugagan zahoti keyingisi boshlanadigan qilib, ketma-ket bir
    nechta token yasaydi. Bola bularning barchasini bir martada saqlab
    qo'yadi va vaqti kelganda mahalliy ravishda birin-ketin almashtiradi -
    shu bilan restoran haftalar davomida oflayn qolsa ham, Onaga qayta-qayta
    ulanmasdan ishlashda davom etadi (private key baribir faqat shu yerda
    qoladi, Bola hech qachon o'zi token yasay olmaydi).

    Litsenziya muddati (`license_obj.expires_at`) yetib kelsa, keyingi
    tokenlar yasalmay to'xtatiladi.

    Qaytaradi: [(token_str, expires_at_datetime), ...] - kamida bitta token.
    """
    count = count or settings.LICENSE_TOKEN_BATCH_SIZE
    tokens = []
    start = timezone.now()

    for _ in range(max(count, 1)):
        token, exp = _build_token(license_obj, start, settings.LICENSE_TOKEN_TTL_DAYS)
        tokens.append((token, exp))
        if exp >= license_obj.expires_at:
            break
        start = exp

    return tokens
