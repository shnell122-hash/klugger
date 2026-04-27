'use strict';

const express = require('express');
const https   = require('https');
const router  = express.Router();
const db      = require('../db/mysql');

const ADMIN_KEY = process.env.ANTHROPIC_ADMIN_KEY;
const ANTHROPIC_VERSION = '2023-06-01';

// ── Llamada a Anthropic Admin API ─────────────────────────────────────────────
function anthropicGet(path) {
  return new Promise((resolve, reject) => {
    if (!ADMIN_KEY) {
      return reject(new Error('ANTHROPIC_ADMIN_KEY no configurado en .env'));
    }
    const req = https.request({
      hostname: 'api.anthropic.com',
      path,
      method: 'GET',
      headers: {
        'x-api-key':         ADMIN_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
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
          reject(new Error(`JSON parse error: ${e.message} | body: ${body.slice(0, 200)}`));
        }
      });
    });
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout 30s — api.anthropic.com')); });
    req.on('error', reject);
    req.end();
  });
}

// ── Fetch + cache usage desde Anthropic ───────────────────────────────────────
async function fetchAndCacheUsage() {
  const now   = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 1);  // últimas 24h

  const startStr = start.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const endStr   = now.toISOString().replace(/\.\d{3}Z$/, 'Z');

  // Intentar endpoint de usage (granularity=hour para las últimas 24h)
  const path = `/v1/usage?start_time=${encodeURIComponent(startStr)}&end_time=${encodeURIComponent(endStr)}&granularity=hour`;

  let raw;
  try {
    raw = await anthropicGet(path);
  } catch (e) {
    throw new Error(`Fetch usage: ${e.message}`);
  }

  // La API puede devolver { data: [...] } o { usage: [...] } o variantes
  const rows = raw.data?.data || raw.data?.usage || raw.data?.results || [];
  if (!Array.isArray(rows)) {
    throw new Error(`Respuesta inesperada de Anthropic API: ${JSON.stringify(raw.data).slice(0, 300)}`);
  }

  if (rows.length === 0) return { inserted: 0, raw: raw.data };

  // Insertar en DB (borrar rango antes para evitar duplicados)
  await db.query(
    `DELETE FROM platform_usage WHERE period_start >= ? AND period_end <= ? AND granularity = 'hour'`,
    [startStr, endStr]
  );

  const values = rows.map(r => {
    const periodStart = r.timestamp || r.start_time || r.period_start || startStr;
    const periodEnd   = r.end_time   || r.period_end || endStr;
    return [
      periodStart,
      periodEnd,
      r.model               || null,
      r.workspace_id        || null,
      r.workspace_name      || null,
      r.input_tokens        || 0,
      r.output_tokens       || 0,
      r.cache_read_tokens   || r.cache_read_input_tokens          || 0,
      r.cache_creation_tokens || r.cache_creation_input_tokens    || 0,
      r.cost_usd            || r.total_cost_usd || 0,
    ];
  });

  await db.query(
    `INSERT INTO platform_usage
       (period_start, period_end, model, workspace_id, workspace_name,
        input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd)
     VALUES ?`,
    [values]
  );

  return { inserted: values.length, raw: raw.data };
}

// ── Verificar presupuestos y emitir alertas ──────────────────────────────────
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
      // Avoid repeat alerts within same period
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

      if (io) {
        io.emit('platform_alert', {
          period: b.period,
          threshold: b.threshold_usd,
          actual: total,
          breakdown,
        });
      }
    }
  }
}

// ── GET /api/platform/summary ─────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    // Hoy (desde medianoche)
    const [[today]] = await db.query(
      `SELECT COALESCE(SUM(cost_usd),0) AS cost,
              COALESCE(SUM(input_tokens+output_tokens),0) AS tokens
       FROM platform_usage WHERE period_start >= CURDATE()`
    );
    // Esta hora
    const [[hour]] = await db.query(
      `SELECT COALESCE(SUM(cost_usd),0) AS cost
       FROM platform_usage WHERE period_start >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`
    );
    // Este mes
    const [[month]] = await db.query(
      `SELECT COALESCE(SUM(cost_usd),0) AS cost
       FROM platform_usage WHERE period_start >= DATE_FORMAT(NOW(), '%Y-%m-01')`
    );
    // Por modelo (hoy)
    const [byModel] = await db.query(
      `SELECT model, ROUND(SUM(cost_usd),6) AS cost,
              SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens
       FROM platform_usage WHERE period_start >= CURDATE()
       GROUP BY model ORDER BY cost DESC`
    );
    // Presupuestos
    const [budgets] = await db.query('SELECT * FROM platform_budget');
    // Última actualización
    const [[lastFetch]] = await db.query(
      'SELECT MAX(fetched_at) AS last_at FROM platform_usage'
    );
    // Alertas no reconocidas
    const [alerts] = await db.query(
      'SELECT * FROM platform_budget_alerts WHERE acknowledged = 0 ORDER BY fired_at DESC LIMIT 10'
    );

    res.json({
      today: { cost: parseFloat(today.cost), tokens: parseInt(today.tokens) },
      hour:  { cost: parseFloat(hour.cost) },
      month: { cost: parseFloat(month.cost) },
      by_model: byModel,
      budgets,
      last_fetch: lastFetch.last_at,
      alerts,
    });
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
    const io = req.app.get('io');
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

module.exports = { router, fetchAndCacheUsage, checkBudgets };
