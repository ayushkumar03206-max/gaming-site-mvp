'use strict';
/**
 * Gridlight Arcade multiplayer server: Express (health + game list) and Socket.IO (rooms and matches).
 * Run: `npm start` (see docs/DEPLOYMENT_GUIDE.md for environment variables and hosting).
 */
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const config = require('./config');
const { RoomManager } = require('./rooms/roomManager');
const { attach } = require('./socket/socketHandlers');
const registry = require('./games/gameRegistry');
const { connectionCounter } = require('./utils/rateLimiter');

function createServer(cfg = config.load(), opts = {}) {
  const app = express();
  if (cfg.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  const startedAt = Date.now();
  const rm = new RoomManager({ config: Object.assign({}, cfg, opts.roomConfig || {}) });

  // CORS for the small HTTP API (the static site checks /health before offering online play)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && cfg.allowedOrigins.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/health', (req, res) => res.json({ ok: true, rooms: rm.rooms.size, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) }));
  app.get('/games', (req, res) => res.json({ games: registry.list() }));
  app.use((req, res) => res.status(404).json({ ok: false, error: 'not-found' }));

  const server = http.createServer(app);
  const perIp = connectionCounter(cfg.maxConnectionsPerIp);
  const io = new Server(server, {
    cors: { origin: cfg.allowedOrigins, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 8 * 1024,
    pingInterval: 10000, pingTimeout: 8000,
    // reject browsers from origins that are not allowed (cors alone only stops the browser reading responses)
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      cb(null, !origin || cfg.allowedOrigins.includes(origin));
    }
  });
  io.use((socket, next) => {
    const ip = (cfg.trustProxy && (socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim()) || socket.handshake.address;
    if (!perIp.tryAdd(ip)) return next(new Error('too-many-connections'));
    socket.on('disconnect', () => perIp.remove(ip));
    next();
  });
  const handlers = attach(io, rm, opts.socket || {});

  return {
    app, server, io, rm,
    listen(port = cfg.port) { return new Promise(resolve => server.listen(port, () => resolve(server.address().port))); },
    async close() { handlers.stop(); io.close(); await new Promise(r => server.close(() => r())); }
  };
}

if (require.main === module) {
  const cfg = config.load();
  const s = createServer(cfg);
  s.listen().then(port => console.log(`Gridlight multiplayer server on :${port} (origins: ${cfg.allowedOrigins.join(', ')})`));
  const stop = () => { s.close().then(() => process.exit(0)); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

module.exports = { createServer };
