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
  const frame = page.frame({ url: new RegExp('/play/' + slug + '/') });
  assert.ok(frame, 'iframe for ' + slug);
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
        if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `${slug}-${kind}.png`) });
        assert.deepStrictEqual(problems, []);
      } finally { await ctx.close(); }
    });
  }
}
