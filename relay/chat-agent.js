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
      system:     SYSTEM_CACHED,
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
    [chatId, threadId, MAX_HISTORY],
  );
  return rows.reverse();
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

// Deduplicate Telegram updates — at-least-once delivery can send same message_id twice
const PROCESSED_MSG_IDS = new Set();

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

// ── Message handler ───────────────────────────────────────────────────────────
bot.on('message:text', async (ctx) => {
  if (!isAuthorized(ctx)) return;

  const msgId = ctx.message.message_id;
  if (PROCESSED_MSG_IDS.has(msgId)) return;
  PROCESSED_MSG_IDS.add(msgId);
  setTimeout(() => PROCESSED_MSG_IDS.delete(msgId), 120_000);

  const userText  = ctx.message.text.trim();
  const threadId  = ctx.message.message_thread_id ?? 0;
  const topicKey  = `${ctx.chat.id}:${threadId}`;
  const modelKey  = TOPIC_MODEL.get(topicKey) || DEFAULT_MODEL;
  const userMeta  = {
    userId:   ctx.from?.id,
    username: ctx.from?.username || ctx.from?.first_name || String(ctx.from?.id),
  };

  // ── Commands ───────────────────────────────────────────────────────────────
  if (userText === '/reset') {
    await db.query(
      'DELETE FROM conversations WHERE chat_id = ? AND thread_id = ?',
      [ctx.chat.id, threadId],
    );
    return ctx.reply('✅ Historial borrado.', topicOpts(threadId));
  }

  if (userText === '/model') {
    const m = MODELS[modelKey];
    return ctx.reply(
      `Modelo actual: *${m.label}*\nSelecciona otro:`,
      { parse_mode: 'Markdown', reply_markup: modelKeyboard(), ...topicOpts(threadId) },
    );
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

  if (userText === '/help') {
    const proxyStatus = anthropicProxy ? '✅ activo' : '❌ no configurado (ver ANTHROPIC_PROXY_URL)';
    const modelList = Object.entries(MODELS)
      .map(([k, v]) => `  • \`${k}\` — ${v.label}`)
      .join('\n');
    return ctx.reply(
      '*Claude Code · Vilar AI*\n\n' +
      '`/claude [msg]` — Chat directo con Claude Pro via proxy ($0)\n' +
      '`/model` — Cambiar modelo de IA\n' +
      '`/reset` — Borrar historial de este topic\n' +
      '`/status` — Stats del topic actual\n' +
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
    const history = await loadHistory(ctx.chat.id, threadId);
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

console.log(`[chat-agent] Iniciando — ${ALLOWED_USER_IDS.size} usuario(s) autorizados`);
console.log(`[chat-agent] Modelos: ${Object.keys(MODELS).join(', ')} (default: ${DEFAULT_MODEL})`);

const WEBHOOK_URL  = process.env.BOT_WEBHOOK_URL  || '';
const WEBHOOK_PORT = parseInt(process.env.BOT_WEBHOOK_PORT || '3011');

if (WEBHOOK_URL) {
  const { webhookCallback } = require('grammy');
  const http = require('http');

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
    onStart: info => console.log(`[chat-agent] @${info.username} listo — polling activo`),
  });
}
