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
        { id: 'lantern', icon: '🏮', name: 'Lantern' }
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

    // FIX 1: Added "&& dedicatedSocket" to prevent crash when it is null (P2P mode)
    if (typeof dedicatedSocket !== 'undefined' && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({
            type: 'placeProp',
            propType: type,
            x,
            z
        }));
    } else {
        const propData = {
            id: Date.now() + "_" + Math.random().toString().substr(2, 5),
            type,
            x,
            z,
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
                z
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

    mesh = g;
    mesh.position.set(data.x, 0, data.z);

    // All props face the same direction as the player when placed
    mesh.rotation.y = player.rotation.y;

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

