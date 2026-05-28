#!/usr/bin/env node
'use strict';

/**
 * exec-lite.js — Standalone exec relay (systemd service, port 3099)
 *
 * Completely independent from ai-monitor/PM2. Runs as a systemd service
 * so it survives ai-monitor crashes and server reboots.
 *
 * Apache proxies: /exec-lite → http://127.0.0.1:3099/
 * Public URL:     https://ia.vilarkptl.com/exec-lite
 *
 * Install:
 *   cp deploy/exec-lite.js /usr/local/bin/exec-lite.js
 *   cp deploy/exec-lite.service /etc/systemd/system/exec-lite.service
 *   systemctl daemon-reload && systemctl enable --now exec-lite
 */

const http    = require('http');
const { exec } = require('child_process');
const fs      = require('fs');
const path    = require('path');

// Load token from ai-monitor backend .env (same token as /api/exec)
const ENV_FILE = '/var/www/html/vilarkptl.com/ai-monitor/backend/.env';
let EXEC_TOKEN = process.env.CLAUDE_EXEC_TOKEN || '';

try {
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^CLAUDE_EXEC_TOKEN=(.+)/);
    if (m) EXEC_TOKEN = m[1].trim().replace(/^['"]|['"]$/g, '');
  });
} catch (_) {}

if (!EXEC_TOKEN) {
  console.error('[exec-lite] FATAL: CLAUDE_EXEC_TOKEN not found in', ENV_FILE);
  process.exit(1);
}

const PORT = parseInt(process.env.EXEC_LITE_PORT || '3099');

// Commands allowed — same allowlist as backend/routes/exec.js
const ALLOWED = /^(pm2 (status|logs?|restart|stop|start|reload|list|show|describe|flush)|git (status|log|diff|fetch|pull|merge|push|checkout|branch|add|commit|reset|stash|remote)|mysql\s+-u\s+root|cat\s+\/var\/www\/html\/vilarkptl\.com\/|grep\s|ls\s|ls$|df\s|df$|free\s|free$|uptime$|node\s|npm\s|echo\s|pwd$|which\s|systemctl\s+(status|restart|reload|stop|start)|cp\s|mkdir\s|rm\s|chmod\s|chown\s|find\s)/;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Normalize double-slashes from Apache proxy path stripping
  const url = req.url.replace(/\/\/+/g, '/');

  // Health check (no auth needed)
  if (req.method === 'GET' && (url === '/health' || url === '/exec-lite/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: 'exec-lite', pid: process.pid }));
  }

  // Only POST /exec or /exec-lite
  if (req.method !== 'POST' || !url.match(/^\/(exec-lite\/?)?$/)) {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'not found' }));
  }

  // Auth
  const token = req.headers['x-exec-token'] || req.headers['x-deploy-secret'];
  if (!token || token !== EXEC_TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  let body;
  try { body = await readBody(req); }
  catch (_) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'invalid json' }));
  }

  const cmd = (body.cmd || body.command || '').trim();
  const cwd = body.cwd || '/var/www/html/vilarkptl.com/ai-monitor';

  if (!cmd) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'cmd required' }));
  }

  if (!ALLOWED.test(cmd)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: `command not allowed: ${cmd.slice(0, 80)}` }));
  }

  console.log(`[exec-lite] ${cmd.slice(0, 120)}`);

  exec(cmd, { cwd, timeout: 30000, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
    const output = [stdout, stderr].filter(Boolean).join('\n').trim();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (err && !stdout) {
      res.end(JSON.stringify({ error: output || err.message }));
    } else {
      res.end(JSON.stringify({ output: output || '(no output)', exit_code: err ? err.code || 1 : 0 }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[exec-lite] listening on http://127.0.0.1:${PORT}`);
  console.log(`[exec-lite] token loaded (${EXEC_TOKEN.slice(0, 8)}...)`);
});

process.on('uncaughtException', err => console.error('[exec-lite] uncaughtException:', err.message));
