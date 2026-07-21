# Printerlar va Oshxona Chop Etish Tizimi (KDS)

Oshxonaga buyurtmalarni chop etish (printerlarga yo'naltirish) va KDS (Kitchen Display System — virtual oshxona ekrani) uchun API va WebSocket hodisalari shartnomasi.

---

## 1. Printerlar boshqaruvi — `/api/printers/`

Printerlarni yaratish, tahrirlash va ularga kategoriya bog'lash. Safariy yoki Kassir/Menejer planshetidan konfiguratsiya qilish uchun ishlatiladi.

### Maydonlar
| Maydon | Turi | O'qish/Yozish | Izoh |
|---|---|---|---|
| `id` | int | o'qish | |
| `name` | string | majburiy | printer nomi (masalan: "Asosiy printer", "Bar printeri") — jismoniy chekda sarlavha sifatida ham chiqadi |
| `ip_address` | string | ixtiyoriy | **Bo'sh** — virtual printer: chek faqat KDS ekranida ko'rinadi, qo'lda mark-printed qilinadi. **To'ldirilgan** — jismoniy ESC/POS termoprinter: server chekni shu manzilga TCP orqali o'zi yuboradi (quyida 1.1-bo'lim) |
| `port` | int | ixtiyoriy (default `9100`) | jismoniy printerning raw TCP porti (ESC/POS standarti — 9100) |
| `chars_per_line` | int | ixtiyoriy (default `48`) | bir qatordagi belgilar soni: 80mm qog'oz (masalan Xprinter XP-Q80A) — `48`, 58mm — `32` |
| `is_active` | bool | ixtiyoriy (default `true`) | printerning faollik holati |

### 1.1. Jismoniy ESC/POS printer oqimi (`ip_address` to'ldirilgan bo'lsa)

Buyurtma oshxonaga yuborilganda (`start` / `add_item`) server `PrintJob` yaratgach chekni **o'zi avtomatik** printerga yuboradi — ilova hech narsa qilishi shart emas:

* Muvaffaqiyatda job holati o'z-o'zidan `printed` bo'ladi va tarmoqqa `print_job_updated` WS signali ketadi (ya'ni bu signal endi faqat planshetlardan emas, serverdan avtomatik ham keladi).
* Ulanish xatosida server ~5/15/45 soniya oralatib qayta urinadi; baribir chiqmasa job `failed` bo'ladi, barcha menejerlarga `print_failed` bildirishnomasi keladi (qarang [`04-devices-and-notifications.md`](04-devices-and-notifications.md)) va chekni KDS ekranidan qo'lda chiqarish mumkinligicha qoladi.
* 30 daqiqadan oshiq navbatda qolib ketgan chek **qayta chop etilmaydi** — to'g'ridan-to'g'ri `failed` qilinadi (kechikkan chek oshxonani chalg'itadi).
* Virtual printerlarning (`ip_address` bo'sh) navbatiga server umuman tegmaydi — eski qo'lda oqim o'zgarishsiz.

### Test chek chiqarish (printerni sozlashda)
Jismoniy printer to'g'ri ulanganini darhol tekshirish uchun — kodlash namunalari (lotin/kirill), ustun eni chizig'i va avtokesish bilan test chek yuboradi. Sinxron ishlaydi (natija javobda darhol keladi).
* **Endpoint:** `POST /api/printers/{id}/test-print/`
* **Javob (200 OK):** `{"status": "Test chek yuborildi"}`
* **Xato (400):** `{"detail": "Bu printerga IP manzil kiritilmagan - avval ip_address maydonini to'ldiring."}` — virtual printerda test chekning ma'nosi yo'q.
* **Xato (502):** `{"detail": "Printerga ulanib bo'lmadi (192.168.1.50:9100): ..."}` — IP/port noto'g'ri, printer o'chiq yoki boshqa tarmoqda.

### Printerga bog'lash mumkin bo'lgan kategoriyalar ro'yxatini olish
Printerni sozlayotgan xodim qaysi kategoriyalarni unga yo'naltirishi mumkinligini bilishi uchun mo'ljallangan yengil ro'yxat endpointi.
* **Endpoint:** `GET /api/printers/category-options/`
* **Javob (200 OK):**
```json
[
  {
    "id": 1,
    "name": "Ovqatlar",
    "printer_id": null,
    "printer__name": null
  },
  {
    "id": 2,
    "name": "Ichimliklar",
    "printer_id": 2,
    "printer__name": "Bar printeri"
  }
]
```

### Printerga kategoriyalarni biriktirish
Tanlangan kategoriyalarni ushbu printerga yo'naltiradi (tanlanmaganlaridan bog'lanish bo'shatiladi).
* **Endpoint:** `POST /api/printers/{id}/set-categories/`
* **So'rov tanasi:**
```json
{
  "category_ids": [1, 3]
}
```
* **Javob (200 OK):**
```json
{
  "status": "Kategoriyalar yangilandi"
}
```

---

## 2. Chop etish navbati (Print Jobs) — `/api/print-jobs/`

Ushbu endpoint oshxona ekrani (KDS) planshetlari yoki tashqi printer agentlari uchun buyurtmalarni o'qish va holatini yangilash uchun xizmat qiladi.

### Ro'yxatni olish (Skanerlash/Navbat)
* **Endpoint:** `GET /api/print-jobs/`
* **Filtrlash:** Aynan bitta printerga (oshxona planshetiga) tegishli navbatni olish uchun query parametr yuboriladi: `GET /api/print-jobs/?printer=1`
* **Javob (200 OK - Sahifalangan):**
```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 12,
      "printer": 1,
      "printer_name": "Oshxona printeri",
      "order": 10,
      "table_name": "Stol 12",
      "waiter_name": "Alisher",
      "items_snapshot": [
        {
          "name": "Osh",
          "quantity": 2,
          "note": "Piyozsiz",
          "modifiers": {}
        }
      ],
      "status": "pending",
      "created_at": "2026-07-12T14:15:36.123456Z",
      "updated_at": "2026-07-12T14:15:36.123456Z"
    }
  ]
}
```

### Chop etilgan deb belgilash (Planshet/Ekran orqali)
Oshxona planshetida buyurtma tayyor bo'lgach (yoki qog'oz chop etilgach) planshet ushbu endpointni chaqiradi:
* **Endpoint:** `POST /api/print-jobs/{id}/mark-printed/`
* **Javob (200 OK):** `{"status": "Job marked as printed"}`
* **WS Signal:** Tarmoqqa `print_job_updated` signali yuboriladi.

### Chop etish muvaffaqiyatsiz bo'lganini bildirish
* **Endpoint:** `POST /api/print-jobs/{id}/mark-failed/`
* **Javob (200 OK):** `{"status": "Job marked as failed"}`
* **WS Signal:** Tarmoqqa `print_job_updated` signali yuboriladi.

---

## 3. WebSocket Real-vaqt Hodisalari (KDS va Chop etuvchilar uchun)

Oshxona monitorlari (`ws://` ulanishga ega) polling qilmasdan yangi chop etish buyurtmalarini real-vaqt rejimida qabul qilishadi.

### A. Yangi chop etish topshirig'i: `new_print_job`
Menejer yoki Ofitsiant buyurtmani boshlaganda (`start`) yoki faol buyurtmaga taom qo'shganda (`add_item`), faqat chop etilmagan yangi elementlar oshxona monitoriga push bo'lib keladi:

```json
{
  "event": "new_print_job",
  "data": {
    "job_id": 12,
    "printer_id": 1,
    "printer_name": "Oshxona printeri",
    "order_id": 10,
    "waiter": "Alisher",
    "table_name": "Stol 12",
    "items": [
      {
        "name": "Osh",
        "quantity": 2,
        "note": "Piyozsiz",
        "modifiers": {}
      }
    ],
    "created_at": "2026-07-12T14:15:36.123456"
  }
}
```

### B. Chop etish topshirig'i yangilanishi: `print_job_updated`
Biror stansiya topshiriq holatini yangilasa (`printed` yoki `failed`), boshqa planshetlar o'z ekranini sinxronlash uchun ushbu signalni qabul qiladi. Jismoniy (IP'li) printer joblari uchun bu signal **serverning o'zidan avtomatik** ham keladi — chek termoprinterdan muvaffaqiyatli chiqqanda (`printed`) yoki barcha urinishlar tugab job yiqilganda (`failed`):

```json
{
  "event": "print_job_updated",
  "data": {
    "job_id": 12,
    "status": "printed"
  }
}
```
