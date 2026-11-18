/* Highway Rush simulation (pure logic, no DOM). Works in the browser and in Node tests.
 *
 * Units: x is measured in lanes (lane centres are 0..lanes-1), y in car lengths
 * ahead of the player (player is always at y = 0). Traffic rows all drive at the
 * same speed, so the spacing between rows never shrinks and every row is passable:
 * each new row leaves at least one free lane next to (or equal to) a free lane of
 * the previous row, with enough distance to steer one lane at the current speed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RushLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LANES = 4, STEER = 3.4; // lanes per second
  var START_LANE = 1, GRACE_ROWS = 2; // the first rows never block the starting lane
  var CAR_W = 0.56, CAR_L = 0.9; // collision half-extents (lanes / car lengths), slightly forgiving
  var METERS_PER_CAR = 4.5;
  var DIFFS = {
    easy: { base: 7, accel: 0.10, max: 15, traffic: 3.5, react: 0.8, maxBlocked: 2, coinChance: 0.55 },
    normal: { base: 8, accel: 0.16, max: 19, traffic: 4, react: 0.62, maxBlocked: 3, coinChance: 0.5 },
    hard: { base: 9.5, accel: 0.24, max: 23, traffic: 4.5, react: 0.5, maxBlocked: 3, coinChance: 0.45 }
  };

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function createRun(diffKey, opts) {
    opts = opts || {};
    var d = DIFFS[diffKey] || DIFFS.normal;
    return {
      diff: diffKey in DIFFS ? diffKey : 'normal', d: d, lanes: LANES, rng: opts.rng || (opts.seed != null ? mulberry(opts.seed) : Math.random),
      x: START_LANE, time: 0, dist: 0, speed: d.base, coins: 0, traffic: [], pickups: [], rows: 0,
      lastFree: [0, 1, 2, 3], lastRowY: 0, spawnAhead: opts.spawnAhead || 14, over: false, nearMisses: 0
    };
  }

  function speedAt(d, time) { return Math.min(d.max, d.base + d.accel * time); }
  function rowGap(s) { return Math.max(3.2, (s.speed - s.d.traffic) * s.d.react + 2.2); }

  /** Picks blocked lanes for a new row so at least one free lane is within 1 of a previous free lane. */
  function makeRow(s) {
    var rng = s.rng, n = s.lanes;
    for (var attempt = 0; attempt < 60; attempt++) {
      var k = 1 + Math.floor(rng() * s.d.maxBlocked), lanes = [];
      for (var i = 0; i < n; i++) lanes.push(i);
      for (var j = n - 1; j > 0; j--) { var r = Math.floor(rng() * (j + 1)), t = lanes[j]; lanes[j] = lanes[r]; lanes[r] = t; }
      var blocked = lanes.slice(0, k).sort(), free = lanes.slice(k).sort();
      if (reachable(s.lastFree, free)) return { blocked: blocked, free: free };
    }
    // fallback: keep the previous free lanes open
    var fb = []; for (var q = 0; q < n; q++) if (s.lastFree.indexOf(q) < 0) fb.push(q);
    return { blocked: fb.slice(0, Math.min(fb.length, s.d.maxBlocked)), free: s.lastFree.slice() };
  }
  /** Fair for every choice: whichever free lane the player used in the previous row,
   *  the new row has a free lane at most one lane away from it. */
  function reachable(prevFree, free) {
    return prevFree.every(function (p) { return free.some(function (f) { return Math.abs(p - f) <= 1; }); });
  }

  function spawn(s) {
    var row = makeRow(s), y = s.spawnAhead;
    if (s.rows < GRACE_ROWS && row.blocked.indexOf(START_LANE) >= 0) {
      row.blocked = row.blocked.filter(function (l) { return l !== START_LANE; });
      row.free = row.free.concat([START_LANE]).sort();
    }
    row.blocked.forEach(function (lane) { s.traffic.push({ lane: lane, y: y + (s.rng() - 0.5) * 0.3, hue: Math.floor(s.rng() * 6), passed: false }); });
    if (s.rng() < s.d.coinChance) {
      var lane = row.free[Math.floor(s.rng() * row.free.length)];
      s.pickups.push({ lane: lane, y: y });
    }
    s.lastFree = row.free; s.lastRowY = y; s.rows++;
  }

  /** Advance the run by dt seconds. input = {left, right, targetX (lanes or null)}. Returns events list. */
  function step(s, dt, input) {
    var ev = [];
    if (s.over) return ev;
    input = input || {};
    s.time += dt;
    s.speed = speedAt(s.d, s.time);
    // steering
    var maxMove = STEER * dt;
    if (input.targetX != null) {
      var dx = clamp(input.targetX, 0, s.lanes - 1) - s.x;
      s.x += clamp(dx, -maxMove * 1.4, maxMove * 1.4);
    } else {
      s.x += ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * maxMove;
    }
    s.x = clamp(s.x, 0, s.lanes - 1);
    // scroll world
    var rel = s.speed - s.d.traffic;
    s.dist += s.speed * dt;
    s.lastRowY -= rel * dt;
    for (var i = s.traffic.length - 1; i >= 0; i--) {
      var c = s.traffic[i];
      c.y -= rel * dt;
      if (Math.abs(s.x - c.lane) < CAR_W && Math.abs(c.y) < CAR_L) { s.over = true; ev.push({ type: 'crash', lane: c.lane }); return ev; }
      if (!c.passed && c.y < -CAR_L) {
        c.passed = true;
        if (Math.abs(s.x - c.lane) < 1.05) { s.nearMisses++; ev.push({ type: 'near' }); }
      }
      if (c.y < -4) s.traffic.splice(i, 1);
    }
    for (var p = s.pickups.length - 1; p >= 0; p--) {
      var k = s.pickups[p];
      k.y -= rel * dt;
      if (Math.abs(s.x - k.lane) < 0.55 && Math.abs(k.y) < 0.7) { s.coins++; s.pickups.splice(p, 1); ev.push({ type: 'coin' }); continue; }
      if (k.y < -4) s.pickups.splice(p, 1);
    }
    if (s.spawnAhead - s.lastRowY >= rowGap(s)) spawn(s);
    return ev;
  }

  function meters(s) { return Math.floor(s.dist * METERS_PER_CAR); }
  function score(s) { return meters(s) + s.coins * 25 + s.nearMisses * 5; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  return { DIFFS: DIFFS, LANES: LANES, createRun: createRun, step: step, speedAt: speedAt, rowGap: rowGap,
    makeRow: makeRow, reachable: reachable, meters: meters, score: score, mulberry: mulberry };
});
