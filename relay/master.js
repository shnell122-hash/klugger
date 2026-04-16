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
const { execSync, exec } = require('child_process');
const https   = require('https');

// ─── Config ───────────────────────────────────────────────
const PROJECTS_FILE   = path.join(__dirname, 'projects.json');
const HASHES_FILE     = `/tmp/relay-master-hashes-${process.getuid?.() ?? 'x'}.json`;
// Per-project lock files: /tmp/relay-lock-{projectId} (parallel execution)
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
  ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome']
    .find(b => { try { return require('fs').existsSync(b); } catch(_){return false;} }) || '';

function screenshot(url, outPath, callback) {
  if (!CHROMIUM_BIN || !url) return callback(null);
  const cmd = `${CHROMIUM_BIN} --headless --no-sandbox --disable-gpu ` +
    `--screenshot="${outPath}" --window-size=1280,800 "${url}" 2>/dev/null`;
  exec(cmd, { timeout: 20000 }, (err) => callback(err ? null : outPath));
}

// ─── Monitor API ──────────────────────────────────────────
function postEvent(payload) {
  try {
    const body = JSON.stringify(payload);
    const req = require('http').request({
      hostname: '127.0.0.1',
      port:     3010,
      path:     '/api/events',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json' },
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch (_) {}
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
  const lines   = content.split('\n');
  const title   = lines.find(l => /^#{1,3} /.test(l) && !/Relay Inbox|Tarea desde/.test(l))
                    ?.replace(/^#+ /, '') || 'Sin título';
  const items   = lines.filter(l => /^[0-9]+\. |^- /.test(l)).slice(0, 12);
  return { title, items };
}

// ─── Execute Claude for a project ────────────────────────
function runClaude(project, taskContent, callback) {
  const uid        = process.getuid?.() ?? '0';
  const taskFile   = `/tmp/relay-task-${uid}-${project.id}.md`;
  const resultFile = `/tmp/relay-result-${uid}-${project.id}.txt`;

  // Remove stale files from other users before writing
  try { fs.unlinkSync(taskFile); }   catch (_) {}
  try { fs.unlinkSync(resultFile); } catch (_) {}
  fs.writeFileSync(taskFile, taskContent);

  // Build context: repo path + project name for Claude
  const context = `Eres el agente de servidor para el proyecto "${project.name}".
Repo: ${project.repo || 'N/A'}
URL: ${project.url || 'N/A'}
Directorio de trabajo: ${project.repo || '/var/www/html'}

Tarea:
${taskContent}`;

  fs.writeFileSync(taskFile, context);

  // Point Claude to the ai-monitor hooks config so pre/post tool events reach the dashboard
  const HOOKS_CONFIG_DIR = path.join(__dirname, '..');  // agentic-repo root has .claude/settings.json

  // Pass task via stdin to avoid shell quoting issues with special chars in content
  // (project names with quotes, backticks, $ signs in inbox.md all break $(cat file) substitution)
  const cmd = `su - ${CLAUDE_USER} -c "
    export ANTHROPIC_API_KEY='${ANTHROPIC_KEY}'
    export CLAUDE_MONITOR_URL='${MONITOR_API}'
    export CLAUDE_CHAT_SOURCE='relay-${project.id}'
    export CLAUDE_CONFIG_DIR='${HOOKS_CONFIG_DIR}'
    cd ${project.repo || '/var/www/html'}
    ${CLAUDE_BIN} --dangerously-skip-permissions --print < ${taskFile} > ${resultFile} 2>&1
  "`;

  const child = exec(cmd, { timeout: CLAUDE_TIMEOUT_MS }, (err) => {
    let result = '';
    try { result = fs.readFileSync(resultFile, 'utf8'); } catch (_) {}
    const timedOut = err && err.killed;
    if (timedOut) result = `[TIMEOUT después de ${CLAUDE_TIMEOUT_MS/60000}min]\n` + result;
    callback(err ? 1 : 0, result);
  });
}

// ─── Git pull + push for a project ───────────────────────
function gitPull(repoPath, branch) {
  try {
    if (GITHUB_TOKEN) {
      execSync(
        `cd ${repoPath} && git remote set-url origin "https://${GITHUB_TOKEN}@github.com/$(git remote get-url origin | sed 's|.*github.com[:/]||')" 2>/dev/null || true`,
        { stdio: 'ignore' }
      );
    }
    execSync(`cd ${repoPath} && git pull origin ${branch} --rebase --quiet 2>/dev/null || true`, { stdio: 'ignore' });
  } catch (_) {}
}

function gitPushOutbox(repoPath, branch, outboxPath, timestamp) {
  try {
    // Pull --rebase first to avoid conflicts with Chat Claude pushing inbox.md
    execSync(
      `cd ${repoPath} && git pull origin ${branch} --rebase --quiet 2>/dev/null || true`,
      { stdio: 'ignore', timeout: 30000 }
    );
    execSync(
      `cd ${repoPath} && git add ${outboxPath} && git commit -m "relay: resultado ${timestamp}" --quiet && git push origin ${branch} --quiet`,
      { stdio: 'ignore', timeout: 30000 }
    );
  } catch (_) {}
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
  const { title, items } = parseInbox(taskContent);
  const startTime = Date.now();

  log(project.id, `Nueva tarea: ${title}`);

  // ── Telegram: inicio ─────────────────────────────────
  const itemsList = items.map(i => `  ${i}`).join('\n');
  tg(`📨 <b>Nueva tarea — ${project.name}</b>
🗂 <b>${title}</b>

<b>Tareas a ejecutar:</b>
<code>${itemsList || taskContent.slice(0, 300)}</code>

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
  runClaude(project, taskContent, (exitCode, resultRaw) => {
    releaseLock(project.id);
    const duration = Math.round((Date.now() - startTime) / 1000);
    const timestamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

    // Detect todos completed
    const todosLines = resultRaw.split('\n')
      .filter(l => /✅|☑|✓|\[x\]|completad|DONE/i.test(l))
      .slice(0, 8);

    // Detect intervention needed
    const errorLines = resultRaw.split('\n')
      .filter(l => /error|failed|bloqueado|no pude|exception|permission denied/i.test(l))
      .slice(0, 3);

    // Write outbox
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

    // ── Telegram: resultado ──────────────────────────────
    if (exitCode !== 0 || errorLines.length > 0) {
      tg(`⚠️ <b>Requiere intervención — ${project.name}</b>
🗂 ${title}
⏱ ${duration}s

❌ <code>${errorLines.join('\n') || 'Error desconocido'}</code>

Ver outbox.md en GitHub`);
    } else {
      const doneList = todosLines.length
        ? todosLines.map(l => `✅ ${l.replace(/✅|☑|✓|\[x\]/g,'').trim()}`).join('\n')
        : '✅ Ejecutado sin errores';
      const successMsg =
        `✅ <b>Completado — ${project.name}</b>\n` +
        `📨 Chat Claude → Servidor\n` +
        `⏱ ${duration}s\n\n` +
        `${doneList}\n\n` +
        `🌐 ${project.url || 'ia.vilarkptl.com'}`;

      // Send text first, then screenshot if URL available
      tg(successMsg);
      if (project.url) {
        const shotDir  = path.join(__dirname, '..', 'frontend', 'screenshots');
        try { fs.mkdirSync(shotDir, { recursive: true }); } catch (_) {}
        const shotPath = path.join(shotDir, `${project.id}.png`);
        screenshot(project.url, shotPath, (filePath) => {
          if (filePath) tgPhoto(filePath, `📸 ${project.name} — ${ts()}`);
        });
      }
    }

    log(project.id, `Completado (exit:${exitCode}, ${duration}s)`);
  });
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

    for (const project of projects) {
      try {
        await processProject(project, hashes);
      } catch (e) {
        log(project.id, `ERROR: ${e.message}`);
      }
    }
  }, POLL_MS);

  // Initial poll immediately
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
