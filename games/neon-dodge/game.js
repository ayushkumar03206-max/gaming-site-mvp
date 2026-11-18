/* Neon Dodge: endless survival arcade game. Canvas 2D, no assets. */
(function () {
  'use strict';
  var L = window.NeonLogic;
  var BEST_KEY = 'gl_neon_dodge_best';
  var $ = function (id) { return document.getElementById(id); };
  function post(m) { try { if (window.parent !== window) window.parent.postMessage(m, '*'); } catch (e) { /* ignore */ } }
  window.addEventListener('error', function (ev) { post({ type: 'gl:error', message: 'Neon Dodge error: ' + ev.message }); });

  var canvas = $('c'), ctx = canvas.getContext('2d');
  if (!ctx || !L) { post({ type: 'gl:error', message: 'Your browser could not start the game canvas.' }); return; }

  var W = 0, H = 0, U = 1, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    U = Math.min(W, H) / 100;
    if (player) { player.x = L.clamp(player.x, 0, W); player.y = L.clamp(player.y, 0, H); }
  }

  // ---------------- state ----------------
  var mode = 'title'; // title | play | paused | over
  var player, things, particles, t, bonus, timers, best, stars, shake;
  try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) { best = 0; }

  function reset() {
    player = { x: W / 2, y: H * 0.75, vx: 0, vy: 0, r: 2.4 * U, tx: null, ty: null };
    things = []; particles = []; t = 0; bonus = 0; shake = 0;
    timers = { bar: 0.6, shard: 2, laser: 3, core: 2.5 };
  }
  function makeStars() {
    stars = [];
    for (var i = 0; i < 70; i++) stars.push({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7 });
  }

  // ---------------- spawning ----------------
  function rand(a, b) { return a + Math.random() * (b - a); }
  function spawnBar(d) {
    var w = rand(12, 30) * U;
    things.push({ k: 'bar', x: rand(-w * 0.3, W - w * 0.7), y: -4 * U, w: w, h: 2.6 * U, vy: d.barSpeed * U * rand(0.85, 1.15) });
  }
  function spawnShard(d) {
    var left = Math.random() < 0.5, sp = (d.barSpeed * 0.9) * U;
    things.push({ k: 'shard', x: left ? -4 * U : W + 4 * U, y: rand(0.1, 0.7) * H, vx: left ? sp : -sp, vy: rand(-0.2, 0.35) * sp, r: 2.6 * U, a: 0, va: rand(3, 6) });
  }
  function spawnLaser(d) {
    var horiz = Math.random() < 0.6;
    // aim near the player so lasers matter, but never exactly on them
    var pos = horiz ? L.clamp(player.y + rand(-18, 18) * U, 4 * U, H - 4 * U) : L.clamp(player.x + rand(-18, 18) * U, 4 * U, W - 4 * U);
    things.push({ k: 'laser', horiz: horiz, pos: pos, warn: d.laserWarn, life: d.laserWarn + 0.45, age: 0, th: 2.2 * U });
  }
  function spawnCore() {
    things.push({ k: 'core', x: rand(0.1, 0.9) * W, y: -3 * U, vy: 14 * U, r: 1.8 * U, a: 0 });
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = rand(10, 45) * U;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.8), age: 0, c: color });
    }
  }

  // ---------------- input ----------------
  var keys = {};
  var KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
  window.addEventListener('keydown', function (e) {
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); player.tx = null; }
    if ((e.code === 'KeyP' || e.code === 'Escape') && (mode === 'play' || mode === 'paused')) togglePause();
    if ((e.code === 'Enter' || e.code === 'KeyR') && mode === 'over') start();
    if ((e.code === 'Enter' || e.code === 'Space') && mode === 'title') { e.preventDefault(); start(); }
  });
  window.addEventListener('keyup', function (e) { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });

  var drag = null;
  canvas.addEventListener('pointerdown', function (e) {
    if (mode !== 'play') return;
    drag = { id: e.pointerId, fx: e.clientX, fy: e.clientY, px: player.x, py: player.y };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var gain = e.pointerType === 'mouse' ? 1 : 1.25;
    player.tx = L.clamp(drag.px + (e.clientX - drag.fx) * gain, 0, W);
    player.ty = L.clamp(drag.py + (e.clientY - drag.fy) * gain, 0, H);
  });
  function endDrag(e) { if (drag && e.pointerId === drag.id) { drag = null; player.tx = null; } }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---------------- flow ----------------
  function show(id) { ['title', 'paused', 'over'].forEach(function (x) { $(x).hidden = x !== id; }); $('pauseBtn').hidden = id !== null; }
  function start() { reset(); mode = 'play'; show(null); keys = {}; last = performance.now(); }
  function togglePause() {
    if (mode === 'play') { mode = 'paused'; show('paused'); $('resumeBtn').focus(); }
    else if (mode === 'paused') { mode = 'play'; show(null); last = performance.now(); }
  }
  function gameOver() {
    mode = 'over';
    var s = L.score(t, bonus), isBest = s > best;
    if (isBest) { best = s; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ } }
    $('finalScore').textContent = s;
    $('overTitle').textContent = isBest && s > 0 ? 'New best!' : 'Crashed!';
    $('bestOver').textContent = 'Best: ' + best;
    setTimeout(function () { if (mode === 'over') { show('over'); $('againBtn').focus(); } }, 650);
  }
  $('playBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);
  $('restartBtn').addEventListener('click', start);
  $('resumeBtn').addEventListener('click', togglePause);
  $('pauseBtn').addEventListener('click', togglePause);
  document.addEventListener('visibilitychange', function () { if (document.hidden && mode === 'play') togglePause(); });
  window.addEventListener('blur', function () { if (mode === 'play') togglePause(); });
  window.addEventListener('message', function (ev) { if (ev.data && ev.data.type === 'gl:restart') start(); });

  // ---------------- update ----------------
  function update(dt) {
    var d = L.difficulty(t);
    t += dt;
    // player
    var acc = 70 * U;
    if (player.tx != null) {
      player.x += (player.tx - player.x) * Math.min(1, dt * 18);
      player.y += (player.ty - player.y) * Math.min(1, dt * 18);
      player.vx = player.vy = 0;
    } else {
      var ax = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), ay = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
      var target = 62 * U;
      player.vx += (ax * target - player.vx) * Math.min(1, dt * 12);
      player.vy += (ay * target - player.vy) * Math.min(1, dt * 12);
      player.x += player.vx * dt; player.y += player.vy * dt;
    }
    player.x = L.clamp(player.x, player.r, W - player.r);
    player.y = L.clamp(player.y, player.r, H - player.r);
    void acc;

    // spawn
    timers.bar -= dt; if (timers.bar <= 0) { spawnBar(d); timers.bar = d.barEvery * rand(0.7, 1.3); }
    if (d.shards) { timers.shard -= dt; if (timers.shard <= 0) { spawnShard(d); timers.shard = d.shardEvery * rand(0.7, 1.3); } }
    if (d.lasers) { timers.laser -= dt; if (timers.laser <= 0) { spawnLaser(d); timers.laser = d.laserEvery * rand(0.8, 1.2); } }
    timers.core -= dt; if (timers.core <= 0) { spawnCore(); timers.core = d.coreEvery * rand(0.8, 1.3); }

    // move + collide
    var p = player, hitR = p.r * 0.82; // slightly forgiving hitbox
    for (var i = things.length - 1; i >= 0; i--) {
      var o = things[i], dead = false;
      if (o.k === 'bar') {
        o.y += o.vy * dt; dead = o.y > H + 10 * U;
        if (L.circleRect(p.x, p.y, hitR, o.x, o.y, o.w, o.h)) return crash();
      } else if (o.k === 'shard') {
        o.x += o.vx * dt; o.y += o.vy * dt; o.a += o.va * dt;
        dead = o.x < -10 * U || o.x > W + 10 * U || o.y > H + 10 * U || o.y < -10 * U;
        if (L.circleCircle(p.x, p.y, hitR, o.x, o.y, o.r * 0.85)) return crash();
      } else if (o.k === 'laser') {
        o.age += dt; dead = o.age >= o.life;
        if (o.age >= o.warn) {
          var dist = o.horiz ? Math.abs(p.y - o.pos) : Math.abs(p.x - o.pos);
          if (dist < o.th / 2 + hitR) return crash();
        }
      } else if (o.k === 'core') {
        o.y += o.vy * dt; o.a += dt * 4; dead = o.y > H + 5 * U;
        if (L.circleCircle(p.x, p.y, p.r * 1.3, o.x, o.y, o.r)) { bonus += 50; burst(o.x, o.y, '#ffd23f', 14); floatText('+50', o.x, o.y); dead = true; }
      }
      if (dead) things.splice(i, 1);
    }
  }
  var floats = [];
  function floatText(txt, x, y) { floats.push({ t: txt, x: x, y: y, age: 0 }); }
  function crash() { burst(player.x, player.y, '#29f0ff', 40); burst(player.x, player.y, '#ff3fb4', 30); shake = 0.35; gameOver(); }

  function updateFx(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var q = particles[i]; q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy *= 0.96;
      if (q.age > q.life) particles.splice(i, 1);
    }
    for (var j = floats.length - 1; j >= 0; j--) { floats[j].age += dt; floats[j].y -= 20 * U * dt; if (floats[j].age > 0.8) floats.splice(j, 1); }
    if (shake > 0) shake -= dt;
  }

  // ---------------- draw ----------------
  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate(rand(-1, 1) * U * shake * 4, rand(-1, 1) * U * shake * 4);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b0d22'); g.addColorStop(1, '#05060e');
    ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
    // grid floor
    ctx.strokeStyle = 'rgba(122,125,255,0.08)'; ctx.lineWidth = 1;
    var gs = 8 * U, off = ((t || 0) * 12 * U) % gs;
    ctx.beginPath();
    for (var gx = 0; gx < W; gx += gs) { ctx.moveTo(gx, 0); ctx.lineTo(gx, H); }
    for (var gy = off - gs; gy < H; gy += gs) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
    ctx.stroke();
    // stars
    stars.forEach(function (s) {
      var y = (s.y * H + (t || 0) * 8 * U * s.z) % H;
      ctx.fillStyle = 'rgba(200,210,255,' + (0.25 + s.z * 0.5) + ')';
      ctx.fillRect(s.x * W, y, 1.5 * s.z + 0.5, 1.5 * s.z + 0.5);
    });

    if (mode !== 'title') {
      things.forEach(function (o) {
        if (o.k === 'bar') glowRect(o.x, o.y, o.w, o.h, '#ff3fb4');
        else if (o.k === 'shard') {
          ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a);
          ctx.shadowColor = '#ff8a3d'; ctx.shadowBlur = 14; ctx.fillStyle = '#ff8a3d';
          ctx.beginPath(); ctx.moveTo(0, -o.r * 1.3); ctx.lineTo(o.r, 0); ctx.lineTo(0, o.r * 1.3); ctx.lineTo(-o.r, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
        } else if (o.k === 'laser') {
          var warn = o.age < o.warn;
          ctx.save();
          if (warn) {
            ctx.globalAlpha = 0.35 + 0.35 * Math.sin(o.age * 28);
            ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 1.5; ctx.setLineDash([2 * U, 1.5 * U]);
          } else {
            ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = o.th; ctx.shadowColor = '#ff4d4d'; ctx.shadowBlur = 22;
          }
          ctx.beginPath();
          if (o.horiz) { ctx.moveTo(0, o.pos); ctx.lineTo(W, o.pos); } else { ctx.moveTo(o.pos, 0); ctx.lineTo(o.pos, H); }
          ctx.stroke();
          if (!warn) { ctx.strokeStyle = '#fff'; ctx.lineWidth = o.th * 0.3; ctx.shadowBlur = 0; ctx.stroke(); }
          ctx.restore();
        } else if (o.k === 'core') {
          ctx.save(); ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 16; ctx.fillStyle = '#ffd23f';
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (1 + 0.12 * Math.sin(o.a)), 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
      });
      if (mode !== 'over' || shake > 0.25) drawPlayer();
    }
    particles.forEach(function (q) {
      ctx.globalAlpha = Math.max(0, 1 - q.age / q.life); ctx.fillStyle = q.c;
      ctx.fillRect(q.x - U * 0.5, q.y - U * 0.5, U, U);
    });
    ctx.globalAlpha = 1;
    floats.forEach(function (f) {
      ctx.globalAlpha = 1 - f.age / 0.8; ctx.fillStyle = '#ffd23f'; ctx.font = '800 ' + Math.round(4 * U) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(f.t, f.x, f.y);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
    if (mode === 'play' || mode === 'paused') hud();
  }

  function glowRect(x, y, w, h, c) {
    ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = 16; ctx.fillStyle = c;
    var r = h / 2;
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.fill();
    ctx.restore();
  }
  function drawPlayer() {
    var p = player;
    ctx.save();
    ctx.shadowColor = '#29f0ff'; ctx.shadowBlur = 24;
    var g = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1, p.x, p.y, p.r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#29f0ff'); g.addColorStop(1, '#0a7f8c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function hud() {
    var d = L.difficulty(t), fs = Math.max(14, Math.round(3.4 * U));
    ctx.font = '800 ' + fs + 'px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.fillText(String(L.score(t, bonus)), 14, 14 + fs);
    ctx.font = '600 ' + Math.round(fs * 0.7) + 'px system-ui, sans-serif'; ctx.fillStyle = '#a3a9d6';
    ctx.fillText('BEST ' + best + '   ·   LEVEL ' + d.level, 14, 22 + fs * 1.7);
  }

  // ---------------- loop ----------------
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode === 'play') update(dt);
    updateFx(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize(); makeStars(); reset();
  $('bestTitle').textContent = best ? 'Your best: ' + best : '';
  show('title'); $('pauseBtn').hidden = true;
  requestAnimationFrame(frame);
  post({ type: 'gl:ready' });
})();
