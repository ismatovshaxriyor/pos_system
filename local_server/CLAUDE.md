# local_server — guidance for Claude Code

This file loads automatically when working with files under `local_server/`. See `DEPLOY.md` for full deployment & mDNS auto-discovery setup, repo-root `CLAUDE.md` for the two-project overview, and `local_server/core/CLAUDE.md` for the `core` app's architecture.


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

### Bringing up a fresh prod-compose instance (new restaurant, or a local "what would a new restaurant see" test)
`scripts/setup-new-restaurant.sh` automates the manual checklist this used to be: scaffolds `.env` from `.env.example` (random `SECRET_KEY`/`DB_PASSWORD`/`WATCHTOWER_TOKEN`, `POS_IMAGE` auto-derived from `git remote origin`'s owner), creates `backups/`, checks `keys/license_public.pem` exists, skips starting `cloudflared` if its token is still the placeholder (it otherwise crash-loops), runs `docker compose -f docker-compose.prod.yml up -d`, and curls `/api/discovery/` to confirm it's alive. Pass `--build` to build the image locally instead of pulling from ghcr (e.g. to test unreleased `main` changes before cutting a version tag — see the ALLOWED_HOSTS note below for why that distinction matters).

**`ALLOWED_HOSTS` accepts any private LAN IP automatically** (`config/hosts.py::PrivateLANHost`, RFC1918 + `.local` — wired in via `config/settings.py`) so staff-app discovery (`http://192.168.x.x:8000`) doesn't need a per-restaurant `.env` edit. **This only exists in the image a `v*` tag actually built** (`release-local-server.yml` only builds+pushes on a tag push, never on a plain `main` push) — if you've landed a change to `config/`, `licensing/`, or `core/` on `main` without cutting a release yet, `docker-compose.prod.yml` pulling `ghcr.io/.../pos-local:stable` will still be running the *previous* release's code. This exact gap once made a freshly-built Bola reject every LAN request with `DisallowedHost` even though the fix for it was already on `main`. `.github/workflows/check-local-server-release-freshness.yml` posts a (non-blocking) warning on every `main` push touching `local_server/` when this drift exists — see its summary before assuming a pulled `:stable` image has your latest commit. To get unreleased code into a running prod-compose stack without cutting a release yet, use `setup-new-restaurant.sh --build` (or `docker compose -f docker-compose.prod.yml up -d --build`) instead of pulling.

### Rebuilding the Android staff app after a JS/TS change
`staff_apps/apps/mobile/scripts/rebuild-install.sh` wraps the local release-APK workflow (rsync to a space-free build path since ndk-build breaks on paths with spaces, `gradlew assembleRelease`, `adb install -r`, falling back to `pm install-existing --user 0` for devices — some Xiaomi/MIUI ones observed — that install successfully but not onto the active user profile, then launching the app). Pass `--full` to re-run `expo prebuild --clean` first (needed when native config, e.g. an `app.json` plugin, changed — not needed for plain JS/TS edits).
