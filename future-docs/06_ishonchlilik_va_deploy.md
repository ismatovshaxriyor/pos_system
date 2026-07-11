# 06. Ishonchlilik, deploy va monitoring

## 🟠 1. `main`'ga har push → cloud prod'ga avtomatik deploy, tasdiqsiz

**Dalil:** `.github/workflows/deploy-cloud-server.yml` — `cloud_server/**` ni tegadigan har push SSH orqali EC2'ga kiradi, `git reset --hard origin/main` qiladi va `docker compose -f docker-compose.prod.yml up -d --build`.

**Taʼsir:** 🟠
- Qoʻlda tasdiq (approval) bosqichi yoʻq — xato commit toʻgʻridan-toʻgʻri barcha restoranlar boshqaruv serveriga chiqadi.
- [03](03_migratsiya_strategiyasi.md) dagi migratsiya xavfi bilan birga — sxema oʻzgargan commit prod DB'ni buzishi mumkin, avtomatik.
- Deploy oldidan **DB backup yoʻq** (cloud prod compose'da `db_backup` xizmati umuman yoʻq — faqat local'da bor).
- `git reset --hard` — EC2'da qoʻlda qilingan har qanday oʻzgarishni jimgina yoʻqotadi.

**Tuzatish yoʻnalishi:**
- Deploy'dan oldin avtomatik `pg_dump` (workflow qadamida yoki entrypoint'da) va nusxani xavfsiz joyga.
- Migratsiyalarni commit qilgach ([03](03_migratsiya_strategiyasi.md)), deploy'ga `migrate --plan` ni koʻrsatuvchi va destruktiv operatsiyada toʻxtaydigan tekshiruv qoʻshing.
- Prod uchun GitHub Environments + required reviewers (qoʻlda tasdiq) qoʻying, kamida migratsiyali deploy'lar uchun.
- `up -d --build` oʻrniga oldindan qurilgan image (CI'da build → registry → prod faqat pull) — build EC2'da sekin va resurs yeydi.

---

## 🟠 2. Cloud prod'da DB backup umuman yoʻq

**Dalil:** `cloud_server/docker-compose.prod.yml` — `db_backup` xizmati yoʻq (`local_server` da bor: `prodrigestivill/postgres-backup-local`).

**Taʼsir:** 🟠 Ona serveri **barcha restoranlarning** litsenziya, hardware binding, restoran, admin hisoblarini saqlaydi. Uning DB'si backup'siz. EC2 volume yoʻqolsa/buzilsa — butun biznes maʼlumoti yoʻqoladi, va restoranlar qayta faollashtira olmaydi.

**Tuzatish yoʻnalishi:** cloud prod'ga ham `db_backup` qoʻshing, va nusxalarni **EC2'dan tashqariga** (S3 yoki boshqa region) yuboring. `BACKUP_KEEP_DAYS` ni oshiring. Tiklashni **sinab koʻring** (backup faqat tiklab boʻlgani tasdiqlangandan keyin backup hisoblanadi).

---

## 🟠 3. Watchtower rollout xavfsizligi — barcha restoran birga yangilanadi

**Dalil:** `local_server/docker-compose.prod.yml` — image `${POS_IMAGE}:${RELEASE_CHANNEL:-stable}`. `CLAUDE.md`: Watchtower bir xil `RELEASE_CHANNEL` dagi barcha restoranni **birga** yangilaydi.

**Taʼsir:** 🟠 Buzuq relplatform barcha restoranlarni bir vaqtda ishdan chiqaradi — canary/bosqichma-bosqich rollout yoʻq. Migratsiya xatosi (03) bilan birga — bitta yomon image butun tarmoqni oʻchiradi.

**Tuzatish yoʻnalishi:**
- **Canary channel**: bir nechta restoranni `RELEASE_CHANNEL=canary` ga qoʻying, yangi image avval shularga, 24-48 soat kuzatib, keyin `stable` ga.
- Watchtower `update_app` remote command allaqachon bor (`licensing/tasks.py`) — buni ishlatib **Ona'dan boshqariladigan** bosqichma-bosqich rollout qiling (bir necha restoranga buyruq, kuzat, keyin qolganlariga), avtomatik "hamma birga" oʻrniga.
- Rollback rejasi: yomon versiya chiqsa, `desired_version` ni eski tag'ga qaytarish yoʻli.

---

## 🟡 4. Health-check va konteyner qatlanganligi (docs/2 vaʼdasi bajarilmagan)

**Dalil:**
- Hech qaysi compose xizmatida `healthcheck:` yoʻq. `depends_on` faqat ishga tushish tartibini beradi, tayyorlikni emas — `web` DB tayyor boʻlmasidan ishga tushib xato berishi mumkin.
- `docs/2` "Read-Only Containers" (`read_only: true`) va Docker ichki `networks` izolyatsiyasini tavsiya qiladi — ikkalasi ham compose'da **yoʻq**.
- Prod compose'da db/redis port ochilmagan (yaxshi ✅), lekin alohida internal `networks` yoʻq — default bridge'da hammasi bir tarmoqda.

**Taʼsir:** 🟡 Ishga tushish poygalari, konteyner buzilsa toʻxtamay xato berishi, docs'da vaʼda qilingan qatlangan himoya yoʻqligi.

**Tuzatish yoʻnalishi:**
- `db`/`redis`/`web` ga `healthcheck` qoʻshing; `depends_on: condition: service_healthy`.
- `read_only: true` + kerakli `tmpfs`/volume'lar (docs/2). Django konteyneri fayl yozmasligi kerak (media volume alohida).
- Ichki `networks` — db/redis faqat backend tarmoqda, faqat web ularga kira oladi.

---

## 🟡 5. `restart_services` va docker.sock — toʻgʻri qaror, hujjatlang

**Dalil:** `licensing/tasks.py:211-212` — `_handle_restart_services` ataylab rad etadi (docker.sock berilmagan). ✅ Yaxshi xavfsizlik qarori — Bola konteyneriga docker.sock berish = host'ni toʻliq egallash imkoni.

**Baholash:** 🟢 Toʻgʻri. Faqat Watchtower'ga docker.sock berilgan (`docker-compose.prod.yml:97`), va u alohida konteyner. Buni shunday saqlang; agar kelajakda "restart" kerak boʻlsa, uni Watchtower'ga oʻxshab **alohida, minimal huquqli** yordamchi orqali qiling, asosiy app konteyneriga sock bermang.

---

## 🟡 6. Observability yoʻq — nima boʻlayotganini koʻrish qiyin

**Hozir:** loglar konsolga + (local'da) `ErrorLog` jadvaliga. Metrikalar heartbeat orqali RestaurantStatus'ga. Lekin:
- Markazlashgan log agregatsiyasi yoʻq (har restoran konteyner logi lokal).
- Alerting yoʻq — `docs/1` "Telegram/Email notification" vaʼda qiladi, `CLAUDE.md` uni "admin-panel-only by design" deb belgilaydi. Yaʼni **hech kim faol xabardor qilinmaydi** — kimdir admin panelga qarashi kerak.
- Ona offline restoran / kritik xato / muddati tugagan litsenziyada **push** yubormaydi.

**Tuzatish yoʻnalishi:**
- Alerting (Telegram bot eng oson, Oʻzbekiston kontekstida tabiiy): (a) restoran 3+ daqiqa offline, (b) yangi CRITICAL error, (c) litsenziya muddati N kun ichida. `mark_offline_restaurants` task allaqachon bor — unga alert qoʻshish oson.
- Sentry (yoki oʻxshash) prod xatolar uchun — `ErrorLog` yaxshi, lekin Sentry stack-trace guruhlashi va real-time alerting beradi.

---

## Deploy checklist (hozirgi holat uchun, qisqa)

Migratsiyalar tuzatilgunicha, har cloud deploy oldidan **qoʻlda**:
1. `pg_dump` bilan cloud DB backup.
2. `docker compose exec web python manage.py migrate --plan` — nima qoʻllanishini koʻring.
3. Destruktiv operatsiya (RemoveField/DropTable) boʻlsa — **toʻxtang**, qoʻlda koʻrib chiqing.
4. Deploy.
5. `migrate` chindan ishlaganini va app javob berayotganini tekshiring.

Keyingi: **[07_performance_va_masshtab.md](07_performance_va_masshtab.md)**.
