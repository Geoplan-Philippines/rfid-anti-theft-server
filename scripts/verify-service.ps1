#Requires -Version 5.1
<#
.SYNOPSIS
  Verify (and optionally repair) the rfid-anti-theft backend Windows service so it
  auto-starts with the mini PC and restarts itself on failure.

.PARAMETER ServiceName
  Name of the service. Default: rfid-anti-theft-backend (matches deploy.ps1).

.PARAMETER Apply
  Write the recommended configuration instead of only reporting it.

.EXAMPLE
  .\scripts\verify-service.ps1
  .\scripts\verify-service.ps1 -Apply
#>
param(
  [string]$ServiceName = "rfid-anti-theft-backend",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

$RestartDelayMs = 5000
$ThrottleMs     = 5000
$LogDir         = Join-Path $PSScriptRoot "..\logs"
$RotateBytes    = 10485760  # 10 MB

$script:Problems = @()

function Write-Check {
  param([string]$Label, [string]$Actual, [bool]$Ok, [string]$Expected)
  if ($Ok) {
    Write-Host ("  [ OK ] {0}: {1}" -f $Label, $Actual) -ForegroundColor Green
  } else {
    Write-Host ("  [FAIL] {0}: {1} (expected {2})" -f $Label, $Actual, $Expected) -ForegroundColor Red
    $script:Problems += $Label
  }
}

function Show-Value {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return "unset" }
  return $Value
}

function Get-NssmValue {
  param([string]$Name, [string]$Parameter)
  try {
    $raw = & nssm get $Name $Parameter 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return ($raw -join "").Replace("`0", "").Trim()
  } catch {
    return $null
  }
}

Write-Host "rfid-anti-theft backend service check: $ServiceName" -ForegroundColor Cyan

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
  Write-Host "  [FAIL] Service '$ServiceName' is not installed." -ForegroundColor Red
  Write-Host "         Install it with ..\setup-services.ps1 (elevated), then re-run this script." -ForegroundColor Yellow
  exit 1
}

Write-Check -Label "Status" -Actual $service.Status -Ok ($service.Status -eq 'Running') -Expected "Running"
Write-Check -Label "Start type" -Actual $service.StartType -Ok ($service.StartType -eq 'Automatic') -Expected "Automatic"

$hasNssm = [bool](Get-Command nssm -ErrorAction SilentlyContinue)
if (-not $hasNssm) {
  Write-Host "  [WARN] nssm is not on PATH - cannot verify process-level restart settings." -ForegroundColor Yellow
} else {
  $appExit = Get-NssmValue -Name $ServiceName -Parameter "AppExit"
  Write-Check -Label "Restart on exit" -Actual (Show-Value $appExit) `
    -Ok ($appExit -match "Restart") -Expected "Restart"

  $delay = Get-NssmValue -Name $ServiceName -Parameter "AppRestartDelay"
  $delayOk = $false
  if ($delay -match '^\d+$') { $delayOk = ([int]$delay -ge 1000) }
  Write-Check -Label "Restart delay (ms)" -Actual (Show-Value $delay) `
    -Ok $delayOk -Expected ">= 1000"

  $stdout = Get-NssmValue -Name $ServiceName -Parameter "AppStdout"
  Write-Check -Label "stdout log" -Actual (Show-Value $stdout) `
    -Ok (-not [string]::IsNullOrWhiteSpace($stdout)) -Expected "a log file path"
}

$scRecovery = (& sc.exe qfailure $ServiceName) -join " "
$hasRecovery = $scRecovery -match "RESTART"
Write-Check -Label "SCM recovery actions" -Actual $(if ($hasRecovery) { "restart configured" } else { "none" }) `
  -Ok $hasRecovery -Expected "restart configured"

if (-not $Apply) {
  Write-Host ""
  if ($script:Problems.Count -eq 0) {
    Write-Host "All checks passed. The service auto-starts and restarts on failure." -ForegroundColor Green
    exit 0
  }
  Write-Host ("{0} problem(s) found: {1}" -f $script:Problems.Count, ($script:Problems -join ", ")) -ForegroundColor Red
  Write-Host "Re-run elevated with -Apply to fix them." -ForegroundColor Yellow
  exit 1
}

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw "-Apply requires an elevated PowerShell (Run as Administrator)."
}

Write-Host ""
Write-Host "Applying recommended configuration..." -ForegroundColor Cyan

Set-Service -Name $ServiceName -StartupType Automatic
Write-Host "  Start type -> Automatic"

if ($hasNssm) {
  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

  & nssm set $ServiceName Start SERVICE_AUTO_START | Out-Null
  & nssm set $ServiceName AppExit Default Restart | Out-Null
  & nssm set $ServiceName AppRestartDelay $RestartDelayMs | Out-Null
  & nssm set $ServiceName AppThrottle $ThrottleMs | Out-Null
  & nssm set $ServiceName AppStdout (Join-Path $LogDir "service-out.log") | Out-Null
  & nssm set $ServiceName AppStderr (Join-Path $LogDir "service-err.log") | Out-Null
  & nssm set $ServiceName AppRotateFiles 1 | Out-Null
  & nssm set $ServiceName AppRotateOnline 1 | Out-Null
  & nssm set $ServiceName AppRotateBytes $RotateBytes | Out-Null
  Write-Host "  NSSM -> restart on exit after ${RestartDelayMs}ms, rotating logs in $LogDir"
}

& sc.exe failure $ServiceName reset= 0 actions= restart/5000/restart/5000/restart/5000 | Out-Null
& sc.exe failureflag $ServiceName 1 | Out-Null
Write-Host "  SCM recovery -> restart after 5s, indefinitely"

Write-Host ""
Write-Host "Done. Re-run without -Apply to confirm." -ForegroundColor Green
