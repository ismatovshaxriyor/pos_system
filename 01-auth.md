# Autentifikatsiya

Ikki mustaqil oqim bor: **Menejer/Ofitsiantlar** (login + parol) va **Kassirlar** (PIN+qurilma). Har bir muvaffaqiyatli autentifikatsiyadan keyin bir xil turdagi `token` qaytariladi.

### Muhim: So'rovlarda talab qilinadigan Header'lar

Autentifikatsiyadan o'tgach, keyingi barcha API so'rovlarida quyidagi ikki header majburiy ravishda yuborilishi shart (faqat Ona server tomonidan yaratilgan asosiy admin `is_staff=True` hisobi bundan mustasno):

1. `Authorization: Token <token>` — Foydalanuvchining login/PIN orqali olingan tokeni.
2. `X-Device-ID: <device_id>` — So'rov yuborayotgan qurilmaning barqaror identifikatori (`device_id`).

#### Xatolik holatlari:
* **Header etishmasligi (`401 Unauthorized`):** Agar `X-Device-ID` header'i yuborilmasa:
  ```json
  {"detail": "Qurilma ID si yuborilmadi (X-Device-ID header)."}
  ```
* **Nofaol yoki tasdiqlanmagan qurilma (`401 Unauthorized`):** Agar qurilma tasdiqlanmagan yoki admin tomonidan chetlashtirilgan (revoke qilingan) bo'lsa:
  ```json
  {"detail": "Ushbu qurilmaga ruxsat berilmagan yoki u faol emas."}
  ```

---

## 1. Menejer/Ofitsiant kirishi (telefon + parol + qurilma)

Ofitsiant (yoki menejer) o'z telefonidan birinchi marta login-parol bilan kirganda, ushbu qurilma avtomatik ravishda uning asosiy qurilmasi sifatida bog'lanadi (TOFU). Keyinchalik faqat shu qurilmadan login qila oladi.

```
POST /api/auth/waiter-login/
Content-Type: application/json

{
  "phone": "+998901112233",
  "password": "sizning_parolingiz",
  "device_id": "test-device-uuid-12345",
  "device_label": "Asror - iPhone 14"
}
```

* **Javob (200 OK - Kirish muvaffaqiyatli):**
  ```json
  {
    "token": "40-belgili-hex-token",
    "user": {
      "id": 4,
      "username": "+998901112233",
      "first_name": "Asror",
      "last_name": "Karimov",
      "role": "waiter"
    }
  }
  ```

* **Xatolik (403 Forbidden - Yangi qurilmadan kirishga urinish):**
  Agar foydalanuvchining boshqa qurilmasi allaqachon tasdiqlangan (faol) bo'lsa va u **shundan farqli** `device_id` bilan kirishga urinsa:
  ```json
  {
    "detail": "Yangi qurilmadan kirish taqiqlangan. Menejer tasdig'i kutilmoqda."
  }
  ```
  *Ushbu urinish menejer uchun `device_approval_requested` turidagi Notification (Bildirishnoma) hosil qiladi.*

  > **E'tibor bering:** bu holat **oldin ishlatilgan, keyin almashtirilgan eski qurilmaga ham** tegishli. Ya'ni yangi qurilma menejer tomonidan tasdiqlangach (eski qurilma avtomatik nofaol bo'ladi), o'sha eski qurilmadan qayta kirmoqchi bo'lsangiz ham xuddi shu `403` qaytadi va menejer qayta tasdiqlashi kerak — bir vaqtning o'zida faqat **bitta** faol qurilma bo'la oladi. Ilova buni "sessiya boshqa qurilmaga ko'chirilgan" holati sifatida ko'rsatishi va menejer tasdig'ini kutishi kerak (`401` — token yaroqsiz — bilan chalkashtirmang; bu `403` autentifikatsiya to'g'ri, faqat qurilma tasdig'i yetishmaydi).

---

## 2. Menejer: Yangi qurilmani tasdiqlash (Approve)

Menejer yangi qurilmadan kirmoqchi bo'lgan ofitsiantning qurilmasini tasdiqlashi uchun bildirishnomadan olingan `device_pk` orqali quyidagi endpointga so'rov yuboradi:

```
POST /api/devices/{device_pk}/approve/
Authorization: Token <manager_token>
```

* **Javob (200 OK):**
  Tasdiqlangan qurilma ma'lumotlari (`is_approved: true`).
  *Eski tasdiqlangan qurilma avtomatik ravishda nofaol (revoked) holatga o'tkaziladi va eski tokenlar o'chiriladi.*

---

## 3. Kassirlar uchun planshetda tezkor PIN orqali kirish

Kassirlar kassa planshetida/ekranida tezkor ishlash uchun faqat o'zlarining 6 xonali PIN kodlarini kiritadilar:

```
POST /api/auth/pin-login/
Content-Type: application/json

{
  "device_id": "kassa-plansheti-uuid-123",
  "pin": "123456"
}
```

* **Javob (200 OK):**
  ```json
  {
    "token": "40-belgili-hex-token",
    "user": {
      "id": 5,
      "username": "+998909998877",
      "first_name": "Kassir 1",
      "last_name": "",
      "role": "cashier"
    }
  }
  ```

---

## 4. `GET /api/users/me/` — joriy foydalanuvchi kim ekanini bilish

```
GET /api/users/me/
Authorization: Token <token>
```

**Javob (200 OK):**
```json
{"id": 4, "username": "+998901112233", "first_name": "Asror", "last_name": "Karimov", "role": "waiter"}
```

---

## 5. Menejer: yangi xodim yaratish

Faqat `role=manager` foydalanuvchi chaqira oladi (`POST /api/users/`). **`password` maydonining qoidasi rolga bog'liq** — bu qoida serverda qat'iy tekshiriladi, noto'g'ri kombinatsiya `400` bilan rad etiladi:

| `role` | `password` | Nega |
|---|---|---|
| `manager` | **majburiy** | Menejer doim telefon+parol bilan kiradi ([1-bo'lim](#1-menejerofitsiant-kirishi-telefon--parol--qurilma)dagi kabi, lekin qurilma bog'lanishisiz — har qanday qurilmadan). |
| `waiter` | **majburiy** | Ofitsiant birinchi login-parolda TOFU orqali qurilmasini o'zi bog'laydi ([1-bo'lim](#1-menejerofitsiant-kirishi-telefon--parol--qurilma)) — alohida registratsiya kodi shart emas. |
| `cashier` | **yuborilmasin** | Kassir hech qachon parol bilan kirmaydi (faqat PIN+qurilma — [3-bo'lim](#3-kassirlar-uchun-planshetda-tezkor-pin-orqali-kirish)). `password` yuborilsa `400` qaytadi — buni ataylab qilingan: agar kassirga haqiqiy parol o'rnatilsa, u `/api/auth/login/` orqali qurilma tekshiruvisiz kirib qolar edi. Kassirni ishga tushirish uchun 6-bo'limga qarang. |

**Menejer yaratish:**
```
POST /api/users/
Authorization: Token <admin_token>
Content-Type: application/json

{"username": "+998901112230", "first_name": "Zarina", "last_name": "Aliyeva", "role": "manager", "password": "sizning_parolingiz"}
```

**Ofitsiant yaratish** (keyin ofitsiant o'zi `waiter-login`ga kirib qurilmasini bog'laydi — 0-qadam shart emas):
```
POST /api/users/
Authorization: Token <admin_token>
Content-Type: application/json

{"username": "+998901112233", "first_name": "Asror", "last_name": "Karimov", "role": "waiter", "password": "sizning_parolingiz"}
```

**Kassir yaratish** (`password` YO'Q — PIN keyingi bo'limda beriladi):
```
POST /api/users/
Authorization: Token <admin_token>
Content-Type: application/json

{"username": "+998909998877", "first_name": "Kassir", "last_name": "1", "role": "cashier"}
```

Har uchalasida ham javob (`201`) — `password` hech qachon qaytmaydi:
```json
{"id": 6, "username": "+998909998877", "first_name": "Kassir", "last_name": "1", "role": "cashier"}
```

**Xatolik (`400`):** `password` qoidasi buzilganda (masalan kassirga parol yuborilsa yoki menejer/ofitsiantga parol yuborilmasa) — [`06-conventions-and-errors.md`](06-conventions-and-errors.md)dagi umumiy xato formatida, sabab `fields.password` ichida:
```json
{"detail": "Validatsiya xatosi.", "code": "validation_error", "fields": {"password": ["Kassir uchun parol o'rnatilmaydi - registratsiya kodi orqali PIN beriladi."]}}
```

---

## 6. Menejer: kassir/ofitsiant uchun registratsiya kodi yaratish

Kassir (yoki parol bilan emas, kod bilan ishga tushirilishi kerak bo'lgan boshqa xodim) yuqoridagi 5-bo'limda yaratilgach, menejer unga bir martalik kod generatsiya qiladi — shu kodni xodimga og'zaki/Telegram orqali beradi:

```
POST /api/users/{id}/generate-registration-code/
Authorization: Token <admin_token>
```

* **Javob (`201 Created`):**
  ```json
  {
    "code": "7K9M2XQP",
    "expires_at": "2026-07-20T12:15:00Z",
    "user": {"id": 6, "username": "+998909998877", "first_name": "Kassir", "last_name": "1", "role": "cashier"}
  }
  ```
  `code` — 8 belgili, chalkash harflar (`0`/`O`, `1`/`I` va h.k.) chiqarib tashlangan alifbodan. **15 daqiqa** amal qiladi (`expires_at`). Qayta chaqirilsa — eski (hali ishlatilmagan) kod bekor bo'lib, yangisi yaratiladi.
* **Xatolik (`400`):** `is_staff=True` (ya'ni `manager`) foydalanuvchi uchun kod so'ralsa — menejerga kod kerak emas, u parol bilan kiradi:
  ```json
  {"detail": "Admin foydalanuvchi uchun PIN kirish kerak emas."}
  ```

---

## 7. Xodim: qurilmani kod orqali ro'yxatdan o'tkazish (birinchi marta)

Xodim (kassir — yoki kod bilan ishga tushirilayotgan istalgan `is_staff=False` rol) 6-bo'limda olingan kodni, o'zi tanlagan 6 xonali PIN bilan birga, o'z qurilmasida **bir marta** kiritadi:

```
POST /api/auth/device/register/
Content-Type: application/json

{
  "phone": "+998909998877",
  "code": "7K9M2XQP",
  "device_id": "kassa-plansheti-uuid-123",
  "pin": "123456",
  "device_label": "Kassa 1 - planshet"
}
```

`device_label` ixtiyoriy. `device_id`ni ilova o'zi generatsiya qilib doimiy saqlashi kerak (`flutter_secure_storage`) — shu qadamdan keyin kerak bo'lmaydi, kunlik kirish endi to'g'ridan-to'g'ri 3-bo'limdagi `pin-login`.

* **Javob (`201 Created`)** — darhol token qaytadi, qayta login qilish shart emas:
  ```json
  {
    "token": "40-belgili-hex-token",
    "user": {"id": 6, "username": "+998909998877", "first_name": "Kassir", "last_name": "1", "role": "cashier"}
  }
  ```
* **Xatolik (`400`):**
  * Kod noto'g'ri, allaqachon ishlatilgan yoki muddati o'tgan — va **shuningdek telefon raqami umuman topilmasa ham** bir xil xabar (enumeration'dan himoya — kod yoki telefon xato ekanini alohida bilib bo'lmaydi):
    ```json
    {"detail": "Kod noto'g'ri yoki muddati tugagan."}
    ```
  * PIN 6 xonali raqam emas:
    ```json
    {"detail": "PIN 6 ta raqamdan iborat bo'lishi kerak."}
    ```

Bu qurilma avtomatik `is_active=true, is_approved=true` bo'lib yaratiladi (admin bergan kodning o'zi tasdiq hisoblanadi — alohida `approve` chaqirish shart emas, u faqat 2-bo'limdagi TOFU-almashtirish holati uchun). Foydalanuvchining oldin faol bo'lgan boshqa qurilmasi bo'lsa, avtomatik nofaol qilinadi (bir vaqtda faqat bitta faol qurilma).

---

## 8. Menejer: qurilmani chetlashtirish (masalan telefon yo'qolganda)

```
POST /api/devices/{id}/revoke/
Authorization: Token <admin_token>
```

`{id}` — `StaffDevice.id` (`GET /api/devices/` ro'yxatidan olinadi, [`04-devices-and-notifications.md`](04-devices-and-notifications.md)ga qarang).

* **Javob (`200 OK`):**
  ```json
  {"detail": "Qurilma chetlashtirildi."}
  ```

Bu darhol amal qiladi: foydalanuvchining tokeni o'chiriladi (keyingi HTTP so'rovlar `401`) va agar shu paytda WebSocket ulanishi ochiq bo'lsa, u ham majburan uziladi (`ws/events/` yopiladi). Xodim endi hech narsa qila olmaydi — qayta ishlashi uchun yangi qurilmadan 7-bo'limdagi kabi qaytadan ro'yxatdan o'tishi (yangi kod bilan) yoki (ofitsiant bo'lsa) `waiter-login`ga urinishi kerak, bu esa yangi tasdiq so'rovini yaratadi (2-bo'lim).

---

## 9. Menejer: xodimlar ro'yxati, tahrirlash, o'chirish

`/api/users/` — standart DRF `ModelViewSet` (`GET`/`PATCH`/`PUT`/`DELETE`), faqat `role=manager` foydalanuvchi uchun ochiq (`me` bundan mustasno — 4-bo'lim). `create` (`POST`) 5-bo'limda tavsiflangan.

```
GET /api/users/
Authorization: Token <admin_token>
```
**Javob (`200 OK`, sahifalangan — [`06-conventions-and-errors.md`](06-conventions-and-errors.md)):**
```json
{"count": 12, "next": null, "previous": null, "results": [
  {"id": 4, "username": "+998901112233", "first_name": "Asror", "last_name": "Karimov", "role": "waiter"}
]}
```

Bitta xodimni ko'rish/tahrirlash/o'chirish:
```
GET /api/users/4/
PATCH /api/users/4/          {"first_name": "Yangi ism"}
DELETE /api/users/4/
```

* `PATCH` bilan `role`ni ham o'zgartirish mumkin — bunda ham 5-bo'limdagi `password` qoidasi qayta tekshiriladi (masalan `role`ni `cashier`ga o'zgartirsangiz va shu so'rovda `password` yuborsangiz — `400`). `role`ni o'zgartirish **mavjud qurilma/PIN holatini avtomatik tozalamaydi** — amaliyotda rolni o'zgartirgandan keyin xodimni qayta ro'yxatdan o'tkazish (8-bo'limda chetlashtirib, 6–7-bo'lim yoki `waiter-login`) tavsiya etiladi.
* `DELETE` — **haqiqiy (hard) o'chirish**, soft-delete emas ([`02-catalog.md`](02-catalog.md)dagi mahsulot o'chirishdan farqli), va `is_active` kabi "vaqtincha o'chirish" maydoni ham API orqali ochilmagan — hozircha faqat ikkita holat bor: to'liq faol yoki umuman o'chirilgan. Ehtiyot bo'ling:
  * Xodimning eski **buyurtmalari/to'lovlari saqlanib qoladi** (`waiter`/`cashier`/`received_by` FK `SET_NULL`) — tarix buzilmaydi, faqat kim ekani endi ko'rinmaydi.
  * Lekin uning **qurilma(lar)i, registratsiya kodlari, bildirishnomalari va davomat (`Attendance`) tarixi CASCADE bilan butunlay o'chib ketadi** (`on_delete=CASCADE`). Ya'ni "xodimni o'chirish" amalda uning butun ish-vaqti/kelib-ketish tarixini ham yo'q qiladi — bu qaytarib bo'lmaydigan amal. Xodim vaqtincha ishlamay tursa (masalan ta'til), o'chirish o'rniga menejer uni shunchaki 8-bo'lim orqali qurilmasidan chetlashtirib qo'yishi (token/PIN ishlamay qoladi, lekin tarix saqlanadi) tavsiya etiladi — `DELETE`ni faqat xodim butunlay ketganda, tarixini yo'qotish istisno bo'lmagan holatda ishlating.
