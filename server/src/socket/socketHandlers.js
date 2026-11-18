'use strict';
/**
 * Socket.IO event handlers. Thin layer: validate the shape of each request, call the RoomManager,
 * then send every player in the room their own snapshot.
 *
 * Client -> server (each with an acknowledgement callback that receives {ok, error?, ...}):
 *   room:create  {gameId, name, password?}        -> {ok, roomId, playerId, token, room}
 *   room:join    {roomId, gameId, name, password?}-> {ok, roomId, playerId, token, room}
 *   room:resume  {roomId, token}                  -> {ok, roomId, playerId, room}
 *   room:ready   {ready: boolean}
 *   room:start   {}                               (host only)
 *   room:leave   {}
 *   room:close   {}                               (host only)
 *   game:action  {action}                         (validated by the game's adapter)
 * Server -> client:
 *   room:update  <room snapshot for you>
 *   room:closed  {reason}
 *   room:replaced {}   another tab/device rejoined with your token
 */
const { ERRORS } = require('../rooms/roomManager');
const { tokenBucket } = require('../utils/rateLimiter');

function attach(io, rm, opts = {}) {
  const bindings = new Map(); // `${roomId}:${playerId}` -> socket

  function err(code, extra) { return Object.assign({ ok: false, error: code, message: ERRORS[code] || 'Something went wrong.' }, extra || {}); }
  function key(roomId, playerId) { return roomId + ':' + playerId; }

  function broadcast(room) {
    for (const p of room.players) {
      const s = bindings.get(key(room.id, p.id));
      if (s) s.emit('room:update', rm.view(room, p.id));
    }
  }
  function notifyClosed(roomId, playerIds, reason) {
    for (const pid of playerIds) {
      const s = bindings.get(key(roomId, pid));
      if (s) { s.emit('room:closed', { reason }); unbind(s); }
    }
  }
  function bind(socket, room, player) {
    unbind(socket);
    const k = key(room.id, player.id), old = bindings.get(k);
    if (old && old !== socket) { old.emit('room:replaced', {}); old.data.binding = null; }
    bindings.set(k, socket);
    socket.data.binding = { roomId: room.id, playerId: player.id };
  }
  function unbind(socket) {
    const b = socket.data.binding;
    if (b && bindings.get(key(b.roomId, b.playerId)) === socket) bindings.delete(key(b.roomId, b.playerId));
    socket.data.binding = null;
  }
  /** Leave whatever room this socket is in before creating/joining another one. */
  function leaveCurrent(socket) {
    const b = socket.data.binding;
    if (!b) return;
    const room = rm.get(b.roomId), ids = room ? room.players.map(p => p.id) : [];
    unbind(socket);
    const r = rm.leave(b.roomId, b.playerId);
    if (r.ok && r.closed) notifyClosed(b.roomId, ids.filter(i => i !== b.playerId), 'empty');
    else if (r.ok) broadcast(r.room);
  }

  // periodic cleanup: grace periods, expiry
  const sweepTimer = setInterval(() => {
    const before = new Map([...rm.rooms.values()].map(r => [r.id, r.players.map(p => p.id)]));
    for (const room of rm.sweep()) {
      if (room.status === 'closed') notifyClosed(room.id, before.get(room.id) || [], room.closeReason);
      else broadcast(room);
    }
  }, opts.sweepMs || 5000);
  if (sweepTimer.unref) sweepTimer.unref();

  io.on('connection', socket => {
    socket.data.binding = null;
    const limiter = tokenBucket(opts.eventsPerSecond || 8, opts.eventBurst || 20);

    function on(event, handler) {
      socket.on(event, (payload, ack) => {
        if (typeof ack !== 'function') ack = () => {};
        if (!limiter.take()) return ack(err('rate-limited', { message: 'Too many requests. Slow down a little.' }));
        if (payload !== undefined && (payload === null || typeof payload !== 'object' || Array.isArray(payload))) return ack(err('bad-request', { message: 'Bad request.' }));
        try { handler(payload || {}, ack); } catch (e) { console.error('handler error', event, e); ack(err('server-error', { message: 'Server error.' })); }
      });
    }
    function current(ack) {
      const b = socket.data.binding;
      if (!b) { ack(err('not-in-room')); return null; }
      return b;
    }

    on('room:create', (p, ack) => {
      leaveCurrent(socket);
      const r = rm.create({ gameId: p.gameId, name: p.name, password: p.password });
      if (!r.ok) return ack(err(r.error));
      bind(socket, r.room, r.player);
      ack({ ok: true, roomId: r.room.id, playerId: r.player.id, token: r.player.token, room: rm.view(r.room, r.player.id) });
    });

    on('room:join', (p, ack) => {
      leaveCurrent(socket);
      const r = rm.join({ roomId: p.roomId, gameId: p.gameId, name: p.name, password: p.password });
      if (!r.ok) return ack(err(r.error));
      bind(socket, r.room, r.player);
      ack({ ok: true, roomId: r.room.id, playerId: r.player.id, token: r.player.token, room: rm.view(r.room, r.player.id) });
      broadcast(r.room);
    });

    on('room:resume', (p, ack) => {
      const r = rm.resume(p.roomId, p.token);
      if (!r.ok) return ack(err(r.error));
      bind(socket, r.room, r.player);
      ack({ ok: true, roomId: r.room.id, playerId: r.player.id, room: rm.view(r.room, r.player.id) });
      broadcast(r.room);
    });

    on('room:ready', (p, ack) => {
      const b = current(ack); if (!b) return;
      const r = rm.setReady(b.roomId, b.playerId, p.ready === true);
      if (!r.ok) return ack(err(r.error));
      ack({ ok: true }); broadcast(r.room);
    });

    on('room:start', (p, ack) => {
      const b = current(ack); if (!b) return;
      const r = rm.start(b.roomId, b.playerId);
      if (!r.ok) return ack(err(r.error));
      ack({ ok: true }); broadcast(r.room);
    });

    on('game:action', (p, ack) => {
      const b = current(ack); if (!b) return;
      if (!p.action || typeof p.action !== 'object' || JSON.stringify(p.action).length > 300) return ack(err('bad-request', { message: 'Bad request.' }));
      const r = rm.action(b.roomId, b.playerId, p.action);
      if (!r.ok) return ack(err(r.error, { detail: r.detail }));
      ack({ ok: true }); broadcast(r.room);
    });

    on('room:leave', (p, ack) => { leaveCurrent(socket); ack({ ok: true }); });

    on('room:close', (p, ack) => {
      const b = current(ack); if (!b) return;
      const room = rm.get(b.roomId), ids = room ? room.players.map(x => x.id) : [];
      const r = rm.closeByHost(b.roomId, b.playerId);
      if (!r.ok) return ack(err(r.error));
      ack({ ok: true });
      notifyClosed(b.roomId, ids, 'host closed the room');
    });

    socket.on('disconnect', () => {
      const b = socket.data.binding;
      if (!b) return;
      unbind(socket);
      const r = rm.disconnect(b.roomId, b.playerId);
      if (r.ok) broadcast(r.room);
    });
  });

  return { stop() { clearInterval(sweepTimer); }, bindings };
}

module.exports = { attach };
