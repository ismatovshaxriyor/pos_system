import logging
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)

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

    return response
