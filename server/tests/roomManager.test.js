'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { RoomManager } = require('../src/rooms/roomManager');
const V = require('../src/rooms/roomValidation');

function setup(extra) {
  let t = 1000;
  const clock = { now: () => t, advance: ms => { t += ms; } };
  const rm = new RoomManager(Object.assign({ now: clock.now, config: { countdownMs: 3000, reconnectGraceMs: 60000 } }, extra));
  return { rm, clock };
}
function twoPlayers(rm, gameId = 'tic-tac-toe', password) {
  const a = rm.create({ gameId, name: 'Asha', password });
  const b = rm.join({ roomId: a.room.id, gameId, name: 'Ben', password });
  assert.ok(a.ok && b.ok, JSON.stringify([a.error, b.error]));
  return { room: a.room, host: a.player, guest: b.player };
}
function startMatch(rm, clock, s) {
  rm.setReady(s.room.id, s.host.id, true); rm.setReady(s.room.id, s.guest.id, true);
  assert.ok(rm.start(s.room.id, s.host.id).ok);
  clock.advance(3000);
}

test('validation: room codes, names, passwords', () => {
  for (let i = 0; i < 500; i++) assert.match(V.generateRoomId(), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.strictEqual(V.normalizeRoomId(' abc-dEf '), 'ABCDEF');
  for (const bad of ['ABC12', 'ABCDEFG', 'ABCD0O', 'ABC1IL', '', null, 42, '<script>']) assert.strictEqual(V.normalizeRoomId(bad), null, String(bad));
  assert.strictEqual(V.cleanName('  Ayu   <b>sh  '), 'Ayu bsh');
  assert.strictEqual(V.cleanName('x'.repeat(21)), null);
  assert.strictEqual(V.cleanName('   '), null);
  assert.deepStrictEqual(V.checkPassword(''), { ok: true, password: null });
  assert.strictEqual(V.checkPassword('abc').ok, false);
  const rec = V.hashPassword('secret'); assert.ok(V.verifyPassword('secret', rec)); assert.ok(!V.verifyPassword('Secret', rec));
});

test('create: host gets a unique code, a seat and a secret token; unknown games are refused', () => {
  const { rm } = setup();
  const r = rm.create({ gameId: 'tic-tac-toe', name: 'Asha' });
  assert.ok(r.ok); assert.strictEqual(r.room.hostId, r.player.id); assert.strictEqual(r.player.seat, 0);
  assert.ok(V.isToken(r.player.token));
  assert.strictEqual(rm.create({ gameId: 'neon-dodge', name: 'A' }).error, 'unknown-game');
  assert.strictEqual(rm.create({ gameId: 'chess', name: '' }).error, 'bad-name');
  assert.strictEqual(rm.create({ gameId: 'chess', name: 'A', password: 'ab' }).error, 'password-invalid');
});

test('create: a colliding code is never reused', () => {
  const ids = ['AAAAAA', 'AAAAAA', 'BBBBBB'];
  const { rm } = setup({ genId: () => ids.shift() });
  const a = rm.create({ gameId: 'chess', name: 'A' }), b = rm.create({ gameId: 'chess', name: 'B' });
  assert.notStrictEqual(a.room.id, b.room.id);
});

test('join: every error case from the brief', () => {
  const { rm } = setup();
  const s = twoPlayers(rm, 'tic-tac-toe');
  const pw = rm.create({ gameId: 'chess', name: 'Host', password: 'opensesame' }).room;
  assert.strictEqual(rm.join({ roomId: 'nope!', gameId: 'tic-tac-toe', name: 'C' }).error, 'invalid-room-id');
  assert.strictEqual(rm.join({ roomId: 'ZZZZZZ', gameId: 'tic-tac-toe', name: 'C' }).error, 'room-not-found');
  assert.strictEqual(rm.join({ roomId: s.room.id, gameId: 'chess', name: 'C' }).error, 'wrong-game');
  assert.strictEqual(rm.join({ roomId: s.room.id, gameId: 'tic-tac-toe', name: 'C' }).error, 'room-full');
  assert.strictEqual(rm.join({ roomId: pw.id, gameId: 'chess', name: 'C', password: 'wrong' }).error, 'bad-password');
  assert.ok(rm.join({ roomId: pw.id.toLowerCase(), gameId: 'chess', name: 'C', password: 'opensesame' }).ok, 'code is case-insensitive');
  rm.closeByHost(s.room.id, s.host.id);
  assert.strictEqual(rm.join({ roomId: s.room.id, gameId: 'tic-tac-toe', name: 'C' }).error, 'room-expired');
});

test('join: cannot join a running match; duplicate names are made distinct', () => {
  const { rm, clock } = setup();
  const a = rm.create({ gameId: 'tic-tac-toe', name: 'Sam' });
  const b = rm.join({ roomId: a.room.id, gameId: 'tic-tac-toe', name: 'Sam' });
  assert.notStrictEqual(a.player.name, b.player.name);
  startMatch(rm, clock, { room: a.room, host: a.player, guest: b.player });
  rm.leave(a.room.id, b.player.id); // makes room for one, but a match was running -> finished, now waiting
  const c = rm.create({ gameId: 'tic-tac-toe', name: 'X' }), d = rm.join({ roomId: c.room.id, gameId: 'tic-tac-toe', name: 'Y' });
  startMatch(rm, clock, { room: c.room, host: c.player, guest: d.player });
  rm.disconnect(c.room.id, d.player.id); // seat still held during the grace period
  assert.strictEqual(rm.join({ roomId: c.room.id, gameId: 'tic-tac-toe', name: 'Z' }).error, 'game-started');
});

test('start: host only, needs every player connected and ready, starts once, countdown before moves', () => {
  const { rm, clock } = setup();
  const s = twoPlayers(rm);
  assert.strictEqual(rm.start(s.room.id, s.guest.id).error, 'not-host');
  assert.strictEqual(rm.start(s.room.id, s.host.id).error, 'not-ready');
  rm.setReady(s.room.id, s.host.id, true); rm.setReady(s.room.id, s.guest.id, true);
  assert.ok(rm.start(s.room.id, s.host.id).ok);
  assert.strictEqual(rm.start(s.room.id, s.host.id).error, 'game-started', 'starts only once');
  assert.strictEqual(rm.action(s.room.id, s.host.id, { type: 'move', cell: 4 }).error, 'not-started-yet');
  clock.advance(3000);
  assert.ok(rm.action(s.room.id, s.host.id, { type: 'move', cell: 4 }).ok);
});

test('tic tac toe: server enforces turns, cells and the result; scores and rematch swap marks', () => {
  const { rm, clock } = setup();
  const s = twoPlayers(rm);
  startMatch(rm, clock, s);
  const act = (p, cell) => rm.action(s.room.id, p.id, { type: 'move', cell });
  assert.strictEqual(act(s.guest, 0).error, 'illegal', 'O cannot move first');
  assert.ok(act(s.host, 0).ok);
  assert.strictEqual(act(s.host, 1).error, 'illegal', 'not your turn');
  assert.strictEqual(act(s.guest, 0).error, 'illegal', 'occupied');
  assert.strictEqual(act(s.guest, 9).error, 'illegal', 'off board');
  assert.strictEqual(rm.action(s.room.id, s.guest.id, { type: 'win' }).error, 'illegal', 'clients cannot declare results');
  act(s.guest, 3); act(s.host, 1); act(s.guest, 4);
  const r = act(s.host, 2);
  assert.ok(r.ok); assert.deepStrictEqual(r.events[0].result, { winnerSeat: 0, reason: 'three in a row' });
  assert.strictEqual(s.room.status, 'finished'); assert.deepStrictEqual(s.room.scores, [1, 0, 0]);
  assert.strictEqual(act(s.guest, 5).error, 'not-playing');
  startMatch(rm, clock, s);
  const v = rm.view(s.room, s.guest.id);
  assert.deepStrictEqual(v.match.marks, ['O', 'X'], 'marks swap on rematch');
  assert.ok(act(s.guest, 4).ok, 'guest (now X) moves first');
});

test('chess: server validates legality and turn, supports resign and draw agreement', () => {
  const { rm, clock } = setup();
  const s = twoPlayers(rm, 'chess');
  startMatch(rm, clock, s);
  const mv = (p, from, to) => rm.action(s.room.id, p.id, { type: 'move', from, to });
  assert.strictEqual(mv(s.guest, 'e7', 'e5').error, 'illegal', 'black cannot move first');
  assert.strictEqual(mv(s.host, 'e2', 'e5').error, 'illegal');
  assert.ok(mv(s.host, 'f2', 'f3').ok); assert.ok(mv(s.guest, 'e7', 'e5').ok);
  assert.ok(mv(s.host, 'g2', 'g4').ok);
  const r = mv(s.guest, 'd8', 'h4');
  assert.deepStrictEqual(r.events[0].result, { winnerSeat: 1, reason: 'checkmate' });
  startMatch(rm, clock, s); // rematch: guest is white now
  assert.ok(mv(s.guest, 'e2', 'e4').ok);
  assert.ok(rm.action(s.room.id, s.host.id, { type: 'offer-draw' }).ok);
  assert.strictEqual(rm.action(s.room.id, s.host.id, { type: 'accept-draw' }).error, 'illegal', 'cannot accept own offer');
  assert.ok(rm.action(s.room.id, s.guest.id, { type: 'accept-draw' }).ok);
  assert.strictEqual(s.room.result.reason, 'draw agreed');
  startMatch(rm, clock, s);
  const res = rm.action(s.room.id, s.guest.id, { type: 'resign' });
  assert.deepStrictEqual(res.events[0].result, { winnerSeat: 0, reason: 'resignation' });
});

test('disconnect: seat kept during grace, resume restores it; no instant win for a network blip', () => {
  const { rm, clock } = setup();
  const s = twoPlayers(rm);
  startMatch(rm, clock, s);
  rm.action(s.room.id, s.host.id, { type: 'move', cell: 4 });
  rm.disconnect(s.room.id, s.guest.id);
  clock.advance(59000); rm.sweep();
  assert.strictEqual(s.room.status, 'playing', 'still playing inside the grace period');
  assert.strictEqual(rm.resume(s.room.id, 'f'.repeat(32)).error, 'bad-token');
  const back = rm.resume(s.room.id, s.guest.token);
  assert.ok(back.ok); assert.strictEqual(back.player.seat, 1);
  assert.deepStrictEqual(rm.view(s.room, s.guest.id).match.board[4], 'X', 'match state preserved');
  assert.ok(rm.action(s.room.id, s.guest.id, { type: 'move', cell: 0 }).ok);
});

test('disconnect: after the grace period the absent player forfeits', () => {
  const { rm, clock } = setup();
  const s = twoPlayers(rm);
  startMatch(rm, clock, s);
  rm.disconnect(s.room.id, s.guest.id);
  clock.advance(60001);
  const changed = rm.sweep();
  assert.ok(changed.includes(s.room));
  assert.deepStrictEqual(s.room.result, { winnerSeat: 0, reason: 'opponent did not reconnect' });
  assert.strictEqual(s.room.players.length, 1);
  assert.strictEqual(s.room.status, 'waiting');
});

test('leave: host hand-over, forfeits a running match, empty rooms close', () => {
  const { rm, clock } = setup();
  const s = twoPlayers(rm);
  startMatch(rm, clock, s);
  const r = rm.leave(s.room.id, s.host.id);
  assert.deepStrictEqual(r.events[0].result, { winnerSeat: 1, reason: 'opponent left' });
  assert.strictEqual(s.room.hostId, s.guest.id);
  const r2 = rm.leave(s.room.id, s.guest.id);
  assert.ok(r2.closed); assert.strictEqual(rm.get(s.room.id), null);
});

test('expiry: abandoned and very old rooms are cleaned up', () => {
  const { rm, clock } = setup({ config: { roomIdleTtlMs: 1000, roomMaxAgeMs: 10000, reconnectGraceMs: 999999 } });
  const a = rm.create({ gameId: 'chess', name: 'A' });
  rm.disconnect(a.room.id, a.player.id);
  clock.advance(1500); rm.sweep();
  assert.strictEqual(rm.get(a.room.id), null);
  const b = rm.create({ gameId: 'chess', name: 'B' });
  clock.advance(10001); rm.sweep();
  assert.strictEqual(rm.get(b.room.id), null);
  assert.strictEqual(rm.join({ roomId: b.room.id, gameId: 'chess', name: 'C' }).error, 'room-expired');
});

test('view never leaks tokens or password data', () => {
  const { rm } = setup();
  const s = twoPlayers(rm, 'chess', 'hunter22');
  const json = JSON.stringify(rm.view(s.room, s.guest.id));
  assert.ok(!json.includes(s.host.token) && !json.includes(s.guest.token));
  assert.ok(!/salt|hash|hunter22/.test(json));
  assert.strictEqual(rm.view(s.room, s.guest.id).hasPassword, true);
});

test('capacity: server-wide room cap', () => {
  const { rm } = setup({ config: { maxRooms: 2 } });
  rm.create({ gameId: 'chess', name: 'A' }); rm.create({ gameId: 'chess', name: 'B' });
  assert.strictEqual(rm.create({ gameId: 'chess', name: 'C' }).error, 'server-full');
});
