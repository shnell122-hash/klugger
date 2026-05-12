'use strict';
/**
 * ComprobanteNode — Registra un comprobante de pago recibido.
 * LangGraph Parte 5.
 *
 * Lee:   state.detectedFile, state.client, state.chatId, state._pool,
 *        state._mensajesRecientes, state.inputFileId
 * Escribe: state.replyMessages, state.sessionEstado, state.nextAction
 */

const BalanceManager = require('../../../agents/balance-manager');
const { fmt }        = require('../../../agents/calculator');
const { detectType, getCommission } = require('../../../config/commissions');

async function comprobanteNode(state) {
  const { detectedFile, client, chatId, _mensajesRecientes, inputFileId } = state;
  const pool     = state._pool;
  const clientId = client?.id;

  if (!detectedFile?.monto_total) {
    return { nextAction: null, error: 'ComprobanteNode: no hay monto_total en el comprobante' };
  }
  if (!pool)     return { error: 'ComprobanteNode: pool no disponible' };
  if (!clientId) return { error: 'ComprobanteNode: clientId no disponible' };

  const monto = detectedFile.monto_total;

  // Inferir tipo de operación desde contexto reciente
  const textoCtx = (_mensajesRecientes ?? []).filter(m => m.texto).map(m => m.texto).join(' ');
  const tipoOp   = (detectedFile.tipo_operacion || detectType(textoCtx) || null)?.toUpperCase() ?? null;

  // Comisión
  let pct = 0;
  try {
    const comision = await getCommission(tipoOp ?? 'SPEI', pool, clientId);
    pct = comision?.pct ?? 0.03;
    // SPEI/EFECTIVO con saldo neto positivo → sin comisión
    const saldoNeto = parseFloat(client.saldo ?? 0);
    const BASE_TIPOS = ['SPEI', 'EFECTIVO'];
    if ((!tipoOp || BASE_TIPOS.includes(tipoOp)) && saldoNeto > 0) pct = 0;
  } catch (_) {}

  const montoNeto = Math.round(monto * (1 - pct) * 100) / 100;

  let saldo_antes, saldo_despues;
  try {
    const balMgr = new BalanceManager(pool);
    ({ saldo_antes, saldo_despues } = await balMgr.confirmarPago({
      clientId,
      monto,
      montoNeto,
      tipo:             detectedFile.tipo ?? 'comprobante',
      tipo_operacion:   tipoOp,
      comision_pct:     pct,
      telegram_file_id: inputFileId ?? null,
      notas:            'Auto-registrado (FileFlowGraph)',
    }));
  } catch (e) {
    console.error('[ComprobanteNode] confirmarPago:', e.message);
    return {
      replyMessages: [{
        text: `Recibí tu comprobante por <b>$${fmt(monto)}</b>, pero tuve un error al actualizar el saldo. Avísale a German.`,
        opts: { parse_mode: 'HTML' },
      }],
      nextAction: null,
    };
  }

  const comisionMsg = pct > 0
    ? ` (comisión ${(pct * 100).toFixed(1)}% = $${fmt(monto - montoNeto)})`
    : '';

  const msg =
    `Perfecto, ya registré tu pago ✅\n\n` +
    `Monto recibido: <b>$${fmt(monto)}</b>${comisionMsg}\n` +
    `Tu saldo quedó en <b>$${fmt(saldo_despues)}</b> (antes $${fmt(saldo_antes)}).`;

  return {
    replyMessages: [{ text: msg, opts: { parse_mode: 'HTML' } }],
    sessionEstado: 'completado',
    nextAction:    'done',
  };
}

module.exports = comprobanteNode;
