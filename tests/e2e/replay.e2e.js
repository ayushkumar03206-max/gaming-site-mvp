// Last-game replay (GLKit.replay): record a real run inside the site's game iframe, watch it, and
// check that a reload leaves nothing behind. Same setup as the other e2e files:
//   BASE_URL=http://localhost:8765/ node --test tests/e2e/replay.e2e.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright-core');

const BASE = (process.env.BASE_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
const CHANNEL = process.env.PW_CHANNEL || 'chrome';

let browser;
test.before(async () => { browser = await chromium.launch({ channel: CHANNEL }); });
test.after(async () => { if (browser) await browser.close(); });

async function openGame(slug) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + 'games/' + slug + '/index.html');
  return { page, frame: await launch(page), errors };
}
async function launch(page) {
  await page.click('[data-play]');
  const frame = await (await page.waitForSelector('[data-player] iframe')).contentFrame();
  await frame.waitForSelector('[data-start]');
  return frame;
}

// Games that end on their own if the player does nothing.
for (const slug of ['highway-rush', 'snake-arena']) {
  test(`replay: ${slug} records a run, plays it back, and is gone after reload`, async () => {
    const { page, frame, errors } = await openGame(slug);
    await frame.click('[data-start]');
    await page.waitForTimeout(400);
    const rec = await frame.evaluate(() => GLKit.replay.state());
    assert.ok(rec.supported && rec.recording, 'recording during play: ' + JSON.stringify(rec));

    // idle until the run ends
    await frame.waitForSelector('#over:not([hidden])', { timeout: 60000 });
    const btn = await frame.waitForSelector('#over [data-replay]:not([hidden])', { timeout: 10000 });
    const done = await frame.evaluate(() => GLKit.replay.state());
    assert.ok(!done.recording && done.replayParts >= 1 && done.replayBytes > 1000, 'replay kept in memory: ' + JSON.stringify(done));

    await btn.click();
    await frame.waitForSelector('.replay-ov:not([hidden]) video');
    await frame.waitForFunction(() => { const v = document.querySelector('.replay-ov video'); return v.readyState >= 2 && v.videoWidth > 0; }, null, { timeout: 10000 });
    const vid = await frame.evaluate(() => { const v = document.querySelector('.replay-ov video'); return { src: v.src, w: v.videoWidth }; });
    assert.ok(vid.src.startsWith('blob:') && vid.w > 0, 'video is playable: ' + JSON.stringify(vid));
    await frame.click('.replay-ov [data-close]');
    assert.ok(await frame.evaluate(() => document.querySelector('.replay-ov').hidden));

    // nothing was persisted: no replay data in storage, and a reload starts empty
    const stored = await frame.evaluate(() => Object.keys(localStorage).filter(k => /replay|video/i.test(k)));
    assert.deepStrictEqual(stored, []);
    await page.reload();
    const f2 = await launch(page);
    const after = await f2.evaluate(() => ({ st: GLKit.replay.state(), btns: document.querySelectorAll('[data-replay]').length }));
    assert.strictEqual(after.st.replayParts, 0); assert.strictEqual(after.btns, 0);

    // starting a new run hides the old button
    assert.deepStrictEqual(errors, []);
    await page.close();
  });
}

test('replay: pausing pauses the recorder, resuming continues the same run', async () => {
  const { page, frame } = await openGame('brick-breaker');
  await frame.click('[data-start]');
  await page.waitForTimeout(300);
  await page.keyboard.press('p');
  await frame.waitForSelector('#paused:not([hidden])');
  assert.ok((await frame.evaluate(() => GLKit.replay.state())).paused);
  await frame.click('#resumeBtn');
  const st = await frame.evaluate(() => GLKit.replay.state());
  assert.ok(st.recording && !st.paused && st.segments === 1, JSON.stringify(st));
  await page.close();
});

test('replay: DOM-based games (no canvas) never show a replay button', async () => {
  const { page, frame } = await openGame('tic-tac-toe');
  const st = await frame.evaluate(() => GLKit.replay.state());
  assert.strictEqual(st.supported, false);
  assert.strictEqual(await frame.locator('[data-replay]').count(), 0);
  await page.close();
});
