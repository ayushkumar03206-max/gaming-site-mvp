# Gridlight Arcade: gaming-site-mvp

A static, mobile-first website for **original HTML5 browser games**. A small Python
generator turns JSON data into a fast static site. Before anything is published, it
runs a **rights gate**, and it ships with a **consent manager**.

Three original games are included:

| Game | Genre | Highlights |
|---|---|---|
| **Pathforge** | Strategy / board | Cell-blocking race, BFS pathfinding with path-sealing prevention, vault rule, spark pickups, AI (Easy/Normal/Hard), local 2-player, undo, 7×7 or 9×9 |
| **Neon Dodge** | Arcade / action | Canvas graphics drawn at runtime, bars/shards/telegraphed lasers, difficulty ramp every 15 s, cores, pause, saved high score, keyboard + relative-drag touch |
| **Chroma Shift** | Puzzle / brain | Tap-to-shift color puzzle, 30 generated levels that are always solvable, move limit, stars, hints, saved progress, a symbol on every color for colorblind play |

No frameworks, no paid services, no third-party runtime libraries, no web fonts.

## Quick start

Requirements: **Python 3.10+** (stdlib only). Node 18+ is optional, needed only for the game-logic tests.

```bash
python scripts/build_static_site.py --strict   # build into dist/
python scripts/check_site.py                   # broken-link and page-quality check
python -m http.server -d dist 8000             # preview at http://localhost:8000
```

Run the tests:

```bash
python -m unittest discover -s tests -v
node --test tests/js/games.test.js
```

Browser end-to-end tests use Playwright (`playwright-core`, open source, Apache-2.0) with
your **installed Chrome**, so no browser download is needed. They emulate desktop, tablet and phone
viewports. That is **not** the same as testing on real Android or iPhone devices.

```bash
npm install
python -m http.server 8766 -d dist        # in another terminal
BASE_URL=http://localhost:8766/ npm run test:e2e
BASE_URL=https://ayushkumar03206-max.github.io/gaming-site-mvp/ npm run test:e2e   # live site
```

Locally the custom 404 page links to `base_path` (`/gaming-site-mvp/`). Every other page uses
relative links and works at any path.

## Project layout

```
data/
  site.json              site name, base_url, contact email (edit before launch)
  games.json             game catalogue (one entry per game)
  categories.json        category list
  assets.json            rights records (schema v2), one per game and site asset
  tracking.json          optional trackers (all disabled; consent-gated)
  rights_audit_log.jsonl append-only rights decisions
games/<slug>/            each game is a self-contained module (index.html, game.js, game.css, thumb.svg)
site_src/                site CSS/JS: app.js, player.js, consent.js, site.css
scripts/
  build_static_site.py   generator → dist/
  rights_gate.py         decides which games may be published
  rights_review.py       approve / reject / revoke records (writes audit log)
  migrate_rights.py      upgrades assets.json from schema v1 to v2
  check_site.py          link and page checker for dist/
tests/                   Python unittest + Node game-logic tests
docs/                    rights & consent, adding a game, deployment, references
```

## Generated pages

Home (hero, featured, trending (curated), new, categories, popular with you (stored only on the
visitor's device), recently added, about), All Games with category filter, Categories plus one page
per category, one page per game (player, instructions, controls, details, related games, share,
fullscreen, JSON-LD), Search, About, Contact, Privacy, Terms, Game Licensing (generated from
assets.json), FAQ (with FAQPage JSON-LD), custom 404, sitemap.xml, robots.txt.

The site never shows fabricated play counts, ratings or reviews. A test enforces this.

## How games plug in

Each game page loads `play/<slug>/index.html` in an iframe **only after the visitor presses
Play**, which keeps page loads light. The host and the game talk through `postMessage`:

| Direction | Message | Meaning |
|---|---|---|
| game → host | `{type:'gl:ready'}` | hide the loading spinner |
| game → host | `{type:'gl:error', message}` | show the error state with a Retry button |
| host → game | `{type:'gl:restart'}` | the Restart button |

If no `gl:ready` arrives within 15 s, the player shows the error state.
See [docs/ADDING_A_GAME.md](docs/ADDING_A_GAME.md).

## Before launch

1. Set `base_url` and `contact_email` in `data/site.json`.
2. Have the Privacy and Terms templates reviewed for your jurisdiction.
3. Deploy `dist/`. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
