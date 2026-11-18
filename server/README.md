# Gridlight Arcade multiplayer server

Express + Socket.IO room and match server for online play. Separate from the static site.

```bash
npm install
ALLOWED_ORIGINS=http://localhost:8765 PORT=3001 npm start
npm test        # 22 tests: room rules + real-socket integration
```

Docs: `../docs/MULTIPLAYER_ARCHITECTURE.md`, `../docs/ROOM_SYSTEM.md`, `../docs/GAME_RULES.md`, `../docs/DEPLOYMENT_GUIDE.md`.

Dependencies (MIT licensed): express 5.1.0, socket.io 4.8.1; socket.io-client 4.8.1 for tests only.
The browser loads the Socket.IO client from this server at `/socket.io/socket.io.min.js`.
Deploy the whole repository: game adapters load shared rules from `../games/`.
