'use strict';

const path = require('path');
const fs   = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const { Bot }      = require('grammy');
const Anthropic    = require('@anthropic-ai/sdk');
const mysql        = require('mysql2/promise');
const { execSync } = require('child_process');

// ── Constants ─────────────────────────────────────────────────────────────────
const REPO        = process.env.REPO_ROOT         || '/var/www/html/vilarkptl.com/ai-monitor';
const MODEL       = process.env.CLAUDE_CHAT_MODEL || 'claude-sonnet-4-6';
const GROUP_CHAT  = process.env.TG_CLAUDE_GROUP_ID || '';   // optional shared supergroup
const MAX_ITER    = 10;
const MAX_HISTORY = 20;

// Authorized Telegram user IDs (comma-separated in .env)
// e.g. TG_ALLOWED_USER_IDS=123456789,987654321,555123456
const ALLOWED_USER_IDS = new Set(
  (process.env.TG_ALLOWED_USER_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean),
);

if (ALLOWED_USER_IDS.size === 0) {
  console.error('[chat-agent] FATAL: TG_ALLOWED_USER_IDS no definido en relay/.env');
  process.exit(1);
}

// ── Clients ───────────────────────────────────────────────────────────────────
const bot = new Bot(process.env.TG_CLAUDE_BOT_TOKEN);

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const db = mysql.createPool({
  host:               process.env.DB_HOST || '127.0.0.1',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER || 'root',
  password:           process.env.DB_PASS || '',
  database:           process.env.DB_NAME || 'ai_monitoring',
  waitForConnections: true,
  connectionLimit:    5,
});

// ── System prompt (incluye CLAUDE.md del repo) ────────────────────────────────
const CLAUDE_MD = (() => {
  try { return fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8'); }
  catch (_) { return ''; }
})();

const SYSTEM_PROMPT = `Eres Claude Code ejecutándose en el servidor de producción vilar-desarrollo (143.198.228.78).
Tienes herramientas para leer/escribir archivos, ejecutar bash y despachar tareas a agentes relay.

Repo principal: ${REPO}
Proyectos activos: fiscalai, fiscalai-front, coordinator, ai-monitor

Reglas:
- Responde siempre en español
- Lee un archivo antes de modificarlo
- En commits: git add <archivos específicos>, NUNCA git add .
- NUNCA commitees node_modules, .env, nohup.out, FETCH_HEAD
- Máximo 3 objetivos por sesión; si requiere más, divide y confirma con el usuario
- Ante acciones destructivas (rm, reset --hard, drop table), pide confirmación explícita

--- CLAUDE.md ---
${CLAUDE_MD}`.trim();

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'bash',
    description: 'Execute a bash command on the production server. Output capped at 8000 chars.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Bash command to execute' },
        cwd:     { type: 'string', description: 'Working directory (default: repo root)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read lines from a file. Returns content with line numbers.',
    input_schema: {
      type: 'object',
      properties: {
        path:   { type: 'string', description: 'Absolute file path' },
        offset: { type: 'number', description: 'Start line (0-based, default 0)' },
        limit:  { type: 'number', description: 'Max lines to return (default 200)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file on the server.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Absolute file path' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'dispatch_task',
    description: 'Send a task to a relay agent by writing its inbox.md. Projects: fiscalai, fiscalai-front, coordinator, ai-monitor.',
    input_schema: {
      type: 'object',
      properties: {
        project:     { type: 'string', description: 'Project ID' },
        description: { type: 'string', description: 'Task description' },
      },
      required: ['project', 'description'],
    },
  },
];

// ── Tool execution ────────────────────────────────────────────────────────────
function runTool(name, input) {
  try {
    if (name === 'bash') {
      const out = execSync(input.command, {
        cwd:      input.cwd || REPO,
        timeout:  30000,
        encoding: 'utf8',
        stdio:    ['pipe', 'pipe', 'pipe'],
      });
      return out.slice(0, 8000) || '(sin salida)';
    }

    if (name === 'read_file') {
      const lines = fs.readFileSync(input.path, 'utf8').split('\n');
      const start = input.offset || 0;
      const end   = start + (input.limit || 200);
      return lines.slice(start, end).map((l, i) => `${start + i + 1}\t${l}`).join('\n');
    }

    if (name === 'write_file') {
      fs.mkdirSync(path.dirname(input.path), { recursive: true });
      fs.writeFileSync(input.path, input.content, 'utf8');
      return `Escrito: ${input.path} (${input.content.length} bytes)`;
    }

    if (name === 'dispatch_task') {
      const inbox = path.join(REPO, 'relay', 'workspaces', input.project, 'inbox.md');
      fs.writeFileSync(inbox, `# Tarea\n\n${input.description}\n`, 'utf8');
      return `Tarea despachada a ${input.project}`;
    }

    return `ERROR: herramienta desconocida: ${name}`;
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || String(e)).toString();
    return `ERROR: ${msg.slice(0, 500)}`;
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function loadHistory(chatId, threadId) {
  const [rows] = await db.query(
    `SELECT role, content FROM conversations
     WHERE chat_id = ? AND thread_id = ?
     ORDER BY created_at DESC LIMIT ?`,
    [chatId, threadId, MAX_HISTORY],
  );
  return rows.reverse();
}

async function saveMsg(chatId, threadId, role, content, meta = {}) {
  await db.query(
    `INSERT INTO conversations
       (chat_id, thread_id, telegram_user_id, telegram_username,
        role, content, tool_name, model, provider, tokens_in, tokens_out, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      chatId,
      threadId,
      meta.userId   || null,
      meta.username || null,
      role,
      content,
      meta.tool     || null,
      meta.model    || null,
      meta.provider || 'anthropic',
      meta.tokensIn  || 0,
      meta.tokensOut || 0,
      meta.costUsd   || 0,
    ],
  );
}

// ── Cost calculation (Anthropic pricing — Sonnet 4.6) ─────────────────────────
// Input: $3/MTok, Output: $15/MTok  (update if model changes)
function calcCost(tokensIn, tokensOut) {
  return (tokensIn * 3 + tokensOut * 15) / 1_000_000;
}

// ── Agentic loop ──────────────────────────────────────────────────────────────
async function runAgent(chatId, threadId, userText, userMeta, onProgress) {
  const history = await loadHistory(chatId, threadId);
  history.push({ role: 'user', content: userText });

  let totalIn = 0, totalOut = 0;

  for (let i = 0; i < MAX_ITER; i++) {
    const resp = await claude.messages.create({
      model:      MODEL,
      tools:      TOOLS,
      max_tokens: 4096,
      system:     SYSTEM_PROMPT,
      messages:   history,
    });

    totalIn  += resp.usage?.input_tokens  || 0;
    totalOut += resp.usage?.output_tokens || 0;

    if (resp.stop_reason === 'tool_use') {
      const toolUses = resp.content.filter(b => b.type === 'tool_use');

      const preview = toolUses.map(t => {
        const arg = t.input.command || t.input.path || t.input.project || '';
        return `⚙️ ${t.name}${arg ? ': ' + String(arg).slice(0, 80) : ''}`;
      }).join('\n');
      await onProgress(preview);

      history.push({ role: 'assistant', content: resp.content });
      const results = toolUses.map(t => ({
        type:        'tool_result',
        tool_use_id: t.id,
        content:     runTool(t.name, t.input),
      }));
      history.push({ role: 'user', content: results });
      continue;
    }

    const text    = resp.content.find(b => b.type === 'text')?.text || '(sin respuesta)';
    const costUsd = calcCost(totalIn, totalOut);

    await saveMsg(chatId, threadId, 'user', userText, {
      userId: userMeta.userId, username: userMeta.username,
    });
    await saveMsg(chatId, threadId, 'assistant', text, {
      userId: userMeta.userId, username: userMeta.username,
      model: MODEL, provider: 'anthropic',
      tokensIn: totalIn, tokensOut: totalOut, costUsd,
    });

    return { text, totalIn, totalOut, costUsd };
  }

  return { text: '⚠️ Máximo de iteraciones alcanzado.', totalIn, totalOut, costUsd: calcCost(totalIn, totalOut) };
}

// ── Telegram helpers ──────────────────────────────────────────────────────────
function topicOpts(threadId) {
  return threadId > 0 ? { message_thread_id: threadId } : {};
}

async function safeEdit(chatId, msgId, text) {
  const t = (text || '…').slice(0, 4096);
  try {
    await bot.api.editMessageText(chatId, msgId, t, { parse_mode: 'Markdown' });
  } catch (_) {
    try { await bot.api.editMessageText(chatId, msgId, t); } catch (__) {}
  }
}

function chunkText(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  while (text.length > maxLen) {
    let cut = text.lastIndexOf('\n', maxLen);
    if (cut < maxLen * 0.4) cut = maxLen;
    chunks.push(text.slice(0, cut));
    text = text.slice(cut).replace(/^\n/, '');
  }
  if (text.length) chunks.push(text);
  return chunks;
}

// Prevent overlapping requests per topic/user
const BUSY = new Map();

// ── Authorization helper ──────────────────────────────────────────────────────
function isAuthorized(ctx) {
  const userId = String(ctx.from?.id || '');
  if (ALLOWED_USER_IDS.has(userId)) return true;
  if (GROUP_CHAT && String(ctx.chat?.id) === String(GROUP_CHAT)) return true;
  return false;
}

// ── Message handler ───────────────────────────────────────────────────────────
bot.on('message:text', async (ctx) => {
  if (!isAuthorized(ctx)) return;

  const userText  = ctx.message.text.trim();
  const threadId  = ctx.message.message_thread_id ?? 0;
  const topicKey  = `${ctx.chat.id}:${threadId}`;
  const userMeta  = {
    userId:   ctx.from?.id,
    username: ctx.from?.username || ctx.from?.first_name || String(ctx.from?.id),
  };

  // Commands
  if (userText === '/reset') {
    await db.query(
      'DELETE FROM conversations WHERE chat_id = ? AND thread_id = ?',
      [ctx.chat.id, threadId],
    );
    return ctx.reply('✅ Historial de este topic borrado.', topicOpts(threadId));
  }

  if (userText === '/status') {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS total, ROUND(SUM(cost_usd), 4) AS cost, MAX(created_at) AS last
       FROM conversations WHERE chat_id = ? AND thread_id = ?`,
      [ctx.chat.id, threadId],
    );
    const { total, cost, last } = rows[0];
    return ctx.reply(
      `📊 Topic ${threadId}: ${total} msgs · $${cost || '0.0000'} · último: ${last || 'ninguno'}`,
      topicOpts(threadId),
    );
  }

  if (userText === '/help') {
    return ctx.reply(
      '*Claude Code · Vilar AI*\n\n' +
      '`/reset` — Borra el historial de este topic\n' +
      '`/status` — Estadísticas del topic\n' +
      '`/help` — Esta ayuda\n\n' +
      'Escribe cualquier instrucción en lenguaje natural.\n' +
      'Claude tiene acceso a bash, archivos y puede despachar tareas a los agentes relay.',
      { parse_mode: 'Markdown', ...topicOpts(threadId) },
    );
  }

  if (BUSY.get(topicKey)) {
    return ctx.reply('⏳ Procesando solicitud anterior, espera un momento…', topicOpts(threadId));
  }
  BUSY.set(topicKey, true);

  const progressMsg = await ctx.reply('⏳ Pensando…', topicOpts(threadId));
  bot.api.sendChatAction(ctx.chat.id, 'typing', topicOpts(threadId)).catch(() => {});

  try {
    const { text, totalIn, totalOut, costUsd } = await runAgent(
      ctx.chat.id,
      threadId,
      userText,
      userMeta,
      (progressText) => safeEdit(ctx.chat.id, progressMsg.message_id, progressText),
    );

    const footer = `\n\n_${totalIn}↑ ${totalOut}↓ · $${costUsd.toFixed(4)}_`;
    const chunks = chunkText(text + footer, 4000);

    await safeEdit(ctx.chat.id, progressMsg.message_id, chunks[0]);
    for (let i = 1; i < chunks.length; i++) {
      await ctx.reply(chunks[i], { parse_mode: 'Markdown', ...topicOpts(threadId) });
    }
  } catch (err) {
    console.error('[chat-agent] error:', err.message);
    await safeEdit(
      ctx.chat.id,
      progressMsg.message_id,
      `❌ Error: ${(err.message || 'desconocido').slice(0, 300)}`,
    );
  } finally {
    BUSY.delete(topicKey);
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
bot.catch(err => console.error('[grammy]', err.message));

console.log(`[chat-agent] Iniciando — ${ALLOWED_USER_IDS.size} usuario(s) autorizados`);
bot.start({
  onStart: info => console.log(`[chat-agent] @${info.username} listo — polling activo`),
});
