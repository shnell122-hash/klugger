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
const HASHES_FILE     = '/tmp/relay-master-hashes.json';
const LOCK_FILE       = '/tmp/relay-claude-lock';
const MONITOR_API     = process.env.MONITOR_API_URL || 'http://127.0.0.1:3010';
const BOT_TOKEN       = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID         = process.env.TELEGRAM_CHAT_ID;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN    = process.env.GITHUB_TOKEN;
const CLAUDE_BIN      = process.env.CLAUDE_BIN || '/usr/local/bin/claude';
const CLAUDE_USER     = process.env.CLAUDE_USER || 'claude-agent';
const POLL_MS         = parseInt(process.env.POLL_MS || '15000');
const MAX_RESULT_LINES= 150;

// ─── Logging ──────────────────────────────────────────────
function log(project, msg) {
  const ts = new Date().toISOString().replace('T',' ').slice(0,19);
  const tag = project ? `[${project}]` : '[master]';
  console.log(`${ts} ${tag} ${msg}`);
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

// ─── Lock (one Claude at a time per server) ───────────────
function acquireLock(projectId) {
  try {
    // Check if lock exists and is less than 10 minutes old
    if (fs.existsSync(LOCK_FILE)) {
      const stat = fs.statSync(LOCK_FILE);
      const ageSec = (Date.now() - stat.mtimeMs) / 1000;
      if (ageSec < 600) return false;  // locked by another project
      fs.unlinkSync(LOCK_FILE);         // stale lock, remove
    }
    fs.writeFileSync(LOCK_FILE, projectId);
    return true;
  } catch (_) { return false; }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
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
  const taskFile   = `/tmp/relay-task-${project.id}.md`;
  const resultFile = `/tmp/relay-result-${project.id}.txt`;

  fs.writeFileSync(taskFile, taskContent);

  // Build context: repo path + project name for Claude
  const context = `Eres el agente de servidor para el proyecto "${project.name}".
Repo: ${project.repo || 'N/A'}
URL: ${project.url || 'N/A'}
Directorio de trabajo: ${project.repo || '/var/www/html'}

Tarea:
${taskContent}`;

  fs.writeFileSync(taskFile, context);

  const cmd = `su - ${CLAUDE_USER} -c "
    export ANTHROPIC_API_KEY='${ANTHROPIC_KEY}'
    export CLAUDE_MONITOR_URL='${MONITOR_API}'
    export CLAUDE_CHAT_SOURCE='relay-${project.id}'
    cd ${project.repo || '/var/www/html'}
    ${CLAUDE_BIN} --dangerously-skip-permissions --print \\"$(cat ${taskFile})\\" < /dev/null > ${resultFile} 2>&1
  "`;

  const child = exec(cmd, { timeout: 600000 }, (err) => {
    let result = '';
    try { result = fs.readFileSync(resultFile, 'utf8'); } catch (_) {}
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

  // Changed! Try to acquire lock
  if (!acquireLock(project.id)) {
    log(project.id, 'Inbox cambió pero Claude está ocupado en otro proyecto — esperando');
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
    releaseLock();
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
        resultRaw.split('\n').slice(0, MAX_RESULT_LINES).join('\n');
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
      tg(`✅ <b>Completado — ${project.name}</b>
📨 Chat Claude → Servidor
⏱ ${duration}s

${doneList}

🌐 ${project.url || 'ia.vilarkptl.com'}`);
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
