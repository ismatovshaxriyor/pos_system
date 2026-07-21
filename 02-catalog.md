# Kategoriya, mahsulot, stollar

Standart DRF `ModelViewSet`lar — `GET`/`POST`/`PUT`/`PATCH`/`DELETE` barchasi `/api/{resource}/` va `/api/{resource}/{id}/` orqali.

## Ruxsatlar (umumiy qoida)

| Amal | Kim qila oladi |
|---|---|
| O'qish (`GET`) | Har qanday autentifikatsiyalangan xodim (admin/menejer/kassir/ofitsiant) |
| Yozish (`POST`/`PATCH`/`PUT`/`DELETE`) | Faqat admin yoki menejer (`role=manager`) |

Ofitsiant/kassir yozishga urinsa — `403 {"detail": "You do not have permission to perform this action."}`.

**Muhim**: menejer (admin emas) narxni o'zgartirsa, bu avtomatik ravishda adminga bildirishnoma yuboradi — qarang [`04-devices-and-notifications.md`](04-devices-and-notifications.md).

---

## Kategoriya — `/api/categories/`

### Maydonlar

| Maydon | Turi | O'qish/Yozish | Izoh |
|---|---|---|---|
| `id` | int | o'qish | |
| `name` | string | **majburiy** | |
| `image` | fayl URL yoki `null` | yozish (`multipart/form-data`) | pastga qarang |
| `printer` | nested obyekt (`{id, name, ip_address, port}`) yoki `null` | **faqat o'qish** | Ushbu kategoriyaga tegishli ovqatlar buyurtma qilinganda chek chiqadigan printer |
| `printer_id` | int yoki `null` | **faqat yozish** | Printerni bog'lash uchun ID (ixtiyoriy) |
| `sync_uuid`, `is_synced`, `created_at`, `updated_at` | — | o'qish | ichki/sync maydonlari, e'tibor bermang |

### Yaratish

```
POST /api/categories/
Content-Type: application/json

{"name": "Ichimliklar"}
```

**Javob (201):**
```json
{
  "id": 1, "sync_uuid": "...", "is_synced": false,
  "created_at": "...", "updated_at": "...",
  "name": "Ichimliklar", "image": null
}
```

### Rasm bilan yaratish/yangilash

`image` maydoni faqat `multipart/form-data` orqali yuboriladi (JSON emas):

```
POST /api/categories/
Content-Type: multipart/form-data

name: Ichimliklar
image: <fayl>
```

Flutter'da `dio` bilan:
```dart
final formData = FormData.fromMap({
  'name': 'Ichimliklar',
  'image': await MultipartFile.fromFile(imagePath, filename: 'category.jpg'),
});
await dio.post('/api/categories/', data: formData);
```

---

## Mahsulot — `/api/products/`

### Maydonlar

| Maydon | Turi | O'qish/Yozish | Izoh |
|---|---|---|---|
| `id` | int | o'qish | |
| `category` | nested obyekt (`{id, name, ...}`) | **faqat o'qish** | javobda to'liq kategoriya obyekti keladi |
| `category_id` | int | **faqat yozish** | yaratish/yangilashda shu ishlatiladi (pastga qarang) |
| `name` | string | majburiy | |
| `price` | string (Decimal) | majburiy | masalan `"5000.00"` — pastga qarang |
| `barcode` | string yoki `null` | ixtiyoriy | |
| `image` | fayl URL yoki `null` | yozish (`multipart/form-data`) | |
| `is_available` | bool | ixtiyoriy (default `true`) | menyuda ko'rinish/ko'rinmasligi |
| `cost_price` | string (Decimal) | ixtiyoriy (default `"0.00"`) | tannarx — foyda hisoboti uchun; oddiy xodim ilovalarida ko'rsatmaslik tavsiya etiladi |
| `tax_rate` | string (Decimal) | ixtiyoriy (default `"0.00"`) | foizda (masalan `"12.00"`) — hozircha hisob-kitobga ulanmagan, kelajak uchun |
| `is_deleted` | bool | **faqat o'qish** | soft-delete bayrog'i — pastga qarang; API javoblarida amalda doim `false` (o'chirilganlar umuman qaytmaydi) |

### O'qish javobi

```json
{
  "id": 3,
  "category": {"id": 1, "name": "Ichimliklar", "image": null, "...": "..."},
  "sync_uuid": "...", "is_synced": false, "created_at": "...", "updated_at": "...",
  "name": "Choy",
  "price": "5000.00",
  "barcode": null,
  "image": null,
  "is_available": true
}
```

### Yaratish/yangilash so'rovi

`category` YOZIB bo'lmaydi (u faqat o'qish uchun, javobda to'liq obyekt qaytarish maqsadida) — **`category_id`** ishlatiladi:

```
POST /api/products/
Content-Type: application/json

{"category_id": 1, "name": "Choy", "price": "5000.00"}
```

Narxni o'zgartirish (menejer/admin):
```
PATCH /api/products/3/
Content-Type: application/json

{"price": "6000.00"}
```

### Mahsulotni o'chirish — endi SOFT-DELETE

```
DELETE /api/products/3/
```

**Javob (204)** — lekin qator bazadan o'chmaydi: `is_deleted=true` + `is_available=false` qilib belgilanadi (bir marta sotilgan mahsulotni jismonan o'chirib bo'lmaydi — eski buyurtma tarixiga bog'langan). Frontend uchun amaliy oqibatlari:

- O'chirilgan mahsulot `GET /api/products/` ro'yxatida va `GET /api/bootstrap/`da **umuman qaytmaydi** (`404` — detail so'rovlarda ham).
- Uni yangi buyurtmaga qo'shib bo'lmaydi — `add_item` `400` (`product_id` validatsiyasi) qaytaradi. Ilova menyusini eskirgan keshdan ko'rsatayotgan bo'lsa, shu `400`ni "mahsulot menyudan olib tashlangan" deb talqin qilib, menyuni yangilash kerak.
- Eski buyurtmalar ichidagi nested `product` obyektida esa ko'rinishda davom etadi (tarix buzilmaydi).
- Tiklash API orqali mumkin emas — faqat server administratori (Django admin) orqali.

### Muhim eslatmalar

- **`price` — string sifatida yuboring va o'qing** (masalan `"5000.00"`), oddiy JSON `number` sifatida emas — Decimal aniqligini yo'qotmaslik uchun. Flutter tomonda `Decimal` paketi (yoki `double.parse()`, agar aniqlik restoran narxlari uchun yetarli deb hisoblansa) bilan ishlang.
- Narxni **menejer** (admin emas) o'zgartirsa, admin ilovasiga avtomatik bildirishnoma ketadi ([`04-devices-and-notifications.md`](04-devices-and-notifications.md)) va barcha ulangan qurilmalarga WebSocket orqali `price_changed` hodisasi yuboriladi ([`05-websocket.md`](05-websocket.md)).

---

## Stol — `/api/tables/`

### Maydonlar

| Maydon | Turi | O'qish/Yozish | Izoh |
|---|---|---|---|
| `id` | int | o'qish | |
| `name` | string | majburiy | masalan `"1-stol"` |
| `capacity` | int | ixtiyoriy (default `4`) | o'rindiqlar soni |
| `is_active` | bool | ixtiyoriy (default `true`) | `false` — stol vaqtincha ishlatilmayapti (masalan ta'mirlashda) |
| `status` | string (`free`/`occupied_by_me`/`occupied`) | **faqat o'qish, hisoblanadigan** | so'rovchiga bog'liq (pastga qarang) |
| `zone` | nested obyekt (`{id, name}`) yoki `null` | **faqat o'qish** | Stol hududi obyekti |
| `zone_id` | int yoki `null` | **faqat yozish** | Hududni biriktirish uchun ID (ixtiyoriy) |

```json
{
  "id": 1,
  "name": "1-stol",
  "capacity": 4,
  "is_active": true,
  "status": "free",
  "zone": {"id": 2, "name": "Zal 1"},
  "created_at": "...",
  "updated_at": "..."
}
```

`status` — uchta mumkin bo'lgan qiymat, **so'rovchi kimligiga bog'liq** (har bir foydalanuvchi uchun boshqacha ko'rinishi mumkin, chunki bu maydon bazada saqlanmaydi — har so'rovda hisoblanadi):

| Qiymat | Ma'nosi |
|---|---|
| `free` | Stolda faol (`new`/`in_progress`) buyurtma yo'q |
| `occupied_by_me` | Stolda MENING (so'rov yuborayotgan foydalanuvchining) faol buyurtmam bor |
| `occupied` | Stolda BOSHQA xodimning faol buyurtmasi bor — kim ekani, buyurtma tafsiloti ko'rsatilmaydi |

Bu maydon **hech qachon** WebSocket orqali tayyor holda kelmaydi (chunki so'rovchiga nisbiy) — WebSocket faqat "bu stol o'zgardi, qayta so'rang" signalini beradi (qarang [`05-websocket.md`](05-websocket.md)), keyin ilova shu endpoint'ni qayta chaqirib haqiqiy holatni oladi.

Stol yaratish/yangilash (faqat admin/menejer):
```
POST /api/tables/
Content-Type: application/json

{"name": "1-stol", "capacity": 4, "zone_id": 2}
```

---

## Stol Hududi (TableZone) — `/api/table-zones/`

Stollarni hududlar bo'yicha guruhlash uchun (masalan "Zal 1", "Zal 2", "VIP", "Terrasa"). Standart CRUD endpoint'lari.

### Maydonlar
| Maydon | Turi | O'qish/Yozish | Izoh |
|---|---|---|---|
| `id` | int | o'qish | |
| `name` | string | majburiy | hudud nomi (unikal) |

### Ro'yxatni olish
```
GET /api/table-zones/
```
**Javob (200 OK):**
```json
{
  "count": 3,
  "next": null,
  "previous": null,
  "results": [
    {"id": 1, "name": "Zal 1"},
    {"id": 2, "name": "Terrasa"},
    {"id": 3, "name": "VIP"}
  ]
}
```

### Hudud yaratish (faqat admin/menejer)
```
POST /api/table-zones/
Content-Type: application/json

{"name": "Zal 2"}
```
