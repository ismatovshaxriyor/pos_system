# ==============================================================================
# POS Bola - Windows'da mDNS e'loni (_pos-bola._tcp)
#
# Linux'da bu ishni Avahi (pos-bola.avahi.service), macOS'da `dns-sd -R` qiladi.
# Windows'da esa hech narsa e'lon qilmasdi: firewall ochiq bo'lsa ham, ilovalar
# (ofitsiant/kassir) serverni mDNS orqali topa olmasdi va faqat /24 skanerga tayanardi.
#
# Bu skript Windows 10/11 ning O'Z mDNS xizmatidan (dnsapi.dll -> DnsServiceRegister)
# foydalanadi, shuning uchun Bonjour yoki boshqa dastur o'rnatish shart emas.
#   - e'lon: _pos-bola._tcp, port 8000, TXT: path=/api/, service=pos-bola
#   - manzil: "pos-bola.local" -> serverning HOZIRGI LAN IP'si (ilovalar shu nomni ham sinaydi)
#   - har 15 soniyada IP'ni tekshiradi: o'zgarsa (Wi-Fi <-> kabel, yangi DHCP manzil)
#     e'lonni yangi IP bilan qayta qiladi. IP yo'q bo'lsa (169.254...) kutib turadi.
#   - LAN qo'riqchi (ARP): ba'zi Wi-Fi kuchaytirgichlar (repeater, MAC-NAT) boshqa qurilmalar
#     nomidan ham ARP javob beradi. Natijada server routerni (yoki printerni) kuchaytirgich deb
#     o'ylaydi, trafik havo orqali aylanib o'tadi, internet "bir ulanib bir uzilib" turadi.
#     Shlyuz MAC'i lokal (02 bitli, haqiqiy routerda bo'lmaydi) chiqsa, qo'riqchi qayta so'raydi va
#     haqiqiy MAC'ni faqat xotirada (store=active, reboot'da o'chadi) qotiradi; printer (9100) uchun
#     ham shunday. Qotirilgan qurilma 3 marta javob bermasa (router almashtirilgan) - qotirish olinadi.
#     Har 60 soniyada o'z manzilini ARP so'rov bilan e'lon qiladi (router/telefonlar keshini tuzatadi).
#     Sog' tarmoqda hech narsa qotirilmaydi. Shu sabab IP to'qnashuv tekshiruvi (DAD) ham o'chiriladi.
#
# Ishga tushirish (Administrator PowerShell, local_server papkasida):
#   powershell -ExecutionPolicy Bypass -File .\scripts\advertise_mdns_windows.ps1 -Install    # o'rnatish (avtoyuklanish)
#   powershell -ExecutionPolicy Bypass -File .\scripts\advertise_mdns_windows.ps1 -Status     # holat va oxirgi log
#   powershell -ExecutionPolicy Bypass -File .\scripts\advertise_mdns_windows.ps1 -Uninstall  # olib tashlash
#
# -Install: skriptni C:\ProgramData\PosBola\ ga nusxalaydi va kompyuter yoqilganda
# SYSTEM nomidan ishga tushadigan "POS Bola mDNS" vazifasini (Task Scheduler) yaratadi.
# Parametrsiz ishga tushirilsa - e'lonni shu oynada bajaradi (vazifa aynan shuni chaqiradi).
# ==============================================================================
param(
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$Status,
    [int]$Port = 8000
)

$TaskName = 'POS Bola mDNS'
$DataDir = Join-Path $env:ProgramData 'PosBola'
$InstalledScript = Join-Path $DataDir 'advertise_mdns_windows.ps1'
$LogFile = Join-Path $DataDir 'mdns.log'
$PreferredHost = 'pos-bola.local'
$VirtualPattern = 'Hyper-V|vEthernet|WSL|VirtualBox|VMware|Loopback|TAP|VPN|Bluetooth|Docker'

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Log([string]$msg) {
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Write-Host $line
    try {
        if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
        if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 1MB) {
            Move-Item -Path $LogFile -Destination "$LogFile.old" -Force
        }
        Add-Content -Path $LogFile -Value $line
    } catch {}
}

# --- dnsapi.dll ga kirish. Callback toza C# ichida (PowerShell kodi boshqa oqimdan chaqirilsa jarayon yiqiladi).
# C# 5 sintaksisi: Windows PowerShell 5.1 ning Add-Type kompilyatori undan yangisini bilmaydi.
$csharp = @'
using System;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;

public static class PosBolaMdns
{
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    public delegate void RegisterCompleteFn(uint status, IntPtr context, IntPtr instance);

    [StructLayout(LayoutKind.Sequential)]
    struct RegisterRequest
    {
        public uint Version;
        public uint InterfaceIndex;
        public IntPtr pServiceInstance;
        public IntPtr pRegisterCompletionCallback;
        public IntPtr pQueryContext;
        public IntPtr hCredentials;
        public int unicastEnabled;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr LoadLibrary(string name);

    [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
    static extern IntPtr GetProcAddress(IntPtr module, string proc);

    [DllImport("dnsapi.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr DnsServiceConstructInstance(
        string pServiceName, string pHostName, ref uint pIp4, IntPtr pIp6,
        ushort wPort, ushort wPriority, ushort wWeight, uint dwPropertiesCount,
        [MarshalAs(UnmanagedType.LPArray, ArraySubType = UnmanagedType.LPWStr)] string[] keys,
        [MarshalAs(UnmanagedType.LPArray, ArraySubType = UnmanagedType.LPWStr)] string[] values);

    [DllImport("dnsapi.dll")]
    static extern void DnsServiceFreeInstance(IntPtr pInstance);

    [DllImport("dnsapi.dll")]
    static extern uint DnsServiceRegister(IntPtr pRequest, IntPtr pCancel);

    [DllImport("dnsapi.dll")]
    static extern uint DnsServiceDeRegister(IntPtr pRequest, IntPtr pCancel);

    const uint DNS_REQUEST_PENDING = 9506;
    public const uint ERROR_TIMEOUT = 1460;
    public const uint CONSTRUCT_FAILED = 0xFFFFFFFF;

    // Delegat statik maydonda: GC uni yig'ib yubormasligi kerak (native tomonda ko'rsatkich turadi).
    static readonly RegisterCompleteFn Callback = OnComplete;
    static readonly IntPtr CallbackPtr = Marshal.GetFunctionPointerForDelegate(Callback);
    static readonly AutoResetEvent Done = new AutoResetEvent(false);
    static uint lastStatus;
    static IntPtr request = IntPtr.Zero;
    static IntPtr instance = IntPtr.Zero;

    static void OnComplete(uint status, IntPtr context, IntPtr inst)
    {
        lastStatus = status;
        // Callback'ga kelgan nusxani bo'shatamiz, lekin o'zimiz yaratganini emas (DeRegister unga kerak).
        if (inst != IntPtr.Zero && inst != instance) DnsServiceFreeInstance(inst);
        Done.Set();
    }

    public static bool IsSupported()
    {
        IntPtr h = LoadLibrary("dnsapi.dll");
        return h != IntPtr.Zero && GetProcAddress(h, "DnsServiceRegister") != IntPtr.Zero;
    }

    public static bool IsRegistered { get { return request != IntPtr.Zero; } }

    // 0 = muvaffaqiyat, aks holda Win32/DNS xato kodi.
    public static uint Register(string serviceName, string hostName, string ipv4, ushort port,
                                string[] keys, string[] values, int timeoutMs)
    {
        Unregister(timeoutMs);
        // IP4_ADDRESS - tarmoq tartibidagi DWORD: baytlar xotirada aynan 192,168,1,x tartibida turadi.
        uint ip = BitConverter.ToUInt32(IPAddress.Parse(ipv4).GetAddressBytes(), 0);
        instance = DnsServiceConstructInstance(serviceName, hostName, ref ip, IntPtr.Zero,
                                               port, 0, 0, (uint)keys.Length, keys, values);
        if (instance == IntPtr.Zero) return CONSTRUCT_FAILED;

        RegisterRequest r = new RegisterRequest();
        r.Version = 1;              // DNS_QUERY_REQUEST_VERSION1
        r.InterfaceIndex = 0;       // barcha interfeyslar
        r.pServiceInstance = instance;
        r.pRegisterCompletionCallback = CallbackPtr;
        r.pQueryContext = IntPtr.Zero;
        r.hCredentials = IntPtr.Zero;
        r.unicastEnabled = 0;
        request = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(RegisterRequest)));
        Marshal.StructureToPtr(r, request, false);

        Done.Reset();
        uint rc = DnsServiceRegister(request, IntPtr.Zero);
        if (rc != DNS_REQUEST_PENDING) { Cleanup(); return rc; }
        // Javob kelmasa so'rovni bo'shatmaymiz (kech callback xotiraga murojaat qilishi mumkin);
        // keyingi urinishdagi Unregister uni to'g'ri yopadi.
        if (!Done.WaitOne(timeoutMs)) return ERROR_TIMEOUT;
        if (lastStatus != 0) Cleanup();
        return lastStatus;
    }

    public static void Unregister(int timeoutMs)
    {
        if (request == IntPtr.Zero) return;
        Done.Reset();
        uint rc = DnsServiceDeRegister(request, IntPtr.Zero);
        if (rc == DNS_REQUEST_PENDING) Done.WaitOne(timeoutMs);
        Cleanup();
    }

    static void Cleanup()
    {
        if (instance != IntPtr.Zero) { DnsServiceFreeInstance(instance); instance = IntPtr.Zero; }
        if (request != IntPtr.Zero) { Marshal.FreeHGlobal(request); request = IntPtr.Zero; }
    }
}
'@

function Import-MdnsApi {
    # -IgnoreWarnings: Windows PowerShell 5.1 kompilyator ogohlantirishlarini xato deb hisoblaydi.
    if (-not ('PosBolaMdns' -as [type])) { Add-Type -TypeDefinition $csharp -Language CSharp -IgnoreWarnings }
}

# Restoran tarmog'idagi asosiy IP: standart shlyuzi bor, ishlayotgan, virtual bo'lmagan adapter.
# Bir nechtasi bo'lsa (kabel + Wi-Fi) - Windows internetga chiqish uchun tanlaydigani (eng kichik metrika).
function Get-LanIPv4 {
    $routes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue)
    $ranked = foreach ($r in $routes) {
        $ifc = Get-NetIPInterface -InterfaceIndex $r.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
        $metric = $r.RouteMetric
        if ($ifc) { $metric += $ifc.InterfaceMetric }
        [pscustomobject]@{ Index = $r.InterfaceIndex; Metric = $metric }
    }
    foreach ($c in ($ranked | Sort-Object Metric)) {
        $ad = Get-NetAdapter -InterfaceIndex $c.Index -ErrorAction SilentlyContinue
        if (-not $ad -or $ad.Status -ne 'Up' -or $ad.Virtual -or $ad.InterfaceDescription -match $VirtualPattern -or $ad.Name -match $VirtualPattern) { continue }
        $ip = Get-NetIPAddress -InterfaceIndex $c.Index -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.AddressState -eq 'Preferred' -and -not $_.SkipAsSource } |
            Select-Object -First 1
        if ($ip) { return [pscustomobject]@{ IP = $ip.IPAddress; Index = $c.Index; Alias = $ad.Name } }
    }
    return $null
}

# Nom shu kompyuterdan haqiqatan ham ko'rsatilgan IP'ga ochilyaptimi (Windows .local nomlarni mDNS orqali so'raydi).
function Test-NameResolves([string]$name, [string]$ip) {
    try { Clear-DnsClientCache -ErrorAction SilentlyContinue } catch {}
    for ($i = 0; $i -lt 3; $i++) {
        try {
            $hit = Resolve-DnsName -Name $name -Type A -ErrorAction Stop | Where-Object { $_.IPAddress -eq $ip }
            if ($hit) { return $true }
        } catch {}
        try {
            if ([System.Net.Dns]::GetHostAddresses($name) | Where-Object { $_.ToString() -eq $ip }) { return $true }
        } catch {}
        Start-Sleep -Seconds 1
    }
    return $false
}

# ------------------------------------------------------------------------------
# LAN qo'riqchi (ARP). Holat skript darajasida; tarmoq (adapter/shlyuz) o'zgarsa tozalanadi.
$script:Ping = [System.Net.NetworkInformation.Ping]::new()
$script:Guard = $null

function Test-LocalMac([string]$mac) {
    # Ikkinchi bit (0x02) - "lokal boshqariladigan" MAC: kuchaytirgich/virtual qurilma, haqiqiy router emas.
    if (-not $mac -or $mac -match '^(00-){5}00$|^(FF-){5}FF$') { return $false }
    return (([Convert]::ToInt32($mac.Substring(0, 2), 16) -band 2) -ne 0)
}

function Get-NeighborMac([int]$idx, [string]$ip) {
    $n = Get-NetNeighbor -InterfaceIndex $idx -IPAddress $ip -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($n -and $n.State -notin @('Unreachable', 'Incomplete')) { return $n.LinkLayerAddress }
    return $null
}

# Yozuvni o'chirib qayta so'raydi: Windows hammaga eshitiladigan (broadcast) ARP so'rov yuboradi.
function Resolve-Fresh([int]$idx, [string]$ip) {
    Remove-NetNeighbor -InterfaceIndex $idx -IPAddress $ip -Confirm:$false -ErrorAction SilentlyContinue
    try { [void]$script:Ping.Send($ip, 1000) } catch {}
    Start-Sleep -Milliseconds 300
    return (Get-NeighborMac $idx $ip)
}

function Test-Ping([string]$ip) {
    try { return ($script:Ping.Send($ip, 1000).Status -eq 'Success') } catch { return $false }
}

function Test-Tcp([string]$ip, [int]$port, [int]$ms) {
    $c = New-Object System.Net.Sockets.TcpClient
    try { return ($c.ConnectAsync($ip, $port).Wait($ms) -and $c.Connected) } catch { return $false } finally { $c.Close() }
}

function Set-Pin([int]$idx, [string]$ip, [string]$mac, [string]$kind) {
    # store=active: faqat xotirada, kompyuter qayta yonsa o'chadi (eskirgan qotirish abadiy qolmaydi).
    $out = & netsh interface ipv4 set neighbors interface=$idx address=$ip neighbor=$($mac.ToLower()) store=active 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Log "LAN qo'riqchi: $ip ni qotirib bo'lmadi: $out"; return }
    $script:Guard.Pins[$ip] = @{ Mac = $mac; Kind = $kind; Fails = 0 }
}

function Remove-Pin([string]$ip) {
    Remove-NetNeighbor -InterfaceIndex $script:Guard.Idx -IPAddress $ip -Confirm:$false -ErrorAction SilentlyContinue
    $script:Guard.Pins.Remove($ip)
}

# Soxta javob ($bad MAC) olgan manzil uchun haqiqiy (lokal bo'lmagan) MAC'ni topishga urinadi.
function Find-RealMac([int]$idx, [string]$ip) {
    for ($i = 0; $i -lt 6; $i++) {
        $m = Resolve-Fresh $idx $ip
        if ($m -and -not (Test-LocalMac $m)) { return $m }
    }
    return $null
}

function Invoke-LanGuard($lan) {
    $gw = (Get-NetRoute -InterfaceIndex $lan.Index -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
        Sort-Object RouteMetric | Select-Object -First 1).NextHop
    if (-not $gw -or $gw -eq '0.0.0.0') { return }
    $g = $script:Guard
    if (-not $g -or $g.Idx -ne $lan.Index -or $g.Gw -ne $gw) {
        if ($g) { foreach ($ip in @($g.Pins.Keys)) { Remove-Pin $ip } }
        $script:Guard = @{ Idx = $lan.Index; Gw = $gw; Pins = @{}; Bad = $null; Checked = @{}; Announce = [datetime]::MinValue; Warned = $null }
        $g = $script:Guard
        # Kuchaytirgich ARP tekshiruv so'rovlariga ham javob beradi -> Windows har bir DHCP manzilni
        # "band" deb rad etib, IP'ni almashtirib turadi (hodisa 4199). Tekshiruvni o'chiramiz.
        Get-NetAdapter -Physical -ErrorAction SilentlyContinue | ForEach-Object {
            Set-NetIPInterface -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -DadTransmits 0 -ErrorAction SilentlyContinue
        }
    }
    $idx = $g.Idx

    # 1) Qotirilganlar sog'mi: 3 marta ketma-ket javob bo'lmasa (qurilma almashgan/o'chgan) - qotirish olinadi.
    foreach ($ip in @($g.Pins.Keys)) {
        $p = $g.Pins[$ip]
        if (Test-Ping $ip) { $p.Fails = 0; continue }
        $p.Fails++
        if ($p.Fails -ge 3) {
            Remove-Pin $ip
            Write-Log "LAN qo'riqchi: $ip ($($p.Kind)) javob bermayapti - qotirish olindi, oddiy rejimga qaytildi."
        }
    }

    # 2) Shlyuz (router) MAC'i soxta emasmi.
    if (-not $g.Pins.ContainsKey($gw)) {
        $mac = Get-NeighborMac $idx $gw
        if ($mac -and (Test-LocalMac $mac)) {
            $real = Find-RealMac $idx $gw
            if ($real) {
                $g.Bad = $mac
                Set-Pin $idx $gw $real 'router'
                Write-Log "LAN qo'riqchi: router ($gw) nomidan $mac javob beryapti (kuchaytirgich?) - haqiqiy MAC $real qotirildi."
            } elseif ($g.Warned -ne $mac) {
                $g.Warned = $mac
                Write-Log "LAN qo'riqchi: router MAC'i $mac lokal, lekin boshqasi topilmadi - router o'zi shunday (masalan telefon hotspot), tegilmaydi."
            }
        }
    }

    # 3) Soxta MAC aniqlangan bo'lsa: uning nomida turgan printerlarni (9100) ham tuzatamiz.
    #    Har bir manzil 30 daqiqada bir martadan ko'p tekshirilmaydi (9100 ga ulanish chop etishga xalaqit bermasin).
    if ($g.Bad) {
        $now = Get-Date
        $suspects = Get-NetNeighbor -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.LinkLayerAddress -eq $g.Bad -and $_.State -in @('Reachable', 'Stale', 'Delay', 'Probe') -and $_.IPAddress -ne $gw }
        foreach ($n in $suspects) {
            $ip = $n.IPAddress
            if ($g.Pins.ContainsKey($ip)) { continue }
            if ($g.Checked.ContainsKey($ip) -and ($now - $g.Checked[$ip]).TotalMinutes -lt 30) { continue }
            $g.Checked[$ip] = $now
            if (-not (Test-Tcp $ip 9100 500)) { continue }
            $real = Find-RealMac $idx $ip
            if ($real) {
                Set-Pin $idx $ip $real 'printer'
                Write-Log "LAN qo'riqchi: printer $ip nomidan $($g.Bad) javob berayotgan edi - haqiqiy MAC $real qotirildi."
            }
        }
    }

    # 4) Har 60 soniyada o'zimizni e'lon qilamiz: broadcast ARP so'rovdagi "jo'natuvchi" yozuvi orqali
    #    router va boshqalar o'z keshidagi bizning manzilimizni (kuchaytirgich MAC'i bo'lsa) tuzatadi.
    if (((Get-Date) - $g.Announce).TotalSeconds -ge 60) {
        $g.Announce = Get-Date
        $target = $null
        if (-not $g.Pins.ContainsKey($gw)) { $target = $gw }
        else {
            # Shlyuz qotirilgan - keshda yozuvi yo'q (yoki oddiy) biror manzilni so'raymiz; javob shart emas.
            $base = ($lan.IP -split '\.')[0..2] -join '.'
            foreach ($o in 250, 251, 252, 253, 3, 4, 5) {
                $c = "$base.$o"
                if ($c -eq $lan.IP -or $g.Pins.ContainsKey($c)) { continue }
                $target = $c; break
            }
        }
        if ($target) {
            Remove-NetNeighbor -InterfaceIndex $idx -IPAddress $target -Confirm:$false -ErrorAction SilentlyContinue
            try { [void]$script:Ping.Send($target, 300) } catch {}
        }
    }
}

function Invoke-Advertiser {
    $created = $false
    try { $mutex = [System.Threading.Mutex]::new($true, 'Global\PosBolaMdns', [ref]$created) } catch { $created = $false }
    if (-not $created) {
        Write-Host "Boshqa nusxa allaqachon ishlayapti (ehtimol '$TaskName' vazifasi). Holat: -Status" -ForegroundColor Yellow
        return
    }
    Import-MdnsApi
    if (-not [PosBolaMdns]::IsSupported()) {
        Write-Log "XATO: bu Windows'da DnsServiceRegister yo'q (Windows 10 1809 yoki yangisi kerak)."
        exit 2
    }

    $machine = [System.Net.Dns]::GetHostName()
    $instanceName = "PosBola-" + (($machine -replace '[^A-Za-z0-9-]', '-').Trim('-'))
    $serviceName = "$instanceName._pos-bola._tcp.local"
    $keys = [string[]]@('path', 'service')
    $values = [string[]]@('/api/', 'pos-bola')

    $currentIP = $null
    $currentHost = $null
    $registeredAt = [datetime]::MinValue
    $lastWarn = $null
    Write-Log "Ishga tushdi: $serviceName (port $Port)"

    while ($true) {
        try {
            $lan = Get-LanIPv4
            if (-not $lan) {
                if ([PosBolaMdns]::IsRegistered) {
                    [PosBolaMdns]::Unregister(5000)
                    Write-Log "Tarmoq IP'si yo'qoldi - e'lon to'xtatildi."
                }
                $currentIP = $null
                if ($lastWarn -ne 'noip') {
                    Write-Log "Restoran tarmog'idan IP yo'q (kabel/Wi-Fi ulanmagan yoki 169.254... manzil). Kutilmoqda..."
                    $lastWarn = 'noip'
                }
            } elseif (-not [PosBolaMdns]::IsRegistered -or $lan.IP -ne $currentIP -or ((Get-Date) - $registeredAt).TotalMinutes -ge 60) {
                $lastWarn = $null
                $ipChanged = ($lan.IP -ne $currentIP)
                # Nom tanlash IP o'zgarganda qayta qilinadi. Avval alohida "pos-bola.local" nomi: unda faqat
                # bitta A-yozuv (LAN IP) bo'ladi. Kompyuter nomi.local ga Windows WSL/Docker (172.x)
                # manzillarini ham qo'shib javob berishi mumkin, telefon esa ulardan bittasini oladi.
                $hosts = @(if ($ipChanged -or -not $currentHost) { $PreferredHost; "$machine.local" } else { $currentHost })
                $ok = $false
                foreach ($h in $hosts) {
                    $rc = [PosBolaMdns]::Register($serviceName, $h, $lan.IP, [uint16]$Port, $keys, $values, 10000)
                    if ($rc -ne 0) {
                        Write-Log ("E'lon xatosi ({0}, kod {1}). Keyingi variant..." -f $h, $rc)
                        continue
                    }
                    if ($h -eq $PreferredHost -and $hosts.Count -gt 1 -and -not (Test-NameResolves $h $lan.IP)) {
                        Write-Log "'$h' nomi $($lan.IP) ga ochilmadi - kompyuter nomi bilan e'lon qilinadi."
                        [PosBolaMdns]::Unregister(5000)
                        continue
                    }
                    $ok = $true
                    if ($ipChanged -or $h -ne $currentHost) {
                        Write-Log ("E'lon qilindi: _pos-bola._tcp -> {0} = {1}:{2} (adapter: {3})" -f $h, $lan.IP, $Port, $lan.Alias)
                    }
                    $currentIP = $lan.IP; $currentHost = $h; $registeredAt = Get-Date
                    break
                }
                if (-not $ok) {
                    $currentIP = $null; $currentHost = $null
                    Write-Log "E'lon qilib bo'lmadi - 30 soniyadan keyin qayta urinadi."
                    Start-Sleep -Seconds 15
                }
            }
        } catch {
            Write-Log "Kutilmagan xato: $($_.Exception.Message)"
        }
        # Qo'riqchi xatosi mDNS e'loniga hech qachon ta'sir qilmasin.
        if ($lan) { try { Invoke-LanGuard $lan } catch { Write-Log "LAN qo'riqchi xatosi: $($_.Exception.Message)" } }
        Start-Sleep -Seconds 15
    }
}

function Add-FirewallRules {
    foreach ($r in @(@{ N = 'POS Bola Server (HTTP 8000)'; P = 'TCP'; Port = 8000 }, @{ N = 'POS Bola mDNS (UDP 5353)'; P = 'UDP'; Port = 5353 })) {
        if (-not (Get-NetFirewallRule -DisplayName $r.N -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName $r.N -Direction Inbound -Protocol $r.P -LocalPort $r.Port -Action Allow -Profile Any | Out-Null
            Write-Host "Firewall qoidasi qo'shildi: $($r.N)" -ForegroundColor Green
        }
    }
}

function Show-Status {
    $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $t) {
        Write-Host "'$TaskName' vazifasi o'rnatilmagan. O'rnatish: -Install" -ForegroundColor Yellow
    } else {
        $info = Get-ScheduledTaskInfo -TaskName $TaskName
        $color = if ($t.State -eq 'Running') { 'Green' } else { 'Red' }
        Write-Host ("Vazifa: {0}   holati: {1}   oxirgi natija: {2}" -f $TaskName, $t.State, $info.LastTaskResult) -ForegroundColor $color
    }
    $lan = Get-LanIPv4
    if ($lan) {
        Write-Host "Hozirgi LAN IP: $($lan.IP) ($($lan.Alias))" -ForegroundColor Cyan
        # Windows'ning o'z doimiy yozuvlari (multicast/broadcast) ko'rsatilmaydi - faqat qo'riqchi qotirganlari.
        $pins = Get-NetNeighbor -InterfaceIndex $lan.Index -AddressFamily IPv4 -State Permanent -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notmatch '^(22[4-9]|23\d|255)\.|\.255$' -and $_.LinkLayerAddress -notmatch '^01-00-5E|^FF-FF' }
        if ($pins) { Write-Host ("LAN qo'riqchi qotirgan: " + (($pins | ForEach-Object { "$($_.IPAddress)=$($_.LinkLayerAddress)" }) -join ', ')) -ForegroundColor Yellow }
    }
    else { Write-Host "Hozirgi LAN IP: YO'Q (kabel/Wi-Fi'ni tekshiring, 169.254... bo'lsa routerdan IP olinmagan)" -ForegroundColor Red }
    if (Test-Path $LogFile) {
        Write-Host "--- oxirgi log ($LogFile) ---"
        Get-Content $LogFile -Tail 12
    }
}

# ------------------------------------------------------------------------------
if ($Install -or $Uninstall -or $Status) {
    if (-not (Test-Admin)) {
        Write-Host "XATO: PowerShell'ni Administrator sifatida oching va qayta ishga tushiring." -ForegroundColor Red
        exit 1
    }
}

if ($Status) { Show-Status; exit 0 }

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    Remove-Item -Path $InstalledScript -Force -ErrorAction SilentlyContinue
    Write-Host "mDNS e'loni olib tashlandi (firewall qoidalari qoldirildi)." -ForegroundColor Green
    exit 0
}

if ($Install) {
    Import-MdnsApi
    if (-not [PosBolaMdns]::IsSupported()) {
        Write-Host "XATO: bu Windows versiyasida mDNS e'lon API'si yo'q (Windows 10 1809 yoki yangisi kerak)." -ForegroundColor Red
        exit 2
    }
    $mdnsOff = (Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters' -Name EnableMDNS -ErrorAction SilentlyContinue).EnableMDNS
    if ($mdnsOff -eq 0) {
        Write-Host "OGOHLANTIRISH: Windows mDNS o'chirib qo'yilgan (Dnscache\Parameters\EnableMDNS = 0). Uni 1 qilib, kompyuterni qayta yoqmaguncha e'lon ishlamaydi." -ForegroundColor Yellow
    }
    Add-FirewallRules

    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
    if ($PSCommandPath -ne $InstalledScript) { Copy-Item -Path $PSCommandPath -Destination $InstalledScript -Force }

    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $action = New-ScheduledTaskAction -Execute $ps -Argument ("-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"{0}`" -Port {1}" -f $InstalledScript, $Port)
    $trigger = New-ScheduledTaskTrigger -AtStartup
    # Qo'riqchi: har 5 daqiqada qayta ishga tushirishga urinadi. Jarayon tirik bo'lsa IgnoreNew (va mutex)
    # yangisini ochmaydi; o'lgan bo'lsa (o'ldirilgan, 0 kod bilan chiqqan) - 5 daqiqa ichida qaytadi.
    # RestartCount buni qoplamaydi: Task Scheduler uni faqat ishga tushish xatosida qo'llaydi.
    # -RepetitionDuration berilmasa Windows 10+ cheksiz takrorlaydi ([TimeSpan]::MaxValue u yerda xato beradi).
    $watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    # ExecutionTimeLimit = 0: standart 72 soatlik cheklov vazifani 3 kunda o'ldirardi.
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($trigger, $watchdog) -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "'$TaskName' vazifasi o'rnatildi va ishga tushirildi (kompyuter har yoqilganda o'zi ishlaydi)." -ForegroundColor Green

    $lan = Get-LanIPv4
    if ($lan) {
        $prof = Get-NetConnectionProfile -InterfaceIndex $lan.Index -ErrorAction SilentlyContinue
        if ($prof -and $prof.NetworkCategory -eq 'Public') {
            Write-Host "Eslatma: '$($lan.Alias)' tarmog'i 'Public' deb belgilangan. Telefonlar topmasa, uni 'Private' qiling:" -ForegroundColor Yellow
            Write-Host "  Set-NetConnectionProfile -InterfaceIndex $($lan.Index) -NetworkCategory Private" -ForegroundColor Yellow
        }
    }
    Write-Host "10 soniyadan keyin holat ko'rsatiladi..."
    Start-Sleep -Seconds 10
    Show-Status
    exit 0
}

Invoke-Advertiser
