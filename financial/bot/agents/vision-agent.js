'use strict';
/**
 * Vision Agent — OCR de imágenes con Claude claude-haiku-4-5.
 * Extrae cuentas bancarias de fotos de tablas Excel, y facturas/comprobantes de imágenes.
 */

const Anthropic = require('@anthropic-ai/sdk');

const VISION_MODEL = 'claude-haiku-4-5-20251001';

const BANKING_PROMPT = `Eres un OCR especializado en tablas de cuentas bancarias mexicanas.

TAREA: Extrae TODOS los registros de la tabla visible en la imagen.

CLABE INTERBANCARIA: exactamente 18 dígitos. En tablas de Excel aparece con espacios (grupos 4-4-4-4-2):
  Ejemplo: "1371 8010 4759 4208 28" → número: "137180104759420828"
Lee CADA dígito cuidadosamente. Si la imagen tiene fondo oscuro o colores, ignora el fondo y lee solo los dígitos.

REGLAS CRÍTICAS:
1. OMITE cualquier fila cuyo número contenga caracteres enmascarados (●, *, X, •, ◉, 0000 al final sospechoso). NO adivines dígitos.
2. Si no puedes leer un número con certeza, OMITE esa fila. Es mejor devolver menos registros correctos que inventar datos.
3. "banco": nombre completo del banco (BBVA, Banamex, Santander, HSBC, Banorte, Scotiabank, etc.). Si no aparece, usa null.
4. Lee el nombre completo del titular desde la columna NOMBRE o equivalente.
5. Devuelve "total_filas_visibles": cuántas filas de datos ves en la tabla, aunque no puedas leerlas todas.

Devuelve ÚNICAMENTE un JSON válido con este formato exacto:
{
  "tabla_detectada": true,
  "total_filas_visibles": 8,
  "cuentas": [
    { "nombre": "Juan García López", "numero": "137180104759420828", "banco": "BBVA", "monto": null }
  ]
}
- "tabla_detectada": true si ves una tabla con filas de datos, false si no hay tabla clara.
- "numero": solo dígitos, sin espacios ni guiones. 18 para CLABE, 16 para tarjeta, 10-11 para cuenta normal.
- Devuelve SOLO el JSON, sin explicaciones adicionales.`;

const INVOICE_PROMPT = `Analiza esta imagen de factura o comprobante de pago.
Devuelve ÚNICAMENTE un JSON válido con este formato:
{
  "tipo": "factura" | "comprobante" | "desconocido",
  "monto_total": 12345.67,
  "emisor_nombre": "Nombre de quien emite",
  "emisor_rfc": "RFC si aparece",
  "receptor_nombre": "Nombre de quien recibe",
  "concepto": "Descripción breve del concepto",
  "fecha": "YYYY-MM-DD o null",
  "folio": "número de folio o null",
  "datos_bancarios": [
    { "tipo": "CLABE|tarjeta|cuenta", "numero": "solo dígitos", "banco": "nombre banco o null", "titular": "nombre o null" }
  ]
}
- monto_total: suma total, solo número sin símbolos.
- datos_bancarios: cuentas bancarias que aparezcan en la factura/comprobante (donde depositar).
- Devuelve solo el JSON, sin texto adicional.`;

class VisionAgent {
  constructor(apiKey) {
    if (!apiKey) throw new Error('VisionAgent requiere ANTHROPIC_API_KEY');
    this.client = new Anthropic({ apiKey });
  }

  async _callVision(imageBuffer, mimeType, prompt) {
    const base64 = imageBuffer.toString('base64');
    const mediaType = (mimeType && mimeType.startsWith('image/')) ? mimeType : 'image/jpeg';

    const msg = await this.client.messages.create({
      model:      VISION_MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const raw = msg.content[0]?.text ?? '';
    // Extraer JSON de la respuesta (por si tiene texto decorativo)
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  }

  /**
   * Extrae cuentas bancarias de una imagen de tabla (Excel screenshot, lista, etc.)
   * @returns {{ cuentas: Array<{tipo,numero,titular,banco,monto}>, warning: string|null }}
   *   warning: 'tabla_no_legible' | 'baja_confianza' | null
   */
  async extraerCuentasBancarias(imageBuffer, mimeType) {
    try {
      const result = await this._callVision(imageBuffer, mimeType, BANKING_PROMPT);
      const totalFilas       = result?.total_filas_visibles ?? 0;
      const tablaDetectada   = result?.tabla_detectada === true;

      if (!result?.cuentas?.length) {
        if (tablaDetectada && totalFilas > 1) {
          console.warn(`[vision-agent] Tabla detectada (${totalFilas} filas) pero 0 cuentas legibles`);
          return { cuentas: [], warning: 'tabla_no_legible' };
        }
        return { cuentas: [], warning: null };
      }

      const cuentas = result.cuentas
        .map(c => {
          const raw = String(c.numero ?? '').replace(/[\s\-]/g, '');
          // Reject masked or non-digit content
          if (/[●•○◉*xX]/.test(raw)) return null;
          let tipo = null;
          if      (/^\d{18}$/.test(raw))     tipo = 'CLABE';
          else if (/^\d{16}$/.test(raw))     tipo = 'tarjeta';
          else if (/^\d{10,11}$/.test(raw))  tipo = 'cuenta';
          else return null;

          const banco = c.banco ? String(c.banco).trim() : null;
          return {
            tipo,
            numero:  raw,
            titular: c.nombre ? String(c.nombre).trim() : null,
            banco:   banco && banco.length >= 2 ? banco : null,
            monto:   c.monto  ? parseFloat(c.monto)    : null,
          };
        })
        .filter(Boolean);

      // Reject if we got far fewer accounts than visible rows (likely hallucination)
      if (tablaDetectada && totalFilas >= 4 && cuentas.length <= 1) {
        console.warn(`[vision-agent] Solo ${cuentas.length} cuenta(s) de ${totalFilas} filas visibles — baja confianza, descartando`);
        return { cuentas: [], warning: 'baja_confianza' };
      }

      return { cuentas, warning: null };
    } catch (e) {
      console.error('[vision-agent] extraerCuentasBancarias:', e.message);
      return { cuentas: [], warning: null };
    }
  }

  /**
   * Analiza una imagen de factura/comprobante.
   * @returns {{ tipo, monto_total, emisor_nombre, emisor_rfc, receptor_nombre,
   *             concepto, fecha, folio, datos_bancarios }}
   */
  async analizarFactura(imageBuffer, mimeType) {
    try {
      const result = await this._callVision(imageBuffer, mimeType, INVOICE_PROMPT);
      if (!result) return null;
      // Normalizar datos bancarios
      if (result.datos_bancarios?.length) {
        result.datos_bancarios = result.datos_bancarios
          .map(d => {
            const num = String(d.numero ?? '').replace(/[\s\-]/g, '');
            return num.length >= 10 ? { ...d, numero: num } : null;
          })
          .filter(Boolean);
      }
      return result;
    } catch (e) {
      console.error('[vision-agent] analizarFactura:', e.message);
      return null;
    }
  }
}

module.exports = VisionAgent;
