# ==============================================================================
# Bola (local_server) ni yangi restoran kompyuteriga (Windows 10/11) BIR BUYRUQ bilan o'rnatish.
# Linux/macOS uchun: scripts/install.sh  (ikkalasi bir xil savollar va bir xil natija beradi)
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
#   ... -Yes          savol bermaydi (javoblar POS_* env'dan yoki default)
#   ... -Build        image'ni ghcr'dan tortmay, shu yerda manba koddan quradi
#   ... -ConfigOnly   faqat .env/kalit/fayllarni tayyorlaydi (Docker va tizimga TEGMAYDI)
#
# Nima qiladi: savollar (bir marta) -> WSL2/Docker Desktop o'rnatish -> firewall, uxlamaslik
# sozlamalari -> .env -> docker compose -> tayyor bo'lguncha kutish -> litsenziyani faollashtirish.
#
# Kompyuterni QAYTA YOQISH talab qilinsa (WSL2 birinchi marta yoqilganda) skript to'xtaydi:
# qayta yoqilgach xuddi shu buyruqni yana ishga tushiring - .env dagi javoblar saqlangan,
# qayta ishga tushirish xavfsiz (sirlar va qurilma izi o'zgarmaydi).
#
# Savollarga avtomatik javob (env): POS_MODE=pull|build, POS_IMAGE, POS_GHCR_USER, POS_GHCR_TOKEN,
#   POS_LICENSE_KEY, POS_ONA_URL, POS_PUBLIC_DOMAIN, POS_CF_TOKEN, POS_PUBLIC_KEY_FILE
# (Administrator oynasi qayta ochilganda env o'zgaruvchilari o'tmasligi mumkin - shunda savollar so'raladi.)
# ==============================================================================
param(
    [switch]$Yes,
    [switch]$ConfigOnly,
    [switch]$Build,
    [switch]$Elevated
)
$ErrorActionPreference = 'Stop'

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# --- Administrator huquqi (UAC so'rovi bir marta)
if (-not $ConfigOnly -and -not (Test-Admin)) {
    Write-Host "Administrator huquqi kerak - UAC so'rovini tasdiqlang..." -ForegroundColor Yellow
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Elevated')
    if ($Yes) { $a += '-Yes' }
    if ($Build) { $a += '-Build' }
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $a -WorkingDirectory (Get-Location).Path
    exit 0
}

$ScriptDir = Split-Path -Parent $PSCommandPath
$LocalServerDir = (Resolve-Path (Join-Path $ScriptDir '..')).Path
Set-Location $LocalServerDir
$ComposeFile = 'docker-compose.prod.yml'
$LogFile = Join-Path $LocalServerDir 'install.log'
$DefaultOnaUrl = 'https://hamrohpos.uz'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Log($m) { try { Add-Content -Path $LogFile -Value ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) } catch {} }
function Step($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan; Write-Log "STEP $m" }
function Info($m) { Write-Host "    $m"; Write-Log $m }
function Ok($m)   { Write-Host "    + $m" -ForegroundColor Green; Write-Log "OK $m" }
function Warn($m) { Write-Host "    ! $m" -ForegroundColor Yellow; Write-Log "WARN $m" }
function Fail($m) {
    Write-Host ""; Write-Host "XATO: $m" -ForegroundColor Red; Write-Log "DIE $m"
    if ($Elevated) { Read-Host "Oynani yopish uchun Enter bosing" | Out-Null }
    exit 1
}

# ---- savol berish yordamchilari (env'da javob bor bo'lsa so'ramaydi)
function Get-EnvVar($name) { return [Environment]::GetEnvironmentVariable($name) }
function Ask($envName, $prompt, $default) {
    $cur = Get-EnvVar $envName
    if ($cur) { return $cur }
    if ($Yes) { return $default }
    if ($default) { $v = Read-Host "    $prompt [$default]"; if (-not $v) { $v = $default }; return $v }
    return (Read-Host "    $prompt")
}
function Ask-Secret($envName, $prompt) {
    $cur = Get-EnvVar $envName
    if ($cur) { return $cur }
    if ($Yes) { return '' }
    $s = Read-Host "    $prompt" -AsSecureString
    $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($p) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}
function Confirm-Yes($prompt, $defaultYes) {
    if ($Yes) { return $defaultYes }
    $hint = '[Y/n]'; if (-not $defaultYes) { $hint = '[y/N]' }
    $a = (Read-Host "    $prompt $hint").Trim().ToLower()
    if (-not $a) { return $defaultYes }
    return ($a -eq 'y' -or $a -eq 'yes' -or $a -eq 'ha' -or $a -eq 'h')
}

# ---- .env bilan ishlash (LF va BOM'siz yoziladi - Docker env_file uchun)
function Is-Placeholder($v) { return ([string]::IsNullOrEmpty($v) -or $v.StartsWith('change-me') -or $v.Contains('ORG')) }
function Env-Get($key) {
    if (-not (Test-Path '.env')) { return '' }
    foreach ($l in [IO.File]::ReadAllLines((Join-Path $LocalServerDir '.env'))) {
        if ($l.StartsWith("$key=")) { return $l.Substring($key.Length + 1) }
    }
    return ''
}
function Env-Set($key, $value) {
    $path = Join-Path $LocalServerDir '.env'
    $lines = New-Object System.Collections.Generic.List[string]
    $done = $false
    foreach ($l in [IO.File]::ReadAllLines($path)) {
        if ($l.StartsWith("$key=")) { $lines.Add("$key=$value"); $done = $true } else { $lines.Add($l) }
    }
    if (-not $done) { $lines.Add("$key=$value") }
    [IO.File]::WriteAllText($path, (($lines -join "`n") + "`n"), $Utf8NoBom)
}
function Rand-Hex($bytes) {
    $b = New-Object byte[] $bytes
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($b); $rng.Dispose()
    return (($b | ForEach-Object { $_.ToString('x2') }) -join '')
}

# ---- native buyruqlar (stderr'ni xato deb hisoblamaydi, chiqish kodiga qaraydi)
function Native-Ok([scriptblock]$sb) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { & $sb *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false } finally { $ErrorActionPreference = $old }
}
function Run-Native([scriptblock]$sb, $what) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { & $sb } finally { $ErrorActionPreference = $old }
    if ($LASTEXITCODE -ne 0) { throw "$what muvaffaqiyatsiz (chiqish kodi $LASTEXITCODE)" }
}
function Native-Out([scriptblock]$sb) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { return (& $sb 2>$null) } catch { return '' } finally { $ErrorActionPreference = $old }
}
function Dc { $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { & docker compose -f $ComposeFile @args } finally { $ErrorActionPreference = $old } }

# ============================================================== 0. tekshiruv
Step '0/6 Tekshiruv'
if (-not (Test-Path $ComposeFile) -or -not (Test-Path '.env.example')) {
    Fail "$ComposeFile / .env.example topilmadi - skript local_server\scripts\ ichidan, to'liq loyiha papkasi bilan ishga tushirilishi kerak."
}
if (-not (Test-Path (Join-Path $LocalServerDir '..\website'))) { Warn "..\website papkasi yo'q - compose'dagi 'website' servisi (QR-menyu) build bo'lmaydi. To'liq loyiha papkasidan ishga tushiring." }
$os = Get-CimInstance Win32_OperatingSystem
Ok "tizim: $($os.Caption) (build $($os.BuildNumber)), arxitektura: $($env:PROCESSOR_ARCHITECTURE)"
if (-not $ConfigOnly) {
    if ([int]$os.BuildNumber -lt 19041) { Fail "Docker Desktop (WSL2) uchun Windows 10 2004 (build 19041) yoki yangiroq kerak. Windows'ni yangilang." }
    $free = (Get-PSDrive -Name ($LocalServerDir.Substring(0, 1))).Free
    if ($free -lt 5GB) { Warn "Bo'sh joy 5 GB dan kam ($([int]($free / 1MB)) MB) - Docker image'lar uchun kam bo'lishi mumkin." }
}

# ============================================================== 1. savollar
Step "1/6 Savollar (hammasi shu yerda, keyin o'zi davom etadi)"
$existingEnv = Test-Path '.env'
if ($existingEnv) { Info "Mavjud .env topildi - undagi qiymatlar default sifatida olinadi, sirlar o'zgarmaydi." }

$mode = Get-EnvVar 'POS_MODE'
if ($Build) { $mode = 'build' }
if (-not $mode) { $mode = Ask 'POS_MODE' "Image qayerdan olinsin? pull = ghcr'dan tortish (tez, tavsiya), build = shu yerda manba koddan qurish" 'pull' }
if ($mode -ne 'pull' -and $mode -ne 'build') { Fail "POS_MODE 'pull' yoki 'build' bo'lishi kerak." }

function Derive-Image {
    try {
        $url = (& git -C (Join-Path $LocalServerDir '..') remote get-url origin 2>$null)
        if ($url -match '[:/]([A-Za-z0-9_.-]+)/[A-Za-z0-9_.-]+?(\.git)?$') { return "ghcr.io/$($Matches[1].ToLower())/pos-local" }
    } catch {}
    return ''
}
$imgDef = Env-Get 'POS_IMAGE'
if (Is-Placeholder $imgDef) { $imgDef = Derive-Image }
$image = (Ask 'POS_IMAGE' 'Image manzili' $imgDef)
if (-not $image) { Fail 'Image manzili kerak (masalan ghcr.io/<owner>/pos-local).' }
$image = $image.ToLower()
$channel = Env-Get 'RELEASE_CHANNEL'; if (-not $channel) { $channel = 'stable' }
$imageRef = "${image}:${channel}"

$ghUser = ''; $ghToken = ''
$haveAuth = (Test-Path '.registry-auth.json') -and ((Get-Content '.registry-auth.json' -Raw) -match 'ghcr\.io')
if ($mode -eq 'pull') {
    if ((Get-EnvVar 'POS_GHCR_TOKEN')) { $ghUser = Get-EnvVar 'POS_GHCR_USER'; $ghToken = Get-EnvVar 'POS_GHCR_TOKEN' }
    elseif ($haveAuth) { Info "Saqlangan ghcr.io kirish ma'lumoti bor - qayta so'ralmaydi." }
    else {
        Info "Image PRIVATE bo'lsa GitHub kirishi kerak (token: read:packages huquqi). Image ochiq bo'lsa - bo'sh qoldiring."
        $ghUser = Ask 'POS_GHCR_USER' 'GitHub foydalanuvchi nomi' ''
        if ($ghUser) { $ghToken = Ask-Secret 'POS_GHCR_TOKEN' "GitHub token (kiritganda ko'rinmaydi)" }
    }
}

$licenseKey = (Ask 'POS_LICENSE_KEY' "Litsenziya kaliti (XXXX-XXXX-XXXX; bo'sh = keyin ilovadan faollashtiraman)" '') -replace '\s', ''
if ($licenseKey -and $licenseKey -notmatch '^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$' -and $licenseKey -notmatch '^[A-Fa-f0-9]{40}$') {
    Warn "Kalit formati odatiy emas (XXXX-XXXX-XXXX kutilgandi) - baribir urinib ko'riladi."
}

$onaDef = Env-Get 'ONA_SERVER_URL'; if (-not $onaDef) { $onaDef = $DefaultOnaUrl }
$onaUrl = (Ask 'POS_ONA_URL' 'Ona (markaziy server) manzili' $onaDef).TrimEnd('/')
if (-not $onaUrl.StartsWith('https://')) { Fail "Ona manzili https:// bilan boshlanishi shart (aks holda server ishga tushmaydi)." }

$domDef = (Env-Get 'CSRF_TRUSTED_ORIGINS') -replace '^https://', ''
if ($domDef -like '*tizimingiz.uz*') { $domDef = '' }
$domain = Ask 'POS_PUBLIC_DOMAIN' "Tashqaridan kirish domeni (Cloudflare Public Hostname, masalan filial1.hamrohpos.uz; bo'sh = faqat restoran ichida)" $domDef
$domain = ($domain -replace '^https?://', '') -replace '/.*$', ''

$cfToken = ''
if (Is-Placeholder (Env-Get 'CLOUDFLARE_TUNNEL_TOKEN')) { $cfToken = Ask-Secret 'POS_CF_TOKEN' "Cloudflare Tunnel tokeni (bo'sh = tunnel yoqilmaydi)" }

# --- litsenziya ommaviy kaliti
$keyPath = Join-Path $LocalServerDir 'keys\license_public.pem'
if (-not (Test-Path $keyPath) -or (Get-Item $keyPath).Length -eq 0) {
    Info "keys\license_public.pem topilmadi (Ona'dagi 'generate_signing_keys' chiqargan PUBLIC kalit)."
    $src = Ask 'POS_PUBLIC_KEY_FILE' "Kalit fayli yo'li (bo'sh = matnni shu yerga yopishtiraman)" ''
    New-Item -ItemType Directory -Force -Path (Join-Path $LocalServerDir 'keys') | Out-Null
    if ($src) {
        if (-not (Test-Path $src)) { Fail "Kalit fayli topilmadi: $src" }
        Copy-Item $src $keyPath -Force
    } elseif (-not $Yes) {
        Info "PEM matnini yopishtiring (-----BEGIN PUBLIC KEY----- dan -----END PUBLIC KEY----- gacha), tugagach Enter:"
        $pem = New-Object System.Collections.Generic.List[string]
        while ($true) { $l = Read-Host; $pem.Add($l); if ($l -like '*END PUBLIC KEY*') { break } }
        [IO.File]::WriteAllText($keyPath, (($pem -join "`n") + "`n"), $Utf8NoBom)
    }
}
if (-not (Test-Path $keyPath) -or -not ((Get-Content $keyPath -Raw) -match 'BEGIN PUBLIC KEY')) {
    Fail "keys\license_public.pem yo'q yoki noto'g'ri (BEGIN PUBLIC KEY topilmadi). Kalitsiz litsenziya tekshirilmaydi."
}
Ok 'litsenziya ommaviy kaliti joyida'

$doMdns = $false; $doSleep = $false
if (-not $ConfigOnly) {
    $doMdns = Confirm-Yes "Firewall'da server portlari (8000, mDNS 5353) ochilsinmi?" $true
    $doSleep = Confirm-Yes "Kompyuter uxlab qolmasligi/qopqoq yopilganda o'chmasligi sozlansinmi? (server uchun juda muhim)" $true
}
Write-Host ""
$tunnelTxt = 'yoq'; if ($cfToken) { $tunnelTxt = 'bor' }
$licTxt = 'keyin'; if ($licenseKey) { $licTxt = 'kiritildi' }
$domTxt = 'yoq'; if ($domain) { $domTxt = $domain }
Info "Xulosa: rejim=$mode, image=$imageRef, Ona=$onaUrl"
Info "litsenziya=$licTxt  tashqi domen=$domTxt  tunnel=$tunnelTxt  firewall=$doMdns  uxlamaslik=$doSleep"
if (-not (Confirm-Yes 'Davom etamizmi?' $true)) { Fail 'Bekor qilindi.' }

# ============================================================== 2. konfiguratsiya
Step '2/6 Konfiguratsiya (.env, fayllar)'
New-Item -ItemType Directory -Force -Path (Join-Path $LocalServerDir 'backups') | Out-Null
$authPath = Join-Path $LocalServerDir '.registry-auth.json'
# Watchtower uchun registry auth fayli HAR DOIM fayl sifatida mavjud bo'lsin (yo'q bo'lsa Docker papka qilib yaratadi)
if (Test-Path $authPath -PathType Container) { Remove-Item $authPath -Force -ErrorAction SilentlyContinue }
if ($ghUser -and $ghToken) {
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${ghUser}:${ghToken}"))
    [IO.File]::WriteAllText($authPath, "{`"auths`":{`"ghcr.io`":{`"auth`":`"$b64`"}}}`n", $Utf8NoBom)
    Ok ".registry-auth.json yozildi (Watchtower avto-yangilanishlari uchun)"
} elseif (-not (Test-Path $authPath)) {
    [IO.File]::WriteAllText($authPath, "{}`n", $Utf8NoBom)
}

if (-not (Test-Path '.env')) { [IO.File]::WriteAllText((Join-Path $LocalServerDir '.env'), ([IO.File]::ReadAllText((Join-Path $LocalServerDir '.env.example')) -replace "`r`n", "`n"), $Utf8NoBom) }
foreach ($k in @('SECRET_KEY', 'DB_PASSWORD', 'WATCHTOWER_TOKEN')) {
    if (Is-Placeholder (Env-Get $k)) {
        $len = 16; if ($k -eq 'SECRET_KEY') { $len = 32 }
        Env-Set $k (Rand-Hex $len)
    }
}
Env-Set 'DEBUG' '0'
Env-Set 'ONA_SERVER_URL' $onaUrl
Env-Set 'POS_IMAGE' $image
Env-Set 'RELEASE_CHANNEL' $channel
Env-Set 'LICENSE_ENFORCEMENT' '1'
Env-Set 'REGISTRY_AUTH_FILE' './.registry-auth.json'
if ($domain) { Env-Set 'CSRF_TRUSTED_ORIGINS' "https://$domain" } else { Env-Set 'CSRF_TRUSTED_ORIGINS' '' }
if ($cfToken) { Env-Set 'CLOUDFLARE_TUNNEL_TOKEN' $cfToken }

# Qurilma barmoq izi: Docker Desktop konteynerida barqaror ID yo'q, shuning uchun host'ning
# anakart UUID'sidan olinadi. Bir marta belgilangach O'ZGARTIRILMAYDI (litsenziya shu izga bog'lanadi).
if (-not (Env-Get 'HARDWARE_ID_OVERRIDE')) {
    $hw = ''
    try { $hw = (Get-CimInstance Win32_ComputerSystemProduct).UUID } catch {}
    if ($hw -and $hw -notmatch '^[0F-]+$') { Env-Set 'HARDWARE_ID_OVERRIDE' $hw; Ok "qurilma izi host'dan olindi (.env: HARDWARE_ID_OVERRIDE)" }
    else { Warn "Anakart UUID'si topilmadi/yaroqsiz - HARDWARE_ID_OVERRIDE ni qo'lda belgilang (litsenziya barqaror ID'siz buziladi)." }
}
Ok '.env tayyor (sirlar tasodifiy yaratildi/saqlandi)'

if ($ConfigOnly) {
    Step 'Tayyor (-ConfigOnly)'
    Ok ".env va fayllar tayyorlandi. Serverni ko'tarish uchun skriptni parametrsiz qayta ishga tushiring."
    exit 0
}

# ============================================================== 3. tizim dasturlari
Step '3/6 Tizim dasturlari va ruxsatlar'
try {
    # --- virtualizatsiya (BIOS'da o'chiq bo'lsa Docker ishlamaydi)
    $cs = Get-CimInstance Win32_ComputerSystem
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    if (-not $cs.HypervisorPresent -and -not $cpu.VirtualizationFirmwareEnabled) {
        Fail "Virtualizatsiya BIOS'da o'chiq (Intel VT-x / AMD SVM). Kompyuterni qayta yoqib BIOS'da 'Virtualization'ni Enable qiling, so'ng skriptni qayta ishga tushiring."
    }

    # --- WSL2 funksiyalari
    $needReboot = $false
    foreach ($f in @('Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform')) {
        $st = (Get-WindowsOptionalFeature -Online -FeatureName $f).State
        if ($st -ne 'Enabled') {
            Info "Windows funksiyasi yoqilmoqda: $f"
            $r = Enable-WindowsOptionalFeature -Online -FeatureName $f -NoRestart
            if ($r.RestartNeeded) { $needReboot = $true }
        }
    }
    if ($needReboot) {
        Warn "WSL2 funksiyalari yoqildi - kompyuterni QAYTA YOQISH kerak."
        Warn "Qayta yoqilgach shu buyruqni yana ishga tushiring: powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1  (javoblar .env da saqlandi)"
        if ($Elevated) { Read-Host "Chiqish uchun Enter bosing" | Out-Null }
        exit 0
    }

    # --- Docker Desktop
    $dockerBin = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin'
    if (-not (Get-Command docker -ErrorAction SilentlyContinue) -and (Test-Path $dockerBin)) { $env:Path = "$env:Path;$dockerBin" }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
            Fail "winget topilmadi. Docker Desktop'ni https://www.docker.com/products/docker-desktop dan qo'lda o'rnating va skriptni qayta ishga tushiring (Windows'da 'App Installer'ni Microsoft Store'dan yangilash winget'ni beradi)."
        }
        Info "Docker Desktop o'rnatilmoqda (bir necha daqiqa)..."
        & winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements --silent
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) { Fail "Docker Desktop o'rnatilmadi (winget chiqish kodi $LASTEXITCODE)." }
        if ($LASTEXITCODE -eq 3010) {
            Warn "Docker o'rnatildi, lekin kompyuterni QAYTA YOQISH kerak. Qayta yoqilgach skriptni yana ishga tushiring."
            if ($Elevated) { Read-Host "Chiqish uchun Enter bosing" | Out-Null }
            exit 0
        }
        if (Test-Path $dockerBin) { $env:Path = "$env:Path;$dockerBin" }
    }
    Ok "Docker Desktop o'rnatilgan"

    if (-not (Native-Ok { docker info })) {
        Info "Docker Desktop ishga tushirilmoqda... Birinchi ochilishda litsenziya shartlarini qabul qilish oynasi chiqishi mumkin - OYNADAN 'Accept' bosing."
        $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
        if (Test-Path $exe) { Start-Process $exe }
        $up = $false
        for ($i = 0; $i -lt 150; $i++) { if (Native-Ok { docker info }) { $up = $true; break }; Start-Sleep -Seconds 2 }
        if (-not $up) { Fail "Docker 5 daqiqada ishga tushmadi. Docker Desktop oynasini tekshirib (shartlarni qabul qiling), skriptni qayta ishga tushiring." }
    }
    $osType = "$(Native-Out { docker info --format '{{.OSType}}' })".Trim()
    if ($osType -ne 'linux') { Fail "Docker Windows-konteyner rejimida. Docker Desktop tray belgisi -> 'Switch to Linux containers' ni tanlab, qayta ishga tushiring." }
    Ok 'Docker Desktop ishlayapti (Linux konteynerlar)'

    # --- firewall
    if ($doMdns) {
        foreach ($r in @(@{ N = 'POS Bola Server (HTTP 8000)'; P = 'TCP'; Port = 8000 }, @{ N = 'POS Bola mDNS (UDP 5353)'; P = 'UDP'; Port = 5353 })) {
            if (-not (Get-NetFirewallRule -DisplayName $r.N -ErrorAction SilentlyContinue)) {
                New-NetFirewallRule -DisplayName $r.N -Direction Inbound -Protocol $r.P -LocalPort $r.Port -Action Allow -Profile Any | Out-Null
            }
        }
        Ok "Windows Firewall: 8000/tcp va 5353/udp ochildi (Windows'da hostname.local ni tizimning o'zi e'lon qiladi; ilovalar topa olmasa /24 skaner zaxira)"
    }
    # --- uxlamaslik
    if ($doSleep) {
        & powercfg /change standby-timeout-ac 0 | Out-Null
        & powercfg /change standby-timeout-dc 0 | Out-Null
        & powercfg /change hibernate-timeout-ac 0 | Out-Null
        & powercfg /hibernate off | Out-Null
        & powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 | Out-Null
        & powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 | Out-Null
        & powercfg /setactive SCHEME_CURRENT | Out-Null
        Ok "uxlash, hibernatsiya va qopqoq yopilganda to'xtash o'chirildi"
    }

    # ============================================================== 4. image va ko'tarish
    Step '4/6 Image va servislar'
    if ($mode -eq 'pull' -and $ghUser -and $ghToken) {
        if (Native-Ok { $ghToken | docker login ghcr.io -u $ghUser --password-stdin }) { Ok 'ghcr.io ga kirildi' } else { Warn "ghcr.io ga kirib bo'lmadi (token/huquqni tekshiring) - tortish muvaffaqiyatsiz bo'lishi mumkin." }
    }
    if ($mode -eq 'pull') {
        Info "Image tortilmoqda: $imageRef"
        $pulled = $true
        try { Run-Native { docker pull $imageRef } 'docker pull' } catch { $pulled = $false }
        if (-not $pulled) {
            Warn "Tortib bo'lmadi (private image uchun token kerak yoki hali reliz chiqarilmagan)."
            if (Confirm-Yes "Buning o'rniga shu yerda manba koddan qursinmi? (5-10 daqiqa)" $true) { $mode = 'build' } else { Fail "Image yo'q - to'xtatildi." }
        }
    }
    if ($mode -eq 'build') {
        Info "Image qurilmoqda (Cython kompilyatsiyasi bilan, 5-10 daqiqa)..."
        Run-Native { docker build -t $imageRef . } 'docker build'
    }
    $scale = @()
    if (Is-Placeholder (Env-Get 'CLOUDFLARE_TUNNEL_TOKEN')) {
        Info "Cloudflare tokeni yo'q - 'cloudflared' ishga tushirilmaydi (crash-loop bo'lmasligi uchun)."
        $scale = @('--scale', 'cloudflared=0')
    }
    Info "Servislar ko'tarilmoqda (birinchi marta QR-menyu saytini ham quradi - bir necha daqiqa)..."
    Dc up -d @scale
    if ($LASTEXITCODE -ne 0) { throw 'docker compose up muvaffaqiyatsiz' }

    # ============================================================== 5. kutish
    Step "5/6 Server tayyor bo'lishini kutish"
    $ready = $false
    for ($i = 0; $i -lt 90; $i++) {
        try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://127.0.0.1:8000/api/discovery/'; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch {}
        Start-Sleep -Seconds 2
    }
    if (-not $ready) {
        Warn '3 daqiqada javob bermadi. Oxirgi loglar:'
        Dc logs --tail 40 web
        Fail "Server ko'tarilmadi. Yuqoridagi loglarni ko'ring (eng ko'p sabab: DB paroli eski hajm bilan mos emas, yoki image topilmadi)."
    }
    Ok 'server javob berdi: http://127.0.0.1:8000/api/discovery/'

    # ============================================================== 6. litsenziya va tarmoq
    Step '6/6 Litsenziya va tarmoq tekshiruvi'
    $activated = $false
    try { $disc = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:8000/api/discovery/').Content; if ($disc -match '"activated"\s*:\s*true') { $activated = $true } } catch {}
    if ($activated) { Ok "litsenziya allaqachon faol - qayta faollashtirilmaydi." }
    elseif ($licenseKey) {
        Info "Litsenziya faollashtirilmoqda (Ona'ga ulanadi)..."
        Dc exec -T web python manage.py activate_license $licenseKey
        if ($LASTEXITCODE -eq 0) { $activated = $true; Ok 'faollashtirildi' }
        else { Warn "Faollashtirib bo'lmadi (kalit xato, internet yo'q yoki Ona javob bermadi). Keyin qo'lda: docker compose -f $ComposeFile exec web python manage.py activate_license <KALIT>" }
    } else { Info "Kalit kiritilmadi - faollashtirishni ilova orqali (yoki 'activate_license' bilan) qiling." }

    $lan = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|Loopback|WSL|Docker' -and $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' } |
        Select-Object -First 1 -ExpandProperty IPAddress
    if ($lan) {
        $code = 0
        try { $code = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://${lan}:8000/api/discovery/").StatusCode }
        catch { if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode } }
        if ($code -eq 200) { Ok "LAN orqali ham ishlayapti: http://${lan}:8000" }
        elseif ($code -eq 400) {
            Warn "LAN manzildan (http://${lan}:8000) 400 keldi - Django ALLOWED_HOSTS rad etyapti: image eskirgan (yangi reliz chiqarilmagan)."
            Warn "Tuzatish: 'cut-local-server-release' bilan yangi versiya chiqaring, yoki vaqtincha .env: ALLOWED_HOSTS=localhost,127.0.0.1,$lan va 'docker compose -f $ComposeFile restart web'."
        } else { Warn "LAN manzilga (${lan}:8000) ulanib bo'lmadi (HTTP: $code) - firewall/tarmoqni tekshiring." }
    }

    Write-Host ""
    Write-Host '==================== TAYYOR ====================' -ForegroundColor Green
    Dc ps
    $showIp = '<IP>'; if ($lan) { $showIp = $lan }
    $licShow = 'FAOLLASHTIRILMAGAN'; if ($activated) { $licShow = 'faol' }
    Write-Host ""
    Write-Host "  Telefon/kassa ilovalari ulanadigan manzil : http://${showIp}:8000   (yoki http://$($env:COMPUTERNAME.ToLower()).local:8000)"
    Write-Host "  Litsenziya                                  : $licShow"
    Write-Host "  Menejer akkaunti                            : litsenziya faollashganda Ona o'zi yaratadi (telefon + parol)"
    if ($domain) { Write-Host "  Tashqi domen                                : https://$domain  (Cloudflare Zero Trust'da ingress qo'shing: web -> http://web:8000, QR-menyu -> http://website:80)" }
    Write-Host "  Muhim: Docker Desktop faqat Windows'ga KIRILGANDA ishga tushadi - tok o'chib-yonganda server o'zi ko'tarilishi uchun"
    Write-Host "         avto-kirishni yoqing (Win+R -> netplwiz) va BIOS'da 'Restore on AC Power Loss = Power On' qo'ying."
    Write-Host "  Log: $LogFile"
}
catch {
    Fail $_.Exception.Message
}
if ($Elevated) { Write-Host ""; Read-Host "Chiqish uchun Enter bosing" | Out-Null }
