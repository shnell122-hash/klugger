'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { execSync } = require('child_process');
const router  = express.Router();
const db      = require('../db/mysql');
const requireAuth = require('../middleware/requireAuth');

const VAULT_PATH = process.env.KPTL_SECRETS_PATH || '/opt/kptl-secrets/api-keys.env';

// Parse .env-style file into ordered key-value array (preserves comments and order)
function parseEnvFile(content) {
  const entries = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const name  = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    entries.push({ name, value });
  }
  return entries;
}

// Rebuild .env file content with updated value
function patchEnvFile(content, name, newValue) {
  const lines = content.split('\n');
  let found = false;
  const updated = lines.map(line => {
    const eq = line.indexOf('=');
    if (eq !== -1 && line.slice(0, eq).trim() === name) {
      found = true;
      return `${name}=${newValue}`;
    }
    return line;
  });
  if (!found) updated.push(`${name}=${newValue}`);
  return updated.join('\n');
}

// Mask a key value — show only last 6 chars
function mask(value) {
  if (!value) return '';
  if (value.length <= 6) return '••••••';
  return '••••••' + value.slice(-6);
}

// GET /api/keys — list all keys with masked values (requires auth)
router.get('/', requireAuth, (req, res) => {
  if (!fs.existsSync(VAULT_PATH)) {
    return res.json({ ok: true, keys: [], vault: VAULT_PATH, exists: false });
  }
  try {
    const content = fs.readFileSync(VAULT_PATH, 'utf8');
    const entries = parseEnvFile(content).map(({ name, value }) => ({
      name,
      masked: mask(value),
      set:    !!value,
    }));
    res.json({ ok: true, keys: entries, vault: VAULT_PATH, exists: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/keys/:name — update a single key (requires auth)
router.post('/:name', requireAuth, async (req, res) => {
  const { name } = req.params;
  const { value } = req.body;

  // Whitelist: only alphanumeric + underscore
  if (!/^[A-Z][A-Z0-9_]{1,60}$/.test(name)) {
    return res.status(400).json({ error: 'nombre de key inválido' });
  }
  if (typeof value !== 'string') {
    return res.status(400).json({ error: 'value debe ser string' });
  }

  try {
    let content = fs.existsSync(VAULT_PATH) ? fs.readFileSync(VAULT_PATH, 'utf8') : '';
    content = patchEnvFile(content, name, value);
    fs.writeFileSync(VAULT_PATH, content, { mode: 0o600 });

    // Log the change (audit trail — never log the value)
    try {
      await db.query(
        `INSERT INTO key_changes (key_name, changed_by, ip_address) VALUES (?, ?, ?)`,
        [name, req.session.username || 'dashboard', req.ip || ''],
      );
    } catch (_) { /* non-critical — log table may not exist yet */ }

    res.json({ ok: true, name, masked: mask(value) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/keys/reload — restart affected PM2 services (requires auth)
router.post('/reload', requireAuth, (req, res) => {
  const results = [];
  const services = ['claude-chat-bot', 'relay-master', 'litellm'];

  for (const svc of services) {
    try {
      execSync(`pm2 restart ${svc} 2>/dev/null`, { timeout: 10000 });
      results.push({ service: svc, ok: true });
    } catch (_) {
      results.push({ service: svc, ok: false, note: 'no encontrado o error' });
    }
  }
  res.json({ ok: true, results });
});

module.exports = router;
