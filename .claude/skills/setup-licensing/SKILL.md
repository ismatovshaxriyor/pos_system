---
name: setup-licensing
description: First-time RSA licensing keypair setup for the pos_system repo (cloud_server + local_server), needed before license activation/kill-switch will work. Use when onboarding a fresh dev environment, a new deployment, or when licensing endpoints fail because no key is configured.
---

### First-time licensing setup (both servers, needed before activation/kill-switch will work)
```bash
cd cloud_server && docker compose exec web python manage.py generate_signing_keys
# paste the PRIVATE KEY block into cloud_server/keys/license_private.pem
# paste the PUBLIC KEY block into BOTH cloud_server/keys/license_public.pem AND local_server/keys/license_public.pem
# restart both stacks so the key volume mounts are picked up: docker compose restart web celery_worker celery_beat
```
`LICENSE_PRIVATE_KEY_FILE`/`LICENSE_PUBLIC_KEY_FILE` point at `/app/keys/...pem` inside the containers by default (see each `docker-compose.yml`'s `./keys:/app/keys:ro` mount). A missing key file is tolerated at boot (server still starts; licensing endpoints just fail until the key is provided) — see `_load_pem()` in each `config/settings.py`.
