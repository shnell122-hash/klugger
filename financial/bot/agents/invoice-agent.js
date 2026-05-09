'use strict';
/**
 * Invoice Agent — detecta facturas y comprobantes de pago en archivos.
 * Soporta: Excel (.xlsx), CSV, TXT, PDF (extracción de texto).
 * Para imágenes: pide al usuario que confirme el monto manualmente.
 *
 * Retorna:
 *   { tipo: 'factura'|'comprobante'|null, monto_total, tipo_operacion, confianza }
 */

const FACTURA_KEYWORDS    = ['factura', 'cfdi', 'uuid', 'rfc', 'subtotal', 'iva', 'total a pagar', 'comprobante fiscal'];
const COMPROBANTE_KEYWORDS = ['comprobante', 'clave de rastreo', 'referencia', 'fecha de operación', 'spei enviado', 'transferencia enviada', 'monto transferido', 'operación exitosa'];
const TIPO_OP_RE = /(IAS|SPEI|SINDICATO|TARJETAS|EFECTIVO)/gi;
// Matches amounts like $350,000.00 or 350000 or 350,000
const AMOUNT_RE  = /\$?\s*([\d]{1,3}(?:[,.][ \d]{3})*(?:[.,]\d{1,2})?|\d+(?:\.\d{1,2})?)\b/g;

function parseAmount(raw) {
  // Normalize: remove thousands separators, handle comma decimal
  const clean = raw.replace(/,(?=\d{3})/g, '').replace(',', '.');
  return parseFloat(clean);
}

function extractAmounts(texto) {
  const found = [];
  for (const m of texto.matchAll(AMOUNT_RE)) {
    const n = parseAmount(m[1]);
    if (!isNaN(n) && n >= 500 && n <= 50_000_000) found.push(n);
  }
  return [...new Set(found)].sort((a, b) => b - a);
}

class InvoiceAgent {
  constructor(llmClient, opts = {}) {
    this.llm      = llmClient;
    this.model    = opts.model ?? process.env.DEEPSEEK_PRO_MODEL ?? 'deepseek-chat';
    this.logUsage = opts.logUsage ?? null;
  }

  // ── Static text analysis ──────────────────────────────────────────────────

  static analizarTexto(texto) {
    if (!texto || texto.trim().length < 10) return null;
    const lower = texto.toLowerCase();

    const facturaHits     = FACTURA_KEYWORDS.filter(k => lower.includes(k)).length;
    const comprobanteHits = COMPROBANTE_KEYWORDS.filter(k => lower.includes(k)).length;

    const amounts     = extractAmounts(texto);
    const tipoMatch   = texto.match(TIPO_OP_RE);
    const tipo_op     = tipoMatch?.[0]?.toUpperCase() ?? null;

    if (amounts.length === 0) return null;

    if (comprobanteHits >= 2) {
      return { tipo: 'comprobante', monto_total: amounts[0], tipo_operacion: tipo_op, confianza: 'alta' };
    }
    if (facturaHits >= 2) {
      return { tipo: 'factura', monto_total: amounts[0], tipo_operacion: tipo_op, confianza: 'alta' };
    }
    // Weak signal — amount found but no strong keywords
    if (amounts.length > 0) {
      return { tipo: null, monto_total: amounts[0], tipo_operacion: tipo_op, confianza: 'baja' };
    }
    return null;
  }

  // ── LLM fallback ─────────────────────────────────────────────────────────

  async analizarConLLM(extracto) {
    const prompt =
      `Analiza este texto y determina si es una factura (documento fiscal) o un comprobante de transferencia/pago. ` +
      `Solo responde en JSON puro, sin explicaciones.\n` +
      `Texto:\n${extracto.slice(0, 2500)}\n\n` +
      `JSON: {"tipo":"factura|comprobante|otro","monto_total":0,"tipo_operacion":"IAS|SPEI|SINDICATO|TARJETAS|EFECTIVO|null","confianza":"alta|media|baja"}`;

    const start = Date.now();
    const response = await this.llm.chat.completions.create({
      model: this.model,
      temperature: 0,
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    });

    const usage = response.usage ?? {};
    if (this.logUsage) {
      this.logUsage({
        agent_name: 'invoice_agent',
        model: this.model,
        tokens_in:  usage.prompt_tokens  ?? 0,
        tokens_out: usage.completion_tokens ?? 0,
        duration_ms: Date.now() - start,
      });
    }

    try {
      const raw = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw.replace(/```json?\n?|```/g, '').trim());
      if (parsed.tipo === 'otro' || !parsed.monto_total) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  // ── Buffer processing ─────────────────────────────────────────────────────

  async procesarBuffer(buffer, mimeType = '', fileName = '') {
    let texto = '';

    try {
      const mime = mimeType.toLowerCase();
      const ext  = (fileName.split('.').pop() ?? '').toLowerCase();

      if (mime.includes('spreadsheet') || mime.includes('excel') || ext === 'xlsx' || ext === 'xls') {
        const XLSX = require('xlsx');
        const wb   = XLSX.read(buffer, { type: 'buffer' });
        texto = wb.SheetNames.map(s => XLSX.utils.sheet_to_csv(wb.Sheets[s])).join('\n');

      } else if (mime.includes('pdf') || ext === 'pdf') {
        try {
          const pdfParse = require('pdf-parse');
          const data = await pdfParse(buffer);
          texto = data.text ?? '';
        } catch {
          // pdf-parse not installed or parse error — fallback to raw bytes as latin text
          texto = buffer.toString('latin1').replace(/[^\x20-\x7E\n]/g, ' ');
        }

      } else if (mime.startsWith('image/')) {
        // Cannot do OCR without vision model — signal caller to ask user
        return { tipo: 'imagen_sin_ocr', monto_total: 0, tipo_operacion: null, confianza: 'ninguna' };

      } else {
        texto = buffer.toString('utf-8');
      }
    } catch (err) {
      console.error('[invoice-agent] Error extrayendo texto:', err.message);
      return null;
    }

    if (!texto.trim()) return null;

    // 1. Fast heuristic
    const heuristic = InvoiceAgent.analizarTexto(texto);
    if (heuristic?.tipo && heuristic.confianza === 'alta') return heuristic;

    // 2. LLM for ambiguous / low-confidence cases
    if (texto.length > 30) {
      const llmResult = await this.analizarConLLM(texto);
      if (llmResult) {
        return { ...llmResult, monto_total: llmResult.monto_total ?? heuristic?.monto_total ?? 0 };
      }
    }

    // 3. Return heuristic even with low confidence so caller can decide
    return heuristic;
  }
}

module.exports = InvoiceAgent;
