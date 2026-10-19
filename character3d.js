// ============================================================================
//  character3d.js  --  Procedural blocky 3D character models.
//
//  Character3D.build(cfg) returns a THREE.Group whose local origin sits at the
//  waist, spanning y = -1.46875 (feet) .. +1.46875 (top), so it drops straight
//  onto the existing character rig (body placed at y = 1.46875, bobbed while
//  walking).  Front of the model is +Z (matches the game's lookAt convention).
//
//  cfg = {
//    color, belly, eye,
//    species,                                   // legacy species id
//    ears, eyes, nose, misc, tail,              // modular part ids
//    earsColor, noseColor, miscColor, tailColor,
//    hat, shirt, collar, pattern, hair, hairColor
//  }
// ============================================================================
(function () {
    if (typeof THREE === 'undefined') return;

    var H = 2.9375, HALF = H / 2;

    // --- body proportions (local, centred at the waist) ---------------------
    var FEET = -HALF;
    var HEAD_Y = 0.86, HEAD_W = 1.06, HEAD_H = 1.0, HEAD_D = 0.98;
    var TORSO_Y = -0.38, TORSO_W = 0.92, TORSO_H = 1.12, TORSO_D = 0.60;
    var LEG_Y = -1.18, LEG_W = 0.34, LEG_H = 0.58, LEG_D = 0.44;
    var ARM_Y = -0.34, ARM_W = 0.24, ARM_H = 1.10, ARM_D = 0.30;

    // ---------------------------------------------------------------- colours
    function parseColor(c) {
        if (c && c.isColor) return c.clone();
        if (typeof c === 'number') return new THREE.Color(c);
        if (typeof c === 'string') {
            var s = c.trim();
            var m = s.match(/^rgba?\(([^)]+)\)$/i);
            if (m) {
                var p = m[1].split(',').map(function (v) { return parseFloat(v); });
                return new THREE.Color((p[0] || 0) / 255, (p[1] || 0) / 255, (p[2] || 0) / 255);
            }
            try { return new THREE.Color(s); } catch (e) { return new THREE.Color('#ffffff'); }
        }
        return new THREE.Color('#ffffff');
    }
    // percent < 0 darkens toward black, > 0 lightens toward white
    function shade(c, percent) {
        var col = parseColor(c);
        var t = percent < 0 ? 0 : 1, p = percent < 0 ? -percent : percent;
        return new THREE.Color(
            (t - col.r) * p + col.r,
            (t - col.g) * p + col.g,
            (t - col.b) * p + col.b
        );
    }

    // --------------------------------------------------------------- material
    function mat(mats, c, opts) {
        var col = parseColor(c);
        var o = opts || {};
        var key = col.getHexString() + '|' + (o.transparent ? 't' + (o.opacity || 1) : '') +
            '|' + (o.map ? 'M' : '');
        var m = mats.get(key);
        if (!m) {
            m = new THREE.MeshBasicMaterial({ color: col });
            if (o.transparent) { m.transparent = true; m.opacity = o.opacity != null ? o.opacity : 1; }
            if (o.map) { m.map = o.map; m.transparent = true; }
            mats.set(key, m);
        }
        return m;
    }

    function box(mats, parent, w, h, d, c, x, y, z, rx, ry, rz) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(mats, c));
        m.position.set(x || 0, y || 0, z || 0);
        if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
        parent.add(m);
        return m;
    }
    function geo(mats, parent, geometry, c, x, y, z, rx, ry, rz) {
        var m = new THREE.Mesh(geometry, mat(mats, c));
        m.position.set(x || 0, y || 0, z || 0);
        if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
        parent.add(m);
        return m;
    }
    function cone(mats, parent, r, h, seg, c, x, y, z, rx, ry, rz) {
        return geo(mats, parent, new THREE.ConeGeometry(r, h, seg || 4), c, x, y, z, rx, ry, rz);
    }
    function cyl(mats, parent, rt, rb, h, seg, c, x, y, z, rx, ry, rz) {
        return geo(mats, parent, new THREE.CylinderGeometry(rt, rb, h, seg || 8), c, x, y, z, rx, ry, rz);
    }
    function sphere(mats, parent, r, c, x, y, z, sx, sy, sz) {
        var m = geo(mats, parent, new THREE.SphereGeometry(r, 8, 6), c, x, y, z);
        if (sx || sy || sz) m.scale.set(sx || 1, sy || 1, sz || 1);
        return m;
    }
    function torus(mats, parent, r, tube, c, x, y, z, rx, ry, rz) {
        return geo(mats, parent, new THREE.TorusGeometry(r, tube, 6, 14), c, x, y, z, rx, ry, rz);
    }

    // ------------------------------------------------------------ part tables
    var EAR_FAMILY = {
        none: 'none',
        cat: 'pointed', fox: 'pointed', wolf: 'pointed', raccoon: 'pointed',
        skunk: 'pointed', ferret: 'pointed', red_panda: 'pointed', squirrel: 'pointed',
        zebra: 'pointed', tiger: 'smallpoint', leopard: 'smallpoint', pig: 'smallpoint',
        bunny: 'long',
        dog: 'floppy', beaver: 'floppy',
        bear: 'round', koala: 'round', panda: 'round', hamster: 'round',
        chinchilla: 'round', otter: 'round', hippo: 'round', monkey: 'round',
        dragon: 'horn', cow: 'horn', rhino: 'horn',
        deer: 'antler',
        owl: 'tuft', bat: 'fin', shark: 'fin', dolphin: 'fin',
        snake: 'none',
        elephant: 'biground', mouse: 'biground',
        giraffe: 'ossicone', hedgehog: 'spike', protogen: 'visor',
        chipmunk: 'round'
    };

    var NOSE_FAMILY = {
        cat: 'snout', tiger: 'snout', leopard: 'snout', lion: 'snout', bear: 'snout',
        panda: 'snout', skunk: 'snout', otter: 'snout', hamster: 'snout',
        chinchilla: 'snout', ferret: 'snout', squirrel: 'snout', chipmunk: 'snout',
        hedgehog: 'snout', mouse: 'snout', raccoon: 'snout', red_panda: 'snout',
        hippo: 'wide', pig: 'pig',
        dog: 'longsnout', wolf: 'longsnout', fox: 'longsnout', deer: 'longsnout',
        giraffe: 'longsnout', zebra: 'longsnout', cow: 'longsnout', rhino: 'horn',
        duck: 'beak', owl: 'beak', bird: 'beak', dolphin: 'beak',
        dragon: 'lizardsnout', snake: 'lizardsnout', shark: 'lizardsnout',
        frog: 'frog', elephant: 'trunk', beaver: 'teeth',
        smile: 'smile', blep: 'blep'
    };

    var TAIL_FAMILY = {
        none: 'none', cat: 'thin', mouse: 'thin', monkey: 'thin', ferret: 'thin',
        elephant: 'thin', snake: 'long', owl: 'feather', duck: 'feather',
        peacock: 'feather', penguin: 'puff',
        bunny: 'puff', bear: 'puff', hamster: 'puff', panda: 'puff', hippo: 'puff',
        rhino: 'puff', deer: 'puff', hedgehog: 'puff',
        fox: 'bushy', wolf: 'bushy', skunk: 'bushy', squirrel: 'bushy',
        chinchilla: 'bushy', raccoon: 'bushy', red_panda: 'bushy',
        pig: 'curly', dragon: 'spike',
        tiger: 'stripe', zebra: 'stripe', chipmunk: 'stripe', leopard: 'spot',
        shark: 'fin', dolphin: 'fin', axolotl: 'fin', mermaid: 'fin', bat: 'fin',
        protogen: 'mech', otter: 'paddle', beaver: 'flat',
        giraffe: 'tuft', lion: 'tuft'
    };

    var HAIR_KIND = {
        none: 'none',
        buzzed: 'buzz', pixie: 'buzz', slicked: 'buzz', undercut: 'buzz', sidepart: 'buzz',
        bob: 'bob', long: 'long', wavy: 'long', shaggy: 'long', mullet: 'mullet', dreads: 'dreads',
        messy: 'messy', emo: 'emo', bangs: 'bangs',
        spiky: 'spiky', mohawk: 'mohawk',
        ponytail: 'ponytail', braid: 'braid',
        pigtails: 'pigtails', twintails: 'twintails',
        afro: 'afro', curly: 'curly',
        bun: 'bun', topknot: 'topknot', pompadour: 'pompadour'
    };

    // Per-species body shaping (the "race").
    var RACE = {
        giraffe: { headScale: 0.92, neck: 0.55, legScale: 1.15 },
        elephant: { headScale: 1.18, widthScale: 1.15 },
        hippo: { headScale: 1.14, widthScale: 1.18 },
        rhino: { headScale: 1.06, widthScale: 1.15 },
        bear: { headScale: 1.1, widthScale: 1.12 },
        panda: { headScale: 1.1, widthScale: 1.12 },
        tiger: { headScale: 1.04, widthScale: 1.05 },
        lion: { headScale: 1.06, widthScale: 1.05 },
        mouse: { headScale: 0.88, widthScale: 0.9, legScale: 0.9 },
        hamster: { headScale: 0.9, widthScale: 0.92, legScale: 0.92 },
        chipmunk: { headScale: 0.86, widthScale: 0.88, legScale: 0.9 },
        chinchilla: { headScale: 0.94, widthScale: 0.95 },
        hedgehog: { headScale: 0.96 }
    };

    // -------------------------------------------------------------- the build
    function build(cfg) {
        cfg = cfg || {};
        var mats = new Map();
        var root = new THREE.Group();

        var baseCol = cfg.color != null ? cfg.color : '#c8a06a';
        var bellyCol = (cfg.belly != null && cfg.belly !== '') ? cfg.belly : baseCol;
        var eyeCol = (cfg.eye != null && cfg.eye !== '') ? cfg.eye : '#000000';

        var parts = resolveParts(cfg);
        var ears = parts.ears, eyes = parts.eyes, nose = parts.nose,
            misc = parts.misc, tailId = parts.tail;

        var race = RACE[ears] || RACE[parts.species] || {};
        var headScale = race.headScale || 1;
        var widthScale = race.widthScale || 1;
        var legScale = race.legScale || 1;

        var hw = HEAD_W * headScale, hh = HEAD_H * headScale, hd = HEAD_D * headScale;
        var headY = HEAD_Y + (headScale - 1) * 0.15;
        var tw = TORSO_W * widthScale, td = TORSO_D * widthScale;

        var shirt = findShirt(cfg.shirt);

        buildLegs(root, mats, baseCol, legScale);
        buildTorso(root, mats, baseCol, bellyCol, tw, td, shirt);
        buildArms(root, mats, baseCol, tw, shirt);

        var neckH = race.neck || 0.16;
        box(mats, root, 0.36, neckH, 0.34, baseCol, 0, TORSO_Y + TORSO_H / 2 + neckH / 2, 0);

        var head = new THREE.Group();
        head.position.y = headY;
        root.add(head);
        box(mats, head, hw, hh, hd, baseCol, 0, 0, 0);

        buildMuzzle(head, mats, nose, cfg, baseCol, hw, hh, hd, eyes);
        buildEyes(head, mats, eyes, eyeCol, hw, hh, hd, baseCol);
        buildEars(head, mats, ears, cfg, baseCol, hw, hh, hd);
        buildPattern(root, head, mats, cfg.pattern, baseCol, TORSO_W * widthScale, TORSO_D * widthScale, hw, hh, hd);
        buildHair(head, mats, cfg.hair, cfg.hairColor || shade(baseCol, -0.25), hw, hh, hd);
        buildHat(head, mats, cfg.hat, hw, hh, hd);
        buildMisc(root, head, mats, misc, cfg, baseCol, hw, hh, hd);
        buildTail(root, mats, tailId, cfg, baseCol);
        buildCollar(root, mats, cfg.collar, race.neck || 0.16);

        root.userData.is3DCharacter = true;
        root.userData.baseColor = baseCol;
        return root;
    }

    function resolveParts(cfg) {
        if (cfg.ears || cfg.eyes || cfg.nose || cfg.tail || cfg.misc) {
            return {
                ears: cfg.ears || 'none',
                eyes: cfg.eyes || 'standard',
                nose: cfg.nose || 'cat',
                misc: cfg.misc || 'none',
                tail: cfg.tail || 'none',
                species: cfg.species
            };
        }
        var sp = cfg.species || 'cat';
        var map = {
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
            penguin: { ears: 'none', eyes: 'standard', nose: 'penguin', misc: 'penguin_belly', tail: 'penguin' }
        };
        var p = map[sp] || map.cat;
        return { ears: p.ears, eyes: p.eyes, nose: p.nose, misc: p.misc, tail: p.tail, species: sp };
    }

    // ------------------------------------------------------------- body parts
    function buildLegs(root, mats, baseCol, legScale) {
        var lh = LEG_H * legScale;
        var ly = FEET + lh / 2 + (LEG_H * (1 - legScale)) / 2;
        var legCol = shade(baseCol, -0.12);
        box(mats, root, LEG_W, lh, LEG_D, legCol, -0.22, ly, 0);
        box(mats, root, LEG_W, lh, LEG_D, legCol, 0.22, ly, 0);
        box(mats, root, LEG_W + 0.06, 0.12, LEG_D + 0.14, legCol, -0.22, FEET + 0.06, 0.05);
        box(mats, root, LEG_W + 0.06, 0.12, LEG_D + 0.14, legCol, 0.22, FEET + 0.06, 0.05);
    }

    function buildTorso(root, mats, baseCol, bellyCol, tw, td, shirt) {
        if (shirt && shirt.type !== 'none') {
            if (shirtNeedsTexture(shirt.type)) {
                var m = new THREE.Mesh(new THREE.BoxGeometry(tw, TORSO_H, td),
                    new THREE.MeshBasicMaterial({ map: shirtTexture(shirt) }));
                m.position.y = TORSO_Y;
                root.add(m);
            } else {
                box(mats, root, tw, TORSO_H, td, shirt.color || '#ffffff', 0, TORSO_Y, 0);
            }
        } else {
            box(mats, root, tw, TORSO_H, td, baseCol, 0, TORSO_Y, 0);
            box(mats, root, tw * 0.55, TORSO_H * 0.62, 0.06, bellyCol, 0, TORSO_Y + 0.05, td / 2 + 0.01);
        }
    }

    // Look a shirt up in SHIRT_TYPES (defined in fish.js). Returns { id:'none' }
    // when the id is unknown so callers can treat it as "no shirt".
    function findShirt(shirtId) {
        if (!shirtId || shirtId === 'none') return { id: 'none', type: 'none' };
        try {
            if (typeof SHIRT_TYPES !== 'undefined') {
                var s = SHIRT_TYPES.find(function (t) { return t.id === shirtId; });
                if (s) return s;
            }
        } catch (e) { }
        return { id: 'none', type: 'none' };
    }

    function shirtNeedsTexture(type) {
        return type === 'striped' || type === 'vertical_stripe' || type === 'checkered' ||
            type === 'logo' || type === 'tux' || type === 'suit' || type === 'vest' ||
            type === 'camo' || type === 'floral' || type === 'coat' || type === 'chain';
    }

    function shirtTexture(shirt) {
        var c = document.createElement('canvas'); c.width = 64; c.height = 64;
        var x = c.getContext('2d');
        x.fillStyle = shirt.color || '#ffffff';
        x.fillRect(0, 0, 64, 64);
        var sec = shirt.secondary || '#000000';
        var t = shirt.type;
        var i;
        if (t === 'striped') {
            x.fillStyle = sec;
            for (i = 0; i < 64; i += 8) x.fillRect(0, i, 64, 4);
        } else if (t === 'vertical_stripe') {
            x.fillStyle = sec;
            for (i = 0; i < 64; i += 8) x.fillRect(i, 0, 4, 64);
        } else if (t === 'checkered') {
            x.fillStyle = sec;
            for (i = 0; i < 64; i += 10) x.fillRect(i, 0, 5, 64);
            x.globalAlpha = 0.55;
            for (i = 0; i < 64; i += 10) x.fillRect(0, i, 64, 5);
            x.globalAlpha = 1;
        } else if (t === 'logo') {
            x.fillStyle = sec;
            x.font = '38px Arial';
            x.textAlign = 'center';
            x.fillText(shirt.symbol || '*', 32, 48);
        } else if (t === 'tux' || t === 'suit') {
            x.fillStyle = '#f2f2f2';
            x.beginPath(); x.moveTo(22, 0); x.lineTo(42, 0); x.lineTo(32, 42); x.closePath(); x.fill();
            x.fillStyle = '#c0392b';
            x.fillRect(30, 6, 4, 16);
        } else if (t === 'vest') {
            x.fillStyle = '#f2f2f2';
            x.fillRect(26, 0, 12, 64);
            x.fillStyle = sec;
            x.globalAlpha = 0.5; x.fillRect(0, 0, 64, 64); x.globalAlpha = 1;
        } else if (t === 'camo') {
            x.fillStyle = shade(shirt.color || '#556B2F', -0.25);
            [[6, 8], [34, 4], [20, 30], [46, 38], [10, 50], [40, 56]].forEach(function (p) {
                x.beginPath(); x.ellipse(p[0], p[1], 9, 6, 0.5, 0, Math.PI * 2); x.fill();
            });
        } else if (t === 'floral') {
            x.fillStyle = '#ffffff';
            [[12, 14], [44, 20], [26, 42], [52, 50], [8, 56]].forEach(function (p) {
                for (var k = 0; k < 5; k++) {
                    var a = (k / 5) * Math.PI * 2;
                    x.beginPath(); x.arc(p[0] + Math.cos(a) * 4, p[1] + Math.sin(a) * 4, 3.5, 0, Math.PI * 2); x.fill();
                }
            });
            x.fillStyle = '#ffd24d';
            [[12, 14], [44, 20], [26, 42], [52, 50], [8, 56]].forEach(function (p) {
                x.beginPath(); x.arc(p[0], p[1], 2.5, 0, Math.PI * 2); x.fill();
            });
        } else if (t === 'coat') {
            x.fillStyle = '#e8e8e8';
            x.fillRect(26, 0, 12, 64);
            x.fillStyle = '#c0c0c0';
            x.fillRect(29, 8, 6, 6); x.fillRect(29, 24, 6, 6); x.fillRect(29, 40, 6, 6);
        } else if (t === 'chain') {
            x.fillStyle = '#fff6b0';
            for (i = 4; i < 64; i += 10) {
                x.beginPath(); x.arc(i, 16, 4, 0, Math.PI * 2); x.fill();
            }
            x.fillStyle = shade(shirt.color || '#FFD700', -0.2);
            for (i = 4; i < 64; i += 10) {
                x.beginPath(); x.arc(i, 16, 2, 0, Math.PI * 2); x.fill();
            }
        }
        var tex = new THREE.CanvasTexture(c);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        return tex;
    }

    function buildArms(root, mats, baseCol, tw, shirt) {
        var armCol = (shirt && shirt.type !== 'none') ? (shirt.color || '#ffffff') : baseCol;
        box(mats, root, ARM_W, ARM_H, ARM_D, armCol, -(tw / 2 + ARM_W / 2), ARM_Y, 0);
        box(mats, root, ARM_W, ARM_H, ARM_D, armCol, (tw / 2 + ARM_W / 2), ARM_Y, 0);
        var handCol = shade(baseCol, -0.05);
        var hy = ARM_Y - ARM_H / 2 + 0.05;
        box(mats, root, ARM_W + 0.04, 0.14, ARM_D + 0.06, handCol, -(tw / 2 + ARM_W / 2), hy, 0);
        box(mats, root, ARM_W + 0.04, 0.14, ARM_D + 0.06, handCol, (tw / 2 + ARM_W / 2), hy, 0);
    }

    function buildCollar(root, mats, collarId, neckH) {
        var collar = null;
        try {
            if (typeof COLLAR_TYPES !== 'undefined') collar = COLLAR_TYPES.find(function (c) { return c.id === collarId; });
        } catch (e) { }
        if (!collar || collar.id === 'none') return;
        var col = collar.color || '#ff0000';
        var y = TORSO_Y + TORSO_H / 2 + (neckH || 0.16) / 2;
        if (collar.type === 'spiked') {
            torus(mats, root, 0.28, 0.04, col, 0, y, 0, Math.PI / 2, 0, 0);
            for (var i = 0; i < 8; i++) {
                var a = (i / 8) * Math.PI * 2;
                cone(mats, root, 0.035, 0.12, 4, '#cccccc', Math.cos(a) * 0.3, y, Math.sin(a) * 0.3, Math.PI / 2, -a, 0);
            }
        } else if (collar.type === 'bell') {
            torus(mats, root, 0.28, 0.04, col, 0, y, 0, Math.PI / 2, 0, 0);
            sphere(mats, root, 0.08, '#ffd24d', 0, y - 0.1, 0.28);
        } else {
            torus(mats, root, 0.28, 0.045, col, 0, y, 0, Math.PI / 2, 0, 0);
        }
    }

    // ----------------------------------------------------------------- muzzle
    function buildMuzzle(head, mats, nose, cfg, baseCol, hw, hh, hd) {
        var nz = hd / 2;
        var snoutCol = shade(baseCol, 0.06);
        var noseColor = cfg.noseColor || shade(baseCol, -0.3);
        var fam = NOSE_FAMILY[nose] || 'snout';

        if (nose === 'elephant') {
            for (var e = 0; e < 5; e++) {
                box(mats, head, 0.26 - e * 0.02, 0.2, 0.26 - e * 0.02, snoutCol,
                    0, -0.15 - e * 0.16, nz + 0.1 + e * 0.03);
            }
            return;
        }
        if (nose === 'beak') {
            cone(mats, head, 0.16, 0.34, 4, '#f0a83c', 0, -0.08, nz + 0.16, Math.PI / 2, 0, 0);
            return;
        }
        if (fam === 'frog') {
            box(mats, head, 0.6, 0.12, 0.16, '#8a3a4a', 0, -0.26, nz + 0.04);
            return;
        }

        var sw = 0.44, sh = 0.32, sd = 0.28, sy = -0.16;
        if (fam === 'longsnout' || fam === 'lizardsnout') { sw = 0.42; sh = 0.34; sd = 0.46; }
        if (fam === 'wide' || fam === 'pig') { sw = 0.56; sd = 0.22; }
        box(mats, head, sw, sh, sd, snoutCol, 0, sy, nz + sd / 2 - 0.02);

        if (fam === 'pig' || fam === 'wide') {
            box(mats, head, 0.34, 0.16, 0.08, '#e38ba6', 0, sy, nz + sd - 0.01);
            if (fam === 'pig') {
                box(mats, head, 0.06, 0.08, 0.04, '#8a4d5c', -0.08, sy, nz + sd + 0.02);
                box(mats, head, 0.06, 0.08, 0.04, '#8a4d5c', 0.08, sy, nz + sd + 0.02);
            }
        } else if (fam === 'horn') {
            cone(mats, head, 0.12, 0.3, 5, '#e6e1d5', 0, sy + 0.18, nz + sd + 0.02, Math.PI / 2, 0, 0);
        } else {
            box(mats, head, 0.16, 0.12, 0.08, noseColor, 0, sy + 0.05, nz + sd - 0.01);
        }

        if (nose === 'smile' || nose === 'blep' || nose === 'teeth' || fam === 'snout' || fam === 'longsnout') {
            var mouthY = sy - 0.12;
            box(mats, head, 0.3, 0.05, 0.05, '#3a2a2a', 0, mouthY, nz + sd - 0.02);
            if (nose === 'blep') {
                box(mats, head, 0.14, 0.14, 0.06, '#e0708a', 0, mouthY - 0.07, nz + sd);
            } else if (nose === 'teeth') {
                box(mats, head, 0.16, 0.12, 0.05, '#ffffff', 0, mouthY - 0.08, nz + sd - 0.01);
            }
        }
    }

    // ------------------------------------------------------------------- eyes
    function buildEyes(head, mats, eyes, eyeCol, hw, hh, hd, baseCol) {
        var z = hd / 2 + 0.01;
        var y = 0.06;
        var dx = hw * 0.21;
        var eyeW = 0.2, eyeH = 0.24;
        var e = eyes || 'standard';

        function pair(col, shape) {
            [-dx, dx].forEach(function (x) {
                if (shape === 'x') {
                    box(mats, head, 0.03, eyeH, 0.05, col, x, y, z, 0, 0, 0.7);
                    box(mats, head, 0.03, eyeH, 0.05, col, x, y, z, 0, 0, -0.7);
                } else if (shape === 'closed') {
                    box(mats, head, eyeW, 0.05, 0.05, col, x, y, z);
                } else if (shape === 'heart') {
                    box(mats, head, 0.1, 0.1, 0.05, col, x - 0.04, y + 0.02, z, 0, 0, Math.PI / 4);
                    box(mats, head, 0.1, 0.1, 0.05, col, x + 0.04, y + 0.02, z, 0, 0, Math.PI / 4);
                    box(mats, head, 0.12, 0.12, 0.05, col, x, y - 0.05, z, 0, 0, Math.PI / 4);
                } else if (shape === 'star') {
                    box(mats, head, 0.04, 0.2, 0.05, col, x, y, z);
                    box(mats, head, 0.2, 0.04, 0.05, col, x, y, z);
                    box(mats, head, 0.04, 0.2, 0.05, col, x, y, z, 0, 0, Math.PI / 4);
                    box(mats, head, 0.04, 0.2, 0.05, col, x, y, z, 0, 0, -Math.PI / 4);
                } else {
                    box(mats, head, eyeW, eyeH, 0.06, col, x, y, z);
                }
            });
        }

        switch (e) {
            case 'closed': pair('#3a2a2a', 'closed'); break;
            case 'x_eyes': case 'cross': pair('#3a2a2a', 'x'); break;
            case 'heart': pair('#ff3d6e', 'heart'); break;
            case 'star': pair('#ffd24d', 'star'); break;
            case 'dollar': pair('#3fae4a', 'star'); break;
            case 'sparkle': case 'anime': case 'galaxy': case 'spiral': case 'dizzy': case 'fire':
                pair(e === 'fire' ? '#ff7a1a' : (eyeCol || '#222222'), 'round');
                [-dx, dx].forEach(function (x) {
                    box(mats, head, 0.06, 0.06, 0.05, '#ffffff', x + 0.05, y + 0.06, z + 0.01);
                });
                break;
            case 'glasses': case 'sunglasses':
                pair(e === 'sunglasses' ? '#101010' : '#2a2a2a', 'round');
                box(mats, head, hw * 0.95, 0.05, 0.05, '#1a1a1a', 0, y + 0.14, z);
                box(mats, head, 0.04, 0.24, 0.05, '#1a1a1a', -dx - 0.1, y, z);
                box(mats, head, 0.04, 0.24, 0.05, '#1a1a1a', dx + 0.1, y, z);
                box(mats, head, 0.16, 0.05, 0.05, '#1a1a1a', 0, y, z);
                break;
            case 'monocle':
                pair('#222222', 'round');
                torus(mats, head, 0.16, 0.02, '#d4af37', dx, y, z + 0.02);
                break;
            case 'eyepatch':
                box(mats, head, 0.24, 0.26, 0.05, '#111111', dx, y, z);
                box(mats, head, hw, 0.05, 0.05, '#111111', 0, y + 0.16, z);
                box(mats, head, eyeW, eyeH, 0.06, eyeCol || '#222222', -dx, y, z);
                break;
            case 'wink':
                box(mats, head, eyeW, eyeH, 0.06, eyeCol || '#222222', -dx, y, z);
                box(mats, head, eyeW, 0.05, 0.05, '#3a2a2a', dx, y, z);
                break;
            case 'crying':
                pair(eyeCol || '#222222', 'round');
                box(mats, head, 0.06, 0.18, 0.05, '#7fd0ff', -dx, y - 0.2, z);
                box(mats, head, 0.06, 0.18, 0.05, '#7fd0ff', dx, y - 0.2, z);
                break;
            case 'angry': case 'wolf': case 'demon':
                pair(e === 'demon' ? '#ff2d2d' : (eyeCol || '#222222'), 'round');
                box(mats, head, 0.24, 0.06, 0.05, '#3a2a2a', -dx, y + 0.16, z, 0, 0, -0.5);
                box(mats, head, 0.24, 0.06, 0.05, '#3a2a2a', dx, y + 0.16, z, 0, 0, 0.5);
                break;
            case 'sleepy': case 'tired':
                pair(eyeCol || '#222222', 'round');
                box(mats, head, eyeW + 0.04, 0.1, 0.05, baseCol, -dx, y + 0.1, z + 0.005);
                box(mats, head, eyeW + 0.04, 0.1, 0.05, baseCol, dx, y + 0.1, z + 0.005);
                break;
            case 'protogen': case 'robot':
                box(mats, head, hw * 0.82, 0.2, 0.06, '#0b0b0b', 0, y, z);
                box(mats, head, hw * 0.5, 0.07, 0.05, e === 'robot' ? '#3dff7a' : '#3dd7ff', 0, y, z + 0.02);
                break;
            case 'beady': case 'dot':
                [-dx, dx].forEach(function (x) { box(mats, head, 0.1, 0.1, 0.06, eyeCol || '#111111', x, y, z); });
                break;
            case 'wide': case 'frog':
                [-dx, dx].forEach(function (x) {
                    sphere(mats, head, 0.17, '#ffffff', x, y + 0.04, z + 0.02, 1, 1, 0.7);
                    box(mats, head, 0.12, 0.12, 0.06, eyeCol || '#111111', x, y + 0.04, z + 0.14);
                });
                break;
            case 'owl': case 'cute':
                [-dx, dx].forEach(function (x) {
                    sphere(mats, head, 0.2, '#ffffff', x, y, z + 0.02, 1, 1, 0.6);
                    box(mats, head, 0.15, 0.16, 0.06, eyeCol || '#111111', x, y, z + 0.12);
                });
                break;
            case 'alien':
                pair('#000000', 'round');
                break;
            case 'cat_eyes': case 'dragon': case 'snake': case 'shark':
                pair(e === 'cat_eyes' ? '#8bd450' : (eyeCol || '#d4af37'), 'round');
                [-dx, dx].forEach(function (x) { box(mats, head, 0.04, 0.18, 0.04, '#101010', x, y, z + 0.03); });
                break;
            default:
                pair(eyeCol || '#222222', 'round');
        }
    }

    // ------------------------------------------------------------------- ears
    function buildEars(head, mats, ears, cfg, baseCol, hw, hh, hd) {
        var fam = EAR_FAMILY[ears] || 'none';
        if (fam === 'none') return;
        var inner = cfg.earsColor || shade(baseCol, -0.25);
        var top = hh / 2;
        var side = hw / 2;

        function pointed(scale, tilt) {
            [-1, 1].forEach(function (s) {
                var e = cone(mats, head, 0.16 * scale, 0.42 * scale, 4, baseCol, s * (side * 0.62), top + 0.16 * scale, 0, 0, 0, -s * tilt);
                e.scale.z = 0.5;
                var ie = cone(mats, head, 0.08 * scale, 0.24 * scale, 4, inner, s * (side * 0.62), top + 0.13 * scale, 0.05, 0, 0, -s * tilt);
                ie.scale.z = 0.4;
            });
        }
        function roundEars(scale) {
            [-1, 1].forEach(function (s) {
                sphere(mats, head, 0.2 * scale, baseCol, s * (side * 0.82), top + 0.04, -0.02, 1, 1, 0.6);
                sphere(mats, head, 0.11 * scale, inner, s * (side * 0.82), top + 0.04, 0.04, 1, 1, 0.4);
            });
        }
        function sideDiscs(scale) {
            [-1, 1].forEach(function (s) {
                cyl(mats, head, 0.22 * scale, 0.22 * scale, 0.08, 10, baseCol, s * (side + 0.02), top - 0.02, -0.02, 0, 0, Math.PI / 2);
                cyl(mats, head, 0.12 * scale, 0.12 * scale, 0.03, 10, inner, s * (side + 0.06), top - 0.02, -0.02, 0, 0, Math.PI / 2);
            });
        }
        function longEars() {
            [-1, 1].forEach(function (s) {
                box(mats, head, 0.18, 0.7, 0.16, baseCol, s * 0.2, top + 0.32, -0.02, 0, 0, -s * 0.12);
                box(mats, head, 0.09, 0.5, 0.1, inner, s * 0.2, top + 0.3, 0.05, 0, 0, -s * 0.12);
            });
        }
        function floppy() {
            [-1, 1].forEach(function (s) {
                box(mats, head, 0.2, 0.42, 0.18, baseCol, s * (side + 0.05), top - 0.12, -0.02, 0, 0, s * 0.7);
            });
        }
        function horns() {
            [-1, 1].forEach(function (s) {
                cone(mats, head, 0.11, 0.34, 6, '#e8e2d4', s * 0.26, top + 0.16, -0.02, 0, 0, -s * 0.4);
            });
        }
        function antlers() {
            [-1, 1].forEach(function (s) {
                var g = new THREE.Group();
                g.position.set(s * 0.24, top, -0.02);
                head.add(g);
                cyl(mats, g, 0.05, 0.06, 0.5, 6, '#8a6a43', 0, 0.25, 0);
                cyl(mats, g, 0.04, 0.05, 0.34, 6, '#8a6a43', s * 0.14, 0.44, 0, 0, 0, -s * 0.7);
                cyl(mats, g, 0.035, 0.045, 0.3, 6, '#8a6a43', -s * 0.08, 0.52, 0, 0, 0, s * 0.8);
            });
        }
        function tufts() {
            [-1, 1].forEach(function (s) {
                cone(mats, head, 0.12, 0.26, 4, baseCol, s * 0.28, top + 0.1, -0.02, 0, 0, -s * 0.5);
            });
        }
        function fins() {
            [-1, 1].forEach(function (s) {
                var f = cone(mats, head, 0.2, 0.42, 4, baseCol, s * (side + 0.08), top - 0.2, -0.1, Math.PI / 2, 0, s * 0.5);
                f.scale.z = 0.25;
            });
        }
        function ossicones() {
            [-1, 1].forEach(function (s) {
                cyl(mats, head, 0.05, 0.06, 0.26, 6, baseCol, s * 0.22, top + 0.13, -0.02);
                sphere(mats, head, 0.07, '#5a4632', s * 0.22, top + 0.28, -0.02);
            });
        }
        function spikes() {
            for (var i = -2; i <= 2; i++) {
                cone(mats, head, 0.09, 0.26, 5, shade(baseCol, -0.35), i * 0.16, top + 0.12, -0.06, -0.2, 0, 0);
            }
        }
        function visor() {
            [-1, 1].forEach(function (s) {
                box(mats, head, 0.12, 0.3, 0.3, '#cfd4dc', s * (side * 0.9), top + 0.06, -0.02, 0, 0, -s * 0.2);
            });
        }

        switch (fam) {
            case 'pointed': pointed(1.15, 0.32); break;
            case 'smallpoint': pointed(0.8, 0.25); break;
            case 'long': longEars(); break;
            case 'floppy': floppy(); break;
            case 'round': roundEars(1.0); break;
            case 'biground': sideDiscs(1.4); break;
            case 'horn': horns(); break;
            case 'antler': antlers(); break;
            case 'tuft': tufts(); break;
            case 'fin': fins(); break;
            case 'ossicone': ossicones(); break;
            case 'spike': spikes(); break;
            case 'visor': visor(); break;
        }
    }

    // ------------------------------------------------------------------- hair
    function buildHair(head, mats, hairId, col, hw, hh, hd) {
        var kind = HAIR_KIND[hairId] || (hairId && hairId !== 'none' ? 'buzz' : 'none');
        if (kind === 'none') return;
        var top = hh / 2, side = hw / 2;
        var capH = 0.18;

        if (kind !== 'afro' && kind !== 'curly' && kind !== 'mohawk') {
            box(mats, head, hw + 0.06, capH, hd + 0.06, col, 0, top - capH / 2 + 0.02, 0);
        }

        var i;
        switch (kind) {
            case 'buzz':
                box(mats, head, hw + 0.06, 0.1, hd + 0.06, col, 0, top - 0.02, 0);
                break;
            case 'bob':
                box(mats, head, hw + 0.06, 0.5, hd + 0.06, col, 0, top - 0.22, 0);
                break;
            case 'long':
                box(mats, head, hw + 0.06, 0.9, 0.16, col, 0, top - 0.5, -hd / 2 - 0.02);
                box(mats, head, 0.14, 0.7, hd + 0.06, col, -side - 0.02, top - 0.35, 0);
                box(mats, head, 0.14, 0.7, hd + 0.06, col, side + 0.02, top - 0.35, 0);
                break;
            case 'messy':
                box(mats, head, hw + 0.06, capH, hd + 0.06, col, 0, top - capH / 2 + 0.02, 0);
                box(mats, head, hw * 0.4, 0.22, 0.2, col, -side * 0.4, top + 0.1, 0.05, 0, 0, 0.3);
                box(mats, head, hw * 0.5, 0.22, 0.2, col, side * 0.3, top + 0.08, 0.02, 0, 0, -0.25);
                break;
            case 'spiky':
                for (i = -2; i <= 2; i++) {
                    cone(mats, head, 0.09, 0.34, 4, col, i * 0.16, top + 0.14, 0, 0, 0, i * 0.14);
                }
                break;
            case 'mohawk':
                for (i = -2; i <= 2; i++) {
                    cone(mats, head, 0.08, 0.36, 4, col, 0, top + 0.16, i * 0.15, i * 0.16, 0, 0);
                }
                break;
            case 'ponytail':
                box(mats, head, 0.3, 0.34, 0.3, col, 0, top - 0.05, -side * 0.6);
                cyl(mats, head, 0.07, 0.05, 0.55, 6, col, 0, top - 0.35, -hd / 2 - 0.1, 0.5, 0, 0);
                break;
            case 'braid':
                cyl(mats, head, 0.07, 0.05, 0.5, 6, col, 0, top - 0.35, -hd / 2 - 0.12, 0.6, 0, 0);
                break;
            case 'pigtails':
                [-1, 1].forEach(function (s) {
                    sphere(mats, head, 0.18, col, s * (side + 0.06), top - 0.16, -0.05);
                });
                break;
            case 'twintails':
                [-1, 1].forEach(function (s) {
                    cyl(mats, head, 0.1, 0.06, 0.7, 6, col, s * (side + 0.1), top - 0.3, -0.05, 0.2, 0, s * 0.3);
                });
                break;
            case 'afro':
                sphere(mats, head, hw * 0.62, col, 0, top + 0.06, -0.04);
                break;
            case 'curly':
                box(mats, head, hw + 0.04, 0.22, hd + 0.04, col, 0, top - 0.05, 0);
                [-1, 1].forEach(function (s) {
                    sphere(mats, head, 0.16, col, s * (side - 0.05), top + 0.12, 0.02);
                });
                break;
            case 'bun':
                box(mats, head, hw + 0.06, 0.24, hd + 0.06, col, 0, top - 0.08, 0);
                sphere(mats, head, 0.16, col, 0, top + 0.2, -0.06);
                break;
            case 'topknot':
                box(mats, head, hw + 0.06, 0.24, hd + 0.06, col, 0, top - 0.08, 0);
                box(mats, head, 0.22, 0.22, 0.22, col, 0, top + 0.18, -0.05);
                break;
            case 'pompadour':
                box(mats, head, hw + 0.06, 0.3, hd + 0.06, col, 0, top - 0.12, 0);
                box(mats, head, hw * 0.6, 0.28, 0.34, col, 0, top + 0.12, 0.07, -0.3, 0, 0);
                break;
            case 'bangs':
                box(mats, head, hw + 0.06, 0.3, hd + 0.06, col, 0, top - 0.12, 0);
                box(mats, head, hw + 0.08, 0.18, 0.12, col, 0, top - 0.24, hd / 2 + 0.02);
                break;
            case 'emo':
                box(mats, head, hw + 0.06, 0.3, hd + 0.06, col, 0, top - 0.12, 0);
                box(mats, head, hw * 0.5, 0.36, 0.14, col, -side * 0.4, top - 0.15, hd / 2 + 0.06);
                break;
            case 'mullet':
                box(mats, head, hw + 0.06, 0.24, hd + 0.06, col, 0, top - 0.1, 0);
                box(mats, head, hw * 0.9, 0.5, 0.16, col, 0, top - 0.4, -hd / 2 - 0.06);
                break;
            case 'dreads':
                for (i = -3; i <= 3; i++) {
                    box(mats, head, 0.07, 0.55, 0.07, col, i * 0.14, top - 0.15, -hd / 2 - 0.02);
                }
                break;
            case 'wavy':
                box(mats, head, hw + 0.06, 0.3, hd + 0.06, col, 0, top - 0.12, 0);
                box(mats, head, 0.12, 0.5, hd + 0.06, col, -side - 0.02, top - 0.28, 0);
                box(mats, head, 0.12, 0.5, hd + 0.06, col, side + 0.02, top - 0.28, 0);
                break;
        }
    }

    // -------------------------------------------------------------------- hat
    function buildHat(head, mats, hatId, hw, hh, hd) {
        var hat = null;
        try {
            if (typeof HAT_TYPES !== 'undefined') hat = HAT_TYPES.find(function (h) { return h.id === hatId; });
        } catch (e) { }
        if (!hat || hat.id === 'none') return;
        var col = hat.color || '#ffffff';
        var top = hh / 2;
        var t = hat.type;
        var i;

        switch (t) {
            case 'cap':
                box(mats, head, hw * 0.96, 0.16, hd * 0.96, col, 0, top + 0.05, 0);
                box(mats, head, hw * 1.0, 0.08, 0.34, col, 0, top + 0.01, hd / 2 + 0.14);
                break;
            case 'dome':
                sphere(mats, head, hw * 0.5, col, 0, top + 0.02, 0, 1, 0.75, 1);
                break;
            case 'wide':
                cyl(mats, head, hw * 0.52, hw * 0.56, 0.2, 12, col, 0, top + 0.08, 0);
                cyl(mats, head, hw * 1.05, hw * 1.05, 0.05, 16, col, 0, top - 0.02, 0);
                break;
            case 'flower':
                sphere(mats, head, 0.1, col, -0.2, top + 0.08, hd / 4);
                sphere(mats, head, 0.1, shade(col, -0.15), 0.2, top + 0.08, hd / 4);
                sphere(mats, head, 0.06, '#ffd24d', 0, top + 0.08, hd / 4);
                break;
            case 'fedora':
                cyl(mats, head, hw * 0.5, hw * 0.54, 0.24, 12, col, 0, top + 0.1, 0);
                cyl(mats, head, hw * 0.9, hw * 0.9, 0.05, 16, col, 0, top - 0.02, 0);
                cyl(mats, head, hw * 0.52, hw * 0.52, 0.06, 12, '#111111', 0, top + 0.02, 0);
                break;
            case 'beret':
                sphere(mats, head, hw * 0.52, col, 0.05, top + 0.06, 0, 1, 0.5, 1);
                box(mats, head, 0.06, 0.06, 0.06, col, 0.08, top + 0.18, 0);
                break;
            case 'bucket':
                cyl(mats, head, hw * 0.62, hw * 0.5, 0.22, 12, col, 0, top + 0.06, 0);
                cyl(mats, head, hw * 0.86, hw * 0.86, 0.05, 16, col, 0, top - 0.04, 0);
                break;
            case 'headphones':
                torus(mats, head, hw * 0.55, 0.05, col, 0, top, 0, 0, 0, 0);
                cyl(mats, head, 0.14, 0.14, 0.1, 10, col, -hw * 0.52, 0, 0, 0, 0, Math.PI / 2);
                cyl(mats, head, 0.14, 0.14, 0.1, 10, col, hw * 0.52, 0, 0, 0, 0, Math.PI / 2);
                break;
            case 'tall':
                cyl(mats, head, hw * 0.46, hw * 0.46, 0.55, 12, col, 0, top + 0.28, 0);
                cyl(mats, head, hw * 0.72, hw * 0.72, 0.05, 16, col, 0, top - 0.02, 0);
                break;
            case 'sombrero':
                cyl(mats, head, hw * 0.48, hw * 0.5, 0.24, 12, col, 0, top + 0.1, 0);
                cyl(mats, head, hw * 1.25, hw * 1.25, 0.05, 18, col, 0, top - 0.02, 0);
                break;
            case 'santa':
                cone(mats, head, hw * 0.5, 0.5, 8, col, 0, top + 0.25, 0);
                sphere(mats, head, 0.08, '#ffffff', 0, top + 0.52, 0);
                break;
            case 'witch':
                cone(mats, head, hw * 0.55, 0.75, 8, col, 0, top + 0.36, 0);
                cyl(mats, head, hw * 1.0, hw * 1.0, 0.05, 16, col, 0, top - 0.02, 0);
                break;
            case 'ninja':
                box(mats, head, hw + 0.04, 0.16, hd + 0.04, col, 0, 0.02, 0);
                break;
            case 'propeller':
                box(mats, head, hw * 0.9, 0.16, hd * 0.9, col, 0, top + 0.05, 0);
                cyl(mats, head, 0.02, 0.02, 0.14, 6, '#333333', 0, top + 0.18, 0);
                box(mats, head, 0.55, 0.03, 0.1, '#ffcc00', 0, top + 0.25, 0);
                break;
            case 'horn':
                [-1, 1].forEach(function (s) {
                    cone(mats, head, 0.1, 0.32, 6, '#e8e2d4', s * 0.34, top + 0.14, 0, 0, 0, -s * 0.5);
                });
                break;
            case 'halo':
                torus(mats, head, 0.32, 0.03, col, 0, top + 0.22, 0);
                break;
            case 'antlers':
                [-1, 1].forEach(function (s) {
                    var g = new THREE.Group();
                    g.position.set(s * 0.22, top, -0.02);
                    head.add(g);
                    cyl(mats, g, 0.045, 0.055, 0.4, 6, col, 0, 0.2, 0);
                    cyl(mats, g, 0.035, 0.045, 0.3, 6, col, s * 0.12, 0.38, 0, 0, 0, -s * 0.8);
                    cyl(mats, g, 0.03, 0.04, 0.26, 6, col, -s * 0.06, 0.46, 0, 0, 0, s * 0.9);
                });
                break;
            case 'police':
                box(mats, head, hw * 0.98, 0.18, hd * 0.98, col, 0, top + 0.06, 0);
                box(mats, head, hw * 1.0, 0.06, 0.28, col, 0, top, hd / 2 + 0.12);
                break;
            case 'tv':
                box(mats, head, hw + 0.06, hh * 0.7, hd + 0.06, col, 0, top + 0.3, 0);
                box(mats, head, hw * 0.7, 0.3, 0.05, '#111111', 0, top + 0.3, hd / 2 + 0.05);
                break;
            case 'crown':
                cyl(mats, head, hw * 0.5, hw * 0.55, 0.1, 12, col, 0, top + 0.04, 0);
                for (i = -2; i <= 2; i++) {
                    cone(mats, head, 0.08, 0.2, 4, col, i * hw * 0.2, top + 0.14, 0);
                }
                break;
            case 'rainbow':
                sphere(mats, head, hw * 0.62, col, 0, top + 0.06, -0.04);
                break;
            case 'void':
                sphere(mats, head, hw * 0.6, col, 0, top + 0.02, 0, 1, 0.9, 1);
                box(mats, head, hw + 0.04, 0.2, hd + 0.04, col, 0, 0.12, 0);
                break;
            case 'diamond':
                cyl(mats, head, hw * 0.5, hw * 0.54, 0.1, 12, col, 0, top + 0.04, 0);
                cone(mats, head, 0.08, 0.16, 4, col, 0, top + 0.16, 0);
                cone(mats, head, 0.06, 0.12, 4, col, -hw * 0.3, top + 0.12, 0);
                cone(mats, head, 0.06, 0.12, 4, col, hw * 0.3, top + 0.12, 0);
                break;
            case 'banana':
                (function () {
                    var g = new THREE.Group();
                    g.position.set(0, top + 0.05, 0);
                    g.rotation.z = -0.3;
                    head.add(g);
                    var bm = new THREE.MeshBasicMaterial({ color: parseColor('#ffe135') });
                    [[-0.24, 0], [-0.1, 0.06], [0.04, 0.1], [0.18, 0.06], [0.3, 0]].forEach(function (p) {
                        var m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), bm);
                        m.position.set(p[0], p[1], 0);
                        g.add(m);
                    });
                })();
                break;
            default:
                cyl(mats, head, hw * 0.5, hw * 0.5, 0.2, 12, col, 0, top + 0.06, 0);
                cyl(mats, head, hw * 0.95, hw * 0.95, 0.05, 16, col, 0, top - 0.02, 0);
        }
    }

    // ------------------------------------------------------------------- misc
    function buildMisc(root, head, mats, misc, cfg, baseCol, hw, hh, hd) {
        var col = cfg.miscColor || baseCol;
        var headTop = hh / 2;
        var nz = hd / 2;
        switch (misc) {
            case 'dragon_wings': case 'angel_wings': case 'bat_wings':
                wings(root, mats, col, misc === 'angel_wings');
                break;
            case 'axolotl_gills':
                [-1, 1].forEach(function (s) {
                    for (var k = 0; k < 3; k++) {
                        box(mats, head, 0.1, 0.1, 0.34, col, s * (hw / 2 + 0.04), 0.16 - k * 0.14, -0.06, 0, 0, -s * (0.5 + k * 0.2));
                    }
                });
                break;
            case 'wolf_ruff':
                sphere(mats, root, 0.42, shade(col, 0.1), 0, TORSO_Y + TORSO_H / 2 + 0.02, -0.04, 1, 0.6, 1);
                break;
            case 'deer_spots':
                spots(root, mats, '#f4e6c8');
                break;
            case 'owl_feathers':
                box(mats, root, 0.5, 0.66, 0.05, shade(col, 0.1), 0, TORSO_Y, 0.31);
                break;
            case 'shark_fin': case 'dolphin_fin':
                cone(mats, root, 0.14, 0.34, 4, shade(col, -0.05), 0, TORSO_Y + 0.28, -0.32, -0.5, 0, 0);
                break;
            case 'protogen_visor':
                box(mats, head, hw * 0.86, 0.22, 0.06, '#0b0b0b', 0, 0.06, nz + 0.02);
                box(mats, head, hw * 0.52, 0.08, 0.05, '#3dd7ff', 0, 0.06, nz + 0.04);
                break;
            case 'demon_horns':
                cone(mats, head, 0.09, 0.3, 5, '#5a1a1a', -0.3, headTop + 0.1, 0, 0, 0, 0.4);
                cone(mats, head, 0.09, 0.3, 5, '#5a1a1a', 0.3, headTop + 0.1, 0, 0, 0, -0.4);
                break;
            case 'halo':
                torus(mats, root, 0.34, 0.03, '#ffe98a', 0, 1.66, 0);
                break;
            case 'hedgehog_spines':
                for (var i = -2; i <= 2; i++) {
                    for (var j = -1; j <= 1; j++) {
                        cone(mats, root, 0.07, 0.22, 4, shade(baseCol, -0.4), i * 0.16, 0.35, -0.3 + j * 0.14, -0.9, 0, 0);
                    }
                }
                break;
            case 'fox_cheeks': case 'squirrel_cheeks': case 'hamster_cheeks':
                sphere(mats, head, 0.14, col, -0.4, -0.06, 0.3, 1, 1, 0.9);
                sphere(mats, head, 0.14, col, 0.4, -0.06, 0.3, 1, 1, 0.9);
                break;
            case 'panda_patches':
                box(mats, head, 0.3, 0.34, 0.05, '#111111', -0.2, 0.06, nz + 0.02);
                box(mats, head, 0.3, 0.34, 0.05, '#111111', 0.2, 0.06, nz + 0.02);
                break;
            case 'tiger_stripes': case 'zebra_stripes':
                stripes(root, mats, '#111111');
                break;
            case 'leopard_spots':
                spots(root, mats, '#111111');
                break;
            case 'snake_scales':
                spots(root, mats, shade(baseCol, -0.2));
                break;
            case 'otter_belly':
                box(mats, root, 0.5, 0.8, 0.06, '#e8d9b8', 0, -0.35, 0.32);
                break;
            case 'skunk_stripe':
                box(mats, root, 0.18, 0.5, 0.12, '#ffffff', 0, 0, -0.34);
                break;
            case 'raccoon_mask':
                box(mats, head, hw + 0.02, 0.16, 0.06, '#2a2a2a', 0, 0.18, nz + 0.01);
                break;
            case 'penguin_belly':
                box(mats, root, 0.5, 0.9, 0.06, '#ffffff', 0, -0.35, 0.32);
                break;
            case 'lion_mane':
                for (var a = 0; a < 12; a++) {
                    var ang = (a / 12) * Math.PI * 2;
                    cone(mats, head, 0.1, 0.22, 4, shade(baseCol, 0.18), Math.cos(ang) * 0.52, Math.sin(ang) * 0.5, -0.1, 0, 0, -ang);
                }
                break;
            case 'freckles':
                box(mats, head, 0.03, 0.03, 0.03, '#a56a3a', -0.3, 0.0, nz + 0.03);
                box(mats, head, 0.03, 0.03, 0.03, '#a56a3a', 0.3, 0.0, nz + 0.03);
                break;
            case 'blush':
                box(mats, head, 0.16, 0.08, 0.04, '#ff8fa3', -0.36, -0.08, nz + 0.02);
                box(mats, head, 0.16, 0.08, 0.04, '#ff8fa3', 0.36, -0.08, nz + 0.02);
                break;
            case 'scars':
                box(mats, head, 0.03, 0.22, 0.04, '#c06060', -0.24, 0.12, nz + 0.03, 0, 0, 0.3);
                break;
            case 'bandage':
                box(mats, head, 0.3, 0.1, 0.04, '#f2e3c0', 0.24, 0.2, nz + 0.03, 0, 0, 0.1);
                break;
            case 'whiskers_long':
                for (var w = -1; w <= 1; w++) {
                    box(mats, head, 0.4, 0.02, 0.02, '#f0f0f0', -0.4, -0.08 + w * 0.08, 0.34, 0, -0.3, 0);
                    box(mats, head, 0.4, 0.02, 0.02, '#f0f0f0', 0.4, -0.08 + w * 0.08, 0.34, 0, 0.3, 0);
                }
                break;
        }
    }

    function wings(root, mats, col, feathered) {
        [-1, 1].forEach(function (s) {
            var g = new THREE.Group();
            g.position.set(s * 0.32, 0.02, -0.34);
            root.add(g);
            var n = feathered ? 5 : 4;
            for (var i = 0; i < n; i++) {
                box(mats, g, 0.14, 0.6 + i * 0.1, 0.05, i % 2 ? shade(col, 0.12) : col,
                    s * (0.1 + i * 0.14), 0.1 + i * 0.05, 0, 0, 0, s * (0.5 + i * 0.12));
            }
        });
    }

    function stripes(root, mats, col) {
        for (var i = -1; i <= 2; i++) {
            box(mats, root, 0.94, 0.07, 0.64, col, 0, -0.9 + i * 0.35, 0);
        }
    }

    function spots(root, mats, col) {
        [[-0.25, 0.1], [0.25, -0.05], [0, 0.3], [-0.3, -0.4], [0.3, -0.5]].forEach(function (p) {
            box(mats, root, 0.16, 0.16, 0.62, col, p[0], p[1], 0);
        });
    }

    // ------------------------------------------------------------------- tail
    function buildTail(root, mats, tailId, cfg, baseCol) {
        var fam = TAIL_FAMILY[tailId] || 'none';
        if (fam === 'none') return;
        var col = cfg.tailColor || baseCol;
        var baseZ = -0.36, baseY = -0.45;
        var tip = cfg.tailColor ? col : shade(col, 0.15);
        var i;

        switch (fam) {
            case 'thin':
                for (i = 0; i < 4; i++) {
                    box(mats, root, 0.1, 0.1, 0.24, i === 3 ? tip : col, 0, baseY + i * 0.16, baseZ - i * 0.12);
                }
                break;
            case 'long':
                for (i = 0; i < 6; i++) {
                    box(mats, root, 0.1 - i * 0.008, 0.1, 0.22, col, 0, baseY + i * 0.14, baseZ - i * 0.12);
                }
                break;
            case 'bushy':
                for (i = 0; i < 5; i++) {
                    var r = 0.14 + i * 0.04;
                    sphere(mats, root, r, i === 4 ? tip : col, 0, baseY + i * 0.16, baseZ - i * 0.12, 1, 1.2, 1);
                }
                break;
            case 'puff':
                sphere(mats, root, 0.18, tip, 0, baseY, baseZ - 0.1);
                break;
            case 'curly':
                for (i = 0; i < 5; i++) {
                    var ang = i * 1.1;
                    box(mats, root, 0.1, 0.1, 0.12, col, Math.sin(ang) * 0.16, baseY + i * 0.05, baseZ - i * 0.1);
                }
                break;
            case 'spike':
                for (i = 0; i < 4; i++) {
                    box(mats, root, 0.16, 0.16, 0.2, col, 0, baseY + i * 0.14, baseZ - i * 0.12);
                    cone(mats, root, 0.06, 0.18, 4, shade(col, -0.2), 0, baseY + 0.1 + i * 0.14, baseZ - i * 0.12);
                }
                break;
            case 'stripe':
                for (i = 0; i < 4; i++) {
                    box(mats, root, 0.16, 0.16, 0.2, i % 2 ? '#111111' : col, 0, baseY + i * 0.14, baseZ - i * 0.12);
                }
                break;
            case 'spot':
                for (i = 0; i < 4; i++) {
                    box(mats, root, 0.16, 0.16, 0.2, col, 0, baseY + i * 0.14, baseZ - i * 0.12);
                    box(mats, root, 0.18, 0.06, 0.22, '#111111', 0, baseY + 0.05 + i * 0.14, baseZ - i * 0.12);
                }
                break;
            case 'fin':
                box(mats, root, 0.08, 0.42, 0.42, col, 0, baseY + 0.1, baseZ - 0.16, 0.4, 0, 0);
                break;
            case 'paddle':
                box(mats, root, 0.34, 0.12, 0.5, col, 0, baseY, baseZ - 0.24);
                break;
            case 'flat':
                box(mats, root, 0.34, 0.1, 0.44, shade(col, -0.1), 0, baseY, baseZ - 0.2);
                break;
            case 'feather':
                for (i = -1; i <= 1; i++) {
                    box(mats, root, 0.08, 0.5, 0.12, i % 2 ? shade(col, 0.15) : col, i * 0.14, baseY - 0.1, baseZ - 0.14, 0.5, 0, i * 0.3);
                }
                break;
            case 'puff2':
                break;
            case 'tuft':
                box(mats, root, 0.1, 0.1, 0.3, col, 0, baseY + 0.2, baseZ - 0.1);
                sphere(mats, root, 0.12, tip, 0, baseY + 0.36, baseZ - 0.2);
                break;
            case 'mech':
                box(mats, root, 0.12, 0.12, 0.4, '#8a9099', 0, baseY, baseZ - 0.2);
                box(mats, root, 0.08, 0.08, 0.14, '#3dd7ff', 0, baseY, baseZ - 0.42);
                break;
        }
    }

    // ---------------------------------------------------------------- pattern
    function buildPattern(root, head, mats, patternId, baseCol, tw, td, hw, hh, hd) {
        if (!patternId || patternId === 'none') return;
        var pat = null;
        try {
            if (typeof PATTERN_TYPES !== 'undefined') pat = PATTERN_TYPES.find(function (p) { return p.id === patternId; });
        } catch (e) { }
        var c = (pat && pat.color) ? pat.color : '#111111';
        var nz = hd / 2;

        if (patternId === 'tuxedo') {
            box(mats, root, tw * 0.5, TORSO_H * 0.8, 0.05, '#ffffff', 0, TORSO_Y, td / 2 + 0.01);
            box(mats, root, 0.5, 0.5, 0.05, '#ffffff', 0, -0.05, nz + 0.01);
        } else if (patternId === 'calico') {
            box(mats, root, tw * 0.5, TORSO_H * 0.5, 0.05, '#e08a3c', -tw * 0.22, TORSO_Y + 0.2, td / 2 + 0.01);
            box(mats, root, 0.5, 0.5, 0.05, '#111111', tw * 0.22, 0.05, nz + 0.01);
        } else if (patternId === 'tabby' || patternId === 'stripes') {
            stripes(root, mats, cfgPatternColor(patternId, '#111111'));
            box(mats, root, hw * 0.9, 0.06, hd + 0.02, cfgPatternColor(patternId, '#111111'), 0, 0.2, 0);
        } else if (patternId === 'cow' || patternId === 'dalmatian' || patternId === 'spots') {
            spots(root, mats, cfgPatternColor(patternId, '#111111'));
        } else if (patternId === 'hearts') {
            box(mats, root, 0.18, 0.18, 0.62, '#ff69b4', -0.2, 0.1, 0, 0, 0, Math.PI / 4);
            box(mats, root, 0.18, 0.18, 0.62, '#ff69b4', 0.22, -0.3, 0, 0, 0, Math.PI / 4);
        } else if (patternId === 'stars') {
            box(mats, root, 0.05, 0.22, 0.62, '#ffd700', 0, 0.1, 0);
            box(mats, root, 0.22, 0.05, 0.62, '#ffd700', 0, 0.1, 0);
        }
    }

    function cfgPatternColor(id, fallback) {
        try {
            if (typeof PATTERN_TYPES !== 'undefined') {
                var p = PATTERN_TYPES.find(function (t) { return t.id === id; });
                if (p && p.color) return p.color;
            }
        } catch (e) { }
        return fallback;
    }

    // -------------------------------------------------------------------- rod
    function buildRod(rodId) {
        var rod = null;
        try {
            if (typeof ROD_TYPES !== 'undefined') rod = ROD_TYPES.find(function (r) { return r.id === rodId; });
        } catch (e) { }
        if (!rod) rod = { color: '#DAA520', reel: '#8B4513' };
        var mats = new Map();
        var g = new THREE.Group();
        var col = rod.color || '#DAA520';
        var reel = rod.reel || '#8B4513';
        var len = 2.4;

        var blank = cyl(mats, g, 0.04, 0.07, len, 6, col, 0, len / 2, 0);
        blank.rotation.z = 0.14;
        cyl(mats, g, 0.09, 0.09, 0.5, 8, '#2b2b2b', 0, 0.25, 0);
        cyl(mats, g, 0.12, 0.12, 0.1, 10, reel, -0.12, 0.5, 0, 0, 0, Math.PI / 2);
        cyl(mats, g, 0.05, 0.05, 0.14, 8, '#111111', -0.2, 0.5, 0, 0, 0, Math.PI / 2);
        [0.9, 1.5, 2.05].forEach(function (y) {
            torus(mats, g, 0.06, 0.015, '#d9d9d9', 0.02, y, 0);
        });

        // Marker at the very tip of the blank so the fishing line can attach to
        // the real 3D tip (the 2D billboard used the fixed local point 3,3,0).
        var tipMarker = new THREE.Object3D();
        tipMarker.name = 'rodTip';
        tipMarker.position.set(0, len / 2, 0);
        blank.add(tipMarker);

        g.name = 'rod';
        return g;
    }

    window.Character3D = { build: build, buildRod: buildRod };
})();
