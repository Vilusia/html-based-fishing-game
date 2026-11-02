// ============================================================================
// HTML Fishing — Progression Systems
// ============================================================================
// Achievements, daily bounties, and NPC quests. All three are pure *readers* of
// state the game already tracks (journal, skills, inventories, props), so they
// add goals without touching the simulation.
//
// Everything user-visible is rendered with textContent / createElement — never
// innerHTML — so a hand-edited save can't inject markup into a panel.
//
// Loaded after core.js and before ui.js. ui.js calls the notify* hooks below
// whenever the player does something interesting.

const RESOURCE_COUNTS = {
    mining: 10, lumberjack: 10, floristry: 10
};

// ---------------------------------------------------------------------------
// Achievement catalogue
// ---------------------------------------------------------------------------
// `check(ctx)` returns { have, need } — `have` is the live progress reading.
// Keeping them declarative means one renderer can draw them all, and they
// automatically re-evaluate as soon as their underlying state changes.

function pct(have, need) {
    have = Number(have) || 0;
    need = Number(need) || 1;
    return { have: Math.min(have, need), need };
}

const ACHIEVEMENTS = [
    {
        id: 'first_cast', name: 'Gone Fishin\'', desc: 'Catch your first fish',
        check: c => pct(c.totalCaught, 1)
    },
    {
        id: 'angler_25', name: 'Getting the Hang of It', desc: 'Catch 25 fish',
        check: c => pct(c.totalCaught, 25)
    },
    {
        id: 'angler_250', name: 'Dedicated Angler', desc: 'Catch 250 fish',
        check: c => pct(c.totalCaught, 250)
    },
    {
        id: 'angler_1000', name: 'Master Angler', desc: 'Catch 1,000 fish',
        check: c => pct(c.totalCaught, 1000)
    },
    {
        id: 'species_10', name: 'Collector', desc: 'Discover 10 fish species',
        check: c => pct(c.uniqueSpecies, 10)
    },
    {
        id: 'species_25', name: 'Ichthyologist', desc: 'Discover 40 fish species',
        check: c => pct(c.uniqueSpecies, 40)
    },
    {
        id: 'species_40', name: 'Encyclopedic', desc: 'Discover 75 fish species',
        check: c => pct(c.uniqueSpecies, 75)
    },
    {
        id: 'tier_shining', name: 'Shining Example', desc: 'Catch a shining fish',
        check: c => pct(c.tiers.shining ? 1 : 0, 1)
    },
    {
        id: 'tier_opalescent', name: 'Opalescent', desc: 'Catch an opalescent fish',
        check: c => pct(c.tiers.opalescent ? 1 : 0, 1)
    },
    {
        id: 'legendary_10', name: 'Legend Hunter', desc: 'Catch 10 legendary fish',
        check: c => pct(c.legendaryTotal, 10)
    },
    {
        id: 'legendary_50', name: 'Legend', desc: 'Catch 50 legendary fish',
        check: c => pct(c.legendaryTotal, 50)
    },
    {
        id: 'zones_all', name: 'Well Travelled', desc: 'Catch a fish in every zone',
        check: c => pct(c.zoneCount, c.zoneTotal)
    },
    {
        id: 'skill_fishing_50', name: 'Halfway There', desc: 'Reach Fishing level 50',
        check: c => pct(c.skillLevel('fishing'), 50)
    },
    {
        id: 'skill_any_99', name: 'True Mastery', desc: 'Reach level 99 in any skill',
        check: c => pct(c.highestSkill, 99)
    },
    {
        id: 'all_skills_50', name: 'Jack of All Trades', desc: 'Reach level 50 in all four skills',
        check: c => pct(c.skillsAtLeast50, 4)
    },
    {
        id: 'all_skills_99', name: 'Completionist', desc: 'Reach level 99 in all four skills',
        check: c => pct(c.skillsAtLeast99, 4)
    },
    {
        id: 'money_10k', name: 'Well Off', desc: 'Hold $10,000',
        check: c => pct(c.money, 10000)
    },
    {
        id: 'money_100k', name: 'Tycoon', desc: 'Hold $100,000',
        check: c => pct(c.money, 100000)
    },
    {
        id: 'ore_master', name: 'Deep Digger', desc: 'Collect every ore type',
        check: c => pct(c.oreTypes, c.oreTypeTotal)
    },
    {
        id: 'wood_master', name: 'Lumber Baron', desc: 'Collect every wood type',
        check: c => pct(c.woodTypes, c.woodTypeTotal)
    },
    {
        id: 'flower_master', name: 'Florist', desc: 'Collect every flower type',
        check: c => pct(c.flowerTypes, c.flowerTypeTotal)
    },
    {
        id: 'builder_25', name: 'Decorator', desc: 'Place 25 props',
        check: c => pct(c.propsPlaced, 25)
    },
    {
        id: 'lava_explorer', name: 'Into the Inferno', desc: 'Unlock the Lava World',
        check: c => pct(c.lavaUnlocked ? 1 : 0, 1)
    },
    // --- Rarity milestones ---
    {
        id: 'rare_50', name: 'Rare Find', desc: 'Catch 50 rare-or-better fish',
        check: c => pct(c.rareTotal, 50)
    },
    {
        id: 'rare_250', name: 'Rare Collector', desc: 'Catch 250 rare-or-better fish',
        check: c => pct(c.rareTotal, 250)
    },
    {
        id: 'legendary_1', name: 'One for the Books', desc: 'Catch your first legendary fish',
        check: c => pct(c.legendaryTotal, 1)
    },
    {
        id: 'legendary_250', name: 'Living Legend', desc: 'Catch 250 legendary fish',
        check: c => pct(c.legendaryTotal, 250)
    },
    {
        id: 'tier_glistening', name: 'Glimmer', desc: 'Catch a glistening fish',
        check: c => pct(c.tiers.glistening ? 1 : 0, 1)
    },
    {
        id: 'all_tiers', name: 'Catch of Every Colour', desc: 'Catch all four fish tiers',
        check: c => pct(['normal', 'glistening', 'shining', 'opalescent'].filter(t => c.tiers[t]).length, 4)
    },
    // --- Money ---
    {
        id: 'money_1k', name: 'Pocket Change', desc: 'Hold $1,000',
        check: c => pct(c.money, 1000)
    },
    {
        id: 'money_1m', name: 'Millionaire', desc: 'Hold $1,000,000',
        check: c => pct(c.money, 1000000)
    },
    // --- Skill milestones ---
    {
        id: 'skill_fishing_10', name: 'Learning the Ropes', desc: 'Reach Fishing level 10',
        check: c => pct(c.skillLevel('fishing'), 10)
    },
    {
        id: 'skill_fishing_99', name: 'Fishing Immortal', desc: 'Reach Fishing level 99',
        check: c => pct(c.skillLevel('fishing'), 99)
    },
    {
        id: 'all_skills_10', name: 'Well Rounded', desc: 'Reach level 10 in all four skills',
        check: c => pct(['mining', 'lumberjack', 'fishing', 'floristry'].filter(s => c.levels[s] >= 10).length, 4)
    },
    {
        id: 'skill_total_200', name: 'Seasoned', desc: 'Reach a combined skill level of 200',
        check: c => pct(c.skillSum, 200)
    },
    // --- Gathering depth ---
    {
        id: 'ore_500', name: 'Rock Bottom', desc: 'Gather 500 ore',
        check: c => pct(Object.keys(c.oreInventory || {}).reduce((n, k) => n + (c.oreInventory[k] || 0), 0), 500)
    },
    {
        id: 'builder_100', name: 'Interior Decorator', desc: 'Place 100 props',
        check: c => pct(c.propsPlaced, 100)
    },
    // --- Gear & cosmetics ---
    {
        id: 'bobber_5', name: 'Bobber Collector', desc: 'Own 5 bobbers',
        check: c => pct(c.bobbers, 5)
    },
    {
        id: 'bobber_all', name: 'Every Bobber Under the Sun', desc: 'Own every bobber',
        check: c => pct(c.bobbers, c.bobberTotal)
    },
    {
        id: 'hat_5', name: 'Hat Enthusiast', desc: 'Own 5 hats',
        check: c => pct(c.hats, 5)
    },
    {
        id: 'hat_all', name: 'Milliner', desc: 'Own every hat',
        check: c => pct(c.hats, c.hatTotal)
    },
    {
        id: 'title_10', name: 'Well Labelled', desc: 'Unlock 10 titles',
        check: c => pct(c.titles, 10)
    },
    {
        id: 'guitarist', name: 'Bard of the Lake', desc: 'Buy and play a guitar',
        check: c => pct(c.hasGuitar ? 1 : 0, 1)
    },
    {
        id: 'pugilist', name: 'Float Like a Bobber', desc: 'Buy the PvP glove',
        check: c => pct(c.hasGlove ? 1 : 0, 1)
    },
    {
        id: 'all_tools', name: 'Fully Equipped', desc: 'Own every tool',
        check: c => pct(['axe', 'pickaxe', 'guitar', 'glove'].filter(t => c.unlockedTools.indexOf(t) !== -1).length, 4)
    }
];

// ---------------------------------------------------------------------------
// Bounties
// ---------------------------------------------------------------------------
// Deterministic per-day, so every player sees the same set.

const BOUNTY_POOL = [
    { id: 'catch', label: 'Catch {n} fish', goal: [10, 15, 20, 25], event: 'catch' },
    { id: 'catch_rare', label: 'Catch {n} rare or better', goal: [3, 5, 8], event: 'catch_tier' },
    { id: 'catch_legendary', label: 'Catch {n} legendary fish', goal: [1, 2, 3], event: 'catch_legendary' },
    { id: 'mine', label: 'Mine {n} ore', goal: [15, 20, 30], event: 'mine' },
    { id: 'chop', label: 'Chop {n} wood', goal: [15, 20, 30], event: 'chop' },
    { id: 'pick_flowers', label: 'Pick {n} flowers', goal: [10, 15, 20], event: 'flower' },
    { id: 'earn', label: 'Earn {n} gold from selling', goal: [500, 1000, 2000], event: 'earn' },
    { id: 'discover', label: 'Discover {n} new species', goal: [1, 2, 3], event: 'discover' },
    { id: 'catch_big', label: 'Catch {n} fish for the creel', goal: [30, 40], event: 'catch' },
    { id: 'mine_deep', label: 'Haul {n} ore out of the ground', goal: [40, 60], event: 'mine' },
    { id: 'chop_timber', label: 'Fell {n} logs worth of wood', goal: [40, 60], event: 'chop' },
    { id: 'bloom', label: 'Gather {n} blooms', goal: [25, 35], event: 'flower' },
    { id: 'big_payday', label: 'Earn {n} gold from selling', goal: [3000, 5000], event: 'earn' },
    { id: 'rare_hunt', label: 'Catch {n} rare or better', goal: [10, 15], event: 'catch_tier' }
];

const BOUNTY_COUNT = 3;

// Small, stable string hash so the same UTC day always yields the same set.
function dayHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function utcDayString(date) {
    const d = date || new Date();
    return d.getUTCFullYear() + '-' +
        String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(d.getUTCDate()).padStart(2, '0');
}

// Picks BOUNTY_COUNT distinct bounties for a day, each with a rolled goal.
function buildBountiesForDay(day) {
    const pool = BOUNTY_POOL.slice();
    const picked = [];
    let seed = dayHash(day);
    for (let i = 0; i < BOUNTY_COUNT && pool.length; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        const idx = seed % pool.length;
        const def = pool.splice(idx, 1)[0];
        seed = (seed * 1103515245 + 12345) >>> 0;
        const goal = def.goal[seed % def.goal.length];
        picked.push({
            id: def.id,
            label: def.label.replace('{n}', goal),
            goal: goal,
            event: def.event,
            progress: 0,
            claimed: false
        });
    }
    return picked;
}

function bountyRewardFor(bounty) {
    // Roughly scales with effort; always a round-ish number. Keys must match the
    // `event` on the BOUNTY_POOL entry, or the bounty silently uses the default.
    const base = { catch: 60, catch_tier: 250, catch_legendary: 800, mine: 25, chop: 25, flower: 30, earn: 0.5, discover: 400 };
    const per = base[bounty.event] !== undefined ? base[bounty.event] : 50;
    return Math.round(bounty.goal * per);
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------
// A single linear chain that walks the player through the world's zones.

const QUESTS = [
    {
        id: 'q1', name: 'A Humble Start', giver: 'Old Fisher',
        desc: 'Catch 5 fish around the island.',
        check: c => pct(c.totalCaught, 5), reward: 300
    },
    {
        id: 'q2', name: 'Stocking Up', giver: 'Old Fisher',
        desc: 'Reach Fishing level 10.',
        check: c => pct(c.skillLevel('fishing'), 10), reward: 500
    },
    {
        id: 'q3', name: 'Deeper Waters', giver: 'Old Fisher',
        desc: 'Discover 10 fish species.',
        check: c => pct(c.uniqueSpecies, 10), reward: 800
    },
    {
        id: 'q4', name: 'The Dark Pond', giver: 'Old Fisher',
        desc: 'Catch a fish in the dark pond.',
        check: c => pct(c.zones.darkpond ? 1 : 0, 1), reward: 1200
    },
    {
        id: 'q5', name: 'Into the Inferno', giver: 'Old Fisher',
        desc: 'Unlock the Lava World and catch a lava fish.',
        check: c => pct((c.lavaUnlocked && c.zones.lava) ? 1 : 0, 1), reward: 2500
    },
    {
        id: 'q6', name: 'Beyond the Veil', giver: 'Old Fisher',
        desc: 'Catch a fish in the void.',
        check: c => pct(c.zones.void ? 1 : 0, 1), reward: 5000
    },
    {
        id: 'q7', name: 'A Full Creel', giver: 'Old Fisher',
        desc: 'Catch 50 fish in total.',
        check: c => pct(c.totalCaught, 50), reward: 1500
    },
    {
        id: 'q8', name: 'Two Kinds of Legend', giver: 'Old Fisher',
        desc: 'Catch 2 legendary fish.',
        check: c => pct(c.legendaryTotal, 2), reward: 3000
    },
    {
        id: 'q9', name: 'The Shining', giver: 'Old Fisher',
        desc: 'Catch a glistening fish.',
        check: c => pct(c.tiers.glistening ? 1 : 0, 1), reward: 2000
    },
    {
        id: 'q10', name: 'Deep Pockets', giver: 'Old Fisher',
        desc: 'Hold $25,000 at once.',
        check: c => pct(c.money, 25000), reward: 4000
    },
    {
        id: 'q11', name: 'Side Hustle', giver: 'Old Fisher',
        desc: 'Reach level 10 in Mining, Lumberjack and Floristry.',
        check: c => pct(['mining', 'lumberjack', 'floristry'].filter(s => c.levels[s] >= 10).length, 3), reward: 3500
    },
    {
        id: 'q12', name: 'Settle In', giver: 'Old Fisher',
        desc: 'Place 10 props to make the island your own.',
        check: c => pct(c.propsPlaced, 10), reward: 2500
    },
    {
        id: 'q13', name: 'Well Dressed', giver: 'Old Fisher',
        desc: 'Own 5 hats.',
        check: c => pct(c.hats, 5), reward: 3000
    },
    {
        id: 'q14', name: 'Every Colour', giver: 'Old Fisher',
        desc: 'Catch a fish of every tier.',
        check: c => pct(['normal', 'glistening', 'shining', 'opalescent'].filter(t => c.tiers[t]).length, 4), reward: 6000
    },
    {
        id: 'q15', name: 'A Fisher\'s Fortune', giver: 'Old Fisher',
        desc: 'Hold $100,000 at once.',
        check: c => pct(c.money, 100000), reward: 12000
    },
    {
        id: 'q16', name: 'The Old Fisher\'s Equal', giver: 'Old Fisher',
        desc: 'Reach Fishing level 99.',
        check: c => pct(c.skillLevel('fishing'), 99), reward: 25000
    }
];

// ---------------------------------------------------------------------------
// Progress counters, derived from saveState
// ---------------------------------------------------------------------------

function progressionSkillLevel(skill) {
    const entry = saveState.skills && saveState.skills[skill];
    return getLevelFromXP(entry ? entry.xp : 0);
}

// Walks the inventory once and derives everything achievement-ish. Cheap enough
// to run after each catch; the alternative is tracking counters in a dozen
// places and letting them drift.
function computeProgress() {
    const inv = Array.isArray(saveState.inventory) ? saveState.inventory : [];
    const journal = saveState.journal || {};

    const tiers = { normal: false, glistening: false, shining: false, opalescent: false };
    const zones = {};
    let legendaryTotal = 0;

    inv.forEach(f => {
        if (!f) return;
        if (tiers[f.tierId] !== undefined) tiers[f.tierId] = true;
        if (f.zone) zones[f.zone] = true;
        if (f.rarity === 'Legendary') legendaryTotal++;
    });

    // The journal records catches even after they are sold, so species survive.
    Object.keys(journal).forEach(name => {
        const seen = journal[name];
        if (Array.isArray(seen)) seen.forEach(t => { if (tiers[t] !== undefined) tiers[t] = true; });
    });

    // Fishing zone names the game assigns to caught fish (see ui.js selectFish).
    const zoneNames = ['ocean', 'lake', 'river', 'lightpond', 'darkpond', 'secret', 'void', 'lava'];

    const skillNames = ['mining', 'lumberjack', 'fishing', 'floristry'];
    const levels = {};
    skillNames.forEach(s => { levels[s] = progressionSkillLevel(s); });

    const oreInv = saveState.oreInventory || {};
    const woodInv = saveState.woodInventory || {};
    const flowerInv = saveState.flowerInventory || {};

    // Gear ownership (arrays live in the save; the "-1" drops the free default).
    const bobbers = Array.isArray(saveState.unlockedBobbers) ? saveState.unlockedBobbers.length - 1 : 0;
    const hats = Array.isArray(saveState.unlockedHats) ? saveState.unlockedHats.length - 1 : 0;
    const titles = Array.isArray(saveState.unlockedTitles) ? saveState.unlockedTitles.length - 1 : 0;
    const bobberTotal = typeof BOBBER_TYPES !== 'undefined' ? BOBBER_TYPES.length - 1 : 14;
    const hatTotal = typeof HAT_TYPES !== 'undefined' ? HAT_TYPES.filter(h => h.id !== 'none').length : 29;
    const titleTotal = typeof TITLE_TYPES !== 'undefined' ? TITLE_TYPES.filter(t => t.id !== 'none').length : 88;

    // Lifetime catches of each rarity are not stored, so derive what we can from
    // the current inventory + journal. Good enough for coarse milestones.
    let rareTotal = 0;
    inv.forEach(f => {
        if (!f || !f.rarity) return;
        if (f.rarity === 'Rare' || f.rarity === 'Epic' || f.rarity === 'Legendary') rareTotal++;
    });

    return {
        // `zones` doubles as the quest contract: exact keys, even when unset.
        zones: Object.assign({ ocean: false, lake: false, river: false, lightpond: false, darkpond: false, secret: false, void: false, lava: false }, zones),
        totalCaught: inv.length,
        uniqueSpecies: (typeof countDiscoveredSpecies === 'function')
            ? countDiscoveredSpecies(journal)
            : Object.keys(journal).length,
        legendaryTotal,
        rareTotal,
        tiers,
        zoneCount: zoneNames.filter(z => zones[z]).length,
        zoneTotal: zoneNames.length,
        skillLevel: progressionSkillLevel,
        levels,
        highestSkill: Math.max.apply(null, skillNames.map(s => levels[s]).concat([1])),
        lowestSkill: Math.min.apply(null, skillNames.map(s => levels[s]).concat([99])),
        skillSum: skillNames.reduce((n, s) => n + levels[s], 0),
        skillsAtLeast50: skillNames.filter(s => levels[s] >= 50).length,
        skillsAtLeast99: skillNames.filter(s => levels[s] >= 99).length,
        money: Number(saveState.money) || 0,
        oreTypes: Object.keys(oreInv).filter(k => (oreInv[k] || 0) > 0).length,
        oreTypeTotal: Math.min((typeof ORE_TYPES !== 'undefined' ? ORE_TYPES.length : 10), RESOURCE_COUNTS.mining),
        oreInventory: oreInv,
        woodInventory: woodInv,
        flowerInventory: flowerInv,
        woodTypes: Object.keys(woodInv).filter(k => (woodInv[k] || 0) > 0).length,
        woodTypeTotal: Math.min((typeof WOOD_TYPES !== 'undefined' ? WOOD_TYPES.length : 10), RESOURCE_COUNTS.lumberjack),
        flowerTypes: Object.keys(flowerInv).filter(k => (flowerInv[k] || 0) > 0).length,
        flowerTypeTotal: Math.min((typeof FLOWER_TYPES !== 'undefined' ? FLOWER_TYPES.length : 10), RESOURCE_COUNTS.floristry),
        propsPlaced: Number(saveState.propsPlaced) || 0,
        lavaUnlocked: saveState.lavaUnlocked === true,
        hasGlove: saveState.hasGlove === true,
        hasGuitar: saveState.hasGuitar === true,
        unlockedTools: Array.isArray(saveState.unlockedTools) ? saveState.unlockedTools.slice() : [],
        bobbers, bobberTotal,
        hats, hatTotal,
        titles, titleTotal
    };
}

// ---------------------------------------------------------------------------
// Achievement state + notify hooks
// ---------------------------------------------------------------------------

function ensureProgression() {
    if (!saveState.achievements || typeof saveState.achievements !== 'object') {
        saveState.achievements = {};
    }
    // Migrate renamed species achievements so old saves keep their progress.
    if (saveState.achievements['species_50'] && saveState.achievements['species_50'].unlocked && !saveState.achievements['species_25']) {
        saveState.achievements['species_25'] = saveState.achievements['species_50'];
    }
    if (saveState.achievements['species_200'] && saveState.achievements['species_200'].unlocked && !saveState.achievements['species_40']) {
        saveState.achievements['species_40'] = saveState.achievements['species_200'];
    }
    if (!saveState.bounties || typeof saveState.bounties !== 'object') {
        saveState.bounties = { day: '', items: [], lastClaimDay: '' };
    }
    if (!Array.isArray(saveState.bounties.items)) saveState.bounties.items = [];
    if (!saveState.quests || typeof saveState.quests !== 'object') {
        saveState.quests = { index: 0, completed: [] };
    }
    if (!Array.isArray(saveState.quests.completed)) saveState.quests.completed = [];
    if (typeof saveState.quests.index !== 'number') saveState.quests.index = 0;
    if (!saveState.quests.completedAt || typeof saveState.quests.completedAt !== 'object') {
        saveState.quests.completedAt = {};
    }
    if (typeof saveState.progressViewedAt !== 'number') saveState.progressViewedAt = 0;
    if (typeof saveState.fisherHinted !== 'boolean') saveState.fisherHinted = false;
}

// Returns the list of achievement ids that just became complete.
function checkAchievements(silent) {
    ensureProgression();
    const ctx = computeProgress();
    const unlocked = [];

    ACHIEVEMENTS.forEach(a => {
        if (saveState.achievements[a.id] && saveState.achievements[a.id].unlocked) return;
        let res;
        try { res = a.check(ctx); } catch (e) { return; }
        if (res && res.have >= res.need) {
            saveState.achievements[a.id] = { unlocked: true, at: Date.now() };
            unlocked.push(a.id);
        }
    });

    if (unlocked.length && !silent) {
        unlocked.forEach(id => {
            const def = ACHIEVEMENTS.find(a => a.id === id);
            if (def) showToast('★ ' + def.name, 'achievement');
        });
        // Prefer the dedicated fanfare; fall back to the sell chime.
        if (typeof Sound !== 'undefined') {
            if (typeof Sound.achievement === 'function') { try { Sound.achievement(); } catch (e) { } }
            else if (Sound.sell) { try { Sound.sell(); } catch (e) { } }
        }
    }
    return unlocked;
}

function questCtx() {
    // computeProgress already normalizes `zones` to the exact key set quests use.
    return computeProgress();
}

// Re-evaluates the active quest and auto-completes it (awards its reward).
function checkQuests(silent) {
    ensureProgression();
    const q = QUESTS[saveState.quests.index];
    if (!q) return null;
    if (saveState.quests.completed.indexOf(q.id) !== -1) return null;

    let res;
    try { res = q.check(questCtx()); } catch (e) { return null; }
    if (!res || res.have < res.need) return null;

    saveState.quests.completed.push(q.id);
    saveState.quests.index += 1;
    saveState.money = (Number(saveState.money) || 0) + q.reward;
    if (!saveState.quests.completedAt || typeof saveState.quests.completedAt !== 'object') saveState.quests.completedAt = {};
    saveState.quests.completedAt[q.id] = Date.now();
    if (!silent) {
        showToast('Quest complete: ' + q.name + ' (+$' + q.reward + ')', 'success');
        if (typeof Sound !== 'undefined' && Sound.sell) { try { Sound.sell(); } catch (e) { } }
    }
    return q.id;
}

// Rolls the day's bounties if they are stale. Returns true when they changed.
function ensureBounties(day) {
    ensureProgression();
    const today = day || utcDayString();
    // The day alone decides staleness. Length is only used to heal a truncated
    // array, never to re-roll a list that still holds today's completed work.
    if (saveState.bounties.day === today && saveState.bounties.items.length > 0) {
        return false;
    }
    saveState.bounties.day = today;
    saveState.bounties.items = buildBountiesForDay(today);
    lastBountyDay = today;
    return true;
}

// Feeds one gameplay event into the bounty tracker.
function notifyBountyEvent(event, amount) {
    ensureProgression();
    ensureBounties();
    const n = Number(amount) || 1;
    let changed = false;

    saveState.bounties.items.forEach(b => {
        if (b.claimed || b.event !== event) return;
        const before = b.progress;
        b.progress = Math.min(b.goal, b.progress + n);
        if (b.progress !== before) changed = true;
        if (b.progress >= b.goal && !b.claimed) {
            b.claimed = true;
            b.pending = true; // shown as "CLAIM" until the player taps it
        }
    });
    return changed;
}

function claimBounty(bountyId) {
    ensureProgression();
    const b = saveState.bounties.items.find(x => x.id === bountyId);
    if (!b || !b.claimed || b.claimed_paid) return false;
    const reward = bountyRewardFor(b);
    saveState.money = (Number(saveState.money) || 0) + reward;
    b.claimed_paid = true;
    b.pending = false;
    showToast('Bounty claimed: +$' + reward, 'success');
    if (typeof Sound !== 'undefined' && Sound.sell) { try { Sound.sell(); } catch (e) { } }
    saveGame();
    return true;
}

// ---------------------------------------------------------------------------
// Notify hooks — called from ui.js gameplay handlers
// ---------------------------------------------------------------------------

let lastBountyDay = '';

// A fish was landed. `firstTime` marks a brand-new species.
function notifyFishCaught(fish, firstTime) {
    if (!fish) return;
    if (firstTime) notifyBountyEvent('discover', 1);
    notifyBountyEvent('catch', 1);
    if (fish.rarity === 'Legendary') notifyBountyEvent('catch_legendary', 1);
    if (fish.rarity && fish.rarity !== 'Common' && fish.rarity !== 'Uncommon') {
        notifyBountyEvent('catch_tier', 1);
    }

    const unlocked = checkAchievements(false);
    checkQuests(false);

    // Roll the day over without a reload if the clock passes midnight.
    if (ensureBounties()) {
        showToast('New daily bounties are available!');
    }

    if (unlocked.length || typeof progressionLastRefresh === 'number') {
        progressionLastRefresh = Date.now();
    }
    if (typeof refreshProgressionUI === 'function') refreshProgressionUI();
}

function notifyResourceGathered(kind, amount) {
    if (!kind) return;
    const event = kind === 'mine' ? 'mine' : kind === 'chop' ? 'chop' : kind === 'flower' ? 'flower' : null;
    if (event) notifyBountyEvent(event, amount);
    checkAchievements(false);
    checkQuests(false);
    if (typeof refreshProgressionUI === 'function') refreshProgressionUI();
}

function notifyGoldEarned(amount) {
    notifyBountyEvent('earn', amount);
    checkAchievements(false);
    if (typeof refreshProgressionUI === 'function') refreshProgressionUI();
}

// Watches the money total for gains. Called from saveGame(), which runs after
// every sale/spend, so all the sell paths feed the "earn gold" bounty without
// needing a hook in each one.
let lastKnownMoney = null;
let moneyWatcherReady = false;

function progressionTrackMoney() {
    ensureProgression();
    const now = Number(saveState.money) || 0;

    // Seed the baseline once; without this the first save would look like a
    // huge one-off gain (or a loss) and give the bounty free progress.
    if (!moneyWatcherReady) {
        lastKnownMoney = now;
        moneyWatcherReady = true;
        return;
    }

    const delta = now - lastKnownMoney;
    lastKnownMoney = now;
    if (delta > 0) notifyGoldEarned(delta);
}

function notifyPropPlaced() {
    checkAchievements(false);
    if (typeof refreshProgressionUI === 'function') refreshProgressionUI();
}

let progressionLastRefresh = 0;

// ---------------------------------------------------------------------------
// UI — the "Progress" panel (achievements / bounties / quests)
// ---------------------------------------------------------------------------
// Everything is built with createElement + textContent: no innerHTML anywhere,
// so a hand-edited save can never inject markup here.

let progressionTab = 'bounties';

function el(tag, style, text) {
    const node = document.createElement(tag);
    if (style) node.style.cssText = style;
    if (text !== undefined) node.textContent = text;
    return node;
}

function progressBar(have, need, tint) {
    const wrap = el('div', 'height:8px;background:var(--p-sunken);border:1px solid var(--p-line);margin-top:4px;');
    const fill = el('div', 'height:100%;width:' + Math.round((have / need) * 100) + '%;background:' + (tint || 'var(--p-good)') + ';');
    wrap.appendChild(fill);
    return wrap;
}

function renderBounties(container) {
    ensureBounties();
    const today = saveState.bounties.day;
    container.appendChild(el('div', 'color:var(--p-text-dim);font-size:14px;margin-bottom:8px;',
        'Daily bounties for ' + today + ' (UTC). They reset at midnight UTC.'));

    saveState.bounties.items.forEach(b => {
        const card = el('div', 'background:var(--p-face-2);border:2px solid var(--p-line);padding:10px;margin-bottom:6px;');
        card.appendChild(el('div', 'font-weight:bold;', b.label));
        const done = b.progress >= b.goal;
        card.appendChild(el('div', 'font-size:14px;color:var(--p-text-dim);margin-top:3px;',
            (done ? 'Complete' : b.progress + ' / ' + b.goal) + ' · $' + bountyRewardFor(b)));
        card.appendChild(progressBar(b.progress, b.goal, done ? 'var(--p-good)' : undefined));

        if (done) {
            if (b.claimed_paid) {
                card.appendChild(el('div', 'font-size:13px;color:var(--p-good);margin-top:6px;', 'Claimed'));
            } else {
                const btn = el('button', 'margin-top:6px;', 'CLAIM $' + bountyRewardFor(b));
                btn.className = 'btn-sm btn-green';
                btn.onclick = () => { if (claimBounty(b.id)) renderProgressionPanel(); };
                card.appendChild(btn);
            }
        }
        container.appendChild(card);
    });
}

function renderAchievements(container) {
    const ctx = computeProgress();
    let unlockedCount = 0;
    const rows = [];

    ACHIEVEMENTS.forEach(a => {
        const isUnlocked = !!(saveState.achievements[a.id] && saveState.achievements[a.id].unlocked);
        if (isUnlocked) unlockedCount++;
        let res = { have: 0, need: 1 };
        if (!isUnlocked) { try { res = a.check(ctx) || res; } catch (e) { } }
        rows.push({ def: a, unlocked: isUnlocked, res: res });
    });

    container.appendChild(el('div', 'color:var(--p-text-dim);font-size:14px;margin-bottom:8px;',
        unlockedCount + ' / ' + ACHIEVEMENTS.length + ' unlocked'));

    // Unlocked first, then closest-to-done, so there's always a next target.
    rows.sort((x, y) => {
        if (x.unlocked !== y.unlocked) return x.unlocked ? -1 : 1;
        const px = x.res.have / x.res.need, py = y.res.have / y.res.need;
        return py - px;
    });

    rows.forEach(r => {
        const card = el('div', 'background:var(--p-face-2);border:2px solid var(--p-line);padding:10px;margin-bottom:6px;' +
            (r.unlocked ? 'opacity:0.85;' : ''));
        const head = el('div', 'font-weight:bold;');
        head.appendChild(el('span', 'color:' + (r.unlocked ? 'var(--p-good)' : 'var(--p-text-mute)') + ';margin-right:6px;',
            r.unlocked ? '★' : '☆'));
        head.appendChild(el('span', '', r.def.name));
        card.appendChild(head);
        card.appendChild(el('div', 'font-size:14px;color:var(--p-text-dim);margin-top:3px;', r.def.desc));
        if (!r.unlocked) {
            card.appendChild(el('div', 'font-size:13px;color:var(--p-text-mute);margin-top:4px;',
                r.res.have + ' / ' + r.res.need));
            card.appendChild(progressBar(r.res.have, r.res.need, 'var(--p-sand)'));
        }
        container.appendChild(card);
    });
}

function renderQuests(container) {
    const completed = saveState.quests.completed.length;
    container.appendChild(el('div', 'color:var(--p-text-dim);font-size:14px;margin-bottom:8px;',
        completed + ' / ' + QUESTS.length + ' quests complete'));

    const ctx = questCtx();
    QUESTS.forEach((q, i) => {
        const isDone = saveState.quests.completed.indexOf(q.id) !== -1;
        const isActive = !isDone && i === saveState.quests.index;
        const isLocked = !isDone && !isActive;

        const card = el('div', 'background:var(--p-face-2);border:2px solid var(--p-line);padding:10px;margin-bottom:6px;' +
            (isLocked ? 'opacity:0.5;' : ''));
        const head = el('div', 'font-weight:bold;');
        head.appendChild(el('span', 'color:' + (isDone ? 'var(--p-good)' : isActive ? 'var(--p-sand)' : 'var(--p-text-mute)') + ';margin-right:6px;',
            isDone ? '✓' : isActive ? '▶' : '•'));
        head.appendChild(el('span', '', q.name));
        card.appendChild(head);
        card.appendChild(el('div', 'font-size:13px;color:var(--p-text-mute);margin-top:2px;', 'from ' + q.giver));
        card.appendChild(el('div', 'font-size:14px;color:var(--p-text-dim);margin-top:4px;', q.desc));
        card.appendChild(el('div', 'font-size:14px;color:var(--p-good);margin-top:4px;', 'Reward: $' + q.reward));

        if (isActive) {
            let res = { have: 0, need: 1 };
            try { res = q.check(ctx) || res; } catch (e) { }
            card.appendChild(el('div', 'font-size:13px;color:var(--p-text-mute);margin-top:4px;',
                res.have + ' / ' + res.need));
            card.appendChild(progressBar(res.have, res.need, 'var(--p-sand)'));
        }
        container.appendChild(card);
    });
}

function renderProgressionPanel() {
    const container = document.getElementById('progress-content');
    const tabs = document.getElementById('progress-tabs');
    if (!container) return;

    if (tabs) {
        Array.from(tabs.children).forEach(btn => {
            const on = btn.dataset.tab === progressionTab;
            btn.style.opacity = on ? '1' : '0.6';
            btn.style.background = on ? 'var(--p-good)' : '';
            btn.style.color = on ? '#111' : '';
        });
    }

    container.innerHTML = '';
    if (progressionTab === 'achievements') renderAchievements(container);
    else if (progressionTab === 'quests') renderQuests(container);
    else renderBounties(container);

    // Keep the tab bar's badge in step with unclaimed bounties.
    const claimable = saveState.bounties.items.filter(b => b.claimed && !b.claimed_paid).length;
    if (tabs) {
        const bountyBtn = tabs.querySelector('[data-tab="bounties"]');
        if (bountyBtn) bountyBtn.textContent = claimable ? 'BOUNTIES (' + claimable + ')' : 'BOUNTIES';
    }
}

// Cheap refresh used by the gameplay hooks: only repaints when the panel is
// actually open, so we never pay for hidden DOM work during a cast.
function refreshProgressionUI() {
    updateProgressBadge();
    const overlay = document.getElementById('progress-overlay');
    if (!overlay || overlay.style.display !== 'flex') return;
    renderProgressionPanel();
}

// True when there is something new for the player to look at: an unclaimed
// bounty, or an achievement/quest unlocked since they last opened the panel.
function progressionHasNews() {
    try {
        ensureProgression();
        ensureBounties();
        const claimable = saveState.bounties.items.some(b => b.claimed && !b.claimed_paid);
        if (claimable) return true;
        if (Number(saveState.progressViewedAt) || 0) {
            const since = Number(saveState.progressViewedAt) || 0;
            const ach = Object.keys(saveState.achievements || {}).some(id => {
                const rec = saveState.achievements[id];
                return rec && rec.unlocked && (rec.at || 0) > since;
            });
            if (ach) return true;
            const q = QUESTS.slice(0, saveState.quests.index).some(def => def.id && (saveState.quests.completedAt && (saveState.quests.completedAt[def.id] || 0) > since));
            if (q) return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

// Paints (or clears) the little gold dot on the Progress button.
function updateProgressBadge() {
    const btn = document.getElementById('btn-progress');
    if (!btn) return;
    const want = progressionHasNews();
    const has = !!btn.querySelector('.progress-badge');
    if (want && !has) {
        const dot = document.createElement('span');
        dot.className = 'progress-badge';
        btn.appendChild(dot);
    } else if (!want && has) {
        const dot = btn.querySelector('.progress-badge');
        if (dot) dot.remove();
    }
}

window.setProgressTab = function (tab) {
    progressionTab = tab;
    renderProgressionPanel();
};

window.toggleProgress = function () {
    const ui = document.getElementById('progress-overlay');
    if (!ui) return;
    const opening = ui.style.display !== 'flex';
    ui.style.display = opening ? 'flex' : 'none';
    if (opening) {
        if (typeof document.exitPointerLock === 'function') document.exitPointerLock();
        ensureProgression();
        ensureBounties();
        checkAchievements(false);
        checkQuests(false);
        renderProgressionPanel();
        // Opening the panel counts as "seeing" everything in it.
        saveState.progressViewedAt = Date.now();
        if (typeof saveGame === 'function') saveGame();
        updateProgressBadge();
    }
};

