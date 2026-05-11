'use strict';
/**
 * CalculatorNode — Tercer nodo del TextFlowGraph.
 *
 * Calcula monto_bruto, monto_neto, comision_mxn a partir del draft
 * y proyecta el saldo nuevo del cliente.
 *
 * Lee:   state.draft.monto, state.draft.tipo_monto, state.draft.comision_pct,
 *        state.draft.es_entrada, state.client.saldo
 * Escribe: state.draft (añade monto_bruto, monto_neto, comision_mxn, saldo_nuevo, es_entrada)
 */

const { calcularMontos, proyectarSaldo } = require('../../../agents/calculator');

async function calculatorNode(state) {
  const { draft, client } = state;

  if (draft.monto == null || draft.comision_pct == null) {
    return { error: 'CalculatorNode: falta monto o comision_pct' };
  }

  let calcResult;
  try {
    calcResult = calcularMontos({
      monto:        draft.monto,
      tipo_monto:   draft.tipo_monto ?? 'bruto',
      comision_pct: draft.comision_pct,
    });
  } catch (err) {
    return { error: `CalculatorNode: error en calcularMontos: ${err.message}` };
  }

  const { monto_bruto, monto_neto, comision_mxn } = calcResult;

  const es_entrada = draft.es_entrada ?? true;
  const saldo_actual = parseFloat(client?.saldo ?? 0);

  let saldoResult;
  try {
    saldoResult = proyectarSaldo({ saldo_actual, monto_neto, es_entrada });
  } catch (err) {
    return { error: `CalculatorNode: error en proyectarSaldo: ${err.message}` };
  }

  const { saldo_nuevo } = saldoResult;

  return {
    draft: {
      monto_bruto,
      monto_neto,
      comision_mxn,
      saldo_nuevo,
      es_entrada,
    },
  };
}

module.exports = calculatorNode;
