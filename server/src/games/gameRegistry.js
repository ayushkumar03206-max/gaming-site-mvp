'use strict';
/**
 * Server-side game adapters. Only games listed here can have online rooms.
 *
 * Every adapter is authoritative: the server keeps the match state and validates every action with the
 * same rules module the browser game uses (games/<slug>/*-logic.js), so a client can never move out of
 * turn, play an illegal move or declare its own result.
 *
 * Adapter interface:
 *   id, title, minPlayers, maxPlayers, model
 *   createMatch(matchNo)            -> state      (seat 0 = room host's seat, seats swap roles each rematch)
 *   applyAction(state, seat, action)-> {ok, reason?}
 *   publicState(state)              -> JSON-safe snapshot sent to everyone in the room
 *   result(state)                   -> null while playing, else {winnerSeat: number|null, reason}
 *   forfeit(state, seat, reason)    -> result when `seat` leaves or cannot reconnect
 */
const ticTacToe = require('./ticTacToe');
const chess = require('./chess');

const ADAPTERS = { [ticTacToe.id]: ticTacToe, [chess.id]: chess };

function get(gameId) { return Object.prototype.hasOwnProperty.call(ADAPTERS, gameId) ? ADAPTERS[gameId] : null; }
function list() { return Object.values(ADAPTERS).map(a => ({ id: a.id, title: a.title, minPlayers: a.minPlayers, maxPlayers: a.maxPlayers, model: a.model })); }

module.exports = { get, list };
