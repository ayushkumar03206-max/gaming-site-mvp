// Smoke tests for every game built on the shared kit (games/_kit). Same setup as browser.e2e.js:
//   BASE_URL=http://localhost:8765/ node --test tests/e2e/kit-games.e2e.js
// Build with --preview-pending to include games whose rights review is pending.
// Emulated viewports in desktop Chrome, NOT real Android/iOS devices.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const BASE = (process.env.BASE_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
const CHANNEL = process.env.PW_CHANNEL || 'chrome';
const ROOT = path.resolve(__dirname, '..', '..');
const LEGACY = new Set(['pathforge', 'neon-dodge', 'chroma-shift']); // covered by browser.e2e.js
const ONLY = process.env.GAMES ? process.env.GAMES.split(',') : null;
const GAMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'games.json'), 'utf8')).games
  .map(g => g.slug).filter(s => !LEGACY.has(s) && (!ONLY || ONLY.includes(s)));
const VIEWPORTS = {
  desktop: { viewport: { width: 1366, height: 900 } },
  mobile: { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
  narrow: { viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
};

/** Real input checks per game (desktop only): drive the game with mouse/keyboard and assert an effect. */
async function frameBox(page) { return page.locator('[data-player] iframe').boundingBox(); }
const INTERACT = {
  'highway-rush': async (page, frame) => {
    const x0 = (await frame.evaluate(() => GLDebug.state())).x;
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(250); await page.keyboard.up('ArrowRight');
    const x1 = (await frame.evaluate(() => GLDebug.state())).x;
    assert.ok(x1 > x0 || (await frame.evaluate(() => GLDebug.state())).mode === 'over', `steered right ${x0} -> ${x1}`);
  },
  'brick-breaker': async (page, frame) => {
    await page.keyboard.press('Space'); await page.waitForTimeout(2500);
    const st = await frame.evaluate(() => GLDebug.state());
    assert.ok(st.score > 0 || st.lives < 3, 'ball launched and interacted: ' + JSON.stringify(st));
  },
  'space-shooter': async (page, frame) => {
    // wave 1 arrives in columns; auto-fire is on by default. Sweep left and right with the keyboard.
    for (let i = 0; i < 8; i++) {
      const key = i % 2 ? 'ArrowRight' : 'ArrowLeft';
      await page.keyboard.down(key); await page.waitForTimeout(i === 0 ? 120 : 280); await page.keyboard.up(key);
      await page.waitForTimeout(500);
    }
    const st = await frame.evaluate(() => GLDebug.state());
    assert.ok(st.wave >= 1 && (st.kills > 0 || st.score > 0), 'auto-fire destroyed enemies: ' + JSON.stringify(st));
  },
  'memory-match': async (page, frame) => {
    // one deliberate miss, then click every pair for real
    const pairs = await frame.evaluate(() => GLDebug.pairsOf());
    const a = pairs.indexOf(0), b = pairs.indexOf(1);
    await frame.click(`.card[data-i="${a}"]`); await frame.click(`.card[data-i="${b}"]`);
    await page.waitForTimeout(1100);
    assert.strictEqual((await frame.evaluate(() => GLDebug.state())).moves, 1);
    const seen = {};
    pairs.forEach((p, i) => (seen[p] = seen[p] || []).push(i));
    for (const [x, y] of Object.values(seen)) { await frame.click(`.card[data-i="${x}"]`); await frame.click(`.card[data-i="${y}"]`); }
    await frame.waitForSelector('#over:not([hidden])', { timeout: 5000 });
    const st = await frame.evaluate(() => GLDebug.state());
    assert.ok(st.over && st.matched === st.pairs, JSON.stringify(st));
  },
  'tic-tac-toe': async (page, frame) => {
    // vs computer (medium by default): play the first free cell until the round ends
    for (let i = 0; i < 6; i++) {
      const st = await frame.evaluate(() => GLDebug.state());
      if (st.winner) break;
      await frame.waitForFunction(() => { const s = GLDebug.state(); return s.winner || s.turn === s.human; });
      const s2 = await frame.evaluate(() => GLDebug.state());
      if (s2.winner) break;
      await frame.click(`.cell[data-i="${s2.board.indexOf(null)}"]`);
    }
    await frame.waitForFunction(() => !!GLDebug.state().winner, null, { timeout: 5000 });
    const end = await frame.evaluate(() => GLDebug.state());
    assert.strictEqual(end.scores.X + end.scores.O + end.scores.D, 1, JSON.stringify(end));
    await frame.click('#nextBtn');
    assert.strictEqual((await frame.evaluate(() => GLDebug.state())).winner, null);
  },
  'fruit-slice': async (page, frame) => {
    const b = await frameBox(page);
    for (let i = 0; i < 30; i++) {
      const y = b.y + b.height * (0.25 + (i % 5) * 0.12);
      await page.mouse.move(b.x + 5, y); await page.mouse.down();
      await page.mouse.move(b.x + b.width - 5, y, { steps: 12 }); await page.mouse.up();
      if ((await frame.evaluate(() => GLDebug.state())).sliced > 0) break;
    }
    assert.ok((await frame.evaluate(() => GLDebug.state())).sliced > 0, 'mouse swipe sliced fruit');
  }
};

let browser;
test.before(async () => { browser = await chromium.launch({ channel: CHANNEL, headless: true }); });
test.after(async () => { if (browser) await browser.close(); });

async function open(kind) {
  const ctx = await browser.newContext(VIEWPORTS[kind]);
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', r => problems.push('requestfailed: ' + r.url()));
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(BASE)) problems.push('http ' + r.status() + ': ' + r.url()); });
  return { ctx, page, problems };
}

async function launch(page, slug) {
  const res = await page.goto(BASE + 'games/' + slug + '/index.html');
  assert.strictEqual(res.status(), 200, slug + ' page');
  await page.click('[data-play]');
  await page.waitForFunction(() => document.querySelector('[data-state=loading]').hidden, null, { timeout: 20000 });
  assert.strictEqual(await page.isHidden('[data-state=error]'), true, 'launcher error state for ' + slug);
  const handle = await page.waitForSelector('[data-player] iframe');
  const frame = await handle.contentFrame();
  assert.ok(frame && new RegExp('/play/' + slug + '/').test(frame.url()), 'iframe for ' + slug);
  await frame.waitForFunction(() => !!window.GLDebug);
  return frame;
}

for (const slug of GAMES) {
  for (const kind of Object.keys(VIEWPORTS)) {
    test(`${slug} loads, starts and runs [${kind}]`, async () => {
      const { ctx, page, problems } = await open(kind);
      try {
        const frame = await launch(page, slug);
        // the title screen's start button must be visible and inside the game frame (reachable without scrolling the panel)
        const start = frame.locator('[data-start]').first();
        await start.waitFor({ state: 'visible' });
        const fit = await frame.evaluate(() => {
          const r = document.querySelector('[data-start]').getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: innerWidth, h: innerHeight };
        });
        assert.ok(fit.left >= 0 && fit.right <= fit.w + 1, 'start button fits horizontally ' + JSON.stringify(fit));
        await start.scrollIntoViewIfNeeded();
        await start.click();
        await page.waitForTimeout(1500);
        const st = await frame.evaluate(() => window.GLDebug && window.GLDebug.state());
        assert.ok(st, 'GLDebug.state() available');
        assert.notStrictEqual(st.mode, 'title', 'game left the title screen: ' + JSON.stringify(st));
        // no horizontal overflow inside the game
        const overflow = await frame.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, 'horizontal overflow ' + overflow + 'px');
        if (INTERACT[slug] && kind === 'desktop') await INTERACT[slug](page, frame);
        if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `${slug}-${kind}.png`) });
        assert.deepStrictEqual(problems, []);
      } finally { await ctx.close(); }
    });
  }
}
