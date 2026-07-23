# ==============================================================================
# pos-bola Windows mDNS & Firewall Auto-Discovery Setup Script
# ==============================================================================

# Ensure script is running with Administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Please run PowerShell as Administrator:" -ForegroundColor Red
    Write-Host "  Right-click PowerShell -> 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\setup_mdns_windows.ps1" -ForegroundColor Yellow
    Exit 1
}

Write-Host "=== Configuring Windows mDNS & Firewall Rules for POS Bola ===" -ForegroundColor Cyan

# 1. Allow TCP Port 8000 through Windows Defender Firewall
$fw8000 = Get-NetFirewallRule -DisplayName "POS Bola Server (HTTP 8000)" -ErrorAction SilentlyContinue
if (-not $fw8000) {
    Write-Host "Adding Windows Firewall Inbound Rule for Port 8000 (TCP)..." -ForegroundColor Green
    New-NetFirewallRule -DisplayName "POS Bola Server (HTTP 8000)" `
                        -Direction Inbound `
                        -Protocol TCP `
                        -LocalPort 8000 `
                        -Action Allow `
                        -Profile Any | Out-Null
} else {
    Write-Host "Windows Firewall Rule for Port 8000 already exists." -ForegroundColor Yellow
}

# 2. Allow UDP Port 5353 (mDNS) through Windows Defender Firewall
$fw5353 = Get-NetFirewallRule -DisplayName "POS Bola mDNS (UDP 5353)" -ErrorAction SilentlyContinue
if (-not $fw5353) {
    Write-Host "Adding Windows Firewall Inbound Rule for Port 5353 (mDNS UDP)..." -ForegroundColor Green
    New-NetFirewallRule -DisplayName "POS Bola mDNS (UDP 5353)" `
                        -Direction Inbound `
                        -Protocol UDP `
                        -LocalPort 5353 `
                        -Action Allow `
                        -Profile Any | Out-Null
} else {
    Write-Host "Windows Firewall Rule for mDNS (UDP 5353) already exists." -ForegroundColor Yellow
}

# 3. Get Windows Hostname and display .local domain
$hostname = $env:COMPUTERNAME.ToLower()
$localDomain = "http://${hostname}.local:8000/api/"

Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "SUCCESS: Windows mDNS Firewall Rules Configured!" -ForegroundColor Green
Write-Host "Server Hostname: $env:COMPUTERNAME" -ForegroundColor White
Write-Host "Local mDNS URL:  $localDomain" -ForegroundColor Cyan
Write-Host "Discovery URL:   http://${hostname}.local:8000/api/discovery/" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Green
