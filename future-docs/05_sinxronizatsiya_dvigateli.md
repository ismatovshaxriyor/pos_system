# 05. Sinxronizatsiya dvigateli — eng katta yetishmayotgan qism

## Holat: qurilmagan (ataylab, MVP dan tashqarida)

`docs/1_ona_bola_arxitekturasi.md` va `docs/4` ikki tomonlama maʼlumot sinxronizatsiyasini batafsil vaʼda qiladi, lekin kodda u **yoʻq**:
- `local_server/core/models.py:10-14` — `BaseModel` da `sync_uuid` + `is_synced` **bor**, lekin ularni "supurib" Ona'ga yuboradigan hech narsa yoʻq.
- `local_server/licensing/tasks.py:207-208` — `_handle_force_sync` faqat `"Sinxronizatsiya hali joriy qilinmagan (MVP)"` deb qaytaradigan **stub**.
- Cloud tomonda chek/menyu qabul qiladigan endpoint **yoʻq** (`cloud_server/sync/urls.py` da faqat activate/renew/heartbeat/command-result/error-logs).
- `MenuUpdateLog` — `docs/1` da nomlangan, hech qayerda mavjud emas.

Bu — poydevor tashlangan, lekin bino qurilmagan qism. Va u **eng muhim keyingi ish**, chunki ikkita katta vaʼda shunga bogʻliq:

1. **Markazlashgan analitika/hisobot** — Ona barcha restoran sotuvlarini koʻrishi kerak (billing model shu ustiga qurilishi mumkin).
2. **Disaster recovery** — `docs/4` "kompyuter kuyib ketsa, Ona maʼlumotni qaytaradi" deydi. Hozir Ona'da restoran maʼlumoti **yoʻq**, shuning uchun bu vaʼda **bajarilmaydi**. Yagona himoya — lokal `db_backup` (7 kunlik lokal nusxa, u ham kompyuter bilan birga yonadi).

---

## Dizayn: Bola → Ona (upstream, chek/sotuv yuborish)

Bu birinchi bosqich (docs/4 Faza 3). Eng oddiy, bir tomonlama.

### Nima yuboriladi
- `Order` (yopilgan/completed), `OrderItem`, `Payment` — sotuv faktlari. Faqat **oʻzgarmas** (immutable) yopilgan buyurtmalar (ochiq buyurtmalarni sinxronlashning maʼnosi kam).
- Ixtiyoriy: `Product`/`Category` (menyu holati snapshot) va `User` (xodimlar).

### Mexanizm (docs/1 ni real kodga aylantirilgan)
1. **Sweep task** (yangi `core/tasks.py` yoki `licensing/tasks.py` ga): Celery Beat har 1–5 daqiqada `is_synced=False` yopilgan buyurtmalarni yigʻadi.
2. **Batch + push**: JSON'ga oʻgirib, Ona'ning yangi `POST /api/sync/orders/` endpoint'iga yuboradi. Auth — mavjud `HeartbeatAuthentication` (litsenziya kaliti bilan; oʻlik litsenziya ham yuborishi kerakmi degan savolni hal qiling — ehtimol yoʻq, faqat faol).
3. **Idempotentlik**: `sync_uuid` PK sifatida ishlatiladi (xuddi `ErrorLog` da `event_uuid` PK — `cloud_server/tenants/models.py:149`). Ona `bulk_create(ignore_conflicts=True)` bilan qabul qiladi → retry dublikat yaratmaydi. **Bu pattern allaqachon error-log kanalida ishlaydi — aynan shuni takrorlang.**
4. **Tasdiq**: Ona `201` + qabul qilingan `sync_uuid`'lar roʻyxatini qaytaradi → Bola oʻsha qatorlarni `is_synced=True` qiladi (`update`).

### Nozik nuqtalar
- **FK'lar UUID orqali**: Ona'da `Order.waiter` lokal `User.id` (BigAutoField) ga emas, `sync_uuid` ga bogʻlanishi kerak — aks holda PK to'qnashuvi (docs/1 ning asosiy tashvishi). Ona modeli lokal `id` ni **saqlamasin**, faqat `sync_uuid` + `restaurant` ni.
- **Tartib**: `Product`/`User` `Order`'dan oldin sinxronlanishi kerak (FK bogʻliqligi). Yoki Ona tomonda kelgan buyurtmani "denormalized" (item nomlari matn sifatida) saqlash — sotuv tarixi uchun bu koʻpincha yetarli va soddaroq.
- **Soat/tartib**: Bola soati notoʻgʻri boʻlishi mumkin (`ErrorLog.occurred_at` izohida tan olingan). `created_at` ni ishonchli tartiblash uchun ishlatmang; Ona `received_at` qoʻshsin.

### Cloud tomonda kerak boʻladigan modellar
`cloud_server/tenants/` (yoki yangi `sales` app):
- `SyncedOrder(restaurant, sync_uuid unique, total, discount, final, status, closed_at, received_at, waiter_name, ...)`
- `SyncedOrderItem(order FK, product_name, quantity, price)`
- `SyncedPayment(order FK, amount, method, received_at)`

---

## Dizayn: Ona → Bola (downstream, menyu tarqatish)

Ikkinchi bosqich. Murakkabroq, chunki konflikt boʻlishi mumkin (menyu ikkala tomonda oʻzgarsa).

### docs/1 ning `MenuUpdateLog` yondashuvi
1. Restoran egasi Ona admin'da menyuni oʻzgartiradi → `MenuUpdateLog` ga yoziladi (yoki oddiyroq: `Product` da `updated_at` + versiya).
2. Bola heartbeat javobida "menyu versiyasi N" ni oladi (heartbeat allaqachon bor — `desired_version` mexanizmiga oʻxshab, `cloud_server/sync/views.py:203`).
3. Lokal versiya eski boʻlsa, Bola `GET /api/sync/menu/` bilan yangi menyuni tortadi va lokal DB'ga integratsiya qiladi.

### Konflikt siyosati (aniqlash shart)
- **Kim egasi?** Menyu uchun eng oddiy siyosat: **Ona — yagona haqiqat manbai** (menyu faqat Ona'da tahrirlanadi, Bola faqat oʻqiydi/keshaydi). Bu konfliktni butunlay yoʻqotadi va koʻp restoran uchun mantiqiy (markazdan menyu boshqaruv).
- Agar Bola'da ham menyu tahrirlansa (mahalliy narx, "bugun yoʻq" bayrogʻi) — "last-write-wins" yoki maydon-darajasidagi birlashtirish kerak, bu ancha murakkab. **Tavsiya: MVP da menyuni bir tomonlama (Ona→Bola) qiling.**

---

## Dizayn: Disaster Recovery (docs/4 vaʼdasi)

Upstream sync ishlagach, bu deyarli tekin keladi:
1. Yangi kompyuter, Docker, litsenziya kaliti qayta kiritiladi.
2. Activation muvaffaqiyatli → Bola `GET /api/sync/restore/` bilan Ona'dan **oxirgi sinxronlangan holatni** (sotuv tarixi, menyu, xodimlar) toʻliq paket sifatida tortadi.
3. Lokal DB tiklanadi.

**Ogohlantirish:** tiklanish faqat **sinxronlangan** maʼlumotni qaytaradi. Oxirgi sweep'dan keyingi (hali `is_synced=False`) buyurtmalar yoʻqoladi. Shuning uchun sweep tez-tez (1 daqiqa) boʻlsin, va bu cheklovni hujjatlang. Toʻliq nol-yoʻqotish uchun lokal `db_backup` ni tashqi joyga (masalan Ona'ga yoki S3'ga) ham yuborish kerak — hozir `db_backup` faqat lokal diskda (`docker-compose.prod.yml`), kompyuter bilan birga yonadi.

---

## Ustuvorlik va bosqichlar

| Bosqich | Ish | Nega |
|---------|-----|------|
| 5.1 | Upstream order sync (Bola→Ona), idempotent, error-log pattern'ini takrorlab | Analitika + billing + DR poydevori |
| 5.2 | Ona'da sotuv hisoboti (admin/dashboard) | Yuborilgan maʼlumotdan qiymat |
| 5.3 | Disaster recovery restore endpoint | docs/4 vaʼdasini bajarish |
| 5.4 | Downstream menyu (Ona→Bola, bir tomonlama) | Markazdan menyu boshqaruv |
| 5.5 | Lokal backup'ni offsite (S3/Ona) yuborish | Toʻliq nol-yoʻqotish |

**Muhim:** upstream sync'ni qurishdan oldin [01](01_kritik_xatolar.md) dagi migratsiya va buyurtma-yaxlitlik xatolarini tuzating — buzuq summali buyurtmalarni sinxronlash muammoni Ona'ga koʻchiradi.

Keyingi: **[06_ishonchlilik_va_deploy.md](06_ishonchlilik_va_deploy.md)**.
