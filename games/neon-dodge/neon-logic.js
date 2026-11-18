/* Neon Dodge: pure helpers (no DOM) so they can be unit-tested in Node. */
(function (root) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* Circle (cx,cy,r) vs axis-aligned rect (x,y,w,h). */
  function circleRect(cx, cy, r, x, y, w, h) {
    var nx = clamp(cx, x, x + w), ny = clamp(cy, y, y + h);
    var dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function circleCircle(ax, ay, ar, bx, by, br) {
    var dx = ax - bx, dy = ay - by, rr = ar + br;
    return dx * dx + dy * dy < rr * rr;
  }

  /* Difficulty curve. t = seconds survived. Units are "u" (1% of the short screen side). */
  function difficulty(t) {
    var level = 1 + Math.floor(t / 15);
    return {
      level: level,
      barEvery: Math.max(0.2, 0.95 - 0.075 * (level - 1)),   // seconds between bars
      barSpeed: 26 + 6 * (level - 1),                          // u per second
      shards: level >= 2,
      shardEvery: Math.max(0.9, 3.2 - 0.3 * (level - 2)),
      lasers: level >= 3,
      laserEvery: Math.max(1.6, 5.5 - 0.45 * (level - 3)),
      laserWarn: Math.max(0.65, 1.2 - 0.05 * (level - 3)),
      coreEvery: 4.5
    };
  }

  function score(t, bonus) { return Math.floor(t * 10) + (bonus | 0); }

  var api = { clamp: clamp, circleRect: circleRect, circleCircle: circleCircle, difficulty: difficulty, score: score };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NeonLogic = api;
})(typeof self !== 'undefined' ? self : this);
