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

// ── Config ────────────────────────────────────────────────────────────────────

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

// ── Init servicios ────────────────────────────────────────────────────────────

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
const transactionOrchestrator = process.env.ANTHROPIC_API_KEY
  ? new TransactionOrchestrator(process.env.ANTHROPIC_API_KEY)
  : null;

// ── Transformer: log bot outgoing messages ────────────────────────────────────
// Intercepts sendMessage/sendPhoto calls to store bot replies in fin_messages
// so admins can see the full conversation (including bot responses) in the dashboard.
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
// Lógica de comisiones:
//   SPEI/EFECTIVO + saldo neto > 0  → sin comisión (crédito previo cubre la operación)
//   SPEI/EFECTIVO + saldo neto ≤ 0  → comisión base r
//   IAS (u op. con R > r)           → siempre aplica R total, con desglose:
//     comisión base (r%) + ajuste adicional x% donde x = 1 - (1-R)/(1-r)
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

      // Leer mensajes recientes para inferir tipo de operación del contexto del chat
      const mensajesRecientes = await contextManager.getRecientes(chatId, 15);
      const textoContexto     = mensajesRecientes.filter(m => m.texto).map(m => m.texto).join(' ');
      const tipoOp = (detected.tipo_operacion || detectType(textoContexto) || null)?.toUpperCase() ?? null;

      // Tasas de comisión
      const saldoNeto      = parseFloat(client.saldo ?? 0);
      const BASE_TIPOS     = ['SPEI', 'EFECTIVO'];
      const esBase         = !tipoOp || BASE_TIPOS.includes(tipoOp);
      const tieneCredito   = saldoNeto > 0;

      let pct = 0;
      let pctBase = 0; // tasa de referencia (SPEI) para desglose IAS

      if (esBase && tieneCredito) {
        // SPEI/EFECTIVO con saldo neto positivo → sin comisión (el crédito cubre la operación)
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

      // x% = 1 - (1-R)/(1-r) → ajuste adicional para operaciones tipo IAS
      const xPct = (!esBase && pct > pctBase)
        ? (1 - (1 - pct) / (1 - pctBase))
        : 0;

      // Construir respuesta con desglose
      let msg = `✅ <b>Comprobante registrado`;
      if (tipoOp) msg += ` [${tipoOp}]`;
      msg += `</b>  $${fmt(monto)}\n\n`;
      msg += `Saldo bruto:  <b>$${fmt(saldo_bruto_antes)}</b> → <b>$${fmt(saldo_bruto_despues)}</b>\n`;

      if (comisionTotal > 0) {
        if (xPct > 0) {
          // Desglose: comisión base + ajuste adicional (e.g. IAS)
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

// Retorna las cuentas que NO pertenecen a nuestras empresas, y un flag si alguna sí era nuestra
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

// Detecta si un texto es un comprobante bancario (no datos de cuenta para entrega)
function isComprobante(text) {
  const t = text ?? '';
  const hasSuccessLine = /transferencia exitosa|pago exitoso|operaci[oó]n exitosa|dep[oó]sito exitoso|transacci[oó]n exitosa/i.test(t);
  const hasReceptorOrdenante = /\b(receptor|beneficiario|destinatario|ordenante|remitente|emisor)\s*:/i.test(t);
  const hasMonto = /\b(monto|importe|cantidad|total)\s*:?\s*\$?[\d,]+\.?\d*\s*(MXN|USD)?/i.test(t);
  const hasReferencia = /\b(referencia|folio|no\.\s*op|num\s*op|numero\s*de\s*operacion)\s*:?\s*\d+/i.test(t);
  return hasSuccessLine || (hasReceptorOrdenante && hasMonto) || (hasReferencia && hasMonto);
}

function calcLLMCost(tokensIn, tokensOut) {
  // DeepSeek Chat: $0.07/1M input, $1.10/1M output (con cache puede ser ~10% del input)
  return ((tokensIn * 0.07) + (tokensOut * 1.10)) / 1_000_000;
}

/**
 * Parsea el draft JSON de la sesión de forma defensiva.
 * Si el valor es inválido (p. ej. "[object Object]") devuelve {}.
 */
function parseDraft(json) {
  if (!json) return {};
  if (typeof json === 'object') return json; // MySQL2 auto-parsea columnas JSON
  try { return JSON.parse(json); } catch { return {}; }
}

/**
 * Obtiene o crea sesión financiera para el chat.
 */
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

/**
 * Actualiza el estado de la sesión.
 */
async function updateSession(sessionId, estado, draftJson = null) {
  await pool.query(
    'UPDATE fin_sessions SET estado=?, operation_draft_json=?, updated_at=NOW(3) WHERE id=?',
    [estado, draftJson ? JSON.stringify(draftJson) : null, sessionId]
  );
}

/**
 * Guarda una operación confirmada en la base de datos.
 * Envuelve todo en una transacción.
 */
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

    // Aplicar al saldo
    ({ saldo_antes, saldo_despues } = await balanceManager.aplicarOperacion(
      { operationId, clientId, monto_neto: draft.monto_neto, monto_bruto: draft.monto_bruto, es_entrada: draft.es_entrada },
      conn
    ));

    // Marcar confirmada
    await conn.query(
      "UPDATE fin_operations SET estado='confirmada', updated_at=NOW(3) WHERE id=?",
      [operationId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    // Reintentar hasta 3 veces en lock wait timeout
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

  // Fuera de la transacción: cuentas bancarias y comisión (no críticas para atomicidad)
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

// ── Handlers ──────────────────────────────────────────────────────────────────

// Middleware de autenticación
bot.use(async (ctx, next) => {
  // /miid debe funcionar desde cualquier chat (incluido el privado del admin)
  const cmdText = ctx.message?.text ?? '';
  if (cmdText === '/miid' || cmdText.startsWith('/miid ')) { await next(); return; }
  if (!isAllowedChat(ctx)) return;
  await next();
});

// ── Middleware pasivo: log de todos los mensajes ──────────────────────────────
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

    // Asegurar chat en DB (no esperamos para no bloquear)
    contextManager.upsertChat({ chatId, titulo, isGroup }).catch(() => {});

    // Determinar tipo de mensaje
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

// /start
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

// /saldo (para clientes y admin)
bot.command('saldo', async (ctx) => {
  try {
    const client = await balanceManager.getOrCreateClient(
      ctx.from?.id, ctx.from?.username
    );
    await safeReply(ctx,
      `💰 Saldo actual: <b>$${fmt(client.saldo)}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    await safeReply(ctx, 'Error consultando saldo.').catch(() => {});
  }
});

// /historial (últimas 10 ops)
bot.command('historial', async (ctx) => {
  try {
    const client = await balanceManager.getOrCreateClient(ctx.from?.id, ctx.from?.username);
    const hist   = await balanceManager.getHistorial(client.id, 10, 0);
    if (!hist.length) {
      await safeReply(ctx, 'Sin movimientos registrados.');
      return;
    }
    const lineas = hist.map(h =>
      `• ${h.tipo_movimiento.padEnd(15)} $${fmt(h.monto).padStart(12)} → $${fmt(h.saldo_despues)}`
    );
    await safeReply(ctx,
      `📋 <b>Últimos movimientos:</b>\n<pre>${lineas.join('\n')}</pre>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    await safeReply(ctx, 'Error consultando historial.').catch(() => {});
  }
});

// /ajuste [nombre o username] nuevo_saldo [descripcion] (solo admin)
// Busca el primer token numérico: todo lo anterior es el nombre, todo lo posterior es descripción.
// Busca por nombre exacto (insensible a mayúsculas) o por telegram_username.
bot.command('ajuste', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await safeReply(ctx, '⛔ Sin permisos.').catch(() => {});
    return;
  }
  const args = (ctx.match ?? '').trim().split(/\s+/).filter(Boolean);
  let client, nuevoSaldo, desc;

  const isNumeric = s => /^-?\d+(\.\d+)?$/.test(s);
  const firstNumIdx = args.findIndex(isNumeric);

  if (firstNumIdx > 0) {
    // Nombre/username antes del número
    const nameQuery = args.slice(0, firstNumIdx).join(' ').replace(/^@/, '');
    nuevoSaldo = parseFloat(args[firstNumIdx]);
    desc       = args.slice(firstNumIdx + 1).join(' ') || 'Ajuste manual';
    const [rows] = await pool.query(
      'SELECT * FROM fin_clients WHERE LOWER(nombre)=LOWER(?) OR LOWER(telegram_username)=LOWER(?) LIMIT 1',
      [nameQuery, nameQuery]
    );
    if (!rows.length) {
      await safeReply(ctx, `❌ Cliente "${nameQuery}" no encontrado.`).catch(() => {});
      return;
    }
    client = rows[0];
  } else if (firstNumIdx === 0) {
    // Solo número → reply mode
    const replyTo = ctx.message?.reply_to_message?.from?.id;
    if (!replyTo) {
      await safeReply(ctx, 'Uso: /ajuste [nombre o @username] nuevo_saldo [descripcion]\n     o responde al mensaje del cliente con /ajuste nuevo_saldo [descripcion]').catch(() => {});
      return;
    }
    client     = await balanceManager.getOrCreateClient(replyTo);
    nuevoSaldo = parseFloat(args[0]);
    desc       = args.slice(1).join(' ') || 'Ajuste manual';
  } else {
    await safeReply(ctx, 'Uso: /ajuste [nombre o @username] nuevo_saldo [descripcion]').catch(() => {});
    return;
  }

  try {
    const saldoActual = parseFloat(client.saldo ?? 0);
    const delta       = nuevoSaldo - saldoActual;
    const signo       = delta >= 0 ? '+' : '';
    const { saldo_antes, saldo_despues } = await balanceManager.ajusteManual({
      clientId: client.id, monto: delta, descripcion: desc, adminId: ctx.from?.id,
    });
    await safeReply(ctx,
      `✅ Ajuste aplicado a <b>${client.nombre ?? client.telegram_username}</b>.\n` +
      `Saldo: $${fmt(saldo_antes)} → <b>$${fmt(saldo_despues)}</b>\n` +
      `Movimiento: ${signo}${fmt(delta)}`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    await safeReply(ctx, `Error: ${err.message}`).catch(() => {});
  }
});

// Comando /operacion — punto de entrada principal
// /reset — cancela cualquier sesión activa y limpia el estado
bot.command('reset', async (ctx) => {
  try {
    const userId  = ctx.from?.id;
    const chatId  = ctx.chat?.id;
    const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
    const session = await getOrCreateSession(chatId, client.id);
    await updateSession(session.id, 'completado', null);
    await safeReply(ctx, '🔄 Sesión reiniciada. Puedes empezar de nuevo.').catch(() => {});
  } catch (err) {
    await safeReply(ctx, '⚠️ No pude reiniciar la sesión. Intenta de nuevo.').catch(() => {});
  }
});

// Modo de prueba: acepta comprobantes de texto sin validación de imagen (solo admins)
const testModeChats = new Set();
bot.command('testmode', async (ctx) => {
  const userId = ctx.from?.id;
  if (!ADMIN_USER_IDS.has(userId)) {
    await safeReply(ctx, '⛔ Solo administradores pueden usar este comando.').catch(() => {});
    return;
  }
  const chatId = ctx.chat?.id;
  if (testModeChats.has(chatId)) {
    testModeChats.delete(chatId);
    await safeReply(ctx, '🧪 Modo prueba <b>desactivado</b>.', { parse_mode: 'HTML' }).catch(() => {});
  } else {
    testModeChats.add(chatId);
    await safeReply(ctx,
      '🧪 Modo prueba <b>activado</b>.\n' +
      'Los comprobantes de texto serán aceptados como pagos válidos sin validación de imagen.',
      { parse_mode: 'HTML' }
    ).catch(() => {});
  }
});

bot.command('operacion', async (ctx) => {
  const userId  = ctx.from?.id;
  const chatId  = ctx.chat?.id;
  const cmdArgs = ctx.match ?? '';

  const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
  const session = await getOrCreateSession(chatId, client.id);

  // Sin argumentos → modo asistido
  if (!cmdArgs.trim()) {
    const tipos = listTypes();
    await safeReply(ctx, responseGen.formatAskTipo(tipos), { parse_mode: 'HTML' }).catch(() => {});
    await updateSession(session.id, 'esperando_tipo', { clientId: client.id });
    return;
  }

  // Con argumentos → parsear directamente
  await procesarOperacion(ctx, cmdArgs, client, session);
});

// /rol [cliente|proveedor|ambos] — admin clasifica al usuario del chat
bot.command('rol', async (ctx) => {
  const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const fromId    = String(ctx.from?.id ?? '');
  if (!ADMIN_IDS.includes(fromId)) {
    await safeReply(ctx, '⛔ Solo los administradores pueden usar este comando.').catch(() => {});
    return;
  }
  const arg = (ctx.match ?? '').trim().toLowerCase();
  const roles = ['cliente', 'proveedor', 'ambos'];
  if (!roles.includes(arg)) {
    await safeReply(ctx, `Uso: /rol <b>${roles.join(' | ')}</b>\nEjemplo: /rol proveedor`, { parse_mode: 'HTML' }).catch(() => {});
    return;
  }
  const chatId = ctx.chat?.id;
  // Buscar el client_id vinculado a este chat
  const [rows] = await pool.query(
    `SELECT client_id FROM fin_sessions WHERE chat_id=? AND client_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1`,
    [chatId]
  );
  if (!rows.length) {
    await safeReply(ctx, 'No encontré un cliente vinculado a este chat. El usuario debe haber interactuado antes.').catch(() => {});
    return;
  }
  const clientId = rows[0].client_id;
  await pool.query(`UPDATE fin_clients SET rol=? WHERE id=?`, [arg, clientId]);
  const labels = { cliente: '🏢 Cliente', proveedor: '🏭 Proveedor', ambos: '🔄 Ambos' };
  await safeReply(ctx, `✅ Rol actualizado: <b>${labels[arg]}</b>`, { parse_mode: 'HTML' }).catch(() => {});
});

// /modo [normal|asistente] — configura cómo se comporta el bot en este chat
bot.command('modo', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) { await safeReply(ctx, '⛔ Sin permisos.').catch(() => {}); return; }
  const arg = (ctx.match ?? '').trim().toLowerCase();
  if (!['normal', 'asistente'].includes(arg)) {
    await safeReply(ctx,
      'Uso: /modo <b>normal</b> | <b>asistente</b>\n\n' +
      '<b>normal</b> → modo interactivo para clientes (confirmaciones, flujos)\n' +
      '<b>asistente</b> → silencioso para grupos internos: solo registra comprobantes y cuentas',
      { parse_mode: 'HTML' }
    ).catch(() => {});
    return;
  }
  await pool.query(
    `INSERT INTO fin_chats (chat_id, modo, is_group, ultimo_msg_at)
     VALUES (?, ?, 0, NOW(3))
     ON DUPLICATE KEY UPDATE modo=VALUES(modo)`,
    [ctx.chat?.id, arg]
  );
  const labels = { normal: '🔄 Normal (modo cliente)', asistente: '🤫 Asistente silencioso' };
  await safeReply(ctx, `✅ Modo actualizado: <b>${labels[arg]}</b>`, { parse_mode: 'HTML' }).catch(() => {});
});

// Mensajes de texto — detecta operaciones implícitas o responde a flujo activo
bot.on('message:text', async (ctx, next) => {
  const userId  = ctx.from?.id;
  const chatId  = ctx.chat?.id;
  const text    = ctx.message.text;

  // Ignorar comandos (pasar al siguiente handler en la cadena)
  if (text.startsWith('/')) return next();

  // Modo asistente: procesa CLABEs, consultas de saldo y operaciones; silencio para todo lo demás
  const _modoChat = await getChatModo(chatId);
  if (_modoChat === 'asistente') {
    // 1. Consulta de saldo — responder aunque sea modo asistente
    if (/\b(saldo|cu[aá]nto (tengo|hay|queda)|mi saldo|saldo actual)\b/i.test(text)) {
      const clientS = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
      await safeReply(ctx, `💰 Saldo actual: <b>$${fmt(clientS.saldo)}</b>`, { parse_mode: 'HTML' }).catch(() => {});
      return;
    }
    // 2. Operación o sesión activa esperando datos — caer al flujo normal
    const _sessionAsist = await getOrCreateSession(chatId,
      (await balanceManager.getOrCreateClient(userId, ctx.from?.username)).id);
    const _hasActiveSession = _sessionAsist.estado && _sessionAsist.estado !== 'idle';
    if (_hasActiveSession || isOperacionCommand(text) || isImplicitOperacion(text)) {
      // fall through to normal processing below
    } else {
      // 3. CLABEs/cuentas — guardar silenciosamente
      const rawCuentas = BankingManager.parsearTexto(text);
      if (rawCuentas.length) {
        const clientAsist = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
        const { ajenas }  = await filtrarCuentasAjenas(rawCuentas);
        if (ajenas.length) {
          await bankingManager.guardarCuentas(clientAsist.id, null, ajenas);
          await ctx.reply(`✅ Guardado · ${ajenas.length} cuenta(s) registrada(s)`);
        }
      }
      return; // silencio para todo lo demás
    }
  }

  const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
  const session = await getOrCreateSession(chatId, client.id);

  // Si hay edición pendiente (el usuario está enviando el nuevo valor)
  if (pollHandler.hasPendingEdit(chatId)) {
    const { ok, error, operationDraft } = pollHandler.applyEditValue(chatId, text);
    if (!ok) {
      await ctx.reply(`⚠️ ${error}`);
      return;
    }
    // Recalcular con los nuevos datos
    await mostrarResumenYPoll(ctx, operationDraft, client, session);
    return;
  }

  // Si la sesión espera un dato específico
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
    // Si el número coincide con una de nuestras cuentas, es un comprobante de pago
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
    await ctx.reply(
      `✅ Datos encontrados:\n\n${BankingManager.formatearCuentas(cuentas)}\n\n¿Es correcto?`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
    return;
  }
  if (session.estado === 'confirmando_cuentas') {
    // El usuario escribió texto en vez de usar el botón → re-mostrar opciones
    const draft   = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
    const cuentas = draft.cuentas_disponibles ?? [];
    if (cuentas.length) {
      const kb = new InlineKeyboard();
      cuentas.forEach(c => {
        kb.text(`${c.tipo} ···${c.numero.slice(-4)}${c.banco ? ' · ' + c.banco : ''}`, `usar_cuenta_${c.id}`).row();
      });
      kb.text('➕ Nuevos datos', 'nueva_cuenta');
      await ctx.reply('Por favor selecciona una opción 👇', { reply_markup: kb });
    }
    return;
  }

  // ── Texto estructurado tipo comprobante bancario ─────────────────────────
  // No re-detectar si ya hay una confirmación pendiente
  if (isComprobante(text) && session.estado !== 'confirmando_comprobante' && session.estado !== 'confirmando_factura') {
    const chatId_ = ctx.chat?.id;
    const amtMatch = text.replace(/,/g, '').match(/(?:monto|importe|total|cantidad)\s*:?\s*\$?\s*([\d]+(?:\.\d{1,2})?)/i);
    const monto = amtMatch ? parseFloat(amtMatch[1]) : 0;
    const { saldo: saldoComp } = await balanceManager.getSaldo(client.id);

    if (testModeChats.has(chatId_) && monto > 0) {
      // Modo prueba: aceptar directamente sin confirmación admin
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
        `🧾 Recibí un comprobante de <b>$${fmt(monto)}</b>.\n\n` +
        `Saldo actual: <b>$${fmt(saldoComp)}</b>\n` +
        `Saldo después: <b>$${fmt(saldoComp + monto)}</b>`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    } else {
      await updateSession(session.id, 'confirmando_comprobante',
        { tipo: 'comprobante', monto_bruto: 0, clientId: client.id, saldo_actual: saldoComp });
      await ctx.reply('🧾 Recibí el comprobante. ¿Cuánto fue el monto del pago?');
    }
    return;
  }

  // ── Confirmación de pago por texto ───────────────────────────────────────
  // EXPLICIT: frases que sin duda indican que el usuario está compartiendo un pago.
  // Activan el flujo de pago SIEMPRE, independientemente del saldo.
  // AMBIGUO: palabras sueltas que también aparecen en ENTRADA_KEYWORDS del parser.
  // Solo activan el flujo si saldo < 0 (el cliente adeuda algo).
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

  // ── Detectar si es proveedor confirmando retorno ─────────────────────────
  const RETORNO_KEYWORDS = [
    'retorno pagado','ya entregué','ya entregue','entregué el efectivo','entregue el efectivo',
    'ya deposité al','ya deposite al','deposité el retorno','deposite el retorno',
    'entregué la facturación','entregue la facturacion',
  ];
  const esRetornoProveedor = RETORNO_KEYWORDS.some(k => text.toLowerCase().includes(k));

  if (esPagoTexto) {
    const saldo = saldoActualPago;

    // Si es proveedor confirmando que entregó → buscar op pendiente y marcar retorno
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
          monto_neto: 0, // se recalcula desde la BD
        }).catch(() => null);
        if (resultado) {
          await ctx.reply(
            `✅ <b>Retorno registrado como pagado.</b>\n` +
            `Operación #${opId} marcada como entregada.`,
            { parse_mode: 'HTML' }
          );
          return;
        }
      }
      // No hay operación pendiente → confirmar como pago normal
      await ctx.reply(
        '📩 Anotado. No encontré una operación de retorno pendiente — ¿me mandas el comprobante o el monto?'
      );
      return;
    }

    // Intentar extraer monto del texto
    const amtMatch = text.replace(/[,]/g, '').match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
    const monto    = amtMatch ? parseFloat(amtMatch[1]) : (saldo < 0 ? Math.abs(saldo) : 0);

    if (monto > 0) {
      const pendingDraft = { tipo: 'texto', monto_bruto: monto, clientId: client.id, saldo_actual: saldo };
      await updateSession(session.id, 'confirmando_comprobante', pendingDraft);
      const kb = new InlineKeyboard()
        .text(`✅ Confirmar $${fmt(monto)}`, 'confirmar_comprobante')
        .row()
        .text('✏️ Corregir monto', 'corregir_comprobante')
        .text('❌ Cancelar', 'cancelar_comprobante');
      await ctx.reply(
        `🧾 Entendido. ¿Confirmo un pago de <b>$${fmt(monto)}</b>?\n\n` +
        `Saldo actual: <b>$${fmt(saldo)}</b>\n` +
        `Saldo después: <b>$${fmt(saldo + monto)}</b>`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    } else {
      // No encontramos monto — pedir comprobante o monto
      await updateSession(session.id, 'confirmando_comprobante',
        { tipo: 'comprobante', monto_bruto: 0, clientId: client.id, saldo_actual: saldo });
      await ctx.reply(
        `🧾 Entendido, espero tu comprobante o escríbeme el monto del pago.` +
        (saldo < 0 ? `\n\nSaldo pendiente: <b>$${fmt(Math.abs(saldo))}</b>` : ''),
        { parse_mode: 'HTML' }
      );
    }
    return;
  }

  // ── Corregir monto de factura/comprobante ─────────────────────────────────
  if (session.estado === 'confirmando_factura' || session.estado === 'confirmando_comprobante') {
    const draft    = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
    const esFactura = session.estado === 'confirmando_factura';

    // Respuesta afirmativa por texto → ejecutar confirmación directamente
    const AFIRMATIVO = /^\s*(s[íi]|yes|ok|dale|correcto|confirm[ao]?|adelante|listo|va|sale|claro|exacto|as[íi] es)\s*$/i;
    if (AFIRMATIVO.test(text)) {
      if (!draft.monto_bruto || draft.monto_bruto <= 0) {
        await ctx.reply('⚠️ No hay monto registrado. Escríbeme cuánto depositaste.');
        return;
      }
      if (esFactura) {
        // Factura: delegar al callback (lanzar como si hubiera presionado el botón)
        const kb = new InlineKeyboard()
          .text(`✅ Confirmar $${fmt(draft.monto_bruto)}`, 'confirmar_factura');
        await ctx.reply('✅ Confirmando…', { reply_markup: kb });
      } else {
        try {
          const { saldo_antes, saldo_despues } = await balanceManager.confirmarPago({
            clientId:         client.id,
            monto:            draft.monto_bruto,
            montoNeto:        draft.monto_neto ?? draft.monto_bruto,
            tipo:             draft.tipo ?? 'comprobante',
            tipo_operacion:   draft.tipo_operacion ?? null,
            telegram_file_id: draft.telegram_file_id ?? null,
            notas:            'Comprobante confirmado por cliente (texto)',
          });
          await updateSession(session.id, 'completado', null);
          await ctx.reply(
            `✅ <b>Pago confirmado</b>\n` +
            `Monto: $${fmt(draft.monto_bruto)}\n` +
            `Saldo anterior: $${fmt(saldo_antes)}\n` +
            `<b>Nuevo saldo: $${fmt(saldo_despues)}</b>`,
            { parse_mode: 'HTML' }
          );
        } catch (err) {
          console.error('[confirmarPago texto]', err.message);
          await ctx.reply('⚠️ Error al confirmar el pago. Intenta de nuevo o usa el botón de confirmación.');
        }
      }
      return;
    }

    const num = parseFloat(text.replace(/[^0-9.]/g, ''));
    if (num > 0) {
      draft.monto_bruto = num;
      if (esFactura) {
        draft.monto_neto = Math.round(num * (1 - (draft.comision_pct ?? 0)) * 100) / 100;
      } else {
        draft.monto_neto = num;
      }
      await updateSession(session.id, session.estado, draft);
      const label = esFactura
        ? `📋 Monto actualizado: $${fmt(num)}\nNeto: $${fmt(draft.monto_neto)}`
        : `🧾 Monto actualizado: $${fmt(num)}`;
      const kb = new InlineKeyboard()
        .text('✅ Confirmar', esFactura ? 'confirmar_factura' : 'confirmar_comprobante')
        .text('❌ Cancelar', esFactura ? 'cancelar_factura' : 'cancelar_comprobante');
      await ctx.reply(label + '\n\n¿Correcto?', { parse_mode: 'HTML', reply_markup: kb });
    } else {
      // Texto no reconocido → recordar usar botones
      const monto = draft.monto_bruto ?? 0;
      const kb = new InlineKeyboard()
        .text(`✅ Confirmar $${fmt(monto)}`, esFactura ? 'confirmar_factura' : 'confirmar_comprobante').row()
        .text('✏️ Corregir monto', esFactura ? 'corregir_factura' : 'corregir_comprobante')
        .text('❌ Cancelar', esFactura ? 'cancelar_factura' : 'cancelar_comprobante');
      await ctx.reply(
        `Ya tengo tu comprobante por <b>$${fmt(monto)}</b>. Usa los botones para confirmar.`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    }
    return;
  }

  // Detección implícita: ¿parece una solicitud de operación?
  if (isImplicitOperacion(text)) {
    await procesarOperacion(ctx, text, client, session);
    return;
  }

  // Fallback: decide si hay algo útil que responder
  try {
    const mensajesCtx = await contextManager.getRecientes(chatId, 25);
    const { saldo: saldoCtx } = await balanceManager.getSaldo(client.id);

    if (transactionOrchestrator) {
      const decision = await transactionOrchestrator.rutear({
        estado:           session.estado,
        mensajesRecientes: mensajesCtx,
        textoUsuario:     text,
        saldo:            saldoCtx,
        nombre:           client.nombre,
      });
      if (decision.accion === 'responder_info' && decision.params?.mensaje_respuesta) {
        await ctx.reply(decision.params.mensaje_respuesta);
      } else if (decision.accion !== 'ignorar' && decision.accion !== 'responder_info') {
        await procesarOperacion(ctx, text, client, session);
      }
    } else {
      const { responder, mensaje } = await contextReader.analizar(
        mensajesCtx,
        { estado: session.estado, saldo: saldoCtx, nombre: client.nombre },
        text
      );
      if (responder && mensaje) {
        await ctx.reply(mensaje);
      }
    }
  } catch (e) {
    console.error('[context-reader fallback]', e.message);
  }
});

// Archivos (documentos, fotos)
bot.on(['message:document', 'message:photo'], async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const msg    = ctx.message;

  const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
  const session = await getOrCreateSession(chatId, client.id);

  const fileInfo = extractFileFromMessage(msg);
  if (!fileInfo) return;

  // Modo asistente: bypass del flujo normal — registrar silenciosamente
  const _modoFile = await getChatModo(chatId);
  if (_modoFile === 'asistente') {
    contextManager.logMessage({
      chatId, clientId: client.id, telegramMsgId: msg.message_id,
      fromUserId: ctx.from?.id, fromUsername: ctx.from?.username,
      tipo: fileInfo.mimeType?.startsWith('image/') ? 'foto' : 'documento',
      texto: msg.caption ?? fileInfo.fileName ?? null,
      fileName: fileInfo.fileName ?? null,
    }).catch(() => {});
    return handleAsistenteModo(ctx, client, fileInfo);
  }

  let operationId = null;
  if (session.operation_draft_json) {
    const draft = parseDraft(session.operation_draft_json);
    operationId = draft.operationId ?? null;
  }

  // Log del archivo al historial de mensajes
  contextManager.logMessage({
    chatId,
    clientId: client.id,
    telegramMsgId: msg.message_id,
    fromUserId:    ctx.from?.id,
    fromUsername:  ctx.from?.username,
    tipo: fileInfo.isLink ? 'link' : (fileInfo.mimeType?.startsWith('image/') ? 'foto' : 'documento'),
    texto: msg.caption ?? fileInfo.fileName ?? null,
    fileName: fileInfo.fileName ?? null,
  }).catch(() => {});

  if (fileInfo.isLink) {
    await handleIncomingLink({ pool, clientId: client.id, operationId, url: fileInfo.url });
    await ctx.reply('🔗 Link registrado.');
  } else {
    // ── Intentar factura/comprobante ──────────────────────────────────────────
    // PDFs y documentos: SIEMPRE intentar invoice (un PDF nunca es respuesta a
    // "¿qué tipo de operación?" — siempre es factura o comprobante).
    // Imágenes: bloquear si la sesión está en medio de un flujo de operación,
    // salvo que el caption tenga intención de pago.
    const ACTIVE_ESTADOS_BANKING = ['esperando_datos_bancarios','confirmando_cuentas'];
    const ACTIVE_ESTADOS_BLOCK_IMG = [
      'esperando_tipo','esperando_monto','esperando_entrega',
      'esperando_confirmacion','esperando_edicion',
    ];
    const PAGO_CAPTION_RE = /comparto|comprobante|pago|deposito|deposité|transferencia|factura|retorno/i;
    const captionEsPago   = !!(msg.caption && PAGO_CAPTION_RE.test(msg.caption));
    const esPDF           = !!(fileInfo.mimeType?.includes('pdf') || fileInfo.fileName?.match(/\.pdf$/i));
    // PDFs siempre pasan; imágenes se bloquean en flujos activos salvo caption de pago
    const tryInvoice = !ACTIVE_ESTADOS_BANKING.includes(session.estado) &&
                       (esPDF || captionEsPago || !ACTIVE_ESTADOS_BLOCK_IMG.includes(session.estado));
    if (tryInvoice) {
      try {
        const buffer   = await downloadTelegramFileAsBuffer(BOT_TOKEN, fileInfo.file.file_id);
        // docAgent (Gemini) is primary for non-image docs; images take the imagen_sin_ocr path below
        const _docMime = fileInfo.mimeType?.toLowerCase() ?? '';
        let detected = null;
        if (docAgent && !_docMime.startsWith('image/')) {
          detected = await docAgent.procesarBuffer(buffer, fileInfo.mimeType, fileInfo.fileName);
        }
        if (!detected) {
          detected = await invoiceAgent.procesarBuffer(buffer, fileInfo.mimeType, fileInfo.fileName);
        }

        if (detected?.tipo === 'imagen_sin_ocr') {
          // Reutilizar el buffer ya descargado arriba
          const imgBuffer = buffer;
          const mimeImg   = fileInfo.mimeType ?? 'image/jpeg';

          const imgAgent = docAgent ?? visionAgent;
          if (imgAgent) {
            // docAgent uses a single Gemini call for both; visionAgent uses two parallel calls
            let cuentas, visionResult;
            if (docAgent) {
              ({ cuentas, visionResult } = await docAgent.analizarImagenCompleta(imgBuffer, mimeImg));
              // If Gemini failed (rate limit, quota, etc.) fall back to visionAgent
              if (!cuentas.length && !visionResult && visionAgent) {
                console.warn('[docAgent] Gemini sin resultado — fallback a visionAgent (Haiku)');
                ([{ cuentas }, visionResult] = await Promise.all([
                  visionAgent.extraerCuentasBancarias(imgBuffer, mimeImg),
                  visionAgent.analizarFactura(imgBuffer, mimeImg),
                ]));
              }
            } else {
              ([{ cuentas }, visionResult] = await Promise.all([
                imgAgent.extraerCuentasBancarias(imgBuffer, mimeImg),
                imgAgent.analizarFactura(imgBuffer, mimeImg),
              ]));
            }

            // Si también hay monto detectado, es un comprobante (no lista de cuentas para entrega)
            // — en ese caso preferir la interpretación de comprobante para no guardar cuentas del receptor
            if (cuentas.length && !visionResult?.monto_total) {
              const { ajenas, eraVuelta } = await filtrarCuentasAjenas(cuentas);
              if (eraVuelta && !ajenas.length) {
                // Todas las cuentas detectadas son nuestras → es un comprobante de pago
                // Intentar extraer monto del texto de la imagen via visionResult si lo tiene
                detected = { tipo: 'comprobante', monto_total: visionResult?.monto_total ?? 0, datos_bancarios: [] };
              } else if (ajenas.length) {
                const hayBajaConfianza = ajenas.some(c => c.confianza === 'baja');
                const aviso = hayBajaConfianza
                  ? '\n\n⚠️ Algunos números pueden tener errores. Por favor verifica antes de confirmar.'
                  : '';
                await bankingManager.guardarCuentas(client.id, null, ajenas);
                await ctx.reply(
                  `📊 Detecté y guardé <b>${ajenas.length}</b> cuenta(s) bancarias:\n\n${BankingManager.formatearCuentas(ajenas)}${aviso}\n\n` +
                  `Quedan registradas. Si son para una operación, iníciala con <code>/operacion</code>.`,
                  { parse_mode: 'HTML' }
                );
                return;
              }
            }

            if (visionResult?.monto_total > 0) {
              detected = {
                tipo:           visionResult.tipo === 'factura' ? 'factura' : 'comprobante',
                monto_total:    visionResult.monto_total,
                tipo_operacion: null,
                confianza:      'media',
                emisor:         visionResult.emisor_nombre,
                emisor_rfc:     visionResult.emisor_rfc,
                datos_bancarios: visionResult.datos_bancarios ?? [],
              };
            }
          }

          // 3. Sin visión o sin resultado → pedir monto si saldo negativo
          if (detected?.tipo === 'imagen_sin_ocr') {
            const { saldo } = await balanceManager.getSaldo(client.id);
            if (saldo < 0) {
              await updateSession(session.id, 'confirmando_comprobante',
                { tipo: 'comprobante', monto_bruto: 0, clientId: client.id, saldo_actual: saldo });
              await ctx.reply(
                `📸 Recibí la imagen. Saldo actual: <b>$${fmt(saldo)}</b>.\n` +
                `¿Cuánto fue el monto? Escríbeme el número.`,
                { parse_mode: 'HTML' }
              );
            } else {
              await ctx.reply('📸 Imagen registrada. Si es un comprobante o factura, escríbeme el monto.');
            }
            await handleIncomingFile({ pool, clientId: client.id, operationId, botToken: BOT_TOKEN,
              telegramFileOrPhoto: fileInfo.file, mimeType: fileInfo.mimeType, fileName: fileInfo.fileName });
            return;
          }
        }

        if (detected?.tipo === 'factura' && detected.monto_total > 0) {
          const tipoOp     = detected.tipo_operacion ?? 'IAS';
          const commission = await getCommission(tipoOp, pool, client.id);
          const pct        = commission?.pct ?? 0.055;
          const mb         = detected.monto_total;
          const mn         = Math.round(mb * (1 - pct) * 100) / 100;
          const { saldo: saldoAntesFactura } = await balanceManager.getSaldo(client.id);
          const draft      = { tipo: 'factura', monto_bruto: mb, monto_neto: mn, comision_pct: pct,
                               tipo_operacion: tipoOp, clientId: client.id,
                               telegram_file_id: fileInfo.file.file_id, confianza: detected.confianza,
                               emisor: detected.emisor ?? null, emisor_rfc: detected.emisor_rfc ?? null };
          await updateSession(session.id, 'confirmando_factura', draft);

          // Guardar cuentas bancarias del emisor para futura referencia
          if (detected.datos_bancarios?.length) {
            bankingManager.guardarCuentas(client.id, null, detected.datos_bancarios).catch(() => {});
          }

          const emisorLine = detected.emisor ? `\nEmisor: <b>${detected.emisor}</b>` : '';
          const kb = new InlineKeyboard()
            .text(`✅ Confirmar $${fmt(mb)}`, 'confirmar_factura').row()
            .text('✏️ Corregir monto', 'corregir_factura')
            .text('❌ Cancelar', 'cancelar_factura');
          await ctx.reply(
            `📋 <b>Factura detectada</b>${emisorLine}\n\n` +
            `Tipo: <b>${tipoOp}</b>\n` +
            `Bruto: <b>$${fmt(mb)}</b>  →  Neto: <b>$${fmt(mn)}</b>\n` +
            `Saldo actual: $${fmt(saldoAntesFactura)}  →  Nuevo: <b>$${fmt(saldoAntesFactura + mn)}</b>\n\n` +
            `¿Confirmo y actualizo tu saldo?`,
            { parse_mode: 'HTML', reply_markup: kb }
          );
          return;

        } else if (detected?.tipo === 'comprobante') {
          // Si ya hay confirmación pendiente, recordar usar los botones en lugar de crear otra
          if (session.estado === 'confirmando_comprobante') {
            const prevDraft = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
            const kb = new InlineKeyboard()
              .text(`✅ Confirmar $${fmt(prevDraft.monto_bruto ?? detected.monto_total)}`, 'confirmar_comprobante').row()
              .text('✏️ Corregir monto', 'corregir_comprobante')
              .text('❌ Cancelar', 'cancelar_comprobante');
            await ctx.reply(
              `Ya tengo un comprobante pendiente por <b>$${fmt(prevDraft.monto_bruto ?? detected.monto_total)}</b>. ` +
              `Usa los botones para confirmar o cancela para reemplazarlo.`,
              { parse_mode: 'HTML', reply_markup: kb }
            );
            return;
          }
          const { saldo } = await balanceManager.getSaldo(client.id);
          const mb = detected.monto_total ?? 0;
          if (mb <= 0) {
            // Comprobante detectado pero sin monto (ej. nuestra CLABE como receptor) → pedir monto
            await updateSession(session.id, 'confirmando_comprobante',
              { tipo: 'comprobante', monto_bruto: 0, clientId: client.id, saldo_actual: saldo,
                telegram_file_id: fileInfo.file.file_id });
            await ctx.reply(
              `🧾 <b>Comprobante recibido.</b>\n` +
              `Saldo actual: <b>$${fmt(saldo)}</b>\n\n` +
              `¿Cuánto fue el monto del pago?`,
              { parse_mode: 'HTML' }
            );
            return;
          }
          const draft = { tipo: 'comprobante', monto_bruto: mb, monto_neto: mb,
                          clientId: client.id, saldo_actual: saldo,
                          telegram_file_id: fileInfo.file.file_id };
          await updateSession(session.id, 'confirmando_comprobante', draft);
          const kb = new InlineKeyboard()
            .text(`✅ Confirmar $${fmt(mb)}`, 'confirmar_comprobante').row()
            .text('✏️ Corregir monto', 'corregir_comprobante')
            .text('❌ Cancelar', 'cancelar_comprobante');
          await ctx.reply(
            `🧾 <b>Comprobante de pago detectado</b>\n\n` +
            `Monto: <b>$${fmt(mb)}</b>\n` +
            `Saldo actual: $${fmt(saldo)} → <b>$${fmt(saldo + mb)}</b>\n\n` +
            `¿Confirmo y actualizo tu saldo?`,
            { parse_mode: 'HTML', reply_markup: kb }
          );
          return;
        }
      } catch (err) {
        console.error('[invoice-detect]', err.message);
      }
    }

    // Si está esperando datos bancarios, intentar extraerlos del archivo o imagen
    if (session.estado === 'esperando_datos_bancarios') {
      // Fresh read para no usar session.operation_draft_json cacheado al inicio del handler
      const [_bRows] = await pool.query('SELECT operation_draft_json FROM fin_sessions WHERE id=?', [session.id]);
      const draft    = parseDraft(_bRows[0]?.operation_draft_json ?? session.operation_draft_json);
      const esImagen = fileInfo.mimeType?.startsWith('image/');
      const esXlsx   = fileInfo.mimeType?.includes('spreadsheet') ||
                       fileInfo.mimeType?.includes('excel')       ||
                       fileInfo.fileName?.match(/\.xlsx?$/i);
      let cuentas = [];
      try {
        const buffer = await downloadTelegramFileAsBuffer(BOT_TOKEN, fileInfo.file.file_id);

        const imgAgentBanking = docAgent ?? visionAgent;
        if (esImagen && imgAgentBanking) {
          const { cuentas: cs } = await imgAgentBanking.extraerCuentasBancarias(buffer, fileInfo.mimeType);
          cuentas = cs;
        } else if (esXlsx) {
          cuentas = BankingManager.parsearXlsx(buffer);
        } else {
          cuentas = BankingManager.parsearCsv(buffer.toString('utf-8'));
        }
      } catch (e) { console.error('[banking-file]', e.message); }

      if (cuentas.length) {
        const hayBajaConfianza = cuentas.some(c => c.confianza === 'baja');
        const aviso = hayBajaConfianza
          ? '\n\n⚠️ Algunos números pueden tener errores. Por favor verifica antes de confirmar.'
          : '';

        // Calcular total de montos individuales si la tabla los incluye
        const tabla_total = Math.round(
          cuentas.reduce((sum, c) => sum + (parseFloat(c.monto) || 0), 0) * 100
        ) / 100;

        draft.cuentas_bancarias = cuentas;
        draft.tabla_pagos       = cuentas;
        draft.tabla_total       = tabla_total > 0 ? tabla_total : null;

        // Guardar cuentas como empresa del cliente (fire-and-forget)
        if (!draft.es_entrada && client?.id) {
          q.saveEmpresaClienteFromChat(pool, client.id, cuentas)
            .catch(err => console.error('[empresa-chat]', err.message));
        }

        // Si hay montos individuales y el draft tiene una operación mayor, ajustar el batch
        if (tabla_total > 0 && draft.monto_neto && draft.monto_neto > tabla_total + 0.01) {
          draft.monto_neto_original  = draft.monto_neto;
          draft.monto_bruto_original = draft.monto_bruto;
          // El batch solo procesa tabla_total (sin comisión adicional, ya fue descontada al inicio)
          draft.monto_neto  = tabla_total;
          draft.monto_bruto = tabla_total;
          draft.comision_pct = 0;
        }

        const totalLine = tabla_total > 0
          ? `\n💰 <b>Total detectado: $${tabla_total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b>` +
            (draft.monto_neto_original ? ` de $${draft.monto_neto_original.toLocaleString('es-MX', { minimumFractionDigits: 2 })} operación total` : '')
          : '';

        // Si falta tipo/monto, pedir la operación de inmediato (evita el guard al confirmar)
        if (!draft.tipo_operacion || !draft.monto_bruto) {
          await updateSession(session.id, 'esperando_tipo', draft);
          const ejemplo = tabla_total > 0 ? fmt(tabla_total) : '9836';
          await ctx.reply(
            `📊 Encontré <b>${cuentas.length}</b> cuenta(s):\n\n${BankingManager.formatearCuentas(cuentas)}${aviso}${totalLine}\n\n` +
            `✅ Cuentas listas. ¿Qué operación es?\n` +
            `Escribe tipo y monto. Ejemplo: <code>IAS ${ejemplo}</code>`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        await updateSession(session.id, 'esperando_datos_bancarios', draft);

        const kb = new InlineKeyboard()
          .text('✅ Sí, continuar', 'confirmar_cuentas')
          .text('✏️ Corregir', 'nueva_cuenta');
        await ctx.reply(
          `📊 Encontré <b>${cuentas.length}</b> cuenta(s):\n\n${BankingManager.formatearCuentas(cuentas)}${aviso}${totalLine}\n\n¿Es correcto?`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
        return;
      }
      if (esImagen) {
        await ctx.reply(
          '📷 No pude leer los números en la imagen.\n\nIntenta enviar el <b>archivo Excel (.xlsx)</b> directamente, o escríbeme los números.',
          { parse_mode: 'HTML' }
        );
      } else {
        await ctx.reply('No pude extraer cuentas del archivo. Por favor envíame los números directamente como texto.');
      }
    }

    await handleIncomingFile({
      pool, clientId: client.id, operationId,
      botToken: BOT_TOKEN,
      telegramFileOrPhoto: fileInfo.file,
      mimeType: fileInfo.mimeType,
      fileName: fileInfo.fileName,
    });
    if (session.estado !== 'esperando_datos_bancarios') {
      await ctx.reply('📎 Archivo registrado.');
    }
  }
});

// Respuesta a polls (confirmación/cancelación)
bot.on('poll_answer', async (ctx) => {
  const { action, operationDraft, chatId } = pollHandler.processPollAnswer(ctx.pollAnswer);

  if (action === 'unknown') return;

  if (action === 'cancel') {
    const session = await getOrCreateSession(chatId);
    await updateSession(session.id, 'completado', null);
    await bot.api.sendMessage(chatId, responseGen.formatCancelled());
    return;
  }

  if (action === 'edit') {
    const session = await getOrCreateSession(chatId);
    await pollHandler.sendEditMenu(chatId, operationDraft);
    await updateSession(session.id, 'esperando_edicion', operationDraft);
    return;
  }

  if (action === 'confirm') {
    const session  = await getOrCreateSession(chatId);
    const clientId = operationDraft.clientId ?? session.client_id;
    if (!clientId) {
      await bot.api.sendMessage(chatId, '❌ No se pudo identificar el cliente. Reinicia con /reset e intenta de nuevo.');
      return;
    }
    try {
      const { operationId, saldo_despues } = await saveConfirmedOperation(
        operationDraft, clientId, chatId
      );
      await updateSession(session.id, 'completado', null);
      await bot.api.sendMessage(
        chatId,
        responseGen.formatConfirmed({
          tipo_operacion:    operationDraft.tipo_operacion,
          monto_neto:        operationDraft.monto_neto,
          monto_bruto:       operationDraft.monto_bruto,
          saldo_nuevo:       saldo_despues,
          es_entrada:        operationDraft.es_entrada,
          instrucciones_pago: operationDraft.instrucciones_pago,
        }),
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[confirm]', err);
      await bot.api.sendMessage(chatId, `❌ Error al confirmar: ${err.message}`);
    }
    return;
  }
});

// Callbacks de InlineKeyboard
bot.on('callback_query:data', async (ctx) => {
  const data   = ctx.callbackQuery.data;
  const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
  const userId = ctx.from?.id;

  // ── Admin: guardarme como admin ──────────────────────────────────────────
  if (data.startsWith('admin_self_')) {
    await ctx.answerCallbackQuery();
    const targetId = parseInt(data.replace('admin_self_', ''));
    if (targetId !== userId && !ADMIN_USER_IDS.has(userId)) {
      await ctx.reply('⛔ Solo tú puedes solicitar tu propio acceso.');
      return;
    }
    if (ADMIN_USER_IDS.size > 0 && !ADMIN_USER_IDS.has(userId)) {
      await ctx.reply('⛔ Ya hay administradores. Solo un admin existente puede añadir nuevos.');
      return;
    }
    try {
      await q.setClientAdmin(pool, targetId, true);
      ADMIN_USER_IDS.add(targetId);
      try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch (_) {}
      // Actualizar menú de comandos para el nuevo admin
      const comandosAdmin = [
        { command: 'start',     description: 'Bienvenida / comenzar' },
        { command: 'saldo',     description: 'Ver tu saldo actual' },
        { command: 'historial', description: 'Ver historial de operaciones' },
        { command: 'operacion', description: 'Iniciar una nueva operación' },
        { command: 'reset',     description: 'Reiniciar sesión actual' },
        { command: 'miid',      description: 'Ver tu Telegram ID' },
        { command: 'ajuste',    description: '(Admin) Ajuste manual de saldo' },
        { command: 'testmode',  description: '(Admin) Activar/desactivar modo prueba' },
        { command: 'rol',       description: '(Admin) Cambiar rol del chat' },
      ];
      bot.api.setMyCommands(comandosAdmin, {
        scope: { type: 'chat', chat_id: targetId },
      }).catch(() => {});
      await ctx.reply(
        `✅ <b>Guardado como administrador.</b>\n` +
        `ID <code>${targetId}</code> tiene acceso completo.\n\n` +
        `Usa <code>/testmode</code> para activar el modo de prueba.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      await ctx.reply(`❌ Error al guardar: ${err.message}`);
    }
    return;
  }

  // ── Edición de campos ────────────────────────────────────────────────────
  if (data.startsWith('edit_field:')) {
    const field = data.replace('edit_field:', '');
    const result = await pollHandler.processEditFieldSelection(
      chatId, field, ctx.callbackQuery.id
    );
    if (result?.action === 'cancel') {
      await ctx.reply(responseGen.formatCancelled());
    }
    return;
  }

  // ── Confirmar factura ─────────────────────────────────────────────────────
  if (data === 'confirmar_factura') {
    await ctx.answerCallbackQuery();
    const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
    const session = await getOrCreateSession(chatId, client.id);
    const draft   = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
    try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch (_) {}

    const { operationId, saldo_despues } = await saveConfirmedOperation({
      ...draft,
      tipo_operacion:   draft.tipo_operacion,
      monto_bruto:      draft.monto_bruto,
      monto_neto:       draft.monto_neto,
      comision_pct:     draft.comision_pct,
      es_entrada:       true,
      solicita_neto:    false,
      tipo_monto:       'bruto',
      monto_solicitado: draft.monto_bruto,
      tipo_entrega:     'spei',
      tiene_factura:    true,
    }, client.id, chatId);
    await updateSession(session.id, 'completado', null);
    await ctx.reply(
      `✅ <b>Factura registrada</b>\n` +
      `Operación #${operationId} — ${draft.tipo_operacion}\n` +
      `Bruto: $${fmt(draft.monto_bruto)} · Neto acreditado: <b>$${fmt(draft.monto_neto)}</b>\n` +
      `<b>Nuevo saldo: $${fmt(saldo_despues)}</b>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (data === 'corregir_factura') {
    await ctx.answerCallbackQuery();
    try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch (_) {}
    await ctx.reply('✏️ Envíame el monto correcto de la factura:');
    return;
  }

  if (data === 'cancelar_factura') {
    await ctx.answerCallbackQuery();
    const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
    const session = await getOrCreateSession(chatId, client.id);
    await updateSession(session.id, 'completado', null);
    try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch (_) {}
    await ctx.reply('❌ Registro cancelado.');
    return;
  }

  // ── Confirmar comprobante de pago ─────────────────────────────────────────
  if (data === 'confirmar_comprobante') {
    await ctx.answerCallbackQuery();
    const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
    const session = await getOrCreateSession(chatId, client.id);
    const draft   = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
    try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch (_) {}

    if (!draft.monto_bruto || draft.monto_bruto <= 0) {
      await ctx.reply('⚠️ No hay monto registrado. Escríbeme cuánto depositaste.');
      return;
    }
    let saldo_antes, saldo_despues;
    try {
      ({ saldo_antes, saldo_despues } = await balanceManager.confirmarPago({
        clientId:         client.id,
        monto:            draft.monto_bruto,
        montoNeto:        draft.monto_neto ?? draft.monto_bruto,
        tipo:             draft.tipo ?? 'comprobante',
        tipo_operacion:   draft.tipo_operacion ?? null,
        telegram_file_id: draft.telegram_file_id ?? null,
        notas:            'Comprobante confirmado por cliente',
      }));
    } catch (err) {
      console.error('[confirmar_comprobante callback]', err.message);
      await ctx.reply(`⚠️ Error al confirmar: ${err.message}`);
      return;
    }
    await updateSession(session.id, 'completado', null);

    // Si hay una distribución pendiente (entrega a terceros), procesarla ahora
    if (draft.post_confirm_distribucion) {
      const dist = { ...draft.post_confirm_distribucion, clientId: client.id };
      try {
        const { saldo_despues: saldoFinal } = await saveConfirmedOperation(dist, client.id, chatId);
        const restante = dist.monto_neto_original && dist.monto_neto_original > dist.monto_neto + 0.01
          ? Math.round((dist.monto_neto_original - dist.monto_neto) * 100) / 100
          : null;
        await ctx.reply(
          `✅ <b>Pago recibido y entrega procesada</b>\n\n` +
          `Comprobante: $${fmt(draft.monto_bruto)} → ${draft.tipo_operacion}\n` +
          `Entrega: $${fmt(dist.tabla_total ?? dist.monto_neto)}` +
          (dist.tabla_pagos?.length ? ` a ${dist.tabla_pagos.length} personas` : '') + `\n` +
          (restante !== null ? `Restante de operación: <b>$${fmt(restante)}</b>\n` : '') +
          `<b>Saldo actualizado: $${fmt(saldoFinal)}</b>`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        console.error('[dist-post-confirm]', e.message);
        await ctx.reply(
          `✅ <b>Pago confirmado</b>\n` +
          `Saldo: <b>$${fmt(saldo_despues)}</b>\n` +
          `⚠️ La distribución requiere atención manual: ${e.message}`,
          { parse_mode: 'HTML' }
        );
      }
      return;
    }

    await ctx.reply(
      `✅ <b>Pago confirmado</b>\n` +
      `Monto: $${fmt(draft.monto_bruto)}\n` +
      `Saldo anterior: $${fmt(saldo_antes)}\n` +
      `<b>Nuevo saldo: $${fmt(saldo_despues)}</b>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (data === 'corregir_comprobante') {
    await ctx.answerCallbackQuery();
    try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch (_) {}
    await ctx.reply('✏️ Envíame el monto correcto del pago:');
    return;
  }

  if (data === 'cancelar_comprobante') {
    await ctx.answerCallbackQuery();
    const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
    const session = await getOrCreateSession(chatId, client.id);
    await updateSession(session.id, 'completado', null);
    try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch (_) {}
    await ctx.reply('❌ Confirmación cancelada.');
    return;
  }

  // ── Datos bancarios: usar cuenta existente ────────────────────────────────
  if (data.startsWith('usar_cuenta_')) {
    await ctx.answerCallbackQuery();
    const cuentaId = parseInt(data.replace('usar_cuenta_', ''));
    const client   = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
    const session  = await getOrCreateSession(chatId, client.id);
    const draft    = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
    const cuenta   = (draft.cuentas_disponibles ?? []).find(c => c.id === cuentaId);
    if (!cuenta) { await ctx.reply('Cuenta no encontrada, intenta de nuevo.'); return; }
    draft.cuentas_bancarias = [cuenta];
    try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch (_) {}
    await mostrarResumenYPoll(ctx, draft, client, session);
    return;
  }

  // ── Datos bancarios: ingresar nuevos ──────────────────────────────────────
  if (data === 'nueva_cuenta') {
    await ctx.answerCallbackQuery();
    const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
    const session = await getOrCreateSession(chatId, client.id);
    const draft   = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
    delete draft.cuentas_bancarias;
    try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch (_) {}
    await ctx.reply(
      '💳 Envíame la CLABE (18 dígitos), número de tarjeta o cuenta.\n' +
      'También puedes subir un archivo Excel, CSV o TXT con varias cuentas.',
    );
    await updateSession(session.id, 'esperando_datos_bancarios', draft);
    return;
  }

  // ── Datos bancarios: confirmar ────────────────────────────────────────────
  if (data === 'confirmar_cuentas') {
    await ctx.answerCallbackQuery();
    const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
    const session = await getOrCreateSession(chatId, client.id);
    const draft   = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
    try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }); } catch (_) {}

    // Garantizar clientId siempre presente
    draft.clientId = draft.clientId ?? client.id;

    // Si falta tipo u monto, el draft llegó sin contexto de operación → pedirlos
    if (!draft.tipo_operacion || !draft.monto_bruto) {
      await updateSession(session.id, 'esperando_tipo', draft);
      await ctx.reply(
        '✅ Cuentas listas. Para procesarlas, ¿qué operación es?\n' +
        'Escribe tipo y monto. Ejemplo: <code>IAS 9836</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Si es salida, verificar saldo antes de mostrar el poll
    if (!draft.es_entrada) {
      const { saldo } = await balanceManager.getSaldo(client.id);
      const montoNeto      = draft.monto_neto  ?? draft.monto_bruto ?? 0;
      const montoOrigNeto  = draft.monto_neto_original  ?? montoNeto;
      const montoOrigBruto = draft.monto_bruto_original ?? draft.monto_bruto ?? montoNeto;

      if (saldo < montoNeto - 0.01) {
        const saldoFinalEstimado = Math.round((saldo + montoOrigNeto - montoNeto) * 100) / 100;
        const esParcialpago = montoOrigNeto !== montoNeto;

        await ctx.reply(
          `💳 <b>Se requiere pago previo</b>\n\n` +
          `Saldo neto anterior: <b>$${fmt(saldo)}</b>\n` +
          (esParcialpago
            ? `Operación total: $${fmt(montoOrigBruto)} bruto → <b>$${fmt(montoOrigNeto)} neto</b>\n`
            : '') +
          `Esta entrega: <b>$${fmt(montoNeto)}</b>` +
          (draft.tabla_pagos?.length ? ` a ${draft.tabla_pagos.length} personas` : '') + `\n` +
          `Saldo neto tras el pago y la entrega: <b>$${fmt(saldoFinalEstimado)}</b>\n\n` +
          `¿Ya realizaste el pago de <b>$${fmt(montoOrigBruto)}</b>?\n` +
          `Comparte el comprobante para confirmar y procesar la entrega.`,
          { parse_mode: 'HTML' }
        );

        await updateSession(session.id, 'confirmando_comprobante', {
          tipo:           'comprobante',
          monto_bruto:    montoOrigBruto,
          monto_neto:     montoOrigNeto,
          tipo_operacion: draft.tipo_operacion,
          clientId:       client.id,
          saldo_actual:   saldo,
          post_confirm_distribucion: {
            tipo_operacion: draft.tipo_operacion,
            monto_neto:     montoNeto,
            monto_bruto:    montoNeto,
            comision_pct:   0,
            es_entrada:     false,
            solicita_neto:  false,
            tipo_entrega:   draft.tipo_entrega ?? 'spei',
            tabla_pagos:    draft.tabla_pagos   ?? null,
            tabla_total:    draft.tabla_total   ?? null,
            monto_neto_original:  montoOrigNeto,
            monto_bruto_original: montoOrigBruto,
            cuentas_bancarias: draft.cuentas_bancarias ?? [],
            clientId: client.id,
          },
        });
        return;
      }
    }

    await mostrarResumenYPoll(ctx, draft, client, session);
    return;
  }

  await ctx.answerCallbackQuery();
});

// ── Lógica central de procesamiento de operación ──────────────────────────────

async function procesarOperacion(ctx, input, client, session) {
  const chatId = ctx.chat?.id;

  // 1. Parsear
  let parsed = parseCommand(input);

  // Si falta información, intentar con texto natural
  if (!parsed.tipo || !parsed.monto) {
    const natural = parseNaturalText(input);
    parsed = {
      tipo:       parsed.tipo  ?? natural.tipo,
      tipo_monto: parsed.tipo_monto ?? natural.tipo_monto,
      monto:      parsed.monto ?? natural.monto,
      es_entrada: natural.es_entrada,
    };
  }

  // Si AÚN falta tipo → preguntar
  if (!parsed.tipo) {
    // Intentar con LLM para texto libre complejo
    if (input.length > 10) {
      const { saldo } = await balanceManager.getSaldo(client.id);
      const llmResult = await responseGen.parseFreeText(input, { saldo, nombre: client.nombre });
      if (llmResult?.tipo && llmResult.tipo !== 'null') {
        parsed.tipo       = llmResult.tipo;
        parsed.tipo_monto = llmResult.tipo_monto ?? parsed.tipo_monto;
        parsed.monto      = llmResult.monto ?? parsed.monto;
        parsed.es_entrada = llmResult.es_entrada ?? parsed.es_entrada;
      }
    }
    if (!parsed.tipo) {
      const tipos = listTypes();
      await ctx.reply(responseGen.formatAskTipo(tipos), { parse_mode: 'HTML' });
      const baseDraft = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
      await updateSession(session.id, 'esperando_tipo', { ...baseDraft, clientId: client.id });
      return;
    }
  }

  // Si falta monto → preguntar
  if (!parsed.monto) {
    const commission = await getCommission(parsed.tipo, pool, client.id);
    if (!commission) {
      await ctx.reply(`❌ El tipo de operación <b>${parsed.tipo}</b> no está disponible para tu cuenta.`, { parse_mode: 'HTML' });
      await updateSession(session.id, 'idle', null);
      return;
    }
    await ctx.reply(responseGen.formatAskMonto(parsed.tipo), { parse_mode: 'HTML' });
    const baseDraft = session.operation_draft_json ? parseDraft(session.operation_draft_json) : {};
    await updateSession(session.id, 'esperando_monto', { ...baseDraft, tipo_operacion: parsed.tipo, clientId: client.id });
    return;
  }

  // 2. Calcular
  const commission = await getCommission(parsed.tipo, pool, client.id);
  if (!commission) {
    await ctx.reply(`❌ El tipo de operación <b>${parsed.tipo}</b> no está disponible para tu cuenta.`, { parse_mode: 'HTML' });
    await updateSession(session.id, 'idle', null);
    return;
  }

  const tipo_monto = parsed.tipo_monto ?? 'neto';
  const es_entrada = parsed.es_entrada ?? false;

  const { monto_bruto, monto_neto, comision_pct, comision_mxn } = calcularMontos({
    monto: parsed.monto,
    tipo_monto,
    comision_pct: commission.pct,
  });

  // 3. Verificar saldo para operaciones de salida
  const { saldo } = await balanceManager.getSaldo(client.id);
  let tiene_saldo  = true;
  let saldo_nuevo  = saldo;
  let faltante     = 0;

  if (!es_entrada) {
    const saldoCheck = verifier.verificarSaldo({ saldo_actual: saldo, monto_bruto, es_entrada });
    tiene_saldo = saldoCheck.tiene_saldo;
    faltante    = saldoCheck.faltante ?? 0;
  }

  const { saldo_nuevo: saldoProyectado } = proyectarSaldo({
    saldo_actual: saldo, monto_neto, monto_bruto, es_entrada,
  });
  saldo_nuevo = saldoProyectado;

  // 4. Construir draft
  const draft = {
    clientId:          client.id,
    tipo_operacion:    parsed.tipo,
    tipo_monto,
    monto_solicitado:  parsed.monto,
    monto_bruto,
    monto_neto,
    comision_pct,
    es_entrada,
    solicita_neto:     tipo_monto === 'neto',
    tipo_entrega:      parsed.tipo?.toUpperCase() === 'TARJETAS' ? 'tarjeta'
                     : parsed.tipo?.toUpperCase() === 'EFECTIVO' ? 'efectivo'
                     : 'spei',
    instrucciones_pago: null, // se configura por tipo de operación en fin_operation_types
    tiene_saldo_suficiente: tiene_saldo,
    tiene_factura:     false,
  };

  // 4.5 Recuperar tabla_pagos si el usuario envió la imagen antes de indicar tipo/monto
  // Leer siempre directo de DB para evitar usar el objeto session cacheado al inicio del handler
  const [_freshRows] = await pool.query('SELECT operation_draft_json FROM fin_sessions WHERE id=?', [session.id]);
  const prevDraft = parseDraft(_freshRows[0]?.operation_draft_json ?? session.operation_draft_json);
  if (prevDraft.tabla_pagos?.length && !draft.cuentas_bancarias?.length) {
    draft.tabla_pagos       = prevDraft.tabla_pagos;
    draft.tabla_total       = prevDraft.tabla_total ?? null;
    draft.cuentas_bancarias = prevDraft.cuentas_bancarias ?? prevDraft.tabla_pagos;
    if (draft.tabla_total && draft.monto_neto > draft.tabla_total + 0.01) {
      draft.monto_neto_original  = draft.monto_neto;
      draft.monto_bruto_original = draft.monto_bruto;
      draft.monto_neto           = draft.tabla_total;
      draft.monto_bruto          = draft.tabla_total;
      draft.comision_pct         = 0;
      const { saldo_nuevo: sAdj } = proyectarSaldo({
        saldo_actual: saldo, monto_neto: draft.monto_neto, monto_bruto: draft.monto_bruto, es_entrada,
      });
      saldo_nuevo = sAdj;
    }
  }

  // 4.6 Cargar instrucciones de pago desde nuestra empresa asignada al cliente
  //     (aplica tanto para entrada como para salida con saldo insuficiente)
  if (!draft.instrucciones_pago) {
    try {
      const empRow = await q.getEmpresaNuestraForClient(pool, client.id);
      if (empRow) {
        draft.instrucciones_pago = [
          empRow.empresa_nombre,
          `Banco: ${empRow.banco}`,
          empRow.titular    ? `Titular: ${empRow.titular}`   : '',
          empRow.clabe      ? `CLABE: ${empRow.clabe}`       : '',
          empRow.num_cuenta ? `Cuenta: ${empRow.num_cuenta}` : '',
          empRow.alias      ? `(${empRow.alias})`            : '',
        ].filter(Boolean).join('\n');
      }
    } catch (err) { console.error('[empresa-pago]', err.message); }
  }

  // 5. Verificar consistencia
  const verification = verifier.verificarConsistencia(draft);
  if (!verification.ok) {
    const msg = verifier.formatVerificationResult(verification);
    if (msg) await ctx.reply(msg, { parse_mode: 'HTML' });
    // Aplicar correcciones automáticas
    Object.assign(draft, verification.correcciones);
  }

  // 6. Pedir dirección solo para operaciones con entrega física
  if (['efectivo', 'tarjeta'].includes(draft.tipo_entrega) && !draft.direccion_entrega && !es_entrada) {
    await ctx.reply(responseGen.formatAskDireccion());
    await updateSession(session.id, 'esperando_entrega', { ...draft, saldo_actual: saldo, saldo_nuevo });
    return;
  }

  // 7. Pedir datos bancarios para transferencias salientes (IAS, SPEI, SINDICATO, TARJETAS)
  const TIPOS_BANCARIOS = ['IAS', 'SPEI', 'SINDICATO', 'TARJETAS'];
  if (TIPOS_BANCARIOS.includes(draft.tipo_operacion?.toUpperCase()) && !es_entrada && !draft.cuentas_bancarias?.length) {
    const cuentas = await bankingManager.getCuentasRecientes(client.id, 3);

    if (cuentas.length) {
      const kb = new InlineKeyboard();
      cuentas.forEach(c => {
        const label = `${c.tipo} ···${c.numero.slice(-4)}${c.banco ? ' · ' + c.banco : ''}`;
        kb.text(label, `usar_cuenta_${c.id}`).row();
      });
      kb.text('➕ Nuevos datos', 'nueva_cuenta');

      await ctx.reply(
        `💳 <b>Datos bancarios para el pago de $${fmt(draft.monto_neto)}</b>\n\n` +
        `Cuentas registradas:\n\n${BankingManager.formatearCuentas(cuentas)}\n\n¿Cuál usar?`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      await updateSession(session.id, 'confirmando_cuentas', { ...draft, cuentas_disponibles: cuentas, saldo_actual: saldo, saldo_nuevo });
    } else {
      await ctx.reply(
        `💳 ¿A qué cuenta se realizará el pago de <b>$${fmt(draft.monto_neto)}</b>?\n\n` +
        `Puedes enviarme:\n` +
        `• CLABE (18 dígitos), número de tarjeta o cuenta\n` +
        `• Archivo <b>Excel, CSV o TXT</b> con varias cuentas\n\n` +
        `Incluye banco y nombre del titular si tienes.`,
        { parse_mode: 'HTML' }
      );
      const savedDraft = { ...draft, saldo_actual: saldo, saldo_nuevo };
      await updateSession(session.id, 'esperando_datos_bancarios', savedDraft);
    }
    return;
  }

  // Saldo check para cuentas ya cargadas que no pasaron por confirmar_cuentas
  if (!es_entrada && draft.cuentas_bancarias?.length && saldo < (draft.monto_neto ?? 0) - 0.01) {
    const montoNeto      = draft.monto_neto ?? draft.monto_bruto ?? 0;
    const montoOrigNeto  = draft.monto_neto_original  ?? montoNeto;
    const montoOrigBruto = draft.monto_bruto_original ?? draft.monto_bruto ?? montoNeto;
    const saldoFinal     = Math.round((saldo + montoOrigNeto - montoNeto) * 100) / 100;
    const esParcialpago  = montoOrigNeto !== montoNeto;

    await ctx.reply(
      `💳 <b>Se requiere pago previo</b>\n\n` +
      `Saldo neto anterior: <b>$${fmt(saldo)}</b>\n` +
      (esParcialpago ? `Operación total: $${fmt(montoOrigBruto)} bruto → <b>$${fmt(montoOrigNeto)} neto</b>\n` : '') +
      `Esta entrega: <b>$${fmt(montoNeto)}</b>` +
      (draft.tabla_pagos?.length ? ` a ${draft.tabla_pagos.length} personas` : '') + `\n` +
      `Saldo neto tras el pago y la entrega: <b>$${fmt(saldoFinal)}</b>\n\n` +
      `¿Ya realizaste el pago de <b>$${fmt(montoOrigBruto)}</b>?\n` +
      `Comparte el comprobante para confirmar y procesar la entrega.`,
      { parse_mode: 'HTML' }
    );
    await updateSession(session.id, 'confirmando_comprobante', {
      tipo:           'comprobante',
      monto_bruto:    montoOrigBruto,
      monto_neto:     montoOrigNeto,
      tipo_operacion: draft.tipo_operacion,
      clientId:       client.id,
      saldo_actual:   saldo,
      post_confirm_distribucion: {
        tipo_operacion: draft.tipo_operacion,
        monto_neto:     montoNeto,
        monto_bruto:    montoNeto,
        comision_pct:   0,
        es_entrada:     false,
        solicita_neto:  false,
        tipo_entrega:   draft.tipo_entrega ?? 'spei',
        tabla_pagos:    draft.tabla_pagos   ?? null,
        tabla_total:    draft.tabla_total   ?? null,
        monto_neto_original:  montoOrigNeto,
        monto_bruto_original: montoOrigBruto,
        cuentas_bancarias: draft.cuentas_bancarias ?? [],
        clientId: client.id,
      },
    });
    return;
  }

  await mostrarResumenYPoll(ctx, { ...draft, saldo_actual: saldo, saldo_nuevo }, client, session);
}

async function mostrarResumenYPoll(ctx, draft, client, session) {
  const chatId = ctx.chat?.id;

  const summaryText = responseGen.formatOperationSummary({
    ...draft,
    saldo_actual: draft.saldo_actual ?? 0,
    saldo_nuevo:  draft.saldo_nuevo  ?? 0,
    tiene_saldo:  draft.tiene_saldo_suficiente ?? true,
  });

  await pollHandler.sendConfirmationPoll(chatId, draft, summaryText);
  await updateSession(session.id, 'esperando_confirmacion', draft);
}

// ── /miid: muestra tu Telegram ID y ofrece guardarte como admin ──────────────

bot.command('miid', async (ctx) => {
  try {
    const userId   = ctx.from?.id;
    const username = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name ?? 'Sin nombre';
    const yaEsAdmin = ADMIN_USER_IDS.has(userId);
    const hayAdmins = ADMIN_USER_IDS.size > 0;

    let text = `ID: <code>${userId}</code>\nUsuario: ${username}`;
    if (yaEsAdmin) {
      text += `\n\n✅ Ya eres administrador.`;
      await ctx.reply(text, { parse_mode: 'HTML' });
      return;
    }

    text += hayAdmins
      ? `\n\n🔒 Hay administradores configurados. Pídele a uno que te agregue.`
      : `\n\n⚠️ No hay administradores aún. Puedes ser el primero.`;

    const kb = new InlineKeyboard()
      .text(
        hayAdmins ? '✅ Solicitar acceso admin' : '✅ Guardarme como administrador',
        `admin_self_${userId}`
      );

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  } catch (err) {
    console.error('[/miid]', err.message);
    await ctx.reply(`ID: <code>${ctx.from?.id}</code>`, { parse_mode: 'HTML' }).catch(() => {});
  }
});

// ── Voice messages: transcribir vía Gemini Flash y procesar como texto ───────

bot.on('message:voice', async (ctx) => {
  if (!docAgent) return; // sin GOOGLE_API_KEY, ignorar
  const chatId = ctx.chat?.id;
  const from   = ctx.from;
  if (!from?.id) return;

  try {
    const file   = await ctx.getFile();
    const url    = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const resp   = await fetch(url);
    if (!resp.ok) return;
    const buffer = Buffer.from(await resp.arrayBuffer());

    const transcripcion = await docAgent.transcribirAudio(buffer, 'audio/ogg');
    if (!transcripcion) return;

    // Actualizar el registro de fin_messages con la transcripción
    await pool.query(
      `UPDATE fin_messages SET texto=?
       WHERE chat_id=? AND tipo='voz' AND es_bot=0
       ORDER BY created_at DESC LIMIT 1`,
      [transcripcion.slice(0, 4000), String(chatId)]
    ).catch(() => {});

    // En modo asistente: solo transcribir, no responder
    const modoChat = await getChatModo(chatId);
    if (modoChat === 'asistente') return;

    // En modo normal: procesar la transcripción como si fuera un mensaje de texto
    const client  = await balanceManager.getOrCreateClient(from.id, from.username);
    const session = await getOrCreateSession(chatId, client.id);

    // Inyectar en el flujo de texto reutilizando el handler
    ctx.message.text = transcripcion;
    await ctx.reply(`🎙 <i>"${transcripcion}"</i>`, { parse_mode: 'HTML' });

    // Delegar a procesarOperacion si parece una operación
    if (isImplicitOperacion(transcripcion) || isOperacionCommand(transcripcion)) {
      await procesarOperacion(ctx, transcripcion, client, session);
    }
  } catch (e) {
    console.error('[voice-handler]', e.message);
  }
});

// Callback: guardar como admin
// ── Error handling ────────────────────────────────────────────────────────────

// Función segura para enviar replies con manejo de desconexiones y reintentos
async function safeReply(ctx, text, options = {}) {
  const maxRetries = 3;
  const retryDelay = 2000; // 2s entre reintentos
  const maxWaitTime = 15000; // 15s timeout total

  let lastError = null;
  const startTime = Date.now();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await ctx.reply(text, options);
    } catch (err) {
      lastError = err;
      const errMsg = err?.message || String(err);

      // Si es error de desconexión, esperar y reintentar
      if (errMsg?.includes('Cannot send requests while disconnected') ||
          errMsg?.includes('Failed to fetch') ||
          errMsg?.includes('ECONNREFUSED')) {
        const elapsed = Date.now() - startTime;
        if (elapsed < maxWaitTime && attempt < maxRetries - 1) {
          console.warn(`[safeReply] Desconexión detectada (intento ${attempt + 1}/${maxRetries}), esperando ${retryDelay}ms...`);
          botStarted = false;
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
      }

      // Si no es desconexión o ya agotamos reintentos, lanzar error
      throw err;
    }
  }

  // Si llegamos aquí, todos los reintentos fallaron
  console.error('[safeReply] ❌ Falló después de', maxRetries, 'intentos:', lastError?.message);
  throw lastError;
}

// Middleware: bloquear updates si el bot está desconectado
bot.use(async (ctx, next) => {
  if (!botStarted) {
    console.warn(`[bot-middleware] Update ${ctx.update.update_id} rechazado: bot no started`);
    return; // No procesar updates si el bot no está listo
  }
  await next();
});

bot.catch((err) => {
  const ctx = err.ctx;
  const errMsg = err.error?.message || String(err.error);
  console.error(`[bot] Error en update ${ctx?.update?.update_id}:`, errMsg);

  // Detectar desconexión y marcar bot como offline
  if (errMsg?.includes('Cannot send requests while disconnected') ||
      errMsg?.includes('Failed to fetch') ||
      errMsg?.includes('ECONNREFUSED')) {
    console.error('[bot.catch] Desconexión detectada, marcando bot como offline');
    botStarted = false;
  }

  if (err.error instanceof GrammyError) {
    console.error('[grammy]', err.error.description);
  } else if (err.error instanceof HttpError) {
    console.error('[http]', err.error.error);
  }
});

// ── Start con reconexión automática ──────────────────────────────────────────

// Cargar admins desde DB al arrancar (merge con los del .env)
q.getAdminUserIds(pool)
  .then(ids => ids.forEach(id => ADMIN_USER_IDS.add(id)))
  .catch(err => console.error('[admin-load]', err.message));

let botStarted = false;
let botHealthCheckInterval = null;
let botStartAttempts = 0;
const MAX_START_ATTEMPTS = 10;
const START_RETRY_DELAY = 3000; // 3s
const HEALTH_CHECK_INTERVAL = 5000; // 5s (más frecuente para detectar desconexiones rápido)
const HEALTH_CHECK_TIMEOUT = 5000; // 5s timeout para getMe()

async function startBotWithRetry() {
  botStartAttempts++;
  try {
    console.log(`[financial-bot] Intentando iniciar bot (intento ${botStartAttempts}/${MAX_START_ATTEMPTS})...`);

    bot.start({
      onStart: async (info) => {
        console.log(`[financial-bot] Bot @${info.username} iniciado correctamente`);
        botStarted = true;
        botStartAttempts = 0;

        // Comandos visibles para todos los usuarios
        const comandosUsuario = [
          { command: 'start',     description: 'Bienvenida / comenzar' },
          { command: 'saldo',     description: 'Ver tu saldo actual' },
          { command: 'historial', description: 'Ver historial de operaciones' },
          { command: 'operacion', description: 'Iniciar una nueva operación' },
          { command: 'reset',     description: 'Reiniciar sesión actual' },
          { command: 'miid',      description: 'Ver tu Telegram ID' },
        ];

        // Comandos adicionales de administrador
        const comandosAdmin = [
          ...comandosUsuario,
          { command: 'ajuste',    description: '(Admin) Ajuste manual de saldo' },
          { command: 'testmode',  description: '(Admin) Activar/desactivar modo prueba' },
          { command: 'rol',       description: '(Admin) Cambiar rol del chat' },
          { command: 'modo',      description: '(Admin) Cambiar modo del chat (normal/asistente)' },
        ];

        try {
          await bot.api.setMyCommands(comandosUsuario);
          // Registrar comandos admin para administradores de grupos (muestra /ajuste en grupos)
          await bot.api.setMyCommands(comandosAdmin, {
            scope: { type: 'all_chat_administrators' },
          }).catch(() => {});
          // Registrar comandos admin por cada admin conocido (chat privado)
          for (const adminId of ADMIN_USER_IDS) {
            await bot.api.setMyCommands(comandosAdmin, {
              scope: { type: 'chat', chat_id: adminId },
            }).catch(() => {});
          }
          console.log('[financial-bot] Menú de comandos registrado');
        } catch (err) {
          console.error('[setMyCommands]', err.message);
        }

        // Inicia health check para detectar desconexiones
        startHealthCheck();
      },
    }).catch(err => {
      console.error(`[financial-bot] Error en bot.start():`, err.message);
      botStarted = false;
      if (botStartAttempts < MAX_START_ATTEMPTS) {
        setTimeout(() => startBotWithRetry(), START_RETRY_DELAY);
      } else {
        console.error('[financial-bot] ❌ No se pudo iniciar el bot después de', MAX_START_ATTEMPTS, 'intentos');
        process.exit(1);
      }
    });
  } catch (err) {
    console.error(`[financial-bot] Error al iniciar bot (intento ${botStartAttempts}):`, err.message);
    if (botStartAttempts < MAX_START_ATTEMPTS) {
      setTimeout(() => startBotWithRetry(), START_RETRY_DELAY);
    } else {
      console.error('[financial-bot] ❌ No se pudo iniciar el bot después de', MAX_START_ATTEMPTS, 'intentos');
      process.exit(1);
    }
  }
}

function startHealthCheck() {
  if (botHealthCheckInterval) clearInterval(botHealthCheckInterval);

  // Health check cada 30s: verifica si el bot puede hacer una llamada a la API
  botHealthCheckInterval = setInterval(async () => {
    try {
      // Timeout de 10s para detectar desconexiones
      const mePromise = bot.api.getMe();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), HEALTH_CHECK_TIMEOUT)
      );
      
      const me = await Promise.race([mePromise, timeoutPromise]);
      if (!me) throw new Error('getMe retornó undefined');
      // console.log('[health-check] ✅ Bot respondiendo');
    } catch (err) {
      console.error('[health-check] ❌ Bot no responde:', err.message);
      botStarted = false;
      if (botHealthCheckInterval) clearInterval(botHealthCheckInterval);
      // Reintentar iniciar el bot después de 2s
      setTimeout(() => {
        console.log('[health-check] Reiniciando bot después de detección de desconexión...');
        botStartAttempts = 0;
        startBotWithRetry();
      }, 2000);
    }
  }, HEALTH_CHECK_INTERVAL);
}

// Inicia el bot con reintentos
startBotWithRetry();

module.exports = { bot, pool };
