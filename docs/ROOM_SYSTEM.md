# Room system

Code: `server/src/rooms/roomManager.js` (rules), `server/src/rooms/roomValidation.js` (input checks),
`server/src/socket/socketHandlers.js` (events), `games/_kit/gl-mp.js` (browser client + UI).
Tests: `server/tests/roomManager.test.js`, `server/tests/socket.test.js`, `tests/e2e/online.e2e.js`.

## Room codes

6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O or 1/I/L look-alikes): about 887 million codes,
generated with `crypto.randomInt`. A new code is never one that is in use or was closed in the last 24 hours.
Input is case-insensitive and ignores spaces/dashes. The server validates every code before looking it up.

## Lifecycle

```
create ──► waiting ──(all players connected + ready, host presses Start)──► playing ──(result)──► finished
              ▲                                                                                     │
              └──────────────────── ready again + host Start = rematch (roles swap) ◄──────────────┘
any state ──► closed   (host closes · everyone leaves · idle/expired)
```

- **Host**: the creator. If the host leaves, the room passes to the remaining player.
- **Start**: host only; needs `minPlayers` players, all connected and ready. A 3-second countdown follows;
  moves before it ends are refused. A running match cannot be started again.
- **Rematch**: after a result both players press Ready again; colours/marks swap every match. Scores are kept
  per room and reset when a new opponent joins.

## Join errors (shown to the player)

| Code | Message |
|---|---|
| invalid-room-id | That room code is not valid. Room codes have 6 letters and numbers. |
| room-not-found | Room not found. Check the code with your friend. |
| room-expired | That room has closed. |
| wrong-game | That room is for a different game. |
| room-full | That room is full. |
| game-started | That game has already started. |
| bad-password | Incorrect room password. |
| (network) | Could not reach the multiplayer server. / Connection lost. Reconnecting… |

## Passwords

Optional, 4–32 characters, stored only as a salted `scrypt` hash and compared in constant time.
The lobby shows that a room has a password but never the password.

## Disconnection and reconnection

- On create/join each player receives a random 128-bit **reconnect token** (kept in that browser tab's
  `sessionStorage`, never shown to other players).
- If a connection drops, the seat and match are kept for **`RECONNECT_GRACE_MS`** (default 60 s). The other
  player sees "Opponent disconnected". The Socket.IO client reconnects automatically and resumes with the token;
  reloading the page and opening online play again also resumes the same match.
- A temporary drop never ends a match. Only after the grace period is the absent player's match forfeited
  ("opponent did not reconnect"). In a waiting room, their seat is freed.
- Opening the same room in a second tab with the same token moves the seat there; the first tab is told.

## Cleanup and limits

| Setting (env var) | Default | Effect |
|---|---|---|
| `ROOM_IDLE_TTL_MS` | 10 min | Room with nobody connected is closed; a non-running room idle 3× this is closed |
| `ROOM_MAX_AGE_MS` | 3 h | Any room is closed after this |
| `MAX_ROOMS` | 2000 | New rooms refused ("server is busy") beyond this |
| `MAX_CONNECTIONS_PER_IP` | 20 | Extra sockets from one IP are refused |
| (fixed) | 8 events/s, burst 20 | Per-socket rate limit; extra requests get "Too many requests" |
| (fixed) | 8 KB | Maximum message size; actions over 300 bytes are rejected |

## Events

See the header of `server/src/socket/socketHandlers.js` for the exact payloads:
`room:create`, `room:join`, `room:resume`, `room:ready`, `room:start`, `room:leave`, `room:close`, `game:action`
(client → server, each acknowledged), and `room:update`, `room:closed`, `room:replaced` (server → client).
Each `room:update` is personalised (`you` = your seat and host flag) and never contains tokens or password data.

## Not implemented yet (honest list)

- Persistence: rooms live in memory; a server restart or redeploy ends all rooms.
- Horizontal scaling: one server process. Several instances would need a shared store (e.g. Redis adapter).
- Accounts, friends, match history, leaderboards: not built (guest names only, by design for this phase).
- Spectators and more than 2 players per room.
