'use strict';

require('dotenv').config({ path: __dirname + '/.env', override: true });

const express   = require('express');
const http      = require('http');
const { Server }= require('socket.io');
const cors      = require('cors');
const path      = require('path');
const session   = require('express-session');

const eventsRouter    = require('./routes/events');
const sessionsRouter  = require('./routes/sessions');
const costsRouter     = require('./routes/costs');
const providersRouter = require('./routes/providers');
const projectsRouter  = require('./routes/projects');
const dispatchRouter       = require('./routes/dispatch');
const screenshotsRouter    = require('./routes/screenshots');
const alertsRouter         = require('./routes/alerts');
const conversationsRouter  = require('./routes/conversations');
const financialRoutes      = require('../financial/backend/routes/financial');
const authRouter           = require('./routes/auth');
const keysRouter           = require('./routes/keys');
const { router: platformRouter, fetchAndCacheUsage, checkBudgets } = require('./routes/platform');
const tg = require('./telegram');
const db = require('./db/mysql');

const PORT = process.env.PORT || 3010;

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Make io available to routes
app.set('io', io);

// ── Session ───────────────────────────────────────────────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-' + Math.random().toString(36).slice(2);
if (!process.env.SESSION_SECRET) {
  console.warn('[auth] SESSION_SECRET no definido — usar valor aleatorio (sesiones no persisten entre reinicios)');
}

app.use(session({
  secret:            SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:   false,   // set to true if serving over HTTPS directly (not via Apache proxy)
    maxAge:   8 * 60 * 60 * 1000,  // 8 hours
  },
}));

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ── Login page (always public) ────────────────────────────────────────────────
app.use('/login', express.static(path.join(__dirname, '..', 'frontend', 'login')));
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'login', 'index.html'));
});

// ── Auth middleware for dashboard ─────────────────────────────────────────────
// Only protects the root HTML page — /api/* internal routes stay open so
// relay-master can POST events without a session cookie.
app.get('/', (req, res, next) => {
  if (req.session?.authenticated) return next();
  res.redirect('/login');
});

// ── Static frontend (served after auth check for /) ───────────────────────────
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ── Auth routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',  authRouter);

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/events',    eventsRouter);
app.use('/api/sessions',  sessionsRouter);
app.use('/api/costs',     costsRouter);
app.use('/api/providers', providersRouter);
app.use('/api/projects',  projectsRouter);
app.use('/api/relay',           dispatchRouter);
app.use('/api/screenshots',     screenshotsRouter);
app.use('/api/alerts',          alertsRouter);
app.use('/api/conversations',   conversationsRouter);
app.use('/api/financial',       financialRoutes(require('./db/mysql'), io, express));
app.use('/api/platform',        platformRouter);
app.use('/api/keys',            keysRouter);  // protected by requireAuth inside the router

// Serve screenshots directory
app.use('/screenshots', express.static(path.join(__dirname, '..', 'frontend', 'screenshots')));

// Health check (always public — used by deploy_verify_fail alert)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), port: PORT });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[ws] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[ws] Client disconnected: ${socket.id}`);
  });
});

// ── Cost alert monitoring (Phase 4) ──────────────────────────────────────────
const COST_ALERT_DAILY_USD   = parseFloat(process.env.COST_ALERT_DAILY_USD   || '5');
const COST_ALERT_MONTHLY_USD = parseFloat(process.env.COST_ALERT_MONTHLY_USD || '50');

// Track which alerts were already sent today/this month to avoid spam
const _sentAlerts = new Set();

async function checkCostAlerts() {
  if (!COST_ALERT_DAILY_USD && !COST_ALERT_MONTHLY_USD) return;
  try {
    // Daily cost by provider (from events table)
    const [daily] = await db.query(
      `SELECT api_provider, ROUND(SUM(cost_usd), 6) AS total
       FROM agent_events
       WHERE DATE(recorded_at) = CURDATE() AND cost_usd IS NOT NULL
       GROUP BY api_provider`,
    ).catch(() => [[]]);  // table name may vary — silent on schema mismatch

    for (const { api_provider: prov, total } of daily) {
      const key = `daily:${prov}:${new Date().toISOString().slice(0, 10)}`;
      if (COST_ALERT_DAILY_USD > 0 && total >= COST_ALERT_DAILY_USD && !_sentAlerts.has(key)) {
        _sentAlerts.add(key);
        await tg.send(
          `⚠️ <b>Alerta de gasto diario</b>\n` +
          `Proveedor: <b>${prov}</b>\n` +
          `Gasto hoy: <b>$${parseFloat(total).toFixed(4)}</b>\n` +
          `Límite: $${COST_ALERT_DAILY_USD}\n` +
          `Ver: <a href="https://ia.vilarkptl.com">ia.vilarkptl.com</a>`,
        );
        console.warn(`[cost-alert] daily ${prov} = $${total} — alerta enviada`);
      }
    }

    // Monthly cost by provider
    const [monthly] = await db.query(
      `SELECT api_provider, ROUND(SUM(cost_usd), 6) AS total
       FROM agent_events
       WHERE YEAR(recorded_at) = YEAR(NOW()) AND MONTH(recorded_at) = MONTH(NOW()) AND cost_usd IS NOT NULL
       GROUP BY api_provider`,
    ).catch(() => [[]]);

    for (const { api_provider: prov, total } of monthly) {
      const month = new Date().toISOString().slice(0, 7);
      const key = `monthly:${prov}:${month}`;
      if (COST_ALERT_MONTHLY_USD > 0 && total >= COST_ALERT_MONTHLY_USD && !_sentAlerts.has(key)) {
        _sentAlerts.add(key);
        await tg.send(
          `🚨 <b>Alerta de gasto mensual</b>\n` +
          `Proveedor: <b>${prov}</b>\n` +
          `Gasto este mes: <b>$${parseFloat(total).toFixed(4)}</b>\n` +
          `Límite: $${COST_ALERT_MONTHLY_USD}\n` +
          `Ver: <a href="https://ia.vilarkptl.com">ia.vilarkptl.com</a>`,
        );
        console.warn(`[cost-alert] monthly ${prov} = $${total} — alerta enviada`);
      }
    }
  } catch (e) {
    console.error('[cost-alert] error:', e.message);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[ai-monitor] Running on port ${PORT}`);
  console.log(`[ai-monitor] Dashboard: http://localhost:${PORT}`);

  if (!process.env.DASHBOARD_PASSWORD_HASH) {
    console.warn('[auth] DASHBOARD_PASSWORD_HASH no configurado — dashboard sin protección de contraseña');
    console.warn('[auth] Generar hash: node -e "require(\'bcryptjs\').hash(\'MI_PASS\',10).then(console.log)"');
  }

  // Platform poller — fetch Anthropic usage every 15 min
  const PLATFORM_POLL_MS = parseInt(process.env.PLATFORM_POLL_MS || String(15 * 60 * 1000));
  if (process.env.ANTHROPIC_ADMIN_KEY) {
    const pollPlatform = async () => {
      try {
        await fetchAndCacheUsage();
        await checkBudgets(io);
        console.log('[platform] usage synced');
      } catch (e) {
        console.error('[platform] poll error:', e.message);
      }
    };
    setTimeout(pollPlatform, 10000);
    setInterval(pollPlatform, PLATFORM_POLL_MS);
    console.log(`[platform] Poller activo cada ${PLATFORM_POLL_MS / 60000} min`);
  } else {
    console.warn('[platform] ANTHROPIC_ADMIN_KEY no configurado — tab Plataforma sin datos');
  }

  // Cost alert poller — check every 5 minutes
  setTimeout(checkCostAlerts, 30000);
  setInterval(checkCostAlerts, 5 * 60 * 1000);
});
