#!/usr/bin/env pwsh
# Windows build script using Node.js 24 Single Executable Applications (SEA)
# Requires Node.js 24+

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$RootDir = Split-Path -Parent $ScriptDir
Set-Location -Path $RootDir

function Run($cmd) {
  Write-Host "Running: $cmd" -ForegroundColor Cyan
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -NoNewWindow -Wait -PassThru
  if ($p.ExitCode -ne 0) { 
    throw "Command failed with exit code $($p.ExitCode): $cmd" 
  }
}

Write-Host "ChallaChat - Building with Node.js 24 SEA" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host ""

# Check Node.js version
Write-Host "Checking Node.js version..." -ForegroundColor Yellow
$nodeVersion = node --version
Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green

if (-not $nodeVersion.StartsWith("v24")) {
  Write-Warning "This build script is optimized for Node.js 24. You are using $nodeVersion"
  Write-Warning "The build may still work, but for best results, please use Node.js 24."
}

# Ensure dependencies are installed
Write-Host "Installing dependencies..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
  Write-Host "Dependencies already installed, skipping npm install"
} else {
  Run "npm install"
}

# Clean build directory
Write-Host "Cleaning build directory..." -ForegroundColor Yellow
if (Test-Path "build") {
  Remove-Item -Recurse -Force "build"
}
New-Item -ItemType Directory -Path "build" | Out-Null

# Build the Windows executable using SEA
Write-Host "Building Windows executable with Node.js SEA..." -ForegroundColor Yellow
Run "npm run build:win"

Write-Host "" -ForegroundColor Green
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "Build artifacts:" -ForegroundColor Green
Write-Host "  - challachat.exe (self-contained Node.js 24 executable)" -ForegroundColor White
Write-Host "  - README.txt (usage instructions)" -ForegroundColor White
Write-Host "" -ForegroundColor Green
Write-Host "To run: .\build\challachat.exe" -ForegroundColor Yellow
