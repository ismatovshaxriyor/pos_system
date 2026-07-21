# Kassir — jonli stol-sotuvlari (real-vaqt)

Kassir ilovasi restoran stollari xaritasini ochib, har bir **band** stolda hozir qancha sotuv ketayotganini (joriy buyurtma summasi) real-vaqtda ko'rishi uchun. Bitta ro'yxat endpoint + mavjud WebSocket signali (`table_status_changed`) birga ishlaydi: signal kelganda ro'yxat qayta so'raladi.

## `GET /api/tables/live-sales/`

Har bir faol (`new`/`in_progress` buyurtmali) stol uchun bitta qator qaytaradi. **Sahifalanmaydi** — to'g'ridan-to'g'ri massiv (`[...]`) qaytadi, `results` bilan o'ralmagan.

**Ruxsat:** faqat `role = cashier` yoki `manager`. Ofitsiant (`waiter`) `403` oladi — boshqa xodimlarning stol summalarini ko'rmasligi uchun (bu `GET /api/tables/`dagi `status` maydonining so'rovchiga-nisbiy bo'lishi bilan bir xil sabab).

**Javob (200):**
```json
[
  {
    "table_id": 1,
    "table_name": "Stol 1",
    "zone": "Zal",
    "order_id": 42,
    "waiter": "Olim",
    "guest_count": 4,
    "item_count": 6,
    "total_amount": "150000.00",
    "final_amount": "150000.00",
    "amount_paid": "50000.00",
    "balance_due": "100000.00",
    "opened_at": "2026-07-21T12:30:00+05:00"
  }
]
```

| Maydon | Tur | Izoh |
|---|---|---|
| `table_id` / `table_name` / `zone` | int / string / string\|null | Stol va uning hududi |
| `order_id` | int | Joriy faol buyurtma |
| `waiter` | string \| null | Buyurtmani ochgan ofitsiant ismi (`first_name`) |
| `guest_count` | int | Mehmonlar soni |
| `item_count` | int | Void bo'lmagan taomlar umumiy soni (miqdorlar yig'indisi) |
| `total_amount` | string (Decimal) | Taomlar summasi |
| `final_amount` | string (Decimal) | Chegirma/soliq/xizmat haqidan keyingi yakuniy summa |
| `amount_paid` | string (Decimal) | Shu buyurtmaga to'langan qism (split-payment yig'indisi) |
| `balance_due` | string (Decimal) | Qolgan to'lov |
| `opened_at` | string (ISO datetime) | Buyurtma ochilgan vaqt |

Bo'sh stollar (faol buyurtmasiz) ro'yxatga **kirmaydi**. Buyurtma `completed`/`cancelled` bo'lgach, o'sha stol ro'yxatdan chiqadi.

## Real-vaqt yangilanish

Kassir ilovasi WebSocket (`ws/events/`, [`05-websocket.md`](05-websocket.md))ga ulanadi va **`table_status_changed`** hodisasini tinglaydi. Bu hodisa endi stol summasini o'zgartiruvchi barcha amallarda keladi: buyurtma ochish, `start`, `add_item`, `add_payment`, `set_discount`, `close`, `cancel`. Hodisa kelganda ilova `GET /api/tables/live-sales/`ni qayta chaqirib xaritani yangilaydi (payload faqat `{"table_id": N}` — yengil "qayta so'rang" signali).

```
WS: {"event": "table_status_changed", "data": {"table_id": 1}}
  → GET /api/tables/live-sales/  (butun xaritani yangilash)
```
