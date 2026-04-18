'use strict';

const express  = require('express');
const router   = express.Router();
const db       = require('../db/mysql');
const telegram = require('../telegram');

// Claude Sonnet 4.6 pricing
const PRICING = {
  input:        3.00  / 1_000_000,
  output:       15.00 / 1_000_000,
  cache_write:  3.75  / 1_000_000,
  cache_read:   0.30  / 1_000_000,
};

// GET /api/sessions — list recent sessions (last 50)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         id,
         started_at,
         ended_at,
         working_dir,
         agent_user,
         project_name,
         api_provider,
         chat_source,
         tool_call_count,
         total_input_tokens,
         total_output_tokens,
         total_cache_read_tokens,
         total_cache_write_tokens,
         ROUND(total_cost_usd, 6) AS total_cost_usd,
         is_active,
         TIMESTAMPDIFF(SECOND, started_at, IFNULL(ended_at, NOW())) AS duration_seconds
       FROM agent_sessions
       ORDER BY started_at DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error('[sessions] GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:id/events — events for a specific session
router.get('/:id/events', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         id, event_type, tool_name,
         tool_input_summary, tool_response_summary,
         timestamp, duration_ms,
         estimated_tokens, estimated_cost_usd
       FROM agent_events
       WHERE session_id = ?
       ORDER BY timestamp ASC
       LIMIT 500`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[sessions/:id/events] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/end — called by Stop hook
// Closes session and computes final cost from real token counts (if available)
router.post('/end', async (req, res) => {
  try {
    const {
      session_id,
      timestamp,
      // Real token counts from Claude Code Stop event (if provided)
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cache_write_tokens,
    } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id required' });
    }

    const ts = timestamp ? new Date(timestamp) : new Date();

    // If real token counts available, compute accurate cost
    let realCostUpdate = '';
    let costParams = [];

    if (input_tokens != null || output_tokens != null) {
      const inp    = input_tokens        || 0;
      const out    = output_tokens       || 0;
      const cread  = cache_read_tokens   || 0;
      const cwrite = cache_write_tokens  || 0;

      const realCost = inp    * PRICING.input
                     + out    * PRICING.output
                     + cread  * PRICING.cache_read
                     + cwrite * PRICING.cache_write;

      realCostUpdate = `, total_input_tokens = ?, total_output_tokens = ?,
                         total_cache_read_tokens = ?, total_cache_write_tokens = ?,
                         total_cost_usd = ?`;
      costParams = [inp, out, cread, cwrite, realCost.toFixed(8)];
    }

    await db.query(
      `UPDATE agent_sessions
       SET ended_at = ?, is_active = 0 ${realCostUpdate}
       WHERE id = ?`,
      [ts, ...costParams, session_id]
    );

    // Fetch final session data to broadcast
    const [[session]] = await db.query(
      'SELECT * FROM agent_sessions WHERE id = ?',
      [session_id]
    );

    const io = req.app.get('io');
    if (io && session) {
      io.emit('session:ended', session);
    }

    // Telegram notification
    if (session) {
      telegram.sessionEnded(session);

      // Cost alert if daily spend exceeds limit
      const dailyLimit = parseFloat(process.env.DAILY_COST_LIMIT_USD || '10');
      if (dailyLimit > 0) {
        const [[today]] = await db.query(
          `SELECT ROUND(SUM(total_cost_usd),4) AS total
           FROM agent_sessions WHERE DATE(started_at) = CURDATE()`
        );
        if (parseFloat(today?.total || 0) >= dailyLimit) {
          telegram.costAlert(today.total, dailyLimit);
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[sessions/end] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
