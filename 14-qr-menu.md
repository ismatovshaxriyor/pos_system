# Public QR Menyu & Live Stol Web App (`HamrohPOS`)

Restorandagi stollardagi QR kodlar orqali mijozlar mobil telefonlarida taomlar menyusini va stoldagi joriy xarajat/hisob holatini real-vaqtda ko'rishlari, shuningdek ofitsiantni chaqirishlari mumkin.

## 1. Web App Yo'nalishi (Frontend)

Mijoz brauzerda quyidagi URL'larga kiradi:
- `http://<domain>/table/<qr_code>/` — Muayyan stol uchun menyu va jonli chek.
- `http://<domain>/table/demo/` — Demo rejimidagi stolda menyu va chaqiruv funksiyalari.

## 2. Public REST API Endpoint'lar (Autentifikatsiyasiz)

Mijozlar menyuni ko'rishi va ofitsiant chaqirishi uchun hech qanday token/login shart emas (`AllowAny` permission).

### 2.1 Menyu ro'yxatini olish
```
GET /api/public/menu/
```
**Javob (200):**
```json
[
  {
    "id": 1,
    "name": "Milliy taomlar",
    "products": [
      {
        "id": 10,
        "name": "Toshkent Palov",
        "description": "Zarafshon guruchi, mol go'shti va qazi",
        "price": "45000.00",
        "image": "http://.../media/products/plov.png",
        "is_available": true
      }
    ]
  }
]
```

### 2.2 Stol holati va Jonli Chekni olish
```
GET /api/public/table/{qr_code}/
```
- `qr_code`: Stoldagi QR kod UUID belgisi yoki `demo`.

**Javob (200):**
```json
{
  "table_name": "VIP Stol 3",
  "zone_name": "Teras",
  "is_occupied": true,
  "current_order": {
    "id": 142,
    "items": [
      {"product_name": "Toshkent Palov", "quantity": 2, "unit_price": "45000.00", "total_price": "90000.00"}
    ],
    "subtotal": "90000.00",
    "service_charge": "13500.00",
    "final_amount": "103500.00"
  }
}
```

### 2.3 Ofitsiant Chaqirish
```
POST /api/public/table/{qr_code}/call-waiter/
```
**So'rov tanasi:**
```json
{
  "reason": "Salfetka kerak"
}
```
**Javob (200):**
```json
{
  "status": "success",
  "detail": "Ofitsiantga xabar yuborildi."
}
```
*Ofitsiant ilovalariga va kassa terminaliga real-vaqt WebSocket (`waiter_called`) signali va Notification yuboriladi.*

---

## 3. Stol uchun QR Kod PNG Tasvirini Generatsiya Qilish (Kassir/Menejer)

```
GET /api/tables/{id}/qr-code/?domain=filial1.hamrohpos.uz
```
Restoranning har bir stoli uchun brendlangan PNG tasvirini (Zümrad & Oltin ranglarida) yuklab beradi. Kassa yoki admin panel orqali bosib chiqarish uchun ishlatiladi.
