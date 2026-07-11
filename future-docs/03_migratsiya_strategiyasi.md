# 03. Migratsiya strategiyasi — chuqur tahlil va toʻgʻri yoʻl

Bu hujjat [01_kritik_xatolar.md](01_kritik_xatolar.md) #1 ning davomi. U yerda muammo koʻrsatilgan; bu yerda **nega hozirgi qaror tanlangan, nega u ishlamaydi, va aniq qanday oʻtish** bayon qilinadi.

---

## Hozirgi strategiya nima

`CLAUDE.md` va kod quyidagini belgilaydi:
- Migratsiya fayllari git'ga commit qilinmaydi (`.gitignore: **/migrations/*.py`).
- Har konteyner startida (`RUN_MIGRATIONS=1`) `entrypoint.sh` avval `makemigrations --noinput`, keyin `migrate --noinput` qiladi.
- Gʻoya: "har muhit oʻzining migratsiyasini joriy modeldan generatsiya qiladi, qoʻlda kelishtirish shart emas".

Bu qaror **jozibali** koʻrinadi, chunki dev'da migratsiya konfliktlari bilan ovora boʻlmaysiz. Lekin u **stateful production DB** bilan ziddiyatga kiradi.

---

## Nega ishlamaydi (yana bir bor, aniq)

Django'da ikki alohida holat bor:
- **Migratsiya fayllari** (diskda) — `makemigrations` shularni oʻqiydi/yozadi, DB'ga qaramaydi.
- **`django_migrations` jadvali** (DB'da) — `migrate` shunga qaraydi, migratsiyani `(app, nom)` boʻyicha "qoʻllangan" deb biladi.

Production'da image har deployda toza quriladi (bind-mount yoʻq, migratsiyalar gitignored) — demak `migrations/` har safar faqat `__init__.py` bilan boshlanadi. Natijada `makemigrations` **har doim `0001_initial` ni qayta yaratadi**, hamma joriy modelni bitta migratsiyaga joylaydi.

`migrate` esa DB'da `0001_initial` allaqachon qoʻllangan deb koʻradi (birinchi deploydan) va **yangi mazmunli `0001_initial` ni oʻtkazib yuboradi**. Natija:

> **Birinchi deploydan keyin production sxemasi muzlaydi. Model kodidagi har qanday keyingi oʻzgarish DB'ga yetib bormaydi.** `migrate` "qoʻllash uchun migratsiya yoʻq" deydi — yolgʻon xotirjamlik.

Simptom: yangi kod yangi ustun/jadvalga murojaat qiladi → `ProgrammingError: column/relation does not exist` → ommaviy 500.

**Muhim nuance:** bu "baʼzan" emas — bu **kafolatli**, ikkinchi sxema oʻzgarishida. Dev'da koʻrinmasligining sababi — dev DB'ni nuklab, toza `0001`dan boshlash odat tusiga kirgan.

---

## Qoʻshimcha xavf: `--noinput` va destruktiv qarorlar

Faraz qilaylik strategiya baribir qoʻllansa (masalan kimdir `django_migrations` ni tozalab): `makemigrations --noinput` maydon **qayta nomlanishini** aniqlay olmaydi. `price` → `unit_price` renamed boʻlsa, u interaktiv "did you rename?" savolini beradi; `--noinput` bilan **"yoʻq"** deb qabul qiladi → `RemoveField(price)` + `AddField(unit_price)` → **ustun va undagi maʼlumot oʻchadi.** Bu cloud'da litsenziya kalitlari yoki hardware hash'lar boʻlishi mumkin.

---

## Toʻgʻri yoʻl (tavsiya)

### 1-qadam: migratsiyalarni commit qiling

```bash
# .gitignore dan quyidagi ikki qatorni olib tashlang:
#   **/migrations/*.py
#   !**/migrations/__init__.py

# Har ikki loyihada toza migratsiya yarating (dev DB'ni oldin nuklab, toza holatdan):
cd local_server && docker compose exec web python manage.py makemigrations core licensing
cd cloud_server && docker compose exec web python manage.py makemigrations tenants
# Yaratilgan 0001_initial.py fayllarini koʻrib chiqing va commit qiling.
git add local_server/*/migrations/*.py cloud_server/*/migrations/*.py
```

### 2-qadam: `entrypoint.sh` dan `makemigrations` ni olib tashlang

Har ikki `entrypoint.sh` da:
```sh
if [ "$RUN_MIGRATIONS" = "1" ]; then
    python manage.py migrate --noinput          # faqat migrate
    # cloud'da: python manage.py collectstatic --noinput
fi
```
`makemigrations` **build/deploy vaqtida hech qachon ishlamasin.** U — dasturchining lokal, koʻrib-chiqiladigan qadami.

### 3-qadam: ish oqimi (kelgusi model oʻzgarishlari uchun)

1. Dasturchi modelni oʻzgartiradi.
2. Lokal: `python manage.py makemigrations` → yangi `000N_*.py` fayl.
3. `git diff` bilan migratsiyani **koʻrib chiqadi** (ayniqsa `RemoveField`, `AlterField` larni — maʼlumot yoʻqotishi mumkin boʻlganlarni).
4. Kod + migratsiya birga commit/PR qilinadi.
5. Deploy → `migrate` faqat yangi migratsiyani qoʻllaydi. Bashoratli, qaytariladigan.

### 4-qadam: xavfli migratsiyalar uchun qoʻshimcha ehtiyot

- Maʼlumot koʻchirish kerak boʻlsa (masalan maydon boʻlish) — `RunPython` data migration yozing, `RemoveField` ni keyingi deployga qoldiring (ikki bosqichli: avval yangi ustun toʻldiriladi, keyin eski oʻchiriladi).
- Deploydan oldin DB backup (cloud'da `db_backup` bor local'da; cloud prod compose'da **yoʻq** — qarang [06](06_ishonchlilik_va_deploy.md)).

---

## "Lekin biz migratsiya konfliktidan qochmoqchi edik"

Bu tashvish oʻrinli, lekin yechim commit qilmaslik emas:
- **Yagona dasturchi/kichik jamoa** uchun migratsiya konflikti kam uchraydi va Django `makemigrations --merge` bilan hal qilinadi.
- Commit qilingan migratsiyalar aynan **production'ni bashoratli qiladi** — bu POS uchun (real pul, real maʼlumot) muzokara qilinmaydigan talab.
- Multi-tenant local server'lar (har restoran alohida DB) commit qilingan migratsiyalar bilan **bir xil sxemaga** keladi — hozirgi strategiyada har restoran DB'si potensial farq qiladi, bu debugging koshmariga aylanadi.

---

## Bogʻliq: local_server multi-DB muammosi

Har restoran oʻz Bola DB'siga ega, va ular Watchtower orqali mustaqil yangilanadi (`docs` / `docker-compose.prod.yml`). Hozirgi strategiyada:
- Restoran A birinchi `0001` bilan qotib qolgan, restoran B toza oʻrnatishda boshqa `0001` olishi mumkin.
- Yangi image chiqqanda, hech biriga sxema oʻzgarishi **yetib bormaydi** (yuqoridagi muzlash sababi).

Commit qilingan migratsiyalar bilan: yangi image yangi migratsiya fayllarini olib keladi, `migrate` ularni har restoran DB'sida bir xil qoʻllaydi. Bu — Watchtower rollout'ining **ishlashining yagona yoʻli**.

Keyingi: **[04_pos_biznes_mantiq.md](04_pos_biznes_mantiq.md)**.
