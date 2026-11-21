"""
Litsenziyani tekshiruvchi va POS biznes mantiqini Cython orqali .so ga
kompilyatsiya qiladi.

Qamrov kill-switch'dan tashqari deyarli butun `core` ilovasini ham o'z
ichiga oladi (docs/2_xavfsizlik_va_litsenziyalash.md bo'yicha kengaytirilgan):
buyurtma/to'lov/chegirma mantig'i, hisobotlar, qarz daftari, ombor, ESC/POS
chek chiqarish, WebSocket real-vaqt kanali, auth/permission qatlami. Django
modellari (models.py), URL/admin/serializer kabi "yupqa" bog'lovchi fayllar
va migratsiyalar ataylab kompilyatsiya qilinmaydi - ular Django tomonidan
runtime'da introspeksiya qilinishi kerak (admin registratsiyasi, DRF
serializer metaklassi, migratsiya grafigi) va bu yerda himoyalanadigan
maxfiy mantiq yo'q.

Ishlatilishi (Dockerfile'ning builder bosqichida):
    python licensing/setup.py build_ext --inplace
"""
from setuptools import setup
from Cython.Build import cythonize

PROTECTED_MODULES = [
    "licensing/middleware.py",
    "licensing/jwt_utils.py",
    "licensing/hardware.py",
    "licensing/client.py",
    "licensing/tasks.py",
    "licensing/views.py",
    "core/services.py",
    "core/views.py",
    "core/auth_views.py",
    "core/reports.py",
    "core/inventory.py",
    "core/customers.py",
    "core/order_templates.py",
    "core/escpos.py",
    "core/tasks.py",
    "core/consumers.py",
    "core/realtime.py",
    "core/permissions.py",
    "core/authentication.py",
    "core/exceptions.py",
    "core/middleware.py",
    "core/middleware_ws.py",
]

setup(
    ext_modules=cythonize(
        PROTECTED_MODULES,
        compiler_directives={"language_level": "3"},
    ),
)
