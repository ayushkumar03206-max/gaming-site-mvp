'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const R = require(path.resolve(__dirname, '..', '..', 'games', 'highway-rush', 'rush-logic.js'));

/** Bot: steer toward the free lane (of the nearest row still ahead) closest to the car. */
function botInput(s) {
  const ahead = s.traffic.filter(c => c.y > -0.95);
  if (!ahead.length) return {};
  const nearestY = Math.min(...ahead.map(c => c.y));
  const blocked = new Set(ahead.filter(c => Math.abs(c.y - nearestY) < 0.5).map(c => c.lane));
  let best = null;
  for (let l = 0; l < s.lanes; l++) if (!blocked.has(l) && (best === null || Math.abs(l - s.x) < Math.abs(best - s.x))) best = l;
  return { targetX: best };
}

test('rush: every generated row leaves a reachable free lane', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    const s = R.createRun(diff, { seed: 7 });
    for (let i = 0; i < 2000; i++) {
      const prev = s.lastFree.slice();
      const row = R.makeRow(s);
      assert.ok(row.free.length >= 1 && row.blocked.length <= s.d.maxBlocked, diff);
      assert.ok(R.reachable(prev, row.free), diff + ' row ' + i);
      s.lastFree = row.free;
    }
  }
});

test('rush: a reactive bot survives 2 minutes on every difficulty', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = R.createRun(diff, { seed, spawnAhead: 8 });
      for (let t = 0; t < 120 * 60 && !s.over; t++) R.step(s, 1 / 60, botInput(s));
      assert.strictEqual(s.over, false, `${diff} seed ${seed} crashed at ${R.meters(s)}m`);
      assert.ok(s.speed === s.d.max, 'reached top speed');
    }
  }
});

test('rush: idle driver eventually crashes, first rows spare the start lane', () => {
  const s = R.createRun('normal', { seed: 11, spawnAhead: 8 });
  let crashed = false;
  for (let t = 0; t < 60 * 60 && !crashed; t++) crashed = R.step(s, 1 / 60, {}).some(e => e.type === 'crash');
  assert.ok(crashed && s.over);
  assert.ok(s.rows > 2, 'did not crash on a grace row');
  assert.deepStrictEqual(R.step(s, 1 / 60, {}), [], 'no events after game over');
});

test('rush: speed ramps and caps, score includes bonuses', () => {
  const d = R.DIFFS.normal;
  assert.strictEqual(R.speedAt(d, 0), d.base);
  assert.ok(R.speedAt(d, 10) > d.base);
  assert.strictEqual(R.speedAt(d, 1e6), d.max);
  const s = R.createRun('easy', { seed: 3 });
  s.dist = 100; s.coins = 2; s.nearMisses = 3;
  assert.strictEqual(R.score(s), 450 + 50 + 15);
});

test('rush: steering is clamped to the road', () => {
  const s = R.createRun('easy', { seed: 3, spawnAhead: 50 });
  for (let i = 0; i < 200; i++) R.step(s, 1 / 60, { left: true });
  assert.strictEqual(s.x, 0);
  for (let i = 0; i < 300; i++) R.step(s, 1 / 60, { right: true });
  assert.strictEqual(s.x, R.LANES - 1);
});
