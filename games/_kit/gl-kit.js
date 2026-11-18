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

  K.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  K.rand = function (a, b) { return a + Math.random() * (b - a); };

  root.GLKit = K;
})(typeof self !== 'undefined' ? self : this);
