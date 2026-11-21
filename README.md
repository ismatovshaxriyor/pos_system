# POS Mobile App API Reference (`local_server`)

Ushbu hujjat Flutter mobil xodimlar ilovasi (Ofitsiant / Kassir / Menejer) uchun `local_server` API moslamalarini o'z ichiga oladi.

## Restoran Sozlamalari (Restaurant Config API)

### 1. Restoran sozlamalarini olish
- **Endpoint:** `GET /api/restaurant-config/` (yoki `GET /api/restaurant-config/1/`)
- **Ruxsat:** Barcha tizimga kirgan xodimlar (`IsAuthenticated`)
- **Maydonlar:**
  - `name`: Restoran nomi (masalan `"Rayhon"`)
  - `logo`: Restoran logotipi rasmi URL manzili
  - `service_charge_rate`: Restoran xizmat haqi foizi (masalan `10.00` = 10%)
  - `telegram_bot_token`: Telegram bot tokeni (BotFather'dan olinadi)
  - `telegram_chat_id`: Telegram admin/guruh chat ID'si
  - `public_domain`: Mijozlar stoldagi QR kodni skanerlaganda o'tadigan domen
  - `phone`: Restoran telefon raqami - to'lov chekining pastida ko'rsatiladi (masalan `"+998901234567"`)
  - `latitude` / `longitude`: Restoran koordinatalari
  - `attendance_radius`: Davomat radiusi (metrlarda)
  - `restore_stock_on_cancel`: Ombor qoidasi (boolean, standart `false`). `true` bo'lsa, buyurtma bekor qilinganda (`POST /api/orders/<id>/cancel/`) oshxonaga yuborilgan taomlar uchun sarflangan ingredientlar omborga qaytariladi va `StockMovement` ro'yxatida `movement_type = "return"` ("Qaytarish") yozuvi paydo bo'ladi. Faqat menejer/admin o'zgartiradi.

### 2. Restoran sozlamalarini yangilash
- **Endpoint:** `PUT /api/restaurant-config/1/` yoki `PATCH /api/restaurant-config/1/`
- **Ruxsat:** Faqat Admin va Menejerlar (`IsManagerOrAdmin`)
- **Vazifasi:** Restoran nomi, logotipi, xizmat haqi foizi (`service_charge_rate`), hamda Telegram bot token/chat_id larini tahrirlash.

### 3. Telegram Bot Ulanishini Tekshirish (Test)
- **Endpoint:** `POST /api/restaurant-config/test-telegram/`
- **Ruxsat:** Faqat Admin va Menejerlar (`IsManagerOrAdmin`)
- **Vazifasi:** Kiritilgan `telegram_bot_token` va `telegram_chat_id` orqali Telegram guruh/chatga sinov xabarini yuboradi.
- **Body (Ixtiyoriy):**
```json
{
  "telegram_bot_token": "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ",
  "telegram_chat_id": "-100123456789"
}
```
- **Javob (200 OK):**
```json
{
  "status": "Telegram test message sent successfully"
}
```

---

## Qarz Daftar (Debt Ledger API) - Sanalar

Har bir qarz yozuvida (`DebtTransaction`, faqat `credit_sale` turida) endi ikkita sana bor: **qachon OLINDI** va **qachon QAYTARILISHI KERAK**.

### 1. Buyurtmani qarzga (nasiyaga) yopish - muddat bilan
- **Endpoint:** `POST /api/orders/{id}/close-on-credit/`
- **Ruxsat:** Kassir yoki Menejer (`IsCashierOrManager`)
- **Body:**
```json
{
  "customer_id": 7,
  "due_date": "2026-08-15"
}
```
  - `due_date` - **ixtiyoriy**, `YYYY-MM-DD` formatida. Kiritilmasa yoki `null` yuborilsa - qarz muddatsiz hisoblanadi.
- **Javob (200 OK):** Yopilgan `Order` obyekti (avvalgidek).

### 2. Qarz yozuvi maydonlari (`DebtTransactionSerializer`)
`GET /api/customers/{id}/transactions/` (yoki qarz tarixi ko'rsatiladigan boshqa joylar) endi quyidagi ikkala sanani ham qaytaradi:
```json
{
  "id": 55,
  "customer": 7,
  "amount": "45000.00",
  "txn_type": "credit_sale",
  "order": 128,
  "method": "",
  "note": "",
  "due_date": "2026-08-15",
  "created_by": { "id": 3, "first_name": "Kamila", "...": "..." },
  "created_at": "2026-07-31T14:20:00Z"
}
```
- **`created_at`** - qarz **QACHON OLINDI** (avvaldan bor edi).
- **`due_date`** - qarz **QACHON QAYTARILISHI KERAK** (yangi, faqat `credit_sale` uchun ma'noli; `repayment`/`adjustment` yozuvlarida doim `null`).
- Hozircha `due_date`ni keyinchalik o'zgartirish/uzaytirish uchun alohida API yo'q - faqat `close-on-credit` paytida bir marta kiritiladi (admin panel orqali qo'lda tuzatish mumkin).

---

## Telegram Qarz Bildirishnomalari (Telegram Debt Alerts)

Restoran sozlamalarida `telegram_bot_token` hamda `telegram_chat_id` o'rnatilganda, bot faqat **Qarz jarayonlari (Nasiya)** bo'yicha bildirishnoma yuboradi:

1. **Yangi Qarz (Nasiya yopilganda):**
   - Buyurtma mijozga qarzga yopilganda (`POST /api/orders/{id}/close-on-credit/`), Telegram guruhga `Mijoz nomi`, `Telefon raqami`, `Qarz summasi`, `Jami qarzi`, **`Qaytarish muddati`** (kiritilmagan bo'lsa "Kiritilmagan"), `Buyurtma #`, hamda `Kassir` ko'rsatilgan bildirishnoma boradi.
2. **Qarz Qaytarilganda (To'langanda):**
   - Qarz daftardan mijoz qarzni to'laganda (`POST /api/customers/{id}/repay/`), Telegram guruhga `Mijoz nomi`, `Telefon raqami`, `To'langan summa`, `Qolgan qarzi`, hamda `Kassir` ko'rsatilgan bildirishnoma boradi.

---

## Buyurtmalar (Orders API)

### 1. Xizmat haqi (Service Charge) hisoblanishi
- Buyurtmadagi `service_charge` maydoni admin/menejer o'rnatgan `RestaurantConfig.service_charge_rate` foizidan kelib chiqib avtomatik hisoblanadi.

### 2. Pre-bill (Hisob-chek / Shot) chop etish
- **Endpoint:** `POST /api/orders/{id}/print-pre-bill/`
- **Ruxsat:** Xodimlar (Ofitsiant, Kassir, Menejer)
- **Maqsadi:** Mehmon to'lov qilishidan oldin hisobini tekshirishi uchun kassa printeridan Hisob-chek (Pre-bill) chiqaradi.
- **Javob (200 OK):**
```json
{
  "status": "Pre-bill printed successfully",
  "job_id": 42
}
```

### 3. To'lov Cheki (Receipt) chop etish / Qayta chop etish
- **Endpoint:** `POST /api/orders/{id}/print-receipt/`
- **Ruxsat:** Xodimlar (Kassir, Menejer, Ofitsiant)
- **Maqsadi:** Buyurtma to'langandan so'ng kassa printeridan To'lov chekini qo'lda qayta chiqarish (Avtomatik tarzda `close` yoki `close-on-credit` so'rovlarida o'zi chiqariladi).
- **Javob (200 OK):**
```json
{
  "status": "Receipt printed successfully",
  "job_id": 43
}
```

### 4. Avtomatik To'lov Cheki
`POST /api/orders/{id}/close/` yoki `POST /api/orders/{id}/close-on-credit/` endpointlari chaqirilib buyurtma yopilganda, tizim avtomatik ravishda kassa printeriga to'lov chekini chop etish topshirig'ini yuboradi.

### 5. To'lov usullari ro'yxatida "Qarz"
`close-on-credit` orqali qarzga yopilgan (yoki qisman naqd + qolgani qarzga yozilgan) buyurtmalarda, chop etilgan to'lov chekining (`PrintJob.items_snapshot.payments`, `GET /api/print-jobs/{id}/` orqali ham ko'rinadi) ro'yxatiga endi haqiqiy `Payment` qatorlari (Cash/Card) bilan bir qatorda **sun'iy "Qarz" yozuvi** ham qo'shiladi:
```json
{
  "payments": [
    { "method": "cash", "method_display": "Cash", "amount": 10000.0 },
    { "method": "debt", "method_display": "Qarz", "amount": 20000.0 }
  ]
}
```
- `method: "debt"` haqiqiy `Payment.METHOD_CHOICES`da yo'q - faqat shu snapshot ichida, chekda/UI'da qarz qismini alohida ko'rsatish uchun qo'shiladi. Bazada bu summaga mos alohida `Payment` qatori yaratilmaydi (u hali ham faqat `DebtTransaction`da).
- Chekdagi "Xizmat haqi" yorlig'i endi **"Xizmat foizi"** deb yoziladi (`(X%):` formati saqlangan), va har bir chek (pre-bill ham, to'lov cheki ham) oxirida **"Powered by hamrohpos.uz"** qatori chiqadi.

### 6. Stolsiz (Olib ketish / Yetkazib berish) buyurtmalar chekda
`PrintJob.items_snapshot`da (pre-bill va to'lov cheki uchun) `table_name` endi stol biriktirilmagan buyurtmalarda `"Takeaway"` emas, **`null`** bo'lib keladi, va yangi `order_type` maydoni (`Order.order_type` bilan bir xil: `dine_in`/`takeaway`/`delivery`) qo'shildi:
```json
{
  "table_name": null,
  "order_type": "takeaway"
}
```
- Chekning o'zida (chop etilgan qog'ozda) bu holatda "Stol: Takeaway" kabi noqulay yozuv o'rniga **"Olib ketish"** (yoki `delivery` uchun **"Yetkazib berish"**) chiqadi - stol yozuvi umuman ko'rinmaydi.
- Stol biriktirilgan buyurtmalarda hech narsa o'zgarmagan - `table_name` avvalgidek haqiqiy stol nomi.
- Oshxona cheki (kitchen ticket - bu `items_snapshot`ga emas, to'g'ridan-to'g'ri chop etish vaqtida generatsiya qilinadi, API orqali ko'rinmaydi) sarlavha qatorlari (Buyurtma #/vaqt, Stol/Ofitsiant) endi biroz kattaroq shriftda (2x balandlik) chiqadi - o'qishni osonlashtirish uchun.

### 7. Chek ko'rinishi yangilandi (ustunli jadval, ikkita sana, QR kod)
`PrintJob.items_snapshot` (`GET /api/print-jobs/{id}/` orqali ko'rinadi, pre-bill va to'lov cheki ikkalasida ham) endi qo'shimcha maydonlar bilan keladi:
```json
{
  "table_name": "5 (Ko'cha)",
  "order_created_at": "2026-07-31T16:51:00+00:00",
  "phone": "+998901234567"
}
```
- **`table_name` endi stol hududi (`TableZone`) bilan birga keladi** - avval faqat `"5"` bo'lsa, endi `"5 (Ko'cha)"` (`str(Table)` bilan bir xil format). Zona biriktirilmagan stolda o'zgarish yo'q (faqat `"5"`).
- **`order_created_at`** (yangi maydon, ISO 8601) - buyurtma ochilgan vaqt (`Order.created_at`). Chekning o'zida "Ochilgan:" qatorida ko'rinadi, mavjud `created_at`/chek chiqarilgan vaqt esa pre-bill'da "Chek vaqti:", to'lov chekida "Yopilgan:" sifatida - ya'ni endi chekda **ikkita sana** bor.
- **`phone`** (faqat to'lov chekida, ya'ni `job_type == "receipt"`; pre-bill'da yo'q) - `RestaurantConfig.phone`dan olinadi. Bo'sh/`null` bo'lishi mumkin (restoran sozlamasa) - bu holda chekda "Tel:" qatori umuman chiqmaydi.
- Chekdagi taomlar ro'yxati endi ustunli jadval ko'rinishida (`Nomi | Soni | Narxi | Jami`, sarlavha qatori bilan) chiqadi - avvalgi ikki qatorli (`qty x nom` + narx pastki qatorda) format o'rniga.
- To'lov chekining pastida (mavjud bo'lsa) `Tel: <phone>` qatori, so'ng "Xaridingiz uchun rahmat!" xabari, so'ng doim **`https://hamrohpos.uz/`ga yo'naltiruvchi QR kod** chop etiladi (printerning o'zi generatsiya qiladi, `items_snapshot`da alohida maydon sifatida kelmaydi). **Diqqat:** bu restoranning o'z sayti (`RestaurantConfig.public_domain`) EMAS - u faqat stol QR-menyusi (`build_table_qr_url`) uchun ishlatiladi; chekdagi QR har doim hamrohpos.uz'ning o'ziga (BRAND_FOOTER "Powered by hamrohpos.uz" bilan bir xil qattiq belgilangan brend havolasi) o'tadi.

---

## Davomat (Attendance API)

Mavjud: `GET /api/attendance/` (ro'yxat, `?date=`, menejer uchun `?user=`), `POST /api/attendance/check-in/` va `POST /api/attendance/check-out/` (tanani `{"latitude": ..., "longitude": ...}`, restoran radiusi ichida bo'lish shart). Quyidagilar smena UI uchun qo'shilgan:

### 1. O'zimning smenam holati
`GET /api/attendance/me/` - istalgan xodim.

```json
{ "on_shift": true, "attendance": { "id": 12, "user": { ... }, "check_in": "2026-11-20T08:02:11Z", "check_out": null, ... } }
```
Smenada bo'lmasa: `{ "on_shift": false, "attendance": null }`. Kassa yopilganda server hamma smenani o'zi tugatadi - ilova shu endpoint'ni vaqti-vaqti bilan (~30 s) so'rab tursin.

### 2. Hozir smenada turganlar
`GET /api/attendance/on-shift/` - **kassir yoki menejer**. Ochiq (`check_out = null`) yozuvlar, `check_in` bo'yicha o'sish tartibida (massiv).

### 3. Davr bo'yicha xulosa
`GET /api/attendance/summary/?from=YYYY-MM-DD&to=YYYY-MM-DD` - **faqat menejer/admin** (standart: oxirgi 7 kun).

```json
{
  "from": "2026-11-14", "to": "2026-11-20",
  "staff": [ { "user": { ... }, "shifts": 5, "days": 5, "minutes": 2340, "on_shift": true } ]
}
```
`minutes` bo'yicha kamayish tartibida. Hali tugamagan smena "hozirgacha" hisoblanadi, lekin eng ko'pi bilan 16 soat (unutilgan check-out kunlab hisoblanmasligi uchun).

## Kassa Sessiyasi (Register Open/Close API)

Bugungi savdoni **to'liq yopish/ochish** uchun - `Attendance` (xodimning shaxsiy check-in/check-out) dan farqli, butun restoran uchun umumiy holat.

### 1. Kassa holatini olish
- **Endpoint:** `GET /api/register-session/1/`
- **Ruxsat:** Barcha tizimga kirgan xodimlar (`IsAuthenticated`)
- **Izoh:** Restoranda hali hech kim kassani yopmagan/ochmagan bo'lsa ham bu so'rov ishlaydi - qator avtomatik yaratiladi, `is_open: true` (default).
- **Javob (200 OK):**
```json
{
  "id": 1,
  "is_open": true,
  "opened_at": "2026-07-31T05:00:00Z",
  "opened_by": 3,
  "opened_by_name": "Aziz",
  "closed_at": null,
  "closed_by": null,
  "closed_by_name": null
}
```

### 2. Kassani yopish (bugungi savdoni tugatish)
- **Endpoint:** `POST /api/register-session/close/`
- **Ruxsat:** Kassir yoki Menejer (`IsCashierOrManager`) - **Ofitsiant qila olmaydi** (`403`)
- **Vazifasi:**
  - `is_open`ni `false`ga o'zgartiradi. Shu daqiqadan boshlab `POST /api/orders/` (yangi buyurtma yaratish) `400` bilan rad etiladi - "Kassa yopiq - yangi buyurtma qabul qilib bo'lmaydi." (oflayn-retry uchun ilgari yaratilgan buyurtmani qayta so'rash, ya'ni bir xil `sync_uuid` bilan qayta yuborish, bunga kirmaydi - u baribir muvaffaqiyatli qaytadi).
  - **Hozir ochiq (check-out qilinmagan) barcha xodimlarning davomatini avtomatik yopadi** - kim yopganidan qat'iy nazar, hammasi, o'zi ham.
  - Barcha ulangan mobil ilovalarga WebSocket orqali `register_closed` eventi yuboriladi.
  - Buyurtma yaratishdan tashqari boshqa hech narsa bloklanmaydi - kassa yopilishidan oldin ochiq qolgan stollarni yakunlash (to'lov qabul qilish, yopish) baribir mumkin.
- **Javob (200 OK):**
```json
{
  "id": 1,
  "is_open": false,
  "opened_at": "2026-07-31T05:00:00Z",
  "opened_by": 3,
  "opened_by_name": "Aziz",
  "closed_at": "2026-07-31T18:00:00Z",
  "closed_by": 2,
  "closed_by_name": "Kamila",
  "checked_out_count": 4
}
```
- **Xato (400):** Kassa allaqachon yopiq bo'lsa - `{"detail": "Kassa allaqachon yopiq."}`

### 3. Kassani ochish (majburiy qayta ochish / yangi kun boshlanishi)
- **Endpoint:** `POST /api/register-session/open/`
- **Ruxsat:** Kassir yoki Menejer (`IsCashierOrManager`) - **Ofitsiant qila olmaydi** (`403`)
- **Vazifasi:** `is_open`ni `true`ga qaytaradi (yangi buyurtma qabul qilish yana ochiladi).
  - **Kassir** ochsa: barcha menejerlarga `Notification` (`notif_type: "register_opened_by_cashier"`) + WS orqali bildirishnoma boradi - bu nazorat talab qiladigan istisno holat hisoblanadi.
  - **Menejer/admin** ochsa: hech qanday bildirishnoma yuborilmaydi - bu kunlik oddiy oqim.
- **Javob (200 OK):** Yuqoridagi kabi struktura, `is_open: true`, `checked_out_count` maydonisiz.
- **Xato (400):** Kassa allaqachon ochiq bo'lsa - `{"detail": "Kassa allaqachon ochiq."}`

### 4. WebSocket Eventlari (`ws/events/`)
- `register_closed`: `{"closed_by": <user_id yoki null>, "checked_out_count": <int>}`
- `register_opened`: `{"opened_by": <user_id yoki null>, "notified_managers": <bool>}`

### 5. Ilova Tomonidagi Kutilgan Xatti-Harakat (MUHIM)
- **Kassa yopilganda:** Server barcha xodimlarning davomatini avtomatik yopadi. Ilova `register_closed` WS eventini olganda (yoki keyingi so'rovda `GET /api/attendance/` ro'yxatidagi o'zining eng so'nggi yozuvi endi `check_out != null` ekanini ko'rganda) foydalanuvchini **darhol Davomat (Check-in) ekraniga qaytarishi shart** - xuddi ilova birinchi marta ochilganda ko'rsatiladigan "ishga keldingizmi" tekshiruv ekrani kabi. Login/token o'zgarmaydi - faqat ekran holati.
- **Kassa ochilganda:** Xodim odatdagidek `POST /api/attendance/check-in/` orqali ishga kelganini tasdiqlaydi (koordinata + radius tekshiruvi bilan, mavjud oqim o'zgarmagan) va shundan so'ng POS ekranlariga o'tib ishlashni davom ettiradi.
- **Ilova ishga tushganda (cold start):** `GET /api/bootstrap/` javobiga qo'shilgan yangi `register_open` (bool) maydonidan foydalanib, kassa holatini alohida so'rovsiz bilib olish mumkin.

---

## Masofadan (Restoran WiFi'sidan Tashqarida) Ulanish

Har bir restoranning o'z Bola'si endi restoranning ochiq domenida (`https://<restoran-subdomeni>.hamrohpos.uz` - `RestaurantConfig.public_domain`dagi domen) ham to'liq ochiq - avval bu manzil faqat mijozga ko'rinadigan QR-menyu sahifasi (`/table/<qr_code>/`) uchun ishlatilgan, endi shu domen orqali **to'liq xodimlar API'si** va **real-vaqt WebSocket kanali** ham ishlaydi.

- **REST API:** ilova bazaviy URL sifatida `https://<subdomen>.hamrohpos.uz` ni ishlatishi mumkin - `/api/...` yo'li mahalliy WiFi'dagi bilan (masalan `http://192.168.1.50:8000` yoki mDNS orqali topilgan manzil) **bir xil ishlaydi**, faqat domen farqlanadi. Autentifikatsiya (`Token` + `X-Device-ID`) va ruxsatlar (kim nima qila oladi) tarmoq yo'liga bog'liq emas - WiFi'da ham, onlaynda ham bir xil.
- **WebSocket:** `wss://<subdomen>.hamrohpos.uz/ws/events/?token=...&device_id=...` - xuddi mahalliy `ws://.../ws/events/...` bilan bir xil protokol/eventlar, faqat manzil.
- **Muhim:** bu cheklov ilova darajasida, backend darajasida emas - qaysi ilova shu domenga murojaat qilsa (admin, kassir, ofitsiant ilovasi), o'shanga ishlaydi. Agar faqat ma'lum bir ilova (masalan admin) WiFi'dan tashqarida ham ishlashi kerak bo'lsa, buni o'sha ilovaning tarmoq qatlamida hal qilish kerak (masalan: avval mahalliy manzilni sinab ko'rish, muvaffaqiyatsiz bo'lsa shu domenga fallback qilish).
- Bu funksiya faqat restoranning `website` konteyneri ishga tushirilgan va Cloudflare Tunnel ingress qoidasi (`<subdomen>.hamrohpos.uz` → `http://website:80`) shu restoran uchun sozlangan bo'lsa ishlaydi - har bir restoran uchun alohida, avtomatlashtirilmagan.

## Ilova yangilanishi (App Update API)

Xodim ilovalari (Kassir/Ofitsiant/Menejer) o'zining yangi versiyasini **faqat Bola'dan** oladi. Ikkala endpoint ham avtorizatsiyasiz (login'dan oldin ham ishlaydi) va litsenziya blokidan tashqarida, shuning uchun majburiy yangilanish bloklangan tizimda ham yetib boradi.

### 1. Yangi versiya bormi?
- **Endpoint:** `GET /api/license/app-updates/?slugs=kassir&platform=windows&current=1.0.0`
- **Query:**
  - `slugs`: vergul bilan ajratilgan ilova nomlari (Ona'dagi `MobileApp.slug`): kassir ilovasi `kassir`, mobil ilova `ofitsiant,manager`
  - `platform`: `android` yoki `windows`
  - `current`: ilovaning hozirgi versiyasi (masalan `1.0.0`)
- **Javob (200 OK):**
```json
{
  "available": true,
  "required": false,
  "latest": {
    "slug": "kassir",
    "version": "1.2.0",
    "size_mb": "84.3",
    "sha256": "4bb547ff...",
    "notes": ["Chegirma tuzatildi"],
    "download_url": "/api/license/app-updates/1/download/"
  }
}
```
Yangilanish bo'lmasa: `{"available": false, "required": false, "latest": null}`. Faqat Bola'ga to'liq yuklab olingan versiyalar e'lon qilinadi. `required: true` — eski versiya ishlashi mumkin emas (bloklovchi ekran), aks holda ixtiyoriy eslatma.

### 2. O'rnatuvchini yuklab olish
- **Endpoint:** `GET /api/license/app-updates/<id>/download/` (`download_url` ni server manziliga qo'shing)
- **Javob:** fayl (`attachment`); tayyor bo'lmasa `404`. Yuklangach `sha256` ni solishtiring.

## Hisobotlar (Reports API)

Barchasi `GET`, **faqat menejer** (boshqalarga `403`), pul qiymatlari `"50000.00"` ko'rinishidagi satr. Tushum doim `Payment.amount` yig'indisi (bekor qilingan to'lovlarsiz). Kun chegarasi `Asia/Tashkent` bo'yicha. Sana: `YYYY-MM-DD` yoki `today`.

- `GET /api/reports/dashboard/?date=` — bir kunlik bosh panel:
  `revenue{total, by_method{cash,card,other}, order_count, avg_check, discount_total, cancelled_orders}`, `voids{voided_items, voided_payments, voided_payments_total}`, `floor{occupied_tables, open_orders, active_staff}`, `debts{total_outstanding, debtor_count}`, `inventory{low_stock_count, total_value}`, `top_products[{name, quantity, revenue}]` (10 tagacha), `hourly_revenue[{hour:"HH:00", revenue}]`.
- `GET /api/reports/sales/?from=&to=&group_by=day|waiter|product|category` — davr tahlili (`from`/`to` berilmasa bugun): `from`, `to`, `total_revenue`, `by_method`, `order_count`, `avg_check`, `discount_total`, `cancelled_orders`, `rows[{key, revenue, quantity?, payment_count?, waiter_id?}]`. Noto'g'ri `group_by` → `400`.
- `GET /api/reports/staff/?date=` yoki `?from=&to=` — `waiters[{waiter_id, waiter_name, revenue, payment_count, completed_orders}]`, `clocked_in[{user_id, name, role, check_in}]`, `from`, `to`.
- `GET /api/reports/debts/` — `total_outstanding`, `debtor_count`, `top_debtors[{id, name, phone, balance}]` (50 tagacha), `credit_sales_today`, `repayments_today`.
- `GET /api/reports/inventory/` — `ingredient_count`, `total_value`, `low_stock_count`, `low_stock[{id, name, unit, current_stock, min_stock}]`, `consumed_units_today`, `purchased_cost_today`.
- `GET /api/reports/day-end/` — **kassir yoki menejer** (afitsiant `403`), faqat bugun (sana parametri yo'q). Kassir ilovasidagi "Kun yakuni": `date`, `generated_at`, `register{is_open, opened_at, closed_at}` (kassa sessiyasi yo'q bo'lsa `is_open: true`), `revenue{total, by_method{cash,card,other}, payment_count, order_count, avg_check, discount_total}`, `cash{sales, debt_repayments, expected}` (`expected` = naqd savdo + naqd qaytarilgan qarz — kassa tortmasida bo'lishi kerak pul), `debts{credit_sales, repayments}`, `voids{cancelled_orders, voided_items, voided_payments, voided_payments_total}`, `open_orders{count, items[{id, table, waiter, total, created_at}]}` (hali yopilmagan buyurtmalar, 20 tagacha).
- `GET /api/reports/my-summary/?date=&waiter=` — har qanday xodim o'zining kunlik jamlanmasi; `waiter` (boshqa xodim) faqat menejer uchun.

## Buyurtma shablonlari (Order Templates API)

Ko'p takrorlanadigan buyurtma ("Osh + salat + choy") — menejer yaratadi, ofitsiant ilovada bir bosishda **hali tasdiqlanmagan qoralamaga (savatga)** qo'shadi, keyin miqdor/izohni o'zgartiradi, taom qo'shadi yoki almashtiradi. Shablon o'zi buyurtma yaratmaydi va oshxonaga chek chiqarmaydi.

- **Ofitsiant/kassir uchun:** `GET /api/bootstrap/` javobida `order_templates` — faqat **faol** shablonlar, `sort_order` bo'yicha: `[{id, name, sort_order, is_active, items[{id, product_id, quantity, note}], created_at, updated_at}]`. Menyudan o'chirilgan (soft-delete) mahsulotlar qatori kelmaydi; mahsulot `products` ro'yxatida bo'lmasa (sotuvda emas) klient shu qatorni o'tkazib yuboradi. Eski server bu kalitni yubormaydi — `order_templates ?? []`.
- `GET /api/order-templates/` — barcha shablonlar (faol emaslari ham), har qanday xodim o'qiy oladi (sahifalangan: `results`).
- `POST /api/order-templates/` — **faqat menejer** (boshqalarga `403`). Body: `{"name": "Standart", "sort_order": 1, "is_active": true, "items": [{"product_id": 5, "quantity": 1, "note": ""}, ...]}`. `201` + shablon.
- `PATCH|PUT /api/order-templates/<id>/` — **faqat menejer**. `items` yuborilsa taomlar **to'liq almashtiriladi**; yuborilmasa o'zgarmaydi.
- `DELETE /api/order-templates/<id>/` — **faqat menejer**, `204`. Buyurtmalarga ta'sir qilmaydi.
- Tekshiruvlar (`400`): `name` bo'sh; `items` bo'sh yoki 30 tadan ko'p; `quantity` 1–99 dan tashqari; `note` 100 belgidan uzun; mahsulot yo'q yoki menyudan o'chirilgan. Bir xil `product_id` + `note` takrorlansa miqdorlari qo'shiladi.
- Realtime: o'zgarganda `menu_changed` (bootstrap'ni qayta so'rang).
- Klientda qoida: shablon bosilganda taomlar savatga **qo'shiladi** (mavjud miqdorga ustiga); buyurtma serverga faqat ofitsiant tasdiqlagandan keyin yuboriladi (`POST /api/orders/` → `add_item` → `start`).
