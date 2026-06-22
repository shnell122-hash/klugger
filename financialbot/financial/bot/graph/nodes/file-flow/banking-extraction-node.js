'use strict';
/**
 * BankingExtractionNode — Extrae y guarda cuentas bancarias de una imagen/PDF.
 * LangGraph Parte 5.
 *
 * Lee:   state.detectedFile, state.inputBuffer, state.inputMimeType, state.client, state._pool
 * Escribe: state.bankingAccounts, state.replyMessages, state.nextAction
 */

const BankingManager            = require('../../../agents/banking-manager');
const DocumentIntelligenceAgent = require('../../../agents/DocumentIntelligenceAgent');

// Cuentas propias del sistema (no guardar como cuentas de clientes)
const CUENTAS_PROPIAS = new Set([
  '058597000030773833',
  '058597000068994820',
]);

function filtrarCuentasAjenas(cuentas) {
  return (cuentas ?? []).filter(c => !CUENTAS_PROPIAS.has(c.numero));
}

async function bankingExtractionNode(state) {
  const { detectedFile, inputBuffer, inputMimeType, client } = state;
  const pool     = state._pool;
  const clientId = client?.id;

  if (!pool)     return { error: 'BankingExtractionNode: pool no disponible' };
  if (!clientId) return { error: 'BankingExtractionNode: clientId no disponible' };

  let cuentas = detectedFile?.datos_bancarios ?? [];

  if (!cuentas.length && inputBuffer && process.env.GOOGLE_API_KEY) {
    try {
      const docAgent = new DocumentIntelligenceAgent(process.env.GOOGLE_API_KEY);
      cuentas = await docAgent.extraerCuentasBancarias(inputBuffer, inputMimeType ?? 'image/jpeg');
    } catch (e) {
      console.error('[BankingExtractionNode] extraerCuentasBancarias:', e.message);
    }
  }

  const cuentasAjenas = filtrarCuentasAjenas(cuentas);

  if (!cuentasAjenas.length) {
    return {
      replyMessages: [{ text: 'No encontré cuentas bancarias nuevas en el archivo.', opts: {} }],
      nextAction: null,
    };
  }

  const bankMgr = new BankingManager(pool);
  await bankMgr.guardarCuentas(clientId, null, cuentasAjenas)
    .catch(e => console.error('[BankingExtractionNode] guardarCuentas:', e.message));

  const lista = cuentasAjenas
    .map(c => `• ${c.tipo} <code>${c.numero}</code>${c.titular ? ` — ${c.titular}` : ''}`)
    .join('\n');

  const n   = cuentasAjenas.length;
  const msg = `Guardé ${n} cuenta${n === 1 ? '' : 's'} bancaria${n === 1 ? '' : 's'} 💳\n\n${lista}`;

  return {
    bankingAccounts: cuentasAjenas,
    replyMessages:   [{ text: msg, opts: { parse_mode: 'HTML' } }],
    nextAction:      'done',
  };
}

module.exports = bankingExtractionNode;
