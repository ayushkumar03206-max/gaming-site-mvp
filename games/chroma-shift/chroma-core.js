/* Chroma Shift: rules + deterministic level generator. No DOM.
 *
 * Tapping tile i advances it and its orthogonal neighbours by +1 (mod C colours).
 * A level is solved when every tile shows the same colour (any colour).
 *
 * Generation: start from a uniform board and apply k "reverse taps" (-1) on k
 * distinct random tiles. Tapping those same k tiles forwards restores the
 * board, so every level is provably solvable in at most k moves.
 */
(function (root) {
  'use strict';
  var MAX_LEVEL = 30;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function params(level) {
    var L = Math.max(1, Math.min(MAX_LEVEL, level | 0));
    var size = L <= 5 ? 3 : L <= 12 ? 4 : L <= 22 ? 5 : 6;
    var colors = L <= 3 ? 3 : L <= 12 ? 4 : 5;
    var k = Math.min(size * size - 1, 1 + Math.floor(L / 2));
    var slack = L <= 5 ? 2 : L <= 18 ? 2 : 3;
    return { level: L, size: size, colors: colors, k: k, limit: k + slack };
  }

  function neighbours(size, i) {
    var r = Math.floor(i / size), c = i % size, out = [i];
    if (r > 0) out.push(i - size);
    if (r < size - 1) out.push(i + size);
    if (c > 0) out.push(i - 1);
    if (c < size - 1) out.push(i + 1);
    return out;
  }

  function shift(grid, size, colors, i, delta) {
    var g = grid.slice();
    neighbours(size, i).forEach(function (j) { g[j] = ((g[j] + delta) % colors + colors) % colors; });
    return g;
  }

  function isSolved(grid) {
    for (var i = 1; i < grid.length; i++) if (grid[i] !== grid[0]) return false;
    return true;
  }

  function generate(level) {
    var p = params(level), n = p.size * p.size;
    for (var attempt = 0; attempt < 50; attempt++) {
      var rng = mulberry32(level * 9973 + 17 + attempt * 7919);
      var base = Math.floor(rng() * p.colors);
      var grid = new Array(n).fill(base);
      var cells = [];
      for (var i = 0; i < n; i++) cells.push(i);
      for (var s = n - 1; s > 0; s--) { var j = Math.floor(rng() * (s + 1)); var tmp = cells[s]; cells[s] = cells[j]; cells[j] = tmp; }
      var taps = cells.slice(0, p.k);
      taps.forEach(function (c) { grid = shift(grid, p.size, p.colors, c, -1); });
      if (!isSolved(grid)) {
        var needed = new Array(n).fill(0);
        taps.forEach(function (c) { needed[c] = 1; });
        return { params: p, grid: grid, needed: needed };
      }
    }
    throw new Error('Could not generate level ' + level);
  }

  /* Which tile still needs tapping to reach the generator's solution, given the
   * player's tap counts so far. Returns -1 if none (board already solvable via other route). */
  function hint(level, tapsSoFar) {
    var lv = generate(level), C = lv.params.colors;
    for (var i = 0; i < lv.needed.length; i++) {
      var rem = ((lv.needed[i] - (tapsSoFar[i] || 0)) % C + C) % C;
      if (rem > 0) return i;
    }
    return -1;
  }

  function stars(moves, p, usedHint) {
    var s = moves <= p.k ? 3 : moves <= p.k + 1 ? 2 : 1;
    return usedHint ? Math.min(2, s) : s;
  }

  function levelScore(moves, p, usedHint) {
    return stars(moves, p, usedHint) * 100 + Math.max(0, p.limit - moves) * 20;
  }

  var api = { MAX_LEVEL: MAX_LEVEL, params: params, neighbours: neighbours, shift: shift, isSolved: isSolved,
    generate: generate, hint: hint, stars: stars, levelScore: levelScore, mulberry32: mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChromaCore = api;
})(typeof self !== 'undefined' ? self : this);
