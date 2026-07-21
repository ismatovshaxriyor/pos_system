# Buyurtmalar

## Buyurtma hayot sikli (holat mashinasi)

```
new ──start──→ in_progress ──close──→ completed
 │                  │
 └──────cancel──────┴──────→ cancelled
(completed va cancelled - terminal: ulardan chiqish yo'q)
```

**`status` maydoni to'liq read-only** — `PATCH /api/orders/{id}/ {"status": ...}` yuborilsa, so'rov `200` qaytaradi, lekin `status` **jim e'tiborsiz qoldiriladi** (xato ham bermaydi — DRF read-only konvensiyasi). Holatni faqat quyidagi action'lar o'zgartiradi: `start`, `close`, `cancel`. Terminal holatga o'tgach `add_item`/`add_payment`/`set_discount` hammasi `400` qaytaradi.

## Ruxsatlar va ko'rinish doirasi

| Rol | `GET /api/orders/` (ro'yxat) | Boshqa xodimning buyurtmasi (`GET /api/orders/{id}/`) | `set_discount` | `cancel` |
|---|---|---|---|---|
| Admin, menejer | Barcha buyurtmalar | Ko'radi | Ruxsat bor | Ruxsat bor |
| Kassir | Barcha buyurtmalar | Ko'radi | `403` | `403` |
| Ofitsiant | Faqat **o'zi** ochgan buyurtmalar | `404` (borligi ham oshkor qilinmaydi — `403` emas) | `403` | `403` |

`add_payment`/`close`/`add_item`/`start` — istalgan autentifikatsiyalangan xodim (kassir, menejer, ofitsiant) chaqira oladi; `set_discount` va `cancel` menejer/admin bilan cheklangan (jadvalga qarang).

## Maydonlar (`Order`)

| Maydon | Turi | O'qish/Yozish | Izoh |
|---|---|---|---|
| `id` | int | o'qish | |
| `sync_uuid` | UUID | o'qish/yozish | Idempotency kaliti — mijoz **o'zi generatsiya qiladi** va yaratishda (POST) yuboradi. Mijoz yuborgan qiymat **aynan saqlanadi**; xuddi shu `sync_uuid` bilan qayta yuborilsa yangi buyurtma ochilmaydi — batafsil "Buyurtma ochish"da. Tarmoq uzilib javob yo'qolgan bo'lsa ham xavfsiz qayta yuborish uchun. |
| `table` | nested obyekt yoki `null` | faqat o'qish | stol biriktirilgan bo'lsa (statusi bilan birga) |
| `table_id` | int yoki `null` | faqat yozish | yaratishda ishlatiladi |
| `waiter` | nested `User` obyekti | faqat o'qish | avtomatik joriy foydalanuvchi (yaratganda) |
| `cashier` | nested `User` obyekti yoki `null` | faqat o'qish | `close`/`close-on-credit` chaqirilganda avtomatik o'rnatiladi |
| `customer` | nested obyekt (`id`/`first_name`/`last_name`/`phone`) yoki `null` | faqat o'qish | buyurtma kreditga (qarzga) yopilganda bog'lanadi — [`11-qarz-daftar.md`](11-qarz-daftar.md) |
| `order_type` | string | o'qish/yozish | `dine_in` (default), `takeaway`, `delivery` |
| `total_amount` | string (Decimal) | faqat o'qish | itemlardan jonli hisoblanadi (Σ `price × quantity`, voided itemlar kirmayди) — endi DB ustuni emas |
| `tax_amount` | string (Decimal) | faqat o'qish | hozircha doim `0.00` — server tomonda to'ldiradigan oqim hali yo'q, client yozolmaydi |
| `service_charge` | string (Decimal) | faqat o'qish | hozircha doim `0.00` — xuddi shu |
| `discount_amount` | string (Decimal) | faqat o'qish | `set_discount` orqaligina o'zgaradi — `PATCH /api/orders/{id}/` orqali yuborilsa e'tiborga olinmaydi (jim tashlab yuboriladi) |
| `discount_reason` | string | faqat o'qish | xuddi shu, faqat `set_discount` orqali |
| `final_amount` | string (Decimal) | faqat o'qish | `max(total_amount - discount_amount + tax_amount + service_charge, 0)` (hisoblangan) |
| `amount_paid` | string (Decimal) | faqat o'qish | voided bo'lmagan to'lovlar yig'indisi (hisoblangan) |
| `balance_due` | string (Decimal) | faqat o'qish | `final_amount - amount_paid` — `0` bo'lsa buyurtma yopilishga tayyor |
| `status` | string | **faqat o'qish** | `new`, `in_progress`, `completed`, `cancelled` — faqat `start`/`close`/`cancel` action'lari o'zgartiradi (yuqoridagi holat mashinasiga qarang) |
| `note` | string | o'qish/yozish | buyurtma darajasidagi izoh |
| `guest_count` | int | o'qish/yozish | default `1` |
| `items` | `OrderItem[]` | faqat o'qish | pastga qarang |
| `payments` | `Payment[]` | faqat o'qish | pastga qarang — split-payment tufayli bir nechta yozuv bo'lishi mumkin |
| `created_at` | datetime | o'qish | |

## Maydonlar (`OrderItem`, `items` ichida nested)

| Maydon | Turi | Izoh |
|---|---|---|
| `id` | int | |
| `product` | nested `Product` obyekti | to'liq mahsulot ma'lumoti |
| `quantity` | int | |
| `price` | string (Decimal) | **buyurtma qo'shilgan paytdagi narx** — hozirgi `Product.price`dan farqli bo'lishi mumkin (narx keyin o'zgargan bo'lsa) |
| `note` | string | item darajasidagi izoh (masalan "achchiq emas") — `add_item`da yuboriladi |
| `modifiers` | JSON obyekt | erkin tuzilma (masalan `{"olib_tashlansin": ["piyoz"]}`) — `add_item`da yuboriladi, default `{}` |
| `status` | string | **faqat o'qish** — oshxona holati: `new`, `preparing`, `ready`, `served`. Uni o'zgartiradigan API hali yo'q (KDS keyinroq) — hozircha doim `new` |
| `is_voided` | bool | **faqat o'qish** — void qilish API'si hali yo'q, hozircha doim `false`. `true` bo'lgan item `total_amount`ga kirmaydi |

## Maydonlar (`Payment`, `payments` ichida nested)

| Maydon | Turi | Izoh |
|---|---|---|
| `id` | int | |
| `amount` | string (Decimal) | musbat bo'lishi shart (`> 0`) |
| `method` | string | `cash`, `card`, yoki `other` |
| `reference` | string | ixtiyoriy — masalan karta tranzaksiya raqami; `add_payment`da yuboriladi |
| `received_by` | nested `User` obyekti | to'lovni qabul qilgan xodim — server tomonidan avtomatik o'rnatiladi (joriy foydalanuvchi) |
| `is_voided` | bool | **faqat o'qish** — void/refund oqimi hali yo'q, hozircha doim `false`. `true` bo'lgan to'lov `amount_paid`ga kirmaydi |
| `refunded_of` | int yoki `null` | **faqat o'qish** — kelajakdagi refund oqimi uchun (qaysi to'lovni qaytaradi) |
| `created_at` | datetime | |

---

## Buyurtmalar ro'yxati

```
GET /api/orders/
GET /api/orders/?date=today
GET /api/orders/?date=2026-07-12
Authorization: Token <token>
```

**Javob (200):** `Order` obyektlari massivi, har doim **eng yangisidan eskisiga** (`created_at` bo'yicha kamayish tartibida) — sahifalash yo'q, batafsil [`06-conventions-and-errors.md`](06-conventions-and-errors.md). Ofitsiant uchun avtomatik faqat o'ziniki bilan filtrlanadi (yuqoridagi jadvalga qarang); admin/menejer/kassir hammasini ko'radi.

**`?date=` — kun bo'yicha filtr (buyurtmalar tarixi):**

| Qiymat | Ma'no |
|---|---|
| (yo'q) | Filtrlanmaydi — barcha vaqt (yuqoridagi rol scoping bilan) |
| `today` | Faqat **bugungi** buyurtmalar |
| `YYYY-MM-DD` (masalan `2026-07-12`) | Aynan shu kun |
| boshqa har qanday matn | `400 {"detail": {"date": "YYYY-MM-DD formatida yoki 'today' bo'lishi kerak."}}` |

**Muhim — kun chegarasi mahalliy (Toshkent, `UTC+5`) vaqt bo'yicha hisoblanadi**, `created_at`ning o'zi (har doim UTC) emas: masalan mahalliy vaqt bilan soat `00:30`da ochilgan buyurtma UTC bo'yicha hali "kechagi kun"ga to'g'ri kelsa ham, `?date=today` uni **to'g'ri bugungiga** kiritadi. Client tomonda alohida vaqt-zonasi hisob-kitobi qilish shart emas — `today` literalini yuboring, yoki aniq sana kerak bo'lsa ISO `YYYY-MM-DD` (u ham mahalliy kun sifatida talqin qilinadi, client o'zi Toshkent sanasini hisoblab yuborishi kerak, masalan foydalanuvchi tanlagan kalendar sanasi).

Bu filtr ofitsiant/kassir/menejer uchun bir xil ishlaydi — masalan ofitsiant ilovasida "Mening bugungi buyurtmalarim" ekrani `GET /api/orders/?date=today` bilan to'g'ridan-to'g'ri quriladi (qo'shimcha client-side filtrlash shart emas, chunki rol scoping + sana filtri serverda birgalikda qo'llanadi).

---

## Buyurtma ochish

```
POST /api/orders/
Authorization: Token <token>
Content-Type: application/json

{"table_id": 1, "sync_uuid": "123e4567-e89b-12d3-a456-426614174000", "order_type": "dine_in", "guest_count": 2, "note": "Deraza yonidagi stol"}
```

`table_id` ixtiyoriy (stolsiz, masalan olib ketish buyurtmasi uchun butunlay tashlab ketish yoki `null` yuborish mumkin — bu holda `order_type: "takeaway"` yuborish tavsiya etiladi). `order_type`/`guest_count`/`note` ham ixtiyoriy (defaultlar: `dine_in`/`1`/`""`). `waiter` maydoni **avtomatik** joriy foydalanuvchiga o'rnatiladi — client tomondan yuborilmaydi va yuborilsa e'tiborga olinmaydi.

**Javob (201):**
```json
{
  "id": 10,
  "sync_uuid": "123e4567-e89b-12d3-a456-426614174000",
  "table": {"id": 1, "name": "1-stol", "status": "occupied_by_me", "...": "..."},
  "waiter": {"id": 4, "username": "+998901112244", "first_name": "Ali", "last_name": "Valiyev", "role": "waiter"},
  "cashier": null,
  "total_amount": "0.00",
  "status": "new",
  "items": [],
  "created_at": "..."
}
```

### Idempotentlik — takroriy yuborish (retry) xatti-harakati

Buyurtma yaratish **idempotent**: `sync_uuid`ni mijoz o'zi generatsiya qilib yuboradi, va javob qaytadigan qiymat **aynan** siz yuborgan `sync_uuid` bo'ladi (server uni qayta yozmaydi). Shuning uchun:

- **Birinchi yuborish** → `201 Created`, yangi buyurtma (yuqoridagi javob).
- **Xuddi shu `sync_uuid` bilan qayta yuborish** → `200 OK` (201 **emas**) va **o'sha** mavjud buyurtma qaytadi — yangi dublikat ochilmaydi. Bu javob yo'qolgan/timeout bo'lgan so'rovni xavfsiz qayta urish uchun: HTTP `201`/`200` farqiga qarab "yangi ochildimi yoki mavjudi qaytdimi" ni bilib olasiz, lekin ikkalasida ham buyurtma bitta bo'lib qoladi.
- **`sync_uuid` yaroqli UUID bo'lmasa** (masalan bo'sh yoki buzuq matn) → `400 {"detail": "sync_uuid yaroqli UUID bo'lishi kerak."}`.

> **Muhim (o'zgarish):** ilgari mijoz yuborgan `sync_uuid` server tomonda e'tiborga olinmay, buyurtmaga tasodifiy UUID yozilardi — natijada retry hech qachon "mavjud"ni topmay, har takror yangi dublikat buyurtma ochardi. Endi mijoz UUID'si aynan saqlanadi, shuning uchun oflayn-birinchi mijoz har bir yangi buyurtma uchun bitta `sync_uuid` generatsiya qilib (masalan `uuid.v4()`), muvaffaqiyatli `2xx` javob kelmaguncha **o'sha** UUID bilan qayta urishi kerak.

---

## Buyurtmaga taom qo'shish

```
POST /api/orders/{id}/add_item/
Content-Type: application/json

{"product_id": 3, "quantity": 2, "note": "achchiq emas", "modifiers": {"olib_tashlansin": ["piyoz"]}}
```

`quantity` ixtiyoriy, default `1`. `note` va `modifiers` ham ixtiyoriy — item bilan birga saqlanadi (jadvalga qarang). `status`/`is_voided` yuborilsa e'tiborga olinmaydi (read-only). **Javob (201):** `{"status": "Item added"}` — e'tibor bering, bu javobda yangilangan `Order` obyekti QAYTMAYDI, faqat tasdiqlash xabari. Yangi `total_amount`/`items`ni ko'rish uchun alohida `GET /api/orders/{id}/` chaqiring (yoki UI'da lokal hisoblab, keyingi ro'yxat yangilanishida serverdan tasdiqlab oling).

Validatsiya xatosi (masalan mavjud bo'lmagan `product_id`) — `400`, DRF standart maydon xatoliklari formatida (masalan `{"product_id": ["Invalid pk \"999\" - object does not exist."]}`).

**O'zgarish**: ilgari mavjud bo'lgan `/api/order-items/` endpoint'i **butunlay olib tashlandi** — unga so'rov endi `404` qaytaradi. Item yaratishning yagona yo'li shu `add_item` action'i; itemni tahrirlash/o'chirish API'si hozircha yo'q (xato qo'shilgan bo'lsa — buyurtmani `cancel` qilib qaytadan oching, void oqimi keyinroq qo'shiladi).

Shuningdek, **soft-delete qilingan mahsulot** (`Product.is_deleted=true`, qarang [`02-catalog.md`](02-catalog.md)) yangi buyurtmaga qo'shilmaydi — `product_id` validatsiyadan o'tmay `400` qaytadi.

---

## To'lov qo'shish (split-payment qo'llab-quvvatlanadi)

```
POST /api/orders/{id}/add_payment/
Content-Type: application/json

{"amount": "20000", "method": "card", "reference": "TXN-482913"}
```

`method` ixtiyoriy, default `cash` (boshqa qiymatlar: `card`, `other`). `reference` ixtiyoriy — karta tranzaksiya raqami kabi tashqi identifikator uchun. `received_by` avtomatik joriy foydalanuvchiga o'rnatiladi.

**Bitta buyurtmaga bir nechta to'lov qo'shish mumkin** (masalan yarmi naqd, yarmi karta) — har bir chaqiruv alohida `Payment` yozuvi yaratadi, `amount_paid` shularning yig'indisi bo'ladi. Buyurtma **to'liq to'langunga qadar** (`balance_due == 0`) `close` ishlamaydi (pastga qarang).

**Javob (201):** yangi yaratilgan `Payment` obyekti:
```json
{"id": 5, "amount": "20000.00", "method": "cash", "received_by": {"id": 7, "username": "+998901112255", "first_name": "Sardor", "last_name": "Qosimov", "role": "cashier"}, "created_at": "..."}
```

Xatoliklar (`400`, `{"detail": "..."}` formatida):
- To'lov summasi qolgan qarzdan (`balance_due`) oshib ketsa — masalan 50 000 so'mlik qarzga 60 000 to'lov yuborilsa.
- Buyurtma allaqachon `completed` yoki `cancelled` bo'lsa.
- Summasi `0` yoki manfiy bo'lsa — bu holda `{"amount": [...]}` ko'rinishidagi maydon xatosi qaytadi (biznes-qoida emas, oddiy validatsiya).

**Muhim**: `total_amount`ni to'g'ridan-to'g'ri kamaytirish yoki `Order.status`ni qo'lda `completed` qilish orqali "to'lov qildim" deb hisoblamang — har doim shu `add_payment` action'idan foydalaning, aks holda `balance_due` noto'g'ri hisoblanadi va `close` doim rad etadi.

---

## Chegirma qo'llash (faqat menejer/admin)

```
POST /api/orders/{id}/set_discount/
Content-Type: application/json

{"discount_amount": "5000", "discount_reason": "Doimiy mijoz"}
```

`discount_reason` ixtiyoriy. **Faqat menejer yoki admin** chaqira oladi — kassir/ofitsiant urinsa `403`. Chegirma summasi `total_amount`dan katta bo'lsa `400 {"detail": "..."}`. Buyurtma allaqachon `completed`/`cancelled` bo'lsa ham `400` (ruxsat emas, biznes-qoida — javob kodi shu ikkalasini ajratish uchun muhim: `403` = rol yetarli emas, `400` = rol yetarli, lekin holat noto'g'ri).

**Javob (200):** yangilangan to'liq `Order` obyekti (yuqoridagi maydonlar jadvaliga qarang, jumladan yangi `final_amount`/`balance_due`).

Chegirma o'zgartirilganda (va uni admin emas, menejer qo'llaganda) barcha adminlarga bildirishnoma yuboriladi — qarang [`04-devices-and-notifications.md`](04-devices-and-notifications.md) (`notif_type: "discount_applied"`).

---

## Buyurtmani yopish

```
POST /api/orders/{id}/close/
```

`cashier` maydoni so'rov yuborgan foydalanuvchiga o'rnatiladi, `status` → `completed`.

**Muhim o'zgarish**: `close` endi faqat buyurtma **to'liq to'langan bo'lsa** (`balance_due == 0`, kerak bo'lsa chegirma hisobga olingan holda) ishlaydi. Aks holda:
```json
400 {"detail": "Buyurtma to'liq to'lanmagan. Qolgan qarz: 15000.00 so'm."}
```
Ya'ni to'g'ri oqim: kerak bo'lsa avval `set_discount`, keyin bir yoki bir nechta `add_payment` (`balance_due` `0`ga yetgunicha), so'ng `close`. Allaqachon yopilgan/bekor qilingan bo'lsa `400 {"detail": "Order already completed or cancelled"}` (xabar inglizcha).

**Javob (200):** `{"status": "Order closed successfully"}`.

---

## Buyurtmani kreditga (qarzga) yopish — faqat menejer

To'liq to'lanmagan buyurtmani mijozga yozib yopish uchun (`close`dan farqli — u to'liq to'lovni talab qiladi):

```
POST /api/orders/{id}/close-on-credit/
{"customer_id": 5}
```

Qolgan qarz (`balance_due`) mijoz balansiga yoziladi, buyurtma `completed` bo'ladi. Faqat `manager`/admin. To'liq maydon/xatolik jadvali va qarz-to'lash oqimi — [`11-qarz-daftar.md`](11-qarz-daftar.md).

---

## Buyurtmani boshlash

```
POST /api/orders/{id}/start/
```

`new` → `in_progress`. Istalgan xodim chaqira oladi. Holat `new` bo'lmasa `400 {"detail": "Faqat 'new' holatdagi buyurtmalarni boshlash mumkin."}`.

**Javob (200):** `{"status": "Order started"}`.

---

## Buyurtmani bekor qilish (faqat menejer/admin)

```
POST /api/orders/{id}/cancel/
```

**Yangi action** — ilgari tavsiya qilingan `PATCH {"status": "cancelled"}` usuli **endi ishlamaydi** (`status` read-only bo'ldi). Faqat menejer/admin chaqira oladi — kassir/ofitsiant urinsa `403`.

Xatoliklar (`400`, `{"detail": "..."}`):
- `completed` buyurtmani bekor qilib bo'lmaydi (pul allaqachon olingan — bu refund hududi, u keyinroq qo'shiladi).
- Allaqachon `cancelled` bo'lsa.

**Javob (200):** `{"status": "Order cancelled"}`. Bekor qilingan buyurtmaga keyin item/to'lov/chegirma qo'shib bo'lmaydi (hammasi `400`).

---

## WebSocket signallari (holat o'zgarganda)

`start`/`close`/`close-on-credit`/`cancel` muvaffaqiyatli bo'lganda `order_updated` hodisasi, stol biriktirilgan bo'lsa qo'shimcha `table_status_changed` ham yuboriladi (buyurtma ochilganda esa faqat `table_status_changed`); `add_item`/`add_payment`/`set_discount` ham `order_updated` **va** (stolli bo'lsa) `table_status_changed` yuboradi — bu kassirning jonli stol-sotuvlari xaritasini yangilaydi ([`10-kassir-jonli-sotuv.md`](10-kassir-jonli-sotuv.md), [`05-websocket.md`](05-websocket.md)). Takeaway/delivery (stolsiz) buyurtmalarda faqat `order_updated` keladi — UI faqat stol hodisasiga tayanmasligi kerak.

---

## Boshlang'ich ma'lumotlarni olish (Bootstrap)

Mobil ilova ishga tushgan zahoti kerakli barcha bazaviy ma'lumotlarni bitta so'rovda olish uchun qo'shimcha tezkor endpoint yaratilgan:
```
GET /api/bootstrap/
Authorization: Token <token>
```

**Javob (200):**
```json
{
  "user": {"id": 1, "username": "+998901112244", "role": "waiter", "...": "..."},
  "categories": [{"id": 1, "name": "Ichimliklar", "image": "http://<bola-ip>:8000/media/categories/x.png", "...": "..."}],
  "products": [{"id": 1, "name": "Choy", "price": "5000.00", "image": "http://<bola-ip>:8000/media/products/y.png", "...": "..."}],
  "table_zones": [{"id": 1, "name": "Zal", "...": "..."}],
  "tables": [{"id": 1, "name": "1-stol", "status": "free", "...": "..."}],
  "active_orders": [{"id": 10, "status": "new", "sync_uuid": "...", "...": "..."}]
}
```
*Ilova yuklanishi bilan shu yagona so'rovni chaqirib, ma'lumotlarni o'z ichki xotirasiga saqlab olsa bo'ladi, bu tarmoq xarajatlarini va ilova qotishini keskin kamaytiradi.*

Javob kalitlari: `user`, `categories`, `products`, `table_zones`, `tables`, `active_orders`. Har bir ro'yxatning elementlari mos ViewSet (`/api/categories/`, `/api/products/` va h.k.) qaytaradigan bilan **bir xil to'liq obyekt** — maydonlar uchun [`02-catalog.md`](02-catalog.md)ga qarang.

> **Rasm URL'lari (o'zgarish):** `categories`/`products`dagi `image` maydoni endi **to'liq absolyut URL** (`http://.../media/...`) qaytaradi — aynan `/api/products/` kabi oddiy ro'yxat endpoint'lari qanday qaytarsa, shunday. Ilgari bootstrap javobida bu maydon nisbiy yo'l (`/media/...`) bo'lib, ViewSet'lar bilan mos kelmasdi; endi ikkala manba bir xil, shuning uchun URL'ni maxsus ishlov (base URL'ni old qo'shish) bilan tuzatishga hojat yo'q — kelgan qiymatni to'g'ridan-to'g'ri ishlating.
