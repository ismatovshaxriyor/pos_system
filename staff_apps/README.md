# staff_apps — POS xodimlari ilovalari

Restoran xodimlari uchun ikki ilova, bitta monorepo (npm workspaces). Ikkalasi ham `local_server` ("Bola") bilan restoran WiFi/LAN'ida gaplashadi (internet shart emas).

| Paket | Kim uchun | Texnologiya |
|---|---|---|
| `apps/mobile` (`@pos/mobile`) | Ofitsiant + menejer (admin) | Expo (React Native), Expo Router |
| `apps/cashier` (`@pos/cashier`) | Kassir (+ menejer) — Windows sensorli monoblok | Electron + Vite + React |
| `packages/shared` (`@pos/shared`) | Ikkalasi uchun umumiy (mantiq) | TypeScript (build'siz, manba to'g'ridan-to'g'ri import) |
| `packages/design` (`@pos/design`) | Ikkalasi uchun umumiy (dizayn tokenlari) | TypeScript + CSS (build'siz) |

## Nima umumiy (`@pos/shared`)

Backend shartnomasi bir marta yoziladi, ikkala ilova ishlatadi:

- `types.ts` — `local_server/core/serializers.py` ga mos tiplar (**pul maydonlari `string`**, DRF `DecimalField` shunday qaytaradi)
- `client.ts` / `errors.ts` — HTTP client: `Authorization: Token`, `X-Device-ID`, timeout, backend xato formati `{detail, code, fields}`
- `api.ts` — endpoint'lar (auth, bootstrap, orders, register-session)
- `realtime.ts` — `ws/events/` klienti: qayta ulanish (backoff+jitter), "zombi" ulanishni aniqlash, `client_resync` eventi
- `session.ts` — sessiya (server manzili, `device_id`, token, rol tekshiruvi)
- `react.tsx` (`@pos/shared/react`) — `useSession`, `useBootstrap`, `useRealtimeRefresh`
- `money.ts` (tiyinda hisob), `phone.ts`, `uuid.ts`, `roles.ts`

Muhim qarorlar:
- **401 ≠ 403.** `401` (token/qurilma yaroqsiz) → sessiya tugaydi. `403` (huquq yo'q, masalan ofitsiant `set_discount` chaqirdi, yoki waiter-login'da menejer tasdig'i kutilmoqda) → sessiya tegilmaydi.
- `start` / `add_item` / `close` / `cancel` to'liq `Order` **emas**, `{status}` qaytaradi — keyin `orders.get(id)` kerak.
- WebSocket payload'lari "qayta so'ra" signali; stol holati so'rovchiga nisbiy bo'lgani uchun tayyor kelmaydi.
- Ilova faqat o'z rollarini kiritadi (`roles.ts`): mobil → manager/waiter, kassa → cashier/manager. Bu UX, xavfsizlik chegarasi emas.

## Dizayn tizimi (`@pos/design`)

HamrohPOS "Shveytsariya tartibi"ning **yumshoq** varianti (kundalik, uzoq ishlash uchun): iliq qog'oz fon, oq kartochkalar, 9–18px burchaklar, yengil soya.

- **Ranglar:** `tokens.ts` (React Native) va `tokens.css` (veb/kassir) — ikkalasi bir xil bo'lishi `tokens.test.ts` da tekshiriladi; biriga o'zgartirish kiritsangiz, ikkinchisiga ham kiriting. Och va tungi mavzu.
- **Rang qoidasi:** qizil (`signal`) faqat ekrandagi YAGONA asosiy amal ("To'lash", "Oshxonaga yuborish", "Kirish") va xatolar uchun. Xavfli amal qizil emas — siyoh kontur + tasdiq. Yashil/sariq faqat HOLAT: sariq chap chiziq/pilyula = 45+ daqiqa kutgan buyurtma, yashil = qisman to'langan.
- **Shriftlar** ilova ichida (offline): Archivo (matn), Big Shoulders Display (sarlavha), IBM Plex Mono (raqamlar). Kassir — `@fontsource/*` (`@pos/design/fonts.web`; CSP'da `font-src 'self' data:`), mobil — `@expo-google-fonts/*` (`expo-font`).
- **Ko'z uchun sozlamalar** (☰ menyu, har qurilmada alohida saqlanadi, serverga yuborilmaydi): mavzu Kun/Tun/Avto (avto = 19:00–07:00 tungi), matn o'lchami Oddiy/Katta/Juda katta (1 / 1.125 / 1.25), harakatni kamaytirish; kassirda qo'shimcha "to'lov tovushi". Mantiq (`resolveTheme`, `textScaleFactor`) `@pos/design` da, testlangan.
- **Sensorli o'lchamlar:** kassirda tugmalar ≥64px (asosiy tugma 80px), mobilda ≥44px.
- Split-flap (`flapCells`) faqat "Qolgan" jami va "To'landi" qaytimi uchun.

## Ishga tushirish

```bash
cd staff_apps
npm install

npm test                    # @pos/shared + @pos/design testlari (vitest)
npm run typecheck           # hamma paket

npm run mobile              # Expo dev server (telefon: Expo Go / development build)
npm run cashier             # Electron dev (macOS/Windows)
npm run build -w @pos/cashier
npm run dist:win -w @pos/cashier   # Windows installer (NSIS) -> apps/cashier/release/
```

Backend: `cd local_server && docker compose up -d --build` (port 8000). Ilovada server manzili sifatida kompyuterning LAN IP'sini kiriting (telefon uchun `localhost` ishlamaydi).

> **npm 11 `install-scripts`:** yangi npm paket postinstall skriptlarini o'zi ishga tushirmaydi. `electron` o'rnatilgach binary yuklanmasa: `node node_modules/electron/install.js`.

## Autentifikatsiya (backend: `local_server/core/auth_views.py`)

| Rol | Ilova | Yo'l |
|---|---|---|
| Menejer | mobil / kassa | telefon + parol → `POST /api/auth/login/` (qurilmaga bog'lanmaydi) |
| Ofitsiant | mobil | telefon + parol + `device_id` → `waiter-login/` (TOFU; yangi qurilmada menejer tasdig'i) |
| Kassir | kassa | birinchi marta: menejer kodi + PIN tanlash (`device/register/`); keyin kundalik 6 xonali PIN (`pin-login/`), smena almashishda har kassir o'z PIN'i bilan |

Token: mobil — `expo-secure-store` (Keychain/Keystore); kassa — Electron `safeStorage` (Windows DPAPI), shifrlash yo'q bo'lsa saqlanmaydi (jim ochiq-matn zaxirasi yo'q).

## Backend bilan bog'liq o'zgarish

`local_server/config/settings.py` ga `CORS_ALLOW_HEADERS = (*default_headers, 'x-device-id')` qo'shildi. Brauzer muhitidagi kassa ilovasi (Electron renderer) har so'rovda `X-Device-ID` yuboradi; `corsheaders` standart ro'yxatida u yo'q, preflight rad etilardi. Mobil ilovaga ta'sir qilmaydi.

## Hisobotlar (mobil, faqat menejer)

Bosh ekrandagi "Hisobotlar" kartochkasi (`/reports`). Bo'limlar: **Panel** (bir kun: tushum, oldingi kun bilan taqqoslash, to'lov turlari, soatlik grafik, top taomlar, zal, bekor qilinganlar), **Sotuv** (Bugun/Kecha/7 kun/Shu oy yoki ‹ › bilan surish; kunlar/ofitsiantlar/taomlar/toifalar kesimi, oldingi davr bilan taqqoslash), **Xodim** (ofitsiant tushumi va hozir ishdagilar), **Qarz** (qarzdorlar va ombor). Pastga tortib yangilash va "Hisobotni ulashish" (matn) bor; "bugun" har daqiqa jimgina yangilanadi. Davr hisoblari qurilmaning mahalliy sanasi bilan (`@pos/shared/reports.ts`), server chegarani `Asia/Tashkent` bo'yicha qo'llaydi. Kassir ilovasida (☰ menyu → "Kun yakuni hisoboti") faqat bugungi kun yakuni bor: tushum, usullar, kassadagi kutilgan naqd pul, nasiya, bekorlar va hali yopilmagan buyurtmalar; "Nusxa olish" matnni xabar sifatida yuborish uchun (`GET /api/reports/day-end/`, kassir yoki menejer). "Kassani yopish" ham shu hisobotdan o'tadi: hisobot ko'rsatiladi, tasdiq tugmasi pastda (yopilmagan buyurtma bo'lsa "Baribir yopish").

## Ilovani yangilash

Ilovalar yangilanishni **faqat Bola'dan** oladi (`GET /api/license/app-updates/`): Ona'dagi `MobileApp` (Ona admin → Mobil ilovalar) o'rnatuvchisi heartbeat orqali Bola'ga yetkaziladi, sha256 tekshiriladi va LAN'dan tarqatiladi. `slug`: kassir ilovasi `kassir`, mobil ilova `ofitsiant`/`manager` (admin shu nom bilan yuklashi kerak). `is_required` belgilangan bo'lsa eski versiya bloklanadi (to'liq ekran), aks holda pastda "Yangilash / Keyinroq" eslatmasi chiqadi.

- **Kassir (Electron, Windows):** o'rnatuvchi (NSIS `.exe`) yuklanadi, sha256 tekshiriladi, `/S --force-run` bilan jim o'rnatiladi, ilova o'zi yopilib qayta ochiladi. Faqat shu manzilga (`/api/license/app-updates/<id>/download/`) ruxsat.
- **Mobil (Android):** APK havolasi tizim yuklab olish menejeriga beriladi; foydalanuvchi "O'rnatish"ni bosadi (Android jim o'rnatishga ruxsat bermaydi). Ilova ichida sha256 tekshirilmaydi (Bola yuklab olganda tekshirgan).

Ilova versiyasi: kassir `package.json`/`app.getVersion()`, mobil `app.json` `version`. Yangi o'rnatuvchi chiqarishda shu versiyani oshirish kerak, aks holda ilova "yangilandi" deb hisoblamaydi.

## Hali qilinmagan / tekshirilmagan

- **Ekranlar:** poydevor + ofitsiant oqimi (mobil: stollar → savat → oshxonaga yuborish → buyurtma, mahsulot qo'shish) + kassir oqimi bor. Kassir ekrani (2026-11-20 yumshoq dizaynga o'tkazilgan, kun/tun/matn o'lchami Electron'da tekshirilgan): 3 ustun [ochiq buyurtmalar | chek | to'lov], scrollsiz (1366×768 va 1920×1080 da ko'rilgan; ≥1700px da CSS `zoom`); bo'sh kiritishda "To'lash" = aniq qolgan summa; naqdda tez summalar + qaytim; to'lov to'liq bo'lsa buyurtma avtomatik yopiladi; kassani yopish/smena almashtirish ☰ menyuda (tasdiq bilan); jismoniy klaviatura (raqam/Backspace/Enter/Esc). **Qo'shildi:** chek ostida "Chegirma" (faqat menejer: foiz yoki summa + sabab, serverda `set_discount`), "Qarzga yozish" (mijoz qidirish/yangi mijoz, qaytarish muddati 7/14/30 kun yoki muddatsiz → `close-on-credit`), "Hisob" (`print-pre-bill`) — Electron'da haqiqiy serverga qarshi tekshirilgan (chegirma, yangi mijoz, qarz balansi va `due_date`). ☰ menyuda **Qarzdorlar** (qarzi borlar ro'yxati → mijoz → summa + Naqd/Karta/Boshqa + "Hammasi" → `repay`; ortiqcha summa rad etiladi; haqiqiy serverda tekshirilgan). **Yo'q:** `print-receipt` qayta chop etish tugmasi, menejer dashboard/hisobotlar/xodim-qurilma boshqaruvi, buyurtmani ko'chirish/bo'lish. Mobil menejer uchun **Qurilmalar** ekrani bor (yangi ofitsiant qurilmasini tasdiqlash / faol qurilmani chetlatish; backend WS event yubormagani uchun 10–30 s polling; oqim haqiqiy serverda e2e tekshirilgan: yangi qurilma → 403 → tasdiq → kirish → chetlatish → 401). **Qo'lga moslash** (☰ menyu / ⚙ sozlamalar, har qurilmada alohida; ta'riflar `@pos/design/layout.ts`): kassirda 4 ta joylashuv — O'ng qo'l (to'lov o'ngda), Chap qo'l (to'lov, ☰ va "To'lash" chapda, menyu chapdan ochiladi), Ikki qo'l A (buyurtmalar | to'lov | chek) va B (chek | to'lov | buyurtmalar); mobilda 4 ta — O'ng, Chap ("+" va sarlavha tugmalari chapda), Ikki qo'l · chetlarda ("−" chapda, "+" o'ngda), Ikki qo'l · katta (tanlangan mahsulotda ikkita 50/50 tugma). Raqam tugmalari hech qachon ko'zgulanmaydi. Kassir 4 tartibi Electron'da ko'rilgan; mobil faqat typecheck/export'dan o'tgan. Mobil ekranlar (yumshoq dizayn: stollar kartochkalari, savat paneli, ⚙ sozlamalar) faqat typecheck/export'dan o'tgan — telefon/simulyatorda ko'rilmagan, shriftlar yuklanishi ham real qurilmada tekshirilishi kerak. Mobil `expo export --platform web` ishlamaydi (`expo-sqlite` wasm) — veb maqsad emas.
- **Tekshirilgan (2026-11-20, haqiqiy local_server, dev stack :8010):** `@pos/shared` e2e (PIN/waiter/manager login, 403 tasdiq kutish, bootstrap, `submitDraft`, `sync_uuid` idempotentligi, split-payment, yopish, WS eventlar, 401→signOut, rol cheklovi) — 21/21; Electron renderer'da CORS preflight `X-Device-ID` bilan; Electron UI: ulanish → menejer login → "Jonli" → ochiq buyurtmalar → to'lov paneli. E2E skripti repoda yo'q (scratchpad'da edi).
- **`safeStorage` deprecation:** Electron 45 sync `isEncryptionAvailable/encryptString/decryptString` ni "o'chiriladi" deb ogohlantiryapti — `*Async` variantlarga o'tish kerak (`src/main/secure-store.ts`).
- **Offline navbat:** `sync_uuid` idempotentligi backend'da bor, lekin klient tomonida buyurtmalarni offline saqlab keyin yuborish navbati yo'q.
- **mDNS avto-topish** (`_pos-bola._tcp`): native modul kerak (development build) — hozir manzil qo'lda kiritiladi.
- **Windows'da sinalmagan:** Electron ilovasi faqat macOS'da qurildi/ishga tushirildi. Windows installer (`dist:win`), `safeStorage`/DPAPI, sensorli ekran, Windows sensorli klaviatura (telefon/kod maydonlari uchun) — real monoblokda tekshirilishi kerak.
- **WebSocket `Origin`:** paketlangan Electron `file://` dan ochiladi; main jarayon WS `Origin`ini server manziliga almashtiradi (`hardenSession`). `ALLOWED_HOSTS=localhost,127.0.0.1` bilan dev serverda tasdiqlandi (Electron: "Jonli"). Eslatma: `AllowedHostsOriginValidator` `Origin`siz WS'ni rad etadi (Node/skriptlar uchun muhim) — React Native'ning `Origin` yuborishi esa real qurilmada tekshirilmagan.
- **Ikonkalar/branding, EAS build profillari, bundle ID'lar** (iOS/Android) — hali yo'q.
