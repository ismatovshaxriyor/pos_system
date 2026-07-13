"""
Litsenziyani tekshiruvchi mantiqni Cython orqali .so ga kompilyatsiya qiladi.

Faqat eng muhim modullar tanlangan (docs/2_xavfsizlik_va_litsenziyalash.md
bo'yicha): kill-switch, JWT tekshiruv, hardware fingerprint, Ona bilan
aloqa va buyruq bajarish. Django modellari (models.py), URL/admin/serializer
kabi "yupqa" bog'lovchi fayllar va migratsiyalar ataylab kompilyatsiya
qilinmaydi - ular Django tomonidan runtime'da introspeksiya qilinishi kerak
va bu yerda himoyalanadigan maxfiy mantiq yo'q.

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
]

setup(
    ext_modules=cythonize(
        PROTECTED_MODULES,
        compiler_directives={"language_level": "3"},
    ),
)
