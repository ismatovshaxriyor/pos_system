# cloud_server — guidance for Claude Code

This file loads automatically when working with files under `cloud_server/`. See the repo-root `CLAUDE.md` for the two-project overview, and `cloud_server/tenants/CLAUDE.md` for the `tenants` app's architecture.

### Dev commands (port 8001, Postgres 127.0.0.1:25432, Redis 127.0.0.1:26379)
```bash
cd cloud_server
docker compose up -d --build       # web, db, redis, celery_worker, celery_beat
docker compose exec web python manage.py makemigrations tenants   # only after changing models - commit the generated files (see repo-root CLAUDE.md)
docker compose exec web python manage.py migrate
docker compose exec web python manage.py createsuperuser
docker compose exec web python manage.py generate_signing_keys   # prints RSA-2048 PEM pair to stdout - see the setup-licensing skill
docker compose exec web python manage.py test sync tenants
```
Admin UI: `http://localhost:8001/admin/` · Swagger: `http://localhost:8001/api/docs/`

First-time licensing setup (generating/placing the RSA keypair) is a one-time onboarding task — see the `setup-licensing` skill rather than repeating it here every session.
