# 4. Amaliy Ish Oqimi (Workflow) va Deployment Strategiyasi

Yangi mijozni tizimga qo'shish, dasturni restorandagi kompyuterga masofadan o'rnatish hamda favqulodda holatlarda ma'lumotlarni qayta tiklash bosqichlari.

---

## 1. Yangi Restorani O'rnatishning Bosqichma-bosqich Oqimi


[Ona Cloud] Yangi Restoran + Admin yaratiladi -> Litsenziya kaliti beriladi
                                                      |
                                                      v
[Bola Local] Kompyuterga Docker o'rnatiladi -> Kalit kiritiladi
                                                      |
                                                      v
[Ulanish] Lokal tizim kalitni Ona serverga yuboradi va tasdiq oladi
                                                      |
                                                      v
[Sinxronizatsiya] Menyular va Admin ma'lumotlari yuklanadi -> Tizim Tayyor!


---

## 2. Cloudflare Tunnels Orqali Masofaviy Boshqaruv

Restoranlardagi lokal kompyuterlar odatda provayder tomonidan berilgan dinamik IP ortida bo'ladi va ularga tashqi tarmoqdan to'g'ridan-to'g'ri ulanib bo'lmaydi. Statik IP sotib olmaslik va router portlarini ochib xavfga qolmaslik uchun **Cloudflare Tunnel (cloudflared)** ishlatiladi.

### Afzalliklari:
1. Lokal serverga xavfsiz domen bog'lanadi (masalan: `filial1.tizimingiz.uz`).
2. Hech qanday Router/Firewall sozlamalari yoki ochiq portlar talab qilinmaydi.
3. Siz va sizning jamoangiz istalgan joydan turib o'sha filialning lokal Django admin paneliga yoki SSH tizimiga kira olasiz.

**Docker-compose ga qo'shish:**
yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: always
    command: tunnel --no-autoupdate run --token YOUR_CLOUDFLARE_TUNNEL_TOKEN


---

## 2.1. Mobil Ilova Bola'ni Lokal Tarmoqda Qanday Topadi (mDNS)

Xodim/admin mobil ilovasi restoran WiFi'siga ulanganda Bola serverining IP manzilini bilishi kerak. Router'da statik IP/DHCP reservation band qilish har bir restoranda qo'lda sozlash talab qiladi va avtomatik emas - shuning uchun **mDNS (Avahi)** ishlatiladi: Bola kompyuteri o'zini tarmoqda e'lon qiladi, IP o'zgarsa ham (masalan router qayta ishga tushsa) ilova uni qayta topaveradi, qo'lda hech narsa sozlash shart emas.

### O'rnatish (Bola kompyuterida, Docker'dan tashqarida - host darajasida):
1. `sudo apt install avahi-daemon` (Ubuntu Desktop'da odatda oldindan o'rnatilgan bo'ladi).
2. Repodagi `local_server/pos-bola.avahi.service` faylini `/etc/avahi/services/pos-bola.service` ga nusxalang.
3. `sudo systemctl restart avahi-daemon`.

Bu ikkita narsani beradi: (1) kompyuterning o'zi `<hostname>.local` orqali topiladi, (2) `_pos-bola._tcp` xizmat turi e'lon qilinadi (portu 8000, `path=/api/` TXT-record bilan) - mobil ilova hostname'ni oldindan bilishi shart emas, shu xizmat turini DNS-SD/mDNS orqali browse qilib topadi (Flutter'da `multicast_dns` yoki `bonsoir` paketi bilan).

**Muhim eslatma:** ba'zi WiFi router'lar (ayniqsa mehmonxona/tijorat tarmoqlarida) xavfsizlik uchun multicast trafikni (shu jumladan mDNS'ni) bloklaydi - bunday holatda avtomatik topish ishlamaydi. Shu sabab ilovada IP'ni qo'lda kiritish (yoki QR-kod orqali bir martalik ulanish) zaxira variant sifatida albatta qoldirilishi kerak, mDNS faqat qulaylik uchun, yagona yechim sifatida emas.

---

## 3. Favqulodda Holatlarda Tiklash (Disaster Recovery & Backup)

Agar restorandagi lokal server kompyuteri butunlay kuyib ketsa yoki o'g'irlab ketilsa, biznes to'xtab qolmasligi va ma'lumotlar yo'qolmasligi kerak.

### Tiklash algoritmi:
1. Yangi kompyuter keltiriladi va unga operatsion tizim (masalan, Ubuntu LTS) hamda Docker o'rnatiladi.
2. Sizning Git repositoryingizdan `docker-compose.yml` va konfiguratsiyalar tortiladi.
3. Tizim ishga tushgach, eski litsenziya kaliti qayta kiritiladi.
4. Lokal tizim Ona serverga murojaat qiladi. Ona server bu litsenziya kaliti bo'yicha avval barcha sinxronizatsiya bo'lgan ma'lumotlarni (oxirgi cheklar, sotuvlar tarixi, menyu, xodimlar) to'liq paket (dump) ko'rinishida lokal PostgreSQL bazasiga qayta yuklab beradi.
5. Restoran 20-30 daqiqa ichida o'z faoliyatini hech qanday ma'lumot yo'qotishlarsiz davom ettiradi.

---

## 4. MVP (Minimal Ishchi Mahsulot) uchun Yo'l Xaritasi

Loyihani juda murakkablashtirmasdan, dastlabki versiyani tezroq bozorga chiqarish uchun quyidagi ketma-ketlikda ishlang:
* **Faza 1:** Faqat oflayn ishlaydigan lokal POS modulini (Django + PostgreSQL + bitta oddiy kassa interfeysi) bitiring.
* **Faza 2:** Ona serverni va undagi litsenziya/restoran yaratish qismini quring.
* **Faza 3:** Bir tomonlama sinxronizatsiyani (faqat cheklarni Ona tizimga yuborish) Celery orqali joriy qiling.
* **Faza 4:** Xavfsizlik (Cython/PyArmor) va Cloudflare Tunnel yordamida masofaviy monitoringni qo'shing.