'use strict';
// End-to-end over real sockets: a server on a random local port and socket.io-client connections.
const test = require('node:test');
const assert = require('node:assert');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../src/server');

const ORIGIN = 'http://localhost:8765';
let srv, url;
const clients = [];

test.before(async () => {
  srv = createServer({ production: false, port: 0, allowedOrigins: [ORIGIN], roomIdleTtlMs: 600000, roomMaxAgeMs: 3600000,
    reconnectGraceMs: 400, maxRooms: 100, maxConnectionsPerIp: 12, trustProxy: false },
  { roomConfig: { countdownMs: 50 }, socket: { sweepMs: 100, eventsPerSecond: 8, eventBurst: 20 } });
  const port = await srv.listen(0);
  url = 'http://localhost:' + port;
});
test.after(async () => { clients.forEach(c => c.close()); await srv.close(); });

function client(origin = ORIGIN) {
  const c = connect(url, { transports: ['websocket'], extraHeaders: { Origin: origin }, reconnection: false, forceNew: true });
  clients.push(c);
  return c;
}
function connected(c) { return new Promise((res, rej) => { c.once('connect', res); c.once('connect_error', rej); }); }
function ask(c, ev, payload) { return new Promise(res => c.emit(ev, payload, res)); }
function next(c, ev, pred = () => true, ms = 3000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => { c.off(ev, h); rej(new Error('timeout waiting for ' + ev)); }, ms);
    function h(d) { if (pred(d)) { clearTimeout(t); c.off(ev, h); res(d); } }
    c.on(ev, h);
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('health endpoint and allowed-origin CORS header', async () => {
  const r = await fetch(url + '/health', { headers: { Origin: ORIGIN } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers.get('access-control-allow-origin'), ORIGIN);
  assert.strictEqual((await r.json()).ok, true);
  const bad = await fetch(url + '/health', { headers: { Origin: 'https://evil.example' } });
  assert.strictEqual(bad.headers.get('access-control-allow-origin'), null);
});

test('connections from origins that are not allowed are refused', async () => {
  const c = client('https://evil.example');
  await assert.rejects(connected(c));
});

test('full match: create, join, ready, start, moves, server-decided result, rematch', async () => {
  const a = client(), b = client();
  await Promise.all([connected(a), connected(b)]);
  const created = await ask(a, 'room:create', { gameId: 'tic-tac-toe', name: 'Asha' });
  assert.ok(created.ok, JSON.stringify(created));
  assert.match(created.roomId, /^[A-Z2-9]{6}$/);
  const joinedUpdate = next(a, 'room:update', r => r.players.length === 2);
  const joined = await ask(b, 'room:join', { gameId: 'tic-tac-toe', name: 'Ben', roomId: created.roomId.toLowerCase() });
  assert.ok(joined.ok, JSON.stringify(joined));
  const hostView = await joinedUpdate;
  assert.strictEqual(hostView.you.isHost, true);
  assert.ok(!JSON.stringify(hostView).includes(joined.token), 'guest token never sent to host');

  assert.strictEqual((await ask(a, 'room:start', {})).error, 'not-ready');
  assert.strictEqual((await ask(b, 'room:start', {})).error, 'not-host');
  await ask(a, 'room:ready', { ready: true });
  const canStart = next(a, 'room:update', r => r.canStart);
  await ask(b, 'room:ready', { ready: true });
  await canStart;
  const started = next(b, 'room:update', r => r.status === 'playing');
  assert.ok((await ask(a, 'room:start', {})).ok);
  const view = await started;
  assert.ok(view.startsAt >= view.serverTime);
  await wait(80);

  const mv = (c, cell) => ask(c, 'game:action', { action: { type: 'move', cell } });
  assert.strictEqual((await mv(b, 0)).error, 'illegal');
  for (const [c, cell] of [[a, 0], [b, 3], [a, 1], [b, 4]]) assert.ok((await mv(c, cell)).ok);
  const finished = next(b, 'room:update', r => r.status === 'finished');
  assert.ok((await mv(a, 2)).ok);
  const end = await finished;
  assert.deepStrictEqual(end.result, { winnerSeat: 0, reason: 'three in a row' });
  assert.deepStrictEqual(end.scores, [1, 0, 0]);
  assert.strictEqual((await ask(b, 'game:action', { action: { type: 'move', cell: 5 } })).error, 'not-playing');

  // rematch: both ready again, guest is X now
  await ask(a, 'room:ready', { ready: true }); await ask(b, 'room:ready', { ready: true });
  const again = next(b, 'room:update', r => r.status === 'playing' && r.matchNo === 2);
  assert.ok((await ask(a, 'room:start', {})).ok);
  assert.deepStrictEqual((await again).match.marks, ['O', 'X']);
});

test('join errors reach the client with a readable message', async () => {
  const a = client(), b = client();
  await Promise.all([connected(a), connected(b)]);
  const r = await ask(a, 'room:create', { gameId: 'chess', name: 'Host', password: 'letmein' });
  const bad = await ask(b, 'room:join', { gameId: 'chess', name: 'G', roomId: r.roomId, password: 'nope' });
  assert.strictEqual(bad.error, 'bad-password'); assert.match(bad.message, /password/i);
  assert.strictEqual((await ask(b, 'room:join', { gameId: 'chess', name: 'G', roomId: 'QQQQQQ' })).error, 'room-not-found');
  assert.strictEqual((await ask(b, 'room:join', { gameId: 'chess', name: 'G', roomId: '12' })).error, 'invalid-room-id');
  assert.strictEqual((await ask(b, 'room:join', { gameId: 'tic-tac-toe', name: 'G', roomId: r.roomId })).error, 'wrong-game');
  assert.strictEqual((await ask(b, 'room:create', { gameId: 'neon-dodge', name: 'G' })).error, 'unknown-game');
});

test('reconnect within the grace period resumes the same seat and match', async () => {
  const a = client(), b = client();
  await Promise.all([connected(a), connected(b)]);
  const r = await ask(a, 'room:create', { gameId: 'chess', name: 'W' });
  const j = await ask(b, 'room:join', { gameId: 'chess', name: 'B', roomId: r.roomId });
  await ask(a, 'room:ready', { ready: true }); await ask(b, 'room:ready', { ready: true });
  await ask(a, 'room:start', {}); await wait(80);
  assert.ok((await ask(a, 'game:action', { action: { type: 'move', from: 'e2', to: 'e4' } })).ok);
  const sawDrop = next(a, 'room:update', v => v.players.some(p => !p.connected));
  b.close();
  await sawDrop;
  const b2 = client(); await connected(b2);
  const res = await ask(b2, 'room:resume', { roomId: r.roomId, token: j.token });
  assert.ok(res.ok, JSON.stringify(res));
  assert.strictEqual(res.room.you.seat, 1);
  assert.deepStrictEqual(res.room.match.moves, ['e4']);
  assert.ok((await ask(b2, 'game:action', { action: { type: 'move', from: 'e7', to: 'e5' } })).ok);
  assert.strictEqual((await ask(b2, 'room:resume', { roomId: r.roomId, token: '0'.repeat(32) })).error, 'bad-token');
});

test('no reconnect: after the grace period the opponent is awarded the match', async () => {
  const a = client(), b = client();
  await Promise.all([connected(a), connected(b)]);
  const r = await ask(a, 'room:create', { gameId: 'tic-tac-toe', name: 'A' });
  await ask(b, 'room:join', { gameId: 'tic-tac-toe', name: 'B', roomId: r.roomId });
  await ask(a, 'room:ready', { ready: true }); await ask(b, 'room:ready', { ready: true });
  await ask(a, 'room:start', {}); await wait(80);
  const ended = next(a, 'room:update', v => v.result && v.result.reason === 'opponent did not reconnect', 4000);
  b.close();
  const v = await ended;
  assert.strictEqual(v.result.winnerSeat, 0);
});

test('host can close the room; guests are told', async () => {
  const a = client(), b = client();
  await Promise.all([connected(a), connected(b)]);
  const r = await ask(a, 'room:create', { gameId: 'chess', name: 'A' });
  await ask(b, 'room:join', { gameId: 'chess', name: 'B', roomId: r.roomId });
  assert.strictEqual((await ask(b, 'room:close', {})).error, 'not-host');
  const closed = next(b, 'room:closed');
  assert.ok((await ask(a, 'room:close', {})).ok);
  assert.strictEqual((await closed).reason, 'host closed the room');
  assert.strictEqual((await ask(b, 'room:join', { gameId: 'chess', name: 'B', roomId: r.roomId })).error, 'room-expired');
});

test('event flooding is rate-limited; malformed payloads are rejected', async () => {
  const c = client(); await connected(c);
  assert.strictEqual((await ask(c, 'room:create', 'not an object')).error, 'bad-request');
  const results = await Promise.all(Array.from({ length: 40 }, () => ask(c, 'room:ready', { ready: true })));
  assert.ok(results.some(r => r.error === 'rate-limited'), 'some requests throttled');
});
