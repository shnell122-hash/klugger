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

// ── GET /api/apiAdmin/historical ──────────────────────────────────────────────
// Gasto histórico total (todas las cuentas, todos los proveedores)
router.get('/historical', async (req, res) => {
  try {
    // Real Anthropic (de platform_usage — datos Admin API)
    const [[realTotal]] = await db.query(
      `SELECT ROUND(COALESCE(SUM(cost_usd),0),4) AS cost,
              SUM(input_tokens) AS tok_in, SUM(output_tokens) AS tok_out
       FROM platform_usage`
    ).catch(() => [[{ cost: 0, tok_in: 0, tok_out: 0 }]]);

    // Real por cuenta
    const [realByAccount] = await db.query(
      `SELECT COALESCE(account_email,'(default)') AS account,
              ROUND(SUM(cost_usd),4) AS cost,
              MIN(period_start) AS first_record,
              MAX(period_start) AS last_record
       FROM platform_usage
       GROUP BY account_email ORDER BY cost DESC`
    ).catch(() => [[]]);

    // Real por mes (últimos 12 meses)
    const [realByMonth] = await db.query(
      `SELECT DATE_FORMAT(period_start,'%Y-%m') AS month,
              ROUND(SUM(cost_usd),4) AS cost
       FROM platform_usage
       WHERE period_start >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
       GROUP BY month ORDER BY month ASC`
    ).catch(() => [[]]);

    // Estimado total (agent_events — todos los proveedores desde siempre)
    const [[estTotal]] = await db.query(
      `SELECT ROUND(COALESCE(SUM(estimated_cost_usd),0),4) AS cost,
              COUNT(DISTINCT DATE(timestamp)) AS days_with_activity,
              MIN(timestamp) AS first_event,
              MAX(timestamp) AS last_event
       FROM agent_events`
    ).catch(() => [[{ cost: 0, days_with_activity: 0 }]]);

    // Estimado por proveedor (histórico)
    const [estByProvider] = await db.query(
      `SELECT api_provider AS provider,
              ROUND(SUM(estimated_cost_usd),4) AS cost,
              COUNT(*) AS events
       FROM agent_events
       GROUP BY api_provider ORDER BY cost DESC`
    ).catch(() => [[]]);

    // Estimado por proyecto (histórico)
    const [estByProject] = await db.query(
      `SELECT COALESCE(project_name,'(sin proyecto)') AS project,
              ROUND(SUM(estimated_cost_usd),4) AS cost,
              COUNT(*) AS events
       FROM agent_events
       WHERE project_name IS NOT NULL AND project_name != ''
       GROUP BY project_name ORDER BY cost DESC LIMIT 20`
    ).catch(() => [[]]);

    // Histórico de snapshots por mes (provider_daily_cost)
    const [snapshotByMonth] = await db.query(
      `SELECT DATE_FORMAT(date_bucket,'%Y-%m') AS month,
              provider,
              ROUND(SUM(estimated_cost_usd),4) AS cost
       FROM provider_daily_cost
       GROUP BY month, provider ORDER BY month ASC, cost DESC`
    ).catch(() => [[]]);

    res.json({
      real: {
        total:      parseFloat(realTotal.cost),
        by_account: realByAccount,
        by_month:   realByMonth,
      },
      estimated: {
        total:       parseFloat(estTotal.cost),
        first_event: estTotal.first_event,
        last_event:  estTotal.last_event,
        days_active: parseInt(estTotal.days_with_activity || 0),
        by_provider: estByProvider,
        by_project:  estByProject,
      },
      snapshots_by_month: snapshotByMonth,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apiAdmin/projectBudgets ──────────────────────────────────────────
// Estado de presupuesto mensual por proyecto ($100/mes por defecto)
router.get('/projectBudgets', async (req, res) => {
  try {
    // Presupuestos configurados
    const [budgets] = await db.query(
      'SELECT * FROM project_monthly_budget ORDER BY project_name'
    ).catch(() => [[]]);

    // Gasto estimado del mes por proyecto (agent_events)
    const billingStart = new Date();
    billingStart.setDate(1);
    billingStart.setHours(0, 0, 0, 0);
    const billingStartStr = billingStart.toISOString().slice(0, 10);

    const [spendByProject] = await db.query(
      `SELECT COALESCE(project_name,'(sin proyecto)') AS project_name,
              ROUND(SUM(estimated_cost_usd),4) AS cost_month,
              COUNT(*) AS events_month,
              MAX(timestamp) AS last_event
       FROM agent_events
       WHERE timestamp >= ? AND project_name IS NOT NULL AND project_name != ''
       GROUP BY project_name`,
      [billingStartStr]
    ).catch(() => [[]]);

    const spendMap = {};
    spendByProject.forEach(r => { spendMap[r.project_name] = r; });

    // Kill flags por proyecto
    const [killStates] = await db.query(
      "SELECT `key`, `value` FROM system_state WHERE `key` LIKE 'project_killed_%'"
    ).catch(() => [[]]);
    const killMap = {};
    killStates.forEach(r => {
      const proj = r.key.replace('project_killed_', '');
      killMap[proj] = r.value === '1';
    });

    const result = budgets.map(b => {
      const spend = spendMap[b.project_name] || { cost_month: 0, events_month: 0, last_event: null };
      const cost  = parseFloat(spend.cost_month || 0);
      const pct   = b.budget_usd > 0 ? Math.min(100, (cost / b.budget_usd) * 100) : 0;
      return {
        project_name:  b.project_name,
        budget_usd:    parseFloat(b.budget_usd),
        cost_month:    cost,
        events_month:  parseInt(spend.events_month || 0),
        last_event:    spend.last_event,
        pct:           parseFloat(pct.toFixed(1)),
        over_budget:   cost >= parseFloat(b.budget_usd),
        kill_enabled:  b.kill_enabled === 1,
        killed:        !!killMap[b.project_name],
        billing_start: billingStartStr,
      };
    });

    // Proyectos con gasto pero sin presupuesto configurado
    const unconfigured = spendByProject
      .filter(r => !budgets.find(b => b.project_name === r.project_name))
      .map(r => ({
        project_name: r.project_name,
        budget_usd:   100.00,
        cost_month:   parseFloat(r.cost_month),
        events_month: parseInt(r.events_month),
        last_event:   r.last_event,
        pct:          parseFloat(Math.min(100, (r.cost_month / 100) * 100).toFixed(1)),
        over_budget:  parseFloat(r.cost_month) >= 100,
        kill_enabled: false,
        killed:       false,
        billing_start: billingStartStr,
        unconfigured: true,
      }));

    res.json({ projects: [...result, ...unconfigured], billing_start: billingStartStr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/apiAdmin/projectBudgets/:project ──────────────────────────────────
router.put('/projectBudgets/:project', async (req, res) => {
  try {
    const { budget_usd, kill_enabled } = req.body;
    await db.query(
      `INSERT INTO project_monthly_budget (project_name, budget_usd, kill_enabled)
       VALUES (?,?,?) ON DUPLICATE KEY UPDATE
       budget_usd=VALUES(budget_usd), kill_enabled=VALUES(kill_enabled), updated_at=NOW(3)`,
      [req.params.project, budget_usd ?? 100, kill_enabled ?? 1]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/apiAdmin/projectBudgets/:project/resume ─────────────────────────
router.post('/projectBudgets/:project/resume', async (req, res) => {
  try {
    const key = `project_killed_${req.params.project}`;
    await db.query(
      "INSERT INTO system_state(`key`,`value`) VALUES(?,0) ON DUPLICATE KEY UPDATE `value`='0', updated_at=NOW(3)",
      [key]
    );
    const io = req.app.get('io');
    if (io) io.emit('project_resumed', { project: req.params.project });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/apiAdmin/spendingSummary ─────────────────────────────────────────
// Resumen compacto para que el agente (claude-code) monitoree el gasto
router.get('/spendingSummary', async (req, res) => {
  try {
    const [[realToday]]  = await db.query(`SELECT ROUND(COALESCE(SUM(cost_usd),0),4) AS cost FROM platform_usage WHERE period_start >= CURDATE()`).catch(() => [[{ cost: 0 }]]);
    const [[realMonth]]  = await db.query(`SELECT ROUND(COALESCE(SUM(cost_usd),0),4) AS cost FROM platform_usage WHERE period_start >= DATE_FORMAT(NOW(),'%Y-%m-01')`).catch(() => [[{ cost: 0 }]]);
    const [[realTotal]]  = await db.query(`SELECT ROUND(COALESCE(SUM(cost_usd),0),4) AS cost FROM platform_usage`).catch(() => [[{ cost: 0 }]]);
    const [[estToday]]   = await db.query(`SELECT ROUND(COALESCE(SUM(estimated_cost_usd),0),4) AS cost FROM agent_events WHERE DATE(timestamp)=CURDATE()`).catch(() => [[{ cost: 0 }]]);
    const [[estMonth]]   = await db.query(`SELECT ROUND(COALESCE(SUM(estimated_cost_usd),0),4) AS cost FROM agent_events WHERE timestamp >= DATE_FORMAT(NOW(),'%Y-%m-01')`).catch(() => [[{ cost: 0 }]]);
    const [[estTotal]]   = await db.query(`SELECT ROUND(COALESCE(SUM(estimated_cost_usd),0),4) AS cost FROM agent_events`).catch(() => [[{ cost: 0 }]]);
    const [[killState]]  = await db.query(`SELECT \`value\` FROM system_state WHERE \`key\`='relay_killed'`).catch(() => [[null]]);
    const [[budget]]     = await db.query(`SELECT threshold_usd FROM provider_kill_threshold WHERE provider='total' LIMIT 1`).catch(() => [[{ threshold_usd: 7 }]]);

    const [projBudgets] = await db.query(`
      SELECT b.project_name, b.budget_usd,
             ROUND(COALESCE(SUM(e.estimated_cost_usd),0),4) AS cost_month
      FROM project_monthly_budget b
      LEFT JOIN agent_events e ON e.project_name = b.project_name
        AND e.timestamp >= DATE_FORMAT(NOW(),'%Y-%m-01')
      GROUP BY b.project_name, b.budget_usd
      ORDER BY cost_month DESC`
    ).catch(() => [[]]);

    res.json({
      today:  { real_usd: parseFloat(realToday.cost), est_usd: parseFloat(estToday.cost) },
      month:  { real_usd: parseFloat(realMonth.cost), est_usd: parseFloat(estMonth.cost) },
      total:  { real_usd: parseFloat(realTotal.cost), est_usd: parseFloat(estTotal.cost) },
      daily_kill_threshold_usd: parseFloat(budget?.threshold_usd ?? 7),
      system_killed: killState?.value === '1',
      projects: projBudgets.map(p => ({
        name:      p.project_name,
        budget:    parseFloat(p.budget_usd),
        spent:     parseFloat(p.cost_month),
        remaining: parseFloat((p.budget_usd - p.cost_month).toFixed(4)),
        pct:       parseFloat(Math.min(100, p.cost_month / p.budget_usd * 100).toFixed(1)),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, dailySnapshot };
