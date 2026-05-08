#!/usr/bin/env node
'use strict';

/**
 * claude-proxy.js — Drop-in Anthropic API proxy using Claude CLI
 *
 * Accepts POST /v1/messages in Anthropic format, forwards to `claude --print`,
 * returns an Anthropic-compatible JSON response.  No npm packages required.
 *
 * Usage:
 *   node deploy/claude-proxy.js [--port 5001]
 *
 * PM2:
 *   pm2 start deploy/claude-proxy.js --name claude-proxy -- --port 5001
 *
 * Root note: claude CLI blocks --dangerously-skip-permissions as root.
 *   Set CLAUDE_RUN_USER=german (or whichever user has claude configured)
 *   in relay/.env so the proxy runs claude as that user via `su`.
 */

const http       = require('http');
const { spawn }  = require('child_process');
const fs         = require('fs');
const os         = require('os');
const path       = require('path');

process.on('uncaughtException',  err => console.error('[claude-proxy] uncaughtException:', err.message));
process.on('unhandledRejection', err => console.error('[claude-proxy] unhandledRejection:', err?.message || err));

// Load relay/.env (same directory as this file's parent)
(function loadEnv(file) {
  try {
    fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([^=#\s][^=]*?)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    });
  } catch (_) {}
})(path.join(__dirname, '..', 'relay', '.env'));

const PORT            = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--port') || '5001');
const CLAUDE_BIN      = process.env.CLAUDE_BIN      || 'claude';
const CLAUDE_RUN_USER = process.env.CLAUDE_RUN_USER || ''; // e.g. "german"

function extractText(messages) {
  return messages
    .map(m => {
      const content = Array.isArray(m.content)
        ? m.content.map(b => (b.type === 'text' ? b.text : '')).join('')
        : m.content || '';
      return `${m.role === 'user' ? 'Human' : 'Assistant'}: ${content}`;
    })
    .join('\n\n');
}

async function callClaude(model, systemPrompt, messages) {
  const prompt = systemPrompt
    ? `${systemPrompt}\n\n${extractText(messages)}`
    : extractText(messages);

  const tmpFile = path.join(os.tmpdir(), `claude-proxy-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(tmpFile, prompt, { encoding: 'utf8', mode: 0o644 }); // world-readable so CLAUDE_RUN_USER can read it

  return new Promise((resolve, reject) => {
    // When running as root, claude CLI blocks --dangerously-skip-permissions.
    // Solution: run claude as CLAUDE_RUN_USER (non-root) via `su`.
    // That user must have `claude` authenticated (claude login done once).
    let cmd;
    if (CLAUDE_RUN_USER) {
      // Use login shell (-l) so HOME and PATH are set correctly for the target user.
      // runuser is preferred over su when already root (no password prompt, same semantics).
      const suBin = fs.existsSync('/usr/sbin/runuser') ? 'runuser' : 'su';
      cmd = `${suBin} -l ${CLAUDE_RUN_USER} -s /bin/bash -c '${CLAUDE_BIN} --dangerously-skip-permissions --print --model ${model} < "${tmpFile}"'`;
    } else {
      cmd = `${CLAUDE_BIN} --print --model ${model} < "${tmpFile}"`;
    }

    const childEnv = { ...process.env };
    delete childEnv.ANTHROPIC_API_KEY;

    const proc = spawn('/bin/bash', ['-c', cmd], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });

    proc.on('close', code => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      if (code !== 0) {
        const detail = [stderr, stdout].filter(Boolean).join(' | ') || '(no output — PATH or auth issue?)';
        console.error(`[claude-proxy] cmd was: ${cmd}`);
        return reject(new Error(`claude exited ${code}: ${detail.slice(0, 400)}`));
      }
      const text = stdout.trim();
      const inputTokens  = Math.ceil(prompt.length  / 4);
      const outputTokens = Math.ceil(text.length    / 4);
      resolve({
        id:      `proxy-${Date.now()}`,
        type:    'message',
        role:    'assistant',
        model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens:  inputTokens,
          output_tokens: outputTokens,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens:     0,
        },
      });
    });

    proc.on('error', (err) => { try { fs.unlinkSync(tmpFile); } catch (_) {} reject(err); });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'not found' }));
  }

  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);
      const model   = payload.model || 'claude-sonnet-4-6';
      const system  = Array.isArray(payload.system)
        ? payload.system.map(b => b.text || '').join('')
        : payload.system || '';

      const result = await callClaude(model, system, payload.messages || []);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[claude-proxy] error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'proxy_error', message: err.message } }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[claude-proxy] listening on http://127.0.0.1:${PORT}`);
  console.log(`[claude-proxy] using: ${CLAUDE_BIN}${CLAUDE_RUN_USER ? ` (as user: ${CLAUDE_RUN_USER})` : ''}`);
});
