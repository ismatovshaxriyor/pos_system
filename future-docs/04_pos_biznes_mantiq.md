# 04. POS biznes mantigʻi — domen korrektligi va yetishmayotgan funksiyalar

Bu hujjat [01_kritik_xatolar.md](01_kritik_xatolar.md) dagi buyurtma/toʻlov teshiklarini kengaytiradi va POS sifatida haqiqiy restoranga chiqishdan oldin kerak boʻlgan domen funksiyalarini sanaydi.

---

## A qism: mavjud mantiqni mustahkamlash

### 🟠 1. "Yagona haqiqat manbai" yoʻq — `total_amount` qoʻlda boshqariladi

**Muammo ildizi:** `Order.total_amount` — saqlanadigan ustun, faqat `add_item` (`core/views.py:172-173`) ichida qoʻlda oshiriladi. Item'ni oʻchirish/oʻzgartirish (`OrderItemViewSet` orqali) uni yangilamaydi. Bu [01](01_kritik_xatolar.md) #3, #4 ning umumiy sababi.

**Tavsiya:** `total_amount` ni **hisoblanadigan qiymatga** aylantiring, xuddi `amount_paid` allaqachon shunday (`core/models.py:169-177` — jonli `Sum`). Ikki variant:
- **Property** (eng toza): `total_amount = sum(item.price * item.quantity for item in self.items.all())`. Hech qachon eskirmaydi, race yoʻq. Kamchilik: har oʻqishda agregatsiya (prefetch bilan yumshatiladi).
- **Denormalized + signal**: `OrderItem` `save`/`delete` da `post_save`/`post_delete` signal orqali `Order.total_amount` ni qayta hisoblash. Tezroq oʻqish, lekin murakkabroq.

Property yondashuvi POS koʻlamida (bir buyurtmada oʻnlab item) mutlaqo yetarli va butun staleness/race sinfini yoʻqotadi.

### 🟠 2. Buyurtma holat mashinasi (state machine) himoyalanmagan

Hozir `status` istalgan qiymatga oʻtishi mumkin (generic PATCH — [01](01_kritik_xatolar.md) #2). Kerak: **aniq ruxsat etilgan oʻtishlar.**

```
new ──→ in_progress ──→ completed
  │           │
  └───────────┴────────→ cancelled
(completed va cancelled — terminal, ulardan chiqish yoʻq)
```

**Tavsiya:**
- `status` ni serializerda `read_only`.
- Har oʻtish uchun maxsus, tekshiruvli action: `close` (→completed, toʻlov shart), `cancel` (→cancelled, menejer ruxsati + sabab), `start` (→in_progress, ixtiyoriy).
- Terminal holatga oʻtgach — item/toʻlov/chegirma qoʻshib boʻlmaydi (bu tekshiruvlar qisman bor, `add_item` da yoʻq — [01](01_kritik_xatolar.md) #3).

### 🟡 3. Broadcast bildirishnoma oʻqilgan-holati umumiy

**Dalil:** `core/models.py:103-119` — `recipient=None` = barcha menejerlarga. `core/views.py:311-318` — `mark_read` bitta qatorni `is_read=True` qiladi. Broadcast qator bitta boʻlgani uchun, **bitta menejer oʻqiganda hammaga oʻqilgan** boʻlib koʻrinadi.

**Tavsiya:** broadcast bildirishnomalar uchun alohida `NotificationReadReceipt(notification, user)` jadvali, yoki har menejerga alohida qator yaratish. Hozircha past ustuvorlik (faqat UX), lekin bildirishnoma tizimi kengaysa muhim boʻladi.

---

## B qism: yetishmayotgan POS funksiyalari (real restoran uchun)

Quyidagilar — hozirgi kodda **yoʻq**, lekin haqiqiy restoran POS'i uchun deyarli majburiy. Ustuvorlik bilan:

### 🔴 Kritik (bularsiz real ishlatib boʻlmaydi)

**Void / Refund (bekor qilish / pul qaytarish)**
- Hozir `Payment` faqat qoʻshiladi, hech qachon qaytarilmaydi/bekor qilinmaydi. Xato kiritilgan toʻlov, mijoz qaytgan taom, noto'gʻri chek — bularni tuzatish yoʻli yoʻq.
- Kerak: `Payment` uchun void/refund (audit izi bilan, `django-simple-history` allaqachon buni qoʻllab-quvvatlaydi), menejer ruxsati, sabab.
- Buyurtma bekor qilish (`cancel` action) — item'lari va toʻlovlari bilan nima boʻlishini aniqlash.

**Chek chop etish / fiskalizatsiya**
- Restoran POS'ida chek (kvitansiya) chop etish markaziy. Hozir umuman yoʻq.
- Oʻzbekiston kontekstida: **fiskal modul / soliq (Soliq qoʻmitasi onlayn-NKM)** integratsiyasi qonuniy talab boʻlishi mumkin — buni erta aniqlang, chunki u ma'lumot modeliga taʼsir qiladi (har chek fiskal belgi olishi kerak).

### 🟠 Yuqori (tez orada kerak boʻladi)

**Soliq va xizmat haqi (service charge)**
- `Order` da `total`, `discount` bor, lekin **soliq (QQS/NDS)** va **xizmat haqi (10% и h.k.)** yoʻq. Koʻp restoran xizmat haqi qoʻshadi.
- Bu `final_amount` hisobiga taʼsir qiladi: `final = total - discount + service_charge + tax`. Modelga erta qoʻshilsa, keyin migratsiya osonroq.

**Yaxlitlash (rounding)**
- `DecimalField(decimal_places=2)` — lekin soʻm odatda tiyinsiz. Naqd toʻlovda yaxlitlash siyosati (masalan 100 soʻmgacha) aniqlanmagan.

**Buyurtma turlari**
- Faqat stol-asosli (`table` FK). Kerak boʻlishi mumkin: **olib ketish (takeaway)**, **yetkazib berish (delivery)** — `table` `null` bilan qisman qoʻllanadi, lekin turini ajratuvchi maydon yoʻq.

**Item darajasida holat / oshxona (KDS)**
- OrderItem'da holat yoʻq (tayyorlanmoqda/tayyor/berildi). Oshxona displey tizimi (Kitchen Display) real-time infratuzilma (`broadcast_event`) ustiga qurilishi mumkin — poydevor bor.

**Item modifikatorlari**
- "Osh — go'shtsiz", "Choy — shakarsiz", qoʻshimchalar. Hozir `OrderItem` = product + quantity + price. Modifikatorlar yoʻq.

### 🟡 Oʻrta (masshtab / tahlil bosqichida)

- **Smena (shift) / kassa yopish (Z-report)** — kassir smenasi, smena oxirida kassa yigʻindisi. Moliyaviy nazorat uchun muhim.
- **Stol birlashtirish/boʻlish, hisobni boʻlish (split bill)** — split-*payment* bor (bir buyurtmaga bir necha toʻlov), lekin split-*bill* (bir buyurtmani bir necha mijozga boʻlish) yoʻq.
- **Mijoz / sodiqlik (loyalty)** — mijoz bazasi, ballar, aksiyalar.
- **Ombor / inventarizatsiya** — sotilgan taom xomashyoni kamaytirishi (recipe-based stock). Katta funksiya, alohida faza.

---

## C qism: maʼlumot modeli boʻyicha kelajakni oʻylab qoʻyish

Hozir modelga qoʻshsangiz, keyin migratsiya arzon; keyin qoʻshsangiz — real maʼlumot ustida qiyin. Shuning uchun **hozirdan** koʻrib chiqing:

- `Order` ga: `order_type` (dine-in/takeaway/delivery), `tax_amount`, `service_charge`, `note`, `guest_count`.
- `OrderItem` ga: `status` (oshxona uchun), `note`/`modifiers` (JSON), `voided` bayrogʻi.
- `Payment` ga: `voided`/`refunded_of` (qaysi toʻlovni qaytaradi), `reference` (karta tranzaksiya ID).
- `Product` ga: `cost_price` (foyda hisobi uchun), `tax_rate`, `is_deleted` (soft-delete — sotilgan mahsulotni oʻchirish `OrderItem.product` PROTECT tufayli bloklanadi, soft-delete kerak).

**Diqqat:** `OrderItem.product` `on_delete=PROTECT` (`core/models.py:185`) — yaʼni bir marta sotilgan mahsulotni oʻchirib boʻlmaydi (toʻgʻri!). Lekin bu menejer "menyudan olib tashlash" istaganda muammo beradi. Yechim: `Product.is_available=False` (allaqachon bor) yoki `is_deleted` soft-delete — hard delete emas.

Keyingi: **[05_sinxronizatsiya_dvigateli.md](05_sinxronizatsiya_dvigateli.md)** — eng katta yetishmayotgan funksiya.
