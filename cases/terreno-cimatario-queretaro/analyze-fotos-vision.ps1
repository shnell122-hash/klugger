# Script para usar Gemini Flash (como el VisionAgent del proyecto) en las imágenes de fotos/
# Todo dentro del repo klugger. Genera markdown con descripciones detalladas.
# Uso: powershell -File cases/terreno-cimatario-queretaro/analyze-fotos-vision.ps1

$ErrorActionPreference = "Stop"

# Cargar .env del root de klugger
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

$key = $env:GOOGLE_API_KEY
if (-not $key) {
    Write-Error "No GOOGLE_API_KEY found in .env"
    exit 1
}

$imagesDir = Join-Path $PSScriptRoot "images"
if (-not (Test-Path $imagesDir)) {
    # Fallback si las imágenes están en fotos/ del root
    $imagesDir = Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) "fotos"
}

$images = Get-ChildItem $imagesDir -Filter *.jpg
if ($images.Count -eq 0) {
    Write-Error "No images found in $imagesDir"
    exit 1
}

$md = @"
# Análisis de Imágenes con Vision Agent (Gemini Flash)

**Caso**: Terreno en Cimatario, Querétaro (660 m² para desarrollo)
**Generado**: $(Get-Date -Format 'yyyy-MM-dd HH:mm')
**Fuente**: Imágenes de los links proporcionados (listing Pincali + FB/IG)
**Agente**: Equivalente al VisionAgent del proyecto (financialbot/agents/vision-agent.js) usando Gemini 2.0 Flash vía API directa para descripciones detalladas orientadas a estudio de mercado y marketing.

Todas las imágenes procesadas con prompt adaptado para extraer:
- Apariencia y estado del terreno
- Entorno y ubicación
- Potencial de desarrollo (visual para multifamiliar, COS/CUS implícito)
- Calidad para marketing
- Detalles relevantes (accesos, vistas, etc.)

"@

foreach ($img in $images) {
    Write-Host "Procesando $($img.Name) con Gemini Flash..."
    $base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($img.FullName))
    
    $prompt = "Analiza esta imagen de un terreno en venta en Cimatario, Querétaro, México para un estudio de mercado inmobiliario y proyecto de marketing. Describe en detalle y de forma estructurada: 1. Apariencia del lote (tamaño aparente, forma, vegetación, topografía, estado actual - vacío, plano, etc.). 2. Entorno y ubicación (calles, casas o construcciones cercanas, accesos viales, contexto de colonia). 3. Potencial de desarrollo (visual para construcción multifamiliar, densidad posible, plusvalía por zona). 4. Calidad de la foto para uso en marketing (ángulos, iluminación, elementos destacables). 5. Cualquier texto, letrero, detalle o particularidad visible. Usa viñetas y sé específico y objetivo."

    $body = @{
        contents = @(
            @{
                parts = @(
                    @{ text = $prompt },
                    @{
                        inline_data = @{
                            mime_type = "image/jpeg"
                            data = $base64
                        }
                    }
                )
            }
        )
    } | ConvertTo-Json -Depth 10

    try {
        $uri = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$key"
        $resp = Invoke-RestMethod -Uri $uri -Method Post -Body $body -ContentType "application/json" -TimeoutSec 60
        $desc = $resp.candidates[0].content.parts[0].text
        $md += "`n## $($img.Name)`n`n$desc`n"
        Write-Host "  OK: $($img.Name)"
        Start-Sleep -Milliseconds 1500  # rate limit
    } catch {
        $md += "`n## $($img.Name)`n`nError al analizar: $($_.Exception.Message)`n"
        Write-Host "  Error: $($img.Name)"
    }
}

$outFile = Join-Path $PSScriptRoot "vision-analisis-imagenes.md"
$md | Out-File $outFile -Encoding UTF8
Write-Host "`nMarkdown generado en: $outFile"
Write-Host "Total imágenes procesadas: $($images.Count)"