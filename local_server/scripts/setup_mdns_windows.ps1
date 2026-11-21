# ==============================================================================
# POS Bola - Windows'da avtomatik topilish (mDNS) sozlamasi
#
# 1) Firewall: 8000/tcp (server) va 5353/udp (mDNS) ochiladi.
# 2) mDNS e'loni: _pos-bola._tcp ni har doim serverning HOZIRGI IP'si bilan e'lon qiladigan
#    "POS Bola mDNS" vazifasi o'rnatiladi (advertise_mdns_windows.ps1 -Install).
#    Kompyuter qayta yoqilsa ham, IP o'zgarsa ham ilovalar serverni o'zi topadi.
#
# Ishga tushirish (Administrator PowerShell, local_server papkasida):
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup_mdns_windows.ps1
# ==============================================================================

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "XATO: PowerShell'ni Administrator sifatida oching:" -ForegroundColor Red
    Write-Host "  PowerShell ustida o'ng tugma -> 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\setup_mdns_windows.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "=== POS Bola: firewall va mDNS e'loni ===" -ForegroundColor Cyan
$advertiser = Join-Path $PSScriptRoot 'advertise_mdns_windows.ps1'
if (-not (Test-Path $advertiser)) {
    Write-Host "XATO: $advertiser topilmadi (repo to'liq yuklab olinganmi?)." -ForegroundColor Red
    exit 1
}
& $advertiser -Install
exit $LASTEXITCODE
