/* Tower Builder: tap to drop sliding blocks and stack the tallest tower. Solo, or 2-4 players taking turns on one tower. Canvas 2D. */
(function () {
  'use strict';
  var K = window.GLKit, T = window.TowerLogic, $ = K.$;
  K.init('Tower Builder');
  var canvas = $('c'), ctx = canvas.getContext('2d');
  if (!ctx || !T) { K.fail('Your browser could not start the game canvas.'); return; }

  var view = { W: 1, H: 1 }, S = 1, OX = 0, FH = 1; // FH = floor height in px
  function resize() { view = K.fitCanvas(canvas, ctx); S = Math.min(view.W / T.W, 6); OX = (view.W - T.W * S) / 2; FH = Math.max(14, Math.min(34, view.H / 16)); }

  var mode = 'title', g = null, cam = 0, falling = [], flashes = [], best = K.best('gl_tower_best');
  var screens = K.screens(['title', 'over']);
  var pick = K.party.picker($('partyPick'), 'gl_tower_players', 4, syncParty), players = 1, turn = 0, pts = [0, 0, 0, 0];
  function syncParty() { $('partyHint').hidden = pick.get() === 1; $('playBtn').textContent = pick.get() === 1 ? 'Build' : 'Build together'; }

  function hue(i) { return (200 + i * 9) % 360; }
  function syncBest() { $('bestTitle').textContent = best.get() ? 'Your best: ' + best.get() + ' points' : ''; }
  function start() {
    g = T.createGame(); cam = 0; falling = []; flashes = [];
    players = pick.get(); turn = 0; pts = [0, 0, 0, 0]; K.party.hide();
    mode = 'play'; screens.show(null); $('hud').hidden = false; hud();
    last = performance.now(); try { canvas.focus(); } catch (e) { /* ignore */ }
    K.announce(players > 1 ? players + ' players, one tower. Player 1 drops first.' : 'Tap, click or press Space to drop each block.');
  }
  function hud() {
    $('hFloors').textContent = T.height(g); $('hScore').textContent = players > 1 ? pts[turn] : g.score; $('hStreak').textContent = g.streak > 1 ? '×' + g.streak : '–';
    var t = $('hTurn'); t.hidden = players === 1;
    if (players > 1) { t.textContent = 'P' + (turn + 1) + ' drops'; t.style.borderColor = t.style.color = K.party.COLORS[turn]; }
  }
  function finishParty() {
    mode = 'over';
    var rows = T.partyRank(pts.slice(0, players), turn);
    var top = rows.filter(function (r) { return r.place === 1; });
    K.sound.play('lose'); K.announce('Player ' + (turn + 1) + ' missed.');
    setTimeout(function () {
      if (mode !== 'over') return;
      K.party.results({
        title: top.length > 1 ? top.map(function (r) { return 'P' + (r.player + 1); }).join(' & ') + ' share the win!' : 'Player ' + (top[0].player + 1) + ' wins!',
        rows: rows.map(function (r) { return { player: r.player, place: r.place, value: r.points + ' pts', note: r.out ? 'Missed the tower' : '' }; }),
        again: 'Build again', onAgain: start, back: 'Change players', onBack: function () { mode = 'title'; $('hud').hidden = true; screens.show('title'); }
      });
    }, 900);
  }
  function finish() {
    if (players > 1) return finishParty();
    mode = 'over'; var isBest = best.submit(g.score);
    $('finalScore').textContent = g.score; $('oFloors').textContent = T.height(g); $('oPerfect').textContent = g.perfects; $('oStreak').textContent = g.bestStreak;
    $('overTitle').textContent = isBest && g.score > 0 ? 'New best!' : 'Tower complete';
    $('bestOver').textContent = 'Best: ' + best.get(); syncBest();
    K.sound.play('lose'); K.announce('Missed. ' + T.height(g) + ' floors, ' + g.score + ' points.');
    setTimeout(function () { if (mode === 'over') screens.show('over'); }, 900);
  }
  function drop() {
    if (mode !== 'play') return;
    var before = g.score, r = T.drop(g), top = T.height(g);
    if (players > 1) pts[turn] += g.score - before;
    if (r.result === 'perfect') { K.sound.play('coin'); flashes.push({ floor: top, age: 0 }); K.announce('Perfect! Streak ' + r.streak); }
    else if (r.result === 'cut') { K.sound.play('place'); falling.push({ x: r.cut.x, w: r.cut.w, floor: top, y: 0, vy: 0, vr: (r.cut.x > r.kept.x ? 1 : -1) * 1.5, rot: 0, h: hue(top) }); }
    else if (r.result === 'miss') { falling.push({ x: r.cut.x, w: r.cut.w, floor: top + 1, y: 0, vy: 0, vr: 0.8, rot: 0, h: hue(top + 1) }); finish(); }
    if (players > 1 && r.result !== 'miss' && r.result !== 'none') { turn = (turn + 1) % players; K.announce('Player ' + (turn + 1) + ' next.'); }
    hud();
  }
  $('playBtn').addEventListener('click', start); $('againBtn').addEventListener('click', start);
  K.onRestart(start); K.muteButton();
  canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); drop(); });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown') { e.preventDefault(); if (mode === 'play') drop(); else if (mode === 'over' && e.code === 'Enter') start(); }
  });

  function blockY(floor) { return view.H * 0.72 - (floor - cam) * FH; }
  function drawBlock(x, w, floor, h, alpha) {
    var px = OX + x * S, pw = w * S, py = blockY(floor);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = 'hsl(' + h + ' 70% 55%)'; ctx.fillRect(px, py - FH, pw, FH);
    ctx.fillStyle = 'hsl(' + h + ' 70% 68%)'; ctx.fillRect(px, py - FH, pw, FH * 0.22);
    ctx.fillStyle = 'hsl(' + h + ' 60% 40%)'; ctx.fillRect(px, py - FH * 0.15, pw, FH * 0.15);
    ctx.globalAlpha = 1;
  }

  function update(dt) {
    T.step(g, dt);
    var target = Math.max(0, T.height(g) - 6);
    cam += (target - cam) * Math.min(1, dt * 4);
  }
  function draw() {
    var H = view.H, sky = ctx.createLinearGradient(0, 0, 0, H), lvl = g ? Math.min(1, T.height(g) / 40) : 0;
    sky.addColorStop(0, 'hsl(' + (230 - lvl * 40) + ' 50% ' + (14 + lvl * 6) + '%)'); sky.addColorStop(1, '#0b0d1a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, view.W, H);
    // ground
    var gy = blockY(0);
    ctx.fillStyle = '#1b2a1f'; ctx.fillRect(0, gy, view.W, H - gy);
    if (!g) { drawBlock((T.W - T.START_W) / 2, T.START_W, 0, hue(0)); return; }
    g.floors.forEach(function (f, i) { var y = blockY(i); if (y > -FH && y < H + FH) drawBlock(f.x, f.w, i, hue(i)); });
    if (g.moving && mode === 'play') {
      drawBlock(g.moving.x, g.moving.w, g.floors.length, hue(g.floors.length));
      if (players > 1) { // outline the sliding block in the colour of the player whose turn it is
        ctx.strokeStyle = K.party.COLORS[turn]; ctx.lineWidth = 3;
        ctx.strokeRect(OX + g.moving.x * S, blockY(g.floors.length) - FH, g.moving.w * S, FH);
      }
    }
    falling.forEach(function (p) {
      var px = OX + p.x * S, pw = p.w * S, py = blockY(p.floor) + p.y;
      ctx.save(); ctx.translate(px + pw / 2, py - FH / 2); ctx.rotate(p.rot);
      ctx.fillStyle = 'hsl(' + p.h + ' 70% 55%)'; ctx.fillRect(-pw / 2, -FH / 2, pw, FH); ctx.restore();
    });
    flashes.forEach(function (f) {
      var fl = g.floors[f.floor]; if (!fl) return;
      ctx.strokeStyle = 'rgba(255,255,255,' + (1 - f.age / 0.5) + ')'; ctx.lineWidth = 3;
      var grow = f.age * 30; ctx.strokeRect(OX + fl.x * S - grow, blockY(f.floor) - FH - grow / 3, fl.w * S + grow * 2, FH + grow * 2 / 3);
    });
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (mode === 'play') update(dt);
    for (var i = falling.length - 1; i >= 0; i--) { var p = falling[i]; p.vy += 1600 * dt; p.y += p.vy * dt; p.rot += p.vr * dt; if (p.y > view.H * 1.5) falling.splice(i, 1); }
    for (var j = flashes.length - 1; j >= 0; j--) { flashes[j].age += dt; if (flashes[j].age > 0.5) flashes.splice(j, 1); }
    draw();
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', resize);
  resize(); syncBest(); syncParty(); screens.show('title');
  requestAnimationFrame(frame);
  window.GLDebug = {
    state: function () { return g ? { mode: mode, floors: T.height(g), score: g.score, streak: g.streak, over: g.over, width: g.floors[g.floors.length - 1].w, players: players, turn: turn, points: pts.slice(0, players) } : { mode: mode }; },
    offset: function () { return g && g.moving ? g.moving.x - g.floors[g.floors.length - 1].x : null; } // QA helper for timing drops
  };
  K.ready();
})();
