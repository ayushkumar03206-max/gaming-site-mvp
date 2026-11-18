'use strict';
// Shared rules module from the browser game (UMD). The server must be deployed with the whole repository.
const T = require('../../../games/tic-tac-toe/ttt-logic.js');

/** Seat 0 plays X in odd matches and O in even matches; X always moves first. */
function markOf(state, seat) { return (seat + state.matchNo + 1) % 2 === 0 ? 'X' : 'O'; }

module.exports = {
  id: 'tic-tac-toe',
  title: 'Tic Tac Toe',
  minPlayers: 2,
  maxPlayers: 2,
  model: 'turn-based',

  createMatch(matchNo) { return { matchNo, game: T.createGame('X'), forfeit: null }; },

  applyAction(state, seat, action) {
    if (state.forfeit) return { ok: false, reason: 'game-over' };
    if (!action || action.type !== 'move') return { ok: false, reason: 'bad-action' };
    const cell = action.cell;
    if (!Number.isInteger(cell)) return { ok: false, reason: 'bad-cell' };
    return T.play(state.game, cell, markOf(state, seat)); // validates turn, bounds, occupancy, game over
  },

  publicState(state) {
    return { board: state.game.board.slice(), turn: state.game.turn, line: state.game.line, marks: [markOf(state, 0), markOf(state, 1)] };
  },

  result(state) {
    if (state.forfeit) return state.forfeit;
    const w = state.game.winner;
    if (!w) return null;
    if (w === 'draw') return { winnerSeat: null, reason: 'draw' };
    return { winnerSeat: markOf(state, 0) === w ? 0 : 1, reason: 'three in a row' };
  },

  forfeit(state, seat, reason) {
    if (!this.result(state)) state.forfeit = { winnerSeat: 1 - seat, reason };
    return this.result(state);
  },

  markOf
};
