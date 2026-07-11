# 02. Xavfsizlik auditi

## Tahdid modeli (kim nimadan himoyalanadi)

Loyihaning xavfsizlik dizayni ikki xil dushmanni koʻzda tutadi:

1. **Toʻlamaydigan/qaroqchi restoran** — Bola kompyuteriga jismonan ega, litsenziyani chetlab oʻtmoqchi. Himoya: hardware binding + offline JWT + Cython obfuskatsiya + kill-switch. **Bu qatlam yaxshi qurilgan.**
2. **Ichki firibgar xodim / xato mijoz** — restoran ichidagi kassir/ofitsiant API'dan suiisteʼmol qiladi. Himoya: rol-asosli ruxsatlar, server-tomon tekshiruvlar. **Bu qatlamda teshiklar bor** (qarang [01_kritik_xatolar.md](01_kritik_xatolar.md) #2, #4).

Quyida qolgan xavfsizlik topilmalari.

---

## 🟠 1. Brute-force himoyasi notekis — admin login va DRF token himoyasiz

**Dalil:**
- `local_server/core/services.py:112-149` — PIN login Redis'da rate-limited (5 urinish → 5 daqiqa lockout). ✅
- Lekin `local_server/config/urls.py:31` — `/api/auth/login/` = `obtain_auth_token` (admin telefon+parol) — **hech qanday throttle yoʻq**.
- `local_server/config/settings.py:198-204` — `REST_FRAMEWORK` da `DEFAULT_THROTTLE_CLASSES`/`RATES` **umuman sozlanmagan**.
- `cloud_server/sync/views.py:17` — `ActivationView` unauthenticated + throttle yoʻq.

**Taʼsir:** 🟠
- Admin (bosh menejer) hisobi telefon+parol bilan cheksiz urinish ostida — parol kuchsiz boʻlsa buzib olinadi. Bu hisob `is_superuser=True` (`local_server/licensing/views.py:33`) — yaʼni eng koʻp imtiyozli.
- Litsenziya kaliti guessing/enumeration (kalit maydoni katta boʻlsa ham, throttle yoʻqligi keraksiz yuza).

**Tuzatish yoʻnalishi:**
- `REST_FRAMEWORK` ga `ScopedRateThrottle` yoki `AnonRateThrottle` qoʻshing. Login uchun IP+username boʻyicha alohida qatʼiy skop (masalan 10/min).
- Admin login uchun ham PIN'dagidek lockout mantiqiga oʻxshash himoya (`django-axes` kutubxonasi eng oson yechim).
- Cloud `ActivationView` va `RenewView` ga IP-asosli anon throttle.

---

## 🟠 2. Cloud sync endpoint'lari `IsAuthenticated` siz — auth header boʻlmasa 500

**Dalil:** `cloud_server/sync/views.py` — `HeartbeatView`, `CommandResultView`, `ErrorLogView` da `permission_classes` **oʻrnatilmagan**, va cloud `REST_FRAMEWORK` da `DEFAULT_PERMISSION_CLASSES` yoʻq (`settings.py:173-176`) → default `AllowAny`.

Bu view'lar `request.auth` (License obyekti) mavjudligiga tayanadi. Agar `Authorization` header **umuman boʻlmasa**, `HeartbeatAuthentication.authenticate` `None` qaytaradi → `request.auth is None` → `license_obj.restaurant` → `AttributeError` → **500**.

**Taʼsir:** 🟠 Auth yoʻq soʻrov 401/403 oʻrniga 500 beradi (noaniq xato, log shovqini, DoS uchun arzon yuza). Xavfsizlik teshigi emas (haqiqiy auth baribir kerak), lekin ishonchsiz xulq.

**Tuzatish yoʻnalishi:** bu uch view'ga `permission_classes = [permissions.IsAuthenticated]` qoʻshing (`RenewView` da allaqachon bor). Shunda auth yoʻqligi toza 403 beradi.

---

## 🟡 3. HTTPS/cookie xavfsizlik sozlamalari yoʻq

**Dalil:** ikkala `config/settings.py` da yoʻq: `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_HSTS_SECONDS`, `SECURE_SSL_REDIRECT`. `SECURE_PROXY_SSL_HEADER` shartli oʻrnatiladi (TLS Cloudflare'da tugaydi), lekin cookie'lar `Secure` bayrogʻisiz.

**Taʼsir:** 🟡 Admin panel sessiyasi (ikkala serverda ham Django admin sessiya-cookie ishlatadi) TLS'siz ichki hop'da yoki noto'gʻri konfiguratsiyada sizishi mumkin. Cloudflare edge TLS bergani uchun tashqi risk past, lekin best-practice buzilgan.

**Tuzatish yoʻnalishi:** prod'da (`DEBUG=0` boʻlganda) yoqing:
```python
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = 31536000  # Cloudflare bilan ehtiyot boʻlib
```

---

## 🟡 4. `CORS_ALLOW_ALL_ORIGINS = True` ikkala serverda

**Dalil:** `local_server/config/settings.py:97`, `cloud_server/config/settings.py:79`.

**Baholash:** 🟡 Oʻzicha kritik emas — brauzer `credentials` bilan `*` origin'ni bloklaydi, va mobil ilova CORS'ga boʻysunmaydi. Lekin:
- local_server DRF'da `SessionAuthentication` yoqilgan (`settings.py:202`) — admin brauzerda ochiq boʻlsa, keng CORS + boshqa teshik birga xavfni oshiradi.
- Prinsip: ochiq CORS keraksiz keng yuza.

**Tuzatish yoʻnalishi:** mobil ilova token-auth ishlatadi, CORS'ni umuman talab qilmaydi. `CORS_ALLOW_ALL_ORIGINS` ni `False` qilib, faqat kerakli origin'larni (agar web-admin frontend boʻlsa) `CORS_ALLOWED_ORIGINS` ga qoʻying. Agar hech qanday brauzer-frontend yoʻq boʻlsa, CORS'ni butunlay oʻchiring.

---

## 🟡 5. `SwaggerTokenPrefixMiddleware` production'da ham faol

**Dalil:** `local_server/config/settings.py:94` — middleware `MIDDLEWARE` da shartsiz. `local_server/core/middleware.py` — 40-belgili, probelsiz `Authorization` header'ga avtomatik `Token ` prefiksini qoʻshadi.

**Taʼsir:** 🟢/🟡 Xavfli emas, lekin faqat Swagger UI qulayligi uchun moʻljallangan xulq production'da har soʻrovda ishlaydi — keraksiz sirli xulq va kichik yuza.

**Tuzatish yoʻnalishi:** `if settings.DEBUG` bilan oʻrang yoki umuman olib tashlab, Swagger'da toʻgʻri `Token <key>` kiritishni oʻrgating.

---

## 🟢 6. Hardware-trust modelining tabiiy chegarasi (hujjatlashtirilsin)

**Dalil:** `hardware_hash` Bola tomonda hisoblanadi va Ona'ga yuboriladi (`local_server/licensing/hardware.py` → `client.activate`). Bola kompyuteriga toʻliq ega qaroqchi istalgan `hardware_hash` ni yuborishi mumkin.

**Baholash:** 🟢 Bu — mijoz qurilmasiga tayanadigan har qanday litsenziyaning **tabiiy** cheklovi, xato emas. Cython obfuskatsiya (`local_server/setup.py`, Dockerfile) buni qiyinlashtirish uchun. Muhimi — buni **maʼlum cheklov** sifatida hujjatlash, va offline token/public-key qabul qilish yoʻli (`_get_public_key` LicenseState.public_key ni afzal koʻradi) faqat HTTPS orqali kelishiga ishonch hosil qilish (aks holda MITM public key almashtirishi mumkin).

**Tuzatish yoʻnalishi:**
- `ONA_SERVER_URL` prod'da **majburiy `https://`** boʻlsin (validatsiya qoʻshing).
- Kelajakda: certificate pinning yoki activation javobidagi public key'ni ilk marta olganidan keyin "qotirib qoʻyish" (agar keyingi javob boshqa key bersa — rad etish).

---

## 🟢 7. Boshqa kichik kuzatuvlar

- **`SECRET_KEY` ning ishonchsiz default'i** (`settings.py:28`) — prod `.env` bilan almashtiriladi, lekin operator unutsa kuchsiz kalit ishlaydi. `.env.example` da `change-me` — deploy checklist'ida majburiy almashtirilsin.
- **PIN enumeration timing oracle** (`services.py:147`) — qurilma topilmasa `check_password` chaqirilmaydi (tezroq javob) → yaroqli `device_id` larni ajratish uchun kichik timing farqi. Past risk (device_id oʻzi maxfiy emas), lekin bir xil ishlov berish tavsiya etiladi.
- **`RestaurantAdminAccount.phone` global unique** (`cloud_server/tenants/models.py:83`) — bir egasi ikki restoranda admin boʻlsa, bitta telefon ishlatolmaydi. Dizayn cheklovi — kelajakda koʻp-restoranli egalar boʻlsa qayta koʻrib chiqilsin.
- **Xato-log `message` maydonida uzunlik chegarasi yoʻq** (`cloud_server/sync/serializers.py:34` — `CharField()` `max_length` siz) — buzuq/niyati buzuq Bola juda katta xabar yuborishi mumkin (litsenziya bilan auth qilingan, shuning uchun past risk). `max_length` qoʻshing.

---

## Xulosa

Xavfsizlikning **eng qiyin qismi** (litsenziya, kill-switch, kalit boshqaruvi) toʻgʻri. Kamchiliklar ikki joyda: **ichki API suiisteʼmoli** (asosiy topilmalar [01](01_kritik_xatolar.md) da) va **standart web-hardening** (throttle, secure cookies, CORS). Bularning hech biri arxitekturaviy qayta ishlashni talab qilmaydi — nuqtaviy tuzatishlar.

Keyingi: **[03_migratsiya_strategiyasi.md](03_migratsiya_strategiyasi.md)**.
