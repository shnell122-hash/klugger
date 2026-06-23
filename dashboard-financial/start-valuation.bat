@echo off
echo ===============================================
echo   Iniciando Valuacion Dashboard - Cimatario
echo ===============================================

cd /d "C:\Users\noela\klugger\dashboard-financial"

echo.
echo Verificando Node.js / npm...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] No se encontro 'node' ni 'npm' en tu sistema.
    echo.
    echo SOLUCION:
    echo 1. Instala Node.js desde: https://nodejs.org/ (version LTS)
    echo 2. Durante la instalacion, marca "Add to PATH"
    echo 3. Cierra y vuelve a abrir esta ventana de comandos
    echo 4. Ejecuta este .bat otra vez (o doble clic)
    echo.
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm no esta disponible.
    echo Por favor instala Node.js correctamente (incluyendo PATH).
    pause
    exit /b 1
)

echo Node y npm detectados correctamente.
echo.

echo Verificando si existe node_modules...
if not exist "node_modules" (
    echo node_modules no existe. Ejecutando npm install (puede tardar)...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install fallo.
        echo Asegurate de tener Node.js instalado correctamente.
        echo Descarga desde: https://nodejs.org/
        pause
        exit /b 1
    )
)

echo.
echo Levantando servidor Next.js en puerto 3020...
echo.
echo Cuando veas "Ready" o "Local: http://localhost:3020", abre en Chrome:
echo http://localhost:3020/valuacion-cimatario
echo.
call npm run dev

pause
echo Servidor detenido.