# 08. Mobil API va real-time

Kontekst: uchta Flutter ilova (admin, menejer-kassir, ofitsiant) `local_server` API'si ustiga qurilmoqda. API hujjatlari alohida `api-docs` orphan branch'da.

---

## 🟠 1. `api-docs` branch sinxronligi — jarayon, kod emas

**Dalil:** `CLAUDE.md` va loyiha xotirasi: har `local_server` endpoint oʻzgarishi `api-docs` branch'dagi `.md` fayllarni ham yangilashi shart. Bu **qoʻlda** jarayon.

**Xavf:** 🟠 Qoʻlda jarayon unutiladi. API va hujjat farq qilsa, mobil jamoa eskirgan shartnomaga qarab ishlaydi → integratsiya xatolari.

**Tuzatish yoʻnalishi:**
- OpenAPI sxema allaqachon avtomatik (`drf-spectacular`, `/api/schema/`). Mobil jamoa uchun **qoʻlda `.md` oʻrniga** avtomatik generatsiya qilingan sxemani manba qiling.
- CI'da tekshiruv: `/api/schema/` snapshot oʻzgarsa, PR'da eslatma. Yoki sxemadan mijoz kodini generatsiya qilish (`openapi-generator` → Dart/Flutter client).
- Agar qoʻlda `.md` qolsa — endpoint oʻzgartiruvchi har PR'da checklist punkti.

---

## 🟡 2. WebSocket reconnect / auth muddati

**Dalil:** `core/consumers.py`, `core/middleware_ws.py` — ulanish `?token=<DRF token>` bilan. Bloklangan litsenziya `connect()` da yopadi (`4402`). Revoke — `force_disconnect` (`4403`).

**Yetishmayotgan (mobil uchun muhim):**
- **Reconnect siyosati** — mobil tarmoq beqaror (WiFi↔4G, uyqu rejimi). Ilova uzilganda qanday qayta ulanadi, qancha kutadi (backoff), qayta ulangach yoʻqolgan event'larni qanday qoplaydi? Payload'lar "re-fetch signali" (`realtime.py` izohi) bo'lgani yaxshi — reconnect'da toʻliq re-fetch qilinadi, lekin buni ilova tomonda aniq belgilang.
- **Token muddati / almashinuvi** — DRF token muddatsiz (revoke'gacha yashaydi), shuning uchun WS auth muddati muammosi kam. Lekin revoke boʻlsa WS yopiladi (`4403`) — ilova buni "qayta login" signali sifatida qayta ishlashi kerak, cheksiz reconnect emas.
- **Close-code semantikasi hujjatlansin**: `4001` (auth yoʻq), `4402` (litsenziya bloklangan), `4403` (qurilma revoke). Ilova har birini boshqacha koʻrsatishi kerak (login sahifasi vs "toʻlov" sahifasi vs "qurilma chetlashtirildi").

---

## 🟡 3. Mobil uchun endpoint qulayliklari yetishmaydi

Kod restoran POS'i uchun toʻgʻri strukturaga ega, lekin mobil ish oqimini yumshatadigan bir nechta narsa foydali:

- **Bootstrap/sync endpoint** — ilova ochilganda bitta soʻrovda menyu + stollar + joriy foydalanuvchi + ochiq buyurtmalar. Hozir alohida-alohida soʻrov (`/products/`, `/tables/`, `/orders/`, `/auth/me/`). Bitta `GET /api/bootstrap/` mobil ishga tushishni tezlashtiradi.
- **Pagination** — `Order`/`Product` roʻyxatlari oʻsadi, hozir DRF default pagination sozlanmagan (`REST_FRAMEWORK` da `DEFAULT_PAGINATION_CLASS` yoʻq) → butun jadval bitta javobda. Menyu kichik boʻlsa mayli, lekin buyurtma tarixi uchun pagination shart.
- **Offline-first mobil** — Bola oʻzi offline ishlaydi, lekin **mobil ilova ham** WiFi'dan tushib qolishi mumkin (oshxonaga borgan ofitsiant). Ilova lokal navbat + qayta yuborish kerakmi? Bu mahsulot qarori — erta aniqlang, chunki API idempotentligiga taʼsir qiladi (masalan buyurtma yaratishda mijoz-tomon `sync_uuid` qabul qilib, dublikatni oldini olish).

---

## 🟡 4. Mobil uchun throttle va xato formati

- **Throttle** ([02](02_xavfsizlik_auditi.md) #1) — PIN login himoyalangan, lekin mobil koʻp soʻrov yuborsa (masalan reconnect bo'ronida) global throttle yoʻq. Mobil-do'st throttle qoʻying (foydalanuvchiga tushunarli 429 + Retry-After).
- **Izchil xato formati** — hozir baʼzi joyda `{"detail": "..."}`, baʼzi joyda DRF field-error (`{"amount": [...]}`). Mobil bitta izchil format kutadi. Xato formatini standartlashtiring (masalan har doim `{"detail": ..., "code": ..., "fields": {...}}`).
- **Til** — xato xabarlari oʻzbekcha (yaxshi, foydalanuvchiga koʻrsatish uchun). Lekin ilova til almashtirsa (rus/oʻzbek), matnni ilova tomonda tarjima qilish uchun `code` maydoni kerak, faqat matn emas.

---

## 🟢 5. Real-time infratuzilma — yaxshi poydevor

**Baholash:** 🟢 `broadcast_event` pattern (`core/realtime.py`) toza: yangi event turi qoʻshish consumer'ga tegmaydi. Payload'lar "yengil re-fetch signali" — toʻgʻri qaror (holat soʻrovchiga nisbiy). Bu poydevor ustiga oshxona displey (KDS), stol holati jonli yangilanishi, menejer dashboard'i oson quriladi.

**Kelajak uchun:**
- Event turlari koʻpaygach, ilova qaysi guruhga obuna boʻlishini tanlashi (masalan oshxona faqat `order_item` event'larini) — hozir hamma `restaurant` guruhiga tushadi. Selective subscription kelajakda foydali.
- WebSocket single-process daphne bilan cheklangan ([07](07_performance_va_masshtab.md) #3) — koʻp qurilma + tez-tez broadcast'da kuzating.

Keyingi: **[09_test_va_sifat.md](09_test_va_sifat.md)**.
