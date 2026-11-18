'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const F = require(path.resolve(__dirname, '..', '..', 'games', 'tile-fusion', 'fusion-logic.js'));

test('fusion: slideLine merges each tile at most once', () => {
  assert.deepStrictEqual(F.slideLine([2, 2, 2, 2]).values, [4, 4, 0, 0]);
  assert.deepStrictEqual(F.slideLine([2, 2, 4, 0]).values, [4, 4, 0, 0]);
  assert.deepStrictEqual(F.slideLine([4, 4, 8, 8]).values, [8, 16, 0, 0]);
  assert.deepStrictEqual(F.slideLine([0, 2, 0, 2]).values, [4, 0, 0, 0]);
  assert.deepStrictEqual(F.slideLine([2, 4, 2, 4]).values, [2, 4, 2, 4]);
  assert.strictEqual(F.slideLine([2, 2, 2, 2]).gained, 8);
});

test('fusion: moves in all four directions and spawns one tile', () => {
  for (const dir of ['left', 'right', 'up', 'down']) {
    const g = F.createGame({ seed: 1 });
    g.grid = [0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // two equal tiles side by side in row 2
    const r = F.move(g, dir);
    assert.ok(r.moved, dir);
    assert.strictEqual(g.grid.filter(v => v).length, dir === 'left' || dir === 'right' ? 2 : 3, dir);
  }
  const g = F.createGame({ seed: 1 });
  g.grid = [2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  F.move(g, 'right'); assert.strictEqual(g.grid[3], 4); assert.strictEqual(g.score, 4);
});

test('fusion: a move that changes nothing does not spawn or count', () => {
  const g = F.createGame({ seed: 2 });
  g.grid = [2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert.strictEqual(F.move(g, 'left').moved, false);
  assert.strictEqual(F.move(g, 'up').moved, false);
  assert.strictEqual(g.moves, 0);
});

test('fusion: game over detection and win flag', () => {
  const g = F.createGame({ seed: 3 });
  g.grid = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
  assert.strictEqual(F.canMove(g), false);
  const w = F.createGame({ seed: 3 });
  w.grid = [1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  F.move(w, 'left'); assert.ok(w.won); assert.strictEqual(F.maxTile(w), 2048);
});

test('fusion: undo restores the board up to 3 times', () => {
  const g = F.createGame({ seed: 4 });
  const start = g.grid.slice();
  let moved = 0;
  for (const d of ['left', 'up', 'right', 'down', 'left', 'up']) if (F.move(g, d).moved) moved++;
  assert.ok(moved >= 4);
  assert.ok(F.undo(g) && F.undo(g) && F.undo(g));
  assert.strictEqual(F.undo(g), false, 'limit reached');
  assert.strictEqual(g.undosLeft, 0);
  assert.notDeepStrictEqual(g.grid, start);
});

test('fusion: the same seed gives the same game (shared challenge)', () => {
  const a = F.createGame({ seed: 77 }), b = F.createGame({ seed: 77 });
  for (const d of ['left', 'up', 'right', 'down', 'left']) { F.move(a, d); F.move(b, d); }
  assert.deepStrictEqual(a.grid, b.grid);
});
