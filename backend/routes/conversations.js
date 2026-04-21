'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/mysql');

// GET /api/conversations — one row per user with cost/activity summary
router.get('/', async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT
         telegram_user_id,
         COALESCE(MAX(telegram_username), CAST(telegram_user_id AS CHAR)) AS username,
         COUNT(*)                                                  AS total_messages,
         SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END)          AS user_turns,
         SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END)     AS assistant_turns,
         SUM(tokens_in)                                           AS total_tokens_in,
         SUM(tokens_out)                                          AS total_tokens_out,
         SUM(cache_read_tokens)                                   AS total_cache_read,
         SUM(cache_write_tokens)                                  AS total_cache_write,
         ROUND(SUM(cost_usd), 6)                                 AS total_cost_usd,
         MAX(created_at)                                          AS last_activity,
         MIN(created_at)                                          AS first_activity
       FROM conversations
       WHERE telegram_user_id IS NOT NULL
       GROUP BY telegram_user_id
       ORDER BY last_activity DESC`,
    );

    // Total cost across all users (including anonymous)
    const [[totals]] = await db.query(
      `SELECT
         COUNT(*) AS total_messages,
         ROUND(SUM(cost_usd), 6)   AS total_cost_usd,
         SUM(cache_read_tokens)    AS total_cache_read,
         SUM(tokens_in)            AS total_tokens_in,
         COUNT(DISTINCT telegram_user_id) AS unique_users
       FROM conversations`,
    );

    res.json({ users, totals });
  } catch (err) {
    console.error('[conversations] GET /', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/:userId/messages — recent messages for one user
router.get('/:userId/messages', async (req, res) => {
  try {
    const userId = req.params.userId;
    const limit  = Math.min(parseInt(req.query.limit  || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);

    const [messages] = await db.query(
      `SELECT
         id, chat_id, thread_id, role,
         content,
         tool_name, model, provider,
         tokens_in, tokens_out, cost_usd,
         cache_read_tokens, cache_write_tokens,
         created_at
       FROM conversations
       WHERE telegram_user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset],
    );

    const [[stats]] = await db.query(
      `SELECT
         COUNT(*) AS total,
         ROUND(SUM(cost_usd), 6) AS total_cost_usd,
         SUM(cache_read_tokens)  AS total_cache_read,
         SUM(tokens_in)          AS total_tokens_in,
         MAX(created_at) AS last_activity
       FROM conversations
       WHERE telegram_user_id = ?`,
      [userId],
    );

    res.json({ messages: messages.reverse(), stats });
  } catch (err) {
    console.error('[conversations] GET /:userId', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
