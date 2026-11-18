/* Bubble Shooter: aim, bounce and pop groups of three. Canvas 2D. */
(function () {
  'use strict';
  var K = window.GLKit, B = window.BubbleLogic, $ = K.$;
  K.init('Bubble Shooter');
  var canvas = $('c'), ctx = canvas.getContext('2d');
  if (!ctx || !B) { K.fail('Your browser could not start the game canvas.'); return; }

  // colours + a symbol each, so colour is never the only cue
  var COLORS = [['#ff4d6d', '●'], ['#29b6ff', '■'], ['#3ddc84', '▲'], ['#ffd23f', '★'], ['#b66dff', '◆'], ['#ff8a3d', '✚']];
  var view = { W: 1, H: 1 }, S = 1, OX = 0, OY = 0;
  function resize() {
    view = K.fitCanvas(canvas, ctx);
    var top = 52; S = Math.min(view.W / B.W, (view.H - top) / B.H);
    OX = (view.W - B.W * S) / 2; OY = top + (view.H - top - B.H * S) / 2;
  }
  var mode = 'title', g = null, angle = 0, aiming = false, keys = {}, fx = [], best = K.best('gl_bubble_best');
  var screens = K.screens(['title', 'paused', 'clear', 'over']);

  function syncBest() { $('bestTitle').textContent = best.get() ? 'Your best: ' + best.get() : ''; }
  function hud() { $('hScore').textContent = g.score; $('hLevel').textContent = g.level; $('hDrop').textContent = B.MISSES_PER_DROP - g.misses; }
  function start() { g = B.createGame(); fx = []; angle = 0; keys = {}; mode = 'play'; screens.show(null); $('hud').hidden = false; hud(); last = performance.now(); K.announce('Level 1.'); }
  function pause() { if (mode !== 'play') return; mode = 'paused'; keys = {}; aiming = false; screens.show('paused'); }
  function resume() { if (mode !== 'paused') return; mode = 'play'; screens.show(null); last = performance.now(); }
  function finish() {
    mode = 'over'; var isBest = best.submit(g.score);
    $('finalScore').textContent = g.score; $('overMsg').textContent = 'You reached level ' + g.level + '.';
    $('overTitle').textContent = isBest && g.score > 0 ? 'New best!' : 'The bubbles reached the line';
    $('bestOver').textContent = 'Best: ' + best.get(); syncBest(); K.sound.play('lose'); K.announce($('overTitle').textContent);
    setTimeout(function () { if (mode === 'over') screens.show('over'); }, 600);
  }
  function shoot() { if (mode === 'play' && B.fire(g, angle)) K.sound.play('shoot'); }
  function swap() { if (mode === 'play') { B.swap(g); K.sound.play('blip'); } }

  $('playBtn').addEventListener('click', start); $('againBtn').addEventListener('click', start); $('restartBtn').addEventListener('click', start);
  $('resumeBtn').addEventListener('click', resume); $('pauseBtn').addEventListener('click', pause); $('swapBtn').addEventListener('click', swap);
  $('nextBtn').addEventListener('click', function () { B.nextLevel(g); mode = 'play'; screens.show(null); hud(); K.announce('Level ' + g.level); });
  K.onRestart(start); K.autoPause(pause); K.muteButton();

  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.l = true; e.preventDefault(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.r = true; e.preventDefault(); }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); shoot(); }
    if (e.code === 'KeyX' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') swap();
    if (e.code === 'KeyP' || e.code === 'Escape') { if (mode === 'play') pause(); else if (mode === 'paused') resume(); }
    if (e.code === 'Enter' && mode === 'over') start();
  });
  window.addEventListener('keyup', function (e) { if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.l = false; if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.r = false; });
  function aimAt(e) {
    var x = (e.clientX - OX) / S, y = (e.clientY - OY) / S;
    var dy = B.SHOOTER.y - y; if (dy < 4) dy = 4;
    angle = Math.max(-1.4, Math.min(1.4, Math.atan2(x - B.SHOOTER.x, dy)));
  }
  function onShooter(e) { var x = (e.clientX - OX) / S, y = (e.clientY - OY) / S; return Math.hypot(x - B.SHOOTER.x - 14, y - B.SHOOTER.y) < 7; }
  canvas.addEventListener('pointermove', function (e) { if (mode === 'play' && (e.pointerType === 'mouse' || aiming)) aimAt(e); });
  canvas.addEventListener('pointerdown', function (e) {
    if (mode !== 'play') return;
    if (onShooter(e)) { swap(); return; }
    aimAt(e);
    if (e.pointerType === 'mouse') shoot(); else { aiming = true; canvas.setPointerCapture(e.pointerId); }
  });
  canvas.addEventListener('pointerup', function (e) { if (aiming && mode === 'play') { aimAt(e); shoot(); } aiming = false; });
  canvas.addEventListener('pointercancel', function () { aiming = false; });

  function update(dt) {
    if (keys.l) angle = Math.max(-1.4, angle - 1.6 * dt);
    if (keys.r) angle = Math.min(1.4, angle + 1.6 * dt);
    var ev = B.step(g, dt), pops = 0;
    ev.forEach(function (e) {
      if (e.type === 'pop') { pops++; burst(e.x, e.y, COLORS[e.v] ? COLORS[e.v][0] : '#fff'); }
      else if (e.type === 'drop') fx.push({ x: e.x, y: e.y, vy: 0, v: e.v, age: 0, drop: true });
      else if (e.type === 'bounce') K.sound.play('blip');
      else if (e.type === 'land' && !pops) K.sound.play('place');
      else if (e.type === 'ceiling') { K.sound.play('hit'); K.announce('The ceiling moved down.'); }
      else if (e.type === 'levelClear') { mode = 'clear'; K.sound.play('win'); $('clearTitle').textContent = 'Level ' + g.level + ' cleared!'; $('clearMsg').textContent = 'Score ' + g.score; setTimeout(function () { screens.show('clear'); }, 400); }
      else if (e.type === 'gameOver') finish();
    });
    if (pops) K.sound.play('pop');
    hud();
  }
  function burst(x, y, c) { for (var i = 0; i < (K.reduceMotion ? 3 : 8); i++) { var a = Math.random() * 6.28, sp = K.rand(10, 40); fx.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.45, c: c }); } }

  function bubble(x, y, v, r) {
    r = r || B.R * 0.94;
    if (v === 'bomb') { ctx.fillStyle = '#1b1d2a'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 0.8; ctx.stroke(); txt(x, y, '✹', '#ff4d6d', r); return; }
    if (v === 'rainbow') { var gr = ctx.createLinearGradient(x - r, y - r, x + r, y + r); COLORS.forEach(function (c, i) { gr.addColorStop(i / 5, c[0]); }); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); txt(x, y, '?', '#05060e', r); return; }
    var col = COLORS[v] || ['#888', '?'];
    ctx.fillStyle = col[0]; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.3, 0, 6.283); ctx.fill();
    txt(x, y, col[1], 'rgba(5,6,14,.55)', r);
  }
  function txt(x, y, t, c, r) { ctx.fillStyle = c; ctx.font = '900 ' + (r * 1.05).toFixed(2) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y + r * 0.08); }

  function draw() {
    ctx.fillStyle = '#0b0a1f'; ctx.fillRect(0, 0, view.W, view.H);
    ctx.save(); ctx.translate(OX, OY); ctx.scale(S, S);
    ctx.fillStyle = '#141236'; ctx.fillRect(0, 0, B.W, B.H);
    if (g) {
      ctx.fillStyle = '#211d4d'; ctx.fillRect(0, 0, B.W, g.ceil * B.ROW_H); // lowered ceiling
      ctx.strokeStyle = 'rgba(255,77,109,.5)'; ctx.setLineDash([2, 2]); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0, B.LINE_Y); ctx.lineTo(B.W, B.LINE_Y); ctx.stroke(); ctx.setLineDash([]);
      for (var r = 0; r < B.MAX_ROWS; r++) for (var c = 0; c < B.COLS; c++) { var v = g.grid[r][c]; if (v !== null) { var p = B.pos(g, r, c); bubble(p.x, p.y, v); } }
      if (mode === 'play' && !g.shot) aimGuide();
      if (g.shot) bubble(g.shot.x, g.shot.y, g.shot.v);
      bubble(B.SHOOTER.x, B.SHOOTER.y, g.current);
      bubble(B.SHOOTER.x + 14, B.SHOOTER.y, g.next, B.R * 0.7);
      ctx.fillStyle = '#a3a9d6'; ctx.font = '700 2.6px system-ui'; ctx.textAlign = 'center'; ctx.fillText('NEXT · tap to swap', B.SHOOTER.x + 14, B.SHOOTER.y + 7);
    }
    fx.forEach(function (q) {
      if (q.drop) { ctx.globalAlpha = Math.max(0, 1 - q.age); bubble(q.x, q.y, q.v); }
      else { ctx.globalAlpha = Math.max(0, 1 - q.age / q.life); ctx.fillStyle = q.c; ctx.fillRect(q.x - 0.6, q.y - 0.6, 1.2, 1.2); }
    });
    ctx.globalAlpha = 1; ctx.restore();
  }
  function touchesBubble(x, y) {
    var lim = (B.D * 0.82) * (B.D * 0.82);
    for (var r = 0; r < B.MAX_ROWS; r++) for (var c = 0; c < B.COLS; c++) {
      if (g.grid[r][c] === null) continue;
      var p = B.pos(g, r, c); if ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < lim) return true;
    }
    return false;
  }
  function aimGuide() {
    var x = B.SHOOTER.x, y = B.SHOOTER.y, vx = Math.sin(angle), vy = -Math.cos(angle), len = 0;
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (var i = 0; i < 70 && len < 150; i++) {
      x += vx * 2; y += vy * 2; len += 2;
      if (x < B.R || x > B.W - B.R) vx = -vx;
      if (y < (g.ceil * B.ROW_H) + B.R || touchesBubble(x, y)) break;
      if (i % 2) { ctx.beginPath(); ctx.arc(x, y, 0.5, 0, 6.283); ctx.fill(); }
    }
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (mode === 'play') update(dt);
    for (var i = fx.length - 1; i >= 0; i--) { var q = fx[i]; q.age += dt; if (q.drop) { q.vy += 200 * dt; q.y += q.vy * dt; if (q.age > 1) fx.splice(i, 1); } else { q.x += q.vx * dt; q.y += q.vy * dt; if (q.age > q.life) fx.splice(i, 1); } }
    draw();
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  resize(); syncBest(); screens.show('title');
  requestAnimationFrame(frame);
  window.GLDebug = { state: function () { return g ? { mode: mode, level: g.level, score: g.score, shots: g.shots, bubbles: B.count(g), flying: !!g.shot, angle: angle } : { mode: mode }; } };
  K.ready();
})();
