'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const S = require(path.resolve(__dirname, '..', '..', 'games', 'snake-arena', 'snake-logic.js'));

test('snake: moves, cannot reverse, queues two turns', () => {
  const s = S.createGame({ seed: 1 });
  const h = Object.assign({}, s.body[0]);
  S.tick(s); assert.deepStrictEqual(s.body[0], { x: h.x + 1, y: h.y });
  assert.strictEqual(S.turn(s, 'left'), false, 'reverse ignored');
  assert.ok(S.turn(s, 'up')); assert.ok(S.turn(s, 'left'));
  assert.strictEqual(S.turn(s, 'down'), false, 'queue holds two');
  S.tick(s); S.tick(s);
  assert.strictEqual(s.dir, 'left');
  assert.strictEqual(s.body.length, 3);
});

test('snake: eating grows the snake and scores; food never spawns on the body', () => {
  const s = S.createGame({ seed: 2 });
  s.food = { x: s.body[0].x + 1, y: s.body[0].y };
  const ev = S.tick(s);
  assert.strictEqual(ev[0].type, 'eat'); assert.strictEqual(s.score, 10);
  S.tick(s); assert.strictEqual(s.body.length, 4);
  for (let i = 0; i < 200; i++) { const f = S.freeCell(s); assert.ok(!s.body.some(c => c.x === f.x && c.y === f.y)); }
});

test('snake: wall and self collisions end the game', () => {
  const s = S.createGame({ seed: 3 });
  let ev = [];
  for (let i = 0; i < 30 && !s.over; i++) ev = S.tick(s);
  assert.ok(s.over); assert.strictEqual(ev[0].cause, 'wall');
  const t = S.createGame({ seed: 3 });
  t.body = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }]; t.dir = 'right';
  S.turn(t, 'down'); ev = S.tick(t);
  assert.ok(t.over); assert.strictEqual(ev[0].cause, 'self');
});

test('snake: chasing the tail is allowed when it moves away', () => {
  const s = S.createGame({ seed: 4 });
  s.body = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }]; s.dir = 'up'; s.food = { x: 0, y: 0 };
  S.turn(s, 'left'); S.tick(s);
  assert.strictEqual(s.over, false);
  assert.deepStrictEqual(s.body[0], { x: 4, y: 5 });
});

test('snake: speed rises with meals and is capped', () => {
  const s = S.createGame({ seed: 5, speed: 'classic' });
  assert.strictEqual(S.tickRate(s), 8);
  s.eaten = 8; assert.strictEqual(S.tickRate(s), 10);
  s.eaten = 999; assert.strictEqual(S.tickRate(s), S.SPEEDS.classic.max);
});

test('snake: a greedy bot survives and collects food', () => {
  const s = S.createGame({ seed: 6 });
  for (let i = 0; i < 2000 && !s.over; i++) {
    const h = s.body[0], f = s.food;
    const order = [];
    if (f.x > h.x) order.push('right'); if (f.x < h.x) order.push('left'); if (f.y > h.y) order.push('down'); if (f.y < h.y) order.push('up');
    order.push('up', 'right', 'down', 'left');
    for (const d of order) {
      const v = S.DIRS[d], nx = h.x + v.x, ny = h.y + v.y;
      const safe = nx >= 0 && ny >= 0 && nx < s.cols && ny < s.rows && !s.body.slice(0, -1).some(c => c.x === nx && c.y === ny);
      if (safe && (d === s.dir || S.turn(s, d))) break;
    }
    S.tick(s); s.queue = [];
  }
  assert.ok(s.eaten >= 10, 'ate ' + s.eaten);
});
