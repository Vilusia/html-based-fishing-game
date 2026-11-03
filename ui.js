
const UICache = { mEl: null, logHeader: null, lEl: null };
let isHandsHidden = false; // Global state for empty hands mode
let pickableFlowers = []; // Trackable, pickable flower meshes

// --- SKY ---
// The stars / sun / moon are centred on the camera and sized past the world so
// the sky looks the same everywhere, including out in the open ocean. Must stay
// inside the camera's far plane (see the PerspectiveCamera near line 4000).
const STAR_RADIUS = 1600;  // star dome shell radius (camera-relative)
const SKY_ORBIT_RADIUS = 900; // sun/moon orbit radius (camera-relative)

// --- SKILL SYSTEM HELPERS ---
function addSkillXP(skillName, xpAmount) {
    if (typeof ensureSkills === 'function') ensureSkills();
    else if (!saveState.skills) saveState.skills = {};
    if (!saveState.skills[skillName]) saveState.skills[skillName] = { xp: 0 };

    const oldLevel = getLevelFromXP(saveState.skills[skillName].xp);
    saveState.skills[skillName].xp += xpAmount;
    const newLevel = getLevelFromXP(saveState.skills[skillName].xp);

    // Level up notification. Use the registry's display name when we have one.
    if (newLevel > oldLevel) {
        const def = (typeof SKILLS !== 'undefined') ? SKILLS.find(s => s.id === skillName) : null;
        const label = def ? def.name : (skillName.charAt(0).toUpperCase() + skillName.slice(1));
        showToast(`${label} Level ${newLevel}!`, 'success');
        Sound.sell(); // Play level up sound
        // Synced chat notice for everyone.
        const notice = { type: 'skillLevel', name: saveState.displayName, skill: label, level: newLevel, id: myPeerId };
        displayChatMessage(saveState.displayName, `has reached level ${newLevel} in ${label}!`, 'system');
        if (typeof isHost !== 'undefined' && isHost) {
            broadcastToClients(notice);
        } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
            hostConn.send(notice);
        }
    }
}

// Reads a skill's current level (1-99) straight from the save.
function getSkillLevel(skillName) {
    const entry = saveState.skills && saveState.skills[skillName];
    return getLevelFromXP(entry ? entry.xp : 0);
}

// Trading raises what the Merchant pays. +1% per level, up to +50% at 50+.
function tradingSellMultiplier() {
    const lvl = getSkillLevel('trading');
    return 1 + Math.min(lvl, 50) * 0.01;
}

// Cooking reduces the chance a fish cooks into a burnt mess: never below 5%,
// fully reliable by level 50.
function cookingBurnChance() {
    const lvl = getSkillLevel('cooking');
    return Math.max(0.05, 0.4 - lvl * 0.007);
}

// --- WATER SURFACE QUERY ---
// Returns the y of a water surface at (x, z), or null if the spot is dry land.
// Used by the movement loop so boats ride the top and swimmers float, instead
// of both sinking to the sea bed. Covers the home lake/ponds, the open ocean,
// generated ocean islands' shallows, and custom-level sea water.
function waterSurfaceAt(x, z) {
    if(window.Housing && Housing.inside && Housing.isInteriorPoint(x,z)) return null;
    if (isInVoid || isInLavaWorld) return null;

    // Custom level: the authored sea covers everything below its sea level,
    // including the ocean apron (where generated islands may rise above it).
    if (window.CUSTOM_LEVEL && window.Level) {
        const lvl = window.CUSTOM_LEVEL;
        const h = getTerrainHeight(x, z); // already blends apron islands
        if (h < lvl.seaLevel - 0.001) return lvl.seaLevel;
        return null;
    }

    const dist = Math.sqrt(x * x + z * z);

    // Home lake (surface at y = 0.1, but a boat rides slightly proud at 0.6).
    if (dist < LAKE_RADIUS) return 0.6;

    // Light pond (-60, -30) r=10 and dark pond (60, 50) r=14 (y = 0.12).
    if (window.pondCollider) {
        const dp = Math.sqrt((x - window.pondCollider.x) ** 2 + (z - window.pondCollider.z) ** 2);
        if (dp < window.pondCollider.radius) return 0.6;
    }
    if (window.darkPondCollider) {
        const ddp = Math.sqrt((x - window.darkPondCollider.x) ** 2 + (z - window.darkPondCollider.z) ** 2);
        if (ddp < window.darkPondCollider.radius) return 0.6;
    }

    // Open ocean (and the shallows around generated islands): anywhere the sea
    // bed sits below the ocean surface is water. No radius gate — the home
    // island's beach slope drops below sea level well before its edge.
    const bed = getTerrainHeight(x, z);
    if (bed < OCEAN_LEVEL - 0.001) return OCEAN_LEVEL;

    return null;
}

// Get a random resource based on skill level (higher level = chance for better resources)
function getResourceForLevel(skillLevel, resourceTypes) {
    // Filter resources player can access based on level
    const available = resourceTypes.filter(r => r.level <= skillLevel);
    if (available.length === 0) return resourceTypes[0];

    // Weighted chance: higher tier resources are rarer
    // Roll determines which tier: higher roll = better resource chance
    const roll = Math.random() * 100;
    const levelBonus = skillLevel / 99 * 50; // Up to 50% bonus at level 99
    const adjustedRoll = roll + levelBonus;

    // Pick resource based on adjusted roll
    // 0-40: lowest available, 40-70: mid, 70-90: high, 90+: best available
    let tierIndex;
    if (adjustedRoll >= 130) tierIndex = available.length - 1; // Best (rare at high levels)
    else if (adjustedRoll >= 100) tierIndex = Math.max(0, available.length - 2);
    else if (adjustedRoll >= 70) tierIndex = Math.max(0, available.length - 3);
    else if (adjustedRoll >= 50) tierIndex = Math.max(0, Math.floor(available.length / 2));
    else tierIndex = 0; // Most common

    return available[Math.min(tierIndex, available.length - 1)];
}

function cacheUIElements() {
    UICache.mEl = document.getElementById('money-display');
    UICache.logHeader = document.querySelector('#fish-log b');
    UICache.lEl = document.getElementById('log-content');
}

function updateUI() {
    if (!UICache.mEl) cacheUIElements();

    if (UICache.mEl) UICache.mEl.innerText = `$${saveState.money}`;

    const totalFish = saveState.inventory.length;
    if (UICache.logHeader) UICache.logHeader.innerText = `Inventory (${totalFish}):`;

    if (UICache.lEl) {
        // Check if inventory is empty (fish, typed wood, typed ore, legacy)
        const hasWood = Object.values(saveState.woodInventory || {}).some(c => c > 0) || (saveState.wood && saveState.wood > 0);
        const hasOre = Object.values(saveState.oreInventory || {}).some(c => c > 0) || (saveState.stone && saveState.stone > 0);
        if (totalFish === 0 && !hasWood && !hasOre) {
            UICache.lEl.innerHTML = "Empty.";
        } else {
            UICache.lEl.innerHTML = "";
            const fragment = document.createDocumentFragment();

            // WOOD INVENTORY (Typed)
            if (!saveState.woodInventory) saveState.woodInventory = {};
            WOOD_TYPES.forEach(woodType => {
                const count = saveState.woodInventory[woodType.id] || 0;
                if (count > 0) {
                    const wDiv = document.createElement('div');
                    wDiv.innerText = `${woodType.name} x${count}`;
                    wDiv.style.color = woodType.color;
                    wDiv.style.borderBottom = "2px solid var(--p-line)";
                    wDiv.style.fontWeight = 'bold';
                    fragment.appendChild(wDiv);
                }
            });
            // Legacy wood
            if (saveState.wood && saveState.wood > 0) {
                const wDiv = document.createElement('div');
                wDiv.innerText = `Wood x${saveState.wood}`;
                wDiv.style.color = 'var(--p-sand)';
                wDiv.style.borderBottom = "2px solid var(--p-line)";
                wDiv.style.fontWeight = 'bold';
                fragment.appendChild(wDiv);
            }

            // ORE INVENTORY (Typed)
            if (!saveState.oreInventory) saveState.oreInventory = {};
            ORE_TYPES.forEach(oreType => {
                const count = saveState.oreInventory[oreType.id] || 0;
                if (count > 0) {
                    const oDiv = document.createElement('div');
                    oDiv.innerText = `${oreType.name} x${count}`;
                    oDiv.style.color = oreType.color;
                    oDiv.style.borderBottom = "2px solid var(--p-line)";
                    oDiv.style.fontWeight = 'bold';
                    fragment.appendChild(oDiv);
                }
            });
            // Legacy stone
            if (saveState.stone && saveState.stone > 0) {
                const sDiv = document.createElement('div');
                sDiv.innerText = `Stone x${saveState.stone}`;
                sDiv.style.color = 'var(--p-text-dim)';
                sDiv.style.borderBottom = "2px solid var(--p-line)";
                sDiv.style.fontWeight = 'bold';
                fragment.appendChild(sDiv);
            }

            // FLOWER INVENTORY (Typed)
            if (!saveState.flowerInventory) saveState.flowerInventory = {};
            FLOWER_TYPES.forEach(flowerType => {
                const count = saveState.flowerInventory[flowerType.id] || 0;
                if (count > 0) {
                    const fDiv = document.createElement('div');
                    fDiv.innerText = `${flowerType.name} x${count}`;
                    fDiv.style.color = flowerType.color;
                    fDiv.style.borderBottom = "2px solid var(--p-line)";
                    fDiv.style.fontWeight = 'bold';
                    fragment.appendChild(fDiv);
                }
            });

            for (let i = totalFish - 1; i >= 0; i--) {
                const f = saveState.inventory[i];
                if (!f || typeof f !== 'object') continue;
                const div = document.createElement('div');

                let label = f.name;
                if (f.tierId !== 'normal') label += ` (${f.tierName})`;
                if (f.sizeLabel && f.sizeLabel !== 'Normal') label += ` [${f.sizeLabel}]`;

                div.innerText = label;
                div.style.fontSize = "15px";
                div.style.borderBottom = "2px solid var(--p-line)";
                fragment.appendChild(div);
            }
            UICache.lEl.appendChild(fragment);
        }
    }
}

// --- MERCHANT SHOP SYSTEM ---
function toggleMerchant() {
    let merchantUI = document.getElementById('merchant-ui');

    if (merchantUI && merchantUI.style.display === 'flex') {
        merchantUI.style.display = 'none';
        return;
    }

    const shopUI = document.getElementById('shop-ui'); // Close other shops
    if (shopUI) shopUI.style.display = 'none';

    if (!merchantUI) {
        merchantUI = document.createElement('div');
        merchantUI.id = 'merchant-ui';
        merchantUI.className = 'overlay-screen';
        document.body.appendChild(merchantUI);
    }

    updateMerchantUI(merchantUI);
    merchantUI.style.display = 'flex';
}

function updateMerchantUI(container) {
    if (!container) return;
    let totalFishValue = 0;
    let totalFishCount = 0;
    const invSlotsFish = [];
    if (Array.isArray(saveState.invSlots)) {
        saveState.invSlots.forEach(s => {
            if (s && s.type === 'fish') {
                const f = (typeof getFishByName === 'function') ? getFishByName(s.name) : null;
                const price = getFishSellPrice(s.name);
                const count = s.count || 1;
                totalFishValue += price * count;
                totalFishCount += count;
                invSlotsFish.push(s);
            }
        });
    }

    // Calculate Wood Value from typed inventory
    if (!saveState.woodInventory) saveState.woodInventory = {};
    let totalWoodValue = 0;
    let totalWoodCount = 0;
    Object.keys(saveState.woodInventory).forEach(woodId => {
        const count = saveState.woodInventory[woodId] || 0;
        const woodType = WOOD_TYPES.find(w => w.id === woodId);
        if (woodType && count > 0) {
            totalWoodValue += count * woodType.price;
            totalWoodCount += count;
        }
    });
    // Legacy wood conversion
    if (saveState.wood && saveState.wood > 0) {
        totalWoodValue += saveState.wood * 20;
        totalWoodCount += saveState.wood;
    }

    // Calculate Ore Value from typed inventory
    if (!saveState.oreInventory) saveState.oreInventory = {};
    let totalOreValue = 0;
    let totalOreCount = 0;
    Object.keys(saveState.oreInventory).forEach(oreId => {
        const count = saveState.oreInventory[oreId] || 0;
        const oreType = ORE_TYPES.find(o => o.id === oreId);
        if (oreType && count > 0) {
            totalOreValue += count * oreType.price;
            totalOreCount += count;
        }
    });
    // Legacy stone conversion
    if (saveState.stone && saveState.stone > 0) {
        totalOreValue += saveState.stone * 30;
        totalOreCount += saveState.stone;
    }

    // Calculate Flower Value from typed inventory
    if (!saveState.flowerInventory) saveState.flowerInventory = {};
    let totalFlowerValue = 0;
    let totalFlowerCount = 0;
    Object.keys(saveState.flowerInventory).forEach(flowerId => {
        const count = saveState.flowerInventory[flowerId] || 0;
        const flowerType = FLOWER_TYPES.find(f => f.id === flowerId);
        if (flowerType && count > 0) {
            totalFlowerValue += count * flowerType.price;
            totalFlowerCount += count;
        }
    });

    // Trading raises what the Merchant pays for wood, ore and flowers. Fish
    // already include it through getFishSellPrice().
    const tradeMult = (typeof tradingSellMultiplier === 'function') ? tradingSellMultiplier() : 1;
    totalWoodValue = Math.round(totalWoodValue * tradeMult);
    totalOreValue = Math.round(totalOreValue * tradeMult);
    totalFlowerValue = Math.round(totalFlowerValue * tradeMult);

    // AXE LOGIC
    const axeTool = TOOLS.find(t => t.id === 'axe');
    let axeBtn = '';
    if (axeTool) {
        const hasAxe = saveState.unlockedTools.includes('axe');
        if (hasAxe) {
            axeBtn = `<button class="btn-lg btn-green" disabled style="width:100%;">Axe Owned</button>`;
        } else {
            const canAfford = saveState.money >= axeTool.price;
            const style = canAfford ? 'width:100%;' : 'width:100%; opacity:0.5; cursor:not-allowed;';
            axeBtn = `<button class="btn-lg" style="${style}" onclick="actionBuyTool('axe')">Buy Axe ($${axeTool.price})</button>`;
        }
    }

    // PICKAXE LOGIC
    let pickBtn = '';
    const pickTool = TOOLS.find(t => t.id === 'pickaxe');
    if (pickTool) {
        const hasPick = (saveState.unlockedTools || []).includes('pickaxe');
        if (hasPick) {
            pickBtn = `<button class="btn-lg btn-green" disabled style="width:100%;">Pickaxe Owned</button>`;
        } else {
            const canAfford = saveState.money >= pickTool.price;
            const style = canAfford ? 'width:100%;' : 'width:100%; opacity:0.5; cursor:not-allowed;';
            pickBtn = `<button class="btn-lg" style="${style}" onclick="actionBuyTool('pickaxe')">Buy Pickaxe ($${pickTool.price})</button>`;
        }
    } else {
        // Fallback for debugging if it's missing from TOOLS collection
        console.warn("Pickaxe not found in TOOLS!");
    }

    // ROWBOAT LOGIC (Sailing)
    let boatBtn = '';
    const boatTool = TOOLS.find(t => t.id === 'boat');
    if (boatTool) {
        if (saveState.hasBoat) {
            boatBtn = `<button class="btn-lg btn-green" disabled style="width:100%;">Rowboat Owned</button>`;
        } else {
            const canAfford = saveState.money >= boatTool.price;
            const style = canAfford ? 'width:100%;' : 'width:100%; opacity:0.5; cursor:not-allowed;';
            boatBtn = `<button class="btn-lg" style="${style}" onclick="actionBuyTool('boat')">Buy Rowboat ($${boatTool.price})</button>`;
        }
    }

    container.innerHTML = `
        <div style="background:var(--p-face); padding:30px; border-radius:0; border:2px solid var(--p-line);
                    box-shadow: inset 1px 1px 0 var(--p-bevel), inset -1px -1px 0 var(--p-bevel-dark), 0 4px 0 rgba(0,0,0,0.5);
                    width:350px; text-align:center; position:relative; max-width:90%;
                    max-height: 90vh; overflow-y: auto;">

            <h2 style="margin-top:0; font-size: 16px;">Merchant</h2>
            <div style="font-family:var(--font-display); font-size:16px; color:var(--p-gold); margin-bottom:20px;">$${Number(saveState.money) || 0}</div>

            <h3 style="color:var(--p-sand); border-bottom:2px solid var(--p-line); padding-bottom:5px; margin-top:0;">Sell</h3>
            ${tradeMult > 1 ? `<div style="font-size:10px; color:var(--p-good); margin:-2px 0 8px;">Trading bonus: +${Math.round((tradeMult - 1) * 100)}%</div>` : ''}

            <h3 style="color:var(--p-sand); border-bottom:2px solid var(--p-line); padding-bottom:5px; margin-top:0;">Sell Fish (click to sell one)</h3>
            <div id="merchant-fish-grid" style="display:grid; grid-template-columns: repeat(6, 1fr); gap:6px; margin-bottom:20px; margin-top:10px; max-height:220px; overflow-y:auto; padding:8px; background:var(--p-sunken); border:2px solid var(--p-line);">
                ${invSlotsFish.map(s => {
                    const f = (typeof getFishByName === 'function') ? getFishByName(s.name) : null;
                    const price = getFishSellPrice(s.name);
                    const count = s.count || 1;
                    return `<div style="width:60px;height:60px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;cursor:pointer;border:1px solid var(--p-line);background:var(--p-face-2);"
                        onclick="sellOneFish('${s.name.replace(/'/g, "\\'")}')">
                        ${(() => { try { const tex = createFishTexture(s.name, s.color); return `<img src="${tex.image.toDataURL()}" width="40" height="40" style="image-rendering:pixelated;">`; } catch(e){ return '🐟'; } })()}
                        <div style="font-size:9px; color:#fff; position:absolute; bottom:2px; right:4px; background:rgba(0,0,0,0.7); padding:0 2px;">x${count}</div>
                        <div style="font-size:9px; color:var(--p-gold);">$${price}</div>
                    </div>`;
                }).join('') || '<div style="color:var(--p-text-dim); grid-column:1/-1;">No fish to sell.</div>'}
            </div>
            <button class="btn-lg" onclick="sellAllFish()" ${totalFishValue === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                Sell All Fish ($${totalFishValue})
            </button>

            <h3 style="color:var(--p-sand); border-bottom:2px solid var(--p-line); padding-bottom:5px; margin-top:0;">Sell Other</h3>
            <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px; margin-top: 10px;">
                <button class="btn-lg" onclick="actionSellWood()" ${totalWoodCount === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                    Sell Wood (${totalWoodCount}x = $${totalWoodValue})
                </button>
                <button class="btn-lg" onclick="actionSellOre()" ${totalOreCount === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                    Sell Ore (${totalOreCount}x = $${totalOreValue})
                </button>
                <button class="btn-lg" onclick="actionSellFlowers()" ${totalFlowerCount === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                    Sell Flowers (${totalFlowerCount}x = $${totalFlowerValue})
                </button>
            </div>

            <h3 style="color:var(--p-sand); border-bottom:2px solid var(--p-line); padding-bottom:5px;">Tools</h3>

            <div style="display:flex; flex-direction:column; gap:10px; margin-bottom: 20px; margin-top: 10px;">
                ${axeBtn}
                ${pickBtn}
                ${boatBtn}
            </div>

            <button class="close-x-btn" onclick="document.getElementById('merchant-ui').style.display='none'">×</button>
        </div>
    `;
}

function reconcileFishInventory(){
    ensureInventorySlots();const counts=new Map();
    for(const slot of saveState.invSlots)if(slot?.type==='fish')counts.set(slot.name,(counts.get(slot.name)||0)+(slot.count||1));
    saveState.inventory=(Array.isArray(saveState.inventory)?saveState.inventory:[]).filter(fish=>{const left=counts.get(fish?.name)||0;if(!left)return false;counts.set(fish.name,left-1);return true;});
}
function refreshCookingAfterSale(){
    window.GuidedTutorial?.event('sold');
    reconcileFishInventory();
    if(document.getElementById('cooking-ui')?.style.display==='flex')renderCookingUI();
}
function availableCookingFish(){
    ensureInventorySlots();const counts=new Map();
    for(const slot of saveState.invSlots)if(slot?.type==='fish')counts.set(slot.name,(counts.get(slot.name)||0)+(slot.count||1));
    const result=[];(saveState.inventory||[]).forEach((f,idx)=>{if(!isCookableFish(f))return;const left=counts.get(f.name)||0;if(left>0){result.push({idx,f});counts.set(f.name,left-1);}});return result;
}

window.sellOneFish = function (name) {
    ensureInventorySlots();
    const slot = saveState.invSlots.find(s => s && s.type === 'fish' && s.name === name);
    if (!slot) { showToast("No such fish."); return; }
    const f = (typeof getFishByName === 'function') ? getFishByName(name) : null;
    const price = getFishSellPrice(name);
    const idx = saveState.invSlots.indexOf(slot);
    if ((slot.count || 1) > 1) {
        slot.count--;
    } else {
        if (idx !== -1) saveState.invSlots[idx] = null;
    }
    // remove from hotbar if count 0? keep hotbar as is (shows fish)
    autoSortInventory();
    saveState.money += price;
    refreshCookingAfterSale();
    saveGame();
    Sound.sell();
    showToast(`Sold 1 ${name} for $${price}!`);
    updateMerchantUI(document.getElementById('merchant-ui'));
    updateHotbarVisuals();
};

window.sellFishSpecies = function (name) {
    ensureInventorySlots();
    const slot = saveState.invSlots.find(s => s && s.type === 'fish' && s.name === name);
    if (!slot) { showToast("No such fish."); return; }
    const f = (typeof getFishByName === 'function') ? getFishByName(name) : null;
    const price = getFishSellPrice(name);
    const count = slot.count || 1;
    const total = price * count;
    // remove slot
    const idx = saveState.invSlots.indexOf(slot);
    if (idx !== -1) saveState.invSlots[idx] = null;
    // remove from hotbar
    for (let i = 0; i < saveState.hotbar.length; i++) {
        if (saveState.hotbar[i] && saveState.hotbar[i].type === 'fish' && saveState.hotbar[i].name === name) saveState.hotbar[i] = null;
    }
    // auto-sort
    autoSortInventory();
    saveState.money += total;
    refreshCookingAfterSale();
    saveGame();
    Sound.sell();
    showToast(`Sold ${count} ${name} for $${total}!`);
    updateMerchantUI(document.getElementById('merchant-ui'));
    updateHotbarVisuals();
};

window.sellAllFish = function () {
    ensureInventorySlots();
    let totalVal = 0, count = 0;
    for (let i = 0; i < saveState.invSlots.length; i++) {
        const s = saveState.invSlots[i];
        if (s && s.type === 'fish') {
            const f = (typeof getFishByName === 'function') ? getFishByName(s.name) : null;
            const price = getFishSellPrice(s.name);
            const c = s.count || 1;
            totalVal += price * c;
            count += c;
            saveState.invSlots[i] = null;
        }
    }
    // clear hotbar fish
    for (let i = 0; i < saveState.hotbar.length; i++) {
        if (saveState.hotbar[i] && saveState.hotbar[i].type === 'fish') saveState.hotbar[i] = null;
    }
    autoSortInventory();
    if (totalVal === 0) { showToast("No fish to sell!"); return; }
    saveState.money += totalVal;
    refreshCookingAfterSale();
    saveGame();
    Sound.sell();
    showToast(`Sold ${count} fish for $${totalVal}!`);
    updateMerchantUI(document.getElementById('merchant-ui'));
    updateHotbarVisuals();
};

function autoSortInventory() {
    if (!Array.isArray(saveState.invSlots)) return;
    const items = saveState.invSlots.filter(s => s !== null);
    for (let i = 0; i < saveState.invSlots.length; i++) {
        saveState.invSlots[i] = i < items.length ? items[i] : null;
    }
}

window.actionSellFish = function () {
    ensureInventorySlots();
    let totalVal = 0;
    let count = 0;
    saveState.invSlots.forEach(s => {
        if (s && s.type === 'fish') {
            const f = (typeof getFishByName === 'function') ? getFishByName(s.name) : null;
            const price = getFishSellPrice(s.name);
            const c = s.count || 1;
            totalVal += price * c;
            count += c;
        }
    });
    if (totalVal === 0) { showToast("No fish to sell!"); return; }

    // Clear fish slots
    for (let i = 0; i < saveState.invSlots.length; i++) {
        if (saveState.invSlots[i] && saveState.invSlots[i].type === 'fish') saveState.invSlots[i] = null;
    }
    autoSortInventory();
    // Also clear hotbar fish
    for (let i = 0; i < saveState.hotbar.length; i++) {
        if (saveState.hotbar[i] && saveState.hotbar[i].type === 'fish') saveState.hotbar[i] = null;
    }

    saveState.money += totalVal;
    refreshCookingAfterSale();
    saveGame();
    Sound.sell();
    showToast(`Sold ${count} fish for $${totalVal}!`);
    updateMerchantUI(document.getElementById('merchant-ui'));

    // NPC Animation
    if (npcMerchant) {
        const s = npcMerchant.getObjectByName("playerSprite");
        if (s) { s.scale.set(1.2, 1.2, 1.2); setTimeout(() => { s.scale.set(1, 1, 1); }, 200); }
    }
};

window.actionSellWood = function () {
    // Calculate total from typed inventory
    if (!saveState.woodInventory) saveState.woodInventory = {};
    let total = 0;
    let count = 0;
    Object.keys(saveState.woodInventory).forEach(woodId => {
        const amt = saveState.woodInventory[woodId] || 0;
        const woodType = WOOD_TYPES.find(w => w.id === woodId);
        if (woodType && amt > 0) {
            total += amt * woodType.price;
            count += amt;
        }
    });
    // Legacy wood
    if (saveState.wood && saveState.wood > 0) {
        total += saveState.wood * 20;
        count += saveState.wood;
    }

    if (count <= 0) { showToast("No wood!"); return; }
    total = Math.round(total * (typeof tradingSellMultiplier === 'function' ? tradingSellMultiplier() : 1));

    // Server Authority Check

    saveState.woodInventory = {};
    saveState.wood = 0;
    saveState.money += total;
    saveGame();
    Sound.sell();
    showToast(`Sold ${count} wood for $${total}!`);
    updateMerchantUI(document.getElementById('merchant-ui'));
    updateUI(); // Refresh inventory display
};

window.actionSellOre = function () {
    // Calculate total from typed inventory
    if (!saveState.oreInventory) saveState.oreInventory = {};
    let total = 0;
    let count = 0;
    Object.keys(saveState.oreInventory).forEach(oreId => {
        const amt = saveState.oreInventory[oreId] || 0;
        const oreType = ORE_TYPES.find(o => o.id === oreId);
        if (oreType && amt > 0) {
            total += amt * oreType.price;
            count += amt;
        }
    });
    // Legacy stone
    if (saveState.stone && saveState.stone > 0) {
        total += saveState.stone * 30;
        count += saveState.stone;
    }

    if (count <= 0) { showToast("No ore!"); return; }
    total = Math.round(total * (typeof tradingSellMultiplier === 'function' ? tradingSellMultiplier() : 1));

    // Server Authority Check

    saveState.oreInventory = {};
    saveState.stone = 0;
    saveState.money += total;
    saveGame();
    Sound.sell();
    showToast(`Sold ${count} ore for $${total}!`);
    updateMerchantUI(document.getElementById('merchant-ui'));
    updateUI(); // Refresh inventory display
};

window.actionSellFlowers = function () {
    // Deprecated? Or just keeps functionality for legacy inventory
    // Calculate total from typed inventory
    if (!saveState.flowerInventory) saveState.flowerInventory = {};
    let total = 0;
    let count = 0;
    Object.keys(saveState.flowerInventory).forEach(flowerId => {
        const amt = saveState.flowerInventory[flowerId] || 0;
        const flowerType = FLOWER_TYPES.find(f => f.id === flowerId);
        if (flowerType && amt > 0) {
            total += amt * flowerType.price;
            count += amt;
        }
    });

    if (count <= 0) { showToast("No flowers!"); return; }
    total = Math.round(total * (typeof tradingSellMultiplier === 'function' ? tradingSellMultiplier() : 1));

    // Server Authority Check

    saveState.flowerInventory = {};
    // Clear invSlots flowers
    if (Array.isArray(saveState.invSlots)) {
        for (let i = 0; i < saveState.invSlots.length; i++) {
            if (saveState.invSlots[i] && saveState.invSlots[i].type === 'flower') saveState.invSlots[i] = null;
        }
        const items = saveState.invSlots.filter(s => s !== null);
        for (let i = 0; i < saveState.invSlots.length; i++) saveState.invSlots[i] = i < items.length ? items[i] : null;
    }
    saveState.money += total;
    saveGame();
    Sound.sell();
    showToast(`Sold ${count} flowers for $${total}!`);
    updateMerchantUI(document.getElementById('merchant-ui'));
    updateUI(); // Refresh inventory display
};

// --- FLOWER COLLECTION SYSTEM ---
// Returns true if a nearby, unpicked flower was collected. Shared by the
// desktop "interact" key and the mobile action button so both behave alike.
function tryPickNearbyFlower() {
    for (let i = 0; i < pickableFlowers.length; i++) {
        const flower = pickableFlowers[i];
        if (flower && !flower.userData.isPicked && flower.visible) {
            const dist = player.position.distanceTo(flower.position);
            if (dist < 2) {
                pickFlower(i);
                return true;
            }
        }
    }
    return false;
}

// `fromNetwork` marks a pick another player already made: hide the flower and
// start its local respawn timer, but never grant rewards or rebroadcast it.
window.pickFlower = function (i, fromNetwork = false) {
    const flower = pickableFlowers[i];
    if (!flower || flower.userData.isPicked) return;

    // Mark as picked
    flower.userData.isPicked = true;
    flower.visible = false;

    // Respawn Logic (1 minute cooldown)
    setTimeout(() => {
        respawnFlower(i);
    }, 60000);

    if (fromNetwork) return;

    // Get Data
    const typeId = flower.userData.typeId || 'daisy'; // Default fallback
    const flowerType = FLOWER_TYPES.find(f => f.id === typeId) || FLOWER_TYPES[0];

    // Rewards
    const xp = flowerType.xp || 5;
    const money = 0; // Flowers are now sold at the Merchant instead of instant money.

    // Apply
    addSkillXP('floristry', xp);
    if (!saveState.flowerInventory) saveState.flowerInventory = {};
    saveState.flowerInventory[flowerType.id] = (saveState.flowerInventory[flowerType.id] || 0) + 1;

    // Add to grid inventory
    try {
        ensureInventorySlots();
        const existing = saveState.invSlots.find(s => s && s.type === 'flower' && s.id === flowerType.id);
        if (existing) existing.count = (existing.count || 1) + 1;
        else {
            const empty = saveState.invSlots.findIndex(s => s === null);
            if (empty !== -1) saveState.invSlots[empty] = { type: 'flower', id: flowerType.id, name: flowerType.name, color: flowerType.color, count: 1 };
        }
        autoSortInventory();
    } catch (e) { }

    saveGame();

    // Feedback
    showToast(`Picked ${flowerType.name}: +${xp} XP`, 'success');
    updateUI();

    // Tell the room. The host relays a guest's pick to everyone else.
    const msg = { type: 'pick_flower', index: i };
    if (isHost) {
        broadcastToClients(msg);
    } else if (hostConn && hostConn.open) {
        hostConn.send(msg);
    }
}

window.actionBuyTool = function (toolId) {
    const tool = TOOLS.find(t => t.id === toolId);
    if (!tool) return;
    if (saveState.money < tool.price) { showToast("Not enough money!"); return; }

    saveState.money -= tool.price;
    if (!saveState.unlockedTools) saveState.unlockedTools = ['hands', 'rod'];
    if (!saveState.unlockedTools.includes(toolId)) saveState.unlockedTools.push(toolId);

    if (toolId === 'guitar') saveState.hasGuitar = true;
    if (toolId === 'glove') saveState.hasGlove = true;
    if (toolId === 'boat') saveState.hasBoat = true;

    // Add to grid inventory
    try {
        ensureInventorySlots();
        const exists = saveState.invSlots.some(s => s && s.type === 'tool' && s.id === toolId);
        if (!exists) {
            const empty = saveState.invSlots.findIndex(s => s === null);
            if (empty !== -1) saveState.invSlots[empty] = { type: 'tool', id: toolId, name: tool.name };
        }
    } catch (e) { }

    // Auto-equip if possible or just refresh hotbar
    updateHotbarVisuals();
    saveGame();
    Sound.sell();
    showToast(`Purchased ${tool.name}!`);

    // Refresh whichever shop UI is open (Merchant, or the Stylist "misc" tab).
    const shopOverlay = document.getElementById('shop-overlay');
    if (shopOverlay && shopOverlay.style.display === 'flex' && typeof renderShop === 'function') {
        renderShop();
    }
    // Only refresh the merchant sheet if it actually exists on screen.
    const merchantEl = document.getElementById('merchant-ui');
    if (merchantEl) updateMerchantUI(merchantEl);
};

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
    } catch (e) { }
}

window.copyRoomId = function () {
    if (!currentRoomId) return;


    if (navigator.clipboard && navigator.clipboard.writeText) {
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
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints>0 && matchMedia('(pointer: coarse)').matches);
    document.body.classList.toggle('mobile-ui',isMobile);
    if(isMobile){document.getElementById('mobile-controls').style.display='block';window.MobileUI?.init();}
    checkOrientation();
}
function checkOrientation() {
    // Both portrait and landscape are supported by the touch layout.
    const overlay=document.getElementById('rotate-overlay');if(overlay)overlay.style.display='none';
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

    } catch (e) { console.error("Error listing devices", e); }
}

window.changeAudioInput = function (deviceId) {
    saveState.micId = deviceId;
    saveGame();
    initAudio(deviceId);
}

function setupVoiceAnalysis(stream, id) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
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
    const col = isMicMuted ? 'var(--p-bad)' : 'var(--p-good)';
    if (localStream) {
        if (el) { el.innerText = txt; el.style.color = col; }
        if (mobEl) { mobEl.innerText = isMobile?(isMicMuted?'Voice muted':'Voice on'):txt; mobEl.style.color = col;mobEl.setAttribute('aria-pressed',String(!isMicMuted)); }
    } else {
        if (el) { el.innerText = '🚫'; el.style.color = 'var(--p-text-mute)'; }
        if (mobEl) { mobEl.innerText = isMobile?'Voice unavailable':'🚫'; mobEl.style.color = 'var(--p-text-mute)'; }
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
        audio.play().catch(e => { });
        setupVoiceAnalysis(remoteStream, remoteId);
    });
    call.on('close', () => {
        const el = document.getElementById(`audio-${remoteId}`);
        if (el) el.remove();
        delete voiceConnections[remoteId];
        delete voiceAnalysers[remoteId];
    });
    call.on('error', (err) => {
        console.error("Call error:", err);
        delete voiceConnections[remoteId];
    });
}

function voiceWatchdog() {

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
                try { call.close(); } catch (e) { }
                delete voiceConnections[peerId];

                const playerEntry = Object.values(otherPlayers).find(p => p.voiceId === peerId);
                if (playerEntry) playerEntry.voiceId = null;
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
// Background tabs throttle animation frames; keep proximity volume moving.
setInterval(syncRemoteVoiceVolumes, 500);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (typeof audioCtx !== 'undefined' && audioCtx?.state === 'suspended') audioCtx.resume();
    syncRemoteVoiceVolumes();
});

function setVoiceActivity(mesh, average, enabled) {
    if(!mesh||!mesh.userData)return;
    const u=mesh.userData,now=performance.now();u.voiceEnabled=!!enabled;u.voiceSampleAt=now;
    const level=enabled&&Number.isFinite(average)?Math.max(0,Math.min(1,(average-10)/60)):0;
    u.voiceLevel=enabled?(u.voiceLevel||0)*.45+level*.55:0;
    if(level>0)u.voiceHoldUntil=now+90;
    if(!enabled)u.voiceHoldUntil=0;
}
const VOICE_DATA_ARRAY = new Uint8Array(32);
// Proximity volume must not depend on requestAnimationFrame: a background tab
// throttles rendering, but incoming voice packets and timers keep running.
function syncRemoteVoiceVolumes() {
    if (!player || typeof MAX_VOICE_DISTANCE === 'undefined') return;
    const localHouse = window.Housing ? Housing.owner : '';
    Object.keys(otherPlayers).forEach(pid => {
        const p = otherPlayers[pid],analyserId = p.voiceId || pid;
        const audioEl = document.getElementById(`audio-${analyserId}`);
        if (!audioEl) return;
        const isolated = (p.lastData?.houseOwner || '') !== localHouse;
        const muted = !!(p.lastData && p.lastData.isVoiceMuted) || localMutedVoice.includes(pid);
        audioEl.muted = muted;
        if (isolated || muted) { audioEl.volume = 0; return; }
        const remote = p.targetPos || p.mesh.position;
        const dist = player.position.distanceTo(remote);
        audioEl.volume = dist > MAX_VOICE_DISTANCE
            ? 0
            : Math.max(0, Math.min(1, (1 - dist / MAX_VOICE_DISTANCE) * saveState.voiceVolume));
        if (audioEl.paused) audioEl.play().catch(() => {});
    });
}
function updateVoiceVisuals() {
    const dataArray = VOICE_DATA_ARRAY;

    // 1. Local Player
    if (voiceAnalysers['local'] && !isMicMuted && player) {
        voiceAnalysers['local'].getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setVoiceActivity(player,avg,true);
        const icon = player.getObjectByName('talkingIcon');
        if (icon) icon.visible = hudVisible && avg > 10;
    } else if (player) {
        setVoiceActivity(player,0,false);
        const icon = player.getObjectByName('talkingIcon');
        if (icon) icon.visible = false;
    }

    // 2. Remote Players
    Object.keys(otherPlayers).forEach(pid => {
        const p = otherPlayers[pid];
        const analyserId = p.voiceId || pid;
        const localHouse=window.Housing?Housing.owner:'';
        if((p.lastData.houseOwner||'')!==localHouse){const isolated=document.getElementById('audio-'+analyserId);if(isolated)isolated.volume=0;const icon=p.mesh.getObjectByName('talkingIcon');if(icon)icon.visible=false;setVoiceActivity(p.mesh,0,false);return;}

        // CHECK MUTE STATUS
        const isGloballyMuted = p.lastData && p.lastData.isVoiceMuted;
        const isLocallyMuted = localMutedVoice.includes(pid);
        const isMuted = isGloballyMuted || isLocallyMuted;

        let audioEl = document.getElementById(`audio-${analyserId}`);

        if (isMuted) {
            setVoiceActivity(p.mesh,0,false);
            // --- FIX: HARD MUTE ---
            // Setting .muted = true cuts audio instantly, even if stream is active
            if (audioEl) audioEl.muted = true;

            const icon = p.mesh.getObjectByName('talkingIcon');
            if (icon) icon.visible = false;
        }
        else if (voiceAnalysers[analyserId]) {
            // --- UNMUTE IF CLEAN ---
            if (audioEl) audioEl.muted = false;

            voiceAnalysers[analyserId].getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            const icon = p.mesh.getObjectByName('talkingIcon');
            setVoiceActivity(p.mesh,avg,!!player && player.position.distanceTo(p.mesh.position)<=MAX_VOICE_DISTANCE);
            if (icon) icon.visible = hudVisible && avg > 10;
        } else {
            setVoiceActivity(p.mesh,0,false);
            const icon = p.mesh.getObjectByName('talkingIcon');
            if (icon) icon.visible = false;
        }
    });
    syncRemoteVoiceVolumes();
}

// --- GAME INITIALIZATION & LOBBY ---
window.onload = function () {
    loadSave();

    // Stamp the version labels from GAME_VERSION so the loading screen and the
    // lobby screen can never disagree with what's sent over the network.
    const verLabel = document.getElementById('version');
    if (verLabel) verLabel.textContent = GAME_VERSION;
    const lobbyVerLabel = document.getElementById('lobby-version');
    if (lobbyVerLabel) lobbyVerLabel.textContent = GAME_VERSION;

    // Seed the progression counters (daily bounties, money baseline, and any
    // achievements the save already qualifies for) before the first frame.
    if (typeof ensureProgression === 'function') {
        ensureProgression();
        ensureBounties();
        progressionTrackMoney();
        checkAchievements(true);
        checkQuests(true);
    }
    checkMobile();
    document.getElementById('loading').style.display = 'none';
    document.body.classList.remove('game-active');
    document.getElementById('lobby-screen').style.display = 'flex';

    // Wire the lobby buttons BEFORE building the world. World generation can
    // throw (e.g. a bad custom level); when it did, the old order left these
    // buttons unwired and only MAKE LOBBY dead, which looked like a UI bug
    // rather than a world-building failure.
    // MAKE LOBBY opens the dedicated creation screen; JOIN uses a room code.
    const btnMakeLobby = document.getElementById('btn-make-lobby');
    if (btnMakeLobby) btnMakeLobby.onclick = openCreateLobby;
    const btnHostLegacy = document.getElementById('btn-host');
    if (btnHostLegacy) btnHostLegacy.onclick = hostGame;
    document.getElementById('btn-join').onclick = joinGame;

    // If world building fails we still have a usable lobby screen; report the
    // problem instead of dying silently.
    try {
        setupThreeJS();
        setupInputs();
        animate();
        initAudio();
    } catch (err) {
        console.error('[world] setup failed:', err);
        const statusEl = document.getElementById('lobby-status');
        if (statusEl) statusEl.innerText = "World failed to load: " + (err && err.message ? err.message : err);
    }

    const btnAdmin = document.getElementById('btn-admin-login');
    if (btnAdmin) {
        btnAdmin.style.display = 'none';
        btnAdmin.onclick = toggleHostPanel;
    }

    // A multiplayer level hand-off reloads the page with ?custom=1, so rejoin
    // the room/server automatically instead of parking the player in the lobby.
    try {
        const params = new URLSearchParams(location.search);
        const autoRoom = params.get('room');
        if (autoRoom) {
            document.getElementById('room-id-input').value = autoRoom;
            document.getElementById('lobby-status').innerText = "Rejoining room " + autoRoom + "...";
            setTimeout(() => joinGame(), 400);
        }
    } catch (err) { /* ignore */ }

    // --- CRITICAL FIX: REMOVED THE 3-SECOND SETNAME INTERVAL ---
    // This interval was causing the "leaving/rejoining" loop.
};

function generateRoomId() { return 'fish-' + Math.floor(1000 + Math.random() * 9000); }
function hostGame() {
    saveGame();
    const roomId = generateRoomId();
    // Read the lobby name up front so the host panel can show it immediately.
    myLobbyName = lobbyNameFromUI();
    document.getElementById('lobby-status').innerText = "Creating Room...";


    sessionStorage.removeItem('banned_ids');
    window.NetworkGuard?.reset();

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

        // Announce the lobby to the master server so players can find it
        // without a room code. Kept alive by a heartbeat while we host.
        myLobbyName = lobbyNameFromUI();
        startLobbyHeartbeat();

        generateWorld(roomId);
        startGame();
    });

    peer.on('connection', (conn) => {
        // Check if incoming peer is on the ban list for this session.
        const bannedList = JSON.parse(sessionStorage.getItem('banned_ids') || '[]');
        const incomingDeviceID = typeof conn.metadata?.deviceID==='string'&&conn.metadata.deviceID.length<=64?conn.metadata.deviceID:null;

        if(window.NetworkGuard?.blockedJoin(conn.peer,incomingDeviceID)||Object.keys(clientConns).length>=32){
            conn.on('open',()=>{try{conn.send({type:'error',message:'Connection temporarily refused: room limit or recent abusive traffic.'});}finally{conn.close();}});
            return;
        }
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
            } catch (e) { console.warn("Could not close old conn", e); }

            // Remove the old player entity so we can make a fresh one
            removePlayer(conn.peer);
        }

        // Setup new connection handlers.
        conn.on('data', (data) => handleDataFromClient(conn.peer, data));
        conn.on('close', () => {
            // Only remove if this is still the active connection
            if (clientConns[conn.peer] === conn) {

                cleanupPeerConnection(conn);
            }
        });


        conn.deviceID = incomingDeviceID;
        clientConns[conn.peer] = conn;

        // Hand over the level for this room — including an explicit "none", so a
        // player who arrives with their own level drops it and everybody sees
        // the same world. The client reloads with ?custom=1 to build it.
        const sendLevel = () => {
            let serialized = null;
            if (window.CUSTOM_LEVEL && window.Level) {
                try { serialized = window.Level.serialize(window.CUSTOM_LEVEL); }
                catch (err) { console.warn('Could not serialize level', err); }
            }
            const json = serialized ? JSON.stringify(serialized) : 'null';
            try {
                if (json.length <= LEVEL_CHUNK) {
                    conn.send({ type: 'worldLevel', level: serialized });
                    return;
                }
                const total = Math.ceil(json.length / LEVEL_CHUNK);
                conn.send({ type: 'worldLevelStart', total: total });
                for (let i = 0; i < total; i++) {
                    conn.send({
                        type: 'worldLevelChunk', i: i,
                        part: json.slice(i * LEVEL_CHUNK, (i + 1) * LEVEL_CHUNK)
                    });
                }
            }
            catch (err) { console.warn('Could not send level to client', err); }
        };
        if (conn.open) sendLevel(); else conn.on('open', sendLevel);

        // Force an immediate update so they don't load into a void
        broadcastPlayerList();
        updateHostPanel();
        publishLobby(); // refresh the player count in the server browser
        showToast("Player Joined!");
    });

    peer.on('call', (call) => {
        if (localStream) call.answer(localStream); else call.answer();
        handleCall(call);
    });
    peer.on('error', (err) => document.getElementById('lobby-status').innerText = "Error: ID taken or Net issue. Try again.");
}

function joinGame() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    saveGame();
    const roomToJoin = document.getElementById('room-id-input').value.trim();
    if (!roomToJoin) return;
    document.getElementById('lobby-status').innerText = "Connecting...";

    // --- FIX: Connection Logic ---
    const connectToHost = () => {
        console.log("Attempting to connect to host:", roomToJoin);
        const conn = peer.connect(roomToJoin);

        conn.on('open', () => {
            console.log("Connected to host!");
            document.getElementById('lobby-status').innerText = "Connected!";
            document.getElementById('lobby-screen').style.display = 'none';

            // Show Room UI
            document.getElementById('room-info-ui').style.display = 'block';
            document.getElementById('room-id-text').innerText = roomToJoin;
            document.getElementById('host-room-info').style.display = 'none'; // Not host

            currentRoomId = roomToJoin;
            isHost = false;
            hostConn = conn;

            // Setup Handlers
            conn.on('data', (data) => handleDataFromHost(data));
            conn.on('close', () => {
                alert("Disconnected from host.");
                location.reload();
            });
            conn.on('error', (err) => console.error("Connection Error:", err));

            // Start Game
            generateWorld(roomToJoin);
            startGame();

            // Send Hello
            conn.send({
                type: 'hello',
                name: saveState.displayName,
                peerId: myPeerId,
                saveState: saveState
            });
            showToast("Joined Room!");
        });

        conn.on('error', (err) => {
            console.error("Peer Connect Error:", err);
            document.getElementById('lobby-status').innerText = "Connection Failed: " + err;
        });
    };

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
            connectToHost();
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
                // Only worth reconnecting when the signaling link is actually
                // down — otherwise PeerJS throws out of this callback.
                setTimeout(() => {
                    try {
                        if (peer && !peer.destroyed && peer.disconnected) peer.reconnect();
                    } catch (e) { console.warn('Reconnect skipped:', e); }
                }, 5000);
            }
        });

        peer.on('call', (call) => {
            if (localStream) call.answer(localStream); else call.answer();
            handleCall(call);
        });
    } else {
        if (peer.open) connectToHost();
        else peer.on('open', connectToHost);
    }
}

// ---------------------------------------------------------------------------
// CUSTOM LEVEL SYNC (multiplayer)
// A custom level only exists on the machine that edited it, so it has to be
// handed to everyone who joins. The receiving player reloads the page with
// ?custom=1 afterwards: the world is then built straight from the level on the
// first frame, which is far safer than swapping terrain, props and colliders
// out from under a running game. The level lives in sessionStorage so it
// covers exactly this tab and expires with it.
const LEVEL_SESSION_KEY = 'htmlfishing.level.session';
const LEVEL_HASH_KEY = 'htmlfishing.level.hash';
// WebRTC data channels refuse messages past a couple hundred KB, so a large
// map is split into parts at the host and glued back together here.
const LEVEL_CHUNK = 60000;
let levelNavPending = false;
let levelParts = null;

function levelFingerprint(level) {
    const json = JSON.stringify(window.Level.serialize(level));
    let h = 2166136261;
    for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
}

// Returns true when the page is about to navigate away to load the level.
function acceptHostLevel(level, rejoinQuery) {
    if (!level || !window.Level || levelNavPending) return false;
    let lv;
    try { lv = window.Level.normalize(level); } catch (err) { return false; }

    const hash = levelFingerprint(lv);
    // Already playing this exact level (e.g. rejoining the same room) -> stay.
    if (window.CUSTOM_LEVEL && levelFingerprint(window.CUSTOM_LEVEL) === hash) {
        try { sessionStorage.setItem(LEVEL_HASH_KEY, hash); } catch (err) { }
        return false;
    }

    try {
        sessionStorage.setItem(LEVEL_SESSION_KEY, JSON.stringify(window.Level.serialize(lv)));
        sessionStorage.setItem(LEVEL_HASH_KEY, hash);
    } catch (err) { return false; }

    const status = document.getElementById('lobby-status');
    if (status) status.innerText = "Loading the room's level...";
    showToast("Downloading the room's level...");
    levelNavPending = true;
    setTimeout(() => { location.href = 'index.html?custom=1' + (rejoinQuery || ''); }, 250);
    return true;
}

// The room/server plays the stock island, so drop whatever level we're on and
// come back without ?custom=1. The player's own saved level is untouched.
function dropActiveLevel(rejoinQuery) {
    if (!window.CUSTOM_LEVEL || levelNavPending) return false;
    try { sessionStorage.removeItem(LEVEL_SESSION_KEY); sessionStorage.removeItem(LEVEL_HASH_KEY); } catch (err) { }

    const status = document.getElementById('lobby-status');
    if (status) status.innerText = "Switching to the room's world...";
    levelNavPending = true;
    setTimeout(() => {
        const extra = (rejoinQuery || '').replace(/^&/, '');
        location.href = 'index.html' + (extra ? '?' + extra : '');
    }, 250);
    return true;
}


// ---------------------------------------------------------------------------
// MASTER SERVER (public lobby directory)
// ---------------------------------------------------------------------------
// The Python master server is a pure directory: it lists public lobbies so
// players can find each other without swapping room codes. Gameplay itself is
// untouched - a join is still a direct PeerJS/WebRTC connection to the host.
//
// POSTs go out as text/plain on purpose: the browser then treats them as
// "simple" requests, which skips the CORS preflight round-trip and lets the
// unload beacon fire reliably. The master parses the JSON body either way.
const MASTER_SERVER_URL = String(window.MASTER_SERVER_URL || '').replace(/\/+$/, '');
const MASTER_TIMEOUT_MS = 6000;
const LOBBY_HEARTBEAT_MS = 10000;

let lobbyHeartbeatTimer = null;
let lobbyPublished = false;
// Capability stays in this hosting tab only: never in a save, URL or listing.
let lobbyDirectorySession = null;
let lobbyDirectoryVerified = false;
let myLobbyName = '';
let serverBrowserTimer = null;

// The fixed tag vocabulary shared by the Make Lobby screen and the browser.
// Keeping it fixed means tags stay searchable and can't be used to smuggle
// arbitrary text into everyone's server list.
const LOBBY_TAGS = [
    'Chill', 'Competitive', 'Talkative', 'Quiet', 'Voice Chat',
    'Beginner Friendly', 'Grinding', 'Fishing Only', 'Mini Games',
    'Roleplay', 'Events', 'LGBTQ+ Friendly', 'No Swearing',
    'Mic On', 'Just Fun', 'Long Session'
];
const MAX_LOBBY_TAGS = 10;

// Server-browser filter state, kept in module scope so a refresh doesn't
// wipe what the player typed.
let browserTagFilter = new Set();
let browserAdultOnly = false;
let browserSort = 'players';

function masterEnabled() { return !!MASTER_SERVER_URL; }

async function masterRequest(path, body) {
    if (!masterEnabled()) throw new Error('No master server configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MASTER_TIMEOUT_MS);
    try {
        const res = await fetch(MASTER_SERVER_URL + path, {
            method: body === undefined ? 'GET' : 'POST',
            headers: body === undefined ? undefined : { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
            cache: 'no-store'
        });
        if (!res.ok) { const error=new Error('Master responded '+res.status);error.status=res.status;throw error; }
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

// --- lobby naming ---------------------------------------------------------

function defaultLobbyName() {
    const who = String(saveState.displayName || 'Fisher').slice(0, 16);
    return who + "'s Lobby";
}

function lobbyNameFromUI() {
    const input = document.getElementById('lobby-name-input');
    const typed = input && input.value ? input.value.trim() : '';
    return (typed || saveState.lobbyName || '').slice(0, 24) || defaultLobbyName();
}

function lobbyIsPublic() {
    const box = document.getElementById('lobby-public-input');
    if (box) return box.checked;
    return saveState.lobbyPublic !== false;
}

// --- Make Lobby screen ------------------------------------------------------
// A dedicated overlay so the main start menu stays uncluttered: the player
// names the lobby, decides whether it is listed, marks it 18+ and picks tags
// before any PeerJS connection is opened.

function lobbyDraft() {
    const nameInput = document.getElementById('lobby-name-input');
    const publicBox = document.getElementById('lobby-public-input');
    const adultBox = document.getElementById('lobby-adult-input');
    return {
        name: (nameInput && nameInput.value ? nameInput.value.trim() : '').slice(0, 24),
        isPublic: publicBox ? publicBox.checked : saveState.lobbyPublic !== false,
        adult: adultBox ? adultBox.checked : saveState.lobbyAdult === true
    };
}

function renderTagButtons(container, selected, onToggle) {
    if(!container)return;
    if(container.children.length!==LOBBY_TAGS.length){
        container.innerHTML='';
        for(const tag of LOBBY_TAGS)container.appendChild(document.createElement('button'));
    }
    LOBBY_TAGS.forEach((tagName,index) => {
        const btn = container.children[index];
        btn.type = 'button';
        btn.className = 'server-tag-filter';
        btn.textContent = tagName;
        const on = selected.has(tagName);
        btn.setAttribute('aria-pressed',String(on));
        btn.onclick = () => onToggle(tagName);
    });
}

function openCreateLobby() {
    const overlay = document.getElementById('create-lobby-overlay');
    if (!overlay) return;

    const nameInput = document.getElementById('lobby-name-input');
    if (nameInput) nameInput.value = saveState.lobbyName || '';
    const publicBox = document.getElementById('lobby-public-input');
    if (publicBox) publicBox.checked = saveState.lobbyPublic !== false;
    const adultBox = document.getElementById('lobby-adult-input');
    if (adultBox) adultBox.checked = saveState.lobbyAdult === true;

    const selected = new Set((Array.isArray(saveState.lobbyTags) ? saveState.lobbyTags : []).filter(tag=>LOBBY_TAGS.includes(tag)).slice(0,MAX_LOBBY_TAGS));
    const tagBox = document.getElementById('lobby-tag-buttons');
    const counter = document.getElementById('lobby-tag-count');

    const toggle = (tagName) => {
        if (selected.has(tagName)) selected.delete(tagName);
        else if (selected.size < MAX_LOBBY_TAGS) selected.add(tagName);
        else showToast('Tag limit reached (' + MAX_LOBBY_TAGS + ')');
        paint();
    };
    const paint = () => {
        if (counter) counter.textContent = selected.size + '/' + MAX_LOBBY_TAGS+' selected';
        renderTagButtons(tagBox, selected, toggle);
        const badges=document.getElementById('lobby-selected-tags');
        if(badges){
            badges.replaceChildren();
            if(!selected.size)badges.textContent='No tags selected · optional';
            else{
                const tags=[...selected];
                for(const tag of tags.slice(0,3)){const chip=document.createElement('span');chip.className='server-tag-chip';chip.textContent=tag;badges.appendChild(chip);}
                if(tags.length>3){const more=document.createElement('span');more.className='server-tag-chip more';more.textContent='+'+(tags.length-3);more.title=tags.slice(3).join(', ');badges.appendChild(more);}
            }
        }
        const clear=document.getElementById('lobby-clear-tags');if(clear)clear.disabled=!selected.size;
    };
    openCreateLobby._selected = selected;
    const drawer=document.getElementById('lobby-tag-drawer');if(drawer)drawer.open=false;
    const clear=document.getElementById('lobby-clear-tags');if(clear)clear.onclick=()=>{selected.clear();paint();};
    paint();

    overlay.style.display = 'flex';
    if (nameInput) nameInput.focus();
}

function closeCreateLobby() {
    const overlay = document.getElementById('create-lobby-overlay');
    if (overlay) overlay.style.display = 'none';
}

// Persists whatever the Make Lobby screen holds, then starts hosting.
window.createLobbyAndHost = function () {
    const draft = lobbyDraft();
    saveState.lobbyName = draft.name;
    saveState.lobbyPublic = draft.isPublic;
    saveState.lobbyAdult = draft.adult;
    saveState.lobbyTags = Array.from(openCreateLobby._selected || []).slice(0, MAX_LOBBY_TAGS);
    saveGame();
    closeCreateLobby();
    hostGame();
};

// Renames a live lobby and pushes the change to the master straight away.
window.setLobbyName = function (name) {
    const next = String(name || '').trim().slice(0, 24) || defaultLobbyName();
    const stored = next === defaultLobbyName() ? '' : next;

    saveState.lobbyName = stored;
    const input = document.getElementById('lobby-name-input');
    if (input) input.value = stored;

    const changed = next !== myLobbyName;
    myLobbyName = next;
    saveGame();

    if (changed) {
        publishLobby();
        showToast('Lobby renamed to "' + next + '"');
    }
};

// --- directory registration ----------------------------------------------

function lobbyPlayerCount() {
    return 1 + Object.keys(clientConns || {}).length;
}

// A fresh, unguessable listing id belongs to one hosting session. A tab that
// loses its capability creates a new listing rather than claiming an old id.
function lobbyDirectoryId() {
    if(lobbyDirectorySession&&!lobbyDirectorySession.closed&&lobbyDirectorySession.peerId===myPeerId)return lobbyDirectorySession.id;
    const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);
    lobbyDirectorySession={id:'lobby:'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),peerId:myPeerId,secret:null,closed:false,flight:null,removing:null,warned:false};
    return lobbyDirectorySession.id;
}

function removeOwnedLobby(session){
    if(!session?.secret)return Promise.resolve();
    if(session.removing)return session.removing;
    session.removing=masterRequest('/unregister',{id:session.id,lobbyId:session.id,lobby_secret:session.secret}).catch(()=>{});
    return session.removing;
}

async function publishLobby() {
    if (!isHost || !myPeerId || !masterEnabled()) return;

    if (!lobbyIsPublic()) {
        if (lobbyDirectorySession) unpublishLobby();
        return;
    }

    let session,ownsFlight=false;
    try {
        lobbyDirectoryId();session=lobbyDirectorySession;
        if(session.flight){await session.flight;return;}
        ownsFlight=true;
        session.flight=(async()=>{
        if(!lobbyDirectoryVerified){
            const health=await masterRequest('/health');
            if(health?.ownershipVersion!==1)throw new Error('Directory security update required; use room codes until the master is updated.');
            lobbyDirectoryVerified=true;
        }
        if(session.closed||!isHost||myPeerId!==session.peerId)return;
        const result=await masterRequest('/register', {
            kind: 'p2p',
            id: session.id,
            lobbyId: session.id,
            peerId: session.peerId,
            name: myLobbyName || defaultLobbyName(),
            host: saveState.displayName,
            players: lobbyPlayerCount(),
            room: session.peerId,
            version: GAME_VERSION,
            locked: false,
            tags: Array.isArray(saveState.lobbyTags) ? saveState.lobbyTags.slice(0, MAX_LOBBY_TAGS) : [],
            adult: saveState.lobbyAdult === true,
            ...(session.secret?{lobby_secret:session.secret}:{})
        });
        if(result?.ownershipVersion!==1||result.id!==session.id)throw new Error('Directory did not confirm secure ownership.');
        if(!session.secret){
            if(typeof result.lobby_secret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(result.lobby_secret))throw new Error('Directory did not issue a lobby capability.');
            session.secret=result.lobby_secret;
        }
        if(session.closed||!isHost||myPeerId!==session.peerId||!lobbyIsPublic()){session.closed=true;await removeOwnedLobby(session);return;}
        if(lobbyDirectorySession===session)lobbyPublished = true;
        })();
        await session.flight;
    } catch (err) {
        // An unreachable master is not fatal: hosting still works, and a room
        // code still lets friends join.
        if(!session||lobbyDirectorySession===session)lobbyPublished = false;
        if(session&&(err?.status===401||err?.status===403||err?.status===409)){
            session.closed=true;
            if(lobbyDirectorySession===session)lobbyDirectorySession=null;
        }
        if(session&&!session.warned){session.warned=true;showToast('Public listing unavailable. Friends can still join with your room code.');}
        console.warn('[master] could not publish lobby:', err && err.message);
    } finally {
        if(session&&ownsFlight)session.flight=null;
    }
}

function startLobbyHeartbeat() {
    stopLobbyHeartbeat();
    publishLobby();
    lobbyHeartbeatTimer = setInterval(publishLobby, LOBBY_HEARTBEAT_MS);
}

function stopLobbyHeartbeat() {
    if (lobbyHeartbeatTimer) {
        clearInterval(lobbyHeartbeatTimer);
        lobbyHeartbeatTimer = null;
    }
}

function unpublishLobby() {
    lobbyPublished = false;
    stopLobbyHeartbeat();
    const session=lobbyDirectorySession;lobbyDirectorySession=null;
    if(!session)return Promise.resolve();session.closed=true;
    if(!masterEnabled())return Promise.resolve();
    return session.flight?session.flight.catch(()=>{}).then(()=>removeOwnedLobby(session)):removeOwnedLobby(session);
}

// Called from beforeunload: a beacon is the only request guaranteed to leave
// the browser while the page is being torn down.
function leaveLobbyDirectory() {
    stopLobbyHeartbeat();
    const session=lobbyDirectorySession;
    if(session)session.closed=true;
    if (!session?.secret || !masterEnabled()) return;
    lobbyPublished = false;
    const payload = JSON.stringify({ id: session.id, lobbyId: session.id, lobby_secret: session.secret });
    try {
        const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
        if (navigator.sendBeacon && navigator.sendBeacon(MASTER_SERVER_URL + '/unregister', blob)) return;
    } catch (err) { /* fall through to fetch */ }
    try {
        fetch(MASTER_SERVER_URL + '/unregister', {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: payload
        });
    } catch (err) { /* nothing more we can do */ }
}

// --- server browser -------------------------------------------------------

async function openServerBrowser() {
    document.getElementById('server-browser-overlay').style.display = 'flex';
    initBrowserFilters();
    const filters=document.getElementById('server-browser-filters');
    // Start compact: the table is the focus, filters expand only when needed.
    if(filters&&!filters.dataset.initialized){filters.open=false;filters.dataset.initialized='1';}
    const result=document.getElementById('server-result-count');if(result)result.textContent='Loading…';
    refreshServerBrowser();
    if (serverBrowserTimer) clearInterval(serverBrowserTimer);
    serverBrowserTimer = setInterval(refreshServerBrowser, 5000);
}

function paintBrowserTagFilter(btn) {
    const active = browserTagFilter.has(String(btn.dataset && btn.dataset.tag || ''));
    btn.className = 'server-tag-filter' + (active ? ' active' : '');
    btn.setAttribute('aria-pressed', String(active));
}

// Builds the compact filter toggles and wires the search box, sort and 18+
// toggle the first time the browser opens. Filter state survives refreshes.
function initBrowserFilters() {
    updateServerFilterCount();
    const tagBox = document.getElementById('server-tag-filters');
    if (tagBox && !tagBox.childElementCount) {
        LOBBY_TAGS.forEach(tagName => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'server-tag-filter';
            btn.dataset.tag = tagName;
            btn.textContent = tagName;
            btn.onclick = () => {
                if (browserTagFilter.has(tagName)) browserTagFilter.delete(tagName);
                else browserTagFilter.add(tagName);
                paintBrowserTagFilter(btn);
                updateServerFilterCount();refreshServerBrowser();
            };
            paintBrowserTagFilter(btn);
            tagBox.appendChild(btn);
        });
    }

    const search = document.getElementById('server-search-input');
    if (search && !search.dataset.wired) {
        search.dataset.wired = '1';
        search.addEventListener('input', () => refreshServerBrowser());
    }

    const adultToggle = document.getElementById('server-adult-filter');
    if (adultToggle && !adultToggle.dataset.wired) {
        adultToggle.dataset.wired = '1';
        adultToggle.checked = browserAdultOnly;
        adultToggle.addEventListener('change', () => {
            browserAdultOnly = adultToggle.checked;
            updateServerFilterCount();refreshServerBrowser();
        });
    }

    const sort = document.getElementById('server-sort');
    if (sort && !sort.dataset.wired) {
        sort.dataset.wired = '1';
        sort.value = browserSort;
        sort.addEventListener('change', () => {
            browserSort = sort.value || 'players';
            refreshServerBrowser();
        });
    }
}

function updateServerFilterCount(){
    const count=browserTagFilter.size+(browserAdultOnly?1:0);
    const el=document.getElementById('server-filter-count');if(el)el.textContent=count?count+' active':'All lobbies';
}
function clearServerBrowserFilters(){
    browserTagFilter.clear();browserAdultOnly=false;
    const search=document.getElementById('server-search-input');if(search)search.value='';
    const adult=document.getElementById('server-adult-filter');if(adult)adult.checked=false;
    document.querySelectorAll('#server-tag-filters button').forEach(btn=>paintBrowserTagFilter(btn));
    updateServerFilterCount();refreshServerBrowser();
}

function closeServerBrowser() {
    document.getElementById('server-browser-overlay').style.display = 'none';
    if (serverBrowserTimer) {
        clearInterval(serverBrowserTimer);
        serverBrowserTimer = null;
    }
}

async function refreshServerBrowser() {
    const container = document.getElementById('server-list-content');
    if (!container) return;
    if (document.getElementById('server-browser-overlay').style.display !== 'flex') return;

    if (!masterEnabled()) {
        container.innerHTML = '<div class="server-browser-empty">No master server configured.</div>';
        const count = document.getElementById('server-result-count'); if (count) count.textContent = 'Offline';
        return;
    }
    if (!container.dataset.loaded) {
        container.innerHTML = '<div class="server-browser-empty">Loading servers…</div>';
    }

    let servers;
    try {
        const data = await masterRequest('/list');
        servers = Array.isArray(data) ? data : ((data && data.servers) || []);
    } catch (err) {
        container.dataset.loaded = '1';
        container.innerHTML = '<div class="server-browser-empty" style="color:var(--p-bad);">Could not reach the master server.</div>';
        const count = document.getElementById('server-result-count'); if (count) count.textContent = 'Offline';
        return;
    }
    renderServerList(container, servers);
}

function renderServerList(container, servers) {
    container.dataset.loaded = '1';
    updateServerFilterCount();

    const query = (document.getElementById('server-search-input')?.value || '').trim().toLowerCase();
    const filtered = servers.filter(s => {
        if (browserAdultOnly && s.adult !== true) return false;
        if (browserTagFilter.size) {
            const tags = Array.isArray(s.tags) ? s.tags.map(t => String(t).toLowerCase()) : [];
            for (const wanted of browserTagFilter) {
                if (!tags.includes(wanted.toLowerCase())) return false;
            }
        }
        if (query) {
            const haystack = [s.name, s.host, ...(Array.isArray(s.tags) ? s.tags : [])]
                .join(' ').toLowerCase();
            if (!haystack.includes(query)) return false;
        }
        return true;
    });

    const rows = filtered.slice().sort((a, b) => {
        if (browserSort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
        if (browserSort === 'newest') {
            const aa = parseInt(a.age, 10), bb = parseInt(b.age, 10);
            return (Number.isFinite(aa) ? aa : 1e9) - (Number.isFinite(bb) ? bb : 1e9);
        }
        const pa = Math.max(0, parseInt(a.players, 10) || 0), pb = Math.max(0, parseInt(b.players, 10) || 0);
        return pb - pa || String(a.name || '').localeCompare(String(b.name || ''));
    });

    const count = document.getElementById('server-result-count');
    if (count) count.textContent = rows.length ? rows.length + (rows.length === 1 ? ' server' : ' servers') : 'No servers';
    const scrollTop = container.scrollTop || 0;
    container.innerHTML = '';

    if (!rows.length) {
        const empty = document.createElement('div');
        empty.className = 'server-browser-empty';
        empty.textContent = servers.length
            ? 'No lobbies match your filters.'
            : (lobbyPublished
                ? 'Your lobby is the only one online right now.'
                : 'No public lobbies are online right now. Host one!');
        container.appendChild(empty);
        return;
    }

    rows.forEach(s => container.appendChild(buildServerRow(s)));
    // The list refreshes every five seconds; never yank the player back to the
    // top while they are scanning the lower rows.
    container.scrollTop = scrollTop;
}

function buildServerRow(s) {
    const isMine = isHost &&
        (s.id === lobbyDirectoryId() || (myPeerId && s.peerId === myPeerId));

    const row = document.createElement('div');
    row.className = 'server-browser-row' + (isMine ? ' is-mine' : '');

    const info = document.createElement('div');
    info.className = 'server-browser-info';

    const title = document.createElement('div');
    title.className = 'server-browser-title';

    const status = document.createElement('span');
    status.className = 'server-browser-status';
    status.title = 'Online';
    title.appendChild(status);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'server-browser-name';
    // textContent: a hostile master entry can never inject markup here.
    nameSpan.textContent = String(s.name || 'Server').slice(0, 40);
    title.appendChild(nameSpan);

    if (isMine) {
        const mineBadge = document.createElement('span');
        mineBadge.className = 'server-browser-badge mine';
        mineBadge.textContent = 'Your lobby';
        title.appendChild(mineBadge);
    }
    if (s.adult === true) {
        const adultBadge = document.createElement('span');
        adultBadge.className = 'server-browser-badge adult';
        adultBadge.textContent = '18+';
        title.appendChild(adultBadge);
    }

    info.appendChild(title);

    // Keep the row scannable: two tags and a count, with the full set on hover.
    const allTags = Array.isArray(s.tags) ? s.tags.map(t => String(t)).filter(Boolean) : [];
    if (allTags.length) {
        const tagRow = document.createElement('div');
        tagRow.className = 'server-browser-tags';
        allTags.slice(0, 2).forEach(tagName => {
            const chip = document.createElement('span');
            chip.className = 'server-tag-chip';
            chip.textContent = tagName.slice(0, 24);
            chip.title = tagName;
            tagRow.appendChild(chip);
        });
        if (allTags.length > 2) {
            const more = document.createElement('span');
            more.className = 'server-tag-chip more';
            more.textContent = '+' + (allTags.length - 2);
            more.title = allTags.join(' · ');
            tagRow.appendChild(more);
        }
        info.appendChild(tagRow);
    }

    const players = Math.max(0, Math.min(999, parseInt(s.players, 10) || 0));
    const maxPlayers = Math.max(0, Math.min(999, parseInt(s.maxPlayers, 10) || 0));
    if (maxPlayers > 0 && players >= maxPlayers) {
        status.className = 'server-browser-status full';
        status.title = 'Full';
    }
    const playersEl = document.createElement('div');
    playersEl.className = 'server-browser-players';
    const playerStrong = document.createElement('strong');
    playerStrong.textContent = String(players);
    playersEl.appendChild(playerStrong);
    if (maxPlayers > 0) {
        const playerMax = document.createElement('small');
        playerMax.textContent = '/' + maxPlayers;
        playersEl.appendChild(playerMax);
    }
    playersEl.title = maxPlayers > 0 ? players + ' of ' + maxPlayers + ' players' : players + ' players';

    const hostEl = document.createElement('div');
    hostEl.className = 'server-browser-host';
    hostEl.textContent = s.host ? String(s.host).slice(0, 20) : '—';
    hostEl.title = s.host ? String(s.host) : 'Unknown host';

    const ageSeconds = parseInt(s.age, 10);
    let ageText = '—';
    if (Number.isFinite(ageSeconds) && ageSeconds >= 0) {
        ageText = ageSeconds < 60 ? 'Now' : ageSeconds < 3600 ? Math.floor(ageSeconds / 60) + 'm' : Math.floor(ageSeconds / 3600) + 'h';
    }
    const ageEl = document.createElement('div');
    ageEl.className = 'server-browser-age';
    ageEl.textContent = ageText;
    ageEl.title = ageText === 'Now' ? 'Listed just now' : ageText === '—' ? 'Age unavailable' : 'Listed ' + ageText + ' ago';

    const btn = document.createElement('button');
    btn.className = 'btn-sm btn-green server-browser-join';
    btn.textContent = isMine ? 'HOSTING' : 'JOIN';
    btn.disabled = !!isMine;
    btn.setAttribute('aria-label', (isMine ? 'Your lobby: ' : 'Join ') + String(s.name || 'server').slice(0, 30));
    if (isMine) btn.style.opacity = '0.5';
    btn.onclick = () => joinBrowsedServer(s);

    row.appendChild(info);
    row.appendChild(playersEl);
    row.appendChild(hostEl);
    row.appendChild(ageEl);
    row.appendChild(btn);
    return row;
}

function joinBrowsedServer(s) {
    saveGame();

    // Player-hosted lobbies are peer-to-peer: the PeerJS id IS the join target.
    const target = String(s.peerId || s.room || '').trim();
    if (!target) return;
    showToast('Joining "' + String(s.name || 'lobby').slice(0, 30) + '"...');
    document.getElementById('room-id-input').value = target;
    closeServerBrowser();
    joinGame();
}

// --- WORLD GENERATION ---
// --- TEXTURE GENERATORS ---
function createNoiseTexture(width, height, colorA, colorB, scale = 1, seed = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Helper for pseudo-random based on coordinate
    const random = (x, y) => {
        const sin = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
        return sin - Math.floor(sin);
    };

    // Enhanced noise generation
    const imageData = ctx.createImageData(width, height);
    const NIGHT_COLOR = new THREE.Color(0x181840); // Slightly warmer/purpler night
    const DAY_COLOR = new THREE.Color(0x9FD9FF); // Soft Warm Sky Blue
    const SUNSET_COLOR = new THREE.Color(0xFFB085); // Peachy Sunset

    const data = imageData.data;
    const cA = new THREE.Color(colorA);
    const cB = new THREE.Color(colorB);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nx = x * scale;
            const ny = y * scale;
            // Simple value noise
            const noise = random(nx, ny);

            const r = cA.r + (cB.r - cA.r) * noise;
            const g = cA.g + (cB.g - cA.g) * noise;
            const b = cA.b + (cB.b - cA.b) * noise;

            const index = (x + y * width) * 4;
            data[index] = r * 255;
            data[index + 1] = g * 255;
            data[index + 2] = b * 255;
            data[index + 3] = 255;
        }
    }
    ctx.putImageData(imageData, 0, 0);
    return new THREE.CanvasTexture(canvas);
}


function createLeafTexture() {
    // High Res Pine Texture
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');

    // Gradient Background
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#2d5a27');
    grad.addColorStop(1, '#1a472a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Denser, layered needle details
    for (let i = 0; i < 1500; i++) {
        const val = Math.random();
        ctx.strokeStyle = val > 0.7 ? '#3e7038' : (val > 0.4 ? '#2d5a27' : '#15331e');
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        ctx.moveTo(x, y);
        // Randomize direction slightly
        ctx.lineTo(x + (Math.random() - 0.5) * 15, y + 5 + Math.random() * 10);
        ctx.stroke();
    }

    // Add noise/dots
    for (let i = 0; i < 500; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#3e7038' : '#0f2916';
        ctx.beginPath();
        ctx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}



// --- VISUAL UPGRADE: ROCKS ---
// --- VISUAL UPGRADE: ROCKS ---
function createRockMesh(scale = 1, rng = Math.random) {
    const geo = new THREE.IcosahedronGeometry(1, 1); // Higher poly for better shape

    // REMOVED VERTEX RANDOMIZATION to fix "cracked" look with flat shading.
    // The base icosahedron shape + random scaling/rotation is sufficient for this style.

    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.9,
        flatShading: true
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.isRock = true;

    // Scale flattened on Y axis for "boulder" look
    mesh.scale.set(scale, scale * 0.6, scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

// --- VISUAL UPGRADE: DETAILED TREES ---
// --- VISUAL UPGRADE: COZY FLUFFY TREES ---
function createDetailedTree(leafMat, trunkMat) {
    const group = new THREE.Group();
    group.userData.isTree = true;

    // Trunk (Slightly Thicker Base)
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.6, 2.5, 7);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.25;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // Leaves (Round/Fluffy Bunches using Icosahedrons)
    const leafGeo = new THREE.IcosahedronGeometry(1.5, 0); // Low poly round shape

    // Bottom Bunch
    const L1 = new THREE.Mesh(leafGeo, leafMat);
    L1.position.y = 3.0;
    L1.scale.set(1.4, 1.1, 1.4);
    L1.castShadow = true;
    group.add(L1);

    // Middle Bunch
    const L2 = new THREE.Mesh(leafGeo, leafMat);
    L2.position.y = 4.8;
    L2.scale.set(1.1, 1.1, 1.1);
    L2.castShadow = true;
    group.add(L2);

    // Top Bunch
    const L3 = new THREE.Mesh(leafGeo, leafMat);
    L3.position.y = 6.2;
    L3.scale.set(0.8, 0.8, 0.8);
    L3.castShadow = true;
    L3.receiveShadow = true; // Leaves self-shadow
    group.add(L3);

    return group;
}

// --- TERRAIN HEIGHT SYSTEM ---
window.getTerrainHeight = function getTerrainHeight(x, z) {
    if(window.Housing && Housing.inside && Housing.isInteriorPoint(x,z)) return 0;
    if (typeof isInVoid !== 'undefined' && isInVoid) return 0;
    if (typeof isInLavaWorld !== 'undefined' && isInLavaWorld) return 0;

    // --- CUSTOM LEVEL MODE ---
    // A level built in editor.html fully replaces the procedural island, so the
    // whole playing surface comes straight from the level's height grid. Past
    // the authored map edge the generated ocean islands take over.
    if (window.CUSTOM_LEVEL && window.Level) {
        const lvl = window.CUSTOM_LEVEL;
        const authored = window.Level.sampleHeight(lvl, x, z);
        // Authored land always wins. In authored water (including the open sea
        // around a small island) generated islands may sit inside the level
        // square, so take the higher of the two surfaces.
        if (authored > lvl.seaLevel + 0.15) return authored;
        if (window.customOcean && window.Ocean) return Math.max(authored, window.Ocean.heightAt(x, z, window.customOcean));
        return authored;
    }

    // Flatten terrain around ocean island ponds so they sit nicely in the land
    if (window.Ocean) {
        try {
            const lay = window.Ocean.layout();
            if (lay && lay.ponds) {
                for (let i = 0; i < lay.ponds.length; i++) {
                    const p = lay.ponds[i];
                    const pdx = x - p.x, pdz = z - p.z;
                    const pd = Math.sqrt(pdx * pdx + pdz * pdz);
                    if (pd < p.radius * 1.5) {
                        return -0.02;
                    }
                }
            }
        } catch (e) { /* ignore */ }
    }

    // --- -1. DOCK (Absolute Priority) ---
    // Dock at X=0, Z=90-170, Y=0.3 (slightly above ground to prevent z-fighting)
    if (x > -6 && x < 6 && z > 85 && z < 170) {
        return 0.3; // Dock surface height (level with flattened terrain)
    }

    // Dock Approach Area (Flatten terrain around dock entrance)
    if (z > 70 && z < 100 && Math.abs(x) < 12) {
        return 0; // Flat ground leading to dock
    }

    // --- FLAT ZONES ---

    // 1. Lake (Center) - Lake Radius is 20 + Shore buffer
    const dist = Math.sqrt(x * x + z * z);
    if (dist < 32) return 0;

    // 2. Cabin Area (-40, 10)
    const distCabin = Math.sqrt((x + 40) ** 2 + (z - 10) ** 2);
    if (distCabin < 20) return 0;

    // 3. Waterfall / Cave Area (z < -70, x around 0)
    // Waterfall is at (0, -95). Path leads there.
    const distWaterfall = Math.sqrt(x * x + (z + 95) ** 2);
    if (distWaterfall < 35) return 0;

    // 4. Pond Area (-60, -30)
    const distPond = Math.sqrt((x + 60) ** 2 + (z + 30) ** 2);
    if (distPond < 15) return 0;

    // 5. Dark Pond (60, 50) - HARDCODED like other pond for reliability
    const distDarkPond = Math.sqrt((x - 60) ** 2 + (z - 50) ** 2);
    if (distDarkPond < 24) return 0; // radius 14 + 10 buffer

    // 6. Void overlook (86, -58) - flat stone shrine terrace.
    const distVoidShrine = Math.sqrt((x - 86) ** 2 + (z + 58) ** 2);
    if (distVoidShrine < 12) return 0;

    // --- PLATFORMS & CLIFFS ---
    // (Parkour logic moved to top priority)

    // 7. Waterfall Top (Summit)
    // Area above cave: x around 0, z < -100
    if (z < -95 && Math.abs(x) < 25) {
        // Height of the cliff top
        return 42;
    }

    // --- NOISE GENERATION ---
    // Smooth transition from flat zones using min distance
    const minDist = Math.min(
        Math.max(0, dist - 32),
        Math.max(0, distCabin - 20),
        Math.max(0, distWaterfall - 35),
        Math.max(0, distPond - 15),
        Math.max(0, distDarkPond - 24), // Include dark pond in smoothing
        Math.max(0, distVoidShrine - 12)
    );

    // Blend factor (0 to 1 over 15 units)
    let blend = Math.min(1, minDist / 15);
    blend = blend * blend * (3 - 2 * blend); // Smoothstep curve

    // Simple layered sine noise for hills
    const h1 = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 4;
    const h2 = Math.sin(x * 0.1 + 10) * Math.sin(z * 0.12 + 20) * 2;
    const detail = Math.sin(x * 0.2) * 0.5;

    // Bias height up slightly (hills, not valleys below water level)
    let h = (h1 + h2 + detail + 1.5) * blend;
    h = Math.max(0, h); // Ensure no underground dips

    // --- ISLAND EDGE FALLOFF ---
    // Apply the same slope near island edges so players walk on the visual terrain
    const ISLAND_RADIUS = 120; // Must match value in fish.js
    const EDGE_FALLOFF = 12;   // Must match value in terrain generation
    const distFromCenter = Math.sqrt(x * x + z * z);

    // --- OPEN OCEAN ---
    // Past the beach the ground drops to the sea bed, but generated islands
    // rise back up out of it. Ocean.heightAt() returns the sea-bed height plus
    // any nearby island's dome, so the whole sailable ocean is one surface.
    const OCEAN_FLOOR_H = (typeof OCEAN_FLOOR === "number") ? OCEAN_FLOOR : -9;

    if (distFromCenter > ISLAND_RADIUS) {
        if (window.Ocean && typeof window.Ocean.heightAt === "function") {
            return window.Ocean.heightAt(x, z);
        }
        return OCEAN_FLOOR_H;
    } else if (distFromCenter > ISLAND_RADIUS - EDGE_FALLOFF) {
        // In the falloff zone - smooth transition to the ocean floor.
        const falloffProgress = (distFromCenter - (ISLAND_RADIUS - EDGE_FALLOFF)) / EDGE_FALLOFF;
        const smoothFactor = (1 - Math.cos(falloffProgress * Math.PI)) / 2;
        const edgeTarget = (window.Ocean && typeof window.Ocean.heightAt === "function")
            ? window.Ocean.heightAt(x, z)
            : OCEAN_FLOOR_H;
        return h * (1 - smoothFactor) + edgeTarget * smoothFactor;
    }

    return h;
}

// Helper for flowers
function createFlowerMesh(color) {
    const group = new THREE.Group();
    // Stem
    const stemGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 4);
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.2;
    stem.castShadow = true;
    group.add(stem);

    // Flower Head
    const headGeo = new THREE.DodecahedronGeometry(0.15, 0);
    const headMat = new THREE.MeshLambertMaterial({ color: color });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.4;
    head.castShadow = true;
    group.add(head);

    return group;
}



// Keeps the cave mouth / waterfall approach readable and walkable.
// Used by both procedural spawners and decorative passes.
function isInCaveEntranceZone(x, z) {
    return (Math.abs(x) < 24 && z > -120 && z < -62);
}

// The decor group (buildings, props, cave entrances) that addLevelProps builds
// for a custom level, kept so world rebuilds can clear it in one step.
let customLevelDecor = null;

function disposeDecorGroup(group) {
    if (!group) return;
    group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => m.dispose());
        }
    });
    scene.remove(group);
}

// --- CUSTOM LEVEL FLOWERS ---
// Scatter pickable flowers across a hand-built level's dry land, keeping clear
// of everything the author placed (props, NPCs, buildings, caves, trees and
// rocks) so nothing grows on top of them. Positions are seeded from the level
// itself, so a level always grows the same flowers on every reload.
function spawnCustomLevelFlowers(level) {
    if (!level || !window.Level || !window.WorldGen) return 0;
    const LV = window.Level, WG = window.WorldGen;

    const half = level.size / 2;
    const margin = Math.max(3, (level.size / level.grid) * 1.5); // keep off the map edge
    const reach = half - margin;
    if (!(reach > 1)) return 0;

    const rand = mulberry32(xmur3(levelFingerprint(level))());

    // Everything already placed becomes a {x, z, r} keep-out circle. `r` is the
    // item's own footprint plus a comfort margin, so flowers land "not near or
    // on" it.
    const keepOut = [];
    const addKeepOut = (list, radiusOf) => {
        (list || []).forEach((d) => {
            if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.z)) return;
            const r = radiusOf(d);
            if (r > 0) keepOut.push({ x: d.x, z: d.z, r: r });
        });
    };
    addKeepOut(level.props, (d) => Math.max(1.4, WG.propInfo(d.type).radius * (d.scale || 1) + 1.0));
    addKeepOut(level.npcs, () => 2.5);
    addKeepOut(level.buildings, (d) => WG.buildingInfo(d.type).radius * (d.scale || 1) + 1.2);
    addKeepOut(level.caves, (d) => WG.caveInfo(d.size).radius * 0.62 + 1.2);
    addKeepOut(level.trees, (d) => 1.5 * (d.scale || 1) + 0.8);
    addKeepOut(level.rocks, (d) => Math.max(0.8, (d.scale || 1) * 0.8) + 0.8);
    if (level.spawn && Number.isFinite(level.spawn.x)) keepOut.push({ x: level.spawn.x, z: level.spawn.z, r: 3 });
    // The game always drops its five built-in NPCs somewhere; if the author
    // didn't place one it stays at its island default, so guard those spots too.
    if (typeof LAKE_RADIUS === "number") {
        const d = LAKE_RADIUS + 3;
        [[d, 0], [-d, 0], [0, d], [0, -d], [16, 16]].forEach((p) => keepOut.push({ x: p[0], z: p[1], r: 2.5 }));
    }

    const blocked = (x, z) => {
        for (let i = 0; i < keepOut.length; i++) {
            const k = keepOut[i], dx = x - k.x, dz = z - k.z;
            if (dx * dx + dz * dz < k.r * k.r) return true;
        }
        return false;
    };

    const floristryXP = (saveState.skills && saveState.skills.floristry) ? saveState.skills.floristry.xp : 0;
    const floristryLevel = getLevelFromXP(floristryXP);

    // Aim for the island's flower density: about one flower per ~560 world units².
    const cell = level.size / level.grid;
    const landCells = (typeof LV.countLand === "function") ? LV.countLand(level) : level.grid * level.grid * 0.5;
    const target = Math.max(4, Math.min(80, Math.round((landCells * cell * cell) / 560)));
    const tries = target * 60 + 400;

    const planted = [];
    for (let n = 0; n < tries && planted.length < target; n++) {
        const x = (rand() * 2 - 1) * reach;
        const z = (rand() * 2 - 1) * reach;

        // Dry, reasonably flat land only.
        const h = LV.sampleHeight(level, x, z);
        if (h <= level.seaLevel + 0.2) continue;
        const t = 1.5;
        const slope = Math.max(
            Math.abs(LV.sampleHeight(level, x + t, z) - h),
            Math.abs(LV.sampleHeight(level, x - t, z) - h),
            Math.abs(LV.sampleHeight(level, x, z + t) - h),
            Math.abs(LV.sampleHeight(level, x, z - t) - h));
        if (slope > 1.5) continue;

        if (blocked(x, z)) continue;

        let crowded = false;
        for (let i = 0; i < planted.length; i++) {
            const p = planted[i];
            if ((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < 2.5 * 2.5) { crowded = true; break; }
        }
        if (crowded) continue;

        const flowerType = getResourceForLevel(floristryLevel, FLOWER_TYPES);
        const flower = createFlowerMesh(flowerType.color);
        flower.position.set(x, h, z);
        flower.rotation.y = rand() * Math.PI * 2;
        flower.rotation.x = (rand() - 0.5) * 0.3;
        flower.rotation.z = (rand() - 0.5) * 0.3;
        const scale = 0.8 + rand() * 0.5;
        flower.scale.set(scale, scale, scale);
        flower.userData.isFlower = true;
        flower.userData.isPicked = false;
        flower.userData.typeId = flowerType.id;
        flower.userData.originalScale = scale;

        scene.add(flower);
        treeMeshes.push(flower);
        pickableFlowers.push(flower);
        planted.push({ x: x, z: z });
    }
    return planted.length;
}

// Scatter pickable flowers across one generated ocean island's dry land. Called
// by ocean.js (guarded) so sailing out is rewarded with a bit of gatherable
// floristry, matching the home island. `rand` is the island's own seeded RNG so
// the scatter is deterministic across clients.
// Spawns pickable flowers on one ocean island. `rand` is the island's own
// seeded RNG so the scatter is deterministic across clients. `keepOut` is an
// optional array of { x, z, radius } (tree/rock colliders) that flowers must
// avoid, so they don't sprout inside a trunk or boulder.
function spawnOceanIslandFlowers(isl, rand, keepOut) {
    if (!isl || typeof rand !== 'function' || !window.Ocean) return 0;
    const sea = Number.isFinite(isl.seaLevel)?isl.seaLevel:((typeof OCEAN_LEVEL === 'number') ? OCEAN_LEVEL : -3);
    const floristryXP = (saveState.skills && saveState.skills.floristry) ? saveState.skills.floristry.xp : 0;
    const floristryLevel = getLevelFromXP(floristryXP);

    const target = Math.max(2, Math.round(isl.radius * 0.25));
    let planted = 0;
    for (let n = 0; n < target * 8 && planted < target; n++) {
        const a = rand() * Math.PI * 2;
        const d = rand() * isl.radius * 0.8;
        const x = isl.x + Math.cos(a) * d;
        const z = isl.z + Math.sin(a) * d;

        const h = window.Ocean.islandHeight(isl, x, z);
        if (h < sea + 0.6) continue; // dry land only

        if (keepOut) {
            let blocked = false;
            for (let k = 0; k < keepOut.length; k++) {
                const c = keepOut[k];
                const rr = c.radius + 0.8;
                const dx = x - c.x, dz = z - c.z;
                if (dx * dx + dz * dz < rr * rr) { blocked = true; break; }
            }
            if (blocked) continue;
        }

        const flowerType = getResourceForLevel(floristryLevel, FLOWER_TYPES);
        const flower = createFlowerMesh(flowerType.color);
        flower.position.set(x, h, z);
        flower.rotation.y = rand() * Math.PI * 2;
        flower.rotation.x = (rand() - 0.5) * 0.3;
        flower.rotation.z = (rand() - 0.5) * 0.3;
        const scale = 0.8 + rand() * 0.5;
        flower.scale.set(scale, scale, scale);
        flower.userData.isFlower = true;
        flower.userData.isPicked = false;
        flower.userData.typeId = flowerType.id;
        flower.userData.originalScale = scale;

        scene.add(flower);
        treeMeshes.push(flower);
        pickableFlowers.push(flower);
        planted++;
    }
    return planted;
}

// Shared default NPC locations keep procedural scenery clear of every vendor.
function getDefaultNpcSpawns() {
    const shore = LAKE_RADIUS + 3;
    return {
        merchant: { x: shore, z: 0 },
        stylist: { x: -shore, z: 0 },
        bait: { x: 0, z: shore },
        tutorial: { x: 0, z: -shore },
        lava: { x: 16, z: 16 },
        fisher: { x: -shore, z: -shore },
        scratch: { x: shore, z: -9 },
        halloween: { x: LAKE_RADIUS + 8, z: 12 }
    };
}
function isDefaultNpcAreaClear(x, z, sceneryRadius = 3) {
    // Six units of open ground plus the largest tree canopy / rock radius.
    const clearance = 6 + sceneryRadius;
    return Object.values(getDefaultNpcSpawns()).every(npc =>
        Math.hypot(x - npc.x, z - npc.z) >= clearance);
}

// The default island has a readable path network. Keeping the routes here lets
// both the scenery pass and the path mesh builder use the exact same layout.
const DEFAULT_PATH_RING = Array.from({ length: 33 }, (_, i) => {
    const angle = i / 32 * Math.PI * 2;
    return { x: Math.cos(angle) * 30, z: Math.sin(angle) * 30 };
});
const DEFAULT_PATHS = [
    { width: 3.1, points: DEFAULT_PATH_RING },
    { width: 3.6, points: [{ x: 0, z: 30 }, { x: 0, z: 85 }] },
    { width: 3.1, points: [{ x: 0, z: -30 }, { x: 0, z: -62 }] },
    { width: 2.8, points: [{ x: 25, z: 0 }, { x: 30, z: 0 }] },
    { width: 2.8, points: [{ x: 29, z: 14 }, { x: 41, z: 29 }, { x: 47, z: 41 }] },
    { width: 2.8, points: [{ x: -29, z: 0 }, { x: -45, z: -14 }, { x: -52, z: -22 }] },
    { width: 2.8, points: [{ x: -29, z: 0 }, { x: -30, z: 12 }, { x: -34, z: 19 }, { x: -40, z: 16 }] },
    { width: 2.9, points: [{ x: 26, z: -12 }, { x: 48, z: -30 }, { x: 72, z: -50 }, { x: 84, z: -58 }] }
];
// Seats face a view instead of sitting across the walking paths.
const DEFAULT_BENCHES = [
    { x: -47, z: -24, rot: -2.00 },
    { x: 50, z: 35, rot: 0.59 },
    { x: 23, z: 25, rot: -2.40 },
    { x: -23, z: 25, rot: 2.40 },
    { x: -32, z: 24, rot: -2.42 },
    { x: 8, z: 87, rot: 0 }
];
function distanceToPathSegmentSq(px, pz, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz;
    let t = lengthSq ? ((px - a.x) * dx + (pz - a.z) * dz) / lengthSq : 0;
    t = Math.max(0, Math.min(1, t));
    return (px - (a.x + dx * t)) ** 2 + (pz - (a.z + dz * t)) ** 2;
}
function isOnDefaultPath(x, z, extra = 0) {
    for (const path of DEFAULT_PATHS) {
        const reach = path.width / 2 + extra;
        for (let i = 1; i < path.points.length; i++) {
            if (distanceToPathSegmentSq(x, z, path.points[i - 1], path.points[i]) <= reach * reach) return true;
        }
    }
    return false;
}

function generateWorld(seedStr) {
    if(window.Housing)Housing.cancelForWorldChange();
    treeMeshes.forEach(t => scene.remove(t));
    treeMeshes = []; treeColliders = [];
    pickableFlowers = []; // Track pickable flowers separately
    // Lava collision data belongs to its own arena, not the main-map scatter.
    disposeDecorGroup(customLevelDecor);
    customLevelDecor = null;

    // --- CUSTOM LEVEL MODE ---
    // Spawn the props authored in the level editor rather than the procedural
    // scatter below.
    if (window.CUSTOM_LEVEL && window.WorldGen) {
        const res = WorldGen.addLevelProps(scene, window.CUSTOM_LEVEL, { trees: treeMeshes, colliders: treeColliders });
        if (res && res.decor) customLevelDecor = res.decor;
        // Also grow pickable flowers on the level's open land, clear of the
        // props and NPCs the author placed.
        spawnCustomLevelFlowers(window.CUSTOM_LEVEL);
        if(window.oceanWorld?.custom){treeMeshes.push(...window.oceanWorld.trees);treeColliders.push(...window.oceanWorld.colliders);for(const flower of window.oceanWorld.flowers||[])if(!flower.userData.isPicked){scene.add(flower);treeMeshes.push(flower);pickableFlowers.push(flower);}}
        return;
    }

    const seed = xmur3(seedStr.toLowerCase())();
    const rand = mulberry32(seed);

    const cabinPos = new THREE.Vector3(-40, 0, 10);
    const safeZone = 15;

    // --- PROTECTED ZONES (No Spawn) ---
    const protectedZones = [
        { x: 25, z: 0, r: 8 },  // Player Spawn
        { x: -40, z: 10, r: 15 }, // Cabin
        // --- WATER BODIES ---
        { x: -60, z: -30, r: 14 }, // Light Pond
        { x: 60, z: 50, r: 26 },   // Dark Pond (radius 14 + buffer)
        { x: 86, z: -58, r: 13 },  // Void shrine
        // Dock area
        { x: 0, z: 130, r: 8 },    // Dock center
    ];

    function isSafe(x, z) {
        if (!isDefaultNpcAreaClear(x, z)) return false;

        // Keep the cave mouth / waterfall approach clear
        if (isInCaveEntranceZone(x, z)) return false;

        // Keep the refreshed path network and the full dock walkable.
        if (isOnDefaultPath(x, z, 2.2)) return false;
        if (Math.abs(x) < 8 && z > 82 && z < 168) return false;

        // Static protected zones (spawn, NPCs, pond, coarse river points, etc.)
        for (let zone of protectedZones) {
            const dx = x - zone.x;
            const dz = z - zone.z;
            if (dx * dx + dz * dz < zone.r * zone.r) return false;
        }

        // Dynamic river exclusion (covers intermediate points and matches the rendered river width)
        if (window.riverColliders && Array.isArray(window.riverColliders)) {
            for (const rc of window.riverColliders) {
                const rr = (rc.radius != null ? rc.radius : 8) + 2.0;
                const dx = x - rc.x;
                const dz = z - rc.z;
                if (dx * dx + dz * dz < rr * rr) return false;
            }
        }

        // Waterfall Path Protection (legacy guard rail)
        if (z < -70 && x > -30 && x < 30) return false;

        return true;
    }

    // Materials
    // Materials - COZY UPDATE
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6D4C41, roughness: 1.0 }); // Warmer Wood
    const leafTex = createLeafTexture();
    const leafMat = new THREE.MeshStandardMaterial({
        map: leafTex,
        color: 0x88CC88, // Warmer/Softer Green (Pale/Mossy)
        roughness: 0.8,
        flatShading: true
    });

    // --- TREES ---
    for (let i = 0; i < 120; i++) {
        const angle = rand() * Math.PI * 2;
        const minTreeDist = LAKE_RADIUS + 5;
        const maxTreeDist = ISLAND_RADIUS - 5;
        const dist = minTreeDist + rand() * (maxTreeDist - minTreeDist);

        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;

        if (!isSafe(x, z)) continue;

        // Detailed Tree
        const localLeafMat = leafMat.clone();
        const tint = (rand() - 0.5) * 0.2;
        localLeafMat.color.setHSL(0.35 + tint, 0.6, 0.4);

        const t = createDetailedTree(localLeafMat, trunkMat);
        const y = getTerrainHeight(x, z);
        t.position.set(x, y, z);

        t.rotation.y = rand() * Math.PI * 2;
        const scale = 0.8 + rand() * 0.4;
        t.scale.set(scale, scale, scale);

        scene.add(t);
        treeMeshes.push(t);
        treeColliders.push({ x, z, radius: 1.5 });
    }

    // --- ROCKS ---
    for (let i = 0; i < 60; i++) {
        const angle = rand() * Math.PI * 2;
        const dist = (LAKE_RADIUS + 2) + rand() * (ISLAND_RADIUS - LAKE_RADIUS - 5);
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;

        if (!isSafe(x, z)) continue;

        if (new THREE.Vector3(x, 0, z).distanceTo(cabinPos) < safeZone) continue;

        let tooClose = false;
        for (let t of treeColliders) {
            if (Math.hypot(t.x - x, t.z - z) < 3) tooClose = true;
        }
        if (tooClose) continue;

        const scale = 1 + rand() * 2;
        const rock = createRockMesh(scale, rand);
        const y = getTerrainHeight(x, z);
        rock.position.set(x, y + scale * 0.3, z); // Adjust Y for terrain + scaling
        rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);

        scene.add(rock);
        treeMeshes.push(rock);
        // Collision for almost all rocks
        if (scale > 0.5) {
            treeColliders.push({ x, z, radius: scale * 0.8 });
        }
    }

    // --- FLOWERS ---
    // --- FLOWERS ---
    // Calculate floristry level once for the batch
    const floristryXP = (saveState.skills && saveState.skills.floristry) ? saveState.skills.floristry.xp : 0;
    const floristryLevel = getLevelFromXP(floristryXP);

    for (let i = 0; i < 80; i++) {
        const angle = rand() * Math.PI * 2;
        const dist = (LAKE_RADIUS + 1) + rand() * (ISLAND_RADIUS - LAKE_RADIUS - 2);
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;

        if (new THREE.Vector3(x, 0, z).distanceTo(cabinPos) < safeZone) continue;

        // --- NO SPAWN ZONES (Ponds, Dock) ---
        // Light Pond (-60, -30, r=14)
        if ((x + 60) ** 2 + (z + 30) ** 2 < 16 * 16) continue;
        // Dark Pond (60, 50, r=26)
        if ((x - 60) ** 2 + (z - 50) ** 2 < 28 * 28) continue;
        // Dock (0, 130, r=8) + Walking path (Z > 85, |X| < 6)
        if (z > 80 && Math.abs(x) < 8) continue; // Dock path
        if ((x) ** 2 + (z - 130) ** 2 < 12 * 12) continue; // Dock end
        if (isOnDefaultPath(x, z, 2.2)) continue;

        let tooClose = false;
        for (let t of treeColliders) {
            if (Math.hypot(t.x - x, t.z - z) < 2) tooClose = true;
        }
        if (tooClose) continue;

        // Pick type based on level
        const flowerType = getResourceForLevel(floristryLevel, FLOWER_TYPES);
        const col = flowerType.color;

        const flower = createFlowerMesh(col);
        const y = getTerrainHeight(x, z);
        flower.position.set(x, y, z);

        // Random tilt/rot
        flower.rotation.y = rand() * Math.PI * 2;
        flower.rotation.x = (rand() - 0.5) * 0.3;
        flower.rotation.z = (rand() - 0.5) * 0.3;

        const scale = 0.8 + rand() * 0.5;
        flower.scale.set(scale, scale, scale);

        // Set up for picking
        flower.userData.isFlower = true;
        flower.userData.isPicked = false;
        flower.userData.typeId = flowerType.id;

        // Store for respawn logic
        flower.userData.originalScale = scale;

        scene.add(flower);
        treeMeshes.push(flower);
        pickableFlowers.push(flower);
    }

    // Re-register the generated ocean-island trees + colliders that the reset
    // above just cleared, so solid trees out at sea survive a world re-roll.
    if (window.oceanWorld) {
        (window.oceanWorld.trees || []).forEach(t => {
            if (!treeMeshes.includes(t)) treeMeshes.push(t);
        });
        (window.oceanWorld.colliders || []).forEach(c => treeColliders.push(c));
    }
}


function handleDataFromClient(clientId, data) {
    if(!window.NetworkGuard||!NetworkGuard.accept(clientId,data))return;
    if(window.Exploration&&typeof data?.type==='string'&&data.type.startsWith('explore:')){Exploration.client(clientId,data);return;}
    if (window.Tournaments && data && typeof data.type === "string" && data.type.startsWith("tournament:")) { Tournaments.client(clientId, data); return; }
    if(window.Boats&&typeof data?.type==='string'&&data.type.startsWith('boat:')){Boats.handleClient(clientId,data);return;}
    if(window.Housing && data && typeof data.type==='string' && data.type.startsWith('house:')) { Housing.handleClient(clientId,data); return; }
    try {
        if (otherPlayers[clientId]) {
            otherPlayers[clientId].lastSeen = Date.now();
        }

        if (data.type === 'update') {
            if (!data.payload || !data.payload.pos) return;
            if (![data.payload.pos.x,data.payload.pos.y,data.payload.pos.z].every(Number.isFinite)) return;

            const sharedSeat=window.Boats?.authoritativePresence(clientId);
            if(sharedSeat){data.payload.pos={x:sharedSeat.x,y:sharedSeat.y,z:sharedSeat.z};data.payload.rot=sharedSeat.rot;data.payload.sitting=sharedSeat.sitting;data.payload.sailing=false;}
            // Boundary Check — the world now includes the open ocean up to
            // WORLD_RADIUS (plus the custom-level apron), so accept those too.
            const isIsland = window.Ocean.inBounds(data.payload.pos.x,data.payload.pos.z,-.001);
            const isVoid = Math.abs(data.payload.pos.x - 10000) < 500 && Math.abs(data.payload.pos.z - 10000) < 500;
            // Allow Lava world coordinates too
            const isLava = Math.abs(data.payload.pos.x + 20000) < 500;

            const isHouse=window.Housing && Housing.validatePresence(clientId,data.payload);
            if(data.payload.houseOwner && !isHouse)return;
            if (!isIsland && !isVoid && !isLava && !isHouse) return;

            // If player is not in our list, create them.
            if (!otherPlayers[clientId]) {
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

                // NEW: Sync Props to New Player
                // Combine Host's local props (myProps) with Remote props (activeProps)
                const hostProps = myProps.map(p => ({ ...p, owner: myPeerId }));
                const allP = [...hostProps, ...activeProps];
                if (allP.length > 0) {
                    clientConns[clientId].send({ type: 'allProps', props: allP });
                }
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
            if (mutedChatPeers.includes(clientId)) return;
            data.id = clientId;
            data.name = otherPlayers[clientId] ? otherPlayers[clientId].lastData.name : "Unknown";
            if (saveState.debugMode) console.log('[P2P HOST DEBUG] Received chat from client, broadcasting:', data);
            if (data.id !== myPeerId) displayChatMessage(data.name, data.text, data.id);
            broadcastToClients(data);

        } else if (data.type === 'worldBossSpawn' || data.type === 'worldBossDefeated') {
            broadcastToClients(data);

        } else if (data.type === 'tradeRequest' || data.type === 'tradeOffer' || data.type === 'tradeAccept' || data.type === 'tradeCancel') {
            // The host may itself be the target: apply locally too.
            if (data.target === myPeerId && typeof handleTradeMessage === 'function') handleTradeMessage(data);
            broadcastToClients(data);

        } else if (data.type === 'screenQueueAdd') {
            const entry = ytPlayers[data.propId];
            if (entry && entry.data) {
                if (!Array.isArray(entry.data.queue)) entry.data.queue = [];
                if(entry.data.queue.length>=50)return;
                const item = data.item || (data.src ? { provider: data.src.provider, id: data.src.id, twitchKind: data.src.twitchKind || null, title: null, addedBy: data.placer } : null);
                if (item && entry.data.queue.length<50) entry.data.queue.push(item);
            }
            broadcastToClients(data);
            if (window.Housing && typeof Housing.addHouseTvQueue === 'function') Housing.addHouseTvQueue(data);
            // First video on an idle screen: the host starts it for the whole
            // room (a client's own ytChange would fail the ownership check in
            // the ytChange branch below). House TVs only auto-start when the
            // host is the owner; guests may add but the owner controls playback.
            if (entry && entry.data && entry.data.queue.length > 0 &&
                (!entry.isHouse || entry.houseOwnerLocal) &&
                !entry.data.provider && !entry.data.videoId && !entry.data.twitchId &&
                typeof playScreenQueueIndex === 'function') {
                playScreenQueueIndex(data.propId, entry.data.queue.length - 1);
            }
            if (activeScreenId === data.propId && typeof renderScreenQueue === 'function') renderScreenQueue();

        } else if (data.type === 'screenQueueRemove') {
            const entry = ytPlayers[data.propId];
            if (entry && entry.data && Array.isArray(entry.data.queue)) {
                if (data.idx >= 0 && data.idx < entry.data.queue.length) entry.data.queue.splice(data.idx, 1);
            }
            broadcastToClients(data);

        } else if (data.type === 'screenQueueMove') {
            const entry = ytPlayers[data.propId];
            if (entry && entry.data && Array.isArray(entry.data.queue)) {
                const q = entry.data.queue;
                if (data.from >= 0 && data.from < q.length && data.to >= 0 && data.to < q.length) {
                    const tmp = q[data.from]; q[data.from] = q[data.to]; q[data.to] = tmp;
                }
            }
            broadcastToClients(data);

        } else if (data.type === 'skillLevel') {
            data.id = clientId;
            data.name = otherPlayers[clientId] ? otherPlayers[clientId].lastData.name : (data.name || 'Unknown');
            if (data.id !== myPeerId) displayChatMessage(data.name, `has reached level ${data.level} in ${data.skill}!`, 'system');
            broadcastToClients(data);

        } else if (data.type === 'sound') {
            const emitter=otherPlayers[clientId]?.lastData;
            if(!emitter?.pos)return;
            data={type:'sound',name:data.name,var:data.var,pos:{...emitter.pos},id:clientId,houseOwner:emitter.houseOwner||''};
            // MIDI Mute Check
            if (data.name === 'guitar') {
                if (otherPlayers[clientId] && otherPlayers[clientId].lastData.isMidiMuted) return;
                if (localMutedMidi.includes(clientId)) return;
            }

            Sound.playSpatial(data.name, data.pos, data.var, data);
            if (isHost) broadcastToClients(data);

        } else if (data.type === 'placeProp') {
            const placement=validateRemotePropPlacement(clientId,data);
            if(!placement.ok){
                if(placement.abuse)window.NetworkGuard?.strike(clientId,placement.error,8);
                try{clientConns[clientId]?.send({type:'prop:notice',id:data.propId,message:placement.error});}catch(e){}
                return;
            }
            // Keep the placer's prop id exactly as sent, so the sync keys (and
            // undo history) are consistent across every peer's records.
            const ytId = (typeof data.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(data.videoId))
                ? data.videoId : null;
            // Twitch: either a channel slug or a numeric VOD id. The kind field
            // decides which; ids that match neither are dropped.
            const twRaw = (typeof data.twitchId === 'string') ? data.twitchId : null;
            const twVod = (twRaw && data.twitchKind === 'video' && /^\d{1,20}$/.test(twRaw)) ? twRaw : null;
            const twCh = (twRaw && !twVod && data.twitchKind !== 'video' && /^[A-Za-z0-9_]{1,25}$/.test(twRaw))
                ? twRaw : null;
            const provider = ytId ? 'youtube' : ((twVod || twCh) ? 'twitch' : null);
            const newProp = {
                id: (typeof data.propId === 'string' && data.propId.length <= 40)
                    ? data.propId
                    : Date.now() + "_" + Math.random().toString().substr(2, 5),
                type: data.propType,
                x: data.x,
                z: data.z,
                // Rotation must be carried through, or every viewer falls back
                // to mesh.rotation.y = their OWN player rotation and the prop
                // faces a different way on each player's screen.
                rot: (typeof data.rot === 'number' && isFinite(data.rot)) ? data.rot : 0,
                // Screen source (null for every other prop type)
                provider: provider,
                videoId: ytId,
                twitchId: twVod || twCh,
                twitchKind: twVod ? 'video' : (twCh ? 'channel' : null),
                startedAt: (typeof data.startedAt === 'number') ? data.startedAt : Date.now(),
                placer: String(clientConns[clientId]?.deviceID||clientId),
                owner: clientId,
                timestamp: Date.now()
            };
            activeProps.push(newProp);
            spawnPropMesh(newProp); // Spawn visually on host
            broadcastToClients({ type: 'propPlaced', prop: newProp });

        } else if(data.type==='ytPlayback'){
            const clean=validateScreenPlaybackRequest(data,clientId,activeProps);if(!clean)return;
            broadcastToClients(clean);applyScreenPlayback(clean);
        } else if (data.type === 'ytSync') {
            const rec=activeProps.find(p=>p.id===data.propId);
            if(!rec||rec.type!=='screen'||rec.owner!==clientId||rec.paused||rec.videoId!==data.videoId||!Number.isFinite(data.at)||data.at<0||data.at>1e7)return;
            const clean={type:'ytSync',propId:rec.id,videoId:rec.videoId,at:data.at,ts:Date.now(),placer:rec.placer||''};
            broadcastToClients(clean);applyYtSync(clean);

        } else if (data.type === 'ytChange') {
            // A placer swapped the video on their screen. Validate, update the
            // stored record (so late joiners get the new video via allProps),
            // then relay. Hosts may also change any screen.
            const ytId = (typeof data.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(data.videoId))
                ? data.videoId : null;
            const twRaw = (typeof data.twitchId === 'string') ? data.twitchId : null;
            const twVod = (twRaw && data.twitchKind === 'video' && /^\d{1,20}$/.test(twRaw)) ? twRaw : null;
            const twCh = (twRaw && !twVod && data.twitchKind !== 'video' && /^[A-Za-z0-9_]{1,25}$/.test(twRaw))
                ? twRaw : null;
            const provider = ytId ? 'youtube' : ((twVod || twCh) ? 'twitch' : null);
            if (!provider) return;
            const startedAt = (typeof data.startedAt === 'number' && isFinite(data.startedAt))
                ? data.startedAt : Date.now();
            const rec = activeProps.find(p => p.id === data.propId);
            if (!rec) return;                      // unknown screen: ignore
            if (rec.owner !== clientId) return; // A client may only control its own screen.
            rec.provider = provider;
            rec.videoId = ytId;
            rec.twitchId = twVod || twCh;
            rec.twitchKind = twVod ? 'video' : (twCh ? 'channel' : null);
            rec.startedAt = startedAt;
            rec.paused=false;rec.pausedAt=0;
            // playScreenQueueIndex sends the post-splice queue so every
            // viewer removes the same item; carry it into the record (late
            // joiners) and into the relay.
            if (Array.isArray(data.queue)) rec.queue = data.queue;
            const clean = {
                type: 'ytChange',
                propId: rec.id,
                provider: provider,
                videoId: rec.videoId,
                twitchId: rec.twitchId,
                twitchKind: rec.twitchKind,
                startedAt: startedAt,
                placer: (typeof data.placer === 'string') ? data.placer.substring(0, 64) : (rec.placer || '')
            };
            if (Array.isArray(data.queue)) clean.queue = data.queue;
            broadcastToClients(clean);
            applyYtChange(clean);

        } else if (data.type === 'undoProp') {
            // P2P HOST: Handle Undo Request
            const ownerProps = activeProps.filter(p => p.owner === clientId);
            if (ownerProps.length > 0) {
                ownerProps.sort((a, b) => b.timestamp - a.timestamp);
                const newest = ownerProps[0];
                activeProps = activeProps.filter(p => p.id !== newest.id);
                removePropFromWorld(newest.id);
                broadcastToClients({ type: 'propRemoved', id: newest.id });
            }

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
        } else if (data.type === 'chop_tree') {
            chopTree(data.index, true);
            if (isHost) broadcastToClients(data);
        } else if (data.type === 'mine_rock') {
            mineRock(data.index, true);
            if (isHost) broadcastToClients(data);
        } else if (data.type === 'pick_flower') {
            pickFlower(data.index, true);
            if (isHost) broadcastToClients(data);
        }

    } catch (err) {
        console.warn(`Error handling data from ${clientId}:`, err);
    }
}

function handleDataFromHost(data) {
    if(window.Exploration&&typeof data?.type==='string'&&data.type.startsWith('explore:')){Exploration.host(data);return;}
    if(window.Boats&&typeof data?.type==='string'&&data.type.startsWith('boat:')){Boats.handleHost(data);return;}
    if (window.Tournaments && data && typeof data.type === "string" && data.type.startsWith("tournament:")) { Tournaments.host(data); return; }
    if(window.Housing && data && typeof data.type==='string' && data.type.startsWith('house:')) { Housing.handleHost(data); return; }
    if (data.type === 'error') {
        alert(data.message);
        location.reload();
        return;
    }

    // The host's level arrives with the room handshake (null = stock island).
    // Big maps come as a run of chunks that are glued back together first.
    if (data.type === 'worldLevelStart') {
        // A hostile host could otherwise declare billions of chunks and
        // stream the tab into OOM; honest levels need well under 100.
        const total = Math.max(1, Math.min(1000, data.total | 0));
        levelParts = { total: total, count: 0, parts: [], bytes: 0 };
        return;
    }
    if (data.type === 'worldLevelChunk') {
        if (!levelParts) return;
        const i = data.i | 0;
        if (i < 0 || i >= levelParts.total || typeof levelParts.parts[i] === 'string') return;
        const part = String(data.part);
        levelParts.bytes += part.length;
        if (levelParts.bytes > 8 * 1024 * 1024) { levelParts = null; return; } // oversized: drop
        levelParts.parts[i] = part;
        levelParts.count++;
        if (levelParts.count !== levelParts.total) return;
        const json = levelParts.parts.join('');
        levelParts = null;
        let obj = null;
        try { obj = JSON.parse(json); } catch (err) { return; }
        const chunkQuery = '&room=' + encodeURIComponent(currentRoomId || '');
        if (obj) acceptHostLevel(obj, chunkQuery); else dropActiveLevel(chunkQuery);
        return;
    }
    if (data.type === 'worldLevel') {
        levelParts = null;
        const query = '&room=' + encodeURIComponent(currentRoomId || '');
        if (data.level) acceptHostLevel(data.level, query);
        else dropActiveLevel(query);
        return;
    }

    // Handle Tree Chop Event from Host/Server
    if (data.type === 'chop_tree') {
        chopTree(data.index, true);
        return;
    }
    if (data.type === 'mine_rock') {
        mineRock(data.index, true);
        return;
    }
    if (data.type === 'pick_flower') {
        pickFlower(data.index, true);
        return;
    }

    // A. Full world state (PeerJS Host usually sends this)
    if (data.type === 'worldState') {
        if (data.gameVersion && data.gameVersion !== GAME_VERSION) {
            alert("Game Version Mismatch! Host is on " + data.gameVersion);
            location.reload();
            return;
        }
        // Sync world time from host
        if (typeof data.worldTime === 'number') worldTime = data.worldTime;

        Object.keys(data.players).forEach(pid => {
            if (pid === myPeerId) return;
            if (!otherPlayers[pid]) {
                createRemotePlayer(pid, data.players[pid]);
                connectToPeerAudio(pid);
            }
            updateRemotePlayer(pid, data.players[pid]);
        });
        Object.keys(otherPlayers).forEach(pid => {
            if (!data.players[pid]) removePlayer(pid);
        });

    }


    // B. Environment sync
    else if (data.type === 'environment_sync') {
        worldTime = data.time;
        const prevRain = isRaining;
        isRaining = data.isRaining;
        if (prevRain !== isRaining) {
            updateWeatherVisuals();
            if (isRaining) showToast("It started raining!");
            else showToast("The rain has stopped.");
        }
    }

    else if (data.type === 'purge_chat') {
        purgeUserMessages(data.targetId);
    }

    // C. Gameplay Events
    else if (data.type === 'forceGhost') spawnGhostMesh(data.x, data.z);
    else if (data.type === 'spawnPortal') spawnPortal(data.x, data.z, true);
    else if (data.type === 'chat') {
        if (saveState.debugMode) {
            console.log('[P2P CHAT DEBUG] Received chat from host:', data);
            console.log('[P2P CHAT DEBUG] data.id:', data.id, 'myPeerId:', myPeerId, 'match:', data.id === myPeerId);
        }
        if (data.id !== myPeerId) {
            displayChatMessage(data.name, data.text, data.id);
        }
    }
    else if (data.type === 'screenQueueAdd') {
        // The host relays our own add back to us; we already pushed it
        // locally in addToScreenQueue, so applying it again duplicated the
        // row on the adder's screen.
        let entry = null;
        if (String(data.placer || '') !== String(myDeviceID || '')) {
            entry = (typeof ytPlayers !== 'undefined') ? ytPlayers[data.propId] : null;
            if (entry && entry.data) {
                if (!Array.isArray(entry.data.queue)) entry.data.queue = [];
                const item = data.item || (data.src ? { provider: data.src.provider, id: data.src.id, twitchKind: data.src.twitchKind || null, title: null, addedBy: data.placer } : null);
                if (item && entry.data.queue.length<50) entry.data.queue.push(item);
            }
        }
        if (window.Housing && typeof Housing.addHouseTvQueue === 'function') Housing.addHouseTvQueue(data);
        // If this client is the house owner and the TV is idle, start the
        // first queued video just like the outdoor player's host does.
        if (entry && entry.isHouse && entry.houseOwnerLocal && entry.data &&
            entry.data.queue && entry.data.queue.length > 0 &&
            !entry.data.provider && !entry.data.videoId && !entry.data.twitchId &&
            typeof playScreenQueueIndex === 'function') {
            playScreenQueueIndex(data.propId, entry.data.queue.length - 1);
        }
        if (activeScreenId === data.propId && typeof renderScreenQueue === 'function') renderScreenQueue();
    }
    else if (data.type === 'screenQueueRemove') {
        // Same self-relay filter as screenQueueAdd.
        if (String(data.placer || '') !== String(myDeviceID || '')) {
            const entry = (typeof ytPlayers !== 'undefined') ? ytPlayers[data.propId] : null;
            if (entry && entry.data && Array.isArray(entry.data.queue)) {
                if (data.idx >= 0 && data.idx < entry.data.queue.length) entry.data.queue.splice(data.idx, 1);
            }
        }
        if (activeScreenId === data.propId && typeof renderScreenQueue === 'function') renderScreenQueue();
    }
    else if (data.type === 'screenQueueMove') {
        if (String(data.placer || '') !== String(myDeviceID || '')) {
            const entry = (typeof ytPlayers !== 'undefined') ? ytPlayers[data.propId] : null;
            if (entry && entry.data && Array.isArray(entry.data.queue)) {
                const q = entry.data.queue;
                if (data.from >= 0 && data.from < q.length && data.to >= 0 && data.to < q.length) {
                    const tmp = q[data.from]; q[data.from] = q[data.to]; q[data.to] = tmp;
                }
            }
        }
        if (activeScreenId === data.propId && typeof renderScreenQueue === 'function') renderScreenQueue();
    }
    else if (data.type === 'worldBossSpawn') {
        window.worldBossActive = { x: data.x, z: data.z, expiresAt: data.expiresAt || (Date.now() + 5 * 60 * 1000) };
        if (typeof showWorldBossBeacon === 'function' && Number.isFinite(data.x) && Number.isFinite(data.z)) {
            showWorldBossBeacon(data.x, data.z);
        }
        showToast('A golden light marks the world boss in the ocean!', 'achievement');
    }
    else if (data.type === 'worldBossDefeated') {
        window.worldBossActive = null;
        if (typeof removeWorldBossBeacon === 'function') removeWorldBossBeacon();
        try { addFishToInventory(WORLD_BOSS_FISH); } catch (e) { }
        saveState.money += 2000;
        saveGame();
        showToast('World boss defeated! You received $2,000 and a Leviathan Bass.', 'success');
    }
    else if (data.type === 'tradeRequest' || data.type === 'tradeOffer' || data.type === 'tradeAccept' || data.type === 'tradeCancel') {
        if (typeof handleTradeMessage === 'function') handleTradeMessage(data);
    }
    else if (data.type === 'skillLevel') {
        if (data.id !== myPeerId) {
            displayChatMessage(data.name || 'Unknown', `has reached level ${data.level} in ${data.skill}!`, 'system');
        }
    }
    else if (data.type === 'sound') {
        if(data.id===myPeerId)return;
        // --- MIDI MUTE CHECK START ---
        if (data.name === 'guitar') {
            // 1. Check Global/Admin Mute (Server Flag)
            // Note: 'data.id' is the ID of the person playing the guitar
            if (otherPlayers[data.id] && otherPlayers[data.id].lastData.isMidiMuted) return;

            // 2. Check Local Mute (Player List)
            if (localMutedMidi.includes(data.id)) return;
        }
        // --- MIDI MUTE CHECK END ---

        Sound.playSpatial(data.name, data.pos, data.var, data);
    }
    else if (data.type === 'punch_hit') handleHit(data);
    else if (data.type === 'anim' && data.anim === 'punch') {
        if (otherPlayers[data.id]) {
            animatePunch(otherPlayers[data.id].mesh);
            Sound.playSpatial('punch', otherPlayers[data.id].mesh.position);
        }
    }
    // P2P Prop Sync
    else if(data.type==='prop:notice')window.propPlacementNotice?.(data);
    else if (data.type === 'propPlaced') spawnPropMesh(data.prop);
    else if (data.type === 'propRemoved') removePropFromWorld(data.id);
    else if (data.type === 'allProps') { if (Array.isArray(data.props)) data.props.slice(0, 1000).forEach(p => spawnPropMesh(p)); }
    // Video heartbeat relayed by the host (either from the placer client, or
    // broadcast by theHost when theHost is the placer).
    else if (data.type === 'ytPlayback') applyScreenPlayback(data);
    else if (data.type === 'ytSync') applyYtSync(data);
    // The placer swapped the screen's video.
    else if (data.type === 'ytChange') applyYtChange(data);
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

    broadcastToClients({
        type: 'worldState',
        players: worldState,
        gameVersion: GAME_VERSION,
        worldTime: worldTime
    });
}

function broadcastToClients(msg) { Object.values(clientConns).forEach(conn => { if(conn.open){try{conn.send(msg);}catch(e){console.warn('Peer send failed; continuing room broadcast.');}} }); }
function sendUpdate() {
    if (!player) return;

    // Prepare local player data
    myData.pos = { x: player.position.x, y: player.position.y, z: player.position.z };
    myData.rot = player.rotation.y;
    myData.bobber = (bobber && fishingState !== 'idle' && fishingState !== 'charging') ? { x: bobber.position.x, y: bobber.position.y, z: bobber.position.z } : null;

    if(window.Housing)Object.assign(myData,Housing.presence());
    myData.color = saveState.catColor;
    myData.belly = saveState.bellyColor;
    myData.eye = saveState.eyeColor;
    myData.bodyPaint = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaint) : '');
    myData.bodyPaintBack = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintBack) : '');
    myData.bodyPaintLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintLeft) : '');
    myData.bodyPaintRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintRight) : '');
    myData.bodyPaintHeadFront = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadFront) : '');
    myData.bodyPaintHeadBack = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadBack) : '');
    myData.bodyPaintHeadLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadLeft) : '');
    myData.bodyPaintHeadRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadRight) : '');
    myData.bodyPaintHeadTop = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadTop) : '');
    myData.bodyPaintHeadBottom = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadBottom) : '');
    myData.bodyPaintArmLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintArmLeft) : '');
    myData.bodyPaintArmRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintArmRight) : '');
    myData.bodyPaintLegLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintLegLeft) : '');
    myData.bodyPaintLegRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintLegRight) : '');
    myData.bodyPaintColor = (typeof normalizeBodyPaintColor === 'function' ? normalizeBodyPaintColor(saveState.bodyPaintColor) : '#ffffff');
    myData.hat = saveState.currentHat;
    myData.species = saveState.species; // Keep for backwards compatibility
    // Modular parts
    myData.ears = saveState.currentEars;
    myData.eyes = saveState.currentEyes;
    myData.nose = saveState.currentNose;
    myData.misc = saveState.currentMisc;
    myData.protogenLogo=globalThis.window?.ProtogenLogo?.normalize(saveState.protogenLogo)||'';
    myData.tail = saveState.currentTail;
    myData.guitar = isGuitarActive;
    myData.glove = isGloveActive;
    myData.title = saveState.currentTitle;
    myData.heldFish = localHeldFish;
    myData.shirt = saveState.currentShirt;
    myData.pants = saveState.currentPants;
    myData.collar = saveState.currentCollar;
    myData.name = saveState.displayName;
    myData.rod = saveState.currentRod;
    myData.handsEmpty = isHandsHidden;
    myData.hair = saveState.currentHair;
    myData.hairColor = saveState.hairColor;
    myData.bobberType = saveState.currentBobber;
    // Sailing state: lets every peer show the rowboat and stop this player's
    // walking animation while the boat is out.
    myData.sailing = isSailing;
    // Dive/prone state for remote animation sync.
    myData.dive = isDiving;
    myData.prone = isProne;
    myData.reeling = fishingState==='reeling'&&!!minigame.active;
    myData.sitting = isSitting||!!window.Boats?.isSeated();
    myData.typing = chatTypingActive();
    myData.idle = !!player.userData.standingIdle;
    myData.jumping = !!player.userData.jumpAirborne;
    myData.jumpVelocity = myData.jumping?THREE.MathUtils.clamp(playerVelocity.y,-50,50):0;
    myData.emote = window.Emotes?.networkState()||null;

    myData.bobberType = saveState.currentBobber;

    // DETERMINE CURRENT TOOL - use same mapping as selectTool()
    const toolId=equippedToolFromSave();
    myData.handsEmpty=toolId==='hands'&&!localHeldFish;

    myData.tool = toolId;

    myData.version = GAME_VERSION;

    // --- PEERJS HOST LOGIC ---
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
                if (clientConns[id]) { clientConns[id].close(); delete clientConns[id]; }
                broadcastPlayerList();
                updateHostPanel();
            }
        });
        broadcastPlayerList();
    }
    // --- 3. PEERJS CLIENT LOGIC ---
    else if (hostConn && hostConn.open) {
        hostConn.send({ type: 'update', payload: myData });
    }
}
setInterval(sendUpdate, 50);

function equippedToolFromSave(){
    const entry=saveState.hotbar?.[saveState.activeHotbarIndex];
    if(isGuitarActive)return 'guitar';if(isGloveActive)return 'glove';
    if(localHeldFish||isHandsHidden)return 'hands';
    if(player?.getObjectByName('axe')?.visible)return 'axe';
    if(player?.getObjectByName('pickaxe')?.visible)return 'pickaxe';
    if(entry)return entry.type==='tool'?entry.id:'hands';
    return ['rod','hands','axe','guitar','glove','pickaxe'][saveState.activeToolIndex]||'hands';
}
function makeHeldTool(type,name){
    let tool;
    if(saveState.model3D&&window.Character3D?.buildTool)tool=Character3D.buildTool(type);
    else{
        const texture=type==='axe'?createAxeTexture():type==='pickaxe'?createPickaxeTexture():type==='guitar'?createGuitarTexture():createGloveTexture();
        if(type==='axe'||type==='pickaxe'){
            const geometry=new THREE.PlaneGeometry(2.5,2.5);geometry.translate(.5,.5,0);
            tool=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,alphaTest:.5}));tool.rotation.set(-.2,-Math.PI/2,0);tool.scale.x=-1;
        }else{tool=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,alphaTest:.5}));tool.scale.setScalar(type==='guitar'?1.5:1.2);}
        tool.userData={is3D:false,toolType:type};
    }
    tool.name=name;tool.position.set(type==='guitar'?.3:.56,type==='guitar'?1.05:.84875,type==='glove'?.5:.43);
    if(!tool.userData.is3D)tool.position.set(type==='guitar'?.3:.6,type==='guitar'||type==='glove'?1.25:.96,type==='guitar'?.2:type==='glove'?.5:.1);
    if(tool.userData.is3D&&type!=='guitar'&&type!=='glove')tool.rotation.x=.3;
    return tool;
}
function syncRemoteHeldItems(group,data){
    const selected=data.guitar?'guitar':data.glove?'glove':data.heldFish?'fish':data.handsEmpty||data.tool==='hands'?'hands':data.tool||'hands';
    const names={rod:'rod',guitar:'guitarMesh',glove:'gloveMesh',axe:'axeMesh',pickaxe:'pickaxeMesh',fish:'heldFishSprite'};
    for(const [type,name] of Object.entries(names)){
        let item=group.getObjectByName(name);
        if(type!==selected){if(item)item.visible=false;continue;}
        const wrong=item&&(!!item.userData.is3D!==!!saveState.model3D||(type==='rod'&&item.userData.rodId!==(data.rod||'bamboo'))||(type==='fish'&&(item.userData.fishName!==data.heldFish.name||item.userData.size!==(data.heldFish.size||1))));
        if(wrong){disposeCharacterBody(item);item.parent.remove(item);item=null;}
        if(!item){item=type==='rod'?makeRod(data.rod):type==='fish'?makeHeldFish(data.heldFish.name,data.heldFish.color,data.heldFish.size):makeHeldTool(type,name);group.add(item);}
        item.visible=true;
    }
}

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
        data.rod || 'bamboo',
        data.hair || 'none',
        data.hairColor || ''
    );

    group.userData.characterKind = 'player';
    // Apply full cosmetics (shirt, collar, body paint, modular parts, ...).
    replaceCharacterBody(group, characterCfgFromData(data));
    syncRemoteHeldItems(group,data);

    scene.add(group);

    // Store the player data
    // Accept both nested 'pos' and flat 'x,y,z' shapes from peers.
    const tx = (data.pos && data.pos.x) || data.x || 0;
    const ty = (data.pos && data.pos.y) || data.y || 0;
    const tz = (data.pos && data.pos.z) || data.z || 0;

    otherPlayers[id] = {
        mesh: group,
        targetPos: new THREE.Vector3(tx, ty, tz),
        targetRot: data.rot || 0,
        bobberMesh: null,
        lineMesh: null,
        lastData: data,
        lastSeen: Date.now(),
        pendingJoinAnnounce: !!(window.CUSTOM_LEVEL && window.Level)
    };

    // Chat notification
    if (document.getElementById('lobby-screen').style.display === 'none') {
        const isCustom = !!(window.CUSTOM_LEVEL && window.Level);
        if (isCustom) {
            if (!window.seenPlayerNames) window.seenPlayerNames = new Set();
            if (window.seenPlayerNames.has(nameToUse)) {
                // Reconnect after map download: real join
                displayChatMessage(nameToUse, "has joined!", 'system');
            } else {
                window.seenPlayerNames.add(nameToUse);
                displayChatMessage(nameToUse, "is downloading the map...", 'system');
            }
        } else {
            displayChatMessage(nameToUse, "has joined!", 'system');
        }
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
        if (oldNameTag) {
            const newTex = createNameTagTexture(data.name);
            if (oldNameTag.material.map) oldNameTag.material.map.dispose();
            oldNameTag.material.map = newTex;
            oldNameTag.scale.set(3*newTex.image.width/256,.75,1);
            oldNameTag.material.needsUpdate = true;
        }
    }

    // 2. TITLE SYNC
    if (p.lastData.title !== data.title) {
        const oldT = p.mesh.getObjectByName('titleSprite');
        if (oldT) p.mesh.remove(oldT);
        const tTex = createTitleTexture(data.title);
        if (tTex) {
            const tSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tTex }));
            tSprite.position.y = 3.45; tSprite.scale.set(3, 0.75, 1); tSprite.name = "titleSprite";
            tSprite.visible = saveState.showTitles;
            p.mesh.add(tSprite);
        }
    }

    // 3. VISUALS SYNC (Colors, Hat, Shirt, Collar, Body Paint, Parts)
    const partsChanged = (p.lastData.ears !== data.ears || p.lastData.eyes !== data.eyes ||
        p.lastData.nose !== data.nose || p.lastData.misc !== data.misc ||
        p.lastData.tail !== data.tail || p.lastData.hair !== data.hair);
    const partColorsChanged = (p.lastData.earsColor !== data.earsColor || p.lastData.noseColor !== data.noseColor ||
        p.lastData.miscColor !== data.miscColor || p.lastData.tailColor !== data.tailColor || p.lastData.hairColor !== data.hairColor || p.lastData.handColor !== data.handColor || p.lastData.footColor !== data.footColor || p.lastData.tailAccentColor !== data.tailAccentColor);
    const paintChanged = key => (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(p.lastData[key]) : '') !== (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data[key]) : '');
    const paintColorChanged = (typeof normalizeBodyPaintColor === 'function' ? normalizeBodyPaintColor(p.lastData.bodyPaintColor) : '#ffffff') !== (typeof normalizeBodyPaintColor === 'function' ? normalizeBodyPaintColor(data.bodyPaintColor) : '#ffffff');
    if (p.lastData.color !== data.color || p.lastData.belly !== data.belly || p.lastData.hat !== data.hat ||
        (globalThis.window?.ProtogenLogo?.normalize(p.lastData.protogenLogo)||'')!==(globalThis.window?.ProtogenLogo?.normalize(data.protogenLogo)||'') || p.lastData.eye !== data.eye || p.lastData.species !== data.species || p.lastData.shirt !== data.shirt || p.lastData.pants !== data.pants ||
        p.lastData.collar !== data.collar || paintChanged('bodyPaint') || paintChanged('bodyPaintBack') || paintChanged('bodyPaintLeft') || paintChanged('bodyPaintRight') || paintChanged('bodyPaintHeadFront') || paintChanged('bodyPaintHeadBack') || paintChanged('bodyPaintHeadLeft') || paintChanged('bodyPaintHeadRight') || paintChanged('bodyPaintHeadTop') || paintChanged('bodyPaintHeadBottom') || paintChanged('bodyPaintArmLeft') || paintChanged('bodyPaintArmRight') || paintChanged('bodyPaintLegLeft') || paintChanged('bodyPaintLegRight') || paintColorChanged || partsChanged || partColorsChanged) {

        // Determine if using new parts system or legacy species
        replaceCharacterBody(p.mesh, characterCfgFromData(data));
    }

    // 3.5 SAILING BOAT SYNC — show the rowboat while this player sails.
    // attachSailBoat() names the mesh 'sailBoat' and starts hidden, so peers
    // only ever see it while data.sailing is true.
    let remoteBoat = p.mesh.getObjectByName('sailBoat');
    if (!remoteBoat) remoteBoat = attachSailBoat(p.mesh);
    if (remoteBoat) remoteBoat.visible = data.sailing === true;

    // 4. POSITION INTERPOLATION
    p.lastData = data;

    // --- FIX START: Restore Admin Mute Flags ---
    p.lastData.isVoiceMuted = wasVoiceMuted;
    p.lastData.isChatMuted = wasChatMuted;
    p.lastData.isMidiMuted = wasMidiMuted;
    if (document.hidden) syncRemoteVoiceVolumes();
    // Update Position
    // FIX: Handle both nested 'pos' and flat 'x,y,z'
    if (data.pos) {
        p.targetPos.set(data.pos.x, data.pos.y, data.pos.z);
    } else if (typeof data.x === 'number') {
        p.targetPos.set(data.x, data.y, data.z);
    }

    // Update Rotation
    if (typeof data.rot === 'number') p.targetRot = data.rot;
    // --- FIX END ---

    syncRemoteHeldItems(p.mesh,data);

    // 6. BOBBER & LINE SYNC
    if (data.bobber) {
        if (!p.bobberMesh || p.bobberType !== data.bobberType) {
            if (p.bobberMesh) {scene.remove(p.bobberMesh);disposeCharacterBody(p.bobberMesh);}

            p.bobberType = data.bobberType || 'classic';
            p.bobberMesh = createBobberMesh(p.bobberType);
            scene.add(p.bobberMesh);
        }

        p.bobberMesh.position.set(data.bobber.x, data.bobber.y, data.bobber.z);

        if (!p.lineMesh) {
            const mat = new THREE.LineBasicMaterial({ color: 0x000000 });
            const pts = [];
            pts.push(new THREE.Vector3(data.pos.x, data.pos.y + 0.5, data.pos.z)); // Approx rod tip
            pts.push(new THREE.Vector3(data.bobber.x, data.bobber.y, data.bobber.z));
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            p.lineMesh = new THREE.Line(geo, mat);
            p.lineMesh.frustumCulled = false;
            scene.add(p.lineMesh);
        } else {
            // Update line positions
            const posAttribute = p.lineMesh.geometry.getAttribute('position');
            // Update rod tip (estimation)
            // We don't have exact rod tip pos for remote players easily without skeleton
            // So we just use player pos + offset
            const rodOffset = new THREE.Vector3(0.3, 0.8, 0.5);
            rodOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rot);
            rodOffset.add(p.mesh.position);

            posAttribute.setXYZ(0, rodOffset.x, rodOffset.y, rodOffset.z);
            posAttribute.setXYZ(1, data.bobber.x, data.bobber.y, data.bobber.z);
            posAttribute.needsUpdate = true;
        }

        const activeRod = p.mesh.getObjectByName("rod");
        if (activeRod) {
            // SYNC CAST ANIMATION: swing the rod out towards the water.
            activeRod.rotation.x = rodAngleFor(activeRod, true);
        }
    } else {
        if (p.bobberMesh) { scene.remove(p.bobberMesh);disposeCharacterBody(p.bobberMesh); scene.remove(p.lineMesh); p.bobberMesh = null; p.lineMesh = null; }

        // RESET REMOTE ROD (Idle Position)
        const activeRod = p.mesh.getObjectByName("rod");
        if (activeRod) {
            activeRod.rotation.x = rodAngleFor(activeRod, false);
        }
    }
}

function initChatPool() {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    box.innerHTML = ''; // Clear initial clutter if any

    for (let i = 0; i < MAX_CHAT_MESSAGES; i++) {
        const line = document.createElement('div');
        line.className = 'chat-msg';
        line.style.display = 'none'; // Initially hidden
        box.appendChild(line);
        chatPool.push(line);
    }
}

let gameAnchorSyncTimer = null;
let lastGameAnchorSpace = -1;

// Auto anchor ads can collapse, expand, or be dismissed by the player. Follow
// their live height instead of keeping one fixed strip, so the HUD drops back
// down when the ad shrinks and rises again when it expands.
function measureGameAnchorHeight() {
    let height = 0;
    const fixedAtBottom = (el) => {
        if (!el.getBoundingClientRect) return 0;
        const rect = el.getBoundingClientRect();
        // Include the gap below the ad (safe-area insets included) so the HUD
        // clears the ad even when it is not flush against the viewport edge.
        if (rect.height < 18 || rect.bottom < window.innerHeight - 100) return 0;
        let node = el;
        while (node && node !== document.documentElement) {
            const pos = getComputedStyle(node).position;
            if (pos === 'fixed' || pos === 'sticky') return Math.max(0, window.innerHeight - rect.top);
            node = node.parentElement;
        }
        return 0;
    };

    document.querySelectorAll('[data-anchor-status]').forEach((el) => {
        const status = String(el.getAttribute('data-anchor-status') || '').toLowerCase();
        if (/hidden|dismiss|removed|closed/.test(status)) return;
        height = Math.max(height, fixedAtBottom(el));
        el.querySelectorAll('iframe').forEach((frame) => {
            height = Math.max(height, fixedAtBottom(frame));
        });
    });

    // Some anchor builds only expose the fixed ad iframe.
    document.querySelectorAll('ins.adsbygoogle, iframe[src*="googleads"], iframe[src*="doubleclick"], iframe[id^="aswift_"]').forEach((frame) => {
        height = Math.max(height, fixedAtBottom(frame));
    });
    return height;
}

function syncGameAnchorSpace() {
    if (!document.body.classList.contains('game-active')) return;
    const height = measureGameAnchorHeight();
    const gap = (window.matchMedia && window.matchMedia('(max-width:900px)').matches) ? 8 : 14;
    const next = height ? Math.ceil(height + gap) : 0;
    if (next === lastGameAnchorSpace) return;
    lastGameAnchorSpace = next;
    document.body.style.setProperty('--game-anchor-space', next + 'px');
}

function startGameAnchorSync() {
    syncGameAnchorSpace();
    if (gameAnchorSyncTimer) return;
    gameAnchorSyncTimer = setInterval(syncGameAnchorSpace, 500);
    window.addEventListener('resize', syncGameAnchorSpace);
    window.visualViewport?.addEventListener('resize', syncGameAnchorSpace);
}

function startGame() {
    // Bottom anchor ads live in the viewport's reserved safe strip. Only lift
    // the gameplay HUD once the player is actually in a session.
    document.body.classList.add('game-active');
    startGameAnchorSync();
    window.Boats?.start();
    if (!isMobile) document.getElementById('chat-ui').style.display = 'flex';
    Music.init();
    initChatPool();
    // One-time nudge toward the quest-giver, plus the Progress badge in case
    // there is already something waiting (unclaimed bounty, etc.).
    if (typeof maybeShowFisherHint === 'function') maybeShowFisherHint();
    if (typeof updateProgressBadge === 'function') updateProgressBadge();
} // Called after lobby

function sendChatMessage(text) {
    const now = Date.now();

    // Rate Limit
    if (now - lastChatTime < CHAT_COOLDOWN) {
        showToast("Chatting too fast!", 'error');
        return;
    }
    lastChatTime = now;

    const safeText = text.substring(0, 256);
    if (!safeText.trim()) return;

    const isImageUrl = !!allowedChatImageUrl(safeText);

    // 2. Display locally immediately
    displayChatMessage(saveState.displayName, safeText, 'local');
    showChatBubble(player, isImageUrl ? 'Image posted...' : safeText);

    // 3. Prepare Network Message
    const msg = { type: 'chat', text: safeText };

    // --- PEERJS HOST LOGIC ---
    if (isHost) {
        const peerMsg = { ...msg, name: saveState.displayName, id: myPeerId };
        broadcastToClients(peerMsg);
    }
    // --- PEERJS CLIENT LOGIC ---
    else if (hostConn && hostConn.open) {
        const peerMsg = { ...msg, name: saveState.displayName, id: myPeerId };
        hostConn.send(peerMsg);
    }
}

// --- SECURITY FIX: Safe Image Embedding ---
// Validate on RECEIPT as well as local display: modified peers can bypass the
// send UI. Exact CDN names only; never a suffix/substring match or an IP host.
const CHAT_IMAGE_HOSTS = ['i.imgur.com', 'i.redd.it', 'preview.redd.it'];
function allowedChatImageUrl(text) {
    if(typeof text!=='string'||text.length>512)return null;
    let url;try{url=new URL(text.trim());}catch(error){return null;}
    if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
    if(!CHAT_IMAGE_HOSTS.includes(url.hostname)&&!GIF_MEDIA_HOSTS.includes(url.hostname))return null;
    if(!/\.(png|jpe?g|gif|webp|avif)$/i.test(url.pathname))return null;
    url.hash='';return url.href;
}
function safeEmbedImage(text) {
    const allowed=allowedChatImageUrl(text);
    if(!allowed)return escapeHTML(text);
    return `<img src="${escapeHTML(allowed)}" referrerpolicy="no-referrer" loading="lazy" decoding="async" class="chat-img" style="max-width:200px; max-height:200px; border-radius:10px; vertical-align:middle;" alt="Image from an approved image host">`;
}

// ===========================================================================
// GIF SEARCH (GIPHY, Tenor-compatible API)
// ---------------------------------------------------------------------------
// A search box built into the chat. Picking a result sends the GIF's direct
// URL as an ordinary chat message, so it flows through exactly the same
// pipeline (and the same safeEmbedImage rendering) as any pasted image link.
//
// Setup: paste a GIPHY API key below (free, from the GIPHY developer
// dashboard). Without one the panel opens and explains that search is not
// configured rather than failing silently.
//
// Why GIPHY and not Tenor: Google shut the Tenor API down on 30 June 2026 and
// stopped issuing new keys in January 2026. GIPHY runs Tenor-compatible
// endpoints on /v2/* that take the same request and return the same
// results[].media_formats.* shape, so this is a host + parameter swap.
//
// NOTE: the key is visible to anyone who views the page source. GIPHY beta
// keys are limited to 100 calls/hour, which is fine for a small lobby but is
// another reason to move search behind the master server later if it grows.
// ===========================================================================
const GIF_API_KEY = 'aM8lJdWLEnPC1CHzdP8gkv0SnMBArJfP'; // GIPHY API key

const GIF_CLIENT_KEY = 'html_fishing';    // identifies this integration to GIPHY
const GIF_LIMIT = 50;                     // results per search (API max 50)
const GIF_TIMEOUT_MS = 8000;

// GIPHY's Tenor-compatible layer. Swapping this one constant is all it takes to
// move back to Tenor should their API ever return.
const GIF_API_HOST = 'https://api.giphy.com';

// Only these hosts are trusted to serve GIFs into the chat. Both the picker and
// incoming chat messages are filtered through this, so a peer cannot use the
// GIF path to make everyone's client fetch an arbitrary URL (IP leak / abuse).
const GIF_MEDIA_HOSTS = ['media.giphy.com', 'media0.giphy.com', 'media1.giphy.com',
                         'media2.giphy.com', 'media3.giphy.com', 'media4.giphy.com',
                         'i.giphy.com'];

function isAllowedGifUrl(url) {
    const allowed=allowedChatImageUrl(url);
    return !!allowed&&GIF_MEDIA_HOSTS.includes(new URL(allowed).hostname);
}

let gifSearchAbort = null;
let gifLastQuery = '';
let gifNext = null;

function gifStatus(msg, isError) {
    const el = document.getElementById('gif-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = isError ? 'error' : '';
}

function gifRenderResults(results, append) {
    const box = document.getElementById('gif-results');
    if (!box) return;
    if (!append) box.innerHTML = '';
    if (!results.length && !append) {
        gifStatus('No GIFs found.', false);
        return;
    }
    gifStatus('', false);
    for (const r of results) {
        const mf = r.media_formats || {};
        const preview = (mf.tinygif || mf.nanogif || mf.gif || {}).url;
        const full = (mf.gif || mf.tinygif || mf.nanogif || {}).url;
        if (!isAllowedGifUrl(preview) || !isAllowedGifUrl(full)) continue;

        const img = document.createElement('img');
        img.referrerPolicy = 'no-referrer';
        img.src = preview;
        img.alt = (r.content_description || 'GIF').substring(0, 100);
        img.loading = 'lazy';
        img.dataset.full = full;
        img.dataset.share = (r.analytics && r.analytics.onsent && r.analytics.onsent.url) || '';
        img.onclick = () => gifPick(img.dataset.full, img.dataset.share);
        box.appendChild(img);
    }
    // Show/hide load-more button
    const more = document.getElementById('gif-more');
    if (more) more.style.display = gifNext ? 'block' : 'none';
}

// Picking a GIF sends its URL as a normal chat message, so everyone (including
// the sender) renders it through the existing image-embedding path.
function gifPick(fullUrl, shareUrl) {
    if (!isAllowedGifUrl(fullUrl)) { gifStatus('That GIF is not from an allowed host.', true); return; }
    // Fire the share event so the API can improve results. Best effort only;
    // the URL comes from the API response, but re-check the host anyway.
    if (GIF_API_KEY && shareUrl) {
        try {
            const share = new URL(shareUrl);
            if (share.protocol === 'https:' && /(^|\.)giphy\.com$/i.test(share.hostname)) {
                share.searchParams.set('ts', String(Date.now()));
                fetch(share.toString()).catch(() => { /* non-fatal */ });
            }
        } catch (e) { /* non-fatal */ }
    }
    sendChatMessage(fullUrl);
    gifClosePanel();
}

function gifClosePanel() {
    const panel = document.getElementById('gif-panel');
    if (panel) panel.style.display = 'none';
    if (gifSearchAbort) { gifSearchAbort.abort(); gifSearchAbort = null; }
    gifStatus('', false);
}

function gifOpenPanel() {
    const panel = document.getElementById('gif-panel');
    if (!panel) return;
    panel.style.display = 'flex';
    const ui = document.getElementById('chat-ui');
    if (ui) ui.style.opacity = '1';
    if (chatFadeTimer) clearTimeout(chatFadeTimer);
    if (!GIF_API_KEY) {
        gifStatus('GIF search is not configured (no GIPHY API key).', true);
        return;
    }
    const search = document.getElementById('gif-search');
    if (search) search.focus();
    // Show trending immediately so the panel is never empty on open.
    if (!document.getElementById('gif-results').childElementCount) {
        gifLoadTrending();
    }
}

async function gifFetch(url) {
    if (gifSearchAbort) gifSearchAbort.abort();
    gifSearchAbort = new AbortController();
    const timer = setTimeout(() => gifSearchAbort && gifSearchAbort.abort(), GIF_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: gifSearchAbort.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        // A known error can still arrive with HTTP 200; surface it rather than
        // rendering an empty grid.
        if (data && data.error) throw new Error(data.error);
        return data;
    } finally {
        clearTimeout(timer);
    }
}

// Shared query parameters. `rating=pg` keeps search results lobby-friendly;
// the API defaults to unrestricted.
function gifParams(extra, pos) {
    const params = new URLSearchParams({
        key: GIF_API_KEY,
        client_key: GIF_CLIENT_KEY,
        limit: String(GIF_LIMIT),
        rating: 'pg'
    });
    if (pos) params.set('pos', pos);
    if (extra) for (const k in extra) params.set(k, extra[k]);
    return params;
}

async function gifLoadTrending() {
    if (!GIF_API_KEY) return;
    gifNext = null;
    gifStatus('Loading...', false);
    try {
        const data = await gifFetch(GIF_API_HOST + '/v2/featured?' + gifParams());
        gifNext = (data && data.next) || null;
        gifRenderResults(data.results || [], false);
    } catch (err) {
        if (err && err.name === 'AbortError') return;
        gifStatus('Could not reach the GIF service.', true);
    }
}

async function gifSearch(query) {
    const q = (query || '').trim();
    if (!GIF_API_KEY) { gifStatus('GIF search is not configured (no GIPHY API key).', true); return; }
    if (!q) { gifLoadTrending(); return; }
    gifLastQuery = q;
    gifNext = null;
    gifStatus('Searching...', false);
    try {
        const data = await gifFetch(GIF_API_HOST + '/v2/search?' + gifParams({ q: q }));
        gifNext = (data && data.next) || null;
        gifRenderResults(data.results || [], false);
    } catch (err) {
        if (err && err.name === 'AbortError') return;
        gifStatus('Could not reach the GIF service.', true);
    }
}

async function gifLoadMore() {
    if (!gifNext) return;
    const pos = gifNext;
    gifNext = null;
    const more = document.getElementById('gif-more');
    if (more) more.disabled = true;
    try {
        const url = gifLastQuery
            ? GIF_API_HOST + '/v2/search?' + gifParams({ q: gifLastQuery }, pos)
            : GIF_API_HOST + '/v2/featured?' + gifParams({}, pos);
        const data = await gifFetch(url);
        gifNext = (data && data.next) || null;
        gifRenderResults(data.results || [], true);
    } catch (err) {
        if (err && err.name === 'AbortError') return;
        gifStatus('Could not load more GIFs.', true);
    } finally {
        if (more) more.disabled = false;
    }
}

// Wires the GIF button, search box and close button. Called from setupInputs().
function setupGifPicker() {
    const btn = document.getElementById('gif-btn');
    const close = document.getElementById('gif-close');
    const search = document.getElementById('gif-search');
    const panel = document.getElementById('gif-panel');
    if (!btn || !panel) return;

    btn.onclick = () => {
        if (panel.style.display === 'none' || !panel.style.display) gifOpenPanel();
        else gifClosePanel();
    };
    if (close) close.onclick = gifClosePanel;

    const more = document.getElementById('gif-more');
    if (more) more.onclick = () => gifLoadMore();

    let debounce = null;
    if (search) {
        search.oninput = () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => gifSearch(search.value), 400);
        };
        search.onkeydown = (e) => {
            // Keep typing inside the box; Enter searches immediately.
            if (e.key === 'Enter') {
                e.preventDefault();
                if (debounce) clearTimeout(debounce);
                gifSearch(search.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                gifClosePanel();
            }
            e.stopPropagation();
        };
    }
}

function displayChatMessage(name, text, id) {
    // 1. MUTE CHECKS
    if (id && id !== 'system' && id !== 'local') {
        if (localMutedChat.includes(id)) return;
        if (otherPlayers[id] && otherPlayers[id].lastData && otherPlayers[id].lastData.isChatMuted) return;
    }

    const box = document.getElementById('chat-messages');

    // --- OBJECT POOLING ---
    // 1. Get next element
    if (chatPool.length === 0) initChatPool(); // Just in case

    const line = chatPool[chatPoolIndex];
    chatPoolIndex = (chatPoolIndex + 1) % MAX_CHAT_MESSAGES;

    // 2. Move to bottom (visually)
    box.appendChild(line);
    line.style.display = 'block';
    line.className = 'chat-msg'; // Reset class
    line.innerHTML = ''; // Clear content
    // ----------------------

    // Store sender ID for moderation (purging)
    if (id) line.dataset.senderId = id;

    const safeName = escapeHTML(name || "Unknown");

    // Truncate length
    const rawText = (text || "").substring(0, 256);
    // Determine the safe version of the text for bubbles/fallbacks
    const safeText = escapeHTML(rawText);

    if (id === 'system') {
        line.innerHTML = `<span style="color:var(--p-sand); font-style:italic; font-size:15px;">${safeName} ${safeText}</span>`;
    } else {

        // --- SECURITY LOGIC ---
        // Replaced 'embedImageIfValid' with 'safeEmbedImage' to ensure XSS protection.
        const content = safeEmbedImage(rawText);

        line.innerHTML = `<span class="chat-name">${safeName}:</span><span class="chat-text">${content}</span>`;
    }

    // --- SCROLL FIX ---
    box.scrollTop = box.scrollHeight;

    // --- IMAGE LOADING SCROLL FIX ---
    const images = line.getElementsByTagName('img');
    if (images.length > 0) {
        images[0].onload = function () {
            box.scrollTop = box.scrollHeight;
        };
        if (images[0].complete) {
            box.scrollTop = box.scrollHeight;
        }
    }

    // --- CHAT BUBBLES ---
    // Check if it's an image URL to decide bubble content
    const isImageUrl = !!allowedChatImageUrl(rawText);
    const bubbleContent = isImageUrl ? 'Image posted...' : rawText;

    if (id && id !== 'local' && id !== 'system' && otherPlayers[id]) {
        showChatBubble(otherPlayers[id].mesh, bubbleContent);
    } else if (id === 'local' && player) {
        showChatBubble(player, bubbleContent);
    }

    refreshChatFade();

    // Animal Crossing-style voice: the speaker flaps their mouth and emits a
    // proximity-attenuated blip per character. System messages stay silent.
    if (id && id !== 'system') {
        if (id === 'local') {
            if (typeof player !== 'undefined' && player) {
                startPlayerTalking(player, rawText, (typeof myPeerId !== 'undefined' ? myPeerId : saveState.displayName));
            }
        } else if (otherPlayers[id] && otherPlayers[id].mesh) {
            startPlayerTalking(otherPlayers[id].mesh, rawText, id);
        }
    }
}

function wrapChatBubbleText(text,measure,maxWidth){
    const lines=[];
    for(const paragraph of text.split(/\r?\n/)){
        let line='';
        for(const word of paragraph.split(/\s+/).filter(Boolean)){
            const candidate=line?line+' '+word:word;
            if(measure(candidate)<=maxWidth){line=candidate;continue;}
            if(line){lines.push(line);line='';}
            const letters=typeof Intl!=='undefined'&&Intl.Segmenter?Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(word),part=>part.segment):Array.from(word);
            for(const letter of letters){if(line&&measure(line+letter)>maxWidth){lines.push(line);line='';}line+=letter;}
        }
        lines.push(line);
    }
    return lines;
}
function showChatBubble(parentMesh, text) {
    const existing=parentMesh.getObjectByName('chatBubble');
    if(existing){parentMesh.remove(existing);existing.material?.map?.dispose();existing.material?.dispose();}
    const fontSize=22,lineHeight=28,padding=20,canvasWidth=256;
    const safeText=Array.from(String(text||'')).slice(0,256).join('');
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    ctx.font='bold '+fontSize+'px Arial';
    const lines=wrapChatBubbleText(safeText,line=>ctx.measureText(line).width,canvasWidth-padding*2);
    const canvasHeight=lines.length*lineHeight+padding*2;
    canvas.width=canvasWidth;canvas.height=canvasHeight;

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
    sprite.position.y = 4.15 + (scaleY / 2);
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

function createLavaWorld() {
    // Clear old data
    if (lavaFloorMesh) scene.remove(lavaFloorMesh);
    if (lavaLakeMesh) scene.remove(lavaLakeMesh);
    if (window.lavaRockGroup) {
        window.lavaRockGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
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
    lavaFloorMesh.name='lavaWorldFloor';
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
    lavaLakeMesh.name='lavaWorldLake';
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
        { x: -19950, z: 0 },        // Return portal
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
            const d = Math.sqrt(dx * dx + dz * dz);
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

        rock.position.set(x, scale / 2, z);
        rock.scale.set(scale, scale, scale);
        rock.rotation.set(rand(), rand(), rand());

        window.lavaRockGroup.add(rock);

        lavaColliders.push({ x: x, z: z, radius: scale * 0.8 });
    }

    // 4. Embers
    const particlesGeo = new THREE.BufferGeometry();
    const particleCount = 200;
    const posArray = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
        posArray[i] = -20000 + (Math.random() - 0.5) * 100;
        posArray[i + 1] = Math.random() * 50;
        posArray[i + 2] = (Math.random() - 0.5) * 100;
    }
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particlesMat = new THREE.PointsMaterial({ color: 0xffaa00, size: 0.5 });
    const embers = new THREE.Points(particlesGeo, particlesMat);
    scene.add(embers);

    if(!lavaExitPortalMesh){
        lavaExitPortalMesh=new THREE.Group();
        const disc=new THREE.Mesh(new THREE.CircleGeometry(2.7,32),new THREE.MeshBasicMaterial({color:0xff8a3c,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
        disc.rotation.x=-Math.PI/2;lavaExitPortalMesh.add(disc);
        const rim=new THREE.Mesh(new THREE.RingGeometry(2.8,3.6,32),new THREE.MeshBasicMaterial({color:0xffd09a,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
        rim.rotation.x=-Math.PI/2;rim.position.y=.02;lavaExitPortalMesh.add(rim);
        lavaExitPortalMesh.position.set(-19950,.25,0);
        lavaExitPortalMesh.name='lavaExitPortal';
        scene.add(lavaExitPortalMesh);
        const light=new THREE.PointLight(0xff7a35,1.3,20);light.position.set(-19950,2,0);scene.add(light);
    }
    if(lavaExitPortalMesh.parent!==scene)scene.add(lavaExitPortalMesh);
}


let waterfallMesh;

// Convex cave rocks keep their real world-space faces and vertical clearance.
function makeCaveRockCollider(rock){
    rock.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(rock),center=rock.getWorldPosition(new THREE.Vector3());
    const positions=rock.geometry.attributes.position,index=rock.geometry.index,planes=[];
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3(),edge=new THREE.Vector3();
    const count=index?index.count:positions.count;
    for(let i=0;i<count;i+=3){
        a.fromBufferAttribute(positions,index?index.getX(i):i).applyMatrix4(rock.matrixWorld);
        b.fromBufferAttribute(positions,index?index.getX(i+1):i+1).applyMatrix4(rock.matrixWorld);
        c.fromBufferAttribute(positions,index?index.getX(i+2):i+2).applyMatrix4(rock.matrixWorld);
        normal.copy(b).sub(a).cross(edge.copy(c).sub(a));if(normal.lengthSq()<1e-12)continue;normal.normalize();
        if(normal.dot(edge.copy(center).sub(a))>0)normal.negate();
        planes.push({x:normal.x,y:normal.y,z:normal.z,d:normal.dot(a)});
    }
    return {minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z,minY:bounds.min.y,maxY:bounds.max.y,planes,caveRock:true};
}
function caveRockSurfaceY(collider,x,z){
    if(x<collider.minX||x>collider.maxX||z<collider.minZ||z>collider.maxZ)return -Infinity;
    let top=Infinity,bottom=-Infinity;
    for(const p of collider.planes){
        const d=p.d-p.x*x-p.z*z;
        if(Math.abs(p.y)<1e-8){if(d<0)return -Infinity;continue;}
        if(p.y>0)top=Math.min(top,d/p.y);else bottom=Math.max(bottom,d/p.y);
    }
    return top>=bottom?top:-Infinity;
}
function caveRockTopAt(x,z,feetY,previousFeetY=feetY){
    if(window.CUSTOM_LEVEL||window.Housing?.inside)return -Infinity;
    let top=-Infinity;
    for(const collider of staticColliders){
        if(!collider.caveRock)continue;
        const surface=caveRockSurfaceY(collider,x,z);
        if(Number.isFinite(surface)&&(feetY>=surface-.12||(previousFeetY>=surface&&previousFeetY>=feetY)))top=Math.max(top,surface);
    }
    return top;
}
function staticColliderHits(collider,position,radius=.5,height=2.6){
    if(position.x<=collider.minX-radius||position.x>=collider.maxX+radius||position.z<=collider.minZ-radius||position.z>=collider.maxZ+radius)return false;
    if(!collider.planes)return true; // Existing house/dock rectangle behavior.
    if(position.y>=collider.maxY-.05||position.y+height<=collider.minY)return false;
    const surface=caveRockSurfaceY(collider,position.x,position.z);
    if(Number.isFinite(surface)&&position.y>=surface-.12)return false;
    const centerY=position.y+height/2;
    return collider.planes.every(p=>p.x*position.x+p.y*centerY+p.z*position.z-p.d<=radius*Math.hypot(p.x,p.z)+height/2*Math.abs(p.y));
}
function caveRockBlocksLine(start,end,collider){
    let enter=0,exit=1;
    for(const p of collider.planes){
        const a=p.x*start.x+p.y*(start.y+1.2)+p.z*start.z-p.d,b=p.x*end.x+p.y*(end.y+1.2)+p.z*end.z-p.d;
        if(a>0&&b>0)return false;if(a<=0&&b<=0)continue;
        const t=a/(a-b);if(a>0)enter=Math.max(enter,t);else exit=Math.min(exit,t);
        if(enter>exit)return false;
    }
    return true;
}

function cavePlatformRoute(){
    const route=[];
    // Each two-unit rise is below the normal 2.5-unit jump apex.
    for(let i=0;i<21;i++)route.push({x:-20+i*.5,y:(i+1)*2,z:i%2?-71:-67,halfX:2,halfZ:1.5});
    for(const [x,z] of [[-7,-72],[-4,-77],[-1,-82],[0,-87]])route.push({x,y:42,z,halfX:2,halfZ:1.5});
    route[route.length-1].halfX=4;route[route.length-1].halfZ=3;
    return route;
}
function createCavePlatforms(){
    const route=cavePlatformRoute();window.parkourPlatforms=route;
    const stone=new THREE.MeshStandardMaterial({color:0x858c94,roughness:1,flatShading:true});
    const underside=new THREE.MeshStandardMaterial({color:0x555e66,roughness:1,flatShading:true});
    for(const p of route){
        const slab=new THREE.Mesh(new THREE.BoxGeometry(p.halfX*2,.45,p.halfZ*2),stone);
        slab.name='caveJumpPlatform';slab.position.set(p.x,p.y-.225,p.z);scene.add(slab);
        const support=new THREE.Mesh(new THREE.ConeGeometry(1.4,1.1,5),underside);
        support.rotation.z=Math.PI;support.position.set(p.x,p.y-1,p.z);scene.add(support);
    }
}
function cavePlatformTopAt(x,z,feetY,previousFeetY=feetY){
    if(window.CUSTOM_LEVEL||window.Housing?.inside)return -Infinity;
    let top=-Infinity;
    for(const p of window.parkourPlatforms||[]){
        if(Math.abs(x-p.x)>p.halfX+.15||Math.abs(z-p.z)>p.halfZ+.15)continue;
        const crossingDown=previousFeetY>=p.y&&previousFeetY>=feetY;
        if((feetY>=p.y-.12||crossingDown)&&p.y>top)top=p.y;
    }
    return top;
}

function createWaterfallZone() {
    // Replaced BoxGeometry Walls with Organic Rock Clusters
    // Use a fixed seed for waterfall generation so it syncs for everyone
    const seed = xmur3('waterfall zone')();
    const rand = mulberry32(seed);

    // --- MOUNTAIN & CAVE GENERATION ---
    // Generate a mountain shape using stacked rocks
    const mountainRocks = [];

    // 1. Procedural Mountain Range (U-Shape)
    for (let i = 0; i < 150; i++) {
        // Fix: Angle Limit to generate "Behind" the waterfall (North side)
        // Waterfall is at -95. We want rocks at Z < -95 (Back) and sides.
        // 0 = Right, PI = Left. We want PI (Left) -> 2PI (Right)?
        // Wait, standard circle: 0 is Right (+X), PI is Left (-X).
        // Sin(Angle) maps to Z (+/-). Sin(0)=0, Sin(PI)=0. Sin(1.5PI)=-1 (Back).
        // So we want Angle from PI (Left) to 2PI (Right).
        const angle = Math.PI + rand() * Math.PI;

        const dist = 20 + rand() * 35; // Tighter fit

        // Elliptical shape to wrap around
        let x = Math.cos(angle) * dist;
        let z = -95 + Math.sin(angle) * dist * 0.9;

        // Height: Stack them up!
        let y = rand() * 55;

        // Flatten the "floor" outside the cave
        if (y < 5) y = -2;

        // Scale
        const s = 10 + rand() * 15;

        // CAVE OPENING LOGIC:
        // Clear channel in the middle for player to walk in
        // Center is X=0, Z=-95.
        // Entrance is from Z > -95 (Front).
        // So allow rocks IF they are far from X center OR High up.

        // CAVE OPENING LOGIC:
        // Keep a generous walkable corridor at the cave mouth so rocks don't block the entrance.
        const inCaveMouthCorridor = (Math.abs(x) < 22 && z > -120 && z < -78 && y < 30);
        if (inCaveMouthCorridor) continue;

        const rock = createRockMesh(s, rand);
        rock.position.set(x, y - 4, z);
        rock.rotation.set(rand() * 6, rand() * 6, rand() * 6);
        scene.add(rock);

        // CRITICAL: ADD COLLISION
        staticColliders.push(makeCaveRockCollider(rock));
    }

    // 2. Explicit Cave Roof / Archway
    // Bridge the gap at the front to make it look like a cave entrance
    for (let x = -15; x <= 15; x += 6) {
        const s = 10 + rand() * 5;
        const y = 25 + rand() * 5;
        const z = -95 + (rand() - 0.5) * 10;

        const rock = createRockMesh(s, rand);
        rock.position.set(x, y, z);
        scene.add(rock);
        staticColliders.push(makeCaveRockCollider(rock)); 
    }

    // --- WATERFALL ---
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128; // Higher res
    const ctx = canvas.getContext('2d');

    // Enhanced Water Texture
    ctx.fillStyle = '#00CED1'; // Deep Cyan
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < 100; i++) {
        // Streaks
        const x = rand() * 128;
        const y = rand() * 128;
        const w = 2 + rand() * 4;
        const h = 10 + rand() * 20;
        ctx.fillRect(x, y, w, h);
    }

    const waterTex = new THREE.CanvasTexture(canvas);
    waterTex.magFilter = THREE.NearestFilter;
    waterTex.minFilter = THREE.NearestFilter;
    waterTex.wrapS = THREE.RepeatWrapping;
    waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.repeat.set(2, 4);

    const waterMat = new THREE.MeshStandardMaterial({
        map: waterTex,
        color: 0x88ffff,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        roughness: 0.1,
        metalness: 0.1,
        emissive: 0x004444
    });

    waterfallMesh = new THREE.Mesh(new THREE.BoxGeometry(24, 45, 4), waterMat);
    waterfallMesh.position.set(0, 8, -95); // Lowered position slightly to match new height
    waterfallMesh.rotation.x = 0; // Vertical
    scene.add(waterfallMesh);

    // --- CAVE ---
    // Floor
    // Floor
    const caveFloor = new THREE.Mesh(new THREE.CircleGeometry(18, 32), new THREE.MeshStandardMaterial({
        color: 0x333333, // Lighter grey so it's not "black hole"
        roughness: 0.9
    }));
    caveFloor.rotation.x = -Math.PI / 2;
    caveFloor.position.set(0, 0.1, -95);
    scene.add(caveFloor);

    // Pool
    // Pool (The "Special Spot")
    const secretPool = new THREE.Mesh(new THREE.CircleGeometry(8, 32), new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x0044aa,
        roughness: 0.1
    }));
    secretPool.rotation.x = -Math.PI / 2;
    secretPool.position.set(0, 0.15, -95);
    scene.add(secretPool);

    // Ambient Cave Light
    const caveLight = new THREE.PointLight(0x00ffff, 1, 40);
    caveLight.position.set(0, 10, -95);
    scene.add(caveLight);

    // Old manual arch loop removed, handled by seeded procedural generation now

    addHotspotParticles(0, 1, -95);

    // Splash Particles (Simple)
    // We already have addHotspotParticles, maybe add more for splash?

    // A visible route with flat tops and jump-height spacing.
    createCavePlatforms();
}

// ---------------------------------------------------------------------------
// DEFAULT ISLAND REFRESH
// Shared-island dressing: paths, village props, pond details, shrines and
// readable routes to the cave, dock, ponds and Void rift.
// ---------------------------------------------------------------------------
function createPathRibbon(points, width, color, map = null, lift = 0.06) {
    const positions = [], uvs = [], indices = [];
    const sections = [];
    let travelled = 0;
    for (let p = 1; p < points.length; p++) {
        const a = points[p - 1], b = points[p];
        const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
        if (length < 0.01) continue;
        const nx = -dz / length, nz = dx / length;
        const steps = Math.max(1, Math.ceil(length / 2.4));
        for (let s = 0; s <= steps; s++) {
            const t = s / steps, x = a.x + dx * t, z = a.z + dz * t;
            const half = width / 2;
            sections.push({
                x, z, nx, nz,
                lx: x + nx * half, lz: z + nz * half,
                rx: x - nx * half, rz: z - nz * half,
                v: (travelled + length * t) / 8
            });
        }
        travelled += length;
    }
    if (sections.length < 2) return;
    for (const section of sections) {
        positions.push(section.lx, getTerrainHeight(section.lx, section.lz) + lift, section.lz);
        positions.push(section.rx, getTerrainHeight(section.rx, section.rz) + lift, section.rz);
        uvs.push(0, section.v, 1, section.v);
    }
    for (let i = 1; i < sections.length; i++) {
        const a = (i - 1) * 2, b = i * 2;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
        color, map, roughness: 1, metalness: 0, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'islandPath';
    mesh.receiveShadow = true;
    scene.add(mesh);
}

function makeDecorProp(type, x, z, rotation = 0, scale = 1) {
    if (!window.WorldGen?.makeProp) return null;
    const prop = WorldGen.makeProp({ type });
    prop.position.set(x, getTerrainHeight(x, z), z);
    prop.rotation.y = rotation;
    prop.scale.setScalar(scale);
    scene.add(prop);
    return prop;
}

function addPathLamp(x, z, lit = false) {
    const y = getTerrainHeight(x, z);
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.13, 2.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x4b3829, roughness: 1 })
    );
    pole.position.y = 1.25;
    group.add(pole);
    const lantern = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.34, 0),
        new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffa94e, emissiveIntensity: 1.15, roughness: 0.35 })
    );
    lantern.position.y = 2.68;
    group.add(lantern);
    const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 0.28, 4),
        new THREE.MeshStandardMaterial({ color: 0x4b3829, roughness: 1 })
    );
    cap.position.y = 3.02; cap.rotation.y = Math.PI / 4;
    group.add(cap);
    group.position.set(x, y, z);
    scene.add(group);
    if (lit) {
        const light = new THREE.PointLight(0xffbb66, 0.7, 16);
        light.position.set(x, y + 2.7, z);
        scene.add(light);
    }
    return group;
}

function addLilyPads(cx, cz, radius, count, color, seed) {
    const rand = mulberry32(seed);
    const geometry = new THREE.CircleGeometry(1, 10, 0.22, Math.PI * 1.8);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < count; i++) {
        const angle = rand() * Math.PI * 2, distance = Math.sqrt(rand()) * radius * 0.62;
        const pad = new THREE.Mesh(geometry, material);
        pad.rotation.x = -Math.PI / 2;
        pad.rotation.z = rand() * Math.PI * 2;
        pad.scale.setScalar(0.28 + rand() * 0.42);
        pad.position.set(cx + Math.cos(angle) * distance, 0.145, cz + Math.sin(angle) * distance);
        scene.add(pad);
    }
}

function addReedCluster(cx, cz, radius, count, seed) {
    const rand = mulberry32(seed);
    const stalkGeo = new THREE.CylinderGeometry(0.025, 0.04, 1.5, 4);
    const stalkMat = new THREE.MeshStandardMaterial({ color: 0x557a3c, roughness: 0.9 });
    const tipGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.24, 5);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x8b6b3c, roughness: 1 });
    const group = new THREE.Group();
    for (let i = 0; i < count; i++) {
        const angle = rand() * Math.PI * 2, distance = radius + (rand() - 0.5) * 1.6;
        const height = 0.8 + rand() * 0.75;
        const reed = new THREE.Group();
        const stalk = new THREE.Mesh(stalkGeo, stalkMat);
        stalk.scale.y = height / 1.5; stalk.position.y = height / 2;
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.y = height + 0.1;
        reed.add(stalk, tip);
        reed.position.set(cx + Math.cos(angle) * distance, 0.14, cz + Math.sin(angle) * distance);
        reed.rotation.z = (rand() - 0.5) * 0.16;
        group.add(reed);
    }
    scene.add(group);
}

function addPondGlow(cx, cz, radius, color, opacity = 0.22) {
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.91, radius * 1.03, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.14, cz);
    scene.add(ring);
}

function addDeadTree(x, z, scale = 1, seed = 1) {
    const rand = mulberry32(seed);
    const group = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: 0x3c332c, roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.28, 3.4, 6), bark);
    trunk.position.y = 1.7; group.add(trunk);
    for (let i = 0; i < 4; i++) {
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.1, 1.5, 5), bark);
        branch.position.set(0, 2.1 + i * 0.34, 0);
        branch.rotation.z = (i % 2 ? -1 : 1) * (0.65 + rand() * 0.45);
        branch.rotation.y = rand() * Math.PI * 2;
        branch.position.x = (i % 2 ? 1 : -1) * 0.42;
        group.add(branch);
    }
    group.position.set(x, getTerrainHeight(x, z), z);
    group.scale.setScalar(scale);
    scene.add(group);
}

function addCaveDecor() {
    addPathLamp(4.2, -45, false);
    addPathLamp(-4.2, -55, false);
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x77d8ff, emissive: 0x1d6b9c, emissiveIntensity: 0.9, roughness: 0.2 });
    const crystalGeo = new THREE.OctahedronGeometry(0.6, 0);
    [[6.5, -90], [-7, -88], [8, -99], [-6, -100]].forEach(([x, z], i) => {
        const crystal = new THREE.Mesh(crystalGeo, crystalMat);
        crystal.position.set(x, 0.65, z);
        crystal.scale.set(0.8, 1.8 + (i % 2) * 0.7, 0.8);
        crystal.rotation.z = (i - 1.5) * 0.18;
        scene.add(crystal);
    });
    const mushroomMat = new THREE.MeshStandardMaterial({ color: 0x8f74d8, emissive: 0x4a2e83, emissiveIntensity: 0.8, roughness: 0.6 });
    const mushroomGeo = new THREE.SphereGeometry(0.16, 8, 5);
    for (let i = 0; i < 8; i++) {
        const angle = i / 8 * Math.PI * 2;
        const cap = new THREE.Mesh(mushroomGeo, mushroomMat);
        cap.position.set(Math.cos(angle) * (10 + (i % 3)), 0.45, -95 + Math.sin(angle) * (10 + (i % 2)));
        scene.add(cap);
    }
}

function createVoidShrine(x, z) {
    const y = getTerrainHeight(x, z);
    const stone = new THREE.MeshStandardMaterial({ color: 0x4b4b5e, roughness: 0.95 });
    const darkStone = new THREE.MeshStandardMaterial({ color: 0x292b3d, roughness: 1 });
    const rune = new THREE.MeshBasicMaterial({ color: 0x9b6dff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 32), stone);
    floor.rotation.x = -Math.PI / 2; floor.position.set(x, y + 0.05, z); scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.1, 5.4, 32), rune);
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.13, z); scene.add(ring);
    for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 4.4, 0.85), darkStone);
        pillar.position.set(x + side * 4.1, y + 2.2, z); scene.add(pillar);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.35, 1.35), stone);
        cap.position.set(x + side * 4.1, y + 4.48, z); scene.add(cap);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(9.1, 0.7, 0.9), darkStone);
    lintel.position.set(x, y + 4.6, z); scene.add(lintel);
    for (let i = 0; i < 5; i++) {
        const shard = createRockMesh(0.35 + (i % 2) * 0.25);
        shard.position.set(x + Math.cos(i * 1.7) * 3.4, y + 2.2 + i * 0.55, z + Math.sin(i * 1.7) * 3.4);
        scene.add(shard);
    }
    const light = new THREE.PointLight(0x9b6dff, 1.1, 26);
    light.position.set(x, y + 4, z); scene.add(light);
    spawnPortal(x, z, false, true);
}

function createLavaShrine(x, z) {
    const y = getTerrainHeight(x, z);
    const stone = new THREE.MeshStandardMaterial({ color: 0x2c2421, roughness: 0.95 });
    const ember = new THREE.MeshBasicMaterial({ color: 0xff6b2c, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(5.2, 28), stone);
    floor.rotation.x = -Math.PI / 2; floor.position.set(x, y + 0.05, z); scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.2, 28), ember);
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.13, z); scene.add(ring);
    for (let i = 0; i < 6; i++) {
        const rock = createRockMesh(0.55 + (i % 3) * 0.22);
        const angle = i / 6 * Math.PI * 2;
        rock.position.set(x + Math.cos(angle) * 4.2, y + 0.2, z + Math.sin(angle) * 4.2);
        scene.add(rock);
    }
    const light = new THREE.PointLight(0xff6b2c, 0.8, 18);
    light.position.set(x, y + 2.2, z); scene.add(light);
}

function createDefaultIslandDecor() {
    const pathTex = createNoiseTexture(64, 64, '#b79766', '#8b6c48', 0.07, 771);
    pathTex.wrapS = pathTex.wrapT = THREE.RepeatWrapping;
    for (const path of DEFAULT_PATHS) {
        createPathRibbon(path.points, path.width + 0.8, 0x6c543a, null, 0.045);
        createPathRibbon(path.points, path.width, 0xffffff, pathTex, 0.075);
    }

    // A small stone spawn terrace.
    const terrace = new THREE.Mesh(
        new THREE.CircleGeometry(5.5, 32),
        new THREE.MeshStandardMaterial({ color: 0x9b927d, roughness: 1 })
    );
    terrace.rotation.x = -Math.PI / 2;
    terrace.position.set(27, 0.05, 0);
    scene.add(terrace);

    // Lake and pond character.
    addPondGlow(0, 0, 20, 0x9ceaff, 0.18);
    addLilyPads(0, 0, 20, 14, 0x47784d, 41);
    addReedCluster(0, 0, 21.5, 7, 43);
    addReedCluster(0, 0, 22.2, 5, 47);

    addPondGlow(-60, -30, 10, 0xa9f5ff, 0.36);
    addLilyPads(-60, -30, 10, 9, 0x6e9e66, 53);
    addReedCluster(-60, -30, 8.4, 5, 59);
    const lightPondLight = new THREE.PointLight(0x9ceaff, 0.5, 20);
    lightPondLight.position.set(-60, 2.4, -30); scene.add(lightPondLight);
    makeDecorProp('flowers', -48, -22, 0, 1.2);
    makeDecorProp('bush', -70, -18, 0, 1.1);

    addPondGlow(60, 50, 14, 0x7a5ca8, 0.28);
    addLilyPads(60, 50, 14, 6, 0x324d48, 67);
    addReedCluster(60, 50, 12.4, 5, 71);
    addDeadTree(74, 37, 0.9, 73);
    addDeadTree(48, 66, 0.72, 79);
    const darkPondLight = new THREE.PointLight(0x7555a8, 0.45, 22);
    darkPondLight.position.set(60, 2.2, 50); scene.add(darkPondLight);
    makeDecorProp('sign', 49, 44, -Math.PI / 4);

    // Path lanterns and village life.
    addPathLamp(23, 2, true);
    addPathLamp(-23, 2, false);
    addPathLamp(3.8, 33, false);
    addPathLamp(-3.8, 80, true);
    addPathLamp(-43, -18, false);
    addPathLamp(51, 48, false);
    addPathLamp(78, -56, false);
    addPathLamp(16, 20, false);
    for (const bench of DEFAULT_BENCHES) makeDecorProp('bench', bench.x, bench.z, bench.rot);
    makeDecorProp('barrel', 28, -4, 0, 1.15);
    makeDecorProp('crate', 31, -6, 0.3, 1.05);
    makeDecorProp('barrel', -29, 7, 0, 1.05);
    makeDecorProp('sign', 20, 5, -Math.PI * 0.18);
    makeDecorProp('bush', -49, 18, 0, 1.1);
    makeDecorProp('flowers', -45, 20, Math.PI * 0.4, 1.2);
    makeDecorProp('flowers', -53, 4, -Math.PI * 0.3, 1.1);
    makeDecorProp('barrel', 4, 92, 0, 1.15);
    makeDecorProp('crate', -4, 96, -0.2, 1.05);
    addPathLamp(5, 92, false);

    addCaveDecor();
    createLavaShrine(16, 16);
    createVoidShrine(86, -58);
}

function addHotspotParticles(x, y, z) {
    const geo = new THREE.BufferGeometry();
    const pos = [];
    for (let i = 0; i < 10; i++) pos.push(x + (Math.random() - 0.5) * 5, y + Math.random() * 2, z + (Math.random() - 0.5) * 5);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffff00, size: 0.5 });
    const parts = new THREE.Points(geo, mat);
    scene.add(parts);
}

const LIGHT_SUN_DAY = new THREE.Color(0xfff2d8);
const LIGHT_SUN_GOLD = new THREE.Color(0xffb067);
const LIGHT_MOON = new THREE.Color(0x9bb8ff);
const LIGHT_FILL_DAY = new THREE.Color(0xb7dcff);
const LIGHT_FILL_NIGHT = new THREE.Color(0x788de8);
const LIGHT_HEMI_DAY_SKY = new THREE.Color(0xfff0cf);
const LIGHT_HEMI_DAY_GROUND = new THREE.Color(0x2a3138);
const LIGHT_HEMI_NIGHT_SKY = new THREE.Color(0x273a6e);
const LIGHT_HEMI_NIGHT_GROUND = new THREE.Color(0x080b16);
const _lightSun = new THREE.Color();
const _lightHemiSky = new THREE.Color();
const _lightHemiGround = new THREE.Color();
const _lightFill = new THREE.Color();

function applyWorldLights(sunColor, sunIntensity, hemiSky, hemiGround, hemiIntensity, fillColor, fillIntensity) {
    if (sunLight) {
        sunLight.color.copy(sunColor);
        sunLight.intensity = sunIntensity;
    }
    if (hemiLight) {
        hemiLight.color.copy(hemiSky);
        hemiLight.groundColor.copy(hemiGround);
        hemiLight.intensity = hemiIntensity;
    }
    if (fillLight) {
        fillLight.color.copy(fillColor);
        fillLight.intensity = fillIntensity;
    }
}

function updateDayNightCycle(dt) {
    if(window.Housing && Housing.inside)return;

    // Always run local time simulation for smooth movement
    if (typeof DAY_DURATION !== 'undefined') {
        worldTime += (dt / DAY_DURATION) * 24;
        if (worldTime >= 24) worldTime -= 24;
    }

    // --- LAVA WORLD OVERRIDE ---
    if (isInLavaWorld) {
        _optColor1.setHex(0x220000);
        scene.background = _optColor1;
        scene.fog.color = _optColor1;
        _lightSun.setHex(0xffa04a);
        _lightHemiSky.setHex(0x5a1c0a);
        _lightHemiGround.setHex(0x160000);
        _lightFill.setHex(0xff5a28);
        applyWorldLights(_lightSun, 1.2, _lightHemiSky, _lightHemiGround, 0.34, _lightFill, 0.28);
        return; // Skip standard day/night cycle
    }

    // --- VOID OVERRIDE ---
    if (isInVoid) {
        _optColor1.setHex(0x000000);
        scene.background = _optColor1;
        scene.fog.color = _optColor1;
        _lightSun.setHex(0x8aa5ff);
        _lightHemiSky.setHex(0x101a3a);
        _lightHemiGround.setHex(0x000000);
        _lightFill.setHex(0x9a76ff);
        applyWorldLights(_lightSun, 0.52, _lightHemiSky, _lightHemiGround, 0.26, _lightFill, 0.18);
        return;
    }

    // --- STANDARD WORLD CYCLE ---
    // Start with comfortable midday values, then blend through dawn/dusk.
    let sunIntensity = 1.05;
    let hemiIntensity = 0.44;
    let fillIntensity = 0.23;
    _lightSun.copy(LIGHT_SUN_DAY);
    _lightHemiSky.copy(LIGHT_HEMI_DAY_SKY);
    _lightHemiGround.copy(LIGHT_HEMI_DAY_GROUND);
    _lightFill.copy(LIGHT_FILL_DAY);

    if (worldTime >= 6 && worldTime < 18) {
        // Sunrise (6am - 7am)
        if (worldTime < 7) {
            const t = worldTime - 6;
            _optColor1.copy(NIGHT_COLOR).lerp(DAY_COLOR, t);
            sunIntensity = 0.32 + t * 0.73;
            hemiIntensity = 0.22 + t * 0.22;
            fillIntensity = 0.10 + t * 0.13;
            _lightSun.copy(LIGHT_SUN_GOLD).lerp(LIGHT_SUN_DAY, t);
            _lightHemiSky.copy(LIGHT_HEMI_NIGHT_SKY).lerp(LIGHT_HEMI_DAY_SKY, t);
            _lightHemiGround.copy(LIGHT_HEMI_NIGHT_GROUND).lerp(LIGHT_HEMI_DAY_GROUND, t);
            _lightFill.copy(LIGHT_FILL_NIGHT).lerp(LIGHT_FILL_DAY, t);
        }
        // Sunset (5pm - 6pm)
        else if (worldTime > 17) {
            const t = worldTime - 17;
            _optColor1.copy(DAY_COLOR).lerp(SUNSET_COLOR, t);
            sunIntensity = 1.05 - t * 0.5;
            hemiIntensity = 0.44 - t * 0.22;
            fillIntensity = 0.23 - t * 0.13;
            _lightSun.copy(LIGHT_SUN_DAY).lerp(LIGHT_SUN_GOLD, Math.min(1, t * 1.4));
            _lightHemiSky.copy(LIGHT_HEMI_DAY_SKY).lerp(LIGHT_HEMI_NIGHT_SKY, t);
            _lightHemiGround.copy(LIGHT_HEMI_DAY_GROUND).lerp(LIGHT_HEMI_NIGHT_GROUND, t);
            _lightFill.copy(LIGHT_FILL_DAY).lerp(LIGHT_FILL_NIGHT, t);
        }
        // Middle of Day
        else {
            _optColor1.copy(DAY_COLOR);
        }
    } else {
        // Dusk (6pm - 7pm) fades the last warm light into moonlight.
        if (worldTime >= 18 && worldTime < 19) {
            const t = worldTime - 18;
            _optColor1.copy(SUNSET_COLOR).lerp(NIGHT_COLOR, t);
            sunIntensity = 0.55 - t * 0.23;
            hemiIntensity = 0.22;
            fillIntensity = 0.10;
            _lightSun.copy(LIGHT_SUN_GOLD).lerp(LIGHT_MOON, t);
            _lightHemiSky.copy(LIGHT_HEMI_NIGHT_SKY);
            _lightHemiGround.copy(LIGHT_HEMI_NIGHT_GROUND);
            _lightFill.copy(LIGHT_FILL_NIGHT);
        }
        // Middle of Night
        else {
            _optColor1.copy(NIGHT_COLOR);
            sunIntensity = 0.32;
            hemiIntensity = 0.22;
            fillIntensity = 0.10;
            _lightSun.copy(LIGHT_MOON);
            _lightHemiSky.copy(LIGHT_HEMI_NIGHT_SKY);
            _lightHemiGround.copy(LIGHT_HEMI_NIGHT_GROUND);
            _lightFill.copy(LIGHT_FILL_NIGHT);
        }
    }

    // Rain keeps the world readable while still feeling overcast.
    if (isRaining) {
        _optColor1.lerp(_rainColor, 0.9);
        sunIntensity *= 0.58;
        hemiIntensity *= 0.78;
        fillIntensity *= 0.68;
    }

    // Apply Visuals
    scene.background = _optColor1;
    scene.fog.color = _optColor1;

    // Move Sun/Moon
    // The orbit is centred on the camera's ground position so the sun/moon rise
    // and set the same way no matter how far the player sails from the origin.
    const angle = ((worldTime - 6) / 24) * Math.PI * 2;
    const radius = (typeof SKY_ORBIT_RADIUS === 'number') ? SKY_ORBIT_RADIUS : 900;
    const skyAnchorX = camera ? camera.position.x : 0;
    const skyAnchorZ = camera ? camera.position.z : 0;

    if (sunMesh) {
        sunMesh.position.x = skyAnchorX + Math.cos(angle) * radius;
        sunMesh.position.y = Math.sin(angle) * radius;
        sunMesh.position.z = skyAnchorZ;
    }
    if (moonMesh) {
        moonMesh.position.x = skyAnchorX + Math.cos(angle + Math.PI) * radius;
        moonMesh.position.y = Math.sin(angle + Math.PI) * radius;
        moonMesh.position.z = skyAnchorZ;
    }
    // Keep the star dome centred on the camera each frame.
    if (window.starSystem) {
        window.starSystem.position.set(skyAnchorX, 0, skyAnchorZ);
    }

    // Update Light. The main light follows the sun by day and the moon at night.
    if (sunLight) {
        if (worldTime > 6 && worldTime < 18) {
            if (sunMesh) sunLight.position.copy(sunMesh.position);
            sunLight.color.copy(_lightSun);
            sunLight.intensity = sunIntensity;
        } else {
            if (moonMesh) sunLight.position.copy(moonMesh.position);
            sunLight.color.copy(_lightSun);
            sunLight.intensity = sunIntensity;
        }
    }
    if (hemiLight) {
        hemiLight.color.copy(_lightHemiSky);
        hemiLight.groundColor.copy(_lightHemiGround);
        hemiLight.intensity = hemiIntensity;
    }
    if (fillLight) {
        fillLight.color.copy(_lightFill);
        fillLight.intensity = fillIntensity;
    }

    // Stars visibility (fade in at night)
    if (window.starSystem) {
        const isNight = worldTime < 5 || worldTime > 19;
        const targetOpacity = isNight ? 1.0 : 0.0;
        window.starSystem.material.opacity += (targetOpacity - window.starSystem.material.opacity) * 0.05;
    }

    // Clouds visibility and movement (visible during day)
    if (window.cloudSprites) {
        const isDay = worldTime > 6 && worldTime < 18;
        window.cloudSprites.forEach(cloud => {
            const targetOpacity = isDay ? 0.7 : 0.0;
            cloud.material.opacity += (targetOpacity - cloud.material.opacity) * 0.03;
            // Move clouds slowly
            cloud.position.x += cloud.userData.speed * 0.02;
            if (cloud.position.x > 200) cloud.position.x = -200;
        });
    }
}

function createRainSystem() {
    const rainCount = 1600;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(rainCount * 6);
    const drops = [];

    const writeDrop = (index, drop) => {
        const o = index * 6;
        // A streak leans slightly with the wind: top is offset from the foot.
        positions[o] = drop.x - drop.length * 0.09;
        positions[o + 1] = drop.y + drop.length;
        positions[o + 2] = drop.z - drop.length * 0.025;
        positions[o + 3] = drop.x;
        positions[o + 4] = drop.y;
        positions[o + 5] = drop.z;
    };

    for (let i = 0; i < rainCount; i++) {
        const drop = {
            x: (Math.random() - 0.5) * 94,
            y: Math.random() * 46,
            z: (Math.random() - 0.5) * 94,
            length: 0.8 + Math.random() * 1.5,
            speed: 18 + Math.random() * 17
        };
        drops.push(drop);
        writeDrop(i, drop);
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.userData = { drops, writeDrop };

    const material = new THREE.LineBasicMaterial({
        color: 0xcfe8ff,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    rainSystem = new THREE.LineSegments(geom, material);
    rainSystem.frustumCulled = false; // follows the player each frame
    rainSystem.visible = false; // Start off
    scene.add(rainSystem);
}

// --- RETRO POST-PROCESSING ---
// The scene is rendered into a small nearest-neighbour target, then a
// full-screen pass restores it with a gentle colour grade and vignette. The
// low-resolution target supplies the chunky pixel look without changing the
// canvas size, so DOM overlays, screen punching and input stay untouched.
let retroPipeline = null;
const RETRO_PIXEL_SIZES = [2, 3, 4];

function retroPixelSize() {
    const size = Number(saveState.retroPixelSize);
    return RETRO_PIXEL_SIZES.includes(size) ? size : 3;
}

function createRetroPipeline() {
    const target = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: true,
        stencilBuffer: false
    });
    target.texture.generateMipmaps = false;

    const material = new THREE.ShaderMaterial({
        uniforms: {
            tDiffuse: { value: target.texture },
            uResolution: { value: new THREE.Vector2(1, 1) },
            uTime: { value: 0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform vec2 uResolution;
            uniform float uTime;
            varying vec2 vUv;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            void main() {
                vec4 texel = texture2D(tDiffuse, vUv);
                vec3 color = texel.rgb;

                // Richer but still natural: a little contrast and saturation,
                // then warm highlights and cool shadows.
                color = (color - 0.5) * 1.05 + 0.5;
                float luma = dot(color, vec3(0.299, 0.587, 0.114));
                color = mix(vec3(luma), color, 1.13);
                color.r += 0.014 * smoothstep(0.55, 1.0, luma);
                color.b += 0.011 * (1.0 - smoothstep(0.35, 0.85, luma));

                // Soft vignette keeps focus in the middle of the screen.
                vec2 p = vUv - 0.5;
                float vignette = 1.0 - smoothstep(0.28, 0.78, length(p));
                color *= mix(0.87, 1.0, vignette);

                // Very light animated grain, hidden wherever the punch pass
                // made the canvas transparent for an embedded video screen.
                float grain = hash(floor(vUv * uResolution) + floor(uTime * 12.0)) - 0.5;
                color += grain * 0.028 * texel.a;

                gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
            }
        `,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        blending: THREE.NoBlending
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    retroPipeline = {
        target, material, quadScene, quadCamera,
        width: 1, height: 1
    };
    resizeRetroPipeline();
    return retroPipeline;
}

function ensureRetroPipeline() {
    return retroPipeline || createRetroPipeline();
}

function resizeRetroPipeline() {
    if (!retroPipeline || !renderer) return;
    const scale = retroPixelSize();
    const width = Math.max(1, Math.floor(window.innerWidth / scale));
    const height = Math.max(1, Math.floor(window.innerHeight / scale));
    if (retroPipeline.width === width && retroPipeline.height === height) return;
    retroPipeline.target.setSize(width, height);
    retroPipeline.material.uniforms.uResolution.value.set(width, height);
    retroPipeline.width = width;
    retroPipeline.height = height;
}

function renderGameView(viewScene, viewCamera) {
    if (!saveState.retroShader) {
        renderer.setRenderTarget(null);
        renderer.render(viewScene, viewCamera);
        if (typeof GamePerformance !== 'undefined') GamePerformance.captureRender(renderer.info);
        if (window.punchScreens) { try { window.punchScreens(); } catch (e) { } }
        return;
    }

    const pipeline = ensureRetroPipeline();
    resizeRetroPipeline();
    renderer.setRenderTarget(pipeline.target);
    try {
        renderer.render(viewScene, viewCamera);
        // Count the world draw, not the single full-screen copy that follows.
        if (typeof GamePerformance !== 'undefined') GamePerformance.captureRender(renderer.info);
        // Punch the video quads while the scene depth buffer is still attached
        // to this render target, then upscale the finished pixels to the canvas.
        if (window.punchScreens) { try { window.punchScreens(); } catch (e) { } }
        renderer.setRenderTarget(null);
        pipeline.material.uniforms.uTime.value = performance.now() * 0.001;
        renderer.render(pipeline.quadScene, pipeline.quadCamera);
    } finally {
        renderer.setRenderTarget(null);
    }
}

// --- THREE.JS SCENE SETUP ---
function setupThreeJS() {
    scene = new THREE.Scene();
    // Warm/Cozy Initial Background
    scene.background = new THREE.Color(0x9FD9FF);
    // Fog fades distant islands in gently rather than hiding them, so the open
    // ocean still reads as vast without the horizon popping into view.
    scene.fog = new THREE.Fog(0x9FD9FF, 60, 520);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);

    // KEEP antialias: false for pixel art style
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });

    // Filmic response keeps bright skies and warm lights from clipping while
    // retaining detail in shaded grass, wood and characters.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    // --- SHADOW MAP ENABLED ---
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

    // --- PIXEL RATIO FIX ---
    renderer.setPixelRatio(saveState.renderScale===0?(window.devicePixelRatio||1):(saveState.renderScale===undefined?(window.devicePixelRatio||1):saveState.renderScale));
    // -----------------------

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    document.getElementById('game-container').appendChild(renderer.domElement);

    // The WebGL canvas sits ABOVE the CSS3D video overlay (z-index 2 in
    // props.js). Screens punch themselves out of the canvas alpha in
    // punchScreens(), so the world renders in front of the video correctly.
    // Pointer events stay off the canvas: all input is handled on `document`
    // and this is what lets clicks reach a Twitch iframe underneath.
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '3';
    renderer.domElement.style.pointerEvents = 'none';
    // The canvas no longer receives the right-click that used to suppress the
    // browser menu, so keep it off the game area at the container level.
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) gameContainer.addEventListener('contextmenu', (e) => e.preventDefault());

    // CSS3D overlay for the YouTube Screen prop (defined in props.js).
    if (window.initCssScene) window.initCssScene();

    // Warm sky bounce, cool ground bounce. Stronger than the old flat ambient
    // term so shaded parts keep their shape instead of turning muddy.
    hemiLight = new THREE.HemisphereLight(0xFFF0CF, 0x2A3138, 0.44);
    hemiLight.name = 'hemiLight';
    scene.add(hemiLight);

    // The Sun Light (Shadow caster)
    sunLight = new THREE.DirectionalLight(0xFFF2D8, 1.05);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;

    // Configure Shadow Properties
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    const d = window.CUSTOM_LEVEL ? Math.min(600, window.CUSTOM_LEVEL.size * 0.6 + 40) : 150; // Cover the island / custom level
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.bias = -0.0005; // Reduce artifacts
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    // Cool counter-light from the opposite side. It has no shadow map, so it
    // adds shape to shaded sides and characters for very little cost.
    fillLight = new THREE.DirectionalLight(0xB7DCFF, 0.23);
    fillLight.name = 'fillLight';
    fillLight.position.set(-60, 45, -40);
    fillLight.castShadow = false;
    scene.add(fillLight);

    // Sun Sprite (Billboard - always faces camera)
    const sunCanvas = document.createElement('canvas');
    sunCanvas.width = 128; sunCanvas.height = 128;
    const sunCtx = sunCanvas.getContext('2d');
    const sunGradient = sunCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    sunGradient.addColorStop(0, 'rgba(255, 240, 200, 1)'); // Softer Center
    sunGradient.addColorStop(0.3, 'rgba(255, 200, 100, 1)');
    sunGradient.addColorStop(0.7, 'rgba(255, 160, 80, 0.6)'); // Warmer Orange
    sunGradient.addColorStop(1, 'rgba(255, 140, 0, 0)');
    sunCtx.fillStyle = sunGradient;
    sunCtx.fillRect(0, 0, 128, 128);
    const sunTexture = new THREE.CanvasTexture(sunCanvas);
    const sunSpriteMat = new THREE.SpriteMaterial({ map: sunTexture, transparent: true, fog: false });
    sunMesh = new THREE.Sprite(sunSpriteMat);
    sunMesh.scale.set(100, 100, 1); // Large sun for far orbit
    scene.add(sunMesh);

    // Moon Sprite (Billboard - always faces camera)
    const moonCanvas = document.createElement('canvas');
    moonCanvas.width = 128; moonCanvas.height = 128;
    const moonCtx = moonCanvas.getContext('2d');
    const moonGradient = moonCtx.createRadialGradient(64, 64, 0, 64, 64, 60);
    moonGradient.addColorStop(0, 'rgba(240, 240, 255, 1)');
    moonGradient.addColorStop(0.5, 'rgba(200, 200, 220, 1)');
    moonGradient.addColorStop(0.8, 'rgba(150, 150, 180, 0.5)');
    moonGradient.addColorStop(1, 'rgba(100, 100, 150, 0)');
    moonCtx.fillStyle = moonGradient;
    moonCtx.fillRect(0, 0, 128, 128);
    const moonTexture = new THREE.CanvasTexture(moonCanvas);
    const moonSpriteMat = new THREE.SpriteMaterial({ map: moonTexture, transparent: true, fog: false });
    moonMesh = new THREE.Sprite(moonSpriteMat);
    moonMesh.scale.set(80, 80, 1); // Large moon for far orbit
    scene.add(moonMesh);

    // Stars System (visible at night).
    // The dome is a shell centred on the *camera* (see the sky update in the
    // day/night tick), so it surrounds the player everywhere in the world —
    // including out in the open ocean. STAR_RADIUS sits inside the camera's far
    // plane so the stars never clip.
    const starCount = 500;
    const starGeom = new THREE.BufferGeometry();
    const starPositions = [];
    for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.4 + 0.1; // Upper hemisphere only
        const r = STAR_RADIUS + Math.random() * 120;
        starPositions.push(Math.sin(phi) * Math.cos(theta) * r);
        starPositions.push(Math.cos(phi) * r);
        starPositions.push(Math.sin(phi) * Math.sin(theta) * r);
    }
    starGeom.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, transparent: true, opacity: 0, fog: false });
    window.starSystem = new THREE.Points(starGeom, starMat);
    window.starSystem.frustumCulled = false; // dome moves with the camera
    scene.add(window.starSystem);

    // Clouds System (visible during day)
    window.cloudSprites = [];
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 256; cloudCanvas.height = 128;
    const cloudCtx = cloudCanvas.getContext('2d');
    cloudCtx.fillStyle = 'rgba(255, 255, 255, 0)';
    cloudCtx.fillRect(0, 0, 256, 128);
    // Draw fluffy cloud shape
    cloudCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    cloudCtx.beginPath();
    cloudCtx.ellipse(80, 70, 50, 35, 0, 0, Math.PI * 2);
    cloudCtx.ellipse(130, 60, 60, 40, 0, 0, Math.PI * 2);
    cloudCtx.ellipse(180, 70, 45, 30, 0, 0, Math.PI * 2);
    cloudCtx.ellipse(105, 50, 35, 25, 0, 0, Math.PI * 2);
    cloudCtx.ellipse(155, 45, 40, 28, 0, 0, Math.PI * 2);
    cloudCtx.fill();
    const cloudTexture = new THREE.CanvasTexture(cloudCanvas);

    for (let i = 0; i < 8; i++) {
        const cloudMat = new THREE.SpriteMaterial({ map: cloudTexture, transparent: true, opacity: 0.7, fog: false });
        const cloud = new THREE.Sprite(cloudMat);
        cloud.scale.set(40 + Math.random() * 30, 20 + Math.random() * 15, 1);
        cloud.position.set(
            (Math.random() - 0.5) * 300,
            60 + Math.random() * 30,
            (Math.random() - 0.5) * 300
        );
        cloud.userData.speed = 0.5 + Math.random() * 0.5;
        scene.add(cloud);
        window.cloudSprites.push(cloud);
    }

    // --- CUSTOM LEVEL MODE ---
    // A saved level replaces the whole procedural island: a single ocean, the
    // painted terrain, and the trees / rocks / NPCs placed in the editor.
    if (window.CUSTOM_LEVEL && window.WorldGen) {
        window.pondCollider = null;
        window.darkPondCollider = null;
        window.dockCollider = null;
        window.customWorld = WorldGen.buildCustomWorld(scene, window.CUSTOM_LEVEL);
        window.Ocean?.extendWater(window.customWorld.water);
        // Build the authored props / flowers first; generateWorld() resets the
        // shared tree + collider arrays, so the generated ocean islands (below)
        // must be added *after* it or their trees would be wiped.
        generateWorld("custom-level");
        // Generated islands in the ocean beyond the authored map, so sailing
        // off the edge of a custom level still leads somewhere.
        if (window.Ocean && typeof window.Ocean.layoutAround === 'function') {
            const level=window.CUSTOM_LEVEL;
            const around=window.Ocean.layoutAround(level.size,level.seaLevel,level.oceanFloor,level);
            window.customOcean=around;
            const flowerStart=pickableFlowers.length;
            const built=window.Ocean.build(scene,{layout:around,name:'customOceanIslands',decorate:true});
            window.oceanWorld={trees:built.trees,colliders:built.colliders,flowers:pickableFlowers.slice(flowerStart),custom:true};
            treeMeshes.push(...built.trees);treeColliders.push(...built.colliders);
        }
        createNPCs();
        createLocalPlayer();
        createRainSystem();
    } else {

    // Create HIGH QUALITY Grass Texture (Warmer/Vibrant Green)
    const grassTex = createNoiseTexture(256, 256, '#D0DCC8', '#B4C3AC', 0.05, Math.random() * 100);
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(8, 8);

    // Generate Uneven Terrain
    const terrainGeo = new THREE.PlaneGeometry(ISLAND_RADIUS * 2, ISLAND_RADIUS * 2, 128, 128);
    terrainGeo.rotateX(-Math.PI / 2); // Rotate to be flat (Y-up)

    const posAttr = terrainGeo.attributes.position;
    const BEACH_WIDTH = 20; // Width of sandy beach area
    const EDGE_FALLOFF = 12; // Distance from edge where slope to water begins

    // Create vertex colors for a softer, more varied island palette.
    const colors = new Float32Array(posAttr.count * 3);
    const grassDark = new THREE.Color('#4F7351');
    const grassMid = new THREE.Color('#6E9568');
    const grassLight = new THREE.Color('#8EAC72');
    const meadow = new THREE.Color('#A9BB7A');
    const rockColor = new THREE.Color('#7D8178');
    const darkMoss = new THREE.Color('#3F5A4A');
    const lightMoss = new THREE.Color('#8DBB85');
    const shrineStone = new THREE.Color('#5E5B72');
    const sandColor = new THREE.Color('#E8CD82');

    for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const distFromCenter = Math.sqrt(x * x + z * z);
        const distLightPond = Math.sqrt((x + 60) ** 2 + (z + 30) ** 2);
        const distDarkPond = Math.sqrt((x - 60) ** 2 + (z - 50) ** 2);
        const distVoidShrine = Math.sqrt((x - 86) ** 2 + (z + 58) ** 2);

        // Use getTerrainHeight directly - it already has edge falloff built in
        const height = getTerrainHeight(x, z);
        posAttr.setY(i, height);

        let color = grassMid.clone();
        const variation = Math.sin(x * 0.11 + z * 0.07) * Math.cos(z * 0.13 - x * 0.04);
        color.lerp(variation > 0 ? grassLight : grassDark, Math.min(0.65, Math.abs(variation) * 0.55));
        if (height < 0.7) color.lerp(meadow, 0.16);
        if (height > 5) color.lerp(rockColor, Math.min(0.58, (height - 5) / 16));
        if (z < -58 && Math.abs(x) < 46 && height > 2) color.lerp(rockColor, 0.24);
        if (distLightPond < 24) color.lerp(lightMoss, (1 - distLightPond / 24) * 0.38);
        if (distDarkPond < 34) color.lerp(darkMoss, (1 - distDarkPond / 34) * 0.48);
        if (distVoidShrine < 20) color.lerp(shrineStone, (1 - distVoidShrine / 20) * 0.62);

        if (distFromCenter > ISLAND_RADIUS - EDGE_FALLOFF) {
            color.copy(sandColor);
        } else if (distFromCenter > ISLAND_RADIUS - BEACH_WIDTH) {
            const beachProgress = (distFromCenter - (ISLAND_RADIUS - BEACH_WIDTH)) / (BEACH_WIDTH - EDGE_FALLOFF);
            color.lerp(sandColor, Math.min(1, Math.max(0, beachProgress)));
        }
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    // Add vertex colors to geometry
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    // Create material with vertex colors
    const isl = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({
        map: grassTex,
        vertexColors: true, // Enable vertex color blending
        roughness: 0.9
    }));
    isl.receiveShadow = true;
    isl.castShadow = true;
    scene.add(isl);

    // (Island base cylinder removed - terrain now ends at water level)

    // Create HIGH QUALITY Water Texture (Cozy Teal/Turquoise)
    const waterTex = createNoiseTexture(128, 128, '#40E0D0', '#00CED1', 0.03, Math.random() * 100);
    waterTex.wrapS = THREE.RepeatWrapping;
    waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.repeat.set(6, 6);

    const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE_RADIUS, 64), new THREE.MeshStandardMaterial({
        map: waterTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        roughness: 0.2,
        metalness: 0.1
    }));
    lake.receiveShadow = true; // Water receives shadows now
    lake.rotation.x = -Math.PI / 2; lake.position.y = 0.1; scene.add(lake);

    // --- SURROUNDING OCEAN ---
    const oceanTex = createNoiseTexture(256, 256, '#1a4a6e', '#0d3347', 0.02, 42);
    oceanTex.wrapS = THREE.RepeatWrapping;
    oceanTex.wrapT = THREE.RepeatWrapping;
    // Repeat scales with the plane so the texture doesn't stretch over the
    // much larger open ocean.
    const oceanSize = (typeof WORLD_RADIUS === 'number' ? WORLD_RADIUS : 1000) * 2;
    oceanTex.repeat.set(Math.max(20, oceanSize / 30), Math.max(20, oceanSize / 30));

    const oceanGeo = new THREE.PlaneGeometry(oceanSize, oceanSize);
    const oceanMat = new THREE.MeshStandardMaterial({
        map: oceanTex,
        color: 0x6699cc,
        transparent: true,
        opacity: 0.9,
        roughness: 0.3,
        metalness: 0.2
    });
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = (typeof OCEAN_LEVEL === 'number' ? OCEAN_LEVEL : -3); // Ocean surface
    scene.add(ocean);
    window.Ocean?.extendWater(ocean);

    // --- SMALL POND (Near Cabin) ---
    const pondTex = createNoiseTexture(64, 64, '#3a9a9a', '#2a7a7a', 0.04, 77);
    const pondRadius = 10;
    const pondX = -60;
    const pondZ = -30;
    const pondMesh = new THREE.Mesh(new THREE.CircleGeometry(pondRadius, 32), new THREE.MeshStandardMaterial({
        map: pondTex,
        color: 0xaaddee,
        transparent: true,
        opacity: 0.9,
        roughness: 0.2
    }));
    pondMesh.rotation.x = -Math.PI / 2;
    pondMesh.position.set(pondX, 0.12, pondZ);
    pondMesh.receiveShadow = true;
    scene.add(pondMesh);

    // Store pond data for collision and fishing
    window.pondCollider = { x: pondX, z: pondZ, radius: pondRadius };
    // --- RIVER (From waterfall toward east) ---
    // River defined as a series of connected segments.
    // NOTE: Use overlapping discs along the spline instead of wide planes.
    // This removes the visible rectangular “patch” artifacts seen in the video.
    // --- DARK POND (South-East) ---
    const darkPondTex = createNoiseTexture(64, 64, '#1a2a3a', '#0a1a2a', 0.04, 99);
    const dpRadius = 14;
    const dpX = 60, dpZ = 50;
    const dpMesh = new THREE.Mesh(new THREE.CircleGeometry(dpRadius, 32), new THREE.MeshStandardMaterial({
        map: darkPondTex,
        color: 0x446688,
        transparent: true,
        opacity: 0.9,
        roughness: 0.1
    }));
    dpMesh.rotation.x = -Math.PI / 2;
    dpMesh.position.set(dpX, 0.12, dpZ);
    dpMesh.receiveShadow = true;
    scene.add(dpMesh);
    // Add to window for collision logic (global like pondCollider)
    window.darkPondCollider = { x: dpX, z: dpZ, radius: dpRadius };

    // --- OCEAN DOCK (South) ---
    // Wooden dock extending into the ocean at ground level
    const dockGeo = new THREE.BoxGeometry(8, 0.3, 80); // Thin, long dock
    const dockMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
    const dock = new THREE.Mesh(dockGeo, dockMat);
    const dockY = 0.3; // Just above ground to prevent z-fighting
    dock.position.set(0, dockY, 125); // Center at Z=125, extends Z=85 to Z=165
    dock.castShadow = true; dock.receiveShadow = true;
    scene.add(dock);

    // Dock Posts (Pilings)
    const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e });
    for (let dz = -35; dz <= 35; dz += 10) {
        const p1 = new THREE.Mesh(postGeo, postMat);
        p1.position.set(-3.5, -2.5, 125 + dz);
        scene.add(p1);
        const p2 = new THREE.Mesh(postGeo, postMat);
        p2.position.set(3.5, -2.5, 125 + dz);
        scene.add(p2);
    }

    // Store dock bounds for collision reference
    window.dockCollider = { minX: -6, maxX: 6, minZ: 85, maxZ: 170, y: 0.3 };

    // Dock barriers (invisible walls to prevent falling off)
    // End barrier
    staticColliders.push({ minX: -5, maxX: 5, minZ: 164, maxZ: 166 });
    // Left side barrier (from terrain edge to dock end)
    staticColliders.push({ minX: -5.5, maxX: -4.5, minZ: 100, maxZ: 165 });
    // Right side barrier
    staticColliders.push({ minX: 4.5, maxX: 5.5, minZ: 100, maxZ: 165 });

    generateWorld("lobby-world");

    // --- GENERATED OCEAN ISLANDS ---
    // A deterministic archipelago the player can sail out to. Built *after*
    // generateWorld so the pickable flowers ocean.js plants survive its reset of
    // the shared tree/flower arrays. Colliders merge in so trees are solid too.
    if (window.Ocean && typeof window.Ocean.build === 'function') {
        const built = window.Ocean.build(scene, { decorate: true });
        window.oceanIslands = built.islands;
        // Keep a handle on the generated trees + colliders so generateWorld can
        // re-register them if the procedural island is re-rolled (join/leave).
        window.oceanWorld = { trees: built.trees || [], colliders: built.colliders || [] };
        if (built.trees) built.trees.forEach(t => treeMeshes.push(t));
        if (built.colliders) built.colliders.forEach(c => treeColliders.push(c));
    }

    createCabin();

    createNPCs(); createLocalPlayer();
    createWaterfallZone();
    createDefaultIslandDecor();
    createRainSystem();

    } // end procedural island / custom-level branch

    // Both special worlds are available on procedural and editor-made maps.
    createLavaWorld();
    createVoidWorld();

    fishingLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff }));
    fishingLine.frustumCulled = false; fishingLine.visible = false; scene.add(fishingLine);

    castMarker = new THREE.Group();
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const b1 = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.2), barMat); const b2 = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.2), barMat);
    b2.rotation.z = Math.PI / 2; castMarker.add(b1, b2);
    castMarker.rotation.x = -Math.PI / 2; castMarker.visible = false; scene.add(castMarker);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        resizeRetroPipeline();
        // Keep the CSS3D overlay (YouTube Screen prop) in step with the canvas
        // so the video stays pinned to its housing after a window resize.
        if (typeof cssRenderer !== 'undefined' && cssRenderer && typeof cssRenderer.setSize === 'function') {
            cssRenderer.setSize(window.innerWidth, window.innerHeight);
        }
    });
}

function createSpeakerTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.moveTo(10, 20); ctx.lineTo(25, 20); ctx.lineTo(40, 5); ctx.lineTo(40, 59); ctx.lineTo(25, 44); ctx.lineTo(10, 44); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'white';
    ctx.beginPath(); ctx.arc(40, 32, 10, -Math.PI / 3, Math.PI / 3); ctx.stroke();
    ctx.beginPath(); ctx.arc(40, 32, 20, -Math.PI / 3, Math.PI / 3); ctx.stroke();
    return new THREE.CanvasTexture(c);
}

function createCabin() {
    const house=WorldGen.makeBuilding({type:'house',scale:1.35,rot:0});
    house.position.set(-40,0,10);house.name='playerHouseExterior';scene.add(house);
    staticColliders.push({minX:-44.5,maxX:-35.5,minZ:6.2,maxZ:13.8});
    if(window.Housing)Housing.registerExterior(house);
}

function createNPCs() {
    const defaultSpawns = getDefaultNpcSpawns();
    // --- MAIN WORLD NPCs ---

    // 1. Merchant (East)
    npcMerchant = createPlayerMesh('#E65100', "Merchant", 'tophat', '#000000', 'fox');
    npcMerchant.position.set(defaultSpawns.merchant.x, 0, defaultSpawns.merchant.z);
    npcMerchant.lookAt(0, 0, 0);
    scene.add(npcMerchant);

    // 2. Stylist (West)
    npcStylist = createPlayerMesh('#FF69B4', "Shop", 'bow', '#000000', 'bunny');
    npcStylist.position.set(defaultSpawns.stylist.x, 0, defaultSpawns.stylist.z);
    npcStylist.lookAt(0, 0, 0);
    scene.add(npcStylist);

    // 3. Bait Shop (South)
    npcBait = createPlayerMesh('#32CD32', "Bait Shop", 'straw', '#000000', 'frog');
    npcBait.position.set(defaultSpawns.bait.x, 0, defaultSpawns.bait.z);
    npcBait.lookAt(0, 0, 0);
    scene.add(npcBait);

    // 4. Tutorial NPC (North - opposite of Bait Shop)
    npcTutorial = createPlayerMesh('#9370DB', "Tutorial", 'bow', '#000000', 'bunny');
    npcTutorial.position.set(defaultSpawns.tutorial.x, 0, defaultSpawns.tutorial.z);
    npcTutorial.lookAt(0, 0, 0);
    scene.add(npcTutorial);

    // 5. Inferno Guard (Main World - Waterfall Entrance)
    npcLavaKeeper = createPlayerMesh('#8B0000', "Inferno Guard", 'viking', '#FFD700', 'dragon');
    npcLavaKeeper.position.set(defaultSpawns.lava.x, 0, defaultSpawns.lava.z);
    npcLavaKeeper.lookAt(0, 0, 0);
    scene.add(npcLavaKeeper);

    // 6. Old Fisher (Main World - on the lake shore, southwest of the Merchant)
    npcFisher = createPlayerMesh('#8D6E63', "Old Fisher", 'straw', '#000000', 'bear');
    npcFisher.position.set(defaultSpawns.fisher.x, 0, defaultSpawns.fisher.z);
    npcFisher.lookAt(0, 0, 0);
    scene.add(npcFisher);

    // 7. Scratch Dealer (Main World - east shore, just north of the Merchant)
    npcScratch = createPlayerMesh('#F2B01E', "Lucky Lou", 'tophat', '#000000', 'fox');
    npcScratch.position.set(defaultSpawns.scratch.x, 0, defaultSpawns.scratch.z);
    npcScratch.lookAt(0, 0, 0);
    scene.add(npcScratch);

    // Add Icons
    addIcon(npcLavaKeeper, '🌋');
    addIcon(npcMerchant, '$');
    addIcon(npcStylist, '👕');
    addIcon(npcBait, '🪱');
    addIcon(npcTutorial, '❓');
    addIcon(npcFisher, '🎣');
    addIcon(npcScratch, '\uD83C\uDF9F\uFE0F');

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


    // Add Icons for Lava Versions
    addIcon(npcLavaMerchant, '$');
    addIcon(npcLavaStylist, '👕');
    addIcon(npcLavaBait, '🪱');

    window.Halloween?.spawn(scene);
    window.Boats?.setup(scene);

    // --- CUSTOM LEVEL OVERRIDES ---
    // Move the NPCs to wherever the level editor placed them.
    if (window.CUSTOM_LEVEL && window.Level) {
        const lv = window.CUSTOM_LEVEL;
        const byType = { merchant: npcMerchant, stylist: npcStylist, bait: npcBait, tutorial: npcTutorial, lava: npcLavaKeeper, fisher: npcFisher, scratch: npcScratch };
        lv.npcs.forEach((n) => {
            const mesh = byType[n.type];
            if (!mesh) return;
            mesh.position.set(n.x, window.Level.sampleHeight(lv, n.x, n.z), n.z);
            // Reset all axes: lookAt can leave X/Z at PI, which reverses a
            // subsequent yaw-only assignment. Editor yaw 0 faces world +Z.
            mesh.rotation.set(0, Number(n.rot) || 0, 0);
        });
        if (npcLavaKeeper && !lv.npcs.some(n => n.type === 'lava')) {
            const spot = findCustomLavaKeeperSpot(lv);
            if (spot) {
                npcLavaKeeper.position.set(spot.x, spot.y, spot.z);
                const spawn = findCustomSpawn(lv);
                if (spawn) npcLavaKeeper.rotation.set(0, Math.atan2(spawn.x - spot.x, spawn.z - spot.z), 0);
            }
        }
    }
}

function addIcon(parent, text) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#FFD700'; ctx.font = '50px Arial'; ctx.textAlign = 'center'; ctx.fillText(text, 32, 50);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c) }));
    s.position.y = 3.6; s.name='npcIcon'; s.visible=typeof hudVisible==='undefined'||hudVisible; parent.add(s);
}

// --- DYNAMIC TEXTURE DRAWING FUNCTIONS ---
function drawHat(ctx, hatId, isBack) {
    const hat = HAT_TYPES.find(h => h.id === hatId);
    if (!hat || hat.id === 'none') return;

    ctx.fillStyle = hat.color;

    if (hat.type === 'cap') {
        // Baseball cap with button, curved crown, and shaded brim
        ctx.fillStyle = hat.color;
        ctx.beginPath();
        ctx.arc(32, 10, 16, Math.PI, 0);
        ctx.fill();
        // Crown panels highlight
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath(); ctx.arc(28, 6, 7, Math.PI, 0); ctx.fill();
        // Top squatchee button
        ctx.fillStyle = shadeColor(hat.color, -0.3);
        ctx.beginPath(); ctx.arc(32, -6, 2.5, 0, Math.PI * 2); ctx.fill();
        // Front brim or back snap
        if (!isBack) {
            ctx.fillStyle = shadeColor(hat.color, -0.2);
            ctx.beginPath();
            ctx.ellipse(32, 10, 20, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            // Edge highlight on brim
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(32, 10, 19, 0.1, Math.PI - 0.1); ctx.stroke();
        } else {
            // Back opening & strap
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.arc(32, 9, 5, Math.PI, 0); ctx.fill();
            ctx.fillStyle = '#222';
            ctx.fillRect(28, 9, 8, 2);
        }
    } else if (hat.type === 'wide') {
        // Straw / cowboy / pirate wide hats
        if (hat.id === 'straw') {
            // Woven straw hat with band
            ctx.fillStyle = '#e4d96f';
            ctx.beginPath(); ctx.ellipse(32, 10, 23, 6, 0, 0, Math.PI * 2); ctx.fill();
            // Crown
            const crownGrad = ctx.createLinearGradient(0, -4, 0, 10);
            crownGrad.addColorStop(0, '#f5eca0'); crownGrad.addColorStop(1, '#c9bd4e');
            ctx.fillStyle = crownGrad;
            ctx.beginPath(); ctx.arc(32, 8, 12, Math.PI, 0); ctx.fill();
            // Red ribbon band
            ctx.fillStyle = '#d32f2f';
            ctx.fillRect(20, 6, 24, 3);
            ctx.fillStyle = '#b71c1c';
            ctx.fillRect(20, 8, 24, 1);
        } else if (hat.id === 'cowboy') {
            // Formed cowboy brim with curl and crown crease
            const cCol = hat.color || '#8b4513';
            ctx.fillStyle = cCol;
            ctx.beginPath();
            ctx.ellipse(32, 9, 24, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            // Crown
            ctx.fillStyle = shadeColor(cCol, 0.1);
            ctx.beginPath();
            ctx.moveTo(21, 9); ctx.lineTo(23, -4); ctx.quadraticCurveTo(32, 0, 41, -4); ctx.lineTo(43, 9);
            ctx.fill();
            // Crown crease shadow
            ctx.fillStyle = shadeColor(cCol, -0.3);
            ctx.beginPath(); ctx.ellipse(32, -1, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
            // Hat band
            ctx.fillStyle = '#222';
            ctx.fillRect(22, 6, 20, 2.5);
            ctx.fillStyle = '#d4af37';
            ctx.fillRect(31, 6, 2, 2.5); // Gold buckle
        } else if (hat.id === 'pirate') {
            // Tricorn pirate hat with golden trim & skull emblem
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.moveTo(8, 11);
            ctx.quadraticCurveTo(32, 3, 56, 11);
            ctx.lineTo(48, -4);
            ctx.quadraticCurveTo(32, 1, 16, -4);
            ctx.closePath();
            ctx.fill();
            // Gold braided edge
            ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(8, 11); ctx.quadraticCurveTo(32, 3, 56, 11); ctx.stroke();
            if (!isBack) {
                // Skull & bones emblem
                ctx.fillStyle = '#ffffff';
                ctx.beginPath(); ctx.arc(32, 3, 2.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillRect(31, 5, 2, 1.5);
                ctx.fillStyle = '#ffd700';
                ctx.fillRect(30, 7, 4, 1);
            }
        } else {
            ctx.fillRect(10, 8, 44, 4); ctx.fillRect(18, 0, 28, 10);
        }
    } else if (hat.type === 'dome') {
        // Beanie / Knit Dome Hat with cuff and pom-pom
        const baseCol = hat.color || '#444444';
        const grad = ctx.createLinearGradient(0, -6, 0, 10);
        grad.addColorStop(0, shadeColor(baseCol, 0.25));
        grad.addColorStop(1, baseCol);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(32, 10, 17, Math.PI, 0); ctx.fill();
        // Knit ribbed stripes
        ctx.strokeStyle = shadeColor(baseCol, -0.2);
        ctx.lineWidth = 1;
        for (let x = 18; x <= 46; x += 4) {
            ctx.beginPath(); ctx.moveTo(x, 10); ctx.quadraticCurveTo(32, -4, 32, -6); ctx.stroke();
        }
        // Rolled Cuff
        ctx.fillStyle = shadeColor(baseCol, -0.25);
        ctx.fillRect(14, 7, 36, 5);
        ctx.fillStyle = shadeColor(baseCol, 0.15);
        ctx.fillRect(14, 7, 36, 1.5);
        // Fluffy pompom on top
        ctx.fillStyle = shadeColor(baseCol, 0.4);
        ctx.beginPath(); ctx.arc(32, -7, 4, 0, Math.PI * 2); ctx.fill();
    } else if (hat.type === 'tall') {
        if (hat.id === 'chef') {
            // Chef Toque (billowing folds & band)
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(20, 6, 24, 5);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(24, 0, 8, 0, Math.PI * 2);
            ctx.arc(32, -4, 9, 0, Math.PI * 2);
            ctx.arc(40, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.06)';
            ctx.fillRect(23, 1, 2, 6); ctx.fillRect(31, -2, 2, 9); ctx.fillRect(39, 1, 2, 6);
        } else {
            // Silk Top Hat with shine and satin band
            const thGrad = ctx.createLinearGradient(16, 0, 48, 0);
            thGrad.addColorStop(0, '#111');
            thGrad.addColorStop(0.35, '#333');
            thGrad.addColorStop(0.55, '#444');
            thGrad.addColorStop(1, '#0d0d0d');
            ctx.fillStyle = thGrad;
            ctx.fillRect(20, -12, 24, 22);
            // Curved brim with edge
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.ellipse(32, 10, 22, 4, 0, 0, Math.PI * 2); ctx.fill();
            // Satin red/maroon ribbon
            ctx.fillStyle = '#990000';
            ctx.fillRect(20, 6, 24, 4);
            ctx.fillStyle = '#cc0000';
            ctx.fillRect(20, 6, 24, 1);
        }
    } else if (hat.type === 'cone') {
        ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(54, 10); ctx.lineTo(32, -15); ctx.fill();
    } else if (hat.type === 'horn') {
        // Viking horned helmet with metallic band and polished horns
        ctx.fillStyle = '#7a7a7a';
        ctx.beginPath(); ctx.arc(32, 10, 17, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#555';
        ctx.fillRect(14, 7, 36, 4);
        // Rivets
        ctx.fillStyle = '#ffd700';
        for (let rx = 18; rx <= 46; rx += 7) {
            ctx.beginPath(); ctx.arc(rx, 9, 1.2, 0, Math.PI * 2); ctx.fill();
        }
        // Horns
        const hornGradL = ctx.createLinearGradient(14, 5, 2, -10);
        hornGradL.addColorStop(0, '#e8e0d0'); hornGradL.addColorStop(1, '#8b7d6b');
        ctx.fillStyle = hornGradL;
        ctx.beginPath(); ctx.moveTo(15, 8); ctx.quadraticCurveTo(8, 2, 3, -8); ctx.quadraticCurveTo(10, -5, 17, 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = hornGradL;
        ctx.beginPath(); ctx.moveTo(49, 8); ctx.quadraticCurveTo(56, 2, 61, -8); ctx.quadraticCurveTo(54, -5, 47, 3); ctx.closePath(); ctx.fill();
    } else if (hat.type === 'crown') {
        // King crown: Golden arches, velvet interior, rich ruby/emerald gems
        // Velvet cap interior
        ctx.fillStyle = '#800020';
        ctx.beginPath(); ctx.arc(32, 7, 14, Math.PI, 0); ctx.fill();
        // Golden crown structure
        const goldGrad = ctx.createLinearGradient(0, -6, 0, 10);
        goldGrad.addColorStop(0, '#ffe066'); goldGrad.addColorStop(0.5, '#ffd700'); goldGrad.addColorStop(1, '#cc9900');
        ctx.fillStyle = goldGrad;
        ctx.beginPath();
        ctx.moveTo(14, 10); ctx.lineTo(14, -4); ctx.lineTo(19, 4); ctx.lineTo(25, -6);
        ctx.lineTo(32, 4); ctx.lineTo(39, -6); ctx.lineTo(45, 4); ctx.lineTo(50, -4);
        ctx.lineTo(50, 10); ctx.closePath(); ctx.fill();
        // Rim
        ctx.fillStyle = '#b8860b'; ctx.fillRect(14, 8, 36, 3);
        // Bejeweled gems
        ctx.fillStyle = '#e60000'; ctx.beginPath(); ctx.arc(32, 9, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#00cc44'; ctx.beginPath(); ctx.arc(22, 9, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0088ff'; ctx.beginPath(); ctx.arc(42, 9, 1.5, 0, Math.PI * 2); ctx.fill();
        // Crown tips pearls
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(14, -4, 1.5, 0, Math.PI * 2); ctx.arc(25, -6, 1.8, 0, Math.PI * 2); ctx.arc(39, -6, 1.8, 0, Math.PI * 2); ctx.arc(50, -4, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (hat.type === 'fedora') {
        // Sleek Noir Fedora with hat band & feather
        ctx.fillStyle = '#262626';
        ctx.beginPath(); ctx.ellipse(32, 9, 23, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        // Crown
        ctx.fillStyle = '#1c1c1c';
        ctx.fillRect(19, -3, 26, 11);
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.ellipse(32, -3, 13, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Dark crimson / silk band
        ctx.fillStyle = '#8b0000';
        ctx.fillRect(19, 5, 26, 3);
        // Little pin / feather
        if (!isBack) {
            ctx.fillStyle = '#ffd700'; ctx.fillRect(23, 3, 2, 4);
            ctx.fillStyle = '#00bcd4'; ctx.beginPath(); ctx.moveTo(23, 3); ctx.lineTo(21, -3); ctx.lineTo(24, 0); ctx.fill();
        }
    } else if (hat.type === 'beret') {
        // French artist beret tilted with stalk
        ctx.fillStyle = hat.color || '#800000';
        ctx.beginPath(); ctx.ellipse(34, 5, 23, 9, -0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shadeColor(hat.color || '#800000', 0.2);
        ctx.beginPath(); ctx.ellipse(32, 3, 14, 5, -0.15, 0, Math.PI * 2); ctx.fill();
        // Beret tab/stem
        ctx.strokeStyle = shadeColor(hat.color || '#800000', -0.3);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(34, -4); ctx.lineTo(34, -7); ctx.stroke();
    } else if (hat.type === 'bucket') {
        // Fishing Bucket hat with stitched brim & brass eyelets
        const bCol = hat.color || '#4682B4';
        ctx.fillStyle = bCol;
        ctx.fillRect(17, -2, 30, 11);
        ctx.fillStyle = shadeColor(bCol, 0.15);
        ctx.beginPath(); ctx.ellipse(32, -2, 15, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Flared brim
        ctx.fillStyle = shadeColor(bCol, -0.15);
        ctx.beginPath(); ctx.moveTo(15, 9); ctx.lineTo(8, 15); ctx.lineTo(56, 15); ctx.lineTo(49, 9); ctx.closePath(); ctx.fill();
        // Brim stitch line
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(32, 11, 21, 0.3, Math.PI - 0.3); ctx.stroke();
        // Brass ventilation eyelets
        if (!isBack) {
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(22, 3, 1.5, 0, Math.PI * 2); ctx.arc(42, 3, 1.5, 0, Math.PI * 2); ctx.fill();
        }
    } else if (hat.type === 'headphones') {
        // Studio DJ Headphones with foam cushions, metallic headband & LED accent
        // Headband
        ctx.strokeStyle = '#222'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(32, 10, 21, Math.PI, 0); ctx.stroke();
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(32, 10, 21, Math.PI, 0); ctx.stroke();
        // Ear cups
        ctx.fillStyle = '#111';
        ctx.fillRect(9, 6, 8, 16); ctx.fillRect(47, 6, 8, 16);
        // Soft ear pads
        ctx.fillStyle = '#444';
        ctx.fillRect(15, 8, 2, 12); ctx.fillRect(47, 8, 2, 12);
        // Outer glow/color rings
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(10, 12, 3, 4); ctx.fillRect(51, 12, 3, 4);
    } else if (hat.type === 'flower') {
        if (!isBack) {
            // Delicate tropical plumeria / flower pin with soft petals
            ctx.save();
            ctx.translate(45, 6);
            for (let i = 0; i < 5; i++) {
                const angle = (i / 5) * Math.PI * 2;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.ellipse(Math.cos(angle) * 6, Math.sin(angle) * 6, 4.5, 3, angle, 0, Math.PI * 2);
                ctx.fill();
            }
            // Golden center
            ctx.fillStyle = '#ffbb00';
            ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ff6600';
            ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    } else if (hat.type === 'miner') {
        ctx.fillStyle = hat.color;
        ctx.beginPath(); ctx.arc(32, 8, 18, Math.PI, 0); ctx.fill();
        if (!isBack) {
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(32, -2, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,200,0.5)'; ctx.beginPath(); ctx.moveTo(32, -2); ctx.lineTo(10, 30); ctx.lineTo(54, 30); ctx.fill();
        }
    } else if (hat.type === 'sombrero') {
        // Festive sombrero with embroidered zigzag brim and tall pinched crown
        const sGrad = ctx.createLinearGradient(0, -10, 0, 10);
        sGrad.addColorStop(0, '#f2d6a2'); sGrad.addColorStop(1, '#c9a15d');
        ctx.fillStyle = sGrad;
        ctx.beginPath(); ctx.ellipse(32, 8, 28, 6.5, 0, 0, Math.PI * 2); ctx.fill();
        // Crown
        ctx.fillRect(22, -10, 20, 18);
        ctx.fillStyle = '#b3863c';
        ctx.beginPath(); ctx.ellipse(32, -10, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
        // Colorful serape band
        ctx.fillStyle = '#e60000'; ctx.fillRect(22, 3, 20, 2);
        ctx.fillStyle = '#00b33c'; ctx.fillRect(22, 5, 20, 1.5);
        // Brim embroidered pattern
        ctx.strokeStyle = '#e60000'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let bx = 8; bx <= 54; bx += 4) {
            ctx.lineTo(bx, 8 + ((bx % 8 === 0) ? -1.5 : 1.5));
        }
        ctx.stroke();
    } else if (hat.type === 'santa') {
        // Fluffy Santa hat with textured brim, pompom, and folded tip
        const sGrad = ctx.createLinearGradient(12, 0, 52, 0);
        sGrad.addColorStop(0, '#d32f2f'); sGrad.addColorStop(0.5, '#f44336'); sGrad.addColorStop(1, '#b71c1c');
        ctx.fillStyle = sGrad;
        ctx.beginPath(); ctx.moveTo(12, 10); ctx.lineTo(52, 10); ctx.quadraticCurveTo(45, -6, 22, -16); ctx.closePath(); ctx.fill();
        // White fleece trim
        ctx.fillStyle = '#f8f8f8';
        ctx.beginPath(); ctx.ellipse(32, 9, 22, 4, 0, 0, Math.PI * 2); ctx.fill();
        // Fluffy pompom
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(21, -16, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e0e0e0';
        ctx.beginPath(); ctx.arc(21, -16, 3, 0, Math.PI * 2); ctx.fill();
    } else if (hat.type === 'witch') {
        // Mystical Witch Hat with curved tip, shimmering buckle, and wide brim
        ctx.fillStyle = '#1e1035';
        ctx.beginPath(); ctx.ellipse(32, 10, 25, 5, 0, 0, Math.PI * 2); ctx.fill();
        // Pointed cone curving back
        const wGrad = ctx.createLinearGradient(0, 10, 0, -22);
        wGrad.addColorStop(0, '#311b58'); wGrad.addColorStop(1, '#150a26');
        ctx.fillStyle = wGrad;
        ctx.beginPath();
        ctx.moveTo(19, 10);
        ctx.quadraticCurveTo(24, -6, 30, -22);
        ctx.quadraticCurveTo(34, -22, 38, -6);
        ctx.lineTo(45, 10);
        ctx.closePath();
        ctx.fill();
        // Violet/Gold mystic ribbon
        ctx.fillStyle = '#8a2be2';
        ctx.fillRect(20, 6, 24, 3);
        ctx.fillStyle = '#ffd700';
        ctx.strokeRect(29, 5.5, 6, 4);
    } else if (hat.type === 'ninja') {
        // Ninja Headband with flowing cloth tails & metallic forehead crest
        ctx.fillStyle = '#151515';
        ctx.fillRect(14, 3, 36, 7);
        // Metal plate
        ctx.fillStyle = '#b0bec5';
        ctx.fillRect(24, 4, 16, 5);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(25, 4.5, 14, 1); // Shimmer
        // Engraved symbol
        ctx.fillStyle = '#37474f';
        ctx.beginPath(); ctx.arc(32, 6.5, 1.8, 0, Math.PI * 2); ctx.fill();
        if (isBack) {
            // Swaying headband tails
            ctx.fillStyle = '#151515';
            ctx.beginPath(); ctx.moveTo(30, 8); ctx.lineTo(26, 28); ctx.lineTo(31, 26); ctx.lineTo(32, 8); ctx.fill();
            ctx.beginPath(); ctx.moveTo(33, 8); ctx.lineTo(37, 30); ctx.lineTo(41, 27); ctx.lineTo(35, 8); ctx.fill();
        }
    } else if (hat.type === 'propeller') {
        // Colorful Propeller Beanie
        // Quartered cap (Red, Yellow, Blue, Green)
        ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(32, 8, 17, Math.PI, Math.PI * 1.5); ctx.lineTo(32, 8); ctx.fill();
        ctx.fillStyle = '#1e88e5'; ctx.beginPath(); ctx.arc(32, 8, 17, Math.PI * 1.5, Math.PI * 2); ctx.lineTo(32, 8); ctx.fill();
        // Cap rim
        ctx.fillStyle = '#43a047'; ctx.fillRect(14, 7, 36, 3);
        // Spindle & Propeller Blades
        ctx.fillStyle = '#757575'; ctx.fillRect(31, -10, 2, 8);
        ctx.fillStyle = '#fbc02d'; ctx.beginPath(); ctx.arc(32, -10, 2.5, 0, Math.PI * 2); ctx.fill();
        if (!isBack) {
            // Spinning blade
            ctx.fillStyle = '#f44336';
            ctx.beginPath(); ctx.ellipse(25, -10, 9, 2.5, -0.15, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffd600';
            ctx.beginPath(); ctx.ellipse(39, -10, 9, 2.5, 0.15, 0, Math.PI * 2); ctx.fill();
        }
    } else if (hat.type === 'halo') {
        // Holy Radiant Angel Halo with glowing aura
        ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 6;
        ctx.strokeStyle = '#fff59d'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.ellipse(32, -7, 15, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(32, -7, 14.5, 4, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
    } else if (hat.type === 'antlers') {
        // Majestic Forest Antlers with shaded 3D branches
        ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        // Left horn
        ctx.beginPath(); ctx.moveTo(21, 6); ctx.lineTo(12, -8); ctx.lineTo(16, -17); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(12, -8); ctx.lineTo(4, -12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(14, -13); ctx.lineTo(9, -18); ctx.stroke();
        // Right horn
        ctx.beginPath(); ctx.moveTo(43, 6); ctx.lineTo(52, -8); ctx.lineTo(48, -17); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(52, -8); ctx.lineTo(60, -12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(50, -13); ctx.lineTo(55, -18); ctx.stroke();
        // Bone highlight
        ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(21, 5); ctx.lineTo(13, -7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(43, 5); ctx.lineTo(51, -7); ctx.stroke();
    } else if (hat.type === 'police') {
        // Police peaked cap with patent leather visor & golden eagle badge
        ctx.fillStyle = '#0a194f';
        ctx.beginPath();
        ctx.moveTo(12, 5); ctx.lineTo(14, -7); ctx.lineTo(50, -7); ctx.lineTo(52, 5);
        ctx.closePath(); ctx.fill();
        // Black band
        ctx.fillStyle = '#111'; ctx.fillRect(14, 5, 36, 4);
        // Shiny visor
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.ellipse(32, 9, 18, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        if (!isBack) {
            // Visor shine
            ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(32, 9, 16, 0.2, Math.PI - 0.2); ctx.stroke();
            // Gold shield badge
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.moveTo(32, -3); ctx.lineTo(35, 1); ctx.lineTo(32, 5); ctx.lineTo(29, 1); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(32, 1, 1, 0, Math.PI * 2); ctx.fill();
        }
    } else if (hat.type === 'tv') {
        // Retro CRT TV monitor with antennas, scanlines, glow face
        const tvGrad = ctx.createLinearGradient(0, -6, 0, 30);
        tvGrad.addColorStop(0, '#555'); tvGrad.addColorStop(1, '#2b2b2b');
        ctx.fillStyle = tvGrad;
        ctx.fillRect(10, -5, 44, 36);
        // Screen bezel
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(13, -2, 38, 29);
        if (!isBack) {
            // Glowing CRT phosphor screen
            ctx.fillStyle = '#0f380f'; ctx.fillRect(15, 0, 34, 25);
            // Scanlines
            ctx.fillStyle = 'rgba(0,255,0,0.08)';
            for (let sy = 0; sy < 25; sy += 2) ctx.fillRect(15, sy, 34, 1);
            // Cute glowing retro face
            ctx.fillStyle = '#39ff14';
            ctx.shadowColor = '#39ff14'; ctx.shadowBlur = 6;
            ctx.fillRect(20, 6, 4, 6); ctx.fillRect(40, 6, 4, 6); // Eyes
            ctx.fillRect(26, 17, 12, 2); ctx.fillRect(24, 15, 2, 2); ctx.fillRect(38, 15, 2, 2); // Smile
            ctx.shadowBlur = 0;
            // Tuning knobs
            ctx.fillStyle = '#777';
            ctx.beginPath(); ctx.arc(44, 29, 2, 0, Math.PI * 2); ctx.arc(40, 29, 2, 0, Math.PI * 2); ctx.fill();
        }
        // V-Antennas
        ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(24, -5); ctx.lineTo(12, -18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(40, -5); ctx.lineTo(52, -18); ctx.stroke();
        ctx.fillStyle = '#ff1744'; ctx.beginPath(); ctx.arc(12, -18, 2, 0, Math.PI * 2); ctx.arc(52, -18, 2, 0, Math.PI * 2); ctx.fill();
    } else if (hat.type === 'plunger') {
        ctx.fillStyle = '#8B4513'; ctx.fillRect(30, -15, 4, 25);
        ctx.fillStyle = '#d32f2f'; ctx.beginPath(); ctx.arc(32, 10, 11, Math.PI, 0); ctx.fill();
    } else if (hat.type === 'arrow') {
        ctx.fillStyle = '#8B4513';
        if (!isBack) ctx.fillRect(0, 15, 14, 3);
        ctx.fillRect(50, 13, 14, 3);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(-6, 9); ctx.lineTo(-6, 21); ctx.fill();
        ctx.fillStyle = '#9e9e9e'; ctx.beginPath(); ctx.moveTo(64, 14); ctx.lineTo(72, 14); ctx.lineTo(64, 9); ctx.fill();
    } else if (hat.type === 'grad') {
        ctx.fillStyle = hat.color || '#222';
        ctx.fillRect(16, 8, 32, 4);
        ctx.beginPath(); ctx.moveTo(32, -5); ctx.lineTo(60, 5); ctx.lineTo(32, 15); ctx.lineTo(4, 5); ctx.fill();
        if (isBack) { ctx.strokeStyle = 'gold'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(32, -5); ctx.lineTo(32, 12); ctx.stroke(); }
    } else if (hat.type === 'rainbow') {
        // Luscious, cohesive Rainbow Afro with vibrant volumetric gradient curls
        const curls = [
            { x: 32, y: -4, r: 12, col: '#ff3366' },
            { x: 22, y: 0, r: 11, col: '#ff9933' },
            { x: 42, y: 0, r: 11, col: '#ffcc00' },
            { x: 15, y: 8, r: 10, col: '#33cc66' },
            { x: 49, y: 8, r: 10, col: '#3399ff' },
            { x: 32, y: 6, r: 13, col: '#9933ff' },
            { x: 24, y: 12, r: 9, col: '#ff33cc' },
            { x: 40, y: 12, r: 9, col: '#00ffff' }
        ];
        curls.forEach(c => {
            ctx.fillStyle = c.col;
            ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
            // Highlight shine on each curl
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath(); ctx.arc(c.x - c.r * 0.3, c.y - c.r * 0.3, c.r * 0.4, 0, Math.PI * 2); ctx.fill();
        });
    } else if (hat.type === 'void') {
        // Ethereal Void Mask with cosmic dark core, floating eyes and purple aura
        ctx.shadowColor = '#8a2be2'; ctx.shadowBlur = 12;
        ctx.fillStyle = '#0a0012';
        ctx.beginPath(); ctx.ellipse(32, 15, 20, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4b0082'; ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (!isBack) {
            // Glowing twin void eyes
            ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 8;
            ctx.fillStyle = '#00ffff';
            ctx.fillRect(21, 14, 6, 2.5); ctx.fillRect(37, 14, 6, 2.5);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(23, 14.5, 2, 1.5); ctx.fillRect(39, 14.5, 2, 1.5);
            ctx.shadowBlur = 0;
        }
    } else if (hat.type === 'diamond') {
        // Sparkling Diamond Tiara with facets, refraction and glitter
        ctx.fillStyle = '#e0f7fa';
        ctx.fillRect(16, 8, 32, 3);
        // Crystal spires
        const drawDiamondShard = (x, y, w, h) => {
            ctx.fillStyle = '#00e5ff';
            ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w * 0.7, y + h); ctx.lineTo(x + w / 2, y + h); ctx.fill();
        };
        drawDiamondShard(28, -6, 8, 14);
        drawDiamondShard(20, -2, 6, 10);
        drawDiamondShard(38, -2, 6, 10);
        drawDiamondShard(15, 2, 5, 6);
        drawDiamondShard(44, 2, 5, 6);
    } else if (hat.type === 'banana') {
        // Nano Banana peel hat resting atop player's head!
        const bGrad = ctx.createLinearGradient(16, 0, 48, 0);
        bGrad.addColorStop(0, '#ffe135'); bGrad.addColorStop(0.5, '#fff176'); bGrad.addColorStop(1, '#fbc02d');
        ctx.fillStyle = bGrad;
        // Curved crescent banana shape
        ctx.beginPath();
        ctx.moveTo(14, 10);
        ctx.quadraticCurveTo(32, -12, 50, 4);
        ctx.quadraticCurveTo(32, -4, 14, 10);
        ctx.fill();
        // Green stem on left tip
        ctx.fillStyle = '#7cb342';
        ctx.beginPath(); ctx.arc(14, 10, 2.5, 0, Math.PI * 2); ctx.fill();
        // Brown tip on right
        ctx.fillStyle = '#5d4037';
        ctx.beginPath(); ctx.arc(50, 4, 2, 0, Math.PI * 2); ctx.fill();
        // Banana ridge line
        ctx.strokeStyle = 'rgba(139, 69, 19, 0.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(15, 9); ctx.quadraticCurveTo(32, -7, 49, 4); ctx.stroke();
    }
    if(!isBack&&hatId==='ht_cap'){ctx.fillStyle='#38233d';ctx.fillRect(28,7,2,2);ctx.fillRect(34,7,2,2);ctx.fillRect(30,11,4,1);}
    if(hatId==='ht_witch'){ctx.fillStyle='#ec9b41';ctx.fillRect(24,-4,16,3);}

}


window.toggleDebugMode = function () {
    saveState.debugMode = !saveState.debugMode;
    saveGame();
    updateDebugUI();
    showToast(saveState.debugMode ? "Debug Mode: ON" : "Debug Mode: OFF");
}

function updateDebugUI() {
    const btn = document.getElementById('btn-debug-toggle');
    if (btn) {
        btn.innerText = saveState.debugMode ? "Debug: ON" : "Debug: OFF";
        btn.style.color = saveState.debugMode ? 'var(--p-good)' : 'var(--p-bad)';
    }
}

window.toggleMidiMute = function () {
    saveState.midiMuted = !saveState.midiMuted;
    saveGame();
    updateMidiUI();
}

function updateMidiUI() {
    const btn = document.getElementById('btn-midi-toggle');
    if (btn) {
        btn.innerText = saveState.midiMuted ? "MIDI: OFF" : "MIDI: ON";
        btn.style.color = saveState.midiMuted ? 'var(--p-bad)' : 'var(--p-good)';
    }
}

// --- MODULAR CHARACTER DRAWING FUNCTIONS ---

// Rounded-rectangle path helper (kept local so we don't depend on
// CanvasRenderingContext2D.roundRect).
function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// Draw the base body and head (shared by all characters)
function drawBody(ctx, col, bellyCol, back) {
    const dark = shadeColor(col, -0.24);
    const light = shadeColor(col, 0.26);

    // --- Torso: rounded, top-lit gradient ---
    const BX = 20, BY = 28, BW = 24, BH = 40;
    const bodyGrad = ctx.createLinearGradient(0, BY, 0, BY + BH);
    bodyGrad.addColorStop(0, col);
    bodyGrad.addColorStop(0.5, col);
    bodyGrad.addColorStop(1, dark);
    rrect(ctx, BX, BY, BW, BH, 5);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    if (!back) {
        // Side ambient occlusion so the torso reads as a soft cylinder.
        ctx.save();
        rrect(ctx, BX, BY, BW, BH, 5);
        ctx.clip();
        const side = ctx.createLinearGradient(BX, 0, BX + BW, 0);
        side.addColorStop(0, 'rgba(0,0,0,0.14)');
        side.addColorStop(0.32, 'rgba(0,0,0,0)');
        side.addColorStop(0.68, 'rgba(0,0,0,0)');
        side.addColorStop(1, 'rgba(0,0,0,0.14)');
        ctx.fillStyle = side;
        ctx.fillRect(BX, BY, BW, BH);
        ctx.restore();

        // Belly patch
        ctx.fillStyle = bellyCol;
        ctx.beginPath();
        ctx.ellipse(32, 49, 8, 12, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // --- Head: rounded, top-lit gradient ---
    const HX = 14, HY = 8, HW = 36, HH = 28;
    const headGrad = ctx.createLinearGradient(0, HY, 0, HY + HH);
    headGrad.addColorStop(0, light);
    headGrad.addColorStop(0.45, col);
    headGrad.addColorStop(1, shadeColor(col, -0.12));
    rrect(ctx, HX, HY, HW, HH, 7);
    ctx.fillStyle = headGrad;
    ctx.fill();

    // Head highlight + side shading now live in applyHeadLighting(), which
    // runs once after the ears are drawn so both the head and the ears get
    // identical lighting and the head/ear join disappears.
}

// Applies the head's soft highlight and side shading across the whole sprite.
// Uses `source-atop` so it only tints pixels that are already painted (body,
// ears, hair); transparent areas stay transparent. Call after all the parts
// are drawn.
function applyHeadLighting(ctx) {
    const HX = 14, HY = 8, HW = 36, HH = 28;
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    // Soft highlight on the upper-left of the head.
    const hl = ctx.createRadialGradient(27, 15, 1, 27, 15, 17);
    hl.addColorStop(0, 'rgba(255,255,255,0.30)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(0, -30, 64, 105);
    // Side shading, matched to the head's width so the edges of the head and
    // any ear that sits beside it darken by the same amount.
    const hside = ctx.createLinearGradient(HX, 0, HX + HW, 0);
    hside.addColorStop(0, 'rgba(0,0,0,0.12)');
    hside.addColorStop(0.3, 'rgba(0,0,0,0)');
    hside.addColorStop(0.7, 'rgba(0,0,0,0)');
    hside.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = hside;
    ctx.fillRect(0, -30, 64, 105);
    // Chin / neck shadow where the head meets the torso.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(HX, 33, HW, 3);
    ctx.restore();
}

// Helper for shading
function shadeColor(color, percent) {
    // Simple hex darken/lighten (assumes hex input)
    let f = parseInt(color.slice(1), 16), t = percent < 0 ? 0 : 255, p = percent < 0 ? percent * -1 : percent, R = f >> 16, G = f >> 8 & 0x00FF, B = f & 0x0000FF;
    return "#" + (0x1000000 + (Math.round((t - R) * p) + R) * 0x10000 + (Math.round((t - G) * p) + G) * 0x100 + (Math.round((t - B) * p) + B)).toString(16).slice(1);
}

// Draw ears based on selected type.
// Ears must match the *top* of the head, which drawBody() paints with a
// top-lit gradient: shadeColor(col, 0.26) at the crown fading into `col`. A
// flat `col` here left a visible seam along the head/ear join, so the ear
// base uses that same crown highlight.
function drawEars(ctx, earId, col, bellyCol, back) {
    // Match the head EXACTLY. drawBody() paints the head with a vertical
    // gradient over y = HY(8) .. HY+HH(36):
    //   8    -> light              (shadeColor(col, 0.26))
    //   20.6 -> col
    //   36   -> shadeColor(col, -0.12)
    // The ears are drawn on top of the body and share the same coordinate
    // space, so the only way the join disappears is to sample the *same*
    // gradient at the *same* y. Points above the crown (y < 8) clamp to the
    // first stop, which is exactly what we want for pointy ears.
    const light = shadeColor(col, 0.26);
    const dark = shadeColor(col, -0.12);
    const earGrad = ctx.createLinearGradient(0, 8, 0, 36);
    earGrad.addColorStop(0, light);
    earGrad.addColorStop(0.45, col);
    earGrad.addColorStop(1, dark);
    ctx.fillStyle = earGrad;
    const shadow = shadeColor(col, -0.2);
    const highlight = shadeColor(col, 0.2);

    if (earId === 'cat') {
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(14, -2); ctx.lineTo(26, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(50, -2); ctx.lineTo(38, 10); ctx.fill();

        if (!back) {
            ctx.fillStyle = shadow; // Inner ear
            ctx.beginPath(); ctx.moveTo(16, 8); ctx.lineTo(16, 2); ctx.lineTo(22, 8); ctx.fill();
            ctx.beginPath(); ctx.moveTo(48, 8); ctx.lineTo(48, 2); ctx.lineTo(42, 8); ctx.fill();
        }
    }
    else if (earId === 'bunny') {
        ctx.fillStyle = earGrad;
        // Bigger rabbit ears
        ctx.beginPath(); ctx.ellipse(22, 0, 6, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(42, 0, 6, 14, 0, 0, Math.PI * 2); ctx.fill();

        if (!back) {
            ctx.fillStyle = bellyCol; // Pink inner
            ctx.beginPath(); ctx.ellipse(22, 0, 3.5, 9, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(42, 0, 3.5, 9, 0, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'dog') {
        ctx.fillStyle = earGrad;
        // Floppy ears
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(10, 12); ctx.lineTo(10, 20); ctx.lineTo(18, 20); ctx.lineTo(20, 12); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(54, 12); ctx.lineTo(54, 20); ctx.lineTo(46, 20); ctx.lineTo(44, 12); ctx.fill();
        // Shadow underneath
        ctx.fillStyle = shadow;
        ctx.fillRect(10, 20, 8, 2); ctx.fillRect(46, 20, 8, 2);
    }
    else if (earId === 'bear') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.arc(14, 8, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 8, 6, 0, Math.PI * 2); ctx.fill();

        if (!back) {
            ctx.fillStyle = shadow;
            ctx.beginPath(); ctx.arc(14, 8, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(50, 8, 3, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'fox') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(10, -5); ctx.lineTo(24, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(54, -5); ctx.lineTo(40, 10); ctx.fill();
        // Black tips
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.moveTo(11, 2); ctx.lineTo(10, -5); ctx.lineTo(17, 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(53, 2); ctx.lineTo(54, -5); ctx.lineTo(47, 2); ctx.fill();
    }
    else if (earId === 'pig') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.moveTo(14, 12); ctx.lineTo(8, 8); ctx.lineTo(18, 16); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 12); ctx.lineTo(56, 8); ctx.lineTo(46, 16); ctx.fill();
    }
    else if (earId === 'dragon') {
        ctx.fillStyle = col; // Horns usually
        ctx.beginPath(); ctx.moveTo(18, 10); ctx.lineTo(14, -4); ctx.lineTo(24, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(46, 10); ctx.lineTo(50, -4); ctx.lineTo(40, 10); ctx.fill();
        // Ridges
        ctx.fillStyle = shadow;
        ctx.fillRect(16, 2, 4, 1); ctx.fillRect(44, 2, 4, 1);
        ctx.fillRect(15, -1, 4, 1); ctx.fillRect(45, -1, 4, 1);
    }
    else if (earId === 'mouse') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.arc(14, 6, 9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 6, 9, 0, Math.PI * 2); ctx.fill();
        if (!back) {
            ctx.fillStyle = bellyCol;
            ctx.beginPath(); ctx.arc(14, 6, 5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(50, 6, 5, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'raccoon') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(10, 0); ctx.lineTo(24, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(54, 0); ctx.lineTo(40, 10); ctx.fill();
        ctx.fillStyle = '#eee';
        ctx.fillRect(13, 10, 4, -4); ctx.fillRect(47, 10, 4, -4); // White edge
    }
    else if (earId === 'koala') {
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.arc(12, 14, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(52, 14, 7, 0, Math.PI * 2); ctx.fill();
        if (!back) {
            ctx.fillStyle = '#fff'; // Fluffy hair inside
            ctx.beginPath(); ctx.arc(12, 14, 4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(52, 14, 4, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'cow') {
        // Horns
        ctx.fillStyle = '#eee';
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(8, 0); ctx.lineTo(18, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(56, 0); ctx.lineTo(46, 10); ctx.fill();
        // Ears below horns
        ctx.fillStyle = earGrad;
        ctx.ellipse(8, 16, 6, 3, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.ellipse(56, 16, 6, 3, -0.4, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'monkey') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.arc(10, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(54, 20, 5, 0, Math.PI * 2); ctx.fill();
        if (!back) {
            ctx.fillStyle = shadow;
            ctx.beginPath(); ctx.arc(10, 20, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(54, 20, 3, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'protogen') {
        for(const side of [-1,1]){
            ctx.save();ctx.translate(side<0?17:47,10);ctx.scale(side,1);
            ctx.fillStyle=earGrad;ctx.beginPath();ctx.moveTo(-7,0);ctx.lineTo(5,0);ctx.lineTo(11,-13);ctx.lineTo(10,-28);ctx.lineTo(-2,-18);ctx.closePath();ctx.fill();
            if(!back){ctx.fillStyle=bellyCol;ctx.beginPath();ctx.moveTo(-3,-2);ctx.lineTo(3,-3);ctx.lineTo(7,-13);ctx.lineTo(7,-21);ctx.lineTo(0,-15);ctx.closePath();ctx.fill();}
            ctx.restore();
        }
    }
    // New types maintained with simple improvements
    else if (earId === 'wolf') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.moveTo(12, 10); ctx.lineTo(8, -4); ctx.lineTo(22, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(52, 10); ctx.lineTo(56, -4); ctx.lineTo(42, 10); ctx.fill();
        if (!back) {
            ctx.fillStyle = bellyCol;
            ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(12, 2); ctx.lineTo(20, 10); ctx.fill();
            ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(52, 2); ctx.lineTo(44, 10); ctx.fill();
        }
    }
    else if (earId === 'deer') {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(16, 2, 3, 10); ctx.fillRect(45, 2, 3, 10);
        ctx.fillRect(12, 0, 8, 3); ctx.fillRect(44, 0, 8, 3); // Branch
        ctx.fillRect(10, -4, 3, 6); ctx.fillRect(51, -4, 3, 6); // Points
    }
    else if (earId === 'owl' || earId === 'squirrel') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.moveTo(16, 10); ctx.lineTo(14, -2); ctx.lineTo(22, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(48, 10); ctx.lineTo(50, -2); ctx.lineTo(42, 10); ctx.fill();
    }
    else if (earId === 'bat') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.moveTo(10, 14); ctx.lineTo(6, -6); ctx.lineTo(26, 14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(54, 14); ctx.lineTo(58, -6); ctx.lineTo(38, 14); ctx.fill();
        if (!back) {
            ctx.fillStyle = bellyCol;
            ctx.beginPath(); ctx.moveTo(12, 12); ctx.lineTo(10, 0); ctx.lineTo(22, 12); ctx.fill();
            ctx.beginPath(); ctx.moveTo(52, 12); ctx.lineTo(54, 0); ctx.lineTo(42, 12); ctx.fill();
        }
    }
    else if (earId === 'shark') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(18, 0); ctx.lineTo(22, 14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(42, 14); ctx.lineTo(46, 0); ctx.lineTo(50, 14); ctx.fill();
    }
    else if (earId === 'tiger' || earId === 'leopard') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.arc(16, 8, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(48, 8, 6, 0, Math.PI * 2); ctx.fill();
        if (!back) {
            ctx.fillStyle = bellyCol; // White spot
            ctx.beginPath(); ctx.arc(16, 8, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(48, 8, 3, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'rhino') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.arc(14, 12, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 12, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'elephant') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.ellipse(8, 20, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(56, 20, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'hippo' || earId === 'otter' || earId === 'beaver' || earId === 'ferret') {
        ctx.fillStyle = earGrad;
        ctx.beginPath(); ctx.arc(14, 8, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 8, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'giraffe' || earId === 'zebra') {
        ctx.fillStyle = earGrad;
        ctx.fillRect(16, 0, 4, 12); ctx.fillRect(44, 0, 4, 12);
    }
    else if (earId === 'panda' || earId === 'skunk' || earId === 'red_panda' || earId === 'chipmunk' || earId === 'hamster' || earId === 'chinchilla') {
        ctx.fillStyle = (earId === 'panda' ? '#000' : col);
        ctx.beginPath(); ctx.arc(14, 9, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 9, 6, 0, Math.PI * 2); ctx.fill();
    }
}

// Draw eyes based on selected type (front only)
function drawEyes(ctx, eyeId, eyeCol) {
    // Helper for glint/shine
    const drawGlint = (x, y) => {
        ctx.fillStyle = 'white';
        ctx.fillRect(x, y, 2, 2); // 2x2 shine on 128 canvas
    };
    const shade = shadeColor(eyeCol, -0.3);

    if(eyeId==='blink'){
        ctx.strokeStyle='#39313e';ctx.lineWidth=1.5;ctx.lineCap='round';
        for(const x of [24,40]){ctx.beginPath();ctx.moveTo(x-4,24);ctx.quadraticCurveTo(x,26,x+4,24);ctx.stroke();}
    }
    else if (eyeId === 'standard') {
        // Sclera
        ctx.fillStyle = '#fff';
        ctx.fillRect(20, 18, 8, 10); ctx.fillRect(36, 18, 8, 10);
        // Top shadow
        ctx.fillStyle = '#ddd';
        ctx.fillRect(20, 18, 8, 2); ctx.fillRect(36, 18, 8, 2);
        // Iris
        ctx.fillStyle = eyeCol;
        ctx.fillRect(22, 22, 4, 6); ctx.fillRect(38, 22, 4, 6);
        drawGlint(23, 20); drawGlint(39, 20);
    }
    else if (eyeId === 'dragon') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(20, 18, 8, 10); ctx.fillRect(36, 18, 8, 10);
        ctx.fillStyle = '#ddd'; // Shadow
        ctx.fillRect(20, 18, 8, 2); ctx.fillRect(36, 18, 8, 2);
        ctx.fillStyle = eyeCol;
        // Slit pupil
        ctx.beginPath(); ctx.ellipse(24, 23, 2, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(40, 23, 2, 5, 0, 0, Math.PI * 2); ctx.fill();
        drawGlint(21, 19); drawGlint(37, 19);
    }
    else if (eyeId === 'frog') {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(19, 15, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(45, 15, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(19, 15, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(45, 15, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'cute') {
        // Big round cute eyes with extra shine
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(24, 21, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 21, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(24, 22, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 22, 5, 0, Math.PI * 2); ctx.fill();
        // Shine
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(22, 19, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(38, 19, 2.5, 0, Math.PI * 2); ctx.fill();
        drawGlint(26, 24); drawGlint(42, 24); // Double shine
    }
    else if (eyeId === 'sleepy') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(20, 20, 8, 6); ctx.fillRect(36, 20, 8, 6);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(23, 21, 4, 3); ctx.fillRect(39, 21, 4, 3);
        // Heavy Eyelids
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(20, 18, 8, 4); ctx.fillRect(36, 18, 8, 4);
    }
    else if (eyeId === 'angry') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(20, 18, 8, 8); ctx.fillRect(36, 18, 8, 8);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(24, 22, 4, 4); ctx.fillRect(40, 22, 4, 4);
        // Angry brows
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.moveTo(18, 16); ctx.lineTo(28, 20); ctx.lineTo(28, 18); ctx.lineTo(18, 14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(46, 16); ctx.lineTo(36, 20); ctx.lineTo(36, 18); ctx.lineTo(46, 14); ctx.fill();
    }
    else if (eyeId === 'cat_eyes') {
        ctx.fillStyle = '#ffffcc'; // Pale yellow
        ctx.beginPath(); ctx.arc(24, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.ellipse(24, 20, 2, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(40, 20, 2, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'sparkle') {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(24, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        // Big Stars
        const drawStar = (cx, cy) => {
            ctx.filter = `drop-shadow(0 0 2px ${eyeCol})`;
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                ctx.lineTo(cx + Math.cos((18 + i * 72) * Math.PI / 180) * 4, cy + Math.sin((18 + i * 72) * Math.PI / 180) * 4);
                ctx.lineTo(cx + Math.cos((54 + i * 72) * Math.PI / 180) * 2, cy + Math.sin((54 + i * 72) * Math.PI / 180) * 2);
            }
            ctx.closePath(); ctx.fill();
            ctx.filter = "none";
        };
        drawStar(24, 20); drawStar(40, 20);
    }
    else if (eyeId === 'dizzy') {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(24, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = eyeCol; ctx.lineWidth = 1.5;
        // Swirls
        const drawSwirl = (cx, cy) => {
            ctx.beginPath();
            for (let i = 0; i < 20; i++) {
                const r = i / 3;
                const a = i / 2;
                ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            }
            ctx.stroke();
        };
        drawSwirl(24, 20); drawSwirl(40, 20);
    }
    else if (eyeId === 'heart') {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(24, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff5555';
        const drawHeart = (cx, cy) => {
            ctx.beginPath();
            const topCurveHeight = 2;
            ctx.moveTo(cx, cy + 2);
            ctx.bezierCurveTo(cx, cy, cx - 3, cy - 3, cx - 3, cy - 1);
            ctx.bezierCurveTo(cx - 3, cy + 1.5, cx, cy + 3.5, cx, cy + 5);
            ctx.bezierCurveTo(cx, cy + 3.5, cx + 3, cy + 1.5, cx + 3, cy - 1);
            ctx.bezierCurveTo(cx + 3, cy - 3, cx, cy, cx, cy + 2);
            ctx.fill();
        };
        drawHeart(24, 18); drawHeart(40, 18);
    }
    else if (eyeId === 'x_eyes') {
        ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
        const s = 5;
        ctx.beginPath(); ctx.moveTo(24 - s, 20 - s); ctx.lineTo(24 + s, 20 + s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(24 + s, 20 - s); ctx.lineTo(24 - s, 20 + s); ctx.stroke();

        ctx.beginPath(); ctx.moveTo(40 - s, 20 - s); ctx.lineTo(40 + s, 20 + s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(40 + s, 20 - s); ctx.lineTo(40 - s, 20 + s); ctx.stroke();
    }
    else if (eyeId === 'dot') {
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(24, 20, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 3.5, 0, Math.PI * 2); ctx.fill();
        drawGlint(25, 19); drawGlint(41, 19);
    }
    else if (eyeId === 'protogen') {
        ctx.fillStyle = eyeCol;
        ctx.shadowColor = eyeCol; ctx.shadowBlur = 5;
        // Screens
        ctx.fillRect(18, 16, 12, 10); ctx.fillRect(34, 16, 12, 10);
        // Pixels inside
        ctx.fillStyle = '#003300';
        ctx.fillRect(22, 18, 4, 6); ctx.fillRect(38, 18, 4, 6);
        ctx.shadowBlur = 0;
    }
    else if (eyeId === 'wolf') {
        ctx.fillStyle = '#ffcc00'; // Amber eyes
        ctx.beginPath(); ctx.moveTo(16, 20); ctx.lineTo(24, 16); ctx.lineTo(28, 20); ctx.lineTo(24, 24); ctx.fill();
        ctx.beginPath(); ctx.moveTo(36, 20); ctx.lineTo(40, 16); ctx.lineTo(48, 20); ctx.lineTo(40, 24); ctx.fill();
        // Pupils
        ctx.fillStyle = eyeCol;
        ctx.fillRect(23, 19, 2, 4); ctx.fillRect(39, 19, 2, 4);
        // Angry brow
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.moveTo(16, 14); ctx.lineTo(28, 18); ctx.lineTo(28, 12); ctx.fill();
        ctx.beginPath(); ctx.moveTo(48, 14); ctx.lineTo(36, 18); ctx.lineTo(36, 12); ctx.fill();
    }
    else if (eyeId === 'owl') {
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath(); ctx.arc(22, 20, 9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 20, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(22, 20, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 20, 4, 0, Math.PI * 2); ctx.fill();
        drawGlint(20, 16); drawGlint(40, 16);
    }
    else if (eyeId === 'shark') {
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(22, 20, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 20, 4, 0, Math.PI * 2); ctx.fill();
        drawGlint(23, 19); drawGlint(43, 19);
    }
    else if (eyeId === 'snake') {
        ctx.fillStyle = '#ffffaa';
        ctx.beginPath(); ctx.ellipse(24, 20, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(40, 20, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.fillRect(23, 16, 2, 8); ctx.fillRect(39, 16, 2, 8);
    }
    else if (eyeId === 'tired') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(20, 20, 8, 5); ctx.fillRect(36, 20, 8, 5);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(23, 21, 2, 2); ctx.fillRect(39, 21, 2, 2);
        // Bags
        ctx.fillStyle = 'rgba(100,0,100,0.2)';
        ctx.beginPath(); ctx.arc(24, 26, 5, 0, Math.PI, false); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 26, 5, 0, Math.PI, false); ctx.fill();
    }
    else if (eyeId === 'wink') {
        ctx.fillStyle = '#fff'; ctx.fillRect(20, 18, 8, 8);
        ctx.fillStyle = eyeCol; ctx.fillRect(24, 22, 4, 4);
        drawGlint(25, 20);
        // Wink
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(36, 22); ctx.lineTo(44, 22); ctx.stroke();
    }
    else if (eyeId === 'crying') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(20, 18, 8, 8); ctx.fillRect(36, 18, 8, 8);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(24, 22, 4, 4); ctx.fillRect(40, 22, 4, 4);
        // Tears
        ctx.fillStyle = '#8cf';
        ctx.fillRect(20, 26, 8, 8); ctx.fillRect(36, 26, 8, 8);
    }
    else if (eyeId === 'star') {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(24, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        // Star pupil
        const drawStar = (cx, cy) => { ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = (i * 4 * Math.PI) / 5 - Math.PI / 2; ctx.lineTo(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3); } ctx.fill(); };
        drawStar(24, 20); drawStar(40, 20);
    }
    else if (eyeId === 'spiral') { /* Handled by dizzy */ }
    else if (eyeId === 'closed') {
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(24, 22, 5, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(40, 22, 5, Math.PI, 0); ctx.stroke();
    }
    else if (eyeId === 'wide') {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(24, 20, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(24, 20, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 2, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'beady') {
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(24, 22, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 22, 2.5, 0, Math.PI * 2); ctx.fill();
        drawGlint(25, 21); drawGlint(41, 21);
    }
    else if (eyeId === 'anime') {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(22, 20, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(42, 20, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade; // gradient top
        ctx.beginPath(); ctx.arc(22, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol; // bottom lighter
        ctx.beginPath(); ctx.arc(22, 23, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 23, 4, 0, Math.PI * 2); ctx.fill();
        drawGlint(19, 16); drawGlint(24, 22);
        drawGlint(39, 16); drawGlint(44, 22);
    }
    else if (eyeId === 'glasses') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(18, 18, 10, 8); ctx.fillRect(36, 18, 10, 8);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(22, 20, 4, 4); ctx.fillRect(40, 20, 4, 4);
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.strokeRect(16, 16, 14, 12); ctx.strokeRect(34, 16, 14, 12);
        ctx.beginPath(); ctx.moveTo(30, 22); ctx.lineTo(34, 22); ctx.stroke();
    }
    else if (eyeId === 'sunglasses') {
        ctx.fillStyle = '#111';
        ctx.fillRect(16, 16, 14, 10); ctx.fillRect(34, 16, 14, 10);
        // Reflection
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath(); ctx.moveTo(16, 16); ctx.lineTo(24, 26); ctx.lineTo(16, 26); ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.strokeRect(16, 16, 14, 10); ctx.strokeRect(34, 16, 14, 10);
        ctx.beginPath(); ctx.moveTo(30, 20); ctx.lineTo(34, 20); ctx.stroke();
    }
    else if (eyeId === 'monocle') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(20, 18, 8, 8); ctx.fillRect(36, 18, 8, 8);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(24, 20, 4, 4); ctx.fillRect(40, 20, 4, 4);
        ctx.strokeStyle = '#c9a000'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(40, 22, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(46, 26); ctx.lineTo(50, 34); ctx.stroke();
    }
    else if (eyeId === 'eyepatch') {
        ctx.fillStyle = '#fff'; ctx.fillRect(20, 18, 8, 8);
        ctx.fillStyle = eyeCol; ctx.fillRect(24, 20, 4, 4);
        // Patch
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(40, 22, 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(34, 18); ctx.lineTo(50, 10); ctx.stroke();
    }
    else if (eyeId === 'cross') {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(24, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = eyeCol; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(22, 20); ctx.lineTo(26, 20); ctx.moveTo(24, 18); ctx.lineTo(24, 22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(38, 20); ctx.lineTo(42, 20); ctx.moveTo(40, 18); ctx.lineTo(40, 22); ctx.stroke();
    }
    else if (eyeId === 'dollar') {
        ctx.fillStyle = '#44ff44';
        ctx.beginPath(); ctx.arc(24, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#006600';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('$', 21, 24); ctx.fillText('$', 37, 24);
    }
    else if (eyeId === 'fire') {
        // Gradient fire
        const grad = ctx.createLinearGradient(0, 15, 0, 25);
        grad.addColorStop(0, '#ffcc00'); grad.addColorStop(1, '#ff4400');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(24, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 5, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'galaxy') {
        ctx.fillStyle = '#220044';
        ctx.beginPath(); ctx.arc(24, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(22, 18, 1, 1); ctx.fillRect(38, 22, 1, 1);
    }
    else if (eyeId === 'robot') {
        ctx.fillStyle = '#0f0';
        ctx.fillRect(20, 18, 8, 8); ctx.fillRect(36, 18, 8, 8);
        ctx.fillStyle = '#003300';
        ctx.fillRect(20, 18, 8, 1); ctx.fillRect(20, 20, 8, 1); ctx.fillRect(20, 22, 8, 1);
        ctx.fillRect(36, 18, 8, 1); ctx.fillRect(36, 20, 8, 1); ctx.fillRect(36, 22, 8, 1);
    }
    else if (eyeId === 'demon') {
        ctx.fillStyle = '#a00';
        ctx.beginPath(); ctx.arc(24, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillRect(23, 17, 2, 6); ctx.fillRect(39, 17, 2, 6);
    }
    else if (eyeId === 'alien') {
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(22, 20, 7, 9, 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(42, 20, 7, 9, -0.2, 0, Math.PI * 2); ctx.fill();
        drawGlint(20, 16); drawGlint(40, 16);
    }
}

// Draw nose/mouth based on selected type (front only)
// noseCol is optional - if empty/null, uses per-nose-type defaults
function drawNose(ctx, noseId, bellyCol, noseCol) {
    // Helper to get color: use custom if provided, otherwise use default
    const getCol = (defaultColor) => (noseCol && noseCol !== '') ? noseCol : defaultColor;

    if (noseId === 'cat') {
        ctx.fillStyle = getCol('pink');
        ctx.beginPath(); ctx.moveTo(28, 28); ctx.lineTo(36, 28); ctx.lineTo(32, 33); ctx.fill();
    }
    else if (noseId === 'dog') {
        ctx.fillStyle = getCol('black');
        ctx.beginPath(); ctx.ellipse(32, 28, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(32, 30); ctx.lineTo(32, 34); ctx.stroke();
    }
    else if (noseId === 'bear') {
        ctx.fillStyle = getCol('#dcb');
        ctx.beginPath(); ctx.ellipse(32, 28, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.ellipse(32, 27, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    else if (noseId === 'pig') {
        ctx.fillStyle = getCol('#ffaaaa');
        ctx.beginPath(); ctx.ellipse(32, 29, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#cc6666';
        ctx.beginPath(); ctx.arc(30, 29, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(34, 29, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    else if (noseId === 'duck') {
        ctx.fillStyle = getCol('orange');
        ctx.beginPath(); ctx.ellipse(32, 30, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; // Nostrils
        ctx.fillRect(30, 29, 1, 1); ctx.fillRect(33, 29, 1, 1);
    }
    else if (noseId === 'dragon') {
        ctx.fillStyle = getCol(bellyCol || '#fff');
        ctx.fillRect(28, 26, 8, 6);
        ctx.fillStyle = 'black';
        ctx.fillRect(29, 28, 2, 2); ctx.fillRect(33, 28, 2, 2);
    }
    else if (noseId === 'mouse') {
        ctx.fillStyle = getCol('pink');
        ctx.beginPath(); ctx.arc(32, 30, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'black';
        ctx.fillRect(22, 30, 8, 0.5); ctx.fillRect(34, 30, 8, 0.5); // Thin Whiskers
    }
    else if (noseId === 'axolotl') {
        ctx.fillStyle = getCol('black');
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(32, 30, 4, 0, Math.PI, false); ctx.stroke();
        ctx.globalAlpha = 1;
    }
    else if (noseId === 'koala') {
        ctx.fillStyle = getCol('#333');
        ctx.beginPath(); ctx.ellipse(32, 26, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.ellipse(30, 24, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    else if (noseId === 'cow') {
        ctx.fillStyle = getCol('pink');
        // Round rect if supported, else rect with shading
        ctx.fillRect(24, 28, 16, 6);
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.arc(28, 30, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(36, 30, 2, 0, Math.PI * 2); ctx.fill();
    }
    else if (noseId === 'frog') {
        ctx.fillStyle = getCol('#003300');
        ctx.fillRect(24, 30, 16, 1);
    }
    else if (noseId === 'penguin') {
        ctx.fillStyle = getCol('orange');
        ctx.beginPath(); ctx.moveTo(28, 28); ctx.lineTo(36, 28); ctx.lineTo(32, 34); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.moveTo(32, 34); ctx.lineTo(32, 28); ctx.stroke();
    }
    else if (noseId === 'monkey') {
        ctx.fillStyle = getCol('#eec');
        ctx.beginPath(); ctx.ellipse(32, 29, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'black';
        ctx.fillRect(31, 28, 2, 1);
    }
    else if (noseId === 'protogen') {
        const col = getCol('#00ffff');
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 3;
        ctx.fillRect(24, 30, 16, 2);
        ctx.shadowBlur = 0;
    }
    else if (noseId === 'wolf') {
        ctx.fillStyle = getCol(bellyCol || '#ccc');
        ctx.fillRect(27, 26, 10, 8);
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.moveTo(28, 28); ctx.lineTo(36, 28); ctx.lineTo(32, 34); ctx.fill();
        // Side shading
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(26, 26, 1, 8); ctx.fillRect(37, 26, 1, 8);
    }
    else if (noseId === 'deer') {
        ctx.fillStyle = getCol('black');
        ctx.beginPath(); ctx.moveTo(28, 27); ctx.lineTo(36, 27); ctx.lineTo(32, 32); ctx.fill();
    }
    else if (noseId === 'owl' || noseId === 'bird') {
        ctx.fillStyle = getCol('#cc8800');
        ctx.beginPath(); ctx.moveTo(29, 27); ctx.lineTo(35, 27); ctx.lineTo(32, 34); ctx.fill();
    }
    else if (noseId === 'bat') {
        ctx.fillStyle = getCol('#666');
        ctx.beginPath(); ctx.ellipse(32, 28, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#333';
        ctx.fillRect(30, 28, 1, 2); ctx.fillRect(33, 28, 1, 2);
    }
    else if (noseId === 'shark') {
        ctx.fillStyle = getCol('#888');
        ctx.fillRect(28, 28, 8, 2);
        ctx.fillStyle = '#555'; // Gills
        for (let y = 26; y <= 30; y += 2) {
            ctx.fillRect(16, y, 4, 1); ctx.fillRect(44, y, 4, 1);
        }
    }
    else if (noseId === 'dolphin') {
        ctx.fillStyle = getCol(bellyCol || '#ccc');
        ctx.beginPath(); ctx.ellipse(32, 28, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.moveTo(26, 31); ctx.quadraticCurveTo(32, 33, 38, 31); ctx.stroke();
    }
    else if (noseId === 'snake') {
        ctx.fillStyle = getCol('#333');
        ctx.fillRect(31, 29, 2, 1);
        ctx.fillStyle = '#ff4466';
        ctx.fillRect(31, 30, 2, 4);
        ctx.fillRect(30, 34, 1, 2); ctx.fillRect(33, 34, 1, 2); // Fork
    }
    else if (noseId === 'tiger') {
        ctx.fillStyle = getCol('#e8a');
        ctx.beginPath(); ctx.moveTo(28, 28); ctx.lineTo(36, 28); ctx.lineTo(32, 33); ctx.fill();
        // Whiskers
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(20, 30); ctx.lineTo(28, 30); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(36, 30); ctx.lineTo(44, 30); ctx.stroke();
    }
    else if (noseId === 'rhino') {
        ctx.fillStyle = '#ddd';
        ctx.beginPath(); ctx.moveTo(30, 20); ctx.lineTo(34, 20); ctx.lineTo(32, 30); ctx.fill();
    }
    else if (noseId === 'elephant') {
        ctx.fillStyle = getCol(bellyCol || '#ccc');
        ctx.beginPath(); ctx.moveTo(28, 26); ctx.lineTo(36, 26); ctx.lineTo(34, 38); ctx.lineTo(30, 38); ctx.fill();
    }
    else if (noseId === 'zebra' || noseId === 'giraffe') {
        ctx.fillStyle = '#333';
        ctx.fillRect(28, 26, 8, 8);
    }
    else if (noseId === 'otter') {
        ctx.fillStyle = getCol('#333');
        ctx.fillRect(28, 28, 8, 4);
        // Whiskers
        ctx.fillStyle = '#000';
        ctx.fillRect(20, 30, 6, 1); ctx.fillRect(38, 30, 6, 1);
    }
    else if (noseId === 'beaver') {
        ctx.fillStyle = '#333';
        ctx.fillRect(29, 27, 6, 3);
        ctx.fillStyle = '#fff';
        ctx.fillRect(30, 30, 4, 3); ctx.fillStyle = '#ccc'; ctx.fillRect(31.5, 30, 1, 3);
    }
    else if (noseId === 'hedgehog') {
        ctx.fillStyle = getCol('#333');
        ctx.beginPath(); ctx.arc(32, 29, 3, 0, Math.PI * 2); ctx.fill();
    }
    else if (noseId === 'squirrel' || noseId === 'hamster') {
        ctx.fillStyle = getCol('pink');
        ctx.beginPath(); ctx.arc(32, 29, 3, 0, Math.PI * 2); ctx.fill();
    }
    else if (noseId === 'ferret') {
        ctx.fillStyle = getCol('pink');
        ctx.beginPath(); ctx.arc(32, 29, 3, 0, Math.PI * 2); ctx.fill();
    }
    else if (noseId === 'smile') {
        ctx.strokeStyle = getCol('#333'); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(32, 28, 5, 0.2, Math.PI - 0.2); ctx.stroke();
    }
    else if (noseId === 'blep') {
        ctx.fillStyle = getCol('pink');
        ctx.fillRect(30, 28, 4, 2);
        ctx.fillStyle = '#ff6688';
        ctx.beginPath(); ctx.arc(32, 31, 2, 0, Math.PI, false); ctx.fill();
    }
    else {
        // Fallback
        if (noseId && noseId !== 'none') {
            ctx.fillStyle = getCol('pink');
            ctx.fillRect(30, 28, 4, 2);
        }
    }
}

// Draw misc extras (wings, gills, mane, mask, etc.)
// Draw misc extras (wings, gills, mane, mask, etc.)
// col is the custom misc color.
// Accent / "misc" sprites share the body canvas: head x14-50 y8-36,
// torso x20-44 y28-68, face centre x32. Each piece is top-lit; the rim
// comes from the outline pass that runs in createSpeciesTexture().
function drawMisc(ctx, miscId, col, bellyCol, back, eyeCol = '#000000', protogenLogo = '') {
    if (!miscId || miscId === 'none') return;

    const dark  = shadeColor(col, -0.30);
    const mid   = shadeColor(col, -0.12);
    const light = shadeColor(col, 0.32);

    const blob = (x, y, rx, ry, rot = 0) => {
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill();
    };

    // A single wing, anchored at the shoulder and mirrored per side.
    const flap = (dir, kind) => {
        ctx.save();
        ctx.translate(dir < 0 ? 23 : 41, 33);
        ctx.scale(dir, 1);
        if (kind === 'angel') {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(12, -14, 22, -7);
            ctx.quadraticCurveTo(20, 3, 13, 13);
            ctx.quadraticCurveTo(9, 6, 5, 15);
            ctx.quadraticCurveTo(2, 7, 0, 0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(120,130,150,0.45)'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(2, 0);  ctx.quadraticCurveTo(10, -4, 22, -7);
            ctx.moveTo(2, 1);  ctx.quadraticCurveTo(8, 4, 13, 13);
            ctx.moveTo(2, 3);  ctx.quadraticCurveTo(4, 7, 5, 15);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            blob(12, -5, 6, 3, -0.5);
        } else {
            // Dragon / bat membrane.
            const bat = kind === 'bat';
            const tipX = bat ? 20 : 22, tipY = bat ? -8 : -11;
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(10, -13, tipX, tipY);
            ctx.quadraticCurveTo(17, 0, 15, 10);
            ctx.quadraticCurveTo(11, 2, 8, 11);
            ctx.quadraticCurveTo(5, 4, 2, 10);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = dark; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(1, 0); ctx.quadraticCurveTo(10, -9, 21, -9);
            ctx.moveTo(1, 0); ctx.quadraticCurveTo(9, 1, 15, 10);
            ctx.moveTo(1, 0); ctx.quadraticCurveTo(5, 3, 8, 11);
            ctx.moveTo(1, 0); ctx.quadraticCurveTo(2, 4, 2, 10);
            ctx.stroke();
            // arm bone + claw
            ctx.strokeStyle = kind === 'bat' ? mid : light;
            ctx.lineWidth = 2.2; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, 1);
            ctx.quadraticCurveTo(11, -12, 21, -8);
            ctx.stroke();
            ctx.fillStyle = kind === 'bat' ? mid : light;
            blob(21, -8, 1.7, 1.7);
        }
        ctx.restore();
    };

    // ------------------------------------------------------------------
    // WINGS - drawn on both views
    // ------------------------------------------------------------------
    if (miscId === 'dragon_wings') { flap(-1, 'dragon'); flap(1, 'dragon'); }
    else if (miscId === 'bat_wings') { flap(-1, 'bat'); flap(1, 'bat'); }
    else if (miscId === 'angel_wings') { flap(-1, 'angel'); flap(1, 'angel'); }

    else if (miscId === 'angel_wings') { flap(-1, 'angel'); flap(1, 'angel'); }

    // ------------------------------------------------------------------
    // FACE TUFT
    // ------------------------------------------------------------------
    else if (miscId === 'fox_cheeks') {
        if (back) return;
        for (let s = 0; s < 2; s++) {
            ctx.save();
            ctx.translate(s ? 48 : 16, 29);
            ctx.scale(s ? 1 : -1, 1);
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.quadraticCurveTo(11, -6, 14, 1);
            ctx.quadraticCurveTo(9, 6, 2, 12);
            ctx.quadraticCurveTo(-2, 6, 0, -6);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = light;
            ctx.beginPath();
            ctx.moveTo(1, -3);
            ctx.quadraticCurveTo(9, -3, 11, 1);
            ctx.quadraticCurveTo(6, 5, 2, 9);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    // ------------------------------------------------------------------
    // HEAD ACCENTS - drawn on both views
    // ------------------------------------------------------------------
    else if (miscId === 'axolotl_gills') {
        for (let s = 0; s < 2; s++) {
            ctx.save();
            ctx.translate(s ? 49 : 15, 15);
            ctx.scale(s ? 1 : -1, 1);
            for (let i = 0; i < 3; i++) {
                const yy = i * 5;
                const len = 12 - i * 2;
                ctx.fillStyle = i === 1 ? light : col;
                ctx.beginPath();
                ctx.moveTo(1, yy);
                ctx.quadraticCurveTo(len * 0.7, yy - 3, len, yy + 1);
                ctx.quadraticCurveTo(len * 0.7, yy + 4, 1, yy + 3);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = light;
                blob(len - 1.5, yy + 1, 2, 1.6, 0.3);
            }
            ctx.restore();
        }
    }
    else if (miscId === 'demon_horns') {
        for (let s = 0; s < 2; s++) {
            ctx.save();
            ctx.translate(s ? 40 : 24, 10);
            ctx.scale(s ? 1 : -1, 1);
            ctx.fillStyle = dark;
            ctx.beginPath();
            ctx.moveTo(-4, 2);
            ctx.quadraticCurveTo(-6, -13, 8, -17);
            ctx.quadraticCurveTo(3, -8, 4, 3);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = mid; ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(-2, -3); ctx.lineTo(4, -4);
            ctx.moveTo(-3, -8); ctx.lineTo(6, -10);
            ctx.stroke();
            ctx.fillStyle = light;
            blob(7, -15, 2, 2.3, 0.5);
            ctx.restore();
        }
    }
    else if (miscId === 'lion_mane') {
        const cx = 32, cy = 21, R = 22, spikes = 16, inner = 12;
        // Spiky outer ring with a hole so the face is never painted over.
        ctx.fillStyle = mid;
        ctx.beginPath();
        for (let i = 0; i <= spikes; i++) {
            const a = (i / spikes) * Math.PI * 2 - Math.PI / 2;
            const rr = (i % 2 === 0) ? R : R - 4;
            const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.moveTo(cx + inner, cy);
        ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
        ctx.fill('evenodd');

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, cy, R - 5, 0, Math.PI * 2);
        ctx.arc(cx, cy, inner + 1, 0, Math.PI * 2, true);
        ctx.fill('evenodd');

        ctx.fillStyle = light;
        for (let i = 0; i < spikes; i += 2) {
            const a = (i / spikes) * Math.PI * 2 - Math.PI / 2;
            blob(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2), 2.3, 2.3);
        }
    }
    else if (miscId === 'wolf_ruff') {
        for (let i = 0; i < 12; i++) {
            const t = i / 11;
            const x = 14 + t * 36;
            const h = 6 + Math.sin(t * Math.PI) * 7;
            ctx.fillStyle = (i % 2 === 0) ? mid : col;
            ctx.beginPath();
            ctx.moveTo(x - 3.5, 28);
            ctx.lineTo(x + 0.5, 28 + h);
            ctx.lineTo(x + 4.5, 28);
            ctx.closePath();
            ctx.fill();
        }
    }

    // ------------------------------------------------------------------
    // BACK-ONLY FINS & SPINES
    // ------------------------------------------------------------------
    else if (miscId === 'shark_fin') {
        if (!back) return;
        ctx.fillStyle = mid;
        ctx.beginPath();
        ctx.moveTo(23, 47);
        ctx.quadraticCurveTo(31, 15, 41, 47);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = light;
        ctx.beginPath();
        ctx.moveTo(29, 30);
        ctx.quadraticCurveTo(30, 22, 32, 19);
        ctx.quadraticCurveTo(31, 26, 31, 32);
        ctx.closePath();
        ctx.fill();
    }
    else if (miscId === 'dolphin_fin') {
        if (!back) return;
        ctx.fillStyle = mid;
        ctx.beginPath();
        ctx.moveTo(24, 47);
        ctx.quadraticCurveTo(27, 20, 33, 30);
        ctx.quadraticCurveTo(38, 38, 41, 47);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = light;
        ctx.beginPath();
        ctx.moveTo(28, 40);
        ctx.quadraticCurveTo(30, 28, 33, 30);
        ctx.quadraticCurveTo(32, 36, 31, 41);
        ctx.closePath();
        ctx.fill();
    }
    else if (miscId === 'hedgehog_spines') {
        if (!back) return;
        for (let row = 0; row < 3; row++) {
            const y = 18 + row * 9;
            for (let x = 17 + row * 2; x < 48; x += 4) {
                ctx.fillStyle = row % 2 === 0 ? '#8B4513' : '#7a3c10';
                ctx.beginPath();
                ctx.moveTo(x - 2, y + 8);
                ctx.lineTo(x, y - 4);
                ctx.lineTo(x + 2, y + 8);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#d9a066';
                ctx.beginPath();
                ctx.moveTo(x - 0.8, y + 1);
                ctx.lineTo(x, y - 4);
                ctx.lineTo(x + 0.8, y + 1);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    // ------------------------------------------------------------------
    // Species body markings - drawn on both views
    // ------------------------------------------------------------------
    else if (miscId === 'tiger_stripes') {
        const stripe = (x, y, len, w, lean) => {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(x + lean + w, y + len * 0.5, x, y + len);
            ctx.quadraticCurveTo(x + lean - w, y + len * 0.5, x, y);
            ctx.closePath();
            ctx.fill();
        };
        ctx.fillStyle = 'rgba(22,16,12,0.85)';
        stripe(20, 12, 13, 2.0, 3);
        stripe(32, 9, 13, 2.2, 0);
        stripe(44, 12, 13, 2.0, -3);
        stripe(22, 34, 18, 2.4, 4);
        stripe(42, 34, 18, 2.4, -4);
        stripe(26, 52, 12, 2.0, 3);
        stripe(38, 52, 12, 2.0, -3);
    }
    else if (miscId === 'leopard_spots') {
        ctx.strokeStyle = 'rgba(30,20,10,0.8)';
        ctx.lineWidth = 1.6;
        const rosette = (x, y, r) => {
            for (let i = 0; i < 3; i++) {
                const a = i * 2.1 + 0.4;
                ctx.beginPath();
                ctx.arc(x, y, r, a, a + 1.7);
                ctx.stroke();
            }
            ctx.fillStyle = 'rgba(30,20,10,0.45)';
            blob(x, y, 1.1, 1.1);
        };
        rosette(24, 38, 3.2); rosette(40, 36, 3.0);
        rosette(30, 50, 3.4); rosette(38, 52, 3.0);
        rosette(26, 61, 2.5);
    }
    else if (miscId === 'zebra_stripes') {
        ctx.fillStyle = '#141414';
        const band = (x, w, lean) => {
            ctx.beginPath();
            ctx.moveTo(x - w, 33);
            ctx.quadraticCurveTo(x + lean, 50, x - w + lean * 0.4, 66);
            ctx.lineTo(x + w + lean * 0.4, 66);
            ctx.quadraticCurveTo(x + lean, 50, x + w, 33);
            ctx.closePath();
            ctx.fill();
        };
        band(24, 3, 3);
        band(32, 3.4, 0);
        band(40, 3, -3);
    }
    else if (miscId === 'deer_spots') {
        const spot = (x, y, r) => {
            ctx.fillStyle = 'rgba(255,248,235,0.85)';
            blob(x, y, r, r);
            ctx.strokeStyle = 'rgba(120,90,60,0.22)'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.arc(x, y, r + 0.4, 0, Math.PI * 2); ctx.stroke();
        };
        spot(24, 38, 2.6); spot(40, 36, 2.4);
        spot(30, 48, 2.6); spot(38, 50, 2.2);
        spot(26, 59, 2.2); spot(37, 62, 2.0);
        if (!back) { spot(20, 26, 1.8); spot(44, 26, 1.8); }
    }
    else if (miscId === 'snake_scales') {
        ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
        for (let row = 0; row < 6; row++) {
            const y = 34 + row * 6;
            const off = (row % 2) * 3;
            for (let x = 21 + off; x < 45; x += 6) {
                ctx.beginPath();
                ctx.arc(x, y, 3, Math.PI, 0);
                ctx.stroke();
            }
        }
    }
    else if (miscId === 'owl_feathers') {
        for (let row = 0; row < 6; row++) {
            const y = 34 + row * 6;
            const off = (row % 2) * 4;
            for (let x = 21 + off; x <= 45; x += 8) {
                ctx.fillStyle = shadeColor(col, row % 2 ? -0.22 : 0.05);
                ctx.beginPath();
                ctx.moveTo(x - 4, y);
                ctx.quadraticCurveTo(x, y + 8, x + 4, y);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.7;
                ctx.stroke();
            }
        }
    }
    else if (miscId === 'skunk_stripe') {
        ctx.fillStyle = '#f6f2ea';
        if (back) {
            ctx.beginPath();
            ctx.moveTo(27, 9);
            ctx.quadraticCurveTo(30, 40, 27, 68);
            ctx.lineTo(37, 68);
            ctx.quadraticCurveTo(34, 40, 37, 9);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.moveTo(29, 12); ctx.quadraticCurveTo(31, 40, 29, 66);
            ctx.lineTo(32, 66); ctx.quadraticCurveTo(32, 40, 32, 12);
            ctx.closePath(); ctx.fill();
        } else {
            ctx.beginPath();
            ctx.moveTo(28, 8); ctx.lineTo(30, 18); ctx.lineTo(34, 18); ctx.lineTo(36, 8);
            ctx.closePath(); ctx.fill();
        }
    }

    // ------------------------------------------------------------------
    // FACE
    // ------------------------------------------------------------------
    else if (miscId === 'raccoon_mask') {
        if (back) return;
        ctx.fillStyle = 'rgba(40,34,36,0.92)';
        ctx.beginPath();
        ctx.moveTo(13, 17);
        ctx.quadraticCurveTo(32, 13, 51, 17);
        ctx.quadraticCurveTo(48, 29, 40, 30);
        ctx.quadraticCurveTo(35, 24, 32, 24);
        ctx.quadraticCurveTo(29, 24, 24, 30);
        ctx.quadraticCurveTo(16, 29, 13, 17);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(245,240,235,0.9)';
        ctx.beginPath();
        ctx.moveTo(30, 18);
        ctx.quadraticCurveTo(32, 34, 34, 18);
        ctx.closePath();
        ctx.fill();
    }
    else if (miscId === 'panda_patches') {
        if (back) return;
        ctx.fillStyle = '#141414';
        for (let s = 0; s < 2; s++) {
            ctx.save();
            ctx.translate(s ? 42 : 22, 21);
            ctx.rotate(s ? 0.35 : -0.35);
            blob(0, 0, 7, 8);
            ctx.restore();
        }
    }
    else if (miscId === 'protogen_visor') {
        // Side housings and fins, never a second visor over the face.
        for(const side of [-1,1]){
            const x=side<0?12:52;
            ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(x,17);ctx.lineTo(x+side*10,14);ctx.lineTo(x+side*6,24);ctx.closePath();ctx.fill();
            ctx.beginPath();ctx.ellipse(x,21,5,6,0,0,Math.PI*2);ctx.fill();
            ctx.fillStyle='#172633';ctx.beginPath();ctx.ellipse(x,21,4,5,0,0,Math.PI*2);ctx.fill();
            ctx.fillStyle=eyeCol;ctx.beginPath();ctx.ellipse(x,21,3,4,0,0,Math.PI*2);ctx.fill();
            if(typeof window!=='undefined')window.ProtogenLogo?.draw(ctx,protogenLogo,eyeCol,x,21,3,4);
        }
    }
    else if (miscId === 'freckles') {
        if (back) return;
        ctx.fillStyle = 'rgba(120,72,40,0.55)';
        [[19, 25], [23, 27], [21, 30], [45, 25], [41, 27], [43, 30], [26, 24], [38, 24]]
            .forEach(p => blob(p[0], p[1], 1.1, 1.1));
    }
    else if (miscId === 'blush') {
        if (back) return;
        ctx.save();
        ctx.filter = 'blur(1px)';
        ctx.fillStyle = 'rgba(255,105,150,0.45)';
        blob(18, 26, 5.5, 3.2);
        blob(46, 26, 5.5, 3.2);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,150,180,0.5)';
        blob(17, 25, 2.5, 1.5);
        blob(47, 25, 2.5, 1.5);
    }
    else if (miscId === 'scars') {
        if (back) return;
        const slash = (x1, y1, x2, y2) => {
            ctx.strokeStyle = 'rgba(155,95,95,0.85)'; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,225,215,0.85)'; ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(x1 + 0.5, y1 + 0.5); ctx.lineTo(x2 + 0.5, y2 + 0.5); ctx.stroke();
        };
        slash(17, 13, 24, 23);
        slash(20, 13, 25, 21);
        slash(41, 15, 45, 22);
    }
    else if (miscId === 'bandage') {
        if (back) return;
        ctx.save();
        ctx.translate(42, 21);
        ctx.rotate(-0.35);
        ctx.fillStyle = '#f3e6c8';
        ctx.beginPath(); ctx.roundRect(-8, -3.5, 16, 7, 3); ctx.fill();
        ctx.fillStyle = '#e6d2a8';
        ctx.beginPath(); ctx.roundRect(-3.5, -2.6, 7, 5.2, 1.5); ctx.fill();
        ctx.fillStyle = 'rgba(150,130,95,0.7)';
        for (let i = -6; i <= 6; i += 3) { blob(i, 0, 0.6, 0.6); }
        ctx.restore();
    }
    else if (miscId === 'whiskers_long') {
        if (back) return;
        ctx.strokeStyle = 'rgba(245,245,245,0.85)';
        ctx.lineWidth = 1; ctx.lineCap = 'round';
        for (let s = 0; s < 2; s++) {
            ctx.save();
            ctx.translate(s ? 44 : 20, 26);
            ctx.scale(s ? 1 : -1, 1);
            for (let i = 0; i < 3; i++) {
                const dy = (i - 1) * 5;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(9, dy * 0.5, 17, dy);
                ctx.stroke();
            }
            ctx.restore();
        }
        ctx.fillStyle = 'rgba(80,60,50,0.6)';
        for (let i = 0; i < 3; i++) {
            blob(27 + i * 2, 29, 0.7, 0.7);
            blob(37 - i * 2, 29, 0.7, 0.7);
        }
    }

    // ------------------------------------------------------------------
    // BELLY & CHEEKS
    // ------------------------------------------------------------------
    else if (miscId === 'penguin_belly') {
        if (back) {
            ctx.fillStyle = 'rgba(20,22,30,0.92)';
            blob(32, 48, 12, 20);
        } else {
            ctx.fillStyle = bellyCol || '#fdfbf4';
            blob(32, 47, 10, 16);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            blob(28, 40, 4, 8, 0.2);
        }
    }
    else if (miscId === 'otter_belly') {
        if (back) return;
        ctx.fillStyle = bellyCol || 'rgba(255,245,225,0.95)';
        blob(32, 47, 10, 15);
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        blob(36, 50, 5, 9);
    }
    else if (miscId === 'squirrel_cheeks' || miscId === 'hamster_cheeks') {
        if (back) return;
        const big = miscId === 'hamster_cheeks';
        for (let s = 0; s < 2; s++) {
            const cx = s ? 47 : 17;
            const r = big ? 7.5 : 6.5;
            ctx.fillStyle = col;
            blob(cx, 27, r, r * 0.92);
            ctx.fillStyle = light;
            blob(cx + (s ? -2 : 2), 24, r * 0.45, r * 0.35);
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            blob(cx, 30, r * 0.7, r * 0.4);
        }
    }

    // ------------------------------------------------------------------
    // ABOVE THE HEAD
    // ------------------------------------------------------------------
    else if (miscId === 'halo') {
        ctx.save();
        ctx.shadowColor = 'rgba(255,220,60,0.9)';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#f5c518';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(32, -3, 13, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,205,0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(32, -4, 13, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }
}

// Draw tail (back view only)
function drawTail(ctx, tailId, col, bellyCol, back) {
    if (!back || tailId === 'none') return;

    // VISUAL UPGRADES: Gradients, better shapes
    const shadow = shadeColor(col, -0.2);

    // Gradient for tail
    const grad = ctx.createLinearGradient(0, 40, 0, 60);
    grad.addColorStop(0, col);
    grad.addColorStop(1, shadow);

    ctx.fillStyle = grad;
    // Add subtle outline to all tails for visibility
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;

    // Tails draw at back of body (moved up to avoid ground clipping)
    if (tailId === 'cat') {
        ctx.beginPath(); ctx.moveTo(32, 48);
        ctx.quadraticCurveTo(28, 55, 34, 60);
        ctx.quadraticCurveTo(38, 55, 36, 48);
        ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'bunny') {
        ctx.fillStyle = bellyCol || '#fff';
        ctx.beginPath(); ctx.arc(32, 52, 7, 0, Math.PI * 2); ctx.fill();
        ctx.stroke();
        // Fluff detail
        ctx.fillStyle = '#eee';
        ctx.beginPath(); ctx.arc(32, 50, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (tailId === 'dog') {
        // Upward wagging
        ctx.beginPath(); ctx.moveTo(28, 50); ctx.lineTo(38, 40); ctx.lineTo(42, 43); ctx.lineTo(32, 55); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'bear') {
        ctx.beginPath(); ctx.arc(32, 52, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'fox') {
        // Big fluffy fox tail
        ctx.beginPath();
        ctx.moveTo(28, 46);
        ctx.quadraticCurveTo(10, 40, 8, 48);
        ctx.quadraticCurveTo(6, 56, 20, 54);
        ctx.lineTo(28, 50);
        ctx.fill(); ctx.stroke();
        // White tip
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.moveTo(8, 46);
        ctx.quadraticCurveTo(4, 48, 8, 52);
        ctx.quadraticCurveTo(12, 50, 10, 47);
        ctx.fill();
    }
    else if (tailId === 'pig') {
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(36, 50, 4, 0, Math.PI * 1.5); ctx.stroke();
    }
    else if (tailId === 'dragon') {
        ctx.fillStyle = '#ddd';
        ctx.beginPath(); ctx.moveTo(28, 48); ctx.lineTo(32, 62); ctx.lineTo(36, 48); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'mouse') {
        ctx.strokeStyle = 'pink'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(32, 48); ctx.quadraticCurveTo(40, 56, 30, 62); ctx.stroke();
    }
    else if (tailId === 'duck') {
        ctx.beginPath(); ctx.moveTo(26, 50); ctx.lineTo(32, 45); ctx.lineTo(38, 50); ctx.lineTo(32, 53); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'axolotl') {
        ctx.fillStyle = '#ff69b4';
        ctx.beginPath(); ctx.moveTo(28, 48); ctx.lineTo(26, 58); ctx.lineTo(38, 58); ctx.lineTo(36, 48); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff8da1'; ctx.fillRect(30, 50, 4, 6);
    }
    else if (tailId === 'raccoon') {
        ctx.fillStyle = '#999';
        ctx.fillRect(28, 48, 8, 12); ctx.strokeRect(28, 48, 8, 12);
        ctx.fillStyle = '#333';
        ctx.fillRect(28, 50, 8, 3); ctx.fillRect(28, 55, 8, 3);
    }
    else if (tailId === 'lion') {
        ctx.beginPath(); ctx.moveTo(31, 48); ctx.lineTo(31, 58); ctx.lineTo(33, 58); ctx.lineTo(33, 48); ctx.fill();
        ctx.fillStyle = '#a0522d';
        ctx.beginPath(); ctx.arc(32, 60, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'monkey') {
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(32, 48); ctx.quadraticCurveTo(45, 52, 42, 60); ctx.quadraticCurveTo(40, 65, 46, 62); ctx.stroke();
    }
    else if (tailId === 'penguin') {
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.moveTo(28, 50); ctx.lineTo(32, 56); ctx.lineTo(36, 50); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'frog') {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath(); ctx.arc(26, 52, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(38, 52, 3, 0, Math.PI * 2); ctx.fill();
    }
    else if (tailId === 'protogen') {
        ctx.fillStyle = '#333';
        ctx.fillRect(28, 48, 8, 12);
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(30, 50, 4, 8);
    }

    // --- NEW TAIL TYPES ---
    else if (tailId === 'wolf') {
        // Bushy wolf tail
        ctx.beginPath();
        ctx.moveTo(26, 48);
        ctx.quadraticCurveTo(20, 45, 18, 52);
        ctx.quadraticCurveTo(16, 58, 26, 56);
        ctx.lineTo(38, 56);
        ctx.quadraticCurveTo(40, 52, 38, 48);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'deer') {
        // Short deer tail
        ctx.fillRect(30, 50, 4, 6);
        ctx.strokeRect(30, 50, 4, 6);
    }
    else if (tailId === 'owl') {
        // Feathered owl tail
        ctx.beginPath(); ctx.moveTo(26, 50); ctx.lineTo(32, 60); ctx.lineTo(38, 50); ctx.fill();
        ctx.beginPath(); ctx.moveTo(28, 52); ctx.lineTo(32, 58); ctx.lineTo(36, 52); ctx.stroke();
    }
    else if (tailId === 'bat') {
        // Bat wing-like tail
        ctx.beginPath(); ctx.moveTo(28, 50); ctx.lineTo(24, 58); ctx.lineTo(32, 54); ctx.lineTo(40, 58); ctx.lineTo(36, 50); ctx.fill();
    }
    else if (tailId === 'shark') {
        // Shark tail fin
        ctx.beginPath(); ctx.moveTo(26, 52); ctx.lineTo(20, 48); ctx.lineTo(20, 58); ctx.lineTo(26, 54); ctx.fill();
        ctx.beginPath(); ctx.moveTo(38, 52); ctx.lineTo(44, 48); ctx.lineTo(44, 58); ctx.lineTo(38, 54); ctx.fill();
    }
    else if (tailId === 'dolphin') {
        // Horizontal dolphin fluke
        ctx.beginPath(); ctx.moveTo(28, 54); ctx.lineTo(16, 50); ctx.lineTo(16, 58); ctx.fill();
        ctx.beginPath(); ctx.moveTo(36, 54); ctx.lineTo(48, 50); ctx.lineTo(48, 58); ctx.fill();
    }
    else if (tailId === 'snake') {
        // Long serpentine tail
        ctx.strokeStyle = col; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.quadraticCurveTo(40, 56, 32, 62); ctx.quadraticCurveTo(24, 68, 32, 74); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.quadraticCurveTo(40, 56, 32, 62); ctx.stroke();
    }
    else if (tailId === 'tiger') {
        // Striped tiger tail
        ctx.fillRect(28, 48, 8, 12); ctx.strokeRect(28, 48, 8, 12);
        ctx.fillStyle = '#222';
        ctx.fillRect(28, 50, 8, 2); ctx.fillRect(28, 54, 8, 2); ctx.fillRect(28, 58, 8, 2);
    }
    else if (tailId === 'leopard') {
        // Spotted leopard tail
        ctx.fillRect(28, 48, 8, 12); ctx.strokeRect(28, 48, 8, 12);
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(30, 52, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(34, 56, 2, 0, Math.PI * 2); ctx.fill();
    }
    else if (tailId === 'rhino') {
        // Short rhino tail
        ctx.fillRect(30, 52, 4, 6);
        ctx.strokeRect(30, 52, 4, 6);
    }
    else if (tailId === 'elephant') {
        // Thin elephant tail with tuft
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.lineTo(32, 62); ctx.stroke();
        ctx.fillStyle = '#444';
        ctx.beginPath(); ctx.arc(32, 64, 3, 0, Math.PI * 2); ctx.fill();
    }
    else if (tailId === 'hippo') {
        // Stubby hippo tail
        ctx.fillRect(30, 52, 4, 4);
        ctx.strokeRect(30, 52, 4, 4);
    }
    else if (tailId === 'giraffe') {
        // Tufted giraffe tail
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.lineTo(32, 60); ctx.stroke();
        ctx.fillStyle = '#8B4513';
        ctx.beginPath(); ctx.arc(32, 62, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (tailId === 'zebra') {
        // Striped zebra tail with tuft
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.lineTo(32, 58); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(32, 60, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillRect(30, 58, 1, 4); ctx.fillRect(33, 58, 1, 4);
    }
    else if (tailId === 'panda') {
        // Short panda tail
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(32, 52, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (tailId === 'red_panda') {
        // Ringed red panda tail
        ctx.fillRect(28, 48, 8, 14); ctx.strokeRect(28, 48, 8, 14);
        ctx.fillStyle = '#cc6600';
        ctx.fillRect(28, 50, 8, 2); ctx.fillRect(28, 54, 8, 2); ctx.fillRect(28, 58, 8, 2);
    }
    else if (tailId === 'skunk') {
        // Bushy skunk tail with stripe
        ctx.beginPath();
        ctx.moveTo(24, 48);
        ctx.quadraticCurveTo(16, 38, 20, 32);
        ctx.quadraticCurveTo(32, 28, 44, 32);
        ctx.quadraticCurveTo(48, 38, 40, 48);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(30, 32, 4, 18);
    }
    else if (tailId === 'otter') {
        // Flat paddle otter tail
        ctx.beginPath();
        ctx.ellipse(32, 56, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'beaver') {
        // Flat beaver tail
        ctx.beginPath();
        ctx.ellipse(32, 56, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // Scale pattern
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5;
        for (let y = 52; y < 60; y += 2) {
            ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(40, y); ctx.stroke();
        }
    }
    else if (tailId === 'hedgehog') {
        // Stubby hedgehog tail
        ctx.beginPath(); ctx.arc(32, 52, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'squirrel') {
        // Big fluffy squirrel tail
        ctx.beginPath();
        ctx.moveTo(28, 48);
        ctx.quadraticCurveTo(16, 40, 18, 30);
        ctx.quadraticCurveTo(32, 24, 46, 30);
        ctx.quadraticCurveTo(48, 40, 36, 48);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'chipmunk') {
        // Striped chipmunk tail
        ctx.fillRect(28, 46, 8, 12); ctx.strokeRect(28, 46, 8, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(30, 46, 2, 12); ctx.fillRect(34, 46, 2, 12);
    }
    else if (tailId === 'hamster') {
        // Tiny hamster tail
        ctx.beginPath(); ctx.arc(32, 52, 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'chinchilla') {
        // Fluffy chinchilla tail
        ctx.beginPath();
        ctx.moveTo(28, 48);
        ctx.quadraticCurveTo(24, 52, 26, 58);
        ctx.quadraticCurveTo(32, 62, 38, 58);
        ctx.quadraticCurveTo(40, 52, 36, 48);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'ferret') {
        // Long thin ferret tail
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.quadraticCurveTo(38, 56, 34, 64); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.quadraticCurveTo(38, 56, 34, 64); ctx.stroke();
    }
    else if (tailId === 'peacock') {
        // Colorful peacock feathers
        ctx.fillStyle = '#00aa44';
        ctx.beginPath();
        ctx.moveTo(24, 48);
        ctx.quadraticCurveTo(10, 30, 14, 20);
        ctx.lineTo(32, 28);
        ctx.lineTo(50, 20);
        ctx.quadraticCurveTo(54, 30, 40, 48);
        ctx.closePath();
        ctx.fill();
        // Eye spots
        ctx.fillStyle = '#0066aa';
        ctx.beginPath(); ctx.arc(22, 30, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(32, 26, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 30, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(22, 30, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(32, 26, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 30, 2, 0, Math.PI * 2); ctx.fill();
    }
    else if (tailId === 'mermaid') {
        // Mermaid fish tail
        ctx.fillStyle = '#00ccaa';
        ctx.beginPath();
        ctx.moveTo(28, 50);
        ctx.lineTo(24, 56);
        ctx.lineTo(10, 52);
        ctx.lineTo(10, 60);
        ctx.lineTo(24, 56);
        ctx.lineTo(28, 62);
        ctx.lineTo(36, 62);
        ctx.lineTo(40, 56);
        ctx.lineTo(54, 60);
        ctx.lineTo(54, 52);
        ctx.lineTo(40, 56);
        ctx.lineTo(36, 50);
        ctx.closePath();
        ctx.fill();
        // Scales
        ctx.strokeStyle = 'rgba(0,100,80,0.4)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(32, 54, 4, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(28, 58, 3, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(36, 58, 3, 0, Math.PI * 2); ctx.stroke();
    }
}

// Open-mouth frame for the chat "talking" animation, drawn on the same canvas
// as the rest of the character. It sits just under the nose and over the top
// edge of the shirt, so it stays readable on every species. Only the front
// texture gets it; back views never talk.
function drawTalkingMouth(ctx,shape='ah') {
    const profile=TALK_MOUTH_SHAPES.find(v=>v.name===shape)||TALK_MOUTH_SHAPES[0],cx=32,cy=33;
    ctx.save();ctx.fillStyle='#2a0d13';ctx.strokeStyle='rgba(16,3,7,.9)';ctx.lineWidth=.8;
    ctx.beginPath();ctx.ellipse(cx,cy,profile.rx,profile.ry,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.clip();
    if(profile.teeth){ctx.fillStyle='#fff0d8';ctx.fillRect(cx-profile.rx,cy-profile.ry,profile.rx*2,profile.ry*.75);}
    ctx.fillStyle='#ff8fa1';ctx.beginPath();ctx.ellipse(cx,cy+profile.ry*.65,profile.rx*.65,profile.ry*.4,0,0,Math.PI*2);ctx.fill();ctx.restore();
}

// Main drawing function - accepts either species string (legacy) or parts object
// partColors is optional: { earsColor, noseColor, miscColor, tailColor }
function drawProtogenFace(ctx, eyeCol, closed=false, mouthOpen=false, mouth=true, fullScreen=false) {
    ctx.save();
    // Solid visor geometry needs dark ink across its entire face UV, including corners.
    if(fullScreen){ctx.fillStyle='#101923';ctx.fillRect(16,8,32,26);}
    // One dark screen covers the normal eyes and muzzle.
    ctx.fillStyle='#101923';ctx.strokeStyle='#43566c';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(20,11);ctx.quadraticCurveTo(32,6,44,11);
    ctx.quadraticCurveTo(50,19,48,29);ctx.quadraticCurveTo(45,35,32,36);
    ctx.quadraticCurveTo(19,35,16,29);ctx.quadraticCurveTo(14,19,20,11);ctx.fill();ctx.stroke();
    ctx.strokeStyle=eyeCol;ctx.fillStyle=eyeCol;ctx.lineWidth=2;ctx.lineCap='round';
    for(const x of [23,41]){
        ctx.beginPath();ctx.moveTo(x-4,closed?22:23);
        ctx.lineTo(x,closed?22:18);ctx.lineTo(x+4,closed?22:23);ctx.stroke();
    }
    if(mouth){
        ctx.beginPath();
        if(mouthOpen)ctx.ellipse(32,30,6,3,0,0,Math.PI*2);
        else {ctx.moveTo(23,29);ctx.lineTo(27,31);ctx.lineTo(32,29);ctx.lineTo(37,31);ctx.lineTo(41,29);}
        ctx.stroke();
    }
    ctx.restore();
}
function drawSpecies(ctx, speciesOrParts, col, bellyCol, eyeCol, back, partColors, eyesClosed=false, earsOnly=false, skinOnly=false) {
    if(!earsOnly)ctx.clearRect(0, -30, 64, 105); // Clear full area including big ears/hats

    // Determine if we're using legacy species or new parts system
    let parts;
    if (typeof speciesOrParts === 'string') {
        // Legacy: map species to parts for NPC compatibility
        const speciesMapping = {
            cat: { ears: 'cat', eyes: 'standard', nose: 'cat', misc: 'none', tail: 'cat' },
            bunny: { ears: 'bunny', eyes: 'standard', nose: 'cat', misc: 'none', tail: 'bunny' },
            dog: { ears: 'dog', eyes: 'standard', nose: 'dog', misc: 'none', tail: 'dog' },
            bear: { ears: 'bear', eyes: 'standard', nose: 'bear', misc: 'none', tail: 'bear' },
            fox: { ears: 'fox', eyes: 'standard', nose: 'dog', misc: 'fox_cheeks', tail: 'fox' },
            pig: { ears: 'pig', eyes: 'standard', nose: 'pig', misc: 'none', tail: 'pig' },
            dragon: { ears: 'dragon', eyes: 'dragon', nose: 'dragon', misc: 'dragon_wings', tail: 'dragon' },
            mouse: { ears: 'mouse', eyes: 'standard', nose: 'mouse', misc: 'none', tail: 'mouse' },
            duck: { ears: 'none', eyes: 'standard', nose: 'duck', misc: 'none', tail: 'duck' },
            axolotl: { ears: 'none', eyes: 'standard', nose: 'axolotl', misc: 'axolotl_gills', tail: 'axolotl' },
            raccoon: { ears: 'raccoon', eyes: 'standard', nose: 'dog', misc: 'raccoon_mask', tail: 'raccoon' },
            koala: { ears: 'koala', eyes: 'standard', nose: 'koala', misc: 'none', tail: 'none' },
            lion: { ears: 'cat', eyes: 'standard', nose: 'cat', misc: 'lion_mane', tail: 'lion' },
            cow: { ears: 'cow', eyes: 'standard', nose: 'cow', misc: 'none', tail: 'cat' },
            frog: { ears: 'none', eyes: 'frog', nose: 'frog', misc: 'none', tail: 'frog' },
            monkey: { ears: 'monkey', eyes: 'standard', nose: 'monkey', misc: 'none', tail: 'monkey' },
            penguin: { ears: 'none', eyes: 'standard', nose: 'penguin', misc: 'penguin_belly', tail: 'penguin' },
        };
        parts = speciesMapping[speciesOrParts] || speciesMapping.cat;
    } else {
        parts = speciesOrParts;
    }

    // Get part-specific colors (fall back to main fur color, except nose which has per-type defaults)
    const pc = partColors || {};
    const earsCol = pc.earsColor || col;
    const noseCol = pc.noseColor || '';  // Empty = use per-nose-type default
    const miscCol = pc.miscColor || col;
    const tailCol = pc.tailColor || col;

    if(earsOnly){drawEars(ctx,parts.ears,earsCol,bellyCol,back);return;}
    // Draw in correct order for proper layering
    drawBody(ctx, col, bellyCol, back);
    if(!skinOnly){
        drawTail(ctx, parts.tail, tailCol, bellyCol, back);
        drawMisc(ctx, parts.misc, miscCol, bellyCol, back, eyeCol,pc.protogenLogo);
        drawEars(ctx, parts.ears, earsCol, bellyCol, back);
    }else if(['tiger_stripes','leopard_spots','zebra_stripes','deer_spots','snake_scales','skunk_stripe','raccoon_mask','panda_patches','freckles','blush','scars','bandage','penguin_belly','otter_belly'].includes(parts.misc)){
        drawMisc(ctx,parts.misc,miscCol,bellyCol,back,eyeCol,pc.protogenLogo);
    }

    // Unified head lighting. The ears are drawn on top of the head, so without
    // this they miss the head's highlight/side-shade and leave a seam at the
    // join. Re-applying the exact same lighting over the whole sprite (clipped
    // to whatever pixels are already painted) makes same-coloured ears blend
    // seamlessly into the head. Skipped for the back view, which drawBody
    // leaves unlit.
    if (!back) applyHeadLighting(ctx);

    if (!back) {
        if(parts.nose==='protogen')drawProtogenFace(ctx,eyeCol,eyesClosed,false,!skinOnly,skinOnly);
        else drawEyes(ctx, eyesClosed?'blink':parts.eyes, eyeCol);
        if(!skinOnly&&parts.nose!=='protogen')drawNose(ctx, parts.nose, bellyCol, noseCol);
    }
}

function restorePants(saved){
    const valid=new Set(PANTS_TYPES.map(item=>item.id));
    saveState.unlockedPants=[...new Set(['none',...(Array.isArray(saved.unlockedPants)?saved.unlockedPants:[]).filter(id=>valid.has(id))])];
    saveState.currentPants=saveState.unlockedPants.includes(saved.currentPants)?saved.currentPants:'none';
}
function selectPants(id){
    const item=PANTS_TYPES.find(p=>p.id===id);if(!item)return false;
    if(!saveState.unlockedPants.includes(id)){
        if(item.event||!Number.isFinite(item.price)||item.price<0)return false;
        if(saveState.money<item.price){showToast('Not enough money!');return false;}
        saveState.money-=item.price;saveState.unlockedPants.push(id);Sound.sell();
    }
    saveState.currentPants=id;saveGame();updateLocalVisuals();renderShop();return true;
}
function paintPants(ctx,item){
    const color=item.color||'#53677d',accent=item.secondary||'#d6d3ba';
    ctx.fillStyle=color;ctx.fillRect(0,0,64,64);
    ctx.fillStyle=shadeColor(color,-.25);ctx.fillRect(0,0,64,6);ctx.fillRect(0,59,64,5);
    ctx.fillStyle=shadeColor(color,.2);for(const x of [1,31,62])ctx.fillRect(x,6,1,53);
    if(['jeans','ripped','chinos','linen','cargo'].includes(item.type)){
        ctx.strokeStyle=accent;ctx.lineWidth=1;for(const x of [4,36])ctx.strokeRect(x,10,17,12);
    }
    if(item.type==='cargo'){ctx.fillStyle=shadeColor(color,-.16);for(const x of [9,41]){ctx.fillRect(x,24,14,18);ctx.fillStyle=accent;ctx.fillRect(x,24,14,2);ctx.fillStyle=shadeColor(color,-.16);}}
    if(item.type==='ripped'){ctx.fillStyle='#cfbfa5';for(const x of [5,37]){ctx.fillRect(x,31,15,3);ctx.fillRect(x+4,39,10,2);}}
    if(['joggers','stars','harvest'].includes(item.type)){ctx.fillStyle=accent;for(const x of [14,46])ctx.fillRect(x,6,2,53);ctx.fillRect(0,56,64,2);}
    if(item.type==='stripes'){ctx.fillStyle=accent;for(let y=8;y<56;y+=12)ctx.fillRect(0,y,64,5);}
    if(item.type==='linen'){ctx.fillStyle=shadeColor(color,.12);for(let x=6;x<64;x+=8)ctx.fillRect(x,6,1,51);}
    if(item.type==='stars'){ctx.fillStyle=accent;for(let i=0;i<18;i++){const x=(i*23+7)%62,y=9+(i*13)%45;ctx.fillRect(x,y,2,2);if(i%4===0){ctx.fillRect(x-1,y+1,4,1);ctx.fillRect(x+1,y-1,1,4);}}}
    if(item.type==='ghost')for(const x of [-12,20,52]){ctx.fillStyle=accent;ctx.fillRect(x+4,25,16,15);ctx.fillRect(x+7,22,10,3);ctx.fillRect(x+4,39,4,4);ctx.fillRect(x+10,39,4,3);ctx.fillRect(x+16,39,4,4);ctx.fillStyle=color;ctx.fillRect(x+7,28,3,4);ctx.fillRect(x+14,28,3,4);}
    if(item.type==='pumpkin')for(const x of [-10,22,54]){ctx.fillStyle=accent;ctx.fillRect(x,26,20,15);ctx.fillRect(x+3,23,14,3);ctx.fillStyle='#8baf69';ctx.fillRect(x+9,19,3,5);ctx.fillStyle='#241c2e';ctx.fillRect(x+4,29,4,4);ctx.fillRect(x+13,29,4,4);ctx.fillRect(x+6,36,9,2);}
    if(item.type==='harvest'){ctx.fillStyle=accent;for(const x of [4,36]){ctx.fillRect(x,29,8,2);ctx.fillRect(x+3,26,2,8);}}
}
function createPantsTexture(item){
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    paintPants(canvas.getContext('2d'),item);const texture=new THREE.CanvasTexture(canvas);
    texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;return texture;
}
function drawPants(ctx,id,isBack){
    const item=PANTS_TYPES.find(p=>p.id===id);if(!item||id==='none')return;
    const texture=createPantsTexture(item);ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.fillStyle=item.color;ctx.fillRect(22,54,20,4);
    for(const x of [22,34])ctx.drawImage(texture.image,isBack?32:0,0,32,64,x,56,8,8);
    ctx.restore();texture.dispose();
}

function drawShirt(ctx, shirtId, isBack, bodyColor) {
    const shirt = SHIRT_TYPES.find(s => s.id === shirtId);
    if (!shirt || shirt.id === 'none') return;

    // BASE BODY FILL WITH SOFT SHADING GRADIENT
    const sCol = shirt.color || '#ffffff';
    const sGrad = ctx.createLinearGradient(0, 34, 0, 58);
    sGrad.addColorStop(0, shadeColor(sCol, 0.08));
    sGrad.addColorStop(1, shadeColor(sCol, -0.15));
    ctx.fillStyle = sGrad;
    ctx.fillRect(20, 34, 24, 24); // Body
    ctx.fillRect(18, 35, 28, 6);  // Shoulders

    // Subtle edge hemlines for realism & coherence
    ctx.fillStyle = shadeColor(sCol, -0.25);
    ctx.fillRect(20, 57, 24, 1.5); // Bottom hem
    ctx.fillRect(18, 40, 2, 2);   // Sleeve cuffs
    ctx.fillRect(44, 40, 2, 2);

    // --- TYPES LOGIC ---

    // 1. HOODIE
    if (shirt.type === 'hoodie') {
        if (!isBack) {
            // Drawstrings with metallic aglets
            ctx.fillStyle = '#e0e0e0';
            ctx.fillRect(29, 34, 1.5, 9);
            ctx.fillRect(33.5, 34, 1.5, 9);
            ctx.fillStyle = '#b0bec5'; // Metal tips
            ctx.fillRect(29, 42, 1.5, 2);
            ctx.fillRect(33.5, 42, 1.5, 2);

            // Kangaroo Pocket with curved opening seams
            ctx.fillStyle = shirt.secondary || shadeColor(sCol, -0.2);
            ctx.beginPath();
            ctx.moveTo(23, 57); ctx.lineTo(41, 57); ctx.lineTo(39, 45); ctx.lineTo(25, 45); ctx.closePath();
            ctx.fill();
            // Pocket lip highlight
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(25, 45, 14, 1);
        } else {
            // Resting Hood with fabric depth
            ctx.fillStyle = shirt.secondary || shadeColor(sCol, -0.2);
            ctx.beginPath();
            ctx.moveTo(21, 34); ctx.quadraticCurveTo(32, 54, 43, 34); ctx.fill();
            ctx.strokeStyle = shadeColor(sCol, -0.35); ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    // 2. CREW NECK
    else if (shirt.type === 'crew') {
        if (!isBack) {
            ctx.fillStyle = bodyColor; // Skin neck cut
            ctx.beginPath(); ctx.ellipse(32, 34, 5, 3.5, 0, 0, Math.PI); ctx.fill();
            // Ribbed collar rim
            ctx.strokeStyle = shadeColor(sCol, -0.25); ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.ellipse(32, 34, 5.5, 4, 0, 0, Math.PI); ctx.stroke();
        }
    }

    // 3. COLLARED (Polos & Button-ups)
    else if (shirt.type === 'collared') {
        if (!isBack) {
            // Placket line
            ctx.fillStyle = shadeColor(sCol, -0.25);
            ctx.fillRect(31, 34, 2, 14);
            // Tiny pearlescent buttons
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(32, 38, 1, 0, Math.PI * 2); ctx.arc(32, 43, 1, 0, Math.PI * 2); ctx.fill();
            // Folded crisp collar flaps
            ctx.fillStyle = shadeColor(sCol, 0.15);
            ctx.beginPath(); ctx.moveTo(25, 34); ctx.lineTo(32, 40); ctx.lineTo(28, 40); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(39, 34); ctx.lineTo(32, 40); ctx.lineTo(36, 40); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = shadeColor(sCol, -0.3); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(25, 34); ctx.lineTo(32, 40); ctx.lineTo(39, 34); ctx.stroke();
        }
    }

    // 4. SUIT / TUX
    else if (shirt.type === 'suit' || shirt.type === 'tux') {
        if (!isBack) {
            // Crisp white dress shirt V
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.moveTo(32, 34); ctx.lineTo(25, 49); ctx.lineTo(39, 49); ctx.closePath(); ctx.fill();

            // Suit lapels
            ctx.fillStyle = sCol;
            ctx.beginPath(); ctx.moveTo(20, 34); ctx.lineTo(26, 49); ctx.lineTo(20, 49); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(44, 34); ctx.lineTo(38, 49); ctx.lineTo(44, 49); ctx.closePath(); ctx.fill();

            if (shirt.type === 'suit') {
                // Red Silk Necktie
                ctx.fillStyle = '#b71c1c';
                ctx.beginPath(); ctx.moveTo(30.5, 34); ctx.lineTo(33.5, 34); ctx.lineTo(33, 47); ctx.lineTo(32, 49); ctx.lineTo(31, 47); ctx.closePath(); ctx.fill();
                // Tie knot
                ctx.fillStyle = '#d32f2f'; ctx.fillRect(30.5, 34, 3, 2.5);
                // Gold lapel pin
                ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(24, 40, 1.2, 0, Math.PI * 2); ctx.fill();
            } else {
                // Tuxedo black bowtie & satin buttons
                ctx.fillStyle = '#111111';
                // Bowtie wings
                ctx.beginPath(); ctx.moveTo(32, 36); ctx.lineTo(27, 34); ctx.lineTo(27, 38); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(32, 36); ctx.lineTo(37, 34); ctx.lineTo(37, 38); ctx.closePath(); ctx.fill();
                ctx.fillRect(31, 35, 2, 2); // Center knot
                // Studs
                ctx.fillStyle = '#333';
                ctx.beginPath(); ctx.arc(32, 41, 1, 0, Math.PI * 2); ctx.arc(32, 45, 1, 0, Math.PI * 2); ctx.fill();
            }
        }
    }

    // 5. STRIPED
    else if (shirt.type === 'striped') {
        ctx.fillStyle = shirt.secondary || 'rgba(255,255,255,0.45)';
        for (let i = 37; i < 57; i += 5) {
            ctx.fillRect(20, i, 24, 2.5);
        }
        if (!isBack) {
            ctx.fillStyle = bodyColor;
            ctx.beginPath(); ctx.ellipse(32, 34, 5, 3, 0, 0, Math.PI); ctx.fill();
        }
    }

    // 6. VERTICAL STRIPE (Referee / Pin-stripe)
    else if (shirt.type === 'vertical_stripe') {
        ctx.fillStyle = shirt.secondary || '#111111';
        for (let i = 23; i < 43; i += 5) {
            ctx.fillRect(i, 34, 2.5, 24);
        }
        if (!isBack) {
            ctx.fillStyle = bodyColor;
            ctx.beginPath(); ctx.ellipse(32, 34, 5, 3, 0, 0, Math.PI); ctx.fill();
        }
    }

    // 7. CHECKERED / PLAID
    else if (shirt.type === 'checkered') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (let i = 36; i < 58; i += 6) ctx.fillRect(20, i, 24, 2.5);
        for (let i = 22; i < 44; i += 6) ctx.fillRect(i, 34, 2.5, 24);
        // Accent overcheck line
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        for (let i = 39; i < 58; i += 6) ctx.fillRect(20, i, 24, 1);
        for (let i = 25; i < 44; i += 6) ctx.fillRect(i, 34, 1, 24);
    }

    // 8. OVERALLS
    else if (shirt.type === 'overalls') {
        ctx.fillStyle = shirt.under || '#ffffff';
        ctx.fillRect(20, 34, 24, 24); ctx.fillRect(18, 35, 28, 6);
        ctx.fillStyle = shirt.color || '#4682B4';
        ctx.fillRect(20, 47, 24, 11); // Trousers
        if (!isBack) {
            ctx.fillRect(23, 39, 18, 9); // Front bib
            ctx.fillRect(23, 34, 3, 10); ctx.fillRect(38, 34, 3, 10); // Straps
            // Golden brass buckles
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(23, 39, 3, 2.5); ctx.fillRect(38, 39, 3, 2.5);
            // Center chest pocket
            ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
            ctx.strokeRect(27, 43, 10, 5);
        } else {
            ctx.fillRect(23, 42, 18, 6);
            ctx.fillStyle = shirt.color;
            // Criss-cross straps
            ctx.beginPath(); ctx.moveTo(23, 34); ctx.lineTo(39, 45); ctx.lineTo(36, 45); ctx.lineTo(21, 34); ctx.fill();
            ctx.beginPath(); ctx.moveTo(41, 34); ctx.lineTo(25, 45); ctx.lineTo(28, 45); ctx.lineTo(43, 34); ctx.fill();
        }
    }

    // 9. LOGO TEE
    else if (shirt.type === 'logo') {
        if (!isBack) {
            ctx.fillStyle = bodyColor;
            ctx.beginPath(); ctx.ellipse(32, 34, 5, 3, 0, 0, Math.PI); ctx.fill();
            // Emblem graphic
            if (shirt.symbol === '🍌') {
                // Crisp Nano Banana graphic print
                ctx.fillStyle = '#ffe135';
                ctx.beginPath();
                ctx.moveTo(27, 47);
                ctx.quadraticCurveTo(32, 40, 37, 44);
                ctx.quadraticCurveTo(32, 43, 27, 47);
                ctx.fill();
                ctx.fillStyle = '#5d4037'; ctx.fillRect(36.5, 43.5, 1, 1);
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.font = '13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(shirt.symbol || '?', 32, 46);
            }
        }
    }

    // 10. CAMO
    else if (shirt.type === 'camo') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(24, 39, 4, 2.5, 0.4, 0, Math.PI * 2);
        ctx.ellipse(39, 43, 4, 3, -0.3, 0, Math.PI * 2);
        ctx.ellipse(28, 52, 3.5, 2, 0.2, 0, Math.PI * 2);
        ctx.ellipse(37, 51, 3, 2.5, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.ellipse(32, 45, 3, 2, 0, 0, Math.PI * 2);
        ctx.ellipse(23, 49, 2.5, 1.8, 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // 11. FLORAL / HAWAIIAN
    else if (shirt.type === 'floral') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        if (!isBack) {
            const drawHibiscus = (cx, cy) => {
                for (let a = 0; a < 5; a++) {
                    const ang = (a / 5) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.arc(cx + Math.cos(ang) * 2.2, cy + Math.sin(ang) * 2.2, 1.8, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(cx, cy, 1, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
            };
            drawHibiscus(25, 41); drawHibiscus(37, 44); drawHibiscus(28, 51);
            ctx.fillStyle = bodyColor;
            ctx.beginPath(); ctx.ellipse(32, 34, 5, 3, 0, 0, Math.PI); ctx.fill();
        }
    }

    // 12. SPECIALS
    else if (shirt.type === 'coat') {
        if (!isBack) {
            // Lab coat opening with pen in pocket
            ctx.fillStyle = '#37474f'; ctx.fillRect(31, 34, 2, 24);
            ctx.fillStyle = '#eceff1'; ctx.fillRect(23, 43, 6, 4); // Pocket
            ctx.strokeStyle = '#b0bec5'; ctx.strokeRect(23, 43, 6, 4);
            ctx.fillStyle = '#00bcd4'; ctx.fillRect(25, 41, 1.5, 3); // Pen
        }
    }
    else if (shirt.type === 'vest') {
        // High-vis safety vest with reflective silver and neon lime stripes
        ctx.fillStyle = '#76ff03'; ctx.fillRect(20, 39, 24, 2); ctx.fillRect(20, 48, 24, 2);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(20, 41, 24, 3); ctx.fillRect(20, 50, 24, 3);
        if (!isBack) {
            ctx.fillStyle = '#424242'; ctx.fillRect(31, 34, 2, 24); // Center zipper
        }
    }
    else if (shirt.type === 'chain') {
        if (!isBack) {
            // Shimmering Golden Cuban Chain with medallion
            ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(32, 34, 7, 0, Math.PI); ctx.stroke();
            ctx.strokeStyle = '#fff59d'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(32, 34, 6.8, 0, Math.PI); ctx.stroke();
            // Golden Dollar / Star pendant
            ctx.fillStyle = '#ffc107'; ctx.beginPath(); ctx.arc(32, 42, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.fillRect(31.5, 40.5, 1, 3);
        }
    }
    if(!isBack&&shirtId==='ht_hoodie'){
        ctx.fillStyle='#4d3a62';ctx.beginPath();ctx.arc(32,45,5,Math.PI,0);ctx.lineTo(37,52);ctx.lineTo(34,50);ctx.lineTo(32,52);ctx.lineTo(30,50);ctx.lineTo(27,52);ctx.closePath();ctx.fill();
        ctx.fillStyle='#b9e7bb';ctx.fillRect(29,44,2,2);ctx.fillRect(33,44,2,2);
    }
    if(shirtId==='ht_coat'){ctx.fillStyle='#eaa04c';ctx.fillRect(30.5,36,3,20);ctx.fillRect(20,55,24,2);}

}

function drawCollar(ctx, collarId, isBack) {
    const item = COLLAR_TYPES.find(c => c.id === collarId);
    if (!item || item.id === 'none') return;

    ctx.fillStyle = item.color;

    // --- BASIC / SPIKED / BELL ---
    if (item.type === 'basic' || item.type === 'spiked' || item.type === 'bell') {
        // Shaded leather collar band
        const cGrad = ctx.createLinearGradient(0, 34, 0, 38);
        cGrad.addColorStop(0, shadeColor(item.color, 0.2));
        cGrad.addColorStop(1, shadeColor(item.color, -0.3));
        ctx.fillStyle = cGrad;
        ctx.fillRect(20, 34, 24, 4);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(31, 34.5, 2, 3); // Metal buckle

        if (item.type === 'spiked') {
            // Chrome polished spikes
            for (let i = 20; i < 44; i += 4) {
                ctx.fillStyle = '#f5f5f5';
                ctx.beginPath();
                ctx.moveTo(i, 34); ctx.lineTo(i + 2, 30.5); ctx.lineTo(i + 4, 34); ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#9e9e9e'; // 3D spike shadow
                ctx.beginPath();
                ctx.moveTo(i + 2, 30.5); ctx.lineTo(i + 4, 34); ctx.lineTo(i + 2, 34); ctx.closePath();
                ctx.fill();
            }
        }
        else if (item.type === 'bell' && !isBack) {
            // Golden spherical jingle bell with slit & shine
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(32, 40, 3.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff59d';
            ctx.beginPath(); ctx.arc(31, 39, 1.2, 0, Math.PI * 2); ctx.fill(); // Highlight
            ctx.fillStyle = '#8b6508';
            ctx.beginPath(); ctx.arc(32, 41, 0.9, 0, Math.PI * 2); ctx.fill();
            ctx.fillRect(30.5, 41.5, 3, 0.8);
        }
    }

    // --- BOW TIE ---
    else if (item.type === 'bow') {
        if (!isBack) {
            const bCol = item.color || '#111';
            ctx.fillStyle = bCol;
            // Left & Right Wings with soft fabric fold
            ctx.beginPath(); ctx.moveTo(32, 36); ctx.lineTo(23, 31); ctx.lineTo(23, 41); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(32, 36); ctx.lineTo(41, 31); ctx.lineTo(41, 41); ctx.closePath(); ctx.fill();
            ctx.fillStyle = shadeColor(bCol, 0.25);
            ctx.fillRect(25, 34, 2, 4); ctx.fillRect(37, 34, 2, 4);
            // Center Knot
            ctx.fillStyle = shadeColor(bCol, -0.2);
            ctx.beginPath(); ctx.arc(32, 36, 3, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.fillStyle = item.color || '#111';
            ctx.fillRect(20, 35, 24, 2);
        }
    }

    // --- BANDANA ---
    else if (item.type === 'bandana') {
        const bdCol = item.color || '#ff4444';
        ctx.fillStyle = bdCol;
        ctx.fillRect(20, 34, 24, 3);
        if (!isBack) {
            // Pointed handkerchief with paisley dots
            ctx.beginPath(); ctx.moveTo(21, 37); ctx.lineTo(43, 37); ctx.lineTo(32, 50); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath(); ctx.arc(28, 41, 1, 0, Math.PI * 2); ctx.arc(36, 41, 1, 0, Math.PI * 2); ctx.arc(32, 45, 1, 0, Math.PI * 2); ctx.fill();
        }
    }

    // --- SCARF ---
    else if (item.type === 'scarf') {
        const scCol = item.color || '#00ccff';
        ctx.fillStyle = scCol;
        ctx.fillRect(19, 33, 26, 5); // Neck wrap
        ctx.fillStyle = shadeColor(scCol, -0.2);
        ctx.fillRect(19, 37, 26, 1.5); // Shadow
        if (!isBack) {
            // Cascading tail with fringes
            ctx.fillStyle = scCol;
            ctx.fillRect(35, 38, 7, 13);
            ctx.fillStyle = '#ffffff'; // Fringe tips
            for (let fx = 35; fx <= 41; fx += 2) ctx.fillRect(fx, 50, 1.5, 2);
        } else {
            ctx.fillStyle = shadeColor(scCol, -0.15);
            ctx.fillRect(37, 34, 4, 8);
        }
    }

    // --- PEARLS ---
    else if (item.type === 'pearls') {
        // Glowing iridescent pearl necklace
        for (let i = 20; i <= 44; i += 4) {
            const py = 36 + Math.sin(((i - 20) / 24) * Math.PI) * 2;
            // Drop shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath(); ctx.arc(i, py + 0.8, 2.2, 0, Math.PI * 2); ctx.fill();
            // Pearl body
            ctx.fillStyle = '#f8f9fa';
            ctx.beginPath(); ctx.arc(i, py, 2.2, 0, Math.PI * 2); ctx.fill();
            // Lustrous spec highlight
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(i - 0.7, py - 0.7, 0.9, 0, Math.PI * 2); ctx.fill();
        }
    }
}

// Painted torso pixels are indexed into the shared BodyPaint palette.
function drawBodyPaint(ctx, paint, back, customColor = '#ffffff', originX = 20, originY = 35, cellW = 1, cellH = 1) {
    const bp = typeof window !== 'undefined' ? window.BodyPaint : null;
    if (!bp || !paint) return;
    const normalized = bp.normalize(paint);
    if (!normalized) return;
    const custom = bp.normalizeColor(customColor);
    for (let y = 0; y < bp.height; y++) {
        for (let x = 0; x < bp.width; x++) {
            const ch = normalized[y * bp.width + x];
            if (ch === '.') continue;
            const color = ch === 'x' ? custom : bp.palette[parseInt(ch, 16)];
            if (!color) continue;
            ctx.fillStyle = color;
            ctx.fillRect(originX + x * cellW, originY + y * cellH, cellW, cellH);
        }
    }
}

// ---------------------------------------------------------------------------
// HAIR
//
// Authored against ONE shared head model so nothing drifts off the skull,
// buries the eyes, or damages the ears:
//
//     head box   x 14..50, y 8..36   (rounded, corner r=7)
//     crown top  y = 8
//     eyes       x 16..48, y 15..30  <- always kept clear
//     nose       x 24..40, y 24..34  <- always kept clear
//
// Two rules make that hold for EVERY species, including the ones with huge
// ears (dog's floppy ears reach x≈10/54, koala ≈5/59, monkey ≈5/59):
//
//   1. The crown cap is drawn through withHeadClip(), which clips it to the
//      head silhouette itself. Hair can therefore never land on an ear, no
//      matter how wide or tall that ear is.
//   2. Anything that deliberately sticks out (spikes, tails, long skirting,
//      afro puff) is drawn in a second, UNclipped pass that is confined to
//      y > SKIRT (below the ear line) or to a band above the ears' roots.
//
// The face is additionally protected by keeping the hairline at FACE = 15.
// ---------------------------------------------------------------------------
function drawHair(ctx, hairId, col, back) {
    if (!hairId || hairId === 'none') return;
    if (!HAIR_TYPES.find(h => h.id === hairId)) return;

    const base = col || '#ffffff';
    const lite = shadeColor(base, 0.30);
    const mid = shadeColor(base, 0.12);
    const dark = shadeColor(base, -0.24);

    // Shared landmarks.
    const TOP = 8;                       // crown
    const FACE = 15;                     // hairline: never below this on the face
    const XL = 14, XR = 50;              // head box sides
    // The drawn face box (eyes AND nose). drawSpecies paints the face before
    // the hair, and only the eyes are re-stamped afterwards - the nose is not.
    // So no hair may reach into this box or it buries a species' nose. Measured
    // across every species: noses span x 22..41.5 and reach as high as y 18
    // (koala), so hair is kept above NOSE_TOP or outboard of 22 / 41.5.
    const NOSE_TOP = 18;
    const NOSE_L = 22, NOSE_R = 41.5;
    const EYE_L = 19.5, EYE_R = 44.5;    // full eye + cheek keep-out width
    // Lowest y a crown/base fill may extend to while still clearing every nose.
    const CROWN_MAX = NOSE_TOP;
    // The lowest point any ear reaches. Above this line the ears occupy the
    // space beside the head, so hair must stay inside the skull; below it the
    // sides are clear and hair may hang out freely.
    const EAR_BOTTOM = 27;
    const SKIRT = EAR_BOTTOM;            // ear-safe threshold for side volumes

    // =======================================================================
    // helpers
    // =======================================================================
    // Head silhouette used as the hair clip. It is the head's rounded box with
    // the upper corners trimmed back, because that is exactly where every ear
    // attaches: cat/fox/wolf triangles, dog/fox floppy lobes, koala/mouse/
    // monkey circles and cow horns all grow out of x≈14 / x≈50 at y≈6..12.
    const traceHead = () => {
        const IN = 6;      // corner trim (x 14+6 = 20 .. 50-6 = 44 at the top)
        const y0 = TOP;    // crown
        const yOpen = TOP + 6;
        ctx.moveTo(XL + IN, y0);
        ctx.lineTo(XR - IN, y0);
        ctx.quadraticCurveTo(XR, y0, XR, yOpen);
        ctx.lineTo(XR, TOP + 28 - 7);
        ctx.quadraticCurveTo(XR, TOP + 28, XR - 7, TOP + 28);
        ctx.lineTo(XL + 7, TOP + 28);
        ctx.quadraticCurveTo(XL, TOP + 28, XL, TOP + 28 - 7);
        ctx.lineTo(XL, yOpen);
        ctx.quadraticCurveTo(XL, y0, XL + IN, y0);
        ctx.closePath();
    };
    const headPath = () => {
        ctx.beginPath();
        traceHead();
    };
    // Excludes a rectangle from the current clip: a huge rect minus the hole,
    // via the even-odd rule (points inside ONLY the hole have an even count).
    const clipOut = (x, y, w, h) => {
        ctx.beginPath();
        ctx.rect(-200, -200, 900, 900);
        ctx.rect(x, y, w, h);
        ctx.clip('evenodd');
    };
    const withHeadClip = (fn) => {
        ctx.save();
        headPath();
        ctx.clip();
        if (!back) {
            clipOut(EYE_L, NOSE_TOP, EYE_R - EYE_L, 64 - NOSE_TOP);
        }
        fn();
        ctx.restore();
    };
    // Unified continuous hair envelope:
    //  - Above the crown (y -18..8): stays within [topX0, topX1] between ears
    //  - Upper corners (y 8..13): curves smoothly to the head sides [14.5, 49.5]
    //  - Ear zone (y 13..skirtY): hugs the head [14.5, 49.5] inside floppy ears
    //  - Below ears (y skirtY..64): opens wide [2, 62] for curtains/tails/locks
    // Because it is ONE continuous region (not disjoint bands), spikes, buns,
    // pompadours, afros, curtains, and tails never get a gap or seam at y=8 or
    // y=27, and back view never gets a face hole punched out of the middle.
    const withHairEnvelope = (fn, topX0 = 20, topX1 = 44, skirtY = EAR_BOTTOM) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(topX0 + 1.5, -18);
        ctx.lineTo(topX1 - 1.5, -18);
        ctx.lineTo(topX1, TOP);
        ctx.quadraticCurveTo(XR - 0.5, TOP, XR - 0.5, TOP + 5);
        ctx.lineTo(XR - 0.5, skirtY);
        ctx.lineTo(62, skirtY);
        ctx.lineTo(62, 64);
        ctx.lineTo(2, 64);
        ctx.lineTo(2, skirtY);
        ctx.lineTo(XL + 0.5, skirtY);
        ctx.lineTo(XL + 0.5, TOP + 5);
        ctx.quadraticCurveTo(XL + 0.5, TOP, topX0, TOP);
        ctx.closePath();
        ctx.clip();
        if (!back) {
            // Punch out the eyes (x 19.5..44.5, y 18..28.5) and the nose/muzzle
            // (x 21..43, y 28.5..34). Below y=28.5 the sides (x 19.5..21 and
            // 43..44.5) stay open so hanging hair can overlap the torso edge
            // (x 20..44) with zero transparent gap for addSpriteOutline!
            clipOut(EYE_L, NOSE_TOP, EYE_R - EYE_L, 10.5);
            clipOut(21, 28.5, 22, 5.5);
        }
        fn();
        ctx.restore();
    };

    // Soft curved highlight ribbon across the crown.
    const sheen = (y = TOP + 2.5, x0 = 21, x1 = 43, h = 2.5) => {
        ctx.fillStyle = lite;
        ctx.beginPath();
        ctx.moveTo(x0, y + h);
        ctx.quadraticCurveTo(32, y - h * 0.7, x1, y + h);
        ctx.lineTo(x1, y);
        ctx.quadraticCurveTo(32, y - h * 1.5, x0, y);
        ctx.closePath();
        ctx.fill();
    };
    // Crown dome with a natural arched or contoured lower hairline instead of
    // a flat horizontal brick.
    const crownArch = (yLeft, yMid, yRight, inset = 0.5, fillCol = base) => {
        const x0 = XL + inset, x1 = XR - inset;
        ctx.fillStyle = fillCol;
        ctx.beginPath();
        ctx.moveTo(x0, yLeft);
        ctx.lineTo(x0, TOP + 5);
        ctx.quadraticCurveTo(x0, TOP, x0 + 5.5, TOP);
        ctx.lineTo(x1 - 5.5, TOP);
        ctx.quadraticCurveTo(x1, TOP, x1, TOP + 5);
        ctx.lineTo(x1, yRight);
        ctx.quadraticCurveTo(32, yMid, x0, yLeft);
        ctx.closePath();
        ctx.fill();
    };
    // Tapered side lock framing the outer temple/cheek (stays outside EYE_L..EYE_R).
    const sideLock = (side, yTop, yBot, w = 4.5, tipIn = 1, fillCol = base) => {
        ctx.fillStyle = fillCol;
        ctx.beginPath();
        const reach = (yBot > 28) ? 21 : Math.min(EYE_L, XL + 0.5 + w);
        const reachR = (yBot > 28) ? 43 : Math.max(EYE_R, XR - 0.5 - w);
        if (side < 0) {
            const x0 = XL + 0.5, x1 = reach;
            ctx.moveTo(x0, yTop);
            ctx.lineTo(x1, yTop);
            ctx.lineTo(x1, yBot - 3);
            ctx.quadraticCurveTo(x1, yBot, x0 + tipIn, yBot);
            ctx.quadraticCurveTo(x0, yBot - 1, x0, yBot - 4);
        } else {
            const x1 = XR - 0.5, x0 = reachR;
            ctx.moveTo(x0, yTop);
            ctx.lineTo(x1, yTop);
            ctx.lineTo(x1, yBot - 4);
            ctx.quadraticCurveTo(x1, yBot - 1, x1 - tipIn, yBot);
            ctx.quadraticCurveTo(x0, yBot, x0, yBot - 3);
        }
        ctx.closePath();
        ctx.fill();
    };

    // =======================================================================
    // MOHAWK — dedicated pass, kept identical to the approved box design.
    // =======================================================================
    if (hairId === 'mohawk') {
        const CX = 26, CW = 13, HDR_TOP = 0;
        ctx.save();
        ctx.fillStyle = base;
        ctx.fillRect(CX, HDR_TOP, CW, TOP - HDR_TOP + 1);
        ctx.fillStyle = lite;
        ctx.fillRect(CX + 3, HDR_TOP + 1, 7, TOP - HDR_TOP - 1);
        headPath(); ctx.clip();
        ctx.fillStyle = base;
        ctx.fillRect(CX, TOP, CW, back ? 26 : 9);
        ctx.fillStyle = lite;
        ctx.fillRect(CX + 3, TOP + 1, 7, back ? 21 : 7);
        ctx.restore();
        return;
    }

    // =======================================================================
    if (back) {
        // ---- BACK VIEW ----------------------------------------------------
        withHairEnvelope(() => {
            if (hairId === 'buzzed') {
                ctx.save();
                ctx.globalAlpha = 0.46;
                crownArch(26, 28, 26, 1, dark);
                ctx.globalAlpha = 0.22;
                ctx.fillStyle = dark;
                ctx.fillRect(XL + 2, 25, XR - XL - 4, 6);
                ctx.restore();

            } else if (hairId === 'pixie') {
                crownArch(26, 30, 26, 0.5, base);
                // Tapered V-points at the nape
                ctx.fillStyle = dark;
                ctx.beginPath();
                ctx.moveTo(22, 26); ctx.lineTo(28, 32); ctx.lineTo(32, 28);
                ctx.lineTo(36, 32); ctx.lineTo(42, 26); ctx.closePath(); ctx.fill();
                sheen(TOP + 3, 21, 43, 2.5);

            } else if (hairId === 'undercut') {
                // Faded lower back + thick textured mop overhanging above y=21
                ctx.save();
                ctx.globalAlpha = 0.34;
                ctx.fillStyle = dark;
                ctx.fillRect(XL + 1, 18, XR - XL - 2, 13);
                ctx.restore();
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(19, 19);
                ctx.lineTo(19, 8);
                ctx.quadraticCurveTo(32, 3, 45, 8);
                ctx.lineTo(45, 19);
                // Choppy overhang teeth
                ctx.lineTo(41, 21); ctx.lineTo(37, 19); ctx.lineTo(32, 22);
                ctx.lineTo(27, 19); ctx.lineTo(23, 21);
                ctx.closePath(); ctx.fill();
                sheen(TOP + 2, 22, 42, 2.5);

            } else if (hairId === 'slicked' || hairId === 'sidepart') {
                crownArch(28, 30, 28, 0.5, base);
                ctx.fillStyle = dark;
                ctx.fillRect(XL + 2, 27, XR - XL - 4, 3);
                if (hairId === 'slicked') {
                    // Combed-back vertical ridges
                    for (let sx = 20; sx <= 44; sx += 4) {
                        ctx.fillStyle = (sx % 8 === 0) ? dark : mid;
                        ctx.fillRect(sx, TOP + 2, 1.5, 17);
                    }
                } else {
                    ctx.fillStyle = dark;
                    ctx.fillRect(24, TOP + 1, 1.5, 14);
                }
                sheen(TOP + 3, 21, 43, 2);

            } else if (hairId === 'pompadour') {
                // High sculpted dome rising to y=2 + ducktail combed seams
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(XL + 1, 28);
                ctx.lineTo(XL + 1, 11);
                ctx.quadraticCurveTo(20, 1, 32, 1);
                ctx.quadraticCurveTo(44, 1, XR - 1, 11);
                ctx.lineTo(XR - 1, 28);
                ctx.quadraticCurveTo(32, 32, XL + 1, 28);
                ctx.closePath(); ctx.fill();
                // Ducktail center seam
                ctx.fillStyle = dark;
                ctx.fillRect(31.2, 16, 1.6, 14);
                sheen(5, 22, 42, 3);

            } else if (hairId === 'messy') {
                // Tousled crown + jagged feathered nape
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 27);
                ctx.lineTo(15, 11);
                ctx.lineTo(22, 5); ctx.lineTo(27, 8); ctx.lineTo(32, 4);
                ctx.lineTo(37, 8); ctx.lineTo(42, 5);
                ctx.lineTo(49, 11); ctx.lineTo(49, 27);
                ctx.lineTo(45, 32); ctx.lineTo(40, 28); ctx.lineTo(36, 33);
                ctx.lineTo(32, 29); ctx.lineTo(28, 33); ctx.lineTo(24, 28);
                ctx.lineTo(19, 32);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = dark;
                ctx.fillRect(21, 25, 4, 4); ctx.fillRect(39, 25, 4, 4);
                sheen(TOP + 3, 21, 43, 2.5);

            } else if (hairId === 'spiky') {
                // Bold anime spikes above crown + spiky flared nape
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 26);
                ctx.lineTo(15, 12);
                ctx.lineTo(22.5, 1.5); ctx.lineTo(25.5, 8);
                ctx.lineTo(28.5, -0.5); ctx.lineTo(30.8, 6.5);
                ctx.lineTo(32, -2); ctx.lineTo(33.2, 6.5);
                ctx.lineTo(35.5, -0.5); ctx.lineTo(38.5, 8);
                ctx.lineTo(41.5, 1.5);
                ctx.lineTo(49, 12); ctx.lineTo(49, 26);
                // Lower outward spikes below ear line
                ctx.lineTo(53, 30); ctx.lineTo(46, 30); ctx.lineTo(43, 34);
                ctx.lineTo(37, 29); ctx.lineTo(32, 35); ctx.lineTo(27, 29);
                ctx.lineTo(21, 34); ctx.lineTo(18, 30); ctx.lineTo(11, 30);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = lite;
                ctx.beginPath();
                ctx.moveTo(27, 6.5); ctx.lineTo(28.5, 1); ctx.lineTo(30, 6.5);
                ctx.moveTo(31, 6); ctx.lineTo(32, 0); ctx.lineTo(33, 6);
                ctx.moveTo(34, 6.5); ctx.lineTo(35.5, 1); ctx.lineTo(37, 6.5);
                ctx.fill();
                sheen(13, 21, 43, 2.5);

            } else if (hairId === 'emo') {
                crownArch(29, 33, 36, 0.5, base);
                // Diagonal layered streaks down to longer right nape
                ctx.fillStyle = dark;
                ctx.beginPath();
                ctx.moveTo(18, 22); ctx.lineTo(46, 31); ctx.lineTo(46, 35); ctx.lineTo(18, 25);
                ctx.closePath(); ctx.fill();
                sheen(TOP + 3, 20, 43, 2.5);

            } else if (hairId === 'bangs') {
                // Straight hime back with a crisp horizontal hem
                ctx.fillStyle = base;
                ctx.fillRect(XL + 0.5, TOP, XR - XL - 1, 30);
                ctx.fillStyle = dark;
                ctx.fillRect(XL + 0.5, 35, XR - XL - 1, 3);
                ctx.fillStyle = mid;
                ctx.fillRect(22, TOP + 6, 1.5, 22);
                ctx.fillRect(40, TOP + 6, 1.5, 22);
                sheen(TOP + 3, 20, 44, 2.5);

            } else if (hairId === 'bob') {
                // Smooth rounded chin-length bob curving in at the bottom
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(13, 28);
                ctx.lineTo(14.5, 12);
                ctx.quadraticCurveTo(14.5, TOP, 21, TOP);
                ctx.lineTo(43, TOP);
                ctx.quadraticCurveTo(49.5, TOP, 49.5, 12);
                ctx.lineTo(51, 28);
                ctx.quadraticCurveTo(51, 36, 42, 36);
                ctx.lineTo(22, 36);
                ctx.quadraticCurveTo(13, 36, 13, 28);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = dark;
                ctx.fillRect(16, 33, 32, 3);
                sheen(TOP + 3, 20, 44, 3);

            } else if (hairId === 'long') {
                // Full unbroken cascading curtain down to y=52
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(14.5, 12);
                ctx.quadraticCurveTo(14.5, TOP, 21, TOP);
                ctx.lineTo(43, TOP);
                ctx.quadraticCurveTo(49.5, TOP, 49.5, 12);
                ctx.lineTo(49.5, EAR_BOTTOM);
                ctx.quadraticCurveTo(53, 34, 52, 50);
                // Scalloped 4-lock bottom hem
                ctx.quadraticCurveTo(47, 54, 42, 50);
                ctx.quadraticCurveTo(37, 54, 32, 50);
                ctx.quadraticCurveTo(27, 54, 22, 50);
                ctx.quadraticCurveTo(17, 54, 12, 50);
                ctx.quadraticCurveTo(11, 34, 14.5, EAR_BOTTOM);
                ctx.closePath(); ctx.fill();
                // Strand shading + double sheen
                ctx.fillStyle = dark;
                for (const sx of [21, 31, 41]) ctx.fillRect(sx, 20, 1.5, 29);
                ctx.fillRect(13, 48, 38, 3);
                sheen(TOP + 3, 20, 44, 3);
                sheen(28, 17, 47, 2.5);

            } else if (hairId === 'wavy') {
                // S-wave cascading back curtain
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(14.5, 12);
                ctx.quadraticCurveTo(14.5, TOP, 21, TOP);
                ctx.lineTo(43, TOP);
                ctx.quadraticCurveTo(49.5, TOP, 49.5, 12);
                ctx.lineTo(49.5, EAR_BOTTOM);
                ctx.bezierCurveTo(55, 32, 48, 40, 53, 47);
                ctx.quadraticCurveTo(43, 52, 32, 48);
                ctx.quadraticCurveTo(21, 52, 11, 47);
                ctx.bezierCurveTo(16, 40, 9, 32, 14.5, EAR_BOTTOM);
                ctx.closePath(); ctx.fill();
                // Wavy highlight & shadow bands
                for (const [wy, c] of [[22, lite], [30, dark], [38, lite], [44, dark]]) {
                    ctx.fillStyle = c;
                    ctx.beginPath();
                    ctx.moveTo(15, wy);
                    ctx.bezierCurveTo(23, wy - 3, 27, wy + 3, 32, wy);
                    ctx.bezierCurveTo(37, wy - 3, 41, wy + 3, 49, wy);
                    ctx.lineTo(49, wy + 2.2);
                    ctx.bezierCurveTo(41, wy + 5, 37, wy - 1, 32, wy + 2.2);
                    ctx.bezierCurveTo(27, wy + 5, 23, wy - 1, 15, wy + 2.2);
                    ctx.closePath(); ctx.fill();
                }
                sheen(TOP + 3, 20, 44, 2.5);

            } else if (hairId === 'curly') {
                // Overlapping 3D ringlet cluster filling the back
                crownArch(32, 38, 32, 0.5, base);
                const puffs = [
                    [23, 7, 5, base], [32, 6, 5.5, base], [41, 7, 5, base],
                    [16, 30, 5.5, base], [24, 34, 6, base], [32, 36, 6.5, base], [40, 34, 6, base], [48, 30, 5.5, base],
                    [19, 40, 5, dark], [27, 42, 5.5, dark], [37, 42, 5.5, dark], [45, 40, 5, dark],
                    [22, 40, 4.5, base], [32, 43, 5, base], [42, 40, 4.5, base],
                    [22, 14, 3.2, lite], [32, 12, 3.5, lite], [42, 14, 3.2, lite],
                    [20, 24, 3.2, dark], [32, 25, 3.5, dark], [44, 24, 3.2, dark],
                    [25, 31, 3, lite], [39, 31, 3, lite]
                ];
                for (const [cx, cy, r, c] of puffs) {
                    ctx.fillStyle = c;
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
                }

            } else if (hairId === 'afro') {
                // Big spherical halo puff with fluffy scalloped rim
                ctx.fillStyle = base;
                ctx.beginPath(); ctx.ellipse(32, 16, 19, 17, 0, 0, Math.PI * 2); ctx.fill();
                for (const [cx, cy, r] of [
                    [24, 3, 5.5], [32, 1.5, 6], [40, 3, 5.5],
                    [15, 29, 5], [23, 32, 5.5], [32, 33, 6], [41, 32, 5.5], [49, 29, 5]
                ]) {
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
                }
                sheen(5, 22, 42, 3);
                ctx.strokeStyle = dark; ctx.lineWidth = 1.3;
                for (const [cx, cy] of [[24, 16], [39, 16], [28, 25], [37, 25]]) {
                    ctx.beginPath(); ctx.arc(cx, cy, 3, 0.4, 4.2); ctx.stroke();
                }

            } else if (hairId === 'shaggy') {
                // Two-tier feathered shag cascading past the neck
                crownArch(30, 34, 30, 0.5, base);
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(14.5, 24);
                ctx.lineTo(10, 32); ctx.lineTo(16, 31); ctx.lineTo(13, 39);
                ctx.lineTo(22, 36); ctx.lineTo(25, 41); ctx.lineTo(32, 37);
                ctx.lineTo(39, 41); ctx.lineTo(42, 36); ctx.lineTo(51, 39);
                ctx.lineTo(48, 31); ctx.lineTo(54, 32); ctx.lineTo(49.5, 24);
                ctx.closePath(); ctx.fill();
                // Upper feathered layer shadow
                ctx.fillStyle = dark;
                ctx.beginPath();
                ctx.moveTo(16, 22); ctx.lineTo(21, 27); ctx.lineTo(26, 23);
                ctx.lineTo(32, 28); ctx.lineTo(38, 23); ctx.lineTo(43, 27);
                ctx.lineTo(48, 22); ctx.lineTo(48, 24); ctx.lineTo(32, 30); ctx.lineTo(16, 24);
                ctx.closePath(); ctx.fill();
                sheen(TOP + 3, 21, 43, 2.5);

            } else if (hairId === 'mullet') {
                // Cropped upper crown + long flared jagged mullet mane below y=21
                crownArch(22, 24, 22, 0.5, base);
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 22);
                ctx.lineTo(10, 34); ctx.lineTo(15, 34); ctx.lineTo(11, 45);
                ctx.lineTo(20, 42); ctx.lineTo(24, 48); ctx.lineTo(32, 43);
                ctx.lineTo(40, 48); ctx.lineTo(44, 42); ctx.lineTo(53, 45);
                ctx.lineTo(49, 34); ctx.lineTo(54, 34); ctx.lineTo(49, 22);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = dark;
                ctx.fillRect(17, 20, 30, 2.5); // step-cut line
                for (const sx of [19, 28, 36, 44]) ctx.fillRect(sx, 30, 2, 13);
                sheen(TOP + 2, 21, 43, 2.5);

            } else if (hairId === 'dreads') {
                // Full crown of locs + 7 connected rope dreadlocks with gold cuffs
                crownArch(20, 22, 20, 0.5, base);
                ctx.fillStyle = dark;
                ctx.fillRect(XL + 1, 13, XR - XL - 2, 2.2); // tie band
                // Solid backing block to y=36 so addSpriteOutline never puts
                // dark speckles between the locs over the head
                ctx.fillStyle = dark;
                ctx.fillRect(15, 16, 34, 21);
                const xs = [15, 20, 25, 30, 35, 40, 45];
                xs.forEach((dx, idx) => {
                    const len = (idx % 2 === 0) ? 28 : 25;
                    ctx.fillStyle = base;
                    ctx.fillRect(dx, 16, 4, len);
                    for (let y = 16; y < 16 + len - 2; y += 5) {
                        ctx.fillStyle = (((y + idx * 5) % 10) < 5) ? base : dark;
                        ctx.fillRect(dx + 0.3, y, 3.4, 3.8);
                    }
                    ctx.fillStyle = '#d4af37';
                    ctx.fillRect(dx + 0.3, 16 + len - 5.5, 3.4, 1.6);
                });
                sheen(TOP + 1.5, 21, 43, 2);

            } else if (hairId === 'ponytail') {
                // Pulled-back crown + scrunchie + flaring ponytail
                crownArch(27, 29, 27, 0.5, base);
                sheen(TOP + 3, 21, 43, 2.5);
                // Scrunchie
                ctx.fillStyle = dark;
                ctx.beginPath(); ctx.ellipse(32, 19, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
                // Flowing tail
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(28, 19);
                ctx.quadraticCurveTo(23, 31, 26, 43);
                ctx.quadraticCurveTo(29, 48, 32, 49);
                ctx.quadraticCurveTo(35, 48, 38, 43);
                ctx.quadraticCurveTo(41, 31, 36, 19);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = lite;
                ctx.beginPath();
                ctx.moveTo(30, 21); ctx.quadraticCurveTo(28, 32, 30, 42);
                ctx.lineTo(33, 42); ctx.quadraticCurveTo(32, 32, 33, 21);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = dark;
                ctx.fillRect(28, 43, 8, 3);

            } else if (hairId === 'braid') {
                // Pulled-back crown + woven central braid down the spine
                crownArch(26, 28, 26, 0.5, base);
                sheen(TOP + 3, 21, 43, 2.5);
                ctx.fillStyle = dark;
                ctx.fillRect(28.5, 18, 7, 27);
                for (let by = 17, step = 0; by <= 41; by += 4, step++) {
                    ctx.fillStyle = (step % 2 === 0) ? base : mid;
                    ctx.beginPath(); ctx.ellipse(30.2, by + 2, 3.6, 2.8, 0.35, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = (step % 2 === 0) ? mid : lite;
                    ctx.beginPath(); ctx.ellipse(33.8, by + 3.5, 3.6, 2.8, -0.35, 0, Math.PI * 2); ctx.fill();
                }
                // Band + tassel tip
                ctx.fillStyle = '#d4af37';
                ctx.fillRect(29, 44, 6, 1.8);
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(29.5, 45.8); ctx.lineTo(28, 50); ctx.lineTo(32, 52); ctx.lineTo(36, 50); ctx.lineTo(34.5, 45.8);
                ctx.closePath(); ctx.fill();

            } else if (hairId === 'pigtails' || hairId === 'twintails') {
                const isTwin = (hairId === 'twintails');
                crownArch(28, 30, 28, 0.5, base);
                // Center part line
                ctx.fillStyle = dark;
                ctx.fillRect(31.3, TOP + 1, 1.4, 20);
                sheen(TOP + 3, 20, 30, 2);
                sheen(TOP + 3, 34, 44, 2);
                // Twin/pigtail plumes anchored broadly inside the lower head so
                // addSpriteOutline wraps the outer edge without pinching y=27
                const tailBot = isTwin ? 50 : 42;
                for (const dir of [-1, 1]) {
                    const xIn = (dir < 0) ? 21 : 43;
                    const xEdge = (dir < 0) ? 14.5 : 49.5;
                    ctx.fillStyle = base;
                    ctx.beginPath();
                    ctx.moveTo(xIn, 24);
                    ctx.lineTo(xEdge, 24);
                    ctx.lineTo(xEdge, EAR_BOTTOM);
                    ctx.quadraticCurveTo(xEdge + dir * 7, 30, xEdge + dir * 6, tailBot - 3);
                    ctx.quadraticCurveTo(xEdge + dir * 3, tailBot + 1, xEdge + dir * 1, tailBot);
                    ctx.quadraticCurveTo(xIn, tailBot - 4, xIn, 29);
                    ctx.closePath(); ctx.fill();
                    ctx.fillStyle = lite;
                    ctx.beginPath();
                    ctx.ellipse(xEdge + dir * 2, 34, 1.8, isTwin ? 5.5 : 3.5, dir * 0.18, 0, Math.PI * 2);
                    ctx.fill();
                    // Hair tie band
                    ctx.fillStyle = '#d4af37';
                    ctx.fillRect((dir < 0) ? 15 : 44.5, 26.2, 4.5, 1.8);
                }

            } else if (hairId === 'bun') {
                crownArch(27, 29, 27, 0.5, base);
                sheen(13, 21, 43, 2.5);
                // Wrap band + big round bun on top
                ctx.fillStyle = dark;
                ctx.fillRect(25, 6.5, 14, 2.5);
                ctx.fillStyle = base;
                ctx.beginPath(); ctx.arc(32, 2.5, 7, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = dark;
                ctx.beginPath(); ctx.arc(32, 3, 3.2, 0.3, 4.2); ctx.fill();
                ctx.fillStyle = lite;
                ctx.beginPath(); ctx.arc(29.8, 0.2, 2.3, 0, Math.PI * 2); ctx.fill();

            } else if (hairId === 'topknot') {
                // Shaved fade lower back + tied samurai topknot tuft
                ctx.save();
                ctx.globalAlpha = 0.32;
                ctx.fillStyle = dark;
                ctx.fillRect(XL + 1, 18, XR - XL - 2, 11);
                ctx.restore();
                crownArch(19, 21, 19, 1, base);
                // Knot stem, gold/dark band, and fanned brush top
                ctx.fillStyle = '#d4af37';
                ctx.fillRect(27.5, 5.5, 9, 2);
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(28, 6); ctx.lineTo(24, -2); ctx.lineTo(29, 0);
                ctx.lineTo(32, -3); ctx.lineTo(35, 0); ctx.lineTo(40, -2);
                ctx.lineTo(36, 6); ctx.closePath(); ctx.fill();
                ctx.fillStyle = lite;
                ctx.fillRect(30.5, -1, 3, 5);
            }
        }, 20, 44, EAR_BOTTOM);
    }
    // =======================================================================
    else {
        // ---- FRONT VIEW ---------------------------------------------------
        if (hairId === 'emo') {
            // Emo gets a custom clip that protects the nose & left eye while
            // letting the signature diagonal fringe sweep down over the right
            // brow/eye (createSpeciesTexture re-stamps the eyes underneath).
            ctx.save();
            headPath();
            ctx.clip();
            clipOut(NOSE_L, NOSE_TOP, NOSE_R - NOSE_L, 64 - NOSE_TOP);
            clipOut(EYE_L, NOSE_TOP, 9.5, 11);
            // Asymmetrical side-swept fringe from left part (x=20) to right cheek
            ctx.fillStyle = base;
            ctx.beginPath();
            ctx.moveTo(14.5, 29);
            ctx.lineTo(14.5, 12);
            ctx.quadraticCurveTo(14.5, TOP, 21, TOP);
            ctx.lineTo(43, TOP);
            ctx.quadraticCurveTo(49.5, TOP, 49.5, 12);
            ctx.lineTo(49.5, 34);
            ctx.lineTo(45, 35);
            ctx.lineTo(44.5, 22);
            // Sweeping diagonal bang points across the forehead/right brow
            ctx.lineTo(41, 21);
            ctx.lineTo(38, 17.5);
            ctx.lineTo(34, 19.5);
            ctx.lineTo(29, 15.5);
            ctx.lineTo(21, 13.5);
            ctx.lineTo(19, 26);
            ctx.closePath(); ctx.fill();
            // Layered dark & highlight diagonal streaks
            ctx.fillStyle = dark;
            ctx.fillRect(20, TOP, 1.6, 5.5); // side part
            ctx.beginPath();
            ctx.moveTo(23, 10); ctx.lineTo(39, 17); ctx.lineTo(37, 18); ctx.lineTo(22, 11.5);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = lite;
            ctx.beginPath();
            ctx.moveTo(25, 9.5); ctx.lineTo(42, 15.5); ctx.lineTo(40, 17); ctx.lineTo(24, 11);
            ctx.closePath(); ctx.fill();
            ctx.restore();
            return;
        }

        withHairEnvelope(() => {
            if (hairId === 'buzzed') {
                // Subtle translucent buzzcut with an M-shaped temple contour
                // and a slight widow's peak in the center.
                ctx.save();
                ctx.globalAlpha = 0.44;
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 20);
                ctx.lineTo(15, 12);
                ctx.quadraticCurveTo(15, TOP, 21, TOP);
                ctx.lineTo(43, TOP);
                ctx.quadraticCurveTo(49, TOP, 49, 12);
                ctx.lineTo(49, 20);
                ctx.lineTo(46, 20);
                ctx.lineTo(45, 13.2);
                ctx.lineTo(37, 13.2);
                ctx.lineTo(32, 15.2); // widow's peak
                ctx.lineTo(27, 13.2);
                ctx.lineTo(19, 13.2);
                ctx.lineTo(18, 20);
                ctx.closePath(); ctx.fill();
                ctx.restore();

            } else if (hairId === 'pixie') {
                // Asymmetrical short pixie with 3 diagonal wispy bangs and
                // tapered cheek points.
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 13);
                ctx.quadraticCurveTo(15, TOP, 21, TOP);
                ctx.lineTo(43, TOP);
                ctx.quadraticCurveTo(49, TOP, 49, 13);
                // 3 diagonal wispy locks across the forehead
                ctx.lineTo(44, 16.8); ctx.lineTo(40, 14);
                ctx.lineTo(35, 16.8); ctx.lineTo(31, 13.8);
                ctx.lineTo(25, 16.2); ctx.lineTo(21, 13.2);
                ctx.closePath(); ctx.fill();
                sideLock(-1, 11, 23, 4.2, 0.5, base);
                sideLock(1, 11, 25, 4.5, 0.5, base);
                sheen(TOP + 2, 22, 42, 2.2);

            } else if (hairId === 'undercut') {
                // Faded temples + textured swept top tuft rising to y=5
                ctx.save();
                ctx.globalAlpha = 0.32;
                sideLock(-1, 12, 22, 4, 1, dark);
                sideLock(1, 12, 22, 4, 1, dark);
                ctx.restore();
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(19.5, 14.5);
                ctx.lineTo(19.5, 7);
                ctx.quadraticCurveTo(24, 4, 33, 4.5);
                ctx.quadraticCurveTo(41, 5, 44.5, 8);
                ctx.lineTo(44.5, 16);
                // Textured diagonal fringe
                ctx.lineTo(39, 16.8); ctx.lineTo(36, 14.8);
                ctx.lineTo(30, 16.5); ctx.lineTo(26, 14.5);
                ctx.closePath(); ctx.fill();
                sheen(7.5, 22, 42, 2.2);

            } else if (hairId === 'slicked') {
                // Combed straight back with a subtle widow's peak & comb lines
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 13);
                ctx.quadraticCurveTo(15, TOP, 21, TOP);
                ctx.lineTo(43, TOP);
                ctx.quadraticCurveTo(49, TOP, 49, 13);
                ctx.lineTo(43, 13.5);
                ctx.quadraticCurveTo(36, 13.5, 32, 16); // widow's peak
                ctx.quadraticCurveTo(28, 13.5, 21, 13.5);
                ctx.closePath(); ctx.fill();
                sideLock(-1, 11, 21, 3.8, 0.5, base);
                sideLock(1, 11, 21, 3.8, 0.5, base);
                // Combed-back strand grooves
                for (const [sx, c] of [[21, dark], [24, lite], [28, dark], [32, lite], [36, dark], [40, lite], [43, dark]]) {
                    ctx.fillStyle = c;
                    ctx.fillRect(sx, TOP, 1.4, 5.2);
                }

            } else if (hairId === 'sidepart') {
                // Razor part at x=23 with a sweeping wave across the forehead
                sideLock(-1, 11, 21, 3.8, 0.5, base);
                sideLock(1, 11, 21, 3.8, 0.5, base);
                // Left combed-down section (x 15..23)
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 15);
                ctx.lineTo(15, 11);
                ctx.quadraticCurveTo(15, TOP, 23, TOP);
                ctx.lineTo(23, 13);
                ctx.quadraticCurveTo(19, 15.5, 15, 15);
                ctx.closePath(); ctx.fill();
                // Right swept wave (x 24..49)
                ctx.beginPath();
                ctx.moveTo(24, 12.5);
                ctx.lineTo(24, TOP - 0.5);
                ctx.lineTo(43, TOP);
                ctx.quadraticCurveTo(49, TOP, 49, 12);
                ctx.lineTo(46, 15.5);
                ctx.quadraticCurveTo(38, 17.2, 24, 12.5);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = dark;
                ctx.fillRect(22.6, TOP, 1.6, 5.5); // crisp part line
                sheen(TOP + 2, 26, 44, 2.2);

            } else if (hairId === 'pompadour') {
                // High rockabilly roll rising to y=0 + slick tapered sideburns
                sideLock(-1, 10, 23, 3.8, 0.5, dark);
                sideLock(1, 10, 23, 3.8, 0.5, dark);
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(19.5, 14);
                ctx.quadraticCurveTo(19.5, 0, 32, 0);
                ctx.quadraticCurveTo(44.5, 0, 44.5, 14);
                ctx.quadraticCurveTo(37, 16.8, 28, 15.5);
                ctx.quadraticCurveTo(22, 14.8, 19.5, 14);
                ctx.closePath(); ctx.fill();
                // Glossy upper roll highlight + underside crease
                sheen(3.5, 22, 42, 3);
                ctx.fillStyle = dark;
                ctx.fillRect(21, 13.5, 22, 1.4);

            } else if (hairId === 'messy') {
                // Tousled crown tufts (y 5..8) + 5 overlapping jagged forehead
                // locks pointing DOWN (no bald holes at the crown!)
                sideLock(-1, 11, 23, 4.5, 0, base);
                sideLock(1, 11, 23, 4.5, 0, base);
                ctx.fillStyle = base;
                ctx.beginPath();
                // Upper tousled tufts
                ctx.moveTo(15, 14);
                ctx.lineTo(19.5, 6); ctx.lineTo(24, 8);
                ctx.lineTo(28, 4.5); ctx.lineTo(32, 7.5);
                ctx.lineTo(36, 4.5); ctx.lineTo(40, 8);
                ctx.lineTo(44.5, 6); ctx.lineTo(49, 14);
                // Jagged forehead bangs pointing down
                ctx.lineTo(43, 17); ctx.lineTo(39, 14);
                ctx.lineTo(35, 17.2); ctx.lineTo(31, 14.2);
                ctx.lineTo(27, 17); ctx.lineTo(23, 14);
                ctx.lineTo(19, 16.8);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = lite;
                ctx.beginPath();
                ctx.moveTo(25, 9); ctx.lineTo(28, 15.5); ctx.lineTo(30, 9);
                ctx.moveTo(34, 9); ctx.lineTo(36, 15.5); ctx.lineTo(39, 9);
                ctx.fill();

            } else if (hairId === 'spiky') {
                // 5 bold anime spikes rising above the crown (y -2..8) + solid
                // crown + jagged spiky bangs pointing down onto the forehead
                sideLock(-1, 11, 24, 4.5, 0, base);
                sideLock(1, 11, 24, 4.5, 0, base);
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 14.5);
                // Left-to-right upper spikes (within 22.5..41.5 above y=8)
                ctx.lineTo(22.5, 1.5); ctx.lineTo(25.5, 7.5);
                ctx.lineTo(28.5, -0.5); ctx.lineTo(30.8, 6.5);
                ctx.lineTo(32, -2); ctx.lineTo(33.2, 6.5);
                ctx.lineTo(35.5, -0.5); ctx.lineTo(38.5, 7.5);
                ctx.lineTo(41.5, 1.5);
                ctx.lineTo(49, 14.5);
                // Pointed forehead spikes
                ctx.lineTo(42, 17.2); ctx.lineTo(38, 14);
                ctx.lineTo(32, 17.4); ctx.lineTo(26, 14);
                ctx.lineTo(22, 17.2);
                ctx.closePath(); ctx.fill();
                // Bright spike facets
                ctx.fillStyle = lite;
                ctx.beginPath();
                ctx.moveTo(27, 6.5); ctx.lineTo(28.5, 1); ctx.lineTo(30, 6.5);
                ctx.moveTo(31, 6); ctx.lineTo(32, 0); ctx.lineTo(33, 6);
                ctx.moveTo(34, 6.5); ctx.lineTo(35.5, 1); ctx.lineTo(37, 6.5);
                ctx.fill();

            } else if (hairId === 'bangs') {
                // Hime-cut blunt bangs with 3 micro-part slits at the bottom
                // edge + long straight cheek-framing sidelocks down to y=35
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 16.5);
                ctx.lineTo(15, 11);
                ctx.quadraticCurveTo(15, TOP, 21, TOP);
                ctx.lineTo(43, TOP);
                ctx.quadraticCurveTo(49, TOP, 49, 11);
                ctx.lineTo(49, 16.5);
                // Blunt fringe with 3 neat vertical slits so it reads as hair
                ctx.lineTo(40.5, 16.5); ctx.lineTo(39.5, 13.5); ctx.lineTo(38.5, 16.5);
                ctx.lineTo(33, 16.5);   ctx.lineTo(32, 13.2);   ctx.lineTo(31, 16.5);
                ctx.lineTo(25.5, 16.5); ctx.lineTo(24.5, 13.5); ctx.lineTo(23.5, 16.5);
                ctx.closePath(); ctx.fill();
                // Crisp straight hime sidelocks (reach 21/43 below y=28.5 so
                // they seal against the torso without an outline gap)
                ctx.fillRect(14.5, 11, 6.5, 24);
                ctx.fillRect(43, 11, 6.5, 24);
                ctx.fillStyle = dark;
                ctx.fillRect(14.5, 33, 6.5, 2);
                ctx.fillRect(43, 33, 6.5, 2);
                sheen(TOP + 2.5, 20, 44, 2.5);

            } else if (hairId === 'bob') {
                // Rounded chin-length bob with a parted arch fringe and
                // inward-curling chin tips outside the eyes
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 16);
                ctx.lineTo(15, 11);
                ctx.quadraticCurveTo(15, TOP, 21, TOP);
                ctx.lineTo(43, TOP);
                ctx.quadraticCurveTo(49, TOP, 49, 11);
                ctx.lineTo(49, 16);
                ctx.quadraticCurveTo(38, 16.5, 30, 13.2); // side-parted arch
                ctx.quadraticCurveTo(23, 16.5, 15, 16);
                ctx.closePath(); ctx.fill();
                // Rounded sidelocks curving in below the eye/jaw line
                sideLock(-1, 11, 35, 5, 2, base);
                sideLock(1, 11, 35, 5, 2, base);
                ctx.fillStyle = dark;
                ctx.fillRect(29.2, TOP, 1.5, 5.2);
                ctx.fillRect(14.5, 32.5, 6.5, 2.5);
                ctx.fillRect(43, 32.5, 6.5, 2.5);
                sheen(TOP + 2.5, 20, 44, 2.5);

            } else if (hairId === 'long') {
                // Center-parted sweeping bangs + one-piece flowing sidelocks
                // that widen smoothly below the ears down to y=49
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 17);
                ctx.lineTo(15, 11);
                ctx.quadraticCurveTo(15, TOP, 21, TOP);
                ctx.lineTo(43, TOP);
                ctx.quadraticCurveTo(49, TOP, 49, 11);
                ctx.lineTo(49, 17);
                ctx.quadraticCurveTo(39, 16.8, 32, 12.8); // center part arch
                ctx.quadraticCurveTo(25, 16.8, 15, 17);
                ctx.closePath(); ctx.fill();
                for (const dir of [-1, 1]) {
                    const xEdge = (dir < 0) ? 14.5 : 49.5;
                    const xIn = (dir < 0) ? 21 : 43;
                    const xWide = (dir < 0) ? 11.5 : 52.5;
                    ctx.fillStyle = base;
                    ctx.beginPath();
                    ctx.moveTo(xEdge, 12);
                    ctx.lineTo(xIn, 12);
                    ctx.lineTo(xIn, 46);
                    ctx.quadraticCurveTo((xWide + xIn) * 0.5, 50.5, xWide, 47);
                    ctx.lineTo(xWide, EAR_BOTTOM + 2);
                    ctx.quadraticCurveTo(xEdge, EAR_BOTTOM, xEdge, 25);
                    ctx.closePath(); ctx.fill();
                    // Outer dark depth strip + inner sheen + tip shadow
                    ctx.fillStyle = dark;
                    ctx.fillRect((dir < 0) ? xWide : xEdge - 0.5, EAR_BOTTOM + 2, 2.2, 19);
                    ctx.fillRect(Math.min(xWide, xIn), 45.5, 9, 2.5);
                    ctx.fillStyle = lite;
                    ctx.fillRect((dir < 0) ? 15.8 : 46.2, 19, 2, 18);
                }
                ctx.fillStyle = dark;
                ctx.fillRect(31.3, TOP, 1.4, 5);
                sheen(TOP + 2.5, 20, 30.5, 2.2);
                sheen(TOP + 2.5, 33.5, 44, 2.2);

            } else if (hairId === 'wavy') {
                // Side-parted wave fringe + continuous S-wave sidelocks to y=48
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 16.5);
                ctx.lineTo(15, 11);
                ctx.quadraticCurveTo(15, TOP, 21, TOP);
                ctx.lineTo(43, TOP);
                ctx.quadraticCurveTo(49, TOP, 49, 11);
                ctx.lineTo(49, 16.5);
                ctx.bezierCurveTo(41, 17.5, 33, 12.5, 25, 13.5);
                ctx.quadraticCurveTo(20, 16.5, 15, 16.5);
                ctx.closePath(); ctx.fill();
                for (const dir of [-1, 1]) {
                    const xEdge = (dir < 0) ? 14.5 : 49.5;
                    const xIn = (dir < 0) ? 21 : 43;
                    // Solid undulating ribbon so addSpriteOutline stays outside
                    ctx.fillStyle = base;
                    ctx.beginPath();
                    ctx.moveTo(xEdge, 12);
                    ctx.lineTo(xIn, 12);
                    ctx.lineTo(xIn, 46);
                    ctx.quadraticCurveTo(xEdge + dir * 2, 50, xEdge + dir * 3.5, 46);
                    ctx.bezierCurveTo(xEdge + dir * 1, 41, xEdge + dir * 4.5, 35, xEdge + dir * 2.5, 30);
                    ctx.quadraticCurveTo(xEdge, EAR_BOTTOM, xEdge, 25);
                    ctx.closePath(); ctx.fill();
                    // S-wave highlight & shadow bands across the ribbon
                    const lx = (dir < 0) ? 14.8 : 44.8;
                    for (const [wy, c] of [[18, lite], [24, dark], [30, lite], [36, dark], [42, lite]]) {
                        ctx.fillStyle = c;
                        ctx.fillRect(lx, wy, 4.2, 2.4);
                    }
                }
                sheen(TOP + 2.5, 24, 44, 2.2);

            } else if (hairId === 'curly') {
                // Bubbly cluster of 3D ringlet curls on the crown + cascading
                // ringlet clusters framing the sides down to y=44
                crownArch(16, 15, 16, 0.5, base);
                sideLock(-1, 12, 41, 5, 1, base);
                sideLock(1, 12, 41, 5, 1, base);
                const curls = [
                    [25, 8.5, 4.5, base], [30, 8, 4.8, base], [34, 8, 4.8, base], [39, 8.5, 4.5, base],
                    [22, 13, 3.8, base], [27, 13.5, 3.8, base], [32, 13, 4, base], [37, 13.5, 3.8, base], [42, 13, 3.8, base],
                    [17, 15, 3, base], [16.8, 20, 3, dark], [17, 25, 3.2, base],
                    [47, 15, 3, base], [47.2, 20, 3, dark], [47, 25, 3.2, base],
                    [14.5, 30, 4.5, base], [17, 35, 4.5, mid], [14.5, 39, 4.2, dark], [16.5, 42, 3.5, base],
                    [49.5, 30, 4.5, base], [47, 35, 4.5, mid], [49.5, 39, 4.2, dark], [47.5, 42, 3.5, base],
                    [26, 7, 2.3, lite], [32, 6.5, 2.6, lite], [38, 7, 2.3, lite],
                    [23, 13.5, 2, dark], [41, 13.5, 2, dark]
                ];
                for (const [cx, cy, r, c] of curls) {
                    ctx.fillStyle = c;
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
                }

            } else if (hairId === 'afro') {
                // Big iconic cloud puff rising to y=-2 with fluffy scalloped
                // perimeter and a clean rounded forehead arch at y=15
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.ellipse(32, 10, 17, 11, 0, Math.PI, 0);
                ctx.lineTo(49, 23);
                ctx.lineTo(44.5, 23);
                ctx.lineTo(44.5, 15.2);
                ctx.quadraticCurveTo(32, 14.2, 19.5, 15.2);
                ctx.lineTo(19.5, 23);
                ctx.lineTo(15, 23);
                ctx.closePath(); ctx.fill();
                for (const [cx, cy, r] of [
                    [26, 3, 4.8], [32, 1.5, 5.5], [38, 3, 4.8],
                    [17, 15, 3], [47, 15, 3], [17, 20, 3], [47, 20, 3]
                ]) {
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
                }
                sheen(4.5, 23, 41, 3);
                ctx.strokeStyle = dark; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.arc(26, 9, 2.5, 0.5, 4); ctx.stroke();
                ctx.beginPath(); ctx.arc(38, 9, 2.5, 0.5, 4); ctx.stroke();

            } else if (hairId === 'ponytail') {
                // Sleek pulled-back crown with arched hairline, temple wisps,
                // and a connected high ponytail arch rising from the crown
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(25, 9);
                ctx.quadraticCurveTo(26, 2, 32, 2);
                ctx.quadraticCurveTo(38, 2, 39, 9);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = lite;
                ctx.beginPath(); ctx.ellipse(32, 4.2, 3.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#d4af37';
                ctx.fillRect(26.5, 6.5, 11, 1.8); // gold hair tie at crown
                crownArch(16, 13.2, 16, 0.5, base);
                sideLock(-1, 12, 23, 3.8, 0.5, base);
                sideLock(1, 12, 23, 3.8, 0.5, base);
                sheen(TOP + 2.5, 21, 43, 2.2);

            } else if (hairId === 'pigtails' || hairId === 'twintails') {
                const isTwin = (hairId === 'twintails');
                // Parted bangs (twintails get an anime center V-lock)
                crownArch(16, 13.5, 16, 0.5, base);
                if (isTwin) {
                    ctx.fillStyle = base;
                    ctx.beginPath();
                    ctx.moveTo(29, 13); ctx.lineTo(32, 17); ctx.lineTo(35, 13);
                    ctx.closePath(); ctx.fill();
                } else {
                    ctx.fillStyle = dark;
                    ctx.fillRect(31.3, TOP, 1.4, 6);
                }
                sheen(TOP + 2, 21, 43, 2.2);
                // Continuous sidelock -> side-tail silhouette so addSpriteOutline
                // wraps the outer edge without putting a black line at y=27
                const tailBot = isTwin ? 50 : 42;
                for (const dir of [-1, 1]) {
                    const xIn = (dir < 0) ? 21 : 43;
                    const xEdge = (dir < 0) ? 14.5 : 49.5;
                    ctx.fillStyle = base;
                    ctx.beginPath();
                    ctx.moveTo(xIn, 12);
                    ctx.lineTo(xEdge, 12);
                    ctx.lineTo(xEdge, EAR_BOTTOM);
                    ctx.quadraticCurveTo(xEdge + dir * 7, 30, xEdge + dir * 6, tailBot - 3);
                    ctx.quadraticCurveTo(xEdge + dir * 3, tailBot + 1, xEdge + dir * 1, tailBot);
                    ctx.quadraticCurveTo(xIn, tailBot - 4, xIn, 28);
                    ctx.closePath(); ctx.fill();
                    ctx.fillStyle = lite;
                    ctx.beginPath();
                    ctx.ellipse(xEdge + dir * 2, 34, 1.8, isTwin ? 5.5 : 3.5, dir * 0.18, 0, Math.PI * 2);
                    ctx.fill();
                    // Ribbon/tie band
                    ctx.fillStyle = '#d4af37';
                    ctx.fillRect((dir < 0) ? 14.8 : 44.8, 25.8, 4.4, 1.8);
                }

            } else if (hairId === 'bun') {
                // Big round shaded bun on top + wrap band + parted crown & wisps
                ctx.fillStyle = base;
                ctx.beginPath(); ctx.arc(32, 2.5, 7, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = lite;
                ctx.beginPath(); ctx.arc(29.8, 0.2, 2.4, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = dark;
                ctx.fillRect(25.5, 6.8, 13, 2); // hairband at bun base
                crownArch(16, 13.5, 16, 0.5, base);
                sideLock(-1, 12, 25, 3.8, 0.8, base);
                sideLock(1, 12, 25, 3.8, 0.8, base);
                sheen(TOP + 2.5, 21, 43, 2);

            } else if (hairId === 'topknot') {
                // Shaved fade temples + gold tie + fanned samurai topknot brush
                ctx.save();
                ctx.globalAlpha = 0.32;
                sideLock(-1, 12, 21, 3.8, 0.5, dark);
                sideLock(1, 12, 21, 3.8, 0.5, dark);
                ctx.restore();
                crownArch(14.2, 13.2, 14.2, 2, base);
                ctx.fillStyle = '#d4af37';
                ctx.fillRect(27.5, 5.5, 9, 2);
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(28, 6); ctx.lineTo(24, -2); ctx.lineTo(29, 0);
                ctx.lineTo(32, -3); ctx.lineTo(35, 0); ctx.lineTo(40, -2);
                ctx.lineTo(36, 6); ctx.closePath(); ctx.fill();
                ctx.fillStyle = lite;
                ctx.fillRect(30.5, -1, 3, 5);
                sheen(TOP + 2, 23, 41, 2);

            } else if (hairId === 'braid') {
                // Swept side-parted crown + continuous woven plait over right shoulder
                crownArch(15.5, 14, 16.5, 0.5, base);
                sideLock(-1, 12, 23, 4, 0.8, base);
                ctx.fillStyle = dark;
                ctx.fillRect(24, TOP, 1.5, 5.5);
                sheen(TOP + 2.5, 26, 44, 2.2);
                // Continuous right-side backing strip from temple through tassel
                ctx.fillStyle = dark;
                ctx.beginPath();
                ctx.moveTo(43, 12);
                ctx.lineTo(49.5, 12);
                ctx.lineTo(49.5, EAR_BOTTOM);
                ctx.lineTo(52, 29);
                ctx.lineTo(51.5, 50);
                ctx.lineTo(48.5, 52);
                ctx.lineTo(43, 50);
                ctx.lineTo(43, 12);
                ctx.closePath(); ctx.fill();
                // Woven braid links on top of the backing strip
                for (let by = 22, step = 0; by <= 42; by += 3.6, step++) {
                    ctx.fillStyle = (step % 2 === 0) ? base : mid;
                    ctx.beginPath(); ctx.ellipse(46.2, by + 1.5, 2.8, 2.3, 0.3, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = (step % 2 === 0) ? mid : lite;
                    ctx.beginPath(); ctx.ellipse(49.2, by + 3, 2.8, 2.3, -0.3, 0, Math.PI * 2); ctx.fill();
                }
                ctx.fillStyle = '#d4af37';
                ctx.fillRect(45, 45.2, 6, 1.6);
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(45.5, 46.8); ctx.lineTo(44.8, 50.5); ctx.lineTo(48.2, 52); ctx.lineTo(51.5, 50.5); ctx.lineTo(50.5, 46.8);
                ctx.closePath(); ctx.fill();

            } else if (hairId === 'dreads') {
                // Rooted loc crown + dark headband + solid-core rope dreadlocks
                // with gold cuffs hanging down both sides (never under the eyes!)
                crownArch(15, 14, 15, 0.5, base);
                ctx.fillStyle = dark;
                ctx.fillRect(XL + 1, 12.2, XR - XL - 2, 2); // headband
                sheen(TOP + 1.5, 21, 43, 2);
                for (const dir of [-1, 1]) {
                    const xIn = (dir < 0) ? 14.5 : 43;
                    const xOuter = (dir < 0) ? 11.2 : 48.8;
                    const segX = (dir < 0) ? 15 : 45;
                    // Solid core connecting inner & outer locs + sealing torso
                    ctx.fillStyle = dark;
                    ctx.fillRect(xIn, 14, 6.5, 30);
                    ctx.fillRect(xOuter, EAR_BOTTOM, 4, 19);
                    for (let y = 14, step = 0; y < 42; y += 4.5, step++) {
                        ctx.fillStyle = (step % 2 === 0) ? base : mid;
                        ctx.fillRect(segX, y, 4, 3.4);
                    }
                    for (let y = EAR_BOTTOM, step = 0; y < 44; y += 4.5, step++) {
                        ctx.fillStyle = (step % 2 === 0) ? mid : base;
                        ctx.fillRect(xOuter + 0.4, y, 3.2, 3.4);
                    }
                    ctx.fillStyle = '#d4af37';
                    ctx.fillRect(segX, 39.5, 4, 1.5);
                    ctx.fillRect(xOuter + 0.4, 41.5, 3.2, 1.5);
                }

            } else if (hairId === 'shaggy') {
                // Feathered layered shag with choppy bangs + flared kick-out
                // layers down both sides
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 16);
                ctx.lineTo(15, 11);
                ctx.quadraticCurveTo(15, TOP, 21, TOP);
                ctx.lineTo(27, 6); ctx.lineTo(32, 7.5); ctx.lineTo(37, 6);
                ctx.lineTo(43, TOP);
                ctx.quadraticCurveTo(49, TOP, 49, 11);
                ctx.lineTo(49, 16);
                // Choppy feathered fringe
                ctx.lineTo(42, 17); ctx.lineTo(39, 14.5);
                ctx.lineTo(34, 17); ctx.lineTo(31, 14.2);
                ctx.lineTo(26, 17); ctx.lineTo(22, 14.5);
                ctx.closePath(); ctx.fill();
                sideLock(-1, 11, 34, 5, 0, base);
                sideLock(1, 11, 34, 5, 0, base);
                // Flared feathered kick-outs below the ears
                for (const dir of [-1, 1]) {
                    const rx = (dir < 0) ? 20.5 : 43.5;
                    ctx.fillStyle = base;
                    ctx.beginPath();
                    ctx.moveTo(rx, 26);
                    ctx.lineTo(rx + dir * 9.5, 31); ctx.lineTo(rx + dir * 5.5, 31.5);
                    ctx.lineTo(rx + dir * 10.5, 37); ctx.lineTo(rx + dir * 4.5, 37.5);
                    ctx.lineTo(rx + dir * 7.5, 42); ctx.lineTo(rx, 39);
                    ctx.closePath(); ctx.fill();
                }
                sheen(TOP + 2.5, 21, 43, 2.5);

            } else if (hairId === 'mullet') {
                // Short spiky business-in-the-front crop + wild flared party-in-
                // the-back mane visible below the ears on both sides
                for (const dir of [-1, 1]) {
                    const rx = (dir < 0) ? 20.5 : 43.5;
                    ctx.fillStyle = dark;
                    ctx.beginPath();
                    ctx.moveTo(rx, 26);
                    ctx.lineTo(rx + dir * 10, 33); ctx.lineTo(rx + dir * 6, 34);
                    ctx.lineTo(rx + dir * 11, 42); ctx.lineTo(rx + dir * 6, 42);
                    ctx.lineTo(rx + dir * 9, 48); ctx.lineTo(rx, 44);
                    ctx.closePath(); ctx.fill();
                    ctx.fillStyle = base;
                    ctx.beginPath();
                    ctx.moveTo(rx, 26);
                    ctx.lineTo(rx + dir * 8, 32); ctx.lineTo(rx + dir * 5, 33);
                    ctx.lineTo(rx + dir * 9, 40); ctx.lineTo(rx + dir * 3, 43);
                    ctx.closePath(); ctx.fill();
                }
                // Short cropped front with mini spikes
                sideLock(-1, 11, 20, 3.8, 0.5, base);
                sideLock(1, 11, 20, 3.8, 0.5, base);
                ctx.fillStyle = base;
                ctx.beginPath();
                ctx.moveTo(15, 14);
                ctx.lineTo(15, 11);
                ctx.quadraticCurveTo(15, TOP, 22, TOP);
                ctx.lineTo(27, 5.5); ctx.lineTo(31, 7.5);
                ctx.lineTo(34, 5);   ctx.lineTo(38, 7.5);
                ctx.lineTo(42, TOP);
                ctx.quadraticCurveTo(49, TOP, 49, 11);
                ctx.lineTo(49, 14);
                ctx.lineTo(41, 15.2); ctx.lineTo(36, 13.5);
                ctx.lineTo(31, 15.2); ctx.lineTo(25, 13.5);
                ctx.closePath(); ctx.fill();
                sheen(TOP + 2, 22, 42, 2);

            } else {
                crownArch(16, 14.5, 16, 0.5, base);
                sheen();
            }
        }, 20, 44, EAR_BOTTOM);
    }
}

// Stamp a crisp dark outline just outside the sprite silhouette. Run on the
// fully composited texture so the outline wraps the whole figure - ears, hat,
// hair, tail, everything - as one continuous border. Operates on device pixels,
// so it is unaffected by the canvas transform.
function addSpriteOutline(ctx, canvas, colorHex = '#111219', thickness = 2) {
    const W = canvas.width, H = canvas.height;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const c3 = new THREE.Color(colorHex);
    const R = Math.round(c3.r * 255), G = Math.round(c3.g * 255), B = Math.round(c3.b * 255);
    const SOLID = 140;                 // alpha at/above this counts as drawn art
    const reach = thickness * thickness;
    const isSolid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] >= SOLID;
    const px = [];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (d[(y * W + x) * 4 + 3] >= SOLID) continue;   // never touch the art itself
            let near = false;
            for (let dy = -thickness; dy <= thickness && !near; dy++) {
                for (let dx = -thickness; dx <= thickness; dx++) {
                    if (dx * dx + dy * dy > reach) continue;
                    if (isSolid(x + dx, y + dy)) { near = true; break; }
                }
            }
            if (near) px.push((y * W + x) * 4);
        }
    }
    for (let i = 0; i < px.length; i++) {
        const o = px[i];
        d[o] = R; d[o + 1] = G; d[o + 2] = B; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
}

// Main texture compositing function. Combines species, colors, and all cosmetics into one texture.
// partColors is optional: { earsColor, noseColor, miscColor, tailColor }
function createSpeciesTexture(species, hex, bellyHex, back, hatId = 'none', shirtId = 'none', collarId = 'none', eyeHex = '#000000', partColors = null, hairId = 'none', hairColor = null, mouthOpen = false, eyesClosed=false, pantsId='none', skinOnly=false, bodyPaint='', bodyPaintColor='#ffffff') {
    // VISUAL UPGRADE: HD Canvas - sized to fit tallest content:
    // logical y range is -22 (witch hat tip) to 67.5 (feet) = 89.5 units.
    // Canvas is 94 logical units tall (282px) with a +24 offset => 2u margins.
    const c = document.createElement('canvas'); c.width = 192; c.height = 282;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;

    // Scale Context by 3x so all existing 64px coordinates work, 
    // but we can draw sub-pixel (0.5) details for extra resolution.
    ctx.scale(3, 3);
    // Offset down to make room for tall ears and hats
    ctx.translate(0, 24);

    // Fix: Use HEX string for canvas drawing so shadeColor works (getStyle returns rgb())
    const col = '#' + new THREE.Color(hex).getHexString();
    const bellyCol = '#' + new THREE.Color(bellyHex).getHexString();
    const eyeCol = '#' + new THREE.Color(eyeHex).getHexString();

    drawSpecies(ctx, species, col, bellyCol, eyeCol, back, partColors, eyesClosed,false,skinOnly);

    // Body painting is a 3D-only cosmetic. Sprite textures stay untouched.
    if (skinOnly) drawBodyPaint(ctx, bodyPaint, back, bodyPaintColor);

    // UPDATE: Pass 'col' (body color) to drawShirt so it can fix necklines
    if(!skinOnly)drawPants(ctx,pantsId,back);
    drawShirt(ctx, shirtId, back, col);

    if(!skinOnly)drawCollar(ctx, collarId, back);

    // HAIR (Under Hat)
    if(!skinOnly)drawHair(ctx, hairId, hairColor, back);
    // Retained sprite mode also lets ears emerge through the hairstyle, outside the face.
    if(!skinOnly&&!['none','buzzed','undercut','slicked','mohawk'].includes(hairId)){
        ctx.save();ctx.beginPath();ctx.rect(0,-24,64,32);ctx.rect(0,8,16,26);ctx.rect(48,8,16,26);ctx.clip();
        drawSpecies(ctx,species,col,bellyCol,eyeCol,back,partColors,eyesClosed,true);ctx.restore();
    }

    // Chat "talking" frame: only on the front texture, and only when the
    // caller asked for it (the normal sprite keeps the original face).
    if (!skinOnly && !back && mouthOpen) drawTalkingMouth(ctx,typeof mouthOpen==='string'?mouthOpen:'ah');

    // EYES OVERLAY (To appear on top of hair/bangs)
    if (!back) {
        let parts;
        if (typeof species === 'string') {
            const speciesMapping = {
                cat: { ears: 'cat', eyes: 'standard', nose: 'cat', misc: 'none', tail: 'cat' },
                bunny: { ears: 'bunny', eyes: 'standard', nose: 'cat', misc: 'none', tail: 'bunny' },
                dog: { ears: 'dog', eyes: 'standard', nose: 'dog', misc: 'none', tail: 'dog' },
                bear: { ears: 'bear', eyes: 'standard', nose: 'bear', misc: 'none', tail: 'bear' },
                fox: { ears: 'fox', eyes: 'standard', nose: 'dog', misc: 'fox_cheeks', tail: 'fox' },
                pig: { ears: 'pig', eyes: 'standard', nose: 'pig', misc: 'none', tail: 'pig' },
                dragon: { ears: 'dragon', eyes: 'dragon', nose: 'dragon', misc: 'dragon_wings', tail: 'dragon' },
                mouse: { ears: 'mouse', eyes: 'standard', nose: 'mouse', misc: 'none', tail: 'mouse' },
                duck: { ears: 'none', eyes: 'standard', nose: 'duck', misc: 'none', tail: 'duck' },
                axolotl: { ears: 'none', eyes: 'standard', nose: 'axolotl', misc: 'axolotl_gills', tail: 'axolotl' },
                raccoon: { ears: 'raccoon', eyes: 'standard', nose: 'dog', misc: 'raccoon_mask', tail: 'raccoon' },
                koala: { ears: 'koala', eyes: 'standard', nose: 'koala', misc: 'none', tail: 'none' },
                lion: { ears: 'cat', eyes: 'standard', nose: 'cat', misc: 'lion_mane', tail: 'lion' },
                cow: { ears: 'cow', eyes: 'standard', nose: 'cow', misc: 'none', tail: 'cat' },
                frog: { ears: 'none', eyes: 'frog', nose: 'frog', misc: 'none', tail: 'frog' },
                monkey: { ears: 'monkey', eyes: 'standard', nose: 'monkey', misc: 'none', tail: 'monkey' },
                penguin: { ears: 'none', eyes: 'standard', nose: 'penguin', misc: 'penguin_belly', tail: 'penguin' },
            };
            parts = speciesMapping[species] || speciesMapping.cat;
        } else {
            parts = species;
        }
        if(parts.nose==='protogen')drawProtogenFace(ctx,eyeCol,eyesClosed,mouthOpen,!skinOnly,skinOnly);
        else drawEyes(ctx, eyesClosed?'blink':parts.eyes, eyeCol);
    }

    if(!skinOnly)drawHat(ctx, hatId, back);

    // One continuous outline around the finished figure (matches the fish art).
    if(!skinOnly)addSpriteOutline(ctx, c);

    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
}


function createFishTexture(fishName, colorHex) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');

    let fishData = null;
    if (typeof getFishByName === 'function') {
        fishData = getFishByName(fishName);
    }
    if (!fishData && typeof FISH_TYPES !== 'undefined') {
        fishData = FISH_TYPES.find(f => f.name === fishName);
    }
    const rarity = fishData ? fishData.rarity : "Common";
    const name = fishName.toLowerCase();
    let shape = fishData && fishData.shape ? fishData.shape : '';
    const species=String(fishData?.species||fishName).replace(/^Golden /i,'').toLowerCase();
    shape=({'koi':'carp','ozark cavefish':'tetra','southern cavefish':'tetra','northern cavefish':'tetra','gourami':'bass','wahoo':'mackerel','cobia':'mackerel','yellowtail':'trevally','amberjack':'trevally'})[species]||shape;
    const isShape = (...list) => shape ? list.includes(shape) : false;

    // --- 1. Palette ---
    const OUTLINE = '#111219';
    let baseCol = (typeof colorHex === 'string' && colorHex) ? colorHex : '#7fae7f';
    let fillStyle = null;      // gradient (or solid) used to fill the body
    let glowColor = null;
    let sheen = false;

    const linGrad = (stops) => {
        const g = ctx.createLinearGradient(0, 10, 0, 54);
        stops.forEach(s => g.addColorStop(s[0], s[1]));
        return g;
    };

    // Name-driven recolours (legendary / event variants)
    if (name.includes('golden')) {
        baseCol = '#e8b923';
        fillStyle = linGrad([[0, '#fff3b0'], [0.45, '#f5c518'], [1, '#9c6b0a']]);
    } else if (name.includes('rainbow') && !isShape('trout')) {
        fillStyle = linGrad([[0, '#ff5c5c'], [0.18, '#ffb84c'], [0.38, '#fff06b'], [0.58, '#66e08a'], [0.8, '#59a7ff'], [1, '#a868ff']]);
    } else if (name.includes('void') || name.includes('cosmic')) {
        baseCol = '#241035';
        fillStyle = linGrad([[0, '#3a1a5c'], [0.5, '#1a0b27'], [1, '#080410']]);
        glowColor = '#8f5bff';
    } else if (name.includes('lava') || name.includes('magma')) {
        baseCol = '#d8451d';
        fillStyle = linGrad([[0, '#ffd24a'], [0.45, '#ff6a2b'], [1, '#7c1e06']]);
        glowColor = '#ff5a1f';
    } else if (name.includes('ice') || name.includes('frost')) {
        baseCol = '#9fd8ef';
        fillStyle = linGrad([[0, '#eaffff'], [0.5, '#a9e0f5'], [1, '#4f9bc4']]);
        glowColor = '#5fd8ff';
    }

    if (!fillStyle) {
        fillStyle = linGrad([[0, shadeColor(baseCol, 0.25)], [0.5, baseCol], [1, shadeColor(baseCol, -0.28)]]);
    }

    // Rarity flourishes
    const hasScales = (rarity === 'Rare' || rarity === 'Epic' || name.includes('dragon'));
    const hasGlitter = (rarity === 'Legendary');
    if (rarity === 'Legendary' && !glowColor) glowColor = shadeColor(baseCol, 0.2);
    else if (rarity === 'Epic' && !glowColor) glowColor = shadeColor(baseCol, 0.08);
    if (rarity === 'Uncommon' || rarity === 'Epic') sheen = true;

    const finCol = shadeColor(baseCol, -0.12);
    const bellyCol = shadeColor(baseCol, 0.5);

    // Per-shape decorations, assigned in the shape section below.
    let eye = { x: 47, y: 28, r: 3 };
    let behind = null;   // drawn before the body (fins/tails/claws)
    let front = null;    // drawn after the outline (details on top)

    // --- 2. Build the silhouette (every fish faces right, kept inside 1..63) ---
    const p = new Path2D();

    // TYPE: BOOT ("Old Boot")
    if (isShape('boot') || name.includes('boot')) {
        p.moveTo(22, 10); p.lineTo(37, 10); p.lineTo(38, 32);
        p.lineTo(52, 35); p.quadraticCurveTo(59, 38, 57, 47);
        p.lineTo(55, 56); p.lineTo(21, 56); p.lineTo(20, 42);
        p.closePath();
        eye = null;
    }
    // TYPE: URCHIN
    else if (name.includes('urchin')) {
        p.arc(31, 33, 13, 0, Math.PI * 2);
        eye = null;
        behind = (g) => {
            g.strokeStyle = OUTLINE; g.lineWidth = 3.2; g.lineCap = 'round';
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2;
                g.beginPath();
                g.moveTo(31 + Math.cos(a) * 11.5, 33 + Math.sin(a) * 11.5);
                g.lineTo(31 + Math.cos(a) * 20, 33 + Math.sin(a) * 20);
                g.stroke();
            }
        };
    }
    // TYPE: SEAHORSE
    else if (isShape('seahorse') || name.includes('seahorse')) {
        p.moveTo(44, 12);
        p.quadraticCurveTo(51, 13, 49, 19);
        p.lineTo(54, 21);
        p.quadraticCurveTo(51, 25, 44, 24);
        p.quadraticCurveTo(38, 26, 36, 34);
        p.quadraticCurveTo(34, 43, 27, 46);
        p.quadraticCurveTo(19, 50, 24, 56);
        p.quadraticCurveTo(30, 60, 34, 54);
        p.quadraticCurveTo(38, 49, 44, 47);
        p.quadraticCurveTo(50, 44, 46, 33);
        p.quadraticCurveTo(42, 22, 44, 12);
        p.closePath();
        eye = { x: 45, y: 18, r: 2.4 };
    }
    // TYPE: TURTLE
    else if (name.includes('turtle')) {
        p.ellipse(30, 34, 17, 13, 0, 0, Math.PI * 2);
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            [[18, 22, -1, -1], [18, 46, -1, 1], [42, 22, 1, -1], [42, 46, 1, 1]].forEach(([fx, fy, sx, sy]) => {
                g.beginPath(); g.moveTo(fx, fy);
                g.lineTo(fx + sx * 7, fy + sy * 8);
                g.lineTo(fx + sx * 9, fy + sy * 1);
                g.closePath(); g.fill(); g.stroke();
            });
            g.fillStyle = finCol;
            g.beginPath(); g.moveTo(14, 34); g.lineTo(5, 30); g.lineTo(5, 38); g.closePath(); g.fill(); g.stroke();
            g.fillStyle = baseCol;
            g.beginPath(); g.arc(51, 34, 6, 0, Math.PI * 2); g.fill(); g.stroke();
        };
        eye = { x: 53, y: 32, r: 1.8 };
    }
    // TYPE: CRAB / LOBSTER
    else if (name.includes('crab') || name.includes('lobster')) {
        p.ellipse(32, 36, 15, 11, 0, 0, Math.PI * 2);
        behind = (g) => {
            g.lineJoin = 'round'; g.lineCap = 'round';
            g.strokeStyle = OUTLINE; g.lineWidth = 2.4;
            for (let i = 0; i < 3; i++) {
                const lx = 21 + i * 5;
                g.beginPath(); g.moveTo(lx, 44); g.lineTo(lx - 2, 55); g.stroke();
                g.beginPath(); g.moveTo(43 - i * 5, 44); g.lineTo(45 - i * 5, 55); g.stroke();
            }
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            [[20, 28, -1], [45, 28, 1]].forEach(([cx, cy, sx]) => {
                g.beginPath();
                g.moveTo(cx, cy + 4);
                g.lineTo(cx + sx * 11, cy - 7);
                g.lineTo(cx + sx * 15, cy + 3);
                g.lineTo(cx + sx * 5, cy + 8);
                g.closePath(); g.fill(); g.stroke();
            });
        };
        eye = { x: 40, y: 30, r: 2.4 };
        front = (g) => {
            g.fillStyle = '#ffffff'; g.beginPath(); g.arc(24, 30, 2.4, 0, Math.PI * 2); g.fill();
            g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
            g.fillStyle = '#0d0f16'; g.beginPath(); g.arc(25, 30, 1, 0, Math.PI * 2); g.fill();
        };
    }
    // TYPE: SQUID / JELLY / KRAKEN
    else if (name.includes('squid') || name.includes('jelly') || name.includes('kraken')) {
        const isJelly = name.includes('jelly');
        if (isJelly) {
            p.moveTo(16, 32);
            p.quadraticCurveTo(16, 12, 32, 12);
            p.quadraticCurveTo(48, 12, 48, 32);
            p.quadraticCurveTo(42, 38, 32, 38);
            p.quadraticCurveTo(22, 38, 16, 32);
            p.closePath();
        } else {
            p.moveTo(22, 34);
            p.quadraticCurveTo(20, 10, 32, 10);
            p.quadraticCurveTo(44, 10, 42, 34);
            p.quadraticCurveTo(36, 40, 32, 40);
            p.quadraticCurveTo(28, 40, 22, 34);
            p.closePath();
        }
        const tentacles = (g) => {
            const n = 4, x0 = isJelly ? 20 : 24, x1 = isJelly ? 44 : 40, y0 = isJelly ? 35 : 37;
            g.lineCap = 'round';
            for (let pass = 0; pass < 2; pass++) {
                g.strokeStyle = pass === 0 ? OUTLINE : finCol;
                g.lineWidth = pass === 0 ? 3.4 : 1.6;
                for (let i = 0; i < n; i++) {
                    const x = x0 + i * ((x1 - x0) / (n - 1));
                    g.beginPath(); g.moveTo(x, y0);
                    g.quadraticCurveTo(x - 3, y0 + 10, x + 3, y0 + 20);
                    g.stroke();
                }
            }
        };
        front = tentacles;
        eye = isJelly ? { x: 26, y: 24, r: 2.2 } : { x: 38, y: 22, r: 2.2 };
        if (!isJelly) {
            front = (g) => {
                tentacles(g);
                g.fillStyle = '#ffffff'; g.beginPath(); g.arc(24, 22, 2.2, 0, Math.PI * 2); g.fill();
                g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
                g.fillStyle = '#0d0f16'; g.beginPath(); g.arc(25, 22, 0.9, 0, Math.PI * 2); g.fill();
            };
        }
    }
    // TYPE: EEL / SERPENT / WORM
    else if (isShape('eel', 'loach', 'dragonfish', 'viperfish', 'gulper') || name.includes('eel') || name.includes('serpent') || name.includes('worm') || name.includes('leviathan') || name.includes('hydra') || name.includes('loach')) {
        p.moveTo(58, 22);
        p.bezierCurveTo(40, 12, 26, 40, 8, 30);
        p.lineTo(5, 38);
        p.bezierCurveTo(26, 48, 40, 24, 58, 32);
        p.closePath();
        eye = { x: 53, y: 26, r: 2.4 };
    }
    // TYPE: RAY / MANTA / SKATE
    else if (isShape('ray') || name.includes('ray') || name.includes('skate') || name.includes('manta')) {
        p.moveTo(32, 6);
        p.quadraticCurveTo(52, 16, 58, 32);
        p.quadraticCurveTo(46, 28, 32, 30);
        p.quadraticCurveTo(18, 28, 6, 32);
        p.quadraticCurveTo(12, 16, 32, 6);
        p.closePath();
        p.moveTo(29, 29); p.lineTo(34, 58); p.lineTo(30, 58); p.closePath();
        eye = { x: 42, y: 20, r: 2.4 };
        front = (g) => {
            g.fillStyle = '#ffffff'; g.beginPath(); g.arc(22, 20, 2.2, 0, Math.PI * 2); g.fill();
            g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
            g.fillStyle = '#0d0f16'; g.beginPath(); g.arc(21, 20, 0.9, 0, Math.PI * 2); g.fill();
        };
    }
    // TYPE: SHARK / WHALE / ORCA
    else if (isShape('shark') || name.includes('shark') || name.includes('whale') || name.includes('orca')) {
        const isWhale = name.includes('whale') || name.includes('orca');
        p.moveTo(58, 32);
        p.quadraticCurveTo(48, isWhale ? 21 : 22, 34, isWhale ? 21 : 22);
        p.quadraticCurveTo(22, isWhale ? 21 : 22, 15, 27);
        p.quadraticCurveTo(12, 30, 12, 32);
        p.quadraticCurveTo(12, 34, 15, 37);
        p.quadraticCurveTo(22, 43, 34, 43);
        p.quadraticCurveTo(48, 43, 58, 32);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(15, 29); g.lineTo(3, 16); g.lineTo(8, 32); g.lineTo(3, 48); g.lineTo(15, 35); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(27, isWhale ? 21 : 22); g.lineTo(34, isWhale ? 6 : 10); g.lineTo(44, isWhale ? 21 : 22); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(30, 37); g.lineTo(22, 47); g.lineTo(37, 42); g.closePath(); g.fill(); g.stroke();
        };
        eye = { x: 49, y: 29, r: 2.4 };
    }
    // TYPE: SWORD / MARLIN / SAILFISH / PIKE
    else if (isShape('pike', 'marlin', 'swordfish') || name.includes('sword') || name.includes('marlin') || name.includes('pike') || name.includes('sail')) {
        const isSail = name.includes('sail');
        p.moveTo(58, 30.5);
        p.lineTo(50, 28);
        p.quadraticCurveTo(40, 22, 30, 23);
        p.quadraticCurveTo(20, 24, 14, 28);
        p.lineTo(4, 18);
        p.lineTo(9, 32);
        p.lineTo(4, 46);
        p.lineTo(14, 36);
        p.quadraticCurveTo(20, 41, 30, 42);
        p.quadraticCurveTo(40, 43, 50, 37);
        p.lineTo(58, 33.5);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            if (isSail) {
                g.beginPath(); g.moveTo(20, 23); g.quadraticCurveTo(32, 5, 44, 22); g.closePath(); g.fill(); g.stroke();
            } else {
                g.beginPath(); g.moveTo(26, 23); g.lineTo(33, 11); g.lineTo(42, 23); g.closePath(); g.fill(); g.stroke();
            }
        };
        eye = { x: 47, y: 29, r: 2.4 };
    }
    // TYPE: PUFFERFISH
    else if (isShape('puffer') || name.includes('puffer')) {
        p.arc(31, 32, 14, 0, Math.PI * 2);
        behind = (g) => {
            g.lineCap = 'round';
            g.strokeStyle = OUTLINE; g.lineWidth = 3.2;
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2;
                g.beginPath();
                g.moveTo(31 + Math.cos(a) * 12.5, 32 + Math.sin(a) * 12.5);
                g.lineTo(31 + Math.cos(a) * 20, 32 + Math.sin(a) * 20);
                g.stroke();
            }
            g.fillStyle = finCol; g.lineJoin = 'round';
            g.beginPath(); g.moveTo(44, 32); g.lineTo(59, 24); g.lineTo(54, 32); g.lineTo(59, 40); g.closePath(); g.fill(); g.stroke();
        };
        eye = { x: 37, y: 28, r: 3.2 };
        front = (g) => {
            g.fillStyle = '#ffffff'; g.beginPath(); g.arc(24, 28, 3.2, 0, Math.PI * 2); g.fill();
            g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
            g.fillStyle = '#0d0f16'; g.beginPath(); g.arc(25, 28, 1.3, 0, Math.PI * 2); g.fill();
        };
    }
    // TYPE: ANGLERFISH
    else if (isShape('angler') || name.includes('angler')) {
        p.moveTo(58, 32);
        p.quadraticCurveTo(50, 23, 34, 22);
        p.quadraticCurveTo(18, 22, 13, 32);
        p.quadraticCurveTo(13, 42, 28, 46);
        p.quadraticCurveTo(44, 49, 56, 40);
        p.quadraticCurveTo(58, 37, 58, 30);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round'; g.lineCap = 'round';
            g.strokeStyle = OUTLINE; g.lineWidth = 3;
            g.beginPath(); g.moveTo(40, 24); g.quadraticCurveTo(45, 12, 52, 12); g.stroke();
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(15, 32); g.lineTo(4, 22); g.lineTo(8, 34); g.lineTo(4, 46); g.lineTo(16, 38); g.closePath(); g.fill(); g.stroke();
        };
        front = (g) => {
            g.fillStyle = '#ffe066'; g.beginPath(); g.arc(52, 12, 4, 0, Math.PI * 2); g.fill();
            g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
        };
        eye = { x: 44, y: 30, r: 2.6 };
    }
    // TYPE: PANFISH (bluegill etc.)
    else if (isShape('panfish')) {
        p.ellipse(31, 33, 15, 17, 0, 0, Math.PI * 2);
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            // spiny dorsal
            for (let i = 0; i < 6; i++) {
                const x = 23 + i * 4;
                g.beginPath(); g.moveTo(x, 19); g.lineTo(x + 2, 8 + (i % 2) * 2); g.lineTo(x + 4, 19); g.closePath(); g.fill(); g.stroke();
            }
            // fan tail
            g.beginPath(); g.moveTo(18, 29); g.quadraticCurveTo(2, 16, 5, 33); g.quadraticCurveTo(2, 50, 18, 38); g.closePath(); g.fill(); g.stroke();
            // pectoral
            g.beginPath(); g.moveTo(38, 34); g.quadraticCurveTo(33, 46, 44, 41); g.closePath(); g.fill(); g.stroke();
        };
        eye = { x: 40, y: 27, r: 3 };
    }
    // TYPE: CATFISH / BULLHEAD
    else if (isShape('catfish')) {
        p.moveTo(58, 30);
        p.quadraticCurveTo(50, 21, 34, 21);
        p.quadraticCurveTo(24, 21, 18, 27);
        p.lineTo(11, 24);
        p.quadraticCurveTo(5, 30, 11, 38);
        p.lineTo(18, 36);
        p.quadraticCurveTo(24, 42, 36, 43);
        p.quadraticCurveTo(50, 44, 58, 34);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            // tail
            g.beginPath(); g.moveTo(11, 27); g.lineTo(2, 18); g.lineTo(5, 32); g.lineTo(2, 45); g.lineTo(12, 36); g.closePath(); g.fill(); g.stroke();
            // long anal fin
            g.beginPath(); g.moveTo(23, 43); g.quadraticCurveTo(33, 50, 49, 43); g.lineTo(40, 48); g.closePath(); g.fill(); g.stroke();
        };
        front = (g) => {
            g.strokeStyle = OUTLINE; g.lineWidth = 1.6; g.lineCap = 'round';
            const whiskers = [
                [[56, 31], [63, 27], [61, 37]],
                [[56, 33], [63, 39], [58, 44]],
                [[53, 30], [59, 24], [56, 20]],
                [[53, 35], [58, 43], [52, 47]]
            ];
            whiskers.forEach(w => {
                g.beginPath(); g.moveTo(w[0][0], w[0][1]);
                g.quadraticCurveTo(w[1][0], w[1][1], w[2][0], w[2][1]);
                g.stroke();
            });
        };
        eye = { x: 49, y: 26, r: 2.6 };
    }
    // TYPE: STURGEON
    else if (isShape('sturgeon')) {
        p.moveTo(60, 29);
        p.lineTo(52, 27);
        p.quadraticCurveTo(38, 20, 22, 24);
        p.quadraticCurveTo(12, 27, 8, 33);
        p.quadraticCurveTo(12, 39, 22, 42);
        p.quadraticCurveTo(38, 46, 52, 35);
        p.lineTo(60, 33);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            // heterocercal tail
            g.beginPath(); g.moveTo(10, 31); g.lineTo(2, 14); g.lineTo(8, 32); g.lineTo(2, 48); g.lineTo(11, 36); g.closePath(); g.fill(); g.stroke();
            // scutes
            g.fillStyle = shadeColor(baseCol, 0.18);
            for (let i = 0; i < 5; i++) {
                const x = 20 + i * 7;
                g.beginPath(); g.moveTo(x, 24); g.lineTo(x + 3, 19); g.lineTo(x + 6, 24); g.closePath(); g.fill(); g.stroke();
            }
        };
        front = (g) => {
            g.strokeStyle = OUTLINE; g.lineWidth = 1.4; g.lineCap = 'round';
            g.beginPath(); g.moveTo(58, 31); g.quadraticCurveTo(62, 35, 58, 38); g.stroke();
            g.beginPath(); g.moveTo(55, 34); g.quadraticCurveTo(58, 42, 51, 43); g.stroke();
        };
        eye = { x: 51, y: 27, r: 2.2 };
    }
    // TYPE: BETTA
    else if (isShape('betta')) {
        p.ellipse(32, 32, 11, 13, 0, 0, Math.PI * 2);
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            // huge flowing tail
            g.beginPath(); g.moveTo(23, 24); g.quadraticCurveTo(4, 8, 2, 27); g.quadraticCurveTo(1, 34, 6, 38); g.quadraticCurveTo(1, 47, 23, 43); g.closePath(); g.fill(); g.stroke();
            // dorsal
            g.beginPath(); g.moveTo(27, 20); g.quadraticCurveTo(33, 3, 43, 20); g.closePath(); g.fill(); g.stroke();
            // anal
            g.beginPath(); g.moveTo(27, 44); g.quadraticCurveTo(34, 58, 44, 43); g.closePath(); g.fill(); g.stroke();
        };
        front = (g) => {
            g.strokeStyle = finCol; g.lineWidth = 1.6; g.lineCap = 'round';
            g.beginPath(); g.moveTo(34, 40); g.quadraticCurveTo(32, 51, 38, 57); g.stroke();
            g.beginPath(); g.moveTo(37, 39); g.quadraticCurveTo(38, 50, 43, 55); g.stroke();
        };
        eye = { x: 39, y: 28, r: 2.6 };
    }
    // TYPE: ANGELFISH
    else if (isShape('angelfish')) {
        p.moveTo(52, 32);
        p.quadraticCurveTo(46, 24, 38, 23);
        p.lineTo(31, 10);
        p.quadraticCurveTo(24, 20, 22, 30);
        p.lineTo(16, 41);
        p.quadraticCurveTo(24, 40, 30, 42);
        p.quadraticCurveTo(38, 44, 44, 39);
        p.quadraticCurveTo(50, 37, 52, 32);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(33, 14); g.lineTo(29, 3); g.lineTo(37, 12); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(27, 41); g.lineTo(22, 53); g.lineTo(34, 43); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(19, 28); g.quadraticCurveTo(3, 18, 7, 32); g.quadraticCurveTo(3, 47, 19, 37); g.closePath(); g.fill(); g.stroke();
        };
        eye = { x: 43, y: 28, r: 2.8 };
    }
    // TYPE: PLECO (armoured catfish)
    else if (isShape('pleco')) {
        p.moveTo(58, 34);
        p.quadraticCurveTo(48, 24, 30, 26);
        p.quadraticCurveTo(18, 27, 12, 32);
        p.quadraticCurveTo(18, 40, 30, 41);
        p.quadraticCurveTo(48, 42, 58, 34);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(13, 28); g.lineTo(2, 20); g.lineTo(5, 32); g.lineTo(2, 44); g.lineTo(14, 36); g.closePath(); g.fill(); g.stroke();
            // tall dorsal
            g.beginPath(); g.moveTo(30, 26); g.lineTo(27, 10); g.lineTo(42, 25); g.closePath(); g.fill(); g.stroke();
        };
        front = (g) => {
            g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
            for (let x = 22; x < 50; x += 6) {
                g.beginPath(); g.moveTo(x, 27); g.lineTo(x + 2, 40); g.stroke();
            }
            g.fillStyle = shadeColor(baseCol, -0.28);
            g.beginPath(); g.arc(54, 35, 3.2, 0, Math.PI * 2); g.fill();
            g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
        };
        eye = { x: 49, y: 29, r: 2.1 };
    }
    // TYPE: BOWFIN
    else if (isShape('bowfin')) {
        p.moveTo(57, 31);
        p.quadraticCurveTo(48, 23, 34, 23);
        p.quadraticCurveTo(22, 23, 15, 28);
        p.lineTo(8, 24);
        p.quadraticCurveTo(4, 32, 8, 39);
        p.lineTo(15, 36);
        p.quadraticCurveTo(22, 41, 34, 41);
        p.quadraticCurveTo(48, 41, 57, 34);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            // long dorsal ribbon
            g.beginPath(); g.moveTo(16, 25); g.quadraticCurveTo(32, 12, 48, 23); g.lineTo(45, 20); g.quadraticCurveTo(31, 14, 18, 23); g.closePath(); g.fill(); g.stroke();
            // rounded tail
            g.beginPath(); g.moveTo(10, 25); g.quadraticCurveTo(1, 19, 3, 33); g.quadraticCurveTo(1, 46, 11, 38); g.closePath(); g.fill(); g.stroke();
        };
        eye = { x: 48, y: 27, r: 2.6 };
    }
    // TYPE: SNAKEHEAD
    else if (isShape('snakehead')) {
        p.moveTo(58, 31);
        p.quadraticCurveTo(51, 25, 42, 25);
        p.quadraticCurveTo(28, 25, 18, 29);
        p.lineTo(9, 26);
        p.quadraticCurveTo(5, 32, 9, 38);
        p.lineTo(18, 35);
        p.quadraticCurveTo(28, 40, 42, 39);
        p.quadraticCurveTo(51, 39, 58, 34);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(17, 27); g.quadraticCurveTo(33, 19, 49, 27); g.lineTo(46, 24); g.quadraticCurveTo(31, 21, 19, 27); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(18, 36); g.quadraticCurveTo(33, 44, 47, 36); g.lineTo(43, 41); g.quadraticCurveTo(31, 45, 20, 39); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(10, 27); g.quadraticCurveTo(1, 22, 4, 33); g.quadraticCurveTo(1, 44, 11, 37); g.closePath(); g.fill(); g.stroke();
        };
        eye = { x: 50, y: 27, r: 2.4 };
    }
    // TYPE: AROWANA
    else if (isShape('arowana')) {
        p.moveTo(59, 30);
        p.quadraticCurveTo(50, 23, 36, 23);
        p.quadraticCurveTo(24, 23, 16, 28);
        p.lineTo(7, 22);
        p.quadraticCurveTo(4, 32, 7, 42);
        p.lineTo(16, 36);
        p.quadraticCurveTo(24, 41, 36, 41);
        p.quadraticCurveTo(50, 41, 59, 34);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(17, 27); g.quadraticCurveTo(31, 22, 43, 26); g.lineTo(40, 23); g.quadraticCurveTo(30, 22, 19, 26); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(16, 36); g.quadraticCurveTo(30, 42, 41, 37); g.lineTo(37, 41); g.quadraticCurveTo(29, 44, 18, 39); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(9, 26); g.lineTo(2, 17); g.lineTo(5, 32); g.lineTo(2, 47); g.lineTo(10, 38); g.closePath(); g.fill(); g.stroke();
        };
        front = (g) => {
            g.strokeStyle = OUTLINE; g.lineWidth = 1.4; g.lineCap = 'round';
            g.beginPath(); g.moveTo(57, 31); g.quadraticCurveTo(63, 28, 61, 24); g.stroke();
            g.beginPath(); g.moveTo(57, 33); g.quadraticCurveTo(63, 37, 60, 41); g.stroke();
        };
        eye = { x: 50, y: 27, r: 2.5 };
    }
    // TYPE: TUNA / TREVALLY
    else if (isShape('tuna', 'trevally')) {
        p.moveTo(58, 32);
        p.quadraticCurveTo(48, 22, 36, 22);
        p.quadraticCurveTo(24, 22, 16, 28);
        p.lineTo(12, 26);
        p.lineTo(8, 15);
        p.lineTo(6, 32);
        p.lineTo(8, 49);
        p.lineTo(12, 38);
        p.lineTo(16, 36);
        p.quadraticCurveTo(24, 42, 36, 42);
        p.quadraticCurveTo(48, 42, 58, 32);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(25, 23); g.lineTo(29, 8); g.lineTo(39, 23); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(28, 39); g.lineTo(32, 51); g.lineTo(40, 39); g.closePath(); g.fill(); g.stroke();
        };
        eye = { x: 49, y: 28, r: 2.8 };
    }
    // TYPE: MAHI-MAHI
    else if (isShape('mahi')) {
        p.moveTo(58, 31);
        p.lineTo(53, 22);
        p.quadraticCurveTo(42, 20, 30, 22);
        p.quadraticCurveTo(20, 24, 14, 30);
        p.lineTo(6, 20);
        p.lineTo(10, 32);
        p.lineTo(6, 46);
        p.lineTo(14, 36);
        p.quadraticCurveTo(20, 41, 30, 42);
        p.quadraticCurveTo(42, 43, 53, 37);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            // long dorsal from forehead to tail
            g.beginPath(); g.moveTo(51, 23); g.quadraticCurveTo(34, 8, 17, 28); g.lineTo(24, 23); g.quadraticCurveTo(37, 17, 48, 26); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(14, 31); g.lineTo(2, 20); g.lineTo(6, 32); g.lineTo(2, 45); g.lineTo(15, 37); g.closePath(); g.fill(); g.stroke();
        };
        eye = { x: 49, y: 27, r: 2.7 };
    }
    // TYPE: LIONFISH
    else if (isShape('lionfish')) {
        p.ellipse(32, 33, 13, 15, 0, 0, Math.PI * 2);
        behind = (g) => {
            g.lineCap = 'round';
            for (let pass = 0; pass < 2; pass++) {
                g.strokeStyle = pass === 0 ? OUTLINE : finCol;
                g.lineWidth = pass === 0 ? 3.2 : 1.5;
                for (let i = 0; i < 14; i++) {
                    const a = (i / 14) * Math.PI * 2;
                    const x0 = 32 + Math.cos(a) * 12;
                    const y0 = 33 + Math.sin(a) * 13;
                    const x1 = 32 + Math.cos(a) * (22 + (i % 2) * 4);
                    const y1 = 33 + Math.sin(a) * (23 + (i % 2) * 4);
                    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
                }
            }
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(19, 29); g.quadraticCurveTo(3, 20, 7, 33); g.quadraticCurveTo(3, 46, 20, 37); g.closePath(); g.fill(); g.stroke();
        };
        eye = { x: 40, y: 28, r: 2.7 };
    }
    // TYPE: FLATFISH (halibut / flounder)
    else if (isShape('flatfish')) {
        p.moveTo(20, 20);
        p.lineTo(43, 26);
        p.lineTo(52, 32);
        p.lineTo(43, 38);
        p.lineTo(20, 44);
        p.lineTo(7, 32);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(10, 28); g.lineTo(2, 22); g.lineTo(4, 32); g.lineTo(2, 42); g.lineTo(10, 36); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(21, 20); g.lineTo(27, 10); g.lineTo(35, 22); g.closePath(); g.fill(); g.stroke();
        };
        front = (g) => {
            g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
            g.beginPath(); g.moveTo(15, 31); g.quadraticCurveTo(30, 27, 47, 31); g.stroke();
            // both eyes on the upper side
            [[40, 27], [46, 30]].forEach(([ex, ey]) => {
                g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex, ey, 2.6, 0, Math.PI * 2); g.fill();
                g.strokeStyle = OUTLINE; g.lineWidth = 1; g.stroke();
                g.fillStyle = '#0d0f16'; g.beginPath(); g.arc(ex + 0.7, ey, 1.2, 0, Math.PI * 2); g.fill();
            });
        };
        eye = null;
    }
    // TYPE: OARFISH
    else if (isShape('oarfish')) {
        p.moveTo(58, 29);
        p.quadraticCurveTo(42, 25, 24, 28);
        p.quadraticCurveTo(12, 30, 5, 33);
        p.quadraticCurveTo(14, 35, 24, 36);
        p.quadraticCurveTo(42, 38, 58, 33);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            // long dorsal ribbon
            g.beginPath(); g.moveTo(52, 27); g.quadraticCurveTo(34, 17, 8, 29); g.lineTo(12, 31); g.quadraticCurveTo(36, 23, 52, 30); g.closePath(); g.fill(); g.stroke();
            // head crest
            g.beginPath(); g.moveTo(49, 26); g.lineTo(55, 14); g.lineTo(58, 27); g.closePath(); g.fill(); g.stroke();
        };
        eye = { x: 53, y: 29, r: 2.2 };
    }
    // TYPE: COELACANTH
    else if (isShape('coelacanth')) {
        p.moveTo(56, 31);
        p.quadraticCurveTo(48, 21, 34, 21);
        p.quadraticCurveTo(20, 21, 14, 28);
        p.lineTo(6, 22);
        p.lineTo(9, 32);
        p.lineTo(6, 42);
        p.lineTo(14, 36);
        p.quadraticCurveTo(20, 43, 34, 43);
        p.quadraticCurveTo(48, 43, 56, 33);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            // lobed pectoral / pelvic fins
            [[40, 36], [27, 38], [20, 34]].forEach(([fx, fy]) => {
                g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx - 3, fy + 8); g.lineTo(fx + 5, fy + 5); g.closePath(); g.fill(); g.stroke();
            });
            // three-lobed tail
            g.beginPath(); g.moveTo(12, 28); g.lineTo(2, 20); g.lineTo(7, 32); g.lineTo(2, 44); g.lineTo(12, 36); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(12, 32); g.lineTo(3, 32); g.lineTo(8, 35); g.closePath(); g.fill(); g.stroke();
        };
        front = (g) => {
            g.fillStyle = 'rgba(255,255,255,0.65)';
            [[24, 28], [33, 25], [41, 30], [30, 34], [45, 34]].forEach(([sx, sy]) => {
                g.beginPath(); g.arc(sx, sy, 1.5, 0, Math.PI * 2); g.fill();
            });
        };
        eye = { x: 49, y: 27, r: 2.6 };
    }
    // TYPE: ROUND (koi, goldfish, sunfish, discus, betta, flounder...)
    else if (isShape('goldfish', 'discus', 'sunfish', 'clownfish', 'tang') || name.includes('sunfish') || name.includes('discus') || name.includes('goldfish') || name.includes('betta') || name.includes('pleco') || name.includes('flounder') || name.includes('bluegill')) {
        p.ellipse(30, 32, 16, 18, 0, 0, Math.PI * 2);
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(16, 25); g.quadraticCurveTo(1, 14, 6, 32); g.quadraticCurveTo(1, 50, 16, 39); g.closePath(); g.fill(); g.stroke();
            g.beginPath(); g.moveTo(24, 15); g.quadraticCurveTo(32, 3, 40, 17); g.closePath(); g.fill(); g.stroke();
        };
        eye = { x: 39, y: 26, r: 3 };
    }
    // TYPE: STANDARD (Default)
    else {
        p.moveTo(57, 31);
        p.quadraticCurveTo(50, 20, 36, 20);
        p.quadraticCurveTo(22, 20, 14, 27);
        p.lineTo(4, 18);
        p.lineTo(11, 32);
        p.lineTo(4, 46);
        p.lineTo(14, 37);
        p.quadraticCurveTo(22, 44, 36, 44);
        p.quadraticCurveTo(50, 44, 57, 31);
        p.closePath();
        behind = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(23, 21); g.quadraticCurveTo(30, 9, 41, 22); g.closePath(); g.fill(); g.stroke();
        };
        front = (g) => {
            g.lineJoin = 'round';
            g.fillStyle = finCol; g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(30, 35); g.quadraticCurveTo(23, 44, 36, 42); g.closePath(); g.fill(); g.stroke();
        };
        eye = { x: 47, y: 28, r: 3 };
    }

    if(/cavefish|blindcat/.test(species)||species==='mexican tetra')eye=null;
    // --- 3. Draw ---
    ctx.lineJoin = 'round';

    if (behind) { ctx.save(); behind(ctx); ctx.restore(); }

    ctx.fillStyle = fillStyle;
    ctx.fill(p);

    // --- 4. Body details (clipped to the silhouette) ---
    ctx.save();
    ctx.clip(p);

    // Scales
    if (hasScales) {
        ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
        for (let y = 8; y < 60; y += 5) {
            for (let x = 6 + ((y / 5) % 2) * 3; x < 62; x += 6) {
                ctx.beginPath(); ctx.arc(x, y, 2.2, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
            }
        }
    }

    // Shape / species patterns
    if (name.includes('clown') || isShape('clownfish')) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        [20, 32, 44].forEach(bx => ctx.fillRect(bx, 0, 4, 64));
    } else if (isShape('bass')) {
        // Largemouth bass: dark lateral stripe
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(8, 27, 46, 5);
    } else if (isShape('bluegill', 'panfish')) {
        // Bluegill: vertical dark bars
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        [18, 27, 36, 45].forEach(bx => ctx.fillRect(bx, 12, 3, 40));
    } else if (isShape('angelfish')) {
        // Angelfish: vertical black bands
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        [24, 34, 44].forEach(bx => ctx.fillRect(bx, 4, 4, 56));
    } else if (isShape('perch', 'mackerel', 'arowana', 'discus', 'lionfish', 'snakehead')) {
        ctx.fillStyle = isShape('lionfish') ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.18)';
        for (let x = 12; x < 58; x += 8) ctx.fillRect(x, 0, 4, 64);
    } else if (isShape('trout', 'salmon', 'cod', 'catfish', 'flatfish', 'mahi')) {
        ctx.fillStyle = 'rgba(0,0,0,0.24)';
        for (let i = 0; i < 16; i++) {
            ctx.beginPath(); ctx.arc(8 + (i * 37) % 48, 10 + (i * 23) % 42, 2.2, 0, Math.PI * 2); ctx.fill();
        }
    } else if (isShape('tetra')) {
        ctx.fillStyle = 'rgba(220,60,40,0.55)';
        ctx.fillRect(0, 37, 64, 18);
    } else if (isShape('puffer')) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (let i = 0; i < 12; i++) {
            ctx.beginPath(); ctx.arc(12 + (i * 31) % 40, 14 + (i * 19) % 36, 2.6, 0, Math.PI * 2); ctx.fill();
        }
    } else if (isShape('ray', 'manta')) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        [[20, 14], [30, 20], [42, 16], [26, 30], [38, 34]].forEach(([sx, sy]) => {
            ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill();
        });
    } else if (isShape('sunfish', 'halibut')) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        for (let i = 0; i < 14; i++) {
            ctx.beginPath(); ctx.arc(10 + (i * 29) % 44, 12 + (i * 23) % 40, 2.4, 0, Math.PI * 2); ctx.fill();
        }
    } else if (isShape('coelacanth')) {
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        [[24, 28], [33, 25], [41, 30], [30, 34], [45, 34]].forEach(([sx, sy]) => {
            ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, Math.PI * 2); ctx.fill();
        });
    } else if (name.includes('striped')) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (let x = 12; x < 58; x += 8) ctx.fillRect(x, 0, 4, 64);
    } else if (name.includes('spotted')) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        for (let i = 0; i < 16; i++) {
            ctx.beginPath(); ctx.arc(8 + (i * 37) % 48, 10 + (i * 23) % 42, 2.4, 0, Math.PI * 2); ctx.fill();
        }
    } else if (name.includes('mud')) {
        ctx.fillStyle = 'rgba(60,40,20,0.28)'; ctx.fillRect(0, 0, 64, 64);
    }

    // Belly shading
    if (eye) {
        ctx.fillStyle = bellyCol; ctx.globalAlpha = 0.45;
        ctx.beginPath(); ctx.ellipse(34, 40, 17, 6, -0.12, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
    }

    if(fishData?.event==='hollowtide2026'){
        ctx.fillStyle='#ffe5a1';
        if(fishData.detail==='bones'){ctx.fillRect(18,29,29,2);for(let x=20;x<46;x+=6)ctx.fillRect(x,23,2,14);}
        else if(fishData.detail==='candy'){ctx.fillStyle='#fff6d6';ctx.fillRect(0,5,20,54);ctx.fillStyle='#ed892b';ctx.fillRect(23,0,20,64);}
        else if(fishData.detail==='jack'){ctx.beginPath();ctx.moveTo(24,24);ctx.lineTo(28,31);ctx.lineTo(20,31);ctx.fill();ctx.fillRect(31,32,10,3);}
        else{for(let x=18;x<50;x+=8){ctx.beginPath();ctx.arc(x,27+(x%3)*3,2,0,Math.PI*2);ctx.fill();}}
    }
    // Sheen for uncommon / epic
    if (sheen) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath(); ctx.ellipse(30, 22, 12, 5, -0.3, 0, Math.PI * 2); ctx.fill();
    }

    // Glitter for legendary
    if (hasGlitter) {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 14; i++) {
            ctx.beginPath(); ctx.arc((i * 29) % 60 + 2, (i * 17) % 60 + 2, (i % 3) * 0.6 + 0.7, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.restore();

    // --- 5. Outline ---
    if (glowColor) {
        ctx.save();
        ctx.globalAlpha = rarity === 'Legendary' ? 0.6 : 0.4;
        ctx.lineWidth = rarity === 'Legendary' ? 6 : 4;
        ctx.strokeStyle = glowColor;
        ctx.stroke(p);
        ctx.restore();
    }
    ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE; ctx.stroke(p);
    if (rarity === 'Epic') { ctx.lineWidth = 1; ctx.strokeStyle = shadeColor(baseCol, 0.15); ctx.stroke(p); }

    // --- 6. Front details (fins drawn over the body) ---
    if (front) { ctx.save(); front(ctx); ctx.restore(); }

    // --- 7. Eyes ---
    if (eye) {
        ctx.lineWidth = 1;
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(eye.x, eye.y, eye.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = OUTLINE; ctx.stroke();
        ctx.fillStyle = '#0d0f16';
        ctx.beginPath(); ctx.arc(eye.x + eye.r * 0.35, eye.y, eye.r * 0.5, 0, Math.PI * 2); ctx.fill();
    }

    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
}

function createNameTagTexture(n) {
    const text=String(n||'Fisher'),c=document.createElement('canvas'),x=c.getContext('2d');
    x.font='bold 32px Arial';
    c.width=Math.max(256,Math.ceil(x.measureText(text).width)+24);c.height=64;
    // Resizing a canvas resets its font and alignment.
    x.font='bold 32px Arial';x.textAlign='center';
    x.fillStyle='black';x.fillText(text,c.width/2+1,44);
    x.fillStyle='white';x.fillText(text,c.width/2-1,42);
    const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;return t;
}

function createTitleTexture(titleId) {
    const tObj = TITLE_TYPES.find(t => t.id === titleId) || TITLE_TYPES[0];
    const text = tObj.text;
    if (!text) return null;

    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
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

    const rCol = rod.color || '#DAA520';
    const reelCol = rod.reel || '#8B4513';

    // Special effects or themed render
    if (rod.id === 'banana_rod') {
        // Nano Banana Rod: Curved organic yellow taper with banana peel tip & leaf guides
        ctx.strokeStyle = '#ffe135';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(5, 59);
        ctx.quadraticCurveTo(34, 30, 59, 5);
        ctx.stroke();

        // Banana ridge highlight
        ctx.strokeStyle = '#fff59d';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(6, 58);
        ctx.quadraticCurveTo(34, 29, 58, 6);
        ctx.stroke();

        // Grip (organic wood/leaf stem)
        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(5, 59); ctx.lineTo(15, 49);
        ctx.stroke();

        // Reel: Golden banana wheel
        ctx.fillStyle = '#ffb300';
        ctx.beginPath(); ctx.arc(14, 50, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe082';
        ctx.beginPath(); ctx.arc(14, 50, 2.5, 0, Math.PI * 2); ctx.fill();

        // Banana leaf line guides
        ctx.fillStyle = '#7cb342';
        ctx.fillRect(24, 39, 3, 3);
        ctx.fillRect(37, 26, 3, 3);
        ctx.fillRect(50, 13, 3, 3);

        const t = new THREE.CanvasTexture(c);
        t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
        return t;
    }

    // Glow effect for magical/legendary rods
    if (rod.id === 'lava') {
        ctx.shadowColor = '#ff3d00'; ctx.shadowBlur = 8;
    } else if (rod.id === 'ice') {
        ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 8;
    } else if (rod.id === 'void') {
        ctx.shadowColor = '#7c4dff'; ctx.shadowBlur = 10;
    } else if (rod.id === 'diamond' || rod.id === 'golden') {
        ctx.shadowColor = rCol; ctx.shadowBlur = 7;
    }

    // 1. ROD BLANK (Diagonal)
    ctx.strokeStyle = rCol;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(5, 59);
    ctx.lineTo(59, 5);
    ctx.stroke();

    // Blank top highlight reflection
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(6, 58);
    ctx.lineTo(58, 6);
    ctx.stroke();
    ctx.shadowBlur = 0; // Clear glow

    // Fancy wraps / patterns for candy or rainbow
    if (rod.id === 'candy') {
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(5, 59); ctx.lineTo(59, 5); ctx.stroke();
        ctx.setLineDash([]);
    } else if (rod.id === 'rainbow') {
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = `hsl(${i * 60}, 100%, 60%)`;
            const pos = 18 + i * 8;
            ctx.fillRect(pos - 1, 64 - pos - 2, 4, 4);
        }
    }

    // 2. ERGONOMIC GRIP (Handle - cork / carbon / foam)
    ctx.strokeStyle = (rod.id === 'carbon') ? '#111' : (rod.id === 'bamboo') ? '#c29b38' : '#3e2723';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(4, 60); ctx.lineTo(15, 49);
    ctx.stroke();
    // Grip rings
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(7, 56, 2, 2); ctx.fillRect(11, 52, 2, 2);

    // 3. SPINNING REEL & SEAT
    // Reel seat mount
    ctx.fillStyle = '#424242';
    ctx.fillRect(12, 48, 5, 4);

    // Spool body
    ctx.fillStyle = reelCol;
    ctx.beginPath(); ctx.arc(13, 53, 5.5, 0, Math.PI * 2); ctx.fill();
    // Reel rotor / inner spool rim
    ctx.fillStyle = shadeColor(reelCol, 0.3);
    ctx.beginPath(); ctx.arc(13, 53, 3, 0, Math.PI * 2); ctx.fill();
    // Crank handle
    ctx.fillStyle = '#b0bec5';
    ctx.fillRect(7, 52, 3, 2);
    ctx.beginPath(); ctx.arc(7, 51, 1.5, 0, Math.PI * 2); ctx.fill();

    // 4. LINE GUIDES WITH CERAMIC INSERTS
    const guides = [
        { x: 22, y: 42, size: 4 },
        { x: 34, y: 30, size: 3.5 },
        { x: 46, y: 18, size: 3 },
        { x: 57, y: 7, size: 2.5 }
    ];

    guides.forEach(g => {
        // Guide frame
        ctx.fillStyle = '#78909c';
        ctx.fillRect(g.x, g.y, g.size, g.size);
        // Ceramic insert hole
        ctx.fillStyle = '#263238';
        ctx.fillRect(g.x + 0.8, g.y + 0.8, g.size - 1.6, g.size - 1.6);
    });

    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
}

// --- CHARACTER BODY (sprite or procedural 3D model) ------------------------
// Keep the playerSprite name and cosmetic config in both modes so movement,
// equipment changes, networking and NPC interactions share the same lifecycle.
// Normalise a saved cosmetic config into the values createSpeciesTexture()
// needs. Shared by the normal body and the lazy "talking" front texture so the
// open mouth is drawn on exactly the same character.
function characterLookFromCfg(cfg) {
    cfg = cfg || {};
    const base = (cfg.color != null) ? cfg.color : '#ffffff';
    const belly = (cfg.belly != null && cfg.belly !== '') ? cfg.belly : base;
    const useParts = !!(cfg.ears || cfg.eyes || cfg.nose || cfg.tail || cfg.misc);
    const parts = useParts
        ? { ears: cfg.ears || 'none', eyes: cfg.eyes || 'standard', nose: cfg.nose || 'cat', misc: cfg.misc || 'none', tail: cfg.tail || 'none' }
        : (cfg.species || 'cat');
    const pc = {
        protogenLogo:globalThis.window?.ProtogenLogo?.normalize(cfg.protogenLogo)||'',
        earsColor: cfg.earsColor || '', noseColor: cfg.noseColor || '',
        miscColor: cfg.miscColor || '', tailColor: cfg.tailColor || '',
        handColor: cfg.handColor || '', footColor: cfg.footColor || '', tailAccentColor: cfg.tailAccentColor || ''
    };
    return { base, belly, parts, pc };
}

function createBodySideTexture(baseColor, paint, customColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 24; canvas.height = 23;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + new THREE.Color(baseColor).getHexString();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawBodyPaint(ctx, paint, false, customColor, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
    return texture;
}

function makeCharacterBody(cfg, kind = 'npc') {
    cfg = cfg || {};
    const look = characterLookFromCfg(cfg);
    const base = look.base, belly = look.belly, parts = look.parts, pc = look.pc;
    const solid = kind==='studio-thumbnail'||!!saveState.model3D;
    if (solid && window.Character3D && Character3D.buildCharacter) {
        // Crop painted surface details onto separately modeled head and torso.
        // Skin-only textures omit sprite parts already supplied by 3D geometry.
        const front=createSpeciesTexture(parts,base,belly,false,'none',cfg.shirt||'none','none',cfg.eye||'#000000',pc,'none','',false,false,'none',true,cfg.bodyPaint||'',cfg.bodyPaintColor||'#ffffff');
        const blink=createSpeciesTexture(parts,base,belly,false,'none',cfg.shirt||'none','none',cfg.eye||'#000000',pc,'none','',false,true,'none',true,cfg.bodyPaint||'',cfg.bodyPaintColor||'#ffffff');
        const back=createSpeciesTexture(parts,base,belly,true,'none',cfg.shirt||'none','none',cfg.eye||'#000000',pc,'none','',false,false,'none',true,cfg.bodyPaintBack||'',cfg.bodyPaintColor||'#ffffff');
        function crop(texture,x,y,w,h,paint='') {
            const canvas=document.createElement('canvas');canvas.width=w*3;canvas.height=h*3;
            const ctx=canvas.getContext('2d');ctx.fillStyle='#'+new THREE.Color(base).getHexString();ctx.fillRect(0,0,canvas.width,canvas.height);
            const sourceScale=texture.image.width/64;
            ctx.drawImage(texture.image,x*sourceScale,(y+24)*sourceScale,w*sourceScale,h*sourceScale,0,0,canvas.width,canvas.height);
            const bp=window.BodyPaint;
            if(paint&&bp)drawBodyPaint(ctx,paint,false,cfg.bodyPaintColor||'#ffffff',0,0,canvas.width/bp.width,canvas.height/bp.height);
            const tex=new THREE.CanvasTexture(canvas);tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;return tex;
        }
        const assets={headBlink:crop(blink,16,8,32,26,cfg.bodyPaintHeadFront||''),headFront:crop(front,16,8,32,26,cfg.bodyPaintHeadFront||''),headBack:crop(back,16,8,32,26,cfg.bodyPaintHeadBack||''),torsoFront:crop(front,20,35,24,23),torsoBack:crop(back,20,35,24,23),
            hat:HAT_TYPES.find(v=>v.id===cfg.hat),shirt:SHIRT_TYPES.find(v=>v.id===cfg.shirt&&v.id!=='none'),pants:PANTS_TYPES.find(v=>v.id===cfg.pants&&v.id!=='none'),collar:COLLAR_TYPES.find(v=>v.id===cfg.collar)};
        const sideBase=assets.shirt?assets.shirt.color:base;
        assets.torsoLeft=createBodySideTexture(sideBase,assets.shirt?'':cfg.bodyPaintLeft||'',cfg.bodyPaintColor||'#ffffff');
        assets.torsoRight=createBodySideTexture(sideBase,assets.shirt?'':cfg.bodyPaintRight||'',cfg.bodyPaintColor||'#ffffff');
        if(cfg.bodyPaintHeadLeft)assets.headLeft=createBodySideTexture(base,cfg.bodyPaintHeadLeft,cfg.bodyPaintColor||'#ffffff');
        if(cfg.bodyPaintHeadRight)assets.headRight=createBodySideTexture(base,cfg.bodyPaintHeadRight,cfg.bodyPaintColor||'#ffffff');
        if(cfg.bodyPaintHeadTop)assets.headTop=createBodySideTexture(base,cfg.bodyPaintHeadTop,cfg.bodyPaintColor||'#ffffff');
        if(cfg.bodyPaintHeadBottom)assets.headBottom=createBodySideTexture(base,cfg.bodyPaintHeadBottom,cfg.bodyPaintColor||'#ffffff');
        if(!assets.shirt){
            if(cfg.bodyPaintArmLeft)assets.armLeft=createBodySideTexture(base,cfg.bodyPaintArmLeft,cfg.bodyPaintColor||'#ffffff');
            if(cfg.bodyPaintArmRight)assets.armRight=createBodySideTexture(base,cfg.bodyPaintArmRight,cfg.bodyPaintColor||'#ffffff');
        }
        if(!assets.pants){
            if(cfg.bodyPaintLegLeft)assets.legLeft=createBodySideTexture(base,cfg.bodyPaintLegLeft,cfg.bodyPaintColor||'#ffffff');
            if(cfg.bodyPaintLegRight)assets.legRight=createBodySideTexture(base,cfg.bodyPaintLegRight,cfg.bodyPaintColor||'#ffffff');
        }
        if(assets.pants)assets.pantsTexture=createPantsTexture(assets.pants);
        const body=Character3D.buildCharacter(cfg,look,assets);
        front.dispose();back.dispose();blink.dispose();assets.headBlink.dispose();assets.torsoLeft.dispose();assets.torsoRight.dispose();
        assets.headLeft?.dispose();assets.headRight?.dispose();assets.headTop?.dispose();assets.headBottom?.dispose();assets.armLeft?.dispose();assets.armRight?.dispose();assets.legLeft?.dispose();assets.legRight?.dispose();
        body.position.y=1.46875;body.userData.kind=kind;body.userData.baseColor=base;
        return body;
    }
    const tf = createSpeciesTexture(parts, base, belly, false, cfg.hat || 'none', cfg.shirt || 'none', cfg.collar || 'none', cfg.eye || '#000000', pc, cfg.hair || 'none', cfg.hairColor || '',false,false,cfg.pants||'none',false,cfg.bodyPaint||'',cfg.bodyPaintColor||'#ffffff');
    const tb = createSpeciesTexture(parts, base, belly, true, cfg.hat || 'none', cfg.shirt || 'none', cfg.collar || 'none', cfg.eye || '#000000', pc, cfg.hair || 'none', cfg.hairColor || '',false,false,cfg.pants||'none',false,cfg.bodyPaintBack||'',cfg.bodyPaintColor||'#ffffff');
    const m1 = new THREE.MeshBasicMaterial({ map: tf, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
    const m2 = new THREE.MeshBasicMaterial({ map: tb, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.9375), m1);
    mesh.name = 'playerSprite';
    mesh.position.y = 1.46875;
    mesh.userData = { matFront: m1, matBack: m2, is3D: false, baseColor: base, cfg: cfg, kind: kind };
    return mesh;
}

// Build (once, on first chat) a front texture with the mouth open. Swapping to
// it for a few frames is much cheaper than re-rendering the whole sprite every
// time somebody speaks.
function ensureOpenMouthMaterial(sprite,shape=0) {
    const u = sprite && sprite.userData;
    if (!u) return null;
    shape=Math.max(0,Math.min(4,Math.floor(shape)||0));
    if(!u.matFrontOpenFrames)u.matFrontOpenFrames=[];
    if(u.matFrontOpenFrames[shape])return u.matFrontOpenFrames[shape];
    const cfg = u.cfg || {};
    const look = characterLookFromCfg(cfg);
    const tex = createSpeciesTexture(look.parts, look.base, look.belly, false,
        cfg.hat || 'none', cfg.shirt || 'none', cfg.collar || 'none',
        cfg.eye || '#000000', look.pc,
        cfg.hair || 'none', cfg.hairColor || '', TALK_MOUTH_SHAPES[shape].name,false,cfg.pants||'none',false,cfg.bodyPaint||'',cfg.bodyPaintColor||'#ffffff');
    u.matFrontOpenFrames[shape] = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5
    });
    return u.matFrontOpenFrames[shape];
}

// Tear down a body mesh/group and release its GPU resources.
function disposeCharacterBody(body) {
    if(!body)return;
    const materials=new Set(),textures=new Set();
    const add=m=>{if(m){materials.add(m);if(m.map)textures.add(m.map);}};
    if(body.userData) {for(const material of Object.values(body.userData.blinkMaterials||{}))add(material);add(body.userData.matFront);add(body.userData.matBack);add(body.userData.matFrontOpen);for(const material of body.userData.matFrontOpenFrames||[])add(material);}
    const collect=o=>{if(o.geometry)o.geometry.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(add);};
    body.traverse(collect);
    if(body.userData&&body.userData.modelSources)body.userData.modelSources.traverse(collect);
    textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
}

// Replace a character's body using the current model mode.
function replaceCharacterBody(group, cfg) {
    if (!group) return null;
    const old = group.getObjectByName('playerSprite');
    const solid=!!saveState.model3D;
    if(old?.userData.cfg){for(const flag of ['holdingRod','holdingFish','holdingTool','sitting','bellySliding'])if(cfg[flag]===undefined&&old.userData.cfg[flag]!==undefined)cfg={...cfg,[flag]:old.userData.cfg[flag]};}
    // Equipment/label updates often call this with identical body cosmetics.
    if(old&&old.userData.is3D===solid&&JSON.stringify(old.userData.cfg)===JSON.stringify(cfg))return old;
    if (old) { disposeCharacterBody(old); group.remove(old); }
    const body = makeCharacterBody(cfg, group.userData.characterKind || 'npc');
    body.position.y = 1.46875;
    if (old) body.renderOrder = old.renderOrder;
    group.add(body);
    return body;
}

// Rod pose (outer rotation.x). The billboard has the rod drawn diagonally
// inside its plane, so -0.2 / 0.8 sit it up then cast it out flat.
const ROD_IDLE_2D = -0.2, ROD_CAST_2D = 0.8;

// Resting/casting angle for the rod billboard.
function rodAngleFor(rod, casting) {
    return rod?.userData?.is3D ? (casting?1.05:.3) : (casting ? ROD_CAST_2D : ROD_IDLE_2D);
}

// A billboard fishing rod named "rod".
function makeRod(rodId) {
    rodId = rodId || 'bamboo';
    if(saveState.model3D&&window.Character3D?.buildRod){
        const r=Character3D.buildRod(ROD_TYPES.find(v=>v.id===rodId)||ROD_TYPES[0]);
        r.position.set(.56,.84875,.43);r.rotation.x=rodAngleFor(r,false);return r;
    }
    const rodTex = createRodTexture(rodId);
    const rodMat = new THREE.MeshBasicMaterial({ map: rodTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
    const rodGeo = new THREE.PlaneGeometry(3.0, 3.0);
    rodGeo.translate(1.5, 1.5, 0);
    const r = new THREE.Mesh(rodGeo, rodMat);
    r.position.set(0.6, 0.96, 0.1);
    r.rotation.set(-0.2, -Math.PI / 2, 0);
    r.name = 'rod';r.userData={rodId,is3D:false};
    return r;
}

// A held "trophy" fish.  Always a real 3D model when Character3D is available;
// a billboard sprite is only the fallback.  Keeps the historic name
// 'heldFishSprite' so existing lookups keep working; userData.is3D tells the
// two apart.
function makeHeldFish(fishName, color, size) {
    const s = size || 1.0;
    if(saveState.model3D&&window.Character3D?.buildFish){
        const held=new THREE.Group(),fish=Character3D.buildFish(fishName,color);
        const bounds=new THREE.Box3().setFromObject(fish),width=bounds.max.x-bounds.min.x;
        const scale=1.4*THREE.MathUtils.clamp(s,.6,1.6)/Math.max(width,.01);
        fish.scale.setScalar(scale);fish.position.set(-(bounds.min.x+bounds.max.x)*.5*scale,-bounds.min.y*scale+.025,-(bounds.min.z+bounds.max.z)*.5*scale);
        held.add(fish);held.name='heldFishSprite';held.userData={fishName,color,size:s,is3D:true};held.position.set(.56,1.01875,.5);return held;
    }
    const fTex = createFishTexture(fishName, color);
    const fMat = new THREE.SpriteMaterial({ map: fTex, transparent: true, alphaTest: 0.5 });
    const sp = new THREE.Sprite(fMat);
    sp.name = 'heldFishSprite';
    sp.userData = { fishName: fishName, color, size:s, is3D: false };
    sp.position.set(0.6, 1.5, 0.5);
    sp.scale.set(1.5 * s, 1.5 * s, 1);
    return sp;
}

// Cosmetic config for the local player, straight from saveState.
function characterCfgFromSave(state = saveState) {
    return {
        color: state.catColor, belly: state.bellyColor, eye: state.eyeColor,
        species: state.species,
        protogenLogo:globalThis.window?.ProtogenLogo?.normalize(state.protogenLogo)||'',
        ears: state.currentEars, eyes: state.currentEyes, nose: state.currentNose,
        misc: state.currentMisc, tail: state.currentTail,
        earsColor: state.earsColor || '', noseColor: state.noseColor || '',
        miscColor: state.miscColor || '', tailColor: state.tailColor || '',
        handColor: state.handColor || '', footColor: state.footColor || '', tailAccentColor: state.tailAccentColor || '',
        hat: state.currentHat, shirt: state.currentShirt, pants: state.currentPants, collar: state.currentCollar,
        bodyPaint: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaint) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaint) : '')),
        bodyPaintBack: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaintBack) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaintBack) : '')),
        bodyPaintLeft: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaintLeft) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaintLeft) : '')),
        bodyPaintRight: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaintRight) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaintRight) : '')),
        bodyPaintHeadFront: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaintHeadFront) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaintHeadFront) : '')),
        bodyPaintHeadBack: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaintHeadBack) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaintHeadBack) : '')),
        bodyPaintHeadLeft: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaintHeadLeft) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaintHeadLeft) : '')),
        bodyPaintHeadRight: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaintHeadRight) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaintHeadRight) : '')),
        bodyPaintHeadTop: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaintHeadTop) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaintHeadTop) : '')),
        bodyPaintHeadBottom: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaintHeadBottom) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaintHeadBottom) : '')),
        bodyPaintArmLeft: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaintArmLeft) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaintArmLeft) : '')),
        bodyPaintArmRight: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaintArmRight) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaintArmRight) : '')),
        bodyPaintLegLeft: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaintLegLeft) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaintLegLeft) : '')),
        bodyPaintLegRight: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(state.bodyPaintLegRight) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(state.bodyPaintLegRight) : '')),
        bodyPaintColor: (typeof normalizeBodyPaintColor === 'function' ? normalizeBodyPaintColor(state.bodyPaintColor) : (typeof window !== 'undefined' && window.BodyPaint?.normalizeColor ? window.BodyPaint.normalizeColor(state.bodyPaintColor) : '#ffffff')),
        hair: state.currentHair, hairColor: state.hairColor || ''
    };
}

// Cosmetics for a networked player.
function characterCfgFromData(data) {
    data = data || {};
    return {
        color: data.color || 0xcccccc,
        belly: data.belly,
        eye: data.eye || '#000000',
        species: data.species || 'cat',
        protogenLogo:globalThis.window?.ProtogenLogo?.normalize(data.protogenLogo)||'',
        ears: data.ears, eyes: data.eyes, nose: data.nose, misc: data.misc, tail: data.tail,
        earsColor: data.earsColor || '', noseColor: data.noseColor || '',
        miscColor: data.miscColor || '', tailColor: data.tailColor || '',
        handColor: data.handColor || '', footColor: data.footColor || '', tailAccentColor: data.tailAccentColor || '',
        hat: data.hat || 'none', shirt: data.shirt || 'none', pants: data.pants || 'none', collar: data.collar || 'none',
        bodyPaint: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaint) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaint) : '')),
        bodyPaintBack: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaintBack) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaintBack) : '')),
        bodyPaintLeft: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaintLeft) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaintLeft) : '')),
        bodyPaintRight: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaintRight) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaintRight) : '')),
        bodyPaintHeadFront: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaintHeadFront) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaintHeadFront) : '')),
        bodyPaintHeadBack: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaintHeadBack) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaintHeadBack) : '')),
        bodyPaintHeadLeft: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaintHeadLeft) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaintHeadLeft) : '')),
        bodyPaintHeadRight: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaintHeadRight) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaintHeadRight) : '')),
        bodyPaintHeadTop: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaintHeadTop) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaintHeadTop) : '')),
        bodyPaintHeadBottom: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaintHeadBottom) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaintHeadBottom) : '')),
        bodyPaintArmLeft: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaintArmLeft) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaintArmLeft) : '')),
        bodyPaintArmRight: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaintArmRight) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaintArmRight) : '')),
        bodyPaintLegLeft: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaintLegLeft) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaintLegLeft) : '')),
        bodyPaintLegRight: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(data.bodyPaintLegRight) : (typeof window !== 'undefined' && window.BodyPaint?.normalize ? window.BodyPaint.normalize(data.bodyPaintLegRight) : '')),
        bodyPaintColor: (typeof normalizeBodyPaintColor === 'function' ? normalizeBodyPaintColor(data.bodyPaintColor) : (typeof window !== 'undefined' && window.BodyPaint?.normalizeColor ? window.BodyPaint.normalizeColor(data.bodyPaintColor) : '#ffffff')),
        hair: data.hair || 'none', hairColor: data.hairColor || ''
    };
}

function createPlayerMesh(col, name, hatId = 'none', eyeHex = '#000000', species = 'cat', titleId = 'none', rodId = 'bamboo', hairId = 'none', hairColor = '') {
    const g = new THREE.Group();

    // Body (2D cosmetic billboard)
    const cfg = {
        color: col, belly: '#ffffff', eye: eyeHex, species: species,
        hat: hatId, shirt: 'none', collar: 'none', bodyPaint: '',
        hair: hairId, hairColor: hairColor || ''
    };
    g.add(makeCharacterBody(cfg));

    // Name & Title
    const ntMat = new THREE.SpriteMaterial({ map: createNameTagTexture(name), depthWrite: false, depthTest: false });
    const nt = new THREE.Sprite(ntMat);
    nt.position.y = 3.05; nt.scale.set(3*ntMat.map.image.width/256, 0.75, 1); nt.name = "nameTag";
    nt.renderOrder = 100;nt.visible=typeof hudVisible==='undefined'||hudVisible;
    g.add(nt);

    const tTex = createTitleTexture(titleId);
    if (tTex) {
        const titleMat = new THREE.SpriteMaterial({ map: tTex, depthWrite: false, depthTest: false });
        const titleSprite = new THREE.Sprite(titleMat);
        titleSprite.position.y = 3.45; titleSprite.scale.set(3, 0.75, 1);
        titleSprite.name = "titleSprite";
        titleSprite.renderOrder = 101;
        titleSprite.visible = hudVisible && saveState.showTitles;
        g.add(titleSprite);
    }

    const st = createSpeakerTexture();
    const sm = new THREE.SpriteMaterial({ map: st, transparent: true, depthWrite: false, depthTest: false });
    const sp = new THREE.Sprite(sm);
    sp.position.y = 3.95; sp.scale.set(0.5, 0.5, 1); sp.name = "talkingIcon"; sp.visible = false;
    sp.renderOrder = 102;
    g.add(sp);

    // --- ROD (billboard plane) ---
    g.add(makeRod(rodId));

    return g;
}

function createLocalPlayer() {
    player = createPlayerMesh(saveState.catColor, saveState.displayName, saveState.currentHat, saveState.eyeColor, saveState.species, saveState.currentTitle, saveState.currentRod, saveState.currentHair, saveState.hairColor);
    player.userData.characterKind = 'player';

    // Give local player's UI elements higher renderOrder so they overlap other players
    const nameTag = player.getObjectByName('nameTag');
    if (nameTag) nameTag.renderOrder = 200;
    const titleSprite = player.getObjectByName('titleSprite');
    if (titleSprite) titleSprite.renderOrder = 201;
    const talkingIcon = player.getObjectByName('talkingIcon');
    if (talkingIcon) talkingIcon.renderOrder = 202;

    updateLocalVisuals();
    if (window.CUSTOM_LEVEL && window.Level) {
        // Spawn on the first patch of land found near the middle of the level.
        const spot = findCustomSpawn(window.CUSTOM_LEVEL);
        player.position.set(spot.x, window.Level.sampleHeight(window.CUSTOM_LEVEL, spot.x, spot.z), spot.z);
    } else {
        player.position.set(25, 0, 0);
    }
    attachSailBoat(player);
    scene.add(player);
}

// Build the rowboat the player sits in while sailing and parent it to the
// player group, hidden until boarded. Named "sailBoat" so toggleSailing() can
// find it. The player is a group, so the boat inherits position + facing.
function attachSailBoat(group) {
    if (!group || group.getObjectByName('sailBoat')) return;
    const boat = makeSailBoatMesh();
    boat.name = 'sailBoat';
    boat.visible = false;
    group.add(boat);
    return boat;
}

// A chunky, readable rowboat scaled to sit around the player. Built from boxes
// and a hull shell so it reads clearly from the game's camera distance.
function createBoatTexture() {
    const c = document.createElement('canvas'); c.width = 32; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 32, 64);

    ctx.fillStyle = '#8B5A2B';
    ctx.fillRect(4, 4, 24, 56);
    ctx.strokeStyle = '#3E2723';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 24, 56);
    ctx.fillStyle = '#6D4C41';
    ctx.fillRect(8, 10, 16, 44);
    ctx.fillStyle = '#5C3A1E';
    ctx.fillRect(10, 18, 4, 12);
    ctx.fillRect(18, 18, 4, 12);
    ctx.fillRect(10, 34, 4, 12);
    ctx.fillRect(18, 34, 4, 12);
    ctx.fillStyle = '#7A5230';
    ctx.fillRect(2, 30, 28, 4);

    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
}

function makeSailBoatMesh() {
    if(window.Rowboat3D)return Rowboat3D.build();
    const tex = createBoatTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), mat);
    sp.name = 'sailBoat';
    sp.rotation.x = -Math.PI / 2;
    sp.position.y = 0.1;
    sp.userData.isSailBoat = true;
    return sp;
}

// Finds a walkable land cell close to the centre of a custom level.
function findCustomSpawn(lv) {
    // A spawn set in the level editor wins when it is still on dry land.
    const placed = window.Level && Level.spawnPoint ? Level.spawnPoint(lv) : null;
    if (placed) return placed;
    const g = lv.grid;
    const mid = Math.floor(g / 2);
    for (let ring = 0; ring < g; ring++) {
        for (let dz = -ring; dz <= ring; dz++) {
            for (let dx = -ring; dx <= ring; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
                const gx = mid + dx, gz = mid + dz;
                if (gx < 0 || gz < 0 || gx >= g || gz >= g) continue;
                if (lv.heights[gz * g + gx] > lv.seaLevel + 0.5) return Level.cellCenter(lv, gx, gz);
            }
        }
    }
    return { x: 0, z: 0 };
}

// The stock map puts the Inferno Guard at (16, 16), which can be underwater or
// buried on an authored map. If the editor did not place a lava NPC, put the
// keeper on a dry, clear cell within a few steps of the custom spawn instead.
function findCustomLavaKeeperSpot(lv) {
    if (!lv || !window.Level) return null;
    const spawn = findCustomSpawn(lv);
    if (!spawn) return null;
    const base = Level.worldToCell(lv, spawn.x, spawn.z);
    const sea = lv.seaLevel;
    const blocked = (x, y, z) =>
        treeColliders.some(c => Math.hypot(x - c.x, z - c.z) < (c.radius || 0) + 1.1) ||
        lv.npcs.some(n => Math.hypot(x - n.x, z - n.z) < 2.5) ||
        staticColliders.some(c => staticColliderHits(c, { x, y: y + .2, z }, .8, 2.4));
    for (let ring = 1; ring <= 5; ring++) {
        for (let dz = -ring; dz <= ring; dz++) {
            for (let dx = -ring; dx <= ring; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
                const gx = base.gx + dx, gz = base.gz + dz;
                if (gx < 0 || gz < 0 || gx >= lv.grid || gz >= lv.grid) continue;
                const p = Level.cellCenter(lv, gx, gz);
                const y = Level.sampleHeight(lv, p.x, p.z);
                if (y <= sea + .35 || blocked(p.x, y, p.z)) continue;
                return { x: p.x, y, z: p.z };
            }
        }
    }
    // A one-cell island can leave no free ring cell; the spawn itself is still
    // dry and the keeper remains reachable there.
    const y = Level.sampleHeight(lv, spawn.x, spawn.z);
    return y > sea + .35 ? { x: spawn.x, y, z: spawn.z } : null;
}

function renderKeybinds() {
    let container = document.getElementById('keybinds-container');

    // If it doesn't exist yet, create the container inside options-container
    if (!container) {
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
        if (keyDisplay === 'Space') keyDisplay = 'SPACE';
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
    if (e.code === 'Escape' && action !== 'menu') {
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
    if (confirm("Reset all controls to default?")) {
        saveState.keybinds = { ...DEFAULT_KEYBINDS };
        saveGame();
        renderKeybinds();
    }
}

// --- CHAT VOICE (Animal Crossing-style) ----------------------------------
// Chat messages make the speaker's mouth flap and emit a short pitched blip
// per character. The blips go through Sound.playSpatial(), so they use the same
// HRTF panner as other world sounds, with a 50-unit voice range: stand next
// to someone to hear them, walk away and they fade out.
function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

const TALK_MOUTH_SHAPES=[
    {name:'ah',rx:3.2,ry:3.1,width:.08,height:.11,tilt:0},
    {name:'ee',rx:4.5,ry:1.35,width:.12,height:.045,teeth:true,tilt:0},
    {name:'oh',rx:2.7,ry:3.5,width:.065,height:.115,tilt:0},
    {name:'oo',rx:1.8,ry:2.1,width:.043,height:.075,tilt:0},
    {name:'smile',rx:4,ry:1.7,width:.11,height:.055,teeth:true,tilt:-.08}
];
function startPlayerTalking(mesh, text, speakerId) {
    if (!mesh || !mesh.userData) return;
    const clean = String(text || '').slice(0, 256);
    if (!clean.trim()) return;
    const now = performance.now();
    // Stable per-speaker pitch, with a little melodic variation per letter.
    mesh.userData.talkPitch = hashString(String(speakerId || 'player')) % 12;
    mesh.userData.talkText = clean;
    mesh.userData.talkIndex = 0;
    mesh.userData.talkNext = now;
    mesh.userData.talkLastBlip = 0;
    mesh.userData.talkUntil = now + Math.min(5000, 600 + clean.length * 60);
    mesh.userData.talking = true;
    mesh.userData.talkMouthOpen = false;
}

// Advance every speaker's mouth/voice for this frame. Runs before the sprite
// direction pass so the front material can pick the open-mouth frame.
function updateTalkingPlayers(now) {
    const meshes = [];
    if (typeof player !== 'undefined' && player) meshes.push(player);
    if (typeof otherPlayers !== 'undefined' && otherPlayers) {
        for (const id in otherPlayers) {
            if (otherPlayers[id] && otherPlayers[id].mesh) meshes.push(otherPlayers[id].mesh);
        }
    }

    for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        const u = mesh.userData;
        if(!u)continue;
        const voice=!!u.voiceEnabled&&now-(u.voiceSampleAt||0)<200&&((u.voiceLevel||0)>.015||now<(u.voiceHoldUntil||0));
        const chat=now<(u.talkUntil||0)&&u.talkText&&u.talkIndex<u.talkText.length;
        u.talking=false;u.talkMouthOpen=false;u.mouthAmount=0;
        if(chat){
            if(now>=(u.talkNext||0)){
                let ch='';while(u.talkIndex<u.talkText.length){ch=u.talkText[u.talkIndex++];if(ch.trim())break;ch='';}
                if(ch){
                    const offset=(ch.charCodeAt(0)%5)-2,variant=((u.talkPitch+offset)%12+12)%12;
                    if(!voice)try{Sound.playSpatial('talk',mesh.position,variant);}catch(error){}
                    const vowels={a:0,e:1,i:1,o:2,u:3};u.mouthShape=vowels[ch.toLowerCase()]??(ch.charCodeAt(0)%5);
                    u.talkLastBlip=now;u.talkNext=now+72+Math.random()*46;
                }else u.talkNext=now+80;
            }
            u.talking=true;u.talkMouthOpen=now-(u.talkLastBlip||0)<55;u.mouthAmount=u.talkMouthOpen?.75:0;
        }else u.talkUntil=0;
        if(voice){
            u.talking=true;u.talkMouthOpen=Math.sin(now*.04)>-.2;
            u.mouthShape=(Math.floor(now/110)+Math.floor((u.voiceLevel||0)*4)+(u.talkPitch||0))%5;
            u.mouthAmount=u.talkMouthOpen?Math.min(1,.2+(u.voiceLevel||0)*.8):0;
        }
    }
}

function setSitting(value){
    if(!player)return false;
    if(value){
        const ground=getTerrainHeight(player.position.x,player.position.z);
        const stand=typeof standableTopAt==='function'?standableTopAt(player.position.x,player.position.z,player.position.y):-Infinity;
        if(isDiving||isProne||isSailing||playerVelocity.y!==0||player.position.y>Math.max(ground,stand)+.2||fishingState!=='idle'||isGuitarActive||isGloveActive)return false;
    }
    isSitting=!!value;controls.jump=false;lastJumpTime=0;playerVelocity.x=0;playerVelocity.z=0;
    if(typeof sendUpdate==='function')sendUpdate();return true;
}
function applySittingPose(owner,active,dt){
    let body=owner.getObjectByName('playerSprite');if(!body)return;
    const wasSitting=!!body.userData.sitting;
    if(body.userData.is3D&&body.userData.cfg&&!!body.userData.cfg.sitting!==active){
        const pos=body.position.clone(),rot=body.rotation.clone(),scale=body.scale.clone();
        body=replaceCharacterBody(owner,{...body.userData.cfg,sitting:active});body.position.copy(pos);body.rotation.copy(rot);body.scale.copy(scale);
    }
    body.userData.sitting=active;
    if(active){
        const idle=owner.userData.seatedIdle||(owner.userData.seatedIdle={time:Math.random()*10});
        idle.time+=Math.min(Math.max(dt||0,0),.1);
        if(body.userData.is3D){if(typeof window!=='undefined'){
            window.Character3D?.animateStanding(body,idle.time,1,0);
            const reel=owner.userData.reelAnimation;
            if(owner.userData.sharedBoat&&reel?.weight>0)window.Character3D?.animateReel(body,reel.phase,reel.weight);
        }}
        else{
            if(body.userData.seatedScaleY===undefined)body.userData.seatedScaleY=body.scale.y;
            body.scale.y=body.userData.seatedScaleY*(1+Math.sin(idle.time*1.7)*.004);
        }
    }else if(wasSitting&&!body.userData.is3D){body.scale.y=body.userData.seatedScaleY??body.scale.y;delete body.userData.seatedScaleY;}
    if(active||wasSitting){
        const blend=1-Math.exp(-14*dt);
        body.position.y=THREE.MathUtils.lerp(body.position.y,active?1.16-(body.userData.upperLift||0):1.46875,blend);
        body.rotation.x=THREE.MathUtils.lerp(body.rotation.x,active&&!body.userData.is3D?-.12:0,blend);
        body.rotation.z=THREE.MathUtils.lerp(body.rotation.z,0,blend);
    }
}

function bellySlideDirection(view,input,lastMove,facing) {
    const forward=new THREE.Vector3();view.getWorldDirection(forward);forward.y=0;
    if(forward.lengthSq()<.000001)forward.set(0,0,1);forward.normalize();
    const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0));
    const direction=new THREE.Vector3().addScaledVector(forward,(input.forward?1:0)-(input.backward?1:0)).addScaledVector(right,(input.right?1:0)-(input.left?1:0));
    if(direction.lengthSq()<.000001&&lastMove)direction.set(lastMove.x,0,lastMove.z);
    if(direction.lengthSq()<.000001)direction.set(Math.sin(facing),0,Math.cos(facing));
    return direction.normalize();
}
function applyBellySlidePose(owner,active,dt) {
    let body=owner.getObjectByName('playerSprite');if(!body)return;
    if(body.userData.is3D&&body.userData.cfg&&!!body.userData.cfg.bellySliding!==active){
        const pos=body.position.clone(),rot=body.rotation.clone(),scale=body.scale.clone();
        body=replaceCharacterBody(owner,{...body.userData.cfg,bellySliding:active});
        body.position.copy(pos);body.rotation.copy(rot);body.scale.copy(scale);
    }
    if(active){
        const blend=1-Math.exp(-16*dt);
        body.rotation.x=THREE.MathUtils.lerp(body.rotation.x,Math.PI/2,blend);
        body.rotation.z=THREE.MathUtils.lerp(body.rotation.z,0,blend);
        body.position.y=THREE.MathUtils.lerp(body.position.y,body.userData.is3D?.86:.6,blend);
    }
}

function characterBlinkClosed(owner,now){
    const u=owner.userData;
    if(!Number.isFinite(u.nextBlink))u.nextBlink=now+2200+Math.random()*2200;
    if(now>=u.nextBlink){u.blinkUntil=now+140;u.nextBlink=now+2400+Math.random()*2400;}
    return now<(u.blinkUntil||0);
}
function ensureBlinkMaterial(sprite,mouth){
    const u=sprite.userData,key=mouth===false?'rest':String(mouth);
    if(!u.blinkMaterials)u.blinkMaterials={};if(u.blinkMaterials[key])return u.blinkMaterials[key];
    const cfg=u.cfg||{},look=characterLookFromCfg(cfg);
    const tex=createSpeciesTexture(look.parts,look.base,look.belly,false,cfg.hat||'none',cfg.shirt||'none',cfg.collar||'none',cfg.eye||'#000000',look.pc,cfg.hair||'none',cfg.hairColor||'',mouth===false?false:TALK_MOUTH_SHAPES[mouth].name,true,cfg.pants||'none',false,cfg.bodyPaint||'',cfg.bodyPaintColor||'#ffffff');
    return u.blinkMaterials[key]=new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,alphaTest:.5});
}

function sync3DRodGrip(obj) {
    if (!obj) return;
    // Keep this on the function rather than in a module-level binding: the game
    // UI tests evaluate the function in isolation, and this still allocates the
    // list only once per page.
    const toolNames = sync3DRodGrip._toolNames || (sync3DRodGrip._toolNames = [['axe', 'axe'], ['pickaxe', 'pickaxe'], ['axeMesh', 'axe'], ['pickaxeMesh', 'pickaxe'], ['guitarMesh', 'guitar'], ['gloveMesh', 'glove']]);
    const u = obj.userData || (obj.userData = {});
    const childCount = () => obj.children ? obj.children.length : 0;
    let cache = u.heldCache;
    const refresh = () => {
        cache = { mode: saveState.model3D, childCount: childCount() };
        for (const [name] of toolNames) cache[name] = obj.getObjectByName(name);
        cache.rod = obj.getObjectByName('rod');
        cache.fish = obj.getObjectByName('heldFishSprite');
        cache.body = obj.getObjectByName('playerSprite');
        u.heldCache = cache;
    };
    let stale = !cache || cache.mode !== saveState.model3D || cache.childCount !== childCount();
    if (!stale) {
        if (cache.body && cache.body.parent !== obj) stale = true;
        if (!stale) for (const [name] of toolNames) { const item = cache[name]; if (item && item.parent !== obj) { stale = true; break; } }
        if (!stale && cache.rod && cache.rod.parent !== obj) stale = true;
        if (!stale && cache.fish && cache.fish.parent !== obj) stale = true;
    }
    if (stale) refresh();

    const model3D = !!saveState.model3D;
    for (const [name, type] of toolNames) {
        const old = cache[name];
        if (old && !!old.userData.is3D !== model3D) {
            const tool = makeHeldTool(type, name);
            tool.visible = old.visible;
            old.parent.remove(old);
            disposeCharacterBody(old);
            obj.add(tool);
            cache[name] = tool;
        }
    }
    let rod = cache.rod;
    if (rod && !!rod.userData.is3D !== model3D) {
        const old = rod, casting = old.rotation.x > .6, visible = old.visible;
        rod = makeRod(old.userData.rodId || 'bamboo');
        rod.visible = visible;
        rod.rotation.x = rodAngleFor(rod, casting);
        old.parent.remove(old);
        disposeCharacterBody(old);
        obj.add(rod);
        cache.rod = rod;
    }
    let fish = cache.fish;
    if (fish && !!fish.userData.is3D !== model3D) {
        const old = fish;
        fish = makeHeldFish(old.userData.fishName, old.userData.color, old.userData.size);
        fish.visible = old.visible;
        old.parent.remove(old);
        disposeCharacterBody(old);
        obj.add(fish);
        cache.fish = fish;
    }
    let body = cache.body;
    if (!body || !body.userData.is3D || !body.userData.cfg) return;
    let heldTool = null;
    for (const [name] of toolNames) {
        const item = cache[name];
        if (item && item.visible) { heldTool = item; break; }
    }
    const suppressed = !!obj.userData.emoting;
    const holdingFish = !!fish?.visible && !suppressed, holding = !!rod?.visible && !holdingFish && !heldTool && !suppressed, holdingTool = !!heldTool && !suppressed;
    if (!!body.userData.cfg.holdingRod !== holding || !!body.userData.cfg.holdingFish !== holdingFish || !!body.userData.cfg.holdingTool !== holdingTool) {
        const pos = body.position.clone(), rot = body.rotation.clone(), scale = body.scale.clone();
        body = replaceCharacterBody(obj, { ...body.userData.cfg, holdingRod: holding, holdingFish, holdingTool });
        body.position.copy(pos); body.rotation.copy(rot); body.scale.copy(scale);
        cache.body = body;
    }
    const lift = body.userData.upperLift || 0;
    if (holding) { body.updateMatrix(); rod.position.set(.56, -.62 + lift, .43); if (body.userData.standingTransform) rod.position.applyMatrix4(body.userData.standingTransform); rod.position.applyMatrix4(body.matrix); rod.rotation.z = body.rotation.z + (body.userData.standingAngle || 0); rod.rotation.y = body.rotation.y; }
    if (holdingTool && heldTool.userData.is3D) { body.updateMatrix(); const guitar = heldTool.userData.toolType === 'guitar'; heldTool.position.set(guitar ? .3 : .56, (guitar ? -.42 : -.62) + lift, guitar ? .5 : .43 + (heldTool.userData.punchOffset || 0)); if (body.userData.standingTransform) heldTool.position.applyMatrix4(body.userData.standingTransform); heldTool.position.applyMatrix4(body.matrix); }
    if (holdingFish) {
        body.updateMatrix(); fish.position.set(.56, -.45 + lift, .5); if (body.userData.standingTransform) fish.position.applyMatrix4(body.userData.standingTransform); fish.position.applyMatrix4(body.matrix);
        fish.rotation.copy(body.rotation); fish.rotation.z += (body.userData.standingAngle || 0) + Math.sin(Date.now() * .0025) * .035;
    }
    cache.childCount = childCount();
}

function chatTypingActive(){
    const input=document.getElementById('chat-input');
    return !!input&&document.activeElement===input&&document.hasFocus?.()!==false;
}
function updateStandingAnimation(owner,still,typing,dt,suppressed=false){
    const body=owner.getObjectByName('playerSprite');if(!body)return;
    if(body.userData.cfg?.sitting)return; // The shared sitting pose owns seated idle motion.
    const state=owner.userData.standingAnimation||(owner.userData.standingAnimation={time:0,idle:0,thinking:0,applied:false});
    dt=Math.min(Math.max(dt||0,0),.1);state.time+=dt;
    const blocked=suppressed||owner.userData.emoting||body.userData.cfg?.sitting||body.userData.cfg?.bellySliding;
    const active=!!still&&!blocked;
    owner.userData.standingIdle=active;
    state.idle=blocked?0:THREE.MathUtils.clamp(state.idle+(active?1:-1)*dt*6,0,1);
    state.thinking=blocked?0:THREE.MathUtils.clamp(state.thinking+(active&&typing?1:-1)*dt*8,0,1);
    if(state.idle===0&&state.thinking===0&&!state.applied)return;
    if(body.userData.is3D){window.Character3D?.animateStanding(body,state.time,state.idle,state.thinking);}
    else if(!blocked){body.rotation.z=Math.sin(state.time*.8)*.012*state.idle+.06*state.thinking;}
    state.applied=state.idle>0||state.thinking>0;
    if(typeof sync3DRodGrip==='function')sync3DRodGrip(owner);
}

function updateReelingAnimation(owner,active,dt) {
    const body=owner.getObjectByName('playerSprite'),rod=owner.getObjectByName('rod');
    const blocked=owner.userData.emoting||(body?.userData.cfg?.sitting&&!owner.userData.sharedBoat)||body?.userData.cfg?.bellySliding;
    active=!!active&&!!rod?.visible&&!blocked&&(!body?.userData.is3D||!!body.userData.cfg?.holdingRod);
    const state=owner.userData.reelAnimation||(owner.userData.reelAnimation={phase:0,weight:0});
    if(!active&&state.weight===0)return;
    state.weight=THREE.MathUtils.clamp(state.weight+(active?1:-1)*Math.min(Math.max(dt||0,0),.1)*8,0,1);
    if(active)state.phase+=Math.min(dt||0,.1)*12;
    if(body?.userData.is3D&&!blocked)window.Character3D?.animateReel(body,state.phase,state.weight);
    if(rod){
        if(!state.basePosition)state.basePosition=rod.position.clone();
        if(state.baseAngle===undefined)state.baseAngle=rod.rotation.x;
        if(rod.userData.is3D){
            if(body){body.updateMatrix();rod.position.set(.56,-.62+(body.userData.upperLift||0),.43).applyMatrix4(body.matrix);}
            rod.position.y+=Math.sin(state.phase*.5)*.025*state.weight;
            rod.rotation.x=rodAngleFor(rod,active)+Math.sin(state.phase*.5)*.035*state.weight;
            const crank=rod.getObjectByName('reelCrankPivot');if(crank)crank.rotation.x=state.phase*state.weight;
        }else{
            rod.position.y=state.basePosition.y+Math.sin(state.phase)*.04*state.weight;
            rod.rotation.x=rodAngleFor(rod,active)+Math.sin(state.phase)*.07*state.weight;
        }
    }
    if(state.weight===0){if(rod&&!rod.userData.is3D)rod.position.copy(state.basePosition);state.phase=0;delete state.basePosition;delete state.baseAngle;}
}

function updateJumpAnimation(owner,airborne,velocity,dt,suppressed=false){
    const body=owner.getObjectByName('playerSprite');if(!body)return;
    const blocked=suppressed||owner.userData.emoting||body.userData.cfg?.sitting||body.userData.cfg?.bellySliding;
    if(body.userData.is3D){
        const compression=window.Character3D?.animateJump(body,!!airborne&&!blocked,velocity,dt,!(owner.userData.reelAnimation?.weight>0)&&!blocked,!!blocked);
        if(compression!==null&&compression!==undefined&&!blocked){body.position.y=1.46875-compression;if(typeof sync3DRodGrip==='function')sync3DRodGrip(owner);}
    }else{
        const state=owner.userData.jumpSprite||(owner.userData.jumpSprite={airborne:false,landing:0});
        if(blocked){state.airborne=false;state.landing=0;return;}
        if(state.airborne&&!airborne)state.landing=.2;
        if(airborne)body.rotation.z=velocity>0?-.08:.06;
        else if(state.airborne||state.landing>0){body.rotation.z=0;body.position.y=1.46875-Math.sin((1-state.landing/.2)*Math.PI)*.08;}
        const finishing=state.landing>0;state.airborne=!!airborne;state.landing=Math.max(0,state.landing-dt);
        if(finishing&&state.landing===0){body.position.y=1.46875;body.rotation.z=0;}
    }
}

function syncHudLabel(label){
    if(!['nameTag','titleSprite','talkingIcon','chatBubble','npcIcon'].includes(label.name))return;
    if(typeof hudVisible!=='undefined'&&!hudVisible){
        if(label.userData.hudVisibleBeforeHide===undefined)label.userData.hudVisibleBeforeHide=label.visible;
        label.visible=false;
    }else{
        if(label.name==='nameTag'||label.name==='npcIcon')label.visible=true;
        else if(label.name==='titleSprite')label.visible=!!saveState.showTitles;
        else if(label.userData.hudVisibleBeforeHide!==undefined)label.visible=label.userData.hudVisibleBeforeHide;
        delete label.userData.hudVisibleBeforeHide;
    }
}
function syncCharacterOverhead(owner){
    const lift=owner.getObjectByName('playerSprite')?.userData.upperLift||0;
    for(const label of owner.children||[]){
        if(!['nameTag','titleSprite','talkingIcon','chatBubble','npcIcon'].includes(label.name))continue;
        syncHudLabel(label);
        if(label.userData.baseHeight===undefined)label.userData.baseHeight=label.position.y;
        label.position.y=label.userData.baseHeight+lift;
    }
}

function updateSpriteDirection(obj, targetCamPos) {
    syncCharacterOverhead(obj);
    if(typeof sync3DRodGrip==='function')sync3DRodGrip(obj);
    const sprite = obj.getObjectByName("playerSprite");
    if (!sprite) return;
    const blinkClosed=typeof characterBlinkClosed==='function'?characterBlinkClosed(obj,performance.now()):false;
    if (sprite.userData.is3D) {
        window.Character3D?.setBlink?.(sprite,blinkClosed);
        const mouth=sprite.userData.mouth;
        if(mouth){
            const open=obj.userData?.talking&&obj.userData?.talkMouthOpen,shape=TALK_MOUTH_SHAPES[obj.userData?.mouthShape||0]||TALK_MOUTH_SHAPES[0];
            const profile=mouth.userData?.profile||{width:.08,height:.1};
            mouth.scale.x=open?profile.width*(shape.width/.08):profile.width;
            mouth.scale.y=open?.025+(profile.height*(shape.height/.1)-.025)*(obj.userData.mouthAmount??.75):.025;
            if(mouth.rotation)mouth.rotation.z=open?shape.tilt:0;
        }
        return;
    }
    if (!sprite.userData.matFront) return;

    // OPTIMIZATION: Use reused vectors
    const toCam = _optVec1.copy(targetCamPos).sub(obj.position);
    toCam.y = 0;
    toCam.normalize();

    const facing = _optVec2;
    obj.getWorldDirection(facing);
    facing.y = 0;
    facing.normalize();

    if (toCam.dot(facing) > 0) {
        if(blinkClosed){sprite.material=ensureBlinkMaterial(sprite,obj.userData?.talking&&obj.userData?.talkMouthOpen?(obj.userData.mouthShape||0):false);return;}
        // Chats swap to a cached open-mouth texture for a few frames. The
        // texture is built the first time this character speaks, so ordinary
        // NPCs and players never pay for it.
        if (obj.userData && obj.userData.talking && obj.userData.talkMouthOpen) {
            sprite.material = ensureOpenMouthMaterial(sprite,obj.userData.mouthShape||0) || sprite.userData.matFront;
        } else {
            sprite.material = sprite.userData.matFront;
        }
    } else {
        sprite.material = sprite.userData.matBack;
    }
}

function setupInputs() {
    const ci = document.getElementById('chat-input');
    setupGifPicker();
    window.addEventListener('blur',()=>{if(document.activeElement===ci)ci.blur();});

    // Chat Fade Logic
    ci.addEventListener('focus', () => {
        const ui = document.getElementById('chat-ui');
        if (ui) ui.style.opacity = '1';
        if (chatFadeTimer) clearTimeout(chatFadeTimer);
    });
    ci.addEventListener('blur', () => {
        refreshChatFade();
    });

    document.onkeydown = e => {
        if(e.code === 'Escape' && closeTopOverlay()){e.preventDefault();return;}
        if(document.getElementById('protogen-logo-editor')?.open||document.getElementById('character-studio')?.open)return;
        if(e.target?.closest?.('#guided-tour'))return;
        const k = saveState.keybinds;

        // Chat Focus Logic
        if (document.activeElement === ci) {
            if (e.code === 'Enter' || e.key === 'Enter') {
                sendChatMessage(ci.value);
                ci.value = '';
                ci.blur();
                if (isMobile) window.MobileUI?.hideChat();
            }
            else if (e.code === 'Escape') {
                ci.blur();
                refreshChatFade();
                return;
            }
            return;
        }

        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
        if(document.getElementById('halloween-overlay')?.hidden===false){if(e.code==='Escape'||e.code===k.menu){e.preventDefault();window.Halloween?.close();}return;}
        const emoteOverlay=document.getElementById('emote-overlay');
        if(!emoteOverlay?.hidden){
            if(e.code==='Escape'||e.code===(k.emote||'KeyC')){e.preventDefault();Emotes.close();return;}
            if(/^Digit[1-5]$/.test(e.code)){e.preventDefault();Emotes.select(Number(e.code.slice(-1))-1);return;}
            if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(e.code)){e.preventDefault();Emotes.moveSelection(e.code==='ArrowRight'||e.code==='ArrowDown'?1:-1);}
            return;
        }
        if(e.code===(k.emote||'KeyC')&&!e.repeat){e.preventDefault();window.Emotes?.toggle();return;}
        if(document.getElementById('boat-dock-menu')?.hidden===false){if(e.code==='Escape'||e.code===k.menu)window.Boats?.close();return;}
        if (e.code === k.menu) { toggleOptions(); return; }
        if (e.code === 'KeyI') { document.exitPointerLock(); togglePropsUI(); return; }
        if (e.code === 'KeyO') { undoProp(); return; }

        if(e.code===(k.sit||'KeyX')){e.preventDefault();if(!e.repeat)setSitting(!isSitting);return;}
        if(isSitting&&(e.code==='Space'||e.code===k.jump)){e.preventDefault();if(!e.repeat)setSitting(false);return;}
        if(window.Boats?.isAboard()&&(e.code===k.jump||e.code===(k.sit||'KeyX'))){e.preventDefault();return;}
        // Movement
        if (e.code === k.forward) controls.forward = true;
        if (e.code === k.backward) controls.backward = true;
        if (e.code === k.left) controls.left = true;
        if (e.code === k.right) controls.right = true;
        if (e.code === k.jump) {
            if(e.repeat)return;
            const now = Date.now();
            if (isProne) {
                isProne = false; isDiving = false;
                playerVelocity.y = JUMP_FORCE;
                broadcastSound('jump');
                controls.jump = false;
                return;
            }
            if (isDiving) { controls.jump = false; return; }
            const ground = getTerrainHeight ? getTerrainHeight(player.position.x, player.position.z) : 0;
            const stand = (typeof standableTopAt === 'function') ? standableTopAt(player.position.x, player.position.z, player.position.y) : -Infinity;
            const onGround = player && player.position.y <= Math.max(ground, stand) + 0.15;
            // Double-tap while airborne (or just jumped) -> dive. Diving is
            // disabled inside houses because the dive sweep only knows about
            // outdoor colliders; furniture collisions handle the walk cycle.
            if (!onGround && lastJumpTime > 0 && (now - lastJumpTime) < 450 && !(window.Housing && Housing.inside)) {
                isDiving = true; diveTimer = 0.45;
                diveDir.copy(bellySlideDirection(camera,controls,player.userData.lastMoveDirection,player.rotation.y));
                player.rotation.y = Math.atan2(diveDir.x, diveDir.z);
                lastJumpTime = 0;
                controls.jump = false;
                return;
            }
            // Single tap -> jump
            controls.jump = true;
            lastJumpTime = now;
        }

        // Tab opens the unified menu
        if (e.code === 'Tab') { e.preventDefault(); toggleTabMenu(); return; }

        // Interaction (Desktop)
        if (e.code === k.interact) {
            if(interactTarget==='exploration'){window.Exploration?.interact();return;}
            if(window.Housing && (interactTarget==='house'||interactTarget==='house-exit'||interactTarget==='house-tv'||interactTarget==='house-display')) { Housing.interact(); return; }
            if (canSell) toggleMerchant();
            else if (interactTarget === 'stylist') toggleShop();
            else if (interactTarget === 'halloween') window.Halloween?.open();
            else if(interactTarget==='boatmaster')window.Boats?.open();
            else if(interactTarget==='shared-boat')window.Boats?.interact();
            else if (interactTarget === 'merchant') toggleMerchant();
            else if (interactTarget === 'bait') toggleBaitShop();
            else if (interactTarget === 'tutorial') toggleTutorial();
            else if (interactTarget === 'fisher') talkToFisher();
            else if (interactTarget === 'scratch') toggleScratchShop();
            else if (interactTarget === 'ytscreen' && typeof window.toggleScreenQueue === 'function') window.toggleScreenQueue(interactScreenId);
            else if (interactTarget === 'lava_keeper') {
                if (saveState.lavaUnlocked) {
                    enterLavaWorld();
                } else {
                    if (saveState.money >= 80000) {
                        if (confirm("Buy Lava World Access for $80,000?")) {
                            saveState.money -= 80000;
                            saveState.lavaUnlocked = true;
                            saveGame();
                            Sound.sell();
                            showToast("Lava World Unlocked!");
                            enterLavaWorld();
                        }
                    } else {
                        showToast("Need $80,000 to unlock!");
                    }
                }
            }
            // Try to pick nearby flower
            else {
                tryPickNearbyFlower();
            }
        }

        // --- TOOLS (HOTBAR 1-5) ---
        if (e.key === '1') selectHotbarSlot(0);
        if (e.key === '2') selectHotbarSlot(1);
        if (e.key === '3') selectHotbarSlot(2);
        if (e.key === '4') selectHotbarSlot(3);
        if (e.key === '5') selectHotbarSlot(4);
        if (e.key === '6') selectHotbarSlot(5);
        if (e.key === '7') selectHotbarSlot(6);
        if (e.key === '8') selectHotbarSlot(7);
        if (e.key === '9') selectHotbarSlot(8);
        if (e.key === '0') selectHotbarSlot(9);

        if (e.code === k.voice) toggleMic();
        if (e.code === k.showFish) toggleShowFish();
        if (e.code === k.hideHud) toggleHud();
        if (k.sail && e.code === k.sail && !e.repeat) toggleSailing();

        // Meow
        if (e.code === k.meow && !e.repeat) {
            const variant = Math.floor(Math.random() * 3);
            broadcastSound('meow', variant);
        }

        // Open Chat
        if ((e.code === k.chat || e.key === k.chat) && !isMobile) {
            ci.focus(); e.preventDefault();
        }
    };

    document.onkeyup = e => {
        const k = saveState.keybinds;
        if (e.code === k.forward) controls.forward = false;
        if (e.code === k.backward) controls.backward = false;
        if (e.code === k.left) controls.left = false;
        if (e.code === k.right) controls.right = false;
        if (e.code === k.jump) controls.jump = false;
    };

    document.onmousemove = e => {
        // Check for cameraFrozen to prevent movement when menus are open
        if (cameraFrozen) return;

        if (isRightMouseDown || (isFirstPerson && document.pointerLockElement === renderer.domElement)) {
            cameraRotationY -= e.movementX * 0.002;

            if (isFirstPerson) {
                cameraRotationX -= e.movementY * 0.002; // FP: Mouse Down -> Look Down (Decrease Angle)
            } else {
                cameraRotationX += e.movementY * 0.002; // TP: Mouse Down -> Cam Up (Increase Angle)
            }

            const limit = isFirstPerson ? Math.PI / 2 : Math.PI / 3; // Clamp
            cameraRotationX = Math.max(-limit, Math.min(limit, cameraRotationX)); // Increased range for FP
        }
    };

    document.onmousedown = e => {
        if (isMobile) return;
        if (e.target.closest('#character-studio') || e.target.closest('#protogen-logo-editor') || e.target.closest('#guided-tour') || e.target === ci || e.target.closest('.btn') || e.target.closest('.overlay-screen') || e.target.closest('.stat-row') || e.target.closest('#bait-ui')) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (e.button === 0 && window.twitchScreenAt) {
            const tw = window.twitchScreenAt(e.clientX, e.clientY);
            if (tw) {
                // Clicking a Twitch screen is a sound request, not a cast.
                if (typeof tw.soundChip !== 'undefined' && tw.soundChip) tw.soundChip.click();
                return;
            }
        }
        if (e.button === 0) { isLeftMouseDown = true; handleAction(true); }
        else if (e.button === 2) { isRightMouseDown = true; renderer.domElement.requestPointerLock(); }
    };

    document.onmouseup = e => {
        if (!isMobile) {
            if (e.button === 0) { isLeftMouseDown = false; handleAction(false); }
            else if (e.button === 2) {
                isRightMouseDown = false;
                if (!isFirstPerson) document.exitPointerLock();
            }
        }
    };

    document.onwheel = (e) => {
        const isMenuOpen = document.querySelector('.overlay-screen[style*="flex"]');
        const isHoveringUI = e.target.closest('#fish-log') || e.target.closest('#chat-messages') || e.target.closest('#host-player-list');
        if (isMenuOpen || isHoveringUI) return;
        cameraDistance += e.deltaY * 0.005;
        cameraDistance = Math.max(0.5, Math.min(MAX_ZOOM, cameraDistance));

        // First Person Toggle
        if (cameraDistance < 2.0 && !isFirstPerson) {
            isFirstPerson = true;
            if (!isMobile) renderer.domElement.requestPointerLock();
        } else if (cameraDistance >= 2.0 && isFirstPerson) {
            isFirstPerson = false;
            if (!isMobile) document.exitPointerLock();
        }
    };

    // Thumbstick uses pointer capture so movement and action fingers remain independent.
    const jz=document.getElementById('joystick-zone'),jk=document.getElementById('joystick-knob');
    let jid=null,jc={x:0,y:0},joyRadius=40;
    function resetJoy(){jk.style.transform='translate(0,0)';for(const key of ['forward','backward','left','right'])controls[key]=false;jid=null;}
    jz.onpointerdown=e=>{if(jid!==null)return;e.preventDefault();e.stopPropagation();jid=e.pointerId;jz.setPointerCapture(jid);const r=jz.getBoundingClientRect();jc={x:r.left+r.width/2,y:r.top+r.height/2};joyRadius=r.width*.3;updateJoy(e.clientX,e.clientY);};
    jz.onpointermove=e=>{if(e.pointerId!==jid)return;e.preventDefault();e.stopPropagation();updateJoy(e.clientX,e.clientY);};
    jz.onpointerup=e=>{if(e.pointerId===jid)resetJoy();};jz.onpointercancel=jz.onpointerup;jz.onlostpointercapture=e=>{if(e.pointerId===jid)resetJoy();};
    function updateJoy(x,y){let dx=x-jc.x,dy=y-jc.y;const d=Math.hypot(dx,dy);if(d>joyRadius){dx*=joyRadius/d;dy*=joyRadius/d;}jk.style.transform='translate('+dx+'px,'+dy+'px)';const dead=joyRadius*.22;controls.forward=dy<-dead;controls.backward=dy>dead;controls.left=dx<-dead;controls.right=dx>dead;}
    window.addEventListener('blur',resetJoy);window.addEventListener('resize',resetJoy);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)resetJoy();});

    // --- MOBILE CAMERA ---
    let cid = null, lcx = 0, lcy = 0;
    let pinchStartDist = 0;
    let pinchStartZoom = 0;

    function isUI(t) {
        return !!t.target.closest('.touch-zone, button, input, select, textarea, a, [role=dialog], .overlay-screen, #chat-ui, #room-info-ui, #mobile-sheet, #mobile-topbar, #hotbar-container, #lobby-screen, #guided-tour, #character-studio, #protogen-logo-editor, #panel-tabbar, #options-container, #cooking-minigame-ui');
    }

    document.body.ontouchstart = e => {
        if (audioCtx.state === 'suspended') audioCtx.resume();

        // If the STARTING touch is UI, ignore it for camera/pinch initiation
        // (Though typically stopPropagation handles this, this is a safety check)
        if (isUI(e.changedTouches[0])) return;

        if (e.cancelable) e.preventDefault();

        // Check for Pinch: Need 2 touches that are BOTH NOT UI
        let nonUITouches = [];
        for (let i = 0; i < e.touches.length; i++) {
            if (!isUI(e.touches[i])) nonUITouches.push(e.touches[i]);
        }

        if (nonUITouches.length === 2) {
            pinchStartDist = Math.hypot(
                nonUITouches[0].pageX - nonUITouches[1].pageX,
                nonUITouches[0].pageY - nonUITouches[1].pageY
            );
            pinchStartZoom = cameraDistance;
            // Clear cid if we enter pinch mode to stop rotation logic interference
            cid = null;
            return;
        }

        // Single finger: Camera Rotation
        // Assign cid if not already assigned and we found a valid non-UI touch
        if (cid === null) {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (!isUI(t)) {
                    cid = t.identifier;
                    lcx = t.clientX;
                    lcy = t.clientY;
                    break;
                }
            }
        }
    };

    document.body.ontouchmove = e => {
        if (isUI({target:e.target})) return;
        if (e.cancelable) e.preventDefault();

        // 1. PINCH LOGIC
        if (pinchStartDist > 0) {
            let nonUITouches = [];
            for (let i = 0; i < e.touches.length; i++) {
                if (!isUI(e.touches[i])) nonUITouches.push(e.touches[i]);
            }

            if (nonUITouches.length === 2) {
                const dist = Math.hypot(
                    nonUITouches[0].pageX - nonUITouches[1].pageX,
                    nonUITouches[0].pageY - nonUITouches[1].pageY
                );

                const scale = dist / pinchStartDist;
                let newZoom = pinchStartZoom / scale;

                cameraDistance = Math.min(MAX_ZOOM, Math.max(0.5, newZoom));

                if (cameraDistance < 2.0 && !isFirstPerson) {
                    isFirstPerson = true;
                } else if (cameraDistance >= 2.0 && isFirstPerson) {
                    isFirstPerson = false;
                }
            }
            return; // Stop here if pinching
        }

        // 2. ROTATION LOGIC (Run if not pinching)
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === cid) {
                const t = e.changedTouches[i];
                cameraRotationY -= (t.clientX - lcx) * 0.005;
                if (isFirstPerson) {
                    cameraRotationX -= (t.clientY - lcy) * 0.005;
                } else {
                    cameraRotationX += (t.clientY - lcy) * 0.005;
                }
                const limit = isFirstPerson ? Math.PI / 2 : Math.PI / 3;
                cameraRotationX = Math.max(-limit, Math.min(limit, cameraRotationX));

                lcx = t.clientX;
                lcy = t.clientY;
            }
        }
    };

    document.body.ontouchend = e => {
        // Reset pinch if we drop below 2 non-UI touches
        let nonUITouches = [];
        for (let i = 0; i < e.touches.length; i++) {
            if (!isUI(e.touches[i])) nonUITouches.push(e.touches[i]);
        }
        if (nonUITouches.length < 2) {
            pinchStartDist = 0;
        }

        // Reset rotation if tracked finger lifts
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === cid) {
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
        if(window.Housing && (interactTarget==='house'||interactTarget==='house-exit'||interactTarget==='house-tv'||interactTarget==='house-display')) { Housing.interact(); return; }
        if(interactTarget==='exploration'){window.Exploration?.interact();return;}
        if (canSell) toggleMerchant();
        else if (interactTarget === 'stylist') toggleShop();
        else if (interactTarget === 'halloween') window.Halloween?.open();
        else if(interactTarget==='boatmaster')window.Boats?.open();
        else if(interactTarget==='shared-boat')window.Boats?.interact();
        else if (interactTarget === 'bait') toggleBaitShop();
        else if (interactTarget === 'tutorial') toggleTutorial();
        else if (interactTarget === 'fisher') talkToFisher();
        else if (interactTarget === 'scratch') toggleScratchShop();
        else if (interactTarget === 'ytscreen' && typeof window.changeScreenVideo === 'function') window.changeScreenVideo(interactScreenId);

        // --- ADDED LAVA KEEPER CHECK FOR MOBILE ---
        else if (interactTarget === 'lava_keeper') {
            if (saveState.lavaUnlocked) {
                enterLavaWorld();
            } else {
                if (saveState.money >= 80000) {
                    if (confirm("Buy Lava World Access for $80,000?")) {
                        saveState.money -= 80000;
                        saveState.lavaUnlocked = true;
                        saveGame();
                        Sound.sell();
                        showToast("Lava World Unlocked!");
                        enterLavaWorld();
                    }
                } else {
                    showToast("Need $80,000 to unlock!");
                }
            }
        }
        // ------------------------------------------

        // Try to pick a nearby flower first (mobile players have no interact
        // key, so this is their only way to gather flowers).
        else if (tryPickNearbyFlower()) {
            // handled
        }
        else { isLeftMouseDown = true; handleAction(true); }
    };

    btnAct.ontouchend = e => { stopCam(e); isLeftMouseDown = false; if (!canSell && interactTarget === null) handleAction(false); };
    btnAct.ontouchmove = stopCam;

    const btnJump = document.getElementById('btn-jump');
    btnJump.ontouchstart = e => { stopCam(e); controls.jump = true; };
    btnJump.ontouchend = e => { stopCam(e); controls.jump = false; };
    btnJump.ontouchmove = stopCam;

    const btnGuitar = document.getElementById('btn-mobile-guitar');
    if (btnGuitar) { btnGuitar.ontouchstart = e => { stopCam(e); toggleGuitar(); }; btnGuitar.ontouchmove = stopCam; }

    const btnGlove = document.getElementById('btn-mobile-glove');
    if (btnGlove) { btnGlove.ontouchstart = e => { stopCam(e); toggleGlove(); }; btnGlove.ontouchmove = stopCam; }

    const btnShowFish = document.getElementById('btn-mobile-show-fish');
    if (btnShowFish) { btnShowFish.ontouchstart = e => { stopCam(e); toggleShowFish(); }; btnShowFish.ontouchmove = stopCam; }

    const btnMeow = document.getElementById('btn-mobile-meow');
    if (btnMeow) { btnMeow.ontouchstart = e => { stopCam(e); broadcastSound('meow', Math.floor(Math.random() * 3) + 1); }; btnMeow.ontouchmove = stopCam; }

    // --- PROP BUTTONS ---
    const btnPlace = document.getElementById('btn-mobile-place');
    if (btnPlace) {
        btnPlace.ontouchstart = e => { stopCam(e); togglePropsUI(); };
        btnPlace.ontouchmove = stopCam;
    }

    const btnUndo = document.getElementById('btn-mobile-undo-prop') || document.getElementById('btn-mobile-undo');
    if (btnUndo) {
        btnUndo.ontouchstart = e => { stopCam(e); undoProp(); };
        btnUndo.ontouchmove = stopCam;
    }

    // --- EMPTY HANDS BUTTON ---
    const btnEmpty = document.getElementById('btn-mobile-empty');
    if (btnEmpty) {
        btnEmpty.ontouchstart = e => { stopCam(e); toggleEmptyHands(); };
        btnEmpty.ontouchmove = stopCam;
    }

    // --- TOGGLES ---
    const btnChatM = document.getElementById('chat-toggle-mobile');
    if (btnChatM) {
        btnChatM.ontouchstart = (e) => {
            stopCam(e);
            const ui = document.getElementById('chat-ui');
            ui.style.display = ui.style.display === 'none' ? 'flex' : 'none';
            if (ui.style.display === 'flex') {
                ui.style.opacity = '1';
                document.getElementById('chat-input').focus();
            }
        };
    }

    const btnMicM = document.getElementById('mic-toggle-mobile');
    if (btnMicM) { btnMicM.ontouchstart = (e) => { stopCam(e); toggleMic(); }; }

    const btnFull = document.getElementById('btn-fullscreen-mobile');
    if (btnFull) {
        btnFull.ontouchstart = (e) => { stopCam(e); toggleFullScreen(); };
    }
    if(isMobile)window.MobileUI?.bind();
}


let chopInterval = null;
function dismissHeldFishForCast(){
    if(!localHeldFish)return true;
    const active=saveState.hotbar?.[saveState.activeHotbarIndex];
    const rodIndex=active?.type==='tool'&&active.id==='rod'?saveState.activeHotbarIndex:(saveState.hotbar?.findIndex(entry=>entry?.type==='tool'&&entry.id==='rod')??-1);
    if(rodIndex<0){showToast('Equip your fishing rod to cast.');return false;}
    // A caught fish temporarily replaces the rod mesh. Clear the timer as well
    // as the fish, then rebuild and apply the rod grip before showing the cast marker.
    if(saveState.activeHotbarIndex!==rodIndex)selectHotbarSlot(rodIndex);
    localHeldFish=null;
    if(fishHoldTimer)clearTimeout(fishHoldTimer);
    fishHoldTimer=null;
    isHandsHidden=false;
    updateLocalVisuals();
    if(player)sync3DRodGrip(player);
    return true;
}
function handleAction(down) {
    if(document.getElementById('boat-dock-menu')?.hidden===false)return;
    if(window.Housing && (Housing.inside || Housing.modalOpen))return;

    // Determine active tool id from hotbar
    const activeEntry = saveState.hotbar ? saveState.hotbar[saveState.activeHotbarIndex] : null;
    const activeToolId = activeEntry && activeEntry.type === 'tool' ? activeEntry.id : null;

    // --- AXE LOGIC (Block Fishing) ---
    if (activeToolId === 'axe') {
        if (down) {
            // Start Auto-Chop
            if (chopInterval) clearInterval(chopInterval);
            performChop();
            chopInterval = setInterval(performChop, 500);
        } else {
            // Stop Auto-Chop
            if (chopInterval) clearInterval(chopInterval);
            chopInterval = null;

            // Reset Axe Rotation
            const axe = player.getObjectByName("axe");
            if (axe) axe.rotation.set(axe.userData.is3D?.3:-.2,axe.userData.is3D?0:-Math.PI/2,0);
        }
        return;
    }

    // --- PICKAXE LOGIC ---
    if (activeToolId === 'pickaxe') {
        if (down) {
            // Start Auto-Mine
            if (chopInterval) clearInterval(chopInterval);
            performMine();
            chopInterval = setInterval(performMine, 500);
        } else {
            // Stop Auto-Mine
            if (chopInterval) clearInterval(chopInterval);
            chopInterval = null;

            // Reset Pickaxe Rotation
            const pick = player.getObjectByName("pickaxe");
            if (pick) pick.rotation.set(pick.userData.is3D?.3:-.2,pick.userData.is3D?0:-Math.PI/2,0);
        }
        return;
    }

    // --- NEW: COOLDOWN CHECK ---
    if (Date.now() - lastCatchTime < 500) {
        if (down) showToast("Catch Cooldown Active!");
        return;
    }
    // ---------------------------

    if (isGuitarActive) {
        if (down) showToast("Can't fish while playing guitar!");
        return;
    }

    if (isGloveActive) {
        if (down) performPunch();
        return;
    }

    if (down) {
        // Showing a fish can transition back to the rod when starting a cast.
        const activeEntry = saveState.hotbar ? saveState.hotbar[saveState.activeHotbarIndex] : null;
        const isRodHeld = !!(activeEntry && activeEntry.type === 'tool' && activeEntry.id === 'rod');
        if (!isRodHeld && !(fishingState==='idle'&&localHeldFish)) return;

        if (fishingState === 'idle') {
            // Block fishing if inventory is full
            if (Array.isArray(saveState.invSlots) && saveState.invSlots.every(s => s !== null)) {
                showToast("Inventory full! Sell or drop items first.");
                return;
            }
            const wasShowingFish=!!localHeldFish;
            if(wasShowingFish&&!dismissHeldFishForCast())return;
            fishingState = 'charging';
            window.GuidedTutorial?.event('charge');
            chargeStart = Date.now();
            castMarker.visible = true;
            if(wasShowingFish)sendUpdate();
        }

        else if (fishingState === 'reeling') {
            // TRACKING MINIGAME: START HOLDING
            minigame.isReeling = true;
        }

        else if (fishingState === 'waiting') stopFishing(false, "Too early!");
        else if (fishingState === 'biting') startMinigame();
    } else {
        if (fishingState === 'charging') releaseCast();
        else if (fishingState === 'reeling') {
            // TRACKING MINIGAME: STOP HOLDING
            minigame.isReeling = false;
        }
    }
}

function releaseCast() {
    if(window.Housing && (Housing.inside || Housing.modalOpen))return;
    const targetPos = castMarker.position;
    const dist = Math.sqrt(targetPos.x * targetPos.x + targetPos.z * targetPos.z);
    const distToSecret = Math.sqrt(targetPos.x * targetPos.x + (targetPos.z - -95) * (targetPos.z - -95));

    // Only a custom level sets this; it lets a level override the pond sub-type.
    fishingZoneCategory = null;

    if (isInVoid) {
        fishingZone = 'void';
    }
    else if (isInLavaWorld) {
        // Check if cast is in the lava lake (center: -20000, 0, radius: 25)
        const LAVA_LAKE_CENTER_X = -20000;
        const LAVA_LAKE_CENTER_Z = 0;
        const LAVA_LAKE_RADIUS = 25;
        const distToLavaLake = Math.sqrt(
            Math.pow(targetPos.x - LAVA_LAKE_CENTER_X, 2) +
            Math.pow(targetPos.z - LAVA_LAKE_CENTER_Z, 2)
        );

        if (distToLavaLake < LAVA_LAKE_RADIUS) {
            fishingZone = 'lava';
        } else {
            stopFishing(false, "Cast into the lava lake!");
            return;
        }
    }
    else if (window.CUSTOM_LEVEL && window.Level) {
        // Custom levels: the zone painted in the editor decides the fish pool.
        if (waterSurfaceAt(targetPos.x,targetPos.z)===null) {
            stopFishing(false, "Cast into the water!");
            return;
        }
        const zoneId = window.Level.zoneAt(window.CUSTOM_LEVEL, targetPos.x, targetPos.z);
        const info = window.Level.zoneInfo(zoneId);
        if (info.fish === 'lightpond' || info.fish === 'darkpond') {
            fishingZone = 'pond';
            fishingZoneCategory = info.fish;
        } else {
            fishingZone = info.fish;
            fishingZoneCategory = null;
        }
    }
    else if (distToSecret < 12) {
        fishingZone = 'secret';
    } else if (dist < LAKE_RADIUS) {
        fishingZone = 'lake';
    }
    // Check Pond (Light Pond at -60, -30)
    else if (window.pondCollider) {
        const distPond = Math.sqrt(
            Math.pow(targetPos.x - window.pondCollider.x, 2) +
            Math.pow(targetPos.z - window.pondCollider.z, 2)
        );
        // Dark Pond at (60, 50)
        const distDarkPond = Math.sqrt(
            Math.pow(targetPos.x - 60, 2) +
            Math.pow(targetPos.z - 50, 2)
        );
        // Check ocean island ponds
        let inOceanPond = false;
        if (window.Ocean) {
            try {
                const lay = window.Ocean.layout();
                if (lay && lay.ponds) {
                    for (let i = 0; i < lay.ponds.length; i++) {
                        const p = lay.ponds[i];
                        const dp = Math.sqrt(Math.pow(targetPos.x - p.x, 2) + Math.pow(targetPos.z - p.z, 2));
                        if (dp < p.radius) { inOceanPond = true; break; }
                    }
                }
            } catch(e){}
        }
        if (distPond < window.pondCollider.radius) {
            fishingZone = 'pond';
        } else if (distDarkPond < 20 || inOceanPond) {
            fishingZone = 'pond';
        } else {
            // Check River
            let inRiver = false;
            if (window.riverColliders) {
                for (const rc of window.riverColliders) {
                    const distRiver = Math.sqrt(
                        Math.pow(targetPos.x - rc.x, 2) +
                        Math.pow(targetPos.z - rc.z, 2)
                    );
                    if (distRiver < rc.radius) {
                        inRiver = true;
                        break;
                    }
                }
            }
            if (inRiver) {
                fishingZone = 'river';
            }
            // Check Ocean (beyond island radius)
            else if (dist > ISLAND_RADIUS - 5) {
                fishingZone = 'ocean';
            } else {
                stopFishing(false, "Can't fish on land!");
                return;
            }
        }
    }
    // Fallback checks for river/ocean if pond not loaded yet
    else {
        let inRiver = false;
        if (window.riverColliders) {
            for (const rc of window.riverColliders) {
                const distRiver = Math.sqrt(
                    Math.pow(targetPos.x - rc.x, 2) +
                    Math.pow(targetPos.z - rc.z, 2)
                );
                if (distRiver < rc.radius) {
                    inRiver = true;
                    break;
                }
            }
        }
        if (inRiver) {
            fishingZone = 'river';
        } else if (dist > ISLAND_RADIUS - 5) {
            fishingZone = 'ocean';
        } else {
            stopFishing(false, "Can't fish on land!");
            return;
        }
    }

    if (activeBaitId !== 'none') {
        if (saveState.baitInventory[activeBaitId] > 0) {
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
    fishingState = 'casting';
    window.GuidedTutorial?.event('cast'); castMarker.visible = false;
    if (window.Tournaments) Tournaments.cast();
    lastCastPos.copy(targetPos);
    createBobber(targetPos);

    const rod = player.getObjectByName("rod");
    if (rod) {
        // ANIMATION: swing the rod forward/out towards the water (angle depends
        // on whether the equipped rod is a 2D billboard or a 3D model).
        rod.rotation.x = rodAngleFor(rod, true);
    }

    setTimeout(() => { fishingState = 'waiting'; scheduleBite(); }, 500);
}

// --- ONE LINE BOBBER HELPER ---
function createBobberMesh(typeId) {
    const type = BOBBER_TYPES.find(t => t.id === typeId) || BOBBER_TYPES[0];
    if(saveState.model3D&&window.Bobbers3D)return Bobbers3D.build(type);

    // Create Texture using the Shop Icon drawer
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128; // Higher res for in-world
    const ctx = canvas.getContext('2d');

    // Use the shared drawing function
    if (typeof drawBobberIcon === 'function') {
        drawBobberIcon(ctx, type, 128);
    } else {
        // Fallback if audio.js isn't loaded for some reason
        ctx.fillStyle = '#' + type.color.toString(16).padStart(6, '0');
        ctx.beginPath(); ctx.arc(64, 64, 30, 0, Math.PI * 2); ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter; // Pixelated look
    texture.minFilter = THREE.NearestFilter;

    // Add alphaTest to fix "transparent square" depth sorting issues
    const mat = new THREE.SpriteMaterial({
        map: texture,
        color: 0xffffff,
        alphaTest: 0.5
    });
    const sprite = new THREE.Sprite(mat);

    // The bobber now fills the texture (previously the art only covered ~22% of
    // the 128px canvas), so the world scale is reduced to keep it the same size.
    sprite.scale.set(1.0, 1.0, 1.0);

    return sprite;
}

function createBobber(targetPos) {
    if (bobber) {scene.remove(bobber);disposeCharacterBody(bobber);}

    // Use selected skin
    bobber = createBobberMesh(saveState.currentBobber);

    // Start bobber at player height, it will fall to water
    bobber.position.set(targetPos.x, player.position.y + 2, targetPos.z);

    // Initialize bobber velocity for gravity
    window.bobberVelocityY = 0;

    // Determine water level based on location (ocean is at Y=-3, ponds/lake at Y=0)
    const dist = Math.sqrt(targetPos.x * targetPos.x + targetPos.z * targetPos.z);
    // Check for ocean island ponds
    let isIslandPond = false;
    if (window.Ocean) {
        try {
            const lay = window.Ocean.layout();
            if (lay && lay.ponds) {
                for (let i = 0; i < lay.ponds.length; i++) {
                    const p = lay.ponds[i];
                    const dp = Math.sqrt(Math.pow(targetPos.x - p.x, 2) + Math.pow(targetPos.z - p.z, 2));
                    if (dp < p.radius) { isIslandPond = true; break; }
                }
            }
        } catch(e){}
    }
    if (isIslandPond) {
        window.bobberTargetY = 0.05;
    } else if (dist > ISLAND_RADIUS - 5 || targetPos.z > 100) {
        // Ocean (beyond island or on dock)
        window.bobberTargetY = -2.9;
    } else {
        // Lake, pond, or secret pool
        window.bobberTargetY = 0.1;
    }

    window.bobberFalling = true;

    // Save initial Y for the bobbing animation (will be set when bobber lands)
    bobberInitialY = window.bobberTargetY;

    scene.add(bobber);
}

// In index.html

function performPunch() {
    if(window.Housing && Housing.inside)return;
    // RATE LIMIT (Unified)
    if (Date.now() - lastAnimTime < ANIM_COOLDOWN) return;
    lastAnimTime = Date.now();

    animatePunch(player);
    broadcastSound('punch');

    // 1. Send Animation (FIXED PRIORITY)
    const animMsg = { type: 'anim', anim: 'punch' };

    if (isHost) {
        broadcastToClients(animMsg);
    }
    else if (hostConn && hostConn.open) {
        hostConn.send(animMsg);
    }

    // 2. Check Hit Logic
    Object.keys(otherPlayers).forEach(pid => {
        const p = otherPlayers[pid];
        const dist = player.position.distanceTo(p.mesh.position);

        if (dist < 3.5) {
            const los = checkLineOfSight(player.position, p.mesh.position);
            if (los.blocked) return;

            const dir = new THREE.Vector3().subVectors(p.mesh.position, player.position).normalize();

            const hitMsg = {
                type: 'punch_hit',
                targetId: pid,
                force: { x: dir.x * 20, z: dir.z * 20 }
            };

            // Send Hit Event (FIXED PRIORITY)
            // Note: We don't call handleHit locally for remote players; 
            // we send the command and let the server/client logic handle it.
            if (isHost) {
                handleHit(hitMsg); // P2P Host handles it directly
            }
            else if (hostConn && hostConn.open) {
                hostConn.send(hitMsg);
            }
        }
    });
}

function handleHit(data) {
    if(window.Housing && Housing.inside)return;
    // Check for ID mismatch
    const isMePeer = data.targetId === myPeerId;

    // FIX: Simplified check to ensure it works even if connection state flags are desynced
    if (isMePeer) {

        knockbackVelocity.x = data.force.x;
        knockbackVelocity.z = data.force.z;
        knockbackVelocity.y = 5;

        showToast("OOF! You got punched!");
        broadcastSound('punch');
    }

    else if (isHost) {
        const conn = clientConns[data.targetId];
        if (conn && conn.open) {
            conn.send(data);
        }
    }
}

// --- ANIMATION TRACKING ---
let punchAnimFrameId = null;

function animatePunch(mesh) {
    const glove = mesh.getObjectByName('gloveMesh');
    if (!glove) return;

    // FIX: Cancel previous animation if active
    if (punchAnimFrameId) cancelAnimationFrame(punchAnimFrameId);

    const originalZ = 0.5;
    const punchZ = 1.5;

    let startTime = Date.now();
    function loop() {
        let p = (Date.now() - startTime) / 100;
        if (p > 2) {
            glove.userData.punchOffset=0;
            if(!glove.userData.is3D)glove.position.z = originalZ;
            punchAnimFrameId = null; // Clear ID
            return;
        }

        const offset=(p<1?p:2-p)*(punchZ-originalZ);
        if(glove.userData.is3D)glove.userData.punchOffset=offset;
        else{glove.position.z=originalZ+offset;glove.position.y=1.25+Math.random()*.1;}

        // Track ID
        punchAnimFrameId = requestAnimationFrame(loop);
    }
    loop();
}

function scheduleBite() {
    biteTimer = setTimeout(() => {
        if (fishingState === 'waiting') {
            fishingState = 'biting';
        window.GuidedTutorial?.event('bite');

            // Visual Cue: Dip Bobber (Use bobberInitialY to support Void/Lava worlds)
            if (bobber) {
                // Dip
                bobber.position.y = bobberInitialY - 0.5;
            }

            playSnagSound();

            setTimeout(() => {
                if (fishingState === 'biting') {
                    stopFishing(false, "Got away!");
                }
            }, 1500);
        }
    }, 2000 + Math.random() * 3000);
}
// --- MINIGAME REWORK (Tension / Tracking) ---
function startMinigame() {
    fishingState = 'reeling';
    if(typeof window!=='undefined')window.GuidedTutorial?.event('reel');
    minigame.active = true;
    minigame.targetFish = selectFish();

    // 1. Initialize State
    minigame.fishPos = 20;   // Start at 20% (Near the bar)
    minigame.fishVel = 0;
    minigame.fishTarget = 20;
    minigame.fishTimer = 0;

    minigame.barPos = 10;   // 0 to 100 (Bottom of bar)
    minigame.barVel = 0;
    minigame.progress = 25; // Start with some progress buffer

    // 2. Calculate Stats based on Upgrades
    // Smaller starter zone; upgrade and skill gains share the shop's sizing formula.
    if (!saveState.skills) saveState.skills = { mining: { xp: 0 }, lumberjack: { xp: 0 }, fishing: { xp: 0 } };
    const fishingXP = saveState.skills.fishing?.xp || 0;
    const fishingLevel = getLevelFromXP(fishingXP);
    let barSize = fishingBarSize(saveState.clickPowerLevel,fishingLevel);

    // STABILITY (formerly Auto Reel): Reduces drain rate
    const stabLvl = saveState.autoReelLevel || 0;
    let stability = 1.0 - (stabLvl * 0.05); // 5% drain reduction per level

    // 3. Difficulty Modifiers
    // 3. Difficulty Modifiers
    const r = minigame.targetFish.rarity;
    let difficulty = 1.0;

    // Rarity Base Difficulty (Buffed for High Rarity)
    if (r === 'Common') difficulty = 0.8;
    else if (r === 'Uncommon') difficulty = 1.0;
    else if (r === 'Rare') difficulty = 1.5;
    else if (r === 'Epic') { difficulty = 3.0; barSize *= 0.9; }       // Buffed: 2.5 -> 3.0
    else if (r === 'Legendary') { difficulty = 5.0; barSize *= 0.75; } // Buffed: 4.0 -> 5.0

    // Variant / Tier Difficulty (New Granular Scaling)
    const tierId = minigame.targetFish.tierId;
    if (tierId === 'glistening') difficulty += 0.3;
    else if (tierId === 'shining') difficulty += 0.6;
    else if (tierId === 'opalescent') difficulty += 1.0;

    // Bait Speed Modifier (New: Better Bait = Slower Fish)
    // Magic Lure (Power 18) = -36% Speed. Worms (Power 2) = -4% Speed.
    const bait = BAIT_TYPES.find(b => b.id === activeBaitId) || BAIT_TYPES[0];
    const speedReduction = Math.max(0, bait.power * 0.02);
    difficulty *= (1.0 - speedReduction);

    // LAVA WORLD PENALTIES
    if (minigame.targetFish.isLava) {
        difficulty *= 1.5; // Faster fish
        barSize *= 0.7;    // Smaller bar

        // Mitigation with High Tier Bait
        if (['magic', 'shrimp', 'jig'].includes(bait.id)) {
            barSize *= 1.25; // Restore some size
        }

        // Mitigation with Rods
        const rod = saveState.currentRod;
        if (['lava', 'admin', 'golden', 'diamond', 'omega_milestone'].includes(rod)) {
            difficulty *= 0.85;
        }
    }

    minigame.barSize = Math.max(5, barSize); // Min 5% height
    minigame.drainRate = 0.4 * stability * difficulty;
    minigame.catchRate = 0.6; // Constant fill rate
    minigame.difficulty = difficulty;

    // Show UI
    document.getElementById('minigame-ui').style.display = 'flex';
    document.getElementById('minigame-capture-bar').style.height = minigame.barSize + '%';

    // Reset inputs
    minigame.isReeling = true; // Auto-start reeling if holding from the hook click

    updateMinigameUI();
}

function stopFishing(success, msg) {
    window.ReelAudio?.stopLocal();
    fishingState = 'idle'; castMarker.visible = false; minigame.active = false; document.getElementById('minigame-ui').style.display = 'none';
    if (bobber) { scene.remove(bobber); disposeCharacterBody(bobber);bobber = null; }
    if (fishingLine) fishingLine.visible = false;
    clearTimeout(biteTimer);

    const rod = player.getObjectByName("rod");
    if (rod) {
        // RESET: bring the rod back to its up/back rest pose.
        rod.rotation.x = rodAngleFor(rod, false);
    }

    // --- NEW: APPLY COOLDOWN REGARDLESS OF SUCCESS ---
    // If fishing stops for ANY reason (catch, failed reel, too early, timeout),
    // apply the 500ms cooldown to block the next instant click.
    lastCatchTime = Date.now();
    // --------------------------------------------------

    if (success) {
        if (minigame.targetFish) {
            broadcastSound('catch');
            if(minigame.targetFish.name!=='Old Boot')window.GuidedTutorial?.event('catch');
            // Record where this fish came from so progression can see it.
            const caughtZone = resolveCatchZone();
            lastCatchZone = caughtZone;
            minigame.targetFish.zone = caughtZone;
            const wasNewSpecies = !saveState.journal[minigame.targetFish.name];
            saveState.inventory.push(minigame.targetFish);
            window.Halloween?.caught(minigame.targetFish);
            if (window.Tournaments) Tournaments.caught(minigame.targetFish);
            updateJournal(minigame.targetFish, minigame.targetFish.tierId);

            // Award Fishing XP based on rarity
            let fishingXPGain = 20; // Base XP
            const rarity = minigame.targetFish.rarity;
            if (rarity === 'Common') fishingXPGain = 15;
            else if (rarity === 'Uncommon') fishingXPGain = 30;
            else if (rarity === 'Rare') fishingXPGain = 60;
            else if (rarity === 'Epic') fishingXPGain = 120;
            else if (rarity === 'Legendary') fishingXPGain = 250;

            // --- DEEP OCEAN BONUS ---
            // The further from the home island a fish is caught, the richer the
            // haul. This is what makes sailing out worthwhile: more XP, a
            // Sailing-XP kicker, and a markedly higher sale price.
            if (caughtZone === 'ocean' && !(window.CUSTOM_LEVEL && window.Level)) {
                const homeDist = Math.sqrt(player.position.x ** 2 + player.position.z ** 2);
                const traveled = Math.max(0, homeDist - ISLAND_RADIUS);
                const worldSpan = Math.max(1, (typeof WORLD_RADIUS === 'number' ? WORLD_RADIUS : 1000) - ISLAND_RADIUS);
                const t = Math.min(1, traveled / worldSpan); // 0 near shore .. 1 far out
                fishingXPGain = Math.round(fishingXPGain * (1 + t * 0.8));
                const base = Number(minigame.targetFish.price || minigame.targetFish.value || 0);
                if (base > 0) minigame.targetFish.price = Math.round(base * (1 + t * 0.6));
            }

            addSkillXP('fishing', fishingXPGain);

            // Sailing XP: rewards fishing from open water on the boat.
            if (isSailing||window.Boats?.isAboard()) {
                addSkillXP('sailing', caughtZone === 'ocean' ? 12 : 6);
            }

            saveGame();

            // Progression: bounties, achievements, quests.
            if (typeof notifyFishCaught === 'function') {
                notifyFishCaught(minigame.targetFish, wasNewSpecies);
            }

            const tierStr = minigame.targetFish.tierId !== 'normal' ? ` (${minigame.targetFish.tierName})` : '';
            const sizeStr = minigame.targetFish.sizeLabel ? ` [${minigame.targetFish.sizeLabel}]` : '';
            showToast(`Caught ${minigame.targetFish.name}${tierStr}${sizeStr}!`);

            // Personal best size for this species
            try {
                if (!saveState.personalBests) saveState.personalBests = {};
                const pbPrev = saveState.personalBests[minigame.targetFish.name];
                if (!pbPrev || (minigame.targetFish.size || 1) > (pbPrev.size || 0)) {
                    saveState.personalBests[minigame.targetFish.name] = {
                        size: minigame.targetFish.size || 1,
                        label: minigame.targetFish.sizeLabel || 'Normal',
                        at: Date.now()
                    };
                }
            } catch (e) { }

            // Co-op world boss: catching it rewards everyone in the room.
            if (minigame.targetFish && minigame.targetFish.isBoss) {
                try { window.defeatWorldBoss(); } catch (e) { }
            }

            // Add to grid inventory (stacked)
            try { addFishToInventory(minigame.targetFish); } catch (e) { }

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
            if(window.Halloween?.active())saveGame();

        } else {
            showToast("Error: Fish data lost.");
        }
    }
    else if (msg) showToast(msg);
}

// --- MINIGAME LOOP ---
// --- MINIGAME LOOP ---
function updateMinigameUI(dt) {
    if (!dt) dt = 0.016; // Fallback

    // Normalize speed reference (1.0 = 100% per second)
    // Actually dealing with 0-100 range.

    // --- 1. FISH AI ---
    // Timer is now in seconds
    minigame.fishTimer += dt;
    // Move target every 0.5s to 2.0s (based on difficulty)
    const moveInterval = 0.5 + (1.5 / minigame.difficulty);

    if (minigame.fishTimer > moveInterval) {
        minigame.fishTimer = 0;
        // New Target
        if (Math.random() < 0.6) {
            // Small move (Smooth)
            minigame.fishTarget += (Math.random() * 30 - 15);
        } else {
            // Large move (Erratic)
            minigame.fishTarget = Math.random() * 100;
        }
        minigame.fishTarget = Math.max(10, Math.min(90, minigame.fishTarget));
    }

    // Move Fish toward target
    const dist = minigame.fishTarget - minigame.fishPos;
    // Base Speed: 15 units/sec * Difficulty. Maxes around 40.
    // WAS: ~60-140 unit/sec. SIGNIFICANTLY SLOWER NOW.
    const maxSpeed = 15.0 * minigame.difficulty;

    // Smooth movement (frame independent)
    let moveStep = maxSpeed * dt;

    if (Math.abs(dist) > moveStep) {
        minigame.fishPos += Math.sign(dist) * moveStep;
    } else {
        minigame.fishPos = minigame.fishTarget;
    }

    // --- 2. BAR PHYSICS ---
    // Units per Second Squared
    const GRAVITY = 80; // Falls down
    const LIFT = 120;   // Pulls up (must overcome gravity)

    if (minigame.isReeling) {
        minigame.barVel += LIFT * dt;
    } else {
        minigame.barVel -= GRAVITY * dt;
    }

    // Resistance / Terminal Velocity
    minigame.barVel -= minigame.barVel * 2.0 * dt; // Air resistance

    // Update Position
    minigame.barPos += minigame.barVel * dt;

    // Bounce / Clamp
    const maxBarTop = 100 - minigame.barSize;

    if (minigame.barPos < 0) {
        minigame.barPos = 0;
        if (minigame.barVel < 0) minigame.barVel = 0;
    }
    if (minigame.barPos > maxBarTop) {
        minigame.barPos = maxBarTop;
        if (minigame.barVel > 0) minigame.barVel = 0;
    }

    // --- 3. PROGRESS LOGIC ---
    const fishCenter = minigame.fishPos + 5;
    const barBottom = minigame.barPos;
    const barTop = minigame.barPos + minigame.barSize;

    const isInside = (fishCenter >= barBottom && fishCenter <= barTop);
    const fishEl = document.getElementById('minigame-fish');
    const barEl = document.getElementById('minigame-capture-bar');

    // Fill Rate: 15% per second
    const catchRate = 15 * dt;
    // Drain Rate: Scaled by upgrades (approx 10-25% per sec)
    const drainRate = (minigame.drainRate * 50) * dt;

    if (isInside) {
        minigame.progress += catchRate;
        barEl.style.backgroundColor = 'rgba(100, 255, 100, 0.8)';
        barEl.style.border = '2px solid #aaffaa';
        fishEl.innerText = '🐟';
    } else {
        minigame.progress -= drainRate;
        barEl.style.backgroundColor = 'rgba(150, 255, 100, 0.3)';
        barEl.style.border = '2px solid #88aa88';
        fishEl.innerText = '🐡';
    }

    minigame.progress = Math.max(0, Math.min(100, minigame.progress));

    // --- 4. RENDER ---
    const fEl = document.getElementById('minigame-fish');
    const bEl = document.getElementById('minigame-capture-bar');
    const pFill = document.getElementById('minigame-progress-fill');

    // Use 'toFixed' to prevent sub-pixel jitter in CSS if needed, but standard is fine
    fEl.style.bottom = minigame.fishPos + '%';
    bEl.style.bottom = minigame.barPos + '%';
    pFill.style.height = minigame.progress + '%';

    if (minigame.progress > 80) pFill.style.background = 'var(--p-good)';
    else if (minigame.progress > 40) pFill.style.background = 'var(--p-gold)';
    else pFill.style.background = 'var(--p-bad)';

    // --- 5. CHECK WIN/FAIL ---
    if (minigame.progress >= 100) {
        stopFishing(true);
    }
    else if (minigame.progress <= 0) {
        stopFishing(false, "It got away!");
    }
}
function showToast(t, kind) {
    const d = document.createElement('div');
    d.className = 'toast' + (kind ? ' toast-' + kind : '');
    d.innerText = t;
    let area = document.getElementById('notification-area');
    if (!area) {
        area=document.createElement('div');area.id='notification-area';
        area.setAttribute('role','status');area.setAttribute('aria-live','polite');area.setAttribute('aria-atomic','false');
        if(typeof hudVisible!=='undefined'&&!hudVisible)area.style.display='none';
        document.body.appendChild(area);
    }
    area.appendChild(d);
    // Achievement cards linger a beat longer and hold at most 3 at once so a
    // lucky multi-unlock doesn't bury the screen.
    const life = kind === 'achievement' ? 4200 : 3000;
    setTimeout(() => d.remove(), life);
    while (area.children.length > 3) area.removeChild(area.firstChild);
}

// --- GHOST/HAUNTING MECHANIC ---
// --- GHOST/HAUNTING MECHANIC ---
function spawnGhostMesh(x, z) {
    if (ghostMesh) scene.remove(ghostMesh);

    // Create base mesh and override cosmetics for a ghostly appearance.
    ghostMesh = createPlayerMesh('#000000', ' ', 'none', '#FFFFFF', 'cat');
    replaceCharacterBody(ghostMesh, {
        color: '#000000', belly: '#000000', eye: '#FFFFFF', species: 'cat',
        hat: 'none', shirt: 'none', collar: 'none', bodyPaint: '',
        hair: 'none', hairColor: ''
    });

    // Get terrain height for proper Y positioning
    const terrainY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(x, z) : 0;
    ghostMesh.position.set(x, terrainY, z);
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

// --- CO-OP WORLD BOSS ---
let nextWorldBossAt = Date.now() + (5 * 60 * 1000 + Math.random() * 5 * 60 * 1000);
let worldBossBeacon = null;

function findWorldBossSpot() {
    const custom = !!(window.CUSTOM_LEVEL && window.Level);
    const sea = custom ? window.CUSTOM_LEVEL.seaLevel : OCEAN_LEVEL;
    const maxR = custom ? Math.max(20, window.CUSTOM_LEVEL.size / 2 - 10) : (WORLD_RADIUS - 40);
    const minR = custom ? 20 : (ISLAND_RADIUS + 30);
    for (let i = 0; i < 300; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = minR + Math.random() * Math.max(1, maxR - minR);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const h = getTerrainHeight(x, z);
        if (h < sea - 1.5) return { x, z };
    }
    return { x: minR, z: 0 };
}

function showWorldBossBeacon(x, z) {
    removeWorldBossBeacon();
    const custom = !!(window.CUSTOM_LEVEL && window.Level);
    const sea = custom ? window.CUSTOM_LEVEL.seaLevel : OCEAN_LEVEL;
    const g = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 70, 12, 1, true), beamMat);
    beam.position.y = 35;
    g.add(beam);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3, 5, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
    orb.position.y = 3;
    g.add(orb);
    g.position.set(x, sea, z);
    g.userData.isWorldBossBeacon = true;
    scene.add(g);
    worldBossBeacon = g;
}

function removeWorldBossBeacon() {
    if (worldBossBeacon) { scene.remove(worldBossBeacon); worldBossBeacon = null; }
}

function updateWorldBoss() {
    // Beacon upkeep / expiry for everyone.
    if (window.worldBossActive) {
        if (Date.now() >= window.worldBossActive.expiresAt) {
            window.worldBossActive = null;
            removeWorldBossBeacon();
            if (typeof isHost !== 'undefined' && isHost) showToast('The world boss has fled...', 'error');
        } else {
            if (!worldBossBeacon) showWorldBossBeacon(window.worldBossActive.x, window.worldBossActive.z);
            if (worldBossBeacon) {
                worldBossBeacon.rotation.y += 0.02;
                worldBossBeacon.children[0].material.opacity = 0.4 + Math.sin(Date.now() * 0.004) * 0.15;
            }
        }
    }

    // Only the host (or single-player) drives the spawn timer.
    const singlePlayer = (typeof isHost === 'undefined' || (!isHost && !hostConn));
    if (typeof isHost !== 'undefined' && !isHost && !singlePlayer) return;
    if (!window.worldBossActive && Date.now() > nextWorldBossAt) {
        const spot = findWorldBossSpot();
        window.worldBossActive = { x: spot.x, z: spot.z, expiresAt: Date.now() + 5 * 60 * 1000 };
        nextWorldBossAt = Date.now() + (10 * 60 * 1000 + Math.random() * 10 * 60 * 1000);
        showWorldBossBeacon(spot.x, spot.z);
        relayBossMessage({ type: 'worldBossSpawn', x: spot.x, z: spot.z, expiresAt: window.worldBossActive.expiresAt });
    }
}

function relayBossMessage(msg) {
    if (typeof isHost !== 'undefined' && isHost) broadcastToClients(msg);
    else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) hostConn.send(msg);
}

window.defeatWorldBoss = function () {
    if (!window.worldBossActive) return;
    window.worldBossActive = null;
    removeWorldBossBeacon();
    nextWorldBossAt = Date.now() + (10 * 60 * 1000 + Math.random() * 10 * 60 * 1000);
    try { addFishToInventory(WORLD_BOSS_FISH); } catch (e) { }
    saveState.money += 2000;
    saveGame();
    showToast('World boss defeated! Everyone gets $2,000 and a Leviathan Bass.', 'success');
    relayBossMessage({ type: 'worldBossDefeated' });
};

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
        if (s) s.position.y = 1.46875 + Math.sin(now * 0.002) * 0.07;
    }
}

// In index.html

function triggerHaunt(targetId) {
    const target = otherPlayers[targetId];
    if (!target) return;

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

    // 3. Send to Network
    if (isHost) {
        broadcastToClients(msg);
    }

    showToast(`Summoned Void Cat on ${target.lastData.name}`);
}

function cleanupPeerConnection(conn){
    if(clientConns[conn.peer]!==conn)return;
    delete clientConns[conn.peer];removePlayer(conn.peer);
    window.NetworkGuard?.forget(conn.peer);delete rateLimits[conn.peer];
    broadcastPlayerList();updateHostPanel();publishLobby();
}
window.disconnectAbusivePeer=function(id,reason){
    const conn=clientConns[id];if(!conn)return;
    try{conn.send({type:'error',message:'Disconnected for abusive network traffic: '+String(reason).slice(0,80)});}catch(e){}
    try{cleanupPeerConnection(conn);}finally{try{conn.close();}catch(e){}}
    showToast('Removed a player for abusive network traffic.');
};
function removePlayer(pid) {
    removePropsOwnedBy(pid);
    window.Boats?.depart(pid);
    window.ReelAudio?.remove(pid);
    window.Tournaments?.onPlayerLeft(pid);
    if(window.Housing)Housing.onPlayerLeft(pid);
    const p = otherPlayers[pid];
    if (p) {
        // Trigger Leave Message (Must get name before deleting data).
        const name = p.lastData.name || "Fisher";
        // Check if we are in-game to avoid spam during disconnects/reloads
        if (document.getElementById('lobby-screen').style.display === 'none' && !p.pendingJoinAnnounce) {
            displayChatMessage(name, "has left.", 'system');
        }
        if (document.getElementById('lobby-screen').style.display === 'none' && p.pendingJoinAnnounce) {
            displayChatMessage(name, "stopped downloading the map.", 'system');
        }

        // Cleanup Visuals.
        if (p.mesh) { if(p.mesh.parent)p.mesh.parent.remove(p.mesh); disposeCharacterBody(p.mesh.getObjectByName('playerSprite')); }
        if (p.bobberMesh) scene.remove(p.bobberMesh);
        if (p.lineMesh) scene.remove(p.lineMesh);

        // 3. Cleanup Audio Elements
        const audioEl = document.getElementById(`audio-${pid}`);
        if (audioEl) audioEl.remove();

        // Cleanup Data Structures.
        try{voiceConnections[pid]?.close();}catch(e){}
        delete voiceConnections[pid];
        delete voiceAnalysers[pid];
        delete clientConns[pid];

        // Remove from main list.
        delete otherPlayers[pid];

        if (voiceConnections[pid]) {
            voiceConnections[pid].close();
        }

        console.log(`Player ${pid} removed`);
    }
}

// Original mobile pacing; desktop runs at the browser refresh rate.
const MOBILE_FPS_INTERVAL = 1000 / 60;
let lastFrameTime = 0;

// Highest furniture surface (currently chair seats) the player can stand on at
// (x, z). `feetY` gates the test: a chair only becomes a floor once the feet are
// at/above its plank, so walking past or standing beside one does not pop the
// player up onto it - jumping does.
function standableTopAt(x, z, feetY, previousFeetY=feetY) {
    let top = Math.max(cavePlatformTopAt(x,z,feetY,previousFeetY),caveRockTopAt(x,z,feetY,previousFeetY),window.Boats?.dockTopAt(x,z,feetY)??-Infinity);
    if (window.Housing && Housing.inside) {
        const houseTop = Housing.standableTopAt(x, z, feetY);
        if (houseTop > top) top = houseTop;
    }
    if (typeof props === 'undefined' || !props) return top;
    for (const id in props) {
        const m = props[id];
        if (!m || !m.userData || m.userData.standTop === undefined) continue;
        // Seat bounds are local to the placed prop and follow its scale.
        const sx = m.scale ? m.scale.x : 1;
        const sy = m.scale ? m.scale.y : 1;
        const sz = m.scale ? m.scale.z : 1;
        const halfX = (m.userData.standHalfX || m.userData.standHalf || 0.7) * sx;
        const halfZ = (m.userData.standHalfZ || m.userData.standHalf || 0.7) * sz;
        const dx = x - m.position.x, dz = z - m.position.z;
        // Into the prop's local frame (props only rotate around Y).
        const c = Math.cos(m.rotation.y), s = Math.sin(m.rotation.y);
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        if (Math.abs(lx) > halfX + 0.15 || Math.abs(lz) > halfZ + 0.15) continue;
        const topY = m.position.y + m.userData.standTop * sy;
        if (feetY >= topY - 0.15 && topY > top) top = topY;
    }
    return top;
}

function animate() {
    requestAnimationFrame(animate);

    // FPS limit on mobile to prevent overheating
    if (isMobile) {
        const now = performance.now();
        if (now - lastFrameTime < MOBILE_FPS_INTERVAL) return;
        lastFrameTime = now;
    }

    const dt = clock.getDelta();

    GamePerformance.beginFrame(performance.now());

    // --- TIME & VISUALS ---
    updateDayNightCycle(dt);
    window.tickPropAnimations?.();
    window.Exploration?.tick();
    window.GuidedTutorial?.tick();

    // --- UPDATE NPC SPRITES (Face Camera) ---
    if (npcMerchant) updateSpriteDirection(npcMerchant, camera.position);
    if (npcStylist) updateSpriteDirection(npcStylist, camera.position);
    if (npcBait) updateSpriteDirection(npcBait, camera.position);
    if (npcTutorial) updateSpriteDirection(npcTutorial, camera.position);
    if (npcFisher) updateSpriteDirection(npcFisher, camera.position);
    if (npcScratch) updateSpriteDirection(npcScratch, camera.position);
    if (npcLavaKeeper) updateSpriteDirection(npcLavaKeeper, camera.position);
    // NEW: Update Lava World NPC Sprites
    if (npcLavaMerchant) updateSpriteDirection(npcLavaMerchant, camera.position);
    if (npcLavaStylist) updateSpriteDirection(npcLavaStylist, camera.position);
    if (npcLavaBait) updateSpriteDirection(npcLavaBait, camera.position);

    // --- AUDIO LISTENER ---
    // Moved to updateAudioListener() in audio.js: the listener follows the
    // player's head (not the third-person camera) and is updated just before the
    // draw, after this frame's movement.

    // --- PANEL TAB BAR ---
    updatePanelTabBar();
    if (voidPortalMesh && !(window.Housing && Housing.inside)) {
        voidPortalMesh.rotation.z -= 2.0 * dt;
        // Only allow entering portal if in Main World (not Void or Lava)
        if (!isInVoid && !isInLavaWorld && player) {
            const dist = player.position.distanceTo(voidPortalMesh.position);
            if (dist > 4.0) voidPortalArmed = true;
            if (dist < 2.0 && voidPortalArmed && Date.now() > portalCooldown) {
                voidPortalArmed = false;
                enterVoid();
            }
        }
        if (Date.now() > portalDespawnTime) {
            scene.remove(voidPortalMesh);
            voidPortalMesh = null;
        }
    }
    if(isInVoid && voidExitPortalMesh && player && Date.now() > portalCooldown){
        if(Math.hypot(player.position.x-voidExitPortalMesh.position.x,player.position.z-voidExitPortalMesh.position.z)<2.7){
            portalCooldown=Date.now()+3000;
            window.exitVoid?.();
        }
    }
    if(isInLavaWorld && lavaExitPortalMesh && player && Date.now() > portalCooldown){
        if(Math.hypot(player.position.x-lavaExitPortalMesh.position.x,player.position.z-lavaExitPortalMesh.position.z)<2.7){
            portalCooldown=Date.now()+3000;
            exitLavaWorld();
        }
    }
    if(!window.CUSTOM_LEVEL && !voidPortalMesh && !(window.Housing && Housing.inside))spawnPortal(86,-58,false,true);

    // Random void portal spawns on custom levels (host only), on the main island.
    if (window.CUSTOM_LEVEL && window.Level && isHost && !isInVoid && !isInLavaWorld && !voidPortalMesh && !(window.Housing && Housing.inside)) {
        if (!portalSpawnTimer) portalSpawnTimer = Date.now() + 120000 + Math.random() * 120000;
        if (Date.now() > portalSpawnTimer) {
            portalSpawnTimer = Date.now() + 240000 + Math.random() * 240000;
            const spot=findCustomPortalLocation(window.CUSTOM_LEVEL);
            if(spot)spawnPortal(spot.x,spot.z);
        }
    }

    updateVoiceVisuals();
    updateGhost();
    updateWorldBoss();

    // Chat mouths and animalese blips (must run before updateSpriteDirection).
    updateTalkingPlayers(performance.now());

    // --- RAIN STREAKS ---
    if (rainSystem && rainSystem.visible) {
        const data = rainSystem.geometry.userData;
        const positions = rainSystem.geometry.attributes.position.array;
        const drops = data.drops;
        const rainDt = Math.min(dt || 0, 0.1);
        const anchorX = player ? player.position.x : 0;
        const anchorY = player ? player.position.y : 0;
        const anchorZ = player ? player.position.z : 0;
        // Keep the local rain box around the player instead of around world origin.
        rainSystem.position.set(anchorX, anchorY, anchorZ);
        for (let i = 0; i < drops.length; i++) {
            const drop = drops[i];
            drop.y -= drop.speed * rainDt;
            drop.x += 1.4 * rainDt;
            drop.z += 0.35 * rainDt;
            if (drop.y < -5 || drop.x > 48 || drop.x < -48 || drop.z > 48 || drop.z < -48) {
                drop.x = (Math.random() - 0.5) * 94;
                drop.y = 36 + Math.random() * 14;
                drop.z = (Math.random() - 0.5) * 94;
                drop.length = 0.8 + Math.random() * 1.5;
                drop.speed = 18 + Math.random() * 17;
            }
            data.writeDrop(i, drop);
        }
        rainSystem.geometry.attributes.position.needsUpdate = true;
    }

    // --- WATERFALL ---
    if (waterfallMesh && waterfallMesh.material.map) {
        waterfallMesh.material.map.offset.y += 2 * dt;
    }

    // (Legacy Auto-Reel Logic Removed for Minigame Rework)
    autoClickAccumulator = 0;

    // --- MINIGAME ---
    if (minigame.active) {
        // minigame.timeLeft handled in updateMinigameUI via progress logic now
        updateMinigameUI(dt);
    }

    window.Boats?.tick(dt);
    // --- PHYSICS & MOVEMENT ---
    if (player) {
        player.updateMatrixWorld(true);

        let floorY;
        let sprite=player.getObjectByName("playerSprite");
        const sharedBoating=!!window.Boats?.isAboard();
        if(!sharedBoating){
        // 1. DETERMINE FLOOR HEIGHT
        // Main World & Lava World both use Y=0 as the ground level
        floorY = getTerrainHeight(player.position.x, player.position.z);
        if (isInVoid) floorY = 2000;
        // Water surface: a boat always rides the top, and an on-foot player in
        // deep water treads water at the surface (slow swim) rather than sinking
        // to the sea bed. Shallow water is still walked normally.
        if (!isInVoid && !isInLavaWorld) {
            const surface = waterSurfaceAt(player.position.x, player.position.z);
            if (surface !== null) {
                if (isSailing) {
                    floorY = Math.max(floorY, surface);
                } else {
                    // On foot: in deep water, wade/swim below the surface instead of
                    // floating on top, so the player is actually in the water.
                    const bed = getTerrainHeight(player.position.x, player.position.z);
                    if (surface - bed > SHALLOW_DEPTH) floorY = surface - 0.8;
                }
            }
            // Placed furniture: a chair's seat is solid ground once you are over
            // it and have jumped up to plank height.
            const seatY = standableTopAt(player.position.x, player.position.z, player.position.y,player.userData.previousPhysicsFeetY??player.position.y);
            if (seatY > floorY) floorY = seatY;
        }

        // --- DIVE / PRONE STATE ---
        if (isDiving) {
            diveTimer -= dt;
            const diveSpeed = 3+7*Math.max(0,diveTimer/.45);
            const dx = diveDir.x * diveSpeed * dt;
            const dz = diveDir.z * diveSpeed * dt;
            const np = _optVec1.copy(player.position);
            np.x += dx; np.z += dz;
            let col = false;
            if (!isInVoid && !isInLavaWorld) {
                for (let t of treeColliders) {
                    const rr = 0.5 + t.radius;
                    const tdx = np.x - t.x, tdz = np.z - t.z;
                    if (tdx * tdx + tdz * tdz < rr * rr) col = true;
                }
                for (let b of staticColliders) {
                    if (staticColliderHits(b,np)) col = true;
                }
            }
            if (!col) {
                player.position.x += dx;
                player.position.z += dz;
            } else {
                // Hit a collider: cancel the dive
                isDiving = false;
                isProne = true;
                diveTimer = 0;
            }
            player.position.y = floorY;
            if (diveTimer <= 0 && isDiving) {
                isDiving = false;
                isProne = true;
            }
        }

        // 2. KNOCKBACK (PvP)
        if (Math.abs(knockbackVelocity.x) > 0.1 || Math.abs(knockbackVelocity.z) > 0.1) {
            knockbackVelocity.multiplyScalar(0.9);
            const dx = knockbackVelocity.x * dt;
            const dz = knockbackVelocity.z * dt;
            // OPTIMIZATION: Reuse vector
            const testPos = _optVec1.copy(player.position);
            testPos.x += dx; testPos.z += dz;
            let hitWall = false;

            if (!isInVoid && !isInLavaWorld) {
                for (let t of treeColliders) {
                    // Horizontal-only check: colliders sit at y=0 but the player stands
                    // on terrain, so a 3D distance would shrink (or erase) the blocking
                    // radius on hills and raised custom-level land.
                    const rr = 0.5 + t.radius;
                    const tdx = testPos.x - t.x, tdz = testPos.z - t.z;
                    if (tdx * tdx + tdz * tdz < rr * rr) hitWall = true;
                }
                for (let b of staticColliders) {
                    if (staticColliderHits(b,testPos)) hitWall = true;
                }
                // Custom levels have no on-foot water barrier: every body of water
                // is swimmable, matching the open-ocean rule at home. See the
                // movement collision below for the same reasoning.
                if (!(window.CUSTOM_LEVEL && window.Level)) {
                    // Home island water only blocks inside the island; the open
                    // ocean is swimmable, so knocking someone off the island is fine.
                    const homeIsland = testPos.length() < ISLAND_RADIUS + 2;
                    if (!isSailing && homeIsland && testPos.length() < LAKE_RADIUS + 0.5) hitWall = true;

                    // Pond collision
                    if (window.pondCollider && !isSailing && homeIsland) {
                        const distPond = Math.sqrt(
                            Math.pow(testPos.x - window.pondCollider.x, 2) +
                            Math.pow(testPos.z - window.pondCollider.z, 2)
                        );
                        if (distPond < window.pondCollider.radius + 0.5) hitWall = true;
                    }
                }

                // River collision
                if (window.riverColliders && !isSailing) {
                    for (const rc of window.riverColliders) {
                        const distRiver = Math.sqrt(
                            Math.pow(testPos.x - rc.x, 2) +
                            Math.pow(testPos.z - rc.z, 2)
                        );
                        if (distRiver < rc.radius + 0.5) hitWall = true;
                    }
                }
            }
            // (Simplified knockback checks for other worlds)

            if (!hitWall) {
                player.position.x += dx; player.position.z += dz;
            } else {
                knockbackVelocity.set(0, 0, 0);
            }
        }

        // 3. INPUT MOVEMENT
        const v = _optVec2.set(0, 0, 0);
        if ((isDiving || isProne || isSitting)) {
            // No WASD movement while diving/prone. Prone can rotate in place.
            if (isProne && document.activeElement !== document.getElementById('chat-input')) {
                const rotSpeed = 6 * dt;
                if (controls.left) player.rotation.y += rotSpeed;
                if (controls.right) player.rotation.y -= rotSpeed;
            }
        } else if (document.activeElement !== document.getElementById('chat-input') && !(window.Housing && Housing.modalOpen)) {
            const camForward = _optVec3;
            camera.getWorldDirection(camForward);
            camForward.y = 0; camForward.normalize();
            const camRight = _optVec4;
            camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)); // Allocating (0,1,0) is fine/minimal, or we could define UP const.
            camRight.normalize();
            if (controls.forward) v.add(camForward);
            if (controls.backward) v.sub(camForward);
            if (controls.right) v.add(camRight);
            if (controls.left) v.sub(camRight);
        }

        sprite = player.getObjectByName("playerSprite");
        if (v.length() > 0) {
            // A rowboat glides faster than walking; deep water slows a swimmer.
            let speedMult = isSailing ? 1.35 : 1;
            if (!isSailing && !isInVoid && !isInLavaWorld) {
                const surf = waterSurfaceAt(player.position.x, player.position.z);
                if (surf !== null) {
                    const bed = getTerrainHeight(player.position.x, player.position.z);
                    if (surf - bed > SHALLOW_DEPTH) speedMult *= SWIM_SPEED_MULT;
                }
            }
            v.normalize();player.userData.lastMoveDirection={x:v.x,z:v.z};
            v.multiplyScalar(PLAYER_SPEED * speedMult * dt);
            // OPTIMIZATION: Reuse vector
            const np = _optVec1.copy(player.position).add(v);
            let col = false;

            // --- COLLISION CHECKS ---
            if(window.Housing && Housing.inside)col=!Housing.canStand(np);
            else if (isInLavaWorld) {
                // Check against Lava Rocks
                if (typeof lavaColliders !== 'undefined') {
                    for (let r of lavaColliders) {
                        const dist = Math.sqrt((np.x - r.x) ** 2 + (np.z - r.z) ** 2);
                        if (dist < 0.5 + r.radius) col = true;
                    }
                }
            }
            else if (isInVoid) {
                // Void Edge
                // OPTIMIZATION: Reuse vector
                const voidCenter = _optVec3.set(10000, 2000, 10000);
                if (np.distanceTo(voidCenter) > 38) col = true;
            }
            else {
                // Main World Trees & Walls
                for (let t of treeColliders) {
                    // Horizontal-only check: colliders sit at y=0 but the player stands
                    // on terrain, so a 3D distance would shrink (or erase) the blocking
                    // radius on hills and raised custom-level land.
                    const rr = 0.5 + t.radius;
                    const tdx = np.x - t.x, tdz = np.z - t.z;
                    if (tdx * tdx + tdz * tdz < rr * rr) col = true;
                }
                for (let b of staticColliders) {
                    if (staticColliderHits(b,np)) col = true;
                }
                // Water Collision (Lake, Pond, Dark Pond). A rowboat ignores all
                // of it, and the open ocean is walkable (as a slow swim), so only
                // the home island's own water still blocks an on-foot player.
                if (!isSailing && !(window.CUSTOM_LEVEL && window.Level)) {
                    // (Custom levels skip this: all their water is swimmable. The
                    // authored map's own sea and the ocean apron beyond it are one
                    // continuous body, so blocking the inner part would wall the
                    // player in and make the apron islands unreachable. Fishing
                    // zones still come from Level.isWater / zoneAt.)
                    const npDist = np.length();
                    const homeIsland = npDist < ISLAND_RADIUS + 2;
                    if (homeIsland) {
                        if (npDist < LAKE_RADIUS + 0.5) col = true; // Main Lake

                        if (window.pondCollider) {
                            if (np.distanceTo(_optVec3.set(window.pondCollider.x, 0, window.pondCollider.z)) < window.pondCollider.radius + 0.5) col = true;
                        }

                        if (window.darkPondCollider) {
                            if (np.distanceTo(_optVec3.set(window.darkPondCollider.x, 0, window.darkPondCollider.z)) < window.darkPondCollider.radius + 0.5) col = true;
                        }
                    }
                }

                // River checks removed (River is gone)
            }

            if(!col && window.Housing && !Housing.inside)col=Housing.collidesExterior(np);
            if (!col) {
                player.position.add(v);

                // Only rotate player based on movement in third-person mode
                // In first-person, player rotation is set by camera yaw later
                if (!isFirstPerson) {
                    const targetRotation = Math.atan2(v.x, v.z);
                    let rotDiff = targetRotation - player.rotation.y;
                    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
                    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
                    player.rotation.y += rotDiff * 10 * dt;
                }
            }
            if (fishingState !== 'idle' && fishingState !== 'charging') stopFishing(false, "Moved!");

            // Animation — the player sits in the rowboat while sailing, so the
            // walking bob and footsteps are suppressed; the water loop takes over.
            if (isSailing) {
                if (sprite) {
                    sprite.position.y = THREE.MathUtils.lerp(sprite.position.y, 1.46875, 10 * dt);
                    sprite.rotation.z = THREE.MathUtils.lerp(sprite.rotation.z, 0, 10 * dt);
                    sprite.rotation.x = THREE.MathUtils.lerp(sprite.rotation.x, 0, 10 * dt);
                }
            } else {
                const time = Date.now() * 0.012;
                if (sprite) {
                    sprite.position.y = 1.46875 + (sprite.userData.is3D?0:Math.abs(Math.sin(time)) * 0.3);
                    sprite.rotation.z = sprite.userData.is3D?0:Math.sin(time) * 0.15;
                    sprite.rotation.x = THREE.MathUtils.lerp(sprite.rotation.x, 0, 10 * dt);
                }
                if (audioCtx.currentTime - lastFootstepTime > 0.35) {
                    const inDeepWater = (() => {
                        if (isSailing || isInVoid || isInLavaWorld) return false;
                        const s = waterSurfaceAt(player.position.x, player.position.z);
                        const b = getTerrainHeight(player.position.x, player.position.z);
                        return s !== null && s - b > SHALLOW_DEPTH;
                    })();
                    broadcastSound(inDeepWater ? 'swim' : 'footstep');
                    lastFootstepTime = audioCtx.currentTime;
                }
                SailAudio.setActive(false);
            }
        } else {
            if (sprite && !isDiving && !isProne && !isSitting) {
                sprite.position.y = THREE.MathUtils.lerp(sprite.position.y, 1.46875, 10 * dt);
                sprite.rotation.z = THREE.MathUtils.lerp(sprite.rotation.z, 0, 10 * dt);
                sprite.rotation.x = THREE.MathUtils.lerp(sprite.rotation.x, 0, 10 * dt);
            }
            // Not moving: the rowing loop drops out (also covers idling in the boat).
            SailAudio.setActive(false);
        }

        const walkBody=player.getObjectByName('playerSprite');
        const lastWalk=player.userData.lastWalkPosition;
        const walked=!!lastWalk&&Math.hypot(player.position.x-lastWalk.x,player.position.z-lastWalk.z)>.0001;
        player.userData.lastWalkPosition={x:player.position.x,z:player.position.z};
        const personalBoat=player.getObjectByName('sailBoat');
        if(personalBoat&&window.Rowboat3D){
            const rowing=isSailing&&walked;
            if(Rowboat3D.animate(personalBoat,rowing,dt))broadcastSound('sail');
            SailAudio.setActive(rowing);
        }
        updateStandingAnimation(player,!walked&&playerVelocity.y===0&&!controls.jump,chatTypingActive(),dt,isSailing||isProne||isDiving||isSitting||fishingState==='reeling'||fishingState==='charging'||playerVelocity.y!==0||controls.jump||player.position.y>floorY+.03||walkBody?.userData.jumpState?.landing>0||player.userData.reelAnimation?.weight>0);
        if(walkBody?.userData.is3D)window.Character3D?.animateWalk(walkBody,walked&&!isSailing&&!isProne&&!isDiving&&!isSitting&&playerVelocity.y===0,dt);

        updateReelingAnimation(player,fishingState==='reeling'&&!!minigame.active,dt);
        applyBellySlidePose(player,isDiving||isProne,dt);
        applySittingPose(player,isSitting,dt);
        if(isProne){playerVelocity.x=0;playerVelocity.z=0;}

        // 4. GRAVITY
        player.userData.previousPhysicsFeetY=player.position.y;
        if (player.position.y > floorY) playerVelocity.y -= GRAVITY * dt;
        if (player.position.y <= floorY) {
            if (player.position.y < floorY && playerVelocity.y < 0) {
                const inDeepWater = (() => {
                    if (isSailing || isInVoid || isInLavaWorld) return false;
                    const s = waterSurfaceAt(player.position.x, player.position.z);
                    const b = getTerrainHeight(player.position.x, player.position.z);
                    return s !== null && s - b > SHALLOW_DEPTH;
                })();
                broadcastSound(inDeepWater ? 'splash' : 'footstep');
            }
            player.position.y = floorY; playerVelocity.y = 0;
            if (controls.jump && !isProne && !isDiving && !isSitting) {
                playerVelocity.y = JUMP_FORCE;
                broadcastSound('jump');
            }
        }
        player.position.y += playerVelocity.y * dt;
        player.userData.jumpAirborne=!isSailing&&!isProne&&!isDiving&&!isSitting&&(playerVelocity.y>0||player.position.y>floorY+.03);
        updateJumpAnimation(player,player.userData.jumpAirborne,playerVelocity.y,dt,isSailing||isProne||isDiving||isSitting);

        // 5. BOUNDARIES
        if(window.Housing && Housing.inside)Housing.clampPlayer();
        else if (isInLavaWorld) {
            // OPTIMIZATION: Reuse vector
            const lavaCenter = _optVec3.set(-20000, -2.5, 0);

            const dx = player.position.x - lavaCenter.x;
            const dz = player.position.z - lavaCenter.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

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
            window.Ocean.clampPosition(player.position);
            if (!(window.CUSTOM_LEVEL && window.Level)) {
                // The boat may sit on any water. On foot the ocean is now open
                // too (you swim); only the home island's lake still blocks entry.
                if (isSailing) {
                    if (player.position.length() < LAKE_RADIUS - 6) player.position.setLength(LAKE_RADIUS - 6);
                } else if (player.position.length() < LAKE_RADIUS + 0.5) {
                    player.position.setLength(LAKE_RADIUS + 0.5);
                }
            }
        }

        // --- AUTO-DISMOUNT ---
        // Walking onto dry land removes the boat (peers pick the change up
        // through myData.sailing). A short grace period so launching from the
        // beach — where you are still standing on sand — doesn't instantly
        // kick you out before you reach the water.
        if (isSailing && !isInVoid && !isInLavaWorld) {
            const afloat = waterSurfaceAt(player.position.x, player.position.z) !== null;
            if (!afloat) {
                if (!sailDrySince) sailDrySince = Date.now();
                else if (Date.now() - sailDrySince > 800) {
                    sailDrySince = 0;
                    window.toggleSailing(); // dry-land path: steps ashore + hides the boat
                    showToast('Stepped ashore.');
                }
            } else {
                sailDrySince = 0;
            }
        } else {
            sailDrySince = 0;
        }

        }else{Boats.attachLocal(dt);sprite=player.getObjectByName("playerSprite");floorY=player.position.y;SailAudio.setActive(false);}
        if (isFirstPerson) {
            // First Person: Eye Level
            camera.position.copy(player.position);
            camera.position.y += 1.5+(player.getObjectByName('playerSprite')?.userData.upperLift||0);
            camera.rotation.set(cameraRotationX, cameraRotationY, 0, 'YXZ');
            player.visible = false; // Hide self locally

            // --- FIX: FORCE ROTATION LOCK ---
            // This ensures your sprite faces where you look, so other players see it correctly
            // Add PI offset because camera looks forward (-Z) but player rotation is based on +Z
            if(!isDiving&&!isProne)player.rotation.y = cameraRotationY + Math.PI;
            // -------------------------------

        } else {
            // Third Person: Orbit
            player.visible = true;
            camera.position.x = player.position.x + Math.sin(cameraRotationY) * cameraDistance * Math.cos(cameraRotationX);
            camera.position.z = player.position.z + Math.cos(cameraRotationY) * cameraDistance * Math.cos(cameraRotationX);
            camera.position.y = player.position.y + Math.sin(cameraRotationX) * cameraDistance + 3.47+(player.getObjectByName('playerSprite')?.userData.upperLift||0)/2;
            camera.lookAt(player.position.x, player.position.y + 1.47+(player.getObjectByName('playerSprite')?.userData.upperLift||0)/2, player.position.z);
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

                // Check pond (light pond)
                if (window.pondCollider) {
                    const distPond = Math.sqrt(
                        Math.pow(markerPos.x - window.pondCollider.x, 2) +
                        Math.pow(markerPos.z - window.pondCollider.z, 2)
                    );
                    if (distPond < window.pondCollider.radius) validCast = true;
                }

                // Check dark pond (60, 50)
                const distDarkPond = Math.sqrt(
                    Math.pow(markerPos.x - 60, 2) +
                    Math.pow(markerPos.z - 50, 2)
                );
                if (distDarkPond < 14) validCast = true;

                // Check ocean island ponds
                if (window.Ocean) {
                    try {
                        const lay = window.Ocean.layout();
                        if (lay && lay.ponds) {
                            for (let i = 0; i < lay.ponds.length; i++) {
                                const p = lay.ponds[i];
                                const dp = Math.sqrt(Math.pow(markerPos.x - p.x, 2) + Math.pow(markerPos.z - p.z, 2));
                                if (dp < p.radius) { validCast = true; break; }
                            }
                        }
                    } catch(e){}
                }

                // Check river
                if (window.riverColliders) {
                    for (const rc of window.riverColliders) {
                        const distRiver = Math.sqrt(
                            Math.pow(markerPos.x - rc.x, 2) +
                            Math.pow(markerPos.z - rc.z, 2)
                        );
                        if (distRiver < rc.radius) validCast = true;
                    }
                }

                // Check ocean (beyond island)
                if (distFromLakeCenter > ISLAND_RADIUS - 5) validCast = true;
            }

            if (validCast) {
                castMarker.children.forEach(c => c.material.color.setHex(0x00ff00));
            } else {
                castMarker.children.forEach(c => c.material.color.setHex(0xff0000));
            }
        }

        if (sprite) updateSpriteDirection(player, camera.position);

        // --- INTERACTIONS ---
        interactTarget = null;
        canSell = false;

        const prompt = document.getElementById('npc-prompt');
        const btn = isMobile ? document.getElementById('btn-action') : null;
        prompt.style.display = 'none';
        prompt.style.color = 'white'; // Reset color
        if (btn) btn.innerText = "FISH";

        if(!(window.Housing && Housing.inside)){
        // --- MAIN WORLD INTERACTIONS ---
        if (!isInVoid && !isInLavaWorld) {
            const dMerchant = player.position.distanceTo(npcMerchant.position);
            const dStylist = player.position.distanceTo(npcStylist.position);
            const dBait = player.position.distanceTo(npcBait.position);
            const dLava = npcLavaKeeper ? player.position.distanceTo(npcLavaKeeper.position) : 999;
            const dFisher = npcFisher ? player.position.distanceTo(npcFisher.position) : 999;
            const dScratch = npcScratch ? player.position.distanceTo(npcScratch.position) : 999;

            if (dMerchant < 3) {
                canSell = true; interactTarget = 'merchant';
                prompt.innerText = "PRESS E TO TRADE"; prompt.style.display = 'block';
                if (btn) btn.innerText = "TRADE";
            }
            else if (dStylist < 3) {
                interactTarget = 'stylist';
                prompt.innerText = "PRESS E TO SHOP"; prompt.style.display = 'block';
                if (btn) btn.innerText = "SHOP";
            }
            else if (dBait < 3) {
                interactTarget = 'bait';
                prompt.innerText = "PRESS E FOR BAIT"; prompt.style.display = 'block';
                if (btn) btn.innerText = "BAIT";
            }
            else if (npcTutorial && player.position.distanceTo(npcTutorial.position) < 3) {
                interactTarget = 'tutorial';
                prompt.innerText = "PRESS E FOR GUIDE"; prompt.style.display = 'block';
                if (btn) btn.innerText = "GUIDE";
            }
            else if (dLava < 3) {
                interactTarget = 'lava_keeper';
                if (saveState.lavaUnlocked) {
                    prompt.innerText = "PRESS E TO ENTER LAVA WORLD";
                    if (btn) btn.innerText = "ENTER";
                } else {
                    prompt.innerText = "PRESS E TO UNLOCK ($80k)";
                    if (btn) btn.innerText = "BUY";
                }
                prompt.style.display = 'block';
            }
            else if (dFisher < 3) {
                interactTarget = 'fisher';
                prompt.innerText = "PRESS E TO TALK";
                if (btn) btn.innerText = "TALK";
                prompt.style.display = 'block';
            }
            else if (dScratch < 3) {
                interactTarget = 'scratch';
                prompt.innerText = "PRESS E FOR SCRATCH CARDS";
                if (btn) btn.innerText = "SCRATCH";
                prompt.style.display = 'block';
            }
        }

        // --- LAVA WORLD INTERACTIONS ---
        else if (isInLavaWorld) {
            // Check distances to the Lava versions of the NPCs
            const dLavaMerch = npcLavaMerchant ? player.position.distanceTo(npcLavaMerchant.position) : 999;
            const dLavaStyle = npcLavaStylist ? player.position.distanceTo(npcLavaStylist.position) : 999;
            const dLavaBait = npcLavaBait ? player.position.distanceTo(npcLavaBait.position) : 999;

            if (dLavaMerch < 3) {
                canSell = true; interactTarget = 'merchant';
                prompt.innerText = "PRESS E TO SELL"; prompt.style.display = 'block';
                if (btn) btn.innerText = "SELL";
            }
            else if (dLavaStyle < 3) {
                interactTarget = 'stylist';
                prompt.innerText = "PRESS E TO SHOP"; prompt.style.display = 'block';
                if (btn) btn.innerText = "SHOP";
            }
            else if (dLavaBait < 3) {
                interactTarget = 'bait';
                prompt.innerText = "PRESS E FOR BAIT"; prompt.style.display = 'block';
                if (btn) btn.innerText = "BAIT";
            }
        }

        if(!isInVoid&&!isInLavaWorld&&!(window.Housing&&Housing.inside))window.Halloween?.prompt(player,prompt,btn);
        window.Boats?.prompt(prompt,btn);
        window.Exploration?.prompt(prompt,btn);

        // --- FLOWER PROMPT ---
        if (prompt.style.display === 'none' && !isInVoid && !isInLavaWorld) {
            for (let i = 0; i < pickableFlowers.length; i++) {
                const flower = pickableFlowers[i];
                if (flower && !flower.userData.isPicked && flower.visible) {
                    const dist = player.position.distanceTo(flower.position);
                    if (dist < 2.5) { // Slightly larger radius than pick range (2) so prompt appears before click works
                        const typeId = flower.userData.typeId || 'daisy';
                        const flowerType = FLOWER_TYPES.find(f => f.id === typeId) || FLOWER_TYPES[0];

                        prompt.innerText = `PRESS E TO COLLECT ${flowerType.name.toUpperCase()}`;
                        prompt.style.display = 'block';
                        prompt.style.color = flowerType.color; // Bonus: color match!
                        if (btn) btn.innerText = "COLLECT";

                        // Reset color if we move away? No, innerText rewrite handles it.
                        // But we should ensure default white color for other prompts next frame.
                        // Actually, prompts are recreated/reset every frame: prompt.style.display = 'none';
                        break;
                    }
                }
            }
        }

        // --- YOUTUBE SCREEN PROMPT ---
        // Standing near a screen offers to swap its video (placer or host only;
        // ownership is re-checked inside changeScreenVideo()).
        if (prompt.style.display === 'none' && !isInVoid && !isInLavaWorld) {
            const me = String(typeof myDeviceID !== 'undefined' && myDeviceID ? myDeviceID : '');
            let bestId = null, bestD = 4.2;
            for (const pid in props) {
                const m = props[pid];
                const pd = m && m.userData && m.userData.propData;
                if (!pd || pd.type !== 'screen') continue;
                const d = player.position.distanceTo(m.position);
                if (d < bestD) { bestD = d; bestId = pid; }
            }
            if (bestId) {
                const pd = props[bestId].userData.propData;
                interactTarget = 'ytscreen';
                interactScreenId = bestId;
                prompt.innerText = 'PRESS E FOR QUEUE';
                prompt.style.display = 'block';
                if (btn) btn.innerText = "QUEUE";
            }
        }
        } // Outdoor interactions
    }

    if(window.Housing)Housing.tick();

    // --- REMOTE PLAYERS ---
    Object.keys(otherPlayers).forEach(id => {
        const p = otherPlayers[id];
        const dist = p.mesh.position.distanceTo(p.targetPos);
        const isMoving = dist > 0.1;
        p.mesh.position.lerp(p.targetPos, 6 * dt);
        p.mesh.rotation.y = THREE.MathUtils.lerp(p.mesh.rotation.y, p.targetRot, 6 * dt);
        const s = p.mesh.getObjectByName("playerSprite");
        const remoteSailing = p.lastData && p.lastData.sailing;
        if(window.Rowboat3D)Rowboat3D.animate(p.mesh.getObjectByName('sailBoat'),!!remoteSailing&&isMoving,dt);
        const remoteDive = p.lastData && p.lastData.dive;
        const remoteProne = p.lastData && p.lastData.prone;
        const remoteSitting = p.lastData && p.lastData.sitting===true;
        if (s) {
            updateSpriteDirection(p.mesh, camera.position);
            if(!remoteSitting)applySittingPose(p.mesh,false,dt);
            if(!remoteDive&&!remoteProne)applyBellySlidePose(p.mesh,false,dt);
            updateStandingAnimation(p.mesh,p.lastData?.idle===true&&!isMoving,p.lastData?.typing===true&&Date.now()-p.lastSeen<3000,dt,remoteSailing||remoteDive||remoteProne||remoteSitting||p.lastData?.jumping===true||p.lastData?.reeling===true||s.userData.jumpState?.landing>0||p.mesh.userData.reelAnimation?.weight>0);
            if(s.userData.is3D)window.Character3D?.animateWalk(s,isMoving&&!remoteSailing&&!remoteDive&&!remoteProne&&!remoteSitting,dt);
            updateReelingAnimation(p.mesh,p.lastData?.reeling===true,dt);
            if(remoteSitting){
                applySittingPose(p.mesh,true,dt);
            } else if (remoteDive||remoteProne) {
                applyBellySlidePose(p.mesh,true,dt);
            } else if (isMoving && !remoteSailing) {
                const time = Date.now() * 0.012;
                s.position.y = 1.46875 + (s.userData.is3D?0:Math.abs(Math.sin(time)) * 0.3);
                s.rotation.z = s.userData.is3D?0:Math.sin(time) * 0.15;
                s.rotation.x = THREE.MathUtils.lerp(s.rotation.x, 0, 10 * dt);
            } else {
                s.position.y = THREE.MathUtils.lerp(s.position.y, 1.46875, 10 * dt);
                s.rotation.z = THREE.MathUtils.lerp(s.rotation.z, 0, 10 * dt);
                s.rotation.x = THREE.MathUtils.lerp(s.rotation.x, 0, 10 * dt);
            }
        }
        if(s)updateJumpAnimation(p.mesh,p.lastData?.jumping===true&&!remoteSailing&&!remoteDive&&!remoteProne&&!remoteSitting,Number(p.lastData?.jumpVelocity)||0,dt,remoteSailing||remoteDive||remoteProne||remoteSitting);
        if (p.bobberMesh && p.lineMesh) {
            const rod = p.mesh.getObjectByName("rod");
            if (rod) {
                const tipObj = rod.getObjectByName('rodTip');
                const tip = tipObj
                    ? new THREE.Vector3().setFromMatrixPosition(tipObj.matrixWorld)
                    : new THREE.Vector3(3.0, 3.0, 0).applyMatrix4(rod.matrixWorld);
                const pArr = p.lineMesh.geometry.attributes.position.array;
                pArr[0] = tip.x; pArr[1] = tip.y; pArr[2] = tip.z;
                pArr[3] = p.bobberMesh.position.x; pArr[4] = p.bobberMesh.position.y; pArr[5] = p.bobberMesh.position.z;
                p.lineMesh.geometry.attributes.position.needsUpdate = true;
            }
        }
    });

    window.Boats?.attachRemote(dt);
    // Bobber Gravity (when falling)
    if (bobber && window.bobberFalling) {
        window.bobberVelocityY -= 20 * dt; // Gravity
        bobber.position.y += window.bobberVelocityY * dt;

        // Hit water?
        if (bobber.position.y <= window.bobberTargetY) {
            bobber.position.y = window.bobberTargetY;
            window.bobberFalling = false;
            bobberInitialY = window.bobberTargetY;
            // Play splash sound
            if (typeof Sound !== 'undefined') Sound.playSpatial('cast', bobber.position);
        }
    }

    // Bobber Animation (Waiting - only when not falling)
    if (bobber && fishingState === 'waiting' && !window.bobberFalling) {
        // Use bobberInitialY for consistent water level relative to cast
        bobber.position.y = bobberInitialY + Math.sin(Date.now() * 0.003) * 0.05;
    }

    // Fishing Line Update
    if (fishingLine && bobber && player) {
        if (fishingState !== 'idle' && fishingState !== 'charging') {
            fishingLine.visible = true;
            const rod = player.getObjectByName("rod");
            const tipObj = rod && rod.getObjectByName('rodTip');
            const tip = tipObj
                ? new THREE.Vector3().setFromMatrixPosition(tipObj.matrixWorld)
                : new THREE.Vector3(3.0, 3.0, 0).applyMatrix4(rod.matrixWorld);
            const p = fishingLine.geometry.attributes.position.array;
            p[0] = tip.x; p[1] = tip.y; p[2] = tip.z;
            p[3] = bobber.position.x; p[4] = bobber.position.y; p[5] = bobber.position.z;
            fishingLine.geometry.attributes.position.needsUpdate = true;
        } else fishingLine.visible = false;
    }

    // Spatial audio: put the listener on the camera so distance falloff is
    // measured from the player, not from the world origin.
    if (window.updateAudioListener) { try { window.updateAudioListener(camera); } catch (e) { } }

    // CSS3D overlays (YouTube/Twitch screens). The world overlay and the
    // house-interior overlay are separate renderers so only the matching scene
    // is projected onto the canvas.
    const indoorCss = !!(window.Housing && Housing.inside);
    if (window.tickYtScreens) {
        try { window.tickYtScreens(); } catch (e) { }
    }
    if (cssRenderer) {
        const display = indoorCss ? 'none' : '';
        if (cssRenderer.domElement.style.display !== display) cssRenderer.domElement.style.display = display;
        if (!indoorCss) cssRenderer.render(cssScene, camera);
    }
    if (window.setHouseCssVisible) { try { window.setHouseCssVisible(indoorCss); } catch (e) { } }
    if (indoorCss && window.renderHouseCss) { try { window.renderHouseCss(camera); } catch (e) { } }

    window.ReelAudio?.tick();
    window.Emotes?.tick();
    window.Halloween?.tick();
    window.Ocean?.updateHorizon(camera,!isInVoid&&!isInLavaWorld&&!window.Housing?.inside);
    renderGameView(window.Housing && Housing.renderScene || scene, camera);
    GamePerformance.finishFrame(performance.now(),null,saveState.showFPS!==false);
}
clock = new THREE.Clock();

// Gracefully disconnect from peer server on window close.
window.addEventListener('beforeunload', () => {
    // Drop our row from the master's server browser right away instead of
    // waiting for it to time out.
    leaveLobbyDirectory();
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

// --- SECURITY: coerce fish objects that arrived from the network ---
// A hostile peer controls fish fields; keep only primitives with
// sane lengths so poisoned values can't render as HTML or break inventory
// code (the Merchant panel interpolates price into innerHTML).
function sanitizeFish(f) {
    if (!f || typeof f !== "object") return null;
    const out = {};
    Object.keys(f).forEach(k => {
        const v = f[k];
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    });
    Object.keys(out).forEach(k => { if (typeof out[k] === "string") out[k] = out[k].slice(0, 120); });
    out.name = String(f.name || "???").slice(0, 60);
    const num = (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 && n <= 1e12 ? n : undefined;
    };
    const price = num(f.price); if (price !== undefined) out.price = price; else delete out.price;
    const value = num(f.value); if (value !== undefined) out.value = value; else delete out.value;
    out.tierId = String(f.tierId || "normal").slice(0, 24);
    if (out.tierName !== undefined) out.tierName = String(out.tierName).slice(0, 32);
    if (out.sizeLabel !== undefined) out.sizeLabel = String(out.sizeLabel).slice(0, 32);
    return out;
}

// --- LINE OF SIGHT MATH HELPERS ---

// 1. Check if a line segment (p1 to p2) intersects a Circle (x, z, radius)
function lineIntersectsCircle(p1, p2, cx, cz, r) {
    // Vector from p1 to p2
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const lenSq = dx * dx + dz * dz;

    // Project circle center onto the line to find closest point
    let t = ((cx - p1.x) * dx + (cz - p1.z) * dz) / lenSq;

    // Clamp t to the segment [0, 1]
    t = Math.max(0, Math.min(1, t));

    // Find coordinates of the closest point on the line
    const closeX = p1.x + t * dx;
    const closeZ = p1.z + t * dz;

    // Check distance from closest point to circle center
    const distSq = (closeX - cx) * (closeX - cx) + (closeZ - cz) * (closeZ - cz);

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
        if (b.planes?caveRockBlocksLine(start,end,b):lineIntersectsBox(start, end, b)) {
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

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupHotbar();
        setTimeout(setupHotbarDrag, 100);
        setTimeout(setupPanelTabBar, 100);
    });
} else {
    // DOM is already ready, run immediately
    setupHotbar(); // Initialize Hotbar
    setTimeout(setupHotbarDrag, 100);
    setTimeout(setupPanelTabBar, 100);
}

// --- SKILLS UI ---
window.toggleSkillsUI = function () {
    const ui = document.getElementById('skills-ui');
    const isOpen = ui.style.display === 'flex';

    if (!isOpen) {
        ui.style.display = 'flex';
        renderSkillsUI();
        if (document.pointerLockElement) document.exitPointerLock();
    } else {
        ui.style.display = 'none';
        const canvas = renderer?.domElement;
        if (canvas && !document.pointerLockElement) canvas.requestPointerLock();
    }
};

function renderSkillsUI() {
    const list = document.getElementById('skills-list');
    if (!list) return;
    list.innerHTML = '';

    if (typeof ensureSkills === 'function') ensureSkills();
    else if (!saveState.skills) saveState.skills = {};

    const skillData = (typeof SKILLS !== 'undefined') ? SKILLS : [
        { id: 'fishing', name: 'Fishing', icon: 'rod', color: '#4a90d9' },
        { id: 'lumberjack', name: 'Lumberjack', icon: 'axe', color: '#a9763f' },
        { id: 'mining', name: 'Mining', icon: 'pickaxe', color: '#9aa3c0' },
        { id: 'floristry', name: 'Floristry', icon: 'flower', color: '#e58fb8' }
    ];

    skillData.forEach(skill => {
        const xp = saveState.skills[skill.id]?.xp || 0;
        const level = getLevelFromXP(xp);
        const xpForCurrent = getXPForLevel(level);
        const xpForNext = level < 99 ? getXPForLevel(level + 1) : xp;
        const xpProgress = level >= 99 ? 100 : ((xp - xpForCurrent) / (xpForNext - xpForCurrent)) * 100;

        const div = document.createElement('div');
        div.style.cssText = 'background: var(--p-face-2); border: 2px solid var(--p-line); padding: 12px;';
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 17px; color: var(--p-text);">${window.PX ? PX.icon(skill.icon, 17) : ''} ${skill.name}</span>
                <span style="font-size: 17px; color: var(--p-sand);">Level ${level}</span>
            </div>
            <div style="background: var(--p-sunken); border: 2px solid var(--p-line); height: 14px; overflow: hidden;">
                <div style="width: ${xpProgress.toFixed(1)}%; height: 100%; background: ${skill.color}; transition: width 0.3s steps(4);"></div>
            </div>
            <div style="font-size: 15px; color: var(--p-text-mute); margin-top: 4px; text-align: right;">
                ${level >= 99 ? 'MAX LEVEL' : `${xp.toLocaleString()} / ${xpForNext.toLocaleString()} XP`}
            </div>
        `;
        list.appendChild(div);
    });
}


// --- COOKING SYSTEM ---
// Cooking turns raw fish into meals. The meal keeps the fish's identity but is
// worth more and can't be cooked twice, so the loop is: catch -> cook -> sell.
const COOK_VALUE_MULT = 2.2;   // cooked meal sell price vs. raw fish
const COOK_BURN_VALUE_MULT = 0.4; // burnt meal, still sellable for a little

function isCookableFish(f) {
    return f && !f.cooked && !f.burnt && typeof f.name === 'string';
}

// The meal a raw fish becomes, or the burnt version of it.
function makeCookedFish(f, burnt) {
    const base = Number(f.price || f.value || 10);
    const mult = burnt ? COOK_BURN_VALUE_MULT : COOK_VALUE_MULT;
    return Object.assign({}, f, {
        name: (burnt ? 'Burnt ' : 'Cooked ') + f.name,
        cooked: !burnt,
        burnt: !!burnt,
        cookedFrom: f.name,
        price: Math.max(1, Math.round(base * mult))
    });
}

window.toggleCookingUI = function () {
    const ui = document.getElementById('cooking-ui');
    if (!ui) return;
    const isOpen = ui.style.display === 'flex';
    if (!isOpen) {
        ui.style.display = 'flex';
        renderCookingUI();
        if (document.pointerLockElement) document.exitPointerLock();
    } else {
        ui.style.display = 'none';
        const canvas = renderer?.domElement;
        if (canvas && !document.pointerLockElement) canvas.requestPointerLock();
    }
};

function cookableIndexes(){return availableCookingFish().map(item=>item.idx);}

function renderCookingUI() {
    const list = document.getElementById('cooking-list');
    if (!list) return;
    list.innerHTML = '';

    const lvl = getSkillLevel('cooking');
    const head = document.createElement('div');
    head.style.cssText = 'font-size:14px;color:var(--p-text-mute);';
    // Show the size of the hit zone (sweet spot) instead of burn chance
    const sweetSpot = Math.min(65, 20 + lvl * 0.5);
    head.textContent = `Cooking level ${lvl} · sweet spot ${Math.round(sweetSpot)}%`;
    list.appendChild(head);

    const idxs = cookableIndexes();
    if (idxs.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:var(--p-text-dim);padding:10px;';
        empty.textContent = 'No raw fish to cook. Catch some first!';
        list.appendChild(empty);
        return;
    }

    // Group by species so 20 identical fish don't make 20 rows.
    const groups = new Map();
    idxs.forEach(i => {
        const f = saveState.inventory[i];
        if (!groups.has(f.name)) groups.set(f.name, { count: 0, sample: f });
        groups.get(f.name).count++;
    });

    groups.forEach((g, name) => {
        const base = Number(g.sample.price || g.sample.value || 10);
        const meal = Math.round(base * COOK_VALUE_MULT);
        const row = document.createElement('div');
        row.style.cssText = 'background:var(--p-face-2);border:2px solid var(--p-line);padding:10px;display:flex;justify-content:space-between;align-items:center;';
        const info = document.createElement('div');
        info.innerHTML = `<div style="font-weight:bold;">${window.PX ? PX.icon('fish', 15) + ' ' : ''}${escapeHTML(name)} ×${g.count}</div>` +
            `<div style="font-size:13px;color:var(--p-text-dim);margin-top:2px;">Raw $${base} → Meal ~$${meal}</div>`;
        const btn = document.createElement('button');
        btn.className = 'btn-sm btn-green';
        btn.textContent = 'COOK';
        btn.onclick = () => { cookFishByName(name); renderCookingUI(); };
        row.appendChild(info);
        row.appendChild(btn);
        list.appendChild(row);
    });
}

let cookingMini = {
    active: false,
    dir: 1,
    pos: 0,
    speed: 0.6,
    zoneLeft: 30,
    zoneWidth: 40,
    items: [],
    results: [],
    currentIdx: 0,
    loopId: null
};

function updateCookingMinigameUI() {
    const ui = document.getElementById('cooking-minigame-ui');
    const zone = document.getElementById('cooking-mini-zone');
    const bar = document.getElementById('cooking-mini-bar');
    const title = document.getElementById('cooking-mini-title');
    
    if (ui) ui.style.display = cookingMini.active ? 'flex' : 'none';
    if (zone) {
        zone.style.left = cookingMini.zoneLeft + '%';
        zone.style.width = cookingMini.zoneWidth + '%';
    }
    if (bar) bar.style.left = cookingMini.pos + '%';
    if (title && cookingMini.items[cookingMini.currentIdx]) {
        title.textContent = `Cook ${cookingMini.items[cookingMini.currentIdx].name} (${cookingMini.currentIdx + 1}/${cookingMini.items.length})`;
    }
}

function startCookingMinigame(items) {
    if (cookingMini.active || items.length === 0) return;
    // Close cooking UI so minigame is visible
    const cookUi = document.getElementById('cooking-ui');
    if (cookUi) cookUi.style.display = 'none';
    cookingMini.active = true;
    cookingMini.items = items.slice();
    cookingMini.results = [];
    cookingMini.currentIdx = 0;
    cookingMini.pos = 0;
    cookingMini.dir = 1;
    
    const lvl = getSkillLevel ? getSkillLevel('cooking') : 1;
    // Difficulty scaling: higher level = easier, rarer fish = harder
    const firstFish = items[0].f;
    const rarity = firstFish.rarity || 'Common';
    
    let baseSpeed = 0.8;
    if (rarity === 'Uncommon') baseSpeed = 0.9;
    else if (rarity === 'Rare') baseSpeed = 1.1;
    else if (rarity === 'Epic') baseSpeed = 1.4;
    else if (rarity === 'Legendary') baseSpeed = 1.8;
    
    // Cooking level reduces difficulty
    cookingMini.speed = Math.max(0.25, baseSpeed - (lvl * 0.015));
    cookingMini.zoneWidth = Math.min(65, 20 + (lvl * 0.5));
    cookingMini.zoneLeft = 50 - cookingMini.zoneWidth / 2;
    
    updateCookingMinigameUI();
    if (document.pointerLockElement) document.exitPointerLock();
    
    const loop = () => {
        if (!cookingMini.active) {
            if (cookingMini.loopId) cancelAnimationFrame(cookingMini.loopId);
            cookingMini.loopId = null;
            return;
        }
        cookingMini.pos += cookingMini.dir * cookingMini.speed * 3;
        if (cookingMini.pos >= 94) { cookingMini.pos = 94; cookingMini.dir = -1; }
        if (cookingMini.pos <= 0) { cookingMini.pos = 0; cookingMini.dir = 1; }
        updateCookingMinigameUI();
        cookingMini.loopId = requestAnimationFrame(loop);
    };
    if (cookingMini.loopId) cancelAnimationFrame(cookingMini.loopId);
    loop();
}

window.cancelCookingMinigame = function() {
    cookingMini.active = false;
    if (cookingMini.loopId) { cancelAnimationFrame(cookingMini.loopId); cookingMini.loopId = null; }
    updateCookingMinigameUI();
    renderCookingUI();
};

window.doCookingHit = function() {
    if (!cookingMini.active) return;
    const inZone = cookingMini.pos >= cookingMini.zoneLeft && cookingMini.pos <= cookingMini.zoneLeft + cookingMini.zoneWidth;
    cookingMini.results.push(inZone);
    
    cookingMini.currentIdx++;
    if (cookingMini.currentIdx >= cookingMini.items.length) {
        // Done cooking all
        cookingMini.active = false;
        if (cookingMini.loopId) { cancelAnimationFrame(cookingMini.loopId); cookingMini.loopId = null; }
        updateCookingMinigameUI();
        
        // Process results
        const inv = Array.isArray(saveState.inventory) ? saveState.inventory : [];
        let rawXP = 0, count = 0, burnt = 0;
        cookingMini.items.forEach((item, k) => {
            const liveIdx=inv.indexOf(item.f);
            ensureInventorySlots();
            const ownedSlot=saveState.invSlots.find(slot=>slot?.type==='fish'&&slot.name===item.f.name);
            if(liveIdx<0||!ownedSlot)return;
            const good = cookingMini.results[k];
            const isBurnt = !good;
            if (isBurnt) burnt++;
            inv[liveIdx] = makeCookedFish(item.f, isBurnt);
            rawXP += 6 + Math.round(Number(item.f.price || item.f.value || 10) / 12);
            count++;
            // Sync grid inventory: raw fish -> cooked/burnt fish
            try {
                ensureInventorySlots();
                const rawSlot = saveState.invSlots.find(s => s && s.type === 'fish' && s.name === item.f.name);
                if (rawSlot) {
                    if ((rawSlot.count || 1) > 1) rawSlot.count--;
                    else { const ri = saveState.invSlots.indexOf(rawSlot); if (ri !== -1) saveState.invSlots[ri] = null; }
                }
                const cookedName = (isBurnt ? 'Burnt ' : 'Cooked ') + item.f.name;
                const cookedSlot = saveState.invSlots.find(s => s && s.type === 'fish' && s.name === cookedName);
                if (cookedSlot) cookedSlot.count = (cookedSlot.count || 1) + 1;
                else {
                    const empty = saveState.invSlots.findIndex(s => s === null);
                    if (empty !== -1) saveState.invSlots[empty] = { type: 'fish', name: cookedName, color: item.f.color, size: item.f.size || 1, count: 1 };
                }
            } catch (e) { }
        });
        autoSortInventory();
        if (count > 0) {
            addSkillXP('cooking', rawXP);
            saveState.cookedFishCount = (saveState.cookedFishCount || 0) + count;
            if (typeof notifyCooked === 'function') notifyCooked(count);
            Sound.sell();
            saveGame();
            updateUI();
            renderCookingUI();
            showToast(`Cooked ${count} fish (${burnt} burnt, +${rawXP} Cooking XP)`, 'success');
        }
    } else {
        cookingMini.pos = 0;
        cookingMini.dir = 1;
        updateCookingMinigameUI();
    }
};

document.addEventListener('keydown', (e) => {
    if (cookingMini.active) {
        if (e.code === 'Space' || e.key === ' ') {
            e.preventDefault();
            window.doCookingHit();
        }
        if (e.key === 'Escape') {
            window.cancelCookingMinigame();
        }
    }
});

document.addEventListener('mousedown', (e) => {
    if (cookingMini.active) {
        window.doCookingHit();
    }
});

// Cooks every raw fish of one species
function cookFishByName(name){const items=availableCookingFish().filter(item=>item.f.name===name);if(!items.length)return 0;startCookingMinigame(items);return items.length;}

window.cookAllFish=function(){const items=availableCookingFish();if(!items.length){showToast('No raw fish to cook!');return;}startCookingMinigame(items);};



function defaultHotbar() {
    const tools = ['rod', 'hands', 'axe', 'guitar', 'glove', 'pickaxe'];
    const slots = new Array(10).fill(null);
    if (!saveState.unlockedTools) saveState.unlockedTools = ['hands', 'rod'];
    for (let i = 0; i < 6; i++) {
        const id = tools[i];
        if (saveState.unlockedTools.includes(id)) slots[i] = { type: 'tool', id: id };
    }
    return slots;
}

function setupHotbar() {
    const container = document.getElementById('hotbar-container');
    if (!container) return;
    if (!saveState.hotbar || !Array.isArray(saveState.hotbar) || saveState.hotbar.length !== 10) {
        saveState.hotbar = defaultHotbar();
    }
    container.innerHTML = '';

    for (let i = 0; i < 10; i++) {
        const slot = document.createElement('div');
        slot.className = 'hotbar-slot';
        slot.onclick = () => selectHotbarSlot(i);
        slot.oncontextmenu = (e) => { e.preventDefault(); if (saveState.hotbar) { saveState.hotbar[i] = null; updateHotbarVisuals(); saveGame(); } };

        const num = document.createElement('span');
        num.className = 'hotbar-number';
        num.innerText = i + 1;
        slot.appendChild(num);

        const icon = document.createElement('span');
        icon.className = 'hotbar-icon';
        icon.id = `hotbar-icon-${i}`;
        slot.appendChild(icon);

        slot.addEventListener('mouseenter', (e) => {
            const entry = saveState.hotbar ? saveState.hotbar[i] : null;
            showItemTooltip(getItemTooltipText(entry), e.clientX, e.clientY);
        });
        slot.addEventListener('mousemove', (e) => {
            const entry = saveState.hotbar ? saveState.hotbar[i] : null;
            showItemTooltip(getItemTooltipText(entry), e.clientX, e.clientY);
        });
        slot.addEventListener('mouseleave', () => hideItemTooltip());

        container.appendChild(slot);
    }
    if (saveState.activeHotbarIndex === undefined) saveState.activeHotbarIndex = 0;
    updateHotbarVisuals();
}

function updateHotbarVisuals() {
    for (let i = 0; i < 10; i++) {
        const iconEl = document.getElementById(`hotbar-icon-${i}`);
        if (!iconEl) continue;
        const slotEl = iconEl.parentElement;
        if (!saveState.hotbar) saveState.hotbar = defaultHotbar();

        const entry = saveState.hotbar[i];
        let opacity = 0.3;
        iconEl.innerHTML = '';
        if (entry) {
            if (entry.type === 'tool') {
                const tool = TOOLS.find(t => t.id === entry.id);
                const html = (window.PX && PX.has(entry.id)) ? PX.icon(entry.id, 30) : (tool ? tool.icon : '?');
                iconEl.innerHTML = html;
                opacity = (saveState.unlockedTools && saveState.unlockedTools.includes(entry.id)) ? 1 : 0.5;
            } else if (entry.type === 'fish') {
                try {
                    const tex = createFishTexture(entry.name, entry.color);
                    const cv = document.createElement('canvas');
                    cv.width = 32; cv.height = 32;
                    const cx = cv.getContext('2d');
                    cx.drawImage(tex.image, 0, 0, 32, 32);
                    iconEl.appendChild(cv);
                } catch (e) { iconEl.innerText = '🐟'; }
                opacity = 1;
            }
        }
        slotEl.style.opacity = opacity;

        if (i === (saveState.activeHotbarIndex || 0)) slotEl.classList.add('active');
        else slotEl.classList.remove('active');
    }
}

function selectHotbarSlot(index) {
    if (!saveState.hotbar) saveState.hotbar = defaultHotbar();
    if (index < 0 || index >= 10) return;
    saveState.activeHotbarIndex = index;
    const entry = saveState.hotbar[index];

    // Reset tools/fish
    if (localHeldFish) {
        localHeldFish = null;
        if (fishHoldTimer) clearTimeout(fishHoldTimer);
        fishHoldTimer = null;
    }
    const rod = player && player.getObjectByName("rod");
    if (rod) rod.visible = false;
    const axe = player && player.getObjectByName("axe");
    if (axe) axe.visible = false;
    const pick = player && player.getObjectByName("pickaxe");
    if (pick) pick.visible = false;
    if (isGuitarActive) toggleGuitar();
    if (isGloveActive) toggleGlove();

    if (!entry) {
        isHandsHidden = true;
    } else if (entry.type === 'tool') {
        const toolId = entry.id;
        if (!saveState.unlockedTools) saveState.unlockedTools = ['hands', 'rod'];
        if (!saveState.unlockedTools.includes(toolId)) {
            showToast("Tool locked!");
            updateHotbarVisuals();
            return;
        }
        isHandsHidden = (toolId === 'hands');
        if (toolId === 'rod') { if (rod) rod.visible = true; }
        else if (toolId === 'axe') { equipAxe(); if (axe) axe.visible = true; }
        else if (toolId === 'pickaxe') { equipPickaxe(); if (pick) pick.visible = true; }
        else if (toolId === 'guitar') { if (!isGuitarActive) toggleGuitar(); }
        else if (toolId === 'glove') { if (!isGloveActive) toggleGlove(); }
    } else if (entry.type === 'fish') {
        isHandsHidden = true;
        localHeldFish = { name: entry.name, color: entry.color, size: entry.size || 1.0, sizeLabel: 'Normal' };
        const oldFish = player && player.getObjectByName('heldFishSprite');
        if (oldFish) player.remove(oldFish);
        const fh = makeHeldFish(entry.name, entry.color, entry.size || 1.0);
        if (player) { player.add(fh); }
    }

    saveState.activeToolIndex = (entry && entry.type === 'tool') ? index : saveState.activeToolIndex;

    updateHotbarVisuals();
    saveGame();
}

// --- PIXEL-ART TOOL SPRITE HELPER ---
// Renders a 16x16 pixel-art grid (array of 16-char strings) into a crisp 64x64
// canvas texture. '.' (or a space) is transparent; palette maps chars to colors.
// Using hard rectangles + NearestFilter keeps the tools sharp and 8-bit looking
// instead of blurry anti-aliased vector art.
function makeToolTexture(rows, palette) {
    const S = 4, W = 16, H = 16;
    const c = document.createElement('canvas');
    c.width = W * S; c.height = H * S; // 64x64
    const ctx = c.getContext('2d');
    for (let y = 0; y < H && y < rows.length; y++) {
        const row = rows[y];
        for (let x = 0; x < W && x < row.length; x++) {
            const col = palette[row[x]];
            if (!col) continue;
            ctx.fillStyle = col;
            ctx.fillRect(x * S, y * S, S, S);
        }
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
}

// --- HELPER: AXE TEXTURE ---
function createAxeTexture() {
    const P = {
        w: '#7a4a1f', W: '#a9773f', d: '#4a2b10', // wooden handle
        s: '#9aa4b0', S: '#c9d3de', g: '#5c6672', e: '#eef3f9' // steel head
    };
    const rows = [
        '................',
        '................',
        '..........gsss..',
        '.........gSSSSg.',
        '........eSSSSSg.',
        '.......eSSSSSg..',
        '......eSSSSSg...',
        '.....eSSSSg.....',
        '.....eg.wW......',
        '.......wW.......',
        '......wW........',
        '.....wW.........',
        '....wW..........',
        '...wW...........',
        '..dwW...........',
        '.dwW............'
    ];
    return makeToolTexture(rows, P);
}

function equipAxe(){let tool=player.getObjectByName('axe');if(!tool){tool=makeHeldTool('axe','axe');player.add(tool);}tool.visible=true;}

function createPickaxeTexture() {
    const P = {
        w: '#7a4a1f', W: '#a9773f', d: '#4a2b10', // wooden handle
        s: '#9aa4b0', S: '#c9d3de', g: '#5c6672', e: '#eef3f9' // steel head
    };
    // Handle runs up-right; the double-ended pick head sits across the top,
    // perpendicular to the handle, tapering to sharp points at both ends.
    const rows = [
        '....e...........',
        '.....gs.........',
        '.....gSs........',
        '......gSs.......',
        '.......gSs......',
        '........gSs.....',
        '.........gSs....',
        '.........wWgs...',
        '........wW.gSs..',
        '.......wW...gSs.',
        '......wW.....gSe',
        '.....wW........e',
        '....wW..........',
        '...wW...........',
        '..dwW...........',
        '.dwW............'
    ];
    return makeToolTexture(rows, P);
}

function equipPickaxe(){let tool=player.getObjectByName('pickaxe');if(!tool){tool=makeHeldTool('pickaxe','pickaxe');player.add(tool);}tool.visible=true;}

// --- HELPER: GUITAR TEXTURE ---
function createGuitarTexture() {
    const P = {
        h: '#241a12', // headstock / tuning pegs
        a: '#d9c48a', // peg highlight
        n: '#3a2a19', // neck
        N: '#5a4230', // neck highlight
        s: '#e8e8e8', // string
        b: '#7a4a22', // body
        B: '#a9743c', // body highlight
        d: '#4a2b12', // body shadow
        k: '#160d06'  // sound hole
    };
    const rows = [
        '......hhhh......',
        '.....hhnnhh.....',
        '.......sN.......',
        '.......sN.......',
        '.......sN.......',
        '.......sN.......',
        '.......sN.......',
        '......bBBb......',
        '....bBBBBBBb....',
        '...bBBBkkBBBb...',
        '...bBBBkkBBBb...',
        '...bBBBBBBBBb...',
        '...bBBBBBBBBb...',
        '....bBBBBBBb....',
        '.....bBBBBb.....',
        '......dBBd......'
    ];
    return makeToolTexture(rows, P);
}

// --- HELPER: BOXING GLOVE TEXTURE ---
function createGloveTexture() {
    const P = {
        k: '#3a0d0d', // outline
        r: '#c62828', // glove red
        R: '#ef5350', // highlight
        d: '#8e1c1c', // shadow / thumb crease
        c: '#f2f2f2', // cuff
        g: '#c9c9c9'  // cuff shadow
    };
    const rows = [
        '................',
        '.....kkkkkk.....',
        '....krrrrrrk....',
        '..kkrrRrrrrrk...',
        '..krrrRrrrrrrk..',
        '.kkrrrrrrrrrrk..',
        'kkdrrrrrrrrrrk..',
        'kkddrrrrrrrrrk..',
        '.kkdrrrrrrrrrk..',
        '..kkkrrrrrrrk...',
        '...kkkgccckkk...',
        '......kcccck....',
        '......kcccck....',
        '......kcccck....',
        '......kkkkkk....',
        '................'
    ];
    return makeToolTexture(rows, P);
}

function performChop() {
    // Animate Axe
    const axe = player.getObjectByName("axe");
    if (axe) {
        // Swing Animation (Twitch Y rotation)
        const startRot = axe.userData.is3D?0:-Math.PI / 2;
        axe.rotation.y = startRot - 0.5;
        setTimeout(() => { if (axe) axe.rotation.y = startRot; }, 100);
    }

    // Raycast from player in facing direction (not camera)
    const raycaster = new THREE.Raycaster();
    const playerPos = player.position.clone();
    playerPos.y += 1; // Raycast from player chest height
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(player.quaternion);
    raycaster.set(playerPos, dir);
    const intersects = raycaster.intersectObjects(treeMeshes, true); // Recursive

    if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.distance < 6) { // Closer range since it's from player
            let target = hit.object;
            while (target && !treeMeshes.includes(target)) {
                target = target.parent;
            }
            const idx = treeMeshes.indexOf(target);
            if (idx !== -1) chopTree(idx);
        }
    }
}

function chopTree(index, fromNetwork = false) {
    if (index < 0 || index >= treeMeshes.length) return;
    const mesh = treeMeshes[index];
    if (!mesh || mesh.userData.isStump) return;

    // Skip rocks - they can only be mined with the pickaxe
    if (mesh.userData.isRock) return;

    // Initialize Health
    if (typeof mesh.userData.health === 'undefined') {
        const size = (mesh.scale.x || 1);
        mesh.userData.maxHealth = Math.floor(size * 4);
        if (mesh.userData.maxHealth < 2) mesh.userData.maxHealth = 2;
        mesh.userData.health = mesh.userData.maxHealth;
    }

    // Decrement Health
    mesh.userData.health--;

    // Play Sound
    Sound.playSpatial('punch'); // Hit sound

    // VISUAL FEEDBACK (Shake)
    if (mesh.userData.health > 0) {
        // Small shake
        const origX = mesh.position.x;
        mesh.position.x += (Math.random() - 0.5) * 0.2;
        setTimeout(() => mesh.position.x = origX, 50);
        return; // NOT chopped yet
    }

    // --- TIMBER! (Health <= 0) ---

    // Visual Transformation
    mesh.scale.set(mesh.scale.x, 0.2, mesh.scale.z);

    // Hide leaves (children 1, 2, 3) to make it look like a stump
    // Child 0 is trunk
    if (mesh.children && mesh.children.length > 1) {
        for (let i = 1; i < mesh.children.length; i++) {
            if (mesh.children[i]) mesh.children[i].visible = false;
        }
    }

    mesh.userData.isStump = true;

    // Respawn after 3 minutes
    setTimeout(() => {
        respawnTree(index);
    }, 180000);

    // Grant Wood (Only if local action)
    if (!fromNetwork) {
        // Get lumberjack level and determine wood type
        if (!saveState.skills) saveState.skills = { mining: { xp: 0 }, lumberjack: { xp: 0 }, fishing: { xp: 0 } };
        const lumberjackXP = saveState.skills.lumberjack?.xp || 0;
        const lumberjackLevel = getLevelFromXP(lumberjackXP);

        const woodType = getResourceForLevel(lumberjackLevel, WOOD_TYPES);

        // Add to typed inventory
        if (!saveState.woodInventory) saveState.woodInventory = {};
        saveState.woodInventory[woodType.id] = (saveState.woodInventory[woodType.id] || 0) + 1;

        // Award XP
        addSkillXP('lumberjack', woodType.xp);

        saveGame();
        if (typeof notifyResourceGathered === 'function') notifyResourceGathered('chop', 1);
        showToast(`Chopped Tree! (+1 ${woodType.name}, +${woodType.xp} XP)`);

        // Broadcast to others
        const msg = { type: 'chop_tree', index: index };

        // Host Broadcast
        if (isHost) {
            broadcastToClients(msg);
        }
        // Client Send to Host
        else if (hostConn && hostConn.open) {
            hostConn.send(msg);
        }
    }
}

function performMine() {
    // Animate Pickaxe
    const pick = player.getObjectByName("pickaxe");
    if (pick) {
        const startRot = pick.userData.is3D?0:-Math.PI / 2;
        pick.rotation.y = startRot - 0.5;
        setTimeout(() => { if (pick) pick.rotation.y = startRot; }, 100);
    }

    // Raycast from player in facing direction (not camera)
    const raycaster = new THREE.Raycaster();
    const playerPos = player.position.clone();
    playerPos.y += 1; // Raycast from player chest height
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(player.quaternion);
    raycaster.set(playerPos, dir);
    const intersects = raycaster.intersectObjects(treeMeshes, true); // contains trees and rocks

    if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.distance < 6) { // Closer range since it's from player
            let target = hit.object;
            // Rock mesh might be the hit object itself, but let's traverse up just in case
            while (target && !treeMeshes.includes(target)) {
                target = target.parent;
            }
            const idx = treeMeshes.indexOf(target);
            if (idx !== -1) mineRock(idx);
        }
    }
}

function mineRock(index, fromNetwork = false) {
    if (index < 0 || index >= treeMeshes.length) return;
    const mesh = treeMeshes[index];
    if (!mesh || !mesh.userData.isRock || mesh.visible === false) return;

    // Initialize Health (Harder than trees)
    if (typeof mesh.userData.health === 'undefined') {
        const size = (mesh.scale.x || 1);
        mesh.userData.maxHealth = Math.floor(size * 6); // Tougher
        if (mesh.userData.maxHealth < 3) mesh.userData.maxHealth = 3;
        mesh.userData.health = mesh.userData.maxHealth;
    }

    // Decrement Health
    mesh.userData.health--;

    // Play Sound
    Sound.playSpatial('punch'); // Reuse punch for now

    // VISUAL FEEDBACK (Shake)
    if (mesh.userData.health > 0) {
        const origX = mesh.position.x;
        mesh.position.x += (Math.random() - 0.5) * 0.1; // Stiffer shake
        setTimeout(() => mesh.position.x = origX, 50);
        return;
    }

    // --- CRUMBLE! Shrink rock instead of hiding ---
    mesh.userData.originalScale = mesh.scale.clone(); // Store original scale
    mesh.scale.set(0.3, 0.3, 0.3); // Shrink to 30% size
    mesh.userData.isMined = true;

    // Respawn after 3 minutes
    setTimeout(() => {
        respawnRock(index);
    }, 180000);

    // Grant Ore
    if (!fromNetwork) {
        // Get mining level and determine ore type
        if (!saveState.skills) saveState.skills = { mining: { xp: 0 }, lumberjack: { xp: 0 }, fishing: { xp: 0 } };
        const miningXP = saveState.skills.mining?.xp || 0;
        const miningLevel = getLevelFromXP(miningXP);

        const oreType = getResourceForLevel(miningLevel, ORE_TYPES);

        // Add to typed inventory
        if (!saveState.oreInventory) saveState.oreInventory = {};
        saveState.oreInventory[oreType.id] = (saveState.oreInventory[oreType.id] || 0) + 1;

        // Award XP
        addSkillXP('mining', oreType.xp);

        saveGame();
        if (typeof notifyResourceGathered === 'function') notifyResourceGathered('mine', 1);
        showToast(`Mined Rock! (+1 ${oreType.name}, +${oreType.xp} XP)`);

        // Reset Health
        mesh.userData.health = mesh.userData.maxHealth;

        // Broadcast (reuse chop_tree type since it works by index + treeMeshes array)
        // Actually, chop_tree logic in network listener calls chopTree().
        // I should stick to chop_tree msg but handle index correctly on receiver?
        // Wait, if I send 'chop_tree' index 50, receiver calls chopTree(50).
        // chopTree(50) checks if it's a STUMP.
        // But Rock doesn't have stump logic. It checks `isStump`.
        // I need to update chopTree/mineRock checks or add a new msg type.
        // For now, I'll send 'mine_rock' message.

        const msg = { type: 'mine_rock', index: index };
        if (isHost) {
            broadcastToClients(msg);
        } else if (hostConn && hostConn.open) {
            hostConn.send(msg);
        }
    }
}

function respawnRock(index) {
    if (index < 0 || index >= treeMeshes.length) return;
    const mesh = treeMeshes[index];
    if (mesh && mesh.userData.isRock) {
        // Restore original scale
        if (mesh.userData.originalScale) {
            mesh.scale.copy(mesh.userData.originalScale);
        } else {
            mesh.scale.set(1, 1, 1);
        }
        mesh.userData.health = mesh.userData.maxHealth;
        mesh.userData.isMined = false;
    }
}

// Ensure init calls setupHotbar
// (Hooked into end of file block)


function mulberry32(a) { return function () { var t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }
function xmur3(str) { for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 3432918353), h = h << 13 | h >>> 19; return function () { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; } }


// Brings an older save up to SAVE_VERSION. Each branch is additive: it never
// discards player data, only fills in or repairs fields newer code expects.
// The old version is passed in because older saves have no saveVersion at all.
function migrateSave(fromVersion) {
    const from = Number(fromVersion) || 1;
    if (from >= SAVE_VERSION) return;

    if (from < 2) {
        // v1 -> v2: progression systems arrived. Give the player a clean slate
        // rather than fabricating achievements they may not deserve; the next
        // checkAchievements() pass will award anything already earned.
        ensureProgression();
    }

    saveState.saveVersion = SAVE_VERSION;
}

function loadSave() {
    const s = localStorage.getItem('islandFisherSave');
    if (s) {
        try {
            const d = JSON.parse(s);
            window.Emotes?.restoreSave(d);
            window.Halloween?.restore(d);

            // Initialize default unlocked tools checks immediately
            if (!saveState.unlockedTools) saveState.unlockedTools = ['hands', 'rod'];

            // --- FIX: LOAD UNLOCKED TOOLS FROM SAVE ---
            if (d.unlockedTools) {
                saveState.unlockedTools = d.unlockedTools;
            }

            // Load hotbar layout (persisted between sessions)
            if (Array.isArray(d.hotbar) && d.hotbar.length === 10) {
                saveState.hotbar = d.hotbar;
            }
            if (typeof d.activeHotbarIndex === 'number') saveState.activeHotbarIndex = d.activeHotbarIndex;

            // Load grid inventory
            if (Array.isArray(d.invSlots) && d.invSlots.length === 50) {
                saveState.invSlots = d.invSlots;
            }

            // Sync Legacy Flags (Fix for Hotbar not showing unlocked items)
            if (d.hasGuitar) { saveState.hasGuitar = true; if (!saveState.unlockedTools.includes('guitar')) saveState.unlockedTools.push('guitar'); }
            if (d.hasGlove) { saveState.hasGlove = true; if (!saveState.unlockedTools.includes('glove')) saveState.unlockedTools.push('glove'); }
            // The Rowboat is bought once and stored as a flag. Pre-fix saves only
            // recorded it in unlockedTools, so derive the flag from there too.

            if(Array.isArray(d.unlockedBoats))saveState.unlockedBoats=[...new Set(d.unlockedBoats.filter(id=>['skiff','runabout','launch','pontoon','ferry'].includes(id)))];
            if (d.hasBoat) saveState.hasBoat = true;
            else if (Array.isArray(saveState.unlockedTools) && saveState.unlockedTools.includes('boat')) saveState.hasBoat = true;

            // Repair old saves: the Glove used to be unlocked by default, which
            // made the shop show it as "Owned" (and the equip silently fail) for
            // players who never bought it. Keep it unlocked only when the save
            // actually records the purchase.
            if (saveState.hasGlove !== true && Array.isArray(saveState.unlockedTools)) {
                saveState.unlockedTools = saveState.unlockedTools.filter(t => t !== 'glove');
            }

            // Basic stats
            if (d.money !== undefined) { const n = Number(d.money); saveState.money = Number.isFinite(n) ? n : 0; }
            saveState.tournamentAwards=Array.isArray(d.tournamentAwards)?[...new Set(d.tournamentAwards.filter(id=>typeof id==='string'&&id.length<=200))].slice(-100):[];
            saveState.explorationReceipts=Array.isArray(d.explorationReceipts)?[...new Set(d.explorationReceipts.filter(id=>typeof id==='string'&&id.length<=200))].slice(-500):[];
            saveState.explorationStats={finds:Math.min(1e9,Math.max(0,Math.floor(Number(d.explorationStats?.finds)||0))),money:Math.min(1e9,Math.max(0,Math.floor(Number(d.explorationStats?.money)||0)))};
            if (d.scratchStats && typeof d.scratchStats === 'object') {
                const ss = d.scratchStats;
                saveState.scratchStats = {
                    played: Math.max(0, Number(ss.played) || 0),
                    won: Math.max(0, Number(ss.won) || 0),
                    biggest: Math.max(0, Number(ss.biggest) || 0)
                };
            }
            if (d.inventory) {
                // Repair on load: entries must be objects with primitive fields.
                // A hostile or hand-edited save must not be able to carry nulls
                // or HTML strings into the UI (the Merchant renders via innerHTML).
                saveState.inventory = Array.isArray(d.inventory)
                    ? d.inventory.map(sanitizeFish).filter(Boolean).slice(0, 2000)
                    : [];
            }
            if (d.displayName) saveState.displayName = d.displayName;
            if (d.journal) saveState.journal = d.journal;
            if (d.personalBests && typeof d.personalBests === 'object') saveState.personalBests = d.personalBests;

            // Visuals
            if (d.unlockedHats) saveState.unlockedHats = d.unlockedHats;
            if (d.currentHat) saveState.currentHat = d.currentHat;
            if (d.catColor) saveState.catColor = d.catColor;
            if (d.bellyColor) saveState.bellyColor = d.bellyColor;
            if (d.eyeColor) saveState.eyeColor = d.eyeColor;
            if (d.species) saveState.species = d.species;

            // New modular parts
            if (d.currentEars) saveState.currentEars = d.currentEars;
            if (d.currentEyes) saveState.currentEyes = d.currentEyes;
            if (d.currentNose) saveState.currentNose = d.currentNose;
            if (d.currentMisc) saveState.currentMisc = d.currentMisc;
            saveState.protogenLogo=globalThis.window?.ProtogenLogo?.normalize(d.protogenLogo)||'';
            if (d.currentTail) saveState.currentTail = d.currentTail;

            // Part-specific colors
            if (d.earsColor !== undefined) saveState.earsColor = d.earsColor;
            if (d.noseColor !== undefined) saveState.noseColor = d.noseColor;
            if (d.miscColor !== undefined) saveState.miscColor = d.miscColor;
            if (d.tailColor !== undefined) saveState.tailColor = d.tailColor;
            saveState.handColor = d.handColor || '';
            saveState.footColor = d.footColor || '';
            saveState.tailAccentColor = d.tailAccentColor || '';

            // Hair
            if (d.unlockedHair) saveState.unlockedHair = d.unlockedHair;
            if (d.currentHair) saveState.currentHair = d.currentHair;
            if (d.hairColor !== undefined) saveState.hairColor = d.hairColor;

            // Bobbers
            if (d.unlockedBobbers) saveState.unlockedBobbers = d.unlockedBobbers;
            if (d.currentBobber) saveState.currentBobber = d.currentBobber;

            // Migration: Convert old species to new parts system
            if (d.species && !d.currentEars) {
                const speciesMapping = {
                    cat: { ears: 'cat', eyes: 'standard', nose: 'cat', misc: 'none', tail: 'cat' },
                    bunny: { ears: 'bunny', eyes: 'standard', nose: 'cat', misc: 'none', tail: 'bunny' },
                    dog: { ears: 'dog', eyes: 'standard', nose: 'dog', misc: 'none', tail: 'dog' },
                    bear: { ears: 'bear', eyes: 'standard', nose: 'bear', misc: 'none', tail: 'bear' },
                    fox: { ears: 'fox', eyes: 'standard', nose: 'dog', misc: 'fox_cheeks', tail: 'fox' },
                    pig: { ears: 'pig', eyes: 'standard', nose: 'pig', misc: 'none', tail: 'pig' },
                    dragon: { ears: 'dragon', eyes: 'dragon', nose: 'dragon', misc: 'dragon_wings', tail: 'dragon' },
                    mouse: { ears: 'mouse', eyes: 'standard', nose: 'mouse', misc: 'none', tail: 'mouse' },
                    duck: { ears: 'none', eyes: 'standard', nose: 'duck', misc: 'none', tail: 'duck' },
                    axolotl: { ears: 'none', eyes: 'standard', nose: 'axolotl', misc: 'axolotl_gills', tail: 'axolotl' },
                    raccoon: { ears: 'raccoon', eyes: 'standard', nose: 'dog', misc: 'raccoon_mask', tail: 'raccoon' },
                    koala: { ears: 'koala', eyes: 'standard', nose: 'koala', misc: 'none', tail: 'none' },
                    lion: { ears: 'cat', eyes: 'standard', nose: 'cat', misc: 'lion_mane', tail: 'lion' },
                    cow: { ears: 'cow', eyes: 'standard', nose: 'cow', misc: 'none', tail: 'cat' },
                    frog: { ears: 'none', eyes: 'frog', nose: 'frog', misc: 'none', tail: 'frog' },
                    monkey: { ears: 'monkey', eyes: 'standard', nose: 'monkey', misc: 'none', tail: 'monkey' },
                    penguin: { ears: 'none', eyes: 'standard', nose: 'penguin', misc: 'penguin_belly', tail: 'penguin' },
                };
                const parts = speciesMapping[d.species] || speciesMapping.cat;
                saveState.currentEars = parts.ears;
                saveState.currentEyes = parts.eyes;
                saveState.currentNose = parts.nose;
                saveState.currentMisc = parts.misc;
                saveState.currentTail = parts.tail;
            }

            // Items
            if (d.baitInventory) saveState.baitInventory = d.baitInventory;
            if (d.hasGlove !== undefined) saveState.hasGlove = d.hasGlove;
            if (d.hasGuitar !== undefined) saveState.hasGuitar = d.hasGuitar;
            saveState.unlockedProps=normalizePropUnlocks(d.unlockedProps);
            if(Array.isArray(d.unlockedBoats))saveState.unlockedBoats=[...new Set(d.unlockedBoats.filter(id=>['skiff','runabout','launch','pontoon','ferry'].includes(id)))];
            if (d.hasBoat !== undefined) saveState.hasBoat = !!d.hasBoat;
            if (d.autoReelLevel !== undefined) saveState.autoReelLevel = d.autoReelLevel;
            if (d.clickPowerLevel !== undefined) saveState.clickPowerLevel = d.clickPowerLevel;

            // New Cosmetics (Rods, Shirts, Collars)
            if (d.unlockedRods) saveState.unlockedRods = d.unlockedRods;
            if (d.currentRod) saveState.currentRod = d.currentRod;
            if (d.unlockedShirts) saveState.unlockedShirts = d.unlockedShirts;
            if (d.currentShirt) saveState.currentShirt = d.currentShirt;
            restorePants(d);
            if (d.unlockedCollars) saveState.unlockedCollars = d.unlockedCollars;
            if (d.currentCollar) saveState.currentCollar = d.currentCollar;

            saveState.bodyPaint = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaint) : '');
            saveState.bodyPaintBack = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaintBack) : '');
            saveState.bodyPaintLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaintLeft) : '');
            saveState.bodyPaintRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaintRight) : '');
            saveState.bodyPaintHeadFront = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaintHeadFront) : '');
            saveState.bodyPaintHeadBack = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaintHeadBack) : '');
            saveState.bodyPaintHeadLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaintHeadLeft) : '');
            saveState.bodyPaintHeadRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaintHeadRight) : '');
            saveState.bodyPaintHeadTop = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaintHeadTop) : '');
            saveState.bodyPaintHeadBottom = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaintHeadBottom) : '');
            saveState.bodyPaintArmLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaintArmLeft) : '');
            saveState.bodyPaintArmRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaintArmRight) : '');
            saveState.bodyPaintLegLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaintLegLeft) : '');
            saveState.bodyPaintLegRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(d.bodyPaintLegRight) : '');
            saveState.bodyPaintColor = (typeof normalizeBodyPaintColor === 'function' ? normalizeBodyPaintColor(d.bodyPaintColor) : '#ffffff');
            delete saveState.unlockedPatterns;
            delete saveState.currentPattern;

            // Titles
            if (d.unlockedTitles) saveState.unlockedTitles = d.unlockedTitles;
            if (d.currentTitle) saveState.currentTitle = d.currentTitle;
            if (d.showTitles !== undefined) saveState.showTitles = d.showTitles;
            // Model style (2D billboard vs 3D box)
            const savedModelPreference=d.preferredModel3D??d.model3D??d.npcModel3D??true;
            saveState.preferredModel3D=!!savedModelPreference;
            saveState.model3D=(typeof TWO_D_MODE_AVAILABLE!=='undefined'&&!TWO_D_MODE_AVAILABLE)?true:!!savedModelPreference;
            if(window.Housing)saveState.house=Housing.restoreSave(d.house);
            else if(d.house && typeof d.house==='object')saveState.house=d.house;
            if (d.showFPS !== undefined) saveState.showFPS = !!d.showFPS;
            // Restore the original quality once; preserve subsequent resolution choices.
            saveState.renderScale=d.characterQualityRevision===1&&[0,.75,1].includes(d.renderScale)?d.renderScale:0;
            saveState.characterQualityRevision=1;
            // New installs default to the retro look. Existing saves get it
            // once as well; after this revision is saved, an explicit OFF
            // choice is respected on later loads.
            if (d.retroShader !== undefined && Number(d.retroShaderDefaultRevision) >= 1) {
                saveState.retroShader = !!d.retroShader;
            } else {
                saveState.retroShader = true;
            }
            saveState.retroShaderDefaultRevision = 1;
            const savedRetroPixelSize = Number(d.retroPixelSize);
            if (RETRO_PIXEL_SIZES.includes(savedRetroPixelSize)) saveState.retroPixelSize = savedRetroPixelSize;

            // Audio
            if (d.micId) saveState.micId = d.micId;
            if (d.masterVolume !== undefined) saveState.masterVolume = d.masterVolume;
            if (d.sfxVolume !== undefined) saveState.sfxVolume = d.sfxVolume;
            if (d.midiVolume !== undefined) saveState.midiVolume = d.midiVolume;
            if (d.voiceVolume !== undefined) saveState.voiceVolume = d.voiceVolume;
            if (d.musicMuted !== undefined) saveState.musicMuted = d.musicMuted;
            if (d.midiMuted !== undefined) saveState.midiMuted = d.midiMuted;

            if (d.lavaUnlocked !== undefined) saveState.lavaUnlocked = d.lavaUnlocked;

            // Skills (Mining, Lumberjack, Fishing)
            if (d.skills) saveState.skills = d.skills;
            if (d.oreInventory) saveState.oreInventory = d.oreInventory;
            if (d.woodInventory) saveState.woodInventory = d.woodInventory;

            // --- WARDROBE FIX HERE ---
            // This tells the game to remember your outfits when you reload!
            saveState.savedOutfits = Array.isArray(d.savedOutfits) ? d.savedOutfits.filter(o => o && typeof o === 'object').map(o => {
                const clean = { ...o };
                delete clean.pattern;
                clean.bodyPaint = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaint) : '');
                clean.bodyPaintBack = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaintBack) : '');
                clean.bodyPaintLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaintLeft) : '');
                clean.bodyPaintRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaintRight) : '');
                clean.bodyPaintHeadFront = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaintHeadFront) : '');
                clean.bodyPaintHeadBack = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaintHeadBack) : '');
                clean.bodyPaintHeadLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaintHeadLeft) : '');
                clean.bodyPaintHeadRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaintHeadRight) : '');
                clean.bodyPaintHeadTop = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaintHeadTop) : '');
                clean.bodyPaintHeadBottom = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaintHeadBottom) : '');
                clean.bodyPaintArmLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaintArmLeft) : '');
                clean.bodyPaintArmRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaintArmRight) : '');
                clean.bodyPaintLegLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaintLegLeft) : '');
                clean.bodyPaintLegRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(o.bodyPaintLegRight) : '');
                clean.bodyPaintColor = (typeof normalizeBodyPaintColor === 'function' ? normalizeBodyPaintColor(o.bodyPaintColor) : '#ffffff');
                return clean;
            }).slice(0, 10) : [];

            // Keybinds
            if (d.keybinds) {
                saveState.keybinds = { ...DEFAULT_KEYBINDS, ...d.keybinds };
            }

            // Progression (achievements / bounties / quests)
            if (d.achievements && typeof d.achievements === 'object') saveState.achievements = d.achievements;
            if (d.bounties && typeof d.bounties === 'object') saveState.bounties = d.bounties;
            if (d.quests && typeof d.quests === 'object') saveState.quests = d.quests;
            if (typeof d.saveVersion === 'number') saveState.saveVersion = d.saveVersion;
            if (typeof d.propsPlaced === 'number') saveState.propsPlaced = d.propsPlaced;
            if (typeof d.cookedFishCount === 'number' && Number.isFinite(d.cookedFishCount)) {
                saveState.cookedFishCount = Math.max(0, Math.floor(d.cookedFishCount));
            }
            if (typeof d.tutorialDone === 'boolean') saveState.tutorialDone = d.tutorialDone;
            if (d.tutorialProgress) saveState.tutorialProgress = window.GuidedTutorialRules?.normalize(d.tutorialProgress) || null;

            migrateSave(d.saveVersion);
        } catch (e) { console.error("Save Load Error", e); }
    }
    // Even with no stored save we still want progression containers present.
    if (typeof ensureProgression === 'function') ensureProgression();
    // Backfill any skills added since the save was written (cooking/trading/sailing).
    if (typeof ensureSkills === 'function') ensureSkills();

    // Sync visual elements
    if (masterGain) masterGain.gain.value = saveState.masterVolume;
    if (sfxGain) sfxGain.gain.value = saveState.sfxVolume;
    if (midiGain) midiGain.gain.value = saveState.midiVolume;

    const usernameInput = document.getElementById('username-input');
    const furPicker = document.getElementById('fur-color-picker');
    const bellyPicker = document.getElementById('belly-color-picker');
    const eyePicker = document.getElementById('eye-color-picker');

    if (usernameInput) usernameInput.value = saveState.displayName;

    // Remembered lobby settings, shown on the Make Lobby screen.
    const lobbyNameInput = document.getElementById('lobby-name-input');
    if (lobbyNameInput) lobbyNameInput.value = saveState.lobbyName || '';
    const lobbyPublicBox = document.getElementById('lobby-public-input');
    if (lobbyPublicBox) lobbyPublicBox.checked = saveState.lobbyPublic !== false;
    const lobbyAdultBox = document.getElementById('lobby-adult-input');
    if (lobbyAdultBox) lobbyAdultBox.checked = saveState.lobbyAdult === true;
    if (!Array.isArray(saveState.lobbyTags)) saveState.lobbyTags = [];
    if (furPicker) furPicker.value = saveState.catColor;
    if (bellyPicker) bellyPicker.value = saveState.bellyColor;
    if (eyePicker) eyePicker.value = saveState.eyeColor;

    // Populate part selectors (new modular system)
    populatePartSelectors();

    const volS = document.getElementById('volume-slider'); if (volS) volS.value = saveState.masterVolume;
    const sfxS = document.getElementById('sfx-slider'); if (sfxS) sfxS.value = saveState.sfxVolume;
    const midS = document.getElementById('midi-slider'); if (midS) midS.value = saveState.midiVolume;
    const vocS = document.getElementById('voice-slider'); if (vocS) vocS.value = saveState.voiceVolume;
    const scrS = document.getElementById('screen-slider');
    if (scrS) scrS.value = (typeof saveState.screenVolume === 'number') ? saveState.screenVolume : 1;

    myData.name = saveState.displayName;
    myData.color = saveState.catColor;
    myData.belly = saveState.bellyColor;
    myData.eye = saveState.eyeColor;
    myData.hat = saveState.currentHat;
    myData.shirt = saveState.currentShirt;
    myData.pants = saveState.currentPants;
    myData.collar = saveState.currentCollar;
    myData.rod = saveState.currentRod;
    myData.bodyPaint = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaint) : '');
    // Modular parts
    myData.ears = saveState.currentEars;
    myData.eyes = saveState.currentEyes;
    myData.nose = saveState.currentNose;
    myData.misc = saveState.currentMisc;
    myData.protogenLogo=globalThis.window?.ProtogenLogo?.normalize(saveState.protogenLogo)||'';
    myData.tail = saveState.currentTail;
    myData.hair = saveState.currentHair;
    myData.hairColor = saveState.hairColor || '';

    updateBaitSelector();
    updateUI();
    updateMusicUI();
    updateMidiUI();
}

function saveGame() {
    saveState.bodyPaint = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaint) : '');
    saveState.bodyPaintBack = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintBack) : '');
    saveState.bodyPaintLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintLeft) : '');
    saveState.bodyPaintRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintRight) : '');
    saveState.bodyPaintHeadFront = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadFront) : '');
    saveState.bodyPaintHeadBack = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadBack) : '');
    saveState.bodyPaintHeadLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadLeft) : '');
    saveState.bodyPaintHeadRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadRight) : '');
    saveState.bodyPaintHeadTop = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadTop) : '');
    saveState.bodyPaintHeadBottom = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadBottom) : '');
    saveState.bodyPaintArmLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintArmLeft) : '');
    saveState.bodyPaintArmRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintArmRight) : '');
    saveState.bodyPaintLegLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintLegLeft) : '');
    saveState.bodyPaintLegRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintLegRight) : '');
    saveState.bodyPaintColor = (typeof normalizeBodyPaintColor === 'function' ? normalizeBodyPaintColor(saveState.bodyPaintColor) : '#ffffff');
    saveState.displayName = document.getElementById('username-input').value.substring(0, 12) || "Fisher";

    // Persist the server-browser settings typed on the start screen.
    const lobbyNameInput = document.getElementById('lobby-name-input');
    if (lobbyNameInput) saveState.lobbyName = lobbyNameInput.value.trim().slice(0, 24);
    const lobbyPublicBox = document.getElementById('lobby-public-input');
    if (lobbyPublicBox) saveState.lobbyPublic = lobbyPublicBox.checked;
    const lobbyAdultBox = document.getElementById('lobby-adult-input');
    if (lobbyAdultBox) saveState.lobbyAdult = lobbyAdultBox.checked;

    myData.name = saveState.displayName;
    myData.bodyPaint = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaint) : '');
    myData.bodyPaintBack = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintBack) : '');
    myData.bodyPaintLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintLeft) : '');
    myData.bodyPaintRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintRight) : '');
    myData.bodyPaintHeadFront = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadFront) : '');
    myData.bodyPaintHeadBack = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadBack) : '');
    myData.bodyPaintHeadLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadLeft) : '');
    myData.bodyPaintHeadRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadRight) : '');
    myData.bodyPaintHeadTop = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadTop) : '');
    myData.bodyPaintHeadBottom = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadBottom) : '');
    myData.bodyPaintArmLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintArmLeft) : '');
    myData.bodyPaintArmRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintArmRight) : '');
    myData.bodyPaintLegLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintLegLeft) : '');
    myData.bodyPaintLegRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintLegRight) : '');
    myData.bodyPaintColor = (typeof normalizeBodyPaintColor === 'function' ? normalizeBodyPaintColor(saveState.bodyPaintColor) : '#ffffff');
    // Update myData with parts
    myData.ears = saveState.currentEars;
    myData.eyes = saveState.currentEyes;
    myData.nose = saveState.currentNose;
    myData.misc = saveState.currentMisc;
    myData.protogenLogo=globalThis.window?.ProtogenLogo?.normalize(saveState.protogenLogo)||'';
    myData.tail = saveState.currentTail;
    myData.hair = saveState.currentHair;

    // Update myData with part colors
    myData.earsColor = saveState.earsColor || '';
    myData.noseColor = saveState.noseColor || '';
    myData.miscColor = saveState.miscColor || '';
    myData.tailColor = saveState.tailColor || '';
    myData.handColor = saveState.handColor || '';
    myData.footColor = saveState.footColor || '';
    myData.tailAccentColor = saveState.tailAccentColor || '';
    myData.hairColor = saveState.hairColor || '';

    // Update myData with base colors
    myData.color = saveState.catColor;
    myData.belly = saveState.bellyColor;
    myData.eye = saveState.eyeColor;

    updateUI();
    updateLocalVisuals();
    updateHotbarVisuals(); // FIX: Refresh hotbar after load

    let persisted=false;
    try {
        localStorage.setItem('islandFisherSave', JSON.stringify(saveState));
        persisted=true;
    } catch (e) {
        console.warn("Save failed", e);
    }

    // Progression: detect income for the "earn gold" bounty. saveGame() runs
    // after every sale, so watching the delta here covers all the sell paths
    // without touching each one.
    if (typeof progressionTrackMoney === 'function') progressionTrackMoney();
    return persisted;
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

    // 4. Fade out sky elements during rain (overcast effect)
    const targetSkyOpacity = isRainActive ? 0.1 : 1.0;

    if (sunMesh && sunMesh.material) {
        sunMesh.material.opacity += (targetSkyOpacity - sunMesh.material.opacity) * 0.05;
    }
    if (moonMesh && moonMesh.material) {
        moonMesh.material.opacity += (targetSkyOpacity - moonMesh.material.opacity) * 0.05;
    }
    if (window.starSystem && window.starSystem.material) {
        // Stars fade completely during rain
        const starTarget = isRainActive ? 0 : (worldTime < 5 || worldTime > 19 ? 1.0 : 0);
        window.starSystem.material.opacity += (starTarget - window.starSystem.material.opacity) * 0.05;
    }
    if (window.cloudSprites) {
        // Clouds become darker/grayer during rain
        const cloudTarget = isRainActive ? 0.3 : 0.7;
        window.cloudSprites.forEach(cloud => {
            cloud.material.opacity += (cloudTarget - cloud.material.opacity) * 0.05;
        });
    }

    // Note: Scene background color is handled exclusively by updateDayNightCycle().
}

// --- UI TOGGLE & UPDATE FUNCTIONS ---
window.toggleShowTitles = function () {
    saveState.showTitles = !saveState.showTitles;
    saveGame();
    updateTitleUI();
    refreshAllTitles();
}

function updateTitleUI() {
    const btn = document.getElementById('btn-titles-toggle');
    if (btn) {
        btn.innerText = saveState.showTitles ? "Titles: ON" : "Titles: OFF";
        btn.style.color = saveState.showTitles ? 'var(--p-good)' : 'var(--p-bad)';
    }
}

function refreshAllTitles() {
    // Only show titles if HUD is visible AND titles are enabled
    const shouldShow = hudVisible && saveState.showTitles;

    if (player) {
        const t = player.getObjectByName('titleSprite');
        if (t) t.visible = shouldShow;
        const n = player.getObjectByName('nameTag');
        if (n) n.visible = hudVisible;
    }

    Object.values(otherPlayers).forEach(p => {
        const t = p.mesh.getObjectByName('titleSprite');
        if (t) t.visible = shouldShow;
        const n = p.mesh.getObjectByName('nameTag');
        if (n) n.visible = hudVisible;
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

function isFishCatchable(fish, tierId) {
    // 1. Calculate Player CPS (Clicks Per Second)
    // We assume a decent manual click rate of ~10 CPS + AutoReel
    // Multiply manual CPS by Click Power Level
    const power = CLICK_POWER_RATES[saveState.clickPowerLevel] || 1;
    const manualCPS = 10 * power;
    const autoCPS = (AUTO_CLICK_RATES[saveState.autoReelLevel] || 0) * power;
    const totalCPS = manualCPS + autoCPS;

    // 2. Calculate Difficulty (Mirroring startMinigame logic)
    let clicks = 15;
    let time = 5.0;

    const r = fish.rarity;
    if (r === 'Common') { clicks = 15; time = 5.0; }
    else if (r === 'Uncommon') { clicks = 30; time = 4.5; }
    else if (r === 'Rare') { clicks = 55; time = 4.0; }
    else if (r === 'Epic') { clicks = 90; time = 3.5; }
    else if (r === 'Legendary') { clicks = 120; time = 3.0; }

    // Tier Modifiers (Reduced)
    if (tierId === 'glistening') { clicks += 5; }
    else if (tierId === 'shining') { clicks += 10; }
    else if (tierId === 'opalescent') { clicks += 20; }

    // Lava World Modifiers
    if (fish.isLava) {
        clicks *= 2.0;
        time *= 0.7;

        const b = activeBaitId;
        if (b === 'magic' || b === 'shrimp' || b === 'jig') {
            clicks *= 0.6;
            time *= 1.2;
        } else if (b === 'grub' || b === 'spinner') {
            clicks *= 0.8;
        }

        const rod = saveState.currentRod;
        if (rod === 'lava' || rod === 'admin' || rod === 'golden' || rod === 'diamond' || rod === 'omega_milestone') {
            clicks *= 0.85;
            time *= 1.1;
        }
    }

    // Bait Time Bonus
    const bait = BAIT_TYPES.find(b => b.id === activeBaitId);
    const timeBonus = bait ? (bait.power * 0.3) : 0;
    const maxTime = Math.max(0.5, time + timeBonus);

    // 3. Check if possible
    // We add a small safety margin (0.5s) to account for reaction time / lag
    const effectiveTime = Math.max(0, maxTime - 0.5);
    const potentialClicks = totalCPS * effectiveTime;

    return potentialClicks >= clicks;
}

function selectFish() {
    let bait = BAIT_TYPES.find(b => b.id === activeBaitId);
    if (!bait) bait = BAIT_TYPES[0];

    // 1. Filter Pool based on Zone
    let basePool = [];
    let mixedZone = false;

    if (fishingZone === 'void') {
        // Void: 25% void fish, 75% lake fish
        if (Math.random() < 0.25) {
            basePool = VOID_FISH.map(f => ({ ...f, _zoneFish: true }));
        } else {
            basePool = getFishForZone('lake');
        }
    }
    else if (fishingZone === 'lava') {
        // Lava world: lake fish (real) + lava fish (rare)
        mixedZone = true;
        const lakeFish = getFishForZone('lake');
        const lavaFish = LAVA_FISH.map(f => ({ ...f, _zoneFish: true }));
        basePool = [...lakeFish, ...lavaFish];
    }
    else if (fishingZone === 'secret') {
        if (Math.random() < 0.40) {
            basePool = FISH_TYPES.filter(f => f.condition === 'secret');
        } else {
            basePool = FISH_TYPES.filter(f => f.condition !== 'void' && f.condition !== 'rain' && f.condition !== 'secret' && f.name !== "Old Boot");
        }
    }
    else if (isRaining && Math.random() < 0.40) {
        // Rain: chance for rain fish (mixed with lake fish)
        if (Math.random() < 0.30) {
            basePool = RAIN_FISH.map(f => ({ ...f, _zoneFish: true }));
        } else {
            basePool = getFishForZone('lake');
        }
    }
    else {
        // --- ZONE-SPECIFIC FISH POOLS ---
        let zoneCategory = 'lake';
        if (fishingZoneCategory) zoneCategory = fishingZoneCategory;
        else if (fishingZone === 'ocean') zoneCategory = 'ocean';
        else if (fishingZone === 'pond') {
            const distToDarkPond = Math.sqrt(Math.pow(player.position.x - 60, 2) + Math.pow(player.position.z - 50, 2));
            zoneCategory = distToDarkPond < 30 ? 'darkpond' : 'lightpond';
        }
        else if (fishingZone === 'lake') zoneCategory = 'lake';

        if (zoneCategory === 'ocean') {
            basePool = getFishForZone('ocean');
        } else if (zoneCategory === 'lake') {
            basePool = getFishForZone('lake');
        } else {
            // Light/Dark pond: mostly lake fish, zone fish rare
            mixedZone = true;
            const lakeFish = getFishForZone('lake');
            const zoneFish = getFishForZone(zoneCategory)
                .filter(f => f.zone === zoneCategory)
                .map(f => ({ ...f, _zoneFish: true }));
            basePool = [...lakeFish, ...zoneFish];
        }
    }

    // Safety check
    if (basePool.length === 0) basePool = FISH_TYPES.filter(f => !f.condition);

    // 2. BAIT FILTERING & WEIGHTED RANDOM
    let pool = [];
    basePool.forEach(fish => {
        let chance = fish.chance; // Base chance (Common~30 ... Legendary~1)

        // --- NEW: WEIGHTED LOGIC (Relaxes Hard Locks) ---
        // Instead of returning (removing fish), we punish weights for weak bait.

        // 1. Weak Bait Penalty (Massive reduction but non-zero)
        // Checks if bait is "under-leveled" for this rarity
        let underpowered = false;
        if (fish.rarity === 'Rare' && bait.power < 2) underpowered = true;
        else if (fish.rarity === 'Epic' && bait.power < 4) underpowered = true;
        else if (fish.rarity === 'Legendary' && bait.power < 8) underpowered = true;

        if (underpowered) {
            chance *= 0.02; // 2% of normal chance. VERY hard but possible.
        }

        // 2. Standard Bait Multiplier (If matched or better)
        else {
            // Apply the bait's multiplier (1.0 to 10.0) based on loop below
            // Note: We use the bait's defined rarityMult directly now.
            if (fish.rarity === 'Rare') chance *= (bait.rarityMult * 0.8);
            if (fish.rarity === 'Epic') chance *= (bait.rarityMult * 1.0);
            if (fish.rarity === 'Legendary') chance *= (bait.rarityMult * 1.2);
        }

        // 3. Filter Low Tier Junk if using GODLY bait
        // (Quality of Life: Don't catch boots with Magic Lure)
        if (fish.rarity === 'Common' && bait.power >= 10) {
            chance *= 0.1; // Reduce common junk chance significantly
        }

        // Low percent for zone-specific fish in mixed zones
        if (mixedZone && fish._zoneFish) {
            chance *= 0.33;
        }

        // Time-of-day preference
        if (typeof TIME_PREFS !== 'undefined' && TIME_PREFS[fish.name]) {
            const isNight = (typeof worldTime === 'number') ? (worldTime < 6 || worldTime >= 18) : false;
            const wantsNight = TIME_PREFS[fish.name] === 'night';
            if (wantsNight !== isNight) chance *= 0.25;
            else chance *= 1.25;
        }
        // Rain lovers
        if (typeof isRaining !== 'undefined' && isRaining && typeof RAIN_LOVERS !== 'undefined' && RAIN_LOVERS.has(fish.name)) {
            chance *= 1.5;
        }

        pool.push({ ...fish, chance: chance });
    });

    // --- CATCHABILITY FILTER ---
    // (Consolidated logic)
    // We still filter 'impossible' manual click fish to save frustration,
    // assuming a bare minimum CPS (click power).
    // ... Actually user wants "Everything Possible". 
    // Let's remove the isFishCatchable check OR make it very lenient.
    // The previous code block called isFishCatchable... let's keep it but trust the math.

    // ... (Keeping the rest of logic) ...
    // Wait, we need to match the replacement target.

    // --- 3. Pick Fish using Total Weights ---
    const totalChance = pool.reduce((acc, f) => acc + f.chance, 0);
    let random = Math.random() * totalChance;
    let selectedType = pool[0];
    for (let fish of pool) {
        if (random < fish.chance) { selectedType = fish; break; }
        random -= fish.chance;
    }

    // Co-op world boss: only near the marked ocean spot while active.
    if (window.worldBossActive && Date.now() < window.worldBossActive.expiresAt && fishingZone === 'ocean') {
        const bd = Math.hypot(player.position.x - window.worldBossActive.x, player.position.z - window.worldBossActive.z);
        if (bd < 35 && Math.random() < 0.25) selectedType = WORLD_BOSS_FISH;
    }

    // Universal golden variants remain available through every zone/weather branch.
    if(!selectedType.isBoss&&window.Halloween)selectedType=Halloween.roll(Math.random(),Math.random())||selectedType;
    selectedType = rollGoldenFish(Math.random()) || selectedType;

    // 4. Tier Logic (Shiny/Gold/Opalescent)
    const totalTierChance = TIERS.reduce((acc, t) => acc + t.chance, 0);
    let tierRandom = Math.random() * totalTierChance;

    if (bait.tierLuck > 1.0) {
        if (tierRandom < TIERS[0].chance && Math.random() < (bait.tierLuck - 1.0)) {
            tierRandom = Math.random() * totalTierChance;
        }
    }

    let selectedTier = TIERS[0];
    for (let tier of TIERS) {
        if (tierRandom < tier.chance) { selectedTier = tier; break; }
        tierRandom -= tier.chance;
    }

    // NOTE: Tier downgrade removed - let players experience tiered fish!

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
        drainRate: (selectedType.drain * selectedTier.drainMult) * 0.9,
        isLava: selectedType.isLava // Preserve this flag
    };
}

function updateJournal(fish, tierId) {
    if (!saveState.journal[fish.name]) saveState.journal[fish.name] = [];
    if (!saveState.journal[fish.name].includes(tierId)) saveState.journal[fish.name].push(tierId);
}

// Ensure this stays as the Journal toggle, separate from the Inventory toggle.
window.toggleJournal = function () {
    const ui = document.getElementById('journal-overlay');
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') { document.exitPointerLock(); renderJournal(); }
}

// --- PLAYER TRADING ---
let tradePartnerId = null;
let tradePendingFrom = null;
let tradePendingFromName = null;
let tradeMyOffer = null;
let tradeTheirOffer = null;
let tradeIAccepted = false;
let tradeTheyAccepted = false;

function relayTrade(msg) {
    if (typeof isHost !== 'undefined' && isHost) {
        broadcastToClients(msg);
    } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
        hostConn.send(msg);
    }
}

window.openTradeWith = function (pid) {
    if (!pid || pid === myPeerId) return;
    tradePartnerId = pid;
    tradeMyOffer = null;
    tradeTheirOffer = null;
    tradeIAccepted = false;
    tradeTheyAccepted = false;
    relayTrade({ type: 'tradeRequest', target: pid, fromId: myPeerId, fromName: saveState.displayName });
    const ui = document.getElementById('trade-overlay');
    if (ui) ui.style.display = 'flex';
    const lbl = document.getElementById('trade-partner-label');
    const other = otherPlayers[pid];
    if (lbl) lbl.innerText = 'Trading with ' + (other && other.lastData ? other.lastData.name : 'player');
    renderTradeUI();
};

window.tradeCancel = function () {
    if (tradePartnerId) relayTrade({ type: 'tradeCancel', target: tradePartnerId, fromId: myPeerId });
    tradePartnerId = null; tradeMyOffer = null; tradeTheirOffer = null;
    tradeIAccepted = false; tradeTheyAccepted = false;
    const ui = document.getElementById('trade-overlay');
    if (ui) ui.style.display = 'none';
};

window.tradeAccept = function () {
    if (!tradePartnerId) return;
    tradeIAccepted = true;
    relayTrade({ type: 'tradeAccept', target: tradePartnerId, fromId: myPeerId });
    renderTradeUI();
    checkTradeComplete();
};

function checkTradeComplete() {
    if (!tradeIAccepted || !tradeTheyAccepted) return;
    if (!tradeMyOffer || !tradeTheirOffer) return;
    ensureInventorySlots();
    const mine = saveState.invSlots.find(s => s && s.type === 'fish' && s.name === tradeMyOffer.name);
    if (mine) {
        if ((mine.count || 1) > 1) mine.count--;
        else { const i = saveState.invSlots.indexOf(mine); if (i !== -1) saveState.invSlots[i] = null; }
    }
    const theirs = saveState.invSlots.find(s => s && s.type === 'fish' && s.name === tradeTheirOffer.name);
    if (theirs) theirs.count = (theirs.count || 1) + 1;
    else {
        const empty = saveState.invSlots.findIndex(s => s === null);
        if (empty !== -1) saveState.invSlots[empty] = { type: 'fish', name: tradeTheirOffer.name, color: tradeTheirOffer.color, size: tradeTheirOffer.size || 1, count: 1 };
    }
    autoSortInventory();
    saveGame();
    showToast('Trade complete!', 'success');
    tradePartnerId = null; tradeMyOffer = null; tradeTheirOffer = null;
    tradeIAccepted = false; tradeTheyAccepted = false;
    const ui = document.getElementById('trade-overlay');
    if (ui) ui.style.display = 'none';
}

function renderTradeUI() {
    const myOfferEl = document.getElementById('trade-my-offer');
    const theirOfferEl = document.getElementById('trade-their-offer');
    const invEl = document.getElementById('trade-my-inv');
    if (myOfferEl) myOfferEl.innerText = tradeMyOffer ? tradeMyOffer.name : 'Click a fish below';
    if (theirOfferEl) theirOfferEl.innerText = tradeTheirOffer ? tradeTheirOffer.name : 'Waiting…';
    if (!invEl) return;
    invEl.innerHTML = '';
    ensureInventorySlots();
    saveState.invSlots.forEach((s, i) => {
        if (!s || s.type !== 'fish') return;
        const slot = document.createElement('div');
        slot.style.cssText = 'width:48px;height:48px;display:flex;align-items:center;justify-content:center;position:relative;cursor:pointer;border:1px solid var(--p-line);';
        try {
            const tex = createFishTexture(s.name, s.color);
            const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40;
            cv.getContext('2d').drawImage(tex.image, 0, 0, 40, 40);
            slot.appendChild(cv);
        } catch (e) { slot.innerText = '🐟'; }
        slot.onclick = () => {
            tradeMyOffer = { name: s.name, color: s.color, size: s.size || 1 };
            relayTrade({ type: 'tradeOffer', target: tradePartnerId, fromId: myPeerId, offer: tradeMyOffer });
            tradeIAccepted = false;
            renderTradeUI();
        };
        invEl.appendChild(slot);
    });
}

function handleTradeMessage(data) {
    if (!data || !data.target) return;
    if (data.target !== myPeerId) return;
    if (data.type === 'tradeRequest') {
        tradePendingFrom = data.fromId;
        tradePendingFromName = data.fromName || 'player';
        const req = document.getElementById('trade-request');
        const txt = document.getElementById('trade-request-text');
        if (txt) txt.innerText = (tradePendingFromName + ' wants to trade!');
        if (req) req.style.display = 'block';
    } else if (data.type === 'tradeOffer') {
        tradeTheirOffer = data.offer;
        renderTradeUI();
    } else if (data.type === 'tradeAccept') {
        tradeTheyAccepted = true;
        renderTradeUI();
        checkTradeComplete();
    } else if (data.type === 'tradeCancel') {
        const req = document.getElementById('trade-request');
        if (req) req.style.display = 'none';
        tradeCancel();
    }
}

window.acceptTradeRequest = function () {
    if (!tradePendingFrom) return;
    tradePartnerId = tradePendingFrom;
    tradeMyOffer = null;
    tradeIAccepted = false; tradeTheyAccepted = false;
    tradePendingFrom = null;
    const req = document.getElementById('trade-request');
    if (req) req.style.display = 'none';
    const ui = document.getElementById('trade-overlay');
    if (ui) ui.style.display = 'flex';
    const lbl = document.getElementById('trade-partner-label');
    if (lbl) lbl.innerText = 'Trading with ' + (tradePendingFromName || 'player');
    renderTradeUI();
};

window.declineTradeRequest = function () {
    const req = document.getElementById('trade-request');
    if (req) req.style.display = 'none';
    if (tradePendingFrom) relayTrade({ type: 'tradeCancel', target: tradePendingFrom, fromId: myPeerId });
    tradePendingFrom = null;
    tradePendingFromName = null;
};

window.toggleInventory = function () {
    const ui = document.getElementById('inventory-overlay');
    if (!ui) return;
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') { document.exitPointerLock(); renderInventoryGrid(); }
}

function setupPanelTabBar() {
    const bar = document.getElementById('panel-tabbar');
    if (!bar) return;
    const icons = { journal:'journal', inventory:'inventory', progress:'progress', skills:'skills', cooking:'cook', playerlist:'players' };
    bar.querySelectorAll('button').forEach(btn => {
        const onclick = btn.getAttribute('onclick') || '';
        const m = onclick.match(/switchPanel\('(\w+)'\)/);
        if (m && icons[m[1]] && window.PX && PX.has(icons[m[1]])) {
            const label = btn.textContent.trim();
            btn.innerHTML = PX.icon(icons[m[1]], 16) + ' ' + label;
        }
    });
}
window.toggleTabMenu = function () {
    const ui = document.getElementById('tab-menu-overlay');
    if (!ui) return;
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') document.exitPointerLock();
}

const PANEL_OVERLAY_IDS = {
    journal: 'journal-overlay',
    inventory: 'inventory-overlay',
    progress: 'progress-overlay',
    skills: 'skills-ui',
    cooking: 'cooking-ui',
    playerlist: 'player-list-overlay',
    tournament: 'tournament-overlay'
};

function closeAllPanels() {
    for (const k in PANEL_OVERLAY_IDS) {
        const el = document.getElementById(PANEL_OVERLAY_IDS[k]);
        if (el) el.style.display = 'none';
    }
    const bar = document.getElementById('panel-tabbar');
    if (bar) bar.style.display = 'none';
}

// Escape closes the top-most open menu. Overlay screens share a stacking
// context, so the last visible one in DOM order is the one drawn on top.
function closeTopOverlay() {
    const hiddenMenus = [
        ['halloween-overlay', () => window.Halloween?.close?.()],
        ['emote-overlay', () => window.Emotes?.close?.()],
        ['boat-dock-menu', () => window.Boats?.close?.()]
    ];
    for (const [id, close] of hiddenMenus) {
        const el = document.getElementById(id);
        if (el && !el.hidden && getComputedStyle(el).display !== 'none') {
            if (typeof close === 'function') close();
            return true;
        }
    }

    const dialogs = [...document.querySelectorAll('dialog[open]')];
    const dialog = dialogs[dialogs.length - 1];
    if (dialog) {
        if (dialog.id === 'character-studio') {
            window.CharacterStudio?.close?.();
            return true;
        }
        // The protogen editor handles Escape through its native cancel event.
        if (dialog.id === 'protogen-logo-editor') return false;
        try { dialog.close(); } catch (e) { }
        return true;
    }

    const openOverlays = [...document.querySelectorAll('.overlay-screen')].filter(el => {
        if (el.hidden) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
    if (!openOverlays.length) return false;

    const top = openOverlays[openOverlays.length - 1];
    const closers = {
        'scratch-overlay': () => window.toggleScratchShop?.(),
        'options-overlay': () => window.toggleOptions?.(),
        'host-overlay': () => window.toggleHostPanel?.(),
        'player-list-overlay': () => window.togglePlayerList?.(),
        'screen-queue-overlay': () => window.closeScreenQueue?.(),
        'trade-overlay': () => window.tradeCancel?.()
    };
    if (closers[top.id]) {
        closers[top.id]();
        return true;
    }
    const closeButton = top.querySelector('.close-x-btn, [data-menu-close], .scratch-close');
    if (closeButton) {
        closeButton.click();
        return true;
    }
    top.style.display = 'none';
    return true;
}

function switchPanel(name) {
    const id = PANEL_OVERLAY_IDS[name];
    if (!id) return;
    closeAllPanels();
    const el = document.getElementById(id);
    if (el) {
        el.style.display = 'flex';
        // trigger render if needed
        if (name === 'journal' && typeof renderJournal === 'function') renderJournal();
        if (name === 'inventory' && typeof renderInventoryGrid === 'function') renderInventoryGrid();
        if (name === 'progress') {
            if (typeof ensureProgression === 'function') ensureProgression();
            if (typeof ensureBounties === 'function') ensureBounties();
            if (typeof checkAchievements === 'function') checkAchievements(false);
            if (typeof checkQuests === 'function') checkQuests(false);
            if (typeof setProgressTab === 'function') setProgressTab('bounties');
        }
        if (name === 'skills' && typeof renderSkillsUI === 'function') renderSkillsUI();
        if (name === 'cooking' && typeof renderCookingUI === 'function') renderCookingUI();
        if (name === 'tournament' && window.Tournaments) Tournaments.render();
        if (name === 'playerlist' && typeof renderPlayerList === 'function') renderPlayerList();
        document.exitPointerLock();
    }
    const bar = document.getElementById('panel-tabbar');
    if (bar) bar.style.display = 'flex';
}

let nextPanelTabBarUpdate=0;
function updatePanelTabBar() {
    const now=performance.now();if(now<nextPanelTabBarUpdate)return;nextPanelTabBarUpdate=now+100;
    const anyOpen = Object.values(PANEL_OVERLAY_IDS).some(id => {
        const el = document.getElementById(id);
        return el && el.style.display === 'flex';
    });
    const bar = document.getElementById('panel-tabbar');
    if (bar) {const display=anyOpen?'flex':'none';if(bar.style.display!==display)bar.style.display=display;}
}

// What the Merchant pays for one fish, including the Trading skill bonus.
function getFishSellPrice(name) {
    let price;
    if (!name) price = 10;
    else if (name.startsWith('Cooked ')) {
        const base = (typeof getFishByName === 'function') ? getFishByName(name.slice(7)) : null;
        price = Math.max(1, Math.round((base ? base.price : 10) * COOK_VALUE_MULT));
    } else if (name.startsWith('Burnt ')) {
        const base = (typeof getFishByName === 'function') ? getFishByName(name.slice(6)) : null;
        price = Math.max(1, Math.round((base ? base.price : 10) * COOK_BURN_VALUE_MULT));
    } else {
        const f = (typeof getFishByName === 'function') ? getFishByName(name) : null;
        price = f ? f.price : 10;
    }
    const mult = (typeof tradingSellMultiplier === 'function') ? tradingSellMultiplier() : 1;
    return Math.max(1, Math.round(price * mult));
}
function addFishToInventory(fish) {
    ensureInventorySlots();
    const existing = saveState.invSlots.find(s => s && s.type === 'fish' && s.name === fish.name);
    if (existing) { existing.count = (existing.count || 1) + 1; return; }
    const empty = saveState.invSlots.findIndex(s => s === null);
    if (empty !== -1) saveState.invSlots[empty] = { type: 'fish', name: fish.name, color: fish.color, size: fish.size || 1, count: 1 };
    autoSortInventory();
}
function getItemTooltipText(entry) {
    if (!entry) return '';
    if (entry.type === 'fish') {
        const f = (typeof getFishByName === 'function') ? getFishByName(entry.name) : null;
        const lines = [entry.name];
        if (f) {
            lines.push('Rarity: ' + f.rarity);
            lines.push('Zone: ' + (f.zone || 'lake'));
            lines.push('Shape: ' + (f.shape || 'fish'));
            lines.push('Drain: ' + f.drain);
            lines.push('Price: $' + f.price);
            if (f.chance) lines.push('Chance: ' + f.chance);
        } else {
            lines.push('Rarity: ' + (entry.rarity || 'Common'));
        }
        if (entry.count && entry.count > 1) lines.push('Count: ' + entry.count);
        if (saveState.personalBests && saveState.personalBests[entry.name]) {
            const pb = saveState.personalBests[entry.name];
            lines.push('Best: ' + (pb.label || 'Normal') + ' (' + Number(pb.size || 1).toFixed(2) + 'x)');
        }
        return lines.join('\n');
    }
    if(entry.type==='flower'){const flower=typeof FLOWER_TYPES!=='undefined'?FLOWER_TYPES.find(f=>f.id===entry.id):null;return (entry.name||flower?.name||entry.id)+'\nCount: '+(entry.count||1)+'\nSell at the Merchant.';}
    if (entry.type === 'tool') {
        const tool = TOOLS.find(t => t.id === entry.id);
        const name = tool ? tool.name : entry.id;
        let extra = '';
        if (entry.id === 'boat') extra = '\nPress R in water to use.';
        return name + (tool && tool.desc ? '\n' + tool.desc : '') + extra;
    }
    return '';
}

function showItemTooltip(text, x, y) {
    const el = document.getElementById('item-tooltip');
    if (!el) return;
    if (!text) { el.style.display = 'none'; return; }
    el.innerText = text;
    el.style.display = 'block';
    const pad = 12;
    let left = x + pad, top = y + pad;
    if (left + 260 > window.innerWidth) left = x - 260 - pad;
    if (top + 120 > window.innerHeight) top = y - 120 - pad;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
}

function hideItemTooltip() {
    const el = document.getElementById('item-tooltip');
    if (el) el.style.display = 'none';
}
    if (!Array.isArray(saveState.invSlots) || saveState.invSlots.length !== 50) {
        saveState.invSlots = new Array(50).fill(null);
        const counts = {};
        if (Array.isArray(saveState.inventory)) {
            for (const f of saveState.inventory) {
                if (!f || !f.name) continue;
                if (!counts[f.name]) counts[f.name] = { type: 'fish', name: f.name, color: f.color, size: f.size || 1, count: 0 };
                counts[f.name].count++;
            }
        }
        let idx = 0;
        for (const k in counts) {
            if (idx < 50) saveState.invSlots[idx++] = counts[k];
        }
    }
    // Migrate unlocked tools into inventory (if not already present)
    if (Array.isArray(saveState.unlockedTools)) {
        for (const tid of saveState.unlockedTools) {
            if (tid === 'hands' || tid === 'rod') continue;
            const exists = saveState.invSlots.some(s => s && s.type === 'tool' && s.id === tid);
            if (!exists) {
                const empty = saveState.invSlots.findIndex(s => s === null);
                if (empty !== -1) {
                    const tool = (typeof TOOLS !== 'undefined') ? TOOLS.find(t => t.id === tid) : null;
                    saveState.invSlots[empty] = { type: 'tool', id: tid, name: tool ? tool.name : tid };
                }
            }
        }
    }

let invFilterMode = 'all';

function ensureInventorySlots() {
    if (!Array.isArray(saveState.invSlots) || saveState.invSlots.length !== 50) {
        saveState.invSlots = new Array(50).fill(null);
        const counts = {};
        if (Array.isArray(saveState.inventory)) {
            for (const f of saveState.inventory) {
                if (!f || !f.name) continue;
                if (!counts[f.name]) counts[f.name] = { type: 'fish', name: f.name, color: f.color, size: f.size || 1, count: 0 };
                counts[f.name].count++;
            }
        }
        let idx = 0;
        for (const k in counts) {
            if (idx < 50) saveState.invSlots[idx++] = counts[k];
        }
    }
    // Migrate unlocked tools into inventory (if not already present)
    if (Array.isArray(saveState.unlockedTools)) {
        for (const tid of saveState.unlockedTools) {
            if (tid === 'hands' || tid === 'rod') continue;
            const exists = saveState.invSlots.some(s => s && s.type === 'tool' && s.id === tid);
            if (!exists) {
                const empty = saveState.invSlots.findIndex(s => s === null);
                if (empty !== -1) {
                    const tool = (typeof TOOLS !== 'undefined') ? TOOLS.find(t => t.id === tid) : null;
                    saveState.invSlots[empty] = { type: 'tool', id: tid, name: tool ? tool.name : tid };
                }
            }
        }
    }
}

function renderInventoryGrid() {
    ensureInventorySlots();
    const box = document.getElementById('inventory-grid');
    if (!box) return;
    box.innerHTML = '';
    for (let i = 0; i < 50; i++) {
        const slot = document.createElement('div');
        slot.className = 'journal-entry';
        slot.style.cssText = 'width:56px;height:56px;display:flex;align-items:center;justify-content:center;position:relative;cursor:grab;';
        slot.draggable = true;
        slot.dataset.slot = i;
        const rawEntry = saveState.invSlots[i];
        const passes = (!rawEntry) ? true : (invFilterMode === 'all' ? true : rawEntry.type === invFilterMode || (invFilterMode === 'tools' && rawEntry.type === 'tool') || (invFilterMode === 'flowers' && rawEntry.type === 'flower'));
        const entry = passes ? rawEntry : null;
        slot.draggable = !!entry;
        if (entry && entry.type === 'fish') {
            try {
                const tex = createFishTexture(entry.name, entry.color);
                const cv = document.createElement('canvas');
                cv.width = 48; cv.height = 48;
                const cx = cv.getContext('2d');
                cx.drawImage(tex.image, 0, 0, 48, 48);
                slot.appendChild(cv);
            } catch (e) { slot.innerText = '🐟'; }
            if (entry.count > 1) {
                const badge = document.createElement('div');
                badge.innerText = entry.count;
                badge.style.cssText = 'position:absolute;bottom:2px;right:4px;font-size:10px;color:#fff;background:rgba(0,0,0,0.7);padding:0 3px;';
                slot.appendChild(badge);
            }
        } else if (entry && entry.type === 'tool') {
            const tool = TOOLS.find(t => t.id === entry.id);
            slot.innerHTML = (window.PX && PX.has(entry.id)) ? PX.icon(entry.id, 32) : (tool ? tool.icon : '?');
        } else if(entry&&entry.type==='flower') {
            const icon=document.createElement('span');icon.className='inventory-flower';icon.style.color=entry.color||'#e8c77e';
            if(window.PX&&PX.has('flower'))icon.innerHTML=PX.icon('flower',32);else icon.textContent='✿';
            slot.appendChild(icon);
            if(entry.count>1){const badge=document.createElement('div');badge.textContent=entry.count;badge.style.cssText='position:absolute;bottom:2px;right:4px;font-size:10px;color:#fff;background:rgba(0,0,0,.7);padding:0 3px;';slot.appendChild(badge);}
        }
        // Drag handlers
        slot.addEventListener('dragstart', (e) => {
            if (!passes) { e.preventDefault(); return; }
            const entry = saveState.invSlots[i];
            if (entry && entry.type === 'tool' && entry.id === 'boat') { e.preventDefault(); return; }
            e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'inv', index: i }));
        });
        // Tooltip
        slot.addEventListener('mouseenter', (e) => {
            if (!passes) return;
            const entry = saveState.invSlots[i];
            showItemTooltip(getItemTooltipText(entry), e.clientX, e.clientY);
        });
        slot.addEventListener('mousemove', (e) => {
            if (!passes) return;
            const entry = saveState.invSlots[i];
            showItemTooltip(getItemTooltipText(entry), e.clientX, e.clientY);
        });
        slot.addEventListener('mouseleave', () => hideItemTooltip());
        slot.addEventListener('dragover', (e) => { e.preventDefault(); });
        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                if (data.from === 'hotbar') {
                    // Move hotbar slot to inventory? swap
                    const hb = saveState.hotbar[data.index];
                    const inv = saveState.invSlots[i];
                    saveState.invSlots[i] = hb ? { ...hb, count: 1 } : null;
                    saveState.hotbar[data.index] = inv ? { type: inv.type, name: inv.name, color: inv.color, size: inv.size } : null;
                    renderInventoryGrid();
                    updateHotbarVisuals();
                    saveGame();
                }
            } catch (err) { }
        });
        box.appendChild(slot);
    }
    // Render hotbar drop row inside the overlay
    const hb = document.getElementById('inventory-hotbar');
    if (hb) {
        hb.innerHTML = '';
        for (let i = 0; i < 10; i++) {
            const slot = document.createElement('div');
            slot.style.cssText = 'width:44px;height:44px;background:var(--p-sunken);border:2px solid var(--p-line);display:flex;align-items:center;justify-content:center;position:relative;';
            slot.dataset.hb = i;
            const entry = saveState.hotbar[i];
            if (entry && entry.type === 'fish') {
                try {
                    const tex = createFishTexture(entry.name, entry.color);
                    const cv = document.createElement('canvas');
                    cv.width = 36; cv.height = 36;
                    cv.getContext('2d').drawImage(tex.image, 0, 0, 36, 36);
                    slot.appendChild(cv);
                } catch (e) { slot.innerText = '🐟'; }
            } else if (entry && entry.type === 'tool') {
                const tool = TOOLS.find(t => t.id === entry.id);
                slot.innerHTML = (window.PX && PX.has(entry.id)) ? PX.icon(entry.id, 24) : (tool ? tool.icon : '?');
            }
            slot.addEventListener('dragover', (e) => e.preventDefault());
            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                try {
                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                    if (data.from === 'inv') {
                        const inv = saveState.invSlots[data.index];
                        if (inv && (inv.type === 'fish' || inv.type === 'tool')) {
                            if (inv.type === 'fish') saveState.hotbar[i] = { type: 'fish', name: inv.name, color: inv.color, size: inv.size || 1 };
                            else saveState.hotbar[i] = { type: 'tool', id: inv.id, name: inv.name };
                            renderInventoryGrid();
                            updateHotbarVisuals();
                            saveGame();
                        }
                    }
                } catch (err) { }
            });
            hb.appendChild(slot);
        }
    }
}

// Drag fish from inventory to hotbar: handled by hotbar slot drop
function setupHotbarDrag() {
    for (let i = 0; i < 10; i++) {
        const iconEl = document.getElementById(`hotbar-icon-${i}`);
        if (!iconEl) continue;
        const slotEl = iconEl.parentElement;
        slotEl.addEventListener('dragover', (e) => e.preventDefault());
        slotEl.addEventListener('drop', (e) => {
            e.preventDefault();
            try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                if (data.from === 'inv') {
                    const inv = saveState.invSlots[data.index];
                    if (inv && (inv.type === 'fish' || inv.type === 'tool')) {
                        if (inv.type === 'fish') saveState.hotbar[i] = { type: 'fish', name: inv.name, color: inv.color, size: inv.size || 1 };
                        else saveState.hotbar[i] = { type: 'tool', id: inv.id, name: inv.name };
                        updateHotbarVisuals();
                        saveGame();
                    }
                }
            } catch (err) { }
        });
    }
}

const OPTIONS_TABS=['audio','display','controls','save','session'];
let optionsActiveTab='audio';
window.setOptionsTab=function(name,focus=false){
    if(!OPTIONS_TABS.includes(name))return;
    document.removeEventListener('keydown',handleRebind);
    optionsActiveTab=name;
    for(const tab of OPTIONS_TABS){
        const button=document.getElementById('options-tab-'+tab),panel=document.getElementById('options-section-'+tab);
        if(button){button.setAttribute('aria-selected',String(tab===name));button.tabIndex=tab===name?0:-1;if(focus&&tab===name)button.focus();}
        if(panel)panel.hidden=tab!==name;
    }
    const mobile=document.getElementById('mobile-controls-note'),keys=document.getElementById('keybinds-container'),reset=document.getElementById('btn-reset-keybinds');
    if(mobile)mobile.hidden=!isMobile;if(keys)keys.hidden=isMobile;if(reset)reset.hidden=isMobile;
    if(name==='controls'&&!isMobile)renderKeybinds();
};
window.handleOptionsTabKey=function(event){
    let index=OPTIONS_TABS.indexOf(optionsActiveTab);
    if(event.key==='ArrowRight')index=(index+1)%OPTIONS_TABS.length;
    else if(event.key==='ArrowLeft')index=(index+OPTIONS_TABS.length-1)%OPTIONS_TABS.length;
    else if(event.key==='Home')index=0;
    else if(event.key==='End')index=OPTIONS_TABS.length-1;
    else return;
    event.preventDefault();setOptionsTab(OPTIONS_TABS[index],true);
};
window.toggleOptions = function () {
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
        updateCharacterModelUI();
        updatePerformanceUI();
        updateDebugUI();

        const volSlider = document.getElementById('volume-slider');
        if (volSlider) volSlider.value = saveState.masterVolume;

        // NEW: Render the controls, but only for desktop
        if (!isMobile) { // Keybinds are not relevant on mobile devices.
            renderKeybinds();
        }

        setOptionsTab(optionsActiveTab);
        document.exitPointerLock(); // Unlock Mouse
        ui.style.display = 'flex';
    }
}

window.toggleShop = function () {
    const ui = document.getElementById('shop-overlay');
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') { document.exitPointerLock(); renderShop(); }
    else {window.ShopTryOn?.clear(false);window.ShopCharacterPreview?.destroy();}
}

window.toggleBaitShop = function () {
    const ui = document.getElementById('bait-shop-overlay');
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') { document.exitPointerLock(); renderBaitShop(); }
}

// --- TUTORIAL NPC GUIDE ---
let npcTutorial = null;
let npcFisher = null;

window.toggleTutorial = function () {
    const ui = document.getElementById('tutorial-overlay');
    if (!ui) return;
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') {
        document.exitPointerLock();
        // Reset to basics tab
        showTutorialTab('basics');
    }
}

// Guided walkthrough lives in guided-tutorial.js; keep existing menu entry points.
function startGuidedTour() { window.GuidedTutorial?.resume(); }

// --- OLD FISHER DIALOGUE ---
// A rotating set of tips so the lakeside NPC is more than decoration.
let fisherTipIndex = 0;
const FISHER_TIPS = [
    "Old Fisher: Been casting on this lake nigh on forty years. Patience, lad, patience.",
    "Old Fisher: Fish bite better when it rains, I swear it.",
    "Old Fisher: Try the ponds at dusk — different stock lurks in the dark water.",
    "Old Fisher: A bigger reel window means a bigger catch. Don't fight the line.",
    "Old Fisher: Sell your haul to the Merchant east of the lake. He pays fair... mostly.",
    "Old Fisher: There's rarer water out past the shore. Row out if you're brave."
];
window.talkToFisher = function () {
    window.GuidedTutorial?.event('fisher');
    const tip = FISHER_TIPS[fisherTipIndex % FISHER_TIPS.length];
    fisherTipIndex++;
    showToast(tip);
    // Once the player actually talks to him, they've found the quest chain.
    if (saveState.fisherHinted !== true) {
        saveState.fisherHinted = true;
        if (typeof saveGame === 'function') saveGame();
    }
    // First chat also opens the quest list so the chain is discoverable.
    if (saveState.quests && saveState.quests.completed.length === 0 &&
        typeof window.setProgressTab === 'function' && typeof window.toggleProgress === 'function') {
        const overlay = document.getElementById('progress-overlay');
        if (overlay && overlay.style.display !== 'flex') {
            window.setProgressTab('quests');
            window.toggleProgress();
        }
    }
}

// One-time nudge toward the Old Fisher so new players find the quest chain.
// Runs after the lobby closes; the flag lives in the save so it fires once.
function maybeShowFisherHint() {
    try {
        ensureProgression();
        if (saveState.fisherHinted === true) return;
        if (saveState.quests && saveState.quests.completed.length > 0) return;
        saveState.fisherHinted = true;
        setTimeout(() => {
            showToast('New here? Find the Old Fisher by the lake — press E near him.', 'achievement');
        }, 2500);
        if (typeof saveGame === 'function') saveGame();
    } catch (e) { }
}

window.showTutorialTab = function (tabName) {
    // Hide all panels
    const panels = document.querySelectorAll('#tutorial-content .tutorial-panel');
    panels.forEach(p => p.style.display = 'none');

    // Show selected panel
    const target = document.getElementById('tab-' + tabName);
    if (target) target.style.display = 'block';

    // Update tab button styles
    const tabs = document.querySelectorAll('.tutorial-tab');
    tabs.forEach(t => t.classList.remove('active'));

    // Find and activate the clicked tab
    tabs.forEach(t => {
        if (t.textContent.toLowerCase().includes(tabName.substring(0, 4))) {
            t.classList.add('active');
        }
    });
}

window.toggleHostPanel = function () {
    const ui = document.getElementById('host-overlay');
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') { document.exitPointerLock(); updateHostPanel(); }
}

window.changeVolume = function (val) {
    saveState.masterVolume = parseFloat(val);
    if (masterGain) masterGain.gain.setTargetAtTime(saveState.masterVolume, audioCtx.currentTime, 0.1);
    saveGame();
}

window.changeSFXVolume = function (val) {
    saveState.sfxVolume = parseFloat(val);
    if (sfxGain) sfxGain.gain.setTargetAtTime(saveState.sfxVolume, audioCtx.currentTime, 0.1);
    saveGame();
}

window.changeMidiVolume = function (val) {
    saveState.midiVolume = parseFloat(val);
    if (midiGain) midiGain.gain.setTargetAtTime(saveState.midiVolume, audioCtx.currentTime, 0.1);
    saveGame();
}

window.changeVoiceVolume = function (val) {
    saveState.voiceVolume = parseFloat(val);


    saveGame();
}

// Personal volume ceiling for YouTube Screen props. Proximity still scales the
// player's volume down as you walk away; this multiplies the result, so 0
// silences every screen without touching anyone else's mix.
window.changeScreenVolume = function (val) {
    saveState.screenVolume = parseFloat(val);
    if (!isFinite(saveState.screenVolume)) saveState.screenVolume = 1;
    saveGame();
}

// --- MODULAR PART CHANGE FUNCTIONS ---
window.changeEars = function (val) {
    saveState.currentEars = val;
    saveGame();
    if (player) updateLocalVisuals();
    if (document.getElementById('shop-overlay').style.display === 'flex') renderShop();
}

window.changeHair = function (val) {
    saveState.currentHair = val;
    saveGame();
    if (player) updateLocalVisuals();
    if (player) updateLocalVisuals();
    updateCharacterPreview();
    if (document.getElementById('shop-overlay').style.display === 'flex') renderShop();
}

window.changeEyes = function (val) {
    saveState.currentEyes = val;
    saveGame();
    if (player) updateLocalVisuals();
    if (player) updateLocalVisuals();
    updateCharacterPreview();
    if (document.getElementById('shop-overlay').style.display === 'flex') renderShop();
}

window.changeNose = function (val) {
    saveState.currentNose = val;
    saveGame();
    if (player) updateLocalVisuals();
    if (player) updateLocalVisuals();
    updateCharacterPreview();
    if (document.getElementById('shop-overlay').style.display === 'flex') renderShop();
}

window.changeMisc = function (val) {
    saveState.currentMisc = val;
    window.ProtogenLogo?.syncButton();
    saveGame();
    if (player) updateLocalVisuals();
    if (player) updateLocalVisuals();
    updateCharacterPreview();
    if (document.getElementById('shop-overlay').style.display === 'flex') renderShop();
}

window.changeTail = function (val) {
    saveState.currentTail = val;
    saveGame();
    if (player) updateLocalVisuals();
    if (player) updateLocalVisuals();
    updateCharacterPreview();
    if (document.getElementById('shop-overlay').style.display === 'flex') renderShop();
}

// --- PART COLOR CHANGE FUNCTIONS ---
window.changeEarsColor = function (val) {
    saveState.earsColor = val;
    saveGame();
    if (player) updateLocalVisuals();
    updateCharacterPreview();
}

window.changeHairColor = function (val) {
    saveState.hairColor = val;
    saveGame();
    if (player) updateLocalVisuals();
    updateCharacterPreview();
}

window.changeNoseColor = function (val) {
    saveState.noseColor = val;
    saveGame();
    if (player) updateLocalVisuals();
    updateCharacterPreview();
}

window.changeMiscColor = function (val) {
    saveState.miscColor = val;
    saveGame();
    if (player) updateLocalVisuals();
    updateCharacterPreview();
}

window.changeTailColor = function (val) {
    saveState.tailColor = val;
    saveGame();
    if (player) updateLocalVisuals();
    updateCharacterPreview();
}

// Helper function to populate part selector dropdowns
function populatePartSelectors() {
    window.ProtogenLogo?.syncButton();
    const populate = (selectId, types, currentVal) => {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = '';
        types.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            if (t.id === currentVal) opt.selected = true;
            sel.appendChild(opt);
        });
    };

    populate('ears-select', EAR_TYPES, saveState.currentEars);
    populate('hair-select', HAIR_TYPES, saveState.currentHair);
    populate('eyes-select', EYE_TYPES, saveState.currentEyes);
    populate('nose-select', NOSE_TYPES, saveState.currentNose);
    populate('misc-select', MISC_TYPES, saveState.currentMisc);
    populate('tail-select', TAIL_TYPES, saveState.currentTail);

    update3DColorControls();
    // Set part color pickers (default to fur color if not set)
    const furCol = saveState.catColor || '#ff6347';
    const earsColorPicker = document.getElementById('ears-color-picker');
    const hairColorPicker = document.getElementById('hair-color-picker');
    const noseColorPicker = document.getElementById('nose-color-picker');
    const miscColorPicker = document.getElementById('misc-color-picker');
    const tailColorPicker = document.getElementById('tail-color-picker');

    if (earsColorPicker) earsColorPicker.value = saveState.earsColor || furCol;
    if (hairColorPicker) hairColorPicker.value = saveState.hairColor || '#ffffff';
    if (noseColorPicker) noseColorPicker.value = saveState.noseColor || furCol;
    if (miscColorPicker) miscColorPicker.value = saveState.miscColor || furCol;
    if (tailColorPicker) tailColorPicker.value = saveState.tailColor || furCol;
}

window.toggleMusic = function () {
    saveState.musicMuted = !saveState.musicMuted;
    saveGame();
    updateMusicUI();

    if (saveState.musicMuted) Music.stop();
    else Music.init();
}

window.deleteSave = function () {
    if (confirm("ARE YOU SURE?\n\nThis will PERMANENTLY delete your money, items, and unlocks.\n\nPress OK to wipe your save and restart.")) {
        localStorage.removeItem('islandFisherSave');
        location.reload();
    }
}

window.leaveGame = function () {
    if (confirm("Are you sure you want to leave the room?")) {
        Object.keys(otherPlayers).forEach(pid => removePlayer(pid));

        if (peer) peer.destroy();
        location.reload();
    }
}

window.changeFurColor = function (c) {
    saveState.catColor = c;
    saveGame();
    updateLocalVisuals();
    renderShop();
}

window.changeBellyColor = function (c) {
    saveState.bellyColor = c;
    updateLocalVisuals();
    renderShop();
    saveGame();
}

window.changeBait = function (val) {

    if (fishingState !== 'idle') {
        showToast("Can't change bait while fishing!");



        updateBaitSelector();
        return;
    }


    activeBaitId = val;
}

window.changeEyeColor = function (c) {
    saveState.eyeColor = c;
    updateLocalVisuals();
    renderShop();
    saveGame();
}
function updateMusicUI() {
    const btn = document.getElementById('btn-music-toggle');
    if (btn) {
        btn.innerText = saveState.musicMuted ? "Music: OFF" : "Music: ON";
        btn.style.color = saveState.musicMuted ? 'var(--p-bad)' : 'var(--p-good)';
    }
}

function updateLocalVisuals() {
    if (player) {
        // Rebuild the body (billboard plane, or a real 3D model) from saveState.
        replaceCharacterBody(player, characterCfgFromSave());

        // Title Update
        const oldT = player.getObjectByName('titleSprite');
        if (oldT) player.remove(oldT);

        const tTex = createTitleTexture(saveState.currentTitle);
        if (tTex) {
            const tMat = new THREE.SpriteMaterial({ map: tTex, depthWrite: false, depthTest: false });
            const tSprite = new THREE.Sprite(tMat);
            tSprite.position.y = 3.45; tSprite.scale.set(3, 0.75, 1); tSprite.name = "titleSprite";
            tSprite.renderOrder = 201; // Higher than remote players (101)
            // Only show if setting is enabled
            tSprite.visible = saveState.showTitles;
            player.add(tSprite);
        }

        // Name Tag Update
        const oldName = player.getObjectByName('nameTag');
        if (oldName) {
            const nameTex = createNameTagTexture(saveState.displayName);
            oldName.material.map.dispose();
            oldName.material.map = nameTex;
            oldName.scale.set(3*nameTex.image.width/256,.75,1);
            oldName.material.needsUpdate = true;
        }

        // --- HELD ITEMS LOGIC ---
        const oldFish = player.getObjectByName('heldFishSprite');
        if (oldFish) { disposeCharacterBody(oldFish); player.remove(oldFish); }

        const oldRod = player.getObjectByName('rod');
        if (oldRod) { disposeCharacterBody(oldRod); player.remove(oldRod); }

        // 1. Showing a Fish?  (always the 3D model)
        if (localHeldFish && !isGuitarActive && !isGloveActive) {
            const fSprite = makeHeldFish(localHeldFish.name, localHeldFish.color || '#ffffff', localHeldFish.size);
            fSprite.visible = true;
            player.add(fSprite);
        }
        // 2. Holding Rod? (Check isHandsHidden and active tool here)
        // Don't show rod when Axe or Pickaxe is equipped, or when holding a fish/hands.
        else {
            const activeEntry = saveState.hotbar && saveState.hotbar[saveState.activeHotbarIndex];
            const activeToolId = activeEntry && activeEntry.type === 'tool' ? activeEntry.id : null;
            if (!isGuitarActive && !isGloveActive && !isHandsHidden && activeToolId === 'rod') {
                // Create Rod with current skin (billboard plane in 2D, model in 3D)
                const rodId = saveState.currentRod || 'bamboo';
                const r = makeRod(rodId);
                r.userData.rodId = rodId;
                // Keep the fishing pose if the model was swapped mid-cast.
                if (fishingState !== 'idle' && fishingState !== 'charging') {
                    r.rotation.x = rodAngleFor(r, true);
                }
                player.add(r);
            }
        }
    }
}

window.renderJournal = function renderJournal(zoneFilter = 'all') {
    const container = document.getElementById('journal-container');
    container.innerHTML = '';

        const rarityMap = { "Common": 1, "Uncommon": 2, "Rare": 3, "Epic": 4, "Legendary": 5 };

        // --- ZONE TABS ---
        const tabsDiv = document.createElement('div');
        tabsDiv.style.cssText = 'grid-column: 1 / -1; display: flex; gap: 5px; justify-content: center; flex-wrap: wrap; margin-bottom: 10px;';

        const zones = [
            { id: 'all', name: 'All', icon: 'globe', color: '#6f7794' },
            { id: 'lake', name: 'Lake', icon: 'droplet', color: '#3d7fb8' },
            { id: 'lightpond', name: 'Light Pond', icon: 'sun', color: '#6fb54a' },
            { id: 'darkpond', name: 'Dark Pond', icon: 'moon', color: '#6b5aa8' },
            { id: 'ocean', name: 'Ocean', icon: 'wave', color: '#24557f' },
            { id: 'lava', name: 'Lava', icon: 'warn', color: '#c8534b' },
            { id: 'secret', name: 'Cave', icon: 'star', color: '#e0a03a' },
            { id: 'special', name: 'Special', icon: 'star', color: '#f2c14e' }
        ];

        zones.forEach(zone => {
            const btn = document.createElement('button');
            const active = zoneFilter === zone.id;
            btn.innerHTML = (window.PX ? PX.icon(zone.icon, 14) : '') + ' ' + zone.name;
            btn.style.cssText = `font-family: var(--font-display); padding: 6px 10px; border: 2px solid var(--p-line); border-radius: 0; cursor: pointer; font-size: 10px; background: ${active ? zone.color : 'var(--p-face-2)'}; color: ${active ? '#0c0d13' : 'var(--p-text-dim)'};`;
            btn.onclick = () => renderJournal(zone.id);
            tabsDiv.appendChild(btn);
        });
        container.appendChild(tabsDiv);

        // --- 1. AGGREGATE ALL FISH LISTS ---
        const fishMap = new Map();
        const addList = (list) => {
            if (list && Array.isArray(list)) {
                list.forEach(f => fishMap.set(f.name, f));
            }
        };

        addList(FISH_TYPES);
        if (typeof LAVA_FISH !== 'undefined') addList(LAVA_FISH);
        if (typeof RAIN_FISH !== 'undefined') addList(RAIN_FISH);
        if (typeof VOID_FISH !== 'undefined') addList(VOID_FISH);

        let allFish = Array.from(fishMap.values());

        // --- FILTER BY ZONE ---
        if (zoneFilter !== 'all') {
            allFish = allFish.filter(fish => {
                // Special tab: rain/void conditional fish
                if (zoneFilter === 'special') {
                    return fish.condition === 'rain' || fish.condition === 'void';
                }
                // Secret tab: cave fish (condition secret) only
                if (zoneFilter === 'secret') {
                    return fish.condition === 'secret' || fish.zone === 'secret';
                }
                // Lava tab: lava fish only
                if (zoneFilter === 'lava') {
                    return fish.isLava === true;
                }
                // Skip conditional/lava fish for normal zones
                if (fish.condition || fish.isLava) return false;
                // Use getFishZone to categorize
                return typeof getFishZone === 'function' && getFishZone(fish.name) === zoneFilter;
            });
        }

        // --- 2. SORTING ---
        const sortedFish = allFish.sort((a, b) => {
            const rarityDiff = rarityMap[a.rarity] - rarityMap[b.rarity];
            if (rarityDiff !== 0) return rarityDiff;
            return a.name.localeCompare(b.name);
        });

        // --- 3. PROGRESS HEADER ---
        const totalFishCount = sortedFish.length;
        const totalTierCount = totalFishCount * 4;

        let caughtTierCount = 0;
        let caughtSpeciesCount = 0;
        sortedFish.forEach(fish => {
            const tiers = saveState.journal[fish.name];
            if (tiers && Array.isArray(tiers)) {
                caughtTierCount += tiers.length;
                if (tiers.length > 0) caughtSpeciesCount++;
            }
        });

        const header = document.createElement('div');
        header.style.gridColumn = "1 / -1";
        header.style.textAlign = "center";
        header.style.marginBottom = "15px";
        header.style.color = "var(--p-text)";
        header.style.background = "var(--p-sunken)";
        header.style.border = "2px solid var(--p-line)";
        header.style.padding = "10px";
        header.style.borderRadius = "0";
        header.innerHTML = `<h3 style="margin:0">Discovery Progress: ${caughtTierCount} / ${totalTierCount}</h3>
        <div style="font-size:15px; color:var(--p-text-dim); margin-top:5px;">${caughtSpeciesCount} / ${totalFishCount} species discovered</div>`;
        container.appendChild(header);

        // --- 4. RENDER GRID ---
        const fragment = document.createDocumentFragment();

        sortedFish.forEach(fish => {
            const entry = document.createElement('div');
            const caughtData = saveState.journal[fish.name];
            const isCaught = caughtData && caughtData.length > 0;

            entry.className = isCaught ? 'journal-entry unlocked' : 'journal-entry';
            entry.style.display = 'flex';
            entry.style.flexDirection = 'column';
            entry.style.alignItems = 'center';
            entry.style.justifyContent = 'flex-start';
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
                placeholder.style.color = 'var(--p-face-3)';
                placeholder.style.fontWeight = 'bold';
                placeholder.innerText = '?';
                entry.appendChild(placeholder);
            }

            let html = `<div class="journal-name" style="color:${isCaught ? fish.color : 'var(--p-text-mute)'}; font-size:15px; text-align:center;">${isCaught ? fish.name : "???"}</div>`;
            // Undiscovered entries hide their rarity too, so the journal doesn't
            // spoil which unknown fish are the rare ones before you find them.
            html += `<div class="journal-rarity" style="font-size:14px; color:var(--p-text-mute);">${isCaught ? fish.rarity : 'Undiscovered'}</div>`;
            if (isCaught && saveState.personalBests && saveState.personalBests[fish.name]) {
                const pb = saveState.personalBests[fish.name];
                html += `<div style="font-size:12px; color:var(--p-gold); white-space:nowrap;">Best: ${pb.label || 'Normal'} ${Number(pb.size || 1).toFixed(2)}x</div>`;
            }

            const textContainer = document.createElement('div');
            textContainer.innerHTML = html;

            if (isCaught) {
                const medalsDiv = document.createElement('div');
                medalsDiv.className = 'journal-medals';
                medalsDiv.style.justifyContent = 'center';

                TIERS.forEach(tier => {
                    const hasTier = caughtData && caughtData.includes(tier.id);
                    const m = document.createElement('div');
                    m.className = `medal ${hasTier ? 'got-' + tier.id : ''}`;
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

    window.saveCurrentOutfit = function saveCurrentOutfit() {
        if (saveState.savedOutfits.length >= 10) {
            showToast("Wardrobe full! Delete an outfit first.");
            return;
        }

        const name = prompt("Name this outfit:", `Outfit ${saveState.savedOutfits.length + 1}`);
        if (!name) return;

        const outfit = {
            id: Date.now(),
            name: name.substring(0, 12),
            // Modular parts instead of species
            ears: saveState.currentEars,
            eyes: saveState.currentEyes,
            nose: saveState.currentNose,
            misc: saveState.currentMisc,
            protogenLogo:globalThis.window?.ProtogenLogo?.normalize(saveState.protogenLogo)||'',
            tail: saveState.currentTail,
            color: saveState.catColor,
            belly: saveState.bellyColor,
            eye: saveState.eyeColor,
            earsColor: saveState.earsColor,
            noseColor: saveState.noseColor,
            miscColor: saveState.miscColor,
            tailColor: saveState.tailColor,
            handColor: saveState.handColor, footColor: saveState.footColor, tailAccentColor: saveState.tailAccentColor,
            hat: saveState.currentHat,
            shirt: saveState.currentShirt, pants: saveState.currentPants,
            collar: saveState.currentCollar,
            rod: saveState.currentRod,
            title: saveState.currentTitle,
            bodyPaint: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaint) : ''),
            bodyPaintBack: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintBack) : ''),
            bodyPaintLeft: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintLeft) : ''),
            bodyPaintRight: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintRight) : ''),
            bodyPaintHeadFront: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadFront) : ''),
            bodyPaintHeadBack: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadBack) : ''),
            bodyPaintHeadLeft: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadLeft) : ''),
            bodyPaintHeadRight: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadRight) : ''),
            bodyPaintHeadTop: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadTop) : ''),
            bodyPaintHeadBottom: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintHeadBottom) : ''),
            bodyPaintArmLeft: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintArmLeft) : ''),
            bodyPaintArmRight: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintArmRight) : ''),
            bodyPaintLegLeft: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintLegLeft) : ''),
            bodyPaintLegRight: (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(saveState.bodyPaintLegRight) : ''),
            bodyPaintColor: (typeof normalizeBodyPaintColor === 'function' ? normalizeBodyPaintColor(saveState.bodyPaintColor) : '#ffffff'),
            hair: saveState.currentHair,
            hairColor: saveState.hairColor
        };

        saveState.savedOutfits.push(outfit);
        saveGame();
        renderOutfitList();
        showToast("Outfit Saved!");
    }

    window.loadOutfit = function loadOutfit(id) {
        const outfit = saveState.savedOutfits.find(o => o.id === id);
        if (!outfit) return;

        // Apply colors
        saveState.catColor = outfit.color || '#ff0000';
        saveState.bellyColor = outfit.belly || '#ffffff';
        saveState.eyeColor = outfit.eye || '#000000';

        // Part-specific colors
        saveState.earsColor = outfit.earsColor || '';
        saveState.noseColor = outfit.noseColor || '';
        saveState.miscColor = outfit.miscColor || '';
        saveState.protogenLogo=globalThis.window?.ProtogenLogo?.normalize(outfit.protogenLogo)||'';
        saveState.tailColor = outfit.tailColor || '';
        saveState.handColor = outfit.handColor || '';
        saveState.footColor = outfit.footColor || '';
        saveState.tailAccentColor = outfit.tailAccentColor || '';

        // Apply modular parts (with fallback migration from old species-based outfits)
        if (outfit.ears) {
            saveState.currentEars = outfit.ears;
            saveState.currentEyes = outfit.eyes;
            saveState.currentNose = outfit.nose;
            saveState.currentMisc = outfit.misc;
            saveState.currentTail = outfit.tail;
        } else if (outfit.species) {
            // Migrate old outfit with species
            const speciesMapping = {
                cat: { ears: 'cat', eyes: 'standard', nose: 'cat', misc: 'none', tail: 'cat' },
                bunny: { ears: 'bunny', eyes: 'standard', nose: 'cat', misc: 'none', tail: 'bunny' },
                dog: { ears: 'dog', eyes: 'standard', nose: 'dog', misc: 'none', tail: 'dog' },
                bear: { ears: 'bear', eyes: 'standard', nose: 'bear', misc: 'none', tail: 'bear' },
                fox: { ears: 'fox', eyes: 'standard', nose: 'dog', misc: 'fox_cheeks', tail: 'fox' },
                pig: { ears: 'pig', eyes: 'standard', nose: 'pig', misc: 'none', tail: 'pig' },
                dragon: { ears: 'dragon', eyes: 'dragon', nose: 'dragon', misc: 'dragon_wings', tail: 'dragon' },
                mouse: { ears: 'mouse', eyes: 'standard', nose: 'mouse', misc: 'none', tail: 'mouse' },
                duck: { ears: 'none', eyes: 'standard', nose: 'duck', misc: 'none', tail: 'duck' },
                axolotl: { ears: 'none', eyes: 'standard', nose: 'axolotl', misc: 'axolotl_gills', tail: 'axolotl' },
                raccoon: { ears: 'raccoon', eyes: 'standard', nose: 'dog', misc: 'raccoon_mask', tail: 'raccoon' },
                koala: { ears: 'koala', eyes: 'standard', nose: 'koala', misc: 'none', tail: 'none' },
                lion: { ears: 'cat', eyes: 'standard', nose: 'cat', misc: 'lion_mane', tail: 'lion' },
                cow: { ears: 'cow', eyes: 'standard', nose: 'cow', misc: 'none', tail: 'cat' },
                frog: { ears: 'none', eyes: 'frog', nose: 'frog', misc: 'none', tail: 'frog' },
                monkey: { ears: 'monkey', eyes: 'standard', nose: 'monkey', misc: 'none', tail: 'monkey' },
                penguin: { ears: 'none', eyes: 'standard', nose: 'penguin', misc: 'penguin_belly', tail: 'penguin' },
            };
            const parts = speciesMapping[outfit.species] || speciesMapping.cat;
            saveState.currentEars = parts.ears;
            saveState.currentEyes = parts.eyes;
            saveState.currentNose = parts.nose;
            saveState.currentMisc = parts.misc;
            saveState.currentMisc = parts.misc;
            saveState.currentTail = parts.tail;
            saveState.currentHair = 'none'; // Default for legacy species
        } else {
            // Fallback
            saveState.currentHair = outfit.hair || 'none';
        }

        saveState.hairColor = outfit.hairColor || '';

        // Apply cosmetics
        saveState.currentHat = saveState.unlockedHats.includes(outfit.hat) ? outfit.hat : 'none';
        saveState.currentShirt = saveState.unlockedShirts.includes(outfit.shirt) ? outfit.shirt : 'none';
        saveState.currentPants = saveState.unlockedPants.includes(outfit.pants) ? outfit.pants : 'none';
        saveState.currentCollar = saveState.unlockedCollars.includes(outfit.collar) ? outfit.collar : 'none';
        saveState.currentRod = saveState.unlockedRods.includes(outfit.rod) ? outfit.rod : 'bamboo';
        saveState.currentTitle = saveState.unlockedTitles.includes(outfit.title) ? outfit.title : 'none';
        saveState.bodyPaint = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaint) : '');
        saveState.bodyPaintBack = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaintBack) : '');
        saveState.bodyPaintLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaintLeft) : '');
        saveState.bodyPaintRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaintRight) : '');
        saveState.bodyPaintHeadFront = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaintHeadFront) : '');
        saveState.bodyPaintHeadBack = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaintHeadBack) : '');
        saveState.bodyPaintHeadLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaintHeadLeft) : '');
        saveState.bodyPaintHeadRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaintHeadRight) : '');
        saveState.bodyPaintHeadTop = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaintHeadTop) : '');
        saveState.bodyPaintHeadBottom = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaintHeadBottom) : '');
        saveState.bodyPaintArmLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaintArmLeft) : '');
        saveState.bodyPaintArmRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaintArmRight) : '');
        saveState.bodyPaintLegLeft = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaintLegLeft) : '');
        saveState.bodyPaintLegRight = (typeof normalizeBodyPaint === 'function' ? normalizeBodyPaint(outfit.bodyPaintLegRight) : '');
        saveState.bodyPaintColor = (typeof normalizeBodyPaintColor === 'function' ? normalizeBodyPaintColor(outfit.bodyPaintColor) : '#ffffff');

        // Update UI
        populatePartSelectors();
        document.getElementById('fur-color-picker').value = saveState.catColor;
        document.getElementById('belly-color-picker').value = saveState.bellyColor;
        document.getElementById('eye-color-picker').value = saveState.eyeColor;

        // Update part color pickers
        if (document.getElementById('ears-color-picker')) document.getElementById('ears-color-picker').value = saveState.earsColor || saveState.catColor;
        if (document.getElementById('nose-color-picker')) document.getElementById('nose-color-picker').value = saveState.noseColor || saveState.catColor;
        if (document.getElementById('misc-color-picker')) document.getElementById('misc-color-picker').value = saveState.miscColor || saveState.catColor;
        if (document.getElementById('misc-color-picker')) document.getElementById('misc-color-picker').value = saveState.miscColor || saveState.catColor;
        if (document.getElementById('tail-color-picker')) document.getElementById('tail-color-picker').value = saveState.tailColor || saveState.catColor;
        if (document.getElementById('hair-color-picker')) document.getElementById('hair-color-picker').value = saveState.hairColor || '#ffffff';

        saveGame();
        updateLocalVisuals();
        renderShop();
        showToast(`Loaded: ${outfit.name}`);
    }

    window.deleteOutfit = function deleteOutfit(id) {
        if (confirm("Delete this outfit?")) {
            saveState.savedOutfits = saveState.savedOutfits.filter(o => o.id !== id);
            saveGame();
            renderOutfitList();
        }
    }

    const OUTFIT_SHARE_PREFIX='HF1-';
    const OUTFIT_SHARE_TEXT=['ears','eyes','nose','misc','tail','hat','shirt','pants','collar','rod','title','hair'];
    const OUTFIT_SHARE_COLORS=['color','belly','eye','earsColor','noseColor','miscColor','tailColor','handColor','footColor','tailAccentColor','hairColor'];
    const OUTFIT_SHARE_PAINT=['bodyPaint','bodyPaintBack','bodyPaintLeft','bodyPaintRight','bodyPaintHeadFront','bodyPaintHeadBack','bodyPaintHeadLeft','bodyPaintHeadRight','bodyPaintHeadTop','bodyPaintHeadBottom','bodyPaintArmLeft','bodyPaintArmRight','bodyPaintLegLeft','bodyPaintLegRight'];
    function utf8ToBase64(value){
        const bytes=new TextEncoder().encode(value);let binary='';
        for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    }
    function base64ToUtf8(value){
        let text=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
        while(text.length%4)text+='=';
        const binary=atob(text),bytes=new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }
    function textOr(value,fallback='none'){
        if(typeof value!=='string')return fallback;
        const clean=value.replace(/[\u0000-\u001f]/g,'').slice(0,64).trim();
        return clean||fallback;
    }
    function colorOr(value,fallback=''){
        return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():fallback;
    }
    function normalizeSharedOutfit(raw){
        if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid outfit');
        const outfit={id:Date.now(),name:textOr(raw.name,'Shared look').slice(0,12)};
        for(const key of OUTFIT_SHARE_TEXT)outfit[key]=textOr(raw[key],key==='eyes'?'standard':key==='nose'?'cat':key==='rod'?'bamboo':'none');
        for(const key of OUTFIT_SHARE_COLORS)outfit[key]=colorOr(raw[key],key==='color'?'#ff0000':key==='belly'?'#ffffff':key==='eye'?'#000000':'');
        for(const key of OUTFIT_SHARE_PAINT)outfit[key]=typeof normalizeBodyPaint==='function'?normalizeBodyPaint(raw[key]):'';
        outfit.bodyPaintColor=typeof normalizeBodyPaintColor==='function'?normalizeBodyPaintColor(raw.bodyPaintColor):'#ffffff';
        outfit.protogenLogo=globalThis.window?.ProtogenLogo?.normalize(raw.protogenLogo)||'';
        return outfit;
    }
    window.encodeOutfitShare=function encodeOutfitShare(outfit){
        const payload={version:1};
        for(const key of ['name',...OUTFIT_SHARE_TEXT,...OUTFIT_SHARE_COLORS,...OUTFIT_SHARE_PAINT,'bodyPaintColor','protogenLogo'])payload[key]=outfit?.[key];
        return OUTFIT_SHARE_PREFIX+utf8ToBase64(JSON.stringify(payload));
    };
    window.decodeOutfitShare=function decodeOutfitShare(code){
        if(typeof code!=='string'||!/^HF1-/.test(code.trim())||code.length>24000)throw Error('Invalid outfit code');
        return normalizeSharedOutfit(JSON.parse(base64ToUtf8(code.trim().slice(OUTFIT_SHARE_PREFIX.length))));
    };
    window.shareOutfit=function shareOutfit(id){
        const outfit=saveState.savedOutfits.find(o=>o.id===id);if(!outfit)return;
        const code=window.encodeOutfitShare(outfit),show=()=>prompt('Copy this outfit code:',code);
        if(navigator.clipboard?.writeText)navigator.clipboard.writeText(code).then(()=>showToast('Outfit code copied!'),show);
        else show();
    };
    window.importOutfitCode=function importOutfitCode(){
        const code=prompt('Paste an outfit code:');if(!code)return;
        try{
            if(saveState.savedOutfits.length>=10){showToast('Wardrobe full! Delete an outfit first.');return;}
            const outfit=window.decodeOutfitShare(code);
            saveState.savedOutfits.push(outfit);saveGame();renderOutfitList();window.CharacterStudio?.refresh?.();
            showToast('Outfit imported: '+outfit.name);
        }catch(error){showToast('That outfit code is not valid.');}
    };

    window.renderOutfitList = function renderOutfitList() {
        const container = document.getElementById('outfit-list');
        if (!container) return;
        container.innerHTML = '';

        if (saveState.savedOutfits.length === 0) {
            container.innerHTML = '<div style="color:var(--p-text-dim); text-align:center; font-size:15px; margin-top:20px;">No saved outfits.</div>';
            return;
        }

        saveState.savedOutfits.forEach(outfit => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.background = 'var(--p-face-2)';
            row.style.border = '2px solid var(--p-line)';
            row.style.borderRadius = '0';
            row.style.padding = '5px';
            row.style.gap = '5px';

            // Load Button (The Outfit Name)
            const btnLoad = document.createElement('button');
            btnLoad.className = 'btn-sm';
            btnLoad.style.flex = '1';
            btnLoad.style.textAlign = 'left';
            btnLoad.innerText = outfit.name;
            btnLoad.onclick = () => loadOutfit(outfit.id);

            // Share Button
            const btnShare = document.createElement('button');
            btnShare.className = 'btn-sm';
            btnShare.style.padding = '2px 8px';
            btnShare.innerText = 'Share';
            btnShare.onclick = () => shareOutfit(outfit.id);

            // Delete Button
            const btnDel = document.createElement('button');
            btnDel.className = 'btn-sm btn-danger';
            btnDel.style.padding = '2px 8px';
            btnDel.innerText = '×';
            btnDel.onclick = () => deleteOutfit(outfit.id);

            row.appendChild(btnLoad);
            row.appendChild(btnShare);
            row.appendChild(btnDel);
            container.appendChild(row);
        });
    }

    let shopMode = 'hats';

    /**
     * Updates the character preview canvases in the shop wardrobe sidebar.
     * Shows front and back views of the player's current outfit.
     */
    window.createCharacterThumbnail = function createCharacterThumbnail(values={},focus='full',width=96,height=128,scope='shop'){
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.className='character-thumbnail';canvas.setAttribute('aria-hidden','true');
        const fallback=()=>{const ctx=canvas.getContext('2d');ctx.clearRect(0,0,width,height);ctx.fillStyle='#9fc5db';ctx.font='bold '+Math.round(Math.min(width,height)*.3)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('◇',width/2,height/2);};
        try{
            const state={...saveState,...Object.fromEntries(Object.entries(values).filter(([,value])=>value!==undefined))};
            const cfg=characterCfgFromSave(state);
            if(window.CharacterThumbnails)window.CharacterThumbnails.request({canvas,cfg,focus,width,height,scope,build:c=>makeCharacterBody(c,'studio-thumbnail'),dispose:disposeCharacterBody,fallback});
            else fallback();
        }catch(error){fallback();}
        return canvas;
    };

    window.updateCharacterPreview = function updateCharacterPreview() {
        const previewState=window.ShopTryOn?.state(saveState)||saveState;
        if(window.__studioPaintUndress&&document.getElementById('character-studio')?.open){
            previewState.currentHat='none';previewState.currentShirt='none';previewState.currentPants='none';previewState.currentCollar='none';previewState.currentHair='none';
        }
        const shop=document.getElementById('shop-overlay'),solid=document.getElementById('preview-3d'),hint=document.getElementById('preview-3d-hint');
        if(!solid)return;
        const use3D=!!previewState.model3D&&(shop?.style.display==='flex'||!!document.getElementById('character-studio')?.open);
        solid.hidden=!use3D;
        if(hint){hint.hidden=!use3D;hint.textContent='Hold left click and drag to rotate';}
        if(use3D&&window.ShopCharacterPreview?.update(characterCfgFromSave(previewState),cfg=>makeCharacterBody(cfg,'player'),disposeCharacterBody))return;
        window.ShopCharacterPreview?.destroy();solid.hidden=true;
        if(hint){hint.hidden=false;hint.textContent='3D character preview unavailable';}
    }

    // ------------------------------------------------------------------
    // BOBBER SPRITES
    // Everything is authored on a 64x64 design grid and scaled by `u` so the
    // shop icon (64px) and the in-world billboard (128px) look identical.
    // Each bobber gets a dark outline + top light so it reads against water.
    // ------------------------------------------------------------------
    window.drawBobberIcon = function drawBobberIcon(ctx, type, size) {
        const u = size / 64;
        const OUT = '#0f1219';
        const c = (type.color >>> 0);
        const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
        const col = `rgb(${r},${g},${b})`;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const dark = `rgb(${(r * 0.5) | 0},${(g * 0.5) | 0},${(b * 0.5) | 0})`;
        const light = `rgb(${Math.min(255, r + 95)},${Math.min(255, g + 95)},${Math.min(255, b + 95)})`;
        const stemCol = lum < 70 ? '#cfd8e3' : dark;

        const X = v => v * u;
        const circ = (x, y, rad, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(X(x), X(y), X(rad), 0, Math.PI * 2); ctx.fill(); };
        const ring = (x, y, rad, fill, w) => { ctx.strokeStyle = fill; ctx.lineWidth = X(w); ctx.beginPath(); ctx.arc(X(x), X(y), X(rad), 0, Math.PI * 2); ctx.stroke(); };
        const elli = (x, y, rx, ry, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(X(x), X(y), X(rx), X(ry), 0, 0, Math.PI * 2); ctx.fill(); };
        const poly = (pts, fill) => { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(X(p[0]), X(p[1])) : ctx.moveTo(X(p[0]), X(p[1]))); ctx.closePath(); ctx.fill(); };
        const path = (pts) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(X(p[0]), X(p[1])) : ctx.moveTo(X(p[0]), X(p[1]))); ctx.closePath(); };
        const rdp = (x, y, w, h, rad) => {
            rad = Math.min(rad, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(X(x + rad), X(y));
            ctx.lineTo(X(x + w - rad), X(y));
            ctx.quadraticCurveTo(X(x + w), X(y), X(x + w), X(y + rad));
            ctx.lineTo(X(x + w), X(y + h - rad));
            ctx.quadraticCurveTo(X(x + w), X(y + h), X(x + w - rad), X(y + h));
            ctx.lineTo(X(x + rad), X(y + h));
            ctx.quadraticCurveTo(X(x), X(y + h), X(x), X(y + h - rad));
            ctx.lineTo(X(x), X(y + rad));
            ctx.quadraticCurveTo(X(x), X(y), X(x + rad), X(y));
            ctx.closePath();
        };
        const rrect = (x, y, w, h, rad, fill) => { rdp(x, y, w, h, rad); ctx.fillStyle = fill; ctx.fill(); };
        const spark = (x, y, s, fill) => {
            ctx.strokeStyle = fill; ctx.lineWidth = Math.max(1, X(1.6)); ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(X(x - s), X(y)); ctx.lineTo(X(x + s), X(y));
            ctx.moveTo(X(x), X(y - s)); ctx.lineTo(X(x), X(y + s));
            ctx.moveTo(X(x - s * 0.6), X(y - s * 0.6)); ctx.lineTo(X(x + s * 0.6), X(y + s * 0.6));
            ctx.moveTo(X(x + s * 0.6), X(y - s * 0.6)); ctx.lineTo(X(x - s * 0.6), X(y + s * 0.6));
            ctx.stroke();
        };

        // Shared 3D "fishing float" body (stem + ball + shading).
        const drawFloat = (bodyCol, stem, ballY, ballR) => {
            rrect(29.5, 8, 5, ballY - 12, 2.5, stem);
            circ(32, 7.5, 3.6, stem);
            circ(32, ballY, ballR + 2, OUT);
            circ(32, ballY, ballR, bodyCol);
            ctx.save();
            ctx.beginPath(); ctx.arc(X(32), X(ballY), X(ballR), 0, Math.PI * 2); ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,0.16)';               // lit top
            ctx.fillRect(0, 0, X(64), X(ballY));
            ctx.fillStyle = 'rgba(0,0,0,0.22)';                     // shaded bottom
            ctx.fillRect(0, X(ballY), X(64), X(64 - ballY));
            ctx.restore();
            circ(25, ballY - 8, 6.2, 'rgba(255,255,255,0.5)');
            circ(23, ballY - 10, 3, 'rgba(255,255,255,0.8)');
        };

        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const id = type.eventModel || type.id || '';
        const model = type.model || 'sphere';

        const newDesigns=['mushroom','cork','pencil','lantern','acorn','apple','orange_fruit','watermelon','lemon','lime','donut','lifering','buoy','bottle','jellyfish','octopus','turtle','koi','rocket','ufo'];
        if(newDesigns.includes(id)){
            const cream='#fff4dd',eyes=(x,y)=>{circ(32-x,y,2,OUT);circ(32+x,y,2,OUT);};
            switch(id){
                case 'mushroom':rrect(25,30,14,25,4,cream);elli(32,28,25,14,col);for(const x of [19,32,45])circ(x,24,3,cream);break;
                case 'cork':rrect(21,13,22,43,4,col);rrect(20,27,24,4,1,dark);break;
                case 'pencil':rrect(27,15,10,39,1,col);poly([[27,15],[32,4],[37,15]],'#e8c18f');circ(32,6,2,OUT);rrect(27,51,10,7,1,'#f19cac');break;
                case 'lantern':rrect(17,21,30,31,2,col);for(const x of [17,43])rrect(x,20,4,34,0,OUT);poly([[13,22],[32,9],[51,22]],OUT);ring(32,8,5,OUT,2);break;
                case 'acorn':elli(32,37,17,21,col);elli(32,23,21,9,'#68452b');rrect(30,8,4,12,1,'#4e3524');break;
                case 'apple':case 'orange_fruit':case 'lemon':case 'lime':case 'watermelon':
                    elli(32,36,id==='lemon'?25:21,21,col);
                    if(id==='watermelon'){for(const x of [22,32,42])elli(x,36,2,18,'#2b6338');}
                    else{rrect(30,9,4,9,0,'#664129');elli(39,12,8,3,'#52873f');}break;
                case 'donut':ring(32,35,18,col,13);ring(32,32,18,'#ff9fc9',8);for(const x of [19,32,45])rrect(x,22,3,5,0,'#ffe175');break;
                case 'lifering':ring(32,35,19,cream,11);for(const x of [10,44])rrect(x,31,10,8,1,col);rrect(28,13,8,10,1,col);rrect(28,47,8,10,1,col);break;
                case 'buoy':poly([[13,55],[21,28],[43,28],[51,55]],col);rrect(28,11,8,23,1,cream);rrect(24,9,16,5,1,col);break;
                case 'bottle':rrect(20,26,24,31,5,col);rrect(27,12,10,19,2,col);rrect(27,7,10,7,1,'#b48552');rrect(24,34,16,15,1,cream);break;
                case 'jellyfish':for(const x of [17,27,37,47])rrect(x,34,3,23,1,'#d8a4f5');elli(32,29,24,20,col);eyes(8,30);break;
                case 'octopus':for(let i=0;i<8;i++)elli(10+i*6,48,5,9,col);elli(32,29,21,23,col);eyes(8,30);break;
                case 'turtle':for(const x of [10,54])for(const y of [26,48])elli(x,y,8,4,'#82b765');elli(32,35,22,19,col);circ(32,11,8,'#82b765');break;
                case 'koi':poly([[23,47],[14,59],[48,59],[40,47]],col);elli(32,31,16,23,cream);elli(34,26,10,9,col);eyes(8,15);break;
                case 'rocket':poly([[18,43],[10,57],[24,52]],'#4d6da4');poly([[46,43],[54,57],[40,52]],'#4d6da4');rrect(23,19,18,35,5,col);poly([[23,21],[32,4],[41,21]],cream);circ(32,30,6,'#77d9f1');break;
                case 'ufo':elli(32,28,13,14,'#81dbd8');elli(32,39,27,10,col);for(const x of [15,26,38,49])circ(x,40,2,'#ffef99');break;
            }
        }
        else if (id === 'duck') {
            elli(32, 56, 15, 3.5, 'rgba(0,0,0,0.14)');                    // water shadow
            poly([[26, 41], [15, 33], [27, 48]], OUT);                    // tail
            poly([[26.5, 42], [17.5, 35], [27, 47]], '#ffd400');
            elli(40, 44, 18, 13, OUT);                                    // body
            elli(40, 44, 16, 11.2, '#ffd400');
            elli(43, 45, 7.5, 6, '#ffc400');                              // wing
            circ(29, 25, 12, OUT);                                        // head
            circ(29, 25, 10.4, '#ffd400');
            poly([[20, 22], [7, 25.5], [20, 29]], OUT);                   // beak
            poly([[19.5, 23], [9.5, 25.5], [19.5, 28]], '#ff9f1a');
            circ(26, 22, 2.6, '#141922');                                 // eye
            circ(27, 20.6, 0.9, '#ffffff');
        }
        else if (model === 'cube') {
            const top = [[32, 15], [50, 25], [32, 35], [14, 25]];
            const left = [[14, 25], [32, 35], [32, 56], [14, 46]];
            const right = [[50, 25], [32, 35], [32, 56], [50, 46]];
            poly(top, light); poly(left, col); poly(right, dark);
            ctx.strokeStyle = OUT; ctx.lineWidth = X(2.4);
            path(top); ctx.stroke(); path(left); ctx.stroke(); path(right); ctx.stroke();
            poly([[32, 18], [45.5, 25.5], [32, 33], [18.5, 25.5]], 'rgba(255,255,255,0.18)');
        }
        else if (model === 'heart') {
            const s = 17, hx = 32, hy = 37;
            const p = (px, py) => [hx + px * s, hy + py * s];
            const heart = () => {
                ctx.beginPath();
                const a = p(0, 0.92);
                ctx.moveTo(X(a[0]), X(a[1]));
                const c1 = p(-1.45, -0.15), c2 = p(-0.95, -1.28), c3 = p(0, -0.48);
                const c4 = p(0.95, -1.28), c5 = p(1.45, -0.15);
                ctx.bezierCurveTo(X(c1[0]), X(c1[1]), X(c2[0]), X(c2[1]), X(c3[0]), X(c3[1]));
                ctx.bezierCurveTo(X(c4[0]), X(c4[1]), X(c5[0]), X(c5[1]), X(a[0]), X(a[1]));
                ctx.closePath();
            };
            heart();
            ctx.strokeStyle = OUT; ctx.lineWidth = X(3.4); ctx.stroke();
            ctx.fillStyle = col; ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.beginPath(); ctx.ellipse(X(24), X(28), X(4), X(6), -0.5, 0, Math.PI * 2); ctx.fill();
        }
        else if (model === 'star') {
            const pts = [];
            for (let i = 0; i < 10; i++) {
                const a = -Math.PI / 2 + i * Math.PI / 5;
                const rr = i % 2 ? 8.4 : 20;
                pts.push([32 + Math.cos(a) * rr, 37 + Math.sin(a) * rr]);
            }
            path(pts);
            ctx.strokeStyle = OUT; ctx.lineWidth = X(3.2); ctx.stroke();
            ctx.fillStyle = col; ctx.fill();
            circ(28, 29, 2.6, 'rgba(255,255,255,0.55)');
        }
        else if (model === 'skull') {
            circ(32, 31, 18, OUT); circ(32, 31, 16, '#e9edf2');           // cranium
            rrect(22, 42, 20, 12, 5, OUT);
            rrect(23.2, 43.2, 17.6, 9.6, 4, '#e9edf2');                   // jaw
            circ(25, 30, 6, OUT); circ(25, 30, 5, '#141922');             // sockets
            circ(39, 30, 6, OUT); circ(39, 30, 5, '#141922');
            poly([[32, 33.5], [28.8, 40], [35.2, 40]], OUT);              // nose
            ctx.strokeStyle = OUT; ctx.lineWidth = X(1.5);
            [28, 32, 36].forEach(x => { ctx.beginPath(); ctx.moveTo(X(x), X(43)); ctx.lineTo(X(x), X(51)); ctx.stroke(); });
            circ(25, 22, 4, 'rgba(255,255,255,0.55)');
        }
        else if (id === 'pumpkin') {
            rrect(29.5, 14, 5, 9, 2, '#4f7a26');                          // stem
            circ(32, 39, 20, OUT); circ(32, 39, 18, '#ff8a1e');
            ctx.strokeStyle = 'rgba(150,64,0,0.5)'; ctx.lineWidth = X(1.7);
            [[25, 4.5], [32, 5.8], [39, 4.5]].forEach(e => {
                ctx.beginPath(); ctx.ellipse(X(e[0]), X(39), X(e[1]), X(17), 0, 0, Math.PI * 2); ctx.stroke();
            });
            circ(24, 31, 5, 'rgba(255,255,255,0.35)');
        }
        else if (id === 'bomb') {
            ctx.strokeStyle = '#c9a227'; ctx.lineWidth = X(3);            // fuse
            ctx.beginPath(); ctx.moveTo(X(33), X(22)); ctx.quadraticCurveTo(X(41), X(9), X(48), X(13)); ctx.stroke();
            spark(48, 12, 4.5, '#ff8a1e');
            circ(48.5, 12.5, 2.6, '#ffe08a');
            rrect(28.5, 20, 7, 9, 2.5, OUT); rrect(29.6, 21, 4.8, 7.5, 2, '#4a5058'); // neck
            circ(32, 41, 18, OUT); circ(32, 41, 16.3, col);
            ring(32, 41, 16.3, 'rgba(255,255,255,0.28)', 1.4);
            circ(25, 34, 5, 'rgba(255,255,255,0.22)');
        }
        else if (id === 'gold') {
            rrect(29.5, 8, 5, 16, 2.5, '#8a6d1f');
            circ(32, 7.5, 3.6, '#ffe08a');
            circ(32, 37, 20, OUT); circ(32, 37, 18, '#ffd23f');
            const grad = ctx.createRadialGradient(X(26), X(30), X(1), X(30), X(34), X(26));
            grad.addColorStop(0, 'rgba(255,255,255,0.85)');
            grad.addColorStop(0.35, 'rgba(255,240,150,0.35)');
            grad.addColorStop(1, 'rgba(120,80,0,0.35)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(X(32), X(37), X(17.6), 0, Math.PI * 2); ctx.fill();
            ring(32, 37, 18, 'rgba(255,255,255,0.55)', 1.4);
            spark(19, 48, 4.5, '#fff3b0');
            spark(46, 24, 3.4, '#fff3b0');
        }
        else {
            // Classic fishing float (all the solid-colour bobbers)
            drawFloat(col, stemCol, 37, 18);
            if (lum < 70) ring(32, 37, 18, 'rgba(255,255,255,0.32)', 1.4);
        }

        ctx.restore();
    }

    function appendEventShopBadge(entry,item){
        if(!item.event)return;
        const badge=document.createElement('span');badge.className='shop-event-badge';
        badge.textContent=item.event==='hollowtide2026'?'Hollowtide 2026':'Limited edition';
        entry.appendChild(badge);
    }

    window.filterShopItems = function filterShopItems() {
        window.ShopTryOn?.clear();
        const container=document.getElementById('shop-container');
        const query=document.getElementById('shop-search').value.trim().toLowerCase();
        const filter=document.getElementById('shop-filter').value;
        const entries=Array.from(container.querySelectorAll('.grid-entry'));
        let shown=0;
        entries.forEach(entry=>{
            const button=entry.querySelector('button');
            const action=(button?.textContent||button?.innerText||'').trim().toLowerCase();
            const owned=entry.classList.contains('selected')||/^(equip|equipped|owned|unequip|selected|use|remove)$/.test(action);
            entry.dataset.owned=String(owned);
            const matches=entry.textContent.toLowerCase().includes(query)&&(filter==='all'||(filter==='owned'?owned:!owned));
            entry.hidden=!matches;if(matches)shown++;
        });
        document.getElementById('shop-results').textContent=shown+' of '+entries.length+' items';
        document.getElementById('shop-empty').hidden=shown!==0;
    };

    window.renderShop = function renderShop() {
        window.ShopTryOn?.clear(false);
        window.CharacterThumbnails?.cancel?.('shop');
        const container = document.getElementById('shop-container');
        container.innerHTML = '';

        // Populate part dropdowns
        populatePartSelectors();

        // --- NAVIGATION TABS ---
        const navDiv = document.getElementById('shop-categories');
        navDiv.replaceChildren();
        document.getElementById('shop-balance').textContent='$'+Number(saveState.money||0).toLocaleString();
        const createTab=(id,label)=>{
            const btn=document.createElement('button');
            btn.type='button';btn.className='shop-category';btn.textContent=label;
            btn.setAttribute('aria-pressed',String(shopMode===id));
            btn.onclick=()=>{shopMode=id;renderShop();};navDiv.appendChild(btn);
        };
        createTab('hats','Hats');createTab('shirts','Shirts');createTab('pants','Pants');createTab('collars','Collars');
        createTab('titles','Titles');createTab('rods','Rods');
        createTab('bobbers','Bobbers');createTab('emotes','Emotes');createTab('misc','Tools & extras');

        // --- COLLAR TAB ---
        if(shopMode==='emotes'){window.Emotes?.renderShopItems(container);}
        else if(shopMode==='pants'){
            for(const item of PANTS_TYPES.filter(item=>!item.event||saveState.unlockedPants.includes(item.id)).sort((a,b)=>a.price-b.price)){
                const entry=document.createElement('div'),owned=saveState.unlockedPants.includes(item.id),equipped=saveState.currentPants===item.id;
                entry.className='grid-entry'+(equipped?' selected':'');
                window.ShopTryOn?.bind(entry,{pants:item.id},item.name);
                entry.appendChild(window.createCharacterThumbnail({currentPants:item.id},'full',96,128,'shop'));
                const name=document.createElement('strong');name.textContent=item.name;entry.appendChild(name);
                appendEventShopBadge(entry,item);
                const button=document.createElement('button');button.textContent=equipped?'Equipped':owned?'Equip':'$'+item.price.toLocaleString();button.disabled=equipped;button.onclick=()=>selectPants(item.id);entry.appendChild(button);container.appendChild(entry);
            }
            if(window.Halloween?.active()){const note=document.createElement('p');note.className='item-desc';note.textContent='Matching Hollowtide pants are available from Morrow for Soul Embers through November 8. Once unlocked, equip them here any time.';container.appendChild(note);}
        }
        else if (shopMode === 'collars') {
            const sortedCollars = COLLAR_TYPES.filter(item=>!item.event||saveState.unlockedCollars.includes(item.id)).sort((a, b) => a.price - b.price);
            sortedCollars.forEach(item => {
                const entry = document.createElement('div');
                const isOwned = saveState.unlockedCollars.includes(item.id);
                const isEquipped = saveState.currentCollar === item.id;
                entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';
                window.ShopTryOn?.bind(entry,{collar:item.id},item.name);
                appendEventShopBadge(entry,item);

                entry.appendChild(window.createCharacterThumbnail({currentCollar:item.id},'full',96,128,'shop'));

                const name = document.createElement('div');
                name.style.fontWeight = 'bold'; name.innerText = item.name;
                entry.appendChild(name);

                const btn = document.createElement('button');
                if (isEquipped) {
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
                    btn.style.color = saveState.money >= item.price ? 'var(--p-good)' : 'var(--p-bad)';
                    btn.onclick = () => {
                        if (saveState.money >= item.price) {
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
            const sortedShirts = SHIRT_TYPES.filter(item=>!item.event||saveState.unlockedShirts.includes(item.id)).sort((a, b) => a.price - b.price);
            sortedShirts.forEach(shirt => {
                const entry = document.createElement('div');
                const isOwned = saveState.unlockedShirts.includes(shirt.id);
                const isEquipped = saveState.currentShirt === shirt.id;
                entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';
                window.ShopTryOn?.bind(entry,{shirt:shirt.id},shirt.name);
                appendEventShopBadge(entry,shirt);

                entry.appendChild(window.createCharacterThumbnail({currentShirt:shirt.id},'full',96,128,'shop'));

                const name = document.createElement('div');
                name.style.fontWeight = 'bold'; name.innerText = shirt.name;
                entry.appendChild(name);

                const btn = document.createElement('button');
                if (isEquipped) { btn.innerText = "Equipped"; btn.disabled = true; }
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
                    btn.style.color = saveState.money >= shirt.price ? 'var(--p-good)' : 'var(--p-bad)';
                    btn.onclick = () => {
                        if (saveState.money >= shirt.price) {
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
            const sortedHats = HAT_TYPES.filter(item=>!item.event||saveState.unlockedHats.includes(item.id)).sort((a, b) => a.price - b.price);
            sortedHats.forEach(hat => {
                const entry = document.createElement('div');
                const isOwned = saveState.unlockedHats.includes(hat.id);
                const isEquipped = saveState.currentHat === hat.id;
                entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';
                window.ShopTryOn?.bind(entry,{hat:hat.id},hat.name);
                appendEventShopBadge(entry,hat);

                entry.appendChild(window.createCharacterThumbnail({currentHat:hat.id},'head',96,128,'shop'));

                const name = document.createElement('div');
                name.style.fontWeight = 'bold'; name.innerText = hat.name;
                entry.appendChild(name);

                const btn = document.createElement('button');
                if (isEquipped) { btn.innerText = "Equipped"; btn.disabled = true; }
                else if (isOwned) { btn.innerText = "Equip"; btn.onclick = () => equipHat(hat.id); }
                else {
                    btn.innerText = `$${hat.price}`;
                    btn.style.color = saveState.money >= hat.price ? 'var(--p-good)' : 'var(--p-bad)';
                    btn.onclick = () => buyHat(hat);
                }
                entry.appendChild(btn);
                container.appendChild(entry);
            });
        }

        // --- RODS TAB ---
        else if (shopMode === 'rods') {
            const uniqueFishCount = (typeof countDiscoveredSpecies === 'function')
                ? countDiscoveredSpecies(saveState.journal)
                : Object.keys(saveState.journal).length;
            const sortedRods = ROD_TYPES.filter(item=>!item.event||saveState.unlockedRods.includes(item.id)).sort((a, b) => {
                if (a.price === b.price) return (a.unlockCount || 0) - (b.unlockCount || 0);
                return a.price - b.price;
            });

            sortedRods.forEach(item => {
                const entry = document.createElement('div');
                const isOwned = saveState.unlockedRods.includes(item.id);
                const isEquipped = saveState.currentRod === item.id;
                entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';
                appendEventShopBadge(entry,item);

                const canvas = document.createElement('canvas');
                canvas.width = 64; canvas.height = 94;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.translate(0, 24);
                const rodTex = createRodTexture(item.id);
                ctx.drawImage(rodTex.image, 0, 0);
                entry.appendChild(canvas);

                const name = document.createElement('div');
                name.style.fontWeight = 'bold'; name.innerText = item.name;
                entry.appendChild(name);

                const btn = document.createElement('button');

                if (isEquipped) {
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
                            btn.style.color = 'var(--p-gold)';
                            btn.onclick = () => {
                                saveState.unlockedRods.push(item.id);
                                Sound.sell();
                                saveGame();
                                renderShop();
                                showToast(`Unlocked ${item.name}!`);
                            };
                        } else {
                            btn.innerText = `Need ${item.unlockCount} Fish`;
                            btn.style.fontSize = '15px';
                            btn.style.color = 'var(--p-text-dim)';
                            btn.disabled = true;
                            const prog = document.createElement('div');
                            prog.style.fontSize = '14px'; prog.style.color = 'var(--p-text-mute)';
                            prog.innerText = `(${uniqueFishCount} / ${item.unlockCount})`;
                            entry.appendChild(prog);
                        }
                    } else {
                        btn.innerText = `$${item.price}`;
                        btn.style.color = saveState.money >= item.price ? 'var(--p-good)' : 'var(--p-bad)';
                        btn.onclick = () => {
                            if (saveState.money >= item.price) {
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
            const sortedTitles = TITLE_TYPES.filter(item=>!item.event||saveState.unlockedTitles.includes(item.id)).sort((a, b) => a.price - b.price);
            sortedTitles.forEach(title => {
                const entry = document.createElement('div');
                const isOwned = saveState.unlockedTitles.includes(title.id);
                const isEquipped = saveState.currentTitle === title.id;
                entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';
                window.ShopTryOn?.bind(entry,{},title.name||title.text||'No title',title.id==='none'?null:title);
                appendEventShopBadge(entry,title);
                const preview = document.createElement('div');
                preview.innerText = `< ${title.text || "No Title"} >`;
                preview.style.color = title.color || '#87CEEB';
                preview.style.fontWeight = 'bold';
                entry.appendChild(preview);
                const btn = document.createElement('button');
                if (isEquipped) { btn.innerText = "Equipped"; btn.disabled = true; }
                else if (isOwned) {
                    btn.innerText = "Equip";
                    btn.onclick = () => { saveState.currentTitle = title.id; saveGame(); updateLocalVisuals(); renderShop(); };
                } else if (title.collection) { btn.innerText="Complete fishing collection"; btn.disabled=true; } else {
                    btn.innerText = `$${title.price}`;
                    btn.onclick = () => { if (saveState.money >= title.price) { saveState.money -= title.price; saveState.unlockedTitles.push(title.id); Sound.sell(); saveGame(); renderShop(); } else showToast("Not enough money!"); };
                }
                entry.appendChild(btn);
                container.appendChild(entry);
            });
        }



        // --- BOBBERS TAB ---
        else if (shopMode === 'bobbers') {
            const sortedBobbers = BOBBER_TYPES.filter(item=>!item.event||saveState.unlockedBobbers.includes(item.id)).sort((a, b) => a.price - b.price);
            sortedBobbers.forEach(item => {
                const entry = document.createElement('div');
                const isOwned = saveState.unlockedBobbers.includes(item.id);
                const isEquipped = saveState.currentBobber === item.id;
                entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';
                appendEventShopBadge(entry,item);

                const canvas = document.createElement('canvas');
                canvas.width = 64; canvas.height = 64;
                const ctx = canvas.getContext('2d');

                // Draw Preview
                drawBobberIcon(ctx, item, 64);

                entry.appendChild(canvas);

                const name = document.createElement('div');
                name.style.fontWeight = 'bold'; name.innerText = item.name;
                entry.appendChild(name);

                const btn = document.createElement('button');
                if (isEquipped) {
                    btn.innerText = "Equipped";
                    btn.disabled = true;
                } else if (isOwned) {
                    btn.innerText = "Equip";
                    btn.onclick = () => {
                        saveState.currentBobber = item.id;
                        saveGame();
                        updateLocalVisuals();
                        renderShop();
                    };
                } else {
                    btn.innerText = `$${item.price}`;
                    btn.style.color = saveState.money >= item.price ? 'var(--p-good)' : 'var(--p-bad)';
                    btn.onclick = () => {
                        if (saveState.money >= item.price) {
                            saveState.money -= item.price;
                            saveState.unlockedBobbers.push(item.id);
                            Sound.sell();
                            saveGame();
                            renderShop();
                        } else showToast("Not enough money!");
                    };
                }
                entry.appendChild(btn);
                container.appendChild(entry);
            });
        } else if (shopMode === 'misc') {
            // --- 1. GUITAR ---
            const guitarDiv = document.createElement('div');
            guitarDiv.className = 'grid-entry';
            const hasGuitar = saveState.unlockedTools.includes('guitar');
            const guitarTool = TOOLS.find(t => t.id === 'guitar') || { price: 1000 };

            const gTitle = document.createElement('div');
            gTitle.innerHTML = (window.PX ? PX.icon('guitar', 16) : '') + " <b>Acoustic Guitar</b>";
            guitarDiv.appendChild(gTitle);

            const gDesc = document.createElement('div');
            gDesc.className = 'item-desc';
            gDesc.innerText = "Play music! Full MIDI support.";
            guitarDiv.appendChild(gDesc);

            if (hasGuitar) {
                const btn = document.createElement('button');
                btn.innerText = "Owned";
                btn.disabled = true;
                guitarDiv.appendChild(btn);
            } else {
                const btn = document.createElement('button');
                const price = guitarTool.price;
                btn.innerText = `Buy ($${price})`;
                btn.style.color = saveState.money >= price ? 'var(--p-good)' : 'var(--p-bad)';
                btn.onclick = () => actionBuyTool('guitar');
                guitarDiv.appendChild(btn);
            }
            container.appendChild(guitarDiv);

            // --- 2. WOODCUTTER'S AXE ---
            const axeDiv = document.createElement('div');
            axeDiv.className = 'grid-entry';
            const hasAxe = saveState.unlockedTools.includes('axe');
            const axeTool = TOOLS.find(t => t.id === 'axe') || { price: 500 };

            const aTitle = document.createElement('div');
            aTitle.innerHTML = (window.PX ? PX.icon('axe', 16) : '') + " <b>Woodcutter's Axe</b>";
            axeDiv.appendChild(aTitle);

            const aDesc = document.createElement('div');
            aDesc.className = 'item-desc';
            aDesc.innerText = "Chop trees for wood.";
            axeDiv.appendChild(aDesc);

            if (hasAxe) {
                const btn = document.createElement('button');
                btn.innerText = "Owned";
                btn.disabled = true;
                axeDiv.appendChild(btn);
            } else {
                const btn = document.createElement('button');
                const price = axeTool.price;
                btn.innerText = `Buy ($${price})`;
                btn.style.color = saveState.money >= price ? 'var(--p-good)' : 'var(--p-bad)';
                btn.onclick = () => actionBuyTool('axe');
                axeDiv.appendChild(btn);
            }
            container.appendChild(axeDiv);

            // --- 3. PVP GLOVE ---
            const gloveDiv = document.createElement('div');
            gloveDiv.className = 'grid-entry';
            const hasGlove = saveState.unlockedTools.includes('glove');
            const gloveTool = TOOLS.find(t => t.id === 'glove') || { price: 1000 };

            const glTitle = document.createElement('div');
            glTitle.innerHTML = (window.PX ? PX.icon('glove', 16) : '') + " <b>PvP Glove</b>";
            gloveDiv.appendChild(glTitle);

            const glDesc = document.createElement('div');
            glDesc.className = 'item-desc';
            glDesc.innerText = "Punch other players!";
            gloveDiv.appendChild(glDesc);

            if (hasGlove) {
                const btn = document.createElement('button');
                btn.innerText = "Owned";
                btn.disabled = true;
                gloveDiv.appendChild(btn);
            } else {
                const btn = document.createElement('button');
                const price = gloveTool.price;
                btn.innerText = `Buy ($${price})`;
                btn.style.color = saveState.money >= price ? 'var(--p-good)' : 'var(--p-bad)';
                btn.onclick = () => actionBuyTool('glove');
                gloveDiv.appendChild(btn);
            }
            container.appendChild(gloveDiv);

            // --- 4. PICKAXE ---
            const pickDiv = document.createElement('div');
            pickDiv.className = 'grid-entry';
            const hasPick = saveState.unlockedTools.includes('pickaxe');
            const pickTool = TOOLS.find(t => t.id === 'pickaxe') || { price: 800 };

            const pTitle = document.createElement('div');
            pTitle.innerHTML = (window.PX ? PX.icon('pickaxe', 16) : '') + " <b>Pickaxe</b>";
            pickDiv.appendChild(pTitle);

            const pDesc = document.createElement('div');
            pDesc.className = 'item-desc';
            pDesc.innerText = "Mine rocks for stone.";
            pickDiv.appendChild(pDesc);

            if (hasPick) {
                const btn = document.createElement('button');
                btn.innerText = "Owned";
                btn.disabled = true;
                pickDiv.appendChild(btn);
            } else {
                const btn = document.createElement('button');
                const price = pickTool.price;
                btn.innerText = `Buy ($${price})`;
                btn.style.color = saveState.money >= price ? 'var(--p-good)' : 'var(--p-bad)';
                btn.onclick = () => actionBuyTool('pickaxe');
                pickDiv.appendChild(btn);
            }
            container.appendChild(pickDiv);

            // --- 5. ROWBOAT (Sailing) ---
            const boatDiv = document.createElement('div');
            boatDiv.className = 'grid-entry';
            const boatTool = TOOLS.find(t => t.id === 'boat') || { price: 2500 };

            if(window.Rowboat3D){
                const preview=Rowboat3D.thumbnail();
                if(preview){const image=document.createElement('img');image.src=preview;image.alt='3D wooden rowboat with paired oars';image.style.cssText='display:block;width:100%;max-width:280px;height:140px;object-fit:contain;margin:0 auto 8px;';boatDiv.appendChild(image);}
            }
            const bTitle = document.createElement('div');
            bTitle.innerHTML = (window.PX ? PX.icon('boat', 16) : '') + " <b>Rowboat</b>";
            boatDiv.appendChild(bTitle);

            const bDesc = document.createElement('div');
            bDesc.className = 'item-desc';
            bDesc.innerText = "Launch from the lake to sail open water.";
            boatDiv.appendChild(bDesc);

            if (saveState.hasBoat) {
                const btn = document.createElement('button');
                btn.innerText = "Owned";
                btn.disabled = true;
                boatDiv.appendChild(btn);
            } else {
                const btn = document.createElement('button');
                const price = boatTool.price;
                btn.innerText = `Buy ($${price})`;
                btn.style.color = saveState.money >= price ? 'var(--p-good)' : 'var(--p-bad)';
                btn.onclick = () => actionBuyTool('boat');
                boatDiv.appendChild(btn);
            }
            container.appendChild(boatDiv);
        }

        filterShopItems();

        // --- IMPORTANT: RENDER OUTFITS EVERY TIME SHOP UPDATES ---
        renderOutfitList();

        // Update the character preview canvases
        updateCharacterPreview();
    }

    function renderBaitShop() {
        const container = document.getElementById('bait-shop-container');
        container.innerHTML = '';

        // --- 1. RENDER STABILIZER (formerly Auto-Reel) UPGRADE ---
        const lvl = saveState.autoReelLevel;
        const maxLvl = AUTO_CLICK_RATES.length - 1;

        const upgradeDiv = document.createElement('div');
        upgradeDiv.className = 'grid-entry';
        upgradeDiv.style.borderColor = 'var(--p-water)';

        const upTitle = document.createElement('div');
        upTitle.innerHTML = `<b>Stabilizer v${lvl}</b>`;
        upgradeDiv.appendChild(upTitle);

        const upDesc = document.createElement('div');
        upDesc.style.fontSize = '15px';
        upDesc.style.margin = '5px 0';
        if (lvl < maxLvl) {
            upDesc.innerHTML = "Reduces bar drain.<br>Makes catching safer.";
        } else {
            upDesc.innerHTML = "Max Level.<br>Perfect stability!";
        }
        upgradeDiv.appendChild(upDesc);

        if (lvl < maxLvl) {
            const cost = AUTO_CLICK_PRICES[lvl];
            const btn = document.createElement('button');
            btn.innerText = `Upgrade ($${cost})`;
            btn.style.marginTop = 'auto';
            btn.style.color = saveState.money >= cost ? 'var(--p-good)' : 'var(--p-bad)';
            btn.onclick = () => buyAutoReelUpgrade(cost);
            upgradeDiv.appendChild(btn);
        } else {
            const lbl = document.createElement('div');
            lbl.innerText = "MAXED";
            lbl.style.color = 'var(--p-gold)';
            lbl.style.marginTop = 'auto';
            upgradeDiv.appendChild(lbl);
        }
        container.appendChild(upgradeDiv);

        // --- 2. RENDER BAR SIZE (formerly Click Power) UPGRADE ---
        const cMax = FISHING_BAR_BONUSES.length - 1;
        const cLvl = Math.max(0,Math.min(cMax,Math.floor(Number(saveState.clickPowerLevel)||0)));
        const skillLevel = getLevelFromXP(saveState.skills?.fishing?.xp||0);
        const currentSize = fishingBarSize(cLvl,skillLevel).toFixed(1);
        const nextSize = fishingBarSize(cLvl+1,skillLevel).toFixed(1);

        const pDiv = document.createElement('div');
        pDiv.className = 'grid-entry';
        pDiv.style.borderColor = 'var(--p-sand)';

        const pTitle = document.createElement('div');
        pTitle.innerHTML = `<b>Bar Size v${cLvl}</b>`;
        pDiv.appendChild(pTitle);

        const pDesc = document.createElement('div');
        pDesc.style.fontSize = '15px';
        pDesc.style.margin = '5px 0';
        if (cLvl < cMax) {
            pDesc.innerHTML = `Green zone: ${currentSize}% → ${nextSize}%<br>Before fish rarity modifiers.`;
        } else {
            pDesc.innerHTML = `Green zone: ${currentSize}%<br>All bar upgrades owned.`;
        }
        pDiv.appendChild(pDesc);

        if (cLvl < cMax) {
            const cost = CLICK_POWER_PRICES[cLvl];
            const btn = document.createElement('button');
            btn.innerText = `Upgrade ($${cost})`;
            btn.style.marginTop = 'auto';
            btn.style.color = saveState.money >= cost ? 'var(--p-good)' : 'var(--p-bad)';
            btn.onclick = () => buyClickPowerUpgrade();
            pDiv.appendChild(btn);
        } else {
            const lbl = document.createElement('div');
            lbl.innerText = "MAXED";
            lbl.style.color = 'var(--p-gold)';
            lbl.style.marginTop = 'auto';
            pDiv.appendChild(lbl);
        }
        container.appendChild(pDiv);

        // --- 2. RENDER BAITS ---
        const uniqueCount = (typeof countDiscoveredSpecies === 'function')
            ? countDiscoveredSpecies(saveState.journal)
            : Object.keys(saveState.journal).length;

        BAIT_TYPES.forEach(bait => {
            if (bait.id === 'none') return;

            const entry = document.createElement('div');
            entry.className = 'grid-entry';

            // Name
            const name = document.createElement('div');
            name.style.fontWeight = 'bold';
            name.innerText = bait.name;
            entry.appendChild(name);

            // Stats
            const info = document.createElement('div');
            info.style.fontSize = '15px';
            info.style.color = 'var(--p-text-dim)';
            info.innerText = `Pwr: ${bait.power} | Luck: ${bait.rarityMult}x`;
            entry.appendChild(info);

            // Lock Logic
            const locked = uniqueCount < bait.unlockFish;

            if (locked) {
                // Locked UI
                const overlay = document.createElement('div');
                overlay.style.color = 'var(--p-bad)';
                overlay.style.fontWeight = 'bold';
                overlay.style.marginTop = '10px';
                overlay.style.fontSize = '15px';
                overlay.innerText = `Locked - Need ${bait.unlockFish} Fish`;
                entry.appendChild(overlay);

                // Add progress text
                const progress = document.createElement('div');
                progress.style.fontSize = '14px';
                progress.style.color = 'var(--p-text-mute)';
                progress.innerText = `(${uniqueCount} / ${bait.unlockFish})`;
                entry.appendChild(progress);
            } else {
                // Unlocked UI
                const btn = document.createElement('button');
                const cost = bait.price;
                btn.innerText = `Buy 10 ($${cost})`;
                btn.style.marginTop = '8px';
                btn.style.color = saveState.money >= cost ? 'var(--p-good)' : 'var(--p-bad)';
                btn.onclick = () => buyBait(bait);
                entry.appendChild(btn);
            }

            // Owned Count
            const owned = document.createElement('div');
            owned.style.fontSize = '15px';
            owned.style.marginTop = '5px';
            owned.style.color = 'var(--p-text)';
            owned.innerText = `Owned: ${saveState.baitInventory[bait.id] || 0}`;
            entry.appendChild(owned);

            container.appendChild(entry);
        });
    }

    window.toggleEmptyHands = function () {
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

    window.toggleGuitar = function () {
        if (!saveState.hasGuitar) {
            showToast("You don't own a guitar! Check the Stylist.");
            return;
        }

        if (isGloveActive) {
            isGloveActive = false;
            const g = player.getObjectByName('gloveMesh');
            if (g) g.visible = false;
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
        if (ui) ui.style.display = isGuitarActive ? 'block' : 'none';
        if (!isGuitarActive) stopMidi();

        const rod = player.getObjectByName('rod');
        if (rod) rod.visible = !isGuitarActive && !isGloveActive;

        let guitarMesh = player.getObjectByName('guitarMesh');
        if (isGuitarActive) {
            if(!guitarMesh){guitarMesh=makeHeldTool('guitar','guitarMesh');player.add(guitarMesh);}
            guitarMesh.visible = true;
        } else {
            if (guitarMesh) guitarMesh.visible = false;
        }

        showToast(isGuitarActive ? "Guitar Equipped!" : "Guitar Unequipped");
    }

    window.toggleGlove = function () {
        if (!saveState.hasGlove) {
            showToast("You don't own the Glove! Check the Stylist.");
            return;
        }

        // Unequip other items
        if (isGuitarActive) {
            isGuitarActive = false;
            stopMidi();
            const g = player.getObjectByName('guitarMesh');
            if (g) g.visible = false;
            const ui = document.getElementById('guitar-ui');
            if (ui) ui.style.display = 'none';
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
        if (rod) rod.visible = !isGuitarActive && !isGloveActive;

        let gloveMesh = player.getObjectByName('gloveMesh');
        if (isGloveActive) {
            if(!gloveMesh){gloveMesh=makeHeldTool('glove','gloveMesh');player.add(gloveMesh);}
            gloveMesh.visible = true;
        } else {
            if (gloveMesh) gloveMesh.visible = false;
        }

        showToast(isGloveActive ? "Glove Equipped!" : "Glove Unequipped");
    }




    // --- MIDI PLAYBACK SYSTEM ---
    const MAX_MIDI_NOTES = 200000;
    const MAX_NOTES_PER_SEC = 15;

    window.handleMidiUpload = function handleMidiUpload(files) {
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
        reader.onload = function (e) {
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
                // Always play locally immediately
                Sound.playSpatial('guitar', player.position, note.freq);

                const msg = {
                    type: 'sound',
                    id: myPeerId,
                    houseOwner: window.Housing?.presence?.().houseOwner||'',
                    name: 'guitar',
                    pos: { x: player.position.x, y: player.position.y, z: player.position.z },
                    var: note.freq
                };

            // P2P path keeps the original flood protection so we don't
            // spam other peers with too many packets per tick.
            if (sentCount < 2) {
                if (isHost) {
                    broadcastToClients(msg);
                } else if (hostConn && hostConn.open) {
                    hostConn.send(msg);
                }
                sentCount++;
            }

                // This note has been handled, remove from queue
                activeMidiNotes.splice(i, 1);
            }
        }

        if (activeMidiNotes.length === 0) {
            stopMidi();
            document.getElementById('midi-status').innerText = "Finished.";
        }
    }

    window.stopMidi = function stopMidi() {
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
            showToast(`Upgraded Stabilizer to Level ${saveState.autoReelLevel}!`);
        } else {
            showToast("Not enough money!");
        }
    }

    function buyClickPowerUpgrade() {
        const level=Math.max(0,Math.floor(Number(saveState.clickPowerLevel)||0));
        if(level>=FISHING_BAR_BONUSES.length-1)return;
        const cost=CLICK_POWER_PRICES[level];
        if (saveState.money >= cost) {
            saveState.money -= cost;
            saveState.clickPowerLevel=level+1;
            saveGame();
            Sound.sell();
            renderBaitShop();
            showToast(`Bar Size Upgraded to Level ${saveState.clickPowerLevel}!`);
        } else {
            showToast("Not enough money!");
        }
    }

    function buyHat(hat) {
        if (saveState.money >= hat.price) {
            saveState.money -= hat.price;
            saveState.unlockedHats.push(hat.id);
            Sound.sell();
            saveGame();
            renderShop();
        } else { showToast("Not enough money!"); }
    }

    function buyBait(bait) {
        if (saveState.money >= bait.price) {
            saveState.money -= bait.price;
            if (!saveState.baitInventory[bait.id]) saveState.baitInventory[bait.id] = 0;
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
            if (bType) {
                let o = document.createElement('option');
                o.value = bid;
                o.text = `${bType.name} (${count})`;
                sel.appendChild(o);
            }
        }
    });
    sel.value = activeBaitId;

    // Fallback: Only reset if the bait is truly invalid/missing.
    if (sel.value === "" && activeBaitId !== 'none') {
        activeBaitId = 'none';
        sel.value = 'none';
    }
}

function createPortalTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');

    const grd = ctx.createRadialGradient(64, 64, 5, 64, 64, 60);
    grd.addColorStop(0, 'black');
    grd.addColorStop(0.5, '#4b0082');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);

    ctx.strokeStyle = '#9400D3';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(64, 64, 10 + i * 8, i, i + Math.PI);
        ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    // --- FILTER FIX ---
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    // ------------------

    return tex;
}

function spawnPortal(x, z, fromNetwork = false, permanent = false) {
    if (voidPortalMesh) scene.remove(voidPortalMesh);

    const tex = createPortalTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    voidPortalMesh = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat);
    voidPortalMesh.rotation.x = -Math.PI / 2;
    // Get terrain height for proper Y positioning
    const terrainY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(x, z) : 0;
    voidPortalMesh.position.set(x, terrainY + 0.2, z);
    voidPortalMesh.userData.permanent = !!permanent;
    scene.add(voidPortalMesh);

    portalDespawnTime = permanent ? Infinity : Date.now() + 120000;
    if (permanent) return;

    showToast("A Void Portal has opened!");
    broadcastSound('magic', { x: x, y: 0, z: z });

    if (!fromNetwork) {
        const msg = { type: 'spawnPortal', x: x, z: z };

        if (isHost) {
            broadcastToClients(msg);
        }
    }
}

function createVoidWorld(){
    if(!voidFloorMesh){
        voidFloorMesh=new THREE.Mesh(new THREE.CircleGeometry(40,32),new THREE.MeshBasicMaterial({color:0x111111}));
        voidFloorMesh.name='voidWorldFloor';voidFloorMesh.rotation.x=-Math.PI/2;voidFloorMesh.position.set(10000,2000,10000);
    }
    if(voidFloorMesh.parent!==scene)scene.add(voidFloorMesh);
    if(!voidExitPortalMesh){
        voidExitPortalMesh=new THREE.Group();
        const disc=new THREE.Mesh(new THREE.CircleGeometry(2.6,32),new THREE.MeshBasicMaterial({color:0x9b6dff,transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false}));
        disc.rotation.x=-Math.PI/2;voidExitPortalMesh.add(disc);
        const rim=new THREE.Mesh(new THREE.RingGeometry(2.7,3.4,32),new THREE.MeshBasicMaterial({color:0xd8c4ff,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
        rim.rotation.x=-Math.PI/2;rim.position.y=.02;voidExitPortalMesh.add(rim);
        voidExitPortalMesh.position.set(10000,2000.25,10000+32);
        voidExitPortalMesh.name='voidExitPortal';
        scene.add(voidExitPortalMesh);
        const light=new THREE.PointLight(0x9b6dff,1.4,22);light.position.set(10000,2003,10000+32);scene.add(light);
    }
    if(voidExitPortalMesh.parent!==scene)scene.add(voidExitPortalMesh);
    return voidFloorMesh;
}

function findCustomPortalLocation(level,random=Math.random){
    const cells=[];for(let i=0;i<level.heights.length;i++)if(level.heights[i]>level.seaLevel+.2)cells.push(i);
    // Sample actual dry cells, so tiny islands in a large ocean are not missed.
    for(let tries=0;tries<100&&cells.length;tries++){
        const pick=Math.min(cells.length-1,Math.floor(random()*cells.length)),index=cells[pick];cells[pick]=cells[cells.length-1];cells.pop();
        const p=Level.cellCenter(level,index%level.grid,Math.floor(index/level.grid)),y=Level.sampleHeight(level,p.x,p.z);
        if(y<=level.seaLevel+.2)continue;
        if(treeColliders.some(c=>Math.hypot(p.x-c.x,p.z-c.z)<(c.radius||0)+2))continue;
        if(staticColliders.some(c=>staticColliderHits(c,{x:p.x,y:y+.2,z:p.z},2,.4)))continue;
        return p;
    }
    return null;
}

function enterLavaWorld() {
    window.Boats?.abandon();
    if(window.Housing && Housing.inside)return;
    if(!lavaFloorMesh||!lavaLakeMesh)createLavaWorld();
    if(!isInLavaWorld)lastIslandPos.copy(player.position);
    isInLavaWorld = true;
    isInVoid = false;

    // Teleport Player
    player.position.set(-20000 + 40, 2, 0); // Edge of lava island
    player.lookAt(-20000, 2, 0); // Look at lava lake
    playerVelocity.set(0, 0, 0);

    // Visuals
    scene.background = new THREE.Color(0x220000); // Dark Red Sky
    scene.fog = new THREE.Fog(0x220000, 10, 80);

    showToast("Welcome to the Lava World!");
    updateWeatherVisuals();
}

function exitLavaWorld() {
    if(!isInLavaWorld)return;
    isInLavaWorld = false;
    if(player){
        player.position.copy(lastIslandPos);
        player.position.y=Math.max(lastIslandPos.y,getTerrainHeight(player.position.x,player.position.z)+.5);
        playerVelocity.set(0,0,0);
        knockbackVelocity.set(0,0,0);
    }
    portalCooldown=Date.now()+3000;
    scene.background=new THREE.Color(0x87CEEB);
    scene.fog=new THREE.Fog(0x87CEEB,20,100);
    updateWeatherVisuals();
}

function enterVoid() {
    window.Boats?.abandon();
    if(window.Housing && Housing.inside)return;
    if (isInVoid) return;
    isInVoid = true;
    voidPortalArmed = false;

    // Save last position just in case, though Respawn will reset to default
    lastIslandPos.copy(player.position);

    // Teleport to Void
    player.position.set(10000, 2002, 10000);
    playerVelocity.y = 0;

    // Visuals
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 10, 50);

    createVoidWorld();

    showToast("Entered the Void.");
    updateWeatherVisuals();
}

window.respawnPlayer = function () {
    window.Boats?.abandon();
    if(window.Housing && Housing.inside)Housing.leave();
    // Reset Void State
    isInVoid = false;
    isInLavaWorld = false;

    // Reset Visuals to Island
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

    // Reset Player Physics & Position
    if (player) {
        if (window.CUSTOM_LEVEL && window.Level && Level.spawnPoint) {
            // Custom levels respawn at their editor-placed spawn.
            const spot = findCustomSpawn(window.CUSTOM_LEVEL);
            player.position.set(spot.x, window.Level.sampleHeight(window.CUSTOM_LEVEL, spot.x, spot.z) + 0.5, spot.z);
        } else {
            player.position.set(25, 2, 0); // Default spawn point
        }
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

window.exitVoid = function () {
    if (!isInVoid) return;
    isInVoid = false;

    player.position.copy(lastIslandPos);
    player.position.y = Math.max(lastIslandPos.y,getTerrainHeight(player.position.x,player.position.z)+.5);
    playerVelocity.y = 0;

    portalCooldown = Date.now() + 3000;
    voidPortalArmed = false;

    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

    const button=document.getElementById('btn-void-respawn');if(button)button.style.display='none';
}

// ---------------------------------------------------------------------------
// SAILING
// ---------------------------------------------------------------------------
// The rowboat lets the player cross water. It is bought once (hasBoat) and then
// toggled with the sail key: you can only board while standing near the lake
// shore, and you only step off once you're back over land.

// True when the player is close enough to the main lake to launch a boat.
function nearLaunchableWater(x, z) {
    // You can launch anywhere there's water: the home lake/ponds, any point in
    // the open ocean, or a custom level's sea (inside or out).
    if (window.CUSTOM_LEVEL && window.Level) {
        if (window.Level.isWater(window.CUSTOM_LEVEL, x, z)) return true;
        // Outside the authored map is ocean too.
        return !window.Level.inBounds(window.CUSTOM_LEVEL, x, z);
    }
    const d = Math.sqrt(x * x + z * z);
    if (d < LAKE_RADIUS + 8) return true;                 // home lake shore
    if (d > ISLAND_RADIUS - 8) {                           // open ocean
        return getTerrainHeight(x, z) < OCEAN_LEVEL + 0.5;
    }
    return false;
}

// Show/hide the rowboat the player sits in while sailing. Lazily attaches it
// in case the player group was rebuilt without one.
function setSailBoatVisible(on) {
    if (!player) return;
    let boat = player.getObjectByName('sailBoat');
    if (!boat) boat = attachSailBoat(player);
    if (boat) boat.visible = !!on;
}

window.toggleSailing = function () {
    if(window.Boats?.isAboard()){Boats.interact(true);return;}
    if (isInVoid || isInLavaWorld) { showToast("Can't sail here."); return; }
    if (!saveState.hasBoat) {
        showToast('You need a Rowboat first — buy one from the Merchant!');
        return;
    }

    if (isSailing) {
        // Step ashore: only allowed once the current spot is dry land.
        const onWater = waterSurfaceAt(player.position.x, player.position.z) !== null;
        if (onWater) { showToast('Row closer to shore before stepping out.'); return; }
        isSailing = false;
        setSailBoatVisible(false);
        playerVelocity.y = 0;
        broadcastSound('footstep');
        showToast('Stepped ashore.');
        return;
    }

    if (!nearLaunchableWater(player.position.x, player.position.z)) {
        showToast('Stand by the water to launch your boat.');
        return;
    }

    isSailing = true;
    setSailBoatVisible(true);
    stopFishing(false, 'Boarded the boat.');
    playerVelocity.y = 0;
    broadcastSound('sail');
    showToast('Boarded the rowboat. Sail out to the open water!');

    // Sailing XP for the first launch each session-shaped action.
    addSkillXP('sailing', 5);
};



function togglePlayerList() {
    const ui = document.getElementById('player-list-overlay');
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') renderPlayerList();
}

function renderPlayerList() {
    const container = document.getElementById('public-player-list');
    container.innerHTML = '';

    // 1. Add Self (Information only)
    const myRow = document.createElement('div');
    myRow.style.background = 'var(--p-face-2)';
    myRow.style.border = '2px solid var(--p-line)';
    myRow.style.padding = '10px'; myRow.style.borderRadius = '0';
    myRow.style.color = 'var(--p-good)'; myRow.style.fontWeight = 'bold';
    myRow.innerText = `${saveState.displayName} (You)`;
    container.appendChild(myRow);

    // 2. Add Other Players
    Object.keys(otherPlayers).forEach(pid => {
        const p = otherPlayers[pid];
        const row = document.createElement('div');
        row.style.background = 'var(--p-face-2)';
        row.style.border = '2px solid var(--p-line)';
        row.style.marginBottom = '5px';
        row.style.padding = '10px';
        row.style.borderRadius = '0';
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
        btnVoice.style.backgroundColor = isVoiceMuted ? 'var(--p-bad)' : 'var(--p-face-3)';
        btnVoice.innerText = isVoiceMuted ? "Voice: Off" : "Voice: On";
        btnVoice.onclick = () => toggleLocalMute(pid, 'voice');

        // Chat Mute Button
        const isChatMuted = localMutedChat.includes(pid);
        const btnChat = document.createElement('button');
        btnChat.className = 'btn-sm';
        btnChat.style.backgroundColor = isChatMuted ? 'var(--p-bad)' : 'var(--p-face-3)';
        btnChat.innerText = isChatMuted ? "Chat: Off" : "Chat: On";
        btnChat.onclick = () => toggleLocalMute(pid, 'chat');

        const isMidiMuted = localMutedMidi.includes(pid);
        const btnMidi = document.createElement('button');
        btnMidi.className = 'btn-sm';
        btnMidi.style.backgroundColor = isMidiMuted ? 'var(--p-bad)' : 'var(--p-face-3)';
        btnMidi.innerText = isMidiMuted ? "MIDI: Off" : "MIDI: On";
        btnMidi.onclick = () => toggleLocalMute(pid, 'midi');
        // ----------------------------------

        const btnTrade = document.createElement('button');
        btnTrade.className = 'btn-sm';
        btnTrade.style.backgroundColor = 'var(--p-good)';
        btnTrade.innerText = 'Trade';
        btnTrade.onclick = () => { togglePlayerList(); openTradeWith(pid); };

        actions.appendChild(btnVoice);
        actions.appendChild(btnChat);
        actions.appendChild(btnMidi);
        actions.appendChild(btnTrade);

        row.appendChild(name);
        row.appendChild(actions);
        container.appendChild(row);
    });

    if (Object.keys(otherPlayers).length === 0) {
        const empty = document.createElement('div');
        empty.innerText = "No other fishers here.";
        empty.style.color = 'var(--p-text-dim)'; empty.style.fontStyle = 'italic';
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

    // The panel refreshes whenever someone joins or leaves, which would yank
    // the text out from under a host who is mid-rename. Remember it.
    const liveInput = document.getElementById('lobby-name-live');
    const wasTyping = liveInput && document.activeElement === liveInput;
    const typingValue = wasTyping ? liveInput.value : null;

    container.innerHTML = '';

    // Hosts can rename their public lobby on the fly; the change is pushed to
    // the master server immediately.
    if (isHost) {
        const nameDiv = document.createElement('div');
        nameDiv.style.cssText = 'margin-bottom:15px;padding-bottom:10px;border-bottom:2px solid var(--p-line);text-align:center;';

        const label = document.createElement('div');
        label.textContent = 'Lobby Name';
        label.style.cssText = 'font-family:var(--font-display);font-size:10px;letter-spacing:1px;color:var(--p-sand);margin-bottom:6px;';

        const input = document.createElement('input');
        input.id = 'lobby-name-live';
        input.type = 'text';
        input.maxLength = 24;
        input.value = myLobbyName || defaultLobbyName();
        input.style.cssText = 'width:100%;text-align:center;margin-bottom:6px;box-sizing:border-box;';

        const apply = () => setLobbyName(input.value);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        });
        input.addEventListener('blur', apply);

        const note = document.createElement('div');
        note.style.cssText = 'font-size:14px;color:var(--p-text-mute);';
        note.textContent = lobbyIsPublic()
            ? 'Listed in the server browser · ' + lobbyPlayerCount() + ' in lobby'
            : 'Private — join with room code ' + (currentRoomId || '—');

        nameDiv.appendChild(label);
        nameDiv.appendChild(input);
        nameDiv.appendChild(note);
        container.appendChild(nameDiv);

        if (typingValue !== null) {
            input.value = typingValue;
            input.focus();
        }
    }

    if (isHost) {
        const adminDiv = document.createElement('div');
        adminDiv.style.marginBottom = '15px';
        adminDiv.style.paddingBottom = '10px';
        adminDiv.style.borderBottom = '2px solid var(--p-line)';
        adminDiv.style.textAlign = 'center';

        const btnMoney = document.createElement('button');
        btnMoney.className = 'btn-lg btn-green';
        btnMoney.innerText = "Give Self $1000";
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
        btnPortal.style.background = 'var(--p-face-3)';
        btnPortal.style.marginTop = '5px';
        btnPortal.innerText = "Spawn Portal";
        btnPortal.onclick = () => {
            const x = player.position.x + 5;
            const z = player.position.z;
            spawnPortal(x, z);
        };
        adminDiv.appendChild(btnPortal);

        const btnPond = document.createElement('button');
        btnPond.className = 'btn-lg';
        btnPond.style.background = 'var(--p-face-3)';
        btnPond.style.marginTop = '5px';
        btnPond.innerText = "Teleport to Random Pond";
        btnPond.onclick = () => {
            if (window.Ocean) {
                try {
                    const lay = window.Ocean.layout();
                    if (lay && lay.ponds && lay.ponds.length > 0) {
                        const p = lay.ponds[Math.floor(Math.random() * lay.ponds.length)];
                        if (player) {
                            player.position.set(p.x, getTerrainHeight ? getTerrainHeight(p.x, p.z) : 0, p.z);
                            camera.position.set(p.x, player.position.y + 3, p.z + 6);
                            showToast(`Teleported to ${p.type === 'dark' ? 'Dark' : 'Light'} Pond`);
                        }
                    } else {
                        showToast("No ocean ponds found");
                    }
                } catch(e) { showToast("Error teleporting to pond"); }
            } else {
                showToast("No ocean ponds found");
            }
        };
        adminDiv.appendChild(btnPond);

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
        btnGhost.style.background = 'var(--p-face-3)';
        btnGhost.innerText = "Haunt";
        btnGhost.onclick = () => triggerHaunt(pid);

        const isVM = mutedVoicePeers.includes(pid);
        const btnVoice = document.createElement('button');
        btnVoice.className = isVM ? 'btn-sm btn-danger' : 'btn-sm';
        btnVoice.innerText = isVM ? "Voice Off" : "Mute Voice";
        btnVoice.onclick = () => toggleGlobalMute(pid, 'voice');

        const isCM = mutedChatPeers.includes(pid);
        const btnChat = document.createElement('button');
        btnChat.className = isCM ? 'btn-sm btn-danger' : 'btn-sm';
        btnChat.innerText = isCM ? "Chat Off" : "Mute Chat";
        btnChat.onclick = () => toggleGlobalMute(pid, 'chat');

        const isGlobalMidiMuted = p.lastData && p.lastData.isMidiMuted;

        const btnMidi = document.createElement('button');
        btnMidi.className = isGlobalMidiMuted ? 'btn-sm btn-danger' : 'btn-sm';
        btnMidi.innerText = isGlobalMidiMuted ? "MIDI Off" : "Mute MIDI";
        btnMidi.onclick = () => toggleGlobalMute(pid, 'midi');

        const btnKick = document.createElement('button');
        btnKick.className = 'btn-sm btn-warn';
        btnKick.innerText = "Kick";
        btnKick.onclick = () => kickPeer(pid);

        const btnBan = document.createElement('button');
        btnBan.className = 'btn-sm btn-danger';
        btnBan.innerText = "Ban";
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
    // PeerJS (P2P) Host Logic
    const conn = clientConns[pid];
    if (conn) {
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
    // PeerJS (P2P) Host Logic
    if (!bannedPeers.includes(pid)) bannedPeers.push(pid);

    broadcastToClients({ type: 'purge_chat', targetId: pid });

    const conn = clientConns[pid];
    if (conn) {
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
    // P2P HOST LOGIC
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


function respawnTree(index) {
    if (index < 0 || index >= treeMeshes.length) return;
    const mesh = treeMeshes[index];
    if (!mesh || !mesh.userData.isStump) return;

    // Restore Visuals
    // Restore scale (y = x)
    mesh.scale.set(mesh.scale.x, mesh.scale.x, mesh.scale.z);

    // Restore leaves
    if (mesh.children && mesh.children.length > 1) {
        for (let i = 1; i < mesh.children.length; i++) {
            if (mesh.children[i]) mesh.children[i].visible = true;
        }
    }

    mesh.userData.isStump = false;
}

function respawnFlower(index) {
    if (index < 0 || index >= pickableFlowers.length) return;
    const flower = pickableFlowers[index];
    if (!flower || !flower.userData.isPicked) return;

    flower.visible = true;
    flower.userData.isPicked = false;

    // Grow back in place. The flower keeps its assigned type so every player
    // still sees the same species at that spot in multiplayer.
    const target = Math.max(0.01, flower.userData.originalScale || 1);
    let s = 0;
    flower.scale.set(0, 0, 0);
    const grow = setInterval(() => {
        s = Math.min(target, s + target / 6);
        flower.scale.set(s, s, s);
        if (s >= target) clearInterval(grow);
    }, 50);
}

// --- HUD TOGGLE ---
let hudVisible = true;
function toggleHud() {
    hudVisible = !hudVisible;
    document.body.classList.toggle('hud-hidden', !hudVisible);
    const disp = hudVisible ? '' : 'none';

    // 1. Hotbar
    const hotbar = document.getElementById('hotbar-container');
    if (hotbar) hotbar.style.display = hudVisible ? 'flex' : 'none';

    // 2. Chat
    const chat = document.getElementById('chat-ui');
    if (chat) {
        if (!hudVisible) chat.style.display = 'none';
        else chat.style.display = ''; // Let CSS or JS logic handle it
    }



    // 4. Logs
    const log = document.getElementById('fish-log');
    if (log) log.style.display = disp;

    // 5. Notifications
    const notif = document.getElementById('notification-area');
    if (notif) notif.style.display = disp;

    // 6. Version
    const ver = document.getElementById('lobby-version');
    if (ver) ver.style.display = disp;

    // 7. Version (Loading)
    const verLoad = document.getElementById('version');
    if (verLoad) verLoad.style.display = disp;

    // 8. Mobile Controls
    const mob = document.getElementById('mobile-controls');
    if (mob && isMobile) mob.style.display = hudVisible ? 'block' : 'none';

    // 9. Stats UI (top bar)
    const stats = document.getElementById('stats-ui');
    if (stats) stats.style.display = disp;

    // 10. Bait UI
    const bait = document.getElementById('bait-ui');
    if (bait) bait.style.display = disp;

    // 11. Room Info
    const room = document.getElementById('room-info-ui');
    if (room) room.style.display = disp;

    // Traverse actual scene labels so new/seasonal/custom-map NPCs cannot be
    // omitted from a hand-maintained list. Parent/NPC visibility is untouched.
    if(typeof scene!=='undefined'&&scene)scene.traverse(syncHudLabel);

    if (hudVisible) showToast("HUD Visible");
}
function update3DColorControls() {
    const accentRow=document.getElementById('tail-accent-color-row');
    const accentPicker=document.getElementById('tail-accent-color-picker');
    const supported=window.Character3D?.tailAccentTypes?.includes(saveState.currentTail);
    if(accentRow)accentRow.hidden=!saveState.model3D||!supported;
    if(accentPicker)accentPicker.value=saveState.tailAccentColor||saveState.bellyColor||'#ffffff';
    for(const part of ['hand','foot']) {
        const row=document.getElementById(part+'-color-row');
        const picker=document.getElementById(part+'-color-picker');
        if(row)row.hidden=!saveState.model3D;
        if(picker)picker.value=saveState[part+'Color']||saveState.catColor||'#ff6347';
    }
}
window.change3DTailAccent=function(value) {
    if(!saveState.model3D||!window.Character3D?.tailAccentTypes?.includes(saveState.currentTail)|| (value!==''&&!/^#[0-9a-f]{6}$/i.test(value)))return;
    saveState.tailAccentColor=value;saveGame();
    if(player)updateLocalVisuals();
    update3DColorControls();updateCharacterPreview();
};
window.change3DLimbColor=function(part,value) {
    if(!saveState.model3D||!['hand','foot'].includes(part)||!/^#[0-9a-f]{6}$/i.test(value))return;
    saveState[part+'Color']=value;saveGame();
    if(player)updateLocalVisuals();
    update3DColorControls();updateCharacterPreview();
};
function updateCharacterModelUI() {
    update3DColorControls();
}
window.toggleCharacterModels=function() {
    if(typeof TWO_D_MODE_AVAILABLE!=='undefined'&&!TWO_D_MODE_AVAILABLE){updateCharacterModelUI();return;}
    saveState.model3D=!saveState.model3D;saveState.preferredModel3D=saveState.model3D;
    const groups=new Set(),roots=[];
    if(typeof scene!=='undefined' && scene)roots.push(scene);
    if(window.Housing && Housing.renderScene)roots.push(Housing.renderScene);
    roots.forEach(root=>root.traverse(obj=>{if(obj.name==='playerSprite'&&obj.userData.cfg)groups.add(obj.parent);}));
    groups.forEach(group=>{
        const old=group.getObjectByName('playerSprite'),pos=old.position.clone(),rot=old.rotation.clone(),scale=old.scale.clone();
        const body=replaceCharacterBody(group,old.userData.cfg);
        body.position.copy(pos);body.rotation.copy(rot);body.scale.copy(scale);
    });
    updateCharacterModelUI();saveGame();
    if(document.getElementById('shop-overlay')?.style.display==='flex')updateCharacterPreview();
};

function updatePerformanceUI(){
    const button=document.getElementById('btn-fps-counter');
    if(button){button.textContent='FPS Counter: '+(saveState.showFPS!==false?'ON':'OFF');button.setAttribute('aria-pressed',String(saveState.showFPS!==false));}
    const resolution=document.getElementById('render-scale');if(resolution)resolution.value=String(saveState.renderScale===undefined?0:saveState.renderScale);
    const retroButton=document.getElementById('btn-retro-shader');
    if(retroButton){const on=!!saveState.retroShader;retroButton.textContent='Retro shader: '+(on?'ON':'OFF');retroButton.setAttribute('aria-pressed',String(on));}
    const pixelSize=document.getElementById('retro-pixel-size');
    if(pixelSize){pixelSize.value=String(retroPixelSize());pixelSize.disabled=!saveState.retroShader;}
    const counter=document.getElementById('performance-counter');if(counter)counter.hidden=saveState.showFPS===false;
}
window.toggleFPSCounter=function(){saveState.showFPS=saveState.showFPS===false;updatePerformanceUI();saveGame();};

window.changeRenderScale=function(value){const scale=Number(value);if(![0,.75,1].includes(scale))return;saveState.renderScale=scale;if(typeof renderer!=='undefined'&&renderer)renderer.setPixelRatio(scale===0?(window.devicePixelRatio||1):scale);updatePerformanceUI();saveGame();};

window.toggleRetroShader=function(){
    saveState.retroShader=!saveState.retroShader;
    if(saveState.retroShader){
        try{ensureRetroPipeline();resizeRetroPipeline();}
        catch(e){console.warn('[retro] could not start shader',e);saveState.retroShader=false;if(typeof showToast==='function')showToast('Retro shader is unavailable on this device','error');}
    }
    updatePerformanceUI();saveGame();
};
window.changeRetroPixelSize=function(value){
    const size=Number(value);
    if(!RETRO_PIXEL_SIZES.includes(size))return;
    saveState.retroPixelSize=size;
    resizeRetroPipeline();
    updatePerformanceUI();saveGame();
};
