'use strict';
/**
 * Real pipeline test — dispatches actual tasks to the relay and monitors completion.
 *
 * Usage:
 *   BACKEND=https://ia.vilarkptl.com node tests/real-pipeline-test.js
 *
 * Dispatches 5 tasks, polls for up to POLL_MINUTES minutes, reports success rate.
 */

const BACKEND      = process.env.BACKEND || 'https://ia.vilarkptl.com';
const POLL_MINUTES = parseInt(process.env.POLL_MINUTES || '20');
const POLL_INTERVAL_MS = 15_000; // 15s — relay polling cycle

// ── Tasks to dispatch ──────────────────────────────────────────────────────
// Must pass P0.3 quality filter (>3 words, actionable instruction).
const TASKS = [
  {
    project: 'ai-monitor',
    task: `# Test pipeline — health check
Lee el archivo backend/server.js y confirma en tu outbox que el endpoint GET /api/health existe y responde. No cambies ningún archivo.
STATUS: done
CHANGED: (ninguno)
DEPLOYED: no`,
    label: 'T1: ai-monitor health check',
  },
  {
    project: 'coordinator',
    task: `# Test pipeline — status report
Escribe un resumen en tu outbox del estado actual de los proyectos activos según relay/projects.json (solo listar ids y modos activos). No hagas ningún dispatch ni cambies archivos.
STATUS: done
CHANGED: (ninguno)
DEPLOYED: no`,
    label: 'T2: coordinator status report',
  },
  {
    project: 'ai-monitor',
    task: `# Test pipeline — log check
Verifica que pm2 status muestra ai-monitor online. Reporta en tu outbox: nombre del proceso, estado, tiempo activo y cantidad de reinicios.
STATUS: done
CHANGED: (ninguno)
DEPLOYED: no`,
    label: 'T3: ai-monitor pm2 check',
  },
  {
    project: 'coordinator',
    task: `# Test pipeline — git log
Muestra en tu outbox los últimos 3 commits del repo principal (git log --oneline -3) sin hacer ningún cambio.
STATUS: done
CHANGED: (ninguno)
DEPLOYED: no`,
    label: 'T4: coordinator git log',
  },
  {
    project: 'ai-monitor',
    task: `# Test pipeline — disk usage
Ejecuta df -h y free -h en el servidor. Reporta espacio en disco disponible y RAM libre en tu outbox. No hagas ningún cambio.
STATUS: done
CHANGED: (ninguno)
DEPLOYED: no`,
    label: 'T5: ai-monitor disk/mem check',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
async function post(path, body) {
  const r = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function getTask(id) {
  const r = await fetch(`${BACKEND}/api/relay/dispatch`);
  const all = await r.json();
  return all.find(t => t.id === id) || null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function color(str, code) { return `\x1b[${code}m${str}\x1b[0m`; }
const green  = s => color(s, 32);
const red    = s => color(s, 31);
const yellow = s => color(s, 33);
const cyan   = s => color(s, 36);
const bold   = s => color(s, 1);

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(bold('\n🧪 Real Pipeline Test'));
  console.log(`Backend:  ${BACKEND}`);
  console.log(`Tasks:    ${TASKS.length}`);
  console.log(`Timeout:  ${POLL_MINUTES} min\n`);

  // 1. Dispatch all tasks
  const dispatched = [];
  for (const t of TASKS) {
    const { status, body } = await post('/api/relay/dispatch', {
      project:   t.project,
      task:      t.task,
      requester: 'tests/real-pipeline-test.js',
    });
    if (status === 200 && body?.id) {
      dispatched.push({ ...t, id: body.id, dispatchedAt: Date.now() });
      console.log(`  ${green('✓')} ${t.label} — id: ${body.id.slice(0,8)} (${t.project})`);
    } else {
      console.log(`  ${red('✗')} ${t.label} — dispatch FAILED: ${status} ${JSON.stringify(body)}`);
    }
    await sleep(500); // stagger dispatches
  }

  if (!dispatched.length) {
    console.log(red('\nNo tasks dispatched — aborting.'));
    process.exit(1);
  }

  console.log(`\n${bold('📊 Polling for results')} (${POLL_MINUTES} min max, ${POLL_INTERVAL_MS/1000}s interval)\n`);

  // 2. Poll until all complete or timeout
  const deadline = Date.now() + POLL_MINUTES * 60_000;
  const results  = new Map(); // id → task state

  while (Date.now() < deadline) {
    let pending = 0;
    for (const t of dispatched) {
      if (results.has(t.id) && ['completed','failed'].includes(results.get(t.id).status)) continue;
      const task = await getTask(t.id);
      if (task) {
        results.set(t.id, task);
        if (['completed','failed'].includes(task.status)) {
          const elapsed = Math.round((Date.now() - t.dispatchedAt) / 1000);
          const icon    = task.status === 'completed' ? green('✅') : red('❌');
          const exitStr = task.exit_code !== null ? `exit:${task.exit_code}` : '';
          console.log(`  ${icon} ${t.label} — ${task.status} ${exitStr} (${elapsed}s)`);
        } else {
          pending++;
        }
      } else {
        pending++;
      }
    }

    const done = dispatched.filter(t => {
      const s = results.get(t.id)?.status;
      return s === 'completed' || s === 'failed';
    }).length;

    if (done === dispatched.length) break;

    const elapsed = Math.round((Date.now() - (deadline - POLL_MINUTES * 60_000)) / 1000);
    process.stdout.write(`\r  ⏳ ${done}/${dispatched.length} done — waiting... (${elapsed}s elapsed)  `);
    await sleep(POLL_INTERVAL_MS);
  }
  process.stdout.write('\n');

  // 3. Final report
  console.log(`\n${'─'.repeat(50)}`);
  console.log(bold('📋 Results\n'));

  let completed = 0, failed = 0, timedOut = 0;
  for (const t of dispatched) {
    const task = results.get(t.id);
    const status = task?.status || 'timeout';
    const elapsed = task?.duration_sec ? `${task.duration_sec}s` : '—';
    const icon = status === 'completed' ? green('✅') : status === 'failed' ? red('❌') : yellow('⏱');
    console.log(`  ${icon} [${t.project}] ${t.label}`);
    console.log(`     status=${status}  exit=${task?.exit_code ?? '?'}  duration=${elapsed}`);
    if (status === 'completed') completed++;
    else if (status === 'failed') failed++;
    else timedOut++;
  }

  const total = dispatched.length;
  const rate  = Math.round(100 * completed / total);
  const rateStr = rate >= 85 ? green(`${rate}%`) : rate >= 50 ? yellow(`${rate}%`) : red(`${rate}%`);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`${bold('Success rate:')} ${rateStr}  (${completed}/${total} completadas, ${failed} fallidas, ${timedOut} timeout)`);

  const verdict = rate >= 85
    ? green('✅ PASS — ≥85% objetivo alcanzado')
    : rate >= 50
    ? yellow('⚠️  PARTIAL — por debajo de objetivo (85%)')
    : red('❌ FAIL — success rate insuficiente');

  console.log(verdict + '\n');
  process.exitCode = rate >= 85 ? 0 : 1;
}

main().catch(e => { console.error(e); process.exit(1); });
