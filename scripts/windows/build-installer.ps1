#!/usr/bin/env pwsh
# Build ChallaChat Windows installer using electron-builder (NSIS)
# Produces: build/electron/ChallaChat-Setup.exe

. "$PSScriptRoot/build-common.ps1"

Show-Banner 'ChallaChat - Windows Installer Build'
$gitVersion = Get-GitVersion
Start-BuildStep

Write-Host 'Packaging with electron-builder (NSIS installer)...' -ForegroundColor Yellow
Invoke-ElectronBuilder '--win nsis' $gitVersion

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
  Write-Warning "Installer .exe not found in $outputDir - check electron-builder output above."
}
