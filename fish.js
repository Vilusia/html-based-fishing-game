// --- FISH DEFINITIONS ---
//
// A curated roster of real species (plus the Old Boot).  Every standard catch
// is a fish you could actually find in the wild; the rain pool is real weather-
// sensitive fish, the void pool is real deep-sea fish, and the lava pool is the
// fantasy exception for the lava world.
//
// zone:  lake | lightpond | darkpond | ocean
// shape: which procedural model the 2D journal icon and 3D held fish use.

const FISH_TYPES = [
    // --- JUNK (found everywhere) ---
    { name: "Old Boot", rarity: "Common", chance: 30, color: "#554433", drain: 10, price: 5, zone: "lake", shape: "boot" },

    // === LAKE (freshwater) =================================================
    // Commons
    { name: "Bluegill", rarity: "Common", chance: 26, color: "#4E7E9E", drain: 14, price: 10, zone: "lake", shape: "panfish" },
    { name: "Yellow Perch", rarity: "Common", chance: 24, color: "#C9A227", drain: 16, price: 14, zone: "lake", shape: "perch" },
    { name: "Common Carp", rarity: "Common", chance: 20, color: "#9C7A3C", drain: 20, price: 20, zone: "lake", shape: "carp" },
    // Uncommon
    { name: "Largemouth Bass", rarity: "Uncommon", chance: 11, color: "#5C7A45", drain: 26, price: 38, zone: "lake", shape: "bass" },
    { name: "Rainbow Trout", rarity: "Uncommon", chance: 10, color: "#B5687A", drain: 28, price: 48, zone: "lake", shape: "trout" },
    { name: "Channel Catfish", rarity: "Uncommon", chance: 8, color: "#6F6252", drain: 34, price: 62, zone: "lake", shape: "catfish" },
    // Rare / epic
    { name: "Northern Pike", rarity: "Rare", chance: 4.5, color: "#4F6B3F", drain: 44, price: 150, zone: "lake", shape: "pike" },
    { name: "Lake Sturgeon", rarity: "Epic", chance: 1.4, color: "#7C7B6A", drain: 62, price: 450, zone: "lake", shape: "sturgeon" },

    // === LIGHT POND (small, colourful fish) ================================
    { name: "Guppy", rarity: "Common", chance: 28, color: "#6FC7DF", drain: 12, price: 8, zone: "lightpond", shape: "guppy" },
    { name: "Neon Tetra", rarity: "Common", chance: 26, color: "#4FA7E6", drain: 12, price: 10, zone: "lightpond", shape: "tetra" },
    { name: "Goldfish", rarity: "Common", chance: 20, color: "#F0A23A", drain: 16, price: 16, zone: "lightpond", shape: "goldfish" },
    { name: "Betta", rarity: "Uncommon", chance: 10, color: "#A04ABF", drain: 26, price: 45, zone: "lightpond", shape: "betta" },
    { name: "Angelfish", rarity: "Rare", chance: 5, color: "#D9C17A", drain: 36, price: 140, zone: "lightpond", shape: "angelfish" },
    { name: "Discus", rarity: "Epic", chance: 1.4, color: "#D9663A", drain: 56, price: 450, zone: "lightpond", shape: "discus" },

    // === DARK POND (nocturnal / odd freshwater fish) ======================
    { name: "Black Bullhead", rarity: "Common", chance: 24, color: "#3F3A34", drain: 20, price: 18, zone: "darkpond", shape: "catfish" },
    { name: "Bowfin", rarity: "Uncommon", chance: 10, color: "#4E5A45", drain: 30, price: 60, zone: "darkpond", shape: "bowfin" },
    { name: "Snakehead", rarity: "Rare", chance: 5, color: "#5A4A36", drain: 44, price: 150, zone: "darkpond", shape: "snakehead" },
    { name: "Electric Eel", rarity: "Epic", chance: 1.2, color: "#7B7448", drain: 62, price: 520, zone: "darkpond", shape: "eel" },
    { name: "Silver Arowana", rarity: "Legendary", chance: 0.5, color: "#C9CDD2", drain: 78, price: 1800, zone: "darkpond", shape: "arowana" },

    // === OCEAN (saltwater) =================================================
    // Commons
    { name: "Atlantic Mackerel", rarity: "Common", chance: 26, color: "#6E9AA8", drain: 16, price: 14, zone: "ocean", shape: "mackerel" },
    { name: "Atlantic Cod", rarity: "Common", chance: 22, color: "#A89A78", drain: 18, price: 18, zone: "ocean", shape: "cod" },
    // Uncommon
    { name: "Yellowfin Tuna", rarity: "Uncommon", chance: 10, color: "#C8A63A", drain: 30, price: 55, zone: "ocean", shape: "tuna" },
    { name: "Atlantic Salmon", rarity: "Uncommon", chance: 9, color: "#C98C7E", drain: 32, price: 65, zone: "ocean", shape: "salmon" },
    // Rare
    { name: "Mahi-Mahi", rarity: "Rare", chance: 5, color: "#3FAF7A", drain: 42, price: 140, zone: "ocean", shape: "mahi" },
    { name: "Clownfish", rarity: "Rare", chance: 4.5, color: "#F06A2A", drain: 38, price: 125, zone: "ocean", shape: "clownfish" },
    { name: "Regal Blue Tang", rarity: "Rare", chance: 4.5, color: "#2E6FD0", drain: 38, price: 140, zone: "ocean", shape: "tang" },
    { name: "Pacific Halibut", rarity: "Rare", chance: 4, color: "#8A7E66", drain: 42, price: 170, zone: "ocean", shape: "flatfish" },
    // Epic
    { name: "Blue Marlin", rarity: "Epic", chance: 1.5, color: "#3C5FA8", drain: 64, price: 480, zone: "ocean", shape: "marlin" },
    { name: "Swordfish", rarity: "Epic", chance: 1.3, color: "#5F6B78", drain: 66, price: 520, zone: "ocean", shape: "swordfish" },
    { name: "Ocean Sunfish", rarity: "Epic", chance: 1.1, color: "#8A8F86", drain: 68, price: 560, zone: "ocean", shape: "sunfish" },
    { name: "Lionfish", rarity: "Epic", chance: 1.2, color: "#B34A3C", drain: 60, price: 500, zone: "ocean", shape: "lionfish" },
    { name: "Porcupine Pufferfish", rarity: "Epic", chance: 1.1, color: "#B7A66A", drain: 60, price: 460, zone: "ocean", shape: "puffer" },
    { name: "Manta Ray", rarity: "Epic", chance: 1.2, color: "#3A4650", drain: 62, price: 540, zone: "ocean", shape: "ray" },
    // Legendary
    { name: "Seahorse", rarity: "Legendary", chance: 0.6, color: "#D98A3A", drain: 72, price: 1200, zone: "ocean", shape: "seahorse" },
    { name: "Great White Shark", rarity: "Legendary", chance: 0.5, color: "#6B7378", drain: 80, price: 2000, zone: "ocean", shape: "shark" },
    { name: "Oarfish", rarity: "Legendary", chance: 0.5, color: "#BFC7CC", drain: 78, price: 2200, zone: "ocean", shape: "oarfish" },
    { name: "Coelacanth", rarity: "Legendary", chance: 0.4, color: "#4A5A6A", drain: 82, price: 2600, zone: "ocean", shape: "coelacanth" }
];

// === RAIN POOL (real fish that bite in stormy weather) ====================
const RAIN_FISH = [
    { name: "Weather Loach", rarity: "Common", chance: 50, color: "#7A6A4A", drain: 16, price: 18, condition: 'rain', shape: "loach" },
    { name: "Silver Carp", rarity: "Rare", chance: 30, color: "#B8C4C8", drain: 42, price: 95, condition: 'rain', shape: "carp" },
    { name: "Blue Catfish", rarity: "Epic", chance: 15, color: "#4A5A78", drain: 66, price: 240, condition: 'rain', shape: "catfish" },
    { name: "Giant Trevally", rarity: "Legendary", chance: 5, color: "#8A9AA0", drain: 86, price: 650, condition: 'rain', shape: "trevally" }
];

// === VOID POOL (fantasy — the void is its own dimension) =====================
const VOID_FISH = [
    { name: "Shadow Guppy", rarity: "Common", chance: 50, color: "#2a1a3a", drain: 16, price: 14, condition: 'void', shape: "guppy" },
    { name: "Void Bass", rarity: "Uncommon", chance: 30, color: "#3a2a5a", drain: 34, price: 55, condition: 'void', shape: "bass" },
    { name: "Abyssal Eel", rarity: "Rare", chance: 15, color: "#1a0a2a", drain: 52, price: 120, condition: 'void', shape: "eel" },
    { name: "Phantom Ray", rarity: "Epic", chance: 8, color: "#4a2a6a", drain: 70, price: 320, condition: 'void', shape: "ray" },
    { name: "Null Shark", rarity: "Legendary", chance: 3, color: "#0a0014", drain: 90, price: 800, condition: 'void', shape: "shark" }
];

// === LAVA WORLD POOL (fantasy, kept small) ===============================
const LAVA_FISH = [
    { name: "Cinder Guppy", rarity: "Common", chance: 50, color: "#6B2B1A", drain: 15, price: 12, isLava: true, shape: "guppy" },
    { name: "Molten Bass", rarity: "Uncommon", chance: 30, color: "#B3441C", drain: 32, price: 55, isLava: true, shape: "bass" },
    { name: "Obsidian Eel", rarity: "Rare", chance: 14, color: "#2A1A1A", drain: 48, price: 150, isLava: true, shape: "eel" },
    { name: "Magma Ray", rarity: "Epic", chance: 5, color: "#E2531C", drain: 66, price: 380, isLava: true, shape: "ray" },
    { name: "Hellfire Shark", rarity: "Legendary", chance: 1, color: "#FFF0C0", drain: 85, price: 900, isLava: true, shape: "shark" }
];

if (typeof FISH_TYPES !== 'undefined') {
    FISH_TYPES.push(...RAIN_FISH, ...VOID_FISH);
}

// --- TITLE DEFINITIONS ---
const TITLE_TYPES = [
    // --- FREE / STARTER ---
    { id: 'none', text: '', price: 0 },
    { id: 'novice', text: 'Novice', price: 0 },

    // --- LGBTQ+ PRIDE (PRICES UNCHANGED) ---
    { id: 'gay', text: 'Gay', price: 0, color: '#FF69B4' },
    { id: 'lesbian', text: 'Lesbian', price: 0, color: '#FF69B4' },
    { id: 'bi', text: 'Bisexual', price: 0, color: '#A020F0' },
    { id: 'trans', text: 'Trans', price: 0, color: '#55CDFC' },
    { id: 'pan', text: 'Pansexual', price: 0, color: '#FFD700' },
    { id: 'ace', text: 'Asexual', price: 0, color: '#A9A9A9' },
    { id: 'aro', text: 'Aromantic', price: 0, color: '#32CD32' },
    { id: 'enby', text: 'Non-Binary', price: 0, color: '#9C59D1' },
    { id: 'queer', text: 'Queer', price: 0, color: '#FF4500' },
    { id: 'fluid', text: 'Genderfluid', price: 0, color: '#FF69B4' },
    { id: 'agender', text: 'Agender', price: 0, color: '#888' },
    { id: 'demi', text: 'Demisexual', price: 0, color: '#aaa' },
    { id: 'inter', text: 'Intersex', price: 0, color: '#FFD700' },
    { id: 'mlm', text: 'MLM', price: 0, color: '#00BFFF' },
    { id: 'wlw', text: 'WLW', price: 0, color: '#FF69B4' },
    { id: 'bear', text: 'Bear', price: 0, color: '#8B4513' },
    { id: 'otter', text: 'Otter', price: 0, color: '#CD853F' },
    { id: 'butch', text: 'Butch', price: 0, color: '#FFA500' },
    { id: 'femme', text: 'Femme', price: 0, color: '#FF69B4' },
    { id: 'drag', text: 'Drag Royalty', price: 500, color: '#9370DB' }, // Kept at 500
    { id: 'ally', text: 'Ally', price: 0, color: '#FFFFFF' },

    // --- STANDARD PROGRESSION (SCALED UP) ---
    { id: 'scout', text: 'Scout', price: 500 },
    { id: 'local', text: 'Local', price: 1000 },
    { id: 'angler', text: 'Angler', price: 2500 },
    { id: 'fisher', text: 'Fisher', price: 5000 },
    { id: 'hooker', text: 'Hook Master', price: 7500 },
    { id: 'sailor', text: 'Sailor', price: 10000 },
    { id: 'captain', text: 'Captain', price: 25000 },
    { id: 'pro', text: 'Pro Fisher', price: 50000 },
    { id: 'expert', text: 'Expert', price: 100000 },
    { id: 'veteran', text: 'Veteran', price: 250000 },
    { id: 'master', text: 'Master', price: 500000 },
    { id: 'legend', text: 'Legend', price: 750000 },
    { id: 'god', text: 'Fishing God', price: 1000000, color: '#FFD700' },

    // --- FUN / MISC (INFLATION ADJUSTED) ---
    { id: 'stinky', text: 'Stinky', price: 500 },
    { id: 'wet', text: 'Wet', price: 500 },
    { id: 'trash', text: 'Trash', price: 500 },
    { id: 'goblin', text: 'Goblin', price: 1000 },
    { id: 'gremlin', text: 'Gremlin', price: 1000 },
    { id: 'creature', text: 'Creature', price: 1500 },
    { id: 'cryptid', text: 'Cryptid', price: 2500 },
    { id: 'alien', text: 'Alien', price: 5000 },
    { id: 'ghost', text: 'Ghost', price: 5000 },
    { id: 'vampire', text: 'Vampire', price: 5000 },
    { id: 'werewolf', text: 'Werewolf', price: 5000 },
    { id: 'clown', text: 'Clown', price: 5000, color: '#FF0000' },
    { id: 'jester', text: 'Jester', price: 5000 },
    { id: 'baby', text: 'Baby', price: 2000 },
    { id: 'gamer', text: 'Gamer', price: 1500 },
    { id: 'hacker', text: 'Hacker', price: 13337, color: '#00FF00' },
    { id: 'dev', text: 'Developer', price: 999999 },

    { id: 'fishy', text: 'Fishy', price: 1000 },
    { id: 'salty', text: 'Salty', price: 1000 },
    { id: 'shark', text: 'Shark', price: 10000 },
    { id: 'whale', text: 'Whale', price: 50000 },
    { id: 'kraken', text: 'Kraken', price: 100000 },
    { id: 'sushi', text: 'Sushi', price: 5000 },
    { id: 'bait', text: 'Bait', price: 1000 },
    { id: 'chum', text: 'Chum', price: 1000 },

    // --- MOODS ---
    { id: 'tired', text: 'Tired', price: 500 },
    { id: 'sleepy', text: 'Sleepy', price: 500 },
    { id: 'happy', text: 'Happy', price: 500 },
    { id: 'sad', text: 'Sad', price: 500 },
    { id: 'grumpy', text: 'Grumpy', price: 500 },
    { id: 'lucky', text: 'Lucky', price: 7777 },
    { id: 'cursed', text: 'Cursed', price: 6666, color: '#800000' },
    { id: 'lost', text: 'Lost', price: 0 },

    // --- WEALTH TITLES (END GAME SINKS) ---
    { id: 'rich', text: 'Rich', price: 250000 },
    { id: 'tycoon', text: 'Tycoon', price: 1000000 },
    { id: 'investor', text: 'Investor', price: 5000000 },
    { id: 'baron', text: 'Oil Baron', price: 50000000 },

    // --- MEME / CUTE ---
    { id: 'uwu', text: 'UwU', price: 2500 },
    { id: 'owo', text: 'OwO', price: 2500 },
    { id: 'rawr', text: 'Rawr', price: 2500 },
    { id: 'meow', text: 'Meow', price: 2500 },
    { id: 'woof', text: 'Woof', price: 2500 },
    { id: 'soup', text: 'Soup', price: 1000 },
    { id: 'bread', text: 'Bread', price: 1000 },
    { id: 'egg', text: 'Egg', price: 1000 },
    { id: 'bean', text: 'Bean', price: 1000 },
    { id: 'potato', text: 'Potato', price: 1000 },
    { id: 'rock', text: 'Rock', price: 500 },

    // --- JOKE PRICE ---
    { id: 'straight', text: 'Straight', price: 999999999, color: '#444444' }
];

const TITLE_MAP = new Map(TITLE_TYPES.map(t => [t.id, t]));
function getTitleById(id) {
    return TITLE_MAP.get(id) || TITLE_MAP.get('none');
}


const FISH_NAME_MAP = new Map();
for (const fish of FISH_TYPES) {
    FISH_NAME_MAP.set(fish.name, fish);
}
// Lava fish live outside FISH_TYPES but still need name/shape lookups.
for (const fish of LAVA_FISH) {
    FISH_NAME_MAP.set(fish.name, fish);
}

function getFishByName(name) {
    return FISH_NAME_MAP.get(name);
}

// Counts only species that exist in the current roster. Older saves contain
// names from the retired procedural list; they should not inflate milestones.
function countDiscoveredSpecies(journal) {
    if (!journal) return 0;
    let count = 0;
    FISH_NAME_MAP.forEach((fish, name) => {
        const seen = journal[name];
        if (Array.isArray(seen) && seen.length > 0) count++;
    });
    return count;
}

// --- ZONE-SPECIFIC FISH ASSIGNMENT ---
// Every standard fish carries an explicit zone. The keyword fallback keeps old
// save names working if they are ever looked up again.
function getFishZone(fishName) {
    const data = FISH_NAME_MAP.get(fishName);
    if (data && data.zone) return data.zone;

    const name = String(fishName || '').toLowerCase();

    // Dark Pond: Dark/mysterious themed fish
    if (/ghost|void|shadow|abyssal|cursed|dark|phantom|wraith|spectre|null/.test(name)) return 'darkpond';

    // Ocean: Saltwater/large fish
    if (/shark|whale|tuna|marlin|kraken|swordfish|stingray|jellyfish|squid|crab|lobster|manta|barracuda|sailfish|anchovy|herring|octopus|leviathan|urchin|cod|halibut|oarfish|coelacanth/.test(name)) return 'ocean';

    // Light Pond: Small/pet fish
    if (/guppy|minnow|tetra|goldfish|koi|molly|betta|discus|oscar|pleco|loach|arowana|cichlid|angelfish/.test(name)) return 'lightpond';

    // Lake: Default freshwater (bass, trout, carp, catfish, pike, salmon, etc.)
    return 'lake';
}

// Returns fish available in a specific zone
function getFishForZone(zone) {
    // All zones get Old Boot and rain/void conditions
    const alwaysAvailable = ['Old Boot'];

    return FISH_TYPES.filter(fish => {
        // Trash is everywhere
        if (alwaysAvailable.includes(fish.name)) return true;
        // Conditional fish (rain/void) handled separately
        if (fish.condition) return false;
        // Match zone
        return (fish.zone || getFishZone(fish.name)) === zone;
    });
}

// --- FISH TIER DEFINITIONS (e.g., Glistening, Shining) ---
const TIERS = [
    { id: 'normal', name: 'Normal', chance: 70, priceMult: 1, drainMult: 1.0, color: '#fff' },
    { id: 'glistening', name: 'Glistening', chance: 18, priceMult: 1.5, drainMult: 1.2, color: '#cd7f32' },
    { id: 'shining', name: 'Shining', chance: 9, priceMult: 2.5, drainMult: 1.4, color: '#c0c0c0' },
    { id: 'opalescent', name: 'Opalescent', chance: 3, priceMult: 5.0, drainMult: 1.6, color: '#ffd700' }
];

const TIER_MAP = new Map(TIERS.map(t => [t.id, t]));
function getTierById(id) {
    return TIER_MAP.get(id) || TIER_MAP.get('normal');
}

// --- COSMETIC ITEM DEFINITIONS ---

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
    { id: 'diamond', name: 'Diamond Tiara', price: 5000000, color: '#00ffff', type: 'diamond' },
    { id: 'banana', name: 'Nano Banana', price: 1500, color: '#ffe135', type: 'banana' }
];


const SHIRT_TYPES = [
    // --- BASICS ---
    { id: 'none', name: 'No Shirt', price: 0, type: 'none' },
    { id: 'white_t', name: 'White Tee', price: 250, color: '#ffffff', type: 'crew' },
    { id: 'red_t', name: 'Red Tee', price: 250, color: '#ff0000', type: 'crew' },
    { id: 'black_t', name: 'Black Tee', price: 500, color: '#1a1a1a', type: 'crew' },
    { id: 'pink_t', name: 'Pink Tee', price: 500, color: '#FF69B4', type: 'crew' },

    // --- HOODIES (NEW) ---
    { id: 'grey_hoodie', name: 'Grey Hoodie', price: 1500, color: '#808080', type: 'hoodie' },
    { id: 'black_hoodie', name: 'Black Hoodie', price: 2000, color: '#111111', type: 'hoodie' },
    { id: 'red_hoodie', name: 'Red Hoodie', price: 2000, color: '#cc0000', type: 'hoodie' },
    { id: 'blue_hoodie', name: 'Blue Hoodie', price: 2000, color: '#00008b', type: 'hoodie' },
    { id: 'green_hoodie', name: 'Green Hoodie', price: 2000, color: '#006400', type: 'hoodie' },
    { id: 'purple_hoodie', name: 'Purple Hoodie', price: 2500, color: '#800080', type: 'hoodie' },
    { id: 'galaxy_hoodie', name: 'Galaxy Hoodie', price: 10000, color: '#2c003e', type: 'hoodie', secondary: '#4b0082' },

    // --- POLOS & BUTTON UPS ---
    { id: 'blue_polo', name: 'Blue Polo', price: 750, color: '#00008b', type: 'collared' },
    { id: 'green_polo', name: 'Green Polo', price: 750, color: '#006400', type: 'collared' },
    { id: 'purple_polo', name: 'Purple Polo', price: 1000, color: '#800080', type: 'collared' },
    { id: 'yellow_polo', name: 'Yellow Polo', price: 1000, color: '#FFD700', type: 'collared' },
    { id: 'cyan_polo', name: 'Cyan Polo', price: 1000, color: '#00FFFF', type: 'collared' },

    // --- STRIPES ---
    { id: 'striped', name: 'Striped Shirt', price: 1500, color: '#ff8800', type: 'striped' },
    { id: 'jail', name: 'Prisoner', price: 2000, color: '#ffffff', type: 'striped', secondary: '#000' },
    { id: 'bee', name: 'Bumblebee', price: 2000, color: '#FFD700', type: 'striped', secondary: '#000' },
    { id: 'candy', name: 'Candy Cane', price: 2000, color: '#FFFFFF', type: 'striped', secondary: '#FF0000' },
    { id: 'referee', name: 'Referee', price: 2500, color: '#ffffff', type: 'vertical_stripe' },

    // --- PLAID / FLANNEL ---
    { id: 'red_flannel', name: 'Lumberjack', price: 3000, color: '#cc0000', type: 'checkered' },
    { id: 'blue_flannel', name: 'Blue Plaid', price: 3000, color: '#00008b', type: 'checkered' },
    { id: 'green_flannel', name: 'Forest Plaid', price: 3000, color: '#228B22', type: 'checkered' },

    // --- OVERALLS ---
    { id: 'denim_overalls', name: 'Denim Overalls', price: 4000, color: '#4682B4', type: 'overalls', under: '#cc0000' },
    { id: 'farmer_overalls', name: 'Farmer', price: 4000, color: '#556B2F', type: 'overalls', under: '#ffffff' },
    { id: 'painter_overalls', name: 'Painter', price: 4000, color: '#dddddd', type: 'overalls', under: '#1a1a1a' },

    // --- LOGO TEES ---
    { id: 'heart_tee', name: 'Love Shirt', price: 5000, color: '#ffc0cb', type: 'logo', symbol: '❤️' },
    { id: 'star_tee', name: 'Star Shirt', price: 5000, color: '#000080', type: 'logo', symbol: '⭐' },
    { id: 'smile_tee', name: 'Happy Shirt', price: 5000, color: '#FFFF00', type: 'logo', symbol: '🙂' },
    { id: 'fish_tee', name: 'Fish Shirt', price: 5000, color: '#00CED1', type: 'logo', symbol: '🐟' },
    { id: 'skull_tee', name: 'Skull Shirt', price: 6666, color: '#000000', type: 'logo', symbol: '💀' },
    { id: 'banana_tee', name: 'Nano Banana Tee', price: 5000, color: '#2b2b2b', type: 'logo', symbol: '🍌' },

    // --- PATTERNS ---
    { id: 'camo_green', name: 'Camo Green', price: 7500, color: '#556B2F', type: 'camo' },
    { id: 'camo_desert', name: 'Camo Desert', price: 7500, color: '#F4A460', type: 'camo' },
    { id: 'hawaiian_red', name: 'Aloha Red', price: 8000, color: '#FF4500', type: 'floral' },
    { id: 'hawaiian_blue', name: 'Aloha Blue', price: 8000, color: '#00BFFF', type: 'floral' },

    // --- FORMAL / SPECIAL ---
    { id: 'suit', name: 'Black Suit', price: 10000, color: '#111111', type: 'suit' },
    { id: 'lab_coat', name: 'Lab Coat', price: 15000, color: '#ffffff', type: 'coat' },
    { id: 'tux', name: 'Tuxedo', price: 25000, color: '#111111', type: 'tux' },
    { id: 'safety', name: 'Safety Vest', price: 5000, color: '#FF4500', type: 'vest' },
    { id: 'gold', name: 'Gold Chain', price: 250000, color: '#FFD700', type: 'chain' }
];

const COLLAR_TYPES = [
    { id: 'none', name: 'No Collar', price: 0, color: '#000' },
    { id: 'red_collar', name: 'Red Collar', price: 300, color: '#ff0000', type: 'basic' },
    { id: 'blue_collar', name: 'Blue Collar', price: 300, color: '#0000ff', type: 'basic' },
    { id: 'spiked', name: 'Spiked', price: 1500, color: '#222', type: 'spiked' },
    { id: 'bell', name: 'Bell Collar', price: 2500, color: '#cc0000', type: 'bell' },
    { id: 'bowtie', name: 'Bow Tie', price: 5000, color: '#111', type: 'bow' },
    { id: 'bandana', name: 'Bandana', price: 7500, color: '#ff4444', type: 'bandana' },
    { id: 'scarf', name: 'Scarf', price: 10000, color: '#00ccff', type: 'scarf' },
    { id: 'pearls', name: 'Pearls', price: 100000, color: '#ffffff', type: 'pearls' }
];

// --- FUR PATTERN DEFINITIONS ---
const PATTERN_TYPES = [
    { id: 'none', name: 'No Pattern', price: 0 },
    { id: 'spots', name: 'Spots', price: 500, color: '#000000' },
    { id: 'stripes', name: 'Tiger Stripes', price: 750, color: '#000000' },
    { id: 'calico', name: 'Calico Patches', price: 1000 },
    { id: 'tuxedo', name: 'Tuxedo', price: 800, color: '#000000' },
    { id: 'tabby', name: 'Tabby', price: 600, color: '#000000' },
    { id: 'dalmatian', name: 'Dalmatian', price: 1200, color: '#000000' },
    { id: 'cow', name: 'Cow Print', price: 1500, color: '#000000' },
    { id: 'hearts', name: 'Hearts', price: 2000, color: '#ff69b4' },
    { id: 'stars', name: 'Stars', price: 2500, color: '#ffd700' }
];
const BAIT_TYPES = [
    // EARLY GAME
    { id: 'none', name: 'No Bait', price: 0, unlockFish: 0, power: 0, rarityMult: 1.0, tierLuck: 1.0 },
    { id: 'worm', name: 'Worms', price: 20, unlockFish: 0, power: 2, rarityMult: 1.2, tierLuck: 1.0 },

    // MID GAME
    { id: 'cricket', name: 'Crickets', price: 100, unlockFish: 3, power: 4, rarityMult: 1.5, tierLuck: 1.05 },
    { id: 'squid', name: 'Squid Chunk', price: 500, unlockFish: 6, power: 6, rarityMult: 2.5, tierLuck: 1.1 },

    // HIGH TIER
    { id: 'spinner', name: 'Shiny Spinner', price: 1200, unlockFish: 9, power: 8, rarityMult: 3.5, tierLuck: 1.2 },
    { id: 'grub', name: 'Mystic Grub', price: 2500, unlockFish: 12, power: 10, rarityMult: 4.5, tierLuck: 1.3 },

    // END GAME
    { id: 'jig', name: 'Squid Jig', price: 5000, unlockFish: 16, power: 12, rarityMult: 6.0, tierLuck: 1.5 },
    { id: 'shrimp', name: 'Glowing Shrimp', price: 8000, unlockFish: 20, power: 15, rarityMult: 8.0, tierLuck: 2.0 },

    // GOD TIER
    { id: 'magic', name: 'Magic Lure', price: 15000, unlockFish: 25, power: 18, rarityMult: 10.0, tierLuck: 3.0 }
];

const ROD_TYPES = [
    // TIER 1: Wood & Basic (Starters)
    { id: 'bamboo', name: 'Bamboo Pole', price: 0, color: '#DAA520', reel: '#8B4513' },
    { id: 'oak', name: 'Oak Rod', price: 500, color: '#8B4513', reel: '#222' },
    { id: 'pine', name: 'Pine Rod', price: 500, color: '#DEB887', reel: '#555' },
    { id: 'birch', name: 'Birch Rod', price: 750, color: '#FFF8DC', reel: '#333' },
    { id: 'willow', name: 'Willow Wand', price: 1000, color: '#556B2F', reel: '#444' },

    // TIER 2: Painted (Colors)
    { id: 'red', name: 'Red Rocket', price: 2500, color: '#ff0000', reel: '#aa0000' },
    { id: 'blue', name: 'Ocean Blue', price: 2500, color: '#0000ff', reel: '#0000aa' },
    { id: 'green', name: 'Algae Green', price: 2500, color: '#00ff00', reel: '#004400' },
    { id: 'pink', name: 'Bubblegum', price: 3000, color: '#ff69b4', reel: '#ff1493' },
    { id: 'white', name: 'Clean White', price: 3000, color: '#ffffff', reel: '#999' },

    // TIER 3: Pro Materials (Metals)
    { id: 'steel', name: 'Stainless Steel', price: 5000, color: '#C0C0C0', reel: '#444' },
    { id: 'carbon', name: 'Carbon Fiber', price: 7500, color: '#111111', reel: '#555' },
    { id: 'gold_plate', name: 'Gilded', price: 10000, color: '#B8860B', reel: '#FFD700' },
    { id: 'copper', name: 'Rustic Copper', price: 10000, color: '#cd7f32', reel: '#8b4513' },
    { id: 'obsidian', name: 'Obsidian', price: 15000, color: '#2a2a2a', reel: '#500050' },

    // TIER 4: Effect / Theme
    { id: 'lava', name: 'Magma Rod', price: 25000, color: '#ff4500', reel: '#800000' },
    { id: 'ice', name: 'Frost Bite', price: 25000, color: '#00ffff', reel: '#ffffff' },
    { id: 'slime', name: 'Slime Stick', price: 30000, color: '#7cfc00', reel: '#006400' },
    { id: 'amethyst', name: 'Crystal Caster', price: 40000, color: '#9966cc', reel: '#4b0082' },
    { id: 'void', name: 'Void Caller', price: 50000, color: '#000000', reel: '#4b0082' },

    // TIER 5: Flex / Legendary
    { id: 'golden', name: 'Golden Rod', price: 100000, color: '#FFD700', reel: '#FFFFFF' },
    { id: 'diamond', name: 'Diamond Rod', price: 250000, color: '#00FFFF', reel: '#FFFFFF' },
    { id: 'rainbow', name: 'Rainbow Rod', price: 500000, color: '#FF00FF', reel: '#00FF00' },
    { id: 'banana_rod', name: 'Nano Banana Rod', price: 750000, color: '#ffe135', reel: '#8b4513' },
    { id: 'admin', name: 'Ban Hammer', price: 1000000, color: '#FF0000', reel: '#000000' },
    { id: 'invisible', name: 'Ghost Rod', price: 5000000, color: 'rgba(255,255,255,0.2)', reel: 'rgba(255,255,255,0.2)' },

    // --- MILESTONE RODS (Unlock by Unique Catch Count) ---
    { id: 'scout_milestone', name: 'Scout Pole', price: 0, unlockCount: 5, color: '#8FBC8F', reel: '#2F4F4F' },
    { id: 'hunter_milestone', name: 'Hunter Rod', price: 0, unlockCount: 10, color: '#4682B4', reel: '#191970' },

    // UPDATED: Changed from #DAA520 to #FF8C00 (Dark Orange)
    { id: 'expert_milestone', name: 'Expert Caster', price: 0, unlockCount: 15, color: '#FF8C00', reel: '#333333' },

    { id: 'master_milestone', name: 'Master Angler', price: 0, unlockCount: 20, color: '#9932CC', reel: '#4B0082' },
    { id: 'legend_milestone', name: 'Legend Keeper', price: 0, unlockCount: 25, color: '#DC143C', reel: '#800000' },
    { id: 'omega_milestone', name: 'The Completionist', price: 0, unlockCount: 30, color: '#00FA9A', reel: '#006400' }
];

// --- CORE GAME VARIABLES ---
const ISLAND_RADIUS = 120;
const LAKE_RADIUS = 20;
const PLAYER_SPEED = 10;
const GRAVITY = 20;
const JUMP_FORCE = 10;
let lastCatchTime = 0;

// --- OPEN OCEAN ---
// The island sits in a large (but finite) ocean that players can sail out
// into. WORLD_RADIUS is the hard wall at the edge of the water; OCEAN_LEVEL is
// the surface height (kept in step with the ocean plane mesh in ui.js). Beyond
// the island the water gets deep, so on foot you swim slowly rather than walk.
const WORLD_RADIUS = 1000;      // hard boundary -> world spans 2000 x 2000
const OCEAN_LEVEL = -3;         // ocean surface height (ocean plane mesh y)
const OCEAN_FLOOR = -9;         // deep sea bed height far from land
const SHALLOW_DEPTH = 2.2;      // water this shallow still counts as walkable
const SWIM_SPEED_MULT = 0.45;   // on-foot speed in deep water
// Generated islands live in this ring around the home island.
const OCEAN_ISLAND_MIN_GAP = 70; // clear water between the home island and them
const OCEAN_ISLAND_MARGIN = 90;  // keep islands off the hard wall

// --- OPTIMIZATION: REUSABLE VECTORS ---
// Pre-allocate vectors to avoid GC in the render loop
const _optVec1 = new THREE.Vector3();
const _optVec2 = new THREE.Vector3();
const _optVec3 = new THREE.Vector3();
const _optVec4 = new THREE.Vector3();
const _optColor1 = new THREE.Color();
// --------------------------------------

// --- RATE LIMITING GLOBALS (CLIENT) ---
const CHAT_COOLDOWN = 500;   // 0.5s
const SOUND_COOLDOWN = 150;  // 0.15s
const ANIM_COOLDOWN = 300;   // 0.3s
const PROP_COOLDOWN = 500;   // 0.5s

let lastChatTime = 0;
let lastSoundTime = 0;
let lastAnimTime = 0;
let lastPropTime = 0;

// --- CHAT POOL ---
const MAX_CHAT_MESSAGES = 50;
const chatPool = [];
let chatPoolIndex = 0;
// --------------------------------------

// --- SCENE & RENDERER ---
let scene, camera, renderer, clock;
let player, playerVelocity = new THREE.Vector3();
let controls = { forward: false, backward: false, left: false, right: false, jump: false };
let isRightMouseDown = false;
let isGloveActive = false;
let knockbackVelocity = new THREE.Vector3();
let localHeldFish = null;
let fishHoldTimer = null;

let lastPunchTime = 0;
let isFirstPerson = false; // New FP State
let cameraFrozen = false; // Freezes camera when menus are open
let inputBlocked = false; // Blocks player movement when menus are open

let isGuitarActive = false;
let activeMidiNotes = [];
let midiStartTime = 0;
let midiInterval = null;

let localMutedVoice = [];
let localMutedChat = [];
let localMutedMidi = []; // <--- ADD THIS

let isInLavaWorld = false;
let lavaFloorMesh = null;
let lavaLakeMesh = null;
let lavaColliders = []; // Stores rock positions for physics


// --- CAMERA ---
let cameraDistance = 6;
const MIN_ZOOM = 2;
const MAX_ZOOM = 20;

// --- GAME STATE & WORLD ---
let isMobile = false;
let npcMerchant, npcStylist, npcBait, npcScratch, interactTarget = null;
let interactScreenId = null;   // prop id of the nearby YouTube Screen (if any)
let npcLavaMerchant, npcLavaStylist, npcLavaBait;
let treeColliders = [];
let staticColliders = [];
let treeMeshes = [];
let fishingState = 'idle', bobber = null, biteTimer = null, bobberInitialY = 0;
let fishingZone = 'lake';
// Set by releaseCast() when a custom level supplies a fishing zone; null means
// "use the normal island's position-based pond rules".
let fishingZoneCategory = null;
// Canonical zone name for the LAST completed catch. Recorded onto each caught
// fish so progression (zone achievement, pond/lava/void quests) can see where a
// fish came from. `fishingZone` uses the pool's internal names ('pond'), while
// this resolves the specific zone ('lightpond' / 'darkpond').
let lastCatchZone = null;

// Resolves the cast's pool name into the canonical zone used by progression.
// Must be called while the player is still standing at the cast spot, because
// the pond split is positional.
function resolveCatchZone() {
    if (fishingZone === 'pond') {
        if (fishingZoneCategory === 'lightpond' || fishingZoneCategory === 'darkpond') {
            return fishingZoneCategory;
        }
        // Keep this radius in step with the dark-pond cast check in releaseCast()
        // so a cast visually inside the dark pond is always labelled darkpond.
        const distToDarkPond = Math.sqrt(
            Math.pow(player.position.x - 60, 2) + Math.pow(player.position.z - 50, 2)
        );
        return distToDarkPond < 20 ? 'darkpond' : 'lightpond';
    }
    return fishingZone;
}

let isRaining = false;
let rainSystem = null;
let nextWeatherChange = Date.now() + 300000;

let voidPortalMesh = null;
let isInVoid = false;
let voidFloorMesh = null;
let lastIslandPos = new THREE.Vector3(25, 0, 0);
let nextPortalSpawn = Date.now() + 600000;
let portalDespawnTime = 0;
let portalCooldown = 0;

// Sailing: true while the player is afloat in their rowboat. While sailing the
// water collision is ignored and the player skims the lake surface, so they can
// reach open ocean (and the rarer catch pools out there).
let isSailing = false;

// --- DAY/NIGHT CYCLE ---
let worldTime = 12.0; // 0 to 24 hours (Starts at Noon)
const DAY_DURATION = 1200; // Seconds for a full 24h cycle (20 minutes)
let sunLight, sunMesh, moonMesh;
const NIGHT_COLOR = new THREE.Color(0x000022);
const DAY_COLOR = new THREE.Color(0x87CEEB);
const SUNSET_COLOR = new THREE.Color(0xFD5E53);

// --- FISHING MECHANICS ---
let isLeftMouseDown = false;
let autoClickAccumulator = 0;

// Auto-Reel Upgrade Tiers (REBALANCED)
const AUTO_CLICK_RATES = [0, 5, 10, 15, 22, 30];
const AUTO_CLICK_PRICES = [0, 1000, 5000, 20000, 100000, 500000];

// Click Power Upgrade Tiers (REBALANCED)
const CLICK_POWER_RATES = [1, 2, 4, 6, 10, 15];
const CLICK_POWER_PRICES = [0, 3000, 15000, 75000, 400000, 2000000];
let chargeStart = 0, castMarker, lastCastPos = new THREE.Vector3();
const MAX_CHARGE_TIME = 1500, MAX_CAST_DISTANCE = 18, MIN_CAST_DISTANCE = 3;
let lastFootstepTime = 0;
let lastOarTime = 0;      // throttle for the rowing stroke sound while sailing
let sailDrySince = 0;     // timestamp the player in a boat first stood on dry land

let minigame = { active: false, progress: 15, targetFish: null, drainRate: 0 };
let cameraRotationX = 0, cameraRotationY = 0;
const cameraOffset = new THREE.Vector3(0, 3, 6);

