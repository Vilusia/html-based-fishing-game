
const UICache = { mEl: null, logHeader: null, lEl: null };
let isHandsHidden = false; // Global state for empty hands mode
let pickableFlowers = []; // Trackable, pickable flower meshes

// --- SKILL SYSTEM HELPERS ---
function addSkillXP(skillName, xpAmount) {
    if (!saveState.skills) saveState.skills = { mining: { xp: 0 }, lumberjack: { xp: 0 }, fishing: { xp: 0 }, floristry: { xp: 0 } };
    if (!saveState.skills[skillName]) saveState.skills[skillName] = { xp: 0 };

    const oldLevel = getLevelFromXP(saveState.skills[skillName].xp);
    saveState.skills[skillName].xp += xpAmount;
    const newLevel = getLevelFromXP(saveState.skills[skillName].xp);

    // Level up notification
    if (newLevel > oldLevel) {
        showToast(`${skillName.charAt(0).toUpperCase() + skillName.slice(1)} Level ${newLevel}!`, 'success');
        Sound.sell(); // Play level up sound
    }
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
    let totalFishValue = 0;
    saveState.inventory.forEach(f => totalFishValue += Math.max(0, Number(f && f.price) || Number(f && f.value) || 10)); // Handle legacy save formats

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

    container.innerHTML = `
        <div style="background:var(--p-face); padding:30px; border-radius:0; border:2px solid var(--p-line);
                    box-shadow: inset 1px 1px 0 var(--p-bevel), inset -1px -1px 0 var(--p-bevel-dark), 0 4px 0 rgba(0,0,0,0.5);
                    width:350px; text-align:center; position:relative; max-width:90%;
                    max-height: 90vh; overflow-y: auto;">

            <h2 style="margin-top:0; font-size: 16px;">Merchant</h2>
            <div style="font-family:var(--font-display); font-size:16px; color:var(--p-gold); margin-bottom:20px;">$${Number(saveState.money) || 0}</div>

            <h3 style="color:var(--p-sand); border-bottom:2px solid var(--p-line); padding-bottom:5px; margin-top:0;">Sell</h3>

            <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px; margin-top: 10px;">
                <button class="btn-lg" onclick="actionSellFish()" ${totalFishValue === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                    Sell Fish ($${totalFishValue})
                </button>
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
            </div>

            <button class="close-x-btn" onclick="document.getElementById('merchant-ui').style.display='none'">×</button>
        </div>
    `;
}

window.actionSellStone = function () {
    if (!saveState.stone || saveState.stone <= 0) { showToast("No stone!"); return; }

    const count = saveState.stone;
    const price = 30;
    const total = count * price;

    saveState.stone = 0;
    saveState.money += total;
    saveGame();
    Sound.sell();
    showToast(`Sold ${count} stone for $${total}!`);
    updateMerchantUI(document.getElementById('merchant-ui'));
};

window.actionSellFish = function () {
    if (saveState.inventory.length === 0) { showToast("No fish to sell!"); return; }

    // Server Authority Check
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({ type: 'sellFish' }));
        // Close UI or wait? Let's close it to avoid confusion or just refresh
        document.getElementById('merchant-ui').style.display = 'none';
        return;
    }

    let totalVal = 0;
    saveState.inventory.forEach(f => totalVal += Math.max(0, Number(f && f.price) || Number(f && f.value) || 10));
    const count = saveState.inventory.length;
    saveState.money += totalVal;
    saveState.inventory = [];
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

    // Server Authority Check
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({ type: 'sellWood' }));
        document.getElementById('merchant-ui').style.display = 'none';
        return;
    }

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

    // Server Authority Check
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({ type: 'sellOre' }));
        document.getElementById('merchant-ui').style.display = 'none';
        return;
    }

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

    // Server Authority Check
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({ type: 'sellFlowers' }));
        document.getElementById('merchant-ui').style.display = 'none';
        return;
    }

    saveState.flowerInventory = {};
    saveState.money += total;
    saveGame();
    Sound.sell();
    showToast(`Sold ${count} flowers for $${total}!`);
    updateMerchantUI(document.getElementById('merchant-ui'));
    updateUI(); // Refresh inventory display
};

// --- FLOWER COLLECTION SYSTEM ---
window.pickFlower = function (i) {
    const flower = pickableFlowers[i];
    if (!flower || flower.userData.isPicked) return;

    // Mark as picked
    flower.userData.isPicked = true;
    flower.visible = false;

    // Get Data
    const typeId = flower.userData.typeId || 'daisy'; // Default fallback
    const flowerType = FLOWER_TYPES.find(f => f.id === typeId) || FLOWER_TYPES[0];

    // Rewards
    const xp = flowerType.xp || 5;
    const money = flowerType.price || 1;

    // Apply
    addSkillXP('floristry', xp);
    saveState.money += money;
    saveGame();

    // SERVER SYNC
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({ type: 'collect_flower', id: typeId }));
    }

    // Feedback
    Sound.flip(); // Use existing sound (flip or click)
    showToast(`Picked ${flowerType.name}: +$${money}, +${xp} XP`, 'success');
    updateUI(); // Update money display

    // Respawn Logic (1 minute cooldown)
    setTimeout(() => {
        respawnFlower(i);
    }, 60000);
}

function respawnFlower(i) {
    const flower = pickableFlowers[i];
    if (!flower) return;

    // Determine new type based on CURRENT level
    const floristryXP = (saveState.skills && saveState.skills.floristry) ? saveState.skills.floristry.xp : 0;
    const floristryLevel = getLevelFromXP(floristryXP);
    const newType = getResourceForLevel(floristryLevel, FLOWER_TYPES);

    // Update Mesh Visuals
    const head = flower.children[1]; // 0 is stem, 1 is head
    if (head && head.material) {
        head.material.color.set(newType.color);
    }

    // Update Data
    flower.userData.typeId = newType.id;
    flower.userData.isPicked = false;
    flower.visible = true;

    // Optional: Pop animation?
    flower.scale.set(0, 0, 0);
    const targetScale = flower.userData.originalScale || 1;

    // Simple grow animation
    let s = 0;
    const anim = setInterval(() => {
        s += 0.1;
        if (s >= targetScale) {
            s = targetScale;
            clearInterval(anim);
        }
        flower.scale.set(s, s, s);
    }, 50);
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

    // Auto-equip if possible or just refresh hotbar
    updateHotbarVisuals();
    saveGame();
    Sound.sell();
    showToast(`Purchased ${tool.name}!`);
    updateMerchantUI(document.getElementById('merchant-ui'));
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
            if (ui.style.display === 'flex') document.getElementById('chat-input').focus();
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
        if (mobEl) { mobEl.innerText = txt; mobEl.style.color = col; }
    } else {
        if (el) { el.innerText = '🚫'; el.style.color = 'var(--p-text-mute)'; }
        if (mobEl) { mobEl.innerText = '🚫'; mobEl.style.color = 'var(--p-text-mute)'; }
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

function updateVoiceVisuals() {
    const dataArray = new Uint8Array(32);

    // 1. Local Player
    if (voiceAnalysers['local'] && !isMicMuted && player) {
        voiceAnalysers['local'].getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const icon = player.getObjectByName('talkingIcon');
        if (icon) icon.visible = avg > 10;
    } else if (player) {
        const icon = player.getObjectByName('talkingIcon');
        if (icon) icon.visible = false;
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
            if (icon) icon.visible = false;
        }
        else if (voiceAnalysers[analyserId]) {
            // --- UNMUTE IF CLEAN ---
            if (audioEl) audioEl.muted = false;

            voiceAnalysers[analyserId].getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            const icon = p.mesh.getObjectByName('talkingIcon');
            if (icon) icon.visible = avg > 10;

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
            if (icon) icon.visible = false;
        }
    });
}

// --- GAME INITIALIZATION & LOBBY ---
window.onload = function () {
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
    if (btnAdmin) {
        btnAdmin.style.display = 'none';
        btnAdmin.onclick = toggleHostPanel;
    }

    // A multiplayer level hand-off reloads the page with ?custom=1, so rejoin
    // the room/server automatically instead of parking the player in the lobby.
    try {
        const params = new URLSearchParams(location.search);
        const autoRoom = params.get('room');
        const autoServer = params.get('dedicated');
        if (autoRoom) {
            document.getElementById('room-id-input').value = autoRoom;
            document.getElementById('lobby-status').innerText = "Rejoining room " + autoRoom + "...";
            setTimeout(() => joinGame(), 400);
        } else if (autoServer) {
            document.getElementById('lobby-status').innerText = "Reconnecting to the server...";
            setTimeout(() => connectToDedicatedServer(autoServer), 400);
        }
    } catch (err) { /* ignore */ }

    refreshServerCount();
    setInterval(refreshServerCount, 10000);

    // --- CRITICAL FIX: REMOVED THE 3-SECOND SETNAME INTERVAL ---
    // This interval was causing the "leaving/rejoining" loop.
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
            } catch (e) { console.warn("Could not close old conn", e); }

            // Remove the old player entity so we can make a fresh one
            removePlayer(conn.peer);
        }

        // Setup new connection handlers.
        conn.on('data', (data) => handleDataFromClient(conn.peer, data));
        conn.on('close', () => {
            // Only remove if this is still the active connection
            if (clientConns[conn.peer] === conn) {

                // --- FIX: P2P HOST PROP REMOVAL ---
                // 1. Find props owned by this peer
                const propsToRemove = activeProps.filter(p => p.owner === conn.peer);

                // 2. Remove them from Host's memory
                activeProps = activeProps.filter(p => p.owner !== conn.peer);

                // 3. Remove visually and tell other clients
                propsToRemove.forEach(p => {
                    removePropFromWorld(p.id); // Remove from Host screen
                    broadcastToClients({ type: 'propRemoved', id: p.id }); // Tell others
                });
                // ----------------------------------

                removePlayer(conn.peer);
                broadcastPlayerList();
                updateHostPanel();
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
            if (dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
                dedicatedSocket.send(JSON.stringify({ type: 'setName', name: saveState.displayName, peerId: myPeerId }));
            }
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

// --- Dedicated Server (WebSocket) client integration ---
// Put this near other networking (after joinGame / hostGame functions)

const DEDICATED_WS_URL = 'wss://invention-attachments-earl-matrix.trycloudflare.com';

let dedicatedSocket = null;
let dedicatedUrl = null;
let dedicatedId = null;
let isConnectedToDedicated = false;
let isAdminOnDedicated = false;

async function sha256HexBrowser(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex;
}


function connectToDedicatedServer(customUrl = null) {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    hostConn = null;
    // 1. Reset Sockets
    if (dedicatedSocket) { dedicatedSocket.close(); dedicatedSocket = null; }
    isConnectedToDedicated = false;

    // 2. Initialize PeerJS (Required for Voice Chat)
    if (!peer || peer.destroyed) {
        peer = new Peer();
        peer.on('open', (id) => {
            myPeerId = id;
            // If the socket connects *after* PeerJS is ready, we send the ID then.
            // If socket is already open, send it now.
            if (dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
                dedicatedSocket.send(JSON.stringify({
                    type: 'setName',
                    name: saveState.displayName,
                    peerId: myPeerId,
                    saveState: saveState
                }));
            }
        });
        peer.on('call', (call) => {
            if (localStream) call.answer(localStream); else call.answer();
            handleCall(call);
        });
    }

    // 3. Determine Connection URL
    let url;

    // Logic: Check if customUrl is a valid string (passed from Server Browser)
    // If it's an event object (from a button click) or null, use the default.
    if (customUrl && typeof customUrl === 'string') {
        url = customUrl;
    } else {
        // Fallback to default official server
        url = (window.DEDICATED_SERVER_URL || DEDICATED_WS_URL);
    }

    dedicatedUrl = url;

    document.getElementById('lobby-status').innerText = "Connecting...";

    // 4. Create the WebSocket connection
    dedicatedSocket = new WebSocket(url);

    // --- CONNECTION OPEN HANDLER ---
    dedicatedSocket.addEventListener('open', () => {
        isConnectedToDedicated = true;
        document.getElementById('lobby-status').innerText = "Connected!";

        // Send Name AND Voice ID immediately
        const payload = {
            type: 'setName',
            name: saveState.displayName || 'Fisher',
            peerId: myPeerId,
            saveState: saveState
        };
        dedicatedSocket.send(JSON.stringify(payload));

        // Publish our custom level so everyone on this server plays it. Skipped
        // when we've already got this exact level (it came from the server).
        if (window.CUSTOM_LEVEL && window.Level) {
            const hash = levelFingerprint(window.CUSTOM_LEVEL);
            if (sessionStorage.getItem(LEVEL_HASH_KEY) !== hash) {
                try {
                    dedicatedSocket.send(JSON.stringify({ type: 'setLevel', level: window.Level.serialize(window.CUSTOM_LEVEL) }));
                } catch (err) { console.warn('Could not publish level', err); }
                try { sessionStorage.setItem(LEVEL_HASH_KEY, hash); } catch (err) { }
            }
        }
        // Then ask which level is in force. WebSocket messages keep their order,
        // so the reply already accounts for the push above.
        dedicatedSocket.send(JSON.stringify({ type: 'levelSync' }));

        // UI Setup
        currentRoomId = 'official-server';
        document.getElementById('room-info-ui').style.display = 'block';

        // Update UI Text based on connection type
        const label = (customUrl && typeof customUrl === 'string') ? 'Community' : 'Official';
        document.getElementById('room-id-text').innerText = label;

        document.getElementById('lobby-screen').style.display = 'none';
        isHost = false;

        // Note: generateWorld() and startGame() moved to welcome handler
        showToast("Connected to Server!");
    });

    // --- MESSAGE HANDLER ---
    dedicatedSocket.addEventListener('message', (ev) => {
        // Drop absurd frames before parsing: a hostile server could otherwise
        // push hundreds of MB through the parser. The largest legitimate
        // message is a welcome carrying a 3MB custom level.
        if (typeof ev.data === 'string' && ev.data.length > 8 * 1024 * 1024) return;
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }

        // 1. Initial Handshake / Admin Info
        // 1. Initial Handshake / Admin Info
        if (msg.type === 'welcome') {
            dedicatedId = msg.id;
            if (msg.adminSalt) window.lastAdminSalt = msg.adminSalt;
            if (typeof msg.worldTime === 'number') worldTime = msg.worldTime;

            if (msg.activeProps && Array.isArray(msg.activeProps)) {
                // Clear existing remote props to avoid duplicates
                Object.keys(props).forEach(pid => {
                    // Optional: Don't delete your own if you want to keep them local, 
                    // but usually safe to wipe and resync.
                    removePropFromWorld(pid);
                });

                msg.activeProps.slice(0, 1000).forEach(p => spawnPropMesh(p));
            }

            // --- FIX: SYNC RAIN IMMEDIATELY ---
            if (typeof msg.isRaining === 'boolean') {
                isRaining = msg.isRaining;
                updateWeatherVisuals();
                if (isRaining) showToast("It is currently raining.");
            }
            // ----------------------------------

            // FIX: Spawn existing players from server (prevents race condition)
            if (msg.playerList) {
                Object.entries(msg.playerList).forEach(([pid, playerMeta]) => {
                    if (pid !== dedicatedId && !otherPlayers[pid]) {
                        createRemotePlayer(pid, playerMeta);
                    }
                });
            }

            // Custom level held by the server. acceptHostLevel() only navigates
            // when it isn't already the level we're playing.
            if (msg.level) {
                acceptHostLevel(msg.level, '&dedicated=' + encodeURIComponent(dedicatedUrl || ''));
            }

            // Start game AFTER worldTime is set
            generateWorld('official');
            generateWorld('official');
            startGame();
        }

        // --- NEW: Handle New Player Joins ---
        else if (msg.type === 'playerJoined') {
            if (msg.id !== dedicatedId && !otherPlayers[msg.id]) {
                createRemotePlayer(msg.id, msg.meta);
                showToast(`${msg.meta.name} joined!`);
            }
        }

        // 2. Player Movement & Visual Updates
        else if (msg.type === 'update') {
            const pid = msg.id;
            if (!pid || pid === dedicatedId) return; // Don't update self

            // FIX: Only update existing players (they should be created by welcome/playerList/playerJoined)
            if (otherPlayers[pid]) {
                updateRemotePlayer(pid, msg.payload);
                otherPlayers[pid].lastSeen = Date.now();
            }
        }

        // 3. Player List Sync (Voice/Mute Status)
        else if (msg.type === 'playerList') {
            const players = Object.values(msg.list || {});
            players.forEach(p => {
                // 1. Create Player if missing (Critical Fix)
                if (p.id !== dedicatedId && !otherPlayers[p.id]) {
                    createRemotePlayer(p.id, p);
                }

                // Voice Chat Logic
                if (p.id !== dedicatedId && p.peerId) {
                    if (otherPlayers[p.id]) {
                        // --- FIX: Save the PeerID for the Watchdog ---
                        // --- FIX: Save the PeerID for the Watchdog ---
                        otherPlayers[p.id].savedPeerId = p.peerId;
                        // ---------------------------------------------

                        // Connect audio if not already connected
                        if (!otherPlayers[p.id].voiceId) {
                            connectToPeerAudio(p.peerId);
                            otherPlayers[p.id].voiceId = p.peerId;
                        }

                        // Sync Mute Flags
                        if (!otherPlayers[p.id].lastData) otherPlayers[p.id].lastData = {};
                        otherPlayers[p.id].lastData.isVoiceMuted = p.isVoiceMuted;
                        otherPlayers[p.id].lastData.isChatMuted = p.isChatMuted;
                        otherPlayers[p.id].lastData.isMidiMuted = p.isMidiMuted;

                        // Immediate Audio Hardware Mute
                        const audioId = otherPlayers[p.id].voiceId;
                        if (audioId) {
                            const el = document.getElementById('audio-' + audioId);
                            if (el && p.isVoiceMuted) el.muted = true;
                        }
                    }
                }

                // Name Tag Update (in case they changed name)
                if (otherPlayers[p.id] && p.name) {
                    const playerEntity = otherPlayers[p.id];
                    if (playerEntity.lastData.name !== p.name) {
                        playerEntity.lastData.name = p.name;
                        const oldNameTag = playerEntity.mesh.getObjectByName('nameTag');
                        if (oldNameTag) {
                            const newTex = createNameTagTexture(p.name);
                            if (oldNameTag.material.map) oldNameTag.material.map.dispose();
                            oldNameTag.material.map = newTex;
                            oldNameTag.material.needsUpdate = true;
                        }
                    }
                }
            });
        }

        // 4. Chat Messages
        else if (msg.type === 'chat') {
            displayChatMessage(msg.name, msg.text, msg.id);
        }

        // 5. Sound Effects (3D Audio)
        else if (msg.type === 'sound') {
            if (msg.name === 'guitar') {
                // Local Mute Check
                if (typeof localMutedMidi !== 'undefined' && localMutedMidi.includes(msg.id)) return;

                // Server Admin Mute Check
                if (otherPlayers[msg.id] && otherPlayers[msg.id].lastData.isMidiMuted) return;
            }
            Sound.playSpatial(msg.name, msg.pos, msg.var);
        }

        // 6. Moderation
        else if (msg.type === 'purge_chat') {
            purgeUserMessages(msg.targetId);
        }

        // 7. Animations (Punching)
        else if (msg.type === 'anim' && msg.anim === 'punch') {
            if (otherPlayers[msg.id]) {
                animatePunch(otherPlayers[msg.id].mesh);
                Sound.playSpatial('punch', otherPlayers[msg.id].mesh.position);
            }
        }
        else if (msg.type === 'punch_hit') {
            handleHit(msg);
        }

        // 8. World Events
        else if (msg.type === 'spawnPortal') spawnPortal(msg.x, msg.z, true);
        else if (msg.type === 'forceGhost') spawnGhostMesh(msg.x, msg.z);

        // 9. Level currently in force on the server (answer to levelSync)
        else if (msg.type === 'worldLevel') {
            const query = '&dedicated=' + encodeURIComponent(dedicatedUrl || '');
            if (msg.level) acceptHostLevel(msg.level, query);
            else dropActiveLevel(query);
        }

        // 10. Environment (Weather/Time)
        else if (msg.type === 'environment_sync') {
            // Store target time for smooth interpolation in updateDayNightCycle
            if (typeof msg.time === 'number') {
                window._serverTargetTime = msg.time;
            }
            const prevRain = isRaining;
            isRaining = msg.isRaining;
            if (prevRain !== isRaining) {
                updateWeatherVisuals();
                if (isRaining) showToast("It started raining!");
                else showToast("The rain has stopped.");
            }
        }

        // 11. System / Disconnects
        else if (msg.type === 'playerLeft') {
            removePlayer(msg.id);
            updateHostPanel();
            showToast("A fisher has left.");
        }
        else if (msg.type === 'system') {
            displayChatMessage('System', msg.text, 'system');
        }

        // --- ADMIN STATUS HANDLERS ---
        else if (msg.type === 'admin_ok') {
            isHost = true; // Enable admin features client-side
            const btn = document.getElementById('btn-admin-login');
            if (btn) {
                btn.style.display = 'inline-block';
                btn.innerText = "ADMIN MENU";
                btn.classList.remove('btn-danger'); // Make it look normal/active
                btn.classList.add('btn-primary');
            }
            showToast("Admin Privileges Granted");
            updateHostPanel(); // Refresh list to show admin controls
        }
        else if (msg.type === 'admin_fail') {
            isHost = false;
            const btn = document.getElementById('btn-admin-login');
            if (btn) btn.style.display = 'none';
            showToast("Admin Privileges Revoked");
        }

        // --- NEW: Environment Sync (Time/Weather) ---
        else if (msg.type === 'environment_sync') {
            if (typeof msg.time === 'number') {
                // Anti-Jitter: Only hard sync if drift is significant (> 1 minute game time)
                // 1 Game Hour = 25 real seconds.
                // 0.02 Game Hours = 0.5 real seconds.
                if (Math.abs(worldTime - msg.time) > 0.05) {
                    worldTime = msg.time;
                }
            }
            if (typeof msg.isRaining === 'boolean') {
                if (isRaining !== msg.isRaining) {
                    isRaining = msg.isRaining;
                }
            }
        }

        // --- NEW: Fish Caught Confirmation ---
        else if (msg.type === 'fishCaughtConfirmed') {
            const fish = sanitizeFish(msg.fish);
            if (!fish) return;

            // Update Local State (Visuals Only)
            saveState.inventory.push(fish);

            // Update journal with tier (fallback to 'normal' if undefined)
            const tierId = fish.tierId || 'normal';
            updateJournal(fish, tierId);
            saveGame();

            // Show UI with tier and size info
            const tierStr = tierId !== 'normal' ? ` (${fish.tierName || 'Special'})` : '';
            const sizeStr = fish.sizeLabel ? ` [${fish.sizeLabel}]` : '';
            showToast(`Caught ${fish.name}${tierStr}${sizeStr}!`);

            // Play Sound
            Sound.playSpatial('catch');

            // --- FIX: SHOW FISH VISUALLY ON DEDICATED SERVERS ---
            localHeldFish = {
                name: fish.name,
                color: fish.color,
                size: fish.size
            };

            if (fishHoldTimer) clearTimeout(fishHoldTimer);
            fishHoldTimer = setTimeout(() => {
                localHeldFish = null;
                updateLocalVisuals();
            }, 6000);

            updateLocalVisuals();
            // ----------------------------------------------------

            // Trigger Minigame Success Visuals
            if (minigame.active) {
                minigame.active = false;
                document.getElementById('minigame-ui').style.display = 'none';
                // Reset camera or player state if needed
                fishingState = 'idle';
                player.position.y = 1.5; // Reset position if needed
            }
        }

        // --- NEW: State Update (Money/Inventory) ---
        else if (msg.type === 'stateUpdate') {
            // The server is trusted for values but not for types: coerce
            // everything before it reaches the save, otherwise a hostile
            // server can persist strings that later render as HTML (XSS via
            // the Merchant panel) or break the inventory code.
            const finNum = (v, lo, hi) => {
                const n = Number(v);
                return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
            };
            const countMap = (v) => {
                if (!v || typeof v !== 'object') return null;
                const out = {};
                Object.keys(v).slice(0, 64).forEach(k => {
                    const n = Number(v[k]);
                    if (Number.isFinite(n)) out[k] = Math.min(1e9, Math.max(0, n));
                });
                return out;
            };
            if (msg.money !== undefined) { const n = finNum(msg.money, 0, 1e12); if (n !== null) saveState.money = n; }
            if (Array.isArray(msg.inventory)) {
                saveState.inventory = msg.inventory.map(sanitizeFish).filter(Boolean).slice(0, 2000);
            }
            if (msg.woodInventory !== undefined) { const m = countMap(msg.woodInventory); if (m) saveState.woodInventory = m; }
            if (msg.oreInventory !== undefined) { const m = countMap(msg.oreInventory); if (m) saveState.oreInventory = m; }
            if (msg.wood !== undefined) { const n = finNum(msg.wood, 0, 1e9); if (n !== null) saveState.wood = n; }
            if (msg.stone !== undefined) { const n = finNum(msg.stone, 0, 1e9); if (n !== null) saveState.stone = n; }

            saveGame();
            updateUI(); // Refresh inventory display

            if (msg.soldCount && msg.soldValue) {
                const itemType = msg.soldType || 'fish';
                showToast(`Sold ${msg.soldCount} ${itemType} for $${msg.soldValue}!`);
                Sound.playSpatial('sell');
            }
        }
    });

    // --- CONNECTION CLOSE HANDLER ---
    dedicatedSocket.addEventListener('close', () => {
        isConnectedToDedicated = false;
        dedicatedSocket = null;
        alert("Disconnected from Server.");
        location.reload();
    });
}

const MASTER_SERVER_URL = 'https://html-fishing-master-server.onrender.com'; // Matches Part 1

async function openServerBrowser() {
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
            row.style.background = 'var(--p-face-2)';
            row.style.border = '2px solid var(--p-line)';
            row.style.marginBottom = '5px';
            row.style.padding = '10px';
            row.style.borderRadius = '0';
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';

            const info = document.createElement('div');
            // Escape everything from the master list: a hostile server entry
            // would otherwise run JS on the game origin.
            info.innerHTML = `<b>${escapeHTML(String(s.name || 'Server').slice(0, 40))}</b><br><span style="font-size:15px;color:var(--p-text-dim);">${escapeHTML(String(s.players == null ? '?' : s.players).slice(0, 10))} Players</span>`;

            const btn = document.createElement('button');
            btn.className = 'btn-sm btn-green';
            btn.innerText = "JOIN";

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

function closeServerBrowser() {
    document.getElementById('server-browser-overlay').style.display = 'none';
}

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
            } catch (e) { }
        };
        dedicatedSocket.addEventListener('message', onMsg);
        // timeout fallback
        setTimeout(() => { dedicatedSocket.removeEventListener('message', onMsg); resolve(false); }, 4000);
    });
}

// store last admin salt if server sends it
// optionally place this near the earlier message handling to cache welcome.adminSalt:
(function cacheAdminSaltHook() {
    const orig = window.addEventListener;
    // easiest: patch the dedicatedSocket welcome handling above — it will set window.lastAdminSalt if present
})();


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
    if (typeof isInVoid !== 'undefined' && isInVoid) return 0;
    if (typeof isInLavaWorld !== 'undefined' && isInLavaWorld) return 0;

    // --- CUSTOM LEVEL MODE ---
    // A level built in editor.html fully replaces the procedural island, so the
    // whole playing surface comes straight from the level's height grid.
    if (window.CUSTOM_LEVEL && window.Level) {
        return window.Level.sampleHeight(window.CUSTOM_LEVEL, x, z);
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

    // --- 0. PLATFORMS (Highest Priority) ---
    if (window.parkourPlatforms) {
        for (const p of window.parkourPlatforms) {
            const r = p.scale * 1.5;
            if (Math.hypot(x - p.x, z - p.z) < r) return p.y;
        }
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
        Math.max(0, distDarkPond - 24) // Include dark pond in smoothing
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

    if (distFromCenter > ISLAND_RADIUS) {
        // Beyond island - below water level
        return -4;
    } else if (distFromCenter > ISLAND_RADIUS - EDGE_FALLOFF) {
        // In the falloff zone - smooth transition below water
        const falloffProgress = (distFromCenter - (ISLAND_RADIUS - EDGE_FALLOFF)) / EDGE_FALLOFF;
        const smoothFactor = (1 - Math.cos(falloffProgress * Math.PI)) / 2;
        return h * (1 - smoothFactor) + (-4) * smoothFactor;
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
    return (Math.abs(x) < 24 && z > -120 && z < -70);
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

function generateWorld(seedStr) {
    treeMeshes.forEach(t => scene.remove(t));
    treeMeshes = []; treeColliders = [];
    pickableFlowers = []; // Track pickable flowers separately
    lavaColliders = [];
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
        return;
    }

    const seed = xmur3(seedStr.toLowerCase())();
    const rand = mulberry32(seed);

    const cabinPos = new THREE.Vector3(-40, 0, 10);
    const safeZone = 15;

    // --- PROTECTED ZONES (No Spawn) ---
    // Spawn Point (25,0,0), Merchant (23,0,0), Stylist (-23,0,0), Bait (0,0,23), Guard (16,0,16)
    const protectedZones = [
        { x: 25, z: 0, r: 8 },  // Player Spawn
        { x: 23, z: 0, r: 6 },  // Merchant
        { x: -23, z: 0, r: 6 }, // Stylist
        { x: 0, z: 23, r: 6 },  // Bait Shop
        { x: 16, z: 16, r: 6 }, // Inferno Guard
        { x: -40, z: 10, r: 15 }, // Cabin
        // --- WATER BODIES ---
        { x: -60, z: -30, r: 14 }, // Light Pond
        { x: 60, z: 50, r: 26 },   // Dark Pond (radius 14 + buffer)
        // Dock area
        { x: 0, z: 130, r: 8 },    // Dock center
    ];

    function isSafe(x, z) {

        // Keep the cave mouth / waterfall approach clear
        if (isInCaveEntranceZone(x, z)) return false;

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
}


function handleDataFromClient(clientId, data) {
    // DEBUG: Log all incoming data from clients (if debug mode enabled)
    if (saveState.debugMode && data.type !== 'update') {
        console.log('[P2P HOST] Received from', clientId, ':', data.type, data);
    }

    // --- 1. SECURITY: RATE LIMIT CHECK ---
    const now = Date.now();

    // Initialize user in rate limiter if missing
    if (!rateLimits[clientId]) {
        rateLimits[clientId] = { lastGeneral: 0, lastChat: 0, lastSound: 0, lastAnim: 0 };
    }

    const userLimit = rateLimits[clientId];

    // Global Packet Flood Protection (DoS prevention)
    // Exclude 'chat' from general limit since it has its own specific limit
    if (data.type !== 'chat' && now - userLimit.lastGeneral < SPAM_THRESHOLDS.general) {
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
    else if (data.type === 'anim') {
        if (now - userLimit.lastAnim < SPAM_THRESHOLDS.anim) return;
        userLimit.lastAnim = now;
    }
    else if (data.type === 'punch_hit') {
        if (!userLimit.lastPunch) userLimit.lastPunch = 0;
        if (now - userLimit.lastPunch < SPAM_THRESHOLDS.anim) return;
        userLimit.lastPunch = now;
    }
    // ----------------------------------------

    try {
        if (otherPlayers[clientId]) {
            otherPlayers[clientId].lastSeen = Date.now();
        }

        if (data.type === 'update') {
            if (!data.payload || !data.payload.pos) return;
            if (isNaN(data.payload.pos.x) || isNaN(data.payload.pos.y) || isNaN(data.payload.pos.z)) return;

            // Boundary Check
            const isIsland = Math.abs(data.payload.pos.x) < ISLAND_RADIUS + 50 && Math.abs(data.payload.pos.z) < ISLAND_RADIUS + 50;
            const isVoid = Math.abs(data.payload.pos.x - 10000) < 500 && Math.abs(data.payload.pos.z - 10000) < 500;
            // Allow Lava world coordinates too
            const isLava = Math.abs(data.payload.pos.x + 20000) < 500;

            if (!isIsland && !isVoid && !isLava) return;

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

        } else if (data.type === 'sound') {
            // MIDI Mute Check
            if (data.name === 'guitar') {
                if (otherPlayers[clientId] && otherPlayers[clientId].lastData.isMidiMuted) return;
                if (localMutedMidi.includes(clientId)) return;
            }

            Sound.playSpatial(data.name, data.pos, data.var);
            if (isHost) broadcastToClients(data);

        } else if (data.type === 'placeProp') {
            // P2P HOST: Handle Prop Placement Request
            const ownerProps = activeProps.filter(p => p.owner === clientId);
            if (ownerProps.length >= 10) {
                const oldest = ownerProps[0];
                activeProps = activeProps.filter(p => p.id !== oldest.id);
                broadcastToClients({ type: 'propRemoved', id: oldest.id });
                removePropFromWorld(oldest.id); // Remove visually on host
            }

            const newProp = {
                id: Date.now() + "_" + Math.random().toString().substr(2, 5),
                type: data.propType,
                x: data.x,
                z: data.z,
                owner: clientId,
                timestamp: Date.now()
            };
            activeProps.push(newProp);
            spawnPropMesh(newProp); // Spawn visually on host
            broadcastToClients({ type: 'propPlaced', prop: newProp });

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
    else if (data.type === 'punch_hit') handleHit(data);
    else if (data.type === 'anim' && data.anim === 'punch') {
        if (otherPlayers[data.id]) {
            animatePunch(otherPlayers[data.id].mesh);
            Sound.playSpatial('punch', otherPlayers[data.id].mesh.position);
        }
    }
    // P2P Prop Sync
    else if (data.type === 'propPlaced') spawnPropMesh(data.prop);
    else if (data.type === 'propRemoved') removePropFromWorld(data.id);
    else if (data.type === 'allProps') { if (Array.isArray(data.props)) data.props.slice(0, 1000).forEach(p => spawnPropMesh(p)); }
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

function broadcastToClients(msg) { Object.values(clientConns).forEach(conn => { if (conn.open) conn.send(msg); }); }
function sendUpdate() {
    if (!player) return;

    // Prepare local player data
    myData.pos = { x: player.position.x, y: player.position.y, z: player.position.z };
    myData.rot = player.rotation.y;
    myData.bobber = (bobber && fishingState !== 'idle' && fishingState !== 'charging') ? { x: bobber.position.x, y: bobber.position.y, z: bobber.position.z } : null;

    myData.color = saveState.catColor;
    myData.belly = saveState.bellyColor;
    myData.eye = saveState.eyeColor;
    myData.hat = saveState.currentHat;
    myData.species = saveState.species; // Keep for backwards compatibility
    // Modular parts
    myData.ears = saveState.currentEars;
    myData.eyes = saveState.currentEyes;
    myData.nose = saveState.currentNose;
    myData.misc = saveState.currentMisc;
    myData.tail = saveState.currentTail;
    myData.guitar = isGuitarActive;
    myData.glove = isGloveActive;
    myData.title = saveState.currentTitle;
    myData.heldFish = localHeldFish;
    myData.shirt = saveState.currentShirt;
    myData.collar = saveState.currentCollar;
    myData.name = saveState.displayName;
    myData.rod = saveState.currentRod;
    myData.handsEmpty = isHandsHidden;
    myData.hair = saveState.currentHair;
    myData.hairColor = saveState.hairColor;
    myData.bobberType = saveState.currentBobber;

    myData.bobberType = saveState.currentBobber;

    // DETERMINE CURRENT TOOL - use same mapping as selectTool()
    const toolMap = ['rod', 'hands', 'axe', 'guitar', 'glove', 'pickaxe'];
    let toolId = toolMap[saveState.activeToolIndex] || 'rod';

    // If we are holding a rod but hands are hidden (via '1' key toggle), force tool to 'hands'
    if (toolId === 'rod' && isHandsHidden) toolId = 'hands';

    myData.tool = toolId;

    myData.version = GAME_VERSION;

    // --- 1. DEDICATED SERVER LOGIC (MOVED TO TOP) ---
    // This check must happen FIRST. If we are an Admin on a dedicated server,
    // 'isHost' is true, but we still need to send data to the server, not broadcast locally.
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({
            type: 'update',
            id: dedicatedId,
            payload: myData
        }));
    }
    // --- 2. PEERJS HOST LOGIC ---
    else if (isHost) {
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

    // Apply full cosmetics (shirt, collar, pattern, modular parts, ...).
    replaceCharacterBody(group, characterCfgFromData(data));

    scene.add(group);

    // Store the player data
    // FIX: Handle both nested 'pos' (P2P) and flat 'x,y,z' (Dedicated)
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
        if (oldNameTag) {
            const newTex = createNameTagTexture(data.name);
            if (oldNameTag.material.map) oldNameTag.material.map.dispose();
            oldNameTag.material.map = newTex;
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

    // 3. VISUALS SYNC (Colors, Hat, Shirt, Collar, Pattern, Parts)
    const partsChanged = (p.lastData.ears !== data.ears || p.lastData.eyes !== data.eyes ||
        p.lastData.nose !== data.nose || p.lastData.misc !== data.misc ||
        p.lastData.tail !== data.tail || p.lastData.hair !== data.hair);
    const partColorsChanged = (p.lastData.earsColor !== data.earsColor || p.lastData.noseColor !== data.noseColor ||
        p.lastData.miscColor !== data.miscColor || p.lastData.tailColor !== data.tailColor || p.lastData.hairColor !== data.hairColor);
    if (p.lastData.color !== data.color || p.lastData.belly !== data.belly || p.lastData.hat !== data.hat ||
        p.lastData.eye !== data.eye || p.lastData.species !== data.species || p.lastData.shirt !== data.shirt ||
        p.lastData.collar !== data.collar || p.lastData.pattern !== data.pattern || partsChanged || partColorsChanged) {

        // Determine if using new parts system or legacy species
        replaceCharacterBody(p.mesh, characterCfgFromData(data));
    }

    // 4. POSITION INTERPOLATION
    p.lastData = data;

    // --- FIX START: Restore Admin Mute Flags ---
    p.lastData.isVoiceMuted = wasVoiceMuted;
    p.lastData.isChatMuted = wasChatMuted;
    p.lastData.isMidiMuted = wasMidiMuted;
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

    // 5. HELD ITEMS (Guitar, Glove, Fish, Rod, Empty)
    const rod = p.mesh.getObjectByName("rod");
    let guitar = p.mesh.getObjectByName("guitarMesh");
    let glove = p.mesh.getObjectByName("gloveMesh");
    // Change to 'axe' and 'pickaxe' to match existing naming if we want, but unique names help
    let axe = p.mesh.getObjectByName("axeMesh");
    let pickaxe = p.mesh.getObjectByName("pickaxeMesh");
    let fishSprite = p.mesh.getObjectByName("heldFishSprite");

    // A. Guitar Logic
    if (data.guitar === true) {
        if (!guitar) {
            // ... (keep your existing guitar creation code) ...
            const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d');
            ctx.fillStyle = '#8B4513'; ctx.beginPath(); ctx.arc(32, 45, 12, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(32, 35, 10, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#222'; ctx.fillRect(30, 10, 4, 30);
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(32, 40, 4, 0, Math.PI * 2); ctx.fill();
            const tex = new THREE.CanvasTexture(c);
            tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
            const mat = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 });
            guitar = new THREE.Sprite(mat); guitar.name = 'guitarMesh'; guitar.position.set(0.3, 1.25, 0.2); guitar.scale.set(1.5, 1.5, 1); p.mesh.add(guitar);
        }
        guitar.visible = true;
        if (glove) glove.visible = false;
        if (fishSprite) fishSprite.visible = false;
        if (rod) rod.visible = false;
    }
    // B. Glove Logic
    else if (data.glove === true) {
        if (!glove) {
            // ... (keep your existing glove creation code) ...
            const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d');
            ctx.fillStyle = '#cc0000'; ctx.beginPath(); ctx.arc(32, 32, 20, 0, Math.PI * 2); ctx.fill();
            const tex = new THREE.CanvasTexture(c);
            tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
            const mat = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 });
            glove = new THREE.Sprite(mat); glove.name = 'gloveMesh'; glove.position.set(0.6, 1.25, 0.5); glove.scale.set(1.2, 1.2, 1); p.mesh.add(glove);
        }
        if (glove) glove.visible = true;
        if (guitar) guitar.visible = false;
        if (fishSprite) fishSprite.visible = false;
        if (rod) rod.visible = false;
    }
    // C. Held Fish Logic
    else if (data.heldFish) {
        if (!fishSprite || fishSprite.userData.fishName !== data.heldFish.name) {
            if (fishSprite) { disposeCharacterBody(fishSprite); p.mesh.remove(fishSprite); }
            fishSprite = makeHeldFish(data.heldFish.name, data.heldFish.color, data.heldFish.size);
            p.mesh.add(fishSprite);
        }
        fishSprite.visible = true;
        if (guitar) guitar.visible = false;
        if (glove) glove.visible = false;
        if (rod) rod.visible = false;
        if (axe) axe.visible = false;
        if (pickaxe) pickaxe.visible = false;
    }
    // D. Axe Logic
    else if (data.tool === 'axe') {
        if (!axe) {
            // Match equipAxe() exactly
            const tex = createAxeTexture();
            const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
            const geo = new THREE.PlaneGeometry(2.5, 2.5);
            geo.translate(0.5, 0.5, 0); // Pivot adjustment

            axe = new THREE.Mesh(geo, mat);
            axe.name = 'axeMesh';

            axe.position.set(0.6, 0.96, 0.1);
            axe.rotation.set(-0.2, -Math.PI / 2, 0);
            axe.scale.x = -1; // FLIP SPRITE

            p.mesh.add(axe);
        }
        axe.visible = true;
        if (pickaxe) pickaxe.visible = false;
        if (rod) rod.visible = false;
        if (guitar) guitar.visible = false;
        if (glove) glove.visible = false;
        if (fishSprite) fishSprite.visible = false;
    }
    // E. Pickaxe Logic
    else if (data.tool === 'pickaxe') {
        if (!pickaxe) {
            // Match equipPickaxe() exactly
            const tex = createPickaxeTexture();
            const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
            const geo = new THREE.PlaneGeometry(2.5, 2.5);
            geo.translate(0.5, 0.5, 0);

            pickaxe = new THREE.Mesh(geo, mat);
            pickaxe.name = 'pickaxeMesh';

            pickaxe.position.set(0.6, 0.96, 0.1);
            pickaxe.rotation.set(-0.2, -Math.PI / 2, 0);
            pickaxe.scale.x = -1; // Flip like axe

            p.mesh.add(pickaxe);
        }
        pickaxe.visible = true;
        if (axe) axe.visible = false;
        if (rod) rod.visible = false;
        if (guitar) guitar.visible = false;
        if (glove) glove.visible = false;
        if (fishSprite) fishSprite.visible = false;
    }
    // F. Hands Empty Logic
    else if (data.handsEmpty || data.tool === 'hands') {
        if (rod) rod.visible = false;
        if (guitar) guitar.visible = false;
        if (glove) glove.visible = false;
        if (fishSprite) fishSprite.visible = false;
        if (axe) axe.visible = false;
        if (pickaxe) pickaxe.visible = false;
    }
    // G. Default: Rod
    else {
        if (rod) {
            rod.visible = true;
            // Ensure correct rod texture (lazy way: recreate if ID changed, or just trust init)
            // We won't re-init texture every frame here to save perf, usually createRemotePlayer handles it.
            // But if they switch rods, we might want to handle that in VISUALS SYNC section.
        }
        if (guitar) guitar.visible = false;
        if (glove) glove.visible = false;
        if (fishSprite) fishSprite.visible = false;
        if (axe) axe.visible = false;
        if (pickaxe) pickaxe.visible = false;

        // Ensure rod exists and skin is correct
        if (!rod || (data.rod && rod.userData.rodId !== data.rod)) {
            if (rod) { disposeCharacterBody(rod); p.mesh.remove(rod); }

            const rodId = data.rod || 'bamboo';
            const newRod = makeRod(rodId);
            newRod.userData.rodId = rodId;
            p.mesh.add(newRod);
        } else {
            rod.visible = true;
        }
    }

    // 6. BOBBER & LINE SYNC
    if (data.bobber) {
        if (!p.bobberMesh || p.bobberType !== data.bobberType) {
            if (p.bobberMesh) scene.remove(p.bobberMesh);

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
        if (p.bobberMesh) { scene.remove(p.bobberMesh); scene.remove(p.lineMesh); p.bobberMesh = null; p.lineMesh = null; }

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

function startGame() {
    if (!isMobile) document.getElementById('chat-ui').style.display = 'flex';
    Music.init();
    initChatPool();
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

    const embeddedHtml = safeEmbedImage(safeText);

    // Check if it's actually an image URL (not just different due to escaping)
    const imgRegex = /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)$/i;
    const isImageUrl = imgRegex.test(safeText);

    // 2. Display locally immediately
    displayChatMessage(saveState.displayName, safeText, 'local');
    broadcastSound('chat');
    showChatBubble(player, isImageUrl ? 'Image posted...' : safeText);

    // 3. Prepare Network Message
    const msg = { type: 'chat', text: safeText };

    // --- FIX: PRIORITIZE DEDICATED SERVER CONNECTION ---
    // We check this FIRST. Even if you are Admin (isHost=true), 
    // you must send the chat to the server so it can reach other players.
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify(msg));
    }
    // --- PEERJS HOST LOGIC ---
    else if (isHost) {
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
function safeEmbedImage(text) {
    const escaped = escapeHTML(text);
    // Strict check for image URL
    const imgRegex = /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)$/i;
    if (imgRegex.test(text)) {
        return `<img src="${escaped}" class="chat-img" style="max-width:200px; max-height:200px; border-radius:10px; vertical-align:middle;" alt="Image">`;
    }
    return escaped;
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
    const imgRegex = /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)$/i;
    const isImageUrl = imgRegex.test(rawText);
    const bubbleContent = isImageUrl ? 'Image posted...' : rawText;

    if (id && id !== 'local' && id !== 'system' && otherPlayers[id]) {
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
        el.innerText = `${data.players} Online`;
        el.style.color = 'var(--p-good)';
    } catch (err) {
        console.warn("Server Check Failed:", err);
        el.innerText = "Offline";
        el.style.color = 'var(--p-bad)';
    }
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
}


let waterfallMesh;

function createWaterfallZone() {
    // Replaced BoxGeometry Walls with Organic Rock Clusters
    // Use a fixed seed for waterfall generation so it syncs for everyone
    const seed = xmur3('waterfall zone')();
    const rand = mulberry32(seed);

    // Static Colliders (Keep logic similar but invisible helpers?)
    // Left Wall Collider
    staticColliders.push({ minX: -60, maxX: -4, minZ: -120, maxZ: -79 });
    // Right Wall Collider
    staticColliders.push({ minX: 6, maxX: 60, minZ: -120, maxZ: -79 });
    // Back Wall Collider
    staticColliders.push({ minX: -60, maxX: 60, minZ: -130, maxZ: -99 });

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
        treeColliders.push({ x: x, z: z, radius: s * 0.8 });
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
        // No floor collision needed for roof, but strictly speaking doesn't hurt
        // treeColliders.push({ x: x, z: z, radius: s * 0.8 }); 
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

    // --- PARKOUR PLATFORMS ---
    // Add jumping platforms leading up to the top of the waterfall
    // Heights and distances designed for player jump height (~2.5 units)
    // MOVED TO LEFT SIDE of cave entrance, climbing the rock face.
    const parkourPlatforms = [
        { x: -28, y: 3, z: -80, scale: 4.5 },    // 1. Base (Left of entrance, outside)
        { x: -35, y: 9, z: -85, scale: 4 },      // 2. Up the left face
        { x: -38, y: 15, z: -92, scale: 4 },     // 3. Rounding the corner
        { x: -30, y: 22, z: -98, scale: 3.5 },   // 4. Moving back/in
        { x: -20, y: 28, z: -100, scale: 3.5 },  // 5. Approaching center
        { x: -10, y: 35, z: -102, scale: 4 },    // 6. Near summit
        { x: 0, y: 42, z: -105, scale: 5 },      // 7. Summit Ledge
    ];

    window.parkourPlatforms = parkourPlatforms; // Expose for physics collisions

    // Use natural rock clusters
    parkourPlatforms.forEach((p, i) => {
        // Main stepping stone
        const platformRock = createRockMesh(p.scale * 1.1, rand);
        platformRock.position.set(p.x, p.y - 0.5, p.z);
        // Random rotation for organic look
        platformRock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
        platformRock.material = platformRock.material.clone();
        platformRock.material.color.setHex(0x666666);
        scene.add(platformRock);

        // Support rock (visual only) to connect to cliff
        if (p.y > 5) {
            const support = createRockMesh(p.scale * 0.9, rand);
            support.position.set(p.x - 2, p.y - 3, p.z - 2);
            support.rotation.set(rand(), rand(), rand());
            scene.add(support);
        }

        // NOTE: We do NOT add to treeColliders here. 
        // If we did, the 2D collision system would prevent the player from stepping ONTO the X/Z coordinates.
        // Vertical physics is handled by getTerrainHeight checking window.parkourPlatforms.
    });
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

function updateDayNightCycle(dt) {

    // Always run local time simulation for smooth movement
    if (typeof DAY_DURATION !== 'undefined') {
        worldTime += (dt / DAY_DURATION) * 24;
        if (worldTime >= 24) worldTime -= 24;
    }

    // On dedicated servers, smoothly lerp towards server target time
    if (isConnectedToDedicated && typeof window._serverTargetTime === 'number') {
        let diff = window._serverTargetTime - worldTime;

        // Handle day wrap-around (e.g., server at 0.1, client at 23.9)
        if (diff > 12) diff -= 24;
        if (diff < -12) diff += 24;

        // Only correct if drift is noticeable (> 0.01 hours ~ 0.4 seconds game time)
        if (Math.abs(diff) > 0.01) {
            // Lerp towards server time smoothly
            worldTime += diff * 0.1; // 10% correction per frame
            if (worldTime >= 24) worldTime -= 24;
            if (worldTime < 0) worldTime += 24;
        }
    }


    // 1. Calculate Colors
    let lightIntensity = 0.65; // Reduced for cozy/warm feel (was 1.0)

    // --- LAVA WORLD OVERRIDE ---
    if (isInLavaWorld) {
        lightIntensity = 0.8;

        if (sunLight) {
            sunLight.color.setHex(0xffaa00); // Orange light
            sunLight.intensity = 0.8;
        }

        // Apply immediately
        _optColor1.setHex(0x220000);
        scene.background = _optColor1;
        scene.fog.color = _optColor1;
        return; // Skip standard day/night cycle
    }

    // --- VOID OVERRIDE ---
    if (isInVoid) {
        _optColor1.setHex(0x000000);
        lightIntensity = 0.5;
        // Apply immediately
        scene.background = _optColor1;
        scene.fog.color = _optColor1;
        return;
    }

    // --- STANDARD WORLD CYCLE ---
    // Normalize time to 0-24
    // 6 AM to 6 PM = Day
    if (worldTime >= 6 && worldTime < 18) {
        // Sunrise (6am - 7am)
        if (worldTime < 7) {
            _optColor1.copy(NIGHT_COLOR).lerp(DAY_COLOR, (worldTime - 6));
            lightIntensity = 0.3 + (worldTime - 6) * 0.35; // 0.3 -> 0.65
        }
        // Sunset (5pm - 6pm)
        else if (worldTime > 17) {
            _optColor1.copy(DAY_COLOR).lerp(SUNSET_COLOR, (worldTime - 17));
            lightIntensity = 0.65 - (worldTime - 17) * 0.35; // 0.65 -> 0.3
        }
        // Middle of Day
        else {
            _optColor1.copy(DAY_COLOR);
            lightIntensity = 0.65; // Cozy daytime light
        }
    } else {
        // Night
        lightIntensity = 0.2; // Dim light

        // Dusk (6pm - 7pm)
        if (worldTime >= 18 && worldTime < 19) {
            _optColor1.copy(SUNSET_COLOR).lerp(NIGHT_COLOR, (worldTime - 18));
        }
        // Middle of Night
        else {
            _optColor1.copy(NIGHT_COLOR);
        }
    }

    // Rain Override: Darken the sky if it's raining.
    if (isRaining) {
        const rainColor = new THREE.Color(0x445566);
        _optColor1.lerp(rainColor, 0.9);
        lightIntensity *= 0.5; // Darken light during rain
    }

    // Apply Visuals
    scene.background = _optColor1;
    scene.fog.color = _optColor1;

    // Move Sun/Moon
    const angle = ((worldTime - 6) / 24) * Math.PI * 2;
    const radius = 500; // Large radius to keep sun/moon far from terrain

    if (sunMesh) {
        sunMesh.position.x = Math.cos(angle) * radius;
        sunMesh.position.y = Math.sin(angle) * radius;
    }
    if (moonMesh) {
        moonMesh.position.x = Math.cos(angle + Math.PI) * radius;
        moonMesh.position.y = Math.sin(angle + Math.PI) * radius;
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
    const rainCount = 2000;
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];

    for (let i = 0; i < rainCount; i++) {
        // Random positions above the island
        positions.push((Math.random() - 0.5) * 200); // x
        positions.push(Math.random() * 50 + 10);     // y (height)
        positions.push((Math.random() - 0.5) * 200); // z
        velocities.push(0.4 + Math.random() * 0.3);  // Slower, gentler rain
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.userData = { velocities: velocities };

    // Create thin elongated rain streak texture
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Gradient from top (transparent) to bottom (blue-white)
    const gradient = ctx.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, 'rgba(150, 200, 255, 0)');
    gradient.addColorStop(0.2, 'rgba(180, 210, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(220, 235, 255, 0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, 64);

    const rainTexture = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
        color: 0xccddff,
        size: 0.4,
        transparent: true,
        opacity: 0.8,
        map: rainTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    rainSystem = new THREE.Points(geom, mat);
    rainSystem.visible = false; // Start off
    scene.add(rainSystem);
}

// --- THREE.JS SCENE SETUP ---
function setupThreeJS() {
    scene = new THREE.Scene();
    // Warm/Cozy Initial Background
    scene.background = new THREE.Color(0x9FD9FF);
    scene.fog = new THREE.Fog(0x9FD9FF, 20, 100);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

    // KEEP antialias: false for pixel art style
    renderer = new THREE.WebGLRenderer({ antialias: false });

    // --- SHADOW MAP ENABLED ---
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

    // --- PIXEL RATIO FIX ---
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    // -----------------------

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    document.getElementById('game-container').appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xFFEEB1, 0x080820, 0.25); // Darker ambient
    hemi.name = 'hemiLight';
    scene.add(hemi);

    // The Sun Light (Shadow caster)
    sunLight = new THREE.DirectionalLight(0xffffff, 1.1); // Reduced from 1.8 for less harsh brightness
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
    scene.add(sunLight);

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

    // Stars System (visible at night)
    const starCount = 500;
    const starGeom = new THREE.BufferGeometry();
    const starPositions = [];
    for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.4 + 0.1; // Upper hemisphere only
        const r = 150 + Math.random() * 50;
        starPositions.push(Math.sin(phi) * Math.cos(theta) * r);
        starPositions.push(Math.cos(phi) * r);
        starPositions.push(Math.sin(phi) * Math.sin(theta) * r);
    }
    starGeom.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0, fog: false });
    window.starSystem = new THREE.Points(starGeom, starMat);
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
        generateWorld("custom-level");
        createNPCs();
        createLocalPlayer();
        createRainSystem();
    } else {

    // Create HIGH QUALITY Grass Texture (Warmer/Vibrant Green)
    const grassTex = createNoiseTexture(256, 256, '#8FB38F', '#6B8E5F', 0.05, Math.random() * 100);
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(8, 8);

    // Generate Uneven Terrain
    const terrainGeo = new THREE.PlaneGeometry(ISLAND_RADIUS * 2, ISLAND_RADIUS * 2, 128, 128);
    terrainGeo.rotateX(-Math.PI / 2); // Rotate to be flat (Y-up)

    const posAttr = terrainGeo.attributes.position;
    const BEACH_WIDTH = 20; // Width of sandy beach area
    const EDGE_FALLOFF = 12; // Distance from edge where slope to water begins

    // Create vertex colors for grass-to-sand blend
    const colors = new Float32Array(posAttr.count * 3);
    const grassColor = new THREE.Color('#6B8E5F');
    const sandColor = new THREE.Color('#F0D060'); // Golden yellow sand

    for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const distFromCenter = Math.sqrt(x * x + z * z);

        // Use getTerrainHeight directly - it already has edge falloff built in
        const height = getTerrainHeight(x, z);
        posAttr.setY(i, height);

        // Apply colors based on distance from center
        if (distFromCenter > ISLAND_RADIUS - EDGE_FALLOFF) {
            // Slope zone and beyond - full sand color
            colors[i * 3] = sandColor.r;
            colors[i * 3 + 1] = sandColor.g;
            colors[i * 3 + 2] = sandColor.b;
        } else if (distFromCenter > ISLAND_RADIUS - BEACH_WIDTH) {
            // Beach zone - grass-to-sand blend
            const beachProgress = (distFromCenter - (ISLAND_RADIUS - BEACH_WIDTH)) / (BEACH_WIDTH - EDGE_FALLOFF);
            const blendFactor = Math.min(1, Math.max(0, beachProgress));
            const blendColor = grassColor.clone().lerp(sandColor, blendFactor);
            colors[i * 3] = blendColor.r;
            colors[i * 3 + 1] = blendColor.g;
            colors[i * 3 + 2] = blendColor.b;
        } else {
            // Interior - normal grass
            colors[i * 3] = grassColor.r;
            colors[i * 3 + 1] = grassColor.g;
            colors[i * 3 + 2] = grassColor.b;
        }
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
    oceanTex.repeat.set(20, 20);

    const oceanGeo = new THREE.PlaneGeometry(600, 600);
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
    ocean.position.y = -3; // Below the island
    scene.add(ocean);

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
    createCabin();

    createNPCs(); createLocalPlayer();
    createWaterfallZone();
    createRainSystem();
    createLavaWorld();

    } // end procedural island / custom-level branch

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
    });
}

function disposeTexture(texture) {
    if (texture && texture.dispose) {
        texture.dispose();
    }
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
    const grp = new THREE.Group();

    const cx = -40;
    const cz = 10;
    grp.position.set(cx, 0, cz);

    // --- MATERIALS ---
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 0.8 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x8D6E63 });

    // --- HELPER: Create Log ---
    function createLog(length, x, y, z, rotY = 0) {
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
            createLog(3.5, -4.5, y, -3.5, Math.PI / 2); // Left Back
            createLog(3.5, -4.5, y, 3.5, Math.PI / 2);  // Left Front
            createLog(3.5, 4.5, y, -3.5, Math.PI / 2);  // Right Back
            createLog(3.5, 4.5, y, 3.5, Math.PI / 2);   // Right Front
        } else {
            createLog(11, -4.5, y, 0, Math.PI / 2); // Left Full
            createLog(11, 4.5, y, 0, Math.PI / 2);  // Right Full
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
    ridge.rotation.x = Math.PI / 2;
    ridge.position.set(0, 6.7, 0);

    roofGroup.add(slope1, slope2, ridge);
    // Ensure roof parts receive shadows
    slope1.receiveShadow = true;
    slope2.receiveShadow = true;
    ridge.receiveShadow = true;
    grp.add(roofGroup);

    scene.add(grp);

    // --- 4. PHYSICS COLLIDERS ---
    staticColliders.push({ minX: cx - 5, maxX: cx + 5, minZ: cz - 5, maxZ: cz - 4 }); // Back
    staticColliders.push({ minX: cx - 5, maxX: cx - 4, minZ: cz - 5, maxZ: cz + 5 }); // Left
    staticColliders.push({ minX: cx + 4, maxX: cx + 5, minZ: cz - 5, maxZ: cz + 5 }); // Right
    staticColliders.push({ minX: cx - 5, maxX: cx - 1.5, minZ: cz + 4, maxZ: cz + 5 }); // Front L
    staticColliders.push({ minX: cx + 1.5, maxX: cx + 5, minZ: cz + 4, maxZ: cz + 5 }); // Front R
}


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

    // 4. Tutorial NPC (North - opposite of Bait Shop)
    npcTutorial = createPlayerMesh('#9370DB', "Tutorial", 'bow', '#000000', 'bunny');
    npcTutorial.position.set(0, 0, -(LAKE_RADIUS + 3));
    npcTutorial.lookAt(0, 0, 0);
    scene.add(npcTutorial);

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
    addIcon(npcTutorial, '❓');

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

    // --- CUSTOM LEVEL OVERRIDES ---
    // Move the NPCs to wherever the level editor placed them.
    if (window.CUSTOM_LEVEL && window.Level) {
        const lv = window.CUSTOM_LEVEL;
        const byType = { merchant: npcMerchant, stylist: npcStylist, bait: npcBait, tutorial: npcTutorial, lava: npcLavaKeeper };
        lv.npcs.forEach((n) => {
            const mesh = byType[n.type];
            if (!mesh) return;
            mesh.position.set(n.x, window.Level.sampleHeight(lv, n.x, n.z), n.z);
            // Face the way the editor rotated them (same convention as the
            // editor preview: rotation.y 0 = facing world +Z).
            mesh.rotation.y = Number(n.rot) || 0;
        });
    }
}

function addIcon(parent, text) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#FFD700'; ctx.font = '50px Arial'; ctx.textAlign = 'center'; ctx.fillText(text, 32, 50);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c) }));
    s.position.y = 3.6; parent.add(s);
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
}


function createToolTexture(type) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');

    if (type === 'axe') {
        // Handle
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(28, 10, 8, 44);
        // Head
        ctx.fillStyle = '#888888';
        ctx.beginPath();
        // Single bit axe shape
        ctx.moveTo(32, 10);
        ctx.lineTo(52, 10);
        ctx.lineTo(52, 26);
        ctx.lineTo(36, 26);
        ctx.lineTo(32, 22); // Curve in
        ctx.lineTo(20, 26); // Back bit (small)
        ctx.lineTo(20, 10);
        ctx.fill();
        // Edge
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(48, 10, 4, 16);
    } else if (type === 'pickaxe') {
        // Handle
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(28, 10, 8, 44);
        // Head
        ctx.fillStyle = '#888888';
        ctx.beginPath();
        // Arch shape
        ctx.moveTo(10, 16);
        ctx.quadraticCurveTo(32, 5, 54, 16);
        ctx.lineTo(50, 22);
        ctx.quadraticCurveTo(32, 12, 14, 22);
        ctx.closePath();
        ctx.fill();
    }

    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
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

// --- MODULAR CHARACTER DRAWING FUNCTIONS ---

// Draw the base body and head (shared by all characters)
function drawBody(ctx, col, bellyCol, back) {
    // Body (Flat Color) - Taller
    ctx.fillStyle = col;
    ctx.fillRect(20, 28, 24, 40); // Taller body

    if (!back) {
        ctx.fillStyle = bellyCol;
        // Rounded belly patch (adjusted)
        ctx.beginPath();
        ctx.ellipse(32, 48, 8, 12, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Head (Flat Color) - Taller
    ctx.fillStyle = col;
    ctx.fillRect(14, 8, 36, 28); // Taller head

    // Chin Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(14, 34, 36, 2);
}

// Helper for shading
function shadeColor(color, percent) {
    // Simple hex darken/lighten (assumes hex input)
    let f = parseInt(color.slice(1), 16), t = percent < 0 ? 0 : 255, p = percent < 0 ? percent * -1 : percent, R = f >> 16, G = f >> 8 & 0x00FF, B = f & 0x0000FF;
    return "#" + (0x1000000 + (Math.round((t - R) * p) + R) * 0x10000 + (Math.round((t - G) * p) + G) * 0x100 + (Math.round((t - B) * p) + B)).toString(16).slice(1);
}

// Draw ears based on selected type
// Draw ears based on selected type
function drawEars(ctx, earId, col, bellyCol, back) {
    ctx.fillStyle = col;
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
        ctx.fillStyle = col;
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
        ctx.fillStyle = col;
        // Floppy ears
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(10, 12); ctx.lineTo(10, 20); ctx.lineTo(18, 20); ctx.lineTo(20, 12); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(54, 12); ctx.lineTo(54, 20); ctx.lineTo(46, 20); ctx.lineTo(44, 12); ctx.fill();
        // Shadow underneath
        ctx.fillStyle = shadow;
        ctx.fillRect(10, 20, 8, 2); ctx.fillRect(46, 20, 8, 2);
    }
    else if (earId === 'bear') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(14, 8, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 8, 6, 0, Math.PI * 2); ctx.fill();

        if (!back) {
            ctx.fillStyle = shadow;
            ctx.beginPath(); ctx.arc(14, 8, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(50, 8, 3, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'fox') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(10, -5); ctx.lineTo(24, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(54, -5); ctx.lineTo(40, 10); ctx.fill();
        // Black tips
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.moveTo(11, 2); ctx.lineTo(10, -5); ctx.lineTo(17, 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(53, 2); ctx.lineTo(54, -5); ctx.lineTo(47, 2); ctx.fill();
    }
    else if (earId === 'pig') {
        ctx.fillStyle = col;
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
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(14, 6, 9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 6, 9, 0, Math.PI * 2); ctx.fill();
        if (!back) {
            ctx.fillStyle = bellyCol;
            ctx.beginPath(); ctx.arc(14, 6, 5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(50, 6, 5, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'raccoon') {
        ctx.fillStyle = col;
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
        ctx.fillStyle = col;
        ctx.ellipse(8, 16, 6, 3, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.ellipse(56, 16, 6, 3, -0.4, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'monkey') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(10, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(54, 20, 5, 0, Math.PI * 2); ctx.fill();
        if (!back) {
            ctx.fillStyle = shadow;
            ctx.beginPath(); ctx.arc(10, 20, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(54, 20, 3, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'protogen') {
        // Robotic angular ears
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(8, -6); ctx.lineTo(24, 10); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(56, -6); ctx.lineTo(40, 10); ctx.closePath(); ctx.fill();
        // Glow Accent
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(10, 0, 2, 8); ctx.fillRect(52, 0, 2, 8);
    }
    // New types maintained with simple improvements
    else if (earId === 'wolf') {
        ctx.fillStyle = col;
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
}

function createToolTexture(type) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');

    if (type === 'axe') {
        // Handle
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(28, 10, 8, 44);
        // Head
        ctx.fillStyle = '#888888';
        ctx.beginPath();
        // Single bit axe shape
        ctx.moveTo(32, 10);
        ctx.lineTo(52, 10);
        ctx.lineTo(52, 26);
        ctx.lineTo(36, 26);
        ctx.lineTo(32, 22); // Curve in
        ctx.lineTo(20, 26); // Back bit (small)
        ctx.lineTo(20, 10);
        ctx.fill();
        // Edge
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(48, 10, 4, 16);
    } else if (type === 'pickaxe') {
        // Handle
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(28, 10, 8, 44);
        // Head
        ctx.fillStyle = '#888888';
        ctx.beginPath();
        // Arch shape
        ctx.moveTo(10, 16);
        ctx.quadraticCurveTo(32, 5, 54, 16);
        ctx.lineTo(50, 22);
        ctx.quadraticCurveTo(32, 12, 14, 22);
        ctx.closePath();
        ctx.fill();
    }

    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
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

    if (!back) {
        ctx.save();
        rrect(ctx, HX, HY, HW, HH, 7);
        ctx.clip();
        // Soft highlight on the upper-left of the head.
        const hl = ctx.createRadialGradient(27, 15, 1, 27, 15, 17);
        hl.addColorStop(0, 'rgba(255,255,255,0.30)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl;
        ctx.fillRect(HX, HY, HW, HH);
        // Side shading.
        const hside = ctx.createLinearGradient(HX, 0, HX + HW, 0);
        hside.addColorStop(0, 'rgba(0,0,0,0.12)');
        hside.addColorStop(0.3, 'rgba(0,0,0,0)');
        hside.addColorStop(0.7, 'rgba(0,0,0,0)');
        hside.addColorStop(1, 'rgba(0,0,0,0.12)');
        ctx.fillStyle = hside;
        ctx.fillRect(HX, HY, HW, HH);
        // Chin / neck shadow where the head meets the torso.
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fillRect(HX, 33, HW, 3);
        ctx.restore();
    }
}

// Helper for shading
function shadeColor(color, percent) {
    // Simple hex darken/lighten (assumes hex input)
    let f = parseInt(color.slice(1), 16), t = percent < 0 ? 0 : 255, p = percent < 0 ? percent * -1 : percent, R = f >> 16, G = f >> 8 & 0x00FF, B = f & 0x0000FF;
    return "#" + (0x1000000 + (Math.round((t - R) * p) + R) * 0x10000 + (Math.round((t - G) * p) + G) * 0x100 + (Math.round((t - B) * p) + B)).toString(16).slice(1);
}

// Draw ears based on selected type
// Draw ears based on selected type
function drawEars(ctx, earId, col, bellyCol, back) {
    ctx.fillStyle = col;
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
        ctx.fillStyle = col;
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
        ctx.fillStyle = col;
        // Floppy ears
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(10, 12); ctx.lineTo(10, 20); ctx.lineTo(18, 20); ctx.lineTo(20, 12); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(54, 12); ctx.lineTo(54, 20); ctx.lineTo(46, 20); ctx.lineTo(44, 12); ctx.fill();
        // Shadow underneath
        ctx.fillStyle = shadow;
        ctx.fillRect(10, 20, 8, 2); ctx.fillRect(46, 20, 8, 2);
    }
    else if (earId === 'bear') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(14, 8, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 8, 6, 0, Math.PI * 2); ctx.fill();

        if (!back) {
            ctx.fillStyle = shadow;
            ctx.beginPath(); ctx.arc(14, 8, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(50, 8, 3, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'fox') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(10, -5); ctx.lineTo(24, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(54, -5); ctx.lineTo(40, 10); ctx.fill();
        // Black tips
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.moveTo(11, 2); ctx.lineTo(10, -5); ctx.lineTo(17, 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(53, 2); ctx.lineTo(54, -5); ctx.lineTo(47, 2); ctx.fill();
    }
    else if (earId === 'pig') {
        ctx.fillStyle = col;
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
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(14, 6, 9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 6, 9, 0, Math.PI * 2); ctx.fill();
        if (!back) {
            ctx.fillStyle = bellyCol;
            ctx.beginPath(); ctx.arc(14, 6, 5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(50, 6, 5, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'raccoon') {
        ctx.fillStyle = col;
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
        ctx.fillStyle = col;
        ctx.ellipse(8, 16, 6, 3, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.ellipse(56, 16, 6, 3, -0.4, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'monkey') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(10, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(54, 20, 5, 0, Math.PI * 2); ctx.fill();
        if (!back) {
            ctx.fillStyle = shadow;
            ctx.beginPath(); ctx.arc(10, 20, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(54, 20, 3, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'protogen') {
        // Robotic angular ears
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(8, -6); ctx.lineTo(24, 10); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(56, -6); ctx.lineTo(40, 10); ctx.closePath(); ctx.fill();
        // Glow Accent
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(10, 0, 2, 8); ctx.fillRect(52, 0, 2, 8);
    }
    // New types maintained with simple improvements
    else if (earId === 'wolf') {
        ctx.fillStyle = col;
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
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(16, 10); ctx.lineTo(14, -2); ctx.lineTo(22, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(48, 10); ctx.lineTo(50, -2); ctx.lineTo(42, 10); ctx.fill();
    }
    else if (earId === 'bat') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(10, 14); ctx.lineTo(6, -6); ctx.lineTo(26, 14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(54, 14); ctx.lineTo(58, -6); ctx.lineTo(38, 14); ctx.fill();
        if (!back) {
            ctx.fillStyle = bellyCol;
            ctx.beginPath(); ctx.moveTo(12, 12); ctx.lineTo(10, 0); ctx.lineTo(22, 12); ctx.fill();
            ctx.beginPath(); ctx.moveTo(52, 12); ctx.lineTo(54, 0); ctx.lineTo(42, 12); ctx.fill();
        }
    }
    else if (earId === 'shark') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(18, 0); ctx.lineTo(22, 14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(42, 14); ctx.lineTo(46, 0); ctx.lineTo(50, 14); ctx.fill();
    }
    else if (earId === 'tiger' || earId === 'leopard') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(16, 8, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(48, 8, 6, 0, Math.PI * 2); ctx.fill();
        if (!back) {
            ctx.fillStyle = bellyCol; // White spot
            ctx.beginPath(); ctx.arc(16, 8, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(48, 8, 3, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'rhino') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(14, 12, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 12, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'elephant') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(8, 20, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(56, 20, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'hippo' || earId === 'otter' || earId === 'beaver' || earId === 'ferret') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(14, 8, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 8, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'giraffe' || earId === 'zebra') {
        ctx.fillStyle = col;
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

    if (eyeId === 'standard') {
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
// col is the custom misc color
// Draw misc extras (wings, gills, mane, mask, etc.)
// col is the custom misc color
function drawMisc(ctx, miscId, col, bellyCol, back) {
    if (miscId === 'none') return;
    const shade = shadeColor(col, -0.2);

    if (miscId === 'fox_cheeks') {
        if (!back) {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.moveTo(14, 34); ctx.quadraticCurveTo(23, 38, 32, 34); ctx.lineTo(14, 24); ctx.fill();
            ctx.beginPath(); ctx.moveTo(50, 34); ctx.quadraticCurveTo(41, 38, 32, 34); ctx.lineTo(50, 24); ctx.fill();
        }
    }
    else if (miscId === 'dragon_wings') {
        ctx.fillStyle = col;
        // Left Wing
        ctx.beginPath(); ctx.moveTo(22, 35); ctx.quadraticCurveTo(10, 20, 4, 25); ctx.lineTo(14, 45); ctx.fill();
        // Right Wing
        ctx.beginPath(); ctx.moveTo(42, 35); ctx.quadraticCurveTo(54, 20, 60, 25); ctx.lineTo(50, 45); ctx.fill();
        // Spines
        ctx.fillStyle = shade;
        ctx.beginPath(); ctx.moveTo(4, 25); ctx.lineTo(2, 22); ctx.lineTo(6, 24); ctx.fill();
        ctx.beginPath(); ctx.moveTo(60, 25); ctx.lineTo(62, 22); ctx.lineTo(58, 24); ctx.fill();
    }
    else if (miscId === 'axolotl_gills') {
        ctx.fillStyle = col;
        // Rounded gills
        for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.ellipse(11, 15 + i * 4, 4, 2, -0.2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(53, 15 + i * 4, 4, 2, 0.2, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (miscId === 'raccoon_mask') {
        if (!back) {
            ctx.fillStyle = col;
            ctx.fillRect(14, 18, 36, 8);
            ctx.beginPath(); ctx.moveTo(14, 26); ctx.lineTo(32, 30); ctx.lineTo(50, 26); ctx.fill();
        }
    }
    else if (miscId === 'lion_mane') {
        ctx.fillStyle = col;
        if (!back) {
            ctx.beginPath(); ctx.roundRect(10, 8, 44, 28, 4); ctx.fill();
            ctx.clearRect(14, 10, 36, 24); // Clear face area
        } else {
            ctx.beginPath(); ctx.roundRect(10, 8, 44, 28, 4); ctx.fill();
        }
        // Texture
        ctx.fillStyle = shade;
        ctx.beginPath(); ctx.arc(10, 10, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(54, 10, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(10, 36, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(54, 36, 2, 0, Math.PI * 2); ctx.fill();
    }
    else if (miscId === 'penguin_belly') {
        if (!back) {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.ellipse(32, 45, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(20, 30, 24, 30);
        }
    }
    else if (miscId === 'protogen_visor') {
        if (!back) {
            ctx.fillStyle = col;
            ctx.roundRect(14, 10, 36, 24, 4); ctx.fill();
            // Edge
            ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
            ctx.roundRect(14, 10, 36, 24, 4); ctx.stroke();
            // Vents
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(14, 14, 3, 4); ctx.fillRect(47, 14, 3, 4);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(14, 19, 3, 2); ctx.fillRect(47, 19, 3, 2);
        } else {
            ctx.fillStyle = col;
            ctx.roundRect(14, 10, 36, 24, 4); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(30, 12, 4, 2); ctx.fillRect(28, 30, 8, 2);
        }
    }
    else if (miscId === 'wolf_ruff') {
        const ruffCol = col;
        ctx.fillStyle = ruffCol;
        if (!back) {
            ctx.beginPath();
            ctx.moveTo(18, 32);
            ctx.lineTo(24, 38); ctx.lineTo(32, 34); ctx.lineTo(40, 38);
            ctx.lineTo(46, 32); ctx.lineTo(46, 38); ctx.lineTo(18, 38);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.moveTo(16, 30); ctx.lineTo(24, 38); ctx.lineTo(32, 32); ctx.lineTo(40, 38); ctx.lineTo(48, 30);
            ctx.lineTo(48, 38); ctx.lineTo(16, 38); ctx.fill();
        }
    }
    else if (miscId === 'deer_spots') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.arc(24, 40, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 38, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(30, 48, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(38, 50, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    else if (miscId === 'owl_feathers') {
        if (!back) {
            ctx.fillStyle = shade;
            for (let y = 36; y < 56; y += 4) {
                for (let x = 22; x < 42; x += 4) {
                    ctx.beginPath(); ctx.arc(x + (y % 8) / 2, y, 2.5, 0, Math.PI, false); ctx.fill();
                }
            }
        }
    }
    else if (miscId === 'bat_wings') {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(20, 35); ctx.quadraticCurveTo(0, 20, -5, 25); ctx.lineTo(4, 40); ctx.lineTo(10, 35); ctx.lineTo(12, 50);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(44, 35); ctx.quadraticCurveTo(64, 20, 69, 25); ctx.lineTo(60, 40); ctx.lineTo(54, 35); ctx.lineTo(52, 50);
        ctx.fill();
    }
    else if (miscId === 'shark_fin') {
        if (back) {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.moveTo(28, 40); ctx.lineTo(32, 25); ctx.lineTo(36, 40); ctx.fill();
            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.beginPath(); ctx.moveTo(31, 28); ctx.lineTo(32, 25); ctx.lineTo(33, 28); ctx.fill();
        }
    }
    else if (miscId === 'dolphin_fin') {
        if (back) {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.moveTo(30, 42); ctx.quadraticCurveTo(32, 30, 36, 42); ctx.fill();
        }
    }
    else if (miscId === 'snake_scales') {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for (let y = 36; y < 58; y += 4) {
            for (let x = 22 + ((y / 4) % 2) * 2; x < 42; x += 4) {
                ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
            }
        }
    }
    else if (miscId === 'tiger_stripes') {
        ctx.fillStyle = '#222';
        // Tapered stripes
        ctx.beginPath(); ctx.moveTo(22, 38); ctx.lineTo(24, 46); ctx.lineTo(20, 42); ctx.fill();
        ctx.beginPath(); ctx.moveTo(42, 38); ctx.lineTo(40, 46); ctx.lineTo(44, 42); ctx.fill();
        ctx.fillRect(28, 36, 2, 12); ctx.fillRect(34, 36, 2, 12);
        ctx.fillRect(18, 16, 2, 6); ctx.fillRect(44, 16, 2, 6);
    }
    else if (miscId === 'leopard_spots') {
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(26, 40, 2.5, 0, Math.PI * 1.5); ctx.stroke();
        ctx.beginPath(); ctx.arc(38, 42, 2.5, 1, Math.PI * 2.5); ctx.stroke();
        ctx.beginPath(); ctx.arc(30, 50, 2.5, 2, Math.PI * 0.5); ctx.stroke();
    }
    else if (miscId === 'zebra_stripes') {
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.moveTo(22, 36); ctx.lineTo(24, 56); ctx.lineTo(20, 46); ctx.fill();
        ctx.beginPath(); ctx.moveTo(42, 36); ctx.lineTo(40, 56); ctx.lineTo(44, 46); ctx.fill();
        ctx.fillRect(30, 36, 4, 20);
    }
    else if (miscId === 'panda_patches') {
        if (!back) {
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.ellipse(22, 20, 7, 6, -0.3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(42, 20, 7, 6, 0.3, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (miscId === 'skunk_stripe') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(30, 10, 4, 50);
        // Fluff edges
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(29, 10, 6, 50);
    }
    else if (miscId === 'otter_belly') {
        if (!back) {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.ellipse(32, 45, 10, 12, 0, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (miscId === 'hedgehog_spines') {
        if (back) {
            ctx.fillStyle = '#8B4513';
            for (let x = 18; x < 46; x += 3) {
                ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x + 1.5, 26); ctx.lineTo(x + 3, 34); ctx.fill();
                // Tip highlight
                ctx.fillStyle = '#D2691E';
                ctx.beginPath(); ctx.moveTo(x + 1, 28); ctx.lineTo(x + 1.5, 26); ctx.lineTo(x + 2, 28); ctx.fill();
                ctx.fillStyle = '#8B4513';
            }
        }
    }
    else if (miscId === 'squirrel_cheeks' || miscId === 'hamster_cheeks') {
        if (!back) {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(16, 26, 6, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(48, 26, 6, 0, Math.PI * 2); ctx.fill();
            // Shade
            ctx.fillStyle = 'rgba(0,0,0,0.05)';
            ctx.beginPath(); ctx.arc(16, 28, 4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(48, 28, 4, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (miscId === 'freckles') {
        if (!back) {
            ctx.fillStyle = 'rgba(139,69,19,0.5)';
            const spots = [[18, 26], [22, 28], [20, 24], [42, 26], [46, 28], [44, 24]];
            spots.forEach(p => {
                ctx.beginPath(); ctx.arc(p[0], p[1], 1.2, 0, Math.PI * 2); ctx.fill();
            });
        }
    }
    else if (miscId === 'blush') {
        if (!back) {
            ctx.fillStyle = 'rgba(255,100,150,0.4)';
            ctx.filter = 'blur(1px)';
            ctx.beginPath(); ctx.ellipse(18, 26, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(46, 26, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
            ctx.filter = 'none';
        }
    }
    else if (miscId === 'scars') {
        if (!back) {
            ctx.strokeStyle = 'rgba(100,50,50,0.7)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(16, 18); ctx.lineTo(22, 26); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(18, 18); ctx.lineTo(24, 26); ctx.stroke();
        }
    }
    else if (miscId === 'bandage') {
        if (!back) {
            ctx.fillStyle = '#f5f5dc';
            ctx.roundRect(40, 14, 10, 6, 2); ctx.fill();
            ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(43, 14); ctx.lineTo(43, 20); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(47, 14); ctx.lineTo(47, 20); ctx.stroke();
        }
    }
    else if (miscId === 'whiskers_long') {
        if (!back) {
            ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(10, 24); ctx.quadraticCurveTo(18, 25, 26, 26); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(10, 28); ctx.lineTo(26, 28); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(10, 32); ctx.quadraticCurveTo(18, 31, 26, 30); ctx.stroke();

            ctx.beginPath(); ctx.moveTo(54, 24); ctx.quadraticCurveTo(46, 25, 38, 26); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(54, 28); ctx.lineTo(38, 28); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(54, 32); ctx.quadraticCurveTo(46, 31, 38, 30); ctx.stroke();
        }
    }
    else if (miscId === 'angel_wings') {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(20, 38); ctx.quadraticCurveTo(0, 25, 4, 45); ctx.lineTo(10, 40); ctx.lineTo(14, 52); ctx.fill();
        ctx.beginPath(); ctx.moveTo(44, 38); ctx.quadraticCurveTo(64, 25, 60, 45); ctx.lineTo(54, 40); ctx.lineTo(50, 52); ctx.fill();
        // Feathers
        ctx.fillStyle = '#eee';
        ctx.beginPath(); ctx.arc(5, 40, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(59, 40, 2, 0, Math.PI * 2); ctx.fill();
    }
    else if (miscId === 'demon_horns') {
        ctx.fillStyle = '#cc0000';
        ctx.beginPath(); ctx.moveTo(18, 12); ctx.quadraticCurveTo(10, -5, 22, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(46, 12); ctx.quadraticCurveTo(54, -5, 42, 10); ctx.fill();
        // Highlight
        ctx.fillStyle = '#ff4444';
        ctx.beginPath(); ctx.moveTo(18, 10); ctx.lineTo(14, 0); ctx.lineTo(16, 0); ctx.fill();
    }
    else if (miscId === 'halo') {
        ctx.strokeStyle = '#ffdd00'; ctx.lineWidth = 3;
        ctx.shadowColor = '#ffdd00'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.ellipse(32, -4, 12, 4, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
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

// Main drawing function - accepts either species string (legacy) or parts object
// partColors is optional: { earsColor, noseColor, miscColor, tailColor }
function drawSpecies(ctx, speciesOrParts, col, bellyCol, eyeCol, back, partColors) {
    ctx.clearRect(0, -30, 64, 105); // Clear full area including big ears/hats

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

    // Draw in correct order for proper layering
    drawBody(ctx, col, bellyCol, back);
    drawTail(ctx, parts.tail, tailCol, bellyCol, back);
    drawMisc(ctx, parts.misc, miscCol, bellyCol, back);
    drawEars(ctx, parts.ears, earsCol, bellyCol, back);

    if (!back) {
        drawEyes(ctx, parts.eyes, eyeCol);
        drawNose(ctx, parts.nose, bellyCol, noseCol);
    }
}

// Helper to keep face sizes consistent across all species
function drawStandardFace(ctx, eyeCol) {
    ctx.fillStyle = 'white'; ctx.fillRect(20, 18, 8, 8); ctx.fillRect(36, 18, 8, 8);
    ctx.fillStyle = eyeCol; ctx.fillRect(24, 20, 4, 4); ctx.fillRect(40, 20, 4, 4);
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

// Draws fur patterns on the body and head (not covered by shirts)
function drawPattern(ctx, patternId, col, back) {
    if (!patternId || patternId === 'none') return;

    const pattern = typeof PATTERN_TYPES !== 'undefined' ? PATTERN_TYPES.find(p => p.id === patternId) : null;
    if (!pattern) return;

    const patternColor = pattern.color || '#000000';
    ctx.fillStyle = patternColor;

    // Only draw on HEAD area (14, 10, 36, 24) to avoid overlapping with shirts on body
    // Head coordinates: x=14, y=10, w=36, h=24

    if (patternId === 'spots') {
        // Spots on body (primary) and head (secondary)
        const bodySpots = [[26, 38], [38, 42], [30, 50], [22, 46], [36, 54]];
        const headSpots = [[20, 18], [44, 20]];
        [...bodySpots, ...headSpots].forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    else if (patternId === 'stripes') {
        // Tiger stripes on body and head
        ctx.fillRect(22, 35, 20, 3);
        ctx.fillRect(22, 42, 20, 3);
        ctx.fillRect(22, 49, 20, 3);
        ctx.fillRect(18, 14, 3, 8);
        ctx.fillRect(43, 14, 3, 8);
    }
    else if (patternId === 'calico') {
        // Calico patches on body (orange and black)
        ctx.fillStyle = '#ff8c00';
        ctx.fillRect(22, 34, 8, 10);
        ctx.fillStyle = '#000000';
        ctx.fillRect(34, 40, 8, 12);
        ctx.fillStyle = '#ff8c00';
        ctx.fillRect(26, 50, 10, 8);
        ctx.fillStyle = '#000000';
        ctx.fillRect(38, 14, 8, 8);
    }
    else if (patternId === 'tuxedo') {
        // White chest (front only)
        if (!back) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(26, 36, 12, 18);
            ctx.fillRect(28, 28, 8, 6);
        }
    }
    else if (patternId === 'tabby') {
        // Tabby stripes on body + M forehead
        ctx.save();
        ctx.translate(32, 45);
        ctx.rotate(0.3);
        ctx.fillRect(-10, -8, 3, 16);
        ctx.fillRect(-4, -10, 3, 20);
        ctx.fillRect(2, -8, 3, 16);
        ctx.fillRect(8, -6, 3, 12);
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(20, 18);
        ctx.lineTo(26, 10);
        ctx.lineTo(32, 16);
        ctx.lineTo(38, 10);
        ctx.lineTo(44, 18);
        ctx.lineWidth = 2;
        ctx.strokeStyle = patternColor;
        ctx.stroke();
    }
    else if (patternId === 'dalmatian') {
        // Black spots on body and head
        const spots = [[26, 36, 4], [38, 40, 3], [30, 48, 5], [24, 54, 3], [40, 52, 4], [20, 16, 3], [42, 18, 4]];
        spots.forEach(([x, y, r]) => {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    else if (patternId === 'cow') {
        // Irregular black patches on body and head
        ctx.beginPath();
        ctx.ellipse(28, 40, 7, 5, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(38, 52, 6, 8, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(40, 18, 5, 4, 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    else if (patternId === 'hearts') {
        // Hearts on body and head
        const drawHeart = (x, y, size) => {
            ctx.beginPath();
            ctx.moveTo(x, y + size / 4);
            ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + size / 4);
            ctx.bezierCurveTo(x - size / 2, y + size / 2, x, y + size * 0.7, x, y + size);
            ctx.bezierCurveTo(x, y + size * 0.7, x + size / 2, y + size / 2, x + size / 2, y + size / 4);
            ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + size / 4);
            ctx.fill();
        };
        drawHeart(28, 38, 8);
        drawHeart(38, 48, 6);
        drawHeart(32, 16, 5);
    }
    else if (patternId === 'stars') {
        // Stars on body and head
        const drawStar = (cx, cy, size) => {
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
                const x = cx + Math.cos(angle) * size;
                const y = cy + Math.sin(angle) * size;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
        };
        drawStar(28, 40, 5);
        drawStar(38, 50, 4);
        drawStar(32, 18, 4);
    }
}

// VISUAL UPGRADE: Detailed Hair with Shading \u0026 Highlights
function drawHair(ctx, hairId, col, back) {
    if (!hairId || hairId === 'none') return;
    const hair = HAIR_TYPES.find(h => h.id === hairId);
    if (!hair) return;

    // Base Color
    ctx.fillStyle = col || '#ffffff';

    // Highlight Color (Lighten base)
    const highlight = shadeColor(col || '#ffffff', 0.3);
    const shadow = shadeColor(col || '#ffffff', -0.2);

    if (back) {
        // --- BACK VIEW (Shading & Highlights) ---
        if (hair.id === 'messy') {
            ctx.beginPath(); ctx.moveTo(18, 14); ctx.lineTo(46, 14); ctx.lineTo(50, 24); ctx.lineTo(42, 32); ctx.lineTo(22, 32); ctx.lineTo(14, 24); ctx.fill();
            ctx.fillStyle = shadow; ctx.fillRect(20, 28, 4, 4); ctx.fillRect(40, 28, 4, 4);
        } else if (hair.id === 'bob') {
            ctx.fillRect(16, 10, 32, 24);
            ctx.fillStyle = highlight; ctx.fillRect(16, 12, 32, 4);
            ctx.fillStyle = shadow; ctx.fillRect(16, 32, 32, 2);
        } else if (hair.id === 'long') {
            ctx.fillRect(16, 10, 32, 38);
            ctx.fillStyle = highlight; ctx.fillRect(18, 12, 28, 4);
            ctx.fillStyle = shadow; ctx.fillRect(16, 42, 32, 6);
        } else if (hair.id === 'spiky') {
            ctx.beginPath(); ctx.moveTo(14, 20); ctx.lineTo(18, 8); ctx.lineTo(24, 20); ctx.lineTo(32, 6); ctx.lineTo(40, 20); ctx.lineTo(46, 8); ctx.lineTo(50, 20); ctx.lineTo(48, 26); ctx.lineTo(16, 26); ctx.fill();
            ctx.fillStyle = highlight; ctx.fillRect(20, 18, 4, 4); ctx.fillRect(40, 18, 4, 4);
        } else if (hair.id === 'ponytail') {
            ctx.beginPath(); ctx.arc(32, 16, 14, 0, Math.PI * 2); ctx.fill();
            ctx.fillRect(28, 20, 8, 26);
            ctx.fillStyle = shadow; ctx.fillRect(29, 44, 6, 2);
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(28, 28, 8, 2); // Scrunchie
        } else if (hair.id === 'pigtails' || hair.id === 'twintails') {
            ctx.fillRect(11, 16, 7, 26); ctx.fillRect(46, 16, 7, 26);
            ctx.beginPath(); ctx.arc(32, 16, 14, 0, Math.PI, true); ctx.fill();
            ctx.fillStyle = shadow; ctx.fillRect(11, 40, 7, 2); ctx.fillRect(46, 40, 7, 2);
        } else if (hair.id === 'afro') {
            ctx.beginPath(); ctx.arc(32, 12, 20, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = shadow; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(25, 12, 3, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(39, 12, 3, 0, Math.PI * 2); ctx.stroke();
        } else if (hair.id === 'dreads') {
            ctx.fillRect(16, 10, 32, 14);
            for (let dx = 16; dx <= 44; dx += 4) {
                ctx.fillStyle = (dx % 8 === 0) ? shadow : col;
                ctx.fillRect(dx, 20, 3, 22);
                ctx.fillStyle = '#d4af37'; ctx.fillRect(dx, 36, 3, 1.5); // Golden dread rings
            }
        } else if (hair.id === 'braid') {
            ctx.beginPath(); ctx.arc(32, 16, 14, 0, Math.PI * 2); ctx.fill();
            for (let by = 22; by < 46; by += 4) {
                ctx.fillStyle = (by % 8 === 0) ? highlight : col;
                ctx.fillRect(29, by, 6, 3.5);
            }
            ctx.fillStyle = shadow; ctx.fillRect(30.5, 46, 3, 4); // Tail tip
        } else if (hair.id === 'curly') {
            ctx.beginPath(); ctx.arc(32, 14, 18, 0, Math.PI * 2); ctx.fill();
            for (let cy = 12; cy <= 32; cy += 6) {
                ctx.fillStyle = shadow;
                ctx.fillRect(14, cy, 5, 4); ctx.fillRect(45, cy, 5, 4);
            }
        } else if (hair.id === 'emo' || hair.id === 'sidepart') {
            ctx.fillRect(16, 10, 32, 24);
            ctx.fillStyle = highlight; ctx.fillRect(18, 12, 28, 4);
            ctx.fillStyle = shadow; ctx.fillRect(14, 22, 6, 14);
        } else if (hair.id === 'pompadour') {
            ctx.fillRect(16, 12, 32, 20);
            ctx.fillStyle = highlight; ctx.fillRect(22, 4, 20, 8);
        } else if (hair.id === 'shaggy') {
            ctx.fillRect(16, 10, 32, 28);
            ctx.fillStyle = shadow;
            ctx.fillRect(14, 30, 6, 8); ctx.fillRect(24, 34, 6, 6); ctx.fillRect(34, 34, 6, 6); ctx.fillRect(44, 30, 6, 8);
        } else if (hair.id === 'topknot' || hair.id === 'bun') {
            ctx.beginPath(); ctx.arc(32, 16, 14, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(32, 6, 7, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = shadow; ctx.beginPath(); ctx.arc(32, 6, 3.5, 0, Math.PI * 2); ctx.fill();
        } else {
            // General clean fallback for wavy, bangs, mohawk, buzzed, undercut, mullet, pixie, slicked
            ctx.fillStyle = col || '#ffffff';
            if (hair.id === 'wavy') {
                ctx.beginPath(); ctx.moveTo(16, 12); ctx.quadraticCurveTo(8, 24, 16, 38); ctx.lineTo(48, 38); ctx.quadraticCurveTo(56, 24, 48, 12); ctx.fill();
                ctx.fillStyle = highlight; ctx.fillRect(20, 14, 24, 4);
            } else if (hair.id === 'bangs') {
                ctx.fillRect(16, 10, 32, 26);
                ctx.fillStyle = highlight; ctx.fillRect(18, 12, 28, 4);
            } else if (hair.id === 'mohawk') {
                ctx.fillRect(27, 4, 10, 30);
                ctx.fillStyle = highlight; ctx.fillRect(29, 6, 6, 26);
            } else if (hair.id === 'buzzed') {
                ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(32, 18, 14, Math.PI, 0); ctx.fill();
            } else if (hair.id === 'undercut') {
                ctx.fillRect(20, 8, 24, 14);
                ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(16, 18, 32, 10);
            } else if (hair.id === 'mullet') {
                ctx.fillRect(20, 10, 24, 14);
                ctx.fillRect(16, 20, 32, 24);
                ctx.fillStyle = shadow; ctx.fillRect(16, 40, 32, 4);
            } else if (hair.id === 'pixie' || hair.id === 'slicked') {
                ctx.fillRect(16, 10, 32, 18);
                ctx.fillStyle = highlight; ctx.fillRect(18, 12, 28, 3.5);
            }
        }
    } else {
        // --- FRONT VIEW (Shading, Parting & Volumetric Layers) ---
        if (hair.id === 'messy') {
            ctx.beginPath(); ctx.moveTo(18, 14); ctx.lineTo(24, 18); ctx.lineTo(32, 12); ctx.lineTo(40, 18); ctx.lineTo(46, 14); ctx.lineTo(50, 22); ctx.lineTo(48, 26); ctx.lineTo(16, 26); ctx.lineTo(14, 22); ctx.fill();
            ctx.fillStyle = highlight; ctx.fillRect(22, 16, 4, 4); ctx.fillRect(38, 16, 4, 4);
        } else if (hair.id === 'bob') {
            ctx.fillRect(16, 10, 32, 26);
            ctx.clearRect(24, 26, 16, 10);
            ctx.fillStyle = highlight; ctx.fillRect(16, 12, 32, 4);
            ctx.fillStyle = shadow; ctx.fillRect(16, 32, 8, 4); ctx.fillRect(40, 32, 8, 4);
        } else if (hair.id === 'long') {
            ctx.fillRect(16, 10, 32, 38);
            ctx.clearRect(22, 26, 20, 22);
            ctx.fillStyle = highlight; ctx.fillRect(16, 12, 32, 4);
            ctx.fillStyle = shadow; ctx.fillRect(16, 42, 6, 6); ctx.fillRect(42, 42, 6, 6);
        } else if (hair.id === 'spiky') {
            ctx.beginPath(); ctx.moveTo(14, 20); ctx.lineTo(18, 8); ctx.lineTo(24, 20); ctx.lineTo(32, 6); ctx.lineTo(40, 20); ctx.lineTo(46, 8); ctx.lineTo(50, 20); ctx.lineTo(50, 24); ctx.lineTo(14, 24); ctx.fill();
            ctx.fillStyle = highlight; ctx.fillRect(22, 12, 6, 6); ctx.fillRect(36, 12, 6, 6);
        } else if (hair.id === 'bangs') {
            ctx.fillRect(16, 10, 32, 15);
            ctx.fillRect(14, 14, 5, 20);
            ctx.fillRect(45, 14, 5, 20);
            ctx.fillStyle = highlight; ctx.fillRect(18, 12, 28, 4);
            ctx.fillStyle = shadow; ctx.fillRect(18, 24, 28, 1.5);
        } else if (hair.id === 'ponytail') {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(32, 16, 14, Math.PI, 0); ctx.fill();
            ctx.fillRect(14, 16, 4, 12); ctx.fillRect(46, 16, 4, 12);
            ctx.fillStyle = highlight; ctx.fillRect(20, 12, 24, 3);
        } else if (hair.id === 'pigtails' || hair.id === 'twintails') {
            ctx.beginPath(); ctx.arc(32, 16, 14, Math.PI, 0); ctx.fill();
            ctx.fillRect(11, 16, 6, 26); ctx.fillRect(47, 16, 6, 26);
            ctx.fillStyle = highlight; ctx.fillRect(20, 12, 24, 3);
            ctx.fillStyle = shadow; ctx.fillRect(11, 38, 6, 4); ctx.fillRect(47, 38, 6, 4);
        } else if (hair.id === 'afro') {
            ctx.beginPath(); ctx.arc(32, 12, 20, 1, 2 * Math.PI + 2); ctx.fill();
            ctx.strokeStyle = highlight; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(32, 12, 16, 3.5, 6); ctx.stroke();
        } else if (hair.id === 'dreads') {
            ctx.fillRect(16, 10, 32, 10);
            for (let dx = 14; dx <= 46; dx += 4) {
                if (dx > 22 && dx < 38) continue; // Face clearing
                ctx.fillStyle = (dx % 8 === 0) ? shadow : col;
                ctx.fillRect(dx, 16, 3.5, 22);
                ctx.fillStyle = '#d4af37'; ctx.fillRect(dx, 32, 3.5, 1.5);
            }
        } else if (hair.id === 'braid') {
            ctx.beginPath(); ctx.arc(32, 16, 14, Math.PI, 0); ctx.fill();
            ctx.fillRect(14, 16, 5, 14); // Front bangs
            for (let by = 26; by < 46; by += 4) {
                ctx.fillStyle = (by % 8 === 0) ? highlight : col;
                ctx.fillRect(44, by, 6, 3.5); // Side braid draped over shoulder
            }
        } else if (hair.id === 'curly') {
            ctx.beginPath(); ctx.arc(32, 14, 18, 1, 2 * Math.PI + 2); ctx.fill();
            ctx.clearRect(24, 26, 16, 10);
            ctx.fillStyle = highlight; ctx.beginPath(); ctx.arc(26, 14, 4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(38, 14, 4, 0, Math.PI * 2); ctx.fill();
        } else if (hair.id === 'emo') {
            // Swept diagonal bangs over one eye
            ctx.beginPath();
            ctx.moveTo(14, 12); ctx.lineTo(50, 12); ctx.lineTo(46, 20); ctx.lineTo(20, 32); ctx.lineTo(14, 28); ctx.closePath();
            ctx.fill();
            ctx.fillStyle = highlight; ctx.fillRect(22, 14, 20, 3);
        } else if (hair.id === 'sidepart' || hair.id === 'slicked') {
            ctx.fillRect(16, 10, 32, 12);
            ctx.fillStyle = highlight; ctx.fillRect(18, 11, 26, 3);
            ctx.fillStyle = shadow; ctx.fillRect(26, 10, 2, 8); // Part line
        } else if (hair.id === 'pompadour') {
            ctx.fillRect(18, 0, 28, 14); // High swept front
            ctx.fillStyle = highlight; ctx.fillRect(20, 2, 24, 4);
            ctx.fillStyle = shadow; ctx.fillRect(14, 14, 4, 10); ctx.fillRect(46, 14, 4, 10);
        } else if (hair.id === 'shaggy') {
            ctx.fillRect(16, 10, 32, 18);
            ctx.fillStyle = shadow;
            ctx.fillRect(14, 24, 6, 10); ctx.fillRect(44, 24, 6, 10);
            ctx.fillRect(22, 22, 5, 6); ctx.fillRect(37, 22, 5, 6);
        } else if (hair.id === 'topknot' || hair.id === 'bun') {
            ctx.beginPath(); ctx.arc(32, 16, 14, Math.PI, 0); ctx.fill();
            ctx.beginPath(); ctx.arc(32, 5, 6.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = highlight; ctx.beginPath(); ctx.arc(32, 4, 2.5, 0, Math.PI * 2); ctx.fill();
        } else {
            // Fallback front for wavy, mohawk, buzzed, undercut, mullet, pixie
            if (hair.id === 'mohawk') {
                ctx.fillRect(27, 3, 10, 16);
                ctx.fillStyle = highlight; ctx.fillRect(29, 4, 6, 14);
            } else if (hair.id === 'buzzed') {
                ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(16, 10, 32, 8);
            } else if (hair.id === 'undercut') {
                ctx.fillStyle = col; ctx.beginPath(); ctx.arc(32, 16, 14, Math.PI, 0); ctx.fill();
                ctx.fillStyle = highlight; ctx.fillRect(20, 12, 24, 3);
            } else if (hair.id === 'wavy') {
                ctx.beginPath(); ctx.moveTo(16, 12); ctx.quadraticCurveTo(8, 24, 16, 38); ctx.lineTo(21, 38); ctx.lineTo(21, 22); ctx.lineTo(43, 22); ctx.lineTo(43, 38); ctx.lineTo(48, 38); ctx.quadraticCurveTo(56, 24, 48, 12); ctx.fill();
                ctx.fillStyle = highlight; ctx.fillRect(20, 13, 24, 3.5);
            } else if (hair.id === 'mullet') {
                ctx.fillRect(18, 10, 28, 12);
                ctx.fillStyle = shadow; ctx.fillRect(14, 22, 5, 18); ctx.fillRect(45, 22, 5, 18);
            } else if (hair.id === 'pixie') {
                ctx.fillRect(16, 10, 32, 14);
                ctx.fillStyle = highlight; ctx.fillRect(18, 12, 20, 3);
            }
        }
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
function createSpeciesTexture(species, hex, bellyHex, back, hatId = 'none', shirtId = 'none', collarId = 'none', eyeHex = '#000000', patternId = 'none', partColors = null, hairId = 'none', hairColor = null) {
    // VISUAL UPGRADE: HD Canvas - sized to fit tallest content:
    // logical y range is -22 (witch hat tip) to 67.5 (feet) = 89.5 units.
    // Canvas is 94 logical units tall (188px) with a +24 offset => 2u margins.
    const c = document.createElement('canvas'); c.width = 128; c.height = 188;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;

    // Scale Context by 2x so all existing 64px coordinates work, 
    // but we can draw sub-pixel (0.5) details for extra resolution.
    ctx.scale(2, 2);
    // Offset down to make room for tall ears and hats
    ctx.translate(0, 24);

    // Fix: Use HEX string for canvas drawing so shadeColor works (getStyle returns rgb())
    const col = '#' + new THREE.Color(hex).getHexString();
    const bellyCol = '#' + new THREE.Color(bellyHex).getHexString();
    const eyeCol = '#' + new THREE.Color(eyeHex).getHexString();

    drawSpecies(ctx, species, col, bellyCol, eyeCol, back, partColors);

    // Draw fur pattern AFTER species but BEFORE shirt (so it doesn't cover clothes)
    drawPattern(ctx, patternId, col, back);

    // UPDATE: Pass 'col' (body color) to drawShirt so it can fix necklines
    drawShirt(ctx, shirtId, back, col);

    drawCollar(ctx, collarId, back);

    // HAIR (Under Hat)
    drawHair(ctx, hairId, hairColor, back);

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
        drawEyes(ctx, parts.eyes, eyeCol);
    }

    drawHat(ctx, hatId, back);

    // One continuous outline around the finished figure (matches the fish art).
    addSpriteOutline(ctx, c);

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
    if (name.includes('golden') || name.includes('gold')) {
        baseCol = '#e8b923';
        fillStyle = linGrad([[0, '#fff3b0'], [0.45, '#f5c518'], [1, '#9c6b0a']]);
    } else if (name.includes('rainbow')) {
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
    if (name.includes('boot')) {
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
    else if (name.includes('seahorse')) {
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
    else if (name.includes('eel') || name.includes('serpent') || name.includes('worm') || name.includes('leviathan') || name.includes('hydra')) {
        p.moveTo(58, 22);
        p.bezierCurveTo(40, 12, 26, 40, 8, 30);
        p.lineTo(5, 38);
        p.bezierCurveTo(26, 48, 40, 24, 58, 32);
        p.closePath();
        eye = { x: 53, y: 26, r: 2.4 };
    }
    // TYPE: RAY / MANTA / SKATE
    else if (name.includes('ray') || name.includes('skate') || name.includes('manta')) {
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
    else if (name.includes('shark') || name.includes('whale') || name.includes('orca')) {
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
    else if (name.includes('sword') || name.includes('marlin') || name.includes('pike') || name.includes('sail')) {
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
    else if (name.includes('puffer')) {
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
    else if (name.includes('angler')) {
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
    // TYPE: ROUND (koi, goldfish, sunfish, discus, betta, flounder...)
    else if (name.includes('sunfish') || name.includes('discus') || name.includes('koi') || name.includes('goldfish') || name.includes('betta') || name.includes('pleco') || name.includes('flounder') || name.includes('bluegill')) {
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

    // Name-driven patterns
    if (name.includes('clown')) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        [20, 32, 44].forEach(bx => ctx.fillRect(bx, 0, 4, 64));
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
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d'); x.font = 'bold 32px Arial'; x.textAlign = 'center';
    x.fillStyle = 'black'; x.fillText(n, 128, 44); x.fillStyle = 'white'; x.fillText(n, 126, 42);
    const t = new THREE.CanvasTexture(c);
    // PIXEL FIX
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    return t;
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

// --- CHARACTER BODY (2D billboard) ---------------------------------------
// The body is always named "playerSprite" so every existing lookup keeps
// working.  It is a cosmetic-textured plane; userData.cfg stores the cosmetic
// config so the body can be rebuilt (e.g. when cosmetics change).
function makeCharacterBody(cfg) {
    cfg = cfg || {};
    const base = (cfg.color != null) ? cfg.color : '#ffffff';
    const belly = (cfg.belly != null && cfg.belly !== '') ? cfg.belly : base;

    const useParts = !!(cfg.ears || cfg.eyes || cfg.nose || cfg.tail || cfg.misc);
    const parts = useParts
        ? { ears: cfg.ears || 'none', eyes: cfg.eyes || 'standard', nose: cfg.nose || 'cat', misc: cfg.misc || 'none', tail: cfg.tail || 'none' }
        : (cfg.species || 'cat');
    const pc = {
        earsColor: cfg.earsColor || '', noseColor: cfg.noseColor || '',
        miscColor: cfg.miscColor || '', tailColor: cfg.tailColor || ''
    };
    const tf = createSpeciesTexture(parts, base, belly, false, cfg.hat || 'none', cfg.shirt || 'none', cfg.collar || 'none', cfg.eye || '#000000', cfg.pattern || 'none', pc, cfg.hair || 'none', cfg.hairColor || '');
    const tb = createSpeciesTexture(parts, base, belly, true, cfg.hat || 'none', cfg.shirt || 'none', cfg.collar || 'none', cfg.eye || '#000000', cfg.pattern || 'none', pc, cfg.hair || 'none', cfg.hairColor || '');
    const m1 = new THREE.MeshBasicMaterial({ map: tf, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
    const m2 = new THREE.MeshBasicMaterial({ map: tb, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.9375), m1);
    mesh.name = 'playerSprite';
    mesh.position.y = 1.46875;
    mesh.userData = { matFront: m1, matBack: m2, is3D: false, baseColor: base, cfg: cfg };
    return mesh;
}

// Tear down a body mesh/group and release its GPU resources.
function disposeCharacterBody(body) {
    if (!body) return;
    if (body.userData) {
        if (body.userData.matFront && body.userData.matFront.map) disposeTexture(body.userData.matFront.map);
        if (body.userData.matBack && body.userData.matBack.map) disposeTexture(body.userData.matBack.map);
    }
    body.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
        }
    });
}

// Replace a character's body using the current model mode.
function replaceCharacterBody(group, cfg) {
    if (!group) return null;
    const old = group.getObjectByName('playerSprite');
    if (old) { disposeCharacterBody(old); group.remove(old); }
    const body = makeCharacterBody(cfg);
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
    return casting ? ROD_CAST_2D : ROD_IDLE_2D;
}

// A billboard fishing rod named "rod".
function makeRod(rodId) {
    rodId = rodId || 'bamboo';
    const rodTex = createRodTexture(rodId);
    const rodMat = new THREE.MeshBasicMaterial({ map: rodTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
    const rodGeo = new THREE.PlaneGeometry(3.0, 3.0);
    rodGeo.translate(1.5, 1.5, 0);
    const r = new THREE.Mesh(rodGeo, rodMat);
    r.position.set(0.6, 0.96, 0.1);
    r.rotation.set(-0.2, -Math.PI / 2, 0);
    r.name = 'rod';
    return r;
}

// A held "trophy" fish.  Always a real 3D model when Character3D is available;
// a billboard sprite is only the fallback.  Keeps the historic name
// 'heldFishSprite' so existing lookups keep working; userData.is3D tells the
// two apart.
function makeHeldFish(fishName, color, size) {
    const s = size || 1.0;
    if (window.Character3D && Character3D.buildFish) {
        const g = Character3D.buildFish(fishName, color);
        g.name = 'heldFishSprite';
        g.userData.fishName = fishName;
        g.userData.is3D = true;
        g.position.set(0.6, 1.5, 0.5);
        g.scale.setScalar(0.95 * s);
        // Head along +X, rolled slightly so the flank faces the follow camera.
        g.rotation.set(0.1, -0.35, 0.18);
        return g;
    }
    const fTex = createFishTexture(fishName, color);
    const fMat = new THREE.SpriteMaterial({ map: fTex, transparent: true, alphaTest: 0.5 });
    const sp = new THREE.Sprite(fMat);
    sp.name = 'heldFishSprite';
    sp.userData = { fishName: fishName, is3D: false };
    sp.position.set(0.6, 1.5, 0.5);
    sp.scale.set(1.5 * s, 1.5 * s, 1);
    return sp;
}

// Cosmetic config for the local player, straight from saveState.
function characterCfgFromSave() {
    return {
        color: saveState.catColor, belly: saveState.bellyColor, eye: saveState.eyeColor,
        species: saveState.species,
        ears: saveState.currentEars, eyes: saveState.currentEyes, nose: saveState.currentNose,
        misc: saveState.currentMisc, tail: saveState.currentTail,
        earsColor: saveState.earsColor || '', noseColor: saveState.noseColor || '',
        miscColor: saveState.miscColor || '', tailColor: saveState.tailColor || '',
        hat: saveState.currentHat, shirt: saveState.currentShirt, collar: saveState.currentCollar,
        pattern: saveState.currentPattern, hair: saveState.currentHair, hairColor: saveState.hairColor || ''
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
        ears: data.ears, eyes: data.eyes, nose: data.nose, misc: data.misc, tail: data.tail,
        earsColor: data.earsColor || '', noseColor: data.noseColor || '',
        miscColor: data.miscColor || '', tailColor: data.tailColor || '',
        hat: data.hat || 'none', shirt: data.shirt || 'none', collar: data.collar || 'none',
        pattern: data.pattern || 'none', hair: data.hair || 'none', hairColor: data.hairColor || ''
    };
}

function createPlayerMesh(col, name, hatId = 'none', eyeHex = '#000000', species = 'cat', titleId = 'none', rodId = 'bamboo', hairId = 'none', hairColor = '') {
    const g = new THREE.Group();

    // Body (2D cosmetic billboard)
    const cfg = {
        color: col, belly: '#ffffff', eye: eyeHex, species: species,
        hat: hatId, shirt: 'none', collar: 'none', pattern: 'none',
        hair: hairId, hairColor: hairColor || ''
    };
    g.add(makeCharacterBody(cfg));

    // Name & Title
    const ntMat = new THREE.SpriteMaterial({ map: createNameTagTexture(name), depthWrite: false, depthTest: false });
    const nt = new THREE.Sprite(ntMat);
    nt.position.y = 3.05; nt.scale.set(3, 0.75, 1); nt.name = "nameTag";
    nt.renderOrder = 100;
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
    scene.add(player);
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

function updateSpriteDirection(obj, targetCamPos) {
    const sprite = obj.getObjectByName("playerSprite");
    if (!sprite || !sprite.userData.matFront) return;

    // OPTIMIZATION: Use reused vectors
    const toCam = _optVec1.copy(targetCamPos).sub(obj.position);
    toCam.y = 0;
    toCam.normalize();

    const facing = _optVec2;
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
        if (ui) ui.style.opacity = '1';
        if (chatFadeTimer) clearTimeout(chatFadeTimer);
    });
    ci.addEventListener('blur', () => {
        refreshChatFade();
    });

    document.onkeydown = e => {
        const k = saveState.keybinds;

        // Chat Focus Logic
        if (document.activeElement === ci) {
            if (e.code === 'Enter' || e.key === 'Enter') {
                sendChatMessage(ci.value);
                ci.value = '';
                ci.blur();
                if (isMobile) document.getElementById('chat-ui').style.display = 'none';
            }
            else if (e.code === 'Escape') {
                ci.blur();
                refreshChatFade();
                return;
            }
            return;
        }

        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
        if (e.code === k.menu) { toggleOptions(); return; }
        if (e.code === 'KeyI') { document.exitPointerLock(); togglePropsUI(); return; }
        if (e.code === 'KeyO') { undoProp(); return; }

        // Movement
        if (e.code === k.forward) controls.forward = true;
        if (e.code === k.backward) controls.backward = true;
        if (e.code === k.left) controls.left = true;
        if (e.code === k.right) controls.right = true;
        if (e.code === k.jump) controls.jump = true;

        // Interaction (Desktop)
        if (e.code === k.interact) {
            if (canSell) sellFish();
            else if (interactTarget === 'stylist') toggleShop();
            else if (interactTarget === 'bait') toggleBaitShop();
            else if (interactTarget === 'tutorial') toggleTutorial();
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
                let pickedFlower = false;
                for (let i = 0; i < pickableFlowers.length; i++) {
                    const flower = pickableFlowers[i];
                    if (flower && !flower.userData.isPicked && flower.visible) {
                        const dist = player.position.distanceTo(flower.position);
                        if (dist < 2) {
                            pickFlower(i);
                            pickedFlower = true;
                            break;
                        }
                    }
                }
            }
        }

        // --- TOOLS (HOTBAR 1-5) ---
        if (e.key === '1') selectTool(0);
        if (e.key === '2') selectTool(1);
        if (e.key === '3') selectTool(2);
        if (e.key === '4') selectTool(3);
        if (e.key === '5') selectTool(4);
        if (e.key === '6') selectTool(5);

        if (e.code === k.voice) toggleMic();
        if (e.code === k.showFish) toggleShowFish();
        if (e.code === k.hideHud) toggleHud();

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
        if (e.target === ci || e.target.closest('.btn') || e.target.closest('.overlay-screen') || e.target.closest('.stat-row') || e.target.closest('#bait-ui')) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (e.button === 0) { isLeftMouseDown = true; handleAction(true); }
        else if (e.button === 2) { isRightMouseDown = true; renderer.domElement.requestPointerLock(); }

        // AXE CHOPPING (Left Click)
        if (e.button === 0 && saveState.unlockedTools[saveState.activeToolIndex] === 'axe') {
            // Raycast for trees
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera({ x: 0, y: 0 }, camera);
            // Check against treeColliders (We need mesh references really, treeMeshes)
            // We can check intersections with 'scene.children' filtering for rocks/trees
            const intersects = raycaster.intersectObjects(treeMeshes, false);

            if (intersects.length > 0) {
                const hit = intersects[0];
                if (hit.distance < 8) { // Range check
                    // Find index in treeMeshes
                    const idx = treeMeshes.indexOf(hit.object);
                    if (idx !== -1) {
                        chopTree(idx);
                        // Broadcast
                        broadcastToClients({ type: 'chop_tree', index: idx });
                    }
                }
            }
        }
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

    // --- MOBILE JOYSTICK ---
    const jz = document.getElementById('joystick-zone'); const jk = document.getElementById('joystick-knob');
    let jid = null, jc = { x: 0, y: 0 };

    jz.ontouchstart = e => {
        e.preventDefault(); e.stopPropagation();
        const t = e.changedTouches[0];
        jid = t.identifier;
        const r = jz.getBoundingClientRect();
        jc = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        updateJoy(t.clientX, t.clientY);
    };

    jz.ontouchmove = e => {
        e.preventDefault(); e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === jid) updateJoy(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
        }
    };

    jz.ontouchend = e => {
        e.preventDefault(); e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === jid) {
                jk.style.transform = 'translate(0,0)';
                controls = { forward: false, backward: false, left: false, right: false, jump: false };
                jid = null;
            }
        }
    };

    function updateJoy(x, y) {
        let dx = x - jc.x, dy = y - jc.y; const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 40) { dx = (dx / d) * 40; dy = (dy / d) * 40; }
        jk.style.transform = `translate(${dx}px,${dy}px)`;
        controls.forward = dy < -10;
        controls.backward = dy > 10;
        controls.left = dx < -10;
        controls.right = dx > 10;
    }

    // --- MOBILE CAMERA ---
    let cid = null, lcx = 0, lcy = 0;
    let pinchStartDist = 0;
    let pinchStartZoom = 0;

    function isUI(t) {
        return t.target.closest('.touch-zone') || t.target.closest('#room-info-ui') || t.target.closest('.btn') || t.target.tagName === 'INPUT';
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
        if (e.target.closest('.touch-zone')) return;
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
        if (canSell) toggleMerchant();
        else if (interactTarget === 'stylist') toggleShop();
        else if (interactTarget === 'bait') toggleBaitShop();
        else if (interactTarget === 'tutorial') toggleTutorial();

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
        btnPlace.ontouchstart = e => { stopCam(e); requestPlaceProp(); };
        btnPlace.ontouchmove = stopCam;
    }

    const btnUndo = document.getElementById('btn-mobile-undo');
    if (btnUndo) {
        btnUndo.ontouchstart = e => { stopCam(e); requestUndoProp(); };
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
}


let chopInterval = null;
function handleAction(down) {

    // --- AXE LOGIC (Block Fishing) ---
    if (saveState.activeToolIndex === 2) { // Axe
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
            if (axe) axe.rotation.set(-0.2, -Math.PI / 2, 0);
        }
        return;
    }

    // --- PICKAXE LOGIC ---
    if (saveState.activeToolIndex === 5) { // Pickaxe
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
            if (pick) pick.rotation.set(-0.2, -Math.PI / 2, 0);
        }
        return;
    }

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

    if (down) {
        // If holding a fish to show off, clear it when clicking
        // If holding a fish to show off, clear it when clicking
        if (localHeldFish) {
            // FIX: Grace period check (don't clear if just caught < 500ms ago)
            if (Date.now() - lastCatchTime > 500) {
                localHeldFish = null;
                if (fishHoldTimer) clearTimeout(fishHoldTimer);
                fishHoldTimer = null;
                updateLocalVisuals();
            } else {
                // Just ignore the click if it's too soon
                return;
            }
        }

        if (fishingState === 'idle') {
            fishingState = 'charging';
            chargeStart = Date.now();
            castMarker.visible = true;
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
        if (!window.Level.isWater(window.CUSTOM_LEVEL, targetPos.x, targetPos.z)) {
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
        if (distPond < window.pondCollider.radius) {
            fishingZone = 'pond';
        } else if (distDarkPond < 14) {
            fishingZone = 'pond'; // Dark pond uses same fish pool
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
    fishingState = 'casting'; castMarker.visible = false;
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

    // Scale: Reduced to 3.0 per user feedback
    sprite.scale.set(3.0, 3.0, 3.0);

    return sprite;
}

function createBobber(targetPos) {
    if (bobber) scene.remove(bobber);

    // Use selected skin
    bobber = createBobberMesh(saveState.currentBobber);

    // Start bobber at player height, it will fall to water
    bobber.position.set(targetPos.x, player.position.y + 2, targetPos.z);

    // Initialize bobber velocity for gravity
    window.bobberVelocityY = 0;

    // Determine water level based on location (ocean is at Y=-3, ponds/lake at Y=0)
    const dist = Math.sqrt(targetPos.x * targetPos.x + targetPos.z * targetPos.z);
    if (dist > ISLAND_RADIUS - 5 || targetPos.z > 100) {
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
    // RATE LIMIT (Unified)
    if (Date.now() - lastAnimTime < ANIM_COOLDOWN) return;
    lastAnimTime = Date.now();

    animatePunch(player);
    broadcastSound('punch');

    // 1. Send Animation (FIXED PRIORITY)
    const animMsg = { type: 'anim', anim: 'punch' };

    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify(animMsg));
    }
    else if (isHost) {
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
            if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
                dedicatedSocket.send(JSON.stringify(hitMsg));
            }
            else if (isHost) {
                handleHit(hitMsg); // P2P Host handles it directly
            }
            else if (hostConn && hostConn.open) {
                hostConn.send(hitMsg);
            }
        }
    });
}

function handleHit(data) {
    // Check for ID mismatch
    const isMePeer = data.targetId === myPeerId;
    const isMeDedicated = (dedicatedId && data.targetId === dedicatedId);

    // FIX: Simplified check to ensure it works even if connection state flags are desynced
    if (isMePeer || isMeDedicated) {

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
            glove.position.z = originalZ;
            punchAnimFrameId = null; // Clear ID
            return;
        }

        if (p < 1) glove.position.z = originalZ + (punchZ - originalZ) * p;
        else glove.position.z = punchZ - (punchZ - originalZ) * (p - 1);

        glove.position.y = 1.25 + Math.random() * 0.1;

        // Track ID
        punchAnimFrameId = requestAnimationFrame(loop);
    }
    loop();
}

function scheduleBite() {
    biteTimer = setTimeout(() => {
        if (fishingState === 'waiting') {
            fishingState = 'biting';

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
    // BAR SIZE (formerly Click Power): Base 15% + 1.5% per level
    const powerLvl = saveState.clickPowerLevel || 1;
    let barSize = 15 + (powerLvl * 1.5);

    // FISHING SKILL BONUS: +0.15% bar size per fishing level (up to +14.85% at level 99)
    if (!saveState.skills) saveState.skills = { mining: { xp: 0 }, lumberjack: { xp: 0 }, fishing: { xp: 0 } };
    const fishingXP = saveState.skills.fishing?.xp || 0;
    const fishingLevel = getLevelFromXP(fishingXP);
    barSize += fishingLevel * 0.15;

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
    fishingState = 'idle'; castMarker.visible = false; minigame.active = false; document.getElementById('minigame-ui').style.display = 'none';
    if (bobber) { scene.remove(bobber); bobber = null; }
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
        // --- NEW: Server Authority Check ---
        if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
            dedicatedSocket.send(JSON.stringify({
                type: 'fishCaught',
                baitId: activeBaitId,
                zone: fishingZone
            }));
            return; // Wait for server confirmation
        }
        // -----------------------------------

        if (minigame.targetFish) {
            broadcastSound('catch');
            saveState.inventory.push(minigame.targetFish);
            updateJournal(minigame.targetFish, minigame.targetFish.tierId);

            // Award Fishing XP based on rarity
            let fishingXPGain = 20; // Base XP
            const rarity = minigame.targetFish.rarity;
            if (rarity === 'Common') fishingXPGain = 15;
            else if (rarity === 'Uncommon') fishingXPGain = 30;
            else if (rarity === 'Rare') fishingXPGain = 60;
            else if (rarity === 'Epic') fishingXPGain = 120;
            else if (rarity === 'Legendary') fishingXPGain = 250;
            addSkillXP('fishing', fishingXPGain);

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
function showToast(t) { const d = document.createElement('div'); d.className = 'toast'; d.innerText = t; document.getElementById('notification-area').appendChild(d); setTimeout(() => d.remove(), 3000); }

// --- GHOST/HAUNTING MECHANIC ---
// --- GHOST/HAUNTING MECHANIC ---
function spawnGhostMesh(x, z) {
    if (ghostMesh) scene.remove(ghostMesh);

    // Create base mesh and override cosmetics for a ghostly appearance.
    ghostMesh = createPlayerMesh('#000000', ' ', 'none', '#FFFFFF', 'cat');
    replaceCharacterBody(ghostMesh, {
        color: '#000000', belly: '#000000', eye: '#FFFFFF', species: 'cat',
        hat: 'none', shirt: 'none', collar: 'none', pattern: 'none',
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

    // 3. Send to Network (FIXED PRIORITY)
    // ALWAYS check Dedicated Socket FIRST. Even if isHost is true (Admin), 
    // we must send to the WebSocket if we are connected to it.
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify(msg));
    }
    else if (isHost) {
        broadcastToClients(msg);
    }

    showToast(`Summoned Void Cat on ${target.lastData.name}`);
}

function removePlayer(pid) {
    const p = otherPlayers[pid];
    if (p) {
        // Trigger Leave Message (Must get name before deleting data).
        const name = p.lastData.name || "Fisher";
        // Check if we are in-game to avoid spam during disconnects/reloads
        if (document.getElementById('lobby-screen').style.display === 'none') {
            displayChatMessage(name, "has left.", 'system');
        }

        // Cleanup Visuals.
        if (p.mesh) scene.remove(p.mesh);
        if (p.bobberMesh) scene.remove(p.bobberMesh);
        if (p.lineMesh) scene.remove(p.lineMesh);

        // 3. Cleanup Audio Elements
        const audioEl = document.getElementById(`audio-${pid}`);
        if (audioEl) audioEl.remove();

        // Cleanup Data Structures.
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

// --- MOBILE FPS LIMITER ---
const MOBILE_FPS_INTERVAL = 1000 / 60; // 60 FPS = ~16.67ms per frame
let lastFrameTime = 0;

function animate() {
    requestAnimationFrame(animate);

    // FPS limit on mobile to prevent overheating
    if (isMobile) {
        const now = performance.now();
        if (now - lastFrameTime < MOBILE_FPS_INTERVAL) return;
        lastFrameTime = now;
    }

    const dt = clock.getDelta();

    // --- TIME & VISUALS ---
    updateDayNightCycle(dt);

    // --- UPDATE NPC SPRITES (Face Camera) ---
    if (npcMerchant) updateSpriteDirection(npcMerchant, camera.position);
    if (npcStylist) updateSpriteDirection(npcStylist, camera.position);
    if (npcBait) updateSpriteDirection(npcBait, camera.position);
    if (npcTutorial) updateSpriteDirection(npcTutorial, camera.position);
    if (npcLavaKeeper) updateSpriteDirection(npcLavaKeeper, camera.position);
    // NEW: Update Lava World NPC Sprites
    if (npcLavaMerchant) updateSpriteDirection(npcLavaMerchant, camera.position);
    if (npcLavaStylist) updateSpriteDirection(npcLavaStylist, camera.position);
    if (npcLavaBait) updateSpriteDirection(npcLavaBait, camera.position);

    // --- AUDIO LISTENER ---
    if (audioCtx && camera) {
        // OPTIMIZATION: Reuse vector
        const forward = _optVec1;
        camera.getWorldDirection(forward);
        if (audioCtx.listener.forwardX) {
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

    // --- PHYSICS & MOVEMENT ---
    if (player) {
        player.updateMatrixWorld(true);

        // 1. DETERMINE FLOOR HEIGHT
        // Main World & Lava World both use Y=0 as the ground level
        let floorY = getTerrainHeight(player.position.x, player.position.z);
        if (isInVoid) floorY = 2000;

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
                    if (testPos.x > b.minX - 0.5 && testPos.x < b.maxX + 0.5 &&
                        testPos.z > b.minZ - 0.5 && testPos.z < b.maxZ + 0.5) hitWall = true;
                }
                if (window.CUSTOM_LEVEL && window.Level) {
                    // Custom levels: block walking into water or off the map.
                    if (window.Level.isWater(window.CUSTOM_LEVEL, testPos.x, testPos.z) ||
                        !window.Level.inBounds(window.CUSTOM_LEVEL, testPos.x, testPos.z)) hitWall = true;
                } else if (testPos.length() < LAKE_RADIUS + 0.5) hitWall = true;

                // Pond collision
                if (window.pondCollider) {
                    const distPond = Math.sqrt(
                        Math.pow(testPos.x - window.pondCollider.x, 2) +
                        Math.pow(testPos.z - window.pondCollider.z, 2)
                    );
                    if (distPond < window.pondCollider.radius + 0.5) hitWall = true;
                }

                // River collision
                if (window.riverColliders) {
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
        // OPTIMIZATION: Reuse vector
        const v = _optVec2.set(0, 0, 0);
        if (document.activeElement !== document.getElementById('chat-input')) {
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

        const sprite = player.getObjectByName("playerSprite");
        if (v.length() > 0) {
            v.normalize().multiplyScalar(PLAYER_SPEED * dt);
            // OPTIMIZATION: Reuse vector
            const np = _optVec1.copy(player.position).add(v);
            let col = false;

            // --- COLLISION CHECKS ---
            if (isInLavaWorld) {
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
                    if (np.x > b.minX - 0.5 && np.x < b.maxX + 0.5 &&
                        np.z > b.minZ - 0.5 && np.z < b.maxZ + 0.5) col = true;
                }
                // Water Collision (Lake, Pond, Dark Pond)
                if (window.CUSTOM_LEVEL && window.Level) {
                    if (window.Level.isWater(window.CUSTOM_LEVEL, np.x, np.z) ||
                        !window.Level.inBounds(window.CUSTOM_LEVEL, np.x, np.z)) col = true;
                } else if (np.length() < LAKE_RADIUS + 0.5) col = true; // Main Lake

                if (window.pondCollider) {
                    if (np.distanceTo(_optVec3.set(window.pondCollider.x, 0, window.pondCollider.z)) < window.pondCollider.radius + 0.5) col = true;
                }

                if (window.darkPondCollider) {
                    if (np.distanceTo(_optVec3.set(window.darkPondCollider.x, 0, window.darkPondCollider.z)) < window.darkPondCollider.radius + 0.5) col = true;
                }

                // River checks removed (River is gone)
            }

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

            // Animation
            const time = Date.now() * 0.012;
            if (sprite) {
                sprite.position.y = 1.46875 + Math.abs(Math.sin(time)) * 0.3;
                sprite.rotation.z = Math.sin(time) * 0.15;
            }
            if (audioCtx.currentTime - lastFootstepTime > 0.35) {
                broadcastSound('footstep');
                lastFootstepTime = audioCtx.currentTime;
            }
        } else {
            if (sprite) {
                sprite.position.y = THREE.MathUtils.lerp(sprite.position.y, 1.46875, 10 * dt);
                sprite.rotation.z = THREE.MathUtils.lerp(sprite.rotation.z, 0, 10 * dt);
            }
        }

        // 4. GRAVITY
        if (player.position.y > floorY) playerVelocity.y -= GRAVITY * dt;
        if (player.position.y <= floorY) {
            if (player.position.y < floorY && playerVelocity.y < 0) broadcastSound('footstep');
            player.position.y = floorY; playerVelocity.y = 0;
            if (controls.jump) {
                playerVelocity.y = JUMP_FORCE;
                broadcastSound('jump');
            }
        }
        player.position.y += playerVelocity.y * dt;

        // 5. BOUNDARIES
        if (isInLavaWorld) {
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
            if (window.CUSTOM_LEVEL && window.Level) {
                // Custom levels: keep the player inside the level bounds.
                const lim = window.CUSTOM_LEVEL.size / 2 - 1;
                player.position.x = Math.max(-lim, Math.min(lim, player.position.x));
                player.position.z = Math.max(-lim, Math.min(lim, player.position.z));
            } else {
                // Main Island Boundaries
                // Exception: Allow walking past edge if on the dock (Z > 85, X close to 0)
                const onDock = (player.position.z > 85 && player.position.z < 170 && Math.abs(player.position.x) < 6);
                if (!onDock && player.position.length() > ISLAND_RADIUS - 1) player.position.setLength(ISLAND_RADIUS - 1);
                if (player.position.length() < LAKE_RADIUS + 0.5) player.position.setLength(LAKE_RADIUS + 0.5);
            }
        }

        if (isFirstPerson) {
            // First Person: Eye Level
            camera.position.copy(player.position);
            camera.position.y += 1.5;
            camera.rotation.set(cameraRotationX, cameraRotationY, 0, 'YXZ');
            player.visible = false; // Hide self locally

            // --- FIX: FORCE ROTATION LOCK ---
            // This ensures your sprite faces where you look, so other players see it correctly
            // Add PI offset because camera looks forward (-Z) but player rotation is based on +Z
            player.rotation.y = cameraRotationY + Math.PI;
            // -------------------------------

        } else {
            // Third Person: Orbit
            player.visible = true;
            camera.position.x = player.position.x + Math.sin(cameraRotationY) * cameraDistance * Math.cos(cameraRotationX);
            camera.position.z = player.position.z + Math.cos(cameraRotationY) * cameraDistance * Math.cos(cameraRotationX);
            camera.position.y = player.position.y + Math.sin(cameraRotationX) * cameraDistance + 3.47;
            camera.lookAt(player.position.x, player.position.y + 1.47, player.position.z);
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

        // --- MAIN WORLD INTERACTIONS ---
        if (!isInVoid && !isInLavaWorld) {
            const dMerchant = player.position.distanceTo(npcMerchant.position);
            const dStylist = player.position.distanceTo(npcStylist.position);
            const dBait = player.position.distanceTo(npcBait.position);
            const dLava = npcLavaKeeper ? player.position.distanceTo(npcLavaKeeper.position) : 999;

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
    }

    // --- REMOTE PLAYERS ---
    Object.keys(otherPlayers).forEach(id => {
        const p = otherPlayers[id];
        const dist = p.mesh.position.distanceTo(p.targetPos);
        const isMoving = dist > 0.1;
        p.mesh.position.lerp(p.targetPos, 6 * dt);
        p.mesh.rotation.y = THREE.MathUtils.lerp(p.mesh.rotation.y, p.targetRot, 6 * dt);
        const s = p.mesh.getObjectByName("playerSprite");
        if (s) {
            updateSpriteDirection(p.mesh, camera.position);
            if (isMoving) {
                const time = Date.now() * 0.012;
                s.position.y = 1.46875 + Math.abs(Math.sin(time)) * 0.3;
                s.rotation.z = Math.sin(time) * 0.15;
            } else {
                s.position.y = THREE.MathUtils.lerp(s.position.y, 1.46875, 10 * dt);
                s.rotation.z = THREE.MathUtils.lerp(s.rotation.z, 0, 10 * dt);
            }
        }
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

// --- SECURITY: coerce fish objects that arrived from the network ---
// A hostile dedicated server controls fish fields; keep only primitives with
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

// --- PATREON BANNER SYSTEM ---
// Change this to your Patreon URL
const PATREON_LINK = "https://www.patreon.com/c/HTMLFishing";

function initPatreonBanner() {
    const banner = document.getElementById('patreon-container');
    if (banner) {
        // Show immediately
        banner.style.display = 'flex';
        console.log("Patreon Banner: Active");
    }
}

function closePatreon() {
    const banner = document.getElementById('patreon-container');
    if (banner) {
        // If user closes it, hide it for this session
        banner.style.display = 'none';
        // Optional: Bring it back after 5 minutes if you want
        // setTimeout(() => { banner.style.display = 'flex'; }, 5 * 60 * 1000);
    }
}

function openPatreon() {
    window.open(PATREON_LINK, '_blank');
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initPatreonBanner();
        setupHotbar();
    });
} else {
    // DOM is already ready, run immediately
    initPatreonBanner();
    setupHotbar(); // Initialize Hotbar
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

    if (!saveState.skills) saveState.skills = { mining: { xp: 0 }, lumberjack: { xp: 0 }, fishing: { xp: 0 }, floristry: { xp: 0 } };

    const skillData = [
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


// --- HOTBAR & AXE SYSTEM ---

function setupHotbar() {
    const container = document.getElementById('hotbar-container');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < 6; i++) {
        const slot = document.createElement('div');
        slot.className = 'hotbar-slot';
        slot.onclick = () => selectTool(i);

        const num = document.createElement('span');
        num.className = 'hotbar-number';
        num.innerText = i + 1;
        slot.appendChild(num);

        const icon = document.createElement('span');
        icon.className = 'hotbar-icon';
        icon.id = `hotbar-icon-${i}`;
        slot.appendChild(icon);

        container.appendChild(slot);
    }
    updateHotbarVisuals();
}

function updateHotbarVisuals() {
    for (let i = 0; i < 6; i++) {
        const iconEl = document.getElementById(`hotbar-icon-${i}`);
        if (!iconEl) continue;
        const slotEl = iconEl.parentElement;

        // Slot order: Rod, Hands, Axe, Guitar, Glove, Pickaxe
        const toolMap = ['rod', 'hands', 'axe', 'guitar', 'glove', 'pickaxe'];
        const toolId = toolMap[i];

        // Handle undefined saveState gracefully if init is weird
        if (!saveState.unlockedTools) saveState.unlockedTools = ['hands', 'rod', 'glove'];

        const isUnlocked = saveState.unlockedTools.includes(toolId);

        if (isUnlocked) {
            const tool = TOOLS.find(t => t.id === toolId);
            iconEl.innerHTML = (window.PX && PX.has(toolId)) ? PX.icon(toolId, 30) : (tool ? tool.icon : '?');
            slotEl.style.opacity = 1;
        } else {
            iconEl.innerHTML = window.PX ? PX.icon('lock', 30) : '🔒';
            slotEl.style.opacity = 0.5;
        }

        if (i === saveState.activeToolIndex) slotEl.classList.add('active');
        else slotEl.classList.remove('active');
    }
}

function selectTool(index) {
    // Slot order: Rod, Hands, Axe, Guitar, Glove, Pickaxe
    const toolMap = ['rod', 'hands', 'axe', 'guitar', 'glove', 'pickaxe'];
    const toolId = toolMap[index];

    if (!saveState.unlockedTools.includes(toolId)) {
        showToast("Tool locked!");
        return;
    }

    // Don't re-select if already active
    if (saveState.activeToolIndex === index) {
        return;
    }

    saveState.activeToolIndex = index;
    updateHotbarVisuals();
    saveGame();

    // --- RESET ALL TOOLS ---
    // 1. Clear held fish
    if (localHeldFish) {
        localHeldFish = null;
        if (fishHoldTimer) clearTimeout(fishHoldTimer);
        fishHoldTimer = null;
    }

    // 2. Disable guitar if not selected
    if (toolId !== 'guitar' && isGuitarActive) toggleGuitar();

    // 3. Disable glove if not selected  
    if (toolId !== 'glove' && isGloveActive) toggleGlove();

    // 4. Hide rod if not selected
    const rod = player.getObjectByName("rod");
    if (rod) rod.visible = (toolId === 'rod');

    // 5. Hide axe if not selected
    const axe = player.getObjectByName("axe");
    if (axe) axe.visible = (toolId === 'axe');

    // 6. Hide pickaxe if not selected
    const pick = player.getObjectByName("pickaxe");
    if (pick) pick.visible = (toolId === 'pickaxe');

    // 7. Set isHandsHidden based on tool (hands = hidden means empty hands mode)
    isHandsHidden = (toolId === 'hands');

    // --- EQUIP SELECTED TOOL ---
    if (toolId === 'guitar') {
        if (!isGuitarActive) toggleGuitar();
    } else if (toolId === 'glove') {
        if (!isGloveActive) toggleGlove();
    } else if (toolId === 'axe') {
        equipAxe();
    } else if (toolId === 'pickaxe') {
        equipPickaxe();
        if (pick) pick.visible = false;
    }
}

// --- HELPER: AXE TEXTURE ---
function createAxeTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');

    // Handle (Diagonal)
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(10, 54); ctx.lineTo(54, 10); ctx.stroke();

    // Axe Head
    ctx.fillStyle = '#aaa';
    ctx.beginPath();
    // Blade shape
    ctx.moveTo(54, 10);
    ctx.quadraticCurveTo(40, 0, 30, 10); // Top curve
    ctx.lineTo(20, 20); // Edge
    ctx.quadraticCurveTo(40, 30, 54, 10);
    ctx.fill();

    // Blade Edge
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.quadraticCurveTo(25, 15, 30, 10);
    ctx.stroke();

    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
}

function equipAxe() {
    let axe = player.getObjectByName("axe");
    if (!axe) {
        // Create 2D Axe Plane (Like Rod)
        const tex = createAxeTexture();
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
        const geo = new THREE.PlaneGeometry(2.5, 2.5);

        // Pivot adjustment
        geo.translate(0.5, 0.5, 0);

        axe = new THREE.Mesh(geo, mat);
        axe.name = "axe";

        // Match Rod Position/Rotation
        axe.position.set(0.6, 0.96, 0.1);
        axe.rotation.set(-0.2, -Math.PI / 2, 0);
        axe.scale.x = -1; // FLIP SPRITE

        player.add(axe);
    }
    axe.visible = true;
    showToast("Axe Equipped! Hold Click to chop.");
}

function createPickaxeTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');

    // Handle (Diagonal)
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(10, 54); ctx.lineTo(54, 10); ctx.stroke();

    // Pickaxe Head (Curved Arc)
    ctx.strokeStyle = '#555'; // Dark Grey
    ctx.lineWidth = 6;
    ctx.beginPath();
    // Arc across the top
    ctx.moveTo(35, 5);
    ctx.quadraticCurveTo(54, 10, 60, 25); // Right point
    ctx.moveTo(35, 5);
    ctx.quadraticCurveTo(25, 15, 20, 25); // Left point (shorter?)
    // Actually let's draw a nice pick shape
    ctx.moveTo(15, 25);
    ctx.quadraticCurveTo(34, 0, 55, 15);
    ctx.stroke();

    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
}

function equipPickaxe() {
    let pick = player.getObjectByName("pickaxe");
    if (!pick) {
        const tex = createPickaxeTexture();
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
        const geo = new THREE.PlaneGeometry(2.5, 2.5);
        geo.translate(0.5, 0.5, 0);

        pick = new THREE.Mesh(geo, mat);
        pick.name = "pickaxe";

        pick.position.set(0.6, 0.96, 0.1);
        pick.rotation.set(-0.2, -Math.PI / 2, 0);
        pick.scale.x = -1; // Flip like axe

        player.add(pick);
    }
    pick.visible = true;
    showToast("Pickaxe Equipped! Hold Click to mine.");
}

function performChop() {
    // Animate Axe
    const axe = player.getObjectByName("axe");
    if (axe) {
        // Swing Animation (Twitch Y rotation)
        const startRot = -Math.PI / 2;
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
        showToast(`Chopped Tree! (+1 ${woodType.name}, +${woodType.xp} XP)`);

        // Broadcast to others
        const msg = { type: 'chop_tree', index: index };

        // Send to Dedicated Server if connected
        if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
            dedicatedSocket.send(JSON.stringify(msg));
            // Sync resource inventories to server
            dedicatedSocket.send(JSON.stringify({
                type: 'syncResources',
                woodInventory: saveState.woodInventory,
                oreInventory: saveState.oreInventory || {},
                wood: saveState.wood || 0,
                stone: saveState.stone || 0,
                skills: saveState.skills
            }));
        }
        // Host Broadcast
        else if (isHost) {
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
        const startRot = -Math.PI / 2;
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
        if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
            dedicatedSocket.send(JSON.stringify(msg));
            // Sync resource inventories to server
            dedicatedSocket.send(JSON.stringify({
                type: 'syncResources',
                woodInventory: saveState.woodInventory || {},
                oreInventory: saveState.oreInventory,
                wood: saveState.wood || 0,
                stone: saveState.stone || 0,
                skills: saveState.skills
            }));
        } else if (isHost) {
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


function loadSave() {
    const s = localStorage.getItem('islandFisherSave');
    if (s) {
        try {
            const d = JSON.parse(s);

            // Initialize default unlocked tools checks immediately
            if (!saveState.unlockedTools) saveState.unlockedTools = ['hands', 'rod'];

            // --- FIX: LOAD UNLOCKED TOOLS FROM SAVE ---
            if (d.unlockedTools) {
                saveState.unlockedTools = d.unlockedTools;
            }

            // Sync Legacy Flags (Fix for Hotbar not showing unlocked items)
            if (d.hasGuitar) { saveState.hasGuitar = true; if (!saveState.unlockedTools.includes('guitar')) saveState.unlockedTools.push('guitar'); }
            if (d.hasGlove) { saveState.hasGlove = true; if (!saveState.unlockedTools.includes('glove')) saveState.unlockedTools.push('glove'); }

            // Basic stats
            if (d.money !== undefined) { const n = Number(d.money); saveState.money = Number.isFinite(n) ? n : 0; }
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
            if (d.currentTail) saveState.currentTail = d.currentTail;

            // Part-specific colors
            if (d.earsColor !== undefined) saveState.earsColor = d.earsColor;
            if (d.noseColor !== undefined) saveState.noseColor = d.noseColor;
            if (d.miscColor !== undefined) saveState.miscColor = d.miscColor;
            if (d.tailColor !== undefined) saveState.tailColor = d.tailColor;

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
            if (d.autoReelLevel !== undefined) saveState.autoReelLevel = d.autoReelLevel;
            if (d.clickPowerLevel !== undefined) saveState.clickPowerLevel = d.clickPowerLevel;

            // New Cosmetics (Rods, Shirts, Collars)
            if (d.unlockedRods) saveState.unlockedRods = d.unlockedRods;
            if (d.currentRod) saveState.currentRod = d.currentRod;
            if (d.unlockedShirts) saveState.unlockedShirts = d.unlockedShirts;
            if (d.currentShirt) saveState.currentShirt = d.currentShirt;
            if (d.unlockedCollars) saveState.unlockedCollars = d.unlockedCollars;
            if (d.currentCollar) saveState.currentCollar = d.currentCollar;

            // Patterns (Fur Patterns)
            if (d.unlockedPatterns) saveState.unlockedPatterns = d.unlockedPatterns;
            if (d.currentPattern) saveState.currentPattern = d.currentPattern;

            // Titles
            if (d.unlockedTitles) saveState.unlockedTitles = d.unlockedTitles;
            if (d.currentTitle) saveState.currentTitle = d.currentTitle;
            if (d.showTitles !== undefined) saveState.showTitles = d.showTitles;
            // Model style (2D billboard vs 3D box)
            if (d.model3D !== undefined) saveState.model3D = !!d.model3D;

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
            if (d.savedOutfits) saveState.savedOutfits = d.savedOutfits;
            else saveState.savedOutfits = [];

            // Keybinds
            if (d.keybinds) {
                saveState.keybinds = { ...DEFAULT_KEYBINDS, ...d.keybinds };
            }
        } catch (e) { console.error("Save Load Error", e); }
    }

    // Sync visual elements
    if (masterGain) masterGain.gain.value = saveState.masterVolume;
    if (sfxGain) sfxGain.gain.value = saveState.sfxVolume;
    if (midiGain) midiGain.gain.value = saveState.midiVolume;

    const usernameInput = document.getElementById('username-input');
    const furPicker = document.getElementById('fur-color-picker');
    const bellyPicker = document.getElementById('belly-color-picker');
    const eyePicker = document.getElementById('eye-color-picker');

    if (usernameInput) usernameInput.value = saveState.displayName;
    if (furPicker) furPicker.value = saveState.catColor;
    if (bellyPicker) bellyPicker.value = saveState.bellyColor;
    if (eyePicker) eyePicker.value = saveState.eyeColor;

    // Populate part selectors (new modular system)
    populatePartSelectors();

    const volS = document.getElementById('volume-slider'); if (volS) volS.value = saveState.masterVolume;
    const sfxS = document.getElementById('sfx-slider'); if (sfxS) sfxS.value = saveState.sfxVolume;
    const midS = document.getElementById('midi-slider'); if (midS) midS.value = saveState.midiVolume;
    const vocS = document.getElementById('voice-slider'); if (vocS) vocS.value = saveState.voiceVolume;

    myData.name = saveState.displayName;
    myData.color = saveState.catColor;
    myData.belly = saveState.bellyColor;
    myData.eye = saveState.eyeColor;
    myData.hat = saveState.currentHat;
    myData.shirt = saveState.currentShirt;
    myData.collar = saveState.currentCollar;
    myData.rod = saveState.currentRod;
    myData.pattern = saveState.currentPattern;
    // Modular parts
    myData.ears = saveState.currentEars;
    myData.eyes = saveState.currentEyes;
    myData.nose = saveState.currentNose;
    myData.misc = saveState.currentMisc;
    myData.tail = saveState.currentTail;
    myData.hair = saveState.currentHair;
    myData.hairColor = saveState.hairColor || '';

    updateBaitSelector();
    updateUI();
    updateMusicUI();
    updateMidiUI();
}

function saveGame() {
    saveState.displayName = document.getElementById('username-input').value.substring(0, 12) || "Fisher";

    myData.name = saveState.displayName;
    // Update myData with parts
    myData.ears = saveState.currentEars;
    myData.eyes = saveState.currentEyes;
    myData.nose = saveState.currentNose;
    myData.misc = saveState.currentMisc;
    myData.tail = saveState.currentTail;
    myData.hair = saveState.currentHair;

    // Update myData with part colors
    myData.earsColor = saveState.earsColor || '';
    myData.noseColor = saveState.noseColor || '';
    myData.miscColor = saveState.miscColor || '';
    myData.tailColor = saveState.tailColor || '';
    myData.hairColor = saveState.hairColor || '';

    // Update myData with base colors
    myData.color = saveState.catColor;
    myData.belly = saveState.bellyColor;
    myData.eye = saveState.eyeColor;

    updateUI();
    updateLocalVisuals();
    updateHotbarVisuals(); // FIX: Refresh hotbar after load

    // --- Sync with Dedicated Server if connected ---
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        // Sync name/visuals with full saveState
        dedicatedSocket.send(JSON.stringify({
            type: 'setName',
            name: saveState.displayName,
            peerId: myPeerId,
            saveState: saveState // Send full saveState for visuals sync
        }));

        // Sync money to prevent desync after shop purchases
        dedicatedSocket.send(JSON.stringify({
            type: 'syncMoney',
            money: saveState.money
        }));
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

    if (fishingZone === 'void') {
        // Void logic: mostly void fish
        if (Math.random() < 0.40) {
            basePool = FISH_TYPES.filter(f => f.condition === 'void');
        } else {
            basePool = FISH_TYPES.filter(f => !f.condition);
        }
    }
    else if (fishingZone === 'lava') {
        // Lava world: combine Regular Fish + Lava Fish
        basePool = [...FISH_TYPES.filter(f => !f.condition), ...LAVA_FISH];
    }
    else if (fishingZone === 'secret') {
        // Secret pool: all non-conditional fish except trash
        basePool = FISH_TYPES.filter(f => f.condition !== 'void' && f.condition !== 'rain' && f.name !== "Old Boot");
    }
    else if (isRaining && Math.random() < 0.40) {
        // Rain: chance for rain fish
        basePool = FISH_TYPES.filter(f => f.condition === 'rain');
    }
    else {
        // --- ZONE-SPECIFIC FISH POOLS ---
        // Map fishing zones to fish zone categories
        let zoneCategory = 'lake'; // Default
        if (fishingZoneCategory) zoneCategory = fishingZoneCategory;
        else if (fishingZone === 'ocean') zoneCategory = 'ocean';
        else if (fishingZone === 'pond') {
            // Differentiate light pond vs dark pond by player position
            const distToDarkPond = Math.sqrt(Math.pow(player.position.x - 60, 2) + Math.pow(player.position.z - 50, 2));
            zoneCategory = distToDarkPond < 30 ? 'darkpond' : 'lightpond';
        }
        else if (fishingZone === 'lake') zoneCategory = 'lake';

        // Get zone-specific fish
        basePool = getFishForZone(zoneCategory);
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

let isMobileInventoryOpen = false; // Initialize inventory state as closed for both mobile and desktop

window.toggleMobileInventory = function () {
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
window.toggleJournal = function () {
    const ui = document.getElementById('journal-overlay');
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') { document.exitPointerLock(); renderJournal(); }
}

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
        updateDebugUI();

        const volSlider = document.getElementById('volume-slider');
        if (volSlider) volSlider.value = saveState.masterVolume;

        // NEW: Render the controls, but only for desktop
        if (!isMobile) { // Keybinds are not relevant on mobile devices.
            renderKeybinds();
        }

        document.exitPointerLock(); // Unlock Mouse
        ui.style.display = 'flex';
    }
}

window.toggleShop = function () {
    const ui = document.getElementById('shop-overlay');
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') { document.exitPointerLock(); renderShop(); }
}

window.toggleBaitShop = function () {
    const ui = document.getElementById('bait-shop-overlay');
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') { document.exitPointerLock(); renderBaitShop(); }
}

// --- TUTORIAL NPC GUIDE ---
let npcTutorial = null;

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

// Legacy: Keep for NPC/backwards compatibility
window.changeSpecies = function (species) {
    saveState.species = species;
    if (player) updateLocalVisuals();
    if (document.getElementById('shop-overlay').style.display === 'flex') renderShop();
    saveGame();
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

        // FIX: Close dedicated socket
        if (dedicatedSocket) {
            dedicatedSocket.close();
            dedicatedSocket = null;
        }

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
        // Don't show rod when Axe (2) or Pickaxe (5) is equipped
        else {
            const isAxeOrPickActive = (saveState.activeToolIndex === 2 || saveState.activeToolIndex === 5);
            if (!isGuitarActive && !isGloveActive && !isHandsHidden && !isAxeOrPickActive) {
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
            html += `<div class="journal-rarity" style="font-size:14px; color:var(--p-text-mute);">${fish.rarity}</div>`;

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
            tail: saveState.currentTail,
            color: saveState.catColor,
            belly: saveState.bellyColor,
            eye: saveState.eyeColor,
            earsColor: saveState.earsColor,
            noseColor: saveState.noseColor,
            miscColor: saveState.miscColor,
            tailColor: saveState.tailColor,
            hat: saveState.currentHat,
            shirt: saveState.currentShirt,
            collar: saveState.currentCollar,
            rod: saveState.currentRod,
            title: saveState.currentTitle,
            pattern: saveState.currentPattern,
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
        saveState.tailColor = outfit.tailColor || '';

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
        saveState.currentCollar = saveState.unlockedCollars.includes(outfit.collar) ? outfit.collar : 'none';
        saveState.currentRod = saveState.unlockedRods.includes(outfit.rod) ? outfit.rod : 'bamboo';
        saveState.currentTitle = saveState.unlockedTitles.includes(outfit.title) ? outfit.title : 'none';
        saveState.currentPattern = saveState.unlockedPatterns.includes(outfit.pattern) ? outfit.pattern : 'none';

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

    /**
     * Updates the character preview canvases in the shop wardrobe sidebar.
     * Shows front and back views of the player's current outfit.
     */
    window.updateCharacterPreview = function updateCharacterPreview() {
        const frontCanvas = document.getElementById('preview-front');
        const backCanvas = document.getElementById('preview-back');

        if (!frontCanvas || !backCanvas) return;

        const frontCtx = frontCanvas.getContext('2d');
        const backCtx = backCanvas.getContext('2d');

        // Clear canvases
        frontCtx.clearRect(0, 0, 96, 96);
        backCtx.clearRect(0, 0, 96, 96);

        // Disable smoothing for pixel art
        frontCtx.imageSmoothingEnabled = false;
        backCtx.imageSmoothingEnabled = false;

        // Create a temp canvas at 64x88 to draw sprite (extra height for tall ears), then scale up
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 64;
        tempCanvas.height = 94;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = false;
        // Offset down to make room for tall ears (matches createSpeciesTexture)
        tempCtx.translate(0, 24);

        // Create parts object from current saveState
        const parts = {
            ears: saveState.currentEars,
            eyes: saveState.currentEyes,
            nose: saveState.currentNose,
            misc: saveState.currentMisc,
            tail: saveState.currentTail,
            hair: saveState.currentHair
        };

        // Build part colors object
        const partColors = {
            earsColor: saveState.earsColor || '',
            noseColor: saveState.noseColor || '',
            miscColor: saveState.miscColor || '',
            tailColor: saveState.tailColor || '',
            hairColor: saveState.hairColor || ''
        };

        // Draw front view with modular parts
        drawSpecies(tempCtx, parts, saveState.catColor, saveState.bellyColor, saveState.eyeColor, false, partColors);
        drawPattern(tempCtx, saveState.currentPattern, saveState.catColor, false);
        drawShirt(tempCtx, saveState.currentShirt, false);
        drawCollar(tempCtx, saveState.currentCollar, false);
        drawHair(tempCtx, saveState.currentHair, saveState.hairColor, false);
        drawHat(tempCtx, saveState.currentHat, false);
        addSpriteOutline(tempCtx, tempCanvas, '#111219', 1);

        // Scale to preview canvas (centered, scaled to fit 96x96)
        const scale = 96 / 94;
        const drawW = 64 * scale;
        const drawH = 94 * scale;
        const offsetX = (96 - drawW) / 2;
        frontCtx.drawImage(tempCanvas, 0, 0, 64, 94, offsetX, 0, drawW, drawH);

        // Clear temp and draw back view
        tempCtx.clearRect(0, -24, 64, 120);
        drawSpecies(tempCtx, parts, saveState.catColor, saveState.bellyColor, saveState.eyeColor, true, partColors);
        drawPattern(tempCtx, saveState.currentPattern, saveState.catColor, true);
        drawShirt(tempCtx, saveState.currentShirt, true);
        drawCollar(tempCtx, saveState.currentCollar, true);
        drawHair(tempCtx, saveState.currentHair, saveState.hairColor, true);
        drawHat(tempCtx, saveState.currentHat, true);
        addSpriteOutline(tempCtx, tempCanvas, '#111219', 1);

        backCtx.drawImage(tempCanvas, 0, 0, 64, 94, offsetX, 0, drawW, drawH);
    }

    window.drawBobberIcon = function drawBobberIcon(ctx, type, size) {
        const cx = size / 2, cy = size / 2;

        if (type.model === 'duck') {
            ctx.fillStyle = '#ffdd00';
            ctx.beginPath(); ctx.arc(cx, cy + 5, 12, 0, Math.PI * 2); ctx.fill(); // Body
            ctx.beginPath(); ctx.arc(cx - 5, cy - 8, 9, 0, Math.PI * 2); ctx.fill(); // Head
            ctx.fillStyle = '#ffaa00';
            // Bigger Beak
            ctx.beginPath(); ctx.moveTo(cx - 12, cy - 8); ctx.lineTo(cx - 24, cy - 5); ctx.lineTo(cx - 12, cy - 11); ctx.fill();
            ctx.fillStyle = 'black';
            ctx.beginPath(); ctx.arc(cx - 8, cy - 10, 2, 0, Math.PI * 2); ctx.fill(); // Eye
        }
        else if (type.model === 'cube') {
            ctx.fillStyle = '#' + type.color.toString(16).padStart(6, '0');
            ctx.fillRect(cx - 12, cy - 12, 24, 24);
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.strokeRect(cx - 12, cy - 12, 24, 24);
        }
        else if (type.model === 'heart') {
            ctx.fillStyle = '#' + type.color.toString(16).padStart(6, '0');
            ctx.font = '32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('❤', cx, cy + 2);
        }
        else if (type.model === 'star') {
            ctx.fillStyle = '#' + type.color.toString(16).padStart(6, '0');
            ctx.font = '32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('★', cx, cy + 2);
        }
        else if (type.model === 'skull') {
            ctx.fillStyle = '#ddd';
            ctx.beginPath(); ctx.arc(cx, cy - 4, 11, 0, Math.PI * 2); ctx.fill(); // Head
            ctx.fillRect(cx - 6, cy + 5, 12, 7); // Jaw
            ctx.fillStyle = '#111';
            // Big Sockets
            ctx.beginPath(); ctx.arc(cx - 4, cy - 4, 4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + 4, cy - 4, 4, 0, Math.PI * 2); ctx.fill();
            // Nose
            ctx.beginPath(); ctx.moveTo(cx, cy + 2); ctx.lineTo(cx - 2, cy + 5); ctx.lineTo(cx + 2, cy + 5); ctx.fill();
        }
        else {
            // Sphere
            ctx.fillStyle = '#' + type.color.toString(16).padStart(6, '0');
            ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
            // Shine
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath(); ctx.arc(cx - 5, cy - 5, 5, 0, Math.PI * 2); ctx.fill();

            if (type.metallic) {
                ctx.strokeStyle = 'rgba(255,255,200,0.5)';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.stroke();
            }
        }
    }

    window.renderShop = function renderShop() {
        const container = document.getElementById('shop-container');
        container.innerHTML = '';

        // Populate part dropdowns
        populatePartSelectors();

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
            btn.style.fontSize = '10px';
            btn.style.padding = '8px 10px';
            btn.style.flex = '1';
            const isActive = shopMode === id;
            btn.style.background = isActive ? 'var(--p-sand)' : 'var(--p-face-2)';
            btn.style.color = isActive ? '#1a1206' : 'var(--p-text-dim)';
            btn.style.border = '2px solid var(--p-line)';
            btn.innerText = label;
            btn.onclick = () => { shopMode = id; renderShop(); };
            navDiv.appendChild(btn);
        };

        createTab('hats', 'Hats');
        createTab('rods', 'Rods');
        createTab('shirts', 'Shirts');
        createTab('collars', 'Collars');
        createTab('patterns', 'Patterns');
        createTab('titles', 'Titles');
        createTab('misc', 'Misc');
        createTab('bobbers', 'Bobbers');
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
                canvas.width = 64; canvas.height = 94;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.translate(0, 24);
                drawSpecies(ctx, { ears: saveState.currentEars, eyes: saveState.currentEyes, nose: saveState.currentNose, misc: saveState.currentMisc, tail: saveState.currentTail }, saveState.catColor, saveState.bellyColor, saveState.eyeColor, false);
                drawShirt(ctx, saveState.currentShirt, false);
                drawCollar(ctx, item.id, false);
                drawHair(ctx, saveState.currentHair, saveState.hairColor, false);
                addSpriteOutline(ctx, canvas, '#111219', 1);
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

        // --- PATTERNS TAB ---
        else if (shopMode === 'patterns') {
            const sortedPatterns = [...PATTERN_TYPES].sort((a, b) => a.price - b.price);
            sortedPatterns.forEach(pattern => {
                const entry = document.createElement('div');
                const isOwned = saveState.unlockedPatterns.includes(pattern.id);
                const isEquipped = saveState.currentPattern === pattern.id;
                entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';

                const canvas = document.createElement('canvas');
                canvas.width = 64; canvas.height = 94;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.translate(0, 24);
                drawSpecies(ctx, { ears: saveState.currentEars, eyes: saveState.currentEyes, nose: saveState.currentNose, misc: saveState.currentMisc, tail: saveState.currentTail }, saveState.catColor, saveState.bellyColor, saveState.eyeColor, false);


                drawPattern(ctx, pattern.id, saveState.catColor, false);
                drawHair(ctx, saveState.currentHair, saveState.hairColor, false);
                addSpriteOutline(ctx, canvas, '#111219', 1);
                entry.appendChild(canvas);

                const name = document.createElement('div');
                name.style.fontWeight = 'bold'; name.innerText = pattern.name;
                entry.appendChild(name);

                const btn = document.createElement('button');
                if (isEquipped) {
                    btn.innerText = "Equipped";
                    btn.disabled = true;
                } else if (isOwned) {
                    btn.innerText = "Equip";
                    btn.onclick = () => {
                        saveState.currentPattern = pattern.id;
                        saveGame();
                        updateLocalVisuals();
                        renderShop();
                    };
                } else {
                    btn.innerText = `$${pattern.price}`;
                    btn.style.color = saveState.money >= pattern.price ? 'var(--p-good)' : 'var(--p-bad)';
                    btn.onclick = () => {
                        if (saveState.money >= pattern.price) {
                            saveState.money -= pattern.price;
                            saveState.unlockedPatterns.push(pattern.id);
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
                canvas.width = 64; canvas.height = 94;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.translate(0, 24);
                drawSpecies(ctx, { ears: saveState.currentEars, eyes: saveState.currentEyes, nose: saveState.currentNose, misc: saveState.currentMisc, tail: saveState.currentTail }, saveState.catColor, saveState.bellyColor, saveState.eyeColor, false);
                drawShirt(ctx, shirt.id, false);
                drawCollar(ctx, saveState.currentCollar, false);
                drawHair(ctx, saveState.currentHair, saveState.hairColor, false);
                drawHat(ctx, saveState.currentHat, false); // Add drawHat here
                addSpriteOutline(ctx, canvas, '#111219', 1);
                entry.appendChild(canvas);

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
            const sortedHats = [...HAT_TYPES].sort((a, b) => a.price - b.price);
            sortedHats.forEach(hat => {
                const entry = document.createElement('div');
                const isOwned = saveState.unlockedHats.includes(hat.id);
                const isEquipped = saveState.currentHat === hat.id;
                entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';

                const canvas = document.createElement('canvas');
                canvas.width = 64; canvas.height = 94;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.translate(0, 24);
                drawSpecies(ctx, { ears: saveState.currentEars, eyes: saveState.currentEyes, nose: saveState.currentNose, misc: saveState.currentMisc, tail: saveState.currentTail }, saveState.catColor, saveState.bellyColor, saveState.eyeColor, false);
                drawShirt(ctx, saveState.currentShirt, false);
                drawCollar(ctx, saveState.currentCollar, false);
                drawHair(ctx, saveState.currentHair, saveState.hairColor, false);
                drawHat(ctx, hat.id, false);
                addSpriteOutline(ctx, canvas, '#111219', 1);
                entry.appendChild(canvas);

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
            const sortedTitles = [...TITLE_TYPES].sort((a, b) => a.price - b.price);
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
                if (isEquipped) { btn.innerText = "Equipped"; btn.disabled = true; }
                else if (isOwned) {
                    btn.innerText = "Equip";
                    btn.onclick = () => { saveState.currentTitle = title.id; saveGame(); updateLocalVisuals(); renderShop(); };
                } else {
                    btn.innerText = `$${title.price}`;
                    btn.onclick = () => { if (saveState.money >= title.price) { saveState.money -= title.price; saveState.unlockedTitles.push(title.id); Sound.sell(); saveGame(); renderShop(); } else showToast("Not enough money!"); };
                }
                entry.appendChild(btn);
                container.appendChild(entry);
            });
        }



        // --- BOBBERS TAB ---
        else if (shopMode === 'bobbers') {
            const sortedBobbers = [...BOBBER_TYPES].sort((a, b) => a.price - b.price);
            sortedBobbers.forEach(item => {
                const entry = document.createElement('div');
                const isOwned = saveState.unlockedBobbers.includes(item.id);
                const isEquipped = saveState.currentBobber === item.id;
                entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';

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
                btn.innerText = "Buy ($500)";
                btn.style.color = saveState.money >= 500 ? 'var(--p-good)' : 'var(--p-bad)';
                btn.onclick = () => {
                    if (saveState.money >= 500) {
                        saveState.money -= 500;
                        saveState.unlockedTools.push('guitar');
                        if (!saveState.hasGuitar) saveState.hasGuitar = true;
                        Sound.sell();
                        saveGame();
                        renderShop();
                        setupHotbar();
                    } else showToast("Not enough money!");
                };
                guitarDiv.appendChild(btn);
            }
            container.appendChild(guitarDiv);

            // --- 2. WOODCUTTER'S AXE ---
            const axeDiv = document.createElement('div');
            axeDiv.className = 'grid-entry';
            const hasAxe = saveState.unlockedTools.includes('axe');

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
                btn.innerText = "Buy ($150)";
                btn.style.color = saveState.money >= 150 ? 'var(--p-good)' : 'var(--p-bad)';
                btn.onclick = () => {
                    if (saveState.money >= 150) {
                        saveState.money -= 150;
                        saveState.unlockedTools.push('axe');
                        Sound.sell();
                        saveGame();
                        renderShop();
                        setupHotbar();
                    } else showToast("Not enough money!");
                };
                axeDiv.appendChild(btn);
            }
            container.appendChild(axeDiv);

            // --- 3. PVP GLOVE ---
            const gloveDiv = document.createElement('div');
            gloveDiv.className = 'grid-entry';
            const hasGlove = saveState.unlockedTools.includes('glove');

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
                btn.innerText = "Buy ($1000)";
                btn.style.color = saveState.money >= 1000 ? 'var(--p-good)' : 'var(--p-bad)';
                btn.onclick = () => {
                    if (saveState.money >= 1000) {
                        saveState.money -= 1000;
                        saveState.unlockedTools.push('glove');
                        if (!saveState.hasGlove) saveState.hasGlove = true;
                        Sound.sell();
                        saveGame();
                        renderShop();
                        setupHotbar();
                    } else showToast("Not enough money!");
                };
                gloveDiv.appendChild(btn);
            }
            container.appendChild(gloveDiv);

            // --- 4. PICKAXE ---
            const pickDiv = document.createElement('div');
            pickDiv.className = 'grid-entry';
            const hasPick = saveState.unlockedTools.includes('pickaxe');

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
                btn.innerText = "Buy ($800)";
                btn.style.color = saveState.money >= 800 ? 'var(--p-good)' : 'var(--p-bad)';
                btn.onclick = () => {
                    if (saveState.money >= 800) {
                        saveState.money -= 800;
                        if (!saveState.unlockedTools) saveState.unlockedTools = ['hands', 'rod'];
                        if (!saveState.unlockedTools.includes('pickaxe')) saveState.unlockedTools.push('pickaxe');
                        Sound.sell();
                        saveGame();
                        renderShop();
                        setupHotbar();
                    } else showToast("Not enough money!");
                };
                pickDiv.appendChild(btn);
            }
            container.appendChild(pickDiv);
        }

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
        const cLvl = saveState.clickPowerLevel;
        const cMax = CLICK_POWER_RATES.length - 1;

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
            pDesc.innerHTML = "Increases catch area.<br>Easier validation.";
        } else {
            pDesc.innerHTML = "Max Size.<br>Huge bar!";
        }
        pDiv.appendChild(pDesc);

        if (cLvl < cMax) {
            const cost = CLICK_POWER_PRICES[cLvl];
            const btn = document.createElement('button');
            btn.innerText = `Upgrade ($${cost})`;
            btn.style.marginTop = 'auto';
            btn.style.color = saveState.money >= cost ? 'var(--p-good)' : 'var(--p-bad)';
            btn.onclick = () => buyClickPowerUpgrade(cost);
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
        const uniqueCount = Object.keys(saveState.journal).length;

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

    // --- HUD VISIBILITY TOGGLE ---
    let isHudHidden = false;

    function toggleHud() {
        isHudHidden = !isHudHidden;
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) {
            uiLayer.style.display = isHudHidden ? 'none' : 'block';
        }
        if (!isHudHidden) showToast("HUD Visible");
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
            if (!guitarMesh) {
                const c = document.createElement('canvas'); c.width = 64; c.height = 64;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#8B4513'; ctx.beginPath(); ctx.arc(32, 45, 12, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(32, 35, 10, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#222'; ctx.fillRect(30, 10, 4, 30);
                ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(32, 40, 4, 0, Math.PI * 2); ctx.fill();

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
                guitarMesh.position.set(0.3, 1.25, 0.2);
                guitarMesh.scale.set(1.5, 1.5, 1);
                player.add(guitarMesh);
            }
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
            if (!gloveMesh) {
                const c = document.createElement('canvas'); c.width = 64; c.height = 64;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#cc0000'; ctx.beginPath(); ctx.arc(32, 32, 20, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#990000'; ctx.beginPath(); ctx.arc(20, 40, 10, 0, Math.PI * 2); ctx.fill();
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
                gloveMesh.position.set(0.6, 1.25, 0.5);
                gloveMesh.scale.set(1.2, 1.2, 1);
                player.add(gloveMesh);
            }
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
                    name: 'guitar',
                    pos: { x: player.position.x, y: player.position.y, z: player.position.z },
                    var: note.freq
                };

                if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
                    // MIDI EXEMPTION: forward ALL guitar notes to the dedicated server
                    // without applying local per-tick throttling.
                    dedicatedSocket.send(JSON.stringify(msg));
                } else {
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

    function buyClickPowerUpgrade(cost) {
        if (saveState.money >= cost) {
            saveState.money -= cost;
            saveState.clickPowerLevel++;
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

    // Handles input from the mobile zoom slider.
    window.handleMobileZoom = function (value) {
        // The slider value is 0 to 1. We need to map it to MAX_ZOOM to MIN_ZOOM.
        // Since a lower slider value should mean more zoomed in (smaller cameraDistance), we reverse the mapping.
        const newDist = MAX_ZOOM - (value * (MAX_ZOOM - MIN_ZOOM));
        cameraDistance = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newDist));
    }
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

function spawnPortal(x, z, fromNetwork = false) {
    if (voidPortalMesh) scene.remove(voidPortalMesh);

    const tex = createPortalTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    voidPortalMesh = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat);
    voidPortalMesh.rotation.x = -Math.PI / 2;
    // Get terrain height for proper Y positioning
    const terrainY = (typeof getTerrainHeight === 'function') ? getTerrainHeight(x, z) : 0;
    voidPortalMesh.position.set(x, terrainY + 0.2, z);
    scene.add(voidPortalMesh);

    portalDespawnTime = Date.now() + 120000;

    showToast("A Void Portal has opened!");
    broadcastSound('magic', { x: x, y: 0, z: z });

    // FIX: Send to Dedicated Server if connected
    if (!fromNetwork) {
        const msg = { type: 'spawnPortal', x: x, z: z };

        // PRIORITIZE DEDICATED
        if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
            dedicatedSocket.send(JSON.stringify(msg));
        }
        else if (isHost) {
            broadcastToClients(msg);
        }
    }
}

function enterLavaWorld() {
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

window.respawnPlayer = function () {
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

    const ok = await dedicatedAdminLogin(pw);

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
    if (!isConnectedToDedicated || !isAdminOnDedicated) return;
    const ip = prompt("Enter IP address to unban:");
    if (ip) {
        dedicatedSocket.send(JSON.stringify({
            type: 'admin_cmd',
            cmd: 'unban',
            ip: ip.trim()
        }));
    }
}

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
    container.innerHTML = '';

    if (isHost || isAdminOnDedicated) {
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
            // Check network mode
            if (isConnectedToDedicated && isAdminOnDedicated) {
                dedicatedSocket.send(JSON.stringify({ type: 'admin_cmd', cmd: 'spawnPortal' }));
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
            btnUnban.style.background = '#2f6b33';
            btnUnban.style.marginTop = '5px';
            btnUnban.innerText = "Unban IP";
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
    // 1. Dedicated Server Logic (PRIORITY)
    // If we are connected to the official server, we MUST send the command there.
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({
            type: 'admin_cmd',
            cmd: 'kick',
            targetId: pid
        }));
        showToast(`Kicking ${pid}...`);
        return;
    }

    // 2. PeerJS (P2P) Host Logic (For private rooms)
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
    // 1. Dedicated Server Logic (PRIORITY)
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({
            type: 'admin_cmd',
            cmd: 'ban',
            targetId: pid
        }));
        showToast(`Banning ${pid}...`);
        return;
    }

    // 2. PeerJS (P2P) Host Logic (For private rooms)
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
    // 1. DEDICATED SERVER ADMIN LOGIC
    if (isConnectedToDedicated && isAdminOnDedicated) {
        if (dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {

            // Map 'midi' type to 'mute_midi' command
            let cmd = 'mute_chat';
            if (type === 'voice') cmd = 'mute_voice';
            if (type === 'midi') cmd = 'mute_midi'; // <--- ADD THIS

            dedicatedSocket.send(JSON.stringify({
                type: 'admin_cmd',
                cmd: cmd,
                targetId: pid
            }));
            showToast(`Sent ${type} mute command for ${pid}`);
        }
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

function sellFish() {
    // This is the "quick sell" action when pressing Interact near the merchant.
    // It should sell: fish + all wood types + all ore/rock types.

    // Dedicated Server Authority (no local mutation; server sends stateUpdate)
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        const fishCount = (saveState.inventory || []).length;

        const woodCountTyped = Object.values(saveState.woodInventory || {}).reduce((sum, v) => sum + (v || 0), 0);
        const woodCountLegacy = (saveState.wood || 0);
        const woodCount = woodCountTyped + woodCountLegacy;

        const oreCountTyped = Object.values(saveState.oreInventory || {}).reduce((sum, v) => sum + (v || 0), 0);
        const oreCountLegacy = (saveState.stone || 0);
        const oreCount = oreCountTyped + oreCountLegacy;

        if (fishCount <= 0 && woodCount <= 0 && oreCount <= 0) {
            showToast("Nothing to sell!");
            return;
        }

        if (fishCount > 0) dedicatedSocket.send(JSON.stringify({ type: 'sellFish' }));
        if (woodCount > 0) dedicatedSocket.send(JSON.stringify({ type: 'sellWood' }));
        if (oreCount > 0) dedicatedSocket.send(JSON.stringify({ type: 'sellOre' }));

        const merchantUI = document.getElementById('merchant-ui');
        if (merchantUI) merchantUI.style.display = 'none';
        return;
    }

    let totalValue = 0;
    let totalCount = 0;

    // --- Fish ---
    if (Array.isArray(saveState.inventory) && saveState.inventory.length > 0) {
        for (const f of saveState.inventory) {
            totalValue += (f.price || f.value || 10);
        }
        totalCount += saveState.inventory.length;
    }

    // --- Wood (Typed) ---
    if (!saveState.woodInventory) saveState.woodInventory = {};
    Object.keys(saveState.woodInventory).forEach(woodId => {
        const amt = saveState.woodInventory[woodId] || 0;
        if (amt <= 0) return;
        const woodType = WOOD_TYPES.find(w => w.id === woodId);
        const price = woodType ? woodType.price : 20;
        totalValue += amt * price;
        totalCount += amt;
    });

    // --- Wood (Legacy) ---
    if (saveState.wood && saveState.wood > 0) {
        totalValue += saveState.wood * 20;
        totalCount += saveState.wood;
    }

    // --- Ore/Rock (Typed) ---
    if (!saveState.oreInventory) saveState.oreInventory = {};
    Object.keys(saveState.oreInventory).forEach(oreId => {
        const amt = saveState.oreInventory[oreId] || 0;
        if (amt <= 0) return;
        const oreType = ORE_TYPES.find(o => o.id === oreId);
        const price = oreType ? oreType.price : 30;
        totalValue += amt * price;
        totalCount += amt;
    });

    // --- Stone (Legacy) ---
    if (saveState.stone && saveState.stone > 0) {
        totalValue += saveState.stone * 30;
        totalCount += saveState.stone;
    }

    if (totalValue <= 0 || totalCount <= 0) {
        showToast("Nothing to sell!");
        return;
    }

    // Clear inventories now that we've computed totals
    saveState.inventory = [];
    saveState.woodInventory = {};
    saveState.wood = 0;
    saveState.oreInventory = {};
    saveState.stone = 0;

    saveState.money += totalValue;
    Sound.sell();
    saveGame();
    updateUI();

    // If merchant UI is open, refresh it
    const merchantUI = document.getElementById('merchant-ui');
    if (merchantUI && merchantUI.style.display === 'flex') {
        updateMerchantUI(merchantUI);
    }

    showToast(`Sold ${totalCount} items for $${totalValue}!`);
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

// --- FLOWER PICKING ---
function pickFlower(index, fromNetwork = false) {
    if (index < 0 || index >= pickableFlowers.length) return;
    const flower = pickableFlowers[index];
    if (!flower || flower.userData.isPicked) return;

    // Hide the flower
    flower.visible = false;
    flower.userData.isPicked = true;

    // Respawn after 3 minutes
    setTimeout(() => {
        respawnFlower(index);
    }, 180000);

    // Grant flower (Only if local action)
    if (!fromNetwork) {
        // Get floristry level and determine flower type
        if (!saveState.skills) saveState.skills = { mining: { xp: 0 }, lumberjack: { xp: 0 }, fishing: { xp: 0 }, floristry: { xp: 0 } };
        if (!saveState.skills.floristry) saveState.skills.floristry = { xp: 0 };
        const floristryXP = saveState.skills.floristry?.xp || 0;
        const floristryLevel = getLevelFromXP(floristryXP);

        const flowerType = getResourceForLevel(floristryLevel, FLOWER_TYPES);

        // Add to inventory
        if (!saveState.flowerInventory) saveState.flowerInventory = {};
        saveState.flowerInventory[flowerType.id] = (saveState.flowerInventory[flowerType.id] || 0) + 1;

        // Award XP
        addSkillXP('floristry', flowerType.xp);

        saveGame();
        showToast(`+1 ${flowerType.name} (+${flowerType.xp} XP)`);

        // Broadcast to others
        const msg = { type: 'pick_flower', index: index };

        // Send to Dedicated Server if connected
        if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
            dedicatedSocket.send(JSON.stringify(msg));
            dedicatedSocket.send(JSON.stringify({
                type: 'syncResources',
                woodInventory: saveState.woodInventory || {},
                oreInventory: saveState.oreInventory || {},
                flowerInventory: saveState.flowerInventory || {},
                skills: saveState.skills
            }));
        }
        // Host Broadcast
        else if (isHost) {
            broadcastToClients(msg);
        }
        // Client Send to Host
        else if (hostConn && hostConn.open) {
            hostConn.send(msg);
        }
    }
}

function respawnFlower(index) {
    if (index < 0 || index >= pickableFlowers.length) return;
    const flower = pickableFlowers[index];
    if (!flower || !flower.userData.isPicked) return;

    flower.visible = true;
    flower.userData.isPicked = false;
}

// --- HUD TOGGLE ---
let hudVisible = true;
function toggleHud() {
    hudVisible = !hudVisible;
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

    // 3. Instructions
    const instr = document.getElementById('instructions');
    if (instr) instr.style.display = disp;

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

    // --- HIDE 3D PLAYER LABELS ---
    // Toggle name tags, titles, and chat bubbles on all players
    const togglePlayerLabels = (mesh) => {
        if (!mesh) return;
        const nameTag = mesh.getObjectByName('nameTag');
        const titleSprite = mesh.getObjectByName('titleSprite');
        const chatBubble = mesh.getObjectByName('chatBubble');
        const talkingIcon = mesh.getObjectByName('talkingIcon');
        if (nameTag) nameTag.visible = hudVisible;
        if (titleSprite) titleSprite.visible = hudVisible && saveState.showTitles;
        if (chatBubble) chatBubble.visible = hudVisible;
        if (talkingIcon) talkingIcon.visible = hudVisible;
    };

    // Local player
    if (player) togglePlayerLabels(player);

    // Remote players
    Object.values(otherPlayers).forEach(p => togglePlayerLabels(p.mesh));

    // NPCs
    togglePlayerLabels(npcMerchant);
    togglePlayerLabels(npcStylist);
    togglePlayerLabels(npcBait);
    togglePlayerLabels(npcTutorial);
    togglePlayerLabels(npcLavaMerchant);
    togglePlayerLabels(npcLavaStylist);
    togglePlayerLabels(npcLavaBait);

    // Ghost
    if (ghostMesh) togglePlayerLabels(ghostMesh);

    if (hudVisible) showToast("HUD Visible");
}
