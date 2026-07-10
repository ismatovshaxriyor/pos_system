#!/bin/sh
set -e

if [ "$RUN_MIGRATIONS" = "1" ]; then
    # Migration files aren't committed to git (see .gitignore) - each
    # environment generates its own from the current models before applying.
    python manage.py makemigrations --noinput
    python manage.py migrate --noinput
fi

exec "$@"
