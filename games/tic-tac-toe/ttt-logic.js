/* Tic Tac Toe rules + AI (pure logic). Board: array of 9 cells, each 'X', 'O' or null.
 * Shared by the browser game and the multiplayer server (authoritative move validation).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TTTLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

  function createGame(first) { return { board: [null, null, null, null, null, null, null, null, null], turn: first === 'O' ? 'O' : 'X', winner: null, line: null, moves: 0 }; }

  /** Returns {winner: 'X'|'O'|'draw'|null, line: [a,b,c]|null}. */
  function outcome(board) {
    for (var i = 0; i < LINES.length; i++) {
      var l = LINES[i], v = board[l[0]];
      if (v && v === board[l[1]] && v === board[l[2]]) return { winner: v, line: l };
    }
    for (var j = 0; j < 9; j++) if (!board[j]) return { winner: null, line: null };
    return { winner: 'draw', line: null };
  }

  /** Validates and applies a move. Returns {ok, reason?}. */
  function play(g, cell, mark) {
    if (g.winner) return { ok: false, reason: 'game-over' };
    if (mark && mark !== g.turn) return { ok: false, reason: 'not-your-turn' };
    if (!(cell >= 0 && cell < 9) || cell !== Math.floor(cell)) return { ok: false, reason: 'bad-cell' };
    if (g.board[cell]) return { ok: false, reason: 'occupied' };
    g.board[cell] = g.turn; g.moves++;
    var o = outcome(g.board);
    g.winner = o.winner; g.line = o.line;
    if (!g.winner) g.turn = g.turn === 'X' ? 'O' : 'X';
    return { ok: true };
  }

  function empty(board) { var out = []; for (var i = 0; i < 9; i++) if (!board[i]) out.push(i); return out; }

  /** Minimax with depth preference: wins sooner, loses later. */
  var memo = {};
  function minimax(board, me, toMove, depth) {
    var key = board.map(function (c) { return c || '-'; }).join('') + me + toMove + depth;
    if (key in memo) return memo[key];
    return (memo[key] = minimaxRaw(board, me, toMove, depth));
  }
  function minimaxRaw(board, me, toMove, depth) {
    var o = outcome(board);
    if (o.winner === me) return 10 - depth;
    if (o.winner === 'draw') return 0;
    if (o.winner) return depth - 10;
    var best = toMove === me ? -Infinity : Infinity, cells = empty(board), next = toMove === 'X' ? 'O' : 'X';
    for (var i = 0; i < cells.length; i++) {
      board[cells[i]] = toMove;
      var v = minimax(board, me, next, depth + 1);
      board[cells[i]] = null;
      best = toMove === me ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }
  function bestMoves(board, me) {
    var cells = empty(board), next = me === 'X' ? 'O' : 'X', best = -Infinity, out = [];
    cells.forEach(function (c) {
      board[c] = me; var v = minimax(board, me, next, 1); board[c] = null;
      if (v > best) { best = v; out = [c]; } else if (v === best) out.push(c);
    });
    return out;
  }
  function winningMove(board, mark) {
    var cells = empty(board);
    for (var i = 0; i < cells.length; i++) { board[cells[i]] = mark; var w = outcome(board).winner === mark; board[cells[i]] = null; if (w) return cells[i]; }
    return -1;
  }

  /** AI move. easy: random, but takes an immediate win half the time. medium: wins/blocks, otherwise
   *  perfect 60% of the time. hard: perfect play (never loses). */
  function aiMove(board, me, level, rng) {
    rng = rng || Math.random;
    var cells = empty(board), them = me === 'X' ? 'O' : 'X';
    if (!cells.length) return -1;
    function pick(a) { return a[Math.floor(rng() * a.length)]; }
    if (level === 'easy') {
      var w = winningMove(board, me);
      return w >= 0 && rng() < 0.5 ? w : pick(cells);
    }
    if (level === 'medium') {
      var win = winningMove(board, me); if (win >= 0) return win;
      var block = winningMove(board, them); if (block >= 0) return block;
      return rng() < 0.6 ? pick(bestMoves(board, me)) : pick(cells);
    }
    return pick(bestMoves(board, me));
  }

  return { LINES: LINES, createGame: createGame, outcome: outcome, play: play, aiMove: aiMove, bestMoves: bestMoves, empty: empty };
});
