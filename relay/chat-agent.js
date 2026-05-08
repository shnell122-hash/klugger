'use strict';

const path = require('path');
const fs   = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const { Bot, InlineKeyboard } = require('grammy');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI    = require('openai');
const mysql     = require('mysql2/promise');
const { execSync } = require('child_process');

// ── Model registry ────────────────────────────────────────────────────────────
const MODELS = {
  sonnet:       { id: 'claude-sonnet-4-6',                              proxyModel: 'kptl-chat',      provider: 'anthropic',       label: 'Claude Sonnet 4.6',        costIn: 3,    costOut: 15    },
  haiku:        { id: 'claude-haiku-4-5-20251001',                      proxyModel: 'kptl-chat-fast', provider: 'anthropic',       label: 'Claude Haiku 4.5',         costIn: 0.8,  costOut: 4     },
  opus:         { id: 'claude-opus-4-7',                                proxyModel: 'kptl-reasoning', provider: 'anthropic',       label: 'Claude Opus 4.7',          costIn: 15,   costOut: 75    },
  'claude-proxy': { id: 'claude-sonnet-4-6',                            proxyModel: null,             provider: 'anthropic-proxy', label: 'Claude Pro (Proxy - $0)',   costIn: 0,    costOut: 0     },
  deepseek:     { id: process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-v4-flash', proxyModel: 'kptl-chat-fast', provider: 'deepseek',  label: 'DeepSeek V4-Flash 💸',     costIn: 0.02, costOut: 0.14  },
  deepseekPro:  { id: process.env.DEEPSEEK_PRO_MODEL   || 'deepseek-v4-pro',   proxyModel: 'kptl-chat',      provider: 'deepseek',  label: 'DeepSeek V4-Pro 💸',       costIn: 0.14, costOut: 1.10  },
  r1:           { id: 'deepseek-reasoner',                              proxyModel: 'kptl-reasoning', provider: 'deepseek',        label: 'DeepSeek R1 🧠',           costIn: 0.55, costOut: 2.19  },
};
const DEFAULT_MODEL = 'sonnet';

// In-memory model preference per topic (chatId:threadId → model key)
const TOPIC_MODEL = new Map();

// ── Constants ─────────────────────────────────────────────────────────────────
const REPO         = process.env.REPO_ROOT         || '/var/www/html/vilarkptl.com/ai-monitor';
const GROUP_CHAT   = process.env.TG_CLAUDE_GROUP_ID || '';
const MONITOR_API  = process.env.MONITOR_API_URL    || 'http://127.0.0.1:3010';
const MAX_ITER      = 8;                                                     // token+cost circuit breakers are the real safety net
const MAX_HISTORY   = 20;
const MAX_COST_USD  = parseFloat(process.env.MAX_COST_USD  || '1.00');       // per-request cost circuit breaker
const TOKEN_BUDGET  = parseInt(process.env.TOKEN_BUDGET    || '180000');     // input token circuit breaker — matches Sonnet 4.6 context
const TASK_TIMEOUT_MS = parseInt(process.env.TASK_TIMEOUT_MS || String(5 * 60 * 1000)); // hard ceiling per message (default 5 min)

// ── Authorized users — stored in DB (telegram_users table) + TG_ALLOWED_USER_IDS env ──
// Reloaded from DB on demand and every 60s. Adding a user in the dashboard
// takes effect immediately on the next message attempt (no restart needed).

async function loadAuthorizedIds() {
  const ids = new Set(
    (process.env.TG_ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  );
  try {
    const [rows] = await db.query('SELECT id FROM telegram_users WHERE active = 1');
    for (const r of rows) if (r.id) ids.add(String(r.id));
  } catch (_) {}
  return ids;
}

let ALLOWED_USER_IDS = new Set(
  (process.env.TG_ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
);
// Async initial load from DB (pool not ready at module parse time; resolves in <100ms)
setImmediate(() => loadAuthorizedIds().then(ids => { ALLOWED_USER_IDS = ids; }).catch(() => {}));
setInterval(async () => { ALLOWED_USER_IDS = await loadAuthorizedIds(); }, 60_000);

// ── Clients ───────────────────────────────────────────────────────────────────
const bot = new Bot(process.env.TG_CLAUDE_BOT_TOKEN);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const deepseek = new OpenAI({
  apiKey:  process.env.DEEPSEEK_API_KEY || '',
  baseURL: 'https://api.deepseek.com/v1',
});

// LiteLLM proxy — routes through fallback chains if LITELLM_BASE_URL is set.
// When unset, callModel() falls through to direct anthropic/deepseek clients.
const LITELLM_URL = process.env.LITELLM_BASE_URL || null;
const litellmProxy = LITELLM_URL ? new OpenAI({
  apiKey:  process.env.LITELLM_MASTER_KEY || 'litellm',
  baseURL: `${LITELLM_URL}/v1`,
}) : null;

// Claude CLI proxy — routes Anthropic calls through a local claude-relay process
// that consumes your Pro/Max subscription instead of charging per-token.
// Configure: ANTHROPIC_PROXY_URL=http://127.0.0.1:5001 in relay/.env
// Install: see deploy/claude-proxy-setup.md
const ANTHROPIC_PROXY_URL = process.env.ANTHROPIC_PROXY_URL || null;
const anthropicProxy = ANTHROPIC_PROXY_URL ? new Anthropic({
  apiKey:  'proxy-key',          // proxy ignores the key — any value works
  baseURL: ANTHROPIC_PROXY_URL,
}) : null;


const db = mysql.createPool({
  host:               process.env.DB_HOST || '127.0.0.1',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER || 'root',
  password:           process.env.DB_PASS || '',
  database:           process.env.DB_NAME || 'ai_monitoring',
  waitForConnections: true,
  connectionLimit:    5,
});

// ── System prompt ─────────────────────────────────────────────────────────────
const CLAUDE_MD = (() => {
  try { return fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8'); }
  catch (_) { return ''; }
})();

const SYSTEM_PROMPT = `Eres Claude Code en el servidor de producción vilar-desarrollo (143.198.228.78).
Tienes herramientas para leer/escribir archivos, ejecutar bash y despachar tareas a agentes relay.

Repo: ${REPO}
Proyectos activos: fiscalai, fiscalai-front, coordinator, ai-monitor

REGLAS DE COMPORTAMIENTO:
- Responde en español, directo al grano. SIN saludos, SIN listas de capacidades, SIN emojis.
- Responde a la solicitud concreta. Si no hay tarea clara, pide aclaración en UNA línea.
- Lee un archivo antes de modificarlo. Lee solo lo necesario para la tarea.
- Scope limitado: máximo 3 archivos por tarea. Si requiere más, divide y confirma.
- Ante tareas abiertas o de exploración sin límite definido (ej: "revisa todo el código"),
  pide al usuario que acote: ¿qué proyecto? ¿qué tipo de problema? No explores sin límite.
- Commits: git add <archivos específicos>, NUNCA git add . ni add -A.
- NUNCA commitees node_modules, .env, nohup.out, FETCH_HEAD.
- Ante acciones destructivas (rm, reset --hard, drop table), confirma antes.

--- CLAUDE.md ---
${CLAUDE_MD}`.trim();

// ── Tool definitions ──────────────────────────────────────────────────────────
// Anthropic format (used as-is for Claude, converted for DeepSeek)
const TOOLS_ANTHROPIC = [
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
        offset: { type: 'number', description: 'Start line (0-based)' },
        limit:  { type: 'number', description: 'Max lines (default 200)' },
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
    description: 'Send a task to a relay agent (writes inbox.md). Projects: fiscalai, fiscalai-front, coordinator, ai-monitor.',
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

// OpenAI/DeepSeek format
const TOOLS_OPENAI = TOOLS_ANTHROPIC.map(t => ({
  type: 'function',
  function: {
    name:        t.name,
    description: t.description,
    parameters:  t.input_schema,
  },
}));

// ── Bash security denylist ────────────────────────────────────────────────────
// Blocks destructive commands that could damage the server irreversibly.
// Claude never needs these; prompt injection or mistakes would be catastrophic.
const BASH_DENYLIST = /(\brm\s+(-[^-\s]*f[^-\s]*|-[^-\s]*r[^-\s]*f|--force)\s+\/|\bdd\s+.*of=\/dev\/|\bmkfs\b|\bfdisk\b|\bshred\b|\bwipefs\b|>\s*\/dev\/sd[a-z]|:\(\)\s*\{.*\})/i;

// ── Tool execution ────────────────────────────────────────────────────────────
async function runTool(name, input, sessionDispatched = null) {
  try {
    if (name === 'bash') {
      if (BASH_DENYLIST.test(input.command)) {
        return 'ERROR: Comando bloqueado (política de seguridad). Reformula sin operaciones destructivas de disco/partición.';
      }
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
      if (sessionDispatched && sessionDispatched.has(input.project)) {
        return `⚠️ Ya hay una tarea despachada a ${input.project} en esta sesión. El agente la está procesando — no se duplica.`;
      }
      if (sessionDispatched) sessionDispatched.add(input.project);
      const resp = await fetch(`${MONITOR_API}/api/relay/dispatch`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ project: input.project, task: `# Tarea\n\n${input.description}\n`, requester: 'chat-agent' }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) return `ERROR: dispatch falló (${resp.status}): ${json.error || 'unknown'}`;
      return `Tarea despachada a ${input.project} (id: ${json.id || '?'})`;
    }
    return `ERROR: herramienta desconocida: ${name}`;
  } catch (e) {
    return `ERROR: ${(e.stderr || e.stdout || e.message || String(e)).toString().slice(0, 500)}`;
  }
}

// ── Model abstraction ─────────────────────────────────────────────────────────
// Returns { text, tokensIn, tokensOut, stopReason, toolCalls }
async function callModel(modelKey, messages, ctx, onProgress, signal) {
  if (modelKey === 'claude-proxy') return callClaudeProxy(messages, MODELS['claude-proxy'].id);
  const m = MODELS[modelKey] || MODELS[DEFAULT_MODEL];
  if (litellmProxy && m.proxyModel) return callLiteLLMProxy(m, messages, ctx, onProgress, signal);
  if (m.provider === 'anthropic') return callAnthropic(m, messages, ctx, onProgress, signal);
  return callDeepSeek(m, messages, ctx, onProgress, signal);
}

// Cached system block — Anthropic charges 10% on cache reads vs 100% on normal input.
// The system prompt + CLAUDE.md (~2K tokens) is static per process start, so every
// request after the first hits the cache. Saves ~$0.005–0.03 per request on Sonnet.
const SYSTEM_CACHED = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }];

async function callAnthropic(m, messages, ctx, onProgress, signal) {
  let totalIn = 0, totalOut = 0, totalCacheRead = 0, totalCacheWrite = 0;
  const history          = [...messages];
  const callHist         = [];  // for loop detection
  const sessionDispatched = new Set(); // prevent double-dispatch within same session

  for (let i = 0; i < MAX_ITER; i++) {
    const resp = await anthropic.messages.create({
      model:      m.id,
      tools:      TOOLS_ANTHROPIC,
      max_tokens: 8096,
      system:     buildSystemBlocks(ctx.chat?.id),
      messages:   history,
    }, { signal });

    totalIn         += resp.usage?.input_tokens               || 0;
    totalOut        += resp.usage?.output_tokens              || 0;
    totalCacheRead  += resp.usage?.cache_read_input_tokens    || 0;
    totalCacheWrite += resp.usage?.cache_creation_input_tokens || 0;

    // Circuit breakers: cost and token budget
    // Cache reads are 10% of base input price — adjust so we don't overcount savings
    const cost = calcCostCached(ctx.modelKey, totalIn, totalOut, totalCacheRead);
    if (cost > MAX_COST_USD) {
      throw new Error(`💸 Límite de costo: $${cost.toFixed(4)} > $${MAX_COST_USD}. Abortando.`);
    }
    if (totalIn > TOKEN_BUDGET) {
      throw new Error(`📊 Contexto agotado: ${totalIn.toLocaleString()}↑ > ${TOKEN_BUDGET.toLocaleString()} tokens. Divide la tarea en partes más pequeñas.`);
    }

    if (resp.stop_reason === 'tool_use') {
      const toolUses = resp.content.filter(b => b.type === 'tool_use');

      // Loop detection
      const sig = toolUses.map(t => callSig(t.name, t.input)).join('|');
      callHist.push(sig);
      checkLoop(callHist);

      const preview = toolUses.map(t => {
        const arg = t.input.command || t.input.path || t.input.project || '';
        return `⚙️ ${t.name}${arg ? ': ' + String(arg).slice(0, 80) : ''}`;
      }).join('\n');
      await onProgress(preview);

      history.push({ role: 'assistant', content: resp.content });
      // Sequential (not parallel) — prevents race on sessionDispatched for dispatch_task
      const results = [];
      for (const t of toolUses) {
        const inputSummary = JSON.stringify(t.input).slice(0, 500);
        apiPost('/api/events', {
          session_id: ctx.sessionId, event_type: 'pre_tool',
          tool_name: t.name, tool_input_summary: inputSummary,
          project_name: ctx.projectName, api_provider: 'anthropic',
          agent_user: ctx.username,
        });
        let result;
        try {
          result = await runTool(t.name, t.input, sessionDispatched);
        } catch (toolErr) {
          result = `ERROR: ${toolErr.message || String(toolErr)}`;
        }
        apiPost('/api/events', {
          session_id: ctx.sessionId, event_type: 'post_tool',
          tool_name: t.name, tool_input_summary: inputSummary,
          tool_response_summary: result.slice(0, 500),
          project_name: ctx.projectName, api_provider: 'anthropic',
          agent_user: ctx.username,
        });
        results.push({ type: 'tool_result', tool_use_id: t.id, content: result });
      }
      history.push({ role: 'user', content: results });
      continue;
    }

    const text = resp.content.find(b => b.type === 'text')?.text || '(sin respuesta)';
    return { text, tokensIn: totalIn, tokensOut: totalOut, cacheRead: totalCacheRead, cacheWrite: totalCacheWrite };
  }

  // MAX_ITER reached — ask Claude to summarize what it completed and what's left
  try {
    const synth = await anthropic.messages.create({
      model: m.id, max_tokens: 512, system: SYSTEM_CACHED,
      messages: [...history, { role: 'user', content: 'Límite de pasos alcanzado. Resume en 3 líneas: qué se completó y qué falta para terminar.' }],
    }, { signal });
    const summary = synth.content.find(b => b.type === 'text')?.text || '';
    totalIn         += synth.usage?.input_tokens               || 0;
    totalOut        += synth.usage?.output_tokens              || 0;
    totalCacheRead  += synth.usage?.cache_read_input_tokens    || 0;
    totalCacheWrite += synth.usage?.cache_creation_input_tokens || 0;
    return { text: `⚠️ _Límite de pasos alcanzado._\n\n${summary}`, tokensIn: totalIn, tokensOut: totalOut, cacheRead: totalCacheRead, cacheWrite: totalCacheWrite };
  } catch (_) {
    return { text: '⚠️ Límite de pasos alcanzado. Divide la tarea en partes más pequeñas.', tokensIn: totalIn, tokensOut: totalOut, cacheRead: totalCacheRead, cacheWrite: totalCacheWrite };
  }
}

async function callDeepSeek(m, messages, ctx, onProgress, signal) { // eslint-disable-line no-unused-vars
  let totalIn = 0, totalOut = 0;
  const callHist          = [];
  const sessionDispatched = new Set();

  const history = messages.map(msg => {
    if (typeof msg.content === 'string') return { role: msg.role, content: msg.content };
    if (Array.isArray(msg.content)) {
      if (msg.role === 'user') {
        const toolResults = msg.content.filter(b => b.type === 'tool_result');
        if (toolResults.length) {
          return toolResults.map(tr => ({
            role: 'tool', tool_call_id: tr.tool_use_id, content: String(tr.content),
          }));
        }
        return { role: 'user', content: msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n') };
      }
      if (msg.role === 'assistant') {
        const text     = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
        const toolUses = msg.content.filter(b => b.type === 'tool_use');
        return {
          role: 'assistant', content: text || null,
          tool_calls: toolUses.map(t => ({
            id: t.id, type: 'function',
            function: { name: t.name, arguments: JSON.stringify(t.input) },
          })),
        };
      }
    }
    return { role: msg.role, content: String(msg.content) };
  }).flat().filter(Boolean);

  const msgs = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];

  for (let i = 0; i < MAX_ITER; i++) {
    const resp = await deepseek.chat.completions.create({
      model: m.id, messages: msgs, tools: TOOLS_OPENAI, max_tokens: 8096,
    });

    const choice = resp.choices[0];
    totalIn  += resp.usage?.prompt_tokens     || 0;
    totalOut += resp.usage?.completion_tokens || 0;

    // Circuit breakers: cost and token budget
    const cost = calcCost(ctx.modelKey, totalIn, totalOut);
    if (cost > MAX_COST_USD) {
      throw new Error(`💸 Límite de costo: $${cost.toFixed(4)} > $${MAX_COST_USD}. Abortando.`);
    }
    if (totalIn > TOKEN_BUDGET) {
      throw new Error(`📊 Contexto agotado: ${totalIn.toLocaleString()}↑ > ${TOKEN_BUDGET.toLocaleString()} tokens. Divide la tarea en partes más pequeñas.`);
    }

    if (choice.finish_reason === 'tool_calls') {
      const toolCalls = choice.message.tool_calls || [];

      // Loop detection
      const sig = toolCalls.map(tc => `${tc.function.name}:${tc.function.arguments.slice(0, 200)}`).join('|');
      callHist.push(sig);
      checkLoop(callHist);

      const preview = toolCalls.map(tc => {
        let arg = '';
        try { const p = JSON.parse(tc.function.arguments); arg = p.command || p.path || p.project || ''; } catch (_) {}
        return `⚙️ ${tc.function.name}${arg ? ': ' + String(arg).slice(0, 80) : ''}`;
      }).join('\n');
      await onProgress(preview);

      msgs.push(choice.message);
      for (const tc of toolCalls) {
        let input = {};
        try { input = JSON.parse(tc.function.arguments); } catch (_) {}
        const inputSummary = tc.function.arguments.slice(0, 500);
        apiPost('/api/events', {
          session_id: ctx.sessionId, event_type: 'pre_tool',
          tool_name: tc.function.name, tool_input_summary: inputSummary,
          project_name: ctx.projectName, api_provider: 'deepseek', agent_user: ctx.username,
        });
        const result = await runTool(tc.function.name, input, sessionDispatched);
        apiPost('/api/events', {
          session_id: ctx.sessionId, event_type: 'post_tool',
          tool_name: tc.function.name, tool_response_summary: result.slice(0, 500),
          project_name: ctx.projectName, api_provider: 'deepseek', agent_user: ctx.username,
        });
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
      continue;
    }

    const text = choice.message?.content || '(sin respuesta)';
    return { text, tokensIn: totalIn, tokensOut: totalOut };
  }
  return { text: '⚠️ Máximo de iteraciones alcanzado.', tokensIn: totalIn, tokensOut: totalOut };
}

// Routes all model calls through LiteLLM proxy using OpenAI-compat API.
// LiteLLM handles the fallback chain (e.g. kptl-chat: Claude → DeepSeek → GPT-4o → Groq).
// Same signature as callAnthropic/callDeepSeek — transparent to callers.
async function callLiteLLMProxy(m, messages, ctx, onProgress, signal) {
  let totalIn = 0, totalOut = 0;
  const callHist          = [];
  const sessionDispatched = new Set();

  // Convert Anthropic-format history to OpenAI format (mirrors callDeepSeek conversion)
  const history = messages.map(msg => {
    if (typeof msg.content === 'string') return { role: msg.role, content: msg.content };
    if (Array.isArray(msg.content)) {
      if (msg.role === 'user') {
        const toolResults = msg.content.filter(b => b.type === 'tool_result');
        if (toolResults.length) {
          return toolResults.map(tr => ({
            role: 'tool', tool_call_id: tr.tool_use_id, content: String(tr.content),
          }));
        }
        return { role: 'user', content: msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n') };
      }
      if (msg.role === 'assistant') {
        const text     = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
        const toolUses = msg.content.filter(b => b.type === 'tool_use');
        return {
          role: 'assistant', content: text || null,
          tool_calls: toolUses.map(t => ({
            id: t.id, type: 'function',
            function: { name: t.name, arguments: JSON.stringify(t.input) },
          })),
        };
      }
    }
    return { role: msg.role, content: String(msg.content) };
  }).flat().filter(Boolean);

  const msgs = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];

  for (let i = 0; i < MAX_ITER; i++) {
    const resp = await litellmProxy.chat.completions.create({
      model: m.proxyModel, messages: msgs, tools: TOOLS_OPENAI, max_tokens: 8096,
    }, { signal });

    const choice = resp.choices[0];
    totalIn  += resp.usage?.prompt_tokens     || 0;
    totalOut += resp.usage?.completion_tokens || 0;

    const cost = calcCost(ctx.modelKey, totalIn, totalOut);
    if (cost > MAX_COST_USD) {
      throw new Error(`💸 Límite de costo: $${cost.toFixed(4)} > $${MAX_COST_USD}. Abortando.`);
    }
    if (totalIn > TOKEN_BUDGET) {
      throw new Error(`📊 Contexto agotado: ${totalIn.toLocaleString()}↑ > ${TOKEN_BUDGET.toLocaleString()} tokens. Divide la tarea en partes más pequeñas.`);
    }

    if (choice.finish_reason === 'tool_calls') {
      const toolCalls = choice.message.tool_calls || [];

      const sig = toolCalls.map(tc => `${tc.function.name}:${tc.function.arguments.slice(0, 200)}`).join('|');
      callHist.push(sig);
      checkLoop(callHist);

      const preview = toolCalls.map(tc => {
        let arg = '';
        try { const p = JSON.parse(tc.function.arguments); arg = p.command || p.path || p.project || ''; } catch (_) {}
        return `⚙️ ${tc.function.name}${arg ? ': ' + String(arg).slice(0, 80) : ''}`;
      }).join('\n');
      await onProgress(preview);

      msgs.push(choice.message);
      for (const tc of toolCalls) {
        let input = {};
        try { input = JSON.parse(tc.function.arguments); } catch (_) {}
        const inputSummary = tc.function.arguments.slice(0, 500);
        apiPost('/api/events', {
          session_id: ctx.sessionId, event_type: 'pre_tool',
          tool_name: tc.function.name, tool_input_summary: inputSummary,
          project_name: ctx.projectName, api_provider: 'litellm', agent_user: ctx.username,
        });
        const result = await runTool(tc.function.name, input, sessionDispatched);
        apiPost('/api/events', {
          session_id: ctx.sessionId, event_type: 'post_tool',
          tool_name: tc.function.name, tool_response_summary: result.slice(0, 500),
          project_name: ctx.projectName, api_provider: 'litellm', agent_user: ctx.username,
        });
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
      continue;
    }

    const text = choice.message?.content || '(sin respuesta)';
    return { text, tokensIn: totalIn, tokensOut: totalOut };
  }
  return { text: '⚠️ Máximo de iteraciones alcanzado.', tokensIn: totalIn, tokensOut: totalOut };
}

// ── Claude CLI proxy — pure chat, no tools, $0 per call ──────────────────────
// Routes to a local claude-relay process that consumes the Pro/Max subscription.
// No agentic loop: one turn in → one turn out. Fast, conversational, free.
// Used by: /claude command, or when TOPIC_MODEL is set to 'claude-proxy'.
async function callClaudeProxy(messages, model = 'claude-sonnet-4-6') {
  if (!anthropicProxy) {
    throw new Error(
      'ANTHROPIC_PROXY_URL no configurado.\n' +
      'Instala el proxy y agrega ANTHROPIC_PROXY_URL=http://127.0.0.1:5001 a relay/.env\n' +
      'Instrucciones: deploy/claude-proxy-setup.md'
    );
  }
  const resp = await anthropicProxy.messages.create({
    model,
    max_tokens: 4096,
    system:     SYSTEM_CACHED,   // cache_control: ephemeral — reduces tokens on repeat calls
    messages,
  });
  const text = resp.content.find(b => b.type === 'text')?.text || '(sin respuesta)';
  return {
    text,
    tokensIn:   resp.usage?.input_tokens                || 0,
    tokensOut:  resp.usage?.output_tokens               || 0,
    cacheRead:  resp.usage?.cache_read_input_tokens     || 0,
    cacheWrite: resp.usage?.cache_creation_input_tokens || 0,
  };
}


// ── Cost calculation ──────────────────────────────────────────────────────────
function calcCost(modelKey, tokensIn, tokensOut) {
  const m = MODELS[modelKey] || MODELS[DEFAULT_MODEL];
  return (tokensIn * m.costIn + tokensOut * m.costOut) / 1_000_000;
}

// Cache-aware cost: cache reads are billed at 10% of base input price
function calcCostCached(modelKey, tokensIn, tokensOut, cacheRead) {
  const m = MODELS[modelKey] || MODELS[DEFAULT_MODEL];
  const regularIn = Math.max(0, tokensIn - cacheRead);
  return (regularIn * m.costIn + cacheRead * m.costIn * 0.1 + tokensOut * m.costOut) / 1_000_000;
}

// ── Monitor API (fire-and-forget — never blocks the bot) ─────────────────────
function apiPost(endpoint, body) {
  fetch(`${MONITOR_API}${endpoint}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  }).catch(err => console.warn('[chat-agent] monitor api:', err.message));
}

// ── Loop / circuit-breaker helpers ────────────────────────────────────────────
function callSig(name, input) {
  // Stable fingerprint of a tool call — used to detect silent loops
  return `${name}:${JSON.stringify(input).slice(0, 200)}`;
}

function checkLoop(history) {
  if (history.length < 3) return;
  const last = history[history.length - 1];
  if (history.slice(-3).every(h => h === last)) {
    throw new Error(`🔄 Loop silencioso detectado: \`${last.split(':')[0]}\` llamada 3 veces igual. Abortando.`);
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function loadHistory(chatId, threadId) {
  const [rows] = await db.query(
    `SELECT role, content FROM conversations
     WHERE chat_id = ? AND thread_id = ?
     ORDER BY created_at DESC LIMIT ?`,
    [chatId, threadId, MAX_HISTORY + 5],
  );
  const all = rows.reverse();
  const compactRow = all.find(r => r.role === '__compact__');
  const messages   = all.filter(r => r.role !== '__compact__').slice(-MAX_HISTORY);

  if (compactRow) {
    return [
      { role: 'user',      content: `[Resumen de conversación anterior]\n${compactRow.content}`, __isSummaryCtx: true },
      { role: 'assistant', content: 'Entendido, tengo el contexto de nuestra conversación anterior.', __isSummaryCtx: true },
      ...messages,
    ];
  }
  return messages;
}

async function saveMsg(chatId, threadId, role, content, meta = {}) {
  await db.query(
    `INSERT INTO conversations
       (chat_id, thread_id, telegram_user_id, telegram_username,
        role, content, tool_name, model, provider, tokens_in, tokens_out, cost_usd,
        cache_read_tokens, cache_write_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      chatId, threadId,
      meta.userId   || null,
      meta.username || null,
      role, content,
      meta.tool      || null,
      meta.modelId   || null,
      meta.provider  || 'anthropic',
      meta.tokensIn  || 0,
      meta.tokensOut || 0,
      meta.costUsd   || 0,
      meta.cacheRead  || 0,
      meta.cacheWrite || 0,
    ],
  );
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

// ── Authorization ─────────────────────────────────────────────────────────────
function isAuthorized(ctx) {
  const uid = String(ctx.from?.id || '');
  if (ALLOWED_USER_IDS.has(uid)) return true;
  if (GROUP_CHAT && String(ctx.chat?.id) === String(GROUP_CHAT)) return true;
  return false;
}

// Prevent overlapping requests per topic
const BUSY = new Map();

// ── Project creation wizard ───────────────────────────────────────────────────
const WIZARD = new Map(); // topicKey → { step, data }
const BASE_PROJECTS_PATH = process.env.PROJECTS_BASE_PATH || '/var/www/html/vilarkptl.com';
const PROJECTS_JSON_PATH = path.join(REPO, 'relay/projects.json');

function wizModelKeyboard() {
  return new InlineKeyboard()
    .text('Sonnet 4.6 ✦ (recomendado)', 'wiz:model:sonnet').row()
    .text('Haiku 4.5 💨 (rápido/barato)', 'wiz:model:haiku');
}

function wizModeKeyboard() {
  return new InlineKeyboard()
    .text('🤖 full-claude-code', 'wiz:mode:full-claude-code').row()
    .text('📋 plan-execute',     'wiz:mode:plan-execute');
}

async function runShell(cmd) {
  const { exec } = require('child_process');
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 120_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message || '').slice(0, 300)));
      else resolve((stdout || '').trim());
    });
  });
}

async function executeProjectCreation(data, ctx, threadId) {
  const { id, name, repo, branch, model, mode, url } = data;
  const repoPath = `${BASE_PROJECTS_PATH}/${id}`;
  const relayDir = `${repoPath}/relay`;
  const inbox    = `${relayDir}/inbox-${id}.md`;
  const outbox   = `${relayDir}/outbox-${id}.md`;
  const modelId  = model === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';

  const say = (msg) => ctx.reply(msg, { parse_mode: 'Markdown', ...topicOpts(threadId) });

  await say(`⏳ *Creando proyecto \`${id}\`...*`);

  // 1. Clone repo
  try {
    await runShell(`git clone https://github.com/${repo} "${repoPath}" 2>&1`);
    await say(`✅ Repo clonado → \`${repoPath}\``);
  } catch (e) {
    if (e.message.includes('already exists') || e.message.includes('destination path')) {
      await say(`ℹ️ Directorio ya existe → \`${repoPath}\``);
    } else {
      return say(`❌ Error clonando repo:\n\`\`\`\n${e.message}\n\`\`\``);
    }
  }

  // 2. Checkout branch
  try {
    await runShell(`git -C "${repoPath}" fetch origin && git -C "${repoPath}" checkout ${branch} 2>&1`);
  } catch (_) {
    try { await runShell(`git -C "${repoPath}" checkout -b ${branch} 2>&1`); } catch (_2) {}
  }

  // 3. Create relay dir + inbox/outbox
  await runShell(`mkdir -p "${relayDir}" && touch "${inbox}" && touch "${outbox}"`);
  await say(`✅ \`relay/inbox-${id}.md\` y \`outbox-${id}.md\` creados`);

  // 4. Update projects.json
  let projects = [];
  try { projects = JSON.parse(fs.readFileSync(PROJECTS_JSON_PATH, 'utf8')); } catch (_) {}
  const entry = {
    id,
    name: name || id,
    mode: mode || 'full-claude-code',
    ignore_quiet_hours: false,
    claude_model:      modelId,
    claude_model_fast: 'claude-haiku-4-5-20251001',
    deepseek_model:    'flash',
    use_cli_proxy:     false,
    inbox,
    outbox,
    repo:   repoPath,
    branch: branch || 'main',
    github: repo,
    url:    url || '',
    active: true,
  };
  const idx = projects.findIndex(p => p.id === id);
  if (idx >= 0) projects[idx] = entry; else projects.push(entry);
  fs.writeFileSync(PROJECTS_JSON_PATH, JSON.stringify(projects, null, 2) + '\n');
  await say(`✅ \`relay/projects.json\` actualizado`);

  // 5. Commit + push
  try {
    await runShell(
      `cd "${REPO}" && git add relay/projects.json && ` +
      `git commit -m "feat: add project ${id} via Telegram wizard" && git push origin main 2>&1`
    );
    await say(`✅ Commit + push a \`main\``);
  } catch (e) {
    await say(`⚠️ Commit/push falló: \`${e.message}\``);
  }

  // 6. Restart relay-master
  try {
    await runShell('pm2 restart relay-master 2>&1');
    await say(`✅ \`relay-master\` reiniciado`);
  } catch (e) {
    await say(`⚠️ pm2 restart falló: \`${e.message}\``);
  }

  await say(
    `🎉 *Proyecto \`${id}\` activo*\n\n` +
    `*Modelo:* ${modelId}\n` +
    `*Modo:* ${mode}\n` +
    `*Repo:* \`${repoPath}\`\n` +
    `*Branch:* \`${branch}\`\n\n` +
    `Envía tareas con:\n\`/tarea [${id}] descripción\``,
  );
}

bot.callbackQuery(/^wiz:model:(.+)$/, async (ctx) => {
  const threadId = ctx.callbackQuery.message?.message_thread_id ?? 0;
  const topicKey = `${ctx.chat.id}:${threadId}`;
  const wiz = WIZARD.get(topicKey);
  if (!wiz || wiz.step !== 'model') return ctx.answerCallbackQuery({ text: 'Wizard no activo' });
  wiz.data.model = ctx.match[1];
  wiz.step = 'mode';
  await ctx.answerCallbackQuery({ text: `✓ Modelo: ${ctx.match[1]}` });
  await ctx.editMessageText(
    `✅ Modelo: *${ctx.match[1]}*\n\n*¿Modo de operación?*\n\n` +
    `• \`full-claude-code\` — escribe código, hace commits, push\n` +
    `• \`plan-execute\` — planea y reporta sin commitear`,
    { parse_mode: 'Markdown', reply_markup: wizModeKeyboard() },
  );
});

bot.callbackQuery(/^wiz:mode:(.+)$/, async (ctx) => {
  const threadId = ctx.callbackQuery.message?.message_thread_id ?? 0;
  const topicKey = `${ctx.chat.id}:${threadId}`;
  const wiz = WIZARD.get(topicKey);
  if (!wiz || wiz.step !== 'mode') return ctx.answerCallbackQuery({ text: 'Wizard no activo' });
  wiz.data.mode = ctx.match[1];
  wiz.step = 'url';
  await ctx.answerCallbackQuery({ text: `✓ Modo: ${ctx.match[1]}` });
  await ctx.editMessageText(
    `✅ Modo: *${ctx.match[1]}*\n\n*URL del proyecto* (ej: https://mi-sitio.com)\nEscribe \`-\` si no aplica:`,
    { parse_mode: 'Markdown' },
  );
});

// Deduplicate Telegram updates — at-least-once delivery can send same message_id twice
const PROCESSED_MSG_IDS = new Set();

// ── Named sessions per private chat ───────────────────────────────────────────
// chatId → { current: 'default', tags: Map<name, virtualThreadId> }
// Virtual thread IDs for named sessions use negative integers to avoid collision
// with real Telegram forum thread IDs (which are always positive).
const CHAT_SESSIONS = new Map();
let _sessionCounter = -1;

function getSessionState(chatId) {
  if (!CHAT_SESSIONS.has(chatId)) {
    CHAT_SESSIONS.set(chatId, { current: 'default', tags: new Map([['default', 0]]) });
  }
  return CHAT_SESSIONS.get(chatId);
}

// Returns the thread_id to use for DB operations.
// In Telegram groups with topics, uses the real TG thread ID.
// In private chats, uses the session-managed virtual thread ID.
function effectiveThreadId(chatId, tgThreadId) {
  if (tgThreadId > 0) return tgThreadId;
  const s = getSessionState(chatId);
  return s.tags.get(s.current) ?? 0;
}

function chatSessionKeyboard(chatId) {
  const s = getSessionState(chatId);
  const kb = new InlineKeyboard();
  let col = 0;
  for (const [name] of s.tags) {
    const label = name === s.current ? `✓ ${name}` : name;
    kb.text(label, `cs:${name}`);
    if (++col % 2 === 0) kb.row();
  }
  kb.row().text('🆕 Nueva sesión', 'cs:__new__');
  return kb;
}

// ── Project context injection ─────────────────────────────────────────────────
const PROJECTS_LIST = (() => {
  try {
    const raw = fs.readFileSync(path.join(REPO, 'relay', 'projects.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.projects || []);
  } catch (_) { return []; }
})();

// Per-chat project context: chatId → { projectId, claudeMd }
const SESSION_CONTEXT = new Map();

// ── Session persistence across bot restarts ───────────────────────────────────
const SESSIONS_FILE = path.join(REPO, 'relay', 'chat-sessions.json');

function persistSessions() {
  try {
    const data = {};
    for (const [chatId, state] of CHAT_SESSIONS) {
      data[chatId] = { current: state.current, tags: Object.fromEntries(state.tags) };
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) { console.warn('[sessions] persist error:', err.message); }
}

function restoreSessions() {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return;
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    for (const [chatId, state] of Object.entries(data)) {
      CHAT_SESSIONS.set(Number(chatId), {
        current: state.current || 'default',
        tags:    new Map(Object.entries(state.tags || { default: 0 }).map(([k, v]) => [k, Number(v)])),
      });
    }
    console.log(`[sessions] ${Object.keys(data).length} sesiones restauradas`);
  } catch (err) { console.warn('[sessions] restore error:', err.message); }
}

restoreSessions();

function getProjectClaudeMd(projectId) {
  const p = PROJECTS_LIST.find(x => x.id === projectId);
  if (!p?.repo) return '';
  try { return fs.readFileSync(path.join(p.repo, 'CLAUDE.md'), 'utf8').slice(0, 3000); }
  catch (_) { return ''; }
}

// Returns system blocks — adds project CLAUDE.md as second ephemeral cache block when set
function buildSystemBlocks(chatId) {
  const sctx = SESSION_CONTEXT.get(chatId);
  if (!sctx?.claudeMd) return SYSTEM_CACHED;
  return [
    ...SYSTEM_CACHED,
    { type: 'text', text: `\n--- CLAUDE.md (${sctx.projectId}) ---\n${sctx.claudeMd}`, cache_control: { type: 'ephemeral' } },
  ];
}

// ── Semantic memory compaction ─────────────────────────────────────────────────
const COMPACT_THRESHOLD = 12; // compact after N user messages in history

async function callDeepSeekCompact(prompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 700,
      }),
    });
    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn('[compact] DeepSeek error:', err.message);
    return null;
  }
}

async function compactSession(chatId, threadId, history, force = false) {
  const userMsgs = history.filter(m => m.role === 'user').length;
  if (!force && userMsgs < COMPACT_THRESHOLD) return history;

  const KEEP_LAST = 6;
  const toSummarize = history.filter(m => !m.__isSummaryCtx).slice(0, -KEEP_LAST);
  if (toSummarize.length < 4) return history;

  const sctx = SESSION_CONTEXT.get(chatId);
  const projectHint = sctx?.projectId ? ` del proyecto ${sctx.projectId}` : '';

  const summaryPrompt =
    `Resume esta conversación${projectHint} de forma estructurada. Incluye SOLO:\n` +
    `- Decisiones técnicas tomadas (archivos, rutas exactas)\n` +
    `- Errores y sus fixes\n` +
    `- Tareas completadas y pendientes\n` +
    `- Contexto clave que NO debe perderse\n\n` +
    `Conversación:\n` +
    toSummarize.map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content.slice(0, 800) : '[tool]'}`).join('\n\n') +
    `\n\nResumen (máx 500 palabras, español):`;

  const summary = await callDeepSeekCompact(summaryPrompt);
  if (!summary) return history;

  // Delete old messages keeping last KEEP_LAST
  const [countRows] = await db.query(
    'SELECT COUNT(*) AS n FROM conversations WHERE chat_id=? AND thread_id=? AND role != ?',
    [chatId, threadId, '__compact__'],
  );
  const total = countRows[0]?.n || 0;
  const toDelete = Math.max(0, total - KEEP_LAST);
  if (toDelete > 0) {
    await db.query(
      `DELETE FROM conversations WHERE chat_id=? AND thread_id=? AND role != '__compact__'
       ORDER BY created_at ASC LIMIT ?`,
      [chatId, threadId, toDelete],
    );
  }
  await db.query('DELETE FROM conversations WHERE chat_id=? AND thread_id=? AND role=?', [chatId, threadId, '__compact__']);
  await db.query(
    `INSERT INTO conversations (chat_id, thread_id, role, content) VALUES (?,?,'__compact__',?)`,
    [chatId, threadId, summary],
  );

  return history.slice(-KEEP_LAST);
}

// ── /model command — inline keyboard ─────────────────────────────────────────
function modelKeyboard() {
  const kb = new InlineKeyboard()
    .text('Sonnet 4.6 ✦',       'model:sonnet')
    .text('Haiku 4.5',           'model:haiku')
    .row()
    .text('Opus 4.7',            'model:opus')
    .row()
    .text('DeepSeek V4-Flash 💸','model:deepseek')
    .text('DeepSeek V4-Pro 💸',  'model:deepseekPro')
    .row()
    .text('DeepSeek R1 🧠',      'model:r1');
  if (anthropicProxy) {
    kb.row().text('🤖 Claude Pro (Proxy - $0)', 'model:claude-proxy');
  }
  return kb;
}

bot.callbackQuery(/^model:(.+)$/, async (ctx) => {
  const key      = ctx.match[1];
  const threadId = ctx.callbackQuery.message?.message_thread_id ?? 0;
  const topicKey = `${ctx.chat.id}:${threadId}`;
  const m        = MODELS[key];
  if (!m) return ctx.answerCallbackQuery({ text: 'Modelo desconocido' });

  TOPIC_MODEL.set(topicKey, key);
  await ctx.answerCallbackQuery({ text: `✓ ${m.label}` });
  await ctx.editMessageText(
    `Modelo cambiado a *${m.label}*\n_$${m.costIn}/$${m.costOut} por MTok ↑↓_`,
    { parse_mode: 'Markdown' },
  );
});

// ── /chat session callback ────────────────────────────────────────────────────
bot.callbackQuery(/^cs:(.+)$/, async (ctx) => {
  const key    = ctx.match[1];
  const chatId = ctx.chat.id;
  const s      = getSessionState(chatId);

  if (key === '__new__') {
    await ctx.answerCallbackQuery();
    return ctx.reply('Escribe el nombre de la nueva sesión:\n`/chat [nombre]`', { parse_mode: 'Markdown' });
  }

  if (!s.tags.has(key)) {
    await ctx.answerCallbackQuery({ text: 'Sesión no encontrada' });
    return;
  }

  s.current = key;
  persistSessions();
  await ctx.answerCallbackQuery({ text: `✓ Sesión "${key}" activada` });
  await ctx.editMessageText(
    `✅ Sesión *${key}* activada.\nHistorial cargado. Continúa chateando.`,
    { parse_mode: 'Markdown' },
  );
});

// ── Message handler ───────────────────────────────────────────────────────────
bot.on('message:text', async (ctx) => {
  // /id works for everyone — lets new devs discover their Telegram user ID
  if (ctx.message.text?.trim() === '/id') {
    const uid = ctx.from?.id;
    const name = ctx.from?.first_name || ctx.from?.username || 'Usuario';
    return ctx.reply(
      `👤 *${name}*, tu ID de Telegram es:\n\`${uid}\`\n\nCompártelo con el admin para que te agregue en ia\\.vilarkptl\\.com → Chats Telegram`,
      { parse_mode: 'MarkdownV2' },
    );
  }

  if (!isAuthorized(ctx)) {
    // Re-check with a fresh DB read before rejecting — new users added via
    // dashboard are recognized immediately on their first message attempt.
    ALLOWED_USER_IDS = await loadAuthorizedIds();
    if (!isAuthorized(ctx)) {
      const uid = ctx.from?.id;
      return ctx.reply(
        `⛔ No autorizado\\. Tu ID: \`${uid}\`\nCompártelo con el admin para obtener acceso\\.`,
        { parse_mode: 'MarkdownV2' },
      );
    }
  }

  const msgId = ctx.message.message_id;
  if (PROCESSED_MSG_IDS.has(msgId)) return;
  PROCESSED_MSG_IDS.add(msgId);
  setTimeout(() => PROCESSED_MSG_IDS.delete(msgId), 120_000);

  const userText  = ctx.message.text.trim();
  const threadId  = effectiveThreadId(ctx.chat.id, ctx.message.message_thread_id ?? 0);
  const topicKey  = `${ctx.chat.id}:${threadId}`;
  const modelKey  = TOPIC_MODEL.get(topicKey) || DEFAULT_MODEL;
  const userMeta  = {
    userId:   ctx.from?.id,
    username: ctx.from?.username || ctx.from?.first_name || String(ctx.from?.id),
  };

  // ── Wizard intercept (runs before all other commands) ────────────────────────
  if (WIZARD.has(topicKey)) {
    const wiz = WIZARD.get(topicKey);

    if (userText === '/cancelar' || userText === '/cancel') {
      WIZARD.delete(topicKey);
      return ctx.reply('❌ Creación de proyecto cancelada.', topicOpts(threadId));
    }

    switch (wiz.step) {
      case 'id': {
        const id = userText.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (!id || id.length < 2) return ctx.reply('❌ ID inválido. Usa letras minúsculas, números y guiones (ej: `mi-proyecto`).', { parse_mode: 'Markdown', ...topicOpts(threadId) });
        wiz.data.id = id;
        wiz.step = 'name';
        return ctx.reply(`✅ ID: \`${id}\`\n\n*Nombre descriptivo* del proyecto (ej: _Mi Proyecto Web_):`, { parse_mode: 'Markdown', ...topicOpts(threadId) });
      }
      case 'name': {
        wiz.data.name = userText.slice(0, 60);
        wiz.step = 'repo';
        return ctx.reply(`✅ Nombre: *${wiz.data.name}*\n\n*Repo GitHub* (formato: \`usuario/nombre-repo\`):`, { parse_mode: 'Markdown', ...topicOpts(threadId) });
      }
      case 'repo': {
        const repo = userText.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return ctx.reply('❌ Formato incorrecto. Ej: `vilarkptl-lang/mi-repo`', { parse_mode: 'Markdown', ...topicOpts(threadId) });
        wiz.data.repo = repo;
        wiz.step = 'branch';
        return ctx.reply(`✅ Repo: \`${repo}\`\n\n*Branch* (normalmente \`main\`):`, { parse_mode: 'Markdown', ...topicOpts(threadId) });
      }
      case 'branch': {
        wiz.data.branch = userText.trim() || 'main';
        wiz.step = 'model';
        return ctx.reply(`✅ Branch: \`${wiz.data.branch}\`\n\n*¿Qué modelo Claude usará el agente?*`, { parse_mode: 'Markdown', reply_markup: wizModelKeyboard(), ...topicOpts(threadId) });
      }
      case 'url': {
        wiz.data.url = userText.trim() === '-' ? '' : userText.trim();
        WIZARD.delete(topicKey);
        await executeProjectCreation(wiz.data, ctx, threadId);
        return;
      }
    }
    // model/mode steps are handled by callbackQuery handlers above
    return;
  }

  // ── Commands ───────────────────────────────────────────────────────────────
  // ── /chat — gestión de sesiones nombradas ────────────────────────────────────
  if (userText === '/chat' || userText.startsWith('/chat ')) {
    const arg = userText.slice('/chat'.length).trim();
    const s   = getSessionState(ctx.chat.id);

    if (!arg) {
      return ctx.reply(
        `*Sesiones de chat*\nActual: \`${s.current}\`\n\nSelecciona o crea una sesión:`,
        { parse_mode: 'Markdown', reply_markup: chatSessionKeyboard(ctx.chat.id), ...topicOpts(threadId) },
      );
    }

    // /chat [nombre] → create or switch
    const name = arg.slice(0, 40).replace(/[^a-zA-Z0-9_\-áéíóúñÁÉÍÓÚÑ ]/g, '').trim();
    if (!name) return ctx.reply('Nombre inválido. Usa letras, números o guiones.', topicOpts(threadId));

    if (!s.tags.has(name)) {
      s.tags.set(name, _sessionCounter--);
    }
    s.current = name;
    persistSessions();

    // Auto-inject project context when session name matches a known project
    const matchedProject = PROJECTS_LIST.find(p => p.id === name || p.name?.toLowerCase() === name.toLowerCase());
    if (matchedProject) {
      const claudeMd = getProjectClaudeMd(matchedProject.id);
      SESSION_CONTEXT.set(ctx.chat.id, { projectId: matchedProject.id, claudeMd });
      const ctxNote = claudeMd ? ` · contexto de ${matchedProject.id} cargado` : '';
      return ctx.reply(`✅ Sesión *${name}* activada${ctxNote}.`, { parse_mode: 'Markdown', ...topicOpts(threadId) });
    }

    // Clear project context when switching to a non-project session
    SESSION_CONTEXT.delete(ctx.chat.id);
    return ctx.reply(`✅ Sesión *${name}* activada.`, { parse_mode: 'Markdown', ...topicOpts(threadId) });
  }

  // ── /tarea — despachar tarea al relay-master desde Telegram ──────────────────
  // Uso: /tarea fiscalai Agrega endpoint GET /api/salud
  //      /tarea coordinator Revisa y organiza el inbox de todos los proyectos
  if (userText.startsWith('/tarea')) {
    const arg   = userText.slice('/tarea'.length).trim();
    const match = arg.match(/^(\S+)\s+([\s\S]+)$/);
    const projectId = match ? match[1] : 'coordinator';
    const task      = match ? match[2] : arg;

    if (!task) {
      return ctx.reply(
        'Uso: `/tarea [proyecto] [descripción]`\nEj: `/tarea fiscalai Agrega endpoint GET /api/salud`\n' +
        'Proyectos activos: ' + PROJECTS_LIST.filter(p => p.active && p.inbox).map(p => `\`${p.id}\``).join(', '),
        { parse_mode: 'Markdown', ...topicOpts(threadId) },
      );
    }

    try {
      const resp = await fetch(`${MONITOR_API}/api/relay/dispatch`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ project: projectId, task, requester: `tg:${userMeta.username}` }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      return ctx.reply(
        `✅ Tarea enviada a *${projectId}*\n_El relay la procesará en el próximo ciclo (~15s)_\n\n> ${task.slice(0, 120)}`,
        { parse_mode: 'Markdown', ...topicOpts(threadId) },
      );
    } catch (err) {
      return ctx.reply(`❌ Error al despachar: ${err.message}`, topicOpts(threadId));
    }
  }

  if (userText === '/compact') {
    const history = await loadHistory(ctx.chat.id, threadId);
    const waiting = await ctx.reply('⏳ Compactando memoria…', topicOpts(threadId));
    const compacted = await compactSession(ctx.chat.id, threadId, history, true);
    await safeEdit(ctx.chat.id, waiting.message_id,
      `✅ Memoria compactada — ${history.length} → ${compacted.length} mensajes en contexto.`);
    return;
  }

  if (userText === '/summary') {
    const [[row]] = await db.query(
      `SELECT content, created_at FROM conversations WHERE chat_id=? AND thread_id=? AND role='__compact__' LIMIT 1`,
      [ctx.chat.id, threadId],
    );
    if (!row) return ctx.reply('Sin resumen aún. Usa /compact para generar uno.', topicOpts(threadId));
    const ts = new Date(row.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    return ctx.reply(`📋 *Resumen de sesión* _(${ts})_\n\n${row.content}`, { parse_mode: 'Markdown', ...topicOpts(threadId) });
  }

  if (userText === '/reset') {
    BUSY.delete(topicKey);
    TOPIC_MODEL.delete(topicKey);
    ALLOWED_USER_IDS = await loadAuthorizedIds();
    await db.query(
      'DELETE FROM conversations WHERE chat_id = ? AND thread_id = ?',
      [ctx.chat.id, threadId],
    );
    SESSION_CONTEXT.delete(ctx.chat.id);
    return ctx.reply('✅ Historial, contexto y modelo restablecidos.', topicOpts(threadId));
  }

  if (userText === '/model') {
    const m = MODELS[modelKey];
    return ctx.reply(
      `Modelo actual: *${m.label}*\nSelecciona otro:`,
      { parse_mode: 'Markdown', reply_markup: modelKeyboard(), ...topicOpts(threadId) },
    );
  }

  if (userText.startsWith('/model ')) {
    // Normalize: "claude proxy" → "claude-proxy", "deepseek pro" → "deepseekPro"
    const raw = userText.slice('/model '.length).trim();
    const ALIASES = { 'claude proxy': 'claude-proxy', 'deepseek pro': 'deepseekPro', 'deepseek flash': 'deepseek' };
    const key = ALIASES[raw.toLowerCase()] ?? raw;
    if (MODELS[key]) {
      TOPIC_MODEL.set(topicKey, key);
      const m = MODELS[key];
      return ctx.reply(
        `✅ Modelo: *${m.label}*\n_${m.costIn === 0 ? '$0 — usa Pro/Max OAuth' : `$${m.costIn}/$${m.costOut} por MTok ↑↓`}_`,
        { parse_mode: 'Markdown', ...topicOpts(threadId) },
      );
    }
    const keys = Object.keys(MODELS).join(', ');
    return ctx.reply(`❌ Modelo \`${key}\` no existe.\nOpciones: ${keys}`, { parse_mode: 'Markdown', reply_markup: modelKeyboard(), ...topicOpts(threadId) });
  }

  if (userText === '/status') {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS total, ROUND(SUM(cost_usd), 4) AS cost, MAX(created_at) AS last
       FROM conversations WHERE chat_id = ? AND thread_id = ?`,
      [ctx.chat.id, threadId],
    );
    const { total, cost, last } = rows[0];
    const m = MODELS[modelKey];
    return ctx.reply(
      `📊 *${total}* msgs · *$${cost || '0.0000'}* · modelo: *${m.label}*\n_último: ${last || 'ninguno'}_`,
      { parse_mode: 'Markdown', ...topicOpts(threadId) },
    );
  }

  if (userText === '/nuevo' || userText === '/new' || userText.startsWith('/nuevo ') || userText.startsWith('/new ')) {
    const inlineArg = userText.includes(' ') ? userText.slice(userText.indexOf(' ') + 1).trim() : '';
    if (inlineArg) {
      // /nuevo inspector → skip directly to name step
      const id = inlineArg.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      WIZARD.set(topicKey, { step: 'name', data: { id } });
      return ctx.reply(
        `✅ ID: \`${id}\`\n\n*Nombre descriptivo* del proyecto (ej: _Inspector Web_):`,
        { parse_mode: 'Markdown', ...topicOpts(threadId) },
      );
    }
    WIZARD.set(topicKey, { step: 'id', data: {} });
    return ctx.reply(
      '🚀 *Nuevo proyecto — Wizard de creación*\n\n' +
      'Voy a guiarte paso a paso. Al final clonaré el repo, crearé el inbox/outbox, ' +
      'actualizaré `projects.json`, haré commit+push y reinicaré el relay.\n\n' +
      'Escribe `/cancelar` en cualquier momento para abortar.\n\n' +
      '*¿Cuál es el ID del proyecto?*\n_(ej: `fiscalai-v2`, `voltic`, `mi-app`)_',
      { parse_mode: 'Markdown', ...topicOpts(threadId) },
    );
  }

  if (userText === '/help') {
    const proxyStatus = anthropicProxy ? '✅ activo' : '❌ no configurado (ver ANTHROPIC_PROXY_URL)';
    const modelList = Object.entries(MODELS)
      .map(([k, v]) => `  • \`${k}\` — ${v.label}`)
      .join('\n');
    return ctx.reply(
      '*Claude Code · Vilar AI*\n\n' +
      '`/nuevo` — Crear proyecto nuevo (wizard completo)\n' +
      '`/claude [msg]` — Chat directo con Claude Pro via proxy ($0)\n' +
      '`/tarea [proyecto] [desc]` — Despachar tarea al relay-master\n' +
      '`/chat` — Ver sesiones · `/chat [nombre]` — Crear/activar sesión\n' +
      '`/chat fiscalai` — Sesión con contexto CLAUDE.md del proyecto\n' +
      '`/model` — Cambiar modelo de IA\n' +
      '`/compact` — Compactar memoria (DeepSeek V4-Flash)\n' +
      '`/summary` — Ver resumen compactado de la sesión\n' +
      '`/reset` — Borrar historial de la sesión actual\n' +
      '`/status` — Stats de la sesión actual\n' +
      '`/cancelar` — Cancelar wizard en curso\n' +
      '`/help` — Esta ayuda\n\n' +
      `*Proxy CLI:* ${proxyStatus}\n\n` +
      '*Modelos disponibles:*\n' + modelList,
      { parse_mode: 'Markdown', ...topicOpts(threadId) },
    );
  }

  // ── /claude — chat directo con Claude Pro via CLI proxy ($0 por llamada) ──
  // Uso: /claude Hola ¿cómo estás?
  // También funciona como modelo persistente: /model → "Claude Pro (Proxy - $0)"
  if (userText.startsWith('/claude')) {
    const query = userText.slice('/claude'.length).trim();
    if (!query) {
      return ctx.reply(
        '💬 *Claude Pro via proxy*\n\nUso: `/claude [tu mensaje]`\nEjemplo: `/claude ¿cómo vas con el sprint?`\n\nO usa `/model` y selecciona _Claude Pro (Proxy - $0)_ para que todo el chat use el proxy.',
        { parse_mode: 'Markdown', ...topicOpts(threadId) },
      );
    }

    if (!anthropicProxy) {
      return ctx.reply(
        '❌ *Proxy no configurado*\n\n' +
        'Agrega a `relay/.env`:\n`ANTHROPIC_PROXY_URL=http://127.0.0.1:5001`\n\n' +
        'Instrucciones de instalación: `deploy/claude-proxy-setup.md`',
        { parse_mode: 'Markdown', ...topicOpts(threadId) },
      );
    }

    if (BUSY.get(topicKey)) return ctx.reply('⏳ Procesando solicitud anterior…', topicOpts(threadId));
    BUSY.set(topicKey, true);

    const sessionId   = `tg-proxy-${userMeta.userId}-${threadId}-${Date.now()}`;
    const projectName = `tg-proxy-${threadId > 0 ? `topic${threadId}` : 'dm'}`;
    const progressMsg = await ctx.reply('⏳ _Claude Pro…_', { parse_mode: 'Markdown', ...topicOpts(threadId) });
    bot.api.sendChatAction(ctx.chat.id, 'typing', topicOpts(threadId)).catch(() => {});

    apiPost('/api/sessions', {
      session_id: sessionId, project_name: projectName,
      api_provider: 'anthropic-proxy', agent_user: userMeta.username, chat_source: 'telegram-proxy',
    });

    try {
      const history = await loadHistory(ctx.chat.id, threadId);
      history.push({ role: 'user', content: query });

      const result   = await callClaudeProxy(history, MODELS['claude-proxy'].id);
      const footer   = `\n\n_🤖 Claude Pro (Proxy) · ${result.tokensIn}↑ ${result.tokensOut}↓ · $0.00_`;
      const chunks   = chunkText(result.text + footer, 4000);

      await safeEdit(ctx.chat.id, progressMsg.message_id, chunks[0]);
      for (let i = 1; i < chunks.length; i++) {
        await ctx.reply(chunks[i], { parse_mode: 'Markdown', ...topicOpts(threadId) });
      }

      await saveMsg(ctx.chat.id, threadId, 'user', query, { ...userMeta });
      await saveMsg(ctx.chat.id, threadId, 'assistant', result.text, {
        ...userMeta, modelId: 'claude-sonnet-4-6', provider: 'anthropic-proxy',
        tokensIn: result.tokensIn, tokensOut: result.tokensOut, costUsd: 0,
        cacheRead: result.cacheRead, cacheWrite: result.cacheWrite,
      });
    } catch (err) {
      console.error('[claude-proxy]', err.message);
      await safeEdit(ctx.chat.id, progressMsg.message_id, `❌ ${err.message.slice(0, 300)}`);
    } finally {
      apiPost('/api/sessions/end', { session_id: sessionId, input_tokens: 0, output_tokens: 0 });
      BUSY.delete(topicKey);
    }
    return;
  }

  if (BUSY.get(topicKey)) {
    return ctx.reply('⏳ Procesando solicitud anterior…', topicOpts(threadId));
  }
  BUSY.set(topicKey, true);

  const m         = MODELS[modelKey];
  const sessionId  = `tg-${userMeta.userId}-${threadId}-${Date.now()}`;
  const projectName = `tg-${threadId > 0 ? `topic${threadId}` : 'dm'}`;

  // Session context passed into the agentic loop
  const agentCtx = {
    sessionId, modelKey, projectName,
    username: userMeta.username,
  };

  // Register session in dashboard
  apiPost('/api/sessions', {
    session_id:   sessionId,
    project_name: projectName,
    api_provider: m.provider,
    agent_user:   userMeta.username,
    chat_source:  'telegram-chat',
  });

  const progressMsg = await ctx.reply(`⏳ _${m.label}…_`, {
    parse_mode: 'Markdown', ...topicOpts(threadId),
  });
  bot.api.sendChatAction(ctx.chat.id, 'typing', topicOpts(threadId)).catch(() => {});

  let tokensIn = 0, tokensOut = 0, cacheRead = 0, cacheWrite = 0;
  try {
    let history = await loadHistory(ctx.chat.id, threadId);
    // Auto-compact when history grows beyond threshold (runs silently in background after reply)
    const shouldCompact = history.filter(m => m.role === 'user' && !m.__isSummaryCtx).length >= COMPACT_THRESHOLD;
    history.push({ role: 'user', content: userText });

    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), TASK_TIMEOUT_MS);
    let result;
    try {
      result = await callModel(
        modelKey, history, agentCtx,
        (progressText) => safeEdit(ctx.chat.id, progressMsg.message_id, progressText),
        abortCtrl.signal,
      );
    } finally {
      clearTimeout(timeoutId);
    }
    if (abortCtrl.signal.aborted) {
      throw new Error(`⏰ Tiempo agotado (${Math.round(TASK_TIMEOUT_MS / 60000)} min). Divide la tarea en pasos más pequeños.`);
    }
    tokensIn   = result.tokensIn;
    tokensOut  = result.tokensOut;
    cacheRead  = result.cacheRead  || 0;
    cacheWrite = result.cacheWrite || 0;

    const costUsd  = calcCostCached(modelKey, tokensIn, tokensOut, cacheRead);
    const cacheBit = cacheRead > 0 ? ` · ${Math.round(cacheRead / 1000)}K✓` : '';
    const footer   = `\n\n_${m.label} · ${tokensIn}↑ ${tokensOut}↓${cacheBit} · $${costUsd.toFixed(5)}_`;
    const chunks  = chunkText(result.text + footer, 4000);

    await safeEdit(ctx.chat.id, progressMsg.message_id, chunks[0]);
    for (let i = 1; i < chunks.length; i++) {
      await ctx.reply(chunks[i], { parse_mode: 'Markdown', ...topicOpts(threadId) });
    }

    await saveMsg(ctx.chat.id, threadId, 'user', userText, { ...userMeta });
    await saveMsg(ctx.chat.id, threadId, 'assistant', result.text, {
      ...userMeta, modelId: m.id, provider: m.provider,
      tokensIn, tokensOut, costUsd, cacheRead, cacheWrite,
    });

    // Auto-compact after reply (non-blocking — user doesn't wait)
    if (shouldCompact) {
      const freshHistory = await loadHistory(ctx.chat.id, threadId);
      compactSession(ctx.chat.id, threadId, freshHistory, false).catch(err =>
        console.warn('[compact] auto-compact error:', err.message),
      );
    }
  } catch (err) {
    console.error('[chat-agent] error:', err.message);
    await safeEdit(
      ctx.chat.id, progressMsg.message_id,
      `❌ ${(err.message || 'Error desconocido').slice(0, 300)}`,
    );
  } finally {
    // Always end session so dashboard shows it as closed
    apiPost('/api/sessions/end', {
      session_id: sessionId, input_tokens: tokensIn, output_tokens: tokensOut,
    });
    BUSY.delete(topicKey);
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
// Supports two modes:
//   Webhook (preferred): set BOT_WEBHOOK_URL=https://ia.vilarkptl.com/tg-bot in relay/.env
//     Then add to Apache VirtualHost: ProxyPass /tg-bot http://127.0.0.1:3011/
//   Polling (default):   BOT_WEBHOOK_URL unset — grammY long-polls Telegram servers

bot.catch(err => console.error('[grammy]', err.message));

console.log(`[chat-agent] Iniciando — usuarios se cargan desde DB (telegram_users table)`);
console.log(`[chat-agent] Modelos: ${Object.keys(MODELS).join(', ')} (default: ${DEFAULT_MODEL})`);

const WEBHOOK_URL  = process.env.BOT_WEBHOOK_URL  || '';
const WEBHOOK_PORT = parseInt(process.env.BOT_WEBHOOK_PORT || '3011');

const BOT_COMMANDS = [
  { command: 'id',      description: 'Ver tu Telegram user ID (sin autenticación)' },
  { command: 'nuevo',   description: 'Crear nuevo proyecto — clona repo, configura agente' },
  { command: 'claude',  description: 'Chat con Claude Pro via proxy ($0)' },
  { command: 'tarea',   description: 'Despachar tarea al relay — /tarea [proyecto] [desc]' },
  { command: 'chat',    description: 'Ver/cambiar sesión — /chat [proyecto]' },
  { command: 'model',   description: 'Cambiar modelo de IA' },
  { command: 'compact', description: 'Compactar memoria de la sesión con IA' },
  { command: 'summary', description: 'Ver resumen compactado de la sesión' },
  { command: 'reset',   description: 'Borrar historial de la sesión actual' },
  { command: 'status',  description: 'Stats de la sesión actual' },
  { command: 'cancelar',description: 'Cancelar wizard en curso' },
  { command: 'help',    description: 'Lista de comandos' },
];

if (WEBHOOK_URL) {
  const { webhookCallback } = require('grammy');
  const http = require('http');

  bot.api.setMyCommands(BOT_COMMANDS).catch(err => console.warn('[chat-agent] setMyCommands:', err.message));
  bot.api.setWebhook(WEBHOOK_URL, { drop_pending_updates: true })
    .then(() => {
      const handleUpdate = webhookCallback(bot, 'http');
      http.createServer(async (req, res) => {
        if (req.method === 'POST') {
          await handleUpdate(req, res);
        } else {
          res.writeHead(200).end('OK');
        }
      }).listen(WEBHOOK_PORT, '127.0.0.1', () => {
        console.log(`[chat-agent] Webhook activo en :${WEBHOOK_PORT} → ${WEBHOOK_URL}`);
      });
    })
    .catch(err => {
      console.error('[chat-agent] Error al registrar webhook:', err.message);
      console.log('[chat-agent] Cayendo back a polling…');
      bot.start({ onStart: info => console.log(`[chat-agent] @${info.username} listo — polling activo`) });
    });
} else {
  bot.start({
    onStart: info => {
      console.log(`[chat-agent] @${info.username} listo — polling activo`);
      bot.api.setMyCommands(BOT_COMMANDS).catch(err => console.warn('[chat-agent] setMyCommands:', err.message));
    },
  });
}
