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

## Telegram Qarz Bildirishnomalari (Telegram Debt Alerts)

Restoran sozlamalarida `telegram_bot_token` hamda `telegram_chat_id` o'rnatilganda, bot faqat **Qarz jarayonlari (Nasiya)** bo'yicha bildirishnoma yuboradi:

1. **Yangi Qarz (Nasiya yopilganda):**
   - Buyurtma mijozga qarzga yopilganda (`POST /api/orders/{id}/close-on-credit/`), Telegram guruhga `Mijoz nomi`, `Telefon raqami`, `Qarz summasi`, `Jami qarzi`, `Buyurtma #`, hamda `Kassir` ko'rsatilgan bildirishnoma boradi.
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
