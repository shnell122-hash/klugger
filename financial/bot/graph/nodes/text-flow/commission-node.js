'use strict';
/**
 * CommissionNode — Segundo nodo del TextFlowGraph.
 *
 * Obtiene la tasa de comisión efectiva para el cliente y tipo de operación.
 * Maneja la lógica de crédito previo (SPEI/EFECTIVO con saldo > 0 → sin comisión).
 *
 * Lee:   state.draft.tipo_operacion, state.client, state.pool (inyectado)
 * Escribe: state.commission, state.draft.comision_pct, state.draft.costo_pct,
 *          state.draft.es_credito
 *
 * Requiere state._pool inyectado (lo hace FinBotGraph.invoke antes de llamar al grafo).
 */

const { getCommission } = require('../../../config/commissions');

async function commissionNode(state) {
  const { draft, client } = state;
  const pool = state._pool; // inyectado por FinBotGraph.invoke

  const tipo = draft?.tipo_operacion;
  if (!tipo) {
    return { error: 'CommissionNode: tipo_operacion no definido' };
  }

  let commission;
  try {
    commission = await getCommission(tipo, pool ?? null, client?.id ?? null);
  } catch (err) {
    return { error: `CommissionNode: error obteniendo comisión: ${err.message}` };
  }

  if (!commission) {
    return { error: `CommissionNode: tipo de operación "${tipo}" no reconocido o bloqueado para este cliente` };
  }

  // Lógica de crédito previo:
  // SPEI / EFECTIVO + saldo neto > 0 → sin comisión (se consume el crédito)
  let comision_pct = commission.pct;
  let es_credito   = commission.es_credito ?? false;

  const saldoActual = parseFloat(client?.saldo ?? 0);
  const montoNeto   = draft?.monto; // aún no calculado, usamos el monto raw
  const esEntrada   = draft?.es_entrada;
  const tipoNormal  = ['SPEI', 'EFECTIVO'].includes(tipo?.toUpperCase());

  if (tipoNormal && !esEntrada && saldoActual > 0 && montoNeto && saldoActual >= montoNeto) {
    comision_pct = 0;
    es_credito   = true;
  }

  return {
    commission: {
      ...commission,
      pct_efectivo: comision_pct,
      es_credito,
    },
    draft: {
      comision_pct,
      costo_pct: commission.costo_pct ?? null,
      es_credito,
    },
  };
}

module.exports = commissionNode;
