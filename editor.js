// --- LEVEL EDITOR ---
// Standalone 3D level editor for HTML Fishing. Base world is ocean; you paint
// land, then dress it with trees, rocks and NPCs. Levels are saved as JSON in
// the exact shape the game's worldgen.js understands.
(function () {
    "use strict";

    const STORAGE_KEY = "htmlfishing.level";
    const $ = (id) => document.getElementById(id);

    // ------------------------------------------------------------- Three setup
    const viewport = $("ed-viewport");
    let renderer, scene, camera, sun;

    const world = {
        group: null, terrain: null, water: null, floor: null,
        grid: null, propGroup: null, npcGroup: null, ring: null, zones: null
    };

    const state = {
        level: null,
        tool: "land",
        npcType: "merchant",
        zoneId: 1,
        radius: 6,
        strength: 1,
        brushHeight: 2,
        camSpeed: 26,
        camSens: 5,
        yaw: 0.6, pitch: -0.42,
        keys: {},
        looking: false,
        rightArmed: false,
        panning: false,
        painting: false,
        shift: false,
        refHeight: 2,
        pick: null,
        lastPropPos: null,
        undo: [],
        redo: [],
        dirty: true
    };

    const TOOLS = [
        { id: "land", name: "Land", icon: "pickaxe", key: "1", tip: "Paint land — raises terrain to the brush height. Soft-edged." },
        { id: "water", name: "Water", icon: "droplet", key: "2", tip: "Paint ocean — pushes terrain below sea level." },
        { id: "raise", name: "Raise", icon: "chartUp", key: "3", tip: "Raise the terrain under the brush." },
        { id: "lower", name: "Lower", icon: "hammer", key: "4", tip: "Lower the terrain under the brush." },
        { id: "level", name: "Flatten", icon: "table", key: "5", tip: "Flatten terrain to the height where the stroke began." },
        { id: "zone", name: "Fishing Zones", icon: "fish", key: "0", tip: "Tag water with a fishing zone (lake, river, ponds, cave) so the right fish show up. Right-click clears back to ocean." },
        { id: "tree", name: "Trees", icon: "tree", key: "6", tip: "Place trees on land. Right-click removes the nearest." },
        { id: "rock", name: "Rocks", icon: "rock", key: "7", tip: "Place rocks on land. Right-click removes the nearest." },
        { id: "npc", name: "NPCs", icon: "users", key: "8", tip: "Place the selected NPC on land. Right-click removes it." },
        { id: "erase", name: "Erase", icon: "trash", key: "9", tip: "Remove the prop or NPC under the cursor." },
        { id: "spawn", name: "Spawn", icon: "tent", key: "P", tip: "Set where players start (one per level). Click on land to move it; right-click clears it so the game picks the middle of the map." }
    ];

    const TERRAIN_TOOLS = { land: 1, water: 1, raise: 1, lower: 1, level: 1 };
    const isBrushTool = (t) => !!TERRAIN_TOOLS[t] || t === "zone";

    // ------------------------------------------------------------------ helpers
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const toastEl = $("toast");
    let toastTimer = null;
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add("on");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("on"), 1600);
    }

    function disposeMesh(obj) {
        obj.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach((m) => { if (m.map && m.map.__shared !== true) m.map.dispose(); m.dispose(); });
            }
        });
    }

    function clearGroup(group) {
        if (!group) return;
        for (let i = group.children.length - 1; i >= 0; i--) {
            const c = group.children[i];
            group.remove(c);
            disposeMesh(c);
        }
    }

    // --------------------------------------------------------------- level load
    function loadLevel(level, silent) {
        state.level = Level.normalize(level);
        state.undo = []; state.redo = [];
        $("level-name").value = state.level.name;
        syncSettingsInputs();
        buildWorld();
        if (!silent) toast("Level loaded");
    }

    function currentJSON() {
        state.level.name = ($("level-name").value || "Untitled Level").slice(0, 60);
        return Level.serialize(state.level);
    }

    // ------------------------------------------------------------- world build
    function buildWorld() {
        if (world.group) { scene.remove(world.group); disposeMesh(world.group); }

        const lv = state.level;
        const group = new THREE.Group();
        group.name = "editorLevel";

        world.floor = WorldGen.buildOceanFloorMesh(lv);
        group.add(world.floor);
        group.add(WorldGen.buildTerrainMesh(lv));
        world.water = WorldGen.buildWaterMesh(lv);
        group.add(world.water);

        world.zones = WorldGen.buildZoneOverlay(lv);
        world.zones.visible = $("chk-zones").checked;
        group.add(world.zones);

        world.grid = new THREE.GridHelper(lv.size, Math.min(lv.grid, 128), 0x9aa3c0, 0x3b4057);
        world.grid.position.y = lv.seaLevel + 0.05;
        world.grid.material.opacity = 0.35;
        world.grid.material.transparent = true;
        world.grid.visible = $("chk-grid").checked;
        group.add(world.grid);

        world.propGroup = new THREE.Group();
        world.npcGroup = new THREE.Group();
        group.add(world.propGroup);
        group.add(world.npcGroup);

        // The editor reaches into the group to find the terrain mesh again.
        world.terrain = group.children.find((c) => c.userData.isTerrain) || null;
        world.terrain.receiveShadow = true;

        scene.add(group);
        world.group = group;

        buildAllProps();
        updateLighting();
        markDirty();
    }

    function updateLighting() {
        const reach = state.level.size * 1.2;
        if (sun) {
            sun.position.set(reach * 0.6, reach, reach * 0.5);
            sun.shadow.camera.left = -reach;
            sun.shadow.camera.right = reach;
            sun.shadow.camera.top = reach;
            sun.shadow.camera.bottom = -reach;
            sun.shadow.camera.far = reach * 3;
            sun.shadow.camera.updateProjectionMatrix();
        }
    }

    function rebuildProps() {
        clearGroup(world.propGroup);
        clearGroup(world.npcGroup);
        buildAllProps();
    }

    // Flag marker showing where players will spawn in the game.
    function makeSpawnMarker() {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6),
            new THREE.MeshLambertMaterial({ color: 0xe8ecf7 })
        );
        pole.position.y = 1.3;
        g.add(pole);
        const flag = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.7, 0.06),
            new THREE.MeshLambertMaterial({ color: 0xf2c14e })
        );
        flag.position.set(0.62, 2.2, 0);
        g.add(flag);
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.45, 0.5, 0.12, 12),
            new THREE.MeshLambertMaterial({ color: 0x6fb54a })
        );
        base.position.y = 0.06;
        g.add(base);
        return g;
    }

    function buildAllProps() {
        const lv = state.level;
        lv.trees.forEach((data) => {
            const t = WorldGen.makeTree(data);
            t.position.set(data.x, Level.sampleHeight(lv, data.x, data.z), data.z);
            t.userData.ref = data;
            t.userData.propKind = "tree";
            world.propGroup.add(t);
        });
        lv.rocks.forEach((data) => {
            const s = data.scale || 1;
            const r = WorldGen.makeRock(data);
            r.position.set(data.x, Level.sampleHeight(lv, data.x, data.z) + s * 0.3, data.z);
            r.userData.ref = data;
            r.userData.propKind = "rock";
            world.propGroup.add(r);
        });
        lv.npcs.forEach((data) => {
            const n = WorldGen.makeNpcPreview(data.type);
            n.position.set(data.x, Level.sampleHeight(lv, data.x, data.z), data.z);
            n.rotation.y = data.rot || 0;
            n.userData.ref = data;
            n.userData.propKind = "npc";
            world.npcGroup.add(n);
        });
        if (lv.spawn) {
            const m = makeSpawnMarker();
            m.position.set(lv.spawn.x, Level.sampleHeight(lv, lv.spawn.x, lv.spawn.z), lv.spawn.z);
            m.userData.ref = lv.spawn;
            m.userData.propKind = "spawn";
            world.propGroup.add(m);
        }
    }

    // Fast path: only the terrain surface changed.
    function refreshTerrain() {
        const geo = world.terrain.geometry;
        const pos = geo.attributes.position;
        const col = geo.attributes.color;
        const rgb = [0, 0, 0];
        const lv = state.level;
        for (let i = 0; i < pos.count; i++) {
            const h = Level.sampleHeight(lv, pos.getX(i), pos.getZ(i));
            pos.setY(i, h);
            WorldGen.terrainVertexColor(lv, h, rgb);
            col.setXYZ(i, rgb[0], rgb[1], rgb[2]);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
        geo.computeBoundingSphere();
        geo.computeVertexNormals();
        // Props sit on the surface, so they need to follow.
        repositionProps();
    }

    function repositionProps() {
        const lv = state.level;
        world.propGroup.children.forEach((m) => {
            const d = m.userData.ref;
            if (!d) return;
            const s = d.scale || 1;
            const y = Level.sampleHeight(lv, d.x, d.z) + (m.userData.propKind === "rock" ? s * 0.3 : 0);
            m.position.y = y;
        });
        world.npcGroup.children.forEach((m) => {
            const d = m.userData.ref;
            if (d) m.position.y = Level.sampleHeight(lv, d.x, d.z);
        });
    }

    // Rebuild the coloured zone patches (cheap: only tagged cells are drawn).
    function refreshZoneOverlay() {
        if (!world.zones) return;
        const parent = world.zones.parent;
        parent.remove(world.zones);
        disposeMesh(world.zones);
        world.zones = WorldGen.buildZoneOverlay(state.level);
        world.zones.visible = $("chk-zones").checked;
        parent.add(world.zones);
    }

    // Paint the selected fishing zone over every cell within the brush.
    function applyZoneBrush(point, clear) {
        const lv = state.level;
        const cell = Level.cellSize(lv);
        const r = state.radius;
        const c = Level.worldToCell(lv, point.x, point.z);
        const rad = Math.ceil(r / cell) + 1;
        const id = clear ? 0 : state.zoneId;
        let touched = false;
        for (let gz = c.gz - rad; gz <= c.gz + rad; gz++) {
            for (let gx = c.gx - rad; gx <= c.gx + rad; gx++) {
                if (gx < 0 || gz < 0 || gx >= lv.grid || gz >= lv.grid) continue;
                const cc = Level.cellCenter(lv, gx, gz);
                const d = Math.hypot(cc.x - point.x, cc.z - point.z);
                if (d > r) continue;
                const idx = gz * lv.grid + gx;
                if (lv.zones[idx] !== id) { lv.zones[idx] = id; touched = true; }
            }
        }
        if (touched) { zonesDirty = true; statsDirty = true; }
        return touched;
    }

    // ----------------------------------------------------------------- painting
    // Brush falloff: full strength across the middle of the brush, then a soft
    // edge over the outer 25% so painted land has a natural beach slope instead
    // of only rising above the water in the very centre.
    const EDGE = 0.25;
    function falloffAt(d, r) { return clamp((1 - d / r) / EDGE, 0, 1); }

    // `secondary` (right mouse) always erodes the terrain back to ocean.
    function applyBrush(point, secondary) {
        const lv = state.level;
        const cell = Level.cellSize(lv);
        const r = state.radius;
        const tool = secondary ? "water" : state.tool;
        const c = Level.worldToCell(lv, point.x, point.z);
        const rad = Math.ceil(r / cell) + 1;
        const strength = state.strength;
        let touched = false;

        for (let gz = c.gz - rad; gz <= c.gz + rad; gz++) {
            for (let gx = c.gx - rad; gx <= c.gx + rad; gx++) {
                if (gx < 0 || gz < 0 || gx >= lv.grid || gz >= lv.grid) continue;
                const cc = Level.cellCenter(lv, gx, gz);
                const d = Math.hypot(cc.x - point.x, cc.z - point.z);
                if (d > r) continue;
                const falloff = falloffAt(d, r);
                const idx = gz * lv.grid + gx;
                const h = lv.heights[idx];

                if (tool === "land") {
                    if (state.brushHeight > h) lv.heights[idx] = h + (state.brushHeight - h) * clamp(falloff * strength, 0, 1);
                    else continue;
                } else if (tool === "water") {
                    const target = lv.oceanFloor - 0.5;
                    lv.heights[idx] = h + (target - h) * clamp(falloff * strength, 0, 1);
                } else if (tool === "raise") {
                    lv.heights[idx] = clamp(h + 0.5 * strength * falloff, -40, 60);
                } else if (tool === "lower") {
                    lv.heights[idx] = clamp(h - 0.5 * strength * falloff, -40, 60);
                } else if (tool === "level") {
                    lv.heights[idx] = h + (state.refHeight - h) * clamp(falloff * strength, 0, 1);
                }
                touched = true;
            }
        }
        if (touched) markDirty();
    }

    function pickRay() {
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObject(world.terrain, false);
        if (hits.length) return hits[0].point.clone();
        seaplane.constant = -state.level.seaLevel;
        const p = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(seaplane, p)) return p;
        return null;
    }

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const seaplane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Screen position of the pointer, in the NDC space the raycaster wants.
    const mouse = { x: 0, y: 0 };
    function updatePick() {
        const w = renderer.domElement.clientWidth || window.innerWidth;
        const h = renderer.domElement.clientHeight || window.innerHeight;
        ndc.set((mouse.x / w) * 2 - 1, -(mouse.y / h) * 2 + 1);
        state.pick = pickRay();
    }

    // ------------------------------------------------------------- tool actions
    function onSecondary(point) {
        if (state.tool === "tree") return removeNearest(point, "tree");
        if (state.tool === "rock") return removeNearest(point, "rock");
        if (state.tool === "npc") return removeNearest(point, "npc");
        if (state.tool === "spawn") return clearSpawn();
        if (TERRAIN_TOOLS[state.tool]) return; // handled by the brush itself
        removeNearest(point, "any");
    }

    function removeNearest(point, kind) {
        const lv = state.level;
        const maxD = Math.max(3, state.radius);
        let best = null, bestD = maxD * maxD, bestList = null;
        const scan = (list, k) => {
            list.forEach((d) => {
                if (kind !== "any" && k !== kind) return;
                const dd = (d.x - point.x) ** 2 + (d.z - point.z) ** 2;
                if (dd < bestD) { bestD = dd; best = d; bestList = list; }
            });
        };
        scan(lv.trees, "tree"); scan(lv.rocks, "rock"); scan(lv.npcs, "npc");
        if (!best) return false;
        bestList.splice(bestList.indexOf(best), 1);
        rebuildProps();
        markDirty();
        return true;
    }

    function placeProp(point) {
        const lv = state.level;
        const h = Level.sampleHeight(lv, point.x, point.z);
        const inBounds = Math.abs(point.x) <= lv.size / 2 && Math.abs(point.z) <= lv.size / 2;
        if (!inBounds) { toast("Outside the level bounds"); return false; }
        if (h <= lv.seaLevel + 0.15) { toast("Place on land — paint terrain first"); return false; }

        // Nice, non-overlapping scatter.
        if (state.lastPropPos) {
            const dd = (point.x - state.lastPropPos.x) ** 2 + (point.z - state.lastPropPos.z) ** 2;
            if (dd < 2.6 * 2.6) return false;
        }
        const clash = (arr) => arr.some((d) => (d.x - point.x) ** 2 + (d.z - point.z) ** 2 < 1.1 * 1.1);

        if (state.tool === "tree") {
            if (clash(lv.trees) || clash(lv.rocks)) return false;
            lv.trees.push({ x: +point.x.toFixed(2), z: +point.z.toFixed(2), scale: 0.8 + Math.random() * 0.5, rot: Math.random() * Math.PI * 2, tint: (Math.random() - 0.5) * 0.08 });
        } else if (state.tool === "rock") {
            if (clash(lv.trees) || clash(lv.rocks)) return false;
            lv.rocks.push({ x: +point.x.toFixed(2), z: +point.z.toFixed(2), scale: 0.7 + Math.random() * 0.9, rx: (Math.random() - 0.5) * 0.4, ry: Math.random() * Math.PI * 2, rz: (Math.random() - 0.5) * 0.4 });
        } else if (state.tool === "npc") {
            const existing = lv.npcs.findIndex((n) => n.type === state.npcType);
            const data = { type: state.npcType, x: +point.x.toFixed(2), z: +point.z.toFixed(2), rot: 0 };
            if (existing >= 0) lv.npcs[existing] = data; else lv.npcs.push(data);
        }
        state.lastPropPos = { x: point.x, z: point.z };
        rebuildProps();
        markDirty();
        return true;
    }

    // One spawn per level: click to set / move it, right-click to clear.
    function placeSpawn(point) {
        const lv = state.level;
        const inB = Math.abs(point.x) <= lv.size / 2 && Math.abs(point.z) <= lv.size / 2;
        if (!inB) { toast("Outside the level bounds"); return false; }
        if (Level.sampleHeight(lv, point.x, point.z) <= lv.seaLevel + 0.15) {
            toast("Spawn must be on land — paint terrain first");
            return false;
        }
        const prev = lv.spawn;
        if (prev && Math.abs(prev.x - point.x) < 0.01 && Math.abs(prev.z - point.z) < 0.01) return false;
        lv.spawn = { x: +point.x.toFixed(2), z: +point.z.toFixed(2) };
        rebuildProps();
        markDirty();
        refreshStats();
        toast("Spawn set");
        return true;
    }

    function clearSpawn() {
        if (!state.level.spawn) { toast("No custom spawn set"); return false; }
        state.level.spawn = null;
        rebuildProps();
        markDirty();
        refreshStats();
        toast("Spawn cleared — the game will pick the middle of the map");
        return true;
    }

    // Mouse interactions -------------------------------------------------------

    function beginStroke(point, secondary) {
        state.refHeight = Level.sampleHeight(state.level, point.x, point.z);
        pushUndo();
        if (isBrushTool(state.tool)) {
            state.painting = true;
            if (state.tool === "zone") applyZoneBrush(point, secondary);
            else applyBrush(point, secondary);
        } else if (state.tool === "erase") {
            onSecondary(point);
        } else if (state.tool === "spawn") {
            state.lastPropPos = null;
            placeSpawn(point);
        } else {
            state.lastPropPos = null;
            placeProp(point);
        }
    }

    function onPointerDown(e) {
        if (e.target !== renderer.domElement) return;
        updatePick();

        if (e.button === 0) {
            if (!state.pick) return;
            state.shift = e.shiftKey;
            beginStroke(state.pick, false);
        } else if (e.button === 1) {
            state.panning = true;
            e.preventDefault();
        } else if (e.button === 2) {
            state.rightArmed = true;
            state.looking = false;
            state._rd = { x: e.clientX, y: e.clientY };
        }
    }

    function onPointerMove(e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        const sens = 0.0022 * state.camSens;

        if (state.looking) {
            state.yaw -= e.movementX * sens;
            state.pitch -= e.movementY * sens;
            state.pitch = clamp(state.pitch, -Math.PI / 2 + 0.03, Math.PI / 2 - 0.03);
        } else if (state.rightArmed) {
            if (Math.abs(e.clientX - state._rd.x) > 3 || Math.abs(e.clientY - state._rd.y) > 3) {
                state.looking = true;
            }
        }

        if (state.panning) {
            const right = new THREE.Vector3(), up = new THREE.Vector3();
            camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
            const k = state.camSpeed * 0.004 * (state.shift ? 3 : 1);
            camera.position.addScaledVector(right, -e.movementX * k);
            camera.position.addScaledVector(up, e.movementY * k);
        }
    }

    function onPointerUp(e) {
        if (e.button === 1) state.panning = false;
        if (e.button === 2) {
            state.rightArmed = false;
            if (!state.looking && e.target === renderer.domElement) {
                updatePick();
                if (state.pick) {
                    pushUndo();
                    if (state.tool === "zone") applyZoneBrush(state.pick, true);
                    else if (TERRAIN_TOOLS[state.tool]) applyBrush(state.pick, true);
                    else onSecondary(state.pick);
                    markDirty();
                }
            }
            state.looking = false;
        }
        if (e.button === 0) state.painting = false;
    }

    function onWheel(e) {
        if (e.target !== renderer.domElement) return;
        e.preventDefault();
        if (e.shiftKey) {
            camera.position.addScaledVector(camDir(), Math.sign(e.deltaY) * -2);
            return;
        }
        state.radius = clamp(state.radius + (e.deltaY > 0 ? -1 : 1), 1, 30);
        $("brush-radius").value = state.radius;
        $("brush-radius-v").textContent = state.radius;
    }

    // ----------------------------------------------------------------- camera
    function camDir() {
        const d = new THREE.Vector3();
        camera.getWorldDirection(d);
        return d;
    }

    function updateCamera(dt) {
        camera.rotation.set(state.pitch, state.yaw, 0, "YXZ");
        camera.updateMatrixWorld();

        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0);

        let speed = state.camSpeed * (state.shift ? 3.2 : 1);
        const move = new THREE.Vector3();
        if (state.keys["KeyW"]) move.add(fwd);
        if (state.keys["KeyS"]) move.sub(fwd);
        if (state.keys["KeyD"]) move.add(right);
        if (state.keys["KeyA"]) move.sub(right);
        if (state.keys["Space"]) move.add(up);
        if (state.keys["ControlLeft"] || state.keys["ControlRight"] || state.keys["KeyC"]) move.sub(up);
        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(speed * dt);
            camera.position.add(move);
        }
    }

    function frameLevel() {
        const lv = state.level;
        const reach = lv.size * 0.85;
        camera.position.set(reach * 0.55, reach * 0.55, reach * 0.85);
        state.yaw = 0.55;
        state.pitch = -0.55;
        camera.rotation.set(state.pitch, state.yaw, 0, "YXZ");
    }

    // -------------------------------------------------------------- undo/redo
    function snapshot() {
        return JSON.stringify({
            heights: state.level.heights,
            zones: state.level.zones,
            trees: state.level.trees,
            rocks: state.level.rocks,
            npcs: state.level.npcs,
            spawn: state.level.spawn || null
        });
    }

    function pushUndo() {
        state.undo.push(snapshot());
        if (state.undo.length > 50) state.undo.shift();
        state.redo.length = 0;
        refreshUndoButtons();
    }

    function restore(str) {
        const data = JSON.parse(str);
        state.level.heights = data.heights;
        if (data.zones) state.level.zones = data.zones;
        state.level.trees = data.trees;
        state.level.rocks = data.rocks;
        state.level.npcs = data.npcs;
        state.level.spawn = data.spawn || null;
        refreshTerrain();
        rebuildProps();
        refreshZoneOverlay();
        markDirty();
        refreshStats();
    }

    function undo() {
        if (!state.undo.length) return toast("Nothing to undo");
        state.redo.push(snapshot());
        restore(state.undo.pop());
        refreshUndoButtons();
    }

    function redo() {
        if (!state.redo.length) return toast("Nothing to redo");
        state.undo.push(snapshot());
        restore(state.redo.pop());
        refreshUndoButtons();
    }

    function refreshUndoButtons() {
        $("btn-undo").disabled = state.undo.length === 0;
        $("btn-redo").disabled = state.redo.length === 0;
        $("btn-undo").style.opacity = state.undo.length ? "1" : ".5";
        $("btn-redo").style.opacity = state.redo.length ? "1" : ".5";
    }

    // ------------------------------------------------------------------- stats
    function refreshStats() {
        const lv = state.level;
        const land = Level.countLand(lv);
        const total = lv.heights.length;
        $("st-land").textContent = land;
        $("st-water").textContent = total - land;
        $("st-trees").textContent = lv.trees.length;
        $("st-rocks").textContent = lv.rocks.length;
        $("st-npcs").textContent = lv.npcs.length;

        const sp = $("st-spawn");
        if (sp) {
            if (lv.spawn) {
                const ok = !Level.spawnPoint || Level.spawnPoint(lv);
                sp.textContent = lv.spawn.x.toFixed(1) + ", " + lv.spawn.z.toFixed(1);
                sp.style.color = ok ? "" : "var(--p-bad)";
                sp.title = ok ? "Players start here" : "In water or out of bounds — the game will fall back to the middle of the map";
            } else {
                sp.textContent = "centre";
                sp.style.color = "";
                sp.title = "No custom spawn — the game picks a land tile near the middle of the map";
            }
        }

        const counts = Level.countZoneWater(lv);
        const el = $("st-zones");
        if (el) {
            const rows = Level.ZONES
                .filter((z) => z.id !== 0 && counts[z.id] > 0)
                .map((z) => '<div class="stat"><span><i class="zone-dot" style="background:#' +
                    new THREE.Color(z.color).getHexString() + '"></i>' + z.name +
                    '</span><b>' + counts[z.id] + "</b></div>");
            el.innerHTML = rows.length ? rows.join("") : '<div class="hint">No zones tagged &mdash; all water counts as ocean.</div>';
        }
    }

    let statsDirty = false;
    let zonesDirty = false;
    function markDirty() { state.dirty = true; statsDirty = true; }

    // ------------------------------------------------------------------- UI bits
    function buildTools() {
        const el = $("ed-tools");
        el.innerHTML = "";
        TOOLS.forEach((t, i) => {
            if (i === 5) {
                const sep = document.createElement("div");
                sep.className = "tool-sep";
                el.appendChild(sep);
            }
            const b = document.createElement("div");
            b.className = "tool" + (t.id === state.tool ? " is-on" : "");
            b.dataset.tool = t.id;
            b.title = t.name + " (" + t.key + ") — " + t.tip;
            b.innerHTML = PX.icon(t.icon, 22);
            b.onclick = () => selectTool(t.id);
            el.appendChild(b);
        });
    }

    function selectTool(id) {
        state.tool = id;
        [...document.querySelectorAll(".tool")].forEach((el) => el.classList.toggle("is-on", el.dataset.tool === id));
        const t = TOOLS.find((x) => x.id === id);
        $("brush-tip").textContent = t ? t.tip : "";
        $("st-tool").innerHTML = "<b>" + (t ? t.name : id) + "</b>";
        $("sec-npc").style.display = id === "npc" ? "flex" : "none";
        $("sec-zone").style.display = id === "zone" ? "flex" : "none";
        // Terrain brushes benefit from a radius; single-object tools do not.
        $("brush-radius").parentElement.style.opacity = isBrushTool(id) || id === "erase" ? "1" : ".45";
    }

    function buildNpcList() {
        const el = $("npc-list");
        el.innerHTML = "";
        WorldGen.NPC_TYPES.forEach((t) => {
            const d = document.createElement("div");
            d.className = "npc-pick" + (t.id === state.npcType ? " is-on" : "");
            d.dataset.npc = t.id;
            d.innerHTML = '<i class="npc-dot" style="background:#' + new THREE.Color(t.color).getHexString() + '"></i><span>' + t.name + "</span>";
            d.onclick = () => {
                state.npcType = t.id;
                [...el.children].forEach((c) => c.classList.toggle("is-on", c.dataset.npc === t.id));
            };
            el.appendChild(d);
        });
    }

    function buildZoneList() {
        const el = $("zone-list");
        el.innerHTML = "";
        Level.ZONES.forEach((z) => {
            const d = document.createElement("div");
            d.className = "npc-pick zone-pick" + (z.id === state.zoneId ? " is-on" : "");
            d.dataset.zone = z.id;
            d.title = z.id === 0
                ? "Untagged water (default) — right-click repaints water as ocean."
                : z.name + " — the game draws the " + z.fish + " fish pool here.";
            d.innerHTML = '<i class="zone-dot" style="background:#' + new THREE.Color(z.color).getHexString() +
                '"></i><span>' + z.name + "</span>";
            d.onclick = () => {
                state.zoneId = z.id;
                [...el.children].forEach((c) => c.classList.toggle("is-on", +c.dataset.zone === z.id));
            };
            el.appendChild(d);
        });
    }

    function syncSettingsInputs() {
        const lv = state.level;
        $("set-grid").value = lv.grid;
        $("set-size").value = lv.size;
        $("set-sea").value = lv.seaLevel;
        $("set-floor").value = lv.oceanFloor;
    }

    // ------------------------------------------------------------- level edits
    function resample(grid, size, sea, floor) {
        const old = state.level;
        const next = Level.createDefault({
            name: old.name, size: size, grid: grid,
            seaLevel: sea, oceanFloor: Math.min(floor, sea - 0.5), landHeight: old.landHeight
        });
        for (let gz = 0; gz < grid; gz++) {
            for (let gx = 0; gx < grid; gx++) {
                const c = Level.cellCenter(next, gx, gz);
                next.heights[gz * grid + gx] = Level.sampleHeight(old, c.x, c.z);
                next.zones[gz * grid + gx] = Level.zoneAt(old, c.x, c.z);
            }
        }
        // Drop props that would now be out of bounds.
        const half = size / 2;
        const inB = (d) => Math.abs(d.x) <= half && Math.abs(d.z) <= half;
        next.trees = old.trees.filter(inB);
        next.rocks = old.rocks.filter(inB);
        next.npcs = old.npcs.filter(inB);
        next.spawn = old.spawn && inB(old.spawn) ? old.spawn : null;
        state.level = Level.normalize(next);
        buildWorld();
        refreshStats();
        refreshUndoButtons();
    }

    function fillAll(land) {
        pushUndo();
        const lv = state.level;
        const v = land ? lv.landHeight : lv.oceanFloor;
        for (let i = 0; i < lv.heights.length; i++) lv.heights[i] = v;
        refreshTerrain();
        markDirty();
    }

    function flattenAll() {
        pushUndo();
        const lv = state.level;
        // Average of all land cells, or the land height when there is no land.
        let sum = 0, n = 0;
        for (const h of lv.heights) if (h > lv.seaLevel) { sum += h; n++; }
        const v = n ? sum / n : lv.landHeight;
        for (let i = 0; i < lv.heights.length; i++) if (lv.heights[i] > lv.seaLevel) lv.heights[i] = v;
        refreshTerrain();
        markDirty();
    }

    // ------------------------------------------------------------- save / load
    function saveLocal() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentJSON()));
            toast("Saved to this browser");
        } catch (err) { toast("Save failed: " + err.message); }
    }

    function loadLocal(silent) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) { if (!silent) toast("No saved level found"); return false; }
        try {
            loadLevel(JSON.parse(raw), silent);
            return true;
        } catch (err) { if (!silent) toast("Load failed: " + err.message); return false; }
    }

    function download() {
        const data = JSON.stringify(currentJSON(), null, 0);
        const blob = new Blob([data], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = (state.level.name || "level").replace(/[^\w\-]+/g, "_") + ".level.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast("Exported level file");
    }

    function playInGame() {
        saveLocal();
        window.open("index.html?custom=1", "_blank");
        toast("Opening the game with your level");
    }

    // ------------------------------------------------------------------ events
    function bindUI() {
        $("level-name").oninput = () => { state.level.name = $("level-name").value.slice(0, 60); };

        $("brush-radius").oninput = (e) => { state.radius = +e.target.value; $("brush-radius-v").textContent = state.radius; };
        $("brush-strength").oninput = (e) => { state.strength = +e.target.value; $("brush-strength-v").textContent = state.strength; };
        $("brush-height").oninput = (e) => { state.brushHeight = +e.target.value; };

        $("cam-speed").oninput = (e) => { state.camSpeed = +e.target.value; $("cam-speed-v").textContent = state.camSpeed; };
        $("cam-sens").oninput = (e) => { state.camSens = +e.target.value; $("cam-sens-v").textContent = state.camSens; };

        $("chk-grid").onchange = (e) => { if (world.grid) world.grid.visible = e.target.checked; };
        $("chk-water").onchange = (e) => { if (world.water) world.water.visible = e.target.checked; };
        $("chk-zones").onchange = (e) => { if (world.zones) world.zones.visible = e.target.checked; };

        $("btn-auto-zone").onclick = () => {
            pushUndo();
            const n = Level.autoZones(state.level);
            refreshZoneOverlay(); refreshStats(); markDirty();
            toast(n ? "Tagged " + n + " enclosed water tiles as Lake" : "No enclosed water found");
        };
        $("btn-clear-zone").onclick = () => {
            pushUndo();
            const zones = state.level.zones;
            let n = 0;
            for (let i = 0; i < zones.length; i++) if (zones[i]) { zones[i] = 0; n++; }
            refreshZoneOverlay(); refreshStats(); markDirty();
            toast(n ? "Cleared " + n + " zone tags" : "No zone tags to clear");
        };

        $("btn-apply").onclick = () => {
            const grid = clamp(parseInt($("set-grid").value, 10) || state.level.grid, 8, 256);
            const size = clamp(parseInt($("set-size").value, 10) || state.level.size, 32, 2048);
            const sea = parseFloat($("set-sea").value);
            const floor = parseFloat($("set-floor").value);
            pushUndo();
            resample(grid, size, Number.isFinite(sea) ? sea : state.level.seaLevel, Number.isFinite(floor) ? floor : state.level.oceanFloor);
            toast("Terrain grid applied");
        };
        $("btn-fill-land").onclick = () => fillAll(true);
        $("btn-fill-water").onclick = () => fillAll(false);
        $("btn-flat").onclick = () => flattenAll();

        $("btn-clear-props").onclick = () => {
            pushUndo();
            state.level.trees = []; state.level.rocks = [];
            rebuildProps(); markDirty(); refreshStats();
            toast("Props cleared");
        };
        $("btn-clear-npcs").onclick = () => {
            pushUndo();
            state.level.npcs = [];
            rebuildProps(); markDirty(); refreshStats();
            toast("NPCs cleared");
        };

        $("btn-new").onclick = () => {
            if (!confirm("Start a new empty ocean level? Unsaved work is lost.")) return;
            loadLevel(Level.createDefault(), true);
            toast("New level");
        };
        $("btn-save").onclick = saveLocal;
        $("btn-load").onclick = () => loadLocal(false);
        $("btn-download").onclick = download;
        $("btn-upload").onclick = () => $("file-input").click();
        $("btn-play").onclick = playInGame;
        $("btn-undo").onclick = undo;
        $("btn-redo").onclick = redo;
        $("btn-help").onclick = () => $("ov-help").classList.add("on");
        $("help-close").onclick = () => $("ov-help").classList.remove("on");

        $("file-input").onchange = (e) => {
            const f = e.target.files && e.target.files[0];
            e.target.value = "";
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
                try { loadLevel(JSON.parse(reader.result), true); toast("Imported " + f.name); }
                catch (err) { toast("Invalid level file"); }
            };
            reader.readAsText(f);
        };
    }

    function bindInput() {
        const dom = renderer.domElement;
        dom.addEventListener("contextmenu", (e) => e.preventDefault());
        dom.addEventListener("mousedown", onPointerDown);
        window.addEventListener("mousemove", onPointerMove);
        window.addEventListener("mouseup", onPointerUp);
        dom.addEventListener("wheel", onWheel, { passive: false });
        dom.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });

        window.addEventListener("keydown", (e) => {
            if (e.target.tagName === "INPUT") return;
            state.keys[e.code] = true;
            if (e.code === "ShiftLeft" || e.code === "ShiftRight") state.shift = true;
            if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
            if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") { e.preventDefault(); redo(); return; }
            if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") { e.preventDefault(); saveLocal(); return; }
            const t = TOOLS.find((x) => x.key === e.code.replace("Digit", "").replace(/^Key/, ""));
            if (t) selectTool(t.id);
            if (e.code === "KeyG") { $("chk-grid").checked = !$("chk-grid").checked; $("chk-grid").onchange({ target: $("chk-grid") }); }
            if (e.code === "KeyF") frameLevel();
            if (e.code === "Escape") { $("ov-help").classList.remove("on"); }
        });
        window.addEventListener("keyup", (e) => {
            state.keys[e.code] = false;
            if (e.code === "ShiftLeft" || e.code === "ShiftRight") state.shift = false;
        });
    }

    // ------------------------------------------------------------------ animate
    let last = performance.now();
    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        updateCamera(dt);

        if (state.painting && state.tool === "zone") {
            updatePick();
            if (state.pick) applyZoneBrush(state.pick, false);
        } else if (state.painting && TERRAIN_TOOLS[state.tool]) {
            updatePick();
            if (state.pick) {
                const step = state.tool === "raise" || state.tool === "lower" ? 6 * dt : 1;
                if (step >= 1) applyBrush(state.pick, false);
                else {
                    // Continuous raise/lower: scale the per-frame delta with dt.
                    const lv = state.level;
                    const cell = Level.cellSize(lv);
                    const r = state.radius;
                    const c = Level.worldToCell(lv, state.pick.x, state.pick.z);
                    const rad = Math.ceil(r / cell) + 1;
                    for (let gz = c.gz - rad; gz <= c.gz + rad; gz++) {
                        for (let gx = c.gx - rad; gx <= c.gx + rad; gx++) {
                            if (gx < 0 || gz < 0 || gx >= lv.grid || gz >= lv.grid) continue;
                            const cc = Level.cellCenter(lv, gx, gz);
                            const d = Math.hypot(cc.x - state.pick.x, cc.z - state.pick.z);
                            if (d > r) continue;
                            const f = falloffAt(d, r) * state.strength * dt * 9;
                            const idx = gz * lv.grid + gx;
                            lv.heights[idx] = clamp(lv.heights[idx] + (state.tool === "raise" ? f : -f), -40, 60);
                        }
                    }
                    markDirty();
                }
            }
        } else if (state.painting && (state.tool === "tree" || state.tool === "rock" || state.tool === "npc")) {
            updatePick();
            if (state.pick) placeProp(state.pick);
        }

        if (state.dirty) {
            state.dirty = false;
            refreshTerrain();
            refreshStats();
        }
        if (statsDirty) { statsDirty = false; refreshStats(); }
        if (zonesDirty) { zonesDirty = false; refreshZoneOverlay(); }

        // Brush ring follows the cursor.
        updatePick();
        updatePickSurface();
        if (world.water && world.water.material && world.water.material.map) {
            world.water.material.map.offset.x = (now * 0.00001) % 1;
            world.water.material.map.offset.y = (now * 0.000006) % 1;
        }

        renderer.render(scene, camera);
    }

    function updatePickSurface() {
        if (!state.pick || !world.ring) { if (world.ring) world.ring.visible = false; return; }
        const p = state.pick;
        const h = Level.sampleHeight(state.level, p.x, p.z);
        world.ring.visible = true;
        world.ring.position.set(p.x, h + 0.25, p.z);
        const isBrush = isBrushTool(state.tool);
        const r = isBrush ? state.radius : Math.max(2.5, state.radius * 0.6);
        if (state.tool === "zone") {
            world.ring.material.color.setHex(Level.zoneInfo(state.zoneId).color);
            world.ring.position.y = state.level.seaLevel + 0.3;
        } else {
            world.ring.material.color.setHex(isBrush ? 0xf2c14e : 0x6fb54a);
        }
        world.ring.scale.set(r, r, r);
    }

    // --------------------------------------------------------------------- boot
    function init() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x9FD9FF);
        scene.fog = new THREE.Fog(0x9FD9FF, 160, 620);

        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 4000);

        renderer = new THREE.WebGLRenderer({ antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        viewport.appendChild(renderer.domElement);

        const hemi = new THREE.HemisphereLight(0xFFEEB1, 0x18324a, 0.75);
        scene.add(hemi);
        const amb = new THREE.AmbientLight(0xffffff, 0.35);
        scene.add(amb);
        sun = new THREE.DirectionalLight(0xfff3d6, 0.95);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.bias = -0.0015;
        scene.add(sun);

        // Brush ring indicator.
        world.ring = new THREE.Mesh(
            new THREE.RingGeometry(0.86, 1, 48),
            new THREE.MeshBasicMaterial({ color: 0xf2c14e, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false })
        );
        world.ring.rotation.x = -Math.PI / 2;
        world.ring.renderOrder = 999;
        scene.add(world.ring);

        buildTools();
        buildNpcList();
        buildZoneList();
        bindUI();
        bindInput();
        selectTool("land");

        // Start from a saved level if one exists, otherwise a fresh ocean.
        if (!loadLocal(true)) {
            loadLevel(Level.createDefault(), true);
        }
        frameLevel();
        refreshUndoButtons();
        refreshStats();
        $("ov-help").classList.add("on");

        window.addEventListener("resize", () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Live coordinate readout.
        setInterval(() => {
            if (state.pick) {
                const h = Level.sampleHeight(state.level, state.pick.x, state.pick.z);
                $("st-pos").textContent = state.pick.x.toFixed(1) + ", " + state.pick.z.toFixed(1);
                $("st-height").textContent = h.toFixed(1);
            }
        }, 120);

        animate();
    }

    // Small introspection hook so the editor can be scripted / debugged from
    // the console (and automated tests). Not used by the UI itself.
    window.EditorAPI = {
        state: state,
        level: () => state.level,
        scene: () => scene,
        world: world,
        selectTool: selectTool,
        applyBrush: applyBrush,
        applyZoneBrush: applyZoneBrush,
        autoZones: () => Level.autoZones(state.level),
        refreshZoneOverlay: refreshZoneOverlay,
        placeProp: placeProp,
        removeNearest: removeNearest,
        placeSpawn: placeSpawn,
        clearSpawn: clearSpawn,
        refreshTerrain: refreshTerrain,
        rebuildProps: rebuildProps,
        resample: resample,
        undo: undo, redo: redo,
        pushUndo: pushUndo,
        save: saveLocal, load: loadLocal,
        newLevel: () => loadLevel(Level.createDefault(), true),
        frameLevel: frameLevel,
        pick: () => state.pick,
        tools: TOOLS
    };

    init();
})();
