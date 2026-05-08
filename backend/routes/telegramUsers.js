'use strict';

const express = require('express');
const router  = express.Router();

// GET /api/telegram/users
router.get('/users', async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const [rows] = await pool.query(
      'SELECT id, name, role, active, note, created_at FROM telegram_users ORDER BY created_at'
    );
    res.json(rows.map(r => ({ ...r, id: String(r.id), active: !!r.active })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/telegram/users — add or update user
router.post('/users', async (req, res) => {
  const pool = req.app.locals.pool;
  const { id, name, role, active, note } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id y name son requeridos' });
  const numId = parseInt(id);
  if (!numId) return res.status(400).json({ error: 'id debe ser un número de Telegram' });

  try {
    await pool.query(
      `INSERT INTO telegram_users (id, name, role, active, note)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role),
                               active=VALUES(active), note=VALUES(note), updated_at=NOW(3)`,
      [numId, name, role || 'dev', active !== false ? 1 : 0, note || '']
    );
    res.json({ ok: true, user: { id: String(numId), name, role: role || 'dev', active: active !== false, note: note || '' } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/telegram/users/:id
router.delete('/users/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const [result] = await pool.query('DELETE FROM telegram_users WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/telegram/users/:id/toggle — toggle active
router.patch('/users/:id/toggle', async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const [rows] = await pool.query('SELECT active FROM telegram_users WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const newActive = rows[0].active ? 0 : 1;
    await pool.query('UPDATE telegram_users SET active = ?, updated_at = NOW(3) WHERE id = ?', [newActive, req.params.id]);
    res.json({ ok: true, active: !!newActive });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
