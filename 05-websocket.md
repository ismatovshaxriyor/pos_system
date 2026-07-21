# Real-vaqt (WebSocket)

**Diqqat**: bu OpenAPI/Swagger sxemasida (`/api/schema/`) umuman ko'rinmaydi — WebSocket alohida protokol, avtomatik kod generatorlari buni qamramaydi. Shu fayl WS shartnomasining yagona manbasi.

## Ulanish

```
ws://<bola-server-ip>:8000/ws/events/?token=<token>&device_id=<device_id>
```

- Ulanishda **ikkala** query parametr: `token` (40-belgili API token) hamda `device_id` (faol va tasdiqlangan qurilma UUID'si) yuborilishi shart.
- Token va device_id tekshiruvi backend'da `TokenAuthMiddleware` orqali amalga oshiriladi (agar token yoki device_id xato bo'lsa, ulanish rad etiladi).
- Prod muhitda `wss://` (TLS) ishlatiladi (Cloudflare Tunnel orqali).

### Flutter misoli (`web_socket_channel` paketi)

```dart
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

class RealtimeClient {
  WebSocketChannel? _channel;

  void connect(String baseWsUrl, String token, String deviceId) {
    _channel = WebSocketChannel.connect(
      Uri.parse('$baseWsUrl/ws/events/?token=$token&device_id=$deviceId'),
    );

    _channel!.stream.listen(
      (raw) {
        final message = jsonDecode(raw as String) as Map<String, dynamic>;
        final event = message['event'] as String;
        final data = message['data'] as Map<String, dynamic>;

        switch (event) {
          case 'table_status_changed':
            // masalan: stollar ro'yxatini qayta yuklash
            break;
          case 'price_changed':
            // masalan: bildirishnomalar ro'yxatini yangilash
            break;
          default:
            // tanimagan hodisa turi - e'tiborsiz qoldiriladi (kelajakdagi
            // yangi turlarga moslashuvchan bo'lish uchun)
            break;
        }
      },
      onDone: () {
        // qarang pastdagi "Qayta ulanish" bo'limi - close kodini
        // (_channel!.closeCode) tekshirib, tegishli harakat qiling
      },
    );
  }

  void dispose() => _channel?.sink.close();
}
```

## Ulanish rad etilishi

Server ulanishni handshake bosqichida yopishi mumkin (close kod bilan):

| Close kod | Sabab |
|---|---|
| `4001` | Token yo'q yoki yaroqsiz |
| `4402` | Litsenziya kill-switch faol (restoran bloklangan) |

Ilova bu holatlarda WebSocket'ni qayta ulashga urinmasligi kerak — avval tegishli muammoni hal qilish kerak (qayta login, yoki to'lov holatini tekshirish).

## Ulanish davomida uzilish

| Close kod | Sabab |
|---|---|
| `4403` | Admin shu foydalanuvchining qurilmasini chetlashtirdi (`/api/devices/{id}/revoke/`) - ilova darhol login ekraniga qaytishi kerak |

## Kelayotgan xabarlar formati

Har bir xabar shu formatda keladi:
```json
{"event": "<event_turi>", "data": {...}}
```

### `table_status_changed`

```json
{"event": "table_status_changed", "data": {"table_id": 1}}
```

**Muhim**: payload FAQAT `table_id`ni o'z ichiga oladi, tayyor `status` qiymatini EMAS — chunki stol holati (`free`/`occupied_by_me`/`occupied`) so'rovchiga nisbiy, bitta broadcast xabari hammaga bir xil to'g'ri qiymatni bera olmaydi. Bu xabarni **"shu stolni qayta so'rang" signali** sifatida ko'ring: xabar kelganda `GET /api/tables/` (yoki bitta stol kerak bo'lsa mos filtr) qayta chaqirilishi kerak.

Qachon yuboriladi: stol biriktirilgan buyurtma ochilganda (`POST /api/orders/`), boshlanganda (`start`), yopilganda (`close`/`close-on-credit`), bekor qilinganda (`cancel`), shuningdek **stol summasini o'zgartiruvchi** `add_item`, `add_payment`, `set_discount` amallarida ham. Kassirning jonli stol-sotuvlari xaritasi ([`10-kassir-jonli-sotuv.md`](10-kassir-jonli-sotuv.md)) aynan shu signalga tayanadi — kelganda `GET /api/tables/live-sales/`ni qayta so'raydi.

### `order_updated`

```json
{"event": "order_updated", "data": {"order_id": 10}}
```

Xuddi `table_status_changed` kabi "qayta so'rang" signali — payload'da faqat `order_id`. Kelganda `GET /api/orders/{id}/` chaqirib yangi holatni oling (yangi item, yangi to'lov, o'zgargan `status`/`balance_due`).

Qachon yuboriladi: `add_item`, `add_payment`, `start`, `close`, `cancel` muvaffaqiyatli bo'lganda. **Takeaway/delivery (stolsiz) buyurtmalar uchun bu yagona signal** — ular `table_status_changed` yubormaydi, shuning uchun buyurtma ekranlari faqat stol hodisasiga tayanmasligi kerak.

### `discount_applied`

```json
{"event": "discount_applied", "data": {"order_id": 10, "message": "Chegirma qo'llandi: Buyurtma #10 0 -> 5000 so'm (+998901112255)"}}
```

Menejer chegirma qo'llaganda (`set_discount`, summa haqiqatan o'zgargan bo'lsa). `price_changed` kabi bir vaqtda doimiy bildirishnoma (`GET /api/notifications/`) ham yoziladi.

### `price_changed`

```json
{"event": "price_changed", "data": {"product_id": 3, "message": "Narx o'zgartirildi: Choy 5000.00 -> 6000.00 (+998901112255)"}}
```

Faqat admin ilovasi uchun muhim (menejer narx o'zgartirganda). Bir vaqtda `GET /api/notifications/` orqali ham doimiy (persisted) yozuv paydo bo'ladi — WebSocket xabari real-vaqt "push" uchun, agar ilova o'sha paytda ochiq bo'lmasa, keyingi safar ochilganda bildirishnoma ro'yxatidan ko'rinadi (hech narsa yo'qolmaydi).

### `low_stock`

```json
{"event": "low_stock", "data": {"ingredient_id": 4, "message": "Zaxira kam qoldi: Tuz - 1.000 kg (chegara: 5.000)"}}
```

Ombor ingredienti sotuv paytida birinchi marta minimal zaxiradan pastga tushganda (faqat menejer ilovasi uchun muhim). Bir vaqtda `GET /api/notifications/` orqali doimiy yozuv ham paydo bo'ladi. Ombor tafsilotlari — [`12-ombor.md`](12-ombor.md). **Sotuv bloklanmaydi**, bu faqat ogohlantirish.

## Yangi hodisa turlari

Bu infratuzilma qayta ishlatiladigan qilib qurilgan — backend'ga yangi hodisa turi qo'shilishi mumkin (masalan kelajakda buyurtma holati o'zgarishi, smena bildirishnomasi va h.k.). Ilova tomonda buni hal qilishning eng barqaror yo'li: `event` maydoni bo'yicha `switch`/`when` qilib, TANIMAGAN `event` qiymatlarini shunchaki e'tiborsiz qoldirish (yangi backend versiyasi eski ilova bilan ham ishlashda davom etishi uchun).

## Qayta ulanish (reconnect)

Server tomonda "heartbeat"/ping mexanizmi yo'q (hozircha) - ilova tarmoq uzilishini o'zi kuzatib, eksponensial backoff bilan qayta ulanishi tavsiya etiladi. Qayta ulanganda avval `GET /api/tables/` va `GET /api/notifications/`ni yangilab olish kerak — WebSocket uzilgan vaqtdagi hodisalar qayta yuborilmaydi (bu "hozirgi holatni qayta so'rang" signali, event-log emas).
