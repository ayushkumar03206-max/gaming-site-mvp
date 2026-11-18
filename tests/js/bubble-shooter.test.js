'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const B = require(path.resolve(__dirname, '..', '..', 'games', 'bubble-shooter', 'bubble-logic.js'));

function empty(g) { g.grid = g.grid.map(row => row.map(() => null)); }
function runShot(g) { let ev = []; for (let i = 0; i < 400 && g.shot; i++) ev = ev.concat(B.step(g, 1 / 60)); return ev; }

test('bubble: hex neighbours (odd rows shifted right)', () => {
  assert.deepStrictEqual(B.neighbors(2, 3).sort().join('|'), [[2, 2], [2, 4], [1, 2], [1, 3], [3, 2], [3, 3]].sort().join('|'));
  assert.deepStrictEqual(B.neighbors(1, 3).sort().join('|'), [[1, 2], [1, 4], [0, 3], [0, 4], [2, 3], [2, 4]].sort().join('|'));
});

test('bubble: a straight shot sticks to the ceiling and three of a colour pop', () => {
  const g = B.createGame({ seed: 1 }); empty(g);
  g.grid[0][4] = 2; g.grid[0][5] = 2;
  g.current = 2;
  B.fire(g, 0);
  const ev = runShot(g);
  assert.strictEqual(ev.filter(e => e.type === 'pop').length, 3, JSON.stringify(ev));
  assert.ok(g.levelClear, 'board empty -> level clear');
});

test('bubble: floating bubbles drop after their anchor pops', () => {
  const g = B.createGame({ seed: 1 }); empty(g);
  g.grid[0][4] = 1; g.grid[1][4] = 3; g.grid[2][4] = 3; g.grid[0][0] = 5;
  g.grid[0][4] = null; // remove anchor
  const dropped = B.dropFloating(g);
  assert.strictEqual(dropped.length, 2);
  assert.strictEqual(g.grid[0][0], 5);
});

test('bubble: walls bounce the shot', () => {
  const g = B.createGame({ seed: 2 }); empty(g); g.grid[0][0] = 4;
  g.current = 1; B.fire(g, -1.2);
  const ev = runShot(g);
  assert.ok(ev.some(e => e.type === 'bounce'));
  assert.ok(ev.some(e => e.type === 'land'));
});

test('bubble: misses lower the ceiling and too low ends the game', () => {
  const g = B.createGame({ seed: 3 });
  for (let i = 0; i < 200 && !g.over && !g.levelClear; i++) {
    g.current = 'x' + i; // a colour that never matches, always a miss
    B.fire(g, (i % 7 - 3) * 0.3); runShot(g);
  }
  assert.ok(g.over);
  assert.ok(g.ceil > 0);
});

test('bubble: bomb clears its neighbours', () => {
  const g = B.createGame({ seed: 4 }); empty(g);
  for (let c = 2; c <= 7; c++) g.grid[0][c] = c % 3;
  g.current = 'bomb'; B.fire(g, 0);
  const ev = runShot(g);
  assert.ok(ev.filter(e => e.type === 'pop').length >= 3);
});

/** Greedy aiming bot: try many angles on a copy of the game and choose the one that pops the most. */
function bestAngle(g) {
  let best = 0, bestScore = -1;
  for (let a = -1.35; a <= 1.35; a += 0.03) {
    const sim = Object.assign({}, g, { grid: g.grid.map(r => r.slice()), shot: null, rng: () => 0.5 });
    B.fire(sim, a); let ev = [];
    for (let i = 0; i < 400 && sim.shot; i++) ev = ev.concat(B.step(sim, 1 / 60));
    let sc = ev.filter(e => e.type === 'pop' || e.type === 'drop').length * 10 - (ev.some(e => e.type === 'gameOver') ? 1000 : 0);
    // no pop: prefer landing next to the same colour so a later shot can pop the group
    const land = ev.find(e => e.type === 'land');
    if (land && sim.grid[land.r][land.c] !== null) { const v = sim.grid[land.r][land.c]; sc += B.flood(sim, land.r, land.c, x => x === v).length; }
    if (sc > bestScore) { bestScore = sc; best = a; }
  }
  return best;
}
test('bubble: an aiming bot clears level 1 and level 2', () => {
  for (const seed of [1, 2, 3]) {
    const g = B.createGame({ seed });
    let cleared = 0;
    for (let shot = 0; shot < 400 && !g.over && cleared < 2; shot++) {
      if (g.levelClear) { cleared++; if (cleared < 2) B.nextLevel(g); continue; }
      B.fire(g, bestAngle(g)); runShot(g);
    }
    assert.ok(cleared >= 2 || g.levelClear, `seed ${seed}: cleared ${cleared}, over=${g.over}, left=${B.count(g)}`);
  }
});
