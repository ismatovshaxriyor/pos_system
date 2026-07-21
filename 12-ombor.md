# Ombor (ingredient + retsept)

Xomashyo zaxirasini yuritish, taomlarga retsept biriktirish (taom sotilganda ingredient avtomatik kamayadi), kirim (ta'minotchidan xarid), inventarizatsiya va past-zaxira ogohlantirishlari.

**Umumiy ruxsat:** barcha ombor endpointlarida o'qish — istalgan autentifikatsiyalangan xodim; **yozish — faqat `manager`/admin**. Barcha ro'yxatlar sahifalangan (`results` ichida), aks holda alohida ko'rsatilgan.

## Asosiy g'oya

Ombordagi yagona zaxira birligi — **`Ingredient`** (xomashyo). Har bir `Product` (menyu taomi) uchun **retsept** (`ProductIngredient` qatorlari) — 1 dona taomga qancha ingredient ketishi. Taom oshxonaga yuborilganda (`POST /api/orders/{id}/start/` yoki `in_progress` buyurtmaga `add_item`) retsept bo'yicha ingredientlar avtomatik kamayadi va `StockMovement(sale)` yoziladi. To'g'ridan-to'g'ri sotiladigan mahsulot (suv, gazak) — bitta 1:1 retsept sifatida ifodalanadi.

**Zaxira tugasa sotuv TO'XTAMAYDI** — ingredient minusga tushsa ham buyurtma o'tadi; faqat past-zaxira ogohlantirishi (WebSocket `low_stock` + bildirishnoma) chiqadi.

## Ta'minotchilar — `/api/suppliers/`

Standart CRUD. Maydonlar: `id`, `name` (majburiy), `phone`, `note`, `is_active`.

## Ingredientlar — `/api/ingredients/`

| Maydon | Tur | Yozish | Izoh |
|---|---|---|---|
| `id` | int | o'qish | |
| `name` | string | yozish | |
| `unit` | string | yozish | `kg` / `g` / `l` / `ml` / `dona` |
| `current_stock` | string (Decimal) | **faqat o'qish** | Joriy qoldiq — faqat kirim/sotuv/tuzatish orqali o'zgaradi |
| `min_stock` | string (Decimal) | yozish | Past-zaxira chegarasi |
| `cost_price` | string (Decimal) | yozish | Tannarx (birlik uchun); kirimda avtomatik yangilanadi |
| `supplier` / `supplier_id` | nested / int (write) | o'qish / yozish | Ta'minotchi (ixtiyoriy) |
| `is_low` | bool | faqat o'qish | `current_stock < min_stock` |
| `is_active` | bool | yozish | |

```
GET  /api/ingredients/                 → ro'yxat
GET  /api/ingredients/?low_stock=true  → faqat past-zaxira
POST /api/ingredients/                 → yaratish (faqat menejer; boshlang'ich qoldiq 0 — keyin adjust/kirim bilan qo'shiladi)
```

### Zaxirani tuzatish (inventarizatsiya) — `adjust`

```
POST /api/ingredients/{id}/adjust/
{"new_quantity": "12.5", "note": "inventarizatsiya"}     # absolyut yangi qoldiq
   -- yoki --
{"delta": "-2", "note": "buzilgan"}                       # nisbiy o'zgartirish
```

`new_quantity` **yoki** `delta` — aynan bittasi berilishi shart (ikkalasi yoki hech biri → `400`). `StockMovement(adjustment)` yoziladi. **Faqat menejer.**

**Javob (200):** yangilangan `Ingredient` obyekti.

## Retsept — `/api/recipe-items/`

Retsept qatorlari (`ProductIngredient`). Har qator alohida yaratiladi/o'chiriladi.

| Maydon | Tur | Yozish | Izoh |
|---|---|---|---|
| `id` | int | o'qish | |
| `product` / `product_id` | int (read) / int (write) | | Menyu taomi |
| `ingredient` / `ingredient_id` | nested / int (write) | | Ingredient |
| `quantity` | string (Decimal) | yozish | 1 dona taomga ketadigan miqdor |

```
GET    /api/recipe-items/?product={id}   → bitta taom retsepti
POST   /api/recipe-items/                → qator qo'shish (faqat menejer)
DELETE /api/recipe-items/{id}/           → qator o'chirish (faqat menejer)
```
Bitta taom + ingredient juftligi takrorlanmaydi (unique).

## Kirim (xarid) — `/api/purchases/`

Ta'minotchidan bir nechta ingredient kirimini bitta hujjatda qayd etadi. Yaratilganda **avtomatik**: har ingredient `current_stock` oshadi, `cost_price` yangilanadi va `StockMovement(purchase)` yoziladi.

```
POST /api/purchases/
{
  "supplier_id": 2,
  "note": "Haftalik kirim",
  "items": [
    {"ingredient_id": 1, "quantity": "20", "unit_cost": "80000"},
    {"ingredient_id": 3, "quantity": "5",  "unit_cost": "12000"}
  ]
}
```

**Ruxsat:** faqat `manager`. `items` bo'sh bo'lsa `400`.

**Javob (201):** yaratilgan `Purchase` (`total_cost` hisoblangan holda, `items` nested).

## Ombor harakati ledger — `/api/stock-movements/` (faqat o'qish)

Har bir zaxira o'zgarishi (kirim/sotuv/tuzatish/yo'qotish) shu yerda qayd etiladi. `Ingredient.current_stock = Σ quantity`.

```
GET /api/stock-movements/?ingredient={id}
GET /api/stock-movements/?movement_type=sale
```

| `movement_type` | `quantity` | Manba |
|---|---|---|
| `purchase` | + | Kirim (`Purchase`) |
| `sale` | − | Taom sotildi (retsept bo'yicha, `order` to'ldirilgan) |
| `adjustment` | ± | Qo'lda tuzatish (`adjust`) |
| `waste` | − | Yo'qotish (hozircha admin panel orqali) |

## Past-zaxira ogohlantirishi

Sotuvda ingredient `min_stock`dan **birinchi marta** pastga tushganda:
- WebSocket `low_stock` hodisasi ([`05-websocket.md`](05-websocket.md)) menejerlarga yuboriladi;
- doimiy `Notification` (`notif_type: "low_stock"`, `GET /api/notifications/`) yoziladi.

Sotuv hech qachon bloklanmaydi — bu faqat ogohlantirish.
