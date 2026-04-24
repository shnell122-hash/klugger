'use strict';
/**
 * Parser Agent — Detecta /operacion y extrae parámetros sin LLM.
 * Solo llama al LLM para casos ambiguos (texto libre sin estructura clara).
 *
 * Casos soportados:
 *   /operacion IAS neto 100000
 *   /operacion SPEI bruto 50000
 *   /operacion (sin parámetros → el bot pregunta paso a paso)
 *   "quiero que me envíen 100 mil en efectivo" (texto libre → LLM)
 */

const { detectType } = require('../config/commissions');

// Regex para detectar montos en texto (100000, 100,000, 100k, 100 mil)
const MONTO_REGEX = /\$?\s*(\d{1,3}(?:[,.]?\d{3})*(?:\.\d{1,4})?|\d+(?:\.\d{1,4})?)\s*(?:k|mil|miles|m)?/i;
const MONTO_K_REGEX = /(\d+(?:\.\d+)?)\s*k\b/i;
const MONTO_MIL_REGEX = /(\d+(?:\.\d+)?)\s*(?:mil|miles)\b/i;

// Keywords para tipo_monto
const NETO_KEYWORDS  = /\b(?:neto|netos|net|limpio|limpios|quiero recibir|que me llegue|reciba)\b/i;
const BRUTO_KEYWORDS = /\b(?:bruto|brutos|total|operar|monto total|monto bruto)\b/i;

// Keywords para es_entrada (el cliente pagó) vs es_salida (nosotros pagamos)
const ENTRADA_KEYWORDS = /\b(?:pago|pagar|depositar|deposito|enviaste|envié|factura|cobrar)\b/i;
const SALIDA_KEYWORDS  = /\b(?:envía?me|manda?me|quiero recibir|quiero que me env|retirar|retiro|retiro|transfer)\b/i;

/**
 * Intenta parsear el comando /operacion con argumentos.
 * Ej: /operacion IAS neto 100000
 *
 * @param {string} text - Texto del mensaje (sin el /operacion)
 * @returns {{ tipo: string|null, tipo_monto: 'neto'|'bruto'|null, monto: number|null }}
 */
function parseCommand(text) {
  const parts = text.trim().split(/\s+/);
  const result = { tipo: null, tipo_monto: null, monto: null };

  for (const part of parts) {
    // Tipo de operación
    const tipo = detectType(part);
    if (tipo && !result.tipo) {
      result.tipo = tipo;
      continue;
    }
    // Tipo de monto
    if (/^neto$/i.test(part)) { result.tipo_monto = 'neto'; continue; }
    if (/^bruto$/i.test(part)) { result.tipo_monto = 'bruto'; continue; }
    // Monto numérico
    if (!result.monto) {
      const m = extractMonto(part);
      if (m) result.monto = m;
    }
  }

  return result;
}

/**
 * Parsea texto libre del cliente (sin comando explícito).
 * Retorna extracción parcial y un flag `necesita_llm` si la confianza es baja.
 *
 * @param {string} text
 * @returns {{ tipo: string|null, tipo_monto: 'neto'|'bruto'|null, monto: number|null,
 *             es_entrada: boolean|null, necesita_llm: boolean }}
 */
function parseNaturalText(text) {
  const result = {
    tipo: null,
    tipo_monto: null,
    monto: null,
    es_entrada: null,
    necesita_llm: false,
  };

  // Detectar tipo de operación
  result.tipo = detectType(text);

  // Detectar tipo de monto
  if (NETO_KEYWORDS.test(text))  result.tipo_monto = 'neto';
  if (BRUTO_KEYWORDS.test(text)) result.tipo_monto = 'bruto';

  // Detectar dirección
  if (SALIDA_KEYWORDS.test(text))  result.es_entrada = false;
  if (ENTRADA_KEYWORDS.test(text)) result.es_entrada = true;

  // Detectar monto
  result.monto = extractMontoFromText(text);

  // Si falta tipo o monto, necesita LLM o preguntar al usuario
  if (!result.tipo || !result.monto) {
    result.necesita_llm = true;
  }

  // Inferencia: si dice "envíame" → es salida → tipo_monto default neto
  if (result.es_entrada === false && !result.tipo_monto) {
    result.tipo_monto = 'neto';
  }

  return result;
}

/**
 * Genera el prompt para LLM cuando no se puede parsear con regex.
 * Mantiene el prompt corto para minimizar tokens.
 */
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

// ── helpers ───────────────────────────────────────────────────────────────────

function extractMonto(str) {
  // "100k" → 100000
  const k = str.match(MONTO_K_REGEX);
  if (k) return parseFloat(k[1]) * 1000;
  // Número normal
  const n = str.replace(/,/g, '');
  const v = parseFloat(n);
  return isNaN(v) ? null : v;
}

function extractMontoFromText(text) {
  // "100 mil" → 100000
  const mil = text.match(MONTO_MIL_REGEX);
  if (mil) return parseFloat(mil[1]) * 1000;
  // "100k"
  const k = text.match(MONTO_K_REGEX);
  if (k) return parseFloat(k[1]) * 1000;
  // Número con formato $100,000 o 100000
  const m = text.match(/\$?\s*(\d{1,3}(?:[,]\d{3})*(?:\.\d{1,4})?|\d{4,}(?:\.\d{1,4})?)/);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  return null;
}

/**
 * Detecta si el texto es un comando /operacion (con o sin parámetros)
 */
function isOperacionCommand(text) {
  return /^\/operaci[oó]n/i.test(text.trim());
}

/**
 * Detecta si el texto parece una solicitud de operación financiera
 * (sin ser comando explícito)
 */
function isImplicitOperacion(text) {
  const lower = text.toLowerCase();
  return (
    SALIDA_KEYWORDS.test(lower) ||
    ENTRADA_KEYWORDS.test(lower) ||
    (extractMontoFromText(lower) && detectType(lower))
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
