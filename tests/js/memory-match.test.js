'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const M = require(path.resolve(__dirname, '..', '..', 'games', 'memory-match', 'memory-logic.js'));

function pairIdx(g) { const m = {}; g.cards.forEach((c, i) => (m[c.pair] = m[c.pair] || []).push(i)); return m; }

test('memory: boards contain exactly two of each pair', () => {
  for (const lv of Object.keys(M.LEVELS)) {
    const g = M.createGame(lv, { seed: 9 });
    assert.strictEqual(g.cards.length, M.LEVELS[lv].cols * M.LEVELS[lv].rows);
    Object.values(pairIdx(g)).forEach(ix => assert.strictEqual(ix.length, 2));
  }
});

test('memory: match, miss, settle and blocked flips', () => {
  const g = M.createGame('easy', { seed: 1 }), p = pairIdx(g);
  assert.strictEqual(M.flip(g, p[0][0]).result, 'first');
  assert.strictEqual(M.flip(g, p[0][0]).ok, false, 'same card twice');
  assert.strictEqual(M.flip(g, p[0][1]).result, 'match');
  assert.strictEqual(M.flip(g, p[0][0]).ok, false, 'matched card');
  M.flip(g, p[1][0]);
  assert.strictEqual(M.flip(g, p[2][0]).result, 'miss');
  assert.strictEqual(M.flip(g, p[3][0]).reason, 'busy', 'no third card while two are open');
  M.settle(g);
  assert.strictEqual(g.cards[p[1][0]].state, 'down');
  assert.strictEqual(g.moves, 2);
});

test('memory: perfect solo game ends with 3 stars', () => {
  const g = M.createGame('medium', { seed: 4 }), p = pairIdx(g);
  Object.values(p).forEach(([a, b]) => { M.flip(g, a); M.flip(g, b); });
  assert.ok(g.over); assert.strictEqual(g.moves, g.pairs); assert.strictEqual(M.stars(g), 3);
  assert.strictEqual(M.score(g, 0), g.pairs * 100);
});

test('memory: two players alternate on a miss and keep the turn on a match', () => {
  const g = M.createGame('easy', { seed: 2, players: 2 }), p = pairIdx(g);
  M.flip(g, p[0][0]); M.flip(g, p[0][1]);
  assert.strictEqual(g.turn, 0); assert.deepStrictEqual(g.scores, [1, 0]);
  M.flip(g, p[1][0]); M.flip(g, p[2][0]); M.settle(g);
  assert.strictEqual(g.turn, 1);
  for (let k = 1; k < g.pairs; k++) { M.flip(g, p[k][0]); M.flip(g, p[k][1]); }
  assert.ok(g.over); assert.deepStrictEqual(g.scores, [1, 5]); assert.strictEqual(M.winner(g), 1);
});

test('memory: 3-4 players rotate in order on misses; ranking and shared wins', () => {
  const g = M.createGame('medium', { seed: 5, players: 4 }), p = pairIdx(g);
  assert.strictEqual(g.players, 4);
  const order = [];
  for (let k = 0; k < 4; k++) { order.push(g.turn); M.flip(g, p[k][0]); M.flip(g, p[k + 1][0]); M.settle(g); }
  assert.deepStrictEqual(order, [0, 1, 2, 3]); assert.strictEqual(g.turn, 0, 'back to player 1 after player 4');
  // P1 takes 3 pairs, P2 takes 3 pairs, P3 takes 2: P1 and P2 share the win
  const plan = [0, 0, 0, 1, 1, 1, 2, 2];
  plan.forEach((pl, k) => { while (g.turn !== pl) { const d = g.cards.filter(c => c.state === 'down'); M.flip(g, d[0].id); M.flip(g, d.find(c => c.pair !== d[0].pair).id); M.settle(g); } M.flip(g, p[k][0]); M.flip(g, p[k][1]); });
  assert.ok(g.over);
  assert.deepStrictEqual(g.scores.slice(0, 4), [3, 3, 2, 0]);
  assert.strictEqual(M.winner(g), 'draw');
  assert.deepStrictEqual(M.ranking(g).map(r => [r.player, r.place]), [[0, 1], [1, 1], [2, 3], [3, 4]]);
  assert.strictEqual(M.createGame('easy', { players: 9 }).players, 4, 'clamped to 4');
});
