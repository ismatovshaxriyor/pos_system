import logging
import re

from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)

# Ona javoblari Bola orqali (ba'zan o'zgarishsiz) restoran xodimiga yetib boradi - shuning uchun DRF'ning
# inglizcha standart matnlari bu yerda ham o'zbekchaga o'giriladi. Faqat TO'LIQ mos kelganda almashtiriladi.
_EN_TO_UZ = [
    (re.compile(p), r) for p, r in [
        (r'^Authentication credentials were not provided\.$', "Litsenziya kaliti yuborilmadi."),
        (r'^Incorrect authentication credentials\.$', "Litsenziya kaliti noto'g'ri."),
        (r'^You do not have permission to perform this action\.$', "Bu amalni bajarishga ruxsat yo'q."),
        (r'^Not found\.$', 'Topilmadi.'),
        (r'^Method ".*" not allowed\.$', "Bu so'rov turi qo'llab-quvvatlanmaydi."),
        (r'^Request was throttled\. Expected available in (\d+) seconds?\.$', r"Juda ko'p urinish. \1 soniyadan keyin qayta urining."),
        (r'^Request was throttled\.$', "Juda ko'p urinish. Birozdan keyin qayta urining."),
        (r'^(?:Malformed request|JSON parse error.*)\.?$', "So'rov ma'lumoti noto'g'ri formatda."),
        (r'^This field is required\.$', "Bu maydon to'ldirilishi shart."),
        (r'^This field may not be (?:null|blank)\.$', "Bu maydon bo'sh bo'lishi mumkin emas."),
        (r'^Not a valid string\.$', 'Matn kiriting.'),
        (r'^Ensure this field has no more than (\d+) characters\.$', r"Ko'pi bilan \1 ta belgi bo'lishi mumkin."),
    ]
]


def _localize(data):
    if isinstance(data, dict):
        return {k: _localize(v) for k, v in data.items()}
    if isinstance(data, (list, tuple)):
        return [_localize(v) for v in data]
    if isinstance(data, str):
        for pattern, repl in _EN_TO_UZ:
            if pattern.match(data):
                return pattern.sub(repl, data)
    return data


def custom_exception_handler(exc, context):
    """
    Ona serverda kutilmagan crash/exception bo'lganda HTML 500 o'rniga har doim
    tuzilmaviy JSON xatosini qaytaradi - bu Cloudflare/Nginx 502 Bad Gateway
    ga aylantirmasligini va Bola server toza xabarni qabul qilishini ta'minlaydi.
    """
    response = exception_handler(exc, context)

    if response is None:
        logger.error("Ona serverda ishlov berilmagan kutilmagan xatolik: %s", exc, exc_info=True)
        return Response(
            {
                "detail": "Ona serverda ichki xatolik yuz berdi. Iltimos backend loglarini tekshiring.",
                "code": "internal_server_error",
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    response.data = _localize(response.data)
    return response
