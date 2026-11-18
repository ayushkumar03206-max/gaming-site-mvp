/* Space Shooter: vertical wave shooter with bosses. Canvas 2D, synthesised sounds. */
(function () {
  'use strict';
  var K = window.GLKit, L = window.ShooterLogic, $ = K.$;
  K.init('Space Shooter');
  var canvas = $('c'), ctx = canvas.getContext('2d');
  if (!ctx || !L) { K.fail('Your browser could not start the game canvas.'); return; }

  var view = { W: 1, H: 1 }, S = 1, OX = 0, OY = 0;
  function resize() {
    view = K.fitCanvas(canvas, ctx);
    var top = 52; S = Math.min(view.W / L.W, (view.H - top) / L.H);
    OX = (view.W - L.W * S) / 2; OY = top + (view.H - top - L.H * S) / 2;
  }
  var stars = []; for (var i = 0; i < 90; i++) stars.push({ x: Math.random() * L.W, y: Math.random() * L.H, z: 0.3 + Math.random() * 0.7 });

  var WCOL = { blaster: '#29f0ff', spread: '#b6ff3b', pulse: '#ff3fb4' };
  var PCOL = { blaster: ['#29f0ff', 'B'], spread: ['#b6ff3b', 'S'], pulse: ['#ff3fb4', 'P'], repair: ['#3ddc84', '+'], shield: ['#7aa2ff', 'O'] };
  var ECOL = { drone: '#ff7a3d', zig: '#ffd23f', tank: '#b66dff' };
  var mode = 'title', g = null, keys = {}, drag = null, autoFire = K.load('gl_shooter_autofire', true), fx = [], banner = null;
  var best = K.best('gl_shooter_best'), screens = K.screens(['title', 'paused', 'over']);

  function syncBest() { $('bestTitle').textContent = best.get() ? 'Your best: ' + best.get() : ''; }
  function syncAuto() { $('autoBtn').setAttribute('aria-pressed', String(autoFire)); $('autoBtn').textContent = 'Auto-fire: ' + (autoFire ? 'on' : 'off'); }
  $('autoBtn').addEventListener('click', function () { autoFire = !autoFire; K.save('gl_shooter_autofire', autoFire); syncAuto(); });

  function start() {
    g = L.createGame(); keys = {}; drag = null; fx = []; banner = null;
    mode = 'play'; screens.show(null); $('hud').hidden = false; last = performance.now();
    try { canvas.focus(); } catch (e) { /* ignore */ }
  }
  function pause() { if (mode !== 'play') return; mode = 'paused'; keys = {}; drag = null; screens.show('paused'); }
  function resume() { if (mode !== 'paused') return; mode = 'play'; screens.show(null); last = performance.now(); }
  function finish() {
    mode = 'over'; var isBest = best.submit(g.score);
    $('finalScore').textContent = g.score; $('oWave').textContent = g.wave; $('oKills').textContent = g.kills;
    $('overTitle').textContent = isBest && g.score > 0 ? 'New best!' : 'Ship destroyed';
    $('bestOver').textContent = 'Best: ' + best.get(); syncBest();
    K.announce('Ship destroyed on wave ' + g.wave + '. Score ' + g.score + '.');
    setTimeout(function () { if (mode === 'over') screens.show('over'); }, 900);
  }
  $('playBtn').addEventListener('click', start); $('againBtn').addEventListener('click', start); $('restartBtn').addEventListener('click', start);
  $('resumeBtn').addEventListener('click', resume); $('pauseBtn').addEventListener('click', pause);
  K.onRestart(start); K.autoPause(pause); K.muteButton();

  var KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', Space: 'fire' };
  window.addEventListener('keydown', function (e) {
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; if (e.code !== 'Space') drag = null; e.preventDefault(); }
    if (e.code === 'KeyF' && mode === 'play') { autoFire = !autoFire; K.save('gl_shooter_autofire', autoFire); syncAuto(); K.announce('Auto-fire ' + (autoFire ? 'on' : 'off')); }
    if (e.code === 'KeyP' || e.code === 'Escape') { if (mode === 'play') pause(); else if (mode === 'paused') resume(); }
    if ((e.code === 'Enter' || e.code === 'KeyR') && mode === 'over') start();
  });
  window.addEventListener('keyup', function (e) { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
  function world(e) { return { x: (e.clientX - OX) / S, y: (e.clientY - OY) / S }; }
  canvas.addEventListener('pointerdown', function (e) {
    if (mode !== 'play') return;
    var p = world(e); drag = { id: e.pointerId, fx: p.x, fy: p.y, sx: g.ship.x, sy: g.ship.y, mouse: e.pointerType === 'mouse' };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var p = world(e), gain = drag.mouse ? 1 : 1.3;
    drag.tx = drag.sx + (p.x - drag.fx) * gain; drag.ty = drag.sy + (p.y - drag.fy) * gain;
  });
  function endDrag(e) { if (drag && e.pointerId === drag.id) drag = null; }
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

  function boom(x, y, c, n) { n = K.reduceMotion ? Math.ceil(n / 3) : n; for (var i = 0; i < n; i++) { var a = Math.random() * 6.28, sp = K.rand(8, 40); fx.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: K.rand(0.3, 0.7), c: c }); } }

  function update(dt) {
    var input = { firing: autoFire || keys.fire };
    if (drag && drag.tx != null) { input.targetX = drag.tx; input.targetY = drag.ty; }
    else { input.dx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0); input.dy = (keys.d ? 1 : 0) - (keys.u ? 1 : 0); }
    var ev = L.step(g, dt, input), shot = false;
    ev.forEach(function (e) {
      if (e.type === 'shoot') shot = true;
      else if (e.type === 'kill') { boom(e.x, e.y, ECOL[e.enemy], 12); K.sound.play('pop'); }
      else if (e.type === 'boom') { boom(e.x, e.y, '#ff7a3d', 16); K.sound.play('boom'); }
      else if (e.type === 'hurt') { K.sound.play('hit'); }
      else if (e.type === 'shieldBreak') K.sound.play('blip');
      else if (e.type === 'pickup') { K.sound.play('power'); banner = { t: e.kind === 'repair' ? 'Repair +35' : e.kind === 'shield' ? 'Shield up' : e.kind.toUpperCase() + ' Lv ' + g.wlevel, age: 0 }; }
      else if (e.type === 'wave') { banner = { t: e.boss ? 'WAVE ' + e.wave + ' — BOSS' : 'WAVE ' + e.wave, age: 0 }; K.announce(banner.t); if (e.boss) K.sound.play('lose'); }
      else if (e.type === 'bossDown') { boom(e.x, e.y, '#ffd23f', 60); boom(e.x, e.y, '#ff3fb4', 40); K.sound.play('win'); }
      else if (e.type === 'dead') { boom(g.ship.x, g.ship.y, '#29f0ff', 50); K.sound.play('boom'); finish(); }
    });
    if (shot && Math.random() < 0.5) K.sound.play('shoot');
    $('hScore').textContent = g.score; $('hWave').textContent = g.wave;
    $('hHp').style.width = (g.ship.hp / L.MAX_HP * 100) + '%';
    $('hWeapon').textContent = g.weapon.charAt(0).toUpperCase() + g.weapon.slice(1) + ' ' + g.wlevel; $('hWeapon').style.color = WCOL[g.weapon];
  }

  function ship(x, y, inv) {
    if (inv > 0 && Math.floor(inv * 20) % 2) return;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#29f0ff'; ctx.beginPath(); ctx.moveTo(0, -4.5); ctx.lineTo(3.6, 3.4); ctx.lineTo(0, 2); ctx.lineTo(-3.6, 3.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8fbff'; ctx.beginPath(); ctx.ellipse(0, -0.8, 0.9, 1.6, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = Math.random() < 0.5 ? '#ffb020' : '#ff5d3a'; ctx.beginPath(); ctx.moveTo(-1.2, 2.6); ctx.lineTo(0, 5 + Math.random() * 1.5); ctx.lineTo(1.2, 2.6); ctx.fill();
    ctx.restore();
  }
  function enemy(e) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.fillStyle = ECOL[e.type];
    if (e.type === 'drone') { ctx.beginPath(); ctx.moveTo(0, e.r); ctx.lineTo(e.r, -e.r * 0.6); ctx.lineTo(-e.r, -e.r * 0.6); ctx.closePath(); ctx.fill(); }
    else if (e.type === 'zig') { ctx.beginPath(); ctx.moveTo(0, e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, -e.r); ctx.lineTo(-e.r, 0); ctx.closePath(); ctx.fill(); }
    else { ctx.fillRect(-e.r, -e.r * 0.7, e.r * 2, e.r * 1.4); ctx.fillStyle = '#2a1a44'; ctx.fillRect(-1, 0, 2, e.r); }
    ctx.fillStyle = 'rgba(5,6,14,.6)'; ctx.beginPath(); ctx.arc(0, -e.r * 0.1, e.r * 0.3, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  function bossDraw(b) {
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.fillStyle = b.phase ? '#ff3f6c' : '#b66dff';
    ctx.beginPath(); ctx.moveTo(-b.r * 1.4, -b.r * 0.4); ctx.lineTo(-b.r * 0.6, -b.r); ctx.lineTo(b.r * 0.6, -b.r); ctx.lineTo(b.r * 1.4, -b.r * 0.4); ctx.lineTo(b.r * 0.8, b.r * 0.8); ctx.lineTo(-b.r * 0.8, b.r * 0.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, b.r * 0.35, 0, 6.283); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#2b3266'; ctx.fillRect(15, 3, 70, 2.4); ctx.fillStyle = '#ff3f6c'; ctx.fillRect(15, 3, 70 * Math.max(0, b.hp / b.maxHp), 2.4);
  }

  function draw() {
    ctx.fillStyle = '#04050c'; ctx.fillRect(0, 0, view.W, view.H);
    ctx.save(); ctx.translate(OX, OY); ctx.scale(S, S);
    ctx.beginPath(); ctx.rect(0, 0, L.W, L.H); ctx.clip();
    ctx.fillStyle = '#070a1c'; ctx.fillRect(0, 0, L.W, L.H);
    stars.forEach(function (s) { ctx.fillStyle = 'rgba(200,210,255,' + (0.2 + s.z * 0.6) + ')'; ctx.fillRect(s.x, s.y, 0.35 * s.z + 0.15, 0.35 * s.z + 0.15); });
    if (g) {
      g.pickups.forEach(function (p) { var st = PCOL[p.type]; ctx.fillStyle = st[0]; ctx.beginPath(); ctx.arc(p.x, p.y, 2.8, 0, 6.283); ctx.fill(); ctx.fillStyle = '#05060e'; ctx.font = '900 3.2px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(st[1], p.x, p.y + 0.2); });
      g.enemies.forEach(enemy);
      if (g.boss) bossDraw(g.boss);
      ctx.fillStyle = WCOL[g.weapon];
      g.bullets.forEach(function (b) { if (b.pierce) { ctx.beginPath(); ctx.arc(b.x, b.y, 1.3, 0, 6.283); ctx.fill(); } else ctx.fillRect(b.x - 0.4, b.y - 1.8, 0.8, 3.6); });
      ctx.fillStyle = '#ff4d6d'; g.ebullets.forEach(function (b) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill(); });
      if (!g.over) { ship(g.ship.x, g.ship.y, g.ship.inv); if (g.ship.shield > 0) { ctx.strokeStyle = 'rgba(122,162,255,.8)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(g.ship.x, g.ship.y, 6, 0, 6.283); ctx.stroke(); } }
    }
    fx.forEach(function (q) { ctx.globalAlpha = Math.max(0, 1 - q.age / q.life); ctx.fillStyle = q.c; ctx.fillRect(q.x - 0.4, q.y - 0.4, 0.8, 0.8); });
    ctx.globalAlpha = 1;
    if (banner) { ctx.globalAlpha = Math.max(0, 1 - banner.age / 1.6); ctx.fillStyle = '#fff'; ctx.font = '900 6px system-ui'; ctx.textAlign = 'center'; ctx.fillText(banner.t, L.W / 2, L.H * 0.4); ctx.globalAlpha = 1; }
    ctx.restore();
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (mode === 'play') update(dt);
    stars.forEach(function (s) { s.y += s.z * 10 * dt; if (s.y > L.H) { s.y = 0; s.x = Math.random() * L.W; } });
    for (var i = fx.length - 1; i >= 0; i--) { var q = fx[i]; q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.age > q.life) fx.splice(i, 1); }
    if (banner) { banner.age += dt; if (banner.age > 1.6) banner = null; }
    draw();
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  resize(); syncBest(); syncAuto(); screens.show('title');
  requestAnimationFrame(frame);
  window.GLDebug = { state: function () { return g ? { mode: mode, wave: g.wave, hp: g.ship.hp, score: g.score, kills: g.kills, x: g.ship.x, weapon: g.weapon } : { mode: mode }; } };
  K.ready();
})();
