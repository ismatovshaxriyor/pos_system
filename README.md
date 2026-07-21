# Ona-Bola POS — Mobil ilovalar uchun API hujjatlari

Bu branch **faqat** hujjat (`.md`) fayllaridan iborat — Django manba kodi bu yerda yo'q. `local_server` ("Bola", restoran ichidagi lokal server) API'siga mobil ilovalar (admin / menejer-kassir / ofitsiant) tomonidan ulanish uchun kerak bo'lgan barcha ma'lumot shu yerda.

## ⚠️ So'nggi o'zgarishlar (2026-07-21) — 5 ta yangi imkoniyat

Beshta yangi funksiya qo'shildi (uchtasi butunlay yangi endpoint to'plamlari):

1. **Kassir uchun jonli stol-sotuvlari** — `GET /api/tables/live-sales/`: har band stolda joriy buyurtma summasi, real-vaqt (`table_status_changed` WS signali endi `add_item`/`add_payment`/`set_discount`da ham keladi). [`10-kassir-jonli-sotuv.md`](10-kassir-jonli-sotuv.md).
2. **Afitsiant kunlik sotuv jamlanmasi** — `GET /api/reports/my-summary/?date=today`. [`13-hisobotlar-dashboard.md`](13-hisobotlar-dashboard.md).
3. **Qarz daftar** — yangi `Customer` modeli, `POST /api/orders/{id}/close-on-credit/` (kreditga yopish, faqat menejer), `POST /api/customers/{id}/repay/` (qarz to'lash), qarzdorlar ro'yxati. `Order`ga `customer` maydoni qo'shildi. [`11-qarz-daftar.md`](11-qarz-daftar.md).
4. **Ombor (ingredient + retsept)** — `/api/ingredients/`, `/api/suppliers/`, `/api/recipe-items/`, `/api/purchases/`, `/api/stock-movements/`. Taom sotilganda ingredient avtomatik kamayadi; past-zaxirada yangi `low_stock` WS hodisasi (sotuv bloklanmaydi). [`12-ombor.md`](12-ombor.md).
5. **Menejer dashboard** — `GET /api/reports/dashboard/`, `/sales/`, `/staff/`, `/inventory/`, `/debts/` (faqat menejer). [`13-hisobotlar-dashboard.md`](13-hisobotlar-dashboard.md).

## ⚠️ So'nggi o'zgarishlar (2026-07-20)

1. **`POST /api/users/` — `password` maydoni endi haqiqatan ishlaydi va rolga qarab majburiy/taqiqlangan.** Ilgari `UserSerializer`da `password` maydoni umuman yo'q edi — yuborilgan parol jimgina e'tiborsiz qoldirilar, yaratilgan xodim (manager/waiter) **hech qachon login qila olmas edi** (backend xatosi, tuzatildi). Endi: `manager`/`waiter` uchun `password` **majburiy** va haqiqatan hash qilinib saqlanadi; `cashier` uchun **taqiqlangan** (`400`) — kassir faqat PIN+qurilma orqali kiradi, haqiqiy parol o'rnatilsa `/api/auth/login/` orqali qurilma tekshiruvisiz kirish teshigi ochilardi. Batafsil: [`01-auth.md`](01-auth.md), 5-bo'lim.
2. **`POST /api/users/{id}/generate-registration-code/` va `POST /api/auth/device/register/` endi to'liq hujjatlashtirilgan** (ilgari faqat shu "Tezkor boshlash" ro'yxatida eslatilgan, to'liq maydon/xatolik jadvali yo'q edi) — [`01-auth.md`](01-auth.md), 6–7-bo'limlar.
3. **`GET/PATCH/DELETE /api/users/{id}/` va `GET /api/users/` (xodimlar ro'yxati/tahrirlash/o'chirish) endi hujjatlashtirilgan** — ilgari faqat yaratish (`POST`) va `me` bor edi. `DELETE` qaytarib bo'lmaydigan CASCADE oqibatlariga ega (qurilma/davomat tarixi o'chadi) — ehtiyot bo'ling, batafsil [`01-auth.md`](01-auth.md), 9-bo'lim.

## ⚠️ So'nggi o'zgarishlar (2026-07-13)

1. **`GET /api/orders/?date=` — kun bo'yicha filtr qo'shildi.** `?date=today` yoki `?date=YYYY-MM-DD`; kun chegarasi mahalliy (Toshkent) vaqt bo'yicha hisoblanadi, `created_at`ning UTC qiymatiga qaramay. Noto'g'ri format `400`. Ro'yxat endi doim `created_at` bo'yicha kamayish tartibida (eng yangisi birinchi) — [`03-orders.md`](03-orders.md#buyurtmalar-royxati), [`07-ofitsiant-oqimi.md`](07-ofitsiant-oqimi.md#4-kun-davomida--oz-buyurtmalarini-kuzatish).

## ⚠️ So'nggi o'zgarishlar (2026-07-12)

Frontend uchun muhim, kichik xatti-harakat tuzatishlari:

1. **Buyurtma yaratish endi haqiqatan idempotent** — mijoz yuborgan `sync_uuid` **aynan saqlanadi** (ilgari e'tiborga olinmay, tasodifiy UUID yozilardi va retry har safar dublikat ochardi). Xuddi shu `sync_uuid` bilan qayta yuborish `200` + mavjud buyurtmani qaytaradi (`201` emas); yaroqsiz UUID esa `400`. Oflayn-birinchi mijoz muvaffaqiyatgacha **o'sha** UUID bilan qayta urishi kerak — [`03-orders.md`](03-orders.md).
2. **`GET /api/bootstrap/` rasm URL'lari endi absolyut** (`http://.../media/...`) — oddiy ro'yxat endpoint'lari bilan mos; ilgari nisbiy (`/media/...`) edi. Base URL'ni qo'lda old qo'shmang. Javobga `table_zones` kaliti ham qo'shildi — [`03-orders.md`](03-orders.md).
3. **`waiter-login` `403`i almashtirilgan eski qurilmaga ham tegishli** — tasdiqlangan qurilma boshqasiga ko'chgach, eski qurilmadan qayta kirish ham menejer tasdig'ini kutadi (bir foydalanuvchida bir vaqtda bitta faol qurilma) — [`01-auth.md`](01-auth.md).

## ⚠️ So'nggi o'zgarishlar (2026-07-11) — breaking!

Buyurtma oqimi qattiq qayta ishlandi. Frontend uchun eng muhimlari:

1. **`/api/order-items/` endpoint'i OLIB TASHLANDI** (`404`) — item faqat `POST /api/orders/{id}/add_item/` orqali yaratiladi.
2. **`Order.status` endi to'liq read-only** — `PATCH {"status": ...}` jim e'tiborsiz qoldiriladi. Holat faqat action'lar bilan o'zgaradi: yangi **`POST /api/orders/{id}/start/`** (`new → in_progress`, hamma) va yangi **`POST /api/orders/{id}/cancel/`** (`→ cancelled`, faqat menejer/admin) qo'shildi; `close` avvalgidek. Bekor qilishning eski `PATCH` usuli **endi ishlamaydi**.
3. **Yangi `Order` maydonlari**: `order_type` (dine_in/takeaway/delivery), `note`, `guest_count` (yoziladi); `tax_amount`, `service_charge` (read-only, hozircha `0.00`). `final_amount` formulasi endi soliq/xizmat haqini ham qo'shadi.
4. **Yangi `OrderItem` maydonlari**: `note`, `modifiers` (`add_item`da yuboriladi); `status` (oshxona), `is_voided` — read-only.
5. **Yangi `Payment` maydonlari**: `reference` (yoziladi); `is_voided`, `refunded_of` — read-only.
6. **`DELETE /api/products/{id}/` endi soft-delete** — o'chirilgan mahsulot ro'yxatlardan yo'qoladi va yangi buyurtmaga qo'shilmaydi ([`02-catalog.md`](02-catalog.md)).
7. **Umumiy rate-limit qo'shildi** — anon 10/daqiqa, token bilan 100/daqiqa; `429`ni to'g'ri qayta ishlang ([`06-conventions-and-errors.md`](06-conventions-and-errors.md)).
8. **Yangi WebSocket hodisalari hujjatlandi**: `order_updated` (endi `start`/`close`/`cancel`da ham keladi — stolsiz buyurtmalar uchun yagona signal) va `discount_applied` ([`05-websocket.md`](05-websocket.md)).

## Tuzilma

- [`01-auth.md`](01-auth.md) — Admin (telefon+parol) va xodim (PIN+qurilma) autentifikatsiyasi, to'liq oqim misoli
- [`02-catalog.md`](02-catalog.md) — Kategoriya, mahsulot, stollar (to'liq maydon jadvallari bilan)
- [`03-orders.md`](03-orders.md) — Buyurtmalar, buyurtma elementlari, stol holati
- [`04-devices-and-notifications.md`](04-devices-and-notifications.md) — Qurilma boshqaruvi (admin), bildirishnomalar
- [`05-websocket.md`](05-websocket.md) — Real-vaqt (WebSocket) hodisalari, Flutter ulanish namunasi
- [`06-conventions-and-errors.md`](06-conventions-and-errors.md) — Umumiy formatlar, xatolik kodlari, sahifalash/filtrlash holati
- [`07-ofitsiant-oqimi.md`](07-ofitsiant-oqimi.md) — **Ofitsiant ilovasi uchun**: faqat shu rolga tegishli endpoint'larning aniq chaqiruv ketma-ketligi (login → bootstrap → buyurtma → item), taqiqlangan amallar ro'yxati, to'liq curl misoli
- [`08-attendance.md`](08-attendance.md) — Xodimlar davomati (check-in/check-out) va koordinata sozlamalari
- [`09-printers.md`](09-printers.md) — Printerlar va Oshxona Chop Etish Tizimi (KDS) API va WebSocket hodisalari
- [`10-kassir-jonli-sotuv.md`](10-kassir-jonli-sotuv.md) — **Kassir uchun**: jonli stol-sotuvlari xaritasi (`live-sales`) + real-vaqt signali
- [`11-qarz-daftar.md`](11-qarz-daftar.md) — Mijozlar, kreditga yopish (`close-on-credit`), qarz balansi va to'lash
- [`12-ombor.md`](12-ombor.md) — Ombor: ingredient, retsept, kirim, inventarizatsiya, past-zaxira
- [`13-hisobotlar-dashboard.md`](13-hisobotlar-dashboard.md) — Afitsiant kunlik sotuvi + menejer dashboard/analitika


## Tezkor boshlash (bitta misolda barcha oqim)

**Diqqat:** 2–4-qadamlar **kassir** misolida (PIN+kod oqimi — [`01-auth.md`](01-auth.md), 5–7-bo'limlar). Ofitsiant uchun bu ikki qadam **shart emas** — u to'g'ridan-to'g'ri `POST /api/auth/waiter-login/` bilan telefon+parolini kiritadi va qurilmasi avtomatik bog'lanadi (TOFU, [`01-auth.md`](01-auth.md) 1-bo'lim); pastdagi 5–11-qadamlar ikkala rol uchun ham amal qiladi.

```
1. Admin ilovaga kiradi                → POST /api/auth/login/
2. Admin yangi kassir yaratadi          → POST /api/users/           (role: "cashier", password YO'Q)
3. Admin ro'yxatga olish kodi beradi    → POST /api/users/{id}/generate-registration-code/
4. Kassir kodni planshetda kiritadi     → POST /api/auth/device/register/  (PIN shu yerda o'rnatiladi)
5. Xodim WebSocket'ga ulanadi           → wss://.../ws/events/?token=...
6. Xodim stollarni ko'radi              → GET /api/tables/
7. Ofitsiant buyurtma ochadi            → POST /api/orders/
8. Ofitsiant taom qo'shadi              → POST /api/orders/{id}/add_item/
9. Kassir to'lovni qabul qiladi         → POST /api/orders/{id}/add_payment/  (bir nechta marta - split-payment)
10. Kassir buyurtmani yopadi            → POST /api/orders/{id}/close/  (faqat to'liq to'langanda ishlaydi)
11. Ertasiga kassir PIN bilan kiradi    → POST /api/auth/pin-login/  (kod/telefon shart emas)
```

To'liq misollar har bir bo'limda alohida keltirilgan. **Faqat ofitsiant ilovasiga tegishli, boshqa rollarning qadamlaridan tozalangan to'liq ketma-ketlik** (bootstrap, ixtiyoriy `start`, WebSocket integratsiyasi bilan) uchun [`07-ofitsiant-oqimi.md`](07-ofitsiant-oqimi.md)ga qarang.

## Umumiy qoidalar

- **Base URL**: dev muhitda `http://<bola-server-ip>:8000`, prodda `https://<restoran-domeni>` (Cloudflare Tunnel orqali). Restoran ichidagi lokal tarmoqda ishlaydi — **internet shart emas**, bu offline-first tizim; mobil ilova internet bo'lmasa ham shu serverga (bir xil Wi-Fi'da) ulanib ishlashda davom etadi.
- **Format**: barcha so'rov/javoblar JSON (`Content-Type: application/json`), fayl yuklashdan tashqari (`multipart/form-data` — `image` maydonlari uchun).
- **Autentifikatsiya**: muvaffaqiyatli login/PIN javobida olingan `token`ni har bir keyingi so'rovda header sifatida yuboring:
  ```
  Authorization: Token <token>
  ```
  Token muddatsiz — faqat qurilma chetlashtirilsa yoki admin token'ni bekor qilsa yaroqsiz bo'ladi (`401`).
- **Sahifalash**: YOQILGAN — barcha `GET /api/{resource}/` ro'yxatlari `{"count": ..., "next": ..., "previous": ..., "results": [...]}` formatida, sahifada 50 tadan obyekt qaytaradi; ma'lumot doim `results` ichida. Filtrlash/qidiruv parametrlari hozircha qo'llab-quvvatlanmaydi. Batafsil: [`06-conventions-and-errors.md`](06-conventions-and-errors.md).
- **Xatoliklar**: umumiy formatlar va HTTP status kodlari ro'yxati uchun [`06-conventions-and-errors.md`](06-conventions-and-errors.md)ga qarang.
- **Litsenziya kill-switch**: agar restoran litsenziyasi bloklangan bo'lsa, `/api/auth/*` va `/admin/` dan tashqari BARCHA `/api/...` so'rovlar `402 {"detail": "Tizim bloklandi. To'lovni amalga oshiring."}` bilan qaytadi, WebSocket ulanishi esa `4402` kodi bilan rad etiladi. Mobil ilova bu holatni alohida ko'rsatishi kerak (masalan "to'lov kutilmoqda" ekrani) — bu holatda ham login (`/api/auth/*`) ishlayveradi, faqat POS funksiyalari (buyurtma, mahsulot va h.k.) bloklanadi.

## Mashinaviy o'qiladigan sxema (kod generatsiyasi uchun)

Qo'lda yozilgan bu hujjatlardan tashqari, backend'da to'liq **OpenAPI 3.0** sxemasi ham bor (avtomatik generatsiya qilinadi, har doim kod bilan sinxron — qo'lda yozilgan `.md` fayllardan farqli o'laroq, bu hech qachon eskirmaydi):

- Interaktiv Swagger UI: `http://<bola-server-ip>:8000/api/docs/`
- Xom sxema (JSON/YAML): `http://<bola-server-ip>:8000/api/schema/`

Flutter tomonda `openapi_generator` yoki `swagger_dart_code_generator` kabi paket bilan shu sxemadan **tayyor Dart model + API client kodini avtomatik generatsiya qilish** mumkin — qo'lda yozishga hojat yo'q:

```bash
# masalan openapi_generator bilan
dart run openapi_generator_cli generate \
  -i http://<bola-server-ip>:8000/api/schema/?format=json \
  -g dart-dio \
  -o lib/api
```

**Muhim istisno**: OpenAPI sxemasi faqat oddiy HTTP (REST) endpoint'larni qamraydi. **WebSocket** ([`05-websocket.md`](05-websocket.md)) alohida protokol bo'lgani uchun sxemada umuman ko'rinmaydi — u har doim shu qo'lda yozilgan hujjatdan o'qilishi kerak.

Ikkalasi (avtomatik sxema + qo'lda yozilgan `.md`) bir-birini to'ldiradi: sxema — aniq maydon turlari va kod generatsiyasi uchun, `.md` fayllar — oqim/kontekstni tushunish uchun (masalan PIN+qurilma oqimi nima uchun aynan shunday ishlaydi, WebSocket qachon qayta ulanish kerak va h.k.).

## Rol modeli (qisqacha)

Uchta mobil ilova, uchta rol — ilova qaysi UI'ni ko'rsatishni **faqat `role` maydoniga** qarab hal qiladi:

| Rol | `role` maydoni | Kirish usuli |
|---|---|---|
| Admin/Menejer | `manager` | Restoran birinchi marta faollashtirilganda (Ona serverdan) avtomatik yaratilgan bosh hisob — telefon + parol; keyinchalik qo'shilgan menejerlar — PIN + qurilma |
| Kassir | `cashier` | PIN + qurilma |
| Ofitsiant | `waiter` | PIN + qurilma |

**Muhim**: alohida "Admin" roli yo'q — barcha `role=manager` foydalanuvchilar bir xil (to'liq) ruxsatlarga ega, kirish usulidan qat'i nazar. `is_staff` API orqali umuman ko'rsatilmaydi/o'zgartirilmaydi (faqat backend'ning ichki kirish-usuli va Ona provisioning mantig'i uchun ishlatiladi) — ilova UI tanlovini hech qachon shu maydonga emas, `role`ga asoslab quring.

## Bu branch qanday yangilanadi

Bu branch **orphan** (asosiy kod bilan umumiy tarixi yo'q) va vaqti-vaqti bilan **qayta yoziladi** (force-push) — ko'p yillik tarix emas, har safar to'liq holatni aks ettiruvchi oz sonli commit saqlanadi. Shuning uchun oddiy `git pull` o'rniga:

```bash
git fetch origin api-docs
git reset --hard origin/api-docs
```

buyrug'idan foydalaning (yoki shunchaki har safar branch'ni qayta clone qiling).
