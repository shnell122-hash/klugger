'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/mysql');

// POST /api/provider-costs — relay reports a real API call cost
router.post('/', async (req, res) => {
  try {
    const { provider, model, project_id, input_tokens, output_tokens, cost_usd } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider required' });
    await db.query(
      `INSERT INTO provider_costs (provider, model, project_id, input_tokens, output_tokens, cost_usd)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [provider, model || '', project_id || '', input_tokens || 0, output_tokens || 0, cost_usd || 0]
    );
    // Broadcast to dashboard via Socket.io
    const io = req.app.get('io');
    if (io) io.emit('provider_cost', { provider, model, project_id, cost_usd, ts: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err) {
    console.error('[provider-costs] POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/provider-costs — aggregate real costs by provider
router.get('/', async (req, res) => {
  try {
    // Today per provider
    const [today] = await db.query(
      `SELECT provider, model,
         SUM(input_tokens)  AS input_tokens,
         SUM(output_tokens) AS output_tokens,
         ROUND(SUM(cost_usd), 6) AS cost_usd
       FROM provider_costs
       WHERE DATE(ts) = CURDATE()
       GROUP BY provider, model
       ORDER BY cost_usd DESC`
    );

    // This week per provider
    const [week] = await db.query(
      `SELECT provider,
         SUM(input_tokens)  AS input_tokens,
         SUM(output_tokens) AS output_tokens,
         ROUND(SUM(cost_usd), 6) AS cost_usd
       FROM provider_costs
       WHERE ts >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY provider
       ORDER BY cost_usd DESC`
    );

    // This month per provider
    const [month] = await db.query(
      `SELECT provider,
         SUM(input_tokens)  AS input_tokens,
         SUM(output_tokens) AS output_tokens,
         ROUND(SUM(cost_usd), 6) AS cost_usd
       FROM provider_costs
       WHERE ts >= DATE_FORMAT(NOW(), '%Y-%m-01')
       GROUP BY provider
       ORDER BY cost_usd DESC`
    );

    // Daily totals last 30 days (for chart)
    const [daily] = await db.query(
      `SELECT DATE(ts) AS day, provider, ROUND(SUM(cost_usd), 6) AS cost_usd
       FROM provider_costs
       WHERE ts >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(ts), provider
       ORDER BY day ASC`
    );

    // Per-project this month
    const [byProject] = await db.query(
      `SELECT project_id, provider,
         ROUND(SUM(cost_usd), 6) AS cost_usd
       FROM provider_costs
       WHERE ts >= DATE_FORMAT(NOW(), '%Y-%m-01')
       GROUP BY project_id, provider
       ORDER BY cost_usd DESC
       LIMIT 20`
    );

    res.json({ today, week, month, daily, by_project: byProject });
  } catch (err) {
    console.error('[provider-costs] GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
