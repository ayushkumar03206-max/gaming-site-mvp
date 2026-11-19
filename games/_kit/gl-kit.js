/* GLKit: shared helpers for Gridlight Arcade games (no dependencies).
 *
 * Every game page loads this before its own game.js:
 *   <link rel="stylesheet" href="../_kit/gl-kit.css">
 *   <script src="../_kit/gl-kit.js"></script>
 *
 * It implements the host <-> game protocol used by site_src/player.js:
 *   GLKit.ready()            -> posts {type:'gl:ready'}  (call once the game can be played)
 *   uncaught errors          -> posts {type:'gl:error'}  (automatic, after GLKit.init)
 *   GLKit.onRestart(fn)      <- host sends {type:'gl:restart'}
 *
 * Plus small utilities: overlay screens, local best scores, auto-pause, a live
 * region for screen readers, a DPR-aware canvas fitter, swipe detection and
 * synthesised sound effects (Web Audio, no audio files).
 */
(function (root) {
  'use strict';
  var K = {};
  function post(m) { try { if (window.parent !== window) window.parent.postMessage(m, '*'); } catch (e) { /* ignore */ } }
  K.post = post;
  K.$ = function (id) { return document.getElementById(id); };
  K.reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  K.isTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window ||
    !!(window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches);
  if (K.isTouch) document.documentElement.classList.add('has-touch');

  K.init = function (name) {
    K.name = name;
    window.addEventListener('error', function (ev) { post({ type: 'gl:error', message: name + ' error: ' + (ev.message || 'unknown') }); });
    window.addEventListener('unhandledrejection', function (ev) { post({ type: 'gl:error', message: name + ' error: ' + String(ev.reason) }); });
  };
  K.fail = function (msg) { post({ type: 'gl:error', message: msg }); };
  K.ready = function () { post({ type: 'gl:ready' }); };
  K.onRestart = function (fn) {
    window.addEventListener('message', function (ev) { if (ev.data && ev.data.type === 'gl:restart') fn(); });
  };

  // ---- storage (never throws: private mode / blocked storage just means no saving)
  K.load = function (key, def) {
    try { var v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  };
  K.save = function (key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ } };
  /** Best score helper. better(a,b) defaults to "higher is better". Returns {get, submit(score)->isNewBest}. */
  K.best = function (key, better) {
    better = better || function (a, b) { return a > b; };
    var cur = K.load(key, null);
    return {
      get: function () { return cur; },
      submit: function (s) { if (cur == null || better(s, cur)) { cur = s; K.save(key, s); return true; } return false; }
    };
  };

  // ---- overlay screens: K.screens(['title','paused','over']).show('title' | null)
  K.screens = function (ids) {
    return {
      current: null,
      show: function (id) {
        this.current = id;
        K.replay.onScreen(id);
        ids.forEach(function (x) { var el = K.$(x); if (el) el.hidden = x !== id; });
        if (id) { var el = K.$(id), f = el && el.querySelector('[autofocus], .big'); if (f) try { f.focus(); } catch (e) { /* ignore */ } }
      }
    };
  };

  /** Calls onPause() when the tab is hidden or the frame loses focus. */
  K.autoPause = function (onPause) {
    document.addEventListener('visibilitychange', function () { if (document.hidden) onPause(); });
    window.addEventListener('blur', onPause);
  };

  K.announce = function (txt) { var el = K.$('live'); if (el) { el.textContent = ''; setTimeout(function () { el.textContent = txt; }, 30); } };

  /** Fits a canvas to its CSS box (or the window) at device pixel ratio. Returns {W,H,U,DPR}. */
  K.fitCanvas = function (canvas, ctx) {
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    var W = Math.max(1, r.width || window.innerWidth), H = Math.max(1, r.height || window.innerHeight);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { W: W, H: H, U: Math.min(W, H) / 100, DPR: DPR };
  };

  /** Swipe detection: cb('left'|'right'|'up'|'down'). Returns a detach function. */
  K.swipe = function (el, cb, minDist) {
    minDist = minDist || 24;
    var s = null;
    function down(e) { s = { x: e.clientX, y: e.clientY, id: e.pointerId }; }
    function up(e) {
      if (!s || e.pointerId !== s.id) return;
      var dx = e.clientX - s.x, dy = e.clientY - s.y; s = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < minDist) return;
      cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', function () { s = null; });
    return function () { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); };
  };

  /** Hold-to-press touch buttons: binds [data-hold="name"] elements to a {name:true} map. */
  K.holdButtons = function (map) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-hold]'), function (b) {
      var k = b.getAttribute('data-hold');
      function on(e) { e.preventDefault(); map[k] = true; b.classList.add('is-down'); }
      function off() { map[k] = false; b.classList.remove('is-down'); }
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
      b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
  };

  // ---- sound: tiny synthesised effects. Muted state is remembered per device.
  var actx = null, muted = K.load('gl_sound_muted', false);
  var SFX = {
    blip: [660, 0.06, 'square', 0.05], hit: [180, 0.12, 'sawtooth', 0.07], coin: [988, 0.09, 'triangle', 0.08, 1319],
    pop: [520, 0.07, 'triangle', 0.08, 780], boom: [90, 0.35, 'sawtooth', 0.1, 40], win: [523, 0.25, 'triangle', 0.08, 1047],
    lose: [330, 0.3, 'triangle', 0.08, 165], slice: [1200, 0.08, 'sawtooth', 0.04, 500], shoot: [880, 0.05, 'square', 0.03, 440],
    place: [392, 0.08, 'triangle', 0.08], power: [440, 0.2, 'square', 0.05, 880]
  };
  function ensureCtx() {
    if (actx || muted) return actx;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { actx = new C(); } catch (e) { actx = null; }
    return actx;
  }
  K.sound = {
    isMuted: function () { return muted; },
    setMuted: function (m) { muted = !!m; K.save('gl_sound_muted', muted); },
    play: function (name) {
      if (muted) return;
      var c = ensureCtx(), d = SFX[name];
      if (!c || !d) return;
      try {
        if (c.state === 'suspended') c.resume();
        var t = c.currentTime, o = c.createOscillator(), g = c.createGain();
        o.type = d[2]; o.frequency.setValueAtTime(d[0], t);
        if (d[4]) o.frequency.exponentialRampToValueAtTime(d[4], t + d[1]);
        g.gain.setValueAtTime(d[3], t); g.gain.exponentialRampToValueAtTime(0.0001, t + d[1]);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d[1] + 0.02);
      } catch (e) { /* audio is optional */ }
    }
  };
  /** Wires a [data-mute] button: label toggles between 🔊 and 🔇. */
  K.muteButton = function () {
    Array.prototype.forEach.call(document.querySelectorAll('[data-mute]'), function (b) {
      function sync() { b.textContent = muted ? '🔇' : '🔊'; b.setAttribute('aria-pressed', String(muted)); b.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on'); }
      b.addEventListener('click', function () { K.sound.setMuted(!muted); sync(); });
      sync();
    });
  };

  /* ---- Last-game replay (canvas games only).
   * Driven by K.screens: show(null) records, 'over'/'result' finishes the run and adds a
   * "Watch replay" button to that screen, 'title' discards, any other screen pauses.
   * The video lives ONLY in this page's memory (Blob URLs): nothing is written to
   * localStorage/IndexedDB, and it is gone when the page is closed or reloaded.
   * Long runs keep only the last SEG_KEEP segments of SEG_MS each, so memory stays bounded
   * (about 1 Mbit/s, i.e. at most ~25 MB for a 3-minute tail). */
  var R = { SEG_MS: 60000, SEG_KEEP: 3, BITRATE: 1000000, FPS: 30, END_SCREENS: ['over', 'result', 'gl-party', 'gl-party-res'] };
  var rs = { run: null, last: [], ui: null, player: null };
  function pickMime() {
    var M = window.MediaRecorder;
    if (!M || !M.isTypeSupported) return null;
    var list = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (var i = 0; i < list.length; i++) if (M.isTypeSupported(list[i])) return list[i];
    return null;
  }
  function findCanvas() { return document.querySelector('.stage canvas') || document.querySelector('canvas'); }
  R.supported = function () {
    var c = findCanvas();
    return !!(c && c.captureStream && window.MediaRecorder && pickMime());
  };
  function newSegment(run) {
    var chunks = [], rec;
    try { rec = new MediaRecorder(run.stream, { mimeType: run.mime, videoBitsPerSecond: R.BITRATE }); } catch (e) { return null; }
    var seg = { rec: rec, chunks: chunks, blob: null, done: null };
    seg.done = new Promise(function (res) {
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = function () { seg.blob = chunks.length ? new Blob(chunks, { type: run.mime.split(';')[0] }) : null; chunks.length = 0; res(); };
    });
    rec.start(1000);
    seg.activeMs = 0; seg.since = Date.now();
    return seg;
  }
  function beginRun() {
    var c = findCanvas(), mime = pickMime(), stream;
    try { stream = c.captureStream(R.FPS); } catch (e) { return; }
    var run = { stream: stream, mime: mime, segs: [], paused: false, timer: null };
    var seg = newSegment(run);
    if (!seg) { stopTracks(run); return; }
    run.segs.push(seg);
    run.timer = setInterval(function () { rotate(run); }, 1000);
    rs.run = run;
  }
  function cur(run) { return run.segs[run.segs.length - 1]; }
  function rotate(run) {
    if (run.paused) return;
    var s = cur(run), now = Date.now();
    s.activeMs += now - s.since; s.since = now;
    if (s.activeMs < R.SEG_MS) return;
    try { s.rec.stop(); } catch (e) { /* ignore */ }
    var n = newSegment(run);
    if (n) run.segs.push(n);
    while (run.segs.length > R.SEG_KEEP) run.segs.shift(); // drop the oldest; its blob is never kept
  }
  function stopTracks(run) { try { run.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ } }
  function endRun(keep, screenId) {
    var run = rs.run; rs.run = null;
    if (!run) return;
    clearInterval(run.timer);
    var s = cur(run);
    if (run.paused && s.rec.state === 'paused') try { s.rec.resume(); } catch (e) { /* ignore */ }
    try { if (s.rec.state !== 'inactive') s.rec.stop(); } catch (e) { /* ignore */ }
    var segs = run.segs.slice();
    Promise.all(segs.map(function (x) { return x.done; })).then(function () {
      stopTracks(run);
      if (!keep) return;
      var blobs = segs.map(function (x) { return x.blob; }).filter(Boolean);
      if (!blobs.length) return;
      release();
      rs.last = blobs.map(function (b) { return URL.createObjectURL(b); });
      rs.bytes = blobs.reduce(function (a, b) { return a + b.size; }, 0);
      showButton(screenId);
    });
  }
  function release() {
    rs.last.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } });
    rs.last = []; rs.bytes = 0;
  }
  function showButton(screenId) {
    var ov = K.$(screenId), panel = ov && ov.querySelector('.panel');
    if (!panel || ov.hidden) return;
    var b = panel.querySelector('[data-replay]');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.className = 'ghost replay-btn'; b.setAttribute('data-replay', '');
      b.textContent = '▶ Watch replay';
      b.addEventListener('click', openPlayer);
      var big = panel.querySelector('.big');
      if (big && big.nextSibling) panel.insertBefore(b, big.nextSibling); else panel.appendChild(b);
    }
    b.hidden = false;
  }
  function hideButtons() { Array.prototype.forEach.call(document.querySelectorAll('[data-replay]'), function (b) { b.hidden = true; }); }
  function openPlayer() {
    if (!rs.last.length) return;
    var p = rs.player;
    if (!p) {
      p = document.createElement('div');
      p.className = 'overlay replay-ov'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Last game replay');
      p.innerHTML = '<div class="panel replay-panel"><h2>Last game replay</h2><video playsinline controls muted></video>' +
        '<p class="hint" data-part></p><p class="hint">Saved only on this page. It is removed when you close or reload the site.</p>' +
        '<button type="button" class="big" data-close>Close</button></div>';
      document.body.appendChild(p);
      var v = p.querySelector('video');
      v.addEventListener('ended', function () { if (p.idx < rs.last.length - 1) play(p.idx + 1); });
      v.addEventListener('loadedmetadata', function () {
        // MediaRecorder WebM has no duration header; seeking far ahead makes the browser compute it.
        if (v.duration === Infinity) { v.currentTime = 1e9; v.addEventListener('timeupdate', function f() { v.removeEventListener('timeupdate', f); v.currentTime = 0; }); }
      });
      p.querySelector('[data-close]').addEventListener('click', closePlayer);
      p.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePlayer(); });
      rs.player = p;
    }
    function play(i) {
      p.idx = i;
      var v = p.querySelector('video'); v.src = rs.last[i];
      p.querySelector('[data-part]').textContent = rs.last.length > 1 ? 'Part ' + (i + 1) + ' of ' + rs.last.length + ' (last ' + Math.round(R.SEG_MS * R.SEG_KEEP / 60000) + ' minutes of the run)' : '';
      var pr = v.play(); if (pr && pr.catch) pr.catch(function () { /* user can press play */ });
    }
    p.hidden = false; play(0);
    try { p.querySelector('[data-close]').focus(); } catch (e) { /* ignore */ }
  }
  function closePlayer() {
    var p = rs.player; if (!p) return;
    var v = p.querySelector('video'); try { v.pause(); } catch (e) { /* ignore */ }
    v.removeAttribute('src'); try { v.load(); } catch (e) { /* ignore */ }
    p.hidden = true;
    var b = document.querySelector('[data-replay]:not([hidden])'); if (b) try { b.focus(); } catch (e) { /* ignore */ }
  }
  R.onScreen = function (id) {
    if (!R.supported()) return;
    var run = rs.run;
    if (id === null) {
      hideButtons(); closePlayer();
      if (!run) beginRun();
      else if (run.paused) { run.paused = false; var s = cur(run); s.since = Date.now(); try { if (s.rec.state === 'paused') s.rec.resume(); } catch (e) { /* ignore */ } }
    } else if (R.END_SCREENS.indexOf(id) >= 0) {
      if (run) endRun(true, id); else if (rs.last.length) showButton(id);
    } else if (id === 'title') {
      endRun(false);
    } else if (run && !run.paused) {
      run.paused = true; var c = cur(run), now = Date.now(); c.activeMs += now - c.since; c.since = now;
      try { if (c.rec.state === 'recording') c.rec.pause(); } catch (e) { /* ignore */ }
    }
  };
  /** For tests / debugging. */
  R.state = function () {
    return { supported: R.supported(), recording: !!rs.run, paused: !!(rs.run && rs.run.paused), segments: rs.run ? rs.run.segs.length : 0,
      replayParts: rs.last.length, replayBytes: rs.bytes || 0 };
  };
  R.open = openPlayer; R.close = closePlayer;
  window.addEventListener('pagehide', function () { if (rs.run) endRun(false); release(); });
  K.replay = R;

  /* ---- Party: several players on ONE device (pass-and-play or shared turns).
   * K.party.picker(el, key, max, onChange)  -> renders "Solo · 2 · 3 · 4" buttons, remembers the choice per game
   * K.party.handoff(opts)                   -> "Pass to Player N" screen between turns
   * K.party.results(opts)                   -> final ranking screen
   * Both screens count as "end of a run" for the replay recorder, so the last player's run can be watched. */
  var party = {
    COLORS: ['#29f0ff', '#ff8a3d', '#b6ff3b', '#ff5d8f'],
    name: function (i) { return 'Player ' + (i + 1); },
    picker: function (el, key, max, onChange) {
      var n = Math.max(1, Math.min(max, K.load(key, 1) | 0 || 1));
      el.innerHTML = '<p class="label">Players</p><div class="seg" role="group" aria-label="Players"></div>';
      var seg = el.querySelector('.seg');
      for (var i = 1; i <= max; i++) {
        var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-party', String(i));
        b.textContent = i === 1 ? 'Solo' : i + ' players'; seg.appendChild(b);
      }
      function sync() { Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-party') === n)); }); }
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('[data-party]'); if (!b) return;
        n = +b.getAttribute('data-party'); K.save(key, n); sync(); if (onChange) onChange(n);
      });
      sync();
      return { get: function () { return n; } };
    }
  };
  function partyOverlay(id) {
    var ov = K.$(id);
    if (!ov) {
      ov = document.createElement('div'); ov.className = 'overlay party-ov'; ov.id = id; ov.hidden = true;
      ov.setAttribute('role', 'dialog'); ov.innerHTML = '<div class="panel"></div>';
      document.body.appendChild(ov);
    }
    return ov;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /** opts: {title, lines: [text], player: index of who plays next, button, onGo} */
  party.handoff = function (opts) {
    var ov = partyOverlay('gl-party'), p = ov.querySelector('.panel'), c = party.COLORS[opts.player % 4];
    p.innerHTML = '<h2>' + esc(opts.title) + '</h2>' + (opts.lines || []).map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') +
      '<p class="party-next" style="--pc:' + c + '">Next: <b>' + esc(party.name(opts.player)) + '</b></p>' +
      '<button type="button" class="big" data-go>' + esc(opts.button || party.name(opts.player) + ', start') + '</button>';
    ov.hidden = false; K.replay.onScreen('gl-party');
    var go = p.querySelector('[data-go]');
    go.addEventListener('click', function () { ov.hidden = true; opts.onGo(); });
    try { go.focus(); } catch (e) { /* ignore */ }
    K.announce(opts.title + '. Next: ' + party.name(opts.player));
  };
  /** opts: {title, rows: [{player, value, note}] in ranking order, again, onAgain, back, onBack} */
  party.results = function (opts) {
    var ov = partyOverlay('gl-party-res'), p = ov.querySelector('.panel');
    p.innerHTML = '<h2>' + esc(opts.title) + '</h2><ol class="party-rank">' + opts.rows.map(function (r, i) {
      return '<li style="--pc:' + party.COLORS[r.player % 4] + '"><span class="pos">' + (r.place || i + 1) + '</span><b>' + esc(party.name(r.player)) + '</b>' +
        '<span class="val">' + esc(r.value) + '</span>' + (r.note ? '<small>' + esc(r.note) + '</small>' : '') + '</li>';
    }).join('') + '</ol><button type="button" class="big" data-again>' + esc(opts.again || 'Play again') + '</button>' +
      (opts.onBack ? '<button type="button" class="ghost" data-back>' + esc(opts.back || 'Back') + '</button>' : '');
    ov.hidden = false; K.replay.onScreen('gl-party-res');
    p.querySelector('[data-again]').addEventListener('click', function () { ov.hidden = true; opts.onAgain(); });
    if (opts.onBack) p.querySelector('[data-back]').addEventListener('click', function () { ov.hidden = true; opts.onBack(); });
    try { p.querySelector('[data-again]').focus(); } catch (e) { /* ignore */ }
    K.announce(opts.title);
  };
  party.hide = function () { ['gl-party', 'gl-party-res'].forEach(function (id) { var o = K.$(id); if (o) o.hidden = true; }); };
  K.party = party;

  K.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  K.rand = function (a, b) { return a + Math.random() * (b - a); };

  root.GLKit = K;
})(typeof self !== 'undefined' ? self : this);
