# Assets de Prueba — FinBot Simuladores

Este directorio contiene los archivos de prueba que los simuladores envían al bot.
**No se commitean al repo** (ignorados en .gitignore) — deben crearse localmente en el servidor.

## Archivos requeridos

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `cuadro-retorno-sem14.png` | PNG | Captura de tabla IAS semana 14 en modo oscuro iOS |
| `cuadro-retorno-sem14.xlsx` | Excel | Mismos datos en formato Excel con columnas NOMBRE/NETO/%/BRUTO/CLABE/BANCO |
| `comprobante-spei.pdf` | PDF | Comprobante bancario SPEI (cualquier comprobante real anonimizado) |
| `comprobante-foto.jpg` | JPEG | Captura de app bancaria mostrando monto |
| `audio-instrucciones.ogg` | OGG | Nota de voz 10-15 segundos con instrucciones de pago |
| `factura-cfdi.xml` | XML | CFDI RE de ejemplo (descargable de SAT) |

## Datos del cuadro de retorno SEM 14

El cuadro debe contener al menos estas filas:

```
NOMBRE                | NETO     | %    | BRUTO     | CLABE              | BANCO
GERMAN VILAR ARGUETA  | 23,000   | 5.5% | 24,338.62 | 058597000030773833 | BANREGIO
NOELA SUÁREZ          | 30,000   | 5.5% | 31,745.24 | 058597000068994820 | BANREGIO
─────────────────────────────────────────────────────────────────────────────────
TOTAL                 | 53,000   |      | 56,083.86 |                    |
```

## Cómo crear los archivos programáticamente

### cuadro-retorno-sem14.xlsx

```bash
node -e "
const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ['NOMBRE', 'NETO', 'PCT', 'BRUTO', 'CLABE', 'BANCO'],
  ['GERMAN VILAR ARGUETA', 23000, 0.055, 24338.62, '058597000030773833', 'BANREGIO'],
  ['NOELA SUÁREZ', 30000, 0.055, 31745.24, '058597000068994820', 'BANREGIO'],
  ['TOTAL', 53000, '', 56083.86, '', ''],
]);
XLSX.utils.book_append_sheet(wb, ws, 'SEM14');
XLSX.writeFile(wb, 'cuadro-retorno-sem14.xlsx');
console.log('✅ cuadro-retorno-sem14.xlsx creado');
"
```

### audio-instrucciones.ogg (requiere ffmpeg)

```bash
# Crear audio de síntesis de texto (espeak)
espeak-ng -v es -w /tmp/instrucciones.wav \
  "Buenas tardes, por favor hagan el pago de cincuenta y tres mil pesos a las cuentas del cuadro que les mandé"
ffmpeg -i /tmp/instrucciones.wav -c:a libopus audio-instrucciones.ogg
```

### cuadro-retorno-sem14.png

Tomar un screenshot de la tabla del XLSX en Excel/LibreOffice con tema oscuro,
o generarlo con una librería como `canvas` o `sharp`.

## .gitignore

Los archivos binarios de este directorio están en `.gitignore` del repo para evitar
commitear datos reales. Solo el `README.md` se trackea.
