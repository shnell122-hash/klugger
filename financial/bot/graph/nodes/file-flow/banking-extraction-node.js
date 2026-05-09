'use strict';
/**
 * BankingExtractionNode — Extrae y guarda cuentas bancarias de una imagen/PDF (LangGraph Parte 5).
 */

const BankingManager            = require('../../../agents/banking-manager');
const DocumentIntelligenceAgent = require('../../../agents/DocumentIntelligenceAgent');

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
      replyMessages: [{ text: 'ℹ️ No encontré cuentas bancarias nuevas en el archivo.', opts: {} }],
      nextAction: null,
    };
  }

  const bankMgr = new BankingManager(pool);
  await bankMgr.guardarCuentas(clientId, null, cuentasAjenas)
    .catch(e => console.error('[BankingExtractionNode] guardarCuentas:', e.message));

  const lista = cuentasAjenas
    .map(c => `• ${c.tipo} ${c.numero}${c.titular ? ` (${c.titular})` : ''}`)
    .join('\n');

  const msg = `💳 <b>${cuentasAjenas.length} cuenta(s) guardada(s)</b>\n${lista}`;

  return {
    bankingAccounts: cuentasAjenas,
    replyMessages:   [{ text: msg, opts: { parse_mode: 'HTML' } }],
    nextAction:      'done',
  };
}

module.exports = bankingExtractionNode;
