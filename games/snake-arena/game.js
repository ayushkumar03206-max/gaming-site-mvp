/* Snake Arena: classic grid snake with speed-up, bonus food and walls. Canvas 2D. */
(function () {
  'use strict';
  var K = window.GLKit, S = window.SnakeLogic, $ = K.$;
  K.init('Snake Arena');
  var canvas = $('c'), ctx = canvas.getContext('2d');
  if (!ctx || !S) { K.fail('Your browser could not start the game canvas.'); return; }

  var view = { W: 1, H: 1 }, cell = 10, ox = 0, oy = 0;
  var speed = K.load('gl_snake_speed', 'classic'), mode = 'title', g = null, acc = 0, prevBody = null, deadFlash = 0;
  var bests = {}; Object.keys(S.SPEEDS).forEach(function (k) { bests[k] = K.best('gl_snake_best_' + k); });
  var screens = K.screens(['title', 'paused', 'over']);

  function resize() {
    view = K.fitCanvas(canvas, ctx);
    var pad = document.getElementById('pad'), padH = 0;
    if (K.isTouch && pad) { var wasHidden = pad.hidden; pad.hidden = false; padH = pad.getBoundingClientRect().height + 20; pad.hidden = wasHidden; }
    var top = 56, bottom = K.isTouch ? Math.max(padH, 72) : 12;
    var avail = Math.min(view.W - 16, view.H - top - bottom);
    cell = Math.max(5, Math.floor(avail / 20));
    ox = Math.floor((view.W - cell * 20) / 2); oy = top + Math.max(0, Math.floor((view.H - top - bottom - cell * 20) / 2));
  }
  function syncTitle() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-speed]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-speed') === speed)); });
    var b = bests[speed].get(); $('bestTitle').textContent = b ? 'Best on ' + speed + ': ' + b : '';
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-speed]'), function (b) { b.addEventListener('click', function () { speed = b.getAttribute('data-speed'); K.save('gl_snake_speed', speed); syncTitle(); }); });

  function start() {
    g = S.createGame({ speed: speed }); acc = -1.2; prevBody = null; deadFlash = 0; // short "get ready" pause
    mode = 'play'; screens.show(null); $('hud').hidden = false; $('pad').hidden = false; hud();
    last = performance.now(); try { canvas.focus(); } catch (e) { /* ignore */ }
    K.announce('Go! Moving right.');
  }
  function pause() { if (mode !== 'play') return; mode = 'paused'; screens.show('paused'); }
  function resume() { if (mode !== 'paused') return; mode = 'play'; screens.show(null); last = performance.now(); }
  function toTitle() { mode = 'title'; $('hud').hidden = true; $('pad').hidden = true; syncTitle(); screens.show('title'); }
  function finish(won) {
    mode = 'over'; deadFlash = won ? 0 : 0.5;
    var isBest = bests[speed].submit(g.score);
    $('finalScore').textContent = g.score; $('oLen').textContent = g.body.length; $('oFood').textContent = g.eaten;
    $('overTitle').textContent = won ? 'You filled the arena!' : isBest && g.score > 0 ? 'New best!' : 'Game over';
    $('bestOver').textContent = 'Best on ' + speed + ': ' + bests[speed].get();
    K.sound.play(won ? 'win' : 'lose'); K.announce($('overTitle').textContent + ' Score ' + g.score + '.');
    $('pad').hidden = true;
    setTimeout(function () { if (mode === 'over') screens.show('over'); }, 600);
  }
  function hud() { $('hScore').textContent = g.score; $('hLen').textContent = g.body.length; $('hSpeed').textContent = S.tickRate(g); }

  $('playBtn').addEventListener('click', start); $('againBtn').addEventListener('click', start); $('restartBtn').addEventListener('click', start);
  $('resumeBtn').addEventListener('click', resume); $('pauseBtn').addEventListener('click', pause);
  $('menuBtn').addEventListener('click', toTitle); $('menuBtn2').addEventListener('click', toTitle);
  K.onRestart(start); K.autoPause(pause); K.muteButton();

  var KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  window.addEventListener('keydown', function (e) {
    if (KEYS[e.code]) { e.preventDefault(); if (mode === 'play') S.turn(g, KEYS[e.code]); }
    if (e.code === 'KeyP' || e.code === 'Escape' || (e.code === 'Space' && mode !== 'title')) { e.preventDefault(); if (mode === 'play') pause(); else if (mode === 'paused') resume(); }
    if ((e.code === 'Enter' || e.code === 'KeyR') && mode === 'over') start();
  });
  K.swipe(canvas, function (d) { if (mode === 'play') S.turn(g, d); }, 18);
  Array.prototype.forEach.call(document.querySelectorAll('[data-dir]'), function (b) {
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); if (mode === 'play') S.turn(g, b.getAttribute('data-dir')); });
  });

  function update(dt) {
    acc += dt;
    var step = 1 / S.tickRate(g);
    while (acc >= step && mode === 'play') {
      acc -= step; prevBody = g.body.map(function (c) { return { x: c.x, y: c.y }; });
      var ev = S.tick(g);
      for (var i = 0; i < ev.length; i++) {
        if (ev[i].type === 'eat') K.sound.play('coin');
        else if (ev[i].type === 'bonus') { K.sound.play('power'); K.announce('Bonus! Plus 50.'); }
        else if (ev[i].type === 'crash') { K.sound.play('hit'); finish(false); }
        else if (ev[i].type === 'win') finish(true);
      }
      hud();
    }
  }

  function draw() {
    ctx.fillStyle = '#081210'; ctx.fillRect(0, 0, view.W, view.H);
    var size = cell * 20;
    ctx.fillStyle = '#0d1f1a'; ctx.fillRect(ox, oy, size, size);
    ctx.fillStyle = 'rgba(255,255,255,.025)';
    for (var y = 0; y < 20; y++) for (var x = (y % 2); x < 20; x += 2) ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    ctx.strokeStyle = deadFlash > 0 ? '#ff4d6d' : '#2f6b5a'; ctx.lineWidth = 3; ctx.strokeRect(ox - 1.5, oy - 1.5, size + 3, size + 3);
    if (!g) return;
    // interpolate head position for smooth motion between ticks
    var tFrac = mode === 'play' ? Math.max(0, Math.min(1, acc * S.tickRate(g))) : 1;
    if (mode === 'play' && acc < 0) {
      ctx.fillStyle = 'rgba(238,240,255,.85)'; ctx.font = '800 ' + Math.round(cell * 1.2) + 'px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Get ready…', ox + size / 2, oy + size * 0.3);
    }
    if (g.food) { ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(ox + (g.food.x + 0.5) * cell, oy + (g.food.y + 0.5) * cell, cell * 0.36, 0, 6.283); ctx.fill(); ctx.fillStyle = '#3ddc84'; ctx.fillRect(ox + (g.food.x + 0.5) * cell - 1, oy + g.food.y * cell + cell * 0.08, 2, cell * 0.2); }
    if (g.bonus) { var pulse = 0.38 + 0.06 * Math.sin(performance.now() / 120); ctx.fillStyle = g.bonus.ttl < 12 && Math.floor(performance.now() / 150) % 2 ? 'rgba(255,210,63,.4)' : '#ffd23f'; ctx.beginPath(); ctx.arc(ox + (g.bonus.x + 0.5) * cell, oy + (g.bonus.y + 0.5) * cell, cell * pulse, 0, 6.283); ctx.fill(); }
    var n = g.body.length;
    for (var i = n - 1; i >= 0; i--) {
      var c = g.body[i], px = c.x, py = c.y;
      if (prevBody && prevBody[i] && mode === 'play' && !K.reduceMotion) { px = prevBody[i].x + (c.x - prevBody[i].x) * tFrac; py = prevBody[i].y + (c.y - prevBody[i].y) * tFrac; if (Math.abs(c.x - prevBody[i].x) > 1 || Math.abs(c.y - prevBody[i].y) > 1) { px = c.x; py = c.y; } }
      var shade = 1 - i / Math.max(n, 1) * 0.45;
      ctx.fillStyle = i === 0 ? '#b6ff3b' : 'rgba(61,220,132,' + shade + ')';
      var pad = i === 0 ? 0.06 : 0.12;
      ctx.beginPath(); roundRect(ox + (px + pad) * cell, oy + (py + pad) * cell, cell * (1 - pad * 2), cell * (1 - pad * 2), cell * 0.28); ctx.fill();
      if (i === 0) {
        var d = S.DIRS[g.dir], ex = ox + (px + 0.5 + d.x * 0.18) * cell, ey = oy + (py + 0.5 + d.y * 0.18) * cell;
        ctx.fillStyle = '#081210';
        ctx.beginPath(); ctx.arc(ex + d.y * cell * 0.18, ey + d.x * cell * 0.18, cell * 0.08, 0, 6.283); ctx.arc(ex - d.y * cell * 0.18, ey - d.x * cell * 0.18, cell * 0.08, 0, 6.283); ctx.fill();
      }
    }
  }
  function roundRect(x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (mode === 'play') update(dt);
    if (deadFlash > 0) deadFlash -= dt;
    draw();
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  resize(); syncTitle(); screens.show('title');
  requestAnimationFrame(frame);
  window.GLDebug = { state: function () { return g ? { mode: mode, score: g.score, length: g.body.length, dir: g.dir, head: g.body[0], food: g.food, over: g.over } : { mode: mode }; } };
  K.ready();
})();
