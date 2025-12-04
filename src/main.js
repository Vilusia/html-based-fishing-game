import './style.css';
import * as THREE from 'three';
import { Peer } from 'peerjs';
import { Midi } from '@tonejs/midi';
import { FISH_TYPES, LAVA_FISH, RAIN_FISH, VOID_FISH, TIERS } from './data/fish';
import { saveState, DEFAULT_KEYBINDS } from './modules/GameState.js';

import { networkManager, DEDICATED_WS_URL } from './modules/NetworkManager.js';

        // --- CORE GAME CONFIGURATION ---
        const GAME_VERSION = "v9.9";
        const MAX_VOICE_DISTANCE = 50;

        // --- FISH DEFINITIONS ---
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


// --- LAVA WORLD FISH GENERATION (250 VARIANTS) ---

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


        // Add them to the main pool

        // --- FISH TIER DEFINITIONS (e.g., Glistening, Shining) ---
        
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
        let npcMerchant, npcStylist, npcBait, npcBuilder, interactTarget = null;
		let npcLavaMerchant, npcLavaStylist, npcLavaBait, npcLavaBuilder, npcLavaKeeper;
        let treeColliders = [];
        let staticColliders = []; 
        let treeMeshes = []; 
        let canSell = false; // Add this
        let fishingState = 'idle', bobber = null, fishingLine = null, biteTimer = null, bobberInitialY = 0;
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
        let chargeStart = 0, castMarker, lastCastPos = new THREE.Vector3();
        const MAX_CHARGE_TIME = 1500, MAX_CAST_DISTANCE = 18, MIN_CAST_DISTANCE = 3;
        let lastFootstepTime = 0;

        let minigame = { active: false, progress: 15, targetFish: null, drainRate: 0 };
        let cameraRotationX = 0, cameraRotationY = 0;
        const cameraOffset = new THREE.Vector3(0, 3, 6);

        // --- NETWORKING (PEERJS) ---
        // Moved to NetworkManager
        let peer = null, myPeerId = null, currentRoomId = null, hostConn = null, clientConns = {}, isHost = false, otherPlayers = {};
        let bannedPeers = []; let mutedVoicePeers = []; let mutedChatPeers = [];
        let myData = { pos: {x:0, y:0, z:0}, rot: 0, bobber: null, name: "Fisher", color: "#ff6347", belly: "#ffffff", hat: "none", species: "cat" };

        // --- AUDIO (Web Audio API) ---
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        const masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
        const sfxGain = audioCtx.createGain();
        sfxGain.connect(masterGain);

        const midiGain = audioCtx.createGain();
        midiGain.connect(masterGain);
        let localStream = null;
        let voiceConnections = {}; 
        let voiceAnalysers = {};    
        let isMicMuted = true;      
		
				// --- ANTI-SPAM / RATE LIMITING ---
		// Tracks the last timestamp of actions per Peer ID
		const rateLimits = {}; 
		const SPAM_THRESHOLDS = {
			chat: 500,      // 500ms between chat messages
			sound: 200,     // 200ms between sounds (meows)
			prop: 1000,     // 1 second between prop spawns
			anim: 300,      // 300ms between punches
			general: 50     // 50ms min between ANY packet (prevents DOS)
		};

        // --- PROCEDURAL SOUND ENGINE ---
const Sound = {
            playSpatial: (soundName, pos, variant=0) => {
                if(audioCtx.state === 'suspended') audioCtx.resume();
                
                let nodes = null;
                const now = audioCtx.currentTime;
                
                
                let targetGain = sfxGain; 
                if (soundName === 'guitar') targetGain = midiGain;

                
                if (soundName === 'guitar') {
                    if (saveState.midiMuted) return;

                    let freq = parseFloat(variant);
                    if (!isFinite(freq) || freq <= 0 || freq > 200000) freq = 440; 
                    
                    const osc = audioCtx.createOscillator();
                    osc.type = 'sawtooth'; 
                    osc.frequency.setValueAtTime(freq, now);

                    const filter = audioCtx.createBiquadFilter();
                    filter.type = 'lowpass';
                    filter.frequency.setValueAtTime(3000, now);
                    filter.frequency.exponentialRampToValueAtTime(100, now + 0.3); 

                    const gain = audioCtx.createGain();
                    gain.gain.setValueAtTime(0.2, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5); 

                    osc.connect(filter);
                    filter.connect(gain);
                    
                    osc.start(now);
                    osc.stop(now + 1.5);
                    
                    
                    nodes = { output: gain }; 
                } 
                
                else if (soundName === 'punch') {
                    const osc = audioCtx.createOscillator(); osc.type = 'square';
                    const gain = audioCtx.createGain();
                    osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
                    gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                    osc.connect(gain); osc.start(now); osc.stop(now + 0.1); nodes = { output: gain };
                }
                
                else if (soundName === 'footstep') {
                    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.1, audioCtx.sampleRate);
                    const data = buffer.getChannelData(0); for (let i=0; i<data.length; i++) data[i] = Math.random()*2-1;
                    const noise = audioCtx.createBufferSource(); noise.buffer = buffer;
                    const gain = audioCtx.createGain(); gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now+0.1);
                    noise.connect(gain); noise.start(); nodes = { output: gain };
                } 
                
                else if (['jump', 'cast', 'splash', 'meow', 'chat', 'reel'].includes(soundName)) {
                    if (soundName === 'jump') {
                        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
                        osc.frequency.setValueAtTime(200, now); osc.frequency.linearRampToValueAtTime(600, now+0.2);
                        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.2);
                        osc.connect(gain); osc.start(); osc.stop(now+0.2); nodes = { output: gain };
                    } 
                    else if (soundName === 'cast') {
                        const osc = audioCtx.createOscillator(); osc.type='sine'; const gain = audioCtx.createGain();
                        osc.frequency.setValueAtTime(200, now); osc.frequency.linearRampToValueAtTime(600, now+0.3);
                        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.3);
                        osc.connect(gain); osc.start(); osc.stop(now+0.3); nodes = { output: gain };
                    } 
                    else if (soundName === 'splash') {
                        const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate*0.2, audioCtx.sampleRate);
                        const data = buffer.getChannelData(0); for(let i=0; i<data.length; i++) data[i] = Math.random()*2-1;
                        const noise = audioCtx.createBufferSource(); noise.buffer=buffer;
                        const filter = audioCtx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=400;
                        const gain = audioCtx.createGain(); gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now+0.2);
                        noise.connect(filter); filter.connect(gain); noise.start(); nodes = { output: gain };
                    } 
                    else if (soundName === 'meow') {
                        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.type = 'sawtooth'; osc.connect(gain); osc.start(now); 
                        if(variant === 0) { osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(600, now + 0.1); osc.frequency.exponentialRampToValueAtTime(300, now + 0.4); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0.1, now + 0.3); gain.gain.linearRampToValueAtTime(0, now + 0.5); osc.stop(now+0.5); } 
                        else if (variant === 1) { osc.frequency.setValueAtTime(350, now); osc.frequency.linearRampToValueAtTime(550, now + 0.3); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.35); osc.stop(now+0.35); } 
                        else { osc.type = 'triangle'; osc.frequency.setValueAtTime(300, now); osc.frequency.linearRampToValueAtTime(320, now+0.05); osc.frequency.linearRampToValueAtTime(300, now+0.1); osc.frequency.linearRampToValueAtTime(320, now+0.15); osc.frequency.linearRampToValueAtTime(300, now+0.2); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.3); osc.stop(now+0.3); }
                        nodes = { output: gain };
                    } 
                    else if (soundName === 'chat') {
                        const osc = audioCtx.createOscillator(); osc.type='sine'; const gain = audioCtx.createGain();
                        osc.frequency.setValueAtTime(600, now); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now+0.1);
                        osc.connect(gain); osc.start(); osc.stop(now+0.1); nodes = { output: gain };
                    } 
                    else if (soundName === 'reel') {
                        const osc = audioCtx.createOscillator(); osc.type='square'; const gain = audioCtx.createGain();
                        osc.frequency.setValueAtTime(800, now); gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now+0.05);
                        osc.connect(gain); osc.start(); osc.stop(now+0.05); nodes = { output: gain };
                    }
                } 
                
                else if (soundName === 'catch') {
                    [440, 554, 659, 880].forEach((f, i) => {
                        const osc = audioCtx.createOscillator(); osc.type='triangle'; const gain = audioCtx.createGain();
                        osc.frequency.setValueAtTime(f, now + i*0.1); gain.gain.setValueAtTime(0.1, now + i*0.1); gain.gain.exponentialRampToValueAtTime(0.01, now+i*0.1+0.3);
                        osc.connect(gain); 
                        gain.connect(targetGain); 
                        osc.start(now+i*0.1); osc.stop(now+i*0.1+0.3);
                    });
                    return; 
                }

                
                if (nodes && pos) {
                    const panner = audioCtx.createPanner();
                    panner.panningModel = 'HRTF';
                    panner.distanceModel = 'linear';
                    panner.refDistance = 1;          
                    panner.maxDistance = MAX_VOICE_DISTANCE; 
                    panner.rolloffFactor = 1;
                    
                    panner.positionX.value = pos.x;
                    panner.positionY.value = pos.y;
                    panner.positionZ.value = pos.z;
                    
                    nodes.output.connect(panner);
                    panner.connect(targetGain); 
                } else if (nodes) {
                    nodes.output.connect(targetGain); 
                }
            },
            sell: () => { 
                
                const now = audioCtx.currentTime;
                const o1 = audioCtx.createOscillator(); const g1 = audioCtx.createGain();
                o1.frequency.setValueAtTime(1000, now); g1.gain.setValueAtTime(0.1, now); g1.gain.exponentialRampToValueAtTime(0.01, now+0.1);
                o1.connect(g1); g1.connect(sfxGain); o1.start(); o1.stop(now+0.1);
                
                const o2 = audioCtx.createOscillator(); const g2 = audioCtx.createGain();
                o2.frequency.setValueAtTime(1500, now+0.1); g2.gain.setValueAtTime(0.1, now+0.1); g2.gain.exponentialRampToValueAtTime(0.01, now+0.3);
                o2.connect(g2); g2.connect(sfxGain); o2.start(now+0.1); o2.stop(now+0.3);
            }
        };

        // --- DYNAMIC MUSIC SYSTEM ---
const Music = {
            isPlaying: false,
            nextNoteTimer: null,
            droneNode: null,
            droneGain: null,
            
            
            scale: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00],
            
            init: () => {
                if(saveState.musicMuted) return;
                Music.isPlaying = true;
                Music.startDrone();
                Music.scheduleNextNote();
            },

            stop: () => {
                Music.isPlaying = false;
                clearTimeout(Music.nextNoteTimer);
                if(Music.droneNode) {
                    
                    const now = audioCtx.currentTime;
                    Music.droneGain.gain.cancelScheduledValues(now);
                    Music.droneGain.gain.exponentialRampToValueAtTime(0.001, now + 2);
                    Music.droneNode.stop(now + 2);
                    Music.droneNode = null;
                }
            },

            startDrone: () => {
                
                if(audioCtx.state === 'suspended') audioCtx.resume();
                const now = audioCtx.currentTime;
                
                const osc = audioCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = 130.81; 
                
                const gain = audioCtx.createGain();
                gain.gain.value = 0;
                
                osc.connect(gain);
                gain.connect(masterGain);
                
                osc.start();
                gain.gain.linearRampToValueAtTime(0.05, now + 5); 
                
                Music.droneNode = osc;
                Music.droneGain = gain;
            },

            playRandomNote: () => {
                if(!Music.isPlaying) return;
                const now = audioCtx.currentTime;
                
                
                const freq = Music.scale[Math.floor(Math.random() * Music.scale.length)];
                const duration = 2 + Math.random() * 2; 
                
                const osc = audioCtx.createOscillator();
                osc.type = 'triangle'; 
                osc.frequency.value = freq;
                
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 800; 
                
                const gain = audioCtx.createGain();
                gain.gain.value = 0;
                
                
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(masterGain);
                
                
                osc.start();
                gain.gain.linearRampToValueAtTime(0.03, now + 1); 
                gain.gain.exponentialRampToValueAtTime(0.001, now + duration); 
                osc.stop(now + duration);
            },

            scheduleNextNote: () => {
                if(!Music.isPlaying) return;
                Music.playRandomNote();
                
                const delay = 2000 + Math.random() * 4000;
                Music.nextNoteTimer = setTimeout(Music.scheduleNextNote, delay);
            }
        };

        // --- PROCEDURAL RAIN AUDIO ENGINE ---
        const RainAudio = {
            source: null,
            gainNode: null,
            filterNode: null,
            isPlaying: false,

            init: () => {
                if (!audioCtx) return;
        
                // 1. Create Pink Noise Buffer (Sounds like water/rain)
                const bufferSize = 2 * audioCtx.sampleRate;
                const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                const output = buffer.getChannelData(0);
                let b0, b1, b2, b3, b4, b5, b6;
                b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
        
                for (let i = 0; i < bufferSize; i++) {
                    const white = Math.random() * 2 - 1;
                    b0 = 0.99886 * b0 + white * 0.0555179;
                    b1 = 0.99332 * b1 + white * 0.0750759;
                    b2 = 0.96900 * b2 + white * 0.1538520;
                    b3 = 0.86650 * b3 + white * 0.3104856;
                    b4 = 0.55000 * b4 + white * 0.5329522;
                    b5 = -0.7616 * b5 - white * 0.0168980;
                    output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                    output[i] *= 0.11; // Lower base volume
                    b6 = white * 0.115926;
                }

                RainAudio.buffer = buffer;
            },

            toggle: (shouldPlay) => {
                if (!audioCtx || audioCtx.state === 'suspended') return;
        
                const now = audioCtx.currentTime;

                if (shouldPlay) {
                    if (!RainAudio.isPlaying) {
                        // Setup Graph: Source -> Filter -> Gain -> Master
                        RainAudio.source = audioCtx.createBufferSource();
                        RainAudio.source.buffer = RainAudio.buffer;
                        RainAudio.source.loop = true;

                        // Lowpass Filter: Makes it sound "muffled" and soft, not harsh static
                        RainAudio.filterNode = audioCtx.createBiquadFilter();
                        RainAudio.filterNode.type = 'lowpass';
                        RainAudio.filterNode.frequency.value = 800; // 800Hz is a nice soft rain sound

                        RainAudio.gainNode = audioCtx.createGain();
                        RainAudio.gainNode.gain.setValueAtTime(0, now);

                        RainAudio.source.connect(RainAudio.filterNode);
                        RainAudio.filterNode.connect(RainAudio.gainNode);
                        RainAudio.gainNode.connect(sfxGain); // Use SFX slider for volume

                        RainAudio.source.start(0);
                        RainAudio.isPlaying = true;
                    }
            
                    // Fade In
                    RainAudio.gainNode.gain.setTargetAtTime(0.3, now, 2); // Target volume 0.3, takes ~2s
                } else {
                    if (RainAudio.isPlaying && RainAudio.gainNode) {
                        // Fade Out
                        RainAudio.gainNode.gain.setTargetAtTime(0, now, 0.5);
                
                        // Fully stop after fade
                        setTimeout(() => {
                            if (!isRaining && RainAudio.source) {
                                RainAudio.source.stop();
                                RainAudio.source = null;
                                RainAudio.isPlaying = false;
                            }
                        }, 2000);
                    }
                }
            }
        };

        // Initialize buffer immediately
        try { RainAudio.init(); } catch(e){}

        
        function broadcastSound(name, variant=0) {
            if(!player) return;
            Sound.playSpatial(name, player.position, variant);
    
            const msg = { type: 'sound', name: name, pos: {x:player.position.x, y:player.position.y, z:player.position.z}, var: variant };
    
            // Send to whoever we are connected to
            if(isHost) broadcastToClients(msg);
            else if(hostConn && hostConn.open) hostConn.send(msg);
            else if(isConnectedToDedicated && dedicatedSocket) dedicatedSocket.send(JSON.stringify(msg));
        }

        // --- IMPORT / EXPORT FUNCTIONS ---

        function exportSaveFile() {
            // 1. Force a save to local storage first to ensure data is fresh
            saveGame(); 

            // 2. Convert saveState to JSON string
            const data = JSON.stringify(saveState, null, 2); // Pretty print
            const blob = new Blob([data], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
    
            // 3. Create temporary link to trigger download
            const a = document.createElement('a');
            a.href = url;
            a.download = `FisherSave_${saveState.displayName}_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
    
            // 4. Cleanup
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
    
            showToast("Save file exported!");
        }

        function importSaveFile(input) {
            if (input.files.length === 0) return;
    
            const file = input.files[0];
            const reader = new FileReader();
    
            reader.onload = function(e) {
                try {
                    const json = JSON.parse(e.target.result);
            
                    // Basic validation to prevent crashing
                    if (json.money === undefined || !Array.isArray(json.inventory)) {
                        showToast("Error: Invalid save file format.");
                        return;
                    }

                    // Apply the loaded data (Maintain const reference)
                    Object.keys(saveState).forEach(key => delete saveState[key]);
                    Object.assign(saveState, json);
            
                    // Save to local storage immediately
                    saveGame(); 
            
                    showToast("Save imported! Reloading...");
            
                    // Reload page to ensure all visuals/logic update correctly
                    setTimeout(() => location.reload(), 1000);
            
                } catch (err) {
                    console.error(err);
                    showToast("Error reading save file.");
                }
            };
    
            reader.readAsText(file);
    
            // Reset input so you can select the same file again if needed
            input.value = ''; 
        }

        function mulberry32(a) { return function() { var t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }
        function xmur3(str) { for(var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 3432918353), h = h << 13 | h >>> 19; return function() { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; } }

        
        // --- KEYBIND DEFINITIONS ---
        // Moved to GameState.js

        // --- SAVE DATA STRUCTURE & HANDLING ---
        // saveState moved to GameState.js
        let activeBaitId = 'none';
        
        
        let myDeviceID = localStorage.getItem('fish_device_id');
        if (!myDeviceID) {
            myDeviceID = 'dev-' + Math.random().toString(36).substr(2, 9) + Date.now();
            localStorage.setItem('fish_device_id', myDeviceID);
        }

        function loadSave() {
            const s = localStorage.getItem('islandFisherSave');
            if(s) {
                try {
                    const d = JSON.parse(s);
                    // Basic stats
                    if(d.money !== undefined) saveState.money = d.money;
                    if(d.inventory) saveState.inventory = d.inventory;
                    if(d.displayName) saveState.displayName = d.displayName;
                    if(d.journal) saveState.journal = d.journal;
                    
                    // Visuals
                    if(d.unlockedHats) saveState.unlockedHats = d.unlockedHats;
                    if(d.currentHat) saveState.currentHat = d.currentHat;
                    if(d.catColor) saveState.catColor = d.catColor;
                    if(d.bellyColor) saveState.bellyColor = d.bellyColor;
                    if(d.eyeColor) saveState.eyeColor = d.eyeColor;
                    if(d.species) saveState.species = d.species;
                    
                    // Items
                    if(d.baitInventory) saveState.baitInventory = d.baitInventory;
                    if(d.hasGlove !== undefined) saveState.hasGlove = d.hasGlove;
                    if(d.hasGuitar !== undefined) saveState.hasGuitar = d.hasGuitar;
                    if(d.autoReelLevel !== undefined) saveState.autoReelLevel = d.autoReelLevel;

                    // New Cosmetics (Rods, Shirts, Collars)
                    if(d.unlockedRods) saveState.unlockedRods = d.unlockedRods;
                    if(d.currentRod) saveState.currentRod = d.currentRod;
                    if(d.unlockedShirts) saveState.unlockedShirts = d.unlockedShirts;
                    if(d.currentShirt) saveState.currentShirt = d.currentShirt;
                    if(d.unlockedCollars) saveState.unlockedCollars = d.unlockedCollars;
                    if(d.currentCollar) saveState.currentCollar = d.currentCollar;

                    // Titles
                    if(d.unlockedTitles) saveState.unlockedTitles = d.unlockedTitles;
                    if(d.currentTitle) saveState.currentTitle = d.currentTitle;
                    if(d.showTitles !== undefined) saveState.showTitles = d.showTitles;

                    // Audio
                    if(d.micId) saveState.micId = d.micId;
                    if(d.masterVolume !== undefined) saveState.masterVolume = d.masterVolume;
                    if(d.sfxVolume !== undefined) saveState.sfxVolume = d.sfxVolume;
                    if(d.midiVolume !== undefined) saveState.midiVolume = d.midiVolume;
                    if(d.voiceVolume !== undefined) saveState.voiceVolume = d.voiceVolume;
                    if(d.musicMuted !== undefined) saveState.musicMuted = d.musicMuted;
                    if(d.midiMuted !== undefined) saveState.midiMuted = d.midiMuted;
					if(d.unlockedProps) saveState.unlockedProps = d.unlockedProps;
					if(d.currentProp) saveState.currentProp = d.currentProp;
					
					if(d.lavaUnlocked !== undefined) saveState.lavaUnlocked = d.lavaUnlocked;

                    // --- WARDROBE FIX HERE ---
                    // This tells the game to remember your outfits when you reload!
                    if(d.savedOutfits) saveState.savedOutfits = d.savedOutfits;
                    else saveState.savedOutfits = []; 
            
                    // Keybinds
                    if(d.keybinds) {
                        saveState.keybinds = { ...DEFAULT_KEYBINDS, ...d.keybinds };
                    }
                } catch(e){ console.error("Save Load Error", e); }
            }

            // Sync visual elements
            if(masterGain) masterGain.gain.value = saveState.masterVolume;
            if(sfxGain) sfxGain.gain.value = saveState.sfxVolume;
            if(midiGain) midiGain.gain.value = saveState.midiVolume;
    
            document.getElementById('username-input').value = saveState.displayName;
            document.getElementById('fur-color-picker').value = saveState.catColor;
            document.getElementById('belly-color-picker').value = saveState.bellyColor;
            document.getElementById('eye-color-picker').value = saveState.eyeColor;
            document.getElementById('species-select').value = saveState.species;
            
            const volS = document.getElementById('volume-slider'); if(volS) volS.value = saveState.masterVolume;
            const sfxS = document.getElementById('sfx-slider'); if(sfxS) sfxS.value = saveState.sfxVolume;
            const midS = document.getElementById('midi-slider'); if(midS) midS.value = saveState.midiVolume;
            const vocS = document.getElementById('voice-slider'); if(vocS) vocS.value = saveState.voiceVolume;

            myData.name = saveState.displayName;
            myData.color = saveState.catColor;
            myData.belly = saveState.bellyColor;
            myData.eye = saveState.eyeColor;
            myData.hat = saveState.currentHat;
            myData.shirt = saveState.currentShirt;
            myData.collar = saveState.currentCollar;
            myData.rod = saveState.currentRod;
            myData.species = saveState.species;

            updateBaitSelector();
            updateUI();
            updateMusicUI();
            updateMidiUI();
        }

        function saveGame() {
            saveState.displayName = document.getElementById('username-input').value.substring(0, 12) || "Fisher";
            saveState.species = document.getElementById('species-select').value;

            myData.name = saveState.displayName;
            myData.species = saveState.species;

            updateUI(); 
            updateLocalVisuals();

            // --- ADD THIS BLOCK ---
            // Force immediate update to Dedicated Server if connected
            if (networkManager.isConnected) {
                networkManager.send({ 
                    type: 'setName', 
                    name: saveState.displayName, 
                    peerId: myPeerId 
                });
            }
            // ---------------------

            try {
                localStorage.setItem('islandFisherSave', JSON.stringify(saveState));
            } catch (e) {
                console.warn("Save failed", e);
            }
        }

        function updateWeatherVisuals() {
            // 1. Determine active state
            const isRainActive = isRaining && !isInVoid;

            // 2. Handle Particles (Show/Hide only)
            if (rainSystem) {
                rainSystem.visible = isRainActive;
            }

            // 3. Handle Audio
            if (typeof RainAudio !== 'undefined') RainAudio.toggle(isRainActive);
    
            // Note: Scene background color is handled exclusively by updateDayNightCycle().
        }
        
        // --- UI TOGGLE & UPDATE FUNCTIONS ---
        window.toggleShowTitles = function() {
            saveState.showTitles = !saveState.showTitles;
            saveGame();
            updateTitleUI(); 
            refreshAllTitles(); 
        }

        function updateTitleUI() {
            const btn = document.getElementById('btn-titles-toggle');
            if(btn) {
                btn.innerText = saveState.showTitles ? "🏷️ Titles: ON" : "🏷️ Titles: OFF";
                btn.style.color = saveState.showTitles ? '#44ff44' : '#ff4444';
            }
        }

        function refreshAllTitles() {
            
            if(player) {
                const t = player.getObjectByName('titleSprite');
                if(t) t.visible = saveState.showTitles;
            }
            
            Object.values(otherPlayers).forEach(p => {
                const t = p.mesh.getObjectByName('titleSprite');
                if(t) t.visible = saveState.showTitles;
            });
        }
		
		let chatFadeTimer = null;

        function refreshChatFade() {
            const ui = document.getElementById('chat-ui');
            if (!ui) return;

            // 1. Show immediately
            ui.style.opacity = '1';

            // 2. Clear any pending fade
            if (chatFadeTimer) clearTimeout(chatFadeTimer);

            // 3. If typing, KEEP it open. If not typing, schedule fade.
            if (document.activeElement !== document.getElementById('chat-input')) {
                chatFadeTimer = setTimeout(() => {
                    // Check again in case user clicked focus during the timer
                    if (document.activeElement !== document.getElementById('chat-input')) {
                        ui.style.opacity = '0';
                    }
                }, 5000); // 5 Seconds
            }
        }
		
		function toggleFullScreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.log(`Error attempting to enable fullscreen: ${err.message}`);
                });
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        }

        function toggleShowFish() {
            // 1. If holding something, put it away
            if (localHeldFish) {
                localHeldFish = null;
                if (fishHoldTimer) clearTimeout(fishHoldTimer);
                fishHoldTimer = null;
                updateLocalVisuals();
                return;
            }

            // 2. Check Inventory
            if (saveState.inventory.length === 0) {
                showToast("Your inventory is empty!");
                return;
            }

            // 3. Unequip other items
            if (isGuitarActive) toggleGuitar();
            if (isGloveActive) toggleGlove();
            if (fishingState !== 'idle') stopFishing(false);

            // 4. Get last fish
            const lastFish = saveState.inventory[saveState.inventory.length - 1];
    
            // 5. Equip it
            localHeldFish = {
                name: lastFish.name,
                color: lastFish.color,
                size: lastFish.size || 1.0 // Default to 1.0 for old saves
            };

            updateLocalVisuals();
            showToast(`Showing off: ${lastFish.name} (${lastFish.sizeLabel || 'Normal'})`);
        }

        function selectFish() {
			let bait = BAIT_TYPES.find(b => b.id === activeBaitId);
			if (!bait) bait = BAIT_TYPES[0]; 

			// 1. Filter Pool based on Zone
			let basePool = FISH_TYPES.filter(f => !f.condition);

			if (fishingZone === 'void') {
				// Void logic: mostly void fish
				if (Math.random() < 0.40) basePool = FISH_TYPES.filter(f => f.condition === 'void');
			} 
			else if (fishingZone === 'lava') {
				// --- LAVA LOGIC ---
				// Combine Regular Fish + Lava Fish so players can catch both
				// If you want Lava fish to be rarer, you can adjust logic here, 
				// but currently it just adds them to the pool.
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

        function updateJournal(fish, tierId) {
            if (!saveState.journal[fish.name]) saveState.journal[fish.name] = [];
            if (!saveState.journal[fish.name].includes(tierId)) saveState.journal[fish.name].push(tierId);
        }

        let isMobileInventoryOpen = false; // Initialize inventory state as closed for both mobile and desktop

        window.toggleMobileInventory = function() {
            const ui = document.getElementById('fish-log');
            
            isMobileInventoryOpen = !isMobileInventoryOpen;
            
            // Toggle the display property
            ui.style.display = isMobileInventoryOpen ? 'block' : 'none';
            
            // Ensure content is fresh when opening
            if (isMobileInventoryOpen) {
                updateUI(); 
                showToast("Inventory opened.");
            } else {
                showToast("Inventory closed.");
            }
            
            // This is the correct logic now, regardless of screen width.
            // The logic for displaying the button only on mobile must be handled in CSS (see below).
        }
        
        // Ensure this stays as the Journal toggle, separate from the Inventory toggle.
        window.toggleJournal = function() {
            const ui = document.getElementById('journal-overlay');
            ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
            if(ui.style.display === 'flex') renderJournal();
        }
        
        window.toggleOptions = function() {
            const ui = document.getElementById('options-overlay');
    
            if (ui.style.display === 'flex') {
                ui.style.display = 'none';
                // Cleanup if they closed menu while binding
                document.removeEventListener('keydown', handleRebind);
            } else {
                populateAudioInputs(); 
                updateMusicUI();
                updateMidiUI();
                updateTitleUI(); 
        
                const volSlider = document.getElementById('volume-slider');
                if(volSlider) volSlider.value = saveState.masterVolume;
        
                // NEW: Render the controls, but only for desktop
                if (!isMobile) { // Keybinds are not relevant on mobile devices.
                    renderKeybinds();
                }

                ui.style.display = 'flex'; 
            }
        }

        window.toggleShop = function() {
            const ui = document.getElementById('shop-overlay');
            ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
            if(ui.style.display === 'flex') renderShop();
        }

        window.toggleBaitShop = function() {
            const ui = document.getElementById('bait-shop-overlay');
            ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
            if(ui.style.display === 'flex') renderBaitShop();
        }
        
        window.toggleHostPanel = function() {
            const ui = document.getElementById('host-overlay');
            ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
            if(ui.style.display === 'flex') updateHostPanel();
        }

        window.changeVolume = function(val) {
            saveState.masterVolume = parseFloat(val);
            if(masterGain) masterGain.gain.setTargetAtTime(saveState.masterVolume, audioCtx.currentTime, 0.1);
            saveGame();
        }

        window.changeSFXVolume = function(val) {
            saveState.sfxVolume = parseFloat(val);
            if(sfxGain) sfxGain.gain.setTargetAtTime(saveState.sfxVolume, audioCtx.currentTime, 0.1);
            saveGame();
        }

        window.changeMidiVolume = function(val) {
            saveState.midiVolume = parseFloat(val);
            if(midiGain) midiGain.gain.setTargetAtTime(saveState.midiVolume, audioCtx.currentTime, 0.1);
            saveGame();
        }

        window.changeVoiceVolume = function(val) {
            saveState.voiceVolume = parseFloat(val);
            
            
            saveGame();
        }

        window.changeSpecies = function(species) {
            saveState.species = species;
            myData.species = species;

            
            if(player) {
                updateLocalVisuals();
            }
    
            
            if(document.getElementById('shop-overlay').style.display === 'flex') {
                renderShop();
            }
            
            saveGame();
        }

        window.toggleMusic = function() {
            saveState.musicMuted = !saveState.musicMuted;
            saveGame();
            updateMusicUI();
            
            if(saveState.musicMuted) Music.stop();
            else Music.init();
        }

        window.deleteSave = function() {
            if(confirm("⚠️ ARE YOU SURE? ⚠️\n\nThis will PERMANENTLY delete your money, items, and unlocks.\n\nPress OK to wipe your save and restart.")) {
                localStorage.removeItem('islandFisherSave');
                location.reload();
            }
        }

        window.leaveGame = function() {
            if(confirm("Are you sure you want to leave the room?")) {
                Object.keys(otherPlayers).forEach(pid => removePlayer(pid));
        
                // FIX: Close dedicated socket
                if (dedicatedSocket) {
                    dedicatedSocket.close();
                    dedicatedSocket = null;
                }

                if(peer) peer.destroy();
                location.reload();
            }
        }
        
        window.changeFurColor = function(c) {
            saveState.catColor = c;
            saveGame();
            updateLocalVisuals();
            renderShop();
        }
        
        window.changeBellyColor = function(c) {
            saveState.bellyColor = c;
            updateLocalVisuals();
            renderShop();
            saveGame();
        }

        window.changeBait = function(val) {
            
            if (fishingState !== 'idle') {
                showToast("Can't change bait while fishing!");
                
                
                
                updateBaitSelector(); 
                return;
            }
            

            activeBaitId = val;
        }

        window.changeEyeColor = function(c) {
            saveState.eyeColor = c;
            updateLocalVisuals();
            renderShop();
            saveGame();
        }
        function updateMusicUI() {
            const btn = document.getElementById('btn-music-toggle');
            if(btn) {
                btn.innerText = saveState.musicMuted ? "🎵 Music: OFF" : "🎵 Music: ON";
                btn.style.color = saveState.musicMuted ? '#ff4444' : '#44ff44';
            }
        }

        function updateLocalVisuals() {
           if(player) {
                const s = player.getObjectByName('playerSprite');

                // Generate textures based on current save state
                const texF = createSpeciesTexture(saveState.species, saveState.catColor, saveState.bellyColor, false, saveState.currentHat, saveState.currentShirt, saveState.currentCollar, saveState.eyeColor);
                const texB = createSpeciesTexture(saveState.species, saveState.catColor, saveState.bellyColor, true, saveState.currentHat, saveState.currentShirt, saveState.currentCollar, saveState.eyeColor);

                s.userData.matFront.map = texF;
                s.userData.matBack.map = texB;
        
                // Force update
                s.userData.matFront.needsUpdate = true;
                s.userData.matBack.needsUpdate = true;

                // Title Update
                const oldT = player.getObjectByName('titleSprite');
                if(oldT) player.remove(oldT);

                const tTex = createTitleTexture(saveState.currentTitle);
                if(tTex) {
                    const tSprite = new THREE.Sprite(new THREE.SpriteMaterial({map:tTex}));
                    tSprite.position.y = 2.5; tSprite.scale.set(3, 0.75, 1); tSprite.name = "titleSprite";
                    // Only show if setting is enabled
                    tSprite.visible = saveState.showTitles;
                    player.add(tSprite);
                }

                // Name Tag Update
                const oldName = player.getObjectByName('nameTag');
                if(oldName) {
                    const nameTex = createNameTagTexture(saveState.displayName);
                    oldName.material.map.dispose(); 
                    oldName.material.map = nameTex; 
                    oldName.material.needsUpdate = true;
                }

                // --- HELD ITEMS LOGIC ---
                const oldFish = player.getObjectByName('heldFishSprite');
                if (oldFish) player.remove(oldFish);
                
                const oldRod = player.getObjectByName('rod');
                if (oldRod) player.remove(oldRod);

                // 1. Showing a Fish?
                if (localHeldFish && !isGuitarActive && !isGloveActive) {
                    const fTex = createFishTexture(localHeldFish.name, localHeldFish.color);
                    const fMat = new THREE.SpriteMaterial({ 
                        map: fTex, 
                        transparent: true,
                        alphaTest: 0.5 
                    });

                    const fSprite = new THREE.Sprite(fMat);
                    fSprite.name = 'heldFishSprite';
                    fSprite.position.set(0.6, 1.2, 0.5); 

                    const size = localHeldFish.size || 1.0;
                    fSprite.scale.set(1.5 * size, 1.5 * size, 1);

                    player.add(fSprite);
                }
                // 2. Holding Rod? (Check isHandsHidden here)
                else if (!isGuitarActive && !isGloveActive && !isHandsHidden) {
                    // Create Rod with current skin
                    const rodId = saveState.currentRod || 'bamboo';
                    const rodTex = createRodTexture(rodId);
                    const rodMat = new THREE.MeshBasicMaterial({ map: rodTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
                    
                    const rodGeo = new THREE.PlaneGeometry(3.0, 3.0);
                    rodGeo.translate(1.5, 1.5, 0); 

                    const r = new THREE.Mesh(rodGeo, rodMat);
                    r.position.set(0.6, 0.8, 0.1); 
                    r.rotation.set(-0.2, -Math.PI/2, 0); 
                    r.name = "rod"; 
                    player.add(r);
                }
            }
        }
		function renderJournal() {
			const container = document.getElementById('journal-container');
			container.innerHTML = '';

			const rarityMap = { "Common": 1, "Uncommon": 2, "Rare": 3, "Epic": 4, "Legendary": 5 };

			// --- 1. AGGREGATE ALL FISH LISTS ---
			// We use a Map to ensure unique names (prevents duplicates if Rain/Void are already in FISH_TYPES)
			const fishMap = new Map();

			const addList = (list) => {
				if (list && Array.isArray(list)) {
					list.forEach(f => fishMap.set(f.name, f));
				}
			};

			addList(FISH_TYPES); // Base, Generated, and any manually pushed fish
			if (typeof LAVA_FISH !== 'undefined') addList(LAVA_FISH); // 250+ Lava Variants
			if (typeof RAIN_FISH !== 'undefined') addList(RAIN_FISH); // Rain Exclusives
			if (typeof VOID_FISH !== 'undefined') addList(VOID_FISH); // Void Exclusives

			const allFish = Array.from(fishMap.values());

			// --- 2. SORTING ---
			const sortedFish = allFish.sort((a, b) => {
				const rarityDiff = rarityMap[a.rarity] - rarityMap[b.rarity];
				if (rarityDiff !== 0) return rarityDiff;
				return a.name.localeCompare(b.name);
			});

			// --- 3. PROGRESS HEADER ---
			const totalCount = sortedFish.length;
			const caughtCount = Object.keys(saveState.journal).length;
			
			const header = document.createElement('div');
			header.style.gridColumn = "1 / -1"; 
			header.style.textAlign = "center";
			header.style.marginBottom = "15px";
			header.style.color = "#fff";
			header.style.background = "rgba(0,0,0,0.5)";
			header.style.padding = "10px";
			header.style.borderRadius = "8px";
			header.innerHTML = `<h3 style="margin:0">Discovery Progress: ${caughtCount} / ${totalCount}</h3>`;
			container.appendChild(header);

			// --- 4. RENDER GRID (Using Fragment) ---
			const fragment = document.createDocumentFragment();

			sortedFish.forEach(fish => {
				const entry = document.createElement('div');
				const caughtData = saveState.journal[fish.name];
				const isCaught = caughtData && caughtData.length > 0;

				entry.className = isCaught ? 'journal-entry unlocked' : 'journal-entry';
				
				// Inline CSS for layout
				entry.style.display = 'flex';
				entry.style.flexDirection = 'column';
				entry.style.alignItems = 'center';
				entry.style.justifyContent = 'center';
				entry.style.padding = '10px';
				entry.style.gap = '5px';

				if (isCaught) {
					const tex = createFishTexture(fish.name, fish.color);
					const canvas = document.createElement('canvas');
					canvas.width = 64; canvas.height = 64;
					const ctx = canvas.getContext('2d');
					ctx.drawImage(tex.image, 0, 0);
					entry.appendChild(canvas);
				} else {
					const placeholder = document.createElement('div');
					placeholder.style.width = '64px'; 
					placeholder.style.height = '64px';
					placeholder.style.display = 'flex';
					placeholder.style.alignItems = 'center';
					placeholder.style.justifyContent = 'center';
					placeholder.style.fontSize = '32px';
					placeholder.style.color = '#333';
					placeholder.style.fontWeight = 'bold';
					placeholder.innerText = '?';
					entry.appendChild(placeholder);
				}

				let html = `<div class="journal-name" style="color:${isCaught ? fish.color : '#555'}; font-weight:bold; font-size:12px; text-shadow: 1px 1px 0 #000; text-align:center;">${isCaught ? fish.name : "???"}</div>`;
				html += `<div class="journal-rarity" style="font-size:10px; color:#888;">${fish.rarity}</div>`;

				const textContainer = document.createElement('div');
				textContainer.innerHTML = html;

				// Show medals/tiers if caught
				if (isCaught) {
					const medalsDiv = document.createElement('div');
					medalsDiv.className = 'journal-medals';
					medalsDiv.style.justifyContent = 'center';
			
					TIERS.forEach(tier => {
						const hasTier = caughtData && caughtData.includes(tier.id);
						const m = document.createElement('div');
						m.className = `medal ${hasTier ? 'got-'+tier.id : ''}`;
						m.title = tier.name;
						medalsDiv.appendChild(m);
					});
					textContainer.appendChild(medalsDiv);
				}

				entry.appendChild(textContainer);
				fragment.appendChild(entry);
			});

			container.appendChild(fragment);
		}

/**
         * Purges all chat messages sent by a specific peerId from the UI.
         * @param {string} bannedId - The ID of the peer whose messages to remove.
         */
        function purgeUserMessages(bannedId) {
            const chatMessages = document.getElementById('chat-messages');
            if (!chatMessages) return;

            // Select all messages and filter down to the ones from the banned user
            const messages = Array.from(chatMessages.children);
            
            messages.forEach(msg => {
                // We store the sender ID in a data attribute (we'll add this next)
                if (msg.dataset.senderId === bannedId) {
                    msg.remove();
                }
            });
            showToast(`Messages by ${bannedId} purged.`);
        }
        
		
		// --- WARDROBE SYSTEM ---

        function saveCurrentOutfit() {
            if (saveState.savedOutfits.length >= 10) {
                showToast("Wardrobe full! Delete an outfit first.");
                return;
            }

            const name = prompt("Name this outfit:", `Outfit ${saveState.savedOutfits.length + 1}`);
            if (!name) return;

            const outfit = {
                id: Date.now(), // Unique ID
                name: name.substring(0, 12),
                species: saveState.species,
                color: saveState.catColor,
                belly: saveState.bellyColor,
                eye: saveState.eyeColor,
                hat: saveState.currentHat,
                shirt: saveState.currentShirt,
                collar: saveState.currentCollar,
                rod: saveState.currentRod,
                title: saveState.currentTitle
            };

            saveState.savedOutfits.push(outfit);
            saveGame();
            renderOutfitList();
            showToast("Outfit Saved!");
        }

        function loadOutfit(id) {
            const outfit = saveState.savedOutfits.find(o => o.id === id);
            if (!outfit) return;

            // Apply Settings
            saveState.species = outfit.species || 'cat';
            saveState.catColor = outfit.color || '#ff0000';
            saveState.bellyColor = outfit.belly || '#ffffff';
            saveState.eyeColor = outfit.eye || '#000000';
            
            // Check if we still own the items (in case of weird save data), otherwise default to none
            saveState.currentHat = saveState.unlockedHats.includes(outfit.hat) ? outfit.hat : 'none';
            saveState.currentShirt = saveState.unlockedShirts.includes(outfit.shirt) ? outfit.shirt : 'none';
            saveState.currentCollar = saveState.unlockedCollars.includes(outfit.collar) ? outfit.collar : 'none';
            saveState.currentRod = saveState.unlockedRods.includes(outfit.rod) ? outfit.rod : 'bamboo';
            saveState.currentTitle = saveState.unlockedTitles.includes(outfit.title) ? outfit.title : 'none';

            // Update UI Pickers
            document.getElementById('species-select').value = saveState.species;
            document.getElementById('fur-color-picker').value = saveState.catColor;
            document.getElementById('belly-color-picker').value = saveState.bellyColor;
            document.getElementById('eye-color-picker').value = saveState.eyeColor;

            saveGame();
            updateLocalVisuals();
            renderShop(); // Refreshes the "Equipped" status on buttons
            showToast(`Loaded: ${outfit.name}`);
        }

        function deleteOutfit(id) {
            if (confirm("Delete this outfit?")) {
                saveState.savedOutfits = saveState.savedOutfits.filter(o => o.id !== id);
                saveGame();
                renderOutfitList();
            }
        }

        function renderOutfitList() {
            const container = document.getElementById('outfit-list');
            if (!container) return;
            container.innerHTML = '';

            if (saveState.savedOutfits.length === 0) {
                container.innerHTML = '<div style="color:#888; text-align:center; font-size:12px; margin-top:20px;">No saved outfits.</div>';
                return;
            }

            saveState.savedOutfits.forEach(outfit => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.background = 'rgba(255,255,255,0.1)';
                row.style.borderRadius = '6px';
                row.style.padding = '5px';
                row.style.gap = '5px';

                // Load Button (The Outfit Name)
                const btnLoad = document.createElement('button');
                btnLoad.className = 'btn-sm';
                btnLoad.style.flex = '1';
                btnLoad.style.textAlign = 'left';
                btnLoad.innerText = outfit.name;
                btnLoad.onclick = () => loadOutfit(outfit.id);

                // Delete Button
                const btnDel = document.createElement('button');
                btnDel.className = 'btn-sm btn-danger';
                btnDel.style.padding = '2px 8px';
                btnDel.innerText = '×';
                btnDel.onclick = () => deleteOutfit(outfit.id);

                row.appendChild(btnLoad);
                row.appendChild(btnDel);
                container.appendChild(row);
            });
        }
        
        let shopMode = 'hats'; 

        function renderShop() {
            const container = document.getElementById('shop-container');
            container.innerHTML = '';

            // --- NAVIGATION TABS ---
            const navDiv = document.createElement('div');
            navDiv.style.gridColumn = "1 / -1"; 
            navDiv.style.width = '100%';
            navDiv.style.display = 'flex';
            navDiv.style.justifyContent = 'center';
            navDiv.style.gap = '5px';
            navDiv.style.marginBottom = '15px';

            const createTab = (id, label) => {
                const btn = document.createElement('button');
                btn.className = 'btn-lg';
                btn.style.fontSize = '12px';
                btn.style.padding = '8px 10px';
                btn.style.flex = '1'; 
                const isActive = shopMode === id;
                btn.style.background = isActive ? '#44ff44' : '#444';
                btn.style.color = isActive ? '#000' : '#fff';
                btn.style.border = isActive ? '2px solid #fff' : '1px solid #555';
                btn.innerText = label;
                btn.onclick = () => { shopMode = id; renderShop(); };
                navDiv.appendChild(btn);
            };

            createTab('hats', '🎩 Hats');
            createTab('rods', '🎣 Rods'); 
            createTab('shirts', '👕 Shirts'); 
            createTab('collars', '🔔 Collars');
            createTab('titles', '🏷️ Titles');
            createTab('misc', '🎸 Misc');
            container.appendChild(navDiv);

            // --- COLLAR TAB ---
            if (shopMode === 'collars') {
                const sortedCollars = [...COLLAR_TYPES].sort((a, b) => a.price - b.price);
                sortedCollars.forEach(item => {
                    const entry = document.createElement('div');
                    const isOwned = saveState.unlockedCollars.includes(item.id);
                    const isEquipped = saveState.currentCollar === item.id;
                    entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';
    
                    const canvas = document.createElement('canvas');
                    canvas.width = 64; canvas.height = 64;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled=false;
                    drawSpecies(ctx, saveState.species, saveState.catColor, saveState.bellyColor, saveState.eyeColor, false);
                    drawShirt(ctx, saveState.currentShirt, false); 
                    drawCollar(ctx, item.id, false);
                    entry.appendChild(canvas);

                    const name = document.createElement('div');
                    name.style.fontWeight = 'bold'; name.innerText = item.name;
                    entry.appendChild(name);

                    const btn = document.createElement('button');
                    if(isEquipped) { 
                        btn.innerText = "Equipped"; 
                        btn.disabled = true; 
                    } else if (isOwned) { 
                        btn.innerText = "Equip"; 
                        btn.onclick = () => {
                            saveState.currentCollar = item.id;
                            saveGame();
                            updateLocalVisuals();
                            renderShop();
                        };
                    } else {
                        btn.innerText = `$${item.price}`;
                        btn.style.color = saveState.money >= item.price ? '#00cc00' : '#ff4444'; 
                        btn.onclick = () => {
                            if(saveState.money >= item.price) {
                                saveState.money -= item.price;
                                saveState.unlockedCollars.push(item.id);
                                Sound.sell();
                                saveGame();
                                renderShop();
                            } else showToast("Not enough money!");
                        };
                    }
                    entry.appendChild(btn);
                    container.appendChild(entry);
                });
            }

            // --- SHIRTS TAB ---
            else if (shopMode === 'shirts') {
                const sortedShirts = [...SHIRT_TYPES].sort((a, b) => a.price - b.price);
                sortedShirts.forEach(shirt => {
                    const entry = document.createElement('div');
                    const isOwned = saveState.unlockedShirts.includes(shirt.id);
                    const isEquipped = saveState.currentShirt === shirt.id;
                    entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';
    
                    const canvas = document.createElement('canvas');
                    canvas.width = 64; canvas.height = 64;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled=false;
                    drawSpecies(ctx, saveState.species, saveState.catColor, saveState.bellyColor, saveState.eyeColor, false);
                    drawShirt(ctx, shirt.id, false); 
                    drawCollar(ctx, saveState.currentCollar, false);
                    entry.appendChild(canvas);

                    const name = document.createElement('div');
                    name.style.fontWeight = 'bold'; name.innerText = shirt.name;
                    entry.appendChild(name);

                    const btn = document.createElement('button');
                    if(isEquipped) { btn.innerText = "Equipped"; btn.disabled = true; } 
                    else if (isOwned) { 
                        btn.innerText = "Equip"; 
                        btn.onclick = () => {
                            saveState.currentShirt = shirt.id;
                            saveGame();
                            updateLocalVisuals();
                            renderShop();
                        }; 
                    } else {
                        btn.innerText = `$${shirt.price}`;
                        btn.style.color = saveState.money >= shirt.price ? '#00cc00' : '#ff4444'; 
                        btn.onclick = () => {
                            if(saveState.money >= shirt.price) {
                                saveState.money -= shirt.price;
                                saveState.unlockedShirts.push(shirt.id);
                                Sound.sell();
                                saveGame();
                                renderShop();
                            } else showToast("Not enough money!");
                        };
                    }
                    entry.appendChild(btn);
                    container.appendChild(entry);
                });
            }
    
            // --- HATS TAB ---
            else if (shopMode === 'hats') {
                const sortedHats = [...HAT_TYPES].sort((a, b) => a.price - b.price);
                sortedHats.forEach(hat => {
                     const entry = document.createElement('div');
                     const isOwned = saveState.unlockedHats.includes(hat.id);
                     const isEquipped = saveState.currentHat === hat.id;
                     entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';
     
                     const canvas = document.createElement('canvas');
                     canvas.width = 64; canvas.height = 64;
                     const ctx = canvas.getContext('2d');
                     ctx.imageSmoothingEnabled=false;
                     drawSpecies(ctx, saveState.species, saveState.catColor, saveState.bellyColor, saveState.eyeColor, false);
                     drawShirt(ctx, saveState.currentShirt, false); 
                     drawCollar(ctx, saveState.currentCollar, false); 
                     drawHat(ctx, hat.id, false);
                     entry.appendChild(canvas);

                     const name = document.createElement('div');
                     name.style.fontWeight = 'bold'; name.innerText = hat.name;
                     entry.appendChild(name);

                     const btn = document.createElement('button');
                     if(isEquipped) { btn.innerText = "Equipped"; btn.disabled = true; } 
                     else if (isOwned) { btn.innerText = "Equip"; btn.onclick = () => equipHat(hat.id); } 
                     else {
                         btn.innerText = `$${hat.price}`;
                         btn.style.color = saveState.money >= hat.price ? '#00cc00' : '#ff4444'; 
                         btn.onclick = () => buyHat(hat);
                     }
                     entry.appendChild(btn);
                     container.appendChild(entry);
                });
            }

            // --- RODS TAB ---
            else if (shopMode === 'rods') {
                const uniqueFishCount = Object.keys(saveState.journal).length;
                const sortedRods = [...ROD_TYPES].sort((a, b) => {
                    if (a.price === b.price) return (a.unlockCount || 0) - (b.unlockCount || 0);
                    return a.price - b.price;
                });

                sortedRods.forEach(item => {
                    const entry = document.createElement('div');
                    const isOwned = saveState.unlockedRods.includes(item.id);
                    const isEquipped = saveState.currentRod === item.id;
                    entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';

                    const canvas = document.createElement('canvas');
                    canvas.width = 64; canvas.height = 64;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled=false;
                    const rodTex = createRodTexture(item.id);
                    ctx.drawImage(rodTex.image, 0, 0);
                    entry.appendChild(canvas);

                    const name = document.createElement('div');
                    name.style.fontWeight = 'bold'; name.innerText = item.name;
                    entry.appendChild(name);

                    const btn = document.createElement('button');
                    
                    if(isEquipped) { 
                        btn.innerText = "Equipped"; 
                        btn.disabled = true; 
                    } else if (isOwned) { 
                        btn.innerText = "Equip"; 
                        btn.onclick = () => {
                            saveState.currentRod = item.id;
                            saveGame();
                            updateLocalVisuals();
                            renderShop();
                        };
                    } else {
                        if (item.unlockCount) {
                            if (uniqueFishCount >= item.unlockCount) {
                                btn.innerText = "Claim Reward!";
                                btn.style.color = '#00ffff'; 
                                btn.onclick = () => {
                                    saveState.unlockedRods.push(item.id);
                                    Sound.sell(); 
                                    saveGame();
                                    renderShop();
                                    showToast(`Unlocked ${item.name}!`);
                                };
                            } else {
                                btn.innerText = `Need ${item.unlockCount} Fish`;
                                btn.style.fontSize = '10px';
                                btn.style.color = '#888';
                                btn.disabled = true;
                                const prog = document.createElement('div');
                                prog.style.fontSize = '9px'; prog.style.color='#666';
                                prog.innerText = `(${uniqueFishCount} / ${item.unlockCount})`;
                                entry.appendChild(prog);
                            }
                        } else {
                            btn.innerText = `$${item.price}`;
                            btn.style.color = saveState.money >= item.price ? '#00cc00' : '#ff4444'; 
                            btn.onclick = () => {
                                if(saveState.money >= item.price) {
                                    saveState.money -= item.price;
                                    saveState.unlockedRods.push(item.id);
                                    Sound.sell();
                                    saveGame();
                                    renderShop();
                                } else showToast("Not enough money!");
                            };
                        }
                    }
                    entry.appendChild(btn);
                    container.appendChild(entry);
                });
            }

            // --- TITLES & MISC ---
            else if (shopMode === 'titles') {
                const sortedTitles = [...TITLE_TYPES].sort((a,b) => a.price - b.price);
                sortedTitles.forEach(title => {
                    const entry = document.createElement('div');
                    const isOwned = saveState.unlockedTitles.includes(title.id);
                    const isEquipped = saveState.currentTitle === title.id;
                    entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';
                    const preview = document.createElement('div');
                    preview.innerText = `< ${title.text || "No Title"} >`;
                    preview.style.color = title.color || '#87CEEB';
                    preview.style.fontWeight = 'bold';
                    entry.appendChild(preview);
                    const btn = document.createElement('button');
                    if(isEquipped) { btn.innerText = "Equipped"; btn.disabled = true; } 
                    else if (isOwned) { 
                        btn.innerText = "Equip"; 
                        btn.onclick = () => { saveState.currentTitle = title.id; saveGame(); updateLocalVisuals(); renderShop(); };
                    } else {
                        btn.innerText = `$${title.price}`;
                        btn.onclick = () => { if(saveState.money >= title.price) { saveState.money -= title.price; saveState.unlockedTitles.push(title.id); Sound.sell(); saveGame(); renderShop(); } else showToast("Not enough money!"); };
                    }
                    entry.appendChild(btn);
                    container.appendChild(entry);
                });
            }
            
            else if (shopMode === 'misc') {
                const gDiv = document.createElement('div');
                gDiv.className = saveState.hasGuitar ? 'grid-entry selected' : 'grid-entry';
                if (saveState.hasGuitar) gDiv.style.borderColor = '#ffaa00'; 
                const gTitle = document.createElement('div'); gTitle.innerHTML = "<b>🎸 Guitar</b>"; gDiv.appendChild(gTitle);
                const gDesc = document.createElement('div'); gDesc.style.fontSize = '12px'; gDesc.style.color = '#aaa'; gDesc.innerText = "Play MIDI songs!"; gDiv.appendChild(gDesc);
                const gBtn = document.createElement('button');
                if (saveState.hasGuitar) { gBtn.innerText = "Owned (Press G)"; gBtn.disabled = true; } else {
                    gBtn.innerText = "Buy ($1500)"; gBtn.style.color = saveState.money >= 1500 ? '#00cc00' : '#ff4444';
                    gBtn.onclick = () => { if(saveState.money >= 1500) { saveState.money -= 1500; saveState.hasGuitar = true; saveGame(); Sound.sell(); renderShop(); showToast("Bought Guitar! Press 'G'!"); } else showToast("Not enough cash!"); };
                }
                gDiv.appendChild(gBtn); container.appendChild(gDiv);

                const bDiv = document.createElement('div');
                bDiv.className = saveState.hasGlove ? 'grid-entry selected' : 'grid-entry';
                if (saveState.hasGlove) bDiv.style.borderColor = '#ff4444'; 
                const bTitle = document.createElement('div'); bTitle.innerHTML = "<b>🥊 Glove</b>"; bDiv.appendChild(bTitle);
                const bDesc = document.createElement('div'); bDesc.style.fontSize = '12px'; bDesc.style.color = '#aaa'; bDesc.innerText = "PvP Punching!"; bDiv.appendChild(bDesc);
                const bBtn = document.createElement('button');
                if (saveState.hasGlove) { bBtn.innerText = "Owned (Press B)"; bBtn.disabled = true; } else {
                    bBtn.innerText = "Buy ($10,000)"; bBtn.style.color = saveState.money >= 10000 ? '#00cc00' : '#ff4444';
                    bBtn.onclick = () => { if(saveState.money >= 10000) { saveState.money -= 10000; saveState.hasGlove = true; saveGame(); Sound.sell(); renderShop(); showToast("Bought Glove! Press 'B'!"); } else showToast("Not enough cash!"); };
                }
                bDiv.appendChild(bBtn); container.appendChild(bDiv);
            }

            // --- IMPORTANT: RENDER OUTFITS EVERY TIME SHOP UPDATES ---
            renderOutfitList(); 
        }

        function renderBaitShop() {
			const container = document.getElementById('bait-shop-container');
			container.innerHTML = '';
			
			// --- 1. RENDER AUTO-REEL UPGRADE ---
			const lvl = saveState.autoReelLevel;
			const maxLvl = AUTO_CLICK_RATES.length - 1;
			
			const upgradeDiv = document.createElement('div');
			upgradeDiv.className = 'grid-entry';
			upgradeDiv.style.borderColor = '#00ffff'; 
			upgradeDiv.style.background = '#002233';
			
			const upTitle = document.createElement('div');
			upTitle.innerHTML = `<b>🎣 Auto-Reel v${lvl}</b>`;
			upgradeDiv.appendChild(upTitle);

			const upDesc = document.createElement('div');
			upDesc.style.fontSize = '12px';
			upDesc.style.color = '#aaa';
			upDesc.style.margin = '5px 0';
			
			if (lvl < maxLvl) {
				const nextRate = AUTO_CLICK_RATES[lvl+1];
				upDesc.innerHTML = `Upgrade to catch faster!<br>Next: ${nextRate} Clicks/Sec`;
				upgradeDiv.appendChild(upDesc);
				
				const cost = AUTO_CLICK_PRICES[lvl+1];
				const btn = document.createElement('button');
				btn.innerText = `Upgrade ($${cost})`;
				btn.style.color = saveState.money >= cost ? '#44ff44' : '#ff4444';
				btn.onclick = () => buyAutoReelUpgrade(cost);
				upgradeDiv.appendChild(btn);
			} else {
				upDesc.innerHTML = `MAX LEVEL<br>${AUTO_CLICK_RATES[lvl]} Clicks/Sec`;
				upgradeDiv.appendChild(upDesc);
				const maxed = document.createElement('div');
				maxed.innerText = "COMPLETED";
				maxed.style.color = "#00ffff";
				maxed.style.fontWeight = "bold";
				upgradeDiv.appendChild(maxed);
			}
			container.appendChild(upgradeDiv);
			
			// --- 2. RENDER BAITS ---
			const uniqueCount = Object.keys(saveState.journal).length;

			BAIT_TYPES.forEach(bait => {
				if(bait.id === 'none') return; 

				const entry = document.createElement('div');
				entry.className = 'grid-entry';
				
				// Name
				const name = document.createElement('div');
				name.style.fontWeight = 'bold'; 
				name.innerText = bait.name;
				entry.appendChild(name);
				
				// Stats
				const info = document.createElement('div');
				info.style.fontSize = '12px'; 
				info.style.color = '#aaa';
				info.innerText = `Pwr: ${bait.power} | Luck: ${bait.rarityMult}x`;
				entry.appendChild(info);
				
				// Lock Logic
				const locked = uniqueCount < bait.unlockFish;
				
				if(locked) {
					// Locked UI
					const overlay = document.createElement('div');
					overlay.style.color = '#ff4444';
					overlay.style.fontWeight = 'bold';
					overlay.style.marginTop = '10px';
					overlay.style.fontSize = '13px';
					overlay.innerText = `🔒 Need ${bait.unlockFish} Fish`;
					entry.appendChild(overlay);
					
					// Add progress text
					const progress = document.createElement('div');
					progress.style.fontSize = '10px';
					progress.style.color = '#666';
					progress.innerText = `(${uniqueCount} / ${bait.unlockFish})`;
					entry.appendChild(progress);
				} else {
					// Unlocked UI
					const btn = document.createElement('button');
					const cost = bait.price; 
					btn.innerText = `Buy 10 ($${cost})`;
					btn.style.marginTop = '8px';
					btn.style.color = saveState.money >= cost ? '#44ff44' : '#ff4444';
					btn.onclick = () => buyBait(bait);
					entry.appendChild(btn);
				}
				
				// Owned Count
				const owned = document.createElement('div');
				owned.style.fontSize = '11px';
				owned.style.marginTop = '5px';
				owned.style.color = '#fff';
				owned.innerText = `Owned: ${saveState.baitInventory[bait.id] || 0}`;
				entry.appendChild(owned);

				container.appendChild(entry);
			});
		}
		
		let activeProps = {}; 
        let hostPropTracking = {};
		

        // --- 1. OPEN INVENTORY (Selecting) ---
        function togglePropInventory() {
            const ui = document.getElementById('prop-inventory-overlay');
            ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
            if(ui.style.display === 'flex') renderPropInventory();
        }

        function renderPropInventory() {
            const container = document.getElementById('prop-inventory-container');
            container.innerHTML = '';

            if (saveState.unlockedProps.length === 0) {
                container.innerHTML = '<div style="color:#aaa;">You have no props.<br>Visit the Bear Builder to buy some!</div>';
                return;
            }

            saveState.unlockedProps.forEach(propId => {
                const prop = PROP_TYPES.find(p => p.id === propId);
                if(!prop) return;

                const entry = document.createElement('div');
                const isSelected = saveState.currentProp === prop.id;
                entry.className = isSelected ? 'grid-entry selected' : 'grid-entry';
                if(isSelected) entry.style.borderColor = '#00ff00';

                const icon = document.createElement('div');
                icon.style.fontSize = '40px'; icon.innerText = prop.icon;
                entry.appendChild(icon);

                const name = document.createElement('div');
                name.style.fontWeight = 'bold'; name.innerText = prop.name;
                entry.appendChild(name);

                const btn = document.createElement('button');
                btn.innerText = isSelected ? "Equipped" : "Equip";
                if(isSelected) btn.disabled = true;
                
                btn.onclick = () => {
                    saveState.currentProp = prop.id;
                    saveGame();
                    renderPropInventory();
                    showToast(`Equipped: ${prop.name}`);
                };

                entry.appendChild(btn);
                container.appendChild(entry);
            });
        }
		
		function togglePropShop() {
            const ui = document.getElementById('prop-shop-overlay');
            ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
            if(ui.style.display === 'flex') renderPropShop();
        }

        function renderPropShop() {
            const container = document.getElementById('prop-shop-container');
            container.innerHTML = '';

            PROP_TYPES.forEach(prop => {
                const entry = document.createElement('div');
                const isOwned = saveState.unlockedProps.includes(prop.id);
                entry.className = isOwned ? 'grid-entry selected' : 'grid-entry';

                const icon = document.createElement('div');
                icon.style.fontSize = '40px'; icon.innerText = prop.icon;
                entry.appendChild(icon);

                const name = document.createElement('div');
                name.style.fontWeight = 'bold'; name.innerText = prop.name;
                entry.appendChild(name);

                const btn = document.createElement('button');
                if (isOwned) {
                    btn.innerText = "Owned";
                    btn.disabled = true;
                } else {
                    btn.innerText = `Buy $${prop.price}`;
                    btn.style.color = saveState.money >= prop.price ? '#44ff44' : '#ff4444';
                    btn.onclick = () => {
                        if(saveState.money >= prop.price) {
                            saveState.money -= prop.price;
                            saveState.unlockedProps.push(prop.id);
                            Sound.sell();
                            saveGame();
                            renderPropShop();
                            showToast(`Bought ${prop.name}! Press U to equip.`);
                        } else showToast("Not enough money!");
                    };
                }
                entry.appendChild(btn);
                container.appendChild(entry);
            });
        }
		
		// --- NEW STATE VARIABLE ---
        let isHandsHidden = false;

        function toggleEmptyHands() {
            // 1. Reset all other modes
            if (isGuitarActive) toggleGuitar();
            if (isGloveActive) toggleGlove();
            
            // 2. Clear held fish
            if (localHeldFish) {
                localHeldFish = null;
                if (fishHoldTimer) clearTimeout(fishHoldTimer);
                fishHoldTimer = null;
            }

            // 3. Toggle the "Hidden" state
            isHandsHidden = !isHandsHidden;

            // 4. Update Visuals
            updateLocalVisuals();
            
            // 5. Notify
            if (isHandsHidden) showToast("Hands Empty (Screenshot Mode)");
            else showToast("Rod Equipped");
        }

        function toggleGuitar() {
            if (!saveState.hasGuitar) {
                showToast("You don't own a guitar! Check the Stylist.");
                return;
            }

            if (isGloveActive) {
                isGloveActive = false;
                const g = player.getObjectByName('gloveMesh');
                if(g) g.visible = false;
            }

            if (localHeldFish) {
                localHeldFish = null;
                if (fishHoldTimer) clearTimeout(fishHoldTimer);
                fishHoldTimer = null;
                updateLocalVisuals(); 
            }

            if (!isGuitarActive && fishingState !== 'idle') {
                stopFishing(false);
            }

            isGuitarActive = !isGuitarActive;

            const ui = document.getElementById('guitar-ui');
            if(ui) ui.style.display = isGuitarActive ? 'block' : 'none';
            if (!isGuitarActive) stopMidi();

            const rod = player.getObjectByName('rod');
            if(rod) rod.visible = !isGuitarActive && !isGloveActive;

            let guitarMesh = player.getObjectByName('guitarMesh');
            if (isGuitarActive) {
                if (!guitarMesh) {
                    const c = document.createElement('canvas'); c.width=64; c.height=64;
                    const ctx = c.getContext('2d');
                    ctx.fillStyle = '#8B4513'; ctx.beginPath(); ctx.arc(32, 45, 12, 0, Math.PI*2); ctx.fill(); 
                    ctx.beginPath(); ctx.arc(32, 35, 10, 0, Math.PI*2); ctx.fill(); 
                    ctx.fillStyle = '#222'; ctx.fillRect(30, 10, 4, 30); 
                    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(32, 40, 4, 0, Math.PI*2); ctx.fill(); 
            
                    const tex = new THREE.CanvasTexture(c);
                    tex.magFilter = THREE.NearestFilter; 
                    tex.minFilter = THREE.NearestFilter;

                    // --- FIX: AlphaTest added ---
                    const mat = new THREE.SpriteMaterial({ 
                        map: tex, 
                        transparent: true, 
                        depthWrite: false, 
                        depthTest: true,
                        alphaTest: 0.5 
                    });

                    guitarMesh = new THREE.Sprite(mat);
                    guitarMesh.name = 'guitarMesh';
                    guitarMesh.renderOrder = 10;
                    guitarMesh.position.set(0.3, 1.0, 0.2); 
                    guitarMesh.scale.set(1.5, 1.5, 1);
                    player.add(guitarMesh);
                }
                guitarMesh.visible = true;
            } else {
                if (guitarMesh) guitarMesh.visible = false;
            }

            showToast(isGuitarActive ? "Guitar Equipped!" : "Guitar Unequipped");
        }

        function toggleGlove() {
            if (!saveState.hasGlove) {
                showToast("You don't own the Glove! Check the Stylist.");
                return;
            }

            // Unequip other items
            if (isGuitarActive) {
                isGuitarActive = false;
                stopMidi();
                const g = player.getObjectByName('guitarMesh');
                if(g) g.visible = false;
                const ui = document.getElementById('guitar-ui');
                if(ui) ui.style.display = 'none';
            }

            if (localHeldFish) {
                localHeldFish = null;
                if (fishHoldTimer) clearTimeout(fishHoldTimer);
                fishHoldTimer = null;
                updateLocalVisuals(); 
            }

            if (!isGloveActive && fishingState !== 'idle') {
                stopFishing(false);
            }

            isGloveActive = !isGloveActive;

            const rod = player.getObjectByName('rod');
            if(rod) rod.visible = !isGuitarActive && !isGloveActive;

            let gloveMesh = player.getObjectByName('gloveMesh');
            if (isGloveActive) {
                if (!gloveMesh) {
                    const c = document.createElement('canvas'); c.width=64; c.height=64;
                    const ctx = c.getContext('2d');
                    ctx.fillStyle = '#cc0000'; ctx.beginPath(); ctx.arc(32, 32, 20, 0, Math.PI*2); ctx.fill(); 
                    ctx.fillStyle = '#990000'; ctx.beginPath(); ctx.arc(20, 40, 10, 0, Math.PI*2); ctx.fill(); 
                    ctx.fillStyle = '#fff'; ctx.fillRect(35, 20, 10, 2); ctx.fillRect(35, 25, 10, 2); ctx.fillRect(35, 30, 10, 2);
            
                    const tex = new THREE.CanvasTexture(c);
                    tex.magFilter = THREE.NearestFilter; 
                    tex.minFilter = THREE.NearestFilter;
            
                    // --- FIX: AlphaTest added ---
                    const mat = new THREE.SpriteMaterial({ 
                        map: tex, 
                        transparent: true,
                        alphaTest: 0.5 
                    });
            
                    gloveMesh = new THREE.Sprite(mat);
                    gloveMesh.name = 'gloveMesh';
                    gloveMesh.position.set(0.6, 1.0, 0.5); 
                    gloveMesh.scale.set(1.2, 1.2, 1);
                    player.add(gloveMesh);
                }
                gloveMesh.visible = true;
            } else {
                if (gloveMesh) gloveMesh.visible = false;
            }

            showToast(isGloveActive ? "Glove Equipped!" : "Glove Unequipped");
        }
		
		function requestUndoProp() {
            // Rate limit to prevent spamming delete
            if (window.lastUndoTime && Date.now() - window.lastUndoTime < 500) return;
            window.lastUndoTime = Date.now();

            const msg = { type: 'undo_prop' };

            // Send to the correct server/host
            if (isHost) {
                // If we are the P2P Host, handle it locally
                handleUndoPropHost(myPeerId);
            } else if (isConnectedToDedicated && dedicatedSocket) {
                // Dedicated Server
                dedicatedSocket.send(JSON.stringify(msg));
            } else if (hostConn && hostConn.open) {
                // P2P Client
                hostConn.send(msg);
            }
        }

        function handleUndoPropHost(senderId) {
            // Check if user has props
            if (!hostPropTracking[senderId] || hostPropTracking[senderId].length === 0) return;

            // 1. REMOVE LAST (LIFO)
            const lastPropId = hostPropTracking[senderId].pop(); // Remove last

            // 2. BROADCAST REMOVAL
            broadcastToClients({ type: 'remove_prop', id: lastPropId });

            // 3. REMOVE LOCALLY
            const mesh = activeProps[lastPropId];
            if (mesh) { 
                scene.remove(mesh); 
                delete activeProps[lastPropId]; 
            }
            
            showToast("Undid last prop.");
        }

        // --- 3. PLACEMENT LOGIC ---
        function requestPlaceProp() {
            // Check selection
            if (!saveState.currentProp || !saveState.unlockedProps.includes(saveState.currentProp)) {
                showToast("Open Inventory (U) to equip a prop first!");
                togglePropInventory();
                return;
            }

            // Cooldown Check
            if (window.lastPropPlace && Date.now() - window.lastPropPlace < 1000) return;
            window.lastPropPlace = Date.now();

            // Calculate Position (3 units in front)
            const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
            const pos = player.position.clone().add(forward.multiplyScalar(3.0));
            
            // --- 1. LAKE PREVENTION CHECK ---
            // Calculate distance from center (0,0)
            const distFromCenter = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
            
            // If inside lake radius (plus a small buffer), block it
            if (distFromCenter < LAKE_RADIUS) {
                showToast("Cannot place props on the water!");
                return;
            }

            // --- 2. WALL/OBSTACLE CHECK ---
            const check = checkLineOfSight(player.position, pos);
            if (check.blocked) {
                showToast("Can't place that here!");
                return;
            }

            const msg = { 
                type: 'request_prop', 
                propType: saveState.currentProp, 
                x: pos.x, y: 0, z: pos.z,
                rot: player.rotation.y // <--- SEND PLAYER ROTATION
            };

            // Network Send
            if (isHost) {
                handleRequestPropHost(myPeerId, msg); // Update this helper below if you use P2P
            } else if (isConnectedToDedicated) {
                dedicatedSocket.send(JSON.stringify(msg));
            } else if (hostConn && hostConn.open) {
                hostConn.send(msg);
            }
        }

        // Helper for P2P Host (Offline/Private Mode)
        function handleRequestPropHost(senderId, msg) {
            // 1. Initialize array if needed
            if (!hostPropTracking[senderId]) hostPropTracking[senderId] = [];

            // 2. LIMIT CHECK (FIFO - Remove Oldest if > 10)
            if (hostPropTracking[senderId].length >= 10) {
                const oldestId = hostPropTracking[senderId].shift(); // Remove first
                
                // Broadcast removal
                broadcastToClients({ type: 'remove_prop', id: oldestId });
                
                // Remove locally for Host
                const mesh = activeProps[oldestId];
                if (mesh) { scene.remove(mesh); delete activeProps[oldestId]; }
            }
            
            // 3. GENERATE PROP
            const propId = `prop-${senderId}-${Date.now()}`;
            const spawnMsg = {
                type: 'spawn_prop',
                payload: {
                    id: propId, ownerId: senderId, type: msg.propType,
                    x: msg.x, y: msg.y, z: msg.z,
                    rot: msg.rot 
                }
            };
            
            // 4. SAVE & SPAWN
            hostPropTracking[senderId].push(propId); // Save ID for Undo
            
            broadcastToClients(spawnMsg);
            spawnPropMesh(spawnMsg.payload);
        }

        function spawnPropMesh(data) {
            if (activeProps[data.id]) return;

            let mesh = new THREE.Group();

            if (data.type === 'campfire') {
                const woodMat = new THREE.MeshStandardMaterial({color: 0x5D4037});
                const l1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,1.2), woodMat);
                l1.rotation.z=Math.PI/2; l1.rotation.y=Math.PI/4; l1.position.y=0.1;
                const l2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,1.2), woodMat);
                l2.rotation.z=Math.PI/2; l2.rotation.y=-Math.PI/4; l2.position.y=0.1;
                mesh.add(l1, l2);

                const fGeo = new THREE.ConeGeometry(0.25, 0.6, 5);
                const fMat = new THREE.MeshBasicMaterial({color: 0xff4500});
                const fire = new THREE.Mesh(fGeo, fMat);
                fire.position.y = 0.3; fire.name = "fireEffect";
                mesh.add(fire);

                const light = new THREE.PointLight(0xffaa00, 1, 8);
                light.position.y = 1;
                mesh.add(light);
            } 
            else if (data.type === 'lamp') {
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2), new THREE.MeshStandardMaterial({color:0x222}));
                pole.position.y = 1.0;
                const top = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.4,0.3), new THREE.MeshStandardMaterial({color:0xffffaa, emissive:0xffaa00}));
                top.position.y = 2.0;
                const light = new THREE.PointLight(0xffaa00, 0.8, 10);
                light.position.y = 2.0;
                mesh.add(pole, top, light);
            }

            else if (data.type === 'tent') {
				const tentGroup = new THREE.Group();
				const tentMat = new THREE.MeshStandardMaterial({
					color: 0x4682B4, 
					roughness: 0.9,
					side: THREE.DoubleSide 
				});
				
				// Create larger geometry
				const wallGeo = new THREE.BoxGeometry(5.0, 0.05, 5.5); // Increased size
				wallGeo.translate(0, 0.025, 0);
				
				// Position for larger tent
				const centerOffset = 1.77; // Wider spacing
				const centerHeight = 1.8; // Higher peak
				
				// Left Wall: Rotate POSITIVE to tilt INWARD (/)
				const left = new THREE.Mesh(wallGeo, tentMat);
				left.position.set(-centerOffset, centerHeight, 0);
				left.rotation.z = Math.PI / 4; 
				
				// Right Wall: Rotate NEGATIVE to tilt INWARD (\)
				const right = new THREE.Mesh(wallGeo, tentMat);
				right.position.set(centerOffset, centerHeight, 0);
				right.rotation.z = -Math.PI / 4;
				
				tentGroup.add(left, right);
				
				// Larger Sleeping Bag
				const bag = new THREE.Mesh(
					new THREE.BoxGeometry(2.8, 0.1, 4.5), // Wider for two players
					new THREE.MeshStandardMaterial({color: 0x8B0000})
				);
				bag.position.set(0, 0.1, 0.2); 
				tentGroup.add(bag);
				
				// Two Pillows
				const pillow1 = new THREE.Mesh(
					new THREE.BoxGeometry(1.0, 0.15, 0.6),
					new THREE.MeshStandardMaterial({color: 0xffffff})
				);
				pillow1.position.set(-0.7, 0.2, -1.5); // Left pillow
				tentGroup.add(pillow1);
				
				const pillow2 = new THREE.Mesh(
					new THREE.BoxGeometry(1.0, 0.15, 0.6),
					new THREE.MeshStandardMaterial({color: 0xffffff})
				);
				pillow2.position.set(0.7, 0.2, -1.5); // Right pillow
				tentGroup.add(pillow2);
				
				mesh.add(tentGroup);
			}
            // --- NEW: CHAIR ---
            else if (data.type === 'chair') {
                const seatMat = new THREE.MeshStandardMaterial({color: 0x228B22});
                const legMat = new THREE.MeshStandardMaterial({color: 0x888888});
                
                // Seat
                const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.8), seatMat);
                seat.position.y = 0.6;
                
                // Backrest
                const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.1), seatMat);
                back.position.set(0, 1.0, -0.35);
                back.rotation.x = -0.2;

                // Legs
                const l1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.6), legMat); l1.position.set(-0.35,0.3,-0.35);
                const l2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.6), legMat); l2.position.set(0.35,0.3,-0.35);
                const l3 = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.6), legMat); l3.position.set(-0.35,0.3,0.35);
                const l4 = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.6), legMat); l4.position.set(0.35,0.3,0.35);

                mesh.add(seat, back, l1, l2, l3, l4);
            }
            // --- BUCKET ---
            else if (data.type === 'bucket') {
                const metalMat = new THREE.MeshStandardMaterial({color: 0xaaaaaa, side: THREE.DoubleSide});
                
                // Body (Tapered Cylinder, Open ended)
                const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.6, 16, 1, true), metalMat);
                body.position.y = 0.3;
                
                // Bottom (Circle)
                const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), metalMat);
                bottom.rotation.x = -Math.PI/2;
                bottom.position.y = 0.01;

                // Water Surface
                const water = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), new THREE.MeshStandardMaterial({color: 0x22aaff, opacity:0.8, transparent:true}));
                water.rotation.x = -Math.PI/2;
                water.position.y = 0.5;

                // Handle
                const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 16, Math.PI), new THREE.MeshStandardMaterial({color: 0x333333}));
                handle.position.y = 0.6;

                mesh.add(body, bottom, water, handle);
            }

            // --- PICNIC BASKET ---
            else if (data.type === 'picnic_basket') {
                const wickerMat = new THREE.MeshStandardMaterial({color: 0xD2691E}); // Chocolate color
                const lidMat = new THREE.MeshStandardMaterial({color: 0xDEB887}); // Burlywood

                // Main Box
                const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), wickerMat);
                box.position.y = 0.25;

                // Lids (Left and Right flaps)
                const lid1 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.48), lidMat);
                lid1.position.set(-0.2, 0.5, 0);
                const lid2 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.48), lidMat);
                lid2.position.set(0.2, 0.5, 0);

                // Handle
                const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 16, Math.PI), wickerMat);
                handle.position.y = 0.5;

                mesh.add(box, lid1, lid2, handle);
            }

            // --- PICNIC BLANKET ---
            else if (data.type === 'picnic_blanket') {
                // Generate a Checkered Texture via Canvas
                const canvas = document.createElement('canvas');
                canvas.width = 64; canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,64,64); // White Base
                ctx.fillStyle = '#cc0000'; // Red Checks
                ctx.fillRect(0,0,32,32); ctx.fillRect(32,32,32,32);
                
                const tex = new THREE.CanvasTexture(canvas);
                tex.magFilter = THREE.NearestFilter;
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(4, 4); // Repeat 4 times for pattern

                const mat = new THREE.MeshStandardMaterial({map: tex, side: THREE.DoubleSide});
                
                // The Blanket Mesh (Very thin box so it doesn't z-fight with ground)
                const blanket = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.02, 3.0), mat);
                blanket.position.y = 0.02; // Just above ground
                
                mesh.add(blanket);
            }

            // --- PICNIC TABLE ---
            else if (data.type === 'picnic_table') {
                const woodMat = new THREE.MeshStandardMaterial({color: 0x8B4513}); // Saddle Brown

                // Table Top
                const top = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 1.2), woodMat);
                top.position.y = 1.0;

                // Seats
                const seatL = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.5), woodMat);
                seatL.position.set(0, 0.6, 1.0);
                const seatR = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.5), woodMat);
                seatR.position.set(0, 0.6, -1.0);

                // Legs/Supports (Simple thick blocks)
                const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.0, 2.4), woodMat);
                leg1.position.set(-0.8, 0.5, 0);
                const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.0, 2.4), woodMat);
                leg2.position.set(0.8, 0.5, 0);

                // Diagonal Braces (Visual detail)
                const brace1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 0.2), woodMat);
                brace1.position.set(-0.8, 0.5, 0); brace1.rotation.x = Math.PI/4;
                const brace2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 0.2), woodMat);
                brace2.position.set(0.8, 0.5, 0); brace2.rotation.x = -Math.PI/4;

                mesh.add(top, seatL, seatR, leg1, leg2, brace1, brace2);
            }
            // --- NEW: RADIO ---
            else if (data.type === 'radio') {
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.3), new THREE.MeshStandardMaterial({color:0x333333}));
                body.position.y = 0.25;
                
                const speakerL = new THREE.Mesh(new THREE.CircleGeometry(0.15), new THREE.MeshBasicMaterial({color:0x111111}));
                speakerL.position.set(-0.2, 0.25, 0.16);
                
                const speakerR = new THREE.Mesh(new THREE.CircleGeometry(0.15), new THREE.MeshBasicMaterial({color:0x111111}));
                speakerR.position.set(0.2, 0.25, 0.16);

                const handle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 4, 8, Math.PI), new THREE.MeshStandardMaterial({color:0x999999}));
                handle.position.set(0, 0.5, 0);

                mesh.add(body, speakerL, speakerR, handle);
            }
            // --- NEW: COOLER ---
            else if (data.type === 'cooler') {
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.5), new THREE.MeshStandardMaterial({color:0xcc0000})); // Red
                body.position.y = 0.3;
                
                const lid = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.15, 0.55), new THREE.MeshStandardMaterial({color:0xffffff})); // White
                lid.position.y = 0.65;
                
                mesh.add(body, lid);
            }

            mesh.position.set(data.x, data.y, data.z);
            
            // --- FIX: USE SAVED ROTATION ---
            // Default to 0 if data.rot is missing (for old props)
            mesh.rotation.y = data.rot !== undefined ? data.rot : 0;

            scene.add(mesh);
            activeProps[data.id] = mesh;
            
            if (typeof Sound !== 'undefined') Sound.playSpatial('footstep', mesh.position);
        }

        // --- MIDI PLAYBACK SYSTEM ---
        const MAX_MIDI_NOTES = 200000; 
        const MAX_NOTES_PER_SEC = 15; 

        window.handleMidiUpload = function(files) {
            if (files.length === 0) return;
            const file = files[0];

            // 1. SECURITY: File Size Check (Max 512KB)
            // Prevents "Zip Bombs" or massive files crashing the browser memory
            if (file.size > 512 * 1024) { 
                showToast("File too large! Max 512KB.");
                return;
            }

            // 2. SECURITY: Basic Extension Check
            const fileName = file.name.toLowerCase();
            if (!fileName.endsWith('.mid') && !fileName.endsWith('.midi')) {
                showToast("Invalid file type. Only .mid allowed.");
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const arrayBuffer = e.target.result;

                    // 3. SECURITY: Magic Number Validation (Deep Check)
                    // A real MIDI file MUST start with the hex bytes: 4D 54 68 64 ("MThd")
                    // If someone renames 'virus.exe' to 'song.mid', this check will catch it.
                    if (arrayBuffer.byteLength < 4) {
                        throw new Error("File too small.");
                    }
            
                    const view = new DataView(arrayBuffer);
                    if (view.getUint8(0) !== 0x4D || 
                        view.getUint8(1) !== 0x54 || 
                        view.getUint8(2) !== 0x68 || 
                        view.getUint8(3) !== 0x64) {
                
                        showToast("Security Block: Not a valid MIDI file.");
                        console.warn("Security Alert: User attempted to upload a non-MIDI file.");
                        return;
                    }

                    // 4. Safe Parsing
                    // If the structure is corrupted, Tone.js will throw an error, which we catch.
                    const midi = new Midi(arrayBuffer);
    
                    let totalNotes = 0;
                    midi.tracks.forEach(t => totalNotes += t.notes.length);
    
                    // 5. SECURITY: Complexity Limit
                    // Prevents files with millions of notes from freezing the game loop
                    if (totalNotes > MAX_MIDI_NOTES) {
                        showToast(`Too many notes! (${totalNotes}/${MAX_MIDI_NOTES})`);
                        return;
                    }

                    playMidi(midi);
                    document.getElementById('midi-status').innerText = "Playing: " + file.name.substring(0, 20);

                } catch (err) {
                    console.error("MIDI Parse Error:", err);
                    showToast("Invalid or Corrupted MIDI file.");
                }
            };
    
            // Read as ArrayBuffer allows us to check the raw bytes securely
            reader.readAsArrayBuffer(file);
        }

        function playMidi(midi) {
            stopMidi();
    
            
            let notes = [];
            midi.tracks.forEach(track => {
                track.notes.forEach(note => {
                    notes.push({
                        time: note.time,
                        freq: Math.pow(2, (note.midi - 69) / 12) * 440 
                    });
                });
            });
    
            
            notes.sort((a, b) => a.time - b.time);
    
            activeMidiNotes = notes;
            midiStartTime = audioCtx.currentTime;
    
            
            midiInterval = setInterval(updateMidiLoop, 20); 
        }

        function updateMidiLoop() {
            if (!isGuitarActive || activeMidiNotes.length === 0) return;
            const now = audioCtx.currentTime;
            const elapsedTime = now - midiStartTime;
            let sentCount = 0; 

            for (let i = activeMidiNotes.length - 1; i >= 0; i--) {
                const note = activeMidiNotes[i];
                if (note.time <= elapsedTime) {
                    Sound.playSpatial('guitar', player.position, note.freq);
            
                    if (sentCount < 2) { 
                        const msg = { 
                            type: 'sound', 
                            name: 'guitar', 
                            pos: {x:player.position.x, y:player.position.y, z:player.position.z}, 
                            var: note.freq 
                        };
        
                        if(isHost) broadcastToClients(msg);
                        else if (hostConn && hostConn.open) hostConn.send(msg);
                        else networkManager.send(msg);
        
                        sentCount++;
                    }
                    activeMidiNotes.splice(i, 1);
                }
            }
    
            if (activeMidiNotes.length === 0) {
                stopMidi();
                document.getElementById('midi-status').innerText = "Finished.";
            }
        }

        window.stopMidi = function() {
            if (midiInterval) clearInterval(midiInterval);
            activeMidiNotes = [];
            document.getElementById('midi-status').innerText = "Stopped.";
        }

        function buyAutoReelUpgrade(price) {
            if (saveState.money >= price) {
                saveState.money -= price;
                saveState.autoReelLevel++;
                saveGame();
                Sound.sell();
                renderBaitShop();
                showToast(`Upgraded Auto-Reel to Level ${saveState.autoReelLevel}!`);
            } else {
                showToast("Not enough money!");
            }
        }
        
        function buyHat(hat) {
            if(saveState.money >= hat.price) {
                saveState.money -= hat.price;
                saveState.unlockedHats.push(hat.id);
                Sound.sell();
                saveGame();
                renderShop();
            } else { showToast("Not enough money!"); }
        }
        
        function buyBait(bait) {
            if(saveState.money >= bait.price) {
                saveState.money -= bait.price;
                if(!saveState.baitInventory[bait.id]) saveState.baitInventory[bait.id] = 0;
                saveState.baitInventory[bait.id] += 10;
                Sound.sell();
                saveGame();
                renderBaitShop();
                updateBaitSelector();
            } else { showToast("Not enough money!"); }
        }
        
        function equipHat(hatId) {
            saveState.currentHat = hatId;
            saveGame();
            renderShop();
            updateLocalVisuals();
        }

        // Handles input from the mobile zoom slider.
        window.handleMobileZoom = function(value) {
            // The slider value is 0 to 1. We need to map it to MAX_ZOOM to MIN_ZOOM.
            // Since a lower slider value should mean more zoomed in (smaller cameraDistance), we reverse the mapping.
            const newDist = MAX_ZOOM - (value * (MAX_ZOOM - MIN_ZOOM));
            cameraDistance = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newDist));
        }

        function updateBaitSelector() {
            const sel = document.getElementById('bait-select');
            sel.innerHTML = '';
    
            let opt = document.createElement('option');
            opt.value = 'none'; opt.text = "None (Inf)";
            sel.appendChild(opt);
    
            Object.keys(saveState.baitInventory).forEach(bid => {
                const count = saveState.baitInventory[bid];
                // Keep option if count > 0 OR if it is the currently active bait.
                // This prevents the "mid-air switch" when using the last bait.
                if (count > 0 || bid === activeBaitId) {
                    const bType = BAIT_TYPES.find(b => b.id === bid);
                    if(bType) {
                        let o = document.createElement('option');
                        o.value = bid;
                        o.text = `${bType.name} (${count})`;
                        sel.appendChild(o);
                    }
                }
            });
            sel.value = activeBaitId;
    
            // Fallback: Only reset if the bait is truly invalid/missing.
            if(sel.value === "" && activeBaitId !== 'none') {
                activeBaitId = 'none';
                sel.value = 'none';
            }
        }

        function createPortalTexture() {
            const c = document.createElement('canvas'); c.width=128; c.height=128;
            const ctx = c.getContext('2d');

            const grd = ctx.createRadialGradient(64,64, 5, 64,64, 60);
            grd.addColorStop(0, 'black');
            grd.addColorStop(0.5, '#4b0082');
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grd;
            ctx.fillRect(0,0,128,128);

            ctx.strokeStyle = '#9400D3';
            ctx.lineWidth = 3;
            for(let i=0; i<6; i++) {
                ctx.beginPath();
                ctx.arc(64, 64, 10 + i*8, i, i + Math.PI);
                ctx.stroke();
            }
    
            const tex = new THREE.CanvasTexture(c);
            // --- FILTER FIX ---
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            // ------------------
    
            return tex;
        }

        function spawnPortal(x, z, fromNetwork = false) {
            if (voidPortalMesh) scene.remove(voidPortalMesh);

            const tex = createPortalTexture();
            const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
            voidPortalMesh = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat);
            voidPortalMesh.rotation.x = -Math.PI / 2;
            voidPortalMesh.position.set(x, 0.2, z);
            scene.add(voidPortalMesh);

            portalDespawnTime = Date.now() + 120000;

            showToast("🌌 A Void Portal has opened!");
            broadcastSound('magic', {x:x, y:0, z:z});

            // FIX: Send to Dedicated Server if connected
            if (!fromNetwork) {
                const msg = { type: 'spawnPortal', x: x, z: z };
        
                if (isHost) {
                    broadcastToClients(msg);
                } 
                else {
                    networkManager.send(msg);
                }
            }
        }
		
		function enterLavaWorld() {
			isInLavaWorld = true;
			isInVoid = false;

			// Teleport Player
			player.position.set(-20000 + 40, 2, 0); // Edge of lava island
			player.lookAt(-20000, 2, 0); // Look at lava lake
			playerVelocity.set(0,0,0);

			// Visuals
			scene.background = new THREE.Color(0x220000); // Dark Red Sky
			scene.fog = new THREE.Fog(0x220000, 10, 80);

			showToast("🔥 Welcome to the Lava World!");
			updateWeatherVisuals();
		}

		function exitLavaWorld() {
			isInLavaWorld = false;
			respawnPlayer(); // Returns to main island
		}

        function enterVoid() {
            if (isInVoid) return;
            isInVoid = true;
    
            // Save last position just in case, though Respawn will reset to default
            lastIslandPos.copy(player.position);

            // Teleport to Void
            player.position.set(10000, 2002, 10000);
            playerVelocity.y = 0;
    
            // Visuals
            scene.background = new THREE.Color(0x000000);
            scene.fog = new THREE.Fog(0x000000, 10, 50);

            if (!voidFloorMesh) {
                voidFloorMesh = new THREE.Mesh(
                    new THREE.CircleGeometry(40, 32),
                    new THREE.MeshBasicMaterial({ color: 0x111111 }) 
                );
                voidFloorMesh.rotation.x = -Math.PI / 2;
                voidFloorMesh.position.set(10000, 2000, 10000); 
                scene.add(voidFloorMesh);
            }
    
            showToast("Entered the Void.");
            updateWeatherVisuals();
        }

        window.respawnPlayer = function() {
            // Reset Void State
            isInVoid = false;
			isInLavaWorld = false;

            // Reset Visuals to Island
            scene.background = new THREE.Color(0x87CEEB);
            scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

            // Reset Player Physics & Position
            if (player) {
                player.position.set(25, 2, 0); // Default spawn point
                playerVelocity.set(0, 0, 0);
                knockbackVelocity.set(0, 0, 0);
            }

            // Set cooldown so we don't instantly teleport back if a portal is nearby
            portalCooldown = Date.now() + 5000;

            // Close Options Menu
            toggleOptions();
            showToast("Respawned!");
            updateWeatherVisuals();
        }

        window.exitVoid = function() {
            if (!isInVoid) return;
            isInVoid = false;

            player.position.copy(lastIslandPos);
            player.position.y = 0.5;
            playerVelocity.y = 0;

            portalCooldown = Date.now() + 3000; 

            scene.background = new THREE.Color(0x87CEEB);
            scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

            document.getElementById('btn-void-respawn').style.display = 'none';
        }

        async function promptAdminLogin() {
          const pw = prompt("Enter admin password (obfuscated login).");
          if (!pw) return;
          
          const ok = await networkManager.adminLogin(pw);
          
          if (ok) {
              alert("Admin login successful.");
              
              // Show the Host Panel Shield
              document.getElementById('btn-host-panel').style.display = 'block'; 
              
              // HIDE the Admin Login Button
              document.getElementById('btn-admin-login').style.display = 'none'; 
              
              updateHostPanel(); 
          }
          else {
              alert("Admin login failed.");
          }
        }


                // New function to handle unbanning
        function promptUnbanIP() {
            if (!networkManager.isConnected || !isAdminOnDedicated) return;
            const ip = prompt("Enter IP address to unban:");
            if (ip) {
                networkManager.send({
                    type: 'admin_cmd',
                    cmd: 'unban',
                    ip: ip.trim()
                });
            }
        }
		
		function togglePlayerList() {
            const ui = document.getElementById('player-list-overlay');
            ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
            if(ui.style.display === 'flex') renderPlayerList();
        }

        function renderPlayerList() {
            const container = document.getElementById('public-player-list');
            container.innerHTML = '';

            // 1. Add Self (Information only)
            const myRow = document.createElement('div');
            myRow.style.background = 'rgba(255, 255, 255, 0.1)';
            myRow.style.padding = '10px'; myRow.style.borderRadius = '8px';
            myRow.style.color = '#44ff44'; myRow.style.fontWeight = 'bold';
            myRow.innerText = `${saveState.displayName} (You)`;
            container.appendChild(myRow);

            // 2. Add Other Players
            Object.keys(otherPlayers).forEach(pid => {
                const p = otherPlayers[pid];
                const row = document.createElement('div');
                row.style.background = 'rgba(255, 255, 255, 0.05)';
                row.style.padding = '10px';
                row.style.borderRadius = '8px';
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';

                // Name
                const name = document.createElement('div');
                name.innerText = p.lastData.name || "Unknown";
                name.style.fontWeight = 'bold';

                // Buttons Container
                const actions = document.createElement('div');
                actions.style.display = 'flex'; actions.style.gap = '5px';

                // Voice Mute Button
                const isVoiceMuted = localMutedVoice.includes(pid);
                const btnVoice = document.createElement('button');
                btnVoice.className = 'btn-sm';
                btnVoice.style.backgroundColor = isVoiceMuted ? '#cc0000' : '#444';
                btnVoice.innerText = isVoiceMuted ? "🔇 Voice" : "🎙️ Voice";
                btnVoice.onclick = () => toggleLocalMute(pid, 'voice');

                // Chat Mute Button
                const isChatMuted = localMutedChat.includes(pid);
                const btnChat = document.createElement('button');
                btnChat.className = 'btn-sm';
                btnChat.style.backgroundColor = isChatMuted ? '#cc0000' : '#444';
                btnChat.innerText = isChatMuted ? "🚫 Chat" : "💬 Chat";
                btnChat.onclick = () => toggleLocalMute(pid, 'chat');
				
				const isMidiMuted = localMutedMidi.includes(pid);
                const btnMidi = document.createElement('button');
                btnMidi.className = 'btn-sm';
                btnMidi.style.backgroundColor = isMidiMuted ? '#cc0000' : '#444';
                btnMidi.innerText = isMidiMuted ? "🔇 MIDI" : "🎸 MIDI";
                btnMidi.onclick = () => toggleLocalMute(pid, 'midi');
                // ----------------------------------

                actions.appendChild(btnVoice);
                actions.appendChild(btnChat);
				actions.appendChild(btnMidi);

                row.appendChild(name);
                row.appendChild(actions);
                container.appendChild(row);
            });

            if (Object.keys(otherPlayers).length === 0) {
                const empty = document.createElement('div');
                empty.innerText = "No other fishers here.";
                empty.style.color = '#888'; empty.style.fontStyle = 'italic';
                container.appendChild(empty);
            }
        }

        function toggleLocalMute(pid, type) {
            if (type === 'voice') {
                if (localMutedVoice.includes(pid)) localMutedVoice = localMutedVoice.filter(id => id !== pid);
                else localMutedVoice.push(pid);
            } else if (type === 'chat') {
                if (localMutedChat.includes(pid)) localMutedChat = localMutedChat.filter(id => id !== pid);
                else localMutedChat.push(pid);
            } 
            // --- ADD THIS ---
            else if (type === 'midi') {
                if (localMutedMidi.includes(pid)) localMutedMidi = localMutedMidi.filter(id => id !== pid);
                else localMutedMidi.push(pid);
            }
            // ----------------
            renderPlayerList(); 
        }

        // Updated Host Panel
        function updateHostPanel() {
            const container = document.getElementById('host-player-list');
            container.innerHTML = '';
    
            if (isHost || isAdminOnDedicated) {
                const adminDiv = document.createElement('div');
                adminDiv.style.marginBottom = '15px';
                adminDiv.style.paddingBottom = '10px';
                adminDiv.style.borderBottom = '1px solid #444';
                adminDiv.style.textAlign = 'center';

                const btnMoney = document.createElement('button');
                btnMoney.className = 'btn-lg btn-green';
                btnMoney.innerText = "💰 Give Self $1000";
                btnMoney.style.fontSize = "14px";
                btnMoney.style.width = "100%";
                btnMoney.onclick = () => {
                    saveState.money += 1000;
                    saveGame();
                    Sound.sell();
                    updateUI();
                    showToast("Admin Abuse: +$1000");
                };
                adminDiv.appendChild(btnMoney);

                const btnPortal = document.createElement('button');
                btnPortal.className = 'btn-lg';
                btnPortal.style.background = '#4b0082';
                btnPortal.style.marginTop = '5px';
                btnPortal.innerText = "🌀 Spawn Portal";
                btnPortal.onclick = () => {
                    // Check network mode
                    if (networkManager.isConnected && isAdminOnDedicated) {
                         networkManager.send({ type: 'admin_cmd', cmd: 'spawnPortal' });
                    } else {
                         const x = player.position.x + 5;
                         const z = player.position.z;
                         spawnPortal(x, z);
                    }
                };
                adminDiv.appendChild(btnPortal);

                // --- NEW UNBAN BUTTON ---
                if (isConnectedToDedicated && isAdminOnDedicated) {
                    const btnUnban = document.createElement('button');
                    btnUnban.className = 'btn-lg';
                    btnUnban.style.background = '#006400';
                    btnUnban.style.marginTop = '5px';
                    btnUnban.innerText = "🔓 Unban IP";
                    btnUnban.onclick = promptUnbanIP;
                    adminDiv.appendChild(btnUnban);
                }
                // ------------------------

                container.appendChild(adminDiv);
            }
    
            // ... (rest of the player list loop remains the same) ...
            Object.keys(otherPlayers).forEach(pid => {
                // ... existing row creation code ...
                const p = otherPlayers[pid];
                const row = document.createElement('div');
                row.className = 'host-player-row';
                const name = document.createElement('div');
                name.className = 'host-player-name';
                name.innerText = p.lastData.name || "Unknown";
        
                const actions = document.createElement('div');
                actions.className = 'host-actions';
        
                const btnGhost = document.createElement('button');
                btnGhost.className = 'btn-sm';
                btnGhost.style.background = '#4b0082';
                btnGhost.innerText = "👻 Haunt";
                btnGhost.onclick = () => triggerHaunt(pid);
        
                const isVM = mutedVoicePeers.includes(pid);
                const btnVoice = document.createElement('button');
                btnVoice.className = isVM ? 'btn-sm btn-danger' : 'btn-sm';
                btnVoice.innerText = isVM ? "🔇 No Voice" : "🎙️ Mute Voice";
                btnVoice.onclick = () => toggleGlobalMute(pid, 'voice');
        
                const isCM = mutedChatPeers.includes(pid);
                const btnChat = document.createElement('button');
                btnChat.className = isCM ? 'btn-sm btn-danger' : 'btn-sm';
                btnChat.innerText = isCM ? "🚫 No Chat" : "💬 Mute Chat";
                btnChat.onclick = () => toggleGlobalMute(pid, 'chat');
				
				const isGlobalMidiMuted = p.lastData && p.lastData.isMidiMuted;
                
                const btnMidi = document.createElement('button');
                btnMidi.className = isGlobalMidiMuted ? 'btn-sm btn-danger' : 'btn-sm';
                btnMidi.innerText = isGlobalMidiMuted ? "🔇 No MIDI" : "🎸 Mute MIDI";
                btnMidi.onclick = () => toggleGlobalMute(pid, 'midi');
        
                const btnKick = document.createElement('button');
                btnKick.className = 'btn-sm btn-warn';
                btnKick.innerText = "👢 Kick";
                btnKick.onclick = () => kickPeer(pid);
        
                const btnBan = document.createElement('button');
                btnBan.className = 'btn-sm btn-danger';
                btnBan.innerText = "🔨 Ban";
                btnBan.onclick = () => banPeer(pid);
        
                actions.appendChild(btnGhost);
                actions.appendChild(btnVoice);
                actions.appendChild(btnChat);
				actions.appendChild(btnMidi);
                actions.appendChild(btnKick);
                actions.appendChild(btnBan);
				
        
                row.appendChild(name);
                row.appendChild(actions);
                container.appendChild(row);
            });
        }
        
        function kickPeer(pid) {
            // 1. Dedicated Server Logic
            if (networkManager.isConnected && isAdminOnDedicated) {
                networkManager.send({ 
                    type: 'admin_cmd', 
                    cmd: 'kick', 
                    targetId: pid 
                });
                showToast(`Kicking ${pid}...`);
                return;
            }

            // 2. PeerJS (P2P) Host Logic
            const conn = clientConns[pid];
            if(conn) {
                conn.send({ type: 'error', message: "You have been kicked by the host." });
                setTimeout(() => {
                    conn.close();
                    removePlayer(pid);
                    broadcastPlayerList();
                    updateHostPanel();
                }, 500);
            }
        }
        
        function banPeer(pid) {
            // 1. Dedicated Server Logic
            if (networkManager.isConnected && isAdminOnDedicated) {
                networkManager.send({ 
                    type: 'admin_cmd', 
                    cmd: 'ban', 
                    targetId: pid 
                });
                showToast(`Banning ${pid}...`);
                return;
            }
    
            // 2. PeerJS (P2P) Host Logic
            if(!bannedPeers.includes(pid)) bannedPeers.push(pid);
			
			broadcastToClients({ type: 'purge_chat', targetId: pid });
    
            const conn = clientConns[pid];
            if(conn) {
                if (conn.deviceID) {
                    const list = JSON.parse(sessionStorage.getItem('banned_ids') || '[]');
                    if (!list.includes(conn.deviceID)) {
                        list.push(conn.deviceID);
                        sessionStorage.setItem('banned_ids', JSON.stringify(list));
                    }
                }

                conn.send({ type: 'error', message: "You have been banned from this room." });
                setTimeout(() => {
                    conn.close();
                    removePlayer(pid);
                    broadcastPlayerList();
                    updateHostPanel();
                }, 500);
            }
        }
        
        function toggleGlobalMute(pid, type) {
            // 1. DEDICATED SERVER ADMIN LOGIC
            if (networkManager.isConnected && isAdminOnDedicated) {
                
                // Map 'midi' type to 'mute_midi' command
                let cmd = 'mute_chat';
                if (type === 'voice') cmd = 'mute_voice';
                if (type === 'midi') cmd = 'mute_midi'; // <--- ADD THIS

                networkManager.send({ 
                    type: 'admin_cmd', 
                    cmd: cmd, 
                    targetId: pid 
                });
                showToast(`Sent ${type} mute command for ${pid}`);
                return;
            }

            // 2. P2P HOST LOGIC
            if (!isHost) return;

            if (type === 'voice') {
                if (mutedVoicePeers.includes(pid)) mutedVoicePeers = mutedVoicePeers.filter(id => id !== pid);
                else mutedVoicePeers.push(pid);
            } else {
                if (mutedChatPeers.includes(pid)) mutedChatPeers = mutedChatPeers.filter(id => id !== pid);
                else mutedChatPeers.push(pid);
            }

            // Refresh UI and Notify Players
            updateHostPanel();
            broadcastPlayerList(); // Critical: Tells everyone else this person is muted
            showToast(`${type.toUpperCase()} Mute toggled.`);
        }

        // --- UI & INVENTORY UPDATES ---
        function updateUI() {
            const mEl = document.getElementById('money-display');
            if(mEl) mEl.innerText = `$${saveState.money}`;

            const totalFish = saveState.inventory.length;
            const logHeader = document.querySelector('#fish-log b');
            if(logHeader) logHeader.innerText = `Inventory (${totalFish}):`;

            const lEl = document.getElementById('log-content');
            if(lEl) {
                if (totalFish === 0) {
                    lEl.innerHTML = "Empty.";
                } else {
                    lEl.innerHTML = "";
                    
                    // Reverse loop to show newest first
                    for(let i = saveState.inventory.length - 1; i >= 0; i--) {
                        const f = saveState.inventory[i];
                        const div = document.createElement('div');
                
                        let label = f.name;
                        if (f.tierId !== 'normal') label += ` (${f.tierName})`;
                        if (f.sizeLabel && f.sizeLabel !== 'Normal') label += ` [${f.sizeLabel}]`;
                
                        div.innerText = label;
                        div.style.fontSize = "11px";
                        div.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
                        lEl.appendChild(div);
                    }
                }
            }
        }

        function sellFish() {
            if(saveState.inventory.length === 0) { showToast("No fish to sell!"); return; }
            
            // --- SERVER AUTHORITY CHECK ---
            if (networkManager.isConnected) {
                networkManager.send({ type: 'sell_fish_request' });
                // We don't update local state yet. We wait for the server response.
                showToast("Contacting merchant...");
                return;
            }
            // -----------------------------

            let totalVal = 0;
            saveState.inventory.forEach(f => totalVal += f.price);
            const count = saveState.inventory.length;
            saveState.money += totalVal;
            saveState.inventory = [];
            saveGame();
            Sound.sell();
            showToast(`Sold ${count} fish for $${totalVal}!`);
            if(npcMerchant) {
                const s = npcMerchant.getObjectByName("playerSprite");
                if(s) { s.scale.set(1.2, 1.2, 1.2); setTimeout(() => { s.scale.set(1,1,1); }, 200); }
            }
        }

        function playSnagSound() {
            try {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain); gain.connect(audioCtx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
                osc.start(); osc.stop(audioCtx.currentTime + 0.3);
            } catch(e) {}
        }

        window.copyRoomId = function() {
            if(!currentRoomId) return;
            
            
            if(navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(currentRoomId)
                    .then(() => showToast("Room ID Copied!"))
                    .catch(err => {
                        console.error("Clipboard API failed, trying fallback...", err);
                        copyFallback(currentRoomId);
                    });
            } else {
                
                copyFallback(currentRoomId);
            }
        }

        function copyFallback(text) {
            try {
                const textArea = document.createElement("textarea");
                textArea.value = text;
                
                
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                textArea.style.top = "0";
                
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                
                if (successful) showToast("Room ID Copied!");
                else showToast("Failed to copy ID.");
            } catch (err) {
                console.error("Fallback copy failed", err);
                showToast("Copy failed. Please select text manually.");
            }
        }

        function checkMobile() {
            if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                isMobile = true;
                
                
                document.getElementById('mobile-controls').style.display = 'block';
                
                document.getElementById('instructions').style.display = 'none'; 
                
                
                const baitUI = document.getElementById('bait-ui');
                baitUI.style.bottom = '10px';
                baitUI.style.left = '50%';
                baitUI.style.transform = 'translateX(-50%)';
                

                document.getElementById('chat-toggle-mobile').onclick = () => {
                    const ui = document.getElementById('chat-ui');
                    ui.style.display = ui.style.display === 'none' ? 'flex' : 'none';
                    if(ui.style.display === 'flex') document.getElementById('chat-input').focus();
                };
                document.getElementById('mic-toggle-mobile').onclick = toggleMic;
                
                checkOrientation();
                window.addEventListener('resize', checkOrientation);
            }
        }

        function checkOrientation() {
            const overlay = document.getElementById('rotate-overlay');
            if (!overlay) return;

            // Check if height is greater than width (Portrait Mode)
            if (window.innerHeight > window.innerWidth) {
                overlay.style.display = 'flex';
            } else {
                overlay.style.display = 'none';
            }
        }

       async function initAudio(deviceId = null) {
            try {
                // ADDED NOISE SUPPRESSION AND AUTO GAIN CONTROL in the constraints
                const constraints = { 
                    audio: deviceId 
                        ? { deviceId: { exact: deviceId }, noiseSuppression: true, autoGainControl: true } 
                        : { noiseSuppression: true, autoGainControl: true }, 
                    video: false 
                };
                
                if (localStream) {
                    localStream.getTracks().forEach(track => track.stop());
                }
                localStream = await navigator.mediaDevices.getUserMedia(constraints);
                
                // --- FIX START: FORCE MUTE STATE IMMEDIATELY ---
                // Browsers open the mic as "enabled" by default. We must
                // sync this with our isMicMuted variable immediately.
                if (isMicMuted) {
                    localStream.getAudioTracks().forEach(track => track.enabled = false);
                }
                // --- FIX END -----------------------------------

                // --- PROCESSING STEP ---
                const rawAudioTrack = localStream.getAudioTracks()[0];

                // Determine the audio track to use for broadcasting: processed or raw
                let processedAudioTrack = rawAudioTrack;
                if (typeof applyNoiseFilters === 'function') {
                    // Apply Web Audio filters to create a new processed stream's track
                    processedAudioTrack = applyNoiseFilters(localStream); 
                }
                
                // --- END PROCESSING STEP ---

                // The processed track is what should be sent via WebRTC
                processedAudioTrack.enabled = !isMicMuted;
                setupVoiceAnalysis(localStream, 'local'); 
                
                // Use the processed track for existing connections
                Object.values(voiceConnections).forEach(call => {
                     const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'audio');
                     if (sender) sender.replaceTrack(processedAudioTrack); // Send the NEW processed track
                });
                
                // Note: PeerJS uses the track currently inside localStream for new calls.
                // Since PeerJS is simplified here, replacing tracks on existing connections is the primary method.

                updateMicUI();
                console.log("Microphone initialized with Web Audio filters.");
            } catch (err) {
                console.error("Mic Access Failed", err);
                showToast("Mic Error or Denied");
            }
        }
		
		function applyNoiseFilters(stream) {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            
            const source = audioCtx.createMediaStreamSource(stream);
            const destination = audioCtx.createMediaStreamDestination();

            // 1. HIGH-PASS FILTER: Removes low-frequency rumble (below 100Hz)
            const highpass = audioCtx.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.frequency.value = 100;

            // 2. LOW-PASS FILTER: Attenuates sharp, high-frequency clicks (above 8000Hz)
            const lowpass = audioCtx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = 8000;

            // Chain the nodes: Source -> HighPass -> LowPass -> Destination
            source.connect(highpass);
            highpass.connect(lowpass);
            lowpass.connect(destination);

            // Return the processed stream's audio track
            return destination.stream.getAudioTracks()[0]; 
        }
        
        async function populateAudioInputs() {
            const select = document.getElementById('mic-select');
            select.innerHTML = '';
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices.filter(device => device.kind === 'audioinput');
                
                audioInputs.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.text = device.label || `Microphone ${select.length + 1}`;
                    select.appendChild(option);
                });

                // Select the previously saved microphone.
                if (saveState.micId) {
                    // Check if the saved mic still exists in the list
                    const exists = audioInputs.some(d => d.deviceId === saveState.micId);
                    if (exists) {
                        select.value = saveState.micId;
                    } else if (audioInputs.length > 0) {
                        // Fallback if saved mic is unplugged
                        select.value = audioInputs[0].deviceId;
                    }
                }

            } catch(e) { console.error("Error listing devices", e); }
        }
        
        window.changeAudioInput = function(deviceId) {
            saveState.micId = deviceId;
            saveGame(); 
            initAudio(deviceId);
        }

        function setupVoiceAnalysis(stream, id) {
            if(audioCtx.state === 'suspended') audioCtx.resume();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            voiceAnalysers[id] = analyser;
        }

        function toggleMic() {
            if (!localStream) return;
            isMicMuted = !isMicMuted;
            localStream.getAudioTracks().forEach(track => track.enabled = !isMicMuted);
            updateMicUI();
        }

        function updateMicUI() {
            const el = document.getElementById('mic-status');
            const mobEl = document.getElementById('mic-toggle-mobile');
            const txt = isMicMuted ? '🔇' : '🎤';
            const col = isMicMuted ? '#ff4444' : '#44ff44';
            if (localStream) {
                if(el) { el.innerText = txt; el.style.color = col; }
                if(mobEl) { mobEl.innerText = txt; mobEl.style.color = col; }
            } else {
                if(el) { el.innerText = '🚫'; el.style.color = '#888'; }
                if(mobEl) { mobEl.innerText = '🚫'; mobEl.style.color = '#888'; }
            }
        }

        function connectToPeerAudio(remoteId) {
            if (voiceConnections[remoteId]) return; 
            if (!localStream) return;
            const call = peer.call(remoteId, localStream);
            handleCall(call);
        }
		
		 /**
		 * STRICT SECURITY FIX: Validates image URLs to prevent XSS.
		 * 1. Forces HTTP/HTTPS protocols (blocks javascript:).
		 * 2. Uses URL constructor to parse valid URIs.
		 * 3. Escapes the final output if not an image.
		 */
		function embedImageIfValid(text) {
			if (!text || typeof text !== 'string') return text;

			try {
				// 1. Attempt to parse as a valid URL
				const url = new URL(text);

				// 2. PROTOCOL WHITELIST: Only allow http and https
				// This blocks 'javascript:', 'data:', 'vbscript:', etc.
				if (url.protocol !== 'http:' && url.protocol !== 'https:') {
					return escapeHTML(text);
				}

				// 3. Extension Check
				const imgPattern = /\.(jpeg|jpg|png|gif|webp)$/i;
				if (url.pathname.match(imgPattern)) {
					// 4. Return safe HTML
					const safeURL = url.href; 
					return `<img src="${safeURL}" style="max-width:95%; max-height:200px; display:block; margin:5px auto; border-radius:8px; pointer-events:auto;" loading="lazy" alt="User Image">`;
				}
			} catch (e) {
				// Not a valid URL, treat as standard text
			}

			// Fallback: Return standard escaped text
			return escapeHTML(text);
		}

        function handleCall(call) {
            const remoteId = call.peer;
            voiceConnections[remoteId] = call;
            call.on('stream', (remoteStream) => {
                let audio = document.getElementById(`audio-${remoteId}`);
                if (!audio) {
                    audio = document.createElement('audio');
                    audio.id = `audio-${remoteId}`;
                    document.body.appendChild(audio);
                }
                audio.srcObject = remoteStream;
                audio.autoplay = true;
                audio.play().catch(e => {});
                setupVoiceAnalysis(remoteStream, remoteId);
            });
            call.on('close', () => {
                const el = document.getElementById(`audio-${remoteId}`);
                if(el) el.remove();
                delete voiceConnections[remoteId];
                delete voiceAnalysers[remoteId];
            });
            call.on('error', (err) => {
                console.error("Call error:", err);
                delete voiceConnections[remoteId];
            });
        }
		
		function voiceWatchdog() {
			if (!isConnectedToDedicated) return;

			// 1. WAKE UP AUDIO ENGINE (Fixes silent audio after time)
			if (audioCtx && audioCtx.state === 'suspended') {
				console.log("[Watchdog] Resuming suspended AudioContext...");
				audioCtx.resume();
			}

			// 2. CHECK SIGNALING CONNECTION
			if (peer && peer.disconnected && !peer.destroyed) {
				console.log("[Watchdog] Peer disconnected. Reconnecting...");
				peer.reconnect();
				return; // Wait for reconnect before checking calls
			}

			// 3. CLEAN DEAD CONNECTIONS
			Object.keys(voiceConnections).forEach(peerId => {
				const call = voiceConnections[peerId];
				if (call && call.peerConnection) {
					const state = call.peerConnection.iceConnectionState;
					// Also check for 'closed' signaling state
					if (state === 'failed' || state === 'closed' || state === 'disconnected') {
						console.log(`[Watchdog] Cleaning dead connection: ${peerId} (State: ${state})`);
						try { call.close(); } catch(e){}
						delete voiceConnections[peerId];
						
						const playerEntry = Object.values(otherPlayers).find(p => p.voiceId === peerId);
						if(playerEntry) playerEntry.voiceId = null; 
					}
				}
			});

			// 4. RETRY MISSING CONNECTIONS
			Object.keys(otherPlayers).forEach(id => {
				const p = otherPlayers[id];
				// Ensure we don't try to call ourselves
				if (p.savedPeerId && p.savedPeerId !== myPeerId) {
					if (!voiceConnections[p.savedPeerId]) {
						console.log(`[Watchdog] Repairing voice to ${p.lastData.name}...`);
						connectToPeerAudio(p.savedPeerId);
						p.voiceId = p.savedPeerId;
					}
				}
			});
		}

		// Start the watchdog
		setInterval(voiceWatchdog, 2000);

        function updateVoiceVisuals() {
            const dataArray = new Uint8Array(32);
            
            // 1. Local Player
            if(voiceAnalysers['local'] && !isMicMuted && player) {
                voiceAnalysers['local'].getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a,b)=>a+b,0) / dataArray.length;
                const icon = player.getObjectByName('talkingIcon');
                if(icon) icon.visible = avg > 10; 
            } else if (player) {
                const icon = player.getObjectByName('talkingIcon');
                if(icon) icon.visible = false;
            }
            
            // 2. Remote Players
            Object.keys(otherPlayers).forEach(pid => {
                const p = otherPlayers[pid];
                const analyserId = p.voiceId || pid;
                
                // CHECK MUTE STATUS
                const isGloballyMuted = p.lastData && p.lastData.isVoiceMuted;
                const isLocallyMuted = localMutedVoice.includes(pid);
                const isMuted = isGloballyMuted || isLocallyMuted;

                let audioEl = document.getElementById(`audio-${analyserId}`);

                if (isMuted) {
                    // --- FIX: HARD MUTE ---
                    // Setting .muted = true cuts audio instantly, even if stream is active
                    if (audioEl) audioEl.muted = true; 
                    
                    const icon = p.mesh.getObjectByName('talkingIcon');
                    if(icon) icon.visible = false;
                } 
                else if (voiceAnalysers[analyserId]) {
                    // --- UNMUTE IF CLEAN ---
                    if (audioEl) audioEl.muted = false;

                    voiceAnalysers[analyserId].getByteFrequencyData(dataArray);
                    const avg = dataArray.reduce((a,b)=>a+b,0) / dataArray.length;
                    const icon = p.mesh.getObjectByName('talkingIcon');
                    if(icon) icon.visible = avg > 10;
                    
                    if (audioEl) {
                        const dist = player.position.distanceTo(p.mesh.position);
                        if (dist > MAX_VOICE_DISTANCE) {
                            audioEl.volume = 0;
                        } else {
                            let vol = 1 - (dist / MAX_VOICE_DISTANCE);
                            vol = vol * saveState.voiceVolume; 
                            audioEl.volume = Math.max(0, Math.min(1, vol));
                        }
                    }
                } else {
                    const icon = p.mesh.getObjectByName('talkingIcon');
                    if(icon) icon.visible = false;
                }
            });
        }

        // --- GAME INITIALIZATION & LOBBY ---
        // --- GAME INITIALIZATION & LOBBY ---
        window.onload = function() {
            loadSave();
            checkMobile();
            document.getElementById('loading').style.display = 'none';
            document.getElementById('lobby-screen').style.display = 'flex';
            
            setupThreeJS();
            setupInputs();
            animate();
            initAudio();

            document.getElementById('btn-host').onclick = hostGame;
            document.getElementById('btn-join').onclick = joinGame;
            
            const btnAdmin = document.getElementById('btn-admin-login');
            if(btnAdmin) btnAdmin.onclick = promptAdminLogin;

            // --- NEW CODE: FETCH PLAYER COUNT ---
            refreshServerCount(); // Run once immediately
            setInterval(refreshServerCount, 10000); // Update every 10 seconds
            // ------------------------------------

            setInterval(() => {
                if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
                    dedicatedSocket.send(JSON.stringify({ 
                        type: 'setName', 
                        name: saveState.displayName, 
                        peerId: myPeerId 
                    }));
                }
            }, 3000);
        };

        function generateRoomId() { return 'fish-' + Math.floor(1000 + Math.random() * 9000); }
        function hostGame() {
            saveGame();
            const roomId = generateRoomId();
            document.getElementById('lobby-status').innerText = "Creating Room...";
    
            
            sessionStorage.removeItem('banned_ids');

            peer = new Peer(roomId);
            peer.on('open', (id) => {
                isHost = true; myPeerId = id; currentRoomId = id;
        
                document.getElementById('room-info-ui').style.display = 'block';
                document.getElementById('room-id-text').innerText = id;
                document.getElementById('start-options').style.display = 'none';
                document.getElementById('host-room-info').style.display = 'block';
                document.getElementById('room-id-display').innerText = id;
                document.getElementById('lobby-screen').style.display = 'none';
        
                document.getElementById('btn-host-panel').style.display = 'block';
        
                generateWorld(roomId); 
                startGame();
            });
    
            peer.on('connection', (conn) => {
                // Check if incoming peer is on the ban list for this session.
                const bannedList = JSON.parse(sessionStorage.getItem('banned_ids') || '[]');
                const incomingDeviceID = conn.metadata ? conn.metadata.deviceID : null;

                if ((incomingDeviceID && bannedList.includes(incomingDeviceID)) || bannedPeers.includes(conn.peer)) {
                    conn.on('open', () => {
                        conn.send({ type: 'error', message: "You are BANNED." });
                        setTimeout(() => conn.close(), 500);
                    });
                    return;
                }

                // Handle "zombie" connections if a player reconnects without the old connection closing properly.
                // If this player is already in the list, it means their old connection died ungracefully.
                if (clientConns[conn.peer]) {
                    console.log(`♻️ Replacing stale connection for ${conn.peer}`);
                    try {
                        clientConns[conn.peer].close();
                    } catch(e) { console.warn("Could not close old conn", e); }
            
                    // Remove the old player entity so we can make a fresh one
                    removePlayer(conn.peer); 
                }

                // Setup new connection handlers.
                conn.on('data', (data) => handleDataFromClient(conn.peer, data));
                conn.on('close', () => { 
                    // Only remove if this is still the active connection (handles race conditions)
                    if (clientConns[conn.peer] === conn) {
                        removePlayer(conn.peer);  
                        broadcastPlayerList(); 
                        updateHostPanel(); 
                    }
                });

                conn.deviceID = incomingDeviceID;
                clientConns[conn.peer] = conn;
        
                // Force an immediate update so they don't load into a void
                broadcastPlayerList();
                updateHostPanel();
                showToast("Player Joined!");
            });
    
            peer.on('call', (call) => {
                if(localStream) call.answer(localStream); else call.answer(); 
                handleCall(call);
            });
            peer.on('error', (err) => document.getElementById('lobby-status').innerText = "Error: ID taken or Net issue. Try again.");
        }
        
        function joinGame() {
			if (audioCtx.state === 'suspended') audioCtx.resume();
            saveGame();
            const roomToJoin = document.getElementById('room-id-input').value.trim();
            if(!roomToJoin) return;
            document.getElementById('lobby-status').innerText = "Connecting...";
            // --- FIND THIS INSIDE connectToDedicatedServer ---
			if (!peer || peer.destroyed) {
				// 1. HARDENED CONFIGURATION
				const peerConfig = {
					debug: 1,
					config: {
						iceServers: [
							{ urls: 'stun:stun.l.google.com:19302' },
							{ urls: 'stun:global.stun.twilio.com:3478' }
						]
					}
				};

				peer = new Peer(undefined, peerConfig); 

				// 2. SIGNALING KEEPALIVE HANDLERS
				peer.on('open', (id) => {
					console.log("My Peer ID is: " + id);
					myPeerId = id;
					if (dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
						dedicatedSocket.send(JSON.stringify({ type: 'setName', name: saveState.displayName, peerId: myPeerId }));
					}
				});

				// CRITICAL: Auto-reconnect to signaling server if dropped
				peer.on('disconnected', () => {
					console.log("PeerJS signaling disconnected. Attempting reconnect...");
					peer.reconnect();
				});

				peer.on('error', (err) => {
					console.error("PeerJS Error:", err);
					// If fatal error, try to destroy and recreate after delay
					if (err.type === 'peer-unavailable' || err.type === 'network') {
						setTimeout(() => peer.reconnect(), 5000);
					}
				});

				peer.on('call', (call) => {
					if(localStream) call.answer(localStream); else call.answer();
					handleCall(call);
				});
			}
        }

                // --- Dedicated Server (WebSocket) client integration ---
        // Put this near other networking (after joinGame / hostGame functions)

        // let dedicatedSocket = null; // MOVED
        // let dedicatedId = null; // MOVED
        // let isConnectedToDedicated = false; // MOVED
        let isAdminOnDedicated = false;

        // async function sha256HexBrowser(str) ... MOVED

        function connectToDedicatedServer(customUrl = null) {
			if (audioCtx.state === 'suspended') audioCtx.resume();
            
            // 1. Initialize PeerJS (via Manager)
            peer = networkManager.initPeer();
            
            // Wiring up peer events that are still in main.js
            // (We attach this listener only once ideally, but here we ensure it exists)
            // Note: peer.on('call') might duplicate if we aren't careful, 
            // but PeerJS usually handles one listener per event type gracefully or we check.
            if (peer.listenerCount && peer.listenerCount('call') === 0) {
                 peer.on('call', (call) => {
					if(localStream) call.answer(localStream); else call.answer();
					handleCall(call);
				});
            } else if (!peer.listenerCount) {
                // Fallback if listenerCount isn't available (old peerjs versions)
                // Just remove and re-add to be safe
                peer.off('call'); 
                peer.on('call', (call) => {
					if(localStream) call.answer(localStream); else call.answer();
					handleCall(call);
				});
            }

            // 2. Setup Network Manager Callbacks
            networkManager.onConnect = () => {
				// isConnectedToDedicated = true; // Use networkManager.isConnected
				document.getElementById('lobby-status').innerText = "Connected!";
                
                // UI Setup
				currentRoomId = 'official-server';
				document.getElementById('room-info-ui').style.display = 'block';
				
				const label = (customUrl && typeof customUrl === 'string') ? 'Community' : 'Official';
				document.getElementById('room-id-text').innerText = label;
				
				document.getElementById('lobby-screen').style.display = 'none';
				isHost = false;

				generateWorld('official'); 
				startGame();
				showToast("Connected to Server!");
            };

            networkManager.onDisconnect = () => {
				// isConnectedToDedicated = false;
				alert("Disconnected from Server.");
				location.reload(); 
            };

            networkManager.onMessage = (msg) => {
                // handleDataFromDedicated(msg);
                // INLINE HANDLER LOGIC FROM BEFORE
				
				// 1. Initial Handshake
				if (msg.type === 'welcome') {
					// dedicatedId = msg.id; // We don't really use this much globally except for self-checks
                    window.dedicatedId = msg.id; // quick hack for global access if needed
				} 
				
				// 2. Player Movement & Visual Updates
				else if (msg.type === 'update') {
					const pid = msg.id; 
					if (!pid || pid === window.dedicatedId) return; 
					
					if (!otherPlayers[pid]) createRemotePlayer(pid, msg.payload);
					
					updateRemotePlayer(pid, msg.payload);
					if (otherPlayers[pid]) otherPlayers[pid].lastSeen = Date.now();
				}
				
				// 3. Player List Sync
				else if (msg.type === 'playerList') {
					msg.players.forEach(p => {
						if (p.id !== window.dedicatedId && p.peerId) {
							if (otherPlayers[p.id]) {
								otherPlayers[p.id].savedPeerId = p.peerId; 
								if(!otherPlayers[p.id].voiceId) {
									connectToPeerAudio(p.peerId);
									otherPlayers[p.id].voiceId = p.peerId; 
								}
								if (!otherPlayers[p.id].lastData) otherPlayers[p.id].lastData = {};
								otherPlayers[p.id].lastData.isVoiceMuted = p.isVoiceMuted;
								otherPlayers[p.id].lastData.isChatMuted = p.isChatMuted;
								otherPlayers[p.id].lastData.isMidiMuted = p.isMidiMuted;

								const audioId = otherPlayers[p.id].voiceId; 
								if (audioId) {
									const el = document.getElementById('audio-' + audioId);
									if (el && p.isVoiceMuted) el.muted = true;
								}
							}
						}
						if (otherPlayers[p.id] && p.name) {
							const playerEntity = otherPlayers[p.id];
							if (playerEntity.lastData.name !== p.name) {
								playerEntity.lastData.name = p.name;
								const oldNameTag = playerEntity.mesh.getObjectByName('nameTag');
								if (oldNameTag) {
									const newTex = createNameTagTexture(p.name);
									if(oldNameTag.material.map) oldNameTag.material.map.dispose();
									oldNameTag.material.map = newTex;
									oldNameTag.material.needsUpdate = true;
								}
							}
						}
					});
				}
				
				// 4. Chat Messages
				else if (msg.type === 'chat') displayChatMessage(msg.name, msg.text, msg.id);
				
				// 5. Sound Effects
				else if (msg.type === 'sound') {
					if (msg.name === 'guitar') {
						if (typeof localMutedMidi !== 'undefined' && localMutedMidi.includes(msg.id)) return;
						if (otherPlayers[msg.id] && otherPlayers[msg.id].lastData.isMidiMuted) return;
					}
					Sound.playSpatial(msg.name, msg.pos, msg.var);
				}
				
				// 6. Moderation
				else if (msg.type === 'purge_chat') purgeUserMessages(msg.targetId);

				// 7. Animations
				else if (msg.type === 'anim' && msg.anim === 'punch') {
					if (otherPlayers[msg.id]) {
						animatePunch(otherPlayers[msg.id].mesh);
						Sound.playSpatial('punch', otherPlayers[msg.id].mesh.position);
					}
				}
				else if (msg.type === 'punch_hit') handleHit(msg);
				
				// 8. World Events
				else if (msg.type === 'spawnPortal') spawnPortal(msg.x, msg.z, true);
				else if (msg.type === 'forceGhost') spawnGhostMesh(msg.x, msg.z);
				
				// 9. Props System
				else if (msg.type === 'spawn_prop') spawnPropMesh(msg.payload);
				else if (msg.type === 'remove_prop') {
					const mesh = activeProps[msg.id];
					if (mesh) {
						scene.remove(mesh);
						delete activeProps[msg.id];
					}
				}
				
				// 10. Environment
				else if (msg.type === 'environment_sync') {
					worldTime = msg.time;
					const prevRain = isRaining;
					isRaining = msg.isRaining;
					if (prevRain !== isRaining) {
						updateWeatherVisuals(); 
						if(isRaining) showToast("It started raining!");
						else showToast("The rain has stopped.");
					}
				}
				
				// 12. Economy / Inventory Sync
                else if (msg.type === 'sell_fish_response') {
                    // Update Local State with Server Truth
                    saveState.money = msg.money;
                    saveState.inventory = []; // Server cleared it, so we clear it.
                    saveGame();
                    
                    // Visual Feedback
                    Sound.sell();
                    showToast(`Sold ${msg.soldCount} fish for $${msg.totalValue}!`);
                    
                    if(npcMerchant) {
                        const s = npcMerchant.getObjectByName("playerSprite");
                        if(s) { s.scale.set(1.2, 1.2, 1.2); setTimeout(() => { s.scale.set(1,1,1); }, 200); }
                    }
                    updateUI(); // Refresh the money counter
                }

				// 11. System / Disconnects
				else if (msg.type === 'playerLeft') {
					removePlayer(msg.id);
					updateHostPanel(); 
					showToast("A fisher has left.");
				}
				else if (msg.type === 'system') displayChatMessage('System', msg.text, 'system');
            };

            // 3. Connect!
			let targetUrl;
			if (customUrl && typeof customUrl === 'string') {
				targetUrl = customUrl; 
			} else {
				targetUrl = (window.DEDICATED_SERVER_URL || DEDICATED_WS_URL);
			}
            
            document.getElementById('lobby-status').innerText = "Connecting...";
            networkManager.connect(targetUrl);
        }
		
		const MASTER_SERVER_URL = 'https://html-fishing-master-server.onrender.com'; // Matches Part 1

		window.openServerBrowser = async function() {
            const container = document.getElementById('server-list-content');
            container.innerHTML = 'Loading servers...';
            document.getElementById('server-browser-overlay').style.display = 'flex';

            try {
                const res = await fetch(`${MASTER_SERVER_URL}/list`);
                const servers = await res.json();
                
                container.innerHTML = ''; 

                if (servers.length === 0) {
                    container.innerHTML = '<div style="padding:10px;">No public servers found.</div>';
                    return;
                }

                servers.forEach(s => {
                    const row = document.createElement('div');
                    row.style.background = 'rgba(255,255,255,0.1)';
                    row.style.marginBottom = '5px';
                    row.style.padding = '10px';
                    row.style.borderRadius = '8px';
                    row.style.display = 'flex';
                    row.style.justifyContent = 'space-between';
                    row.style.alignItems = 'center';

                    const info = document.createElement('div');
                    info.innerHTML = `<b>${s.name}</b><br><span style="font-size:12px;color:#aaa;">${s.players} Players</span>`;
                    
                    const btn = document.createElement('button');
                    btn.className = 'btn-sm';
                    btn.innerText = "JOIN";
                    btn.style.background = '#44ff44';
                    btn.style.color = 'black';
                    
                    btn.onclick = () => {
                        // --- FIX START: Save Name Before Connecting ---
                        saveGame(); 
                        // --- FIX END ----------------------------------

                        // --- FIX: Detect HTTPS and force WSS ---
                        const isSecure = window.location.protocol === 'https:';
                        const protocol = isSecure ? 'wss' : 'ws';
                        
                        // --- CLOUDFLARE TUNNEL FIX ---
                        let targetPort = s.port;
                        if (/[a-zA-Z]/.test(s.ip) && isSecure) {
                            targetPort = 443; 
                        }

                        const wsUrl = `${protocol}://${s.ip}:${targetPort}`;
                        console.log("Connecting to:", wsUrl); 
                        
                        // NEW: Use network manager instead of calling connectToDedicatedServer directly
                        // We need to re-implement the UI logic here because connectToDedicatedServer has hardcoded logic.
                        // Or we can just reuse connectToDedicatedServer since it now uses the manager.
                        connectToDedicatedServer(wsUrl);
                        
                        document.getElementById('server-browser-overlay').style.display = 'none';
                    };

                    row.appendChild(info);
                    row.appendChild(btn);
                    container.appendChild(row);
                });

            } catch (e) {
                container.innerText = "Error fetching server list.";
                console.error(e);
            }
        }

		window.closeServerBrowser = function() {
			document.getElementById('server-browser-overlay').style.display = 'none';
		};

        // Run after DOM ready to wire up the Official Server button
        (function wireOfficialButton() {
            const tryWire = () => {
                const btn = document.getElementById('btn-official-join');
                if (!btn) return setTimeout(tryWire, 200);
        
                btn.onclick = () => {
                    // --- FIX START: Save the name from the input box first! ---
                    saveGame(); 
                    // --- FIX END ---
            
                    connectToDedicatedServer();
                };
            };
            tryWire();
        })();

        // Helper to send admin login to dedicated server (obfuscated): produce sha256(password + salt) and send
        async function dedicatedAdminLogin(password) {
          if (!dedicatedSocket || dedicatedSocket.readyState !== WebSocket.OPEN) {
            alert("Connect to Official Server first.");
            return false;
          }
          // ask server for salt by relying on the server to send 'welcome' with adminSalt (we store it)
          // NOTE: server already sends adminSalt in 'welcome'. We'll cache if provided.
          // Implementation: wait briefly for last received welcome to have provided adminSalt:
          // For reliability, we'll request salt via a dummy message - server included salt in welcome so this should work normally.
          // We'll assume server provided 'adminSalt' in the 'welcome' message and the client stored it in lastAdminSalt.
          if (!window.lastAdminSalt) {
            alert("Server hasn't provided salt yet. Try reconnecting.");
            return false;
          }
          const hash = await sha256HexBrowser(password + window.lastAdminSalt);
          dedicatedSocket.send(JSON.stringify({ type: 'admin_login', hash }));
          // server responds with admin_ok or admin_fail — listen for admin_ok to set isAdminOnDedicated
          return new Promise((resolve) => {
            const onMsg = (ev) => {
              try {
                const m = JSON.parse(ev.data);
                if (m.type === 'admin_ok') {
                  isAdminOnDedicated = true;
                  dedicatedSocket.removeEventListener('message', onMsg);
                  resolve(true);
                } else if (m.type === 'admin_fail') {
                  isAdminOnDedicated = false;
                  dedicatedSocket.removeEventListener('message', onMsg);
                  resolve(false);
                }
              } catch(e){}
            };
            dedicatedSocket.addEventListener('message', onMsg);
            // timeout fallback
            setTimeout(()=>{ dedicatedSocket.removeEventListener('message', onMsg); resolve(false); }, 4000);
          });
        }

        // store last admin salt if server sends it
        // optionally place this near the earlier message handling to cache welcome.adminSalt:
        (function cacheAdminSaltHook(){
          const orig = window.addEventListener;
          // easiest: patch the dedicatedSocket welcome handling above — it will set window.lastAdminSalt if present
        })();


        // --- WORLD GENERATION ---
        function generateWorld(seedStr) {
            treeMeshes.forEach(t => scene.remove(t));
            treeMeshes = []; treeColliders = [];
            const seed = xmur3(seedStr.toLowerCase())();
            const rand = mulberry32(seed);
            
            const cabinPos = new THREE.Vector3(-40, 0, 10);
            const safeZone = 15;

            
            for(let i=0; i<100; i++) { 
                const angle = rand() * Math.PI * 2;
                
                
                const minTreeDist = LAKE_RADIUS + 5;
                const maxTreeDist = ISLAND_RADIUS - 5;
                
                const dist = minTreeDist + rand() * (maxTreeDist - minTreeDist); 
                
                const x = Math.cos(angle) * dist;
                const z = Math.sin(angle) * dist;

                
                if (new THREE.Vector3(x, 0, z).distanceTo(cabinPos) < safeZone) continue;
                
                
                if (z < -70 && x > -30 && x < 30) continue;

                const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.8,3,8), new THREE.MeshStandardMaterial({color:0x8B4513}));
                t.position.set(x,1.5,z); 
                const l = new THREE.Mesh(new THREE.ConeGeometry(2.5,5,8), new THREE.MeshStandardMaterial({color:0x228B22}));
                l.position.set(0,3,0); t.add(l);
                scene.add(t); treeMeshes.push(t); treeColliders.push({x,z,radius:1.5});
            }
        }

        function handleDataFromClient(clientId, data) {
			// --- 1. SECURITY: RATE LIMIT CHECK ---
			const now = Date.now();
			
			// Initialize user in rate limiter if missing
			if (!rateLimits[clientId]) {
				rateLimits[clientId] = { lastGeneral: 0, lastChat: 0, lastSound: 0, lastProp: 0, lastAnim: 0 };
			}
			
			const userLimit = rateLimits[clientId];

			// Global Packet Flood Protection (DoS prevention)
			if (now - userLimit.lastGeneral < SPAM_THRESHOLDS.general) {
				return; // Silently drop packets if they are spamming raw data too fast
			}
			userLimit.lastGeneral = now;

			// Specific Action Limits
			if (data.type === 'chat') {
				if (now - userLimit.lastChat < SPAM_THRESHOLDS.chat) return; 
				userLimit.lastChat = now;
			}
			else if (data.type === 'sound') {
				if (now - userLimit.lastSound < SPAM_THRESHOLDS.sound) return;
				userLimit.lastSound = now;
			}
			else if (data.type === 'request_prop' || data.type === 'spawn_prop') {
				if (now - userLimit.lastProp < SPAM_THRESHOLDS.prop) return;
				userLimit.lastProp = now;
			}
			else if (data.type === 'anim' || data.type === 'punch_hit') {
				if (now - userLimit.lastAnim < SPAM_THRESHOLDS.anim) return;
				userLimit.lastAnim = now;
			}
			// ----------------------------------------

			try {
				if(otherPlayers[clientId]) {
					otherPlayers[clientId].lastSeen = Date.now();
				}

				if(data.type === 'update') {
					if (!data.payload || !data.payload.pos) return;
					if (isNaN(data.payload.pos.x) || isNaN(data.payload.pos.y) || isNaN(data.payload.pos.z)) return;

					// Boundary Check
					const isIsland = Math.abs(data.payload.pos.x) < ISLAND_RADIUS + 50 && Math.abs(data.payload.pos.z) < ISLAND_RADIUS + 50;
					const isVoid = Math.abs(data.payload.pos.x - 10000) < 500 && Math.abs(data.payload.pos.z - 10000) < 500;
					// Allow Lava world coordinates too
					const isLava = Math.abs(data.payload.pos.x + 20000) < 500; 

					if (!isIsland && !isVoid && !isLava) return; 

					// If player is not in our list, create them.
					if(!otherPlayers[clientId]) {
						if (data.payload.name) data.payload.name = escapeHTML(data.payload.name).substring(0, 12);
						createRemotePlayer(clientId, data.payload);
						connectToPeerAudio(clientId);
						updateHostPanel(); 

						// Critical Sync: Send current weather and time to the new player.
						clientConns[clientId].send({ 
							type: 'environment_sync', 
							isRaining: isRaining, 
							time: worldTime 
						});
					}

					if (data.payload.version !== GAME_VERSION) {
						if (clientConns[clientId]) {
							clientConns[clientId].send({ type: 'error', message: "Version Mismatch!" });
							setTimeout(() => clientConns[clientId].close(), 100);
						}
						return;
					}
			
					updateRemotePlayer(clientId, data.payload);

				} else if (data.type === 'chat') {
					if(mutedChatPeers.includes(clientId)) return; 
					data.id = clientId; 
					data.name = otherPlayers[clientId] ? otherPlayers[clientId].lastData.name : "Unknown";
					if(data.id !== myPeerId) displayChatMessage(data.name, data.text, data.id);
					broadcastToClients(data); 

				} else if (data.type === 'sound') {
					// MIDI Mute Check
					if (data.name === 'guitar') {
						if (otherPlayers[clientId] && otherPlayers[clientId].lastData.isMidiMuted) return;
						if (localMutedMidi.includes(clientId)) return;
					}

					Sound.playSpatial(data.name, data.pos, data.var);
					if(isHost) broadcastToClients(data); 

				} else if (data.type === 'anim') {
					if (data.anim === 'punch') {
						if (data.id === myPeerId) return;
						const p = otherPlayers[data.id];
						if (p && p.mesh) {
							animatePunch(p.mesh);
							Sound.playSpatial('punch', p.mesh.position);
						}
						if (isHost) broadcastToClients(data);
					}
				} else if (data.type === 'punch_hit') {
					handleHit(data);
				} else if (data.type === 'radio_event') {
					handleRadioEvent(data);
					if (isHost) broadcastToClients(data);
				} else if (data.type === 'spawn_prop') {
					spawnPropMesh(data.payload);
				} else if (data.type === 'remove_prop') {
					const mesh = activeProps[data.id];
					if (mesh) {
						scene.remove(mesh);
						delete activeProps[data.id];
					}
				} else if (data.type === 'request_prop') {
					// Remote client wants to place a prop
					handleRequestPropHost(clientId, data);
				} else if (data.type === 'undo_prop') {
					// Remote client wants to undo
					handleUndoPropHost(clientId);
				}

			} catch (err) {
				console.warn(`Error handling data from ${clientId}:`, err);
			}
		}

        function handleDataFromHost(data) {
            if (data.type === 'error') {
                alert(data.message);
                location.reload();
                return;
            }

            // A. Full world state (PeerJS Host usually sends this)
            if(data.type === 'worldState') {
                if (data.gameVersion && data.gameVersion !== GAME_VERSION) {
                    alert("Game Version Mismatch! Host is on " + data.gameVersion);
                    location.reload();
                    return;
                }
                Object.keys(data.players).forEach(pid => {
                    if(pid === myPeerId) return;
                    if(!otherPlayers[pid]) {
                        createRemotePlayer(pid, data.players[pid]);
                        connectToPeerAudio(pid);
                    }
                    updateRemotePlayer(pid, data.players[pid]);
                });
                Object.keys(otherPlayers).forEach(pid => {
                    if(!data.players[pid]) removePlayer(pid);
                });
            }

            // B. Environment sync
            else if (data.type === 'environment_sync') {
                worldTime = data.time;
                const prevRain = isRaining;
                isRaining = data.isRaining;
                if (prevRain !== isRaining) {
                    updateWeatherVisuals(); 
                    if(isRaining) showToast("It started raining!");
                    else showToast("The rain has stopped.");
                }
            }
			
			else if (data.type === 'purge_chat') {
                purgeUserMessages(data.targetId);
            }
    
            // C. Gameplay Events
            else if (data.type === 'forceGhost') spawnGhostMesh(data.x, data.z);
            else if (data.type === 'spawnPortal') spawnPortal(data.x, data.z, true);
            else if (data.type === 'chat' && data.id !== myPeerId) displayChatMessage(data.name, data.text, data.id);
            else if (data.type === 'sound') {
                // --- MIDI MUTE CHECK START ---
                if (data.name === 'guitar') {
                    // 1. Check Global/Admin Mute (Server Flag)
                    // Note: 'data.id' is the ID of the person playing the guitar
                    if (otherPlayers[data.id] && otherPlayers[data.id].lastData.isMidiMuted) return;

                    // 2. Check Local Mute (Player List)
                    if (localMutedMidi.includes(data.id)) return;
                }
                // --- MIDI MUTE CHECK END ---

                Sound.playSpatial(data.name, data.pos, data.var);
            }
            else if (data.type === 'spawn_prop') {
                spawnPropMesh(data.payload);
            }
            else if (data.type === 'remove_prop') {
                const mesh = activeProps[data.id];
                if (mesh) {
                    scene.remove(mesh);
                    delete activeProps[data.id];
                }
            }
            else if (data.type === 'punch_hit') handleHit(data);
            else if (data.type === 'anim' && data.anim === 'punch') {
                 if (otherPlayers[data.id]) {
                     animatePunch(otherPlayers[data.id].mesh);
                     Sound.playSpatial('punch', otherPlayers[data.id].mesh.position);
                 }
            }
        }

        function broadcastPlayerList() {
                const worldState = {}; worldState[myPeerId] = myData;
                Object.keys(otherPlayers).forEach(pid => { 
                const pData = otherPlayers[pid].lastData;
                pData.isVoiceMuted = mutedVoicePeers.includes(pid);
                pData.isChatMuted = mutedChatPeers.includes(pid);
                // Note: PeerJS host doesn't support MIDI mute enforcement efficiently 
                // without complex logic, but we pass the data anyway.
                worldState[pid] = pData; 
            });
            broadcastToClients({ type: 'worldState', players: worldState, gameVersion: GAME_VERSION });
        }
        function broadcastToClients(msg) { Object.values(clientConns).forEach(conn => { if(conn.open) conn.send(msg); }); }
        function sendUpdate() {
            if(!player) return;

            // Prepare local player data
            myData.pos = { x: player.position.x, y: player.position.y, z: player.position.z };
            myData.rot = player.rotation.y;
            myData.bobber = (bobber && fishingState!=='idle' && fishingState!=='charging') ? { x: bobber.position.x, y: bobber.position.y, z: bobber.position.z } : null;

            myData.color = saveState.catColor;
            myData.belly = saveState.bellyColor;
            myData.eye = saveState.eyeColor;
            myData.hat = saveState.currentHat;
            myData.species = saveState.species;
            myData.guitar = isGuitarActive;
            myData.glove = isGloveActive;
            myData.title = saveState.currentTitle;
            myData.heldFish = localHeldFish;
            myData.shirt = saveState.currentShirt;
            myData.collar = saveState.currentCollar;
            myData.name = saveState.displayName;
			myData.rod = saveState.currentRod;
			myData.handsEmpty = isHandsHidden;

            myData.version = GAME_VERSION;

            // --- 1. PEERJS HOST LOGIC ---
            if (isHost) {
                const now = Date.now();
                // Day/Night & Weather Logic
                const date = new Date();
                worldTime = date.getHours() + (date.getMinutes() / 60) + (date.getSeconds() / 3600);

                if (now > nextWeatherChange) {
                    if (isRaining) { isRaining = false; nextWeatherChange = now + (480000 + Math.random() * 420000); } 
                    else { 
                        if (Math.random() < 0.15) { isRaining = true; nextWeatherChange = now + (180000 + Math.random() * 180000); } 
                        else { nextWeatherChange = now + (120000 + Math.random() * 120000); }
                    }
                    updateWeatherVisuals();
                }

                const envMsg = { type: 'environment_sync', isRaining: isRaining, time: worldTime };
                broadcastToClients(envMsg);

                Object.keys(otherPlayers).forEach(id => {
                    if (now - otherPlayers[id].lastSeen > 15000) {
                        removePlayer(id); 
                        if(clientConns[id]) { clientConns[id].close(); delete clientConns[id]; }
                        broadcastPlayerList();
                        updateHostPanel();
                    }
                });
                broadcastPlayerList();
            } 
            // --- 2. PEERJS CLIENT LOGIC ---
            else if (hostConn && hostConn.open) {
                hostConn.send({ type: 'update', payload: myData });
            }
            // --- 3. DEDICATED SERVER LOGIC (NEW) ---
            else if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
                // We must include our ID so other players know who we are
                dedicatedSocket.send(JSON.stringify({ 
                    type: 'update', 
                    id: dedicatedId, 
                    payload: myData 
                }));
            }
        }
        setInterval(sendUpdate, 50);
         
        function createRemotePlayer(id, data) {
            // Ensure we use the name from the data, or fallback to Fisher
            const nameToUse = data.name || "Fisher";

            // Create the mesh with the correct name immediately
            const group = createPlayerMesh(
                data.color || 0xcccccc, 
                nameToUse, 
                data.hat || 'none', 
                data.eye || '#000000', 
                data.species || 'cat', 
                data.title || 'none',
				data.rod || 'bamboo'
            );

            // Apply specific textures (Shirt, Collar, etc)
            const s = group.getObjectByName('playerSprite');
            const texF = createSpeciesTexture(
                data.species || 'cat', data.color, data.belly, false, 
                data.hat, data.shirt || 'none', data.collar || 'none', data.eye || '#000000'
            );
            const texB = createSpeciesTexture(
                data.species || 'cat', data.color, data.belly, true, 
                data.hat, data.shirt || 'none', data.collar || 'none', data.eye || '#000000'
            );

            s.userData.matFront.map = texF;
            s.userData.matBack.map = texB;
            s.material = s.userData.matFront; 
            s.material.needsUpdate = true;

            scene.add(group);

            // Store the player data
            otherPlayers[id] = {
                mesh: group, 
                targetPos: new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z),
                targetRot: data.rot, 
                bobberMesh: null, 
                lineMesh: null, 
                lastData: data,
                lastSeen: Date.now()
            };

            // Chat notification
            if (document.getElementById('lobby-screen').style.display === 'none') {
                displayChatMessage(nameToUse, "has joined!", 'system');
            }
        }

        function updateRemotePlayer(id, data) {
			const p = otherPlayers[id];
			if (!p) return;

            // --- FIX START: Preserve Admin Mute Flags ---
            // We must save these because the incoming 'data' packet is from the client (who sends position)
            // and does not contain the Admin Mute flags sent by the server.
            const wasVoiceMuted = p.lastData ? p.lastData.isVoiceMuted : false;
            const wasChatMuted = p.lastData ? p.lastData.isChatMuted : false;
			const wasMidiMuted = p.lastData ? p.lastData.isMidiMuted : false;
            // --- FIX END ---

			// 1. NAME TAG SYNC
			if (data.name && p.lastData.name !== data.name) {
				p.lastData.name = data.name;
				const oldNameTag = p.mesh.getObjectByName('nameTag');
				if(oldNameTag) {
					const newTex = createNameTagTexture(data.name);
					if(oldNameTag.material.map) oldNameTag.material.map.dispose();
					oldNameTag.material.map = newTex;
					oldNameTag.material.needsUpdate = true;
				}
			}

			// 2. TITLE SYNC
			if (p.lastData.title !== data.title) {
				const oldT = p.mesh.getObjectByName('titleSprite');
				if(oldT) p.mesh.remove(oldT);
				const tTex = createTitleTexture(data.title);
				if(tTex) {
					const tSprite = new THREE.Sprite(new THREE.SpriteMaterial({map:tTex}));
					tSprite.position.y = 2.5; tSprite.scale.set(3, 0.75, 1); tSprite.name = "titleSprite";
					tSprite.visible = saveState.showTitles;
					p.mesh.add(tSprite);
				}
			}

			// 3. VISUALS SYNC (Colors, Hat, Shirt, Collar)
			if (p.lastData.color !== data.color || p.lastData.belly !== data.belly || p.lastData.hat !== data.hat || 
				p.lastData.eye !== data.eye || p.lastData.species !== data.species || p.lastData.shirt !== data.shirt || p.lastData.collar !== data.collar) {

				const s = p.mesh.getObjectByName('playerSprite');
				const texF = createSpeciesTexture(data.species || 'cat', data.color, data.belly, false, data.hat, data.shirt || 'none', data.collar || 'none', data.eye || '#000000');
				const texB = createSpeciesTexture(data.species || 'cat', data.color, data.belly, true, data.hat, data.shirt || 'none', data.collar || 'none', data.eye || '#000000');
				s.userData.matFront.map = texF;
				s.userData.matBack.map = texB;
			}

			// 4. POSITION INTERPOLATION
			p.lastData = data;
            
            // --- FIX START: Restore Admin Mute Flags ---
            p.lastData.isVoiceMuted = wasVoiceMuted;
            p.lastData.isChatMuted = wasChatMuted;
			p.lastData.isMidiMuted = wasMidiMuted;
            // --- FIX END ---

			p.targetPos.set(data.pos.x, data.pos.y, data.pos.z);
			p.targetRot = data.rot;

			// 5. HELD ITEMS (Guitar, Glove, Fish, Rod, Empty)
            const rod = p.mesh.getObjectByName("rod");
            let guitar = p.mesh.getObjectByName("guitarMesh");
            let glove = p.mesh.getObjectByName("gloveMesh");
            let fishSprite = p.mesh.getObjectByName("heldFishSprite");

            // A. Guitar Logic
            if (data.guitar === true) {
                if (!guitar) {
                    // ... (keep your existing guitar creation code) ...
                    const c = document.createElement('canvas'); c.width=64; c.height=64; const ctx = c.getContext('2d');
                    ctx.fillStyle = '#8B4513'; ctx.beginPath(); ctx.arc(32, 45, 12, 0, Math.PI*2); ctx.fill(); 
                    ctx.beginPath(); ctx.arc(32, 35, 10, 0, Math.PI*2); ctx.fill(); 
                    ctx.fillStyle = '#222'; ctx.fillRect(30, 10, 4, 30); 
                    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(32, 40, 4, 0, Math.PI*2); ctx.fill(); 
                    const tex = new THREE.CanvasTexture(c); 
                    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
                    const mat = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 });
                    guitar = new THREE.Sprite(mat); guitar.name = 'guitarMesh'; guitar.position.set(0.3, 1.0, 0.2); guitar.scale.set(1.5, 1.5, 1); p.mesh.add(guitar);
                }
                guitar.visible = true;
                if(glove) glove.visible = false;
                if(fishSprite) fishSprite.visible = false;
                if(rod) rod.visible = false;
            }
            // B. Glove Logic
            else if (data.glove === true) {
                if (!glove) {
                    // ... (keep your existing glove creation code) ...
                    const c = document.createElement('canvas'); c.width=64; c.height=64; const ctx = c.getContext('2d');
                    ctx.fillStyle = '#cc0000'; ctx.beginPath(); ctx.arc(32, 32, 20, 0, Math.PI*2); ctx.fill(); 
                    const tex = new THREE.CanvasTexture(c); 
                    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
                    const mat = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 });
                    glove = new THREE.Sprite(mat); glove.name = 'gloveMesh'; glove.position.set(0.6, 1.0, 0.5); glove.scale.set(1.2, 1.2, 1); p.mesh.add(glove);
                }
                if(glove) glove.visible = true;
                if(guitar) guitar.visible = false;
                if(fishSprite) fishSprite.visible = false;
                if(rod) rod.visible = false;
            }
            // C. Held Fish Logic
            else if (data.heldFish) {
                if (!fishSprite || fishSprite.userData.fishName !== data.heldFish.name) {
                    if (fishSprite) p.mesh.remove(fishSprite);
                    const fTex = createFishTexture(data.heldFish.name, data.heldFish.color);
                    const fMat = new THREE.SpriteMaterial({ map: fTex, transparent: true, alphaTest: 0.5 });
                    fishSprite = new THREE.Sprite(fMat);
                    fishSprite.name = 'heldFishSprite';
                    fishSprite.userData = { fishName: data.heldFish.name }; 
                    fishSprite.position.set(0.6, 1.2, 0.5); 
                    const s = data.heldFish.size || 1.0;
                    fishSprite.scale.set(1.5 * s, 1.5 * s, 1);
                    p.mesh.add(fishSprite);
                }
                fishSprite.visible = true;
                if(guitar) guitar.visible = false;
                if(glove) glove.visible = false;
                if(rod) rod.visible = false;
            }
            // D. Empty Hands Logic (NEW)
            else if (data.handsEmpty) {
                // Hide everything
                if(guitar) guitar.visible = false;
                if(glove) glove.visible = false;
                if(fishSprite) fishSprite.visible = false;
                if(rod) rod.visible = false;
            }
            // E. Rod Logic (Default)
            else {
                if(guitar) guitar.visible = false;
                if(glove) glove.visible = false;
                if(fishSprite) fishSprite.visible = false;
                
                // Ensure rod exists and skin is correct
                if (!rod || (data.rod && rod.userData.rodId !== data.rod)) {
                    if (rod) p.mesh.remove(rod);

                    const rodId = data.rod || 'bamboo';
                    const rodTex = createRodTexture(rodId);
                    const rodMat = new THREE.MeshBasicMaterial({ map: rodTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
                    
                    const rodGeo = new THREE.PlaneGeometry(3.0, 3.0);
                    rodGeo.translate(1.5, 1.5, 0); 

                    const newRod = new THREE.Mesh(rodGeo, rodMat);
                    newRod.position.set(0.6, 0.8, 0.1); 
                    newRod.rotation.set(-0.2, -Math.PI/2, 0); 
                    newRod.name = "rod"; 
                    newRod.userData.rodId = rodId;
                    p.mesh.add(newRod);
                } else {
                    rod.visible = true;
                }
            }

			// 6. BOBBER & LINE SYNC
			if(data.bobber) {
				if(!p.bobberMesh) {
					p.bobberMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial({color:0xff0000})); scene.add(p.bobberMesh);
					p.lineMesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({color:0xffffff})); p.lineMesh.frustumCulled=false; scene.add(p.lineMesh);
				}
				p.bobberMesh.position.set(data.bobber.x, data.bobber.y, data.bobber.z);
				
                const activeRod = p.mesh.getObjectByName("rod");
				if(activeRod) {
					// SYNC CAST ANIMATION: Rotate X forward to 0.8
					activeRod.rotation.x = 0.8; 
				}
			} else {
				if(p.bobberMesh) { scene.remove(p.bobberMesh); scene.remove(p.lineMesh); p.bobberMesh=null; p.lineMesh=null; }
				
				// RESET REMOTE ROD (Idle Position)
                const activeRod = p.mesh.getObjectByName("rod");
				if(activeRod) {
					activeRod.rotation.x = -0.2; 
				}
			}
		}

        function startGame() { if(!isMobile) document.getElementById('chat-ui').style.display = 'flex'; Music.init(); } // Called after lobby
        
        let lastChatTime = 0;

        function sendChatMessage(text) {
            const now = Date.now();
            
            // Rate Limit: 2 messages per second
            if (now - lastChatTime < 500) {
                showToast("Chatting too fast!");
                return;
            }
            lastChatTime = now;

            // Increase character limit to 256 for better emoji/link support
            const safeText = text.substring(0, 256); 
            
            // Empty check
            if(!safeText.trim()) return;

            // --- 1. Check for Image and use that to display locally ---
            const embeddedHtml = embedImageIfValid(safeText);

            // 2. Display locally immediately (send raw text/URL)
            displayChatMessage(saveState.displayName, safeText, 'local'); 
            broadcastSound('chat');
            
            // --- Use the descriptive text for the chat bubble ---
            // If it's an image, the bubble shows 'Image posted...'
            showChatBubble(player, embeddedHtml === safeText ? safeText : 'Image posted...'); 
            
            // 3. Prepare Network Message
            const msg = { type: 'chat', text: safeText };
            
            // 4. Send to Appropriate Network
            if (isHost) {
                const peerMsg = { ...msg, name: saveState.displayName, id: myPeerId };
                broadcastToClients(peerMsg); 
            } 
            else if (hostConn && hostConn.open) {
                const peerMsg = { ...msg, name: saveState.displayName, id: myPeerId };
                hostConn.send(peerMsg);
            }
            else if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
                dedicatedSocket.send(JSON.stringify(msg));
            }
        }
		
        function displayChatMessage(name, text, id) {
			// 1. MUTE CHECKS
			if (id && id !== 'system' && id !== 'local') {
				if (localMutedChat.includes(id)) return;
				if (otherPlayers[id] && otherPlayers[id].lastData && otherPlayers[id].lastData.isChatMuted) return;
			}

			const box = document.getElementById('chat-messages');
			const line = document.createElement('div'); 
			line.className = 'chat-msg';
			
			// Store sender ID for moderation (purging)
			if (id) line.dataset.senderId = id;

			const safeName = escapeHTML(name || "Unknown"); 
			
			// Truncate length
			const rawText = (text || "").substring(0, 256);
			// Determine the safe version of the text for bubbles/fallbacks
			const safeText = escapeHTML(rawText);

			if (id === 'system') {
				line.innerHTML = `<span style="color:#ffd700; font-style:italic; font-weight:bold; font-size:12px;">${safeName} ${safeText}</span>`;
			} else {
				
				// --- SECURITY LOGIC ---
				// We pass the RAW text to embedImageIfValid. 
				// That function handles the security check and escaping internally.
				// It returns either a clean <img> string OR the escaped text string.
				const content = embedImageIfValid(rawText);

				line.innerHTML = `<span class="chat-name">${safeName}:</span><span class="chat-text">${content}</span>`;
			}

			box.appendChild(line); 
			
			// --- SCROLL FIX ---
			box.scrollTop = box.scrollHeight;

			// --- IMAGE LOADING SCROLL FIX ---
			const images = line.getElementsByTagName('img');
			if (images.length > 0) {
				images[0].onload = function() {
					box.scrollTop = box.scrollHeight;
				};
				if (images[0].complete) {
					box.scrollTop = box.scrollHeight;
				}
			}
			
			// --- CHAT BUBBLES ---
			// Note: We use 'safeText' here because bubbles don't render HTML/Images
			const bubbleContent = (safeText !== embedImageIfValid(rawText)) ? 'Image posted...' : rawText;

			if(id && id !== 'local' && id !== 'system' && otherPlayers[id]) {
				showChatBubble(otherPlayers[id].mesh, bubbleContent);
			} else if (id === 'local' && player) {
				 showChatBubble(player, bubbleContent);
			}

			refreshChatFade(); 
		}
        
        function showChatBubble(parentMesh, text) {
            
            const existing = parentMesh.getObjectByName("chatBubble");
            if (existing) parentMesh.remove(existing);

            
            const maxMsgLength = 256;      
            const maxCharsPerLine = 24;    
            const fontSize = 22;
            const lineHeight = 28;
            const padding = 20;

            
            let safeText = text.substring(0, maxMsgLength);
            let rawWords = safeText.split(' ');
            let lines = [];
            let currentLine = "";

            rawWords.forEach(word => {
                
                if (word.length > maxCharsPerLine) {
                    
                    if (currentLine.length > 0) {
                        lines.push(currentLine);
                        currentLine = "";
                    }
                    
                    for (let i = 0; i < word.length; i += maxCharsPerLine) {
                        let chunk = word.substring(i, i + maxCharsPerLine);
                        
                        
                        if (chunk.length === maxCharsPerLine && (i + maxCharsPerLine < word.length)) {
                            lines.push(chunk);
                        } else {
                            currentLine = chunk;
                        }
                    }
                } 
                
                else {
                    
                    if (currentLine.length + word.length + 1 > maxCharsPerLine) {
                        lines.push(currentLine);
                        currentLine = word;
                    } else {
                        
                        currentLine += (currentLine.length > 0 ? " " : "") + word;
                    }
                }
            });
            
            if (currentLine.length > 0) lines.push(currentLine);


            
            const canvasWidth = 256; 
            const canvasHeight = (lines.length * lineHeight) + padding;

            const canvas = document.createElement('canvas');
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            const ctx = canvas.getContext('2d');

            
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.strokeStyle = "white";
            ctx.lineWidth = 3;

            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(2, 2, canvasWidth - 4, canvasHeight - 4, 15);
            } else {
                ctx.rect(2, 2, canvasWidth - 4, canvasHeight - 4);
            }
            ctx.fill();
            ctx.stroke();

            
            ctx.fillStyle = "white";
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const centerX = canvasWidth / 2;
            let currentY = (canvasHeight - (lines.length * lineHeight)) / 2 + (lineHeight / 2);

            lines.forEach(line => {
                ctx.fillText(line, centerX, currentY);
                currentY += lineHeight;
            });

            
            const tex = new THREE.CanvasTexture(canvas);
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
            const sprite = new THREE.Sprite(mat);

            
            const scaleX = 4;
            const scaleY = scaleX * (canvasHeight / canvasWidth);
            
            sprite.scale.set(scaleX, scaleY, 1);
            sprite.position.y = 3.2 + (scaleY / 2); 
            sprite.name = "chatBubble";

            parentMesh.add(sprite);

            
            const readTime = 3000 + (safeText.length * 100);
            setTimeout(() => {
                if (parentMesh && parentMesh.getObjectByName("chatBubble") === sprite) {
                    parentMesh.remove(sprite);
                    mat.dispose();
                    tex.dispose();
                }
            }, readTime);
        }

        async function refreshServerCount() {
            const el = document.getElementById('official-count');
            if (!el) return;

            // Convert WSS URL to HTTPS (e.g. wss://site.com -> https://site.com)
            const wsUrl = (window.DEDICATED_SERVER_URL || DEDICATED_WS_URL);
            const httpUrl = wsUrl.replace('ws://', 'http://').replace('wss://', 'https://');

            try {
                const response = await fetch(httpUrl);
                if (!response.ok) throw new Error("Server Offline");
                
                const data = await response.json();
                el.innerText = `🟢 ${data.players} Online`;
                el.style.color = '#44ff44';
            } catch (err) {
                console.warn("Server Check Failed:", err);
                el.innerText = "🔴 Offline";
                el.style.color = '#ff4444';
            }
        }
		
		function createLavaWorld() {
			// Clear old data
			if (lavaFloorMesh) scene.remove(lavaFloorMesh);
			if (lavaLakeMesh) scene.remove(lavaLakeMesh);
			if (window.lavaRockGroup) {
				scene.remove(window.lavaRockGroup);
				window.lavaRockGroup = null;
			}
			lavaColliders = [];

			// --- SETUP SEEDED RNG ---
			const seed = xmur3("lava-dimension")(); 
			const rand = mulberry32(seed);

			// 1. The Ground
			const groundGeo = new THREE.CylinderGeometry(80, 80, 5, 32);
			const groundMat = new THREE.MeshStandardMaterial({ color: 0x4E342E }); 
			lavaFloorMesh = new THREE.Mesh(groundGeo, groundMat);
			lavaFloorMesh.position.set(-20000, -2.5, 0); 
			scene.add(lavaFloorMesh);

			// 2. The Lava Lake
			const lakeGeo = new THREE.CircleGeometry(25, 32);
			const lakeMat = new THREE.MeshStandardMaterial({ 
				color: 0xff4500, 
				emissive: 0xcc0000,
				emissiveIntensity: 0.5
			});
			lavaLakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
			lavaLakeMesh.rotation.x = -Math.PI / 2;
			lavaLakeMesh.position.set(-20000, 0.1, 0);
			scene.add(lavaLakeMesh);

			// 3. Lava Rocks (Now Synced & Safe Zone Protected)
			const rockGeo = new THREE.DodecahedronGeometry(1, 0); 
			const rockMat = new THREE.MeshStandardMaterial({ color: 0x221111 });

			window.lavaRockGroup = new THREE.Group();
			scene.add(window.lavaRockGroup);

			// Define where the NPCs are so we don't put rocks on them
			const safeZones = [
				{ x: -20000 + 35, z: 0 },   // Merchant
				{ x: -20000 - 35, z: 0 },   // Stylist
				{ x: -20000, z: 35 },       // Bait
				{ x: -20000, z: -35 }       // Builder
			];
			const safeRadius = 8; // Distance to keep clear around NPCs

			for (let i = 0; i < 40; i++) {
				const angle = rand() * Math.PI * 2;
				const dist = 30 + rand() * 45; 
				
				const x = -20000 + Math.cos(angle) * dist;
				const z = Math.sin(angle) * dist;
				
				// --- CHECK SAFE ZONES ---
				let tooClose = false;
				for (let zone of safeZones) {
					const dx = x - zone.x;
					const dz = z - zone.z;
					const d = Math.sqrt(dx*dx + dz*dz);
					if (d < safeRadius) {
						tooClose = true;
						break;
					}
				}

				// If the rock is inside a safe zone, skip creating it
				if (tooClose) continue; 
				// ------------------------

				const rock = new THREE.Mesh(rockGeo, rockMat);
				const scale = 1.5 + rand() * 2.5;
				
				rock.position.set(x, scale/2, z); 
				rock.scale.set(scale, scale, scale);
				rock.rotation.set(rand(), rand(), rand());
				
				window.lavaRockGroup.add(rock);

				lavaColliders.push({ x: x, z: z, radius: scale * 0.8 });
			}

			// 4. Embers
			const particlesGeo = new THREE.BufferGeometry();
			const particleCount = 200;
			const posArray = new Float32Array(particleCount * 3);
			for(let i=0; i<particleCount*3; i+=3) {
				posArray[i] = -20000 + (Math.random() - 0.5) * 100; 
				posArray[i+1] = Math.random() * 50; 
				posArray[i+2] = (Math.random() - 0.5) * 100; 
			}
			particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
			const particlesMat = new THREE.PointsMaterial({color: 0xffaa00, size: 0.5});
			const embers = new THREE.Points(particlesGeo, particlesMat);
			scene.add(embers);
		}

                
        let waterfallMesh; 

        function createWaterfallZone() {
            const mountainMat = new THREE.MeshStandardMaterial({color: 0x555555, roughness: 0.9});

            const c1 = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 20), mountainMat);
            c1.position.set(-25, 20, -90); 
            scene.add(c1);
    
            staticColliders.push({minX: -46, maxX: -4, minZ: -100, maxZ: -79}); 

            const c2 = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 20), mountainMat);
            c2.position.set(25, 20, -90); 
            scene.add(c2);
    
            staticColliders.push({minX: 6, maxX: 44, minZ: -100, maxZ: -79}); 
    
            const c3 = new THREE.Mesh(new THREE.BoxGeometry(90, 10, 20), mountainMat);
            c3.position.set(0, 35, -90); 
            scene.add(c3);

            const backWall = new THREE.Mesh(new THREE.BoxGeometry(90, 40, 10), mountainMat);
            backWall.position.set(0, 20, -105); 
            scene.add(backWall);
            staticColliders.push({minX: -46, maxX: 44, minZ: -110, maxZ: -99}); 

            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#4fa'; ctx.fillRect(0,0,64,64);
            for(let i=0; i<50; i++) {
                ctx.fillStyle = `rgba(255,255,255,${Math.random()*0.5})`;
                ctx.fillRect(Math.random()*64, Math.random()*64, 2, 10);
            }
            const waterTex = new THREE.CanvasTexture(canvas);
    
            // --- FILTER FIX ---
            waterTex.magFilter = THREE.NearestFilter;
            waterTex.minFilter = THREE.NearestFilter;
            // ------------------

            waterTex.wrapS = THREE.RepeatWrapping;
            waterTex.wrapT = THREE.RepeatWrapping;
            waterTex.repeat.set(2, 6); 

            const waterMat = new THREE.MeshStandardMaterial({
                map: waterTex, 
                color: 0x00ffff, 
                transparent: true, 
                opacity: 0.8,
                side: THREE.DoubleSide
            });

            waterfallMesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 50), waterMat);
            waterfallMesh.position.set(0, 10, -81); 
            waterfallMesh.rotation.x = 0; 
            scene.add(waterfallMesh);

            const caveFloor = new THREE.Mesh(new THREE.CircleGeometry(15, 32), new THREE.MeshStandardMaterial({color: 0x222222}));
            caveFloor.rotation.x = -Math.PI/2;
            caveFloor.position.set(0, 0.1, -95);
            scene.add(caveFloor);

            const secretPool = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshStandardMaterial({color: 0x0000ff, emissive: 0x0000aa}));
            secretPool.rotation.x = -Math.PI/2;
            secretPool.position.set(0, 0.15, -95);
            scene.add(secretPool);

            addHotspotParticles(0, 1, -95);
        }

        function addHotspotParticles(x, y, z) {
            const geo = new THREE.BufferGeometry();
            const pos = [];
            for(let i=0; i<10; i++) pos.push(x + (Math.random()-0.5)*5, y + Math.random()*2, z + (Math.random()-0.5)*5);
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            const mat = new THREE.PointsMaterial({color: 0xffff00, size: 0.5});
            const parts = new THREE.Points(geo, mat);
            scene.add(parts);
        }

        function updateDayNightCycle(dt) {
			// 1. Calculate Colors
			let targetSky;
			let lightIntensity = 1.0;

			// --- LAVA WORLD OVERRIDE ---
			if (isInLavaWorld) {
				targetSky = new THREE.Color(0x220000); // Dark Red/Brown Sky
				lightIntensity = 0.8; 
				
				if (sunLight) {
					sunLight.color.setHex(0xffaa00); // Orange light
					sunLight.intensity = 0.8;
				}
				
				// Apply immediately
				scene.background = targetSky;
				scene.fog.color = targetSky;
				return; // Skip standard day/night cycle
			}
			
			// --- VOID OVERRIDE ---
			if (isInVoid) {
				targetSky = new THREE.Color(0x000000);
				lightIntensity = 0.5;
				// Apply immediately
				scene.background = targetSky;
				scene.fog.color = targetSky;
				return;
			}

			// --- STANDARD WORLD CYCLE ---
			// Normalize time to 0-24
			// 6 AM to 6 PM = Day
			if (worldTime >= 6 && worldTime < 18) {
				// Sunrise (6am - 7am)
				if (worldTime < 7) {
					targetSky = NIGHT_COLOR.clone().lerp(DAY_COLOR, (worldTime - 6));
				} 
				// Sunset (5pm - 6pm)
				else if (worldTime > 17) {
					targetSky = DAY_COLOR.clone().lerp(SUNSET_COLOR, (worldTime - 17));
				} 
				// Middle of Day
				else {
					targetSky = DAY_COLOR.clone();
				}
			} else {
				// Night
				lightIntensity = 0.2; // Dim light

				// Dusk (6pm - 7pm)
				if (worldTime >= 18 && worldTime < 19) {
					targetSky = SUNSET_COLOR.clone().lerp(NIGHT_COLOR, (worldTime - 18));
				} 
				// Middle of Night
				else {
					targetSky = NIGHT_COLOR.clone();
				}
			}

			// Rain Override: Darken the sky if it's raining.
			if (isRaining) {
				const rainColor = new THREE.Color(0x445566);
				targetSky.lerp(rainColor, 0.9); 
				lightIntensity *= 0.5; // Darken light during rain
			}

			// Apply Visuals
			scene.background = targetSky;
			scene.fog.color = targetSky;

			// Move Sun/Moon
			const angle = ((worldTime - 6) / 24) * Math.PI * 2; 
			const radius = 100;

			if (sunMesh) {
				sunMesh.position.x = Math.cos(angle) * radius;
				sunMesh.position.y = Math.sin(angle) * radius;
				sunMesh.lookAt(0,0,0);
			}
			if (moonMesh) {
				moonMesh.position.x = Math.cos(angle + Math.PI) * radius; 
				moonMesh.position.y = Math.sin(angle + Math.PI) * radius;
				moonMesh.lookAt(0,0,0);
			}

			// Update Light
			if (sunLight) {
				if (worldTime > 6 && worldTime < 18) {
					sunLight.position.copy(sunMesh.position);
					sunLight.intensity = lightIntensity;
					sunLight.color.setHex(0xffffff); 
				} else {
					sunLight.position.copy(moonMesh.position);
					sunLight.intensity = lightIntensity * 0.5; 
					sunLight.color.setHex(0x4444ff); 
				}
			}
		}

        function createRainSystem() {
            const rainCount = 1500;
            const geom = new THREE.BufferGeometry();
            const positions = [];
            const velocities = [];

            for (let i = 0; i < rainCount; i++) {
                // Random positions above the island
                positions.push((Math.random() - 0.5) * 200); // x
                positions.push(Math.random() * 40 + 10);     // y (height)
                positions.push((Math.random() - 0.5) * 200); // z
                velocities.push(0.5 + Math.random() * 0.5);  // Speed
            }

            geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geom.userData = { velocities: velocities };

            const mat = new THREE.PointsMaterial({
                color: 0xaaaaaa,
                size: 0.5,
                transparent: true,
                opacity: 0.6
            });

            rainSystem = new THREE.Points(geom, mat);
            rainSystem.visible = false; // Start off
            scene.add(rainSystem);
        }

        // --- THREE.JS SCENE SETUP ---
        function setupThreeJS() {
            scene = new THREE.Scene(); 
            scene.background = new THREE.Color(0x87CEEB); 
            scene.fog = new THREE.Fog(0x87CEEB, 20, 100);
    
            camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 1000);
    
            // KEEP antialias: false for pixel art style
            renderer = new THREE.WebGLRenderer({antialias:false}); 
    
            // --- PIXEL RATIO FIX ---
            renderer.setPixelRatio(window.devicePixelRatio || 1);
            // -----------------------
    
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
            document.getElementById('game-container').appendChild(renderer.domElement);

            const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); 
            hemi.name = 'hemiLight';
            scene.add(hemi);

            // The Sun Light (Shadow caster)
            sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
            sunLight.position.set(50, 100, 50);
            sunLight.castShadow = true;
            scene.add(sunLight);

            // Sun Mesh (Visual sphere in sky)
            const sunGeo = new THREE.SphereGeometry(5, 16, 16);
            const sunMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
            sunMesh = new THREE.Mesh(sunGeo, sunMat);
            scene.add(sunMesh);

            // Moon Mesh
            const moonGeo = new THREE.SphereGeometry(4, 16, 16);
            const moonMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            moonMesh = new THREE.Mesh(moonGeo, moonMat);
            scene.add(moonMesh);

            const isl = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS, 5, 64), new THREE.MeshStandardMaterial({color:0x7cfc00}));
            isl.position.y = -2.5; scene.add(isl);
            const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE_RADIUS, 64), new THREE.MeshStandardMaterial({color:0x1E90FF}));
            lake.rotation.x = -Math.PI/2; lake.position.y=0.1; scene.add(lake);

            generateWorld("lobby-world"); 
            createCabin();

            createNPCs(); createLocalPlayer();
            createWaterfallZone();
            createRainSystem();
			createLavaWorld();

            fishingLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({color:0xffffff}));
            fishingLine.frustumCulled = false; fishingLine.visible = false; scene.add(fishingLine);

            castMarker = new THREE.Group();
            const barMat = new THREE.MeshBasicMaterial({color:0xff0000, transparent: true, opacity: 0.8, side: THREE.DoubleSide}); 
            const b1 = new THREE.Mesh(new THREE.PlaneGeometry(1,0.2), barMat); const b2 = new THREE.Mesh(new THREE.PlaneGeometry(1,0.2), barMat);
            b2.rotation.z = Math.PI/2; castMarker.add(b1, b2);
            castMarker.rotation.x = -Math.PI/2; castMarker.visible = false; scene.add(castMarker);

            window.addEventListener('resize', () => {
                camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            });
        }

        function createSpeakerTexture() {
            const c = document.createElement('canvas'); c.width=64; c.height=64;
            const ctx = c.getContext('2d');
            ctx.fillStyle='white';
            ctx.beginPath(); ctx.moveTo(10, 20); ctx.lineTo(25, 20); ctx.lineTo(40, 5); ctx.lineTo(40, 59); ctx.lineTo(25, 44); ctx.lineTo(10, 44); ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle='white';
            ctx.beginPath(); ctx.arc(40, 32, 10, -Math.PI/3, Math.PI/3); ctx.stroke();
            ctx.beginPath(); ctx.arc(40, 32, 20, -Math.PI/3, Math.PI/3); ctx.stroke();
            return new THREE.CanvasTexture(c);
        }

        function createCabin() {
            const grp = new THREE.Group();
            
            const cx = -40;
            const cz = 10;
            grp.position.set(cx, 0, cz); 

            // --- MATERIALS ---
            const woodMat = new THREE.MeshStandardMaterial({color: 0x5D4037, roughness: 0.9}); 
            const roofMat = new THREE.MeshStandardMaterial({color: 0x3E2723, roughness: 0.8}); 
            const floorMat = new THREE.MeshStandardMaterial({color: 0x8D6E63});

            // --- HELPER: Create Log ---
            function createLog(length, x, y, z, rotY=0) {
                const geo = new THREE.CylinderGeometry(0.35, 0.35, length, 8); 
                const mesh = new THREE.Mesh(geo, woodMat);
                mesh.rotation.z = Math.PI / 2; 
                mesh.rotation.y = rotY;       
                mesh.position.set(x, y, z);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                grp.add(mesh);
            }

            // --- 0. BASE FILLERS (Fixes the bottom gap!) ---
            // These fit BETWEEN the side walls at the lowest level
            // Back Wall Base
            createLog(8.2, 0, 0.35, -4.5, 0);
            // Front Wall Base (Left & Right of door)
            createLog(3.5, -3.5, 0.35, 4.5, 0);
            createLog(3.5, 3.5, 0.35, 4.5, 0);

            // --- 1. WALLS (Interlocking) ---
            let y = 0.35; 
            const wallHeight = 4.0;

            while (y < wallHeight) {
                
                // --- LAYER A: SIDE WALLS (Z-Axis) ---
                // These define the corners for this layer
                const isWindow = (y > 1.2 && y < 2.8);
                
                if (isWindow) {
                    createLog(3.5, -4.5, y, -3.5, Math.PI/2); // Left Back
                    createLog(3.5, -4.5, y, 3.5, Math.PI/2);  // Left Front
                    createLog(3.5, 4.5, y, -3.5, Math.PI/2);  // Right Back
                    createLog(3.5, 4.5, y, 3.5, Math.PI/2);   // Right Front
                } else {
                    createLog(11, -4.5, y, 0, Math.PI/2); // Left Full
                    createLog(11, 4.5, y, 0, Math.PI/2);  // Right Full
                }

                // --- LAYER B: FRONT/BACK WALLS (X-Axis) ---
                // Sits on top of Layer A
                const y2 = y + 0.35; 
                
                // Back Wall
                createLog(11, 0, y2, -4.5, 0);

                // Front Wall (Door logic)
                const isDoor = (y2 < 2.6);
                if (isDoor) {
                    createLog(4, -3.5, y2, 4.5, 0); 
                    createLog(4, 3.5, y2, 4.5, 0);  
                } else {
                    createLog(11, 0, y2, 4.5, 0); // Header
                }

                // Increment for next Layer A
                y += 0.7; 
            }

            // --- 2. ROOF GABLES (The Triangles) ---
            // Tighter spacing (0.4) to prevent holes
            let gableY = 4.0; 
            const ridgeHeight = 6.8; // Go slightly into the roof beam
            const maxGableWidth = 10; 

            while (gableY < ridgeHeight) {
                gableY += 0.4; 
                
                // Calculate width based on height progress
                const progress = (gableY - 4.0) / (ridgeHeight - 4.0);
                const currentWidth = maxGableWidth * (1.0 - progress);

                // Stop if too small, but ensure we get close to top
                if (currentWidth > 0.2) {
                    createLog(currentWidth, 0, gableY, -4.5, 0); // Back
                    createLog(currentWidth, 0, gableY, 4.5, 0);  // Front
                }
            }

            // --- 3. FLOOR & ROOF MESHES ---
            const floor = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.4, 9.5), floorMat);
            floor.position.y = 0.2; 
            floor.receiveShadow = true;
            grp.add(floor);

            const roofGroup = new THREE.Group();
            
            // Left Slope
            const slopeGeo = new THREE.BoxGeometry(7.5, 0.4, 12); 
            const slope1 = new THREE.Mesh(slopeGeo, roofMat);
            slope1.position.set(-2.8, 5.5, 0);
            slope1.rotation.z = Math.PI / 5; 
            slope1.castShadow = true;
            
            // Right Slope
            const slope2 = new THREE.Mesh(slopeGeo, roofMat);
            slope2.position.set(2.8, 5.5, 0);
            slope2.rotation.z = -Math.PI / 5;
            slope2.castShadow = true;

            // Ridge Log
            const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 12, 8), woodMat);
            ridge.rotation.x = Math.PI/2;
            ridge.position.set(0, 6.7, 0);

            roofGroup.add(slope1, slope2, ridge);
            grp.add(roofGroup);

            scene.add(grp);

            // --- 4. PHYSICS COLLIDERS ---
            staticColliders.push({ minX: cx - 5, maxX: cx + 5, minZ: cz - 5, maxZ: cz - 4 }); // Back
            staticColliders.push({ minX: cx - 5, maxX: cx - 4, minZ: cz - 5, maxZ: cz + 5 }); // Left
            staticColliders.push({ minX: cx + 4, maxX: cx + 5, minZ: cz - 5, maxZ: cz + 5 }); // Right
            staticColliders.push({ minX: cx - 5, maxX: cx - 1.5, minZ: cz + 4, maxZ: cz + 5 }); // Front L
            staticColliders.push({ minX: cx + 1.5, maxX: cx + 5, minZ: cz + 4, maxZ: cz + 5 }); // Front R
        }
		
		// let npcBuilder; removed
        function createNPCs() {
			// --- MAIN WORLD NPCs ---
			
			// 1. Merchant (East)
			npcMerchant = createPlayerMesh('#E65100', "Merchant", 'tophat', '#000000', 'fox');
			npcMerchant.position.set(LAKE_RADIUS + 3, 0, 0); 
			npcMerchant.lookAt(0, 0, 0); 
			scene.add(npcMerchant);
			
			// 2. Stylist (West)
			npcStylist = createPlayerMesh('#FF69B4', "Stylist", 'bow', '#000000', 'bunny'); 
			npcStylist.position.set(-(LAKE_RADIUS + 3), 0, 0); 
			npcStylist.lookAt(0, 0, 0); 
			scene.add(npcStylist);
			
			// 3. Bait Shop (South)
			npcBait = createPlayerMesh('#32CD32', "Bait Shop", 'straw', '#000000', 'frog');
			npcBait.position.set(0, 0, LAKE_RADIUS + 3); 
			npcBait.lookAt(0, 0, 0); 
			scene.add(npcBait);

			// 4. Builder (North)
			npcBuilder = createPlayerMesh('#FFD700', "Builder", 'hardhat', '#000000', 'bear'); 
			npcBuilder.position.set(0, 0, -(LAKE_RADIUS + 3)); 
			npcBuilder.lookAt(0, 0, 0);
			scene.add(npcBuilder);
			
			// 5. Inferno Guard (Main World - Waterfall Entrance)
			npcLavaKeeper = createPlayerMesh('#8B0000', "Inferno Guard", 'viking', '#FFD700', 'dragon');
			npcLavaKeeper.position.set(16, 0, 16); 
			npcLavaKeeper.lookAt(0, 0, 0);
			scene.add(npcLavaKeeper);

			// Add Icons
			addIcon(npcLavaKeeper, '🌋');
			addIcon(npcMerchant, '$');
			addIcon(npcStylist, '👕');
			addIcon(npcBait, '🪱');
			addIcon(npcBuilder, '🔨');

			// --- LAVA WORLD NPCs (Fixed Height) ---
			// Moved Y from -2.5 to 0 so they stand ON the floor
			
			// Lava Merchant
			npcLavaMerchant = createPlayerMesh('#E65100', "Merchant", 'tophat', '#000000', 'fox');
			npcLavaMerchant.position.set(-20000 + 35, 0, 0); 
			npcLavaMerchant.lookAt(-20000, 0, 0); 
			scene.add(npcLavaMerchant);

			// Lava Stylist
			npcLavaStylist = createPlayerMesh('#FF69B4', "Stylist", 'bow', '#000000', 'bunny'); 
			npcLavaStylist.position.set(-20000 - 35, 0, 0); 
			npcLavaStylist.lookAt(-20000, 0, 0); 
			scene.add(npcLavaStylist);

			// Lava Bait
			npcLavaBait = createPlayerMesh('#32CD32', "Bait Shop", 'straw', '#000000', 'frog');
			npcLavaBait.position.set(-20000, 0, 35); 
			npcLavaBait.lookAt(-20000, 0, 0); 
			scene.add(npcLavaBait);

			// Lava Builder
			npcLavaBuilder = createPlayerMesh('#FFD700', "Builder", 'hardhat', '#000000', 'bear'); 
			npcLavaBuilder.position.set(-20000, 0, -35); 
			npcLavaBuilder.lookAt(-20000, 0, 0);
			scene.add(npcLavaBuilder);

			// Add Icons for Lava Versions
			addIcon(npcLavaMerchant, '$');
			addIcon(npcLavaStylist, '👕');
			addIcon(npcLavaBait, '🪱');
			addIcon(npcLavaBuilder, '🔨');
		}
		
        function addIcon(parent, text) {
            const c=document.createElement('canvas'); c.width=64; c.height=64;
            const ctx=c.getContext('2d'); ctx.fillStyle='#FFD700'; ctx.font='50px Arial'; ctx.textAlign='center'; ctx.fillText(text,32,50);
            const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c)}));
            s.position.y=3.2; parent.add(s);
        }

        // --- DYNAMIC TEXTURE DRAWING FUNCTIONS ---
        function drawHat(ctx, hatId, isBack) {
            const hat = HAT_TYPES.find(h=>h.id===hatId);
            if(!hat || hat.id === 'none') return;
            
            ctx.fillStyle = hat.color;
            
            
            if(hat.type === 'cap') {
                ctx.fillRect(14, 0, 36, 12); ctx.fillRect(14, 0, 36, 6); 
                if(!isBack) ctx.fillRect(14, 12, 40, 4); 
            } else if(hat.type === 'wide') {
                ctx.fillRect(10, 8, 44, 4); ctx.fillRect(18, 0, 28, 10); 
            } else if(hat.type === 'dome') {
                ctx.beginPath(); ctx.arc(32, 10, 18, Math.PI, 0); ctx.fill();
            } else if (hat.type === 'tall') {
                ctx.fillRect(12, 10, 40, 4); ctx.fillRect(18, -10, 28, 20); 
            } else if (hat.type === 'cone') {
                ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(54, 10); ctx.lineTo(32, -15); ctx.fill();
            } else if (hat.type === 'horn') {
                ctx.fillRect(14, 0, 36, 10); 
                ctx.fillStyle = '#fff'; 
                ctx.beginPath(); ctx.moveTo(14, 5); ctx.lineTo(5, -5); ctx.lineTo(14, 0); ctx.fill();
                ctx.beginPath(); ctx.moveTo(50, 5); ctx.lineTo(59, -5); ctx.lineTo(50, 0); ctx.fill();
            } else if (hat.type === 'crown') {
                ctx.beginPath();
                ctx.moveTo(14, 10); ctx.lineTo(14, -5); ctx.lineTo(20, 5); ctx.lineTo(26, -5);
                ctx.lineTo(32, 5); ctx.lineTo(38, -5); ctx.lineTo(44, 5); ctx.lineTo(50, -5);
                ctx.lineTo(50, 10); ctx.fill();
            } 
            
            
            else if (hat.type === 'fedora') {
                ctx.fillRect(10, 8, 44, 4); 
                ctx.fillRect(16, -2, 32, 10); 
                ctx.fillStyle = '#444'; ctx.fillRect(16, 4, 32, 2); 
            }
            else if (hat.type === 'beret') {
                ctx.beginPath(); ctx.ellipse(34, 4, 22, 10, -0.2, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.moveTo(34, -6); ctx.lineTo(34, -8); ctx.stroke(); 
            }
            else if (hat.type === 'bucket') {
                ctx.fillRect(14, 0, 36, 10); 
                ctx.beginPath(); ctx.moveTo(14,10); ctx.lineTo(8,16); ctx.lineTo(56,16); ctx.lineTo(50,10); ctx.fill(); 
            }
            else if (hat.type === 'headphones') {
                ctx.fillStyle = '#222'; ctx.fillRect(10, 6, 8, 16); ctx.fillRect(46, 6, 8, 16); 
                ctx.strokeStyle = '#222'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(32, 10, 22, Math.PI, 0); ctx.stroke(); 
            }
            else if (hat.type === 'flower') {
                if(!isBack) {
                    ctx.fillStyle = '#fff';
                    for(let i=0; i<5; i++) {
                        const angle = (i/5)*Math.PI*2;
                        ctx.beginPath(); ctx.arc(44+Math.cos(angle)*5, 4+Math.sin(angle)*5, 4, 0, Math.PI*2); ctx.fill();
                    }
                    ctx.fillStyle = 'yellow'; ctx.beginPath(); ctx.arc(44, 4, 3, 0, Math.PI*2); ctx.fill();
                }
            }
            else if (hat.type === 'miner') {
                ctx.fillStyle = hat.color;
                ctx.beginPath(); ctx.arc(32, 8, 18, Math.PI, 0); ctx.fill(); 
                if(!isBack) {
                    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(32, -2, 4, 0, Math.PI*2); ctx.fill(); 
                    ctx.fillStyle = 'rgba(255,255,200,0.5)'; ctx.beginPath(); ctx.moveTo(32, -2); ctx.lineTo(10, 30); ctx.lineTo(54, 30); ctx.fill(); 
                }
            }
            else if (hat.type === 'sombrero') {
                ctx.beginPath(); ctx.ellipse(32, 8, 28, 6, 0, 0, Math.PI*2); ctx.fill(); 
                ctx.fillRect(22, -8, 20, 16); 
            }
            else if (hat.type === 'santa') {
                ctx.fillStyle = '#ff0000';
                ctx.beginPath(); ctx.moveTo(12, 10); ctx.lineTo(52, 10); ctx.lineTo(20, -15); ctx.fill(); 
                ctx.fillStyle = '#fff'; ctx.fillRect(12, 8, 40, 6); 
                ctx.beginPath(); ctx.arc(20, -15, 4, 0, Math.PI*2); ctx.fill(); 
            }
            else if (hat.type === 'witch') {
                ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(32, 10, 24, 4, 0, 0, Math.PI*2); ctx.fill(); 
                ctx.fillStyle = hat.color; ctx.beginPath(); ctx.moveTo(20, 10); ctx.lineTo(44, 10); ctx.lineTo(32, -20); ctx.fill(); 
            }
            else if (hat.type === 'ninja') {
                ctx.fillRect(14, 4, 36, 6); 
                ctx.fillStyle = 'red'; ctx.beginPath(); ctx.arc(32, 7, 2, 0, Math.PI*2); ctx.fill(); 
                if(isBack) { ctx.fillStyle = hat.color; ctx.fillRect(30, 6, 4, 20); } 
            }
            else if (hat.type === 'propeller') {
                ctx.fillStyle = hat.color; ctx.beginPath(); ctx.arc(32, 8, 17, Math.PI, 0); ctx.fill(); 
                ctx.fillStyle = '#555'; ctx.fillRect(31, -10, 2, 6); 
                if(!isBack) {
                    ctx.fillStyle = 'red'; ctx.beginPath(); ctx.ellipse(32, -10, 10, 2, 0, 0, Math.PI*2); ctx.fill(); 
                }
            }
            else if (hat.type === 'halo') {
                ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.ellipse(32, -10, 14, 4, 0, 0, Math.PI*2); ctx.stroke();
            }
            else if (hat.type === 'antlers') {
                ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 2;
                
                ctx.beginPath(); ctx.moveTo(20, 5); ctx.lineTo(10, -10); ctx.lineTo(15, -15); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(5, -12); ctx.stroke();
                
                ctx.beginPath(); ctx.moveTo(44, 5); ctx.lineTo(54, -10); ctx.lineTo(49, -15); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(54, -10); ctx.lineTo(59, -12); ctx.stroke();
            }
            else if (hat.type === 'police') {
                ctx.fillRect(14, -5, 36, 15); 
                ctx.fillStyle = 'black'; ctx.fillRect(14, 8, 36, 4); 
                if(!isBack) { ctx.fillStyle='gold'; ctx.beginPath(); ctx.arc(32, 0, 3, 0, Math.PI*2); ctx.fill(); } 
            }
            else if (hat.type === 'tv') {
                ctx.fillStyle = '#444'; ctx.fillRect(10, -5, 44, 35); 
                if(!isBack) {
                    ctx.fillStyle = '#222'; ctx.fillRect(14, 0, 36, 25); 
                    ctx.fillStyle = '#00ff00'; ctx.fillRect(18, 5, 4, 4); ctx.fillRect(24, 15, 12, 2); 
                }
                
                ctx.strokeStyle='#888'; ctx.lineWidth=2; 
                ctx.beginPath(); ctx.moveTo(20, -5); ctx.lineTo(10, -15); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(44, -5); ctx.lineTo(54, -15); ctx.stroke();
            }
            else if (hat.type === 'plunger') {
                ctx.fillStyle = 'brown'; ctx.fillRect(30, -15, 4, 25); 
                ctx.fillStyle = '#cd5c5c'; ctx.beginPath(); ctx.arc(32, 10, 10, Math.PI, 0); ctx.fill(); 
            }
            else if (hat.type === 'arrow') {
                ctx.fillStyle = '#8B4513'; 
                
                if(!isBack) ctx.fillRect(0, 15, 14, 2); 
                ctx.fillRect(50, 13, 14, 2); 
                
                ctx.fillStyle = 'white'; ctx.beginPath(); ctx.moveTo(0,15); ctx.lineTo(-5, 10); ctx.lineTo(-5, 20); ctx.fill();
                
                ctx.fillStyle = 'grey'; ctx.beginPath(); ctx.moveTo(64,14); ctx.lineTo(70,14); ctx.lineTo(64,10); ctx.fill();
            }
            else if (hat.type === 'grad') {
                ctx.fillStyle = hat.color; 
                ctx.fillRect(16, 8, 32, 4); 
                ctx.beginPath(); ctx.moveTo(32, -5); ctx.lineTo(60, 5); ctx.lineTo(32, 15); ctx.lineTo(4, 5); ctx.fill(); 
                if(isBack) { ctx.strokeStyle='gold'; ctx.beginPath(); ctx.moveTo(32, -5); ctx.lineTo(32, 10); ctx.stroke(); } 
            }
            else if (hat.type === 'rainbow') {
                
                for(let i=0; i<20; i++) {
                    ctx.fillStyle = `hsl(${i*18}, 100%, 50%)`;
                    const x = 32 + (Math.random()-0.5)*40;
                    const y = 10 + (Math.random()-0.5)*30;
                    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.fill();
                }
            }
            else if (hat.type === 'void') {
                
                ctx.fillStyle = '#000'; ctx.fillRect(14, 10, 36, 24); 
                if(!isBack) {
                    ctx.fillStyle = '#fff'; 
                    
                    ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
                    ctx.fillRect(20, 18, 6, 2); ctx.fillRect(38, 18, 6, 2);
                    ctx.shadowBlur = 0;
                }
            }
            else if (hat.type === 'diamond') {
                ctx.fillStyle = '#ccc'; 
                ctx.fillRect(14, 8, 36, 4);
                
                ctx.fillStyle = '#00ffff';
                ctx.beginPath(); ctx.moveTo(32, 8); ctx.lineTo(32, -5); ctx.lineTo(28, 8); ctx.fill();
                ctx.beginPath(); ctx.moveTo(20, 8); ctx.lineTo(20, 0); ctx.lineTo(16, 8); ctx.fill();
                ctx.beginPath(); ctx.moveTo(44, 8); ctx.lineTo(44, 0); ctx.lineTo(48, 8); ctx.fill();
            }
        }

        window.toggleMidiMute = function() {
            saveState.midiMuted = !saveState.midiMuted;
            saveGame();
            updateMidiUI();
        }

        function updateMidiUI() {
            const btn = document.getElementById('btn-midi-toggle');
            if(btn) {
                btn.innerText = saveState.midiMuted ? "🎸 MIDI: OFF" : "🎸 MIDI: ON";
                btn.style.color = saveState.midiMuted ? '#ff4444' : '#44ff44';
            }
        }

        // Draws the base species model (body, head, ears, eyes, etc.).
        function drawSpecies(ctx, species, col, bellyCol, eyeCol, back) {
            ctx.clearRect(0,0,64,64);
    
            // --- STANDARD BODY (All Species share this) ---
            ctx.fillStyle = col; 
            ctx.fillRect(20, 30, 24, 30); // Body Box
    
            if(!back) {
                ctx.fillStyle = bellyCol; 
                ctx.fillRect(24, 35, 16, 20); // Belly Patch
            } else {
                ctx.fillStyle = col; 
                ctx.fillRect(28, 45, 8, 15); // Tail Base (Generic)
            }

            // --- STANDARD HEAD (36x24) ---
            // Guaranteed same size for everyone
            ctx.fillStyle = col; 
            ctx.fillRect(14, 10, 36, 24);

            // --- SPECIES SPECIFIC FEATURES ---
            
            // 1. CAT
            if(species === 'cat') {
                ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(14, 0); ctx.lineTo(24, 10); ctx.fill(); // L Ear
                ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(50, 0); ctx.lineTo(40, 10); ctx.fill(); // R Ear
                if(!back){
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle='pink'; ctx.fillRect(30,28,4,2); // Nose
                }
            } 
            // 2. BUNNY
            else if(species === 'bunny') {
                ctx.fillStyle = col; ctx.fillRect(18, -4, 8, 16); ctx.fillRect(38, -4, 8, 16); // Long Ears
                if(!back){
                    ctx.fillStyle = bellyCol; ctx.fillRect(20, -2, 4, 12); ctx.fillRect(40, -2, 4, 12);
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle='pink'; ctx.fillRect(30,26,4,3); 
                } else {
                    ctx.fillStyle = bellyCol; ctx.beginPath(); ctx.arc(32, 52, 6, 0, Math.PI * 2); ctx.fill(); // Tail
                }
            } 
            // 3. DOG
            else if(species === 'dog') {
                ctx.fillStyle = col; ctx.fillRect(10, 12, 6, 12); ctx.fillRect(48, 12, 6, 12); // Floppy Ears
                if(!back){
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle='black'; ctx.fillRect(29,26,6,4); // Nose
                    ctx.strokeStyle='black'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(32,30); ctx.lineTo(32,33); ctx.stroke();
                } else {
                    ctx.beginPath(); ctx.moveTo(32,45); ctx.lineTo(40,38); ctx.lineTo(32,50); ctx.fill(); // Tail
                }
            }
            // 4. BEAR
            else if(species === 'bear') {
                ctx.beginPath(); ctx.arc(14, 10, 5, 0, Math.PI*2); ctx.fill(); // Round Ears
                ctx.beginPath(); ctx.arc(50, 10, 5, 0, Math.PI*2); ctx.fill();
                if(!back) {
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle = '#dcb'; ctx.beginPath(); ctx.arc(32, 28, 6, 0, Math.PI*2); ctx.fill(); // Snout
                    ctx.fillStyle = 'black'; ctx.fillRect(30, 26, 4, 3); 
                } else {
                    ctx.beginPath(); ctx.arc(32, 50, 4, 0, Math.PI*2); ctx.fill(); // Tail
                }
            }
            // 5. FOX
            else if(species === 'fox') {
                ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(10, -5); ctx.lineTo(24, 10); ctx.fill();
                ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(54, -5); ctx.lineTo(40, 10); ctx.fill();
                if(!back) {
                    ctx.fillStyle = 'white'; // Cheeks
                    ctx.beginPath(); ctx.moveTo(14,34); ctx.lineTo(32,34); ctx.lineTo(14,24); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(50,34); ctx.lineTo(32,34); ctx.lineTo(50,24); ctx.fill();
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle = 'black'; ctx.fillRect(30, 28, 4, 3);
                } else {
                    ctx.beginPath(); ctx.moveTo(32,45); ctx.lineTo(44,35); ctx.lineTo(46,55); ctx.lineTo(32,55); ctx.fill(); // Tail
                    ctx.fillStyle = 'white'; ctx.beginPath(); ctx.moveTo(44,35); ctx.lineTo(48,32); ctx.lineTo(50,40); ctx.fill();
                }
            }
            // 6. PIG
            else if(species === 'pig') {
                ctx.beginPath(); ctx.moveTo(14,12); ctx.lineTo(8,8); ctx.lineTo(18,16); ctx.fill();
                ctx.beginPath(); ctx.moveTo(50,12); ctx.lineTo(56,8); ctx.lineTo(46,16); ctx.fill();
                if(!back) {
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle = '#ffaaaa'; ctx.fillRect(26, 26, 12, 6); // Snout
                    ctx.fillStyle = '#cc6666'; ctx.fillRect(28, 28, 2, 2); ctx.fillRect(34, 28, 2, 2);
                } else {
                    ctx.strokeStyle = col; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(36, 50, 4, 0, Math.PI*1.5); ctx.stroke();
                }
            }
            // 7. DRAGON
            else if(species === 'dragon') {
                ctx.fillStyle = '#eee'; // Horns
                ctx.beginPath(); ctx.moveTo(18,10); ctx.lineTo(14,-2); ctx.lineTo(24,10); ctx.fill();
                ctx.beginPath(); ctx.moveTo(46,10); ctx.lineTo(50,-2); ctx.lineTo(40,10); ctx.fill();
                ctx.fillStyle = bellyCol; // Wings
                ctx.beginPath(); ctx.moveTo(22,35); ctx.lineTo(6,25); ctx.lineTo(14,45); ctx.fill();
                ctx.beginPath(); ctx.moveTo(42,35); ctx.lineTo(58,25); ctx.lineTo(50,45); ctx.fill();
                if(!back) {
                    ctx.fillStyle='white'; ctx.fillRect(20,18,8,8); ctx.fillRect(36,18,8,8);
                    ctx.fillStyle=eyeCol; ctx.fillRect(24,18,4,8); ctx.fillRect(40,18,4,8); // Slit Eyes
                    ctx.fillStyle = bellyCol; ctx.fillRect(28, 26, 8, 6);
                    ctx.fillStyle = 'black'; ctx.fillRect(29, 28, 2, 2); ctx.fillRect(33, 28, 2, 2);
                } else {
                    ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.moveTo(32,45); ctx.lineTo(36,50); ctx.lineTo(28,50); ctx.fill(); // Spike Tail
                }
            }

            // --- NEW SPECIES ---

            // 8. MOUSE
            else if(species === 'mouse') {
                ctx.fillStyle = col; 
                ctx.beginPath(); ctx.arc(14, 8, 8, 0, Math.PI*2); ctx.fill(); // Big Round Ears
                ctx.beginPath(); ctx.arc(50, 8, 8, 0, Math.PI*2); ctx.fill();
                if(!back) {
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle = 'pink'; ctx.fillRect(30, 28, 4, 3);
                    ctx.fillStyle = 'black'; ctx.fillRect(24, 28, 6, 1); ctx.fillRect(34, 28, 6, 1); // Whiskers
                } else {
                    ctx.strokeStyle = 'pink'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(32,45); ctx.lineTo(32,60); ctx.stroke();
                }
            }
            // 9. DUCK
            else if(species === 'duck') {
                if(!back) {
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle = 'orange'; // Bill
                    ctx.beginPath(); ctx.ellipse(32, 28, 6, 3, 0, 0, Math.PI*2); ctx.fill();
                } else {
                    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(32,45); ctx.lineTo(40,40); ctx.lineTo(24,40); ctx.fill(); // Tail Feathers
                }
            }
            // 10. AXOLOTL
            else if(species === 'axolotl') {
                // Gills
                ctx.fillStyle = '#ff69b4';
                ctx.fillRect(8, 14, 6, 2); ctx.fillRect(8, 18, 6, 2); ctx.fillRect(8, 22, 6, 2);
                ctx.fillRect(50, 14, 6, 2); ctx.fillRect(50, 18, 6, 2); ctx.fillRect(50, 22, 6, 2);
                if(!back) {
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle = eyeCol; ctx.fillRect(30, 28, 4, 1); // Tiny Smile
                } else {
                     ctx.fillStyle = '#ff69b4'; ctx.fillRect(30, 40, 4, 15); // Fin Tail
                }
            }
            // 11. RACCOON

            else if(species === 'raccoon') {
                ctx.fillStyle = col; 
                ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(10, 0); ctx.lineTo(24, 10); ctx.fill();
                ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(54, 0); ctx.lineTo(40, 10); ctx.fill();
                if(!back) {
                    ctx.fillStyle = '#333'; ctx.fillRect(14, 18, 36, 8); // Mask
                    
                    // FIX: Changed 'white' to 'eyeCol' so the pupils use the selected color
                    drawStandardFace(ctx, eyeCol); 
                    
                    ctx.fillStyle = 'black'; ctx.fillRect(30, 28, 4, 3);
                } else {
                    // Striped Tail
                    ctx.fillStyle = '#333'; ctx.fillRect(30, 45, 4, 12);
                    ctx.fillStyle = '#999'; ctx.fillRect(30, 48, 4, 2); ctx.fillRect(30, 52, 4, 2);
                }
            }
            // 12. KOALA
            else if(species === 'koala') {
                ctx.fillStyle = '#ddd'; // Inner Ear fluff
                ctx.beginPath(); ctx.arc(12, 14, 6, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(52, 14, 6, 0, Math.PI*2); ctx.fill();
                if(!back) {
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle = '#333'; 
                    ctx.beginPath(); ctx.ellipse(32, 26, 5, 8, 0, 0, Math.PI*2); ctx.fill(); // Big Nose
                }
            }
            // 13. LION
            else if(species === 'lion') {
                ctx.fillStyle = '#d2691e'; // Mane (Behind/Around)
                if(!back) {
                    ctx.fillRect(10, 8, 4, 28); ctx.fillRect(50, 8, 4, 28); // Side Mane
                    ctx.fillRect(14, 6, 36, 4); // Top Mane
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle = 'pink'; ctx.fillRect(30, 28, 4, 3); 
                } else {
                     ctx.fillRect(10, 8, 44, 28); // Full Back Mane
                     ctx.fillStyle = col; ctx.fillRect(30, 45, 4, 12); // Tail
                }
            }
            // 14. COW
            else if(species === 'cow') {
                ctx.fillStyle = '#ddd'; // Horns
                ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(8, 4); ctx.lineTo(18, 10); ctx.fill();
                ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(56, 4); ctx.lineTo(46, 10); ctx.fill();
                ctx.fillStyle = col; // Ears
                ctx.fillRect(8, 16, 6, 4); ctx.fillRect(50, 16, 6, 4);
                if(!back) {
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle = 'pink'; ctx.fillRect(24, 26, 16, 6); // Snout
                    ctx.fillStyle = 'black'; ctx.fillRect(26, 28, 2, 2); ctx.fillRect(36, 28, 2, 2);
                }
            }
            // 15. FROG (Updated: Eyes inside head)
            else if(species === 'frog') {
                if(!back) {
                    // Big Bulbous Eyes INSIDE the head (Top corners)
                    // Centered at y=15 so they don't clip above y=10 (where hats sit)
                    ctx.fillStyle = 'white'; 
                    ctx.beginPath(); ctx.arc(19, 15, 5, 0, Math.PI*2); ctx.fill(); // Left Sclera
                    ctx.beginPath(); ctx.arc(45, 15, 5, 0, Math.PI*2); ctx.fill(); // Right Sclera
                    
                    ctx.fillStyle = eyeCol;
                    ctx.beginPath(); ctx.arc(19, 15, 2, 0, Math.PI*2); ctx.fill(); // Left Pupil
                    ctx.beginPath(); ctx.arc(45, 15, 2, 0, Math.PI*2); ctx.fill(); // Right Pupil
                    
                    // Wide mouth
                    ctx.fillStyle = '#003300'; 
                    ctx.fillRect(22, 26, 20, 2); 
                } else {
                    // Darker spots on back
                    ctx.fillStyle = 'rgba(0,0,0,0.2)';
                    ctx.beginPath(); ctx.arc(22, 40, 4, 0, Math.PI*2); ctx.fill();
                    ctx.beginPath(); ctx.arc(42, 50, 3, 0, Math.PI*2); ctx.fill();
                }
            }
            // 16. MONKEY
            else if(species === 'monkey') {
                ctx.fillStyle = col; // Side Ears
                ctx.beginPath(); ctx.arc(12, 20, 4, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(52, 20, 4, 0, Math.PI*2); ctx.fill();
                if(!back) {
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle = '#eec'; // Face skin
                    ctx.fillRect(26, 26, 12, 6);
                    ctx.fillStyle = 'black'; ctx.fillRect(30, 27, 4, 1); // Nostrils
                } else {
                    ctx.beginPath(); ctx.moveTo(32,45); ctx.lineTo(32,55); ctx.lineTo(40,60); ctx.stroke(); // Tail
                }
            }
            // 17. PENGUIN
            else if(species === 'penguin') {
                if(!back) {
                    drawStandardFace(ctx, eyeCol);
                    ctx.fillStyle = 'orange'; // Beak
                    ctx.beginPath(); ctx.moveTo(28, 28); ctx.lineTo(36, 28); ctx.lineTo(32, 34); ctx.fill();
                    // White Belly override
                    ctx.fillStyle = 'white'; ctx.fillRect(24, 35, 16, 20);
                } else {
                    ctx.fillStyle = 'black'; ctx.fillRect(20, 30, 24, 30); // Black Back
                    ctx.fillStyle = 'black'; ctx.beginPath(); ctx.moveTo(32,45); ctx.lineTo(36,50); ctx.lineTo(28,50); ctx.fill();
                }
            }
        }

        // Helper to keep face sizes consistent across all species
        function drawStandardFace(ctx, eyeCol) {
            ctx.fillStyle='white'; ctx.fillRect(20,18,8,8); ctx.fillRect(36,18,8,8);
            ctx.fillStyle=eyeCol; ctx.fillRect(24,20,4,4); ctx.fillRect(40,20,4,4);
        }

        function drawShirt(ctx, shirtId, isBack, bodyColor) {
            const shirt = SHIRT_TYPES.find(s => s.id === shirtId);
            if (!shirt || shirt.id === 'none') return;

            // BASE BODY FILL
            ctx.fillStyle = shirt.color;    
            ctx.fillRect(20, 34, 24, 24); // Body
            ctx.fillRect(18, 35, 28, 6);  // Shoulders

            // --- TYPES LOGIC ---

            // 1. HOODIE
            if (shirt.type === 'hoodie') {
                if (!isBack) {
                    ctx.fillStyle = '#cccccc';
                    ctx.fillRect(29, 34, 2, 8); // Drawstrings
                    ctx.fillRect(33, 34, 2, 8);
                    
                    ctx.fillStyle = shirt.secondary || 'rgba(0,0,0,0.1)'; 
                    ctx.beginPath(); // Kangaroo Pocket
                    ctx.moveTo(24, 58); ctx.lineTo(40, 58); ctx.lineTo(38, 46); ctx.lineTo(26, 46); ctx.fill();
                } else {
                    ctx.fillStyle = shirt.secondary || shirt.color;
                    if (!shirt.secondary) ctx.filter = 'brightness(85%)';
                    ctx.beginPath(); // Resting Hood
                    ctx.moveTo(22, 34); ctx.quadraticCurveTo(32, 52, 42, 34); ctx.fill();
                    ctx.filter = 'none';
                }
            }

            // 2. CREW NECK (Fixed)
            else if (shirt.type === 'crew') {
                if (!isBack) {
                    ctx.fillStyle = bodyColor; // Paint skin color
                    ctx.fillRect(28, 34, 8, 4); 
                }
            } 

            // 3. COLLARED
            else if (shirt.type === 'collared') {
                if (!isBack) {
                    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(31, 38, 2, 12); 
                    ctx.fillStyle = shirt.color; ctx.filter = 'brightness(80%)'; 
                    ctx.beginPath(); ctx.moveTo(26, 34); ctx.lineTo(32, 40); ctx.lineTo(38, 34); ctx.fill();
                    ctx.filter = 'none';
                }
            }

            // 4. SUIT / TUX
            else if (shirt.type === 'suit' || shirt.type === 'tux') {
                if (!isBack) {
                    ctx.fillStyle = 'white';
                    ctx.beginPath(); ctx.moveTo(32, 34); ctx.lineTo(26, 48); ctx.lineTo(38, 48); ctx.fill();
                    if (shirt.type === 'suit') {
                        ctx.fillStyle = '#cc0000'; 
                        ctx.beginPath(); ctx.moveTo(30, 34); ctx.lineTo(34, 34); ctx.lineTo(33, 46); ctx.lineTo(31, 46); ctx.fill();
                    } else {
                        ctx.fillStyle = 'black'; 
                        ctx.beginPath(); ctx.arc(32, 38, 2, 0, Math.PI*2); ctx.fill(); ctx.fillRect(29, 36, 6, 4);
                    }
                }
            }

            // 5. STRIPED (Fixed)
            else if (shirt.type === 'striped') {
                ctx.fillStyle = shirt.secondary || 'rgba(255,255,255,0.3)';
                for(let i=36; i<58; i+=6) ctx.fillRect(20, i, 24, 2);
                if (!isBack) {
                    ctx.fillStyle = bodyColor; // Paint skin color
                    ctx.fillRect(28, 34, 8, 4);
                }
            }

            // 6. VERTICAL STRIPE (Fixed)
            else if (shirt.type === 'vertical_stripe') {
                ctx.fillStyle = 'black';
                for(let i=22; i<44; i+=6) ctx.fillRect(i, 34, 2, 24);
                if (!isBack) {
                    ctx.fillStyle = bodyColor; 
                    ctx.fillRect(28, 34, 8, 4);
                }
            }

            // 7. CHECKERED
            else if (shirt.type === 'checkered') {
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                for(let i=36; i<58; i+=6) ctx.fillRect(20, i, 24, 2);
                for(let i=22; i<44; i+=6) ctx.fillRect(i, 34, 2, 24);
            }

            // 8. OVERALLS
            else if (shirt.type === 'overalls') {
                ctx.fillStyle = shirt.under || 'white';
                ctx.fillRect(20, 34, 24, 24); ctx.fillRect(18, 35, 28, 6);
                ctx.fillStyle = shirt.color;
                ctx.fillRect(20, 48, 24, 10);
                if (!isBack) {
                    ctx.fillRect(24, 40, 16, 8); ctx.fillRect(24, 34, 2, 10); ctx.fillRect(38, 34, 2, 10);
                    ctx.fillStyle = '#FFD700'; ctx.fillRect(24, 40, 2, 2); ctx.fillRect(38, 40, 2, 2);
                } else {
                    ctx.fillRect(24, 42, 16, 6); 
                    ctx.beginPath(); ctx.moveTo(24, 42); ctx.lineTo(26, 34); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(40, 42); ctx.lineTo(38, 34); ctx.stroke();
                }
            }

            // 9. LOGO TEE (Fixed)
            else if (shirt.type === 'logo') {
                if (!isBack) {
                    ctx.fillStyle = bodyColor; // Paint skin color instead of clearing
                    ctx.fillRect(28, 34, 8, 4); 
                    
                    ctx.fillStyle = 'white'; 
                    ctx.font = '14px serif'; ctx.textAlign = 'center'; ctx.textBaseline='middle';
                    ctx.fillText(shirt.symbol || '?', 32, 46);
                }
            }

            // 10. CAMO
            else if (shirt.type === 'camo') {
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath();
                ctx.arc(24, 38, 3, 0, Math.PI*2); ctx.arc(38, 42, 4, 0, Math.PI*2);
                ctx.arc(28, 52, 3, 0, Math.PI*2); ctx.arc(36, 50, 2, 0, Math.PI*2);
                ctx.fill();
            }

            // 11. FLORAL (Fixed)
            else if (shirt.type === 'floral') {
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                if(!isBack) {
                    const df = (x, y) => {
                        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI*2); ctx.fill();
                        ctx.beginPath(); ctx.arc(x+2, y, 2, 0, Math.PI*2); ctx.fill();
                        ctx.beginPath(); ctx.arc(x, y+2, 2, 0, Math.PI*2); ctx.fill();
                        ctx.beginPath(); ctx.arc(x+2, y+2, 2, 0, Math.PI*2); ctx.fill();
                    };
                    df(24, 40); df(36, 48); df(28, 50);
                    
                    ctx.fillStyle = bodyColor; // Paint skin
                    ctx.fillRect(28, 34, 8, 4);
                }
            }

            // 12. SPECIALS (Fixed Vest)
            else if (shirt.type === 'coat') {
                if(!isBack) {
                    ctx.fillStyle = '#888'; ctx.fillRect(30, 34, 4, 24); 
                    ctx.fillStyle = '#ccc'; ctx.fillRect(22, 40, 6, 1);
                }
            }
            else if (shirt.type === 'vest') {
                // Draw yellow vest stripes first (since base is already orange)
                ctx.fillStyle = 'yellow'; ctx.fillRect(20, 42, 24, 4);
                
                if (!isBack) {
                    // Paint Grey Undershirt Strip instead of clearing
                    ctx.fillStyle = '#888'; 
                    ctx.fillRect(30, 34, 4, 24); 
                }
            }
            else if (shirt.type === 'chain') {
                if (!isBack) {
                    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(32, 34, 6, 0, Math.PI); ctx.stroke();
                }
            }
        }

        function drawCollar(ctx, collarId, isBack) {
            const item = COLLAR_TYPES.find(c => c.id === collarId);
            if (!item || item.id === 'none') return;

            ctx.fillStyle = item.color;

            // --- BASIC / SPIKED / BELL ---
            // Fixed: x=20, width=24 (Matches Body Width)
            if (item.type === 'basic' || item.type === 'spiked' || item.type === 'bell') {
                ctx.fillRect(20, 34, 24, 4);
        
                if (item.type === 'spiked') {
                    ctx.fillStyle = '#ccc';
                    // Adjusted loop to cover full width
                    for(let i=20; i<44; i+=4) {
                         ctx.beginPath(); 
                         ctx.moveTo(i, 34); 
                         ctx.lineTo(i+2, 31); 
                         ctx.lineTo(i+4, 34); 
                         ctx.fill();
                    }
                }
                else if (item.type === 'bell' && !isBack) {
                    ctx.fillStyle = '#FFD700';
                    ctx.beginPath(); ctx.arc(32, 40, 3, 0, Math.PI*2); ctx.fill();
                }
            }
    
            // --- BOW TIE ---
            else if (item.type === 'bow') {
                if (!isBack) {
                    ctx.fillStyle = item.color;
                    ctx.beginPath(); ctx.arc(32, 36, 3, 0, Math.PI*2); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(32,36); ctx.lineTo(24, 32); ctx.lineTo(24, 40); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(32,36); ctx.lineTo(40, 32); ctx.lineTo(40, 40); ctx.fill();
                } else {
                    // Strap on back (Fixed Width)
                    ctx.fillRect(20, 35, 24, 2);
                }
            }
    
            // --- BANDANA ---
            else if (item.type === 'bandana') {
                // Neck strap (Fixed Width)
                ctx.fillRect(20, 34, 24, 3);
                if (!isBack) {
                    ctx.beginPath(); ctx.moveTo(22, 37); ctx.lineTo(42, 37); ctx.lineTo(32, 49); ctx.fill();
                }
            }
    
            // --- SCARF ---
            else if (item.type === 'scarf') {
                ctx.fillRect(20, 33, 24, 5);
                if (!isBack) {
                    ctx.fillRect(36, 38, 6, 12);
                } else {
                     ctx.fillRect(38, 34, 4, 8);
                }
            }
    
            // --- PEARLS ---
            else if (item.type === 'pearls') {
                ctx.fillStyle = 'white';
                // Adjusted loop for full width
                for(let i=20; i<44; i+=4) {
                     ctx.beginPath(); ctx.arc(i+2, 36, 2, 0, Math.PI*2); ctx.fill();
                }
            }
        }

        // Main texture compositing function. Combines species, colors, and all cosmetics into one texture.
        function createSpeciesTexture(species, hex, bellyHex, back, hatId='none', shirtId='none', collarId='none', eyeHex='#000000') {
            const c = document.createElement('canvas'); c.width=64; c.height=64;
            const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled=false;
            const col = new THREE.Color(hex).getStyle();
            const bellyCol = new THREE.Color(bellyHex).getStyle();
            const eyeCol = new THREE.Color(eyeHex).getStyle();

            drawSpecies(ctx, species, col, bellyCol, eyeCol, back);
            
            // UPDATE: Pass 'col' (body color) to drawShirt so it can fix necklines
            drawShirt(ctx, shirtId, back, col); 
            
            drawCollar(ctx, collarId, back); 
            drawHat(ctx, hatId, back);       

            const t = new THREE.CanvasTexture(c); 
            t.magFilter = THREE.NearestFilter;
            t.minFilter = THREE.NearestFilter;
            return t;
        }
		

        function createFishTexture(fishName, colorHex) {
            const c = document.createElement('canvas'); c.width = 64; c.height = 64;
            const ctx = c.getContext('2d');

            let fishData = null;
            if (typeof FISH_TYPES !== 'undefined') {
                fishData = FISH_TYPES.find(f => f.name === fishName);
            }
            const rarity = fishData ? fishData.rarity : "Common";
            const name = fishName.toLowerCase();

            // --- 1. Determine Styles ---
            let fillStyle = colorHex;
            let strokeStyle = '#000000';
            let hasScales = false;
            let hasGlitter = false;
            let hasGlow = false;

            if (rarity === 'Rare') {
                hasScales = true;
            } else if (rarity === 'Epic') {
                hasScales = true; strokeStyle = colorHex; hasGlow = true;
            } else if (rarity === 'Legendary') {
                hasGlitter = true; hasGlow = true;
                const grd = ctx.createLinearGradient(10, 10, 54, 54);
                if (name.includes('golden') || name.includes('gold')) {
                    grd.addColorStop(0, '#FFFFA0'); grd.addColorStop(0.5, '#FFD700'); grd.addColorStop(1, '#B8860B');
                    fillStyle = grd;
                } else if (name.includes('rainbow')) {
                    grd.addColorStop(0, 'red'); grd.addColorStop(0.2, 'orange'); grd.addColorStop(0.4, 'yellow');
                    grd.addColorStop(0.6, 'green'); grd.addColorStop(0.8, 'blue'); grd.addColorStop(1, 'violet');
                    fillStyle = grd;
                } else if (name.includes('void') || name.includes('cosmic')) {
                    grd.addColorStop(0, '#000000'); grd.addColorStop(0.5, '#300030'); grd.addColorStop(1, '#000000');
                    fillStyle = grd; strokeStyle = '#ffffff';
                } else {
                    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, colorHex); grd.addColorStop(1, '#000000');
                    fillStyle = grd;
                }
            }

            // --- 2. Define the Shape (Path2D) ---
            // We use 'p' instead of 'ctx' to define the shape so it doesn't get lost
            const p = new Path2D();

            // TYPE: TURTLE
            if (name.includes('turtle')) {
                p.arc(54, 32, 5, 0, Math.PI * 2); // Head
                p.moveTo(20, 20); p.lineTo(14, 12); p.lineTo(26, 12); // TL
                p.moveTo(20, 44); p.lineTo(14, 52); p.lineTo(26, 52); // BL
                p.moveTo(44, 20); p.lineTo(50, 12); p.lineTo(38, 12); // TR
                p.moveTo(44, 44); p.lineTo(50, 52); p.lineTo(38, 52); // BR
                p.moveTo(14, 32); p.lineTo(6, 28); p.lineTo(6, 36); // Tail
                p.moveTo(50, 32);
                p.ellipse(32, 32, 16, 13, 0, 0, Math.PI * 2); // Shell
            }
            // TYPE: URCHIN
            else if (name.includes('urchin')) {
                p.arc(32, 32, 14, 0, Math.PI * 2);
                for(let i=0; i<12; i++) {
                    const angle = (i / 12) * Math.PI * 2;
                    const sx = 32 + Math.cos(angle) * 14;
                    const sy = 32 + Math.sin(angle) * 14;
                    const ex = 32 + Math.cos(angle) * 22;
                    const ey = 32 + Math.sin(angle) * 22;
                    p.moveTo(sx, sy); p.lineTo(ex, ey);
                }
            }
            // TYPE: SEAHORSE
            else if (name.includes('seahorse')) {
                p.moveTo(54, 18); p.lineTo(48, 18); 
                p.bezierCurveTo(48, 10, 38, 10, 38, 20); 
                p.bezierCurveTo(38, 30, 46, 35, 38, 45); 
                p.bezierCurveTo(30, 55, 24, 50, 28, 45); 
                p.lineTo(26, 45);
                p.bezierCurveTo(20, 55, 32, 60, 44, 45);
                p.bezierCurveTo(52, 30, 44, 25, 44, 20);
            }
            // TYPE: CRAB / LOBSTER
            else if (name.includes('crab') || name.includes('lobster')) {
                p.ellipse(32, 35, 16, 11, 0, 0, Math.PI * 2);
                p.moveTo(20, 35); p.lineTo(8, 22); p.lineTo(14, 18); p.lineTo(10, 16); p.lineTo(6, 20);
                p.moveTo(44, 35); p.lineTo(56, 22); p.lineTo(50, 18); p.lineTo(54, 16); p.lineTo(58, 20);
                p.moveTo(18, 40); p.lineTo(8, 45);
                p.moveTo(22, 44); p.lineTo(14, 50);
                p.moveTo(46, 40); p.lineTo(56, 45);
                p.moveTo(42, 44); p.lineTo(50, 50);
            }
            // TYPE: SQUID / JELLY
            else if (name.includes('squid') || name.includes('jelly') || name.includes('kraken')) {
                p.moveTo(20, 45);
                p.bezierCurveTo(20, 10, 44, 10, 44, 45);
                for(let x=44; x>=20; x-=4) {
                    p.lineTo(x-2, 58);
                    p.lineTo(x-4, 45);
                }
                p.closePath();
            }
            // TYPE: EEL / SERPENT
            else if (name.includes('eel') || name.includes('serpent') || name.includes('worm')) {
                p.moveTo(54, 15);
                p.bezierCurveTo(10, 10, 10, 50, 50, 50);
                p.bezierCurveTo(30, 50, 30, 30, 54, 30);
                p.arc(54, 22.5, 7.5, -Math.PI/2, Math.PI/2);
            }
            // TYPE: RAY / MANTA
            else if (name.includes('ray') || name.includes('skate') || name.includes('manta')) {
                p.moveTo(32, 10); p.lineTo(60, 32); p.lineTo(32, 54); p.lineTo(4, 32); p.closePath();
                p.moveTo(32, 54); p.lineTo(32, 64); // Tail
            }
            // TYPE: SHARK / WHALE
            else if (name.includes('shark') || name.includes('whale') || name.includes('orca')) {
                const isWhale = name.includes('whale') || name.includes('orca');
                p.moveTo(58, 32);
                p.quadraticCurveTo(32, isWhale ? 10 : 15, 8, 25);
                p.lineTo(2, 15); p.lineTo(2, 45); p.lineTo(8, 35);
                p.quadraticCurveTo(32, 50, 58, 32);
            }
            // TYPE: SWORDFISH
            else if (name.includes('sword') || name.includes('marlin') || name.includes('pike')) {
                p.moveTo(64, 30); p.lineTo(44, 26); p.lineTo(10, 26);
                p.lineTo(4, 20); p.lineTo(4, 40); p.lineTo(10, 34);
                p.lineTo(44, 34); p.lineTo(64, 30);
            }
            // TYPE: STANDARD (Default)
            else {
                p.moveTo(56, 32);
                p.quadraticCurveTo(44, 20, 32, 20);
                p.lineTo(36, 12); p.lineTo(24, 14); p.lineTo(28, 20);
                p.quadraticCurveTo(16, 20, 14, 28);
                p.lineTo(4, 18); p.lineTo(4, 46); p.lineTo(14, 36);
                p.quadraticCurveTo(16, 44, 32, 44);
                p.lineTo(28, 50); p.lineTo(36, 48); p.lineTo(32, 44);
                p.quadraticCurveTo(44, 44, 56, 32);
            }

            // --- 3. Draw the Body (Using the saved 'p') ---
            ctx.fillStyle = fillStyle;
            if (hasGlow) {
                ctx.shadowColor = strokeStyle;
                ctx.shadowBlur = rarity === 'Legendary' ? 15 : 8;
            }
            ctx.fill(p);
            ctx.shadowBlur = 0;

            // --- 4. Apply Effects (Scales, etc) ---
            ctx.save();
            ctx.clip(p); // Clip to the fish shape

            // Draw Scales (FIXED: This no longer destroys the body path)
            if (hasScales || name.includes('dragon')) {
                ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
                for (let y = 10; y < 60; y += 4) {
                    for (let x = 10; x < 60; x += 4) {
                        ctx.beginPath(); ctx.arc(x + (y % 8 == 0 ? 2 : 0), y, 2, 0, Math.PI); ctx.stroke();
                    }
                }
            }

            // Shine
            if (rarity === 'Uncommon' || rarity === 'Epic') {
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.beginPath(); ctx.ellipse(32, 24, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
            }

            // Glitter
            if (hasGlitter) {
                ctx.fillStyle = '#ffffff';
                for (let i = 0; i < 10; i++) {
                    const rx = Math.random() * 64; const ry = Math.random() * 64;
                    ctx.beginPath(); ctx.arc(rx, ry, Math.random() * 1.5, 0, Math.PI * 2); ctx.fill();
                }
            }
            ctx.restore();

            // --- 5. Draw Outline (Last, so it's on top) ---
            ctx.lineWidth = 2;
            ctx.strokeStyle = strokeStyle;
            ctx.stroke(p);

            // --- 6. Draw Eyes (Overlay) ---
            if (!name.includes('urchin') && !name.includes('ray') && !name.includes('manta')) {
                const isSeahorse = name.includes('seahorse');
                const eyeX = isSeahorse ? 48 : (name.includes('sword') ? 42 : 46);
                const eyeY = isSeahorse ? 15 : 28;
        
                ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(eyeX, eyeY, 3, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(eyeX+1, eyeY, 1, 0, Math.PI * 2); ctx.fill();
        
                if (name.includes('crab') || name.includes('lobster') || name.includes('squid')) {
                     // Draw second eye for these types
                     const off = name.includes('squid') ? 8 : 12;
                     ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(eyeX-off, eyeY, 3, 0, Math.PI * 2); ctx.fill();
                     ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(eyeX-off, eyeY, 1, 0, Math.PI * 2); ctx.fill();
                }
            }

            const t = new THREE.CanvasTexture(c);
            t.magFilter = THREE.NearestFilter;
            t.minFilter = THREE.NearestFilter;
            return t;
        }

        function createNameTagTexture(n) {
            const c = document.createElement('canvas'); c.width=256; c.height=64;
            const x = c.getContext('2d'); x.font='bold 32px Arial'; x.textAlign='center';
            x.fillStyle='black'; x.fillText(n,128,44); x.fillStyle='white'; x.fillText(n,126,42);
            const t = new THREE.CanvasTexture(c);
            // PIXEL FIX
            t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
            return t;
        }

        function createTitleTexture(titleId) {
            const tObj = TITLE_TYPES.find(t => t.id === titleId) || TITLE_TYPES[0];
            const text = tObj.text;
            if (!text) return null; 

            const c = document.createElement('canvas'); c.width=256; c.height=64;
            const x = c.getContext('2d');
            x.font = 'italic bold 24px Arial'; x.textAlign = 'center';
            x.fillStyle = tObj.color || '#87CEEB'; x.strokeStyle = 'black'; x.lineWidth = 4;
            x.strokeText(`< ${text} >`, 128, 50); x.fillText(`< ${text} >`, 128, 50);
            const t = new THREE.CanvasTexture(c);
            // PIXEL FIX
            t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
            return t;
        }
        
		function createRodTexture(rodId) {
			const c = document.createElement('canvas'); c.width = 64; c.height = 64;
			const ctx = c.getContext('2d');
			
			// Find Rod Data
			let rod = ROD_TYPES.find(r => r.id === rodId);
			if (!rod) rod = ROD_TYPES[0]; // Fallback to bamboo

			// Draw Rod (Diagonal: Bottom-Left to Top-Right)
			ctx.strokeStyle = rod.color; 
			ctx.lineWidth = 4; 
			ctx.lineCap = 'round';
			
			ctx.beginPath(); 
			ctx.moveTo(4, 60); // Handle
			ctx.lineTo(60, 4); // Tip
			ctx.stroke();

			// Fancy Effects for specific rods
			if (rod.id === 'candy' || rod.id === 'rainbow') {
				ctx.strokeStyle = 'rgba(255,255,255,0.5)';
				ctx.setLineDash([5, 5]);
				ctx.beginPath(); ctx.moveTo(4, 60); ctx.lineTo(60, 4); ctx.stroke();
				ctx.setLineDash([]);
			}

			// Reel
			ctx.fillStyle = rod.reel; 
			ctx.beginPath(); ctx.arc(12, 52, 5, 0, Math.PI*2); ctx.fill();
			ctx.fillStyle = '#ccc'; 
			ctx.beginPath(); ctx.arc(12, 52, 2, 0, Math.PI*2); ctx.fill();

			// Guides (Rings)
			ctx.fillStyle = '#aaa'; 
			ctx.fillRect(18, 46, 3, 3);
			ctx.fillRect(32, 32, 3, 3);
			ctx.fillRect(46, 18, 3, 3);

			const t = new THREE.CanvasTexture(c);
			t.magFilter = THREE.NearestFilter; 
			t.minFilter = THREE.NearestFilter;
			return t;
		}

		function createPlayerMesh(col, name, hatId='none', eyeHex='#000000', species='cat', titleId='none', rodId='bamboo') {
			const g = new THREE.Group();

			// Sprite Layers
			const tf = createSpeciesTexture(species, col, '#ffffff', false, hatId, 'none', 'none', eyeHex); 
			const tb = createSpeciesTexture(species, col, '#ffffff', true, hatId, 'none', 'none', eyeHex);
			const m1 = new THREE.MeshBasicMaterial({map:tf, transparent:true, side:THREE.DoubleSide, alphaTest:0.5});
			const m2 = new THREE.MeshBasicMaterial({map:tb, transparent:true, side:THREE.DoubleSide, alphaTest:0.5});
			const s = new THREE.Mesh(new THREE.PlaneGeometry(2,2), m1);
			s.position.y=1.0; s.name="playerSprite"; s.userData={matFront:m1, matBack:m2}; 
			g.add(s);

			// Name & Title
			const nt = new THREE.Sprite(new THREE.SpriteMaterial({map:createNameTagTexture(name)}));
			nt.position.y=2.1; nt.scale.set(3,0.75,1); nt.name="nameTag"; 
			g.add(nt);

			const tTex = createTitleTexture(titleId);
			if (tTex) {
				const titleSprite = new THREE.Sprite(new THREE.SpriteMaterial({map:tTex}));
				titleSprite.position.y = 2.5; titleSprite.scale.set(3, 0.75, 1); 
				titleSprite.name = "titleSprite";
				titleSprite.visible = saveState.showTitles; 
				g.add(titleSprite);
			}

			const st = createSpeakerTexture();
			const sm = new THREE.SpriteMaterial({map:st, transparent:true});
			const sp = new THREE.Sprite(sm);
			sp.position.y=3.0; sp.scale.set(0.5,0.5,1); sp.name="talkingIcon"; sp.visible=false;
			g.add(sp);

			// --- ROD LOGIC (FORWARD FACING) ---
			const rodTex = createRodTexture();
			const rodMat = new THREE.MeshBasicMaterial({ map: rodTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
			
			// Geometry 3x3
			const rodGeo = new THREE.PlaneGeometry(3.0, 3.0);
			
			// 1. Shift Pivot to Bottom-Left Corner (The Handle)
			rodGeo.translate(1.5, 1.5, 0); 

			const r = new THREE.Mesh(rodGeo, rodMat);
			
			// 2. Position at Right Hand
			// x=0.6 (Right shoulder), y=0.8 (Hand height), z=0.1 (Slightly forward)
			r.position.set(0.6, 0.8, 0.1); 
			
			// 3. Rotation
			// Y = -90 degrees (-1.57 rad): Points the flat plane forward (Z-axis).
			// The "Diagonal" texture now points Forward and Up.
			// We tilt X slightly (-0.2) to angle it outward.
			r.rotation.set(-0.2, -Math.PI/2, 0); 
			
			r.name = "rod"; 
			g.add(r);

			return g;
		}
				
        function createLocalPlayer() {
            player = createPlayerMesh(saveState.catColor, saveState.displayName, saveState.currentHat, saveState.eyeColor, saveState.species, saveState.currentTitle);
            updateLocalVisuals();
            player.position.set(25,0,0); scene.add(player);
        }

        function renderKeybinds() {
            let container = document.getElementById('keybinds-container');
    
            // If it doesn't exist yet, create the container inside options-container
            if(!container) {
                const optionsDiv = document.getElementById('options-container');
        
                // Create separator
                const hr = document.createElement('hr');
                hr.style.border = '0'; hr.style.borderTop = '1px solid #444'; hr.style.margin = '15px 0';
                optionsDiv.insertBefore(hr, optionsDiv.lastElementChild.previousElementSibling); // Insert before buttons

                const h3 = document.createElement('h3');
                h3.innerText = "Key Bindings";
                h3.style.marginTop = '0';
                optionsDiv.insertBefore(h3, optionsDiv.lastElementChild.previousElementSibling);

                container = document.createElement('div');
                container.id = 'keybinds-container';
                container.style.maxHeight = '200px';
                container.style.overflowY = 'auto';
                container.style.marginBottom = '15px';
                container.style.paddingRight = '5px';
                optionsDiv.insertBefore(container, optionsDiv.lastElementChild.previousElementSibling);

                // Reset Button
                const btnReset = document.createElement('button');
                btnReset.className = 'btn-sm btn-danger';
                btnReset.innerText = "Reset Defaults";
                btnReset.style.width = "100%";
                btnReset.style.marginBottom = "10px";
                btnReset.onclick = resetKeybinds;
                optionsDiv.insertBefore(btnReset, optionsDiv.lastElementChild.previousElementSibling);
            }

            container.innerHTML = '';

            Object.keys(saveState.keybinds).forEach(action => {
                const row = document.createElement('div');
                row.className = 'control-row';

                const label = document.createElement('span');
                label.className = 'control-label';
                label.innerText = action;

                const btn = document.createElement('button');
                btn.className = 'key-btn';
                // Clean up the display text (remove 'Key', 'Digit', etc)
                let keyDisplay = saveState.keybinds[action].replace('Key', '').replace('Digit', '');
                if(keyDisplay === 'Space') keyDisplay = 'SPACE';
                btn.innerText = keyDisplay;
        
                btn.onclick = () => startRebind(action, btn);

                row.appendChild(label);
                row.appendChild(btn);
                container.appendChild(row);
            });
        }

        function startRebind(action, btnElement) {
            btnElement.innerText = "PRESS KEY";
            btnElement.classList.add('listening');
    
            // Remove old listeners just in case
            document.removeEventListener('keydown', handleRebind);
    
            // Define the temporary handler
            window.rebindAction = action;
            window.rebindBtn = btnElement;
    
            document.addEventListener('keydown', handleRebind);
        }

        function handleRebind(e) {
            e.preventDefault();
            e.stopPropagation();

            const action = window.rebindAction;
            const btn = window.rebindBtn;
    
            // Don't bind Escape if it's not the menu action (to allow cancelling)
            if(e.code === 'Escape' && action !== 'menu') {
                document.removeEventListener('keydown', handleRebind);
                renderKeybinds(); // Cancel
                return;
            }

            // Save
            saveState.keybinds[action] = e.code;
            saveGame();
    
            // Cleanup
            document.removeEventListener('keydown', handleRebind);
            renderKeybinds();
        }

        function resetKeybinds() {
            if(confirm("Reset all controls to default?")) {
                saveState.keybinds = { ...DEFAULT_KEYBINDS };
                saveGame();
                renderKeybinds();
            }
        }
        
        function updateSpriteDirection(obj, targetCamPos) {
            const sprite = obj.getObjectByName("playerSprite");
            if(!sprite || !sprite.userData.matFront) return;
            
            
            const toCam = new THREE.Vector3().subVectors(targetCamPos, obj.position);
            toCam.y = 0; 
            toCam.normalize();

            
            const facing = new THREE.Vector3();
            obj.getWorldDirection(facing);
            facing.y = 0;
            facing.normalize();

            
            if (toCam.dot(facing) > 0) sprite.material = sprite.userData.matFront;
            else sprite.material = sprite.userData.matBack;
        }

		function setupInputs() {
            const ci = document.getElementById('chat-input');
            
            // Chat Fade Logic
            ci.addEventListener('focus', () => {
                const ui = document.getElementById('chat-ui');
                if(ui) ui.style.opacity = '1';
                if(chatFadeTimer) clearTimeout(chatFadeTimer);
            });
            ci.addEventListener('blur', () => {
                refreshChatFade(); 
            });
    
            document.onkeydown = e => {
                const k = saveState.keybinds;
                
                // Chat Focus Logic
                if(document.activeElement === ci) { 
                    if(e.code === 'Enter' || e.key === 'Enter') {
                        sendChatMessage(ci.value);
                        ci.value = '';
                        ci.blur(); 
                        if(isMobile) document.getElementById('chat-ui').style.display='none';
                    } 
                    else if(e.code === 'Escape') { 
                        ci.blur(); 
                        refreshChatFade();
                        return; 
                    }
                    return; 
                }

                if(document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
                if(e.code === k.menu) { toggleOptions(); return; }
        
                // Movement
                if(e.code === k.forward) controls.forward=true; 
                if(e.code === k.backward) controls.backward=true; 
                if(e.code === k.left) controls.left=true; 
                if(e.code === k.right) controls.right=true; 
                if(e.code === k.jump) controls.jump=true; 
                
                // Interaction (Desktop)
                if(e.code === k.interact) {
                    if(canSell) sellFish();
                    else if(interactTarget === 'stylist') toggleShop();
                    else if(interactTarget === 'bait') toggleBaitShop();
                    else if(interactTarget === 'builder') togglePropShop();
                    else if(interactTarget === 'lava_keeper') {
                        if (saveState.lavaUnlocked) {
                            enterLavaWorld();
                        } else {
                            if (saveState.money >= 20000) {
                                if (confirm("Buy Lava World Access for $20,000?")) {
                                    saveState.money -= 20000;
                                    saveState.lavaUnlocked = true;
                                    saveGame();
                                    Sound.sell();
                                    showToast("Lava World Unlocked!");
                                    enterLavaWorld();
                                }
                            } else {
                                showToast("Need $20,000 to unlock!");
                            }
                        }
                    }
                }

                // --- NEW PROP HOTKEYS ---
                if (e.code === 'KeyP') requestPlaceProp();
                if (e.code === 'KeyO') requestUndoProp();

                // --- TOOLS ---
                if(e.code === k.voice) toggleMic();
                if(e.code === k.guitar) toggleGuitar();
                if(e.code === k.glove) toggleGlove();
                if(e.code === k.showFish) toggleShowFish();
                if(e.code === 'KeyN') toggleEmptyHands(); // 'N' for Nothing/Empty

                // Meow
                if(e.code === k.meow && !e.repeat) {
                    const variant = Math.floor(Math.random()*3); 
                    broadcastSound('meow', variant); 
                }

                // Open Chat
                if((e.code === k.chat || e.key === k.chat) && !isMobile) { 
                    ci.focus(); e.preventDefault(); 
                }
            };

            document.onkeyup = e => {
                const k = saveState.keybinds;
                if(e.code === k.forward) controls.forward=false; 
                if(e.code === k.backward) controls.backward=false; 
                if(e.code === k.left) controls.left=false; 
                if(e.code === k.right) controls.right=false; 
                if(e.code === k.jump) controls.jump=false;
            };
    
            document.onmousemove = e => {
                if(isRightMouseDown) {
                    cameraRotationY -= e.movementX * 0.002; 
                    cameraRotationX += e.movementY * 0.002;
                    cameraRotationX = Math.max(-Math.PI/3, Math.min(Math.PI/3, cameraRotationX));
                }
            };
    
            document.onmousedown = e => {
                if(isMobile) return;
                if(e.target === ci || e.target.closest('.btn') || e.target.closest('.overlay-screen') || e.target.closest('.stat-row') || e.target.closest('#bait-ui')) return; 
                if(audioCtx.state === 'suspended') audioCtx.resume();
                if(e.button === 0) { isLeftMouseDown = true; handleAction(true); } 
                else if(e.button === 2) { isRightMouseDown = true; renderer.domElement.requestPointerLock(); }
            };

            document.onmouseup = e => { 
                if(!isMobile) { 
                    if(e.button === 0) { isLeftMouseDown = false; handleAction(false); } 
                    else if(e.button === 2) { isRightMouseDown = false; document.exitPointerLock(); }
                }
            };
    
            document.onwheel = (e) => {
                const isMenuOpen = document.querySelector('.overlay-screen[style*="flex"]');
                const isHoveringUI = e.target.closest('#fish-log') || e.target.closest('#chat-messages') || e.target.closest('#host-player-list');
                if (isMenuOpen || isHoveringUI) return;
                cameraDistance += e.deltaY * 0.005; 
                cameraDistance = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cameraDistance));
            };
    
            // --- MOBILE JOYSTICK ---
            const jz=document.getElementById('joystick-zone'); const jk=document.getElementById('joystick-knob');
            let jid=null, jc={x:0,y:0};
    
            jz.ontouchstart=e=>{
                e.preventDefault(); e.stopPropagation(); 
                const t=e.changedTouches[0]; 
                jid=t.identifier; 
                const r=jz.getBoundingClientRect(); 
                jc={x:r.left+r.width/2,y:r.top+r.height/2}; 
                updateJoy(t.clientX,t.clientY);
            };
    
            jz.ontouchmove=e=>{
                e.preventDefault(); e.stopPropagation(); 
                for(let i=0;i<e.changedTouches.length;i++) {
                    if(e.changedTouches[i].identifier===jid) updateJoy(e.changedTouches[i].clientX,e.changedTouches[i].clientY);
                }
            };
    
            jz.ontouchend=e=>{
                e.preventDefault(); e.stopPropagation();
                for(let i=0;i<e.changedTouches.length;i++) {
                    if(e.changedTouches[i].identifier===jid){
                        jk.style.transform='translate(0,0)'; 
                        controls={forward:false,backward:false,left:false,right:false,jump:false}; 
                        jid=null;
                    }
                }
            };

            function updateJoy(x,y){
                let dx=x-jc.x, dy=y-jc.y; const d=Math.sqrt(dx*dx+dy*dy);
                if(d>40){dx=(dx/d)*40; dy=(dy/d)*40;}
                jk.style.transform=`translate(${dx}px,${dy}px)`;
                controls.forward = dy < -10; 
                controls.backward = dy > 10; 
                controls.left = dx < -10; 
                controls.right = dx > 10;
            }

            // --- MOBILE CAMERA ---
            let cid=null, lcx=0, lcy=0;
            
            document.body.ontouchstart=e=>{
                if(audioCtx.state === 'suspended') audioCtx.resume();
                if(e.target.closest('.touch-zone') || e.target.closest('#room-info-ui') || e.target.closest('.btn') || e.target.tagName === 'INPUT') return;
                
                if(e.cancelable) e.preventDefault();

                if (cid === null && e.changedTouches.length > 0) {
                    const t = e.changedTouches[0];
                    cid = t.identifier;
                    lcx = t.clientX;
                    lcy = t.clientY;
                }
            };
    
            document.body.ontouchmove=e=>{
                if(e.target.closest('.touch-zone')) return;
                if(e.cancelable) e.preventDefault();

                for(let i=0; i<e.changedTouches.length; i++) {
                    if(e.changedTouches[i].identifier === cid){
                        const t = e.changedTouches[i];
                        cameraRotationY -= (t.clientX - lcx) * 0.005; 
                        cameraRotationX += (t.clientY - lcy) * 0.005;
                        cameraRotationX = Math.max(-Math.PI/3, Math.min(Math.PI/3, cameraRotationX));
                        
                        lcx = t.clientX; 
                        lcy = t.clientY;
                    }
                }
            };
            
            document.body.ontouchend = e => {
                for(let i=0; i<e.changedTouches.length; i++) {
                    if(e.changedTouches[i].identifier === cid) {
                        cid = null;
                    }
                }
            };
            document.body.ontouchcancel = document.body.ontouchend;
            
            // --- MOBILE BUTTONS ---
            const stopCam = (e) => { e.preventDefault(); e.stopPropagation(); };
            const btnAct = document.getElementById('btn-action');
            
            // --- UPDATED MOBILE ACTION HANDLER ---
            btnAct.ontouchstart = e => {
                stopCam(e); 
                if(canSell) sellFish();
                else if(interactTarget === 'stylist') toggleShop();
                else if(interactTarget === 'bait') toggleBaitShop();
                else if(interactTarget === 'builder') togglePropShop();
                
                // --- ADDED LAVA KEEPER CHECK FOR MOBILE ---
                else if(interactTarget === 'lava_keeper') {
                    if (saveState.lavaUnlocked) {
                        enterLavaWorld();
                    } else {
                        if (saveState.money >= 20000) {
                            if (confirm("Buy Lava World Access for $20,000?")) {
                                saveState.money -= 20000;
                                saveState.lavaUnlocked = true;
                                saveGame();
                                Sound.sell();
                                showToast("Lava World Unlocked!");
                                enterLavaWorld();
                            }
                        } else {
                            showToast("Need $20,000 to unlock!");
                        }
                    }
                }
                // ------------------------------------------
                
                else { isLeftMouseDown = true; handleAction(true); }
            };
            
            btnAct.ontouchend = e => { stopCam(e); isLeftMouseDown = false; if(!canSell && interactTarget === null) handleAction(false); };
            btnAct.ontouchmove = stopCam; 

            const btnJump = document.getElementById('btn-jump');
            btnJump.ontouchstart = e => { stopCam(e); controls.jump=true; };
            btnJump.ontouchend = e => { stopCam(e); controls.jump=false; };
            btnJump.ontouchmove = stopCam; 

            const btnGuitar = document.getElementById('btn-mobile-guitar');
            if(btnGuitar) { btnGuitar.ontouchstart = e => { stopCam(e); toggleGuitar(); }; btnGuitar.ontouchmove = stopCam; }

            const btnGlove = document.getElementById('btn-mobile-glove');
            if(btnGlove) { btnGlove.ontouchstart = e => { stopCam(e); toggleGlove(); }; btnGlove.ontouchmove = stopCam; }

            const btnShowFish = document.getElementById('btn-mobile-show-fish');
            if(btnShowFish) { btnShowFish.ontouchstart = e => { stopCam(e); toggleShowFish(); }; btnShowFish.ontouchmove = stopCam; }

            // --- PROP BUTTONS ---
            const btnPlace = document.getElementById('btn-mobile-place');
            if(btnPlace) { 
                btnPlace.ontouchstart = e => { stopCam(e); requestPlaceProp(); }; 
                btnPlace.ontouchmove = stopCam; 
            }

            const btnUndo = document.getElementById('btn-mobile-undo');
            if(btnUndo) { 
                btnUndo.ontouchstart = e => { stopCam(e); requestUndoProp(); }; 
                btnUndo.ontouchmove = stopCam; 
            }

            // --- EMPTY HANDS BUTTON ---
            const btnEmpty = document.getElementById('btn-mobile-empty');
            if(btnEmpty) { 
                btnEmpty.ontouchstart = e => { stopCam(e); toggleEmptyHands(); }; 
                btnEmpty.ontouchmove = stopCam; 
            }

            // --- TOGGLES ---
            const btnChatM = document.getElementById('chat-toggle-mobile');
            if(btnChatM) {
                btnChatM.ontouchstart = (e) => { 
                    stopCam(e); 
                    const ui = document.getElementById('chat-ui');
                    ui.style.display = ui.style.display === 'none' ? 'flex' : 'none';
                    if(ui.style.display === 'flex') {
                        ui.style.opacity = '1';
                        document.getElementById('chat-input').focus();
                    }
                };
            }
    
            const btnMicM = document.getElementById('mic-toggle-mobile');
            if(btnMicM) { btnMicM.ontouchstart = (e) => { stopCam(e); toggleMic(); }; }

            const btnFull = document.getElementById('btn-fullscreen-mobile');
            if(btnFull) {
                btnFull.ontouchstart = (e) => { stopCam(e); toggleFullScreen(); };
            }
       }

        function handleAction(down) {
            
            // --- NEW: COOLDOWN CHECK ---
            if (Date.now() - lastCatchTime < 500) { 
                if (down) showToast("Catch Cooldown Active!");
                return;
            }
            // ---------------------------

            // --- AUTO-EQUIP ROD IF HANDS EMPTY ---
            if (isHandsHidden) {
                if (down) {
                    isHandsHidden = false;
                    updateLocalVisuals();
                    showToast("Rod Equipped");
                    return; // Don't fish immediately
                }
                return;
            }

            if (isGuitarActive) {
                if (down) showToast("Can't fish while playing guitar!");
                return;
            }
            
            if (isGloveActive) {
                if (down) performPunch();
                return;
            }

            if(down) {
                // If holding a fish to show off, clear it when clicking
                if (localHeldFish) {
                    localHeldFish = null;
                    if (fishHoldTimer) clearTimeout(fishHoldTimer);
                    fishHoldTimer = null;
                    updateLocalVisuals();
                }

                if(fishingState==='idle') { 
                    fishingState='charging'; 
                    chargeStart=Date.now(); 
                    castMarker.visible=true; 
                }
                
                else if(fishingState === 'reeling') {
                    // Anti-Cheat / Click Rate Limit
                    const now = Date.now();
                    minigame.clickHistory.push(now);
                    minigame.clickHistory = minigame.clickHistory.filter(t => now - t < 1000);
                    
                    if (minigame.clickHistory.length > 24) {
                        stopFishing(false, "⚠ Anti-Cheat: Clicking too fast!");
                        return;
                    }

                    broadcastSound('reel');
                    minigame.currentClicks++;
                    
                    if(minigame.currentClicks >= minigame.clicksNeeded) {
                        stopFishing(true);
                    }
                    
                    // Shake Effect
                    const ui = document.getElementById('minigame-ui');
                    ui.style.transform = `translate(-50%, -50%) rotate(${Math.random()*4 - 2}deg) scale(1.05)`;
                    setTimeout(() => ui.style.transform = 'translate(-50%, -50%) scale(1)', 50);

                    updateMinigameUI();
                } 
                
                else if(fishingState==='waiting') stopFishing(false, "Too early!");
                else if(fishingState==='biting') startMinigame();
            } else {
                if(fishingState==='charging') releaseCast();
            }
        }

       function releaseCast() {
			const targetPos = castMarker.position;
			const dist = Math.sqrt(targetPos.x * targetPos.x + targetPos.z * targetPos.z);
			const distToSecret = Math.sqrt(targetPos.x * targetPos.x + (targetPos.z - -95) * (targetPos.z - -95));

			if (isInVoid) {
				fishingZone = 'void';
			} 
			else if (isInLavaWorld) {
				fishingZone = 'lava';
			}
			else if (distToSecret < 12) {
				fishingZone = 'secret';
			} else if (dist < LAKE_RADIUS) {
				fishingZone = 'lake';
			} else {
				stopFishing(false, "Can't fish on land!");
				return;
			}

			if(activeBaitId !== 'none') {
				if(saveState.baitInventory[activeBaitId] > 0) {
					saveState.baitInventory[activeBaitId]--;
					saveGame();
					updateBaitSelector();
				} else {
					activeBaitId = 'none';
					updateBaitSelector();
					showToast("Out of bait!");
				}
			}

			broadcastSound('cast');
			fishingState='casting'; castMarker.visible=false;
			lastCastPos.copy(targetPos);
			createBobber(targetPos);

			const rod = player.getObjectByName("rod"); 
			if(rod) {
				// ANIMATION: Rotate X forward to point tip down towards water
				// Base is -0.2. We rotate to +0.8
				rod.rotation.x = 0.8; 
			}
			
			setTimeout(()=>{fishingState='waiting'; scheduleBite();}, 500);
		}

       function createBobber(targetPos) {
            if(bobber) scene.remove(bobber);
    
            // Create a simple red sphere
            bobber = new THREE.Mesh(
                new THREE.SphereGeometry(0.2), 
                new THREE.MeshBasicMaterial({color:0xff0000})
            );
    
            // Set position
            bobber.position.copy(targetPos);
    
            // Save initial Y for the bobbing animation in the game loop
            bobberInitialY = targetPos.y;
    
            scene.add(bobber);
        }

        function performPunch() {
            const now = Date.now();
            if(now - lastPunchTime < 400) return; 
            lastPunchTime = now;

            animatePunch(player);
            broadcastSound('punch');

            // 1. Send Animation
            const animMsg = { type: 'anim', anim: 'punch' };
            if(isHost) broadcastToClients(animMsg); 
            else if (hostConn && hostConn.open) hostConn.send(animMsg);
            else if (isConnectedToDedicated && dedicatedSocket) dedicatedSocket.send(JSON.stringify(animMsg));

            // 2. Check Hit Logic
            Object.keys(otherPlayers).forEach(pid => {
                const p = otherPlayers[pid];
                const dist = player.position.distanceTo(p.mesh.position);

                if (dist < 3.5) { 
                    const los = checkLineOfSight(player.position, p.mesh.position);
                    if (los.blocked) return; 

                    const dir = new THREE.Vector3().subVectors(p.mesh.position, player.position).normalize();
                    showToast(`🥊 POW! You punched ${p.lastData.name}!`);

                    const hitMsg = { 
                        type: 'punch_hit', 
                        targetId: pid, 
                        force: { x: dir.x * 20, z: dir.z * 20 } 
                    };

                    // Send Hit Event
                    if(isHost) handleHit(hitMsg); 
                    else if (hostConn && hostConn.open) hostConn.send(hitMsg);
                    else if (isConnectedToDedicated && dedicatedSocket) dedicatedSocket.send(JSON.stringify(hitMsg));
                }
            });
        }

        function handleHit(data) {
            // FIX: Check if the target matches our Peer ID OR our Dedicated Server ID
            if (data.targetId === myPeerId || (isConnectedToDedicated && data.targetId === dedicatedId)) {
                
                knockbackVelocity.x = data.force.x;
                knockbackVelocity.z = data.force.z;
                knockbackVelocity.y = 5; 
        
                showToast("💥 OOF! You got punched!");
                broadcastSound('punch'); 
            } 
            
            else if (isHost) {
                const conn = clientConns[data.targetId];
                if (conn && conn.open) {
                    conn.send(data);
                }
            }
        }

        function animatePunch(mesh) {
            const glove = mesh.getObjectByName('gloveMesh');
            if(!glove) return;
    
            
            const originalZ = 0.5;
            const punchZ = 1.5;
    
            
            let startTime = Date.now();
            function loop() {
                let p = (Date.now() - startTime) / 100; 
                if(p > 2) {
                    glove.position.z = originalZ; 
                    return;
                }
        
                
                if (p < 1) glove.position.z = originalZ + (punchZ - originalZ) * p;
                else glove.position.z = punchZ - (punchZ - originalZ) * (p - 1);
        
                glove.position.y = 1.0 + Math.random()*0.1; 
                requestAnimationFrame(loop);
            }
            loop();
        }

        function scheduleBite(){ biteTimer=setTimeout(()=>{if(fishingState==='waiting'){fishingState='biting'; bobber.material.color.setHex(0xffff00); bobber.position.y=-0.5; playSnagSound(); setTimeout(()=>{if(fishingState==='biting')stopFishing(false, "Got away!");}, 1500);}}, 2000+Math.random()*3000); }
        function startMinigame() { 
            fishingState = 'reeling'; 
            minigame.active = true; 
            minigame.targetFish = selectFish(); 
            
            minigame.clickHistory = []; 

            // Base Difficulty (Standard World)
            let clicks = 15;
            let time = 5.0; 

            const r = minigame.targetFish.rarity;
            if(r === 'Common') { clicks = 15; time = 5.0; }
            else if(r === 'Uncommon') { clicks = 30; time = 4.5; }
            else if(r === 'Rare') { clicks = 55; time = 4.0; }
            else if(r === 'Epic') { clicks = 90; time = 3.5; }
            else if(r === 'Legendary') { clicks = 120; time = 3.0; } 

            // Tier Modifiers (Shiny/Gold)
            const tier = minigame.targetFish.tierId; 
            if(tier === 'glistening') { clicks += 20; time -= 0.2; } 
            else if (tier === 'shining') { clicks += 50; time -= 0.5; } 
            else if (tier === 'opalescent') { clicks += 80; time -= 1.0; }

            // --- NEW: LAVA WORLD DIFFICULTY MODIFIER ---
            if (minigame.targetFish.isLava) {
                // DEFAULT PENALTY: 
                // Double the clicks needed and reduce time by 30%.
                // This makes it extremely hard with basic gear.
                clicks *= 2.0;
                time *= 0.7;

                // BAIT MITIGATION: 
                // High tier bait neutralizes the penalty significantly.
                // 'jig' ($5000), 'shrimp' ($8000), 'magic' ($15000)
                const b = activeBaitId;
                if (b === 'magic' || b === 'shrimp' || b === 'jig') {
                    clicks *= 0.6; // Reduces multiplier to ~1.2x (Manageable)
                    time *= 1.2;   // Gathers some time back
                } else if (b === 'grub' || b === 'spinner') {
                    clicks *= 0.8; // Reduces multiplier to ~1.6x (Still hard)
                }
                
                // ROD MITIGATION: 
                // Having the Magma Rod (or better) helps handle the heat.
                const rod = saveState.currentRod;
                if (rod === 'lava' || rod === 'admin' || rod === 'golden' || rod === 'diamond' || rod === 'omega_milestone') {
                    clicks *= 0.85;
                    time *= 1.1;
                }
            }
            // -------------------------------------------

            const bait = BAIT_TYPES.find(b => b.id === activeBaitId);
            const timeBonus = bait ? (bait.power * 0.3) : 0;

            minigame.clicksNeeded = Math.floor(clicks); // Ensure integer
            minigame.currentClicks = 0;
            minigame.maxTime = Math.max(0.5, time + timeBonus); 
            minigame.timeLeft = minigame.maxTime;

            document.getElementById('minigame-ui').style.display = 'flex'; 
            updateMinigameUI();
        }
		
        function stopFishing(success, msg){
			fishingState='idle'; castMarker.visible=false; minigame.active=false; document.getElementById('minigame-ui').style.display='none';
			if(bobber) { scene.remove(bobber); bobber=null; }
			if(fishingLine) fishingLine.visible = false;
			clearTimeout(biteTimer);
			
			const rod = player.getObjectByName("rod"); 
			if(rod) {
				// RESET: Bring rod back to Up/Back position
				rod.rotation.x = -0.2; 
			}
			
			// --- NEW: APPLY COOLDOWN REGARDLESS OF SUCCESS ---
			// If fishing stops for ANY reason (catch, failed reel, too early, timeout),
			// apply the 500ms cooldown to block the next instant click.
            lastCatchTime = Date.now(); 
            // --------------------------------------------------
			
			if(success){ 
				if(minigame.targetFish) {
					broadcastSound('catch');
					saveState.inventory.push(minigame.targetFish); 
					updateJournal(minigame.targetFish, minigame.targetFish.tierId);
					saveGame(); 

					const tierStr = minigame.targetFish.tierId !== 'normal' ? ` (${minigame.targetFish.tierName})` : '';
					const sizeStr = minigame.targetFish.sizeLabel ? ` [${minigame.targetFish.sizeLabel}]` : '';
					showToast(`Caught ${minigame.targetFish.name}${tierStr}${sizeStr}!`);

					localHeldFish = { 
						name: minigame.targetFish.name, 
						color: minigame.targetFish.color,
						size: minigame.targetFish.size 
					};

					if (fishHoldTimer) clearTimeout(fishHoldTimer);
					fishHoldTimer = setTimeout(() => {
						localHeldFish = null;
						updateLocalVisuals(); 
					}, 6000);

					updateLocalVisuals(); 

				} else {
					showToast("Error: Fish data lost.");
				}
			}
			else if(msg) showToast(msg);
		}
        
function updateMinigameUI(){
            const f = document.getElementById('bar-fill');
            const t = document.getElementById('minigame-text');
            
            
            const pct = (minigame.timeLeft / minigame.maxTime) * 100;
            f.style.width = Math.max(0, pct) + "%";
            
            
            f.style.background = pct < 30 ? '#ff4444' : '#44ff44';
            
            
            const remaining = minigame.clicksNeeded - minigame.currentClicks;
            t.innerText = `CLICK! (${remaining})`;
            t.style.color = remaining <= 5 ? '#ffff00' : 'white';
        }
        function showToast(t){ const d=document.createElement('div'); d.className='toast'; d.innerText=t; document.getElementById('notification-area').appendChild(d); setTimeout(()=>d.remove(),3000); }

        // --- GHOST/HAUNTING MECHANIC ---
        // --- GHOST/HAUNTING MECHANIC ---
        function spawnGhostMesh(x, z) {
            if (ghostMesh) scene.remove(ghostMesh); 

            // Create base mesh and override textures for a ghostly appearance.
            ghostMesh = createPlayerMesh('#000000', ' ', 'none', '#FFFFFF', 'cat');

            const texF = createSpeciesTexture('cat', '#000000', '#000000', false, 'none', 'none', 'none', '#FFFFFF');
            const texB = createSpeciesTexture('cat', '#000000', '#000000', true, 'none', 'none', 'none', '#FFFFFF');
    
            const s = ghostMesh.getObjectByName('playerSprite');
            s.userData.matFront.map = texF;
            s.userData.matBack.map = texB;
            s.material = s.userData.matFront;
            s.material.needsUpdate = true;

            ghostMesh.position.set(x, 0, z);
            scene.add(ghostMesh);

            ghostDespawnTime = Date.now() + 30000; 

            // FIX: Changed 'local' to 'system' so it doesn't put a bubble on YOU
            displayChatMessage("???", " has joined.", 'system');
            
            // Optional: Manually put a bubble on the GHOST instead
            showChatBubble(ghostMesh, "..."); 

            broadcastSound('meow', 2); 
        }
        
        let ghostMesh = null;
        let ghostDespawnTime = 0;
        let nextGhostSpawn = Date.now() + (60000 + Math.random() * 3540000); 

        function updateGhost() {
            const now = Date.now();

            if (!ghostMesh && now > nextGhostSpawn) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 35 + Math.random() * 25; 
                const x = player.position.x + Math.cos(angle) * dist;
                const z = player.position.z + Math.sin(angle) * dist;
                spawnGhostMesh(x, z);
            }
            
            if (ghostMesh && now > ghostDespawnTime) {
                scene.remove(ghostMesh);
                ghostMesh = null;
        
                nextGhostSpawn = now + (60000 + Math.random() * 3540000); 
        
                // FIX: Changed 'local' to 'system' here too
                displayChatMessage("???", " has left.", 'system');
            }
            
            if (ghostMesh && player) {
                ghostMesh.lookAt(player.position.x, 0, player.position.z);
                updateSpriteDirection(ghostMesh, camera.position);
                const s = ghostMesh.getObjectByName('playerSprite');
                if(s) s.position.y = 1.0 + Math.sin(now * 0.002) * 0.05;
            }
        }

        function triggerHaunt(targetId) {
            const target = otherPlayers[targetId];
            if(!target) return;

            // Calculate position behind the target
            const angle = target.lastData.rot + Math.PI; 
            const dist = 3;
            const pos = {
                x: target.mesh.position.x + Math.cos(angle) * dist,
                z: target.mesh.position.z + Math.sin(angle) * dist
            };

            // 1. Spawn locally immediately (so you see it)
            spawnGhostMesh(pos.x, pos.z);

            // 2. Prepare Message
            const msg = { type: 'forceGhost', x: pos.x, z: pos.z };

            // 3. Send to Network (FIXED LOGIC)
            if (isHost) {
                broadcastToClients(msg);
            } 
            else if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
                dedicatedSocket.send(JSON.stringify(msg));
            }

            showToast(`Summoned Void Cat on ${target.lastData.name}`);
        }

        function removePlayer(pid) {
            const p = otherPlayers[pid];
            if(p) {
                // Trigger Leave Message (Must get name before deleting data).
                const name = p.lastData.name || "Fisher";
                // Check if we are in-game to avoid spam during disconnects/reloads
                if (document.getElementById('lobby-screen').style.display === 'none') {
                    displayChatMessage(name, "has left.", 'system');
                }

                // Cleanup Visuals.
                if(p.mesh) scene.remove(p.mesh);
                if(p.bobberMesh) scene.remove(p.bobberMesh);
                if(p.lineMesh) scene.remove(p.lineMesh);

                // 3. Cleanup Audio Elements
                const audioEl = document.getElementById(`audio-${pid}`);
                if(audioEl) audioEl.remove();

                // Cleanup Data Structures.
                delete voiceConnections[pid];
                delete voiceAnalysers[pid];
                delete clientConns[pid];

                // Remove from main list.
                delete otherPlayers[pid];

                console.log(`Player ${pid} removed`);
            }
        }

		function animate() {
			requestAnimationFrame(animate);
			const dt = clock.getDelta();

			// --- TIME & VISUALS ---
			updateDayNightCycle(dt); 

			// --- UPDATE NPC SPRITES (Face Camera) ---
			if(npcMerchant) updateSpriteDirection(npcMerchant, camera.position);
			if(npcStylist) updateSpriteDirection(npcStylist, camera.position);
			if(npcBait) updateSpriteDirection(npcBait, camera.position);
			if(npcBuilder) updateSpriteDirection(npcBuilder, camera.position);
			if(npcLavaKeeper) updateSpriteDirection(npcLavaKeeper, camera.position);
			// NEW: Update Lava World NPC Sprites
            if(npcLavaMerchant) updateSpriteDirection(npcLavaMerchant, camera.position);
            if(npcLavaStylist) updateSpriteDirection(npcLavaStylist, camera.position);
            if(npcLavaBait) updateSpriteDirection(npcLavaBait, camera.position);
            if(npcLavaBuilder) updateSpriteDirection(npcLavaBuilder, camera.position);

			// --- AUDIO LISTENER ---
			if(audioCtx && camera) {
				const forward = new THREE.Vector3();
				camera.getWorldDirection(forward);
				if(audioCtx.listener.forwardX) {
					audioCtx.listener.positionX.value = camera.position.x;
					audioCtx.listener.positionY.value = camera.position.y;
					audioCtx.listener.positionZ.value = camera.position.z;
					audioCtx.listener.forwardX.value = forward.x;
					audioCtx.listener.forwardY.value = forward.y;
					audioCtx.listener.forwardZ.value = forward.z;
					audioCtx.listener.upX.value = camera.up.x;
					audioCtx.listener.upY.value = camera.up.y;
					audioCtx.listener.upZ.value = camera.up.z;
				} else {
					audioCtx.listener.setPosition(camera.position.x, camera.position.y, camera.position.z);
					audioCtx.listener.setOrientation(forward.x, forward.y, forward.z, camera.up.x, camera.up.y, camera.up.z);
				}
			}

			// --- PORTAL LOGIC ---
			if (voidPortalMesh) {
				voidPortalMesh.rotation.z -= 2.0 * dt; 
				// Only allow entering portal if in Main World (not Void or Lava)
				if (!isInVoid && !isInLavaWorld && player) {
					const dist = player.position.distanceTo(voidPortalMesh.position);
					if (dist < 2.0 && Date.now() > portalCooldown) {
						enterVoid();
					}
				}
				if (Date.now() > portalDespawnTime) {
					scene.remove(voidPortalMesh);
					voidPortalMesh = null;
				}
			}

			updateVoiceVisuals();
			updateGhost();

			// --- RAIN PARTICLES ---
			if (rainSystem && rainSystem.visible) {
				const positions = rainSystem.geometry.attributes.position.array;
				const vels = rainSystem.geometry.userData.velocities;
				for (let i = 0; i < positions.length; i += 3) {
					positions[i + 1] -= vels[i / 3]; 
					if (positions[i + 1] < 0) positions[i + 1] = 40;
				}
				rainSystem.geometry.attributes.position.needsUpdate = true;
			}

			// --- WATERFALL ---
			if(waterfallMesh && waterfallMesh.material.map) {
				waterfallMesh.material.map.offset.y += 2 * dt;
			}

			// --- MINIGAME (Auto-Clicker) ---
			if (minigame.active && isLeftMouseDown && saveState.autoReelLevel > 0) {
				const cps = AUTO_CLICK_RATES[saveState.autoReelLevel];
				if (cps > 0) {
					autoClickAccumulator += dt;
					const interval = 1.0 / cps;
					while (autoClickAccumulator >= interval) {
						autoClickAccumulator -= interval;
						minigame.currentClicks++;
						if(minigame.currentClicks >= minigame.clicksNeeded) {
							stopFishing(true);
							break;
						}
					}
					if(minigame.active) updateMinigameUI();
				}
			} else {
				autoClickAccumulator = 0;
			}

			if(minigame.active) {
				minigame.timeLeft -= dt;
				updateMinigameUI();
				if(minigame.timeLeft <= 0) stopFishing(false, "Time's up!");
			}

			// --- PHYSICS & MOVEMENT ---
			if(player) {
				player.updateMatrixWorld(true);
				
				// 1. DETERMINE FLOOR HEIGHT
				// Main World & Lava World both use Y=0 as the ground level
				let floorY = 0; 
				if (isInVoid) floorY = 2000;

				// 2. KNOCKBACK (PvP)
				if (Math.abs(knockbackVelocity.x) > 0.1 || Math.abs(knockbackVelocity.z) > 0.1) {
					knockbackVelocity.multiplyScalar(0.9);
					const dx = knockbackVelocity.x * dt;
					const dz = knockbackVelocity.z * dt;
					const testPos = player.position.clone();
					testPos.x += dx; testPos.z += dz;
					let hitWall = false;

					if (!isInVoid && !isInLavaWorld) {
						for(let t of treeColliders) {
							if(testPos.distanceTo(new THREE.Vector3(t.x, 0, t.z)) < 0.5 + t.radius) hitWall = true;
						}
						for(let b of staticColliders) {
							if(testPos.x > b.minX - 0.5 && testPos.x < b.maxX + 0.5 &&
							   testPos.z > b.minZ - 0.5 && testPos.z < b.maxZ + 0.5) hitWall = true;
						}
						if(testPos.length() < LAKE_RADIUS + 0.5) hitWall = true;
					}
					// (Simplified knockback checks for other worlds)

					if(!hitWall) {
						player.position.x += dx; player.position.z += dz;
					} else {
						knockbackVelocity.set(0, 0, 0);
					}
				}

				// 3. INPUT MOVEMENT
				const v = new THREE.Vector3();
				if(document.activeElement !== document.getElementById('chat-input')){
					const camForward = new THREE.Vector3();
					camera.getWorldDirection(camForward);
					camForward.y = 0; camForward.normalize();
					const camRight = new THREE.Vector3();
					camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0));
					camRight.normalize();
					if(controls.forward) v.add(camForward);
					if(controls.backward) v.sub(camForward);
					if(controls.right) v.add(camRight);
					if(controls.left) v.sub(camRight);
				}

				const sprite = player.getObjectByName("playerSprite");
				if(v.length() > 0){
					v.normalize().multiplyScalar(PLAYER_SPEED * dt);
					const np = player.position.clone().add(v);
					let col = false;

					// --- COLLISION CHECKS ---
					if (isInLavaWorld) {
						// Check against Lava Rocks
						if (typeof lavaColliders !== 'undefined') {
							for(let r of lavaColliders) {
								const dist = Math.sqrt((np.x - r.x)**2 + (np.z - r.z)**2);
								if (dist < 0.5 + r.radius) col = true;
							}
						}
					} 
					else if (isInVoid) {
						// Void Edge
						const voidCenter = new THREE.Vector3(10000, 2000, 10000);
						if (np.distanceTo(voidCenter) > 38) col = true; 
					} 
					else {
						// Main World Trees & Walls
						for(let t of treeColliders) {
							if(np.distanceTo(new THREE.Vector3(t.x, 0, t.z)) < 0.5 + t.radius) col = true;
						}
						for(let b of staticColliders) {
							if(np.x > b.minX - 0.5 && np.x < b.maxX + 0.5 &&
							   np.z > b.minZ - 0.5 && np.z < b.maxZ + 0.5) col = true;
						}
					}

					if(!col) {
						player.position.add(v);
						const targetRotation = Math.atan2(v.x, v.z);
						let rotDiff = targetRotation - player.rotation.y;
						while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
						while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
						player.rotation.y += rotDiff * 10 * dt;
					}
					if(fishingState !== 'idle' && fishingState !== 'charging') stopFishing(false, "Moved!");
			
					// Animation
					const time = Date.now() * 0.012;
					if(sprite) {
						sprite.position.y = 1.0 + Math.abs(Math.sin(time)) * 0.2;
						sprite.rotation.z = Math.sin(time) * 0.15;
					}
					if(audioCtx.currentTime - lastFootstepTime > 0.35) {
						broadcastSound('footstep');
						lastFootstepTime = audioCtx.currentTime;
					}
				} else {
					if(sprite) {
						sprite.position.y = THREE.MathUtils.lerp(sprite.position.y, 1.0, 10*dt);
						sprite.rotation.z = THREE.MathUtils.lerp(sprite.rotation.z, 0, 10*dt);
					}
				}

				// 4. GRAVITY
				if(player.position.y > floorY) playerVelocity.y -= GRAVITY * dt;
				if(player.position.y <= floorY) {
					if(player.position.y < floorY && playerVelocity.y < 0) broadcastSound('footstep');
					player.position.y = floorY; playerVelocity.y = 0;
					if(controls.jump) {
						playerVelocity.y = JUMP_FORCE;
						broadcastSound('jump');
					}
				}
				player.position.y += playerVelocity.y * dt;

				// 5. BOUNDARIES
				if (isInLavaWorld) {
					const lavaCenter = new THREE.Vector3(-20000, -2.5, 0);
					
					const dx = player.position.x - lavaCenter.x;
					const dz = player.position.z - lavaCenter.z;
					const dist = Math.sqrt(dx*dx + dz*dz);
					
					// Outer Edge (Radius 78)
					if (dist > 78) {
						const angle = Math.atan2(dz, dx);
						player.position.x = lavaCenter.x + Math.cos(angle) * 78;
						player.position.z = lavaCenter.z + Math.sin(angle) * 78;
					}
					// Inner Lake Edge (Radius 26)
					if (dist < 26) {
						const angle = Math.atan2(dz, dx);
						player.position.x = lavaCenter.x + Math.cos(angle) * 26;
						player.position.z = lavaCenter.z + Math.sin(angle) * 26;
					}
				} 
				else if (!isInVoid) {
					// Main Island Boundaries
					if(player.position.length() > ISLAND_RADIUS - 1) player.position.setLength(ISLAND_RADIUS - 1);
					if(player.position.length() < LAKE_RADIUS + 0.5) player.position.setLength(LAKE_RADIUS + 0.5);
				}

				// 6. CAMERA
				camera.position.x = player.position.x + Math.sin(cameraRotationY) * cameraDistance * Math.cos(cameraRotationX);
				camera.position.z = player.position.z + Math.cos(cameraRotationY) * cameraDistance * Math.cos(cameraRotationX);
				camera.position.y = player.position.y + Math.sin(cameraRotationX) * cameraDistance + 3;
				camera.lookAt(player.position.x, player.position.y + 1, player.position.z);

				// Update mobile slider
				if (isMobile) {
					const slider = document.getElementById('mobile-zoom-slider');
					if (slider) slider.value = (MAX_ZOOM - cameraDistance) / (MAX_ZOOM - MIN_ZOOM);
				}

				// 7. CASTING CHARGE VISUALS
				if (fishingState === 'charging') {
					const elapsedTime = Date.now() - chargeStart;
					let chargeRatio = Math.min(elapsedTime / MAX_CHARGE_TIME, 1.0);
					let currentDist = MIN_CAST_DISTANCE + chargeRatio * (MAX_CAST_DISTANCE - MIN_CAST_DISTANCE);
					const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
					const markerPos = player.position.clone().add(forward.multiplyScalar(currentDist));
					markerPos.y = floorY + 0.5;
					castMarker.position.copy(markerPos);
			
					// Visual feedback for valid casting
					let validCast = false;
					
					if (isInVoid) {
						const voidCenter = new THREE.Vector3(10000, 2000, 10000);
						if (markerPos.distanceTo(voidCenter) > 40) validCast = true;
					} else if (isInLavaWorld) {
						const lavaCenter = new THREE.Vector3(-20000, -2.5, 0);
						if (markerPos.distanceTo(lavaCenter) < 25) validCast = true;
					} else {
						const distToSecret = Math.sqrt(markerPos.x * markerPos.x + (markerPos.z - -95) * (markerPos.z - -95));
						const distFromLakeCenter = Math.sqrt(markerPos.x * markerPos.x + markerPos.z * markerPos.z);
						if (distToSecret < 12 || distFromLakeCenter < LAKE_RADIUS) validCast = true;
					}

					if (validCast) {
						castMarker.children.forEach(c => c.material.color.setHex(0x00ff00));
					} else {
						castMarker.children.forEach(c => c.material.color.setHex(0xff0000));
					}
				}

				if(sprite) updateSpriteDirection(player, camera.position);

				// --- INTERACTIONS ---
				interactTarget = null;
				canSell = false;
				
				const prompt = document.getElementById('npc-prompt');
				const btn = isMobile ? document.getElementById('btn-action') : null;
				prompt.style.display = 'none';
				if(btn) btn.innerText = "FISH";

				// --- MAIN WORLD INTERACTIONS ---
				if (!isInVoid && !isInLavaWorld) {
					const dMerchant = player.position.distanceTo(npcMerchant.position);
					const dStylist = player.position.distanceTo(npcStylist.position);
					const dBait = player.position.distanceTo(npcBait.position);
					const dBuilder = npcBuilder ? player.position.distanceTo(npcBuilder.position) : 999;
					const dLava = npcLavaKeeper ? player.position.distanceTo(npcLavaKeeper.position) : 999;

					if (dMerchant < 3) { 
						canSell = true; interactTarget = 'merchant'; 
						prompt.innerText = "PRESS E TO SELL"; prompt.style.display = 'block'; 
						if(btn) btn.innerText = "SELL"; 
					}
					else if (dStylist < 3) { 
						interactTarget = 'stylist'; 
						prompt.innerText = "PRESS E TO SHOP"; prompt.style.display = 'block'; 
						if(btn) btn.innerText = "SHOP"; 
					}
					else if (dBait < 3) { 
						interactTarget = 'bait'; 
						prompt.innerText = "PRESS E FOR BAIT"; prompt.style.display = 'block'; 
						if(btn) btn.innerText = "BAIT"; 
					}
					else if (dBuilder < 3) { 
						interactTarget = 'builder'; 
						prompt.innerText = "PRESS E FOR PROPS"; prompt.style.display = 'block'; 
						if(btn) btn.innerText = "PROPS"; 
					}
					else if (dLava < 3) {
						interactTarget = 'lava_keeper';
						if (saveState.lavaUnlocked) {
							prompt.innerText = "PRESS E TO ENTER LAVA WORLD";
							if(btn) btn.innerText = "ENTER";
						} else {
							prompt.innerText = "PRESS E TO UNLOCK ($20k)";
							if(btn) btn.innerText = "BUY";
						}
						prompt.style.display = 'block';
					}
				}
				
				// --- LAVA WORLD INTERACTIONS ---
				else if (isInLavaWorld) {
					// Check distances to the Lava versions of the NPCs
					const dLavaMerch = npcLavaMerchant ? player.position.distanceTo(npcLavaMerchant.position) : 999;
					const dLavaStyle = npcLavaStylist ? player.position.distanceTo(npcLavaStylist.position) : 999;
					const dLavaBait = npcLavaBait ? player.position.distanceTo(npcLavaBait.position) : 999;
					const dLavaBuild = npcLavaBuilder ? player.position.distanceTo(npcLavaBuilder.position) : 999;

					if (dLavaMerch < 3) { 
						canSell = true; interactTarget = 'merchant'; 
						prompt.innerText = "PRESS E TO SELL"; prompt.style.display = 'block'; 
						if(btn) btn.innerText = "SELL"; 
					}
					else if (dLavaStyle < 3) { 
						interactTarget = 'stylist'; 
						prompt.innerText = "PRESS E TO SHOP"; prompt.style.display = 'block'; 
						if(btn) btn.innerText = "SHOP"; 
					}
					else if (dLavaBait < 3) { 
						interactTarget = 'bait'; 
						prompt.innerText = "PRESS E FOR BAIT"; prompt.style.display = 'block'; 
						if(btn) btn.innerText = "BAIT"; 
					}
					else if (dLavaBuild < 3) { 
						interactTarget = 'builder'; 
						prompt.innerText = "PRESS E FOR PROPS"; prompt.style.display = 'block'; 
						if(btn) btn.innerText = "PROPS"; 
					}
				}
			}

			// --- REMOTE PLAYERS ---
			Object.keys(otherPlayers).forEach(id=>{
				const p=otherPlayers[id];
				const dist = p.mesh.position.distanceTo(p.targetPos);
				const isMoving = dist > 0.1;
				p.mesh.position.lerp(p.targetPos, 6*dt);
				p.mesh.rotation.y = THREE.MathUtils.lerp(p.mesh.rotation.y, p.targetRot, 6*dt);
				const s = p.mesh.getObjectByName("playerSprite");
				if(s) {
					updateSpriteDirection(p.mesh, camera.position);
					if(isMoving) {
						const time = Date.now() * 0.012;
						s.position.y = 1.0 + Math.abs(Math.sin(time)) * 0.2;
						s.rotation.z = Math.sin(time) * 0.15;
					} else {
						s.position.y = THREE.MathUtils.lerp(s.position.y, 1.0, 10*dt);
						s.rotation.z = THREE.MathUtils.lerp(s.rotation.z, 0, 10*dt);
					}
				}
				if (p.bobberMesh && p.lineMesh) {
					const rod = p.mesh.getObjectByName("rod");
					if (rod) {
						const tip = new THREE.Vector3(3.0, 3.0, 0); 
						tip.applyMatrix4(rod.matrixWorld);
						const pArr = p.lineMesh.geometry.attributes.position.array;
						pArr[0]=tip.x; pArr[1]=tip.y; pArr[2]=tip.z;
						pArr[3]=p.bobberMesh.position.x; pArr[4]=p.bobberMesh.position.y; pArr[5]=p.bobberMesh.position.z;
						p.lineMesh.geometry.attributes.position.needsUpdate = true;
					}
				}
			});

			// Bobber Animation (Waiting)
			if (bobber && fishingState==='waiting') {
				let floorY = 0;
				if (isInVoid) floorY = 2000;
				// Lava/Main floorY is 0, so no offset needed
				
				bobber.position.y = floorY + bobberInitialY + Math.sin(Date.now()*0.003)*0.05;
			}

			// Fishing Line Update
			if(fishingLine && bobber && player) {
				if(fishingState!=='idle' && fishingState!=='charging') {
					fishingLine.visible=true;
					const rod=player.getObjectByName("rod");
					const tip = new THREE.Vector3(3.0, 3.0, 0); 
					tip.applyMatrix4(rod.matrixWorld);
					const p=fishingLine.geometry.attributes.position.array;
					p[0]=tip.x; p[1]=tip.y; p[2]=tip.z; 
					p[3]=bobber.position.x; p[4]=bobber.position.y; p[5]=bobber.position.z;
					fishingLine.geometry.attributes.position.needsUpdate=true;
				} else fishingLine.visible=false;
			}

			renderer.render(scene, camera);
		}
        clock = new THREE.Clock();
        
        // Gracefully disconnect from peer server on window close.
        window.addEventListener('beforeunload', () => {
            if (peer) {
                peer.destroy(); 
                peer = null;
            }
        });
        
        function escapeHTML(str) {
            if (!str) return "";
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        // --- LINE OF SIGHT MATH HELPERS ---

        // 1. Check if a line segment (p1 to p2) intersects a Circle (x, z, radius)
        function lineIntersectsCircle(p1, p2, cx, cz, r) {
            // Vector from p1 to p2
            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const lenSq = dx*dx + dz*dz;
    
            // Project circle center onto the line to find closest point
            let t = ((cx - p1.x) * dx + (cz - p1.z) * dz) / lenSq;
    
            // Clamp t to the segment [0, 1]
            t = Math.max(0, Math.min(1, t));
    
            // Find coordinates of the closest point on the line
            const closeX = p1.x + t * dx;
            const closeZ = p1.z + t * dz;
    
            // Check distance from closest point to circle center
            const distSq = (closeX - cx)*(closeX - cx) + (closeZ - cz)*(closeZ - cz);
    
            return distSq < (r * r);
        }

        // 2. Check if a line segment intersects an AABB (Box Wall)
        function lineIntersectsBox(p1, p2, box) {
            // Simple approach: Check if line clipping against box bounds is valid
            // We expand the box slightly for safety
            const minX = box.minX - 0.5; const maxX = box.maxX + 0.5;
            const minZ = box.minZ - 0.5; const maxZ = box.maxZ + 0.5;

            // Cohen-Sutherland-like trivial rejection
            if ((p1.x < minX && p2.x < minX) || (p1.x > maxX && p2.x > maxX) ||
                (p1.z < minZ && p2.z < minZ) || (p1.z > maxZ && p2.z > maxZ)) {
                return false;
            }
    
            // If one point is inside and one outside, it intersects
            // (We assume players are never INSIDE a wall, so we just check if the line crosses)
            // Detailed segment-AABB intersection:
            // Check intersections with the 4 infinite lines of the box, then check if on segment
            // Simplified: Just use the Liang-Barsky algorithm logic or similar.
    
            // Let's use a robust generic logic:
            // Does the line cross X planes?
            const t0 = (minX - p1.x) / (p2.x - p1.x);
            const t1 = (maxX - p1.x) / (p2.x - p1.x);
            const t2 = (minZ - p1.z) / (p2.z - p1.z);
            const t3 = (maxZ - p1.z) / (p2.z - p1.z);

            let tMin = Math.max(Math.min(t0, t1), Math.min(t2, t3));
            let tMax = Math.min(Math.max(t0, t1), Math.max(t2, t3));

            // If tMin <= tMax and tMax >= 0 and tMin <= 1, intersection exists
            if (tMax < 0 || tMin > 1) return false;
            return tMin <= tMax;
        }

        function checkLineOfSight(start, end) { // Used for PvP punching
            // 1. Check Trees (Cylinders)
            for (let t of treeColliders) {
                // Use a slightly smaller radius (0.8) so we can punch AROUND trees, but not THROUGH the trunk
                if (lineIntersectsCircle(start, end, t.x, t.z, 1.0)) {
                    return { blocked: true, type: "Tree" };
                }
            }

            // 2. Check Walls (Cabin, Mountains, Waterfall Cliffs)
            for (let b of staticColliders) {
                if (lineIntersectsBox(start, end, b)) {
                    return { blocked: true, type: "Wall" };
                }
            }

            // 3. Check Lake (Center Hole)
            // If the line crosses the center water, you can't punch
            if (lineIntersectsCircle(start, end, 0, 0, LAKE_RADIUS)) {
                return { blocked: true, type: "Water" };
            }

            return { blocked: false };
        }

        // --- ADVERTISEMENT SYSTEM ---
        function initAdSystem() {
            const ad = document.getElementById('ad-container');
            if(ad) {
                // Show immediately
                ad.style.display = 'flex';
                console.log("Ad Banner: Active");
            }
        }

        window.closeAd = function() {
            const ad = document.getElementById('ad-container');
            if(ad) {
                // If user closes it, hide it for this session
                ad.style.display = 'none';
                // Optional: Bring it back after 5 minutes if you want
                // setTimeout(() => { ad.style.display = 'flex'; }, 5 * 60 * 1000);
            }
        }

        // Run immediately on load
        initAdSystem();

    

