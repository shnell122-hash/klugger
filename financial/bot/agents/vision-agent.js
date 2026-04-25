'use strict';
/**
 * Vision Agent — OCR de imágenes con Claude claude-haiku-4-5.
 * Extrae cuentas bancarias de fotos de tablas Excel, y facturas/comprobantes de imágenes.
 */

const Anthropic = require('@anthropic-ai/sdk');

const VISION_MODEL = 'claude-haiku-4-5-20251001';

const BANKING_PROMPT = `Analiza esta imagen que contiene una tabla de cuentas bancarias de pago.
Extrae TODOS los registros y devuelve ÚNICAMENTE un JSON válido con este formato exacto:
{
  "cuentas": [
    { "nombre": "Nombre del titular", "numero": "18 dígitos CLABE o número de cuenta", "banco": "Nombre del banco", "monto": 1234.56 }
  ]
}
- El campo "numero" debe ser solo dígitos, sin espacios ni guiones.
- Si no hay monto, usa null.
- Si no hay banco, usa null.
- Si no hay nombre, usa null.
- Devuelve solo el JSON, sin texto adicional.`;

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
   * @returns {Array<{tipo,numero,titular,banco,monto}>}
   */
  async extraerCuentasBancarias(imageBuffer, mimeType) {
    try {
      const result = await this._callVision(imageBuffer, mimeType, BANKING_PROMPT);
      if (!result?.cuentas?.length) return [];

      return result.cuentas
        .map(c => {
          const raw = String(c.numero ?? '').replace(/[\s\-]/g, '');
          let tipo = 'cuenta';
          if (/^\d{18}$/.test(raw))   tipo = 'CLABE';
          else if (/^\d{16}$/.test(raw)) tipo = 'tarjeta';
          else if (/^\d{10,11}$/.test(raw)) tipo = 'cuenta';
          else return null;
          return {
            tipo,
            numero:  raw,
            titular: c.nombre  ? String(c.nombre).trim()  : null,
            banco:   c.banco   ? String(c.banco).trim()   : null,
            monto:   c.monto   ? parseFloat(c.monto)      : null,
          };
        })
        .filter(Boolean);
    } catch (e) {
      console.error('[vision-agent] extraerCuentasBancarias:', e.message);
      return [];
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
