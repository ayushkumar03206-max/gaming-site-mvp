/* Game player: lazy iframe, loading/error states, restart, fullscreen, share.
 *
 * Host <-> game protocol (window.postMessage, same origin):
 *   game -> host  {type:'gl:ready'}                 game finished loading
 *   game -> host  {type:'gl:error', message:'...'}  game failed (before ready = load failure)
 *   host -> game  {type:'gl:restart'}               restart the current run
 *
 * Failure detection (a failure is always shown, never hidden):
 *   - gl:error before gl:ready                          -> error state + Retry
 *   - iframe finished loading but no gl:ready within LOAD_GRACE ms
 *     (e.g. wrong path served a 404 page, script blocked) -> error state + Retry
 *   - nothing at all within TIMEOUT ms (very slow / hung) -> error state + Retry
 *   - gl:error AFTER gl:ready (runtime error mid-game) -> visible notice with Restart, game kept
 */
(function () {
  'use strict';
  var el = document.querySelector('[data-player]');
  if (!el) return;
  var src = el.getAttribute('data-src'), slug = el.getAttribute('data-slug'), title = el.getAttribute('data-title');
  var poster = el.querySelector('.player-poster');
  var loading = el.querySelector('[data-state="loading"]'), error = el.querySelector('[data-state="error"]');
  var notice = el.querySelector('[data-notice]');
  var exitFs = el.querySelector('[data-exit-fs]');
  var restartBtn = document.querySelector('[data-restart]'), fsBtn = document.querySelector('[data-fullscreen]');
  var shareBtn = document.querySelector('[data-share]'), shareMsg = document.querySelector('[data-share-msg]');
  var frame = null, timer = null, graceTimer = null, ready = false;
  var TIMEOUT = 20000, LOAD_GRACE = 4000;

  function show(state) {
    poster.hidden = state !== 'idle';
    loading.hidden = state !== 'loading';
    error.hidden = state !== 'error';
    if (notice && state !== 'none') notice.hidden = true;
  }
  function clearTimers() { clearTimeout(timer); clearTimeout(graceTimer); }
  function fail(msg) {
    clearTimers();
    var m = error.querySelector('[data-error-msg]'); if (m && msg) m.textContent = msg;
    show('error');
    if (restartBtn) restartBtn.disabled = true;
    if (frame) { frame.remove(); frame = null; }
    var retry = error.querySelector('[data-retry]'); if (retry) retry.focus();
  }
  function start() {
    clearTimers();
    if (frame) frame.remove();
    ready = false;
    show('loading');
    if (restartBtn) restartBtn.disabled = true;
    frame = document.createElement('iframe');
    frame.title = title + ' game';
    frame.setAttribute('allow', 'fullscreen; autoplay');
    frame.setAttribute('allowfullscreen', '');
    frame.addEventListener('load', function () {
      if (ready) return;
      graceTimer = setTimeout(function () {
        if (!ready) fail("The game files didn't start. The game may be missing or blocked. Try again, or reload the page.");
      }, LOAD_GRACE);
    });
    frame.src = src;
    el.appendChild(frame);
    timer = setTimeout(function () { if (!ready) fail('The game is taking too long to load. Check your connection and try again.'); }, TIMEOUT);
    if (window.GLRecordPlay) window.GLRecordPlay(slug);
  }
  function focusGame() { try { if (frame) { frame.focus(); frame.contentWindow.focus(); } } catch (e) { /* ignore */ } }
  function onReady() {
    ready = true; clearTimers(); show('none');
    if (restartBtn) restartBtn.disabled = false;
    focusGame();
  }

  window.addEventListener('message', function (ev) {
    if (!frame || ev.source !== frame.contentWindow) return;
    var d = ev.data || {};
    if (d.type === 'gl:ready') onReady();
    else if (d.type === 'gl:error') {
      if (!ready) fail(d.message || 'The game hit an error while starting.');
      else if (notice) {
        notice.querySelector('[data-notice-msg]').textContent = 'Something went wrong in the game. If it stops responding, press Restart.';
        notice.hidden = false;
      }
    }
  });

  el.querySelector('[data-play]').addEventListener('click', start);
  el.querySelector('[data-retry]').addEventListener('click', start);
  if (notice) notice.querySelector('[data-notice-close]').addEventListener('click', function () { notice.hidden = true; focusGame(); });
  function restart() {
    if (notice) notice.hidden = true;
    if (frame && frame.contentWindow && ready) { frame.contentWindow.postMessage({ type: 'gl:restart' }, '*'); focusGame(); }
    else start();
  }
  if (restartBtn) restartBtn.addEventListener('click', restart);
  if (notice) notice.querySelector('[data-notice-restart]').addEventListener('click', restart);

  // Fullscreen: real Fullscreen API where available; otherwise (e.g. iPhone Safari) a CSS "pseudo fullscreen".
  function inFs() { return !!(document.fullscreenElement || document.webkitFullscreenElement) || el.classList.contains('is-pseudo-fs'); }
  function setPseudo(on) {
    el.classList.toggle('is-pseudo-fs', on);
    document.documentElement.classList.toggle('no-scroll', on);
    if (exitFs) exitFs.hidden = !on;
    syncFsBtn();
    focusGame();
  }
  function syncFsBtn() { if (fsBtn) fsBtn.setAttribute('aria-pressed', String(inFs())); }
  function exitFullscreen() {
    if (el.classList.contains('is-pseudo-fs')) { setPseudo(false); return; }
    var ex = document.exitFullscreen || document.webkitExitFullscreen;
    if (ex) { try { var p = ex.call(document); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ignore */ } }
  }
  function enterFullscreen() {
    if (!frame) start();
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) { setPseudo(true); return; }
    try {
      var p = req.call(el);
      if (p && p.then) p.then(focusGame, function () { setPseudo(true); });
      else focusGame();
    } catch (e) { setPseudo(true); }
  }
  if (fsBtn) fsBtn.addEventListener('click', function () { if (inFs()) exitFullscreen(); else enterFullscreen(); });
  if (exitFs) exitFs.addEventListener('click', exitFullscreen);
  document.addEventListener('fullscreenchange', syncFsBtn);
  document.addEventListener('webkitfullscreenchange', syncFsBtn);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && el.classList.contains('is-pseudo-fs')) setPseudo(false); });

  if (shareBtn) shareBtn.addEventListener('click', function () {
    var url = location.href.split('#')[0];
    var data = { title: title, text: 'Play ' + title + ' free in your browser', url: url };
    function said(t) { if (shareMsg) { shareMsg.textContent = t; setTimeout(function () { shareMsg.textContent = ''; }, 5000); } }
    if (navigator.share) { navigator.share(data).catch(function () {}); return; }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(function () { said('Link copied to clipboard.'); }, function () { said('Copy this link: ' + url); });
    } else said('Copy this link: ' + url);
  });
})();
