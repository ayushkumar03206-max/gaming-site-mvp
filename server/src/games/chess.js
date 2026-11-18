'use strict';
// Shared perft-verified rules engine from the browser game. The server must be deployed with the whole repository.
const C = require('../../../games/chess/chess-rules.js');

/** Seat 0 is white in odd matches, black in even matches (colours swap on every rematch). */
function colorOf(state, seat) { return (seat + state.matchNo + 1) % 2 === 0 ? 'w' : 'b'; }

module.exports = {
  id: 'chess',
  title: 'Chess',
  minPlayers: 2,
  maxPlayers: 2,
  model: 'turn-based',

  createMatch(matchNo) { return { matchNo, game: C.newGame(), forfeit: null, drawOffer: null }; },

  applyAction(state, seat, action) {
    if (this.result(state)) return { ok: false, reason: 'game-over' };
    if (!action || typeof action !== 'object') return { ok: false, reason: 'bad-action' };
    const me = colorOf(state, seat);
    if (action.type === 'resign') { state.forfeit = { winnerSeat: 1 - seat, reason: 'resignation' }; return { ok: true }; }
    if (action.type === 'offer-draw') { state.drawOffer = seat; return { ok: true }; }
    if (action.type === 'accept-draw') {
      if (state.drawOffer === null || state.drawOffer === seat) return { ok: false, reason: 'no-offer' };
      state.forfeit = { winnerSeat: null, reason: 'draw agreed' }; return { ok: true };
    }
    if (action.type !== 'move') return { ok: false, reason: 'bad-action' };
    if (state.game.turn !== me) return { ok: false, reason: 'not-your-turn' };
    const promo = action.promotion;
    if (promo !== undefined && !['q', 'r', 'b', 'n'].includes(promo)) return { ok: false, reason: 'bad-promotion' };
    const r = C.move(state.game, { from: action.from, to: action.to, promotion: promo }); // full legality check
    if (r.ok) state.drawOffer = null; // a move declines any pending offer
    return r.ok ? { ok: true } : r;
  },

  publicState(state) {
    const g = state.game, st = C.status(g), last = g.history[g.history.length - 1];
    return { fen: C.toFen(g), moves: C.moveList(g), turn: g.turn, check: st.check, last: last ? { from: last.rec.from, to: last.rec.to } : null,
      colors: [colorOf(state, 0), colorOf(state, 1)], drawOffer: state.drawOffer };
  },

  result(state) {
    if (state.forfeit) return state.forfeit;
    const st = C.status(state.game);
    if (!st.over) return null;
    if (st.result === '1/2-1/2') return { winnerSeat: null, reason: st.reason };
    const winnerColor = st.result === '1-0' ? 'w' : 'b';
    return { winnerSeat: colorOf(state, 0) === winnerColor ? 0 : 1, reason: st.reason };
  },

  forfeit(state, seat, reason) {
    if (!this.result(state)) state.forfeit = { winnerSeat: 1 - seat, reason };
    return this.result(state);
  },

  colorOf
};
