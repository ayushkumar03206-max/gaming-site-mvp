/* Tile Fusion rules (sliding-merge number puzzle) (pure logic). Grid is a flat array of 16 numbers (0 = empty), row-major.
 * move() slides and merges toward a direction; each tile merges at most once per move.
 * A seeded RNG lets two players get the exact same tile sequence (shared challenge).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FusionLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var N = 4, UNDO_LIMIT = 3;

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function createGame(opts) {
    opts = opts || {};
    var g = { grid: new Array(N * N).fill(0), score: 0, moves: 0, won: false, keepPlaying: false, over: false,
      history: [], undosLeft: UNDO_LIMIT, rng: opts.rng || (opts.seed != null ? mulberry(opts.seed) : Math.random), lastSpawn: [] };
    g.lastSpawn = [spawn(g), spawn(g)];
    return g;
  }

  function spawn(g) {
    var empty = [];
    for (var i = 0; i < g.grid.length; i++) if (!g.grid[i]) empty.push(i);
    if (!empty.length) return -1;
    var idx = empty[Math.floor(g.rng() * empty.length)];
    g.grid[idx] = g.rng() < 0.9 ? 2 : 4;
    return idx;
  }

  /** Indices of each line in the direction of travel (first = the edge tiles slide toward). */
  function lines(dir) {
    var out = [];
    for (var a = 0; a < N; a++) {
      var line = [];
      for (var b = 0; b < N; b++) {
        if (dir === 'left') line.push(a * N + b);
        else if (dir === 'right') line.push(a * N + (N - 1 - b));
        else if (dir === 'up') line.push(b * N + a);
        else line.push((N - 1 - b) * N + a);
      }
      out.push(line);
    }
    return out;
  }

  /** Slide one line of values. Returns {values, gained, merges:[targetPos...]} */
  function slideLine(vals) {
    var tiles = vals.filter(function (v) { return v; }), out = [], gained = 0, merges = [];
    for (var i = 0; i < tiles.length; i++) {
      if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) { out.push(tiles[i] * 2); gained += tiles[i] * 2; merges.push(out.length - 1); i++; }
      else out.push(tiles[i]);
    }
    while (out.length < N) out.push(0);
    return { values: out, gained: gained, merges: merges };
  }

  /** Returns {moved, gained, merged: [gridIndex...], spawned: gridIndex}. */
  function move(g, dir) {
    if (g.over) return { moved: false };
    var before = g.grid.slice(), gained = 0, merged = [];
    lines(dir).forEach(function (idx) {
      var r = slideLine(idx.map(function (i) { return g.grid[i]; }));
      idx.forEach(function (gi, k) { g.grid[gi] = r.values[k]; });
      gained += r.gained; r.merges.forEach(function (k) { merged.push(idx[k]); });
    });
    var moved = before.some(function (v, i) { return v !== g.grid[i]; });
    if (!moved) return { moved: false };
    g.history.push({ grid: before, score: g.score, won: g.won });
    if (g.history.length > UNDO_LIMIT) g.history.shift();
    g.score += gained; g.moves++;
    var spawned = spawn(g);
    if (!g.won && g.grid.some(function (v) { return v >= 2048; })) g.won = true;
    g.over = !canMove(g);
    return { moved: true, gained: gained, merged: merged, spawned: spawned };
  }

  function canMove(g) {
    for (var i = 0; i < g.grid.length; i++) {
      if (!g.grid[i]) return true;
      var r = Math.floor(i / N), c = i % N;
      if (c < N - 1 && g.grid[i] === g.grid[i + 1]) return true;
      if (r < N - 1 && g.grid[i] === g.grid[i + N]) return true;
    }
    return false;
  }

  /** Undo the last move (up to UNDO_LIMIT per game). Undo does not refund score gained. */
  function undo(g) {
    if (!g.history.length || g.undosLeft <= 0) return false;
    var h = g.history.pop();
    g.grid = h.grid; g.score = h.score; g.won = h.won; g.over = false; g.undosLeft--;
    return true;
  }

  function maxTile(g) { return Math.max.apply(null, g.grid); }

  return { N: N, UNDO_LIMIT: UNDO_LIMIT, createGame: createGame, move: move, slideLine: slideLine, canMove: canMove, undo: undo, maxTile: maxTile, mulberry: mulberry };
});
