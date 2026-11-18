# Multiplayer architecture

```
 Browser (GitHub Pages site)                         Multiplayer server (separate Node.js host)
 ┌──────────────────────────────────┐                ┌───────────────────────────────────────────┐
 │ games/<slug>/game.js             │                │ src/server.js     Express: /health, /games │
 │   └─ GLMP (games/_kit/gl-mp.js)  │  WebSocket     │                   Socket.IO: rooms/matches │
 │        room UI: create/join/     │ ─────────────► │ src/socket/socketHandlers.js  (thin layer) │
 │        lobby/ready/countdown     │  Socket.IO     │ src/rooms/roomManager.js      (all rules)  │
 │   mp-config.js (from the build)  │ ◄───────────── │ src/rooms/roomValidation.js               │
 │   serverUrl + games list         │  room:update   │ src/games/gameRegistry.js + adapters ──────┼──► games/<slug>/*-logic.js
 └──────────────────────────────────┘                └───────────────────────────────────────────┘     (same rules code as the browser)
```

## Principles

- **The server is authoritative.** It holds every match state. Clients send *requests* (`{type: 'move', ...}`);
  the server validates them with the game's own rules module and broadcasts the new state. Clients never send
  scores, winners or board states. Results are computed on the server.
- **One rules implementation.** Each online game's adapter `require`s the same UMD logic file the browser game
  uses (`games/tic-tac-toe/ttt-logic.js`, `games/chess/chess-rules.js`). A rule fix applies to both.
- **No fake online play.** Online play appears only when all three are true:
  1. the game's registry entry has `"modes": {"online": true}`;
  2. `data/site.json` → `multiplayer.server_url` is set (written into `play/_kit/mp-config.js` by the build);
  3. the browser can reach `<server_url>/health` right now.
  Otherwise the "Play with a friend online" button stays hidden and no "Online" badge is shown.
- **Static site stays static.** The site never bundles the Socket.IO client; it is loaded on demand from the
  multiplayer server itself (`<server_url>/socket.io/socket.io.min.js`) only after the player opens online play.

## Implemented now

| Piece | Status |
|---|---|
| Server: rooms, lobby, ready, host start, countdown, leave/close, reconnect grace, forfeit, expiry, rate limits, origin checks | Built and tested locally (22 server tests) |
| Client: GLMP room UI (create, join, invite link, copy code, share, lobby, ready, start, leave, close, errors, reconnect banner) | Built and tested in two browser contexts |
| Tic Tac Toe online | Integrated, tested end to end locally |
| Chess online (moves, draw offer/accept, resign, colour swap, reload-resume) | Integrated, tested end to end locally |
| Other games online | Not started (see `GAME_RULES.md` for the planned model per game) |
| Deployment | **Not deployed.** No hosting account or URL is configured. |

## Synchronisation models (planned per game)

| Model | How it will work | Games |
|---|---|---|
| Turn-based | Server validates each move, broadcasts full state | Tic Tac Toe ✅, Chess ✅, Memory Match, Pathforge |
| Shared challenge | Server picks one seed; each client plays locally with that seed; server receives only *inputs/moves* and replays them with the shared logic to compute the score | Chroma Shift, Tile Fusion, Car Parking |
| Score competition | Same seed + fixed duration; server re-simulates submitted input logs where the game is deterministic; otherwise results are labelled "unverified" | Fruit Slice, Brick Breaker, Bubble Shooter, Neon Dodge |
| Competitive real-time | Server-run simulation at a fixed tick (e.g. 15 Hz), clients send inputs, server broadcasts snapshots | Snake Arena, Highway Rush |
| Cooperative / alternating | As above, per game | Space Shooter, Tower Builder |

Real-time games need their simulation to be deterministic (seeded RNG, fixed time step) before they can be
validated server-side; most logic modules already take a seed for this reason.

## Data handled

The server keeps everything **in memory** and stores nothing on disk: room code, display names (chosen by the
player, no accounts), seat, ready/connection state, match state and a random reconnect token. Connections reveal
the player's IP address to the server and its host, as with any web request. Restarting the server ends all rooms.
Before going live, the site's Privacy Policy must mention online play (see `DEPLOYMENT_GUIDE.md`).
