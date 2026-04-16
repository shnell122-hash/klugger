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

// ─── Config ───────────────────────────────────────────────
const PROJECTS_FILE   = path.join(__dirname, 'projects.json');
const DISPATCH_FILE   = path.join(__dirname, 'pending-dispatches.json');
const HASHES_FILE     = `/tmp/relay-master-hashes-${process.getuid?.() ?? 'x'}.json`;
// Per-project lock files: /tmp/relay-lock-{projectId} (parallel execution)
// Outbox watchdog: track when each project last got an inbox dispatch
const DISPATCH_TIMES  = {};   // { [projectId]: { dispatched_at: ms, dispatch_id: str } }
const OUTBOX_TIMEOUT_MS = parseInt(process.env.OUTBOX_TIMEOUT_MS || '2100000'); // 35 min
const MONITOR_API     = process.env.MONITOR_API_URL || 'http://127.0.0.1:3010';
const BOT_TOKEN       = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID         = process.env.TELEGRAM_CHAT_ID;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN    = process.env.GITHUB_TOKEN;
const CLAUDE_BIN      = process.env.CLAUDE_BIN || '/usr/local/bin/claude';
const CLAUDE_USER     = process.env.CLAUDE_USER || 'claude-agent';
const POLL_MS         = parseInt(process.env.POLL_MS || '15000');
const CLAUDE_TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS || '1800000'); // 30 min default

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

// ─── Telegram: enviar foto (screenshot) ───────────────────
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
  exec(cmd, { timeout: 25000 }, (err) => {
    if (err) { log(null, `Screenshot error para ${url}: ${err.message?.slice(0,100)}`); return callback(null); }
    callback(outPath);
  });
}

// ─── Monitor API ──────────────────────────────────────────
function postToMonitor(apiPath, payload) {
  try {
    const body = JSON.stringify(payload);
    const req = require('http').request({
      hostname: '127.0.0.1',
      port:     3010,
      path:     apiPath,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch (_) {}
}

function postEvent(payload) {
  postToMonitor('/api/events', payload);
}

// ─── Hash helpers ─────────────────────────────────────────
function loadHashes() {
  try { return JSON.parse(fs.readFileSync(HASHES_FILE, 'utf8')); }
  catch (_) { return {}; }
}

function saveHashes(h) {
  fs.writeFileSync(HASHES_FILE, JSON.stringify(h));
}

function fileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('md5').update(content).digest('hex');
  } catch (_) { return null; }
}

// ─── Lock per project (parallel execution allowed) ────────
function acquireLock(projectId) {
  const lockFile = `/tmp/relay-lock-${projectId}`;
  try {
    if (fs.existsSync(lockFile)) {
      const ageSec = (Date.now() - fs.statSync(lockFile).mtimeMs) / 1000;
      if (ageSec < 600) return false;  // this project already running
      fs.unlinkSync(lockFile);          // stale lock, remove
    }
    fs.writeFileSync(lockFile, String(process.pid));
    return true;
  } catch (_) { return false; }
}

function releaseLock(projectId) {
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

function updateJournal(projectId, { title, exitCode, resultSummary, durationSec }) {
  const journal = loadJournal(projectId);
  const status  = exitCode === 0 ? 'success' : 'failed';

  journal.total_tasks++;
  journal.consecutive_failures  = status === 'failed'  ? journal.consecutive_failures  + 1 : 0;
  journal.consecutive_successes = status === 'success' ? journal.consecutive_successes + 1 : 0;
  journal.updated_at = new Date().toISOString();

  journal.recent_tasks.unshift({
    title,
    status,
    exit_code:      exitCode,
    result_summary: (resultSummary || '').slice(0, 200),
    duration_sec:   durationSec,
    timestamp:      new Date().toISOString(),
  });
  journal.recent_tasks = journal.recent_tasks.slice(0, 10);

  // Auto-stop: 2 consecutive failures
  if (journal.consecutive_failures >= 2 && journal.state === 'active') {
    journal.state = 'stopped';
    tg(`🆘 <b>STOP automático — ${projectId}</b>
2 intentos fallidos consecutivos.
El agente no continuará solo.

Revisa los outboxes y crea un plan corregido.
<code>${(resultSummary || '').slice(0, 300)}</code>`);
  } else if (status === 'success' && journal.state === 'stopped') {
    journal.state = 'active';  // reset if new success
  }

  saveJournal(projectId, journal);
  return journal;
}

// ─── Execute Claude for a project (stream-json for real-time events) ─────────
function runClaude(project, taskContent, callback, dispatchMeta = {}) {
  const uid      = process.getuid?.() ?? '0';
  const taskFile = `/tmp/relay-task-${uid}-${project.id}.md`;

  try { fs.unlinkSync(taskFile); } catch (_) {}

  // Build context: load agent-specific .md + task
  const agentCtx = loadAgentContext(project.id);
  const context  = agentCtx
    ? `${agentCtx}\n\n---\n\n## Tarea recibida\n\n${taskContent}`
    : `Eres el agente de servidor para el proyecto "${project.name}".
Repo: ${project.repo || 'N/A'}
URL: ${project.url || 'N/A'}
Directorio de trabajo: ${project.repo || '/var/www/html'}

Tarea:
${taskContent}`;

  fs.writeFileSync(taskFile, context);

  // CLAUDE_CONFIG_DIR must point to the .claude directory itself (not its parent)
  const CLAUDE_CONFIG = path.join(__dirname, '..', '.claude');
  const CLAUDE_HOOKS  = path.join(__dirname, '..', 'hooks');
  const taskId    = dispatchMeta.id    || `relay-${project.id}-${Date.now()}`;
  const taskDepth = dispatchMeta.depth ?? 0;
  const sessionId = `relay-${project.id}-${Date.now()}`;

  // Build shell command for su -c (stdin redirect handled by shell)
  const innerCmd = [
    `export ANTHROPIC_API_KEY='${ANTHROPIC_KEY}'`,
    `export CLAUDE_MONITOR_URL='${MONITOR_API}'`,
    `export CLAUDE_CHAT_SOURCE='relay-${project.id}'`,
    `export CLAUDE_CONFIG_DIR='${CLAUDE_CONFIG}'`,
    `export CLAUDE_HOOKS_DIR='${CLAUDE_HOOKS}'`,
    `export RELAY_DISPATCH_URL='${MONITOR_API}/api/relay/dispatch'`,
    `export RELAY_TASK_ID='${taskId}'`,
    `export RELAY_DEPTH='${taskDepth}'`,
    `cd ${project.repo || '/var/www/html'}`,
    `${CLAUDE_BIN} --dangerously-skip-permissions --output-format stream-json --print < ${taskFile}`,
  ].join(' && ');

  const child = spawn('su', ['-', CLAUDE_USER, '-c', innerCmd], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let resultText  = '';
  let lineBuffer  = '';
  let timedOut    = false;
  // Track pending tool calls for pre/post pairing
  const pendingTools = {}; // { tool_use_id → { name, inputSummary } }

  const timer = setTimeout(() => {
    timedOut = true;
    try { child.kill('SIGKILL'); } catch (_) {}
  }, CLAUDE_TIMEOUT_MS);

  function processLine(line) {
    if (!line.trim()) return;
    let evt;
    try { evt = JSON.parse(line); } catch (_) {
      // Non-JSON line (error output piped to stdout, etc.) — accumulate
      resultText += line + '\n';
      return;
    }

    // ── Real-time tool events → dashboard ──────────────────
    if (evt.type === 'assistant' && Array.isArray(evt.message?.content)) {
      for (const block of evt.message.content) {
        if (block.type === 'text' && block.text) {
          // Accumulate assistant text for final result
          resultText += block.text;
        }
        if (block.type === 'tool_use') {
          const inputSummary = typeof block.input === 'object'
            ? JSON.stringify(block.input).slice(0, 500)
            : String(block.input || '').slice(0, 500);

          pendingTools[block.id] = { name: block.name, inputSummary };
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

    // Tool result → post_tool event
    if (evt.type === 'tool') {
      const toolInfo = pendingTools[evt.tool_use_id] || {};
      let content = '';
      if (Array.isArray(evt.content)) {
        content = evt.content.map(c => (typeof c === 'string' ? c : c.text || '')).join('').slice(0, 500);
      } else {
        content = String(evt.content || '').slice(0, 500);
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

      delete pendingTools[evt.tool_use_id];
    }

    // Final result — overwrite accumulated text with clean result
    if (evt.type === 'result') {
      if (evt.result) resultText = evt.result;
    }
  }

  child.stdout.on('data', (chunk) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split('\n');
    lineBuffer  = lines.pop(); // keep last (possibly incomplete) line
    for (const line of lines) processLine(line);
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) log(project.id, `claude stderr: ${text.slice(0, 300)}`);
  });

  child.on('close', (code) => {
    clearTimeout(timer);
    if (lineBuffer.trim()) processLine(lineBuffer);
    if (timedOut) {
      resultText = `[TIMEOUT después de ${CLAUDE_TIMEOUT_MS / 60000}min]\n` + resultText;
    }
    callback(timedOut ? 1 : (code || 0), resultText.trim());
  });

  child.on('error', (err) => {
    clearTimeout(timer);
    log(project.id, `runClaude error: ${err.message}`);
    callback(1, `Error lanzando claude: ${err.message}`);
  });
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
        `cd ${repoPath} && git pull origin ${branch} --rebase --quiet 2>/dev/null`,
        { stdio: 'pipe', timeout: 30000 }
      );
    } catch (_) {
      // Rebase failed (diverged or mid-rebase) — abort and reset hard
      execSync(
        `cd ${repoPath} && git rebase --abort 2>/dev/null || true && git fetch origin ${branch} --quiet && git reset --hard origin/${branch} --quiet`,
        { stdio: 'pipe', timeout: 30000 }
      );
      log(projectId, `gitPull: rebase falló, reset hard a origin/${branch}`);
    }
  } catch (err) {
    log(projectId, `gitPull error: ${err.message?.slice(0, 200)}`);
  }
}

function gitPushOutbox(repoPath, branch, outboxPath, timestamp) {
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
    }
    execSync(
      `cd ${repoPath} && git add ${outboxPath} && git commit -m "relay: resultado ${timestamp}" --quiet && git push origin ${branch} --quiet`,
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
function gitPushInbox(repoPath, branch, inboxPath, dispatchId) {
  const projectId = path.basename(repoPath);
  try {
    try {
      execSync(
        `cd ${repoPath} && git pull origin ${branch} --rebase --quiet 2>/dev/null`,
        { stdio: 'pipe', timeout: 30000 }
      );
    } catch (_) {
      execSync(
        `cd ${repoPath} && git rebase --abort 2>/dev/null || true && git fetch origin ${branch} --quiet && git reset --hard origin/${branch} --quiet`,
        { stdio: 'pipe', timeout: 30000 }
      );
    }
    execSync(
      `cd ${repoPath} && git add ${inboxPath} && git commit -m "dispatch: tarea ${dispatchId}" --quiet && git push origin ${branch} --quiet`,
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

async function processDispatchQueue(projects) {
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

    // Write task to target inbox
    try {
      fs.writeFileSync(target.inbox, dispatch.task);
    } catch (err) {
      log(null, `Dispatch ${dispatch.id}: no pudo escribir inbox: ${err.message}`);
      const idx = updated.findIndex(d => d.id === dispatch.id);
      updated[idx] = { ...dispatch, status: 'error', dispatched_at: new Date().toISOString() };
      continue;
    }

    // Push to GitHub if configured
    if (target.repo && target.branch) {
      gitPushInbox(target.repo, target.branch, target.inbox, dispatch.id);
    }

    // Track dispatch time for outbox watchdog
    DISPATCH_TIMES[dispatch.project] = {
      dispatched_at: Date.now(),
      dispatch_id:   dispatch.id,
    };

    const idx = updated.findIndex(d => d.id === dispatch.id);
    updated[idx] = { ...dispatch, status: 'dispatched', dispatched_at: new Date().toISOString() };

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
async function processProject(project, hashes) {
  if (!project.active || !project.inbox) return;

  // Git pull first
  if (project.repo && project.branch) {
    gitPull(project.repo, project.branch);
  }

  const currentHash = fileHash(project.inbox);
  if (!currentHash) return;
  if (hashes[project.id] === currentHash) return;  // no change

  // Changed! Try to acquire per-project lock (other projects run in parallel)
  if (!acquireLock(project.id)) {
    log(project.id, 'Tarea en curso — esperando que termine antes de lanzar otra');
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
      log(project.id, `JOURNAL STOP: 2 fallos consecutivos — tarea bloqueada`);
      releaseLock(project.id);
      return;
    }
    // Different title = user wrote a new task → reset state and run
    journal.state = 'active';
    saveJournal(project.id, journal);
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
  // Pass dispatch metadata so agent can use RELAY_TASK_ID for sub-tasks
  const activeDM = DISPATCH_TIMES[project.id] || {};
  runClaude(project, taskContent, (exitCode, resultRaw) => {
    releaseLock(project.id);
    const duration  = Math.round((Date.now() - startTime) / 1000);
    const timestamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

    // Parse structured result items from ## Resultados section
    const resultItems = parseResultSection(resultRaw);
    const issueItems  = parseIssuesSection(resultRaw);
    const formatted   = formatResultItems(resultItems, exitCode);

    // Update journal FIRST (auto-stop logic runs here)
    const updatedJournal = updateJournal(project.id, {
      title,
      exitCode,
      resultSummary: formatted.slice(0, 3).join(' | '),
      durationSec:   duration,
    });

    // Check if agent requested human intervention
    const needsHuman = /REQUIERE INTERVENCIÓN HUMANA/i.test(resultRaw) || updatedJournal.state === 'stopped';

    // Write outbox — include full plan + results for coordinator reads
    if (project.outbox) {
      const outContent =
        `# Relay Outbox — ${project.name}\n` +
        `_${timestamp} | ${duration}s | exit:${exitCode}_\n\n` +
        resultRaw.split('\n').slice(0, 200).join('\n');
      fs.writeFileSync(project.outbox, outContent);

      if (project.repo && project.branch) {
        gitPushOutbox(project.repo, project.branch, project.outbox, timestamp);
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

    // Mark dispatch as completed
    if (DISPATCH_TIMES[project.id]) {
      const { dispatch_id } = DISPATCH_TIMES[project.id];
      postToMonitor(`/api/relay/dispatch/${dispatch_id}/complete`, {
        result_summary: resultRaw.slice(0, 1000),
        exit_code: exitCode,
      });
      delete DISPATCH_TIMES[project.id];
    }

    // ── Telegram: resultados con ✅/❌ + issues + journal ──
    const resultList  = formatted.map(l => `  ${l}`).join('\n');
    const issueBlock  = issueItems.length
      ? `\n\n<b>Issues:</b>\n<code>${issueItems.map(l=>`  ⚠️ ${l.replace(/^[-•*]\s*/,'')}`).join('\n')}</code>`
      : '';
    const journalLine = `🔁 Tarea #${updatedJournal.total_tasks} | ✅×${updatedJournal.consecutive_successes} ❌×${updatedJournal.consecutive_failures}`;
    const statusIcon  = needsHuman ? '🆘' : exitCode !== 0 ? '⚠️' : '✅';
    const statusWord  = needsHuman ? 'Requiere intervención' : exitCode !== 0 ? 'Con errores' : 'Completado';

    // Extract verification URLs (agent may list multiple ## URL de verificación lines)
    const verifyUrls = [...resultRaw.matchAll(/## URL de verificaci[oó]n\s*\n(https?:\/\/\S+)/gi)]
      .map(m => m[1]);
    const isFrontend = /front/i.test(project.id) || /front/i.test(project.name);
    if (isFrontend && project.url && !verifyUrls.includes(project.url)) {
      verifyUrls.push(project.url);
    }

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
<code>${resultList}</code>${issueBlock}${urlsBlock}${prodBlock}`);

    if (needsHuman) {
      const lines  = resultRaw.split('\n');
      const intIdx = lines.findIndex(l => /REQUIERE INTERVENCIÓN HUMANA/i.test(l));
      const intMsg = intIdx !== -1 ? lines.slice(intIdx, intIdx + 3).join('\n') : '';
      tg(`🆘 <b>Acción requerida</b>\n<code>${intMsg.slice(0, 800)}</code>`);
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
  }, activeDM);
}

// ─── Main loop ────────────────────────────────────────────
async function main() {
  log(null, '=== relay-master iniciado ===');
  log(null, `Polling cada ${POLL_MS/1000}s`);

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

  const hashes = loadHashes();

  // Poll loop
  setInterval(async () => {
    // Reload projects in case file changed
    try {
      projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    } catch (_) {}

    // Process dispatch queue first (coordinator writes here)
    try { await processDispatchQueue(projects); } catch (e) {
      log(null, `ERROR processDispatchQueue: ${e.message}`);
    }

    // Check outbox watchdog (detects stuck agents)
    try { checkOutboxWatchdog(projects); } catch (e) {
      log(null, `ERROR watchdog: ${e.message}`);
    }

    for (const project of projects) {
      try {
        await processProject(project, hashes);
      } catch (e) {
        log(project.id, `ERROR: ${e.message}`);
      }
    }
  }, POLL_MS);

  // Initial poll immediately
  try { await processDispatchQueue(projects); } catch (_) {}
  for (const project of projects) {
    try { await processProject(project, hashes); } catch (_) {}
  }
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
