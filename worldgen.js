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
//   npcs:  [{type,x,z,rot}],
//   buildings: [{type,x,z,rot,scale}],  // scenery (hut, house, lighthouse, ...)
//   props:     [{type,x,z,rot,scale}],  // small decor (barrel, bench, reeds, ...)
//   caves:     [{size,x,z,rot}]         // cave entrances: small/medium/large/huge
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
        out.buildings = Array.isArray(out.buildings) ? out.buildings.filter(validObj).map(normBuilding).slice(0, 400) : [];
        out.props = Array.isArray(out.props) ? out.props.filter(validObj).map(normProp).slice(0, 2500) : [];
        out.caves = Array.isArray(out.caves) ? out.caves.filter(validObj).map(normCave).slice(0, 60) : [];
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
    function normBuilding(b) {
        return { type: String(b.type || "hut").slice(0, 24), x: +b.x, z: +b.z, rot: Number(b.rot) || 0, scale: clamp(Number(b.scale) || 1, 0.5, 4) };
    }
    function normProp(p) {
        return { type: String(p.type || "bush").slice(0, 24), x: +p.x, z: +p.z, rot: Number(p.rot) || 0, scale: clamp(Number(p.scale) || 1, 0.4, 4) };
    }
    function normCave(c) {
        return { size: CAVE_BY_ID[String(c.size)] ? String(c.size) : "medium", x: +c.x, z: +c.z, rot: Number(c.rot) || 0 };
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
            buildings: lv.buildings,
            props: lv.props,
            caves: lv.caves,
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

    // ------------------------------------------------- Scenery catalogs
    // Buildings, small props and cave entrances dress a level. Every entry
    // carries a collider radius (0 = walk-through decor) and an optional
    // `water` flag that lets the editor place it on the sea surface instead
    // of requiring dry land.

    const BUILDING_TYPES = [
        { id: "hut", name: "Straw Hut", radius: 3.8, color: 0xE0BE8C },
        { id: "house", name: "House", radius: 3.7, color: 0xF2E8D5 },
        { id: "cabin", name: "Log Cabin", radius: 3.6, color: 0x8A5A33 },
        { id: "shed", name: "Shed", radius: 2.4, color: 0x9C7A4F },
        { id: "lighthouse", name: "Lighthouse", radius: 2.7, color: 0xC8503C },
        { id: "windmill", name: "Windmill", radius: 3.3, color: 0xE6D8B8 },
        { id: "tower", name: "Watchtower", radius: 2.7, color: 0x6B4A2F },
        { id: "stall", name: "Market Stall", radius: 2.9, color: 0xE0A03A },
        { id: "temple", name: "Temple Ruins", radius: 4.1, color: 0xD6D2C4 },
        { id: "dock", name: "Wooden Dock", radius: 2.6, water: true, color: 0xA97B4F }
    ];

    const PROP_TYPES = [
        { id: "bush", name: "Bush", radius: 0, color: 0x4E7A3D },
        { id: "flowers", name: "Flowers", radius: 0, color: 0xE86A8A },
        { id: "reeds", name: "Reeds", radius: 0, water: true, color: 0x7CA84E },
        { id: "bamboo", name: "Bamboo", radius: 0, color: 0x8FB84E },
        { id: "mushrooms", name: "Mushrooms", radius: 0, color: 0xC8503C },
        { id: "barrel", name: "Barrel", radius: 0.5, color: 0x8A5A33 },
        { id: "crate", name: "Crate", radius: 0.5, color: 0xB08A55 },
        { id: "bench", name: "Log Bench", radius: 0.8, color: 0xA97B4F },
        { id: "lamp", name: "Lamp Post", radius: 0.35, color: 0xFFE9A8 },
        { id: "sign", name: "Signpost", radius: 0.35, color: 0xB08A55 },
        { id: "fence", name: "Fence", radius: 0.3, color: 0x8A5A33 },
        { id: "campfire", name: "Campfire", radius: 0.6, color: 0xFF6A1F },
        { id: "totem", name: "Totem Pole", radius: 0.5, color: 0x3FA0A8 },
        { id: "gravestone", name: "Gravestone", radius: 0.35, color: 0xB0B0BA },
        { id: "scarecrow", name: "Scarecrow", radius: 0.4, color: 0xD9B26A },
        { id: "torch", name: "Torch", radius: 0.25, color: 0xFF8A1F },
        { id: "boat", name: "Rowboat", radius: 0, water: true, color: 0xA97B4F },
        { id: "umbrella", name: "Beach Umbrella", radius: 0.2, color: 0xE05A4A }
    ];

    const CAVE_SIZES = [
        { id: "small", name: "Small", radius: 2.2, color: 0x7E7A72 },
        { id: "medium", name: "Medium", radius: 3.4, color: 0x7E7A72 },
        { id: "large", name: "Large", radius: 4.8, color: 0x7E7A72 },
        { id: "huge", name: "Huge", radius: 6.5, color: 0x7E7A72 }
    ];

    const BUILDING_BY_ID = {}; BUILDING_TYPES.forEach((t) => { BUILDING_BY_ID[t.id] = t; });
    const PROP_BY_ID = {}; PROP_TYPES.forEach((t) => { PROP_BY_ID[t.id] = t; });
    const CAVE_BY_ID = {}; CAVE_SIZES.forEach((t) => { CAVE_BY_ID[t.id] = t; });
    const buildingInfo = (id) => BUILDING_BY_ID[id] || BUILDING_TYPES[0];
    const propInfo = (id) => PROP_BY_ID[id] || PROP_TYPES[0];
    const caveInfo = (id) => CAVE_BY_ID[id] || CAVE_SIZES[1];

    // Base height for a placed item. Water-friendly scenery (docks, boats,
    // reeds) floats on the sea surface instead of sinking to the seabed.
    function propBaseY(level, x, z, waterOk) {
        const h = sampleHeight(level, x, z);
        return (waterOk && h < level.seaLevel - 0.01) ? level.seaLevel : h;
    }

    // --------------------------------------------------- Scenery builders
    // Flat-shaded low-poly models shared by the editor preview and the game.
    // Materials are cached by colour+options: a level can hold thousands of
    // props and sharing keeps memory sane.
    const _matCache = new Map();
    function mMat(color, opts) {
        const key = color + "|" + JSON.stringify(opts || null);
        let m = _matCache.get(key);
        if (!m) {
            m = new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.9, flatShading: true }, opts || {}));
            _matCache.set(key, m);
        }
        return m;
    }
    function mBox(w, h, d, color, opts) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mMat(color, opts)); }
    function mCyl(rt, rb, h, seg, color, opts) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 8), mMat(color, opts)); }
    function mCone(r, h, seg, color, opts) { return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 8), mMat(color, opts)); }
    function mBlob(r, color, sy) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mMat(color));
        if (sy) m.scale.y = sy;
        return m;
    }
    function at(m, x, y, z) { m.position.set(x || 0, y || 0, z || 0); return m; }
    function shade(g) {
        g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        return g;
    }

    function makeBuilding(data) {
        const g = new THREE.Group();
        g.userData.propKind = "building";
        g.userData.buildingType = data.type;
        switch (String(data.type)) {
            case "house": {
                // 6.6 x 4.6 x 5.6 body: the player is ~2.9 tall, so the 2.8-tall
                // door matches them and the walls clear their head.
                g.add(at(mBox(6.6, 4.6, 5.6, 0xF2E8D5), 0, 2.3, 0));
                const roof = mCone(5.4, 3.2, 4, 0xB8503C);
                roof.rotation.y = Math.PI / 4;
                roof.position.y = 6.2;
                g.add(roof);
                g.add(at(mBox(1.6, 2.8, 0.35, 0x7A4A2A), 0, 1.4, 2.92));
                g.add(at(mBox(1.3, 1.3, 0.25, 0x9FD9FF), -2.1, 3.2, 2.92));
                g.add(at(mBox(1.3, 1.3, 0.25, 0x9FD9FF), 2.1, 3.2, 2.92));
                g.add(at(mBox(0.9, 7.0, 0.9, 0x8E8E96), 2.4, 3.5, -1.7));
                g.add(at(mBox(1.15, 0.3, 1.15, 0x5A5A62), 2.4, 7.15, -1.7));
                break;
            }
            case "cabin": {
                // Full log walls: four logs per row (all four walls), with the
                // overhanging pair alternating row to row like real notched logs.
                const logLong = new THREE.CylinderGeometry(0.3, 0.3, 6.4, 8);
                const logShort = new THREE.CylinderGeometry(0.3, 0.3, 5.8, 8);
                for (let i = 0; i < 6; i++) {
                    const y = 0.55 + i * 0.58;
                    const sideLong = i % 2 === 0;
                    // Side walls: logs running along Z at x = ±2.6
                    [-2.6, 2.6].forEach((off) => {
                        const l = new THREE.Mesh(sideLong ? logLong : logShort, mMat(0x8A5A33));
                        l.rotation.x = Math.PI / 2;
                        l.position.set(off, y, 0);
                        g.add(l);
                    });
                    // Front/back walls: logs running along X at z = ±2.6
                    [-2.6, 2.6].forEach((off) => {
                        const l = new THREE.Mesh(sideLong ? logShort : logLong, mMat(0x8A5A33));
                        l.rotation.z = Math.PI / 2;
                        l.position.set(0, y, off);
                        g.add(l);
                    });
                }
                // Gable roof: two panels meeting on the ridge at z=0, y≈5.5
                const p1 = at(mBox(7.2, 0.22, 3.5, 0x5C3A22), 0, 4.35, -1.35); p1.rotation.x = -0.72; g.add(p1);
                const p2 = at(mBox(7.2, 0.22, 3.5, 0x5C3A22), 0, 4.35, 1.35); p2.rotation.x = 0.72; g.add(p2);
                g.add(at(mBox(7.3, 0.25, 0.55, 0x4A3A28), 0, 5.5, 0));
                // Gable-end triangles close the wall-to-roof gap at x = ±2.6
                const gab = new THREE.Shape();
                gab.moveTo(-1.95, 0); gab.lineTo(1.95, 0); gab.lineTo(0, 1.7); gab.closePath();
                const gabGeo = new THREE.ExtrudeGeometry(gab, { depth: 0.35, bevelEnabled: false });
                [1, -1].forEach((sx) => {
                    const m = new THREE.Mesh(gabGeo, mMat(0x6B4A2F, { side: THREE.DoubleSide }));
                    m.rotation.y = sx * Math.PI / 2;
                    m.position.set(sx * 2.6, 3.75, 0);
                    g.add(m);
                });
                // Recessed dark opening + proud door slab, frame, windows
                g.add(at(mBox(1.8, 2.8, 0.32, 0x2A1D12), 0, 1.4, 2.82));
                g.add(at(mBox(1.35, 2.5, 0.12, 0x9C7A4F), 0, 1.27, 3.04));
                g.add(at(mBox(0.1, 0.1, 0.08, 0x2A1D12), 0.45, 1.3, 3.14));
                g.add(at(mBox(0.9, 1.1, 0.22, 0x9FD9FF), -1.7, 2.35, 2.90));
                g.add(at(mBox(0.9, 1.1, 0.22, 0x9FD9FF), 1.7, 2.35, 2.90));
                // Stone chimney through the roof
                g.add(at(mBox(0.85, 6.9, 0.85, 0x8E8E96), 2.1, 3.45, -1.0));
                g.add(at(mBox(1.1, 0.28, 1.1, 0x5A5A62), 2.1, 7.04, -1.0));
                break;
            }
            case "shed": {
                g.add(at(mBox(4.0, 3.0, 3.4, 0x9C7A4F), 0, 1.5, 0));
                const roof = at(mBox(4.7, 0.28, 4.1, 0x4F5D46), 0, 3.2, 0);
                roof.rotation.x = -0.16;
                g.add(roof);
                g.add(at(mBox(1.4, 2.4, 0.3, 0x6B4A2F), 0, 1.2, 1.75));
                break;
            }
            case "lighthouse": {
                g.add(at(mCyl(1.5, 2.3, 10, 12, 0xF4F1E8), 0, 5, 0));
                g.add(at(mCyl(2.25, 2.35, 1.6, 12, 0xC8503C), 0, 3.0, 0));
                g.add(at(mCyl(1.85, 1.95, 1.6, 12, 0xC8503C), 0, 7.8, 0));
                g.add(at(mCyl(2.1, 2.1, 0.35, 12, 0x3A3F52), 0, 10.2, 0));
                g.add(at(mCyl(1.2, 1.2, 1.5, 10, 0xFFE9A8, { emissive: 0xF2C14E }), 0, 11.1, 0));
                g.add(at(mCone(1.7, 1.4, 12, 0xC8503C), 0, 12.6, 0));
                g.add(at(mBox(1.2, 2.0, 0.35, 0x3A3F52), 0, 1.0, 2.3));
                break;
            }
            case "windmill": {
                g.add(at(mCyl(1.9, 2.9, 8, 10, 0xE6D8B8), 0, 4, 0));
                g.add(at(mCone(2.4, 1.8, 10, 0x7A4A2A), 0, 8.9, 0));
                const blades = new THREE.Group();
                blades.position.set(0, 5.5, 3.0);
                for (let i = 0; i < 4; i++) {
                    const pivot = new THREE.Group();
                    pivot.rotation.z = i * Math.PI / 2 + Math.PI / 4;
                    pivot.add(at(mBox(0.6, 5.6, 0.16, 0xEDE6D2), 0, 3.0, 0));
                    blades.add(pivot);
                }
                const hub = mCyl(0.42, 0.42, 1.6, 6, 0x5C3A22);
                hub.rotation.x = Math.PI / 2;
                blades.add(hub);
                g.add(blades);
                g.add(at(mBox(1.3, 2.2, 0.4, 0x7A4A2A), 0, 1.1, 2.75));
                break;
            }
            case "tower": {
                [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]].forEach((p) => {
                    g.add(at(mBox(0.4, 6.0, 0.4, 0x6B4A2F), p[0], 3.0, p[1]));
                });
                g.add(at(mBox(4.6, 0.4, 4.6, 0x8A5A33), 0, 6.2, 0));
                g.add(at(mBox(4.6, 0.9, 0.16, 0x5C3A22), 0, 6.85, -2.2));
                g.add(at(mBox(4.6, 0.9, 0.16, 0x5C3A22), 0, 6.85, 2.2));
                g.add(at(mBox(0.16, 0.9, 4.6, 0x5C3A22), -2.2, 6.85, 0));
                g.add(at(mBox(0.16, 0.9, 4.6, 0x5C3A22), 2.2, 6.85, 0));
                [[-2.1, -2.1], [2.1, -2.1], [-2.1, 2.1], [2.1, 2.1]].forEach((p) => {
                    g.add(at(mBox(0.22, 2.0, 0.22, 0x6B4A2F), p[0], 7.0, p[1]));
                });
                const roof = mCone(3.6, 2.4, 4, 0x4F5D46);
                roof.rotation.y = Math.PI / 4;
                roof.position.y = 9.2;
                g.add(roof);
                break;
            }
            case "stall": {
                [[-2.1, -1.3], [2.1, -1.3], [-2.1, 1.3], [2.1, 1.3]].forEach((p) => {
                    g.add(at(mCyl(0.16, 0.16, 3.6, 6, 0x8A5A33), p[0], 1.8, p[1]));
                });
                g.add(at(mBox(4.6, 1.2, 2.6, 0x8A5A33), 0, 0.6, 0));
                g.add(at(mBox(5.0, 0.2, 3.0, 0xD9B26A), 0, 1.3, 0));
                const awning = new THREE.Group();
                awning.position.set(0, 3.7, 0);
                awning.rotation.x = -0.1;
                awning.add(at(mBox(5.4, 0.2, 3.6, 0xC8503C), 0, 0, 0));
                [-1.8, 0, 1.8].forEach((x) => { awning.add(at(mBox(0.9, 0.07, 3.66, 0xF2E8D5), x, 0.12, 0)); });
                g.add(awning);
                g.add(at(mBox(0.8, 0.7, 0.8, 0xE0A03A), -1.2, 1.75, 0.5));
                g.add(at(mBox(0.7, 0.6, 0.7, 0x6FB54A), 1.1, 1.7, 0.6));
                break;
            }
            case "temple": {
                g.add(at(mBox(7.4, 0.7, 6.0, 0xB9B4A8), 0, 0.35, 0));
                [[-2.9, -2.2, 4.2], [2.9, -2.2, 4.2], [-2.9, 2.2, 3.8], [2.9, 2.2, 1.5]].forEach((c) => {
                    g.add(at(mCyl(0.55, 0.62, c[2], 10, 0xD6D2C4), c[0], 0.7 + c[2] / 2, c[1]));
                });
                // Intact lintel across the front pair; broken stub on the rear stump
                g.add(at(mBox(6.8, 0.75, 1.6, 0xC9C4B4), 0, 5.275, -2.2));
                g.add(at(mBox(2.6, 0.7, 1.5, 0xC9C4B4), -1.7, 4.85, 2.2));
                const fallen = mCyl(0.55, 0.55, 3.2, 10, 0xD6D2C4);
                fallen.rotation.z = Math.PI / 2;
                fallen.position.set(0.5, 1.2, -0.2);
                g.add(fallen);
                break;
            }
            case "dock": {
                g.add(at(mBox(3.4, 0.3, 8.0, 0xA97B4F), 0, 0.55, 0));
                [-3.0, -1.5, 0, 1.5, 3.0].forEach((z) => { g.add(at(mBox(3.44, 0.05, 0.2, 0x8A5A33), 0, 0.72, z)); });
                [[-1.4, -3.4], [1.4, -3.4], [-1.4, 3.4], [1.4, 3.4]].forEach((p) => {
                    g.add(at(mCyl(0.22, 0.22, 6.6, 8, 0x6B4A2F), p[0], -2.0, p[1]));
                    g.add(at(mCyl(0.28, 0.28, 0.3, 8, 0x8A5A33), p[0], 1.45, p[1]));
                });
                break;
            }
            default: {
                // Straw hut (also the fallback for unknown types).
                g.add(at(mCyl(3.0, 3.4, 3.0, 10, 0xE0BE8C), 0, 1.5, 0));
                g.add(at(mCone(4.4, 3.6, 10, 0xC7A34A), 0, 4.8, 0));
                g.add(at(mBox(1.4, 2.6, 0.5, 0x6B4A2F), 0, 1.3, 3.25));
                break;
            }
        }
        const s = clamp(Number(data.scale) || 1, 0.5, 4);
        g.scale.set(s, s, s);
        g.rotation.y = Number(data.rot) || 0;
        return shade(g);
    }

    function makeProp(data) {
        const g = new THREE.Group();
        g.userData.propKind = "prop";
        g.userData.propType = data.type;
        switch (String(data.type)) {
            case "bush": {
                g.add(at(mBlob(0.55, 0x4E7A3D, 0.8), 0, 0.38, 0));
                g.add(at(mBlob(0.38, 0x5C8A46, 0.85), 0.32, 0.3, 0.18));
                break;
            }
            case "flowers": {
                [[0xE86A8A, -0.3, 0, 0.25], [0xF2C14E, 0.25, 0.1, 0.5], [0x9B7ED9, 0, -0.3, 0.4]].forEach((f) => {
                    g.add(at(mCyl(0.02, 0.02, f[3], 4, 0x5C8A46), f[1], f[3] / 2, f[2]));
                    g.add(at(mBlob(0.1, f[0]), f[1], f[3] + 0.05, f[2]));
                });
                break;
            }
            case "reeds": {
                [[-0.35, 0.2, 1.5], [0, -0.15, 1.9], [0.3, 0.1, 1.6], [0.15, 0.35, 1.3], [-0.15, -0.3, 1.7]].forEach((r, i) => {
                    const reed = mCyl(0.03, 0.04, r[2], 4, 0x7CA84E);
                    reed.rotation.z = (i % 2 ? 0.08 : -0.08);
                    g.add(at(reed, r[0], r[2] / 2, r[1]));
                    if (i < 2) g.add(at(mCyl(0.06, 0.06, 0.3, 5, 0x6B4A2F), r[0], r[2] - 0.1, r[1]));
                });
                break;
            }
            case "bamboo": {
                [[-0.3, 0.1, 2.6], [0.1, -0.15, 2.2], [0.3, 0.25, 2.9], [-0.05, 0.3, 2.0]].forEach((b, i) => {
                    g.add(at(mCyl(0.06, 0.06, b[2], 5, 0x8FB84E), b[0], b[2] / 2, b[1]));
                    g.add(at(mBox(0.3, 0.06, 0.14, 0x6F9B3E), b[0] + 0.12, b[2] - 0.4 - i * 0.1, b[1]));
                });
                break;
            }
            case "mushrooms": {
                [[0xC8503C, -0.25, 0, 1], [0xE0A03A, 0.2, 0.15, 0.75], [0xC8503C, 0.05, -0.25, 0.6]].forEach((m) => {
                    const h = 0.26 * m[3];
                    g.add(at(mCyl(0.045, 0.055, h, 5, 0xEDE6D2), m[1], h / 2, m[2]));
                    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15 * m[3], 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mMat(m[0]));
                    g.add(at(cap, m[1], h, m[2]));
                });
                break;
            }
            case "barrel": {
                g.add(at(mCyl(0.35, 0.42, 0.85, 10, 0x8A5A33), 0, 0.42, 0));
                g.add(at(mCyl(0.43, 0.43, 0.07, 10, 0x4A4E5C), 0, 0.2, 0));
                g.add(at(mCyl(0.38, 0.38, 0.07, 10, 0x4A4E5C), 0, 0.66, 0));
                g.add(at(mCyl(0.34, 0.34, 0.05, 10, 0x6B4A2F), 0, 0.86, 0));
                break;
            }
            case "crate": {
                g.add(at(mBox(0.72, 0.72, 0.72, 0xB08A55), 0, 0.36, 0));
                const b1 = at(mBox(0.78, 0.09, 0.04, 0x8A5A33), 0, 0.36, 0.37); b1.rotation.z = 0.78; g.add(b1);
                const b2 = at(mBox(0.78, 0.09, 0.04, 0x8A5A33), 0, 0.36, 0.37); b2.rotation.z = -0.78; g.add(b2);
                break;
            }
            case "bench": {
                const seat = mCyl(0.2, 0.2, 1.9, 8, 0x8A5A33);
                seat.rotation.z = Math.PI / 2;
                seat.position.set(0, 0.45, 0);
                g.add(seat);
                g.add(at(mBox(0.16, 0.45, 0.4, 0x6B4A2F), -0.7, 0.22, 0));
                g.add(at(mBox(0.16, 0.45, 0.4, 0x6B4A2F), 0.7, 0.22, 0));
                g.add(at(mBox(1.9, 0.32, 0.1, 0x8A5A33), 0, 0.85, -0.24));
                g.add(at(mBox(0.1, 0.42, 0.1, 0x6B4A2F), -0.7, 0.65, -0.22));
                g.add(at(mBox(0.1, 0.42, 0.1, 0x6B4A2F), 0.7, 0.65, -0.22));
                break;
            }
            case "lamp": {
                g.add(at(mCyl(0.16, 0.2, 0.16, 6, 0x3A3F52), 0, 0.08, 0));
                g.add(at(mCyl(0.06, 0.09, 2.5, 6, 0x3A3F52), 0, 1.33, 0));
                g.add(at(mBox(0.36, 0.42, 0.36, 0xFFE9A8, { emissive: 0xF2A13A }), 0, 2.78, 0));
                g.add(at(mCone(0.32, 0.22, 4, 0x3A3F52), 0, 3.1, 0));
                break;
            }
            case "sign": {
                g.add(at(mCyl(0.07, 0.08, 1.5, 5, 0x8A5A33), 0, 0.75, 0));
                g.add(at(mBox(0.95, 0.5, 0.08, 0xB08A55), 0, 1.32, 0));
                g.add(at(mBox(0.6, 0.06, 0.1, 0x8A5A33), 0, 1.32, 0.02));
                break;
            }
            case "fence": {
                g.add(at(mBox(0.13, 1.0, 0.13, 0x8A5A33), -0.75, 0.5, 0));
                g.add(at(mBox(0.13, 1.0, 0.13, 0x8A5A33), 0.75, 0.5, 0));
                g.add(at(mBox(1.65, 0.1, 0.07, 0xA97B4F), 0, 0.38, 0));
                g.add(at(mBox(1.65, 0.1, 0.07, 0xA97B4F), 0, 0.75, 0));
                break;
            }
            case "campfire": {
                [[0.5, 0], [0.35, 2.1], [0.42, 3.9], [0.5, 5.1]].forEach((s) => {
                    g.add(at(mBlob(0.16, 0x8E8E96), Math.cos(s[1]) * s[0], 0.1, Math.sin(s[1]) * s[0]));
                });
                for (let i = 0; i < 3; i++) {
                    const log = mCyl(0.08, 0.08, 0.95, 5, 0x6B4A2F);
                    log.rotation.z = Math.PI / 2;
                    log.rotation.y = i * Math.PI / 3;
                    log.position.y = 0.14;
                    g.add(log);
                }
                g.add(at(mCone(0.3, 0.75, 6, 0xFF6A1F, { emissive: 0xCC3300 }), 0, 0.55, 0));
                g.add(at(mCone(0.16, 0.5, 6, 0xFFD34D, { emissive: 0xE0A03A }), 0, 0.48, 0));
                break;
            }
            case "totem": {
                g.add(at(mBox(0.6, 0.65, 0.6, 0xC8503C), 0, 0.33, 0));
                g.add(at(mBox(0.56, 0.6, 0.56, 0x3FA0A8), 0, 0.95, 0));
                g.add(at(mBox(0.6, 0.55, 0.6, 0xE0A03A), 0, 1.53, 0));
                g.add(at(mBox(0.1, 0.12, 0.06, 0xF2E8D5), -0.14, 1.58, 0.31));
                g.add(at(mBox(0.1, 0.12, 0.06, 0xF2E8D5), 0.14, 1.58, 0.31));
                const hat = mCone(0.42, 0.3, 4, 0x6B4A2F);
                hat.rotation.y = Math.PI / 4;
                g.add(at(hat, 0, 1.95, 0));
                break;
            }
            case "gravestone": {
                g.add(at(mBox(0.62, 0.12, 0.38, 0x8E8E96), 0, 0.06, 0));
                g.add(at(mBox(0.5, 0.72, 0.18, 0xB0B0BA), 0, 0.48, 0));
                const top = mCyl(0.25, 0.25, 0.18, 8, 0xB0B0BA);
                top.rotation.x = Math.PI / 2;
                top.position.set(0, 0.84, 0);
                g.add(top);
                break;
            }
            case "scarecrow": {
                g.add(at(mCyl(0.06, 0.07, 2.0, 5, 0x6B4A2F), 0, 1.0, 0));
                const arms = mCyl(0.05, 0.05, 1.3, 5, 0x6B4A2F);
                arms.rotation.z = Math.PI / 2;
                arms.position.set(0, 1.5, 0);
                g.add(arms);
                g.add(at(mBox(0.55, 0.65, 0.32, 0x9FD9FF), 0, 1.35, 0));
                g.add(at(mBlob(0.24, 0xD9B26A), 0, 1.95, 0));
                g.add(at(mCone(0.44, 0.35, 8, 0x8A5A33), 0, 2.25, 0));
                break;
            }
            case "torch": {
                g.add(at(mCyl(0.05, 0.06, 1.6, 5, 0x6B4A2F), 0, 0.8, 0));
                g.add(at(mCyl(0.09, 0.09, 0.28, 6, 0x4A3A28), 0, 1.55, 0));
                g.add(at(mCone(0.17, 0.55, 6, 0xFF8A1F, { emissive: 0xCC5500 }), 0, 1.95, 0));
                break;
            }
            case "boat": {
                g.add(at(mBox(0.95, 0.12, 2.5, 0xA97B4F), 0, 0.08, 0));
                const sideL = at(mBox(0.1, 0.5, 2.5, 0x8A5A33), -0.48, 0.32, 0); sideL.rotation.z = 0.14; g.add(sideL);
                const sideR = at(mBox(0.1, 0.5, 2.5, 0x8A5A33), 0.48, 0.32, 0); sideR.rotation.z = -0.14; g.add(sideR);
                g.add(at(mBox(0.95, 0.45, 0.12, 0x8A5A33), 0, 0.3, 1.25));
                g.add(at(mBox(0.95, 0.45, 0.12, 0x8A5A33), 0, 0.3, -1.25));
                g.add(at(mBox(0.85, 0.08, 0.3, 0xD9B26A), 0, 0.3, 0.1));
                break;
            }
            case "umbrella": {
                g.add(at(mCyl(0.2, 0.24, 0.1, 8, 0xB0B0BA), 0, 0.05, 0));
                const pole = mCyl(0.045, 0.045, 2.3, 5, 0xEDE6D2);
                pole.rotation.z = 0.1;
                pole.position.set(0.115, 1.2, 0);
                g.add(pole);
                g.add(at(mCone(1.35, 0.6, 8, 0xE05A4A), 0, 2.5, 0));
                g.add(at(mCone(0.75, 0.28, 8, 0xF2E8D5), 0, 2.64, 0));
                break;
            }
            default: {
                g.add(at(mBox(0.5, 0.5, 0.5, 0xB9B4A8), 0, 0.25, 0));
                break;
            }
        }
        const s = clamp(Number(data.scale) || 1, 0.4, 4);
        g.scale.set(s, s, s);
        g.rotation.y = Number(data.rot) || 0;
        return shade(g);
    }

    function makeCave(data) {
        const info = caveInfo(String(data.size || "medium"));
        const r = info.radius;
        const g = new THREE.Group();
        g.userData.propKind = "cave";
        g.userData.caveSize = info.id;
        // Flattened rocky mound; the mouth assembly pokes out the +Z face so
        // the black interior stays visible from the front.
        const mound = mBlob(r, 0x7E7A72);
        mound.scale.set(1, 0.72, 0.62);
        g.add(at(mound, 0, r * 0.18, -r * 0.1));
        g.add(at(mBlob(r * 0.62, 0x767268, 0.8), r * 0.55, r * 0.1, -r * 0.45));
        g.add(at(mBlob(r * 0.5, 0x86827A, 0.75), -r * 0.6, r * 0.06, -r * 0.3));
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(r * 0.86, r * 0.78, r * 0.3), new THREE.MeshBasicMaterial({ color: 0x0a0a0f }));
        mouth.position.set(0, r * 0.36, r * 0.5);
        g.add(mouth);
        g.add(at(mBox(r * 0.3, r * 0.82, r * 0.4, 0x6E6A62), -r * 0.44, r * 0.38, r * 0.55));
        g.add(at(mBox(r * 0.3, r * 0.82, r * 0.4, 0x6E6A62), r * 0.44, r * 0.38, r * 0.55));
        g.add(at(mBox(r * 1.14, r * 0.3, r * 0.42, 0x6E6A62), 0, r * 0.82, r * 0.53));
        g.add(at(mBlob(r * 0.22, 0x86827A), -r * 0.7, r * 0.08, r * 0.55));
        g.add(at(mBlob(r * 0.16, 0x767268), r * 0.75, r * 0.06, r * 0.45));
        g.rotation.y = Number(data.rot) || 0;
        return shade(g);
    }

    // Spawn the level's trees, rocks, buildings, props and cave entrances into
    // a scene. Trees/rocks still join `out.trees` (the game chops and mines
    // those by raycast) while scenery goes into its own group so it can never
    // be chopped and can be cleared from the scene with a single remove().
    // out = { trees: [], colliders: [], decor: THREE.Group }
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
        const decor = new THREE.Group();
        decor.name = "levelDecor";
        (level.buildings || []).forEach((data) => {
            const info = buildingInfo(data.type);
            const y = propBaseY(level, data.x, data.z, info.water);
            const m = makeBuilding(data);
            m.position.set(data.x, y, data.z);
            decor.add(m);
            const cr = info.radius * (data.scale || 1);
            if (cr > 0.2) out.colliders.push({ x: data.x, z: data.z, radius: cr });
        });
        (level.props || []).forEach((data) => {
            const info = propInfo(data.type);
            const h = sampleHeight(level, data.x, data.z);
            // Float water props a touch below the surface so they read as
            // resting in the water rather than hovering on it.
            const y = (info.water && h < level.seaLevel - 0.01) ? level.seaLevel - 0.08 : h;
            const m = makeProp(data);
            m.position.set(data.x, y, data.z);
            decor.add(m);
            const cr = info.radius * (data.scale || 1);
            if (cr > 0.05) out.colliders.push({ x: data.x, z: data.z, radius: cr });
        });
        (level.caves || []).forEach((data) => {
            const m = makeCave(data);
            m.position.set(data.x, sampleHeight(level, data.x, data.z), data.z);
            decor.add(m);
            out.colliders.push({ x: data.x, z: data.z, radius: caveInfo(data.size).radius * 0.62 });
        });
        if (decor.children.length) scene.add(decor);
        out.decor = decor;
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
        BUILDING_TYPES, PROP_TYPES, CAVE_SIZES,
        buildingInfo, propInfo, caveInfo,
        makeBuilding, makeProp, makeCave,
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
        sampleHeight, isWater, countLand, spawnPoint, propBaseY,
        ZONES, zoneInfo, zoneIdByKey, zoneAt, countZoneWater, autoZones
    };
})();
