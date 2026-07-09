FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . /app/
RUN chmod +x /app/entrypoint.sh

EXPOSE 8001

# entrypoint.sh runs migrations first when RUN_MIGRATIONS=1 (only the `web`
# service sets this in prod, so worker/beat don't race each other on it).
ENTRYPOINT ["/app/entrypoint.sh"]

# Dev compose overrides this with `python manage.py runserver`; prod compose
# uses this gunicorn default.
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8001", "--workers", "2"]
