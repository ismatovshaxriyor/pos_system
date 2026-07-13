# local_server — guidance for Claude Code

This file loads automatically when working with files under `local_server/`. See the repo-root `CLAUDE.md` for the two-project overview, and `local_server/core/CLAUDE.md` for the `core` app's architecture.

### Dev commands (port 8000, Postgres 127.0.0.1:15432, Redis 127.0.0.1:16379)
```bash
cd local_server
docker compose up -d --build       # web, db, redis, celery_worker, celery_beat, db_backup
docker compose exec web python manage.py makemigrations core licensing   # only after changing models - commit the generated files (see repo-root CLAUDE.md)
docker compose exec web python manage.py migrate
docker compose exec web python manage.py createsuperuser
docker compose exec web python manage.py test licensing        # or: core / licensing.tests.test_middleware etc.
docker compose exec web python manage.py activate_license <KEY>  # CLI onboarding, calls ActivateView in-process
docker compose exec web python manage.py seed_demo_data [--days N]  # fills the dev DB with a realistic restaurant (tables, staff, days of orders) for manual/demo testing
docker compose logs -f celery_beat   # watch send-heartbeat / renew-license-daily firing every ~60s / daily 03:00
make cleardata   # django flush (interactive confirm) - wipes data, keeps schema
make user        # createsuperuser shortcut
```
Admin UI: `http://localhost:8000/admin/` · Swagger: `http://localhost:8000/api/docs/` · Auth: `POST /api/auth/login/` (DRF token)

First-time licensing setup (generating/placing the RSA keypair) is a one-time onboarding task — see the `setup-licensing` skill rather than repeating it here every session.
