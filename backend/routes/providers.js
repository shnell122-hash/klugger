'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/mysql');

// GET /api/providers — list all providers
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         p.*,
         ROUND(COALESCE(SUM(e.estimated_cost_usd), 0), 6) AS total_spent_usd,
         COUNT(DISTINCT e.session_id) AS total_sessions,
         COUNT(e.id) AS total_events
       FROM api_providers p
       LEFT JOIN agent_events e ON e.api_provider = p.provider
         AND e.timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY p.id
       ORDER BY p.provider ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[providers] GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/providers — add or update a provider config
router.post('/', async (req, res) => {
  try {
    const {
      provider,
      project_name,
      api_key,           // full key — we only store last 6 chars
      cost_per_input_token,
      cost_per_output_token,
      cost_per_request,
      monthly_limit_usd,
    } = req.body;

    if (!provider) return res.status(400).json({ error: 'provider required' });

    const masked = api_key
      ? '••••••' + String(api_key).slice(-6)
      : null;

    await db.query(
      `INSERT INTO api_providers
         (provider, project_name, api_key_masked, cost_per_input_token,
          cost_per_output_token, cost_per_request, monthly_limit_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         project_name          = VALUES(project_name),
         api_key_masked        = COALESCE(VALUES(api_key_masked), api_key_masked),
         cost_per_input_token  = COALESCE(VALUES(cost_per_input_token), cost_per_input_token),
         cost_per_output_token = COALESCE(VALUES(cost_per_output_token), cost_per_output_token),
         cost_per_request      = COALESCE(VALUES(cost_per_request), cost_per_request),
         monthly_limit_usd     = COALESCE(VALUES(monthly_limit_usd), monthly_limit_usd)`,
      [
        provider,
        project_name || null,
        masked,
        cost_per_input_token  || null,
        cost_per_output_token || null,
        cost_per_request      || null,
        monthly_limit_usd     || null,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[providers] POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/providers/costs — costs by provider + project (time series)
router.get('/costs', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;

    // By provider
    const [byProvider] = await db.query(
      `SELECT
         api_provider,
         COUNT(DISTINCT session_id) AS sessions,
         COUNT(*) AS events,
         ROUND(SUM(estimated_cost_usd), 6) AS cost_usd,
         SUM(estimated_tokens) AS tokens
       FROM agent_events
       WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY api_provider
       ORDER BY cost_usd DESC`,
      [days]
    );

    // By project
    const [byProject] = await db.query(
      `SELECT
         COALESCE(project_name, 'sin proyecto') AS project_name,
         api_provider,
         COUNT(DISTINCT session_id) AS sessions,
         ROUND(SUM(estimated_cost_usd), 6) AS cost_usd
       FROM agent_events
       WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY project_name, api_provider
       ORDER BY cost_usd DESC`,
      [days]
    );

    // Time series by day + provider
    const [timeSeries] = await db.query(
      `SELECT
         DATE(timestamp) AS day,
         api_provider,
         ROUND(SUM(estimated_cost_usd), 6) AS cost_usd,
         COUNT(*) AS events
       FROM agent_events
       WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY day, api_provider
       ORDER BY day ASC`,
      [days]
    );

    res.json({ by_provider: byProvider, by_project: byProject, time_series: timeSeries });
  } catch (err) {
    console.error('[providers/costs] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
