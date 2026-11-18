/* Bubble Shooter rules (pure logic). Hex-packed grid, odd rows shifted right by half a bubble.
 * World: W = COLS*D + D/2 wide, H tall. Bubbles: colour index 0..5, or 'bomb' / 'rainbow' specials (only in the shooter).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BubbleLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var COLS = 10, D = 10, R = D / 2, ROW_H = D * Math.sqrt(3) / 2, W = COLS * D + R, H = 150;
  var LINE_Y = 124, SHOOTER = { x: W / 2, y: 140 }, SPEED = 190, MAX_ROWS = 20, MISSES_PER_DROP = 5;

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function levelSpec(level) { return { colors: Math.min(6, 3 + Math.ceil(level / 2)), rows: Math.min(9, 4 + level) }; }

  function createGame(opts) {
    opts = opts || {};
    var g = { level: 0, score: 0, over: false, won: false, shots: 0, misses: 0, ceil: 0, grid: [], shot: null, current: null, next: null,
      rng: opts.rng || (opts.seed != null ? mulberry(opts.seed) : Math.random), levelClear: false };
    startLevel(g, opts.level || 1);
    return g;
  }
  function startLevel(g, level) {
    var sp = levelSpec(level);
    g.level = level; g.colors = sp.colors; g.ceil = 0; g.misses = 0; g.shot = null; g.levelClear = false;
    g.grid = [];
    for (var r = 0; r < MAX_ROWS; r++) { var row = []; for (var c = 0; c < COLS; c++) row.push(r < sp.rows ? Math.floor(g.rng() * sp.colors) : null); g.grid.push(row); }
    g.current = randomAmmo(g); g.next = randomAmmo(g);
  }

  function pos(g, r, c) { return { x: c * D + R + (r % 2 ? R : 0), y: (r + g.ceil) * ROW_H + R }; }
  function neighbors(r, c) {
    var odd = r % 2, d = odd ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
    var out = [];
    d.forEach(function (o) { var rr = r + o[0], cc = c + o[1]; if (rr >= 0 && rr < MAX_ROWS && cc >= 0 && cc < COLS) out.push([rr, cc]); });
    return out;
  }
  function presentColors(g) {
    var s = {};
    g.grid.forEach(function (row) { row.forEach(function (v) { if (v !== null) s[v] = 1; }); });
    return Object.keys(s).map(Number);
  }
  /** Ammo only uses colours still on the board; every 12th shot is a special. */
  function randomAmmo(g) {
    if (g.shots > 0 && g.shots % 12 === 0 && g.rng() < 0.85) return g.rng() < 0.5 ? 'bomb' : 'rainbow';
    var cs = presentColors(g); if (!cs.length) cs = [0];
    return cs[Math.floor(g.rng() * cs.length)];
  }

  /** Fire at angle (radians, 0 = straight up, negative = left). Clamped to +-80 degrees. */
  function fire(g, angle) {
    if (g.over || g.shot || g.levelClear) return false;
    var a = Math.max(-1.4, Math.min(1.4, angle));
    g.shot = { x: SHOOTER.x, y: SHOOTER.y, vx: Math.sin(a) * SPEED, vy: -Math.cos(a) * SPEED, v: g.current };
    g.current = g.next; g.next = randomAmmo(g); g.shots++;
    return true;
  }
  function swap(g) { if (g.shot) return; var t = g.current; g.current = g.next; g.next = t; }

  function nearestEmpty(g, x, y) {
    var best = null, bd = Infinity;
    for (var r = 0; r < MAX_ROWS; r++) for (var c = 0; c < COLS; c++) {
      if (g.grid[r][c] !== null) continue;
      // must touch the ceiling or an existing bubble
      var attached = r === 0 || neighbors(r, c).some(function (n) { return g.grid[n[0]][n[1]] !== null; });
      if (!attached) continue;
      var p = pos(g, r, c), d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) { bd = d; best = [r, c]; }
    }
    return best;
  }

  function step(g, dt) {
    var ev = [];
    if (!g.shot || g.over) return ev;
    var s = g.shot, n = Math.ceil(SPEED * dt / 2);
    for (var i = 0; i < n; i++) {
      s.x += s.vx * dt / n; s.y += s.vy * dt / n;
      if (s.x < R) { s.x = R; s.vx = Math.abs(s.vx); ev.push({ type: 'bounce' }); }
      if (s.x > W - R) { s.x = W - R; s.vx = -Math.abs(s.vx); ev.push({ type: 'bounce' }); }
      var hit = s.y <= g.ceil * ROW_H + R;
      for (var r = 0; r < MAX_ROWS && !hit; r++) for (var c = 0; c < COLS && !hit; c++) {
        if (g.grid[r][c] === null) continue;
        var p = pos(g, r, c);
        if ((p.x - s.x) * (p.x - s.x) + (p.y - s.y) * (p.y - s.y) < (D * 0.82) * (D * 0.82)) hit = true;
      }
      if (hit) return ev.concat(land(g));
    }
    return ev;
  }

  function land(g) {
    var s = g.shot, ev = [], cell = nearestEmpty(g, s.x, s.y);
    g.shot = null;
    if (!cell) { g.over = true; ev.push({ type: 'gameOver' }); return ev; }
    var r = cell[0], c = cell[1], v = s.v, popped = [];
    if (v === 'bomb') {
      popped = [[r, c]].concat(neighbors(r, c).filter(function (n) { return g.grid[n[0]][n[1]] !== null; }));
      g.grid[r][c] = 0; // placeholder so the cell is cleared below
    } else {
      if (v === 'rainbow') { var ns = neighbors(r, c).map(function (n) { return g.grid[n[0]][n[1]]; }).filter(function (x) { return x !== null; }); v = ns.length ? ns[0] : 0; }
      g.grid[r][c] = v;
      var group = flood(g, r, c, function (x) { return x === v; });
      if (group.length >= 3) popped = group;
    }
    ev.push({ type: 'land', r: r, c: c });
    if (popped.length) {
      popped.forEach(function (p) { ev.push({ type: 'pop', r: p[0], c: p[1], v: g.grid[p[0]][p[1]], x: pos(g, p[0], p[1]).x, y: pos(g, p[0], p[1]).y }); g.grid[p[0]][p[1]] = null; });
      g.score += popped.length * 10;
      var dropped = dropFloating(g);
      dropped.forEach(function (d) { ev.push(d); });
      g.score += dropped.length * 20;
      g.misses = 0;
    } else if (++g.misses >= MISSES_PER_DROP) {
      g.misses = 0; g.ceil++; ev.push({ type: 'ceiling' });
    }
    if (presentColors(g).length === 0) {
      g.levelClear = true; g.score += 500 + g.level * 100; ev.push({ type: 'levelClear' });
      return ev;
    }
    if (lowest(g) + R >= LINE_Y) { g.over = true; ev.push({ type: 'gameOver' }); return ev; }
    // keep ammo valid: replace colours that no longer exist on the board
    var cs = presentColors(g);
    if (typeof g.current === 'number' && cs.indexOf(g.current) < 0) g.current = randomAmmo(g);
    if (typeof g.next === 'number' && cs.indexOf(g.next) < 0) g.next = randomAmmo(g);
    return ev;
  }

  function flood(g, r, c, match) {
    var seen = {}, out = [], stack = [[r, c]];
    while (stack.length) {
      var p = stack.pop(), k = p[0] * COLS + p[1];
      if (seen[k]) continue; seen[k] = 1;
      var v = g.grid[p[0]][p[1]];
      if (v === null || !match(v)) continue;
      out.push(p);
      neighbors(p[0], p[1]).forEach(function (n) { stack.push(n); });
    }
    return out;
  }
  function dropFloating(g) {
    var keep = {};
    for (var c = 0; c < COLS; c++) if (g.grid[0][c] !== null) flood(g, 0, c, function () { return true; }).forEach(function (p) { keep[p[0] * COLS + p[1]] = 1; });
    var out = [];
    for (var r = 0; r < MAX_ROWS; r++) for (var cc = 0; cc < COLS; cc++) {
      if (g.grid[r][cc] !== null && !keep[r * COLS + cc]) { var p = pos(g, r, cc); out.push({ type: 'drop', v: g.grid[r][cc], x: p.x, y: p.y }); g.grid[r][cc] = null; }
    }
    return out;
  }
  function lowest(g) {
    var y = -Infinity;
    for (var r = 0; r < MAX_ROWS; r++) for (var c = 0; c < COLS; c++) if (g.grid[r][c] !== null) y = Math.max(y, pos(g, r, c).y);
    return y;
  }
  function nextLevel(g) { if (g.levelClear) startLevel(g, g.level + 1); }
  function count(g) { var n = 0; g.grid.forEach(function (row) { row.forEach(function (v) { if (v !== null) n++; }); }); return n; }

  return { COLS: COLS, D: D, R: R, ROW_H: ROW_H, W: W, H: H, LINE_Y: LINE_Y, SHOOTER: SHOOTER, MAX_ROWS: MAX_ROWS, MISSES_PER_DROP: MISSES_PER_DROP,
    createGame: createGame, fire: fire, swap: swap, step: step, pos: pos, neighbors: neighbors, flood: flood, dropFloating: dropFloating,
    nextLevel: nextLevel, count: count, presentColors: presentColors, levelSpec: levelSpec, mulberry: mulberry };
});
