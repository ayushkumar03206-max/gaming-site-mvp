'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const P = require(path.resolve(__dirname, '..', '..', 'games', 'car-parking', 'parking-logic.js'));

test('parking: oriented rectangle overlap (SAT)', () => {
  const a = { x: 0, y: 0, w: 4, h: 4, a: 0 };
  assert.ok(P.overlap(a, { x: 3, y: 0, w: 4, h: 4, a: 0 }));
  assert.ok(!P.overlap(a, { x: 5, y: 0, w: 4, h: 4, a: 0 }));
  assert.ok(P.overlap(a, { x: 4.5, y: 0, w: 4, h: 4, a: Math.PI / 4 }), 'rotated corner reaches in');
  assert.ok(!P.overlap(a, { x: 5.2, y: 0, w: 4, h: 4, a: Math.PI / 4 }));
});

test('parking: driving forward moves up the screen; steering turns', () => {
  const g = P.createGame(0);
  const y0 = g.car.y;
  for (let i = 0; i < 30; i++) P.step(g, 1 / 60, { throttle: 1 });
  assert.ok(g.car.y < y0 && Math.abs(g.car.a) < 1e-9);
  for (let i = 0; i < 30; i++) P.step(g, 1 / 60, { throttle: 1, steer: 1 });
  assert.ok(g.car.a > 0, 'turned right');
});

test('parking: hitting an obstacle crashes; parking needs the car inside, aligned and stopped', () => {
  const g = P.createGame(0);
  g.car.x = 36; g.car.y = 52; // just below a parked car
  let ev = [];
  for (let i = 0; i < 60 && g.state === 'driving'; i++) ev = ev.concat(P.step(g, 1 / 60, { throttle: 1 }));
  assert.strictEqual(g.state, 'crashed'); assert.ok(ev.some(e => e.type === 'crash'));
  const h = P.createGame(0);
  h.car.x = h.bay.x; h.car.y = h.bay.y; h.car.a = 0;
  for (let i = 0; i < 60 && h.state === 'driving'; i++) ev = P.step(h, 1 / 60, {});
  assert.strictEqual(h.state, 'parked');
  const k = P.createGame(0); k.car.x = k.bay.x; k.car.y = k.bay.y; k.car.a = 0.4;
  assert.strictEqual(P.parkedOk(k), false, 'crooked does not count');
});

/** Kinematic A* over motion primitives: proves every level can be solved without touching anything. */
function solve(levelIdx) {
  const g = P.createGame(levelIdx);
  const prims = [];
  for (const v of [9, -6]) for (const s of [-1, -0.5, 0, 0.5, 1]) prims.push({ v, s });
  const key = (x, y, a) => `${Math.round(x)},${Math.round(y)},${(Math.round(a / (Math.PI / 12)) % 24 + 24) % 24}`;
  const start = { x: g.car.x, y: g.car.y, a: g.car.a, cost: 0 };
  const h = n => Math.hypot(n.x - g.bay.x, n.y - g.bay.y) / 9;
  // binary min-heap keyed on cost + heuristic
  const heap = [];
  const f = n => n.cost + h(n);
  const push = n => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (f(heap[p]) <= f(heap[i])) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && f(heap[l]) < f(heap[m])) m = l; if (r < heap.length && f(heap[r]) < f(heap[m])) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  push(start);
  const open = { push }, seen = new Set([key(start.x, start.y, start.a)]);
  let expanded = 0;
  while (heap.length && expanded < 60000) {
    const n = pop(); expanded++;
    for (const pr of prims) {
      let x = n.x, y = n.y, a = n.a, ok = true;
      for (let t = 0; t < 8 && ok; t++) { // 0.4 s in 0.05 s steps
        a += pr.v / P.WHEELBASE * Math.tan(pr.s * P.MAX_STEER) * 0.05;
        x += Math.sin(a) * pr.v * 0.05; y -= Math.cos(a) * pr.v * 0.05;
        const c = { x, y, a, w: P.CAR_W, h: P.CAR_L };
        if (g.obstacles.some(o => P.overlap(c, o))) ok = false;
        else if (P.parkedOk(Object.assign({}, g, { car: c }))) return { ok: true, expanded };
      }
      if (!ok) continue;
      const k = key(x, y, a);
      if (seen.has(k)) continue;
      seen.add(k); open.push({ x, y, a, cost: n.cost + 0.4 + (pr.v < 0 ? 0.2 : 0) });
    }
  }
  return { ok: false, expanded };
}
test('parking: every level is solvable (kinematic search)', () => {
  P.LEVELS.forEach((L, i) => {
    const r = solve(i);
    assert.ok(r.ok, `level ${i + 1} "${L.name}" not solvable (expanded ${r.expanded})`);
  });
});

test('parking: start positions are clear of obstacles', () => {
  P.LEVELS.forEach((L, i) => {
    const g = P.createGame(i);
    assert.ok(!g.obstacles.some(o => P.overlap(g.car, o)), 'level ' + (i + 1));
    assert.ok(!g.obstacles.some(o => P.overlap(Object.assign({}, g.bay, { w: g.bay.w - 0.2, h: g.bay.h - 0.2 }), o)), 'bay clear on level ' + (i + 1));
  });
});

test('parking: party ranking orders parked cars by time and puts crashes last together', () => {
  const r = P.partyRank([{ ok: true, time: 14.2 }, { ok: false, time: 3 }, { ok: true, time: 9.8 }, { ok: false, time: 20 }]);
  assert.deepStrictEqual(r.map(x => [x.player, x.place]), [[2, 1], [0, 2], [1, 3], [3, 3]]);
  const tie = P.partyRank([{ ok: true, time: 10 }, { ok: true, time: 10 }]);
  assert.deepStrictEqual(tie.map(x => x.place), [1, 1]);
});
