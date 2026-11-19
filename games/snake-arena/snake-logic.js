/* Snake Arena rules (pure logic, tick based). Grid cells are {x, y}; the snake's head is body[0].
 * Solo: createGame/tick. Two players on one device: createMatch/tickMatch (two snakes, one arena).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SnakeLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  var OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  var SPEEDS = { relaxed: { start: 6, max: 12 }, classic: { start: 8, max: 16 }, fast: { start: 11, max: 22 } }; // ticks per second

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function createGame(opts) {
    opts = opts || {};
    var cols = opts.cols || 20, rows = opts.rows || 20, cx = Math.floor(cols / 4) + 1, cy = Math.floor(rows / 2);
    var s = { cols: cols, rows: rows, speed: SPEEDS[opts.speed] ? opts.speed : 'classic', walls: opts.walls !== false,
      body: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }], dir: 'right', queue: [], grow: 0,
      food: null, bonus: null, score: 0, eaten: 0, over: false, ticks: 0,
      rng: opts.rng || (opts.seed != null ? mulberry(opts.seed) : Math.random) };
    s.food = freeCell(s);
    return s;
  }

  function occupied(s, x, y) { for (var i = 0; i < s.body.length; i++) if (s.body[i].x === x && s.body[i].y === y) return true; return false; }
  function freeCell(s) {
    var free = [];
    for (var y = 0; y < s.rows; y++) for (var x = 0; x < s.cols; x++) if (!occupied(s, x, y) && !(s.food && s.food.x === x && s.food.y === y)) free.push({ x: x, y: y });
    return free.length ? free[Math.floor(s.rng() * free.length)] : null;
  }

  /** Queue a turn. Up to 2 queued turns so fast double-taps (e.g. up then left) are not lost. Reversing is ignored. */
  function turn(s, dir) {
    if (!DIRS[dir] || s.over) return false;
    var last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if (dir === last || dir === OPP[last] || s.queue.length >= 2) return false;
    s.queue.push(dir); return true;
  }

  function tickRate(s) { var sp = SPEEDS[s.speed]; return Math.min(sp.max, sp.start + Math.floor(s.eaten / 4)); }

  /** Advance one tick. Returns events. */
  function tick(s) {
    var ev = [];
    if (s.over) return ev;
    if (s.queue.length) s.dir = s.queue.shift();
    var d = DIRS[s.dir], head = s.body[0], nx = head.x + d.x, ny = head.y + d.y;
    if (!s.walls) { nx = (nx + s.cols) % s.cols; ny = (ny + s.rows) % s.rows; }
    if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) { s.over = true; ev.push({ type: 'crash', cause: 'wall' }); return ev; }
    // moving into the tail cell is allowed when the tail moves away this tick
    var tailMoves = s.grow === 0;
    for (var i = 0; i < s.body.length - (tailMoves ? 1 : 0); i++) {
      if (s.body[i].x === nx && s.body[i].y === ny) { s.over = true; ev.push({ type: 'crash', cause: 'self' }); return ev; }
    }
    s.body.unshift({ x: nx, y: ny });
    if (s.grow > 0) s.grow--; else s.body.pop();
    s.ticks++;
    if (s.food && nx === s.food.x && ny === s.food.y) {
      s.grow += 1; s.eaten++; s.score += 10; ev.push({ type: 'eat' });
      s.food = freeCell(s);
      if (!s.bonus && s.eaten % 5 === 0) { var b = freeCell(s); if (b) { b.ttl = 40; s.bonus = b; } }
      if (!s.food) { s.over = true; ev.push({ type: 'win' }); }
    }
    if (s.bonus) {
      if (nx === s.bonus.x && ny === s.bonus.y) { s.grow += 3; s.score += 50; s.bonus = null; ev.push({ type: 'bonus' }); }
      else if (--s.bonus.ttl <= 0) s.bonus = null;
    }
    return ev;
  }

  /* ---- Versus: two snakes on one arena (2 players on one device). Both move on the same tick.
   * A snake dies on a wall, on any body (its own or the other's), or in a head-on collision (same cell, or the
   * two heads swapping places). The round ends as soon as a snake dies: the survivor wins; if both die on the
   * same tick it is a draw. */
  function createMatch(opts) {
    opts = opts || {};
    var cols = opts.cols || 20, rows = opts.rows || 20, y1 = Math.floor(rows / 3), y2 = rows - 1 - y1;
    function snake(x, y, dir) {
      var dx = dir === 'right' ? -1 : 1;
      return { body: [{ x: x, y: y }, { x: x + dx, y: y }, { x: x + 2 * dx, y: y }], dir: dir, queue: [], grow: 0, alive: true, score: 0, eaten: 0 };
    }
    var m = { cols: cols, rows: rows, speed: SPEEDS[opts.speed] ? opts.speed : 'classic', walls: true, versus: true,
      snakes: [snake(3, y1, 'right'), snake(cols - 4, y2, 'left')], food: null, eaten: 0, over: false, winner: null, ticks: 0,
      rng: opts.rng || (opts.seed != null ? mulberry(opts.seed) : Math.random) };
    m.food = freeCellMatch(m);
    return m;
  }
  function occupiedMatch(m, x, y) {
    for (var k = 0; k < m.snakes.length; k++) { var b = m.snakes[k].body; for (var i = 0; i < b.length; i++) if (b[i].x === x && b[i].y === y) return true; }
    return false;
  }
  function freeCellMatch(m) {
    var free = [];
    for (var y = 0; y < m.rows; y++) for (var x = 0; x < m.cols; x++) if (!occupiedMatch(m, x, y)) free.push({ x: x, y: y });
    return free.length ? free[Math.floor(m.rng() * free.length)] : null;
  }
  /** Queue a turn for player p (0 or 1), with the same rules as solo turn(). */
  function turnP(m, p, dir) { var s = m.snakes[p]; if (!s || !s.alive || m.over) return false; return turn(s, dir); }
  function tickRateMatch(m) { var sp = SPEEDS[m.speed]; return Math.min(sp.max, sp.start + Math.floor(m.eaten / 6)); }
  function tickMatch(m) {
    var ev = [];
    if (m.over) return ev;
    var next = m.snakes.map(function (s) {
      if (s.queue.length) s.dir = s.queue.shift();
      var d = DIRS[s.dir], h = s.body[0];
      return { x: h.x + d.x, y: h.y + d.y };
    });
    var dead = m.snakes.map(function () { return false; });
    m.snakes.forEach(function (s, p) {
      var n = next[p];
      if (n.x < 0 || n.y < 0 || n.x >= m.cols || n.y >= m.rows) { dead[p] = 'wall'; return; }
      // bodies as they will be after this tick: a tail that moves away frees its cell
      for (var k = 0; k < m.snakes.length; k++) {
        var o = m.snakes[k], len = o.body.length - (o.grow === 0 ? 1 : 0);
        for (var i = 0; i < len; i++) if (o.body[i].x === n.x && o.body[i].y === n.y) { dead[p] = k === p ? 'self' : 'other'; return; }
      }
    });
    if (next[0].x === next[1].x && next[0].y === next[1].y) dead[0] = dead[1] = 'head-on';
    var h0 = m.snakes[0].body[0], h1 = m.snakes[1].body[0];
    if (next[0].x === h1.x && next[0].y === h1.y && next[1].x === h0.x && next[1].y === h0.y) dead[0] = dead[1] = 'head-on';
    m.snakes.forEach(function (s, p) {
      if (dead[p]) { s.alive = false; ev.push({ type: 'crash', player: p, cause: dead[p] }); return; }
      s.body.unshift(next[p]);
      if (s.grow > 0) s.grow--; else s.body.pop();
    });
    m.ticks++;
    m.snakes.forEach(function (s, p) {
      if (s.alive && m.food && s.body[0].x === m.food.x && s.body[0].y === m.food.y) {
        s.grow += 1; s.eaten++; s.score += 10; m.eaten++; ev.push({ type: 'eat', player: p });
        m.food = freeCellMatch(m);
      }
    });
    var alive = m.snakes.filter(function (s) { return s.alive; }).length;
    if (alive < m.snakes.length) {
      m.over = true;
      m.winner = alive === 0 ? 'draw' : m.snakes[0].alive ? 0 : 1;
      ev.push({ type: 'over', winner: m.winner });
    }
    return ev;
  }

  return { DIRS: DIRS, SPEEDS: SPEEDS, createGame: createGame, turn: turn, tick: tick, tickRate: tickRate, freeCell: freeCell, mulberry: mulberry,
    createMatch: createMatch, turnP: turnP, tickMatch: tickMatch, tickRateMatch: tickRateMatch };
});
