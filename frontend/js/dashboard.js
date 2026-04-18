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
  const cost   = costStr(s.total_cost_usd);
  const active = s.is_active ? 'active' : '';
  const proj   = s.project_name
    ? `<span class="proj">📁 ${esc(s.project_name)}</span>` : '';
  const src    = s.chat_source && s.chat_source !== 'claude-code-cli'
    ? `<span style="color:var(--purple);font-size:9px">💬 ${esc(s.chat_source)}</span>` : '';
  return `
  <div class="session-item ${active}" data-sid="${esc(s.id)}">
    <div class="sid" title="${esc(s.id)}">${shortId(s.id)}</div>
    <div class="session-meta">
      <span>${esc(s.agent_user || '?')}</span>
      ${cost ? `<span class="cost">${cost}</span>` : ''}
      <span class="tools">🔩 ${s.tool_call_count || 0}</span>
      ${proj}${src}
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
    eventsEl.innerHTML = evs.map(ev => `
      <div class="sdm-event">
        <span class="sdm-ev-icon">${(TOOL_ICONS[ev.tool_name]||{emoji:'🔩'}).emoji}</span>
        <div class="sdm-ev-body">
          <div class="sdm-ev-name">${esc(ev.tool_name || ev.event_type)}</div>
          ${ev.tool_input_summary ? `<div class="sdm-ev-summary">${esc(shortText(ev.tool_input_summary, 120))}</div>` : ''}
        </div>
        <div class="sdm-ev-meta">
          <div>${timeLabel(ev.timestamp)}</div>
          ${ev.duration_ms    ? `<div style="color:var(--text-muted)">${ev.duration_ms}ms</div>` : ''}
          ${ev.estimated_cost_usd ? `<div style="color:var(--yellow)">${costStr(ev.estimated_cost_usd)}</div>` : ''}
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
  return `
  <div class="agent-card">
    <span class="agent-dot ${dotCls}"></span>
    <span class="agent-icon">${icon}</span>
    <div class="agent-info">
      <div class="agent-name">${esc(agent.name)}</div>
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
        // Activate the right sub-panel
        switchRightTab(panel === 'agents'      ? 'agents'      :
                       panel === 'screenshots'? 'screenshots' :
                       panel === 'sessions'   ? 'sessions'   :
                       panel === 'costs'      ? 'costs'      :
                       panel === 'projects'   ? 'projects'   : 'providers');
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
  ['agents','screenshots','sessions','costs','providers','projects'].forEach(t => {
    const el = document.getElementById(t + '-panel');
    if (el) el.classList.toggle('visible', t === tab);
  });
  if (tab === 'costs') loadCosts();
  if (tab === 'providers') loadProviders();
  if (tab === 'projects') loadProjects();
  if (tab === 'agents') { loadAgents(); loadDispatches(); }
  if (tab === 'screenshots') loadScreenshots();
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
    const r = await fetch(`${API}/api/projects`);
    const projects = await r.json();
    renderProjects(projects);
  } catch (err) {
    console.warn('[projects] load error:', err.message);
  }
}

function renderProjects(projects) {
  const list = document.getElementById('project-list');
  if (!list) return;
  if (!projects || !projects.length) {
    list.innerHTML = `<div class="empty-state"><span class="emoji">📁</span>Sin proyectos</div>`;
    return;
  }
  list.innerHTML = projects.map(p => {
    const shotUrl   = `/screenshots/${p.id}.png`;
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

    sessData.forEach(s => { sessions[s.id] = s; });
    events   = eventsData;
    events.forEach(e => { if (e.id) eventCache.set(String(e.id), e); });

    refreshFeed();
    refreshSessions();
    refreshStats();
  } catch (err) {
    console.warn('[dashboard] load error:', err.message);
  }
}

async function loadCosts() {
  try {
    const r = await fetch(`${API}/api/costs`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    costData = data;
    refreshCostsPanel(costData);
  } catch (err) {
    console.warn('[costs] load error:', err.message);
    // Fallback: compute today's totals from in-memory events
    const todayCost = events.reduce((s, e) => s + (parseFloat(e.estimated_cost_usd) || 0), 0);
    const todaySessions = new Set(events.map(e => e.session_id)).size;
    refreshCostsPanel({
      today: { total_cost_usd: todayCost, sessions: todaySessions, events: events.length },
      week:  { total_cost_usd: todayCost, sessions: todaySessions },
      by_tool: [], by_hour: [],
    });
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
  connectSocket();
  refreshFeed();

  window.addEventListener('resize', () => {
    if (lineChart) lineChart.resize();
  });
});
