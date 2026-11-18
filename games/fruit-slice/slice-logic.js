/* Fruit Slice simulation (pure logic). Coordinates are pixels of the play area (W x H), y grows downward.
 * A round lasts ROUND seconds. Fruits are tossed up from below; swipe segments slice them.
 * Slicing a bomb costs BOMB_PENALTY seconds and resets the combo. Letting fruit fall costs nothing but the points.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SliceLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var ROUND = 60, BOMB_PENALTY = 5, COMBO_WINDOW = 0.3;
  var KINDS = [
    { k: 'melon', c: '#3ddc84', in: '#ff5d6c', pts: 1, r: 1.25 },
    { k: 'orange', c: '#ffa024', in: '#ffd27a', pts: 1, r: 1.0 },
    { k: 'apple', c: '#ff3f5a', in: '#fff1c9', pts: 1, r: 0.95 },
    { k: 'lime', c: '#a8e63a', in: '#e9ffb0', pts: 1, r: 0.85 },
    { k: 'plum', c: '#9b5cff', in: '#ffd1f0', pts: 1, r: 0.8 },
    { k: 'star', c: '#ffd23f', in: '#fff6c2', pts: 3, r: 0.75 } // rare star fruit, worth 3
  ];

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function createGame(W, H, opts) {
    opts = opts || {};
    var s = { W: W, H: H, time: ROUND, elapsed: 0, score: 0, sliced: 0, missed: 0, bombs: 0, bestCombo: 0,
      combo: 0, comboTimer: 0, items: [], halves: [], nextWave: 0.6, over: false, uid: 0,
      rng: opts.rng || (opts.seed != null ? mulberry(opts.seed) : Math.random) };
    return s;
  }
  function unit(s) { return Math.min(s.W, s.H) / 100; }
  function gravity(s) { return s.H * 1.15; }

  /** Velocity needed to reach a peak height `rise` (px) under gravity g. */
  function launchVy(g, rise) { return -Math.sqrt(2 * g * rise); }

  function spawnWave(s) {
    var u = unit(s), g = gravity(s), level = Math.min(1, s.elapsed / 50);
    var n = 1 + Math.floor(s.rng() * (2 + level * 3));
    var bombChance = 0.08 + level * 0.12;
    for (var i = 0; i < n; i++) {
      var isBomb = i > 0 && s.rng() < bombChance; // a wave never starts with a bomb, so there is always fruit
      var kind = isBomb ? null : (s.rng() < 0.06 ? KINDS[5] : KINDS[Math.floor(s.rng() * 5)]);
      var x = s.W * (0.15 + s.rng() * 0.7), rise = s.H * (0.55 + s.rng() * 0.3);
      var targetX = s.W * (0.25 + s.rng() * 0.5), tUp = Math.sqrt(2 * rise / g);
      s.items.push({ id: ++s.uid, bomb: isBomb, kind: kind, x: x, y: s.H + 6 * u, r: (isBomb ? 4.2 : 5.2 * kind.r) * u,
        vx: (targetX - x) / tUp / 1.6, vy: launchVy(g, rise + 6 * u), rot: 0, vr: (s.rng() - 0.5) * 6, delay: i * 0.12, sliced: false });
    }
    s.nextWave = 1.4 - level * 0.55 + s.rng() * 0.5;
  }

  /** Distance from point to segment. */
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var cx = ax + t * dx - px, cy = ay + t * dy - py;
    return Math.sqrt(cx * cx + cy * cy);
  }

  /** Apply one swipe segment. Returns events. */
  function slice(s, ax, ay, bx, by) {
    var ev = [];
    if (s.over) return ev;
    for (var i = s.items.length - 1; i >= 0; i--) {
      var it = s.items[i];
      if (it.delay > 0 || it.sliced) continue;
      if (segDist(it.x, it.y, ax, ay, bx, by) > it.r) continue;
      it.sliced = true; s.items.splice(i, 1);
      var ang = Math.atan2(by - ay, bx - ax);
      if (it.bomb) {
        s.bombs++; s.time = Math.max(0, s.time - BOMB_PENALTY); s.combo = 0; s.comboTimer = 0;
        ev.push({ type: 'bomb', x: it.x, y: it.y });
        continue;
      }
      s.combo = s.comboTimer > 0 ? s.combo + 1 : 1; s.comboTimer = COMBO_WINDOW;
      var pts = it.kind.pts * Math.min(s.combo, 5); // combo multiplier up to x5
      s.score += pts; s.sliced++; s.bestCombo = Math.max(s.bestCombo, s.combo);
      s.halves.push({ x: it.x, y: it.y, vx: it.vx - Math.sin(ang) * 60, vy: it.vy, r: it.r, kind: it.kind, ang: ang, side: -1, rot: it.rot, age: 0 });
      s.halves.push({ x: it.x, y: it.y, vx: it.vx + Math.sin(ang) * 60, vy: it.vy, r: it.r, kind: it.kind, ang: ang, side: 1, rot: it.rot, age: 0 });
      ev.push({ type: 'slice', x: it.x, y: it.y, pts: pts, combo: s.combo, color: it.kind.in });
    }
    return ev;
  }

  function step(s, dt) {
    var ev = [];
    if (s.over) return ev;
    s.elapsed += dt; s.time -= dt;
    if (s.comboTimer > 0) s.comboTimer -= dt;
    s.nextWave -= dt;
    if (s.nextWave <= 0) spawnWave(s);
    var g = gravity(s);
    for (var i = s.items.length - 1; i >= 0; i--) {
      var it = s.items[i];
      if (it.delay > 0) { it.delay -= dt; continue; }
      it.vy += g * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vr * dt;
      if (it.vy > 0 && it.y - it.r > s.H) { s.items.splice(i, 1); if (!it.bomb) { s.missed++; ev.push({ type: 'miss' }); } }
    }
    for (var h = s.halves.length - 1; h >= 0; h--) {
      var q = s.halves[h]; q.age += dt; q.vy += g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.side * 3 * dt;
      if (q.y - q.r > s.H + 50) s.halves.splice(h, 1);
    }
    if (s.time <= 0) { s.time = 0; s.over = true; ev.push({ type: 'timeUp' }); }
    return ev;
  }

  function resize(s, W, H) {
    var sx = W / s.W, sy = H / s.H;
    s.items.concat(s.halves).forEach(function (o) { o.x *= sx; o.y *= sy; o.vx *= sx; o.vy *= sy; });
    s.W = W; s.H = H;
  }

  return { ROUND: ROUND, BOMB_PENALTY: BOMB_PENALTY, COMBO_WINDOW: COMBO_WINDOW, KINDS: KINDS, createGame: createGame,
    step: step, slice: slice, segDist: segDist, spawnWave: spawnWave, resize: resize, mulberry: mulberry };
});
