Param(
  [switch]$Reinstall,
  [switch]$All,
  [switch]$PortableFallback
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$RootDir = Split-Path -Parent $ScriptDir
Set-Location -Path $RootDir

function Run($cmd) {
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -NoNewWindow -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Command failed ($($p.ExitCode)): $cmd" }
}

function Ensure-Dependencies {
  if ($Reinstall -and (Test-Path (Join-Path $RootDir 'node_modules'))) {
    Write-Host "Reinstall requested. Removing node_modules..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $RootDir 'node_modules')
  }
  if (-not (Test-Path (Join-Path $RootDir 'node_modules'))) {
    if (Test-Path (Join-Path $RootDir 'package-lock.json')) {
      try { Run "npm ci" }
      catch { Write-Host "npm ci failed, falling back to npm install..." -ForegroundColor Yellow; Run "npm install" }
    } else {
      Run "npm install"
    }
  }
}

Ensure-Dependencies

# Build TypeScript output
Run "npm run build"

# Try to package with pkg (Node 22 targets)
$packSucceeded = $false
try {
  if ($All) {
    Run "npm run pack:all"
  } else {
    Run "npm run pack:win"
  }
  $packSucceeded = $true
} catch {
  $msg = $_.Exception.Message
  Write-Warning "pkg packaging failed: $msg"
}

# If pkg failed due to missing runtime support or explicitly requested, create a portable Node 22 bundle
if (-not $packSucceeded -or $PortableFallback) {
  Write-Host "Creating portable Node 22 bundle..." -ForegroundColor Yellow

  # 1) Download Node 22 portable if not already cached
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
  $arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
  $nodeVersion = 'v22.5.1'
  $zipName = "node-$nodeVersion-win-$arch.zip"
  $url = "https://nodejs.org/dist/$nodeVersion/$zipName"
  $toolsDir = Join-Path $RootDir ".tools"
  $zipPath = Join-Path $toolsDir $zipName
  $nodeDir = Join-Path $toolsDir "node-$nodeVersion-win-$arch"
  if (-not (Test-Path $toolsDir)) { New-Item -Path $toolsDir -ItemType Directory | Out-Null }
  if (-not (Test-Path $nodeDir)) {
    Write-Host "Downloading $url" -ForegroundColor Cyan
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    Write-Host "Extracting Node.js..." -ForegroundColor Cyan
    Expand-Archive -Path $zipPath -DestinationPath $toolsDir -Force
  }

  # 2) Stage app files
  $stage = Join-Path $RootDir 'build/portable-win'
  if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
  New-Item -ItemType Directory -Path $stage | Out-Null
  Copy-Item -Recurse -Force (Join-Path $RootDir 'dist') (Join-Path $stage 'dist')
  Copy-Item -Recurse -Force (Join-Path $RootDir 'static') (Join-Path $stage 'static')
  Copy-Item -Force (Join-Path $nodeDir 'node.exe') (Join-Path $stage 'node.exe')

  # 3) Create start script
  $bat = @(
    '@echo off',
    'setlocal',
    'set PORT=%1',
    'if "%PORT%"=="" set PORT=5050',
    'echo Starting ChallaChat on port %PORT% ...',
    '"%~dp0node.exe" "%~dp0dist\http\server.js"'
  ) -join "`r`n"
  Set-Content -Path (Join-Path $stage 'start.bat') -Value $bat -Encoding ASCII

  $readme = @(
    'ChallaChat Portable (Windows)',
    '',
    'Usage:',
    '  - Double-click start.bat (uses port 5050)',
    '  - Or run: start.bat 5099  (to choose a port)',
    '',
    'Note:',
    '  - A system Chrome or Edge is recommended. If missing, the app can use Chrome-for-Testing when installed by Puppeteer.',
    ''
  ) -join "`r`n"
  Set-Content -Path (Join-Path $stage 'README.txt') -Value $readme -Encoding ASCII

  # 4) Zip it
  $zipOut = Join-Path $RootDir 'build/challachat-win-portable.zip'
  if (Test-Path $zipOut) { Remove-Item -Force $zipOut }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipOut
  Write-Host "Portable bundle created: $zipOut" -ForegroundColor Green
}

Write-Host "Build complete. See .\\build for artifacts." -ForegroundColor Green
