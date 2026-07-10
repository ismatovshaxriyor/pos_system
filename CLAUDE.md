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

Each server is developed and run independently via its own compose file. There is no root-level build/run command. Two compose files per project: `docker-compose.yml` (dev — `runserver`, source bind-mounted, ports open on `127.0.0.1`) and `docker-compose.prod.yml` (prod — registry image, Watchtower, no db/redis ports published, needs a real `.env`). The prod app server differs between the two: `cloud_server` runs plain `gunicorn config.wsgi:application`, while `local_server` runs `daphne config.asgi:application` instead (ASGI, needed to serve the `ws/events/` WebSocket channel — see Staff PIN + device auth below); its dev `runserver` is also ASGI-aware for the same reason, since `daphne` is first in `INSTALLED_APPS`.

**Migration files are not committed to git** (gitignored via `**/migrations/*.py`, `__init__.py` excepted) — each environment generates its own from the current `models.py` state. `entrypoint.sh` in both projects runs `makemigrations --noinput` immediately before `migrate --noinput` whenever `RUN_MIGRATIONS=1`, so a fresh checkout/container always regenerates what it needs; there's nothing to reconcile by hand between environments. On a fresh `git clone`, run `makemigrations` yourself before the first `migrate` (see below) — the `migrations/` directories exist but start out with only `__init__.py`.

### local_server (dev: port 8000, Postgres 127.0.0.1:15432, Redis 127.0.0.1:16379)
```bash
cd local_server
docker compose up -d --build       # web, db, redis, celery_worker, celery_beat, db_backup
docker compose exec web python manage.py makemigrations core licensing   # regenerate from current models (not committed - see above)
docker compose exec web python manage.py migrate
docker compose exec web python manage.py createsuperuser
docker compose exec web python manage.py test licensing        # or: core / licensing.tests.test_middleware etc.
docker compose exec web python manage.py activate_license <KEY>  # CLI onboarding, calls ActivateView in-process
docker compose logs -f celery_beat   # watch send-heartbeat / renew-license-daily firing every ~60s / daily 03:00
```
Admin UI: `http://localhost:8000/admin/` · Swagger: `http://localhost:8000/api/docs/` · Auth: `POST /api/auth/login/` (DRF token)

### cloud_server (dev: port 8001, Postgres 127.0.0.1:25432, Redis 127.0.0.1:26379)
```bash
cd cloud_server
docker compose up -d --build       # web, db, redis, celery_worker, celery_beat
docker compose exec web python manage.py makemigrations tenants   # regenerate from current models (not committed - see above)
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
    history = HistoricalRecords(inherit=True)  # django-simple-history - see note below
```
This is how the design in `docs/1_...md` avoids primary-key collisions when local data is later merged into the cloud DB: local rows keep normal `BigAutoField` PKs for local use, but carry a globally-unique `sync_uuid` and an `is_synced` flag meant to be swept periodically and pushed upstream. **This upstream order/menu sync (Bola → Ona data sync, as opposed to the licensing/heartbeat channel below) is still not implemented** — it's explicitly out of MVP scope; the `force_sync` remote command exists as a wired-up stub that just reports "not implemented yet" back to Ona.

**Full field-level history via `django-simple-history`:** `BaseModel.history` puts `HistoricalRecords(inherit=True)` on the abstract base, so every concrete subclass automatically gets its own `Historical<Model>` table (full snapshot per save, not a diff) with zero per-model boilerplate — `inherit=True` is required here or simple_history silently skips subclasses (it warns if you forget it). `request.user` is attached to each historical row via `simple_history.middleware.HistoryRequestMiddleware` in `MIDDLEWARE` (must sit after `AuthenticationMiddleware`). Every registered `ModelAdmin` in `core/admin.py` and `licensing/admin.py` uses `simple_history.admin.SimpleHistoryAdmin` instead of plain `admin.ModelAdmin`, which adds a "History" button/view — don't confuse this with Django's own built-in per-object admin "History" link (visible on `cloud_server` too, since that's core Django, not this package): the built-in one only logs admin-UI edits as a text message, this one captures every DB-level change (API, Celery task, or admin) with the full field state at each version, plus a `diff_against()` helper. Not wired up on `cloud_server` — this is `local_server`-only by design (the "Bola" is where day-to-day operational history matters most).

Local domain models: `User` (custom, `AUTH_USER_MODEL = 'core.User'`, phone number as username validated by a `+998xxxxxxxxx`-style regex, `role` in `manager`/`cashier`/`waiter`), `Table`, `Category` (has `image`), `Product` (has `barcode`, `db_index=True`, and `image`), `Order`, `OrderItem`, `Payment`. `OrderViewSet` has custom `close`, `add_item`, `add_payment`, and `set_discount` actions — don't bypass these by writing `OrderItem`/`Payment` rows or `Order.discount_amount` directly from client code:

**Media uploads (`Category.image`/`Product.image`):** `MEDIA_ROOT = BASE_DIR / 'media'`, served at `/media/<path>` via `django.views.static.serve` wired directly into `config/urls.py` — deliberately *not* gated behind `if settings.DEBUG` (unlike Django's usual `static()` helper, which no-ops when `DEBUG=False`), because there's no nginx/whitenoise in front of either compose stack; daphne/runserver serves media itself at any scale this app runs at. `MEDIA_ROOT` matches the `media_data:/app/media` volume already declared in `docker-compose.prod.yml` (no compose change needed to pick this up); dev needs no dedicated volume either since the whole tree is already bind-mounted (`.:/app`) and `media/` is gitignored.
- `add_item` recomputes `Order.total_amount` server-side from `Product.price` (never trusts a client-supplied price).
- `add_payment` (any authenticated staff — cashier/waiter/manager) supports **split payments**: an `Order` can have multiple `Payment` rows (`method` = cash/card/other). Rejects amounts that would push total payments above `Order.final_amount` (`total_amount - discount_amount`, floored at 0), and rejects any payment on an already `completed`/`cancelled` order. Wrapped in `transaction.atomic()` + `select_for_update()` since multiple cashier terminals could post to the same order concurrently.
- `close` now **requires full payment** (`Order.balance_due == 0`) before it will flip `status` to `completed` — this is a behavior change from the original bare status-flip.
- `set_discount` is gated to manager/admin only (`IsManagerOrAdmin`, via a `get_permissions()` override scoped to that one action) and mirrors `ProductViewSet.perform_update`'s existing "notify admins of a financially-sensitive change" pattern (`Notification` + `broadcast_event('discount_applied', ...)`, only when the amount actually changed and the actor isn't `is_staff`).
- `Order.final_amount` / `amount_paid` / `balance_due` are computed properties (not DB columns) — `amount_paid` always does a fresh `Sum` aggregate over `Order.payments`, deliberately not a cached/prefetched read, for the same concurrent-terminal reason above.

### Staff PIN + device auth and real-time events (`local_server/core/`)
There are two independent ways to obtain a DRF `Token`: an admin (`is_staff=True`) logs in with phone + password via the normal `POST /api/auth/login/`; every other role (manager/cashier/waiter) is bound to exactly one **device** and unlocks it daily with a 6-digit PIN, never phone+password. This is why `User` carries a separate `pin_hash` field instead of reusing `password` — a leaked PIN would otherwise be replayable through the ordinary login endpoint with no device check at all.

- **Onboarding:** an admin generates a one-time code (`services.generate_registration_code`, 15 min TTL, `DeviceRegistrationCode`); the staff member redeems it via `POST /api/auth/device/register/` (`DeviceRegisterView`, unauthenticated) with a `device_id` + a PIN they choose (`services.redeem_registration_code`) — this creates the `StaffDevice` row, sets `pin_hash`, and returns a token immediately (no separate login step). Daily use is `POST /api/auth/pin-login/` (`PinLoginView`, unauthenticated) with just `device_id` + PIN (`services.verify_pin_login`).
- **One active device per user**, enforced by a partial unique DB constraint on `StaffDevice` (`is_active=True`), not just application logic — registering a new device silently evicts the old one (`services._evict_active_device`, called by both `user` and `device_id` since a `device_id` could already belong to someone else).
- **Revocation** (`StaffDeviceViewSet.revoke`, `IsAdminStaff`-only) is soft (`is_active=False`, history preserved via `django-simple-history`) but has real effect immediately: it deletes the user's `Token` (blocks future HTTP requests) **and** calls `realtime.force_disconnect(user_id)` to close any already-open WebSocket connection — token deletion alone wouldn't touch a connection that's already established.
- PIN attempts are rate-limited per `device_id` in Redis (5 wrong attempts → 429 for 5 minutes), independent of any Django-level auth throttling.

**Real-time WebSocket events** (`core/consumers.py`, `core/routing.py`, `core/realtime.py`, `core/middleware_ws.py`, wired in `config/asgi.py`): a single reusable channel at `ws/events/`, authenticated via `?token=<DRF token>` query param (`TokenAuthMiddleware` — Channels' built-in `AuthMiddlewareStack` only understands Django sessions, so this reimplements the same DRF `Token` lookup rather than adding a second auth system). Every connection joins the shared `restaurant` broadcast group plus a per-user `user_<id>` group; a blocked license closes the connection at `connect()` time (code `4402`). Any view/service pushes a message with `realtime.broadcast_event(event_type, payload)` — adding a new event type never touches the consumer, just a new call site (already used for `price_changed`, `table_status_changed`, `order_updated`, `discount_applied`). Payloads are deliberately thin "re-fetch" signals (e.g. `{"table_id": N}`), not full state, since the right view of that state is often relative to the requesting client. `force_disconnect` targets the per-user group only and is currently used solely by device revocation above.

### Licensing & kill-switch (`local_server/licensing/`, `cloud_server/tenants/` + `cloud_server/sync/`)

**JWT signing is asymmetric (RS256):** Ona holds `LICENSE_PRIVATE_KEY` and is the only thing that can mint tokens (`cloud_server/sync/jwt_utils.py::issue_license_token`). Bola holds only `LICENSE_PUBLIC_KEY` and verifies tokens fully offline (`local_server/licensing/jwt_utils.py::verify_token`), which is what lets the kill-switch work for days without internet.

**Bola's state is a DB singleton**, not a file: `licensing.models.LicenseState` (pk forced to 1). It survives container recreation via the Postgres volume and is shared by the `web`/`celery_worker`/`celery_beat` containers. Every `.save()` invalidates the Redis-cached verdict key (`license:verify`) so blocks/unblocks take effect on the next request rather than waiting out the cache TTL.

**Activation flow:** `POST /api/license/activate/` (Bola, unauthenticated) → `OnaClient.activate()` → `POST /api/sync/activate/` (Ona, unauthenticated, license key in body). Ona binds the posted `hardware_hash` to the `License` row on *first* activation and rejects any different hash afterward (`"Qurilma mos kelmadi."`) — re-activating on new hardware requires an admin to run the `reset_hardware_hash` action on `LicenseAdmin` first (disaster-recovery path from docs/4).

**License key format:** `tenants.models.generate_license_key()` produces a human-typeable `XXXX-XXXX-XXXX` key (12 chars from the same confusion-free alphabet as `local_server/core/services.py::CODE_ALPHABET` — no `0`/`O`/`1`/`I`), built for a mobile "type it or scan a QR" activation screen — not the old `secrets.token_hex(20)` 40-char format (pre-existing `License` rows keep whatever they were originally issued, both formats coexist fine since it's just a default, not a validated pattern). Two related case-sensitivity fixes ship with this: `ActivationView.post()` (`cloud_server/sync/views.py`) looks the key up with `key__iexact`, and its response echoes back the *canonical* DB-cased key (`license_key`) — `local_server/licensing/views.py::ActivateView` stores *that* into `LicenseState.license_key`, not the user-typed string, because that same value is reused verbatim as the `Authorization: Token <key>` credential on every subsequent renew/heartbeat/error-log call, and `LicenseAuthentication`'s lookup there is intentionally still case-sensitive (exact `key=`) — normalizing case only at activation and not at every later authenticated call would activate fine and then silently break the very next heartbeat. `LicenseAdmin.qr_code` (`cloud_server/tenants/admin.py`) renders the key as a PNG QR code (`qrcode` + `Pillow`, embedded as a `data:` URI — no extra view/URL, and no new unauthenticated surface since it only ever renders inside the already-staff-gated admin page) plus a "QR kodni yuklab olish" download link using that same data URI, so an operator onboarding a restaurant can save/share the image (e.g. via Telegram) for the admin's phone to scan instead of typing the key. PNG rather than SVG deliberately — most chat apps render/preview PNG inline but not SVG.

**Hardware fingerprinting** (`local_server/licensing/hardware.py::get_hardware_fingerprint`) tries, in order: `HARDWARE_ID_OVERRIDE` env (dev/test only) → `/sys/class/dmi/id/product_uuid` → `/etc/machine-id` → a real burned-in MAC via `uuid.getnode()`. **Important:** the MAC fallback explicitly rejects both the multicast bit *and* the locally-administered bit (`first_octet & 0x02`) — Docker's default bridge network hands out `02:xx:xx:xx:xx:xx` MACs that silently change on every container recreate, which would otherwise re-brick the license on every restart/update. This was caught by live-testing, not by inspection — if you touch this function, re-verify by recreating the container and confirming `/api/license/status/` still reports `activated: true` afterward. Docker Desktop containers typically have *neither* `product_uuid` nor `machine-id` available, so local dev **requires** `HARDWARE_ID_OVERRIDE` set to a stable string in `docker-compose.yml` (already done: `dev-local-machine`).

**Kill-switch middleware** (`local_server/licensing/middleware.py::LicenseEnforcementMiddleware`, registered in `MIDDLEWARE` before `CsrfViewMiddleware`): gates every `/api/` request except `/api/license/*` (activation/status must stay reachable) and `/admin/` (a manager needs to see state and re-activate). Blocked → `402 {"detail": "Tizim bloklandi. To'lovni amalga oshiring."}`. Controlled by `LICENSE_ENFORCEMENT` (`0` in dev compose, should be `1` in prod). Verdict is cached in Redis: 60s when OK, only 10s when blocked (so unblocks propagate fast). On a DB error (e.g. mid-migration) it fails open under `DEBUG`, fails closed otherwise.

**Heartbeat & lenient auth** (`cloud_server/sync/authentication.py::HeartbeatAuthentication`, a subclass of `LicenseAuthentication` that skips the `is_active`/`expires_at` checks): the heartbeat/command-result endpoints deliberately accept a *dead* license — otherwise a deactivated restaurant would go dark instead of receiving the "you're blocked" signal. Only `activate`/`renew` use the strict `LicenseAuthentication` (never issues tokens for a dead license). Bola's `licensing.tasks.send_heartbeat` (Celery beat, every 60s, `expires=50`) posts `licensing.metrics.collect_metrics()` (psutil CPU/RAM/disk + `APP_VERSION` + unsynced order count) and reads back `license_active` (self-block/unblock) and any queued `commands`.

**Remote commands** (`tenants.models.RemoteCommand`, Ona-side queue): since Bolas sit behind NAT, commands are never pushed — they piggyback on the heartbeat *response* (`pending` → `sent`, capped at 10 per beat) and Bola reports outcomes to `POST /api/sync/commands/<uuid>/result/`. Dispatch table lives in `local_server/licensing/tasks.py::COMMAND_HANDLERS` (`block_system`, `unblock_system`, `force_license_renew`, `force_sync` stub, `restart_services` — deliberately refuses, no docker.sock access). `update_app` is special-cased outside that table: it must report its "started" result *before* calling Watchtower, because Watchtower recreates the very `celery_worker` container running the task; actual rollout success is confirmed on Ona by the next heartbeat's `app_version`, not by the command result.

**Update rollout** (Phase 5, prod-only): `local_server/docker-compose.prod.yml` runs a `watchtower` container in HTTP-API mode (`WATCHTOWER_HTTP_API_UPDATE`, token-protected, no polling) scoped to the `web`/`celery_worker`/`celery_beat` services via `com.centurylinklabs.watchtower.enable=true` labels (so `db`/`redis`/`db_backup` are never touched). Images come from `${POS_IMAGE:-ghcr.io/ORG/pos-local}:${RELEASE_CHANNEL:-stable}` — Watchtower re-pulls whatever tag a container already runs, so all restaurants on the same `RELEASE_CHANNEL` update together; per-restaurant pinning would need a distinct channel tag per machine (already parameterized, just unset today). `entrypoint.sh` runs `migrate --noinput` only when `RUN_MIGRATIONS=1` (set on `web` only, so three containers don't race migrations after Watchtower recreates them).

**Error log reporting** (`local_server/licensing/`, `cloud_server/sync/` + `cloud_server/tenants/`): a one-way, batched Bola → Ona channel, deliberately independent of the heartbeat request/response cycle — a malformed error payload must never affect the license-check/remote-command-polling critical path. `local_server/licensing/log_handler.py::DatabaseErrorLogHandler` is wired into Django's `LOGGING` (`config/settings.py`) at `ERROR` level on both the `django` and `celery` loggers (the latter requires `CELERY_WORKER_HIJACK_ROOT_LOGGER = False`, or Celery silently strips the handler in the worker/beat containers), and writes every ERROR/CRITICAL log record to the local `licensing.ErrorLog` table (lazy-imports `.models` inside `emit()` to avoid `AppRegistryNotReady`, and guards against re-entrant recursion if the DB write itself logs an error). `licensing.tasks.send_error_logs` (Celery beat, every 120s) batches unreported rows to `POST /api/sync/error-logs/` (Ona, `HeartbeatAuthentication` — a blocked/dead-license restaurant must still be able to report errors); `licensing.tasks.cleanup_error_logs` (daily) bounds local disk usage via `ERROR_LOG_RETENTION_DAYS` (reported rows) and `ERROR_LOG_MAX_UNREPORTED` (oldest-first eviction if Ona is unreachable for a long time). On Ona, `tenants.models.ErrorLog` uses the Bola-generated UUID as its own PK so retried batches are naturally deduped via `bulk_create(ignore_conflicts=True)`; `tenants/admin.py::ErrorLogAdmin` shows level/resolved badges and `mark_resolved`/`mark_unresolved` actions, and `RestaurantAdmin` surfaces an unresolved-error-count badge per restaurant. Admin-panel-only by design (no Telegram/email push yet — see Implementation status below).

### Cloud tenancy (`cloud_server/tenants/models.py`)
`Restaurant`, `License` (one-to-one), `RestaurantStatus` (one-to-one, latest heartbeat metrics — overwritten, not historized), `RemoteCommand` (FK, queue with `pending`/`sent`/`acknowledged`/`completed`/`failed` lifecycle), `ErrorLog` (FK, received via the error-reporting channel above). `RestaurantAdmin` shows a green/red Onlayn/Oflayn badge (`is_online`, flipped by `tenants.tasks.mark_offline_restaurants`, a Celery-beat task every 60s that marks anything silent for 3+ minutes offline) and has bulk actions to enqueue `block_system`/`unblock_system`/`force_license_renew`/`update_app` commands from the restaurant list.

`License` is never created by hand in the admin — `tenants/signals.py::create_default_license` (`post_save` on `Restaurant`, `created=True` only) auto-creates one with a short default `expires_at` (end of the current month + 2 days' grace, `compute_default_license_expiry()`), so onboarding a restaurant means creating the `Restaurant` row and immediately having an activatable key; an operator only touches `LicenseAdmin` again to extend `expires_at` if payment doesn't follow.

### Auth quirks
- `local_server/core/middleware.py` — `SwaggerTokenPrefixMiddleware` auto-prepends `"Token "` to `Authorization` headers that are exactly 40 chars with no space, purely to make testing via Swagger UI easier.
- `local_server` uses standard DRF `TokenAuthentication` for its own POS users (see Staff PIN + device auth above for the two different ways that token gets issued); `cloud_server`'s `sync` app uses `LicenseAuthentication`/`HeartbeatAuthentication` (keyword is also literally `'Token'`, not `'License'`, despite the class name) — don't conflate the two token systems when adding endpoints.
- Neither `LicenseAuthentication` nor `HeartbeatAuthentication` override `authenticate_header()`, so DRF coerces auth failures from 401 to 403 (see `get_authenticate_header` in DRF's `APIView.handle_exception`). Tests assert 403, not 401, for these endpoints — this is existing, intentional-by-omission behavior, not a bug to "fix" reflexively.

### Admin
Both projects use `django-jazzmin` (dark theme) as the admin skin, configured in each `config/settings.py` under `JAZZMIN_SETTINGS`/`JAZZMIN_UI_TWEAKS`.

## Implementation status vs. docs

- ✅ Full licensing/control-plane loop: activation, RS256 JWT issuance + offline verification, daily auto-renewal, kill-switch middleware, heartbeat with real psutil metrics, online/offline tracking, remote command queue (block/unblock/force-renew/update-app/restart-refused), Watchtower-based rollout (prod compose only, not live-tested against a real registry in this environment).
- ✅ Bola → Ona error log reporting (admin-panel visibility only, no push alerting), full field-level history (`django-simple-history`) on every `local_server` model, and split-payment + manager-gated discount tracking on `Order` (see Architecture sections above) — all added in the same session, not yet reflected anywhere under `docs/`.
- ✅ Staff mobile-app auth foundation: PIN + device-bound login (registration codes, one-active-device enforcement, admin revoke with immediate WS disconnect) and a Channels/WebSocket real-time event channel (`ws/events/`) for POS state pushes — see Staff PIN + device auth section above. Backs the Flutter admin/manager-cashier/waiter apps; also undocumented anywhere under `docs/`.
- ❌ Not yet built: actual POS data sync (upstream order push / downstream menu push via `is_synced` sweep — `force_sync` is a stub), `MenuUpdateLog`, Cython/PyArmor code obfuscation, Telegram/email alerting on error reports or otherwise (admin-panel-only by design choice), `restart_services` remote command (needs docker.sock, deliberately not wired up), payment/order reporting & analytics UI (the payment-tracking foundation exists, the reports themselves don't yet).
- Test suites exist and pass: `cloud_server` → `manage.py test sync tenants`; `local_server` → `manage.py test core licensing`.

## Repo state

This is a git repository with a GitHub remote (`origin`, `main` is the default branch). There is also an unrelated **orphan** `api-docs` branch (no shared history with `main`) holding only hand-written Markdown API reference for the Flutter staff mobile apps — see its own `README.md` for the update convention (it's periodically rewritten wholesale rather than accumulating long history). **Any change to a `local_server` API endpoint must be reflected there too** (mobile-facing endpoints only — internal Bola↔Ona sync endpoints don't belong on that branch); edit it via an isolated `git worktree add <path> api-docs`, never `git checkout` directly, since `main` commonly has unrelated work in progress.
