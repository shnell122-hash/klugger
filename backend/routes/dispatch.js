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

const DISPATCH_FILE  = path.join(__dirname, '..', '..', 'relay', 'pending-dispatches.json');
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
        status:        active > 0 ? 'working' : hasRecent ? 'idle' : 'inactive',
        current_task:  row.current_task || null,
        cost_today:    0,
        last_activity: row.last_activity || null,
      };
    } catch (_) {
      return { id: p.id, name: p.name, status: 'idle', current_task: null, cost_today: 0, last_activity: null };
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

  const projects = readProjects();
  const target   = projects.find(p => p.id === project);
  if (!target) {
    return res.status(404).json({ error: `Project '${project}' not found` });
  }
  if (!target.active || !target.inbox) {
    return res.status(409).json({ error: `Project '${project}' has no active inbox` });
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
              plan_items, result_items, screenshot_url, exit_code, duration_sec,
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

// ── POST /api/relay/dispatch/:id/complete ────────────────────
router.post('/dispatch/:id/complete', async (req, res) => {
  const { result_summary, exit_code, result_items, screenshot_url, duration_sec } = req.body;
  const status = (exit_code === 0 || exit_code == null) ? 'completed' : 'failed';

  // Update JSON queue
  const queue  = readQueue();
  const idx    = queue.findIndex(d => d.id === req.params.id);
  if (idx !== -1) {
    queue[idx] = { ...queue[idx], status, completed_at: new Date().toISOString(), result_summary };
    writeQueue(queue);
  }

  // Update DB
  try {
    await db.query(
      `UPDATE dispatch_tasks SET
         status = ?, exit_code = ?, duration_sec = ?,
         result_items = ?, screenshot_url = ?, completed_at = NOW()
       WHERE id = ?`,
      [status, exit_code ?? null, duration_sec ?? null,
       result_items ? JSON.stringify(result_items) : null,
       screenshot_url || null, req.params.id]
    );
  } catch (dbErr) {
    console.error('[dispatch] DB complete error (non-fatal):', dbErr.message);
  }

  const io = req.app.get('io');
  if (io) io.emit('dispatch:complete', { id: req.params.id, status, exit_code });

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
