# Xodimlar Davomati (Attendance) API

Xodimlarning kelib-ketish davomati (check-in / check-out) va restoran koordinatalari sozlamalari (RestaurantConfig) API endpointlari.

---

## 1. Restoran Koordinatalari Sozlamasi (RestaurantConfig)

Menejer tomonidan restoran koordinatalari va ruxsat berilgan chek-in radiusini sozlash uchun singleton API.

### Restoran sozlamalarini olish
* **Endpoint:** `GET /api/restaurant-config/1/`
* **Autentifikatsiya:** Majburiy (istalgan rol)
* **Javob (200 OK):**
```json
{
  "id": 1,
  "latitude": "41.311081",
  "longitude": "69.240562",
  "attendance_radius": 100,
  "created_at": "2026-07-11T20:54:12.123456Z",
  "updated_at": "2026-07-11T20:54:12.123456Z"
}
```

### Restoran sozlamalarini o'zgartirish
* **Endpoint:** `PUT /api/restaurant-config/1/` yoki `PATCH /api/restaurant-config/1/`
* **Autentifikatsiya:** Majburiy (Faqat `manager` roli)
* **So'rov tanasi:**
```json
{
  "latitude": "41.311081",
  "longitude": "69.240562",
  "attendance_radius": 150
}
```
* **Javob (200 OK):** O'zgargan `RestaurantConfig` obyekti.
* **Xatolik (403 Forbidden):** Agar menejer bo'lmagan xodim (masalan, ofitsiant) o'zgartirmoqchi bo'lsa.

---

## 2. Davomat (Attendance)

Xodimlar uchun ishga kelganlik/ketganlikni tasdiqlash va menejerlar uchun davomat tarixini ko'rish.

### Kelganlikni tasdiqlash (Check-In)
Xodim ishxonaga kelganda o'z GPS koordinatalarini yuborib chek-in qiladi. Koordinatalar restoran sozlamalaridagi radius ichida bo'lishi shart.

* **Endpoint:** `POST /api/attendance/check-in/`
* **Autentifikatsiya:** Majburiy (istalgan rol)
* **So'rov tanasi:**
```json
{
  "latitude": "41.311200",
  "longitude": "69.240700"
}
```
* **Javob (201 Created):**
```json
{
  "id": 1,
  "user": {
    "id": 2,
    "username": "+998907654321",
    "first_name": "Waiter",
    "last_name": "",
    "role": "waiter"
  },
  "check_in": "2026-07-11T20:55:16.123456Z",
  "check_out": null,
  "check_in_latitude": "41.311200",
  "check_in_longitude": "69.240700",
  "check_out_latitude": null,
  "check_out_longitude": null,
  "created_at": "2026-07-11T20:55:16.123456Z",
  "updated_at": "2026-07-11T20:55:16.123456Z"
}
```

* **Xatolik (400 Bad Request):**
  * Ishxona radiusidan tashqarida bo'lsa:
    ```json
    {
      "detail": "Siz ishxonadan juda uzoqdasiz. Masofa: 4398m, ruxsat etilgan radius: 100m"
    }
    ```
  * Allaqachon yopilmagan check-in bo'lsa:
    ```json
    {
      "detail": "Sizda allaqachon yopilmagan check-in mavjud."
    }
    ```

### Ketganlikni tasdiqlash (Check-Out)
Xodim ishdan ketayotganda o'z GPS koordinatalarini yuborib faol chek-inini yopadi (check-out).

* **Endpoint:** `POST /api/attendance/check-out/`
* **Autentifikatsiya:** Majburiy (istalgan rol)
* **So'rov tanasi:**
```json
{
  "latitude": "41.311100",
  "longitude": "69.240600"
}
```
* **Javob (200 OK):** Yopilgan `Attendance` obyekti (`check_out` to'ldirilgan holda).
* **Xatolik (400 Bad Request):**
  * Ishxona radiusidan tashqarida bo'lsa.
  * Faol check-in topilmasa:
    ```json
    {
      "detail": "Sizda faol check-in topilmadi."
    }
    ```

### Davomat tarixini ko'rish
* **Endpoint:** `GET /api/attendance/`
* **Autentifikatsiya:** Majburiy
* **Ruxsatlar:**
  * Menejerlar barcha xodimlarning davomat tarixini ko'radi.
  * Boshqa xodimlar (ofitsiant, kassir) faqat o'zlarining shaxsiy davomat tarixlarini ko'ra olishadi.
* **Javob (200 OK):** Sahifalangan `Attendance` obyekti ro'yxati.
