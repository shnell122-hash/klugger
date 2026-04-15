'use strict';

const API = window.location.origin;

// ─── State ────────────────────────────────────────────────
let events    = [];
let sessions  = {};
let providers = [];
let costData  = null;
let lineChart = null;

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
  const p = PROVIDERS[provider] || { label: provider || 'unknown', cls: 'provider-unknown' };
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
  <div class="event-item ${evtCls}">
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
  const cost   = costStr(s.total_cost_usd);
  const active = s.is_active ? 'active' : '';
  const proj   = s.project_name
    ? `<span class="proj">📁 ${esc(s.project_name)}</span>` : '';
  return `
  <div class="session-item ${active}">
    <div class="sid" title="${esc(s.id)}">${shortId(s.id)}</div>
    <div class="session-meta">
      <span>${esc(s.agent_user || '?')}</span>
      ${cost ? `<span class="cost">${cost}</span>` : ''}
      <span class="tools">🔩 ${s.tool_call_count || 0}</span>
      ${proj}
      <span>${providerBadge(s.api_provider)}</span>
      <span>${timeLabel(s.started_at)}</span>
    </div>
  </div>`;
}

function refreshSessions() {
  const list = document.getElementById('session-list');
  const sorted = Object.values(sessions).sort(
    (a,b) => new Date(b.started_at) - new Date(a.started_at)
  );
  if (!sorted.length) {
    list.innerHTML = `<div class="empty-state"><span class="emoji">💤</span>Sin sesiones</div>`;
    return;
  }
  list.innerHTML = sorted.map(renderSession).join('');
}

// ─── Stats header ─────────────────────────────────────────
function refreshStats() {
  const todayCost = events.reduce((s,e) => s + (parseFloat(e.estimated_cost_usd)||0), 0);
  const el = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  el('stat-cost',   '$' + todayCost.toFixed(5));
  el('stat-active', Object.values(sessions).filter(s=>s.is_active).length);
  el('stat-events', events.length);
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
        // Activate the right sub-panel
        switchRightTab(panel === 'sessions' ? 'sessions' :
                       panel === 'costs'    ? 'costs'    : 'providers');
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
  ['sessions','costs','providers'].forEach(t => {
    const el = document.getElementById(t + '-panel');
    if (el) el.classList.toggle('visible', t === tab);
  });
  if (tab === 'costs' && costData) refreshCostsPanel(costData);
  if (tab === 'providers') loadProviders();
}

// ─── Data loading ─────────────────────────────────────────
async function loadInitialData() {
  try {
    const [sessRes, costsRes] = await Promise.all([
      fetch(`${API}/api/sessions`),
      fetch(`${API}/api/costs`),
    ]);
    const sessData  = await sessRes.json();
    const costsData = await costsRes.json();

    sessData.forEach(s => { sessions[s.id] = s; });
    costData = costsData;

    refreshSessions();
    refreshStats();
    refreshCostsPanel(costData);

    if (costsData.today) {
      const el = document.getElementById('stat-cost');
      if (el) el.textContent = '$' + parseFloat(costsData.today.total_cost_usd||0).toFixed(5);
    }
  } catch (err) {
    console.warn('[dashboard] load error:', err.message);
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
}

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initProviderForm();
  loadInitialData();
  loadProviders();
  connectSocket();
  refreshFeed();

  window.addEventListener('resize', () => {
    if (lineChart) lineChart.resize();
  });
});
