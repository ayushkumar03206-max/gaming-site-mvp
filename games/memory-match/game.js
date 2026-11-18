/* Memory Match: card-pair memory game, solo or 2 players on one device. DOM + inline SVG symbols. */
(function () {
  'use strict';
  var K = window.GLKit, M = window.MemoryLogic, $ = K.$;
  K.init('Memory Match');
  if (!M) { K.fail('Memory Match could not start.'); return; }

  // 15 original symbols, each with its own shape AND colour so colour alone is never needed.
  var SHAPES = [
    ['#e63956', 'circle', '<circle cx="50" cy="50" r="34"/>'],
    ['#1f7ae0', 'square', '<rect x="18" y="18" width="64" height="64" rx="8"/>'],
    ['#2e9e4f', 'triangle', '<path d="M50 14 88 84H12z"/>'],
    ['#e08a00', 'diamond', '<path d="M50 10 88 50 50 90 12 50z"/>'],
    ['#8b3fe0', 'star', '<path d="M50 8l11 27 29 2-22 19 7 29-25-16-25 16 7-29-22-19 29-2z"/>'],
    ['#0aa5a5', 'hexagon', '<path d="M50 10l35 20v40L50 90 15 70V30z"/>'],
    ['#d63384', 'heart', '<path d="M50 86S12 62 12 36a19 19 0 0 1 38-6 19 19 0 0 1 38 6c0 26-38 50-38 50z"/>'],
    ['#5a5fd6', 'moon', '<path d="M62 12a38 38 0 1 0 26 54A30 30 0 1 1 62 12z"/>'],
    ['#e0b000', 'bolt', '<path d="M58 8 22 56h24l-6 36 38-50H54z"/>'],
    ['#c2410c', 'ring', '<circle cx="50" cy="50" r="30" fill="none" stroke-width="14"/>'],
    ['#334155', 'cross', '<path d="M24 14 50 40 76 14 86 24 60 50 86 76 76 86 50 60 24 86 14 76 40 50 14 24z"/>'],
    ['#0284c7', 'drop', '<path d="M50 8C50 8 20 46 20 62a30 30 0 0 0 60 0C80 46 50 8 50 8z"/>'],
    ['#15803d', 'leaf', '<path d="M18 82C18 40 44 16 86 14c0 42-24 68-68 68zM18 82 60 40" stroke="#fff" stroke-width="4"/>'],
    ['#be123c', 'plus', '<path d="M40 12h20v28h28v20H60v28H40V60H12V40h28z"/>'],
    ['#7c3aed', 'wave', '<path d="M8 60c14-24 28-24 42 0s28 24 42 0v26H8z"/>']
  ];
  function symbol(pair) {
    var s = SHAPES[pair % SHAPES.length];
    return '<svg viewBox="0 0 100 100" aria-hidden="true" fill="' + s[0] + '" stroke="' + s[0] + '">' + s[2] + '</svg>';
  }

  var level = K.load('gl_memory_level', 'easy'), players = K.load('gl_memory_players', 1);
  var g = null, mode = 'title', t0 = 0, elapsed = 0, timer = null, focusIdx = 0, settleTimer = null;
  var bests = {}; Object.keys(M.LEVELS).forEach(function (k) { bests[k] = K.best('gl_memory_best_' + k); });
  var screens = K.screens(['title', 'menu', 'over']);

  function segSync() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-level]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-level') === level)); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-players]'), function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-players') === players)); });
    var b = bests[level].get();
    $('bestTitle').textContent = players === 1 && b ? 'Best on ' + level + ': ' + b : '';
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-level]'), function (b) { b.addEventListener('click', function () { level = b.getAttribute('data-level'); K.save('gl_memory_level', level); segSync(); }); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-players]'), function (b) { b.addEventListener('click', function () { players = +b.getAttribute('data-players'); K.save('gl_memory_players', players); segSync(); }); });

  function fmt(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function tick() { if (mode === 'play' && t0) { elapsed = (performance.now() - t0) / 1000; $('hTime').textContent = fmt(elapsed); } }

  function layout() {
    if (!g) return;
    var board = $('board'), r = board.getBoundingClientRect();
    var cw = (r.width - (g.cols - 1) * 8) / g.cols, ch = (r.height - (g.rows - 1) * 8) / g.rows;
    var w = Math.max(30, Math.min(cw, ch * 0.75, 140));
    board.style.gridTemplateColumns = 'repeat(' + g.cols + ', ' + w + 'px)';
  }

  function deal() {
    clearTimeout(settleTimer);
    g = M.createGame(level, { players: players });
    mode = 'play'; t0 = 0; elapsed = 0; focusIdx = 0;
    $('app').hidden = false; screens.show(null);
    $('pTime').hidden = players === 2; $('pP1').hidden = $('pP2').hidden = players !== 2; $('turn').hidden = players !== 2;
    var board = $('board'); board.innerHTML = '';
    g.cards.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'card'; b.setAttribute('data-i', i); b.tabIndex = i === 0 ? 0 : -1;
      b.innerHTML = '<span class="in"><span class="face back"></span><span class="face front">' + symbol(c.pair) + '</span></span>';
      b.addEventListener('click', function () { focusIdx = i; tap(i); });
      board.appendChild(b);
    });
    layout(); render();
    K.announce((players === 2 ? 'Two players. Player 1 starts. ' : '') + g.pairs + ' pairs dealt.');
  }

  function render() {
    var nodes = $('board').children;
    g.cards.forEach(function (c, i) {
      var n = nodes[i];
      n.classList.toggle('up', c.state === 'up'); n.classList.toggle('matched', c.state === 'matched');
      n.setAttribute('aria-label', c.state === 'down' ? 'Card ' + (i + 1) + ', face down' : 'Card ' + (i + 1) + ', ' + SHAPES[c.pair % SHAPES.length][1] + (c.state === 'matched' ? ', matched' : ''));
      n.setAttribute('aria-disabled', String(c.state !== 'down'));
    });
    $('hMoves').textContent = g.moves; $('hP1').textContent = g.scores[0]; $('hP2').textContent = g.scores[1];
    $('pP1').classList.toggle('on', players === 2 && g.turn === 0); $('pP2').classList.toggle('on', players === 2 && g.turn === 1);
    $('turn').textContent = 'Player ' + (g.turn + 1) + "'s turn"; $('turn').style.color = g.turn ? 'var(--p2)' : 'var(--p1)';
  }

  function tap(i) {
    if (mode !== 'play') return;
    if (!t0) t0 = performance.now();
    var r = M.flip(g, i);
    if (!r.ok) return;
    K.sound.play('blip');
    render();
    if (r.result === 'match') {
      K.sound.play('coin'); K.announce('Match! ' + SHAPES[r.pair % SHAPES.length][1] + (players === 2 ? '. Player ' + (g.turn + 1) + ' goes again.' : ''));
      if (r.over) setTimeout(finish, 450);
    } else if (r.result === 'miss') {
      K.announce('No match.');
      settleTimer = setTimeout(function () { M.settle(g); render(); if (players === 2) K.announce('Player ' + (g.turn + 1) + "'s turn"); }, K.reduceMotion ? 700 : 900);
    }
  }

  function finish() {
    mode = 'over'; tick();
    $('oMoves').textContent = g.moves; $('oTime').textContent = fmt(elapsed); $('oStreak').textContent = g.streak;
    if (players === 2) {
      var w = M.winner(g);
      $('overTitle').textContent = w === 'draw' ? "It's a draw!" : 'Player ' + (w + 1) + ' wins!';
      $('finalScore').textContent = g.scores[0] + ' – ' + g.scores[1]; $('finalUnit').textContent = 'pairs';
      $('stars').textContent = ''; $('bestOver').textContent = ''; $('oTime').parentNode.hidden = true;
    } else {
      var sc = M.score(g, elapsed), st = M.stars(g), isBest = bests[level].submit(sc);
      $('overTitle').textContent = isBest ? 'New best!' : 'All pairs found!';
      $('finalScore').textContent = sc; $('finalUnit').textContent = 'points';
      $('stars').textContent = '★★★'.slice(0, st) + '☆☆☆'.slice(0, 3 - st); $('stars').setAttribute('aria-label', st + ' of 3 stars');
      $('bestOver').textContent = 'Best on ' + level + ': ' + bests[level].get(); $('oTime').parentNode.hidden = false;
    }
    K.sound.play('win'); K.announce($('overTitle').textContent);
    screens.show('over'); segSync();
  }

  function openMenu() { if (mode !== 'play') return; mode = 'menu'; screens.show('menu'); }
  function resume() { if (mode !== 'menu') return; mode = 'play'; screens.show(null); }
  function toTitle() { mode = 'title'; $('app').hidden = true; segSync(); screens.show('title'); }
  $('playBtn').addEventListener('click', deal); $('againBtn').addEventListener('click', deal); $('redealBtn').addEventListener('click', deal);
  $('menuBtn').addEventListener('click', openMenu); $('resumeBtn').addEventListener('click', resume);
  $('toTitleBtn').addEventListener('click', toTitle); $('toTitleBtn2').addEventListener('click', toTitle);
  K.onRestart(deal); K.muteButton();

  // keyboard: roving focus across the grid
  $('board').addEventListener('keydown', function (e) {
    if (!g) return;
    var d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -g.cols, ArrowDown: g.cols }[e.key];
    if (d) {
      e.preventDefault();
      var n = focusIdx + d; if (n < 0 || n >= g.cards.length) return;
      var nodes = $('board').children; nodes[focusIdx].tabIndex = -1; focusIdx = n; nodes[n].tabIndex = 0; nodes[n].focus();
    }
  });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (mode === 'play') openMenu(); else if (mode === 'menu') resume(); } });
  window.addEventListener('resize', layout);
  timer = setInterval(tick, 250);
  segSync(); screens.show('title');
  window.GLDebug = {
    state: function () { return g ? { mode: mode, moves: g.moves, matched: g.matched, pairs: g.pairs, turn: g.turn, scores: g.scores.slice(), over: g.over } : { mode: mode }; },
    pairsOf: function () { return g ? g.cards.map(function (c) { return c.pair; }) : []; } // QA helper: lets tests play a full board
  };
  K.ready();
})();
