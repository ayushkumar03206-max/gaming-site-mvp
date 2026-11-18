/* Brick Breaker: paddle-and-ball arcade game. Canvas 2D, synthesised sounds. */
(function () {
  'use strict';
  var K = window.GLKit, B = window.BrickLogic, $ = K.$;
  K.init('Brick Breaker');
  var canvas = $('c'), ctx = canvas.getContext('2d');
  if (!ctx || !B) { K.fail('Your browser could not start the game canvas.'); return; }

  var view = { W: 1, H: 1 }, S = 1, OX = 0, OY = 0;
  function resize() {
    view = K.fitCanvas(canvas, ctx);
    var topPad = 52; // room for the HUD
    S = Math.min(view.W / B.W, (view.H - topPad) / B.H);
    OX = (view.W - B.W * S) / 2; OY = topPad + (view.H - topPad - B.H * S) / 2;
  }

  var HP_COLORS = { 1: '#ff7a3d', 2: '#ffb020', 3: '#ff3f6c' };
  var POWER_STYLE = { wide: ['#29f0ff', 'W'], multi: ['#b6ff3b', 'M'], slow: ['#b66dff', 'S'], life: ['#ff5d8f', '♥'] };
  var mode = 'title', g = null, particles = [], keys = {}, pointerX = null;
  var best = K.best('gl_brick_best'), screens = K.screens(['title', 'paused', 'clear', 'over']);

  function syncBest() { $('bestTitle').textContent = best.get() ? 'Your best: ' + best.get() : ''; }
  function hud() {
    $('hScore').textContent = g.score; $('hLevel').textContent = (g.level + 1) + '/' + B.LEVELS.length;
    $('hLives').textContent = g.lives > 0 ? new Array(g.lives + 1).join('♥') : '–';
  }
  function start() {
    g = B.createGame(); particles = []; keys = {}; pointerX = null;
    mode = 'play'; screens.show(null); $('hud').hidden = false; hud();
    last = performance.now(); try { canvas.focus(); } catch (e) { /* ignore */ }
    K.announce('Level 1. Press space or tap to launch.');
  }
  function pause() { if (mode !== 'play') return; mode = 'paused'; keys = {}; screens.show('paused'); }
  function resume() { if (mode !== 'paused') return; mode = 'play'; screens.show(null); last = performance.now(); }
  function launch() { if (mode === 'play' && g) B.launch(g); }
  function finish() {
    mode = 'over'; var isBest = best.submit(g.score);
    $('finalScore').textContent = g.score;
    $('overTitle').textContent = g.won ? 'You cleared every level!' : (isBest && g.score > 0 ? 'New best!' : 'Game over');
    $('overMsg').textContent = g.won ? 'All ' + B.LEVELS.length + ' levels done with ' + g.lives + ' lives left.' : 'You reached level ' + (g.level + 1) + '.';
    $('bestOver').textContent = 'Best: ' + best.get(); syncBest();
    K.sound.play(g.won ? 'win' : 'lose'); K.announce($('overTitle').textContent + ' Score ' + g.score + '.');
    setTimeout(function () { if (mode === 'over') screens.show('over'); }, 500);
  }

  $('playBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);
  $('restartBtn').addEventListener('click', start);
  $('resumeBtn').addEventListener('click', resume);
  $('pauseBtn').addEventListener('click', pause);
  $('nextBtn').addEventListener('click', function () { B.nextLevel(g); mode = 'play'; screens.show(null); hud(); last = performance.now(); K.announce('Level ' + (g.level + 1)); });
  K.onRestart(start); K.autoPause(pause); K.muteButton();

  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.l = true; pointerX = null; e.preventDefault(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.r = true; pointerX = null; e.preventDefault(); }
    if (e.code === 'Space' || e.code === 'ArrowUp') { if (mode === 'play') { launch(); e.preventDefault(); } }
    if (e.code === 'KeyP' || e.code === 'Escape') { if (mode === 'play') pause(); else if (mode === 'paused') resume(); }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.l = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.r = false;
  });
  function worldX(cx) { return (cx - OX) / S; }
  canvas.addEventListener('pointermove', function (e) { if (mode === 'play') pointerX = worldX(e.clientX); });
  canvas.addEventListener('pointerdown', function (e) {
    if (mode !== 'play') return;
    pointerX = worldX(e.clientX);
    if (e.pointerType === 'mouse') launch(); else { canvas.setPointerCapture(e.pointerId); }
  });
  canvas.addEventListener('pointerup', function (e) { if (mode === 'play' && e.pointerType !== 'mouse') launch(); });

  function burst(x, y, c) { for (var i = 0; i < (K.reduceMotion ? 4 : 10); i++) { var a = Math.random() * 6.28, sp = K.rand(10, 40); particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: K.rand(0.3, 0.6), c: c }); } }

  function update(dt) {
    var dir = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
    var ev = B.step(g, dt, dir ? { dir: dir } : { targetX: pointerX });
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.type === 'break') { burst(e.x, e.y, '#ffb020'); K.sound.play('pop'); }
      else if (e.type === 'hit' || e.type === 'steel') K.sound.play('blip');
      else if (e.type === 'paddle') K.sound.play('place');
      else if (e.type === 'power') { K.sound.play('power'); K.announce('Power-up: ' + e.power); }
      else if (e.type === 'lifeLost' && !g.over) { K.sound.play('hit'); K.announce(g.lives + ' lives left'); }
      else if (e.type === 'gameOver') { finish(); }
      else if (e.type === 'levelClear') {
        if (e.won) finish();
        else { mode = 'clear'; K.sound.play('win'); $('clearTitle').textContent = 'Level ' + (g.level + 1) + ' cleared!'; $('clearMsg').textContent = 'Score ' + g.score + ' · ' + g.lives + ' lives'; setTimeout(function () { screens.show('clear'); }, 300); }
      }
    }
    hud();
  }

  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function draw() {
    ctx.fillStyle = '#0c0a1c'; ctx.fillRect(0, 0, view.W, view.H);
    ctx.save(); ctx.translate(OX, OY); ctx.scale(S, S);
    ctx.fillStyle = '#15122e'; ctx.fillRect(0, 0, B.W, B.H);
    ctx.strokeStyle = '#2b3266'; ctx.lineWidth = 0.4; ctx.strokeRect(0, 0, B.W, B.H);
    if (g) {
      g.bricks.forEach(function (b) {
        ctx.fillStyle = b.steel ? '#6b7394' : b.power ? '#b6ff3b' : HP_COLORS[Math.min(3, b.hp)];
        rr(b.x, b.y, b.w, b.h, 0.8); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(b.x + 0.6, b.y + 0.5, b.w - 1.2, 0.8);
        if (!b.steel && b.maxHp > 1 && b.hp < b.maxHp) { ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(b.x + 2, b.y + 0.6); ctx.lineTo(b.x + 4, b.y + 2.4); ctx.lineTo(b.x + 3, b.y + 3.6); ctx.stroke(); }
      });
      g.drops.forEach(function (d) {
        var st = POWER_STYLE[d.type]; ctx.fillStyle = st[0]; rr(d.x - 3, d.y - 1.8, 6, 3.6, 1.6); ctx.fill();
        ctx.fillStyle = '#05060e'; ctx.font = '800 2.8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(st[1], d.x, d.y + 0.15);
      });
      var p = g.paddle, pg = ctx.createLinearGradient(0, B.PADDLE_Y, 0, B.PADDLE_Y + B.PADDLE_H);
      pg.addColorStop(0, '#ffd23f'); pg.addColorStop(1, '#ff7a3d'); ctx.fillStyle = pg;
      rr(p.x - p.w / 2, B.PADDLE_Y, p.w, B.PADDLE_H, 1.4); ctx.fill();
      g.balls.forEach(function (b) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill(); });
      if (mode === 'play' && g.balls.length === 1 && g.balls[0].stuck) {
        ctx.fillStyle = 'rgba(238,240,255,.75)'; ctx.font = '700 3.6px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(K.isTouch ? 'Tap to launch' : 'Click or press Space to launch', B.W / 2, B.PADDLE_Y - 12);
      }
      if (g.fx.wide > 0 || g.fx.slow > 0) {
        ctx.font = '700 3px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#a3a9d6';
        ctx.fillText((g.fx.wide > 0 ? 'WIDE ' + Math.ceil(g.fx.wide) + 's  ' : '') + (g.fx.slow > 0 ? 'SLOW ' + Math.ceil(g.fx.slow) + 's' : ''), 2, B.H - 3);
      }
    }
    particles.forEach(function (q) { ctx.globalAlpha = Math.max(0, 1 - q.age / q.life); ctx.fillStyle = q.c; ctx.fillRect(q.x - 0.5, q.y - 0.5, 1, 1); });
    ctx.globalAlpha = 1; ctx.restore();
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (mode === 'play') update(dt);
    for (var i = particles.length - 1; i >= 0; i--) { var q = particles[i]; q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.age > q.life) particles.splice(i, 1); }
    draw();
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  resize(); syncBest(); screens.show('title');
  requestAnimationFrame(frame);
  window.GLDebug = { state: function () { return g ? { mode: mode, level: g.level, lives: g.lives, score: g.score, bricks: B.remaining(g), balls: g.balls.length } : { mode: mode }; } };
  K.ready();
})();
