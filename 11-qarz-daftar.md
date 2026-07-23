# Qarz daftar (mijozlar + kreditga yopish)

Mijozga (qarzga) buyurtma yozib yopish, har mijozning umumiy qarz balansini yuritish va keyinchalik qarzni to'lash uchun. Yangi `Customer` modeli + har bir qarz harakati (`DebtTransaction`) ledger sifatida saqlanadi.

## Maydonlar (`Customer`)

| Maydon | Tur | Yozish | Izoh |
|---|---|---|---|
| `id` | int | o'qish | |
| `first_name` | string | yozish | Ism (majburiy) |
| `last_name` | string | yozish | Familya (ixtiyoriy) |
| `phone` | string | yozish | `+998xxxxxxxxx` formatida, ixtiyoriy |
| `note` | string | yozish | Eslatma |
| `balance` | string (Decimal) | **faqat o'qish** | Joriy umumiy qarz qoldig'i. Faqat kreditga-yopish / qarz-to'lash orqali o'zgaradi — to'g'ridan-to'g'ri yozib bo'lmaydi |
| `is_active` | bool | yozish | |

## Mijozlar ro'yxati / CRUD

```
GET    /api/customers/                → ro'yxat (sahifalangan: results ichida)
POST   /api/customers/                → yaratish (kassir yoki menejer)
GET    /api/customers/{id}/           → bitta mijoz
PATCH  /api/customers/{id}/           → tahrirlash (kassir yoki menejer)
DELETE /api/customers/{id}/           → o'chirish (faqat menejer)
```

**Ruxsat:** o'qish (ro'yxat/bitta mijoz) — `cashier` yoki `manager`; yozish (yaratish/tahrirlash/o'chirish) — faqat `manager`. **Ofitsiant (`waiter`) qarz daftariga umuman kira olmaydi** (ro'yxat/o'qish ham `403`) — mijoz balansi/PII/qarz tarixi afitsiantdan yopiq (buyurtma ichida ham `customer` faqat ism/telefon ko'rsatiladi, balanssiz).

**Qidiruv / filtr:**
- `?search=<matn>` — ism/familya/telefon bo'yicha qidiruv.
- `?has_debt=true` — faqat qarzi bor mijozlar (`balance > 0`), balans bo'yicha kamayish tartibida (eng katta qarzdor birinchi).

## Buyurtmani kreditga yopish

```
POST /api/orders/{id}/close-on-credit/
{"customer_id": 5}
```

Buyurtmaning **qolgan qarzini** (`balance_due`) mijoz balansiga yozadi va buyurtmani `completed` qiladi. Agar avval qisman naqd/karta to'lov qilingan bo'lsa — faqat qolgan qism yoziladi.

**Ruxsat:** faqat `manager`/admin (chegirma/bekor qilish bilan bir xil darajadagi moliyaviy amal). Kassir/ofitsiant `403` oladi.

**Javob (200):** yangilangan to'liq `Order` obyekti (`customer` maydoni endi to'ldirilgan — [`03-orders.md`](03-orders.md)).

**Xatoliklar:**
| Status | Sabab |
|---|---|
| `400` | Buyurtma allaqachon `completed`/`cancelled` |
| `400` | Buyurtmada qarz yo'q (`balance_due == 0`) — bu holda oddiy `close` ishlatilsin |
| `403` | Menejer emas |
| `404` | `customer_id` topilmadi yoki faol emas |

**Muhim:** kreditga yopilgan buyurtma `completed` bo'ladi, lekin uning qarzi `Payment` sifatida EMAS, mijoz `balance`ida saqlanadi. Ya'ni buyurtmaning o'zida `balance_due` hali ham musbat bo'lishi mumkin — pul mijoz qarziga o'tgan.

## Qarzni to'lash (repayment)

```
POST /api/customers/{id}/repay/
{"amount": "50000", "method": "cash", "note": ""}
```

Mijoz qarzni to'laganda balansdan ayiradi va `DebtTransaction(repayment)` yozadi.

**Ruxsat:** `cashier` yoki `manager` (qarz to'lovi kassa oynasida qabul qilinadi). Ofitsiant `403` oladi.

**Javob (200):** yangilangan `Customer` obyekti (kamaygan `balance` bilan).

**Xatolik:** `400` — to'lov summasi joriy qarzdan (`balance`) oshib ketsa.

## Qarz tarixi

```
GET /api/customers/{id}/transactions/
```

Mijozning barcha qarz harakatlari (kreditga sotuv + to'lovlar), eng yangisi birinchi. **Sahifalanmaydi** — to'g'ridan-to'g'ri massiv.

**Ruxsat:** `cashier` yoki `manager` (afitsiant emas).

**Javob (200):**
```json
[
  {"id": 12, "customer": 5, "amount": "-50000.00", "txn_type": "repayment", "order": null, "method": "cash", "note": "", "created_by": {"id": 7, "username": "+998901112255", "first_name": "Sardor", "role": "cashier"}, "created_at": "..."},
  {"id": 9, "customer": 5, "amount": "100000.00", "txn_type": "credit_sale", "order": 42, "method": "", "created_by": {"id": 3, "role": "manager"}, "created_at": "..."}
]
```

| `txn_type` | `amount` ishorasi | Ma'no |
|---|---|---|
| `credit_sale` | musbat (+) | Buyurtma kreditga yopildi — qarz oshdi |
| `repayment` | manfiy (−) | Mijoz qarzni to'ladi — qarz kamaydi |
| `adjustment` | ± | Qo'lda tuzatish (hozircha faqat admin panel orqali) |

`balance = Σ amount` — ledger yig'indisi doim `Customer.balance` bilan mos keladi.
