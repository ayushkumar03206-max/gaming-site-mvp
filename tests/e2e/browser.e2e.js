// Browser end-to-end tests (Playwright + the locally installed Chrome).
//
//   npm install                     # installs playwright-core (no browser download)
//   python scripts/serve.py 8765 dist   (in another terminal, after building; plain http.server drops bursts of requests on Windows)
//   BASE_URL=http://localhost:8765/ node --test tests/e2e/browser.e2e.js
//
// BASE_URL may also be the live site, e.g. https://<owner>.github.io/gaming-site-mvp/
// PW_CHANNEL selects the browser: chrome (default) or msedge.
// These are emulated viewports in desktop Chrome, NOT real Android/iOS devices.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright-core');

const BASE = (process.env.BASE_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
const CHANNEL = process.env.PW_CHANNEL || 'chrome';
const GAMES = ['pathforge', 'neon-dodge', 'chroma-shift'];
const VIEWPORTS = {
  desktop: { viewport: { width: 1366, height: 900 } },
  tablet: { viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  mobile: { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }
};

let browser;
test.before(async () => { browser = await chromium.launch({ channel: CHANNEL, headless: true }); });
test.after(async () => { if (browser) await browser.close(); });

/** New context + page that records console errors, page errors and failed requests. */
async function open(kind) {
  const ctx = await browser.newContext(VIEWPORTS[kind]);
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', r => problems.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText));
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(BASE)) problems.push('http ' + r.status() + ': ' + r.url()); });
  return { ctx, page, problems };
}

async function startGame(page, slug) {
  await page.goto(BASE + 'games/' + slug + '/index.html');
  await page.click('[data-play]');
  await page.waitForSelector('[data-player] iframe');
  // ready = loading overlay hidden AND error overlay hidden
  await page.waitForFunction(() => document.querySelector('[data-state=loading]').hidden, null, { timeout: 20000 });
  assert.strictEqual(await page.isHidden('[data-state=error]'), true, 'error state shown for ' + slug);
  const frame = page.frame({ url: new RegExp('/play/' + slug + '/') });
  assert.ok(frame, 'game iframe for ' + slug);
  return frame;
}

// ---------------------------------------------------------------- site
for (const kind of Object.keys(VIEWPORTS)) {
  test(`site pages load cleanly [${kind}]`, async () => {
    const { ctx, page, problems } = await open(kind);
    const pages = ['index.html', 'games/index.html', 'categories/index.html', 'categories/strategy/index.html',
      'search/index.html?q=puzzle', 'about/index.html', 'contact/index.html', 'privacy/index.html', 'terms/index.html',
      'licensing/index.html', 'faq/index.html'].concat(GAMES.map(g => 'games/' + g + '/index.html'));
    for (const p of pages) {
      const res = await page.goto(BASE + p);
      assert.strictEqual(res.status(), 200, p);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `${p} overflows horizontally by ${overflow}px`);
    }
    assert.deepStrictEqual(problems, []);
    await ctx.close();
  });
}

test('every internal link and asset resolves [desktop]', async () => {
  const { ctx, page } = await open('desktop');
  const seen = new Set(), queue = [BASE + 'index.html'], bad = [];
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const res = await page.goto(url);
    if (!res || res.status() !== 200) { bad.push(url + ' -> ' + (res && res.status())); continue; }
    if (!(res.headers()['content-type'] || '').includes('html')) continue;
    const refs = await page.evaluate(() => [...document.querySelectorAll('a[href], img[src], script[src], link[href]')]
      .map(e => e.href || e.src).filter(Boolean));
    for (const r of refs) {
      const clean = r.split('#')[0].split('?')[0];
      if (clean.startsWith(BASE) && !seen.has(clean)) queue.push(clean);
    }
  }
  assert.deepStrictEqual(bad, []);
  assert.ok(seen.size > 25, 'crawled ' + seen.size);
  await ctx.close();
});

test('custom 404 page is served for unknown URLs', async () => {
  const { ctx, page } = await open('desktop');
  const res = await page.goto(BASE + 'definitely-missing-page/');
  // python http.server does not serve 404.html; GitHub Pages does.
  if (BASE.includes('localhost')) { assert.strictEqual(res.status(), 404); }
  else { assert.match(await page.content(), /This level doesn/); }
  await ctx.close();
});

test('mobile menu opens and closes', async () => {
  const { ctx, page } = await open('mobile');
  await page.goto(BASE + 'index.html');
  assert.ok(await page.isHidden('#main-nav'));
  await page.tap('.menu-btn');
  assert.ok(await page.isVisible('#main-nav a[href$="games/index.html"]'));
  assert.strictEqual(await page.getAttribute('.menu-btn', 'aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('#main-nav'), 'Escape should close the menu');
  await ctx.close();
});

test('search and category filter', async () => {
  const { ctx, page } = await open('desktop');
  await page.goto(BASE + 'search/index.html?q=color');
  await page.waitForSelector('[data-search-results] .card');
  assert.deepStrictEqual(await page.$$eval('[data-search-results] h3', h => h.map(x => x.textContent)), ['Chroma Shift']);
  await page.fill('[data-search-input]', 'zzzz');
  assert.match(await page.textContent('[data-search-count]'), /No games match/);
  await page.goto(BASE + 'games/index.html');
  await page.click('[data-filter="arcade"]');
  const visible = await page.$$eval('[data-filter-grid] .card:not([hidden]) h3', h => h.map(x => x.textContent));
  assert.ok(visible.includes('Neon Dodge'), visible.join());
  assert.ok(!visible.includes('Pathforge') && !visible.includes('Chroma Shift'), 'non-arcade games hidden: ' + visible.join());
  const cats = await page.$$eval('[data-filter-grid] .card:not([hidden])', c => c.map(x => x.getAttribute('data-cats')));
  assert.ok(cats.every(c => c.split(' ').includes('arcade')), 'only arcade cards visible');
  assert.strictEqual(await page.getAttribute('[data-filter="arcade"]', 'aria-pressed'), 'true');
  await ctx.close();
});

// ---------------------------------------------------------------- loading flow
for (const kind of Object.keys(VIEWPORTS)) {
  test(`all games load in the player iframe [${kind}]`, async () => {
    const { ctx, page, problems } = await open(kind);
    for (const slug of GAMES) {
      await startGame(page, slug);
      assert.strictEqual(await page.isEnabled('[data-restart]'), true, 'restart enabled after ready');
    }
    assert.deepStrictEqual(problems, []);
    await ctx.close();
  });
}

test('player shows an error with Retry when a game fails to load (no fake success)', async () => {
  const { ctx, page } = await open('desktop');
  await page.route('**/play/pathforge/pathforge-core.js', r => r.abort());
  await page.goto(BASE + 'games/pathforge/index.html');
  await page.click('[data-play]');
  await page.waitForSelector('[data-state=error]:not([hidden])', { timeout: 20000 });
  assert.ok(await page.isDisabled('[data-restart]'));
  await page.unroute('**/play/pathforge/pathforge-core.js');
  await page.click('[data-retry]');
  await page.waitForFunction(() => document.querySelector('[data-state=loading]').hidden && document.querySelector('[data-state=error]').hidden, null, { timeout: 20000 });
  await ctx.close();
});

test('player detects a wrong game path quickly (not after a 15 s timeout)', async () => {
  const { ctx, page } = await open('desktop');
  // Simulate a wrong/missing game path: the host serves a normal HTML 404 page instead of the game.
  await page.route('**/play/pathforge/index.html', r => r.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html><title>Not found</title><h1>404</h1>' }));
  await page.goto(BASE + 'games/pathforge/index.html');
  const t0 = Date.now();
  await page.click('[data-play]');
  await page.waitForSelector('[data-state=error]:not([hidden])', { timeout: 20000 });
  assert.ok(Date.now() - t0 < 9000, 'error took ' + (Date.now() - t0) + 'ms');
  await ctx.close();
});

test('fullscreen falls back to in-page fullscreen when the API is missing (iPhone-like) [mobile]', async () => {
  const { ctx, page, problems } = await open('mobile');
  await page.addInitScript(() => { delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen; });
  await startGame(page, 'chroma-shift');
  await page.tap('[data-fullscreen]');
  await page.waitForSelector('[data-player].is-pseudo-fs');
  const box = await (await page.$('[data-player]')).boundingBox();
  assert.ok(box.width >= 374 && box.height >= 800, 'player covers the viewport ' + JSON.stringify(box));
  assert.ok(await page.isVisible('[data-exit-fs]'));
  await page.tap('[data-exit-fs]');
  assert.strictEqual(await page.$('[data-player].is-pseudo-fs'), null);
  assert.deepStrictEqual(problems, []);
  await ctx.close();
});

// ---------------------------------------------------------------- Pathforge
test('pathforge: vs AI, move, forge, invalid block, undo, host restart [mobile]', async () => {
  const { ctx, page, problems } = await open('mobile');
  const f = await startGame(page, 'pathforge');
  await f.tap('[data-opp="normal"]');
  await f.tap('#start');
  const before = await f.$$eval('.cell.target', c => c.length);
  assert.ok(before >= 2, 'move targets highlighted');
  await f.tap('.cell.target');
  await f.waitForFunction(() => document.getElementById('turn').textContent === 'Your turn', null, { timeout: 5000 });
  // forge mode: valid cells must be visibly marked (touch has no hover)
  await f.tap('#mode');
  const marked = await f.$$eval('.cell.can-block', c => c.length);
  assert.ok(marked > 10, 'forgeable cells marked');
  const stock0 = await f.textContent('#hud0 .stock');
  // a pawn cell is an invalid block target
  await f.evaluate(() => document.querySelector('.pawn.p1').parentElement.click());
  assert.match(await f.textContent('#msg'), /not empty/);
  await f.tap('.cell.can-block');
  await f.waitForFunction(s => document.querySelector('#hud0 .stock').textContent !== s, stock0);
  await f.waitForFunction(() => document.getElementById('turn').textContent === 'Your turn', null, { timeout: 5000 });
  await f.tap('#undo');
  assert.strictEqual(await f.textContent('#hud0 .stock'), stock0, 'undo restores the block');
  // host restart resets the board
  await page.click('[data-restart]');
  await f.waitForFunction(() => document.querySelectorAll('.cell.block').length === 0);
  assert.deepStrictEqual(problems, []);
  await ctx.close();
});

test('pathforge: two-player mode and keyboard play to a win [desktop]', async () => {
  const { ctx, page, problems } = await open('desktop');
  const f = await startGame(page, 'pathforge');
  await f.click('[data-opp="human"]');
  await f.click('[data-size="7"]');
  await f.click('#start');
  assert.match(await f.textContent('#turn'), /Cyan to play/);
  // race straight: cyan up, magenta sidesteps then down; cyan reaches row 0 first
  const keys = ['ArrowUp', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowUp', 'ArrowDown', 'ArrowUp', 'ArrowDown', 'ArrowUp', 'ArrowDown', 'ArrowUp'];
  for (const k of keys) { await page.keyboard.press(k); }
  await f.waitForSelector('#result:not([hidden])', { timeout: 3000 });
  assert.match(await f.textContent('#result-title'), /Cyan wins/);
  await f.click('#again');
  assert.match(await f.textContent('#turn'), /Cyan to play/);
  assert.deepStrictEqual(problems, []);
  await ctx.close();
});

for (const lvl of ['easy', 'normal', 'hard']) {
  test(`pathforge: full game vs ${lvl} AI finishes with a result [desktop]`, async () => {
    const { ctx, page, problems } = await open('desktop');
    const f = await startGame(page, 'pathforge');
    await f.click(`[data-opp="${lvl}"]`);
    await f.click('#start');
    for (let i = 0; i < 200; i++) {
      if (await f.isVisible('#result')) break;
      await f.waitForFunction(() => document.getElementById('turn').textContent !== 'AI thinking…' || !document.getElementById('result').hidden, null, { timeout: 8000 });
      if (await f.isVisible('#result')) break;
      const path = await f.evaluate(() => {
        const s = document.querySelectorAll('.cell.target');
        // greedily step toward the top row
        let best = null; s.forEach(c => { if (!best || +c.dataset.i < +best.dataset.i) best = c; });
        return best ? +best.dataset.i : -1;
      });
      if (path < 0) break;
      await f.click(`.cell[data-i="${path}"]`);
      await page.waitForTimeout(30);
    }
    await f.waitForSelector('#result:not([hidden])', { timeout: 10000 });
    assert.match(await f.textContent('#result-title'), /win|Draw/i);
    assert.ok(problems.length === 0, problems.join('\n'));
    await ctx.close();
  });
}

// ---------------------------------------------------------------- Neon Dodge
test('neon dodge: start, keyboard move, pause/resume, crash, best score [desktop]', async () => {
  const { ctx, page, problems } = await open('desktop');
  const f = await startGame(page, 'neon-dodge');
  await f.click('#playBtn');
  const hook = await f.evaluate(() => !!window.NeonDodgeDebug);
  assert.ok(hook, 'debug state hook available');
  const x0 = await f.evaluate(() => NeonDodgeDebug.state().x);
  await f.focus('canvas').catch(() => {});
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(400); await page.keyboard.up('ArrowLeft');
  assert.ok((await f.evaluate(() => NeonDodgeDebug.state().x)) < x0 - 10, 'keyboard moves the orb');
  await page.keyboard.press('KeyP');
  assert.ok(await f.isVisible('#paused'));
  const t1 = await f.evaluate(() => NeonDodgeDebug.state().t);
  await page.waitForTimeout(400);
  assert.strictEqual(await f.evaluate(() => NeonDodgeDebug.state().t), t1, 'time frozen while paused');
  await f.click('#resumeBtn');
  await page.waitForTimeout(400);
  assert.ok((await f.evaluate(() => NeonDodgeDebug.state().t)) > t1, 'time resumes');
  await f.evaluate(() => NeonDodgeDebug.crash());
  await f.waitForSelector('#over:not([hidden])', { timeout: 3000 });
  const score = +(await f.textContent('#finalScore'));
  const best = await f.evaluate(() => +localStorage.getItem('gl_neon_dodge_best'));
  assert.ok(best >= score && best > 0, 'best saved');
  await page.keyboard.press('Enter');
  assert.ok(await f.isHidden('#over'));
  assert.strictEqual(await f.evaluate(() => NeonDodgeDebug.state().mode), 'play');
  assert.deepStrictEqual(problems, []);
  await ctx.close();
});

test('neon dodge: touch drag moves the orb; host restart and blur pause [mobile]', async () => {
  const { ctx, page, problems } = await open('mobile');
  const f = await startGame(page, 'neon-dodge');
  await f.tap('#playBtn');
  const box = await (await page.$('[data-player] iframe')).boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const s0 = await f.evaluate(() => NeonDodgeDebug.state());
  const sx = box.x + box.width / 2, sy = box.y + box.height * 0.4;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx - i * 10, y: sy - i * 8 }] });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  const s1 = await f.evaluate(() => NeonDodgeDebug.state());
  assert.ok(s1.x < s0.x - 30 && s1.y < s0.y - 20, `touch drag moved orb ${JSON.stringify([s0.x, s0.y, s1.x, s1.y])}`);
  // host restart starts a fresh run
  await page.waitForTimeout(300);
  await page.click('[data-restart]');
  await f.waitForFunction(() => NeonDodgeDebug.state().t < 0.3 && NeonDodgeDebug.state().mode === 'play');
  assert.deepStrictEqual(problems, []);
  await ctx.close();
});

// ---------------------------------------------------------------- Chroma Shift
test('chroma shift: play, hint, win, stars, progression, save, lose, restart [mobile]', async () => {
  const { ctx, page, problems } = await open('mobile');
  let f = await startGame(page, 'chroma-shift');
  await f.tap('#continueBtn');
  assert.match(await f.textContent('#lvl'), /Level 1/);
  // win level 1 with hints
  for (let i = 0; i < 6; i++) {
    await f.tap('#hintBtn');
    await f.tap('.tile.hint');
    await page.waitForTimeout(500); // result overlay appears after a short celebration delay
    if (await f.isVisible('#result')) break;
  }
  await f.waitForSelector('#result:not([hidden])');
  assert.match(await f.textContent('#resTitle'), /Level clear/);
  assert.strictEqual(await f.$$eval('#resStars', e => e[0].childNodes[0].textContent.length), 2, 'hint caps at 2 stars');
  await f.tap('#resPrimary');
  assert.match(await f.textContent('#lvl'), /Level 2/);
  // move counter + lose: tap one corner tile until the limit
  const limit = +(await f.textContent('#moves')).split('/')[1].trim().split(' ')[0];
  for (let i = 0; i < limit && await f.isHidden('#result'); i++) { await f.tap('.tile >> nth=0'); }
  await f.waitForSelector('#result:not([hidden])');
  const title = await f.textContent('#resTitle');
  assert.ok(/Out of moves|Level clear/.test(title), title);
  // restart (in-game button) resets the counter
  await f.tap('#resSecondary').catch(() => {});
  if (await f.isVisible('#play')) {
    await f.tap('#restartBtn');
    assert.match(await f.textContent('#moves'), /^0 \//);
  }
  // progress persists across reloads
  const saved = await f.evaluate(() => JSON.parse(localStorage.getItem('gl_chroma_shift_v1')));
  assert.ok(saved.unlocked >= 2 && saved.levels['1'].stars === 2);
  f = await startGame(page, 'chroma-shift');
  assert.match(await f.textContent('#continueBtn'), /level 2/);
  assert.strictEqual(await f.$$eval('.lv:not([disabled])', b => b.length), 2);
  assert.deepStrictEqual(problems, []);
  await ctx.close();
});

test('chroma shift: keyboard play [desktop]', async () => {
  const { ctx, page, problems } = await open('desktop');
  const f = await startGame(page, 'chroma-shift');
  await f.click('#continueBtn');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  assert.match(await f.textContent('#moves'), /^1 \//);
  assert.deepStrictEqual(problems, []);
  await ctx.close();
});
