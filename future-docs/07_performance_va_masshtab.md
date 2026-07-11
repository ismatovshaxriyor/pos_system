# 07. Performance va masshtablash

**Muhim kontekst:** ikki xil masshtab bor va ular bir-biridan tubdan farq qiladi:
- **Bola (local_server)** — bitta restoran, oʻnlab qurilma, past resurs (Mini PC). Bu yerda "masshtab" = pik soatdagi latency, RAM/CPU tejash.
- **Ona (cloud_server)** — **barcha** restoranlar unga yoziladi. Bu yerda "masshtab" = restoranlar soni × yozuv chastotasi. Bu asosiy xavf.

---

## 🟡 1. Ona heartbeat yozuv yuki chiziqli oshadi

**Dalil:** `cloud_server/sync/views.py:164-197` — har heartbeat (har restorandan **har 60 soniyada**) quyidagini qiladi:
- `RestaurantStatus.update_or_create` (SELECT + UPDATE).
- `restaurant.save(update_fields=['last_seen', 'is_online'])` (yana UPDATE).
- `RemoteCommand` pending soʻrovi (SELECT).

Yaʼni restoranga daqiqasiga ~3 yozuv/soʻrov. 100 restoran = ~5 yozuv/soniya doimiy; 1000 restoran = ~50/soniya, faqat heartbeat'dan. `docs/1` aslida `last_seen` ni **Redis'da** saqlashni tavsiya qilgan — bu amalga oshirilmagan, hozir har beat Postgres'ga yozadi.

**Taʼsir:** 🟡 MVP/oz restoranda muammo yoʻq. Yuzlab restoranda Postgres yozuv yuki va `RestaurantStatus`/`Restaurant` jadvallarida doimiy UPDATE (va autovacuum bosimi) sezilarli boʻladi.

**Tuzatish yoʻnalishi:**
- `last_seen` va joriy metrikalarni **Redis'ga** koʻchiring (docs/1 rejasi). Postgres'ga faqat davriy (masalan 5 daqiqada bir) yoki holat oʻzgarganda yozing.
- `is_online` ni Redis TTL bilan hisoblang (key mavjud = online), `mark_offline_restaurants` task oʻrniga.
- Heartbeat chastotasini kamaytirishni koʻrib chiqing (60s → 120s) yoki metrikalarni kamroq tez-tez yuboring.

---

## 🟡 2. Cloud tomonda retention yoʻq — jadvallar cheksiz oʻsadi

**Dalil:** `cloud_server/config/settings.py:186-191` — `CELERY_BEAT_SCHEDULE` da faqat `mark-offline-restaurants`. Tozalash taski yoʻq:
- `ErrorLog` (`tenants/models.py:137`) — har restorandan kelgan har xato abadiy saqlanadi.
- `RemoteCommand` — bajarilgan buyruqlar abadiy.
- Django admin `LogEntry` — oʻsadi.

(Eslatma: **Bola** tomonda retention **bor** — `cleanup_error_logs` (`licensing/tasks.py:154`). Faqat **Ona** tomonda yoʻq.)

**Taʼsir:** 🟡 Ona DB'si vaqt oʻtishi bilan shishadi, backup/query sekinlashadi. Koʻp restoran × koʻp xato = tez oʻsish.

**Tuzatish yoʻnalishi:** Ona'ga Celery Beat retention taski qoʻshing: hal qilingan (`is_resolved=True`) va N kundan eski `ErrorLog`'larni oʻchirish; `completed`/`failed` va eski `RemoteCommand`'larni arxivlash/oʻchirish.

---

## 🟡 3. Daphne bitta jarayon — Bola concurrency chegarasi

**Dalil:** `local_server/docker-compose.prod.yml:38` — `daphne -b 0.0.0.0 -p 8000` (bitta jarayon). `CLAUDE.md` buni oqlaydi: WebSocket uchun ASGI kerak, sinxron DRF view'lar `sync_to_async` thread-pool orqali parallel ishlaydi.

**Baholash:** 🟡 Bitta restoran koʻlamida (oʻnlab qurilma) **yetarli**. Lekin:
- Bitta daphne jarayoni — bitta CPU yadrosi bilan cheklangan (Python GIL). Thread-pool I/O uchun yordam beradi, CPU-bogʻliq ish uchun emas.
- Pik soatda koʻp bir vaqtli soʻrov + WebSocket — bitta jarayon bo'gʻiz boʻlishi mumkin.

**Tuzatish yoʻnalishi (agar kerak boʻlsa, oʻlchagach):**
- Bir nechta daphne jarayoni + oldida nginx (yoki `uvicorn --workers`). Lekin bu WebSocket uchun sticky yoki Redis channel layer (allaqachon bor) talab qiladi.
- Yoki gunicorn+uvicorn worker'lar. Avval **profiling** — hozir muammo yoʻq boʻlishi mumkin, erta optimallashtirmang.

---

## 🟢 4. Indekslar — asosan yaxshi, bir nechta bo'shliq

**Yaxshi:** `Payment` (`order, created_at`), `RemoteCommand` (`restaurant, status`), `ErrorLog` (`is_reported, occurred_at`), `Product.barcode`, `sync_uuid` — hammasi indekslangan.

**Koʻrib chiqilsin:**
- `Order` da indeks yoʻq. Sotuv hisoboti kelganda `Order(status, created_at)` va `Order(waiter)` boʻyicha filtr tez-tez boʻladi — `docs/3` aynan `status`, `created_at` ni tavsiya qiladi. Kelajakdagi hisobot uchun `models.Index(fields=['status', 'created_at'])` qoʻshing.
- `is_synced` boʻyicha sweep (sync qurilganda) — `Order(is_synced)` yoki qisman indeks kerak boʻladi.

---

## 🟢 5. Media/rasm optimizatsiyasi (docs/3 vaʼdasi)

**Dalil:** `docs/3` rasmlarni yuklashda WebP'ga oʻtkazish + 500KB gacha siqishni tavsiya qiladi. Kodda **yoʻq** — `Category.image`/`Product.image` xom `ImageField`, siqish yoʻq. Media'ni daphne oʻzi xizmat qiladi (`config/urls.py:47`), nginx yoʻq.

**Taʼsir:** 🟢 Katta rasmlar lokal tarmoqni va (kelajakda) sync'ni sekinlashtiradi; daphne rasm uzatish bilan band boʻladi.

**Tuzatish yoʻnalishi:** yuklashda `Pillow` bilan resize+WebP (upload signal yoki serializer'da). `Pillow` allaqachon requirements'da. Kelajakda katta koʻlamda — media uchun alohida statik server/CDN.

---

## 🟢 6. `CONN_MAX_AGE=600` — yaxshi, lekin pooling emas

**Dalil:** ikkala settings'da `CONN_MAX_AGE: 600` (docs/3 tavsiyasi bajarilgan ✅). Bu persistent ulanish beradi, lekin **connection pool** emas — koʻp worker/jarayon boʻlsa har biri oʻz ulanishini ushlaydi.

**Baholash:** 🟢 MVP uchun yetarli. Ona koʻp worker bilan masshtablansa — `PgBouncer` yoki `django-db-connection-pool` (docs/3 aytgan) koʻrib chiqiladi.

---

## Xulosa: hozir nima qilish kerak

Performance topilmalarining koʻpi **hali muammo emas** — erta optimallashtirmang. Ammo ikkitasi **arxitekturaviy** va erta hal qilinsa arzon:
1. **Ona retention** (#2) — hozir qoʻshish oson, keyin katta jadvalni tozalash qiyin.
2. **Ona `last_seen` Redis'ga** (#1) — sync/analitika qurishdan oldin hal qilinsa, yozuv yuki boshdan toʻgʻri boʻladi.

Qolganlari — **oʻlchab, keyin** (profiling → optimizatsiya), taxmin bilan emas.

Keyingi: **[08_mobil_api_va_realtime.md](08_mobil_api_va_realtime.md)**.
