# local_server (Bola) — Deployment va Tarmoq Qo'llanmasi

Ushbu hujjat **Bola server** (lokal POS serveri) ni restoranda birinchi marta o'rnatish, tarmoqda avtomatik topish (mDNS / DNS-SD), avto-ishga tushirish (Zero-Touch Autostart) va xavfsiz sozlash bo'yicha to'liq qo'llanmadir.

---

## 1. Talablar (Prerequisites)

- **Operatsion Tizim**: Ubuntu 22.04 LTS / Debian 12 (Tavsiya etiladi) yoki Windows 10/11 Pro
- **Dasturlar**: Docker (20.10+), Docker Compose (v2.x+)
- **Tarmoq Portlari**:
  - `8000` (HTTP API, WebSockets & Admin Panel)
  - `5353` (mDNS UDP - Tarmoqda avtomatik topish)
  - `9100` (Raw TCP - Oshxona tarmoq printerlari)

---

## 2. Tez o'rnatish (tavsiya): bitta skript

Loyiha papkasini (zip yoki git) yangi kompyuterga ko'chirib, shu skriptni ishga tushiring - u hamma narsani bir marta so'raydi, yetishmayotgan dasturlarni (Docker va h.k.) o'zi o'rnatadi, ruxsatlarni sozlaydi va serverni ko'taradi:

```bash
# Linux / macOS
./scripts/install.sh
```
```powershell
# Windows (Administrator huquqini o'zi so'raydi)
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

Parametrlar: `--yes` (savolsiz), `--build` (image'ni shu yerda qurish), `--config-only` (faqat `.env`/fayllarni tayyorlash). Windows'da WSL2 birinchi marta yoqilsa kompyuterni qayta yoqib, skriptni yana ishga tushirish kerak bo'ladi. Quyidagi 2-bo'lim qadamlari shu skript nima qilishining qo'lda varianti.

## 2a. Birinchi Marta Ishga Tushirish (Quick Start)

### 1-qadam: Konteynerlarni ko'tarish
`local_server` katalogida turib:
```bash
docker compose up -d --build
```

### 2-qadam: Litsenziyani faollashtirish
Ona serverdan berilgan litsenziya kaliti bilan faollashtiring:
```bash
docker compose exec web python manage.py activate_license <LITSENZIYA_KALITI>
```

---

## 3. Tarmoqda Avtomatik Topish (mDNS / Auto-Discovery Setup)

Mijoz (ofitsiant/kassir plansheti) serverning IP manzilini har safar qo'lda kiritmasligi uchun bir marta mDNS sozlanadi.

### Linux (Ubuntu/Debian) Serverida (1 martalik sozlash):
`local_server` katalogida turib:
```bash
sudo ./scripts/setup_avahi.sh
```
*Bu skript Avahi daemon'ini o'rnatadi, `pos-bola.avahi.service` ni joylashtiradi va systemd avto-yuklanishini yoqadi.*

### Windows (10/11) Serverida (1 martalik sozlash):
PowerShell'ni **Administrator** rejimida ochib:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_mdns_windows.ps1
```
*Bu skript Windows Defender Firewall'da 8000 (HTTP) va 5353 (mDNS UDP) portlariga ruxsat beradi va `_pos-bola._tcp` ni e'lon qiladigan **"POS Bola mDNS"** vazifasini o'rnatadi (`scripts/advertise_mdns_windows.ps1 -Install`). Windows'ning o'zi bu servisni e'lon qilmaydi. Vazifa Windows 10/11 ning ichki mDNS API'sidan (`DnsServiceRegister`) foydalanadi, Bonjour shart emas. U kompyuter yoqilganda SYSTEM nomidan ishga tushadi va har 15 soniyada LAN IP'ni tekshiradi: Wi-Fi/kabel almashsa yoki DHCP yangi manzil bersa, e'lonni yangi IP bilan qayta qiladi. Host nomi `pos-bola.local` (ilovalar shu nomni ham sinaydi). Agar bu nom ochilmasa, `<KOMPYUTER_NOMI>.local` ishlatiladi. `install.ps1` buni avtomatik qiladi.*

Holatni tekshirish: `powershell -ExecutionPolicy Bypass -File .\scripts\advertise_mdns_windows.ps1 -Status` (vazifa holati, hozirgi LAN IP, `C:\ProgramData\PosBola\mdns.log` ning oxiri). Olib tashlash: `-Uninstall`.

**Eslatma:** mDNS IP *o'zgarishini* hal qiladi, IP *yo'qligini* emas. Server routerdan manzil ololmasa (`ipconfig` da `169.254.x.x`: zaif Wi-Fi, IP bermaydigan port), uni hech qaysi usul topa olmaydi. Server uchun Ethernet kabel tavsiya etiladi.

---

## 4. Mobil Ilova Serverni Qanday Topadi?

mDNS sozlangandan so'ng, server Wi-Fi tarmog'ida quyidagicha ko'rinadi:

1. **Lokal Domain Nom orqali**:
   - `http://<KOMPYUTER_NOMI>.local:8000/api/`
2. **mDNS Service Type (DNS-SD)**:
   - Servis turi: `_pos-bola._tcp` (Port 8000, `path=/api/`, `version=1.0.0`)
   - Flutter ilovasi `bonsoir` yoki `multicast_dns` paketi bilan Wi-Fi tarmog'ini skanerlab, server IP va portini avtomatik aniqlaydi.
3. **Discovery Ping Endpoint (`GET /api/discovery/`)**:
   - Ilova topilgan IP'ga ochiq so'rov yuborib server haqiqiyligini tekshiradi:
     ```json
     {
       "service": "pos-bola",
       "version": "1.0.0",
       "activated": true,
       "restaurant_id": "11111111-1111-1111-1111-111111111111",
       "restaurant_name": "Test Restoran",
       "is_blocked": false
     }
     ```

---

## 5. Xodimlarning 6-Xonali Kod va Kassa Planshetida Smenalarni Almashtirib Kirishi (Staff PIN & Shift Swap)

Kassa va planshetlarda xodimlarning ishlashi quyidagicha tashkil etiladi:

1. **6-Xonali Kod Generatsiya Qilish**:
   - Restoran menejeri admin panelda kassir/afitsiant uchun bir martalik **6-xonali raqamli kod** (masalan `482915`) generatsiya qilib beradi (`POST /api/users/{id}/generate-registration-code/`).
2. **Planshetni Biriktirish va PIN o'rnatish**:
   - Kassir kassa planshetida shu 6-xonali kodni hamda o'zining shaxsiy 6-xonali PIN kodini (`112233`) kiritadi (`POST /api/auth/device/register/`).
3. **Kassa Planshetida Smenalarni Almashtirib Kirish (Shift Swap)**:
   - 1-kassir smenani yakunlagach, 2-kassir xuddi shu kassa planshetida o'zining 6-xonali PIN kodini (`654321`) kiritadi (`POST /api/auth/pin-login/`).
   - Tizim kassa planshetining faol seansini 2-kassirga o'tkazadi va unga shaxsiy token beradi (planshetni qayta ro'yxatdan o'tkazish shart bo'lmaydi).

---

## 6. Tok O'chib-Yonganda Avtomatik Ishga Tushish (Zero-Touch Autostart)


Svet o'chib yonganda yoki kompyuter qayta yoqilganda (reboot), **insonsiz (hech qanday buyruqsiz)** barcha servislar avtomatik ko'tariladi:

1. **Docker Servislar**: `docker-compose.yml` ichidagi `restart: unless-stopped` parametri tufayli Django, Redis, Postgres va Celery avtomatik ishga tushadi.
2. **mDNS Daemon**: `avahi-daemon` (Linux) yoki "POS Bola mDNS" vazifasi (Windows, Task Scheduler, `AtStartup`) OS yuklanishi bilan avtomatik ishga tushadi.
3. **BIOS Auto-Power On (Tavsiya)**: Server kompyuteri BIOS sozlamalarida **"Restore AC Power Loss" / "Auto Power On"** parametridagi `Enable` qilib qo'yilsa, tok kelishi bilan kompyuterning o'zi avtomatik yonadi.

---

## 7. Turli Subnetdagi Termoprinterlarni Ulash (Multi-Subnet Printing)

Restoran termoprinterlari (Xprinter va h.k.) zavoddan kelganda boshqa IP subnetda (masalan `192.168.123.100` yoki `192.168.1.87`) bo'lishi mumkin, server Wi-Fi/LAN tarmog'i esa masalan `192.168.10.x` bo'lishi mumkin. Bunday holda ular bir-birini standart TCP (port 9100) orqali ko'ra olmaydi.

### Birinchi tanlov - printerning o'z IP'sini to'g'irlash
Eng ishonchli va tavsiya etiladigan yo'l: printerning o'zini (self-test sahifa/tarmoq sozlash menyusi orqali) restoran routerining haqiqiy LAN subnetiga mos statik IP'ga (yoki DHCP'ga) o'tkazish. Shunda hech qanday qo'shimcha sozlash shart emas.

### Agar printer IP'sini o'zgartirib bo'lmasa - HOST darajasida bir martalik alias skripti
**Muhim: bu muammo faqat serverning o'zi (host OS) darajasida hal qilinishi mumkin, `local_server` konteyneri ichidan EMAS.** `web`/`celery_worker` konteynerlarida na `sudo`, na `ip` buyrug'i, na `NET_ADMIN` tarmoq huquqi yo'q (Docker standart bridge tarmog'ida ishlaydi) - shu sababli konteyner ichidan hostning haqiqiy tarmoq kartasiga IP-alias qo'sha olmaydi. Buning o'rniga, serverni restoranga birinchi o'rnatayotganda quyidagi skriptni **host operatsion tizimida, bir marta** ishga tushiring - u eng ko'p tarqalgan zavod-standart termoprinter subnetlarini (`192.168.123.x`, `192.168.1.x`, `192.168.0.x`) serverning tarmoq kartasiga doimiy alias sifatida biriktiradi:

- **Linux (Ubuntu)**:
  ```bash
  sudo ./scripts/setup_printer_subnets.sh
  ```
- **Windows**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\setup_printer_subnets.ps1
  ```

Ishlaganini tekshirish: `ip addr show` (Linux) buyrug'ida `192.168.123.250`, `192.168.1.250`, `192.168.0.250` manzillari ko'rinishi kerak. Alias qayta yuklanishda (reboot) saqlanib qolishi uchun buni tizim yuklanishida (masalan `systemd` unit yoki `rc.local`) avtomatik ishga tushiradigan qilib qo'yish tavsiya etiladi - skriptning o'zi bir martalik, doimiy emas.

---

## 8. Zaxira Usullar (Fallback Options)


Agar restorandagi Wi-Fi router multicast (mDNS) trafigini bloklagan bo'lsa:
1. **Routerda Static DHCP Lease**: Router sozlamalariga kirib serverning MAC manziliga doimiy IP (`192.168.1.200`) biriktirish.
2. **QR-Kod Skanerlash**: Server ekranidagi/admin panelidagi IP joylashtirilgan QR-kodni bir marta skanerlab planshetga saqlash.

---

## 9. Nosozliklarni Aniqlash (Troubleshooting)

- **mDNS e'lon qilinayotganini tekshirish (Linux/macOS)**:
  ```bash
  avahi-browse -rt _pos-bola._tcp
  # yoki macOS:
  dns-sd -B _pos-bola._tcp local.
  ```
- **Discovery API ishlashini tekshirish**:
  ```bash
  curl -i http://localhost:8000/api/discovery/
  ```
- **Konteynerlar holati**:
  ```bash
  docker compose ps
  docker compose logs -f web
  ```
- **Printerga ulanmayapti (`test-print` 502 qaytaryapti)**: avval printer bilan server bir subnetdami tekshiring - `ping <printer_ip>` konteynerdan emas, **host'ning o'zidan** ishlashi kerak (`docker compose exec web ping <printer_ip>` ishlamaydi, chunki konteyner Docker bridge tarmog'ida). Agar ping o'tmasa - 7-bo'limdagi alias skriptini ishga tushiring yoki printerning o'z IP'sini to'g'irlang.
