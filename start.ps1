Param(
  [switch]$Dev,
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

# Ensure Node is available
$node = & node --version 2>$null
if (-not $node) {
  Write-Host "Node.js is required" -ForegroundColor Red
  exit 1
}

$env:PORT = [string]$Port

function Run($cmd) {
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -NoNewWindow -Wait -PassThru
  if ($p.ExitCode -ne 0) { exit $p.ExitCode }
}

# Install deps if missing
if (-not (Test-Path -Path (Join-Path $PSScriptRoot 'node_modules'))) {
  if (Test-Path -Path (Join-Path $PSScriptRoot 'package-lock.json')) { Run "npm ci" } else { Run "npm install" }
}

# Ensure Puppeteer browser installed (first run convenience)
$ppCache = Join-Path $env:USERPROFILE ".cache\puppeteer"
$needChrome = $false
if (-not (Test-Path -Path $ppCache)) { $needChrome = $true }
else {
  try { $chromeExe = Get-ChildItem -Path $ppCache -Recurse -Filter chrome.exe -ErrorAction SilentlyContinue | Select-Object -First 1 } catch { $chromeExe = $null }
  if (-not $chromeExe) { $needChrome = $true }
}
if ($needChrome) { Run "npx puppeteer browsers install chrome" }

if ($Dev) {
  Write-Host "ChallaChat is starting..." -ForegroundColor Green
  Run "npm run dev"
  exit 0
}

Write-Host "ChallaChat is starting..." -ForegroundColor Green
Run "npm run build"
Run "npm start"
