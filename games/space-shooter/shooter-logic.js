/* Space Shooter simulation (pure logic). World is 100 x 150 units, y grows downward.
 * Waves of enemies; every 5th wave is a boss. Three weapons (blaster, spread, pulse), each upgradable to level 3.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShooterLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var W = 100, H = 150, SHIP_Y = 132, SHIP_R = 3.2, MAX_HP = 100;
  var WEAPONS = {
    blaster: { every: 0.14, dmg: 1, speed: 150 },
    spread: { every: 0.24, dmg: 1, speed: 125 },
    pulse: { every: 0.42, dmg: 4, speed: 105, pierce: true }
  };
  var ENEMY = {
    drone: { hp: 2, r: 3.2, speed: 20, score: 10, fire: 0 },
    zig: { hp: 3, r: 3.4, speed: 24, score: 20, fire: 2.8 },
    tank: { hp: 8, r: 4.6, speed: 12, score: 40, fire: 2.0 }
  };
  var PICKUPS = ['blaster', 'spread', 'pulse', 'repair', 'shield'];

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function createGame(opts) {
    opts = opts || {};
    var s = { ship: { x: W / 2, y: SHIP_Y, hp: MAX_HP, shield: 0, inv: 0 }, weapon: 'blaster', wlevel: 1, cool: 0,
      bullets: [], ebullets: [], enemies: [], pickups: [], boss: null, wave: 0, waveDelay: 1.2, score: 0, kills: 0, over: false, time: 0,
      rng: opts.rng || (opts.seed != null ? mulberry(opts.seed) : Math.random) };
    return s;
  }

  function isBossWave(n) { return n > 0 && n % 5 === 0; }

  function startWave(s) {
    s.wave++;
    var n = s.wave, rng = s.rng;
    if (isBossWave(n)) {
      var hp = 60 + n * 14;
      s.boss = { x: W / 2, y: -14, ty: 26, hp: hp, maxHp: hp, r: 11, t: 0, fire: 0, phase: 0 };
      return;
    }
    var count = Math.min(6 + n * 2, 22), types = n < 2 ? ['drone'] : n < 4 ? ['drone', 'zig'] : ['drone', 'zig', 'tank'];
    for (var i = 0; i < count; i++) {
      var type = types[Math.floor(rng() * types.length)], d = ENEMY[type], col = i % 6;
      s.enemies.push({ type: type, x: 12 + col * 15.2 + (rng() - 0.5) * 4, y: -8 - Math.floor(i / 6) * 12 - rng() * 6,
        hp: d.hp + Math.floor(n / 6), r: d.r, vy: d.speed * (1 + n * 0.04), phase: rng() * 6.28, fire: d.fire ? d.fire * (0.5 + rng()) : 0 });
    }
  }

  function fire(s) {
    var w = WEAPONS[s.weapon], lv = s.wlevel, x = s.ship.x, y = s.ship.y - 4, out = [];
    function b(dx, vx) { out.push({ x: x + dx, y: y, vx: vx, vy: -w.speed, dmg: w.dmg, pierce: !!w.pierce, hit: [] }); }
    if (s.weapon === 'blaster') { if (lv === 1) b(0, 0); else if (lv === 2) { b(-1.6, 0); b(1.6, 0); } else { b(-2.4, 0); b(0, 0); b(2.4, 0); } }
    else if (s.weapon === 'spread') { var n = 1 + lv * 2, spread = 18 + lv * 6; for (var i = 0; i < n; i++) b(0, (i - (n - 1) / 2) * (spread / ((n - 1) / 2 || 1))); }
    else { b(0, 0); if (lv >= 2) { b(-3, -6); b(3, 6); } if (lv >= 3) { b(-5, -14); b(5, 14); } }
    s.bullets = s.bullets.concat(out);
    return out.length;
  }

  function damageShip(s, dmg, ev) {
    if (s.ship.inv > 0) return;
    if (s.ship.shield > 0) { s.ship.shield = 0; s.ship.inv = 0.8; ev.push({ type: 'shieldBreak' }); return; }
    s.ship.hp = Math.max(0, s.ship.hp - dmg); s.ship.inv = 0.6; ev.push({ type: 'hurt', hp: s.ship.hp });
    if (s.wlevel > 1 && dmg >= 20) s.wlevel--; // heavy hits knock a weapon level off
    if (s.ship.hp <= 0) { s.over = true; ev.push({ type: 'dead' }); }
  }

  function hit(a, b, r) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy < r * r; }

  function aimAt(s, x, y, speed) {
    var dx = s.ship.x - x, dy = s.ship.y - y, L = Math.hypot(dx, dy) || 1;
    return { x: x, y: y, vx: dx / L * speed, vy: dy / L * speed, r: 1.3 };
  }

  /** input: {targetX, targetY} (absolute) or {dx, dy} in -1..1, plus firing:boolean. */
  function step(s, dt, input) {
    var ev = [];
    if (s.over) return ev;
    input = input || {};
    s.time += dt;
    var sh = s.ship;
    if (input.targetX != null) { sh.x += Math.max(-110 * dt, Math.min(110 * dt, input.targetX - sh.x)); sh.y += Math.max(-110 * dt, Math.min(110 * dt, input.targetY - sh.y)); }
    else { sh.x += (input.dx || 0) * 80 * dt; sh.y += (input.dy || 0) * 80 * dt; }
    sh.x = Math.max(4, Math.min(W - 4, sh.x)); sh.y = Math.max(H * 0.45, Math.min(H - 5, sh.y));
    sh.inv = Math.max(0, sh.inv - dt); sh.shield = Math.max(0, sh.shield - dt);
    s.cool -= dt;
    if (input.firing && s.cool <= 0) { fire(s); s.cool = WEAPONS[s.weapon].every; ev.push({ type: 'shoot' }); }

    // waves
    if (!s.enemies.length && !s.boss) { s.waveDelay -= dt; if (s.waveDelay <= 0) { startWave(s); s.waveDelay = 1.6; ev.push({ type: 'wave', wave: s.wave, boss: !!s.boss }); } }

    // bullets
    for (var i = s.bullets.length - 1; i >= 0; i--) {
      var b = s.bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -5 || b.x < -5 || b.x > W + 5) { s.bullets.splice(i, 1); continue; }
      var gone = false;
      for (var j = s.enemies.length - 1; j >= 0 && !gone; j--) {
        var e = s.enemies[j];
        if (e.y < -2 || b.hit.indexOf(e) >= 0 || !hit(b, e, e.r + 1)) continue;
        e.hp -= b.dmg; b.hit.push(e);
        if (!b.pierce) gone = true;
        if (e.hp <= 0) killEnemy(s, j, ev);
      }
      if (!gone && s.boss && s.boss.y > 0 && b.hit.indexOf(s.boss) < 0 && hit(b, s.boss, s.boss.r + 1)) {
        s.boss.hp -= b.dmg; b.hit.push(s.boss); if (!b.pierce) gone = true; ev.push({ type: 'bossHit' });
        if (s.boss.hp <= 0) {
          s.score += 500 + s.wave * 50; ev.push({ type: 'bossDown', x: s.boss.x, y: s.boss.y });
          s.pickups.push({ x: s.boss.x - 6, y: s.boss.y, type: 'repair' }, { x: s.boss.x + 6, y: s.boss.y, type: PICKUPS[Math.floor(s.rng() * 3)] });
          s.boss = null;
        }
      }
      if (gone) s.bullets.splice(i, 1);
    }

    // enemies
    for (var k = s.enemies.length - 1; k >= 0; k--) {
      var en = s.enemies[k];
      en.y += en.vy * dt; en.phase += dt * 2;
      if (en.type === 'zig') en.x += Math.cos(en.phase) * 22 * dt;
      en.x = Math.max(en.r, Math.min(W - en.r, en.x));
      if (en.fire && en.y > 0) { en.fire -= dt; if (en.fire <= 0) { s.ebullets.push(aimAt(s, en.x, en.y + en.r, 45 + s.wave * 1.5)); en.fire = ENEMY[en.type].fire * (0.7 + s.rng() * 0.6); } }
      if (hit(en, sh, en.r + SHIP_R * 0.8)) { s.enemies.splice(k, 1); damageShip(s, en.type === 'tank' ? 34 : 22, ev); ev.push({ type: 'boom', x: en.x, y: en.y }); continue; }
      if (en.y > H + 8) s.enemies.splice(k, 1); // escaped: no points
    }

    // boss
    var bo = s.boss;
    if (bo) {
      bo.t += dt;
      if (bo.y < bo.ty) bo.y += 18 * dt;
      else {
        bo.x = W / 2 + Math.sin(bo.t * 0.8) * 30;
        bo.phase = bo.hp < bo.maxHp / 2 ? 1 : 0;
        bo.fire -= dt;
        if (bo.fire <= 0) {
          var sp = 50 + s.wave;
          if (bo.phase === 0) { for (var a = -2; a <= 2; a++) s.ebullets.push({ x: bo.x, y: bo.y + 8, vx: a * 12, vy: sp, r: 1.5 }); bo.fire = 1.3; }
          else { s.ebullets.push(aimAt(s, bo.x - 6, bo.y + 8, sp * 1.2), aimAt(s, bo.x + 6, bo.y + 8, sp * 1.2)); for (var c = 0; c < 8; c++) { var ang = bo.t * 2 + c * Math.PI / 4; s.ebullets.push({ x: bo.x, y: bo.y, vx: Math.cos(ang) * sp * 0.7, vy: Math.abs(Math.sin(ang)) * sp * 0.7 + 10, r: 1.3 }); } bo.fire = 1.6; }
          ev.push({ type: 'bossFire' });
        }
      }
      if (hit(bo, sh, bo.r + SHIP_R * 0.8)) damageShip(s, 30, ev);
    }

    // enemy bullets
    for (var q = s.ebullets.length - 1; q >= 0; q--) {
      var eb = s.ebullets[q]; eb.x += eb.vx * dt; eb.y += eb.vy * dt;
      if (hit(eb, sh, eb.r + SHIP_R * 0.7)) { s.ebullets.splice(q, 1); damageShip(s, 12, ev); continue; }
      if (eb.y > H + 4 || eb.y < -10 || eb.x < -4 || eb.x > W + 4) s.ebullets.splice(q, 1);
    }

    // pickups
    for (var p = s.pickups.length - 1; p >= 0; p--) {
      var pk = s.pickups[p]; pk.y += 22 * dt;
      if (hit(pk, sh, SHIP_R + 3)) { applyPickup(s, pk.type); s.pickups.splice(p, 1); ev.push({ type: 'pickup', kind: pk.type }); }
      else if (pk.y > H + 4) s.pickups.splice(p, 1);
    }
    return ev;
  }

  function killEnemy(s, j, ev) {
    var e = s.enemies[j];
    s.enemies.splice(j, 1); s.kills++; s.score += ENEMY[e.type].score;
    ev.push({ type: 'kill', x: e.x, y: e.y, enemy: e.type });
    if (s.rng() < (e.type === 'tank' ? 0.35 : 0.07)) s.pickups.push({ x: e.x, y: e.y, type: PICKUPS[Math.floor(s.rng() * PICKUPS.length)] });
  }

  function applyPickup(s, type) {
    if (WEAPONS[type]) { if (s.weapon === type) s.wlevel = Math.min(3, s.wlevel + 1); else { s.weapon = type; s.wlevel = Math.max(1, s.wlevel); } }
    else if (type === 'repair') s.ship.hp = Math.min(MAX_HP, s.ship.hp + 35);
    else if (type === 'shield') s.ship.shield = 12;
    s.score += 15;
  }

  return { W: W, H: H, MAX_HP: MAX_HP, WEAPONS: WEAPONS, ENEMY: ENEMY, PICKUPS: PICKUPS, createGame: createGame, step: step,
    startWave: startWave, fire: fire, applyPickup: applyPickup, isBossWave: isBossWave, damageShip: damageShip };
});
