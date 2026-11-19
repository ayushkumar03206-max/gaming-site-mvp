// Several players on ONE device (GLKit.party): Memory Match 2-4, Tower Builder 2-4 (shared tower),
// Car Parking 2-4 (pass and play), Snake Arena 2 (two snakes, one arena). Same setup as the other e2e files:
//   BASE_URL=http://localhost:8765/ node --test tests/e2e/party.e2e.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright-core');

const BASE = (process.env.BASE_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
const CHANNEL = process.env.PW_CHANNEL || 'chrome';

let browser;
test.before(async () => { browser = await chromium.launch({ channel: CHANNEL }); });
test.after(async () => { if (browser) await browser.close(); });

async function openGame(slug, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts || { viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + 'games/' + slug + '/index.html');
  await page.click('[data-play]');
  const frame = await (await page.waitForSelector('[data-player] iframe')).contentFrame();
  await frame.waitForFunction(() => !!(window.GLKit && window.GLDebug));
  return { ctx, page, frame, errors };
}
const st = f => f.evaluate(() => GLDebug.state());
const rankRows = f => f.$$eval('#gl-party-res .party-rank li', ls => ls.map(l => l.textContent.replace(/\s+/g, ' ').trim()));

test('site: game pages advertise the real local player counts', async () => {
  const { ctx, page } = await openGame('memory-match');
  assert.match(await page.textContent('body'), /2–4 players on one device/);
  await page.goto(BASE + 'games/snake-arena/index.html');
  assert.match(await page.textContent('body'), /Single player · 2 players on one device/);
  await ctx.close();
});

test('memory match: 3 players rotate turns and get a ranking', async () => {
  const { ctx, page, frame, errors } = await openGame('memory-match');
  await frame.click('[data-players="3"]');
  await frame.click('[data-start]');
  const pairs = await frame.evaluate(() => GLDebug.pairsOf());
  const seen = {}; pairs.forEach((p, i) => (seen[p] = seen[p] || []).push(i));
  assert.ok(await frame.isVisible('#pP3') && await frame.isHidden('#pP4'), 'three score pills');
  // a miss passes the turn from P1 to P2
  await frame.click(`.card[data-i="${seen[0][0]}"]`); await frame.click(`.card[data-i="${seen[1][0]}"]`);
  await frame.waitForFunction(() => GLDebug.state().turn === 1, null, { timeout: 3000 });
  assert.match(await frame.textContent('#turn'), /Player 2/);
  for (const [a, b] of Object.values(seen)) { await frame.click(`.card[data-i="${a}"]`); await frame.click(`.card[data-i="${b}"]`); }
  await frame.waitForSelector('#over:not([hidden]) #rank li');
  const rows = await frame.$$eval('#rank li', ls => ls.map(l => l.textContent));
  assert.strictEqual(rows.length, 3);
  assert.match(await frame.textContent('#overTitle'), /Player 2 wins/);
  assert.deepStrictEqual(errors, []);
  await ctx.close();
});

test('tower builder: 2 players alternate drops on one tower; the player who misses loses', async () => {
  const { ctx, page, frame, errors } = await openGame('tower-builder');
  await frame.click('[data-party="2"]');
  await frame.click('[data-start]');
  await page.waitForTimeout(300);
  // a near-perfect drop for each player
  for (let i = 0; i < 2; i++) {
    await frame.waitForFunction(() => Math.abs(GLDebug.offset()) < 4, null, { timeout: 8000, polling: 'raf' });
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
  }
  let s = await st(frame);
  assert.strictEqual(s.floors, 2); assert.strictEqual(s.turn, 0, 'back to player 1');
  assert.ok(s.points[0] > 0 && s.points[1] > 0, JSON.stringify(s));
  // now force a miss. At full width the slider never clears the tower, so first make big cuts to narrow the
  // block, then press when it is clear. Key latency can turn an attempt into a cut, which just passes the turn.
  let loser = null;
  for (let tries = 0; tries < 25 && loser === null; tries++) {
    const w = (await st(frame)).width;
    const target = w < 20 ? w + 3 : w * 0.6;
    const ok = await frame.waitForFunction(t => Math.abs(GLDebug.offset()) > t, target, { timeout: 4000, polling: 'raf' }).then(() => true, () => false);
    if (!ok) continue;
    const who = (await st(frame)).turn;
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    if ((await st(frame)).over) loser = who;
  }
  assert.notStrictEqual(loser, null, 'a miss happened');
  await frame.waitForSelector('#gl-party-res:not([hidden])', { timeout: 5000 });
  assert.match(await frame.textContent('#gl-party-res h2'), new RegExp('Player ' + (2 - loser) + ' wins'));
  const rows = await rankRows(frame);
  assert.strictEqual(rows.length, 2); assert.match(rows[1], new RegExp('Player ' + (loser + 1) + '.*Missed the tower'));
  await frame.click('#gl-party-res [data-again]');
  s = await st(frame); assert.strictEqual(s.mode, 'play'); assert.strictEqual(s.turn, 0);
  assert.deepStrictEqual(errors, []);
  await ctx.close();
});

test('car parking: 3 players take turns on the same level, then a ranking', async () => {
  const { ctx, page, frame, errors } = await openGame('car-parking');
  await frame.click('[data-party="3"]');
  await frame.click('[data-start]');
  assert.match(await frame.textContent('#hTurn'), /P1/);
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(400); await page.keyboard.up('ArrowUp');
  await frame.evaluate(() => GLDebug.finish(true));
  await frame.waitForSelector('#gl-party:not([hidden])');
  assert.match(await frame.textContent('#gl-party'), /Next: Player 2/);
  await frame.click('#gl-party [data-go]');
  assert.strictEqual((await st(frame)).cur, 1); assert.strictEqual((await st(frame)).level, 0, 'same level');
  await frame.evaluate(() => GLDebug.finish(false));
  await frame.waitForSelector('#gl-party:not([hidden])');
  await frame.click('#gl-party [data-go]');
  await page.waitForTimeout(1500); // player 3 takes longer than player 1
  await frame.evaluate(() => GLDebug.finish(true));
  await frame.waitForSelector('#gl-party-res:not([hidden])');
  const rows = await rankRows(frame);
  assert.strictEqual(rows.length, 3);
  assert.match(rows[2], /Player 2.*Crashed/);
  // the winner is whichever parked player had the lower recorded time
  const runs = (await st(frame)).runs, fastest = runs[0].time <= runs[2].time ? 1 : 3;
  assert.match(await frame.textContent('#gl-party-res h2'), new RegExp('Player ' + fastest + ' wins'), JSON.stringify(runs));
  assert.match(rows[0], new RegExp('Player ' + fastest));
  assert.deepStrictEqual(errors, []);
  await ctx.close();
});

test('snake arena: 2 players on one keyboard, round result and win tally', async () => {
  const { ctx, page, frame, errors } = await openGame('snake-arena');
  await frame.click('[data-party="2"]');
  await frame.click('[data-start]');
  await page.waitForTimeout(200);
  let s = await st(frame);
  assert.ok(s.versus && s.snakes.length === 2);
  await page.keyboard.press('KeyW'); // player 1 turns up into the top wall; player 2 keeps going left
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150); await page.keyboard.press('ArrowLeft');
  await frame.waitForSelector('#gl-party-res:not([hidden])', { timeout: 15000 });
  assert.match(await frame.textContent('#gl-party-res h2'), /Player 2 wins the round/);
  s = await st(frame); assert.deepStrictEqual(s.wins, [0, 1]);
  await frame.click('#gl-party-res [data-again]');
  s = await st(frame); assert.strictEqual(s.mode, 'play'); assert.deepStrictEqual(s.wins, [0, 1], 'tally kept between rounds');
  assert.deepStrictEqual(errors, []);
  await ctx.close();
});

test('snake arena: 2 players on a phone get one pad each, pads steer the right snake', async () => {
  const { ctx, frame, errors } = await openGame('snake-arena', { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await frame.click('[data-party="2"]');
  await frame.click('[data-start]');
  assert.ok(await frame.isVisible('#vpad1') && await frame.isVisible('#vpad2') && await frame.isHidden('#pad'));
  const box1 = await frame.locator('#vpad1').boundingBox(), box2 = await frame.locator('#vpad2').boundingBox();
  assert.ok(box1.x + box1.width < box2.x, 'pads do not overlap');
  await frame.locator('#vpad2 [data-d="up"]').dispatchEvent('pointerdown');
  await frame.waitForFunction(() => GLDebug.state().snakes[1].dir === 'up', null, { timeout: 4000 });
  assert.strictEqual((await st(frame)).snakes[0].dir, 'right', 'player 1 unaffected');
  assert.deepStrictEqual(errors, []);
  await ctx.close();
});
