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

    const SEED = "open-ocean-archipelago-v1";

    // Tunables. Radii are in world units; heights are in the same space as
    // getTerrainHeight (0 = shore, island hills go up to ~7).
    const ISLAND_COUNT = 26;      // how many islands to scatter
    const MIN_RADIUS = 14;        // smallest island
    const MAX_RADIUS = 34;        // largest island
    const MIN_PEAK = 2.2;         // lowest island top (above ocean)
    const MAX_PEAK = 7.0;         // tallest island top
    const MIN_SEPARATION = 34;    // minimum gap between island rims

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

        // Poisson-ish rejection sampling: place islands one at a time, rejecting
        // any that would sit too close to an already-placed island (or too close
        // to the home island / world edge). Bounded attempts so this always ends.
        let attempts = 0;
        const maxAttempts = ISLAND_COUNT * 60;
        while (islands.length < ISLAND_COUNT && attempts < maxAttempts) {
            attempts++;

            const radius = MIN_RADIUS + rand() * (MAX_RADIUS - MIN_RADIUS);
            // Pick a point in the ring, biased outward so we don't crowd the
            // home island's shoreline.
            const angle = rand() * Math.PI * 2;
            const t = Math.pow(rand(), 0.7); // push toward the outer edge
            const dist = ring.inner + t * (ring.outer - ring.inner);
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;

            // Keep every island fully inside the sailable ring.
            if (dist + radius > ring.outer) continue;
            if (dist - radius < ring.inner) continue;

            let ok = true;
            for (const other of islands) {
                const d = Math.hypot(x - other.x, z - other.z);
                if (d < radius + other.radius + MIN_SEPARATION) { ok = false; break; }
            }
            if (!ok) continue;

            const peak = MIN_PEAK + rand() * (MAX_PEAK - MIN_PEAK);
            islands.push({
                x: x,
                z: z,
                radius: radius,
                peak: peak,
                // Slight vertical squash so islands read as mounds, not cones.
                squash: 0.75 + rand() * 0.4,
                seed: Math.floor(rand() * 1e9),
                // Which islands get a prop/cabin and which get a cave mouth.
                hasProp: rand() < 0.35,
                hasCave: rand() < 0.25
            });
        }

        _layout = {
            islands: islands,
            ring: ring,
            // Quick lookup grid so heightAt only tests nearby islands. Bucket is
            // roughly the largest island diameter.
            cell: MAX_RADIUS * 2 + MIN_SEPARATION,
            grid: null
        };
        buildLookupGrid(_layout);
        return _layout;
    }

    function buildLookupGrid(lay) {
        const cell = lay.cell;
        const map = new Map();
        lay.islands.forEach((isl, i) => {
            const reach = isl.radius + 2;
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

    // Height contribution of one island at (x, z). Returns a negative ocean
    // floor far away, rising smoothly to `peak` at the centre. Uses a cosine
    // dome so the shoreline is gentle (good for beaching a boat).
    function islandHeight(isl, x, z) {
        const floor = (typeof OCEAN_FLOOR === "number") ? OCEAN_FLOOR : -9;
        const dx = x - isl.x;
        const dz = z - isl.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        // Outer shelf extends 40% past the visual radius so shallows ring it.
        const shelf = isl.radius * 1.4;
        if (d >= shelf) return floor;

        const t = d / shelf;              // 0 centre .. 1 shelf edge
        // Smooth dome: 1 at centre, 0 at edge, with a flat-ish top.
        const dome = (1 - Math.cos((1 - t) * Math.PI)) / 2;
        const top = isl.peak * isl.squash;
        // Blend from the deep floor up to the island top.
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

        // Trees.
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6D4C41, roughness: 1.0 });
        const leafTex = WG.createLeafTexture();
        const treeCount = Math.round(isl.radius * 0.35);
        for (let i = 0; i < treeCount; i++) {
            const a = rand() * Math.PI * 2;
            const d = rand() * isl.radius * 0.7;
            const x = isl.x + Math.cos(a) * d;
            const z = isl.z + Math.sin(a) * d;
            const h = heightAt(x, z);
            if (h < sea + 0.6) continue;

            const leafMat = new THREE.MeshStandardMaterial({
                map: leafTex, color: 0x88CC88, roughness: 0.8, flatShading: true
            });
            leafMat.color.setHSL(0.35 + (rand() - 0.5) * 0.2, 0.6, 0.4);
            const t = WG.createDetailedTree(leafMat, trunkMat);
            const s = 0.7 + rand() * 0.4;
            t.position.set(x, h, z);
            t.rotation.y = rand() * Math.PI * 2;
            t.scale.set(s, s, s);
            group.add(t);
            out.trees.push(t);
            out.colliders.push({ x: x, z: z, radius: 1.5 });
        }

        // Rocks.
        const rockCount = Math.round(isl.radius * 0.18);
        for (let i = 0; i < rockCount; i++) {
            const a = rand() * Math.PI * 2;
            const d = rand() * isl.radius * 0.85;
            const x = isl.x + Math.cos(a) * d;
            const z = isl.z + Math.sin(a) * d;
            const h = heightAt(x, z);
            if (h < sea + 0.4) continue;
            const r = WG.createRockMesh(0.8 + rand() * 1.1);
            r.position.set(x, h + 0.2, z);
            r.rotation.y = rand() * Math.PI * 2;
            group.add(r);
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

        const out = { group: group, trees: [], colliders: [], islands: lay.islands.slice() };

        for (const isl of lay.islands) {
            group.add(buildIslandMesh(isl));
            if (opts.decorate !== false) decorateIsland(scene, group, isl, out);
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
        while (islands.length < target && attempts < target * 60) {
            attempts++;
            const radius = 14 + rand() * 20;
            const angle = rand() * Math.PI * 2;
            const t = Math.pow(rand(), 0.7);
            const dist = inner + t * (outer - inner);
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            if (dist + radius > outer) continue;
            let ok = true;
            for (const o of islands) {
                if (Math.hypot(x - o.x, z - o.z) < radius + o.radius + 34) { ok = false; break; }
            }
            if (!ok) continue;
            islands.push({
                x: x, z: z, radius: radius,
                peak: 2.2 + rand() * 4.5,
                squash: 0.75 + rand() * 0.4,
                seed: Math.floor(rand() * 1e9),
                hasProp: rand() < 0.3,
                hasCave: rand() < 0.2
            });
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
