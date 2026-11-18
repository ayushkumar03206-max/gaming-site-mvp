/* Fruit Slice: swipe to slice tossed fruit in a 60-second round. Canvas 2D. */
(function () {
  'use strict';
  var K = window.GLKit, F = window.SliceLogic, $ = K.$;
  K.init('Fruit Slice');
  var canvas = $('c'), ctx = canvas.getContext('2d');
  if (!ctx || !F) { K.fail('Your browser could not start the game canvas.'); return; }

  var view = { W: 1, H: 1 };
  function resize() { view = K.fitCanvas(canvas, ctx); if (g) F.resize(g, view.W, view.H); }

  var mode = 'title', g = null, trail = [], down = false, lastPt = null, splats = [], pops = [], flash = 0;
  var best = K.best('gl_fruit_best'), screens = K.screens(['title', 'paused', 'over']);
  function syncBest() { $('bestTitle').textContent = best.get() ? 'Your best: ' + best.get() : ''; }

  function start() {
    g = F.createGame(view.W, view.H); trail = []; splats = []; pops = []; down = false; lastPt = null; flash = 0;
    mode = 'play'; screens.show(null); $('hud').hidden = false; last = performance.now();
    K.announce('Round started. 60 seconds.');
  }
  function pause() { if (mode !== 'play') return; mode = 'paused'; down = false; lastPt = null; screens.show('paused'); }
  function resume() { if (mode !== 'paused') return; mode = 'play'; screens.show(null); last = performance.now(); }
  function finish() {
    mode = 'over'; var isBest = best.submit(g.score);
    $('finalScore').textContent = g.score; $('oSliced').textContent = g.sliced; $('oCombo').textContent = g.bestCombo; $('oBombs').textContent = g.bombs;
    $('overTitle').textContent = isBest && g.score > 0 ? 'New best!' : "Time's up!";
    $('bestOver').textContent = 'Best: ' + best.get(); syncBest();
    K.sound.play('win'); K.announce("Time's up. Score " + g.score + '.');
    setTimeout(function () { if (mode === 'over') screens.show('over'); }, 400);
  }
  $('playBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);
  $('restartBtn').addEventListener('click', start);
  $('resumeBtn').addEventListener('click', resume);
  $('pauseBtn').addEventListener('click', pause);
  K.onRestart(start); K.autoPause(pause); K.muteButton();
  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyP' || e.code === 'Escape') { if (mode === 'play') pause(); else if (mode === 'paused') resume(); }
    if ((e.code === 'Enter' || e.code === 'KeyR') && mode === 'over') start();
  });

  function pt(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function swipeTo(p) {
    if (lastPt) handle(F.slice(g, lastPt.x, lastPt.y, p.x, p.y));
    lastPt = p; trail.push({ x: p.x, y: p.y, age: 0 });
  }
  canvas.addEventListener('pointerdown', function (e) { if (mode !== 'play') return; down = true; lastPt = null; canvas.setPointerCapture(e.pointerId); swipeTo(pt(e)); });
  canvas.addEventListener('pointermove', function (e) { if (mode === 'play' && down) swipeTo(pt(e)); });
  function up() { down = false; lastPt = null; }
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  function handle(ev) {
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.type === 'slice') {
        K.sound.play('slice');
        splats.push({ x: e.x, y: e.y, c: e.color, age: 0, r: K.rand(14, 24) });
        pops.push({ x: e.x, y: e.y, t: e.combo > 1 ? '+' + e.pts + '  x' + e.combo : '+' + e.pts, age: 0 });
      } else if (e.type === 'bomb') {
        K.sound.play('boom'); flash = K.reduceMotion ? 0.15 : 0.35;
        pops.push({ x: e.x, y: e.y, t: '-' + F.BOMB_PENALTY + 's', age: 0, bad: true });
        K.announce('Bomb! Minus ' + F.BOMB_PENALTY + ' seconds');
      } else if (e.type === 'timeUp') finish();
    }
  }

  function update(dt) {
    handle(F.step(g, dt));
    $('hScore').textContent = g.score; $('hTime').textContent = Math.ceil(g.time);
    $('hTime').parentNode.classList.toggle('warn', g.time <= 10);
    $('hCombo').textContent = g.comboTimer > 0 && g.combo > 1 ? 'x' + g.combo : '–';
  }

  function drawFruit(x, y, r, kind, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    if (kind.k === 'star') {
      ctx.fillStyle = kind.c; ctx.beginPath();
      for (var i = 0; i < 10; i++) { var a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.5 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = kind.c; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
      if (kind.k === 'melon') { ctx.strokeStyle = '#1f8a4c'; ctx.lineWidth = r * 0.12; for (var s = -2; s <= 2; s++) { ctx.beginPath(); ctx.ellipse(s * r * 0.35, 0, r * 0.12, r * 0.95, 0, 0, 6.283); ctx.stroke(); } }
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.35, r * 0.28, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#2f9e44'; ctx.beginPath(); ctx.ellipse(r * 0.2, -r * 1.02, r * 0.28, r * 0.12, -0.5, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }
  function drawBomb(x, y, r, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = '#1b1d2a'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = Math.max(2, r * 0.12); ctx.stroke();
    ctx.fillStyle = '#ff4d6d'; ctx.font = '900 ' + Math.round(r * 1.1) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✕', 0, r * 0.05);
    ctx.strokeStyle = '#c9a36b'; ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.4, -r * 1.5, r * 0.7, -r * 1.35); ctx.stroke();
    ctx.fillStyle = Math.random() < 0.5 ? '#ffd23f' : '#ff7a3d'; ctx.beginPath(); ctx.arc(r * 0.72, -r * 1.36, r * 0.18, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  function drawHalf(q) {
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.ang + q.rot);
    ctx.beginPath(); ctx.arc(0, 0, q.r, q.side > 0 ? 0 : Math.PI, q.side > 0 ? Math.PI : 2 * Math.PI); ctx.closePath();
    ctx.fillStyle = q.kind.c; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, q.r * 0.82, q.side > 0 ? 0 : Math.PI, q.side > 0 ? Math.PI : 2 * Math.PI); ctx.closePath();
    ctx.fillStyle = q.kind.in; ctx.fill();
    ctx.restore();
  }

  function draw() {
    var W = view.W, H = view.H, bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a1840'); bg.addColorStop(1, '#120a20'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 2;
    for (var x = 0; x < W; x += 46) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    splats.forEach(function (s) { ctx.globalAlpha = Math.max(0, 0.45 - s.age * 0.15); ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill(); });
    ctx.globalAlpha = 1;
    if (g) {
      g.halves.forEach(drawHalf);
      g.items.forEach(function (it) { if (it.delay > 0) return; if (it.bomb) drawBomb(it.x, it.y, it.r, it.rot); else drawFruit(it.x, it.y, it.r, it.kind, it.rot); });
    }
    if (trail.length > 1) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (var i = 1; i < trail.length; i++) {
        var a = trail[i - 1], b = trail[i], life = 1 - b.age / 0.18;
        if (life <= 0) continue;
        ctx.strokeStyle = 'rgba(230,250,255,' + life + ')'; ctx.lineWidth = 2 + 7 * life;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    pops.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / 0.9); ctx.fillStyle = p.bad ? '#ff4d6d' : '#ffd23f';
      ctx.font = '900 22px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.t, p.x, p.y - p.age * 40);
    });
    ctx.globalAlpha = 1;
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.7, flash * 2) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (mode === 'play') update(dt);
    for (var i = trail.length - 1; i >= 0; i--) { trail[i].age += dt; if (trail[i].age > 0.18) trail.splice(i, 1); }
    for (var j = splats.length - 1; j >= 0; j--) { splats[j].age += dt; if (splats[j].age > 3) splats.splice(j, 1); }
    for (var k = pops.length - 1; k >= 0; k--) { pops[k].age += dt; if (pops[k].age > 0.9) pops.splice(k, 1); }
    if (flash > 0) flash -= dt;
    draw();
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  resize(); syncBest(); screens.show('title');
  requestAnimationFrame(frame);
  window.GLDebug = { state: function () { return g ? { mode: mode, score: g.score, time: g.time, items: g.items.length, sliced: g.sliced } : { mode: mode }; } };
  K.ready();
})();
