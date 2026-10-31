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

### Live deployment

| What | Where | How |
| --- | --- | --- |
| Game page | `https://htmlfishing.com` (repo files at the **root**) | Cloudflare-tunnel ingress → the folder these files are copied to |
| Lobby directory | `https://master.gaywebfishing.org` → `localhost:8081` | Same tunnel, separate ingress rule; blueprints `Master Server Code/master_server.py` |

- Deployment: run `.\deploy.ps1` (see One-command deploy below). It bumps
  cache pins, commits, pushes, and fast-forwards the server's clone.
- `core.js`'s domain guard accepts anything on `gaywebfishing.org` or
  `htmlfishing.com` (substring match, all subdomains included).
- Steps for the new `htmlfishing.com` host: in Cloudflare, add the DNS
  record as a tunnel route (wildcard or per-subdomain CNAMEs resolved through
  the same tunnel), and add the ingress rule
  `htmlfishing.com → http://localhost:PORT` alongside
  `master.gaywebfishing.org → http://localhost:8081`.

### One-command deploy (`deploy.ps1`)

Make the server's web folder a git clone, then publishing is a single command:

```powershell
.\deploy.ps1
```

It bumps cache pins (`node bump-pins.js`), commits, pushes, then runs
`git pull --ff-only` on the server over SSH.

Options:

- `-SshTarget administrator@204.12.227.121` and
  `-RemotePath /var/www/html-fishing` to override the defaults.
- `-Scp` copies files directly instead of pulling from GitHub (for a server
  that cannot reach GitHub).
- `-NoCommit` deploys whatever is already pushed.

One-time server setup:

```bash
git clone https://github.com/Vilusia/html-fishing.git /var/www/html-fishing
```

Key-based SSH from this PC (so nothing prompts for a password):

```powershell
ssh-keygen -t ed25519
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh administrator@gpu-jkey "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

`bump-pins.js` is the cross-platform (node) replacement for `bump-pins.ps1`.

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
| `housing.js` | Saved personal interiors, house entrances, and owner-approved multiplayer visits |
| `furniture.js` | Furniture catalog/prices, owned storage, grid layouts, stacking rules, and low-poly models |
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
| `GET` | `/stats` | Live totals plus weekly, monthly and yearly player history |
| `GET` | `/analytics` | Live connections dashboard and player-count graphs |
| `POST` | `/register` | Publish a lobby |
| `POST` | `/heartbeat` | Keep a lobby alive |
| `POST` | `/unregister` | Remove a lobby |

Notes:

- POST bodies are sent as `text/plain` so browsers skip the CORS preflight and
  `sendBeacon` works.
- Responses allow `Access-Control-Allow-Origin: *`.
- Listing updates and unregister require a private per-lobby capability; public IDs never authorize changes.
- Deploy the master service and browser client together. See [the directory deployment notes](Master%20Server%20Code/README.md) for the required security cutover.
- Per-IP / per-listing limits, bounded requests, and TTL pruning protect the directory.
- Tags are sanitized server-side; lobbies carry an `adult` flag for 18+ rooms.

**Running it** (stdlib only, no `pip install` needed):

```powershell
python "Master Server Code/master_server.py"
```

Useful flags:

- `--port` — listen port (default `8081`)
- `--host` — bind address
- `--data <path>` — persist the directory to JSON and reload it on start
- `--history <path>` — persist sampled player-count history (default `master_history.json`; `''` keeps it in memory)

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

### Stream Player (YouTube / Twitch)

Twitch live embeds cannot seek to a shared timestamp through the public player API.
The **Resume live for room** control only requests playback recovery for paused
viewers; it never pauses, changes channels, or resets already playing viewers.
**Restart at live (this device)** creates a fresh live-channel player locally,
without reusing the previous paused/rewound player or changing any shared
queue/source. It requests autoplay and retries muted once if sound autoplay is
blocked. The SOUND chip restores sound with a local click. Browser restrictions
can still require an initial user gesture.
**Play here** invokes playback directly from the local viewer's button click
when browser/Twitch permission is needed. Neither control promises to correct a
one-second live-buffer difference between devices.


The `screen` prop ("Stream Player") accepts a YouTube or Twitch URL. The video
is a real DOM iframe pinned to the housing with `CSS3DRenderer`, so it plays
above the WebGL canvas.

- **One-sided:** `updateScreenFacing()` hides the panel once the camera moves
  behind the housing. The picture faces the side the placer stood on, so a
  screen you just placed is always readable.
- **YouTube:** official IFrame API, muted autoplay, synced to a shared
  wall-clock anchor (`prop.startedAt`) with placer heartbeats. Live streams are
  never seeked (they stay at the live edge); VODs seek to the anchor.
- **Twitch:** plain `player.twitch.tv` iframe with `autoplay=false` and
  `parent=<current hostname>`. Twitch's autoplay policy refuses a player that
  is not visibly on screen, so the embed is **click-to-play**: the shell takes
  pointer events, Twitch's own play button provides the user gesture, and the
  click lands inside the cross-origin iframe (it never casts a line or locks
  the mouse). A short "CLICK TO PLAY" chip hints at it. Twitch audio is
  controlled by Twitch's player, not the in-game volume sliders.
- **Audio:** YouTube screens scale with both the Master slider and
  "Video Screens" (audio mixer) by proximity.

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

## Skills (`core.js` + `ui.js`)

`SKILLS` in `core.js` is the single source of truth: an array of
`{ id, name, icon, color }`. The Skills panel renders straight from it, so
adding a skill is three steps:

1. add a registry entry to `SKILLS`,
2. call `addSkillXP(id, amount)` where the activity happens,
3. `ensureSkills()` backfills the XP field on old saves automatically.

| Skill | Gained by | Effect |
| --- | --- | --- |
| Fishing, Lumberjack, Mining, Floristry | the matching gathering action | unlock better fish/trees/ore/flowers |
| **Cooking** | `cookFishByName` / `cookAllFish` | higher level lowers the burn chance (`max(5%, 40% - lvl×0.7%)`) |
| **Trading** | `sellFish()` | +1% sale price per level, capped at +50% |
| **Sailing** | launching the rowboat, and fishing from open water | flavour + the boat itself |

### Cooking

Raw fish are turned into meals worth `2.2×` (`COOK_VALUE_MULT`) via the **Cook**
button; a burnt result is still sellable at `0.4×`. Cooked meals can't be
cooked twice, so the loop is catch → cook → sell.

### Sailing

Buy the **Rowboat** from the Merchant (`hasBoat`) and press the `sail` keybind
(`KeyR`) near water to launch. While sailing the boat ignores water collision,
rides the water surface, and moves 35% faster; step ashore from land only.

#### The open ocean

The home island sits in a large but **finite** ocean: `WORLD_RADIUS` (`fish.js`)
is the hard wall, giving a 2000×2000 world. Past the beach the ground drops to
the sea bed (`OCEAN_FLOOR`) and rises again at the generated islands.

- **On foot** you can now walk/swim out into the ocean (the old edge block is
  gone). Deep water (`surface - bed > SHALLOW_DEPTH`) slows you to
  `SWIM_SPEED_MULT` and you tread the surface instead of sinking to the bed.
- **Sailing** crosses the whole ocean, so the boat is the fast way out.

`ocean.js` (`window.Ocean`) is the generator. It lays out a deterministic
archipelago of ~26 islands between `ISLAND_RADIUS + OCEAN_ISLAND_MIN_GAP` and
`WORLD_RADIUS - OCEAN_ISLAND_MARGIN`, seeded from a fixed string, so every
client in a session sees the **same** islands with no networking. Each island
is a radial dome with a beach, scattered trees/rocks (with colliders), pickable
flowers, and some carry a prop or cave mouth.

- `Ocean.heightAt(x, z)` — pure-maths height query blended into
  `getTerrainHeight` outside the home island.
- `Ocean.build(scene)` — the matching meshes, built once after `generateWorld`
  (so its flowers survive that function's array reset).
- **Custom levels** (`window.CUSTOM_LEVEL`) get their own apron: `ocean.js`
  places ~18 islands in a ring `size/2 + 80` … `size/2 + 560` around the map
  (`Ocean.layoutAround`), and the walk clamp is widened to that apron. All water
  in a custom level is swimmable, matching the home island's open ocean: the
  authored map's own sea and the apron are one continuous body, so treating the
  inner part as a barrier would wall the player in and leave the apron islands
  unreachable.

Fishing out in the open ocean pays a **deep-ocean bonus**: the further from the
home island the cast lands, the more Fishing XP and sale value (up to +80% XP
and +60% value at the far edge), plus Sailing XP when fishing from the boat.

---

## Personal houses (`housing.js`)

The default island's former cabin is now a Player House entrance. The same
enterable building is available under Buildings in the level editor and under
Props in the game. Editor placements are saved in the level file; ordinary
player-placed exterior props remain scoped to the lobby.

Interact at the front door to enter your own saved interior or request a visit
to an online lobby player's house. The owner must accept the request. Visits
expire if unanswered, owners can end a visit, and guests return outdoors if
the owner disconnects. Approval is checked by the host against the requesting
connection before accepting movement into another player's private instance.

Interiors render in a separate scene with private bounds and an exit door.
Each browser's existing game save stores `house` (version, name, wall/floor/trim
colors, furniture layout, and owned furniture storage). The owner can customize
the name and colors inside. Visiting players receive a validated copy of that house;
private-house voice audio and avatars are isolated from other instances.
Saving the house does not require staying in the lobby or keeping a host online.

**Customize → Furniture store & layout** opens the paid shop and floor-plan
editor. Buying a copy deducts money once and puts it in Storage, so cancelling
placement or reloading never loses a purchase. Click the half-unit grid to
place it; select placed objects to move, rotate in 90-degree steps (R), or
return them to Storage. The doorway/arrival area is reserved and overlapping
solid objects are rejected. Rugs can go under furniture.

Houses have a hard limit of **50 placed objects**, including stacked decorations.
The catalog ships with **76 pieces** across living room, bedroom, dining/kitchen,
study, bathroom, lighting/decor, plants and rugs, priced from small decor ($80)
to statement pieces ($3,200). Tables, desks, nightstands, bookcases, dressers,
vanities, counters, islands, shelves and pedestals provide bounded support
surfaces for lamps, plants, books, vases, clocks, typewriters and other
decorations. Decorations store their offset/rotation relative to the support, so
moving or rotating a table carries them along. Storing a support also stores its
decorations. Guests receive live layout updates but cannot buy, place or edit
the owner's objects. Models use one unlit draw per object, with no individual
point lights or animation loops.

**House stream TVs.** The Living room section includes a **Flat-screen TV**
($1,200) and a **Big Wall TV** ($3,000). Press E near either one to open the
same **Stream Queue** used by the outdoor Stream Player: add YouTube/Twitch
links, reorder them, play from the queue, and remove entries. Everyone can add
videos; the house owner controls playback, reordering and removal. The
flat-screen TV can stand on the floor or sit on the TV stand/console table. The
Big Wall TV is 4.5 units wide and hangs at mount height on the back, left or
right wall; choose the wall in the furniture editor and click along it. Up to
two TVs total can be placed, and the current video plus the whole queue travel
with the house snapshot, so visiting friends and reloads pick up where the owner
left off.

**Standing on furniture.** Most solid tops are landable: jump onto chairs,
sofas, beds, benches, stools, tables, desks, counters, dressers and cabinets.
Tall or delicate pieces (plants, lamps, wardrobes, the TV) remain walls, so the
player can never drop through them.

## Chat image protection

Inline chat images accept only direct HTTPS image URLs from these exact hosts:
`i.imgur.com`, `i.redd.it`, `preview.redd.it`, and the GIPHY media hosts listed
in `GIF_MEDIA_HOSTS`. Reddit preview query parameters are supported. Post pages,
albums, arbitrary domains, IP addresses, userinfo and custom ports do not embed.
Unsupported URLs stay escaped plain text and cause no automatic image request.
Both local and received chat use the same validation; a modified sender cannot
bypass the receiving client's rules. GIF previews use the same URL validation.

The early `img-src` CSP in `index.html` also restricts redirected image
requests. Keep its exact host list in sync with the JavaScript allowlist
(the regression test checks this). Local/generated game art still loads.
Chat/GIF images use `no-referrer`; approved providers still receive the viewer's
network request and IP. This limits arbitrary image tracking; it is not an
image proxy or an anonymity guarantee. Players must refresh after deployment.

## Chat GIF search (`ui.js`)

A **GIF** button beside the chat box opens a search panel. Picking a result
sends the GIF's direct URL as a normal chat message, so it travels through the
ordinary chat pipeline and renders inline via `safeEmbedImage` — no new network
message type.

Setup: put a free **GIPHY** API key in `GIF_API_KEY` (`ui.js`). Without one the
panel opens and reports that search is not configured.

- **Why GIPHY and not Tenor:** Google shut the Tenor API down on 30 June 2026
  and stopped issuing keys in January 2026. GIPHY runs Tenor-compatible `/v2/*`
  endpoints (`GIF_API_HOST`) that take the same request and return the same
  `results[].media_formats.*` shape, so switching back would be a one-constant
  change.
- **Security:** `isAllowedGifUrl` permits only GIPHY media hosts, HTTPS, and
  image extensions. Both the picker and *incoming* chat text are filtered
  through it, so a peer cannot post an arbitrary `.gif` URL and force every
  client to fetch it. Lookalike hosts such as `media.giphy.com.evil.com` are
  rejected. Search results are filtered to `rating=pg`.
- **Caveats:** the key is visible in the page source, and GIPHY beta keys are
  limited to 100 calls/hour. Move search behind the master server if either
  becomes a problem.


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
| `skills` | XP per skill (mining, lumberjack, fishing, floristry, cooking, trading, sailing) |
| `oreInventory` / `woodInventory` / `flowerInventory` | Typed resource counts |
| `unlockedTools`, `hasGlove`, `hasGuitar`, `hasBoat` | Tool ownership |
| `unlockedBobbers`, `currentBobber` | Bobber skins |
| `lobbyName`, `lobbyPublic`, `lobbyTags`, `lobbyAdult` | Server-browser settings |
| `achievements`, `bounties`, `quests` | Progression state |
| `propsPlaced` | Lifetime prop placements (props themselves are session-scoped) |
| `saveVersion` | Schema version |

### Device identity

`fish_device_id` is a separate local-storage key holding a stable per-device id.
It is not part of the save. Public directory IDs are separate random identities
for each hosting tab, with capabilities held only in memory.

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

## Hourly fishing tournaments

Each multiplayer lobby automatically runs a tournament on the hour using the
host clock. Catch fish to enter; the most catches wins. First, second, and third
receive $5,000, $2,500, and $1,000 in game cash. Ties go to whoever reached the
score first. Boots do not count. Expand the tournament panel for standings and
last winners. Only catches completed within the same hour as their cast count.

The host validates connection identity, known fish, one catch per cast token,
and a 2-second minimum / 3-minute maximum cast duration. Scores and prizes are
computed by the host; repeated prize messages are deduplicated in the save.
These are basic checks, not protection against a modified host or client.
Tournaments reset if the lobby closes; disconnected winners can receive pending
prizes if they reconnect with the same peer ID while that host session remains open.

Tournament qualification: at least 3 distinct players must record a valid catch and at least 10 valid fish must be caught in total. If either minimum is missed, the host cancels the round with no winners or prizes and announces the reason. The next hourly round starts normally.

### Interior upgrades and rooms

Inside your own house, choose Customize to buy the Spacious interior (18×14,
$10,000), then the Grand interior (24×18, $25,000). The exterior building stays
the same size. Existing saves start with the Cozy 12×10 interior. Upgrades are
one-time purchases and cannot be downgraded.

In Furniture store & layout → Room building, buy Room walls ($400 each) and
Open doorways ($600 each). Place them on the grid and use Rotate / R to build
rooms; doorway openings are walkable. Move or store these pieces like furniture.
The main exit and arrival space must stay clear. Pieces count toward the existing
size-based furniture and construction limits.

Interior size, purchased pieces, and their layouts save in the existing browser
save. Upgrades and layout changes sync to approved visitors immediately, including
expanded movement bounds. Visitors cannot edit or purchase upgrades for the owner.

House TVs start idle in each new page session: loading a save clears previous TV videos and playback queues from placed and stored TVs. TV ownership, placement, and all other house customization remain saved. Live playback still syncs to visitors during the current session.

Room walls and doorway frames use the chosen house wall and trim colors. During placement and movement, room pieces snap to nearby piece edges and the room perimeter, including corner joints. Exact joint offsets are preserved in saves and visitor snapshots; ordinary furniture keeps its half-unit grid. Existing walls can be moved to snap into alignment.

The floor-plan grid is aligned to house coordinates; small squares are 0.5 units, and the shaded area outside the outlined room is not floor space. Cursor mapping keeps precise joint offsets before snapping. Select a Room wall or start placing one to set Wall length (0.5–6 units in 0.25-unit steps); click the grid to confirm a resize. Existing pieces default to 3 units. Lengths save, survive storage, and sync to visitors. Doorway openings remain their fixed size.

### Draw rooms

House → Customize → Build rooms & furniture now opens Draw room by default.
Drag from one corner to the opposite corner on the floor plan, choose the doorway
side, then click Build room to buy the whole rectangle. Nothing is charged while
previewing. Rooms need at least 4×4 units (4.5 units deep for left/right doorways).
Long wall runs split into panels automatically, with one walkable doorway.

Stored walls and doorways are reused before new panels are purchased. The shown
price includes only missing pieces at their catalog prices. The full transaction
checks cash, collisions, the main entrance, and the size-based limits before changing
the save. Store whole room removes that room's grouped walls into storage while
keeping its interior furniture. Room groups, layout and colors save and sync to
visitors. Existing individual wall layouts remain editable via Shop and Storage.

Kitchen counters/islands, refrigerators, stoves, sinks, cabinets, wardrobes, dressers, bookcases and desks can sit flush against walls. Moving them near a perimeter or room partition snaps their actual footprint against it, including rotated placement. Precise fixture coordinates persist in saves and visitor updates. Wall overlap and entrance clearance checks still apply.

The furniture Shop uses category tabs (Classics, Living room, Bedroom, Dining & kitchen, and the other catalog categories). Only the selected category is listed. Tabs stay above a contained vertical item scroller, with non-shrinking purchase buttons and a responsive layout that avoids horizontal overflow. Switching categories preserves the surrounding panel scroll position.

### House capacity and efficient visitor sync

| Interior | Furniture (including stacked items) | Walls and doorways |
| --- | ---: | ---: |
| Cozy | 75 | 30 |
| Spacious | 125 | 50 |
| Grand | 200 | 80 |

Storage holds 300 pieces. Each house still allows at most two placed TVs.
Limits are enforced in placement, rectangle building, normalization of saved
layouts and host-relayed house data, and are shown separately in the layout UI.

Visitors receive a full initial house snapshot, followed by changed/removed
items and house metadata rather than every item on each edit. The host publishes
at most one layout update per owner per 250 ms, coalescing rapid edits to the
latest state. Pending updates are flushed by host housekeeping and removed on
disconnect. Unchanged snapshots are not rebroadcast. Incremental rendering keeps
unchanged meshes and TV players; only changed geometry/media are rebuilt. Owner
to host updates still supply full snapshots; saves remain full local snapshots.

### Expanded house catalog

The furniture catalog now contains 150 purchasable items, including 72 new
household pieces. Existing category tabs gain more seating, beds, storage,
kitchen appliances, bathroom furnishings, study items, plants and rugs. New
Hobbies & games, Laundry & utility and Coastal decor tabs include decorative
instruments, a chess table, sewing and painting equipment, laundry appliances,
fishing displays, model boats and nautical ornaments. Small countertop pieces
can be placed on compatible tables, counters and shelves. Hobby objects are
decorative; only the existing TVs have media playback controls.

All new models use one unlit vertex-colored mesh per item with at most 300
triangles and no per-item lights or textures. They follow the existing prices,
paid ownership, capacity limits, storage, save/reload and visitor sync paths.

Furniture shop and storage cards show cached 3D item thumbnails. One shared offscreen renderer frames each actual furniture model into a 128×96 image. Wall thumbnails use current house colors and stored wall lengths. No media players or remote assets are loaded for previews. If thumbnail rendering is unavailable, the labeled purchase/place buttons remain usable.

New household furniture supports jumping onto appropriate modeled surfaces: upholstery cushions/arms/backs, bed mattresses, tables, counters, stools, benches, trunks, low cabinets and flat laundry appliances. Seat heights follow each model rather than its full decorative height. Rotated furniture transforms landing parts with the mesh; canopy posts remain solid around the mattress. Grounded players are not lifted onto furniture automatically. Tall cabinets, plants, lamps and fragile decorations remain non-platform obstacles.

House rendering removes coplanar overlapping faces within catalog models, preserving later decorative surfaces while cutting covered earlier triangles. Room and entrance trim joints avoid overlapping end caps; flush root items render 0.008 units inside the perimeter plane while logical placement remains exact. Overlapping rugs have stable ID-based depth offsets and ordering. These changes preserve single-draw models and the 300-triangle budget. Regression audits cover all 150 models and an assembled room with snapped partition corners.

### Catch showcases, paint, collections and layouts

In House → Customize → Build rooms & furniture, select a placed object and
choose Color / catch display. Change its main color, or choose an inventory fish
for an aquarium or Catch display plaque. Displays are saved showcase copies;
they do not consume inventory fish. Display colors and specimen details survive
storage, presets and visitor sync. Room pieces still use house wall/trim colors.

Customize → Fishing collections shows three journal-backed species sets with
exclusive furniture and collector-title rewards. Each collection may be claimed
once; claiming unlocks further purchases of its reward furniture. Titles are
equipped in the cosmetic shop and cannot be bought before completing the set.
Existing journal catches count toward collections.

Customize → Saved house layouts supports five named presets. Loading uses only
items still owned, stores other pieces, respects storage and placement limits,
and fails without changes if a required item is missing. Presets never mint
furniture or restore saved TV playback. Presets remain private local save data;
only the resulting live layout is sent to visitors.

The no-HUD key also hides the house status controls and tournament widget;
background updates cannot force either widget back onscreen.

Four ultra-rare golden color variants of real species (Common Carp, Rainbow Trout, Largemouth Bass, Atlantic Salmon) can be hooked anywhere, including rain, lava, void and secret pools. Each species has an independent selection interval of 1/10,000 per hook (4/10,000 combined), unaffected by zone or bait weights. They use Legendary difficulty, their species models, gold colors, and the usual size/tier rolls. They are registered in the journal and name lookup and count as valid tournament catches. Golden coloration is a game variant, not a claim about natural coloration.

Tournament update (v12.372): fixed top-three prizes and cancellation thresholds are replaced by $100 per valid catch for every participant, paid at the hourly boundary. No minimum player count or catch total is required. Rankings remain informational, including a top-ten reward preview. Offline/custom-map solo sessions use a local authority; multiplayer uses the lobby host. Duplicate catch/payout protection remains active. Earlier fixed-prize/minimum descriptions above are superseded by this rule.

Tournament balance (v12.373): hourly payouts are now $5 per valid fish, superseding the $100 rate above. Solo eligibility, no minimums, and catch/payout validation remain unchanged.

The Escape menu is organized into Audio, Display, Controls, Save data and Session tabs. A fixed header/navigation and Resume footer surround one contained scrolling content area. Existing settings, audio input, key rebinding, save import/export/delete, tutorial, respawn and leave actions retain their handlers. Tabs support arrow/Home/End navigation and remember the last section during a page session; mobile users see touch-control guidance instead of keyboard bindings.

Escape closes the top-most open menu or dialog (shops, scratch cards, inventory, options, trades, screen queue, and similar overlays). Lucky Lou's scratch card panel uses its own in-panel Close button instead of the floating red X.

The guided tutorial is a right-side quest list that measures the live tournament HUD rectangle and sits above it. Anchor ads changing `--game-anchor-space`, or an expanded tournament, therefore move the tutorial card up instead of letting it overlap. It shows the current chapter and step count, a prominent Do this instruction, progress bar and the current chapter's steps with completed, current and upcoming states. Objectives complete automatically: read-only steps show their full explanation in a centered, non-blocking card for a short reading pause, action steps check off and advance after a short delay, and unavailable targets move on automatically. There is no Next button. Action events are recorded even before the tracker initializes or while paused, which keeps progress reliable for remote players. The ? button reveals full instructions and chapter jumping, the pause icon stops the run, and the minimize icon collapses the tracker to its header. The tracker remains hidden while menus or the written guide are open and the direction arrow continues to point at nearby targets.

Retro shader (v12.510): Display & performance offers a pixel shader with 2×, 3× or 4× internal pixels, a gentle color grade, soft vignette and light grain. It is enabled by default for new and existing saves; an explicit OFF choice is remembered from then on. It renders into a nearest-neighbour target before an alpha-preserving upscale, so CSS3D video screens and the existing depth punch continue to work.

Lighting enhancement (v12.511): the world renderer uses ACES filmic tone mapping with warmer hemisphere bounce, a non-shadowing cool fill light, a brighter moon and revised sunrise/sunset blends. Rain dims the full light mix instead of only the sun, and lava/Void scenes set their own sun, ambient and fill values. These scene-light changes apply with the retro shader both on and off.

Rain effects (v12.517): rain is drawn as a local box of 1,600 thin, wind-slanted line streaks that follow the player instead of square point sprites. The audio graph uses a 260 Hz high-pass and 5.2 kHz low-pass on pink-noise body plus a separate 2.6 kHz high-pass hiss layer, faded in and out with the weather.

Tournament podium bonus (v12.376): every participant still earns $5 per valid fish. If at least three distinct participants have a valid catch in the round, the top three additionally earn $100 / $50 / $25. Solo and two-participant rounds receive no podium bonus. Ties retain first-to-score ordering. Live reward projections include the bonus only while eligible.

Tournament podium adjustment (v12.377): bonuses are now $5,000 / $2,500 / $1,000 when at least three participants record a valid catch. The $5-per-fish base payout remains additional for everyone.

Catch display interaction update (v12.378): aquariums and catch plaques use createFishTexture, the same species-specific 2D sprite generator as actual caught fish. Walk within interaction range and press the bound interact key (E by default) to view/change a catch. Only the house owner gets editing controls; guests can inspect the displayed specimen. The house layout menu now only offers recoloring and placement. R / Rotate cycles wall-mounted items through back, right, front and left walls, with an immediate preview and front-wall save/sync support. The old wall dropdown is removed.

Catch custody (v12.379): displays now consume an exact currently-owned inventory specimen. Clearing or replacing returns the held specimen once, retaining sale value, rarity, tier, size and zone. Stored display furniture keeps its fish. Layout presets save furniture arrangements rather than specimens; loading a preset preserves the display's current held fish instead of restoring an old one. On loading older saves, copy-only display specimens are cleared and must be deposited again. A visible in-world stats card accompanies the fish sprite.

YouTube embeds now render within a 1920×1080 iframe scaled into the existing 640×360 shell. This provides a full-HD viewport for adaptive playback without changing the world screen size or Twitch layout. YouTube no longer exposes supported forced-quality APIs, so final resolution remains its decision.

Microphone mouth animation (v12.380): local and received audio analyser levels drive a lightweight volume-reactive mouth flap in both 2D and 3D characters. It reuses existing audio streams rather than adding network packets, respects mic/peer mute, house isolation and voice range, and expires stale activity. Chat animation remains supported; live voice does not generate extra animalese blips. This is amplitude-based animation, not phoneme recognition.

Talking-mouth variety (v12.381): five shapes (ah, ee, oh, oo and smile) vary with speech timing and volume. Chat uses character-based variation. 2D mouth frames are lazily cached per character and disposed with its other materials; 3D mouths vary width, opening and tilt without adding meshes. Silence/mute restores the neutral pose. Shapes are expressive volume-driven approximations, not speech recognition.

## Hollowtide Festival 2026

The seasonal event runs October 28 through November 8, 2026, using America/New_York boundaries (including the November daylight-saving change). Dates, haunted catches, currency rules, and the exclusive reward catalog live in `halloween.js`. The module must remain available after the event so earned cosmetics and saved catches keep rendering.

- Catch ordinary fish for 2 Soul Embers, or eight haunted species for 8–40. Each haunted species gives a one-time 15-Ember discovery bonus; discovering all eight gives another 100. Boots give no currency.
- Morrow the Lantern Keeper appears on the default island’s east shore. Interact nearby to browse previews and spend Soul Embers on 12 permanent cosmetics. Cash cannot purchase these event rewards.
- In the level editor, select NPCs → Morrow · Halloween vendor and place him on land. Custom maps show the vendor only at an explicit placement, and only during the event.
- Seasonal catches have a 14% independent roll before the existing golden-fish roll; golden catches retain priority. Event catches and currency earnings stop when the event closes. Saved currency is retained.
- Regression coverage: `node --test tests/halloween.test.cjs`; use the existing golden-fish, model, shop, and tournament checks when changing the integration.

## Custom protogen signs

Selecting **Protogen Side Circles & Fins** under the character shop’s Extras
selector reveals **Draw sign** / **Edit sign** directly below that row. The
32×32 monochrome pad supports mouse, pen and touch, brush sizes, erase, undo,
clear, cancel and save. A saved sign appears in the selected eye color on both
inner side circles, in the 3D model and retained 2D renderer. A blank saved sign
restores the plain circle. Switching extras hides the editing button without
deleting the saved sign. Character saves and saved outfits include the pattern.

The sign is a fixed 256-character hexadecimal bitmask rather than a URL or
image upload. Received patterns are normalized before rendering, validated by
the inbound packet guard, and included in cosmetic-change detection. Two
circular mapped surfaces share a small texture, which is included in the
existing character atlas; logo pixels do not become individual 3D objects.

## Visual character studio

The boutique’s Character studio button opens a dedicated creator with the same
rotatable 3D preview used by the shop. Icon-led categories group body starter
species, face, ears, hair, tail, extras, owned clothing and saved looks. Style
cards and wearable shop cards render the actual 3D character builder with the
candidate feature and current appearance. One shared offscreen renderer loads
one model per frame, caches up to 192 static card images, cancels obsolete jobs,
and frees models after copying each render. Head features use closer framing;
tails use a rear view. Character previews are 3D only, with a neutral placeholder
if WebGL rendering is unavailable. Color inputs update the live model and card cache.
Body paint covers the head, torso and limbs, with a whole-body mirror toggle and
temporary outfit/hair removal while painting. The Body tab explains the workflow
with numbered steps, an active/paused paint status, Fine/Medium/Wide brushes and
an Undo stroke shortcut. Clear all asks for confirmation and can still be undone
while the studio is open. Paint is applied live and saved with the character and
outfits. Saved outfits can be shared and imported with validated outfit codes.
Preview controls offer front/side/back, face framing and zoom.

Edits auto-save and apply to the player. Undo/redo stores only bounded cosmetic
snapshots, never money, resources or unlock lists. Clothing choices are limited
to owned items; purchases remain in the boutique. The protogen sign editor is
available in Extras and participates in appearance undo. Existing saved looks
can be loaded, saved and deleted using the existing outfit functions.

Desktop uses a stage, icon rail and scrollable choice panel. Narrow screens
keep the preview above a horizontal category rail and independently scrolling
choices. Original selector IDs, character preview IDs and cosmetic networking
remain available for existing rendering and gameplay code.

## Shop hover try-on

Hover or keyboard-focus a hat, top, pants, collar, body pattern or title card
to try it temporarily in the shared character preview. The status labels this
as preview-only. Both 3D and retained 2D rendering read an isolated appearance
snapshot; no equipment, save data, money or outgoing player appearance changes.
Pointer/focus exit restores the equipped character, and tab changes, filtering,
shop closure and opening the character studio clear the temporary selection.
Actual purchase/equip buttons keep their existing behavior.
