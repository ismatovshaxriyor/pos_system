# ---- Stage 1: builder - kompilyatsiya qiladi va manba kodini tozalaydi ----
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip install --default-timeout=100 --retries 10 -r requirements.txt \
    && pip install "Cython>=3.0,<4.0" setuptools

COPY . /app/

# licensing/ ning kill-switch mantig'ini va core/ dagi deyarli butun POS
# biznes mantig'ini (PROTECTED_MODULES ro'yxati licensing/setup.py da) .so ga
# kompilyatsiya qiladi, keyin manba .py fayllarini o'chiradi - shu orqali
# yakuniy image'da bu mantiq ochiq matn ko'rinishida qolmaydi (docs/2).
# models.py, migrations/, urls.py/apps.py/admin.py/serializers.py/routing.py
# ataylab tegilmaydi - Django/DRF/Channels ular ustida runtime introspeksiya
# qiladi (admin registratsiyasi, serializer metaklassi, migratsiya grafigi).
RUN python licensing/setup.py build_ext --inplace \
    && rm -f licensing/middleware.py licensing/jwt_utils.py licensing/hardware.py \
             licensing/client.py licensing/tasks.py licensing/views.py \
             core/services.py core/views.py core/auth_views.py core/reports.py \
             core/inventory.py core/customers.py core/escpos.py core/tasks.py \
             core/consumers.py core/realtime.py core/permissions.py \
             core/authentication.py core/exceptions.py core/middleware.py \
             core/middleware_ws.py \
    && rm -rf build licensing/*.c core/*.c licensing/setup.py \
    && rm -rf licensing/tests


# ---- Stage 2: yakuniy ishchi image ----
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip install --default-timeout=100 --retries 10 -r requirements.txt

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
