# Launcher for the Cimatario Valuacion Dashboard
# Run this in PowerShell (where your normal Node/npm is available)

$ErrorActionPreference = "Stop"

Write-Host "=== Starting Klugger Valuacion Dashboard ===" -ForegroundColor Cyan

$dir = "C:\Users\noela\klugger\dashboard-financial"
Set-Location $dir

if (-not (Test-Path "node_modules")) {
    Write-Host "node_modules not found. Running npm install..." -ForegroundColor Yellow
    npm install
}

Write-Host "Starting Next.js dev server on port 3020..." -ForegroundColor Green
Write-Host "Once ready, open in Chrome: http://localhost:3020/valuacion-cimatario" -ForegroundColor White

npm run dev

# Keep window open if needed
Read-Host "Press Enter to exit (server will stop)..."