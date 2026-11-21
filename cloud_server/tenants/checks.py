from cryptography.hazmat.primitives import serialization
from django.conf import settings
from django.core.checks import Warning, Tags, register


@register(Tags.compatibility)
def check_license_private_key(app_configs, **kwargs):
    """
    Ona server ishga tushayotganda `LICENSE_PRIVATE_KEY` fayli va kalit holatini
    avtomatik tekshiradi. Kalit mavjud bo'lmasa yoki yaroqsiz bo'lsa,
    console'da aniq va o'qilishi oson bo'lgan ogohlantirish chiqaradi.
    """
    warnings = []
    private_key_pem = getattr(settings, 'LICENSE_PRIVATE_KEY', '')

    if not private_key_pem or not private_key_pem.strip():
        warnings.append(
            Warning(
                "LICENSE_PRIVATE_KEY o'rnatilmagan yoki topilmadi!",
                hint=(
                    "Ona serverda 'python manage.py generate_signing_keys' buyrug'ini "
                    "bajarib, chiqqan private keyni ./keys/license_private.pem fayliga saqlang."
                ),
                id='cloud_server.W001',
            )
        )
    else:
        try:
            serialization.load_pem_private_key(private_key_pem.encode(), password=None)
        except Exception as exc:
            warnings.append(
                Warning(
                    f"LICENSE_PRIVATE_KEY kaliti yaroqsiz (PEM formati buzilgan): {exc}",
                    hint="Fayl mazmuni haqiqiy RSA Private Key PEM formatida ekanini tekshiring.",
                    id='cloud_server.W002',
                )
            )

    return warnings


@register(Tags.security)
def check_insecure_secret_key(app_configs, **kwargs):
    """
    Prod'da SECRET_KEY default (ommaviy repo'dagi) qiymatda qolgan bo'lsa - sessiya/CSRF imzolari soxtalashtirilishi
    mumkin. Ataylab Error emas, Warning: auto-deploy paytida .env'ni bilmasdan turib serverni yiqitmaslik uchun.
    """
    key = getattr(settings, 'SECRET_KEY', '')
    if not settings.DEBUG and (key.startswith('django-insecure') or key.startswith('change-me') or len(key) < 32):
        return [Warning(
            "SECRET_KEY default/qisqa qiymatda - .env'da uzun tasodifiy SECRET_KEY o'rnating.",
            hint="python -c \"import secrets; print(secrets.token_urlsafe(64))\"",
            id='cloud_server.W003',
        )]
    return []
