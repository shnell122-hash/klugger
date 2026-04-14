'use strict';

// ─── Config ───────────────────────────────────────────────
const API = window.location.origin;
const SOCKET_URL = window.location.origin;

// ─── State ────────────────────────────────────────────────
let events   = [];      // recent events (capped at 200)
let sessions = {};      // session_id → session object
let costData = null;    // /api/costs response

// ─── Tool icon map ────────────────────────────────────────
const TOOL_ICONS = {
  Bash:    { emoji: '⚡', cls: 'icon-bash'    },
  Read:    { emoji: '📖', cls: 'icon-read'    },
  Write:   { emoji: '✏️', cls: 'icon-write'   },
  Edit:    { emoji: '🔧', cls: 'icon-edit'    },
  Grep:    { emoji: '🔍', cls: 'icon-grep'    },
  Glob:    { emoji: '🗂️', cls: 'icon-glob'   },
  Agent:   { emoji: '🤖', cls: 'icon-agent'   },
  WebFetch:{ emoji: '🌐', cls: 'icon-default' },
  WebSearch:{ emoji:'🔎', cls: 'icon-default' },
};

function toolIcon(name) {
  const info = TOOL_ICONS[name] || { emoji: '🔩', cls: 'icon-default' };
  return `<div class="tool-icon ${info.cls}">${info.emoji}</div>`;
}

// ─── Formatting helpers ───────────────────────────────────
function shortId(id) {
  if (!id) return '—';
  return id.length > 12 ? id.substring(0, 8) + '…' + id.slice(-4) : id;
}

function timeLabel(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function costLabel(usd) {
  if (usd == null || usd === 0) return '';
  if (usd < 0.000001) return '<$0.000001';
  return `$${Number(usd).toFixed(6)}`;
}

function shortSummary(text, len = 80) {
  if (!text) return '';
  const clean = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > len ? clean.substring(0, len) + '…' : clean;
}

function totalTodayCost() {
  return events.reduce((s, e) => s + (e.estimated_cost_usd || 0), 0);
}

function activeSessions() {
  return Object.values(sessions).filter(s => s.is_active).length;
}

// ─── Render: event feed ───────────────────────────────────
function renderEvent(ev) {
  const icon    = toolIcon(ev.tool_name);
  const summary = shortSummary(ev.tool_input_summary || ev.tool_response_summary);
  const cost    = costLabel(ev.estimated_cost_usd);
  const time    = timeLabel(ev.timestamp);
  const evtCls  = ev.event_type === 'pre_tool' ? 'pre' :
                  ev.event_type === 'post_tool' ? 'post' : 'stop';

  return `
    <div class="event-item ${evtCls}" data-id="${ev.id}">
      ${icon}
      <div class="event-body">
        <div class="tool-name">${ev.tool_name || ev.event_type}</div>
        <div class="session-id">${shortId(ev.session_id)} · ${ev.agent_user || 'unknown'}</div>
        ${summary ? `<div class="summary">${escHtml(summary)}</div>` : ''}
      </div>
      <div class="event-meta">
        <div class="time">${time}</div>
        ${cost ? `<div class="cost">${cost}</div>` : ''}
      </div>
    </div>`;
}

function refreshFeed() {
  const list = document.getElementById('event-list');
  if (events.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <span class="emoji">👀</span>
      Esperando actividad de agentes…<br>
      <small>Los tool calls aparecerán aquí en tiempo real</small>
    </div>`;
    return;
  }
  // Newest first
  list.innerHTML = [...events].reverse().map(renderEvent).join('');
}

// ─── Render: sessions panel ───────────────────────────────
function renderSession(s) {
  const cost   = costLabel(s.total_cost_usd);
  const active = s.is_active ? 'active' : '';
  return `
    <div class="session-item ${active}" data-sid="${s.id}">
      <div class="session-id-label" title="${s.id}">${shortId(s.id)}</div>
      <div class="session-meta">
        <span>${s.agent_user || '?'}</span>
        ${cost ? `<span class="cost">${cost}</span>` : ''}
        <span class="tools">🔩 ${s.tool_call_count || 0} calls</span>
        <span>${timeLabel(s.started_at)}</span>
      </div>
    </div>`;
}

function refreshSessions() {
  const list = document.getElementById('session-list');
  const sorted = Object.values(sessions).sort(
    (a, b) => new Date(b.started_at) - new Date(a.started_at)
  );
  if (sorted.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <span class="emoji">💤</span>Sin sesiones aún</div>`;
    return;
  }
  list.innerHTML = sorted.map(renderSession).join('');
}

// ─── Render: header stats ─────────────────────────────────
function refreshStats() {
  const costEl   = document.getElementById('stat-cost');
  const activeEl = document.getElementById('stat-active');
  const evtsEl   = document.getElementById('stat-events');

  if (costEl)   costEl.textContent  = `$${totalTodayCost().toFixed(5)}`;
  if (activeEl) activeEl.textContent = activeSessions();
  if (evtsEl)   evtsEl.textContent  = events.length;
}

// ─── Chart: cost by hour (canvas) ─────────────────────────
function drawChart(hourlyData) {
  const canvas = document.getElementById('cost-chart');
  if (!canvas || !hourlyData || hourlyData.length === 0) return;

  const ctx    = canvas.getContext('2d');
  const W = canvas.width  = canvas.offsetWidth;
  const H = canvas.height = canvas.offsetHeight;

  const maxCost = Math.max(...hourlyData.map(h => parseFloat(h.cost_usd) || 0), 0.000001);
  const barW    = Math.floor(W / hourlyData.length) - 2;

  ctx.clearRect(0, 0, W, H);

  // Draw bars
  hourlyData.forEach((h, i) => {
    const cost   = parseFloat(h.cost_usd) || 0;
    const barH   = Math.floor((cost / maxCost) * (H - 20));
    const x      = i * (barW + 2);
    const y      = H - barH - 16;

    ctx.fillStyle = '#d2992244';
    ctx.fillRect(x, y, barW, barH);

    ctx.fillStyle = '#d29922';
    ctx.fillRect(x, H - 16, barW, 2);
  });

  // X axis labels (first and last)
  ctx.fillStyle = '#8b949e';
  ctx.font      = '9px monospace';
  if (hourlyData.length > 0) {
    ctx.fillText(hourlyData[0].hour_bucket.substring(11,16), 0, H - 2);
    const lastLabel = hourlyData.at(-1).hour_bucket.substring(11, 16);
    ctx.fillText(lastLabel, W - 30, H - 2);
  }
}

// ─── Fetch initial data ───────────────────────────────────
async function loadInitialData() {
  try {
    const [sessRes, costsRes] = await Promise.all([
      fetch(`${API}/api/sessions`),
      fetch(`${API}/api/costs`),
    ]);

    const sessData  = await sessRes.json();
    const costsData = await costsRes.json();

    // Populate sessions
    sessData.forEach(s => { sessions[s.id] = s; });

    costData = costsData;

    // Populate events from cost by_hour if available
    refreshSessions();
    refreshStats();

    if (costsData.by_hour) {
      drawChart(costsData.by_hour);
    }

    // Update stat pills from cost data
    if (costsData.today) {
      const cost = document.getElementById('stat-cost');
      if (cost) cost.textContent = `$${parseFloat(costsData.today.total_cost_usd || 0).toFixed(5)}`;
    }

  } catch (err) {
    console.warn('[dashboard] Failed to load initial data:', err.message);
  }
}

// ─── Socket.io live updates ───────────────────────────────
function connectSocket() {
  const socket  = io(SOCKET_URL);
  const dot     = document.getElementById('conn-dot');

  socket.on('connect', () => {
    if (dot) { dot.classList.add('connected'); }
    console.log('[ws] Connected');
  });

  socket.on('disconnect', () => {
    if (dot) { dot.classList.remove('connected'); }
    console.log('[ws] Disconnected');
  });

  socket.on('event:new', (ev) => {
    events.push(ev);
    if (events.length > 200) events.shift(); // cap

    // Ensure session exists
    if (ev.session_id && !sessions[ev.session_id]) {
      sessions[ev.session_id] = {
        id:              ev.session_id,
        started_at:      ev.timestamp,
        agent_user:      ev.agent_user,
        working_dir:     ev.working_dir,
        tool_call_count: 0,
        total_cost_usd:  0,
        is_active:       1,
      };
    }

    // Update session counters locally
    if (ev.session_id && sessions[ev.session_id] && ev.event_type === 'post_tool') {
      sessions[ev.session_id].tool_call_count =
        (sessions[ev.session_id].tool_call_count || 0) + 1;
      sessions[ev.session_id].total_cost_usd =
        (parseFloat(sessions[ev.session_id].total_cost_usd) || 0) +
        (ev.estimated_cost_usd || 0);
    }

    refreshFeed();
    refreshSessions();
    refreshStats();
  });

  socket.on('session:ended', (s) => {
    sessions[s.id] = { ...sessions[s.id], ...s };
    refreshSessions();
    refreshStats();
  });
}

// ─── Security: escape HTML ────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadInitialData();
  connectSocket();
  refreshFeed();

  // Redraw chart on resize
  window.addEventListener('resize', () => {
    if (costData?.by_hour) drawChart(costData.by_hour);
  });
});
