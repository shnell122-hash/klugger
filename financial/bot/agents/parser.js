'use strict';
/**
 * Parser Agent — Detecta /operacion y extrae parámetros sin LLM.
 */

const { detectType } = require('../config/commissions');

const MONTO_REGEX = /\$?\s*(\d{1,3}(?:[,.]?\d{3})*(?:\.\d{1,4})?|\d+(?:\.\d{1,4})?)\s*(?:k|mil|miles|m)?/i;
const MONTO_K_REGEX = /(\d+(?:\.\d+)?)\s*k\b/i;
const MONTO_MIL_REGEX = /(\d+(?:\.\d+)?)\s*(?:mil|miles)\b/i;

const NETO_KEYWORDS  = /\b(?:neto|netos|net|limpio|limpios|quiero recibir|que me llegue|reciba)\b/i;
const BRUTO_KEYWORDS = /\b(?:bruto|brutos|total|operar|monto total|monto bruto)\b/i;

const ENTRADA_KEYWORDS = /\b(?:pago|pagar|depositar|deposito|enviaste|envié|factura|cobrar)\b/i;
const SALIDA_KEYWORDS  = /\b(?:envía?me|manda?me|quiero recibir|quiero que me env|retirar|retiro|retiro|transfer)\b/i;

function parseCommand(text) {
  const parts = text.trim().split(/\s+/);
  const result = { tipo: null, tipo_monto: null, monto: null };

  for (const part of parts) {
    const tipo = detectType(part);
    if (tipo && !result.tipo) {
      result.tipo = tipo;
      continue;
    }
    if (/^neto$/i.test(part)) { result.tipo_monto = 'neto'; continue; }
    if (/^bruto$/i.test(part)) { result.tipo_monto = 'bruto'; continue; }
    if (!result.monto) {
      const m = extractMonto(part);
      if (m) result.monto = m;
    }
  }

  return result;
}

function parseNaturalText(text) {
  const result = {
    tipo: null,
    tipo_monto: null,
    monto: null,
    es_entrada: null,
    necesita_llm: false,
  };

  result.tipo = detectType(text);

  if (NETO_KEYWORDS.test(text))  result.tipo_monto = 'neto';
  if (BRUTO_KEYWORDS.test(text)) result.tipo_monto = 'bruto';

  if (SALIDA_KEYWORDS.test(text))  result.es_entrada = false;
  if (ENTRADA_KEYWORDS.test(text)) result.es_entrada = true;

  result.monto = extractMontoFromText(text);

  if (!result.tipo || !result.monto) {
    result.necesita_llm = true;
  }

  if (result.es_entrada === false && !result.tipo_monto) {
    result.tipo_monto = 'neto';
  }

  return result;
}

function buildLLMParsePrompt(text) {
  return `Extrae los datos de la operación financiera del siguiente mensaje del cliente.
Responde SOLO con JSON, sin explicaciones.

Mensaje: "${text}"

Formato de respuesta:
{
  "tipo_operacion": "IAS|TARJETAS|SPEI|EFECTIVO|SINDICATO|null",
  "tipo_monto": "neto|bruto|null",
  "monto": <número o null>,
  "es_entrada": <true si el cliente pagó, false si quiere recibir dinero, null si no está claro>,
  "tipo_entrega": "efectivo|tarjeta|spei|null",
  "confianza": "alta|media|baja"
}`;
}

function extractMonto(str) {
  const k = str.match(MONTO_K_REGEX);
  if (k) return parseFloat(k[1]) * 1000;
  const n = str.replace(/,/g, '');
  const v = parseFloat(n);
  return isNaN(v) ? null : v;
}

function extractMontoFromText(text) {
  // Negative amounts (e.g. "-1000") — return as-is so validation rejects them
  // \d{4,} must come first to prevent \d{1,3} from greedily matching "100" in "1000"
  const neg = text.match(/-\s*(\d{4,}(?:\.\d{1,4})?|\d{1,3}(?:[,]\d{3})*(?:\.\d{1,4})?)/);
  if (neg) return -parseFloat(neg[1].replace(/,/g, ''));
  const mil = text.match(MONTO_MIL_REGEX);
  if (mil) return parseFloat(mil[1]) * 1000;
  const k = text.match(MONTO_K_REGEX);
  if (k) return parseFloat(k[1]) * 1000;
  const m = text.match(/\$?\s*(\d{1,3}(?:[,]\d{3})*(?:\.\d{1,4})?|\d{4,}(?:\.\d{1,4})?)/);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  return null;
}

function isOperacionCommand(text) {
  return /^\/operaci[oó]n/i.test(text.trim());
}

function isImplicitOperacion(text) {
  const lower = text.toLowerCase();
  return (
    SALIDA_KEYWORDS.test(lower) ||
    ENTRADA_KEYWORDS.test(lower) ||
    (extractMontoFromText(lower) && detectType(lower)) ||
    /\b(ias|spei|sindicato|efectivo|tarjetas)\b/i.test(text)
  );
}

module.exports = {
  parseCommand,
  parseNaturalText,
  buildLLMParsePrompt,
  isOperacionCommand,
  isImplicitOperacion,
  extractMontoFromText,
};
