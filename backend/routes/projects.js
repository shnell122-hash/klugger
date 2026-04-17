'use strict';

/**
 * backend/routes/projects.js
 * GET  /api/projects                   — list all projects with cost summary
 * GET  /api/projects/:id               — single project detail
 * GET  /api/projects/:id/journal       — relay journal (recent tasks ✅/❌)
 * GET  /api/projects/:id/context       — agent context markdown
 * GET  /api/projects/:id/costs/history — cost time-series (period=24h|7d|30d)
 * PATCH /api/projects/:id              — update project fields
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db/mysql');
const fs      = require('fs');
const path    = require('path');

const RELAY_DIR = path.join(__dirname, '..', '..', 'relay');

// ── List all projects with aggregated stats ───────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        p.id,
        p.name,
        p.github_repo,
        p.url,
        p.branch,
        p.is_active,
        COUNT(DISTINCT s.id)          AS total_sessions,
        COALESCE(SUM(s.tool_call_count), 0) AS total_tool_calls,
        COALESCE(SUM(s.total_cost_usd), 0)  AS total_cost_usd,
        MAX(s.started_at)             AS last_activity
      FROM projects p
      LEFT JOIN agent_sessions s ON s.project_name = p.name
      GROUP BY p.id
      ORDER BY p.is_active DESC, last_activity DESC
    `);

    // Enrich with journal state (live file read, no DB needed)
    const enriched = rows.map(p => {
      const journal = readJournal(p.id);
      return {
        ...p,
        journal_state:              journal.state || 'active',
        journal_consecutive_failures: journal.consecutive_failures || 0,
        journal_total_tasks:         journal.total_tasks || 0,
        journal_last_task_title:     journal.recent_tasks?.[0]?.title || null,
        journal_last_task_status:    journal.recent_tasks?.[0]?.status || null,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('GET /api/projects error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Single project with recent sessions ───────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[project]] = await db.query(
      'SELECT * FROM projects WHERE id = ?', [req.params.id]
    );
    if (!project) return res.status(404).json({ error: 'Not found' });

    const [sessions] = await db.query(`
      SELECT id, started_at, ended_at, total_cost_usd, tool_call_count, is_active
      FROM agent_sessions
      WHERE project_name = ?
      ORDER BY started_at DESC
      LIMIT 20
    `, [project.name]);

    const [[costs]] = await db.query(`
      SELECT
        COALESCE(SUM(total_cost_usd), 0) AS total_cost_usd,
        COALESCE(SUM(tool_call_count), 0) AS total_tool_calls,
        COUNT(*) AS total_sessions
      FROM agent_sessions
      WHERE project_name = ?
    `, [project.name]);

    // Cost by hour last 24h
    const [hourly] = await db.query(`
      SELECT hour_bucket, SUM(total_cost_usd) AS cost_usd
      FROM cost_hourly
      WHERE project_name = ? AND hour_bucket >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY hour_bucket
      ORDER BY hour_bucket
    `, [project.name]);

    res.json({ project, sessions, costs, hourly });
  } catch (err) {
    console.error('GET /api/projects/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Journal: recent tasks ✅/❌ from relay/journals ────────
router.get('/:id/journal', (req, res) => {
  const journal = readJournal(req.params.id);
  res.json(journal);
});

// ── Agent context markdown (relay/agents/{id}.md) ─────────
router.get('/:id/context', (req, res) => {
  const id   = req.params.id.replace(/[^a-z0-9-]/g, '');
  const file = path.join(RELAY_DIR, 'agents', `${id}.md`);
  try {
    const content = fs.readFileSync(file, 'utf8');
    res.json({ id, content, path: file });
  } catch (_) {
    res.json({ id, content: '', path: file });
  }
});

// ── Cost history for charts (per project) ────────────────
router.get('/:id/costs/history', async (req, res) => {
  try {
    const [[project]] = await db.query(
      'SELECT name FROM projects WHERE id = ?', [req.params.id]
    );
    if (!project) return res.status(404).json({ error: 'Not found' });

    const period = req.query.period || '24h';
    let interval, groupBy;
    if (period === '7d')  { interval = 'INTERVAL 7 DAY';  groupBy = "DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00')"; }
    else if (period === '30d') { interval = 'INTERVAL 30 DAY'; groupBy = "DATE(timestamp)"; }
    else { interval = 'INTERVAL 24 HOUR'; groupBy = "DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00')"; }

    const [rows] = await db.query(`
      SELECT
        ${groupBy} AS bucket,
        COUNT(*)                          AS events,
        ROUND(SUM(estimated_cost_usd), 6) AS cost_usd,
        SUM(estimated_tokens)             AS tokens
      FROM agent_events
      WHERE project_name = ?
        AND timestamp >= DATE_SUB(NOW(), ${interval})
      GROUP BY bucket
      ORDER BY bucket ASC
    `, [project.name]);

    // Total for period
    const [[totals]] = await db.query(`
      SELECT
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(*)                   AS events,
        ROUND(SUM(estimated_cost_usd), 6) AS total_cost_usd,
        SUM(estimated_tokens)             AS total_tokens
      FROM agent_events
      WHERE project_name = ?
        AND timestamp >= DATE_SUB(NOW(), ${interval})
    `, [project.name]);

    res.json({ period, buckets: rows, totals });
  } catch (err) {
    console.error('GET /api/projects/:id/costs/history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Update project (activate/deactivate, set url, etc.) ──
router.patch('/:id', async (req, res) => {
  try {
    const { name, url, github_repo, branch, is_active } = req.body;
    await db.query(`
      UPDATE projects
      SET name        = COALESCE(?, name),
          url         = COALESCE(?, url),
          github_repo = COALESCE(?, github_repo),
          branch      = COALESCE(?, branch),
          is_active   = COALESCE(?, is_active)
      WHERE id = ?
    `, [name, url, github_repo, branch, is_active, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helper ────────────────────────────────────────────────
function readJournal(projectId) {
  const id   = String(projectId).replace(/[^a-z0-9-]/g, '');
  const file = path.join(RELAY_DIR, 'journals', `${id}.json`);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return { project_id: id, state: 'active', total_tasks: 0, consecutive_failures: 0, consecutive_successes: 0, recent_tasks: [] }; }
}

module.exports = router;
