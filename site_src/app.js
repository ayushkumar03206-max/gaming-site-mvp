/* Site behaviour: mobile menu, category filter, search, "Popular with you". */
(function () {
  'use strict';
  var root = document.body.getAttribute('data-root') || '';
  var GAMES = window.GL_GAMES || [];
  var PLAYS_KEY = 'gl_plays_v1';

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Mobile menu
  var btn = document.querySelector('.menu-btn'), nav = document.getElementById('main-nav');
  function setMenu(open) {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (btn && nav) {
    btn.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); btn.focus(); }
    });
    document.addEventListener('click', function (ev) {
      if (nav.classList.contains('open') && !nav.contains(ev.target) && !btn.contains(ev.target)) setMenu(false);
    });
  }
  // Keep the header search box filled on the search page
  var hq = document.getElementById('q'), qv = new URLSearchParams(location.search).get('q');
  if (hq && qv && document.querySelector('[data-search-results]')) hq.value = qv;

  // Card rendering for client-side lists (mirrors the server-side card)
  function card(g) {
    var href = root + 'games/' + g.slug + '/index.html';
    var c = g.cats[0] || { slug: '', name: '' };
    var b = '<span class="badge badge-play">Playable now</span>' + (g.isNew ? '<span class="badge badge-new">New</span>' : '') + (g.saves ? '<span class="badge">Saves progress</span>' : '');
    return '<article class="card"><a class="card-thumb" href="' + href + '" tabindex="-1" aria-hidden="true"><img src="' + root + g.thumb + '" alt="" width="320" height="200" loading="lazy"></a>' +
      '<div class="card-body"><div class="card-meta"><a class="chip" href="' + root + 'categories/' + c.slug + '/index.html">' + esc(c.name) + '</a></div>' +
      '<h3><a href="' + href + '">' + esc(g.title) + '</a></h3><p>' + esc(g.desc) + '</p><div class="badges">' + b + '</div>' +
      '<a class="btn btn-primary btn-sm" href="' + href + '">Play now</a></div></article>';
  }

  // Category filter on All Games
  var fgrid = document.querySelector('[data-filter-grid]');
  if (fgrid) {
    var empty = document.querySelector('[data-filter-empty]');
    document.querySelectorAll('[data-filter]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var f = chip.getAttribute('data-filter'), shown = 0;
        document.querySelectorAll('[data-filter]').forEach(function (c) { c.classList.toggle('is-on', c === chip); c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        fgrid.querySelectorAll('.card').forEach(function (cardEl) {
          var ok = f === 'all' || (' ' + cardEl.getAttribute('data-cats') + ' ').indexOf(' ' + f + ' ') >= 0;
          cardEl.hidden = !ok; if (ok) shown++;
        });
        if (empty) empty.hidden = shown > 0;
      });
    });
  }

  // Search
  function normalize(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, ''); }
  function search(q) {
    var terms = normalize(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return GAMES.slice();
    return GAMES.map(function (g) {
      var title = normalize(g.title), hay = normalize([g.title, g.desc, g.tags.join(' '), g.cats.map(function (c) { return c.name + ' ' + c.slug; }).join(' ')].join(' '));
      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        if (hay.indexOf(terms[i]) < 0) return null;
        score += title.indexOf(terms[i]) >= 0 ? 3 : 1;
      }
      return { g: g, s: score };
    }).filter(Boolean).sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.g; });
  }
  window.GLSearch = search;
  var results = document.querySelector('[data-search-results]');
  if (results) {
    var q = new URLSearchParams(location.search).get('q') || '';
    var input = document.querySelector('[data-search-input]'), count = document.querySelector('[data-search-count]'), title = document.querySelector('[data-search-title]');
    function render(query) {
      var found = search(query);
      results.innerHTML = found.map(card).join('');
      if (title) title.textContent = query ? 'Results for “' + query + '”' : 'Search games';
      count.textContent = query ? (found.length ? found.length + ' game' + (found.length === 1 ? '' : 's') + ' found' : 'No games match “' + query + '”. Try a category like puzzle or strategy.') : 'Showing all ' + found.length + ' games.';
    }
    if (input) {
      input.value = q;
      input.addEventListener('input', function () {
        render(input.value.trim());
        history.replaceState(null, '', input.value.trim() ? '?q=' + encodeURIComponent(input.value.trim()) : location.pathname);
      });
    }
    render(q.trim());
  }

  // Popular with you (local only)
  function plays() { try { return JSON.parse(localStorage.getItem(PLAYS_KEY) || '{}'); } catch (e) { return {}; } }
  window.GLRecordPlay = function (slug) {
    var p = plays(); var r = p[slug] || { n: 0, last: 0 }; r.n++; r.last = Date.now(); p[slug] = r;
    try { localStorage.setItem(PLAYS_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
  };
  var pop = document.querySelector('[data-popular]');
  if (pop) {
    var p = plays();
    var list = GAMES.filter(function (g) { return p[g.slug]; }).sort(function (a, b) { return (p[b.slug].n - p[a.slug].n) || (p[b.slug].last - p[a.slug].last); });
    if (list.length) pop.innerHTML = list.slice(0, 8).map(card).join('');
    else { var m = document.createElement('p'); m.className = 'muted'; m.textContent = pop.getAttribute('data-empty'); pop.replaceWith(m); }
  }
})();
