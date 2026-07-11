from rest_framework.views import exception_handler

def custom_exception_handler(exc, context):
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
