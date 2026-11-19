/* Tic Tac Toe: vs computer (3 levels) or 2 players on one device. DOM board. */
(function () {
  'use strict';
  var K = window.GLKit, T = window.TTTLogic, $ = K.$;
  K.init('Tic Tac Toe');
  if (!T) { K.fail('Tic Tac Toe could not start.'); return; }

  var opp = K.load('gl_ttt_opp', 'ai'), level = K.load('gl_ttt_level', 'medium'), human = K.load('gl_ttt_mark', 'X');
  var g = null, mode = 'title', first = 'X', round = 0, aiTimer = null, focusIdx = 4;
  var online = null; // latest server room snapshot while playing online (server is authoritative)
  var scores = { X: 0, O: 0, D: 0 };
  var screens = K.screens(['title', 'menu']);

  function seg(attr, val) { Array.prototype.forEach.call(document.querySelectorAll('[' + attr + ']'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === val)); }); }
  function syncTitle() { seg('data-opp', opp); seg('data-level', level); seg('data-mark', human); $('aiOpts').hidden = opp !== 'ai'; }
  [['data-opp', function (v) { opp = v; K.save('gl_ttt_opp', v); }], ['data-level', function (v) { level = v; K.save('gl_ttt_level', v); }], ['data-mark', function (v) { human = v; K.save('gl_ttt_mark', v); }]]
    .forEach(function (p) { Array.prototype.forEach.call(document.querySelectorAll('[' + p[0] + ']'), function (b) { b.addEventListener('click', function () { p[1](b.getAttribute(p[0])); syncTitle(); }); }); });

  var cells = [];
  (function buildBoard() {
    for (var i = 0; i < 9; i++) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'cell'; b.setAttribute('data-i', i); b.tabIndex = i === 4 ? 0 : -1;
      (function (idx) { b.addEventListener('click', function () { focusIdx = idx; humanMove(idx); }); })(i);
      $('board').appendChild(b); cells.push(b);
    }
  })();

  function myMark() { return online ? online.match.marks[online.you.seat] : null; }
  function names() {
    if (online) {
      var n = {}, me = online.you.seat;
      online.players.forEach(function (p) { n[online.match.marks[p.seat]] = p.seat === me ? 'You' : p.name; });
      if (!n.X) n.X = 'Opponent'; if (!n.O) n.O = 'Opponent';
      return n;
    }
    if (opp === 'local') return { X: 'Player X', O: 'Player O' };
    var n = {}; n[human] = 'You'; n[human === 'X' ? 'O' : 'X'] = 'Computer (' + level + ')'; return n;
  }
  function render() {
    var n = names();
    $('nX').textContent = n.X + ' · X'; $('nO').textContent = n.O + ' · O';
    $('sX').textContent = scores.X; $('sO').textContent = scores.O; $('sD').textContent = scores.D;
    g.board.forEach(function (v, i) {
      var c = cells[i];
      c.textContent = v || ''; c.className = 'cell' + (v ? ' ' + v.toLowerCase() : '') + (g.line && g.line.indexOf(i) >= 0 ? ' win' : '');
      var blocked = !!v || !!g.winner || aiTurn() || (!!online && (online.status !== 'playing' || g.turn !== myMark()));
      c.setAttribute('aria-disabled', String(blocked));
      c.setAttribute('aria-label', 'Row ' + (Math.floor(i / 3) + 1) + ' column ' + (i % 3 + 1) + ': ' + (v || 'empty'));
    });
    var st;
    if (online && online.status === 'finished' && online.result) st = GLMP.resultText();
    else if (online) st = (g.turn === myMark() ? 'Your turn' : names()[g.turn] + "'s turn") + ' (' + g.turn + ')';
    else if (g.winner === 'draw') st = "It's a draw.";
    else if (g.winner) st = n[g.winner] + (n[g.winner] === 'You' ? ' win!' : ' wins!');
    else st = (aiTurn() ? 'Computer is thinking…' : n[g.turn] + ' to move') + ' (' + g.turn + ')';
    $('status').textContent = st;
    $('status').style.color = g.winner && g.winner !== 'draw' ? (g.winner === 'X' ? 'var(--x)' : 'var(--o)') : '';
    $('nextBtn').hidden = online ? online.status !== 'finished' : !g.winner;
    $('nextBtn').textContent = online ? 'Back to the room' : 'Next round';
    $('oppOff').hidden = !online || online.status !== 'playing' || GLMP.opponentConnected();
  }
  function aiTurn() { return !online && opp === 'ai' && g && !g.winner && g.turn !== human; }

  // ---- online play: render the server's state; moves are requests the server validates
  function onlineMatch(room) {
    var firstUpdate = !online || online.matchNo !== room.matchNo;
    var wasFinished = online && online.matchNo === room.matchNo && online.status === 'finished';
    online = room; clearTimeout(aiTimer);
    var m = room.match, ol = { board: m.board, turn: m.turn, line: m.line, winner: null };
    if (room.status === 'finished') ol.winner = room.result && room.result.winnerSeat !== null ? m.marks[room.result.winnerSeat] : 'draw';
    g = ol;
    var sc = { X: 0, O: 0, D: room.scores[2] };
    room.players.forEach(function (p) { sc[m.marks[p.seat]] = room.scores[p.seat]; });
    scores = sc;
    mode = 'play'; $('app').hidden = false; screens.show(null); render();
    if (firstUpdate) K.announce('Online match started. You are ' + myMark() + '. ' + (m.turn === myMark() ? 'Your turn.' : "Opponent's turn."));
    if (room.status === 'finished' && !wasFinished) {
      K.sound.play(room.result.winnerSeat === room.you.seat ? 'win' : room.result.winnerSeat === null ? 'pop' : 'lose');
      K.announce(GLMP.resultText());
    }
  }
  function startOnline() {
    GLMP.open({ gameId: 'tic-tac-toe', title: 'Tic Tac Toe', howTo: 'The first move alternates every match. The server checks every move, so nobody can cheat.',
      onMatch: onlineMatch, onExit: function () { online = null; toTitle(); } });
  }
  $('onlineBtn').addEventListener('click', startOnline);
  if (window.GLMP) GLMP.wireButton($('onlineBtn'), 'tic-tac-toe', function () {
    if (GLMP.inviteCode()) startOnline(); // opened from an invite link
  });

  function newRound() {
    clearTimeout(aiTimer);
    first = round % 2 === 0 ? 'X' : 'O'; round++;
    g = T.createGame(first); mode = 'play';
    $('app').hidden = false; screens.show(null); render();
    K.announce('New round. ' + names()[g.turn] + ' moves first.');
    if (aiTurn()) scheduleAI(); else focusCell(focusIdx);
  }
  function startMatch() { scores = { X: 0, O: 0, D: 0 }; round = 0; newRound(); }
  function scheduleAI() { aiTimer = setTimeout(function () { if (!aiTurn() || mode !== 'play') return; apply(T.aiMove(g.board.slice(), g.turn, level)); }, 450); }

  function humanMove(i) {
    if (online) {
      if (mode !== 'play' || online.status !== 'playing' || g.turn !== myMark() || g.board[i]) return;
      GLMP.act({ type: 'move', cell: i }).then(function (r) { if (!r.ok) K.announce(r.message || 'Move not accepted.'); else K.sound.play('place'); });
      return;
    }
    if (mode !== 'play' || aiTurn() || g.winner) return; apply(i);
  }
  function apply(i) {
    var mover = g.turn, r = T.play(g, i);
    if (!r.ok) return;
    K.sound.play(mover === 'X' ? 'place' : 'blip');
    render();
    if (g.winner) {
      if (g.winner === 'draw') scores.D++; else scores[g.winner]++;
      render();
      K.sound.play(g.winner === 'draw' ? 'pop' : (opp === 'ai' && g.winner !== human ? 'lose' : 'win'));
      K.announce($('status').textContent + ' Score: X ' + scores.X + ', O ' + scores.O + ', draws ' + scores.D + '.');
      setTimeout(function () { try { $('nextBtn').focus(); } catch (e) { /* ignore */ } }, 50);
    } else {
      K.announce(mover + ' at row ' + (Math.floor(i / 3) + 1) + ' column ' + (i % 3 + 1) + '.');
      if (aiTurn()) scheduleAI();
    }
  }
  function focusCell(i) { cells.forEach(function (c, k) { c.tabIndex = k === i ? 0 : -1; }); try { cells[i].focus(); } catch (e) { /* ignore */ } }
  $('board').addEventListener('keydown', function (e) {
    var d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key];
    if (!d) return;
    e.preventDefault();
    var n = focusIdx + d;
    if (n < 0 || n > 8 || (Math.abs(d) === 1 && Math.floor(n / 3) !== Math.floor(focusIdx / 3))) return;
    focusIdx = n; focusCell(n);
  });

  function openMenu() {
    if (mode !== 'play') return; mode = 'menu'; clearTimeout(aiTimer);
    $('resetBtn').textContent = online ? 'Back to the game' : 'Reset scores';
    $('toTitleBtn').textContent = online ? 'Leave online game' : 'Change opponent';
    screens.show('menu');
  }
  function resume() { if (mode !== 'menu') return; mode = 'play'; screens.show(null); if (aiTurn()) scheduleAI(); }
  $('playBtn').addEventListener('click', function () { online = null; startMatch(); });
  $('nextBtn').addEventListener('click', function () { if (online) GLMP.showLobby(); else newRound(); });
  $('menuBtn').addEventListener('click', openMenu); $('resumeBtn').addEventListener('click', resume);
  $('resetBtn').addEventListener('click', function () { if (online) { mode = 'play'; screens.show(null); return; } scores = { X: 0, O: 0, D: 0 }; round = 0; mode = 'play'; newRound(); });
  function toTitle() { mode = 'title'; $('app').hidden = true; syncTitle(); screens.show('title'); }
  $('toTitleBtn').addEventListener('click', function () { if (online) { online = null; GLMP.exit(); return; } toTitle(); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (mode === 'play') openMenu(); else if (mode === 'menu') resume(); } });
  K.onRestart(function () { if (online) return; if (g) newRound(); else startMatch(); });
  K.muteButton();
  syncTitle(); screens.show('title');
  window.GLDebug = { state: function () { return g ? { mode: mode, board: g.board.slice(), turn: g.turn, winner: g.winner, scores: Object.assign({}, scores), opp: online ? 'online' : opp, human: online ? myMark() : human, room: online ? online.id : null, roomStatus: online ? online.status : null } : { mode: mode }; } };
  K.ready();
})();
