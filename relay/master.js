'use strict';

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
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const DEEPSEEK_KEY    = process.env.DEEPSEEK_API_KEY;
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
  const body = JSON.stringify({
    chat_id:    CHAT_ID,
    text:       String(text).slice(0, 4096),
    parse_mode: 'HTML',
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
    { command: 'tarea',    description: 'Propone plan y despacha tarea — /tarea [proyecto] [descripción]' },
    { command: 'status',   description: 'Tareas corriendo en este momento' },
    { command: 'resumen',  description: 'Resumen de proyectos — /resumen [id?]' },
    { command: 'detente',  description: 'Detiene tareas activas — /detente [id?]' },
    { command: 'activar',  description: 'Reactiva un agente detenido — /activar [id]' },
    { command: 'memoria',  description: 'Agrega nota a la memoria del agente — /memoria [id] [nota]' },
    { command: 'plan',     description: 'Ver plan activo del proyecto — /plan [id?]' },
    { command: 'limite',   description: 'Cambiar límite de gasto — /limite [proveedor] [usd]' },
    { command: 'reanudar', description: 'Reanudar relay si está pausado por kill-switch' },
    { command: 'comandos', description: 'Lista todos los comandos disponibles' },
    { command: 'ayuda',    description: 'Lista todos los comandos disponibles' },
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

    // Generate plan via DeepSeek (fast, cheap); fall back to local template if unavailable
    const dsResult = await callDeepSeekDirect(planSystemPrompt, planUserMsg, 300);
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
// CLI Proxy routing: if ANTHROPIC_PROXY_URL is set (and optionally restricted to a project via
// ANTHROPIC_PROXY_PROJECT), requests go to a local claude-relay proxy instead of api.anthropic.com.
// This routes through a Pro/Max subscription to avoid per-token billing on background tasks.
const ANTHROPIC_PROXY_URL     = process.env.ANTHROPIC_PROXY_URL     || null;  // e.g. http://127.0.0.1:5001
const ANTHROPIC_PROXY_PROJECT = process.env.ANTHROPIC_PROXY_PROJECT || '';   // restrict to this project id

function callAnthropicDirect(systemPrompt, userMessage, maxTokens = 512, projectId = null) {
  // Determine if this call should go through the local CLI proxy
  const useProxy = ANTHROPIC_PROXY_URL &&
    (!ANTHROPIC_PROXY_PROJECT || ANTHROPIC_PROXY_PROJECT === projectId);

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
      const parsed = new URL(ANTHROPIC_PROXY_URL);
      hostname = parsed.hostname;
      port     = parseInt(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'));
      isHttps  = parsed.protocol === 'https:';
      log(projectId, `[anthropic-proxy] routing via ${ANTHROPIC_PROXY_URL}`);
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

  // 3. Try Anthropic API for richer response (optional / best-effort)
  // If unreachable (firewall/DNS), fall through silently — ACK+dispatch already sent.
  try {
    let systemPrompt = 'Eres el agente IA de ia.vilarkptl.com respondiendo al buzón de FiscalAI.';
    const claudeMdPath = path.join(BUZON_REPO, 'CLAUDE.md');
    if (fs.existsSync(claudeMdPath)) {
      systemPrompt = fs.readFileSync(claudeMdPath, 'utf8');
    }
    const contextFiles = ['coordinator-inbox.md', 'coordinator-outbox.md', 'journal.md'];
    let relayContext = '';
    for (const f of contextFiles) {
      const fp = path.join(BUZON_REPO, 'relay', f);
      if (fs.existsSync(fp)) {
        relayContext += `\n\n### relay/${f}:\n${fs.readFileSync(fp, 'utf8')}`;
      }
    }
    if (relayContext) systemPrompt += '\n\n---\n\n## Estado actual del relay' + relayContext;

    const respuesta = await callAnthropicDirect(systemPrompt, buzonContent, 1024);
    const richContent =
      `# Buzón IA — ia.vilarkptl.com → FiscalAI\n\n` +
      `**[${timestamp} CST] — Anthropic API (claude-haiku-4-5)**\n\n---\n\n${respuesta}\n`;
    fs.writeFileSync(BUZON_SRC, richContent);
    log(null, `buzon-ia: respuesta Anthropic API escrita (${respuesta.length} chars)`);
    tg(`📨 <b>FiscalAI respondido via Anthropic API</b>\n<code>${respuesta.slice(0, 400)}</code>`);
    journalEntryFile(BUZON_REPO, 'API → buzon-ia', `Respuesta rica a FiscalAI (${respuesta.length} chars)`);
  } catch (err) {
    log(null, `buzon-ia: API opcional falló — ${err.message?.slice(0, 150)} (ACK+dispatch ya enviados)`);
  }
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

// Load per-agent context file (relay/agents/{id}.md)
function loadAgentContext(projectId) {
  const f = path.join(__dirname, 'agents', `${projectId}.md`);
  try { return fs.readFileSync(f, 'utf8'); } catch (_) { return ''; }
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
  const agentCtx  = loadAgentContext(project.id);
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

  const coreCmd = [
    `cd ${project.repo || '/var/www/html'} 2>/dev/null || true`,
    // Diagnostic first — visible in resultText so Telegram shows it on task completion
    `echo "RELAY_DIAG user=$(id -un 2>/dev/null||echo '?') home=$HOME task=$(test -r ${taskFile} && echo ok || echo UNREADABLE)" > ${outFile} 2>&1`,
    `${CLAUDE_BIN} --dangerously-skip-permissions --output-format stream-json --verbose --print --model ${claudeModel} < ${taskFile} >> ${outFile} 2>&1`,
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
        taskCostUsd = evt.total_cost_usd;
        log(project.id, `costo real: $${evt.total_cost_usd.toFixed(6)}`);
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
  try {
    if (GITHUB_TOKEN) {
      execSync(
        `cd ${repoPath} && git remote set-url origin "https://${GITHUB_TOKEN}@github.com/$(git remote get-url origin | sed 's|.*github.com[:/]||')" 2>/dev/null || true`,
        { stdio: 'ignore' }
      );
    }
    try {
      execSync(
        `cd ${repoPath} && git pull origin ${branch} --rebase --autostash --quiet`,
        { stdio: 'pipe', timeout: 30000 }
      );
    } catch (rebaseErr) {
      const reason = (rebaseErr.stderr?.toString() || rebaseErr.stdout?.toString() || rebaseErr.message || '').slice(0, 200).trim();
      try {
        execSync(`cd ${repoPath} && git rebase --abort 2>/dev/null || true`, { stdio: 'pipe', timeout: 5000 });
        execSync(
          `cd ${repoPath} && git stash --quiet 2>/dev/null || true && git pull origin ${branch} --quiet && git stash pop --quiet 2>/dev/null || true`,
          { stdio: 'pipe', timeout: 30000 }
        );
        log(projectId, `gitPull: rebase+autostash falló (${reason || 'sin detalle'}) — usé stash+pull`);
      } catch (stashErr) {
        log(projectId, `gitPull: stash+pull también falló — ${stashErr.message?.slice(0, 100)}`);
      }
    }
  } catch (err) {
    log(projectId, `gitPull error: ${err.message?.slice(0, 200)}`);
  }

  // Fix .git/objects ownership so Claude agents (non-root) can commit.
  // relay-master runs as root → git pull creates objects owned by root →
  // agent (running as CLAUDE_USER) hits EACCES on next commit attempt.
  if (CLAUDE_USER && CLAUDE_USER !== 'root') {
    try {
      execSync(`chown -R ${CLAUDE_USER} ${repoPath}/.git 2>/dev/null || true`, { stdio: 'pipe', timeout: 5000 });
    } catch (_) {}
  }
}

function gitPushOutbox(repoPath, branch, outboxPath, timestamp, outboxContent) {
  const projectId = path.basename(repoPath);
  try {
    // Try rebase pull first; if it fails (diverged), reset hard to origin
    try {
      execSync(
        `cd ${repoPath} && git pull origin ${branch} --rebase --quiet 2>/dev/null`,
        { stdio: 'pipe', timeout: 30000 }
      );
    } catch (pullErr) {
      log(projectId, `git pull --rebase falló, usando reset hard: ${pullErr.message?.slice(0,200)}`);
      execSync(
        `cd ${repoPath} && git rebase --abort 2>/dev/null || true && git fetch origin ${branch} --quiet && git reset --hard origin/${branch} --quiet`,
        { stdio: 'pipe', timeout: 30000 }
      );
      // Re-write outbox after reset hard — reset wipes locally written content
      if (outboxContent) fs.writeFileSync(outboxPath, outboxContent);
    }
    // Validate agent commits before pushing (catches node_modules, .env, etc.)
    validateAndCleanCommits(repoPath, branch);

    execSync(
      `cd ${repoPath} && git add ${outboxPath} && git diff --cached --quiet || git commit -m "relay: resultado ${timestamp}" --quiet && git push origin ${branch} --quiet`,
      { stdio: 'pipe', timeout: 30000 }
    );
    log(projectId, `outbox push OK → ${branch}`);
  } catch (err) {
    const msg = err.message?.slice(0, 300) || 'unknown error';
    log(projectId, `ERROR: outbox push falló: ${msg}`);
    tg(`⚠️ <b>Outbox push falló — ${projectId}</b>\n<code>${msg}</code>`);
  }
}

// ─── Git push inbox (for dispatch) ───────────────────────
function gitPushInbox(repoPath, branch, inboxPath, dispatchId, inboxContent) {
  const projectId = path.basename(repoPath);
  try {
    try {
      execSync(
        `cd ${repoPath} && git pull origin ${branch} --rebase --autostash --quiet 2>/dev/null`,
        { stdio: 'pipe', timeout: 30000 }
      );
    } catch (_) {
      execSync(
        `cd ${repoPath} && git rebase --abort 2>/dev/null || true && git fetch origin ${branch} --quiet && git reset --hard origin/${branch} --quiet`,
        { stdio: 'pipe', timeout: 30000 }
      );
      // reset --hard wipes local writes — restore inbox content before committing
      if (inboxContent) fs.writeFileSync(inboxPath, inboxContent);
    }
    execSync(
      `cd ${repoPath} && git add ${inboxPath} && git diff --cached --quiet || git commit -m "dispatch: tarea ${dispatchId}" --quiet && git push origin ${branch} --quiet`,
      { stdio: 'pipe', timeout: 30000 }
    );
    log(projectId, `inbox push OK (dispatch ${dispatchId})`);
  } catch (err) {
    log(projectId, `inbox push falló (dispatch ${dispatchId}): ${err.message?.slice(0,200)}`);
    // Continue anyway — relay-master will pick up the file change locally
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
    checkSelfReload();  // restart if master.js changed on disk
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

  runClaude(project, taskContent, (exitCode, resultRaw, costUsd = 0) => {
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

    // ── Screenshots ───────────────────────────────────────
    if (verifyUrls.length) {
      const shotDir = path.join(__dirname, '..', 'frontend', 'screenshots');
      try { fs.mkdirSync(shotDir, { recursive: true }); } catch (_) {}

      verifyUrls.forEach(verifyUrl => {
        const filename = `${project.id}-${Date.now()}.png`;
        const shotPath = path.join(shotDir, filename);
        screenshot(verifyUrl, shotPath, (filePath) => {
          if (filePath) {
            tgPhoto(filePath, `📸 ${project.name}\n${verifyUrl}`);
            // Notify dashboard (socket.io broadcast via monitor API)
            postToMonitor('/api/screenshots/new', {
              filename,
              project_id: project.id,
              url:        `/screenshots/${filename}`,
              verify_url: verifyUrl,
            });
          } else {
            tg(`📸 <b>Screenshot</b> — ${project.name}\n🔗 ${verifyUrl}`);
          }
        });
      });
    }

    log(project.id, `Completado (exit:${exitCode}, ${duration}s)`);
  }, activeDM, adaptiveTimeout);
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

  // Connectivity diagnostic — logs API key + tests api.anthropic.com reachability
  setTimeout(diagBuzonConnectivity, 5000);

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

    // Check outbox watchdog (detects stuck agents)
    try { checkOutboxWatchdog(projects); } catch (e) {
      log(null, `ERROR watchdog: ${e.message}`);
    }

    const pulledRepos = new Set();
    for (const project of projects) {
      try {
        await processProject(project, hashes, pulledRepos);
      } catch (e) {
        log(project.id, `ERROR: ${e.message}`);
      }
    }
  }, POLL_MS);

  // Initial poll immediately
  try { syncBuzonIA(); } catch (_) {}
  try { await processDispatchQueue(projects, hashes); } catch (_) {}
  for (const project of projects) {
    try { await processProject(project, hashes); } catch (_) {}
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
