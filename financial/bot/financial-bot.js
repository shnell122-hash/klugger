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

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Bot, GrammyError, HttpError } = require('grammy');
const OpenAI = require('openai');
const mysql  = require('mysql2/promise');

const { parseCommand, parseNaturalText, isOperacionCommand, isImplicitOperacion } = require('./agents/parser');
const { calcularMontos, proyectarSaldo, fmt }   = require('./agents/calculator');
const BalanceManager  = require('./agents/balance-manager');
const { PollHandler } = require('./agents/poll-handler');
const Verifier        = require('./agents/verifier');
const ResponseGen     = require('./agents/response-gen');
const { getCommission, listTypes } = require('./config/commissions');
const { handleIncomingFile, handleIncomingLink, extractFileFromMessage } = require('./tools/file-handler');

// ── Config ────────────────────────────────────────────────────────────────────

const BOT_TOKEN     = process.env.FIN_TELEGRAM_BOT_TOKEN;
const ALLOWED_CHATS = (process.env.FIN_ALLOWED_CHAT_IDS ?? '').split(',').map(s => BigInt(s.trim())).filter(Boolean);
const ADMIN_USER_IDS= (process.env.FIN_ADMIN_USER_IDS   ?? '').split(',').map(s => parseInt(s.trim())).filter(Boolean);
const DEEPSEEK_KEY  = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL  = 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL= 'deepseek-chat';

if (!BOT_TOKEN) throw new Error('FIN_TELEGRAM_BOT_TOKEN no está configurado');

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

const bot            = new Bot(BOT_TOKEN);
const balanceManager = new BalanceManager(pool);
const pollHandler    = new PollHandler(bot);
const verifier       = new Verifier();
const responseGen    = new ResponseGen(llm, {
  model: DEEPSEEK_MODEL,
  logUsage: async (usage) => {
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
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAllowedChat(ctx) {
  if (ALLOWED_CHATS.length === 0) return true;
  return ALLOWED_CHATS.includes(BigInt(ctx.chat?.id ?? 0));
}

function isAdmin(userId) {
  return ADMIN_USER_IDS.includes(userId);
}

function calcLLMCost(tokensIn, tokensOut) {
  // DeepSeek Chat: $0.07/1M input, $1.10/1M output (con cache puede ser ~10% del input)
  return ((tokensIn * 0.07) + (tokensOut * 1.10)) / 1_000_000;
}

/**
 * Obtiene o crea sesión financiera para el chat.
 */
async function getOrCreateSession(chatId, clientId) {
  const [rows] = await pool.query(
    'SELECT * FROM fin_sessions WHERE chat_id=? ORDER BY updated_at DESC LIMIT 1',
    [chatId]
  );
  if (rows.length > 0 && rows[0].estado !== 'completado') {
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
async function saveConfirmedOperation(draft, clientId, chatId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO fin_operations
         (client_id, tipo_operacion, monto_bruto, comision_pct, monto_neto,
          es_entrada, solicita_neto, tipo_entrega, instrucciones_pago, direccion_entrega,
          estado, tiene_factura, telegram_chat_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,'pendiente',?,?)`,
      [
        clientId, draft.tipo_operacion, draft.monto_bruto, draft.comision_pct, draft.monto_neto,
        draft.es_entrada ? 1 : 0, draft.solicita_neto ? 1 : 0,
        draft.tipo_entrega ?? 'efectivo', draft.instrucciones_pago ?? null,
        draft.direccion_entrega ?? null, draft.tiene_factura ? 1 : 0, chatId,
      ]
    );
    const operationId = result.insertId;

    // Aplicar al saldo
    const { saldo_antes, saldo_despues } = await balanceManager.aplicarOperacion(
      { operationId, clientId, monto_neto: draft.monto_neto, monto_bruto: draft.monto_bruto, es_entrada: draft.es_entrada },
      conn
    );

    // Marcar confirmada
    await conn.query(
      "UPDATE fin_operations SET estado='confirmada', updated_at=NOW(3) WHERE id=?",
      [operationId]
    );

    await conn.commit();
    return { operationId, saldo_antes, saldo_despues };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// Middleware de autenticación
bot.use(async (ctx, next) => {
  if (!isAllowedChat(ctx)) return;
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
    await ctx.reply(
      `💰 Saldo actual: <b>$${fmt(client.saldo)}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    await ctx.reply('Error consultando saldo.');
  }
});

// /historial (últimas 10 ops)
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

// /ajuste [monto] [descripcion] (solo admin)
bot.command('ajuste', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.reply('⛔ Sin permisos.');
    return;
  }
  const args = ctx.match?.split(' ') ?? [];
  const replyTo = ctx.message?.reply_to_message?.from?.id;
  if (!replyTo || !args[0]) {
    await ctx.reply('Uso: responde al mensaje del cliente con /ajuste [monto] [descripcion]');
    return;
  }
  try {
    const client = await balanceManager.getOrCreateClient(replyTo);
    const monto  = parseFloat(args[0]);
    const desc   = args.slice(1).join(' ') || 'Ajuste manual';
    const { saldo_antes, saldo_despues } = await balanceManager.ajusteManual({
      clientId: client.id, monto, descripcion: desc, adminId: ctx.from?.id,
    });
    await ctx.reply(
      `✅ Ajuste aplicado.\nAntes: $${fmt(saldo_antes)} → Ahora: <b>$${fmt(saldo_despues)}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    await ctx.reply(`Error: ${err.message}`);
  }
});

// Comando /operacion — punto de entrada principal
bot.command('operacion', async (ctx) => {
  const userId  = ctx.from?.id;
  const chatId  = ctx.chat?.id;
  const cmdArgs = ctx.match ?? '';

  const client  = await balanceManager.getOrCreateClient(userId, ctx.from?.username);
  const session = await getOrCreateSession(chatId, client.id);

  // Sin argumentos → modo asistido
  if (!cmdArgs.trim()) {
    const tipos = listTypes();
    await ctx.reply(responseGen.formatAskTipo(tipos), { parse_mode: 'HTML' });
    await updateSession(session.id, 'esperando_tipo', { clientId: client.id });
    return;
  }

  // Con argumentos → parsear directamente
  await procesarOperacion(ctx, cmdArgs, client, session);
});

// Mensajes de texto — detecta operaciones implícitas o responde a flujo activo
bot.on('message:text', async (ctx) => {
  const userId  = ctx.from?.id;
  const chatId  = ctx.chat?.id;
  const text    = ctx.message.text;

  // Ignorar comandos (ya manejados arriba)
  if (text.startsWith('/')) return;

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
    const draft = session.operation_draft_json ? JSON.parse(session.operation_draft_json) : {};
    await procesarOperacion(ctx, `${draft.tipo_operacion} ${text}`, client, session);
    return;
  }
  if (session.estado === 'esperando_entrega') {
    const draft = session.operation_draft_json ? JSON.parse(session.operation_draft_json) : {};
    draft.direccion_entrega = text;
    await mostrarResumenYPoll(ctx, draft, client, session);
    return;
  }

  // Detección implícita: ¿parece una solicitud de operación?
  if (isImplicitOperacion(text)) {
    await procesarOperacion(ctx, text, client, session);
    return;
  }

  // No es una operación → no responder (el bot solo habla cuando es necesario)
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

  let operationId = null;
  if (session.operation_draft_json) {
    const draft = JSON.parse(session.operation_draft_json);
    operationId = draft.operationId ?? null;
  }

  if (fileInfo.isLink) {
    await handleIncomingLink({ pool, clientId: client.id, operationId, url: fileInfo.url });
    await ctx.reply('🔗 Link registrado.');
  } else {
    await handleIncomingFile({
      pool, clientId: client.id, operationId,
      botToken: BOT_TOKEN,
      telegramFileOrPhoto: fileInfo.file,
      mimeType: fileInfo.mimeType,
      fileName: fileInfo.fileName,
    });
    await ctx.reply('📎 Archivo registrado.');
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
    const session = await getOrCreateSession(chatId);
    try {
      const { operationId, saldo_despues } = await saveConfirmedOperation(
        operationDraft, operationDraft.clientId, chatId
      );
      await updateSession(session.id, 'completado', null);
      await bot.api.sendMessage(
        chatId,
        responseGen.formatConfirmed({
          tipo_operacion: operationDraft.tipo_operacion,
          monto_neto:     operationDraft.monto_neto,
          saldo_nuevo:    saldo_despues,
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

// Callbacks de InlineKeyboard (menú de edición)
bot.on('callback_query:data', async (ctx) => {
  const data   = ctx.callbackQuery.data;
  const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;

  if (data.startsWith('edit_field:')) {
    const field = data.replace('edit_field:', '');
    const result = await pollHandler.processEditFieldSelection(
      chatId, field, ctx.callbackQuery.id
    );
    if (result?.action === 'cancel') {
      await ctx.reply(responseGen.formatCancelled());
    }
  } else {
    await ctx.answerCallbackQuery();
  }
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
      await updateSession(session.id, 'esperando_tipo', { clientId: client.id });
      return;
    }
  }

  // Si falta monto → preguntar
  if (!parsed.monto) {
    const commission = await getCommission(parsed.tipo, pool);
    await ctx.reply(responseGen.formatAskMonto(parsed.tipo, commission.pct), { parse_mode: 'HTML' });
    await updateSession(session.id, 'esperando_monto', { tipo_operacion: parsed.tipo, clientId: client.id });
    return;
  }

  // 2. Calcular
  const commission = await getCommission(parsed.tipo, pool);
  if (!commission) {
    await ctx.reply(`Tipo de operación "${parsed.tipo}" no encontrado.`);
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
    tipo_entrega:      'efectivo',
    instrucciones_pago: null, // se configura por tipo de operación en fin_operation_types
    tiene_saldo_suficiente: tiene_saldo,
    tiene_factura:     false,
  };

  // 5. Verificar consistencia
  const verification = verifier.verificarConsistencia(draft);
  if (!verification.ok) {
    const msg = verifier.formatVerificationResult(verification);
    if (msg) await ctx.reply(msg, { parse_mode: 'HTML' });
    // Aplicar correcciones automáticas
    Object.assign(draft, verification.correcciones);
  }

  // 6. Pedir dirección si es efectivo y no tenemos
  if (draft.tipo_entrega === 'efectivo' && !draft.direccion_entrega && !es_entrada) {
    await ctx.reply(responseGen.formatAskDireccion());
    await updateSession(session.id, 'esperando_entrega', { ...draft, saldo_actual: saldo, saldo_nuevo });
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

// ── Error handling ────────────────────────────────────────────────────────────

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`[bot] Error en update ${ctx.update.update_id}:`, err.error);
  if (err.error instanceof GrammyError) {
    console.error('[grammy]', err.error.description);
  } else if (err.error instanceof HttpError) {
    console.error('[http]', err.error.error);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

bot.start({
  onStart: (info) => {
    console.log(`[financial-bot] Bot @${info.username} iniciado`);
  },
});

module.exports = { bot, pool };
