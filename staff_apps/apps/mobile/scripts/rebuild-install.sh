#!/usr/bin/env bash
# Mobil (Expo/React Native) ilovani lokal release APK sifatida qayta quradi va ulangan
# Android qurilmaga o'rnatadi. Bu shu paytgacha qo'lda, bir nechta buyruq bilan qilingan
# ishning avtomatlashtirilgani: rsync (bo'shliqli yo'l muammosi uchun alohida build papkasi) ->
# gradlew assembleRelease -> adb install -> kerak bo'lsa `pm install-existing --user 0`
# (ba'zi Xiaomi qurilmalarida paket faqat ikkinchi profilga o'rnatilib, asosiy ekranda
# ko'rinmay qolishi mumkin) -> ilovani ishga tushirish.
#
# Ishlatilishi:
#   staff_apps/apps/mobile/scripts/rebuild-install.sh [--full]
# --full: `expo prebuild --clean` bilan native loyihani noldan qayta yaratadi (native
#         konfiguratsiya - masalan app.json'dagi plugin - o'zgarganda kerak). Standart holda
#         faqat JS/TS o'zgarishlari uchun tezroq, mavjud `android/` papkasidan foydalaniladi.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
BUILD_ROOT="${POS_BUILD_ROOT:-$HOME/pos_build}"
BUILD_STAFF_APPS="$BUILD_ROOT/staff_apps"
ANDROID_DIR="$BUILD_STAFF_APPS/apps/mobile/android"

ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
ADB="$ANDROID_HOME/platform-tools/adb"
export ANDROID_HOME JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

FULL=0
if [[ "${1:-}" == "--full" ]]; then
  FULL=1
fi

echo "==> 1/5: Manba kodni build papkasiga nusxalash ($BUILD_STAFF_APPS)"
echo "    (bo'shliqli papka nomi ndk-build'ni buzadi, shuning uchun alohida yo'l ishlatiladi)"
# android/build, .gradle, .cxx - generatsiya qilingan keshlar: repodagi eskisini nusxalamaymiz, aks holda
# ichidagi (bo'shliqli) asl yo'llar autolinking.json orqali build'ni buzadi.
mkdir -p "$BUILD_ROOT"
rsync -a --delete \
  --exclude node_modules \
  --exclude .expo \
  --exclude .git \
  --exclude 'apps/cashier/out' \
  --exclude 'apps/cashier/release' \
  --exclude 'apps/mobile/android/build' \
  --exclude 'apps/mobile/android/.gradle' \
  --exclude 'apps/mobile/android/app/build' \
  --exclude 'apps/mobile/android/app/.cxx' \
  "$REPO_ROOT/staff_apps/" "$BUILD_STAFF_APPS/"

if [[ $FULL -eq 1 || ! -d "$ANDROID_DIR" ]]; then
  echo "==> 2/5: expo prebuild --clean (native loyiha qayta yaratilmoqda)"
  (cd "$BUILD_STAFF_APPS/apps/mobile" && npx expo prebuild --platform android --clean)
  # Faqat arm64-v8a: haqiqiy telefonlarning aksariyati shu, build vaqtini ~4x qisqartiradi.
  if ! grep -q '^reactNativeArchitectures=arm64-v8a$' "$ANDROID_DIR/gradle.properties" 2>/dev/null; then
    sed -i '' '/^reactNativeArchitectures=/d' "$ANDROID_DIR/gradle.properties" 2>/dev/null || true
    # prebuild yaratgan fayl oxirida yangi qator bo'lmasligi mumkin - aks holda oxirgi sozlama bilan yopishib ketadi.
    [[ -n "$(tail -c1 "$ANDROID_DIR/gradle.properties")" ]] && echo >> "$ANDROID_DIR/gradle.properties"
    echo 'reactNativeArchitectures=arm64-v8a' >> "$ANDROID_DIR/gradle.properties"
  fi
else
  echo "==> 2/5: mavjud android/ papkasi ishlatiladi (--full bersangiz noldan quriladi)"
fi

echo "==> 3/5: gradlew assembleRelease"
(cd "$ANDROID_DIR" && ./gradlew assembleRelease --offline) || (cd "$ANDROID_DIR" && ./gradlew assembleRelease)

APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$APK" ]]; then
  echo "XATO: APK topilmadi ($APK)" >&2
  exit 1
fi
echo "    APK tayyor: $APK ($(du -h "$APK" | cut -f1))"

echo "==> 4/5: ulangan qurilmaga o'rnatish"
DEVICE="$("$ADB" devices | awk 'NR==2{print $1}')"
if [[ -z "$DEVICE" ]]; then
  echo "XATO: hech qanday qurilma ulanmagan (adb devices bo'sh)" >&2
  exit 1
fi
echo "    qurilma: $DEVICE"
"$ADB" -s "$DEVICE" shell input keyevent KEYCODE_WAKEUP || true
if ! "$ADB" -s "$DEVICE" install -r "$APK"; then
  echo "    oddiy install muvaffaqiyatsiz, tasdiqlash so'ralgan bo'lishi mumkin - telefon ekranini tekshiring." >&2
  exit 1
fi
PKG="uz.hamrohpos.staff"
# Ba'zi Xiaomi/MIUI qurilmalarida install muvaffaqiyatli bo'lsa ham paket asosiy profilga
# (User 0) emas, faqat ikkinchi profilga tegishli bo'lib qolishi mumkin - belgi chiqmaydi.
if ! "$ADB" -s "$DEVICE" shell pm list packages --user 0 "$PKG" | grep -q "$PKG"; then
  echo "    User 0 uchun ko'rinmayapti, install-existing bilan ulanmoqda..."
  "$ADB" -s "$DEVICE" shell pm install-existing --user 0 "$PKG"
fi

echo "==> 5/5: ilovani ishga tushirish"
"$ADB" -s "$DEVICE" shell am start -n "$PKG/.MainActivity" >/dev/null

echo "Tayyor."
