/* Car Parking Challenge: top-down parking with steering physics, 9 levels in 3 difficulties. Canvas 2D. */
(function () {
  'use strict';
  var K = window.GLKit, P = window.ParkingLogic, $ = K.$;
  K.init('Car Parking Challenge');
  var canvas = $('c'), ctx = canvas.getContext('2d');
  if (!ctx || !P) { K.fail('Your browser could not start the game canvas.'); return; }

  var view = { W: 1, H: 1 }, S = 1, OX = 0, OY = 0;
  function resize() {
    view = K.fitCanvas(canvas, ctx);
    var top = 52, bottom = K.isTouch ? 96 : 8;
    S = Math.min(view.W / P.W, (view.H - top - bottom) / P.H);
    OX = (view.W - P.W * S) / 2; OY = top + (view.H - top - bottom - P.H * S) / 2;
  }
  var mode = 'title', g = null, keys = {}, hold = {}, levelIdx = 0;
  var progress = K.load('gl_parking_stars', {}); // {levelIndex: stars}
  var screens = K.screens(['title', 'paused', 'result']);

  function buildLevelList() {
    var wrap = $('levels'); wrap.innerHTML = '';
    ['easy', 'medium', 'hard'].forEach(function (d) {
      var grp = document.createElement('div'); grp.className = 'lvgrp';
      grp.innerHTML = '<p class="label">' + d + '</p>';
      var row = document.createElement('div'); row.className = 'lvrow';
      P.LEVELS.forEach(function (L, i) {
        if (L.diff !== d) return;
        var b = document.createElement('button'); b.type = 'button'; b.className = 'lv';
        var st = progress[i] || 0;
        b.innerHTML = '<b>' + (i + 1) + '</b><span>' + L.name + '</span><i aria-hidden="true">' + '★★★'.slice(0, st) + '☆☆☆'.slice(0, 3 - st) + '</i>';
        b.setAttribute('aria-label', 'Level ' + (i + 1) + ', ' + L.name + ', ' + d + ', ' + st + ' of 3 stars');
        if (i === 0) b.setAttribute('data-start', '');
        b.addEventListener('click', function () { start(i); });
        row.appendChild(b);
      });
      grp.appendChild(row); wrap.appendChild(grp);
    });
  }

  function start(i) {
    levelIdx = i; g = P.createGame(i); keys = {}; hold.left = hold.right = hold.gas = hold.rev = false;
    mode = 'play'; screens.show(null); $('hud').hidden = false; $('pad').hidden = false;
    $('hLevel').textContent = (i + 1) + ' · ' + g.def.name; $('hPar').textContent = g.def.par + 's';
    last = performance.now(); try { canvas.focus(); } catch (e) { /* ignore */ }
    K.announce('Level ' + (i + 1) + ': ' + g.def.name + '. Park inside the green bay and stop.');
  }
  function pause() { if (mode !== 'play') return; mode = 'paused'; keys = {}; screens.show('paused'); }
  function resume() { if (mode !== 'paused') return; mode = 'play'; screens.show(null); last = performance.now(); }
  function toTitle() { mode = 'title'; g = null; $('hud').hidden = true; $('pad').hidden = true; buildLevelList(); screens.show('title'); }
  function result(ok) {
    mode = 'result'; $('pad').hidden = true;
    if (ok) {
      var st = P.stars(g); if (!progress[levelIdx] || st > progress[levelIdx]) { progress[levelIdx] = st; K.save('gl_parking_stars', progress); }
      $('resTitle').textContent = 'Parked!'; $('resStars').textContent = '★★★'.slice(0, st) + '☆☆☆'.slice(0, 3 - st);
      $('resMsg').textContent = 'Time ' + g.time.toFixed(1) + 's (par ' + g.def.par + 's) · ' + P.score(g) + ' points';
      $('nextBtn').hidden = levelIdx >= P.LEVELS.length - 1; K.sound.play('win');
    } else {
      $('resTitle').textContent = 'Crashed!'; $('resStars').textContent = ''; $('resMsg').textContent = 'Touching anything fails the level. Try again.';
      $('nextBtn').hidden = true; K.sound.play('boom');
    }
    K.announce($('resTitle').textContent + ' ' + $('resMsg').textContent);
    setTimeout(function () { if (mode === 'result') screens.show('result'); }, ok ? 300 : 700);
  }

  $('retryBtn').addEventListener('click', function () { start(levelIdx); });
  $('restartBtn').addEventListener('click', function () { start(levelIdx); });
  $('nextBtn').addEventListener('click', function () { start(levelIdx + 1); });
  $('menuBtn').addEventListener('click', toTitle); $('menuBtn2').addEventListener('click', toTitle);
  $('resumeBtn').addEventListener('click', resume); $('pauseBtn').addEventListener('click', pause);
  K.onRestart(function () { if (g) start(levelIdx); }); K.autoPause(pause); K.holdButtons(hold); K.muteButton();

  var KEYMAP = { ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'rev', KeyS: 'rev', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'brake' };
  window.addEventListener('keydown', function (e) {
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
    if (e.code === 'KeyP' || e.code === 'Escape') { if (mode === 'play') pause(); else if (mode === 'paused') resume(); }
    if (e.code === 'KeyR' && (mode === 'play' || mode === 'result')) start(levelIdx);
  });
  window.addEventListener('keyup', function (e) { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });

  function update(dt) {
    var th = (keys.gas || hold.gas ? 1 : 0) - (keys.rev || hold.rev ? 1 : 0);
    var steer = (keys.right || hold.right ? 1 : 0) - (keys.left || hold.left ? 1 : 0);
    var ev = P.step(g, dt, { throttle: th, steer: steer, brake: keys.brake });
    ev.forEach(function (e) { if (e.type === 'crash') result(false); else if (e.type === 'parked') result(true); });
    $('hTime').textContent = g.time.toFixed(1);
  }

  function rect(r, fill, stroke) {
    ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a || 0);
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.6; ctx.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h); }
    ctx.restore();
  }
  function drawCar(c, body, player) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
    var w = c.w, h = c.h;
    ctx.fillStyle = '#111'; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
      ctx.save(); ctx.translate(p[0] * (w / 2 - 0.3), p[1] * (h / 2 - 2));
      if (player && p[1] < 0) ctx.rotate(c.steer || 0);
      ctx.fillRect(-0.6, -1.2, 1.2, 2.4); ctx.restore();
    });
    ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-w / 2 + 1, -h / 2); ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, 1.2); ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, 1.2); ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, 1.2); ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, 1.2); ctx.fill();
    ctx.fillStyle = 'rgba(20,28,45,.85)'; ctx.fillRect(-w / 2 + 0.7, -h / 2 + 2, w - 1.4, 2); ctx.fillRect(-w / 2 + 0.8, h / 2 - 2.8, w - 1.6, 1.4);
    if (player) { ctx.fillStyle = '#fff6c2'; ctx.fillRect(-w / 2 + 0.4, -h / 2, 1.2, 0.5); ctx.fillRect(w / 2 - 1.6, -h / 2, 1.2, 0.5); }
    ctx.restore();
  }
  function draw() {
    ctx.fillStyle = '#0b0d1a'; ctx.fillRect(0, 0, view.W, view.H);
    ctx.save(); ctx.translate(OX, OY); ctx.scale(S, S);
    ctx.fillStyle = '#2a2e38'; ctx.fillRect(0, 0, P.W, P.H);
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 0.3;
    for (var y = 0; y < P.H; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(P.W, y); ctx.stroke(); }
    if (g) {
      var ok = g.inBay;
      rect(g.bay, ok ? 'rgba(61,220,132,.35)' : 'rgba(61,220,132,.15)', '#3ddc84');
      ctx.save(); ctx.translate(g.bay.x, g.bay.y); ctx.rotate(g.bay.a); ctx.fillStyle = 'rgba(61,220,132,.7)'; ctx.font = '900 5px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('P', 0, 0); ctx.restore();
      g.def.obstacles.forEach(function (o) { if (o.parked) drawCar(o, '#5a6478'); else rect(o, '#474d5e', '#6b7394'); });
      drawCar(g.car, g.state === 'crashed' ? '#ff4d6d' : '#ffb020', true);
      if (g.hold > 0) { ctx.strokeStyle = '#3ddc84'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(g.car.x, g.car.y, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, g.hold / 0.6)); ctx.stroke(); }
    }
    ctx.restore();
  }

  var last = performance.now();
  function frame(now) { var dt = Math.min(0.033, (now - last) / 1000); last = now; if (mode === 'play') update(dt); draw(); requestAnimationFrame(frame); }
  window.addEventListener('resize', resize);
  resize(); buildLevelList(); screens.show('title');
  requestAnimationFrame(frame);
  window.GLDebug = { state: function () { return g ? { mode: mode, level: levelIdx, state: g.state, x: g.car.x, y: g.car.y, a: g.car.a, speed: g.car.speed, time: g.time } : { mode: mode }; } };
  K.ready();
})();
