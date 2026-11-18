/* Tic Tac Toe: vs computer (3 levels) or 2 players on one device. DOM board. */
(function () {
  'use strict';
  var K = window.GLKit, T = window.TTTLogic, $ = K.$;
  K.init('Tic Tac Toe');
  if (!T) { K.fail('Tic Tac Toe could not start.'); return; }

  var opp = K.load('gl_ttt_opp', 'ai'), level = K.load('gl_ttt_level', 'medium'), human = K.load('gl_ttt_mark', 'X');
  var g = null, mode = 'title', first = 'X', round = 0, aiTimer = null, focusIdx = 4;
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

  function names() {
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
      var blocked = !!v || !!g.winner || aiTurn();
      c.setAttribute('aria-disabled', String(blocked));
      c.setAttribute('aria-label', 'Row ' + (Math.floor(i / 3) + 1) + ' column ' + (i % 3 + 1) + ': ' + (v || 'empty'));
    });
    var st;
    if (g.winner === 'draw') st = "It's a draw.";
    else if (g.winner) st = n[g.winner] + (n[g.winner] === 'You' ? ' win!' : ' wins!');
    else st = (aiTurn() ? 'Computer is thinking…' : n[g.turn] + ' to move') + ' (' + g.turn + ')';
    $('status').textContent = st;
    $('status').style.color = g.winner && g.winner !== 'draw' ? (g.winner === 'X' ? 'var(--x)' : 'var(--o)') : '';
    $('nextBtn').hidden = !g.winner;
  }
  function aiTurn() { return opp === 'ai' && g && !g.winner && g.turn !== human; }

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

  function humanMove(i) { if (mode !== 'play' || aiTurn() || g.winner) return; apply(i); }
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

  function openMenu() { if (mode !== 'play') return; mode = 'menu'; clearTimeout(aiTimer); screens.show('menu'); }
  function resume() { if (mode !== 'menu') return; mode = 'play'; screens.show(null); if (aiTurn()) scheduleAI(); }
  $('playBtn').addEventListener('click', startMatch);
  $('nextBtn').addEventListener('click', newRound);
  $('menuBtn').addEventListener('click', openMenu); $('resumeBtn').addEventListener('click', resume);
  $('resetBtn').addEventListener('click', function () { scores = { X: 0, O: 0, D: 0 }; round = 0; mode = 'play'; newRound(); });
  $('toTitleBtn').addEventListener('click', function () { mode = 'title'; $('app').hidden = true; syncTitle(); screens.show('title'); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (mode === 'play') openMenu(); else if (mode === 'menu') resume(); } });
  K.onRestart(function () { if (g) newRound(); else startMatch(); });
  K.muteButton();
  syncTitle(); screens.show('title');
  window.GLDebug = { state: function () { return g ? { mode: mode, board: g.board.slice(), turn: g.turn, winner: g.winner, scores: Object.assign({}, scores), opp: opp, human: human } : { mode: mode }; } };
  K.ready();
})();
