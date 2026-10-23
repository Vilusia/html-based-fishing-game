// ============================================================================
//  character3d.js  --  Procedural blocky 3D models.
//
//  Character3D.buildFish(name, colorHex) returns a THREE.Group: a blocky fish
//  used for the "showing off a catch" pose.  The group is modelled length-wise
//  along +X (head at +X) and centred on the origin, so the caller can position
//  and scale it.
// ============================================================================
(function () {
    if (typeof THREE === 'undefined') return;

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

    // -------------------------------------------------------------------- fish
    // Blocky 3D fish for the "showing off a catch" pose.  Modelled length-wise
    // along +X (head at +X), centred on the origin.  Each curated fish supplies
    // a `shape` in FISH_TYPES, so the model matches the species instead of
    // relying on name keywords.
    function buildFish(fishName, colorHex) {
        var name = String(fishName == null ? 'fish' : fishName).toLowerCase();
        function has(k) { return name.indexOf(k) !== -1; }

        var fd = null;
        try {
            if (typeof getFishByName === 'function') fd = getFishByName(fishName);
            if (!fd && typeof FISH_TYPES !== 'undefined') {
                fd = FISH_TYPES.find(function (f) { return f.name === fishName; });
            }
        } catch (e) { }

        var rarity = fd ? fd.rarity : 'Common';
        var shape = fd && fd.shape ? fd.shape : '';

        var colHex = (typeof colorHex === 'string' && colorHex) ? colorHex : '#7fae7f';
        if (has('golden') || has('gold')) colHex = '#e8b923';
        else if (has('ice') || has('frost')) colHex = '#9fd8ef';

        var mats = new Map();
        var g = new THREE.Group();
        var C = colHex;
        var C2 = shade(colHex, -0.14);   // fins
        var C3 = shade(colHex, -0.28);   // shaded panels
        var DARK = '#141823';
        var WHITE = '#ffffff';
        var UP = new THREE.Vector3(0, 1, 0);

        function eyesOn(x, y, z, r) {
            r = r || 0.055;
            sphere(mats, g, r, WHITE, x, y, z);
            sphere(mats, g, r, WHITE, x, y, -z);
            sphere(mats, g, r * 0.55, DARK, x + 0.02, y, z * 1.12);
            sphere(mats, g, r * 0.55, DARK, x + 0.02, y, -z * 1.12);
        }
        function ell(rx, ry, rz, c, x, y, z) {
            var m = sphere(mats, g, 1, c || C, x || 0, y || 0, z || 0);
            m.scale.set(rx, ry, rz);
            return m;
        }
        function dorsal(len, hgt, c, x, y) {
            var m = cone(mats, g, len, hgt, 4, c || C2, x || 0, (y == null ? hgt * 0.4 : y), 0);
            m.scale.z = 0.32;
            return m;
        }
        function pectorals(c, x, y) {
            box(mats, g, 0.2, 0.1, 0.04, c || C2, x == null ? 0.08 : x, y == null ? -0.06 : y, 0.13, 0.3, 0, -0.5);
            box(mats, g, 0.2, 0.1, 0.04, c || C2, x == null ? 0.08 : x, y == null ? -0.06 : y, -0.13, -0.3, 0, -0.5);
        }
        function tailFin(c, x, spread) {
            var m = cone(mats, g, 0.16, 0.3, 4, c || C2, x == null ? -0.5 : x, 0, 0);
            m.rotation.z = Math.PI / 2;
            m.scale.set(spread || 1.5, 1, 0.3);
            return m;
        }
        function forkTail(c, x, spread) {
            x = x == null ? -0.48 : x;
            spread = spread || 1;
            box(mats, g, 0.34, 0.09, 0.05, c || C2, x, 0.1 * spread, 0, 0, 0, 0.42);
            box(mats, g, 0.34, 0.09, 0.05, c || C2, x, -0.1 * spread, 0, 0, 0, -0.42);
        }
        function barbel(x, y, z, len, tilt, c) {
            var m = cyl(mats, g, 0.012, 0.022, len, 5, c || C3, x, y, z);
            m.rotation.z = -Math.PI / 2 + (tilt || 0);
            return m;
        }
        function bands(count, x0, x1, h, d, c) {
            for (var i = 0; i < count; i++) {
                var x = x0 + (x1 - x0) * (count === 1 ? 0.5 : i / (count - 1));
                box(mats, g, 0.035, h, d, c || C3, x, 0, 0);
            }
        }
        function finlets(x0, x1, y, c) {
            for (var i = 0; i < 4; i++) {
                var x = x0 + (x1 - x0) * (i / 3);
                cone(mats, g, 0.035, 0.1, 4, c || C2, x, y, 0);
            }
        }
        function spikes(bodyR, len) {
            for (var i = 0; i < 18; i++) {
                var a = i / 18 * Math.PI * 2, b = ((i % 3) - 1) * 0.55;
                var dir = new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)).normalize();
                var s = cone(mats, g, 0.04, len, 5, C3, 0, 0, 0);
                s.position.copy(dir).multiplyScalar(bodyR);
                s.quaternion.setFromUnitVectors(UP, dir);
            }
        }

        // === JUNK ============================================================
        if (shape === 'boot' || (!shape && has('boot'))) {
            box(mats, g, 0.4, 0.7, 0.46, C, -0.12, 0.14, 0);
            box(mats, g, 0.8, 0.34, 0.46, C3, 0.22, -0.3, 0);
            box(mats, g, 0.82, 0.1, 0.48, DARK, 0.22, -0.48, 0);

        // === LAKE ============================================================
        } else if (shape === 'panfish') {
            ell(0.34, 0.4, 0.17, C);
            ell(0.18, 0.21, 0.14, C, 0.25, 0.04, 0);
            for (var pi = 0; pi < 6; pi++) {
                var px = -0.24 + pi * 0.08;
                var sp = cone(mats, g, 0.045, 0.16 - pi * 0.01, 4, C2, px, 0.34 + Math.sin(pi * 0.4) * 0.03, 0);
                sp.rotation.z = -0.18;
            }
            box(mats, g, 0.5, 0.07, 0.05, C2, -0.03, -0.28, 0);
            tailFin(C2, -0.5, 1.7);
            pectorals(C2, 0.12, -0.02);
            eyesOn(0.3, 0.13, 0.15, 0.06);

        } else if (shape === 'perch') {
            ell(0.44, 0.23, 0.14, C);
            bands(5, -0.26, 0.25, 0.36, 0.23, C3);
            for (var pe = 0; pe < 5; pe++) {
                var pex = -0.2 + pe * 0.09;
                cone(mats, g, 0.045, 0.18, 4, C2, pex, 0.24, 0);
            }
            box(mats, g, 0.26, 0.09, 0.05, C2, -0.28, 0.18, 0);
            forkTail(C2, -0.5, 1.3);
            pectorals(C2, 0.08, -0.04);
            eyesOn(0.34, 0.09, 0.11, 0.055);

        } else if (shape === 'carp') {
            ell(0.43, 0.29, 0.16, C);
            ell(0.16, 0.19, 0.14, C, 0.34, 0.03, 0);
            box(mats, g, 0.5, 0.17, 0.05, C2, -0.02, 0.29, 0);
            barbel(0.46, -0.08, 0.05, 0.2, 0.2);
            barbel(0.46, -0.08, -0.05, 0.2, 0.2);
            tailFin(C2, -0.5, 1.8);
            pectorals(C2, 0.1, -0.08);
            eyesOn(0.36, 0.06, 0.13, 0.05);

        } else if (shape === 'bass') {
            ell(0.42, 0.25, 0.16, C);
            ell(0.18, 0.16, 0.15, C, 0.32, 0.04, 0);
            box(mats, g, 0.24, 0.08, 0.16, DARK, 0.38, -0.05, 0);
            for (var ba = 0; ba < 5; ba++) cone(mats, g, 0.045, 0.16, 4, C2, -0.02 + ba * 0.08, 0.26, 0);
            box(mats, g, 0.2, 0.09, 0.05, C2, -0.24, 0.22, 0);
            forkTail(C2, -0.5, 1.35);
            pectorals(C2, 0.1, -0.04);
            eyesOn(0.32, 0.11, 0.13, 0.055);

        } else if (shape === 'trout' || shape === 'salmon') {
            ell(0.46, 0.21, 0.14, C);
            ell(0.17, 0.15, 0.13, C, 0.35, 0.02, 0);
            var troutSpots = [[-0.22, 0.07], [-0.1, -0.04], [0.04, 0.06], [0.16, -0.03], [0.27, 0.05], [-0.26, -0.05]];
            troutSpots.forEach(function (sp2) {
                sphere(mats, g, 0.018, DARK, sp2[0], sp2[1], 0.13);
                sphere(mats, g, 0.018, DARK, sp2[0], sp2[1], -0.13);
            });
            box(mats, g, 0.18, 0.07, 0.05, C2, -0.02, 0.2, 0);
            cone(mats, g, 0.045, 0.1, 4, C2, -0.34, 0.13, 0);
            forkTail(C2, -0.5, 1.25);
            pectorals(C2, 0.1, -0.04);
            eyesOn(0.36, 0.08, 0.11, 0.05);

        } else if (shape === 'catfish') {
            ell(0.38, 0.2, 0.17, C, -0.04, 0, 0);
            ell(0.3, 0.16, 0.21, C, 0.27, -0.01, 0);
            box(mats, g, 0.2, 0.06, 0.2, DARK, 0.42, -0.1, 0);
            barbel(0.46, -0.06, 0.08, 0.36, 0.35);
            barbel(0.46, -0.06, -0.08, 0.36, 0.35);
            barbel(0.42, -0.12, 0.12, 0.23, 0.75);
            barbel(0.42, -0.12, -0.12, 0.23, 0.75);
            box(mats, g, 0.52, 0.07, 0.05, C2, -0.04, -0.2, 0);
            tailFin(C2, -0.52, 1.3);
            pectorals(C2, 0.18, -0.05);
            eyesOn(0.36, 0.1, 0.12, 0.04);

        } else if (shape === 'pike') {
            ell(0.52, 0.15, 0.11, C);
            box(mats, g, 0.26, 0.1, 0.15, C, 0.51, 0, 0);
            for (var pk = 0; pk < 6; pk++) sphere(mats, g, 0.016, C3, -0.22 + pk * 0.1, 0.05, 0.1);
            box(mats, g, 0.24, 0.09, 0.05, C2, -0.28, 0.16, 0);
            box(mats, g, 0.22, 0.07, 0.05, C2, -0.3, -0.15, 0);
            forkTail(C2, -0.58, 1.2);
            pectorals(C2, 0.08, -0.04);
            eyesOn(0.38, 0.07, 0.1, 0.05);

        } else if (shape === 'sturgeon') {
            ell(0.55, 0.18, 0.14, C);
            cone(mats, g, 0.09, 0.3, 5, C, 0.62, 0, 0, 0, 0, -Math.PI / 2);
            for (var st = 0; st < 6; st++) cone(mats, g, 0.035, 0.1, 4, C3, -0.35 + st * 0.12, 0.17, 0);
            barbel(0.58, -0.07, 0.05, 0.18, 0.25);
            barbel(0.58, -0.07, -0.05, 0.18, 0.25);
            box(mats, g, 0.28, 0.1, 0.06, C2, -0.52, 0.12, 0, 0, 0, 0.5);
            box(mats, g, 0.24, 0.08, 0.05, C2, -0.52, -0.1, 0, 0, 0, -0.4);
            pectorals(C2, 0.12, -0.08);
            eyesOn(0.41, 0.09, 0.1, 0.04);

        // === LIGHT POND ======================================================
        } else if (shape === 'guppy') {
            ell(0.19, 0.13, 0.09, C);
            ell(0.1, 0.1, 0.07, C, 0.14, 0.03, 0);
            tailFin(C2, -0.24, 2.1);
            dorsal(0.08, 0.17, C2, 0.03, 0.12);
            pectorals(C2, 0.06, -0.02);
            eyesOn(0.13, 0.04, 0.07, 0.035);

        } else if (shape === 'tetra') {
            ell(0.22, 0.16, 0.09, C);
            ell(0.16, 0.06, 0.08, '#e04a3a', 0.02, -0.05, 0);
            forkTail(C2, -0.24, 1.3);
            dorsal(0.07, 0.15, C2, 0.0, 0.15);
            eyesOn(0.15, 0.04, 0.07, 0.035);

        } else if (shape === 'goldfish') {
            ell(0.3, 0.29, 0.15, C);
            tailFin(C2, -0.4, 2.1);
            tailFin(shade(C2, 0.15), -0.34, 1.7);
            dorsal(0.12, 0.2, C2, 0.0, 0.25);
            pectorals(C2, 0.08, -0.06);
            eyesOn(0.22, 0.08, 0.12, 0.05);

        } else if (shape === 'betta') {
            ell(0.25, 0.21, 0.1, C);
            var bettaD = cone(mats, g, 0.22, 0.46, 4, C2, -0.04, 0.22, 0);
            bettaD.scale.z = 0.25;
            var bettaA = cone(mats, g, 0.2, 0.38, 4, C2, -0.03, -0.26, 0);
            bettaA.rotation.z = Math.PI;
            bettaA.scale.z = 0.25;
            var bettaT = cone(mats, g, 0.24, 0.45, 4, C2, -0.4, 0, 0);
            bettaT.rotation.z = Math.PI / 2;
            bettaT.scale.set(1.8, 1, 0.25);
            box(mats, g, 0.24, 0.03, 0.03, C3, 0.0, -0.34, 0.08, 0, 0, -0.5);
            eyesOn(0.18, 0.06, 0.08, 0.04);

        } else if (shape === 'angelfish') {
            var af = box(mats, g, 0.3, 0.5, 0.1, C, 0, 0, 0);
            af.rotation.z = 0.18;
            var afD = cone(mats, g, 0.16, 0.5, 4, C2, 0.05, 0.38, 0);
            afD.scale.z = 0.3;
            var afA = cone(mats, g, 0.15, 0.44, 4, C2, 0.03, -0.36, 0);
            afA.rotation.z = Math.PI;
            afA.scale.z = 0.3;
            forkTail(C2, -0.3, 1.4);
            eyesOn(0.15, 0.06, 0.07, 0.04);

        } else if (shape === 'discus') {
            ell(0.27, 0.37, 0.08, C);
            bands(5, -0.2, 0.18, 0.55, 0.1, C3);
            box(mats, g, 0.18, 0.06, 0.03, C2, -0.22, 0.3, 0);
            box(mats, g, 0.16, 0.06, 0.03, C2, -0.22, -0.3, 0);
            tailFin(C2, -0.33, 1.2);
            eyesOn(0.18, 0.1, 0.08, 0.045);

        // === DARK POND =======================================================
        } else if (shape === 'bowfin') {
            ell(0.48, 0.19, 0.14, C);
            for (var bw = 0; bw < 7; bw++) {
                var bwx = -0.34 + bw * 0.1;
                cone(mats, g, 0.04, 0.12, 4, C2, bwx, 0.19, 0);
            }
            tailFin(C2, -0.52, 1.4);
            pectorals(C2, 0.1, -0.04);
            eyesOn(0.34, 0.08, 0.1, 0.045);

        } else if (shape === 'snakehead') {
            ell(0.48, 0.16, 0.12, C);
            box(mats, g, 0.26, 0.12, 0.16, C, 0.45, 0.01, 0);
            box(mats, g, 0.4, 0.07, 0.05, C2, -0.08, 0.17, 0);
            box(mats, g, 0.34, 0.06, 0.05, C2, -0.12, -0.15, 0);
            tailFin(C2, -0.5, 1.2);
            eyesOn(0.38, 0.08, 0.1, 0.04);

        } else if (shape === 'eel') {
            for (var ei = 0; ei < 7; ei++) {
                var t = ei / 6;
                box(mats, g, 0.2, 0.13 + t * 0.07, 0.14, ei % 2 ? C2 : C,
                    -0.5 + t * 1.0, Math.sin(t * Math.PI) * 0.08 - 0.02, 0);
            }
            cone(mats, g, 0.12, 0.22, 4, C, 0.56, 0.02, 0, 0, 0, -Math.PI / 2);
            box(mats, g, 0.45, 0.04, 0.03, C2, -0.24, 0.12, 0);
            eyesOn(0.5, 0.08, 0.09, 0.045);

        } else if (shape === 'arowana') {
            ell(0.53, 0.17, 0.12, C);
            bands(8, -0.34, 0.36, 0.3, 0.23, C3);
            barbel(0.55, -0.04, 0.05, 0.25, 0.15);
            barbel(0.55, -0.04, -0.05, 0.25, 0.15);
            box(mats, g, 0.3, 0.07, 0.04, C2, -0.28, 0.15, 0);
            box(mats, g, 0.28, 0.06, 0.04, C2, -0.29, -0.14, 0);
            forkTail(C2, -0.56, 1.3);
            eyesOn(0.38, 0.08, 0.1, 0.045);

        // === OCEAN ===========================================================
        } else if (shape === 'mackerel') {
            ell(0.45, 0.16, 0.11, C);
            bands(7, -0.28, 0.28, 0.32, 0.22, C3);
            forkTail(C2, -0.52, 1.3);
            dorsal(0.1, 0.18, C2, -0.02, 0.15);
            finlets(-0.22, -0.1, 0.1, '#d8d8d8');
            pectorals(C2, 0.1, -0.03);
            eyesOn(0.34, 0.06, 0.09, 0.045);

        } else if (shape === 'cod') {
            ell(0.43, 0.22, 0.14, C);
            for (var cd = 0; cd < 3; cd++) cone(mats, g, 0.08, 0.18, 4, C2, -0.14 + cd * 0.17, 0.2, 0);
            for (var ca = 0; ca < 2; ca++) {
                var cad = cone(mats, g, 0.07, 0.14, 4, C2, -0.06 + ca * 0.18, -0.19, 0);
                cad.rotation.z = Math.PI;
            }
            barbel(0.42, -0.06, 0, 0.2, 0.25);
            forkTail(C2, -0.5, 1.2);
            eyesOn(0.33, 0.07, 0.1, 0.05);

        } else if (shape === 'tuna' || shape === 'trevally') {
            ell(0.48, shape === 'trevally' ? 0.27 : 0.23, 0.15, C);
            ell(0.2, 0.19, 0.14, C, 0.34, 0.02, 0);
            var tuD = cone(mats, g, 0.08, 0.26, 4, C2, -0.02, 0.22, 0);
            tuD.scale.z = 0.3;
            forkTail(C2, -0.54, 1.5);
            finlets(-0.3, -0.16, 0.12, '#e8d36a');
            finlets(-0.3, -0.16, -0.12, '#e8d36a');
            pectorals(C2, 0.1, -0.04);
            eyesOn(0.35, 0.09, 0.12, 0.05);

        } else if (shape === 'mahi') {
            ell(0.46, 0.26, 0.14, C);
            box(mats, g, 0.2, 0.22, 0.16, C, 0.36, 0.1, 0);
            var mhD = box(mats, g, 0.7, 0.13, 0.04, C2, -0.02, 0.3, 0);
            mhD.rotation.z = -0.08;
            forkTail(C2, -0.53, 1.45);
            pectorals(C2, 0.1, -0.04);
            eyesOn(0.39, 0.13, 0.12, 0.05);

        } else if (shape === 'marlin' || shape === 'swordfish') {
            ell(0.5, 0.16, 0.12, C);
            var billLen = shape === 'swordfish' ? 0.55 : 0.36;
            cyl(mats, g, 0.015, 0.04, billLen, 6, C2, 0.55 + billLen / 2, 0.02, 0, 0, 0, Math.PI / 2);
            var bfD = cone(mats, g, 0.13, shape === 'marlin' ? 0.5 : 0.28, 4, C2, -0.02, 0.25, 0);
            bfD.scale.z = 0.3;
            forkTail(C2, -0.56, 1.7);
            pectorals(C2, 0.08, -0.05);
            eyesOn(0.38, 0.08, 0.1, 0.05);

        } else if (shape === 'sunfish') {
            ell(0.4, 0.5, 0.09, C);
            box(mats, g, 0.12, 0.3, 0.06, C2, -0.48, 0, 0);
            box(mats, g, 0.22, 0.35, 0.05, C2, -0.02, 0.46, 0, 0, 0, 0.1);
            box(mats, g, 0.2, 0.3, 0.05, C2, -0.02, -0.44, 0, 0, 0, -0.1);
            eyesOn(0.28, 0.2, 0.08, 0.055);

        } else if (shape === 'clownfish') {
            ell(0.3, 0.21, 0.11, C);
            [ -0.15, 0.02, 0.18 ].forEach(function (bx) {
                box(mats, g, 0.045, 0.4, 0.23, WHITE, bx, 0, 0);
            });
            tailFin(C2, -0.4, 1.3);
            dorsal(0.09, 0.16, C2, 0.0, 0.2);
            eyesOn(0.25, 0.06, 0.09, 0.045);

        } else if (shape === 'tang') {
            ell(0.29, 0.25, 0.07, C);
            cone(mats, g, 0.07, 0.18, 4, C2, 0.3, 0.0, 0, 0, 0, -Math.PI / 2);
            tailFin('#f0d040', -0.36, 1.1);
            dorsal(0.11, 0.1, C2, -0.02, 0.25);
            eyesOn(0.2, 0.08, 0.07, 0.04);

        } else if (shape === 'lionfish') {
            ell(0.29, 0.23, 0.11, C);
            bands(6, -0.2, 0.2, 0.42, 0.22, WHITE);
            var spiky = [-0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.0];
            spiky.forEach(function (a, i) {
                var len = 0.34 + (i % 2) * 0.1;
                var sx = Math.cos(a) * 0.18;
                var sy = Math.sin(a) * 0.2;
                var s = cone(mats, g, 0.03, len, 4, i % 2 ? C2 : C3, sx, sy, 0.08);
                s.rotation.z = Math.PI / 2 - a;
                var s2 = cone(mats, g, 0.03, len, 4, i % 2 ? C2 : C3, sx, sy, -0.08);
                s2.rotation.z = Math.PI / 2 - a;
            });
            tailFin(C2, -0.38, 1.4);
            eyesOn(0.2, 0.08, 0.08, 0.04);

        } else if (shape === 'puffer' || (!shape && has('puffer'))) {
            sphere(mats, g, 0.32, C);
            spikes(0.3, 0.22);
            tailFin(C2, -0.42, 1.2);
            box(mats, g, 0.16, 0.14, 0.14, C2, 0.3, -0.05, 0);
            eyesOn(0.17, 0.12, 0.16, 0.075);

        } else if (shape === 'seahorse' || (!shape && has('seahorse'))) {
            box(mats, g, 0.26, 0.3, 0.24, C, 0.04, 0.34, 0);
            box(mats, g, 0.3, 0.32, 0.26, C, 0.0, 0.05, 0);
            box(mats, g, 0.22, 0.3, 0.22, C2, -0.06, -0.22, 0);
            box(mats, g, 0.14, 0.26, 0.14, C3, -0.03, -0.44, 0);
            box(mats, g, 0.26, 0.1, 0.12, C, 0.3, 0.44, 0);
            cone(mats, g, 0.1, 0.16, 4, C2, 0.06, 0.56, 0);
            eyesOn(0.15, 0.44, 0.13, 0.05);

        } else if (shape === 'shark' || (!shape && (has('shark') || has('whale') || has('orca')))) {
            ell(0.46, 0.21, 0.16, C);
            cone(mats, g, 0.2, 0.34, 4, C, 0.55, 0.02, 0, 0, 0, -Math.PI / 2).scale.z = 0.75;
            box(mats, g, 0.3, 0.1, 0.07, C2, -0.5, 0.18, 0, 0, 0, 0.55);
            box(mats, g, 0.3, 0.1, 0.07, C2, -0.5, -0.18, 0, 0, 0, -0.55);
            dorsal(0.18, 0.34, C2, -0.04);
            pectorals(C2, 0.08, -0.08);
            box(mats, g, 0.18, 0.05, 0.16, '#e8e8e8', 0.4, -0.11, 0);
            eyesOn(0.36, 0.06, 0.14, 0.05);

        } else if (shape === 'ray' || (!shape && (has('ray') || has('skate') || has('manta')))) {
            var wing = geo(mats, g, new THREE.OctahedronGeometry(0.5), C, 0, 0.02, 0);
            wing.scale.set(1.25, 0.16, 1.05);
            box(mats, g, 0.6, 0.05, 0.05, C2, -0.72, 0.02, 0);
            eyesOn(0.3, 0.12, 0.14, 0.05);

        } else if (shape === 'flatfish') {
            var ff = geo(mats, g, new THREE.OctahedronGeometry(0.48), C, 0, 0, 0);
            ff.scale.set(1.15, 0.16, 0.9);
            box(mats, g, 0.24, 0.06, 0.12, C2, -0.5, 0.01, 0);
            sphere(mats, g, 0.045, WHITE, 0.25, 0.07, 0.08);
            sphere(mats, g, 0.045, WHITE, 0.25, 0.07, -0.08);
            sphere(mats, g, 0.022, DARK, 0.27, 0.08, 0.08);
            sphere(mats, g, 0.022, DARK, 0.27, 0.08, -0.08);
            box(mats, g, 0.2, 0.03, 0.03, C3, -0.04, 0.06, 0.22);
            box(mats, g, 0.2, 0.03, 0.03, C3, -0.04, 0.06, -0.22);

        } else if (shape === 'oarfish') {
            ell(0.66, 0.09, 0.06, C);
            box(mats, g, 1.0, 0.05, 0.03, C2, -0.02, 0.1, 0);
            for (var oa = 0; oa < 4; oa++) cone(mats, g, 0.04, 0.18, 4, C3, 0.5 + oa * 0.05, 0.16, 0);
            tailFin(C2, -0.7, 0.9);
            eyesOn(0.6, 0.04, 0.06, 0.035);

        } else if (shape === 'coelacanth') {
            ell(0.4, 0.27, 0.17, C);
            [[0.18, 0.2], [0.18, -0.2], [-0.18, 0.2], [-0.18, -0.2]].forEach(function (fp) {
                box(mats, g, 0.2, 0.08, 0.06, C2, fp[0], -0.04, fp[1], 0.4 * fp[1], 0, 0.3);
                box(mats, g, 0.09, 0.12, 0.07, C2, fp[0] + 0.1, -0.06, fp[1]);
            });
            var clTail = cone(mats, g, 0.18, 0.28, 4, C2, -0.5, 0, 0);
            clTail.rotation.z = Math.PI / 2;
            clTail.scale.set(1.5, 1, 0.35);
            cone(mats, g, 0.08, 0.16, 4, C2, -0.54, 0.16, 0, 0, 0, 0.4);
            var spots = [[-0.24, 0.08], [-0.1, -0.1], [0.04, 0.12], [0.18, -0.06], [0.28, 0.08]];
            spots.forEach(function (sp3) {
                sphere(mats, g, 0.02, WHITE, sp3[0], sp3[1], 0.15);
                sphere(mats, g, 0.02, WHITE, sp3[0], sp3[1], -0.15);
            });
            eyesOn(0.32, 0.1, 0.14, 0.05);

        // === EVENT / DEEP-SEA ================================================
        } else if (shape === 'angler' || (!shape && has('angler'))) {
            sphere(mats, g, 0.34, C, 0.05, 0, 0, 1.2, 0.95, 0.95);
            box(mats, g, 0.3, 0.12, 0.3, DARK, 0.34, -0.06, 0);
            cyl(mats, g, 0.018, 0.018, 0.42, 5, C2, 0.05, 0.36, 0, 0, 0, 0.5);
            sphere(mats, g, 0.075, '#ffe066', 0.24, 0.56, 0);
            tailFin(C2, -0.4, 1.3);
            eyesOn(0.2, 0.13, 0.16, 0.055);

        } else if (shape === 'dragonfish' || shape === 'viperfish' || shape === 'gulper' || shape === 'loach') {
            var eLen = shape === 'gulper' ? 0.38 : 0.5;
            ell(eLen, 0.1, 0.09, C, -0.05, 0, 0);
            var headR = shape === 'gulper' ? 0.23 : (shape === 'viperfish' ? 0.17 : 0.14);
            ell(headR, headR * 0.8, headR * 0.75, C, 0.42, 0.02, 0);
            if (shape === 'gulper') {
                var jaw = cone(mats, g, 0.25, 0.28, 6, C2, 0.55, -0.1, 0);
                jaw.rotation.z = -Math.PI / 2;
            } else {
                box(mats, g, 0.2, 0.05, headR * 1.3, DARK, 0.54, -0.05, 0);
            }
            if (shape === 'viperfish' || shape === 'dragonfish') {
                for (var vt = 0; vt < 4; vt++) {
                    cone(mats, g, 0.015, 0.11, 4, WHITE, 0.5 + vt * 0.03, -0.08, -0.05 + vt * 0.03);
                }
            }
            if (shape === 'dragonfish') {
                for (var dg = 0; dg < 5; dg++) {
                    sphere(mats, g, 0.022, '#7af0ff', -0.25 + dg * 0.1, -0.06, 0.09);
                    sphere(mats, g, 0.022, '#7af0ff', -0.25 + dg * 0.1, -0.06, -0.09);
                }
                box(mats, g, 0.45, 0.04, 0.03, C2, -0.2, 0.1, 0);
            }
            if (shape === 'loach') {
                for (var lb = 0; lb < 4; lb++) {
                    barbel(0.54, -0.03, (lb < 2 ? 0.05 : -0.05), 0.18, 0.3 + lb * 0.1);
                }
            }
            for (var eg = 0; eg < 4; eg++) {
                box(mats, g, 0.1, 0.03, 0.03, C2, -0.42 - eg * 0.09, Math.sin(eg) * 0.03, 0);
            }
            eyesOn(0.4, 0.1, 0.1, 0.045);

        // === LEGACY KEYWORD FALLBACK =========================================
        } else if (has('eel') || has('serpent') || has('worm') || has('leviathan') || has('hydra')) {
            for (var ei2 = 0; ei2 < 7; ei2++) {
                var t2 = ei2 / 6;
                box(mats, g, 0.2, 0.13 + t2 * 0.07, 0.14, ei2 % 2 ? C2 : C,
                    -0.5 + t2 * 1.0, Math.sin(t2 * Math.PI) * 0.08 - 0.02, 0);
            }
            cone(mats, g, 0.12, 0.22, 4, C, 0.56, 0.02, 0, 0, 0, -Math.PI / 2);
            eyesOn(0.5, 0.08, 0.09, 0.045);
        } else if (has('sword') || has('marlin') || has('sail') || has('pike')) {
            ell(0.5, 0.16, 0.12, C);
            cyl(mats, g, 0.015, 0.04, 0.45, 6, C2, 0.7, 0.02, 0, 0, 0, Math.PI / 2);
            dorsal(0.15, 0.4, C2, -0.02, 0.22);
            forkTail(C2, -0.56, 1.6);
            eyesOn(0.38, 0.08, 0.1, 0.05);
        } else if (has('sunfish') || has('discus') || has('koi') || has('goldfish') || has('betta') || has('pleco') || has('flounder') || has('bluegill')) {
            ell(0.28, 0.34, 0.14, C);
            tailFin(C2, -0.4, 1.9);
            dorsal(0.18, 0.3, C2);
            pectorals(C2);
            eyesOn(0.26, 0.12, 0.12, 0.06);
        } else {
            ell(0.36, 0.22, 0.15, C);
            ell(0.16, 0.15, 0.12, C, 0.3, 0.02, 0);
            forkTail(C2, -0.5, 1.4);
            dorsal(0.14, 0.24, C2);
            pectorals(C2);
            eyesOn(0.32, 0.07, 0.12, 0.055);
        }

        g.name = 'heldFish3D';
        g.userData = { is3D: true, fishName: fishName, rarity: rarity };
        return g;
    }
    window.Character3D = { buildFish: buildFish };
})();
