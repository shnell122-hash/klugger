'use strict';

/**
 * relay/audit-relay-cursor.js — Auditoría automática del relay con AI
 *
 * Recopila estado del sistema, logs recientes y costos, luego envía todo
 * a un modelo AI (DeepSeek V3 o Haiku) para análisis inteligente.
 * Solo alerta por Telegram si encuentra problemas CRÍTICOS o ALTOS.
 *
 * Uso:
 *   node relay/audit-relay-cursor.js            # auditoría completa
 *   node relay/audit-relay-cursor.js --dry-run  # solo imprime el reporte sin llamar AI
 *
 * Cron (cada día a las 08:00):
 *   0 8 * * * cd /var/www/html/vilarkptl.com/ai-monitor && node relay/audit-relay-cursor.js >> /var/log/ai-monitor/audit.log 2>&1
 *
 * Cron (cada hora):
 *   0 * * * * cd /var/www/html/vilarkptl.com/ai-monitor && node relay/audit-relay-cursor.js >> /var/log/ai-monitor/audit.log 2>&1
 */

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const http    = require('http');
const { execSync } = require('child_process');

// ─── Cargar relay/.env ────────────────────────────────────────────────────────
(function loadEnv(file) {
  try {
    fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([^=#\s][^=]*?)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    });
  } catch (_) {}
})(path.join(__dirname, '.env'));

const DEEPSEEK_KEY   = process.env.DEEPSEEK_API_KEY;
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const BOT_TOKEN      = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID        = process.env.TELEGRAM_CHAT_ID;
const MONITOR_API    = process.env.MONITOR_API_URL || 'http://127.0.0.1:3010';
const LOG_FILE       = '/var/log/ai-monitor/audit.log';
const DRY_RUN        = process.argv.includes('--dry-run');
const RELAY_ROOT     = path.join(__dirname, '..');

const RELAY_LOG_FILE = '/var/log/ai-monitor/relay-master-out.log';
const ERR_LOG_FILE   = '/var/log/ai-monitor/relay-master-error.log';

// ─── Utilidades ───────────────────────────────────────────────────────────────
function ts() {
  return new Intl.DateTimeFormat('sv', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date()).replace(',', '');
}
function log(msg) { console.log(`${ts()} [audit] ${msg}`); }

function tail(filePath, lines = 60) {
  try {
    return execSync(`tail -n ${lines} "${filePath}" 2>/dev/null`, { encoding: 'utf8' });
  } catch (_) { return '(sin logs)'; }
}

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 10_000 }).trim(); }
  catch (e) { return `ERROR: ${e.message.slice(0, 200)}`; }
}

// ─── Recopilación de estado del sistema ──────────────────────────────────────
function gatherSystemState() {
  log('Recopilando estado del sistema...');

  // PM2 status
  let pm2Status = 'N/A';
  try {
    const pm2Json = JSON.parse(execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8' }));
    pm2Status = pm2Json.map(p => ({
      name:    p.name,
      status:  p.pm2_env?.status,
      memory:  `${Math.round((p.monit?.memory || 0) / 1024 / 1024)}MB`,
      cpu:     `${p.monit?.cpu || 0}%`,
      restarts: p.pm2_env?.restart_time,
      uptime:  p.pm2_env?.pm_uptime ? `${Math.round((Date.now() - p.pm2_env.pm_uptime) / 3600000)}h` : '?',
    }));
  } catch (_) { pm2Status = run('pm2 status'); }

  // Logs recientes del relay-master (últimas 80 líneas)
  const relayLogs  = tail(RELAY_LOG_FILE, 80);
  const errorLogs  = tail(ERR_LOG_FILE, 40);

  // Outbox recientes (últimas tareas completadas)
  const outboxFiles = [
    path.join(__dirname, 'outbox.md'),
    path.join(__dirname, 'coordinator-outbox.md'),
  ];
  const outboxContent = outboxFiles.map(f => {
    try { return `\n### ${path.basename(f)}\n${fs.readFileSync(f, 'utf8').slice(0, 800)}`; }
    catch (_) { return ''; }
  }).join('');

  // Inbox activos (tareas pendientes)
  const inboxFiles = [
    path.join(__dirname, 'inbox.md'),
    path.join(__dirname, 'coordinator-inbox.md'),
  ];
  const inboxContent = inboxFiles.map(f => {
    try {
      const content = fs.readFileSync(f, 'utf8').trim();
      const isEmpty = content.startsWith('# Inbox vacío') || content.length < 30;
      return `\n### ${path.basename(f)} — ${isEmpty ? 'VACÍO' : 'CON TAREA PENDIENTE'}\n${content.slice(0, 400)}`;
    } catch (_) { return ''; }
  }).join('');

  // Disco disponible
  const diskFree = run("df -h /var/www/html/vilarkptl.com | awk 'NR==2{print $4\" disponible de \"$2\" (\"$5\" usado)\"}'");

  // Git status del repo
  const gitLog = run(`git -C "${RELAY_ROOT}" log --oneline -5`);

  // Errores en logs de las últimas 24h
  const recentErrors = run(`grep -c "ERROR\\|KILLED\\|TIMEOUT\\|fatal\\|crash" "${RELAY_LOG_FILE}" 2>/dev/null || echo 0`);

  return {
    timestamp: ts(),
    pm2: typeof pm2Status === 'string' ? pm2Status : JSON.stringify(pm2Status, null, 2),
    relayLogs,
    errorLogs,
    outbox:     outboxContent,
    inbox:      inboxContent,
    diskFree,
    gitLog,
    recentErrors: recentErrors.trim(),
  };
}

// ─── Obtener costos desde la API del backend ──────────────────────────────────
async function fetchCosts() {
  return new Promise(resolve => {
    const req = http.get(`${MONITOR_API}/api/platform/kill-check`, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (_) { resolve(null); }
      });
    });
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

// ─── Llamada a DeepSeek V3 (preferido por costo) ──────────────────────────────
async function callDeepSeek(prompt) {
  const body = JSON.stringify({
    model:       'deepseek-chat',
    max_tokens:  2048,
    temperature: 0.2,
    messages: [
      { role: 'system', content: 'Eres un experto en sistemas Node.js y DevOps. Analiza el estado de un relay de agentes AI y reporta SOLO problemas reales, con severidad CRÍTICA, ALTA o MEDIA. Si todo está bien, di explícitamente que el sistema está saludable.' },
      { role: 'user', content: prompt },
    ],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.deepseek.com',
      path:     '/v1/chat/completions',
      method:   'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          resolve(r.choices?.[0]?.message?.content || data);
        } catch (_) { resolve(data); }
      });
    });
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error('DeepSeek timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Fallback: Anthropic Haiku ────────────────────────────────────────────────
async function callHaiku(prompt) {
  const body = JSON.stringify({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:     [{ type: 'text', text: 'Eres un experto en sistemas Node.js y DevOps. Analiza el estado de un relay de agentes AI y reporta SOLO problemas reales con severidad CRÍTICA, ALTA o MEDIA. Si todo está bien, di que el sistema está saludable.', cache_control: { type: 'ephemeral' } }],
    messages:   [{ role: 'user', content: prompt }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          resolve(r.content?.[0]?.text || data);
        } catch (_) { resolve(data); }
      });
    });
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error('Haiku timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Enviar alerta por Telegram ───────────────────────────────────────────────
function sendTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) { log('Telegram no configurado — saltando alerta'); return; }
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
  req.on('error', e => log(`Telegram error: ${e.message}`));
  req.write(body);
  req.end();
}

// ─── Detectar severidad en el análisis AI ─────────────────────────────────────
function hasCriticalIssues(analysis) {
  const upper = analysis.toUpperCase();
  return upper.includes('CRÍTICA') || upper.includes('CRITICA') ||
         upper.includes('CRÍTICO') || upper.includes('CRITICO') ||
         upper.includes('CRITICAL') || upper.includes('ALTA') ||
         upper.includes('HIGH') || upper.includes('URGENTE');
}

function hasMediumIssues(analysis) {
  const upper = analysis.toUpperCase();
  return upper.includes('MEDIA') || upper.includes('MEDIUM') ||
         upper.includes('ADVERTENCIA') || upper.includes('WARNING');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log('=== Iniciando auditoría del relay ===');

  // 1. Recopilar estado
  const state   = gatherSystemState();
  const costs   = await fetchCosts();
  const costStr = costs
    ? `Gasto hoy: $${costs.daily_cost_usd?.toFixed(4)} / $${costs.threshold_usd} umbral | Kill-switch: ${costs.killed ? 'ACTIVO ⚠️' : 'inactivo'}`
    : 'API de costos no disponible';

  // 2. Construir prompt de auditoría
  const prompt = `# Auditoría del Sistema Relay AI Monitor
Fecha: ${state.timestamp}

## Estado PM2
\`\`\`
${state.pm2}
\`\`\`

## Costos
${costStr}

## Errores en logs (últimas 24h): ${state.recentErrors} líneas con ERROR/TIMEOUT/KILLED

## Logs recientes (relay-master)
\`\`\`
${state.relayLogs.slice(-3000)}
\`\`\`

## Logs de error
\`\`\`
${state.errorLogs.slice(-1500)}
\`\`\`

## Outbox (últimas tareas completadas)
${state.outbox.slice(0, 1200)}

## Inbox (tareas pendientes)
${state.inbox.slice(0, 800)}

## Disco
${state.diskFree}

## Git (últimos 5 commits)
${state.gitLog}

---

Analiza el estado anterior y reporta:
1. Problemas CRÍTICOS (sistema caído, loop infinito, costos fuera de control, errores de seguridad)
2. Problemas ALTOS (procesos reiniciándose frecuentemente, tareas sin outbox, disco lleno)
3. Problemas MEDIOS (optimizaciones de costo, latencia alta, logs excesivos)
4. Estado general en una línea

Si el sistema está saludable sin problemas, dilo explícitamente con: "✅ Sistema saludable"
Sé conciso — máximo 400 palabras.`;

  if (DRY_RUN) {
    log('--- DRY RUN: prompt que se enviaría al modelo ---');
    console.log(prompt);
    log('--- Fin del dry-run ---');
    return;
  }

  // 3. Llamar al modelo AI
  log(`Analizando con ${DEEPSEEK_KEY ? 'DeepSeek V3' : 'Haiku 4.5'}...`);
  let analysis = '';
  try {
    analysis = DEEPSEEK_KEY
      ? await callDeepSeek(prompt)
      : await callHaiku(prompt);
  } catch (err) {
    log(`Error al llamar AI: ${err.message}`);
    // Fallback: análisis de reglas básicas
    analysis = generateRuleBasedReport(state, costs);
  }

  log('--- Resultado del análisis ---');
  console.log(analysis);
  log('------------------------------');

  // 4. Guardar en log
  const logEntry = `\n${'='.repeat(60)}\n${ts()} — AUDITORÍA\n${'='.repeat(60)}\n${analysis}\n`;
  try { fs.appendFileSync(LOG_FILE, logEntry); }
  catch (_) { /* log file puede no existir aún */ }

  // 5. Alertar por Telegram solo si hay problemas críticos o altos
  const isCritical = hasCriticalIssues(analysis);
  const isMedium   = hasMediumIssues(analysis);

  if (isCritical) {
    log('⚠️ Problemas CRÍTICOS/ALTOS detectados — enviando alerta Telegram');
    sendTelegram(
      `🚨 <b>Auditoría Relay — ALERTA</b>\n\n${analysis.slice(0, 3500)}\n\n<i>${ts()}</i>`
    );
  } else if (isMedium) {
    log('⚠️ Problemas MEDIOS detectados — enviando aviso Telegram');
    sendTelegram(
      `⚠️ <b>Auditoría Relay — Aviso</b>\n\n${analysis.slice(0, 3500)}\n\n<i>${ts()}</i>`
    );
  } else {
    log('✅ Sistema saludable — sin alertas Telegram');
  }

  log('=== Auditoría completada ===');
}

// ─── Fallback si el modelo AI no responde ────────────────────────────────────
function generateRuleBasedReport(state, costs) {
  const issues = [];

  if (costs?.killed) issues.push('🔴 CRÍTICO: Kill-switch activado — sistema pausado');
  if (parseInt(state.recentErrors) > 10) issues.push(`🔴 ALTO: ${state.recentErrors} errores/timeouts en logs recientes`);
  if (state.pm2.includes('"errored"')) issues.push('🔴 ALTO: Proceso PM2 en estado "errored"');
  if (state.pm2.includes('"stopped"')) issues.push('🟡 ALTO: Proceso PM2 detenido');
  if (state.errorLogs.length > 100) issues.push('🟡 MEDIO: Hay errores en relay-master-error.log');
  if (costs?.daily_cost_usd > costs?.threshold_usd * 0.8) {
    issues.push(`🟡 MEDIO: Gasto en $${costs.daily_cost_usd.toFixed(2)} — 80% del umbral diario`);
  }

  return issues.length > 0
    ? `Auditoría automática (modo reglas):\n\n${issues.join('\n')}`
    : '✅ Sistema saludable — sin problemas detectados por reglas básicas';
}

main().catch(err => {
  log(`Error fatal: ${err.message}`);
  process.exit(1);
});
