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
 */

const http       = require('http');
const { spawn }  = require('child_process');

const PORT       = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--port') || '5001');
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

function extractText(messages) {
  // Build a flat text prompt from messages array for --print mode
  return messages
    .map(m => {
      const content = Array.isArray(m.content)
        ? m.content.map(b => (b.type === 'text' ? b.text : '')).join('')
        : m.content || '';
      return `${m.role === 'user' ? 'Human' : 'Assistant'}: ${content}`;
    })
    .join('\n\n');
}

async function callClaude(model, systemPrompt, messages, maxTokens) {
  return new Promise((resolve, reject) => {
    const prompt = systemPrompt
      ? `${systemPrompt}\n\n${extractText(messages)}`
      : extractText(messages);

    const args = [
      '--print',
      '--dangerously-skip-permissions',
      '--model', model,
      '--max-tokens', String(maxTokens || 4096),
    ];

    const proc  = spawn(CLAUDE_BIN, args, { env: process.env });
    let stdout = '';
    let stderr = '';

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });

    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`));
      const text = stdout.trim();
      // Rough token estimates (4 chars ≈ 1 token)
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

    proc.on('error', reject);
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

      const result = await callClaude(model, system, payload.messages || [], payload.max_tokens);
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
  console.log(`[claude-proxy] using: ${CLAUDE_BIN}`);
});
