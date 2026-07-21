# Ofitsiant ilovasi — to'liq so'rov ketma-ketligi

Bu hujjat faqat **ofitsiant** roli (`role: "waiter"`) ilovasi chaqiradigan endpointlarni, ular aynan qaysi tartibda kelishi kerakligini bitta joyda jamlaydi. Har bir endpointning to'liq maydon jadvali/xatolik ro'yxati tegishli bo'limda ([`01-auth.md`](01-auth.md), [`03-orders.md`](03-orders.md), [`05-websocket.md`](05-websocket.md)) — bu yerda faqat **qaysi tartibda va nima uchun** ko'rsatilgan.

Bu — README'dagi umumiy "Tezkor boshlash" ro'yxatining ofitsiant ilovasiga tegishli qismini (admin/kassir qadamlaridan tozalab) kengaytirilgan, amaliy shaklda beradi.

---

## 0. Bir martalik: qurilmani ro'yxatdan o'tkazish

Ofitsiant ishni boshlashdan oldin, **faqat bir marta** (yoki telefon almashtirilganda):

```
POST /api/auth/device/register/
```

Bu faqat kod bilan ishga tushiriladigan rollar (masalan kassir) uchun — ofitsiant odatda buni tashlab, to'g'ridan-to'g'ri [1-qadam](#1-ilova-ochilganda--har-safar-shu-ketma-ketlik)dagi `waiter-login`ga o'tadi (TOFU, kod shart emas). To'liq maydonlar va xatoliklar: [`01-auth.md`, 6–7-bo'limlar](01-auth.md#6-menejer-kassirofitsiant-uchun-registratsiya-kodi-yaratish). `device_id`ni ilova o'zi generatsiya qilib doimiy saqlaydi (`flutter_secure_storage`) — shu qadamdan keyin kerak bo'lmaydi.

---

## 1. Ilova ochilganda — har safar shu ketma-ketlik

```
1. Lokal: saqlangan device_id bormi tekshirish
     bor bo'lsa  → 2-qadam (PIN kirish)
     yo'q bo'lsa → 0-qadamga qaytish (ro'yxatdan o'tish kodi kerak)

2. POST /api/auth/pin-login/            → token olish
3. Lokal: token va device_id ni saqlash, keyingi barcha so'rovlarga
   "Authorization: Token <token>" va "X-Device-ID: <device_id>" header'larini qo'shish
4. wss://.../ws/events/?token=<token>&device_id=<device_id> → real-vaqt kanaliga ulanish
5. GET /api/bootstrap/                  → user + categories + products
                                            + tables + active_orders
                                            BITTA so'rovda (bunda ham header'lar shart!)
```

**Nima uchun aynan shu tartib:**
- 4-qadam 5-qadamdan **oldin** — WebSocket ulanmasdan turib bootstrap qilinsa, ulanish o'rnatilayotgan bir necha soniya ichida kelgan `table_status_changed`/`order_updated` signallari o'tkazib yuborilishi mumkin (qarang [`05-websocket.md`](05-websocket.md)dagi "qayta ulanish" mantig'i — bu yerda ham xuddi shu tamoyil).
- 5-qadam (`GET /api/bootstrap/`) alohida `GET /api/tables/`, `GET /api/categories/`, `GET /api/products/`, `GET /api/orders/` so'rovlarining barchasini **almashtiradi** — ofitsiant ilovasi kunni shu bitta chaqiruv bilan boshlashi kifoya, qolganini lokal xotiradan ko'rsatadi.
- `GET /api/users/me/`ni alohida chaqirish shart emas — `bootstrap` javobida `user` allaqachon bor (u faqat token yaroqliligini tezkor tekshirish kerak bo'lgan boshqa holatlar uchun, [`01-auth.md`](01-auth.md)da tasvirlangan).

**Xato holati:** 2-qadamda `401`/`400`/`429` kelsa — login ekraniga qaytariladi (aniq xatolik matnlari [`01-auth.md`](01-auth.md)da). 4-qadamda ulanish `4001`/`4402` bilan rad etilsa — WebSocket'ni qayta ulashga urinmang, avval tegishli muammoni hal qiling ([`05-websocket.md`](05-websocket.md)).

---

## 2. Stol tanlash

Bootstrap'dan kelgan `tables` massividan boshlanadi — har bir stol allaqachon `status` (`free`/`occupied_by_me`/`occupied`) bilan keladi. Qo'shimcha so'rov shart emas, agar WebSocket orqali `table_status_changed` kelmasa:

```
WS: {"event": "table_status_changed", "data": {"table_id": 1}}
      → GET /api/tables/ (yoki bitta stol kerak bo'lsa shu ro'yxatdan filtrlang)
```

Batafsil: [`02-catalog.md`](02-catalog.md) (`status` maydoni qanday hisoblanishi) va [`05-websocket.md`](05-websocket.md).

---

## 3. Yangi buyurtma ochish va taom qo'shish

```
1. POST /api/orders/                     → buyurtma yaratiladi (status: "new")
2. (ixtiyoriy) POST /api/orders/{id}/start/   → status: "in_progress"
                                                  (oshxonaga "boshladim" signali)
3. POST /api/orders/{id}/add_item/       → har bir taom uchun alohida chaqiriladi
   (bir necha marta)
4. GET /api/orders/{id}/                 → yangilangan total_amount/items'ni olish
```

**Muhim nuqtalar:**
- `table_id` stolli buyurtma uchun, olib ketish/yetkazib berish uchun tashlab ketiladi (`order_type: "takeaway"`/`"delivery"`) — to'liq misol [`03-orders.md`](03-orders.md#buyurtma-ochish).
- **2-qadam ixtiyoriy** — restoran oqimi oshxona holatini kuzatishni talab qilmasa, to'g'ridan-to'g'ri 1→3 ga o'tish mumkin. `start` faqat `status: "new"` bo'lgan buyurtmada ishlaydi, qayta chaqirilsa `400` qaytaradi.
- **`add_item` javobida to'liq `Order` obyekti QAYTMAYDI** (faqat `{"status": "Item added"}`) — shuning uchun 4-qadam shart: barcha item qo'shilgandan keyin (yoki har birida, UI talabiga qarab) `GET /api/orders/{id}/` chaqirib haqiqiy `total_amount`ni oling. Lokal hisoblab UI'da ko'rsatish mumkin, lekin serverdan tasdiqlanmasdan turib "yakuniy" deb ko'rsatmang.
- Har muvaffaqiyatli `add_item`/`start` dan so'ng `order_updated` (va stolli buyurtmalarda `table_status_changed`) WebSocket orqali **barcha** ulangan qurilmalarga (jumladan boshqa ofitsiant/kassir ilovalariga) yuboriladi — shu signalni kutib turgan boshqa ekranlar o'zi yangilanadi, qo'shimcha polling shart emas.

**Taqiqlangan:** soft-delete qilingan (`is_deleted: true`) mahsulotni qo'shib bo'lmaydi — `400`; yopilgan/bekor qilingan buyurtmaga item qo'shib bo'lmaydi — `400`. Batafsil: [`03-orders.md`](03-orders.md#buyurtmaga-taom-qoshish).

---

## 4. Kun davomida — o'z buyurtmalarini kuzatish

```
GET /api/orders/?date=today
```

Ofitsiant uchun **avtomatik** faqat o'zi ochgan buyurtmalar bilan filtrlanadi (server tomonda) — `?date=today` shu scoping ustiga qo'shilib, faqat **bugungi** buyurtmalarni beradi (eng yangisidan eskisiga tartiblangan). "Buyurtmalarim tarixi" ekrani aynan shu chaqiruv bilan quriladi, client tomonda sana bo'yicha qo'shimcha filtrlash/hisob-kitob shart emas — kun chegarasi serverda mahalliy (Toshkent) vaqt bo'yicha hisoblanadi, batafsil [`03-orders.md`](03-orders.md#buyurtmalar-royxati). Parametrsiz `GET /api/orders/` hamon ishlaydi (butun tarix), lekin kundalik ekran uchun `?date=today` tavsiya etiladi. O'tgan kunlar uchun `?date=YYYY-MM-DD`.

Boshqa xodimning buyurtmasini `GET /api/orders/{id}/` bilan so'rasa — `404` (mavjudligi ham oshkor qilinmaydi, `403` emas).

WebSocket orqali `order_updated` kelganda (masalan kassir shu buyurtmaga to'lov qo'shganda) — `GET /api/orders/{id}/` bilan qayta so'rang.

---

## 5. Ixtiyoriy: to'lovni ofitsiant o'zi qabul qilsa

API darajasida `add_payment` va `close` **istalgan autentifikatsiyalangan xodimga** (kassir, menejer, ofitsiant — bir xilda) ochiq, gate yo'q. Ko'p restoranda buyurtmani kassa yopadi (alohida kassir-ilovasi orqali), lekin agar sizning ofitsiant ilovangiz stolda to'lov qabul qilishni ham qamrab olsa (masalan mobil POS-terminal bilan), xuddi shu ketma-ketlik ishlaydi:

```
1. POST /api/orders/{id}/add_payment/    → bir necha marta (split-payment)
   (balance_due 0 ga yetguncha)
2. POST /api/orders/{id}/close/          → faqat balance_due == 0 bo'lsa ishlaydi
```

To'liq maydonlar/xatoliklar: [`03-orders.md`](03-orders.md#tolov-qoshish-split-payment-qollab-quvvatlanadi).

---

## 6. Ofitsiantga TAQIQLANGAN amallar

Quyidagilar `role: "manager"` bilan cheklangan — ofitsiant urinsa `403 {"detail": "You do not have permission to perform this action."}`:

| Amal | Endpoint |
|---|---|
| Chegirma qo'llash | `POST /api/orders/{id}/set_discount/` |
| Buyurtmani bekor qilish | `POST /api/orders/{id}/cancel/` |
| Kategoriya/mahsulot/stol yaratish, o'zgartirish, o'chirish | `POST`/`PATCH`/`DELETE /api/{categories,products,tables}/...` |
| Xodim yaratish, ro'yxatga olish kodi berish, qurilmani chetlashtirish | `/api/users/...`, `/api/devices/{id}/revoke/` |

Ilova UI darajasida bu tugmalarni ofitsiant uchun umuman ko'rsatmaslik tavsiya etiladi (server baribir rad etadi, lekin oldindan yashirish tajribani yaxshilaydi).

---

## To'liq oqim — bitta misol (curl)

Stolli buyurtma: ochish → taom qo'shish → holatni tekshirish (to'lov/yopish kassir ilovasida bo'ladi deb faraz qilinmoqda):

```bash
# 1. Kunlik kirish
curl -X POST https://<bola>/api/auth/pin-login/ \
  -H "Content-Type: application/json" \
  -d '{"device_id": "phone-uuid-123", "pin": "482913"}'
# → {"token": "abcd1234...", "user": {"role": "waiter", ...}}

# 2. Boshlang'ich ma'lumot
curl https://<bola>/api/bootstrap/ \
  -H "Authorization: Token abcd1234..." \
  -H "X-Device-ID: phone-uuid-123"
# → {"tables": [...], "products": [...], "active_orders": [...], ...}

# 3. Buyurtma ochish (1-stol)
curl -X POST https://<bola>/api/orders/ \
  -H "Authorization: Token abcd1234..." \
  -H "X-Device-ID: phone-uuid-123" \
  -H "Content-Type: application/json" \
  -d '{"table_id": 1, "sync_uuid": "123e4567-e89b-12d3-a456-426614174000"}'
# → {"id": 10, "status": "new", ...}

# 4. Taom qo'shish
curl -X POST https://<bola>/api/orders/10/add_item/ \
  -H "Authorization: Token abcd1234..." \
  -H "X-Device-ID: phone-uuid-123" \
  -H "Content-Type: application/json" \
  -d '{"product_id": 3, "quantity": 2}'
# → {"status": "Item added"}

# 5. Yangilangan buyurtmani olish
curl https://<bola>/api/orders/10/ \
  -H "Authorization: Token abcd1234..." \
  -H "X-Device-ID: phone-uuid-123"
# → {"id": 10, "total_amount": "10000.00", "items": [...], ...}
```

WebSocket ulanishi (2-qadamdan oldin, token olingandan keyin darhol) — Flutter namunasi [`05-websocket.md`](05-websocket.md)da.
