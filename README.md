# HTML Fishing

A browser-based multiplayer fishing game. The game is **peer-to-peer** — players
host their own lobbies directly — with a master server that acts purely as a
*directory* so lobbies can be found without sharing room codes.

This document covers how the pieces fit together, how to run each part, and the
save-file format. For gameplay, just open the game.

---

## Quick start

Serve the folder with any static file server and open `index.html`:

```powershell
python -m http.server 8000
```

Then visit <http://localhost:8000/>.

The game needs a static origin (not `file://`) because it uses WebRTC, WebAudio,
and `localStorage`.

---

## Architecture

| File | Role |
| --- | --- |
| `index.html` | Markup, styles, and all overlay screens (menus, shop, journal, progress, server browser) |
| `core.js` | Shared constants: save-state defaults, XP tables, keybinds, `GAME_VERSION`, `SAVE_VERSION` |
| `ui.js` | The bulk of gameplay and UI: fishing minigame, inventory, shop, skills, journal, server browser, master-server client |
| `fish.js` | Fish catalogue (regular, lava, rain, void) |
| `worldgen.js` | Island/world generation: terrain, zones, trees, rocks, flowers |
| `props.js` | Placeable props and prop networking |
| `character3d.js` | Character mesh generation |
| `level-loader.js` | Loading custom levels exported from the editor |
| `icons.js` | Pixel icon helpers |
| `audio.js` | Sound effects and music |
| `networking.js` | PeerJS globals for P2P play |
| `progression.js` | Achievements, daily bounties, and quests |
| `editor.html` / `editor.js` | Standalone level editor |

### Script load order

`index.html` loads scripts in dependency order:

```
icons.js → worldgen.js → core.js → fish.js → character3d.js →
networking.js → audio.js → progression.js → ui.js →
props.js → level-loader.js
```

`progression.js` must come **after `core.js`** (it reads save state) and
**before `ui.js`** (ui.js calls its `notify*` hooks). Several globals are
referenced across files without modules — that is deliberate, to keep the game
loadable straight from a file server.

### Entry point

`window.onload` (in `ui.js`) runs `loadSave()`, seeds the progression systems,
then shows the lobby screen and starts the render loop.

---

## Multiplayer

### P2P

When a player clicks **Make Lobby**, they become the host. Other players join
either by room code or by picking the lobby out of the server browser.

- Hosting uses PeerJS. The host's peer identity is stable across sessions
  (`myDeviceID`, derived from the `fish_device_id` local-storage key), so the
  same machine never appears twice in the browser.
- The host publishes its lobby to the master directory, then heartbeats every
  10 seconds. Lobbies are dropped after 60 seconds without a heartbeat.
- Leaving the page unregisters via `navigator.sendBeacon`, so closed tabs
  disappear promptly instead of waiting for TTL.

### Master server (directory only)

The master server is a thin HTTP/JSON directory. It never relays gameplay
traffic — all game data still flows peer-to-peer.

Endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/servers` | List live lobbies |
| `POST` | `/register` | Publish a lobby |
| `POST` | `/heartbeat` | Keep a lobby alive |
| `POST` | `/unregister` | Remove a lobby |

Notes:

- POST bodies are sent as `text/plain` so browsers skip the CORS preflight and
  `sendBeacon` works.
- Responses allow `Access-Control-Allow-Origin: *`.
- Per-IP rate limiting and TTL pruning protect the directory.
- Tags are sanitized server-side; lobbies carry an `adult` flag for 18+ rooms.

**Running it** (stdlib only, no `pip install` needed):

```powershell
python "Master Server Code/master_server.py"
```

Useful flags:

- `--port` — listen port (default `8081`)
- `--host` — bind address
- `--data <path>` — persist the directory to JSON and reload it on start

The client picks its master URL in `index.html`:

```js
window.MASTER_SERVER_URL = window.MASTER_SERVER_URL || (
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '')
    ? 'http://localhost:8081'
    : 'http://204.12.227.121:8081'
);
```

`window.MASTER_SERVER_URL` can be overridden before that script tag.

> **HTTPS caveat:** the master URL is plain HTTP. If you serve the game over
> HTTPS, browsers block these requests as mixed content. Serve the game over
> HTTP, or put the master behind TLS.

---

## Progression systems (`progression.js`)

All three systems are **readers** of state the game already tracks (journal,
skills, inventories, money), so they add goals without touching the simulation.

### Achievements

Declared as a list of `{ id, name, desc, check(ctx) }` objects. `check` returns
`{ have, need }`, which drives both the notification and the progress bar. There
is no separate "earned" bookkeeping to go stale — an achievement unlocks the
first time its counter crosses the goal.

### Daily bounties

Three bounties are rolled per UTC day from a pool, seeded by a hash of the date.
Because the roll is deterministic, every server hands out the same set. Progress
is fed by `notify*` events; completed bounties show a **CLAIM** button.

Bounty staleness is decided by the **day alone** (`bounties.day === today`), so a
save that is edited or partially written can never silently discard progress.

### Quests

A single linear chain walking the player through the island's zones. The active
quest is re-checked on every relevant event and auto-completes, awarding gold
and advancing the index.

### Hook points

`ui.js` and `props.js` call these when the player does something:

| Hook | Called from |
| --- | --- |
| `notifyFishCaught(fish, firstTime)` | the catch path in `ui.js` |
| `notifyResourceGathered(kind, amount)` | chopping, mining, picking flowers |
| `notifyPropPlaced()` | `placeProp()` |
| `progressionTrackMoney()` | `saveGame()` — watches the money delta for the "earn gold" bounty |

The panel is opened with the **Progress** button and repaints only while
visible, so casts never pay for hidden DOM work.

---

## Save data

State lives in `localStorage` under `islandFisherSave`.

`DEFAULT_SAVE_STATE` in `core.js` defines every field; new fields are added
there so a fresh save and an upgraded save look alike.

### Versioning

`SAVE_VERSION` (`core.js`) is the schema version and is independent of
`GAME_VERSION`, so a routine content update doesn't force a migration.

#### Cache-busting pins (why "my game didn't update")

Browsers cache `index.html` itself, so editing a `.js` file does not reach
players until the matching `<script src="...?v=N">` token changes. Run

```powershell
.\bump-pins.ps1        # bumps only the pins for files changed vs. git HEAD
```

before pushing any script change, then hard-refresh once (`Ctrl+Shift+R`).
Use `-All` to bump every pin, or `-Only ui.js` for a single file.

- `loadSave()` reads the stored `saveVersion` and calls `migrateSave(from)`.
- `migrateSave()` is **additive only** — it fills in or repairs fields newer code
  expects and never discards player data.

To change the schema:

1. Add the field(s) to `DEFAULT_SAVE_STATE`.
2. Bump `SAVE_VERSION`.
3. Add a matching `if (from < N) { ... }` branch in `migrateSave()`.
4. Persist and re-read the field in `loadSave()` (if it isn't covered by a
   generic object copy).

### Key fields

| Field | Meaning |
| --- | --- |
| `money`, `inventory` | Currency and carried fish |
| `journal` | `{ [fishName]: [tierIds] }` — discovers persist after selling |
| `skills` | XP per skill (mining, lumberjack, fishing, floristry) |
| `oreInventory` / `woodInventory` / `flowerInventory` | Typed resource counts |
| `unlockedTools`, `hasGlove`, `hasGuitar` | Tool ownership |
| `unlockedBobbers`, `currentBobber` | Bobber skins |
| `lobbyName`, `lobbyPublic`, `lobbyTags`, `lobbyAdult` | Server-browser settings |
| `achievements`, `bounties`, `quests` | Progression state |
| `propsPlaced` | Lifetime prop placements (props themselves are session-scoped) |
| `saveVersion` | Schema version |

### Device identity

`fish_device_id` is a separate local-storage key holding a stable per-device id.
It is not part of the save, so importing a save on another machine does not
clone a lobby identity.

---

## Journal discovery

Undiscovered fish show as `???` with a **Undiscovered** label in place of their
rarity, so the journal doesn't spoil which unknown fish are the rare ones.

---

## Development notes

- Syntax-check before committing: `node --check <file>.js` and
  `python -m py_compile "Master Server Code/master_server.py"`.
- The game has no build step and no bundler. Edit a file, reload the page.
- Bump the `?v=` query on `index.html` script tags when changing a file, so
  browsers fetch the new copy.
