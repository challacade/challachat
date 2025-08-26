Param(
  [switch]$Reinstall,
  [switch]$All
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

# Package
if ($All) {
  Run "npm run pack:all"
} else {
  Run "npm run pack:win"
}

Write-Host "Build complete. Artifacts in .\build" -ForegroundColor Green
