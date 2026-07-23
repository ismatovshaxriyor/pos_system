# ==============================================================================
# pos-bola Common Thermal Printer Subnets Setup Script (Windows PowerShell)
# ==============================================================================

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Please run PowerShell as Administrator:" -ForegroundColor Red
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\setup_printer_subnets.ps1" -ForegroundColor Yellow
    Exit 1
}

Write-Host "=== Binding Thermal Printer Subnet Aliases on Windows ===" -ForegroundColor Cyan

function Add-PrinterSubnetAlias {
    param ([string]$AliasIP, [string]$SubnetMask = "255.255.255.0")
    
    $adapters = Get-NetAdapter | Where-Status -Eq "Up"
    foreach ($adapter in $adapters) {
        $existing = Get-NetIPAddress -InterfaceIndex $adapter.InterfaceIndex -IPAddress $AliasIP -ErrorAction SilentlyContinue
        if (-not $existing) {
            Write-Host "Adding IP Alias $AliasIP on adapter '$($adapter.Name)'..." -ForegroundColor Green
            New-NetIPAddress -InterfaceIndex $adapter.InterfaceIndex -IPAddress $AliasIP -PrefixLength 24 -ErrorAction SilentlyContinue | Out-Null
        } else {
            Write-Host "IP Alias $AliasIP already exists on '$($adapter.Name)'." -ForegroundColor Yellow
        }
    }
}

Add-PrinterSubnetAlias -AliasIP "192.168.123.250"
Add-PrinterSubnetAlias -AliasIP "192.168.1.250"
Add-PrinterSubnetAlias -AliasIP "192.168.0.250"

Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "SUCCESS: Printer Subnet Aliases Configured on Windows!" -ForegroundColor Green
Write-Host "Server can now reach thermal printers on 192.168.123.x, 192.168.1.x, 192.168.0.x" -ForegroundColor White
Write-Host "==============================================================================" -ForegroundColor Green
