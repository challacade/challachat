Param(
  [switch]$Dev,
  [int]$Port = 5050,
  [switch]$Reinstall,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$RootDir = Split-Path -Parent $ScriptDir
Set-Location -Path $RootDir

function Run($cmd) {
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -NoNewWindow -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Command failed ($($p.ExitCode)): $cmd" }
}

function Ensure-Node {
  $nodeVer = & node --version 2>$null
  if ($nodeVer) { return }
  Write-Host "Node.js not found. Bootstrapping a portable Node.js..." -ForegroundColor Yellow
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
  $nodeExe = Join-Path $nodeDir 'node.exe'
  if (-not (Test-Path $nodeExe)) { throw "Portable Node extraction failed. Please install Node.js from https://nodejs.org" }
  $env:PATH = "$nodeDir;$env:PATH"
  Write-Host "Using portable Node: $($nodeExe)" -ForegroundColor Green
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

function Test-AnyPathExists([string[]]$paths) { foreach ($p in $paths) { if ($p -and (Test-Path $p)) { return $true } } return $false }

function Ensure-Puppeteer-Chrome {
  $systemChromePaths = @(
    (Join-Path $env:PROGRAMFILES 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:PROGRAMFILES(X86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:PROGRAMW6432 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
  )
  $systemEdgePaths = @(
    (Join-Path $env:PROGRAMFILES 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path ${env:PROGRAMFILES(X86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:PROGRAMW6432 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')
  )
  $hasSystemBrowser = (Test-AnyPathExists $systemChromePaths) -or (Test-AnyPathExists $systemEdgePaths)
  if ($hasSystemBrowser) { return }
  $ppWinCache1 = Join-Path $env:LOCALAPPDATA 'puppeteer'
  $ppWinCache2 = Join-Path $env:USERPROFILE '.cache\puppeteer'
  $cacheHasChrome = $false
  foreach ($cache in @($ppWinCache1, $ppWinCache2)) {
    try {
      if (Test-Path $cache) {
        $chromeExe = Get-ChildItem -Path $cache -Recurse -Filter chrome.exe -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($chromeExe) { $cacheHasChrome = $true; break }
      }
    } catch {}
  }
  if (-not $cacheHasChrome) {
    Write-Host "Installing Chrome-for-Testing (Puppeteer managed)..." -ForegroundColor Yellow
    Run "npx puppeteer browsers install chrome"
  }
}

Ensure-Node
Ensure-Dependencies
Ensure-Puppeteer-Chrome

$env:PORT = [string]$Port
Write-Host "ChallaChat is starting on port $Port..." -ForegroundColor Green
if ($Dev) {
  Run "npm run dev"
} else {
  if (-not $SkipBuild) { Run "npm run build" }
  Run "npm start"
}
