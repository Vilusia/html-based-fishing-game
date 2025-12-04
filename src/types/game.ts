/**
 * Core game type definitions for HTML Fisher
 */

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';

export type Species =
  | 'cat' | 'bunny' | 'dog' | 'bear' | 'fox' | 'pig'
  | 'dragon' | 'mouse' | 'duck' | 'axolotl' | 'raccoon'
  | 'koala' | 'lion' | 'cow' | 'frog' | 'monkey' | 'penguin';

export type FishTier = 'Normal' | 'Glistening' | 'Shining' | 'Opalescent';

export type FishSize = 'Tiny' | 'Small' | 'Normal' | 'Big' | 'Huge';

export interface FishType {
  name: string;
  rarity: Rarity;
  chance: number;
  color: string;
  drain: number;
  price: number;
  condition?: 'rain' | 'void' | 'lava';
  isLava?: boolean;
}

export interface FishInstance {
  name: string;
  rarity: Rarity;
  color: string;
  price: number;
  size: FishSize;
  tier: FishTier;
  sizeMultiplier: number;
  tierMultiplier: number;
}

export interface TierDefinition {
  id: string;
  name: FishTier;
  chance: number;
  priceMult: number;
  drainMult: number;
  color: string;
}

export interface PropType {
  id: string;
  name: string;
  price: number;
  icon: string;
}

export interface HatType {
  id: string;
  name: string;
  price: number;
  color?: string;
  type: string;
}

export interface ShirtType {
  id: string;
  name: string;
  price: number;
  color: string;
  type: string;
  secondary?: string;
  under?: string;
  symbol?: string;
}

export interface CollarType {
  id: string;
  name: string;
  price: number;
  color: string;
  type?: string;
}

export interface TitleType {
  id: string;
  text: string;
  price: number;
  color?: string;
}

export interface BaitType {
  id: string;
  name: string;
  price: number;
  unlockFish: number;
  power: number;
  rarityMult: number;
  tierLuck: number;
}

export interface RodType {
  id: string;
  name: string;
  price: number;
  catchBonus: number;
  luckBonus: number;
  castDistance: number;
  color: string;
}

export interface PlayerState {
  money: number;
  inventory: FishInstance[];
  journal: Record<string, JournalEntry>;
  unlockedHats: string[];
  currentHat: string;
  catColor: string;
  bellyColor: string;
  eyeColor: string;
  species: Species;
  baitInventory: Record<string, number>;
  hasGlove: boolean;
  autoReelLevel: number;
  hasGuitar: boolean;
  unlockedProps: string[];
  currentProp: string;
  unlockedRods: string[];
  currentRod: string;
  unlockedShirts: string[];
  currentShirt: string;
  unlockedCollars: string[];
  currentCollar: string;
  unlockedTitles: string[];
  currentTitle: string;
  lavaUnlocked: boolean;
  displayName: string;
  outfits?: OutfitPreset[];
  micId?: string;
  showTitles?: boolean;
  volumes?: VolumeSettings;
}

export interface JournalEntry {
  count: number;
  maxSize: FishSize;
  maxTier: FishTier;
  maxPrice: number;
}

export interface OutfitPreset {
  name: string;
  species: Species;
  catColor: string;
  bellyColor: string;
  eyeColor: string;
  hat: string;
  shirt: string;
  collar: string;
}

export interface VolumeSettings {
  master: number;
  sfx: number;
  midi: number;
  voice: number;
}
