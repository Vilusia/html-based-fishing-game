// --- FISH DEFINITIONS ---

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

/**
 * Procedurally generates a large number of fish variants by combining prefixes and base names.
 * This self-executing function expands the game's content without manual data entry.
 */
/**
         * Procedurally generates 1000 unique fish variants (20 Prefixes * 50 Bases).
         * Replaces the old limiter to ensure a massive ecosystem.
         */
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

    // Expanded to 50 bases to reach 1000 combinations
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

    // Loop runs 20 * 50 = 1000 times
    for (let p = 0; p < prefixes.length; p++) {
        for (let b = 0; b < bases.length; b++) {
            // Removed the "if count > 250" check!

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
                chance: chance / (b + 1), // Diminishing returns on chance for later bases
                color: prefix.col,
                drain: baseDrain + (b * 0.5),
                price: Math.floor(5 * prefix.mult * (1 + (b * 0.05)))
            });
        }
    }
})();

// --- SPECIAL/CONDITIONAL FISH DEFINITIONS ---
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

// Add them to the main pool
if (typeof FISH_TYPES !== 'undefined') {
    FISH_TYPES.push(...RAIN_FISH, ...VOID_FISH);
}

// --- FISH TIER DEFINITIONS (e.g., Glistening, Shining) ---
const TIERS = [
    { id: 'normal', name: 'Normal', chance: 70, priceMult: 1, drainMult: 1.0, color: '#fff' },
    { id: 'glistening', name: 'Glistening', chance: 20, priceMult: 1.5, drainMult: 1.2, color: '#cd7f32' },
    { id: 'shining', name: 'Shining', chance: 8, priceMult: 2.5, drainMult: 1.4, color: '#c0c0c0' },
    { id: 'opalescent', name: 'Opalescent', chance: 2, priceMult: 5.0, drainMult: 1.6, color: '#ffd700' }
];

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
    { id: 'diamond', name: 'Diamond Tiara', price: 5000000, color: '#00ffff', type: 'diamond' }
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

// --- BAIT DEFINITIONS (1000 FISH PROGRESSION) ---
const BAIT_TYPES = [
    // EARLY GAME
    { id: 'none', name: 'No Bait', price: 0, unlockFish: 0, power: 0, rarityMult: 1.0, tierLuck: 1.0 }, // Power reduced from 1 to 0
    { id: 'worm', name: 'Worms', price: 20, unlockFish: 0, power: 3, rarityMult: 1.2, tierLuck: 1.0 }, // Power reduced from 5 to 3

    // MID GAME (Scaled for 1000 Fish)
    { id: 'cricket', name: 'Crickets', price: 100, unlockFish: 25, power: 6, rarityMult: 1.5, tierLuck: 1.05 }, // Power reduced from 10 to 6
    { id: 'squid', name: 'Squid Chunk', price: 500, unlockFish: 75, power: 9, rarityMult: 2.5, tierLuck: 1.1 }, // Power reduced from 15 to 9

    // HIGH TIER (The Grind begins)
    { id: 'spinner', name: 'Shiny Spinner', price: 1200, unlockFish: 150, power: 12, rarityMult: 3.5, tierLuck: 1.2 }, // Power reduced from 20 to 12
    { id: 'grub', name: 'Mystic Grub', price: 2500, unlockFish: 300, power: 15, rarityMult: 4.5, tierLuck: 1.3 }, // Power reduced from 25 to 15

    // END GAME (Completionist Milestones)
    { id: 'jig', name: 'Squid Jig', price: 5000, unlockFish: 500, power: 18, rarityMult: 6.0, tierLuck: 1.5 }, // Power reduced from 30 to 18
    { id: 'shrimp', name: 'Glowing Shrimp', price: 8000, unlockFish: 700, power: 22, rarityMult: 8.0, tierLuck: 2.0 }, // Power reduced from 40 to 22

    // GOD TIER (Requires near-complete Pokedex)
    { id: 'magic', name: 'Magic Lure', price: 15000, unlockFish: 850, power: 25, rarityMult: 10.0, tierLuck: 3.0 } // Power reduced from 50 to 25
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
    { id: 'admin', name: 'Ban Hammer', price: 1000000, color: '#FF0000', reel: '#000000' },
    { id: 'invisible', name: 'Ghost Rod', price: 5000000, color: 'rgba(255,255,255,0.2)', reel: 'rgba(255,255,255,0.2)' },

    // --- MILESTONE RODS (Unlock by Unique Catch Count) ---
    { id: 'scout_milestone', name: 'Scout Pole', price: 0, unlockCount: 50, color: '#8FBC8F', reel: '#2F4F4F' },
    { id: 'hunter_milestone', name: 'Hunter Rod', price: 0, unlockCount: 100, color: '#4682B4', reel: '#191970' },

    // UPDATED: Changed from #DAA520 to #FF8C00 (Dark Orange)
    { id: 'expert_milestone', name: 'Expert Caster', price: 0, unlockCount: 250, color: '#FF8C00', reel: '#333333' },

    { id: 'master_milestone', name: 'Master Angler', price: 0, unlockCount: 500, color: '#9932CC', reel: '#4B0082' },
    { id: 'legend_milestone', name: 'Legend Keeper', price: 0, unlockCount: 750, color: '#DC143C', reel: '#800000' },
    { id: 'omega_milestone', name: 'The Completionist', price: 0, unlockCount: 1000, color: '#00FA9A', reel: '#006400' }
];

// --- CORE GAME VARIABLES ---
const ISLAND_RADIUS = 120;
const LAKE_RADIUS = 20;
const PLAYER_SPEED = 10;
const GRAVITY = 20;
const JUMP_FORCE = 10;
let lastCatchTime = 0;

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
let npcMerchant, npcStylist, npcBait, interactTarget = null;
let npcLavaMerchant, npcLavaStylist, npcLavaBait;
let treeColliders = [];
let staticColliders = [];
let treeMeshes = [];
let fishingState = 'idle', bobber = null, biteTimer = null, bobberInitialY = 0;
let fishingZone = 'lake';

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

// --- DAY/NIGHT CYCLE ---
let worldTime = 12.0; // 0 to 24 hours (Starts at Noon)
const DAY_DURATION = 300; // Seconds for a full 24h cycle (5 minutes)
let sunLight, sunMesh, moonMesh;
const NIGHT_COLOR = new THREE.Color(0x000022);
const DAY_COLOR = new THREE.Color(0x87CEEB);
const SUNSET_COLOR = new THREE.Color(0xFD5E53);

// --- FISHING MECHANICS ---
let isLeftMouseDown = false;
let autoClickAccumulator = 0;

// Auto-Reel Upgrade Tiers (REBALANCED)
const AUTO_CLICK_RATES = [0, 4, 8, 12, 16, 25];
const AUTO_CLICK_PRICES = [0, 500, 2500, 10000, 50000, 250000];

// Click Power Upgrade Tiers
const CLICK_POWER_RATES = [1, 2, 3, 5, 8, 12];
const CLICK_POWER_PRICES = [0, 2000, 10000, 50000, 250000, 1000000];
let chargeStart = 0, castMarker, lastCastPos = new THREE.Vector3();
const MAX_CHARGE_TIME = 1500, MAX_CAST_DISTANCE = 18, MIN_CAST_DISTANCE = 3;
let lastFootstepTime = 0;

let minigame = { active: false, progress: 15, targetFish: null, drainRate: 0 };
let cameraRotationX = 0, cameraRotationY = 0;
const cameraOffset = new THREE.Vector3(0, 3, 6);

