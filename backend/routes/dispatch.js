'use strict';

/**
 * /api/relay — Multi-agent coordination bridge
 *
 * Allows any Claude Code session (or external caller) to dispatch tasks
 * to any relay agent without direct file access.
 *
 * relay-master polls relay/pending-dispatches.json and executes dispatches.
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const DISPATCH_FILE  = path.join(__dirname, '..', '..', 'relay', 'pending-dispatches.json');
const PROJECTS_FILE  = path.join(__dirname, '..', '..', 'relay', 'projects.json');

function readQueue() {
  try { return JSON.parse(fs.readFileSync(DISPATCH_FILE, 'utf8')); }
  catch (_) { return []; }
}

function writeQueue(queue) {
  fs.writeFileSync(DISPATCH_FILE, JSON.stringify(queue, null, 2) + '\n');
}

function readProjects() {
  try { return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); }
  catch (_) { return []; }
}

// ── GET /api/relay/agents ─────────────────────────────────────
// List available agents (active projects with inbox)
router.get('/agents', (req, res) => {
  const projects = readProjects();
  const agents = projects
    .filter(p => p.active && p.inbox)
    .map(p => ({
      id:     p.id,
      name:   p.name,
      url:    p.url || null,
      github: p.github || null,
      status: 'idle',  // relay-master updates via events
    }));
  res.json(agents);
});

// ── POST /api/relay/dispatch ──────────────────────────────────
// Dispatch a task to a specific agent
// Body: { project: string, task: string, requester?: string, chain_after?: string }
router.post('/dispatch', (req, res) => {
  const { project, task, requester, chain_after } = req.body;

  if (!project || !task) {
    return res.status(400).json({ error: 'project and task are required' });
  }

  const projects = readProjects();
  const target = projects.find(p => p.id === project);
  if (!target) {
    return res.status(404).json({ error: `Project '${project}' not found` });
  }
  if (!target.active || !target.inbox) {
    return res.status(409).json({ error: `Project '${project}' has no active inbox` });
  }

  const dispatch = {
    id:          crypto.randomUUID(),
    project,
    task,
    requester:   requester || 'api',
    chain_after: chain_after || null,   // project ID to trigger after this completes
    status:      'pending',
    created_at:  new Date().toISOString(),
    dispatched_at: null,
    completed_at:  null,
    result_summary: null,
  };

  const queue = readQueue();
  queue.push(dispatch);
  writeQueue(queue);

  // Broadcast via Socket.io
  const io = req.app.get('io');
  if (io) io.emit('dispatch:new', dispatch);

  console.log(`[dispatch] Queued → ${project}: ${task.slice(0, 80)}`);
  res.json({ ok: true, id: dispatch.id, project, status: 'pending' });
});

// ── GET /api/relay/dispatch ───────────────────────────────────
// List dispatch queue (last 50)
router.get('/dispatch', (req, res) => {
  const queue = readQueue();
  // Return newest first, last 50
  res.json(queue.slice(-50).reverse());
});

// ── GET /api/relay/dispatch/:id ───────────────────────────────
router.get('/dispatch/:id', (req, res) => {
  const queue = readQueue();
  const item = queue.find(d => d.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// ── POST /api/relay/dispatch/:id/complete ────────────────────
// Called by relay-master when a dispatched task completes
router.post('/dispatch/:id/complete', (req, res) => {
  const { result_summary, exit_code } = req.body;
  const queue = readQueue();
  const idx = queue.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  queue[idx] = {
    ...queue[idx],
    status:         exit_code === 0 ? 'completed' : 'failed',
    completed_at:   new Date().toISOString(),
    result_summary: result_summary?.slice(0, 1000) || null,
  };
  writeQueue(queue);

  const io = req.app.get('io');
  if (io) io.emit('dispatch:complete', queue[idx]);

  res.json({ ok: true });
});

module.exports = router;
