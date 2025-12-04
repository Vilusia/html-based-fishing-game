import type { FishType, TierDefinition } from '../types';

/**
 * Base fish types - the foundational fish that are always available
 * This array is mutable to allow procedural generation to add variants
 */
export const FISH_TYPES: FishType[] = [
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

/**
 * Lava World Fish - 250 unique variants (5 Prefixes * 50 Bases)
 * Generated programmatically for the lava biome
 */
export const LAVA_FISH: FishType[] = (() => {
  const lavaFish: FishType[] = [];

  // 5 Prefixes * 50 Bases = 250 New Fish
  const prefixes = [
    { text: "Charred", rarity: "Common" as const, col: "#2a1d1d", priceMult: 1.5 },
    { text: "Molten", rarity: "Uncommon" as const, col: "#ff4500", priceMult: 2.0 },
    { text: "Obsidian", rarity: "Rare" as const, col: "#4a0404", priceMult: 3.5 },
    { text: "Magma", rarity: "Epic" as const, col: "#ffaa00", priceMult: 5.0 },
    { text: "Hellfire", rarity: "Legendary" as const, col: "#ffffff", priceMult: 10.0 }
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

      lavaFish.push({
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

  return lavaFish;
})();

/**
 * Rain-exclusive fish - only available during rain weather
 */
export const RAIN_FISH: FishType[] = [
  { name: "Drizzle Dory", rarity: "Common", chance: 50, color: "#87CEFA", drain: 15, price: 15, condition: 'rain' },
  { name: "Storm Salmon", rarity: "Rare", chance: 30, color: "#4169E1", drain: 40, price: 80, condition: 'rain' },
  { name: "Thunder Eel", rarity: "Epic", chance: 15, color: "#FFD700", drain: 65, price: 200, condition: 'rain' },
  { name: "Tempest Shark", rarity: "Legendary", chance: 5, color: "#191970", drain: 85, price: 500, condition: 'rain' }
];

/**
 * Void-exclusive fish - only available in void conditions
 */
export const VOID_FISH: FishType[] = [
  { name: "Null Guppy", rarity: "Common", chance: 50, color: "#333333", drain: 20, price: 25, condition: 'void' },
  { name: "Shadow Ray", rarity: "Rare", chance: 30, color: "#4B0082", drain: 50, price: 100, condition: 'void' },
  { name: "Abyssal Maw", rarity: "Epic", chance: 15, color: "#800080", drain: 75, price: 300, condition: 'void' },
  { name: "Event Horizon", rarity: "Legendary", chance: 5, color: "#000000", drain: 95, price: 1000, condition: 'void' }
];

/**
 * Fish tier definitions - affects price and drain multipliers
 * Tiers are applied on top of base fish stats
 */
export const TIERS: TierDefinition[] = [
  { id: 'normal', name: 'Normal', chance: 70, priceMult: 1, drainMult: 1.0, color: '#fff' },
  { id: 'glistening', name: 'Glistening', chance: 20, priceMult: 1.5, drainMult: 1.2, color: '#cd7f32' },
  { id: 'shining', name: 'Shining', chance: 8, priceMult: 2.5, drainMult: 1.4, color: '#c0c0c0' },
  { id: 'opalescent', name: 'Opalescent', chance: 2, priceMult: 5.0, drainMult: 1.6, color: '#ffd700' }
];

/**
 * Procedurally generates 1000 unique fish variants (20 Prefixes * 50 Bases).
 * This expands the game's content massively without manual data entry.
 * Call this function to populate FISH_TYPES with additional variants.
 */
export function generateProceduralFish(): void {
  const prefixes = [
    { text: "Mud", rarity: "Common" as const, mult: 1.0, col: "#5c4033" },
    { text: "River", rarity: "Common" as const, mult: 1.1, col: "#4488aa" },
    { text: "Rock", rarity: "Common" as const, mult: 1.2, col: "#666666" },
    { text: "Spotted", rarity: "Common" as const, mult: 1.3, col: "#aaaa44" },
    { text: "Striped", rarity: "Uncommon" as const, mult: 1.5, col: "#cc8844" },
    { text: "Emerald", rarity: "Uncommon" as const, mult: 1.8, col: "#22aa22" },
    { text: "Azure", rarity: "Uncommon" as const, mult: 2.0, col: "#2222aa" },
    { text: "Ruby", rarity: "Uncommon" as const, mult: 2.2, col: "#aa2222" },
    { text: "Electric", rarity: "Rare" as const, mult: 3.0, col: "#ffff00" },
    { text: "Ghost", rarity: "Rare" as const, mult: 3.5, col: "#eeeeee" },
    { text: "Magma", rarity: "Rare" as const, mult: 4.0, col: "#ff4400" },
    { text: "Abyssal", rarity: "Epic" as const, mult: 5.0, col: "#110033" },
    { text: "Neon", rarity: "Epic" as const, mult: 6.0, col: "#00ffcc" },
    { text: "Cursed", rarity: "Epic" as const, mult: 7.0, col: "#440044" },
    { text: "Cyber", rarity: "Epic" as const, mult: 8.0, col: "#00ff00" },
    { text: "Golden", rarity: "Legendary" as const, mult: 12.0, col: "#ffd700" },
    { text: "Rainbow", rarity: "Legendary" as const, mult: 15.0, col: "#ff88ff" },
    { text: "Void", rarity: "Legendary" as const, mult: 20.0, col: "#000000" },
    { text: "Cosmic", rarity: "Legendary" as const, mult: 25.0, col: "#4b0082" },
    { text: "Divine", rarity: "Legendary" as const, mult: 40.0, col: "#ffffff" }
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

  // Add special conditional fish to the main pool
  FISH_TYPES.push(...RAIN_FISH, ...VOID_FISH);
}

// Auto-generate procedural fish on module load
generateProceduralFish();
