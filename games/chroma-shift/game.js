/* Chroma Shift UI. Rules + levels live in chroma-core.js. */
(function () {
  'use strict';
  var C = window.ChromaCore;
  var STORE = 'gl_chroma_shift_v1';
  var SYMBOLS = ['●', '▲', '■', '◆', '★'];
  var NAMES = ['cyan', 'pink', 'yellow', 'lime', 'violet'];
  var $ = function (id) { return document.getElementById(id); };
  function post(m) { try { if (window.parent !== window) window.parent.postMessage(m, '*'); } catch (e) { /* ignore */ } }
  window.addEventListener('error', function (ev) { post({ type: 'gl:error', message: 'Chroma Shift error: ' + ev.message }); });
  if (!C) { post({ type: 'gl:error', message: 'Game files are missing.' }); return; }

  // ---------------- progress ----------------
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; } }
  var prog = load() || { unlocked: 1, levels: {} };
  function save() { try { localStorage.setItem(STORE, JSON.stringify(prog)); } catch (e) { /* ignore */ } }
  function totalScore() { var s = 0, st = 0; Object.keys(prog.levels).forEach(function (k) { s += prog.levels[k].score; st += prog.levels[k].stars; }); return { score: s, stars: st }; }

  // ---------------- state ----------------
  var level = 1, lv, grid, moves, taps, usedHint, over, focusIdx = 0, tiles = [];

  function home() {
    $('result').hidden = true; $('play').hidden = true; $('home').hidden = false;
    var t = totalScore();
    $('total').textContent = t.stars ? '★ ' + t.stars + ' / ' + C.MAX_LEVEL * 3 + ' · Score ' + t.score : '';
    $('continueBtn').textContent = prog.unlocked > 1 ? 'Continue: level ' + Math.min(prog.unlocked, C.MAX_LEVEL) : 'Play';
    var box = $('levels'); box.innerHTML = '';
    for (var i = 1; i <= C.MAX_LEVEL; i++) {
      var b = document.createElement('button'), rec = prog.levels[i];
      b.type = 'button'; b.className = 'lv' + (i === Math.min(prog.unlocked, C.MAX_LEVEL) ? ' cur' : '');
      b.disabled = i > prog.unlocked;
      b.innerHTML = i + '<small>' + (rec ? '★★★'.slice(0, rec.stars) : '') + '</small>';
      b.setAttribute('aria-label', 'Level ' + i + (b.disabled ? ', locked' : rec ? ', ' + rec.stars + ' stars' : ''));
      b.dataset.level = i;
      box.appendChild(b);
    }
  }
  $('levels').addEventListener('click', function (e) { var b = e.target.closest('.lv'); if (b && !b.disabled) startLevel(+b.dataset.level); });
  $('continueBtn').addEventListener('click', function () { startLevel(Math.min(prog.unlocked, C.MAX_LEVEL)); });
  $('resetProgress').addEventListener('click', function () {
    if (window.confirm('Reset all Chroma Shift progress on this device? This cannot be undone.')) { prog = { unlocked: 1, levels: {} }; save(); home(); }
  });

  function startLevel(n) {
    level = n; lv = C.generate(n); grid = lv.grid.slice(); moves = 0; usedHint = false; over = false;
    taps = new Array(grid.length).fill(0);
    focusIdx = Math.floor(grid.length / 2);
    $('home').hidden = true; $('result').hidden = true; $('play').hidden = false;
    $('lvl').textContent = 'Level ' + n;
    var w = $('wheel'); w.innerHTML = '';
    for (var c = 0; c < lv.params.colors; c++) {
      var s = document.createElement('span'); s.className = 'sw c' + c; s.textContent = SYMBOLS[c]; s.title = NAMES[c];
      w.appendChild(s);
      if (c < lv.params.colors - 1) { var a = document.createElement('span'); a.textContent = '→'; w.appendChild(a); }
    }
    var loop = document.createElement('span'); loop.textContent = '↺'; loop.title = 'then back to the first color'; w.appendChild(loop);
    w.setAttribute('aria-label', 'Color order: ' + NAMES.slice(0, lv.params.colors).join(', then ') + ', then back to ' + NAMES[0]);
    buildBoard(); resize(); render();
    msg(n === 1 ? 'Tap a tile. It and its neighbors shift to the next color.' : '');
  }

  function buildBoard() {
    var b = $('board'); b.innerHTML = ''; tiles = [];
    b.style.setProperty('--n', lv.params.size);
    for (var i = 0; i < grid.length; i++) {
      var t = document.createElement('button');
      t.type = 'button'; t.className = 'tile'; t.dataset.i = i; t.setAttribute('role', 'gridcell'); t.tabIndex = -1;
      b.appendChild(t); tiles.push(t);
    }
  }

  function render(popped) {
    var n = lv.params.size;
    tiles.forEach(function (t, i) {
      t.className = 'tile c' + grid[i] + (popped && popped.indexOf(i) >= 0 ? ' pop' : '') + (i === focusIdx && kbActive ? ' focus' : '');
      t.textContent = SYMBOLS[grid[i]];
      t.setAttribute('aria-label', 'Row ' + (Math.floor(i / n) + 1) + ', column ' + (i % n + 1) + ', ' + NAMES[grid[i]]);
    });
    var left = lv.params.limit - moves, el = $('moves');
    el.textContent = moves + ' / ' + lv.params.limit + ' moves';
    el.className = left <= 1 ? 'low' : '';
  }
  function msg(t) { $('msg').textContent = t; }

  function tap(i) {
    if (over) return;
    grid = C.shift(grid, lv.params.size, lv.params.colors, i, +1);
    taps[i] = (taps[i] + 1) % lv.params.colors;
    moves++;
    render(C.neighbours(lv.params.size, i));
    if (C.isSolved(grid)) return win();
    if (moves >= lv.params.limit) return lose();
    msg('');
  }

  function win() {
    over = true;
    var st = C.stars(moves, lv.params, usedHint), sc = C.levelScore(moves, lv.params, usedHint);
    var prev = prog.levels[level];
    if (!prev || sc > prev.score) prog.levels[level] = { stars: Math.max(st, prev ? prev.stars : 0), score: sc };
    if (level >= prog.unlocked) prog.unlocked = Math.min(C.MAX_LEVEL + 1, level + 1);
    save();
    var last = level >= C.MAX_LEVEL;
    showResult(last ? 'All levels cleared!' : 'Level clear!', st,
      'Solved in ' + moves + ' move' + (moves === 1 ? '' : 's') + ' · +' + sc + ' points' + (usedHint ? ' · hint used' : ''),
      last ? 'Back to levels' : 'Next level', function () { if (last) home(); else startLevel(level + 1); },
      'Replay', function () { startLevel(level); });
  }
  function lose() {
    over = true;
    showResult('Out of moves', 0, 'Every level can be solved in ' + lv.params.k + ' moves or fewer. Try again?',
      'Retry', function () { startLevel(level); }, 'Levels', home);
  }
  var resA, resB;
  function showResult(title, st, text, a, fa, b, fb) {
    $('resTitle').textContent = title;
    var s = $('resStars');
    s.innerHTML = st ? '★★★'.slice(0, st) + '<span class="off">' + '★★★'.slice(st) + '</span>' : '';
    $('resText').textContent = text;
    $('resPrimary').textContent = a; $('resSecondary').textContent = b;
    resA = fa; resB = fb;
    setTimeout(function () { $('result').hidden = false; $('resPrimary').focus(); }, 350);
  }
  $('resPrimary').addEventListener('click', function () { resA && resA(); });
  $('resSecondary').addEventListener('click', function () { resB && resB(); });

  // ---------------- input ----------------
  var kbActive = false;
  $('board').addEventListener('click', function (e) { var t = e.target.closest('.tile'); if (t) { kbActive = false; focusIdx = +t.dataset.i; tap(+t.dataset.i); } });
  $('backBtn').addEventListener('click', home);
  $('restartBtn').addEventListener('click', function () { startLevel(level); });
  $('hintBtn').addEventListener('click', function () {
    if (over) return;
    var h = C.hint(level, taps);
    if (h < 0) { msg('No hint available. Try restarting the level.'); return; }
    usedHint = true;
    tiles.forEach(function (t) { t.classList.remove('hint'); });
    tiles[h].classList.add('hint');
    msg('Try the glowing tile. (Hints cap this level at 2 stars.)');
  });
  document.addEventListener('keydown', function (e) {
    if ($('play').hidden || !$('result').hidden) return;
    var n = lv.params.size, r = Math.floor(focusIdx / n), c = focusIdx % n, moved = true;
    if (e.code === 'ArrowUp') r = Math.max(0, r - 1);
    else if (e.code === 'ArrowDown') r = Math.min(n - 1, r + 1);
    else if (e.code === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (e.code === 'ArrowRight') c = Math.min(n - 1, c + 1);
    else moved = false;
    if (moved) { e.preventDefault(); kbActive = true; focusIdx = r * n + c; render(); return; }
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); kbActive = true; tap(focusIdx); }
    else if (e.code === 'KeyR') startLevel(level);
    else if (e.code === 'Escape') home();
  });
  window.addEventListener('message', function (ev) { if (ev.data && ev.data.type === 'gl:restart') { if (!$('play').hidden || !$('result').hidden) startLevel(level); } });

  function resize() {
    var bw = Math.max(220, Math.min(window.innerWidth - 24, window.innerHeight - 200, 520));
    document.documentElement.style.setProperty('--bw', bw + 'px');
  }
  window.addEventListener('resize', resize);
  resize(); home();
  post({ type: 'gl:ready' });
})();
