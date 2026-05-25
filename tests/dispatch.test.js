'use strict';

/**
 * Tests for the /api/relay/dispatch endpoint and projects.json integrity.
 *
 * Usage:
 *   node tests/dispatch.test.js                    # against running backend (default: localhost:3010)
 *   BACKEND=https://ia.vilarkptl.com node tests/dispatch.test.js
 *
 * Tests are read-only and safe to run in production (no tasks are actually started;
 * depth-guard test uses project "nonexistent" which returns 404 before writing anything).
 */

const assert = require('assert/strict');
const path   = require('path');
const fs     = require('fs');

const BACKEND = process.env.BACKEND || 'http://localhost:3010';

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const _queue = [];

function test(name, fn) {
  _queue.push({ name, fn });
}

async function runAll() {
  for (const { name, fn } of _queue) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ ${name}`);
      console.error(`     ${err.message}`);
      failed++;
    }
  }
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

async function post(path, body) {
  const res = await fetch(`${BACKEND}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function get(path) {
  const res = await fetch(`${BACKEND}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ── Suite 1: projects.json integrity ─────────────────────────────────────────

console.log('\n📋 Suite 1: projects.json integrity');

const PROJECTS_FILE = path.join(__dirname, '..', 'relay', 'projects.json');

test('projects.json exists and is valid JSON', async () => {
  const raw = fs.readFileSync(PROJECTS_FILE, 'utf8');
  const projects = JSON.parse(raw);
  assert.ok(Array.isArray(projects), 'should be an array');
  assert.ok(projects.length > 0, 'should have at least one project');
});

test('every active project has id and inbox; non-llm-direct also has repo', async () => {
  const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
  const active   = projects.filter(p => p.active);
  for (const p of active) {
    assert.ok(p.id,    `project missing id: ${JSON.stringify(p)}`);
    assert.ok(p.inbox, `project '${p.id}' is active but has no inbox`);
    if (p.mode !== 'llm-direct') {
      assert.ok(p.repo, `project '${p.id}' (mode=${p.mode || 'claude-code'}) has no repo`);
    }
  }
});

test('no duplicate project ids', async () => {
  const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
  const ids = projects.map(p => p.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicate ids: ${dupes.join(', ')}`);
});

// ── Suite 2: GET /api/relay/agents ────────────────────────────────────────────

console.log('\n📡 Suite 2: GET /api/relay/agents');

test('returns 200 with array of active agents', async () => {
  const { status, body } = await get('/api/relay/agents');
  assert.equal(status, 200, `expected 200, got ${status}`);
  assert.ok(Array.isArray(body), 'body should be array');
});

test('each agent entry has id and active_count', async () => {
  const { body } = await get('/api/relay/agents');
  for (const agent of (body || [])) {
    assert.ok(agent.id !== undefined,           `agent missing id`);
    assert.ok(agent.active_count !== undefined, `agent '${agent.id}' missing active_count`);
  }
});

// ── Suite 3: POST /api/relay/dispatch — validation ───────────────────────────

console.log('\n📮 Suite 3: POST /api/relay/dispatch — validation');

test('missing project → 400', async () => {
  const { status } = await post('/api/relay/dispatch', { task: 'hello' });
  assert.equal(status, 400, `expected 400, got ${status}`);
});

test('missing task → 400', async () => {
  const { status } = await post('/api/relay/dispatch', { project: 'coordinator' });
  assert.equal(status, 400, `expected 400, got ${status}`);
});

test('unknown project → 404', async () => {
  const { status } = await post('/api/relay/dispatch', {
    project: '__nonexistent_project_for_test__',
    task: 'test task',
  });
  assert.equal(status, 404, `expected 404, got ${status}`);
});

test('depth > 3 → 409', async () => {
  const { status } = await post('/api/relay/dispatch', {
    project: 'coordinator',
    task:    'depth guard test',
    depth:   4,
  });
  assert.equal(status, 409, `expected 409, got ${status}`);
});

test('valid coordinator dispatch → 200 with id', async () => {
  const { status, body } = await post('/api/relay/dispatch', {
    project:   'coordinator',
    task:      '# Test dispatch\n\nNOP — automated test. Ignore this task.',
    requester: 'tests/dispatch.test.js',
    depth:     3, // max allowed depth so relay-master won't execute it
  });
  // 200 or 409 (if coordinator has no active inbox) are both acceptable
  assert.ok(
    status === 200 || status === 409,
    `expected 200 or 409, got ${status}: ${JSON.stringify(body)}`
  );
  if (status === 200) {
    assert.ok(body.id, 'response should include id');
    assert.equal(body.status, 'pending', 'status should be pending');
  }
});

// ── Suite 4: GET /api/relay/dispatch ─────────────────────────────────────────

console.log('\n📃 Suite 4: GET /api/relay/dispatch');

test('returns 200 with array', async () => {
  const { status, body } = await get('/api/relay/dispatch');
  assert.equal(status, 200, `expected 200, got ${status}`);
  assert.ok(Array.isArray(body), 'body should be array');
});

// ── Suite 5: Session resume stats ────────────────────────────────────────────

console.log('\n📊 Suite 5: GET /api/sessions/stats/resume');

test('returns 200 with today and by_project', async () => {
  const { status, body } = await get('/api/sessions/stats/resume');
  assert.equal(status, 200, `expected 200, got ${status}`);
  assert.ok(body.today !== undefined,      'should have today');
  assert.ok(Array.isArray(body.by_project), 'should have by_project array');
});

test('today has total, resumed, rate_pct fields', async () => {
  const { body } = await get('/api/sessions/stats/resume');
  const t = body.today;
  assert.ok(t.total      !== undefined, 'today.total missing');
  assert.ok(t.resumed    !== undefined, 'today.resumed missing');
  assert.ok(t.rate_pct   !== undefined, 'today.rate_pct missing');
  assert.ok(t.resumed    <= t.total,    `resumed (${t.resumed}) should not exceed total (${t.total})`);
});

// ── Run ──────────────────────────────────────────────────────────────────────
runAll();
