/* Chess rules engine (pure logic, no dependencies). Verified with perft counts in tests/js/chess.test.js.
 *
 * Board: 0x88 array of 128 entries; piece = 'P','N','B','R','Q','K' (white) or lowercase (black), '' empty.
 * Squares are numbered 0x88-style (rank * 16 + file), rank 0 = rank 1. Algebraic helpers convert to 'e4' etc.
 * Supports castling, en passant, promotion (choice of piece), check, checkmate, stalemate, 50-move rule,
 * threefold repetition and insufficient material. Moves carry SAN for the move list.
 * Used by the browser game and by the multiplayer server for authoritative validation.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChessRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  var N_OFF = [33, 31, 18, 14, -14, -18, -31, -33], K_OFF = [1, -1, 16, -16, 17, 15, -15, -17];
  var B_OFF = [17, 15, -15, -17], R_OFF = [1, -1, 16, -16];

  function sq(name) { return (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97); }
  function name(s) { return String.fromCharCode(97 + (s & 7)) + (1 + (s >> 4)); }
  function color(p) { return p ? (p === p.toUpperCase() ? 'w' : 'b') : null; }
  function type(p) { return p.toUpperCase(); }

  function fromFen(fen) {
    var parts = fen.trim().split(/\s+/), b = new Array(128).fill(''), rows = parts[0].split('/');
    for (var r = 0; r < 8; r++) {
      var f = 0;
      for (var i = 0; i < rows[r].length; i++) {
        var ch = rows[r][i];
        if (/\d/.test(ch)) f += +ch; else { b[(7 - r) * 16 + f] = ch; f++; }
      }
    }
    var g = { board: b, turn: parts[1] || 'w', castling: parts[2] && parts[2] !== '-' ? parts[2] : '', ep: parts[3] && parts[3] !== '-' ? sq(parts[3]) : -1,
      half: +(parts[4] || 0), full: +(parts[5] || 1), history: [], positions: {} };
    g.positions[posKey(g)] = 1;
    return g;
  }
  function toFen(g) {
    var rows = [];
    for (var r = 7; r >= 0; r--) {
      var row = '', empty = 0;
      for (var f = 0; f < 8; f++) { var p = g.board[r * 16 + f]; if (!p) empty++; else { if (empty) row += empty; empty = 0; row += p; } }
      if (empty) row += empty; rows.push(row);
    }
    return rows.join('/') + ' ' + g.turn + ' ' + (g.castling || '-') + ' ' + (g.ep >= 0 ? name(g.ep) : '-') + ' ' + g.half + ' ' + g.full;
  }
  function posKey(g) { return toFen(g).split(' ').slice(0, 4).join(' '); }
  function newGame(fen) { return fromFen(fen || START); }

  function kingSq(g, c) { var k = c === 'w' ? 'K' : 'k'; for (var s = 0; s < 128; s++) if (!(s & 0x88) && g.board[s] === k) return s; return -1; }

  /** Is square s attacked by colour c? */
  function attacked(g, s, c) {
    var b = g.board, i, t, p;
    var pawn = c === 'w' ? 'P' : 'p', dir = c === 'w' ? -16 : 16; // pawns attack from behind the square
    [dir - 1, dir + 1].forEach(function (o) { t = s + o; if (!(t & 0x88) && b[t] === pawn) p = true; });
    if (p) return true;
    for (i = 0; i < 8; i++) { t = s + N_OFF[i]; if (!(t & 0x88) && b[t] && color(b[t]) === c && type(b[t]) === 'N') return true; }
    for (i = 0; i < 8; i++) { t = s + K_OFF[i]; if (!(t & 0x88) && b[t] && color(b[t]) === c && type(b[t]) === 'K') return true; }
    for (i = 0; i < 4; i++) for (t = s + B_OFF[i]; !(t & 0x88); t += B_OFF[i]) { if (b[t]) { if (color(b[t]) === c && (type(b[t]) === 'B' || type(b[t]) === 'Q')) return true; break; } }
    for (i = 0; i < 4; i++) for (t = s + R_OFF[i]; !(t & 0x88); t += R_OFF[i]) { if (b[t]) { if (color(b[t]) === c && (type(b[t]) === 'R' || type(b[t]) === 'Q')) return true; break; } }
    return false;
  }
  function inCheck(g, c) { c = c || g.turn; return attacked(g, kingSq(g, c), c === 'w' ? 'b' : 'w'); }

  function pseudo(g) {
    var out = [], b = g.board, us = g.turn, them = us === 'w' ? 'b' : 'w';
    function add(from, to, flags, promo) {
      if (promo) ['Q', 'R', 'B', 'N'].forEach(function (pp) { out.push({ from: from, to: to, piece: b[from], captured: b[to] || (flags === 'ep' ? (us === 'w' ? 'p' : 'P') : ''), flags: flags, promotion: us === 'w' ? pp : pp.toLowerCase() }); });
      else out.push({ from: from, to: to, piece: b[from], captured: b[to] || (flags === 'ep' ? (us === 'w' ? 'p' : 'P') : ''), flags: flags || '' });
    }
    for (var s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      var p = b[s]; if (!p || color(p) !== us) continue;
      var tp = type(p), i, t;
      if (tp === 'P') {
        var fwd = us === 'w' ? 16 : -16, startRank = us === 'w' ? 1 : 6, lastRank = us === 'w' ? 7 : 0;
        t = s + fwd;
        if (!(t & 0x88) && !b[t]) {
          add(s, t, '', (t >> 4) === lastRank);
          if ((s >> 4) === startRank && !b[t + fwd]) add(s, t + fwd, 'double');
        }
        [fwd - 1, fwd + 1].forEach(function (o) {
          var c2 = s + o; if (c2 & 0x88) return;
          if (b[c2] && color(b[c2]) === them) add(s, c2, '', (c2 >> 4) === lastRank);
          else if (c2 === g.ep) add(s, c2, 'ep');
        });
      } else if (tp === 'N' || tp === 'K') {
        var offs = tp === 'N' ? N_OFF : K_OFF;
        for (i = 0; i < 8; i++) { t = s + offs[i]; if (!(t & 0x88) && (!b[t] || color(b[t]) === them)) add(s, t); }
        if (tp === 'K') {
          var rank = us === 'w' ? 0 : 0x70, ks = us === 'w' ? 'K' : 'k', qs = us === 'w' ? 'Q' : 'q';
          if (s === rank + 4 && !attacked(g, s, them)) {
            if (g.castling.indexOf(ks) >= 0 && !b[rank + 5] && !b[rank + 6] && b[rank + 7] === (us === 'w' ? 'R' : 'r') && !attacked(g, rank + 5, them) && !attacked(g, rank + 6, them)) add(s, rank + 6, 'O-O');
            if (g.castling.indexOf(qs) >= 0 && !b[rank + 3] && !b[rank + 2] && !b[rank + 1] && b[rank] === (us === 'w' ? 'R' : 'r') && !attacked(g, rank + 3, them) && !attacked(g, rank + 2, them)) add(s, rank + 2, 'O-O-O');
          }
        }
      } else {
        var dirs = tp === 'B' ? B_OFF : tp === 'R' ? R_OFF : B_OFF.concat(R_OFF);
        for (i = 0; i < dirs.length; i++) for (t = s + dirs[i]; !(t & 0x88); t += dirs[i]) {
          if (!b[t]) add(s, t); else { if (color(b[t]) === them) add(s, t); break; }
        }
      }
    }
    return out;
  }

  function makeRaw(g, m) {
    var b = g.board, us = g.turn, undo = { m: m, castling: g.castling, ep: g.ep, half: g.half, full: g.full };
    b[m.to] = m.promotion || b[m.from]; b[m.from] = '';
    if (m.flags === 'ep') b[m.to + (us === 'w' ? -16 : 16)] = '';
    if (m.flags === 'O-O') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = ''; }
    if (m.flags === 'O-O-O') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = ''; }
    g.ep = m.flags === 'double' ? (m.from + m.to) / 2 : -1;
    // castling rights: moving king/rook or capturing a rook on its home square
    var cr = g.castling;
    [[0x04, 'KQ'], [0x74, 'kq'], [0x00, 'Q'], [0x07, 'K'], [0x70, 'q'], [0x77, 'k']].forEach(function (x) {
      if (m.from === x[0] || m.to === x[0]) for (var k = 0; k < x[1].length; k++) cr = cr.replace(x[1][k], '');
    });
    g.castling = cr;
    g.half = (type(m.piece) === 'P' || m.captured) ? 0 : g.half + 1;
    if (us === 'b') g.full++;
    g.turn = us === 'w' ? 'b' : 'w';
    return undo;
  }
  function unmakeRaw(g, u) {
    var b = g.board, m = u.m, us = g.turn === 'w' ? 'b' : 'w';
    b[m.from] = m.piece; b[m.to] = m.flags === 'ep' ? '' : m.captured;
    if (m.flags === 'ep') b[m.to + (us === 'w' ? -16 : 16)] = m.captured;
    if (m.flags === 'O-O') { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = ''; }
    if (m.flags === 'O-O-O') { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = ''; }
    g.castling = u.castling; g.ep = u.ep; g.half = u.half; g.full = u.full; g.turn = us;
  }

  function legalMoves(g, from) {
    var us = g.turn, out = [];
    pseudo(g).forEach(function (m) {
      if (from != null && m.from !== from) return;
      var u = makeRaw(g, m);
      if (!inCheck(g, us)) out.push(m);
      unmakeRaw(g, u);
    });
    return out;
  }

  function san(g, m, all) {
    var s;
    if (m.flags === 'O-O') s = 'O-O'; else if (m.flags === 'O-O-O') s = 'O-O-O';
    else {
      var tp = type(m.piece), cap = m.captured ? 'x' : '';
      if (tp === 'P') s = (cap ? name(m.from)[0] : '') + cap + name(m.to) + (m.promotion ? '=' + type(m.promotion) : '');
      else {
        var amb = all.filter(function (o) { return o !== m && o.to === m.to && o.piece === m.piece && o.from !== m.from; }), dis = '';
        if (amb.length) {
          var sameFile = amb.some(function (o) { return (o.from & 7) === (m.from & 7); }), sameRank = amb.some(function (o) { return (o.from >> 4) === (m.from >> 4); });
          dis = !sameFile ? name(m.from)[0] : !sameRank ? name(m.from)[1] : name(m.from);
        }
        s = tp + dis + cap + name(m.to);
      }
    }
    var u = makeRaw(g, m), chk = inCheck(g), mate = chk && legalMoves(g).length === 0;
    unmakeRaw(g, u);
    return s + (mate ? '#' : chk ? '+' : '');
  }

  /** Play a move given as {from:'e2', to:'e4', promotion:'q'}. Validates fully. Returns {ok, move?, reason?}. */
  function move(g, req) {
    if (status(g).over) return { ok: false, reason: 'game-over' };
    if (!req || typeof req.from !== 'string' || typeof req.to !== 'string' || !/^[a-h][1-8]$/.test(req.from) || !/^[a-h][1-8]$/.test(req.to)) return { ok: false, reason: 'bad-square' };
    var from = sq(req.from), to = sq(req.to), all = legalMoves(g);
    var cands = all.filter(function (m) { return m.from === from && m.to === to; });
    if (!cands.length) return { ok: false, reason: 'illegal' };
    var m = cands[0];
    if (cands.length > 1) { // promotion
      var want = (req.promotion || 'q').toUpperCase();
      m = cands.filter(function (c) { return type(c.promotion) === want; })[0];
      if (!m) return { ok: false, reason: 'bad-promotion' };
    }
    var rec = { from: name(m.from), to: name(m.to), piece: m.piece, captured: m.captured || null, flags: m.flags, promotion: m.promotion || null, san: san(g, m, all), color: g.turn };
    var u = makeRaw(g, m);
    g.history.push({ rec: rec, undo: u });
    var k = posKey(g); g.positions[k] = (g.positions[k] || 0) + 1;
    return { ok: true, move: rec };
  }
  function undo(g) {
    var h = g.history.pop(); if (!h) return null;
    var k = posKey(g); if (--g.positions[k] <= 0) delete g.positions[k];
    unmakeRaw(g, h.undo);
    return h.rec;
  }

  function insufficient(g) {
    var minors = [], others = 0;
    for (var s = 0; s < 128; s++) {
      if (s & 0x88) continue; var p = g.board[s]; if (!p || type(p) === 'K') continue;
      if (type(p) === 'B' || type(p) === 'N') minors.push({ t: type(p), c: ((s >> 4) + (s & 7)) % 2 }); else others++;
    }
    if (others) return false;
    if (minors.length <= 1) return true;
    return minors.every(function (m) { return m.t === 'B' && m.c === minors[0].c; }); // only same-coloured bishops
  }

  /** {over, result: '1-0'|'0-1'|'1/2-1/2'|null, reason, check} */
  function status(g) {
    var moves = legalMoves(g), chk = inCheck(g);
    if (!moves.length) return chk ? { over: true, result: g.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate', check: true } : { over: true, result: '1/2-1/2', reason: 'stalemate', check: false };
    if (insufficient(g)) return { over: true, result: '1/2-1/2', reason: 'insufficient material', check: chk };
    if (g.half >= 100) return { over: true, result: '1/2-1/2', reason: '50-move rule', check: chk };
    if (g.positions[posKey(g)] >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold repetition', check: chk };
    return { over: false, result: null, reason: null, check: chk };
  }

  function perft(g, depth) {
    if (depth === 0) return 1;
    var n = 0, us = g.turn, ms = pseudo(g);
    for (var i = 0; i < ms.length; i++) {
      var u = makeRaw(g, ms[i]);
      if (!inCheck(g, us)) n += depth === 1 ? 1 : perft(g, depth - 1);
      unmakeRaw(g, u);
    }
    return n;
  }

  // ---- small AI: alpha-beta with material + piece-square bonus, for single-player practice ----
  var VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  function evaluate(g) {
    var sc = 0;
    for (var s = 0; s < 128; s++) {
      if (s & 0x88) continue; var p = g.board[s]; if (!p) continue;
      var f = s & 7, r = s >> 4, tp = type(p), v = VAL[tp];
      var centre = 3.5 - Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5));
      if (tp === 'N' || tp === 'B') v += centre * 8;
      if (tp === 'P') v += (color(p) === 'w' ? r : 7 - r) * 6 + (f > 1 && f < 6 ? centre * 3 : 0);
      sc += color(p) === 'w' ? v : -v;
    }
    return g.turn === 'w' ? sc : -sc;
  }
  function search(g, depth, alpha, beta) {
    var ms = legalMoves(g);
    if (!ms.length) return inCheck(g) ? -100000 - depth : 0;
    if (depth === 0) return evaluate(g);
    ms.sort(function (a, b) { return (b.captured ? VAL[type(b.captured)] : 0) - (a.captured ? VAL[type(a.captured)] : 0); });
    for (var i = 0; i < ms.length; i++) {
      var u = makeRaw(g, ms[i]), v = -search(g, depth - 1, -beta, -alpha);
      unmakeRaw(g, u);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }
  /** Returns {from, to, promotion} in algebraic form. level: 1 (casual) .. 3 (stronger). */
  function aiMove(g, level, rng) {
    rng = rng || Math.random;
    var depth = level >= 3 ? 3 : level === 2 ? 2 : 1, ms = legalMoves(g), best = [], bv = -Infinity;
    ms.forEach(function (m) {
      var u = makeRaw(g, m), v = -search(g, depth - 1, -Infinity, Infinity);
      unmakeRaw(g, u);
      if (level === 1) v += rng() * 60; // casual level adds noise
      if (v > bv + 1e-9) { bv = v; best = [m]; } else if (Math.abs(v - bv) < 1e-9) best.push(m);
    });
    var m = best[Math.floor(rng() * best.length)];
    return m ? { from: name(m.from), to: name(m.to), promotion: m.promotion ? type(m.promotion).toLowerCase() : undefined } : null;
  }

  function pieceAt(g, alg) { return g.board[sq(alg)] || ''; }
  function moveList(g) { return g.history.map(function (h) { return h.rec.san; }); }

  return { START: START, newGame: newGame, fromFen: fromFen, toFen: toFen, move: move, undo: undo, legalMoves: legalMoves, status: status,
    inCheck: inCheck, perft: perft, aiMove: aiMove, sq: sq, name: name, pieceAt: pieceAt, moveList: moveList, color: color };
});
