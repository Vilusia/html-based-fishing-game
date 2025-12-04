# Agent Guidelines for HTML Fisher

## Development Commands
- **Run Client:** `npm run dev` (Starts Vite dev server on port 8000)
- **Build:** `npm run build` (Runs `tsc` type checking and `vite build`)
- **Run Server:** `npm run server` (Starts dedicated Node.js server on port 8080)
- **Testing:** No automated tests exist.
  - *Manual:* Start server, open `http://localhost:8000` in multiple tabs.
  - One tab hosts (P2P) or connects to dedicated server; others join.

## Code Style & Conventions
- **Language:** TypeScript (Strict) for `src/data` & `src/types`, ESNext (Vite) for `src/main.js`.
- **Formatting:** 2 spaces indent, semicolons required.
- **Naming:** `camelCase` for functions/vars, `UPPER_SNAKE_CASE` for constants.
  - Three.js objects: `camelCase` (e.g., `waterMesh`).
  - HTML IDs: `kebab-case`.
- **Network:** Message types use `snake_case` (e.g., `{ type: 'spawn_prop' }`).
- **Structure:** 
  - `src/main.js`: Core game logic (Migrated from legacy).
  - `src/data/`: Game data (Fish, Items).
  - `index.html`: Entry point.
  - Hybrid architecture (P2P + Dedicated).
  - Central `FISH_TYPES` config must match on client and server.
  - See `CLAUDE.md` for detailed architecture and event flows.
