'use strict';

require('dotenv').config({ path: __dirname + '/.env' });

const express   = require('express');
const http      = require('http');
const { Server }= require('socket.io');
const cors      = require('cors');
const path      = require('path');

const eventsRouter    = require('./routes/events');
const sessionsRouter  = require('./routes/sessions');
const costsRouter     = require('./routes/costs');
const providersRouter = require('./routes/providers');
const projectsRouter  = require('./routes/projects');
const dispatchRouter       = require('./routes/dispatch');
const screenshotsRouter    = require('./routes/screenshots');
const alertsRouter         = require('./routes/alerts');
const conversationsRouter  = require('./routes/conversations');
const { router: platformRouter, fetchAndCacheUsage, checkBudgets } = require('./routes/platform');
const { router: apiAdminRouter, dailySnapshot } = require('./routes/apiAdmin');
const telegramUsersRouter = require('./routes/telegramUsers');
const proxyUsageRouter    = require('./routes/proxyUsage');
const financialRoutes = require('../financial/backend/routes/financial');
const execRouter      = require('./routes/exec');
const pool            = require('./db/mysql');

const PORT = process.env.PORT || 3010;

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Make io and pool available to routes
app.set('io', io);
app.locals.pool = require('./db/mysql');

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve the frontend dashboard from /frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API routes
app.use('/api/events',    eventsRouter);
app.use('/api/sessions',  sessionsRouter);
app.use('/api/costs',     costsRouter);
app.use('/api/providers', providersRouter);
app.use('/api/projects',  projectsRouter);
app.use('/api/relay',           dispatchRouter);
app.use('/api/screenshots',     screenshotsRouter);
app.use('/api/alerts',          alertsRouter);
app.use('/api/conversations',   conversationsRouter);
app.use('/api/platform',        platformRouter);
app.use('/api/apiAdmin',        apiAdminRouter);
app.use('/api/telegram',        telegramUsersRouter);
app.use('/api/proxy-usage',     proxyUsageRouter);
app.use('/api/financial',      financialRoutes(pool, io, express));
app.use('/api/exec',           execRouter);

// Serve screenshots directory (already covered by express.static on /frontend,
// but also serve under /screenshots for direct access)
app.use('/screenshots', express.static(require('path').join(__dirname, '..', 'frontend', 'screenshots')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), port: PORT });
});

// WebSocket connection log
io.on('connection', (socket) => {
  console.log(`[ws] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[ws] Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[ai-monitor] Running on port ${PORT}`);
  console.log(`[ai-monitor] Dashboard: http://localhost:${PORT}`);

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
    setTimeout(pollPlatform, 10000);  // first fetch 10s after startup
    setInterval(pollPlatform, PLATFORM_POLL_MS);
    console.log(`[platform] Poller activo cada ${PLATFORM_POLL_MS / 60000} min`);
  } else {
    console.warn('[platform] ANTHROPIC_ADMIN_KEY no configurado — tab Plataforma sin datos');
  }

  // Daily snapshot a las 23:55 — materializa agent_events en provider_daily_cost
  setInterval(() => {
    const n = new Date();
    if (n.getHours() === 23 && n.getMinutes() === 55) {
      dailySnapshot().catch(e => console.error('[apiAdmin] snapshot error:', e.message));
    }
  }, 60 * 1000);

  // Project budget enforcer — check per-project monthly limits every 5 min
  const db = require('./db/mysql');
  setInterval(async () => {
    try {
      const [budgets] = await db.query(
        'SELECT * FROM project_monthly_budget WHERE kill_enabled = 1'
      ).catch(() => [[]]);
      if (!budgets.length) return;

      const billingStart = new Date();
      billingStart.setDate(1); billingStart.setHours(0, 0, 0, 0);

      const [spends] = await db.query(
        `SELECT project_name, ROUND(SUM(estimated_cost_usd),4) AS cost
         FROM agent_events
         WHERE timestamp >= ? AND project_name IS NOT NULL
         GROUP BY project_name`,
        [billingStart.toISOString().slice(0, 10)]
      ).catch(() => [[]]);

      const spendMap = {};
      spends.forEach(r => { spendMap[r.project_name] = parseFloat(r.cost || 0); });

      for (const b of budgets) {
        const spent = spendMap[b.project_name] || 0;
        if (spent < parseFloat(b.budget_usd)) continue;

        const killKey = `project_killed_${b.project_name}`;
        const [[cur]] = await db.query(
          "SELECT `value` FROM system_state WHERE `key`=?", [killKey]
        ).catch(() => [[null]]);
        if (cur?.value === '1') continue; // already killed

        await db.query(
          "INSERT INTO system_state(`key`,`value`) VALUES(?,1) ON DUPLICATE KEY UPDATE `value`='1', updated_at=NOW(3)",
          [killKey]
        );
        await db.query(
          'INSERT INTO project_budget_alerts (project_name, budget_usd, actual_usd) VALUES (?,?,?)',
          [b.project_name, b.budget_usd, spent]
        ).catch(() => {});
        io.emit('project_budget_exceeded', {
          project: b.project_name,
          budget:  b.budget_usd,
          spent,
          msg:     `🛑 ${b.project_name} superó $${b.budget_usd}/mes (gastado: $${spent.toFixed(2)})`,
        });
        console.warn(`[budget] ${b.project_name} KILLED — spent $${spent} / budget $${b.budget_usd}`);
      }
    } catch (e) {
      console.error('[budget] project enforcer error:', e.message);
    }
  }, 5 * 60 * 1000);
});
