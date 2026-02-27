#!/usr/bin/env pwsh
# Shared build utilities for ChallaChat electron-builder scripts.
# Dot-source this file from build-portable.ps1 / build-installer.ps1.
#
# NOTE: Must be run as Administrator due to electron-builder winCodeSign symlink issue.
# See: https://github.com/electron-userland/electron-builder/issues/8149
#
# TODO: Once electron-builder ships a release where the toolsets.winCodeSign config
# actually switches to per-platform archives, we can drop the admin requirement.
# Track PR: https://github.com/electron-userland/electron-builder/pull/9430
# Config to add in package.json build: { toolsets: { winCodeSign: '1.1.0' } }

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location -Path $RootDir

function Run($cmd) {
  Write-Host "Running: $cmd" -ForegroundColor Cyan
  Invoke-Expression $cmd
  if ($LASTEXITCODE -ne 0) { throw "Command failed: $cmd" }
}

function Show-Banner($title) {
  $bar = '=' * ($title.Length + 4)
  Write-Host $bar -ForegroundColor Magenta
  Write-Host "  $title" -ForegroundColor Magenta
  Write-Host $bar -ForegroundColor Magenta
  Write-Host ''
}

function Get-GitVersion {
  $version = $null
  try {
    $gitTag = (git describe --tags --abbrev=0 2>$null)
    if ($gitTag) {
      $version = $gitTag -replace '^v', ''
      Write-Host "Detected version from git tag: $version" -ForegroundColor Cyan
    }
  } catch { }
  if (-not $version) {
    $version = (Get-Content package.json | ConvertFrom-Json).version
    Write-Host "No git tag found, using package.json version: $version" -ForegroundColor Yellow
  }
  return $version
}

function Start-BuildStep {
  # Clean previous builds
  Write-Host 'Cleaning previous build output...' -ForegroundColor Yellow
  if (Test-Path 'build/electron') { Remove-Item -Recurse -Force 'build/electron' }

  # Build TypeScript
  Write-Host 'Compiling TypeScript...' -ForegroundColor Yellow
  Run 'npm run build'
}

function Invoke-ElectronBuilder($builderArgs, $version) {
  # Inject git-derived version into package.json before building
  $pkgJson = Get-Content package.json -Raw | ConvertFrom-Json
  $originalVersion = $pkgJson.version
  $pkgJson.version = $version
  $jsonText = $pkgJson | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText("$RootDir/package.json", $jsonText)
  Write-Host "Set package.json version: $originalVersion -> $version" -ForegroundColor Cyan

  try {
    Run "npx electron-builder $builderArgs"
  } finally {
    # Restore original version
    $pkgJson.version = $originalVersion
    $jsonText = $pkgJson | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText("$RootDir/package.json", $jsonText)
  }
}
