#!/usr/bin/env bash
# ==============================================================================
# Bola (local_server) ni yangi restoran mashinasiga BIR BUYRUQ bilan o'rnatish
# (Linux va macOS). Windows uchun: scripts/install.ps1
#
#   ./scripts/install.sh            # savollar -> o'rnatish -> serverni ko'tarish
#   ./scripts/install.sh --yes      # savol bermaydi (hamma javob POS_* env'dan yoki default)
#   ./scripts/install.sh --build    # image'ni ghcr'dan tortmay, shu yerda manba koddan quradi
#   ./scripts/install.sh --config-only   # faqat .env/kalit/fayllarni tayyorlaydi (docker va
#                                         # tizimga TEGMAYDI - sinash va oldindan tayyorlash uchun)
#
# Nima qiladi:
#   1. Hamma savolni boshida bir marta so'raydi (litsenziya kaliti, ghcr token, Cloudflare...)
#   2. Yetishmayotgan dasturlarni o'zi o'rnatadi (Docker, curl, avahi), ruxsatlarni sozlaydi
#      (docker guruhi, firewall, uxlamaslik) - Linux distributiv/macOS'ga qarab
#   3. .env ni to'ldiradi (tasodifiy sirlar, qurilma barmoq izi, LICENSE_ENFORCEMENT=1)
#   4. docker compose bilan serverni ko'taradi, tayyor bo'lguncha kutadi, litsenziyani faollashtiradi
#   5. Telefon-ilovalar serverni topa olishini tekshiradi (DisallowedHost kabi xatolarni ushlaydi)
#
# Qayta ishga tushirsa xavfsiz (idempotent): mavjud .env sirlari va qurilma izi O'ZGARMAYDI.
#
# Savollarga avtomatik javob (env): POS_MODE=pull|build, POS_IMAGE, POS_GHCR_USER, POS_GHCR_TOKEN,
#   POS_LICENSE_KEY, POS_ONA_URL, POS_PUBLIC_DOMAIN, POS_CF_TOKEN, POS_PUBLIC_KEY_FILE
# ==============================================================================
set -Eeuo pipefail
trap 'echo "XATO: $0, $LINENO-qator (chiqish kodi $?)" >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$LOCAL_SERVER_DIR"
COMPOSE_FILE="docker-compose.prod.yml"
LOG_FILE="$LOCAL_SERVER_DIR/install.log"
DEFAULT_ONA_URL="https://hamrohpos.uz"

YES=0; CONFIG_ONLY=0; FORCE_BUILD=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) YES=1 ;;
    --config-only) CONFIG_ONLY=1 ;;
    --build) FORCE_BUILD=1 ;;
    -h|--help) sed -n '2,27p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Noma'lum parametr: $arg (--help ni ko'ring)" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------- yordamchilar
if [[ -t 1 ]]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'; else B=""; G=""; Y=""; R=""; N=""; fi
_log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$LOG_FILE" 2>/dev/null || true; }
step() { printf '\n%s==> %s%s\n' "$B" "$*" "$N"; _log "STEP $*"; }
info() { printf '    %s\n' "$*"; _log "$*"; }
ok()   { printf '    %s+%s %s\n' "$G" "$N" "$*"; _log "OK $*"; }
warn() { printf '    %s!%s %s\n' "$Y" "$N" "$*" >&2; _log "WARN $*"; }
die()  { printf '\n%sXATO:%s %s\n' "$R" "$N" "$*" >&2; _log "DIE $*"; exit 1; }

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# ask VAR "Savol" "default"  - env'da VAR allaqachon bo'lsa o'sha ishlatiladi (so'ramaydi)
ask() {
  local var="$1" prompt="$2" def="${3:-}" cur val=""
  cur="${!var:-}"
  if [[ -n "$cur" ]]; then printf -v "$var" '%s' "$cur"; return 0; fi
  if (( YES )); then printf -v "$var" '%s' "$def"; return 0; fi
  if [[ -n "$def" ]]; then read -r -p "    $prompt [$def]: " val || true; val="${val:-$def}"
  else read -r -p "    $prompt: " val || true; fi
  printf -v "$var" '%s' "$val"
}
ask_secret() {
  local var="$1" prompt="$2" cur val=""
  cur="${!var:-}"
  if [[ -n "$cur" ]]; then return 0; fi
  if (( YES )); then printf -v "$var" '%s' ""; return 0; fi
  read -r -s -p "    $prompt: " val || true; echo
  printf -v "$var" '%s' "$val"
}
confirm() { # confirm "Savol" y|n  -> 0 = ha
  local prompt="$1" def="${2:-y}" ans="" hint="[Y/n]"
  [[ "$def" == n ]] && hint="[y/N]"
  if (( YES )); then [[ "$def" == y ]]; return; fi
  read -r -p "    $prompt $hint: " ans || true
  ans="$(lower "${ans:-$def}")"
  [[ "$ans" == y || "$ans" == yes || "$ans" == ha || "$ans" == h ]]
}

# ---- .env bilan ishlash (sed emas, awk+ENVIRON: qiymatdagi / & \ | belgilari buzmasligi uchun)
env_get() {
  [[ -f .env ]] || return 0
  awk -v k="$1" 'index($0,k"=")==1{print substr($0,length(k)+2); exit}' .env
}
env_set() {
  KEY="$1" VAL="$2" awk 'BEGIN{k=ENVIRON["KEY"];v=ENVIRON["VAL"];d=0}
    index($0,k"=")==1{print k"="v;d=1;next} {print} END{if(!d)print k"="v}' .env > .env.tmp
  mv .env.tmp .env; chmod 600 .env
}
is_placeholder() { local v="${1:-}"; [[ -z "$v" || "$v" == change-me* || "$v" == *ORG* ]]; }
rand_hex() { od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'; }

OS="$(uname -s)"
case "$OS" in Linux) PLATFORM=linux ;; Darwin) PLATFORM=mac ;; *) die "Bu skript faqat Linux/macOS uchun. Windows: scripts/install.ps1" ;; esac

SUDO=""
need_sudo() {
  (( CONFIG_ONLY )) && return 0
  if [[ $EUID -ne 0 ]]; then
    command -v sudo >/dev/null 2>&1 || die "root huquqi kerak: skriptni 'sudo' bilan ishga tushiring (sudo topilmadi)."
    SUDO="sudo"
    info "Tizim sozlamalari uchun administrator parolingiz so'raladi (bir marta)."
    sudo -v || die "sudo ruxsati olinmadi."
    # sudo vaqti tugamasligi uchun skript tugaguncha yangilab turamiz
    ( while true; do sudo -n true 2>/dev/null || exit; sleep 50; kill -0 "$$" 2>/dev/null || exit; done ) &
  fi
}

PKG=""
detect_pkg() {
  if command -v apt-get >/dev/null 2>&1; then PKG=apt
  elif command -v dnf >/dev/null 2>&1; then PKG=dnf
  elif command -v yum >/dev/null 2>&1; then PKG=yum
  elif command -v pacman >/dev/null 2>&1; then PKG=pacman
  elif command -v zypper >/dev/null 2>&1; then PKG=zypper
  fi
}
pkg_install() { # pkg_install nom...
  case "$PKG" in
    apt) $SUDO env DEBIAN_FRONTEND=noninteractive apt-get update -qq && $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" ;;
    dnf) $SUDO dnf install -y "$@" ;;
    yum) $SUDO yum install -y "$@" ;;
    pacman) $SUDO pacman -Sy --noconfirm "$@" ;;
    zypper) $SUDO zypper --non-interactive install "$@" ;;
    *) die "Paket menejeri topilmadi - '$*' ni qo'lda o'rnating." ;;
  esac
}

# docker buyruqlarini to'g'ri huquq bilan ishga tushiruvchi o'ram
DOCKER_MODE=direct
dk() {
  case "$DOCKER_MODE" in
    direct) docker "$@" ;;
    sg)     sg docker -c "cd $(printf '%q' "$PWD") && docker $(printf '%q ' "$@")" ;;
    sudo)   sudo docker "$@" ;;
  esac
}
dc() { dk compose -f "$COMPOSE_FILE" "$@"; }
pick_docker_mode() {
  if docker info >/dev/null 2>&1; then DOCKER_MODE=direct
  elif [[ $PLATFORM == linux ]] && getent group docker 2>/dev/null | grep -qw "${USER:-$(id -un)}" && sg docker -c "docker info" >/dev/null 2>&1; then DOCKER_MODE=sg
  elif sudo docker info >/dev/null 2>&1; then DOCKER_MODE=sudo
  else return 1; fi
}

# ============================================================== 0. tekshiruv
step "0/6 Tekshiruv"
[[ -f "$COMPOSE_FILE" && -f .env.example ]] || die "$COMPOSE_FILE / .env.example topilmadi - skript local_server/scripts/ ichidan, to'liq loyiha papkasi bilan ishga tushirilishi kerak."
[[ -d ../website ]] || warn "../website papkasi yo'q - compose'dagi 'website' servisi (QR-menyu) build bo'lmaydi. To'liq loyiha papkasidan ishga tushiring."
os_pretty() {
  if [[ $PLATFORM == mac ]]; then echo "macOS $(sw_vers -productVersion 2>/dev/null)"
  else ( . /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-Linux}" ) || echo Linux; fi
}
ok "tizim: $(os_pretty), arxitektura: $(uname -m)"
detect_pkg
if (( ! CONFIG_ONLY )); then
  free_kb="$(df -Pk . | awk 'NR==2{print $4}')"
  if [[ -n "$free_kb" ]] && (( free_kb < 5*1024*1024 )); then warn "Bo'sh joy 5 GB dan kam ($((free_kb/1024)) MB) - Docker image'lar uchun kam bo'lishi mumkin."; fi
  if (command -v lsof >/dev/null 2>&1 && lsof -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1) && ! docker ps --format '{{.Ports}}' 2>/dev/null | grep -q '8000->'; then
    warn "8000-port band (boshqa dastur). Bola shu portni ishlatadi - band qilgan dasturni to'xtating."
  fi
fi

# ============================================================== 1. savollar
step "1/6 Savollar (hammasi shu yerda, keyin o'zi davom etadi)"
EXISTING_ENV=0; [[ -f .env ]] && EXISTING_ENV=1
(( EXISTING_ENV )) && info "Mavjud .env topildi - undagi qiymatlar default sifatida olinadi, sirlar o'zgarmaydi."

# --- image manbai
POS_MODE="${POS_MODE:-}"
if (( FORCE_BUILD )); then POS_MODE=build; fi
ask POS_MODE "Image qayerdan olinsin? pull = ghcr'dan tortish (tez, tavsiya), build = shu yerda manba koddan qurish" "pull"
[[ "$POS_MODE" == pull || "$POS_MODE" == build ]] || die "POS_MODE 'pull' yoki 'build' bo'lishi kerak."

derive_image() {
  local url owner
  url="$(git -C "$LOCAL_SERVER_DIR/.." remote get-url origin 2>/dev/null || true)"
  owner="$(printf '%s' "$url" | sed -nE 's#.*[:/]([A-Za-z0-9_.-]+)/[A-Za-z0-9_.-]+(\.git)?$#\1#p')"
  [[ -n "$owner" ]] && printf 'ghcr.io/%s/pos-local' "$(lower "$owner")"
}
IMG_DEF="$(env_get POS_IMAGE)"
if is_placeholder "$IMG_DEF"; then IMG_DEF="$(derive_image || true)"; fi
ask POS_IMAGE "Image manzili" "$IMG_DEF"
[[ -n "$POS_IMAGE" ]] || die "Image manzili kerak (masalan ghcr.io/<owner>/pos-local)."
POS_IMAGE="$(lower "$POS_IMAGE")"
CHANNEL="$(env_get RELEASE_CHANNEL)"; CHANNEL="${CHANNEL:-stable}"

# --- ghcr kirishi (private image)
HAVE_AUTH=0
[[ -f .registry-auth.json ]] && grep -q 'ghcr.io' .registry-auth.json 2>/dev/null && HAVE_AUTH=1
if [[ "$POS_MODE" == pull && ( -z "${POS_GHCR_TOKEN:-}" ) ]]; then
  if (( HAVE_AUTH )); then
    info "Saqlangan ghcr.io kirish ma'lumoti bor - qayta so'ralmaydi."
  else
    info "Image PRIVATE bo'lsa GitHub kirishi kerak (token: read:packages huquqi). Image ochiq bo'lsa - bo'sh qoldiring."
    ask POS_GHCR_USER "GitHub foydalanuvchi nomi" ""
    if [[ -n "${POS_GHCR_USER:-}" ]]; then ask_secret POS_GHCR_TOKEN "GitHub token (kiritganda ko'rinmaydi)"; fi
  fi
fi
POS_GHCR_USER="${POS_GHCR_USER:-}"; POS_GHCR_TOKEN="${POS_GHCR_TOKEN:-}"

# --- litsenziya
# (litsenziya kaliti sir emas - QR/xabar orqali beriladi - shuning uchun ko'rinib turadi, xato kiritishni oson topish uchun)
ask POS_LICENSE_KEY "Litsenziya kaliti (XXXX-XXXX-XXXX; bo'sh = keyin ilovadan faollashtiraman)" ""
POS_LICENSE_KEY="$(printf '%s' "$POS_LICENSE_KEY" | tr -d '[:space:]')"
if [[ -n "$POS_LICENSE_KEY" && ! "$POS_LICENSE_KEY" =~ ^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$ && ! "$POS_LICENSE_KEY" =~ ^[A-Fa-f0-9]{40}$ ]]; then
  warn "Kalit formati odatiy emas (XXXX-XXXX-XXXX kutilgandi) - baribir urinib ko'riladi."
fi

# --- Ona manzili
ONA_DEF="$(env_get ONA_SERVER_URL)"; ONA_DEF="${ONA_DEF:-$DEFAULT_ONA_URL}"
ask POS_ONA_URL "Ona (markaziy server) manzili" "$ONA_DEF"
POS_ONA_URL="${POS_ONA_URL%/}"
[[ "$POS_ONA_URL" == https://* ]] || die "Ona manzili https:// bilan boshlanishi shart (aks holda server ishga tushmaydi)."

# --- tashqi kirish
DOM_DEF="$(env_get CSRF_TRUSTED_ORIGINS)"; DOM_DEF="${DOM_DEF#https://}"; [[ "$DOM_DEF" == *tizimingiz.uz* ]] && DOM_DEF=""
ask POS_PUBLIC_DOMAIN "Tashqaridan kirish domeni (Cloudflare Public Hostname, masalan filial1.hamrohpos.uz; bo'sh = faqat restoran ichida)" "$DOM_DEF"
POS_PUBLIC_DOMAIN="$(printf '%s' "$POS_PUBLIC_DOMAIN" | sed -E 's#^https?://##; s#/.*$##')"
CF_DEF="$(env_get CLOUDFLARE_TUNNEL_TOKEN)"
if is_placeholder "$CF_DEF" && [[ -z "${POS_CF_TOKEN:-}" ]]; then
  ask_secret POS_CF_TOKEN "Cloudflare Tunnel tokeni (bo'sh = tunnel yoqilmaydi)"
fi
POS_CF_TOKEN="${POS_CF_TOKEN:-}"

# --- litsenziya ommaviy kaliti
POS_PUBLIC_KEY_FILE="${POS_PUBLIC_KEY_FILE:-}"
if [[ ! -s keys/license_public.pem ]]; then
  info "keys/license_public.pem topilmadi (Ona'dagi 'generate_signing_keys' chiqargan PUBLIC kalit)."
  ask POS_PUBLIC_KEY_FILE "Kalit fayli yo'li (bo'sh = matnni shu yerga yopishtiraman)" ""
  if [[ -z "$POS_PUBLIC_KEY_FILE" ]] && (( ! YES )); then
    info "PEM matnini yopishtiring (-----BEGIN PUBLIC KEY----- dan -----END PUBLIC KEY----- gacha), tugagach Enter:"
    PEM=""
    while IFS= read -r line; do
      PEM+="$line"$'\n'
      [[ "$line" == *"END PUBLIC KEY"* ]] && break
    done
    mkdir -p keys; printf '%s' "$PEM" > keys/license_public.pem
  elif [[ -n "$POS_PUBLIC_KEY_FILE" ]]; then
    [[ -f "$POS_PUBLIC_KEY_FILE" ]] || die "Kalit fayli topilmadi: $POS_PUBLIC_KEY_FILE"
    mkdir -p keys; cp "$POS_PUBLIC_KEY_FILE" keys/license_public.pem
  fi
fi
grep -q "BEGIN PUBLIC KEY" keys/license_public.pem 2>/dev/null || die "keys/license_public.pem yo'q yoki noto'g'ri (BEGIN PUBLIC KEY topilmadi). Kalitsiz litsenziya tekshirilmaydi."
if command -v openssl >/dev/null 2>&1 && ! openssl pkey -pubin -in keys/license_public.pem -noout >/dev/null 2>&1; then
  die "keys/license_public.pem ochiq kalit sifatida o'qilmadi - matn to'liq/to'g'ri nusxalanganini tekshiring."
fi
ok "litsenziya ommaviy kaliti joyida"

# --- tizim sozlamalari
DO_MDNS=0; DO_SLEEP=0; DO_PRINTER=0
if (( ! CONFIG_ONLY )); then
  confirm "Tarmoqda avtomatik topilish (mDNS: ilovalar IP so'ramasdan serverni topadi) yoqilsinmi?" y && DO_MDNS=1
  confirm "Kompyuter uxlab qolmasligi/qopqoq yopilganda o'chmasligi sozlansinmi? (server uchun juda muhim)" y && DO_SLEEP=1
  [[ $PLATFORM == linux ]] && confirm "Termoprinter uchun zavod subnet'lari (192.168.123.x va h.k.) qo'shilsinmi?" n && DO_PRINTER=1
fi

echo
info "${B}Xulosa:${N} rejim=$POS_MODE, image=$POS_IMAGE:$CHANNEL, Ona=$POS_ONA_URL"
info "litsenziya=$([[ -n $POS_LICENSE_KEY ]] && echo kiritildi || echo 'keyin')  tashqi domen=${POS_PUBLIC_DOMAIN:-yoq}  tunnel=$([[ -n $POS_CF_TOKEN ]] && echo bor || echo yoq)  mDNS=$DO_MDNS  uxlamaslik=$DO_SLEEP"
confirm "Davom etamizmi?" y || die "Bekor qilindi."
need_sudo   # parolni shu yerda, bir marta so'raymiz (keyingi uzoq qadamlar o'rtasida emas)

# ============================================================== 2. konfiguratsiya
step "2/6 Konfiguratsiya (.env, fayllar)"
mkdir -p backups
# Watchtower'ga beriladigan registry auth fayli: HAR DOIM mavjud bo'lishi shart (yo'q bo'lsa Docker uni
# PAPKA qilib yaratib yuboradi va Watchtower buziladi). Papka bo'lib qolgan bo'lsa tuzatamiz.
[[ -d .registry-auth.json ]] && rmdir .registry-auth.json 2>/dev/null || true
if [[ -n "$POS_GHCR_USER" && -n "$POS_GHCR_TOKEN" ]]; then
  AUTH_B64="$(printf '%s:%s' "$POS_GHCR_USER" "$POS_GHCR_TOKEN" | base64 | tr -d '\n')"
  ( umask 077; printf '{"auths":{"ghcr.io":{"auth":"%s"}}}\n' "$AUTH_B64" > .registry-auth.json )
  ok ".registry-auth.json yozildi (Watchtower avto-yangilanishlari uchun)"
elif [[ ! -f .registry-auth.json ]]; then
  ( umask 077; printf '{}\n' > .registry-auth.json )
fi

[[ -f .env ]] || { cp .env.example .env; chmod 600 .env; }
for k in SECRET_KEY DB_PASSWORD WATCHTOWER_TOKEN; do
  if is_placeholder "$(env_get "$k")"; then
    case "$k" in SECRET_KEY) env_set "$k" "$(rand_hex 32)" ;; *) env_set "$k" "$(rand_hex 16)" ;; esac
  fi
done
env_set DEBUG 0
env_set ONA_SERVER_URL "$POS_ONA_URL"
env_set POS_IMAGE "$POS_IMAGE"
env_set RELEASE_CHANNEL "$CHANNEL"
env_set LICENSE_ENFORCEMENT 1
env_set REGISTRY_AUTH_FILE ./.registry-auth.json
if [[ -n "$POS_PUBLIC_DOMAIN" ]]; then env_set CSRF_TRUSTED_ORIGINS "https://$POS_PUBLIC_DOMAIN"; else env_set CSRF_TRUSTED_ORIGINS ""; fi
[[ -n "$POS_CF_TOKEN" ]] && env_set CLOUDFLARE_TUNNEL_TOKEN "$POS_CF_TOKEN"

# Qurilma barmoq izi. Bir marta belgilangach O'ZGARTIRILMAYDI (litsenziya shu izga bog'lanadi).
# Docker Desktop (macOS) konteynerida barqaror ID yo'q; Linux'da ham ba'zi mini-PC'larda
# DMI product_uuid bo'sh bo'ladi - shunda host'ning o'zidan barqaror ID olamiz.
if [[ -z "$(env_get HARDWARE_ID_OVERRIDE)" ]]; then
  HWID=""
  if [[ $PLATFORM == mac ]]; then
    HWID="$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk -F'"' '/IOPlatformUUID/{print $4}')"
  elif (( ! CONFIG_ONLY )); then   # product_uuid'ni o'qish uchun root kerak - --config-only'da keyingi to'liq ishga qoldiramiz
    PU="$($SUDO cat /sys/class/dmi/id/product_uuid 2>/dev/null || true)"
    if [[ -z "$PU" || "$PU" =~ ^[0-]+$ ]]; then HWID="$(cat /etc/machine-id 2>/dev/null || true)"; fi
  fi
  if [[ -n "$HWID" ]]; then env_set HARDWARE_ID_OVERRIDE "$HWID"; ok "qurilma izi host'dan olindi (.env: HARDWARE_ID_OVERRIDE)"; fi
fi
ok ".env tayyor (sirlar tasodifiy yaratildi/saqlandi)"
if (( ! EXISTING_ENV )) && [[ "$PLATFORM" == linux || "$PLATFORM" == mac ]] && command -v docker >/dev/null 2>&1 \
   && docker volume ls -q 2>/dev/null | grep -q 'postgres_data$'; then
  warn "Docker'da eski 'postgres_data' hajmi bor: yangi DB paroli eskisiga mos kelmasligi mumkin (db konteyner 'unhealthy' bo'lsa shu sabab)."
fi

if (( CONFIG_ONLY )); then
  step "Tayyor (--config-only)"
  ok ".env va fayllar tayyorlandi. Serverni ko'tarish uchun skriptni parametrsiz qayta ishga tushiring."
  exit 0
fi

# ============================================================== 3. tizim dasturlari
step "3/6 Tizim dasturlari va ruxsatlar"

if [[ $PLATFORM == linux ]]; then
  for c in curl; do command -v $c >/dev/null 2>&1 || { info "$c o'rnatilmoqda..."; pkg_install curl ca-certificates; }; done
  have_compose() { docker compose version >/dev/null 2>&1 || $SUDO docker compose version >/dev/null 2>&1; }
  if ! command -v docker >/dev/null 2>&1 || ! have_compose; then
    info "Docker o'rnatilmoqda (bir necha daqiqa)..."
    case "$PKG" in
      apt|dnf|yum)
        tmp="$(mktemp)"; curl -fsSL https://get.docker.com -o "$tmp"; $SUDO sh "$tmp"; rm -f "$tmp" ;;
      pacman) pkg_install docker docker-compose ;;
      zypper) pkg_install docker docker-compose ;;
      *) die "Docker'ni avtomatik o'rnatib bo'lmadi (noma'lum distributiv). https://docs.docker.com/engine/install/ bo'yicha o'rnating va qayta ishga tushiring." ;;
    esac
  fi
  ok "Docker bor"
  $SUDO systemctl enable --now docker >/dev/null 2>&1 || warn "docker servisini systemctl bilan yoqib bo'lmadi (qo'lda tekshiring)."
  # Ruxsat: joriy foydalanuvchi docker guruhida bo'lsin (sudo'siz docker). Guruh yangi sessiyada kuchga kiradi,
  # shuning uchun shu skript davomida 'sg docker' orqali ishlaymiz.
  if [[ $EUID -ne 0 ]] && ! id -nG | tr ' ' '\n' | grep -qx docker; then
    $SUDO usermod -aG docker "$(id -un)" && ok "'$(id -un)' docker guruhiga qo'shildi (tizimga qayta kirgach sudo'siz ishlaydi)"
  fi
  # Firewall
  if command -v ufw >/dev/null 2>&1 && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
    $SUDO ufw allow 8000/tcp >/dev/null && $SUDO ufw allow 5353/udp >/dev/null && ok "ufw: 8000/tcp va 5353/udp ochildi"
  elif command -v firewall-cmd >/dev/null 2>&1 && $SUDO systemctl is-active --quiet firewalld; then
    $SUDO firewall-cmd --permanent --add-port=8000/tcp >/dev/null && $SUDO firewall-cmd --permanent --add-service=mdns >/dev/null && $SUDO firewall-cmd --reload >/dev/null && ok "firewalld: 8000/tcp va mDNS ochildi"
  else info "faol firewall topilmadi - port ochish shart emas."; fi
  # Uxlamaslik
  if (( DO_SLEEP )); then
    $SUDO systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1 || true
    $SUDO mkdir -p /etc/systemd/logind.conf.d
    printf '[Login]\nHandleLidSwitch=ignore\nHandleLidSwitchExternalPower=ignore\nHandleLidSwitchDocked=ignore\nIdleAction=ignore\n' | $SUDO tee /etc/systemd/logind.conf.d/pos-bola.conf >/dev/null
    $SUDO systemctl kill -s HUP systemd-logind >/dev/null 2>&1 || true   # restart emas: grafik sessiyani uzmaydi
    ok "uxlash/qopqoq yopilganda to'xtash o'chirildi"
  fi
  (( DO_MDNS )) && { $SUDO bash "$SCRIPT_DIR/setup_avahi.sh" >/dev/null && ok "mDNS (avahi) yoqildi: $(hostname).local" || warn "avahi sozlanmadi (ilovalar baribir /24 skaner orqali topadi)."; }
  (( DO_PRINTER )) && { $SUDO bash "$SCRIPT_DIR/setup_printer_subnets.sh" >/dev/null && ok "printer subnet aliaslari qo'shildi (qayta yoqilganda saqlanmaydi, docs 7-bo'lim)" || warn "printer subnet'lari qo'shilmadi."; }
else
  # ---- macOS
  if ! command -v docker >/dev/null 2>&1; then
    command -v brew >/dev/null 2>&1 || die "Docker Desktop kerak. Homebrew yo'q: https://www.docker.com/products/docker-desktop dan o'rnating va skriptni qayta ishga tushiring."
    info "Docker Desktop o'rnatilmoqda (brew)..."
    brew install --cask docker
  fi
  if ! docker info >/dev/null 2>&1; then
    info "Docker Desktop ishga tushirilmoqda... Birinchi ochilishda litsenziya shartlarini qabul qilish va parol so'ralishi mumkin - OYNADAN tasdiqlang."
    open -a Docker || true
    for _ in $(seq 1 150); do docker info >/dev/null 2>&1 && break; sleep 2; done
    docker info >/dev/null 2>&1 || die "Docker 5 daqiqada ishga tushmadi. Docker Desktop oynasini tekshirib, skriptni qayta ishga tushiring."
  fi
  ok "Docker Desktop ishlayapti"
  if (( DO_SLEEP )); then
    sudo pmset -a sleep 0 autorestart 1 >/dev/null 2>&1 && ok "uxlamaslik va tok kelgach avto-yoqilish (pmset) sozlandi" || warn "pmset sozlanmadi."
  fi
  if (( DO_MDNS )); then
    PL="$HOME/Library/LaunchAgents/uz.hamrohpos.bola-mdns.plist"; mkdir -p "$(dirname "$PL")"
    cat > "$PL" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>uz.hamrohpos.bola-mdns</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/dns-sd</string><string>-R</string><string>POS Bola Server</string>
    <string>_pos-bola._tcp</string><string>local</string><string>8000</string>
    <string>path=/api/</string><string>service=pos-bola</string>
  </array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
</dict></plist>
PLIST
    launchctl bootout "gui/$UID" "$PL" >/dev/null 2>&1 || true
    launchctl bootstrap "gui/$UID" "$PL" >/dev/null 2>&1 && ok "mDNS e'loni (launchd) yoqildi" || warn "mDNS e'lonini yoqib bo'lmadi."
  fi
fi
pick_docker_mode || die "Docker'ga ulanib bo'lmadi (docker info xato). Docker ishga tushganini tekshiring."
info "docker rejimi: $DOCKER_MODE"

# ============================================================== 4. image va ko'tarish
step "4/6 Image va servislar"
if [[ "$POS_MODE" == pull && -n "$POS_GHCR_USER" && -n "$POS_GHCR_TOKEN" ]]; then
  printf '%s' "$POS_GHCR_TOKEN" | dk login ghcr.io -u "$POS_GHCR_USER" --password-stdin >/dev/null 2>&1 \
    && ok "ghcr.io ga kirildi" || warn "ghcr.io ga kirib bo'lmadi (token/huquqni tekshiring) - tortish muvaffaqiyatsiz bo'lishi mumkin."
fi
if [[ "$POS_MODE" == pull ]]; then
  info "Image tortilmoqda: $POS_IMAGE:$CHANNEL"
  if ! dk pull "$POS_IMAGE:$CHANNEL"; then
    warn "Tortib bo'lmadi (private image uchun token kerak yoki hali reliz chiqarilmagan)."
    if confirm "Buning o'rniga shu yerda manba koddan qursinmi? (5-10 daqiqa)" y; then POS_MODE=build; else die "Image yo'q - to'xtatildi."; fi
  fi
fi
if [[ "$POS_MODE" == build ]]; then
  info "Image qurilmoqda (Cython kompilyatsiyasi bilan, 5-10 daqiqa)..."
  dk build -t "$POS_IMAGE:$CHANNEL" .
fi
SCALE=()
if is_placeholder "$(env_get CLOUDFLARE_TUNNEL_TOKEN)"; then
  info "Cloudflare tokeni yo'q - 'cloudflared' ishga tushirilmaydi (qayta ishga tushganda yig'ilib crash-loop bo'lmasligi uchun)."
  SCALE=(--scale cloudflared=0)
fi
info "Servislar ko'tarilmoqda (birinchi marta QR-menyu saytini ham quradi - bir necha daqiqa)..."
dc up -d ${SCALE[@]+"${SCALE[@]}"}

# ============================================================== 5. kutish va litsenziya
step "5/6 Server tayyor bo'lishini kutish"
READY=0
for _ in $(seq 1 90); do
  if curl -fsS -m 3 http://127.0.0.1:8000/api/discovery/ >/dev/null 2>&1; then READY=1; break; fi
  sleep 2
done
if (( ! READY )); then
  warn "3 daqiqada javob bermadi. Oxirgi loglar:"; dc logs --tail 40 web || true
  die "Server ko'tarilmadi. Yuqoridagi loglarni ko'ring (eng ko'p sabab: DB paroli eski hajm bilan mos emas, yoki image topilmadi)."
fi
ok "server javob berdi: http://127.0.0.1:8000/api/discovery/"

step "6/6 Litsenziya va tarmoq tekshiruvi"
DISC="$(curl -fsS -m 5 http://127.0.0.1:8000/api/discovery/ 2>/dev/null || true)"
ACTIVATED=0; printf '%s' "$DISC" | grep -Eq '"activated": *true' && ACTIVATED=1
if (( ACTIVATED )); then
  ok "litsenziya allaqachon faol - qayta faollashtirilmaydi."
elif [[ -n "$POS_LICENSE_KEY" ]]; then
  info "Litsenziya faollashtirilmoqda (Ona'ga ulanadi)..."
  if dc exec -T web python manage.py activate_license "$POS_LICENSE_KEY"; then ACTIVATED=1; ok "faollashtirildi"
  else warn "Faollashtirib bo'lmadi (kalit xato, internet yo'q yoki Ona javob bermadi). Keyin qo'lda: docker compose -f $COMPOSE_FILE exec web python manage.py activate_license <KALIT>"; fi
else
  info "Kalit kiritilmadi - faollashtirishni ilova orqali (yoki 'activate_license' bilan) qiling."
fi

# LAN orqali ham javob berishini tekshirish (telefonlar shu yo'l bilan ulanadi). Bu yerda xato bo'lsa -
# odatda ALLOWED_HOSTS: image'da config/hosts.py (PrivateLANHost) yo'q, ya'ni eskirgan reliz.
LAN_IP=""
if [[ $PLATFORM == mac ]]; then LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
else LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; fi
if [[ -n "$LAN_IP" ]]; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://$LAN_IP:8000/api/discovery/" || true)"
  if [[ "$CODE" == 200 ]]; then ok "LAN orqali ham ishlayapti: http://$LAN_IP:8000"
  elif [[ "$CODE" == 400 ]]; then
    warn "LAN manzildan (http://$LAN_IP:8000) 400 keldi - Django ALLOWED_HOSTS rad etyapti: image eskirgan (yangi reliz chiqarilmagan)."
    warn "Tuzatish: 'cut-local-server-release' bilan yangi versiya chiqaring, yoki vaqtincha .env: ALLOWED_HOSTS=localhost,127.0.0.1,$LAN_IP va 'docker compose -f $COMPOSE_FILE restart web'."
  else warn "LAN manzilga ($LAN_IP:8000) ulanib bo'lmadi (HTTP: ${CODE:-javob yoq}) - firewall/tarmoqni tekshiring."; fi
fi

echo
printf '%s==================== TAYYOR ====================%s\n' "$G" "$N"
dc ps --format 'table {{.Service}}\t{{.Status}}' 2>/dev/null || true
echo
echo "  Telefon/kassa ilovalari ulanadigan manzil : http://${LAN_IP:-<IP>}:8000   (yoki http://$(hostname).local:8000)"
echo "  Litsenziya                                  : $([[ $ACTIVATED == 1 ]] && echo faol || echo 'FAOLLASHTIRILMAGAN')"
echo "  Menejer akkaunti                            : litsenziya faollashganda Ona o'zi yaratadi (telefon + parol)"
[[ -n "$POS_PUBLIC_DOMAIN" ]] && echo "  Tashqi domen                                : https://$POS_PUBLIC_DOMAIN  (Cloudflare Zero Trust'da ingress qo'shing: web -> http://web:8000, QR-menyu -> http://website:80)"
[[ "$DOCKER_MODE" == sg ]] && echo "  Eslatma: docker guruhi yangi — buyruqlarni sudo'siz ishlatish uchun tizimga qayta kiring."
echo "  Muhim: BIOS'da 'Restore on AC Power Loss = Power On' qo'ying - tok o'chib-yonganda kompyuter o'zi yoqiladi."
echo "  Log: $LOG_FILE"
echo
