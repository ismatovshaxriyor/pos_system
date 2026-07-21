# Hisobotlar va dashboard

Ikki qism: (1) **afitsiant/kassir** o'zining kunlik jamlangan sotuvini ko'radi; (2) **menejer** uchun o'ta funksional dashboard va analitika endpointlari.

**Muhim:** haqiqiy tushum har doim `Payment` (qabul qilingan pul) yig'indisidan olinadi — buyurtma summasidan emas. Kun chegarasi Toshkent vaqti bo'yicha (`?date=today` yoki `?date=YYYY-MM-DD`, noto'g'ri format → `400`). Barcha javoblar sahifalanmaydi (bitta JSON obyekt).

## `GET /api/reports/my-summary/` — afitsiant kunlik sotuvi

Afitsiant/kassirning bir kundagi jamlangan natijasi. **Ruxsat:** istalgan autentifikatsiyalangan xodim (o'zini ko'radi). Menejer `?waiter={id}` bilan boshqa xodimni ko'ra oladi; afitsiant boshqa `waiter` so'rasa `403`.

```
GET /api/reports/my-summary/?date=today
GET /api/reports/my-summary/?date=2026-07-20&waiter=7    # faqat menejer
```

**Javob (200):**
```json
{
  "date": "2026-07-21",
  "waiter_id": 7,
  "waiter_name": "Olim",
  "order_count": 12,
  "open_order_count": 2,
  "cancelled_count": 1,
  "item_count": 48,
  "total_revenue": "1450000.00",
  "avg_order_value": "120833.33",
  "by_method": {"cash": "900000.00", "card": "550000.00", "other": "0.00"}
}
```

Tushum shu xodim buyurtmalariga qabul qilingan `Payment`lardan; buyurtma/taom sonlari buyurtma ochilgan sanadan hisoblanadi.

---

## Menejer dashboard endpointlari

Barchasi **faqat `role = manager`/admin** (`IsAdminStaff`). Kassir/ofitsiant `403`.

### `GET /api/reports/dashboard/?date=today` — bosh KPI panel

```json
{
  "date": "2026-07-21",
  "revenue": {
    "total": "5200000.00",
    "by_method": {"cash": "3000000.00", "card": "2200000.00", "other": "0.00"},
    "order_count": 42,
    "avg_check": "123809.52",
    "discount_total": "80000.00"
  },
  "floor": {"occupied_tables": 6, "open_orders": 8, "active_staff": 5},
  "debts": {"total_outstanding": "340000.00", "debtor_count": 4},
  "inventory": {"low_stock_count": 3, "total_value": "12500000.00"},
  "top_products": [{"name": "Osh", "quantity": 30, "revenue": "750000.00"}],
  "hourly_revenue": [{"hour": "12:00", "revenue": "1200000.00"}]
}
```

- `revenue` — bugungi tushum (`Payment`), to'lov turi bo'yicha, buyurtma soni, o'rtacha chek, umumiy chegirma.
- `floor` — band stollar, ochiq buyurtmalar, hozir ishda bo'lgan xodimlar (`Attendance` ochiq).
- `debts` — umumiy qarz (`Σ Customer.balance`), qarzdorlar soni.
- `inventory` — past-zaxira ingredientlar soni, ombor umumiy qiymati (`Σ qoldiq×tannarx`).
- `top_products` — bugun eng ko'p sotilgan 10 ta taom; `hourly_revenue` — soatlik tushum (Toshkent vaqti).

### `GET /api/reports/sales/` — sotuv analitikasi

```
?from=YYYY-MM-DD&to=YYYY-MM-DD&group_by=day|waiter|product|category
```
`from`/`to` ixtiyoriy (standart: bugun). `group_by` standart `day`; noto'g'ri qiymat → `400`.

```json
{
  "group_by": "product",
  "total_revenue": "5200000.00",
  "by_method": {"cash": "3000000.00", "card": "2200000.00", "other": "0.00"},
  "rows": [{"key": "Osh", "quantity": 30, "revenue": "750000.00"}]
}
```
`day`/`waiter` guruhida tushum `Payment`dan; `product`/`category` guruhida `OrderItem` (narx×miqdor)dan.

### `GET /api/reports/staff/?date=today` — xodimlar samaradorligi

```json
{
  "date": "2026-07-21",
  "waiters": [{"waiter_id": 7, "waiter_name": "Olim", "revenue": "1450000.00", "payment_count": 20, "completed_orders": 12}],
  "clocked_in": [{"user_id": 7, "name": "Olim", "role": "waiter", "check_in": "..."}]
}
```

### `GET /api/reports/inventory/?date=today` — ombor holati

```json
{
  "date": "2026-07-21",
  "ingredient_count": 25,
  "total_value": "12500000.00",
  "low_stock_count": 3,
  "low_stock": [{"id": 4, "name": "Tuz", "unit": "kg", "current_stock": "1.000", "min_stock": "5.000"}],
  "consumed_units_today": "48.000",
  "purchased_cost_today": "2000000.00"
}
```

### `GET /api/reports/debts/?date=today` — qarzdorlar

```json
{
  "date": "2026-07-21",
  "total_outstanding": "340000.00",
  "debtor_count": 4,
  "top_debtors": [{"id": 5, "name": "Ali Valiyev", "phone": "+998901112233", "balance": "100000.00"}],
  "credit_sales_today": "150000.00",
  "repayments_today": "50000.00"
}
```
Qarz daftar tafsilotlari uchun [`11-qarz-daftar.md`](11-qarz-daftar.md).
