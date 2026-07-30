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
