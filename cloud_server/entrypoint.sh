#!/bin/sh
set -e

if [ "$RUN_MIGRATIONS" = "1" ]; then
    # Migration files aren't committed to git (see .gitignore) - each
    # environment generates its own from the current models before applying.
    python manage.py makemigrations --noinput
    python manage.py migrate --noinput
    # Only web sets RUN_MIGRATIONS=1 (see docker-compose.prod.yml), so this
    # also only runs once per deploy, not once per container (worker/beat
    # don't serve HTTP and don't need collected static files).
    python manage.py collectstatic --noinput
fi

exec "$@"
