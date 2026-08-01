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
  - `public_domain`: Mijozlar stoldagi QR kodni skanerlaganda o'tadigan domen (to'lov chekidagi QR kod ham shu domenga - qarang pastda "To'lov chekidagi QR kod")
  - `phone`: Restoran telefon raqami - to'lov chekining pastida ko'rsatiladi (masalan `"+998901234567"`)
  - `latitude` / `longitude`: Restoran koordinatalari
  - `attendance_radius`: Davomat radiusi (metrlarda)

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
  "phone": "+998901234567",
  "website_url": "https://filial1.hamrohpos.uz/"
}
```
- **`table_name` endi stol hududi (`TableZone`) bilan birga keladi** - avval faqat `"5"` bo'lsa, endi `"5 (Ko'cha)"` (`str(Table)` bilan bir xil format). Zona biriktirilmagan stolda o'zgarish yo'q (faqat `"5"`).
- **`order_created_at`** (yangi maydon, ISO 8601) - buyurtma ochilgan vaqt (`Order.created_at`). Chekning o'zida "Ochilgan:" qatorida ko'rinadi, mavjud `created_at`/chek chiqarilgan vaqt esa pre-bill'da "Chek vaqti:", to'lov chekida "Yopilgan:" sifatida - ya'ni endi chekda **ikkita sana** bor.
- **`phone`** va **`website_url`** (ikkalasi ham faqat to'lov chekida, ya'ni `job_type == "receipt"`; pre-bill'da yo'q) - `RestaurantConfig.phone` va `public_domain`dan olinadi. Ikkalasi ham bo'sh/`null` bo'lishi mumkin (restoran sozlamasa) - bu holda chekda tegishli qator/QR kod umuman chiqmaydi.
- Chekdagi taomlar ro'yxati endi ustunli jadval ko'rinishida (`Nomi | Soni | Narxi | Jami`, sarlavha qatori bilan) chiqadi - avvalgi ikki qatorli (`qty x nom` + narx pastki qatorda) format o'rniga.
- To'lov chekining pastida (mavjud bo'lsa) `Tel: <phone>` qatori, so'ng "Xaridingiz uchun rahmat!" xabari, so'ng `website_url`ga yo'naltiruvchi **QR kod** chop etiladi (printerning o'zi generatsiya qiladi - qo'shimcha rasm/URL API orqali kelmaydi, faqat `website_url` matn maydoni).

---

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
