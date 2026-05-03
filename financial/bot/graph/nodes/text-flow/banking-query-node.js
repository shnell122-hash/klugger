'use strict';
/**
 * BankingQueryNode — Quinto nodo del TextFlowGraph (Parte 4).
 *
 * Para operaciones salientes bancarias (IAS, SPEI, SINDICATO, TARJETAS):
 *   - Consulta cuentas bancarias recientes del cliente
 *   - Construye mensaje HTML con inline keyboard si hay cuentas guardadas
 *   - Si no hay cuentas: pide CLABE/datos libremente
 *   - Si ya hay cuentas_bancarias en el draft: salta a confirmación
 *
 * Lee:   state.draft, state.client, state._pool
 * Escribe: state.bankingAccounts, state.replyMessages, state.nextAction,
 *          state.sessionEstado
 */

const BankingManager = require('../../../agents/banking-manager');
const { fmt }        = require('../../../agents/calculator');

const TIPOS_BANCARIOS = ['IAS', 'SPEI', 'SINDICATO', 'TARJETAS'];

async function bankingQueryNode(state) {
  const { draft, client } = state;
  const pool = state._pool;

  const tipo      = draft?.tipo_operacion?.toUpperCase();
  const es_entrada = draft?.es_entrada ?? false;
  const montoNeto = draft?.monto_neto ?? draft?.monto_bruto ?? 0;

  // Cuentas bancarias solo para salidas bancarias
  if (!TIPOS_BANCARIOS.includes(tipo) || es_entrada) {
    // Saltar directo a confirmación (EFECTIVO, entradas, etc.)
    return { nextAction: 'confirmation' };
  }

  // Si el draft ya tiene cuentas → ir directamente a confirmación
  if (draft?.cuentas_bancarias?.length) {
    return { nextAction: 'confirmation' };
  }

  let cuentas = [];
  if (pool && client?.id) {
    try {
      const bm = new BankingManager(pool);
      cuentas = await bm.getCuentasRecientes(client.id, 3);
    } catch (err) {
      console.error('[BankingQueryNode] getCuentasRecientes:', err.message);
    }
  }

  const replyMessages = [];

  if (cuentas.length) {
    // Construir teclado inline con cuentas recientes
    const filas = cuentas.map(c => {
      const label = `${c.tipo} ···${c.numero.slice(-4)}${c.banco ? ' · ' + c.banco : ''}`;
      return [{ text: label, callback_data: `usar_cuenta_${c.id}` }];
    });
    filas.push([{ text: '➕ Nuevos datos', callback_data: 'nueva_cuenta' }]);

    replyMessages.push({
      text:
        `💳 <b>Datos bancarios para el pago de $${fmt(montoNeto)}</b>\n\n` +
        `Cuentas registradas:\n\n${BankingManager.formatearCuentas(cuentas)}\n\n¿Cuál usar?`,
      opts: {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: filas },
      },
    });
  } else {
    replyMessages.push({
      text:
        `💳 ¿A qué cuenta se realizará el pago de <b>$${fmt(montoNeto)}</b>?\n\n` +
        `Puedes enviarme:\n` +
        `• CLABE (18 dígitos), número de tarjeta o cuenta\n` +
        `• Archivo <b>Excel, CSV o TXT</b> con varias cuentas\n\n` +
        `Incluye banco y nombre del titular si tienes.`,
      opts: { parse_mode: 'HTML' },
    });
  }

  return {
    bankingAccounts: cuentas,
    replyMessages,
    nextAction:     'await_banking',
    sessionEstado:  cuentas.length ? 'confirmando_cuentas' : 'esperando_datos_bancarios',
  };
}

module.exports = bankingQueryNode;
