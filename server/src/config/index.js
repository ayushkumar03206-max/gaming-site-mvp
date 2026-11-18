'use strict';
/**
 * All runtime configuration comes from environment variables. Nothing secret lives in the repo.
 *
 *   PORT                     port to listen on (default 3001)
 *   ALLOWED_ORIGINS          comma-separated browser origins allowed to connect, e.g.
 *                            "https://ayushkumar03206-max.github.io,http://localhost:8765"
 *                            Required in production (NODE_ENV=production). In development it
 *                            defaults to common localhost ports.
 *   ROOM_IDLE_TTL_MS         a waiting room with nobody connected is closed after this (default 10 min)
 *   ROOM_MAX_AGE_MS          any room is closed after this, finished or not (default 3 h)
 *   RECONNECT_GRACE_MS       how long a disconnected player keeps their seat (default 60 s)
 *   MAX_ROOMS                hard cap on concurrent rooms (default 2000)
 *   MAX_CONNECTIONS_PER_IP   concurrent sockets per IP (default 20)
 *   TRUST_PROXY              "1" when running behind a reverse proxy (Render, Railway, Fly ...)
 */
function int(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
  return n;
}

function load(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const origins = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (production && !origins.length) throw new Error('ALLOWED_ORIGINS must be set in production');
  return {
    production,
    port: int('PORT', 3001),
    allowedOrigins: origins.length ? origins : ['http://localhost:8765', 'http://localhost:8766', 'http://localhost:8000', 'http://127.0.0.1:8765'],
    roomIdleTtlMs: int('ROOM_IDLE_TTL_MS', 10 * 60 * 1000),
    roomMaxAgeMs: int('ROOM_MAX_AGE_MS', 3 * 60 * 60 * 1000),
    reconnectGraceMs: int('RECONNECT_GRACE_MS', 60 * 1000),
    maxRooms: int('MAX_ROOMS', 2000),
    maxConnectionsPerIp: int('MAX_CONNECTIONS_PER_IP', 20),
    trustProxy: env.TRUST_PROXY === '1'
  };
}

module.exports = { load };
