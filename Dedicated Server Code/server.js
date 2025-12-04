const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');

const https = require('https'); // Add this line!

const PROP_TYPES = [
    { id: 'campfire', name: 'Campfire', price: 500, icon: '🔥' },
    { id: 'lamp', name: 'Lantern', price: 1000, icon: '🏮' },
    { id: 'tent', name: 'Tent', price: 2500, icon: '⛺' },
    { id: 'chair', name: 'Camp Chair', price: 1500, icon: '🪑' },
    { id: 'radio', name: 'Boombox', price: 2000, icon: '📻' },
    { id: 'cooler', name: 'Cooler', price: 1200, icon: '🧊' },
    // --- NEW ITEMS ---
    { id: 'bucket', name: 'Bucket', price: 300, icon: '🪣' },
    { id: 'picnic_basket', name: 'Picnic Basket', price: 800, icon: '🧺' },
    { id: 'picnic_blanket', name: 'Checkered Blanket', price: 1200, icon: '🏁' },
    { id: 'picnic_table', name: 'Picnic Table', price: 3500, icon: '🪵' }
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

// --- LAVA WORLD FISH GENERATION (250 VARIANTS) ---
const LAVA_FISH = [];

(function generateLavaFish() {
    // 5 Prefixes * 50 Bases = 250 New Fish
    const prefixes = [
        { text: "Charred", rarity: "Common", col: "#2a1d1d", priceMult: 1.5 },
        { text: "Molten", rarity: "Uncommon", col: "#ff4500", priceMult: 2.0 },
        { text: "Obsidian", rarity: "Rare", col: "#4a0404", priceMult: 3.5 },
        { text: "Magma", rarity: "Epic", col: "#ffaa00", priceMult: 5.0 },
        { text: "Hellfire", rarity: "Legendary", col: "#ffffff", priceMult: 10.0 }
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

            // Base price calculation: Higher than normal fish
            const basePrice = 50 + (b * 5);

            LAVA_FISH.push({
                name: `${prefix.text} ${baseName}`,
                rarity: prefix.rarity,
                chance: 10 / (p + 1), // Rarity logic
                color: prefix.col,
                drain: 25 + (p * 10),
                price: Math.floor(basePrice * prefix.priceMult),
                isLava: true // Marker to identify lava fish
            });
        }
    }
})();

// --- PROCEDURAL FISH GENERATION (1000 VARIANTS) ---
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
    { name: "Null Guppy", rarity: "Common", chance: 50, color: "#333333", drain: 20, price: 25, condition: 'void' },
    { name: "Shadow Ray", rarity: "Rare", chance: 30, color: "#4B0082", drain: 50, price: 100, condition: 'void' },
    { name: "Abyssal Maw", rarity: "Epic", chance: 15, color: "#800080", drain: 75, price: 300, condition: 'void' },
    { name: "Event Horizon", rarity: "Legendary", chance: 5, color: "#000000", drain: 95, price: 1000, condition: 'void' }
];

FISH_TYPES.push(...RAIN_FISH, ...VOID_FISH);

const TIERS = [
    { id: 'normal', name: 'Normal', chance: 70, priceMult: 1, drainMult: 1.0, color: '#fff' },
    { id: 'glistening', name: 'Glistening', chance: 20, priceMult: 1.5, drainMult: 1.2, color: '#cd7f32' },
    { id: 'shining', name: 'Shining', chance: 8, priceMult: 2.5, drainMult: 1.4, color: '#c0c0c0' },
    { id: 'opalescent', name: 'Opalescent', chance: 2, priceMult: 5.0, drainMult: 1.6, color: '#ffd700' }
];

const BAIT_TYPES = [
    { id: 'none', name: 'No Bait', price: 0, unlockFish: 0, power: 0, rarityMult: 1.0, tierLuck: 1.0 },
    { id: 'worm', name: 'Worms', price: 20, unlockFish: 0, power: 3, rarityMult: 1.2, tierLuck: 1.0 },
    { id: 'cricket', name: 'Crickets', price: 100, unlockFish: 25, power: 6, rarityMult: 1.5, tierLuck: 1.05 },
    { id: 'squid', name: 'Squid Chunk', price: 500, unlockFish: 75, power: 9, rarityMult: 2.5, tierLuck: 1.1 },
    { id: 'spinner', name: 'Shiny Spinner', price: 1200, unlockFish: 150, power: 12, rarityMult: 3.5, tierLuck: 1.2 },
    { id: 'grub', name: 'Mystic Grub', price: 2500, unlockFish: 300, power: 15, rarityMult: 4.5, tierLuck: 1.3 },
    { id: 'jig', name: 'Squid Jig', price: 5000, unlockFish: 500, power: 18, rarityMult: 6.0, tierLuck: 1.5 },
    { id: 'shrimp', name: 'Glowing Shrimp', price: 8000, unlockFish: 700, power: 22, rarityMult: 8.0, tierLuck: 2.0 },
    { id: 'magic', name: 'Magic Lure', price: 15000, unlockFish: 850, power: 25, rarityMult: 10.0, tierLuck: 3.0 }
];

function selectFish(activeBaitId, fishingZone, isRaining) {
    let bait = BAIT_TYPES.find(b => b.id === activeBaitId);
    if (!bait) bait = BAIT_TYPES[0];

    // 1. Filter Pool based on Zone
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

    // Safety check
    if (basePool.length === 0) basePool = FISH_TYPES.filter(f => !f.condition);

    // 2. BAIT FILTERING & LUCK LOGIC
    let pool = [];
    basePool.forEach(fish => {
        let chance = fish.chance;

        // Filter out lower-tier fish when using better bait
        if (fish.rarity === 'Common') {
            if (['squid', 'spinner', 'grub', 'jig', 'shrimp', 'magic'].includes(bait.id)) {
                if (Math.random() > 0.1) return;
            }
        }

        // --- APPLY RARITY MULTIPLIERS ---
        if (fish.rarity === 'Rare') chance *= (bait.rarityMult * 0.8);
        if (fish.rarity === 'Epic') chance *= (bait.rarityMult * 1.0);
        if (fish.rarity === 'Legendary') chance *= (bait.rarityMult * 1.2);

        pool.push({ ...fish, chance: chance });
    });

    if (pool.length === 0) pool = basePool; // Safety fallback

    // 3. Pick Fish
    const totalChance = pool.reduce((acc, f) => acc + f.chance, 0);
    let random = Math.random() * totalChance;
    let selectedType = pool[0];
    for (let fish of pool) {
        if (random < fish.chance) { selectedType = fish; break; }
        random -= fish.chance;
    }

    // 4. Tier Logic (Shiny/Gold/Opalescent)
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

    // 5. Size Logic
    let sizeMult = 0.5 + Math.pow(Math.random(), 2) * 2.0;
    if (bait.power > 20) sizeMult += 0.15;

    let sizeLabel = "Normal";
    if (sizeMult < 0.7) sizeLabel = "Tiny";
    else if (sizeMult < 0.9) sizeLabel = "Small";
    else if (sizeMult > 2.2) sizeLabel = "MASSIVE";
    else if (sizeMult > 1.8) sizeLabel = "Huge";
    else if (sizeMult > 1.3) sizeLabel = "Big";

    // 6. Final Calculation
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

// --- WEBSOCKET SERVER ---
const wss = new WebSocket.Server({ server });

let clients = {}; // Map: id -> { ws, meta }
let playerData = {}; // Authoritative state for all players
let worldProps = {}; // Map: propId -> { id, type, x, y, z, rot, ownerId }
let bannedIPs = new Set();

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

function broadcast(obj, exceptId = null) {
    const data = JSON.stringify(obj);
    Object.keys(clients).forEach(id => {
        if (id !== exceptId && clients[id].ws.readyState === WebSocket.OPEN) {
            clients[id].ws.send(data);
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
    const ip = req.socket.remoteAddress;

    // BAN CHECK
    if (bannedIPs.has(ip)) {
        ws.send(JSON.stringify({ type: 'error', message: "You are BANNED from this server." }));
        ws.close();
        return;
    }

    console.log(`New client connected: ${id} (${ip})`);

    // Initialize Player
    clients[id] = {
        ws: ws,
        meta: {
            id: id,
            name: "Fisher",
            color: "#ff6347",
            x: 0, y: 0, z: 0,
            ip: ip,
            isAdmin: false,
            isChatMuted: false,
            isVoiceMuted: false,
            isMidiMuted: false,
            lastSeen: Date.now()
        },
        props: [],
        lastPropTime: 0
    };

    // Initialize Data if not present (In-Memory Persistence for session)
    if (!playerData[id]) {
        playerData[id] = getNewPlayerData();
    }

    // Send Welcome Packet
    ws.send(JSON.stringify({
        type: 'welcome',
        id: id,
        serverName: SERVER_NAME,
        motd: "Welcome to the Official Dedicated Server!",
        players: Object.keys(clients).length,
        // Send existing props to new player
        worldProps: Object.values(worldProps)
    }));

    // Notify others
    broadcast({ type: 'playerJoined', id: id, meta: clients[id].meta }, id);
    broadcastPlayerList();

    ws.on('message', (raw) => {
        clients[id].meta.lastSeen = Date.now();
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        const info = clients[id];

        if (msg.type === 'update') {
            broadcast({ type: 'update', id: id, payload: msg.payload }, id);
        }

        else if (msg.type === 'setName') {
            const safeName = String(msg.name || 'Fisher').substring(0, 32);
            info.meta.name = safeName;
            if (msg.peerId) info.meta.peerId = msg.peerId;

            // --- NEW: Accept Client Save Data (Trust on Join) ---
            if (msg.saveState) {
                // Initialize with client data, but sanitize/validate basics
                playerData[id] = {
                    ...getNewPlayerData(), // Start with defaults
                    money: typeof msg.saveState.money === 'number' ? msg.saveState.money : 0,
                    inventory: Array.isArray(msg.saveState.inventory) ? msg.saveState.inventory : [],
                    // Add other persistent fields as needed (cosmetics, etc.)
                    currentHat: msg.saveState.currentHat || 'none',
                    currentShirt: msg.saveState.currentShirt || 'none',
                    currentRod: msg.saveState.currentRod || 'bamboo',
                    currentTitle: msg.saveState.currentTitle || 'none',
                    unlockedHats: Array.isArray(msg.saveState.unlockedHats) ? msg.saveState.unlockedHats : ['none'],
                    unlockedShirts: Array.isArray(msg.saveState.unlockedShirts) ? msg.saveState.unlockedShirts : ['none'],
                    unlockedRods: Array.isArray(msg.saveState.unlockedRods) ? msg.saveState.unlockedRods : ['bamboo'],
                    unlockedTitles: Array.isArray(msg.saveState.unlockedTitles) ? msg.saveState.unlockedTitles : ['none']
                };
                logToFile(`LOGIN: Player "${safeName}" joined with $${playerData[id].money} (ID: ${id})`);
                console.log(`LOGIN: Player "${safeName}" joined with $${playerData[id].money} (ID: ${id})`);
            } else {
                logToFile(`LOGIN: Player "${safeName}" joined (New/No Save) (ID: ${id})`);
                console.log(`LOGIN: Player "${safeName}" joined (New/No Save) (ID: ${id})`);
            }
            // ---------------------------------------------------

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

            // Server-side Fish Generation
            const activeBaitId = msg.baitId || 'none';
            const fishingZone = msg.zone || 'lake';
            // TODO: Implement isRaining check on server (requires global weather state)
            const isRaining = false;

            const caughtFish = selectFish(activeBaitId, fishingZone, isRaining);

            playerData[id].inventory.push(caughtFish);

            // Notify client of what they caught (so they can show the toast/visuals)
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
                // Trust the price in the inventory because WE generated it on the server
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
        broadcast({ type: 'spawnPortal', x: Math.cos(angle) * dist, z: Math.sin(angle) * dist });
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