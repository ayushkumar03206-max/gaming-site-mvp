/* Chess: vs computer (3 levels) or 2 players on one device. DOM board on top of chess-rules.js. */
(function () {
  'use strict';
  var K = window.GLKit, C = window.ChessRules, $ = K.$;
  K.init('Chess');
  if (!C) { K.fail('Chess could not start.'); return; }

  var GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  var NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
  var opp = K.load('gl_chess_opp', 'ai'), level = K.load('gl_chess_level', 2), human = K.load('gl_chess_color', 'w');
  var g = null, mode = 'title', sel = null, targets = [], lastMove = null, flipped = false, aiTimer = null, pendingPromo = null, focusSq = 'e2', resigned = null;
  var screens = K.screens(['title', 'menu', 'promo', 'over']);
  var online = null, shownResultFor = null; // latest server snapshot while playing online (server is authoritative)
  function myColor() { return online ? online.match.colors[online.you.seat] : null; }

  function seg(attr, val) { Array.prototype.forEach.call(document.querySelectorAll('[' + attr + ']'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(val))); }); }
  function syncTitle() { seg('data-opp', opp); seg('data-level', level); seg('data-color', human); $('aiOpts').hidden = opp !== 'ai'; }
  [['data-opp', function (v) { opp = v; K.save('gl_chess_opp', v); }], ['data-level', function (v) { level = +v; K.save('gl_chess_level', level); }], ['data-color', function (v) { human = v; K.save('gl_chess_color', v); }]]
    .forEach(function (p) { Array.prototype.forEach.call(document.querySelectorAll('[' + p[0] + ']'), function (b) { b.addEventListener('click', function () { p[1](b.getAttribute(p[0])); syncTitle(); }); }); });

  var squares = {};
  function buildBoard() {
    var board = $('board'); board.innerHTML = '';
    for (var r = 7; r >= 0; r--) for (var f = 0; f < 8; f++) {
      var rr = flipped ? 7 - r : r, ff = flipped ? 7 - f : f, alg = String.fromCharCode(97 + ff) + (rr + 1);
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sq ' + ((rr + ff) % 2 ? 'light' : 'dark');
      b.setAttribute('data-sq', alg); b.tabIndex = alg === focusSq ? 0 : -1;
      if (f === 0) b.setAttribute('data-rank', rr + 1);
      if (r === 0) b.setAttribute('data-file', String.fromCharCode(97 + ff));
      (function (a) { b.addEventListener('click', function () { focusSq = a; tap(a); }); })(alg);
      board.appendChild(b); squares[alg] = b;
    }
  }
  function aiTurn() { return !online && opp === 'ai' && g && !C.status(g).over && !resigned && g.turn !== human; }
  function render() {
    var st = C.status(g), kingInCheck = st.check ? findKing(g.turn) : null;
    Object.keys(squares).forEach(function (a) {
      var p = C.pieceAt(g, a), el = squares[a];
      el.textContent = p ? GLYPH[p.toLowerCase()] : '';
      el.classList.toggle('w', !!p && C.color(p) === 'w'); el.classList.toggle('b', !!p && C.color(p) === 'b');
      el.classList.toggle('sel', sel === a);
      el.classList.toggle('tgt', targets.indexOf(a) >= 0); el.classList.toggle('cap', targets.indexOf(a) >= 0 && !!p);
      el.classList.toggle('last', !!lastMove && (lastMove.from === a || lastMove.to === a));
      el.classList.toggle('check', a === kingInCheck);
      el.setAttribute('aria-label', a + ': ' + (p ? (C.color(p) === 'w' ? 'white ' : 'black ') + NAMES[p.toLowerCase()] : 'empty') + (targets.indexOf(a) >= 0 ? ', legal move' : ''));
    });
    var moves = online ? online.match.moves : C.moveList(g), html = '';
    for (var i = 0; i < moves.length; i += 2) html += '<li><span>' + (i / 2 + 1) + '.</span> ' + moves[i] + (moves[i + 1] ? ' &nbsp;' + moves[i + 1] : '') + '</li>';
    $('moves').innerHTML = html || '<li class="muted">No moves yet</li>';
    $('moves').scrollTop = 1e6;
    var who = g.turn === 'w' ? 'White' : 'Black', txt;
    if (online) {
      var opName = (online.players.filter(function (p) { return p.seat !== online.you.seat; })[0] || {}).name || 'Opponent';
      if (online.status === 'finished') txt = GLMP.resultText();
      else txt = (g.turn === myColor() ? 'Your move' : opName + ' to move') + ' (you are ' + (myColor() === 'w' ? 'white' : 'black') + ')' + (st.check ? ' — check!' : '');
      if (online.status === 'playing' && online.match.drawOffer !== null) txt += online.match.drawOffer === online.you.seat ? ' · Draw offered' : ' · ' + opName + ' offers a draw';
    } else if (resigned) txt = (resigned === 'w' ? 'White' : 'Black') + ' resigned.';
    else if (st.over) txt = st.reason === 'checkmate' ? 'Checkmate! ' + (st.result === '1-0' ? 'White' : 'Black') + ' wins.' : 'Draw by ' + st.reason + '.';
    else txt = (aiTurn() ? 'Computer is thinking…' : who + ' to move') + (st.check ? ' — check!' : '');
    $('status').textContent = txt;
    $('undoBtn').disabled = !g.history.length || st.over || !!resigned || aiTurn();
    $('undoBtn').hidden = !!online; $('flipBtn').hidden = false;
    $('drawBtn').hidden = !online || online.status !== 'playing';
    if (online) {
      var offer = online.match.drawOffer;
      $('drawBtn').textContent = offer !== null && offer !== online.you.seat ? 'Accept draw' : 'Offer draw';
      $('drawBtn').disabled = offer === online.you.seat;
      $('resignBtn').disabled = online.status !== 'playing';
    } else $('resignBtn').disabled = false;
    $('oppOff').hidden = !online || online.status !== 'playing' || GLMP.opponentConnected();
  }

  // ---- online play: the board is drawn from the server's FEN; moves are requests the server validates
  function onlineMatch(room) {
    var newMatch = !online || online.matchNo !== room.matchNo;
    online = room; clearTimeout(aiTimer);
    g = C.fromFen(room.match.fen); lastMove = room.match.last; resigned = null;
    if (newMatch) { sel = null; targets = []; flipped = myColor() === 'b'; buildBoard(); }
    else if (g.turn !== myColor()) { sel = null; targets = []; }
    mode = 'play'; $('app').hidden = false; screens.show(null); render();
    if (newMatch) K.announce('Online game started. You play ' + (myColor() === 'w' ? 'white' : 'black') + '.');
    else if (room.match.moves.length) K.announce(room.match.moves[room.match.moves.length - 1].replace('#', ' checkmate').replace('+', ' check'));
    if (room.status === 'finished' && shownResultFor !== room.matchNo) {
      shownResultFor = room.matchNo; mode = 'over';
      $('overTitle').textContent = GLMP.resultText(); $('overMsg').textContent = room.match.moves.length + ' half-moves played.';
      $('againBtn').textContent = 'Back to the room'; $('toTitleBtn2').textContent = 'Leave online game';
      K.sound.play(room.result.winnerSeat === room.you.seat ? 'win' : room.result.winnerSeat === null ? 'pop' : 'lose');
      setTimeout(function () { screens.show('over'); }, 500);
    }
  }
  function startOnline() {
    GLMP.open({ gameId: 'chess', title: 'Chess', howTo: 'Colours swap every game. The server checks every move with the full rules, including draws.',
      onMatch: onlineMatch, onExit: function () { online = null; toTitle(); } });
  }
  function findKing(c) { var k = c === 'w' ? 'K' : 'k'; for (var a in squares) if (C.pieceAt(g, a) === k) return a; return null; }

  function newGame() {
    clearTimeout(aiTimer); g = C.newGame(); sel = null; targets = []; lastMove = null; resigned = null;
    flipped = opp === 'ai' && human === 'b'; buildBoard();
    mode = 'play'; $('app').hidden = false; screens.show(null); render();
    K.announce(opp === 'ai' ? 'New game. You play ' + (human === 'w' ? 'white' : 'black') + '.' : 'New game. White to move.');
    if (aiTurn()) scheduleAI();
  }
  function scheduleAI() { aiTimer = setTimeout(function () { if (!aiTurn() || mode !== 'play') return; var m = C.aiMove(g, level); if (m) play(m); }, 350); }

  function tap(a) {
    if (mode !== 'play' || aiTurn() || C.status(g).over || resigned) return;
    var p = C.pieceAt(g, a);
    if (sel && targets.indexOf(a) >= 0) {
      var piece = C.pieceAt(g, sel), lastRank = g.turn === 'w' ? '8' : '1';
      if (piece.toLowerCase() === 'p' && a[1] === lastRank) { pendingPromo = { from: sel, to: a }; mode = 'promo'; screens.show('promo'); return; }
      play({ from: sel, to: a }); return;
    }
    var mine = online ? (online.status === 'playing' && g.turn === myColor()) : (opp === 'local' || g.turn === human);
    if (p && C.color(p) === g.turn && mine) {
      sel = a; targets = C.legalMoves(g, C.sq(a)).map(function (m) { return C.name(m.to); }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
      K.sound.play('blip');
      if (!targets.length) K.announce('That piece has no legal moves.');
    } else { sel = null; targets = []; }
    render();
  }
  function play(m) {
    if (online) {
      sel = null; targets = []; render();
      GLMP.act({ type: 'move', from: m.from, to: m.to, promotion: m.promotion }).then(function (r) { if (!r.ok) K.announce(r.message || 'Move not accepted.'); else K.sound.play('place'); });
      return;
    }
    var r = C.move(g, m);
    if (!r.ok) { K.announce('Illegal move.'); return; }
    sel = null; targets = []; lastMove = { from: r.move.from, to: r.move.to };
    K.sound.play(r.move.captured ? 'pop' : 'place');
    render();
    var st = C.status(g);
    K.announce(r.move.san.replace('#', ' checkmate').replace('+', ' check') + '.');
    if (st.over) return endGame();
    if (st.check) K.sound.play('hit');
    if (aiTurn()) scheduleAI();
  }
  function endGame() {
    var st = C.status(g);
    mode = 'over';
    var title;
    if (resigned) title = (resigned === 'w' ? 'Black' : 'White') + ' wins by resignation';
    else if (st.reason === 'checkmate') title = (st.result === '1-0' ? 'White' : 'Black') + ' wins by checkmate';
    else title = 'Draw: ' + st.reason;
    $('overTitle').textContent = title;
    $('overMsg').textContent = C.moveList(g).length + ' half-moves played.';
    var youWon = opp === 'ai' && ((resigned && resigned !== human) || (st.result === '1-0' && human === 'w') || (st.result === '0-1' && human === 'b'));
    K.sound.play(youWon || opp === 'local' ? 'win' : 'lose');
    K.announce(title);
    setTimeout(function () { if (mode === 'over') screens.show('over'); }, 600);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-promo]'), function (b) {
    b.addEventListener('click', function () { var m = pendingPromo; pendingPromo = null; mode = 'play'; screens.show(null); if (m) { m.promotion = b.getAttribute('data-promo'); play(m); } });
  });
  $('undoBtn').addEventListener('click', function () {
    if (!g.history.length) return;
    C.undo(g); if (opp === 'ai' && g.turn !== human && g.history.length) C.undo(g);
    var h = g.history[g.history.length - 1]; lastMove = h ? { from: h.rec.from, to: h.rec.to } : null;
    sel = null; targets = []; render();
  });
  $('flipBtn').addEventListener('click', function () { flipped = !flipped; buildBoard(); render(); });
  $('drawBtn').addEventListener('click', function () {
    if (!online) return;
    var offer = online.match.drawOffer;
    GLMP.act({ type: offer !== null && offer !== online.you.seat ? 'accept-draw' : 'offer-draw' }).then(function (r) { if (!r.ok) K.announce(r.message || 'Not accepted.'); });
  });
  $('resignBtn').addEventListener('click', function () {
    if (online) { if (online.status === 'playing') GLMP.act({ type: 'resign' }); return; }
    if (mode !== 'play' || C.status(g).over) return; resigned = opp === 'ai' ? human : g.turn; render(); endGame(); });
  $('playBtn').addEventListener('click', function () { online = null; newGame(); });
  $('againBtn').addEventListener('click', function () { if (online) { GLMP.showLobby(); return; } newGame(); });
  $('newBtn').addEventListener('click', function () { if (online) { mode = 'play'; screens.show(null); return; } newGame(); });
  $('onlineBtn').addEventListener('click', startOnline);
  if (window.GLMP) GLMP.available('chess').then(function (yes) { $('onlineBtn').hidden = !yes; if (yes && GLMP.inviteCode()) startOnline(); });
  $('menuBtn').addEventListener('click', function () {
    if (mode !== 'play') return;
    mode = 'menu'; clearTimeout(aiTimer);
    $('newBtn').textContent = online ? 'Back to the game' : 'Restart game';
    $('toTitleBtn').textContent = online ? 'Leave online game' : 'Change opponent';
    screens.show('menu');
  });
  $('resumeBtn').addEventListener('click', function () { mode = 'play'; screens.show(null); if (aiTurn()) scheduleAI(); });
  function toTitle() { clearTimeout(aiTimer); mode = 'title'; $('app').hidden = true; $('againBtn').textContent = 'New game'; $('toTitleBtn2').textContent = 'Change opponent'; syncTitle(); screens.show('title'); }
  function leaveOrTitle() { if (online) { online = null; GLMP.exit(); return; } toTitle(); }
  $('toTitleBtn').addEventListener('click', leaveOrTitle); $('toTitleBtn2').addEventListener('click', leaveOrTitle);
  $('reviewBtn').addEventListener('click', function () { screens.show(null); });
  K.onRestart(function () { if (!online) newGame(); }); K.muteButton();

  // keyboard: arrows move focus across squares (respecting flip), Enter/Space selects
  $('board').addEventListener('keydown', function (e) {
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!d) return;
    e.preventDefault();
    var f = focusSq.charCodeAt(0) - 97, r = +focusSq[1] - 1, s = flipped ? -1 : 1;
    f += d[0] * s; r += d[1] * s;
    if (f < 0 || f > 7 || r < 0 || r > 7) return;
    squares[focusSq].tabIndex = -1; focusSq = String.fromCharCode(97 + f) + (r + 1); squares[focusSq].tabIndex = 0; squares[focusSq].focus();
  });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mode === 'play') $('menuBtn').click(); });

  syncTitle(); screens.show('title');
  window.GLDebug = { state: function () { return g ? { mode: mode, fen: C.toFen(g), turn: g.turn, moves: online ? online.match.moves : C.moveList(g), status: C.status(g), opp: online ? 'online' : opp, human: online ? myColor() : human, roomStatus: online ? online.status : null, result: online ? online.result : null } : { mode: mode }; } };
  K.ready();
})();
