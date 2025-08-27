#!/usr/bin/env pwsh
# ChallaChat Release Builder (ASCII-safe)
# Builds portable distribution and packages it into a ZIP.

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

function Write-Header($text) {
    Write-Host ""
    Write-Host $text -ForegroundColor Magenta
    Write-Host ("=" * $text.Length) -ForegroundColor Magenta
    Write-Host ""
}

function Format-FileSize($bytes) {
    if ($bytes -ge 1GB) { return "{0:N1} GB" -f ($bytes / 1GB) }
    elseif ($bytes -ge 1MB) { return "{0:N1} MB" -f ($bytes / 1MB) }
    elseif ($bytes -ge 1KB) { return "{0:N1} KB" -f ($bytes / 1KB) }
    else { return "$bytes bytes" }
}

Write-Header "ChallaChat - Release Builder"

Write-Host "Building all release artifacts..." -ForegroundColor Green
Write-Host "Working directory: $RootDir" -ForegroundColor Gray
Write-Host ""

# Clean any previous builds
Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
Remove-Item "build/challachat-portable" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "build/challachat-portable.zip" -Force -ErrorAction SilentlyContinue

# Build portable distribution
Write-Header "Building Portable Distribution"
Write-Host "Creating modular SEA build with external dependencies..." -ForegroundColor Cyan

try {
    & "$ScriptDir\build-portable.ps1"
    Write-Host "Portable build completed successfully" -ForegroundColor Green
} catch {
    Write-Host "Portable build failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Package portable distribution
Write-Header "Packaging Portable Distribution"
Write-Host "Creating ZIP archive of portable build..." -ForegroundColor Cyan

try {
    & "$ScriptDir\package-zip.ps1" -SourcePath "build/challachat-portable" -OutputPath "build/challachat-portable.zip" -Overwrite
    Write-Host "Portable packaging completed successfully" -ForegroundColor Green
} catch {
    Write-Host "Portable packaging failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Summary
Write-Header "Release Build Summary"

$artifacts = @()

if (Test-Path "build/challachat-portable") {
    $portableSize = (Get-ChildItem "build/challachat-portable" -Recurse | Measure-Object -Property Length -Sum).Sum
    $artifacts += [PSCustomObject]@{
        Name = "challachat-portable/"
        Type = "Directory"
        Size = Format-FileSize $portableSize
        Path = "build/challachat-portable"
    }
}

if (Test-Path "build/challachat-portable.zip") {
    $zipSize = (Get-Item "build/challachat-portable.zip").Length
    $artifacts += [PSCustomObject]@{
        Name = "challachat-portable.zip"
        Type = "Archive"
        Size = Format-FileSize $zipSize
        Path = "build/challachat-portable.zip"
    }
}

if ($artifacts.Count -gt 0) {
    Write-Host "Release artifacts created:" -ForegroundColor Green
    Write-Host ""
    foreach ($artifact in $artifacts) {
        Write-Host "  Name: $($artifact.Name)" -ForegroundColor White
        Write-Host "    Type: $($artifact.Type)" -ForegroundColor Gray
        Write-Host "    Size: $($artifact.Size)" -ForegroundColor Gray
        Write-Host "    Path: $($artifact.Path)" -ForegroundColor Gray
        Write-Host ""
    }
} else {
    Write-Host "No release artifacts were created" -ForegroundColor Red
    exit 1
}

Write-Host "Release build completed successfully" -ForegroundColor Green
Write-Host ""
Write-Host "Ready for distribution:" -ForegroundColor Cyan
Write-Host "  - Portable build: build/challachat-portable/" -ForegroundColor White
Write-Host "  - ZIP archive: build/challachat-portable.zip" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  - Upload to GitHub Releases" -ForegroundColor White
Write-Host "  - Update distribution channels" -ForegroundColor White
Write-Host "  - Notify users of new version" -ForegroundColor White

