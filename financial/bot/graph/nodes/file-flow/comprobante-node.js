'use strict';
/**
 * ComprobanteNode — Confirma un comprobante de pago recibido (LangGraph Parte 5).
 *
 * Extrae lógica de handleAsistenteModo() sección comprobante — financial-bot.js:269-344.
 *
 * Lee:   state.detectedFile, state.client, state.chatId, state._pool
 * Escribe: state.replyMessages, state.sessionEstado, state.nextAction
 */

const BalanceManager = require('../../../agents/balance-manager');
const { fmt }        = require('../../../agents/calculator');

async function comprobanteNode(state) {
  const { detectedFile, client, chatId } = state;
  const pool     = state._pool;
  const clientId = client?.id;

  if (!detectedFile?.monto_total) {
    return { nextAction: null, error: 'ComprobanteNode: no hay monto_total en el comprobante' };
  }
  if (!pool)     return { error: 'ComprobanteNode: pool no disponible' };
  if (!clientId) return { error: 'ComprobanteNode: clientId no disponible' };

  const montoComprobante = detectedFile.monto_total;

  let saldo_antes, saldo_despues;
  try {
    const balMgr = new BalanceManager(pool);
    ({ saldo_antes, saldo_despues } = await balMgr.confirmarPago({
      clientId,
      montoComprobante,
      descripcion: `Comprobante pago $${fmt(montoComprobante)}`,
      chatId: chatId ?? null,
    }));
  } catch (e) {
    console.error('[ComprobanteNode] confirmarPago:', e.message);
    return {
      replyMessages: [{ text: `⚠️ Comprobante recibido ($${fmt(montoComprobante)}) pero no pude actualizar el saldo: ${e.message}`, opts: {} }],
      nextAction: null,
    };
  }

  const msg =
    `✅ <b>Comprobante registrado</b>\n` +
    `Monto: <b>$${fmt(montoComprobante)}</b>\n` +
    `Saldo: $${fmt(saldo_antes)} → <b>$${fmt(saldo_despues)}</b>`;

  return {
    replyMessages: [{ text: msg, opts: { parse_mode: 'HTML' } }],
    sessionEstado: 'completado',
    nextAction:    'done',
  };
}

module.exports = comprobanteNode;
