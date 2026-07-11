# 09. Test va sifat

## Umumiy holat: yaxshi, lekin muhim boʻshliqlar bilan

Test qamrovi **kutilganidan yaxshi** — ~155 test metodi, ayniqsa control plane (litsenziya, heartbeat, token rotation, PIN auth, cross-tenant izolyatsiya) puxta qoplangan. Lekin aynan [01_kritik_xatolar.md](01_kritik_xatolar.md) dagi xatolar **testsiz** qolgan — shuning uchun ular sezilmagan.

**Asosiy naql:** test bor joyda xato yoʻq, xato bor joyda test yoʻq. `test_discount_fields_not_writable_via_generic_patch` mavjud → discount himoyalangan. `status` uchun bunday test yoʻq → status ochiq qolgan. **Har tuzatishga test qoʻshish** — bu loyihada eng samarali sifat siyosati.

---

## Har kritik xato uchun qoʻshilishi kerak boʻlgan test

Bularni tuzatish bilan **birga** yozing (regression himoyasi):

| Xato ([01](01_kritik_xatolar.md)) | Qoʻshiladigan test |
|-----|-----|
| #2 status bypass | `test_status_not_writable_via_generic_patch` — `PATCH /orders/{id}/ {"status":"completed"}` toʻlanmagan buyurtmada 200 bermasin va status oʻzgarmasin. (Mavjud `test_discount_fields_not_writable_via_generic_patch` ni namuna qiling.) |
| #3 add_item yopiq buyurtmada | `test_add_item_forbidden_on_completed_order`, `test_add_item_forbidden_on_cancelled_order` |
| #3 add_item race | Konkurent add_item'da `total_amount` == item'lar yigʻindisi (yoki total'ni property qilib, testni soddalashtiring) |
| #4 OrderItem CRUD | `test_order_item_delete_updates_total` / `test_waiter_cannot_touch_other_waiters_items` — yoki endpoint olib tashlansa, uning yoʻqligini tasdiqlovchi test |
| #5 close cancelled | `test_close_forbidden_on_cancelled_order` |

---

## Migratsiya strategiyasi uchun test/CI

[03](03_migratsiya_strategiyasi.md) tuzatilgach:
- **CI'da `makemigrations --check --dry-run`** — model oʻzgargan, lekin migratsiya commit qilinmagan boʻlsa, CI **yiqilsin**. Bu "migratsiyani unutish" ni butunlay oldini oladi.
- CI'da toza DB'da `migrate` + testlarni ishga tushirish (allaqachon shunday boʻlishi mumkin, tasdiqlang).

---

## Yetishmayotgan test turlari

**🟡 Integratsiya testi (Ona ↔ Bola)**
- Hozir Bola testlari Ona'ni **mock** qiladi (`mock_activate`, `mock_heartbeat`), Ona testlari alohida. Ikkalasi **birga** ishlaydigan uchdan-uchgacha (end-to-end) test yoʻq.
- Sync dvigateli ([05](05_sinxronizatsiya_dvigateli.md)) qurilganda bu ayniqsa muhim — activation → heartbeat → command → sync toʻliq oqimi bitta testda.
- Yechim: `docker compose` bilan ikkala serverni koʻtaruvchi kichik integratsiya sinovi (yoki Ona'ni test sifatida ishga tushirib, Bola undan real HTTP bilan gaplashadi).

**🟡 Load / concurrency testi**
- Split-payment concurrency mantiqi bor (`select_for_update`), lekin uni **haqiqiy parallel** sinaydigan test yoʻq (transaction test qiyin, lekin `TransactionTestCase` + threadlar bilan mumkin).
- Pik-soat yukini (koʻp bir vaqtli buyurtma/toʻlov) simulyatsiya qilib Bola latency'sini oʻlchash — [07](07_performance_va_masshtab.md) qarorlari uchun maʼlumot beradi.

**🟡 Xavfsizlik regressioni**
- [02](02_xavfsizlik_auditi.md) dagi har tuzatishga test: throttle ishlayaptimi, cloud endpoint auth'siz 403 (500 emas) beryaptimi, va h.k.

---

## Test infratuzilmasi kuzatuvlari

- **Testlar mavjud va oʻtadi** (`CLAUDE.md`): `local_server` → `test core licensing`; `cloud_server` → `test sync tenants`. ✅
- **CI'da test ishlayaptimi?** — `.github/workflows/` da faqat `deploy-cloud-server.yml` bor. **Test workflow yoʻq** — yaʼni testlar deploy'dan oldin avtomatik ishlamaydi. `main`'ga push toʻgʻridan-toʻgʻri prod'ga chiqadi ([06](06_ishonchlilik_va_deploy.md) #1), testlar oʻtishini tekshirmasdan.
  - **🟠 Bu jiddiy:** buzuq kod (test yiqilsa ham) prod'ga avtomatik chiqadi.
  - **Tuzatish:** deploy workflow'ga (yoki alohida workflow) test qadamini qoʻying, test oʻtmasa deploy toʻxtasin. Ikkala loyiha uchun ham.

---

## Sifat siyosati (tavsiya)

1. **Har bug-fix + test** — istisnosiz. Bu loyiha buni allaqachon qisman qiladi, davom ettiring.
2. **CI: test + `makemigrations --check`** deploy'dan oldin, majburiy gate.
3. **Kod review** migratsiyalar uchun (destruktiv operatsiyalarga alohida eʼtibor).
4. Test qamrovini **domen mantigʻiga** yoʻnaltiring (buyurtma hayot sikli, toʻlov, void/refund kelganda) — control plane allaqachon yaxshi qoplangan.

Keyingi: **[10_yol_xaritasi.md](10_yol_xaritasi.md)** — hammasini ustuvorlikka soladi.
