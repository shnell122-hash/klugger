'use strict';
/**
 * Vision Agent — OCR de imágenes con Claude Haiku.
 * Extrae cuentas bancarias de CUALQUIER tipo de imagen, y analiza facturas/comprobantes.
 */

const Anthropic = require('@anthropic-ai/sdk');

const VISION_MODEL = 'claude-haiku-4-5-20251001';

// Acepta tablas Excel, capturas de WhatsApp/Telegram, fotos de papel, listas en cualquier formato
const BANKING_PROMPT = `Analiza esta imagen y extrae TODA la información de cuentas bancarias que aparezca.
La imagen puede ser: tabla de Excel, captura de pantalla de chat, foto de papel, lista de texto, comprobante bancario, etc.

TIPOS DE NÚMERO BANCARIO EN MÉXICO:
- CLABE interbancaria: 18 dígitos (a veces con espacios: "1371 8010 4759 4208 28" → 137180104759420828)
- Tarjeta: 16 dígitos (grupos de 4)
- Cuenta bancaria: 10-11 dígitos

INSTRUCCIONES GENERALES:
- Extrae TODOS los registros que puedas leer, aunque sea parcialmente.
- Para números con espacios o guiones: conviértelos a solo dígitos.
- Si la imagen es oscura, con colores, o borrosa: haz tu mejor intento con los datos visibles.
- "confianza": "alta" si lees el número completo con claridad, "media" si hay algo borroso, "baja" si reconstruiste.
- Si un número parece incompleto o truncado, inclúyelo igual con confianza baja.
- "banco": el nombre del banco si aparece. Acepta cualquier forma: BBVA, Banamex, Nu, STP, SPIN, Azteca, Coppel, etc.
- "nombre": el titular o beneficiario si aparece en la imagen.

TABLAS (EXCEL, HOJAS DE CÁLCULO):
- Lee CADA FILA como un registro independiente.
- El monto de esa persona está en la MISMA FILA que su cuenta; búscalo en columnas con nombres como:
  "AHORRO", "EFECTIVO", "MONTO", "PAGO", "IMPORTE", "SALARIO", "CANTIDAD".
- Convierte el monto a número sin símbolo de moneda: "$1,152.69" → 1152.69
- El total al pie de la tabla (suma de todos) NO es el monto individual de nadie; ignóralo para el campo "monto".
- Si una fila tiene número de cuenta pero no tiene monto, pon "monto": null.

Devuelve ÚNICAMENTE un JSON válido:
{
  "cuentas": [
    {
      "nombre": "Juan García López",
      "numero": "137180104759420828",
      "banco": "BBVA",
      "monto": 1152.69,
      "confianza": "alta"
    }
  ],
  "notas": "texto libre si hay algo relevante que no cabe en la estructura"
}
Si no hay ninguna cuenta bancaria en la imagen, devuelve: { "cuentas": [], "notas": null }
Devuelve SOLO el JSON, sin explicaciones.`;

// Para facturas, comprobantes, capturas de pago
const INVOICE_PROMPT = `Analiza esta imagen. Puede ser: factura SAT, comprobante de transferencia, captura de app bancaria, recibo de pago, screenshot de conversación mostrando un pago, etc.

Extrae la información de pago que aparezca y devuelve ÚNICAMENTE un JSON válido:
{
  "tipo": "factura" | "comprobante" | "desconocido",
  "monto_total": 12345.67,
  "emisor_nombre": "Nombre de quien emite o paga",
  "emisor_rfc": "RFC si aparece o null",
  "receptor_nombre": "Nombre de quien recibe o null",
  "concepto": "Descripción del concepto o null",
  "fecha": "YYYY-MM-DD o null",
  "folio": "número de folio, referencia o null",
  "datos_bancarios": [
    { "tipo": "CLABE|tarjeta|cuenta", "numero": "solo dígitos", "banco": "nombre banco o null", "titular": "nombre o null" }
  ]
}
- monto_total: número sin símbolos de moneda. null si no hay monto claro.
- Si es una captura de chat mostrando transferencia: extrae el monto y la referencia/folio.
- datos_bancarios: cuentas que aparezcan en la imagen (origen o destino del pago).
Devuelve SOLO el JSON, sin explicaciones adicionales.`;

class VisionAgent {
  constructor(apiKey) {
    if (!apiKey) throw new Error('VisionAgent requiere ANTHROPIC_API_KEY');
    this.client = new Anthropic({ apiKey });
  }

  async _callVision(imageBuffer, mimeType, prompt) {
    const base64    = imageBuffer.toString('base64');
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

    const raw   = msg.content[0]?.text ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  }

  /**
   * Extrae cuentas bancarias de cualquier imagen.
   * @returns {{ cuentas: Array<{tipo,numero,titular,banco,monto,confianza}>, notas: string|null }}
   */
  async extraerCuentasBancarias(imageBuffer, mimeType) {
    try {
      const result = await this._callVision(imageBuffer, mimeType, BANKING_PROMPT);
      if (!result?.cuentas?.length) {
        return { cuentas: [], notas: result?.notas ?? null };
      }

      const cuentas = result.cuentas
        .map(c => {
          const raw = String(c.numero ?? '').replace(/[\s\-\.]/g, '');
          if (!/^\d{10,19}$/.test(raw)) return null; // must be numeric, reasonable length

          let tipo = 'cuenta';
          if      (/^\d{18}$/.test(raw))    tipo = 'CLABE';
          else if (/^\d{16}$/.test(raw))    tipo = 'tarjeta';
          else if (/^\d{10,11}$/.test(raw)) tipo = 'cuenta';
          // Accept non-standard lengths with baja confidence
          else                              tipo = 'cuenta';

          return {
            tipo,
            numero:     raw,
            titular:    c.nombre     ? String(c.nombre).trim()    : null,
            banco:      c.banco      ? String(c.banco).trim()     : null,
            monto:      c.monto      ? parseFloat(c.monto)        : null,
            confianza:  c.confianza  ?? 'media',
          };
        })
        .filter(Boolean);

      return { cuentas, notas: result.notas ?? null };
    } catch (e) {
      console.error('[vision-agent] extraerCuentasBancarias:', e.message);
      return { cuentas: [], notas: null };
    }
  }

  /**
   * Analiza una imagen de factura, comprobante o captura de pago.
   * @returns {{ tipo, monto_total, emisor_nombre, emisor_rfc, receptor_nombre,
   *             concepto, fecha, folio, datos_bancarios }}
   */
  async analizarFactura(imageBuffer, mimeType) {
    try {
      const result = await this._callVision(imageBuffer, mimeType, INVOICE_PROMPT);
      if (!result) return null;
      if (result.datos_bancarios?.length) {
        result.datos_bancarios = result.datos_bancarios
          .map(d => {
            const num = String(d.numero ?? '').replace(/[\s\-\.]/g, '');
            return /^\d{10,19}$/.test(num) ? { ...d, numero: num } : null;
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
