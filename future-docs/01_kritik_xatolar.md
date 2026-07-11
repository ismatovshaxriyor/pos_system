# 01. Kritik xatolar — kod yozishdan oldin hal qilinishi kerak

Bu hujjatdagi topilmalar **kod dalili bilan tasdiqlangan** va production'da real zarar keltiradi. Tartib — ustuvorlik boʻyicha.

---

## 🔴 1. Migratsiyalar commit qilinmagan → production DB sxemasi "muzlab qoladi"

**Dalil:**
- `.gitignore`: `**/migrations/*.py` (faqat `__init__.py` mustasno) — migratsiya fayllari git'ga tushmaydi.
- `local_server/entrypoint.sh:7-8` va `cloud_server/entrypoint.sh:7-9`: `RUN_MIGRATIONS=1` boʻlsa har startda `makemigrations --noinput` keyin `migrate --noinput`.
- `CLAUDE.md` bu strategiyani ataylab tanlangan deb tasvirlaydi ("each environment generates its own ... nothing to reconcile by hand").

**Nima uchun bu xavfli (aniq mexanizm):**

`makemigrations` **maʼlumotlar bazasiga qaramaydi** — u faqat diskdagi migratsiya fayllarini joriy modellar bilan solishtiradi. `migrate` esa **DB'dagi `django_migrations` jadvaliga qaraydi** va migratsiyani `(app, nom)` juftligi boʻyicha "qoʻllangan"/"qoʻllanmagan" deb biladi.

Endi production ssenariysi (Postgres volume saqlanadi, image `--build` bilan qayta quriladi):

1. **1-deploy:** `migrations/` da faqat `__init__.py`. `makemigrations` → hamma model uchun bitta `0001_initial.py` yaratadi. `migrate` → uni qoʻllaydi, `django_migrations` ga `0001_initial` yozadi. ✅ Ishlaydi.
2. **Modelga oʻzgarish** (masalan `Product` ga yangi `cost_price` maydoni qoʻshildi), **2-deploy:** image toza quriladi → `migrations/` yana faqat `__init__.py` (chunki gitignored va bind-mount yoʻq prod'da). `makemigrations` → **yana `0001_initial.py`** yaratadi, endi u `cost_price` ni ham oʻz ichiga oladi (chunki boshdan generatsiya qilinyapti).
3. `migrate` → `django_migrations` da `0001_initial` allaqachon bor → **uni oʻtkazib yuboradi.** `cost_price` ustuni **hech qachon yaratilmaydi.**
4. Yangi kod `cost_price` ga murojaat qiladi → `ProgrammingError: column "cost_price" does not exist` → **butun POS 500 qaytaradi.** Django esa "No migrations to apply" deb yolgʻon xotirjamlik beradi.

**Taʼsir:** 🔴 Birinchi muvaffaqiyatli deploydan **keyin** har qanday sxema oʻzgarishi production'da jimgina qoʻllanmaydi va restoranni ishdan chiqaradi. Bu ayniqsa **cloud_server** uchun halokatli — u barcha restoranlarning litsenziya/hardware/restoran maʼlumotini saqlaydi, va `main`'ga har push avtomatik deploy boʻladi (`.github/workflows/deploy-cloud-server.yml`).

**Nega hali koʻrinmagan:** dev'da `.:/app` bind-mount tufayli generatsiya qilingan migratsiyalar host'da saqlanib qoladi, va dev DB'ni istalgan payt nuklab, toza `0001`dan boshlash mumkin. Muammo faqat **real maʼlumotli, uzoq yashaydigan** DB'da 2-sxema oʻzgarishida chiqadi.

**Qanday tekshirish (5 daqiqa, reproduksiya):**
```bash
cd cloud_server
docker compose up -d --build
docker compose exec web python manage.py migrate   # 0001_initial qoʻllanadi
# Endi modelga oʻzgarish qiling: tenants/models.py da Restaurant ga yangi maydon qoʻshing, masalan:
#   note = models.CharField(max_length=50, blank=True, default='')
docker compose restart web        # entrypoint yana makemigrations+migrate qiladi
docker compose exec web python manage.py migrate --plan   # "No planned migration operations"
docker compose exec web python -c "import django,os;os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings');django.setup();from tenants.models import Restaurant;print([f.name for f in Restaurant._meta.fields])"
# Model 'note' ni koʻradi, lekin DB'da ustun yoʻq → keyingi Restaurant soʻrovi xato beradi
docker compose exec web python manage.py shell -c "from tenants.models import Restaurant; list(Restaurant.objects.all())"  # ProgrammingError
```

**Tuzatish yoʻnalishi** (batafsili [03_migratsiya_strategiyasi.md](03_migratsiya_strategiyasi.md)):
- **Migratsiyalarni git'ga commit qiling** (`.gitignore`dan `**/migrations/*.py` qatorini olib tashlang) — bu Django'ning standart, sinovdan oʻtgan yoʻli.
- `entrypoint.sh`dan `makemigrations` ni **olib tashlang**; faqat `migrate --noinput` qolsin.
- Migratsiyalarni dasturchi lokal muhitda yaratib, koʻrib chiqib (review), commit qiladi. Shunda sxema oʻzgarishi bashoratli va qaytariladi (revert mumkin).

---

## 🔴 2. Buyurtma `status` maydoni generic PATCH orqali yoziladi — toʻlovsiz "yopish"

**Dalil:**
- `local_server/core/serializers.py:152-159` — `OrderSerializer.Meta`: `status` maydoni `fields` ichida, lekin `read_only_fields = ('total_amount', 'waiter', 'cashier', 'discount_amount', 'discount_reason')` — yaʼni `status` **yoziladi**.
- `local_server/core/views.py:89-113` — `OrderViewSet` toʻliq `ModelViewSet`, `perform_update`/`update` override yoʻq, ruxsat faqat `IsAuthenticated`.
- Toʻliq toʻlov tekshiruvi **faqat** `close` action'ida (`views.py:127-146`: `if balance_due > 0: return 400`).

**Muammo:** `close` action puxta himoyalangan, lekin uni chetlab oʻtish oson:
```
PATCH /api/orders/5/   {"status": "completed"}
```
Bu soʻrov `close`'ni umuman chaqirmaydi — u to'gʻridan-toʻgʻri `OrderSerializer` orqali `status`'ni `completed` qiladi. Toʻlov tekshiruvi yoʻq, `balance_due` tekshirilmaydi.

**Taʼsir:** 🔴 Har qanday autentifikatsiyalangan xodim (kassir/menejer istalgan buyurtmaga; ofitsiant oʻz buyurtmasiga) toʻlovni yozmasdan buyurtmani `completed` qila oladi. POS kontekstida bu — **naqd pulni cho'ntakka urish** vektori: ofitsiant buyurtmani "yopilgan" deb belgilaydi, mijozdan naqd oladi, tizimda `Payment` yozuvi yoʻq. Xuddi shu yoʻl bilan `cancelled` ham qilib, faol stolni "boʻshatib" yuborish mumkin.

Buni yana kuchaytiradigan narsa: dasturchi bu **aynan shu turdagi teshikni** `discount` uchun bilgan va **himoyalagan** — `test_discount_fields_not_writable_via_generic_patch` (`test_payments.py:213`) borligi buni isbotlaydi. `status` esa xuddi shu ehtiyotdan chetda qolgan.

**Qanday tekshirish:**
```bash
# Toʻlanmagan buyurtma yarating, keyin:
curl -X PATCH http://localhost:8000/api/orders/<id>/ \
  -H "Authorization: Token <cashier_token>" -H "Content-Type: application/json" \
  -d '{"status":"completed"}'
# 200 qaytadi, buyurtma toʻlovsiz completed boʻladi. close esa buni 400 bilan rad etardi.
```

**Tuzatish yoʻnalishi:**
- `OrderSerializer.read_only_fields` ga `'status'` ni qoʻshing. Status oʻzgarishi **faqat** maxsus action'lar orqali boʻlsin: `close` (→ completed, toʻlov tekshiruvi bilan), va yangi `cancel` action (→ cancelled, menejer ruxsati bilan, sabab yozib).
- `table_id` ham `read_only` boʻlishi kerakmi degan savolni koʻrib chiqing — ofitsiant faol buyurtmani boshqa stolga koʻchira olishi kerakmi? Agar yoʻq boʻlsa, uni ham himoyalang.
- Test qoʻshing: `test_status_not_writable_via_generic_patch` (aynan mavjud discount testiga oʻxshab).

---

## 🟠 3. `add_item` yopilgan buyurtmaga qoʻshadi va atomik emas

**Dalil:** `local_server/core/views.py:155-176` — `add_item`:
- Buyurtma statusini **tekshirmaydi** (`add_payment` va `set_discount` esa `ORDER_FINISHED_STATUSES` ni tekshiradi).
- `order.total_amount += price * quantity; order.save()` — `select_for_update()` yoki `transaction.atomic()` **yoʻq** (aksincha `add_payment` qulflaydi).

**Muammo A (status):** `completed`/`cancelled` buyurtmaga item qoʻshib boʻladi. Yopilgan, toʻliq toʻlangan buyurtmaga item qoʻshilsa — `total_amount` oshadi, `balance_due` musbat boʻladi, lekin buyurtma allaqachon `completed`. Moliyaviy nomuvofiqlik.

**Muammo B (race):** ikki ofitsiant/terminal bir vaqtda `add_item` qilsa, `total_amount` ustida read-modify-write poygasi boʻladi — bittasining qoʻshgani yoʻqoladi (lost update). Buyurtma summasi item'lar yigʻindisidan kam boʻlib qoladi.

**Taʼsir:** 🟠 Summa nomuvofiqligi (pul yoʻqotish). B ehtimoli pik soatlarda oshadi.

**Tuzatish yoʻnalishi:**
- `add_item` boshida `if order.status in ORDER_FINISHED_STATUSES: return 400`.
- `add_payment` kabi `transaction.atomic()` + `select_for_update()` ichiga oling.
- Yoki tubdan: `total_amount` ni **saqlanadigan ustun** sifatida qoʻlda boshqarish oʻrniga, item'lardan hisoblanadigan property qiling (qarang: [04_pos_biznes_mantiq.md](04_pos_biznes_mantiq.md), "Yagona manba" boʻlimi) — shunda race va staleness sinfi butunlay yoʻqoladi.

---

## 🟠 4. `OrderItemViewSet` toʻliq CRUD ochiq — summa buziladi, ofitsiantlar izolyatsiyasi yoʻq

**Dalil:**
- `local_server/core/urls.py:15` — `router.register(r'order-items', OrderItemViewSet)`.
- `local_server/core/views.py:280-283` — `OrderItemViewSet(viewsets.ModelViewSet)`, `queryset = OrderItem.objects.all()`, ruxsat faqat `IsAuthenticated`, `get_queryset` override **yoʻq**.
- `OrderItemSerializer` (`serializers.py:113-122`) — `price` `read_only`, va `OrderItem.price` da DB default yoʻq.

**Uchta alohida muammo:**

1. **`PATCH /api/order-items/{id}/ {"quantity": 100}`** — item miqdorini oʻzgartiradi, lekin `Order.total_amount` ni **qayta hisoblamaydi** (chunki qayta hisoblash faqat `add_item` ichida). Summa eskirib qoladi.
2. **`DELETE /api/order-items/{id}/`** — item'ni oʻchiradi, `total_amount` **kamaymaydi**. Summa yana eskiradi. (Menejer bir item qoʻshib, keyin oʻchirsa, mijoz allaqachon ketgan pulni toʻlaydi.)
3. **`POST /api/order-items/`** — `price` read-only + model default yoʻq → NULL insert → **IntegrityError 500** (endpoint yaratish uchun ham buzuq).
4. **Izolyatsiya yoʻq** — `get_queryset` filtri boʻlmagani uchun har qanday ofitsiant **boshqa ofitsiantning** buyurtma item'larini koʻradi/oʻzgartiradi/oʻchiradi. `OrderViewSet` da ofitsiant faqat oʻz buyurtmasini koʻradi, lekin bu himoya `order-items` orqali chetlab oʻtiladi.

**Taʼsir:** 🟠 Summa yaxlitligining buzilishi + tenant/ownership sizishi. Bu endpoint hozir ham qisman buzuq (create 500), ham xavfli.

**Tuzatish yoʻnalishi:**
- `OrderItemViewSet` ni router'dan **olib tashlang** (yoki `ReadOnlyModelViewSet` qiling). Item mutatsiyalari faqat buyurtma action'lari orqali boʻlsin, ular `total_amount` ni server tomonda qayta hisoblasin:
  - Mavjud `add_item` (yopiq-status tekshiruvi bilan, #3'ga qarang).
  - Yangi `remove_item` / `update_item_quantity` action'lari `OrderViewSet` da, har biri summani qayta hisoblab.
- Agar oʻqish kerak boʻlsa, `OrderSerializer` allaqachon nested `items` beradi — alohida endpoint shart emas.

---

## 🟠 5. `close` bekor qilingan (`cancelled`) buyurtmani ham `completed` qiladi

**Dalil:** `local_server/core/views.py:129` — `close` faqat `if order.status == 'completed'` ni rad etadi. `cancelled` holati tekshirilmaydi.

**Muammo:** `cancelled` buyurtma (masalan item'siz, `balance_due == 0`) `close` qilinsa — u `completed` boʻlib ketadi. Bekor qilingan buyurtma "tirilib", tugallangan sotuvga aylanadi.

**Taʼsir:** 🟠 Hisobot yaxlitligi (bekor qilingan sotuvlar completed'ga aralashadi). #2 bilan birga, buyurtma holat mashinasi (state machine) umuman himoyalanmagan.

**Tuzatish yoʻnalishi:** `close` boshida `if order.status in ('completed', 'cancelled'): return 400`. Umumiy holda — buyurtma uchun **aniq state machine** joriy qiling (qarang [04](04_pos_biznes_mantiq.md)): faqat ruxsat etilgan oʻtishlar (`new→in_progress→completed`, `→cancelled`).

---

## Umumiy naql

Yuqoridagi #2–#5 bittaga bogʻlangan: **buyurtmaning holati va summasi bir joyda, ishonchli tarzda boshqarilmaydi.** `total_amount` qoʻlda yangilanadi (faqat bitta joyda), `status` esa umumiy serializer orqali ochiq. Yechim ham bitta yoʻnalishda: **buyurtmani domen obyekti sifatida yoping** — mutatsiyalar faqat maxsus, server-tomon tekshiruvli action'lar orqali, `status` va `total_amount` esa hech qachon mijoz tomonidan toʻgʻridan-toʻgʻri yozilmaydigan qilib. Batafsili — [04_pos_biznes_mantiq.md](04_pos_biznes_mantiq.md).

Keyingi: **[02_xavfsizlik_auditi.md](02_xavfsizlik_auditi.md)**.
