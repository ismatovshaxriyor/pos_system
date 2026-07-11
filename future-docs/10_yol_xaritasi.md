# 10. Yoʻl xaritasi — ustuvorlik boʻyicha tartiblangan

Bu hujjat barcha oldingi topilmalarni **nima birinchi, nima keyin** tartibiga soladi. Asosiy tamoyil: **avval qon toʻxtatish (poydevorni buzilishdan saqlash), keyin qurish.**

---

## P0 — Darhol (yangi funksiya qurishdan OLDIN)

Bular production'da real zarar keltiradi yoki keltirishi mumkin. Yangi kod yozishdan oldin.

| # | Ish | Hujjat | Taxminiy hajm |
|---|-----|--------|--------------|
| P0.1 | **Migratsiyalarni commit qiling, `entrypoint.sh`dan `makemigrations` ni oling** | [03](03_migratsiya_strategiyasi.md) | Kichik (yarim kun), lekin eng muhim |
| P0.2 | **`Order.status` ni serializerda `read_only` qiling**, status oʻzgarishini faqat action orqali | [01](01_kritik_xatolar.md) #2 | Kichik |
| P0.3 | **`add_item`ga yopiq-status tekshiruvi + atomik** | [01](01_kritik_xatolar.md) #3 | Kichik |
| P0.4 | **`OrderItemViewSet` ni yoping** (router'dan olib tashlash yoki read-only) | [01](01_kritik_xatolar.md) #4 | Kichik |
| P0.5 | **Cloud prod'ga DB backup** + deploy oldidan `pg_dump` | [06](06_ishonchlilik_va_deploy.md) #2 | Kichik |
| P0.6 | **CI'da test + `makemigrations --check` gate** — buzuq kod prod'ga chiqmasin | [09](09_test_va_sifat.md) | Kichik |
| P0.7 | Har P0 tuzatishga **regression test** | [09](09_test_va_sifat.md) | P0 bilan birga |

**Nega birga:** P0.1 va P0.6 birga — migratsiyalar commit qilingach, CI ularni tekshirsin. P0.2–P0.4 bitta "buyurtma yaxlitligi" PR'i sifatida qilinishi mumkin.

---

## P1 — Yaqin (poydevorni mustahkamlash)

Zarar ehtimoli bor yoki tez orada kerak boʻladi.

| # | Ish | Hujjat |
|---|-----|--------|
| P1.1 | **Brute-force himoya**: DRF throttle + admin login lockout (`django-axes`) | [02](02_xavfsizlik_auditi.md) #1 |
| P1.2 | **Cloud sync view'lariga `IsAuthenticated`** (auth'siz 500 → 403) | [02](02_xavfsizlik_auditi.md) #2 |
| P1.3 | **`close` cancelled tekshiruvi + buyurtma state machine** | [01](01_kritik_xatolar.md) #5, [04](04_pos_biznes_mantiq.md) |
| P1.4 | **`total_amount` ni hisoblanadigan qilish** (staleness/race sinfini yoʻqotish) | [04](04_pos_biznes_mantiq.md) |
| P1.5 | **Void / Refund** (toʻlov qaytarish, buyurtma bekor qilish audit bilan) | [04](04_pos_biznes_mantiq.md) |
| P1.6 | **Secure cookies + prod security sozlamalari** | [02](02_xavfsizlik_auditi.md) #3 |
| P1.7 | **Deploy'ga qoʻlda tasdiq + canary Watchtower** | [06](06_ishonchlilik_va_deploy.md) #1, #3 |
| P1.8 | **Alerting** (Telegram): offline restoran, CRITICAL error, litsenziya muddati | [06](06_ishonchlilik_va_deploy.md) #6 |

---

## P2 — Asosiy funksiya: Sinxronizatsiya dvigateli

Bu — loyihaning **markaziy keyingi bosqichi** (docs vaʼdasini bajarish). P0/P1'dan keyin, chunki buzuq buyurtmalarni sinxronlash muammoni Ona'ga koʻchiradi.

| # | Ish | Hujjat |
|---|-----|--------|
| P2.1 | **Upstream order sync** (Bola→Ona), idempotent, error-log pattern'ini takrorlab | [05](05_sinxronizatsiya_dvigateli.md) 5.1 |
| P2.2 | **Ona'da sotuv hisoboti/dashboard** | [05](05_sinxronizatsiya_dvigateli.md) 5.2 |
| P2.3 | **Disaster recovery restore** (docs/4 vaʼdasi) | [05](05_sinxronizatsiya_dvigateli.md) 5.3 |
| P2.4 | **Downstream menyu** (Ona→Bola, bir tomonlama) | [05](05_sinxronizatsiya_dvigateli.md) 5.4 |
| P2.5 | **Ona retention** (ErrorLog/RemoteCommand tozalash) + **`last_seen` Redis'ga** | [07](07_performance_va_masshtab.md) #1, #2 |

**Eslatma:** P2.5 (retention, Redis last_seen) aslida sync'dan **oldin** qilinsa arzon — yozuv yuki boshdan toʻgʻri boʻladi. Uni P1 oxiriga surish mumkin.

---

## P3 — Yetuklik (real restoranga toʻliq chiqish)

| # | Ish | Hujjat |
|---|-----|--------|
| P3.1 | **Chek chop etish + fiskal/soliq integratsiyasi** (qonuniy talabni erta aniqlang!) | [04](04_pos_biznes_mantiq.md) |
| P3.2 | **Soliq + xizmat haqi** modelga | [04](04_pos_biznes_mantiq.md) |
| P3.3 | **Smena / kassa yopish (Z-report)** | [04](04_pos_biznes_mantiq.md) |
| P3.4 | **Mobil: bootstrap endpoint, pagination, offline navbat, izchil xato formati** | [08](08_mobil_api_va_realtime.md) |
| P3.5 | **Oshxona displey (KDS)** — real-time poydevor ustiga | [04](04_pos_biznes_mantiq.md), [08](08_mobil_api_va_realtime.md) |
| P3.6 | **Konteyner qatlanganligi** (read-only, networks, healthcheck) | [06](06_ishonchlilik_va_deploy.md) #4 |
| P3.7 | **Media WebP siqish** | [07](07_performance_va_masshtab.md) #5 |

---

## P4 — Kengayish (kelajak)

- Ombor/inventarizatsiya (recipe-based stock).
- Mijoz/sodiqlik (loyalty).
- Split-bill (hisobni mijozlarga boʻlish).
- Ilgʻor analitika (trend, bashorat).
- Multi-restoran egalari (bitta admin bir necha restoran).
- Selective WebSocket subscription, media CDN, Ona horizontal masshtab.

---

## Vizual xarita

```
P0 (qon toʻxtatish) ──→ P1 (mustahkamlash) ──→ P2 (SYNC dvigateli) ──→ P3 (yetuklik) ──→ P4 (kengayish)
   migratsiya            throttle/auth           upstream sync           chek/soliq          ombor
   buyurtma yaxlitligi   void/refund             DR restore              smena/KDS           loyalty
   backup + CI           state machine           menyu sync              mobil UX            analitika
                         retention/redis
```

---

## Bitta jumlada

**Avval [01](01_kritik_xatolar.md) va [03](03_migratsiya_strategiyasi.md)dagi P0'larni yoping (poydevor buzilmasligi uchun), keyin [05](05_sinxronizatsiya_dvigateli.md)dagi sinxronizatsiya dvigatelini quring (docs vaʼdasini bajarish uchun) — qolgani shu ikki asos ustiga tabiiy oʻrnashadi.**

Loyiha yaxshi qurilgan; bu yoʻl xaritasi uni **yaxshi qurilgan va ishonchli** holatga oʻtkazadi.
