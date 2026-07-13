---
name: fix-legacy-migration-state
description: Fix a prod DB (cloud_server or local_server) that was provisioned before the committed-migrations strategy and now fails with DuplicateColumn / crash-loops on deploy (502 behind cloudflared). One-time-per-environment runbook, not needed for routine migration work.
---

**One-time transition for any DB provisioned under the old scheme** (this took the cloud prod down with a 502 on 2026-07-11 — the first committed-migrations deploy): such a DB has the *full* old schema but its `django_migrations` records only the container-generated `0001_initial`, so `migrate` tries to re-apply `0002+` onto columns that already exist (`DuplicateColumn` → entrypoint dies under `set -e` → the app port never opens → 502 behind cloudflared, while the deploy workflow still reports success because `up -d` is detached). Fix, once per environment, by faking history up to the migration matching the actual schema, then letting the real remainder apply:
```bash
docker compose -f docker-compose.prod.yml run --rm -e RUN_MIGRATIONS=0 web python manage.py migrate <app> <last-migration-already-in-schema> --fake   # RUN_MIGRATIONS=0 or the entrypoint dies before your command runs
docker compose -f docker-compose.prod.yml up -d
```
(For the 2026-07-11 cloud incident that was `migrate tenants 0005 --fake` — schema equalled `0005`, only `0006_syncedorder_*` was genuinely new.) The same one-time step will be needed on each restaurant's Bola DB the first time a committed-migrations build reaches it via Watchtower. Django's own `auth`/`admin`/`authtoken` migrations ship in pip packages and were never affected.
