
(function () {
    // Play domains. Substring matching covers every subdomain of both roots.
    // The game is served at https://play.htmlfishing.com (root); the lobby
    // directory is https://master.gaywebfishing.org.
    var allowedDomains = ["gaywebfishing.org", "htmlfishing.com", "localhost", "127.0.0.1"];

    // Check if the current domain is in the allowed list
    var currentDomain = window.location.hostname;

    // If domain is NOT allowed...
    if (!allowedDomains.some(d => currentDomain.includes(d))) {
        // ...Delete the entire game and show a warning
        document.body.innerHTML = "<h1 style='color:red;text-align:center;margin-top:20%'>PIRATED VERSION DETECTED<br>Please play on the official site.</h1>";

        // Throw a fake error to stop all other scripts from running
        throw new Error("Fatal: Invalid Domain");
    }
})();
// --- CORE GAME CONFIGURATION ---
const GAME_VERSION = "v12.106";

// Save-file schema version. Bump whenever a change can't be read by older
// code, and add a matching step in migrateSave() (ui.js). Kept separate from
// GAME_VERSION so a routine content update doesn't force a migration.
const SAVE_VERSION = 2;
const MAX_VOICE_DISTANCE = 50;

// --- MODULAR CHARACTER PART TYPES ---
// All parts are free and unlocked by default

const HAIR_TYPES = [
    { id: 'none', name: 'None' },
    { id: 'messy', name: 'Messy' },
    { id: 'bob', name: 'Bob Cut' },
    { id: 'long', name: 'Long & Straight' },
    { id: 'spiky', name: 'Spiky' },
    { id: 'mohawk', name: 'Mohawk' },
    { id: 'ponytail', name: 'Ponytail' },
    { id: 'pigtails', name: 'Pigtails' },
    { id: 'afro', name: 'Afro' },
    { id: 'wavy', name: 'Wavy' },
    { id: 'bangs', name: 'Bangs' },
    { id: 'buzzed', name: 'Buzz Cut' },
    { id: 'curly', name: 'Curly' },
    { id: 'emo', name: 'Emo Sweep' },
    { id: 'bun', name: 'Bun' },
    { id: 'braid', name: 'Single Braid' },
    { id: 'twintails', name: 'Twin Tails' },
    { id: 'pompadour', name: 'Pompadour' },
    { id: 'shaggy', name: 'Shaggy' },
    { id: 'undercut', name: 'Undercut' },
    { id: 'mullet', name: 'Mullet' },
    { id: 'dreads', name: 'Dreadlocks' },
    { id: 'pixie', name: 'Pixie Cut' },
    { id: 'topknot', name: 'Top Knot' },
    { id: 'sidepart', name: 'Side Part' },
    { id: 'slicked', name: 'Slicked Back' },
];

const EAR_TYPES = [
    { id: 'none', name: 'None' },
    { id: 'cat', name: 'Cat (Pointed)' },
    { id: 'bunny', name: 'Bunny (Long)' },
    { id: 'dog', name: 'Dog (Floppy)' },
    { id: 'bear', name: 'Bear (Round)' },
    { id: 'fox', name: 'Fox (Tall Pointed)' },
    { id: 'pig', name: 'Pig (Small)' },
    { id: 'dragon', name: 'Dragon (Horns)' },
    { id: 'mouse', name: 'Mouse (Big Round)' },
    { id: 'raccoon', name: 'Raccoon (Pointy)' },
    { id: 'koala', name: 'Koala (Fluffy)' },
    { id: 'cow', name: 'Cow (Horns + Side)' },
    { id: 'monkey', name: 'Monkey (Side Circle)' },
    { id: 'protogen', name: 'Protogen (Robotic)' },
    // --- NEW 25 SPECIES ---
    { id: 'wolf', name: 'Wolf (Sharp)' },
    { id: 'deer', name: 'Deer (Antlers)' },
    { id: 'owl', name: 'Owl (Tufts)' },
    { id: 'bat', name: 'Bat (Large)' },
    { id: 'shark', name: 'Shark (Fins)' },
    { id: 'dolphin', name: 'Dolphin (None)' },
    { id: 'snake', name: 'Snake (None)' },
    { id: 'tiger', name: 'Tiger (Round)' },
    { id: 'leopard', name: 'Leopard (Spotted)' },
    { id: 'rhino', name: 'Rhino (Horn)' },
    { id: 'elephant', name: 'Elephant (Large)' },
    { id: 'hippo', name: 'Hippo (Small Round)' },
    { id: 'giraffe', name: 'Giraffe (Ossicones)' },
    { id: 'zebra', name: 'Zebra (Striped)' },
    { id: 'panda', name: 'Panda (Round Black)' },
    { id: 'red_panda', name: 'Red Panda (Fluffy)' },
    { id: 'skunk', name: 'Skunk (Pointed)' },
    { id: 'otter', name: 'Otter (Small Round)' },
    { id: 'beaver', name: 'Beaver (Rounded)' },
    { id: 'hedgehog', name: 'Hedgehog (Spiky)' },
    { id: 'squirrel', name: 'Squirrel (Tufted)' },
    { id: 'chipmunk', name: 'Chipmunk (Small)' },
    { id: 'hamster', name: 'Hamster (Round)' },
    { id: 'chinchilla', name: 'Chinchilla (Large Round)' },
    { id: 'ferret', name: 'Ferret (Small Rounded)' },
];

const EYE_TYPES = [
    { id: 'standard', name: 'Standard' },
    { id: 'dragon', name: 'Dragon (Slit)' },
    { id: 'frog', name: 'Frog (Bulbous)' },
    { id: 'cute', name: 'Cute (Big)' },
    { id: 'sleepy', name: 'Sleepy' },
    { id: 'angry', name: 'Angry' },
    { id: 'cat_eyes', name: 'Cat Eyes' },
    { id: 'sparkle', name: 'Sparkle' },
    { id: 'dizzy', name: 'Dizzy' },
    { id: 'heart', name: 'Heart Eyes' },
    { id: 'x_eyes', name: 'X Eyes' },
    { id: 'dot', name: 'Dot Eyes' },
    { id: 'protogen', name: 'Protogen (Visor)' },
    // --- NEW EYE TYPES ---
    { id: 'wolf', name: 'Wolf (Fierce)' },
    { id: 'owl', name: 'Owl (Large)' },
    { id: 'shark', name: 'Shark (Dark)' },
    { id: 'snake', name: 'Snake (Slit)' },
    { id: 'tired', name: 'Tired (Bags)' },
    { id: 'wink', name: 'Wink' },
    { id: 'crying', name: 'Crying' },
    { id: 'star', name: 'Star Pupils' },
    { id: 'spiral', name: 'Spiral (Hypno)' },
    { id: 'closed', name: 'Closed (Happy)' },
    { id: 'wide', name: 'Wide (Surprised)' },
    { id: 'beady', name: 'Beady (Small)' },
    { id: 'anime', name: 'Anime (Shiny)' },
    { id: 'glasses', name: 'Glasses' },
    { id: 'sunglasses', name: 'Sunglasses' },
    { id: 'monocle', name: 'Monocle' },
    { id: 'eyepatch', name: 'Eyepatch' },
    { id: 'cross', name: 'Cross (+)' },
    { id: 'dollar', name: 'Dollar Signs' },
    { id: 'fire', name: 'Fire Eyes' },
    { id: 'galaxy', name: 'Galaxy Eyes' },
    { id: 'robot', name: 'Robot (LED)' },
    { id: 'demon', name: 'Demon (Red)' },
    { id: 'alien', name: 'Alien (Black)' },
];

const NOSE_TYPES = [
    { id: 'cat', name: 'Cat (Pink)' },
    { id: 'dog', name: 'Dog (Black)' },
    { id: 'bear', name: 'Bear (Snout)' },
    { id: 'pig', name: 'Pig (Snout)' },
    { id: 'duck', name: 'Duck (Bill)' },
    { id: 'dragon', name: 'Dragon (Nostrils)' },
    { id: 'mouse', name: 'Mouse (Whiskers)' },
    { id: 'axolotl', name: 'Axolotl (Smile)' },
    { id: 'koala', name: 'Koala (Big)' },
    { id: 'cow', name: 'Cow (Wide)' },
    { id: 'frog', name: 'Frog (Wide Mouth)' },
    { id: 'penguin', name: 'Penguin (Beak)' },
    { id: 'monkey', name: 'Monkey (Skin)' },
    { id: 'protogen', name: 'Protogen (Screen)' },
    // --- NEW NOSE TYPES ---
    { id: 'wolf', name: 'Wolf (Long Snout)' },
    { id: 'deer', name: 'Deer (Small)' },
    { id: 'owl', name: 'Owl (Beak)' },
    { id: 'bat', name: 'Bat (Flat)' },
    { id: 'shark', name: 'Shark (Gills)' },
    { id: 'dolphin', name: 'Dolphin (Long)' },
    { id: 'snake', name: 'Snake (Forked)' },
    { id: 'tiger', name: 'Tiger (Whiskers)' },
    { id: 'rhino', name: 'Rhino (Horn)' },
    { id: 'elephant', name: 'Elephant (Trunk)' },
    { id: 'hippo', name: 'Hippo (Wide)' },
    { id: 'giraffe', name: 'Giraffe (Spotted)' },
    { id: 'zebra', name: 'Zebra (Striped)' },
    { id: 'panda', name: 'Panda (Black)' },
    { id: 'skunk', name: 'Skunk (Pink)' },
    { id: 'otter', name: 'Otter (Whiskers)' },
    { id: 'beaver', name: 'Beaver (Buck Teeth)' },
    { id: 'hedgehog', name: 'Hedgehog (Small Dark)' },
    { id: 'squirrel', name: 'Squirrel (Tiny)' },
    { id: 'hamster', name: 'Hamster (Pink Tiny)' },
    { id: 'ferret', name: 'Ferret (Small Pink)' },
    { id: 'bird', name: 'Bird (Beak)' },
    { id: 'smile', name: 'Simple Smile' },
    { id: 'blep', name: 'Blep (Tongue)' },
];

const MISC_TYPES = [
    { id: 'none', name: 'None' },
    { id: 'fox_cheeks', name: 'Fox Cheeks' },
    { id: 'dragon_wings', name: 'Dragon Wings' },
    { id: 'axolotl_gills', name: 'Axolotl Gills' },
    { id: 'raccoon_mask', name: 'Raccoon Mask' },
    { id: 'lion_mane', name: 'Lion Mane' },
    { id: 'penguin_belly', name: 'Penguin Belly' },
    { id: 'protogen_visor', name: 'Protogen Visor' },
    // --- NEW MISC TYPES ---
    { id: 'wolf_ruff', name: 'Wolf Neck Ruff' },
    { id: 'deer_spots', name: 'Deer Spots' },
    { id: 'owl_feathers', name: 'Owl Feathers' },
    { id: 'bat_wings', name: 'Bat Wings' },
    { id: 'shark_fin', name: 'Shark Dorsal Fin' },
    { id: 'dolphin_fin', name: 'Dolphin Fin' },
    { id: 'snake_scales', name: 'Snake Scales' },
    { id: 'tiger_stripes', name: 'Tiger Stripes' },
    { id: 'leopard_spots', name: 'Leopard Spots' },
    { id: 'zebra_stripes', name: 'Zebra Stripes' },
    { id: 'panda_patches', name: 'Panda Eye Patches' },
    { id: 'skunk_stripe', name: 'Skunk Stripe' },
    { id: 'otter_belly', name: 'Otter Belly' },
    { id: 'hedgehog_spines', name: 'Hedgehog Spines' },
    { id: 'squirrel_cheeks', name: 'Squirrel Cheeks' },
    { id: 'hamster_cheeks', name: 'Hamster Cheeks' },
    { id: 'freckles', name: 'Freckles' },
    { id: 'blush', name: 'Blush Cheeks' },
    { id: 'scars', name: 'Battle Scars' },
    { id: 'bandage', name: 'Bandage' },
    { id: 'whiskers_long', name: 'Long Whiskers' },
    { id: 'angel_wings', name: 'Angel Wings' },
    { id: 'demon_horns', name: 'Demon Horns' },
    { id: 'halo', name: 'Floating Halo' },
];

const TAIL_TYPES = [
    { id: 'none', name: 'None' },
    { id: 'cat', name: 'Cat' },
    { id: 'bunny', name: 'Bunny (Puff)' },
    { id: 'dog', name: 'Dog (Wagging)' },
    { id: 'bear', name: 'Bear (Small)' },
    { id: 'fox', name: 'Fox (Fluffy)' },
    { id: 'pig', name: 'Pig (Curly)' },
    { id: 'dragon', name: 'Dragon (Spike)' },
    { id: 'mouse', name: 'Mouse (Thin)' },
    { id: 'duck', name: 'Duck (Feathers)' },
    { id: 'axolotl', name: 'Axolotl (Fin)' },
    { id: 'raccoon', name: 'Raccoon (Striped)' },
    { id: 'lion', name: 'Lion' },
    { id: 'monkey', name: 'Monkey (Long)' },
    { id: 'penguin', name: 'Penguin (Small)' },
    { id: 'frog', name: 'Frog (Spots)' },
    { id: 'protogen', name: 'Protogen (Mech)' },
    // --- NEW TAIL TYPES ---
    { id: 'wolf', name: 'Wolf (Bushy)' },
    { id: 'deer', name: 'Deer (Short)' },
    { id: 'owl', name: 'Owl (Feathers)' },
    { id: 'bat', name: 'Bat (Wing)' },
    { id: 'shark', name: 'Shark (Fin)' },
    { id: 'dolphin', name: 'Dolphin (Fluke)' },
    { id: 'snake', name: 'Snake (Long)' },
    { id: 'tiger', name: 'Tiger (Striped)' },
    { id: 'leopard', name: 'Leopard (Spotted)' },
    { id: 'rhino', name: 'Rhino (Short)' },
    { id: 'elephant', name: 'Elephant (Thin)' },
    { id: 'hippo', name: 'Hippo (Stubby)' },
    { id: 'giraffe', name: 'Giraffe (Tufted)' },
    { id: 'zebra', name: 'Zebra (Striped)' },
    { id: 'panda', name: 'Panda (Short)' },
    { id: 'red_panda', name: 'Red Panda (Ringed)' },
    { id: 'skunk', name: 'Skunk (Bushy Stripe)' },
    { id: 'otter', name: 'Otter (Paddle)' },
    { id: 'beaver', name: 'Beaver (Flat)' },
    { id: 'hedgehog', name: 'Hedgehog (Stubby)' },
    { id: 'squirrel', name: 'Squirrel (Fluffy)' },
    { id: 'chipmunk', name: 'Chipmunk (Striped)' },
    { id: 'hamster', name: 'Hamster (Tiny)' },
    { id: 'chinchilla', name: 'Chinchilla (Fluffy)' },
    { id: 'ferret', name: 'Ferret (Long Thin)' },
    { id: 'peacock', name: 'Peacock (Feathers)' },
    { id: 'mermaid', name: 'Mermaid (Fin)' },
];

const BOBBER_TYPES = [
    { id: 'classic', name: 'Classic Red', price: 0, color: 0xff0000, model: 'sphere' },
    { id: 'blue', name: 'Blue', price: 500, color: 0x0000ff, model: 'sphere' },
    { id: 'green', name: 'Green', price: 500, color: 0x00ff00, model: 'sphere' },
    { id: 'yellow', name: 'Yellow', price: 500, color: 0xffff00, model: 'sphere' },
    { id: 'purple', name: 'Purple', price: 500, color: 0x800080, model: 'sphere' },
    { id: 'black', name: 'Black', price: 750, color: 0x111111, model: 'sphere' },
    { id: 'white', name: 'White', price: 750, color: 0xffffff, model: 'sphere' },
    { id: 'duck', name: 'Rubber Duck', price: 5000, color: 0xffdd00, model: 'duck' },
    { id: 'cube', name: 'Cube', price: 1500, color: 0xff0000, model: 'cube' },
    { id: 'heart', name: 'Love Bobber', price: 2000, color: 0xff69b4, model: 'heart' },
    { id: 'star', name: 'Star', price: 2500, color: 0xffd700, model: 'star' },
    { id: 'skull', name: 'Skull', price: 3000, color: 0xcccccc, model: 'skull' },
    { id: 'pumpkin', name: 'Pumpkin', price: 1500, color: 0xffa500, model: 'sphere' },
    { id: 'bomb', name: 'Bomb', price: 2500, color: 0x333333, model: 'sphere' },
    { id: 'gold', name: 'Golden Orb', price: 10000, color: 0xffd700, model: 'sphere', metallic: true },
];

// --- TOOLS DEFINITION ---
const TOOLS = [
    { id: 'hands', name: 'Hands', icon: '✋', price: 0 },
    { id: 'rod', name: 'Fishing Rod', icon: '🎣', price: 0 }, // Unlocks with rod purchase
    { id: 'axe', name: 'Axe', icon: '🪓', price: 500 },
    { id: 'pickaxe', name: 'Pickaxe', icon: '⛏️', price: 800 },
    { id: 'guitar', name: 'Guitar', icon: '🎸', price: 1000 },
    { id: 'glove', name: 'Boxing Glove', icon: '🥊', price: 1000 },
    { id: 'boat', name: 'Rowboat', icon: '🛶', price: 2500, notEquippable: true },
];

// --- SKILL SYSTEM ---
// XP required for each level 1-99 (RuneScape-style exponential curve, slow progression)
const SKILL_XP_TABLE = (function () {
    const table = [0]; // Level 1 requires 0 XP
    for (let lvl = 2; lvl <= 99; lvl++) {
        let xpForLevel = 0;
        for (let i = 1; i < lvl; i++) {
            xpForLevel += Math.floor(i + 300 * Math.pow(2, i / 7));
        }
        table.push(Math.floor(xpForLevel / 4)); // Divide by 4 for game pacing
    }
    return table;
})();

// Max level XP (level 99)
const MAX_SKILL_XP = SKILL_XP_TABLE[98];

// --- SKILL REGISTRY ---
// Single source of truth for every skill: order, display name, icon (from
// icons.js) and bar colour. ui.js renders the Skills panel straight from this
// list, so adding a skill here (plus its XP call) is all it takes.
const SKILLS = [
    { id: 'fishing', name: 'Fishing', icon: 'rod', color: '#4a90d9' },
    { id: 'lumberjack', name: 'Lumberjack', icon: 'axe', color: '#a9763f' },
    { id: 'mining', name: 'Mining', icon: 'pickaxe', color: '#9aa3c0' },
    { id: 'floristry', name: 'Floristry', icon: 'flower', color: '#e58fb8' },
    { id: 'cooking', name: 'Cooking', icon: 'pot', color: '#e07b39' },
    { id: 'trading', name: 'Trading', icon: 'coin', color: '#d9b23c' },
    { id: 'sailing', name: 'Sailing', icon: 'boat', color: '#3fa9a0' }
];

const SKILL_IDS = SKILLS.map(s => s.id);

// Ensures a save has every registered skill, so old saves gain the new ones
// without a schema migration.
function ensureSkills() {
    if (!saveState.skills || typeof saveState.skills !== 'object') saveState.skills = {};
    SKILL_IDS.forEach(id => {
        if (!saveState.skills[id] || typeof saveState.skills[id] !== 'object') {
            saveState.skills[id] = { xp: 0 };
        }
        if (typeof saveState.skills[id].xp !== 'number') saveState.skills[id].xp = 0;
    });
}

// Ore types (unlock every ~10 levels)
const ORE_TYPES = [
    { id: 'stone', name: 'Stone', level: 1, price: 30, xp: 15, color: '#888888' },
    { id: 'copper', name: 'Copper Ore', level: 10, price: 60, xp: 30, color: '#B87333' },
    { id: 'tin', name: 'Tin Ore', level: 20, price: 100, xp: 50, color: '#D3D3D3' },
    { id: 'iron', name: 'Iron Ore', level: 30, price: 150, xp: 80, color: '#434343' },
    { id: 'coal', name: 'Coal', level: 40, price: 220, xp: 120, color: '#1C1C1C' },
    { id: 'gold', name: 'Gold Ore', level: 50, price: 350, xp: 180, color: '#FFD700' },
    { id: 'mithril', name: 'Mithril Ore', level: 60, price: 500, xp: 250, color: '#4169E1' },
    { id: 'adamant', name: 'Adamantite', level: 70, price: 750, xp: 350, color: '#228B22' },
    { id: 'runite', name: 'Runite Ore', level: 80, price: 1200, xp: 500, color: '#40E0D0' },
    { id: 'dragon', name: 'Dragon Ore', level: 90, price: 2000, xp: 750, color: '#FF4500' }
];

// Wood types (unlock every ~10 levels)
const WOOD_TYPES = [
    { id: 'wood', name: 'Wood', level: 1, price: 20, xp: 10, color: '#DEB887' },
    { id: 'oak', name: 'Oak', level: 10, price: 40, xp: 25, color: '#8B4513' },
    { id: 'willow', name: 'Willow', level: 20, price: 70, xp: 45, color: '#808000' },
    { id: 'maple', name: 'Maple', level: 30, price: 110, xp: 70, color: '#CD853F' },
    { id: 'yew', name: 'Yew', level: 40, price: 180, xp: 100, color: '#556B2F' },
    { id: 'magic', name: 'Magic Wood', level: 50, price: 300, xp: 150, color: '#9400D3' },
    { id: 'elder', name: 'Elder Wood', level: 60, price: 450, xp: 220, color: '#4B0082' },
    { id: 'ancient', name: 'Ancient Wood', level: 70, price: 650, xp: 300, color: '#191970' },
    { id: 'sacred', name: 'Sacred Wood', level: 80, price: 900, xp: 400, color: '#FFD700' },
    { id: 'divine', name: 'Divine Wood', level: 90, price: 1500, xp: 550, color: '#FF69B4' }
];

// Flower types (unlock every ~10 levels) - CHEAPEST money maker
const FLOWER_TYPES = [
    { id: 'daisy', name: 'Daisy', level: 1, price: 1, xp: 5, color: '#FFFFFF' },
    { id: 'dandelion', name: 'Dandelion', level: 10, price: 2, xp: 10, color: '#FFD700' },
    { id: 'tulip', name: 'Tulip', level: 20, price: 4, xp: 18, color: '#FF69B4' },
    { id: 'rose', name: 'Rose', level: 30, price: 6, xp: 28, color: '#FF0000' },
    { id: 'sunflower', name: 'Sunflower', level: 40, price: 9, xp: 40, color: '#FFA500' },
    { id: 'lily', name: 'Lily', level: 50, price: 12, xp: 55, color: '#FF1493' },
    { id: 'orchid', name: 'Orchid', level: 60, price: 15, xp: 75, color: '#9932CC' },
    { id: 'lotus', name: 'Lotus', level: 70, price: 18, xp: 100, color: '#FFB6C1' },
    { id: 'moonflower', name: 'Moonflower', level: 80, price: 22, xp: 130, color: '#E6E6FA' },
    { id: 'starbloom', name: 'Starbloom', level: 90, price: 28, xp: 175, color: '#00FFFF' }
];

// Helper: Get level from XP
function getLevelFromXP(xp) {
    for (let i = SKILL_XP_TABLE.length - 1; i >= 0; i--) {
        if (xp >= SKILL_XP_TABLE[i]) return i + 1;
    }
    return 1;
}

// Helper: Get XP required for a specific level
function getXPForLevel(level) {
    if (level < 1) return 0;
    if (level > 99) return MAX_SKILL_XP;
    return SKILL_XP_TABLE[level - 1];
}

// --- KEYBIND DEFINITIONS ---
const DEFAULT_KEYBINDS = {
    forward: 'KeyW',
    backward: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    jump: 'Space',
    interact: 'KeyE',
    voice: 'KeyV',
    guitar: 'KeyG',
    glove: 'KeyB',
    meow: 'KeyZ',
    showFish: 'KeyF',
    sail: 'KeyR',
    chat: 'Enter',
    menu: 'Escape',
    hideHud: 'KeyH'
};

const DEFAULT_SAVE_STATE = {
    money: 0,
    inventory: [],
    wood: 0, // Resource
    stone: 0,
    displayName: "Fisher",
    lobbyName: "",          // Public server-browser name used while hosting
    lobbyPublic: true,      // Whether our hosted lobby is listed in the browser
    lobbyTags: [],          // Searchable tags shown in the server browser
    lobbyAdult: false,      // 18+/adult-only flag for the server browser
    journal: {},
    unlockedBobbers: ['classic'],
    currentBobber: 'classic',
    unlockedHats: ['none'],
    currentHat: 'none',
    catColor: '#ff6347',
    bellyColor: '#ffffff',
    eyeColor: '#000000',
    baitInventory: {},
    micId: 'default',
    musicMuted: false,
    hasGlove: false,
    hasBoat: false,         // Sailing: own a rowboat (bought from the Merchant)
    species: 'cat', // Legacy
    currentEars: 'cat',
    currentEyes: 'standard',
    currentNose: 'cat',
    currentMisc: 'none',
    currentTail: 'cat',
    earsColor: '',
    noseColor: '',
    miscColor: '',
    tailColor: '',
    unlockedHair: ['none'],
    currentHair: 'none',
    hairColor: '',
    masterVolume: 0.5,
    sfxVolume: 1.0,
    midiVolume: 1.0,
    voiceVolume: 1.0,
    autoReelLevel: 0,
    clickPowerLevel: 0,
    hasGuitar: false,
    midiMuted: false,
    unlockedRods: ['bamboo'],
    currentRod: 'bamboo',
    unlockedShirts: ['none'],
    currentShirt: 'none',
    unlockedCollars: ['none'],
    currentCollar: 'none',
    currentTitle: 'none',
    showTitles: true,
    savedOutfits: [],
    lavaUnlocked: false,
    unlockedPatterns: ['none'],
    currentPattern: 'none',

    // Tools
    // NOTE: the PvP Glove is NOT free — it is only added here once the player
    // actually buys it (see actionBuyTool / the Stylist shop), which also sets
    // hasGlove. It used to default to unlocked, so the shop wrongly said "Owned".
    unlockedTools: ['hands', 'rod'],
    activeToolIndex: 0,
    unlockedTitles: ['none', 'novice', 'gay', 'lesbian', 'bi', 'trans', 'pan', 'ace', 'aro', 'enby', 'queer', 'fluid', 'agender', 'demi', 'inter', 'mlm', 'wlw', 'bear', 'otter', 'butch', 'femme', 'ally'],

    skills: {
        mining: { xp: 0 },
        lumberjack: { xp: 0 },
        fishing: { xp: 0 },
        floristry: { xp: 0 },
        cooking: { xp: 0 },
        trading: { xp: 0 },
        sailing: { xp: 0 }
    },

    oreInventory: {},   // e.g. { stone: 5, copper: 2 }
    woodInventory: {},  // e.g. { wood: 10, oak: 3 }
    flowerInventory: {}, // e.g. { daisy: 20, rose: 5 }

    // Progression (achievements / daily bounties / quests) — see progression.js
    saveVersion: 2,
    achievements: {},       // { [id]: { unlocked: true, at: ts } }
    bounties: { day: '', items: [] },
    quests: { index: 0, completed: [], completedAt: {} },
    progressViewedAt: 0,    // ts of the last time the Progress panel was opened
    fisherHinted: false,    // shown the "talk to the Old Fisher" nudge yet?
    propsPlaced: 0,         // Lifetime prop placements (props themselves aren't saved)

    // Debug
    debugMode: false,

    // Character models: false = 2D billboards, true = 3D boxes
    model3D: false,

    keybinds: { ...DEFAULT_KEYBINDS }
};

var activeBaitId = 'none';

var myDeviceID = localStorage.getItem('fish_device_id');
if (!myDeviceID) {
    myDeviceID = 'dev-' + Math.random().toString(36).substr(2, 9) + Date.now();
    localStorage.setItem('fish_device_id', myDeviceID);
}

// Global State (Loaded from Save)
var saveState = JSON.parse(JSON.stringify(DEFAULT_SAVE_STATE));
