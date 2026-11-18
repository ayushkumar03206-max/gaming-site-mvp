// Run with: node --test tests/js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..', 'games');
const PF = require(path.join(root, 'pathforge', 'pathforge-core.js'));
const ND = require(path.join(root, 'neon-dodge', 'neon-logic.js'));
const CS = require(path.join(root, 'chroma-shift', 'chroma-core.js'));

// ---------------- Pathforge ----------------
test('pathforge: initial state', () => {
  const s = PF.createState({ size: 7 });
  assert.strictEqual(s.pawns[0], 6 * 7 + 3);
  assert.strictEqual(s.pawns[1], 3);
  assert.strictEqual(PF.dist(s, 0), 6);
  assert.strictEqual(PF.dist(s, 1), 6);
  assert.deepStrictEqual(s.stock, [5, 5]);
});

test('pathforge: moves are orthogonal and respect blocks', () => {
  let s = PF.createState({ size: 7 });
  const me = s.pawns[0];
  assert.deepStrictEqual(PF.moveTargets(s).sort((a, b) => a - b), [me - 7, me - 1, me + 1].sort((a, b) => a - b));
  s.blocks[me - 7] = 1;
  assert.ok(!PF.moveTargets(s).includes(me - 7));
});

test('pathforge: cannot seal a route', () => {
  const s = PF.createState({ size: 7 });
  // wall row 3 except column 6, then the last gap must be refused
  for (let c = 0; c < 6; c++) s.blocks[3 * 7 + c] = 1;
  assert.strictEqual(PF.canBlock(s, 3 * 7 + 6), false);
  assert.ok(PF.dist(s, 0) < Infinity);
});

test('pathforge: cannot block occupied cells, sparks, or with empty stock', () => {
  const s = PF.createState({ size: 7 });
  assert.strictEqual(PF.canBlock(s, s.pawns[1]), false);
  assert.strictEqual(PF.canBlock(s, 2 * 7 + 1), false); // spark
  s.stock[0] = 0;
  assert.strictEqual(PF.canBlock(s, 10), false);
});

test('pathforge: vault over adjacent rival', () => {
  const s = PF.createState({ size: 7 });
  s.pawns[0] = 4 * 7 + 3; s.pawns[1] = 3 * 7 + 3;
  const t = PF.moveTargets(s);
  assert.ok(t.includes(2 * 7 + 3), 'vault target');
  assert.ok(!t.includes(3 * 7 + 3), 'cannot land on rival');
});

test('pathforge: spark gives a block, reaching goal wins', () => {
  let s = PF.createState({ size: 7 });
  s.pawns[0] = 2 * 7 + 2; // next to spark at (2,1)
  s = PF.apply(s, { type: 'move', to: 2 * 7 + 1 });
  assert.strictEqual(s.stock[0], 6);
  assert.strictEqual(s.sparks[2 * 7 + 1], 0);
  let w = PF.createState({ size: 7 });
  w.pawns[0] = 1 * 7 + 0;
  w = PF.apply(w, { type: 'move', to: 0 });
  assert.strictEqual(w.winner, 0);
});

test('pathforge: illegal action throws', () => {
  const s = PF.createState({ size: 7 });
  assert.throws(() => PF.apply(s, { type: 'move', to: 0 }));
});

test('pathforge: AI always returns a legal action and games terminate', () => {
  for (const size of [7, 9]) {
    for (const lvl of ['easy', 'normal', 'hard']) {
      let s = PF.createState({ size });
      let seed = 42;
      const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      let guard = 0;
      while (s.winner === null && guard++ < 1000) {
        const a = PF.chooseAction(s, s.turn === 0 ? lvl : 'normal', rng);
        assert.ok(PF.isLegal(s, a), `${lvl} produced illegal ${JSON.stringify(a)}`);
        s = PF.apply(s, a);
        assert.ok(PF.dist(s, 0) < Infinity && PF.dist(s, 1) < Infinity, 'route sealed');
      }
      assert.notStrictEqual(s.winner, null, `game did not end (${size}, ${lvl})`);
    }
  }
});

test('pathforge: AI takes an immediate win', () => {
  const s = PF.createState({ size: 7 });
  s.turn = 1; s.pawns[1] = 5 * 7 + 0;
  const a = PF.chooseAction(s, 'normal');
  assert.deepStrictEqual(a, { type: 'move', to: 6 * 7 + 0 });
});

test('pathforge: hard AI blocks a rival about to win when it is behind', () => {
  const s = PF.createState({ size: 7 });
  s.turn = 1; s.pawns[0] = 1 * 7 + 3; // cyan one step from goal
  const a = PF.chooseAction(s, 'hard', () => 0.5);
  assert.strictEqual(a.type, 'block');
});

// ---------------- Neon Dodge ----------------
test('neon: collision helpers', () => {
  assert.ok(ND.circleRect(5, 5, 2, 6, 0, 10, 10));
  assert.ok(!ND.circleRect(0, 0, 1, 5, 5, 2, 2));
  assert.ok(ND.circleCircle(0, 0, 1, 1.5, 0, 1));
  assert.ok(!ND.circleCircle(0, 0, 1, 3, 0, 1));
});

test('neon: difficulty ramps and stays bounded', () => {
  const a = ND.difficulty(0), b = ND.difficulty(60), c = ND.difficulty(1e5);
  assert.strictEqual(a.level, 1); assert.ok(!a.shards && !a.lasers);
  assert.ok(b.level > a.level && b.barSpeed > a.barSpeed && b.barEvery < a.barEvery);
  assert.ok(b.shards && b.lasers);
  assert.ok(c.barEvery >= 0.2 && c.laserWarn >= 0.65 && c.shardEvery >= 0.9);
  assert.strictEqual(ND.score(12.34, 50), 173);
});

// ---------------- Chroma Shift ----------------
test('chroma: every level is solvable within its limit by its recorded taps', () => {
  for (let L = 1; L <= CS.MAX_LEVEL; L++) {
    const lv = CS.generate(L), p = lv.params;
    assert.ok(!CS.isSolved(lv.grid), `level ${L} starts solved`);
    let g = lv.grid.slice(), used = 0;
    lv.needed.forEach((n, i) => { for (let k = 0; k < n; k++) { g = CS.shift(g, p.size, p.colors, i, 1); used++; } });
    assert.ok(CS.isSolved(g), `level ${L} recorded solution fails`);
    assert.ok(used <= p.limit, `level ${L} needs ${used} > limit ${p.limit}`);
  }
});

test('chroma: levels are deterministic and difficulty grows', () => {
  assert.deepStrictEqual(CS.generate(7).grid, CS.generate(7).grid);
  const p1 = CS.params(1), p30 = CS.params(30);
  assert.ok(p30.size > p1.size && p30.colors > p1.colors && p30.k > p1.k);
});

test('chroma: shift wraps colours and affects only neighbours', () => {
  const g = CS.shift([2, 2, 2, 2, 2, 2, 2, 2, 2], 3, 3, 0, 1);
  assert.deepStrictEqual(g, [0, 0, 2, 0, 2, 2, 2, 2, 2]);
});

test('chroma: hint follows remaining taps, stars cap with hint', () => {
  const lv = CS.generate(5), taps = new Array(lv.grid.length).fill(0);
  const h = CS.hint(5, taps);
  assert.strictEqual(lv.needed[h], 1);
  assert.strictEqual(CS.stars(lv.params.k, lv.params, false), 3);
  assert.strictEqual(CS.stars(lv.params.k, lv.params, true), 2);
  assert.strictEqual(CS.stars(lv.params.k + 2, lv.params, false), 1);
});
