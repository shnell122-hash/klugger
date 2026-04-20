'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/mysql');

// GET /api/relay/alerts?limit=50&resolved=false&severity=critical
router.get('/', async (req, res) => {
  try {
    const limit    = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const resolved = req.query.resolved === 'true' ? 1 : 0;
    const severity = req.query.severity || null;

    let sql = `SELECT * FROM relay_alerts WHERE resolved = ?`;
    const params = [resolved];
    if (severity) { sql += ` AND severity = ?`; params.push(severity); }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/relay/alerts — create alert (called by relay-master)
router.post('/', async (req, res) => {
  try {
    const { alert_type, project_id, severity = 'warning', title, details, auto_fixed = false } = req.body;
    if (!alert_type || !title) return res.status(400).json({ error: 'alert_type and title required' });

    const [result] = await db.query(
      `INSERT INTO relay_alerts (alert_type, project_id, severity, title, details, auto_fixed)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [alert_type, project_id || null, severity, title.slice(0, 255), details || null, auto_fixed ? 1 : 0]
    );

    const alert = { id: result.insertId, alert_type, project_id, severity, title, details, auto_fixed, resolved: 0, created_at: new Date().toISOString() };

    const io = req.app.get('io');
    if (io) io.emit('alert:new', alert);

    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/relay/alerts/:id/resolve
router.patch('/:id/resolve', async (req, res) => {
  try {
    await db.query(
      `UPDATE relay_alerts SET resolved = 1, resolved_at = NOW(3) WHERE id = ?`,
      [req.params.id]
    );
    const io = req.app.get('io');
    if (io) io.emit('alert:resolved', { id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
