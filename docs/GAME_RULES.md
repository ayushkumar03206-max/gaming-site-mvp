# Multiplayer game rules

## Same device (live)

| Game | Players | How it works | Who wins |
|---|---|---|---|
| Memory Match | 2–4 | One board, players take turns. A pair keeps the turn; a miss passes it to the next player. | Most pairs; equal top scores share the win. |
| Tower Builder | 2–4 | One shared tower. Players drop blocks in turn; each drop's points go to the player who dropped it. | The player whose block misses the tower loses; the others rank by their points. |
| Car Parking | 2–4 | Pick a level; each player gets one attempt on it, passing the device in between. | Fastest clean park; crashes rank last together. |
| Snake Arena | 2 | Two snakes in one arena at the same time. Player 1: WASD or the left pad; Player 2: arrow keys or the right pad. | A snake dies on a wall, any snake body or a head-on collision; the survivor wins the round, both dying on the same tick is a draw. Round wins are tallied until you leave. |
| Tic Tac Toe, Chess, Pathforge | 2 | Players alternate on one board. | Normal game rules. |

# Online game rules

The brief requires each game to have written multiplayer rules before online play is enabled. Games marked
**Live locally** are implemented and tested; the rest are the agreed design for later batches and are
**not available** online.

## Tic Tac Toe (turn-based): Live locally

- 2 players. Match 1: host is X; marks swap every rematch. X always moves first.
- The server accepts a move only from the player whose turn it is, on an empty cell 0–8.
- Three in a row wins; a full board with no line is a draw. The server decides the result.
- Leaving during a match, or failing to reconnect within the grace period, loses the match.

## Chess (turn-based): Live locally

- 2 players. Match 1: host plays white; colours swap every rematch.
- Every move is checked by the server with the full rules engine (castling, en passant, promotion with a choice
  of piece, check). Illegal moves and moves out of turn are refused.
- Results: checkmate; draws by stalemate, threefold repetition, 50-move rule, insufficient material, or agreement
  (one player offers, the other accepts; making a move declines a pending offer); resignation.
- Leaving or failing to reconnect within the grace period loses the game. No clocks yet (untimed).

## Memory Match (turn-based): planned

Shared board dealt by the server from one seed. The server holds the card layout and reveals a card only when
the player whose turn it is flips it (so clients cannot see unrevealed cards). A pair keeps the turn; a miss passes
it. Most pairs wins; equal pairs is a draw.

## Pathforge (turn-based): planned

Server runs `pathforge-core.js`: move or forge validated per turn; path-sealing blocks refused; first to the goal
row wins.

## Chroma Shift, Tile Fusion, Car Parking (shared challenge): planned

Both players get the same level/seed. Each player's moves (or input log) are sent to the server, which replays
them with the shared logic. Winner: Chroma Shift and Tile Fusion by score then fewer moves; Car Parking by fastest
valid park. A timeout ends the challenge; unfinished players rank by progress.

## Fruit Slice, Brick Breaker, Bubble Shooter, Neon Dodge (score competition): planned

Same seed and the same fixed duration. Scores count only if the server can verify them by replaying the input log
with the shared logic; until a game's simulation is fully deterministic, results are shown as "unverified" and not
used for leaderboards.

## Snake Arena, Highway Rush (competitive real-time): planned

Server-run simulation at a fixed tick; clients send direction/steering inputs only. Snake: two snakes in one arena,
last alive wins (head-on collision = draw). Highway Rush: same traffic seed, furthest distance wins.

## Space Shooter (cooperative), Tower Builder (alternating turns): planned

Space Shooter: two ships against shared waves, team score, run ends when both ships are destroyed.
Tower Builder: players alternate drops on their own tower with the same block speeds; tallest stable tower after
N drops wins.
