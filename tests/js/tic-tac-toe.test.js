'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const T = require(path.resolve(__dirname, '..', '..', 'games', 'tic-tac-toe', 'ttt-logic.js'));

test('ttt: wins on every line and detects draws', () => {
  for (const l of T.LINES) {
    const b = Array(9).fill(null); l.forEach(i => (b[i] = 'O'));
    assert.deepStrictEqual(T.outcome(b), { winner: 'O', line: l });
  }
  assert.strictEqual(T.outcome(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']).winner, 'draw');
  assert.strictEqual(T.outcome(Array(9).fill(null)).winner, null);
});

test('ttt: move validation (turn, occupied, bad cell, after game over)', () => {
  const g = T.createGame('X');
  assert.strictEqual(T.play(g, 4, 'O').reason, 'not-your-turn');
  assert.ok(T.play(g, 4, 'X').ok);
  assert.strictEqual(T.play(g, 4).reason, 'occupied');
  assert.strictEqual(T.play(g, 9).reason, 'bad-cell');
  assert.strictEqual(T.play(g, 1.5).reason, 'bad-cell');
  [0, 1, 3, 2].forEach(c => T.play(g, c)); // O0 X1 O3 X2 -> X has 4,1,2? no: X has 4,1,2 = not a line
  T.play(g, 6); // O wins 0,3,6
  assert.strictEqual(g.winner, 'O');
  assert.strictEqual(T.play(g, 8).reason, 'game-over');
});

/** Exhaustively play every possible opponent line against the hard AI: it must never lose. */
function neverLoses(aiMark) {
  let games = 0;
  (function explore(g) {
    if (g.winner) { games++; assert.notStrictEqual(g.winner, aiMark === 'X' ? 'O' : 'X', 'hard AI lost: ' + g.board.join(',')); return; }
    if (g.turn === aiMark) {
      const c = T.aiMove(g.board.slice(), aiMark, 'hard', () => 0);
      const n = JSON.parse(JSON.stringify(g)); T.play(n, c); explore(n);
    } else {
      for (const c of T.empty(g.board)) { const n = JSON.parse(JSON.stringify(g)); T.play(n, c); explore(n); }
    }
  })(T.createGame('X'));
  return games;
}
test('ttt: hard AI never loses as X or as O (exhaustive)', () => {
  assert.ok(neverLoses('X') > 0);
  assert.ok(neverLoses('O') > 0);
});

test('ttt: medium always takes a win and blocks a loss', () => {
  const win = ['O', 'O', null, 'X', 'X', null, null, null, null];
  for (let i = 0; i < 20; i++) assert.strictEqual(T.aiMove(win.slice(), 'O', 'medium'), 2);
  const block = ['X', 'X', null, null, 'O', null, null, null, null];
  for (let i = 0; i < 20; i++) assert.strictEqual(T.aiMove(block.slice(), 'O', 'medium'), 2);
});

test('ttt: easy AI is beatable (loses some random games)', () => {
  let losses = 0;
  for (let n = 0; n < 200; n++) {
    const g = T.createGame('X');
    while (!g.winner) T.play(g, g.turn === 'O' ? T.aiMove(g.board.slice(), 'O', 'easy') : T.aiMove(g.board.slice(), 'X', 'hard'));
    if (g.winner === 'X') losses++;
  }
  assert.ok(losses > 20, 'easy lost ' + losses + ' of 200 to perfect play');
});
