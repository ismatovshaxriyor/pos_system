# Future-docs — loyihani rivojlantirish uchun texnik audit va yoʻl xaritasi

Bu papka **mavjud kodni tashqi koʻz bilan sinchkovlik bilan oʻqib chiqilgandan keyin** yozilgan. Maqsad ikkita:

1. **Kelajakdagi muhim xatolardan oldindan asrash** — hozir kodda mavjud, lekin hali "portlamagan" muammolarni, ular ishlab chiqarishda (production) real zarar keltirishidan oldin koʻrsatish.
2. **Keyingi qadamlar uchun asos** — har bir yoʻnalish boʻyicha nima qurilishi kerakligini alohida hujjatda, ustuvorlik bilan bayon qilish.

Bu hujjatlar `docs/` (loyihaning dastlabki dizayn niyati) ni **almashtirmaydi**, balki uni real kod holati bilan solishtiradi va oldinga qarab davom ettiradi.

---

## Oʻqish tartibi

Agar vaqtingiz kam boʻlsa, shu tartibda oʻqing:

1. **[00_umumiy_baholash.md](00_umumiy_baholash.md)** — loyiha qanchalik yaxshi qurilgan: kuchli tomonlar, umumiy baho, eng katta risklar bir qarashda.
2. **[01_kritik_xatolar.md](01_kritik_xatolar.md)** — 🔴 **Avval shuni oʻqing.** Production'da real zarar (moliyaviy oqma, maʼlumot yoʻqolishi, tizim ishdan chiqishi) keltiradigan xatolar. Kod yozishdan oldin shular tuzatilishi kerak.
3. **[02_xavfsizlik_auditi.md](02_xavfsizlik_auditi.md)** — xavfsizlik: autentifikatsiya, brute-force, CORS, kalitlar, admin yuzasi, tahdid modeli.
4. **[03_migratsiya_strategiyasi.md](03_migratsiya_strategiyasi.md)** — migratsiyalarni commit qilmaslik strategiyasining chuqur tahlili (bu 01'dagi 1-xatoning davomi).
5. **[04_pos_biznes_mantiq.md](04_pos_biznes_mantiq.md)** — POS domen mantigʻi: buyurtma hayot sikli, void/refund, summa qayta hisoblash, soliq/xizmat haqi.
6. **[05_sinxronizatsiya_dvigateli.md](05_sinxronizatsiya_dvigateli.md)** — hali qurilmagan eng katta funksiya: Bola↔Ona maʼlumot sinxronizatsiyasi va disaster recovery.
7. **[06_ishonchlilik_va_deploy.md](06_ishonchlilik_va_deploy.md)** — deploy quvuri, Watchtower xavfsizligi, konteyner qatlanganligi, health-check, alerting.
8. **[07_performance_va_masshtab.md](07_performance_va_masshtab.md)** — koʻp restoran ostida masshtablash: heartbeat yozuv yuki, retention, indekslar, kesh.
9. **[08_mobil_api_va_realtime.md](08_mobil_api_va_realtime.md)** — mobil ilova API si, WebSocket, api-docs branch, versiyalash.
10. **[09_test_va_sifat.md](09_test_va_sifat.md)** — test qamrovi kamchiliklari va qoʻshilishi kerak boʻlgan testlar.
11. **[10_yol_xaritasi.md](10_yol_xaritasi.md)** — barcha yuqoridagilarni ustuvorlik boʻyicha tartibga solgan yagona yoʻl xaritasi.

---

## Belgilar (severity legend)

| Belgi | Maʼnosi |
|-------|---------|
| 🔴 **KRITIK** | Production'da maʼlumot yoʻqotish, pul oqmasi yoki toʻliq ishdan chiqishga olib keladi. Darhol hal qilinsin. |
| 🟠 **YUQORI** | Real xatolik yoki xavfsizlik teshigi, lekin taʼsiri cheklangan yoki shartli. Yaqin sprintda hal qilinsin. |
| 🟡 **OʻRTA** | Kelajakda (masshtab oshganda yoki yangi funksiya qoʻshilganda) muammoga aylanadi. Rejalashtirilsin. |
| 🟢 **PAST / YAXSHILASH** | Sifat, qulaylik yoki "best practice" darajasidagi tavsiyalar. |

Har bir topilma quyidagi shaklda beriladi: **belgi + qisqa nom → dalil (`fayl:qator`) → taʼsir → tuzatish yoʻnalishi**. Dalil sifatida aniq fayl va qator koʻrsatilgan, shunda tekshirish oson.

---

## Muhim eslatma: qamrov

Bu audit **kodni oʻqib chiqishga** asoslangan (statik tahlil). Tizim ishga tushirilib, real yuk bilan sinovdan oʻtkazilmagan. Shuning uchun:

- 🔴/🟠 topilmalar **kod dalili bilan** tasdiqlangan — yuqori ishonch.
- Masshtab/performance boʻyicha baholar **taxminiy** — real oʻlchov (profiling/load-test) bilan tasdiqlash tavsiya etiladi.
- Har bir kritik topilma uchun "**Qanday tekshirish**" boʻlimi berilgan, shunda siz oʻzingiz reproduksiya qila olasiz.
