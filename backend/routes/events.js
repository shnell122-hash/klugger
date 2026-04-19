'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/mysql');

// Claude Sonnet 4.6 pricing (USD per token)
const PRICING = {
  input:        3.00  / 1_000_000,
  output:       15.00 / 1_000_000,
  cache_write:  3.75  / 1_000_000,
  cache_read:   0.30  / 1_000_000,
};

// Estimate tokens from text length (~4 chars = 1 token)
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

// Ensure session row exists (upsert)
async function upsertSession(sessionId, workingDir, agentUser, projectName, apiProvider, chatSource) {
  if (!sessionId) return;
  await db.query(
    `INSERT INTO agent_sessions
       (id, started_at, working_dir, agent_user, project_name, api_provider, chat_source, is_active)
     VALUES (?, NOW(3), ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       is_active    = 1,
       project_name = COALESCE(project_name, VALUES(project_name)),
       api_provider = COALESCE(api_provider, VALUES(api_provider)),
       chat_source  = COALESCE(chat_source,  VALUES(chat_source))`,
    [sessionId, workingDir || null, agentUser || null,
     projectName || null, apiProvider || 'anthropic', chatSource || null]
  );
}

// GET /api/events/recent — last N events for dashboard initial load
router.get('/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '150', 10), 500);
    const [rows] = await db.query(
      `SELECT id, session_id, event_type, tool_name,
              tool_input_summary, tool_response_summary,
              timestamp, agent_user, project_name, api_provider,
              estimated_cost_usd
       FROM agent_events
       ORDER BY timestamp DESC LIMIT ?`,
      [limit]
    );
    res.json(rows.reverse()); // oldest first so feed renders chronologically
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events
// Receives pre_tool and post_tool events from Claude Code hooks
router.post('/', async (req, res) => {
  try {
    const {
      session_id,
      event_type,
      tool_name,
      tool_input_summary,
      tool_response_summary,
      timestamp,
      working_dir,
      agent_user,
      project_name,
      api_provider,
      chat_source,
    } = req.body;

    if (!session_id || !event_type) {
      return res.status(400).json({ error: 'session_id and event_type required' });
    }

    await upsertSession(session_id, working_dir, agent_user, project_name, api_provider, chat_source);

    // Estimate cost from combined input/response text
    const combinedText = (tool_input_summary || '') + (tool_response_summary || '');
    const estimatedTokens = estimateTokens(combinedText);
    // Split roughly 60/40 input/output for estimation
    const estimatedInputTok  = Math.ceil(estimatedTokens * 0.6);
    const estimatedOutputTok = Math.floor(estimatedTokens * 0.4);
    const estimatedCost = estimatedInputTok * PRICING.input + estimatedOutputTok * PRICING.output;

    const ts = timestamp ? new Date(timestamp) : new Date();

    const [result] = await db.query(
      `INSERT INTO agent_events
         (session_id, event_type, tool_name, tool_input_summary, tool_response_summary,
          timestamp, working_dir, agent_user, project_name, api_provider,
          estimated_tokens, estimated_cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session_id,
        event_type,
        tool_name || null,
        tool_input_summary    ? tool_input_summary.substring(0, 16000)    : null,
        tool_response_summary ? tool_response_summary.substring(0, 16000) : null,
        ts,
        working_dir   || null,
        agent_user    || null,
        project_name  || null,
        api_provider  || 'anthropic',
        estimatedTokens,
        estimatedCost.toFixed(8),
      ]
    );

    // Update session counters
    if (event_type === 'post_tool') {
      await db.query(
        `UPDATE agent_sessions
         SET tool_call_count   = tool_call_count + 1,
             total_cost_usd    = total_cost_usd + ?
         WHERE id = ?`,
        [estimatedCost.toFixed(8), session_id]
      );
    }

    // Broadcast via Socket.io (attached to app by server.js)
    const io = req.app.get('io');
    if (io) {
      io.emit('event:new', {
        id:                   result.insertId,
        session_id,
        event_type,
        tool_name,
        tool_input_summary,
        tool_response_summary,
        timestamp:            ts.toISOString(),
        working_dir,
        agent_user,
        project_name,
        api_provider:         api_provider || 'anthropic',
        chat_source:          chat_source  || null,
        estimated_tokens:     estimatedTokens,
        estimated_cost_usd:   estimatedCost,
      });
    }

    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('[events] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
