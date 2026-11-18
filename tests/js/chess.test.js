'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const C = require(path.resolve(__dirname, '..', '..', 'games', 'chess', 'chess-rules.js'));

// Published perft totals (chessprogramming.org "Perft Results"). Matching these proves move generation
// including castling, en passant, promotions and check evasion is complete and correct.
const PERFT = [
  ['startpos', C.START, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]]
];
for (const [label, fen, counts] of PERFT) {
  test(`chess perft: ${label}`, () => {
    counts.forEach((n, i) => assert.strictEqual(C.perft(C.fromFen(fen), i + 1), n, `${label} depth ${i + 1}`));
  });
}

test('chess: FEN round trip', () => {
  for (const [, fen] of PERFT) assert.strictEqual(C.toFen(C.fromFen(fen)), fen);
});

test('chess: SAN, check and checkmate (fool\'s mate)', () => {
  const g = C.newGame();
  for (const [f, t] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) assert.ok(C.move(g, { from: f, to: t }).ok);
  assert.deepStrictEqual(C.moveList(g), ['f3', 'e5', 'g4', 'Qh4#']);
  assert.deepStrictEqual(C.status(g), { over: true, result: '0-1', reason: 'checkmate', check: true });
  assert.strictEqual(C.move(g, { from: 'a2', to: 'a3' }).reason, 'game-over');
});

test('chess: illegal and malformed moves are rejected', () => {
  const g = C.newGame();
  assert.strictEqual(C.move(g, { from: 'e2', to: 'e5' }).reason, 'illegal');
  assert.strictEqual(C.move(g, { from: 'e7', to: 'e5' }).reason, 'illegal', 'not your turn');
  assert.strictEqual(C.move(g, { from: 'z9', to: 'e4' }).reason, 'bad-square');
  assert.strictEqual(C.move(g, null).reason, 'bad-square');
  // pinned piece cannot move
  const p = C.fromFen('4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1');
  assert.strictEqual(C.move(p, { from: 'e2', to: 'd3' }).reason, 'illegal');
});

test('chess: castling both sides, and rights lost after king move', () => {
  const g = C.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const r = C.move(g, { from: 'e1', to: 'g1' });
  assert.ok(r.ok); assert.strictEqual(r.move.san, 'O-O');
  assert.strictEqual(C.pieceAt(g, 'f1'), 'R');
  assert.strictEqual(C.move(g, { from: 'e8', to: 'c8' }).move.san, 'O-O-O');
  assert.strictEqual(C.pieceAt(g, 'd8'), 'r');
  // cannot castle through check
  const h = C.fromFen('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');
  assert.strictEqual(C.move(h, { from: 'e1', to: 'g1' }).reason, 'illegal');
});

test('chess: en passant and promotion with choice', () => {
  const g = C.fromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const r = C.move(g, { from: 'e5', to: 'd6' });
  assert.ok(r.ok); assert.strictEqual(r.move.san, 'exd6'); assert.strictEqual(C.pieceAt(g, 'd5'), '');
  const p = C.fromFen('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
  assert.strictEqual(C.move(p, { from: 'e7', to: 'e8', promotion: 'n' }).move.san, 'e8=N');
  assert.strictEqual(C.pieceAt(p, 'e8'), 'N');
});

test('chess: draws (stalemate, insufficient material, 50-move, threefold)', () => {
  assert.strictEqual(C.status(C.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).reason, 'stalemate');
  assert.strictEqual(C.status(C.fromFen('8/8/4k3/8/8/3NK3/8/8 w - - 0 1')).reason, 'insufficient material');
  assert.strictEqual(C.status(C.fromFen('8/8/4k3/8/8/3RK3/8/8 w - - 100 80')).reason, '50-move rule');
  const g = C.newGame();
  for (let i = 0; i < 2; i++) for (const [f, t] of [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']]) C.move(g, { from: f, to: t });
  assert.strictEqual(C.status(g).reason, 'threefold repetition');
});

test('chess: undo restores the position', () => {
  const g = C.newGame();
  C.move(g, { from: 'e2', to: 'e4' }); C.move(g, { from: 'e7', to: 'e5' });
  C.undo(g); C.undo(g);
  assert.strictEqual(C.toFen(g), C.START);
});

test('chess: AI returns legal moves and takes a free queen', () => {
  const g = C.fromFen('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1');
  const m = C.aiMove(g, 2);
  assert.deepStrictEqual([m.from, m.to], ['e4', 'd5']);
  const s = C.newGame();
  for (let i = 0; i < 20 && !C.status(s).over; i++) assert.ok(C.move(s, C.aiMove(s, 1)).ok);
});
