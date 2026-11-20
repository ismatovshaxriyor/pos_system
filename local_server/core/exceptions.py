from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

PROTECTED_MESSAGE = "Bu yozuv boshqa joylarda ishlatilgan (retsept, kirim, buyurtma), shuning uchun o'chirib bo'lmaydi. Uni faolsizlantiring."


def custom_exception_handler(exc, context):
    # `on_delete=PROTECT` (masalan retseptda/kirimda ishlatilgan ingredient, buyurtmali stol) DRF'da 500 bo'lardi.
    if isinstance(exc, ProtectedError):
        return Response(
            {'detail': PROTECTED_MESSAGE, 'code': 'protected', 'fields': {}},
            status=status.HTTP_409_CONFLICT,
        )

    response = exception_handler(exc, context)

    if response is not None:
        custom_response_data = {
            'detail': 'Xatolik yuz berdi.',
            'code': getattr(exc, 'default_code', 'error'),
            'fields': {}
        }
        
        if isinstance(response.data, list):
            custom_response_data['detail'] = response.data[0]
        elif isinstance(response.data, dict):
            if 'detail' in response.data:
                custom_response_data['detail'] = response.data['detail']
            else:
                custom_response_data['detail'] = 'Validatsiya xatosi.'
                custom_response_data['fields'] = response.data
                custom_response_data['code'] = 'validation_error'

        response.data = custom_response_data

    return response
