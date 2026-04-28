'use strict';

// ── API Keys Panel ────────────────────────────────────────────────────────────

const PROVIDER_ICONS = {
  ANTHROPIC_API_KEY:    { icon: '🤖', label: 'Anthropic (Claude)' },
  OPENAI_API_KEY:       { icon: '🌐', label: 'OpenAI' },
  DEEPSEEK_API_KEY:     { icon: '🧠', label: 'DeepSeek' },
  GROQ_API_KEY:         { icon: '⚡', label: 'Groq' },
  GEMINI_API_KEY:       { icon: '✨', label: 'Google Gemini' },
  ELEVENLABS_API_KEY:   { icon: '🔊', label: 'ElevenLabs' },
  TELEGRAM_BOT_TOKEN:   { icon: '📨', label: 'Telegram Bot' },
  STRIPE_SECRET_KEY:    { icon: '💳', label: 'Stripe (Secret)' },
  STRIPE_WEBHOOK_SECRET:{ icon: '💳', label: 'Stripe (Webhook)' },
  SKYDROPX_API_KEY:     { icon: '📦', label: 'Skydropx API' },
  SKYDROPX_API_SECRET:  { icon: '📦', label: 'Skydropx Secret' },
  JOTFORM_API_KEY:      { icon: '📝', label: 'JotForm' },
  MYSQL_ROOT_PASSWORD:  { icon: '🗄️', label: 'MySQL root' },
  MYSQL_KPTL_PASSWORD:  { icon: '🗄️', label: 'MySQL kptl' },
  GITHUB_PAT:           { icon: '🐙', label: 'GitHub PAT' },
};

function keysKeyInfo(name) {
  return PROVIDER_ICONS[name] || { icon: '🔑', label: name };
}

async function keysLoad() {
  const list    = document.getElementById('keys-list');
  const pathEl  = document.getElementById('keys-vault-path');
  const msg     = document.getElementById('keys-msg');
  if (!list) return;

  list.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:8px">Cargando…</div>';
  msg.style.display = 'none';

  try {
    const res  = await fetch('/api/keys');
    if (res.status === 401) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:8px">⚠️ No autenticado</div>';
      return;
    }
    const data = await res.json();

    if (pathEl) {
      pathEl.textContent = data.exists
        ? `Vault: ${data.vault}`
        : `⚠️ Vault no encontrado: ${data.vault} — ejecutar fase-1-seguridad.sh en el servidor`;
    }

    if (!data.keys || !data.keys.length) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:8px">Sin keys en el vault.</div>';
      return;
    }

    list.innerHTML = data.keys.map(({ name, masked, set }) => {
      const info = keysKeyInfo(name);
      const statusDot = set
        ? '<span style="color:#4ade80;font-size:8px">●</span>'
        : '<span style="color:#f87171;font-size:8px">●</span>';
      return `
        <div class="key-row" id="key-row-${name}">
          <div class="key-meta">
            <span class="key-icon">${info.icon}</span>
            <span class="key-label">${info.label}</span>
            ${statusDot}
          </div>
          <div class="key-value" id="key-val-${name}">${masked || '(vacía)'}</div>
          <div class="key-actions">
            <button class="btn-sm" onclick="keysEdit('${name}')">Editar</button>
          </div>
          <div class="key-edit-form" id="key-edit-${name}" style="display:none">
            <input type="password" id="key-input-${name}" placeholder="Nueva valor…" autocomplete="new-password">
            <button class="btn-sm btn-save" onclick="keysSave('${name}')">Guardar</button>
            <button class="btn-sm" onclick="keysCancel('${name}')">✕</button>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div style="color:var(--red);font-size:11px;padding:8px">Error: ${e.message}</div>`;
  }
}

function keysEdit(name) {
  document.getElementById(`key-edit-${name}`).style.display = 'flex';
  document.getElementById(`key-input-${name}`).focus();
}

function keysCancel(name) {
  document.getElementById(`key-edit-${name}`).style.display = 'none';
  document.getElementById(`key-input-${name}`).value = '';
}

async function keysSave(name) {
  const input = document.getElementById(`key-input-${name}`);
  const value = input.value.trim();
  if (!value) return;

  const msg = document.getElementById('keys-msg');
  try {
    const res  = await fetch(`/api/keys/${encodeURIComponent(name)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ value }),
    });
    const data = await res.json();
    if (res.ok) {
      document.getElementById(`key-val-${name}`).textContent = data.masked || '••••••';
      keysCancel(name);
      keysShowMsg(`✓ ${name} actualizada`, 'ok');
    } else {
      keysShowMsg(`Error: ${data.error}`, 'err');
    }
  } catch (e) {
    keysShowMsg(`Error: ${e.message}`, 'err');
  }
}

async function keysReloadServices() {
  const btn = document.getElementById('btn-keys-reload-services');
  if (btn) { btn.disabled = true; btn.textContent = 'Reiniciando…'; }
  try {
    const res  = await fetch('/api/keys/reload', { method: 'POST' });
    const data = await res.json();
    const ok   = data.results?.filter(r => r.ok).map(r => r.service).join(', ') || '—';
    const fail = data.results?.filter(r => !r.ok).map(r => r.service).join(', ') || '';
    keysShowMsg(
      `Reiniciados: ${ok}${fail ? ' · Sin encontrar: ' + fail : ''}`,
      fail && !ok ? 'err' : 'ok',
    );
  } catch (e) {
    keysShowMsg(`Error: ${e.message}`, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⟳ Aplicar'; }
  }
}

function keysShowMsg(text, type) {
  const msg = document.getElementById('keys-msg');
  if (!msg) return;
  msg.textContent = text;
  msg.style.display = 'block';
  msg.style.background = type === 'ok' ? 'rgba(74,222,128,0.12)' : 'rgba(255,76,76,0.12)';
  msg.style.border     = type === 'ok' ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(255,76,76,0.3)';
  msg.style.color      = type === 'ok' ? '#4ade80' : 'var(--red)';
  setTimeout(() => { msg.style.display = 'none'; }, 5000);
}

async function doLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

// Auto-load when keys tab is shown
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-rtab="keys"],[data-panel="keys"]').forEach(btn => {
    btn.addEventListener('click', () => setTimeout(keysLoad, 50));
  });
});
