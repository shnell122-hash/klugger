'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();

const HASH = process.env.DASHBOARD_PASSWORD_HASH || '';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'password required' });

  if (!HASH) {
    return res.status(503).json({
      error: 'Auth no configurada. Agregar DASHBOARD_PASSWORD_HASH en backend/.env',
    });
  }

  const match = await bcrypt.compare(String(password), HASH);
  if (!match) return res.status(401).json({ error: 'Contraseña incorrecta' });

  req.session.authenticated = true;
  req.session.save(err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/auth/status
router.get('/status', (req, res) => {
  res.json({ authenticated: !!req.session?.authenticated });
});

module.exports = router;
