'use strict';

const API = window.location.origin;

// ─── State ────────────────────────────────────────────────
const eventCache = new Map();  // id → full event object (for click-to-detail)
let events    = [];
let sessions  = {};
let providers = [];
let costData  = null;
let lineChart = null;
let dispatches = [];   // [{id, project, title, status, depth, parent_id, created_at, ...}]
let agentsList = [];   // [{id, name, status, current_task, cost_today, last_activity}]
let alerts     = [];   // [{id, alert_type, project_id, severity, title, details, auto_fixed, resolved, created_at}]

// ─── Tool icons ───────────────────────────────────────────
const TOOL_ICONS = {
  Bash:      { emoji: '⚡', cls: 'icon-bash'     },
  Read:      { emoji: '📖', cls: 'icon-read'     },
  Write:     { emoji: '✏️', cls: 'icon-write'    },
  Edit:      { emoji: '🔧', cls: 'icon-edit'     },
  Grep:      { emoji: '🔍', cls: 'icon-grep'     },
  Glob:      { emoji: '🗂️', cls: 'icon-glob'    },
  Agent:     { emoji: '🤖', cls: 'icon-agent'    },
  WebFetch:  { emoji: '🌐', cls: 'icon-webfetch' },
  WebSearch: { emoji: '🔎', cls: 'icon-webfetch' },
  TodoWrite: { emoji: '✅', cls: 'icon-edit'     },
};

// Provider colors/labels
const PROVIDERS = {
  anthropic:   { label: 'Claude',      cls: 'provider-anthropic'  },
  openai:      { label: 'OpenAI',      cls: 'provider-openai'     },
  deepseek:    { label: 'DeepSeek',    cls: 'provider-deepseek'   },
  fal:         { label: 'FAL',         cls: 'provider-fal'        },
  elevenlabs:  { label: 'ElevenLabs',  cls: 'provider-elevenlabs' },
};

// Chart.js line colors by provider
const PROVIDER_COLORS = {
  anthropic:  '#3fb950',
  openai:     '#58a6ff',
  deepseek:   '#bc8cff',
  fal:        '#ffa657',
  elevenlabs: '#ff79c6',
  default:    '#8b949e',
};

// ─── Helpers ──────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function shortId(id) {
  if (!id) return '—';
  return id.length > 14 ? id.slice(0,6)+'…'+id.slice(-4) : id;
}

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString('es-MX', {
    hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit'
  });
}

function costStr(usd) {
  const n = parseFloat(usd) || 0;
  if (n === 0) return '';
  if (n < 0.000001) return '<$0.000001';
  return '$' + n.toFixed(6);
}

function shortText(text, len = 90) {
  if (!text) return '';
  return text.replace(/\n/g,' ').replace(/\s+/g,' ').trim().slice(0, len) +
    (text.length > len ? '…' : '');
}

function providerBadge(provider) {
  const p = PROVIDERS[provider] || (provider ? { label: provider, cls: 'provider-unknown' } : PROVIDERS.anthropic);
  return `<span class="provider-badge ${p.cls}">${p.label}</span>`;
}

function toolIconEl(name) {
  const t = TOOL_ICONS[name] || { emoji:'🔩', cls:'icon-default' };
  return `<div class="tool-icon ${t.cls}">${t.emoji}</div>`;
}

// ─── Event feed ───────────────────────────────────────────
function renderEvent(ev) {
  const evtCls  = ev.event_type === 'pre_tool' ? 'pre' :
                  ev.event_type === 'post_tool' ? 'post' : 'stop';
  const summary = shortText(ev.tool_input_summary || ev.tool_response_summary);
  const cost    = costStr(ev.estimated_cost_usd);
  const badge   = providerBadge(ev.api_provider || 'anthropic');

  return `
  <div class="event-item ${evtCls}" data-eid="${esc(String(ev.id || ''))}">
    ${toolIconEl(ev.tool_name)}
    <div class="event-body">
      <div class="row1">
        <span class="tool-name">${esc(ev.tool_name || ev.event_type)}</span>
        ${badge}
        <span class="session-id">${shortId(ev.session_id)}</span>
      </div>
      ${summary ? `<div class="summary">${esc(summary)}</div>` : ''}
    </div>
    <div class="event-meta">
      <div class="time">${timeLabel(ev.timestamp)}</div>
      ${cost ? `<div class="cost">${cost}</div>` : ''}
    </div>
  </div>`;
}

function refreshFeed() {
  const list = document.getElementById('event-list');
  const counter = document.getElementById('feed-count');
  if (counter) counter.textContent = events.length + ' eventos';

  if (!events.length) {
    list.innerHTML = `<div class="empty-state">
      <span class="emoji">👀</span>
      Esperando tool calls…<br>
      <small>Los eventos aparecen aquí en tiempo real</small>
    </div>`;
    return;
  }
  list.innerHTML = [...events].reverse().map(renderEvent).join('');
}

// ─── Sessions ─────────────────────────────────────────────
function renderSession(s) {
  const cost    = costStr(s.total_cost_usd);
  const active  = s.is_active ? 'active' : '';
  const proj    = s.project_name
    ? `<span class="proj">📁 ${esc(s.project_name)}</span>` : '';
  const src     = s.chat_source && s.chat_source !== 'claude-code-cli'
    ? `<span style="color:var(--purple);font-size:9px">💬 ${esc(s.chat_source)}</span>` : '';
  const resumed = s.resumed
    ? `<span style="color:var(--green);font-size:9px" title="Sesión reanudada (--resume)">▶ resume</span>` : '';
  return `
  <div class="session-item ${active}" data-sid="${esc(s.id)}">
    <div class="sid" title="${esc(s.id)}">${shortId(s.id)}</div>
    <div class="session-meta">
      <span>${esc(s.agent_user || '?')}</span>
      ${cost ? `<span class="cost">${cost}</span>` : ''}
      <span class="tools">🔩 ${s.tool_call_count || 0}</span>
      ${proj}${src}${resumed}
      <span>${providerBadge(s.api_provider)}</span>
      <span>${timeLabel(s.started_at)}</span>
    </div>
  </div>`;
}

function refreshSessions() {
  const list = document.getElementById('session-list');
  const counter = document.getElementById('sessions-count');
  const sorted = Object.values(sessions).sort(
    (a,b) => new Date(b.started_at) - new Date(a.started_at)
  );
  if (counter) counter.textContent = `${sorted.length} sesiones`;
  if (!sorted.length) {
    list.innerHTML = `<div class="empty-state"><span class="emoji">💤</span>Sin sesiones</div>`;
    return;
  }
  list.innerHTML = sorted.map(renderSession).join('');
}

// ─── Event detail modal ───────────────────────────────────
function openEventDetail(eid) {
  const ev = eventCache.get(String(eid));
  if (!ev) return;
  document.getElementById('edm-title').textContent =
    `${ev.tool_name || ev.event_type} — ${shortId(ev.session_id)}`;
  document.getElementById('edm-input-content').textContent =
    ev.tool_input_summary  || '(sin datos)';
  document.getElementById('edm-response-content').textContent =
    ev.tool_response_summary || '(sin respuesta)';
  document.getElementById('event-detail-modal').removeAttribute('hidden');
}

// ─── Session detail modal ─────────────────────────────────
async function openSessionDetail(sid) {
  const s = sessions[sid];
  const modal = document.getElementById('session-detail-modal');
  if (!modal) return;
  modal.removeAttribute('hidden');

  document.getElementById('sdm-title').textContent = shortId(sid);
  const metaEl   = document.getElementById('sdm-meta');
  const eventsEl = document.getElementById('sdm-events');

  metaEl.innerHTML = s ? `
    <div class="sdm-info">
      ${s.project_name ? `<span class="sdm-badge proj">📁 ${esc(s.project_name)}</span>` : ''}
      ${s.working_dir  ? `<span class="sdm-path">${esc(s.working_dir)}</span>` : ''}
      <span class="sdm-badge cost">${costStr(s.total_cost_usd)||'$0'}</span>
      <span class="sdm-badge tools">🔩 ${s.tool_call_count || 0} tools</span>
      ${s.chat_source ? `<span class="sdm-badge src">💬 ${esc(s.chat_source)}</span>` : ''}
    </div>` : '';

  eventsEl.innerHTML = '<div class="sdm-loading">Cargando…</div>';
  try {
    const r = await fetch(`${API}/api/sessions/${sid}/events`);
    const evs = await r.json();
    if (!evs.length) {
      eventsEl.innerHTML = '<div class="empty-state">Sin eventos registrados</div>';
      return;
    }
    // Cache events so click handler can find them by id
    evs.forEach(ev => { if (ev.id) eventCache.set(String(ev.id), ev); });
    eventsEl.innerHTML = evs.map(ev => `
      <div class="sdm-event" data-eid="${esc(String(ev.id || ''))}" style="cursor:pointer" title="Click para ver input/output">
        <span class="sdm-ev-icon">${(TOOL_ICONS[ev.tool_name]||{emoji:'🔩'}).emoji}</span>
        <div class="sdm-ev-body">
          <div class="sdm-ev-name">${esc(ev.tool_name || ev.event_type)}</div>
          ${ev.tool_input_summary ? `<div class="sdm-ev-summary">${esc(shortText(ev.tool_input_summary, 120))}</div>` : ''}
        </div>
        <div class="sdm-ev-meta">
          <div>${timeLabel(ev.timestamp)}</div>
          ${ev.duration_ms         ? `<div style="color:var(--text-muted)">${ev.duration_ms}ms</div>` : ''}
          ${ev.estimated_cost_usd  ? `<div style="color:var(--yellow)">${costStr(ev.estimated_cost_usd)}</div>` : ''}
        </div>
      </div>`).join('');
  } catch (err) {
    eventsEl.innerHTML = `<div style="color:var(--red)">Error: ${esc(err.message)}</div>`;
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.setAttribute('hidden', '');
}

// ─── Agents panel ─────────────────────────────────────────
function renderAgentCard(agent) {
  const icon   = PROJECT_ICONS[agent.id] || '🤖';
  const dotCls = agent.status === 'working'  ? 'working'  :
                 agent.status === 'idle'     ? 'idle'     : 'inactive';
  const cost   = agent.cost_today > 0 ? `$${parseFloat(agent.cost_today).toFixed(4)}` : '';
  const task   = agent.current_task ? shortText(agent.current_task, 60) : '';
  const ago    = agent.last_activity ? timeAgo(agent.last_activity) : 'sin actividad';
  const modelRaw = (agent.claude_model || '').replace('claude-', '').replace(/-\d{8}$/, '');
  const modelBadge = modelRaw ? `<span class="agent-model-badge">${esc(modelRaw)}</span>` : '';
  return `
  <div class="agent-card">
    <span class="agent-dot ${dotCls}"></span>
    <span class="agent-icon">${icon}</span>
    <div class="agent-info">
      <div class="agent-name">${esc(agent.name)}${modelBadge}</div>
      <div class="agent-task">${task ? esc(task) : ago}</div>
    </div>
    ${cost ? `<span class="agent-cost">${cost}</span>` : ''}
  </div>`;
}

function refreshAgents() {
  const el      = document.getElementById('agent-cards');
  const counter = document.getElementById('agents-count');
  if (!el) return;
  const active = agentsList.filter(a => a.status === 'working').length;
  if (counter) counter.textContent = `${agentsList.length} agentes · ${active} activos`;
  if (!agentsList.length) {
    el.innerHTML = `<div class="empty-state"><span class="emoji">🤖</span>Sin agentes configurados</div>`;
    return;
  }
  el.innerHTML = agentsList.map(renderAgentCard).join('');
}

async function loadAgents() {
  try {
    const r = await fetch(`${API}/api/relay/agents`);
    if (!r.ok) return;
    agentsList = await r.json();
    refreshAgents();
  } catch (err) {
    console.warn('[agents] load error:', err.message);
  }
}

// ─── Screenshots sync ─────────────────────────────────────
async function syncScreenshots() {
  const btn = document.getElementById('btn-sync-shots');
  if (btn) { btn.disabled = true; btn.textContent = '↻ …'; }
  try {
    const r = await fetch(`${API}/api/screenshots/sync`, { method: 'POST' });
    const d = await r.json();
    await loadScreenshots();
    if (btn) btn.textContent = `✓ ${d.copied}`;
    setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = '↻ Sync'; } }, 3000);
  } catch (_) {
    if (btn) { btn.disabled = false; btn.textContent = '↻ Sync'; }
  }
}

// ─── .env scan ────────────────────────────────────────────
async function scanEnvProviders() {
  const btn = document.getElementById('btn-scan-providers');
  if (btn) { btn.disabled = true; btn.textContent = '↻ …'; }
  try {
    const r = await fetch(`${API}/api/providers/scan`, { method: 'POST' });
    const d = await r.json();
    await loadProviders();
    if (btn) btn.textContent = `✓ ${(d.found||[]).length} keys`;
    setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = '↻ Scan .env'; } }, 3000);
  } catch (_) {
    if (btn) { btn.disabled = false; btn.textContent = '↻ Scan .env'; }
  }
}

// ─── Click handler init ───────────────────────────────────
function initClickHandlers() {
  // Event feed → detail modal
  const feedEl = document.getElementById('event-list');
  if (feedEl) {
    feedEl.addEventListener('click', e => {
      const item = e.target.closest('[data-eid]');
      if (item && item.dataset.eid) openEventDetail(item.dataset.eid);
    });
  }
  // Session list → detail modal
  const sessEl = document.getElementById('session-list');
  if (sessEl) {
    sessEl.addEventListener('click', e => {
      const item = e.target.closest('[data-sid]');
      if (item && item.dataset.sid) openSessionDetail(item.dataset.sid);
    });
  }
  // Events inside session detail modal → event detail modal
  const sdmEl = document.getElementById('session-detail-modal');
  if (sdmEl) {
    sdmEl.addEventListener('click', e => {
      const item = e.target.closest('[data-eid]');
      if (item && item.dataset.eid) openEventDetail(item.dataset.eid);
    });
  }
  // Close modal on overlay click or ESC
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.setAttribute('hidden', '');
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(m => m.setAttribute('hidden', ''));
    }
  });
}

// ─── Stats header ─────────────────────────────────────────
function refreshStats() {
  const todayCost = events.reduce((s,e) => s + (parseFloat(e.estimated_cost_usd)||0), 0);
  const el = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  el('stat-cost',   '$' + todayCost.toFixed(5));
  el('stat-active', Object.values(sessions).filter(s=>s.is_active).length);
  el('stat-events', events.length);
}

let _resumeStatTs = 0;
async function refreshResumeStats() {
  if (Date.now() - _resumeStatTs < 60_000) return;
  _resumeStatTs = Date.now();
  try {
    const r = await fetch(`${API}/api/sessions/stats/resume`);
    if (!r.ok) return;
    const d = await r.json();

    // Header pill — today's totals
    const statEl = document.getElementById('stat-resumed');
    const t = d.today || {};
    if (statEl) {
      statEl.textContent = t.total > 0 ? `${t.resumed}/${t.total} (${t.rate_pct}%)` : '0';
    }
    const pill = document.getElementById('stat-resumed-pill');
    if (pill) pill.title = `Reanudadas hoy: ${t.resumed} de ${t.total} sesiones (${t.rate_pct}%)`;

    // Per-project breakdown — last 7 days
    const breakdown = document.getElementById('resume-breakdown');
    const rows      = document.getElementById('resume-breakdown-rows');
    if (!breakdown || !rows) return;
    const byProject = d.by_project || [];
    if (!byProject.length) { breakdown.style.display = 'none'; return; }
    breakdown.style.display = '';
    rows.innerHTML = byProject.map(p => {
      const rate = parseFloat(p.resume_rate_pct || 0);
      const bar  = Math.round(rate);
      const color = rate > 40 ? 'var(--green)' : rate > 15 ? 'var(--yellow,#f0a500)' : 'var(--text-muted)';
      return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11px">
        <span style="min-width:110px;color:var(--text)">${esc(p.project_name)}</span>
        <div style="flex:1;background:var(--border);border-radius:3px;height:5px">
          <div style="width:${bar}%;background:${color};height:5px;border-radius:3px"></div>
        </div>
        <span style="min-width:60px;text-align:right;color:${color}">${p.resumed_sessions}/${p.total_sessions} (${rate}%)</span>
      </div>`;
    }).join('');
  } catch (_) {}
}

// ─── Line Chart (Chart.js) ────────────────────────────────
function buildLineChart(hourlyData) {
  const canvas = document.getElementById('cost-chart-line');
  if (!canvas) return;

  // Group by provider
  const providers = [...new Set(hourlyData.map(h => h.api_provider || 'anthropic'))];
  const hours     = [...new Set(hourlyData.map(h => h.hour_bucket || h.day))].sort();

  const datasets = providers.map(prov => {
    const color = PROVIDER_COLORS[prov] || PROVIDER_COLORS.default;
    const data  = hours.map(h => {
      const row = hourlyData.find(r =>
        (r.hour_bucket || r.day) === h && (r.api_provider || 'anthropic') === prov
      );
      return parseFloat(row?.cost_usd || row?.total_cost_usd || 0);
    });
    return {
      label:           PROVIDERS[prov]?.label || prov,
      data,
      borderColor:     color,
      backgroundColor: color + '22',
      borderWidth:     2,
      pointRadius:     2,
      pointHoverRadius:4,
      tension:         0.4,
      fill:            true,
    };
  });

  const labels = hours.map(h => h.slice(11,16) || h.slice(5));

  if (lineChart) lineChart.destroy();

  lineChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      animation:           { duration: 400 },
      interaction:         { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color:    '#8b949e',
            font:     { family: 'monospace', size: 10 },
            boxWidth: 10,
          }
        },
        tooltip: {
          backgroundColor: '#21262d',
          titleColor:      '#e6edf3',
          bodyColor:       '#8b949e',
          borderColor:     '#30363d',
          borderWidth:     1,
          callbacks: {
            label: ctx => ` $${ctx.parsed.y.toFixed(6)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color:'#8b949e', font:{size:9}, maxRotation:0 },
          grid:  { color:'#21262d' },
        },
        y: {
          ticks: {
            color: '#8b949e',
            font:  { size: 9 },
            callback: v => v === 0 ? '0' : '$'+v.toFixed(5),
          },
          grid:    { color: '#21262d' },
          beginAtZero: true,
        }
      }
    }
  });
}

// ─── Costs panel ─────────────────────────────────────────
function refreshCostsPanel(data) {
  if (!data) return;

  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  if (data.today) {
    el('cost-today',         '$' + parseFloat(data.today.total_cost_usd||0).toFixed(6));
    el('cost-today-sessions', data.today.sessions || 0);
    el('cost-today-events',   data.today.events   || 0);
  }
  if (data.week) {
    el('cost-week',          '$' + parseFloat(data.week.total_cost_usd||0).toFixed(6));
    el('cost-week-sessions',  data.week.sessions || 0);
  }

  // By tool
  if (data.by_tool) {
    const el2 = document.getElementById('cost-by-tool');
    if (el2) el2.innerHTML = data.by_tool.slice(0,10).map(t =>
      `<div class="cost-row">
        <span class="label">${esc(t.tool_name||'unknown')}</span>
        <span class="val">${t.calls} calls · ${costStr(t.cost_usd)||'$0'}</span>
       </div>`
    ).join('');
  }

  // Chart
  if (data.by_hour && data.by_hour.length) {
    buildLineChart(data.by_hour);
  }
}

// ─── Providers panel ──────────────────────────────────────
function refreshProviderList(data) {
  const list = document.getElementById('provider-list');
  if (!list) return;
  if (!data || !data.length) {
    list.innerHTML = `<div class="empty-state"><span class="emoji">🔑</span>Sin APIs configuradas</div>`;
    return;
  }
  list.innerHTML = data.map(p => `
    <div class="provider-item">
      <span class="provider-badge ${(PROVIDERS[p.provider]||{cls:'provider-unknown'}).cls}">${(PROVIDERS[p.provider]||{label:p.provider}).label}</span>
      <div class="provider-info">
        <div class="provider-name">${esc(p.provider)}</div>
        ${p.project_name ? `<div class="provider-proj">📁 ${esc(p.project_name)}</div>` : ''}
        ${p.api_key_masked ? `<div class="provider-key">${esc(p.api_key_masked)}</div>` : ''}
      </div>
      <div class="provider-cost">${costStr(p.total_spent_usd)||'$0'}<br>
        <span style="color:var(--text-muted);font-size:9px">${p.total_sessions||0} sesiones</span>
      </div>
    </div>`
  ).join('');
}

// ─── Add provider form ────────────────────────────────────
function initProviderForm() {
  const btn = document.getElementById('fp-save');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const body = {
      provider:      document.getElementById('fp-provider').value,
      project_name:  document.getElementById('fp-project').value.trim(),
      api_key:       document.getElementById('fp-key').value.trim(),
      monthly_limit_usd: parseFloat(document.getElementById('fp-limit').value) || 0,
    };
    if (!body.provider) return;
    const r = await fetch(`${API}/api/providers`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    if (r.ok) {
      document.getElementById('fp-key').value = '';
      loadProviders();
    }
  });
}

// ─── Mobile tabs ──────────────────────────────────────────
function initTabs() {
  // Initialize mobile active state (feed is default)
  document.getElementById('feed-panel').classList.add('mobile-active');

  // Mobile tab bar
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const panel = btn.dataset.panel;

      document.getElementById('feed-panel').classList.remove('mobile-active');
      document.getElementById('right-panel').classList.remove('mobile-active');

      if (panel === 'feed') {
        document.getElementById('feed-panel').classList.add('mobile-active');
      } else {
        document.getElementById('right-panel').classList.add('mobile-active');
        switchRightTab(panel);
      }
    });
  });

  // Desktop right tabs
  document.querySelectorAll('.rtab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchRightTab(btn.dataset.rtab);
    });
  });
}

function switchRightTab(tab) {
  ['agents','screenshots','sessions','costs','providers','projects','alerts','conversations','tg-users','platform','api-admin','scores'].forEach(t => {
    const el = document.getElementById(t + '-panel');
    if (el) el.classList.toggle('visible', t === tab);
  });
  if (tab === 'costs')         loadCosts();
  if (tab === 'providers')     loadProviders();
  if (tab === 'projects')      loadProjects();
  if (tab === 'agents')        { loadAgents(); loadDispatches(); }
  if (tab === 'screenshots')   loadScreenshots();
  if (tab === 'alerts')        loadAlerts();
  if (tab === 'conversations') loadConversaciones();
  if (tab === 'tg-users')      tgUsersRefresh();
  if (tab === 'platform')      { loadPlatform(); loadProxyQuota(); }
  if (tab === 'api-admin')     loadApiAdmin();
  if (tab === 'scores')        loadScores();
}

// ─── Screenshots panel ────────────────────────────────────
let screenshots = [];

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60)  return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff/60)}m`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h`;
  return `${Math.floor(diff/86400)}d`;
}

function renderScreenshotGrid(shots) {
  const grid   = document.getElementById('screenshot-grid');
  const counter = document.getElementById('shot-count');
  if (!grid) return;
  if (counter) counter.textContent = shots.length + ' fotos';
  if (!shots.length) {
    grid.innerHTML = `<div class="empty-state"><span class="emoji">📷</span>Sin screenshots aún<br><small>Se capturan automáticamente tras cada tarea de frontend</small></div>`;
    return;
  }
  grid.innerHTML = shots.map(s => `
    <a href="${esc(s.url)}" target="_blank" class="shot-card">
      <img class="shot-img" src="${esc(s.url)}" alt="${esc(s.project_id)}"
           loading="lazy" onerror="this.parentElement.style.display='none'">
      <div class="shot-meta">
        <span class="shot-project">${esc(s.project_id)}</span>
        <span class="shot-time">${timeAgo(s.taken_at)}</span>
      </div>
    </a>`
  ).join('');
}

function populateShotFilter(shots) {
  const sel = document.getElementById('shot-filter');
  if (!sel) return;
  const projects = [...new Set(shots.map(s => s.project_id))];
  sel.innerHTML = `<option value="">Todos los proyectos</option>` +
    projects.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  sel.onchange = () => {
    const filter = sel.value;
    renderScreenshotGrid(filter ? screenshots.filter(s => s.project_id === filter) : screenshots);
  };
}

async function loadScreenshots() {
  try {
    const r = await fetch(`${API}/api/screenshots?limit=200`);
    if (!r.ok) return;
    screenshots = await r.json();
    renderScreenshotGrid(screenshots);
    populateShotFilter(screenshots);
  } catch (err) {
    console.warn('[screenshots] load error:', err.message);
  }
}

// ─── Dispatch / Agents panel ──────────────────────────────
const DISPATCH_STATUS = {
  pending:    { label: 'pendiente', cls: 'ds-pending'    },
  dispatched: { label: 'corriendo', cls: 'ds-running'    },
  completed:  { label: 'ok',        cls: 'ds-ok'         },
  failed:     { label: 'falló',     cls: 'ds-failed'     },
  error:      { label: 'error',     cls: 'ds-failed'     },
};

const PROJECT_ICONS = {
  coordinator:    '🧠',
  fiscalai:       '⚙️',
  'fiscalai-front':'🖥️',
  'ai-monitor':   '📡',
};

function renderDispatchCard(d, depth = 0) {
  const st     = DISPATCH_STATUS[d.status] || { label: d.status, cls: 'ds-pending' };
  const icon   = PROJECT_ICONS[d.project] || '🤖';
  const indent = depth > 0 ? `style="margin-left:${depth * 16}px;border-left:2px solid var(--border)"` : '';
  const created = d.created_at ? timeLabel(d.created_at) : '';
  const dur    = d.duration_sec ? `${d.duration_sec}s` : '';
  const req    = d.requester && d.requester !== 'api' ? `<span class="ds-requester">← ${esc(d.requester)}</span>` : '';
  const result = d.result_summary ? `<div class="ds-result">${esc(shortText(d.result_summary, 100))}</div>` : '';

  return `
  <div class="dispatch-card" data-id="${esc(d.id)}" ${indent}>
    <div class="ds-header">
      <span class="ds-icon">${icon}</span>
      <span class="ds-project">${esc(d.project)}</span>
      <span class="ds-badge ${st.cls}">${st.label}</span>
      ${req}
      <span class="ds-time">${created}${dur ? ' · ' + dur : ''}</span>
    </div>
    <div class="ds-title">${esc(d.title || d.id)}</div>
    ${result}
  </div>`;
}

function refreshDispatches() {
  const list   = document.getElementById('dispatch-list');
  const counter = document.getElementById('agents-count');
  if (!list) return;

  const pending = dispatches.filter(d => d.status === 'pending' || d.status === 'dispatched').length;
  if (counter) counter.textContent = `${dispatches.length} tareas · ${pending} activas`;

  if (!dispatches.length) {
    list.innerHTML = `<div class="empty-state"><span class="emoji">🤖</span>Sin tareas despachadas aún</div>`;
    return;
  }

  // Sort: pending/dispatched first, then by created_at DESC
  const sorted = [...dispatches].sort((a, b) => {
    const aPrio = (a.status === 'pending' || a.status === 'dispatched') ? 0 : 1;
    const bPrio = (b.status === 'pending' || b.status === 'dispatched') ? 0 : 1;
    if (aPrio !== bPrio) return aPrio - bPrio;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  // Root tasks first, then subtasks indented under their parent
  const roots = sorted.filter(d => !d.parent_id);
  const html  = roots.map(root => {
    const children = sorted.filter(d => d.parent_id === root.id);
    return renderDispatchCard(root, 0) + children.map(c => renderDispatchCard(c, 1)).join('');
  }).join('');

  list.innerHTML = html || `<div class="empty-state"><span class="emoji">🤖</span>Sin tareas</div>`;
}

async function loadDispatches() {
  try {
    const r = await fetch(`${API}/api/relay/dispatch`);
    if (!r.ok) return;
    dispatches = await r.json();
    refreshDispatches();
  } catch (err) {
    console.warn('[dispatches] load error:', err.message);
  }
}

// ─── Projects panel ───────────────────────────────────────
async function loadProjects() {
  try {
    const [projRes, shotRes] = await Promise.all([
      fetch(`${API}/api/projects`),
      fetch(`${API}/api/screenshots/projects`).catch(() => ({ json: () => [] })),
    ]);
    const projects = await projRes.json();
    let shotMap = {};
    try {
      const shots = await shotRes.json();
      shots.forEach(s => { shotMap[s.project_id] = s.latest?.url || null; });
    } catch (_) {}
    renderProjects(projects, shotMap);
  } catch (err) {
    console.warn('[projects] load error:', err.message);
  }
}

function renderProjects(projects, shotMap = {}) {
  const list = document.getElementById('project-list');
  if (!list) return;
  if (!projects || !projects.length) {
    list.innerHTML = `<div class="empty-state"><span class="emoji">📁</span>Sin proyectos</div>`;
    return;
  }
  list.innerHTML = projects.map(p => {
    // Use latest known screenshot for this project, fallback to fixed-name file
    const shotUrl = shotMap[p.id] || `/screenshots/${p.id}.png`;
    const cost      = parseFloat(p.total_cost_usd || 0).toFixed(4);
    const sessions  = p.total_sessions || 0;
    const toolCalls = p.total_tool_calls || 0;
    const lastAct   = p.last_activity
      ? new Date(p.last_activity).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour12: false })
      : 'Sin actividad';
    const jState    = p.journal_state || 'active';
    const jFails    = p.journal_consecutive_failures || 0;
    const jBadge    = jState === 'stopped'
      ? `<span class="proj-journal-badge stopped">🛑 detenido</span>`
      : jFails >= 1
        ? `<span class="proj-journal-badge active">⚠️ ${jFails} fallo${jFails>1?'s':''}</span>`
        : '';

    return `
    <div class="project-card" data-project-id="${esc(p.id)}">
      <img class="proj-screenshot" src="${shotUrl}"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
           alt="screenshot ${esc(p.name)}">
      <div class="proj-screenshot-placeholder" style="display:none">📷 Sin screenshot aún</div>
      <div class="proj-body">
        <div class="proj-name">
          <span class="proj-dot ${p.is_active ? 'active' : ''}"></span>
          ${esc(p.name)}
          ${jBadge}
        </div>
        <div class="proj-stats">
          <span>💰 <b>$${cost}</b></span>
          <span>🔁 <b>${sessions}</b> sesiones</span>
          <span>🔧 <b>${toolCalls}</b> tools</span>
        </div>
        ${p.url ? `<a href="${esc(p.url)}" target="_blank" class="proj-url" onclick="event.stopPropagation()">🌐 ${esc(p.url)}</a>` : ''}
        <div style="font-size:9px;color:var(--text-muted);margin-top:4px">Última actividad: ${lastAct}</div>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => openProjectDetail(card.dataset.projectId));
  });
}

// ─── Project detail modal ─────────────────────────────────
let _pdmChart = null;
let _pdmProjectId = null;

function openProjectDetail(id) {
  _pdmProjectId = id;
  const modal = document.getElementById('project-detail-modal');
  modal.classList.add('open');
  document.getElementById('pdm-name').textContent = id;
  document.getElementById('pdm-url').textContent  = '';
  document.getElementById('pdm-url').href         = '#';
  switchPdmTab('journal');
  loadPdmJournal(id);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pdm-close')?.addEventListener('click', closePdm);
  document.getElementById('project-detail-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closePdm();
  });
  document.querySelectorAll('.pdm-tab').forEach(btn => {
    btn.addEventListener('click', () => switchPdmTab(btn.dataset.pdmTab));
  });
});

function closePdm() {
  document.getElementById('project-detail-modal')?.classList.remove('open');
  if (_pdmChart) { _pdmChart.destroy(); _pdmChart = null; }
}

function switchPdmTab(tab) {
  document.querySelectorAll('.pdm-tab').forEach(b => b.classList.toggle('active', b.dataset.pdmTab === tab));
  ['journal','context','costs'].forEach(t => {
    const el = document.getElementById(`pdm-${t}-tab`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'context') loadPdmContext(_pdmProjectId);
  if (tab === 'costs')   loadPdmCosts(_pdmProjectId, '24h');
}

async function loadPdmJournal(id) {
  const el = document.getElementById('pdm-journal-tab');
  el.innerHTML = '<div style="color:var(--text-muted);font-size:11px">Cargando…</div>';
  try {
    const [jRes, pRes] = await Promise.all([
      fetch(`${API}/api/projects/${id}/journal`),
      fetch(`${API}/api/projects/${id}`),
    ]);
    const j = await jRes.json();
    const p = (await pRes.json()).project || {};

    // Update header
    document.getElementById('pdm-name').textContent = p.name || id;
    if (p.url) {
      const a = document.getElementById('pdm-url');
      a.textContent = p.url;
      a.href = p.url;
    }

    const state     = j.state || 'active';
    const stateLbl  = state === 'stopped' ? '🛑 Detenido' : '🟢 Activo';
    const tasks     = j.recent_tasks || [];

    el.innerHTML = `
      <div class="journal-state-badge ${state}">${stateLbl}</div>
      <div class="journal-stats">
        <span>Total: <b>${j.total_tasks || 0}</b></span>
        <span>Éxitos consecutivos: <b>${j.consecutive_successes || 0}</b></span>
        <span>Fallos consecutivos: <b>${j.consecutive_failures || 0}</b></span>
        ${j.updated_at ? `<span>Actualizado: <b>${new Date(j.updated_at).toLocaleString('es-MX',{timeZone:'America/Mexico_City',hour12:false})}</b></span>` : ''}
      </div>
      ${tasks.length === 0 ? '<div style="color:var(--text-muted);font-size:11px">Sin tareas registradas aún.</div>' : ''}
      ${tasks.map(t => {
        const icon = t.status === 'success' ? '✅' : t.status === 'failed' ? '❌' : '⏳';
        const ts   = t.timestamp ? new Date(t.timestamp).toLocaleString('es-MX',{timeZone:'America/Mexico_City',hour12:false}) : '';
        const dur  = t.duration_sec ? `${Math.round(t.duration_sec)}s` : '';
        return `<div class="journal-task">
          <div class="jt-icon">${icon}</div>
          <div class="jt-title">${esc(t.title || '—')}</div>
          <div class="jt-meta">${dur}<br>${ts}</div>
        </div>`;
      }).join('')}`;
  } catch (err) {
    el.innerHTML = `<div style="color:#f85149;font-size:11px">Error: ${esc(err.message)}</div>`;
  }
}

async function loadPdmContext(id) {
  const el = document.getElementById('pdm-context-tab');
  if (el.dataset.loaded === id) return;
  el.innerHTML = '<div style="color:var(--text-muted);font-size:11px">Cargando…</div>';
  try {
    const r = await fetch(`${API}/api/projects/${id}/context`);
    const d = await r.json();
    const content = d.content || '(sin contexto)';
    el.dataset.loaded = id;
    el.innerHTML = `
      <div class="ctx-actions">
        <button class="ctx-copy-btn" id="ctx-copy-btn">📋 Copiar contexto</button>
        <span class="ctx-hint">relay/agents/${esc(id)}.md</span>
      </div>
      <pre class="ctx-content">${esc(content)}</pre>`;
    document.getElementById('ctx-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(content).then(() => {
        const btn = document.getElementById('ctx-copy-btn');
        if (btn) { btn.textContent = '✅ Copiado'; setTimeout(() => btn.textContent = '📋 Copiar contexto', 1500); }
      });
    });
  } catch (err) {
    el.innerHTML = `<div style="color:#f85149;font-size:11px">Error: ${esc(err.message)}</div>`;
  }
}

async function loadPdmCosts(id, period) {
  const el = document.getElementById('pdm-costs-tab');
  // Render period buttons
  el.innerHTML = `
    <div class="pdm-period-btns">
      ${['24h','7d','30d'].map(p => `<button class="pdm-period-btn ${p===period?'active':''}" data-p="${p}">${p}</button>`).join('')}
    </div>
    <div id="pdm-cost-summary" class="pdm-cost-summary">Cargando…</div>
    <div class="pdm-chart-wrap"><canvas id="pdm-cost-chart"></canvas></div>`;

  el.querySelectorAll('.pdm-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_pdmChart) { _pdmChart.destroy(); _pdmChart = null; }
      loadPdmCosts(id, btn.dataset.p);
    });
  });

  try {
    const r = await fetch(`${API}/api/projects/${id}/costs/history?period=${period}`);
    const d = await r.json();
    const t = d.totals || {};

    document.getElementById('pdm-cost-summary').innerHTML = `
      <div>Costo: <b>$${parseFloat(t.total_cost_usd||0).toFixed(5)}</b></div>
      <div>Eventos: <b>${t.events||0}</b></div>
      <div>Sesiones: <b>${t.sessions||0}</b></div>
      <div>Tokens: <b>${(t.total_tokens||0).toLocaleString()}</b></div>`;

    const buckets = d.buckets || [];
    const labels  = buckets.map(b => b.bucket ? b.bucket.slice(5,16) : '');
    const costs   = buckets.map(b => parseFloat(b.cost_usd)||0);

    const ctx = document.getElementById('pdm-cost-chart');
    if (!ctx) return;
    if (_pdmChart) _pdmChart.destroy();
    _pdmChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'USD',
          data:  costs,
          borderColor: '#3fb950',
          backgroundColor: 'rgba(63,185,80,.08)',
          fill: true,
          tension: .3,
          pointRadius: costs.length > 48 ? 0 : 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color:'#7d8590', font:{size:9}, maxTicksLimit:8 }, grid:{color:'rgba(255,255,255,.04)'} },
          y: { ticks: { color:'#7d8590', font:{size:9}, callback: v => '$'+v.toFixed(5) }, grid:{color:'rgba(255,255,255,.04)'} },
        },
      },
    });
  } catch (err) {
    const s = document.getElementById('pdm-cost-summary');
    if (s) s.innerHTML = `<span style="color:#f85149">Error: ${esc(err.message)}</span>`;
  }
}

// ─── Data loading ─────────────────────────────────────────
async function loadInitialData() {
  try {
    const [sessRes, eventsRes] = await Promise.all([
      fetch(`${API}/api/sessions`),
      fetch(`${API}/api/events/recent?limit=150`),
    ]);
    const sessData   = await sessRes.json();
    const eventsData = await eventsRes.json();

    if (Array.isArray(sessData)) {
      sessData.forEach(s => { sessions[s.id] = s; });
    } else if (sessData?.error) {
      const list = document.getElementById('session-list');
      if (list) list.innerHTML = `<div class="empty-state" style="color:var(--red)">DB error: ${esc(sessData.error)}</div>`;
    }

    if (Array.isArray(eventsData)) {
      events = eventsData;
      events.forEach(e => { if (e.id) eventCache.set(String(e.id), e); });
    }

    refreshFeed();
    refreshSessions();
    refreshStats();
    refreshResumeStats();
  } catch (err) {
    console.warn('[dashboard] load error:', err.message);
    const list = document.getElementById('session-list');
    if (list) list.innerHTML = `<div class="empty-state" style="color:var(--red)">Error: ${esc(err.message)}</div>`;
  }
}

async function loadCosts() {
  try {
    const [r, rp] = await Promise.all([
      fetch(`${API}/api/costs`),
      fetch(`${API}/api/provider-costs`),
    ]);
    if (r.ok) {
      const data = await r.json();
      if (!data.error) { costData = data; refreshCostsPanel(costData); }
    }
    if (rp.ok) {
      const pd = await rp.json();
      if (!pd.error) refreshProviderCostsPanel(pd);
    }
  } catch (err) {
    console.warn('[costs] load error:', err.message);
    const todayCost = events.reduce((s, e) => s + (parseFloat(e.estimated_cost_usd) || 0), 0);
    const todaySessions = new Set(events.map(e => e.session_id)).size;
    refreshCostsPanel({
      today: { total_cost_usd: todayCost, sessions: todaySessions, events: events.length },
      week:  { total_cost_usd: todayCost, sessions: todaySessions },
      by_tool: [], by_hour: [],
    });
  }
}

const PROVIDER_LABELS = {
  deepseek: { name: 'DeepSeek', emoji: '🤖' },
  gemini:   { name: 'Gemini',   emoji: '💎' },
  grok:     { name: 'Grok/xAI', emoji: '𝕏'  },
  anthropic:      { name: 'Anthropic API', emoji: '🟠' },
  'anthropic-api':{ name: 'Anthropic API', emoji: '🟠' },
};

function fmtTokens(n) {
  if (!n) return '0';
  return n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(0)+'K' : String(n);
}

function refreshProviderCostsPanel(pd) {
  const todayEl  = document.getElementById('provider-costs-today');
  const monthEl  = document.getElementById('provider-costs-month');
  const totalEl  = document.getElementById('provider-costs-month-total');
  if (!todayEl && !monthEl) return;

  // Today by provider+model
  if (todayEl && pd.today) {
    if (!pd.today.length) {
      todayEl.innerHTML = '<div class="cost-row"><span class="label" style="color:var(--text-muted)">Sin cargos hoy</span><span class="val zero">$0.000000</span></div>';
    } else {
      todayEl.innerHTML = pd.today.map(r => {
        const lbl = PROVIDER_LABELS[r.provider] || { name: r.provider, emoji: '🔌' };
        const cost = parseFloat(r.cost_usd || 0);
        return `<div class="provider-badge">
          <span class="pname">${lbl.emoji} ${lbl.name} <small style="color:var(--text-muted)">${r.model||''}</small></span>
          <span class="ptokens">${fmtTokens(r.input_tokens)}in / ${fmtTokens(r.output_tokens)}out</span>
          <span class="pcost${cost===0?' zero':''}">${cost===0 ? '$0' : '$'+cost.toFixed(6)}</span>
        </div>`;
      }).join('');
    }
  }

  // Month totals by provider
  if (monthEl && pd.month) {
    const monthTotal = pd.month.reduce((s, r) => s + parseFloat(r.cost_usd||0), 0);
    if (totalEl) totalEl.textContent = `Total mes: $${monthTotal.toFixed(4)}`;
    if (!pd.month.length) {
      monthEl.innerHTML = '<div class="cost-row"><span class="label" style="color:var(--text-muted)">Sin cargos este mes</span><span class="val zero">$0.000000</span></div>';
    } else {
      monthEl.innerHTML = pd.month.map(r => {
        const lbl = PROVIDER_LABELS[r.provider] || { name: r.provider, emoji: '🔌' };
        const cost = parseFloat(r.cost_usd || 0);
        return `<div class="provider-badge">
          <span class="pname">${lbl.emoji} ${lbl.name}</span>
          <span class="ptokens">${fmtTokens(r.input_tokens)}in / ${fmtTokens(r.output_tokens)}out</span>
          <span class="pcost${cost===0?' zero':''}">${cost===0 ? '$0' : '$'+cost.toFixed(4)}</span>
        </div>`;
      }).join('');
    }
  }
}

async function loadProviders() {
  try {
    const r = await fetch(`${API}/api/providers`);
    providers = await r.json();
    refreshProviderList(providers);
  } catch (err) {
    console.warn('[providers] load error:', err.message);
  }
}

// ─── Socket.io ────────────────────────────────────────────
function connectSocket() {
  const socket = io(window.location.origin);
  const dot    = document.getElementById('conn-dot');

  socket.on('connect',    () => dot?.classList.add('connected'));
  socket.on('disconnect', () => dot?.classList.remove('connected'));

  socket.on('event:new', ev => {
    events.push(ev);
    if (ev.id) eventCache.set(String(ev.id), ev);
    if (events.length > 200) events.shift();

    if (ev.session_id && !sessions[ev.session_id]) {
      sessions[ev.session_id] = {
        id:              ev.session_id,
        started_at:      ev.timestamp,
        agent_user:      ev.agent_user,
        working_dir:     ev.working_dir,
        project_name:    ev.project_name,
        api_provider:    ev.api_provider || 'anthropic',
        tool_call_count: 0,
        total_cost_usd:  0,
        is_active:       1,
      };
    }

    if (ev.session_id && sessions[ev.session_id] && ev.event_type === 'post_tool') {
      const s = sessions[ev.session_id];
      s.tool_call_count = (s.tool_call_count || 0) + 1;
      s.total_cost_usd  = (parseFloat(s.total_cost_usd)||0) + (parseFloat(ev.estimated_cost_usd)||0);
    }

    refreshFeed();
    refreshSessions();
    refreshStats();
  });

  socket.on('session:ended', s => {
    sessions[s.id] = { ...sessions[s.id], ...s };
    refreshSessions();
    refreshStats();
  });

  socket.on('screenshot:new', shot => {
    screenshots.unshift(shot);
    if (screenshots.length > 200) screenshots.pop();
    const panel = document.getElementById('screenshots-panel');
    if (panel && panel.classList.contains('visible')) {
      renderScreenshotGrid(screenshots);
      populateShotFilter(screenshots);
    }
    // Update count badge even when hidden
    const counter = document.getElementById('shot-count');
    if (counter) counter.textContent = screenshots.length + ' fotos';
  });

  socket.on('dispatch:new', d => {
    dispatches.unshift(d);
    if (dispatches.length > 200) dispatches.pop();
    const panel = document.getElementById('agents-panel');
    if (panel && panel.classList.contains('visible')) refreshDispatches();
    // Update badge count even when panel is hidden
    const counter = document.getElementById('agents-count');
    const pending = dispatches.filter(x => x.status === 'pending' || x.status === 'dispatched').length;
    if (counter) counter.textContent = `${dispatches.length} tareas · ${pending} activas`;
  });

  socket.on('dispatch:complete', update => {
    const idx = dispatches.findIndex(d => d.id === update.id);
    if (idx !== -1) {
      dispatches[idx] = { ...dispatches[idx], ...update };
    }
    const panel = document.getElementById('agents-panel');
    if (panel && panel.classList.contains('visible')) refreshDispatches();
    const counter = document.getElementById('agents-count');
    const pending = dispatches.filter(x => x.status === 'pending' || x.status === 'dispatched').length;
    if (counter) counter.textContent = `${dispatches.length} tareas · ${pending} activas`;
  });

  socket.on('alert:new', alert => {
    alerts.unshift(alert);
    renderAlerts();
    updateAlertsBadge();
  });

  socket.on('alert:resolved', ({ id }) => {
    const a = alerts.find(x => x.id === id);
    if (a) { a.resolved = 1; renderAlerts(); updateAlertsBadge(); }
  });

  // Reload provider costs panel on new real cost event
  socket.on('provider_cost', () => {
    if (document.getElementById('provider-costs-today')) {
      fetch(`${API}/api/provider-costs`).then(r => r.json()).then(pd => {
        if (!pd.error) refreshProviderCostsPanel(pd);
      }).catch(() => {});
    }
  });
}

// ─── Alerts ───────────────────────────────────────────────
const ALERT_SEVERITY = {
  critical: { cls: 'alert-critical', icon: '🚨' },
  warning:  { cls: 'alert-warning',  icon: '⚠️' },
  info:     { cls: 'alert-info',     icon: 'ℹ️' },
};
const ALERT_TYPE_LABEL = {
  commit_dangerous:   '🔑 Commit peligroso',
  commit_massive:     '📦 Commit masivo',
  session_low_yield:  '🐌 Sesión improductiva',
  deploy_verify_fail: '🌐 Deploy falló verificación',
};

async function loadAlerts() {
  const showResolved = document.getElementById('alerts-show-resolved')?.checked;
  try {
    const res = await fetch(`${API}/api/alerts?limit=100&resolved=${showResolved ? 'true' : 'false'}`);
    alerts = await res.json();
    renderAlerts();
    updateAlertsBadge();
  } catch (_) {}
}

function updateAlertsBadge() {
  const unresolved = alerts.filter(a => !a.resolved);
  const crit = unresolved.filter(a => a.severity === 'critical').length;
  const tab  = document.getElementById('tab-alerts');
  const cnt  = document.getElementById('alerts-count');
  if (tab) {
    tab.style.color = crit > 0 ? 'var(--red)' : unresolved.length > 0 ? 'var(--yellow)' : '';
    tab.textContent = `Alertas${unresolved.length > 0 ? ` (${unresolved.length})` : ''}`;
  }
  if (cnt) cnt.textContent = `${unresolved.length} activas`;
}

function renderAlerts() {
  const list = document.getElementById('alerts-list');
  if (!list) return;
  const showResolved = document.getElementById('alerts-show-resolved')?.checked;
  const visible = showResolved ? alerts : alerts.filter(a => !a.resolved);
  if (!visible.length) {
    list.innerHTML = `<div class="empty-state">Sin alertas activas ✅</div>`;
    return;
  }
  list.innerHTML = visible.map(a => {
    const sev   = ALERT_SEVERITY[a.severity] || ALERT_SEVERITY.warning;
    const label = ALERT_TYPE_LABEL[a.alert_type] || a.alert_type;
    const ts    = a.created_at ? new Date(a.created_at).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' }) : '';
    const fixed = a.auto_fixed ? ' <span class="badge-fixed">auto-fixed</span>' : '';
    const resolvedStyle = a.resolved ? 'opacity:0.45;' : '';
    return `<div class="alert-row ${sev.cls}" style="${resolvedStyle}" data-alert-id="${a.id}">
      <div class="alert-header">
        <span class="alert-icon">${sev.icon}</span>
        <span class="alert-type">${label}</span>
        ${a.project_id ? `<span class="alert-project">${esc(a.project_id)}</span>` : ''}
        <span class="alert-ts">${ts}</span>
        ${fixed}
      </div>
      <div class="alert-title">${esc(a.title)}</div>
      ${a.details ? `<div class="alert-details">${esc(a.details.slice(0, 200))}</div>` : ''}
      ${!a.resolved ? `<button class="btn-sm btn-resolve" onclick="resolveAlert(${a.id})">Resolver</button>` : '<span class="alert-resolved-tag">resuelto</span>'}
    </div>`;
  }).join('');
}

async function resolveAlert(id) {
  await fetch(`${API}/api/alerts/${id}/resolve`, { method: 'PATCH' });
  const a = alerts.find(x => x.id === id);
  if (a) { a.resolved = 1; renderAlerts(); updateAlertsBadge(); }
}

// ─── Conversaciones ───────────────────────────────────────
let convCurrentUserId = null;

async function loadConversaciones() {
  try {
    const r = await fetch(`${API}/api/conversations`);
    const { users, totals } = await r.json();

    const headerCost = document.getElementById('conv-header-cost');
    if (headerCost && totals) {
      const hitRate = totals.total_tokens_in > 0
        ? Math.round(totals.total_cache_read / totals.total_tokens_in * 100) : 0;
      const cacheNote = hitRate > 0 ? ` · ${hitRate}% cache` : '';
      headerCost.textContent = `$${Number(totals.total_cost_usd || 0).toFixed(4)} total · ${totals.unique_users || 0} usuarios${cacheNote}`;
    }

    renderConvUsers(users || []);
  } catch (err) {
    console.warn('[conv] load error:', err.message);
  }
}

function renderConvUsers(users) {
  const list = document.getElementById('conv-user-list');
  if (!list) return;

  if (!users.length) {
    list.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center">Sin conversaciones aún</div>';
    return;
  }

  list.innerHTML = users.map(u => {
    const last    = u.last_activity ? timeAgo(u.last_activity) : '—';
    const cost    = Number(u.total_cost_usd || 0).toFixed(4);
    const hitRate = u.total_tokens_in > 0
      ? Math.round(u.total_cache_read / u.total_tokens_in * 100) : 0;
    const cacheBadge = hitRate > 0
      ? `<span class="conv-cache-badge">${hitRate}% cache</span>` : '';
    return `<div class="conv-user-item" onclick="convLoadMessages('${u.telegram_user_id}','${escHtml(u.username)}')">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="conv-user-name">@${escHtml(u.username)}</div>
        <a href="https://t.me/iaVilarBot" target="_blank" class="conv-user-tg" onclick="event.stopPropagation()" title="Abrir en Telegram">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.026 9.54c-.148.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.48 14.49l-2.95-.924c-.642-.2-.654-.642.136-.953l11.532-4.448c.535-.194 1.003.13.364.083z"/></svg>
          chat
        </a>
      </div>
      <div class="conv-user-meta">
        <span>${u.user_turns || 0} turnos</span>
        <span class="conv-cost">$${cost}</span>
        ${cacheBadge}
        <span class="conv-time">${last}</span>
      </div>
    </div>`;
  }).join('');
}

async function convLoadMessages(userId, username) {
  convCurrentUserId = userId;
  document.getElementById('conv-user-name').textContent = `@${username}`;
  document.getElementById('conv-user-list').style.display = 'none';
  document.getElementById('conv-messages').style.display  = '';

  const msgList = document.getElementById('conv-msg-list');
  msgList.innerHTML = '<div style="padding:12px;color:var(--text-muted)">Cargando…</div>';

  try {
    const r = await fetch(`${API}/api/conversations/${userId}/messages?limit=50`);
    const { messages, stats } = await r.json();

    const costEl = document.getElementById('conv-user-cost');
    if (costEl && stats) {
      const hitRate = stats.total_tokens_in > 0
        ? Math.round(stats.total_cache_read / stats.total_tokens_in * 100) : 0;
      const cacheNote = hitRate > 0 ? ` · ${hitRate}% cache` : '';
      costEl.textContent = `$${Number(stats.total_cost_usd || 0).toFixed(4)}${cacheNote}`;
    }

    if (!messages || !messages.length) {
      msgList.innerHTML = '<div style="padding:12px;color:var(--text-muted)">Sin mensajes</div>';
      return;
    }

    msgList.innerHTML = messages.map(m => {
      const isUser   = m.role === 'user';
      const preview   = escHtml((m.content || '').slice(0, 400));
      const ts        = m.created_at ? new Date(m.created_at).toLocaleString('es-MX', { hour12: false }) : '';
      const costBit   = m.cost_usd > 0 ? `<span class="conv-cost">$${Number(m.cost_usd).toFixed(5)}</span>` : '';
      const modelBit  = m.model ? `<span style="color:var(--purple)">${escHtml(m.model)}</span>` : '';
      const cacheRead = m.cache_read_tokens || 0;
      const cachePct  = m.tokens_in > 0 ? Math.round(cacheRead / m.tokens_in * 100) : 0;
      const cacheBit  = cacheRead > 0
        ? `<span class="conv-cache-badge">${Math.round(cacheRead/1000)}K✓ ${cachePct}%</span>` : '';
      return `<div class="conv-msg-item conv-msg-${m.role}">
        <div class="conv-msg-meta">${isUser ? '👤 tú' : '🤖 claude'} ${modelBit} ${costBit} ${cacheBit} <span class="conv-time">${ts}</span></div>
        <div class="conv-msg-text">${preview}${(m.content || '').length > 400 ? '…' : ''}</div>
      </div>`;
    }).join('');
  } catch (err) {
    msgList.innerHTML = `<div style="padding:12px;color:var(--red)">Error: ${err.message}</div>`;
  }
}

function convShowUsers() {
  document.getElementById('conv-user-list').style.display = '';
  document.getElementById('conv-messages').style.display  = 'none';
  convCurrentUserId = null;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Platform (Anthropic Admin API spend) ─────────────────
let platformHourlyChart = null;

async function loadProxyQuota() {
  const el = document.getElementById('proxy-quota-widget');
  if (!el) return;
  try {
    const s = await fetch(`${API}/api/proxy-usage/stats`).then(r => r.json());
    if (s.error) throw new Error(s.error);

    const fmt = n => n >= 1_000_000 ? (n/1_000_000).toFixed(2)+'M' : n >= 1_000 ? (n/1_000).toFixed(1)+'K' : n;
    const pct  = s.pct_used;
    const barColor = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--warn,#f59e0b)' : 'var(--green)';
    const weekTok  = s.week.total_tokens;
    const todayTok = s.today.total_tokens;
    const limit    = s.limit_weekly;

    el.innerHTML = `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
          <span style="color:var(--text)"><strong>${fmt(weekTok)}</strong> tokens esta semana</span>
          <span style="color:var(--text-muted)">límite: ${fmt(limit)}</span>
        </div>
        <div style="background:var(--border);border-radius:6px;height:8px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${barColor};border-radius:6px;transition:width .4s"></div>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:3px">${pct}% usado · Reinicia el domingo</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px">
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px">Hoy</div>
          <div style="font-size:16px;font-weight:700;color:var(--accent)">${fmt(todayTok)}</div>
          <div style="font-size:9px;color:var(--text-muted)">tokens totales</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px">
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px">Costo equivalente ahorrado</div>
          <div style="font-size:16px;font-weight:700;color:var(--green)">$${(weekTok / 1_000_000 * 3).toFixed(3)}</div>
          <div style="font-size:9px;color:var(--text-muted)">vs Sonnet 4.6 directo</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="font-size:10px;color:var(--text-muted)">
          <th style="text-align:left;padding:2px 0">Fuente</th>
          <th style="text-align:right;padding:2px 0">Hoy</th>
          <th style="text-align:right;padding:2px 0">Esta semana</th>
        </tr></thead>
        <tbody>
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:4px 0;color:var(--text)">🤖 Bot /claude (proxy)</td>
            <td style="text-align:right;color:var(--text-muted)">${s.today.bot_proxy.calls} llamadas · ${fmt(s.today.bot_proxy.tokens_in + s.today.bot_proxy.tokens_out)} tok</td>
            <td style="text-align:right;color:var(--text-muted)">${s.week.bot_proxy.calls} · ${fmt(s.week.bot_proxy.tokens_in + s.week.bot_proxy.tokens_out)} tok</td>
          </tr>
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:4px 0;color:var(--text)">⚙️ Relay OAuth (tareas)</td>
            <td style="text-align:right;color:var(--text-muted)">${s.today.relay_oauth.sessions} sesiones · ${fmt(s.today.relay_oauth.tokens_in + s.today.relay_oauth.tokens_out)} tok</td>
            <td style="text-align:right;color:var(--text-muted)">${s.week.relay_oauth.sessions} · ${fmt(s.week.relay_oauth.tokens_in + s.week.relay_oauth.tokens_out)} tok</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
        <span style="font-size:10px;color:var(--text-muted)">Límite semanal configurado:</span>
        <input id="proxy-limit-input" type="number" value="${limit}" min="100000" step="100000"
          style="width:100px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;background:var(--input-bg);color:var(--text);font-size:11px;font-family:var(--font)">
        <button class="btn-sm" style="font-size:10px" onclick="saveProxyLimit()">Guardar</button>
      </div>
      <div style="font-size:9px;color:var(--text-muted);margin-top:4px">
        ⚠️ Tokens de bot son estimados (longitud/4). Relay usa conteo real del stream-json.
      </div>`;
  } catch (e) {
    if (el) el.innerHTML = `<p style="font-size:11px;color:var(--text-muted)">Error cargando quota: ${escHtml(e.message)}</p>`;
  }
}

async function saveProxyLimit() {
  const v = parseInt(document.getElementById('proxy-limit-input')?.value);
  if (!v || v < 0) return;
  try {
    await fetch(`${API}/api/proxy-usage/limit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: v }),
    });
    loadProxyQuota();
  } catch (e) { alert('Error: ' + e.message); }
}

async function loadPlatform() {
  try {
    const [summary, hourly, accounts] = await Promise.all([
      fetch(`${API}/api/platform/summary`).then(r => r.json()),
      fetch(`${API}/api/platform/hourly`).then(r => r.json()),
      fetch(`${API}/api/platform/accounts`).then(r => r.json()).catch(() => null),
    ]);

    if (summary.error) throw new Error(summary.error);

    // Pills
    document.getElementById('pp-hour').textContent  = `$${Number(summary.hour?.cost  || 0).toFixed(4)}`;
    document.getElementById('pp-today').textContent  = `$${Number(summary.today?.cost || 0).toFixed(4)}`;
    document.getElementById('pp-month').textContent = `$${Number(summary.month?.cost || 0).toFixed(4)}`;

    // Color today pill red if > $10
    const todayCost = parseFloat(summary.today?.cost || 0);
    document.getElementById('pp-today').style.color = todayCost > 10 ? 'var(--red)' : todayCost > 5 ? 'var(--orange, #f59e0b)' : '';

    // Last fetch
    if (summary.last_fetch) {
      document.getElementById('platform-last-fetch').textContent =
        'Actualizado: ' + new Date(summary.last_fetch).toLocaleString('es-MX', { hour12: false });
    }

    // Alert banner
    const banner = document.getElementById('platform-alerts-banner');
    if (summary.alerts?.length) {
      banner.style.display = '';
      banner.innerHTML = summary.alerts.map(a =>
        `<div class="platform-alert-row">
           🚨 Presupuesto <b>${a.period}</b> superado: <b>$${Number(a.actual_usd).toFixed(4)}</b>
           (límite $${Number(a.threshold_usd).toFixed(2)}) — ${escHtml(a.model_breakdown || '')}
           <button class="btn-sm" onclick="ackPlatformAlert(${a.id})">OK</button>
         </div>`
      ).join('');
    } else {
      banner.style.display = 'none';
    }

    // Hourly chart
    if (Array.isArray(hourly) && hourly.length) {
      const labels = hourly.map(r => r.hour_bucket?.slice(11, 16) || '');
      const costs  = hourly.map(r => parseFloat(r.cost || 0));

      const ctx = document.getElementById('platform-hourly-chart');
      if (platformHourlyChart) { platformHourlyChart.destroy(); platformHourlyChart = null; }
      platformHourlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'USD',
            data: costs,
            backgroundColor: costs.map(c => c > 5 ? '#ef444480' : c > 1 ? '#f59e0b80' : '#10b98180'),
            borderColor:     costs.map(c => c > 5 ? '#ef4444'   : c > 1 ? '#f59e0b'   : '#10b981'),
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#9ca3af', font: { size: 9 } }, grid: { color: '#1f2937' } },
            y: { ticks: { color: '#9ca3af', font: { size: 9 }, callback: v => `$${v.toFixed(2)}` }, grid: { color: '#1f2937' } },
          },
        },
      });
    }

    // By model
    const modelDiv = document.getElementById('platform-by-model');
    if (summary.by_model?.length) {
      const maxCost = Math.max(...summary.by_model.map(r => parseFloat(r.cost)));
      modelDiv.innerHTML = summary.by_model.map(r => {
        const c = parseFloat(r.cost);
        const pct = maxCost > 0 ? (c / maxCost * 100).toFixed(0) : 0;
        const model = (r.model || 'unknown').replace('claude-', '').replace(/-\d{8}$/, '');
        return `<div class="cost-row" style="flex-direction:column;align-items:stretch;gap:2px">
          <div style="display:flex;justify-content:space-between">
            <span class="label">${escHtml(model)}</span>
            <span class="val" style="color:${c>5?'var(--red)':c>1?'var(--orange,#f59e0b)':''}">$${c.toFixed(4)}</span>
          </div>
          <div style="height:4px;background:var(--bg3);border-radius:2px">
            <div style="height:4px;width:${pct}%;background:var(--accent);border-radius:2px"></div>
          </div>
        </div>`;
      }).join('');
    } else {
      modelDiv.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:4px">Sin datos de modelos hoy</div>';
    }

    // Budgets
    const budgetDiv = document.getElementById('platform-budgets');
    if (summary.budgets?.length) {
      budgetDiv.innerHTML = summary.budgets.map(b =>
        `<div class="cost-row">
           <span class="label">${b.period}</span>
           <div style="display:flex;align-items:center;gap:6px">
             <input type="number" step="0.01" min="0" value="${Number(b.threshold_usd).toFixed(2)}"
               style="width:70px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:2px 4px;font-size:11px"
               onchange="saveBudget('${b.period}', this.value)">
             <span style="color:var(--text-muted);font-size:10px">USD</span>
           </div>
         </div>`
      ).join('');
    }

    // Multi-account summary
    renderPlatformAccounts(accounts);

    document.getElementById('platform-error').style.display = 'none';

    // Kill-switch banner
    try {
      const ks = await fetch(`${API}/api/platform/kill-check`).then(r => r.json());
      const kb = document.getElementById('platform-kill-banner');
      if (ks.killed) {
        kb.style.display = '';
        kb.innerHTML = `🛑 <b>Sistema PAUSADO</b> — ${escHtml(ks.reason || '')}
          &nbsp;<button onclick="resumeRelay()" class="btn-sm" style="margin-left:8px">▶ Reanudar</button>`;
      } else { kb.style.display = 'none'; }
    } catch (_) {}
  } catch (err) {
    const errDiv = document.getElementById('platform-error');
    errDiv.style.display = '';
    errDiv.textContent = `Error: ${err.message}`;
  }
}

async function resumeRelay() {
  await Promise.all([
    fetch(`${API}/api/platform/resume`,   { method: 'POST' }),
    fetch(`${API}/api/apiAdmin/resume`,   { method: 'POST' }),
  ]);
  loadPlatform();
  loadApiAdmin();
}

async function refreshPlatform() {
  const btn = document.querySelector('#platform-panel .btn-sm');
  if (btn) { btn.textContent = '…'; btn.disabled = true; }
  try {
    const r = await fetch(`${API}/api/platform/refresh`, { method: 'POST' });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    await loadPlatform();
  } catch (err) {
    const errDiv = document.getElementById('platform-error');
    errDiv.style.display = '';
    errDiv.textContent = `Error sync: ${err.message}`;
  } finally {
    if (btn) { btn.textContent = '↻ Sync'; btn.disabled = false; }
  }
}

async function ackPlatformAlert(id) {
  await fetch(`${API}/api/platform/alerts/${id}/ack`, { method: 'POST' });
  loadPlatform();
}

async function saveBudget(period, value) {
  await fetch(`${API}/api/platform/budget`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ period, threshold_usd: parseFloat(value) }),
  });
}

// ─── API Admin Dashboard ──────────────────────────────────
function provColor(p) { return PROVIDER_COLORS[p] || PROVIDER_COLORS.default; }

let apiDonutChart, apiBarChart, apiLineChart;

async function loadApiAdmin() {
  const days = document.getElementById('api-admin-range')?.value || 30;
  try {
    const [summary, ts, byProj, byKey, killStatus, killAlerts, projBudgets, historical] = await Promise.all([
      fetch(`${API}/api/apiAdmin/summary`).then(r => r.json()),
      fetch(`${API}/api/apiAdmin/timeseries?days=${days}`).then(r => r.json()),
      fetch(`${API}/api/apiAdmin/byProject?days=${days}`).then(r => r.json()),
      fetch(`${API}/api/apiAdmin/byKey`).then(r => r.json()),
      fetch(`${API}/api/apiAdmin/killStatus`).then(r => r.json()),
      fetch(`${API}/api/apiAdmin/alerts`).then(r => r.json()),
      fetch(`${API}/api/apiAdmin/projectBudgets`).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/apiAdmin/historical`).then(r => r.json()).catch(() => null),
    ]);

    renderApiAdminPills(summary);
    renderApiKillBanner(killStatus);
    renderApiDonut(summary.today?.by_provider || []);
    renderApiBar(byProj);
    renderApiLine(ts);
    renderApiByKey(byKey);
    renderApiProjectBudgets(projBudgets);
    renderApiHistorical(historical);
    renderApiThresholds(killStatus);
    renderApiKillAlerts(killAlerts);
  } catch (e) {
    console.error('loadApiAdmin:', e);
  }
}

function renderApiAdminPills(summary) {
  const el = document.getElementById('api-admin-pills');
  if (!el) return;
  const fmt = v => `$${Number(v || 0).toFixed(4)}`;
  el.innerHTML = `
    <div class="platform-pill"><div class="pp-label">Hoy</div>
      <div class="pp-value ${(summary.today?.cost||0)>5?'warn':''}">${fmt(summary.today?.cost)}</div></div>
    <div class="platform-pill"><div class="pp-label">Semana</div>
      <div class="pp-value">${fmt(summary.week?.cost)}</div></div>
    <div class="platform-pill"><div class="pp-label">Mes</div>
      <div class="pp-value">${fmt(summary.month?.cost)}</div></div>
    <div class="platform-pill"><div class="pp-label">Real Anthropic</div>
      <div class="pp-value" style="color:var(--accent)">${fmt(summary.anthropic_real?.cost)}</div></div>`;
}

function renderApiKillBanner(ks) {
  const el = document.getElementById('api-kill-banner');
  if (!el) return;
  if (ks?.killed) {
    el.style.display = '';
    el.innerHTML = `🛑 <b>Sistema PAUSADO</b> — ${escHtml(ks.kill_reason || '')}
      &nbsp;<button onclick="resumeRelay()" class="btn-sm" style="margin-left:8px">▶ Reanudar</button>`;
  } else { el.style.display = 'none'; }
}

function renderApiDonut(byProvider) {
  if (apiDonutChart) { apiDonutChart.destroy(); apiDonutChart = null; }
  const ctx = document.getElementById('api-donut-chart');
  if (!ctx || !byProvider.length) return;
  apiDonutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: byProvider.map(d => d.provider),
      datasets: [{ data: byProvider.map(d => parseFloat(d.cost)),
        backgroundColor: byProvider.map(d => provColor(d.provider)),
        borderWidth: 0, hoverOffset: 6 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { position: 'right', labels: { color: '#e6edf3', font: { size: 10 }, boxWidth: 10 } },
        tooltip: { callbacks: { label: c => ` $${c.parsed.toFixed(4)}` } },
      },
    },
  });
}

function renderApiBar(rows) {
  if (apiBarChart) { apiBarChart.destroy(); apiBarChart = null; }
  const ctx = document.getElementById('api-bar-chart');
  if (!ctx || !rows.length) return;
  const projects  = [...new Set(rows.map(r => r.project_name || '(sin proyecto)'))].slice(0, 10);
  const providers = [...new Set(rows.map(r => r.provider))];
  const datasets  = providers.map(p => ({
    label: p,
    data: projects.map(proj => {
      const found = rows.find(r => r.project_name === proj && r.provider === p);
      return found ? parseFloat(found.cost) : 0;
    }),
    backgroundColor: provColor(p) + 'cc',
    borderColor: provColor(p),
    borderWidth: 1,
  }));
  apiBarChart = new Chart(ctx, {
    type: 'bar', data: { labels: projects, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: '#8b949e', font: { size: 9 }, maxRotation: 30 }, grid: { color: '#21262d' } },
        y: { stacked: true, ticks: { color: '#8b949e', font: { size: 9 }, callback: v => `$${v.toFixed(2)}` }, grid: { color: '#21262d' } },
      },
      plugins: { legend: { labels: { color: '#e6edf3', font: { size: 10 } } } },
    },
  });
}

function renderApiLine(rows) {
  if (apiLineChart) { apiLineChart.destroy(); apiLineChart = null; }
  const ctx = document.getElementById('api-line-chart');
  if (!ctx || !rows.length) return;
  const providers = [...new Set(rows.map(r => r.provider))];
  const dates     = [...new Set(rows.map(r => {
    const d = r.date_bucket;
    return typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  }))].sort();
  const datasets = providers.map(p => ({
    label: p,
    data: dates.map(d => {
      const found = rows.find(r => {
        const rd = typeof r.date_bucket === 'string' ? r.date_bucket.slice(0,10) : new Date(r.date_bucket).toISOString().slice(0,10);
        return rd === d && r.provider === p;
      });
      return found ? parseFloat(found.cost) : 0;
    }),
    borderColor: provColor(p), backgroundColor: provColor(p) + '22',
    tension: 0.3, fill: false, pointRadius: 2,
  }));
  apiLineChart = new Chart(ctx, {
    type: 'line', data: { labels: dates, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#8b949e', font: { size: 9 }, maxRotation: 30 }, grid: { color: '#21262d' } },
        y: { ticks: { color: '#8b949e', font: { size: 9 }, callback: v => `$${v.toFixed(3)}` }, grid: { color: '#21262d' } },
      },
      plugins: { legend: { labels: { color: '#e6edf3', font: { size: 10 } } } },
    },
  });
}

function renderApiByKey(rows) {
  const el = document.getElementById('api-by-key');
  if (!el) return;
  if (!rows.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:4px">Sin keys registradas</div>'; return; }
  el.innerHTML = rows.map(r => {
    const pct = r.monthly_limit_usd > 0 ? Math.min(100, r.cost_month / r.monthly_limit_usd * 100) : 0;
    const fillClass = pct > 90 ? 'over' : pct > 70 ? 'warn' : '';
    return `<div class="api-key-row">
      <span class="provider-badge provider-${r.provider}">${r.provider}</span>
      <span class="api-key-badge">${escHtml(r.api_key_masked || '—')}</span>
      <span style="color:var(--text-muted);font-size:10px;flex:1;margin:0 6px">${escHtml(r.project_name || '')}</span>
      <div style="text-align:right">
        <div style="color:var(--yellow);font-size:11px">$${Number(r.cost_month||0).toFixed(4)}</div>
        ${r.monthly_limit_usd > 0 ? `
        <div class="api-limit-bar" style="width:80px;margin-left:auto">
          <div class="api-limit-fill ${fillClass}" style="width:${pct.toFixed(0)}%"></div>
        </div>
        <div style="font-size:9px;color:var(--text-muted)">${pct.toFixed(0)}% de $${Number(r.monthly_limit_usd).toFixed(0)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderApiThresholds(ks) {
  const el = document.getElementById('api-thresholds');
  if (!el || !ks?.provider_status) return;
  el.innerHTML = ks.provider_status.map(p => {
    const pct = parseFloat(p.pct);
    const fillClass = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
    return `<div class="budget-row">
      <span class="b-period" style="width:72px">${p.provider}</span>
      <div class="api-limit-bar" style="flex:1;height:4px;margin:0 8px">
        <div class="api-limit-fill ${fillClass}" style="width:${Math.min(100,pct).toFixed(0)}%"></div>
      </div>
      <span style="font-size:10px;color:${pct>=100?'var(--red)':pct>=80?'var(--orange)':'var(--text-muted)'}">
        $${p.current_usd}/$${p.threshold_usd}</span>
      <input type="number" step="0.5" min="0" value="${p.threshold_usd}"
        class="b-input" style="width:60px;margin-left:6px"
        onchange="saveProviderThreshold('${p.provider}',this.value)">
      <button class="b-save" onclick="saveProviderThreshold('${p.provider}',this.previousElementSibling.value)">✓</button>
    </div>`;
  }).join('');
}

function renderApiKillAlerts(alerts) {
  const el = document.getElementById('api-kill-alerts');
  if (!el) return;
  if (!alerts?.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:4px">Sin alertas activas</div>'; return; }
  el.innerHTML = alerts.map(a =>
    `<div class="platform-alert-row">
       <span class="pa-text">⚠️ <b>${escHtml(a.provider)}</b> — $${Number(a.actual_usd).toFixed(4)} (límite $${Number(a.threshold_usd).toFixed(2)})</span>
       <button class="pa-ack" onclick="ackKillAlert(${a.id})">OK</button>
     </div>`
  ).join('');
}

async function saveProviderThreshold(provider, value) {
  await fetch(`${API}/api/apiAdmin/threshold`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, threshold_usd: parseFloat(value), kill_enabled: 1 }),
  });
  loadApiAdmin();
}

async function ackKillAlert(id) {
  await fetch(`${API}/api/apiAdmin/alerts/${id}/ack`, { method: 'POST' });
  loadApiAdmin();
}

async function snapshotNow() {
  await fetch(`${API}/api/apiAdmin/snapshot`, { method: 'POST' });
  loadApiAdmin();
}

// ─── Platform accounts ────────────────────────────────────
function renderPlatformAccounts(data) {
  const el = document.getElementById('platform-accounts');
  if (!el) return;
  if (!data?.accounts?.length) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:4px">Configure las Admin API keys en relay/.env para ver el desglose por cuenta</div>';
    return;
  }
  const grandTotal = data.grand_total_real || 0;
  el.innerHTML = data.accounts.map(acc => {
    const pct = grandTotal > 0 ? Math.min(100, acc.cost_month / Math.max(grandTotal, 1) * 100) : 0;
    const hasKey = acc.has_key;
    const statusDot = hasKey
      ? '<span style="color:var(--green);font-size:9px">●</span>'
      : '<span style="color:var(--red);font-size:9px" title="Key no configurada">●</span>';
    return `<div class="cost-row" style="flex-direction:column;align-items:stretch;gap:3px;padding:6px 14px;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:5px">
          ${statusDot}
          <span style="font-size:11px;color:var(--text)">${escHtml(acc.email)}</span>
          ${acc.notes ? `<span style="font-size:9px;color:var(--text-muted)">(${escHtml(acc.notes)})</span>` : ''}
        </div>
        <div style="text-align:right">
          <span style="font-size:12px;font-weight:600;color:${acc.cost_month>50?'var(--red)':acc.cost_month>20?'var(--orange)':'var(--green)'}">$${acc.cost_month.toFixed(2)}</span>
          <span style="font-size:9px;color:var(--text-muted)"> este mes</span>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-muted)">
        <span>Total histórico: <b style="color:var(--text)">$${(acc.cost_total||0).toFixed(2)}</b></span>
        <span>Corte: día ${acc.billing_day} | ${escHtml(acc.billing_start)}</span>
      </div>
    </div>`;
  }).join('') + `<div style="padding:6px 14px;font-size:11px;border-top:1px solid var(--border);display:flex;justify-content:space-between">
    <span style="color:var(--text-muted)">Total real histórico (todas las cuentas)</span>
    <span style="font-weight:700;color:var(--accent)">$${grandTotal.toFixed(2)}</span>
  </div>`;
}

// ─── API Admin — project budgets ──────────────────────────
function renderApiProjectBudgets(data) {
  const el = document.getElementById('api-project-budgets');
  if (!el) return;
  if (!data?.projects?.length) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:4px">Sin datos de proyectos este mes</div>';
    return;
  }
  el.innerHTML = data.projects.map(p => {
    const pct = p.pct;
    const fillClass = pct >= 100 ? 'over' : pct >= 75 ? 'warn' : '';
    const killBadge = p.killed
      ? '<span style="font-size:9px;color:var(--red);margin-left:4px">PAUSADO</span>'
      : (p.over_budget ? '<span style="font-size:9px;color:var(--orange);margin-left:4px">LÍMITE</span>' : '');
    return `<div style="padding:6px 14px;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-size:11px;color:var(--text)">${escHtml(p.project_name)}</span>
          ${killBadge}
          ${p.unconfigured ? '<span style="font-size:9px;color:var(--text-muted)">(sin config)</span>' : ''}
        </div>
        <div style="text-align:right;font-size:10px">
          <span style="color:${pct>=100?'var(--red)':pct>=75?'var(--orange)':'var(--text)'}">$${p.cost_month.toFixed(3)}</span>
          <span style="color:var(--text-muted)"> / $${p.budget_usd.toFixed(0)}</span>
        </div>
      </div>
      <div class="api-limit-bar">
        <div class="api-limit-fill ${fillClass}" style="width:${pct.toFixed(0)}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:2px;font-size:9px;color:var(--text-muted)">
        <span>${pct.toFixed(1)}% del presupuesto</span>
        ${p.killed
          ? `<button class="btn-sm" style="font-size:9px;padding:1px 6px" onclick="resumeProject('${escHtml(p.project_name)}')">▶ Reanudar</button>`
          : `<span>${p.events_month} eventos</span>`}
      </div>
    </div>`;
  }).join('') + `<div style="padding:6px 14px;font-size:10px;color:var(--text-muted)">
    Ciclo: desde ${escHtml(data.billing_start || '')} · Límite: $100/proyecto/mes
  </div>`;
}

async function resumeProject(projectName) {
  await fetch(`${API}/api/apiAdmin/projectBudgets/${encodeURIComponent(projectName)}/resume`, { method: 'POST' });
  loadApiAdmin();
}

// ─── API Admin — historical ───────────────────────────────
function renderApiHistorical(data) {
  const el = document.getElementById('api-historical');
  if (!el) return;
  if (!data) { el.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:4px">Cargando…</div>'; return; }
  const real = data.real || {};
  const est  = data.estimated || {};
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px 14px">
      <div style="background:var(--bg3);border-radius:6px;padding:8px">
        <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px">Real Anthropic (Admin API)</div>
        <div style="font-size:18px;font-weight:700;color:var(--green)">$${(real.total||0).toFixed(2)}</div>
        <div style="font-size:9px;color:var(--text-muted)">todas las cuentas</div>
      </div>
      <div style="background:var(--bg3);border-radius:6px;padding:8px">
        <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px">Estimado (todos los providers)</div>
        <div style="font-size:18px;font-weight:700;color:var(--accent)">$${(est.total||0).toFixed(2)}</div>
        <div style="font-size:9px;color:var(--text-muted)">${est.days_active||0} días de actividad</div>
      </div>
    </div>
    ${real.by_account?.length ? `
    <div style="padding:4px 14px 8px">
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Por cuenta (histórico):</div>
      ${real.by_account.map(a => `
        <div style="display:flex;justify-content:space-between;font-size:10px;padding:2px 0">
          <span style="color:var(--text)">${escHtml(a.account)}</span>
          <span style="color:var(--text-muted)">${a.first_record ? escHtml(String(a.first_record).slice(0,10)) : '—'} → ${a.last_record ? escHtml(String(a.last_record).slice(0,10)) : '—'}</span>
          <span style="font-weight:600;color:var(--green)">$${(a.cost||0).toFixed(2)}</span>
        </div>`).join('')}
    </div>` : ''}
    ${est.by_project?.length ? `
    <div style="padding:4px 14px 8px">
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Por proyecto (estimado histórico):</div>
      ${est.by_project.slice(0,8).map(p => `
        <div style="display:flex;justify-content:space-between;font-size:10px;padding:2px 0">
          <span style="color:var(--text)">${escHtml(p.project)}</span>
          <span style="color:var(--text-muted)">${p.events} eventos</span>
          <span style="font-weight:600;color:var(--accent)">$${(p.cost||0).toFixed(4)}</span>
        </div>`).join('')}
    </div>` : ''}`;
}

// ─── Telegram Users panel ─────────────────────────────────
async function tgUsersRefresh() {
  const el = document.getElementById('tg-users-table');
  if (!el) return;
  try {
    const users = await fetch('/api/telegram/users').then(r => r.json());
    if (!users.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:11px;padding:4px 0">Sin usuarios registrados. Agrega el primero arriba.</p>';
      return;
    }
    const roleColor = { admin: 'var(--blue)', dev: 'var(--green)', viewer: 'var(--text-muted)' };
    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="font-size:10px;color:var(--text-muted);text-align:left">
            <th style="padding:4px 8px 4px 0">Nombre</th>
            <th style="padding:4px 8px">ID Telegram</th>
            <th style="padding:4px 8px">Rol</th>
            <th style="padding:4px 8px">Estado</th>
            <th style="padding:4px 0;text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr style="border-top:1px solid var(--border);font-size:11px">
              <td style="padding:6px 8px 6px 0;font-weight:600;color:var(--text)">${escHtml(u.name)}</td>
              <td style="padding:6px 8px;font-family:monospace;color:var(--text-muted)">${escHtml(String(u.id))}</td>
              <td style="padding:6px 8px">
                <span style="background:color-mix(in srgb,${roleColor[u.role]||'var(--text-muted)'} 15%,transparent);color:${roleColor[u.role]||'var(--text-muted)'};padding:1px 6px;border-radius:10px;font-size:10px">${escHtml(u.role||'dev')}</span>
              </td>
              <td style="padding:6px 8px">
                <span style="color:${u.active ? 'var(--green)' : 'var(--text-muted)'}">
                  ${u.active ? '● activo' : '○ inactivo'}
                </span>
              </td>
              <td style="padding:6px 0;text-align:right;white-space:nowrap">
                <button class="btn-sm" style="font-size:10px;margin-right:4px"
                  onclick="tgUsersToggle('${escHtml(String(u.id))}', this)">
                  ${u.active ? 'Desactivar' : 'Activar'}
                </button>
                <button class="btn-sm" style="font-size:10px;color:var(--red);border-color:var(--red)"
                  onclick="tgUsersDelete('${escHtml(String(u.id))}')">
                  Eliminar
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p style="font-size:10px;color:var(--text-muted);margin-top:8px">
        Los cambios surten efecto en &lt;60 segundos sin reiniciar el bot.
      </p>`;
  } catch (e) {
    el.innerHTML = `<p style="color:var(--red);font-size:11px">Error: ${escHtml(e.message)}</p>`;
  }
}

async function tgUsersAdd() {
  const id   = document.getElementById('tg-new-id')?.value.trim();
  const name = document.getElementById('tg-new-name')?.value.trim();
  const role = document.getElementById('tg-new-role')?.value || 'dev';
  if (!id || !name) return alert('ID y Nombre son obligatorios');
  if (!/^\d+$/.test(id)) return alert('El ID debe ser un número entero (ej. 123456789)');
  try {
    const r = await fetch('/api/telegram/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, role, active: true }),
    }).then(r => r.json());
    if (!r.ok) throw new Error(r.error);
    document.getElementById('tg-new-id').value  = '';
    document.getElementById('tg-new-name').value = '';
    tgUsersRefresh();
  } catch (e) { alert('Error: ' + e.message); }
}

async function tgUsersToggle(id, btn) {
  try {
    const r = await fetch(`/api/telegram/users/${id}/toggle`, { method: 'PATCH' }).then(r => r.json());
    if (!r.ok) throw new Error(r.error);
    tgUsersRefresh();
  } catch (e) { alert('Error: ' + e.message); }
}

async function tgUsersDelete(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  try {
    const r = await fetch(`/api/telegram/users/${id}`, { method: 'DELETE' }).then(r => r.json());
    if (!r.ok) throw new Error(r.error);
    tgUsersRefresh();
  } catch (e) { alert('Error: ' + e.message); }
}

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initProviderForm();
  initClickHandlers();
  loadInitialData();
  loadProviders();
  loadAgents();
  loadDispatches();
  loadScreenshots();
  loadAlerts();
  refreshResumeStats();
  document.getElementById('alerts-show-resolved')?.addEventListener('change', loadAlerts);
  connectSocket();
  refreshFeed();

  window.addEventListener('resize', () => {
    if (lineChart) lineChart.resize();
  });
});

// ─── Scores — Curriculum Learning History ──────────────────────────────────

const TIER_COLOR = { 1: '#0EA5E9', 2: '#F59E0B', 3: '#F97316', 4: '#8B5CF6' };
const TIER_LABEL = { 1: 'Básico', 2: 'Intermedio', 3: 'Avanzado', 4: 'Edge' };
let scoresData = { episodes: [], total: 0, offset: 0 };

async function loadScores(append = false) {
  if (!append) scoresData.offset = 0;
  try {
    const res  = await fetch(`${API}/api/financial/learning-episodes?limit=200&offset=${scoresData.offset}`);
    const json = await res.json();
    if (!json.ok) return;

    if (!append) {
      scoresData.episodes = json.episodes;
    } else {
      scoresData.episodes = scoresData.episodes.concat(json.episodes);
    }
    scoresData.total = json.total;
    scoresData.offset = scoresData.episodes.length;

    renderScoresPills(json);
    renderScoresChart(json.episodes);
    renderScoresPatterns(json.patterns || []);
    renderScoresTable(scoresData.episodes);

    const loadMore = document.getElementById('scores-load-more');
    if (loadMore) loadMore.style.display = scoresData.episodes.length < scoresData.total ? '' : 'none';
  } catch (_) {}
}

function loadMoreScores() { loadScores(true); }

function renderScoresPills(json) {
  const el = document.getElementById('scores-pills');
  if (!el) return;
  const latest = json.latest;
  const total  = json.total;
  const avg    = json.episodes.length
    ? (json.episodes.reduce((s, e) => s + parseFloat(e.score_pct || 0), 0) / json.episodes.length).toFixed(1)
    : '—';

  const scoreColor = latest
    ? (latest.score_pct >= 80 ? 'var(--green)' : latest.score_pct >= 60 ? 'var(--yellow)' : 'var(--red)')
    : 'var(--text-muted)';

  const badge = document.getElementById('scores-latest-badge');
  if (badge && latest) {
    badge.textContent = `${parseFloat(latest.score_pct).toFixed(1)}% Ep#${latest.episode_num}`;
    badge.style.color = scoreColor;
    badge.style.borderColor = scoreColor;
  }

  el.innerHTML = [
    `<span style="padding:3px 10px;border-radius:20px;background:var(--glass);border:1px solid var(--border)">📊 <b>${total}</b> episodios</span>`,
    latest ? `<span style="padding:3px 10px;border-radius:20px;background:var(--glass);border:1px solid var(--border)">Último: <b style="color:${scoreColor}">${parseFloat(latest.score_pct).toFixed(1)}%</b></span>` : '',
    latest ? `<span style="padding:3px 10px;border-radius:20px;background:var(--glass);border:1px solid var(--border)">Tier <b style="color:${TIER_COLOR[latest.complexity_tier]}">${latest.complexity_tier} — ${TIER_LABEL[latest.complexity_tier] || ''}</b></span>` : '',
    `<span style="padding:3px 10px;border-radius:20px;background:var(--glass);border:1px solid var(--border)">Promedio (200): <b>${avg}%</b></span>`,
  ].join('');
}

function renderScoresChart(episodes) {
  const svg = document.getElementById('scores-chart');
  if (!svg || !episodes.length) return;

  const pts = [...episodes].reverse().slice(-200);
  const W = 800, H = 140, PAD = { top: 10, bottom: 20, left: 30, right: 10 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const x = (i) => PAD.left + (i / (pts.length - 1 || 1)) * cW;
  const y = (v) => PAD.top + cH - (parseFloat(v) / 100) * cH;

  // Grid lines at 20%, 40%, 60%, 80%, 100%
  let gridLines = '';
  [20, 40, 60, 80, 100].forEach(v => {
    const yy = y(v);
    const isThreshold = v === 80;
    gridLines += `<line x1="${PAD.left}" y1="${yy}" x2="${W - PAD.right}" y2="${yy}"
      stroke="${isThreshold ? '#EF4444' : 'rgba(148,163,184,0.2)'}"
      stroke-width="${isThreshold ? 1.5 : 0.7}"
      stroke-dasharray="${isThreshold ? '4,3' : ''}" />`;
    gridLines += `<text x="${PAD.left - 3}" y="${yy + 3}" text-anchor="end" font-size="8" fill="rgba(100,116,139,0.7)">${v}%</text>`;
  });

  // Area fill + line
  let linePath = '', areaPath = '';
  pts.forEach((ep, i) => {
    const xi = x(i), yi = y(ep.score_pct);
    linePath  += (i === 0 ? `M${xi},${yi}` : ` L${xi},${yi}`);
    areaPath  += (i === 0 ? `M${xi},${y(0)}` : '') + ` L${xi},${yi}`;
  });
  areaPath += ` L${x(pts.length - 1)},${y(0)} Z`;

  // Dots colored by tier
  let dots = '';
  pts.forEach((ep, i) => {
    const col = TIER_COLOR[ep.complexity_tier] || '#94A3B8';
    dots += `<circle cx="${x(i)}" cy="${y(ep.score_pct)}" r="2.5" fill="${col}" opacity="0.85">
      <title>Ep#${ep.episode_num} Tier${ep.complexity_tier}: ${parseFloat(ep.score_pct).toFixed(1)}%</title></circle>`;
  });

  svg.innerHTML = `
    <defs>
      <linearGradient id="score-area-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#0EA5E9" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#0EA5E9" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${areaPath}" fill="url(#score-area-grad)" />
    <path d="${linePath}" fill="none" stroke="#0EA5E9" stroke-width="1.5" stroke-linejoin="round"/>
    ${dots}
  `;
}

function renderScoresPatterns(patterns) {
  const el = document.getElementById('scores-patterns');
  const section = document.getElementById('scores-patterns-section');
  if (!el) return;
  if (!patterns.length) { if (section) section.style.display = 'none'; return; }
  if (section) section.style.display = '';
  el.innerHTML = patterns.slice(0, 10).map(p => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--glass-deep);border:1px solid var(--border);border-radius:6px">
      <span style="min-width:28px;text-align:center;font-size:10px;font-weight:700;color:var(--red);background:color-mix(in srgb,var(--red) 12%,transparent);padding:2px 5px;border-radius:4px">×${p.episode_count}</span>
      <span style="flex:1;font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.description}">${p.description || p.test_id}</span>
      <span style="font-size:10px;color:var(--text-muted);white-space:nowrap">${p.test_id}</span>
    </div>
  `).join('');
}

function renderScoresTable(episodes) {
  const tbody = document.getElementById('scores-tbody');
  if (!tbody) return;
  const scoreStyle = (pct) => {
    const v = parseFloat(pct);
    if (v >= 80) return 'color:var(--green);font-weight:700';
    if (v >= 60) return 'color:var(--yellow);font-weight:700';
    return 'color:var(--red);font-weight:700';
  };
  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return `${dt.toLocaleDateString('es-MX',{month:'short',day:'numeric'})} ${dt.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}`;
  };
  tbody.innerHTML = episodes.map(ep => `
    <tr style="border-bottom:1px solid var(--border);transition:background .15s" onmouseover="this.style.background='var(--glass-deep)'" onmouseout="this.style.background=''">
      <td style="padding:5px 14px;color:var(--text-muted)">#${ep.episode_num}</td>
      <td style="padding:5px 8px;text-align:center">
        <span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;color:${TIER_COLOR[ep.complexity_tier] || '#94A3B8'};background:color-mix(in srgb,${TIER_COLOR[ep.complexity_tier] || '#94A3B8'} 15%,transparent)">T${ep.complexity_tier}</span>
      </td>
      <td style="padding:5px 8px;text-align:center;${scoreStyle(ep.score_pct)}">${parseFloat(ep.score_pct || 0).toFixed(1)}%</td>
      <td style="padding:5px 8px;text-align:center;color:var(--text-muted)">${ep.passed_tests}/${ep.total_tests}</td>
      <td style="padding:5px 8px;color:var(--text-muted);white-space:nowrap">${fmtDate(ep.completed_at || ep.started_at)}</td>
      <td style="padding:5px 8px;color:var(--text-muted);font-family:monospace;font-size:10px">${ep.git_sha ? ep.git_sha.slice(0, 7) : '—'}</td>
    </tr>
  `).join('');
}
