'use strict';

// relay/code-reviewer.js — DeepSeek V3 automated code reviewer
// Polls git log every 5 min. On new commit: reviews diff, alerts Telegram on issues.
// Cost: ~$0.001–0.005/review. Silent when all is OK.

const path = require('path');
const fs   = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const { execSync } = require('child_process');
const OpenAI       = require('openai');
const mysql        = require('mysql2/promise');

// ── Config ────────────────────────────────────────────────────────────────────
const REPO         = process.env.REPO_ROOT           || '/var/www/html/vilarkptl.com/ai-monitor';
const BOT_TOKEN    = process.env.TG_CLAUDE_BOT_TOKEN;
const ALERT_USERS  = (process.env.TG_ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const POLL_MS      = parseInt(process.env.REVIEWER_POLL_MS || '300000'); // 5 min
const MAX_DIFF     = 10000; // chars sent to DeepSeek

const deepseek = new OpenAI({
  apiKey:  process.env.DEEPSEEK_API_KEY || '',
  baseURL: 'https://api.deepseek.com/v1',
});

const db = mysql.createPool({
  host:     process.env.DB_HOST || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'ai_monitoring',
  waitForConnections: true,
  connectionLimit: 2,
});

// ── State ─────────────────────────────────────────────────────────────────────
let lastCommit = null;

// ── Git helpers ───────────────────────────────────────────────────────────────
function git(cmd) {
  return execSync(cmd, { cwd: REPO, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
}

function getLatestCommit() {
  try { return git('git log --format=%H -1'); }
  catch (_) { return null; }
}

function getCommitMessage(hash) {
  try { return git(`git log --format=%s -1 ${hash}`); }
  catch (_) { return '(sin mensaje)'; }
}

function getDiff(from, to) {
  try {
    return git(`git diff ${from} ${to} -- '*.js' '*.json' '*.sql' '*.md'`).slice(0, MAX_DIFF);
  } catch (_) { return null; }
}

// ── DeepSeek review ───────────────────────────────────────────────────────────
const REVIEW_SYSTEM = `Eres un revisor de código senior especializado en Node.js, MySQL y sistemas de agentes IA en producción.

Analiza el git diff y busca SOLO problemas reales que causen fallos:
- Bugs: undefined, null errors, async sin await, promesas sin catch
- Loops infinitos o condiciones de loop silencioso en agentes
- SQL injection, variables sin escapar
- Imports o módulos faltantes
- Pérdida de datos o corrupción de estado en producción

NO reportes: style issues, refactoring opportunities, comentarios faltantes, nombres de variables.

Si no hay problemas críticos → responde exactamente con la palabra: OK
Si hay problemas → responde SOLO con JSON válido:
{"severity":"error"|"warning","issues":[{"file":"ruta/archivo.js","line":42,"issue":"descripción concisa"}]}`;

async function reviewDiff(diff, commitMsg) {
  const resp = await deepseek.chat.completions.create({
    model:      'deepseek-chat',
    max_tokens: 512,
    temperature: 0,
    messages: [
      { role: 'system', content: REVIEW_SYSTEM },
      { role: 'user',   content: `Commit: ${commitMsg}\n\nDiff:\n${diff}` },
    ],
  });
  return (resp.choices[0].message.content || '').trim();
}

// ── Telegram alert ────────────────────────────────────────────────────────────
async function sendTelegram(text) {
  for (const chatId of ALERT_USERS) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    }).catch(err => console.warn('[code-reviewer] tg send error:', err.message));
  }
}

// ── DB save ───────────────────────────────────────────────────────────────────
async function saveReview(hash, commitMsg, diffSummary, result, severity) {
  try {
    await db.query(
      `INSERT INTO code_reviews (commit_hash, commit_message, diff_summary, review_result, severity)
       VALUES (?, ?, ?, ?, ?)`,
      [hash, commitMsg, diffSummary.slice(0, 600), result, severity],
    );
  } catch (err) {
    console.warn('[code-reviewer] db save error:', err.message);
  }
}

// ── Poll ──────────────────────────────────────────────────────────────────────
async function poll() {
  const latest = getLatestCommit();
  if (!latest) return;

  if (lastCommit === null) {
    lastCommit = latest;
    console.log(`[code-reviewer] Baseline: ${latest.slice(0, 8)}`);
    return;
  }

  if (latest === lastCommit) return;

  const commitMsg  = getCommitMessage(latest);
  const diff       = getDiff(lastCommit, latest);

  if (!diff || diff.length < 30) {
    lastCommit = latest;
    return;
  }

  console.log(`[code-reviewer] Revisando ${latest.slice(0, 8)}: ${commitMsg}`);

  try {
    const raw = await reviewDiff(diff, commitMsg);

    if (raw === 'OK') {
      console.log(`[code-reviewer] ${latest.slice(0, 8)}: OK — sin problemas`);
      await saveReview(latest, commitMsg, diff, 'OK', 'ok');
      lastCommit = latest;
      return;
    }

    // Parse JSON result
    let severity = 'warning';
    let tgMsg;

    try {
      const parsed = JSON.parse(raw);
      severity = parsed.severity || 'warning';
      const emoji  = severity === 'error' ? '🚨' : '⚠️';
      const issues = (parsed.issues || [])
        .map(i => `  • \`${i.file || '?'}\`${i.line ? `:${i.line}` : ''} — ${i.issue}`)
        .join('\n');
      tgMsg = `${emoji} *Code Review* \`${latest.slice(0, 8)}\`\n_${commitMsg}_\n\n${issues}`;
    } catch (_) {
      // DeepSeek didn't return valid JSON — treat as warning anyway
      severity = 'warning';
      tgMsg = `⚠️ *Code Review* \`${latest.slice(0, 8)}\`\n_${commitMsg}_\n\n${raw.slice(0, 500)}`;
    }

    await saveReview(latest, commitMsg, diff, raw, severity);
    await sendTelegram(tgMsg);
    console.log(`[code-reviewer] ${latest.slice(0, 8)}: ${severity} — alertas enviadas`);
    lastCommit = latest;
  } catch (err) {
    console.error('[code-reviewer] error en revisión:', err.message);
    // Don't advance lastCommit so we retry next poll
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
console.log(`[code-reviewer] Iniciando — poll cada ${POLL_MS / 60000}min · repo: ${REPO}`);

poll(); // baseline run
setInterval(poll, POLL_MS);
