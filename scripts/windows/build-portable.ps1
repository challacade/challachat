#!/usr/bin/env pwsh
# Build ChallaChat portable distribution using electron-builder (unpacked)
# Produces: build/electron/win-unpacked/ChallaChat.exe (no installer needed)

. "$PSScriptRoot/build-common.ps1"

Show-Banner 'ChallaChat - Portable Electron Build'
$gitVersion = Get-GitVersion
Start-BuildStep

Write-Host 'Packaging with electron-builder (portable)...' -ForegroundColor Yellow
Invoke-ElectronBuilder '--win portable --dir' $gitVersion

$unpackedDir = "build/electron/win-unpacked"
if (-not (Test-Path $unpackedDir)) {
  throw "Build failed - unpacked directory not found: $unpackedDir"
}

# Print summary
$totalSize = (Get-ChildItem $unpackedDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$exePath = "$unpackedDir/ChallaChat.exe"
if (Test-Path $exePath) {
  $exeSize = (Get-Item $exePath).Length / 1MB
} else {
  $exeSize = 0
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host " Portable build complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host 'Output: build\electron\win-unpacked\' -ForegroundColor Cyan
Write-Host "  ChallaChat.exe : $([math]::Round($exeSize,1)) MB" -ForegroundColor Cyan
Write-Host "  Total          : $([math]::Round($totalSize,1)) MB" -ForegroundColor Cyan
Write-Host ""
Write-Host 'To run: .\build\electron\win-unpacked\ChallaChat.exe' -ForegroundColor White
