'use strict';

const express = require('express');
const https   = require('https');
const router  = express.Router();
const db      = require('../db/mysql');

const ANTHROPIC_VERSION    = '2023-06-01';
const ANTHROPIC_BETA_USAGE = 'usage-2024-07-01';

// ── Llamada GET a Anthropic Admin API ────────────────────────────────────────
function anthropicGet(path, adminKey) {
  return new Promise((resolve, reject) => {
    if (!adminKey) return reject(new Error('Admin key no configurado'));
    const req = https.request({
      hostname: 'api.anthropic.com',
      path,
      method: 'GET',
      headers: {
        'x-api-key':         adminKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta':    ANTHROPIC_BETA_USAGE,
        'content-type':      'application/json',
      },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.error) return reject(new Error(`Anthropic API: ${json.error.type} — ${json.error.message}`));
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          reject(new Error(`JSON parse: ${e.message} | body: ${body.slice(0, 200)}`));
        }
      });
    });
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout 30s')); });
    req.on('error', reject);
    req.end();
  });
}

// ── Fetch usage de UNA cuenta Anthropic ──────────────────────────────────────
async function fetchAccountUsage(accountEmail, adminKey, lookbackDays = 1) {
  const now   = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - lookbackDays);

  const startStr = start.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const endStr   = now.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const path = `/v1/usage?start_time=${encodeURIComponent(startStr)}&end_time=${encodeURIComponent(endStr)}&granularity=hour`;
  const raw  = await anthropicGet(path, adminKey);

  const rows = raw.data?.data || raw.data?.usage || raw.data?.results || [];
  if (!Array.isArray(rows) || rows.length === 0) return { inserted: 0, account: accountEmail };

  await db.query(
    `DELETE FROM platform_usage WHERE period_start >= ? AND period_end <= ? AND granularity = 'hour' AND account_email = ?`,
    [startStr, endStr, accountEmail]
  );

  const values = rows.map(r => {
    const periodStart = r.timestamp || r.start_time || r.period_start || startStr;
    const periodEnd   = r.end_time   || r.period_end || endStr;
    return [
      periodStart, periodEnd,
      r.model               || null,
      r.workspace_id        || null,
      r.workspace_name      || null,
      r.input_tokens        || 0,
      r.output_tokens       || 0,
      r.cache_read_tokens   || r.cache_read_input_tokens       || 0,
      r.cache_creation_tokens || r.cache_creation_input_tokens || 0,
      r.cost_usd            || r.total_cost_usd || 0,
      accountEmail,
    ];
  });

  await db.query(
    `INSERT INTO platform_usage
       (period_start, period_end, model, workspace_id, workspace_name,
        input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
        cost_usd, account_email)
     VALUES ?`,
    [values]
  );

  return { inserted: values.length, account: accountEmail };
}

// ── Fetch todas las cuentas activas ──────────────────────────────────────────
async function fetchAndCacheUsage() {
  let accounts = [];
  try {
    [accounts] = await db.query('SELECT * FROM anthropic_accounts WHERE is_active = 1');
  } catch (_) {
    // Tabla no existe aún (pre-v12) — usar ANTHROPIC_ADMIN_KEY legacy
  }

  // Fallback: si no hay tabla o está vacía, usar la key env legacy
  if (!accounts || accounts.length === 0) {
    const legacyKey = process.env.ANTHROPIC_ADMIN_KEY;
    if (!legacyKey) throw new Error('ANTHROPIC_ADMIN_KEY no configurado en .env');
    return fetchAccountUsage('(default)', legacyKey);
  }

  const results = [];
  for (const acc of accounts) {
    const key = process.env[acc.env_key];
    if (!key) {
      results.push({ account: acc.email, skipped: true, reason: `${acc.env_key} no definido en .env` });
      continue;
    }
    try {
      const r = await fetchAccountUsage(acc.email, key);
      results.push(r);
    } catch (e) {
      results.push({ account: acc.email, error: e.message });
    }
  }
  return { accounts: results };
}

// ── Verificar presupuestos y emitir alertas ───────────────────────────────────
async function checkBudgets(io) {
  const [budgets] = await db.query('SELECT * FROM platform_budget');

  for (const b of budgets) {
    let since;
    if (b.period === 'hour')  since = 'DATE_SUB(NOW(), INTERVAL 1 HOUR)';
    if (b.period === 'day')   since = 'CURDATE()';
    if (b.period === 'month') since = 'DATE_FORMAT(NOW(), "%Y-%m-01")';
    if (!since) continue;

    const [[{ total }]] = await db.query(
      `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM platform_usage WHERE period_start >= ${since}`
    );

    if (parseFloat(total) >= parseFloat(b.threshold_usd)) {
      const [[{ cnt }]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM platform_budget_alerts
         WHERE period = ? AND fired_at >= ${since} AND acknowledged = 0`,
        [b.period]
      );
      if (parseInt(cnt) > 0) continue;

      const [byModel] = await db.query(
        `SELECT model, ROUND(SUM(cost_usd), 4) AS cost FROM platform_usage
         WHERE period_start >= ${since} GROUP BY model ORDER BY cost DESC`
      );
      const breakdown = byModel.map(r => `${r.model || 'unknown'}: $${r.cost}`).join(', ');
      await db.query(
        `INSERT INTO platform_budget_alerts (period, threshold_usd, actual_usd, model_breakdown)
         VALUES (?, ?, ?, ?)`,
        [b.period, b.threshold_usd, total, breakdown]
      );
      if (io) io.emit('platform_alert', { period: b.period, threshold: b.threshold_usd, actual: total, breakdown });
    }
  }
}

// ── GET /api/platform/summary ─────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const [[today]] = await db.query(
      `SELECT COALESCE(SUM(cost_usd),0) AS cost, COALESCE(SUM(input_tokens+output_tokens),0) AS tokens
       FROM platform_usage WHERE period_start >= CURDATE()`
    );
    const [[hour]] = await db.query(
      `SELECT COALESCE(SUM(cost_usd),0) AS cost
       FROM platform_usage WHERE period_start >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`
    );
    const [[month]] = await db.query(
      `SELECT COALESCE(SUM(cost_usd),0) AS cost
       FROM platform_usage WHERE period_start >= DATE_FORMAT(NOW(), '%Y-%m-01')`
    );
    const [[allTime]] = await db.query(
      `SELECT COALESCE(SUM(cost_usd),0) AS cost FROM platform_usage`
    );
    const [byModel] = await db.query(
      `SELECT model, ROUND(SUM(cost_usd),6) AS cost,
              SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens
       FROM platform_usage WHERE period_start >= CURDATE()
       GROUP BY model ORDER BY cost DESC`
    );
    const [budgets]   = await db.query('SELECT * FROM platform_budget');
    const [[lastFetch]] = await db.query('SELECT MAX(fetched_at) AS last_at FROM platform_usage');
    const [alerts]    = await db.query(
      'SELECT * FROM platform_budget_alerts WHERE acknowledged = 0 ORDER BY fired_at DESC LIMIT 10'
    );

    res.json({
      today:    { cost: parseFloat(today.cost), tokens: parseInt(today.tokens) },
      hour:     { cost: parseFloat(hour.cost) },
      month:    { cost: parseFloat(month.cost) },
      all_time: { cost: parseFloat(allTime.cost) },
      by_model: byModel,
      budgets,
      last_fetch: lastFetch.last_at,
      alerts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/platform/accounts ────────────────────────────────────────────────
// Gasto por cuenta Anthropic (mes actual + histórico total)
router.get('/accounts', async (req, res) => {
  try {
    let accounts = [];
    try { [accounts] = await db.query('SELECT * FROM anthropic_accounts WHERE is_active = 1'); } catch (_) {}

    // Gasto del mes por cuenta (desde platform_usage)
    const [monthByAccount] = await db.query(
      `SELECT COALESCE(account_email,'(default)') AS account_email,
              ROUND(SUM(cost_usd),4) AS cost_month,
              SUM(input_tokens+output_tokens) AS tokens_month
       FROM platform_usage
       WHERE period_start >= DATE_FORMAT(NOW(),'%Y-%m-01')
       GROUP BY account_email`
    ).catch(() => [[]]);

    // Gasto histórico total por cuenta
    const [totalByAccount] = await db.query(
      `SELECT COALESCE(account_email,'(default)') AS account_email,
              ROUND(SUM(cost_usd),4) AS cost_total
       FROM platform_usage
       GROUP BY account_email`
    ).catch(() => [[]]);

    // Calcular billing period start para cada cuenta
    const now = new Date();
    const accountsWithCost = accounts.map(acc => {
      const billingDay = acc.billing_day || 1;
      let billingStart = new Date(now.getFullYear(), now.getMonth(), billingDay);
      if (now.getDate() < billingDay) billingStart.setMonth(billingStart.getMonth() - 1);

      const monthData = monthByAccount.find(r => r.account_email === acc.email) || { cost_month: 0, tokens_month: 0 };
      const totalData = totalByAccount.find(r => r.account_email === acc.email) || { cost_total: 0 };
      const hasKey    = !!process.env[acc.env_key];

      return {
        email:           acc.email,
        env_key:         acc.env_key,
        has_key:         hasKey,
        billing_day:     billingDay,
        billing_start:   billingStart.toISOString().slice(0, 10),
        notes:           acc.notes,
        cost_month:      parseFloat(monthData.cost_month),
        tokens_month:    parseInt(monthData.tokens_month || 0),
        cost_total:      parseFloat(totalData.cost_total),
      };
    });

    // Si no hay tabla, agregar cuenta legacy
    if (accounts.length === 0) {
      const legacyMonth = monthByAccount.find(r => r.account_email === '(default)') || { cost_month: 0 };
      const legacyTotal = totalByAccount.find(r => r.account_email === '(default)') || { cost_total: 0 };
      accountsWithCost.push({
        email: '(default)', env_key: 'ANTHROPIC_ADMIN_KEY', has_key: !!process.env.ANTHROPIC_ADMIN_KEY,
        billing_day: 1, billing_start: new Date().toISOString().slice(0, 8) + '01',
        cost_month: parseFloat(legacyMonth.cost_month), cost_total: parseFloat(legacyTotal.cost_total),
      });
    }

    // Total histórico de todas las cuentas
    const [[grandTotal]] = await db.query(`SELECT ROUND(COALESCE(SUM(cost_usd),0),4) AS total FROM platform_usage`).catch(() => [[{ total: 0 }]]);

    res.json({ accounts: accountsWithCost, grand_total_real: parseFloat(grandTotal.total) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/platform/hourly ──────────────────────────────────────────────────
router.get('/hourly', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT DATE_FORMAT(period_start, '%Y-%m-%d %H:00') AS hour_bucket,
              ROUND(SUM(cost_usd),6) AS cost,
              SUM(input_tokens+output_tokens) AS tokens
       FROM platform_usage
       WHERE period_start >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND granularity = 'hour'
       GROUP BY hour_bucket ORDER BY hour_bucket ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/platform/daily ───────────────────────────────────────────────────
router.get('/daily', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT DATE(period_start) AS day,
              ROUND(SUM(cost_usd),6) AS cost,
              SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens
       FROM platform_usage
       WHERE period_start >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY day ORDER BY day ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/platform/refresh ────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const io     = req.app.get('io');
    const result = await fetchAndCacheUsage();
    await checkBudgets(io);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET/PUT /api/platform/budget ──────────────────────────────────────────────
router.get('/budget', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM platform_budget').catch(() => [[]]);
  res.json(rows);
});

router.put('/budget', async (req, res) => {
  try {
    const { period, threshold_usd } = req.body;
    if (!['hour', 'day', 'month'].includes(period)) return res.status(400).json({ error: 'period inválido' });
    await db.query(
      `INSERT INTO platform_budget (period, threshold_usd) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE threshold_usd = VALUES(threshold_usd), updated_at = NOW(3)`,
      [period, threshold_usd]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/platform/alerts/:id/ack ────────────────────────────────────────
router.post('/alerts/:id/ack', async (req, res) => {
  await db.query('UPDATE platform_budget_alerts SET acknowledged = 1 WHERE id = ?', [req.params.id]).catch(() => {});
  res.json({ ok: true });
});

// ── GET /api/platform/kill-check ─────────────────────────────────────────────
router.get('/kill-check', async (req, res) => {
  try {
    const [[killRow]]   = await db.query("SELECT `value`,updated_at FROM system_state WHERE `key`='relay_killed'").catch(() => [[null]]);
    const [[reasonRow]] = await db.query("SELECT `value` FROM system_state WHERE `key`='relay_kill_reason'").catch(() => [[null]]);

    const [[anthReal]] = await db.query(
      "SELECT ROUND(COALESCE(SUM(cost_usd),0),4) AS cost FROM platform_usage WHERE period_start >= CURDATE()"
    ).catch(() => [[{ cost: 0 }]]);

    const [[estAll]] = await db.query(
      "SELECT ROUND(COALESCE(SUM(estimated_cost_usd),0),4) AS cost FROM agent_events WHERE DATE(timestamp)=CURDATE()"
    ).catch(() => [[{ cost: 0 }]]);

    const dailyCost = Math.max(parseFloat(anthReal?.cost || 0), parseFloat(estAll?.cost || 0));

    const [[budget]] = await db.query(
      "SELECT threshold_usd FROM provider_kill_threshold WHERE provider='total' LIMIT 1"
    ).catch(() => [[{ threshold_usd: 7 }]]);
    const threshold = parseFloat(budget?.threshold_usd ?? 7);

    if (dailyCost >= threshold && killRow?.value !== '1') {
      const reason = `Gasto diario $${dailyCost.toFixed(2)} ≥ umbral $${threshold.toFixed(2)} (auto)`;
      await db.query("INSERT INTO system_state(`key`,`value`) VALUES('relay_killed','1') ON DUPLICATE KEY UPDATE `value`='1', updated_at=NOW(3)");
      await db.query("INSERT INTO system_state(`key`,`value`) VALUES('relay_kill_reason',?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), updated_at=NOW(3)", [reason]);
      await db.query("INSERT INTO provider_kill_alerts (provider, threshold_usd, actual_usd) VALUES ('total',?,?)", [threshold, dailyCost]).catch(() => {});
      const io = req.app?.get('io');
      if (io) io.emit('relay_killed', { reason, daily_cost_usd: dailyCost, threshold_usd: threshold });
    }

    const killed = killRow?.value === '1' || dailyCost >= threshold;
    res.json({
      killed,
      daily_cost_usd: dailyCost,
      threshold_usd:  threshold,
      reason:         reasonRow?.value || (killed ? `$${dailyCost.toFixed(2)} ≥ $${threshold.toFixed(2)}` : null),
      killed_at:      killRow?.updated_at || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/platform/resume ─────────────────────────────────────────────────
router.post('/resume', async (req, res) => {
  try {
    await db.query("INSERT INTO system_state(`key`,`value`) VALUES('relay_killed','0') ON DUPLICATE KEY UPDATE `value`='0', updated_at=NOW(3)");
    await db.query("INSERT INTO system_state(`key`,`value`) VALUES('relay_kill_reason','') ON DUPLICATE KEY UPDATE `value`='', updated_at=NOW(3)");
    const io = req.app.get('io');
    if (io) io.emit('relay_resumed', { ts: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, fetchAndCacheUsage, checkBudgets };
