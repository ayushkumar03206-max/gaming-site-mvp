# Game development status

Last updated: 2026-11-18, after Batch 3 (branch `games-batch-2`, not pushed, not deployed).

Status words: *Not Started*, *In Progress*, *Core Gameplay Complete*, *Multiplayer Ready*, *Integrated*, *Verified*.
"Verified" is reserved for after the planned QA phase (including real devices); nothing is marked Verified yet.

| Game | Development | Single player | Local 2P | Online multiplayer | Status |
|---|---|---|---|---|---|
| Pathforge | Done (earlier batch, QA-audited) | Yes | Yes | Not started | Core Gameplay Complete |
| Neon Dodge | Done (earlier batch, QA-audited) | Yes | – | Not started | Core Gameplay Complete |
| Chroma Shift | Done (earlier batch, QA-audited) | Yes | – | Not started | Core Gameplay Complete |
| Highway Rush | Done | Yes | – | Not started | Core Gameplay Complete |
| Brick Breaker | Done | Yes | – | Not started | Core Gameplay Complete |
| Fruit Slice | Done | Yes | – | Not started | Core Gameplay Complete |
| Space Shooter | Done | Yes | – | Not started | Core Gameplay Complete |
| Memory Match | Done | Yes | Yes | Not started | Core Gameplay Complete |
| Tic Tac Toe | Done | Yes | Yes | Integrated, tested locally (server not deployed) | Integrated |
| Snake Arena | Done | Yes | – | Not started | Core Gameplay Complete |
| Tile Fusion ("2048") | Done | Yes | – | Not started | Core Gameplay Complete |
| Tower Builder | Done | Yes | – | Not started | Core Gameplay Complete |
| Bubble Shooter | Done | Yes | – | Not started | Core Gameplay Complete |
| Car Parking Challenge | Done | Yes | – | Not started | Core Gameplay Complete |
| Chess | Done | Yes | Yes | Integrated, tested locally (server not deployed) | Integrated |

## Evidence per game (what was actually run)

Logic tests: `node --test tests/js/*.test.js` (90 tests). Browser tests: `tests/e2e/kit-games.e2e.js`
(36 tests: every new game at 1366×900, 375×812 and 320×640, loaded through the site's game player,
plus a real-input check on desktop). Emulated viewports in desktop Chrome, **not** real phones.

| Game | Logic tests | Real-input browser check |
|---|---|---|
| Highway Rush | Every generated traffic row leaves a reachable gap (2000 rows × 3 difficulties); a reactive bot survives 2 min at top speed on every difficulty | Arrow key steers the car |
| Brick Breaker | All 8 levels fit and contain breakable bricks; a tracking bot clears all 8 levels; collisions, power-ups, life loss | Space launches, ball scores |
| Fruit Slice | Swipe/segment hits, combo multiplier and window, bomb penalty, waves never start with a bomb, round ends at 60 s | Mouse swipe slices fruit |
| Space Shooter | Bullet patterns per weapon level, pickups, boss every 5th wave, bot reaches wave 4 and defeats a boss | Keyboard + auto-fire destroys enemies |
| Memory Match | Pair dealing, match/miss/settle, 2P turn passing, perfect game = 3 stars | Full easy board played by clicking |
| Tic Tac Toe | All win lines, draws, move validation; **hard AI never loses (exhaustive search over every game)**; medium always wins/blocks | Full round vs computer by clicking |
| Snake Arena | Turning rules and input queue, growth, wall/self collisions, tail chasing, speed cap, greedy bot | Arrow key turns the snake |
| Tile Fusion | Merge rules (each tile merges once), all 4 directions, no-op moves, game over, win, undo limit, same seed = same game | Arrow keys slide, Undo works |
| Tower Builder | Perfect/cut/miss drops, overhang cut on the right side, streak widening, speed ramp | Three timed clicks stack floors |
| Bubble Shooter | Hex neighbours, pops, floating drops, wall bounces, ceiling drop → game over, bombs; an aiming bot clears levels 1–2 on 3 seeds | Mouse aim + fire |
| Car Parking | Rotated-rectangle collisions, driving/steering, crash and park rules; **every level proven solvable by an automatic path search** | Drives into the bay with the keyboard and parks |
| Chess | **Perft counts match published values** for 5 standard positions (start position to depth 4, "Kiwipete" to depth 3, …); SAN, checkmate, castling, en passant, promotion choice, all draw rules, undo, AI | e4 by clicking, computer replies, illegal move refused |

## Known limitations (development phase)

- Rights records for games 04–15 were approved by the owner on 2026-11-18.
- Online play exists for Tic Tac Toe and Chess but **only locally**: no server is deployed, `multiplayer.server_url` is empty, so the public build shows no online buttons or badges.
- The Privacy Policy does not yet mention online play; update it before enabling online play publicly.
- Not tested on real Android/iOS devices, Safari or Firefox, with a screen reader, or on low-end hardware.
- Highway Rush, Fruit Slice and Snake Arena have no local 2-player mode (their brief lists multiplayer as future work).
- Chess AI is a simple 1–3 ply search: fine for casual play, not a strong engine.
- Chess pieces use Unicode symbols from the visitor's system fonts; appearance varies by platform.
- Tile Fusion slides tiles without a movement animation (merged and new tiles do animate).
- Sounds are short synthesised tones (no audio files); all games have a mute button.

## Multiplayer evidence (Batch 3)

| Suite | Result |
|---|---|
| `server/` unit + real-socket tests (`npm test`) | 22/22 pass: codes, every join error, host-only start, single start, countdown, turn/legality checks, server-decided results, rematch role swap, reconnect within grace, forfeit after grace, host close, expiry, room cap, rate limit, origin refusal, no token/password leaks |
| `tests/e2e/online.e2e.js` (two browser contexts, local server) | 4/4 pass: full Tic Tac Toe match + rematch lobby; invite link prefill + leave; online button hidden when the server is unreachable; full Chess game to checkmate with a page reload mid-game resuming the same seat and match. Skipped (not passed) when `MP_SERVER` is not set. |
