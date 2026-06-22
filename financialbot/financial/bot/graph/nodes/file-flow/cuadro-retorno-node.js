'use strict';
/**
 * CuadroRetornoNode — Registra un cuadro IAS de beneficiarios.
 * LangGraph Parte 5.
 *
 * Lee:   state.cuadroRetorno, state.client, state.chatId, state._pool
 * Escribe: state.replyMessages, state.sessionEstado, state.nextAction
 */

const BalanceManager = require('../../../agents/balance-manager');
const BankingManager = require('../../../agents/banking-manager');
const { fmt }        = require('../../../agents/calculator');

async function cuadroRetornoNode(state) {
  const { cuadroRetorno, client, chatId } = state;
  const pool     = state._pool;
  const clientId = client?.id;

  if (!cuadroRetorno || !cuadroRetorno.filas?.length) {
    return { nextAction: null, error: 'CuadroRetornoNode: cuadro vacío o inválido' };
  }
  if (!pool)     return { error: 'CuadroRetornoNode: pool no disponible' };
  if (!clientId) return { error: 'CuadroRetornoNode: clientId no disponible' };

  const totalBruto = cuadroRetorno.total_bruto
    ?? cuadroRetorno.filas.reduce((s, f) => s + (f.bruto ?? 0), 0);
  const totalNeto  = cuadroRetorno.total_neto
    ?? cuadroRetorno.filas.reduce((s, f) => s + (f.neto  ?? 0), 0);

  const balMgr = new BalanceManager(pool);
  const { saldo_antes, saldo_despues } = await balMgr.ajusteManual({
    clientId,
    monto:       -totalBruto,
    descripcion: `IAS dispersión semanal — ${cuadroRetorno.filas.length} beneficiarios`,
    adminId:     null,
  });

  const [opResult] = await pool.query(
    `INSERT INTO fin_operations
       (client_id, tipo_operacion, monto_bruto, comision_pct, costo_pct, monto_neto,
        es_entrada, tipo_entrega, subtabla_json, estado, saldo_antes, saldo_despues, telegram_chat_id)
     VALUES (?, 'IAS', ?, 0, NULL, ?, 0, 'efectivo', ?, 'confirmada', ?, ?, ?)`,
    [
      clientId, totalBruto, totalNeto,
      JSON.stringify(cuadroRetorno.filas),
      saldo_antes, saldo_despues, chatId ?? null,
    ]
  );

  const cuentasDetectadas = cuadroRetorno.filas
    .filter(f => f.clabe && /^\d{18}$/.test(f.clabe))
    .map(f => ({ tipo: 'CLABE', numero: f.clabe, titular: f.nombre ?? null, banco: f.banco ?? null }));

  if (cuentasDetectadas.length) {
    const bankMgr = new BankingManager(pool);
    bankMgr.guardarCuentas(clientId, opResult.insertId, cuentasDetectadas)
      .catch(e => console.error('[CuadroRetornoNode] guardarCuentas:', e.message));
  }

  const n = cuadroRetorno.filas.length;
  const cuentaMsg = cuentasDetectadas.length
    ? ` También guardé ${cuentasDetectadas.length} CLABE(s) de los beneficiarios.`
    : '';

  const msg =
    `Listo, recibí el cuadro IAS ✅\n\n` +
    `${n} beneficiari${n === 1 ? 'o' : 'os'} · Neto <b>$${fmt(totalNeto)}</b> · Bruto <b>$${fmt(totalBruto)}</b>\n` +
    `Tu saldo quedó en <b>$${fmt(saldo_despues)}</b> (antes $${fmt(saldo_antes)}).` +
    cuentaMsg;

  return {
    replyMessages: [{ text: msg, opts: { parse_mode: 'HTML' } }],
    sessionEstado: 'completado',
    nextAction:    'done',
  };
}

module.exports = cuadroRetornoNode;
