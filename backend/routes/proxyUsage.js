'use strict';

/**
 * GET /api/proxy-usage/stats
 * Returns estimated Claude Pro/Max token consumption for today and this week.
 *
 * Sources:
 *  1. conversations WHERE provider = 'anthropic-proxy'  → bot /claude calls
 *  2. sessions WHERE api_provider = 'anthropic'          → relay OAuth subprocess calls
 *     (all relay calls are OAuth since ANTHROPIC_API_KEY was removed from subprocess env)
 *
 * Tokens from the proxy are estimated (prompt length / 4) — the CLI doesn't
 * return real token counts.  Relay tokens come from stream-json parsing.
 *
 * GET /api/proxy-usage/limit        → get/set weekly token limit
 * PUT /api/proxy-usage/limit        → { limit: N }
 */

const express = require('express');

const router = express.Router();

// Weekly limit default: 2M tokens (Claude Pro Sonnet is ~10M/week approx)
// Configurable so each team can set their real limit once they observe usage.
const DEFAULT_WEEKLY_LIMIT = parseInt(process.env.PROXY_WEEKLY_TOKEN_LIMIT || '2000000');

function startOfWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d;
}

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// GET /api/proxy-usage/stats
router.get('/stats', async (req, res) => {
  const pool = req.app.locals.pool;
  if (!pool) return res.status(500).json({ error: 'DB no disponible' });

  const weekStart = startOfWeek().toISOString().slice(0, 19).replace('T', ' ');
  const dayStart  = startOfDay().toISOString().slice(0, 19).replace('T', ' ');

  try {
    // 1. Bot /claude proxy calls (from conversations table)
    const [botWeek] = await pool.query(`
      SELECT
        COUNT(*)                              AS calls,
        COALESCE(SUM(tokens_in),  0)          AS tokens_in,
        COALESCE(SUM(tokens_out), 0)          AS tokens_out,
        COALESCE(SUM(cost_usd),   0)          AS cost_usd
      FROM conversations
      WHERE provider = 'anthropic-proxy'
        AND role = 'assistant'
        AND created_at >= ?
    `, [weekStart]);

    const [botToday] = await pool.query(`
      SELECT
        COUNT(*)                              AS calls,
        COALESCE(SUM(tokens_in),  0)          AS tokens_in,
        COALESCE(SUM(tokens_out), 0)          AS tokens_out
      FROM conversations
      WHERE provider = 'anthropic-proxy'
        AND role = 'assistant'
        AND created_at >= ?
    `, [dayStart]);

    // 2. Relay OAuth sessions (from sessions table, api_provider = 'anthropic')
    // These are the claude --print subprocess calls — all OAuth since d6fb796
    const [relayWeek] = await pool.query(`
      SELECT
        COUNT(*)                                  AS sessions,
        COALESCE(SUM(total_input_tokens),  0)     AS tokens_in,
        COALESCE(SUM(total_output_tokens), 0)     AS tokens_out
      FROM sessions
      WHERE api_provider = 'anthropic'
        AND started_at >= ?
    `, [weekStart]);

    const [relayToday] = await pool.query(`
      SELECT
        COUNT(*)                                  AS sessions,
        COALESCE(SUM(total_input_tokens),  0)     AS tokens_in,
        COALESCE(SUM(total_output_tokens), 0)     AS tokens_out
      FROM sessions
      WHERE api_provider = 'anthropic'
        AND started_at >= ?
    `, [dayStart]);

    // Retrieve configurable weekly limit from system_state if set
    let weeklyLimit = DEFAULT_WEEKLY_LIMIT;
    try {
      const [limitRow] = await pool.query(
        `SELECT value FROM system_state WHERE \`key\` = 'proxy_weekly_token_limit' LIMIT 1`
      );
      if (limitRow[0]?.value) weeklyLimit = parseInt(limitRow[0].value) || DEFAULT_WEEKLY_LIMIT;
    } catch (_) {}

    const bw = botWeek[0];
    const bt = botToday[0];
    const rw = relayWeek[0];
    const rt = relayToday[0];

    const weekTotal  = (Number(bw.tokens_in) + Number(bw.tokens_out)) + (Number(rw.tokens_in) + Number(rw.tokens_out));
    const todayTotal = (Number(bt.tokens_in) + Number(bt.tokens_out)) + (Number(rt.tokens_in) + Number(rt.tokens_out));
    const pctUsed    = weeklyLimit > 0 ? Math.min(100, Math.round(weekTotal / weeklyLimit * 100)) : 0;

    res.json({
      week: {
        bot_proxy:   { calls: Number(bw.calls), tokens_in: Number(bw.tokens_in), tokens_out: Number(bw.tokens_out) },
        relay_oauth: { sessions: Number(rw.sessions), tokens_in: Number(rw.tokens_in), tokens_out: Number(rw.tokens_out) },
        total_tokens: weekTotal,
      },
      today: {
        bot_proxy:   { calls: Number(bt.calls), tokens_in: Number(bt.tokens_in), tokens_out: Number(bt.tokens_out) },
        relay_oauth: { sessions: Number(rt.sessions), tokens_in: Number(rt.tokens_in), tokens_out: Number(rt.tokens_out) },
        total_tokens: todayTotal,
      },
      limit_weekly: weeklyLimit,
      pct_used: pctUsed,
      note: 'Bot proxy tokens are estimated (prompt_length/4). Relay tokens from stream-json parsing.',
    });
  } catch (e) {
    console.error('[proxy-usage]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/proxy-usage/limit — set weekly token limit
router.put('/limit', async (req, res) => {
  const pool  = req.app.locals.pool;
  const limit = parseInt(req.body?.limit);
  if (!limit || limit < 0) return res.status(400).json({ error: 'limit inválido' });
  try {
    await pool.query(
      `INSERT INTO system_state (\`key\`, value) VALUES ('proxy_weekly_token_limit', ?)
       ON DUPLICATE KEY UPDATE value = ?`,
      [String(limit), String(limit)]
    );
    res.json({ ok: true, limit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
