'use strict';

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const db      = require('../db/mysql');

const PROJECTS_FILE = path.join(__dirname, '..', '..', 'relay', 'projects.json');

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

// POST /api/providers/scan — auto-detect API keys from project .env files
router.post('/scan', async (req, res) => {
  let projects = [];
  try { projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); } catch (_) {}

  const found   = [];
  const scanned = [];

  for (const proj of projects.filter(p => p.active && p.repo)) {
    const envFiles = ['.env', '.env.local', '.env.production']
      .map(f => path.join(proj.repo, f));

    for (const envPath of envFiles) {
      if (!fs.existsSync(envPath)) continue;
      scanned.push(envPath);
      let lines = [];
      try { lines = fs.readFileSync(envPath, 'utf8').split('\n'); } catch (_) { continue; }

      for (const line of lines) {
        const m = line.match(/^(ANTHROPIC_API_KEY|OPENAI_API_KEY|DEEPSEEK_API_KEY|[\w]+_API_KEY|[\w]+_SECRET_KEY|[\w]+_TOKEN)\s*=\s*(.+)\s*$/);
        if (!m) continue;
        const [, keyName, rawVal] = m;
        const keyValue = rawVal.trim().replace(/^['"]|['"]$/g, '');
        if (!keyValue || keyValue.startsWith('$') || keyValue.includes('${')) continue;

        // Mask: keep first 4 + last 4 chars
        const masked = keyValue.length > 10
          ? keyValue.slice(0, 4) + '••••' + keyValue.slice(-4)
          : '••••' + keyValue.slice(-4);

        const provider = keyName.includes('ANTHROPIC') ? 'anthropic' :
                         keyName.includes('OPENAI')    ? 'openai'    :
                         keyName.includes('DEEPSEEK')  ? 'deepseek'  : 'other';

        found.push({ project_name: proj.name, key_name: keyName, masked, provider });

        try {
          await db.query(
            `INSERT INTO api_providers (provider, project_name, api_key_masked)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
               project_name   = VALUES(project_name),
               api_key_masked = VALUES(api_key_masked)`,
            [provider, proj.name, masked]
          );
        } catch (_) {}
      }
    }
  }

  res.json({ scanned: scanned.length, projects: projects.filter(p => p.active).length, found });
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
