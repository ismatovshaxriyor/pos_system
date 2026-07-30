# POS Mobile App API Reference (`local_server`)

Ushbu hujjat Flutter mobil xodimlar ilovasi (Ofitsiant / Kassir / Menejer) uchun `local_server` API moslamalarini o'z ichiga oladi.

## Buyurtmalar (Orders API)

### 1. Pre-bill (Hisob-chek / Shot) chop etish
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

### 2. To'lov Cheki (Receipt) chop etish / Qayta chop etish
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

### 3. Avtomatik To'lov Cheki
`POST /api/orders/{id}/close/` yoki `POST /api/orders/{id}/close-on-credit/` endpointlari chaqirilib buyurtma yopilganda, tizim avtomatik ravishda kassa printeriga to'lov chekini chop etish topshirig'ini yuboradi.
