'use strict';
/**
 * Real pipeline test — dispatches actual tasks to the relay and monitors completion.
 *
 * Usage:
 *   BACKEND=https://ia.vilarkptl.com node tests/real-pipeline-test.js
 *
 * Dispatches 5 tasks ONE AT A TIME (sequential per project).
 * inbox.md is a single-slot file per project — concurrent dispatches to the same
 * project overwrite each other.  This test waits for each task to finish before
 * dispatching the next one to that project.
 *
 * Reports final success rate (goal ≥85%).
 */

const BACKEND         = process.env.BACKEND || 'https://ia.vilarkptl.com';
const TASK_TIMEOUT_MS = parseInt(process.env.TASK_TIMEOUT_MS || String(8 * 60_000)); // 8 min per task
const POLL_MS         = 10_000; // 10s poll interval

// ── Tasks (grouped by project so we run per-project serially) ──────────────
// Must pass P0.3 quality filter: >3 words AND actionable instruction
const TASK_GROUPS = [
  // ai-monitor  (3 tasks, run one at a time)
  [
    {
      project: 'ai-monitor',
      label:   'T1-a: health check',
      task:    `# Test pipeline — health check
Confirma en tu outbox que el backend responde correctamente ejecutando:
  curl -s http://localhost:3010/api/health
Reporta el status code y la respuesta JSON. No cambies ningún archivo.
STATUS: done
CHANGED: (ninguno)
DEPLOYED: no`,
    },
    {
      project: 'ai-monitor',
      label:   'T1-b: disk/mem',
      task:    `# Test pipeline — disk and memory check
Ejecuta df -h y free -h en el servidor y reporta en tu outbox el espacio libre en / y la RAM disponible. No hagas ningún cambio.
STATUS: done
CHANGED: (ninguno)
DEPLOYED: no`,
    },
    {
      project: 'ai-monitor',
      label:   'T1-c: pm2 status',
      task:    `# Test pipeline — pm2 relay-master
Verifica que relay-master está online ejecutando pm2 list. Reporta en tu outbox: uptime y restarts del proceso relay-master.
STATUS: done
CHANGED: (ninguno)
DEPLOYED: no`,
    },
  ],
  // coordinator  (2 tasks, run one at a time)
  [
    {
      project: 'coordinator',
      label:   'T2-a: git log',
      task:    `# Test pipeline — git log
Muestra en tu outbox los últimos 5 commits del repo principal con:
  git log --oneline -5
No hagas ningún cambio de código.
STATUS: done
CHANGED: (ninguno)
DEPLOYED: no`,
    },
    {
      project: 'coordinator',
      label:   'T2-b: active projects',
      task:    `# Test pipeline — active projects
Lista en tu outbox los proyectos activos de relay/projects.json con su id y modo de ejecución. No hagas ningún dispatch ni cambies archivos.
STATUS: done
CHANGED: (ninguno)
DEPLOYED: no`,
    },
  ],
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

async function getTaskStatus(id) {
  const r = await fetch(`${BACKEND}/api/relay/dispatch`);
  const all = await r.json();
  return all.find(t => t.id === id) || null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function color(str, code) { return `\x1b[${code}m${str}\x1b[0m`; }
const green  = s => color(s, 32);
const red    = s => color(s, 31);
const yellow = s => color(s, 33);
const bold   = s => color(s, 1);

/**
 * Dispatch one task and poll until complete or timeout.
 * Returns the final task object (status: 'completed' | 'failed' | 'timeout').
 */
async function runTask(t) {
  const { status, body } = await post('/api/relay/dispatch', {
    project:   t.project,
    task:      t.task,
    requester: 'tests/real-pipeline-test.js',
  });

  if (status !== 200 || !body?.id) {
    console.log(`  ${red('✗')} ${t.label} — DISPATCH FAILED (${status}): ${JSON.stringify(body)}`);
    return { status: 'failed', exit_code: null, duration_sec: null };
  }

  const id = body.id;
  const startedAt = Date.now();
  console.log(`  ${yellow('→')} ${t.label} [${id.slice(0,8)}] dispatched...`);

  const deadline = startedAt + TASK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const task = await getTaskStatus(id);
    if (task && ['completed', 'failed'].includes(task.status)) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      const icon = task.status === 'completed' ? green('✅') : red('❌');
      console.log(`  ${icon} ${t.label} — ${task.status} exit:${task.exit_code ?? '?'} (${elapsed}s)`);
      return task;
    }
  }

  const elapsedMin = Math.round(TASK_TIMEOUT_MS / 60_000);
  console.log(`  ${yellow('⏱')} ${t.label} — TIMEOUT (${elapsedMin} min)`);
  return { status: 'timeout', exit_code: null, duration_sec: null };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const totalTasks = TASK_GROUPS.reduce((s, g) => s + g.length, 0);
  console.log(bold('\n🧪 Real Pipeline Test (sequential dispatch)'));
  console.log(`Backend:      ${BACKEND}`);
  console.log(`Tasks:        ${totalTasks} (${TASK_GROUPS.length} projects in parallel)`);
  console.log(`Task timeout: ${Math.round(TASK_TIMEOUT_MS/60_000)} min each\n`);

  // Run all project groups IN PARALLEL, but tasks within each group SEQUENTIALLY
  const allResults = await Promise.all(TASK_GROUPS.map(async group => {
    const results = [];
    for (const t of group) {
      const result = await runTask(t);
      results.push({ ...t, result });
    }
    return results;
  }));

  // Flatten
  const results = allResults.flat();

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(55)}`);
  console.log(bold('📋 Summary\n'));

  let completed = 0, failed = 0, timedOut = 0;
  for (const r of results) {
    const s = r.result.status;
    const icon = s === 'completed' ? green('✅') : s === 'failed' ? red('❌') : yellow('⏱');
    const dur  = r.result.duration_sec ? `${r.result.duration_sec}s` : '—';
    console.log(`  ${icon} [${r.project}] ${r.label}  exit=${r.result.exit_code ?? '?'}  dur=${dur}`);
    if (s === 'completed') completed++;
    else if (s === 'failed') failed++;
    else timedOut++;
  }

  const total   = results.length;
  const rate    = Math.round(100 * completed / total);
  const rateStr = rate >= 85 ? green(`${rate}%`) : rate >= 50 ? yellow(`${rate}%`) : red(`${rate}%`);

  console.log(`\n${'─'.repeat(55)}`);
  console.log(`${bold('Success rate:')} ${rateStr}  (${completed}/${total} ok | ${failed} failed | ${timedOut} timeout)`);

  const verdict = rate >= 85
    ? green('✅ PASS — objetivo ≥85% alcanzado — activar B3 multi-cuenta')
    : rate >= 50
    ? yellow('⚠️  PARTIAL — por debajo del objetivo (85%)')
    : red('❌ FAIL — success rate insuficiente para avanzar');

  console.log(verdict + '\n');
  process.exitCode = rate >= 85 ? 0 : 1;
}

main().catch(e => { console.error(e); process.exit(1); });
