'use strict';

require('dotenv').config({ path: __dirname + '/.env', override: true });

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
const financialRoutes      = require('../financial/backend/routes/financial');

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
app.use('/api/financial',       financialRoutes(require('./db/mysql'), io, express));

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
});
