'use strict';
/**
 * VerifierNode — Cuarto nodo del TextFlowGraph.
 *
 * Valida la consistencia matemática y de negocio del draft usando Verifier.
 * Aplica correcciones automáticas si el Verifier las sugiere.
 * Determina la siguiente acción: pedir campos, banking_query, etc.
 *
 * Lee:   state.draft (monto_bruto, monto_neto, comision_pct, tipo_operacion,
 *                     tipo_entrega, es_entrada)
 * Escribe: state.verificationResult, state.draft (correcciones), state.nextAction
 */

const Verifier = require('../../../agents/verifier');

async function verifierNode(state) {
  const { draft } = state;

  if (draft.monto_bruto == null) {
    return { error: 'VerifierNode: montos no calculados' };
  }

  const verifier = new Verifier();
  const result = verifier.verificarConsistencia(draft);

  // Aplicar correcciones sugeridas al draft
  const draftPatch = Object.keys(result.correcciones).length > 0
    ? { ...result.correcciones }
    : {};

  // Merge correcciones into the working draft view for routing decisions
  const effectiveDraft = { ...draft, ...draftPatch };

  // Determinar nextAction
  let nextAction;
  if (!effectiveDraft.tipo_operacion) {
    nextAction = 'ask_tipo';
  } else if (!effectiveDraft.monto_bruto) {
    nextAction = 'ask_monto';
  } else if (
    ['efectivo', 'tarjeta'].includes(effectiveDraft.tipo_entrega) &&
    !effectiveDraft.direccion_entrega
  ) {
    nextAction = 'ask_entrega';
  } else if (result.ok) {
    nextAction = 'banking_query';
  } else {
    nextAction = 'ask_fields';
  }

  return {
    verificationResult: result,
    draft: draftPatch,
    nextAction,
  };
}

module.exports = verifierNode;
