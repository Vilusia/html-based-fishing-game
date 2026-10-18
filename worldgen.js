// --- SHARED WORLD / LEVEL MODULE ---
// Used by BOTH the level editor (editor.html) and the game (index.html).
// Holds the level file format, height sampling and the mesh builders so the
// editor preview and the real game always agree on what a level looks like.
//
// Level JSON shape (version 1):
// {
//   version: 1,
//   name: "Untitled Level",
//   size: 256,            // world is size x size, centred on the origin
//   grid: 64,             // cells per axis; cell size = size / grid
//   seaLevel: 0,          // Y of the water surface
//   oceanFloor: -6,       // default depth of unpainted ocean
//   landHeight: 2,        // default height when painting fresh land
//   heights: number[],    // grid*grid cell heights, index = gz*grid + gx
//   zoneMap: "0011223...",// grid*grid fishing-zone ids as a digit string (optional)
//   trees: [{x,z,scale,rot,tint}],
//   rocks: [{x,z,scale,rx,ry,rz}],
//   npcs:  [{type,x,z,rot}]
// }
//
// Fishing zones: every water cell can be tagged with a zone id so the game
// picks the matching fish pool. 0 = ocean (the default for anything untagged).
(function () {
    "use strict";

    const LEVEL_VERSION = 1;
    const DEFAULT_SIZE = 256;
    const DEFAULT_GRID = 64;
    const DEFAULT_SEA = 0;
    const DEFAULT_OCEAN_FLOOR = -6;
    const DEFAULT_LAND_HEIGHT = 2;

    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;

    // -------------------------------------------------------- Fishing zones
    // `fish` is the zone name the game's fishing code understands. Ponds are
    // special-cased later (lightpond / darkpond) but both use fishingZone 'pond'.
    const ZONES = [
        { id: 0, key: "ocean", name: "Ocean", color: 0x3d7fb8, fish: "ocean" },
        { id: 1, key: "lake", name: "Lake", color: 0x3fae9c, fish: "lake" },
        { id: 2, key: "river", name: "River", color: 0x5ec8e8, fish: "river" },
        { id: 3, key: "lightpond", name: "Light Pond", color: 0x8fe07a, fish: "lightpond" },
        { id: 4, key: "darkpond", name: "Dark Pond", color: 0x8a4fd0, fish: "darkpond" },
        { id: 5, key: "cave", name: "Cave / Secret", color: 0xe0a03a, fish: "secret" }
    ];
    const ZONE_BY_KEY = {};
    const ZONE_BY_ID = {};
    ZONES.forEach((z) => { ZONE_BY_KEY[z.key] = z; ZONE_BY_ID[z.id] = z; });

    function zoneInfo(id) { return ZONE_BY_ID[id] || ZONES[0]; }
    function zoneIdByKey(key) { return ZONE_BY_KEY[key] ? ZONE_BY_KEY[key].id : 0; }

    // Nearest-cell zone lookup. Outside the grid => ocean.
    function zoneAt(level, x, z) {
        if (!inBounds(level, x, z) || !level.zones) return 0;
        const cs = cellSize(level);
        const half = level.size / 2;
        const gx = clamp(Math.floor((x + half) / cs), 0, level.grid - 1);
        const gz = clamp(Math.floor((z + half) / cs), 0, level.grid - 1);
        return level.zones[gz * level.grid + gx] || 0;
    }

    // How many *water* cells carry each zone (used by the editor's stats).
    function countZoneWater(level) {
        const out = {};
        ZONES.forEach((z) => { out[z.id] = 0; });
        const g = level.grid;
        for (let i = 0; i < level.heights.length; i++) {
            if (level.heights[i] >= level.seaLevel - 0.001) continue;
            const id = (level.zones && level.zones[i]) || 0;
            out[id] = (out[id] || 0) + 1;
        }
        return out;
    }

    // Flood outward from the map's edge water so everything connected to the
    // open sea reads as ocean; any enclosed water left untagged becomes a lake.
    // Returns the number of cells changed.
    function autoZones(level) {
        const g = level.grid;
        const zones = level.zones;
        const seen = new Uint8Array(g * g);
        const queue = [];
        const isW = (i) => level.heights[i] < level.seaLevel - 0.001;
        const push = (gx, gz) => {
            const i = gz * g + gx;
            if (seen[i] || !isW(i)) return;
            seen[i] = 1;
            queue.push(i);
        };
        for (let gx = 0; gx < g; gx++) { push(gx, 0); push(gx, g - 1); }
        for (let gz = 0; gz < g; gz++) { push(0, gz); push(g - 1, gz); }
        while (queue.length) {
            const i = queue.pop();
            const gx = i % g, gz = (i / g) | 0;
            if (gx > 0) push(gx - 1, gz);
            if (gx < g - 1) push(gx + 1, gz);
            if (gz > 0) push(gx, gz - 1);
            if (gz < g - 1) push(gx, gz + 1);
        }
        let changed = 0;
        for (let i = 0; i < g * g; i++) {
            if (!isW(i) || seen[i]) continue;
            // Never stomp a zone the author painted by hand.
            if ((zones[i] || 0) !== 0) continue;
            zones[i] = 1; changed++;
        }
        return changed;
    }

    // ---------------------------------------------------------------- Level

    function createDefault(opts) {
        opts = opts || {};
        const size = opts.size || DEFAULT_SIZE;
        const grid = opts.grid || DEFAULT_GRID;
        return {
            version: LEVEL_VERSION,
            name: opts.name || "Untitled Level",
            size: size,
            grid: grid,
            seaLevel: opts.seaLevel != null ? opts.seaLevel : DEFAULT_SEA,
            oceanFloor: opts.oceanFloor != null ? opts.oceanFloor : DEFAULT_OCEAN_FLOOR,
            landHeight: opts.landHeight != null ? opts.landHeight : DEFAULT_LAND_HEIGHT,
            heights: new Array(grid * grid).fill(opts.oceanFloor != null ? opts.oceanFloor : DEFAULT_OCEAN_FLOOR),
            zones: new Array(grid * grid).fill(0),
            trees: [],
            rocks: [],
            npcs: [],
            spawn: null
        };
    }

    // Fill in anything a hand-edited / older file might be missing.
    function normalize(level) {
        if (!level || typeof level !== "object") throw new Error("Level is not an object");
        const out = level;
        out.version = LEVEL_VERSION;
        out.name = String(out.name || "Untitled Level").slice(0, 60);
        out.size = Math.max(32, Math.min(2048, Number(out.size) || DEFAULT_SIZE));
        out.grid = Math.max(8, Math.min(256, Math.round(Number(out.grid) || DEFAULT_GRID)));
        out.seaLevel = Number.isFinite(out.seaLevel) ? out.seaLevel : DEFAULT_SEA;
        out.oceanFloor = Number.isFinite(out.oceanFloor) ? out.oceanFloor : DEFAULT_OCEAN_FLOOR;
        out.landHeight = Number.isFinite(out.landHeight) ? out.landHeight : DEFAULT_LAND_HEIGHT;
        out.oceanFloor = Math.min(out.oceanFloor, out.seaLevel - 0.5);

        const need = out.grid * out.grid;
        const src = Array.isArray(out.heights) ? out.heights : [];
        const heights = new Array(need);
        for (let i = 0; i < need; i++) {
            const v = Number(src[i]);
            heights[i] = Number.isFinite(v) ? v : out.oceanFloor;
        }
        out.heights = heights;

        // Fishing zones: accept either a digit string (zoneMap) or an array.
        const zoneSrc = typeof out.zoneMap === "string"
            ? out.zoneMap
            : (Array.isArray(out.zones) ? out.zones : null);
        const zones = new Array(need);
        for (let i = 0; i < need; i++) {
            let v;
            if (typeof zoneSrc === "string") v = zoneSrc.charCodeAt(i) - 48;
            else if (zoneSrc) v = Number(zoneSrc[i]);
            zones[i] = ZONE_BY_ID[v] ? v : 0;
        }
        out.zones = zones;
        delete out.zoneMap;

        // Cap prop counts: a crafted level could otherwise demand tens of
        // thousands of meshes and kill the tab when the world builds. Very
        // generous compared with the stock island (120 trees, 60 rocks).
        out.trees = Array.isArray(out.trees) ? out.trees.filter(validObj).map(normTree).slice(0, 3000) : [];
        out.rocks = Array.isArray(out.rocks) ? out.rocks.filter(validObj).map(normRock).slice(0, 2000) : [];
        out.npcs = Array.isArray(out.npcs) ? out.npcs.filter(validObj).map(normNpc).slice(0, 100) : [];
        // Optional hand-placed player spawn: a single {x, z} or nothing.
        out.spawn = validObj(out.spawn) ? { x: +out.spawn.x, z: +out.spawn.z } : null;
        return out;
    }
    const validObj = (o) => o && typeof o === "object" && Number.isFinite(Number(o.x)) && Number.isFinite(Number(o.z));
    function normTree(t) {
        return { x: +t.x, z: +t.z, scale: clamp(Number(t.scale) || 1, 0.3, 3), rot: Number(t.rot) || 0, tint: Number(t.tint) || 0 };
    }
    function normRock(r) {
        return { x: +r.x, z: +r.z, scale: clamp(Number(r.scale) || 1, 0.3, 4), rx: Number(r.rx) || 0, ry: Number(r.ry) || 0, rz: Number(r.rz) || 0 };
    }
    function normNpc(n) {
        return { type: String(n.type || "merchant"), x: +n.x, z: +n.z, rot: Number(n.rot) || 0 };
    }

    // Plain, JSON-safe copy of a level. Zones are stored as a compact digit
    // string so big grids stay small.
    function serialize(level) {
        const lv = normalize(level);
        return {
            version: LEVEL_VERSION,
            name: lv.name,
            size: lv.size,
            grid: lv.grid,
            seaLevel: lv.seaLevel,
            oceanFloor: lv.oceanFloor,
            landHeight: lv.landHeight,
            heights: lv.heights,
            zoneMap: Array.prototype.join.call(lv.zones, ""),
            trees: lv.trees,
            rocks: lv.rocks,
            npcs: lv.npcs,
            spawn: lv.spawn || null
        };
    }

    function cellSize(level) { return level.size / level.grid; }

    function inBounds(level, x, z) {
        const h = level.size / 2;
        return x >= -h && x <= h && z >= -h && z <= h;
    }

    // World position of a grid cell centre.
    function cellCenter(level, gx, gz) {
        const cs = cellSize(level);
        const half = level.size / 2;
        return { x: -half + (gx + 0.5) * cs, z: -half + (gz + 0.5) * cs };
    }

    // Grid cell index from a world position (may be out of range).
    function worldToCell(level, x, z) {
        const cs = cellSize(level);
        const half = level.size / 2;
        return { gx: Math.floor((x + half) / cs), gz: Math.floor((z + half) / cs) };
    }

    // Bilinear height sample over cell centres. Outside the grid => ocean floor.
    function sampleHeight(level, x, z) {
        if (!inBounds(level, x, z)) return level.oceanFloor;
        const cs = cellSize(level);
        const half = level.size / 2;
        const fx = (x + half) / cs - 0.5;
        const fz = (z + half) / cs - 0.5;
        const x0 = Math.floor(fx), z0 = Math.floor(fz);
        const tx = fx - x0, tz = fz - z0;
        const g = level.grid;
        const H = (i, j) => level.heights[clamp(j, 0, g - 1) * g + clamp(i, 0, g - 1)];
        const h00 = H(x0, z0), h10 = H(x0 + 1, z0), h01 = H(x0, z0 + 1), h11 = H(x0 + 1, z0 + 1);
        return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
    }

    function isWater(level, x, z) { return sampleHeight(level, x, z) < level.seaLevel - 0.001; }

    // The level's hand-placed spawn when it is still usable — inside the map
    // and standing on dry land. Returns null when unset or invalid so callers
    // can fall back to an automatic spawn search.
    function spawnPoint(level) {
        const s = level && level.spawn;
        if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) return null;
        if (!inBounds(level, s.x, s.z)) return null;
        if (sampleHeight(level, s.x, s.z) <= level.seaLevel + 0.15) return null;
        return { x: s.x, z: s.z };
    }

    function countLand(level) {
        let n = 0;
        for (let i = 0; i < level.heights.length; i++) if (level.heights[i] > level.seaLevel) n++;
        return n;
    }

    // ------------------------------------------------------------- Textures

    function createNoiseTexture(width, height, colorA, colorB, scale, seed) {
        scale = scale || 1; seed = seed || 0;
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        const random = (x, y) => {
            const s = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
            return s - Math.floor(s);
        };
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        const cA = new THREE.Color(colorA), cB = new THREE.Color(colorB);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const n = random(x * scale, y * scale);
                const idx = (x + y * width) * 4;
                data[idx] = (cA.r + (cB.r - cA.r) * n) * 255;
                data[idx + 1] = (cA.g + (cB.g - cA.g) * n) * 255;
                data[idx + 2] = (cA.b + (cB.b - cA.b) * n) * 255;
                data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        return new THREE.CanvasTexture(canvas);
    }

    function createLeafTexture() {
        const c = document.createElement("canvas"); c.width = 256; c.height = 256;
        const ctx = c.getContext("2d");
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, "#2d5a27"); grad.addColorStop(1, "#1a472a");
        ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 1500; i++) {
            const val = Math.random();
            ctx.strokeStyle = val > 0.7 ? "#3e7038" : val > 0.4 ? "#2d5a27" : "#15331e";
            ctx.lineWidth = 1 + Math.random();
            ctx.beginPath();
            const x = Math.random() * 256, y = Math.random() * 256;
            ctx.moveTo(x, y);
            ctx.lineTo(x + (Math.random() - 0.5) * 15, y + 5 + Math.random() * 10);
            ctx.stroke();
        }
        for (let i = 0; i < 500; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? "#3e7038" : "#0f2916";
            ctx.beginPath();
            ctx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    // ---------------------------------------------------------- Mesh builds

    function createRockMesh(scale) {
        scale = scale || 1;
        const geo = new THREE.IcosahedronGeometry(1, 1);
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9, flatShading: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.isRock = true;
        mesh.scale.set(scale, scale * 0.6, scale);
        mesh.castShadow = true; mesh.receiveShadow = true;
        return mesh;
    }

    function createDetailedTree(leafMat, trunkMat) {
        const group = new THREE.Group();
        group.userData.isTree = true;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 2.5, 7), trunkMat);
        trunk.position.y = 1.25; trunk.castShadow = true; trunk.receiveShadow = true;
        group.add(trunk);
        const leafGeo = new THREE.IcosahedronGeometry(1.5, 0);
        const L1 = new THREE.Mesh(leafGeo, leafMat); L1.position.y = 3.0; L1.scale.set(1.4, 1.1, 1.4); L1.castShadow = true; group.add(L1);
        const L2 = new THREE.Mesh(leafGeo, leafMat); L2.position.y = 4.8; L2.scale.set(1.1, 1.1, 1.1); L2.castShadow = true; group.add(L2);
        const L3 = new THREE.Mesh(leafGeo, leafMat); L3.position.y = 6.2; L3.scale.set(0.8, 0.8, 0.8); L3.castShadow = true; L3.receiveShadow = true; group.add(L3);
        return group;
    }

    function createFlowerMesh(color) {
        const group = new THREE.Group();
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 4), new THREE.MeshLambertMaterial({ color: 0x228b22 }));
        stem.position.y = 0.2; group.add(stem);
        const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), new THREE.MeshLambertMaterial({ color: color }));
        head.position.y = 0.4; group.add(head);
        return group;
    }

    // Shared materials (created lazily so THREE is guaranteed to exist).
    let _trunkMat = null, _leafTex = null;
    function trunkMaterial() { if (!_trunkMat) _trunkMat = new THREE.MeshStandardMaterial({ color: 0x6D4C41, roughness: 1.0 }); return _trunkMat; }
    function leafTexture() { if (!_leafTex) _leafTex = createLeafTexture(); return _leafTex; }

    function makeTree(data) {
        const leafMat = new THREE.MeshStandardMaterial({
            map: leafTexture(),
            color: 0x88CC88,
            roughness: 0.8,
            flatShading: true
        });
        leafMat.color.setHSL(0.35 + clamp(data.tint || 0, -0.1, 0.1), 0.6, 0.4);
        const t = createDetailedTree(leafMat, trunkMaterial());
        const s = data.scale || 1;
        t.scale.set(s, s, s);
        t.rotation.y = data.rot || 0;
        t.userData.propType = "tree";
        return t;
    }

    function makeRock(data) {
        const r = createRockMesh(data.scale || 1);
        r.rotation.set(data.rx || 0, data.ry || 0, data.rz || 0);
        r.userData.propType = "rock";
        return r;
    }

    // -------------------------------------------------------------- NPCs

    const NPC_TYPES = [
        { id: "merchant", name: "Merchant", color: 0xE65100, species: "fox", hat: "tophat", icon: "$" },
        { id: "stylist", name: "Stylist", color: 0xFF69B4, species: "bunny", hat: "bow", icon: "\uD83D\uDC55" },
        { id: "bait", name: "Bait Shop", color: 0x32CD32, species: "frog", hat: "straw", icon: "\uD83E\uDEB1" },
        { id: "tutorial", name: "Tutorial", color: 0x9370DB, species: "bunny", hat: "bow", icon: "?" },
        { id: "lava", name: "Inferno Guard", color: 0x8B0000, species: "dragon", hat: "viking", icon: "\uD83C\uDF0B" }
    ];

    function npcType(id) { return NPC_TYPES.find((t) => t.id === id) || NPC_TYPES[0]; }

    function makeLabelSprite(text, color) {
        const c = document.createElement("canvas");
        c.width = 256; c.height = 64;
        const ctx = c.getContext("2d");
        ctx.font = "bold 34px monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(8, 10, 240, 44);
        ctx.fillStyle = color || "#ffffff";
        ctx.fillText(text, 128, 34);
        const tex = new THREE.CanvasTexture(c);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
        spr.scale.set(4, 1, 1);
        return spr;
    }

    // A lightweight stand-in character for the editor preview (the real game
    // swaps in its full player mesh when the level is played).
    function makeNpcPreview(typeId) {
        const t = npcType(typeId);
        const group = new THREE.Group();
        group.userData.npcType = t.id;

        const bodyMat = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.7 });
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 1.5, 10), bodyMat);
        torso.position.y = 1.05; torso.castShadow = true;
        group.add(torso);
        const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.4, 0.6, 8), bodyMat);
        legs.position.y = 0.3; legs.castShadow = true;
        group.add(legs);

        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 12, 10),
            new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.7 })
        );
        head.position.y = 2.25; head.castShadow = true;
        group.add(head);

        // Eyebrows/eyes so the front of the NPC is obvious.
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        for (const dx of [-0.18, 0.18]) {
            const eye = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.2, 0.05), eyeMat);
            eye.position.set(dx, 2.32, 0.46);
            group.add(eye);
        }

        // Icon above the head.
        const c = document.createElement("canvas"); c.width = 64; c.height = 64;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#FFD700"; ctx.font = "50px Arial"; ctx.textAlign = "center";
        ctx.fillText(t.icon, 32, 50);
        const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
        icon.position.y = 3.6; icon.scale.set(1.1, 1.1, 1);
        group.add(icon);

        const label = makeLabelSprite(t.name, "#" + new THREE.Color(t.color).getHexString());
        label.position.y = 4.4;
        group.add(label);

        return group;
    }

    // ----------------------------------------------------------- World bits

    // Colour a terrain vertex by height (shared so editor + game match).
    function terrainVertexColor(level, h, out) {
        const sea = level.seaLevel;
        const c = new THREE.Color();
        const deep = new THREE.Color(0x33506b);
        const shallow = new THREE.Color(0xbcd3d8);
        const sand = new THREE.Color(0xe4c877);
        const grass = new THREE.Color(0x6b8e5f);
        const grassHi = new THREE.Color(0x8fb37a);
        const rock = new THREE.Color(0x8b8b8b);
        const snow = new THREE.Color(0xeef2f5);

        if (h < sea - 3) c.copy(deep);
        else if (h < sea - 0.6) c.copy(deep).lerp(shallow, (h - (sea - 3)) / 2.4);
        else if (h < sea + 1.2) c.copy(sand).lerp(grass, clamp((h - (sea + 0.2)) / 1.0, 0, 1));
        else if (h < 8) c.copy(grass).lerp(grassHi, clamp((h - (sea + 1.2)) / 7, 0, 1));
        else if (h < 14) c.copy(grassHi).lerp(rock, (h - 8) / 6);
        else c.copy(rock).lerp(snow, clamp((h - 14) / 6, 0, 1));

        out[0] = c.r; out[1] = c.g; out[2] = c.b;
    }

    function buildTerrainGeometry(level) {
        const g = level.grid;
        const geo = new THREE.PlaneGeometry(level.size, level.size, g, g);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const rgb = [0, 0, 0];
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            const h = sampleHeight(level, x, z);
            pos.setY(i, h);
            terrainVertexColor(level, h, rgb);
            colors[i * 3] = rgb[0]; colors[i * 3 + 1] = rgb[1]; colors[i * 3 + 2] = rgb[2];
        }
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        return geo;
    }

    let _grassTex = null;
    function grassTexture() {
        if (!_grassTex) {
            _grassTex = createNoiseTexture(256, 256, "#8FB38F", "#6B8E5F", 0.05, 7.3);
            _grassTex.wrapS = _grassTex.wrapT = THREE.RepeatWrapping;
            _grassTex.repeat.set(level0Repeat, level0Repeat);
        }
        return _grassTex;
    }
    // Keeps the shared grass texture repeat stable across differently sized levels.
    let level0Repeat = 16;

    function buildTerrainMesh(level) {
        const geo = buildTerrainGeometry(level);
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            map: grassTexture(),
            vertexColors: true,
            roughness: 0.92
        }));
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.userData.isTerrain = true;
        mesh.name = "levelTerrain";
        return mesh;
    }

    let _waterTex = null;
    function waterTexture() {
        if (!_waterTex) {
            _waterTex = createNoiseTexture(256, 256, "#2f8fae", "#1c6b88", 0.02, 4.2);
            _waterTex.wrapS = _waterTex.wrapT = THREE.RepeatWrapping;
            _waterTex.repeat.set(30, 30);
        }
        return _waterTex;
    }

    function buildWaterMesh(level) {
        const span = level.size * 3;
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(span, span),
            new THREE.MeshStandardMaterial({
                map: waterTexture(),
                color: 0x9fd8e8,
                transparent: true,
                opacity: 0.82,
                roughness: 0.18,
                metalness: 0.15
            })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = level.seaLevel;
        mesh.receiveShadow = true;
        mesh.userData.isWater = true;
        mesh.name = "levelWater";
        return mesh;
    }

    // Translucent coloured patches over tagged water so the editor can show
    // where each fishing zone is. Only cells with a non-ocean zone are drawn.
    function buildZoneOverlay(level) {
        const g = level.grid;
        const cs = cellSize(level);
        const half = level.size / 2;
        const y = level.seaLevel + 0.06;
        const positions = [];
        const colors = [];
        const indices = [];
        const col = new THREE.Color();
        let v = 0;
        for (let gz = 0; gz < g; gz++) {
            for (let gx = 0; gx < g; gx++) {
                const zid = (level.zones && level.zones[gz * g + gx]) || 0;
                if (!zid) continue;
                const x0 = -half + gx * cs, x1 = x0 + cs;
                const z0 = -half + gz * cs, z1 = z0 + cs;
                positions.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
                col.setHex(zoneInfo(zid).color);
                for (let k = 0; k < 4; k++) colors.push(col.r, col.g, col.b);
                indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
                v += 4;
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geo.setIndex(indices);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.55,
            depthWrite: false, side: THREE.DoubleSide
        }));
        mesh.position.y = 0;
        mesh.userData.isZoneOverlay = true;
        mesh.name = "levelZones";
        return mesh;
    }

    function buildOceanFloorMesh(level) {
        const span = level.size * 4;
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(span, span),
            new THREE.MeshStandardMaterial({ color: 0x18324a, roughness: 1 })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = level.oceanFloor - 2;
        mesh.receiveShadow = true;
        mesh.userData.isOceanFloor = true;
        return mesh;
    }

    // Spawn the level's trees + rocks into a scene.
    // out = { trees: [], colliders: [] } (arrays are mutated, matching the game)
    function addLevelProps(scene, level, out) {
        out = out || { trees: [], colliders: [] };
        (level.trees || []).forEach((data) => {
            const y = sampleHeight(level, data.x, data.z);
            const t = makeTree(data);
            t.position.set(data.x, y, data.z);
            scene.add(t);
            out.trees.push(t);
            out.colliders.push({ x: data.x, z: data.z, radius: 1.5 * (data.scale || 1) });
        });
        (level.rocks || []).forEach((data) => {
            const y = sampleHeight(level, data.x, data.z);
            const s = data.scale || 1;
            const r = makeRock(data);
            r.position.set(data.x, y + s * 0.3, data.z);
            scene.add(r);
            out.trees.push(r);
            if (s > 0.5) out.colliders.push({ x: data.x, z: data.z, radius: s * 0.8 });
        });
        return out;
    }

    // Full custom world build used by the game when a level is loaded.
    function buildCustomWorld(scene, level) {
        const group = new THREE.Group();
        group.name = "customLevel";

        const floor = buildOceanFloorMesh(level);
        group.add(floor);
        const terrain = buildTerrainMesh(level);
        group.add(terrain);
        const water = buildWaterMesh(level);
        group.add(water);

        scene.add(group);
        return { group: group, terrain: terrain, water: water, oceanFloor: floor };
    }

    window.WorldGen = {
        LEVEL_VERSION,
        DEFAULT_SIZE, DEFAULT_GRID,
        clamp, lerp,
        createNoiseTexture, createLeafTexture,
        createRockMesh, createDetailedTree, createFlowerMesh,
        makeTree, makeRock,
        NPC_TYPES, npcType, makeNpcPreview, makeLabelSprite,
        terrainVertexColor,
        buildTerrainGeometry, buildTerrainMesh, buildWaterMesh, buildOceanFloorMesh,
        buildZoneOverlay,
        addLevelProps, buildCustomWorld,
        ZONES, zoneInfo, zoneIdByKey, zoneAt, countZoneWater, autoZones
    };

    window.Level = {
        LEVEL_VERSION,
        createDefault, normalize, serialize,
        cellSize, cellCenter, worldToCell, inBounds,
        sampleHeight, isWater, countLand, spawnPoint,
        ZONES, zoneInfo, zoneIdByKey, zoneAt, countZoneWater, autoZones
    };
})();
