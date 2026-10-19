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
    // along +X (head at +X) so the flank faces the default third-person camera;
    // the caller positions/scales the returned group.  Silhouette + palette are
    // derived from the fish name so a 3D catch matches its 2D billboard.
    function buildFish(fishName, colorHex) {
        var name = String(fishName == null ? 'fish' : fishName).toLowerCase();
        function has(k) { return name.indexOf(k) !== -1; }

        var rarity = 'Common';
        try {
            if (typeof FISH_TYPES !== 'undefined') {
                var fd = FISH_TYPES.find(function (f) { return f.name === fishName; });
                if (fd) rarity = fd.rarity;
            }
        } catch (e) { }

        var colHex = (typeof colorHex === 'string' && colorHex) ? colorHex : '#7fae7f';
        if (has('golden') || has('gold')) colHex = '#e8b923';
        else if (has('void') || has('cosmic')) colHex = '#3a1a5c';
        else if (has('lava') || has('magma')) colHex = '#e2531c';
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
        function dorsal(len, hgt, c, x) {
            var m = cone(mats, g, len, hgt, 4, c || C2, x || 0, hgt * 0.4, 0);
            m.scale.z = 0.32;
            return m;
        }
        function pectorals(c) {
            box(mats, g, 0.2, 0.1, 0.04, c || C2, 0.08, -0.06, 0.13, 0.3, 0, -0.5);
            box(mats, g, 0.2, 0.1, 0.04, c || C2, 0.08, -0.06, -0.13, -0.3, 0, -0.5);
        }
        function tailFin(c, x, spread) {
            var m = cone(mats, g, 0.16, 0.3, 4, c || C2, x == null ? -0.5 : x, 0, 0);
            m.rotation.z = Math.PI / 2;            // point -X
            m.scale.set(spread || 1.5, 1, 0.3);    // widen vertically, thin in Z
            return m;
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

        if (has('boot')) {
            box(mats, g, 0.4, 0.7, 0.46, C, -0.12, 0.14, 0);
            box(mats, g, 0.8, 0.34, 0.46, C3, 0.22, -0.3, 0);
            box(mats, g, 0.82, 0.1, 0.48, DARK, 0.22, -0.48, 0);
        } else if (has('urchin')) {
            sphere(mats, g, 0.28, C);
            spikes(0.26, 0.24);
        } else if (has('puffer')) {
            sphere(mats, g, 0.32, C);
            spikes(0.3, 0.22);
            tailFin(C2, -0.42, 1.2);
            box(mats, g, 0.16, 0.14, 0.14, C2, 0.3, -0.05, 0);
            eyesOn(0.17, 0.12, 0.16, 0.075);
        } else if (has('seahorse')) {
            box(mats, g, 0.26, 0.3, 0.24, C, 0.04, 0.34, 0);
            box(mats, g, 0.3, 0.32, 0.26, C, 0.0, 0.05, 0);
            box(mats, g, 0.22, 0.3, 0.22, C2, -0.06, -0.22, 0);
            box(mats, g, 0.14, 0.26, 0.14, C3, -0.03, -0.44, 0);
            box(mats, g, 0.26, 0.1, 0.12, C, 0.3, 0.44, 0);
            cone(mats, g, 0.1, 0.16, 4, C2, 0.06, 0.56, 0);
            eyesOn(0.15, 0.44, 0.13, 0.05);
        } else if (has('turtle')) {
            sphere(mats, g, 0.42, C3, 0, 0.05, 0, 1, 0.55, 1.05);
            box(mats, g, 0.26, 0.24, 0.24, C, 0.5, 0.0, 0);
            [[0.2, 0.3], [0.2, -0.3], [-0.24, 0.3], [-0.24, -0.3]].forEach(function (f) {
                box(mats, g, 0.26, 0.08, 0.3, C2, f[0], -0.06, f[1], 0, 0, f[1] > 0 ? 0.3 : -0.3);
            });
            cone(mats, g, 0.08, 0.2, 4, C2, -0.5, 0, 0, 0, 0, Math.PI / 2);
            eyesOn(0.62, 0.04, 0.1, 0.05);
        } else if (has('crab') || has('lobster')) {
            sphere(mats, g, 0.34, C, 0, 0, 0, 1.15, 0.5, 0.95);
            for (var li = 0; li < 3; li++) {
                box(mats, g, 0.06, 0.34, 0.06, C3, 0.12 + li * 0.1, -0.16, 0.16, 0, 0, 0.9);
                box(mats, g, 0.06, 0.34, 0.06, C3, 0.12 + li * 0.1, -0.16, -0.16, 0, 0, -0.9);
            }
            [[0.36, 0.34, 1], [0.36, -0.34, -1]].forEach(function (cl) {
                box(mats, g, 0.3, 0.14, 0.16, C2, cl[0], 0.02, cl[1]);
                box(mats, g, 0.22, 0.1, 0.1, C3, cl[0] + 0.16, 0.1, cl[1], 0, 0, -0.6 * cl[2]);
            });
            eyesOn(0.28, 0.17, 0.12, 0.05);
        } else if (has('squid') || has('jelly') || has('kraken')) {
            sphere(mats, g, 0.3, C, 0, 0.16, 0, 1, 0.85, 1);
            cone(mats, g, 0.3, 0.24, 6, C2, 0, 0.36, 0);
            for (var ti = 0; ti < 5; ti++) {
                var tx = (ti - 2) * 0.13;
                box(mats, g, 0.07, 0.42, 0.07, C2, tx, -0.14, 0.02, 0, 0, tx * 0.6);
            }
            eyesOn(0.16, 0.14, 0.16, 0.055);
        } else if (has('eel') || has('serpent') || has('worm') || has('leviathan') || has('hydra')) {
            for (var ei = 0; ei < 6; ei++) {
                var t = ei / 5;
                box(mats, g, 0.22, 0.16 + t * 0.06, 0.16, ei % 2 ? C2 : C,
                    -0.45 + t * 0.9, Math.sin(t * Math.PI) * 0.1 - 0.02, 0);
            }
            cone(mats, g, 0.13, 0.24, 4, C, 0.56, 0.02, 0, 0, 0, -Math.PI / 2);
            eyesOn(0.5, 0.07, 0.1, 0.05);
        } else if (has('ray') || has('skate') || has('manta')) {
            var wing = geo(mats, g, new THREE.OctahedronGeometry(0.5), C, 0, 0.02, 0);
            wing.scale.set(1.25, 0.16, 1.05);
            box(mats, g, 0.6, 0.05, 0.05, C2, -0.72, 0.02, 0);
            eyesOn(0.3, 0.12, 0.14, 0.05);
        } else if (has('shark') || has('whale') || has('orca')) {
            box(mats, g, 0.9, 0.4, 0.3, C, 0, 0, 0);
            var shS = cone(mats, g, 0.2, 0.34, 4, C, 0.6, 0, 0); shS.rotation.z = -Math.PI / 2; shS.scale.z = 0.75;
            box(mats, g, 0.3, 0.1, 0.07, C2, -0.6, 0.2, 0, 0, 0, 0.55);
            box(mats, g, 0.3, 0.1, 0.07, C2, -0.6, -0.2, 0, 0, 0, -0.55);
            dorsal(0.2, 0.34, C2, -0.06);
            pectorals(C2);
            eyesOn(0.42, 0.07, 0.16, 0.055);
        } else if (has('sword') || has('marlin') || has('sail') || has('pike')) {
            box(mats, g, 0.8, 0.28, 0.2, C, 0, 0, 0);
            cyl(mats, g, 0.02, 0.05, 0.5, 6, C2, 0.63, 0.03, 0, 0, 0, -Math.PI / 2);
            dorsal(has('sail') ? 0.3 : 0.18, has('sail') ? 0.42 : 0.28, C2, -0.05);
            tailFin(C2, -0.48, 1.4);
            eyesOn(0.32, 0.07, 0.12, 0.05);
        } else if (has('angler')) {
            sphere(mats, g, 0.34, C, 0.05, 0, 0, 1.2, 0.95, 0.95);
            box(mats, g, 0.3, 0.12, 0.3, DARK, 0.34, -0.06, 0);
            cyl(mats, g, 0.018, 0.018, 0.42, 5, C2, 0.05, 0.36, 0, 0, 0, 0.5);
            sphere(mats, g, 0.075, '#ffe066', 0.24, 0.56, 0);
            tailFin(C2, -0.4, 1.3);
            eyesOn(0.2, 0.13, 0.16, 0.055);
        } else if (has('sunfish') || has('discus') || has('koi') || has('goldfish') || has('betta') || has('pleco') || has('flounder') || has('bluegill')) {
            box(mats, g, 0.5, 0.62, 0.28, C, 0, 0, 0);
            tailFin(C2, -0.42, 1.9);
            dorsal(0.18, 0.3, C2);
            pectorals(C2);
            eyesOn(0.3, 0.12, 0.15, 0.06);
        } else {
            box(mats, g, 0.62, 0.4, 0.24, C, -0.02, 0, 0);
            var dS = cone(mats, g, 0.2, 0.3, 4, C, 0.42, 0, 0); dS.rotation.z = -Math.PI / 2; dS.scale.z = 0.65;
            tailFin(C2, -0.5, 1.5);
            dorsal(0.16, 0.26, C2);
            pectorals(C2);
            eyesOn(0.34, 0.07, 0.14, 0.055);
        }

        g.name = 'heldFish3D';
        g.userData = { is3D: true, fishName: fishName, rarity: rarity };
        return g;
    }

    window.Character3D = { buildFish: buildFish };
})();
