# 2. Tizim Xavfsizligi, Qaroqchilikka Qarshi Himoya va Litsenziyalash

Python interpretatsiya qilinadigan til bo'lgani uchun, uning kodini mijoz kompyuterida himoya qilish alohida yondashuvni talab etadi. Ushbu hujjat kodni yashirish va masofaviy litsenziya nazoratini tashkil qilishni tushuntiradi.

---

## 1. Python Kodini Shifrlash va Kompilyatsiya Qilish

Dasturning yadrgosi (Core logic), ayniqsa litsenziyani tekshiruvchi modullarni ochiq `.py` fayl ko'rinishida qoldirish mutloq taqiqlanadi.

### A. Cython orqali `.so` (Linux Binary) qilish (Eng ishonchli usul):
Cython Python kodini C tiliga o'giradi va uni mashina kodiga (Binary) kompilyatsiya qiladi. Natijada kodni qayta tiklash (reverse engineering) deyarli imkonsiz bo'ladi.

**Kompilyatsiya skripti (`setup.py`):**
python
from setuptools import setup
from Cython.Build import cythonize

setup(
    ext_modules = cythonize(["core/license_checker.py", "core/sync_engine.py"])
)

Bu skript ishga tushgach, `license_checker.c` va undan keyin `license_checker.cpython-310-x86_64-linux-gnu.so` fayli hosil bo'ladi. Siz Docker Image ichiga faqat shu `.so` faylni joylaysiz, `.py` faylni esa o'chirib tashlaysiz. Django ushbu faylni xuddi oddiy moduldek import qila oladi.

### B. PyArmor orqali Obfuskatsiya:
Agar kompilyatsiya murakkablik qilsa, PyArmor vositasidan foydalanib kodlarni o'qib bo'lmaydigan (obfuscated) holatga keltirish mumkin. U kod ichidagi o'zgaruvchilar, funksiyalar nomlarini chalkashtirib tashlaydi va shifrlaydi.

---

## 2. Qurilmaga Bog'lash (Hardware Fingerprinting)

Litsenziya kaliti boshqa kompyuterlarga ko'chirib o'tkazilganda ishlamasligi uchun, u o'rnatilgan qurilmaning unikal apparat qismlariga bog'lanishi kerak.

Lokal server ishga tushganda quyidagi parametrlarni o'qiydi:
* Motherboard UUID (`/sys/class/dmi/id/product_uuid`)
* Asosiy tarmoq kartasining MAC manzili
* CPU Serial Number

### Apparat xeshini olish algoritmi:
python
import hashlib
import subprocess

def get_hardware_uuid():
    try:
        # Linux tizimlari uchun motherboard UUID ni o'qish
        uuid = subprocess.check_output(['cat', '/sys/class/dmi/id/product_uuid']).decode().strip()
        return hashlib.sha256(uuid.encode()).hexdigest()
    except Exception:
        return "fallback_local_hash_code"

Litsenziya kaliti faqatgina mana shu xesh bilan mos kelgandagina lokal tizim ma'lumotlar bazasini faollashtiradi.

---

## 3. Masofadan Bloklash (Kill-Switch) Mexanizmi

Agar restoran oylik to'lovni amalga oshirmasa yoki shartnomani buzsa, tizimni masofadan to'xtatish imkoniyati bo'lishi kerak.

1.  **Vaqtinchalik Tokenlar:** Ona server litsenziyani tasdiqlaganda abadiy kalit emas, balki muddati cheklangan (masalan, 7 kunlik) shifrlangan JWT token qaytaradi.
2.  **Lokal Tekshiruv:** Lokal server har kuni background task orqali joriy vaqtni token ichidagi `exp` (expiration time) bilan solishtiradi.
3.  **Bloklash:** Agar token muddati tugasa va internet yo'qligi sababli yangilanmasa (yoki Ona tizim uni yangilashni rad etsa), Django lokal middleware darajasida barcha so'rovlarni to'xtatadi va ekranga *"Tizim bloklandi. To'lovni amalga oshiring"* xabari chiqariladi.

---

## 4. Docker va Ma'lumotlar Bazasi Xavfsizligi

* **Read-Only Containers:** Docker-compose ichida Django konteynerini `read_only: true` parametrib bilan ishga tushiring. Bu buzg'unchilarga konteyner ichidagi fayllarni o'zgartirish imkonini bermaydi. Media va log fayllar uchun alohida tashqi hajm (`volumes`) bog'lanadi.
* **Tarmoq izolyatsiyasi:** PostgreSQL va Redis konteynerlari tashqi dunyoga (`ports` bo'limi orqali) ochilmasligi shart. Ular faqat Docker'ning ichki `networks` tarmog'ida faqat Django konteyneri bera oladigan ichki IP orqali gaplashishi kerak.