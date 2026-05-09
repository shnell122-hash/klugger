'use strict';
/**
 * Financial Bot — Bot principal de Telegram para operaciones financieras.
 *
 * Reutiliza la arquitectura de relay/chat-agent.js (grammy + Anthropic SDK + MySQL).
 * Orquesta todos los agentes: Parser → Calculator → BalanceManager → PollHandler → Verifier
 *
 * El bot solo responde cuando:
 *   1. Se usa /operacion [args]
 *   2. El texto parece una solicitud de operación explícita
 *   3. Hay una sesión activa de confirmación/edición
 *   4. El admin usa comandos de administración (/saldo, /historial, /ajuste)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Bot, GrammyError, HttpError, InlineKeyboard } = require('grammy');
const OpenAI = require('openai');
const mysql  = require('mysql2/promise');

const { parseCommand, parseNaturalText, isOperacionCommand, isImplicitOperacion } = require('./agents/parser');
const { calcularMontos, proyectarSaldo, fmt }   = require('./agents/calculator');
const BalanceManager  = require('./agents/balance-manager');
const { PollHandler } = require('./agents/poll-handler');
const Verifier        = require('./agents/verifier');
const ResponseGen     = require('./agents/response-gen');
const { getCommission, listTypes, registrarComisionista, detectType } = require('./config/commissions');
const q = require('../db/financial-queries');
const { handleIncomingFile, handleIncomingLink, extractFileFromMessage, downloadTelegramFileAsBuffer } = require('./tools/file-handler');
const BankingManager  = require('./agents/banking-manager');
const InvoiceAgent    = require('./agents/invoice-agent');
const VisionAgent     = require('./agents/vision-agent');
const ContextReader   = require('./agents/context-reader');
const ContextManager  = require('./agents/context-manager');
const DocumentIntelligenceAgent = require('./agents/DocumentIntelligenceAgent');
const TransactionOrchestrator   = require('./agents/TransactionOrchestrator');

// ── Config ──────────────────────────────────────────────────────────────────────────────
const BOT_TOKEN     = process.env.FIN_TELEGRAM_BOT_TOKEN;
const ALLOWED_CHATS = (process.env.FIN_ALLOWED_CHAT_IDS ?? '').split(',').map(s => BigInt(s.trim())).filter(Boolean);
// Set mutable: se carga desde .env + DB al arrancar
const ADMIN_USER_IDS = new Set(
  (process.env.FIN_ADMIN_USER_IDS ?? '').split(',').map(s => parseInt(s.trim())).filter(Boolean)
);
const DEEPSEEK_KEY  = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL  = 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL= 'deepseek-chat';

if (!BOT_TOKEN) throw new Error('FIN_TELEGRAM_BOT_TOKEN no está configurado');

const LLM_KEYS_STATUS = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'set' : 'missing',
  GOOGLE_API_KEY:    process.env.GOOGLE_API_KEY    ? 'set' : 'missing',
  DEEPSEEK_API_KEY:  process.env.DEEPSEEK_API_KEY  ? 'set' : 'missing',
};
console.log('[startup] LLM keys status:', LLM_KEYS_STATUS);

// ── Init servicios ───────────────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST     ?? '127.0.0.1',
  port:     process.env.DB_PORT     ?? 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME     ?? 'ai_monitoring',
  waitForConnections: true,
  connectionLimit: 5,
  timezone: '+00:00',
});

const llm = new OpenAI({ apiKey: DEEPSEEK_KEY, baseURL: DEEPSEEK_URL });

const pctStr = (pct) => `${(pct * 100).toFixed(1).replace('.0', '')}%`;

const bot            = new Bot(BOT_TOKEN);
const balanceManager  = new BalanceManager(pool);
const bankingManager  = new BankingManager(pool);
const pollHandler    = new PollHandler(bot);
const verifier       = new Verifier();
const logUsageFn = async (usage) => {
    try {
      await pool.query(
        `INSERT INTO fin_llm_usage (agent_name, model, provider, tokens_in, tokens_out, cost_usd, duration_ms)
         VALUES (?,?,?,?,?,?,?)`,
        [usage.agent_name, usage.model, 'deepseek',
         usage.tokens_in, usage.tokens_out,
         calcLLMCost(usage.tokens_in, usage.tokens_out),
         usage.duration_ms ?? 0]
      );
    } catch (e) { console.error('[llm-usage]', e.message); }
  };

const responseGen      = new ResponseGen(llm,   { model: DEEPSEEK_MODEL, logUsage: logUsageFn });
const invoiceAgent     = new InvoiceAgent(llm,   { model: DEEPSEEK_MODEL, logUsage: logUsageFn });
const contextManager   = new ContextManager(pool);
const contextReader    = new ContextReader(llm,   { model: DEEPSEEK_MODEL });
const visionAgent      = process.env.ANTHROPIC_API_KEY
  ? new VisionAgent(process.env.ANTHROPIC_API_KEY)
  : null;
const docAgent = process.env.GOOGLE_API_KEY
  ? new DocumentIntelligenceAgent(process.env.GOOGLE_API_KEY)
  : null;
const transactionOrchestrator = DEEPSEEK_KEY
  ? new TransactionOrchestrator(llm, { model: process.env.DEEPSEEK_PRO_MODEL ?? 'deepseek-v4-pro' })
  : null;

// ── Transformer: log bot outgoing messages ────────────────────────────────────────────
bot.api.config.use(async (prev, method, payload, signal) => {
  const result = await prev(method, payload, signal);
  if (result.ok && (method === 'sendMessage' || method === 'sendPhoto' || method === 'sendDocument')) {
    const chatId = payload?.chat_id;
    const text   = payload?.text ?? payload?.caption ?? null;
    const msgId  = result.result?.message_id ?? null;
    const tipo   = method === 'sendPhoto' ? 'foto' : method === 'sendDocument' ? 'documento' : 'texto';
    if (chatId) {
      contextManager.logMessage({
        chatId: String(chatId),
        telegramMsgId: msgId,
        tipo,
        texto: text ? String(text).slice(0, 4000) : null,
        esBot: true,
      }).catch(() => {});
    }
  }
  return result;
});

// ── Helpers ──────────────────────────────────────────────────────────────────────────────
function isAllowedChat(ctx) {
  if (ALLOWED_CHATS.length === 0) return true;
  return ALLOWED_CHATS.includes(BigInt(ctx.chat?.id ?? 0));
}

async function getChatModo(chatId) {
  try {
    const [r] = await pool.query('SELECT modo FROM fin_chats WHERE chat_id=?', [chatId]);
    return r[0]?.modo ?? 'normal';
  } catch { return 'normal'; }
}

// Registra un cuadro de retorno IAS completo: descuenta bruto del saldo, guarda CLABEs, inserta operación
async function handleCuadroRetorno(ctx, client, cuadro) {
  const chatId    = ctx.chat?.id;
  const totalBruto = cuadro.total_bruto
    || cuadro.filas.reduce((s, f) => s + (f.bruto ?? 0), 0);
  const totalNeto  = cuadro.total_neto
    || cuadro.filas.reduce((s, f) => s + (f.neto  ?? 0), 0);

  // Descontar bruto del saldo (salida)
  const { saldo_antes, saldo_despues } = await balanceManager.ajusteManual({
    clientId:    client.id,
    monto:       -totalBruto,
    descripcion: `IAS dispersión semanal — ${cuadro.filas.length} beneficiarios`,
    adminId:     null,
  });

  // Insertar operación IAS
  const [opResult] = await pool.query(
    `INSERT INTO fin_operations
       (client_id, tipo_operacion, monto_bruto, comision_pct, costo_pct, monto_neto,
        es_entrada, tipo_entrega, subtabla_json, estado, saldo_antes, saldo_despues, telegram_chat_id)
     VALUES (?, 'IAS', ?, 0, NULL, ?, 0, 'efectivo', ?, 'confirmada', ?, ?, ?)`,
    [
      client.id, totalBruto, totalNeto,
      JSON.stringify(cuadro.filas),
      saldo_antes, saldo_despues, chatId,
    ]
  );

  // Guardar CLABEs de los beneficiarios (si vienen en la tabla)
  const cuentasDetectadas = cuadro.filas
    .filter(f => f.clabe && /^\d{18}$/.test(f.clabe))
    .map(f => ({ tipo: 'CLABE', numero: f.clabe, titular: f.nombre ?? null, banco: f.banco ?? null }));
  if (cuentasDetectadas.length) {
    await bankingManager.guardarCuentas(client.id, opResult.insertId, cuentasDetectadas)
      .catch(e => console.error('[handleCuadroRetorno] guardarCuentas:', e.message));
  }

  const semMatch = null; // semana no siempre disponible
  let msg = `📋 <b>Cuadro IAS registrado</b>\n`;
  msg += `${cuadro.filas.length} beneficiarios · Neto: <b>$${fmt(totalNeto)}</b> · Bruto: <b>$${fmt(totalBruto)}</b>\n`;
  msg += `Saldo: $${fmt(saldo_antes)} → <b>$${fmt(saldo_despues)}</b>`;
  if (cuentasDetectadas.length) {
    msg += `\n💳 ${cuentasDetectadas.length} CLABE(s) guardada(s)`;
  }
  await ctx.reply(msg, { parse_mode: 'HTML' });
}

// Modo asistente: maneja fotos/docs silenciosamente — registra comprobantes y cuentas
async function handleAsistenteModo(ctx, client, fileInfo) {
  if (fileInfo.isLink) return;
  const chatId = ctx.chat?.id;
  try {
    const buffer   = await downloadTelegramFileAsBuffer(BOT_TOKEN, fileInfo.file.file_id);
    const mimeType = fileInfo.mimeType ?? 'image/jpeg';
    const fileName = fileInfo.fileName ?? null;

    // 0 — XLSX: detectar formato cuadro de retorno antes de cualquier otra cosa
    const ext = (fileName ?? '').split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      const xlsxResult = BankingManager.parsearXlsx(buffer);
      if (xlsxResult?.tipo === 'cuadro_retorno' && xlsxResult.filas?.length > 0) {
        await handleCuadroRetorno(ctx, client, xlsxResult);
        return;
      }
    }

    // 1 — Detectar tipo de documento
    let detected = null;
    if (docAgent && !mimeType.startsWith('image/')) {
      detected = await docAgent.procesarBuffer(buffer, mimeType, fileName);
    }
    if (!detected) {
      detected = await invoiceAgent.procesarBuffer(buffer, mimeType, fileName);
    }

    // 1b — Imagen: intentar como cuadro de retorno IAS antes de comprobante
    if (docAgent && mimeType.startsWith('image/') && !detected?.monto_total) {
      const cuadro = await docAgent.analizarCuadroRetorno(buffer, mimeType).catch(() => null);
      if (cuadro?.tipo === 'cuadro_retorno' && cuadro.filas?.length > 0) {
        await handleCuadroRetorno(ctx, client, cuadro);
        return;
      }
    }

    // Para imágenes, usar visión para extraer cuentas o monto
    if (detected?.tipo === 'imagen_sin_ocr') {
      const imgAgent = docAgent ?? visionAgent;
      if (imgAgent) {
        let cuentas = [], visionResult = null;
        if (docAgent) {
          ({ cuentas, visionResult } = await docAgent.analizarImagenCompleta(buffer, mimeType));
          if (!cuentas.length && !visionResult && visionAgent) {
            ([{ cuentas }, visionResult] = await Promise.all([
              visionAgent.extraerCuentasBancarias(buffer, mimeType),
              visionAgent.analizarFactura(buffer, mimeType),
            ]));
          }
        } else {
          ([{ cuentas }, visionResult] = await Promise.all([
            imgAgent.extraerCuentasBancarias(buffer, mimeType),
            imgAgent.analizarFactura(buffer, mimeType),
          ]));
        }
        if (cuentas.length && !visionResult?.monto_total) {
          const { ajenas } = await filtrarCuentasAjenas(cuentas);
          if (ajenas.length) {
            await bankingManager.guardarCuentas(client.id, null, ajenas);
            await ctx.reply(`✅ Guardado · ${ajenas.length} cuenta(s) registrada(s)`);
            return;
          }
        }
        if (visionResult?.monto_total > 0) {
          detected = { tipo: 'comprobante', monto_total: visionResult.monto_total, tipo_operacion: null };
        }
      }
    }

    // 2 — Comprobante o factura detectados
    if ((detected?.tipo === 'comprobante' || detected?.tipo === 'factura') && detected.monto_total > 0) {
      const monto = detected.monto_total;

      const mensajesRecientes = await contextManager.getRecientes(chatId, 15);
      const textoContexto     = mensajesRecientes.filter(m => m.texto).map(m => m.texto).join(' ');
      const tipoOp = (detected.tipo_operacion || detectType(textoContexto) || null)?.toUpperCase() ?? null;

      const saldoNeto      = parseFloat(client.saldo ?? 0);
      const BASE_TIPOS     = ['SPEI', 'EFECTIVO'];
      const esBase         = !tipoOp || BASE_TIPOS.includes(tipoOp);
      const tieneCredito   = saldoNeto > 0;

      let pct = 0;
      let pctBase = 0;

      if (esBase && tieneCredito) {
        pct = 0;
      } else {
        const comisionOp   = await getCommission(tipoOp ?? 'SPEI', pool, client.id);
        const comisionBase = esBase ? comisionOp : await getCommission('SPEI', pool, client.id);
        pct      = comisionOp?.pct  ?? 0.03;
        pctBase  = comisionBase?.pct ?? 0.03;
      }

      const montoNeto           = Math.round(monto * (1 - pct) * 100) / 100;
      const saldo_bruto_antes   = parseFloat(client.saldo_bruto ?? client.saldo ?? 0);

      const { saldo_despues: saldo_neto_despues } = await balanceManager.confirmarPago({
        clientId:         client.id,
        monto,
        montoNeto,
        tipo:             detected.tipo ?? 'comprobante',
        tipo_operacion:   tipoOp,
        comision_pct:     pct,
        telegram_file_id: fileInfo.file.file_id,
        notas:            'Auto-registrado (modo asistente)',
      });

      const saldo_bruto_despues = Math.round((saldo_bruto_antes + monto) * 100) / 100;
      const comisionTotal       = Math.round((monto - montoNeto) * 100) / 100;

      const xPct = (!esBase && pct > pctBase)
        ? (1 - (1 - pct) / (1 - pctBase))
        : 0;

      let msg = `✅ <b>Comprobante registrado`;
      if (tipoOp) msg += ` [${tipoOp}]`;
      msg += `</b>  $${fmt(monto)}\n\n`;
      msg += `Saldo bruto:  <b>$${fmt(saldo_bruto_antes)}</b> → <b>$${fmt(saldo_bruto_despues)}</b>\n`;

      if (comisionTotal > 0) {
        if (xPct > 0) {
          const comBaseAmt = Math.round(monto * pctBase * 100) / 100;
          const comXAmt    = Math.round(comisionTotal - comBaseAmt) * 100 / 100;
          const xDisplay   = (xPct * 100).toFixed(2).replace(/\.?0+$/, '');
          msg += `Comisión:\n`;
          msg += `  Base ${BASE_TIPOS[0]} (${(pctBase*100).toFixed(1).replace('.0','')}%): <b>-$${fmt(comBaseAmt)}</b>\n`;
          msg += `  Ajuste ${tipoOp} (${xDisplay}% s/neto): <b>-$${fmt(comXAmt)}</b>\n`;
          msg += `  Total (${(pct*100).toFixed(1).replace('.0','')}% s/bruto): <b>-$${fmt(comisionTotal)}</b>\n`;
        } else {
          msg += `Comisión:     <b>-$${fmt(comisionTotal)}</b> (${(pct*100).toFixed(1).replace('.0','')}%)\n`;
        }
      } else if (esBase && tieneCredito) {
        msg += `Comisión:     <b>$0</b> (saldo previo cubre la operación)\n`;
      }

      msg += `Saldo neto:   <b>$${fmt(saldoNeto)}</b> → <b>$${fmt(saldo_neto_despues)}</b>`;
      await ctx.reply(msg, { parse_mode: 'HTML' });
      return;
    }

    // 3 — Cuentas bancarias en documento/PDF → guardar silenciosamente
    if (detected?.datos_bancarios?.length) {
      const { ajenas } = await filtrarCuentasAjenas(detected.datos_bancarios);
      if (ajenas.length) {
        await bankingManager.guardarCuentas(client.id, null, ajenas);
        await ctx.reply(`✅ Guardado · ${ajenas.length} cuenta(s) registrada(s)`);
        return;
      }
    }
    // 4 — Sin contenido relevante → silencio
  } catch (err) {
    console.error('[asistente-modo]', err.message);
  }
}

function isAdmin(userId) {
  return ADMIN_USER_IDS.has(userId);
}

async function filtrarCuentasAjenas(cuentas) {
  try {
    const nuestras = await q.getNuestrasCLABEs(pool);
    const ajenas   = cuentas.filter(c => !nuestras.has((c.numero ?? '').replace(/\s/g, '')));
    const eraVuelta = ajenas.length < cuentas.length;
    return { ajenas, eraVuelta };
  } catch {
    return { ajenas: cuentas, eraVuelta: false };
  }
}

function isComprobante(text) {
  const t = text ?? '';
  const hasSuccessLine = /transferencia exitosa|pago exitoso|operaci[oó]n exitosa|dep[oó]sito exitoso|transacci[oó]n exitosa/i.test(t);
  const hasReceptorOrdenante = /\b(receptor|beneficiario|destinatario|ordenante|remitente|emisor)\s*:/i.test(t);
  const hasMonto = /\b(monto|importe|cantidad|total)\s*:?\s*\$?[\d,]+\.?\d*\s*(MXN|USD)?/i.test(t);
  const hasReferencia = /\b(referencia|folio|no\.\s*op|num\s*op|numero\s*de\s*operacion)\s*:?\s*\d+/i.test(t);
  return hasSuccessLine || (hasReceptorOrdenante && hasMonto) || (hasReferencia && hasMonto);
}

function calcLLMCost(tokensIn, tokensOut) {
  return ((tokensIn * 0.07) + (tokensOut * 1.10)) / 1_000_000;
}

function parseDraft(json) {
  if (!json) return {};
  if (typeof json === 'object') return json;
  try { return JSON.parse(json); } catch { return {}; }
}

async function getOrCreateSession(chatId, clientId) {
  const [rows] = await pool.query(
    `SELECT * FROM fin_sessions
     WHERE chat_id=? AND estado != 'completado'
       AND updated_at > DATE_SUB(NOW(3), INTERVAL 4 HOUR)
     ORDER BY updated_at DESC LIMIT 1`,
    [chatId]
  );
  if (rows.length > 0) {
    return rows[0];
  }
  const [result] = await pool.query(
    'INSERT INTO fin_sessions (chat_id, client_id, estado) VALUES (?,?,?)',
    [chatId, clientId ?? null, 'idle']
  );
  const [newRows] = await pool.query('SELECT * FROM fin_sessions WHERE id=?', [result.insertId]);
  return newRows[0];
}

async function updateSession(sessionId, estado, draftJson = null) {
  await pool.query(
    'UPDATE fin_sessions SET estado=?, operation_draft_json=?, updated_at=NOW(3) WHERE id=?',
    [estado, draftJson ? JSON.stringify(draftJson) : null, sessionId]
  );
}

async function saveConfirmedOperation(draft, clientId, chatId, _attempt = 0) {
  const conn = await pool.getConnection();
  let operationId, saldo_antes, saldo_despues;
  try {
    await conn.beginTransaction();

    const subtablaJson = draft.tabla_pagos?.length
      ? JSON.stringify(draft.tabla_pagos)
      : null;

    const [result] = await conn.query(
      `INSERT INTO fin_operations
         (client_id, tipo_operacion, monto_bruto, comision_pct, costo_pct, monto_neto,
          es_entrada, solicita_neto, tipo_entrega, instrucciones_pago, direccion_entrega,
          subtabla_json, estado, tiene_factura, telegram_chat_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pendiente',?,?)`,
      [
        clientId, draft.tipo_operacion, draft.monto_bruto, draft.comision_pct,
        draft.costo_pct ?? null, draft.monto_neto,
        draft.es_entrada ? 1 : 0, draft.solicita_neto ? 1 : 0,
        draft.tipo_entrega ?? 'efectivo', draft.instrucciones_pago ?? null,
        draft.direccion_entrega ?? null, subtablaJson, draft.tiene_factura ? 1 : 0, chatId,
      ]
    );
    operationId = result.insertId;

    ({ saldo_antes, saldo_despues } = await balanceManager.aplicarOperacion(
      { operationId, clientId, monto_neto: draft.monto_neto, monto_bruto: draft.monto_bruto, es_entrada: draft.es_entrada },
      conn
    ));

    await conn.query(
      "UPDATE fin_operations SET estado='confirmada', updated_at=NOW(3) WHERE id=?",
      [operationId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if ((err.code === 'ER_LOCK_WAIT_TIMEOUT' || err.errno === 1205) && _attempt < 3) {
      conn.release();
      const delay = (2 ** _attempt) * 500;
      await new Promise(r => setTimeout(r, delay));
      return saveConfirmedOperation(draft, clientId, chatId, _attempt + 1);
    }
    throw err;
  } finally {
    conn.release();
  }

  if (draft.cuentas_bancarias?.length) {
    bankingManager.guardarCuentas(clientId, operationId, draft.cuentas_bancarias)
      .catch(err => console.error('[saveConfirmedOperation] guardarCuentas:', err.message));
  }

  registrarComisionista({
    pool,
    clientId,
    operationId,
    tipoOperacion: draft.tipo_operacion,
    montoBruto:    draft.monto_bruto,
  }).catch(err => console.error('[saveConfirmedOperation] registrarComisionista:', err.message));

  return { operationId, saldo_antes, saldo_despues };
}

// ── Handlers ──────────────────────────────────────────────────────────────────────────────

bot.use(async (ctx, next) => {
  const cmdText = ctx.message?.text ?? '';
  if (cmdText === '/miid' || cmdText.startsWith('/miid ')) { await next(); return; }
  if (!isAllowedChat(ctx)) return;
  await next();
});

bot.use(async (ctx, next) => {
  try {
    const msg      = ctx.message ?? ctx.channelPost;
    const chatId   = ctx.chat?.id;
    const from     = ctx.from;
    if (!chatId || !msg) { await next(); return; }

    const isGroup  = ['group','supergroup','channel'].includes(ctx.chat?.type);
    const titulo   = isGroup
      ? (ctx.chat?.title ?? null)
      : (from?.first_name ? `${from.first_name}${from.last_name ? ' ' + from.last_name : ''}` : null);

    contextManager.upsertChat({ chatId, titulo, isGroup }).catch(() => {});

    let tipo = 'texto';
    let texto = msg.text ?? msg.caption ?? null;
    let fileName = null;
    if (msg.photo)    { tipo = 'foto';      fileName = `foto_${msg.date}.jpg`; }
    if (msg.document) { tipo = 'documento'; fileName = msg.document.file_name ?? 'archivo'; texto = texto ?? fileName; }
    if (msg.voice)    { tipo = 'voz'; }
    if (msg.video)    { tipo = 'video'; }

    contextManager.logMessage({
      chatId,
      telegramMsgId: msg.message_id,
      fromUserId:    from?.id ?? null,
      fromUsername:  from?.username ?? null,
      tipo,
      texto,
      fileName,
      esBot: false,
    }).catch(() => {});
  } catch (_) {}

  await next();
});

bot.command('start', async (ctx) => {
  await ctx.reply(
    '👋 Bienvenido al sistema de operaciones financieras.\n\n' +
    'Usa <b>/operacion</b> para iniciar una operación o escríbeme directamente.\n\n' +
    'Ejemplos:\n' +
    '<code>/operacion IAS neto 100000</code>\n' +
    '<code>/operacion SPEI bruto 50000</code>\n' +
    '<code>/operacion</code> (asistido paso a paso)',
    { parse_mode: 'HTML' }
  );
});

bot.command('saldo', async (ctx) => {
  try {
    const client = await balanceManager.getOrCreateClient(
      ctx.from?.id, ctx.from?.username
    );
    await ctx.reply(
      `💰 Saldo actual: <b>$${fmt(client.saldo)}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    await ctx.reply('Error consultando saldo.');
  }
});

bot.command('historial', async (ctx) => {
  try {
    const client = await balanceManager.getOrCreateClient(ctx.from?.id, ctx.from?.username);
    const hist   = await balanceManager.getHistorial(client.id, 10, 0);
    if (!hist.length) {
      await ctx.reply('Sin movimientos registrados.');
      return;
    }
    const lineas = hist.map(h =>
      `• ${h.tipo_movimiento.padEnd(15)} $${fmt(h.monto).padStart(12)} → $${fmt(h.saldo_despues)}`
    );
    await ctx.reply(
      `📋 <b>Últimos movimientos:</b>\n<pre>${lineas.join('\n')}</pre>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    await ctx.reply('Error consultando historial.');
  }
});

bot.command('ajuste', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.reply('⛔ Sin permisos.');
    return;
  }
  const args = (ctx.match ?? '').trim().split(/\s+/).filter(Boolean);
  let client, nuevoSaldo, desc;

  const isNumeric = s => /^-?\d+(\.\d+)?$/.test(s);
  const firstNumIdx = args.findIndex(isNumeric);

  if (firstNumIdx > 0) {
    const nameQuery = args.slice(0, firstNumIdx).join(' ').replace(/^@/, '');
    nuevoSaldo = parseFloat(args[firstNumIdx]);
    desc       = args.slice(firstNumIdx + 1).join(' ') || 'Ajuste manual';
    const [rows] = await pool.query(
      'SELECT * FROM fin_clients WHERE LOWER(nombre)=LOWER(?) OR LOWER(telegram_username)=LOWER(?) LIMIT 1',
      [nameQuery, nameQuery]
    );
    if (!rows.length) {
      await ctx.reply(`❌ Cliente "${nameQuery}" no encontrado.`);
      return;
    }
    client = rows[0];
  } else if (firstNumIdx === 0) {
    const replyTo = ctx.message?.reply_to_message?.from?.id;
    if (!replyTo) {
      await ctx.reply('Uso: /ajuste [nombre o @username] nuevo_saldo [descripcion]\n     o responde al mensaje del cliente con /ajuste nuevo_saldo [descripcion]');
      return;
    }
    client     = await balanceManager.getOrCreateClient(replyTo);
    nuevoSaldo = parseFloat(args[0]);
    desc       = args.slice(1).join(' ') || 'Ajuste manual';
  } else {
    await ctx.reply('Uso: /ajuste [nombre o @username] nuevo_saldo [descripcion]');
    return;
  }

  try {
    const saldoActual = parseFloat(client.saldo ?? 0);
    const delta       = nuevoSaldo - saldoActual;
    const signo       = delta >= 0 ? '+' : '';
    const { saldo_antes, saldo_despues } = await balanceManager.ajusteManual({
      clientId: client.id, monto: delta, descripcion: desc, adminId: ctx.from?.id,
    });
    await ctx.reply(
      `✅ Ajuste aplicado a <b>${client.nombre ?? client.telegram_username}</b>.\n` +
      `Saldo: $${fmt(saldo_antes)} → <b>$${fmt(saldo_despues)}</b>\n` +
      `Movimiento: ${signo}${fmt(delta)}`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    await ctx.reply(`Error: ${err.message}`);
  }
});

bot.command('reset', async (ctx) => {
  try {
    const userId  = ctx.from?.id;
    const chatId  = ctx.chat?.id;
    const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
    const session = await getOrCreateSession(chatId, client.id);
    await updateSession(session.id, 'completado', null);
    await ctx.reply('🔄 Sesión reiniciada. Puedes empezar de nuevo.');
  } catch (err) {
    await ctx.reply('⚠️ No pude reiniciar la sesión. Intenta de nuevo.').catch(() => {});
  }
});

const testModeChats = new Set();
bot.command('testmode', async (ctx) => {
  const userId = ctx.from?.id;
  if (!ADMIN_USER_IDS.has(userId)) {
    await ctx.reply('⛔ Solo administradores pueden usar este comando.');
    return;
  }
  const chatId = ctx.chat?.id;
  if (testModeChats.has(chatId)) {
    testModeChats.delete(chatId);
    await ctx.reply('🧪 Modo prueba <b>desactivado</b>.', { parse_mode: 'HTML' });
  } else {
    testModeChats.add(chatId);
    await ctx.reply(
      '🧪 Modo prueba <b>activado</b>.\n' +
      'Los comprobantes de texto serán aceptados como pagos válidos sin validación de imagen.',
      { parse_mode: 'HTML' }
    );
  }
});

bot.command('operacion', async (ctx) => {
  const userId  = ctx.from?.id;
  const chatId  = ctx.chat?.id;
  const cmdArgs = ctx.match ?? '';

  const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
  const session = await getOrCreateSession(chatId, client.id);

  if (!cmdArgs.trim()) {
    const tipos = listTypes();
    await ctx.reply(responseGen.formatAskTipo(tipos), { parse_mode: 'HTML' });
    await updateSession(session.id, 'esperando_tipo', { clientId: client.id });
    return;
  }

  await procesarOperacion(ctx, cmdArgs, client, session);
});

bot.command('rol', async (ctx) => {
  const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const fromId    = String(ctx.from?.id ?? '');
  if (!ADMIN_IDS.includes(fromId)) {
    await ctx.reply('⛔ Solo los administradores pueden usar este comando.');
    return;
  }
  const arg = (ctx.match ?? '').trim().toLowerCase();
  const roles = ['cliente', 'proveedor', 'ambos'];
  if (!roles.includes(arg)) {
    await ctx.reply(`Uso: /rol <b>${roles.join(' | ')}</b>\nEjemplo: /rol proveedor`, { parse_mode: 'HTML' });
    return;
  }
  const chatId = ctx.chat?.id;
  const [rows] = await pool.query(
    `SELECT client_id FROM fin_sessions WHERE chat_id=? AND client_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1`,
    [chatId]
  );
  if (!rows.length) {
    await ctx.reply('No encontré un cliente vinculado a este chat. El usuario debe haber interactuado antes.');
    return;
  }
  const clientId = rows[0].client_id;
  await pool.query(`UPDATE fin_clients SET rol=? WHERE id=?`, [arg, clientId]);
  const labels = { cliente: '🏢 Cliente', proveedor: '\ud83c� Proveedor', ambos: '🔄 Ambos' };
  await ctx.reply(`✅ Rol actualizado: <b>${labels[arg]}</b>`, { parse_mode: 'HTML' });
});

bot.command('modo', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) { await ctx.reply('⛔ Sin permisos.'); return; }
  const arg = (ctx.match ?? '').trim().toLowerCase();
  if (!['normal', 'asistente'].includes(arg)) {
    await ctx.reply(
      'Uso: /modo <b>normal</b> | <b>asistente</b>\n\n' +
      '<b>normal</b> → modo interactivo para clientes (confirmaciones, flujos)\n' +
      '<b>asistente</b> → silencioso para grupos internos: solo registra comprobantes y cuentas',
      { parse_mode: 'HTML' }
    );
    return;
  }
  await pool.query(
    `INSERT INTO fin_chats (chat_id, modo, is_group, ultimo_msg_at)
     VALUES (?, ?, 0, NOW(3))
     ON DUPLICATE KEY UPDATE modo=VALUES(modo)`,
    [ctx.chat?.id, arg]
  );
  const labels = { normal: '🔄 Normal (modo cliente)', asistente: '🤫 Asistente silencioso' };
  await ctx.reply(`✅ Modo actualizado: <b>${labels[arg]}</b>`, { parse_mode: 'HTML' });
});

bot.on('message:text', async (ctx, next) => {
  const userId  = ctx.from?.id;
  const chatId  = ctx.chat?.id;
  const text    = ctx.message.text;

  if (text.startsWith('/')) return next();

  const _modoChat = await getChatModo(chatId);
  if (_modoChat === 'asistente') {
    const rawCuentas = BankingManager.parsearTexto(text);
    if (rawCuentas.length) {
      const clientAsist = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
      const { ajenas }  = await filtrarCuentasAjenas(rawCuentas);
      if (ajenas.length) {
        await bankingManager.guardarCuentas(clientAsist.id, null, ajenas);
        await ctx.reply(`✅ Guardado · ${ajenas.length} cuenta(s) registrada(s)`);
      }
    }
    return;
  }

  const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
  const session = await getOrCreateSession(chatId, client.id);

  if (pollHandler.hasPendingEdit(chatId)) {
    const { ok, error, operationDraft } = pollHandler.applyEditValue(chatId, text);
    if (!ok) {
      await ctx.reply(`⚠️ ${error}`);
      return;
    }
    await mostrarResumenYPoll(ctx, operationDraft, client, session);
    return;
  }

  if (session.estado === 'esperando_tipo') {
    await procesarOperacion(ctx, text, client, session);
    return;
  }
  if (session.estado === 'esperando_monto') {
    const draft = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
    await procesarOperacion(ctx, `${draft.tipo_operacion} ${text}`, client, session);
    return;
  }
  if (session.estado === 'esperando_entrega') {
    const draft = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
    draft.direccion_entrega = text;
    await mostrarResumenYPoll(ctx, draft, client, session);
    return;
  }
  if (session.estado === 'esperando_datos_bancarios') {
    const draft   = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
    if (isComprobante(text)) {
      await ctx.reply(
        '📝 Este texto parece un comprobante, no datos de cuenta para entrega.\n' +
        'Envíame la CLABE, número de tarjeta o cuenta a la que debo enviar el dinero.'
      );
      return;
    }
    const rawCuentas = BankingManager.parsearTexto(text);
    if (!rawCuentas.length) {
      await ctx.reply('No encontré ninguna CLABE, tarjeta ni cuenta. Envíame el número directamente.');
      return;
    }
    const { ajenas, eraVuelta } = await filtrarCuentasAjenas(rawCuentas);
    if (eraVuelta) {
      await ctx.reply(
        '⚠️ El número que enviaste coincide con una de nuestras cuentas bancarias.\n' +
        'Si ya realizaste la transferencia, comparte el comprobante completo o escribe el monto pagado.'
      );
      return;
    }
    const cuentas = ajenas;
    draft.cuentas_bancarias = cuentas;
    await updateSession(session.id, 'esperando_datos_bancarios', draft);
    const kb = new InlineKeyboard()
      .text('✅ Sí, continuar', 'confirmar_cuentas')
      .text('✏️ Corregir', 'nueva_cuenta');
    await safeReply(ctx,
      `✅ Cuenta guardada:\n\n${BankingManager.formatearCuentas(cuentas)}\n\n¿Es correcto?`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
    return;
  }
  if (session.estado === 'confirmando_cuentas') {
    const draft = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
    const rawCuentasNew = BankingManager.parsearTexto(text);
    if (rawCuentasNew.length) {
      const { ajenas: nuevas, eraVuelta } = await filtrarCuentasAjenas(rawCuentasNew);
      if (!eraVuelta && nuevas.length) {
        draft.cuentas_bancarias = nuevas;
        await updateSession(session.id, 'esperando_datos_bancarios', draft);
        const kb2 = new InlineKeyboard()
          .text('✅ Sí, continuar', 'confirmar_cuentas')
          .text('✏️ Corregir', 'nueva_cuenta');
        await safeReply(ctx,
          `✅ Cuenta guardada:\n\n${BankingManager.formatearCuentas(nuevas)}\n\n¿Es correcto?`,
          { parse_mode: 'HTML', reply_markup: kb2 }
        );
        return;
      }
    }
    const cuentas = draft.cuentas_disponibles ?? [];
    if (cuentas.length) {
      const kb = new InlineKeyboard();
      cuentas.forEach(c => {
        kb.text(`${c.tipo} ···${c.numero.slice(-4)}${c.banco ? ' · ' + c.banco : ''}`, `usar_cuenta_${c.id}`).row();
      });
      kb.text('➕ Nuevos datos', 'nueva_cuenta');
      await safeReply(ctx, '✅ Cuenta guardada. Selecciona una opción 👇', { reply_markup: kb });
    }
    return;
  }

  if (isComprobante(text) && session.estado !== 'confirmando_comprobante' && session.estado !== 'confirmando_factura') {
    const chatId_ = ctx.chat?.id;
    const amtMatch = text.replace(/,/g, '').match(/(?:monto|importe|total|cantidad)\s*:?\s*\$?\s*([\d]+(?:\.\d{1,2})?)/);
    const monto = amtMatch ? parseFloat(amtMatch[1]) : 0;
    const { saldo: saldoComp } = await balanceManager.getSaldo(client.id);

    if (testModeChats.has(chatId_) && monto > 0) {
      const pendingDraft = { tipo: 'texto', monto_bruto: monto, monto_neto: monto,
        tipo_operacion: 'COMPROBANTE', clientId: client.id, saldo_actual: saldoComp };
      await updateSession(session.id, 'confirmando_comprobante', pendingDraft);
      const kb = new InlineKeyboard()
        .text(`✅ Confirmar $${fmt(monto)}`, 'confirmar_comprobante').row()
        .text('✏️ Corregir monto', 'corregir_comprobante')
        .text('❌ Cancelar', 'cancelar_comprobante');
      await ctx.reply(
        `🧪 <b>[Modo prueba]</b> Comprobante detectado.\n\n` +
        `Monto: <b>$${fmt(monto)}</b>\n` +
        `Saldo actual: <b>$${fmt(saldoComp)}</b>\n` +
        `Saldo tras acreditar: <b>$${fmt(saldoComp + monto)}</b>`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    } else if (monto > 0) {
      const pendingDraft = { tipo: 'comprobante', monto_bruto: monto, clientId: client.id, saldo_actual: saldoComp };
      await updateSession(session.id, 'confirmando_comprobante', pendingDraft);
      const kb = new InlineKeyboard()
        .text(`✅ Confirmar $${fmt(monto)}`, 'confirmar_comprobante').row()
        .text('✏️ Corregir monto', 'corregir_comprobante')
        .text('❌ Cancelar', 'cancelar_comprobante');
      await ctx.reply(
        `🧧 Recibí un comprobante de <b>$${fmt(monto)}</b>.\n\n` +
        `Saldo actual: <b>$${fmt(saldoComp)}</b>\n` +
        `Saldo después: <b>$${fmt(saldoComp + monto)}</b>`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    } else {
      await updateSession(session.id, 'confirmando_comprobante',
        { tipo: 'comprobante', monto_bruto: 0, clientId: client.id, saldo_actual: saldoComp });
      await ctx.reply('🧧 Recibí el comprobante. ¿Cuánto fue el monto del pago?');
    }
    return;
  }

  const PAGO_EXPLICIT = [
    'comparto pago','comparto un pago','comparto el pago',
    'adjunto comprobante','adjunto el comprobante','adjunto pago','adjunto el pago',
    'aquí el comprobante','aqui el comprobante','aquí va el comprobante','aqui va el comprobante',
    'aquí está el pago','aqui esta el pago','aquí va el pago','aqui va el pago',
    'mando el comprobante','te mando el comprobante','mando comprobante',
    'envío el comprobante','envio el comprobante',
    'comprobante de pago','comprobante de transferencia',
    'pagué','pague','deposité','deposite','transferí','transferi',
    'ya pagué','ya pague','ya deposité','ya deposite','ya enviamos',
    'realicé el pago','realice el pago',
    'hice el depósito','hice el deposito',
    'retorno pagado','ya entregué','ya entregue','entregué el efectivo','entregue el efectivo',
    'ya deposité al','ya deposite al','deposité el retorno','deposite el retorno',
  ];
  const PAGO_AMPLIO = /\b(?:pago|deposito|deposité|deposite|factura|cobro)\b/i;
  const { saldo: saldoActualPago } = await balanceManager.getSaldo(client.id);
  const esExplicitoPago = PAGO_EXPLICIT.some(k => text.toLowerCase().includes(k));
  const esPagoTexto = esExplicitoPago ||
                      (saldoActualPago < 0 && PAGO_AMPLIO.test(text) && !isOperacionCommand(text));

  const RETORNO_KEYWORDS = [
    'retorno pagado','ya entregué','ya entregue','entregué el efectivo','entregue el efectivo',
    'ya deposité al','ya deposite al','deposité el retorno','deposite el retorno',
    'entregué la facturación','entregue la facturacion',
  ];
  const esRetornoProveedor = RETORNO_KEYWORDS.some(k => text.toLowerCase().includes(k));

  if (esPagoTexto) {
    const saldo = saldoActualPago;

    if (esRetornoProveedor || client.rol === 'proveedor') {
      const [opsPendientes] = await pool.query(
        `SELECT id FROM fin_operations
         WHERE client_id=? AND es_entrada=1 AND retorno_pagado=0
           AND estado IN ('completada','confirmada')
         ORDER BY created_at DESC LIMIT 1`,
        [client.id]
      );
      if (opsPendientes.length) {
        const opId = opsPendientes[0].id;
        const bm   = require('./agents/balance-manager');
        const bmInst = new (bm)(pool);
        const resultado = await bmInst.marcarRetornoPagado({
          operationId: opId, clientId: client.id,
          monto_neto: 0,
        }).catch(() => null);
        if (resultado) {
          await ctx.reply(
            `✅ Retorno registrado.\n` +
            `Saldo: $${fmt(resultado.saldo_antes)} → <b>$${fmt(resultado.saldo_despues)}</b>`,
            { parse_mode: 'HTML' }
          );
          return;
        }
      }
    }

    const amtMatch2 = text.replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
    const monto2 = amtMatch2 ? parseFloat(amtMatch2[1]) : 0;
    const { saldo: saldoActual2 } = await balanceManager.getSaldo(client.id);

    if (monto2 > 0) {
      const pendingDraft2 = { tipo: 'pago_texto', monto_bruto: monto2, clientId: client.id, saldo_actual: saldoActual2 };
      await updateSession(session.id, 'confirmando_comprobante', pendingDraft2);
      const kb = new InlineKeyboard()
        .text(`✅ Confirmar $${fmt(monto2)}`, 'confirmar_comprobante').row()
        .text('✏️ Corregir monto', 'corregir_comprobante')
        .text('❌ Cancelar', 'cancelar_comprobante');
      await ctx.reply(
        `💰 Pago de <b>$${fmt(monto2)}</b> registrado.\n` +
        `Saldo actual: <b>$${fmt(saldoActual2)}</b>`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    } else {
      await updateSession(session.id, 'confirmando_comprobante',
        { tipo: 'pago_texto', monto_bruto: 0, clientId: client.id, saldo_actual: saldoActualPago });
      await ctx.reply('💰 Recibí el aviso de pago. ¿Cuánto fue el monto?');
    }
    return;
  }

  // ── Operación implícita o texto libre ─────────────────────────────────────────────────────────────────────────────────
  if (isImplicitOperacion(text) || session.estado !== 'idle') {
    await procesarOperacion(ctx, text, client, session);
    return;
  }

  // ── TransactionOrchestrator: detectar intención desde texto libre ────────────────────────────────────────
  if (transactionOrchestrator) {
    const mensajesRecientes = await contextManager.getRecientes(chatId, 10);
    const { accion, params, confianza } = await transactionOrchestrator.rutear({
      estado:           session.estado,
      mensajesRecientes,
      textoUsuario:     text,
      saldo:            parseFloat(client.saldo ?? 0),
      nombre:           client.nombre ?? client.telegram_username ?? 'Cliente',
    });

    if (accion === 'iniciar_operacion' && confianza !== 'baja') {
      const cmdStr = [
        params.tipo_operacion,
        params.tipo_monto,
        params.monto,
      ].filter(Boolean).join(' ');
      await procesarOperacion(ctx, cmdStr || text, client, session);
      return;
    }
    if (accion === 'responder_info' && params.mensaje_respuesta) {
      await ctx.reply(params.mensaje_respuesta, { parse_mode: 'HTML' });
      return;
    }
    if (accion !== 'ignorar') {
      const mensajesCtx = await contextManager.getRecientes(chatId, 20);
      const { responder, mensaje } = await contextReader.analizar(
        mensajesCtx, { estado: session.estado, saldo: parseFloat(client.saldo ?? 0), nombre: client.nombre }, text
      );
      if (responder && mensaje) {
        await ctx.reply(mensaje, { parse_mode: 'HTML' });
      }
    }
  }
});

bot.on(['message:photo', 'message:document'], async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  const modoChat = await getChatModo(chatId);

  const fileInfo = extractFileFromMessage(ctx.message);
  if (!fileInfo) return;

  if (modoChat === 'asistente') {
    const clientAsist = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
    await handleAsistenteModo(ctx, clientAsist, fileInfo);
    return;
  }

  const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
  const session = await getOrCreateSession(chatId, client.id);

  // Si la sesión espera un comprobante de pago
  if (session.estado === 'esperando_comprobante' || session.estado === 'esperando_pago') {
    try {
      const buffer   = await downloadTelegramFileAsBuffer(BOT_TOKEN, fileInfo.file.file_id);
      const mimeType = fileInfo.mimeType ?? 'image/jpeg';
      const draft    = parseDraft(session.operation_draft_json);

      let detected = null;
      if (docAgent) {
        detected = await docAgent.procesarBuffer(buffer, mimeType, fileInfo.fileName);
      }
      if (!detected) {
        detected = await invoiceAgent.procesarBuffer(buffer, mimeType, fileInfo.fileName ?? '');
      }
      if (detected?.tipo === 'imagen_sin_ocr') {
        if (docAgent) {
          const { visionResult } = await docAgent.analizarImagenCompleta(buffer, mimeType);
          if (visionResult?.monto_total) detected = { ...visionResult, tipo: 'comprobante' };
        } else if (visionAgent) {
          const vr = await visionAgent.analizarFactura(buffer, mimeType);
          if (vr?.monto_total) detected = { ...vr, tipo: 'comprobante' };
        }
      }

      if (detected && (detected.tipo === 'comprobante' || detected.tipo === 'factura') && detected.monto_total > 0) {
        draft.comprobante_monto = detected.monto_total;
        const saldoInfo = await balanceManager.getSaldo(client.id);
        const kb = new InlineKeyboard()
          .text(`✅ Confirmar $${fmt(detected.monto_total)}`, 'confirmar_comprobante').row()
          .text('❌ Cancelar', 'cancelar_comprobante');
        await updateSession(session.id, 'confirmando_comprobante', draft);
        await ctx.reply(
          `🧧 Comprobante por <b>$${fmt(detected.monto_total)}</b>.\n` +
          `Saldo actual: <b>$${fmt(saldoInfo.saldo)}</b>`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
        return;
      }
    } catch (e) {
      console.error('[comprobante-handler]', e.message);
    }
    await ctx.reply('No pude leer el comprobante. ¿Cuánto fue el monto del pago?');
    return;
  }

  // Modo normal: pasar por handleAsistenteModo para archivos no esperados
  await handleAsistenteModo(ctx, client, fileInfo);
});

// Escuchar voice messages (transcripción)
bot.on('message:voice', async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!docAgent) {
    // Sin Gemini no podemos transcribir
    return;
  }

  try {
    const voiceFile = ctx.message.voice;
    const buffer = await downloadTelegramFileAsBuffer(BOT_TOKEN, voiceFile.file_id);
    const mimeType = 'audio/ogg';

    const transcripcion = await docAgent.transcribirAudio(buffer, mimeType);
    if (!transcripcion) return;

    // Loguear la transcripción como mensaje
    contextManager.logMessage({
      chatId, telegramMsgId: ctx.message.message_id,
      fromUserId: ctx.from?.id, fromUsername: ctx.from?.username,
      tipo: 'voz', texto: transcripcion, esBot: false,
    }).catch(() => {});

    // Procesar la transcripción como texto
    const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
    const session = await getOrCreateSession(chatId, client.id);

    // Usar TransactionOrchestrator para entender la intención
    if (transactionOrchestrator) {
      const mensajesRecientes = await contextManager.getRecientes(chatId, 10);
      const { accion, params, confianza } = await transactionOrchestrator.rutear({
        estado: session.estado, mensajesRecientes,
        textoUsuario: transcripcion,
        saldo: parseFloat(client.saldo ?? 0),
        nombre: client.nombre ?? client.telegram_username ?? 'Cliente',
      });

      if (accion === 'iniciar_operacion' && confianza !== 'baja') {
        const cmdStr = [params.tipo_operacion, params.tipo_monto, params.monto].filter(Boolean).join(' ');
        await ctx.reply(`🎤 Transcripción: “${transcripcion}”`, { parse_mode: 'HTML' });
        await procesarOperacion(ctx, cmdStr || transcripcion, client, session);
        return;
      }
    }

    // Si no es operación, responder con la transcripción
    await ctx.reply(`🎤 “${transcripcion}”`);
  } catch (e) {
    console.error('[voice-handler]', e.message);
  }
});

// ── Respuestas a polls ────────────────────────────────────────────────────────────────────────────
bot.on('poll_answer', async (ctx) => {
  const pollAnswer = ctx.pollAnswer;
  const { action, operationDraft, chatId } = pollHandler.processPollAnswer(pollAnswer);

  if (!chatId || !operationDraft) return;

  const client = await balanceManager.getOrCreateClient(
    pollAnswer.user?.id, pollAnswer.user?.username
  );
  const session = await getOrCreateSession(chatId, client.id);

  if (action === 'confirm') {
    try {
      const { operationId, saldo_antes, saldo_despues } =
        await saveConfirmedOperation(operationDraft, client.id, chatId);

      await updateSession(session.id, 'completado', null);

      const confirmMsg = responseGen.formatConfirmed({
        ...operationDraft,
        saldo_nuevo: saldo_despues,
      });
      await bot.api.sendMessage(chatId, confirmMsg, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[confirm-op]', err.message);
      await bot.api.sendMessage(chatId, `⚠️ Error al confirmar: ${err.message}`);
    }
    return;
  }

  if (action === 'edit') {
    await pollHandler.sendEditMenu(chatId, operationDraft);
    return;
  }

  if (action === 'cancel') {
    await updateSession(session.id, 'completado', null);
    await bot.api.sendMessage(chatId, responseGen.formatCancelled());
    return;
  }
});

// ── Callback queries (InlineKeyboard) ────────────────────────────────────────────────────────────
bot.on('callback_query:data', async (ctx) => {
  const data    = ctx.callbackQuery.data;
  const userId  = ctx.from?.id;
  const chatId  = ctx.chat?.id ?? ctx.callbackQuery.message?.chat?.id;

  if (!chatId) { await ctx.answerCallbackQuery(); return; }

  const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
  const session = await getOrCreateSession(chatId, client.id);

  // ── edit_field: callbacks ──────────────────────────────────────────────────────────────────────────────
  if (data.startsWith('edit_field:')) {
    const field = data.split(':')[1];
    const result = await pollHandler.processEditFieldSelection(chatId, field, ctx.callbackQuery.id);
    if (result?.action === 'cancel') {
      await updateSession(session.id, 'completado', null);
      await ctx.reply(responseGen.formatCancelled());
    }
    return;
  }

  // ── confirmar_comprobante ───────────────────────────────────────────────────────────────────────────────
  if (data === 'confirmar_comprobante') {
    await ctx.answerCallbackQuery();
    const draft = parseDraft(session.operation_draft_json);
    const monto = draft.monto_bruto ?? draft.comprobante_monto ?? 0;
    if (!monto) {
      await ctx.reply('⚠️ No hay monto registrado. Envíame el comprobante nuevamente.');
      return;
    }
    try {
      const { saldo_antes, saldo_despues } = await balanceManager.confirmarPago({
        clientId: client.id,
        monto,
        tipo: 'comprobante',
      });
      await updateSession(session.id, 'completado', null);
      await ctx.reply(
        `✅ <b>Pago confirmado</b>\n` +
        `Monto: <b>$${fmt(monto)}</b>\n` +
        `Saldo: $${fmt(saldo_antes)} → <b>$${fmt(saldo_despues)}</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      await ctx.reply(`⚠️ Error: ${err.message}`);
    }
    return;
  }

  if (data === 'corregir_comprobante') {
    await ctx.answerCallbackQuery();
    await ctx.reply('✏️ ¿Cuál es el monto correcto?');
    return;
  }

  if (data === 'cancelar_comprobante') {
    await ctx.answerCallbackQuery();
    await updateSession(session.id, 'completado', null);
    await ctx.reply('❌ Cancelado.');
    return;
  }

  // ── confirmar_cuentas / usar_cuenta_* / nueva_cuenta ──────────────────────────────────────────────
  if (data === 'confirmar_cuentas') {
    await ctx.answerCallbackQuery();
    const draft = parseDraft(session.operation_draft_json);
    const cuentas = draft.cuentas_bancarias ?? [];
    if (!cuentas.length) {
      await ctx.reply('No hay cuentas guardadas. Envíame los datos bancarios.');
      await updateSession(session.id, 'esperando_datos_bancarios', draft);
      return;
    }
    await mostrarResumenYPoll(ctx, draft, client, session);
    return;
  }

  if (data === 'nueva_cuenta') {
    await ctx.answerCallbackQuery();
    const draft = parseDraft(session.operation_draft_json);
    draft.cuentas_bancarias = [];
    await updateSession(session.id, 'esperando_datos_bancarios', draft);
    await ctx.reply('Envíame la CLABE, tarjeta o número de cuenta al que realizaremos el pago.');
    return;
  }

  if (data.startsWith('usar_cuenta_')) {
    await ctx.answerCallbackQuery();
    const cuentaId = parseInt(data.replace('usar_cuenta_', ''));
    const draft    = parseDraft(session.operation_draft_json);
    const cuentasDisp = draft.cuentas_disponibles ?? [];
    const elegida = cuentasDisp.find(c => c.id === cuentaId);
    if (!elegida) {
      await ctx.reply('Cuenta no encontrada. Envíame los datos nuevamente.');
      return;
    }
    draft.cuentas_bancarias = [elegida];
    await mostrarResumenYPoll(ctx, draft, client, session);
    return;
  }

  // ── confirmar_factura ────────────────────────────────────────────────────────────────────────────────
  if (data === 'confirmar_factura' || data === 'cancelar_factura') {
    await ctx.answerCallbackQuery();
    if (data === 'cancelar_factura') {
      await updateSession(session.id, 'completado', null);
      await ctx.reply('❌ Factura cancelada.');
      return;
    }
    const draft = parseDraft(session.operation_draft_json);
    draft.tiene_factura = true;
    // Verificar que tenemos todos los datos
    if (!draft.tipo_operacion || !draft.monto_bruto) {
      await ctx.reply('⚠️ Faltan datos de la operación. Usa /operacion para iniciar.');
      return;
    }
    await mostrarResumenYPoll(ctx, draft, client, session);
    return;
  }

  await ctx.answerCallbackQuery();
});

// ── procesarOperacion: core del flujo de operaciones ────────────────────────────────────────────────
async function procesarOperacion(ctx, text, client, session) {
  const chatId = ctx.chat?.id;
  const draft  = parseDraft(session.operation_draft_json);

  // Parseo estructurado del comando
  const parsed = parseNaturalText(text);
  if (parsed.tipo)       draft.tipo_operacion = parsed.tipo;
  if (parsed.monto)      draft.monto_raw      = parsed.monto;
  if (parsed.tipo_monto) draft.tipo_monto     = parsed.tipo_monto;
  if (parsed.es_entrada !== null) draft.es_entrada = parsed.es_entrada;

  // Si falta tipo de operación
  if (!draft.tipo_operacion) {
    if (parsed.necesita_llm && transactionOrchestrator) {
      const mensajesRecientes = await contextManager.getRecientes(chatId, 10);
      const { accion, params } = await transactionOrchestrator.rutear({
        estado:           session.estado,
        mensajesRecientes,
        textoUsuario:     text,
        saldo:            parseFloat(client.saldo ?? 0),
        nombre:           client.nombre ?? client.telegram_username ?? 'Cliente',
      });
      if (accion === 'iniciar_operacion' && params.tipo_operacion) {
        draft.tipo_operacion = params.tipo_operacion;
        if (params.monto)      draft.monto_raw  = params.monto;
        if (params.tipo_monto) draft.tipo_monto = params.tipo_monto;
      }
    }
    if (!draft.tipo_operacion) {
      const tipos = listTypes();
      await ctx.reply(responseGen.formatAskTipo(tipos), { parse_mode: 'HTML' });
      await updateSession(session.id, 'esperando_tipo', draft);
      return;
    }
  }

  // Obtener comisión
  const commission = await getCommission(draft.tipo_operacion, pool, client.id);
  draft.comision_pct = commission?.pct ?? 0.03;
  draft.costo_pct    = commission?.costo_pct ?? null;

  // Si falta monto
  if (!draft.monto_raw) {
    await ctx.reply(responseGen.formatAskMonto(draft.tipo_operacion), { parse_mode: 'HTML' });
    await updateSession(session.id, 'esperando_monto', draft);
    return;
  }

  // Calcular montos
  try {
    const { monto_bruto, monto_neto, comision_mxn } = calcularMontos({
      monto:        draft.monto_raw,
      tipo_monto:   draft.tipo_monto ?? 'neto',
      comision_pct: draft.comision_pct,
    });
    draft.monto_bruto   = monto_bruto;
    draft.monto_neto    = monto_neto;
    draft.comision_mxn  = comision_mxn;
    draft.solicita_neto = draft.tipo_monto === 'neto';
  } catch (err) {
    await ctx.reply(`⚠️ Error calculando montos: ${err.message}`);
    return;
  }

  // Si es salida: verificar saldo o pedir cuentas bancarias
  if (draft.es_entrada === false || draft.es_entrada === null) {
    // Default: si no se especificó es_entrada, es una salida
    draft.es_entrada = draft.es_entrada ?? false;

    const { tiene, saldo } = await balanceManager.tieneSaldoSuficiente(client.id, draft.monto_bruto);
    draft.saldo_actual = saldo;
    draft.tiene_saldo  = tiene;

    if (!tiene) {
      // Obtener datos bancarios para el pago
      const instrucciones = await q.getInstruccionesPago(pool);
      draft.instrucciones_pago = instrucciones;
    }

    // Pedir cuentas bancarias si no las tiene
    if (!draft.cuentas_bancarias?.length) {
      const cuentasRecientes = await bankingManager.getCuentasRecientes(client.id, 5);
      if (cuentasRecientes.length) {
        draft.cuentas_disponibles = cuentasRecientes;
        const kb = new InlineKeyboard();
        cuentasRecientes.forEach(c => {
          kb.text(`${c.tipo} ···${c.numero.slice(-4)}${c.banco ? ' · ' + c.banco : ''}`, `usar_cuenta_${c.id}`).row();
        });
        kb.text('➕ Nuevos datos', 'nueva_cuenta');
        await updateSession(session.id, 'confirmando_cuentas', draft);
        await safeReply(ctx,
          `💳 ¿A qué cuenta realizamos el pago de <b>$${fmt(draft.monto_neto)}</b>?\n\nCuentas registradas:`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
        return;
      } else {
        await ctx.reply('Envíame la CLABE, tarjeta o número de cuenta al que realizaremos el pago.');
        await updateSession(session.id, 'esperando_datos_bancarios', draft);
        return;
      }
    }
  } else {
    draft.es_entrada = true;
    const { saldo } = await balanceManager.getSaldo(client.id);
    draft.saldo_actual = saldo;
    draft.tiene_saldo  = true;
    const instrucciones = await q.getInstruccionesPago(pool);
    draft.instrucciones_pago = instrucciones;
  }

  await mostrarResumenYPoll(ctx, draft, client, session);
}

// ── mostrarResumenYPoll ──────────────────────────────────────────────────────────────────────────────
async function mostrarResumenYPoll(ctx, draft, client, session) {
  // Verificar consistencia antes de mostrar
  const verResult = verifier.verificarConsistencia(draft);
  if (!verResult.ok) {
    // Aplicar correcciones automáticas
    Object.assign(draft, verResult.correcciones);
  }

  // Obtener saldo actualizado
  const { saldo } = await balanceManager.getSaldo(client.id);
  draft.saldo_actual = saldo;

  const { saldo_nuevo } = proyectarSaldo({
    saldo_actual: saldo,
    monto_neto:   draft.monto_neto,
    es_entrada:   draft.es_entrada,
  });
  draft.saldo_nuevo = saldo_nuevo;

  // Determinar si tiene saldo suficiente
  const { tiene_saldo } = verifier.verificarSaldo({
    saldo_actual: saldo,
    monto_bruto:  draft.monto_bruto,
    es_entrada:   draft.es_entrada,
  });
  draft.tiene_saldo = tiene_saldo;

  const summaryText = responseGen.formatOperationSummary({
    ...draft,
    saldo_actual: saldo,
    saldo_nuevo,
    tiene_saldo,
  });

  // Verificaciones adicionales
  const verMsg = verifier.formatVerificationResult(verResult);
  if (verMsg) {
    await safeReply(ctx, verMsg, { parse_mode: 'HTML' });
  }

  await updateSession(session.id, 'confirmando', draft);
  await pollHandler.sendConfirmationPoll(ctx.chat?.id, draft, summaryText);
}

// ── safeReply ────────────────────────────────────────────────────────────────────────────────────
async function safeReply(ctx, text, opts = {}) {
  // GrammY replíy si hay ctx.message, sendMessage si no (callback query)
  try {
    if (ctx.reply) {
      await ctx.reply(text, opts);
    } else {
      await bot.api.sendMessage(ctx.chat?.id, text, opts);
    }
  } catch (e) {
    // Si falla HTML, reintentar sin parse_mode
    if (e.message?.includes('parse') && opts.parse_mode) {
      await ctx.reply(text.replace(/<[^>]+>/g, ''), { ...opts, parse_mode: undefined });
    }
  }
}

// /miid — devuelve el ID de Telegram del usuario (admin tool)
bot.command('miid', async (ctx) => {
  await ctx.reply(`Tu ID de Telegram es: <code>${ctx.from?.id}</code>`, { parse_mode: 'HTML' });
});

// ── Error handling ─────────────────────────────────────────────────────────────────────────────
bot.catch((err) => {
  const ctx = err.ctx;
  const e   = err.error;
  if (e instanceof GrammyError) {
    console.error('[grammy]', e.message);
  } else if (e instanceof HttpError) {
    console.error('[http]', e);
  } else {
    console.error('[unknown]', e);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────────────────────
bot.start({
  onStart: () => console.log('[financial-bot] Bot iniciado correctamente'),
}).catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('terminated by other') || msg.includes('conflict')) {
    console.warn('[financial-bot] Instancia duplicada detectada, saliendo...');
    process.exit(0);
  } else {
    console.error('[financial-bot] Error fatal en bot.start():', msg);
    process.exit(1);
  }
});

module.exports = { bot, pool };
