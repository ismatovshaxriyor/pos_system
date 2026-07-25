#!/bin/sh
set -e

if [ "$RUN_MIGRATIONS" = "1" ]; then
    python manage.py migrate --noinput
    # Faqat `web` RUN_MIGRATIONS=1 qo'yadi (docker-compose.prod.yml), shuning
    # uchun bu ham deploy'da bir marta ishlaydi, har konteynerda emas -
    # worker/beat HTTP xizmat qilmaydi va yig'ilgan static fayllarga muhtoj
    # emas. STATIC_ROOT (/app/staticfiles) config/urls.py'dagi
    # django.views.static.serve orqali xizmat qilinadi - collectstatic
    # ishlamasa bu papka umuman mavjud bo'lmaydi va har bir /static/ so'rovi
    # 404 qaytaradi (jumladan admin panel CSS/JS va QR web app bundle'i).
    python manage.py collectstatic --noinput
fi

exec "$@"
