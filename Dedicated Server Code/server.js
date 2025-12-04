const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');

const https = require('https'); // Add this line!

const PROP_TYPES = [
            { id: 'campfire', name: 'Campfire', price: 500, icon: '??' },
            { id: 'lamp', name: 'Lantern', price: 1000, icon: '??' },
            { id: 'tent', name: 'Tent', price: 2500, icon: '?' },
            { id: 'chair', name: 'Camp Chair', price: 1500, icon: '??' },
            { id: 'radio', name: 'Boombox', price: 2000, icon: '??' },
            { id: 'cooler', name: 'Cooler', price: 1200, icon: '??' },
            // --- NEW ITEMS ---
            { id: 'bucket', name: 'Bucket', price: 300, icon: '??' },
            { id: 'picnic_basket', name: 'Picnic Basket', price: 800, icon: '??' },
            { id: 'picnic_blanket', name: 'Checkered Blanket', price: 1200, icon: '??' },
            { id: 'picnic_table', name: 'Picnic Table', price: 3500, icon: '??' }
        ];

const FISH_TYPES = [
    // COMMONS (Base ~ $5 - $15)
    { name: "Old Boot", rarity: "Common", chance: 30, color: "#554433", drain: 10, price: 5 },
    { name: "Guppy", rarity: "Common", chance: 25, color: "#ADD8E6", drain: 12, price: 8 },
    { name: "Sardine", rarity: "Common", chance: 25, color: "#A0A0A0", drain: 15, price: 10 },
    { name: "Bluegill", rarity: "Common", chance: 20, color: "#4682B4", drain: 18, price: 12 },
    { name: "Carp", rarity: "Common", chance: 15, color: "#B8860B", drain: 20, price: 15 },
    
    // UNCOMMON (Base ~ $30 - $60)
    { name: "Bass", rarity: "Uncommon", chance: 12, color: "#556B2F", drain: 25, price: 30 },
    { name: "Trout", rarity: "Uncommon", chance: 10, color: "#8FBC8F", drain: 28, price: 40 },
    { name: "Catfish", rarity: "Uncommon", chance: 8, color: "#800000", drain: 32, price: 50 },
    { name: "Salmon", rarity: "Uncommon", chance: 8, color: "#FA8072", drain: 35, price: 60 },
    
    // RARE (Base ~ $100 - $200)
    { name: "Pike", rarity: "Rare", chance: 6, color: "#2E8B57", drain: 38, price: 100 },
    { name: "Clownfish", rarity: "Rare", chance: 5, color: "#FF4500", drain: 40, price: 125 },
    { name: "Tuna", rarity: "Rare", chance: 4, color: "#000080", drain: 45, price: 150 },
    { name: "Jellyfish", rarity: "Rare", chance: 3, color: "#E6E6FA", drain: 48, price: 175 },
    
    // EPIC (Base ~ $300 - $600)
    { name: "Pufferfish", rarity: "Epic", chance: 3, color: "#F0E68C", drain: 50, price: 300 },
    { name: "Swordfish", rarity: "Epic", chance: 2, color: "#708090", drain: 55, price: 400 },
    { name: "Stingray", rarity: "Epic", chance: 1.5, color: "#778899", drain: 60, price: 500 },
    { name: "Anglerfish", rarity: "Epic", chance: 1.2, color: "#4B0082", drain: 65, price: 600 },
    
    // LEGENDARY (Base ~ $1000+)
    { name: "Shark", rarity: "Legendary", chance: 1.0, color: "#2F4F4F", drain: 70, price: 1000 },
    { name: "Seahorse", rarity: "Legendary", chance: 0.8, color: "#FF69B4", drain: 75, price: 1500 },
    { name: "Golden Koi", rarity: "Legendary", chance: 0.5, color: "#FFD700", drain: 80, price: 2500 }
];

const HAT_TYPES = [
    // BASIC (Entry Level)
    { id: 'none', name: 'None', price: 0, type: 'none' },
    { id: 'redcap', name: 'Red Cap', price: 200, color: '#ff0000', type: 'cap' },
    { id: 'bluecap', name: 'Blue Cap', price: 200, color: '#0000ff', type: 'cap' },
    { id: 'straw', name: 'Straw Hat', price: 500, color: '#e4d96f', type: 'wide' },
    { id: 'beanie', name: 'Beanie', price: 750, color: '#444444', type: 'dome' },

    // MID TIER (Style Upgrades)
	{ id: 'flower', name: 'Flower Pin', price: 1000, color: '#ffffff', type: 'flower' },
    { id: 'fedora', name: 'Fedora', price: 2500, color: '#222', type: 'fedora' },
    { id: 'beret', name: 'Beret', price: 3000, color: '#800000', type: 'beret' },
    { id: 'bucket', name: 'Bucket Hat', price: 3500, color: '#4682B4', type: 'bucket' },
    { id: 'cowboy', name: 'Cowboy', price: 5000, color: '#8b4513', type: 'wide' },
    { id: 'headphones', name: 'Headphones', price: 7500, color: '#333', type: 'headphones' },
    
    // HIGH TIER (Expensive)
    { id: 'tophat', name: 'Top Hat', price: 10000, color: '#111111', type: 'tall' },
    { id: 'sombrero', name: 'Sombrero', price: 12000, color: '#edc9af', type: 'sombrero' },
    { id: 'pirate', name: 'Pirate', price: 15000, color: '#222222', type: 'wide' },
    { id: 'santa', name: 'Santa Hat', price: 20000, color: '#ff0000', type: 'santa' },
    { id: 'chef', name: 'Chef Hat', price: 25000, color: '#ffffff', type: 'tall' },
    { id: 'witch', name: 'Witch Hat', price: 30000, color: '#4b0082', type: 'witch' },
    { id: 'ninja', name: 'Ninja Band', price: 40000, color: '#000000', type: 'ninja' },
    { id: 'propeller', name: 'Propeller', price: 50000, color: '#0000ff', type: 'propeller' },

    // ULTRA TIER (Status Symbols)
    { id: 'viking', name: 'Viking', price: 75000, color: '#a0a0a0', type: 'horn' },
    { id: 'halo', name: 'Angel Halo', price: 100000, color: '#ffff00', type: 'halo' },
    { id: 'antlers', name: 'Antlers', price: 150000, color: '#5D4037', type: 'antlers' },
    { id: 'police', name: 'Police Cap', price: 200000, color: '#000080', type: 'police' },
    { id: 'tv', name: 'TV Head', price: 500000, color: '#444', type: 'tv' },
    
    // FLEX TIER (Millionaire Club)
    { id: 'goldcrown', name: 'King Crown', price: 1000000, color: '#ffff00', type: 'crown' },
    { id: 'rainbow', name: 'Rainbow Afro', price: 2000000, color: '#ff00ff', type: 'rainbow' },
    { id: 'void', name: 'Void Mask', price: 3500000, color: '#000000', type: 'void' },
    { id: 'diamond', name: 'Diamond Tiara', price: 5000000, color: '#00ffff', type: 'diamond' }
];

// --- MASTER SERVER CONFIG ---

const MASTER_URL = 'https://html-fishing-master-server.onrender.com'; // Change this to your Master Server URL
const MY_PUBLIC_IP = 'play.htmlfishing.com'; // This server's public IP (or use 'localhost' for testing)
const SERVER_NAME = process.env.SERVER_NAME || "Official Dedicated Server"; 

const PORT = process.env.PORT || 8080;

// --- CONFIGURATION ---
const ADMIN_PLAINTEXT = process.env.ADMIN_PW || 'super-secret-password';

// --- SECURITY & HASHING ---
function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

const ADMIN_SALT = crypto.randomBytes(10).toString('hex');
const ADMIN_STORED_HASH = sha256Hex(ADMIN_PLAINTEXT + ADMIN_SALT);

// --- LOGGING SYSTEM ---
function logToFile(text) {
    const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    const logLine = `[${timestamp}] ${text}\n`;
    fs.appendFile('server_logs.txt', logLine, (err) => {
        if (err) console.error("Error writing to log file:", err);
    });
}

// --- Persistence Configuration ---
const BAN_FILE = 'banned_ips.json';

// --- Ban Persistence Functions ---

function saveBannedIPs() {
    try {
        const banArray = Array.from(bannedIPs);
        fs.writeFileSync(BAN_FILE, JSON.stringify(banArray), 'utf8');
        console.log(`[PERSISTENCE] Saved ${banArray.length} banned IPs.`);
    } catch (err) {
        console.error("[PERSISTENCE] Failed to save banned IPs:", err);
    }
}

function sendHeartbeat() {
    const data = JSON.stringify({
        name: SERVER_NAME,
        ip: MY_PUBLIC_IP,
        port: PORT,
        players: Object.keys(clients).length
    });

    const url = new URL(MASTER_URL + '/heartbeat');
    
    const options = {
        hostname: url.hostname,
        port: 443, // HTTPS standard port
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    // Use 'https' here instead of 'http'
    const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
            console.error(`[HEARTBEAT] Failed. Status Code: ${res.statusCode}`);
        } else {
            // Optional: Uncomment to see successful heartbeats in console
            // console.log("[HEARTBEAT] Sent successfully.");
        }
    });
    
    req.on('error', (e) => {
        console.error(`[HEARTBEAT] Error connecting to Master Server: ${e.message}`);
    });

    req.write(data);
    req.end();
}

function loadBannedIPs() {
    try {
        if (fs.existsSync(BAN_FILE)) {
            const data = fs.readFileSync(BAN_FILE, 'utf8');
            const banArray = JSON.parse(data);
            banArray.forEach(ip => bannedIPs.add(ip));
            console.log(`[PERSISTENCE] Loaded ${banArray.length} banned IPs.`);
        } else {
            console.log("[PERSISTENCE] No banned IP file found, starting fresh.");
        }
    } catch (err) {
        console.error("[PERSISTENCE] Failed to load banned IPs:", err);
    }
}

console.log('--- SERVER STARTUP ---');
console.log('Admin salt:', ADMIN_SALT);
console.log('Server is ready to accept connections.');

loadBannedIPs();

// --- HTTP SERVER ---
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  res.writeHead(200);
  res.end(JSON.stringify({
    status: 'online',
    players: Object.keys(clients).length,
    uptime: process.uptime()
  }));
});

// --- WEBSOCKET SERVER ---
const wss = new WebSocket.Server({ server });

let clients = {};
let playerData = {}; // Authoritative state for all players
let nextId = 1;
const bannedIPs = new Set();
const worldProps = {};

// Defines the starting state for a new player.
function getNewPlayerData() {
    return {
        money: 0,
        inventory: [],
        journal: {},
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
        currentProp: 'campfire',
        unlockedRods: ['bamboo'],
        currentRod: 'bamboo',
        unlockedShirts: ['none'],
        currentShirt: 'none',
        unlockedCollars: ['none'],
        currentCollar: 'none',
        unlockedTitles: ['none', 'novice', 'gay', 'lesbian', 'bi', 'trans', 'pan', 'ace', 'aro', 'enby', 'queer', 'fluid', 'agender', 'demi', 'inter', 'mlm', 'wlw', 'bear', 'otter', 'butch', 'femme', 'ally'],
        currentTitle: 'none',
        lavaUnlocked: false,
        displayName: "Fisher"
    };
}


// --- BROADCAST HELPER ---
function broadcast(obj, exceptId = null) {
  const raw = JSON.stringify(obj);
  Object.entries(clients).forEach(([id, info]) => {
    if (id === exceptId) return;
    try { 
        if (info.ws.readyState === WebSocket.OPEN) info.ws.send(raw); 
    } catch(e) {}
  });
}

// --- PLAYER LIST HELPER (NEW) ---
// We moved this to a function so we can call it whenever someone is muted/unmuted
function broadcastPlayerList() {
    broadcast({ 
        type: 'playerList', 
        players: Object.values(clients).map(c => ({ 
            id: c.meta.id, 
            name: c.meta.name,
            peerId: c.meta.peerId,
            isChatMuted: c.meta.isChatMuted, 
            isVoiceMuted: c.meta.isVoiceMuted,
            isMidiMuted: c.meta.isMidiMuted // <--- ADD THIS
        })) 
    });
}

// --- CONNECTION HANDLER ---
wss.on('connection', (ws, req) => {
    const ip = req.headers['cf-connecting-ip'] || 
               req.headers['x-forwarded-for'] || 
               req.socket.remoteAddress;

    if (bannedIPs.has(ip)) {
        ws.send(JSON.stringify({ type: 'error', message: "You are banned from this server." }));
        ws.close();
        return;
    }

    const id = `d${nextId++}`;
    
    // --- Player Data Initialization ---
    playerData[id] = getNewPlayerData();
    // ---------------------------------
    
    // ADDED MUTE FLAGS TO METADATA
    clients[id] = { 
        ws, 
        meta: { 
            id, 
            connectedAt: Date.now(),
			lastSeen: Date.now(),
            name: null, 
            isAdmin: false, 
            ip: ip,
            isChatMuted: false, // New
            isVoiceMuted: false, // New
			isMidiMuted: false
        } 
    };
    
    console.log(`Client connected: ${id} [${ip}]`);
    logToFile(`CONNECTION: ID ${id} connected from IP: ${ip}`);

    ws.send(JSON.stringify({
        type: 'welcome',
        id,
        serverName: 'Official HTML Fisher Server',
        adminSalt: ADMIN_SALT,
        playerCount: Object.keys(clients).length,
        playerData: playerData[id] // Send authoritative state
    }));
      
    // Send Environment
    const date = new Date();
    const worldTime = date.getHours() + (date.getMinutes() / 60);
    ws.send(JSON.stringify({ type: 'environment_sync', isRaining: isRaining, time: worldTime }));
	
	// --- SYNC EXISTING PROPS TO NEW PLAYER ---
    Object.values(worldProps).forEach(propData => {
        ws.send(JSON.stringify({ 
            type: 'spawn_prop', 
            payload: propData 
        }));
    });

    broadcast({ type: 'playerCount', count: Object.keys(clients).length });

   // --- MESSAGE HANDLER ---
    ws.on('message', (raw) => {
		clients[id].meta.lastSeen = Date.now();
        let msg;
        try { msg = JSON.parse(raw); } catch(e) { return; }
        const info = clients[id];

        if (msg.type === 'update') {
            broadcast({ type: 'update', id: id, payload: msg.payload }, id);
        } 

        else if (msg.type === 'setName') {
             const safeName = String(msg.name || 'Fisher').substring(0, 32);
             info.meta.name = safeName;
             if (msg.peerId) info.meta.peerId = msg.peerId;
             
             logToFile(`LOGIN: Player "${safeName}" joined (ID: ${id})`);
             broadcastPlayerList(); 
        } 

        else if (['chat', 'sound', 'anim', 'punch_hit', 'spawnPortal', 'forceGhost'].includes(msg.type)) {
            msg.id = id; 
            
            // 1. CHAT LOGIC (Includes Mute & Name Attachment)
            if (msg.type === 'chat') {
                // Check Mute
                if (info.meta.isChatMuted) return; 

                // --- FIX: ATTACH NAME HERE ---
                if (info.meta.name) {
                    msg.name = info.meta.name;
                    logToFile(`CHAT: [${info.meta.name}] ${msg.text}`);
                }
                // -----------------------------
            }

            // 2. MIDI/SOUND LOGIC (Includes Mute)
            if (msg.type === 'sound' && msg.name === 'guitar') {
                if (info.meta.isMidiMuted) return; 
            }
            
            broadcast(msg, id); 
        }

        else if (msg.type === 'request_prop') {
            if (!info.props) info.props = [];

            // 1. LIMIT CHECK (FIFO - Remove Oldest)
            if (info.props.length >= 10) {
                const oldestPropId = info.props.shift(); 
                
                // Remove from global memory AND clients
                if (worldProps[oldestPropId]) {
                    delete worldProps[oldestPropId]; // <--- Delete from server memory
                    broadcast({ type: 'remove_prop', id: oldestPropId });
                }
            }

            // 2. RATE LIMIT
            const now = Date.now();
            if (info.lastPropTime && now - info.lastPropTime < 1000) return;
            info.lastPropTime = now;

            // 3. GENERATE & SAVE
            const propId = `prop-${id}-${Date.now()}`;
            const propData = { 
                id: propId, 
                ownerId: id, 
                type: msg.propType, 
                x: msg.x, 
                y: msg.y, 
                z: msg.z,
                rot: msg.rot // <--- SAVE ROTATION HERE
            };

            info.props.push(propId); 
            worldProps[propId] = propData;

            broadcast({ 
                type: 'spawn_prop', 
                payload: propData 
            });
        }
		
		else if (msg.type === 'undo_prop') {
            if (info.props && info.props.length > 0) {
                // Remove the LAST item from the array (LIFO)
                const lastPropId = info.props.pop();

                // Remove from global memory
                if (worldProps[lastPropId]) {
                    delete worldProps[lastPropId];
                }

                // Tell everyone to remove it visually
                broadcast({ 
                    type: 'remove_prop', 
                    id: lastPropId 
                });
            }
        }

        else if (msg.type === 'fishCaught') {
            if (!playerData[id]) return;
            // TODO: Add validation to prevent cheating
            playerData[id].inventory.push(msg.fish);
        }

        else if (msg.type === 'sellFish') {
            if (!playerData[id]) return;

            const player = playerData[id];
            if (player.inventory.length === 0) return;

            let totalValue = 0;
            player.inventory.forEach(fishInInventory => {
                // Find the base fish price from our authoritative list
                const fishDefinition = FISH_TYPES.find(f => f.name === fishInInventory.name);
                if (fishDefinition) {
                    // Use the price from the player's inventory object,
                    // as it includes multipliers for size/tier.
                    // A more secure implementation would recalculate this on the server.
                    totalValue += fishInInventory.price;
                }
            });

            player.money += totalValue;
            player.inventory = [];

            ws.send(JSON.stringify({
                type: 'stateUpdate',
                money: player.money,
                inventory: player.inventory
            }));
        }

        // --- ADMIN COMMANDS ---
        else if (msg.type === 'admin_login') {
             if (msg.hash && msg.hash === ADMIN_STORED_HASH) {
                info.meta.isAdmin = true;
                ws.send(JSON.stringify({ type: 'admin_ok' }));
                broadcast({ type: 'system', text: `Admin logged in.`, id: 'system' });
                logToFile(`ADMIN: Successful login from IP ${info.meta.ip}`);
             } else {
                ws.send(JSON.stringify({ type: 'admin_fail' }));
             }
        } 
        
        else if (msg.type === 'admin_cmd' && info.meta.isAdmin) {
            
            if (msg.cmd === 'spawnPortal') {
                // Determine coordinates: Use sent ones, or generate random ones if missing
                let x = msg.x;
                let z = msg.z;

                // If client didn't send coordinates (e.g. Admin Button), randomize it
                // This prevents it from spawning at 0,0 (Middle of Lake)
                if (x === undefined || z === undefined) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 30 + Math.random() * 50; // Distance from center (30-80 units)
                    x = Math.cos(angle) * dist;
                    z = Math.sin(angle) * dist;
                }

                broadcast({ type: 'spawnPortal', x: x, z: z });
                logToFile(`ADMIN: ${info.meta.name} spawned a portal at ${x.toFixed(1)}, ${z.toFixed(1)}`);
            }
            
            else if (msg.cmd === 'kick') {
                const target = clients[msg.targetId];
                if (target) {
                    target.ws.send(JSON.stringify({ type: 'error', message: "You have been kicked." }));
                    target.ws.close();
                    broadcast({ type: 'system', text: `${target.meta.name || 'Unknown'} was kicked.`, id: 'system' });
                }
            } 
            
			// You will modify this block:
			else if (msg.cmd === 'ban') {
				const target = clients[msg.targetId];
				if (target) {
					// --- ADD THIS PURGE BROADCAST ---
					broadcast({ type: 'purge_chat', targetId: msg.targetId });
					
					if (target.meta.ip) bannedIPs.add(target.meta.ip);
					saveBannedIPs();
					target.ws.send(JSON.stringify({ type: 'error', message: "You have been BANNED." }));
					target.ws.close();
					broadcast({ type: 'system', text: `${target.meta.name || 'Unknown'} was banned.`, id: 'system' });
				}
			}

            // MUTE COMMANDS
            else if (msg.cmd === 'mute_chat') {
                const target = clients[msg.targetId];
                if (target) {
                    target.meta.isChatMuted = !target.meta.isChatMuted;
                    broadcastPlayerList();
                    logToFile(`ADMIN: Toggled CHAT MUTE for ${target.meta.name}`);
                }
            }

            else if (msg.cmd === 'mute_voice') {
                const target = clients[msg.targetId];
                if (target) {
                    target.meta.isVoiceMuted = !target.meta.isVoiceMuted;
                    broadcastPlayerList(); 
                    logToFile(`ADMIN: Toggled VOICE MUTE for ${target.meta.name}`);
                }
            }

            else if (msg.cmd === 'mute_midi') {
                const target = clients[msg.targetId];
                if (target) {
                    target.meta.isMidiMuted = !target.meta.isMidiMuted;
                    broadcastPlayerList(); 
                    logToFile(`ADMIN: Toggled MIDI MUTE for ${target.meta.name}`);
                }
            }
            
            else if (msg.cmd === 'unban') {
                if (bannedIPs.has(msg.ip)) {
                    bannedIPs.delete(msg.ip);
					saveBannedIPs();
                    ws.send(JSON.stringify({ type: 'system', text: `Unbanned IP: ${msg.ip}`, id: 'system' }));
                } else {
                    ws.send(JSON.stringify({ type: 'system', text: `IP not found.`, id: 'system' }));
                }
            }
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${id}`);
        
        // --- REMOVE PROPS ON DISCONNECT ---
        if (clients[id] && clients[id].props) {
            clients[id].props.forEach(propId => {
                delete worldProps[propId]; // <--- Delete from server memory
                broadcast({ type: 'remove_prop', id: propId });
            });
        }

        broadcast({ type: 'playerLeft', id: id });
        delete clients[id];
        delete playerData[id]; // Clean up player state
        broadcast({ type: 'playerCount', count: Object.keys(clients).length });
        broadcastPlayerList();
    });
});

// --- ENVIRONMENT LOOP ---
let isRaining = false;
let nextWeatherChange = Date.now() + 60000; 
let nextPortalSpawn = Date.now() + 600000; 

setInterval(() => {
    const now = Date.now();
    const date = new Date();
    const worldTime = date.getHours() + (date.getMinutes() / 60) + (date.getSeconds() / 3600);

    if (now > nextWeatherChange) {
        if (isRaining) {
            isRaining = false;
            nextWeatherChange = now + (300000 + Math.random() * 300000);
        } else {
            if (Math.random() < 0.20) {
                isRaining = true;
                nextWeatherChange = now + (180000 + Math.random() * 180000);
            } else {
                nextWeatherChange = now + 120000;
            }
        }
        broadcast({ type: 'environment_sync', isRaining: isRaining, time: worldTime });
    }

    if (now > nextPortalSpawn) {
        nextPortalSpawn = now + (600000 + Math.random() * 300000);
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 50; 
        broadcast({ type: 'spawnPortal', x: Math.cos(angle)*dist, z: Math.sin(angle)*dist });
    }
}, 1000);

process.on('SIGINT', () => {
    wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.close(); });
    process.exit();
});

// --- HEARTBEAT / TIMEOUT CHECK ---
// Checks every 5 seconds for dead connections
setInterval(() => {
    const now = Date.now();
    const TIMEOUT_LIMIT = 20000; // 20 Seconds

    Object.keys(clients).forEach(id => {
        const client = clients[id];
        
        // If we haven't heard from them in 20 seconds...
        if (now - client.meta.lastSeen > TIMEOUT_LIMIT) {
            console.log(`Removing inactive player: ${id}`);
            
            // Force close the connection.
            // This triggers the ws.on('close') handler automatically,
            // which handles removing props, broadcasting 'playerLeft', and updating count.
            client.ws.terminate(); 
        }
    });
}, 5000);

server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
setInterval(sendHeartbeat, 30000);
// Send one immediately on startup
sendHeartbeat();