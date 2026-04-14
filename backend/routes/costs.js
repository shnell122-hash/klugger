'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/mysql');

// GET /api/costs — cost summaries
router.get('/', async (req, res) => {
  try {
    // Today's total
    const [[today]] = await db.query(
      `SELECT
         COUNT(DISTINCT session_id) AS sessions,
         COUNT(*) AS events,
         ROUND(SUM(estimated_cost_usd), 6) AS total_cost_usd,
         SUM(estimated_tokens) AS total_tokens
       FROM agent_events
       WHERE DATE(timestamp) = CURDATE()`
    );

    // This week
    const [[week]] = await db.query(
      `SELECT
         COUNT(DISTINCT session_id) AS sessions,
         COUNT(*) AS events,
         ROUND(SUM(estimated_cost_usd), 6) AS total_cost_usd,
         SUM(estimated_tokens) AS total_tokens
       FROM agent_events
       WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    // Last 24h by tool
    const [byTool] = await db.query(
      `SELECT
         tool_name,
         COUNT(*) AS calls,
         ROUND(SUM(estimated_cost_usd), 6) AS cost_usd
       FROM agent_events
       WHERE event_type = 'post_tool'
         AND timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       GROUP BY tool_name
       ORDER BY calls DESC
       LIMIT 20`
    );

    // Last 24h by hour (for chart)
    const [byHour] = await db.query(
      `SELECT
         DATE_FORMAT(timestamp, '%Y-%m-%d %H:00:00') AS hour_bucket,
         COUNT(*) AS events,
         ROUND(SUM(estimated_cost_usd), 6) AS cost_usd
       FROM agent_events
       WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       GROUP BY hour_bucket
       ORDER BY hour_bucket ASC`
    );

    // Top sessions by cost (all time)
    const [topSessions] = await db.query(
      `SELECT
         id AS session_id,
         agent_user,
         working_dir,
         started_at,
         ended_at,
         tool_call_count,
         ROUND(total_cost_usd, 6) AS total_cost_usd,
         is_active
       FROM agent_sessions
       ORDER BY total_cost_usd DESC
       LIMIT 10`
    );

    res.json({
      today,
      week,
      by_tool:       byTool,
      by_hour:       byHour,
      top_sessions:  topSessions,
    });
  } catch (err) {
    console.error('[costs] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
