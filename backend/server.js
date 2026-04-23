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

const PORT = process.env.PORT || 3010;

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Make io available to routes
app.set('io', io);

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
});
