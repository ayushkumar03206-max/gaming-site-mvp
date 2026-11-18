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
