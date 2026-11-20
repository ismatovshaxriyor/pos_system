#!/usr/bin/env bash
# Yangi restoran mashinasida local_server'ni (Bola) prod compose bilan birinchi marta
# ko'tarish uchun avtomatlashtirilgan skript. Shu paytgacha qo'lda, bir nechta alohida
# qadam (.env nusxalash/to'ldirish, backups/ yaratish, kalitni tekshirish, compose'ni
# ishga tushirish, natijani curl bilan tekshirish) qilingan ishni bitta buyruqqa jamlaydi.
#
# Ishlatilishi (local_server/ papkasida yoki istalgan joydan):
#   local_server/scripts/setup-new-restaurant.sh [--build]
# --build: ghcr'dan image tortish o'rniga shu mashinada manba koddan quradi
#          (masalan ghcr paketi hali private/yo'q bo'lsa, yoki eng so'nggi,
#          hali reliz qilinmagan o'zgarishlarni sinab ko'rish uchun).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$LOCAL_SERVER_DIR"

BUILD_FLAG=""
if [[ "${1:-}" == "--build" ]]; then
  BUILD_FLAG="--build"
fi

echo "==> 1/5: .env"
if [[ -f .env ]]; then
  echo "    allaqachon mavjud, tegilmaydi."
else
  cp .env.example .env
  SECRET_KEY="$(openssl rand -hex 32)"
  DB_PASSWORD="$(openssl rand -hex 16)"
  WATCHTOWER_TOKEN="$(openssl rand -hex 16)"
  # macOS va GNU sed farqi uchun -i.bak + o'chirish (ikkala platformada ham ishlaydi).
  sed -i.bak \
    -e "s/^SECRET_KEY=.*/SECRET_KEY=${SECRET_KEY}/" \
    -e "s/^DB_PASSWORD=.*/DB_PASSWORD=${DB_PASSWORD}/" \
    -e "s/^WATCHTOWER_TOKEN=.*/WATCHTOWER_TOKEN=${WATCHTOWER_TOKEN}/" \
    .env
  rm -f .env.bak
  # POS_IMAGE'ni git remote'dan avtomatik aniqlash (release-local-server.yml ham shu
  # mantiq bilan push qiladi: kichik harfli GitHub owner).
  REMOTE_URL="$(git -C "$LOCAL_SERVER_DIR/.." remote get-url origin 2>/dev/null || true)"
  OWNER="$(echo "$REMOTE_URL" | sed -nE 's#.*[:/]([A-Za-z0-9_.-]+)/[A-Za-z0-9_.-]+(\.git)?$#\1#p' | tr '[:upper:]' '[:lower:]')"
  if [[ -n "$OWNER" ]]; then
    sed -i.bak "s#^POS_IMAGE=.*#POS_IMAGE=ghcr.io/${OWNER}/pos-local#" .env
    rm -f .env.bak
    echo "    yaratildi, POS_IMAGE=ghcr.io/${OWNER}/pos-local avtomatik belgilandi."
  else
    echo "    yaratildi (POS_IMAGE'ni qo'lda to'g'rilang - git remote topilmadi)."
  fi
  echo "    DIQQAT: CLOUDFLARE_TUNNEL_TOKEN hali 'change-me' - masofaviy kirish kerak bo'lsa, docs/4 bo'yicha to'ldiring."
fi

echo "==> 2/5: backups/"
mkdir -p backups

echo "==> 3/5: litsenziya ommaviy kaliti"
if [[ -f keys/license_public.pem ]]; then
  echo "    keys/license_public.pem topildi."
else
  echo "    XATO: keys/license_public.pem yo'q. 'setup-licensing' bo'yicha kalitni joylashtiring, keyin qayta ishga tushiring." >&2
  exit 1
fi

echo "==> 4/5: compose'ni ko'tarish"
SCALE_ARGS=()
if grep -q '^CLOUDFLARE_TUNNEL_TOKEN=change-me$' .env 2>/dev/null; then
  echo "    CLOUDFLARE_TUNNEL_TOKEN hali to'ldirilmagan - cloudflared servisi ishga tushirilmaydi (keyinroq qo'lda yoqing)."
  SCALE_ARGS=(--scale cloudflared=0)
fi
docker compose -f docker-compose.prod.yml up -d $BUILD_FLAG "${SCALE_ARGS[@]}"

echo "==> 5/5: tekshirish"
sleep 3
HOST_IP="$(ifconfig 2>/dev/null | awk '/inet /{print $2}' | grep -v '^127\.' | head -1)"
echo "    mashinaning LAN IP'si: ${HOST_IP:-(topilmadi)}"
if curl -fsS -m 5 "http://localhost:8000/api/discovery/" > /tmp/pos-discovery-check.json 2>/dev/null; then
  echo "    /api/discovery/ javob berdi:"
  cat /tmp/pos-discovery-check.json
  echo
  if [[ -n "$HOST_IP" ]]; then
    echo "    Telefon/boshqa qurilmalar uchun manzil: http://${HOST_IP}:8000"
  fi
else
  echo "    DIQQAT: localhost:8000/api/discovery/ javob bermadi - 'docker compose -f docker-compose.prod.yml logs web' bilan tekshiring." >&2
fi

echo "Tayyor."
