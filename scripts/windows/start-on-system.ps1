#!/usr/bin/env pwsh
# Start ChallaChat using system Node.js and dependencies
# Runs directly from source without building executables

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
  if (-not (Test-Path "node_modules")) {
    Write-Host "Dependencies not found. Installing..." -ForegroundColor Yellow
    Run "npm install"
  } else {
    Write-Host "Dependencies found." -ForegroundColor Green
  }
}

function Start-Application {
  Write-Host "Starting ChallaChat..." -ForegroundColor Green
  Write-Host "Compiling TypeScript and running the application" -ForegroundColor Cyan
  Write-Host ""
  
  # Build the TypeScript
  Write-Host "Compiling TypeScript..." -ForegroundColor Yellow
  Run "npm run build"
  
  Write-Host ""
  Write-Host "The app will be available at:" -ForegroundColor Yellow
  Write-Host "  http://localhost:3000" -ForegroundColor White
  Write-Host ""
  Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
  Write-Host ""
  
  # Run the compiled version
  Run "npm start"
}

# Main script
Write-Header "ChallaChat - System Start"

# Check system requirements
Write-Host "Checking system requirements..." -ForegroundColor Yellow
Check-NodeVersion
Check-Dependencies

Write-Host ""
Start-Application
