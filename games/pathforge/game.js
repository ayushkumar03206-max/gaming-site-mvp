/* Pathforge UI. Rules live in pathforge-core.js. */
(function () {
  'use strict';
  var Core = window.PathforgeCore;
  var STORE = 'gl_pathforge_v1';
  var $ = function (id) { return document.getElementById(id); };

  function post(msg) { try { if (window.parent !== window) window.parent.postMessage(msg, '*'); } catch (e) { /* ignore */ } }
  window.addEventListener('error', function (ev) { post({ type: 'gl:error', message: 'Pathforge error: ' + ev.message }); });
  if (!Core) { post({ type: 'gl:error', message: 'Game files are missing.' }); return; }

  // ---------------- persistence ----------------
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null') || {}; } catch (e) { return {}; }
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(data)); } catch (e) { /* ignore */ } }
  var data = load();
  data.settings = data.settings || { opp: 'normal', size: 7 };
  data.record = data.record || {};

  // ---------------- state ----------------
  var state = null, history = [], forge = false, hint = false, cursor = -1, busy = false, aiTimer = null;
  var cells = [];
  var board = $('board');

  function vsAI() { return data.settings.opp !== 'human'; }
  function humanTurn() { return state && state.winner === null && (!vsAI() || state.turn === 0); }

  // ---------------- menu ----------------
  function syncMenu() {
    document.querySelectorAll('[data-opp]').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.opp === data.settings.opp)); });
    document.querySelectorAll('[data-size]').forEach(function (b) { b.setAttribute('aria-checked', String(+b.dataset.size === data.settings.size)); });
    var r = data.record, parts = [];
    ['easy', 'normal', 'hard'].forEach(function (k) { if (r[k]) parts.push(k[0].toUpperCase() + k.slice(1) + ': ' + r[k].w + 'W / ' + r[k].l + 'L'); });
    $('record').textContent = parts.length ? 'Your record vs AI · ' + parts.join(' · ') : '';
  }
  document.querySelectorAll('[data-opp]').forEach(function (b) { b.addEventListener('click', function () { data.settings.opp = b.dataset.opp; save(); syncMenu(); }); });
  document.querySelectorAll('[data-size]').forEach(function (b) { b.addEventListener('click', function () { data.settings.size = +b.dataset.size; save(); syncMenu(); }); });

  function showMenu() {
    clearTimeout(aiTimer); busy = false;
    $('result').hidden = true; $('game').hidden = true; $('menu').hidden = false;
    syncMenu(); $('start').focus();
  }

  // ---------------- game ----------------
  function newGame() {
    clearTimeout(aiTimer);
    state = Core.createState({ size: data.settings.size });
    history = []; forge = false; hint = false; cursor = -1; busy = false;
    $('menu').hidden = true; $('result').hidden = true; $('game').hidden = false;
    $('hud0').querySelector('.who').textContent = vsAI() ? 'You' : 'Cyan';
    $('hud1').querySelector('.who').textContent = vsAI() ? 'AI · ' + data.settings.opp : 'Magenta';
    buildBoard(); resize(); render();
    say(vsAI() ? 'Your move. Reach the top row.' : 'Cyan starts. Reach the top row.');
  }

  function buildBoard() {
    board.innerHTML = ''; cells = [];
    board.style.setProperty('--n', state.size);
    for (var i = 0; i < state.size * state.size; i++) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'cell'; b.dataset.i = i; b.setAttribute('role', 'gridcell');
      b.tabIndex = -1;
      board.appendChild(b); cells.push(b);
    }
  }

  function render() {
    var s = state, n = s.size;
    var targets = humanTurn() && !forge && !busy ? Core.moveTargets(s) : [];
    var blockable = humanTurn() && forge ? Core.blockTargets(s) : [];
    var path = hint && humanTurn() ? Core.bfs(s, s.turn).path : [];
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i], r = Math.floor(i / n), col = i % n, cls = 'cell';
      if (r === s.goals[0]) cls += ' goal0';
      if (r === s.goals[1]) cls += ' goal1';
      if (s.blocks[i]) cls += ' block';
      else if (s.sparks[i]) cls += ' spark';
      if (targets.indexOf(i) >= 0) cls += ' target';
      if (blockable.indexOf(i) >= 0) cls += ' can-block';
      if (path.indexOf(i) >= 0 && !s.blocks[i]) cls += ' path';
      if (forge && i === cursor) cls += ' cursor';
      if (s.last && s.last.cell === i && s.last.type === 'block') cls += ' lastmove';
      c.className = cls;
      var label = 'Row ' + (r + 1) + ', column ' + (col + 1) + (s.blocks[i] ? ', block' : s.sparks[i] ? ', spark' : '');
      c.innerHTML = '';
      for (var pp = 0; pp < 2; pp++) {
        if (s.pawns[pp] === i) {
          var d = document.createElement('span');
          d.className = 'pawn p' + pp + (s.turn === pp && s.winner === null ? ' active' : '');
          c.appendChild(d);
          label += pp === 0 ? ', cyan runner' : ', magenta runner';
        }
      }
      c.setAttribute('aria-label', label);
    }
    board.classList.toggle('forge', forge);
    $('hud0').classList.toggle('active', s.turn === 0 && s.winner === null);
    $('hud1').classList.toggle('active', s.turn === 1 && s.winner === null);
    $('hud0').querySelector('.stock').textContent = '◆ ' + s.stock[0];
    $('hud1').querySelector('.stock').textContent = '◆ ' + s.stock[1];
    $('turn').textContent = s.winner !== null ? 'Game over' : (vsAI() ? (s.turn === 0 ? 'Your turn' : 'AI thinking…') : (s.turn === 0 ? 'Cyan to play' : 'Magenta to play'));
    var canForge = humanTurn() && s.stock[s.turn] > 0;
    $('mode').disabled = !canForge && !forge;
    $('mode').setAttribute('aria-pressed', String(forge));
    $('mode').querySelector('.lbl').textContent = forge ? 'Cancel' : 'Forge';
    $('hint').setAttribute('aria-pressed', String(hint));
    $('undo').disabled = !history.length || busy;
  }

  function say(t) { $('msg').textContent = t; }

  function act(a) {
    if (!Core.isLegal(state, a)) return false;
    var before = state;
    history.push(state);
    state = Core.apply(state, a);
    if (a.type === 'move' && before.sparks[a.to]) say((before.turn === 0 ? 'Cyan' : 'Magenta') + ' grabbed a spark: +1 block!');
    forge = false; cursor = -1;
    render();
    if (state.winner !== null) { finish(); return true; }
    var acts = Core.legalActions(state);
    if (acts.length === 1 && acts[0].type === 'pass') { say('No legal action. Turn passes.'); state = Core.apply(state, acts[0]); render(); }
    if (vsAI() && state.turn === 1 && state.winner === null) aiTurn();
    else if (!vsAI() && !(a.type === 'move' && before.sparks[a.to])) say((state.turn === 0 ? 'Cyan' : 'Magenta') + ' to play.');
    return true;
  }

  function aiTurn() {
    busy = true; render();
    aiTimer = setTimeout(function () {
      var a = Core.chooseAction(state, data.settings.opp);
      busy = false;
      act(a);
      if (state.winner === null) say(a.type === 'block' ? 'AI forged a block. Your move.' : 'Your move.');
    }, 420);
  }

  function finish() {
    var w = state.winner, title = $('result-title'), text = $('result-text');
    title.className = '';
    if (w === 'draw') { title.textContent = 'Draw'; text.textContent = 'The turn limit was reached.'; }
    else if (vsAI()) {
      var k = data.settings.opp, rec = data.record[k] = data.record[k] || { w: 0, l: 0 };
      if (w === 0) { rec.w++; title.textContent = 'You win!'; title.className = 'win'; text.textContent = 'You beat the ' + k + ' AI. Record: ' + rec.w + 'W / ' + rec.l + 'L.'; }
      else { rec.l++; title.textContent = 'AI wins'; title.className = 'lose'; text.textContent = 'Tip: save blocks for when the AI is close to its goal. Record: ' + rec.w + 'W / ' + rec.l + 'L.'; }
      save();
    } else {
      title.textContent = (w === 0 ? 'Cyan' : 'Magenta') + ' wins!'; title.className = w === 0 ? 'win' : 'lose';
      text.textContent = 'Swap seats and go again?';
    }
    setTimeout(function () { $('result').hidden = false; $('again').focus(); }, 500);
  }

  function undo() {
    if (!history.length || busy) return;
    clearTimeout(aiTimer);
    state = history.pop();
    while (vsAI() && state.turn !== 0 && history.length) state = history.pop();
    forge = false; cursor = -1; render(); say('Move undone.');
  }

  function toggleForge(on) {
    if (!humanTurn() || busy) return;
    if (on === undefined) on = !forge;
    if (on && state.stock[state.turn] <= 0) { say('No blocks left. Collect a ✦ spark to earn one.'); return; }
    forge = on;
    cursor = forge ? state.pawns[1 - state.turn] : -1;
    say(forge ? 'Forge mode: pick an empty cell. Cells that would seal a route are not allowed.' : '');
    render();
  }

  // ---------------- input ----------------
  board.addEventListener('click', function (ev) {
    var c = ev.target.closest('.cell'); if (!c || !humanTurn() || busy) return;
    var i = +c.dataset.i;
    if (forge) {
      if (!act({ type: 'block', at: i })) say(state.blocks[i] || state.sparks[i] || state.pawns.indexOf(i) >= 0 ? 'That cell is not empty.' : 'Not allowed: that would seal off a route to a goal.');
    } else if (!act({ type: 'move', to: i })) {
      say('Move to a highlighted cell, or tap Forge to place a block.');
    }
  });
  $('mode').addEventListener('click', function () { toggleForge(); });
  $('hint').addEventListener('click', function () { hint = !hint; render(); });
  $('undo').addEventListener('click', undo);
  $('tomenu').addEventListener('click', showMenu);
  $('start').addEventListener('click', newGame);
  $('again').addEventListener('click', newGame);
  $('result-menu').addEventListener('click', showMenu);

  var KEYDIR = { ArrowUp: [-1, 0], KeyW: [-1, 0], ArrowDown: [1, 0], KeyS: [1, 0], ArrowLeft: [0, -1], KeyA: [0, -1], ArrowRight: [0, 1], KeyD: [0, 1] };
  document.addEventListener('keydown', function (ev) {
    if ($('game').hidden || !$('result').hidden) return;
    var d = KEYDIR[ev.code];
    if (d) {
      ev.preventDefault();
      if (!humanTurn() || busy) return;
      var n = state.size;
      if (forge) {
        var r = Math.floor(cursor / n) + d[0], c = cursor % n + d[1];
        if (r >= 0 && c >= 0 && r < n && c < n) { cursor = r * n + c; render(); }
        return;
      }
      var me = state.pawns[state.turn], r0 = Math.floor(me / n) + d[0], c0 = me % n + d[1];
      if (r0 < 0 || c0 < 0 || r0 >= n || c0 >= n) return;
      var to = r0 * n + c0;
      if (to === state.pawns[1 - state.turn]) {
        var r2 = r0 + d[0], c2 = c0 + d[1];
        if (r2 < 0 || c2 < 0 || r2 >= n || c2 >= n) return;
        to = r2 * n + c2;
      }
      if (!act({ type: 'move', to: to })) say("Can't move there.");
      return;
    }
    if (ev.code === 'KeyF' || ev.code === 'KeyB') toggleForge();
    else if (ev.code === 'Escape' && forge) toggleForge(false);
    else if ((ev.code === 'Enter' || ev.code === 'Space') && forge && humanTurn()) { ev.preventDefault(); if (!act({ type: 'block', at: cursor })) say("Can't forge there."); }
    else if (ev.code === 'KeyH') { hint = !hint; render(); }
    else if (ev.code === 'KeyU') undo();
    else if (ev.code === 'KeyR') newGame();
  });

  window.addEventListener('message', function (ev) { if (ev.data && ev.data.type === 'gl:restart') { if (state && $('menu').hidden) newGame(); else showMenu(); } });

  function resize() {
    var w = window.innerWidth - 20, h = window.innerHeight - 150;
    var bw = Math.max(220, Math.min(w, h, 640));
    document.documentElement.style.setProperty('--bw', bw + 'px');
  }
  window.addEventListener('resize', resize);

  resize(); showMenu();
  post({ type: 'gl:ready' });
})();
