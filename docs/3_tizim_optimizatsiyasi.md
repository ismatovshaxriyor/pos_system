# 3. Yuqori Unumdorlik va Tizim Optimizatsiyasi (Performance & Optimization)

Restoran sharoitida, ayniqsa "Rush hour" (mijozlar oqimi juda ko'p bo'lgan pik vaqtlar) paytida POS tizimining har bir millisekund tezligi muhim rol o'ynaydi. Quyida tizimni optimallashtirish bo'yicha eng muhim ko'rsatmalar berilgan.

---

## 1. Ma'lumotlar Bazasi (PostgreSQL) Optimizatsiyasi

Lokal server resurslari (RAM/CPU) bulutli serverga qaraganda ancha cheklangan bo'ladi. Shuning uchun bazani to'g'ri sozlash muhim.

* **Indekslash (Database Indexing):** Tez-tez qidiriladigan va filtrlanadigan maydonlarga (`restaurant_id`, `created_at`, `status`, `barcode`) indekslar qo'yilishi shart.
    python
    class Product(models.Model):
        barcode = models.CharField(max_length=50, db_index=True)  # Indeks qo'shildi
        name = models.CharField(max_length=255)

* **Connection Pooling (Ulanishlar hovuzi):** Django har bir HTTP so'rov uchun bazaga yangitdan ulanib o'tirmasligi uchun `django-db-conn-pool` kutubxonasidan foydalaning yoki `CONN_MAX_AGE` parametrini sozlang (masalan, 600 soniya). Bu lokal server CPU yuklamasini 30-40% gacha kamaytiradi.

---

## 2. Docker Tasvirlari (Images) Hajmini Kamaytirish

Konteynerlar hajmi qanchalik kichik bo'lsa, restoranda tizimni o'rnatish va yangilanishlarni internetdan ko'chirib olish shunchalik tez amalga oshadi.

* Standart og'ir `python:3.12` tasviri o'rniga `python:3.12-slim` yoki `python:3.12-alpine` ishlating.
* **Multi-stage builds** uslubidan foydalanib, faqat tayyor kompilyatsiya bo'lgan `.so` yoki kutubxonalarni yakuniy tasvirga ko'chiring.

**Dockerfile misoli:**
dockerfile
# 1-bosqich: Qurish muhiti
FROM python:3.12-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y gcc python3-dev
COPY requirements.txt .
RUN pip install --user -r requirements.txt

# 2-bosqich: Minimal ishchi muhit
FROM python:3.10-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .
ENV PATH=/root/.local/bin:$PATH
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]


---

## 3. Kesh va Navbatlarni To'g'ri Sozlash (Redis & Celery)

* **Redis Keshlash:** Tez-tez o'zgarmaydigan ma'lumotlarni (Masalan: taomlar menyusi, xodimlar ro'yxati, stol raqamlari) bevosita ma'lumotlar bazasidan emas, balki Redis keshidan o'qish kerak. Django kesh tizimi buning uchun juda qulay.
* **Celery Workerlarni Cheklash:** Lokal serverda Celery ishga tushganda standart holatda barcha CPU yadrolarini band qilishi mumkin (`concurrency`). Lokal sharoitda resursni tejash uchun workerlarni cheklash zarur:
    bash
    celery -A config worker --loglevel=info --concurrency=2


---

## 4. Front-End va Lokal Tarmoq Trafiki

* **Nginx statik fayllar uchun:** Django konteyneri rasmlar va CSS/JS fayllarni yetkazib berish bilan band bo'lmasligi kerak. Nginx konteynerini oldinga qo'yib, statik va media fayllarni bevosita Nginx orqali keshlagan holda tarqatish lozim.
* **Rasmlarni optimallashtirish:** Taomlar rasmlarini Ona tizimga yuklanayotgan paytdayoq siqish (WebP formatiga o'tkazish va hajmini maksimal 500KB gacha cheklash) kerak. Katta hajmli rasmlar lokal tarmoqni ham, sinxronizatsiya tezligini ham sekinlashtiradi.