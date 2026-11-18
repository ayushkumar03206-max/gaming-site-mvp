/* Car Parking Challenge rules (pure logic). World is 100 x 150 units, y grows downward.
 * Rectangles are centre-based {x, y, w, h, a} where a is rotation in radians (0 = car facing up).
 * Car physics: simple bicycle model. Collisions use the separating axis test on oriented rectangles.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ParkingLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var W = 100, H = 150, CAR_W = 5.2, CAR_L = 9.6, WHEELBASE = 6.2, MAX_STEER = 0.62;
  var MAX_FWD = 20, MAX_REV = 9, ACCEL = 22, BRAKE = 46, DRAG = 6, PARK_HOLD = 0.6, ANGLE_TOL = 0.14;

  function car(x, y, a, parked) { return { x: x, y: y, w: CAR_W, h: CAR_L, a: a || 0, parked: !!parked }; }
  function box(x, y, w, h, a) { return { x: x, y: y, w: w, h: h, a: a || 0 }; }
  var P = Math.PI;
  // borders are added for every level automatically
  var LEVELS = [
    { name: 'First bay', diff: 'easy', par: 12, start: { x: 50, y: 128, a: 0 }, bay: box(50, 40, 8, 13), obstacles: [car(36, 40, 0, 1), car(64, 40, 0, 1)] },
    { name: 'Turn in', diff: 'easy', par: 15, start: { x: 20, y: 128, a: 0 }, bay: box(78, 70, 8, 13, P / 2), obstacles: [car(78, 56, P / 2, 1), car(78, 84, P / 2, 1), box(50, 18, 100, 4)] },
    { name: 'Back it in', diff: 'easy', par: 16, start: { x: 50, y: 50, a: 0 }, bay: box(50, 125, 8, 13), obstacles: [car(36, 125, 0, 1), car(64, 125, 0, 1), box(22, 125, 4, 30), box(78, 125, 4, 30)] },
    { name: 'Row of cars', diff: 'medium', par: 18, start: { x: 14, y: 130, a: 0 }, bay: box(56, 34, 7.5, 12.5), obstacles: [car(20, 34, 0, 1), car(32, 34, 0, 1), car(44, 34, 0, 1), car(68, 34, 0, 1), car(80, 34, 0, 1), box(50, 80, 60, 4)] },
    { name: 'Parallel', diff: 'medium', par: 22, start: { x: 50, y: 135, a: 0 }, bay: box(88, 70, 7.5, 15), obstacles: [car(88, 52, 0, 1), car(88, 88, 0, 1), box(97, 70, 2, 150)] },
    { name: 'Angled bay', diff: 'medium', par: 18, start: { x: 20, y: 130, a: 0 }, bay: box(70, 45, 8, 13, 0.6), obstacles: [car(58, 38, 0.6, 1), car(82, 52, 0.6, 1), box(30, 70, 4, 40)] },
    { name: 'Tight garage', diff: 'hard', par: 24, start: { x: 50, y: 135, a: 0 }, bay: box(50, 22, 7.2, 12), obstacles: [box(44, 30, 2, 26), box(56, 30, 2, 26), box(28, 70, 40, 4), box(72, 95, 40, 4)] },
    { name: 'Reverse parallel', diff: 'hard', par: 28, start: { x: 50, y: 40, a: P }, bay: box(12, 95, 7.2, 14.5), obstacles: [car(12, 78, 0, 1), car(12, 112, 0, 1), box(3, 95, 2, 150), box(50, 70, 4, 30), car(70, 120, 0.3, 1)] },
    { name: 'Around the block', diff: 'hard', par: 30, start: { x: 15, y: 135, a: 0 }, bay: box(86, 22, 7.2, 12, 0), obstacles: [box(35, 75, 70, 4), box(76, 22, 2, 18), box(96, 22, 2, 18), car(45, 112, P / 2, 1), car(88, 100, 0, 1), car(62, 48, P / 2, 1)] }
  ];

  function corners(r) {
    var c = Math.cos(r.a), s = Math.sin(r.a), hw = r.w / 2, hh = r.h / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (p) { return { x: r.x + p[0] * c - p[1] * s, y: r.y + p[0] * s + p[1] * c }; });
  }
  function overlap(a, b) {
    var ca = corners(a), cb = corners(b), axes = [];
    [ca, cb].forEach(function (cs) { for (var i = 0; i < 2; i++) { var p = cs[i], q = cs[i + 1]; axes.push({ x: q.y - p.y, y: p.x - q.x }); } });
    for (var k = 0; k < axes.length; k++) {
      var ax = axes[k], minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      ca.forEach(function (p) { var d = p.x * ax.x + p.y * ax.y; minA = Math.min(minA, d); maxA = Math.max(maxA, d); });
      cb.forEach(function (p) { var d = p.x * ax.x + p.y * ax.y; minB = Math.min(minB, d); maxB = Math.max(maxB, d); });
      if (maxA < minB || maxB < minA) return false;
    }
    return true;
  }
  function pointIn(p, r) {
    var c = Math.cos(-r.a), s = Math.sin(-r.a), dx = p.x - r.x, dy = p.y - r.y;
    var lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2;
  }
  function angleDiff(a, b) { var d = (a - b) % (2 * P); if (d > P) d -= 2 * P; if (d < -P) d += 2 * P; return d; }

  function walls() { return [box(W / 2, -1, W, 2), box(W / 2, H + 1, W, 2), box(-1, H / 2, 2, H), box(W + 1, H / 2, 2, H)]; }

  function createGame(levelIdx) {
    var L = LEVELS[levelIdx] || LEVELS[0];
    return { level: levelIdx, def: L, car: { x: L.start.x, y: L.start.y, a: L.start.a, w: CAR_W, h: CAR_L, speed: 0, steer: 0 },
      obstacles: L.obstacles.concat(walls()), bay: L.bay, time: 0, hold: 0, state: 'driving', inBay: false };
  }

  /** Does the car fit the bay: all corners inside and facing either way along the bay? */
  function parkedOk(g) {
    var cs = corners(g.car);
    if (!cs.every(function (p) { return pointIn(p, g.bay); })) return false;
    var d = Math.abs(angleDiff(g.car.a, g.bay.a));
    return d < ANGLE_TOL || Math.abs(d - P) < ANGLE_TOL;
  }

  /** input: {throttle: -1..1, steer: -1..1, brake: bool}. Returns events. */
  function step(g, dt, input) {
    var ev = [];
    if (g.state !== 'driving') return ev;
    input = input || {};
    var c = g.car, th = input.throttle || 0;
    g.time += dt;
    // steering eases toward the input
    c.steer += ((input.steer || 0) * MAX_STEER - c.steer) * Math.min(1, dt * 8);
    if (input.brake || (th && Math.sign(th) !== Math.sign(c.speed) && Math.abs(c.speed) > 0.5)) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), BRAKE * dt);
    else if (th) c.speed += th * ACCEL * dt;
    else c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), DRAG * dt);
    c.speed = Math.max(-MAX_REV, Math.min(MAX_FWD, c.speed));
    // bicycle model: heading changes with speed and steering; forward is -y when a = 0
    c.a += c.speed / WHEELBASE * Math.tan(c.steer) * dt;
    c.x += Math.sin(c.a) * c.speed * dt;
    c.y -= Math.cos(c.a) * c.speed * dt;
    for (var i = 0; i < g.obstacles.length; i++) {
      if (overlap(c, g.obstacles[i])) { g.state = 'crashed'; ev.push({ type: 'crash' }); return ev; }
    }
    g.inBay = parkedOk(g);
    if (g.inBay && Math.abs(c.speed) < 0.6) {
      g.hold += dt;
      if (g.hold >= PARK_HOLD) { g.state = 'parked'; ev.push({ type: 'parked', time: g.time, stars: stars(g) }); }
    } else g.hold = 0;
    return ev;
  }
  function stars(g) { return g.time <= g.def.par ? 3 : g.time <= g.def.par * 1.6 ? 2 : 1; }
  function score(g) { return Math.max(100, Math.round(1000 - Math.max(0, g.time - g.def.par) * 25)) * (stars(g) === 3 ? 1.5 : 1) | 0; }

  return { W: W, H: H, LEVELS: LEVELS, CAR_W: CAR_W, CAR_L: CAR_L, WHEELBASE: WHEELBASE, MAX_STEER: MAX_STEER, createGame: createGame, step: step, overlap: overlap, corners: corners,
    pointIn: pointIn, parkedOk: parkedOk, stars: stars, score: score, angleDiff: angleDiff };
});
