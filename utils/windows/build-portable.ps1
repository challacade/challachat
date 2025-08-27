#!/usr/bin/env pwsh
# Portable SEA build - modular executable with external assets and dependencies
# Creates challachat.exe next to supporting folders (static/, node_modules/)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)
Set-Location -Path $RootDir

function Run($cmd) {
  Write-Host "Running: $cmd" -ForegroundColor Cyan
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -NoNewWindow -Wait -PassThru
  if ($p.ExitCode -ne 0) { 
    throw "Command failed with exit code $($p.ExitCode): $cmd" 
  }
}
Write-Host "=================================" -ForegroundColor Magenta
Write-Host " ChallaChat - Portable SEA Build" -ForegroundColor Magenta
Write-Host "=================================" -ForegroundColor Magenta
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

# Create optimized structure
Write-Host "Creating optimized directory structure..." -ForegroundColor Yellow
$buildDir = "build/challachat-portable"
New-Item -ItemType Directory -Path $buildDir | Out-Null
New-Item -ItemType Directory -Path "$buildDir/node_modules" | Out-Null
New-Item -ItemType Directory -Path "$buildDir/static" | Out-Null

# Create optimized webpack config that externalizes ALL dependencies except core modules
Write-Host "Creating optimized app bundle..." -ForegroundColor Yellow
$webpackOptimizedConfig = @"
const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './dist/http/server.js',
  output: {
    path: path.resolve(__dirname, '..', 'build'),
    filename: 'app-bundled.js',
    library: { type: 'commonjs2' }
  },
  externals: {
    // Externalize ALL dependencies to keep the executable smaller
    'puppeteer': 'commonjs2 puppeteer',
    'puppeteer-core': 'commonjs2 puppeteer-core',
    'ws': 'commonjs2 ws',
    'chrome-launcher': 'commonjs2 chrome-launcher',
    'express': 'commonjs2 express',
    'socket.io': 'commonjs2 socket.io',
    'iconv-lite': 'commonjs2 iconv-lite'
  },
  resolve: {
    extensions: ['.js', '.json']
  },
  optimization: {
    minimize: true
  },
  node: {
    __dirname: false,
    __filename: false
  }
};
"@

Set-Content -Path "webpack/webpack.portable.js" -Value $webpackOptimizedConfig
Run "npx webpack --config webpack/webpack.portable.js"

# Copy static assets
Write-Host "Copying static assets..." -ForegroundColor Yellow
Copy-Item -Path "static/*" -Destination "$buildDir/static/" -Recurse -Force

# Install only the heavy external dependencies in node_modules
Write-Host "Installing external dependencies..." -ForegroundColor Yellow
Set-Location "$buildDir"

$externalPackageJson = @{
  name = "challachat-externals"
  version = "1.0.0"
  private = $true
  dependencies = @{
    puppeteer = "^24.9.0"
    express = "^4.19.2"
    "socket.io" = "^4.7.5"
  }
} | ConvertTo-Json -Depth 10

Set-Content -Path "package.json" -Value $externalPackageJson
Run "npm install --only=production --no-package-lock"
Remove-Item "package.json" -Force

Set-Location $RootDir

# Create the main launcher script that will be embedded in SEA
$mainLauncher = @"
/**
 * ChallaChat - Optimized SEA Launcher
 * Embedded in the executable, loads external dependencies
 */

const path = require('path');
const fs = require('fs');

// Get the directory where this executable is located
const exeDir = path.dirname(process.execPath);
const staticDir = path.join(exeDir, 'static');
const nodeModulesDir = path.join(exeDir, 'node_modules');

// Set up environment
process.env.CHALLACHAT_STATIC_DIR = staticDir;
process.env.CHALLACHAT_PORTABLE = 'true';
process.env.NODE_PATH = nodeModulesDir;

console.log('🚀 Starting ChallaChat (Optimized SEA)...');
console.log('📁 Executable directory:', exeDir);
console.log('🌐 Static assets:', staticDir);
console.log('📦 External modules:', nodeModulesDir);
console.log('');

// Check if required directories exist
const requiredDirs = [staticDir, nodeModulesDir];
for (const dir of requiredDirs) {
  if (!fs.existsSync(dir)) {
    console.error('❌ Error: Required directory not found:', dir);
    console.error('Make sure you have extracted the complete ChallaChat distribution.');
    process.exit(1);
  }
}

// Add node_modules to the require resolution path
const originalResolve = require.resolve;
require.resolve = function(id, options) {
  // For non-core modules, check our external node_modules first
  if (!id.startsWith('node:') && !id.startsWith('.') && !id.startsWith('/')) {
    try {
      return originalResolve(id, {
        ...options,
        paths: [nodeModulesDir, ...(options && options.paths || [])]
      });
    } catch (e) {
      // Fall back to original resolution
    }
  }
  return originalResolve(id, options);
};

// Load and start the bundled application from SEA assets
try {
  const sea = require('node:sea');
  if (sea && sea.isSea && sea.isSea()) {
    // We're running in SEA mode - load the embedded app
    console.log('📦 Loading embedded application...');
    const appCode = sea.getAsset('app-bundled.js', 'utf8');
    
    // Set up proper context for the bundled app
    const Module = require('module');
    const vm = require('vm');
    
    // Create a new module for our app
    const appModule = new Module('app-bundled.js', null);
    appModule.filename = path.join(exeDir, 'app-bundled.js');
    appModule.paths = Module._nodeModulePaths(exeDir);
    appModule.paths.unshift(nodeModulesDir);
    
    // Set up the context
    const context = vm.createContext({
      require: appModule.require.bind(appModule),
      module: appModule,
      exports: appModule.exports,
      __dirname: exeDir,
      __filename: appModule.filename,
      process: process,
      console: console,
      global: global,
      Buffer: Buffer,
      setTimeout: setTimeout,
      setInterval: setInterval,
      clearTimeout: clearTimeout,
      clearInterval: clearInterval,
      setImmediate: setImmediate,
      clearImmediate: clearImmediate
    });
    
    vm.runInContext(appCode, context, { filename: appModule.filename });
    
  } else {
    // Fallback for non-SEA mode
    console.error('❌ This should only run in SEA mode');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Failed to start ChallaChat:', error.message);
  console.error(error.stack);
  process.exit(1);
}
"@

Set-Content -Path "build/sea-main.js" -Value $mainLauncher

# Create SEA config
$seaConfig = @{
  main = "build/sea-main.js"
  output = "build/sea-prep.blob"
  disableExperimentalSEAWarning = $true
  useCodeCache = $true
  assets = @{
    "app-bundled.js" = "build/app-bundled.js"
  }
} | ConvertTo-Json -Depth 10

Set-Content -Path "build/sea-config.json" -Value $seaConfig

# Generate SEA blob
Write-Host "Generating optimized SEA blob..." -ForegroundColor Yellow
Run "node --experimental-sea-config build/sea-config.json"

# Create the executable
Write-Host "Creating optimized executable..." -ForegroundColor Yellow
$nodeExePath = (Get-Command node).Source
Copy-Item -Path $nodeExePath -Destination "$buildDir/challachat.exe" -Force

# Inject the SEA blob
Write-Host "Injecting optimized app into executable..." -ForegroundColor Yellow
Run "npx postject `"$buildDir/challachat.exe`" NODE_SEA_BLOB build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"

# Apply icon
$exePath = Join-Path $RootDir "$buildDir/challachat.exe"
$icoPath = Join-Path $RootDir 'static/images/challachat.ico'

if ((Test-Path $exePath) -and (Test-Path $icoPath)) {
  Write-Host "Applying icon to challachat.exe..." -ForegroundColor Cyan
  try {
    $exeEsc = '"' + $exePath + '"'
    $icoEsc = '"' + $icoPath + '"'
    Run "rcedit $exeEsc --set-icon $icoEsc"
    Write-Host "Icon successfully applied" -ForegroundColor Green
  } catch {
    Write-Warning "Failed to apply icon (rcedit not available)"
  }
}

# Create README
$readme = @"
=======================================
ChallaChat - Optimized SEA Distribution
=======================================

This is an optimized version using Node.js 24 Single Executable Application.

Directory Structure:
├── challachat.exe        # Optimized executable (~85MB)
├── README.txt           # This file  
├── node_modules/        # External dependencies (~30-40MB)
│   ├── puppeteer/
│   ├── express/
│   └── socket.io/
└── static/             # Web assets (~5MB)
    ├── index.html
    ├── app.js
    ├── styles.css
    └── images/

Usage:
1. Double-click challachat.exe
2. Paste a YouTube livestream URL when prompted
3. Add a Browser Source in OBS pointing to http://localhost:3000/

Benefits:
✅ Single executable with Node.js runtime built-in
✅ External dependencies for smaller executable
✅ Static assets separate for easy customization
✅ Much smaller than full SEA (85MB vs 105MB)
✅ No separate Node.js runtime folder needed

Total size: ~120-130MB (vs original 105MB single file, but modular)
"@

Set-Content -Path "$buildDir/README.txt" -Value $readme -Encoding ASCII

# Calculate sizes
$optimizedSize = (Get-ChildItem "$buildDir" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$exeSize = (Get-Item "$buildDir/challachat.exe").Length / 1MB
$nodeModulesSize = (Get-ChildItem "$buildDir/node_modules" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$staticSize = (Get-ChildItem "$buildDir/static" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB

Write-Host "" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Green
Write-Host "Portable SEA build complete!" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Green
Write-Host "" -ForegroundColor Yellow
Write-Host "build/challachat-portable (directory: $([math]::Round($optimizedSize,1)) MB)" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Yellow

# Clean up
Write-Host "Cleaning up..." -ForegroundColor Yellow
Remove-Item "webpack/webpack.portable.js" -Force -ErrorAction SilentlyContinue
Remove-Item "app-bundled.js" -Force -ErrorAction SilentlyContinue
Remove-Item "build/sea-config.json" -Force -ErrorAction SilentlyContinue
Remove-Item "build/sea-prep.blob" -Force -ErrorAction SilentlyContinue
Remove-Item "build/sea-main.js" -Force -ErrorAction SilentlyContinue
Remove-Item "build/app-bundled.js" -Force -ErrorAction SilentlyContinue

Write-Host "Done!" -ForegroundColor Yellow
