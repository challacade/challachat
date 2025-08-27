#!/usr/bin/env pwsh
# Package folders into ZIP archives
# Usage: ./package-zip.ps1 -SourcePath <path> -OutputPath <path> [-Overwrite]

param(
    [Parameter(Mandatory=$true)]
    [string]$SourcePath,
    
    [Parameter(Mandatory=$true)]
    [string]$OutputPath,
    
    [switch]$Overwrite
)

$ErrorActionPreference = 'Stop'

function Write-Header($text) {
  Write-Host ""
  Write-Host $text -ForegroundColor Magenta
  Write-Host ("=" * $text.Length) -ForegroundColor Magenta
  Write-Host ""
}

function Format-FileSize($bytes) {
    if ($bytes -ge 1GB) {
        return "{0:N1} GB" -f ($bytes / 1GB)
    } elseif ($bytes -ge 1MB) {
        return "{0:N1} MB" -f ($bytes / 1MB)
    } elseif ($bytes -ge 1KB) {
        return "{0:N1} KB" -f ($bytes / 1KB)
    } else {
        return "$bytes bytes"
    }
}

Write-Header "ChallaChat - Package ZIP"

# Validate source path
if (-not (Test-Path $SourcePath)) {
    Write-Host "ERROR: Source path does not exist: $SourcePath" -ForegroundColor Red
    exit 1
}

# Get absolute paths
$SourcePath = Resolve-Path $SourcePath
$OutputDir = Split-Path $OutputPath -Parent
$OutputFile = Split-Path $OutputPath -Leaf

# Create output directory if it doesn't exist
if ($OutputDir -and -not (Test-Path $OutputDir)) {
    Write-Host "Creating output directory: $OutputDir" -ForegroundColor Yellow
    New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null
}

# Check if output file exists
if (Test-Path $OutputPath) {
    if ($Overwrite) {
        Write-Host "Overwriting existing file: $OutputPath" -ForegroundColor Yellow
        Remove-Item $OutputPath -Force
    } else {
        Write-Host "ERROR: Output file already exists: $OutputPath" -ForegroundColor Red
        Write-Host "Use -Overwrite to replace existing file" -ForegroundColor Yellow
        exit 1
    }
}

# Calculate source size
Write-Host "Analyzing source directory..." -ForegroundColor Cyan
$sourceItems = Get-ChildItem $SourcePath -Recurse
$sourceSize = ($sourceItems | Measure-Object -Property Length -Sum).Sum
$sourceFileCount = ($sourceItems | Where-Object { -not $_.PSIsContainer }).Count
$sourceFolderCount = ($sourceItems | Where-Object { $_.PSIsContainer }).Count

Write-Host "Source: $SourcePath" -ForegroundColor White
Write-Host "  Files: $sourceFileCount" -ForegroundColor Gray
Write-Host "  Folders: $sourceFolderCount" -ForegroundColor Gray
Write-Host "  Size: $(Format-FileSize $sourceSize)" -ForegroundColor Gray

# Create ZIP archive
Write-Host ""
Write-Host "Creating ZIP archive..." -ForegroundColor Yellow
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

try {
    if (Test-Path $SourcePath -PathType Container) {
        # Source is a directory - compress its contents
        Compress-Archive -Path "$SourcePath\*" -DestinationPath $OutputPath -Force
    } else {
        # Source is a file - compress the file itself
        Compress-Archive -Path $SourcePath -DestinationPath $OutputPath -Force
    }
    
    $stopwatch.Stop()
    
    # Calculate output size and compression ratio
    $outputSize = (Get-Item $OutputPath).Length
    $compressionRatio = [math]::Round((1 - ($outputSize / $sourceSize)) * 100, 1)
    
    Write-Host ""
    Write-Host "✅ ZIP package created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Output: $OutputPath" -ForegroundColor White
    Write-Host "  Archive size: $(Format-FileSize $outputSize)" -ForegroundColor Gray
    Write-Host "  Compression: $compressionRatio% reduction" -ForegroundColor Gray
    Write-Host "  Time taken: $($stopwatch.Elapsed.TotalSeconds.ToString('F1')) seconds" -ForegroundColor Gray
    
} catch {
    Write-Host ""
    Write-Host "❌ Failed to create ZIP archive" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Package operation complete!" -ForegroundColor Green
