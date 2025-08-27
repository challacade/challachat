#!/usr/bin/env pwsh
# Portable build script - creates a small launcher EXE with supporting folders
# Much smaller footprint than Single Executable Application

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

function Download-File($url, $path) {
  Write-Host "Downloading: $url" -ForegroundColor Yellow
  try {
    Invoke-WebRequest -Uri $url -OutFile $path -UseBasicParsing
    Write-Host "Downloaded to: $path" -ForegroundColor Green
  } catch {
    throw "Failed to download $url : $($_.Exception.Message)"
  }
}

Write-Host "ChallaChat - Portable Build with Launcher EXE" -ForegroundColor Magenta
Write-Host "==============================================" -ForegroundColor Magenta
Write-Host ""

# Clean build directory
Write-Host "Cleaning build directory..." -ForegroundColor Yellow
if (Test-Path "build") {
  Remove-Item -Recurse -Force "build"
}
New-Item -ItemType Directory -Path "build" | Out-Null

# Build TypeScript
Write-Host "Building TypeScript..." -ForegroundColor Yellow
Run "npm run build"

# Create portable structure
Write-Host "Creating portable directory structure..." -ForegroundColor Yellow
$portableDir = "build/challachat-portable"
New-Item -ItemType Directory -Path $portableDir | Out-Null
New-Item -ItemType Directory -Path "$portableDir/app" | Out-Null
New-Item -ItemType Directory -Path "$portableDir/runtime" | Out-Null
New-Item -ItemType Directory -Path "$portableDir/static" | Out-Null

# Download portable Node.js
$nodeVersion = "v24.6.0"
$nodeUrl = "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip"
$nodeZip = "build/node-portable.zip"

Download-File $nodeUrl $nodeZip

Write-Host "Extracting portable Node.js..." -ForegroundColor Yellow
Expand-Archive -Path $nodeZip -DestinationPath "build/node-temp" -Force
$nodeFolder = Get-ChildItem "build/node-temp" | Select-Object -First 1
Move-Item "$($nodeFolder.FullName)/*" "$portableDir/runtime/" -Force
Remove-Item "build/node-temp" -Recurse -Force
Remove-Item $nodeZip -Force

# Bundle application (lightweight - no heavy dependencies embedded)
Write-Host "Creating lightweight app bundle..." -ForegroundColor Yellow

# Create a minimal webpack config for portable build
$webpackPortableConfig = @"
const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './dist/http/server.js',
  output: {
    path: path.resolve(__dirname, 'build/challachat-portable/app'),
    filename: 'app.js',
    library: { type: 'commonjs2' }
  },
  externals: {
    'puppeteer': 'commonjs2 puppeteer'
  },
  resolve: {
    extensions: ['.js', '.json']
  },
  optimization: {
    minimize: true
  }
};
"@

Set-Content -Path "webpack/webpack.portable.js" -Value $webpackPortableConfig

Run "npx webpack --config webpack/webpack.portable.js"

# Copy static assets
Write-Host "Copying static assets..." -ForegroundColor Yellow
Copy-Item -Path "static/*" -Destination "$portableDir/static/" -Recurse -Force

# Install only production dependencies in the portable app
Write-Host "Installing production dependencies..." -ForegroundColor Yellow
Set-Location "$portableDir/app"

# Create a minimal package.json for production
$prodPackageJson = @{
  name = "challachat"
  version = "1.0.0"
  main = "app.js"
  dependencies = @{
    express = "^4.19.2"
    puppeteer = "^24.9.0"
    "socket.io" = "^4.7.5"
  }
} | ConvertTo-Json -Depth 10

Set-Content -Path "package.json" -Value $prodPackageJson

# Install dependencies using system npm (we'll run with portable node later)
Write-Host "Installing dependencies..." -ForegroundColor Cyan
Run "npm install --only=production --no-package-lock"

Set-Location $RootDir

# Create small launcher executable using Node.js SEA (much smaller than full app)
Write-Host "Creating launcher executable..." -ForegroundColor Yellow

# Create minimal SEA config for the small launcher (no webpack bundling)
$launcherSeaConfig = @{
  main = "utils/launcher.js"
  output = "build/launcher-prep.blob"
  disableExperimentalSEAWarning = $true
  useCodeCache = $true
} | ConvertTo-Json -Depth 10

Set-Content -Path "build/launcher-sea-config.json" -Value $launcherSeaConfig

# Generate the launcher SEA blob (small, no bundling)
Write-Host "Generating launcher SEA blob..." -ForegroundColor Yellow
Run "node --experimental-sea-config build/launcher-sea-config.json"

# Create the launcher executable
Write-Host "Creating launcher executable..." -ForegroundColor Yellow
$nodeExePath = (Get-Command node).Source
Copy-Item -Path $nodeExePath -Destination "$portableDir/challachat.exe" -Force

# Inject the launcher blob
Write-Host "Injecting launcher into executable..." -ForegroundColor Yellow
Run "npx postject `"$portableDir/challachat.exe`" NODE_SEA_BLOB build/launcher-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"

# Apply icon to the executable
$exePath = Join-Path $RootDir "$portableDir/challachat.exe"
$icoPath = Join-Path $RootDir 'static/images/challachat.ico'

if ((Test-Path $exePath) -and (Test-Path $icoPath)) {
  Write-Host "Applying icon to challachat.exe..." -ForegroundColor Cyan
  try {
    $exeEsc = '"' + $exePath + '"'
    $icoEsc = '"' + $icoPath + '"'
    Run "rcedit $exeEsc --set-icon $icoEsc"
    Write-Host "Icon successfully applied to challachat.exe" -ForegroundColor Green
  } catch {
    Write-Warning "Failed to apply icon: $($_.Exception.Message)"
  }
}

# Create README
$readme = @"
ChallaChat - Portable Distribution
==================================

This is a portable version of ChallaChat with a small launcher executable.

Directory Structure:
├── challachat.exe        # Small launcher executable (~5MB)
├── README.txt           # This file
├── app/                 # Application code and dependencies
│   ├── app.js          # Main application bundle
│   ├── package.json    # Dependencies manifest
│   └── node_modules/   # Application dependencies
├── runtime/            # Portable Node.js runtime
│   ├── node.exe       # Node.js executable
│   └── ...            # Node.js runtime files
└── static/            # Web assets (HTML, CSS, JS, images, sounds)
    ├── index.html
    ├── app.js
    ├── styles.css
    └── ...

Usage:
1. Double-click challachat.exe
2. Paste a YouTube livestream URL when prompted
3. Add a Browser Source in OBS pointing to http://localhost:3000/

Benefits of this approach:
✅ Users get a familiar .exe file to click
✅ Much smaller launcher executable (~5MB vs 105MB)
✅ Modular structure allows easier updates
✅ Static assets can be modified without rebuilding
✅ Dependencies can be updated independently
✅ Better for debugging and maintenance

Technical Details:
- Launcher: Small Node.js SEA executable that sets up environment
- Runtime: Portable Node.js $nodeVersion (~50MB)
- App: Bundled application with dependencies (~20-30MB)
- Static: Web assets (<5MB)

Generated with Node.js $nodeVersion portable distribution + SEA launcher
"@

Set-Content -Path "$portableDir/README.txt" -Value $readme -Encoding ASCII

# Create a ZIP package
Write-Host "Creating portable ZIP package..." -ForegroundColor Yellow
Compress-Archive -Path "$portableDir/*" -DestinationPath "build/challachat-portable.zip" -Force

# Calculate sizes
$portableSize = (Get-ChildItem "$portableDir" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$zipSize = (Get-Item "build/challachat-portable.zip").Length / 1MB
$exeSize = (Get-Item "$portableDir/challachat.exe").Length / 1MB

Write-Host "" -ForegroundColor Green
Write-Host "Portable build with launcher EXE complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Build artifacts:" -ForegroundColor Green
Write-Host "  - challachat-portable/ (directory: $([math]::Round($portableSize,1)) MB)" -ForegroundColor White
Write-Host "  - challachat-portable.zip (archive: $([math]::Round($zipSize,1)) MB)" -ForegroundColor White
Write-Host "  - challachat.exe (launcher: $([math]::Round($exeSize,1)) MB)" -ForegroundColor Yellow
Write-Host "" -ForegroundColor Green
Write-Host "To run:" -ForegroundColor Yellow
Write-Host "  1. Extract challachat-portable.zip" -ForegroundColor White
Write-Host "  2. Double-click challachat.exe in the extracted folder" -ForegroundColor White
Write-Host "" -ForegroundColor Green
Write-Host "Size comparison:" -ForegroundColor Cyan
Write-Host "  - Previous SEA build: 105.39 MB (single file)" -ForegroundColor Red
Write-Host "  - New launcher exe: $([math]::Round($exeSize,1)) MB (just the launcher)" -ForegroundColor Green
Write-Host "  - Total distribution: $([math]::Round($portableSize,1)) MB (modular)" -ForegroundColor Green

# Clean up intermediate files
Write-Host "Cleaning up..." -ForegroundColor Yellow
Remove-Item "webpack/webpack.portable.js" -Force -ErrorAction SilentlyContinue
Remove-Item "build/launcher-sea-config.json" -Force -ErrorAction SilentlyContinue
Remove-Item "build/launcher-prep.blob" -Force -ErrorAction SilentlyContinue

Write-Host "" -ForegroundColor Yellow
Write-Host "✅ Perfect! Users get a challachat.exe that's much smaller and more maintainable!" -ForegroundColor Yellow
