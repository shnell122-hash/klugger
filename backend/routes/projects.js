'use strict';

/**
 * backend/routes/projects.js
 * GET  /api/projects          — list all projects with cost summary
 * GET  /api/projects/:id      — single project detail
 * POST /api/projects/:id/costs — total cost for a project (from events table)
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db/mysql');

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
    res.json(rows);
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

module.exports = router;
