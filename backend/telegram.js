'use strict';

// Telegram Bot client
// Token y chat_id vienen de .env — nunca hardcodeados

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

const BASE_URL  = BOT_TOKEN
  ? `https://api.telegram.org/bot${BOT_TOKEN}`
  : null;

/**
 * Envía un mensaje de texto al chat configurado.
 * Fire-and-forget — nunca bloquea el servidor.
 */
async function send(text, extra = {}) {
  if (!BASE_URL || !CHAT_ID) return;          // silently skip if not configured

  const body = JSON.stringify({
    chat_id:    CHAT_ID,
    text:       text.slice(0, 4096),           // Telegram max
    parse_mode: 'HTML',
    ...extra,
  });

  try {
    const https = require('https');
    const url   = `${BASE_URL}/sendMessage`;
    const req   = https.request(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    });
    req.write(body);
    req.end();
  } catch (_) { /* silent */ }
}

// ── Preset messages ───────────────────────────────────────

function sessionEnded(session) {
  const cost = parseFloat(session.total_cost_usd || 0).toFixed(6);
  const dur  = session.ended_at
    ? Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 1000)
    : '?';
  return send(
    `✅ <b>Sesión terminada</b>\n` +
    `🔑 <code>${String(session.id).slice(0, 12)}…</code>\n` +
    `👤 ${session.agent_user || '?'} · ${session.api_provider || 'anthropic'}\n` +
    `🔩 ${session.tool_call_count || 0} calls · ⏱ ${dur}s\n` +
    `💰 <b>$${cost}</b>`
  );
}

function costAlert(daily, limit) {
  return send(
    `⚠️ <b>Alerta de costo</b>\n` +
    `Gasto hoy: <b>$${parseFloat(daily).toFixed(4)}</b>\n` +
    `Límite: $${parseFloat(limit).toFixed(2)}\n` +
    `Revisa <a href="https://ia.vilarkptl.com">ia.vilarkptl.com</a>`
  );
}

function relayDone(taskSummary, cost) {
  return send(
    `🤖 <b>Relay completado</b>\n` +
    `📋 ${taskSummary.slice(0, 200)}\n` +
    `💰 $${parseFloat(cost || 0).toFixed(6)}\n` +
    `Ver outbox en GitHub`
  );
}

function relayError(errorMsg) {
  return send(
    `❌ <b>Error en relay</b>\n` +
    `<code>${String(errorMsg).slice(0, 500)}</code>\n` +
    `Requiere intervención manual`
  );
}

function todosReport(completed, pending, cost) {
  const lines = completed.map(t => `✅ ${t}`).concat(
    pending.map(t => `⏳ ${t}`)
  ).join('\n');
  return send(
    `📊 <b>Reporte de tareas</b>\n` +
    `${lines}\n` +
    `💰 Costo sesión: $${parseFloat(cost||0).toFixed(6)}`
  );
}

module.exports = { send, sessionEnded, costAlert, relayDone, relayError, todosReport };
