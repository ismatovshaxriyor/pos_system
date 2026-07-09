# 1. "Ona-Bola" (Cloud-Local) Arxitekturasi va Sinxronizatsiya Tizimi

Ushbu hujjatda restoranlar uchun POS tizimining markaziy bulutli server ("Ona") va restoran ichidagi lokal serverlar ("Bola") o'rtasidagi o'zaro aloqa, ma'lumotlar almashinuvi va monitoring mexanizmlari batafsil yoritilgan.

---

## 1. Arxitektura Umumiy Tavsifi

Restoran biznesida internetning uzilib qolishi odatiy hol bo'lganligi sababli, POS tizimi 100% oflayn rejimda ishlay olishi shart. Buning uchun tizim gibrid ko'rinishda loyihalashtiriladi:

* **Ona Tizim (Markaziy Cloud):** AWS, Google Cloud yoki Contabo kabi bulutli infratuzilmada joylashadi. U umumiy boshqaruv, analitika, billing (to'lovlar) va litsenziyalarni nazorat qiladi.
* **Bola Tizim (Lokal POS):** Restorandagi asosiy kompyuterda (Mini PC, noutbuk) Docker konteynerlari ichida ishlaydi. Kassir, ofitsiant va barmenlar faqat shu lokal serverga ulanishadi.

---

## 2. Ma'lumotlar Bazasi Modeli va UUID Muammosi

Lokal bazalarda yaratilgan ma'lumotlar bulutga yig'ilganda `Primary Key` (ID) to'qnashuvlari (conflict) yuzaga kelmasligi uchun Django modellarida standart `AutoField` (1, 2, 3...) o'rniga mutloq yagona bo'lgan `UUIDField` ishlatilishi shart.

### Django Model misoli:
python
import uuid
from django.db import models

class RestaurantOrder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    restaurant_id = models.UUIDField()  # Qaysi restoranga tegishli ekanligi
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    is_synced = models.BooleanField(default=False)  # Bulutga ketganlik belgisi

    class Meta:
        db_table = 'restaurant_orders'


---

## 3. Ma'lumotlar Sinxronizatsiyasi (Data Sync Engine)

Sinxronizatsiya jarayoni ikki tomonlama (Two-Way Synchronization) ishlaydi va fondagi vazifalar (Celery + Redis) orqali boshqariladi.

### A. Bola -> Ona (Upstream Sync):
1. Kassir buyurtmani yopganda, lokal bazaga yoziladi va `is_synced = False` holatda bo'ladi.
2. Celery Beat har 1 yoki 5 daqiqada ishga tushadi va `is_synced=False` bo'lgan barcha obyektlarni yig'adi.
3. Ma'lumotlar JSON formatiga o'girilib, Ona tizimning xavfsiz API endpointsiga (Django REST Framework) POST so'rovi orqali yuboriladi.
4. Ona tizim ma'lumotlarni muvaffaqiyatli qabul qilib, bazaga saqlagach, `201 Created` javobini qaytaradi.
5. Bola tizim ushbu javobni olgach, lokal obyektdagi `is_synced` maydonini `True` ga o'zgartiradi.

### B. Ona -> Bola (Downstream Sync):
1. Restoran egasi Ona tizim (Admin panel) orqali menyuga yangi taom qo'shadi yoki narxni o'zgartiradi.
2. Ushbu o'zgarish Ona bazasida maxsus `MenuUpdateLog` jadvaliga yoziladi.
3. Bola tizim vaqti-vaqti bilan (yoki admin buyruq berganda) Ona serverdan yangilanishlar bor-yo'qligini so'raydi (GET request).
4. Yangi ma'lumotlar yuklanib, lokal bazaga integratsiya qilinadi.

---

## 4. Heartbeat (Monitoring) Mexanizmi

Lokal serverning holatini va internet mavjudligini markazdan turib bilish uchun **Heartbeat** tizimi joriy qilinadi.

1. Bola tizim har 60 soniyada Ona tizimga yengil ping so'rovini yuboradi.
2. So'rov ichida lokal tizimning joriy holati (CPU yuklamasi, RAM, oxirgi chek ID-si) bo'ladi.
3. Ona server bu so'rovni qabul qilib, Redis keshida o'sha restoranning `last_seen` vaqtini yangilab qo'yadi.
4. Agar Ona server 3 daqiqa davomida signallarni qabul qilmasa, monitoring panelida ushbu restoran "Oflayn" holatga o'tadi va sizga (yoki texnik guruhga) ogohlantirish (Telegram/Email notification) yuboriladi.