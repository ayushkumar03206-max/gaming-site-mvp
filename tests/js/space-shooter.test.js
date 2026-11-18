'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const L = require(path.resolve(__dirname, '..', '..', 'games', 'space-shooter', 'shooter-logic.js'));

test('shooter: weapons fire the documented bullet counts per level', () => {
  const counts = { blaster: [1, 2, 3], spread: [3, 5, 7], pulse: [1, 3, 5] };
  for (const w of Object.keys(counts)) for (let lv = 1; lv <= 3; lv++) {
    const s = L.createGame({ seed: 1 }); s.weapon = w; s.wlevel = lv;
    assert.strictEqual(L.fire(s), counts[w][lv - 1], w + ' ' + lv);
  }
});

test('shooter: pickups switch, upgrade (max 3), repair and shield', () => {
  const s = L.createGame({ seed: 1 });
  L.applyPickup(s, 'blaster'); L.applyPickup(s, 'blaster'); L.applyPickup(s, 'blaster');
  assert.strictEqual(s.wlevel, 3);
  L.applyPickup(s, 'spread'); assert.strictEqual(s.weapon, 'spread'); assert.strictEqual(s.wlevel, 3);
  s.ship.hp = 50; L.applyPickup(s, 'repair'); assert.strictEqual(s.ship.hp, 85);
  L.applyPickup(s, 'repair'); assert.strictEqual(s.ship.hp, L.MAX_HP);
  L.applyPickup(s, 'shield'); const ev = []; L.damageShip(s, 50, ev);
  assert.strictEqual(s.ship.hp, L.MAX_HP); assert.strictEqual(ev[0].type, 'shieldBreak');
});

test('shooter: waves start, every 5th is a boss', () => {
  assert.ok(L.isBossWave(5) && L.isBossWave(10) && !L.isBossWave(4));
  const s = L.createGame({ seed: 2 });
  for (let i = 1; i <= 5; i++) { s.enemies = []; s.boss = null; L.startWave(s); }
  assert.strictEqual(s.wave, 5); assert.ok(s.boss); assert.strictEqual(s.enemies.length, 0);
});

test('shooter: shooting enemies scores and clears the wave, next wave follows', () => {
  const s = L.createGame({ seed: 3 });
  let waves = 0;
  for (let t = 0; t < 60 * 90 && s.wave < 4 && !s.over; t++) {
    // keep the ship under the lowest on-screen enemy and fire; invulnerable test pilot
    const tgt = s.enemies.filter(e => e.y > 0).sort((a, b) => b.y - a.y)[0];
    s.ship.inv = 1;
    const ev = L.step(s, 1 / 60, { targetX: tgt ? tgt.x : 50, targetY: 130, firing: true });
    waves += ev.filter(e => e.type === 'wave').length;
  }
  assert.ok(s.wave >= 4, 'reached wave 4, got ' + s.wave);
  assert.ok(s.kills > 20 && s.score > 0);
});

test('shooter: boss can be defeated and drops a repair', () => {
  const s = L.createGame({ seed: 4 });
  s.wave = 4; L.startWave(s);
  s.weapon = 'pulse'; s.wlevel = 3;
  let down = false;
  for (let t = 0; t < 60 * 120 && !down; t++) {
    s.ship.inv = 1;
    const ev = L.step(s, 1 / 60, { targetX: s.boss ? s.boss.x : 50, targetY: 130, firing: true });
    down = ev.some(e => e.type === 'bossDown');
  }
  assert.ok(down, 'boss defeated');
  assert.ok(s.pickups.some(p => p.type === 'repair'));
});

test('shooter: damage ends the game at 0 hp', () => {
  const s = L.createGame({ seed: 5 });
  const ev = [];
  for (let i = 0; i < 20 && !s.over; i++) { s.ship.inv = 0; L.damageShip(s, 12, ev); }
  assert.ok(s.over); assert.strictEqual(s.ship.hp, 0);
  assert.deepStrictEqual(L.step(s, 0.1, {}), []);
});
