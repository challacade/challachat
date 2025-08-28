#!/usr/bin/env pwsh
# PowerShell script to inject SEA blob into Node.js binary
# Handles icon application and SEA blob injection with proper Windows icon cache handling

param(
  [Parameter(Mandatory=$true)]
  [string]$InputExe,
  
  [Parameter(Mandatory=$true)]
  [string]$SeaBlobPath,
  
  [Parameter(Mandatory=$true)]
  [string]$OutputExe,
  
  [string]$IconPath = ""
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)

function Run($cmd) {
  Write-Host "Running: $cmd" -ForegroundColor Cyan
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -NoNewWindow -Wait -PassThru
  if ($p.ExitCode -ne 0) { 
    throw "Command failed with exit code $($p.ExitCode): $cmd" 
  }
}

Write-Host "SEA Injection Process" -ForegroundColor Magenta
Write-Host "===================" -ForegroundColor Magenta

# Use temporary name to avoid Windows icon cache issues
$tempExeName = [System.IO.Path]::ChangeExtension($OutputExe, ".tmp.exe")

# Copy input executable to temp name
Write-Host "Creating temporary executable..." -ForegroundColor Yellow
Copy-Item -Path $InputExe -Destination $tempExeName -Force

# Apply icon if provided
if ($IconPath -and (Test-Path $IconPath)) {
  Write-Host "Applying icon..." -ForegroundColor Cyan
  try {
    # Use rcedit directly through Node.js
    $rceditScript = @"
const rcedit = require('rcedit');
rcedit('$($tempExeName.Replace('\', '\\'))', { icon: '$($IconPath.Replace('\', '\\'))' })
  .then(() => {
    console.log('Icon successfully applied');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed to apply icon:', err.message);
    process.exit(1);
  });
"@
    $rceditScript | Out-File -FilePath "temp-rcedit.js" -Encoding UTF8
    Run "node temp-rcedit.js"
    Remove-Item "temp-rcedit.js" -Force -ErrorAction SilentlyContinue
    Write-Host "Icon successfully applied" -ForegroundColor Green
  } catch {
    Write-Warning "Failed to apply icon: $($_.Exception.Message)"
  }
} else {
  Write-Host "No icon specified, skipping icon application" -ForegroundColor Yellow
}

# Remove signature from the executable (Windows)
Write-Host "Removing signature from executable..." -ForegroundColor Yellow
try {
  Run "signtool remove /s `"$tempExeName`""
  Write-Host "Signature removed with signtool" -ForegroundColor Green
} catch {
  Write-Host "signtool not available, skipping signature removal (this is optional)" -ForegroundColor Yellow
}

# Inject the SEA blob using postject
Write-Host "Injecting SEA blob into executable..." -ForegroundColor Yellow
$postjectCmd = "npx postject `"$tempExeName`" NODE_SEA_BLOB `"$SeaBlobPath`" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
Run $postjectCmd

# Rename to final executable name (avoids Windows icon cache issues)
Write-Host "Finalizing executable..." -ForegroundColor Yellow
if (Test-Path $OutputExe) {
  Remove-Item $OutputExe -Force
}
Move-Item $tempExeName $OutputExe
Write-Host "SEA injection completed: $OutputExe" -ForegroundColor Green


