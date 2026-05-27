'use strict';

// Strip ANTHROPIC_API_KEY immediately — PM2 injects it from its registry even
// when commented in .env. Claude runs via Max subscription (claude-proxy, $0).
delete process.env.ANTHROPIC_API_KEY;

/**
 * relay/master.js — Master Relay
 *
 * Un solo proceso Node.js que gobierna TODOS los proyectos.
 * Reemplaza: claude-relay (FiscalAI) + ai-monitor-relay
 *
 * Flujo por proyecto:
 *   inbox.md cambia → Cola de ejecución → Claude CLI → outbox.md → push → Telegram
 *
 * pm2: relay-master
 */

const fs      = require('fs');
const path    = require('path');

// Load relay/.env without requiring the dotenv npm package
(function loadEnv(file) {
  try {
    fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([^=#\s][^=]*?)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    });
  } catch (_) {}
})(path.join(__dirname, '.env'));
const crypto  = require('crypto');
const { execSync, exec, spawn } = require('child_process');
const https   = require('https');
const http    = require('http');

// ─── Config ───────────────────────────────────────────────
const PROJECTS_FILE   = path.join(__dirname, 'projects.json');
// Keep dispatch queue outside the git repo so gitPull never overwrites it
const DISPATCH_FILE   = process.env.DISPATCH_FILE ||
  `/var/lib/ai-monitor/pending-dispatches.json`;
const HASHES_FILE     = `/tmp/relay-master-hashes-${process.getuid?.() ?? 'x'}.json`;
// Separate file for buzon hashes — prevents inbox saveHashes() from wiping buzon state
const BUZON_HASHES_FILE = `/tmp/relay-buzon-hashes-${process.getuid?.() ?? 'x'}.json`;
// Per-project Claude session IDs for --resume continuity between dispatches
const SESSIONS_FILE   = `/tmp/relay-sessions-${process.getuid?.() ?? 'x'}.json`;
const PROJECT_SESSIONS = (() => {
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); } catch (_) { return {}; }
})();
function saveProjectSessions() {
  try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(PROJECT_SESSIONS)); } catch (_) {}
}
// Sessions expire after 4h — avoids passing stale IDs that Claude rejects
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
function getResumeSession(projectId) {
  const entry = PROJECT_SESSIONS[projectId];
  if (!entry || Date.now() - entry.ts > SESSION_TTL_MS) return null;
  return entry.id;
}
// Per-project lock files: /tmp/relay-lock-{projectId} (parallel execution)
// Outbox watchdog: track when each project last got an inbox dispatch
const DISPATCH_TIMES  = {};   // { [projectId]: { dispatched_at: ms, dispatch_id: str } }
// In-memory task tracking — avoids PID-based lock bug where relay-master's own
// PID was written to lock files, making locks never expire (relay-master always alive).
const ACTIVE_TASKS      = new Set();
const ACTIVE_PIDS       = new Map();  // projectId → {pid, startTime, jobId, forceTimeout}
const TASK_START_TIMES  = {};  // { [projectId]: timestamp when task started }
const LAST_RUNNING_WARN = {};  // { [projectId]: timestamp of last "still running" TG alert }
const RUNNING_WARN_MS   = parseInt(process.env.RUNNING_WARN_MS || '300000'); // 5 min
const OUTBOX_TIMEOUT_MS = parseInt(process.env.OUTBOX_TIMEOUT_MS || '2100000'); // 35 min
const MONITOR_API     = process.env.MONITOR_API_URL || 'http://127.0.0.1:3010';
const BOT_TOKEN       = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID         = process.env.TELEGRAM_CHAT_ID;
// Extra devs that receive broadcast notifications (read-only — no commands).
// Set TELEGRAM_EXTRA_CHAT_IDS=id1,id2,id3 in relay/.env
const EXTRA_CHAT_IDS  = (process.env.TELEGRAM_EXTRA_CHAT_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const DEEPSEEK_KEY    = process.env.DEEPSEEK_API_KEY;
const XAI_KEY         = process.env.XAI_API_KEY;
const GITHUB_TOKEN    = process.env.GITHUB_TOKEN;
const CLAUDE_BIN      = process.env.CLAUDE_BIN || '/usr/local/bin/claude';
const CLAUDE_USER     = process.env.CLAUDE_USER || 'claude-agent';
const POLL_MS         = parseInt(process.env.POLL_MS || '15000');
const CLAUDE_TIMEOUT_MS  = parseInt(process.env.CLAUDE_TIMEOUT_MS || String(25 * 60 * 1000)); // 25 min default

// Kill-switch global — pausar todo el relay cuando el gasto diario supera umbrales
let GLOBAL_KILLED   = false;
let GLOBAL_KILL_TS  = null;
let GLOBAL_KILL_MSG = '';
const PROVIDER_LAST_ALERT = {};  // proveedor → timestamp última alerta (antispam)

// ── Quiet hours (11pm–8am hora México UTC-6) ──────────────────────────────────
function isQuietHour() {
  const mxHour = (new Date().getUTCHours() - 6 + 24) % 24;
  return mxHour >= 23 || mxHour < 8;
}

// ── Rate limiting por proyecto (máx 3 dispatches/hora) ────────────────────────
const DISPATCH_TIMESTAMPS = new Map();
const DISPATCH_RATE_LIMIT = parseInt(process.env.DISPATCH_RATE_LIMIT || '3');
const DISPATCH_WINDOW_MS  = 60 * 60 * 1000;

function isRateLimited(projectId) {
  const now = Date.now();
  const ts  = (DISPATCH_TIMESTAMPS.get(projectId) || []).filter(t => now - t < DISPATCH_WINDOW_MS);
  DISPATCH_TIMESTAMPS.set(projectId, ts);
  if (ts.length >= DISPATCH_RATE_LIMIT) return true;
  ts.push(now);
  return false;
}

// ─── Buzon IA (ia.vilarkptl.com → FiscalAI relay shared mailbox) ─────────────
// When relay/buzon-ia.md in agentic-repo changes, relay-master mirrors it to
// DeCabeceraTax (ryby.lease) so FiscalAI can read messages from ia.vilarkptl.com
const BUZON_SRC  = path.join(__dirname, 'buzon-ia.md');
const BUZON_DEST = process.env.BUZON_DEST_PATH ||
  '/var/www/html/vilarkptl.com/DeCabeceraTax/relay/buzon-ia.md';
const BUZON_REPO   = process.env.BUZON_DEST_REPO   ||
  '/var/www/html/vilarkptl.com/DeCabeceraTax';
const BUZON_BRANCH = process.env.BUZON_DEST_BRANCH ||
  'claude/ml-backend-69bis-module-5iap0';
let   _buzonHash   = null;
// FiscalAI's reply file (DeCabeceraTax → read by ia.vilarkptl.com)
const BUZON_FISCALAI_SRC  = '/var/www/html/vilarkptl.com/DeCabeceraTax/relay/buzon-fiscalai.md';
const BUZON_FISCALAI_DEST = path.join(__dirname, 'buzon-fiscalai.md');
let   _buzonFiscalaiHash  = null;
// Load persisted buzon hashes from separate file (separate from HASHES_FILE so
// inbox saveHashes() calls don't wipe buzon state — that was the race condition).
try {
  const bh = JSON.parse(fs.readFileSync(BUZON_HASHES_FILE, 'utf8'));
  _buzonHash         = bh['ia']       || null;
  _buzonFiscalaiHash = bh['fiscalai'] || null;
} catch (_) {}

// ─── Logging (CST = America/Mexico_City) ──────────────────
function ts() {
  return new Intl.DateTimeFormat('sv', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date()).replace(',', '');
}
function log(project, msg) {
  const tag = project ? `[${project}]` : '[master]';
  console.log(`${ts()} ${tag} ${msg}`);
}

// ─── Telegram ─────────────────────────────────────────────
function tg(text) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const payload = String(text).slice(0, 4096);
  for (const chatId of [CHAT_ID, ...EXTRA_CHAT_IDS]) {
    const body = JSON.stringify({ chat_id: chatId, text: payload, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${BOT_TOKEN}/sendMessage`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json' },
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  }
}

// ─── Proposals store (Telegram /tarea workflow) ───────────
// proposalId → {id, projects:[{id,name,inbox}], description, plan, imageContext}
const PROPOSALS = new Map();

// Send message with inline keyboard (for proposals)
function tgWithKeyboard(text, inlineKeyboard) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const body = JSON.stringify({
    chat_id:      CHAT_ID,
    text:         String(text).slice(0, 4096),
    parse_mode:   'HTML',
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
  const req = https.request({
    hostname: 'api.telegram.org',
    path:     `/bot${BOT_TOKEN}/sendMessage`,
    method:   'POST',
    headers:  { 'Content-Type': 'application/json' },
  });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

function tgEditMessage(messageId, text) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const body = JSON.stringify({
    chat_id:    CHAT_ID,
    message_id: messageId,
    text:       String(text).slice(0, 4096),
    parse_mode: 'HTML',
  });
  const req = https.request({
    hostname: 'api.telegram.org',
    path:     `/bot${BOT_TOKEN}/editMessageText`,
    method:   'POST',
    headers:  { 'Content-Type': 'application/json' },
  });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

function tgAnswerCallback(callbackId) {
  if (!BOT_TOKEN) return;
  const body = JSON.stringify({ callback_query_id: callbackId });
  const req  = https.request({
    hostname: 'api.telegram.org',
    path:     `/bot${BOT_TOKEN}/answerCallbackQuery`,
    method:   'POST',
    headers:  { 'Content-Type': 'application/json' },
  });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

// Register command list with Telegram (shows autocomplete in chat)
function registerBotCommands() {
  if (!BOT_TOKEN) return;
  const commands = [
    { command: 'dispatch',  description: 'Despacha directamente sin plan — /dispatch [proyecto] [desc]' },
    { command: 'tarea',     description: 'Propone plan y despacha tarea — /tarea [proyecto] [descripción]' },
    { command: 'gh',        description: 'GitHub: repos, branches, issues — /gh [repo|branch|dispatch|issue|repos]' },
    { command: 'backlog',   description: 'Ver tareas pendientes compartidas' },
    { command: 'claim',     description: 'Tomar tarea del backlog — /claim [ID] [proyecto]' },
    { command: 'schedule',  description: 'Tareas programadas — /schedule [list|add|del]' },
    { command: 'status',    description: 'Tareas corriendo en este momento' },
    { command: 'resumen',   description: 'Resumen de proyectos — /resumen [id?]' },
    { command: 'detente',   description: 'Detiene tareas activas — /detente [id?]' },
    { command: 'activar',   description: 'Reactiva un agente detenido — /activar [id]' },
    { command: 'memoria',   description: 'Agrega nota a la memoria del agente — /memoria [id] [nota]' },
    { command: 'plan',      description: 'Ver plan activo del proyecto — /plan [id?]' },
    { command: 'limite',    description: 'Cambiar límite de gasto — /limite [proveedor] [usd]' },
    { command: 'reanudar',  description: 'Reanudar relay si está pausado por kill-switch' },
    { command: 'comandos',  description: 'Lista todos los comandos disponibles' },
    { command: 'ayuda',     description: 'Lista todos los comandos disponibles' },
  ];
  const body = JSON.stringify({ commands });
  const req  = https.request({
    hostname: 'api.telegram.org',
    path:     `/bot${BOT_TOKEN}/setMyCommands`,
    method:   'POST',
    headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      try {
        const j = JSON.parse(data);
        if (j.ok) log(null, '[tg] Comandos registrados en BotFather');
        else log(null, `[tg] setMyCommands error: ${j.description}`);
      } catch (_) {}
    });
  });
  req.on('error', () => {});
  req.write(body);
  req.end();
}

// ─── Telegram: recibir comandos (getUpdates polling) ──────
let _tgOffset = 0;

function pollTelegramCommands() {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const req = https.request({
    hostname: 'api.telegram.org',
    path:     `/bot${BOT_TOKEN}/getUpdates?offset=${_tgOffset}&timeout=0`,
    method:   'GET',
  }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (!json.ok || !json.result.length) return;
        for (const upd of json.result) {
          _tgOffset = Math.max(_tgOffset, upd.update_id + 1);
          const cb = upd.callback_query;
          if (cb) { handleCallbackQuery(cb); continue; }
          const msg = upd.message;
          if (!msg || String(msg.chat.id) !== String(CHAT_ID)) continue;
          if (msg.photo && msg.photo.length) {
            downloadTelegramPhoto(msg);
          } else {
            handleTelegramCommand(msg.text || '', null);
          }
        }
      } catch (_) {}
    });
  });
  req.on('error', () => {});
  req.end();
}

// Download photo from Telegram, then pass it to handleTelegramCommand
function downloadTelegramPhoto(msg) {
  const photoId = msg.photo[msg.photo.length - 1].file_id;
  const caption = (msg.caption || '').trim();
  // getFile to resolve the file_path
  const req = https.request({
    hostname: 'api.telegram.org',
    path:     `/bot${BOT_TOKEN}/getFile?file_id=${photoId}`,
    method:   'GET',
  }, res => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      try {
        const info = JSON.parse(body);
        if (!info.ok || !info.result.file_path) return;
        const filePath = info.result.file_path;
        const localPath = `/tmp/relay-img-${photoId.slice(0,12)}.jpg`;
        const dest = fs.createWriteStream(localPath);
        https.get(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`, dl => {
          dl.pipe(dest);
          dest.on('finish', () => {
            const imageCtx = `[Imagen adjunta: ${localPath}]`;
            if (caption) {
              handleTelegramCommand(caption, imageCtx);
            } else {
              tg(`📷 Imagen guardada en <code>${localPath}</code>\nEscribe un comando con la imagen para usarla, ej:\n<code>/tarea fiscalai [descripción]</code>\n\nO reenvíala con caption.`);
            }
          });
        }).on('error', () => {});
      } catch (_) {}
    });
  });
  req.on('error', () => {});
  req.end();
}

async function handleTelegramCommand(text, imageContext) {
  const raw = text.trim();
  const lower = raw.toLowerCase();

  if (lower === '/status' || lower === '/estado') {
    const running = [...ACTIVE_TASKS];
    const lines = running.length
      ? running.map(id => {
          const min = Math.round((Date.now() - (TASK_START_TIMES[id] || Date.now())) / 60000);
          return `  🔄 ${id} — ${min} min`;
        })
      : ['  ✅ Sin tareas en ejecución'];
    tg(`📊 <b>Estado — relay-master</b>\n${lines.join('\n')}`);
    return;
  }

  if (lower.startsWith('/resumen')) {
    const projectId = raw.split(/\s+/)[1] || null;
    sendResumen(projectId);
    return;
  }

  if (lower.startsWith('/parar')) {
    const id = raw.split(/\s+/)[1];
    if (!id) { tg('❓ Uso: /parar [project-id]'); return; }
    const j = loadJournal(id); j.state = 'stopped'; saveJournal(id, j);
    tg(`🛑 <b>${id}</b> detenido manualmente.\nUsa /activar ${id} para reanudar.`);
    return;
  }

  // /limite [proveedor|total] [valor_usd]  — cambia umbral de kill-switch
  if (lower.startsWith('/limite')) {
    const parts    = raw.trim().split(/\s+/);
    const provider = parts[1]?.toLowerCase();
    const value    = parseFloat(parts[2]);
    if (!provider || isNaN(value) || value < 0) {
      tg('❓ Uso: <code>/limite [proveedor] [usd]</code>\nEjemplo: <code>/limite total 15</code> o <code>/limite anthropic 10</code>\nProveedores: total, anthropic, openai, deepseek, fal, elevenlabs');
      return;
    }
    // Actualizar en DB via API del backend
    const postData = JSON.stringify({ provider, threshold_usd: value, kill_enabled: 1 });
    const req = http.request({
      hostname: '127.0.0.1', port: 3010, path: '/api/apiAdmin/threshold',
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => {
      res.resume();
      // También limpiar kill si el nuevo límite es mayor al gasto actual
      if (provider === 'total' || provider === 'anthropic') {
        GLOBAL_KILLED = false; GLOBAL_KILL_TS = null; GLOBAL_KILL_MSG = '';
        // Resetear en DB también
        http.request({ hostname: '127.0.0.1', port: 3010, path: '/api/platform/resume', method: 'POST' }, r => r.resume()).end();
        http.request({ hostname: '127.0.0.1', port: 3010, path: '/api/apiAdmin/resume', method: 'POST' }, r => r.resume()).end();
      }
      PROVIDER_LAST_ALERT[provider] = 0; // reset cooldown para este proveedor
      tg(`✅ <b>Límite actualizado — ${provider}</b>\nNuevo umbral: <b>$${value.toFixed(2)}/día</b>${(provider === 'total' || provider === 'anthropic') ? '\nKill-switch reseteado.' : ''}`);
    });
    req.on('error', e => tg(`❌ Error actualizando límite: ${e.message}`));
    req.write(postData);
    req.end();
    return;
  }

  // /reanudar — resume el relay si está pausado por kill-switch
  if (lower === '/reanudar' || lower === '/resume') {
    GLOBAL_KILLED = false; GLOBAL_KILL_TS = null; GLOBAL_KILL_MSG = '';
    http.request({ hostname: '127.0.0.1', port: 3010, path: '/api/platform/resume', method: 'POST' }, r => r.resume()).end();
    http.request({ hostname: '127.0.0.1', port: 3010, path: '/api/apiAdmin/resume', method: 'POST' }, r => r.resume()).end();
    tg('✅ <b>Sistema reanudado</b> desde Telegram.\nEl relay procesará nuevas tareas normalmente.');
    return;
  }

  if (lower.startsWith('/activar')) {
    const id = raw.split(/\s+/)[1];
    if (!id) { tg('❓ Uso: /activar [project-id]'); return; }
    const j = loadJournal(id); j.state = 'active'; j.consecutive_failures = 0; saveJournal(id, j);
    tg(`✅ <b>${id}</b> reactivado.`);
    return;
  }

  if (lower.startsWith('/dispatch')) {
    const parts     = raw.split(/\s+/);
    const projectId = parts[1] || '';
    const task      = parts.slice(2).join(' ').trim();

    let allProjects = [];
    try { allProjects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); } catch (_) {}

    if (!projectId || !task) {
      const avail = allProjects.filter(p => p.active && p.inbox).map(p => `<code>${p.id}</code>`).join(', ');
      tg(`❓ Uso: /dispatch [proyecto] [descripción]\nDespacha directamente sin plan previo.\nProyectos: ${avail}`);
      return;
    }

    const project = allProjects.find(p => p.active && p.inbox &&
      (p.id === projectId || p.id.startsWith(projectId)));
    if (!project) {
      const avail = allProjects.filter(p => p.active).map(p => p.id).join(', ');
      tg(`❌ Proyecto no encontrado: <code>${projectId}</code>\nActivos: ${avail}`);
      return;
    }

    try {
      const inboxContent =
        `# Tarea despachada via Telegram\n\n${task}\n\n` +
        `_Despachada directamente — ${new Date().toISOString()}_\n`;
      fs.writeFileSync(project.inbox, inboxContent, 'utf8');
      gitCommitFile(project.inbox, `dispatch: telegram→${projectId} — ${task.slice(0, 60)}`);
      tg(`✅ <b>Despachado a ${project.name || projectId}</b>\n<i>${task.slice(0, 200)}</i>\n\nRelay procesará en ~15s.`);
    } catch (err) {
      tg(`❌ Error al despachar: <code>${err.message.slice(0, 300)}</code>`);
    }
    return;
  }

  if (lower.startsWith('/tarea') || lower.startsWith('/task')) {
    const parts        = raw.split(/\s+/);
    const projectsArg  = parts[1] || '';
    const description  = parts.slice(2).join(' ').trim();
    if (!projectsArg || !description) {
      tg('❓ Uso: /tarea [proyecto|p1,p2,...] [descripción]\nEjemplo: /tarea fiscalai,fiscalai-front Mejora el PDF');
      return;
    }
    let allProjects = [];
    try { allProjects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); } catch (_) {}

    // Support comma-separated project IDs
    const ids     = projectsArg.split(',').map(s => s.trim());
    const targets = ids.map(id =>
      allProjects.find(p =>
        p.active && p.inbox && (
          p.id === id || p.id.startsWith(id) ||
          p.name.toLowerCase().includes(id.toLowerCase())
        )
      )
    ).filter(Boolean);

    if (!targets.length) {
      const avail = allProjects.filter(p => p.active).map(p => p.id).join(', ');
      tg(`❓ Ningún proyecto encontrado: <code>${projectsArg}</code>\nActivos: ${avail}`);
      return;
    }

    const namesList = targets.map(t => t.name).join(', ');
    const imageNote = imageContext ? `\n${imageContext}` : '';

    const pid = crypto.randomUUID().slice(0, 8);
    const words = description.split(/\s+/).slice(0, 12).join(' ');
    const localPlan =
      `• Analizar código existente relacionado con: "${words}…"\n` +
      `• Identificar archivos y componentes a modificar\n` +
      `• Implementar los cambios requeridos\n` +
      `• Verificar que la implementación funciona\n` +
      `• Hacer commit y push`;

    const planSystemPrompt =
      'Eres un asistente técnico. El usuario despacha tareas a agentes de código. ' +
      'Dado el proyecto y la descripción, genera un plan de implementación conciso en 3-5 bullets. ' +
      'Cada bullet empieza con •. Sin encabezados, sin markdown extra, solo los bullets.';
    const planUserMsg = `Proyecto: ${namesList}\nTarea: ${description}`;

    // Generate plan via DeepSeek V4-Pro (complex reasoning); fall back to local template if unavailable
    const dsResult = await callDeepSeekDirect(planSystemPrompt, planUserMsg, 300, true);
    const plan = (dsResult && dsResult.trim()) ? dsResult.trim() : localPlan;

    PROPOSALS.set(pid, {
      id: pid,
      projects: targets.map(t => ({ id: t.id, name: t.name })),
      description,
      plan,
      imageContext: imageContext || null,
    });
    const header = targets.length > 1
      ? `📋 <b>Plan para ${namesList}</b>`
      : `📋 <b>Plan para ${targets[0].name}</b>`;
    tgWithKeyboard(
      `${header}\n\n${plan}\n\n<i>${description}</i>${imageNote}`,
      [[
        { text: `✅ Ejecutar (${targets.length})`, callback_data: `approve_${pid}` },
        { text: '❌ Cancelar',                     callback_data: `cancel_${pid}` },
      ]]
    );
    return;
  }

  if (lower.startsWith('/detente') || lower.startsWith('/para')) {
    const id = raw.split(/\s+/)[1];
    if (!id) {
      const running = [...ACTIVE_TASKS];
      running.forEach(projId => {
        const j = loadJournal(projId); j.state = 'stopped'; saveJournal(projId, j);
      });
      tg(`🛑 Señal de parada enviada a ${running.length || 0} tarea(s) activa(s).\nUsa /activar [id] para reanudar.`);
      return;
    }
    const j = loadJournal(id); j.state = 'stopped'; saveJournal(id, j);
    tg(`🛑 <b>${id}</b> marcado para detenerse.\nUsa /activar ${id} para reanudar.`);
    return;
  }

  if (lower === '/ayuda' || lower === '/help' || lower === '/comandos' || lower === '/start') {
    tg(`🤖 <b>Comandos del agente relay</b>

<b>Tareas</b>
/dispatch [proyecto] [descripción] — despacha directo (sin plan previo)
/tarea [proyecto] [descripción] — propone plan y despacha tarea
  • Acepta varios proyectos separados por coma: <code>fiscalai,fiscalai-front</code>
  • También puedes adjuntar una imagen con caption
  Ej: <code>/tarea fiscalai Corrige el login SAT</code>

/detente — detiene todas las tareas activas
/detente [id] — detiene un agente específico
/activar [id] — reactiva un agente detenido

<b>Estado</b>
/status — tareas corriendo en este momento
/resumen — resumen de todos los proyectos
/resumen [id] — resumen de un proyecto

<b>Memoria</b>
/memoria [id] [nota] — agrega nota permanente a la memoria del agente
  Ej: <code>/memoria fiscalai La clave SAT expira en mayo</code>

<b>Ayuda</b>
/comandos — esta lista
/ayuda — esta lista`);
    return;
  }

  if (lower.startsWith('/memoria')) {
    const parts = raw.split(/\s+/);
    const projArg = parts[1] || '';
    const note    = parts.slice(2).join(' ').trim();
    if (!projArg || !note) {
      tg('❓ Uso: /memoria [project-id] [nota]\nEjemplo: /memoria fiscalai La clave SAT expira en mayo');
      return;
    }
    let allProjects = [];
    try { allProjects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); } catch (_) {}
    const proj = allProjects.find(p => p.active && (p.id === projArg || p.name?.toLowerCase().includes(projArg.toLowerCase())));
    if (!proj || !proj.repo) {
      tg(`❓ Proyecto <b>${esc(projArg)}</b> no encontrado o sin repo configurado.`);
      return;
    }
    const memPath = path.join(proj.repo, 'relay', 'agent-memory.md');
    const ts = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour12: false });
    const entry = `\n## [${ts} CST — nota manual]\n- 📌 ${note.slice(0, 500)}\n`;
    try {
      fs.mkdirSync(path.dirname(memPath), { recursive: true });
      fs.appendFileSync(memPath, entry);
      tg(`📌 Nota guardada en memoria de <b>${esc(proj.name)}</b>:\n<code>${esc(note.slice(0, 300))}</code>`);
      // Push to git (best effort)
      if (proj.branch) {
        try {
          execSync(
            `cd ${proj.repo} && git add relay/agent-memory.md && git diff --cached --quiet || git commit -m "relay: nota manual de memoria" --quiet && git push origin ${proj.branch} --quiet`,
            { stdio: 'pipe', timeout: 30000 }
          );
        } catch (_) {}
      }
    } catch (e) {
      tg(`❌ Error guardando nota: <code>${esc(e.message?.slice(0,200))}</code>`);
    }
    return;
  }

  if (lower.startsWith('/plan')) {
    const projectId = raw.split(/\s+/)[1] || null;
    const WORKSPACE = path.join(__dirname, 'workspaces');
    if (projectId) {
      const planPath = path.join(WORKSPACE, projectId, 'plan.md');
      try {
        const content = fs.readFileSync(planPath, 'utf8').trim();
        tg(`📋 <b>Plan — ${projectId}</b>\n\n<code>${esc(content.slice(0, 3000))}</code>`);
      } catch (_) {
        tg(`❌ No hay plan.md para <b>${projectId}</b>\nRuta esperada: <code>relay/workspaces/${projectId}/plan.md</code>`);
      }
    } else {
      let lines = [];
      try {
        const dirs = fs.readdirSync(WORKSPACE).filter(d => {
          try { return fs.statSync(path.join(WORKSPACE, d)).isDirectory(); } catch (_) { return false; }
        });
        for (const d of dirs) {
          try {
            const content = fs.readFileSync(path.join(WORKSPACE, d, 'plan.md'), 'utf8');
            const objetivo = content.match(/## Objetivo actual\n([\s\S]*?)(?=\n##|$)/)?.[1]?.trim() || '(sin objetivo)';
            lines.push(`<b>${d}</b>: ${esc(objetivo.replace(/^<!--.*?-->\n?/gm, '').trim().slice(0, 80))}`);
          } catch (_) {}
        }
      } catch (_) {}
      tg(`📋 <b>Planes de proyecto</b>\n\n${lines.join('\n') || 'Sin planes configurados'}\n\nVer plan completo: <code>/plan [proyecto]</code>`);
    }
    return;
  }

  // ── /gh — GitHub operations ────────────────────────────────
  if (lower.startsWith('/gh')) {
    const parts = raw.trim().split(/\s+/);
    const sub   = (parts[1] || '').toLowerCase();

    if (!GITHUB_TOKEN) { tg('❌ GITHUB_TOKEN no configurado en relay/.env'); return; }

    if (sub === 'repos') {
      try {
        const repos = await ghListRepos();
        const lines = repos.slice(0, 20).map(r =>
          `  • <code>${r.name}</code> ${r.private ? '🔒' : '🌐'}${r.description ? ' — ' + r.description.slice(0, 40) : ''}`
        ).join('\n');
        tg(`📦 <b>Repos — ${GITHUB_ORG}</b>\n${lines || 'Sin repos'}`);
      } catch (e) { tg(`❌ GitHub: ${e.message}`); }
      return;
    }

    if (sub === 'repo') {
      // /gh repo <nombre> [private|public]
      // Crea el repo en GitHub y despacha al coordinator para registrarlo y configurarlo.
      const name    = parts[2];
      const privacy = !parts.slice(3).includes('public');
      if (!name) { tg('❓ Uso: /gh repo &lt;nombre&gt; [private|public]\nEl coordinator registra y configura el proyecto automáticamente.'); return; }
      try {
        const repo = await ghCreateRepo(name, privacy);
        tg(`✅ <b>Repo creado</b>\n<code>${GITHUB_ORG}/${repo.name}</code>\n🔗 ${repo.html_url}\n\n⚙️ Despachando al coordinator para registrar y configurar el proyecto...`);

        // Dispatch to coordinator — it edits projects.json, creates workspace, sets up inbox/outbox
        const coordinatorTask =
          `# Registrar nuevo proyecto: ${name}\n\n` +
          `Se acaba de crear el repositorio GitHub: ${repo.html_url}\n\n` +
          `## Pasos requeridos\n\n` +
          `1. Edita \`relay/projects.json\` y agrega el nuevo proyecto con esta estructura:\n` +
          `   - id: "${name}"\n` +
          `   - name: "${name}"\n` +
          `   - runner: "claude"\n` +
          `   - active: true\n` +
          `   - branch: "main"\n` +
          `   - github: "${repo.html_url}"\n` +
          `   - repo: "/var/www/html/vilarkptl.com/${name}" (o la ruta que corresponda)\n` +
          `   - inbox: ruta absoluta al archivo inbox del proyecto\n` +
          `   - outbox: ruta absoluta al archivo outbox del proyecto\n\n` +
          `2. Clona el repositorio en el servidor si la ruta de \`repo\` no existe:\n` +
          `   \`git clone ${repo.clone_url} /var/www/html/vilarkptl.com/${name}\`\n\n` +
          `3. Crea los archivos inbox y outbox vacíos en la ruta configurada.\n\n` +
          `4. Haz commit y push de \`relay/projects.json\`.\n\n` +
          `5. Responde con STATUS: done y la ruta final configurada.\n`;

        const allProjects = (() => { try { return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); } catch (_) { return []; } })();
        const coordinator  = allProjects.find(p => p.active && p.id === 'coordinator' && p.inbox);
        if (coordinator) {
          fs.writeFileSync(coordinator.inbox, coordinatorTask, 'utf8');
          gitCommitFile(coordinator.inbox, `dispatch: gh-repo→coordinator — registrar ${name}`);
          tg(`📋 <b>Coordinator notificado</b> — configurará el proyecto ${name} en ~15s.`);
        } else {
          tg(`⚠️ Coordinator no disponible. Registra manualmente en projects.json:\n<code>id: "${name}", github: "${repo.html_url}"</code>`);
        }
      } catch (e) { tg(`❌ GitHub: ${e.message}`); }
      return;
    }

    if (sub === 'branch') {
      const repo   = parts[2];
      const branch = parts[3];
      const from   = parts[4] || 'main';
      if (!repo || !branch) { tg('❓ Uso: /gh branch &lt;repo&gt; &lt;branch&gt; [from]'); return; }
      try {
        await ghCreateBranch(repo, branch, from);
        tg(`✅ <b>Branch creado</b>\n<code>${GITHUB_ORG}/${repo}@${branch}</code> (desde <code>${from}</code>)`);
      } catch (e) { tg(`❌ GitHub: ${e.message}`); }
      return;
    }

    if (sub === 'dispatch') {
      // /gh dispatch <agent> <task...>  — crea issue con labels relay:inbox + agent:<id>
      const agentId = parts[2];
      const task    = parts.slice(3).join(' ').trim();
      if (!agentId || !task) { tg('❓ Uso: /gh dispatch &lt;agente&gt; &lt;descripción&gt;'); return; }
      try {
        const issue = await ghCreateIssue(
          GITHUB_REPO_MAIN,
          `[${agentId}] ${task.slice(0, 80)}`,
          `${task}\n\n---\n_Despachado via Telegram — ${new Date().toISOString()}_`,
          ['relay:inbox', `agent:${agentId}`]
        );
        tg(`✅ <b>Issue #${issue.number} creado</b>\n<code>${agentId}</code> lo procesará en el próximo ciclo.\n🔗 ${issue.html_url}`);
      } catch (e) { tg(`❌ GitHub: ${e.message}`); }
      return;
    }

    if (sub === 'issue') {
      // /gh issue <repo> <title> :: <body>
      const repo = parts[2];
      const rest = parts.slice(3).join(' ');
      const [issueTitle, issueBodyPart] = rest.split('::').map(s => s.trim());
      if (!repo || !issueTitle) { tg('❓ Uso: /gh issue &lt;repo&gt; &lt;título&gt; :: &lt;cuerpo&gt;'); return; }
      try {
        const issue = await ghCreateIssue(repo, issueTitle, issueBodyPart || '');
        tg(`✅ <b>Issue #${issue.number}</b> en <code>${repo}</code>\n🔗 ${issue.html_url}`);
      } catch (e) { tg(`❌ GitHub: ${e.message}`); }
      return;
    }

    tg(`📦 <b>Comandos GitHub (/gh)</b>\n\n/gh repos — listar repos\n/gh repo &lt;nombre&gt; [private|public] — crear repo\n/gh branch &lt;repo&gt; &lt;branch&gt; [from] — crear branch\n/gh dispatch &lt;agente&gt; &lt;tarea&gt; — buzón vía issue de GitHub\n/gh issue &lt;repo&gt; &lt;título&gt; :: &lt;cuerpo&gt; — issue libre`);
    return;
  }


  // ── /addproject — registrar nuevo proyecto en projects.json ─
  // Uso: /addproject id nombre url [github=owner/repo] [repo=/ruta] [branch=main] [mode=full-claude-code] [model=claude-sonnet-4-6]
  if (lower.startsWith('/addproject')) {
    const parts  = raw.trim().split(/\s+/);
    const projId = parts[1];
    const name   = parts[2];
    const url    = parts[3];

    if (!projId || !name) {
      tg(`❓ <b>Uso:</b> <code>/addproject id nombre url [opciones]</code>

<b>Opciones:</b>
  <code>github=owner/repo</code>
  <code>repo=/ruta/en/servidor</code>
  <code>branch=main</code>
  <code>mode=full-claude-code|plan-execute|deepseek-agent|llm-direct</code>
  <code>model=claude-sonnet-4-6</code>

<b>Ejemplo:</b>
<code>/addproject pill-ai "Pill AI" https://pill.ai github=vilarkptl-lang/pill.ai repo=/var/www/html/vilarkptl.com/pill-ai branch=main</code>`);
      return;
    }

    // Parse key=value options
    const opts = {};
    for (const p of parts.slice(4)) {
      const eq = p.indexOf('=');
      if (eq > 0) opts[p.slice(0, eq)] = p.slice(eq + 1);
    }

    const repoPath = opts.repo || '';
    const branch   = opts.branch || 'main';
    const mode     = opts.mode   || 'full-claude-code';
    const github   = opts.github || '';
    const model    = opts.model  || 'claude-sonnet-4-6';

    // Auto-derive inbox/outbox from repo path
    const inbox  = repoPath ? path.join(repoPath, 'relay', `inbox-${projId}.md`)  : '';
    const outbox = repoPath ? path.join(repoPath, 'relay', `outbox-${projId}.md`) : '';

    // Check for duplicate ID
    let allProjects = [];
    try { allProjects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); } catch (_) {}
    if (allProjects.find(p => p.id === projId)) {
      tg(`❌ Ya existe un proyecto con id <code>${esc(projId)}</code>.\nUsa un id diferente o edita <code>relay/projects.json</code> manualmente.`);
      return;
    }

    const newProject = {
      id:           projId,
      name,
      mode,
      ignore_quiet_hours: false,
      claude_model:       model,
      claude_model_fast:  'claude-haiku-4-5-20251001',
      use_cli_proxy:      false,
      inbox,
      outbox,
      repo:   repoPath,
      branch,
      github,
      url:    url || '',
      active: true,
    };

    // Remove empty fields to keep JSON clean
    for (const k of Object.keys(newProject)) {
      if (newProject[k] === '' || newProject[k] === null) delete newProject[k];
    }

    allProjects.push(newProject);
    try {
      fs.writeFileSync(PROJECTS_FILE, JSON.stringify(allProjects, null, 2) + '\n', 'utf8');
    } catch (e) {
      tg(`❌ Error escribiendo projects.json: <code>${esc(e.message.slice(0,200))}</code>`);
      return;
    }

    // Create inbox/outbox files if repo exists
    if (repoPath && fs.existsSync(repoPath)) {
      try {
        const relayDir = path.join(repoPath, 'relay');
        fs.mkdirSync(relayDir, { recursive: true });
        if (inbox  && !fs.existsSync(inbox))  fs.writeFileSync(inbox,  '', 'utf8');
        if (outbox && !fs.existsSync(outbox)) fs.writeFileSync(outbox, '', 'utf8');
      } catch (_) {}
    }

    // Commit and push projects.json
    gitCommitFile(PROJECTS_FILE, `relay: addproject — ${projId} (${mode})`);

    const summary = [
      `✅ <b>Proyecto registrado: ${esc(name)}</b>`,
      `<code>id:</code> <code>${esc(projId)}</code>`,
      `<code>mode:</code> <code>${esc(mode)}</code>`,
      `<code>model:</code> <code>${esc(model)}</code>`,
      url    ? `<code>url:</code> ${esc(url)}` : null,
      github ? `<code>github:</code> <code>${esc(github)}</code>` : null,
      repoPath ? `<code>repo:</code> <code>${esc(repoPath)}</code>` : null,
      inbox    ? `<code>inbox:</code> <code>${esc(inbox)}</code>` : null,
      `\n📋 El relay lo detectará en el próximo ciclo (~15s).`,
      `Si el repo no existe en el servidor, clónalo:\n<code>git clone &lt;url&gt; ${esc(repoPath || '/ruta/al/repo')}</code>`,
    ].filter(Boolean).join('\n');

    tg(summary);
    return;
  }

  // ── /backlog — ver y gestionar tareas pendientes ──────────
  if (lower === '/backlog' || lower === '/bl') {
    const tasks = loadBacklog();
    if (!tasks.length) { tg('📋 Backlog vacío.'); return; }
    const icon  = s => s === 'libre' ? '🟢' : s === 'tomada' ? '🟡' : '✅';
    const lines = tasks.map(t =>
      `  <b>${t.id}</b> [${t.proyecto}] ${icon(t.status)} ${t.desc.slice(0, 80)}`
    ).join('\n');
    tg(`📋 <b>Backlog compartido</b>\n${lines}\n\n<code>/claim &lt;ID&gt; [proyecto]</code> para tomar una tarea.`);
    return;
  }

  // ── /claim <id> [proyecto] — tomar tarea del backlog ─────
  if (lower.startsWith('/claim')) {
    const parts   = raw.split(/\s+/);
    const taskId  = (parts[1] || '').toUpperCase();
    const destId  = parts[2] || '';
    if (!taskId) { tg('❓ Uso: /claim &lt;ID&gt; [proyecto-destino]'); return; }
    const tasks = loadBacklog();
    const task  = tasks.find(t => t.id.toUpperCase() === taskId);
    if (!task)                { tg(`❌ Tarea <code>${taskId}</code> no encontrada en backlog.`); return; }
    if (task.status === 'tomada') { tg(`⚠️ Tarea <code>${taskId}</code> ya está tomada por <code>${task.proyecto}</code>.`); return; }

    let allProjects = [];
    try { allProjects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); } catch (_) {}
    const projectId = destId || task.proyecto;
    const project   = allProjects.find(p => p.active && p.id === projectId);
    if (!project) { tg(`❌ Proyecto <code>${projectId}</code> no encontrado.`); return; }

    task.status = 'tomada';
    saveBacklog(tasks);
    const taskContent = `# [Backlog ${task.id}] ${task.desc}\n\nTarea reclamada del backlog compartido.\n`;
    try {
      if (project.runner && project.runner !== 'claude') {
        runAgentByRunner(project, taskContent, (err) => {
          task.status = err ? 'libre' : 'done';
          saveBacklog(tasks);
        });
      } else {
        fs.writeFileSync(project.inbox,
          `# Tarea — Backlog ${task.id}\n\n${task.desc}\n\n_Reclamada via /claim — ${new Date().toISOString()}_\n`, 'utf8');
        gitCommitFile(project.inbox, `claim: backlog ${task.id} → ${projectId}`);
      }
      tg(`✅ <b>Backlog ${task.id} → ${projectId}</b>\n${task.desc.slice(0, 200)}`);
    } catch (e) {
      task.status = 'libre';
      saveBacklog(tasks);
      tg(`❌ Error al despachar backlog ${task.id}: ${e.message.slice(0, 200)}`);
    }
    return;
  }

  // ── /schedule — tareas programadas ───────────────────────
  if (lower.startsWith('/schedule')) {
    const parts = raw.trim().split(/\s+/);
    const sub   = (parts[1] || '').toLowerCase();

    if (sub === 'list' || sub === 'ls' || sub === '') {
      const entries = loadSchedule();
      if (!entries.length) { tg('📅 Sin tareas programadas.'); return; }
      const lines = entries.map(e =>
        `  <b>${e.id}</b> ${e.active ? '🟢' : '⏸'} ${e.time} MX → <code>${e.project}</code>\n  <i>${e.task.slice(0, 60)}</i>`
      ).join('\n\n');
      tg(`📅 <b>Tareas programadas</b>\n\n${lines}`);
      return;
    }

    if (sub === 'add') {
      // /schedule add <project> <HH:MM> <task...>
      const project = parts[2];
      const time    = parts[3];
      const task    = parts.slice(4).join(' ').trim();
      if (!project || !time || !task) {
        tg('❓ Uso: /schedule add &lt;proyecto&gt; &lt;HH:MM&gt; &lt;descripción&gt;\nEj: /schedule add coordinator 08:00 Genera reporte diario');
        return;
      }
      if (!/^\d{1,2}:\d{2}$/.test(time)) { tg('❌ Hora inválida — usar formato HH:MM (ej: 08:00)'); return; }
      const entries = loadSchedule();
      const newId   = `S${Date.now().toString().slice(-4)}`;
      entries.push({ id: newId, project, time, task, active: true, created: new Date().toISOString() });
      saveSchedule(entries);
      tg(`✅ <b>Tarea programada <code>${newId}</code></b>\n🕐 ${time} MX → <code>${project}</code>\n<i>${task.slice(0, 200)}</i>`);
      return;
    }

    if (sub === 'del' || sub === 'rm') {
      const delId   = (parts[2] || '').toUpperCase();
      const entries = loadSchedule();
      const idx     = entries.findIndex(e => e.id.toUpperCase() === delId);
      if (idx === -1) { tg(`❌ Tarea <code>${delId}</code> no encontrada.`); return; }
      entries.splice(idx, 1);
      saveSchedule(entries);
      tg(`✅ Tarea programada <code>${delId}</code> eliminada.`);
      return;
    }

    if (sub === 'pause' || sub === 'resume') {
      const schId   = (parts[2] || '').toUpperCase();
      const entries = loadSchedule();
      const entry   = entries.find(e => e.id.toUpperCase() === schId);
      if (!entry) { tg(`❌ Tarea <code>${schId}</code> no encontrada.`); return; }
      entry.active = sub === 'resume';
      saveSchedule(entries);
      tg(`${entry.active ? '▶️' : '⏸'} Tarea <code>${schId}</code> ${entry.active ? 'reanudada' : 'pausada'}.`);
      return;
    }

    tg('📅 <b>Scheduler</b>\n/schedule list — ver tareas\n/schedule add &lt;proyecto&gt; &lt;HH:MM&gt; &lt;tarea&gt;\n/schedule del &lt;ID&gt;\n/schedule pause/resume &lt;ID&gt;');
    return;
  }
}

function handleCallbackQuery(cb) {
  tgAnswerCallback(cb.id);
  const data  = cb.data || '';
  const msgId = cb.message && cb.message.message_id;

  if (data.startsWith('approve_')) {
    const pid      = data.slice(8);
    const proposal = PROPOSALS.get(pid);
    if (!proposal) {
      if (msgId) tgEditMessage(msgId, '❌ Propuesta expirada o ya procesada.');
      return;
    }
    PROPOSALS.delete(pid);
    const imageNote = proposal.imageContext
      ? `\n\n${proposal.imageContext}`
      : '';
    const taskBody = `# ${proposal.description}\n\n${proposal.plan}${imageNote}`;
    // Dispatch to all target projects
    for (const proj of proposal.projects) {
      postToMonitor('/api/relay/dispatch', {
        project:   proj.id,
        task:      taskBody,
        requester: 'telegram',
      });
      log(null, `[tg/tarea] Despachado: ${proj.id} — ${proposal.description}`);
    }
    const names = proposal.projects.map(p => p.name).join(', ');
    if (msgId) tgEditMessage(msgId,
      `✅ <b>Tarea despachada — ${names}</b>\n\n${proposal.description}`
    );
    return;
  }

  if (data.startsWith('cancel_')) {
    const pid = data.slice(7);
    PROPOSALS.delete(pid);
    if (msgId) tgEditMessage(msgId, '❌ Tarea cancelada.');
    return;
  }
}

function sendResumen(projectId) {
  let projects = [];
  try { projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); } catch (_) { return; }

  const targets = projectId
    ? projects.filter(p => p.id === projectId || p.id.includes(projectId.toLowerCase()))
    : projects.filter(p => p.active);

  if (!targets.length) { tg(`❓ Proyecto no encontrado: <code>${projectId}</code>`); return; }

  let msg = `📋 <b>Resumen de actividad</b> — ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}\n`;

  for (const project of targets) {
    const journal = loadJournal(project.id);
    if (!journal.total_tasks) continue;

    const stateIcon = ACTIVE_TASKS.has(project.id) ? '🔄' : journal.state === 'stopped' ? '🛑' : '🟢';
    const recent    = journal.recent_tasks.slice(0, 5);

    const taskLines = recent.map(t => {
      const icon = t.status === 'success' ? '✅' : '❌';
      const dur  = t.duration_sec ? ` (${Math.round(t.duration_sec)}s)` : '';
      const cost = t.result_summary ? ` — ${t.result_summary.slice(0, 60)}` : '';
      return `  ${icon} ${t.title.slice(0, 55)}${dur}${cost}`;
    }).join('\n');

    msg += `\n${stateIcon} <b>${project.name}</b>\n`;
    msg += `  📊 ${journal.total_tasks} tareas totales`;
    msg += ` | ✅×${journal.consecutive_successes} ❌×${journal.consecutive_failures}\n`;
    if (taskLines) msg += `<code>${taskLines}</code>\n`;
  }

  tg(msg.slice(0, 4096));
}


function tgPhoto(imagePath, caption) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const imgData = fs.readFileSync(imagePath);
    const boundary = '----RelayBoundary' + Date.now();
    const CRLF = '\r\n';
    const head =
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="chat_id"${CRLF}${CRLF}${CHAT_ID}${CRLF}` +
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="caption"${CRLF}${CRLF}${String(caption).slice(0,1024)}${CRLF}` +
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="photo"; filename="screenshot.png"${CRLF}` +
      `Content-Type: image/png${CRLF}${CRLF}`;
    const tail = `${CRLF}--${boundary}--${CRLF}`;
    const headBuf = Buffer.from(head);
    const tailBuf = Buffer.from(tail);
    const body = Buffer.concat([headBuf, imgData, tailBuf]);
    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${BOT_TOKEN}/sendPhoto`,
      method:   'POST',
      headers:  {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch (_) {}
}

// ─── Screenshot via Chromium headless ─────────────────────
const CHROMIUM_BIN = process.env.CHROMIUM_BIN ||
  [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
    '/usr/bin/google-chrome-stable',
  ].find(b => { try { return fs.existsSync(b); } catch(_){return false;} }) || '';

if (CHROMIUM_BIN) log(null, `Chromium: ${CHROMIUM_BIN}`);
else              log(null, 'Chromium no encontrado — screenshots desactivados');

function screenshot(url, outPath, callback) {
  if (!CHROMIUM_BIN || !url) return callback(null);
  const cmd = `${CHROMIUM_BIN} --headless --no-sandbox --disable-gpu ` +
    `--screenshot="${outPath}" --window-size=1280,800 "${url}" 2>/dev/null`;
  exec(cmd, { timeout: 90000 }, (err) => {
    if (err) { log(null, `Screenshot error para ${url}: ${err.message?.slice(0,100)}`); return callback(null); }
    callback(outPath);
  });
}

// ─── Monitor API ──────────────────────────────────────────
// Supports http:// and https:// — uses MONITOR_API env var (defaults to 127.0.0.1:3010)
function postToMonitor(apiPath, payload, monitorUrl) {
  try {
    const base   = monitorUrl || MONITOR_API;
    const parsed = new URL(base + apiPath);
    const isHttps = parsed.protocol === 'https:';
    const body   = JSON.stringify(payload);
    const mod    = isHttps ? require('https') : require('http');
    const req    = mod.request({
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + (parsed.search || ''),
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch (_) {}
}

function postEvent(payload, monitorUrl) {
  postToMonitor('/api/events', payload, monitorUrl);
}

function postAlert(alertType, projectId, severity, title, details, autoFixed = false) {
  postToMonitor('/api/alerts', { alert_type: alertType, project_id: projectId, severity, title, details, auto_fixed: autoFixed });
}

// Report a real (non-Max-subscription) API call cost to the dashboard.
// Claude CLI via Max subscription = $0; DeepSeek/Gemini/Grok = real charges.
function postProviderCost(provider, model, projectId, inputTokens, outputTokens, costUsd) {
  if (!costUsd || costUsd <= 0) return;
  postToMonitor('/api/provider-costs', { provider, model, project_id: projectId, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd });
}

// ─── Per-project kill-switch (migrate-v12 project_monthly_budget) ────────────
// Cache refreshed every 5 min by the kill-switch poller via /api/apiAdmin/projectBudgets.
// Avoids a DB query on every 15-second poll cycle.
const PROJECT_KILLED_CACHE = {};  // { projectId: { killed: bool, ts: number } }
const PROJECT_KILLED_TTL   = 5 * 60 * 1000;

function getProjectKilled(projectId) {
  const cached = PROJECT_KILLED_CACHE[projectId];
  if (cached && (Date.now() - cached.ts) < PROJECT_KILLED_TTL) return cached.killed;
  return false;  // safe default; async refresh happens in kill-switch poller
}

// ─── Anthropic API directo (Opción B — buzon bidireccional) ──────────────────
// Llama claude-haiku-4-5 via HTTPS nativo sin spawn Claude CLI.
// Usada cuando buzon-fiscalai.md cambia para responder directamente.
// Haiku es suficiente para ACKs/pre-responses del buzon; el trabajo real
// lo hace el coordinator dispatch (paso 2 en responderBuzonFiscalai).
// Prompt caching activo en system prompt para reducir costos en llamadas repetidas.
//
// CLI Proxy routing — Multi-account pool (1 Max + 4 Pro)
// CLAUDE_PROXY_MAX=http://127.0.0.1:5001  → coordinator + critical projects
// CLAUDE_PROXY_PRO_1..4=http://127.0.0.1:5002..5005  → round-robin for rest
// Legacy single-proxy: ANTHROPIC_PROXY_URL still works as fallback
const ANTHROPIC_PROXY_URL     = process.env.ANTHROPIC_PROXY_URL     || null;
const ANTHROPIC_PROXY_PROJECT = process.env.ANTHROPIC_PROXY_PROJECT || '';
const _PROXY_POOL = {
  max: process.env.CLAUDE_PROXY_MAX || null,
  pro: [
    process.env.CLAUDE_PROXY_PRO_1,
    process.env.CLAUDE_PROXY_PRO_2,
    process.env.CLAUDE_PROXY_PRO_3,
    process.env.CLAUDE_PROXY_PRO_4,
  ].filter(Boolean),
};
const _PROXY_MAX_PROJECTS = new Set(
  (process.env.CLAUDE_PROXY_MAX_PROJECTS || 'coordinator,fiscalai,fiscalai-front')
    .split(',').map(s => s.trim()).filter(Boolean)
);
let _proxyRRIdx = 0;
const _proxyAuthFailed = new Set(); // URLs of Pro proxies that returned auth errors
function selectProxyForProject(projectId) {
  if (_PROXY_POOL.max && _PROXY_MAX_PROJECTS.has(projectId)) return _PROXY_POOL.max;
  // Skip Pro proxies that have returned auth errors; fall back to Max when all fail
  const healthyPro = _PROXY_POOL.pro.filter(u => !_proxyAuthFailed.has(u));
  if (healthyPro.length) { const u=healthyPro[_proxyRRIdx%healthyPro.length]; _proxyRRIdx++; return u; }
  if (_PROXY_POOL.max) return _PROXY_POOL.max; // all Pro auth-failed → use Max
  if (ANTHROPIC_PROXY_URL && (!ANTHROPIC_PROXY_PROJECT || ANTHROPIC_PROXY_PROJECT===projectId)) return ANTHROPIC_PROXY_URL;
  return null;
}
// Pre-check Pro proxy auth on startup — avoids burning 4 tasks discovering dead proxies
// Assumes port mapping: 5002→claudepro1, 5003→claudepro2, 5004→claudepro3, 5005→claudepro4
setTimeout(() => {
  if (!_PROXY_POOL.pro.length) return;
  _PROXY_POOL.pro.forEach(proxyUrl => {
    try {
      const port = parseInt(new URL(proxyUrl).port || '80');
      const proIdx = port - 5001; // 5002→1, 5003→2, etc.
      if (proIdx < 1 || proIdx > 4) return;
      const userHome = `/home/claudepro${proIdx}`;
      const hasAuth = [`${userHome}/.claude/credentials`, `${userHome}/.claude/auth.json`]
        .some(f => { try { fs.accessSync(f); return true; } catch { return false; } });
      if (!hasAuth) {
        _proxyAuthFailed.add(proxyUrl);
        log('master', `[proxy-auth] Pre-blacklisted ${proxyUrl} — no credentials in ${userHome}/.claude/`);
      }
    } catch (_) {}
  });
  const healthy = _PROXY_POOL.pro.filter(u => !_proxyAuthFailed.has(u)).length;
  if (_PROXY_POOL.pro.length > 0 && healthy === 0 && _PROXY_POOL.max) {
    log('master', `[proxy-auth] Todos los Pro proxies sin auth → Max proxy usado para todos los proyectos`);
  }
}, 500);

function callAnthropicDirect(systemPrompt, userMessage, maxTokens = 512, projectId = null) {
  // Determine if this call should go through the local CLI proxy
  const _selectedProxy = selectProxyForProject(projectId || '');
  const useProxy = !!_selectedProxy;
  const _activeProxyUrl = _selectedProxy || ANTHROPIC_PROXY_URL;

  const timeoutMs = 90000;
  const apiCall = new Promise((resolve, reject) => {
    if (!ANTHROPIC_KEY && !useProxy) { reject(new Error('ANTHROPIC_API_KEY no configurado')); return; }
    const body = JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system:     [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages:   [{ role: 'user', content: userMessage }],
    });

    let hostname, port, isHttps;
    if (useProxy) {
      const parsed = new URL(_activeProxyUrl);
      hostname = parsed.hostname;
      port     = parseInt(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'));
      isHttps  = parsed.protocol === 'https:';
      log(projectId, `[anthropic-proxy] routing via ${_activeProxyUrl}`);
    } else {
      hostname = 'api.anthropic.com';
      port     = 443;
      isHttps  = true;
    }

    const transport = isHttps ? https : http;
    const req = transport.request({
      hostname,
      port,
      path:    '/v1/messages',
      method:  'POST',
      headers: {
        'x-api-key':         useProxy ? 'proxy-key' : ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
        'content-type':      'application/json',
        'content-length':    Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(`API error ${json.error.type}: ${json.error.message}`)); return; }
          if (!json.content || !json.content[0]) { reject(new Error('Respuesta API vacía')); return; }
          resolve(json.content[0].text);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout ${timeoutMs/1000}s — anthropic${useProxy ? '-proxy' : ''} no respondió`)), timeoutMs)
  );
  return Promise.race([apiCall, timeout]);
}

// Calls DeepSeek V4 via OpenAI-compatible API — used for /tarea planning and summaries.
// useComplex=true → V4-Pro (Sonnet-quality, 4-6x cheaper); false → V4-Flash (fast/cheap).
// Falls back gracefully (returns null) if no API key is configured.
//
// Caching: DeepSeek V4 supports explicit prefix caching via cache_control on system content
// blocks (same field name as Anthropic). The API also returns prompt_cache_hit_tokens so we
// log savings. Caching is also automatic for repeated prefixes, but explicit markers improve
// hit rate across different user prompts that share the same system context.
function callDeepSeekDirect(systemPrompt, userMessage, maxTokens = 512, useComplex = false) {
  const timeoutMs = 20000;
  const model = useComplex
    ? (process.env.DEEPSEEK_PRO_MODEL   || 'deepseek-chat')
    : (process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-chat');
  const apiCall = new Promise((resolve, reject) => {
    if (!DEEPSEEK_KEY) { reject(new Error('DEEPSEEK_API_KEY no configurado')); return; }
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        {
          role:    'system',
          content: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        },
        { role: 'user', content: userMessage },
      ],
    });
    const req = https.request({
      hostname: 'api.deepseek.com',
      path:     '/v1/chat/completions',
      method:   'POST',
      headers: {
        'Authorization':  `Bearer ${DEEPSEEK_KEY}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        // Explicit prompt-caching beta header (mirrors Anthropic pattern; ignored if not supported)
        'x-deepseek-cache-policy': 'ephemeral',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(`DeepSeek error: ${json.error.message}`)); return; }
          const usage = json.usage ?? {};
          const hitTok  = usage.prompt_cache_hit_tokens  ?? 0;
          const missTok = usage.prompt_cache_miss_tokens ?? 0;
          const totalIn = usage.prompt_tokens ?? 0;
          log(null,
            `[deepseek/${model}] in=${totalIn} out=${usage.completion_tokens ?? 0} ` +
            `cache_hit=${hitTok} cache_miss=${missTok} (${hitTok ? Math.round(hitTok / totalIn * 100) : 0}% hit)`
          );
          resolve(json.choices?.[0]?.message?.content || null);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout ${timeoutMs/1000}s — api.deepseek.com`)), timeoutMs)
  );
  return Promise.race([apiCall, timeout]).catch(e => {
    log(null, `[deepseek] error: ${e.message?.slice(0, 100)}`);
    return null;
  });
}

// ─── DeepSeek tool-calling API (OpenAI-compat) ───────────
// Used by runDeepSeekAgent for agentic tool-calling loops.
function callDeepSeekWithTools(systemPrompt, messages, tools, model, maxTokens = 4096) {
  const timeoutMs = 90000;
  return new Promise((resolve, reject) => {
    if (!DEEPSEEK_KEY) { reject(new Error('DEEPSEEK_API_KEY no configurado')); return; }
    const body = JSON.stringify({
      model: model || process.env.DEEPSEEK_PRO_MODEL || 'deepseek-chat',
      max_tokens: maxTokens,
      tools,
      tool_choice: 'auto',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });
    const req = https.request({
      hostname: 'api.deepseek.com',
      path:     '/v1/chat/completions',
      method:   'POST',
      headers: {
        'Authorization':  `Bearer ${DEEPSEEK_KEY}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(`DeepSeek: ${json.error.message?.slice(0, 200)}`)); return; }
          resolve(json);
        } catch (e) { reject(new Error(`DeepSeek parse: ${data.slice(0, 200)}`)); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout — api.deepseek.com')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
// ── Grok (xAI) tool-calling API  ─────────────────────────────
// ─────────────────────────────────────────────────────────────
function callGrokWithTools(systemPrompt, messages, tools, model, maxTokens = 4096) {
  return new Promise((resolve, reject) => {
    if (!XAI_KEY) { reject(new Error('XAI_API_KEY no configurado')); return; }
    const body = JSON.stringify({
      model: model || 'grok-3-mini',
      max_tokens: maxTokens,
      tools,
      tool_choice: 'auto',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });
    const req = https.request({
      hostname: 'api.x.ai',
      path:     '/v1/chat/completions',
      method:   'POST',
      headers: {
        'Authorization':  `Bearer ${XAI_KEY}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(`Grok: ${json.error.message?.slice(0, 200)}`)); return; }
          resolve(json);
        } catch (e) { reject(new Error(`Grok parse: ${data.slice(0, 200)}`)); }
      });
    });
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Timeout — api.x.ai')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runGrokAgent(project, taskContent, callback, dispatchMeta = {}) {
  if (ACTIVE_TASKS.has(project.id)) { callback(new Error('Already running')); return; }
  ACTIVE_TASKS.add(project.id);

  const startTime = Date.now();
  const repoBase  = project.repo || '/var/www/html';
  const MAX_TURNS = 20;
  const TOOL_TIMEOUT_MS = 45000;
  const BASH_DENY = /rm\s+-rf\s+\/(?!tmp|var\/www\/html\/vilarkptl|home)|DROP\s+TABLE\s|TRUNCATE\s+TABLE\s|git\s+push\s+--force|git\s+reset\s+--hard\s+origin/i;

  // Auto-escalate to grok-3 for intensive research tasks
  const INTENSIVE_KEYWORDS = /estudio|análisis|arquitectura|benchmark|investigación|mercado|comparativa|diseño|propuesta|fork|migración/i;
  const model = INTENSIVE_KEYWORDS.test(taskContent) ? 'grok-3' : 'grok-3-mini';

  const GROK_TOOLS = [
    { type: 'function', function: { name: 'bash',       description: 'Run shell command. Returns stdout+stderr (max 5000 chars).', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
    { type: 'function', function: { name: 'read_file',  description: 'Read file from disk (max 10000 chars).', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
    { type: 'function', function: { name: 'write_file', description: 'Write content to file.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
    { type: 'function', function: { name: 'git_commit', description: 'git add + commit + push.', parameters: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } }, message: { type: 'string' }, branch: { type: 'string' } }, required: ['files', 'message'] } } },
  ];

  const agentPromptPath = path.join(__dirname, 'agents', `${project.id}.md`);
  const agentPlan = fs.existsSync(agentPromptPath)
    ? `\n\n---\n## Instrucciones del agente\n${fs.readFileSync(agentPromptPath, 'utf8').slice(0, 3000)}`
    : '';

  const systemPrompt = `Eres un agente investigador y consultor de arquitectura de software llamado Grok Researcher.
Repo de trabajo: ${repoBase}
Modelo activo: ${model} (${model === 'grok-3' ? 'modo intensivo — tarea compleja detectada' : 'modo económico'})

Tienes acceso a bash, lectura/escritura de archivos y git.
Cuando termines, escribe tu resultado final en el outbox del proyecto y termina con:

STATUS: done | partial | failed
CHANGED: archivos modificados (o "ninguno")
DEPLOYED: yes | no
PENDING: descripción (o "ninguno")
USER_REQUIRED: no${agentPlan}`;

  const messages      = [{ role: 'user', content: taskContent }];
  let toolCallCount     = 0;
  let resultText        = '';
  let taskCostUsd       = 0;
  let grokInputTokens   = 0;
  let grokOutputTokens  = 0;
  let lastToolName      = null;

  const taskTitle  = taskContent.split('\n').find(l => /^#{1,3} /.test(l))?.replace(/^#+ /, '').slice(0, 60) || project.name;
  const heartbeat  = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 60000);
    tg(`⏳ <b>Grok agent — ${project.name}</b>\n🗂 <code>${taskTitle}</code>\n⚡ ${model} | ⏱ ${elapsed}min | 🔧 ${toolCallCount} tools\nÚltima: <code>${lastToolName || 'iniciando…'}</code>`);
  }, RUNNING_WARN_MS);

  const agentTimeout = setTimeout(() => {
    clearInterval(heartbeat);
    if (!resultText) resultText = `## Resultados\n⏰ Timeout grok-agent\n\nSTATUS: partial\nCHANGED: ninguno\nDEPLOYED: no`;
    callback(1, resultText, taskCostUsd);
  }, CLAUDE_TIMEOUT_MS);

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let response;
      try {
        response = await callGrokWithTools(systemPrompt, messages, GROK_TOOLS, model, 4096);
      } catch (e) {
        resultText = `## Resultados\n❌ Grok API error: ${e.message?.slice(0, 200)}\n\nSTATUS: blocked\nCHANGED: ninguno\nDEPLOYED: no`;
        break;
      }

      const choice  = response.choices?.[0];
      const msg     = choice?.message;
      const usage   = response.usage || {};
      const gInTok  = usage.prompt_tokens || 0;
      const gOutTok = usage.completion_tokens || 0;
      grokInputTokens  += gInTok;
      grokOutputTokens += gOutTok;
      // grok-3: $3/M input, $15/M output; grok-3-mini: $0.3/M input, $0.5/M output
      taskCostUsd  += (gInTok * (model === 'grok-3' ? 0.000003 : 0.0000003) +
                       gOutTok * (model === 'grok-3' ? 0.000015 : 0.0000005));

      if (!msg) { resultText = '## Resultados\n❌ Grok: respuesta vacía\n\nSTATUS: failed\nCHANGED: ninguno\nDEPLOYED: no'; break; }
      messages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });

      if (choice.finish_reason === 'stop' || !msg.tool_calls?.length) {
        resultText = msg.content || '## Completado sin texto\n\nSTATUS: done\nCHANGED: ninguno\nDEPLOYED: no';
        break;
      }

      const toolResults = [];
      for (const tc of msg.tool_calls) {
        lastToolName = tc.function?.name;
        toolCallCount++;
        let args, toolOut = '';
        try { args = JSON.parse(tc.function.arguments); } catch (_) { args = {}; }

        if (lastToolName === 'bash') {
          if (BASH_DENY.test(args.command || '')) {
            toolOut = 'ERROR: comando bloqueado por política de seguridad';
          } else {
            try {
              toolOut = execSync(args.command, { cwd: repoBase, timeout: TOOL_TIMEOUT_MS, stdio: 'pipe' }).toString().slice(0, 5000);
            } catch (e) { toolOut = (e.stdout?.toString() || e.stderr?.toString() || e.message || '').slice(0, 2000); }
          }
        } else if (lastToolName === 'read_file') {
          try {
            const fp = path.isAbsolute(args.path) ? args.path : path.join(repoBase, args.path);
            toolOut = fs.readFileSync(fp, 'utf8').slice(0, 10000);
          } catch (e) { toolOut = `Error leyendo archivo: ${e.message}`; }
        } else if (lastToolName === 'write_file') {
          try {
            const fp = path.isAbsolute(args.path) ? args.path : path.join(repoBase, args.path);
            fs.mkdirSync(path.dirname(fp), { recursive: true });
            fs.writeFileSync(fp, args.content, 'utf8');
            toolOut = `Archivo escrito: ${fp}`;
          } catch (e) { toolOut = `Error escribiendo: ${e.message}`; }
        } else if (lastToolName === 'git_commit') {
          try {
            const branch = args.branch || project.branch || 'main';
            const files  = (args.files || []).join(' ');
            execSync(`cd ${repoBase} && git add ${files} && git diff --cached --quiet || git commit -m "${(args.message || 'update').replace(/"/g, "'")}" && git push origin HEAD:${branch}`, { stdio: 'pipe', timeout: 60000 });
            toolOut = `Commit OK → ${branch}`;
          } catch (e) { toolOut = `Git error: ${e.message?.slice(0, 300)}`; }
        }
        toolResults.push({ role: 'tool', tool_call_id: tc.id, content: toolOut });
      }
      messages.push(...toolResults);
    }
  } catch (e) {
    resultText = `## Resultados\n❌ Error interno: ${e.message?.slice(0, 200)}\n\nSTATUS: failed\nCHANGED: ninguno\nDEPLOYED: no`;
  } finally {
    clearInterval(heartbeat);
    clearTimeout(agentTimeout);
    ACTIVE_TASKS.delete(project.id);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    log(project.id, `Grok agent completado (${model}, ${elapsed}s, ${toolCallCount} tools, $${taskCostUsd.toFixed(4)})`);
    if (!resultText) resultText = `STATUS: done\nCHANGED: ninguno\nDEPLOYED: no`;
    postProviderCost('grok', model || 'grok-3', project.id, grokInputTokens, grokOutputTokens, taskCostUsd);
    callback(0, resultText, taskCostUsd);
  }
}

// ─────────────────────────────────────────────────────────────
// ── GitHub API  ──────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
const GITHUB_ORG       = process.env.GITHUB_ORG       || 'vilarkptl-lang';
const GITHUB_REPO_MAIN = process.env.GITHUB_REPO_MAIN || 'agentic-repo';
const GOOGLE_API_KEY   = process.env.GOOGLE_API_KEY;

function githubRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: 'api.github.com',
      path:     apiPath,
      method,
      headers: {
        'Authorization':        `Bearer ${GITHUB_TOKEN}`,
        'Accept':               'application/vnd.github+json',
        'User-Agent':           'relay-master/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    setTimeout(() => reject(new Error('GitHub API timeout')), 15000);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function ghCreateRepo(name, isPrivate = true, description = '') {
  const r = await githubRequest('POST', `/orgs/${GITHUB_ORG}/repos`,
    { name, private: isPrivate, description, auto_init: true });
  if (r.status >= 400) throw new Error(r.body?.message || `GitHub ${r.status}`);
  return r.body;
}

async function ghCreateBranch(repo, branch, fromBranch = 'main') {
  const refRes = await githubRequest('GET', `/repos/${GITHUB_ORG}/${repo}/git/refs/heads/${fromBranch}`);
  if (refRes.status >= 400) throw new Error(`Branch ${fromBranch} no encontrado en ${repo}`);
  const sha = refRes.body.object?.sha;
  const r   = await githubRequest('POST', `/repos/${GITHUB_ORG}/${repo}/git/refs`,
    { ref: `refs/heads/${branch}`, sha });
  if (r.status >= 400) throw new Error(r.body?.message || `GitHub ${r.status}`);
  return r.body;
}

async function ghCreateIssue(repo, title, issueBody, labels = []) {
  const r = await githubRequest('POST', `/repos/${GITHUB_ORG}/${repo}/issues`,
    { title, body: issueBody, labels });
  if (r.status >= 400) throw new Error(r.body?.message || `GitHub ${r.status}`);
  return r.body;
}

async function ghCommentIssue(repo, number, commentBody) {
  const r = await githubRequest('POST', `/repos/${GITHUB_ORG}/${repo}/issues/${number}/comments`,
    { body: commentBody });
  if (r.status >= 400) throw new Error(r.body?.message || `GitHub ${r.status}`);
  return r.body;
}

async function ghCloseIssue(repo, number) {
  const r = await githubRequest('PATCH', `/repos/${GITHUB_ORG}/${repo}/issues/${number}`,
    { state: 'closed' });
  if (r.status >= 400) throw new Error(r.body?.message || `GitHub ${r.status}`);
  return r.body;
}

async function ghListRepos() {
  const r = await githubRequest('GET',
    `/orgs/${GITHUB_ORG}/repos?type=all&per_page=30&sort=updated`);
  if (r.status >= 400) throw new Error(r.body?.message || `GitHub ${r.status}`);
  return Array.isArray(r.body) ? r.body : [];
}

async function ghListIssues(repo, label) {
  const q = label
    ? `?labels=${encodeURIComponent(label)}&state=open&per_page=10`
    : '?state=open&per_page=10';
  const r = await githubRequest('GET', `/repos/${GITHUB_ORG}/${repo}/issues${q}`);
  if (r.status >= 400) return [];
  return Array.isArray(r.body) ? r.body : [];
}

// Creates labels required for relay inbox routing — idempotent (ignores 422 if exists).
async function ensureGithubLabels(projects = []) {
  if (!GITHUB_TOKEN) return;
  const labels = [
    { name: 'relay:inbox',      color: '0075ca', description: 'Relay inbox — picked up by relay-master' },
    { name: 'relay:processing', color: 'e4e669', description: 'Being processed by a relay agent' },
    { name: 'relay:done',       color: '0e8a16', description: 'Processed by relay agent' },
  ];
  const active = Array.isArray(projects) ? projects.filter(p => p.active) : [];
  for (const p of active) {
    labels.push({ name: `agent:${p.id}`, color: 'f9d0c4', description: `Route to ${p.name || p.id}` });
  }
  let created = 0;
  for (const label of labels) {
    const r = await githubRequest('POST',
      `/repos/${GITHUB_ORG}/${GITHUB_REPO_MAIN}/labels`, label);
    if (r.status === 201) created++;
    // 422 = already exists, ignore
  }
  if (created > 0) log(null, `[github] ${created} labels creados en ${GITHUB_ORG}/${GITHUB_REPO_MAIN}`);
  else log(null, `[github] Labels verificados en ${GITHUB_ORG}/${GITHUB_REPO_MAIN} (ya existían)`);
}

// Issues labeled 'relay:inbox' + 'agent:<projectId>' are picked up and dispatched.
const GH_PROCESSED_ISSUES = new Set();
async function pollGithubIssues(projects) {
  if (!GITHUB_TOKEN) return;
  const ghProjects = projects.filter(p => p.active && (p.runner === 'deepseek' || p.runner === 'gemini'));
  if (!ghProjects.length) return;

  for (const project of ghProjects) {
    try {
      const label  = project.github_label || `agent:${project.id}`;
      const issues = await ghListIssues(GITHUB_REPO_MAIN, label);
      for (const issue of issues) {
        if (GH_PROCESSED_ISSUES.has(issue.number)) continue;
        if (ACTIVE_TASKS.has(project.id)) continue;
        GH_PROCESSED_ISSUES.add(issue.number);
        const taskContent = `# ${issue.title}\n\n${issue.body || ''}`;
        log(project.id, `[github-inbox] Issue #${issue.number}: ${issue.title.slice(0, 60)}`);
        await ghCommentIssue(GITHUB_REPO_MAIN, issue.number,
          `⚙️ **Procesando** — relay-master recibió esta tarea a las ${new Date().toISOString()}`);
        runAgentByRunner(project, taskContent, async (err, result) => {
          const resultText = err ? `❌ Error: ${err.message}` : (result || '✅ Completado');
          try {
            await ghCommentIssue(GITHUB_REPO_MAIN, issue.number,
              `## Resultado\n\n${resultText.slice(0, 5000)}`);
            await ghCloseIssue(GITHUB_REPO_MAIN, issue.number);
          } catch (e) {
            log(project.id, `Error closing issue #${issue.number}: ${e.message}`);
          }
        });
      }
    } catch (e) {
      log(project.id, `pollGithubIssues error: ${e.message?.slice(0, 100)}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// ── Multi-runner dispatcher ───────────────────────────────────
// ─────────────────────────────────────────────────────────────
function runAgentByRunner(project, taskContent, callback) {
  const runner = project.runner || 'claude';
  if (runner === 'deepseek') return runDeepSeekAgent(project, taskContent, callback);
  if (runner === 'gemini')   return runGeminiAgent(project, taskContent, callback);
  if (runner === 'grok')     return runGrokAgent(project, taskContent, callback);
  return runClaude(project, taskContent, callback);
}

// ─── DeepSeek agent runner ────────────────────────────────────
async function runDeepSeekAgent(project, taskContent, callback) {
  if (ACTIVE_TASKS.has(project.id)) { callback(new Error('Already running')); return; }
  ACTIVE_TASKS.add(project.id);
  TASK_START_TIMES[project.id] = Date.now();
  log(project.id, `[deepseek-runner] Iniciando (${taskContent.length} chars)`);
  try {
    const systemPrompt = loadAgentContext(project.id, project.url) ||
      `Eres un agente de análisis para el proyecto "${project.name}". Responde en español. Sé conciso y práctico. Al terminar incluye STATUS: done|partial|failed y RESUMEN: una oración.`;
    const model = project.model || 'deepseek-reasoner';
    const body  = JSON.stringify({
      model, max_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: taskContent },
      ],
    });
    const result = await new Promise((res, rej) => {
      const req = https.request({
        hostname: 'api.deepseek.com', path: '/v1/chat/completions', method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_KEY}`,
          'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
        },
      }, (r) => {
        let data = '';
        r.on('data', c => { data += c; });
        r.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.error) { rej(new Error(j.error.message)); return; }
            res(j.choices?.[0]?.message?.content || '');
          } catch (e) { rej(e); }
        });
      });
      req.on('error', rej);
      setTimeout(() => rej(new Error('DeepSeek agent timeout 120s')), 120000);
      req.write(body);
      req.end();
    });

    if (project.inbox) {
      const outboxPath = project.inbox.replace(/inbox/g, 'outbox');
      fs.writeFileSync(outboxPath, `# Resultado — ${project.name}\n\n${result}\n\n_${new Date().toISOString()}_\n`, 'utf8');
      try { gitCommitFile(outboxPath, `result: ${project.id} deepseek`); } catch (_) {}
    }
    tg(`✅ <b>${project.name}</b> (DeepSeek)\n${result.slice(0, 800)}`);
    log(project.id, `[deepseek-runner] Completado (${result.length} chars)`);
    callback(null, result);
  } catch (err) {
    log(project.id, `[deepseek-runner] Error: ${err.message}`);
    tg(`❌ <b>${project.name}</b> (DeepSeek): ${err.message.slice(0, 200)}`);
    callback(err);
  } finally {
    ACTIVE_TASKS.delete(project.id);
    delete TASK_START_TIMES[project.id];
  }
}

// ─── Gemini Flash agent runner ────────────────────────────────
async function runGeminiAgent(project, taskContent, callback) {
  if (ACTIVE_TASKS.has(project.id)) { callback(new Error('Already running')); return; }
  ACTIVE_TASKS.add(project.id);
  TASK_START_TIMES[project.id] = Date.now();
  log(project.id, `[gemini-runner] Iniciando (${taskContent.length} chars)`);
  try {
    const systemPrompt = loadAgentContext(project.id, project.url) ||
      `Eres un agente de análisis para el proyecto "${project.name}". Responde en español. Sé conciso y práctico.`;
    const model = project.model || 'gemini-1.5-flash';
    const body  = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n---\n\n${taskContent}` }] }],
      generationConfig: { maxOutputTokens: 2048 },
    });
    const result = await new Promise((res, rej) => {
      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path:     `/v1beta/models/${model}:generateContent?key=${GOOGLE_API_KEY}`,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (r) => {
        let data = '';
        r.on('data', c => { data += c; });
        r.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.error) { rej(new Error(j.error.message)); return; }
            // Track token usage for real cost reporting (gemini-1.5-flash: $0.075/M input, $0.30/M output)
            const usage = j.usageMetadata || {};
            const inTok  = usage.promptTokenCount || 0;
            const outTok = usage.candidatesTokenCount || 0;
            const cost   = (inTok * 0.000075 + outTok * 0.00030) / 1000;
            res({ text: j.candidates?.[0]?.content?.parts?.[0]?.text || '', inTok, outTok, cost });
          } catch (e) { rej(e); }
        });
      });
      req.on('error', rej);
      setTimeout(() => rej(new Error('Gemini agent timeout 120s')), 120000);
      req.write(body);
      req.end();
    });

    const { text: resultText, inTok, outTok, cost } = typeof result === 'object' ? result : { text: result, inTok: 0, outTok: 0, cost: 0 };
    if (project.inbox) {
      const outboxPath = project.inbox.replace(/inbox/g, 'outbox');
      fs.writeFileSync(outboxPath, `# Resultado — ${project.name}\n\n${resultText}\n\n_${new Date().toISOString()}_\n`, 'utf8');
      try { gitCommitFile(outboxPath, `result: ${project.id} gemini`); } catch (_) {}
    }
    postProviderCost('gemini', model, project.id, inTok, outTok, cost);
    tg(`✅ <b>${project.name}</b> (Gemini)\n${resultText.slice(0, 800)}`);
    log(project.id, `[gemini-runner] Completado (${resultText.length} chars, $${cost.toFixed(6)})`);
    callback(null, resultText);
  } catch (err) {
    log(project.id, `[gemini-runner] Error: ${err.message}`);
    tg(`❌ <b>${project.name}</b> (Gemini): ${err.message.slice(0, 200)}`);
    callback(err);
  } finally {
    ACTIVE_TASKS.delete(project.id);
    delete TASK_START_TIMES[project.id];
  }
}

// ─────────────────────────────────────────────────────────────
// ── Backlog — tareas pendientes compartidas ───────────────────
// ─────────────────────────────────────────────────────────────
const BACKLOG_FILE = path.join(__dirname, 'BACKLOG.md');

function loadBacklog() {
  try {
    const tasks = [];
    let inTable = false;
    for (const line of fs.readFileSync(BACKLOG_FILE, 'utf8').split('\n')) {
      if (line.startsWith('| ID'))  { inTable = true; continue; }
      if (line.startsWith('|---'))  { continue; }
      if (!inTable || !line.startsWith('|')) continue;
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 4) tasks.push({ id: cols[0], proyecto: cols[1], status: cols[2], desc: cols[3] });
    }
    return tasks;
  } catch (_) { return []; }
}

function saveBacklog(tasks) {
  const header = '# Backlog — Relay Master\n\n_Actualizado automáticamente. Para reclamar: `/claim <ID>`_\n\n';
  const rows   = tasks.map(t => `| ${t.id} | ${t.proyecto} | ${t.status} | ${t.desc} |`).join('\n');
  fs.writeFileSync(BACKLOG_FILE,
    `${header}| ID | Proyecto | Estado | Descripción |\n|-----|----------|--------|-------------|\n${rows}\n`,
    'utf8');
}

// ─────────────────────────────────────────────────────────────
// ── Scheduler — tareas programadas ───────────────────────────
// ─────────────────────────────────────────────────────────────
const SCHEDULE_FILE     = path.join(__dirname, 'schedule.json');
const SCHEDULE_LAST_RUN = new Map();  // scheduleId-YYYY-MM-DDTHH:MM → timestamp

function loadSchedule() {
  try { return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8')); } catch (_) { return []; }
}

function saveSchedule(entries) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

function checkSchedule(projects) {
  const entries = loadSchedule();
  if (!entries.length) return;
  const now    = new Date();
  const mxHour = (now.getUTCHours() - 6 + 24) % 24;
  const mxMin  = now.getUTCMinutes();

  for (const entry of entries) {
    if (!entry.active) continue;
    const [schedH, schedM] = (entry.time || '').split(':').map(Number);
    if (isNaN(schedH) || mxHour !== schedH || mxMin !== schedM) continue;

    const key = `${entry.id}-${now.toISOString().slice(0, 16)}`;
    if (SCHEDULE_LAST_RUN.get(key)) continue;
    SCHEDULE_LAST_RUN.set(key, Date.now());

    const project = projects.find(p => p.active && p.id === entry.project);
    if (!project) { log(null, `[schedule] Proyecto ${entry.project} no encontrado`); continue; }

    log(null, `[schedule] Disparando ${entry.id} → ${entry.project}`);
    tg(`🕐 <b>Tarea programada ${entry.id}</b> → <code>${entry.project}</code>\n<i>${entry.task.slice(0, 150)}</i>`);
    runAgentByRunner(project, entry.task, (err) => {
      if (err) log(null, `[schedule] ${entry.id} error: ${err.message}`);
    });
  }
}

// ─── Git: commit a single file in whatever repo it belongs to ─
// Works for files inside agentic-repo AND external repos (DeCabeceraTax, etc.)
function gitCommitFile(filePath, commitMsg, timeoutMs = 30000) {
  const dir      = path.dirname(filePath);
  const repoRoot = execSync(`cd "${dir}" && git rev-parse --show-toplevel`, { stdio: 'pipe', timeout: 5000 }).toString().trim();
  const relPath  = path.relative(repoRoot, filePath);
  const safeMsg  = commitMsg.replace(/"/g, "'");
  // Resolve push target: 'HEAD' on a branch, 'HEAD:main' in detached HEAD
  let pushTarget = 'HEAD';
  try {
    const branch = execSync(`cd "${repoRoot}" && git symbolic-ref --short HEAD`, { stdio: 'pipe', timeout: 5000 }).toString().trim();
    if (branch) pushTarget = `HEAD:${branch}`;
  } catch (_) { pushTarget = 'HEAD:main'; }
  execSync(
    `cd "${repoRoot}" && git add "${relPath}" && git diff --cached --quiet || git commit -m "${safeMsg}" && git push origin ${pushTarget}`,
    { stdio: 'pipe', timeout: timeoutMs }
  );
}

// Append a timestamped entry to relay/journal.md in a project repo
function journalEntryFile(repoPath, direction, summary) {
  const tsCst  = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  const entry  = `[${tsCst} CST] ${direction}: ${summary}\n`;
  const jPath  = path.join(repoPath, 'relay', 'journal.md');
  try { fs.appendFileSync(jPath, entry); } catch (_) {}
}

// Build Anthropic context + call API + write response to buzon-ia.md.
// Called when buzon-fiscalai.md changes (Opción B — no Claude CLI spawn).
// Anti-loop: reads buzon-fiscalai.md, writes buzon-ia.md (different file).
// Outgoing sync in syncBuzonIA picks up buzon-ia.md on next poll and pushes it.
//
// Resilience: callAnthropicDirect can fail if api.anthropic.com is unreachable
// from the server (same reason /tarea was switched to local plan generation).
// Fix: write simple ACK immediately + dispatch to coordinator regardless of API.
async function responderBuzonFiscalai(buzonContent) {
  log(null, 'buzon-ia: mensaje de FiscalAI recibido — procesando…');
  const timestamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

  // 1. Write immediate ACK so FiscalAI knows the message arrived
  const ack =
    `# Buzón IA — ia.vilarkptl.com → FiscalAI\n\n` +
    `**[${timestamp} CST] — ACK relay-master**\n\n---\n\n` +
    `Mensaje recibido (${buzonContent.length} chars). Despachando al coordinador para procesar.\n`;
  try {
    fs.writeFileSync(BUZON_SRC, ack);
    log(null, 'buzon-ia: ACK escrito en buzon-ia.md');
  } catch (ackErr) {
    log(null, `buzon-ia: no pudo escribir ACK: ${ackErr.message}`);
  }

  // 2. Dispatch buzon content to coordinator as a relay task (no API needed)
  const taskBody =
    `# Mensaje de FiscalAI via Buzón\n\n` +
    `_Recibido ${timestamp} CST_\n\n` +
    `${buzonContent}\n\n` +
    `---\n_Fuente: relay/buzon-fiscalai.md — procesado por relay-master_`;
  postToMonitor('/api/relay/dispatch', {
    project:   'coordinator',
    task:      taskBody,
    requester: 'buzon-fiscalai',
  });
  tg(`📨 <b>FiscalAI — mensaje despachado al coordinador</b>\n<code>${buzonContent.slice(0, 300)}</code>`);
  journalEntryFile(BUZON_REPO, 'buzon-fiscalai → coordinator', `${buzonContent.length} chars despachados`);

  // 3. Anthropic API directa eliminada — ACK + dispatch al coordinator es suficiente.
  // API key nunca se usa. Claude corre solo via Claude CLI (Max subscription, $0).
}

// ─── Buzon IA sync ────────────────────────────────────────
// • Mirrors relay/buzon-ia.md (agentic-repo) → DeCabeceraTax/relay/buzon-ia.md (ryby.lease)
//   so FiscalAI can read messages from ia.vilarkptl.com.
// • Also checks for FiscalAI's reply at DeCabeceraTax/relay/buzon-fiscalai.md
//   and copies it to relay/buzon-fiscalai.md in agentic-repo.
function syncBuzonIA() {
  // ── Outgoing: ia.vilarkptl.com → FiscalAI ──────────────
  if (fs.existsSync(BUZON_SRC)) {
    const h = fileHash(BUZON_SRC);
    if (h && h !== _buzonHash) {
      _buzonHash = h;
      try { const bh = loadBuzonHashes(); bh['ia'] = h; saveBuzonHashes(bh); } catch (_) {}
      try {
        const destDir = path.dirname(BUZON_DEST);
        try { fs.mkdirSync(destDir, { recursive: true }); } catch (_) {}
        fs.copyFileSync(BUZON_SRC, BUZON_DEST);
        log(null, `buzon-ia: cambio detectado — sincronizando a DeCabeceraTax`);

        if (BUZON_REPO && fs.existsSync(BUZON_REPO)) {
          try {
            try {
              execSync(
                `cd ${BUZON_REPO} && git pull origin ${BUZON_BRANCH} --rebase --quiet 2>/dev/null`,
                { stdio: 'pipe', timeout: 30000 }
              );
            } catch (_) {
              execSync(
                `cd ${BUZON_REPO} && git rebase --abort 2>/dev/null || true && git fetch origin ${BUZON_BRANCH} --quiet && git reset --hard origin/${BUZON_BRANCH} --quiet`,
                { stdio: 'pipe', timeout: 30000 }
              );
            }
            execSync(
              `cd ${BUZON_REPO} && git add relay/buzon-ia.md && git diff --cached --quiet || git commit -m "relay: buzon-ia update" --quiet && git push origin ${BUZON_BRANCH} --quiet`,
              { stdio: 'pipe', timeout: 30000 }
            );
            log(null, `buzon-ia: push OK → ryby.lease/${BUZON_BRANCH}`);
            tg(`📬 <b>Buzón IA</b> — mensaje sincronizado a ryby.lease\nFiscalAI puede leerlo en <code>relay/buzon-ia.md</code>`);
          } catch (err) {
            log(null, `buzon-ia: push error: ${err.message?.slice(0, 200)}`);
          }
        }
      } catch (err) {
        log(null, `buzon-ia: sync error: ${err.message}`);
      }
    }
  }

  // ── Incoming: FiscalAI reply → ia.vilarkptl.com ────────
  if (fs.existsSync(BUZON_FISCALAI_SRC)) {
    const h2 = fileHash(BUZON_FISCALAI_SRC);
    if (h2 && h2 !== _buzonFiscalaiHash) {
      _buzonFiscalaiHash = h2;
      try { const bh = loadBuzonHashes(); bh['fiscalai'] = h2; saveBuzonHashes(bh); } catch (_) {}
      try {
        fs.copyFileSync(BUZON_FISCALAI_SRC, BUZON_FISCALAI_DEST);
        const response = fs.readFileSync(BUZON_FISCALAI_DEST, 'utf8');
        const preview  = response.slice(0, 400);
        log(null, `buzon-ia: respuesta de FiscalAI recibida — auto-procesando`);
        tg(`📨 <b>Respuesta de FiscalAI recibida</b>\n<code>${preview}</code>\n\n⚙️ Procesando automáticamente…`);

        // ── Opción B: llamar Anthropic API directo (sin Claude CLI spawn) ──
        // responderBuzonFiscalai escribe buzon-ia.md; outgoing sync lo pushea en el próximo poll.
        responderBuzonFiscalai(response).catch(err => {
          log(null, `buzon-ia: responderBuzonFiscalai failed: ${err.message}`);
        });
        log(null, `buzon-ia: Anthropic API call lanzado (async)`);
      } catch (err) {
        log(null, `buzon-ia: error procesando respuesta FiscalAI: ${err.message}`);
      }
    }
  }
}

// ─── Hash helpers ─────────────────────────────────────────
function loadHashes() {
  try { return JSON.parse(fs.readFileSync(HASHES_FILE, 'utf8')); }
  catch (_) { return {}; }
}

function saveHashes(h) {
  fs.writeFileSync(HASHES_FILE, JSON.stringify(h));
}

function loadBuzonHashes() {
  try { return JSON.parse(fs.readFileSync(BUZON_HASHES_FILE, 'utf8')); }
  catch (_) { return {}; }
}
function saveBuzonHashes(h) {
  try { fs.writeFileSync(BUZON_HASHES_FILE, JSON.stringify(h)); } catch (_) {}
}

function fileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('md5').update(content).digest('hex');
  } catch (_) { return null; }
}

// ─── Self-reload when master.js changes on disk ───────────
// After gitPull updates master.js, the running process still has old code.
// Solution: detect hash change → process.exit(0) → pm2 auto-restarts with new code.
let _selfHash    = fileHash(__filename);
let _selfReloading = false;

function checkSelfReload() {
  if (_selfReloading) return;
  const newHash = fileHash(__filename);
  if (newHash && newHash !== _selfHash) {
    _selfReloading = true;
    const active = [...ACTIVE_TASKS];
    if (active.length > 0) {
      const names = active.join(', ');
      log(null, `🔄 master.js actualizado — esperando tareas activas: ${names}`);
      tg(`🔄 <b>relay-master</b> — nueva versión detectada\n⏳ Esperando tareas activas antes de reiniciar:\n${active.map(t => `• <code>${t}</code>`).join('\n')}`);
      // Poll until all tasks finish, then exit (max 20 min)
      const deadline = Date.now() + 20 * 60 * 1000;
      const wait = setInterval(() => {
        if (ACTIVE_TASKS.size === 0 || Date.now() > deadline) {
          clearInterval(wait);
          if (ACTIVE_TASKS.size > 0) {
            const remaining = [...ACTIVE_TASKS].join(', ');
            tg(`⚠️ <b>relay-master</b> — reiniciando con tareas aún activas: ${remaining}`);
          }
          log(null, '🔄 reiniciando ahora (pm2 auto-restart)');
          setTimeout(() => process.exit(0), 1000);
        }
      }, 5000);
    } else {
      log(null, '🔄 relay/master.js actualizado — reiniciando en 3s (pm2 auto-restart)');
      tg('🔄 <b>relay-master</b> — nueva versión detectada\nReiniciando en 3s…');
      setTimeout(() => process.exit(0), 3000);
    }
  }
}

// Auto-restart the Express backend (ai-monitor PM2 process) when server.js changes.
const BACKEND_JS           = path.join(__dirname, '..', 'backend', 'server.js');
const BACKEND_RESTART_FLAG = path.join(__dirname, '.backend-needs-restart');
let _backendHash = fileHash(BACKEND_JS);

// One-shot restart on startup if flag file is present (placed by deploy scripts)
if (fs.existsSync(BACKEND_RESTART_FLAG)) {
  setTimeout(() => {
    try {
      fs.unlinkSync(BACKEND_RESTART_FLAG);
      execSync('pm2 restart ai-monitor', { stdio: 'pipe', timeout: 10000 });
      log(null, '🔄 backend/ai-monitor reiniciado por flag .backend-needs-restart');
    } catch (e) {
      log(null, `⚠️ backend restart-flag error: ${e.message?.slice(0, 80)}`);
    }
  }, 5000);
}

function checkBackendReload() {
  const newHash = fileHash(BACKEND_JS);
  if (!newHash || newHash === _backendHash) return;
  _backendHash = newHash;
  try {
    execSync('pm2 restart ai-monitor', { stdio: 'pipe', timeout: 10000 });
    log(null, '🔄 backend/server.js actualizado — ai-monitor reiniciado');
  } catch (e) {
    log(null, `⚠️ checkBackendReload: pm2 restart falló — ${e.message?.slice(0, 80)}`);
  }
}

// Auto-run npm install in relay/ when package.json changes
const RELAY_PKG     = path.join(__dirname, 'package.json');
let _relayPkgHash   = fileHash(RELAY_PKG);

function checkRelayDeps() {
  const newHash = fileHash(RELAY_PKG);
  if (!newHash || newHash === _relayPkgHash) return;
  _relayPkgHash = newHash;
  log(null, '📦 relay/package.json actualizado — ejecutando npm install');
  try {
    execSync('npm install --prefer-offline 2>&1', { cwd: __dirname, stdio: 'pipe', timeout: 120000 });
    log(null, '📦 npm install completado');
  } catch (e) {
    log(null, `⚠️ npm install falló — ${e.message?.slice(0, 100)}`);
  }
}

// ─── Lock per project (parallel execution allowed) ────────
// Uses PID check instead of time-based expiry so stale locks from dead
// relay-master instances are cleaned up immediately on next poll.
function acquireLock(projectId) {
  if (ACTIVE_TASKS.has(projectId)) return false;
  ACTIVE_TASKS.add(projectId);
  TASK_START_TIMES[projectId] = Date.now();
  try { fs.writeFileSync(`/tmp/relay-lock-${projectId}`, String(process.pid)); } catch (_) {}
  return true;
}

function releaseLock(projectId) {
  ACTIVE_TASKS.delete(projectId);
  delete TASK_START_TIMES[projectId];
  delete LAST_RUNNING_WARN[projectId];
  try { fs.unlinkSync(`/tmp/relay-lock-${projectId}`); } catch (_) {}
}

// ─── Parse inbox tasks ────────────────────────────────────
function parseInbox(content) {
  const lines = content.split('\n');
  const title = lines.find(l => /^#{1,3} /.test(l) && !/Relay Inbox|Tarea desde|Plan recibido/.test(l))
                  ?.replace(/^#+ /, '')
                || lines.find(l => l.trim().length > 10)?.trim().slice(0, 80)
                || 'Sin título';
  const items = lines.filter(l => /^[0-9]+\. |^- /.test(l)).slice(0, 12);
  return { title, items };
}

// ─── Parse structured output sections ────────────────────
function parseSectionItems(content, headerRe) {
  const lines = content.split('\n');
  let start = -1;
  lines.forEach((l, i) => { if (headerRe.test(l)) start = i; });
  if (start === -1) return [];
  const after = lines.slice(start + 1);
  const end   = after.findIndex(l => /^## /.test(l));
  return (end === -1 ? after : after.slice(0, end)).filter(l => l.trim()).slice(0, 12);
}

function parsePlanSection(content) {
  const items = parseSectionItems(content, /^## Plan/i);
  return items.length ? items : content.split('\n').filter(l => /^[0-9]+\. |^- /.test(l)).slice(0, 8);
}

function parseCriteriaSection(content) {
  return parseSectionItems(content, /^## Criterios|^## Acceptance|^## Verificaci/i);
}

function parseResultSection(content) {
  const items = parseSectionItems(content, /^## Resultados|^## Results/i);
  if (items.length) return items;
  return content.split('\n').filter(l => /^[✅❌⚠️]/.test(l.trim())).slice(0, 12);
}

function parseIssuesSection(content) {
  return parseSectionItems(content, /^## Issues|^## Problemas|^## Bloqueante/i);
}

// Parse structured outbox fields (STATUS/CHANGED/DEPLOYED/PENDING/USER_REQUIRED)
function parseStructuredOutbox(content) {
  const get = (key) => {
    const m = content.match(new RegExp(`^${key}:\\s*(.+)$`, 'mi'));
    return m ? m[1].trim() : null;
  };
  return {
    status:       get('STATUS'),
    changed:      get('CHANGED'),
    deployed:     get('DEPLOYED'),
    pending:      get('PENDING'),
    userRequired: get('USER_REQUIRED'),
  };
}

// Format result items for Telegram (ensure emoji prefix)
function formatResultItems(items, exitCode) {
  if (!items.length) {
    return exitCode === 0 ? ['✅ Ejecutado sin errores'] : ['❌ Terminó con error — ver outbox'];
  }
  return items.map(l => {
    const clean = l.replace(/^[-*•]\s*/, '').trim();
    if (/^[✅❌⚠️🆘]/.test(clean)) return clean;
    if (/error|fail|❌|bloqueado|no pude/i.test(clean)) return `❌ ${clean}`;
    return `✅ ${clean}`;
  });
}

// Load per-agent context file — tries relay/agents/{id}.md then relay/agents/{url-hostname}.md
function loadAgentContext(projectId, projectUrl) {
  const agentsDir = path.join(__dirname, 'agents');
  const byId = path.join(agentsDir, `${projectId}.md`);
  try { return fs.readFileSync(byId, 'utf8'); } catch (_) {}
  if (projectUrl) {
    try {
      const hostname = new URL(projectUrl).hostname;
      const byHost = path.join(agentsDir, `${hostname}.md`);
      return fs.readFileSync(byHost, 'utf8');
    } catch (_) {}
  }
  return '';
}

// Load recent entries from agent-memory.md (capped to keep tokens manageable)
function loadAgentMemory(repoPath, maxEntries = 15) {
  if (!repoPath) return '';
  const memPath = path.join(repoPath, 'relay', 'agent-memory.md');
  try {
    const raw = fs.readFileSync(memPath, 'utf8');
    // Split by ## sections, take last maxEntries
    const sections = raw.split(/\n(?=## )/).filter(s => s.trim());
    const recent   = sections.slice(-maxEntries).join('\n');
    return recent ? `\n\n---\n\n## Memoria acumulada (últimas ${Math.min(sections.length, maxEntries)} sesiones)\n${recent}` : '';
  } catch (_) { return ''; }
}

// Append a structured entry to agent-memory.md after task completes
function appendAgentMemory(repoPath, projectName, title, resultItems, issueItems) {
  if (!repoPath) return;
  const memPath = path.join(repoPath, 'relay', 'agent-memory.md');
  const ts = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour12: false });
  const lines = [
    `\n## [${ts} CST] ${title.slice(0, 120)}`,
    ...resultItems.slice(0, 8).map(r => `- ${r.replace(/^[✅❌⚠️]\s*/, '').slice(0, 200)}`),
    ...issueItems.slice(0, 3).map(i => `- ⚠️ ${i.replace(/^[-•*]\s*/, '').slice(0, 200)}`),
  ];
  try {
    fs.mkdirSync(path.dirname(memPath), { recursive: true });
    fs.appendFileSync(memPath, lines.join('\n') + '\n');
  } catch (_) {}
}

// ─── Context injector: load per-project plan.md ───────────
function loadProjectPlan(projectId) {
  const planPath = path.join(__dirname, 'workspaces', projectId, 'plan.md');
  try {
    const raw = fs.readFileSync(planPath, 'utf8').trim();
    return raw ? `\n\n---\n\n## Plan de proyecto (contexto activo)\n${raw}` : '';
  } catch (_) { return ''; }
}

// ─── Journal system ───────────────────────────────────────
const JOURNALS_DIR = path.join(__dirname, 'journals');
try { fs.mkdirSync(JOURNALS_DIR, { recursive: true }); } catch (_) {}

function loadJournal(projectId) {
  const f = path.join(JOURNALS_DIR, `${projectId}.json`);
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (_) {
    return {
      project_id:            projectId,
      state:                 'active',   // active | stopped
      total_tasks:           0,
      consecutive_successes: 0,
      consecutive_failures:  0,
      recent_tasks:          [],         // last 10
    };
  }
}

function saveJournal(projectId, journal) {
  const f = path.join(JOURNALS_DIR, `${projectId}.json`);
  try { fs.writeFileSync(f, JSON.stringify(journal, null, 2)); } catch (_) {}
}

function updateJournal(projectId, { title, exitCode, resultSummary, durationSec, fullResult = '', costUsd = 0 }) {
  const journal = loadJournal(projectId);
  const status  = exitCode === 0 ? 'success' : 'failed';

  journal.total_tasks++;
  journal.consecutive_failures  = status === 'failed'  ? journal.consecutive_failures  + 1 : 0;
  journal.consecutive_successes = status === 'success' ? journal.consecutive_successes + 1 : 0;
  journal.updated_at = new Date().toISOString();

  // Track cumulative cost per plan (resets when plan title changes)
  if (!journal.plan_title || journal.plan_title !== title) {
    journal.plan_title    = title;
    journal.plan_cost_usd = 0;
  }
  journal.plan_cost_usd = (journal.plan_cost_usd || 0) + (costUsd || 0);

  journal.recent_tasks.unshift({
    title,
    status,
    exit_code:      exitCode,
    result_summary: (resultSummary || '').slice(0, 200),
    cost_usd:       costUsd,
    duration_sec:   durationSec,
    timestamp:      new Date().toISOString(),
  });
  journal.recent_tasks = journal.recent_tasks.slice(0, 10);

  // Auto-stop: 3 consecutive failures (loop breaker — Phase 1.4)
  if (journal.consecutive_failures >= 3 && journal.state === 'active') {
    journal.state = 'stopped';
    const errorSnippet = (fullResult || resultSummary || '').slice(-600)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    tg(`🆘 <b>STOP automático — ${projectId}</b>
3 intentos fallidos consecutivos.
El agente no continuará solo.

<b>Último error:</b>
<code>${errorSnippet}</code>

Revisa el outbox, corrige el problema y escribe un nuevo plan.`);
  } else if (status === 'success' && journal.state === 'stopped') {
    journal.state = 'active';  // reset if new success
  }

  saveJournal(projectId, journal);
  return journal;
}

// ─── Phase 1.2: Budget cap — parse budget_usd_max from inbox ─────────────────
function parseBudgetMax(taskContent) {
  const m = taskContent.match(/budget_usd_max\s*[:=]\s*([\d.]+)/i);
  return m ? parseFloat(m[1]) : 2.00;
}

// ─── Phase 1.3: Outbox validator — require verifiable artifact ────────────────
function hasVerifiableArtifact(resultText) {
  if (/\b[a-f0-9]{64}\b/i.test(resultText))                                               return true; // SHA256
  if (/HTTP\/\d+(\.\d+)?\s+\d{3}|\bstatus[: ]+\d{3}/i.test(resultText))                  return true; // HTTP status
  if (/\b\d+\s+(matches|results|líneas|files|archivos|rows|registros)\b/i.test(resultText)) return true; // grep/wc count
  if (/\b[a-f0-9]{7,40}\b.{0,30}commit|commit.{0,30}\b[a-f0-9]{7,40}\b/i.test(resultText)) return true; // git hash
  if (/\b(pm2|systemctl)\b.{0,40}\bonline\b|\bonline\b.{0,40}\bpm2\b/i.test(resultText))   return true; // service online
  return false;
}

// ─── Execute Claude for a project (stream-json for real-time events) ─────────
function runClaude(project, taskContent, callback, dispatchMeta = {}, timeoutMs = CLAUDE_TIMEOUT_MS) {
  const uid      = process.getuid?.() ?? '0';
  const taskFile = `/tmp/relay-task-${uid}-${project.id}.md`;

  try { fs.unlinkSync(taskFile); } catch (_) {}

  // Build context: load agent-specific .md + current plan + accumulated memory + task
  const agentCtx  = loadAgentContext(project.id, project.url);
  const agentPlan = loadProjectPlan(project.id);
  const agentMem  = loadAgentMemory(project.repo);
  const OUTPUT_STRUCTURE = `
**TU ÚLTIMO MENSAJE al terminar DEBE ser exactamente** (relay-master lo parsea para Telegram):
\`\`\`
## Resultados
✅ [Tarea completada] — [qué cambió, archivo, evidencia]
❌ [Tarea fallida] — [error exacto: mensaje, archivo, línea]
⚠️ [Tarea parcial] — [qué falta y por qué]

## Issues
- [Solo si requiere atención humana]

## Acceso
- relay: ✅/❌ (describe si pudiste leer inbox/outbox y hacer git pull/push)
- api_keys: ✅/❌ (ANTHROPIC_API_KEY, SAT Bridge, etc. — menciona cuáles tenías disponibles)
- frontend: ✅/❌ (si aplica — login, URL, respuesta HTTP)
- chromium: ✅/❌ (si aplica — captura de screenshots, versión, errores)
\`\`\`
Si no pudiste autenticarte o acceder a algún recurso, indícalo en ## Acceso aunque la tarea haya fallado por otro motivo.
Si necesitas intervención humana: ⚠️ REQUIERE INTERVENCIÓN HUMANA: [descripción]`;

  const context  = agentCtx
    ? `${agentCtx}${agentPlan}${agentMem}\n\n---\n\n## Tarea recibida\n\n${taskContent}`
    : `Eres el agente de servidor para el proyecto "${project.name}".
Repo: ${project.repo || 'N/A'}
URL: ${project.url || 'N/A'}
Directorio de trabajo: ${project.repo || '/var/www/html'}
${OUTPUT_STRUCTURE}
${agentPlan}${agentMem}

## Tarea
${taskContent}`;

  fs.writeFileSync(taskFile, context);
  try { fs.chmodSync(taskFile, 0o644); } catch (_) {}  // ensure spawned user can read

  // CLAUDE_CONFIG_DIR must point to the .claude directory itself (not its parent)
  const CLAUDE_CONFIG = path.join(__dirname, '..', '.claude');
  const CLAUDE_HOOKS  = path.join(__dirname, '..', 'hooks');
  const taskId    = dispatchMeta.id    || `relay-${project.id}-${Date.now()}`;
  const taskDepth = dispatchMeta.depth ?? 0;
  const sessionId = `relay-${project.id}-${Date.now()}`;

  // Build shell command — stdout y stderr van a outFile para evitar
  // el problema de buffering de su+pipe que deja toolCallCount=0.
  const outFile = `/tmp/relay-out-${uid}-${project.id}.jsonl`;
  try { fs.unlinkSync(outFile); } catch (_) {}

  // Determine users to try in order.
  // relay-master runs as root → use su (root can switch any user without password).
  // relay-master runs as non-root → try direct first, then sudo -n fallback.
  let _currentUser = 'root';
  try { _currentUser = require('os').userInfo().username; } catch (_) {}
  const _isRoot = (_currentUser === 'root');

  let _usersToTry;
  if (_isRoot) {
    // Root: su to CLAUDE_USER, then 'german', then 'claude-agent' (all work from root)
    const candidates = [];
    if (CLAUDE_USER && CLAUDE_USER !== 'root') candidates.push(CLAUDE_USER);
    for (const u of ['german', 'claude-agent']) {
      if (!candidates.includes(u)) candidates.push(u);
    }
    _usersToTry = candidates;   // skip running as root — claude has no config there
  } else {
    // Non-root: try current user first, then sudo -n fallback
    const _fallbackUser = (CLAUDE_USER && CLAUDE_USER !== _currentUser) ? CLAUDE_USER : 'claude-agent';
    _usersToTry = [_currentUser];
    if (_fallbackUser !== _currentUser) _usersToTry.push(_fallbackUser);
  }

  const claudeModel = project.claude_model
    || process.env.CLAUDE_DEFAULT_MODEL
    || 'claude-sonnet-4-6';

  // Proxy routing: use_cli_proxy → LiteLLM (DeepSeek); else use multi-account Claude proxy pool
  const proxyBase = (project.use_cli_proxy && process.env.LITELLM_BASE_URL)
    ? process.env.LITELLM_BASE_URL
    : selectProxyForProject(project.id);
  const proxyEnvPrefix = proxyBase ? `ANTHROPIC_BASE_URL=${proxyBase} ` : '';

  const resumeSession = getResumeSession(project.id);
  const resumePart    = resumeSession ? ` --resume ${resumeSession}` : '';
  const coreCmd = [
    `cd ${project.repo || '/var/www/html'} 2>/dev/null || true`,
    // Diagnostic first — visible in resultText so Telegram shows it on task completion
    `echo "RELAY_DIAG user=$(id -un 2>/dev/null||echo '?') home=$HOME task=$(test -r ${taskFile} && echo ok || echo UNREADABLE) resume=${resumeSession || 'none'}" > ${outFile} 2>&1`,
    `${proxyEnvPrefix}${CLAUDE_BIN} --dangerously-skip-permissions --output-format stream-json --verbose --print${resumePart} --model ${claudeModel} < ${taskFile} >> ${outFile} 2>&1`,
  ].join(' && ');

  function buildCmd(user) {
    // Look up real home directory so ~/.claude auth credentials are found
    let realHome = `/home/${user}`;
    try {
      const entry = require('child_process').execSync(
        `getent passwd ${user}`, { stdio: 'pipe', timeout: 3000 }
      ).toString().trim();
      const homePart = entry.split(':')[5];
      if (homePart) realHome = homePart;
    } catch (_) {}

    const env = {
      HOME:               realHome,
      USER:               user,
      LOGNAME:            user,
      // ANTHROPIC_API_KEY deliberately omitted — Claude CLI uses ~/.claude/credentials
      // (Pro/Max subscription, $0). Passing the key routes every agent call through
      // the paid API at Sonnet/Haiku prices. Do not add it back.
      CLAUDE_MONITOR_URL: MONITOR_API,
      CLAUDE_CHAT_SOURCE: `relay-${project.id}`,
      // Use user's own ~/.claude for auth — project hooks dir still passed separately
      CLAUDE_HOOKS_DIR:   CLAUDE_HOOKS,
      RELAY_DISPATCH_URL: `${MONITOR_API}/api/relay/dispatch`,
      RELAY_TASK_ID:      taskId,
      RELAY_DEPTH:        String(taskDepth),
      PATH:               process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      TERM:               'dumb',
    };
    const exports = Object.entries(env)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `export ${k}='${String(v).replace(/'/g, "'\\''")}'`)
      .join('\n');
    return `${exports}\n${coreCmd}`;
  }

  function doSpawn(user) {
    const innerCmd = buildCmd(user);
    if (!_isRoot && user === _currentUser) {
      // Same non-root user: run directly (no su/sudo)
      log(project.id, `spawn: directo como ${user}`);
      return spawn('/bin/bash', ['-c', innerCmd], { stdio: 'ignore' });
    }
    if (_isRoot) {
      // Root → su without password to target user (no -l to avoid login-file hangs)
      log(project.id, `spawn: su ${user} (desde root)`);
      return spawn('su', ['-s', '/bin/bash', '-c', innerCmd, user], { stdio: 'ignore' });
    }
    // Non-root switching user → sudo -n (fails fast if no NOPASSWD)
    log(project.id, `spawn: sudo -n -u ${user}`);
    return spawn('sudo', ['-n', '-u', user, '/bin/bash', '-c', innerCmd], { stdio: 'ignore' });
  }

  let spawnIdx  = 0;
  let child     = doSpawn(_usersToTry[spawnIdx]);

  let resultText   = '';
  let fileOffset   = 0;
  let lineBuffer   = '';
  let timedOut     = false;
  let toolCallCount = 0;
  let lastToolName  = null;
  const runStart   = Date.now();
  const taskTitle  = taskContent.split('\n').find(l => /^#{1,3} /.test(l))
    ?.replace(/^#+ /, '').slice(0, 60) || project.name;
  const pendingTools = {};

  // Register in ACTIVE_PIDS for independent watchdog
  const jobId = `${project.id}-${Date.now()}`;
  // Initialize forceTimeout as dummy to prevent watchdog null check race condition
  const activePidInfo = { pid: child.pid, startTime: Date.now(), jobId, forceTimeout: () => {} };
  ACTIVE_PIDS.set(project.id, activePidInfo);

  let callbackFired = false;
  let taskCostUsd   = 0;
  function safeCallback(code, text) {
    if (callbackFired) return;
    callbackFired = true;
    // Auto-blacklist Pro proxies that return auth errors → next task will use Max
    if (code !== 0 && proxyBase && proxyBase !== _PROXY_POOL.max &&
        (text.includes('Not logged in') || text.includes('Please run /login') ||
         text.includes('claude exited 1: Not logged in'))) {
      _proxyAuthFailed.add(proxyBase);
      log(project.id, `[proxy-auth] ${proxyBase} sin auth — redirigiendo a Max en próximas tareas (healthy pro: ${_PROXY_POOL.pro.filter(u=>!_proxyAuthFailed.has(u)).length})`);
    }
    try { fs.unlinkSync(outFile); } catch (_) {}
    callback(code, text, taskCostUsd);
  }

  const timer = setTimeout(() => {
    timedOut = true;
    clearInterval(heartbeat);
    clearInterval(filePoller);
    clearInterval(watchdogInterval);
    try { execSync(`pkill -9 -P ${child.pid} 2>/dev/null || true`, { stdio: 'pipe' }); } catch (_) {}
    try { child.kill('SIGKILL'); } catch (_) {}
    setTimeout(() => safeCallback(1, `[TIMEOUT después de ${timeoutMs / 60000}min]\n${resultText.trim()}`), 10000);
  }, timeoutMs);

  // Independent watchdog: hard 25min limit per process (fixes issue: session ran 6.9h)
  // Checks every 60s if elapsed time exceeded MAX_PROCESS_DURATION
  const MAX_PROCESS_DURATION = 25 * 60 * 1000;
  const watchdogInterval = setInterval(() => {
    const elapsed = Date.now() - runStart;
    if (elapsed > MAX_PROCESS_DURATION) {
      clearInterval(watchdogInterval);
      const elapsedMin = Math.round(elapsed / 60000);
      log(project.id, `⚠️ watchdog: proceso excedió 25 min (${elapsedMin}min) — enviando SIGTERM`);
      tg(`⚠️ <b>Watchdog — ${project.name}</b>
Proceso ha excedido 25 min (${elapsedMin}m). SIGTERM…`);

      try { process.kill(child.pid, 'SIGTERM'); } catch (e) {}

      // SIGKILL after 5s if SIGTERM doesn't work
      setTimeout(() => {
        try {
          process.kill(child.pid, 0); // Test if still alive
          log(project.id, `⚠️ watchdog: SIGTERM inefectivo — enviando SIGKILL`);
          process.kill(child.pid, 'SIGKILL');
        } catch (_) {} // Process already dead
      }, 5000);
    }
  }, 60000);

  const heartbeat = setInterval(() => {
    const elapsedMin = Math.round((Date.now() - runStart) / 60000);
    const remainMin  = Math.max(0, Math.round((timeoutMs - (Date.now() - runStart)) / 60000));
    tg(`⏳ <b>En progreso — ${project.name}</b>
🗂 <code>${taskTitle}</code>
⏱ ${elapsedMin} min | 🔧 ${toolCallCount} herramientas usadas
Última: <code>${lastToolName || 'iniciando…'}</code>
Timeout en ${remainMin} min`);
  }, RUNNING_WARN_MS);

  // Poll outFile cada 500ms — evita el problema de buffering de su+pipe
  const filePoller = setInterval(() => {
    try {
      const stat = fs.statSync(outFile);
      if (stat.size <= fileOffset) return;
      const fd  = fs.openSync(outFile, 'r');
      const buf = Buffer.alloc(stat.size - fileOffset);
      fs.readSync(fd, buf, 0, buf.length, fileOffset);
      fs.closeSync(fd);
      fileOffset = stat.size;
      lineBuffer += buf.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer  = lines.pop();
      for (const line of lines) processLine(line);
    } catch (_) {}
  }, 500);

  // Wire up watchdog forceTimeout now that all handles exist
  activePidInfo.forceTimeout = () => {
    if (callbackFired) return;
    timedOut = true;
    clearTimeout(timer);
    clearInterval(heartbeat);
    clearInterval(filePoller);
    const elapsedMin = Math.round((Date.now() - runStart) / 60000);
    try { execSync(`pkill -9 -P ${child.pid} 2>/dev/null || true`, { stdio: 'pipe' }); } catch (_) {}
    try { child.kill('SIGKILL'); } catch (_) {}
    setTimeout(() => safeCallback(1, `[WATCHDOG_TIMEOUT después de ${elapsedMin}min]\n${resultText.trim()}`), 5000);
  };

  function processLine(line) {
    if (!line.trim()) return;
    let evt;
    try { evt = JSON.parse(line); } catch (_) {
      resultText += line + '\n';
      return;
    }

    // Capture session_id for --resume on next dispatch (B1 context continuity)
    if (evt.type === 'system' && evt.session_id) {
      PROJECT_SESSIONS[project.id] = { id: evt.session_id, ts: Date.now() };
      saveProjectSessions();
    }

    if (evt.type === 'assistant' && Array.isArray(evt.message?.content)) {
      for (const block of evt.message.content) {
        if (block.type === 'text' && block.text) {
          resultText += block.text;
        }
        if (block.type === 'tool_use') {
          const inputSummary = typeof block.input === 'object'
            ? JSON.stringify(block.input).slice(0, 500)
            : String(block.input || '').slice(0, 500);

          pendingTools[block.id] = { name: block.name, inputSummary };
          toolCallCount++;
          lastToolName = block.name;
          log(project.id, `tool: ${block.name} — ${inputSummary.slice(0, 80)}`);

          postEvent({
            session_id:         sessionId,
            event_type:         'pre_tool',
            tool_name:          block.name,
            tool_input_summary: inputSummary,
            timestamp:          new Date().toISOString(),
            project_name:       project.name,
            api_provider:       'anthropic',
            agent_user:         CLAUDE_USER,
            working_dir:        project.repo || null,
          });
        }
      }
    }

    if (evt.type === 'user' && Array.isArray(evt.message?.content)) {
      for (const block of evt.message.content) {
        if (block.type !== 'tool_result') continue;
        const toolInfo = pendingTools[block.tool_use_id] || {};
        let content = '';
        if (Array.isArray(block.content)) {
          content = block.content.map(c => (typeof c === 'string' ? c : c.text || '')).join('').slice(0, 500);
        } else {
          content = String(block.content || '').slice(0, 500);
        }
        postEvent({
          session_id:            sessionId,
          event_type:            'post_tool',
          tool_name:             toolInfo.name || null,
          tool_input_summary:    toolInfo.inputSummary || null,
          tool_response_summary: content,
          timestamp:             new Date().toISOString(),
          project_name:          project.name,
          api_provider:          'anthropic',
          agent_user:            CLAUDE_USER,
          working_dir:           project.repo || null,
        });
        delete pendingTools[block.tool_use_id];
      }
    }

    if (evt.type === 'result') {
      // Prefer accumulated text (has ALL turns incl. ## Resultados);
      // only fall back to evt.result when nothing was accumulated.
      if (evt.result && !resultText.trim()) resultText = evt.result;
      if (evt.total_cost_usd) {
        // Max subscription: Claude CLI reports API-equivalent cost, not a real charge.
        // Only count as real cost when routing through a paid proxy (use_cli_proxy: true).
        if (project.use_cli_proxy) {
          taskCostUsd = evt.total_cost_usd;
          log(project.id, `costo real (proxy): $${evt.total_cost_usd.toFixed(6)}`);
        } else {
          taskCostUsd = 0;
          log(project.id, `costo Max (estimado, no cobrado): $${evt.total_cost_usd.toFixed(6)}`);
        }
      }
    }
  }

  function attachHandlers(c) {
    c.on('close', (code) => {
      // Flush remaining output from file
      try {
        const remaining = fs.readFileSync(outFile, 'utf8').slice(fileOffset);
        (lineBuffer + remaining).split('\n').filter(l => l.trim()).forEach(processLine);
      } catch (_) {}

      const elapsed = Date.now() - runStart;
      const quickFail = code !== 0 && elapsed < 10000 && !resultText.trim() && !timedOut;

      // Retry with next user if this attempt failed fast with no output
      if (quickFail && spawnIdx + 1 < _usersToTry.length) {
        spawnIdx++;
        const nextUser = _usersToTry[spawnIdx];
        log(project.id, `spawn[${spawnIdx}] falló rápido (code=${code}, ${elapsed}ms) — reintentando como ${nextUser}`);
        fileOffset = 0; lineBuffer = '';
        try { fs.unlinkSync(outFile); } catch (_) {}
        child = doSpawn(nextUser);
        attachHandlers(child);
        return;
      }

      ACTIVE_PIDS.delete(project.id);
      clearTimeout(timer);
      clearInterval(heartbeat);
      clearInterval(filePoller);
      clearInterval(watchdogInterval);
      if (timedOut) resultText = `[TIMEOUT después de ${CLAUDE_TIMEOUT_MS / 60000}min]\n` + resultText;

      // All attempts exhausted with quick failure → actionable Telegram msg
      if (quickFail) {
        const tried = _usersToTry.join(', ');
        const msg = `Todos los usuarios fallaron (${tried}). Verifica que claude esté en PATH y ANTHROPIC_API_KEY sea válido.`;
        log(project.id, `⚠️  ${msg}`);
        tg(`⚠️ <b>Error spawn — ${project.name}</b>\n<code>${msg}</code>`);
      }

      safeCallback(timedOut ? 1 : (code || 0), resultText.trim());
    });

    c.on('error', (err) => {
      ACTIVE_PIDS.delete(project.id);
      clearTimeout(timer);
      clearInterval(heartbeat);
      clearInterval(filePoller);
      clearInterval(watchdogInterval);
      log(project.id, `runClaude error: ${err.message}`);
      safeCallback(1, `Error lanzando claude: ${err.message}`);
    });
  }

  attachHandlers(child);
}

// ─── DeepSeek V4-Pro code-fix runner (replaces Claude CLI for claude-code-suborq) ───────
// Calls V4-Pro API directly, applies the generated patch, commits and pushes.
// No Claude CLI dependency — zero Anthropic cost for auto-fix tasks.
async function runDeepSeekCodeFix(project, taskContent, callback) {
  const MAX_ATTEMPTS = 3;
  const startTime   = Date.now();
  const repoBase    = project.repo;

  if (!repoBase) {
    callback(1, '## Resultados\n❌ Fix fallido — project.repo no configurado', 0);
    return;
  }

  // Extract file paths mentioned in taskContent
  const pathRegex = /(?:financial\/bot|relay|backend|dashboard-financial)\/[^\s`'"\n)]+\.[jt]s(?:x)?|[^\s`'"\n)]+\.py(?=[^a-zA-Z]|$)/g;
  const mentioned = [...new Set((taskContent.match(pathRegex) || []))].slice(0, 4);

  const fileContexts = [];
  for (const relPath of mentioned) {
    const fullPath = relPath.startsWith('/') ? relPath : path.join(repoBase, relPath);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const snippet = content.split('\n').slice(0, 150).join('\n');
      fileContexts.push(`### ${relPath}\n\`\`\`\n${snippet}\n\`\`\``);
    } catch (_) {}
  }

  const systemPrompt =
    'Eres un ingeniero senior de Node.js/Python para sistemas financieros multi-agente.\n' +
    'Genera un fix de código MÍNIMO. Responde SOLO con JSON válido (sin markdown):\n' +
    '{\n' +
    '  "commit_message": "fix(component): descripción",\n' +
    '  "files": [\n' +
    '    { "path": "ruta/relativa/repo", "search": "texto exacto único", "replace": "texto nuevo" }\n' +
    '  ]\n' +
    '}\n\n' +
    'REGLAS: search debe ser texto EXACTO del archivo (con indentación). Solo JSON, sin explicaciones.';

  const baseUserMsg = `## Tarea\n${taskContent}` +
    (fileContexts.length ? `\n\n## Archivos relevantes\n${fileContexts.join('\n\n')}` : '');

  let lastAttemptError = null;
  let allChanged       = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const critiqueSuffix = lastAttemptError
      ? `\n\n---\n## Auto-crítica — intento ${attempt - 1} falló\n\n` +
        `Error: ${lastAttemptError}\n\n` +
        `Analiza el error. El search text debe coincidir EXACTAMENTE con el archivo (mismo espaciado, misma indentación). ` +
        `Si el error es "search not found", lee el snippet del archivo y ajusta el search. ` +
        `Genera un fix corregido ahora.`
      : '';

    log(project.id, `[deepseek-pro] intento ${attempt}/${MAX_ATTEMPTS} (${fileContexts.length} archivos)…`);

    const raw = await callDeepSeekDirect(systemPrompt, baseUserMsg + critiqueSuffix, 2048, true);

    if (!raw) {
      lastAttemptError = 'respuesta vacía de DeepSeek V4-Pro';
      continue;
    }

    let fix;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      fix = JSON.parse(cleaned);
    } catch (parseErr) {
      log(project.id, `[deepseek-pro] intento ${attempt}: JSON parse error: ${parseErr.message}`);
      lastAttemptError = `JSON inválido: ${parseErr.message} — raw: ${raw.slice(0, 120)}`;
      continue;
    }

    if (!fix?.files?.length) {
      lastAttemptError = 'sin archivos en respuesta V4-Pro';
      continue;
    }

    const changed = [];
    const errors  = [];
    for (const change of fix.files) {
      const fullPath = path.join(repoBase, change.path);
      try {
        let content = fs.readFileSync(fullPath, 'utf8');
        if (!content.includes(change.search)) {
          errors.push(`search not found in ${change.path}`);
          log(project.id, `[deepseek-pro] intento ${attempt}: ⚠ search not found in ${change.path}`);
          continue;
        }
        content = content.replace(change.search, change.replace);
        fs.writeFileSync(fullPath, content, 'utf8');
        changed.push(change.path);
        allChanged.push(change.path);
        log(project.id, `[deepseek-pro] intento ${attempt}: ✓ patched ${change.path}`);
      } catch (e) {
        errors.push(`${change.path}: ${e.message}`);
      }
    }

    if (!changed.length) {
      lastAttemptError = errors.join('; ') || 'sin cambios aplicados';
      if (attempt < MAX_ATTEMPTS) {
        log(project.id, `[deepseek-pro] intento ${attempt} fallido — reintentando…`);
        tg(`⚠️ <b>Auto-fix intento ${attempt}/${MAX_ATTEMPTS} — ${project.name}</b>\nError: <code>${lastAttemptError.slice(0, 150)}</code>\nReintentando con auto-crítica…`);
      }
      continue;
    }

    // Success — commit and push
    const commitMsg = (fix.commit_message || 'fix: auto-fix DeepSeek V4-Pro').replace(/"/g, '\\"');
    const branch    = project.branch || 'main';
    try {
      const addArgs = changed.map(f => `"${f}"`).join(' ');
      execSync(`cd "${repoBase}" && git add ${addArgs}`, { stdio: 'pipe', timeout: 15000 });
      execSync(`cd "${repoBase}" && git commit -m "${commitMsg}"`, { stdio: 'pipe', timeout: 15000 });
      execSync(`cd "${repoBase}" && git push origin ${branch}`, { stdio: 'pipe', timeout: 60000 });
    } catch (gitErr) {
      callback(1,
        `## Resultados\n✅ Archivos modificados: ${changed.join(', ')}\n❌ Git error: ${gitErr.message?.slice(0, 200)}\n\n## Acceso\n- relay: ⚠️ git push fallido\n- api_keys: ✅ DEEPSEEK_API_KEY`,
        0);
      return;
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    const attemptNote = attempt > 1 ? `\n⚠️ [Auto-crítica] — resuelto en intento ${attempt}/${MAX_ATTEMPTS}` : '';
    const resultText = [
      '## Resultados',
      `✅ [Fix aplicado] — ${changed.join(', ')}`,
      `✅ [Commit] — ${commitMsg}`,
      `✅ [Push] — rama ${branch}`,
      ...(errors.length ? [`⚠️ [Parcial] — ${errors.join('; ')}`] : []),
      attemptNote,
      '',
      '## Issues',
      '- Ninguno',
      '',
      '## Acceso',
      `- relay: ✅ (deepseek-pro ${duration}s, intento ${attempt})`,
      '- api_keys: ✅ (DEEPSEEK_API_KEY)',
    ].filter(l => l !== false).join('\n');

    callback(0, resultText, 0);
    return;
  }

  // All attempts exhausted
  const duration   = Math.round((Date.now() - startTime) / 1000);
  const failSummary = `## Resultados\n❌ Fix fallido tras ${MAX_ATTEMPTS} intentos — ${lastAttemptError || 'sin detalles'}\n` +
    (allChanged.length ? `⚠️ Cambios parciales aplicados: ${[...new Set(allChanged)].join(', ')}\n` : '') +
    `\n## Issues\n- Auto-fix agotó ${MAX_ATTEMPTS} intentos (${duration}s) — requiere revisión manual\n- Último error: ${lastAttemptError?.slice(0, 300)}`;

  tg(`🛑 <b>Auto-fix agotó ${MAX_ATTEMPTS} intentos — ${project.name}</b>\n${lastAttemptError?.slice(0, 200)}`);
  callback(1, failSummary, 0);
}

// ─── DeepSeek agentic runner ─────────────────────────────
// Replaces Claude CLI for projects with mode:"deepseek-agent".
// Runs DeepSeek V4-Pro in a tool-calling loop (bash, read_file, write_file, git_commit).
// Same callback signature as runClaude: callback(exitCode, resultText, costUsd).
async function runDeepSeekAgent(project, taskContent, callback, dispatchMeta = {}) {
  const startTime   = Date.now();
  const repoBase    = project.repo || '/var/www/html';
  const branch      = project.branch || 'main';
  const MAX_TURNS   = 25;
  const TOOL_TIMEOUT_MS = 45000;
  const BASH_DENY   = /rm\s+-rf\s+\/(?!tmp|var\/www\/html\/vilarkptl|home)|DROP\s+TABLE\s|TRUNCATE\s+TABLE\s|git\s+push\s+--force|git\s+reset\s+--hard\s+origin/i;

  const DS_TOOLS = [
    {
      type: 'function',
      function: {
        name: 'bash',
        description: 'Run a shell command on the server. Returns stdout+stderr (max 5000 chars).',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command. Working dir is project repo.' },
          },
          required: ['command'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a file from disk. Returns up to 10000 chars.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute path or path relative to project repo.' },
          },
          required: ['path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write content to a file. Creates parent directories if needed.',
        parameters: {
          type: 'object',
          properties: {
            path:    { type: 'string', description: 'File path (absolute or relative to repo).' },
            content: { type: 'string', description: 'Full file content.' },
          },
          required: ['path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'git_commit',
        description: 'Stage specific files, commit, and push to the project branch.',
        parameters: {
          type: 'object',
          properties: {
            files:   { type: 'array',   items: { type: 'string' }, description: 'Files to stage (relative to repo).' },
            message: { type: 'string',  description: 'Commit message.' },
            push:    { type: 'boolean', description: 'Push after commit (default: true).' },
          },
          required: ['files', 'message'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'edit_file',
        description: 'Replace an exact unique string in a file. More precise than write_file for small changes. old_string must appear exactly once.',
        parameters: {
          type: 'object',
          properties: {
            path:       { type: 'string', description: 'File path (absolute or relative to repo).' },
            old_string: { type: 'string', description: 'Exact string to replace — must appear exactly once in the file.' },
            new_string: { type: 'string', description: 'Replacement string.' },
          },
          required: ['path', 'old_string', 'new_string'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_code',
        description: 'Search for a pattern in files using grep. Returns matches with line numbers and context.',
        parameters: {
          type: 'object',
          properties: {
            pattern:       { type: 'string', description: 'Grep pattern (supports regex).' },
            path:          { type: 'string', description: 'File or directory to search (default: project repo).' },
            context_lines: { type: 'integer', description: 'Lines of context around each match (default: 3).' },
          },
          required: ['pattern'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_directory',
        description: 'List files and directories. Use to explore project structure.',
        parameters: {
          type: 'object',
          properties: {
            path:    { type: 'string', description: 'Directory path (absolute or relative to repo).' },
            pattern: { type: 'string', description: 'Optional file name filter (e.g. "*.js").' },
          },
          required: ['path'],
        },
      },
    },
  ];

  const agentCtx  = loadAgentContext(project.id, project.url);
  const agentMem  = loadAgentMemory(project.repo);
  const agentPlan = loadProjectPlan(project.id);

  const systemPrompt = agentCtx
    ? `${agentCtx}${agentPlan}${agentMem}`
    : `Eres el agente de ejecución para el proyecto "${project.name}".
Repo: ${repoBase} | Branch: ${branch}
URL: ${project.url || 'N/A'}

Usa las herramientas para completar la tarea. Al terminar responde EXACTAMENTE:
## Resultados
✅/❌ [acción] — [archivo o evidencia]

## Issues
- [solo si hay algo pendiente]

STATUS: done|partial|blocked
CHANGED: archivo1, archivo2 (o "ninguno")
DEPLOYED: yes|no
PENDING: descripción (o "ninguno")
USER_REQUIRED: no${agentPlan}${agentMem}`;

  const messages = [{ role: 'user', content: taskContent }];
  const model     = process.env.DEEPSEEK_PRO_MODEL || 'deepseek-chat';
  let toolCallCount   = 0;
  let resultText      = '';
  let taskCostUsd     = 0;
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;
  let lastToolName  = null;

  const taskId    = dispatchMeta.id    || `relay-${project.id}-${Date.now()}`;
  const taskDepth = dispatchMeta.depth ?? 0;
  const sessionId = `relay-ds-${project.id}-${Date.now()}`;

  // Heartbeat so Telegram knows we're alive
  const taskTitle = taskContent.split('\n').find(l => /^#{1,3} /.test(l))
    ?.replace(/^#+ /, '').slice(0, 60) || project.name;
  const runStart  = Date.now();
  const heartbeat = setInterval(() => {
    const elapsedMin = Math.round((Date.now() - runStart) / 60000);
    tg(`⏳ <b>DeepSeek agent — ${project.name}</b>
🗂 <code>${taskTitle}</code>
⏱ ${elapsedMin} min | 🔧 ${toolCallCount} herramientas
Última: <code>${lastToolName || 'iniciando…'}</code>`);
  }, RUNNING_WARN_MS);

  const agentTimeout = setTimeout(() => {
    clearInterval(heartbeat);
    if (!resultText) resultText = `## Resultados\n⏰ Timeout deepseek-agent (${Math.round(CLAUDE_TIMEOUT_MS / 60000)}min)\n\nSTATUS: partial\nCHANGED: ninguno\nDEPLOYED: no`;
    callback(1, resultText, taskCostUsd);
  }, CLAUDE_TIMEOUT_MS);

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let response;
      try {
        response = await callDeepSeekWithTools(systemPrompt, messages, DS_TOOLS, model, 4096);
      } catch (e) {
        log(project.id, `[deepseek-agent] API error turn ${turn}: ${e.message?.slice(0, 150)}`);
        resultText = `## Resultados\n❌ DeepSeek API error: ${e.message?.slice(0, 200)}\n\n## Acceso\n- api_keys: ❌ DEEPSEEK_API_KEY\n\nSTATUS: blocked\nCHANGED: ninguno\nDEPLOYED: no`;
        break;
      }

      if (response.usage) {
        // DeepSeek V3 (deepseek-chat): $0.27/M input, $1.10/M output
        // DeepSeek R1 (deepseek-reasoner): $0.55/M input, $2.19/M output
        const isR1 = (model || '').includes('reasoner');
        const inTok  = response.usage.prompt_tokens || 0;
        const outTok = response.usage.completion_tokens || 0;
        totalInputTokens  += inTok;
        totalOutputTokens += outTok;
        taskCostUsd += (inTok * (isR1 ? 0.00055 : 0.00027) + outTok * (isR1 ? 0.00219 : 0.00110)) / 1000;
      }

      const msg = response.choices?.[0]?.message;
      if (!msg) { log(project.id, `[deepseek-agent] empty message turn ${turn}`); break; }

      messages.push(msg);

      if (!msg.tool_calls || !msg.tool_calls.length) {
        resultText = msg.content || `## Resultados\n✅ Agente completó (${toolCallCount} herramientas)\n\nSTATUS: done\nCHANGED: ninguno\nDEPLOYED: no`;
        log(project.id, `[deepseek-agent] done: turn ${turn}, ${toolCallCount} tools, $${taskCostUsd.toFixed(6)}`);
        break;
      }

      // Execute tool calls
      const toolResults = [];
      for (const tc of msg.tool_calls) {
        toolCallCount++;
        const name = tc.function.name;
        lastToolName = name;
        let input = {};
        try { input = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}

        log(project.id, `[deepseek-agent] tool[${turn}]: ${name} — ${JSON.stringify(input).slice(0, 100)}`);
        postEvent({
          session_id:         sessionId,
          event_type:         'pre_tool',
          tool_name:          name,
          tool_input_summary: JSON.stringify(input).slice(0, 300),
          timestamp:          new Date().toISOString(),
          project_name:       project.name,
          api_provider:       'deepseek',
          agent_user:         CLAUDE_USER,
          working_dir:        repoBase,
        });

        let output = '';
        try {
          if (name === 'bash') {
            const cmd = (input.command || '').trim();
            if (BASH_DENY.test(cmd)) {
              output = 'ERROR: Comando bloqueado por política de seguridad.';
            } else {
              const res = execSync(cmd, {
                cwd:     repoBase,
                timeout: TOOL_TIMEOUT_MS,
                stdio:   'pipe',
                env:     { ...process.env },
              });
              output = res.toString().slice(0, 5000) || '(sin output)';
            }
          } else if (name === 'read_file') {
            const fpath = path.isAbsolute(input.path || '')
              ? input.path : path.join(repoBase, input.path || '');
            output = fs.readFileSync(fpath, 'utf8').slice(0, 10000);
          } else if (name === 'write_file') {
            const fpath = path.isAbsolute(input.path || '')
              ? input.path : path.join(repoBase, input.path || '');
            fs.mkdirSync(path.dirname(fpath), { recursive: true });
            fs.writeFileSync(fpath, input.content || '');
            output = `OK: escrito ${fpath}`;
          } else if (name === 'git_commit') {
            const files    = (input.files || []).map(f => `"${f.replace(/"/g, '\\"')}"`).join(' ');
            const commitMsg = (input.message || 'fix').replace(/'/g, '"').slice(0, 200);
            const shouldPush = input.push !== false;
            const pushPart   = shouldPush ? ` && git push origin ${branch} --quiet` : '';
            if (!files.trim()) { output = 'ERROR: no files specified'; }
            else {
              const res = execSync(
                `cd ${repoBase} && git add ${files} && git diff --cached --quiet || (git commit -m '${commitMsg}' --quiet${pushPart})`,
                { timeout: 45000, stdio: 'pipe' }
              );
              output = `OK: ${res.toString().trim() || 'committed'}`;
            }
          } else if (name === 'edit_file') {
            const fpath = path.isAbsolute(input.path || '') ? input.path : path.join(repoBase, input.path || '');
            const content = fs.readFileSync(fpath, 'utf8');
            const count = content.split(input.old_string || '').length - 1;
            if (count === 0) { output = `ERROR: old_string no encontrado en ${input.path}`; }
            else if (count > 1) { output = `ERROR: old_string coincide ${count} veces — sé más específico`; }
            else { fs.writeFileSync(fpath, content.replace(input.old_string, input.new_string || ''), 'utf8'); output = `OK: editado ${input.path}`; }
          } else if (name === 'search_code') {
            const ctx = input.context_lines || 3;
            const sp  = input.path ? (path.isAbsolute(input.path) ? input.path : path.join(repoBase, input.path)) : repoBase;
            try {
              const res = execSync(`grep -rn --context=${ctx} ${JSON.stringify(input.pattern || '')} "${sp}" 2>/dev/null | head -200`, { timeout: 10000, stdio: 'pipe' });
              output = res.toString().slice(0, 5000) || '(sin coincidencias)';
            } catch (_) { output = '(sin coincidencias)'; }
          } else if (name === 'list_directory') {
            const dp = input.path ? (path.isAbsolute(input.path) ? input.path : path.join(repoBase, input.path)) : repoBase;
            try {
              const res = execSync(input.pattern ? `find "${dp}" -maxdepth 2 -name "${input.pattern}" 2>/dev/null | head -100` : `ls -la "${dp}" 2>/dev/null | head -100`, { timeout: 5000, stdio: 'pipe' });
              output = res.toString().slice(0, 3000);
            } catch (e) { output = `ERROR: ${e.message.slice(0, 200)}`; }
          } else {
            output = `ERROR: herramienta desconocida "${name}"`;
          }
        } catch (e) {
          output = `ERROR: ${e.message?.slice(0, 500)}`;
        }

        toolResults.push({ role: 'tool', tool_call_id: tc.id, content: output });
      }

      messages.push(...toolResults);
    }

    if (!resultText) {
      resultText = `## Resultados\n⚠️ Agente alcanzó límite de ${MAX_TURNS} turnos sin respuesta final\n\nSTATUS: partial\nCHANGED: ninguno\nDEPLOYED: no`;
    }
  } finally {
    clearTimeout(agentTimeout);
    clearInterval(heartbeat);
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  log(project.id, `[deepseek-agent] completado: ${duration}s, ${toolCallCount} tools, $${taskCostUsd.toFixed(6)}`);
  postProviderCost('deepseek', model || 'deepseek-chat', project.id, totalInputTokens, totalOutputTokens, taskCostUsd);
  callback(0, resultText.trim(), taskCostUsd);
}

// ─── Pre-push commit safety validation ───────────────────
const DANGEROUS_PATTERNS = [/^node_modules\//, /\.env$/, /\.env\./, /^nohup\.out$/, /^FETCH_HEAD$/];

function validateAndCleanCommits(repoPath, branch) {
  const projectId = path.basename(repoPath);
  try {
    const raw = execSync(
      `cd ${repoPath} && git log origin/${branch}..HEAD --name-only --pretty=format: 2>/dev/null || true`,
      { stdio: 'pipe', timeout: 15000 }
    ).toString();
    const files = raw.split('\n').map(f => f.trim()).filter(Boolean);
    if (!files.length) return;

    const dangerous = files.filter(f => DANGEROUS_PATTERNS.some(r => r.test(f)));
    const tooMany   = files.length > 100;

    if (dangerous.length > 0) {
      const preview = dangerous.slice(0, 5).map(f => `• <code>${f}</code>`).join('\n');
      const more    = dangerous.length > 5 ? `\n… +${dangerous.length - 5} más` : '';
      log(projectId, `SEGURIDAD: archivos peligrosos en commits sin push: ${dangerous.join(', ').slice(0, 300)}`);
      tg(`🚨 <b>Commit peligroso bloqueado — ${projectId}</b>\n${preview}${more}\nLimpiando automáticamente…`);
      let autoFixed = false;
      try {
        const quoted = dangerous.map(f => `"${f.replace(/"/g, '\\"')}"`).join(' ');
        execSync(`cd ${repoPath} && git rm -r --cached ${quoted} 2>/dev/null || true`, { stdio: 'pipe', timeout: 15000 });
        execSync(`cd ${repoPath} && git diff --cached --quiet || git commit --amend -C HEAD --no-edit --quiet`, { stdio: 'pipe', timeout: 15000 });
        ensureGitignore(repoPath);
        autoFixed = true;
        tg(`✅ <b>Limpieza OK — ${projectId}</b>\nArchivos peligrosos removidos del historial.`);
      } catch (cleanErr) {
        tg(`⚠️ <b>Limpieza manual requerida — ${projectId}</b>\n<code>${cleanErr.message?.slice(0, 200)}</code>`);
      }
      postAlert('commit_dangerous', projectId, 'critical',
        `Commit peligroso — ${projectId}`,
        dangerous.join(', ').slice(0, 1000),
        autoFixed);
    } else if (tooMany) {
      log(projectId, `WARN: commit masivo — ${files.length} archivos`);
      tg(`⚠️ <b>Commit masivo — ${projectId}</b>\n${files.length} archivos en commits sin push. Verificar antes de continuar.`);
      postAlert('commit_massive', projectId, 'warning',
        `Commit masivo — ${projectId}: ${files.length} archivos`,
        files.slice(0, 20).join('\n'));
    }
  } catch (err) {
    log(projectId, `validateCommits error: ${err.message?.slice(0, 100)}`);
  }
}

function ensureGitignore(repoPath) {
  const gitignorePath = path.join(repoPath, '.gitignore');
  const REQUIRED = ['node_modules/', '.env', '*.env.*', '*.bak', 'nohup.out', 'FETCH_HEAD'];
  try {
    const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
    const toAdd = REQUIRED.filter(r => !existing.split('\n').some(l => l.trim() === r));
    if (toAdd.length > 0) {
      fs.appendFileSync(gitignorePath, '\n# relay-master safety\n' + toAdd.join('\n') + '\n');
      log(path.basename(repoPath), `.gitignore actualizado: ${toAdd.join(', ')}`);
    }
  } catch (_) {}
}

// ─── Git pull + push for a project ───────────────────────
function gitPull(repoPath, branch) {
  const projectId = path.basename(repoPath);
  let originalBranch = '';
  try {
    if (GITHUB_TOKEN) {
      execSync(
        `cd ${repoPath} && git remote set-url origin "https://${GITHUB_TOKEN}@github.com/$(git remote get-url origin | sed 's|.*github.com[:/]||')" 2>/dev/null || true`,
        { stdio: 'ignore' }
      );
    }
    // Abort any in-progress rebase/merge
    try { execSync(`cd ${repoPath} && git rebase --abort 2>/dev/null || true`, { stdio: 'pipe', timeout: 5000 }); } catch (_) {}
    try { execSync(`cd ${repoPath} && git merge --abort 2>/dev/null || true`, { stdio: 'pipe', timeout: 5000 }); } catch (_) {}

    // Fetch the target branch
    try {
      execSync(`cd ${repoPath} && git fetch origin ${branch} --quiet`, { stdio: 'pipe', timeout: 30000 });
    } catch (_) {}

    // If already on the correct branch, fast-forward only (safe, no detach risk).
    // If on a DIFFERENT branch (e.g. DeCabeceraTax shared by 3 projects on different branches),
    // force-checkout the target branch to update working tree, then restore original branch
    // in the finally block — prevents permanent branch switch that would cause
    // checkSelfReload to detect master.js hash change and trigger restart loop.
    try {
      originalBranch = execSync(`cd ${repoPath} && git symbolic-ref --short HEAD 2>/dev/null`, { stdio: 'pipe', timeout: 5000 }).toString().trim();
    } catch (_) {}

    try {
      if (originalBranch === branch) {
        // Try fast-forward first; if diverged (local has extra commits), rebase onto origin
        const ffResult = require('child_process').spawnSync(
          'bash', ['-c', `cd ${repoPath} && git merge origin/${branch} --ff-only --quiet 2>&1`],
          { stdio: 'pipe', timeout: 30000 }
        );
        if (ffResult.status !== 0) {
          log(projectId, `gitPull: ff-only falló → merge con origin/${branch}`);
          // Stash any local modifications (staged/unstaged) so merge can proceed cleanly
          try { execSync(`cd ${repoPath} && git stash push -u --quiet 2>/dev/null || true`, { stdio: 'pipe', timeout: 10000 }); } catch (_) {}
          // Merge origin into local — prefer origin for conflicts, never rewrite local commits
          execSync(
            `cd ${repoPath} && git merge origin/${branch} -X theirs --no-edit --quiet 2>/dev/null || (git merge --abort 2>/dev/null; true)`,
            { stdio: 'pipe', timeout: 30000 }
          );
        }
      } else {
        execSync(`cd ${repoPath} && git checkout -B ${branch} origin/${branch} --quiet -f 2>/dev/null || true`, { stdio: 'pipe', timeout: 10000 });
      }
    } catch (checkoutErr) {
      log(projectId, `gitPull: update ${branch} falló — ${checkoutErr.message?.slice(0, 150)}`);
    }
  } catch (err) {
    log(projectId, `gitPull error: ${err.message?.slice(0, 200)}`);
  } finally {
    // Restore the original branch after a cross-branch checkout so relay-master's
    // working tree (and relay/master.js) stays on the relay's own branch.
    if (originalBranch && originalBranch !== branch) {
      try {
        execSync(`cd ${repoPath} && git checkout ${originalBranch} --quiet 2>/dev/null || true`, { stdio: 'pipe', timeout: 10000 });
      } catch (_) {}
    }
  }

  // Fix .git/objects ownership so Claude agents (non-root) can commit.
  // relay-master runs as root → git pull creates objects owned by root →
  // agent (running as CLAUDE_USER) hits EACCES on next commit attempt.
  // Also chown the full working tree so agents can write project files (Edit tool).
  if (CLAUDE_USER && CLAUDE_USER !== 'root') {
    try {
      execSync(`chown -R ${CLAUDE_USER} ${repoPath} 2>/dev/null || true`, { stdio: 'pipe', timeout: 10000 });
    } catch (_) {}
  }
}

function gitPushOutbox(repoPath, branch, outboxPath, timestamp, outboxContent) {
  const projectId = path.basename(repoPath);
  // Save current branch so we can restore after checkout-B (prevents permanent
  // branch switch that would cause checkSelfReload to loop when this repo contains
  // relay/master.js — e.g. finbot-coordinator switching to claude/financial-* branch)
  let originalBranch = '';
  try {
    originalBranch = execSync(`cd ${repoPath} && git symbolic-ref --short HEAD 2>/dev/null`, { stdio: 'pipe', timeout: 5000 }).toString().trim();
  } catch (_) {}

  try {
    // Ensure we are on the correct branch (shared repos like DeCabeceraTax have
    // multiple projects on different branches; checkout -B resets without detaching)
    try {
      execSync(
        `cd ${repoPath} && git fetch origin ${branch} --quiet && git checkout -B ${branch} origin/${branch} --quiet`,
        { stdio: 'pipe', timeout: 30000 }
      );
      if (outboxContent) fs.writeFileSync(outboxPath, outboxContent);
    } catch (checkoutErr) {
      log(projectId, `git checkout ${branch} falló: ${checkoutErr.message?.slice(0,200)}`);
    }
    // Validate agent commits before pushing (catches node_modules, .env, etc.)
    validateAndCleanCommits(repoPath, branch);

    // P0.2 — retry outbox push up to 3 times with 5s backoff
    let pushOk = false;
    let lastPushErr = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        execSync(
          `cd ${repoPath} && git add ${outboxPath} && git diff --cached --quiet || git commit -m "relay: resultado ${timestamp}" --quiet && git push origin HEAD:${branch} --quiet`,
          { stdio: 'pipe', timeout: 30000 }
        );
        pushOk = true;
        break;
      } catch (pushErr) {
        lastPushErr = pushErr.message?.slice(0, 200) || 'unknown';
        if (attempt < 3) {
          log(projectId, `outbox push intento ${attempt} falló — reintentando en 5s`);
          try { execSync(`cd ${repoPath} && git fetch origin ${branch} --quiet && git merge origin/${branch} -X ours --no-edit --quiet 2>/dev/null || true`, { stdio: 'pipe', timeout: 15000 }); } catch (_) {}
          try { execSync('sleep 5', { stdio: 'pipe', timeout: 8000 }); } catch (_) {}
        }
      }
    }
    if (pushOk) {
      log(projectId, `outbox push OK → ${branch}`);
    } else {
      throw new Error(lastPushErr);
    }
  } catch (err) {
    const msg = err.message?.slice(0, 300) || 'unknown error';
    log(projectId, `ERROR: outbox push falló (3 intentos): ${msg}`);
    tg(`⚠️ <b>Outbox push falló — ${projectId}</b>\n<code>${msg}</code>`);
    postToMonitor('/api/alerts', { alert_type: 'outbox_push_failed', project_id: projectId, severity: 'warning', title: `Outbox push falló — ${projectId}`, details: msg });
  } finally {
    // Restore original branch to avoid leaving master.js at an unexpected version
    if (originalBranch && originalBranch !== branch) {
      try {
        execSync(`cd ${repoPath} && git checkout ${originalBranch} --quiet 2>/dev/null || true`, { stdio: 'pipe', timeout: 10000 });
      } catch (_) {}
    }
  }
}

// ─── Git push inbox (for dispatch) ───────────────────────
function gitPushInbox(repoPath, branch, inboxPath, dispatchId, inboxContent) {
  const projectId = path.basename(repoPath);
  let originalBranch = '';
  try {
    originalBranch = execSync(`cd ${repoPath} && git symbolic-ref --short HEAD 2>/dev/null`, { stdio: 'pipe', timeout: 5000 }).toString().trim();
  } catch (_) {}

  try {
    // Checkout correct branch (handles shared repos with multiple projects on different branches)
    try {
      execSync(
        `cd ${repoPath} && git fetch origin ${branch} --quiet && git checkout -B ${branch} origin/${branch} --quiet`,
        { stdio: 'pipe', timeout: 30000 }
      );
      if (inboxContent) fs.writeFileSync(inboxPath, inboxContent);
    } catch (_) { /* proceed with current state */ }
    execSync(
      `cd ${repoPath} && git add ${inboxPath} && git diff --cached --quiet || git commit -m "dispatch: tarea ${dispatchId}" --quiet && git push origin HEAD:${branch} --quiet`,
      { stdio: 'pipe', timeout: 30000 }
    );
    log(projectId, `inbox push OK (dispatch ${dispatchId})`);
  } catch (err) {
    log(projectId, `inbox push falló (dispatch ${dispatchId}): ${err.message?.slice(0,200)}`);
    // Continue anyway — relay-master will pick up the file change locally
  } finally {
    if (originalBranch && originalBranch !== branch) {
      try {
        execSync(`cd ${repoPath} && git checkout ${originalBranch} --quiet 2>/dev/null || true`, { stdio: 'pipe', timeout: 10000 });
      } catch (_) {}
    }
  }
}

// ─── Dispatch queue (pending-dispatches.json) ────────────
function readDispatchQueue() {
  try { return JSON.parse(fs.readFileSync(DISPATCH_FILE, 'utf8')); }
  catch (_) { return []; }
}
function saveDispatchQueue(q) {
  fs.writeFileSync(DISPATCH_FILE, JSON.stringify(q, null, 2) + '\n');
}

async function processDispatchQueue(projects, hashes = null) {
  if (GLOBAL_KILLED) { log(null, 'Kill-switch activo — dispatch queue pausada'); return; }
  if (isQuietHour()) { log(null, 'Quiet hours — dispatch queue pausada'); return; }
  const queue = readDispatchQueue();
  const pending = queue.filter(d => d.status === 'pending');
  if (!pending.length) return;

  const updated = [...queue];

  for (const dispatch of pending) {
    const target = projects.find(p => p.id === dispatch.project && p.active && p.inbox);
    if (!target) {
      log(null, `Dispatch ${dispatch.id}: proyecto '${dispatch.project}' no encontrado`);
      const idx = updated.findIndex(d => d.id === dispatch.id);
      updated[idx] = { ...dispatch, status: 'error', dispatched_at: new Date().toISOString() };
      continue;
    }

    log(null, `Dispatch → ${target.name}: ${dispatch.task.slice(0, 80)}`);

    // Max dispatch depth — block recursive coordinator chains beyond depth 3
    const taskDepth = parseInt(dispatch.depth || 0);
    const MAX_DISPATCH_DEPTH = parseInt(process.env.MAX_DISPATCH_DEPTH || '3');
    if (taskDepth >= MAX_DISPATCH_DEPTH) {
      log(null, `Dispatch ${dispatch.id}: depth ${taskDepth} >= max ${MAX_DISPATCH_DEPTH} — bloqueado`);
      tg(`🚫 <b>Dispatch bloqueado — profundidad máxima</b>\nDepth ${taskDepth} en proyecto ${target.name}\n<code>${dispatch.task.slice(0, 200)}</code>`);
      const idx = updated.findIndex(d => d.id === dispatch.id);
      updated[idx] = { ...dispatch, status: 'error', dispatched_at: new Date().toISOString(), error: `max_depth:${MAX_DISPATCH_DEPTH}` };
      continue;
    }

    // Inject budget_usd_max for sub-dispatches without one (coordinator → agent).
    // Proportional: 40% of parent budget, min $0.50, max $5.00.
    // Prevents a coordinator with $10 budget from spawning 5 × $2 tasks unchecked.
    let inboxTask = dispatch.task;
    if (!inboxTask.match(/budget_usd_max\s*[:=]/i) &&
        (taskDepth >= 1 || dispatch.requester === 'coordinator')) {
      const parentBudget = parseBudgetMax(dispatch.task);  // default $2.00
      const BUDGET_SUB_FRACTION = parseFloat(process.env.BUDGET_SUB_FRACTION || '0.4');
      const subBudget = Math.max(0.50, Math.min(+(parentBudget * BUDGET_SUB_FRACTION).toFixed(2), 5.00));
      inboxTask = `budget_usd_max: ${subBudget}\n\n` + inboxTask;
    }

    // Write task to target inbox (append outbox template so agent always fills it)
    const OUTBOX_TEMPLATE =
      '\n\n---\n## Outbox — rellenar antes de terminar la sesión\n\n' +
      '```\n' +
      'STATUS: done | partial | failed\n' +
      'CHANGED: archivo.js:línea, otro.js\n' +
      'COMMIT: (hash)\n' +
      'DEPLOYED: yes | no\n' +
      'PENDING: (qué falta o "nada")\n' +
      'USER_REQUIRED: no | sí — (razón)\n' +
      '```\n';
    try {
      fs.writeFileSync(target.inbox, inboxTask + OUTBOX_TEMPLATE);
    } catch (err) {
      log(null, `Dispatch ${dispatch.id}: no pudo escribir inbox: ${err.message}`);
      const idx = updated.findIndex(d => d.id === dispatch.id);
      updated[idx] = { ...dispatch, status: 'error', dispatched_at: new Date().toISOString() };
      continue;
    }

    // Reset stored hash so processProject always detects the new inbox content
    try {
      const h = loadHashes();
      delete h[target.id];
      saveHashes(h);
      // Also reset in-memory hashes so the current poll cycle picks it up
      if (hashes) delete hashes[target.id];
    } catch (_) {}

    // Push to GitHub if configured
    if (target.repo && target.branch) {
      gitPushInbox(target.repo, target.branch, target.inbox, dispatch.id, dispatch.task);
    }

    // Track dispatch time for outbox watchdog
    DISPATCH_TIMES[dispatch.project] = {
      dispatched_at: Date.now(),
      dispatch_id:   dispatch.id,
    };

    const idx = updated.findIndex(d => d.id === dispatch.id);
    updated[idx] = { ...dispatch, status: 'dispatched', dispatched_at: new Date().toISOString() };

    // Update DB status so dashboard shows 'dispatched' not 'pending'
    postToMonitor(`/api/relay/dispatch/${dispatch.id}/dispatched`, {});

    tg(`📤 <b>Tarea despachada — ${target.name}</b>\n<code>${dispatch.task.slice(0, 300)}</code>`);
  }

  saveDispatchQueue(updated);
}

// ─── Outbox watchdog (detects stuck agents) ───────────────
function checkOutboxWatchdog(projects) {
  const now = Date.now();
  for (const [projectId, info] of Object.entries(DISPATCH_TIMES)) {
    const elapsed = now - info.dispatched_at;
    if (elapsed < OUTBOX_TIMEOUT_MS) continue;

    const project = projects.find(p => p.id === projectId);
    if (!project || !project.outbox) continue;

    // Check if outbox was updated after dispatch
    try {
      const outboxMtime = fs.statSync(project.outbox).mtimeMs;
      if (outboxMtime > info.dispatched_at) {
        // Outbox updated — clear watchdog
        delete DISPATCH_TIMES[projectId];
        continue;
      }
    } catch (_) {}

    // Outbox not updated in 35min → alert coordinator
    log(projectId, `WATCHDOG: ${project.name} sin outbox después de ${Math.round(elapsed/60000)}min`);
    tg(`⏰ <b>Watchdog — ${project.name}</b>\nSin respuesta después de ${Math.round(elapsed/60000)} min\nDispatch ID: <code>${info.dispatch_id}</code>`);

    // Notify coordinator via dispatch
    const queue = readDispatchQueue();
    const coordinator = projects.find(p => p.id === 'coordinator' && p.active && p.inbox);
    if (coordinator) {
      try {
        const alert =
          `# Watchdog Alert — ${project.name}\n\n` +
          `El agente "${project.name}" lleva ${Math.round(elapsed/60000)} min sin actualizar su outbox.\n` +
          `Dispatch ID original: ${info.dispatch_id}\n\n` +
          `Revisa el estado y decide si reintentar o escalar al usuario.`;
        fs.writeFileSync(coordinator.inbox, alert);
        if (coordinator.repo && coordinator.branch) {
          gitPushInbox(coordinator.repo, coordinator.branch, coordinator.inbox, 'watchdog-' + projectId);
        }
        log(null, `Watchdog: alerta enviada al coordinador para ${projectId}`);
      } catch (err) {
        log(null, `Watchdog: error alertando coordinador: ${err.message}`);
      }
    }

    // Remove from watchdog to avoid repeat alerts
    delete DISPATCH_TIMES[projectId];
  }
}

// ─── P0.1 Stuck dispatch task auto-expiry ────────────────
// Tasks stuck in dispatched/pending for >30 min are marked failed.
const STUCK_TASK_MS = parseInt(process.env.STUCK_TASK_MS || '1800000'); // 30 min
const _expiredTasks = new Set(); // avoid double-expiring same task

async function checkStuckDispatchTasks() {
  let tasks = [];
  try {
    const res = await postToMonitorAsync('GET', '/api/relay/dispatch');
    if (!res) return;
    tasks = JSON.parse(res);
  } catch (_) { return; }

  const now = Date.now();
  for (const task of tasks) {
    if (!['dispatched', 'pending'].includes(task.status)) continue;
    if (_expiredTasks.has(task.id)) continue;
    const age = now - new Date(task.dispatched_at || task.created_at).getTime();
    if (age < STUCK_TASK_MS) continue;

    _expiredTasks.add(task.id);
    const ageMin = Math.round(age / 60000);
    log(null, `STUCK: tarea ${task.id.slice(0,8)} (${task.project}) atascada ${ageMin}min — expirando`);

    try { await postToMonitorAsync('POST', `/api/relay/dispatch/${task.id}/expire`, { reason: `atascada ${ageMin} min sin respuesta` }); } catch (_) {}

    tg(`⏱ <b>Tarea expirada — ${task.project}</b>\n<i>${(task.title || '').slice(0, 120)}</i>\nAtascada <b>${ageMin} min</b> en estado ${task.status}\nID: <code>${task.id.slice(0,8)}</code>`);
    postToMonitor('/api/alerts', { alert_type: 'stuck_task', project_id: task.project, severity: 'warning', title: `Tarea atascada ${ageMin}min — ${task.project}`, details: `id=${task.id} status=${task.status} title=${task.title?.slice(0,100)}` });
  }
}

// Async helper for GET requests to monitor API
function postToMonitorAsync(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(MONITOR_API + urlPath);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const bodyStr = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: url.hostname, port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search, method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
    };
    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── Process one project inbox ────────────────────────────
// pulledRepos is passed from the main loop to avoid pulling the same repo
// multiple times per cycle (coordinator + fiscalai + fiscalai-front share DeCabeceraTax)
async function processProject(project, hashes, pulledRepos = new Set()) {
  if (!project.active || !project.inbox) return;
  if (GLOBAL_KILLED) { log(project.id, `Kill-switch activo (${GLOBAL_KILL_MSG || 'gasto diario'}) — saltando`); return; }
  if (getProjectKilled(project.id)) { log(project.id, `project_killed: presupuesto mensual agotado — saltando`); return; }
  if (isQuietHour() && !project.ignore_quiet_hours) { log(project.id, 'Quiet hours (11pm–8am MX) — tarea diferida'); return; }

  // Git pull — deduplicated per repo path to avoid concurrent git lock conflicts
  if (project.repo && project.branch && !pulledRepos.has(project.repo)) {
    gitPull(project.repo, project.branch);
    pulledRepos.add(project.repo);
    checkSelfReload();    // restart relay-master if master.js changed on disk
    checkBackendReload(); // restart ai-monitor backend if server.js changed on disk
    checkRelayDeps();     // npm install if relay/package.json changed
  }

  const currentHash = fileHash(project.inbox);
  if (!currentHash) return;
  if (hashes[project.id] === currentHash) return;  // no change — check BEFORE rate limit

  // Rate limit only counts when there's actually a new task to execute
  if (isRateLimited(project.id)) {
    log(project.id, `Rate limit: >${DISPATCH_RATE_LIMIT} dispatches/h — tarea diferida`);
    // Notify Telegram at most once per project per hour (not every 15s)
    const alertKey = `ratelimit_${project.id}`;
    const lastAlert = PROVIDER_LAST_ALERT[alertKey] || 0;
    if (Date.now() - lastAlert > DISPATCH_WINDOW_MS) {
      PROVIDER_LAST_ALERT[alertKey] = Date.now();
      tg(`⏸ Rate limit en ${project.id} — max ${DISPATCH_RATE_LIMIT} dispatches/h alcanzado`);
    }
    return;
  }

  // Changed! Try to acquire per-project lock (other projects run in parallel)
  if (!acquireLock(project.id)) {
    const elapsed    = Date.now() - (TASK_START_TIMES[project.id] || Date.now());
    const elapsedMin = Math.round(elapsed / 60000);
    const lastWarn   = LAST_RUNNING_WARN[project.id] || 0;
    if (elapsed > RUNNING_WARN_MS && Date.now() - lastWarn > RUNNING_WARN_MS) {
      LAST_RUNNING_WARN[project.id] = Date.now();
      const remainMin = Math.max(0, Math.round((CLAUDE_TIMEOUT_MS - elapsed) / 60000));
      tg(`⏳ <b>Aún ejecutando — ${project.name}</b>
🗂 En proceso por <b>${elapsedMin} min</b>

La tarea sigue corriendo. Timeout automático en ${remainMin} min.

Si crees que está colgado:
  🔄 <code>pm2 restart relay-master</code>
  ✍️ O escribe una nueva tarea para interrumpir`);
    }
    log(project.id, `Tarea en curso — ${elapsedMin}min transcurridos`);
    return;
  }

  hashes[project.id] = currentHash;
  saveHashes(hashes);

  const taskContent = fs.readFileSync(project.inbox, 'utf8');

  // Skip empty or placeholder inboxes
  if (!taskContent.trim() || taskContent.trim().length < 20) {
    log(project.id, 'Inbox vacío o placeholder — esperando tarea real');
    releaseLock(project.id);
    return;
  }

  const { title, items } = parseInbox(taskContent);
  const startTime = Date.now();

  log(project.id, `Nueva tarea: ${title}`);

  // ── Journal: check state before running ──────────────
  const journal = loadJournal(project.id);
  if (journal.state === 'stopped' && project.id !== 'coordinator') {
    // Only block auto-chained tasks; user can always force by writing new inbox
    // We check if this is a "new" task vs repeated attempt
    const lastTask = journal.recent_tasks[0];
    if (lastTask && lastTask.title === title) {
      log(project.id, `JOURNAL STOP: 3 fallos consecutivos — tarea bloqueada`);
      const failList = journal.recent_tasks
        .filter(t => t.status === 'failed').slice(0, 3)
        .map(t => `❌ ${t.title.slice(0, 60)} (${Math.round(t.duration_sec)}s)`);
      tg(`🛑 <b>Agente detenido — ${project.name}</b>
🗂 <b>${title}</b>

3 fallos consecutivos — requiere intervención humana.

<b>Historial de errores:</b>
<code>${failList.join('\n') || 'Sin detalles'}</code>

💬 Para continuar: escribe una tarea con <b>título diferente</b> en el inbox,\no corrige el problema y empuja el mismo inbox de nuevo.`);
      releaseLock(project.id);
      return;
    }
    // Different title = user wrote a new task → reset state and run
    journal.state = 'active';
    saveJournal(project.id, journal);
  }

  // ── Phase 1.2: Budget cap — check before running ──────
  const budgetMax     = parseBudgetMax(taskContent);
  const planCostSoFar = (journal.plan_title === title ? journal.plan_cost_usd : 0) || 0;
  if (planCostSoFar >= budgetMax) {
    log(project.id, `Budget agotado: $${planCostSoFar.toFixed(4)} >= $${budgetMax.toFixed(2)} — bloqueando`);
    tg(`💸 <b>Budget agotado — ${project.name}</b>
🗂 <b>${title}</b>

Gastado: <b>$${planCostSoFar.toFixed(4)}</b> de $${budgetMax.toFixed(2)} máximo.

Para continuar: edita el inbox con un nuevo plan o agrega <code>budget_usd_max: ${(budgetMax * 2).toFixed(2)}</code>`);
    releaseLock(project.id);
    return;
  }
  if (planCostSoFar > 0 && planCostSoFar / budgetMax >= 0.8) {
    tg(`⚠️ <b>Budget al ${Math.round(planCostSoFar / budgetMax * 100)}% — ${project.name}</b>
🗂 ${title}
$${planCostSoFar.toFixed(4)} gastado de $${budgetMax.toFixed(2)}`);
  }

  // ── Telegram: inicio con plan + criterios ────────────
  const planItems     = parsePlanSection(taskContent);
  const criteriaItems = parseCriteriaSection(taskContent);

  const planList = planItems.length
    ? planItems.map((l, i) => `  ${i+1}. ${l.replace(/^[0-9]+\. |^- /, '')}`).join('\n')
    : (items.map(l => `  ${l}`).join('\n') || taskContent.split('\n').filter(l=>l.trim()).slice(0,5).join('\n'));

  const criteriaBlock = criteriaItems.length
    ? `\n\n<b>Verificar al terminar:</b>\n<code>${criteriaItems.map(l=>`  ${l.replace(/^[-•*]\s*/,'')}`).join('\n')}</code>`
    : '';

  const journalBlock = journal.total_tasks > 0
    ? `\n🔁 Iteración #${journal.total_tasks + 1} | ✅×${journal.consecutive_successes} ❌×${journal.consecutive_failures}`
    : '';

  tg(`📋 <b>${project.name}</b>
🗂 <b>${title}</b>${journalBlock}

<b>Plan:</b>
<code>${planList}</code>${criteriaBlock}

⏳ Ejecutando en servidor…`);

  // ── Notify monitor API ────────────────────────────────
  postEvent({
    session_id:   `relay-${project.id}-${Date.now()}`,
    event_type:   'pre_tool',
    tool_name:    'RelayTask',
    tool_input_summary: title,
    timestamp:    new Date().toISOString(),
    project_name: project.name,
    api_provider: 'anthropic',
    agent_user:   CLAUDE_USER,
    resumed:      getResumeSession(project.id) ? 1 : 0,
  });

  // ── Execute Claude ────────────────────────────────────
  // Capture dispatch ID immediately and clear DISPATCH_TIMES so a new dispatch
  // that arrives while Claude is running cannot be claimed by this callback.
  const activeDM = DISPATCH_TIMES[project.id] || {};
  if (activeDM.dispatch_id) delete DISPATCH_TIMES[project.id];

  // ── Phase 1.1: Degradation guard — record pre-run git SHA ────────────────
  let preRunSha = null;
  if (project.repo && project.branch) {
    try {
      preRunSha = execSync(
        `cd ${project.repo} && git rev-parse HEAD 2>/dev/null`,
        { stdio: 'pipe', timeout: 5000 }
      ).toString().trim();
    } catch (_) {}
  }

  // Bug 1 fix: adaptive timeout — halve per prior failure (min 5 min) so
  // a stuck task gets killed earlier on retries instead of always consuming
  // the full CLAUDE_TIMEOUT_MS (which can be 30 min or more on the server).
  const adaptiveTimeout = journal.consecutive_failures > 0
    ? Math.max(5 * 60 * 1000, Math.round(CLAUDE_TIMEOUT_MS / (1 + journal.consecutive_failures)))
    : CLAUDE_TIMEOUT_MS;
  if (adaptiveTimeout < CLAUDE_TIMEOUT_MS) {
    log(project.id, `adaptive timeout: ${Math.round(adaptiveTimeout / 60000)}min (${journal.consecutive_failures} fallos previos)`);
  }

  function onTaskComplete(exitCode, resultRaw, costUsd = 0) {
    releaseLock(project.id);
    const duration  = Math.round((Date.now() - startTime) / 1000);
    const timestamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

    // Parse structured result items from ## Resultados section
    const isTimeout   = resultRaw.startsWith('[TIMEOUT');
    const resultItems = parseResultSection(resultRaw);
    const issueItems  = parseIssuesSection(resultRaw);
    const formatted   = isTimeout
      ? [`❌ Timeout después de ${Math.round(CLAUDE_TIMEOUT_MS / 60000)} min`, `⚠️ Tarea interrumpida — no se completó`]
      : formatResultItems(resultItems, exitCode);

    // Update journal FIRST (auto-stop logic runs here)
    const updatedJournal = updateJournal(project.id, {
      title,
      exitCode,
      resultSummary: formatted.slice(0, 3).join(' | '),
      durationSec:   duration,
      fullResult:    resultRaw,
      costUsd,
    });

    // Accumulate task result into agent-memory.md and push to git
    if (project.repo) {
      appendAgentMemory(project.repo, project.name, title, resultItems, issueItems);
      const memPath = path.join(project.repo, 'relay', 'agent-memory.md');
      if (project.branch && fs.existsSync(memPath)) {
        try {
          execSync(
            `cd ${project.repo} && git add relay/agent-memory.md && git diff --cached --quiet || git commit -m "relay: memoria acumulada ${timestamp}" --quiet && git push origin ${project.branch} --quiet`,
            { stdio: 'pipe', timeout: 30000 }
          );
          log(project.id, 'agent-memory.md pushed OK');
        } catch (memErr) {
          log(project.id, `agent-memory push falló (non-fatal): ${memErr.message?.slice(0, 100)}`);
        }
      }
    }

    // ── CI runner — runs after successful agent commit ──
    if (project.ci_enabled && project.repo && exitCode === 0 && !isTimeout) {
      const ciCmd = project.ci_command ||
        `cd "${project.repo}" && find . -name "*.js" -not -path "*/node_modules/*" -not -path "*/.git/*" | head -40 | xargs -r node --check 2>&1 | head -30`;
      try {
        const ciOut = execSync(ciCmd, { timeout: 30_000, stdio: 'pipe', cwd: project.repo }).toString().trim();
        log(project.id, `CI: PASS`);
        tg(`✅ <b>CI pasó — ${project.name}</b>\n🗂 ${title}`);
      } catch (e) {
        const errMsg = (e.stdout?.toString() || e.message || '').slice(0, 500);
        log(project.id, `CI: FAIL — ${errMsg.slice(0, 100)}`);
        tg(`🚨 <b>CI falló — ${project.name}</b>\n🗂 ${title}\n<code>${errMsg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0, 400)}</code>`);
      }
    }


    // Check if agent requested human intervention
    const needsHuman = isTimeout || /REQUIERE INTERVENCIÓN HUMANA/i.test(resultRaw) || updatedJournal.state === 'stopped';

    // ── Phase 1.3: Outbox validator — always check for verifiable artifact ──────
    if (!hasVerifiableArtifact(resultRaw)) {
      if (isTimeout) {
        tg(`💀 <b>Timeout sin evidencia — ${project.name}</b>
🗂 ${title}
⏱ ${duration}s | Dispatch: <code>${activeDM.dispatch_id || 'N/A'}</code>

El proceso expiró sin producir ningún commit, hash ni resultado verificable.
<b>Acción requerida:</b> revisa el outbox y re-despacha con una tarea más pequeña.`);
      } else if (exitCode === 0 && !needsHuman) {
        tg(`⚠️ <b>Sin evidencia verificable — ${project.name}</b>
🗂 ${title}

La tarea terminó con ✅ pero sin hash SHA256, HTTP status, grep count ni commit ID.
Verifica manualmente que los cambios funcionan correctamente.`);
      }
    }

    // Write outbox — include full plan + results for coordinator reads
    if (project.outbox) {
      const outContent =
        `# Relay Outbox — ${project.name}\n` +
        `_${timestamp} | ${duration}s | exit:${exitCode}_\n\n` +
        resultRaw.split('\n').slice(0, 200).join('\n');
      fs.writeFileSync(project.outbox, outContent);

      if (project.repo && project.branch) {
        gitPushOutbox(project.repo, project.branch, project.outbox, timestamp, outContent);
      }
    }

    // Notify monitor API
    postEvent({
      session_id:   `relay-${project.id}-${startTime}`,
      event_type:   'post_tool',
      tool_name:    'RelayTask',
      tool_response_summary: resultRaw.slice(0, 500),
      timestamp:    new Date().toISOString(),
      project_name: project.name,
      api_provider: 'anthropic',
      agent_user:   CLAUDE_USER,
    });

    // Mark dispatch as completed (use activeDM captured before runClaude started)
    if (activeDM.dispatch_id) {
      postToMonitor(`/api/relay/dispatch/${activeDM.dispatch_id}/complete`, {
        result_summary: resultRaw.slice(0, 1000),
        exit_code: exitCode,
        duration_sec: duration,
      });
    }

    // ── @coordinator auto-dispatch ──
    // If any agent writes "@coordinator [target] [task]" in their outbox, route it automatically
    if (project.id !== 'coordinator') {
      const coordMatch = /@coordinator\s+([\w-]+)?\s*([\s\S]{20,}?)(?=\n##|\n---|\n\n[A-ZÁÉÍÓÚ]|$)/i.exec(resultRaw);
      if (coordMatch) {
        const mentionedTarget = coordMatch[1]?.toLowerCase();
        const coordPayload    = coordMatch[2]?.trim();
        // Check if mentionedTarget is a known project id (direct dispatch) or needs coordinator to route
        const directTarget = mentionedTarget && projects.find(p => p.id === mentionedTarget && p.active && p.inbox);
        const routerProject = directTarget || projects.find(p => p.id === 'coordinator' && p.active && p.inbox);
        if (routerProject && coordPayload) {
          const autoTask =
            `## @coordinator — Solicitud automática de ${project.name}\n\n` +
            `**Origen**: ${project.id}\n` +
            `**Destino solicitado**: ${mentionedTarget || 'coordinator'}\n` +
            `**Fecha**: ${timestamp}\n\n` +
            coordPayload;
          try {
            fs.writeFileSync(routerProject.inbox, autoTask);
            const h = loadHashes(); delete h[routerProject.id]; saveHashes(h);
            if (hashes) delete hashes[routerProject.id];
            log(project.id, `@coordinator → ${routerProject.id}: ${coordPayload.slice(0, 80)}`);
            if (routerProject.repo && routerProject.branch) {
              gitPushInbox(routerProject.repo, routerProject.branch, routerProject.inbox,
                `coord-auto-${Date.now()}`, autoTask);
            }
          } catch (e) {
            log(project.id, `@coordinator dispatch falló: ${e.message?.slice(0, 100)}`);
          }
        }
      }
    }

    // ── ASK: protocol — agent can pause and ask user a question ──
    // If agent writes "ASK: <question>" in result, relay sends it to Telegram
    // and the user replies via /dispatch <project> <answer>
    const askMatch = /^ASK:\s*(.+)/m.exec(resultRaw);
    if (askMatch) {
      const question = askMatch[1].trim().slice(0, 500);
      log(project.id, `ASK: ${question}`);
      tg(`❓ <b>Pregunta del agente — ${project.name}</b>
🗂 ${title}

<b>El agente necesita tu respuesta:</b>
<code>${question}</code>

Para continuar, responde con:
<code>/dispatch ${project.id} Respuesta: ${question.slice(0, 60)}...</code>`, true);
    }

    // ── DISPATCH_PARALLEL — fire-and-forget parallel sub-tasks ──
    // Agents write one line per sub-task: DISPATCH_PARALLEL: <project_id> <task description>
    const dpMatches = [...resultRaw.matchAll(/^DISPATCH_PARALLEL:\s*([\w-]+)\s+(.+)/gm)];
    for (const dp of dpMatches) {
      const targetId   = dp[1].trim();
      const taskText   = dp[2].trim();
      const targetProj = projects.find(p => p.id === targetId && p.active && p.inbox);
      if (!targetProj) { log(project.id, `DISPATCH_PARALLEL: proyecto "${targetId}" no encontrado`); continue; }
      const dpTask = `## Subtarea paralela de ${project.name}\n\n**Origen:** ${project.id} | **Fecha:** ${timestamp}\n\n${taskText}`;
      try {
        fs.writeFileSync(targetProj.inbox, dpTask);
        const h = loadHashes(); delete h[targetId]; saveHashes(h);
        if (hashes) delete hashes[targetId];
        log(project.id, `DISPATCH_PARALLEL → ${targetId}: ${taskText.slice(0, 80)}`);
        if (targetProj.repo && targetProj.branch) gitPushInbox(targetProj.repo, targetProj.branch, targetProj.inbox, `dp-${Date.now()}`, dpTask);
        tg(`🔀 <b>Subtarea paralela</b>\n${project.name} → <b>${targetProj.name}</b>\n<code>${taskText.slice(0, 120)}</code>`);
      } catch (e) {
        log(project.id, `DISPATCH_PARALLEL falló → ${targetId}: ${e.message?.slice(0, 100)}`);
      }
    }

    // ── Parse structured outbox fields ──
    const structured  = parseStructuredOutbox(resultRaw);

    // Extract verification URLs (needed for post-deploy check + Telegram block)
    const verifyUrls = [...resultRaw.matchAll(/## URL de verificaci[oó]n\s*\n(https?:\/\/\S+)/gi)]
      .map(m => m[1]);
    const isFrontend = /front/i.test(project.id) || /front/i.test(project.name);
    if (isFrontend && project.url && !verifyUrls.includes(project.url)) {
      verifyUrls.push(project.url);
    }

    // ── Session quality check ──
    const LOW_YIELD_SECS = 800;
    const noChange = !structured.changed || /^ninguno$/i.test(structured.changed.trim());
    if (duration >= LOW_YIELD_SECS && noChange && exitCode === 0) {
      postAlert('session_low_yield', project.id, 'warning',
        `Sesión improductiva — ${project.name}: ${duration}s sin cambios`,
        `Duración: ${duration}s\nStatus outbox: ${structured.status || 'sin estructurar'}\nPending: ${structured.pending || '—'}`
      );
    }

    // ── Post-deploy verification ──
    if (structured.deployed === 'yes' && verifyUrls.length > 0) {
      verifyUrls.forEach(url => {
        const mod = url.startsWith('https') ? require('https') : require('http');
        const req2 = mod.get(url, { timeout: 10000 }, (res2) => {
          if (res2.statusCode < 200 || res2.statusCode >= 400) {
            postAlert('deploy_verify_fail', project.id, 'critical',
              `Deploy verification falló — ${project.name}`,
              `URL: ${url}\nHTTP: ${res2.statusCode}`);
            // Phase 1.1: Degradation guard — show new commits + revert command
            let revertBlock = '';
            if (preRunSha && project.repo && project.branch) {
              try {
                const newCommits = execSync(
                  `cd ${project.repo} && git log --oneline ${preRunSha}..HEAD 2>/dev/null`,
                  { stdio: 'pipe', timeout: 5000 }
                ).toString().trim();
                if (newCommits) {
                  revertBlock = `\n\n<b>Commits durante sesión:</b>\n<code>${newCommits.slice(0, 300)}</code>\n\nPara revertir:\n<code>cd ${project.repo} && git revert HEAD --no-edit && git push origin ${project.branch}</code>`;
                }
              } catch (_) {}
            }
            tg(`🚨 <b>Deploy verification falló — ${project.name}</b>\n${url} → HTTP ${res2.statusCode}${revertBlock}`);
          }
          res2.resume();
        });
        req2.on('error', (e) => {
          postAlert('deploy_verify_fail', project.id, 'critical',
            `Deploy verification error — ${project.name}`,
            `URL: ${url}\nError: ${e.message?.slice(0, 100)}`);
        });
        req2.end();
      });
    }

    // ── Telegram: resultados con ✅/❌ + issues + acceso + journal ──
    const resultList  = formatted.map(l => `  ${l}`).join('\n');
    const changedBlock = structured.changed
      ? `\n\n<b>Cambios:</b> <code>${structured.changed.slice(0, 200)}</code>`
      : '';
    const deployedBlock = structured.deployed
      ? `\n<b>Deploy:</b> ${structured.deployed === 'yes' ? '✅' : '❌'} ${structured.deployed}`
      : '';
    const pendingBlock = structured.pending
      ? `\n<b>Pendiente:</b> <code>${structured.pending.slice(0, 150)}</code>`
      : '';
    const accessItems = parseSectionItems(resultRaw, /^## Acceso/i);
    const issueBlock  = issueItems.length
      ? `\n\n<b>Issues:</b>\n<code>${issueItems.map(l=>`  ⚠️ ${l.replace(/^[-•*]\s*/,'')}`).join('\n')}</code>`
      : '';
    // Show access diagnostics only on failure/timeout so success messages stay clean
    const accessBlock = accessItems.length && (exitCode !== 0 || isTimeout || needsHuman)
      ? `\n\n<b>Acceso:</b>\n<code>${accessItems.map(l=>`  ${l.replace(/^[-•*]\s*/,'')}`).join('\n')}</code>`
      : '';
    const journalLine = `🔁 Tarea #${updatedJournal.total_tasks} | ✅×${updatedJournal.consecutive_successes} ❌×${updatedJournal.consecutive_failures}`;
    const statusIcon  = isTimeout ? '⏰' : needsHuman ? '🆘' : exitCode !== 0 ? '⚠️' : '✅';
    const statusWord  = isTimeout ? 'Timeout — interrumpido' : needsHuman ? 'Requiere intervención' : exitCode !== 0 ? 'Con errores' : 'Completado';

    // For fast failures with no structured output, include raw tail so user can diagnose
    const fastFail = exitCode !== 0 && !isTimeout && resultItems.length === 0 && duration < 60;
    const rawTailBlock = fastFail && resultRaw.trim()
      ? `\n\n<b>Output raw (últimos 400 chars):</b>\n<code>${resultRaw.slice(-400).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code>`
      : '';

    // Build links block for Telegram
    const prodUrl   = project.url || null;
    const urlsBlock = verifyUrls.length
      ? `\n\n<b>Verificar:</b>\n${verifyUrls.map(u => `  🔗 ${u}`).join('\n')}`
      : '';
    const prodBlock = prodUrl && !verifyUrls.includes(prodUrl)
      ? `\n🌐 <a href="${prodUrl}">${prodUrl}</a>`
      : '';

    tg(`${statusIcon} <b>${statusWord} — ${project.name}</b>
🗂 ${title}
⏱ ${duration}s | ${journalLine}

<b>Resultados:</b>
<code>${resultList}</code>${changedBlock}${deployedBlock}${pendingBlock}${issueBlock}${accessBlock}${rawTailBlock}${urlsBlock}${prodBlock}`);

    if (isTimeout) {
      tg(`⏰ <b>Intervención requerida — ${project.name}</b>
🗂 ${title}

La tarea se interrumpió por timeout (${Math.round(CLAUDE_TIMEOUT_MS / 60000)} min).

<b>Opciones:</b>
  ✂️ Divide la tarea en pasos más pequeños
  🔄 <code>pm2 restart relay-master</code> + reescribe el inbox
  📝 Informa qué falló para ajustar la estrategia`);
    } else if (needsHuman) {
      const lines  = resultRaw.split('\n');
      const intIdx = lines.findIndex(l => /REQUIERE INTERVENCIÓN HUMANA/i.test(l));
      const intMsg = intIdx !== -1 ? lines.slice(intIdx, intIdx + 3).join('\n') : '';
      tg(`🆘 <b>Acción requerida — ${project.name}</b>\n🗂 ${title}\n<code>${intMsg.slice(0, 800)}</code>`);
    }

    // ── Visual check or basic screenshot ─────────────────
    // When DEPLOYED:yes + verify URLs present: use visual-check.js (Gemini Flash analysis,
    // iterative fix loop, annotated screenshot). Otherwise take a basic Chromium screenshot.
    const vcIterMatch    = title.match(/intento\s*(\d+)\s*\/\s*3/i);
    const vcIteration    = vcIterMatch ? parseInt(vcIterMatch[1]) - 1 : 0;
    const vcCriteria     = criteriaItems.length
      ? criteriaItems.map(l => l.replace(/^[-•*[\] ]+/, '').replace(/https?:\/\/\S+/g, '').trim()).filter(Boolean).join('; ')
      : null;
    const willRunVisualCheck = structured.deployed === 'yes'
      && verifyUrls.length > 0
      && !needsHuman
      && !isTimeout;

    if (willRunVisualCheck) {
      runVisualCheckOnce(project, title, verifyUrls, vcCriteria, vcIteration);
    } else if (verifyUrls.length) {
      const shotDir = path.join(__dirname, '..', 'frontend', 'screenshots');
      try { fs.mkdirSync(shotDir, { recursive: true }); } catch (_) {}
      verifyUrls.forEach(verifyUrl => {
        const filename = `${project.id}-${Date.now()}.png`;
        const shotPath = path.join(shotDir, filename);
        screenshot(verifyUrl, shotPath, (filePath) => {
          if (filePath) {
            tgPhoto(filePath, `📸 ${project.name}\n${verifyUrl}`);
            postToMonitor('/api/screenshots/new', {
              filename, project_id: project.id,
              url: `/screenshots/${filename}`, verify_url: verifyUrl,
            });
          } else {
            tg(`📸 <b>Screenshot</b> — ${project.name}\n🔗 ${verifyUrl}`);
          }
        });
      });
    }

    log(project.id, `Completado (exit:${exitCode}, ${duration}s)`);
  }

  // ── Choose execution engine ───────────────────────────
  const execEngine = project.mode || 'claude';
  if (execEngine === 'deepseek-agent') {
    log(project.id, `Motor: deepseek-agent (DeepSeek V4-Pro tool loop)`);
    runDeepSeekAgent(project, taskContent, onTaskComplete, activeDM);
  } else {
    runClaude(project, taskContent, onTaskComplete, activeDM, adaptiveTimeout);
  }
}

// ─── Post-deploy visual check (Gemini Flash) ─────────────
// Called non-blocking after DEPLOYED:yes. Runs visual-check.js, sends photo + verdict.
// If NECESITA_CORRECCIÓN and iteration < 2 → writes corrective task to project.inbox.
// Iteration tracking is embedded in task title: "Corrección visual (intento N/3)".
function runVisualCheckOnce(project, taskTitle, verifyUrls, taskCriteria, currentIteration) {
  if (!verifyUrls.length) return;
  const MAX_ITER  = 3;
  const url       = verifyUrls[0];
  const vcScript  = path.join(__dirname, 'visual-check.js');
  if (!fs.existsSync(vcScript)) {
    log(project.id, 'visual-check.js no encontrado — saltando visual check');
    return;
  }

  tg(`🔍 <b>Verificando visual — ${project.name}</b>\n🔗 ${url}\nEjecutando análisis Gemini Flash…`);

  const criteria = (taskCriteria || 'página carga sin errores, nav visible, datos cargan')
    .replace(/"/g, "'").replace(/\n/g, ' ').slice(0, 400);
  const safeUrl  = url.replace(/"/g, '\\"');

  exec(`node "${vcScript}" "${safeUrl}" "${criteria}" 5000`, { timeout: 75000 }, (err, stdout) => {
    let vcResult;
    try { vcResult = JSON.parse(stdout || ''); } catch (_) {}

    if (!vcResult) {
      const errMsg = err?.message?.slice(0, 200) || stdout?.slice(0, 200) || 'sin output';
      log(project.id, `visual-check error: ${errMsg}`);
      tg(`⚠️ <b>Visual check error — ${project.name}</b>\n<code>${errMsg}</code>`);
      return;
    }

    if (vcResult.screenshot && fs.existsSync(vcResult.screenshot)) {
      const icon = vcResult.passed ? '✅' : '⚠️';
      tgPhoto(vcResult.screenshot,
        `${icon} Visual check (${currentIteration + 1}/${MAX_ITER}) — ${project.name}\n${vcResult.verdict}\n${url}`);
    }

    if (vcResult.passed) {
      tg(`✅ <b>Visual APROBADO — ${project.name}</b>\n🔗 ${url}`);
      return;
    }

    const issues  = (vcResult.issues  || []).filter(Boolean).slice(0, 5).join('\n- ') || '(ver análisis)';
    const actions = (vcResult.actions_needed || []).filter(Boolean).slice(0, 5).join('\n- ') || 'Sin acciones';

    if (currentIteration >= MAX_ITER - 1) {
      tg(`⚠️ <b>Visual falló (${MAX_ITER} intentos) — ${project.name}</b>
🔗 ${url}

<b>Issues:</b>
<code>- ${issues}</code>
Requiere revisión manual.`);
      return;
    }

    const nextIter      = currentIteration + 2;  // convert: 0-indexed current +1 for human label +1 for next
    const correctiveTask =
      `## Corrección visual (intento ${nextIter}/${MAX_ITER}) — ${taskTitle}\n\n` +
      `La verificación visual automática detectó problemas tras el último deploy.\n\n` +
      `**URL verificada**: ${url}\n\n` +
      `**Problemas detectados:**\n- ${issues}\n\n` +
      `**Acciones sugeridas:**\n- ${actions}\n\n` +
      `Corrige los issues, haz deploy y responde con el formato de outbox estándar.\n` +
      `Incluye \`DEPLOYED: yes\` para que se vuelva a verificar automáticamente.`;

    if (project.inbox) {
      try {
        fs.writeFileSync(project.inbox, correctiveTask);
        const h = loadHashes(); delete h[project.id]; saveHashes(h);
        if (project.repo && project.branch) {
          gitPushInbox(project.repo, project.branch, project.inbox,
            `vc-fix-${nextIter}-${Date.now()}`, correctiveTask);
        }
        tg(`🔄 <b>NECESITA_CORRECCIÓN (${currentIteration + 1}/${MAX_ITER}) — ${project.name}</b>
🔗 ${url}

<b>Issues:</b>
<code>- ${issues}</code>

Despachando corrección automática…`);
        log(project.id, `visual-check: corrective dispatch ${nextIter}/${MAX_ITER} escrito en inbox`);
      } catch (e) {
        log(project.id, `visual-check: inbox write falló: ${e.message?.slice(0, 100)}`);
      }
    }
  });
}

// ─── Connectivity diagnostic for buzon handler ───────────
// Logs which API key the buzon uses and whether api.anthropic.com is reachable.
// Run once at startup to diagnose the "buzon never responds" problem.
function diagBuzonConnectivity() {
  const keyPreview = ANTHROPIC_KEY
    ? `...${ANTHROPIC_KEY.slice(-6)}`
    : '(no configurado)';
  log(null, `buzon-diag: ANTHROPIC_API_KEY=${keyPreview}`);

  if (!ANTHROPIC_KEY) return;
  let timedOut = false;
  const req = https.request({
    hostname: 'api.anthropic.com',
    path:     '/v1/models',
    method:   'GET',
    headers:  { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
  }, (res) => {
    res.resume();  // drain response body
    res.on('end', () => {
      if (!timedOut) log(null, `buzon-diag: api.anthropic.com → HTTP ${res.statusCode} ✅`);
    });
  });
  req.setTimeout(10000, () => {
    timedOut = true;
    req.destroy();  // emits 'error' — suppressed below via timedOut flag
    log(null, 'buzon-diag: api.anthropic.com → TIMEOUT ❌ (firewall o DNS)');
    tg(`⚠️ <b>Diagnóstico buzon</b>\n<code>api.anthropic.com</code> no responde en 10s\nKey: <code>${keyPreview}</code>\nEl ACK de FiscalAI usará fallback (coordinator dispatch)`);
  });
  req.on('error', (e) => {
    if (!timedOut) log(null, `buzon-diag: api.anthropic.com → ERROR ❌ ${e.message?.slice(0, 100)}`);
  });
  req.end();
}

// ─── Main loop ────────────────────────────────────────────
async function main() {
  log(null, '=== relay-master iniciado ===');
  log(null, `Polling cada ${POLL_MS/1000}s`);

  // Kill orphan Claude processes from previous relay-master instances.
  // Targets both the CLAUDE_USER (if different) and the current user.
  try {
    let _curUser = 'root';
    try { _curUser = require('os').userInfo().username; } catch (_) {}
    const usersToKill = [_curUser];
    if (CLAUDE_USER && CLAUDE_USER !== _curUser) usersToKill.push(CLAUDE_USER);
    for (const u of usersToKill) {
      execSync(`pkill -9 -u ${u} -f 'claude --dangerously-skip-permissions' 2>/dev/null || true`, { stdio: 'pipe' });
    }
    log(null, `Procesos Claude huérfanos eliminados al arrancar (users: ${usersToKill.join(',')})`);
  } catch (_) {}

  // Clean up stale lock files from previous run
  try {
    const stale = fs.readdirSync('/tmp').filter(f => f.startsWith('relay-lock-'));
    stale.forEach(f => { try { fs.unlinkSync(`/tmp/${f}`); } catch (_) {} });
    if (stale.length) log(null, `locks estancados eliminados: ${stale.join(', ')}`);
  } catch (_) {}

  let projects = [];
  try {
    projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
  } catch (e) {
    log(null, `ERROR leyendo projects.json: ${e.message}`);
    process.exit(1);
  }

  const activeProjects = projects.filter(p => p.active && p.inbox);
  log(null, `Proyectos activos: ${activeProjects.map(p => p.id).join(', ')}`);

  tg(`🟢 <b>relay-master iniciado</b>
📡 ${activeProjects.length} proyectos activos:
${activeProjects.map(p => `  • ${p.name}`).join('\n')}
🌐 Dashboard: http://ia.vilarkptl.com`);

  // Register command list with Telegram so they autocomplete in the chat
  registerBotCommands();

  // Create GitHub labels required for relay inbox routing
  ensureGithubLabels(projects).catch(() => {});

  // diagBuzonConnectivity eliminado — ANTHROPIC_API_KEY no se usa, Claude corre via Max subscription

  // Independent session watchdog — hard cap regardless of CLAUDE_TIMEOUT_MS env var
  const WATCHDOG_MAX_MS = parseInt(process.env.WATCHDOG_MAX_MS || String(25 * 60 * 1000));
  setInterval(() => {
    const now = Date.now();
    for (const [projectId, info] of ACTIVE_PIDS.entries()) {
      if (!info.forceTimeout) continue;  // not yet initialized
      const elapsedMs = now - info.startTime;
      if (elapsedMs < WATCHDOG_MAX_MS) continue;
      const elapsedSec = Math.round(elapsedMs / 1000);
      log(projectId, `WATCHDOG: job ${info.jobId} lleva ${elapsedSec}s — terminando`);
      tg(`⚠️ <b>Watchdog — ${projectId}</b>\nSesión <code>${info.jobId}</code> terminada (${elapsedSec}s > ${Math.round(WATCHDOG_MAX_MS/60)}min máx)`);
      info.forceTimeout();
    }
  }, 60 * 1000);

  // Kill-switch poller — consulta kill-check cada 60s (multi-proveedor, persiste en DB)
  const killCheck = () => new Promise((resolve) => {
    const req = http.get(`${MONITOR_API}/api/platform/kill-check`, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(_) { resolve(null); } });
    });
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });

  // También verificar kill por proveedor individual
  const killStatusCheck = () => new Promise((resolve) => {
    const req = http.get(`${MONITOR_API}/api/apiAdmin/killStatus`, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(_) { resolve(null); } });
    });
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });

  // Antispam: solo 1 alerta por hora por proveedor (PROVIDER_LAST_ALERT es global)
  const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hora

  setInterval(async () => {
    try {
      // Auto-reset a medianoche
      if (GLOBAL_KILLED && GLOBAL_KILL_TS) {
        if (new Date().toDateString() !== GLOBAL_KILL_TS.toDateString()) {
          GLOBAL_KILLED = false; GLOBAL_KILL_TS = null; GLOBAL_KILL_MSG = '';
          log(null, 'Kill-switch: nuevo día — auto-reset');
          tg('✅ <b>Kill-switch reseteado</b> — nuevo día, sistema reanudado automáticamente');
        }
      }

      // Consultar estado global (total)
      const status = await killCheck();
      if (status?.killed && !GLOBAL_KILLED) {
        GLOBAL_KILLED   = true;
        GLOBAL_KILL_TS  = new Date();
        GLOBAL_KILL_MSG = status.reason || `$${status.daily_cost_usd} ≥ $${status.threshold_usd}`;
        log(null, `KILL-SWITCH TOTAL: ${GLOBAL_KILL_MSG}`);
        tg(`🛑 <b>Sistema PAUSADO — Kill-switch total</b>\n${GLOBAL_KILL_MSG}\nNinguna tarea se ejecutará.\nUsa <code>/reanudar</code> o <code>/limite total 15</code> para ajustar.`);
        for (const [, info] of ACTIVE_PIDS.entries()) {
          if (info.forceTimeout) info.forceTimeout();
        }
      }
      if (!status?.killed && GLOBAL_KILLED && GLOBAL_KILL_TS) {
        GLOBAL_KILLED = false; GLOBAL_KILL_TS = null; GLOBAL_KILL_MSG = '';
        log(null, 'Kill-switch: reanudado por dashboard');
        tg('✅ <b>Sistema reanudado</b> desde dashboard');
      }

      // Consultar alertas por proveedor individual — con antispam (1 alerta/hora/proveedor)
      if (!GLOBAL_KILLED) {
        const provStatus = await killStatusCheck();
        if (provStatus?.provider_status) {
          const now = Date.now();
          for (const p of provStatus.provider_status) {
            if (!p.over || p.provider === 'total') continue;
            const lastAlerted = PROVIDER_LAST_ALERT[p.provider] || 0;
            if (now - lastAlerted < ALERT_COOLDOWN_MS) continue;
            PROVIDER_LAST_ALERT[p.provider] = now;
            tg(`⚠️ <b>Alerta de gasto — ${p.provider}</b>\n$${p.current_usd} de $${p.threshold_usd} (${p.pct}%)\nUsa <code>/limite ${p.provider} ${Math.ceil(p.current_usd * 1.5)}</code> para subir el límite.`);
          }
        }
      }

      // Refresh per-project kill flags from /api/apiAdmin/projectBudgets
      try {
        const budgetData = await new Promise((resolve) => {
          const req = http.get(`${MONITOR_API}/api/apiAdmin/projectBudgets`, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(null); } });
          });
          req.setTimeout(5000, () => { req.destroy(); resolve(null); });
          req.on('error', () => resolve(null));
        });
        if (budgetData?.projects) {
          const now = Date.now();
          for (const b of budgetData.projects) {
            PROJECT_KILLED_CACHE[b.project_name] = { killed: !!b.killed, ts: now };
          }
        }
      } catch (_) {}
    } catch (_) { /* no interrumpir por fallos de red */ }
  }, 60 * 1000);

  const hashes = loadHashes();

  // Poll loop
  setInterval(async () => {
    // Reload projects in case file changed
    try {
      projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    } catch (_) {}

    // Poll Telegram for user commands (/resumen, /status, /parar, /activar)
    try { pollTelegramCommands(); } catch (e) {
      log(null, `ERROR pollTelegramCommands: ${e.message}`);
    }

    // Sync buzon-ia.md to DeCabeceraTax (ryby.lease) for FiscalAI communication
    try { syncBuzonIA(); } catch (e) {
      log(null, `ERROR syncBuzonIA: ${e.message}`);
    }

    // Process dispatch queue first (coordinator writes here)
    try { await processDispatchQueue(projects, hashes); } catch (e) {
      log(null, `ERROR processDispatchQueue: ${e.message}`);
    }

    // Poll GitHub Issues for DeepSeek/Gemini agents + check scheduler
    try { await pollGithubIssues(projects); } catch (e) {
      log(null, `ERROR pollGithubIssues: ${e.message}`);
    }
    try { checkSchedule(projects); } catch (e) {
      log(null, `ERROR checkSchedule: ${e.message}`);
    }

    // Check outbox watchdog (detects stuck agents)
    try { checkOutboxWatchdog(projects); } catch (e) {
      log(null, `ERROR watchdog: ${e.message}`);
    }

    // P0.1 — expire stuck dispatch tasks (>30 min in dispatched/pending)
    try { await checkStuckDispatchTasks(); } catch (e) {
      log(null, `ERROR checkStuckDispatchTasks: ${e.message}`);
    }

    // Phase 1: git pulls — sequential + deduped to avoid .git/index.lock conflicts
    const pulledRepos = new Set();
    for (const project of projects) {
      if (project.active && project.repo && project.branch && !pulledRepos.has(project.repo)) {
        try { gitPull(project.repo, project.branch); } catch (_) {}
        pulledRepos.add(project.repo);
        checkSelfReload();
      }
    }
    // Phase 2: check + dispatch all projects in parallel (git already pulled above)
    await Promise.allSettled(
      projects.map(project =>
        processProject(project, hashes, pulledRepos)
          .catch(e => log(project.id, `ERROR: ${e.message}`))
      )
    );
  }, POLL_MS);

  // Fast poll (3s) for projects with ignore_quiet_hours — used for urgent tasks
  setInterval(async () => {
    const fastProjects = projects.filter(p => p.ignore_quiet_hours && p.active && p.inbox);
    if (!fastProjects.length) return;
    const fp = new Set();
    for (const p of fastProjects) {
      try { await processProject(p, hashes, fp); } catch (_) {}
    }
  }, 3000);

  // Initial poll immediately — share pulledRepos so finbot-coordinator (same repo as
  // ai-monitor but different branch) doesn't call gitPull separately and switch branches.
  try { syncBuzonIA(); } catch (_) {}
  try { await processDispatchQueue(projects, hashes); } catch (_) {}
  const _initPulledRepos = new Set();
  for (const project of projects) {
    try { await processProject(project, hashes, _initPulledRepos); } catch (_) {}
  }

  // Global relay heartbeat — confirms relay-master is alive
  const HEARTBEAT_MS = parseInt(process.env.HEARTBEAT_MS || String(6 * 3600 * 1000)); // default 6h
  const _startTime   = Date.now();

  function sendHeartbeat() {
    const uptimeSec = Math.floor((Date.now() - _startTime) / 1000);
    const hours     = Math.floor(uptimeSec / 3600);
    const mins      = Math.floor((uptimeSec % 3600) / 60);
    const running   = [...ACTIVE_TASKS];
    const taskLine  = running.length
      ? `⚙️ Activas: ${running.map(id => `<code>${id}</code>`).join(', ')}`
      : `💤 Sin tareas activas`;
    let projs = [];
    try { projs = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')).filter(p => p.active && p.inbox); } catch (_) {}
    const agentLine = projs.map(p => {
      const model = (p.claude_model || 'sonnet').replace('claude-', '').replace(/-\d{8}$/, '');
      return `  • ${p.name} <i>(${model})</i>`;
    }).join('\n');
    tg(`💓 <b>relay-master activo</b>
⏱ Uptime: ${hours}h ${mins}m
${taskLine}

<b>Agentes:</b>
${agentLine}
🌐 <a href="http://ia.vilarkptl.com">Dashboard</a>`);
  }

  // First heartbeat after 5 min (startup settled), then every HEARTBEAT_MS
  setTimeout(() => {
    sendHeartbeat();
    setInterval(sendHeartbeat, HEARTBEAT_MS);
  }, 5 * 60 * 1000);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});

// ─── Graceful shutdown — espera a que terminen las tareas ──
process.on('SIGTERM', () => {
  log(null, 'SIGTERM recibido — esperando tareas activas antes de salir…');
  const wait = setInterval(() => {
    const locks = (() => { try { return require('fs').readdirSync('/tmp').filter(f => f.startsWith('relay-lock-')); } catch(_){ return []; } })();
    if (!locks.length) {
      log(null, 'Sin tareas activas — saliendo limpiamente');
      clearInterval(wait);
      process.exit(0);
    }
    log(null, `Esperando locks: ${locks.join(', ')}`);
  }, 5000);
  // Forzar salida después de 10 minutos
  setTimeout(() => { log(null, 'Timeout graceful — forzando salida'); process.exit(0); }, 600000);
});
