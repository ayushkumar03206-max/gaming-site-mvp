/* Highway Rush: top-down endless traffic racer. Canvas 2D, all graphics drawn in code. */
(function () {
  'use strict';
  var K = window.GLKit, R = window.RushLogic, $ = K.$;
  K.init('Highway Rush');
  var canvas = $('c'), ctx = canvas.getContext('2d');
  if (!ctx || !R) { K.fail('Your browser could not start the game canvas.'); return; }

  var view = { W: 1, H: 1 }, LW = 60, CL = 80, roadX = 0, roadW = 240, playerY = 0;
  function resize() {
    view = K.fitCanvas(canvas, ctx);
    roadW = Math.min(view.W * 0.92, view.H * 0.62, 460);
    LW = roadW / R.LANES; CL = LW * 1.35;
    roadX = (view.W - roadW) / 2;
    playerY = view.H - CL * 1.5;
  }

  var CAR_COLORS = ['#4da3ff', '#b66dff', '#3ddc84', '#ff6b9a', '#f4f4f4', '#7a8aa6'];
  var mode = 'title', diff = K.load('gl_rush_diff', 'normal'), run = null, scroll = 0, shake = 0, floats = [];
  var bests = { easy: K.best('gl_rush_best_easy'), normal: K.best('gl_rush_best_normal'), hard: K.best('gl_rush_best_hard') };
  var screens = K.screens(['title', 'paused', 'over']);
  var keys = {}, hold = {}, dragX = null;

  function setDiff(d) {
    diff = d; K.save('gl_rush_diff', d);
    Array.prototype.forEach.call(document.querySelectorAll('[data-diff]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-diff') === d)); });
    var b = bests[d].get();
    $('bestTitle').textContent = b ? 'Best on ' + d + ': ' + b : '';
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-diff]'), function (b) { b.addEventListener('click', function () { setDiff(b.getAttribute('data-diff')); }); });

  function start() {
    run = R.createRun(diff, { spawnAhead: Math.ceil(playerY / CL) + 2 });
    keys = {}; hold.left = hold.right = false; dragX = null; floats = []; shake = 0;
    mode = 'play'; screens.show(null); $('hud').hidden = false; $('pad').hidden = false;
    last = performance.now(); try { canvas.focus(); } catch (e) { /* ignore */ }
    K.sound.play('power');
  }
  function pause() { if (mode !== 'play') return; mode = 'paused'; keys = {}; hold.left = hold.right = false; dragX = null; screens.show('paused'); }
  function resume() { if (mode !== 'paused') return; mode = 'play'; screens.show(null); last = performance.now(); }
  function toMenu() { mode = 'title'; run = null; $('hud').hidden = true; $('pad').hidden = true; setDiff(diff); screens.show('title'); }
  function gameOver() {
    mode = 'over'; shake = K.reduceMotion ? 0 : 0.4; K.sound.play('boom');
    var s = R.score(run), isBest = bests[diff].submit(s);
    $('finalScore').textContent = s; $('oMeters').textContent = R.meters(run); $('oCoins').textContent = run.coins; $('oNear').textContent = run.nearMisses;
    $('overTitle').textContent = isBest && s > 0 ? 'New best!' : 'Crashed!';
    $('bestOver').textContent = 'Best on ' + diff + ': ' + bests[diff].get();
    K.announce('Crashed after ' + R.meters(run) + ' meters. Score ' + s + '.');
    $('pad').hidden = true;
    setTimeout(function () { if (mode === 'over') screens.show('over'); }, 700);
  }

  $('playBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);
  $('restartBtn').addEventListener('click', start);
  $('resumeBtn').addEventListener('click', resume);
  $('pauseBtn').addEventListener('click', pause);
  $('menuBtn').addEventListener('click', toMenu);
  $('menuBtn2').addEventListener('click', toMenu);
  K.onRestart(start);
  K.autoPause(pause);
  K.holdButtons(hold);
  K.muteButton();

  var KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  window.addEventListener('keydown', function (e) {
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; dragX = null; e.preventDefault(); }
    if (e.code === 'KeyP' || e.code === 'Escape') { if (mode === 'play') pause(); else if (mode === 'paused') resume(); }
    if ((e.code === 'Enter' || e.code === 'KeyR') && mode === 'over') start();
  });
  window.addEventListener('keyup', function (e) { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
  function laneAt(clientX) { return (clientX - roadX) / LW - 0.5; }
  canvas.addEventListener('pointerdown', function (e) { if (mode !== 'play') return; dragX = laneAt(e.clientX); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', function (e) { if (dragX != null && mode === 'play') dragX = laneAt(e.clientX); });
  canvas.addEventListener('pointerup', function () { dragX = null; });
  canvas.addEventListener('pointercancel', function () { dragX = null; });

  function update(dt) {
    var input = { left: keys.left || hold.left, right: keys.right || hold.right, targetX: (keys.left || keys.right || hold.left || hold.right) ? null : dragX };
    var ev = R.step(run, dt, input);
    scroll = (scroll + run.speed * dt * CL) % (CL * 2);
    for (var i = 0; i < ev.length; i++) {
      if (ev[i].type === 'coin') { K.sound.play('coin'); floats.push({ t: '+25', x: laneX(run.x), y: playerY - CL * 0.6, age: 0 }); }
      else if (ev[i].type === 'near') { floats.push({ t: 'close! +5', x: laneX(run.x), y: playerY - CL, age: 0 }); }
      else if (ev[i].type === 'crash') { gameOver(); }
    }
    $('hMeters').textContent = R.meters(run); $('hCoins').textContent = run.coins; $('hSpeed').textContent = Math.round(run.speed * 4.5 * 3.6);
  }

  function laneX(l) { return roadX + (l + 0.5) * LW; }
  function draw() {
    var W = view.W, H = view.H;
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);
    // verges
    ctx.fillStyle = '#1d3b2a'; ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = '#244a34';
    for (var y = -CL * 2 + (scroll % (CL * 2)); y < H; y += CL * 2) { ctx.fillRect(0, y, roadX - 8, CL); ctx.fillRect(roadX + roadW + 8, y, W, CL); }
    // road
    ctx.fillStyle = '#2b2f3a'; ctx.fillRect(roadX, -20, roadW, H + 40);
    ctx.fillStyle = '#e9e9e9'; ctx.fillRect(roadX - 6, -20, 4, H + 40); ctx.fillRect(roadX + roadW + 2, -20, 4, H + 40);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (var l = 1; l < R.LANES; l++) for (var yy = -CL + (scroll % CL); yy < H; yy += CL) ctx.fillRect(roadX + l * LW - 2, yy, 4, CL * 0.45);
    if (run) {
      run.pickups.forEach(function (p) {
        var py = playerY - p.y * CL, r = LW * 0.17;
        ctx.save(); ctx.fillStyle = '#ffd23f'; ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(laneX(p.lane), py, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#b8860b'; ctx.shadowBlur = 0; ctx.fillRect(laneX(p.lane) - r * 0.2, py - r * 0.55, r * 0.4, r * 1.1); ctx.restore();
      });
      run.traffic.forEach(function (c) { car(laneX(c.lane), playerY - c.y * CL, CAR_COLORS[c.hue], false); });
      if (mode !== 'over' || shake > 0.2) car(laneX(run.x), playerY, '#ff5d3a', true);
    }
    floats.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, 1 - f.age / 0.9); ctx.fillStyle = '#ffd23f'; ctx.textAlign = 'center';
      ctx.font = '800 ' + Math.round(LW * 0.28) + 'px system-ui, sans-serif'; ctx.fillText(f.t, f.x, f.y);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function car(cx, cy, color, isPlayer) {
    var w = LW * 0.58, h = CL * 0.82, x = cx - w / 2, y = cy - h / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(x + 3, y + 5, w, h, w * 0.25); ctx.fill();
    ctx.fillStyle = color; rr(x, y, w, h, w * 0.25); ctx.fill();
    ctx.fillStyle = 'rgba(20,28,45,.85)';
    rr(x + w * 0.14, y + h * (isPlayer ? 0.2 : 0.58), w * 0.72, h * 0.2, 4); ctx.fill();
    rr(x + w * 0.16, y + h * (isPlayer ? 0.62 : 0.2), w * 0.68, h * 0.14, 4); ctx.fill();
    ctx.fillStyle = isPlayer ? '#fff6c2' : '#ff4d4d';
    ctx.fillRect(x + w * 0.1, isPlayer ? y + 2 : y + h - 5, w * 0.18, 3); ctx.fillRect(x + w * 0.72, isPlayer ? y + 2 : y + h - 5, w * 0.18, 3);
    if (isPlayer) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(cx - 2, y + h * 0.42, 4, h * 0.16); }
    ctx.restore();
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode === 'play') update(dt);
    else scroll = (scroll + (mode === 'title' ? 6 : 0) * dt * CL) % (CL * 2);
    for (var i = floats.length - 1; i >= 0; i--) { floats[i].age += dt; floats[i].y -= 40 * dt; if (floats[i].age > 0.9) floats.splice(i, 1); }
    if (shake > 0) shake -= dt;
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize(); setDiff(diff); screens.show('title');
  requestAnimationFrame(frame);
  // Read-only state for automated QA (tests/e2e). Does not affect play.
  window.GLDebug = { state: function () { return { mode: mode, diff: diff, score: run ? R.score(run) : 0, meters: run ? R.meters(run) : 0, x: run ? run.x : null, traffic: run ? run.traffic.length : 0 }; } };
  K.ready();
})();
