# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A restaurant POS system built around an offline-first "Ona-Bola" (Mother-Child / Cloud-Local) architecture. It is **two independent Django projects** living side by side in this repo, each with its own Docker stack, database, and requirements file — there is no shared code between them:

- **`local_server/`** — the "Bola" (Child). Runs on a machine physically inside each restaurant (mini PC/laptop). Handles day-to-day POS operations (orders, tables, products, cashiers/waiters), enforces the license kill-switch, and must work fully offline for days at a time. Django apps: `core` (POS CRUD), `licensing` (activation/JWT/kill-switch/heartbeat/remote commands).
- **`cloud_server/`** — the "Ona" (Mother). A single central server that all restaurants report to. Issues license JWTs, receives heartbeats/metrics, and pushes remote commands (block, unblock, force-renew, update). Django apps: `tenants` (Restaurant/License/RemoteCommand + admin control panel), `sync` (the HTTP API Bola servers talk to).

The full design intent is documented in Uzbek under `docs/` — read the relevant doc before touching sync, licensing, or deployment code:
- `docs/1_ona_bola_arxitekturasi.md` — cloud/local architecture and two-way sync engine design
- `docs/2_xavfsizlik_va_litsenziyalash.md` — code protection (Cython/PyArmor), hardware fingerprinting, license kill-switch, Docker hardening
- `docs/3_tizim_optimizatsiyasi.md` — DB indexing, connection pooling, Redis caching, Celery concurrency limits, Nginx/static file strategy
- `docs/4_amaliy_ish_oqimi_va_deployment.md` — new-restaurant onboarding flow, Cloudflare Tunnel remote access, disaster recovery, MVP phasing

**Note:** the docs describe the license flow as a plain hardware-hash check; the actual implementation upgrades this to short-lived RS256 JWTs per docs/2's own "signed token with kill-switch" intent — see Licensing architecture below for what's actually built.

## Commands

Each server is developed and run independently via its own compose file. There is no root-level build/run command. Two compose files per project: `docker-compose.yml` (dev — `runserver`, source bind-mounted, ports open on `127.0.0.1`) and `docker-compose.prod.yml` (prod — gunicorn, registry image, Watchtower, no db/redis ports published, needs a real `.env`).

### local_server (dev: port 8000, Postgres 127.0.0.1:15432, Redis 127.0.0.1:16379)
```bash
cd local_server
docker compose up -d --build       # web, db, redis, celery_worker, celery_beat, db_backup
docker compose exec web python manage.py migrate
docker compose exec web python manage.py createsuperuser
docker compose exec web python manage.py makemigrations core   # or: licensing
docker compose exec web python manage.py test licensing        # or: core / licensing.tests.test_middleware etc.
docker compose exec web python manage.py activate_license <KEY>  # CLI onboarding, calls ActivateView in-process
docker compose logs -f celery_beat   # watch send-heartbeat / renew-license-daily firing every ~60s / daily 03:00
```
Admin UI: `http://localhost:8000/admin/` · Swagger: `http://localhost:8000/api/docs/` · Auth: `POST /api/auth/login/` (DRF token)

### cloud_server (dev: port 8001, Postgres 127.0.0.1:25432, Redis 127.0.0.1:26379)
```bash
cd cloud_server
docker compose up -d --build       # web, db, redis, celery_worker, celery_beat
docker compose exec web python manage.py migrate
docker compose exec web python manage.py createsuperuser
docker compose exec web python manage.py generate_signing_keys   # prints RSA-2048 PEM pair to stdout - see Licensing setup below
docker compose exec web python manage.py test sync tenants
```
Admin UI: `http://localhost:8001/admin/` · Swagger: `http://localhost:8001/api/docs/`

Both servers read config from environment variables with dev fallbacks in `config/settings.py`. `.env.example` exists in each project root — copy to `.env` and fill in secrets before any prod deployment (prod compose requires a real `.env` via `env_file:`).

### First-time licensing setup (both servers, needed before activation/kill-switch will work)
```bash
cd cloud_server && docker compose exec web python manage.py generate_signing_keys
# paste the PRIVATE KEY block into cloud_server/keys/license_private.pem
# paste the PUBLIC KEY block into BOTH cloud_server/keys/license_public.pem AND local_server/keys/license_public.pem
# restart both stacks so the key volume mounts are picked up: docker compose restart web celery_worker celery_beat
```
`LICENSE_PRIVATE_KEY_FILE`/`LICENSE_PUBLIC_KEY_FILE` point at `/app/keys/...pem` inside the containers by default (see each `docker-compose.yml`'s `./keys:/app/keys:ro` mount). A missing key file is tolerated at boot (server still starts; licensing endpoints just fail until the key is provided) — see `_load_pem()` in each `config/settings.py`.

## Architecture

### Sync-ready data model (`local_server/core/models.py`)
Every local model inherits an abstract `BaseModel`:
```python
class BaseModel(models.Model):
    sync_uuid = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True, unique=True)
    is_synced = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```
This is how the design in `docs/1_...md` avoids primary-key collisions when local data is later merged into the cloud DB: local rows keep normal `BigAutoField` PKs for local use, but carry a globally-unique `sync_uuid` and an `is_synced` flag meant to be swept periodically and pushed upstream. **This upstream order/menu sync (Bola → Ona data sync, as opposed to the licensing/heartbeat channel below) is still not implemented** — it's explicitly out of MVP scope; the `force_sync` remote command exists as a wired-up stub that just reports "not implemented yet" back to Ona.

Local domain models: `User` (custom, `AUTH_USER_MODEL = 'core.User'`, phone number as username validated by a `+998xxxxxxxxx`-style regex, `role` in `manager`/`cashier`/`waiter`), `Table`, `Category`, `Product` (has `barcode`, `db_index=True`), `Order`, `OrderItem`. `OrderViewSet` has custom `close` and `add_item` actions that recompute `Order.total_amount` server-side — don't bypass this by writing `OrderItem`s directly from client code.

### Licensing & kill-switch (`local_server/licensing/`, `cloud_server/tenants/` + `cloud_server/sync/`)

**JWT signing is asymmetric (RS256):** Ona holds `LICENSE_PRIVATE_KEY` and is the only thing that can mint tokens (`cloud_server/sync/jwt_utils.py::issue_license_token`). Bola holds only `LICENSE_PUBLIC_KEY` and verifies tokens fully offline (`local_server/licensing/jwt_utils.py::verify_token`), which is what lets the kill-switch work for days without internet.

**Bola's state is a DB singleton**, not a file: `licensing.models.LicenseState` (pk forced to 1). It survives container recreation via the Postgres volume and is shared by the `web`/`celery_worker`/`celery_beat` containers. Every `.save()` invalidates the Redis-cached verdict key (`license:verify`) so blocks/unblocks take effect on the next request rather than waiting out the cache TTL.

**Activation flow:** `POST /api/license/activate/` (Bola, unauthenticated) → `OnaClient.activate()` → `POST /api/sync/activate/` (Ona, unauthenticated, license key in body). Ona binds the posted `hardware_hash` to the `License` row on *first* activation and rejects any different hash afterward (`"Qurilma mos kelmadi."`) — re-activating on new hardware requires an admin to run the `reset_hardware_hash` action on `LicenseAdmin` first (disaster-recovery path from docs/4).

**Hardware fingerprinting** (`local_server/licensing/hardware.py::get_hardware_fingerprint`) tries, in order: `HARDWARE_ID_OVERRIDE` env (dev/test only) → `/sys/class/dmi/id/product_uuid` → `/etc/machine-id` → a real burned-in MAC via `uuid.getnode()`. **Important:** the MAC fallback explicitly rejects both the multicast bit *and* the locally-administered bit (`first_octet & 0x02`) — Docker's default bridge network hands out `02:xx:xx:xx:xx:xx` MACs that silently change on every container recreate, which would otherwise re-brick the license on every restart/update. This was caught by live-testing, not by inspection — if you touch this function, re-verify by recreating the container and confirming `/api/license/status/` still reports `activated: true` afterward. Docker Desktop containers typically have *neither* `product_uuid` nor `machine-id` available, so local dev **requires** `HARDWARE_ID_OVERRIDE` set to a stable string in `docker-compose.yml` (already done: `dev-local-machine`).

**Kill-switch middleware** (`local_server/licensing/middleware.py::LicenseEnforcementMiddleware`, registered in `MIDDLEWARE` before `CsrfViewMiddleware`): gates every `/api/` request except `/api/license/*` (activation/status must stay reachable) and `/admin/` (a manager needs to see state and re-activate). Blocked → `402 {"detail": "Tizim bloklandi. To'lovni amalga oshiring."}`. Controlled by `LICENSE_ENFORCEMENT` (`0` in dev compose, should be `1` in prod). Verdict is cached in Redis: 60s when OK, only 10s when blocked (so unblocks propagate fast). On a DB error (e.g. mid-migration) it fails open under `DEBUG`, fails closed otherwise.

**Heartbeat & lenient auth** (`cloud_server/sync/authentication.py::HeartbeatAuthentication`, a subclass of `LicenseAuthentication` that skips the `is_active`/`expires_at` checks): the heartbeat/command-result endpoints deliberately accept a *dead* license — otherwise a deactivated restaurant would go dark instead of receiving the "you're blocked" signal. Only `activate`/`renew` use the strict `LicenseAuthentication` (never issues tokens for a dead license). Bola's `licensing.tasks.send_heartbeat` (Celery beat, every 60s, `expires=50`) posts `licensing.metrics.collect_metrics()` (psutil CPU/RAM/disk + `APP_VERSION` + unsynced order count) and reads back `license_active` (self-block/unblock) and any queued `commands`.

**Remote commands** (`tenants.models.RemoteCommand`, Ona-side queue): since Bolas sit behind NAT, commands are never pushed — they piggyback on the heartbeat *response* (`pending` → `sent`, capped at 10 per beat) and Bola reports outcomes to `POST /api/sync/commands/<uuid>/result/`. Dispatch table lives in `local_server/licensing/tasks.py::COMMAND_HANDLERS` (`block_system`, `unblock_system`, `force_license_renew`, `force_sync` stub, `restart_services` — deliberately refuses, no docker.sock access). `update_app` is special-cased outside that table: it must report its "started" result *before* calling Watchtower, because Watchtower recreates the very `celery_worker` container running the task; actual rollout success is confirmed on Ona by the next heartbeat's `app_version`, not by the command result.

**Update rollout** (Phase 5, prod-only): `local_server/docker-compose.prod.yml` runs a `watchtower` container in HTTP-API mode (`WATCHTOWER_HTTP_API_UPDATE`, token-protected, no polling) scoped to the `web`/`celery_worker`/`celery_beat` services via `com.centurylinklabs.watchtower.enable=true` labels (so `db`/`redis`/`db_backup` are never touched). Images come from `${POS_IMAGE:-ghcr.io/ORG/pos-local}:${RELEASE_CHANNEL:-stable}` — Watchtower re-pulls whatever tag a container already runs, so all restaurants on the same `RELEASE_CHANNEL` update together; per-restaurant pinning would need a distinct channel tag per machine (already parameterized, just unset today). `entrypoint.sh` runs `migrate --noinput` only when `RUN_MIGRATIONS=1` (set on `web` only, so three containers don't race migrations after Watchtower recreates them).

### Cloud tenancy (`cloud_server/tenants/models.py`)
`Restaurant`, `License` (one-to-one), `RestaurantStatus` (one-to-one, latest heartbeat metrics — overwritten, not historized), `RemoteCommand` (FK, queue with `pending`/`sent`/`acknowledged`/`completed`/`failed` lifecycle). `RestaurantAdmin` shows a green/red Onlayn/Oflayn badge (`is_online`, flipped by `tenants.tasks.mark_offline_restaurants`, a Celery-beat task every 60s that marks anything silent for 3+ minutes offline) and has bulk actions to enqueue `block_system`/`unblock_system`/`force_license_renew`/`update_app` commands from the restaurant list.

### Auth quirks
- `local_server/core/middleware.py` — `SwaggerTokenPrefixMiddleware` auto-prepends `"Token "` to `Authorization` headers that are exactly 40 chars with no space, purely to make testing via Swagger UI easier.
- `local_server` uses standard DRF `TokenAuthentication` for its own POS users; `cloud_server`'s `sync` app uses `LicenseAuthentication`/`HeartbeatAuthentication` (keyword is also literally `'Token'`, not `'License'`, despite the class name) — don't conflate the two token systems when adding endpoints.
- Neither `LicenseAuthentication` nor `HeartbeatAuthentication` override `authenticate_header()`, so DRF coerces auth failures from 401 to 403 (see `get_authenticate_header` in DRF's `APIView.handle_exception`). Tests assert 403, not 401, for these endpoints — this is existing, intentional-by-omission behavior, not a bug to "fix" reflexively.

### Admin
Both projects use `django-jazzmin` (dark theme) as the admin skin, configured in each `config/settings.py` under `JAZZMIN_SETTINGS`/`JAZZMIN_UI_TWEAKS`.

## Implementation status vs. docs

- ✅ Full licensing/control-plane loop: activation, RS256 JWT issuance + offline verification, daily auto-renewal, kill-switch middleware, heartbeat with real psutil metrics, online/offline tracking, remote command queue (block/unblock/force-renew/update-app/restart-refused), Watchtower-based rollout (prod compose only, not live-tested against a real registry in this environment).
- ❌ Not yet built: actual POS data sync (upstream order push / downstream menu push via `is_synced` sweep — `force_sync` is a stub), `MenuUpdateLog`, Cython/PyArmor code obfuscation, Telegram/email alerting (admin-panel-only by design choice), `restart_services` remote command (needs docker.sock, deliberately not wired up).
- Test suites exist and pass: `cloud_server` → `manage.py test sync tenants`; `local_server` → `manage.py test core licensing`.

## Repo state

This directory is **not currently a git repository** (no `.git`). A root `.gitignore` already exists (covers `.env`, `keys/*.pem`, `backups/`, etc.) for whenever `git init` happens. If asked to commit or create a PR, confirm with the user whether to `git init` first.
