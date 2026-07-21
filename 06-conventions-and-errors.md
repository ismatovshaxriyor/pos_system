# Umumiy formatlar, xatoliklar, cheklovlar

## HTTP status kodlari

| Kod | Ma'nosi | Qachon uchraydi |
|---|---|---|
| `200` | Muvaffaqiyatli (o'qish/amal) | |
| `201` | Muvaffaqiyatli yaratildi | `POST` bilan yangi obyekt/token yaratilganda |
| `400` | Validatsiya xatosi / noto'g'ri so'rov | Majburiy maydon yo'q, PIN formati xato, kod muddati tugagan va h.k. |
| `401` | Autentifikatsiya yo'q/yaroqsiz | Token yo'q, noto'g'ri, yoki bekor qilingan (qurilma revoke qilingan) |
| `402` | Litsenziya bloklangan (kill-switch) | Restoran to'lovi kechikkan — [`README.md`](README.md)ga qarang |
| `403` | Ruxsat yo'q | Autentifikatsiya bor, lekin rol yetarli emas (masalan ofitsiant narx o'zgartirmoqchi) |
| `404` | Topilmadi (yoki ko'rish huquqi yo'q) | Ofitsiant boshqa xodimning buyurtmasini so'rasa ham shu kod qaytadi — `403` emas, mavjudligi ham oshkor qilinmaydi |
| `429` | Juda ko'p urinish | PIN login qulfi (5 xato → 5 daqiqa) YOKI umumiy chastota cheklovi (pastdagi "Cheklovlar" bo'limiga qarang) |
| `500` | Server xatosi | Kutilmagan holat — takrorlanuvchi bo'lsa backend jamoasiga xabar bering |

## Xatolik javob formati

Barcha xatoliklar doimiy va izchil (uniform) formatda qaytadi. Shuningdek, qo'shimcha tahlil uchun `code` kaliti qo'shilgan:
```json
{
  "detail": "Inson o'qiy oladigan xabar (odatda o'zbek tilida)",
  "code": "error_code",
  "fields": {}
}
```

Validatsiya xatoliklarida (masalan, noto'g'ri maydon qiymati yuborilganda):
```json
{
  "detail": "Validatsiya xatosi.",
  "code": "validation_error",
  "fields": {
    "price": ["A valid number is required."],
    "name": ["This field is required."]
  }
}
```

Ilova eng avvalo avtomatik tarzda `detail` maydonini o'qib foydalanuvchiga xato sifatida ko'rsatishi mumkin. Agar sizga qaysi maydonda muammo borligi kerak bo'lsa, uni `fields` lug'atidan izlang. Barcha maydon xatolari endi asil javobda emas, balki aynan shu `fields` ichida keladi!

Ilova xatolik ko'rsatishda avval `detail` maydonini qidirsin, topilmasa javobni umumiy tarzda (masalan birinchi maydon xatosini) ko'rsatsin.

## Sahifalash va filtrlash

**Sahifalash (Pagination) yoqilgan!** Endi barcha `GET /api/{resource}/` ro'yxat endpoint'lari server zo'riqmasligi va mijoz ilovasi qotmasligi uchun ma'lumotlarni qismlarga bo'lib qaytaradi. Har bir sahifada standart **50 ta obyekt** keladi.

Javob formati (DRF standart PageNumberPagination):
```json
{
  "count": 100,
  "next": "http://<bola-server-ip>:8000/api/orders/?page=3",
  "previous": "http://<bola-server-ip>:8000/api/orders/?page=1",
  "results": [
    {"id": 1, "...": "..."}, 
    {"id": 2, "...": "..."}
  ]
}
```
Client dastur yangi ma'lumot qabul qilayotganida har doim listni o'zi emas, balki `results` maydoni ichidagi ob'yektlar qatoriga murojaat qilishi shart. Keyingi sahifalarni so'rash uchun esa `next` URL'idan foydalanishingiz yoki URL ga `?page=N` parametrini qo'shishingiz mumkin.

Filtrlash/qidiruv parametrlari ham hozircha qisman mavjud emas, lekin katta ehtimol bilan ro'yxatni yuklagach uni client tomonda filtrlashingiz kerak bo'ladi.

## Sana/vaqt formati

Barcha `datetime` maydonlari ISO 8601, UTC (`Z` bilan tugaydi): `"2026-07-10T06:19:45.123456Z"`. Flutter'da `DateTime.parse(...)` avtomatik to'g'ri parse qiladi va UTC sifatida belgilaydi — ko'rsatishdan oldin `.toLocal()` chaqiring.

## Pul/narx formati

Barcha pul qiymatlari (`price`, `total_amount`) JSON'da **string** sifatida keladi (masalan `"5000.00"`), oddiy `number` emas — Decimal aniqligini yo'qotmaslik uchun (ayniqsa qo'shish/ko'paytirish amallarida). Bunday maydonlarni yozishda ham string sifatida yuboring.

## Versiyalash

Hozircha API versiyalanmagan (`/api/v1/...` emas, to'g'ridan-to'g'ri `/api/...`) — loyiha hali faol rivojlanmoqda. Breaking o'zgarish bo'lsa bu hujjatlar yangilanadi va (agar amaliy zarurat tug'ilsa) versiyalash keyinroq kiritiladi. Hozircha eng ishonchli yondashuv: shu `api-docs` branch'ini muntazam kuzatib borish (README'dagi yangilash ko'rsatmasi) va OpenAPI sxemasini (`/api/schema/`) build vaqtida qayta generatsiya qilib turish.

## Cheklovlar (rate limiting)

Endi ikki qatlam bor:

1. **PIN login qulfi** (`/api/auth/pin-login/`) — qurilma bo'yicha 5 xato urinishdan keyin 5 daqiqalik qulf ([`01-auth.md`](01-auth.md)ga qarang).
2. **Umumiy so'rov chastotasi cheklovi (yangi)** — butun API bo'ylab: autentifikatsiyasiz so'rovlar (login, PIN login, qurilma ro'yxatga olish) **10 ta/daqiqa** (manzil bo'yicha), token bilan autentifikatsiyalangan so'rovlar **100 ta/daqiqa** (foydalanuvchi bo'yicha). Oshib ketsa `429` qaytadi, `detail`da necha soniyadan keyin qayta urinish mumkinligi yoziladi.

`429` kelganda ilova ko'rsatilgan kutish vaqtini hurmat qilishi kerak. 100/daqiqa normal ish oqimi uchun bemalol yetarli — bu chegaraga urilish odatda siklda qolib ketgan polling xatosining belgisi. WebSocket signali kelganda qayta so'rash uslubida ishlang ([`05-websocket.md`](05-websocket.md)), davriy tight-loop polling qilmang.
