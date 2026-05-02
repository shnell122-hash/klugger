'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/mysql');

// ── Colores canónicos por proveedor (sincronizar con frontend) ───────────────
const PROVIDER_COLORS = {
  anthropic:  '#3fb950',
  openai:     '#58a6ff',
  deepseek:   '#bc8cff',
  fal:        '#ffa657',
  elevenlabs: '#ff79c6',
};

// ── GET /api/apiAdmin/summary ─────────────────────────────────────────────────
// Totales hoy / semana / mes por proveedor (agent_events estimado)
router.get('/summary', async (req, res) => {
  try {
    const [todayByProvider] = await db.query(`
      SELECT api_provider AS provider,
             ROUND(SUM(estimated_cost_usd),6) AS cost,
             SUM(estimated_tokens) AS tokens,
             COUNT(*) AS events
      FROM agent_events
      WHERE DATE(timestamp) = CURDATE()
      GROUP BY api_provider ORDER BY cost DESC
    `);

    const [weekByProvider] = await db.query(`
      SELECT api_provider AS provider,
             ROUND(SUM(estimated_cost_usd),6) AS cost,
             COUNT(*) AS events
      FROM agent_events
      WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY api_provider ORDER BY cost DESC
    `);

    const [monthByProvider] = await db.query(`
      SELECT api_provider AS provider,
             ROUND(SUM(estimated_cost_usd),6) AS cost,
             COUNT(*) AS events
      FROM agent_events
      WHERE timestamp >= DATE_FORMAT(NOW(),'%Y-%m-01')
      GROUP BY api_provider ORDER BY cost DESC
    `);

    const sum = arr => arr.reduce((a, r) => a + parseFloat(r.cost || 0), 0);

    // También traer real de platform_usage (Anthropic Admin API) para comparar
    const [[anthReal]] = await db.query(`
      SELECT ROUND(COALESCE(SUM(cost_usd),0),6) AS cost
      FROM platform_usage WHERE period_start >= CURDATE()
    `).catch(() => [[{ cost: 0 }]]);

    // Thresholds por proveedor
    const [thresholds] = await db.query('SELECT * FROM provider_kill_threshold').catch(() => [[]]);

    // Kill state
    const [[killState]] = await db.query(
      "SELECT `value` FROM system_state WHERE `key`='relay_killed'"
    ).catch(() => [[null]]);

    res.json({
      today:          { cost: sum(todayByProvider), by_provider: todayByProvider },
      week:           { cost: sum(weekByProvider),  by_provider: weekByProvider  },
      month:          { cost: sum(monthByProvider), by_provider: monthByProvider },
      anthropic_real: { cost: parseFloat(anthReal?.cost || 0) },
      thresholds,
      killed:         killState?.value === '1',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apiAdmin/timeseries?days=30 ─────────────────────────────────────
// Serie temporal diaria por proveedor (histórico de provider_daily_cost + hoy en vivo)
router.get('/timeseries', async (req, res) => {
  const days = Math.min(parseInt(req.query.days || 30), 90);
  try {
    // Histórico desde snapshot
    const [hist] = await db.query(`
      SELECT date_bucket, provider,
             ROUND(SUM(estimated_cost_usd),4) AS cost
      FROM provider_daily_cost
      WHERE date_bucket >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY date_bucket, provider ORDER BY date_bucket ASC
    `, [days]);

    // Hoy en vivo (sin snapshot aún)
    const [today] = await db.query(`
      SELECT DATE(NOW()) AS date_bucket, api_provider AS provider,
             ROUND(SUM(estimated_cost_usd),4) AS cost
      FROM agent_events WHERE DATE(timestamp) = CURDATE()
      GROUP BY api_provider
    `);

    // Unir: preferir snapshot para días pasados, vivo para hoy
    const todayStr = new Date().toISOString().slice(0, 10);
    const rows = hist.filter(r => r.date_bucket !== todayStr).concat(today);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apiAdmin/byProject?days=7 ───────────────────────────────────────
// Costo por proyecto × proveedor (para stacked bar)
router.get('/byProject', async (req, res) => {
  const days = Math.min(parseInt(req.query.days || 7), 90);
  try {
    const [rows] = await db.query(`
      SELECT project_name,
             api_provider AS provider,
             ROUND(SUM(estimated_cost_usd),4) AS cost,
             COUNT(*) AS events
      FROM agent_events
      WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND project_name IS NOT NULL AND project_name != ''
      GROUP BY project_name, api_provider
      ORDER BY cost DESC
      LIMIT 100
    `, [days]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apiAdmin/byKey ───────────────────────────────────────────────────
// Costo agrupado por api_key_masked (compara rendimiento de keys)
router.get('/byKey', async (req, res) => {
  try {
    // Cruzar agent_events (por proveedor) con api_providers (por key)
    const [rows] = await db.query(`
      SELECT p.provider,
             COALESCE(p.api_key_masked,'(sin key)')  AS api_key_masked,
             COALESCE(p.project_name,'(global)')     AS project_name,
             p.monthly_limit_usd,
             ROUND(COALESCE(SUM(e.estimated_cost_usd),0),4) AS cost_month,
             COUNT(e.id) AS events_month
      FROM api_providers p
      LEFT JOIN agent_events e
             ON e.api_provider = p.provider
            AND DATE(e.timestamp) >= DATE_FORMAT(NOW(),'%Y-%m-01')
      WHERE p.is_active = 1
      GROUP BY p.id, p.provider, p.api_key_masked, p.project_name, p.monthly_limit_usd
      ORDER BY cost_month DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/apiAdmin/snapshot ───────────────────────────────────────────────
// Materializar costos de HOY en provider_daily_cost
async function dailySnapshot() {
  await db.query(`
    INSERT INTO provider_daily_cost
      (date_bucket, provider, project_name, estimated_cost_usd,
       input_tokens, output_tokens, event_count)
    SELECT CURDATE(),
           api_provider,
           COALESCE(project_name,''),
           ROUND(SUM(estimated_cost_usd),6),
           ROUND(SUM(estimated_tokens * 0.6)),
           ROUND(SUM(estimated_tokens * 0.4)),
           COUNT(*)
    FROM agent_events
    WHERE DATE(timestamp) = CURDATE()
    GROUP BY api_provider, project_name
    ON DUPLICATE KEY UPDATE
      estimated_cost_usd = VALUES(estimated_cost_usd),
      input_tokens  = VALUES(input_tokens),
      output_tokens = VALUES(output_tokens),
      event_count   = VALUES(event_count),
      snapped_at    = NOW(3)
  `);
  console.log('[apiAdmin] snapshot diario materializado');
}

router.post('/snapshot', async (req, res) => {
  try {
    await dailySnapshot();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apiAdmin/killStatus ──────────────────────────────────────────────
// Estado actual del kill-switch + costos por proveedor vs umbrales
router.get('/killStatus', async (req, res) => {
  try {
    const [thresholds] = await db.query('SELECT * FROM provider_kill_threshold WHERE kill_enabled=1');
    const [[killRow]]  = await db.query("SELECT `value`,updated_at FROM system_state WHERE `key`='relay_killed'").catch(() => [[null]]);
    const [[killMsgRow]] = await db.query("SELECT `value` FROM system_state WHERE `key`='relay_kill_reason'").catch(() => [[null]]);

    // Costos de hoy por proveedor (estimado)
    const [todayByProv] = await db.query(`
      SELECT api_provider AS provider, ROUND(SUM(estimated_cost_usd),4) AS cost
      FROM agent_events WHERE DATE(timestamp) = CURDATE()
      GROUP BY api_provider
    `);

    // Costo real Anthropic
    const [[anthReal]] = await db.query(
      "SELECT ROUND(COALESCE(SUM(cost_usd),0),4) AS cost FROM platform_usage WHERE period_start >= CURDATE()"
    ).catch(() => [[{ cost: 0 }]]);

    const costMap = {};
    todayByProv.forEach(r => { costMap[r.provider] = parseFloat(r.cost); });
    costMap['anthropic'] = Math.max(costMap['anthropic'] || 0, parseFloat(anthReal?.cost || 0));
    costMap['total'] = Object.values(costMap).reduce((a, v) => a + v, 0);

    const providerStatus = thresholds.map(t => ({
      provider:      t.provider,
      threshold_usd: parseFloat(t.threshold_usd),
      current_usd:   parseFloat((costMap[t.provider] || 0).toFixed(4)),
      pct:           t.threshold_usd > 0
        ? Math.min(100, ((costMap[t.provider] || 0) / t.threshold_usd * 100)).toFixed(0)
        : 0,
      over:          (costMap[t.provider] || 0) >= parseFloat(t.threshold_usd),
    }));

    res.json({
      killed:          killRow?.value === '1',
      kill_reason:     killMsgRow?.value || null,
      killed_at:       killRow?.updated_at || null,
      provider_status: providerStatus,
      total_today:     parseFloat((costMap['total'] || 0).toFixed(4)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/apiAdmin/threshold ───────────────────────────────────────────────
// Actualizar umbral de kill por proveedor
router.put('/threshold', async (req, res) => {
  try {
    const { provider, threshold_usd, kill_enabled } = req.body;
    await db.query(
      `INSERT INTO provider_kill_threshold (provider, threshold_usd, kill_enabled)
       VALUES (?,?,?) ON DUPLICATE KEY UPDATE
       threshold_usd=VALUES(threshold_usd), kill_enabled=VALUES(kill_enabled), updated_at=NOW(3)`,
      [provider, threshold_usd, kill_enabled ?? 1]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/apiAdmin/resume ─────────────────────────────────────────────────
// Reanudar el relay desde dashboard (borra el flag en DB)
router.post('/resume', async (req, res) => {
  try {
    await db.query(
      "INSERT INTO system_state(`key`,`value`) VALUES('relay_killed','0') ON DUPLICATE KEY UPDATE `value`='0', updated_at=NOW(3)"
    );
    await db.query(
      "INSERT INTO system_state(`key`,`value`) VALUES('relay_kill_reason','') ON DUPLICATE KEY UPDATE `value`='', updated_at=NOW(3)"
    );
    // Notificar via socket
    const io = req.app.get('io');
    if (io) io.emit('relay_resumed', { ts: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apiAdmin/alerts ──────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM provider_kill_alerts WHERE acknowledged=0 ORDER BY fired_at DESC LIMIT 20'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/alerts/:id/ack', async (req, res) => {
  await db.query('UPDATE provider_kill_alerts SET acknowledged=1 WHERE id=?', [req.params.id]).catch(() => {});
  res.json({ ok: true });
});

module.exports = { router, dailySnapshot };
