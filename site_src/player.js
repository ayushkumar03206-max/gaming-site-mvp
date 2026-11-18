/* Game player: lazy iframe, loading/error states, restart, fullscreen, share.
 *
 * Host <-> game protocol (window.postMessage, same origin):
 *   game -> host  {type:'gl:ready'}                 game finished loading
 *   game -> host  {type:'gl:error', message:'...'}  game failed to start
 *   host -> game  {type:'gl:restart'}               restart the current run
 */
(function () {
  'use strict';
  var el = document.querySelector('[data-player]');
  if (!el) return;
  var src = el.getAttribute('data-src'), slug = el.getAttribute('data-slug'), title = el.getAttribute('data-title');
  var poster = el.querySelector('.player-poster');
  var loading = el.querySelector('[data-state="loading"]'), error = el.querySelector('[data-state="error"]');
  var restartBtn = document.querySelector('[data-restart]'), fsBtn = document.querySelector('[data-fullscreen]');
  var shareBtn = document.querySelector('[data-share]'), shareMsg = document.querySelector('[data-share-msg]');
  var frame = null, timer = null, ready = false;
  var TIMEOUT = 15000;

  function show(state) {
    poster.hidden = state !== 'idle';
    loading.hidden = state !== 'loading';
    error.hidden = state !== 'error';
  }
  function fail(msg) {
    clearTimeout(timer);
    var m = error.querySelector('[data-error-msg]'); if (m && msg) m.textContent = msg;
    show('error');
    if (restartBtn) restartBtn.disabled = true;
  }
  function start() {
    if (frame) frame.remove();
    ready = false;
    show('loading');
    frame = document.createElement('iframe');
    frame.title = title + ' game';
    frame.setAttribute('allow', 'fullscreen; autoplay');
    frame.setAttribute('allowfullscreen', '');
    frame.src = src;
    el.appendChild(frame);
    timer = setTimeout(function () { if (!ready) fail('The game is taking too long to load. Check your connection and try again.'); }, TIMEOUT);
    if (window.GLRecordPlay) window.GLRecordPlay(slug);
  }
  function onReady() {
    ready = true; clearTimeout(timer); show('none');
    if (restartBtn) restartBtn.disabled = false;
    try { frame.focus(); } catch (e) { /* ignore */ }
  }

  window.addEventListener('message', function (ev) {
    if (!frame || ev.source !== frame.contentWindow) return;
    var d = ev.data || {};
    if (d.type === 'gl:ready') onReady();
    else if (d.type === 'gl:error') fail(d.message || 'The game hit an error while starting.');
  });

  el.querySelector('[data-play]').addEventListener('click', start);
  el.querySelector('[data-retry]').addEventListener('click', start);
  if (restartBtn) restartBtn.addEventListener('click', function () {
    if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'gl:restart' }, '*');
  });
  if (fsBtn) fsBtn.addEventListener('click', function () {
    if (!frame) start();
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (!req) return;
    try { var p = req.call(el); if (p && p.catch) p.catch(function () {}); } catch (e) { /* not allowed */ }
  });
  if (shareBtn) shareBtn.addEventListener('click', function () {
    var url = location.href.split('#')[0];
    var data = { title: title, text: 'Play ' + title + ' free in your browser', url: url };
    function said(t) { if (shareMsg) { shareMsg.textContent = t; setTimeout(function () { shareMsg.textContent = ''; }, 4000); } }
    if (navigator.share) { navigator.share(data).catch(function () {}); return; }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(function () { said('Link copied to clipboard.'); }, function () { said('Copy this link: ' + url); });
    } else said('Copy this link: ' + url);
  });
})();
