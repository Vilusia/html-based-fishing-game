const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const SERVER_NAME = process.env.SERVER_NAME || "Official Server";
const PORT = process.env.PORT || 8080;
const MASTER_URL = "https://html-fishing-master-server.onrender.com";
const MY_PUBLIC_IP = "play.htmlfishing.com";
const ADMIN_SALT = crypto.randomBytes(10).toString('hex');

// RATE LIMITS (MS)
const RATE_LIMITS = {
    chat: 500,
    sound: 150,
    anim: 300,
    punch: 300,
    prop: 500
};

// --- GAME DATA DEFINITIONS ---

const FISH_TYPES = [
    { name: "Old Boot", rarity: "Common", chance: 30, color: "#554433", drain: 10, price: 5 },
    { name: "Guppy", rarity: "Common", chance: 25, color: "#ADD8E6", drain: 12, price: 8 },
    { name: "Sardine", rarity: "Common", chance: 25, color: "#A0A0A0", drain: 15, price: 10 },
    { name: "Bluegill", rarity: "Common", chance: 20, color: "#4682B4", drain: 18, price: 12 },
    { name: "Carp", rarity: "Common", chance: 15, color: "#B8860B", drain: 20, price: 15 },
    { name: "Bass", rarity: "Uncommon", chance: 12, color: "#556B2F", drain: 25, price: 30 },
    { name: "Trout", rarity: "Uncommon", chance: 10, color: "#8FBC8F", drain: 28, price: 40 },
    { name: "Catfish", rarity: "Uncommon", chance: 8, color: "#800000", drain: 32, price: 50 },
    { name: "Salmon", rarity: "Uncommon", chance: 8, color: "#FA8072", drain: 35, price: 60 },
    { name: "Pike", rarity: "Rare", chance: 6, color: "#2E8B57", drain: 38, price: 100 },
    { name: "Clownfish", rarity: "Rare", chance: 5, color: "#FF4500", drain: 40, price: 125 },
    { name: "Tuna", rarity: "Rare", chance: 4, color: "#000080", drain: 45, price: 150 },
    { name: "Jellyfish", rarity: "Rare", chance: 3, color: "#E6E6FA", drain: 48, price: 175 },
    { name: "Pufferfish", rarity: "Epic", chance: 3, color: "#F0E68C", drain: 50, price: 300 },
    { name: "Swordfish", rarity: "Epic", chance: 2, color: "#708090", drain: 55, price: 400 },
    { name: "Stingray", rarity: "Epic", chance: 1.5, color: "#778899", drain: 60, price: 500 },
    { name: "Anglerfish", rarity: "Epic", chance: 1.2, color: "#4B0082", drain: 65, price: 600 },
    { name: "Shark", rarity: "Legendary", chance: 1.0, color: "#2F4F4F", drain: 70, price: 1000 },
    { name: "Seahorse", rarity: "Legendary", chance: 0.8, color: "#FF69B4", drain: 75, price: 1500 },
    { name: "Golden Koi", rarity: "Legendary", chance: 0.5, color: "#FFD700", drain: 80, price: 2500 }
];

const LAVA_FISH = [];
(function generateLavaFish() {
    const prefixes = [
        { text: "Charred", rarity: "Common", col: "#2a1d1d", priceMult: 0.5 },
        { text: "Molten", rarity: "Uncommon", col: "#ff4500", priceMult: 0.8 },
        { text: "Obsidian", rarity: "Rare", col: "#4a0404", priceMult: 1.2 },
        { text: "Magma", rarity: "Epic", col: "#ffaa00", priceMult: 2.0 },
        { text: "Hellfire", rarity: "Legendary", col: "#ffffff", priceMult: 4.0 }
    ];
    const bases = [
        "Guppy", "Tetra", "Crab", "Snapper", "Eel", "Ray", "Shark", "Whale", "Kraken", "Dragon",
        "Piranha", "Salamander", "Toad", "Serpent", "Turtle", "Koi", "Bass", "Pike", "Gar", "Marlin",
        "Leech", "Slug", "Snail", "Cobra", "Viper", "Hydra", "Drake", "Wyrm", "Beast", "Demon",
        "Imp", "Devil", "Soul", "Spirit", "Ghost", "Phantom", "Wraith", "Spectre", "Ghoul", "Lich",
        "Bone", "Skull", "Ash", "Cinder", "Ember", "Flame", "Blaze", "Inferno", "Pyre", "Phoenix"
    ];
    for (let p = 0; p < prefixes.length; p++) {
        for (let b = 0; b < bases.length; b++) {
            const prefix = prefixes[p];
            const baseName = bases[b];
            const basePrice = 50 + (b * 5);
            LAVA_FISH.push({
                name: `${prefix.text} ${baseName}`,
                rarity: prefix.rarity,
                chance: 10 / (p + 1),
                color: prefix.col,
                drain: 25 + (p * 10),
                price: Math.floor(basePrice * prefix.priceMult),
                isLava: true
            });
        }
    }
})();

(function generateMoreFish() {
    const prefixes = [
        { text: "Mud", rarity: "Common", mult: 1.0, col: "#5c4033" },
        { text: "River", rarity: "Common", mult: 1.1, col: "#4488aa" },
        { text: "Rock", rarity: "Common", mult: 1.2, col: "#666666" },
        { text: "Spotted", rarity: "Common", mult: 1.3, col: "#aaaa44" },
        { text: "Striped", rarity: "Uncommon", mult: 1.5, col: "#cc8844" },
        { text: "Emerald", rarity: "Uncommon", mult: 1.8, col: "#22aa22" },
        { text: "Azure", rarity: "Uncommon", mult: 2.0, col: "#2222aa" },
        { text: "Ruby", rarity: "Uncommon", mult: 2.2, col: "#aa2222" },
        { text: "Electric", rarity: "Rare", mult: 3.0, col: "#ffff00" },
        { text: "Ghost", rarity: "Rare", mult: 3.5, col: "#eeeeee" },
        { text: "Magma", rarity: "Rare", mult: 4.0, col: "#ff4400" },
        { text: "Abyssal", rarity: "Epic", mult: 5.0, col: "#110033" },
        { text: "Neon", rarity: "Epic", mult: 6.0, col: "#00ffcc" },
        { text: "Cursed", rarity: "Epic", mult: 7.0, col: "#440044" },
        { text: "Cyber", rarity: "Epic", mult: 8.0, col: "#00ff00" },
        { text: "Golden", rarity: "Legendary", mult: 12.0, col: "#ffd700" },
        { text: "Rainbow", rarity: "Legendary", mult: 15.0, col: "#ff88ff" },
        { text: "Void", rarity: "Legendary", mult: 20.0, col: "#000000" },
        { text: "Cosmic", rarity: "Legendary", mult: 25.0, col: "#4b0082" },
        { text: "Divine", rarity: "Legendary", mult: 40.0, col: "#ffffff" }
    ];
    const bases = [
        "Tetra", "Minnow", "Dory", "Cod", "Snapper", "Mackerel",
        "Eel", "Ray", "Turtle", "Squid", "Crab", "Lobster", "Urchin",
        "Manta", "Shark", "Whale", "Kraken", "Leviathan", "Hydra", "Dragon",
        "Bass", "Trout", "Salmon", "Pike", "Carp", "Perch", "Flounder",
        "Herring", "Anchovy", "Tuna", "Marlin", "Sailfish", "Grouper",
        "Barracuda", "Stingray", "Sunfish", "Angler", "Betta", "Goldfish",
        "Koi", "Guppy", "Molly", "Oscar", "Discus", "Cichlid", "Pleco",
        "Loach", "Arowana", "Gar", "Piranha"
    ];
    for (let p = 0; p < prefixes.length; p++) {
        for (let b = 0; b < bases.length; b++) {
            const prefix = prefixes[p];
            const baseName = bases[b];
            let baseDrain = 10;
            let chance = 20;
            if (prefix.rarity === "Uncommon") { baseDrain = 30; chance = 10; }
            if (prefix.rarity === "Rare") { baseDrain = 50; chance = 5; }
            if (prefix.rarity === "Epic") { baseDrain = 70; chance = 2; }
            if (prefix.rarity === "Legendary") { baseDrain = 95; chance = 0.5; }
            FISH_TYPES.push({
                name: `${prefix.text} ${baseName}`,
                rarity: prefix.rarity,
                chance: chance / (b + 1),
                color: prefix.col,
                drain: baseDrain + (b * 0.5),
                price: Math.floor(5 * prefix.mult * (1 + (b * 0.05)))
            });
        }
    }
})();

const RAIN_FISH = [
    { name: "Drizzle Dory", rarity: "Common", chance: 50, color: "#87CEFA", drain: 15, price: 15, condition: 'rain' },
    { name: "Storm Salmon", rarity: "Rare", chance: 30, color: "#4169E1", drain: 40, price: 80, condition: 'rain' },
    { name: "Thunder Eel", rarity: "Epic", chance: 15, color: "#FFD700", drain: 65, price: 200, condition: 'rain' },
    { name: "Tempest Shark", rarity: "Legendary", chance: 5, color: "#191970", drain: 85, price: 500, condition: 'rain' }
];

const VOID_FISH = [
    { name: "Null Guppy", rarity: "Common", chance: 50, color: "#333333", drain: 20, price: 10, condition: 'void' },
    { name: "Shadow Ray", rarity: "Rare", chance: 30, color: "#4B0082", drain: 50, price: 35, condition: 'void' },
    { name: "Abyssal Maw", rarity: "Epic", chance: 15, color: "#800080", drain: 75, price: 75, condition: 'void' },
    { name: "Event Horizon", rarity: "Legendary", chance: 5, color: "#000000", drain: 95, price: 200, condition: 'void' }
];

FISH_TYPES.push(...RAIN_FISH, ...VOID_FISH);

const TIERS = [
    { id: 'normal', name: 'Normal', chance: 70, priceMult: 1, drainMult: 1.0, color: '#fff' },
    { id: 'glistening', name: 'Glistening', chance: 18, priceMult: 1.5, drainMult: 1.2, color: '#cd7f32' },
    { id: 'shining', name: 'Shining', chance: 9, priceMult: 2.5, drainMult: 1.4, color: '#c0c0c0' },
    { id: 'opalescent', name: 'Opalescent', chance: 3, priceMult: 5.0, drainMult: 1.6, color: '#ffd700' }
];

const BAIT_TYPES = [
    { id: 'none', name: 'No Bait', price: 0, unlockFish: 0, power: 0, rarityMult: 1.0, tierLuck: 1.0 },
    { id: 'worm', name: 'Worms', price: 20, unlockFish: 0, power: 2, rarityMult: 1.2, tierLuck: 1.0 },
    { id: 'cricket', name: 'Crickets', price: 100, unlockFish: 25, power: 4, rarityMult: 1.5, tierLuck: 1.05 },
    { id: 'squid', name: 'Squid Chunk', price: 500, unlockFish: 75, power: 6, rarityMult: 2.5, tierLuck: 1.1 },
    { id: 'spinner', name: 'Shiny Spinner', price: 1200, unlockFish: 150, power: 8, rarityMult: 3.5, tierLuck: 1.2 },
    { id: 'grub', name: 'Mystic Grub', price: 2500, unlockFish: 300, power: 10, rarityMult: 4.5, tierLuck: 1.3 },
    { id: 'jig', name: 'Squid Jig', price: 5000, unlockFish: 500, power: 12, rarityMult: 6.0, tierLuck: 1.5 },
    { id: 'shrimp', name: 'Glowing Shrimp', price: 8000, unlockFish: 700, power: 15, rarityMult: 8.0, tierLuck: 2.0 },
    { id: 'magic', name: 'Magic Lure', price: 15000, unlockFish: 850, power: 18, rarityMult: 10.0, tierLuck: 3.0 }
];

function selectFish(activeBaitId, fishingZone, isRaining) {
    let bait = BAIT_TYPES.find(b => b.id === activeBaitId);
    if (!bait) bait = BAIT_TYPES[0];

    let basePool = FISH_TYPES.filter(f => !f.condition);

    if (fishingZone === 'void') {
        if (Math.random() < 0.40) basePool = FISH_TYPES.filter(f => f.condition === 'void');
    }
    else if (fishingZone === 'lava') {
        basePool = [...FISH_TYPES, ...LAVA_FISH];
    }
    else if (fishingZone === 'secret') {
        basePool = FISH_TYPES.filter(f => f.condition !== 'void' && f.condition !== 'rain' && f.name !== "Old Boot");
    }
    else if (isRaining && Math.random() < 0.40) {
        basePool = FISH_TYPES.filter(f => f.condition === 'rain');
    }

    if (basePool.length === 0) basePool = FISH_TYPES.filter(f => !f.condition);

    let pool = [];
    basePool.forEach(fish => {
        let chance = fish.chance;
        if (fish.rarity === 'Common') {
            if (['squid', 'spinner', 'grub', 'jig', 'shrimp', 'magic'].includes(bait.id)) {
                if (Math.random() > 0.1) return;
            }
        }

        // --- STRICT BAIT REQUIREMENTS ---
        if (fish.rarity === 'Rare' && bait.power < 2) return;       // Need Worms+
        if (fish.rarity === 'Epic' && bait.power < 4) return;       // Need Crickets+
        if (fish.rarity === 'Legendary' && bait.power < 8) return;  // Need Spinner+
        if (fish.rarity === 'Rare') chance *= (bait.rarityMult * 0.8);
        if (fish.rarity === 'Epic') chance *= (bait.rarityMult * 1.0);
        if (fish.rarity === 'Legendary') chance *= (bait.rarityMult * 1.2);
        pool.push({ ...fish, chance: chance });
    });

    if (pool.length === 0) pool = basePool;

    const totalChance = pool.reduce((acc, f) => acc + f.chance, 0);
    let random = Math.random() * totalChance;
    let selectedType = pool[0];
    for (let fish of pool) {
        if (random < fish.chance) { selectedType = fish; break; }
        random -= fish.chance;
    }

    const totalTierChance = TIERS.reduce((acc, t) => acc + t.chance, 0);
    let tierRandom = Math.random() * totalTierChance;

    if (bait.tierLuck > 1.0) {
        if (tierRandom < 70 && Math.random() < (bait.tierLuck - 1.0)) {
            tierRandom = Math.random() * totalTierChance;
        }
    }

    let selectedTier = TIERS[0];
    for (let tier of TIERS) {
        if (tierRandom < tier.chance) { selectedTier = tier; break; }
        tierRandom -= tier.chance;
    }

    let sizeMult = 0.5 + Math.pow(Math.random(), 2) * 2.0;
    if (bait.power > 20) sizeMult += 0.15;

    let sizeLabel = "Normal";
    if (sizeMult < 0.7) sizeLabel = "Tiny";
    else if (sizeMult < 0.9) sizeLabel = "Small";
    else if (sizeMult > 2.2) sizeLabel = "MASSIVE";
    else if (sizeMult > 1.8) sizeLabel = "Huge";
    else if (sizeMult > 1.3) sizeLabel = "Big";

    return {
        name: selectedType.name,
        basePrice: selectedType.price,
        rarity: selectedType.rarity,
        color: selectedType.color,
        drain: selectedType.drain,
        tierId: selectedTier.id,
        tierName: selectedTier.name,
        size: parseFloat(sizeMult.toFixed(2)),
        sizeLabel: sizeLabel,
        price: Math.ceil(selectedType.price * selectedTier.priceMult * sizeMult),
        drainRate: (selectedType.drain * selectedTier.drainMult) * 0.9
    };
}

function logToFile(text) {
    const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    const logLine = `[${timestamp}] ${text}\n`;
    fs.appendFile('server_logs.txt', logLine, (err) => {
        if (err) console.error("Error writing to log file:", err);
    });
}

const BAN_FILE = 'banned_ips.json';

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
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
            console.error(`[HEARTBEAT] Failed. Status Code: ${res.statusCode}`);
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

let admins = new Set();
const ADMIN_FILE = 'admins.json';

function loadAdmins() {
    try {
        if (fs.existsSync(ADMIN_FILE)) {
            const data = fs.readFileSync(ADMIN_FILE, 'utf8');
            const loopAdmins = JSON.parse(data);
            admins.clear();
            loopAdmins.forEach(ip => admins.add(ip));
            console.log(`[ADMIN] Loaded ${admins.size} admins.`);
        } else {
            console.log("[ADMIN] No admins.json found.");
        }
    } catch (err) {
        console.error("[ADMIN] Failed to load admins:", err);
    }
}

fs.watchFile(ADMIN_FILE, (curr, prev) => {
    console.log("[ADMIN] admins.json changed, reloading...");
    loadAdmins();
    Object.keys(clients).forEach(id => {
        const c = clients[id];
        const wasAdmin = c.meta.isAdmin;
        c.meta.isAdmin = admins.has(c.meta.ip);
        if (wasAdmin !== c.meta.isAdmin) {
            const status = c.meta.isAdmin ? "GRANTED" : "REVOKED";
            c.ws.send(JSON.stringify({ type: 'system', text: `Admin privileges ${status}.`, id: 'system' }));
            c.ws.send(JSON.stringify({ type: c.meta.isAdmin ? 'admin_ok' : 'admin_fail' }));
        }
    });
});


console.log('--- SERVER STARTUP ---');
loadAdmins();
loadBannedIPs();
console.log('Server is ready to accept connections.');

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            players: Object.keys(clients).length,
            name: SERVER_NAME
        }));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('HTML Fishing Dedicated Server is Running.');
    }
});

const wss = new WebSocket.Server({ server });

let clients = {};
let playerData = {};
let bannedIPs = new Set();
let activeProps = []; // { id, type, x, z, owner, timestamp }

let worldTime = 12.0;
const DAY_DURATION = 1200; // 20 Minutes
setInterval(() => {
    worldTime += (1 / DAY_DURATION) * 24;
    if (worldTime >= 24) worldTime -= 24;
}, 1000);

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
        clickPowerLevel: 0,
        hasGuitar: false,
        unlockedRods: ['bamboo'],
        currentRod: 'bamboo',
        unlockedShirts: ['none'],
        currentShirt: 'none',
        unlockedCollars: ['none'],
        currentCollar: 'none',
        unlockedTitles: ['none', 'novice', 'gay', 'lesbian', 'bi', 'trans', 'pan', 'ace', 'aro', 'enby', 'queer', 'fluid', 'agender', 'demi', 'inter', 'mlm', 'wlw', 'bear', 'otter', 'butch', 'femme', 'ally'],
        currentTitle: 'none',
        unlockedPatterns: ['none'],
        currentPattern: 'none',
        unlockedBobbers: ['classic'],
        currentBobber: 'classic',
        unlockedHair: ['none'],
        currentHair: 'none',
        hairColor: '',
        lavaUnlocked: false,
        displayName: "Fisher"
    };
}

function broadcast(obj, exceptId = null) {
    const data = JSON.stringify(obj);
    let count = 0;
    Object.keys(clients).forEach(id => {
        if (id !== exceptId && clients[id].ws.readyState === WebSocket.OPEN) {
            clients[id].ws.send(data);
            count++;
        }
    });
}

function broadcastPlayerList() {
    const list = {};
    Object.keys(clients).forEach(id => {
        list[id] = clients[id].meta;
    });
    broadcast({ type: 'playerList', list: list });
}

wss.on('connection', (ws, req) => {
    const id = crypto.randomUUID();

    const ip = req.headers['cf-connecting-ip'] ||
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress;

    if (bannedIPs.has(ip)) {
        ws.send(JSON.stringify({ type: 'error', message: "You are BANNED from this server." }));
        ws.close();
        return;
    }

    console.log(`New client connected: ${id} (${ip})`);

    clients[id] = {
        ws: ws,
        meta: {
            id: id,
            name: "Fisher",
            color: "#ff6347",
            x: 0, y: 0, z: 0,
            ip: ip,
            isAdmin: admins.has(ip),
            isChatMuted: false,
            isVoiceMuted: false,
            isMidiMuted: false,
            lastSeen: Date.now(),
            // --- VISUAL DEFAULTS ---
            species: 'cat',
            hat: 'none',
            shirt: 'none',
            belly: '#ffffff',
            eye: '#000000',
            collar: 'none',
            title: 'none',
            pattern: 'none',
            rod: 'bamboo',
            bobber: null,
            bobberType: 'classic',
            // Modular parts
            ears: 'cat',
            eyes: 'standard',
            nose: 'cat',
            misc: 'none',
            tail: 'cat',
            hair: 'none',
            hairColor: ''
        },
        isJoined: false, // <--- ADDED: Track if we have announced them yet

        // RATE LIMITING
        rateLimits: {
            chat: 0,
            sound: 0,
            anim: 0,
            punch: 0,
            prop: 0
        }
    };

    if (!playerData[id]) {
        playerData[id] = getNewPlayerData();
    }

    ws.send(JSON.stringify({
        type: 'welcome',
        id: id,
        serverName: SERVER_NAME,
        motd: "Welcome to the Official Dedicated Server!",
        players: Object.keys(clients).length,
        worldTime: worldTime,

        // --- FIX: SEND RAIN STATE ---
        isRaining: isRaining,
        // ----------------------------

        // --- PROP SYNC ---
        activeProps: activeProps,
        // -----------------

        playerList: Object.fromEntries(
            Object.entries(clients).map(([cid, c]) => [cid, c.meta])
        )
    }));

    console.log(`[CONNECTION] New player ${id} connected from IP: ${ip}`);

    if (clients[id].meta.isAdmin) {
        console.log(`[ADMIN] Auto-authorizing admin at ${ip}`);
        ws.send(JSON.stringify({ type: 'admin_ok' }));
    }

    // --- REMOVED: Immediate playerJoined broadcast. We wait for setName now. ---
    // broadcast({ type: 'playerJoined', id: id, meta: clients[id].meta }, id);
    // broadcastPlayerList();

    ws.on('message', (raw) => {
        clients[id].meta.lastSeen = Date.now();
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        const info = clients[id];

        if (msg.type === 'update') {
            const p = msg.payload;
            if (p) {
                // Sync Position/Rotation
                if (p.pos) { info.meta.x = p.pos.x; info.meta.y = p.pos.y; info.meta.z = p.pos.z; }
                if (p.rot !== undefined) info.meta.rot = p.rot;

                // Sync Visuals
                if (p.species) info.meta.species = p.species;
                if (p.hat) info.meta.hat = p.hat;
                if (p.color) info.meta.color = p.color;
                if (p.belly) info.meta.belly = p.belly;
                if (p.eye) info.meta.eye = p.eye;
                if (p.shirt) info.meta.shirt = p.shirt;
                if (p.collar) info.meta.collar = p.collar;
                if (p.title) info.meta.title = p.title;
                if (p.pattern) info.meta.pattern = p.pattern;
                if (p.rod) info.meta.rod = p.rod;
                if (p.bobber) info.meta.bobber = p.bobber;
                if (p.bobberType) info.meta.bobberType = p.bobberType;
                // Modular parts
                if (p.ears) info.meta.ears = p.ears;
                if (p.eyes) info.meta.eyes = p.eyes;
                if (p.nose) info.meta.nose = p.nose;
                if (p.misc) info.meta.misc = p.misc;
                if (p.tail) info.meta.tail = p.tail;
                if (p.hair) info.meta.hair = p.hair;
                // Part colors
                if (p.earsColor !== undefined) info.meta.earsColor = p.earsColor;
                if (p.noseColor !== undefined) info.meta.noseColor = p.noseColor;
                if (p.miscColor !== undefined) info.meta.miscColor = p.miscColor;
                if (p.tailColor !== undefined) info.meta.tailColor = p.tailColor;
                if (p.hairColor !== undefined) info.meta.hairColor = p.hairColor;
            }

            broadcast({ type: 'update', id: id, payload: msg.payload }, id);
        }

        else if (msg.type === 'setName') {
            const safeName = String(msg.name || 'Fisher').substring(0, 32);
            info.meta.name = safeName;
            if (msg.peerId) info.meta.peerId = msg.peerId;

            if (msg.saveState) {
                playerData[id] = {
                    ...getNewPlayerData(),
                    money: typeof msg.saveState.money === 'number' ? msg.saveState.money : 0,
                    inventory: Array.isArray(msg.saveState.inventory) ? msg.saveState.inventory : [],
                    currentHat: msg.saveState.currentHat || 'none',
                    currentShirt: msg.saveState.currentShirt || 'none',
                    currentRod: msg.saveState.currentRod || 'bamboo',
                    currentTitle: msg.saveState.currentTitle || 'none',
                    unlockedHats: Array.isArray(msg.saveState.unlockedHats) ? msg.saveState.unlockedHats : ['none'],
                    unlockedShirts: Array.isArray(msg.saveState.unlockedShirts) ? msg.saveState.unlockedShirts : ['none'],
                    unlockedRods: Array.isArray(msg.saveState.unlockedRods) ? msg.saveState.unlockedRods : ['bamboo'],
                    unlockedTitles: Array.isArray(msg.saveState.unlockedTitles) ? msg.saveState.unlockedTitles : ['none'],
                    unlockedPatterns: Array.isArray(msg.saveState.unlockedPatterns) ? msg.saveState.unlockedPatterns : ['none'],
                    unlockedHair: Array.isArray(msg.saveState.unlockedHair) ? msg.saveState.unlockedHair : ['none'],
                    currentHair: msg.saveState.currentHair || 'none',
                    hairColor: msg.saveState.hairColor || '',

                    unlockedBobbers: Array.isArray(msg.saveState.unlockedBobbers) ? msg.saveState.unlockedBobbers : ['classic'],
                    currentBobber: msg.saveState.currentBobber || 'classic',

                    currentPattern: msg.saveState.currentPattern || 'none',
                    clickPowerLevel: typeof msg.saveState.clickPowerLevel === 'number' ? msg.saveState.clickPowerLevel : 0
                };

                // Sync Visuals
                info.meta.species = msg.saveState.species || 'cat';
                info.meta.hat = msg.saveState.currentHat || 'none';
                info.meta.shirt = msg.saveState.currentShirt || 'none';
                info.meta.color = msg.saveState.catColor || '#ff6347';
                info.meta.belly = msg.saveState.bellyColor || '#ffffff';
                info.meta.eye = msg.saveState.eyeColor || '#000000';
                info.meta.collar = msg.saveState.currentCollar || 'none';
                info.meta.title = msg.saveState.currentTitle || 'none';
                info.meta.pattern = msg.saveState.currentPattern || 'none';

                // Sync modular parts
                info.meta.ears = msg.saveState.currentEars || 'cat';
                info.meta.eyes = msg.saveState.currentEyes || 'standard';
                info.meta.nose = msg.saveState.currentNose || 'cat';
                info.meta.misc = msg.saveState.currentMisc || 'none';
                info.meta.tail = msg.saveState.currentTail || 'cat';
                info.meta.hair = msg.saveState.currentHair || 'none';

                // Sync part colors
                info.meta.earsColor = msg.saveState.earsColor || '';
                info.meta.noseColor = msg.saveState.noseColor || '';
                info.meta.miscColor = msg.saveState.miscColor || '';
                info.meta.tailColor = msg.saveState.tailColor || '';
                info.meta.hairColor = msg.saveState.hairColor || '';

                logToFile(`LOGIN: Player "${safeName}" joined with $${playerData[id].money} (ID: ${id})`);
            } else {
                logToFile(`LOGIN: Player "${safeName}" joined (New/No Save) (ID: ${id})`);
            }

            // --- FIX: BROADCAST JOIN HERE ---
            // Only announce the player once they have set their name.
            if (!info.isJoined) {
                info.isJoined = true;
                broadcast({ type: 'playerJoined', id: id, meta: info.meta }, id);
            }

            broadcastPlayerList();
        }


        else if (['chat', 'sound', 'anim', 'punch_hit', 'spawnPortal', 'forceGhost'].includes(msg.type)) {
            // --- MIDI EXEMPTION: allow unlimited guitar notes ---
            if (msg.type === 'sound' && msg.name === 'guitar') {
                if (info.meta.isMidiMuted) return;
                msg.id = id;
                broadcast(msg, id);
                return;
            }

            // RATE LIMIT CHECK
            let limitType = 'anim';
            if (msg.type === 'chat') limitType = 'chat';
            if (msg.type === 'sound') limitType = 'sound';
            if (msg.type === 'punch_hit') limitType = 'punch'; // Separate rate limit for punch hits

            const now = Date.now();
            if (now - info.rateLimits[limitType] < RATE_LIMITS[limitType]) {
                // Ignore spam
                return;
            }
            info.rateLimits[limitType] = now;

            msg.id = id;

            if (msg.type === 'chat') {
                if (info.meta.isChatMuted) return;
                if (msg.text && typeof msg.text === 'string') {
                    msg.text = msg.text.substring(0, 256);
                }
                if (info.meta.name) {
                    msg.name = info.meta.name;
                    logToFile(`CHAT: [${info.meta.name}] ${msg.text}`);
                }
            } else if (msg.type === 'punch_hit') {
                logToFile(`PUNCH: ${info.meta.name} punched ${msg.targetId}`);

                const target = clients[msg.targetId];
                if (!target) {
                    return;
                }

                // Forward ONLY to the correct player
                target.ws.send(JSON.stringify({
                    type: 'punch_hit',
                    attackerId: id,
                    force: msg.force,
                    targetId: msg.targetId
                }));

                return; // Do NOT broadcast globally
            }

            if (msg.type === 'sound') {
                if (info.meta.isMidiMuted && msg.name === 'guitar') return;
            }

            broadcast(msg, id);
        }

        else if (msg.type === 'placeProp') {
            // RATE LIMIT CHECK
            const now = Date.now();
            if (now - info.rateLimits.prop < RATE_LIMITS.prop) return;
            info.rateLimits.prop = now;

            // Limit Check (10 per player)
            const playerProps = activeProps.filter(p => p.owner === id);
            if (playerProps.length >= 10) {
                const oldest = playerProps[0];
                activeProps = activeProps.filter(p => p.id !== oldest.id);
                broadcast({ type: 'propRemoved', id: oldest.id });
            }

            const newProp = {
                id: crypto.randomUUID(),
                type: msg.propType,
                x: msg.x,
                z: msg.z,
                rot: msg.rot, // Include rotation
                owner: id,
                timestamp: Date.now()
            };
            activeProps.push(newProp);
            broadcast({ type: 'propPlaced', prop: newProp });
        }

        else if (msg.type === 'undoProp') {
            const playerProps = activeProps.filter(p => p.owner === id);
            if (playerProps.length > 0) {
                // Find the most recent one
                playerProps.sort((a, b) => b.timestamp - a.timestamp);
                const newest = playerProps[0];

                activeProps = activeProps.filter(p => p.id !== newest.id);
                broadcast({ type: 'propRemoved', id: newest.id });
            }
        }

        else if (msg.type === 'fishCaught') {
            if (!playerData[id]) return;

            const activeBaitId = msg.baitId || 'none';
            const fishingZone = msg.zone || 'lake';
            const isRaining = false;

            const caughtFish = selectFish(activeBaitId, fishingZone, isRaining);

            playerData[id].inventory.push(caughtFish);

            ws.send(JSON.stringify({
                type: 'fishCaughtConfirmed',
                fish: caughtFish
            }));
        }

        else if (msg.type === 'sellFish') {
            if (!playerData[id]) return;

            const player = playerData[id];
            if (player.inventory.length === 0) return;

            let totalValue = 0;
            player.inventory.forEach(fishInInventory => {
                totalValue += fishInInventory.price;
            });

            player.money += totalValue;
            const count = player.inventory.length;
            player.inventory = [];

            ws.send(JSON.stringify({
                type: 'stateUpdate',
                money: player.money,
                inventory: player.inventory,
                soldCount: count,
                soldValue: totalValue
            }));
        }

        // --- NEW: Sync Money from Client (after shop purchases) ---
        else if (msg.type === 'syncMoney') {
            if (!playerData[id]) return;
            if (typeof msg.money === 'number' && msg.money >= 0) {
                // Only allow money to decrease (purchases) or stay same
                // This prevents cheating by sending inflated money values
                if (msg.money <= playerData[id].money) {
                    playerData[id].money = msg.money;
                }
            }
        }

        if (msg.type === 'admin_cmd' && info.meta.isAdmin) {

            if (msg.cmd === 'spawnPortal') {
                let x = msg.x || 0; let z = msg.z || 0;
                broadcast({ type: 'spawnPortal', x: x, z: z });
                logToFile(`ADMIN: ${info.meta.name} spawned a portal.`);
            }

            else if (msg.cmd === 'kick') {
                const target = clients[msg.targetId];
                if (target) {
                    // --- PROTECTION: Prevent kicking other Admins ---
                    if (target.meta.isAdmin) {
                        ws.send(JSON.stringify({ type: 'error', message: "⛔ Cannot kick another Admin." }));
                        return;
                    }

                    target.ws.send(JSON.stringify({ type: 'error', message: "You have been kicked." }));
                    target.ws.close();
                    broadcast({ type: 'system', text: `${target.meta.name || 'Unknown'} was kicked.`, id: 'system' });
                }
            }

            else if (msg.cmd === 'ban') {
                const target = clients[msg.targetId];
                if (target) {
                    // --- PROTECTION: Prevent banning other Admins ---
                    if (target.meta.isAdmin) {
                        ws.send(JSON.stringify({ type: 'error', message: "⛔ Cannot ban another Admin." }));
                        return;
                    }

                    broadcast({ type: 'purge_chat', targetId: msg.targetId });

                    if (target.meta.ip) bannedIPs.add(target.meta.ip);
                    saveBannedIPs();
                    target.ws.send(JSON.stringify({ type: 'error', message: "You have been BANNED." }));
                    target.ws.close();
                    broadcast({ type: 'system', text: `${target.meta.name || 'Unknown'} was banned.`, id: 'system' });
                }
            }

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

        // --- FIX 1: REMOVE PROPS OWNED BY THIS PLAYER ---
        // Find props belonging to the disconnected player
        const propsToRemove = activeProps.filter(p => p.owner === id);

        // Update the active list to exclude them
        activeProps = activeProps.filter(p => p.owner !== id);

        // Tell everyone to delete these specific props
        propsToRemove.forEach(p => {
            broadcast({ type: 'propRemoved', id: p.id });
        });
        // -----------------------------------------------

        broadcast({ type: 'playerLeft', id: id });
        delete clients[id];
        broadcast({ type: 'playerCount', count: Object.keys(clients).length });
        broadcastPlayerList();
    });
});

let isRaining = false;
let nextWeatherChange = Date.now() + 60000;
let nextPortalSpawn = Date.now() + 600000;
let lastTimeSync = 0; // New variable for periodic sync

setInterval(() => {
    const now = Date.now();
    // Use global worldTime, do not re-declare it

    // 1. Periodic Time Sync (Every 5 Seconds)
    if (now - lastTimeSync > 5000) {
        broadcast({ type: 'environment_sync', isRaining: isRaining, time: worldTime });
        lastTimeSync = now;
    }

    // 2. Weather Logic
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
        // Broadcast immediately on change
        broadcast({ type: 'environment_sync', isRaining: isRaining, time: worldTime });
    }

    if (now > nextPortalSpawn) {
        nextPortalSpawn = now + (600000 + Math.random() * 300000);
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 50;
        broadcast({ type: 'spawnPortal', x: Math.cos(angle) * dist, z: Math.sin(angle) * dist });
    }
}, 1000);

process.on('SIGINT', () => {
    wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.close(); });
    process.exit();
});

setInterval(() => {
    const now = Date.now();
    const TIMEOUT_LIMIT = 20000;

    Object.keys(clients).forEach(id => {
        const client = clients[id];

        if (now - client.meta.lastSeen > TIMEOUT_LIMIT) {
            console.log(`Removing inactive player: ${id}`);
            client.ws.terminate();
        }
    });
}, 5000);

server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
setInterval(sendHeartbeat, 30000);
sendHeartbeat();