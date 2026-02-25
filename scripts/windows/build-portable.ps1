#!/usr/bin/env pwsh
# Build ChallaChat portable distribution using electron-builder (unpacked)
# Produces: build/electron/win-unpacked/ChallaChat.exe (no installer needed)
#
# NOTE: Must be run as Administrator due to electron-builder winCodeSign symlink issue.
# See: https://github.com/electron-userland/electron-builder/issues/8149
#
# TODO: Once electron-builder ships a release where the `toolsets.winCodeSign` config
# actually switches to per-platform archives, we can drop the admin requirement.
# Track PR: https://github.com/electron-userland/electron-builder/pull/9430
# Config to add in package.json "build": { "toolsets": { "winCodeSign": "1.1.0" } }

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location -Path $RootDir

function Run($cmd) {
  Write-Host "Running: $cmd" -ForegroundColor Cyan
  Invoke-Expression $cmd
  if ($LASTEXITCODE -ne 0) { throw "Command failed: $cmd" }
}

Write-Host "=====================================" -ForegroundColor Magenta
Write-Host " ChallaChat - Portable Electron Build" -ForegroundColor Magenta
Write-Host "=====================================" -ForegroundColor Magenta
Write-Host ""

# Clean previous builds
Write-Host "Cleaning previous build output..." -ForegroundColor Yellow
if (Test-Path "build/electron") { Remove-Item -Recurse -Force "build/electron" }

# Build TypeScript then package with electron-builder (--dir = unpacked)
Write-Host "Compiling TypeScript..." -ForegroundColor Yellow
Run "npm run build"

Write-Host "Packaging with electron-builder (portable)..." -ForegroundColor Yellow
Run "npx electron-builder --win portable --dir"

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
Write-Host "Output: build\electron\win-unpacked\" -ForegroundColor Cyan
Write-Host "  ChallaChat.exe : $([math]::Round($exeSize,1)) MB" -ForegroundColor Cyan
Write-Host "  Total          : $([math]::Round($totalSize,1)) MB" -ForegroundColor Cyan
Write-Host ""
Write-Host "To run: .\build\electron\win-unpacked\ChallaChat.exe" -ForegroundColor White
