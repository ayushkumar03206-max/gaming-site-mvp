/* Memory Match rules (pure logic). Shared by solo play and 2-player turns.
 * A board is an array of cards {id, pair, state: 'down'|'up'|'matched'}.
 * flip() returns what happened; the UI calls settle() after showing a mismatch.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MemoryLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LEVELS = {
    easy: { cols: 4, rows: 3, par: 10 },   // 6 pairs
    medium: { cols: 4, rows: 4, par: 16 }, // 8 pairs
    hard: { cols: 6, rows: 5, par: 30 }    // 15 pairs
  };

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /** players: 1 (solo) or 2 (turns on one device). */
  function createGame(levelKey, opts) {
    opts = opts || {};
    var lv = LEVELS[levelKey] || LEVELS.easy, pairs = lv.cols * lv.rows / 2;
    var rng = opts.rng || (opts.seed != null ? mulberry(opts.seed) : Math.random);
    var cards = [];
    for (var p = 0; p < pairs; p++) { cards.push({ pair: p }); cards.push({ pair: p }); }
    for (var i = cards.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = cards[i]; cards[i] = cards[j]; cards[j] = t; }
    cards.forEach(function (c, idx) { c.id = idx; c.state = 'down'; });
    return { level: levelKey in LEVELS ? levelKey : 'easy', cols: lv.cols, rows: lv.rows, par: lv.par, pairs: pairs, cards: cards,
      players: opts.players === 2 ? 2 : 1, turn: 0, scores: [0, 0], moves: 0, matched: 0, open: [], pending: false, over: false, streak: 0 };
  }

  /** Flip card `id`. Returns {ok, result: 'first'|'match'|'miss', ...}. */
  function flip(g, id) {
    if (g.over || g.pending) return { ok: false, reason: 'busy' };
    var c = g.cards[id];
    if (!c || c.state !== 'down') return { ok: false, reason: 'not-flippable' };
    c.state = 'up'; g.open.push(id);
    if (g.open.length === 1) return { ok: true, result: 'first' };
    g.moves++;
    var a = g.cards[g.open[0]], b = c;
    if (a.pair === b.pair) {
      a.state = b.state = 'matched'; g.open = []; g.matched++; g.scores[g.turn]++; g.streak++;
      if (g.matched === g.pairs) g.over = true;
      return { ok: true, result: 'match', pair: a.pair, over: g.over }; // a match keeps the turn
    }
    g.pending = true; g.streak = 0;
    return { ok: true, result: 'miss' };
  }

  /** Turn the two mismatched cards back down and pass the turn (2-player). */
  function settle(g) {
    if (!g.pending) return;
    g.open.forEach(function (id) { g.cards[id].state = 'down'; });
    g.open = []; g.pending = false;
    if (g.players === 2) g.turn = 1 - g.turn;
  }

  /** Solo scoring: 3 stars at or under par moves, 2 within +50%, else 1. Score rewards fewer moves and less time. */
  function stars(g) { return g.moves <= g.par ? 3 : g.moves <= Math.ceil(g.par * 1.5) ? 2 : 1; }
  function score(g, seconds) { return Math.max(0, g.pairs * 100 - Math.max(0, g.moves - g.pairs) * 10 - Math.floor(seconds) * 2); }
  function winner(g) { return g.players !== 2 || !g.over ? null : g.scores[0] === g.scores[1] ? 'draw' : g.scores[0] > g.scores[1] ? 0 : 1; }

  return { LEVELS: LEVELS, createGame: createGame, flip: flip, settle: settle, stars: stars, score: score, winner: winner, mulberry: mulberry };
});
