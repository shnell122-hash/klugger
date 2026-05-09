'use strict';
/**
 * FileTypeDetectorNode — Primer nodo del FileFlowGraph (LangGraph Parte 5).
 *
 * Descarga el archivo de Telegram, detecta su tipo y decide el siguiente nodo.
 *
 * Lee:   state.inputFileId, state.inputMimeType, state.inputFileName
 * Escribe: state.inputBuffer, state.detectedFile, state.cuadroRetorno, state.nextAction
 *
 * nextAction:
 *   'cuadro_retorno'      → cuadro IAS (PNG/XLSX con tabla de beneficiarios)
 *   'comprobante'         → comprobante de pago con monto_total
 *   'banking_extraction'  → imagen/PDF con datos bancarios (CLABE/tarjeta)
 *   null → '__end__'      → archivo no reconocido, silencio
 */

const DocumentIntelligenceAgent = require('../../../agents/DocumentIntelligenceAgent');
const BankingManager            = require('../../../agents/banking-manager');
const { downloadTelegramFileAsBuffer } = require('../../../tools/file-handler');

async function fileTypeDetectorNode(state) {
  const { inputFileId, inputMimeType, inputFileName, client } = state;

  if (!inputFileId) {
    return { nextAction: null, error: 'FileTypeDetectorNode: no hay file_id en el estado' };
  }

  const BOT_TOKEN = process.env.FIN_TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    return { nextAction: null, error: 'FileTypeDetectorNode: BOT_TOKEN no configurado' };
  }

  let buffer;
  try {
    buffer = await downloadTelegramFileAsBuffer(BOT_TOKEN, inputFileId);
  } catch (e) {
    console.error('[FileTypeDetectorNode] descarga:', e.message);
    return { nextAction: null, error: `Descarga fallida: ${e.message}` };
  }

  const mimeType = inputMimeType ?? 'application/octet-stream';
  const fileName = inputFileName ?? '';
  const ext      = fileName.split('.').pop()?.toLowerCase() ?? '';

  // ── 1. XLSX/XLS: cuadro de retorno IAS ───────────────────────────────────────────────
  if (ext === 'xlsx' || ext === 'xls' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    try {
      const xlsxResult = BankingManager.parsearXlsx(buffer);
      if (xlsxResult?.tipo === 'cuadro_retorno' && xlsxResult.filas?.length > 0) {
        return {
          inputBuffer:  buffer,
          cuadroRetorno: xlsxResult,
          nextAction:   'cuadro_retorno',
        };
      }
    } catch (e) {
      console.error('[FileTypeDetectorNode] parsearXlsx:', e.message);
    }
  }

  // ── 2. Imagen: intentar cuadro de retorno primero ───────────────────────────────────────
  if (mimeType.startsWith('image/') && process.env.GOOGLE_API_KEY) {
    const docAgent = new DocumentIntelligenceAgent(process.env.GOOGLE_API_KEY);
    try {
      const cuadro = await docAgent.analizarCuadroRetorno(buffer, mimeType).catch(() => null);
      if (cuadro?.tipo === 'cuadro_retorno' && cuadro.filas?.length > 0) {
        return {
          inputBuffer:  buffer,
          cuadroRetorno: cuadro,
          nextAction:   'cuadro_retorno',
        };
      }
    } catch (e) {
      console.error('[FileTypeDetectorNode] analizarCuadroRetorno:', e.message);
    }
  }

  // ── 3. Documento/imagen: detectar tipo genérico ───────────────────────────────────────
  let detected = null;
  if (process.env.GOOGLE_API_KEY) {
    const docAgent = new DocumentIntelligenceAgent(process.env.GOOGLE_API_KEY);
    try {
      detected = await docAgent.procesarBuffer(buffer, mimeType, fileName);
    } catch (e) {
      console.error('[FileTypeDetectorNode] procesarBuffer:', e.message);
    }
  }

  if (!detected && process.env.DEEPSEEK_API_KEY) {
    try {
      const InvoiceAgent = require('../../../agents/invoice-agent');
      const { OpenAI } = require('openai');
      const llm = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' });
      const inv = new InvoiceAgent(llm);
      detected = await inv.procesarBuffer(buffer, mimeType, fileName);
    } catch (e) {
      console.error('[FileTypeDetectorNode] invoiceAgent fallback:', e.message);
    }
  }

  if (!detected) {
    return { inputBuffer: buffer, nextAction: null };
  }

  // Comprobante de pago (con monto total)
  if (detected.monto_total && (detected.tipo === 'comprobante' || detected.tipo === 'factura')) {
    return {
      inputBuffer:  buffer,
      detectedFile: detected,
      nextAction:   'comprobante',
    };
  }

  // Datos bancarios (CLABE/tarjeta)
  if (detected.datos_bancarios?.length > 0) {
    return {
      inputBuffer:  buffer,
      detectedFile: detected,
      nextAction:   'banking_extraction',
    };
  }

  // Archivo no reconocido
  return { inputBuffer: buffer, detectedFile: detected, nextAction: null };
}

module.exports = fileTypeDetectorNode;
