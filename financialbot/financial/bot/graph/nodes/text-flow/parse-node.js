'use strict';
/**
 * ParseNode — Primer nodo del TextFlowGraph.
 *
 * Extrae tipo_operacion, monto, tipo_monto y es_entrada del mensaje de texto.
 * Si hay sesión activa con draft previo, fusiona los datos extraídos con el draft.
 *
 * Lee:   state.inputText, state.draft, state.sessionEstado, state.client
 * Escribe: state.draft (tipo_operacion, tipo_monto, monto, es_entrada, solicita_neto)
 *          state.sessionEstado → 'esperando_tipo' | 'esperando_monto' | 'calculando'
 */

const {
  parseCommand,
  parseNaturalText,
  isOperacionCommand,
} = require('../../../agents/parser');

async function parseNode(state) {
  const { inputText, draft } = state;

  if (!inputText) {
    return { error: 'ParseNode: inputText vacío' };
  }

  const sessionEstado = draft?.sessionEstado ?? state.sessionEstado ?? 'idle';

  // ── Continuar sesión activa ───────────────────────────────────────────────
  if (sessionEstado === 'esperando_tipo') {
    // El usuario está respondiendo con el tipo de operación
    const { detectType } = require('../../../config/commissions');
    const tipo = detectType(inputText.trim());
    if (tipo) {
      return {
        draft: { tipo_operacion: tipo },
        sessionEstado: draft?.monto ? 'calculando' : 'esperando_monto',
      };
    }
    // No reconocido → pedir de nuevo (el nodo Ask del grafo maneja esto)
    return {
      draft: {},
      nextAction: 'ask_tipo',
    };
  }

  if (sessionEstado === 'esperando_monto') {
    const { extractMontoFromText } = require('../../../agents/parser');
    const monto = extractMontoFromText(inputText.trim());
    if (monto) {
      const tipo_monto = /\b(?:neto|net|limpio)\b/i.test(inputText) ? 'neto'
                       : /\b(?:bruto|total)\b/i.test(inputText) ? 'bruto'
                       : draft?.solicita_neto ? 'neto' : null;
      return {
        draft: { monto, tipo_monto },
        sessionEstado: 'calculando',
      };
    }
    return {
      draft: {},
      nextAction: 'ask_monto',
    };
  }

  // ── Nueva operación: parsear el texto ─────────────────────────────────────
  let parsed;

  if (isOperacionCommand(inputText)) {
    // /operacion IAS neto 100000
    const cmdText = inputText.replace(/^\/operaci[oó]n\s*/i, '');
    parsed = parseCommand(cmdText);
  } else {
    // Texto libre: "quiero SPEI de 50 mil neto"
    parsed = parseNaturalText(inputText);
  }

  const updatedDraft = {
    ...(parsed.tipo        ? { tipo_operacion: parsed.tipo }       : {}),
    ...(parsed.tipo_monto  ? { tipo_monto: parsed.tipo_monto }     : {}),
    ...(parsed.monto       ? { monto: parsed.monto }               : {}),
    ...(parsed.es_entrada !== null && parsed.es_entrada !== undefined
        ? { es_entrada: parsed.es_entrada }
        : {}),
    ...(parsed.tipo_monto === 'neto'
        ? { solicita_neto: true }
        : parsed.tipo_monto === 'bruto'
        ? { solicita_neto: false }
        : {}),
  };

  // Determinar siguiente estado de sesión
  let nextSessionEstado;
  if (!updatedDraft.tipo_operacion) {
    nextSessionEstado = 'esperando_tipo';
  } else if (!updatedDraft.monto) {
    nextSessionEstado = 'esperando_monto';
  } else {
    nextSessionEstado = 'calculando';
  }

  return {
    draft: updatedDraft,
    sessionEstado: nextSessionEstado,
    nextAction: nextSessionEstado !== 'calculando' ? `ask_${nextSessionEstado.replace('esperando_', '')}` : null,
  };
}

module.exports = parseNode;
