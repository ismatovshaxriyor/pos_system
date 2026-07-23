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

### O'rnatish (Avtomatik - Linux host darajasida):
`local_server` katalogida turib bitta komanda bilan o'rnatish:
```bash
sudo ./scripts/setup_avahi.sh
```

Yoki qo'lda:
1. `sudo apt install avahi-daemon avahi-utils` (Ubuntu'da).
2. Repodagi `local_server/pos-bola.avahi.service` faylini `/etc/avahi/services/pos-bola.service` ga nusxalang.
3. `sudo systemctl restart avahi-daemon`.

### O'rnatish (Windows OS host darajasida):
Windows 10/11 tizimlarida mDNS (`dnscache`) o'zi ichida o'rnatilgan hisoblanadi. Faqat Windows Firewall portlarini ochish kerak:
1. PowerShell'ni **Administrator** rejimida oching.
2. `local_server` papkasida turib ushbu skriptni ishga tushiring:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_mdns_windows.ps1
```
Bu skript Windows Defender Firewall'da 8000-port (HTTP) va 5353-port (mDNS UDP) uchun ruxsatlarni avtomatik ochadi. Server `http://<KOMPYUTER_NOMI>.local:8000/api/` manzili orqali WiFi tarmog'ida ko'rinadi.

Bu imkoniyatlarni beradi:
1. Kompyuter tarmog'da `http://<hostname>.local:8000/api/` orqali topiladi.
2. `_pos-bola._tcp` xizmat turi (Port 8000, `path=/api/`, `service=pos-bola`, `version=1.0.0` TXT-recordlar bilan) e'lon qilinadi.


### Server Discovery Ping Endpoint (`GET /api/discovery/`):
Mobil ilova topilgan IP/hostname ga ochiq ping so'rovi yuborib serverni tasdiqlaydi:
```json
{
  "service": "pos-bola",
  "version": "1.0.0",
  "activated": true,
  "restaurant_id": "11111111-1111-1111-1111-111111111111",
  "restaurant_name": "Test Restoran",
  "is_blocked": false,
  "server_time": "2026-07-23T08:50:00Z"
}
```

### Flutter Ilovasida Integratsiya Qilish (Misol: `bonsoir` paketi):
```dart
import 'package:bonsoir/bonsoir.dart';
import 'package:http/http.dart' as http;

Future<String?> discoverBolaServer() async {
  String serviceType = '_pos-bola._tcp';
  BonsoirDiscovery discovery = BonsoirDiscovery(type: serviceType);
  await discovery.ready;
  await discovery.start();

  discovery.eventStream?.listen((event) async {
    if (event.type == BonsoirDiscoveryEventType.discoveryServiceResolved) {
      ResolvedBonsoirService service = event.service as ResolvedBonsoirService;
      String ip = service.host;
      int port = service.port;
      
      // Ping check
      var response = await http.get(Uri.parse('http://$ip:$port/api/discovery/'));
      if (response.statusCode == 200) {
        print('POS Server topildi: $ip:$port');
        await discovery.stop();
        return 'http://$ip:$port/api/';
      }
    }
  });
  return null;
}
```

**Muhim eslatma:** ba'zi WiFi router'lar (ayniqsa mehmonxona/tijorat tarmoqlarida) xavfsizlik uchun multicast trafikni (shu jumladan mDNS'ni) bloklaydi - bunday holatda avtomatik topish ishlamaydi. Shu sabab ilovada IP'ni qo'lda kiritish (yoki QR-kod orqali bir martalik ulanish) zaxira variant sifatida albatta qoldirilishi kerak.

---

## 2.2. Server Yoqilganda mDNS va Docker Avtomatik Ishga Tushishi (Zero-Touch Autostart)

Restoranda svet o'chib yonsa yoki server kompyuteri qayta yoqilsa (reboot), **insonsiz (inshoot xodimisiz)** barcha servislar avtomatik ishga tushadi:

1. **mDNS (Avahi) Avto-start**:
   `sudo ./scripts/setup_avahi.sh` skripti o'rnagach `systemctl enable avahi-daemon` komandasini bajaradi. Tizim yoqilishi bilan Avahi fon rejimida mDNS va `_pos-bola._tcp` xizmatini darhol e'lon qilishni boshlaydi.

2. **Docker Konteynerlar Avto-start**:
   `docker-compose.yml` ichidagi barcha servislarda `restart: unless-stopped` ko'rsatilgan. Tizim va Docker daemon ko'tarilishi bilan Django Web (Daphne), Redis, Postgres va Celery konteynerlari avtomatik ishga tushadi.

3. **BIOS/UEFI Sozlamasi (Tavsiya)**:
   Server kompyuterining BIOS sozlamalarida **"Restore AC Power Loss" / "Auto Power On"** parametrini `Enable` qilib qo'yilsa, tok o'chib kelganda kompyuterning o'zi tugmasiz avtomatik yonadi va tizim 1-2 daqiqada to'liq tayyor bo'ladi.

---

## 2.3. Kassa Planshetida Xodimlarning 6-Xonali Kod va Smenalarni Almashtirib Kirishi (Staff PIN & Shift Swap)

Kassa terminali va planshetlarda xodimlarning operativ va xavfsiz ishlashi uchun PIN autentifikatsiya quyidagicha tashkil etilgan:

1. **Menejer Tarafidan Kod Yaratish**:
   Restoran menejeri admin panelida xodim uchun bir martalik **6-xonali raqamli kod** (masalan `482915`) generatsiya qilib beradi (`generate_registration_code`).
2. **Planshetni Biriktirish va PIN Belgilash**:
   Xodim planshetda shu 6-xonali kodni kiritib, o'ziga qulay 6-xonali shaxsiy PIN kodi (`112233`) o'rnatadi.
3. **Kassada Smenalarni Almashtirib Kirish (Shift Swap)**:
   - Restoran kassa planshetida bir nechta kassirlar navbatma-navbat ishlashi mumkin.
   - 1-kassir smenani yakunlaganda, 2-kassir xuddi shu kassa planshetida o'zining 6-xonali PIN kodini (`654321`) kiritadi.
   - `verify_pin_login` planshetning faol seansini darhol 2-kassirga o'tkazadi va unga shaxsiy token beradi (planshetni qayta ro'yxatdan o'tkazish shart bo'lmaydi).

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