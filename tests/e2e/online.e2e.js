// Online multiplayer end to end: two separate browser contexts (two "people") play through the site.
// Needs a running multiplayer server and a site build that points at it:
//   cd server && ALLOWED_ORIGINS=http://localhost:8765 PORT=3001 node src/server.js
//   python scripts/build_static_site.py --preview-pending --mp-server http://localhost:3001
//   python scripts/serve.py 8765 dist
//   BASE_URL=http://localhost:8765/ MP_SERVER=http://localhost:3001 node --test tests/e2e/online.e2e.js
// Without MP_SERVER the tests are skipped (reported as skipped, not passed).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright-core');

const BASE = (process.env.BASE_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
const MP = process.env.MP_SERVER;
const CHANNEL = process.env.PW_CHANNEL || 'chrome';
const skip = MP ? false : 'set MP_SERVER to run online tests';

let browser;
// SERVE_DIR: answer requests for BASE from a local build instead of the network. This lets a build that is
// not deployed yet run under the real site origin (e.g. https://user.github.io), which the deployed
// multiplayer server already allows, without adding localhost to its ALLOWED_ORIGINS.
const SERVE_DIR = process.env.SERVE_DIR;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
async function serveLocal(ctx) {
  const fs = require('node:fs'), path = require('node:path');
  await ctx.route(BASE + '**', route => {
    let rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(new URL(BASE).pathname.length));
    let file = path.join(SERVE_DIR, rel);
    if (!rel || rel.endsWith('/') || (fs.existsSync(file) && fs.statSync(file).isDirectory())) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] || 'application/octet-stream' });
  });
}
test.before(async () => {
  if (skip) return;
  browser = await chromium.launch({ channel: CHANNEL, headless: true });
  if (SERVE_DIR) {
    const orig = browser.newContext.bind(browser);
    browser.newContext = async (o) => { const c = await orig(o); await serveLocal(c); return c; };
  }
});
test.after(async () => { if (browser) await browser.close(); });

async function person(kind, url) {
  const ctx = await browser.newContext(kind === 'mobile' ? { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.replace(/\/$/, '') }).catch(() => {});
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(url || BASE + 'games/tic-tac-toe/index.html');
  await page.click('[data-play]');
  const frame = await (await page.waitForSelector('[data-player] iframe')).contentFrame();
  await frame.waitForFunction(() => !!window.GLDebug);
  return { ctx, page, frame, problems };
}
const st = f => f.evaluate(() => GLDebug.state());

test('online tic tac toe: create, join by code, ready, start, play to a win, rematch lobby', { skip }, async () => {
  const host = await person('desktop'), guest = await person('mobile');
  try {
    // online button only appears once /health answers
    await host.frame.waitForSelector('#onlineBtn:not([hidden])', { timeout: 8000 });
    await host.frame.click('#onlineBtn');
    await host.frame.click('[data-mp="create-form"]');
    await host.frame.fill('input[name=name]', 'Host Player');
    await host.frame.click('form[data-mp-form=create] button[type=submit]');
    const code = (await host.frame.textContent('[data-mp-code]', { timeout: 8000 })).trim();
    assert.match(code, /^[A-Z2-9]{6}$/);

    await guest.frame.waitForSelector('#onlineBtn:not([hidden])', { timeout: 8000 });
    await guest.frame.click('#onlineBtn');
    await guest.frame.click('[data-mp="join-form"]');
    // wrong code first: a readable error
    await guest.frame.fill('input[name=roomId]', 'ZZZZZZ');
    await guest.frame.click('form[data-mp-form=join] button[type=submit]');
    await guest.frame.waitForFunction(() => /not found/i.test(document.querySelector('[data-mp-error]').textContent));
    await guest.frame.fill('input[name=roomId]', code.toLowerCase());
    await guest.frame.fill('input[name=name]', 'Guest Player');
    await guest.frame.click('form[data-mp-form=join] button[type=submit]');
    await guest.frame.waitForSelector('[data-mp-code]');

    // host sees the guest; start is locked until both are ready
    await host.frame.waitForFunction(() => document.querySelectorAll('.mp-seat .mp-avatar:not(.empty)').length === 2);
    assert.ok(await host.frame.isDisabled('[data-mp="start"]'));
    assert.strictEqual(await guest.frame.$('[data-mp="start"]'), null, 'guest has no start button');
    await host.frame.click('[data-mp="ready"]');
    await guest.frame.click('[data-mp="ready"]');
    await host.frame.waitForSelector('[data-mp="start"]:not([disabled])');
    await host.frame.click('[data-mp="start"]');

    // both get the same match after the countdown
    await host.frame.waitForFunction(() => GLDebug.state().opp === 'online' && GLDebug.state().roomStatus === 'playing', null, { timeout: 8000 });
    await guest.frame.waitForFunction(() => GLDebug.state().opp === 'online', null, { timeout: 8000 });
    const h = await st(host.frame), g = await st(guest.frame);
    assert.strictEqual(h.room, g.room);
    assert.deepStrictEqual([h.human, g.human], ['X', 'O'], 'host is X in match 1');

    // guest cannot move out of turn: the click is ignored and the board stays empty
    await guest.frame.click('.cell[data-i="4"]', { force: true });
    await host.page.waitForTimeout(300);
    assert.deepStrictEqual((await st(host.frame)).board.filter(Boolean), []);

    const play = async (p, cell) => {
      const before = (await st(p.frame)).board.filter(Boolean).length;
      await p.frame.click(`.cell[data-i="${cell}"]`);
      await host.frame.waitForFunction(n => GLDebug.state().board.filter(Boolean).length > n, before);
      await guest.frame.waitForFunction(n => GLDebug.state().board.filter(Boolean).length > n, before);
    };
    await play(host, 0); await play(guest, 3); await play(host, 1); await play(guest, 4); await play(host, 2);
    await host.frame.waitForFunction(() => GLDebug.state().roomStatus === 'finished');
    await guest.frame.waitForFunction(() => GLDebug.state().roomStatus === 'finished');
    assert.match(await host.frame.textContent('#status'), /You won/);
    assert.match(await guest.frame.textContent('#status'), /Host Player won/);
    assert.strictEqual((await st(guest.frame)).scores.O, 0);
    assert.strictEqual((await st(host.frame)).scores.X, 1);

    // back to the room for a rematch: marks swap
    await host.frame.click('#nextBtn'); await guest.frame.click('#nextBtn');
    await host.frame.click('[data-mp="ready"]'); await guest.frame.click('[data-mp="ready"]');
    await host.frame.waitForSelector('[data-mp="start"]:not([disabled])');
    await host.frame.click('[data-mp="start"]');
    await guest.frame.waitForFunction(() => GLDebug.state().roomStatus === 'playing' && GLDebug.state().human === 'X', null, { timeout: 8000 });
    assert.deepStrictEqual([...host.problems, ...guest.problems].filter(p => !/favicon/.test(p)), []);
  } finally { await host.ctx.close(); await guest.ctx.close(); }
});

test('online: invite link opens the join form with the code filled in; leaving frees the seat', { skip }, async () => {
  const host = await person('desktop');
  try {
    await host.frame.waitForSelector('#onlineBtn:not([hidden])', { timeout: 8000 });
    await host.frame.click('#onlineBtn');
    await host.frame.click('[data-mp="create-form"]');
    await host.frame.click('form[data-mp-form=create] button[type=submit]');
    const code = (await host.frame.textContent('[data-mp-code]', { timeout: 8000 })).trim();
    const guest = await person('desktop', BASE + 'games/tic-tac-toe/index.html#join=' + code);
    try {
      await guest.frame.waitForSelector('form[data-mp-form=join]', { timeout: 8000 });
      assert.strictEqual(await guest.frame.inputValue('input[name=roomId]'), code);
      await guest.frame.click('form[data-mp-form=join] button[type=submit]');
      await host.frame.waitForFunction(() => document.querySelectorAll('.mp-seat .mp-avatar:not(.empty)').length === 2);
      await guest.frame.click('[data-mp="leave"]');
      await host.frame.waitForFunction(() => document.querySelectorAll('.mp-seat .mp-avatar.empty').length === 1);
    } finally { await guest.ctx.close(); }
  } finally { await host.ctx.close(); }
});

test('online: without a reachable server the online button is never usable and ends hidden (no fake multiplayer)', { skip }, async () => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { window.GL_MP_WAKE_MS = 6000; }); // shorten the cold-start wait
  const page = await ctx.newPage();
  await page.route(MP.replace(/\/$/, '') + '/health', r => r.abort());
  await page.goto(BASE + 'games/tic-tac-toe/index.html');
  await page.click('[data-play]');
  const frame = await (await page.waitForSelector('[data-player] iframe')).contentFrame();
  await frame.waitForFunction(() => !!window.GLDebug);
  // while it may still be waking: either hidden or disabled, never clickable
  for (let i = 0; i < 6; i++) {
    assert.ok(await frame.evaluate(() => { const b = document.getElementById('onlineBtn'); return b.hidden || b.disabled; }));
    await page.waitForTimeout(1000);
  }
  await frame.waitForSelector('#onlineBtn[hidden]', { state: 'attached', timeout: 20000 });
  await ctx.close();
});

test('online chess: server-checked moves to checkmate; a page reload mid-game resumes the same match', { skip }, async () => {
  const host = await person('desktop', BASE + 'games/chess/index.html'), guest = await person('desktop', BASE + 'games/chess/index.html');
  try {
    await host.frame.waitForSelector('#onlineBtn:not([hidden])', { timeout: 8000 });
    await host.frame.click('#onlineBtn'); await host.frame.click('[data-mp="create-form"]');
    await host.frame.click('form[data-mp-form=create] button[type=submit]');
    const code = (await host.frame.textContent('[data-mp-code]', { timeout: 8000 })).trim();
    await guest.frame.waitForSelector('#onlineBtn:not([hidden])', { timeout: 8000 });
    await guest.frame.click('#onlineBtn'); await guest.frame.click('[data-mp="join-form"]');
    await guest.frame.fill('input[name=roomId]', code); await guest.frame.click('form[data-mp-form=join] button[type=submit]');
    await host.frame.click('[data-mp="ready"]'); await guest.frame.click('[data-mp="ready"]');
    await host.frame.waitForSelector('[data-mp="start"]:not([disabled])'); await host.frame.click('[data-mp="start"]');
    await guest.frame.waitForFunction(() => GLDebug.state().roomStatus === 'playing', null, { timeout: 8000 });
    await host.frame.waitForFunction(() => GLDebug.state().roomStatus === 'playing', null, { timeout: 8000 });
    assert.strictEqual((await st(host.frame)).human, 'w');

    const move = async (p, from, to, n) => {
      await p.frame.click(`[data-sq="${from}"]`); await p.frame.click(`[data-sq="${to}"]`);
      await host.frame.waitForFunction(k => GLDebug.state().moves.length === k, n);
    };
    await move(host, 'f2', 'f3', 1);
    // guest reloads the whole page in the middle of the game
    await guest.page.reload();
    await guest.page.click('[data-play]');
    guest.frame = await (await guest.page.waitForSelector('[data-player] iframe')).contentFrame();
    await guest.frame.waitForSelector('#onlineBtn:not([hidden])', { timeout: 8000 });
    await guest.frame.click('#onlineBtn');
    await guest.frame.waitForFunction(() => GLDebug.state().opp === 'online' && GLDebug.state().moves.length === 1, null, { timeout: 8000 });
    assert.strictEqual((await st(guest.frame)).human, 'b', 'same seat after reload');
    await move(guest, 'e7', 'e5', 2);
    await move(host, 'g2', 'g4', 3);
    // an illegal attempt by the guest changes nothing
    await guest.frame.click('[data-sq="e5"]'); await guest.frame.click('[data-sq="e3"]');
    await move(guest, 'd8', 'h4', 4);
    await host.frame.waitForFunction(() => GLDebug.state().roomStatus === 'finished');
    const end = await st(host.frame);
    assert.deepStrictEqual(end.moves, ['f3', 'e5', 'g4', 'Qh4#']);
    assert.deepStrictEqual(end.result, { winnerSeat: 1, reason: 'checkmate' });
    await guest.frame.waitForSelector('#over:not([hidden])');
    assert.match(await guest.frame.textContent('#overTitle'), /You won/);
  } finally { await host.ctx.close(); await guest.ctx.close(); }
});

test('sleeping server (free host cold start): button shows a waking state, then enables', { skip }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  let fails = 3; // the first /health checks fail, like a host that is still waking up
  await ctx.route('**/health', route => (fails-- > 0 ? route.abort('connectionrefused') : route.continue()));
  try {
    await page.goto(BASE + 'games/chess/index.html');
    await page.click('[data-play]');
    const frame = await (await page.waitForSelector('[data-player] iframe')).contentFrame();
    await frame.waitForSelector('#onlineBtn:not([hidden])[disabled]', { timeout: 10000 });
    assert.match(await frame.textContent('#onlineBtn'), /Starting online server/);
    await frame.waitForSelector('#onlineBtn:not([hidden]):not([disabled])', { timeout: 30000 });
    assert.strictEqual((await frame.textContent('#onlineBtn')).trim(), 'Play with a friend online');
  } finally { await ctx.close(); }
});
