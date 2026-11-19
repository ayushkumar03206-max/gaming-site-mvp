# Deployment guide

Two independent parts:

| Part | Where | Status |
|---|---|---|
| Static site (`dist/`) | GitHub Pages, deployed by `.github/workflows/pages.yml` on every push to `main` | Live with 3 games. The 12 new games deploy only after their rights records are approved. |
| Multiplayer server (`server/`) | Any Node.js host that supports WebSockets | **Not deployed.** No account or URL is configured. |

Nothing below has been done on a real host yet; it is the procedure to follow.

## 1. Static site (unchanged)

`pages.yml` runs the tests, builds with the **strict** rights gate and deploys. While any published game's rights
record is `pending`, the strict build stops and the live site stays as it is. That is intended.

Local preview, including pending games:

```bash
python scripts/build_static_site.py --preview-pending
python scripts/serve.py 8765 dist
```

## 2. Multiplayer server

### Requirements

- Node.js 18+ (tested locally with Node 24), WebSocket support, HTTPS.
- **Deploy the whole repository**, not only `server/`: the game adapters load the shared rules from
  `games/tic-tac-toe/ttt-logic.js` and `games/chess/chess-rules.js`. Build/start commands run inside `server/`:
  - install: `cd server && npm ci --omit=dev`
  - start: `cd server && npm start`
- One instance only (rooms are kept in memory). A restart ends all rooms.

### Environment variables

| Variable | Example | Required |
|---|---|---|
| `NODE_ENV` | `production` | yes |
| `ALLOWED_ORIGINS` | `https://ayushkumar03206-max.github.io` | yes (server refuses to start without it in production) |
| `PORT` | set by most hosts automatically | host-dependent |
| `TRUST_PROXY` | `1` when behind the host's load balancer (needed for per-IP limits) | usually |
| `RECONNECT_GRACE_MS`, `ROOM_IDLE_TTL_MS`, `ROOM_MAX_AGE_MS`, `MAX_ROOMS`, `MAX_CONNECTIONS_PER_IP` | see `ROOM_SYSTEM.md` | optional |

No secrets are needed. Never commit a `.env` file (`server/.env.example` lists the variables).

### Hosting choice and cost

Many hosts can run this (any service that runs a long-lived Node.js process with WebSockets: container platforms,
PaaS providers or a small VPS). **Pricing and free tiers change; check the provider's current terms before
choosing.** Free tiers often put idle services to sleep, which means the first visitor waits for a cold start and
the health check may fail briefly; the site then simply hides online play. If a paid plan is needed, decide that
before creating the account; nothing in this repo requires a paid service.

### Render (free plan) — the chosen host

`render.yaml` at the repo root is a Render Blueprint for this server: free plan, Node 22, the build/start commands
above, `/health` as the health check, and the environment variables (no secrets). It redeploys only when
`server/**`, the shared rules files or `render.yaml` change, so ordinary site pushes do not restart rooms.

1. Sign in at render.com with GitHub (the owner does this; no card is needed for the free plan).
2. Give Render access to this repository only.
3. **New → Blueprint**, pick this repository, keep the service name `gridlight-mp`, and apply.
4. When the deploy is live, open `https://<service>.onrender.com/health`.

Free-plan behaviour: the service sleeps after about 15 minutes without traffic and needs up to about a minute to
wake. The game shows a disabled "Starting online server… (up to a minute)" button while it keeps checking
`/health` (up to 100 s), then enables it, or hides it if the server never answers.

### After deploying

1. Open `https://<your-server>/health`: it must return `{"ok":true,...}`.
2. Set the URL in `data/site.json`:
   ```json
   "multiplayer": { "server_url": "https://<your-server>" }
   ```
   The build refuses non-HTTPS URLs (except `http://localhost` for testing).
3. Run the online browser tests against the deployed server and a local build:
   ```bash
   python scripts/build_static_site.py --preview-pending --mp-server https://<your-server>
   python scripts/serve.py 8765 dist
   ```
   The local origin `http://localhost:8765` must be in `ALLOWED_ORIGINS` for this test; remove it again afterwards.
   ```bash
   BASE_URL=http://localhost:8765/ MP_SERVER=https://<your-server> node --test tests/e2e/online.e2e.js
   ```
4. **Update the Privacy Policy before enabling online play publicly.** Online play sends the chosen display name,
   room activity and the player's IP address (as with any connection) to the multiplayer server and its host.
   The current policy text does not cover this yet. This needs the owner's (and ideally a legal) review.
5. Commit `site.json`, merge to `main`. Online buttons and "Online" badges appear only for games with
   `modes.online: true`, and only while `/health` answers.

## 3. Environments

| Environment | Site | Server URL in the build |
|---|---|---|
| Development | `python scripts/serve.py` on localhost | `--mp-server http://localhost:3001` |
| Staging | a separate Pages site or preview build | `--mp-server https://<staging-server>` (needs its own `ALLOWED_ORIGINS`) |
| Production | GitHub Pages from `main` | `data/site.json` → `multiplayer.server_url` |

## Local development of online play

```bash
cd server && npm install && ALLOWED_ORIGINS=http://localhost:8765 PORT=3001 npm start
python scripts/build_static_site.py --preview-pending --mp-server http://localhost:3001
python scripts/serve.py 8765 dist
```

Open `http://localhost:8765/games/tic-tac-toe/` in two different browsers (or one normal + one private window).

### Local browser tests now that `server_url` is set

`data/site.json` points at the Render server, which only accepts the real site origin. A local build served from
`http://localhost:8765` would therefore log CORS errors and fail the "no console errors" checks. For local e2e runs,
build with online play switched off, and test online play separately with `SERVE_DIR` (see `tests/e2e/online.e2e.js`):

```bash
python scripts/build_static_site.py --mp-server ""
```
