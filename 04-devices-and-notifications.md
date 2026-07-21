# Qurilmalar va bildirishnomalar (admin ilovasi uchun)

## Qurilmalar ro'yxati — faqat menejer

```
GET /api/devices/
Authorization: Token <admin_token>
```

**Javob (`200`) — sahifalangan** (`06-conventions-and-errors.md`dagi umumiy `{count, next, previous, results}` shakli, boshqa har qanday ro'yxat kabi — quyidagi misolda faqat `results` ko'rsatilgan):
```json
{
  "count": 9, "next": null, "previous": null,
  "results": [
    {
      "id": 1,
      "user": {"id": 4, "username": "+998901112244", "first_name": "Ali", "last_name": "Valiyev", "role": "waiter"},
      "device_id": "phone-uuid-123",
      "device_label": "Ali - Samsung A14",
      "is_active": true,
      "is_approved": true,
      "last_login_at": "2026-07-10T06:19:45Z",
      "created_at": "..."
    }
  ]
}
```

Bitta yozuv (`StaffDevice`):

| Maydon | Turi | Izoh |
|---|---|---|
| `user` | nested `User` | qurilma egasi |
| `device_id` | string | client generatsiya qilgan barqaror UUID |
| `device_label` | string | admin qurilmani tanish uchun (masalan telefon modeli) |
| `is_active` | bool | `false` — chetlashtirilgan (revoke qilingan) qurilma |
| `is_approved` | bool | `false` — **menejer tasdig'ini kutayotgan** qurilma (ofitsiantning TOFU-almashtirish urinishi, [`01-auth.md`](01-auth.md) 1–2-bo'lim). Admin ilovasi "tasdiqlash kerak" ro'yxatini shu maydon bo'yicha ajratishi kerak — `is_active=true, is_approved=false` kombinatsiyasi "kutilmoqda" holati, `is_active=true, is_approved=true` esa "faol ishlayapti" |
| `last_login_at` | datetime yoki `null` | oxirgi muvaffaqiyatli PIN kirish vaqti |

Faqat `is_active=true` bo'lganlarni ko'rsatish uchun ilova tomonda filtrlang (server tomonda filtr parametri yo'q — barcha, shu jumladan tarixiy chetlashtirilgan qurilmalar ham qaytadi, audit maqsadida). Qurilmani chetlashtirish (`POST /api/devices/{id}/revoke/`) haqida to'liq: [`01-auth.md`, 8-bo'lim](01-auth.md#8-menejer-qurilmani-chetlashtirish-masalan-telefon-yoqolganda). Yangi qurilmani tasdiqlash (`POST /api/devices/{id}/approve/`) haqida: [`01-auth.md`, 2-bo'lim](01-auth.md#2-menejer-yangi-qurilmani-tasdiqlash-approve).

---

## Bildirishnomalar

```
GET /api/notifications/
Authorization: Token <token>
```

Har bir foydalanuvchi faqat: (1) o'ziga **shaxsan** yo'naltirilgan, va (2) agar o'zi menejer (`role=manager`) bo'lsa — barcha **umumiy** (`recipient=null`) bildirishnomalarni ko'radi. Kassir/ofitsiant umumiy (menejerlarga mo'ljallangan) bildirishnomalarni ko'rmaydi. Alohida "admin" roli yo'q — barcha menejerlar bir xil ko'radi. Ro'yxat eng yangisidan eskisiga qarab tartiblangan.

**Javob (`200`) — bu ham sahifalangan** (boshqa har qanday ro'yxat kabi, `results` ichida):
```json
{
  "count": 5, "next": null, "previous": null,
  "results": [
    {
      "id": 1,
      "notif_type": "price_changed",
      "message": "Narx o'zgartirildi: Choy 5000.00 -> 6000.00 (+998901112255)",
      "payload": {
        "product_id": 3, "old_price": "5000.00", "new_price": "6000.00", "changed_by": 5
      },
      "is_read": false,
      "read_at": null,
      "created_at": "..."
    }
  ]
}
```

**O'qilmagan sonini ko'rsatish (badge)**: alohida "count" endpoint yo'q. `GET /api/notifications/` **sahifalangan** ekanini unutmang (yuqorida) — `is_read == false` bo'lganlarni sanashda faqat qo'lingizdagi (bitta yoki bir nechta so'ralgan) sahifadagilar hisobga olinadi, 50 tadan oshsa `next` orqali qolganini ham so'rash kerak bo'lishi mumkin. Amaliyotda badge uchun odatda birinchi sahifa (eng yangi 50 ta, chunki ro'yxat yangidan-eskiga tartiblangan) yetarli bo'ladi, lekin buni **kutilgan xatti-harakat sifatida hisobga oling**, tasodifiy kamchilik emas.

O'qilgan deb belgilash:
```
POST /api/notifications/{id}/mark_read/
```
**Javob:** `{"status": "ok"}`. Boshqa foydalanuvchiga tegishli bildirishnomani belgilashga urinish — `404`.

### Hozircha mavjud bildirishnoma turlari (`notif_type`)

| Tur | Qachon yuboriladi | Kimga | `payload` maydonlari |
|---|---|---|---|
| `price_changed` | Istalgan menejer mahsulot narxini o'zgartirganda (o'zgartirgan menejerga ham yuboriladi — istisno yo'q) | Barcha menejer (`recipient=null`, umumiy) | `product_id`, `old_price`, `new_price`, `changed_by` (user id) |
| `discount_applied` | Istalgan menejer buyurtmaga chegirma qo'llaganda (`POST /api/orders/{id}/set_discount/`, qarang [`03-orders.md`](03-orders.md)) | Barcha menejer (`recipient=null`, umumiy) | `order_id`, `old_discount`, `new_discount`, `changed_by` (user id) |
| `print_failed` | Jismoniy (IP'li) printerga chek barcha urinishlardan keyin ham chiqmaganda (qarang [`09-printers.md`](09-printers.md)) | Barcha menejer (`recipient=null`, umumiy) | `job_id`, `printer_id`, `order_id` |

Bu infratuzilma **qayta ishlatiladigan** qilib qurilgan — kelajakda yangi bildirishnoma turlari (masalan "yangi buyurtma", "smena tugadi" va h.k.) shu bir xil `GET /api/notifications/` orqali keladi, ilova tomonda faqat `notif_type` bo'yicha filtrlash/UI ko'rsatish kifoya, yangi endpoint kutish shart emas. Tanimagan `notif_type` qiymatlarini ilova generik ko'rinishda (`message`ni ko'rsatib) render qilishi tavsiya etiladi — kelajakda yangi tur qo'shilsa eski ilova versiyasi ham "buzilmasdan" ishlashda davom etadi.

Bildirishnomalar `GET /api/notifications/` orqali polling bilan ham, [`05-websocket.md`](05-websocket.md)dagi real-vaqt push orqali ham kelishi mumkin — ikkalasi bir xil ma'lumotni ifodalaydi (WS — tezkor bildirish uchun, `GET` — ilova yopiq bo'lgan payt o'tkazib yuborilgan bildirishnomalarni "tiklash" uchun).
