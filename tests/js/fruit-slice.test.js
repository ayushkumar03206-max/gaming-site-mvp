'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const F = require(path.resolve(__dirname, '..', '..', 'games', 'fruit-slice', 'slice-logic.js'));

function fruitAt(s, x, y, extra) {
  const it = Object.assign({ id: 999, bomb: false, kind: F.KINDS[0], x, y, r: 20, vx: 0, vy: 0, rot: 0, vr: 0, delay: 0, sliced: false }, extra || {});
  s.items.push(it); return it;
}

test('slice: point-segment distance', () => {
  assert.strictEqual(F.segDist(5, 5, 0, 0, 10, 0), 5);
  assert.strictEqual(F.segDist(-3, 4, 0, 0, 10, 0), 5);
});

test('slice: a swipe through fruit scores, combos multiply', () => {
  const s = F.createGame(800, 600, { seed: 1 });
  fruitAt(s, 100, 300); fruitAt(s, 200, 300); fruitAt(s, 300, 300);
  const ev = F.slice(s, 50, 300, 350, 300);
  assert.strictEqual(ev.length, 3);
  assert.strictEqual(s.score, 1 + 2 + 3);
  assert.strictEqual(s.bestCombo, 3);
  assert.strictEqual(s.items.length, 0);
  assert.strictEqual(s.halves.length, 6);
});

test('slice: combo window expires', () => {
  const s = F.createGame(800, 600, { seed: 1 });
  s.nextWave = 99;
  fruitAt(s, 100, 300); F.slice(s, 50, 300, 150, 300);
  F.step(s, F.COMBO_WINDOW + 0.05);
  fruitAt(s, 100, 300); F.slice(s, 50, 300, 150, 300);
  assert.strictEqual(s.combo, 1);
  assert.strictEqual(s.score, 2);
});

test('slice: bombs cost time and reset the combo; missing a fruit is counted', () => {
  const s = F.createGame(800, 600, { seed: 1 });
  s.nextWave = 99;
  fruitAt(s, 100, 300); F.slice(s, 50, 300, 150, 300);
  fruitAt(s, 400, 300, { bomb: true, kind: null });
  const ev = F.slice(s, 350, 300, 450, 300);
  assert.strictEqual(ev[0].type, 'bomb');
  assert.strictEqual(s.time, F.ROUND - F.BOMB_PENALTY);
  assert.strictEqual(s.combo, 0);
  fruitAt(s, 100, 700, { vy: 10 });
  F.step(s, 0.1);
  assert.strictEqual(s.missed, 1);
});

test('slice: waves never start with a bomb and fruit rises into view', () => {
  const s = F.createGame(800, 600, { seed: 5 });
  for (let w = 0; w < 300; w++) {
    s.items = []; s.elapsed = w / 5;
    F.spawnWave(s);
    assert.strictEqual(s.items[0].bomb, false);
    // simulate the first item until it starts falling: its peak must be on screen
    const it = s.items[0]; const gy = 600 * 1.15; let y = it.y, vy = it.vy;
    while (vy < 0) { vy += gy / 240; y += vy / 240; }
    assert.ok(y > 0 && y < 600 * 0.6, 'peak at ' + y);
  }
});

test('slice: round ends after 60 seconds', () => {
  const s = F.createGame(800, 600, { seed: 2 });
  let ended = false;
  for (let i = 0; i < 61 * 60 && !ended; i++) ended = F.step(s, 1 / 60).some(e => e.type === 'timeUp');
  assert.ok(ended && s.over && s.time === 0);
  assert.deepStrictEqual(F.slice(s, 0, 0, 800, 600), []);
});
