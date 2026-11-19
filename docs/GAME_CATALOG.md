# Game catalog

All 15 games are original code written for Gridlight Arcade. `data/games.json` is the source of truth;
this table summarises it. "Local 2P" / "local 2–4P" means players sharing one device. Online play is live for
Tic Tac Toe and Chess (server on Render, see `DEPLOYMENT_GUIDE.md`).

| # | Game | Slug | Category | Modes today | Rights record |
|---|---|---|---|---|---|
| 01 | Pathforge | `pathforge` | Strategy | Solo vs AI (3 levels), local 2P | approved (initial import) |
| 02 | Neon Dodge | `neon-dodge` | Arcade | Solo | approved (initial import) |
| 03 | Chroma Shift | `chroma-shift` | Puzzle | Solo, 30 levels | approved (initial import) |
| 04 | Highway Rush | `highway-rush` | Racing | Solo, 3 difficulties | approved by owner (2026-11-18) |
| 05 | Brick Breaker | `brick-breaker` | Arcade | Solo, 8 levels | approved by owner (2026-11-18) |
| 06 | Fruit Slice | `fruit-slice` | Action | Solo, 60 s rounds | approved by owner (2026-11-18) |
| 07 | Space Shooter | `space-shooter` | Shooting | Solo, endless waves + bosses | approved by owner (2026-11-18) |
| 08 | Memory Match | `memory-match` | Brain | Solo, local 2–4P (turns), 3 boards | approved by owner (2026-11-18) |
| 09 | Tic Tac Toe | `tic-tac-toe` | Board | Solo vs AI (3 levels), local 2P, online 2P | approved by owner (2026-11-18) |
| 10 | Snake Arena | `snake-arena` | Arcade | Solo, local 2P (two snakes, one arena), 3 speeds | approved by owner (2026-11-18) |
| 11 | Tile Fusion | `tile-fusion` | Puzzle | Solo (requested as "2048") | approved by owner (2026-11-18) |
| 12 | Tower Builder | `tower-builder` | Skill | Solo, local 2–4P (shared tower) | approved by owner (2026-11-18) |
| 13 | Bubble Shooter | `bubble-shooter` | Puzzle | Solo, levels | approved by owner (2026-11-18) |
| 14 | Car Parking Challenge | `car-parking` | Simulation | Solo, local 2–4P (pass and play), 9 levels in 3 difficulties | approved by owner (2026-11-18) |
| 15 | Chess | `chess` | Board | Solo vs AI (3 levels), local 2P, online 2P | approved by owner (2026-11-18) |

## Naming note: Tile Fusion

The brief asked for "2048". *2048* is the name of a specific existing game, so this project ships the same
sliding-merge number mechanic under an original name and an original visual design. Reaching the 2048 tile is
still the goal. If you would rather use another name, change `title` in `data/games.json` and the logo text in
`games/tile-fusion/index.html`.

## What "pending" means

New games are registered with a **pending** rights record. The strict build used by the GitHub Pages
deployment refuses to publish them until the owner approves each record:

```bash
python scripts/rights_review.py approve rights-<slug> --by "Your name" --note "What you checked"
```

Until then they appear only in local preview builds (`--preview-pending`), which carry a visible
"Preview build, not for publishing" banner and are marked `noindex`.
