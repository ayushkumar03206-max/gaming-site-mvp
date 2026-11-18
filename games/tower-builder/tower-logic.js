/* Tower Builder rules (pure logic). World is 100 units wide; each floor is 1 unit tall in "floors".
 * A block slides left/right above the tower. drop() keeps the overlapping part and cuts the overhang.
 * Landing within PERFECT units of the floor below snaps exactly and counts as a perfect drop;
 * three perfects in a row widen the block again (up to its starting width).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TowerLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var W = 100, START_W = 56, PERFECT = 1.6, GROW = 4;

  function createGame() {
    var base = { x: (W - START_W) / 2, w: START_W };
    var g = { floors: [base], moving: null, score: 0, perfects: 0, streak: 0, bestStreak: 0, over: false, cut: null };
    spawnBlock(g);
    return g;
  }
  function height(g) { return g.floors.length - 1; } // floors built on top of the base

  /** Slide speed in world units per second; rises with height and is capped. */
  function speed(g) { return Math.min(95, 38 + height(g) * 2.2); }

  function spawnBlock(g) {
    var top = g.floors[g.floors.length - 1], fromLeft = g.floors.length % 2 === 0;
    g.moving = { x: fromLeft ? -top.w : W, w: top.w, dir: fromLeft ? 1 : -1 };
  }

  function step(g, dt) {
    if (g.over || !g.moving) return;
    var m = g.moving, v = speed(g);
    m.x += m.dir * v * dt;
    // bounce between just off-screen on each side so every position is reachable
    var minX = -m.w * 0.6, maxX = W - m.w * 0.4;
    if (m.x > maxX) { m.x = maxX; m.dir = -1; }
    if (m.x < minX) { m.x = minX; m.dir = 1; }
  }

  /** Drop the moving block. Returns {result: 'perfect'|'cut'|'miss', kept, cut}. */
  function drop(g) {
    if (g.over || !g.moving) return { result: 'none' };
    var top = g.floors[g.floors.length - 1], m = g.moving;
    var off = m.x - top.x;
    if (Math.abs(off) <= PERFECT) {
      g.streak++; g.perfects++; g.bestStreak = Math.max(g.bestStreak, g.streak);
      var w = top.w;
      if (g.streak >= 3 && w < START_W) w = Math.min(START_W, w + GROW);
      var placed = { x: top.x - (w - top.w) / 2, w: w };
      g.floors.push(placed); g.score += 1 + Math.min(g.streak, 5); g.cut = null;
      spawnBlock(g);
      return { result: 'perfect', kept: placed, streak: g.streak };
    }
    g.streak = 0;
    var left = Math.max(m.x, top.x), right = Math.min(m.x + m.w, top.x + top.w);
    if (right <= left) {
      g.over = true; g.cut = { x: m.x, w: m.w }; g.moving = null;
      return { result: 'miss', cut: g.cut };
    }
    var kept = { x: left, w: right - left };
    var cut = off > 0 ? { x: right, w: m.x + m.w - right } : { x: m.x, w: left - m.x };
    g.floors.push(kept); g.score += 1; g.cut = cut;
    spawnBlock(g);
    return { result: 'cut', kept: kept, cut: cut };
  }

  return { W: W, START_W: START_W, PERFECT: PERFECT, createGame: createGame, step: step, drop: drop, speed: speed, height: height };
});
