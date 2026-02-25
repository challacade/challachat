#!/usr/bin/env pwsh
# Build ChallaChat Windows installer using electron-builder (NSIS)
# Produces: build/electron/ChallaChat Setup <version>.exe

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location -Path $RootDir

function Run($cmd) {
  Write-Host "Running: $cmd" -ForegroundColor Cyan
  Invoke-Expression $cmd
  if ($LASTEXITCODE -ne 0) { throw "Command failed: $cmd" }
}

Write-Host "======================================" -ForegroundColor Magenta
Write-Host " ChallaChat - Windows Installer Build" -ForegroundColor Magenta
Write-Host "======================================" -ForegroundColor Magenta
Write-Host ""

# Clean previous builds
Write-Host "Cleaning previous build output..." -ForegroundColor Yellow
if (Test-Path "build/electron") { Remove-Item -Recurse -Force "build/electron" }

# Build TypeScript then package with electron-builder
Write-Host "Compiling TypeScript..." -ForegroundColor Yellow
Run "npm run build"

Write-Host "Packaging with electron-builder (NSIS installer)..." -ForegroundColor Yellow
Run "npx electron-builder --win nsis"

# Find the installer in the output
$outputDir = "build/electron"
$installer = Get-ChildItem "$outputDir/*.exe" -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'Setup' } | Select-Object -First 1

if ($installer) {
  $installerSize = $installer.Length / 1MB
  Write-Host ""
  Write-Host "======================================" -ForegroundColor Green
  Write-Host " Installer build complete!" -ForegroundColor Green
  Write-Host "======================================" -ForegroundColor Green
  Write-Host ""
  Write-Host "Output: $($installer.FullName)" -ForegroundColor Cyan
  Write-Host "  Size: $([math]::Round($installerSize,1)) MB" -ForegroundColor Cyan
  Write-Host ""
} else {
  Write-Warning "Installer .exe not found in $outputDir — check electron-builder output above."
}
