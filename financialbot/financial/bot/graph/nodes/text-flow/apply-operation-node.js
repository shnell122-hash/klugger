'use strict';
/**
 * ApplyOperationNode — Séptimo nodo del TextFlowGraph (Parte 4).
 *
 * Guarda la operación confirmada en la base de datos dentro de una transacción:
 *   1. INSERT INTO fin_operations (estado='pendiente')
 *   2. balanceManager.aplicarOperacion → actualiza saldo
 *   3. UPDATE estado='confirmada'
 *   4. bankingManager.guardarCuentas (fuera de la transacción, no crítico)
 *   5. registrarComisionista (fuera de la transacción)
 *
 * Extrae la lógica de saveConfirmedOperation() de financial-bot.js.
 *
 * Lee:   state.draft, state.client, state.chatId, state._pool
 * Escribe: state.draft (operationId, saldo_despues), state.replyMessages, state.nextAction
 */

const BankingManager       = require('../../../agents/banking-manager');
const BalanceManager       = require('../../../agents/balance-manager');
const { registrarComisionista } = require('../../../config/commissions');
const { fmt }              = require('../../../agents/calculator');

async function applyOperationNode(state) {
  const { draft, client, chatId } = state;
  const pool     = state._pool;
  const clientId = client?.id ?? draft?.clientId;

  if (!pool) {
    return { error: 'ApplyOperationNode: pool no disponible' };
  }
  if (!clientId) {
    return { error: 'ApplyOperationNode: clientId no disponible' };
  }

  const conn = await pool.getConnection();
  let operationId, saldo_antes, saldo_despues;

  try {
    await conn.beginTransaction();

    const subtablaJson = draft.tabla_pagos?.length ? JSON.stringify(draft.tabla_pagos) : null;

    const [result] = await conn.query(
      `INSERT INTO fin_operations
         (client_id, tipo_operacion, monto_bruto, comision_pct, costo_pct, monto_neto,
          es_entrada, solicita_neto, tipo_entrega, instrucciones_pago, direccion_entrega,
          subtabla_json, estado, tiene_factura, telegram_chat_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pendiente',?,?)`,
      [
        clientId,
        draft.tipo_operacion,
        draft.monto_bruto,
        draft.comision_pct,
        draft.costo_pct ?? null,
        draft.monto_neto,
        draft.es_entrada ? 1 : 0,
        draft.solicita_neto ? 1 : 0,
        draft.tipo_entrega ?? 'efectivo',
        draft.instrucciones_pago ?? null,
        draft.direccion_entrega ?? null,
        subtablaJson,
        draft.tiene_factura ? 1 : 0,
        chatId ?? null,
      ]
    );
    operationId = result.insertId;

    const bm = new BalanceManager(pool);
    ({ saldo_antes, saldo_despues } = await bm.aplicarOperacion(
      {
        operationId,
        clientId,
        monto_neto:   draft.monto_neto,
        monto_bruto:  draft.monto_bruto,
        es_entrada:   draft.es_entrada,
      },
      conn
    ));

    await conn.query(
      "UPDATE fin_operations SET estado='confirmada', updated_at=NOW(3) WHERE id=?",
      [operationId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    conn.release();
    return { error: `ApplyOperationNode: transacción falló — ${err.message}` };
  } finally {
    conn.release();
  }

  // Post-transacción: cuentas bancarias y comisión (no críticos)
  if (draft.cuentas_bancarias?.length) {
    const bankMgr = new BankingManager(pool);
    bankMgr.guardarCuentas(clientId, operationId, draft.cuentas_bancarias)
      .catch(err => console.error('[ApplyOperationNode] guardarCuentas:', err.message));
  }

  registrarComisionista({
    pool,
    clientId,
    operationId,
    tipoOperacion: draft.tipo_operacion,
    montoBruto:    draft.monto_bruto,
  }).catch(err => console.error('[ApplyOperationNode] registrarComisionista:', err.message));

  const esSalida = !draft.es_entrada;
  const signo    = esSalida ? '-' : '+';
  const confirmText =
    `✅ <b>Operación confirmada</b>\n\n` +
    `${draft.tipo_operacion} · ${signo}$${fmt(draft.monto_neto)}\n` +
    `Saldo: <b>$${fmt(saldo_antes)}</b> → <b>$${fmt(saldo_despues)}</b>`;

  return {
    draft: {
      operationId,
      saldo_actual: saldo_despues,
    },
    replyMessages: [{ text: confirmText, opts: { parse_mode: 'HTML' } }],
    nextAction:    'done',
    sessionEstado: 'completado',
  };
}

module.exports = applyOperationNode;
