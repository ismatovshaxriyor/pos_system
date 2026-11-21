# ==============================================================================
# Termal printerlarga yetib borish uchun vaqtincha IP alias (Windows PowerShell)
#
# Muammo: ko'p termal printer zavodda 192.168.123.100 (Xprinter) yoki 192.168.0.x kabi
# BOSHQA subnet'da turadi. Kompyuter 192.168.1.x da bo'lsa, unga yetib bo'lmaydi.
# Bu skript asosiy tarmoq adapteriga qo'shimcha manzil (alias) qo'shib, printerga
# yetishga yordam beradi, shunda uning IP'sini restoran tarmog'iga o'tkaza olasiz.
#
# DOIMIY YECHIM: printerning o'z IP'sini restoran subnet'iga (masalan 192.168.1.200,
# DHCP oralig'idan tashqarida) o'tkazing, keyin alias kerak bo'lmaydi.
#
# Ishga tushirish (Administrator PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\setup_printer_subnets.ps1
#   powershell -ExecutionPolicy Bypass -File .\setup_printer_subnets.ps1 -Remove   # aliaslarni olib tashlash
#
# Eslatma: alias "ActiveStore"da turadi, ya'ni kompyuter qayta ishga tushsa yoki tarmoq
# uzilib qayta ulansa yo'qoladi (DHCP'li adapterda xavfsiz shu). Kerak bo'lsa qayta ishga tushiring.
# ==============================================================================
param(
    [string[]]$AliasIPs = @("192.168.123.250", "192.168.0.250"),
    [int]$PrefixLength = 24,
    [switch]$Remove
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "XATO: PowerShell'ni Administrator sifatida oching va qayta ishga tushiring." -ForegroundColor Red
    exit 1
}

# Asosiy adapter: ishlayapti, virtual EMAS, standart shlyuzi (gateway) bor.
# Docker/WSL/Hyper-V/VPN virtual adapterlariga tegmaymiz.
$cfg = Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' -and -not $_.NetAdapter.Virtual -and $_.NetAdapter.InterfaceDescription -notmatch 'Hyper-V|vEthernet|WSL|VirtualBox|VMware|Loopback|TAP|VPN|Bluetooth' } |
    Select-Object -First 1

if (-not $cfg) {
    Write-Host "XATO: internetga ulangan asosiy tarmoq adapteri topilmadi (Wi-Fi yoki Ethernet ulanganmi?)." -ForegroundColor Red
    exit 1
}

$idx = $cfg.InterfaceIndex
$name = $cfg.InterfaceAlias
$lanIPs = @($cfg.IPv4Address.IPAddress)
Write-Host "Asosiy adapter: '$name' (hozirgi IP: $($lanIPs -join ', '))" -ForegroundColor Cyan

function Get-Net24([string]$ip) { ($ip -split '\.')[0..2] -join '.' }

$failed = 0
foreach ($alias in $AliasIPs) {
    if ($Remove) {
        $ex = Get-NetIPAddress -InterfaceIndex $idx -IPAddress $alias -ErrorAction SilentlyContinue
        if ($ex) {
            Remove-NetIPAddress -InterfaceIndex $idx -IPAddress $alias -Confirm:$false -ErrorAction SilentlyContinue
            Write-Host "Olib tashlandi: $alias" -ForegroundColor Yellow
        }
        continue
    }

    if ($lanIPs | Where-Object { (Get-Net24 $_) -eq (Get-Net24 $alias) }) {
        Write-Host "O'tkazib yuborildi: $alias (kompyuter allaqachon shu subnet'da, alias kerak emas)" -ForegroundColor Yellow
        continue
    }
    if (Get-NetIPAddress -InterfaceIndex $idx -IPAddress $alias -ErrorAction SilentlyContinue) {
        Write-Host "Allaqachon bor: $alias" -ForegroundColor Yellow
        continue
    }

    try {
        New-NetIPAddress -InterfaceIndex $idx -IPAddress $alias -PrefixLength $PrefixLength -PolicyStore ActiveStore -SkipAsSource $true -ErrorAction Stop | Out-Null
        Write-Host "Qo'shildi: $alias" -ForegroundColor Green
    } catch {
        $failed++
        Write-Host "XATO ($alias): $($_.Exception.Message)" -ForegroundColor Red
    }
}

if ($Remove) { Write-Host "Tayyor." -ForegroundColor Green; exit 0 }

Write-Host "------------------------------------------------------------------"
Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 | Select-Object IPAddress, PrefixLength, PolicyStore | Format-Table -AutoSize
if ($failed -gt 0) {
    Write-Host "$failed ta alias qo'shilmadi (yuqoridagi xatoga qarang)." -ForegroundColor Red
    exit 1
}
Write-Host "Endi printerga yetib borishni tekshiring, masalan:  Test-NetConnection 192.168.123.100 -Port 9100" -ForegroundColor White
