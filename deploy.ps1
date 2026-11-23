#Requires -Version 5.1
<#
.SYNOPSIS
  Build and deploy the rfid-anti-theft NestJS backend on the mini PC.

.DESCRIPTION
  Installs dependencies (Bun), applies pending Prisma migrations, compiles the
  app to dist/, and restarts the Windows service if it already exists. Run this
  from the rfid-anti-theft-server folder whenever backend code or the schema changes.

.PARAMETER ServiceName
  Name of the NSSM Windows service that runs the backend. Default: rfid-anti-theft-backend.

.PARAMETER SkipInstall
  Skip 'bun install' (use when dependencies are unchanged).

.PARAMETER SkipMigrate
  Skip 'prisma migrate deploy' (use when the schema is unchanged).

.EXAMPLE
  .\deploy.ps1
  .\deploy.ps1 -SkipInstall -SkipMigrate
#>
param(
  [string]$ServiceName = "rfid-anti-theft-backend",
  [switch]$SkipInstall,
  [switch]$SkipMigrate
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  throw "bun not found on PATH. Install Bun: powershell -c `"irm bun.sh/install.ps1 | iex`""
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "node not found on PATH. Install Node.js LTS (v20+)."
}
if (-not (Test-Path ".env")) {
  throw ".env not found in $PSScriptRoot. Create it from .env.example before deploying."
}

if (-not $SkipInstall) {
  Write-Host "[backend] Installing dependencies..." -ForegroundColor Cyan
  bun install
  if ($LASTEXITCODE -ne 0) {
    throw "bun install failed with exit code $LASTEXITCODE."
  }
}

# Clean up any stray compiled Prisma config artifacts in the project root so
# the Prisma CLI always loads prisma.config.ts cleanly.
Remove-Item -Path "prisma.config.js", "prisma.config.d.ts", "prisma.config.js.map" -Force -ErrorAction SilentlyContinue

if (-not $SkipMigrate) {
  Write-Host "[backend] Applying database migrations..." -ForegroundColor Cyan
  node ./node_modules/prisma/build/index.js migrate deploy
  if ($LASTEXITCODE -ne 0) {
    throw "Prisma migrate deploy failed with exit code $LASTEXITCODE."
  }
}

Write-Host "[backend] Building (nest build)..." -ForegroundColor Cyan
node ./node_modules/@nestjs/cli/bin/nest.js build
if ($LASTEXITCODE -ne 0) {
  throw "Backend build failed with exit code $LASTEXITCODE."
}

if (-not (Test-Path "dist\src\main.js")) {
  throw "Build did not produce dist\src\main.js. Check the build output above."
}

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Write-Host "[backend] Restarting service '$ServiceName'..." -ForegroundColor Cyan
  Restart-Service -Name $ServiceName
  Write-Host "[backend] Deployed. Service '$ServiceName' restarted." -ForegroundColor Green
} else {
  Write-Host "[backend] Built to dist\. Service '$ServiceName' not installed yet -" -ForegroundColor Yellow
  Write-Host "          run ..\setup-services.ps1 (elevated) to register it." -ForegroundColor Yellow
}
