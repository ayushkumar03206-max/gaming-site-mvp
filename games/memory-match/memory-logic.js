/* Memory Match rules (pure logic). Shared by solo play and 2-4 players taking turns on one device.
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

  /** players: 1 (solo) or 2-4 (turns on one device). */
  function createGame(levelKey, opts) {
    opts = opts || {};
    var lv = LEVELS[levelKey] || LEVELS.easy, pairs = lv.cols * lv.rows / 2;
    var rng = opts.rng || (opts.seed != null ? mulberry(opts.seed) : Math.random);
    var cards = [];
    for (var p = 0; p < pairs; p++) { cards.push({ pair: p }); cards.push({ pair: p }); }
    for (var i = cards.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = cards[i]; cards[i] = cards[j]; cards[j] = t; }
    cards.forEach(function (c, idx) { c.id = idx; c.state = 'down'; });
    var np = Math.max(1, Math.min(4, opts.players | 0 || 1));
    return { level: levelKey in LEVELS ? levelKey : 'easy', cols: lv.cols, rows: lv.rows, par: lv.par, pairs: pairs, cards: cards,
      players: np, turn: 0, scores: new Array(Math.max(2, np)).fill(0), moves: 0, matched: 0, open: [], pending: false, over: false, streak: 0 };
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

  /** Turn the two mismatched cards back down and pass the turn to the next player. */
  function settle(g) {
    if (!g.pending) return;
    g.open.forEach(function (id) { g.cards[id].state = 'down'; });
    g.open = []; g.pending = false;
    if (g.players > 1) g.turn = (g.turn + 1) % g.players;
  }

  /** Solo scoring: 3 stars at or under par moves, 2 within +50%, else 1. Score rewards fewer moves and less time. */
  function stars(g) { return g.moves <= g.par ? 3 : g.moves <= Math.ceil(g.par * 1.5) ? 2 : 1; }
  function score(g, seconds) { return Math.max(0, g.pairs * 100 - Math.max(0, g.moves - g.pairs) * 10 - Math.floor(seconds) * 2); }
  /** Ranking for 2-4 players: [{player, pairs, place}] best first; tied players share a place. */
  function ranking(g) {
    var rows = [];
    for (var i = 0; i < g.players; i++) rows.push({ player: i, pairs: g.scores[i] });
    rows.sort(function (a, b) { return b.pairs - a.pairs || a.player - b.player; });
    rows.forEach(function (r, i) { r.place = i && r.pairs === rows[i - 1].pairs ? rows[i - 1].place : i + 1; });
    return rows;
  }
  /** Winning player index, 'draw' when the top score is shared, null for solo or an unfinished game. */
  function winner(g) {
    if (g.players < 2 || !g.over) return null;
    var r = ranking(g);
    return r[1].pairs === r[0].pairs ? 'draw' : r[0].player;
  }

  return { LEVELS: LEVELS, createGame: createGame, flip: flip, settle: settle, stars: stars, score: score, winner: winner, ranking: ranking, mulberry: mulberry };
});
