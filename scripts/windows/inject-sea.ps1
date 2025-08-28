#!/usr/bin/env pwsh
# PowerShell script to inject SEA blob into Node.js binary
# Creates a Windows executable using Node.js Single Executable Applications

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

# Ensure build directory exists
if (-not (Test-Path "build")) {
  New-Item -ItemType Directory -Path "build" | Out-Null
}

# Copy node.exe to create our base executable
Write-Host "Creating base executable from Node.js binary..." -ForegroundColor Yellow
$nodeExePath = (Get-Command node).Source
Copy-Item -Path $nodeExePath -Destination "build/challachat.exe" -Force

# Remove signature from the executable (Windows)
Write-Host "Removing signature from executable..." -ForegroundColor Yellow
try {
  # Try to remove signature using signtool if available
  Run "signtool remove /s build/challachat.exe"
  Write-Host "Signature removed with signtool" -ForegroundColor Green
} catch {
  Write-Host "signtool not available, skipping signature removal (this is optional)" -ForegroundColor Yellow
}

# Inject the SEA blob using postject
Write-Host "Injecting SEA blob into executable..." -ForegroundColor Yellow
$postjectCmd = "npx postject build/challachat.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
Run $postjectCmd

# Apply icon to the executable
$exePath = Join-Path $RootDir 'build/challachat.exe'
$icoPath = Join-Path $RootDir 'overlay/favicon.ico'

if ((Test-Path $exePath) -and (Test-Path $icoPath)) {
  Write-Host "Applying icon to challachat.exe..." -ForegroundColor Cyan
  try {
    # Use rcedit directly through Node.js
    $rceditScript = @"
const rcedit = require('rcedit');
rcedit('$($exePath.Replace('\', '\\'))', { icon: '$($icoPath.Replace('\', '\\'))' })
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
    Write-Host "Icon successfully applied to challachat.exe" -ForegroundColor Green
  } catch {
    Write-Warning "Failed to apply icon: $($_.Exception.Message)"
  }
} else {
  if (-not (Test-Path $exePath)) {
    Write-Warning "Executable not found at: $exePath"
  }
  if (-not (Test-Path $icoPath)) {
    Write-Warning "Icon file not found at: $icoPath"
  }
}

# Clean up intermediate webpack files
Write-Host "Cleaning up intermediate files..." -ForegroundColor Yellow
Get-ChildItem -Path "build" -Name "*.server-bundled.js" | ForEach-Object {
  if ($_ -ne "server-bundled.js") {
    Remove-Item -Path "build/$_" -Force -ErrorAction SilentlyContinue
  }
}

# Create README for the build
$readme = @(
  'ChallaChat - YouTube Live Chat Overlay',
  '========================================',
  '',
  'Built with Node.js 24 Single Executable Applications (SEA)',
  '',
  'Usage:',
  '  1. Run challachat.exe',
  '  2. Paste a YouTube livestream URL when prompted',
  '  3. Add a Browser Source in OBS pointing to http://localhost:3000/',
  '',
  'Requirements:',
  '  - Chrome or Edge browser installed on the system',
  '  - Internet connection for YouTube access',
  '',
  'Features:',
  '  - Self-contained executable (no Node.js installation required)',
  '  - All static assets embedded in the executable',
  '  - Automatic port detection if 3000 is in use',
  '',
  'Default port: 3000',
  'If port 3000 is in use, the app will automatically try the next available port.',
  '',
  'Generated with Node.js 24 SEA and postject',
  ''
) -join "`r`n"

Set-Content -Path "build/README.txt" -Value $readme -Encoding ASCII

# Clean up intermediate files
Write-Host "Cleaning up intermediate files..." -ForegroundColor Yellow
if (Test-Path "sea-prep.blob") {
  Remove-Item "sea-prep.blob" -Force
  Write-Host "Removed sea-prep.blob" -ForegroundColor DarkGray
}
if (Test-Path "server-bundled.js") {
  Remove-Item "server-bundled.js" -Force
  Write-Host "Removed server-bundled.js" -ForegroundColor DarkGray
}
# Clean up any webpack chunk files that might be left in root
Get-ChildItem -Path "." -Name "*.server-bundled.js" | ForEach-Object {
  Remove-Item -Path $_ -Force -ErrorAction SilentlyContinue
  Write-Host "Removed $_" -ForegroundColor DarkGray
}

Write-Host "" -ForegroundColor Green
Write-Host "SEA build complete!" -ForegroundColor Green
Write-Host "Build artifacts:" -ForegroundColor Green
Write-Host "  - challachat.exe (self-contained executable with Node.js 24)" -ForegroundColor White
Write-Host "  - README.txt (usage instructions)" -ForegroundColor White
Write-Host "" -ForegroundColor Green
Write-Host "File size: $((Get-Item 'build/challachat.exe').Length / 1MB) MB" -ForegroundColor Yellow
Write-Host "To run: .\build\challachat.exe" -ForegroundColor Yellow
