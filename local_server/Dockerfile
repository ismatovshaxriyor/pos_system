# ---- Stage 1: builder - kompilyatsiya qiladi va manba kodini tozalaydi ----
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Builder'da faqat kompilyator va Cython kerak: modullar Cython orqali
# o'qiladi (import qilinmaydi), shuning uchun requirements.txt bu yerda
# o'rnatilmaydi (build tezroq, hajmga ta'siri yo'q).
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --default-timeout=100 --retries 10 "Cython>=3.0,<4.0" setuptools

COPY . /app/

# licensing/ ning kill-switch mantig'ini va core/ dagi deyarli butun POS
# biznes mantig'ini (PROTECTED_MODULES ro'yxati licensing/setup.py da) .so ga
# kompilyatsiya qiladi, keyin manba .py fayllarini o'chiradi - shu orqali
# yakuniy image'da bu mantiq ochiq matn ko'rinishida qolmaydi (docs/2).
# models.py, migrations/, urls.py/apps.py/admin.py/serializers.py/routing.py
# ataylab tegilmaydi - Django/DRF/Channels ular ustida runtime introspeksiya
# qiladi (admin registratsiyasi, serializer metaklassi, migratsiya grafigi).
# Manba .py fayllarni o'chirish ro'yxati setup.py'ning PROTECTED_MODULES'idan
# olinadi (REMOVE_SOURCES=1) - Dockerfile'da ikkinchi nusxa yo'q, shuning
# uchun ro'yxatlar bir-biridan ajralib ketmaydi (ilgari core/order_templates.py
# kompilyatsiya qilinib, lekin manbasi image'da qolib ketgan edi).
RUN REMOVE_SOURCES=1 python licensing/setup.py build_ext --inplace \
    && rm -rf build licensing/*.c core/*.c licensing/setup.py \
    && rm -rf licensing/tests


# ---- Stage 2: yakuniy ishchi image ----
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# psycopg2-binary o'zining libpq'ini olib keladi - apt paketlari (libpq-dev
# ~22 MB) va --no-cache-dir (pip keshi ~50 MB) kerak emas.
# pg_dump - baza zaxirasini Telegram'ga yuborish uchun (core/tasks.py::send_db_backup).
# Server postgres:15; Debian'ning yangiroq pg_dump'i eski serverni ham dump qila oladi.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip install --no-cache-dir --default-timeout=100 --retries 10 -r requirements.txt

# Builder bosqichidan faqat tayyor natija ko'chiriladi: .so fayllar +
# kompilyatsiya qilinmagan qolgan barcha .py fayllar (core, config,
# licensing/models.py, migratsiyalar va h.k.)
COPY --from=builder /app /app
RUN chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 8000

# entrypoint.sh runs migrations first when RUN_MIGRATIONS=1 (only the `web`
# service sets this in prod, so worker/beat don't race each other on it).
ENTRYPOINT ["/app/entrypoint.sh"]

# Dev compose overrides this with `python manage.py runserver` (source is
# bind-mounted over /app there, so this multi-stage compilation has no
# effect on dev - it only hardens the image actually shipped to prod).
# Prod compose overrides this too (docker-compose.prod.yml) - kept here as
# a self-consistent fallback since `channels` is now a hard dependency and
# gunicorn+WSGI can't serve WebSocket.
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
