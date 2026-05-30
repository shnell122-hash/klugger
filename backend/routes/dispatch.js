'use strict';

/**
 * /api/relay — Multi-agent coordination bridge
 *
 * Stores dispatch tasks in both:
 *   - MySQL dispatch_tasks (history, dashboard)
 *   - relay/pending-dispatches.json (relay-master polling)
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const db      = require('../db/mysql');

const DISPATCH_FILE  = process.env.DISPATCH_FILE ||
  '/var/lib/ai-monitor/pending-dispatches.json';
const PROJECTS_FILE  = path.join(__dirname, '..', '..', 'relay', 'projects.json');

function readQueue() {
  try { return JSON.parse(fs.readFileSync(DISPATCH_FILE, 'utf8')); }
  catch (_) { return []; }
}

function writeQueue(queue) {
  // Keep only last 200 entries; relay-master only needs pending ones
  const trimmed = queue.slice(-200);
  fs.writeFileSync(DISPATCH_FILE, JSON.stringify(trimmed, null, 2) + '\n');
}

function readProjects() {
  try { return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); }
  catch (_) { return []; }
}

// ── GET /api/relay/agents ─────────────────────────────────────
router.get('/agents', async (req, res) => {
  const projects = readProjects().filter(p => p.active && p.inbox);
  const cutoff   = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const results  = await Promise.all(projects.map(async p => {
    try {
      const [[row]] = await db.query(
        `SELECT
           SUM(CASE WHEN status IN ('pending','dispatched') THEN 1 ELSE 0 END) AS active_count,
           COUNT(*) AS total_today,
           MAX(created_at) AS last_activity,
           (SELECT title FROM dispatch_tasks
            WHERE project = ? AND status IN ('pending','dispatched')
            ORDER BY created_at DESC LIMIT 1) AS current_task
         FROM dispatch_tasks
         WHERE project = ? AND created_at >= ?`,
        [p.id, p.id, cutoff]
      );
      const active = parseInt(row.active_count || 0);
      const hasRecent = parseInt(row.total_today || 0) > 0;
      return {
        id:            p.id,
        name:          p.name,
        url:           p.url || null,
        github:        p.github || null,
        claude_model:  p.claude_model || 'claude-sonnet-4-6',
        status:        active > 0 ? 'working' : hasRecent ? 'idle' : 'inactive',
        current_task:  row.current_task || null,
        cost_today:    0,
        last_activity: row.last_activity || null,
      };
    } catch (_) {
      return { id: p.id, name: p.name, claude_model: p.claude_model || 'claude-sonnet-4-6', status: 'idle', current_task: null, cost_today: 0, last_activity: null };
    }
  }));
  res.json(results);
});

// ── POST /api/relay/dispatch ──────────────────────────────────
router.post('/dispatch', async (req, res) => {
  const { project, task, requester, parent_id, depth, chain_after } = req.body;

  if (!project || !task) {
    return res.status(400).json({ error: 'project and task are required' });
  }

  // Depth guard — prevent runaway sub-task chains
  const taskDepth = parseInt(depth ?? 0, 10);
  if (taskDepth > 3) {
    return res.status(409).json({ error: 'max sub-task depth (3) reached — cannot dispatch deeper' });
  }

  // P0.3 — content quality filter: reject tasks with no actionable instruction
  const taskTrimmed = task.trim();
  const wordCount   = taskTrimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount < 4) {
    return res.status(400).json({ error: 'task too short — must be at least 4 words with a clear instruction' });
  }
  // Reject bare relay-forward headers with no body (common cause of coordinator overload)
  if (/^(Mensaje de .+ via Buz[oó]n|Forwarded message|Re:\s*)$/im.test(taskTrimmed) && wordCount < 10) {
    return res.status(400).json({ error: 'task is a relay forward without actionable body — add specific instructions' });
  }

  const projects = readProjects();
  const target   = projects.find(p => p.id === project);
  if (!target) {
    return res.status(404).json({ error: `Project '${project}' not found` });
  }
  if (!target.active || !target.inbox) {
    return res.status(409).json({ error: `Project '${project}' has no active inbox` });
  }

  // P0.3 — coordinator concurrency limit: max 5 active tasks
  if (project === 'coordinator') {
    try {
      const [[{ active_count }]] = await db.query(
        `SELECT COUNT(*) AS active_count FROM dispatch_tasks WHERE project = 'coordinator' AND status IN ('pending','dispatched')`
      );
      if (parseInt(active_count) >= 5) {
        return res.status(429).json({ error: 'coordinator has 5 active tasks — wait for completion before dispatching more' });
      }
    } catch (_) {}
  }

  // Extract title from task (first # heading)
  const titleMatch = task.match(/^#{1,3}\s+(.+)/m);
  const title = titleMatch?.[1] || task.slice(0, 80);

  const dispatch = {
    id:          crypto.randomUUID(),
    parent_id:   parent_id || null,
    project,
    title,
    task,
    requester:   requester || 'api',
    depth:       taskDepth,
    chain_after: chain_after || null,
    status:      'pending',
    created_at:  new Date().toISOString(),
    dispatched_at: null,
    completed_at:  null,
    result_summary: null,
  };

  // 1) Write to JSON queue (relay-master polling)
  const queue = readQueue();
  queue.push(dispatch);
  writeQueue(queue);

  // 2) Write to DB (history + dashboard)
  try {
    await db.query(
      `INSERT INTO dispatch_tasks
         (id, parent_id, project, title, task, requester, depth, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [dispatch.id, dispatch.parent_id, project, title,
       task.slice(0, 65535), dispatch.requester, taskDepth]
    );
  } catch (dbErr) {
    // DB error is non-fatal — relay-master still works via JSON
    console.error('[dispatch] DB insert error (non-fatal):', dbErr.message);
  }

  // 3) Broadcast via Socket.io
  const io = req.app.get('io');
  if (io) io.emit('dispatch:new', { ...dispatch, task: undefined });

  console.log(`[dispatch] Queued (depth:${taskDepth}) → ${project}: ${title}`);
  res.json({ ok: true, id: dispatch.id, project, status: 'pending', depth: taskDepth });
});

// ── GET /api/relay/dispatch ───────────────────────────────────
router.get('/dispatch', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, parent_id, project, title, requester, depth, status,
              plan_items, result_items, result_summary, files_changed, commits_made,
              ask_question, screenshot_url, exit_code, duration_sec,
              created_at, dispatched_at, completed_at
       FROM dispatch_tasks
       ORDER BY created_at DESC LIMIT 100`
    );
    return res.json(rows);
  } catch (_) {
    // Fallback to JSON file if DB unavailable
    const queue = readQueue();
    res.json(queue.slice(-100).reverse());
  }
});

// ── GET /api/relay/dispatch/stats ────────────────────────────
// Pipeline reliability stats per project (last N days)
// MUST be before /dispatch/:id to avoid Express matching 'stats' as :id
router.get('/dispatch/stats', async (req, res) => {
  const days = parseInt(req.query.days ?? 7, 10);
  try {
    const [rows] = await db.query(
      `SELECT
         project,
         COUNT(*) AS total,
         SUM(status = 'completed') AS completed,
         SUM(status = 'failed') AS failed,
         SUM(status IN ('pending','dispatched')) AS stuck,
         ROUND(100.0 * SUM(status = 'completed') / COUNT(*), 1) AS success_rate_pct,
         ROUND(AVG(CASE WHEN status = 'completed' THEN duration_sec END) / 60, 1) AS avg_min_completed
       FROM dispatch_tasks
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY project
       ORDER BY total DESC`,
      [days]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/relay/dispatch/ab ───────────────────────────────
// A/B comparison: relay metrics per project for the dashboard panel
// Returns per-project: success rate, avg duration, avg files/commits,
// avg tool calls and avg cost from agent_sessions (joined by project+time window)
router.get('/dispatch/ab', async (req, res) => {
  const days = parseInt(req.query.days ?? 7, 10);
  try {
    const [rows] = await db.query(
      `SELECT
         dt.project,
         COUNT(*) AS total,
         SUM(dt.status = 'completed') AS completed,
         ROUND(100.0 * SUM(dt.status = 'completed') / COUNT(*), 1) AS success_rate_pct,
         ROUND(AVG(CASE WHEN dt.status = 'completed' THEN dt.duration_sec END) / 60, 1) AS avg_min,
         ROUND(AVG(CASE WHEN dt.status = 'completed' THEN dt.files_changed END), 1) AS avg_files,
         ROUND(AVG(CASE WHEN dt.status = 'completed' THEN dt.commits_made END), 1) AS avg_commits,
         ROUND(AVG(s.tool_call_count), 0) AS avg_tools,
         ROUND(AVG(s.total_cost_usd), 5) AS avg_cost_usd,
         ROUND(SUM(s.total_cache_read_tokens) / NULLIF(COUNT(*),0), 0) AS avg_cache_read_tokens
       FROM dispatch_tasks dt
       LEFT JOIN agent_sessions s
         ON s.project_name = dt.project
        AND s.started_at >= dt.created_at
        AND s.started_at <= IFNULL(dt.completed_at, NOW())
       WHERE dt.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY dt.project
       ORDER BY total DESC`,
      [days]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/relay/dispatch/:id ───────────────────────────────
router.get('/dispatch/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM dispatch_tasks WHERE id = ?', [req.params.id]
    );
    if (rows.length) return res.json(rows[0]);
  } catch (_) {}
  // Fallback to JSON
  const item = readQueue().find(d => d.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// ── POST /api/relay/dispatch/:id/dispatched ──────────────────
router.post('/dispatch/:id/dispatched', async (req, res) => {
  // Update JSON queue
  const queue = readQueue();
  const idx   = queue.findIndex(d => d.id === req.params.id);
  if (idx !== -1) {
    queue[idx] = { ...queue[idx], status: 'dispatched', dispatched_at: new Date().toISOString() };
    writeQueue(queue);
  }
  // Update DB
  try {
    await db.query(
      `UPDATE dispatch_tasks SET status = 'dispatched', dispatched_at = NOW() WHERE id = ?`,
      [req.params.id]
    );
  } catch (_) {}
  res.json({ ok: true });
});

// ── POST /api/relay/dispatch/:id/expire ──────────────────────
// P0.1 — marks a stuck task as failed with an expiry reason
router.post('/dispatch/:id/expire', async (req, res) => {
  const { reason } = req.body || {};
  const note = reason || 'expired: stuck in dispatched/pending';

  const queue = readQueue();
  const idx   = queue.findIndex(d => d.id === req.params.id);
  if (idx !== -1) {
    queue[idx] = { ...queue[idx], status: 'failed', completed_at: new Date().toISOString(), result_summary: note };
    writeQueue(queue);
  }
  try {
    await db.query(
      `UPDATE dispatch_tasks SET status = 'failed', completed_at = NOW(),
         result_items = ? WHERE id = ? AND status IN ('pending','dispatched')`,
      [JSON.stringify([note]), req.params.id]
    );
  } catch (dbErr) {
    console.error('[dispatch] expire error (non-fatal):', dbErr.message);
  }
  const io = req.app.get('io');
  if (io) io.emit('dispatch:complete', { id: req.params.id, status: 'failed', exit_code: -1, reason: note });
  res.json({ ok: true, expired: true });
});

// ── POST /api/relay/dispatch/expire-stuck ────────────────────
// Bulk-expire all tasks stuck in dispatched/pending for > max_age_minutes
router.post('/dispatch/expire-stuck', async (req, res) => {
  const maxAgeMin = parseInt(req.body?.max_age_minutes ?? 30, 10);
  try {
    const [rows] = await db.query(
      `SELECT id, project, title, status, dispatched_at, created_at FROM dispatch_tasks
       WHERE status IN ('pending','dispatched')
         AND COALESCE(dispatched_at, created_at) < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [maxAgeMin]
    );
    if (!rows.length) return res.json({ ok: true, expired: 0 });
    const ids = rows.map(r => r.id);
    await db.query(
      `UPDATE dispatch_tasks SET status = 'failed', completed_at = NOW(),
         result_items = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
      [JSON.stringify([`auto-expired: stuck >${maxAgeMin}min`]), ...ids]
    );
    const io = req.app.get('io');
    if (io) ids.forEach(id => io.emit('dispatch:complete', { id, status: 'failed', exit_code: -1, reason: 'expired' }));
    res.json({ ok: true, expired: ids.length, ids });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Parse files_changed and commits_made from raw agent output
function extractQualityMetrics(text) {
  if (!text) return { files_changed: 0, commits_made: 0 };

  // files_changed: git summary line "N file(s) changed" or outbox "CHANGED: f1, f2"
  const gitFilesMatch = text.match(/(\d+) files? changed/);
  const outboxMatch   = text.match(/^CHANGED:\s*(.+)/m);
  const filesFromGit  = gitFilesMatch ? parseInt(gitFilesMatch[1], 10) : 0;
  const filesFromOutbox = outboxMatch
    ? outboxMatch[1].split(',').map(s => s.trim()).filter(Boolean).length
    : 0;
  const files_changed = Math.max(filesFromGit, filesFromOutbox);

  // commits_made: count "[branch abc123]" git commit header lines
  const commitHeaders = text.match(/\[[^\]]+\s+[a-f0-9]{5,}\]/g);
  const commits_made  = commitHeaders ? commitHeaders.length : 0;

  return { files_changed, commits_made };
}

// ── POST /api/relay/dispatch/:id/complete ────────────────────
router.post('/dispatch/:id/complete', async (req, res) => {
  const { result_summary, exit_code, result_items, screenshot_url, duration_sec,
          files_changed: bodyFiles, commits_made: bodyCommits } = req.body;
  const status = (exit_code === 0 || exit_code == null) ? 'completed' : 'failed';
  // Prefer git-counted values from relay (accurate) over text-regex extraction (unreliable)
  const extracted = extractQualityMetrics(result_summary);
  const files_changed = bodyFiles != null ? parseInt(bodyFiles, 10) : extracted.files_changed;
  const commits_made  = bodyCommits != null ? parseInt(bodyCommits, 10) : extracted.commits_made;

  // Update JSON queue
  const queue  = readQueue();
  const idx    = queue.findIndex(d => d.id === req.params.id);
  if (idx !== -1) {
    queue[idx] = { ...queue[idx], status, completed_at: new Date().toISOString(),
                   result_summary, files_changed, commits_made };
    writeQueue(queue);
  }

  // Update DB
  try {
    await db.query(
      `UPDATE dispatch_tasks SET
         status = ?, exit_code = ?, duration_sec = ?,
         result_items = ?, screenshot_url = ?, completed_at = NOW(),
         result_summary = ?, files_changed = ?, commits_made = ?
       WHERE id = ?`,
      [status, exit_code ?? null, duration_sec ?? null,
       result_items ? JSON.stringify(result_items) : null,
       screenshot_url || null,
       result_summary ? result_summary.slice(0, 65535) : null,
       files_changed, commits_made,
       req.params.id]
    );
  } catch (dbErr) {
    console.error('[dispatch] DB complete error (non-fatal):', dbErr.message);
  }

  const io = req.app.get('io');
  if (io) io.emit('dispatch:complete', { id: req.params.id, status, exit_code });

  res.json({ ok: true });
});

// ── POST /api/relay/dispatch/:id/ask ─────────────────────────
// Agent wrote ASK: in outbox — mark as waiting_for_input, store question
router.post('/dispatch/:id/ask', async (req, res) => {
  const { question, session_id, partial_result, duration_sec } = req.body;

  const queue = readQueue();
  const idx   = queue.findIndex(d => d.id === req.params.id);
  if (idx !== -1) {
    queue[idx] = { ...queue[idx], status: 'waiting_for_input' };
    writeQueue(queue);
  }

  try {
    await db.query(
      `UPDATE dispatch_tasks
         SET status = 'waiting_for_input',
             ask_question = ?,
             ask_session_id = ?,
             result_summary = COALESCE(?, result_summary),
             duration_sec   = COALESCE(?, duration_sec)
       WHERE id = ?`,
      [question || null, session_id || null,
       partial_result ? partial_result.slice(0, 65535) : null,
       duration_sec || null,
       req.params.id]
    );
  } catch (dbErr) {
    console.error('[dispatch] ask error (non-fatal):', dbErr.message);
  }

  const io = req.app.get('io');
  if (io) io.emit('dispatch:update', { id: req.params.id, status: 'waiting_for_input', ask_question: question });

  res.json({ ok: true });
});

// ── GET /api/relay/dispatch/:id/subtasks ─────────────────────
router.get('/dispatch/:id/subtasks', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, project, title, status, depth, created_at, completed_at
       FROM dispatch_tasks WHERE parent_id = ? ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
