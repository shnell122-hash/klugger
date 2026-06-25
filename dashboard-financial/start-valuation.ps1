# Launcher for the Cimatario Valuacion Dashboard
# Run this in PowerShell (where your normal Node/npm is available)
# Includes PATH injection for cases where Node was not added to system PATH.

$ErrorActionPreference = "Stop"

Write-Host "=== Starting Klugger Valuacion Dashboard ===" -ForegroundColor Cyan

$dir = "C:\Users\noela\klugger\dashboard-financial"
Set-Location $dir

# Fallback: force standard Node installation path into PATH (same logic as .bat)
$nodeDir = "C:\Program Files\nodejs"
if (Test-Path "$nodeDir\node.exe") {
    $env:PATH = "$nodeDir;" + $env:PATH
    Write-Host "Node path injected from $nodeDir" -ForegroundColor Yellow
}

# Verify node/npm available
$nodeCmd = if (Get-Command node -ErrorAction SilentlyContinue) { "node" } else { "$nodeDir\node.exe" }
$npmCmd  = if (Get-Command npm -ErrorAction SilentlyContinue) { "npm" } else { "$nodeDir\npm.cmd" }

try {
    & $nodeCmd --version | Out-Null
    & $npmCmd --version | Out-Null
    Write-Host "Node y npm detectados correctamente." -ForegroundColor Green
} catch {
    Write-Host "[ERROR] No se encontró Node.js / npm en PATH ni en $nodeDir" -ForegroundColor Red
    Write-Host "SOLUCION: Instala Node.js LTS desde https://nodejs.org/ marcando 'Add to PATH'." -ForegroundColor Yellow
    Read-Host "Presiona Enter para salir"
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "node_modules not found. Running npm install (puede tardar)..." -ForegroundColor Yellow
    & $npmCmd install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: npm install falló." -ForegroundColor Red
        Read-Host "Presiona Enter para salir"
        exit 1
    }
}

Write-Host "Starting Next.js dev server on port 3020..." -ForegroundColor Green
Write-Host "Once ready, open in Chrome: http://localhost:3020/valuacion-cimatario" -ForegroundColor White

# Use full path for npm to be safe
& $npmCmd run dev

# Keep window open
Read-Host "Presiona Enter para salir (el servidor se detendrá)..."