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

## 2. Birinchi Marta Ishga Tushirish (Quick Start)

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
*Bu skript Windows Defender Firewall'da 8000 (HTTP) va 5353 (mDNS UDP) portlariga ruxsat beradi.*

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

## 5. Tok O'chib-Yonganda Avtomatik Ishga Tushish (Zero-Touch Autostart)

Svet o'chib yonganda yoki kompyuter qayta yoqilganda (reboot), **insonsiz (hech qanday buyruqsiz)** barcha servislar avtomatik ko'tariladi:

1. **Docker Servislar**: `docker-compose.yml` ichidagi `restart: unless-stopped` parametri tufayli Django, Redis, Postgres va Celery avtomatik ishga tushadi.
2. **mDNS Daemon**: `avahi-daemon` (Linux) yoki `dnscache` (Windows) OS yuklanishi bilan avtomatik yoqiladi.
3. **BIOS Auto-Power On (Tavsiya)**: Server kompyuteri BIOS sozlamalarida **"Restore AC Power Loss" / "Auto Power On"** parametridagi `Enable` qilib qo'yilsa, tok kelishi bilan kompyuterning o'zi avtomatik yonadi.

---

## 6. Zaxira Usullar (Fallback Options)

Agar restorandagi Wi-Fi router multicast (mDNS) trafigini bloklagan bo'lsa:
1. **Routerda Static DHCP Lease**: Router sozlamalariga kirib serverning MAC manziliga doimiy IP (`192.168.1.200`) biriktirish.
2. **QR-Kod Skanerlash**: Server ekranidagi/admin panelidagi IP joylashtirilgan QR-kodni bir marta skanerlab planshetga saqlash.

---

## 7. Nosozliklarni Aniqlash (Troubleshooting)

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
