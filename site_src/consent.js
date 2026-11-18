/* Consent manager.
 * - Reads optional trackers from window.GL_TRACKING (generated from data/tracking.json).
 * - Nothing optional loads before an explicit opt-in. Default = rejected.
 * - The banner only appears automatically when at least one tracker is enabled.
 * - "Privacy settings" buttons ([data-consent-open]) reopen the panel at any time.
 * - Game progress in localStorage is strictly functional and is not gated here.
 */
(function () {
  'use strict';
  var KEY = 'gl_consent_v1';
  var trackers = (window.GL_TRACKING || []).filter(function (t) { return t && t.enabled; });
  var categories = Array.from(new Set(trackers.map(function (t) { return t.category; })));

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function write(choice) {
    try { localStorage.setItem(KEY, JSON.stringify(choice)); } catch (e) { /* private mode */ }
  }
  var state = read();

  function has(category) { return !!(state && state.choices && state.choices[category] === true); }

  var loaded = {};
  function loadAllowed() {
    trackers.forEach(function (t) {
      if (!t.script_src || loaded[t.id] || !has(t.category)) return;
      var s = document.createElement('script');
      s.src = t.script_src; s.async = true; s.dataset.tracker = t.id;
      document.head.appendChild(s);
      loaded[t.id] = true;
    });
  }

  function save(choices) {
    state = { v: 1, ts: new Date().toISOString(), choices: choices };
    write(state);
    loadAllowed();
    document.dispatchEvent(new CustomEvent('gl:consent', { detail: state }));
  }

  var panel;
  function close() { if (panel) { panel.remove(); panel = null; } }
  function open() {
    close();
    panel = document.createElement('div');
    panel.className = 'consent';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'consent-title');
    var rows = trackers.length
      ? trackers.map(function (t) {
          return '<label><input type="checkbox" data-cat="' + t.category + '"' + (has(t.category) ? ' checked' : '') + '>' +
            '<span><strong>' + esc(t.name) + '</strong><br>' + esc(t.purpose || '') + '</span></label>';
        }).join('')
      : '<p>No optional scripts are enabled on this site right now. Only strictly necessary storage (your game progress and this choice) is used.</p>';
    panel.innerHTML =
      '<h2 id="consent-title">Privacy settings</h2>' +
      '<p>Games save progress on your device. That is required for them to work. Anything optional stays off unless you turn it on.</p>' +
      '<label><input type="checkbox" checked disabled><span><strong>Strictly necessary</strong><br>Game progress, high scores and this setting. Stored only in your browser.</span></label>' +
      rows +
      '<div class="consent-actions">' +
      (trackers.length ? '<button type="button" class="btn btn-ghost btn-sm" data-c="reject">Reject optional</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-c="save">Save choices</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-c="accept">Accept all</button>'
        : '<button type="button" class="btn btn-primary btn-sm" data-c="close">Close</button>') +
      '</div>';
    document.body.appendChild(panel);
    panel.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-c]'); if (!b) return;
      var c = b.getAttribute('data-c'), choices = {};
      if (c === 'accept') categories.forEach(function (k) { choices[k] = true; });
      else if (c === 'reject') categories.forEach(function (k) { choices[k] = false; });
      else if (c === 'save') panel.querySelectorAll('input[data-cat]').forEach(function (i) { choices[i.dataset.cat] = i.checked; });
      if (c !== 'close') save(choices);
      close();
    });
    var first = panel.querySelector('button'); if (first) first.focus();
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  document.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-consent-open]')) { ev.preventDefault(); open(); }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && panel) close(); });

  window.GLConsent = { has: has, open: open, categories: categories };
  if (trackers.length && !state) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open); else open();
  }
  loadAllowed();
})();
