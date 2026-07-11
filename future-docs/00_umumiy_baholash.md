# 00. Umumiy baholash — loyiha qanchalik yaxshi qurilgan

## Qisqa xulosa

Bu loyiha **kutilganidan ancha yuqori sifatda** qurilgan. Litsenziyalash/kill-switch/heartbeat boshqaruv qatlami (control plane) — loyihaning eng murakkab qismi — puxta oʻylangan, xavfsizlik nuqtai nazaridan toʻgʻri (asimmetrik RS256, offline verifikatsiya, hardware binding) va yaxshi test bilan qoplangan. Kod uslubi izchil, izohlar (asosan oʻzbekcha) haqiqatan ham "nega" degan savolga javob beradi, "nima" ni takrorlamaydi.

Ammo aynan shu sifatli control plane soyasida **POS domenining oʻzida** (buyurtma → toʻlov → yopish oqimi) bir nechta jiddiy yaxlitlik (integrity) teshiklari qolib ketgan, va **deploy/migratsiya strategiyasida** production'da kafolatli portlaydigan kamchilik bor. Yaʼni: eng qiyin qism yaxshi, eng oddiy koʻringan qism eʼtibordan chetda qolgan.

**Umumiy baho: qattiq MVP poydevori (7.5/10).** Boshqaruv qatlami 9/10, POS domeni 5/10, deploy/infra 5/10.

---

## Kuchli tomonlar (nima yaxshi qilingan)

**Arxitektura va control plane**
- ✅ **Asimmetrik litsenziyalash toʻgʻri bajarilgan.** Ona private key bilan imzolaydi, Bola faqat public key bilan **offline** tekshiradi (`local_server/licensing/jwt_utils.py`). Bu kill-switch ning internetlarsiz kunlab ishlashini taʼminlaydi — dizaynning eng muhim talabi.
- ✅ **Token batch + pending rotation** (`cloud_server/sync/jwt_utils.py::issue_license_token_batch`, `local_server/licensing/models.py::current_valid_token`) — Ona haftalab yetib boʻlmasa ham, oldindan imzolangan ketma-ket tokenlar mahalliy almashtiriladi. Nozik, lekin toʻgʻri ishlangan yechim.
- ✅ **Token muddati hech qachon litsenziya muddatidan oshmaydi** (`_build_token`'dagi `min(...)`) — "uzoq token bilan bloklashni chetlab oʻtish" yoʻlini yopadi.
- ✅ **Hardware fingerprint'dagi Docker MAC tuzogʻi** (`local_server/licensing/hardware.py`) — locally-administered `02:xx` MAC'larni rad etish. Bu jonli test bilan topilgan real muammo; koʻpchilik buni sezmasdan litsenziyani har restartda buzib qoʻyardi.
- ✅ **Heartbeat uchun "yumshoq" auth** (`HeartbeatAuthentication`) — oʻlik litsenziyali restoran ham "sen bloklandingiz" signalini oladi. Toʻgʻri niyat.
- ✅ **Error-log kanali heartbeat'dan mustaqil** — buzilgan xato payload litsenziya tekshiruvining kritik yoʻliga taʼsir qilmaydi. Yaxshi ajratish.

**Kod sifati**
- ✅ **Test qamrovi yaxshi** — ~155 test metodi, control plane ning nozik holatlari (token rotation, grace davri, cross-tenant izolyatsiya, reentrant log handler) qoplangan.
- ✅ **Split-payment concurrency** — `add_payment` `select_for_update()` bilan qulflaydi, `amount_paid` har doim jonli `Sum` agregatsiyasi (`core/models.py`). Bir nechta kassa terminali stsenariysi haqida oʻylangan.
- ✅ **Admin panel real operatsion ehtiyojlarga moslangan** — litsenziya muddati badge'lari, QR kod, offline token generatsiyasi, "Toʻlov qilindi" amali. Operator ish oqimi haqida oʻylangan.
- ✅ **`django-simple-history`** har bir modelga to'liq field-level tarix beradi — audit uchun kuchli.

---

## Zaif tomonlar (asosiy xavf zonalari)

Har biri oʻz hujjatida batafsil; bu yerda faqat "bir qarashda" roʻyxati:

| # | Muammo | Belgi | Hujjat |
|---|--------|-------|--------|
| 1 | **Migratsiyalar commit qilinmagan + startup'da `makemigrations`** — production DB sxemasi birinchi deploydan keyin "muzlaydi", keyingi har qanday model oʻzgarishi jimgina qoʻllanmaydi va runtime'da 500 beradi | 🔴 | [01](01_kritik_xatolar.md), [03](03_migratsiya_strategiyasi.md) |
| 2 | **Buyurtma `status` maydoni generic PATCH orqali yoziladi** — kassir/ofitsiant `close` ning "toʻliq toʻlov" tekshiruvini butunlay chetlab, toʻlovsiz buyurtmani `completed` qila oladi (pul oʻgʻirlash vektori) | 🔴 | [01](01_kritik_xatolar.md), [04](04_pos_biznes_mantiq.md) |
| 3 | **`add_item` yopilgan buyurtmaga ham qoʻshadi + atomik emas** — yopilgan buyurtma summasi oʻzgaradi; parallel qoʻshishlar bir-birini yoʻqotadi | 🟠 | [01](01_kritik_xatolar.md) |
| 4 | **`OrderItemViewSet` toʻliq CRUD ochiq** — item'ni toʻgʻridan-toʻgʻri oʻchirish/oʻzgartirish `Order.total_amount` ni yangilamaydi (summa buziladi); ofitsiant boshqa ofitsiant buyurtmasiga ham tegadi | 🟠 | [01](01_kritik_xatolar.md), [04](04_pos_biznes_mantiq.md) |
| 5 | **Asosiy maʼlumot sinxronizatsiyasi (Bola↔Ona) umuman qurilmagan** — `docs/1` va `docs/4` vaʼda qilgan upstream chek yuborish, downstream menyu, disaster-recovery dump — hammasi yoʻq (`force_sync` — stub) | 🟡 | [05](05_sinxronizatsiya_dvigateli.md) |
| 6 | **Brute-force himoyasi tanlab qoʻyilgan** — PIN login rate-limited, lekin admin telefon+parol login va DRF token endpoint umuman himoyasiz | 🟠 | [02](02_xavfsizlik_auditi.md) |
| 7 | **Cloud tomonda retention yoʻq** — `ErrorLog`, `RemoteCommand`, tarix jadvallari cheksiz oʻsadi | 🟡 | [07](07_performance_va_masshtab.md) |
| 8 | **Har bir `main`'ga push cloud'ni avtomatik prod'ga deploy qiladi** — qoʻlda tasdiq bosqichisiz, migratsiya xavfi bilan birga | 🟠 | [06](06_ishonchlilik_va_deploy.md) |

---

## Nega bu muammolar hali "portlamagan"?

Muhim savol: agar bular jiddiy boʻlsa, nega hozirgacha ishlab turibdi?

- **Migratsiya muammosi (1)** dev'da yashiringan, chunki dev'da `.:/app` bind-mount va Postgres volume'ni istalgan payt oʻchirib, toza boshdan yaratish mumkin. Toza DB'da strategiya **ishlaydi**. U faqat **real maʼlumotli, uzoq yashaydigan production DB**da 2-marta sxema oʻzgarganda portlaydi. Hozircha production'da 2-chi sxema oʻzgarishi boʻlmagan boʻlishi mumkin.
- **Status bypass (2)** va **OrderItem (4)** — bu teshiklar mobil ilova "toʻgʻri" endpoint'lardan foydalangani uchun kunlik ishda koʻrinmaydi. Ular faqat **niyati buzuq yoki xato qilgan mijoz** toʻgʻridan-toʻgʻri API'ga soʻrov yuborganda ochiladi. POS'da bu — ichki firibgarlik vektori.
- **Sync yoʻqligi (5)** — ataylab MVP doirasidan chiqarilgan, bu maʼlum. Lekin `docs/4`dagi disaster-recovery vaʼdasi shunga bogʻliq — yaʼni hozir "kompyuter kuyib ketsa maʼlumot qaytariladi" vaʼdasi **bajarilmaydi**.

Bu hujjatlarning maqsadi — shu "hali portlamagan" holatni "portlamaydigan" holatga oʻtkazish.

---

## Loyihaning yetuklik darajasi (komponentlar boʻyicha)

```
Litsenziya / kill-switch / heartbeat   ████████████████████  9/10  (production-ready)
Xodim auth (PIN + qurilma)             ████████████████░░░░  8/10  (kichik yaxshilashlar)
Real-time (WebSocket)                  ███████████████░░░░░  7/10  (reconnect/scale kerak)
Admin panel (Ona + Bola)               ████████████████░░░░  8/10  (yaxshi)
POS domen (buyurtma/toʻlov)            ██████████░░░░░░░░░░  5/10  🔴 yaxlitlik teshiklari
Deploy / migratsiya / infra            ██████████░░░░░░░░░░  5/10  🔴 migratsiya xavfi
Maʼlumot sinxronizatsiyasi             ██░░░░░░░░░░░░░░░░░░  1/10  qurilmagan (rejada)
Analitika / hisobot                    ██░░░░░░░░░░░░░░░░░░  1/10  qurilmagan (poydevor bor)
```

Keyingi hujjat: **[01_kritik_xatolar.md](01_kritik_xatolar.md)** — darhol eʼtibor talab qiladigan xatolar.
