import re

from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

PROTECTED_MESSAGE = "Bu yozuv boshqa joylarda ishlatilgan (retsept, kirim, buyurtma), shuning uchun o'chirib bo'lmaydi. Uni faolsizlantiring."


# DRF/Django standart (inglizcha) xabarlari -> o'zbekcha. Faqat TO'LIQ mos kelganda almashtiriladi,
# shuning uchun o'zimiz yozgan o'zbekcha xabarlarga tegmaydi. Tartib muhim: aniqroq andozalar oldinda.
_N = r'(\d+)'
_EN_TO_UZ: list[tuple[re.Pattern, str]] = [
    (re.compile(p), r) for p, r in [
        (r'^Unable to log in with provided credentials\.$', "Telefon raqami yoki parol noto'g'ri."),
        (r'^Must include "username" and "password"\.$', "Telefon raqam va parolni kiriting."),
        (r'^This field is required\.$', "Bu maydon to'ldirilishi shart."),
        (r'^This field may not be (null|blank)\.$', "Bu maydon bo'sh bo'lishi mumkin emas."),
        (r'^Not a valid string\.$', "Matn kiriting."),
        (r'^A valid integer is required\.$', "Butun son kiriting."),
        (r'^A valid number is required\.$', "Son kiriting."),
        (r'^Must be a valid boolean\.$', "Ha yoki yo'q qiymati kerak."),
        (r'^Enter a valid email address\.$', "Email manzili noto'g'ri."),
        (r'^Enter a valid URL\.$', "Havola (URL) noto'g'ri."),
        (r'^Enter a valid IPv[46](?: or IPv[46])? address\.$', "IP manzil noto'g'ri."),
        (r'^Ensure this field has no more than ' + _N + r' characters\.$', r"Ko'pi bilan \1 ta belgi bo'lishi mumkin."),
        (r'^Ensure this field has at least ' + _N + r' characters\.$', r"Kamida \1 ta belgi bo'lishi kerak."),
        (r'^Ensure this value is less than or equal to (.+)\.$', r"Qiymat \1 dan oshmasligi kerak."),
        (r'^Ensure this value is greater than or equal to (.+)\.$', r"Qiymat kamida \1 bo'lishi kerak."),
        (r'^Ensure that there are no more than ' + _N + r' digits in total\.$', r"Raqamlar soni jami \1 tadan oshmasligi kerak."),
        (r'^Ensure that there are no more than ' + _N + r' decimal places?\.$', r"Kasr qismida ko'pi bilan \1 ta raqam bo'lishi mumkin."),
        (r'^Ensure that there are no more than ' + _N + r' digits before the decimal point\.$', r"Butun qismida ko'pi bilan \1 ta raqam bo'lishi mumkin."),
        (r'^"(.*)" is not a valid choice\.$', "Tanlangan qiymat ruxsat etilganlar ichida yo'q."),
        (r'^Invalid pk "(.*)" - object does not exist\.$', "Tanlangan yozuv topilmadi."),
        (r'^Incorrect type\. Expected pk value, received (.*)\.$', "Qiymat turi noto'g'ri."),
        (r'^Datetime has wrong format\..*$', "Sana va vaqt formati noto'g'ri."),
        (r'^Date has wrong format\..*$', "Sana formati noto'g'ri."),
        (r'^Time has wrong format\..*$', "Vaqt formati noto'g'ri."),
        (r'^Expected a list of items but got type "(.*)"\.$', "Ro'yxat kerak."),
        (r'^This list may not be empty\.$', "Ro'yxat bo'sh bo'lmasligi kerak."),
        (r'^Ensure this field has no more than ' + _N + r' elements\.$', r"Ro'yxatda ko'pi bilan \1 ta element bo'lishi mumkin."),
        (r'^Ensure this field has at least ' + _N + r' elements\.$', r"Ro'yxatda kamida \1 ta element bo'lishi kerak."),
        (r'^Invalid data\. Expected a dictionary, but got (.*)\.$', "So'rov ma'lumoti noto'g'ri formatda."),
        (r'^This field must be unique\.$', "Bunday qiymat allaqachon mavjud."),
        (r'^.+ with this .+ already exists\.$', "Bunday yozuv allaqachon mavjud."),
        (r'^The fields .+ must make a unique set\.$', "Bunday yozuv allaqachon mavjud."),
        (r'^Invalid token(?: header.*)?\.$', "Sessiya yaroqsiz yoki tugagan. Qaytadan kiring."),
        (r'^Authentication credentials were not provided\.$', "Tizimga kirilmagan. Qaytadan kiring."),
        (r'^Incorrect authentication credentials\.$', "Kirish ma'lumotlari yaroqsiz. Qaytadan kiring."),
        (r'^User inactive or deleted\.$', "Akkaunt faol emas yoki o'chirilgan."),
        (r'^You do not have permission to perform this action\.$', "Bu amalni bajarishga ruxsatingiz yo'q."),
        (r'^Not found\.$', "Topilmadi."),
        (r'^No .+ matches the given query\.$', "Topilmadi."),
        (r'^Method "(.*)" not allowed\.$', "Bu so'rov turi qo'llab-quvvatlanmaydi."),
        (r'^Request was throttled\. Expected available in ' + _N + r' seconds?\.$', r"Juda ko'p urinish. \1 soniyadan keyin qayta urining."),
        (r'^Request was throttled\.$', "Juda ko'p urinish. Birozdan keyin qayta urining."),
        (r'^(?:Malformed request|JSON parse error.*)\.?$', "So'rov ma'lumoti noto'g'ri formatda."),
        (r'^Unsupported media type.*$', "So'rov turi qo'llab-quvvatlanmaydi."),
        (r'^Could not satisfy the request Accept header\.$', "So'ralgan format qo'llab-quvvatlanmaydi."),
        (r'^Order already completed or cancelled\.?$', "Buyurtma allaqachon yopilgan yoki bekor qilingan."),
        (r'^Enter a valid .+\.$', "Qiymat noto'g'ri kiritilgan."),
    ]
]

GENERIC_VALIDATION = "Ma'lumotlar to'g'ri kiritilmagan."


def localize_message(msg):
    """Inglizcha standart xabarni o'zbekchaga o'giradi; tanilmasa - o'zgarishsiz qaytaradi."""
    text = str(msg)
    for pattern, repl in _EN_TO_UZ:
        if pattern.match(text):
            return pattern.sub(repl, text)
    return text


def _localize_tree(data):
    if isinstance(data, dict):
        return {k: _localize_tree(v) for k, v in data.items()}
    if isinstance(data, (list, tuple)):
        return [_localize_tree(v) for v in data]
    if isinstance(data, str):
        return localize_message(data)
    return data


def _first_message(value):
    """Ichma-ich ro'yxat/lug'atdan birinchi matnni oladi."""
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        for v in value:
            m = _first_message(v)
            if m:
                return m
    if isinstance(value, dict):
        for v in value.values():
            m = _first_message(v)
            if m:
                return m
    return ''


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

        data = _localize_tree(response.data)
        if isinstance(data, list):
            custom_response_data['detail'] = _first_message(data) or custom_response_data['detail']
        elif isinstance(data, dict):
            if 'detail' in data:
                custom_response_data['detail'] = _first_message(data['detail']) or custom_response_data['detail']
            else:
                # Maydonga bog'lanmagan xato (masalan "parol noto'g'ri") - to'g'ridan-to'g'ri xabar sifatida;
                # maydon xatolari bo'lsa - umumiy sarlavha + `fields` (ilova maydon nomini o'zi qo'shadi).
                non_field = data.get('non_field_errors')
                if non_field and len(data) == 1:
                    custom_response_data['detail'] = _first_message(non_field)
                    custom_response_data['code'] = 'validation_error'
                else:
                    custom_response_data['detail'] = GENERIC_VALIDATION
                    custom_response_data['fields'] = data
                    custom_response_data['code'] = 'validation_error'

        response.data = custom_response_data

    return response
