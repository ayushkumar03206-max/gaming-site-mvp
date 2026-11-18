/* GLMP: shared online-multiplayer client + room UI for Gridlight Arcade games.
 *
 * Requires ../_kit/mp-config.js (written by the site build) and ../_kit/gl-kit.js.
 * The Socket.IO client script is loaded on demand from the game's own multiplayer server
 * (<serverUrl>/socket.io/socket.io.min.js), only after the player chooses "Play with a friend".
 *
 * Usage in a game:
 *   GLMP.available('tic-tac-toe').then(function (yes) { button.hidden = !yes; });
 *   GLMP.open({ gameId: 'tic-tac-toe', title: 'Tic Tac Toe', howTo: '...',
 *     onMatch: function (room) { ... render room.match, room.you.seat ... },   // every server update while a match is on screen
 *     onExit:  function () { ... back to the game's own title screen ... } });
 *   GLMP.act({type: 'move', cell: 4}).then(function (res) { ... res.ok / res.message ... });
 *
 * Nothing here decides a result: the server validates every action and sends the authoritative state.
 */
(function () {
  'use strict';
  var K = window.GLKit, CFG = window.GL_MP || { serverUrl: '', games: [] };
  var NAME_KEY = 'gl_mp_name', SESSION_KEY = 'gl_mp_session';
  var M = {}, socket = null, opts = null, room = null, lastResultKey = null, lobbyAfter = null, clockOffset = 0, countdownTimer = null, ui = null;

  // ---------------------------------------------------------------- availability
  M.configured = function (gameId) { return !!CFG.serverUrl && CFG.games.indexOf(gameId) >= 0; };
  /** Resolves true only when online play is configured for this game AND the server answers /health. */
  M.available = function (gameId) {
    if (!M.configured(gameId) || !window.fetch) return Promise.resolve(false);
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 4000);
    return fetch(CFG.serverUrl + '/health', { signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { clearTimeout(t); return !!(j && j.ok); }, function () { clearTimeout(t); return false; });
  };

  function loadClient() {
    if (window.io) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = CFG.serverUrl + '/socket.io/socket.io.min.js';
      s.onload = function () { window.io ? res() : rej(new Error('no io')); };
      s.onerror = function () { rej(new Error('load failed')); };
      document.head.appendChild(s);
    });
  }

  // ---------------------------------------------------------------- identity (no accounts)
  function guestName() {
    var n = K.load(NAME_KEY, null);
    if (typeof n === 'string' && n) return n;
    var words = ['Swift', 'Bright', 'Lucky', 'Quiet', 'Bold', 'Clever', 'Neon', 'Pixel'];
    n = words[Math.floor(Math.random() * words.length)] + ' Guest ' + (100 + Math.floor(Math.random() * 900));
    return n;
  }
  function saveSession(s) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function loadSession() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } }
  function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }

  /** Room code from an invite link: the game page URL with #join=CODE (read from the parent page when embedded). */
  function inviteCode() {
    var h = '';
    try { h = window.parent.location.hash; } catch (e) { /* cross-origin parent */ }
    if (!h) h = window.location.hash;
    var m = /join=([A-Za-z0-9-]{6,8})/.exec(h || '');
    return m ? m[1].toUpperCase() : null;
  }
  M.inviteCode = inviteCode;
  function inviteUrl(code) {
    var base;
    try { base = window.parent.location.href.split('#')[0]; } catch (e) { base = (document.referrer || location.href).split('#')[0]; }
    return base + '#join=' + code;
  }

  // ---------------------------------------------------------------- connection
  function connect() {
    if (socket) return Promise.resolve(socket);
    return loadClient().then(function () {
      socket = window.io(CFG.serverUrl, { transports: ['websocket', 'polling'], reconnectionDelay: 800, reconnectionDelayMax: 4000, timeout: 8000 });
      socket.on('room:update', onUpdate);
      socket.on('room:closed', function (d) { clearSession(); room = null; showError(closedText(d && d.reason)); render('home'); });
      socket.on('room:replaced', function () { clearSession(); room = null; showError('You opened this room in another tab or device.'); render('home'); });
      socket.on('disconnect', function () { setConn(false); });
      socket.io.on('reconnect', function () { setConn(true); resume(); });
      socket.on('connect', function () { setConn(true); });
      return new Promise(function (res, rej) {
        var done = false;
        socket.once('connect', function () { done = true; res(socket); });
        socket.once('connect_error', function () { if (!done) { socket.close(); socket = null; rej(new Error('connect')); } });
      });
    });
  }
  function ask(ev, payload) {
    return new Promise(function (res) {
      if (!socket || !socket.connected) return res({ ok: false, error: 'offline', message: 'Connection lost. Reconnecting…' });
      var t = setTimeout(function () { res({ ok: false, error: 'timeout', message: 'The server did not answer. Check your connection.' }); }, 8000);
      socket.emit(ev, payload || {}, function (r) { clearTimeout(t); res(r || { ok: false, message: 'No response.' }); });
    });
  }
  function resume() {
    var s = loadSession();
    if (!s || !opts || s.gameId !== opts.gameId) return Promise.resolve(false);
    return ask('room:resume', { roomId: s.roomId, token: s.token }).then(function (r) {
      if (r.ok) { onUpdate(r.room); return true; }
      clearSession(); room = null; render('home'); if (r.error !== 'offline') showError(r.message);
      return false;
    });
  }
  function closedText(reason) {
    return reason === 'host closed the room' ? 'The host closed the room.' : reason === 'expired' ? 'The room expired.' : 'The room has closed.';
  }

  // ---------------------------------------------------------------- updates
  function onUpdate(v) {
    room = v;
    clockOffset = v.serverTime - Date.now();
    if (v.status === 'playing') lobbyAfter = null;
    // after a result the player stays on the final board until they choose the lobby (rematch / leave)
    var showBoard = v.status === 'playing' || (v.status === 'finished' && v.match && lobbyAfter !== v.matchNo);
    if (showBoard) {
      var startsIn = v.startsAt - (Date.now() + clockOffset);
      if (v.status === 'playing' && startsIn > 0) { render('countdown'); countdown(); }
      else { hide(); if (opts.onMatch) opts.onMatch(v); }
    } else render('lobby');
  }
  function countdown() {
    clearInterval(countdownTimer);
    countdownTimer = setInterval(function () {
      if (!room) return clearInterval(countdownTimer);
      var left = room.startsAt - (Date.now() + clockOffset);
      var el = ui && ui.querySelector('[data-mp-count]');
      if (el) el.textContent = Math.max(1, Math.ceil(left / 1000));
      if (left <= 0) { clearInterval(countdownTimer); hide(); if (opts.onMatch) opts.onMatch(room); }
    }, 100);
  }

  // ---------------------------------------------------------------- public actions for games
  M.act = function (action) { return ask('game:action', { action: action }); };
  M.room = function () { return room; };
  M.ready = function (yes) { return ask('room:ready', { ready: yes !== false }); };
  /** After a result: show the lobby again (ready up for a rematch or leave). */
  M.showLobby = function () { if (room) lobbyAfter = room.matchNo; render('lobby'); };
  M.leave = function () {
    var p = ask('room:leave', {});
    clearSession(); room = null; lastResultKey = null;
    return p;
  };
  M.exit = function () { M.leave(); hide(); if (opts && opts.onExit) opts.onExit(); };
  M.opponentConnected = function () { return !room || room.players.every(function (p) { return p.connected; }); };

  // ---------------------------------------------------------------- UI
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ensureUi() {
    if (ui) return ui;
    ui = el('<div class="overlay mp" id="mpOverlay" role="dialog" aria-modal="true" aria-labelledby="mpTitle"><div class="panel mp-panel"></div></div>');
    document.body.appendChild(ui);
    return ui;
  }
  function hide() { if (ui) ui.hidden = true; }
  function setConn(ok) {
    var b = document.getElementById('mpConn');
    if (!b) { b = el('<div class="mp-conn" id="mpConn" role="status" hidden></div>'); document.body.appendChild(b); }
    b.hidden = ok; b.textContent = ok ? '' : 'Connection lost. Reconnecting…';
  }
  function showError(msg) { var e = ui && ui.querySelector('[data-mp-error]'); if (e) { e.textContent = msg || ''; e.hidden = !msg; } else if (msg) K.announce(msg); M._pendingError = msg; }
  function busy(on) { if (!ui) return; Array.prototype.forEach.call(ui.querySelectorAll('button, input'), function (b) { b.disabled = on; }); }

  var VIEWS = {
    home: function () {
      return '<h2 id="mpTitle">Play with a friend</h2><p>Play ' + esc(opts.title) + ' online. One of you creates a private room; the other joins with the room code.</p>' +
        '<p class="mp-err" data-mp-error role="alert" hidden></p>' +
        '<button type="button" class="big" data-mp="create-form">Create room</button>' +
        '<button type="button" class="ghost" data-mp="join-form">Join room</button>' +
        '<button type="button" class="ghost" data-mp="howto">How to play online</button>' +
        '<button type="button" class="ghost" data-mp="exit">Back</button>';
    },
    howto: function () {
      return '<h2 id="mpTitle">How online play works</h2><ol class="mp-steps"><li>Create a room. You are the host and get a 6-character room code.</li>' +
        '<li>Send the code (or the invite link) to your friend. They choose <b>Join room</b>.</li><li>Both press <b>Ready</b>; the host presses <b>Start</b>.</li>' +
        '<li>If your connection drops, you have about a minute to come back to the same match.</li></ol>' +
        (opts.howTo ? '<p>' + esc(opts.howTo) + '</p>' : '') + '<button type="button" class="big" data-mp="home">OK</button>';
    },
    'create-form': function () {
      return '<h2 id="mpTitle">Create a room</h2><form data-mp-form="create" class="mp-form">' +
        '<label>Your name<input name="name" maxlength="20" required autocomplete="nickname" value="' + esc(guestName()) + '"></label>' +
        '<label>Room password <small>(optional, 4-32 characters)</small><input name="password" type="password" maxlength="32" autocomplete="off"></label>' +
        '<p class="mp-err" data-mp-error role="alert" hidden></p>' +
        '<button type="submit" class="big">Create room</button><button type="button" class="ghost" data-mp="home">Back</button></form>';
    },
    'join-form': function () {
      return '<h2 id="mpTitle">Join a room</h2><form data-mp-form="join" class="mp-form">' +
        '<label>Room code<input name="roomId" maxlength="8" required autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABC123" value="' + esc(inviteCode() || '') + '"></label>' +
        '<label>Your name<input name="name" maxlength="20" required autocomplete="nickname" value="' + esc(guestName()) + '"></label>' +
        '<label>Room password <small>(if the host set one)</small><input name="password" type="password" maxlength="32" autocomplete="off"></label>' +
        '<p class="mp-err" data-mp-error role="alert" hidden></p>' +
        '<button type="submit" class="big">Join room</button><button type="button" class="ghost" data-mp="home">Back</button></form>';
    },
    connecting: function () { return '<h2 id="mpTitle">Connecting…</h2><div class="mp-spin" aria-hidden="true"></div><p class="mp-err" data-mp-error role="alert" hidden></p><button type="button" class="ghost" data-mp="exit">Cancel</button>'; },
    lobby: function () {
      var r = room, me = r.you || {}, mine = r.players.filter(function (p) { return p.id === me.id; })[0] || {};
      var seats = '';
      for (var s = 0; s < r.maxPlayers; s++) {
        var p = r.players.filter(function (x) { return x.seat === s; })[0];
        seats += '<li class="mp-seat">' + (p ? '<span class="mp-avatar" aria-hidden="true">' + esc(p.name.charAt(0).toUpperCase()) + '</span><span class="mp-pn">' + esc(p.name) + (p.id === me.id ? ' (you)' : '') +
          '<small>' + (p.isHost ? 'Host' : 'Guest') + '</small></span><span class="mp-st ' + (p.connected ? (p.ready ? 'ok' : '') : 'off') + '">' + (p.connected ? (p.ready ? 'Ready' : 'Connected') : 'Disconnected') + '</span>'
          : '<span class="mp-avatar empty" aria-hidden="true">?</span><span class="mp-pn">Waiting for a player…<small>Guest</small></span><span class="mp-st">Waiting</span>') + '</li>';
      }
      var res = r.result ? '<p class="mp-result">' + esc(resultText(r)) + '</p>' : '';
      var score = r.matchNo ? '<p class="mp-score">Score: ' + r.players.map(function (p) { return esc(p.name) + ' ' + r.scores[p.seat]; }).join(' · ') + (r.scores[2] ? ' · draws ' + r.scores[2] : '') + '</p>' : '';
      return '<h2 id="mpTitle">Room <span class="mp-code" data-mp-code>' + esc(r.id) + '</span></h2>' + res + score +
        '<div class="row"><button type="button" class="ghost" data-mp="copy">Copy room code</button><button type="button" class="ghost" data-mp="share">Share invite</button></div>' +
        (r.hasPassword ? '<p class="mp-note">This room has a password. Send it to your friend separately.</p>' : '') +
        '<ul class="mp-seats" aria-label="Players">' + seats + '</ul><p class="mp-err" data-mp-error role="alert" hidden></p>' +
        '<button type="button" class="big" data-mp="ready" aria-pressed="' + !!mine.ready + '">' + (mine.ready ? 'Not ready' : (r.matchNo ? 'Ready for a rematch' : 'Ready')) + '</button>' +
        (me.isHost ? '<button type="button" class="big" data-mp="start"' + (r.canStart ? '' : ' disabled') + '>Start game</button><p class="mp-note">' + (r.canStart ? 'Everyone is ready.' : 'Start unlocks when ' + r.minPlayers + ' players are connected and ready.') + '</p>'
          : '<p class="mp-note">The host starts the game when everyone is ready.</p>') +
        '<div class="row"><button type="button" class="ghost" data-mp="leave">Leave room</button>' + (me.isHost ? '<button type="button" class="ghost" data-mp="close">Close room</button>' : '') + '</div>' +
        '<p class="sr" data-mp-copied role="status" aria-live="polite"></p>';
    },
    countdown: function () { return '<h2 id="mpTitle">Get ready!</h2><p class="mp-count" data-mp-count>3</p>'; }
  };
  function resultText(r) {
    var res = r.result; if (!res) return '';
    if (res.winnerSeat === null) return 'Draw (' + res.reason + ').';
    var w = r.players.filter(function (p) { return p.seat === res.winnerSeat; })[0];
    var you = r.you && r.you.seat === res.winnerSeat;
    return (you ? 'You won' : (w ? w.name : 'Your opponent') + ' won') + ' (' + res.reason + ').';
  }
  M.resultText = function () { return room ? resultText(room) : ''; };

  function render(view) {
    ensureUi(); ui.hidden = false;
    var panel = ui.querySelector('.mp-panel');
    panel.innerHTML = VIEWS[view]();
    panel.setAttribute('data-view', view);
    var f = panel.querySelector('input:not([type=hidden])') || panel.querySelector('.big:not([disabled])') || panel.querySelector('button');
    if (f) try { f.focus(); } catch (e) { /* ignore */ }
    if (M._pendingError) { var msg = M._pendingError; M._pendingError = null; showError(msg); }
  }

  function enterRoom(r) {
    if (!r.ok) { busy(false); showError(r.message); return; }
    saveSession({ gameId: opts.gameId, roomId: r.roomId, token: r.token || (loadSession() || {}).token });
    onUpdate(r.room);
  }

  function handleClick(e) {
    var b = e.target.closest('[data-mp]'); if (!b || !ui.contains(b)) return;
    var a = b.getAttribute('data-mp');
    if (a === 'home' || a === 'howto' || a === 'create-form' || a === 'join-form') { render(a); return; }
    if (a === 'exit') { M.exit(); return; }
    if (a === 'copy') { copy(room.id, 'Room code copied.'); return; }
    if (a === 'share') {
      var url = inviteUrl(room.id), data = { title: opts.title, text: 'Join my ' + opts.title + ' room: ' + room.id, url: url };
      if (navigator.share) navigator.share(data).catch(function () {}); else copy(url, 'Invite link copied.');
      return;
    }
    if (a === 'ready') { var me = room.players.filter(function (p) { return p.id === room.you.id; })[0]; ask('room:ready', { ready: !(me && me.ready) }).then(function (r) { if (!r.ok) showError(r.message); }); return; }
    if (a === 'start') { busy(true); ask('room:start', {}).then(function (r) { busy(false); if (!r.ok) showError(r.message); }); return; }
    if (a === 'leave') { M.leave(); render('home'); return; }
    if (a === 'close') { ask('room:close', {}).then(function (r) { if (!r.ok) showError(r.message); }); return; }
  }
  function copy(text, msg) {
    function said(t) { var s = ui.querySelector('[data-mp-copied]'); if (s) s.textContent = t; K.announce(t); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { said(msg); }, function () { said('Copy this: ' + text); });
    else said('Copy this: ' + text);
  }
  function handleSubmit(e) {
    var f = e.target.closest('[data-mp-form]'); if (!f) return;
    e.preventDefault();
    var name = f.name.value.trim(), pw = f.password.value;
    if (!name) return showError('Please enter a name.');
    K.save(NAME_KEY, name);
    busy(true);
    if (f.getAttribute('data-mp-form') === 'create') ask('room:create', { gameId: opts.gameId, name: name, password: pw || undefined }).then(enterRoom);
    else {
      var code = f.roomId.value.toUpperCase().replace(/[\s-]/g, '');
      if (!/^[A-Z0-9]{6}$/.test(code)) { busy(false); return showError('Room codes have 6 letters and numbers.'); }
      ask('room:join', { gameId: opts.gameId, roomId: code, name: name, password: pw || undefined }).then(enterRoom);
    }
  }

  /** Open the online flow for a game. Resumes an existing session (same tab) if there is one. */
  M.open = function (o) {
    opts = o; ensureUi();
    if (!ui._wired) { ui.addEventListener('click', handleClick); ui.addEventListener('submit', handleSubmit); ui._wired = true; }
    render('connecting');
    connect().then(function () {
      return resume().then(function (resumed) { if (!resumed) render(inviteCode() ? 'join-form' : 'home'); });
    }, function () {
      M._pendingError = 'Could not reach the multiplayer server. Please try again later.';
      render('home');
    });
  };

  window.GLMP = M;
})();
