/* Pathforge rules engine + AI. No DOM. Works in browsers and Node (for tests).
 *
 * Rules
 *  - Square board (7x7 or 9x9). Player 0 (cyan) starts bottom-centre, goal = top row.
 *    Player 1 (magenta) starts top-centre, goal = bottom row.
 *  - A turn is ONE of:
 *      move  : step to an orthogonal neighbour that is on the board and not blocked.
 *              If the rival stands there, you may vault straight over onto the cell
 *              beyond (must be on the board and not blocked).
 *      block : forge a crystal block on an empty cell (not a pawn, not a spark),
 *              using one block from your stock. The block may not leave either
 *              runner without a route to its goal (pawns are ignored for this check).
 *      pass  : only legal when you have no move and no legal block.
 *  - Stepping onto a spark consumes it and gives +1 block.
 *  - First to reach the goal row wins. After maxPly turns the game is a draw.
 */
(function (root) {
  'use strict';

  var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function createState(opts) {
    opts = opts || {};
    var size = opts.size === 9 ? 9 : 7;
    var mid = (size - 1) >> 1;
    var n = size * size;
    var blocks = new Array(n).fill(0);
    var sparks = new Array(n).fill(0);
    // Sparks are 180°-rotationally symmetric so both sides get the same chances.
    var sp = size === 9 ? [[3, 1], [5, 7], [4, 4], [2, 6], [6, 2]] : [[2, 1], [4, 5], [3, 3]];
    sp.forEach(function (rc) { sparks[rc[0] * size + rc[1]] = 1; });
    var stock = opts.blocks != null ? opts.blocks : (size === 9 ? 8 : 5);
    return {
      size: size,
      blocks: blocks,
      sparks: sparks,
      pawns: [(size - 1) * size + mid, mid],
      goals: [0, size - 1],
      stock: [stock, stock],
      turn: 0,
      winner: null,
      ply: 0,
      maxPly: opts.maxPly || size * size * 3,
      last: null
    };
  }

  function clone(s) {
    return {
      size: s.size, blocks: s.blocks.slice(), sparks: s.sparks.slice(), pawns: s.pawns.slice(),
      goals: s.goals.slice(), stock: s.stock.slice(), turn: s.turn, winner: s.winner, ply: s.ply,
      maxPly: s.maxPly, last: s.last
    };
  }

  function rc(s, i) { return [Math.floor(i / s.size), i % s.size]; }
  function idx(s, r, c) { return r * s.size + c; }
  function inb(s, r, c) { return r >= 0 && c >= 0 && r < s.size && c < s.size; }

  /* BFS from cell `from` to goal row of player p. Pawns are ignored.
   * Returns {dist, path} where path excludes the start cell; dist=Infinity when sealed. */
  function bfs(s, p, from, blocks) {
    blocks = blocks || s.blocks;
    var start = from == null ? s.pawns[p] : from;
    var goal = s.goals[p], size = s.size;
    if (Math.floor(start / size) === goal) return { dist: 0, path: [] };
    var prev = new Array(size * size).fill(-1);
    var seen = new Array(size * size).fill(false);
    var q = [start], head = 0;
    seen[start] = true;
    while (head < q.length) {
      var cur = q[head++], r = Math.floor(cur / size), c = cur % size;
      for (var d = 0; d < 4; d++) {
        var nr = r + DIRS[d][0], nc = c + DIRS[d][1];
        if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
        var ni = nr * size + nc;
        if (seen[ni] || blocks[ni]) continue;
        seen[ni] = true; prev[ni] = cur;
        if (nr === goal) {
          var path = [ni];
          while (prev[path[0]] !== start) path.unshift(prev[path[0]]);
          return { dist: path.length, path: path };
        }
        q.push(ni);
      }
    }
    return { dist: Infinity, path: [] };
  }

  function dist(s, p) { return bfs(s, p).dist; }

  function moveTargets(s, p) {
    if (p == null) p = s.turn;
    var me = s.pawns[p], opp = s.pawns[1 - p];
    var r0 = Math.floor(me / s.size), c0 = me % s.size, out = [];
    for (var d = 0; d < 4; d++) {
      var r = r0 + DIRS[d][0], c = c0 + DIRS[d][1];
      if (!inb(s, r, c)) continue;
      var i = idx(s, r, c);
      if (s.blocks[i]) continue;
      if (i === opp) {
        var r2 = r + DIRS[d][0], c2 = c + DIRS[d][1];
        if (inb(s, r2, c2) && !s.blocks[idx(s, r2, c2)]) out.push(idx(s, r2, c2));
        continue;
      }
      out.push(i);
    }
    return out;
  }

  function canBlock(s, i, p) {
    if (p == null) p = s.turn;
    if (s.winner !== null || s.stock[p] <= 0) return false;
    if (i < 0 || i >= s.blocks.length) return false;
    if (s.blocks[i] || s.sparks[i] || i === s.pawns[0] || i === s.pawns[1]) return false;
    s.blocks[i] = 1;
    var ok = bfs(s, 0).dist !== Infinity && bfs(s, 1).dist !== Infinity;
    s.blocks[i] = 0;
    return ok;
  }

  function blockTargets(s, p) {
    var out = [];
    for (var i = 0; i < s.blocks.length; i++) if (canBlock(s, i, p)) out.push(i);
    return out;
  }

  function legalActions(s) {
    if (s.winner !== null) return [];
    var acts = moveTargets(s).map(function (t) { return { type: 'move', to: t }; });
    blockTargets(s).forEach(function (b) { acts.push({ type: 'block', at: b }); });
    if (!acts.length) acts.push({ type: 'pass' });
    return acts;
  }

  function isLegal(s, a) {
    if (!a || s.winner !== null) return false;
    if (a.type === 'move') return moveTargets(s).indexOf(a.to) >= 0;
    if (a.type === 'block') return canBlock(s, a.at);
    if (a.type === 'pass') return moveTargets(s).length === 0 && blockTargets(s).length === 0;
    return false;
  }

  /* Returns a NEW state. Throws on illegal actions. */
  function apply(s, a) {
    if (!isLegal(s, a)) throw new Error('Illegal action: ' + JSON.stringify(a));
    var n = clone(s), p = s.turn;
    if (a.type === 'move') {
      n.pawns[p] = a.to;
      if (n.sparks[a.to]) { n.sparks[a.to] = 0; n.stock[p]++; }
      if (Math.floor(a.to / n.size) === n.goals[p]) n.winner = p;
    } else if (a.type === 'block') {
      n.blocks[a.at] = 1; n.stock[p]--;
    }
    n.last = { player: p, type: a.type, cell: a.type === 'move' ? a.to : a.at };
    n.ply++;
    if (n.winner === null && n.ply >= n.maxPly) n.winner = 'draw';
    n.turn = 1 - p;
    return n;
  }

  /* ------------------------------ AI ------------------------------ */
  function evaluate(s, me) {
    if (s.winner === me) return 10000 - s.ply;
    if (s.winner === 1 - me) return -10000 + s.ply;
    if (s.winner === 'draw') return 0;
    var dm = dist(s, me), dop = dist(s, 1 - me);
    // Race lead: the side to move effectively gets one step for free.
    var lead = dop - dm + (s.turn === me ? 1 : 0);
    return lead * 10 + (s.stock[me] - s.stock[1 - me]) * 4 + (lead > 0 ? 6 : -6);
  }

  // Candidate actions: all moves + blocks on/near the opponent's shortest path.
  function candidates(s, wide) {
    var p = s.turn, acts = moveTargets(s).map(function (t) { return { type: 'move', to: t }; });
    if (s.stock[p] > 0) {
      var path = bfs(s, 1 - p).path, seen = {};
      path.forEach(function (cell) {
        var list = [cell];
        if (wide) {
          var r = Math.floor(cell / s.size), c = cell % s.size;
          DIRS.forEach(function (d) { if (inb(s, r + d[0], c + d[1])) list.push(idx(s, r + d[0], c + d[1])); });
        }
        list.forEach(function (x) { if (!seen[x] && canBlock(s, x)) { seen[x] = 1; acts.push({ type: 'block', at: x }); } });
      });
    }
    if (!acts.length) acts = legalActions(s);
    return acts;
  }

  function pickBest(scored, rng) {
    var best = -Infinity;
    scored.forEach(function (x) { if (x.v > best) best = x.v; });
    var top = scored.filter(function (x) { return x.v >= best - 1e-9; });
    return top[Math.floor(rng() * top.length)].a;
  }

  function chooseAction(s, level, rng) {
    rng = rng || Math.random;
    var me = s.turn, acts;
    // Always take an immediate win.
    var moves = moveTargets(s);
    for (var i = 0; i < moves.length; i++) {
      if (Math.floor(moves[i] / s.size) === s.goals[me]) return { type: 'move', to: moves[i] };
    }
    if (level === 'easy') {
      var path = bfs(s, me).path, roll = rng();
      if (roll < 0.12 && s.stock[me] > 0) {
        var bl = candidates(s, false).filter(function (a) { return a.type === 'block'; });
        if (bl.length) return bl[Math.floor(rng() * bl.length)];
      }
      if (roll < 0.75 && path.length && moves.indexOf(path[0]) >= 0) return { type: 'move', to: path[0] };
      // fall back to any move that doesn't make things worse, else anything
      acts = moves.length ? moves.map(function (t) { return { type: 'move', to: t }; }) : legalActions(s);
      return acts[Math.floor(rng() * acts.length)];
    }
    acts = candidates(s, level === 'hard');
    if (level === 'hard') {
      var scored = acts.map(function (a) {
        var n = apply(s, a);
        if (n.winner !== null) return { a: a, v: evaluate(n, me) };
        var worst = Infinity, replies = candidates(n, true);
        for (var j = 0; j < replies.length; j++) {
          var v = evaluate(apply(n, replies[j]), me);
          if (v < worst) worst = v;
        }
        return { a: a, v: worst + rng() * 0.5 };
      });
      return pickBest(scored, rng);
    }
    // normal: one ply + a little noise so games differ
    return pickBest(acts.map(function (a) { return { a: a, v: evaluate(apply(s, a), me) + rng() * 2 }; }), rng);
  }

  var api = {
    createState: createState, clone: clone, bfs: bfs, dist: dist, moveTargets: moveTargets,
    canBlock: canBlock, blockTargets: blockTargets, legalActions: legalActions, isLegal: isLegal,
    apply: apply, evaluate: evaluate, chooseAction: chooseAction, rc: rc, idx: idx
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PathforgeCore = api;
})(typeof self !== 'undefined' ? self : this);
