# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**HTML Fisher** is a browser-based multiplayer 3D fishing game built with Three.js. It's a casual MMO-style experience where players fish, customize animal avatars, voice chat, and explore procedurally-generated worlds together.

**Architecture:** Single-file client (index.html) + optional dedicated Node.js server

## Technology Stack

**Client (index.html - 9,721 lines):**
- Three.js r128 - 3D rendering
- PeerJS 1.5.2 - WebRTC peer-to-peer networking
- WebSocket API - Dedicated server connections
- Web Audio API - Voice chat and spatial audio
- Tone.js - MIDI playback for guitar system
- Canvas API - Procedural texture generation

**Server (Dedicated Server Code/server.js - 654 lines):**
- Node.js with `ws` (WebSocket library)
- HTTP/HTTPS modules for health checks and master server heartbeat
- Crypto module for admin authentication (SHA-256)
- File system persistence for ban lists

## Development Commands

### Running the Client
```bash
# Option 1: Open directly in browser (for local testing)
open index.html

# Option 2: Use a local web server (recommended for testing multiplayer)
python3 -m http.server 8000
# Then navigate to http://localhost:8000
```

### Running the Dedicated Server
```bash
cd "Dedicated Server Code"
npm install ws  # First time only
node server.js

# With environment variables
SERVER_NAME="My Server" ADMIN_PW="secret123" PORT=8080 node server.js
```

**Server Environment Variables:**
- `SERVER_NAME` - Display name in server browser (default: "Official Dedicated Server")
- `ADMIN_PW` - Admin password for moderation panel (default: "super-secret-password")
- `PORT` - WebSocket port (default: 8080)

**Server Files:**
- `banned_ips.json` - Persisted ban list
- `server_logs.txt` - Event logs (connections, chat, admin actions)

### Testing
No automated test suite exists. Manual testing workflow:

1. Start dedicated server in one terminal
2. Open 2+ browser windows to `index.html`
3. One window joins as host (P2P mode) or connects to localhost:8080 (dedicated mode)
4. Other windows join using room ID or server browser

## Architecture Overview

### Hybrid Networking Model

The game supports three connection modes:

1. **Peer-to-Peer (P2P):** Host creates a room, clients join via PeerJS room ID (e.g., "fish-1234"). Host is authoritative for game state. Suitable for private games with friends. Limited to ~8 players due to WebRTC mesh bandwidth.

2. **Dedicated Server:** Server is authoritative for player state (inventory, money, cosmetics). Clients connect via WebSocket. Supports ~100 players (single-threaded bottleneck). Server validates fish catches and transactions.

3. **Offline/Solo:** Local rendering only (no multiplayer features).

**Voice Chat:** Always uses WebRTC peer-to-peer audio, even in dedicated server mode. Server acts as signaling relay only.

### Key Systems Architecture

**State Synchronization:**
- Position updates broadcast every 50ms
- Remote players interpolated client-side using lerp (30% blend per frame)
- Visual customization (hats, colors, species) sent only on change
- Inventory/money is authoritative (server validates) in dedicated mode, client-controlled in P2P

**Message Protocol (Shared between P2P and Dedicated):**
```javascript
{ type: 'update', id, payload: {pos, rot, bobber, customization...} }
{ type: 'chat', text, name, id }
{ type: 'sound', name, variant, note } // Spatial audio + MIDI
{ type: 'request_prop', propType, x, y, z, rot } // Place decoration
{ type: 'spawn_prop', payload: {id, ownerId, type, x, y, z, rot} }
{ type: 'admin_cmd', cmd, targetId } // Moderation
{ type: 'spawnPortal', x, z } // Event trigger
```

**Fishing Mechanics:**
State machine: `IDLE → CHARGING → CASTING → WAITING → BITING → REELING → IDLE`
- Click-and-hold to charge cast (shows marker at raycast position)
- Release to throw bobber (validates water vs land collision)
- Random bite delay (3-10 seconds, influenced by bait)
- Click spam minigame (difficulty scales by rarity: 15-120 clicks, 3-5 seconds)
- Anti-cheat: Max 24 clicks/second to block auto-clickers

**Fish Generation:**
- 1000+ procedural variants (20 prefixes × 50 base names)
- Tier system: Normal → Glistening (bronze) → Shining (silver) → Opalescent (gold)
- Size modifiers: Tiny, Small, Normal, Big, Huge (affects price via 0.5x-1.7x multiplier)
- Zone-specific pools: Lake (standard), Rain (4 exclusive), Void Portal (4 exclusive), Secret Lake (higher legendary rates), Lava World (250 exclusive)

**World Generation:**
Procedural using seeded RNG (mulberry32 algorithm). Seed generates deterministic layout:
- Central lake (40-unit radius water plane)
- 4-6 random islands around perimeter
- 50-100 trees with cylinder colliders
- 3 NPC vendors (Merchant, Stylist, Bait Seller)
- Special zones: Secret Lake (north), Lava World (portal-accessed)

### Code Organization (index.html)

The client is a monolithic single-file design:

**Lines 1-696:** CSS (glass-morphic UI, responsive design)
**Lines 697-1040:** HTML structure (lobby screens, overlays, HUD)
**Lines 1041-1498:** Game configuration constants (fish data, items, prices)
**Lines 1499-2330:** Save system (LocalStorage) and UI management
**Lines 2331-3800:** Shop/inventory/customization logic
**Lines 3801-4900:** Networking (PeerJS host/client + WebSocket)
**Lines 4901-5500:** Audio system (voice chat, spatial sound, MIDI)
**Lines 5501-6500:** Connection handlers (join/host game flows)
**Lines 6501-7500:** World generation (terrain, trees, props)
**Lines 7501-8700:** Game loop and Three.js rendering
**Lines 8701-9300:** Fishing mechanics and catch minigame
**Lines 9301-9721:** Input handling and utilities

**Why single-file?** Originally a simple prototype that grew organically. Avoids CORS issues with `file://` protocol and requires zero build system.

### Procedural Asset Generation

All character textures are generated at runtime using Canvas API (no sprite sheets):

```javascript
createSpeciesTexture(species, furColor, bellyColor, isBack, hat, shirt, collar, eyeColor)
```

This function draws layers programmatically:
1. Base body shape (17 species: cat, bunny, dog, bear, fox, etc.)
2. Belly overlay with anti-aliased edge detection
3. Clothing layers (40+ shirts, 9 collars)
4. Face (front view only) with species-specific eyes/nose
5. Hat overlay (30 types, using geometric shapes or emoji)

Textures are 64×64 pixels with `THREE.NearestFilter` for pixel-art style. This approach saves ~2MB of static assets and enables infinite customization combinations.

### Server Architecture (server.js)

**Authoritative State:**
```javascript
clients = { [id]: { ws: WebSocket, meta: {id, name, isAdmin, ip, muteFlags}, props: [] } }
playerData = { [id]: { money, inventory, journal, cosmetics... } }
worldProps = { [propId]: { id, ownerId, type, x, y, z, rot } }
bannedIPs = Set<string>
```

**Key Responsibilities:**
- Validates fish catches and sell transactions using authoritative `FISH_TYPES` array
- Enforces prop placement limits (10 per player, FIFO eviction)
- Broadcasts position updates to all connected clients (O(n²) message passing)
- Simulates environment (day/night cycle synced to UTC, random rain intervals)
- Admin authentication via salted SHA-256 hashing (salt randomized per server start)
- IP-based banning with JSON file persistence
- Heartbeat to master server (`html-fishing-master-server.onrender.com`) every 30s for server discovery

**Timeout System:**
- Clients must send a message every 20 seconds (tracked via `lastSeen` timestamp)
- Server checks every 5 seconds and force-disconnects idle connections
- Prevents ghost players from abandoned browser tabs

**Security Features:**
- Checks `cf-connecting-ip` header (Cloudflare) or `x-forwarded-for` for real client IP
- Rate limiting: 1 prop placement per second, 2 chat messages per second
- Chat XSS protection via HTML escaping and URL validation
- Admin actions logged to `server_logs.txt` with timestamps

## Common Workflows

### Adding a New Fish Type

1. **Edit fish configuration** (index.html around line 1041):
```javascript
const FISH_TYPES = [
    { name: "New Fish", rarity: "Rare", chance: 5, color: "#ff0000", drain: 40, price: 125 }
];
```

2. **Update server's FISH_TYPES** (server.js line 22-52) to match for price validation

3. **Optional: Add zone-specific spawn** (search for `specialFish` arrays around line 1200)

### Adding a Hat/Cosmetic Item

1. **Add to HAT_TYPES array** (index.html around line 1150):
```javascript
{ id: 'new_hat', name: 'New Hat', price: 5000, color: '#ffffff', type: 'tall' }
```

2. **Implement rendering** in `drawHat()` function (around line 7200):
```javascript
case 'new_hat':
    ctx.fillStyle = hatDef.color;
    ctx.fillRect(16, 8, 32, 16); // Draw rectangle hat
    break;
```

3. **Update server's HAT_TYPES** (server.js line 54-92) for consistency

### Modifying Game Balance

**Fishing difficulty:** Adjust `minigame` object creation (around line 8850):
```javascript
const baseClicks = fishData.drain; // Increase for harder
const timeLimit = 3 + (fishData.drain / 30); // Decrease for faster timeout
```

**Economy:** Modify fish prices in `FISH_TYPES` or tier multipliers:
```javascript
// Around line 8920
if (tier === "Glistening") multiplier *= 1.5; // Change from 1.5x to 2x
```

**Cast distance:** Change `CAST_POWER` constant (around line 1450):
```javascript
const CAST_POWER = 50; // Increase for longer casts
```

### Adding an Admin Command

1. **Client-side: Add UI button** in admin panel HTML (around line 950):
```html
<button onclick="sendAdminCmd('new_command', targetId)">New Action</button>
```

2. **Client-side: Handle command** in `sendAdminCmd()` (around line 4200):
```javascript
ws.send(JSON.stringify({ type: 'admin_cmd', cmd: 'new_command', targetId }));
```

3. **Server-side: Implement logic** in message handler (around line 488):
```javascript
else if (msg.cmd === 'new_command') {
    const target = clients[msg.targetId];
    if (target) {
        // Perform action
        broadcast({ type: 'system', text: `Action performed on ${target.meta.name}` });
    }
}
```

### Debugging Multiplayer Issues

**Check WebSocket connection:**
```javascript
// In browser console
console.log(ws.readyState); // 1 = OPEN, 3 = CLOSED
```

**Monitor network messages:**
```javascript
// Add to ws.onmessage handler (around line 4700)
console.log('Received:', msg.type, msg);
```

**Server logs:**
```bash
tail -f Dedicated Server Code/server_logs.txt
```

**Common issues:**
- **Players not seeing each other:** Check if position updates are being sent (50ms interval). Look for `type: 'update'` messages in network tab.
- **Voice chat not working:** Verify PeerJS connection state. Check browser console for WebRTC errors. Ensure `getUserMedia()` permission granted.
- **Fish not spawning:** Validate raycast is hitting water plane. Check `bobber.y < 0.5` condition in catch logic.

## Performance Considerations

**Client-side bottlenecks:**
- Procedural texture generation is expensive (cached per sprite, but regenerates on customization change)
- Rain particle system uses 1000 THREE.Points (disable if FPS < 30)
- Voice chat spatial audio recalculation runs every frame (distance-based volume)

**Server-side bottlenecks:**
- Single-threaded Node.js limits throughput to ~100 concurrent players
- O(n²) broadcast pattern: every message sent to every client
- No spatial partitioning: players across the map receive all updates

**Optimization tips:**
- **Client:** Reduce `MAX_PLAYERS_TO_INTERPOLATE` (default 50) if FPS drops
- **Server:** Implement spatial sectors (only broadcast updates for nearby players)
- **Network:** Use binary protocol (MessagePack) instead of JSON for 50% bandwidth reduction

## Security & Moderation

**Trust model:**
- **P2P mode:** Client-authoritative (players can cheat via DevTools, modify inventory/money)
- **Dedicated mode:** Server-authoritative for inventory/money, client-controlled for cosmetics

**Anti-cheat measures:**
- Click rate limiting in fishing minigame (24 clicks/sec max)
- Prop placement rate limit (1/second)
- Chat rate limit (2 messages/second)
- Server validates fish sell prices against authoritative `FISH_TYPES`

**Admin tools:**
- Kick/Ban (IP-based in dedicated mode, device ID in P2P)
- Mute chat/voice/MIDI
- Spawn portals
- Give money (cheat mode for testing)

**Known vulnerabilities:**
- No CAPTCHA or human verification (bot accounts possible)
- MIDI upload can spam large file events (no size limit)
- Admin password salt visible in welcome message (mitigated by random salt per session)

## Multiplayer Considerations

**P2P limitations:**
- WebRTC mesh network scales poorly beyond 8 players (bandwidth exponential growth)
- NAT traversal may fail for symmetric NATs (requires TURN server)
- Host quitting ends the game for all players

**Dedicated server benefits:**
- Persistent world (stays online 24/7)
- Authoritative state prevents cheating
- Master server integration for discovery

**Voice chat architecture:**
- Always peer-to-peer, even in dedicated mode (reduces server bandwidth)
- Proximity audio calculated client-side (volume scales by distance²)
- Reconnection watchdog runs every 2 seconds to fix dropped WebRTC connections

## Master Server Integration

Dedicated servers heartbeat to `https://html-fishing-master-server.onrender.com`:

```javascript
POST /heartbeat
{ name: "Server Name", ip: "play.htmlfishing.com", port: 8080, players: 12 }
```

Clients fetch server list from:
```javascript
GET /servers → [{ name, ip, port, players, lastSeen }]
```

**To disable master server:** Comment out `sendHeartbeat()` and `setInterval(sendHeartbeat, 30000)` in server.js (lines 653-655).

## Special Zones & Events

**Void Portal:**
- Spawns randomly every 10-15 minutes (admin can trigger manually)
- Purple swirling mesh with point light
- Walk into portal → teleport to random location + unlock 4 exclusive fish
- 60-second cooldown per player

**Secret Lake:**
- Hidden area at northern edge of map (z: -95)
- Accessible by walking around island perimeter
- Higher legendary fish spawn rates

**Lava World:**
- Accessed by catching "Lava Key" from Void Portal
- Red-tinted fog and lava texture
- 250 exclusive fish variants
- One-way teleport (must disconnect to return)

**Rain Events:**
- 20% chance every 2-5 minutes (server-controlled)
- Particle system of 1000 falling droplets
- 4 rain-exclusive fish spawn during event

## Save System

Client saves to `localStorage` key `'playerSaveData'`:

```javascript
{
    money: 0,
    inventory: [],
    journal: {}, // { "Fish Name": { count, maxSize, maxTier } }
    unlockedHats: ['none'],
    currentHat: 'none',
    catColor: '#ff6347',
    bellyColor: '#ffffff',
    eyeColor: '#000000',
    species: 'cat',
    baitInventory: {},
    hasGlove: false,
    autoReelLevel: 0,
    hasGuitar: false,
    unlockedProps: [],
    unlockedRods: ['bamboo'],
    currentRod: 'bamboo',
    unlockedShirts: ['none'],
    unlockedCollars: ['none'],
    unlockedTitles: ['none'],
    currentTitle: 'none',
    lavaUnlocked: false,
    displayName: "Fisher",
    outfits: [], // Saved outfit presets
    micId: null, // Preferred microphone device ID
    showTitles: true,
    volumes: { master: 1.0, sfx: 1.0, midi: 1.0, voice: 1.0 }
}
```

**Dedicated server mode:** Server stores authoritative `playerData[id]` in memory (lost on restart). Could be extended with database persistence.

## Codebase Conventions

**Naming:**
- Three.js objects: `lowerCamelCase` (e.g., `playerSprite`, `waterMesh`)
- HTML IDs: `kebab-case` (e.g., `#fish-log`, `#admin-panel`)
- Functions: `lowerCamelCase` (e.g., `createIsland()`, `handleFishingMechanics()`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `FISH_TYPES`, `LAKE_RADIUS`)

**Message types:** Always lowercase with underscores (e.g., `spawn_prop`, `admin_cmd`)

**Color format:** Hex strings (e.g., `'#ff6347'`) for customization, THREE.Color objects for rendering

**Coordinate system:** Three.js defaults (Y-up, right-handed). Ground is Y=0, water surface is Y=0.5.

## Future Scalability Paths

**Current limitations:**
- Single-file client makes code navigation difficult
- No build system prevents tree-shaking and module boundaries
- Server is single-threaded (no horizontal scaling)
- No database (state lost on crash)

**Suggested improvements:**
- Migrate to modular JS with Vite/Webpack
- Implement Node.js cluster mode for multi-core utilization
- Add Redis for shared state across server instances
- Use binary protocol (Protocol Buffers or MessagePack) for 50% bandwidth reduction
- Implement spatial partitioning (quadtree) to reduce O(n²) broadcasts
