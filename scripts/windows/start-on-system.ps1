#!/usr/bin/env pwsh
# Start ChallaChat using system Node.js and dependencies
# Runs directly from source without building executables
#
# Usage:
#   .\start-on-system.ps1              # Launch Electron UI (default)
#   .\start-on-system.ps1 --terminal   # Launch in terminal-only mode

param(
  [switch]$Terminal
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location -Path $RootDir

function Run($cmd) {
  Write-Host "Running: $cmd" -ForegroundColor Cyan
  Invoke-Expression $cmd
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $cmd"
  }
}

function Write-Header($text) {
  Write-Host ""
  Write-Host $text -ForegroundColor Magenta
  Write-Host ("=" * $text.Length) -ForegroundColor Magenta
  Write-Host ""
}

function Check-NodeVersion {
  try {
    $nodeVersion = node --version
    $versionNumber = $nodeVersion -replace 'v', ''
    $majorVersion = [int]($versionNumber -split '\.')[0]
    
    Write-Host "Detected Node.js version: $nodeVersion" -ForegroundColor Green
    
    if ($majorVersion -lt 24) {
      Write-Host "WARNING: Node.js 24+ is recommended. Current version is $nodeVersion" -ForegroundColor Yellow
      Write-Host "The app may still work, but some features might not be available." -ForegroundColor Yellow
    }
  }
  catch {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js 24+ from https://nodejs.org/" -ForegroundColor Red
    exit 1
  }
}

function Check-Dependencies {
  $needInstall = $false
  if (-not (Test-Path "node_modules")) { $needInstall = $true }
  elseif (Test-Path "package-lock.json") {
    try {
      $lockTime = (Get-Item "package-lock.json").LastWriteTimeUtc
      $mods = Get-ChildItem -Path "node_modules" -ErrorAction SilentlyContinue
      if (-not $mods) { $needInstall = $true }
    } catch { $needInstall = $true }
  }
  if ($needInstall) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    Run "npm install"
  } else {
    Write-Host "Dependencies found." -ForegroundColor Green
  }
}

function Start-Application {
  Write-Host "Compiling TypeScript..." -ForegroundColor Yellow
  Run "npm run build"

  if ($Terminal) {
    Write-Host ""
    Write-Host "Starting ChallaChat (terminal mode)..." -ForegroundColor Green
    Write-Host "The app will be available at:" -ForegroundColor Yellow
    Write-Host "  http://localhost:5050" -ForegroundColor White
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
    Write-Host ""
    Run "npm start"
  } else {
    Write-Host ""
    Write-Host "Starting ChallaChat (Electron)..." -ForegroundColor Green
    Write-Host ""

    # Launch Electron as a detached process so this terminal can close
    $electronBin = Join-Path $RootDir 'node_modules/.bin/electron.cmd'
    Start-Process -FilePath $electronBin -ArgumentList '.' -WorkingDirectory $RootDir -WindowStyle Hidden
    Write-Host "ChallaChat is running. You can close this terminal." -ForegroundColor Green
  }
}

# Main script
Write-Header "ChallaChat - System Start"

# Check system requirements
Write-Host "Checking system requirements..." -ForegroundColor Yellow
Check-NodeVersion
Check-Dependencies

Write-Host ""
Start-Application
