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
        { id: 'campfire', icon: '🔥', name: 'Campfire' },
        { id: 'tent', icon: '⛺', name: 'Tent' },
        { id: 'blanket', icon: '🟥', name: 'Picnic Mat' },
        { id: 'chair', icon: '🪑', name: 'Chair' },
        { id: 'table', icon: '🪵', name: 'Picnic Table' },
        { id: 'cooler', icon: '🧊', name: 'Cooler' },
        { id: 'basket', icon: '🧺', name: 'Basket' },
        { id: 'radio', icon: '📻', name: 'Radio' },
        { id: 'lantern', icon: '🏮', name: 'Lantern' },
        // NEW PROPS
        { id: 'umbrella', icon: '☂️', name: 'Beach Umbrella' },
        { id: 'grill', icon: '🍖', name: 'BBQ Grill' },
        { id: 'hammock', icon: '🛏️', name: 'Hammock' },
        { id: 'logbench', icon: '🪵', name: 'Log Bench' },
        { id: 'fishsign', icon: '🪧', name: 'Fishing Sign' },
        { id: 'crate', icon: '📦', name: 'Dock Crate' },
        { id: 'buoy', icon: '🔴', name: 'Buoy' },
        { id: 'anchor', icon: '⚓', name: 'Anchor' },
        { id: 'flowerpot', icon: '🌷', name: 'Flower Pot' },
        { id: 'torch', icon: '🔦', name: 'Tiki Torch' },
        { id: 'boat', icon: '🚣', name: 'Rowboat' },
        { id: 'tireswing', icon: '🛞', name: 'Tire Swing' },
        { id: 'hotspring', icon: '♨️', name: 'Hot Spring' },
        { id: 'windchime', icon: '🎐', name: 'Wind Chime' },
        { id: 'surfboard', icon: '🏄', name: 'Surfboard' }
    ];

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'grid-entry';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'center';
        div.style.background = 'rgba(255,255,255,0.1)';
        div.style.padding = '15px';
        div.style.borderRadius = '8px';
        div.style.cursor = 'pointer';
        div.style.minWidth = '80px';
        div.style.transition = 'all 0.15s ease';

        div.innerHTML = `<div style="font-size:32px">${item.icon}</div><div style="margin-top:8px; font-weight:bold; font-size:12px;">${item.name}</div>`;

        div.onmouseenter = () => {
            div.style.background = 'rgba(255,255,255,0.2)';
            div.style.transform = 'scale(1.05)';
        };
        div.onmouseleave = () => {
            div.style.background = 'rgba(255,255,255,0.1)';
            div.style.transform = 'scale(1)';
        };

        div.onclick = () => {
            placeProp(item.id);
            togglePropsUI(); // Close menu after placing
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
    lastPropTime = Date.now();

    const x = parseFloat(player.position.x.toFixed(2));
    const z = parseFloat(player.position.z.toFixed(2));
    const rot = parseFloat(player.rotation.y.toFixed(3)); // Add rotation

    // FIX 1: Added "&& dedicatedSocket" to prevent crash when it is null (P2P mode)
    if (typeof dedicatedSocket !== 'undefined' && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({
            type: 'placeProp',
            propType: type,
            x,
            z,
            rot // Send rotation to server
        }));
    } else {
        const propData = {
            id: Date.now() + "_" + Math.random().toString().substr(2, 5),
            type,
            x,
            z,
            rot, // Include rotation in prop data
            timestamp: Date.now()
        };

        if (isHost) {
            spawnPropMesh(propData);
            myProps.push(propData);
            // FIX 2: Changed 'placeProp' to 'propPlaced' so clients actually receive it
            broadcastToClients({ type: 'propPlaced', prop: propData });
        } else if (hostConn && hostConn.open) {
            hostConn.send({
                type: 'placeProp',
                propType: type,
                x,
                z,
                rot // Send rotation to host
            });
        }
    }
}


function undoProp() {
    // FIX: Added "&& dedicatedSocket" check here as well
    if (typeof dedicatedSocket !== 'undefined' && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({ type: 'undoProp' }));
    } else {
        // P2P Logic
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
        canopy.position.y = 2.3;
        canopy.rotation.x = Math.PI;
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

    mesh = g;
    mesh.position.set(data.x, 0, data.z);

    // Use rotation from network data if provided, otherwise use local player rotation
    if (typeof data.rot === 'number') {
        mesh.rotation.y = data.rot;
    } else {
        mesh.rotation.y = player.rotation.y;
    }

    scene.add(mesh);
    props[data.id] = mesh;

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
}

// --- HOOK NETWORKING ---
// Safely attempt to hook into the dedicated socket message handler
const _propHookInterval = setInterval(() => {
    if (typeof dedicatedSocket !== 'undefined' && dedicatedSocket) {
        clearInterval(_propHookInterval);
        console.log("[PROP SYSTEM] Hooking into Dedicated Socket...");

        const originalOnMessage = dedicatedSocket.onmessage;
        dedicatedSocket.onmessage = (event) => {
            if (originalOnMessage) originalOnMessage(event);

            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'propPlaced') {
                    spawnPropMesh(msg.prop);
                } else if (msg.type === 'propRemoved') {
                    removePropFromWorld(msg.id);
                } else if (msg.type === 'allProps') {
                    // Initial sync
                    msg.props.forEach(p => spawnPropMesh(p));
                } else if (msg.type === 'welcome' && msg.activeProps) {
                    msg.activeProps.forEach(p => spawnPropMesh(p));
                }
            } catch (e) { }
        };
    }
}, 1000);

