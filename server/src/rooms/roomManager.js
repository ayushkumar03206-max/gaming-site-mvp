'use strict';
/**
 * Room manager: all room rules in one place, independent of Socket.IO so it can be unit-tested.
 * State is in memory. A restart of the server ends all rooms (documented in docs/ROOM_SYSTEM.md).
 *
 * Room lifecycle:  waiting  --host start-->  playing  --result-->  finished  --host start-->  playing ...
 *                     \______________________ closed (host closes, everyone leaves, expiry) ____/
 *
 * Every method returns {ok: true, ...} or {ok: false, error: '<code>'}. Error codes are listed in ERRORS
 * and turned into user-facing messages by the client.
 */
const V = require('./roomValidation');
const registry = require('../games/gameRegistry');

const ERRORS = {
  'invalid-room-id': 'That room code is not valid. Room codes have 6 letters and numbers.',
  'room-not-found': 'Room not found. Check the code with your friend.',
  'room-expired': 'That room has closed.',
  'wrong-game': 'That room is for a different game.',
  'room-full': 'That room is full.',
  'game-started': 'That game has already started.',
  'bad-password': 'Incorrect room password.',
  'password-invalid': 'Room passwords must be 4-32 characters.',
  'bad-name': 'Names must be 1-20 characters.',
  'unknown-game': 'Online play is not available for this game.',
  'server-full': 'The server is busy. Please try again in a minute.',
  'not-in-room': 'You are not in this room.',
  'not-host': 'Only the host can do that.',
  'not-ready': 'Every player must be connected and ready first.',
  'not-playing': 'The match is not running.',
  'not-started-yet': 'The match has not started yet.',
  'bad-token': 'Could not rejoin that room.',
  'illegal': 'That move is not allowed.'
};

class RoomManager {
  constructor(opts = {}) {
    this.now = opts.now || (() => Date.now());
    this.genId = opts.genId || V.generateRoomId;
    this.cfg = Object.assign({ roomIdleTtlMs: 600000, roomMaxAgeMs: 3 * 3600000, reconnectGraceMs: 60000, maxRooms: 2000, countdownMs: 3000 }, opts.config || {});
    this.rooms = new Map();
    this.closed = new Map(); // recently closed room ids -> time, so joiners get "room expired" not "not found"
  }

  // ------------------------------------------------------------ create / join / leave
  create({ gameId, name, password }) {
    const adapter = registry.get(gameId);
    if (!adapter) return { ok: false, error: 'unknown-game' };
    const n = V.cleanName(name); if (!n) return { ok: false, error: 'bad-name' };
    const pw = V.checkPassword(password); if (!pw.ok) return { ok: false, error: 'password-invalid' };
    if (this.rooms.size >= this.cfg.maxRooms) return { ok: false, error: 'server-full' };
    let id, tries = 0;
    do { id = this.genId(); } while ((this.rooms.has(id) || this.closed.has(id)) && ++tries < 50);
    if (this.rooms.has(id) || this.closed.has(id)) return { ok: false, error: 'server-full' };
    const t = this.now();
    const room = { id, gameId, adapter, status: 'waiting', createdAt: t, lastActive: t, pw: pw.password ? V.hashPassword(pw.password) : null,
      players: [], hostId: null, match: null, matchNo: 0, startsAt: null, result: null, scores: [0, 0, 0] /* seat0, seat1, draws */ };
    const player = this._addPlayer(room, n);
    room.hostId = player.id;
    this.rooms.set(id, room);
    return { ok: true, room, player };
  }

  join({ roomId, gameId, name, password }) {
    const id = V.normalizeRoomId(roomId);
    if (!id) return { ok: false, error: 'invalid-room-id' };
    const room = this.rooms.get(id);
    if (!room) return { ok: false, error: this.closed.has(id) ? 'room-expired' : 'room-not-found' };
    if (room.gameId !== gameId) return { ok: false, error: 'wrong-game' };
    if (!V.verifyPassword(password, room.pw)) return { ok: false, error: 'bad-password' };
    if (room.status === 'playing') return { ok: false, error: 'game-started' };
    if (room.players.length >= room.adapter.maxPlayers) return { ok: false, error: 'room-full' };
    const n = V.cleanName(name); if (!n) return { ok: false, error: 'bad-name' };
    const player = this._addPlayer(room, n);
    if (room.status === 'finished') room.status = 'waiting';
    room.scores = [0, 0, 0]; room.result = null; // new opponent, new scoreboard
    this._touch(room);
    return { ok: true, room, player };
  }

  _addPlayer(room, name) {
    const taken = new Set(room.players.map(p => p.seat));
    let seat = 0; while (taken.has(seat)) seat++;
    // two players may pick the same name; make them distinguishable
    let display = name;
    if (room.players.some(p => p.name === display)) display = (name.length > 17 ? name.slice(0, 17) : name) + ' ' + (seat + 1);
    const player = { id: V.newToken().slice(0, 12), token: V.newToken(), name: display, seat, ready: false, connected: true, disconnectedAt: null };
    room.players.push(player);
    room.players.sort((a, b) => a.seat - b.seat);
    return player;
  }

  /** A player leaves on purpose. During a match this forfeits; the host leaving hands the room over or closes it. */
  leave(roomId, playerId) {
    const room = this.rooms.get(roomId), p = room && this._player(room, playerId);
    if (!p) return { ok: false, error: 'not-in-room' };
    const events = [];
    if (room.status === 'playing') events.push(this._finish(room, room.adapter.forfeit(room.match, p.seat, 'opponent left')));
    room.players = room.players.filter(x => x !== p);
    if (!room.players.length) { this._close(room, 'empty'); return { ok: true, closed: true, events }; }
    if (room.hostId === p.id) room.hostId = room.players[0].id; // hand over to the remaining player
    if (room.status === 'finished') room.status = 'waiting';
    room.players.forEach(x => { x.ready = false; });
    this._touch(room);
    return { ok: true, room, events };
  }

  closeByHost(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room || !this._player(room, playerId)) return { ok: false, error: 'not-in-room' };
    if (room.hostId !== playerId) return { ok: false, error: 'not-host' };
    this._close(room, 'host closed the room');
    return { ok: true, room };
  }

  // ------------------------------------------------------------ lobby
  setReady(roomId, playerId, ready) {
    const room = this.rooms.get(roomId), p = room && this._player(room, playerId);
    if (!p) return { ok: false, error: 'not-in-room' };
    if (room.status === 'playing') return { ok: false, error: 'game-started' };
    p.ready = !!ready; this._touch(room);
    return { ok: true, room };
  }

  canStart(room) {
    return room.status !== 'playing' && room.players.length >= room.adapter.minPlayers &&
      room.players.every(p => p.ready && p.connected);
  }

  /** Host starts. The match begins after a short countdown so both players see the same start. Starts only once. */
  start(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room || !this._player(room, playerId)) return { ok: false, error: 'not-in-room' };
    if (room.hostId !== playerId) return { ok: false, error: 'not-host' };
    if (room.status === 'playing') return { ok: false, error: 'game-started' };
    if (!this.canStart(room)) return { ok: false, error: 'not-ready' };
    room.matchNo++;
    room.match = room.adapter.createMatch(room.matchNo);
    room.status = 'playing'; room.result = null; room.startsAt = this.now() + this.cfg.countdownMs;
    room.players.forEach(p => { p.ready = false; });
    this._touch(room);
    return { ok: true, room };
  }

  // ------------------------------------------------------------ gameplay
  action(roomId, playerId, action) {
    const room = this.rooms.get(roomId), p = room && this._player(room, playerId);
    if (!p) return { ok: false, error: 'not-in-room' };
    if (room.status !== 'playing') return { ok: false, error: 'not-playing' };
    if (this.now() < room.startsAt) return { ok: false, error: 'not-started-yet' };
    const r = room.adapter.applyAction(room.match, p.seat, action);
    if (!r.ok) return { ok: false, error: 'illegal', detail: r.reason };
    this._touch(room);
    const res = room.adapter.result(room.match);
    const events = res ? [this._finish(room, res)] : [];
    return { ok: true, room, events };
  }

  _finish(room, res) {
    room.status = 'finished'; room.result = res;
    if (res.winnerSeat === null) room.scores[2]++; else room.scores[res.winnerSeat]++;
    return { type: 'finished', result: res };
  }

  // ------------------------------------------------------------ connection
  disconnect(roomId, playerId) {
    const room = this.rooms.get(roomId), p = room && this._player(room, playerId);
    if (!p) return { ok: false, error: 'not-in-room' };
    p.connected = false; p.disconnectedAt = this.now(); p.ready = false;
    return { ok: true, room };
  }

  /** Rejoin with the secret token handed out at create/join. Restores the same seat and match. */
  resume(roomId, token) {
    const id = V.normalizeRoomId(roomId);
    if (!id || !V.isToken(token)) return { ok: false, error: 'bad-token' };
    const room = this.rooms.get(id);
    if (!room) return { ok: false, error: this.closed.has(id) ? 'room-expired' : 'room-not-found' };
    const p = room.players.find(x => x.token === token);
    if (!p) return { ok: false, error: 'bad-token' };
    p.connected = true; p.disconnectedAt = null; this._touch(room);
    return { ok: true, room, player: p };
  }

  /**
   * Periodic cleanup. A temporary disconnect never ends a match immediately: the player has
   * reconnectGraceMs to come back. After that, a running match is forfeited ("opponent did not
   * reconnect") and a waiting seat is freed. Idle and very old rooms are closed.
   */
  sweep() {
    const t = this.now(), changed = [];
    for (const room of this.rooms.values()) {
      let touched = false;
      for (const p of room.players.slice()) {
        if (p.connected || t - p.disconnectedAt < this.cfg.reconnectGraceMs) continue;
        touched = true;
        if (room.status === 'playing') { this._finish(room, room.adapter.forfeit(room.match, p.seat, 'opponent did not reconnect')); }
        room.players = room.players.filter(x => x !== p);
        if (room.hostId === p.id && room.players.length) room.hostId = room.players[0].id;
      }
      const allGone = room.players.every(p => !p.connected);
      if (!room.players.length) { this._close(room, 'empty'); changed.push(room); continue; }
      if (t - room.createdAt > this.cfg.roomMaxAgeMs || (allGone && t - room.lastActive > this.cfg.roomIdleTtlMs) ||
          (room.status !== 'playing' && t - room.lastActive > this.cfg.roomIdleTtlMs * 3)) {
        this._close(room, 'expired'); changed.push(room); continue;
      }
      if (touched) { if (room.status === 'finished' && room.players.length < room.adapter.minPlayers) room.status = 'waiting'; changed.push(room); }
    }
    for (const [id, at] of this.closed) if (t - at > 24 * 3600000) this.closed.delete(id);
    return changed;
  }

  _close(room, reason) { room.status = 'closed'; room.closeReason = reason; this.rooms.delete(room.id); this.closed.set(room.id, this.now()); }
  _touch(room) { room.lastActive = this.now(); }
  _player(room, playerId) { return room.players.find(p => p.id === playerId) || null; }
  get(roomId) { return this.rooms.get(roomId) || null; }

  /** Snapshot for one viewer. Never contains tokens or password data. */
  view(room, viewerId) {
    const me = room.players.find(p => p.id === viewerId);
    return {
      id: room.id, gameId: room.gameId, status: room.status, hasPassword: !!room.pw, closeReason: room.closeReason || null,
      hostId: room.hostId, you: me ? { id: me.id, seat: me.seat, isHost: room.hostId === me.id } : null,
      players: room.players.map(p => ({ id: p.id, name: p.name, seat: p.seat, ready: p.ready, connected: p.connected, isHost: room.hostId === p.id })),
      minPlayers: room.adapter.minPlayers, maxPlayers: room.adapter.maxPlayers, canStart: this.canStart(room),
      matchNo: room.matchNo, startsAt: room.startsAt, serverTime: this.now(),
      match: room.match ? room.adapter.publicState(room.match) : null, result: room.result, scores: room.scores.slice()
    };
  }
}

module.exports = { RoomManager, ERRORS };
