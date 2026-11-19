# Adding a game

New games use the shared kit in `games/_kit/` (protocol, overlays, best scores, sounds, swipe and
touch buttons). The three original games predate the kit and talk to the host directly; both ways work.

1. **Create the module** at `games/<slug>/`:
   - `index.html`: a standalone page that loads `../_kit/gl-kit.css` and `../_kit/gl-kit.js`, then your files.
   - `<name>-logic.js`: pure rules/simulation in UMD form (`module.exports` in Node, `window.X` in the browser),
     so `node --test` can check it. Keep everything that decides the outcome here; the multiplayer server
     reuses these modules for authoritative validation.
   - `game.js` (+ optional `game.css`): rendering and input only.
   - `thumb.svg`: 16:10 artwork, 640×400.
2. **Use the kit protocol** in `game.js`:
   ```js
   var K = window.GLKit;
   K.init('My Game');          // uncaught errors -> {type:'gl:error'} to the host player
   K.onRestart(restartGame);   // host Restart button
   // ... when the game can be played:
   K.ready();                  // {type:'gl:ready'}; the host shows an error if this never arrives
   window.GLDebug = { state: function () { return { mode: mode }; } }; // read-only, for browser tests
   ```
   Give the title screen's start button a `data-start` attribute: the smoke tests click it.
3. **Register it** with a spec file (a `games.json` entry plus a `rights` object):
   ```bash
   python scripts/add_game.py path/to/spec.json
   ```
   This adds the catalogue entry and a **pending** rights record. Nothing pending is ever deployed.
4. **Rights review (owner only).** After checking the evidence:
   `python scripts/rights_review.py approve rights-<slug> --by "Your name" --note "What you checked"`
5. **Preview locally** (pending games included, with a banner and `noindex`):
   ```bash
   python scripts/build_static_site.py --preview-pending
   python scripts/serve.py 8765 dist
   ```
6. **Verify:**
   ```bash
   python -m unittest discover -s tests
   node --test tests/js/*.test.js
   BASE_URL=http://localhost:8765/ GAMES=<slug> node --test tests/e2e/kit-games.e2e.js
   ```
   Add a `tests/js/<slug>.test.js` for the logic and, ideally, an `INTERACT['<slug>']` entry in
   `tests/e2e/kit-games.e2e.js` that drives the game with real mouse/keyboard input.

## Registry fields that matter for modes

```json
"modes": {"single": true, "local": false, "online": false},
"players": {"min": 1, "max": 1},
"multiplayer_model": "turn-based | competitive-real-time | score-competition | cooperative | alternating-turns | shared-challenge"
```

Badges come from `modes`. **Online** is only shown when `modes.online` is true *and*
`data/site.json` has `multiplayer.server_url` set, so online play can never be advertised
before a server is actually deployed and connected.

## Checklist

- [ ] Keyboard **and** touch controls (touch controls show only on touch devices: `html.has-touch`)
- [ ] Pause and restart, plus a game-over or win state
- [ ] Doesn't scroll the page and fits a 320 px wide phone screen
- [ ] Respects `prefers-reduced-motion` where it animates heavily (`GLKit.reduceMotion`)
- [ ] Same-device multiplayer uses `GLKit.party` (picker, handoff, results) and sets `modes.local` + `players.max` in the registry
- [ ] Doesn't rely on colour alone
- [ ] No external network requests, no third-party assets
- [ ] localStorage keys namespaced `gl_<slug>_...`, accessed through `GLKit.load/save` (never throws)
