'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const T = require(path.resolve(__dirname, '..', '..', 'games', 'tower-builder', 'tower-logic.js'));

function alignTo(g, off) { g.moving.x = g.floors[g.floors.length - 1].x + off; }

test('tower: perfect drop keeps the width and scores a streak bonus', () => {
  const g = T.createGame();
  alignTo(g, 0.5);
  const r = T.drop(g);
  assert.strictEqual(r.result, 'perfect');
  assert.strictEqual(g.floors[1].w, T.START_W);
  assert.strictEqual(g.score, 2);
});

test('tower: an offset drop cuts the overhang on the correct side', () => {
  const g = T.createGame();
  const top = g.floors[0];
  alignTo(g, 10);
  const r = T.drop(g);
  assert.strictEqual(r.result, 'cut');
  assert.strictEqual(r.kept.x, top.x + 10); assert.strictEqual(r.kept.w, T.START_W - 10);
  assert.strictEqual(r.cut.x, top.x + T.START_W); assert.strictEqual(r.cut.w, 10);
  alignTo(g, -5);
  const r2 = T.drop(g);
  assert.strictEqual(r2.kept.w, T.START_W - 15); assert.strictEqual(r2.cut.w, 5);
});

test('tower: missing completely ends the game', () => {
  const g = T.createGame();
  alignTo(g, T.START_W + 1);
  assert.strictEqual(T.drop(g).result, 'miss');
  assert.ok(g.over);
  assert.strictEqual(T.drop(g).result, 'none');
});

test('tower: three perfects in a row widen a narrowed block', () => {
  const g = T.createGame();
  alignTo(g, 12); T.drop(g);
  const narrow = g.floors[1].w;
  for (let i = 0; i < 3; i++) { alignTo(g, 0); T.drop(g); }
  assert.ok(g.floors[g.floors.length - 1].w > narrow);
  assert.ok(g.floors[g.floors.length - 1].w <= T.START_W);
});

test('tower: the slider sweeps across the whole tower and speeds up', () => {
  const g = T.createGame();
  let minOff = Infinity, maxOff = -Infinity;
  for (let i = 0; i < 600; i++) { T.step(g, 1 / 60); const off = g.moving.x - g.floors[0].x; minOff = Math.min(minOff, off); maxOff = Math.max(maxOff, off); }
  assert.ok(minOff < -T.PERFECT && maxOff > T.PERFECT, 'passes over the perfect zone');
  const s0 = T.speed(g);
  for (let i = 0; i < 10; i++) { alignTo(g, 0); T.drop(g); }
  assert.ok(T.speed(g) > s0);
});

test('tower: party ranking puts the player who missed last, others by points, ties share a place', () => {
  assert.deepStrictEqual(T.partyRank([30, 50], 1).map(r => [r.player, r.place, r.out]), [[0, 1, false], [1, 2, true]]);
  const r = T.partyRank([20, 40, 40, 90], 3);
  assert.deepStrictEqual(r.map(x => [x.player, x.place]), [[1, 1], [2, 1], [0, 3], [3, 4]], 'missing loses even with the most points');
});

test('tower: shared tower credits each drop to the player whose turn it is', () => {
  const g = T.createGame(), pts = [0, 0, 0]; let turn = 0;
  for (let i = 0; i < 6; i++) { alignTo(g, 0); const before = g.score; T.drop(g); pts[turn] += g.score - before; turn = (turn + 1) % 3; }
  assert.strictEqual(pts.reduce((a, b) => a + b), g.score);
  assert.ok(pts.every(p => p > 0));
  alignTo(g, T.START_W + 5); assert.strictEqual(T.drop(g).result, 'miss');
  assert.strictEqual(T.partyRank(pts, turn)[2].player, turn);
});
