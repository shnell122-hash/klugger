'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const router   = express.Router();
const USERS_FILE = path.join(__dirname, '../../relay/telegram-users.json');

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch (_) { return []; }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2) + '\n', 'utf8');
}

// GET /api/telegram/users
router.get('/users', (req, res) => {
  res.json(readUsers());
});

// POST /api/telegram/users — add or update user
// Body: { id, name, role, active, note }
router.post('/users', (req, res) => {
  const { id, name, role, active, note } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id y name son requeridos' });

  const users = readUsers();
  const idx   = users.findIndex(u => String(u.id) === String(id));
  const entry = { id: String(id), name, role: role || 'dev', active: active !== false, note: note || '' };

  if (idx >= 0) users[idx] = entry;
  else users.push(entry);

  writeUsers(users);
  res.json({ ok: true, user: entry });
});

// DELETE /api/telegram/users/:id
router.delete('/users/:id', (req, res) => {
  const users    = readUsers();
  const filtered = users.filter(u => String(u.id) !== String(req.params.id));
  if (filtered.length === users.length) return res.status(404).json({ error: 'Usuario no encontrado' });
  writeUsers(filtered);
  res.json({ ok: true });
});

// PATCH /api/telegram/users/:id/toggle — toggle active
router.patch('/users/:id/toggle', (req, res) => {
  const users = readUsers();
  const user  = users.find(u => String(u.id) === String(req.params.id));
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  user.active = !user.active;
  writeUsers(users);
  res.json({ ok: true, active: user.active });
});

module.exports = router;
