/* Brick Breaker simulation (pure logic). World is 100 x 150 units; the renderer scales it.
 * Brick chars: '.' empty, '1'-'3' hit points, '#' steel (unbreakable), 'P' 1-hit brick that always drops a power-up.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BrickLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var W = 100, H = 150, COLS = 10, BW = 9, BH = 4, GAP = 1, TOP = 16;
  var PADDLE_Y = 138, PADDLE_W = 18, PADDLE_H = 3, BALL_R = 1.6;
  var BASE_SPEED = 62, MAX_SPEED = 105, DROP_SPEED = 32, DROP_CHANCE = 0.12;
  var POWERS = ['wide', 'multi', 'slow', 'life'];
  var LEVELS = [
    ['..........', '1111111111', '1111111111', '2222222222', '..........'],
    ['1.1.1.1.1.', '.2.2.2.2.2', '1.1P1.1.1.', '.2.2.2.2.2', '1.1.1.1.1.'],
    ['3333333333', '2222222222', '11P1111P11', '1111111111'],
    ['....##....', '...2222...', '..222222..', '.22P22P22.', '1111111111', '..........'],
    ['#........#', '#2222222.#', '#.111111.#', '#.1P11P1.#', '#.111111.#', '#.......2#'],
    ['3.3.3.3.3.', '2222222222', '#1#1#1#1#1', '1P1111111P', '2222222222'],
    ['.33333333.', '3.......3.', '3.2P22P2.3', '3.2....2.3', '3.222222.3', '.33333333.'],
    ['##.####.##', '3333333333', '2P222222P2', '1111111111', '3333333333', '1111111111']
  ];

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function buildBricks(level) {
    var rows = LEVELS[level % LEVELS.length], out = [];
    rows.forEach(function (row, r) {
      for (var c = 0; c < COLS; c++) {
        var ch = row[c] || '.';
        if (ch === '.') continue;
        var hp = ch === '#' ? Infinity : ch === 'P' ? 1 : +ch;
        out.push({ x: c * (BW + GAP) + GAP / 2, y: TOP + r * (BH + GAP), w: BW, h: BH, hp: hp, maxHp: hp, steel: ch === '#', power: ch === 'P' });
      }
    });
    return out;
  }

  function newBall(s) { return { x: s.paddle.x, y: PADDLE_Y - BALL_R - 0.2, vx: 0, vy: 0, r: BALL_R, stuck: true }; }

  function createGame(opts) {
    opts = opts || {};
    var s = { level: 0, lives: 3, score: 0, over: false, won: false, rng: opts.rng || (opts.seed != null ? mulberry(opts.seed) : Math.random),
      paddle: { x: W / 2, w: PADDLE_W }, balls: [], bricks: [], drops: [], fx: { wide: 0, slow: 0 }, speed: BASE_SPEED, levelClear: false };
    startLevel(s, opts.level || 0);
    return s;
  }
  function startLevel(s, level) {
    s.level = level; s.bricks = buildBricks(level); s.drops = []; s.fx = { wide: 0, slow: 0 };
    s.speed = BASE_SPEED + Math.min(level, 7) * 3; s.paddle.w = PADDLE_W; s.balls = [newBall(s)]; s.levelClear = false;
  }
  function remaining(s) { return s.bricks.filter(function (b) { return !b.steel; }).length; }

  function launch(s) {
    s.balls.forEach(function (b) {
      if (!b.stuck) return;
      var a = (s.rng() - 0.5) * 0.6; // up to ~17 degrees off vertical
      b.vx = Math.sin(a) * s.speed; b.vy = -Math.cos(a) * s.speed; b.stuck = false;
    });
  }

  /** Paddle bounce: angle depends on where the ball hits (centre = straight up, edge = 60 degrees). */
  function paddleBounce(b, paddle, speed) {
    var rel = Math.max(-1, Math.min(1, (b.x - paddle.x) / (paddle.w / 2)));
    var ang = rel * Math.PI / 3;
    b.vx = Math.sin(ang) * speed; b.vy = -Math.abs(Math.cos(ang) * speed);
    b.y = PADDLE_Y - b.r - 0.01;
  }

  /** Circle vs rectangle. Returns null or {nx, ny} = axis to reflect on. */
  function hitRect(b, r) {
    var cx = Math.max(r.x, Math.min(b.x, r.x + r.w)), cy = Math.max(r.y, Math.min(b.y, r.y + r.h));
    var dx = b.x - cx, dy = b.y - cy;
    if (dx * dx + dy * dy > b.r * b.r) return null;
    var penL = b.x + b.r - r.x, penR = r.x + r.w - (b.x - b.r), penT = b.y + b.r - r.y, penB = r.y + r.h - (b.y - b.r);
    var minX = Math.min(penL, penR), minY = Math.min(penT, penB);
    return minX < minY ? { nx: penL < penR ? -1 : 1, ny: 0, pen: minX } : { nx: 0, ny: penT < penB ? -1 : 1, pen: minY };
  }

  function curSpeed(s) { return s.speed * (s.fx.slow > 0 ? 0.7 : 1); }

  /** input: {targetX} (absolute paddle centre) or {dir: -1|0|1}. Returns events. */
  function step(s, dt, input) {
    var ev = [];
    if (s.over || s.levelClear) return ev;
    input = input || {};
    var p = s.paddle;
    s.fx.wide = Math.max(0, s.fx.wide - dt); s.fx.slow = Math.max(0, s.fx.slow - dt);
    p.w = s.fx.wide > 0 ? PADDLE_W * 1.6 : PADDLE_W;
    if (input.targetX != null) p.x = input.targetX;
    else if (input.dir) p.x += input.dir * 95 * dt;
    p.x = Math.max(p.w / 2, Math.min(W - p.w / 2, p.x));

    var spd = curSpeed(s);
    for (var i = s.balls.length - 1; i >= 0; i--) {
      var b = s.balls[i];
      if (b.stuck) { b.x = p.x; b.y = PADDLE_Y - b.r - 0.2; continue; }
      // keep speed consistent with the current effect
      var mag = Math.hypot(b.vx, b.vy) || 1; b.vx = b.vx / mag * spd; b.vy = b.vy / mag * spd;
      var dist = spd * dt, n = Math.max(1, Math.ceil(dist / 0.8)), sdt = dt / n, lost = false;
      for (var k = 0; k < n; k++) {
        b.x += b.vx * sdt; b.y += b.vy * sdt;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); ev.push({ type: 'wall' }); }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); ev.push({ type: 'wall' }); }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); ev.push({ type: 'wall' }); }
        // paddle
        if (b.vy > 0 && b.y + b.r >= PADDLE_Y && b.y + b.r <= PADDLE_Y + PADDLE_H + 2 && Math.abs(b.x - p.x) <= p.w / 2 + b.r * 0.6) {
          paddleBounce(b, p, spd); ev.push({ type: 'paddle' });
        }
        // bricks (one per sub-step)
        for (var j = 0; j < s.bricks.length; j++) {
          var br = s.bricks[j], h = hitRect(b, br);
          if (!h) continue;
          if (h.nx) { b.vx = Math.abs(b.vx) * h.nx; b.x += h.nx * h.pen; } else { b.vy = Math.abs(b.vy) * h.ny; b.y += h.ny * h.pen; }
          if (br.steel) { ev.push({ type: 'steel' }); break; }
          br.hp--; s.score += 5;
          if (br.hp <= 0) {
            s.bricks.splice(j, 1); s.score += 10 * br.maxHp; ev.push({ type: 'break', x: br.x + br.w / 2, y: br.y + br.h / 2 });
            if (br.power || s.rng() < DROP_CHANCE) s.drops.push({ x: br.x + br.w / 2, y: br.y + br.h / 2, type: POWERS[Math.floor(s.rng() * POWERS.length)] });
            s.speed = Math.min(MAX_SPEED, s.speed + 0.35);
          } else ev.push({ type: 'hit' });
          break;
        }
        // avoid near-horizontal loops
        if (Math.abs(b.vy) < spd * 0.2) { b.vy = (b.vy < 0 ? -1 : 1) * spd * 0.2; }
        if (b.y > H + b.r) { lost = true; break; }
      }
      if (lost) s.balls.splice(i, 1);
    }

    for (var d = s.drops.length - 1; d >= 0; d--) {
      var dr = s.drops[d];
      dr.y += DROP_SPEED * dt;
      if (dr.y >= PADDLE_Y - 1.5 && dr.y <= PADDLE_Y + PADDLE_H + 1.5 && Math.abs(dr.x - p.x) <= p.w / 2 + 2) {
        applyPower(s, dr.type); s.drops.splice(d, 1); ev.push({ type: 'power', power: dr.type });
      } else if (dr.y > H + 4) s.drops.splice(d, 1);
    }

    if (!s.balls.length) {
      s.lives--; ev.push({ type: 'lifeLost' });
      if (s.lives <= 0) { s.over = true; ev.push({ type: 'gameOver' }); return ev; }
      s.fx = { wide: 0, slow: 0 }; s.drops = []; s.balls = [newBall(s)];
    }
    if (remaining(s) === 0) {
      s.levelClear = true; s.score += 100 * (s.level + 1);
      if (s.level + 1 >= LEVELS.length) { s.won = true; s.over = true; }
      ev.push({ type: 'levelClear', won: s.won });
    }
    return ev;
  }

  function applyPower(s, type) {
    if (type === 'wide') s.fx.wide = 15;
    else if (type === 'slow') s.fx.slow = 10;
    else if (type === 'life') s.lives = Math.min(5, s.lives + 1);
    else if (type === 'multi') {
      var src = s.balls.filter(function (b) { return !b.stuck; })[0] || s.balls[0];
      if (!src) return;
      var spd = curSpeed(s);
      [-0.5, 0.5].forEach(function (off) {
        if (s.balls.length >= 6) return;
        var ang = Math.atan2(src.vx || 0.01, -(src.vy || -1)) + off;
        s.balls.push({ x: src.x, y: src.y, vx: Math.sin(ang) * spd, vy: -Math.abs(Math.cos(ang) * spd), r: BALL_R, stuck: false });
      });
    }
    s.score += 25;
  }

  function nextLevel(s) { if (s.levelClear && !s.won) startLevel(s, s.level + 1); }

  return { W: W, H: H, PADDLE_Y: PADDLE_Y, PADDLE_H: PADDLE_H, LEVELS: LEVELS, POWERS: POWERS, createGame: createGame, step: step,
    launch: launch, nextLevel: nextLevel, hitRect: hitRect, paddleBounce: paddleBounce, remaining: remaining, applyPower: applyPower, buildBricks: buildBricks };
});
