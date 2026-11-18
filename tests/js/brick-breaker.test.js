'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const B = require(path.resolve(__dirname, '..', '..', 'games', 'brick-breaker', 'brick-logic.js'));

test('brick: every level has breakable bricks and fits the 10-column grid', () => {
  B.LEVELS.forEach((rows, i) => {
    rows.forEach(r => assert.strictEqual(r.length, 10, 'level ' + (i + 1)));
    const bricks = B.buildBricks(i);
    assert.ok(bricks.some(b => !b.steel), 'level ' + (i + 1) + ' has breakable bricks');
    bricks.forEach(b => assert.ok(b.x >= 0 && b.x + b.w <= B.W));
  });
});

test('brick: circle/rect collision picks the shallow axis', () => {
  const r = { x: 10, y: 10, w: 9, h: 4 };
  assert.strictEqual(B.hitRect({ x: 14, y: 9, r: 1.6 }, r).ny, -1);   // from above
  assert.strictEqual(B.hitRect({ x: 9, y: 12, r: 1.6 }, r).nx, -1);   // from the left
  assert.strictEqual(B.hitRect({ x: 30, y: 30, r: 1.6 }, r), null);
});

test('brick: paddle bounce angle follows hit position and always goes up', () => {
  const p = { x: 50, w: 18 };
  const mid = { x: 50, y: 137, r: 1.6 }; B.paddleBounce(mid, p, 60);
  assert.ok(Math.abs(mid.vx) < 1e-9 && mid.vy < 0);
  const edge = { x: 59, y: 137, r: 1.6 }; B.paddleBounce(edge, p, 60);
  assert.ok(edge.vx > 0 && edge.vy < 0 && Math.abs(Math.hypot(edge.vx, edge.vy) - 60) < 1e-9);
});

test('brick: missing the ball costs a life and the game ends at zero', () => {
  const g = B.createGame({ seed: 1 });
  B.launch(g);
  let events = [];
  for (let i = 0; i < 60 * 60 && !g.over; i++) {
    events = events.concat(B.step(g, 1 / 60, { targetX: g.balls[0] && g.balls[0].x > 50 ? 5 : 95 })); // dodge the ball
    if (g.balls.length === 1 && g.balls[0].stuck) B.launch(g);
  }
  assert.ok(g.over && !g.won && g.lives === 0);
  assert.strictEqual(events.filter(e => e.type === 'lifeLost').length, 3);
});

test('brick: a tracking bot clears all 8 levels', () => {
  const g = B.createGame({ seed: 42 });
  let t = 0;
  const dt = 1 / 120;
  while (!g.over && t < 60 * 60) {
    if (g.levelClear) B.nextLevel(g);
    if (g.balls.some(b => b.stuck)) B.launch(g);
    const low = g.balls.filter(b => !b.stuck).sort((a, b) => b.y - a.y)[0];
    const off = Math.sin(t * 0.7) * 6; // vary the hit point so the ball doesn't loop vertically
    B.step(g, dt, { targetX: low ? low.x + off : 50 });
    t += dt;
  }
  assert.ok(g.won, `stuck on level ${g.level + 1} with ${B.remaining(g)} bricks after ${Math.round(t)}s (lives ${g.lives})`);
});

test('brick: power-ups apply their effect', () => {
  const g = B.createGame({ seed: 3 });
  B.applyPower(g, 'life'); assert.strictEqual(g.lives, 4);
  B.applyPower(g, 'wide'); B.step(g, 0.01, {}); assert.ok(g.paddle.w > 18);
  B.launch(g); B.step(g, 0.01, {});
  B.applyPower(g, 'multi'); assert.strictEqual(g.balls.length, 3);
});
