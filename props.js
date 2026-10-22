// --- PROP SYSTEM (Added by Antigravity) ---
let myProps = []; // Local tracking if needed, but primarily server-authoritative
let props = {}; // {id: mesh}
let activeProps = []; // HOST ONLY: Tracks props placed by remote clients

window.togglePropsUI = function () {
    const ui = document.getElementById('props-ui');
    const isOpen = ui.style.display === 'flex';

    if (!isOpen) {
        // --- OPENING PROPS UI ---
        ui.style.display = 'flex';
        renderPropsUI();

        // Unlock mouse
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        // Freeze first-person controls
        if (typeof isFirstPerson !== 'undefined' && isFirstPerson) {
            cameraFrozen = true;
            inputBlocked = true;
            if (player) player.freezeControls = true;
        }

        // Hide instructions (matches shop/options/etc)
        const instr = document.getElementById('instructions');
        if (instr) instr.style.display = 'none';
    }
    else {
        // --- CLOSING PROPS UI ---
        ui.style.display = 'none';

        // Restore controls
        if (typeof isFirstPerson !== 'undefined' && isFirstPerson) {
            cameraFrozen = false;
            inputBlocked = false;
            if (player) player.freezeControls = false;

            // Re-lock mouse on close
            const canvas = renderer?.domElement;
            if (canvas && !document.pointerLockElement) {
                canvas.requestPointerLock();
            }
        }

        // Restore instructions
        const instr = document.getElementById('instructions');
        if (instr) instr.style.display = 'grid';
    }
};




function renderPropsUI() {
    const list = document.getElementById('props-list');
    if (!list) return;
    list.innerHTML = '';

    const items = [
        { id: 'campfire', icon: 'campfire', name: 'Campfire' },
        { id: 'tent', icon: 'tent', name: 'Tent' },
        { id: 'blanket', icon: 'blanket', name: 'Picnic Mat' },
        { id: 'chair', icon: 'chair', name: 'Chair' },
        { id: 'table', icon: 'table', name: 'Picnic Table' },
        { id: 'cooler', icon: 'cooler', name: 'Cooler' },
        { id: 'basket', icon: 'basket', name: 'Basket' },
        { id: 'radio', icon: 'radio', name: 'Radio' },
        { id: 'lantern', icon: 'lantern', name: 'Lantern' },
        // NEW PROPS
        { id: 'umbrella', icon: 'umbrella', name: 'Beach Umbrella' },
        { id: 'grill', icon: 'grill', name: 'BBQ Grill' },
        { id: 'hammock', icon: 'hammock', name: 'Hammock' },
        { id: 'logbench', icon: 'logbench', name: 'Log Bench' },
        { id: 'fishsign', icon: 'fishsign', name: 'Fishing Sign' },
        { id: 'crate', icon: 'crate', name: 'Dock Crate' },
        { id: 'buoy', icon: 'buoy', name: 'Buoy' },
        { id: 'anchor', icon: 'anchor', name: 'Anchor' },
        { id: 'flowerpot', icon: 'flowerpot', name: 'Flower Pot' },
        { id: 'torch', icon: 'torch', name: 'Tiki Torch' },
        { id: 'boat', icon: 'boat', name: 'Rowboat' },
        { id: 'tireswing', icon: 'tireswing', name: 'Tire Swing' },
        { id: 'hotspring', icon: 'hotspring', name: 'Hot Spring' },
        { id: 'windchime', icon: 'windchime', name: 'Wind Chime' },
        { id: 'surfboard', icon: 'surfboard', name: 'Surfboard' },
        { id: 'screen', icon: 'screen', name: 'Stream Player' }
    ];

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'grid-entry';
        const ic = window.PX ? PX.icon(item.icon, 30) : '';
        div.innerHTML = `<div>${ic}</div><div>${item.name}</div>`;
        div.onclick = () => {
            placeProp(item.id);
            togglePropsUI();
        };
        list.appendChild(div);
    });
}

function placeProp(type) {
    // RATE LIMIT
    if (Date.now() - lastPropTime < PROP_COOLDOWN) {
        showToast("Slow down!", 'error');
        return;
    }

    // --- SCREEN: prompt for the source BEFORE the cooldown is armed ---
    let src = null;
    if (type === 'screen') {
        // Room-wide cap: each embed is its own iframe (heavy), so limit how
        // many screens a room may show at once.
        const ytCount = Object.keys(ytPlayers).length;
        if (ytCount >= MAX_YT_SCREENS) {
            showToast('This room already has ' + MAX_YT_SCREENS + ' screens.', 'error');
            return;
        }
        const url = window.prompt('Paste a YouTube or Twitch URL to play on the screen:', '');
        if (!url) return; // cancelled
        src = parseScreenSource(String(url).trim());
        if (!src) {
            showToast('That does not look like a YouTube or Twitch URL.', 'error');
            return;
        }
    }

    lastPropTime = Date.now();

    const x = parseFloat(player.position.x.toFixed(2));
    const z = parseFloat(player.position.z.toFixed(2));
    const rot = parseFloat(player.rotation.y.toFixed(3)); // Add rotation

    // Wall-clock anchor for video sync: every client advances its own player
    // from startedAt, so no periodic timestamps are needed to stay in step.
    const startedAt = Date.now();

    const propData = {
        id: Date.now() + "_" + Math.random().toString().substr(2, 5),
        type,
        x,
        z,
        rot, // Include rotation in prop data
        // Source fields (null for every other prop type)
        provider: src ? src.provider : null,
        videoId: src && src.provider === 'youtube' ? src.id : null,
        twitchId: src && src.provider === 'twitch' ? src.id : null,
        twitchKind: src && src.provider === 'twitch' ? src.twitchKind : null,
        startedAt: startedAt,
        placer: String(myDeviceID || ''),
        timestamp: Date.now()
    };

    if (isHost) {
        spawnPropMesh(propData);
        myProps.push(propData);
        broadcastToClients({ type: 'propPlaced', prop: propData });
        if (src && src.provider === 'youtube') startYtSyncLoop(propData);
    } else if (hostConn && hostConn.open) {
        hostConn.send({
            type: 'placeProp',
            propType: type,
            // The host relays our id back in propPlaced so ALL records across
            // the room share one id (this keeps the sync key stable).
            propId: propData.id,
            x,
            z,
            rot, // Send rotation to host
            // Source fields for the host to carry into the record it relays
            provider: propData.provider,
            videoId: propData.videoId,
            twitchId: propData.twitchId,
            twitchKind: propData.twitchKind,
            startedAt: startedAt,
            placer: String(myDeviceID || '')
        });
        if (src && src.provider === 'youtube') startYtSyncLoop(propData);
    }

    // Progression: count placements for the "Decorator" achievement. Props
    // are session-scoped, so the count lives in the save rather than being
    // derived from the scene.
    saveState.propsPlaced = (Number(saveState.propsPlaced) || 0) + 1;
    if (typeof notifyPropPlaced === 'function') notifyPropPlaced();
}


function undoProp() {
    if (isHost) {
        // Host Undo
        if (myProps.length > 0) {
            const last = myProps.pop();
            removePropFromWorld(last.id);
            broadcastToClients({ type: 'propRemoved', id: last.id });
        }
    } else if (hostConn && hostConn.open) {
        // Client Request Undo
        hostConn.send({ type: 'undoProp' });
    }
}

// Helper to create a checkered texture on the fly
function createCheckeredTexture(c1, c2) {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = c2;
    const squares = 4; // 4x4 checkerboard
    const step = size / squares;

    for (let i = 0; i < squares; i++) {
        for (let j = 0; j < squares; j++) {
            if ((i + j) % 2 === 0) {
                ctx.fillRect(i * step, j * step, step, step);
            }
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter; // Keep it pixelated/sharp
    return tex;
}

function spawnPropMesh(data) {
    if (props[data.id]) return;

    let mesh;
    const g = new THREE.Group();

    // ... (Campfire logic remains the same) ...
    if (data.type === 'campfire') {
        const logGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.2);
        const logMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        [[Math.PI / 4, 0.1], [-Math.PI / 4, 0.1], [0, 0.1], [Math.PI / 2, 0.1]].forEach((rot) => {
            const l = new THREE.Mesh(logGeo, logMat);
            l.rotation.z = Math.PI / 2; l.rotation.y = rot[0]; l.position.y = rot[1];
            g.add(l);
        });
        const fire = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.0, 8), new THREE.MeshBasicMaterial({ color: 0xff4500 }));
        fire.position.y = 0.6; g.add(fire);
        const light = new THREE.PointLight(0xffaa00, 2, 10);
        light.position.y = 1.0; g.add(light);
    }

    // --- NEW TENT: A-FRAME WITH DOUBLE BED ---
    else if (data.type === 'tent') {
        // A-Frame tent: Two sloped roof panels meeting at a peak, touching the ground
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x556B2F, side: THREE.DoubleSide });

        // Tent dimensions (bigger - fits 2 people)
        const tentWidth = 6.0;   // Total width at base
        const tentHeight = 3.5;  // Peak height
        const tentDepth = 7.0;   // Length front to back

        // Calculate slope dimensions using Pythagorean theorem
        // Each slope goes from ground to peak (half the base width, full height)
        const halfWidth = tentWidth / 2;
        const slopeLength = Math.sqrt(halfWidth * halfWidth + tentHeight * tentHeight);
        const slopeAngle = Math.atan2(tentHeight, halfWidth); // Angle from ground to peak

        // Left Slope - pivots from left ground edge, rotates up to peak
        const slope1 = new THREE.Mesh(new THREE.BoxGeometry(slopeLength, 0.1, tentDepth), roofMat);
        // Position at left edge, halfway up the slope
        slope1.position.set(-halfWidth / 2, tentHeight / 2, 0);
        slope1.rotation.z = slopeAngle; // Rotate to meet at peak

        // Right Slope - pivots from right ground edge, rotates up to peak
        const slope2 = new THREE.Mesh(new THREE.BoxGeometry(slopeLength, 0.1, tentDepth), roofMat);
        // Position at right edge, halfway up the slope
        slope2.position.set(halfWidth / 2, tentHeight / 2, 0);
        slope2.rotation.z = -slopeAngle; // Rotate opposite direction

        // Ridge pole at the peak (optional visual element)
        const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x8B7355 });
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, tentDepth + 0.3), ridgeMat);
        ridge.position.set(0, tentHeight, 0);

        // 2. The Double Bed Inside (scaled to fit larger tent)
        const bedGrp = new THREE.Group();

        // Mattress (White) - sized to fit inside tent
        const mattress = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.35, 5.5), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
        mattress.position.y = 0.175;

        // Pillows (Two distinct pillows)
        const pillowGeo = new THREE.BoxGeometry(1.4, 0.25, 0.6);
        const pillowMat = new THREE.MeshStandardMaterial({ color: 0xffffff });

        const p1 = new THREE.Mesh(pillowGeo, pillowMat);
        p1.position.set(-1.0, 0.5, -2.2);

        const p2 = new THREE.Mesh(pillowGeo, pillowMat);
        p2.position.set(1.0, 0.5, -2.2);

        // Duvet (Covering bottom half) - RED
        const duvet = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 3.0), new THREE.MeshStandardMaterial({ color: 0xcc3333 }));
        duvet.position.set(0, 0.25, 0.8);

        bedGrp.add(mattress, p1, p2, duvet);

        g.add(slope1, slope2, ridge, bedGrp);
    }

    // --- NEW BLANKET: CHECKERED & BIGGER ---
    else if (data.type === 'blanket') {
        // Use the helper function to make a sharp Red/White checker texture
        const tex = createCheckeredTexture('#cc3333', '#ffffff');
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 2); // Make the tiles smaller/more dense

        const bMat = new THREE.MeshStandardMaterial({ map: tex });

        // Size increased to 4x4 (was 3x3)
        const blanket = new THREE.Mesh(new THREE.BoxGeometry(4, 0.05, 4), bMat);
        g.add(blanket);
    }

    // --- NEW CHAIR: WOODEN SLAT STYLE ---
    else if (data.type === 'chair') {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x5D4037 }); // Dark Wood

        // Legs (Angled slightly)
        const legGeo = new THREE.BoxGeometry(0.15, 1.2, 0.15);
        const l1 = new THREE.Mesh(legGeo, woodMat); l1.position.set(-0.6, 0.6, -0.6); l1.rotation.z = 0.1; l1.rotation.x = 0.1;
        const l2 = new THREE.Mesh(legGeo, woodMat); l2.position.set(0.6, 0.6, -0.6); l2.rotation.z = -0.1; l2.rotation.x = 0.1;
        const l3 = new THREE.Mesh(legGeo, woodMat); l3.position.set(-0.6, 0.6, 0.6); l3.rotation.z = 0.1; l3.rotation.x = -0.1;
        const l4 = new THREE.Mesh(legGeo, woodMat); l4.position.set(0.6, 0.6, 0.6); l4.rotation.z = -0.1; l4.rotation.x = -0.1;

        // Seat (Plank style)
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 1.6), woodMat);
        seat.position.y = 1.2;

        // Backrest (Vertical Slats)
        const backGrp = new THREE.Group();
        backGrp.position.set(0, 1.2, -0.7);
        backGrp.rotation.x = -0.2; // Lean back slightly

        // Frame posts
        const postGeo = new THREE.BoxGeometry(0.15, 1.5, 0.1);
        const pLeft = new THREE.Mesh(postGeo, woodMat); pLeft.position.x = -0.6; pLeft.position.y = 0.75;
        const pRight = new THREE.Mesh(postGeo, woodMat); pRight.position.x = 0.6; pRight.position.y = 0.75;

        // Top bar
        const topBar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.1), woodMat);
        topBar.position.y = 1.4;

        // Inner Slats
        const slatGeo = new THREE.BoxGeometry(0.1, 1.2, 0.05);
        const s1 = new THREE.Mesh(slatGeo, woodMat); s1.position.set(-0.2, 0.6, 0);
        const s2 = new THREE.Mesh(slatGeo, woodMat); s2.position.set(0.2, 0.6, 0);

        backGrp.add(pLeft, pRight, topBar, s1, s2);

        g.add(l1, l2, l3, l4, seat, backGrp);

        // Scale it down slightly so it fits the player
        g.scale.set(0.7, 0.7, 0.7);
    }

    // --- OTHER PROPS (Table, Cooler, etc. - Kept from previous) ---
    else if (data.type === 'table') {
        const wood = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const top = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 1.5), wood); top.position.y = 0.9;
        const leg = new THREE.BoxGeometry(0.15, 0.9, 0.15);
        const l1 = new THREE.Mesh(leg, wood); l1.position.set(-1, 0.45, 0.5);
        const l2 = new THREE.Mesh(leg, wood); l2.position.set(1, 0.45, 0.5);
        const l3 = new THREE.Mesh(leg, wood); l3.position.set(-1, 0.45, -0.5);
        const l4 = new THREE.Mesh(leg, wood); l4.position.set(1, 0.45, -0.5);
        g.add(top, l1, l2, l3, l4);
    }
    else if (data.type === 'cooler') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x1E90FF }));
        body.position.y = 0.3;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.15, 0.55), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        lid.position.y = 0.65;
        g.add(body, lid);
    }
    else if (data.type === 'basket') {
        const weave = new THREE.MeshStandardMaterial({ color: 0xDEB887 });
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.4), weave);
        box.position.y = 0.2;
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 4, 8, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8B4513 }));
        handle.position.set(0, 0.4, 0);
        g.add(box, handle);
    }
    else if (data.type === 'radio') {
        const rMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.2), rMat);
        body.position.y = 0.2;
        const spk = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), new THREE.MeshBasicMaterial({ color: 0x111111 }));
        spk.position.set(0.15, 0.2, 0.11);
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6), new THREE.MeshStandardMaterial({ color: 0x999999 }));
        ant.position.set(-0.25, 0.5, 0);
        g.add(body, spk, ant);
    }
    else if (data.type === 'lantern') {
        const frame = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const glass = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.8 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.1), frame); base.position.y = 0.05;
        const globe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4), glass); globe.position.y = 0.3;
        const light = new THREE.PointLight(0xffaa00, 1.5, 8); light.position.y = 0.3;
        g.add(base, globe, light);
    }
    // --- NEW PROPS ---
    else if (data.type === 'umbrella') {
        // Beach Umbrella - colorful striped canopy on a pole
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5), poleMat);
        pole.position.y = 1.25;
        const canopyMat = new THREE.MeshStandardMaterial({ color: 0xFF6B6B, side: THREE.DoubleSide });
        const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 8, 1, true), canopyMat);
        canopy.position.y = 2.5;
        g.add(pole, canopy);
    }
    else if (data.type === 'grill') {
        // BBQ Grill - barrel style
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 16), metalMat);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.y = 0.8;
        const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), metalMat);
        leg1.position.set(-0.35, 0.4, 0.4);
        const leg2 = leg1.clone(); leg2.position.set(0.35, 0.4, 0.4);
        const leg3 = leg1.clone(); leg3.position.set(-0.35, 0.4, -0.4);
        const leg4 = leg1.clone(); leg4.position.set(0.35, 0.4, -0.4);
        const lidMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const lid = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
        lid.position.y = 0.8;
        lid.rotation.z = Math.PI / 2;
        g.add(barrel, leg1, leg2, leg3, leg4, lid);
    }
    else if (data.type === 'hammock') {
        // Hammock between two poles
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x654321 });
        const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.5), poleMat);
        pole1.position.set(-2, 1.25, 0);
        pole1.rotation.z = 0.15;
        const pole2 = pole1.clone();
        pole2.position.set(2, 1.25, 0);
        pole2.rotation.z = -0.15;
        const fabricMat = new THREE.MeshStandardMaterial({ color: 0x4ECDC4, side: THREE.DoubleSide });
        const fabric = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.2, 8, 4), fabricMat);
        fabric.position.y = 1.0;
        fabric.rotation.x = -Math.PI / 2;
        // Sag the hammock
        const pos = fabric.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            pos.setZ(i, pos.getZ(i) - Math.cos(x * 0.8) * 0.3);
        }
        fabric.geometry.attributes.position.needsUpdate = true;
        g.add(pole1, pole2, fabric);
    }
    else if (data.type === 'logbench') {
        // Simple log bench
        const logMat = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
        const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.5, 12), logMat);
        seat.rotation.z = Math.PI / 2;
        seat.position.y = 0.5;
        const stump1 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.5, 8), logMat);
        stump1.position.set(-0.9, 0.25, 0);
        const stump2 = stump1.clone();
        stump2.position.set(0.9, 0.25, 0);
        g.add(seat, stump1, stump2);
    }
    else if (data.type === 'fishsign') {
        // Wooden sign with fish shape
        const postMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.0, 0.15), postMat);
        post.position.y = 1.0;
        const signMat = new THREE.MeshStandardMaterial({ color: 0xDEB887 });
        const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.1), signMat);
        sign.position.set(0, 1.6, 0.1);
        // Fish icon
        const fishMat = new THREE.MeshStandardMaterial({ color: 0x4169E1 });
        const fishBody = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 4), fishMat);
        fishBody.scale.set(1.5, 0.8, 0.5);
        fishBody.position.set(0, 1.6, 0.2);
        g.add(post, sign, fishBody);
    }
    else if (data.type === 'crate') {
        // Wooden dock crate
        const crateMat = new THREE.MeshStandardMaterial({ color: 0xA0522D });
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.8), crateMat);
        box.position.y = 0.4;
        // Add some plank lines
        const plankMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        for (let i = -0.3; i <= 0.3; i += 0.15) {
            const plank = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.02, 0.82), plankMat);
            plank.position.set(0, 0.4 + i, 0);
            g.add(plank);
        }
        g.add(box);
    }
    else if (data.type === 'buoy') {
        // Red buoy floating marker
        const buoyMat = new THREE.MeshStandardMaterial({ color: 0xDC143C });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), buoyMat);
        body.scale.y = 1.4;
        body.position.y = 0.5;
        const topMat = new THREE.MeshStandardMaterial({ color: 0xFFD700 });
        const top = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 8), topMat);
        top.position.y = 1.2;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.08, 8, 16), new THREE.MeshStandardMaterial({ color: 0xFFFFFF }));
        ring.position.y = 0.5;
        ring.rotation.x = Math.PI / 2;
        g.add(body, top, ring);
    }
    else if (data.type === 'anchor') {
        // Ship anchor - classic admiralty style
        const anchorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.7, roughness: 0.3 });

        // Main vertical shaft (shank)
        const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), anchorMat);
        shank.position.y = 0.8;

        // Ring at top
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 8, 16), anchorMat);
        ring.position.y = 1.65;

        // Stock (horizontal bar at top, perpendicular to arms)
        const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8), anchorMat);
        stock.rotation.z = Math.PI / 2;
        stock.position.y = 1.4;

        // Arms going DOWN and outward from bottom of shank
        const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), anchorMat);
        leftArm.position.set(-0.2, 0.15, 0);
        leftArm.rotation.z = Math.PI / 3; // 60 degrees - pointing down-left

        const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), anchorMat);
        rightArm.position.set(0.2, 0.15, 0);
        rightArm.rotation.z = -Math.PI / 3; // 60 degrees - pointing down-right

        // Flukes (arrow-shaped tips) pointing UP/inward
        const flukeShape = new THREE.Shape();
        flukeShape.moveTo(0, 0);
        flukeShape.lineTo(-0.15, -0.25);
        flukeShape.lineTo(0, -0.18);
        flukeShape.lineTo(0.15, -0.25);
        flukeShape.lineTo(0, 0);
        const flukeGeo = new THREE.ExtrudeGeometry(flukeShape, { depth: 0.04, bevelEnabled: false });

        const leftFluke = new THREE.Mesh(flukeGeo, anchorMat);
        leftFluke.position.set(-0.42, 0.02, -0.02);
        leftFluke.rotation.z = -Math.PI / 6;

        const rightFluke = new THREE.Mesh(flukeGeo, anchorMat);
        rightFluke.position.set(0.42, 0.02, -0.02);
        rightFluke.rotation.z = Math.PI / 6;

        g.add(shank, ring, stock, leftArm, rightArm, leftFluke, rightFluke);
    }
    else if (data.type === 'flowerpot') {
        // Terracotta pot with simple flowers (no z-fighting)
        const potMat = new THREE.MeshStandardMaterial({ color: 0xCD853F });
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.25, 0.5, 12), potMat);
        pot.position.y = 0.25;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 6, 16), potMat);
        rim.position.y = 0.5; rim.rotation.x = Math.PI / 2;
        const dirtMat = new THREE.MeshStandardMaterial({ color: 0x3E2723 });
        const dirt = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 12), dirtMat);
        dirt.position.y = 0.48;

        // Simple flowers on stems - no overlapping geometry
        const stemMat = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        const flowerColors = [0xFF69B4, 0xFFD700, 0xFF6347, 0x9370DB, 0x00CED1];
        flowerColors.forEach((c, i) => {
            const angle = (i / flowerColors.length) * Math.PI * 2;
            const radius = 0.15;
            const stemHeight = 0.35 + (i % 3) * 0.12;

            // Stem
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, stemHeight, 6), stemMat);
            stem.position.set(Math.cos(angle) * radius, 0.5 + stemHeight / 2, Math.sin(angle) * radius);
            g.add(stem);

            // Flower head - single larger sphere
            const flowerMat = new THREE.MeshStandardMaterial({ color: c });
            const flower = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), flowerMat);
            flower.position.set(Math.cos(angle) * radius, 0.52 + stemHeight, Math.sin(angle) * radius);
            g.add(flower);

            // Center of flower (yellow dot) - offset slightly up to avoid z-fighting
            const centerMat = new THREE.MeshStandardMaterial({ color: 0xFFFF00 });
            const center = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), centerMat);
            center.position.set(Math.cos(angle) * radius, 0.55 + stemHeight, Math.sin(angle) * radius);
            g.add(center);
        });
        g.add(pot, rim, dirt);
    }
    else if (data.type === 'torch') {
        // Tiki torch with flame light
        const bambooMat = new THREE.MeshStandardMaterial({ color: 0xD2691E });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.0, 8), bambooMat);
        pole.position.y = 1.0;
        const holderMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
        const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.3, 8), holderMat);
        holder.position.y = 2.0;
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xFF4500 });
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6), flameMat);
        flame.position.y = 2.3;
        const light = new THREE.PointLight(0xFF6600, 1.5, 6);
        light.position.y = 2.3;
        g.add(pole, holder, flame, light);
    }
    else if (data.type === 'boat') {
        // Small rowboat - using box-based construction
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const darkWood = new THREE.MeshStandardMaterial({ color: 0x654321 });
        // Bottom of hull
        const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 2.5), woodMat);
        bottom.position.y = 0.15;
        // Left side
        const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 2.4), woodMat);
        leftSide.position.set(-0.4, 0.35, 0);
        leftSide.rotation.z = -0.15;
        // Right side
        const rightSide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 2.4), woodMat);
        rightSide.position.set(0.4, 0.35, 0);
        rightSide.rotation.z = 0.15;
        // Front (bow)
        const bow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.1), woodMat);
        bow.position.set(0, 0.3, 1.2);
        // Back (stern)
        const stern = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.1), woodMat);
        stern.position.set(0, 0.3, -1.2);
        // Seats
        const seat1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.25), darkWood);
        seat1.position.set(0, 0.4, 0.4);
        const seat2 = seat1.clone();
        seat2.position.set(0, 0.4, -0.4);
        // Oars resting on sides
        const oarMat = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
        const oar1 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 0.1), oarMat);
        oar1.position.set(0.1, 0.5, 0); oar1.rotation.y = 0.2;
        const oar2 = oar1.clone();
        oar2.position.set(-0.1, 0.5, 0); oar2.rotation.y = -0.2;
        // Oar blades
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.2), bladeMat);
        blade1.position.set(1.1, 0.5, 0.22);
        const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.2), bladeMat);
        blade2.position.set(-1.1, 0.5, -0.22);
        g.add(bottom, leftSide, rightSide, bow, stern, seat1, seat2, oar1, oar2, blade1, blade2);
    }
    else if (data.type === 'tireswing') {
        // Tire swing hanging from a frame
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x654321 });
        const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.5), frameMat);
        post1.position.set(-1.2, 1.75, 0); post1.rotation.z = 0.1;
        const post2 = post1.clone();
        post2.position.set(1.2, 1.75, 0); post2.rotation.z = -0.1;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8), frameMat);
        beam.rotation.z = Math.PI / 2; beam.position.y = 3.3;
        const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        const tire = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.15, 8, 16), tireMat);
        tire.position.y = 1.5; tire.rotation.x = Math.PI / 2;
        const ropeMat = new THREE.MeshStandardMaterial({ color: 0xD2B48C });
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8), ropeMat);
        rope.position.y = 2.4;
        g.add(post1, post2, beam, tire, rope);
    }
    else if (data.type === 'hotspring') {
        // Hot spring pool with steam effect
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x696969 });
        const waterMat = new THREE.MeshStandardMaterial({ color: 0x40E0D0, transparent: true, opacity: 0.7 });
        // Rocks around the edge
        for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2;
            const rock = new THREE.Mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.2, 6, 4), rockMat);
            rock.position.set(Math.cos(angle) * 1.3, 0.2, Math.sin(angle) * 1.3);
            rock.scale.y = 0.6;
            g.add(rock);
        }
        const water = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.0, 0.3, 16), waterMat);
        water.position.y = 0.15;
        const steamLight = new THREE.PointLight(0x87CEEB, 0.5, 4);
        steamLight.position.y = 0.5;
        g.add(water, steamLight);
    }
    else if (data.type === 'windchime') {
        // Wind chime with hanging rods
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12), frameMat);
        top.position.y = 1.8;
        const stringMat = new THREE.MeshStandardMaterial({ color: 0xD2B48C });
        const chimeMat = new THREE.MeshStandardMaterial({ color: 0xC0C0C0, metalness: 0.8, roughness: 0.2 });
        const lengths = [0.5, 0.6, 0.7, 0.55, 0.65];
        lengths.forEach((len, i) => {
            const angle = (i / lengths.length) * Math.PI * 2;
            const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3), stringMat);
            string.position.set(Math.cos(angle) * 0.15, 1.65, Math.sin(angle) * 0.15);
            const chime = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len), chimeMat);
            chime.position.set(Math.cos(angle) * 0.15, 1.5 - len / 2, Math.sin(angle) * 0.15);
            g.add(string, chime);
        });
        const hangString = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5), stringMat);
        hangString.position.y = 2.05;
        g.add(top, hangString);
    }
    else if (data.type === 'surfboard') {
        // Surfboard leaning against something (touching ground)
        const boardMat = new THREE.MeshStandardMaterial({ color: 0x00CED1 });
        // Main board - positioned to lean with bottom touching ground
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 2.2), boardMat);
        // Lean angle - bottom on ground, top elevated
        board.rotation.x = 1.1; // More aggressive lean
        board.position.set(0, 0.55, -0.4);
        // Stripe across the board
        const stripeMat = new THREE.MeshStandardMaterial({ color: 0xFF6347 });
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.01, 0.15), stripeMat);
        stripe.rotation.x = 1.1;
        stripe.position.set(0, 0.55, -0.4);
        // Fin underneath
        const finMat = new THREE.MeshStandardMaterial({ color: 0x1E90FF });
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.2), finMat);
        fin.rotation.x = 1.1;
        fin.position.set(0, 0.25, 0.35);
        // Small stand/prop to lean against
        const standMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 6), standMat);
        stand.position.set(0, 0.4, -0.7);
        stand.rotation.x = 0.3;
        g.add(board, stripe, fin, stand);
    }

    else if (data.type === 'screen') {
        // YouTube Screen: a chunky jumbotron on legs. The actual video is a
        // real DOM iframe rendered by CSS3DRenderer (attachYtVideo below), so
        // the WebGL mesh is the housing, bezel, stand and speaker towers.
        // Shared geometry constants (also used by the video overlay so the
        // picture sits exactly inside the bezel):
        //   panel centre y = SCREEN_Y, visible video = SCREEN_W x SCREEN_H.
        const SCREEN_Y = 3.55, SCREEN_W = 6.3, SCREEN_H = 3.545;

        const housing = new THREE.MeshStandardMaterial({ color: 0x1d2027, roughness: 0.75 });
        const bezelMat = new THREE.MeshStandardMaterial({ color: 0x3b4152, roughness: 0.45, metalness: 0.25 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a5062, roughness: 0.4, metalness: 0.4 });
        const speakerMat = new THREE.MeshStandardMaterial({ color: 0x24272f, roughness: 0.8 });
        const coneMat = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.9 });

        // Outer bezel (slightly larger, lighter trim) with the dark panel inset.
        const bezel = new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W + 0.5, SCREEN_H + 0.5, 0.18), bezelMat);
        bezel.position.set(0, SCREEN_Y, 0.02);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W + 0.16, SCREEN_H + 0.16, 0.24), housing);
        panel.position.set(0, SCREEN_Y, 0);

        // Dark backing where the video sits (the iframe draws over this).
        const screenPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
            new THREE.MeshBasicMaterial({ color: 0x050608 })
        );
        screenPlane.position.set(0, SCREEN_Y, 0.14);

        g.add(bezel, panel, screenPlane);

        // Floor-standing speaker towers, flush with the panel's lower corners.
        for (const s of [-1, 1]) {
            const tower = new THREE.Mesh(new THREE.BoxGeometry(0.78, 2.35, 0.62), speakerMat);
            tower.position.set(s * (SCREEN_W / 2 + 0.62), 1.175, 0);
            const cap = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.1, 0.68), bezelMat);
            cap.position.set(tower.position.x, 2.36, 0);
            const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), coneMat);
            cone.rotation.x = Math.PI / 2;
            cone.position.set(tower.position.x, 1.6, 0.34);
            const cone2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10), coneMat);
            cone2.rotation.x = Math.PI / 2;
            cone2.position.set(tower.position.x, 0.95, 0.34);
            g.add(tower, cap, cone, cone2);
        }

        // Central stand: two legs plus a crossbar, meeting the panel's bottom.
        const legH = SCREEN_Y - SCREEN_H / 2 + 0.25;   // reaches into the panel
        for (const s of [-1, 1]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, legH, 0.26), metalMat);
            leg.position.set(s * 1.55, legH / 2, 0);
            g.add(leg);
        }
        const cross = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.14, 0.18), metalMat);
        cross.position.set(0, 0.34, 0);
        g.add(cross);

        // Bezel accent strip along the bottom (reads well at night).
        const strip = new THREE.Mesh(
            new THREE.BoxGeometry(SCREEN_W + 0.3, 0.07, 0.04),
            new THREE.MeshBasicMaterial({ color: 0x8b5cf6 })
        );
        strip.position.set(0, SCREEN_Y - SCREEN_H / 2 - 0.2, 0.16);
        g.add(strip);

        // Wire up the video (no-op if CSS3DRenderer/YouTube API unavailable).
        attachYtVideo(data, g);
    }

    mesh = g;
    // Get terrain height for proper Y positioning
    const terrainY = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(data.x, data.z) : 0;
    mesh.position.set(data.x, terrainY, data.z);

    // Use the rotation from the network data. Every prop sender includes it,
    // so a missing/invalid rot means OLD-VERSION peer data: fall back to 0
    // (a stable direction) rather than the local viewer's rotation, which
    // would face the prop differently on every player's screen.
    if (typeof data.rot === 'number' && isFinite(data.rot)) {
        mesh.rotation.y = data.rot;
    } else {
        mesh.rotation.y = 0;
    }

    scene.add(mesh);
    props[data.id] = mesh;
    // Keep the authoritative record on the mesh so interactions (e.g. changing
    // a YouTube Screen's video) can find the prop's data and its placer.
    mesh.userData.propData = data;

    if (typeof broadcastSound === 'function') {
        broadcastSound('footstep', 0);
    }
}

function removePropFromWorld(id) {
    if (props[id]) {
        const p = props[id];
        // Cleanup lights
        p.traverse(c => { if (c.isLight) c.dispose && c.dispose(); });
        scene.remove(p);
        delete props[id];
    }
    // Video cleanup: destroy the YouTube player, drop the CSS3D object and
    // stop the placer's sync heartbeat.
    if (ytPlayers[id]) {
        try { if (ytPlayers[id].player && ytPlayers[id].player.destroy) ytPlayers[id].player.destroy(); } catch (e) { }
        if (ytPlayers[id].twFrame) ytPlayers[id].twFrame.remove();
        if (ytPlayers[id].cssObj && cssScene) cssScene.remove(ytPlayers[id].cssObj);
        delete ytPlayers[id];
    }
    if (ytSyncLoops[id]) { clearInterval(ytSyncLoops[id]); delete ytSyncLoops[id]; }
}

// ===========================================================================
// STREAM PLAYER (YouTube + Twitch)
// ---------------------------------------------------------------------------
// The placer pastes a YouTube or Twitch URL.
//
// YouTube: every client embeds the video with the official IFrame API (hidden
// controls, muted until proximity says otherwise) and advances to the shared
// wall-clock anchor (prop.startedAt), so playback stays in sync with NO
// heartbeats. The placer also broadcasts a small ytSync heartbeat every 2s to
// correct clock skew; everyone else applies it.
//
// Twitch: muted autoplay, but the player lives in an untransformed screen-space
// layer that tracks the panel (see twitchLayer below). Twitch's autoplay gate
// runs IntersectionObserver v2 inside its iframe and refuses players it cannot
// see: anything inside a perspective/preserve-3d wrapper, an element that is
// faded out, or a player smaller than its minimum size all get
// "Autoplay disabled ... style visibility". A plain 640x360 iframe that is
// actually on screen passes, so the video is fitted to the panel's projected
// box with a 2D scale and the depth punch crops it to the housing opening.
// The SOUND chip reloads the embed unmuted on a real top-document click.
//
// Rendering: iframes cannot be blitted into WebGL (cross-origin), so they live
// in the DOM. YouTube follows the prop through CSS3DRenderer (three r128
// examples, pinned the same way as three itself); Twitch uses the flat layer.
// The WebGL canvas is composited above both and punchScreens() erases its
// alpha behind the video, so the world still draws in front of the screen.
// ===========================================================================
const MAX_YT_SCREENS = 5;
const ytPlayers = {};
const ytSyncLoops = {};
let ytApiReady = false;
const ytPlayerQueue = [];
let cssRenderer = null;
let cssScene = null;
let ytOverlay = null;
// Twitch players live OUTSIDE the CSS3D tree. Twitch's autoplay gate uses
// IntersectionObserver v2 (trackVisibility) from inside the iframe; an element
// inside a preserve-3d/perspective wrapper makes that observer report the
// player as not visible, which permanently disables autoplay with
// "Autoplay disabled ... style visibility". A plain, untransformed iframe that
// tracks the panel's projected rect on screen autoplays fine, and it still sits
// under the WebGL canvas, so punchScreens() keeps the world in front of it.
let twitchLayer = null;

// The YouTube IFrame API invokes window.onYouTubeIframeAPIReady exactly once
// when its script finishes loading. On repeat visits the script is cached and
// can finish BEFORE this file is parsed, so the callback would be assigned too
// late and no player would ever be created (this is why a host who reloads
// often saw black screens while everyone else saw video).
function markYtApiReady() {
    if (ytApiReady) return;
    ytApiReady = true;
    const queued = ytPlayerQueue.splice(0);
    queued.forEach(fn => { try { fn(); } catch (e) { } });
}
window.onYouTubeIframeAPIReady = markYtApiReady;
// If the API is already present, we missed the callback: treat it as ready now.
if (window.YT && typeof window.YT.Player === 'function') markYtApiReady();

// Accepts every common YouTube URL form; returns an 11-char id or null.
function ytParseVideoId(input) {
    if (!input) return null;
    if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
    let m = input.match(/(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    m = input.match(/^https?:\/\/www\.youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return null;
}

// Resolve a pasted URL to a screen source.
//   YouTube: { provider:'youtube', id:'<11-char id>' }
//   Twitch:  { provider:'twitch', id:'<channel or vod id>', twitchKind:'channel'|'video' }
function parseScreenSource(input) {
    if (!input) return null;
    const raw = String(input).trim();
    const yt = ytParseVideoId(raw);
    if (yt) return { provider: 'youtube', id: yt };
    const tw = twitchParseSource(raw);
    if (tw) return { provider: 'twitch', id: tw.id, twitchKind: tw.kind };
    return null;
}

// Twitch channel names that are really site routes, not streamers.
const TWITCH_RESERVED = new Set([
    'directory', 'videos', 'settings', 'subscriptions', 'inventory', 'wallet',
    'friends', 'drops', 'search', 'downloads', 'turbo', 'jobs', 'about',
    'privacy', 'policies', 'collections', 'following', 'store', 'prime',
    'creatorcamp', 'legal', 'contact', 'security', 'careers', 'press', 'blog',
    'partners', 'affiliates', 'developers', 'api', 'embed', 'login', 'signup',
    'p', 'video', 'channel'
]);

// Accepts twitch.tv/<channel>, twitch.tv/videos/<id>, player.twitch.tv URLs and
// a bare channel name. Returns { id, kind } or null.
function twitchParseSource(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;

    // Already a player URL: player.twitch.tv/?channel=<name> or ?video=<id>
    let m = raw.match(/[?&]video=(\d{1,20})\b/);
    if (m) return { id: m[1], kind: 'video' };
    m = raw.match(/[?&]channel=([A-Za-z0-9_]{1,25})\b/);
    if (m && !TWITCH_RESERVED.has(m[1].toLowerCase())) return { id: m[1], kind: 'channel' };

    // twitch.tv/videos/<numeric vod id>
    m = raw.match(/(?:^|\/\/)(?:www\.|m\.)?twitch\.tv\/videos\/(\d{1,20})/i);
    if (m) return { id: m[1], kind: 'video' };

    // twitch.tv/<channel>
    m = raw.match(/(?:^|\/\/)(?:www\.|m\.)?twitch\.tv\/([A-Za-z0-9_]{1,25})(?:[/?#]|$)/i);
    if (m && !TWITCH_RESERVED.has(m[1].toLowerCase())) return { id: m[1], kind: 'channel' };

    // Bare channel name
    if (/^[A-Za-z0-9_]{1,25}$/.test(raw) && !TWITCH_RESERVED.has(raw.toLowerCase())) {
        return { id: raw, kind: 'channel' };
    }
    return null;
}

// One-time renderer init, called from setupThreeJS() when the game world is
// built. No-op when the example renderer did not load (offline CDN etc).
window.initCssScene = function () {
    if (cssRenderer || typeof THREE === 'undefined' || typeof THREE.CSS3DRenderer === 'undefined') return;
    cssRenderer = new THREE.CSS3DRenderer();
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
    const el = cssRenderer.domElement;
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '0';
    // The whole CSS3D overlay must not eat game input.
    el.style.pointerEvents = 'none';
    el.style.zIndex = '2';
    const gc = document.getElementById('game-container');
    if (gc) gc.appendChild(el);
    cssScene = new THREE.Scene();
};

// Wire the video element + CSS3D object for a screen prop.
function attachYtVideo(data, group) {
    const provider = (data.provider === 'twitch' || data.twitchId) ? 'twitch'
        : ((data.videoId) ? 'youtube' : null);
    if (!provider) return;
    if (typeof THREE.CSS3DObject === 'undefined') {
        // The examples renderer did not load (CDN blocked). Without it there is
        // no way to show the video in-scene; the housing still spawns.
        console.warn('[screen] CSS3DRenderer missing — screen stays black');
        return;
    }

    // Make sure the CSS3D overlay exists BEFORE creating the element: the
    // YouTube API resolves its target inside the document, so a detached shell
    // means no player at all.
    if (!cssRenderer && window.initCssScene) window.initCssScene();

    const shell = document.createElement('div');
    shell.style.width = '640px';
    shell.style.height = '360px';
    shell.style.background = '#050505';
    shell.style.pointerEvents = 'none';
    shell.style.overflow = 'hidden';
    // The picture only exists on the panel's front side; tickYtScreens hides it
    // once the camera swings around behind the housing. (No backface-visibility
    // here: CSS3DRenderer's mirrored projection makes that ambiguous, and an
    // explicit dot-product test is predictable.)
    shell.style.transformStyle = 'preserve-3d';

    // Attach to the DOM first. The CSS3D object owns placement; this container
    // makes the node findable even if the 3D scene renders later.
    if (!ytOverlay) {
        ytOverlay = document.createElement('div');
        ytOverlay.style.position = 'fixed';
        ytOverlay.style.left = '0';
        ytOverlay.style.top = '0';
        ytOverlay.style.width = '0';
        ytOverlay.style.height = '0';
        ytOverlay.style.overflow = 'visible';
        ytOverlay.style.pointerEvents = 'none';
        ytOverlay.style.zIndex = '-1';
        document.body.appendChild(ytOverlay);
    }

    const cssObj = new THREE.CSS3DObject(shell);
    // 640px wide shell mapped to SCREEN_W (6.3) world units.
    cssObj.scale.set(0.009844, 0.009844, 1);
    if (cssScene) cssScene.add(cssObj);
    else ytOverlay.appendChild(shell); // fallback: at least keep it mountable

    const entry = {
        data: {
            provider: provider,
            videoId: data.videoId || null,
            twitchId: data.twitchId || null,
            twitchKind: data.twitchKind || 'channel',
            startedAt: data.startedAt || Date.now(),
            placer: data.placer || ''
        },
        player: null,
        iframe: null,
        twFrame: null,
        twVideoWrap: null,
        provider: provider,
        cssObj: cssObj,
        shell: shell,
        frameEl: null,
        mesh: group,
        placed: true,
        syncAt: null,
        syncRecvAt: null,
        retried: false
    };
    ytPlayers[data.id] = entry;
    mountScreenContent(entry);
}

// (Re)build the player inside an existing shell. Used on placement, on a
// video change, and whenever the provider differs (YouTube <-> Twitch).
function mountScreenContent(entry) {
    const shell = entry && entry.shell;
    if (!shell) return;

    // Tear down whatever was mounted before.
    try { if (entry.player && entry.player.destroy) entry.player.destroy(); } catch (e) { }
    entry.player = null;
    entry.iframe = null;
    entry.soundChip = null;
    entry.twitchPending = false;
    entry.twitchReady = false;
    if (entry.twFrame) { entry.twFrame.remove(); entry.twFrame = null; }
    entry.twVideoWrap = null;
    shell.innerHTML = '';
    // The shell is only the dark backing behind the picture now; the Twitch
    // iframe lives in its own screen-space layer so it can autoplay. Never let
    // the 3D panel eat clicks.
    shell.style.pointerEvents = 'none';
    shell.style.cursor = 'default';

    const twitch = entry.provider === 'twitch';

    const frameEl = document.createElement('div');
    frameEl.style.width = '100%';
    frameEl.style.height = '100%';
    frameEl.style.pointerEvents = twitch ? 'auto' : 'none';
    shell.appendChild(frameEl);
    entry.frameEl = frameEl;

    if (twitch) {
        // Screen-space layer, positioned every frame from the panel corners.
        // Mounting is deferred until the panel is actually on screen, so the
        // player never starts inside a zero-size or off-screen element (Twitch
        // latches its autoplay verdict at load time).
        const twFrame = document.createElement('div');
        twFrame.style.position = 'absolute';
        twFrame.style.left = '0';
        twFrame.style.top = '0';
        twFrame.style.width = '640px';
        twFrame.style.height = '360px';
        twFrame.style.overflow = 'hidden';
        twFrame.style.background = '#050505';
        twFrame.style.pointerEvents = 'none';
        twFrame.style.display = 'none';
        // Inner 640x360 layout, uniformly scaled to cover the projected box.
        const twVideoWrap = document.createElement('div');
        twVideoWrap.style.position = 'absolute';
        twVideoWrap.style.left = '0';
        twVideoWrap.style.top = '0';
        twVideoWrap.style.width = '640px';
        twVideoWrap.style.height = '360px';
        twVideoWrap.style.transformOrigin = '0 0';
        twFrame.appendChild(twVideoWrap);
        ensureTwitchLayer().appendChild(twFrame);
        entry.twFrame = twFrame;
        entry.twVideoWrap = twVideoWrap;
        entry.twitchPending = true;
        if (!entry.twitchUnmuted) addSoundChip(twFrame, entry);
        return;
    }

    // YouTube: never rely on the ready flag alone. If the API object exists we
    // can create immediately, even when the init callback fired before this
    // file was parsed (cached YouTube loader on repeat visits).
    if (ytApiReady || (window.YT && typeof window.YT.Player === 'function')) {
        markYtApiReady();
        createYtPlayer(entry);
    } else {
        ytPlayerQueue.push(() => createYtPlayer(entry));
    }
}

// Twitch requires every embed's `parent` to match the page's hostname.
function twitchParents() {
    const parents = [];
    try {
        const h = String(location.hostname || '').toLowerCase();
        if (h) {
            parents.push(h);
            if (h.indexOf('www.') === 0) parents.push(h.slice(4));
        }
    } catch (e) { }
    return parents;
}

function twitchEmbedUrl(entry) {
    const d = entry.data || {};
    const q = [];
    if (d.twitchKind === 'video' && d.twitchId) q.push('video=' + encodeURIComponent(d.twitchId));
    else q.push('channel=' + encodeURIComponent(d.twitchId || ''));
    // Muted autoplay is the only form of autoplay every browser allows inside a
    // cross-origin iframe, so the stream always starts on its own. Sound is an
    // explicit opt-in: the in-world SOUND chip reloads the embed with
    // muted=false in response to a real click in the top document.
    q.push('autoplay=true');
    q.push('muted=' + (entry.twitchUnmuted ? 'false' : 'true'));
    twitchParents().forEach(p => q.push('parent=' + encodeURIComponent(p)));
    return 'https://player.twitch.tv/?' + q.join('&');
}

// Is (clientX, clientY) on a visible Twitch screen? Used as a fallback path for
// starting sound: clicks over a cross-origin iframe never reach this document,
// but if anything ever swallows them we still catch the click here.
window.twitchScreenAt = function (clientX, clientY) {
    if (typeof camera === 'undefined' || !camera || typeof ytPlayers === 'undefined') return null;
    for (const id in ytPlayers) {
        const e = ytPlayers[id];
        if (!e || e.provider !== 'twitch' || !e.__shown || !e.mesh) continue;
        const ry = e.mesh.rotation.y + Math.PI;
        const cx = e.mesh.position.x + Math.sin(ry) * VIDEO_FORWARD;
        const cy = e.mesh.position.y + PANEL_Y;
        const cz = e.mesh.position.z + Math.cos(ry) * VIDEO_FORWARD;
        const rx = Math.cos(ry), rz = -Math.sin(ry);
        const hw = PANEL_W / 2, hh = PANEL_H / 2;
        // Ignore panels behind (or practically on) the camera: their projected
        // corners mirror across the screen and would match everything.
        if (new THREE.Vector3(cx, cy, cz).applyMatrix4(camera.matrixWorldInverse).z > -0.2) continue;
        const quad = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
            const v = new THREE.Vector3(
                cx + rx * sx * hw, cy + sy * hh, cz + rz * sx * hw
            ).project(camera);
            return [(v.x * 0.5 + 0.5) * window.innerWidth, (1 - (v.y * 0.5 + 0.5)) * window.innerHeight];
        });
        // Point in quad via consistent cross-product signs.
        let inside = true;
        for (let i = 0; i < 4; i++) {
            const a = quad[i], b = quad[(i + 1) % 4];
            const cross = (b[0] - a[0]) * (clientY - a[1]) - (b[1] - a[1]) * (clientX - a[0]);
            if (cross < 0) { inside = false; break; }
        }
        if (inside) return e;
    }
    return null;
};

// Layer for Twitch iframes: same z-index as the CSS3D overlay (2) but appended
// after it, so the video paints over the black shell while staying under the
// WebGL canvas (z-index 3). pointer-events stay off the layer itself; only the
// iframe's frame box accepts clicks.
function ensureTwitchLayer() {
    if (twitchLayer && twitchLayer.isConnected) return twitchLayer;
    twitchLayer = document.createElement('div');
    twitchLayer.id = 'twitch-layer';
    const s = twitchLayer.style;
    s.position = 'absolute';
    s.left = '0';
    s.top = '0';
    s.width = '100%';
    s.height = '100%';
    s.overflow = 'visible';
    s.pointerEvents = 'none';
    s.zIndex = '2';
    const gc = document.getElementById('game-container') || document.body;
    gc.appendChild(twitchLayer);
    return twitchLayer;
}

// Project the panel's four corners to screen space and fit the untransformed
// iframe into their bounding box. The punched hole is the exact perspective
// quad, so the video is cropped to the housing's screen opening: no warped DOM
// transform is needed, which is what keeps Twitch's autoplay check happy.
function positionTwitchFrame(e) {
    const frame = e && e.twFrame;
    if (!frame || !e.mesh || typeof camera === 'undefined' || !camera) return false;
    const ry = e.mesh.rotation.y + Math.PI;
    const cx = e.mesh.position.x + Math.sin(ry) * VIDEO_FORWARD;
    const cy = e.mesh.position.y + PANEL_Y;
    const cz = e.mesh.position.z + Math.cos(ry) * VIDEO_FORWARD;
    if (new THREE.Vector3(cx, cy, cz).applyMatrix4(camera.matrixWorldInverse).z > -0.2) return false;
    const rx = Math.cos(ry), rz = -Math.sin(ry);
    const hw = PANEL_W / 2, hh = PANEL_H / 2;
    const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
        const v = new THREE.Vector3(
            cx + rx * sx * hw, cy + sy * hh, cz + rz * sx * hw
        ).project(camera);
        return [(v.x * 0.5 + 0.5) * window.innerWidth, (1 - (v.y * 0.5 + 0.5)) * window.innerHeight];
    });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of corners) {
        if (c[0] < minX) minX = c[0];
        if (c[0] > maxX) maxX = c[0];
        if (c[1] < minY) minY = c[1];
        if (c[1] > maxY) maxY = c[1];
    }
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const s = frame.style;
    s.left = minX.toFixed(2) + 'px';
    s.top = minY.toFixed(2) + 'px';
    // The frame is the clipping/hit box: exactly the projected bounding box.
    s.width = w.toFixed(2) + 'px';
    s.height = h.toFixed(2) + 'px';
    // The player keeps a 640x360 layout (Twitch refuses autoplay below its
    // minimum size, and it measures the inner viewport), then a *uniform* 2D
    // scale covers the box and is centred. Measure the panel at its centre line
    // rather than using the bounding box: in perspective the bbox grows as the
    // near edge gets closer, which looked like the picture zooming in while the
    // screen turned. One scale for both axes also stops it squashing.
    if (e.twVideoWrap) {
        const proj = (px, py, pz) => {
            const v = new THREE.Vector3(px, py, pz).project(camera);
            return [(v.x * 0.5 + 0.5) * window.innerWidth, (1 - (v.y * 0.5 + 0.5)) * window.innerHeight];
        };
        const topMid = proj(cx, cy + hh, cz);
        const botMid = proj(cx, cy - hh, cz);
        const leftMid = proj(cx - rx * hw, cy, cz - rz * hw);
        const rightMid = proj(cx + rx * hw, cy, cz + rz * hw);
        const wC = Math.abs(rightMid[0] - leftMid[0]);
        const hC = Math.abs(topMid[1] - botMid[1]);
        const scale = Math.max(0.02, Math.max(wC / 640, hC / 360));
        const tx = (w - 640 * scale) / 2;
        const ty = (h - 360 * scale) / 2;
        e.twVideoWrap.style.transform =
            'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) scale(' + scale.toFixed(5) + ')';
    }
    e.twitchReady = true;
    return true;
}

function mountTwitch(entry) {
    if (!entry || !entry.twVideoWrap) return;
    const ifr = buildTwitchIframe(entry);
    entry.twVideoWrap.appendChild(ifr);
    entry.twFrame.style.display = 'block';
    entry.iframe = ifr;
}

// Shared iframe construction so the unmute reload keeps every attribute.
function buildTwitchIframe(entry) {
    const ifr = document.createElement('iframe');
    ifr.src = twitchEmbedUrl(entry);
    ifr.title = 'Twitch stream';
    ifr.style.width = '100%';
    ifr.style.height = '100%';
    ifr.style.border = '0';
    ifr.style.display = 'block';
    ifr.style.pointerEvents = 'auto';
    ifr.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    ifr.setAttribute('allowfullscreen', '');
    ifr.setAttribute('frameborder', '0');
    ifr.setAttribute('scrolling', 'no');
    return ifr;
}

// Reload the embed with sound. Triggered by a click on our own chip (a click in
// the top document), which is what browsers require before unmuted playback.
function unmuteTwitch(entry) {
    if (!entry || entry.twitchUnmuted) return;
    entry.twitchUnmuted = true;
    if (entry.soundChip) { entry.soundChip.remove(); entry.soundChip = null; }
    if (!entry.iframe) return;   // still pending: the mount will start unmuted
    entry.iframe.remove();
    const ifr = buildTwitchIframe(entry);
    entry.twVideoWrap.appendChild(ifr);
    entry.iframe = ifr;
}

// Mount a deferred Twitch player once its frame is really on screen.
function mountPendingTwitch(entry) {
    if (!entry || !entry.twitchPending) return;
    if (!entry.twitchReady || !entry.__shown) return;
    entry.twitchPending = false;
    if (!entry.iframe) mountTwitch(entry);
}

// Small "sound" chip in the top-left corner of a Twitch screen. Beats relying
// on the player's own controls: this is our DOM, in the top document, so the
// click always reaches it and counts as a real user gesture.
function addSoundChip(shell, entry) {
    const chip = document.createElement('div');
    chip.textContent = '\u{1F50A} SOUND';
    chip.style.position = 'absolute';
    chip.style.left = '50%';
    chip.style.top = '10px';
    chip.style.transform = 'translateX(-50%)';
    chip.style.padding = '4px 10px';
    chip.style.background = 'rgba(10, 10, 14, 0.72)';
    chip.style.border = '1px solid rgba(255,255,255,0.35)';
    chip.style.borderRadius = '999px';
    chip.style.color = '#fff';
    chip.style.font = '700 14px/1.2 monospace';
    chip.style.letterSpacing = '0.06em';
    chip.style.cursor = 'pointer';
    chip.style.pointerEvents = 'auto';
    chip.style.zIndex = '11';
    chip.onclick = (ev) => {
        ev.stopPropagation();
        unmuteTwitch(entry);
    };
    shell.appendChild(chip);
    entry.soundChip = chip;
}

// Mount the actual YouTube player. Passed the DOM ELEMENT (not an id) so it
// works even when the CSS3D overlay restructures the tree.
function createYtPlayer(entry) {
    if (!entry || !entry.frameEl || !entry.frameEl.isConnected) {
        // Not in the document yet: retry shortly instead of silently failing.
        setTimeout(() => { if (ytPlayers[Object.keys(ytPlayers).find(k => ytPlayers[k] === entry)]) createYtPlayer(entry); }, 250);
        return;
    }
    try {
        const startSec = Math.max(0, Math.floor((Date.now() - entry.data.startedAt) / 1000));
        entry.player = new YT.Player(entry.frameEl, {
            videoId: entry.data.videoId,
            width: '640',
            height: '360',
            playerVars: {
                autoplay: 1,
                // Browsers block UNMUTED autoplay in cross-origin iframes, which
                // leaves the player stuck on its thumbnail (reads as "not
                // playing"). Start muted — always allowed — and let the
                // proximity loop unmute once someone is close enough.
                mute: 1,
                controls: 0,
                disablekb: 1,
                modestbranding: 1,
                rel: 0,
                playsinline: 1,
                fs: 0,
                iv_load_policy: 3
                // NOTE: no `start` here. On a live stream it makes YouTube jump
                // into the DVR window (i.e. "from the beginning") instead of the
                // live edge; the seek is applied in onReady for VODs only.
            },
            events: {
                onReady: (e) => {
                    try {
                        e.target.mute();
                        // Live streams report duration 0; never seek those.
                        // VODs seek to the shared wall-clock anchor so every
                        // viewer is in step.
                        let dur = 0;
                        try { dur = e.target.getDuration(); } catch (err) { }
                        if (dur && isFinite(dur) && dur > 0) {
                            entry.isLive = false;
                            if (startSec > 1) e.target.seekTo(startSec, true);
                        } else {
                            entry.isLive = true;
                            entry.syncAt = null;   // anchor sync is meaningless live
                            entry.syncRecvAt = null;
                        }
                        e.target.playVideo();
                    } catch (err) { }
                },
                onError: () => {
                    // 101/150: the owner disabled embedding. Black screen is fine.
                    console.warn('[yt] embed rejected for', entry.data.videoId);
                }
            }
        });
        // Watchdog: some browsers mount but never start. If the state is still
        // unstarted/paused after 2.5s, nudge playback once. Also re-check the
        // live flag here: metadata can be missing at onReady, and treating a
        // VOD as live only means "no seek", which is harmless.
        setTimeout(() => {
            try {
                if (!entry.player || !entry.player.getPlayerState) return;
                const st = entry.player.getPlayerState();
                if (st === -1 || st === 2 || st === 5) entry.player.playVideo();
                if (entry.isLive === undefined) {
                    let d = 0;
                    try { d = entry.player.getDuration(); } catch (err) { }
                    entry.isLive = !(d && isFinite(d) && d > 0);
                }
            } catch (err) { }
        }, 2500);
    } catch (err) { /* leave black panel */ }
}

// Heartbeat the placer runs for each screen it placed. Broadcasts either
// directly (host) or up to the host, which relays (see handleDataFromClient).
function startYtSyncLoop(propData) {
    if (ytSyncLoops[propData.id]) return;
    ytSyncLoops[propData.id] = setInterval(() => {
        if (typeof isHost === 'undefined' && typeof player === 'undefined') return;
        const e = ytPlayers[propData.id];
        let at = (Date.now() - propData.startedAt) / 1000;
        if (e && e.player && e.player.getCurrentTime) {
            try { at = e.player.getCurrentTime(); } catch (err) { }
        }
        // Live streams share the live edge implicitly; heartbeats would only
        // broadcast DVR-window times that receivers must ignore anyway.
        if (e && e.isLive) return;
        const msg = {
            type: 'ytSync',
            propId: propData.id,
            at: Math.round((at || 0) * 10) / 10,
            ts: Date.now(),
            placer: String(myDeviceID || '')
        };
        if (typeof isHost !== 'undefined' && isHost) {
            broadcastToClients(msg);
        } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
            hostConn.send(msg);
        }
    }, 2000);
}

// Receiver side: apply a placer's heartbeat. Clock-skew immune because the
// target time is anchored to when THIS client received the packet.
function applyYtSync(data) {
    if (!data || data.type !== 'ytSync') return;
    // Ignore our own heartbeats.
    if (String(data.placer) === String(myDeviceID || '')) return;
    const e = ytPlayers[data.propId];
    if (!e) return;
    e.syncAt = (Number(data.at) || 0);
    e.syncRecvAt = Date.now();
    if (e.player && e.player.getPlayerState) {
        try {
            // If the placer pressed pause/play, follow the state change too.
            if (e.player.getPlayerState() === 2) e.player.playVideo();
        } catch (err) { }
    }
}

// Per-frame tick, called from animate(). Position the DOM overlay on the
// screen mesh, resync drifted players (>=1.2s), and lace audio volume to
// proximity (same falloff as proximity voice).
window.tickYtScreens = function () {
    for (const id in ytPlayers) {
        const e = ytPlayers[id];
        if (!e.mesh) continue;
        if (e.cssObj) {
            // Panel sits relative to the housing mesh's world transform. The
            // video is nudged toward its readable side by VIDEO_FORWARD so it
            // sits just in front of the housing's face; punchScreens() stamps
            // the same plane out of the canvas alpha, and both must match.
            const ry = e.mesh.rotation.y + Math.PI;
            e.cssObj.position.set(
                e.mesh.position.x + Math.sin(ry) * VIDEO_FORWARD,
                e.mesh.position.y + PANEL_Y,
                e.mesh.position.z + Math.cos(ry) * VIDEO_FORWARD
            );
            e.cssObj.rotation.y = ry;
        }
        // One-sided panel: the picture only exists on the placer's side.
        if (e.provider === 'twitch') {
            const onScreen = positionTwitchFrame(e);
            updateScreenFacing(e);
            if (e.twFrame) {
                // Never fade this layer: Chrome reports opacity:0 elements as
                // not visible (IntersectionObserver v2), and Twitch latches its
                // autoplay decision from that. When the camera is behind the
                // panel the WebGL canvas simply isn't punched, so the housing
                // covers the video anyway.
                e.twFrame.style.opacity = '1';
                const clickable = onScreen && !!e.__shown;
                e.twFrame.style.pointerEvents = clickable ? 'auto' : 'none';
            }
            if (onScreen && e.__shown) mountPendingTwitch(e);
            continue;   // no JS API: Twitch owns its audio
        }
        updateScreenFacing(e);
        try { window.updateYtAudio(e); } catch (err) { }
        try { window.tickYtSync(e, id); } catch (err) { }
    }
};

// Panel + video geometry, shared by the housing, the CSS3D overlay and the
// canvas-alpha punch below.
const PANEL_Y = 3.55, PANEL_W = 6.3, PANEL_H = 3.545;
// How far in front of the housing face the video plane sits. punchScreens()
// erases canvas pixels *behind* this plane, so the housing's own front face
// (which is 0.12 to 0.18 behind it) is punched out and the video shows there.
const VIDEO_FORWARD = 0.22;

// Show the video only from the front. tickYtScreens spins the CSS3D element by
// PI relative to the housing, so the picture's readable side is
// -(sin(rot), cos(rot)) world - which is also the side the placer stands on
// (the third-person camera sits behind the player). A small dead zone at the
// edge stops the picture flickering while someone walks around the side.
// Hiding also drops pointer events so the invisible panel cannot eat clicks.
function updateScreenFacing(e) {
    if (!e || !e.shell || !e.mesh) return;
    if (typeof camera === 'undefined' || !camera || !camera.position) return;
    const rot = e.mesh.rotation.y || 0;
    const dx = camera.position.x - e.mesh.position.x;
    const dz = camera.position.z - e.mesh.position.z;
    const dot = -(dx * Math.sin(rot) + dz * Math.cos(rot));
    if (e.__facing === undefined) e.__facing = dot >= 0;
    if (e.__facing && dot < -0.25) e.__facing = false;
    else if (!e.__facing && dot > 0.25) e.__facing = true;
    const show = e.__facing;
    if (e.__shown === show) return;
    e.__shown = show;
    // Use opacity, not visibility: hiding with visibility makes the browser
    // report the frame as hidden, which is exactly what Twitch's autoplay gate
    // looks for. The screen-space iframe layer is toggled the same way.
    e.shell.style.visibility = 'visible';
    e.shell.style.opacity = show ? '1' : '0';
    e.shell.style.pointerEvents = 'none';
}

// ---------------------------------------------------------------------------
// SCREEN DEPTH PUNCH
// ---------------------------------------------------------------------------
// The WebGL canvas is composited ABOVE the video DOM layer. After the world is
// drawn, each visible screen re-stamps its video rectangle into the alpha
// buffer: the depth test passes only where the scene's depth is FARTHER than
// the video plane, and those pixels are blended to zero alpha, so the browser
// shows the video underneath. Any geometry nearer than the plane (terrain,
// props, other players, sprites, particles) keeps its opaque pixels and
// therefore draws in front of the video - real occlusion, no per-object clones.
let punchScene = null;
let punchMesh = null;

function ensurePunchRig() {
    if (punchScene) return;
    punchScene = new THREE.Scene();
    const mat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.LessDepth,   // pass where the video plane is NEARER
        fog: false
    });
    // Erase (multiply the destination by zero) instead of drawing colour.
    mat.blending = THREE.CustomBlending;
    mat.blendSrc = THREE.ZeroFactor;
    mat.blendDst = THREE.ZeroFactor;
    mat.blendEquation = THREE.AddEquation;
    punchMesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), mat);
    punchMesh.frustumCulled = false;
    punchScene.add(punchMesh);
}

// Called from animate() right after renderer.render(scene, camera).
window.punchScreens = function () {
    if (typeof renderer === 'undefined' || !renderer || !camera) return;
    let anyVisible = false;
    for (const id in ytPlayers) {
        if (ytPlayers[id] && ytPlayers[id].__shown) { anyVisible = true; break; }
    }
    if (!anyVisible) return;
    ensurePunchRig();

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;      // keep the colour + depth buffers
    try {
        for (const id in ytPlayers) {
            const e = ytPlayers[id];
            if (!e || !e.mesh || !e.__shown) continue;
            const ry = e.mesh.rotation.y + Math.PI;
            punchMesh.position.set(
                e.mesh.position.x + Math.sin(ry) * VIDEO_FORWARD,
                e.mesh.position.y + PANEL_Y,
                e.mesh.position.z + Math.cos(ry) * VIDEO_FORWARD
            );
            punchMesh.rotation.y = ry;
            punchMesh.updateMatrixWorld(true);
            renderer.render(punchScene, camera);
        }
    } finally {
        renderer.autoClear = prevAutoClear;
    }
};

// Browsers refuse to unmute cross-origin media before any user interaction.
// The game gets pointer/key events constantly, so re-apply unmute on each of
// them; volume (set per frame from distance) still controls audibility.
['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
    document.addEventListener(ev, () => {
        for (const id in ytPlayers) {
            const entry = ytPlayers[id];
            const p = entry && entry.player;
            try {
                if (!p) continue;
                if (p.isMuted && p.isMuted()) {
                    p.unMute();
                    p.playVideo && p.playVideo();
                }
            } catch (err) { }
        }
    }, true);
});

window.updateYtAudio = function (e) {
    if (!e.player) return;
    let dist = 999;
    if (typeof camera !== 'undefined' && camera && typeof camera.position !== 'undefined') {
        dist = camera.position.distanceTo(e.mesh.position);
    } else if (typeof player !== 'undefined' && player) {
        dist = player.position.distanceTo(e.mesh.position);
    }
    const vol = Math.pow(Math.max(0, 1 - dist / MAX_VOICE_DISTANCE), 1.5);
    // Personal ceilings. YouTube audio lives in its own iframe and therefore
    // bypasses the game's WebAudio master gain, so both the Master slider and
    // the "Video Screens" slider are applied here by hand.
    const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
    const master = (typeof saveState !== 'undefined') ? num(saveState.masterVolume, 1) : 1;
    const screen = (typeof saveState !== 'undefined') ? num(saveState.screenVolume, 1) : 1;
    const volInt = Math.round(vol * Math.max(0, Math.min(1, master * screen)) * 100);
    const p = e.player;

    // YouTube
    if (!p.setVolume) return;
    try {
        if (volInt > 1) {
            if (p.isMuted && p.isMuted()) p.unMute();
            p.setVolume(volInt);
        } else if (!p.isMuted || p.isMuted() === false) {
            p.mute();
        }
    } catch (err) { }
};

// Resync a drifted player (>= 1.2s off the anchor). Live streams are exempt:
// their timeline is the DVR window, so any seek would jump into the past.
window.tickYtSync = function (e, id) {
    if (!e.player || typeof camera === 'undefined') return;

    if (e.isLive) {
        try {
            if (e.player.getPlayerState && e.player.getPlayerState() !== 1) e.player.playVideo();
        } catch (err) { }
        return;
    }

    if (!e.player.getCurrentTime) return;
    let target;
    if (e.syncAt !== null && e.syncRecvAt) {
        target = e.syncAt + (Date.now() - e.syncRecvAt) / 1000;
    } else {
        target = Math.max(0, (Date.now() - e.data.startedAt) / 1000);
    }
    if (!isFinite(target)) target = 0;
    let cur;
    try { cur = e.player.getCurrentTime(); } catch (err) { return; }
    if (isFinite(cur) && Math.abs(target - cur) > 1.2) {
        try { e.player.seekTo(Math.max(0, target), true); } catch (err) { }
    }
};

// ===========================================================================
// SCREEN: CHANGE VIDEO
// ---------------------------------------------------------------------------
// The placer (or the host) can swap the video on an existing screen. Everyone
// re-mounts in the same shell with a fresh shared anchor, so sync restarts
// cleanly. Late joiners are covered because the prop record (and myProps /
// activeProps on the host) is updated with the new videoId + startedAt.
// ===========================================================================
window.changeScreenVideo = function (propId) {
    const mesh = props[propId];
    const pd = mesh && mesh.userData && mesh.userData.propData;
    if (!pd || pd.type !== 'screen') return;

    const me = String(typeof myDeviceID !== 'undefined' && myDeviceID ? myDeviceID : '');
    const isPlacer = String(pd.placer || '') === me;
    const hostAllowed = (typeof isHost !== 'undefined' && isHost);
    if (!isPlacer && !hostAllowed) {
        showToast('Only the player who placed this screen can change it.', 'error');
        return;
    }

    const url = window.prompt('Paste a new YouTube or Twitch URL for this screen:', '');
    if (!url) return;
    const src = parseScreenSource(String(url).trim());
    if (!src) { showToast('That does not look like a YouTube or Twitch URL.', 'error'); return; }

    const msg = {
        type: 'ytChange',
        propId: propId,
        provider: src.provider,
        videoId: src.provider === 'youtube' ? src.id : null,
        twitchId: src.provider === 'twitch' ? src.id : null,
        twitchKind: src.provider === 'twitch' ? src.twitchKind : null,
        startedAt: Date.now(),
        placer: me
    };

    // Update our own record first, then tell the room.
    pd.provider = src.provider;
    if (src.provider === 'youtube') {
        pd.videoId = src.id;
        pd.twitchId = null; pd.twitchKind = null;
    } else {
        pd.twitchId = src.id;
        pd.twitchKind = src.twitchKind;
        pd.videoId = null;
    }
    pd.startedAt = msg.startedAt;
    window.applyYtChange(msg);

    if (typeof isHost !== 'undefined' && isHost) {
        if (myProps.some(p => p.id === propId)) {
            const rec = myProps.find(p => p.id === propId);
            rec.provider = src.provider;
            if (src.provider === 'youtube') {
                rec.videoId = src.id;
                rec.twitchId = null; rec.twitchKind = null;
            } else {
                rec.twitchId = src.id;
                rec.twitchKind = src.twitchKind;
                rec.videoId = null;
            }
            rec.startedAt = msg.startedAt;
        }
        broadcastToClients(msg);
    } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
        hostConn.send(msg);
    }
};

// Receiver side: swap the video in place (shell + CSS3D object are reused).
window.applyYtChange = function (data) {
    if (!data || data.type !== 'ytChange' || !data.propId) return;
    const id = data.propId;
    const e = ytPlayers[id];
    if (!e) return; // no screen with this id here

    const provider = (data.provider === 'twitch' || data.twitchId) ? 'twitch'
        : ((data.videoId) ? 'youtube' : null);
    if (!provider) return;

    e.provider = provider;
    e.data = {
        provider: provider,
        videoId: data.videoId || null,
        twitchId: data.twitchId || null,
        twitchKind: data.twitchKind || 'channel',
        startedAt: data.startedAt || Date.now(),
        placer: data.placer || (e.data && e.data.placer) || ''
    };
    e.syncAt = null;
    e.syncRecvAt = null;
    e.isLive = undefined;   // re-detect for the new video
    // Rebuilds the shell contents for whichever provider is now active.
    mountScreenContent(e);
};

// --- HOOK NETWORKING ---
// Prop sync over P2P is handled in ui.js (handleDataFromClient / handleDataFromHost),
// which processes propPlaced / propRemoved / allProps. Nothing to hook here.

