// ocean.js — procedurally generated islands in the open ocean.
//
// The home island (radius ISLAND_RADIUS) sits in a large but finite ocean
// (radius WORLD_RADIUS, defined in fish.js). This module lays out a fixed,
// deterministic scatter of smaller islands in that ocean so sailing out has a
// destination. Everything here is seeded, so every client in a session sees the
// same archipelago without any networking.
//
// Two things are exported:
//   * `layout()`        — the island list + a cheap `heightAt(x, z)` query.
//   * `build(scene)`    — the matching low-poly meshes + collider data.
//
// The height query is deliberately pure maths (no mesh lookups) so the movement
// loop and terrain builder can both call it every frame cheaply.

(function () {
    "use strict";

    // --- Seeded RNG (same primitives the rest of the game uses) ---
    function mulberry32(a) {
        return function () {
            let t = (a += 0x6D2B79F5);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function xmur3(str) {
        let h = 1779033703 ^ str.length;
        for (let i = 0; i < str.length; i++) {
            h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
            h = (h << 13) | (h >>> 19);
        }
        return function () {
            h = Math.imul(h ^ (h >>> 16), 2246822507);
            h = Math.imul(h ^ (h >>> 13), 3266489909);
            return (h ^= h >>> 16) >>> 0;
        };
    }

    const SEED = "open-ocean-archipelago-v3";

    // Tunables. Radii are in world units; heights are in the same space as
    // getTerrainHeight (0 = shore, island hills go up to ~14).
    // Much wider spread: tiny skerries, mid islands, massive landmarks, and everything in between.
    const ISLAND_COUNT = 38;      // more islands for a busier archipelago
    const MIN_RADIUS = 4;         // tiniest rock skerry
    const MAX_RADIUS = 95;        // massive landmark island
    const MIN_PEAK = 1.2;         // nearly flat atolls
    const MAX_PEAK = 13.5;        // jagged spires
    const MIN_SEPARATION = 26;    // tighter packing for more variety
    // Larger islands are rarer but we want some huge ones.
    const LANDMARK_RADIUS = 55;

    // The home island + the two special worlds must stay clear of navigation,
    // so keep a wide exclusion ring around the origin.
    function ringFor() {
        const islandR = (typeof ISLAND_RADIUS === "number") ? ISLAND_RADIUS : 120;
        const worldR = (typeof WORLD_RADIUS === "number") ? WORLD_RADIUS : 1000;
        const margin = (typeof OCEAN_ISLAND_MARGIN === "number") ? OCEAN_ISLAND_MARGIN : 90;
        const gap = (typeof OCEAN_ISLAND_MIN_GAP === "number") ? OCEAN_ISLAND_MIN_GAP : 70;
        return {
            inner: islandR + gap,          // start beyond a clear band of water
            outer: worldR - margin,        // stay off the hard wall
            worldR
        };
    }

    let _layout = null;

    // Deterministic island list. Cached after first call.
    function layout() {
        if (_layout) return _layout;

        const ring = ringFor();
        const rand = mulberry32(xmur3(SEED)());
        const islands = [];

        // Radius roll, biased small so big islands feel special: squaring a
        // uniform roll weights the low end. Landmarks are not placed here — they
        // get an explicit pass first (below) so they can claim the roomy spots.
        const rollRadius = () => MIN_RADIUS + (rand() * rand()) * (MAX_RADIUS - MIN_RADIUS);

        // A shared placer: tries to drop an island of `radius`, rejecting spots
        // that overlap the ring edge or another island. Bounded attempts.
        const tryPlace = (radius, isLandmark) => {
            let attempts = 0;
            const maxAttempts = 200;
            while (attempts < maxAttempts) {
                attempts++;

                // Pick a point in the ring, biased outward so we don't crowd the
                // home island's shoreline.
                const angle = rand() * Math.PI * 2;
                const t = Math.pow(rand(), 0.7); // push toward the outer edge
                const dist = ring.inner + t * (ring.outer - ring.inner);
                const x = Math.cos(angle) * dist;
                const z = Math.sin(angle) * dist;

                // Keep every island fully inside the sailable ring. Landmarks
                // get extra clearance from the home island.
                const innerPad = isLandmark ? 20 : 0;
                if (dist + radius > ring.outer) continue;
                if (dist - radius < ring.inner + innerPad) continue;

                let ok = true;
                for (const other of islands) {
                    const d = Math.hypot(x - other.x, z - other.z);
                    if (d < radius + other.radius + MIN_SEPARATION) { ok = false; break; }
                }
                if (!ok) continue;

                // Shape variation: islands aren't perfect circles. Each gets an
                // elliptical stretch (xScale/zScale) plus a rotation, so some are
                // long and thin, others round and blobby.
                const shapeType = rand();
                let stretch, xScale, zScale;
                if (shapeType < 0.25) {
                    // Very long and thin
                    stretch = 0.35 + rand() * 0.25;
                    xScale = stretch;
                    zScale = 1 / Math.max(0.25, stretch * (1.2 + rand() * 0.6));
                } else if (shapeType < 0.5) {
                    // Wide and stubby
                    stretch = 1.4 + rand() * 0.8;
                    xScale = stretch;
                    zScale = 1 / Math.max(0.4, stretch / (1.1 + rand() * 0.5));
                } else if (shapeType < 0.7) {
                    // Lumpy/irregular - asymmetric
                    xScale = 0.5 + rand() * 1.4;
                    zScale = 0.5 + rand() * 1.4;
                } else {
                    // Classic ellipse
                    stretch = 0.45 + rand() * 1.1;
                    xScale = stretch;
                    zScale = 1 / Math.max(0.3, stretch);
                }
                const rotation = rand() * Math.PI * 2;

                islands.push({
                    x: x,
                    z: z,
                    radius: radius,
                    // Elongation applied in islandHeight/mesh builds.
                    xScale: xScale,
                    zScale: zScale,
                    rotation: rotation,
                    peak: MIN_PEAK + Math.pow(rand(), 0.8) * (MAX_PEAK - MIN_PEAK),
                    // Wider squash range: some flat atolls, some steep jagged peaks.
                    squash: 0.4 + rand() * 0.95,
                    seed: Math.floor(rand() * 1e9),
                    // Which islands get a prop/cabin and which get a cave mouth.
                    hasProp: rand() < 0.4,
                    hasCave: rand() < 0.3
                });
                return true;
            }
            return false;
        };

        // Pass 1: mega landmarks first so they land in the roomy spots.
        let landmarks = 0;
        for (let i = 0; i < 6 && landmarks < 6; i++) {
            const r = LANDMARK_RADIUS + rand() * (MAX_RADIUS - LANDMARK_RADIUS);
            if (tryPlace(r, true)) landmarks++;
        }

        // Pass 2: the rest - super varied sizes.
        let attempts = 0;
        const maxAttempts = ISLAND_COUNT * 80;
        while (islands.length < ISLAND_COUNT && attempts < maxAttempts) {
            attempts++;
            const p = rand();
            const radius = MIN_RADIUS + Math.pow(p, 0.65) * (LANDMARK_RADIUS - 2 - MIN_RADIUS);
            tryPlace(radius, false);
        }

        // Place ponds on some islands (light and dark) so players can fish them
        const ponds = [];
        const pondRand = mulberry32(xmur3(SEED + ":ponds")());
        // Try to place 1-2 light ponds and 1-2 dark ponds on suitable islands
        const pondCandidates = islands.filter(i => i.radius >= 18 && i.radius <= 70).sort((a,b) => b.radius - a.radius);
        let lightPlaced = 0, darkPlaced = 0;
        for (let i = 0; i < pondCandidates.length && (lightPlaced < 2 || darkPlaced < 2); i++) {
            const isl = pondCandidates[i];
            // Pick position near center-ish but not dead center
            const pa = pondRand() * Math.PI * 2;
            const pd = pondRand() * isl.radius * 0.35;
            const px = isl.x + Math.cos(pa) * pd;
            const pz = isl.z + Math.sin(pa) * pd;
            const type = (darkPlaced < lightPlaced || pondRand() < 0.5) && darkPlaced < 2 ? 'dark' : 'light';
            if (type === 'light' && lightPlaced >= 2) continue;
            if (type === 'dark' && darkPlaced >= 2) continue;
            const pr = type === 'dark' ? 8 + pondRand() * 4 : 6 + pondRand() * 3;
            ponds.push({ x: px, z: pz, radius: pr, type: type, island: isl });
            if (type === 'light') lightPlaced++; else darkPlaced++;
        }

        _layout = {
            islands: islands,
            ponds: ponds,
            ring: ring,
            // Quick lookup grid so heightAt only tests nearby islands. Bucket is
            // roughly the largest island footprint (shelf + widest ellipse axis).
            cell: MAX_RADIUS * 1.4 * 1.5 + MIN_SEPARATION,
            grid: null
        };
        buildLookupGrid(_layout);
        return _layout;
    }

    function buildLookupGrid(lay) {
        const cell = lay.cell;
        const map = new Map();
        lay.islands.forEach((isl, i) => {
            // Reach must cover the stretched (elliptical) footprint, not just the
            // nominal radius: the widest axis is radius * shelf * maxScale.
            const stretch = Math.max(isl.xScale || 1, isl.zScale || 1);
            const reach = isl.radius * 1.4 * stretch + 2;
            const minX = Math.floor((isl.x - reach) / cell);
            const maxX = Math.floor((isl.x + reach) / cell);
            const minZ = Math.floor((isl.z - reach) / cell);
            const maxZ = Math.floor((isl.z + reach) / cell);
            for (let cx = minX; cx <= maxX; cx++) {
                for (let cz = minZ; cz <= maxZ; cz++) {
                    const key = cx + "," + cz;
                    let bucket = map.get(key);
                    if (!bucket) { bucket = []; map.set(key, bucket); }
                    bucket.push(i);
                }
            }
        });
        lay.grid = map;
    }

    function nearby(lay, x, z) {
        if (!lay.grid) return lay.islands;
        const cell = lay.cell;
        const key = Math.floor(x / cell) + "," + Math.floor(z / cell);
        const bucket = lay.grid.get(key);
        if (!bucket) return null;
        return bucket.map(i => lay.islands[i]);
    }

    // Distance from an island's centre, measured in "shape space": the island's
    // ellipse and rotation are undone first, so an elongated island reads as a
    // circle here. Returns { d, shelf } where d is the shape-space distance and
    // shelf is the island's (shape-space) shelf radius.
    const _shape = { d: 0, shelf: 0 };
    function shapeDistance(isl, x, z) {
        let dx = x - isl.x;
        let dz = z - isl.z;
        // Undo the island's rotation.
        const rot = isl.rotation || 0;
        if (rot) {
            const c = Math.cos(-rot), s = Math.sin(-rot);
            const rx = dx * c - dz * s;
            const rz = dx * s + dz * c;
            dx = rx; dz = rz;
        }
        // Undo the ellipse: squeezing the long axis by xScale/zScale turns the
        // stretched footprint back into a unit circle.
        dx /= (isl.xScale || 1);
        dz /= (isl.zScale || 1);
        _shape.d = Math.sqrt(dx * dx + dz * dz);
        _shape.shelf = isl.radius * 1.4;
        return _shape;
    }

    // Height contribution of one island at (x, z). Returns a negative ocean
    // floor far away, rising smoothly to `peak` at the centre. Uses a cosine
    // dome so the shoreline is gentle (good for beaching a boat).
    function islandHeight(isl, x, z) {
        const floor = (typeof OCEAN_FLOOR === "number") ? OCEAN_FLOOR : -9;

        // Carve out ponds - if point is inside any pond, return pond surface level
        try {
            const lay = layout();
            if (lay && lay.ponds) {
                for (let i = 0; i < lay.ponds.length; i++) {
                    const p = lay.ponds[i];
                    const pdx = x - p.x, pdz = z - p.z;
                    const pd = Math.sqrt(pdx * pdx + pdz * pdz);
                    if (pd < p.radius * 1.8) {
                        return -0.1; // Fully flattened basin
                    }
                }
            }
        } catch (e) { /* ignore */ }

        // Also check if near pond even if not on this island's height contribution
        try {
            const lay = layout();
            if (lay && lay.ponds) {
                for (let i = 0; i < lay.ponds.length; i++) {
                    const p = lay.ponds[i];
                    const pdx = x - p.x, pdz = z - p.z;
                    const pd = Math.sqrt(pdx * pdx + pdz * pdz);
                    if (pd < p.radius * 1.8) {
                        return Math.min(-0.1, floor);
                    }
                }
            }
        } catch (e) { /* ignore */ }

        const sh = shapeDistance(isl, x, z);
        const shelf = sh.shelf;
        const d = sh.d;
        if (d >= shelf) return floor;

        const t = d / shelf;
        const dome = (1 - Math.cos((1 - t) * Math.PI)) / 2;
        const top = isl.peak * isl.squash;
        return floor + (top - floor) * dome;
    }

    // World terrain height for the open-ocean region. Returns null when the
    // caller should fall back to its own (home-island) height logic.
    function heightAt(x, z) {
        const lay = layout();
        const floor = (typeof OCEAN_FLOOR === "number") ? OCEAN_FLOOR : -9;
        const near = nearby(lay, x, z);
        if (!near) return floor;

        let h = floor;
        for (const isl of near) {
            const ih = islandHeight(isl, x, z);
            if (ih > h) h = ih;
        }
        return h;
    }

    // Is (x, z) inside an island's solid land (above the water line)?
    function landAt(x, z) {
        const sea = (typeof OCEAN_LEVEL === "number") ? OCEAN_LEVEL : -3;
        return heightAt(x, z) > sea + 0.15;
    }

    // Which island (if any) contains (x, z) on its dry land.
    function islandAt(x, z) {
        const lay = layout();
        const near = nearby(lay, x, z);
        if (!near) return null;
        for (const isl of near) {
            if (islandHeight(isl, x, z) > (typeof OCEAN_LEVEL === "number" ? OCEAN_LEVEL : -3) + 0.15) {
                return isl;
            }
        }
        return null;
    }

    // ------------------------------------------------------------ mesh build

    // One island as a radial grid mesh: rings of vertices from the centre out
    // to the shelf edge, coloured by height (deep -> shallow -> sand -> grass).
    function buildIslandMesh(isl) {
        const sea = (typeof OCEAN_LEVEL === "number") ? OCEAN_LEVEL : -3;
        const RINGS = 10;
        const SEGS = 24;
        const shelf = isl.radius * 1.4;

        const positions = [];
        const colors = [];
        const indices = [];

        const deep = new THREE.Color(0x33506b);
        const shallow = new THREE.Color(0xbcd3d8);
        const sand = new THREE.Color(0xe4c877);
        const grass = new THREE.Color(0x6b8e5f);
        const grassHi = new THREE.Color(0x8fb37a);
        const tmp = new THREE.Color();

        // Vertex 0 is the apex.
        positions.push(0, isl.peak * isl.squash, 0);
        tmp.copy(grassHi);
        colors.push(tmp.r, tmp.g, tmp.b);

        for (let r = 1; r <= RINGS; r++) {
            const rad = (r / RINGS) * shelf;
            for (let s = 0; s < SEGS; s++) {
                const a = (s / SEGS) * Math.PI * 2;
                const x = Math.cos(a) * rad;
                const z = Math.sin(a) * rad;
                const h = islandHeight(isl, isl.x + x, isl.z + z);
                positions.push(x, h, z);

                if (h < sea - 3) tmp.copy(deep);
                else if (h < sea - 0.6) tmp.copy(deep).lerp(shallow, (h - (sea - 3)) / 2.4);
                else if (h < sea + 1.2) tmp.copy(shallow).lerp(sand, Math.max(0, Math.min(1, (h - (sea - 0.6)) / 1.8)));
                else if (h < sea + 4) tmp.copy(sand).lerp(grass, Math.max(0, Math.min(1, (h - (sea + 1.2)) / 2.8)));
                else tmp.copy(grass).lerp(grassHi, Math.max(0, Math.min(1, (h - (sea + 4)) / 3)));
                colors.push(tmp.r, tmp.g, tmp.b);
            }
        }

        // Apex fan.
        for (let s = 0; s < SEGS; s++) {
            const a = 1 + s;
            const b = 1 + ((s + 1) % SEGS);
            indices.push(0, b, a);
        }
        // Ring quads.
        for (let r = 0; r < RINGS - 1; r++) {
            const ringStart = 1 + r * SEGS;
            const nextStart = 1 + (r + 1) * SEGS;
            for (let s = 0; s < SEGS; s++) {
                const s2 = (s + 1) % SEGS;
                const a = ringStart + s;
                const b = ringStart + s2;
                const c = nextStart + s2;
                const d = nextStart + s;
                indices.push(a, b, c);
                indices.push(a, c, d);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9,
            flatShading: true
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(isl.x, 0, isl.z);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.userData.isOceanIsland = true;
        return mesh;
    }

    // Scatter trees / rocks / flowers on an island's dry land, plus the odd
    // prop or cave mouth. Appends colliders so the player can't walk through
    // the trunks on these islands too.
    function decorateIsland(scene, group, isl, out) {
        const WG = window.WorldGen;
        if (!WG) return;
        const rand = mulberry32(isl.seed);
        const sea = (typeof OCEAN_LEVEL === "number") ? OCEAN_LEVEL : -3;

        // Check if this island has a pond nearby
        let hasPondNearby = false;
        if (window.Ocean) {
            try {
                const lay = window.Ocean.layout();
                if (lay && lay.ponds) {
                    for (let pi = 0; pi < lay.ponds.length; pi++) {
                        if (Math.hypot(lay.ponds[pi].x - isl.x, lay.ponds[pi].z - isl.z) < isl.radius + 5) { hasPondNearby = true; break; }
                    }
                }
            } catch(e){}
        }

        // Trees - more on bigger islands, sparser on tiny ones
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6D4C41, roughness: 1.0 });
        const leafTex = WG.createLeafTexture();
        const treeCount = hasPondNearby ? Math.round(isl.radius * 0.2) : Math.round(isl.radius * 0.45);
        for (let i = 0; i < treeCount; i++) {
            const a = rand() * Math.PI * 2;
            const d = rand() * isl.radius * (0.6 + rand() * 0.3);
            const x = isl.x + Math.cos(a) * d;
            const z = isl.z + Math.sin(a) * d;
            const h = heightAt(x, z);
            if (h < sea + 0.5) continue;
            // Avoid pond area
            if (hasPondNearby && window.Ocean) {
                try {
                    const lay = window.Ocean.layout();
                    if (lay && lay.ponds) {
                        let inPond = false;
                        for (let pi = 0; pi < lay.ponds.length; pi++) {
                            const pp = lay.ponds[pi];
                            if (Math.hypot(x - pp.x, z - pp.z) < pp.radius + 3) { inPond = true; break; }
                        }
                        if (inPond) continue;
                    }
                } catch(e){}
            }

            const leafMat = new THREE.MeshStandardMaterial({
                map: leafTex, color: 0x88CC88, roughness: 0.8, flatShading: true
            });
            leafMat.color.setHSL(0.32 + (rand() - 0.5) * 0.25, 0.55 + rand() * 0.25, 0.35 + rand() * 0.15);
            const t = WG.createDetailedTree(leafMat, trunkMat);
            const s = 0.5 + rand() * 0.6;
            t.position.set(x, h, z);
            t.rotation.y = rand() * Math.PI * 2;
            t.scale.set(s, s * (0.8 + rand() * 0.4), s);
            group.add(t);
            out.trees.push(t);
            out.colliders.push({ x: x, z: z, radius: 1.3 + s * 0.3 });
        }

        // Rocks. Block movement like trees do on ocean islands.
        const rockCount = hasPondNearby ? Math.round(isl.radius * 0.12) : Math.round(isl.radius * 0.28);
        for (let i = 0; i < rockCount; i++) {
            const a = rand() * Math.PI * 2;
            const d = rand() * isl.radius * 0.95;
            const x = isl.x + Math.cos(a) * d;
            const z = isl.z + Math.sin(a) * d;
            const h = heightAt(x, z);
            if (h < sea + 0.35) continue;
            if (hasPondNearby && window.Ocean) {
                try {
                    const lay = window.Ocean.layout();
                    if (lay && lay.ponds) {
                        let inPond = false;
                        for (let pi = 0; pi < lay.ponds.length; pi++) {
                            const pp = lay.ponds[pi];
                            if (Math.hypot(x - pp.x, z - pp.z) < pp.radius + 3) { inPond = true; break; }
                        }
                        if (inPond) continue;
                    }
                } catch(e){}
            }
            const rScale = 0.4 + rand() * 2.6;
            const r = WG.createRockMesh(rScale);
            r.position.set(x, h + 0.15, z);
            r.rotation.set(rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI * 0.6);
            group.add(r);
            out.colliders.push({ x: x, z: z, radius: rScale * 0.85 });
        }

        // Flowers (pickable) if the game exposes the hook. Wrapped so a failure
        // in the flower pass can never abort the whole island build.
        if (typeof window.spawnOceanIslandFlowers === "function") {
            try { window.spawnOceanIslandFlowers(isl, rand); }
            catch (e) { /* flowers are cosmetic — skip on error */ }
        }

        // Optional prop / cave mouth for a handful of islands.
        if (isl.hasProp && WG.makeProp) {
            const type = WG.PROP_TYPES[Math.floor(rand() * WG.PROP_TYPES.length)];
            try {
                const prop = WG.makeProp({ type: type.id, x: isl.x, z: isl.z, rot: rand() * Math.PI * 2 });
                if (prop) {
                    prop.position.set(isl.x, heightAt(isl.x, isl.z), isl.z);
                    group.add(prop);
                }
            } catch (e) { /* prop type not placeable — skip */ }
        }
        if (isl.hasCave && WG.makeCave) {
            try {
                const cave = WG.makeCave({ size: "small", x: isl.x, z: isl.z });
                if (cave) {
                    cave.position.set(isl.x, heightAt(isl.x, isl.z), isl.z);
                    group.add(cave);
                }
            } catch (e) { /* non-fatal */ }
        }
    }

    // Build every island as a group added to the scene. Returns the same shape
    // the rest of the world build uses: { group, trees, colliders }.
    function build(scene, opts) {
        opts = opts || {};
        const lay = layout();
        const group = new THREE.Group();
        group.name = "oceanIslands";

        const out = { group: group, trees: [], colliders: [], islands: lay.islands.slice(), ponds: lay.ponds ? lay.ponds.slice() : [] };

        for (const isl of lay.islands) {
            group.add(buildIslandMesh(isl));
            if (opts.decorate !== false) decorateIsland(scene, group, isl, out);
        }

        // Add pond meshes if any
        if (lay.ponds) {
            const pondTex = window.createNoiseTexture ? window.createNoiseTexture(64, 64, '#3a9a9a', '#2a7a7a', 0.04, 77) : null;
            const darkTex = window.createNoiseTexture ? window.createNoiseTexture(64, 64, '#1a2a3a', '#0a1a2a', 0.04, 99) : null;
            lay.ponds.forEach(p => {
                const tex = p.type === 'dark' ? darkTex : pondTex;
                const mat = new THREE.MeshStandardMaterial({
                    map: tex || null,
                    color: p.type === 'dark' ? 0x446688 : 0xaaddee,
                    transparent: true,
                    opacity: 0.9,
                    roughness: 0.2
                });
                const pm = new THREE.Mesh(new THREE.CircleGeometry(p.radius * 0.92, 32), mat);
                pm.rotation.x = -Math.PI / 2;
                // Get terrain height at pond position - should be flattened
                let py = -0.03;
                if (typeof islandHeight === 'function') {
                    py = islandHeight(p.island, p.x, p.z) + 0.06;
                } else if (typeof window.getTerrainHeight === 'function') {
                    py = window.getTerrainHeight(p.x, p.z) + 0.06;
                }
                pm.position.set(p.x, py, p.z);
                pm.receiveShadow = true;
                group.add(pm);
                if (!out.ponds) out.ponds = [];
                out.ponds.push({ x: p.x, z: p.z, radius: p.radius, type: p.type });
            });
        }

        scene.add(group);
        return out;
    }

    // Rebuild helper for custom levels: generate islands in the ocean *around*
    // a custom map so sailing past its edge still leads somewhere.
    function layoutAround(size, seaLevel) {
        const rand = mulberry32(xmur3(SEED + ":" + Math.round(size))());
        const half = size / 2;
        const inner = half + 80;
        const outer = half + 560;           // custom levels get a 560-unit apron
        const islands = [];
        const target = 18;
        let attempts = 0;

        // Shared placer: try to drop one island of `radius`, enforcing the
        // apron bounds and separation. Returns true on success.
        const placeOne = (radius) => {
            for (let a = 0; a < 120; a++) {
                const angle = rand() * Math.PI * 2;
                const t = Math.pow(rand(), 0.7);
                const dist = inner + t * (outer - inner);
                const x = Math.cos(angle) * dist;
                const z = Math.sin(angle) * dist;
                if (dist + radius * 1.4 > outer) continue;
                if (dist - radius < inner) continue;   // keep big islands off the authored map
                let ok = true;
                for (const o of islands) {
                    if (Math.hypot(x - o.x, z - o.z) < radius + o.radius + MIN_SEPARATION) { ok = false; break; }
                }
                if (!ok) continue;
                // Shape variation, same scheme as layout(): each island gets an
                // elliptical stretch (xScale/zScale) plus a rotation. These MUST
                // be declared here - referencing them without defining them threw
                // a ReferenceError that aborted setupThreeJS() and left the MAKE
                // LOBBY button unwired on custom-level pages.
                const shapeType = rand();
                let stretch, xScale, zScale;
                if (shapeType < 0.25) {
                    stretch = 0.35 + rand() * 0.25;
                    xScale = stretch;
                    zScale = 1 / Math.max(0.25, stretch * (1.2 + rand() * 0.6));
                } else if (shapeType < 0.5) {
                    stretch = 1.4 + rand() * 0.8;
                    xScale = stretch;
                    zScale = 1 / Math.max(0.4, stretch / (1.1 + rand() * 0.5));
                } else if (shapeType < 0.7) {
                    xScale = 0.5 + rand() * 1.4;
                    zScale = 0.5 + rand() * 1.4;
                } else {
                    stretch = 0.45 + rand() * 1.1;
                    xScale = stretch;
                    zScale = 1 / Math.max(0.3, stretch);
                }
                islands.push({
                    x: x,
                    z: z,
                    radius: radius,
                    xScale: xScale,
                    zScale: zScale,
                    rotation: rand() * Math.PI * 2,
                    peak: MIN_PEAK + Math.pow(rand(), 0.8) * (MAX_PEAK - MIN_PEAK),
                    squash: 0.4 + rand() * 0.95,
                    seed: Math.floor(rand() * 1e9),
                    hasProp: rand() < 0.4,
                    hasCave: rand() < 0.3
                });
                return true;
            }
            return false;
        };

        // Pass 1: a few landmark-sized islands first, like the default ocean,
        // so the apron has real "big island" destinations.
        for (let i = 0; i < 4 && islands.length < 4; i++) {
            placeOne(LANDMARK_RADIUS + rand() * (MAX_RADIUS - LANDMARK_RADIUS));
        }

        // Pass 2: the rest - the same long-tail size mix as the default map.
        while (islands.length < target && attempts < target * 120) {
            attempts++;
            const radius = MIN_RADIUS + (rand() * rand()) * (MAX_RADIUS - MIN_RADIUS);
            placeOne(radius);
        }
        return { islands: islands, inner: inner, outer: outer };
    }

    window.Ocean = {
        layout: layout,
        layoutAround: layoutAround,
        heightAt: heightAt,
        landAt: landAt,
        islandAt: islandAt,
        islandHeight: islandHeight,
        build: build,
        buildIslandMesh: buildIslandMesh,
        rings: ringFor
    };
})();
