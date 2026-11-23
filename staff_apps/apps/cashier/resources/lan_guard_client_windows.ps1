<#
.SYNOPSIS
  Mijoz kompyuter (kassa noutbuki va h.k.) uchun LAN qo'riqchi.

.DESCRIPTION
  Rohat, 2026-11-22: repeater (MAC-NAT) rejimidagi TP-Link kuchaytirgich boshqa qurilmalar nomidan ARP
  javob beradi. Natijada:
    - Windows DHCP manzilni "band" deb rad etadi -> 169.254.x.x ("IP-adres uje ispolzuetsya");
    - router yoki server (Bola) trafigi kuchaytirgichning MAC'iga ketib, yo'qoladi.
  Bu skript:
    1) fizik adapterlarda DadTransmits=0 qiladi (manzil "bandmi" tekshiruvi o'chadi);
    2) router (shlyuz) va server yozuvida lokal boshqariladigan MAC (kuchaytirgich) paydo bo'lsa, haqiqiy
       MAC javob berguncha qayta so'raydi va uni xotirada qotiradi (store=active: qayta yonganda o'chadi;
       tarmoq/SSID almashsa yoki 3 marta javob bo'lmasa olinadi). Server manzili o'zi aniqlanadi: shu
       kompyuterdan 8000-portga ochilgan (yoki ochilayotgan) TCP ulanishlar - kassa ilovasi Bola'ga shu
       port orqali ulanadi. -Watch bilan qo'shimcha manzil berish mumkin;
    3) router qotirilgan bo'lsa, har 60 s broadcast ARP yuboradi - router bizning yozuvimizni tuzatadi.
  Sog'lom tarmoqda hech narsani qotirmaydi. Noutbuk boshqa tarmoqqa (uy, hotspot) o'tsa o'zi tozalanadi.
  Server (Bola) uchun emas: u yerda advertise_mdns_windows.ps1 shu ishni qiladi - "POS Bola mDNS"
  vazifasi bor kompyuterda bu skript o'rnatilmaydi va ishlamaydi.
  Kassa o'rnatuvchisi (build/installer.nsh) uni interaktiv o'rnatishda UAC so'rovi bilan o'rnatadi.

  Administrator PowerShell'da:
    powershell -ExecutionPolicy Bypass -File lan_guard_client_windows.ps1 -Install
    ... -Status      holat va jurnal
    ... -Uninstall   olib tashlash
#>
param(
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$Status,
    [string[]]$Watch = @()
)

$ErrorActionPreference = 'Continue'
$Dir = Join-Path $env:ProgramData 'PosGuard'
$InstalledScript = Join-Path $Dir 'lan_guard.ps1'
$LogFile = Join-Path $Dir 'guard.log'
$TaskName = 'POS LAN guard'
$BolaTaskName = 'POS Bola mDNS'
$Watch =@($Watch | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

function Write-Log([string]$msg) {
    try {
        if (-not (Test-Path $Dir)) { New-Item -ItemType Directory -Force -Path $Dir | Out-Null }
        if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 1MB) { Move-Item $LogFile "$LogFile.1" -Force }
        Add-Content -Path $LogFile -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $msg)
    } catch {}
}

function Test-Admin {
    $p = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-BolaHost {
    return [bool](Get-ScheduledTask -TaskName $BolaTaskName -ErrorAction SilentlyContinue)
}

# Kassa ilovasi Bola'ga 8000-port orqali ulanadi. SynSent - aynan kuchaytirgich trafikni yutayotgan holat.
function Get-ServerCandidates {
    Get-NetTCPConnection -RemotePort 8000 -ErrorAction SilentlyContinue |
        Where-Object { $_.State -in @('Established', 'SynSent') -and $_.RemoteAddress -match '^(10\.\d{1,3}|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}$' } |
        Select-Object -ExpandProperty RemoteAddress -Unique
}

function Disable-Dad {
    Get-NetAdapter -Physical -ErrorAction SilentlyContinue | ForEach-Object {
        foreach ($store in 'PersistentStore', 'ActiveStore') {
            Set-NetIPInterface -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -DadTransmits 0 -PolicyStore $store -ErrorAction SilentlyContinue
        }
    }
}

# ---------------------------------------------------------------- ARP yordamchilari
$script:Ping = [System.Net.NetworkInformation.Ping]::new()
$script:G = $null

function Test-LocalMac([string]$mac) {
    if (-not $mac -or $mac -match '^(00-){5}00$|^(FF-){5}FF$') { return $false }
    return (([Convert]::ToInt32($mac.Substring(0, 2), 16) -band 2) -ne 0)
}

function Get-NeighborMac([int]$idx, [string]$ip) {
    $n = Get-NetNeighbor -InterfaceIndex $idx -IPAddress $ip -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($n -and $n.State -notin @('Unreachable', 'Incomplete')) { return $n.LinkLayerAddress }
    return $null
}

function Test-Ping([string]$ip) {
    try { return ($script:Ping.Send($ip, 1000).Status -eq 'Success') } catch { return $false }
}

function Find-RealMac([int]$idx, [string]$ip) {
    for ($i = 0; $i -lt 6; $i++) {
        Remove-NetNeighbor -InterfaceIndex $idx -IPAddress $ip -Confirm:$false -ErrorAction SilentlyContinue
        try { [void]$script:Ping.Send($ip, 1000) } catch {}
        Start-Sleep -Milliseconds 300
        $m = Get-NeighborMac $idx $ip
        if ($m -and -not (Test-LocalMac $m)) { return $m }
    }
    return $null
}

function Set-Pin([string]$ip, [string]$mac, [string]$kind) {
    $out = & netsh interface ipv4 set neighbors interface=$($script:G.Idx) address=$ip neighbor=$($mac.ToLower()) store=active 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Log "$ip ni qotirib bo'lmadi: $out"; return }
    $script:G.Pins[$ip] = @{ Mac = $mac; Kind = $kind; Fails = 0 }
}

function Remove-Pin([string]$ip) {
    Remove-NetNeighbor -InterfaceIndex $script:G.Idx -IPAddress $ip -Confirm:$false -ErrorAction SilentlyContinue
    $script:G.Pins.Remove($ip)
}

function Clear-Guard {
    if ($script:G) { foreach ($ip in @($script:G.Pins.Keys)) { Remove-Pin $ip } }
    $script:G = $null
}

function Invoke-Step {
    $route = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
        Where-Object { $_.NextHop -and $_.NextHop -ne '0.0.0.0' } | Sort-Object RouteMetric | Select-Object -First 1
    if (-not $route) { if ($script:G) { Write-Log "tarmoq yo'q - qotirishlar olindi"; Clear-Guard }; return }
    $idx = [int]$route.ifIndex
    $gw = $route.NextHop
    $net = (Get-NetConnectionProfile -InterfaceIndex $idx -ErrorAction SilentlyContinue | Select-Object -First 1).Name
    $key = "$idx|$gw|$net"
    if (-not $script:G -or $script:G.Key -ne $key) {
        Clear-Guard
        $script:G = @{ Key = $key; Idx = $idx; Gw = $gw; Pins = @{}; Tried = @{}; Servers = @{}; Announce = [datetime]::MinValue }
        Disable-Dad
        Write-Log "tarmoq: '$net' (adapter $idx, router $gw)"
    }
    $g = $script:G

    # 1) Qotirilganlar sog'mi: 3 marta ketma-ket javob bo'lmasa qotirish olinadi.
    foreach ($ip in @($g.Pins.Keys)) {
        $p = $g.Pins[$ip]
        if (Test-Ping $ip) { $p.Fails = 0; continue }
        $p.Fails++
        if ($p.Fails -ge 3) { Remove-Pin $ip; Write-Log "$ip ($($p.Kind)) javob bermayapti - qotirish olindi" }
    }

    # 2) Router va server yozuvlarida kuchaytirgich MAC'i yo'qmi.
    #    Bir marta ko'rilgan server shu tarmoqda eslab qolinadi (ilova yopiq paytda ham kuzatiladi).
    foreach ($ip in @($Watch) + @(Get-ServerCandidates)) {
        if ($ip -and $ip -ne $gw -and -not $g.Servers.ContainsKey($ip)) {
            $g.Servers[$ip] = $true
            Write-Log "server kuzatuvga olindi: $ip"
        }
    }
    $now = Get-Date
    $targets = @(@{ Ip = $gw; Kind = 'router' }) + @($g.Servers.Keys | ForEach-Object { @{ Ip = $_; Kind = 'server' } })
    foreach ($t in $targets) {
        $ip = $t.Ip
        if ($g.Pins.ContainsKey($ip)) { continue }
        $mac = Get-NeighborMac $idx $ip
        if (-not $mac -or -not (Test-LocalMac $mac)) { continue }
        if ($g.Tried.ContainsKey($ip) -and $now -lt $g.Tried[$ip].Next) { continue }
        $real = Find-RealMac $idx $ip
        if ($real) {
            $g.Tried.Remove($ip)
            Set-Pin $ip $real $t.Kind
            Write-Log "$($t.Kind) $ip nomidan $mac javob berayotgan edi (kuchaytirgich?) - haqiqiy MAC $real qotirildi"
        } else {
            # Qurilmaning haqiqiy MAC'i ham lokal bo'lishi mumkin (mesh tizim, telefon hotspot, tasodifiy MAC'li
            # Wi-Fi). Bunday tarmoqda ARP yozuvini tez-tez o'chirmaslik uchun kutish 2 -> 4 -> 8 -> 10 daqiqa.
            $wait = 2
            if ($g.Tried.ContainsKey($ip)) { $wait = [Math]::Min($g.Tried[$ip].Wait * 2, 10) }
            else { Write-Log "$($t.Kind) $ip MAC'i $mac lokal, boshqasi topilmadi - qurilma o'zi shunday bo'lishi mumkin, tegilmaydi" }
            $g.Tried[$ip] = @{ Next = $now.AddMinutes($wait); Wait = $wait }
        }
    }

    # 3) Router qotirilgan bo'lsa Windows unga ARP so'rov yubormaydi: router bizning yozuvimizni
    #    tuzatishi uchun har 60 s keshda yo'q manzilga broadcast ARP so'rov yuboramiz.
    if ($g.Pins.ContainsKey($gw) -and ($now - $g.Announce).TotalSeconds -ge 60) {
        $g.Announce = $now
        $mine = (Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
        if ($mine) {
            $base = ($mine -split '\.')[0..2] -join '.'
            foreach ($o in 250, 249, 248, 3, 4) {
                $c = "$base.$o"
                if ($c -eq $mine -or $g.Pins.ContainsKey($c)) { continue }
                Remove-NetNeighbor -InterfaceIndex $idx -IPAddress $c -Confirm:$false -ErrorAction SilentlyContinue
                try { [void]$script:Ping.Send($c, 300) } catch {}
                break
            }
        }
    }
}

# ---------------------------------------------------------------- buyruqlar
if ($Status) {
    $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($t) { Write-Host "Vazifa '$TaskName': $($t.State)" } else { Write-Host "Vazifa o'rnatilmagan." -ForegroundColor Yellow }
    Get-NetAdapter -Physical -ErrorAction SilentlyContinue | ForEach-Object {
        $i = Get-NetIPInterface -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
        Write-Host ("  {0}: {1}, DadTransmits={2}" -f $_.Name, $_.Status, $i.DadTransmits)
    }
    $pins = Get-NetNeighbor -AddressFamily IPv4 -State Permanent -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notmatch '^(22[4-9]|23\d|255)\.' -and $_.LinkLayerAddress -notmatch '^(00-){5}00$|^(FF-){5}FF$' }
    if ($pins) { Write-Host "Qotirilgan:"; $pins | ForEach-Object { Write-Host "  $($_.IPAddress) -> $($_.LinkLayerAddress)" } }
    else { Write-Host "Qotirilgan yozuv yo'q (sog'lom tarmoqda shunday bo'lishi kerak)." }
    if (Test-Path $LogFile) { Write-Host "--- jurnal:"; Get-Content $LogFile -Tail 15 }
    exit 0
}

if ($Uninstall) {
    if (-not (Test-Admin)) { Write-Host "Administrator sifatida ishga tushiring." -ForegroundColor Red; exit 1 }
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    Get-NetAdapter -Physical -ErrorAction SilentlyContinue | ForEach-Object {
        foreach ($store in 'PersistentStore', 'ActiveStore') {
            Set-NetIPInterface -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -DadTransmits 1 -PolicyStore $store -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Olib tashlandi. Qotirilgan yozuvlar kompyuter qayta yonganda o'chadi." -ForegroundColor Green
    exit 0
}

if ($Install) {
    if (-not (Test-Admin)) { Write-Host "Administrator sifatida ishga tushiring (oyna sarlavhasida 'Administrator' bo'lishi kerak)." -ForegroundColor Red; exit 1 }
    if (Test-BolaHost) { Write-Host "Bu kompyuter Bola server: '$BolaTaskName' qo'riqchisi shu ishni qiladi, o'rnatilmadi." -ForegroundColor Yellow; exit 0 }
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    if ($PSCommandPath -ne $InstalledScript) { Copy-Item -Path $PSCommandPath -Destination $InstalledScript -Force }
    Disable-Dad
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $taskArgs = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScript`""
    if ($Watch.Count -gt 0) { $taskArgs += " -Watch " + ($Watch -join ',') }
    $action = New-ScheduledTaskAction -Execute $ps -Argument $taskArgs
    $trigger = New-ScheduledTaskTrigger -AtStartup
    # -RepetitionDuration berilmasa Windows 10+ cheksiz takrorlaydi. IgnoreNew + mutex: bitta nusxa.
    $watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($trigger, $watchdog) -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "O'rnatildi: '$TaskName' (SYSTEM, har yoqilganda). DadTransmits=0 qo'yildi." -ForegroundColor Green
    Write-Host "Holat: powershell -ExecutionPolicy Bypass -File `"$InstalledScript`" -Status"
    exit 0
}

# ---------------------------------------------------------------- doimiy ish (vazifa ichida)
$created = $false
try { $mutex = [System.Threading.Mutex]::new($true, 'Global\PosLanGuardClient', [ref]$created) } catch { $created = $false }
if (-not $created) { exit 0 }
if (Test-BolaHost) { Write-Log "Bola server qo'riqchisi topildi - bu skript to'xtadi"; exit 0 }
Write-Log "ishga tushdi (kuzatiladi: router + kassa ulanadigan server$(if ($Watch.Count) { ', ' + ($Watch -join ', ') }))"
while ($true) {
    try { Invoke-Step } catch { Write-Log "xato: $_" }
    Start-Sleep -Seconds 15
}
