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
        var species=String(fd&&fd.species||fishName||'').replace(/^Golden /i,'').toLowerCase();
        var blind=/cavefish|blindcat/.test(species)||species==='mexican tetra';
        var overrides={'koi':'carp','ozark cavefish':'cavefish','southern cavefish':'cavefish','northern cavefish':'cavefish','corydoras':'corydoras','gourami':'gourami','wahoo':'mackerel','cobia':'mackerel','yellowtail':'trevally','amberjack':'trevally','permit':'permit'};
        shape=overrides[species]||shape;

        var colHex = (typeof colorHex === 'string' && colorHex) ? colorHex : fd&&fd.color||'#7fae7f';
        if (has('golden')) colHex = '#e8b923';
        else if (has('ice') || has('frost')) colHex = '#9fd8ef';

        var mats = new Map();
        var g = new THREE.Group();
        var C = colHex;
        var C2 = shade(colHex, -0.14);   // fins
        var C3 = shade(colHex, -0.28);   // shaded panels
        var DARK = '#141823';
        var WHITE = '#ffffff';
        var UP = new THREE.Vector3(0, 1, 0),skinMeshes=[];

        function eyesOn(x, y, z, r) {
            if(blind)return;
            r = r || 0.055;
            sphere(mats, g, r, WHITE, x, y, z);
            sphere(mats, g, r, WHITE, x, y, -z);
            sphere(mats, g, r * 0.55, DARK, x + 0.02, y, z * 1.12);
            sphere(mats, g, r * 0.55, DARK, x + 0.02, y, -z * 1.12);
        }
        function ell(rx, ry, rz, c, x, y, z) {
            var m = sphere(mats, g, 1, c || C, x || 0, y || 0, z || 0);
            m.scale.set(rx, ry, rz);
            if(!c||c===C){m.name='fishBody';skinMeshes.push(m);}
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
        function tailSurface(c,x,points){
            var outline=new THREE.Shape();points.forEach(function(p,i){if(i)outline.lineTo(x+p[0],p[1]);else outline.moveTo(x+p[0],p[1]);});outline.closePath();
            var fin=geo(mats,g,new THREE.ExtrudeGeometry(outline,{depth:.035,bevelEnabled:false,steps:1,curveSegments:1}),c||C2,0,0,-.0175);fin.name='tailFin';return fin;
        }
        function tailFin(c,x,spread){
            x=x==null?-.5:x;var s=spread||1.5;
            return tailSurface(c,x,[[.12,0],[-.10,.12*s],[-.20,.08*s],[-.22,0],[-.20,-.08*s],[-.10,-.12*s]]);
        }
        function forkTail(c,x,spread){
            x=x==null?-.48:x;var s=spread||1;
            return tailSurface(c,x,[[.12,0],[-.22,.18*s],[-.13,.04*s],[-.07,0],[-.13,-.04*s],[-.22,-.18*s]]);
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
        } else if(shape==='cavefish'){
            ell(.38,.14,.10,C);ell(.14,.10,.09,C,.28,-.01,0);
            tailFin(C2,-.43,1.1);dorsal(.07,.10,C2,-.12,.13);pectorals(C2,.12,-.03);
        } else if(shape==='corydoras'){
            ell(.30,.16,.13,C);ell(.15,.10,.13,C,.25,-.035,0);
            for(var row=0;row<5;row++)for(var side of [-1,1]){var plate=box(mats,g,.04,.17,.013,C3,-.19+row*.09,-.01,side*.12);plate.name='armorPlate';}
            for(var side of [-1,1])barbel(.37,-.09,side*.07,.10,.25);
            dorsal(.09,.20,C2,-.03,.14);forkTail(C2,-.35,1.1);eyesOn(.27,.04,.11,.035);
        } else if(shape==='gourami'){
            ell(.35,.24,.10,C);tailFin(C2,-.42,1.2);dorsal(.13,.18,C2,-.08,.20);
            box(mats,g,.43,.08,.025,C2,-.05,-.23,0);
            for(var side of [-1,1]){var feeler=barbel(.10,-.21,side*.04,.32,-.8,C2);feeler.name='pelvicFeeler';}
            eyesOn(.28,.08,.08,.04);
        } else if(shape==='permit'){
            ell(.28,.36,.09,C);forkTail(C2,-.35,1.8);
            dorsal(.10,.30,C2,.01,.27);var anal=dorsal(.10,.28,C2,.01,-.25);anal.rotation.z=Math.PI;
            pectorals(C2,.15,-.02);eyesOn(.22,.12,.08,.04);
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
            if(species==='yellow perch')bands(5, -.26,.25,.36,.23,C3);
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
            if(!/grass carp|bighead carp/.test(species)){barbel(.46,-.08,.05,.13,.2);barbel(.46,-.08,-.05,.13,.2);}
            forkTail(C2,-.5,1.5);
            pectorals(C2, 0.1, -0.08);
            eyesOn(0.36, 0.06, 0.13, 0.05);

        } else if (shape === 'bass') {
            ell(0.42, 0.25, 0.16, C);
            ell(0.18, 0.16, 0.15, C, 0.32, 0.04, 0);
            box(mats, g, 0.24, 0.08, 0.16, DARK, 0.38, -0.05, 0);
            for (var ba = 0; ba < 5; ba++) cone(mats, g, 0.045, 0.16, 4, C2, -0.02 + ba * 0.08, 0.26, 0);
            box(mats, g, 0.2, 0.09, 0.05, C2, -0.24, 0.22, 0);
            if(/largemouth|smallmouth|grouper|drum|snook|barramundi/.test(species))tailFin(C2,-.5,1.25);else forkTail(C2,-.5,1.35);
            pectorals(C2, 0.1, -0.04);
            eyesOn(0.32, 0.11, 0.13, 0.055);

        } else if (shape === 'trout' || shape === 'salmon') {
            ell(0.46, 0.21, 0.14, C);
            ell(0.17, 0.15, 0.13, C, 0.35, 0.02, 0);
            var troutSpots = [[-0.22, 0.07], [-0.1, -0.04], [0.04, 0.06], [0.16, -0.03], [0.27, 0.05], [-0.26, -0.05]];
            troutSpots.forEach(function (sp2) {
                sphere(mats, g, 0.018, /brook|lake trout/.test(species)?'#ead8ac':DARK, sp2[0], sp2[1], 0.13);
                sphere(mats, g, 0.018, /brook|lake trout/.test(species)?'#ead8ac':DARK, sp2[0], sp2[1], -0.13);
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
            if(/flathead|bullhead|blindcat/.test(species))tailFin(C2,-.52,1.3);else forkTail(C2,-.52,1.3);
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
            tailFin(C2,-.24,/platy|molly|swordtail/.test(species)?1.2:2.1);
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
            if(species!=='oscar')bands(5,-.2,.18,.55,.1,C3);
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
            var curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-.68,-.04,0),new THREE.Vector3(-.38,-.01,.025),new THREE.Vector3(0,.04,0),new THREE.Vector3(.48,.03,0)]);
            var eel=geo(mats,g,new THREE.TubeGeometry(curve,16,.095,8,false),C);eel.name='fishBody';skinMeshes.push(eel);
            ell(.17,.09,.1,C,.48,.03,0);tailFin(C2,-.68,.7);
            box(mats,g,.9,.035,.025,C2,-.12,.13,0);eyesOn(.5,.07,.09,.028);
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
            if(/mackerel|wahoo/.test(species))bands(7,-.28,.28,.28,.20,C3);
            forkTail(C2, -0.52, 1.3);
            dorsal(0.1, 0.18, C2, -0.02, 0.15);
            if(/mackerel|wahoo/.test(species))finlets(-.22,-.1,.1,'#d8d8d8');
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
            if(shape==='tuna'){finlets(-.3,-.16,.12,'#e8d36a');finlets(-.3,-.16,-.12,'#e8d36a');}
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
            ell(.16,.29,.12,C,0,.02,0);ell(.14,.11,.10,C,.09,.33,0);
            cyl(mats,g,.025,.04,.25,8,C,.28,.32,0,0,0,Math.PI/2);
            var curl=new THREE.CatmullRomCurve3([new THREE.Vector3(-.04,-.16,0),new THREE.Vector3(-.08,-.35,0),new THREE.Vector3(.04,-.48,0),new THREE.Vector3(.18,-.43,0),new THREE.Vector3(.15,-.32,0),new THREE.Vector3(.06,-.34,0)]);
            geo(mats,g,new THREE.TubeGeometry(curl,14,.034,6,false),C2).name='curledTail';
            cone(mats,g,.065,.14,5,C2,.02,.49,0);dorsal(.06,.13,C2,-.16,.06);eyesOn(.14,.36,.09,.032);
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
            wing.scale.set(1,.12,1.8);
            for(var side of [-1,1]){var lobe=cone(mats,g,.045,.18,5,C,.43,.015,side*.13,0,0,-Math.PI/2);lobe.name='cephalicLobe';}
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

        // Surface colors follow body contours rather than floating rectangular decals.
        for(var body of skinMeshes){
            var positions=body.geometry.attributes.position,colors=[],base=parseColor(C);
            for(var vi=0;vi<positions.count;vi++){
                var x=positions.getX(vi)*body.scale.x+body.position.x,y=positions.getY(vi)*body.scale.y+body.position.y;
                var color=base.clone().lerp(parseColor(y<-.05?'#f0ead5':'#253c3c'),y<-.05?.38:Math.max(0,y)*.6);
                var lateral=Math.abs(y)<.045&&x<.34;
                if(/rainbow trout/.test(species)&&lateral)color.set('#d9819f');
                if(/largemouth bass|snook|cobia/.test(species)&&lateral)color.set('#344237');
                if(/striped bass|white bass|zebra danio|mullet/.test(species)&&Math.cos(y*85)>0.35)color.copy(base.clone().multiplyScalar(.42));
                if(/smallmouth bass|oscar|muskellunge/.test(species)&&Math.sin(x*34+y*7)>.55)color.copy(base.clone().multiplyScalar(.5));
                if(species==='koi'){color.set('#eee8db');if(Math.sin(x*19+y*8)>.25)color.set('#e47936');if(Math.sin(x*27-y*22)<-.78)color.set('#303331');}
                if(species==='neon tetra'&&lateral)color.set('#39e5ed');
                if(/brook trout/.test(species)&&y>.08&&Math.sin(x*40+Math.sin(y*25)*2)>.55)color.set('#d9c899');
                if(/yellowtail|amberjack/.test(species)&&lateral)color.set('#d4b64b');
                if(has('golden'))color.copy(base.clone().multiplyScalar(y<-.05?.9:1));
                colors.push(color.r,color.g,color.b);
            }
            body.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));body.material=body.material.clone();body.material.color.set('#ffffff');body.material.vertexColors=true;
        }
        function sideMark(x,y,z,r,c,label){for(var side of [-1,1]){var mark=ell(r,r,r*.2,c,x,y,z*side);mark.name=label;}}
        if(/bluegill|pumpkinseed|green sunfish|warmouth/.test(species))sideMark(.22,.05,.15,.045,'#172d32','gillMark');
        if(species==='pumpkinseed')sideMark(.23,.03,.157,.018,'#ef823f','gillSpot');
        if(/red drum|bowfin/.test(species))sideMark(-.34,.035,.10,.035,'#202925','tailSpot');
        if(species==='haddock')sideMark(.17,.0,.137,.045,'#242b32','shoulderSpot');
        if(species==='swordtail'){var sword=cone(mats,g,.028,.35,4,C2,-.46,-.10,0);sword.rotation.z=Math.PI/2;sword.name='tailSword';}
        if(species==='roosterfish')for(var rf=0;rf<7;rf++){var ray=cone(mats,g,.018,.38+Math.sin(rf*.4)*.18,4,C3,-.1+rf*.045,.38,0);ray.name='dorsalComb';}
        if(species==='oscar')g.scale.set(1.4,.82,1.35);
        if(/wahoo|cobia|bonefish|anchovy/.test(species))g.scale.set(1.35,.8,.9);
        if(species==='koi')g.scale.set(1.12,.86,1);
        g.userData.species=species;
        if(fd?.event==='hollowtide2026'){
            const detail=fd.detail;
            if(detail==='jack')for(const side of [-1,1]){
                for(const x of [-.08,.12]){var eye=cone(mats,g,.055,.065,3,'#ffe7a3',x,.065,side*.16);eye.rotation.x=side*Math.PI/2;eye.name='pumpkinEye';}
                box(mats,g,.25,.025,.012,'#ffe7a3',.02,-.06,side*.17).name='pumpkinGrin';
            }
            if(detail==='ghost'){g.traverse(obj=>{if(obj.material){obj.material=obj.material.clone();obj.material.transparent=true;obj.material.opacity=.78;obj.material.depthWrite=false;}});}
            if(detail==='fangs')for(const side of [-1,1]){var fang=cone(mats,g,.025,.15,4,'#f8ead1',.53,-.07,side*.06);fang.rotation.z=Math.PI;fang.name='vampireFang';}
            if(detail==='bones')for(const side of [-1,1]){
                box(mats,g,.58,.025,.015,'#f6e7ce',-.02,.02,side*.145).name='spineMark';
                for(let j=0;j<5;j++)box(mats,g,.018,.15,.016,'#f6e7ce',-.24+j*.11,-.015,side*.15).name='ribMark';
            }
            if(detail==='candy'){g.traverse(obj=>{if(obj.name==='tailFin')obj.material.color.set('#fff1cc');});box(mats,g,.12,.15,.15,'#eb822a',-.07,0,0);}
            if(detail==='witch'){var hat=cone(mats,g,.09,.22,6,'#4a285d',.12,.35,0);hat.name='witchFin';}
            if(detail==='lantern'){sphere(mats,g,.07,'#bcf6a4',.32,.43,0).name='ghostLight';}
            if(detail==='moon'){var moon=torus(mats,g,.10,.024,'#f4cf7a',0,.11,.35,Math.PI/2,0,0);moon.name='harvestMoon';}
        }
        g.name = 'heldFish3D';
        g.userData = { is3D: true, fishName: fishName, rarity: rarity, species:species, shape:shape, blind:blind };
        return g;
    }

    // Grip is the origin: casting rotates the rod without sliding it out of the hand.
    function buildRod(data) {
        const g=new THREE.Group(),mats=new Map(),id=data.id||'bamboo';
        const color=id==='invisible'?'#dcecf4':data.color||'#daa520';
        const reel=id==='invisible'?'#dcecf4':data.reel||'#8b4513';
        const grip=id==='carbon'?'#17191e':id==='bamboo'?'#c29b38':'#493326';
        function segment(name,start,end,r1,r2,c){
            const from=new THREE.Vector3(...start),to=new THREE.Vector3(...end),delta=to.clone().sub(from);
            const m=new THREE.Mesh(new THREE.CylinderGeometry(r2,r1,delta.length(),6),mat(mats,c));
            m.position.copy(from.add(to).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());m.name=name;g.add(m);return m;
        }
        segment('rodGrip',[0,-.23,0],[0,.23,0],.055,.05,grip);
        const colors=id==='rainbow'?['#f24c65','#f5b942','#6ed36a','#54b9f2','#ae7aef']:null;
        for(let i=0;i<5;i++){
            const y=.23+i*.45,x=id==='banana_rod'?Math.pow(i/5,2)*.3:0,nextX=id==='banana_rod'?Math.pow((i+1)/5,2)*.3:0;
            segment('rodBlank',[x,y,0],[nextX,y+.45,0],.038-i*.006,.032-i*.006,colors?colors[i]:color);
            if(id==='candy'||id==='ht_rod')segment('rodWrap',[x,y+.1,0],[x,y+.18,0],.04-i*.006,.039-i*.006,id==='ht_rod'?'#efa34a':'#fff4ed');
            const ring=new THREE.Mesh(new THREE.TorusGeometry(.045-i*.004,.009,3,6),mat(mats,id==='banana_rod'?'#7cb342':'#c2c7cf'));
            ring.position.set(nextX,y+.4,.045);ring.rotation.x=Math.PI/2;ring.name='lineGuide';g.add(ring);
        }
        segment('reelSeat',[0,-.1,0],[0,-.1,-.14],.025,.025,reel);
        const spool=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.1,8),mat(mats,reel));spool.rotation.z=Math.PI/2;spool.position.set(0,-.1,-.17);spool.name='reel';g.add(spool);
        segment('reelCrank',[-.07,-.1,-.17],[-.15,-.2,-.17],.014,.014,'#c2c7cf');
        segment('reelHandle',[-.15,-.2,-.17],[-.21,-.2,-.17],.025,.025,grip);
        const crankPivot=new THREE.Group();crankPivot.name='reelCrankPivot';crankPivot.position.set(0,-.1,-.17);g.add(crankPivot);
        for(const name of ['reelCrank','reelHandle']){const part=g.getObjectByName(name);part.position.sub(crankPivot.position);crankPivot.add(part);}
        const tip=new THREE.Object3D();tip.name='rodTip';tip.position.set(id==='banana_rod'?.3:0,2.48,0);g.add(tip);
        if(id==='invisible')g.traverse(obj=>{if(obj.material){obj.material.transparent=true;obj.material.opacity=.25;obj.material.depthWrite=false;}});
        g.name='rod';g.userData={is3D:true,rodId:id};return g;
    }

    function buildTool(type){
        const g=new THREE.Group(),mats=new Map();
        const piece=(name,w,h,d,c,x,y,z)=>{const m=box(mats,g,w,h,d,c,x,y,z);m.name=name;return m;};
        if(type==='axe'||type==='pickaxe'){
            const handle=geo(mats,g,new THREE.CylinderGeometry(.035,.045,1.15,6),'#8b5935',0,.35,0);handle.name='toolHandle';
            piece('grip',.1,.3,.1,'#4d3325',0,-.02,0);
            if(type==='axe'){
                piece('axeHead',.42,.27,.14,'#aab4c4',.13,.85,0);
                const blade=piece('blade',.10,.36,.055,'#e0e5ec',.38,.85,0);blade.rotation.z=.08;
                piece('axePoll',.14,.17,.14,'#737e8d',-.15,.85,0);
            }else{
                const head=piece('pickHead',.76,.12,.15,'#aebac8',0,.86,0);head.rotation.z=-.12;
                for(const side of [-1,1]){const tip=geo(mats,g,new THREE.ConeGeometry(.09,.25,4),'#dce5ed',side*.43,.79,0);tip.rotation.z=side*Math.PI/2;}
            }
        }else if(type==='guitar'){
            const lower=geo(mats,g,new THREE.SphereGeometry(1,10,6),'#b97b42',0,-.08,0);lower.scale.set(.32,.37,.095);
            const upper=geo(mats,g,new THREE.SphereGeometry(1,10,6),'#ba824b',0,.22,0);upper.scale.set(.25,.25,.09);
            const hole=geo(mats,g,new THREE.CylinderGeometry(.09,.09,.008,12),'#201914',0,.12,.096);hole.rotation.x=Math.PI/2;
            piece('neck',.11,.7,.07,'#533822',0,.66,0);piece('headstock',.16,.23,.08,'#8e6035',0,1.1,0);
            piece('bridge',.16,.04,.025,'#38271c',0,-.18,.10);
            for(let j=0;j<6;j++)piece('string',.003,.95,.004,'#e1d9bf',-.04+j*.016,.32,.108);
            for(let j=0;j<3;j++)for(const side of [-1,1])piece('tuner',.06,.025,.035,'#c5c9ce',side*.10,1.04+j*.065,0);
        }else if(type==='glove'){
            const fist=geo(mats,g,new THREE.SphereGeometry(1,8,5),'#d64b4b',0,0,.12);fist.scale.set(.22,.23,.27);
            piece('cuff',.32,.22,.25,'#f6e3d1',0,-.2,-.02);
            const thumb=geo(mats,g,new THREE.SphereGeometry(1,6,3),'#a82d37',-.18,-.04,.18);thumb.scale.set(.1,.12,.14);
            piece('wristBand',.34,.06,.26,'#5b2531',0,-.22,-.02);
        }
        if(type==='axe'||type==='pickaxe'){
            // The cutting profile faces +Z, matching the character's forward direction.
            const profile=new THREE.Group();profile.name='toolProfile';
            for(const part of [...g.children])profile.add(part);
            profile.rotation.y=-Math.PI/2;g.add(profile);
        }
        g.userData={is3D:true,toolType:type};return g;
    }

    // Low-poly character solids: front is +Z, feet at -1.46875.
    // Artwork is used only as surface detail, never as the model silhouette.
    const proportions=Object.freeze({upperLift:.28,hipY:-.72,legCenterY:-1.05,legHalfLength:.38,seatedReach:.25});
    const tailAccentTypes=['cat','dog','fox','dragon','duck','axolotl','raccoon','lion','penguin','protogen','wolf','deer','owl','bat','shark','dolphin','snake','tiger','leopard','rhino','elephant','giraffe','zebra','red_panda','skunk','otter','beaver','squirrel','chinchilla','ferret','chipmunk','mermaid','peacock'];
    function buildCharacter(cfg, look, assets) {
        if(window.GamePerformance)window.GamePerformance.recordModelBuild();
        const g=new THREE.Group(), mats=new Map();
        // Character-only budgets; trophy fish keep their existing geometry.
        function sphere(mats,parent,r,c,x,y,z,sx,sy,sz) {
            const mesh=geo(mats,parent,new THREE.SphereGeometry(r,6,3),c,x,y,z);
            mesh.scale.set(sx||1,sy||1,sz||1);return mesh;
        }
        function torus(mats,parent,r,tube,c,x,y,z,rx,ry,rz) {
            return geo(mats,parent,new THREE.TorusGeometry(r,tube,3,8),c,x,y,z,rx,ry,rz);
        }
        function cyl(mats,parent,rt,rb,h,segments,c,x,y,z) {
            return geo(mats,parent,new THREE.CylinderGeometry(rt,rb,h,6),c,x,y,z);
        }
        const base=look.base, belly=look.belly;
        const legacy={cat:['cat','standard','cat','none','cat'],bunny:['bunny','standard','cat','none','bunny'],dog:['dog','standard','dog','none','dog'],bear:['bear','standard','bear','none','bear'],fox:['fox','standard','dog','fox_cheeks','fox'],pig:['pig','standard','pig','none','pig'],dragon:['dragon','dragon','dragon','dragon_wings','dragon'],mouse:['mouse','standard','mouse','none','mouse'],duck:['none','standard','duck','none','duck'],axolotl:['none','standard','axolotl','axolotl_gills','axolotl'],raccoon:['raccoon','standard','dog','raccoon_mask','raccoon'],koala:['koala','standard','koala','none','none'],lion:['cat','standard','cat','lion_mane','lion'],cow:['cow','standard','cow','none','cat'],frog:['none','frog','frog','none','frog'],monkey:['monkey','standard','monkey','none','monkey'],penguin:['none','standard','penguin','penguin_belly','penguin']};
        const values=legacy[look.parts]||legacy.cat;
        const p=typeof look.parts==='string'?Object.fromEntries(['ears','eyes','nose','misc','tail'].map((k,i)=>[k,values[i]])):look.parts;
        const pc=look.pc, ear=pc.earsColor||base, tail=pc.tailColor||base, misc=pc.miscColor||base;
        const ball=(name,c,x,y,z,sx,sy,sz)=>{const m=sphere(mats,g,1,c,x,y,z,sx,sy,sz);m.name=name;return m;};
        const block=(name,c,x,y,z,w,h,d)=>{const m=box(mats,g,w,h,d,c,x,y,z);m.name=name;return m;};
        const spike=(name,c,x,y,z,r,h,rz=0)=>{const m=cone(mats,g,r,h,4,c,x,y,z,0,0,rz);m.name=name;return m;};
        function tube(name,points,r,c){const curve=new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v)));const m=geo(mats,g,new THREE.TubeGeometry(curve,5,r,4,false),c);m.name=name;return m;}
        // Surface art on real box faces, including all shirt logos and patterns.
        function skinBox(name,x,y,z,w,h,d,front,back,color,left,right,top,bottom){
            const side=mat(mats,color), fm=new THREE.MeshBasicMaterial({map:front}),bm=new THREE.MeshBasicMaterial({map:back});
            const lm=left?new THREE.MeshBasicMaterial({map:left}):side,rm=right?new THREE.MeshBasicMaterial({map:right}):side;
            const um=top?new THREE.MeshBasicMaterial({map:top}):side,dm=bottom?new THREE.MeshBasicMaterial({map:bottom}):side;
            const geometry=new THREE.BoxGeometry(w,h,d,name==='head'?2:1,name==='head'?2:1,name==='head'?2:1);
            const positions=geometry.attributes.position;
            if(name==='head') {
                // Round the cube with a sparse cage, keeping the face UVs intact.
                const radius=.18,inner=new THREE.Vector3(w/2-radius,h/2-radius,d/2-radius);
                const v=new THREE.Vector3(),nearest=new THREE.Vector3();
                for(let i=0;i<positions.count;i++) {
                    v.fromBufferAttribute(positions,i);
                    nearest.set(THREE.MathUtils.clamp(v.x,-inner.x,inner.x),THREE.MathUtils.clamp(v.y,-inner.y,inner.y),THREE.MathUtils.clamp(v.z,-inner.z,inner.z));
                    v.sub(nearest).normalize().multiplyScalar(radius).add(nearest);
                    positions.setXYZ(i,v.x,v.y,v.z);
                }
            } else {
                // A short trapezoid body gives the oversized head a toy-like silhouette.
                for(let i=0;i<positions.count;i++)if(positions.getY(i)<0)positions.setX(i,positions.getX(i)*.86);
            }
            geometry.computeVertexNormals();
            const m=new THREE.Mesh(geometry,[rm,lm,um,dm,fm,bm]);m.position.set(x,y,z);m.name=name;g.add(m);return m;
        }
        const shirt=assets.shirt,pants=assets.pants;
        if(pants){const waist=block('pantsWaist',pants.color,0,-1.07,0,.69,.13,.48);waist.userData.pantsId=pants.id;}
        skinBox('torso',0,-.65,0,.78,.82,.55,assets.torsoFront,assets.torsoBack,shirt?shirt.color:base,assets.torsoLeft,assets.torsoRight);
        for(const side of [-1,1]){
            ball('foot',pc.footColor||base,side*(cfg.sitting?.3:.23),cfg.sitting?-1+proportions.upperLift:-1.31,cfg.sitting?.57+proportions.seatedReach:.12,.24,.16,.28);
            const leg=ball('leg',pants?pants.color:base,side*(cfg.sitting?.28:.23),cfg.sitting?-.99+proportions.upperLift:proportions.legCenterY,cfg.sitting?.26+proportions.seatedReach/2:0,.15,proportions.legHalfLength,.17);
            // Keep the lower leg silhouette and full length, but carry its width
            // through the hip instead of tapering to a point beneath the torso.
            leg.geometry.dispose();
            leg.geometry=new THREE.LatheGeometry([
                new THREE.Vector2(0,-1),new THREE.Vector2(Math.sqrt(.75),-.5),
                new THREE.Vector2(Math.sqrt(.75),1),
                new THREE.Vector2(0,1)
            ],6);
            // Remove the lathe's zero-area pole faces to retain the limb budget.
            const lp=leg.geometry.attributes.position,li=leg.geometry.index,faces=[];
            const la=new THREE.Vector3(),lb=new THREE.Vector3(),lc=new THREE.Vector3();
            for(let i=0;i<li.count;i+=3){
                const a=li.getX(i),b=li.getX(i+1),c=li.getX(i+2);
                la.fromBufferAttribute(lp,a);lb.fromBufferAttribute(lp,b);lc.fromBufferAttribute(lp,c);
                if(lb.sub(la).cross(lc.sub(la)).lengthSq()>1e-12)faces.push(a,b,c);
            }
            leg.geometry.setIndex(faces);
            if(pants){
                leg.userData.pantsId=pants.id;
                if(assets.pantsTexture){
                    leg.material=new THREE.MeshBasicMaterial({map:assets.pantsTexture});
                    const uv=leg.geometry.attributes.uv,pos=leg.geometry.attributes.position;
                    for(let i=0;i<uv.count;i++)uv.setY(i,(pos.getY(i)+1)/2);
                }
            }else if(assets.legLeft||assets.legRight){
                const map=side<0?assets.legLeft:assets.legRight;
                if(map)leg.material=new THREE.MeshBasicMaterial({map});
            }
            if(cfg.sitting)leg.rotation.x=Math.PI/2;
            const holding=side===1&&(cfg.holdingRod||cfg.holdingFish||cfg.holdingTool)&&!cfg.bellySliding;
            const arm=ball('arm',shirt?shirt.color:base,side*.53,holding?-.5:-.65,holding?.17:0,.18,.35,.19);arm.rotation.z=side*.12;
            if(!shirt&&(assets.armLeft||assets.armRight)){
                const map=side<0?assets.armLeft:assets.armRight;
                if(map)arm.material=new THREE.MeshBasicMaterial({map});
            }
            if(holding)arm.rotation.x=-.95;
            const paw=ball('paw',pc.handColor||base,side*.56,holding?(cfg.holdingFish?-.45:-.62):-.92,holding?(cfg.holdingFish?.5:.43):.03,.17,.16,.18);
            if(cfg.sitting&&!holding){arm.position.set(side*.51,-.63,.12);arm.rotation.x=-.4;paw.position.set(side*.43,-.9,.32);}
            if(cfg.bellySliding){arm.position.set(side*.62,-.3,0);arm.rotation.set(0,0,side*-.8);paw.position.set(side*.84,-.45,0);}
        }
        const head=skinBox('head',0,.2,0,1.2,1.02,.88,assets.headFront,assets.headBack,base,assets.headLeft,assets.headRight,assets.headTop,assets.headBottom);
        // Nose selection determines the muzzle silhouette and mouth placement.
        const n=p.nose, birds=['duck','penguin','bird','owl'].includes(n);
        const nc=pc.noseColor||(['pig','cat','mouse','hamster','skunk','ferret','tiger'].includes(n)?'#eaa2ac':birds?'#efad31':'#24212a');
        let mw=.12,my=-.19,mz=.61,mh=.075;
        const nostrils=(x,y,z)=>{for(const side of [-1,1]){const hole=spike('nostril',(['frog','axolotl'].includes(n)&&pc.noseColor)||'#352a29',side*x,y,z,.022,.012);hole.rotation.x=Math.PI/2;}};
        if(n==='protogen'){
            const visor=skinBox('head',0,.2,.34,1.24,1.04,.98,assets.headFront,assets.headBack,'#101923');visor.name='protogenScreen';
            mw=.25;my=-.14;mz=.846;mh=.065;
        }else if(birds){
            if(n==='duck'){
                ball('upperBill',nc,0,-.035,.59,.29,.065,.28);
                ball('lowerBill',nc,0,-.12,.59,.27,.04,.26);
                nostrils(.095,.012,.72);mw=.23;my=-.085;mz=.82;mh=.04;
            }else{
                const beak=spike('beak',nc,0,-.035,.58,n==='owl'?.11:.15,n==='penguin'?.34:.26);
                beak.rotation.x=Math.PI/2;mw=n==='owl'?.065:.11;my=-.08;mz=n==='penguin'?.76:.71;mh=.045;
            }
        }else if(n==='elephant'){
            tube('trunk',[[0,.02,.45],[0,-.24,.64],[0,-.58,.7],[.12,-.64,.8]],.105,pc.noseColor||base);
            my=-.29;mz=.47;mw=.17;
        }else if(['pig','cow','hippo'].includes(n)){
            const w=n==='pig'?.23:n==='cow'?.34:.38;
            ball('muzzle',n==='pig'?nc:n==='cow'?(pc.noseColor||'#c99398'):(pc.noseColor||base),0,-.08,.53,w,n==='hippo'?.21:.16,.21);
            nostrils(w*.48,-.025,.735);mw=w*.7;mz=.72;
        }else if(['dragon','snake','shark','dolphin','rhino','zebra','giraffe'].includes(n)){
            const long=['dolphin','zebra','giraffe'].includes(n),d=long?.34:.23;
            ball('muzzle',pc.noseColor||base,0,-.08,.51,n==='shark'?.32:.23,n==='shark'?.13:.16,d);
            nostrils(n==='shark'?.17:.09,.015,.51+d*.9);mz=.51+d;mw=n==='shark'?.25:.18;my=-.17;
            if(n==='rhino')spike('noseHorn',pc.noseColor||'#ded8ba',0,.1,.69,.1,.34);
            if(n==='snake'){
                tube('forkedTongue',[[0,-.2,.73],[0,-.23,.84],[-.045,-.24,.9]],.012,'#d95464');
                tube('tongueFork',[[0,-.23,.84],[.045,-.24,.9]],.012,'#d95464');
            }
        }else if(['frog','axolotl','smile','blep','protogen'].includes(n)){
            mw=n==='frog'?.3:n==='axolotl'?.23:.18;mz=.46;my=-.12;
            if(n==='frog'||n==='axolotl')nostrils(.14,.015,.455);
            if(n==='protogen'){mz=.48;mh=.045;}
        }else{
            const canine=['dog','wolf','deer','hedgehog','ferret'].includes(n),feline=['cat','tiger','otter','skunk'].includes(n);
            const tiny=['mouse','hamster','squirrel','hedgehog','ferret'].includes(n),d=canine?(n==='wolf'?.3:.24):.16;
            if(feline)for(const side of [-1,1])ball('muzzlePad',belly,side*.105,-.095,.52,.14,.105,.13);
            else ball('muzzle',belly,0,-.08,.49,tiny?.17:n==='bear'||n==='panda'?.27:.23,.14,d);
            if(feline||canine){const tip=spike('nose',nc,0,-.02,.49+d,tiny?.055:.085,tiny?.07:.105,Math.PI);tip.scale.z=.55;}
            else ball('nose',nc,0,-.015,.49+d,n==='koala'?.13:tiny?.055:.105,n==='koala'?.18:tiny?.045:.07,.045);
            mz=.50+d;mw=tiny?.085:feline?.13:.16;
            if(n==='koala'){my=-.24;mz=.57;mw=.09;}
            if(n==='monkey'){nostrils(.045,-.015,.70);mw=.19;}
            if(['mouse','tiger','otter'].includes(n))for(const side of [-1,1])for(const y of [-.07,-.13])tube('whisker',[[side*.16,y,.63],[side*.34,y+.025,.59]],.006,'#655c58');
            if(n==='beaver')for(const side of [-1,1])block('tooth','#fff5de',side*.045,-.25,.68,.075,.13,.045);
        }
        const faceInk=n==='protogen'?(cfg.eye||'#000000'):'#402735';
        const mouth=ball('talkingMouth',faceInk,0,my,mz,mw,.025,.025);
        mouth.userData.profile={width:mw,height:mh};g.userData.mouth=mouth;
        // Species-sized curved lips frame both resting and animated mouths.
        const lipCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(-mw,my+.025,mz),new THREE.Vector3(0,my-.025,mz+.008),new THREE.Vector3(mw,my+.025,mz)]);
        const lips=geo(mats,g,new THREE.TubeGeometry(lipCurve,2,.009,3,false),faceInk);lips.name='mouthLine';
        if(n==='blep')ball('tongue','#ed879b',0,my-.055,mz+.025,.065,.075,.025);
        // Ears are independent volumes, with species-specific silhouettes.
        // Inset patches follow the actual outer facets instead of floating cones/balls.
        function earInterior(outer){
            // Project one continuous, smaller inset onto the front of the ear
            // shell. The old code shrank each triangle separately, leaving the
            // pink cross-shaped gaps visible on low-poly ears.
            const source=outer.geometry,pos=source.attributes.position,index=source.index;
            source.computeBoundingBox();source.computeBoundingSphere();
            const box=source.boundingBox,cx=(box.min.x+box.max.x)/2,cy=(box.min.y+box.max.y)/2;
            const shell=new THREE.Mesh(source,new THREE.MeshBasicMaterial());shell.updateMatrixWorld(true);
            const ray=new THREE.Raycaster(),faces=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
            const count=index?index.count:pos.count;
            for(let i=0;i<count;i+=3){
                const ia=index?index.getX(i):i,ib=index?index.getX(i+1):i+1,ic=index?index.getX(i+2):i+2;
                a.fromBufferAttribute(pos,ia);b.fromBufferAttribute(pos,ib);c.fromBufferAttribute(pos,ic);
                normal.crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize();
                if(normal.z<.25)continue;
                faces.push([a.clone(),b.clone(),c.clone()]);
            }
            const cache=new Map();
            const projected=(v)=>{
                const key=v.x.toFixed(4)+','+v.y.toFixed(4)+','+v.z.toFixed(4);
                if(cache.has(key))return cache.get(key);
                let hit=null,x=cx,y=cy;
                for(let scale=.62;scale>=.2&&!hit;scale-=.055){
                    x=cx+(v.x-cx)*scale;y=cy+(v.y-cy)*scale;
                    ray.set(new THREE.Vector3(x,y,box.max.z+5),new THREE.Vector3(0,0,-1));
                    hit=ray.intersectObject(shell)[0]||null;
                }
                // Low-poly cone ears have a seam at x=0; nudge off it rather
                // than losing the inset vertex.
                if(!hit)for(const offset of [.006,-.006]){
                    ray.set(new THREE.Vector3(x+offset,y,box.max.z+5),new THREE.Vector3(0,0,-1));
                    hit=ray.intersectObject(shell)[0]||null;
                    if(hit){x+=offset;break;}
                }
                const result=hit?[x,y,hit.point.z+.002]:null;
                cache.set(key,result);return result;
            };
            const points=[];
            for(const face of faces){
                const projectedFace=face.map(projected);
                if(projectedFace.some(v=>!v))continue;
                for(const v of projectedFace)points.push(...v);
            }
            shell.material.dispose();
            const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.computeVertexNormals();
            const inner=new THREE.Mesh(geometry,mat(mats,belly));inner.name='innerEar';
            inner.position.copy(outer.position);inner.rotation.copy(outer.rotation);inner.scale.copy(outer.scale);
            g.add(inner);
            return inner;
        }
        const e=p.ears,earStart=g.children.length;
        if(!['none','snake','dolphin'].includes(e))for(const side of [-1,1]){
            if(e==='deer'||e==='cow'||e==='giraffe'){
                tube('antler',[[side*.36,.57,0],[side*.44,.87,0],[side*.53,1.02,.02]],.045,e==='cow'?'#e6d4a6':ear);
                if(e==='deer')for(let i=0;i<2;i++)tube('antlerBranch',[[side*.44,.76+i*.12,0],[side*(.63+i*.04),.86+i*.13,0]],.035,ear);
                ball('sideEar',ear,side*.66,.43,0,.23,.12,.13);
            }else if(e==='bunny'||e==='dog'||e==='elephant'){
                const floppy=e==='dog',big=e==='elephant';
                const m=ball('ear',ear,side*(big?.69:floppy?.64:.35),floppy?.2:big?.28:.88,0,big?.28:.14,floppy?.4:big?.38:.46,.14);m.rotation.z=side*(floppy?.15:-.12);
                earInterior(m);
            }else if(e==='protogen'){
                // Tall, swept ears with a broad root and a tapered, rearward tip.
                const shape=new THREE.Shape();
                [[-.17,0],[.11,.02],[.25,.53],[.23,1.02],[-.04,.74],[-.18,.26]].forEach(([x,y],i)=>{
                    if(i)shape.lineTo(side*x,y);else shape.moveTo(side*x,y);
                });shape.closePath();
                const geometry=new THREE.ExtrudeGeometry(shape,{depth:.22,bevelEnabled:false,steps:1});
                geometry.translate(0,0,-.11);
                const outer=geo(mats,g,geometry,ear,side*.39,.59,-.10);outer.name='ear';
                outer.rotation.x=-.18;
                // One continuous inset on the flat front, with a fur border all around.
                const inset=new THREE.Shape();
                [[-.08,.10],[.045,.12],[.15,.53],[.16,.82],[.015,.68],[-.09,.28]].forEach(([x,y],i)=>{
                    if(i)inset.lineTo(side*x,y);else inset.moveTo(side*x,y);
                });inset.closePath();
                const innerGeometry=new THREE.ShapeGeometry(inset);innerGeometry.translate(0,0,.112);
                const inner=geo(mats,g,innerGeometry,belly);inner.name='innerEar';
                inner.position.copy(outer.position);inner.rotation.copy(outer.rotation);
            }else if(['cat','fox','wolf','bat','raccoon','owl','squirrel','skunk','hedgehog','dragon','shark'].includes(e)){
                const outer=spike('ear',ear,side*.43,.72,0,e==='bat'?.24:.18,e==='fox'||e==='bat'?.57:.38,side*-.18);
                earInterior(outer);
            }else{
                const big=['mouse','koala','chinchilla'].includes(e),color=e==='panda'?'#25252a':ear;
                const outer=ball('ear',color,side*.56,.58,0,big?.25:.17,big?.25:.17,.14);
                earInterior(outer);
            }
        }
        // Give the ear pair a clear silhouette above / beside fuller hairstyles.
        // Move the outer and inner surfaces together; cropped hair keeps its fit.
        const earHair=cfg.hair||'none';
        if(!['none','buzzed','undercut','slicked','mohawk'].includes(earHair)){
            const full=['afro','curly','spiky','messy','pixie','shaggy'].includes(earHair);
            for(const part of g.children.slice(earStart)){
                if(!['ear','innerEar','sideEar'].includes(part.name))continue;
                const side=Math.sign(part.position.x),longEar=['bunny','dog','elephant'].includes(e);
                part.position.x+=side*(longEar?.10:part.name==='sideEar'?.12:.09);
                part.position.y+=part.name==='sideEar'?.04:longEar?(e==='bunny'?.06:.04):(full?.22:.17);
                part.position.z+=.18;
            }
        }
        // Species tails use tapered cross sections, true ring markings and fin silhouettes.
        const t=p.tail, accent=tailAccentTypes.includes(t)?pc.tailAccentColor:null;
        if(t&&t!=='none'){
            const tailGroup=new THREE.Group();tailGroup.name='speciesTail';tailGroup.userData.species=t;g.add(tailGroup);
            function tailMesh(name,positions,indices,colors){
                const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
                if(colors)geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
                geometry.setIndex(indices);geometry.computeVertexNormals();
                const material=new THREE.MeshBasicMaterial({color:colors?'#ffffff':tail,vertexColors:!!colors,side:THREE.DoubleSide});
                const mesh=new THREE.Mesh(geometry,material);mesh.name=name;tailGroup.add(mesh);return mesh;
            }
            function sweep(points,radii,options={}){
                const positions=[],indices=[],colors=[],sides=options.sides||5;
                points=points.map(v=>new THREE.Vector3(...v));
                points.forEach((point,i)=>{
                    const tangent=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(i-1,0)]).normalize();
                    const axis=new THREE.Vector3(0,1,0);if(Math.abs(tangent.dot(axis))>.95)axis.set(1,0,0);
                    const u=new THREE.Vector3().crossVectors(tangent,axis).normalize(),v=new THREE.Vector3().crossVectors(tangent,u).normalize();
                    for(let j=0;j<sides;j++){
                        const angle=j*Math.PI*2/sides;
                        const vertex=point.clone().addScaledVector(u,Math.cos(angle)*radii[i]).addScaledVector(v,Math.sin(angle)*radii[i]*(options.flatten||1));
                        positions.push(vertex.x,vertex.y,vertex.z);
                        const color=parseColor(options.tip&&i>=points.length-2?options.tip:options.rings&&i%2?(accent||shade(tail,-.55)):tail);
                        if(options.stripe&&Math.sin(angle)<-.5)color.copy(parseColor(options.stripe));
                        if(t==='leopard'&&i%2&&j%3===0)color.copy(parseColor(accent||shade(tail,-.65)));colors.push(color.r,color.g,color.b);
                    }
                });
                for(let i=0;i<points.length-1;i++)for(let j=0;j<sides;j++){
                    const a=i*sides+j,b=i*sides+(j+1)%sides;indices.push(a,b,a+sides,b,b+sides,a+sides);
                }
                for(let j=1;j<sides-1;j++){indices.push(0,j+1,j);const last=(points.length-1)*sides;indices.push(last,last+j,last+j+1);}
                return tailMesh('tail',positions,indices,colors);
            }
            function fin(name,outline,thickness=.055,color=tail){
                const positions=[],indices=[];
                for(const offset of [-thickness/2,thickness/2])outline.forEach(v=>positions.push(v[0],v[1]+offset,v[2]));
                const n=outline.length;
                for(let i=1;i<n-1;i++)indices.push(0,i+1,i,n,n+i,n+i+1);
                for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,n+i,j,n+j,n+i);}
                const mesh=tailMesh(name,positions,indices);mesh.material.color.copy(parseColor(color));return mesh;
            }
            const root=[0,-.83,-.24];
            if(['bunny','bear','panda','hamster','hedgehog','deer','hippo','frog'].includes(t)){
                const radius={bunny:.22,bear:.11,panda:.13,hamster:.065,hedgehog:.075,deer:.15,hippo:.085,frog:.09}[t];
                sweep([root,[0,-.8,-.42],[0,-.76,-.48-radius]], [radius*.5,radius,.015],{sides:6,tip:t==='deer'?(accent||belly):null});
            }else if(t==='pig'||t==='monkey'){
                const points=[root],radii=[t==='pig'?.05:.085],pig=t==='pig';
                for(let i=0;i<8;i++){const a=i*Math.PI*.32,rad=pig?.115:.26;points.push([Math.sin(a)*rad,-.62+Math.cos(a)*rad,-.48-i*(pig?.022:.05)]);radii.push((pig?.045:.075)*(1-i*.085));}
                sweep(points,radii,{sides:4});
            }else if(t==='beaver'){
                sweep([root,[0,-.9,-.51],[0,-.98,-.86],[0,-1.02,-1.12],[0,-1.03,-1.22]],[.08,.23,.3,.22,.025],{sides:6,flatten:.22});
                for(let i=0;i<3;i++)fin('paddleGroove',[[-.16,-.96-i*.017,-.78-i*.1],[.14,-.96-i*.017,-.8-i*.1],[.12,-.965-i*.017,-.82-i*.1]],.008,accent||shade(tail,-.3));
            }else if(['shark','dolphin','mermaid','axolotl'].includes(t)){
                sweep([root,[0,-.85,-.56],[0,-.83,-.92],[0,-.81,-1.16]],[.13,.16,.09,.035],{sides:5});
                if(t==='shark'){
                    // Shark fins are vertical; dolphin flukes are horizontal.
                    const finMesh=fin('verticalTailFin',[[0,-.81,-1.05],[.43,-.81,-1.42],[.06,-.81,-1.29],[-.26,-.81,-1.4],[-.13,-.81,-1.08]],.06,accent||tail);
                    finMesh.geometry.rotateZ(Math.PI/2);finMesh.geometry.translate(-.81,-.81,0);
                }else if(t==='axolotl'){
                    const membrane=fin('tailMembrane',[[0,-.81,-.4],[.2,-.81,-.64],[.23,-.81,-1.05],[0,-.81,-1.3],[-.23,-.81,-1.05],[-.2,-.81,-.64]],.03,accent||shade(tail,.25));
                    membrane.geometry.rotateZ(Math.PI/2);membrane.geometry.translate(-.81,-.81,0);
                }else fin('horizontalFlukes',[[0,-.81,-1.03],[.43,-.81,-1.32],[.39,-.81,-1.5],[0,-.81,-1.26],[-.39,-.81,-1.5],[-.43,-.81,-1.32]],.065,accent||tail);
            }else if(t==='bat'){
                sweep([root,[0,-.86,-.55],[0,-.82,-.8]],[.045,.04,.008],{sides:4});
                fin('batTailMembrane',[[0,-.82,-.43],[.25,-.82,-.7],[.12,-.82,-.65],[0,-.82,-.95],[-.12,-.82,-.65],[-.25,-.82,-.7]],.035,accent||tail);
            }else if(['duck','penguin','owl','peacock'].includes(t)){
                const count=t==='peacock'?7:t==='penguin'?3:5;
                for(let i=0;i<count;i++){
                    const angle=(i-(count-1)/2)*(t==='peacock'?.3:.22),length=t==='peacock'?1.05:t==='penguin'?.3:.49;
                    const tipX=Math.sin(angle)*length,tipY=t==='peacock'?-.65+Math.cos(angle)*length:-.78,tipZ=t==='peacock'?-.6:-.45-Math.cos(angle)*length;
                    fin('tailFeather',[[0,-.84,-.3],[tipX-.085,tipY-.04,tipZ],[tipX,tipY+.09,tipZ-.07],[tipX+.085,tipY-.04,tipZ]],.04,i%2&&accent?accent:tail);
                    if(t==='peacock')fin('featherEye',[[tipX-.045,tipY-.05,tipZ+.03],[tipX,tipY+.045,tipZ+.04],[tipX+.045,tipY-.05,tipZ+.03]],.012,accent||'#38aaad');
                }
            }else{
                const bushy=['fox','wolf','skunk','raccoon','red_panda','squirrel','chinchilla'].includes(t);
                const tufted=['lion','giraffe','zebra','elephant'].includes(t);
                const long=['snake','mouse','ferret','tiger','leopard'].includes(t);
                let points,radii;
                if(t==='squirrel'||t==='chinchilla'){
                    points=[root,[.08,-.78,-.57],[.19,-.4,-.72],[.24,.02,-.66],[.16,.25,-.47],[.04,.18,-.4]];radii=t==='squirrel'?[.1,.21,.3,.28,.17,.015]:[.08,.15,.19,.17,.09,.015];
                }else if(bushy){
                    points=[root,[.08,-.8,-.54],[.22,-.68,-.86],[.3,-.41,-1.09],[.25,-.19,-1.14],[.18,-.08,-1.12]];radii=t==='skunk'?[.1,.19,.29,.29,.17,.015]:[.09,.17,.24,.21,.12,.012];
                }else if(tufted){
                    points=[root,[.1,-.89,-.51],[.22,-.99,-.72],[.26,-1.06,-.92],[.29,-1.03,-1.02]];radii=[.06,.055,.045,.035,.02];
                }else{
                    points=[root,[.1,-.8,-.53],[.24,-.65,-.85],[.28,-.36,-1.02],[.18,-.18,-1.02]];radii=t==='dragon'?[.18,.17,.12,.07,.008]:long?[.07,.075,.06,.04,.008]:[.11,.13,.1,.07,.01];
                }
                if(t==='rhino'){points=[root,[.04,-.88,-.43],[.08,-.94,-.56],[.1,-.97,-.65]];radii=[.07,.065,.035,.008];}
                if(t==='snake'){points=[root,[.1,-1.03,-.6],[.35,-1.12,-.95],[.65,-1.15,-1.15],[.72,-1.1,-1.4],[.5,-1.08,-1.5]];radii=[.13,.12,.1,.07,.04,.008];}
                if(t==='mouse')radii=[.035,.033,.028,.018,.004];
                if(t==='otter')radii=[.16,.19,.15,.09,.01];
                if(t==='dog'){points=[root,[.2,-.77,-.48],[.42,-.6,-.65],[.54,-.38,-.67],[.57,-.27,-.63]];radii=[.095,.13,.12,.075,.008];}
                sweep(points,radii,{sides:bushy?6:5,rings:['raccoon','red_panda','tiger','protogen'].includes(t),flatten:t==='otter'?.65:1,stripe:t==='skunk'?(accent||belly):t==='chipmunk'?(accent||shade(tail,-.6)):null,tip:t==='fox'?(accent||belly):!tufted&&!['raccoon','red_panda','tiger','protogen','leopard','skunk','chipmunk'].includes(t)?accent:null});
                if(tufted){const end=points[points.length-1];sweep([end,[end[0]+.02,end[1]-.1,end[2]-.09],[end[0],end[1]-.19,end[2]-.12]],[.085,.12,.008],{sides:5,tip:accent||shade(tail,-.4)});}
                if(t==='dragon')for(let i=1;i<4;i++){const point=points[i];fin('tailSpade',[[point[0]-.1,point[1],point[2]],[point[0],point[1]+.19,point[2]-.07],[point[0]+.1,point[1],point[2]]],.04,accent||'#dfc674');}
                if(t==='protogen')for(let i=1;i<4;i++){const point=points[i];fin('tailArmor',[[point[0]-.12,point[1]+.04,point[2]],[point[0],point[1]+.1,point[2]-.12],[point[0]+.12,point[1]+.04,point[2]]],.06,accent||shade(tail,-.3));}
            }
        }
        const m=p.misc;
        if(m.endsWith('_wings'))for(const side of [-1,1]){
            const wing=ball('wing',m==='angel_wings'?'#fff8e8':misc,side*.75,-.27,-.39,.51,.23,.085);wing.rotation.z=side*.55;
            for(let i=0;i<3;i++)spike('wingTip',m==='angel_wings'?'#fff8e8':misc,side*(.75+i*.14),-.46-i*.09,-.4,.13,.36,side*.7);
        }
        if(m==='axolotl_gills')for(const side of [-1,1])for(let i=0;i<3;i++)tube('gill',[[side*.5,.18,0],[side*.84,.05+i*.2,0]],.05,pc.miscColor||'#e68aa9');
        if(m==='lion_mane'||m==='wolf_ruff'||m==='owl_feathers')for(let i=0;i<12;i++){const a=i*Math.PI/6;ball('ruff',misc,Math.cos(a)*.57,.12+Math.sin(a)*.5,-.18,.2,.23,.24);}
        if(m==='demon_horns')for(const side of [-1,1])spike('horn',misc,side*.36,.84,-.12,.14,.55,side*-.28);
        if(m==='shark_fin'||m==='dolphin_fin')spike('dorsalFin',misc,0,-.2,-.5,.24,.65,-.2);
        if(m==='hedgehog_spines')for(let i=0;i<12;i++)spike('spine',misc,Math.sin(i*2.4)*.42,-.65+(i%4)*.2,-.44,.1,.35,Math.sin(i)*.6);
        if(['fox_cheeks','squirrel_cheeks','hamster_cheeks'].includes(m))for(const side of [-1,1])ball('cheek',misc,side*.51,-.08,.15,.22,.19,.25);
        if(m==='whiskers_long')for(const side of [-1,1])for(let i=0;i<3;i++)tube('whisker',[[side*.2,-.08,.65],[side*.75,-.2+i*.12,.6]],.012,belly);
        // Retain the saved Extras ID; the face screen remains the separate Nose option.
        const signCode=window.ProtogenLogo?.normalize(cfg.protogenLogo)||'';
        let signTexture=null;
        if(m==='protogen_visor'&&signCode){
            const bits=window.ProtogenLogo.decode(signCode),ink=parseColor(cfg.eye||'#000000'),pixels=new Uint8Array(32*32*4);
            for(let i=0;i<bits.length;i++){
                pixels[i*4]=bits[i]?Math.round(ink.r*255):16;pixels[i*4+1]=bits[i]?Math.round(ink.g*255):25;pixels[i*4+2]=bits[i]?Math.round(ink.b*255):35;pixels[i*4+3]=255;
            }
            signTexture=new THREE.DataTexture(pixels,32,32,THREE.RGBAFormat);signTexture.flipY=true;
            signTexture.magFilter=THREE.NearestFilter;signTexture.minFilter=THREE.NearestFilter;signTexture.generateMipmaps=false;signTexture.needsUpdate=true;
        }
        if(m==='protogen_visor')for(const side of [-1,1]){
            const ring=geo(mats,g,new THREE.CylinderGeometry(.235,.235,.12,16),misc,side*.65,.19,-.06,0,0,Math.PI/2);ring.name='protogenSideRing';
            const rim=geo(mats,g,new THREE.CylinderGeometry(.195,.195,.125,16),'#172633',side*.66,.19,-.06,0,0,Math.PI/2);rim.name='protogenSideRim';
            const screen=geo(mats,g,new THREE.CylinderGeometry(.163,.163,.008,16),signTexture?'#101923':cfg.eye||'#000000',side*.727,.19,-.06,0,0,Math.PI/2);screen.name='protogenSideScreen';
            if(signTexture){
                const sign=new THREE.Mesh(new THREE.CircleGeometry(.162,16),new THREE.MeshBasicMaterial({map:signTexture}));
                sign.name='protogenSign';sign.position.set(side*.733,.19,-.06);sign.rotation.y=side*Math.PI/2;g.add(sign);
            }
            // A solid triangular fin sweeps back from each circular temple housing.
            const vertices=[];
            for(const x of [side*.60,side*.70])for(const [y,z]of [[.34,-.20],[.11,-.22],[.27,-.72]])vertices.push(x,y,z);
            const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
            geometry.setIndex(side===1?[0,2,1,3,4,5,0,1,4,0,4,3,1,2,5,1,5,4,2,0,3,2,3,5]:[0,1,2,3,5,4,0,4,1,0,3,4,1,5,2,1,4,5,2,3,0,2,5,3]);geometry.computeVertexNormals();
            const fin=geo(mats,g,geometry,misc);fin.name='protogenSideFin';
        }
        if(m==='halo')torus(mats,g,.4,.045,'#ffe480',0,.99,0,Math.PI/2,0,0);
        // Fitted PS1-style hair: a continuous scalp, angular cut lines and painted strands.
        const hair=cfg.hair||'none', hc=cfg.hairColor||base;
        if(hair!=='none'){
            const hairGroup=new THREE.Group();hairGroup.name='hair';g.add(hairGroup);
            // A tiny, deterministic palette texture supplies strands without extra geometry.
            const color=parseColor(hc), pixels=new Uint8Array(32*32*4);
            for(let y=0;y<32;y++)for(let x=0;x<32;x++){
                const strand=(x+Math.floor(y/8))%8;
                const shade=strand===0?.64:strand<3?1.08:strand===6?.82:.94;
                const root=y>25?.84:1, i=(y*32+x)*4;
                pixels[i]=Math.min(255,color.r*255*shade*root);
                pixels[i+1]=Math.min(255,color.g*255*shade*root);
                pixels[i+2]=Math.min(255,color.b*255*shade*root);pixels[i+3]=255;
            }
            const texture=new THREE.DataTexture(pixels,32,32,THREE.RGBAFormat);
            texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
            texture.needsUpdate=true;
            const hairMaterial=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
            function hairMesh(name,positions,uvs,indices){
                const geometry=new THREE.BufferGeometry();
                geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
                geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
                geometry.setIndex(indices);geometry.computeVertexNormals();
                const mesh=new THREE.Mesh(geometry,hairMaterial);mesh.name=name;hairGroup.add(mesh);return mesh;
            }
            // Outline follows the beveled head's rectangular footprint, including its corners.
            const rim=[[-.45,.48],[0,.49],[.45,.48],[.615,.31],[.625,0],[.615,-.31],[.45,-.48],[0,-.49],[-.45,-.48],[-.615,-.31],[-.625,0],[-.615,.31]];
            const hasHat=assets.hat&&assets.hat.id!=='none'&&!['flower','halo','antlers','arrow','headphones','crown','diamond','banana','void','ninja'].includes(assets.hat.type);
            const cropped=['buzzed','undercut','slicked','mohawk'].includes(hair);
            const long=['long','wavy','curly','mullet','shaggy'].includes(hair);
            const crownHeight=hasHat?.725:hair==='afro'?.94:hair==='pompadour'?.87:.775;
            const volume=hasHat?1:hair==='afro'?1.16:hair==='curly'?1.045:1;
            function hairline(i){
                const front=rim[i][1]>.3;
                if(front)return hair==='buzzed'?.55:.47;
                return cropped?.37:hair==='bob'?-.22:long?(hair==='mullet'&&Math.abs(rim[i][0])>.6?.07:-.76):.16;
            }
            const positions=[],uvs=[],indices=[],n=rim.length;
            // Top ring sits just outside the head bevel; skirt remains outside the cheeks.
            const rings=[{scale:1,y:null},{scale:1,y:.59},{scale:.69,y:Math.min(crownHeight-.025,.75)}];
            rings.forEach((ring,r)=>rim.forEach(([x,z],i)=>{
                const wave=hair==='wavy'&&r===0?Math.sin(i*2)*.035:0;
                positions.push(x*ring.scale*volume+wave,ring.y===null?hairline(i):ring.y,z*ring.scale*volume);
                uvs.push(i/n,r/3);
            }));
            for(let r=0;r<2;r++)for(let i=0;i<n;i++){
                const j=(i+1)%n,a=r*n+i,b=r*n+j,c=(r+1)*n+j,d=(r+1)*n+i;
                indices.push(a,b,d,b,c,d);
            }
            const peak=positions.length/3;positions.push(0,crownHeight,-.035);uvs.push(.5,1);
            for(let i=0;i<n;i++)indices.push(2*n+i,2*n+(i+1)%n,peak);
            const scalp=hair==='mohawk'?null:hairMesh('hairScalp',positions,uvs,indices);
            if(scalp)scalp.userData.fittedScalp=true;
            // Tapered ribbon solids create locks with a cut edge rather than round blobs.
            function lock(name,points,widths,thickness=.055){
                const p=[],uv=[],idx=[];
                points.forEach((point,j)=>{
                    const w=widths[j]/2;
                    for(const [x,z] of [[-w,-thickness/2],[w,-thickness/2],[w,thickness/2],[-w,thickness/2]]){
                        p.push(point[0]+x,point[1],point[2]+z);uv.push(x<0?0:1,1-j/(points.length-1));
                    }
                });
                for(let j=0;j<points.length-1;j++)for(let i=0;i<4;i++){
                    const a=j*4+i,b=j*4+(i+1)%4,c=b+4,d=a+4;idx.push(a,b,d,b,c,d);
                }
                const last=(points.length-1)*4;idx.push(0,2,1,0,3,2,last,last+1,last+2,last,last+2,last+3);
                return hairMesh(name,p,uv,idx);
            }
            const fringed=!['buzzed','slicked','undercut','mohawk','afro','bun','topknot'].includes(hair);
            if(fringed){
                const sweep=['emo','sidepart','pompadour'].includes(hair);
                for(let i=0;i<4;i++){
                    const x=-.39+i*.26;
                    const tipY=hair==='emo'?(.27+i*.055):hair==='bangs'?.40:.43+(i%2)*.045;
                    const dx=sweep?(hair==='emo'?.16:.1):i%2?.035:-.035;
                    lock('hairFringe',[[x,.64,.405],[x+dx*.5,.51,.49],[x+dx,tipY,.495]],[.29,.27,.025]);
                }
            }
            if(['spiky','messy','pixie','shaggy'].includes(hair)&&!hasHat){
                for(let i=0;i<6;i++){
                    const x=-.44+(i%3)*.44,z=i<3?.16:-.24;
                    lock('hairCrest',[[x,.68,z],[x+.07,.84,z-.035],[x+.13,hair==='pixie'?.88:.97,z-.07]],[.32,.23,.008],.15);
                }
            }
            if(hair==='mohawk'){
                // Leave the actual head exposed; the mohawk has no cap or stubble shell.
                if(!hasHat){
                    // One joined fin follows the skull from forehead to nape, with an arched comb.
                    const profile=[[.425,.48,.63],[.35,.65,.9],[.23,.72,1.06],[.11,.75,1.025],[-.02,.75,1.18],[-.15,.745,1.075],[-.27,.72,1.12],[-.39,.64,.94],[-.425,.46,.61]];
                    const vertices=[],uv=[],faces=[];
                    profile.forEach(([z,root,tip],i)=>{
                        root=Math.min(root,.705); // Embed the base into the head rather than a scalp shell.
                        const width=i===0||i===profile.length-1?.055:.09;
                        vertices.push(-width,root,z,width,root,z,.014,tip,z,-.014,tip,z);
                        uv.push(0,i/(profile.length-1),1,i/(profile.length-1),1,i/(profile.length-1),0,i/(profile.length-1));
                    });
                    for(let i=0;i<profile.length-1;i++)for(let j=0;j<4;j++){
                        const a=i*4+j,b=i*4+(j+1)%4;faces.push(a,b,a+4,b,b+4,a+4);
                    }
                    const last=(profile.length-1)*4;faces.push(0,2,1,0,3,2,last,last+1,last+2,last,last+2,last+3);
                    hairMesh('mohawkCrest',vertices,uv,faces);
                }else{
                    // No dyed crest is allocated under a closed hat.
                    hairMaterial.dispose();texture.dispose();
                }
            }
            if(hair==='afro'||hair==='curly'){
                // One integrated faceted volume, with a serrated cut edge instead of spheres.
                const attr=scalp.geometry.attributes.position;
                for(let i=0;i<n;i++)if(rim[i][1]<.3)attr.setY(i,attr.getY(i)+(i%2?.025:-.025));
                attr.needsUpdate=true;
            }
            if(['ponytail','braid','pigtails','twintails','dreads'].includes(hair)){
                if(hair==='dreads')for(let i=0;i<7;i++){
                    const angle=Math.PI*.12+i*Math.PI*.125,x=Math.cos(angle)*.56,z=-Math.sin(angle)*.47;
                    lock('hairDread',[[x,.56,z],[x*1.08,.12,z-.05],[x*1.06,-.57+(i%2)*.12,z-.07]],[.14,.13,.075],.1);
                }else{
                    const twin=['pigtails','twintails'].includes(hair);
                    for(const side of twin?[-1,1]:[0]){
                        const x=side*.55,z=twin?-.23:-.44;
                        if(hair==='braid'){
                            const points=[],widths=[];
                            for(let i=0;i<7;i++){points.push([Math.sin(i*Math.PI/2)*.035,.56-i*.17,-.46-Math.min(i,2)*.045]);widths.push(.2-i*.02);}
                            lock('hairBraid',points,widths,.115);
                        }else lock('hairTail',[[x,.56,z],[x+side*.14,.17,z-.17],[x+side*.13,hair==='pigtails'?-.34:-.67,z-.14]],[.22,.31,.04],.15);
                        lock('hairTie',[[x,.55,z],[x,.49,z]],[.24,.24],.17);
                    }
                }
            }
            if(['bun','topknot'].includes(hair)){
                // A single folded, pinched mesh anchored into the scalp.
                const y=hasHat?.46:hair==='topknot'?.77:.51,z=hasHat?-.66:hair==='topknot'?-.12:-.43;
                lock('hairBun',[[0,y,z],[0,y+.2,z-.08],[0,y+.24,z+.04],[0,y+.06,z+.1]],[.28,.4,.23,.16],.23);
            }
            if(hair==='pompadour'&&!hasHat)lock('hairQuiff',[[0,.67,.33],[0,.86,.25],[0,.88,.04]],[.81,.7,.43],.13);
            g.userData.hairStyle=hair;
        }
        const hat=assets.hat;
        if(hat&&hat.id!=='none'){
            const hatStart=g.children.length;
            const c=hat.color||'#ac8960',type=hat.type;
            if(['headphones','flower','halo','antlers','arrow','rainbow','banana'].includes(type)){
                if(type==='headphones'){torus(mats,g,.53,.065,c,0,.42,0,0,0,0);for(const side of [-1,1])block('earCup',c,side*.59,.3,0,.16,.34,.3);}
                if(type==='halo')torus(mats,g,.43,.045,c,0,1.05,0,Math.PI/2,0,0);
                if(type==='flower')for(let i=0;i<6;i++)ball('petal',c,-.4+Math.cos(i*Math.PI/3)*.14,.67+Math.sin(i*Math.PI/3)*.14,.23,.12,.12,.06);
                if(type==='antlers')for(const side of [-1,1])for(let i=0;i<3;i++)tube('hatAntler',[[side*.3,.6,0],[side*.5,1.05,0],[side*(.65+i*.1),1.1+i*.12,0]],.045,c);
                if(type==='arrow'){tube('arrowShaft',[[-.85,.7,0],[.85,.7,0]],.025,'#b99662');spike('arrowTip',c,.85,.7,0,.12,.25,-Math.PI/2);}
                if(type==='rainbow')for(let i=0;i<12;i++)ball('rainbowCurl',['#e85459','#f7b94a','#e5e66b','#74b77d','#7d91e5'][i%5],Math.sin(i*2.4)*.48,.7+(i%3)*.12,Math.cos(i*2.4)*.36,.24,.22,.24);
                if(type==='rainbow')ball('rainbowCrown','#e5e66b',0,.81,0,.38,.27,.34);
                if(type==='banana')tube('banana',[[-.45,.73,0],[0,.63,0],[.4,.95,0]],.12,'#f5d64f');
            }else{
                const coneHat=['cone','witch','santa','sombrero'].includes(type);
                const wide=['wide','witch','sombrero','fedora','tall','grad'].includes(type);
                if(wide)cyl(mats,g,.7,.7,.055,16,c,0,.66,0);
                if(coneHat)spike('hatCrown',c,0,.98,0,.43,type==='sombrero'?.55:.85);
                else if(type==='bow'){for(const side of [-1,1])ball('bowLoop',c,side*.2,.72,.12,.22,.14,.12);ball('bowKnot',c,0,.72,.13,.09,.1,.12);}
                else if(type==='tv'){block('tvShell',c,0,.85,0,.9,.62,.65);block('tvScreen','#7bcac7',0,.85,.34,.7,.4,.025);}
                else if(type==='plunger'){cyl(mats,g,.03,.03,.55,8,'#af8555',0,.85,0);ball('plungerCup',c,0,1.13,0,.3,.15,.3);}
                else if(type==='dome'||type==='beret'){const dome=ball('hatCrown',c,type==='beret'?.1:0,.72,0,type==='beret'?.58:.5,.2,.46);dome.rotation.z=type==='beret'?.15:0;}
                else if(type==='ninja')torus(mats,g,.47,.06,c,0,.49,0,Math.PI/2,0,0);
                else if(type==='void')ball('voidMask',c,0,.18,.47,.53,.41,.1);
                else if(type==='diamond'){torus(mats,g,.43,.04,c,0,.69,0,Math.PI/2,0,0);for(let i=0;i<5;i++)geo(mats,g,new THREE.OctahedronGeometry(.09),c,(i-2)*.14,.82-Math.abs(i-2)*.03,.32);}
                else if(type==='crown'){geo(mats,g,new THREE.CylinderGeometry(.46,.46,.2,8,1,true),c,0,.72,0);for(let i=0;i<6;i++){const a=i*Math.PI/3;spike('crownPoint',c,Math.cos(a)*.4,.93,Math.sin(a)*.4,.1,.3);}}
                else {cyl(mats,g,type==='bucket'?.39:.45,type==='bucket'?.52:.45,type==='tall'?.6:.23,12,c,0,type==='tall'?.95:.74,0);}
                if(['cap','police','miner','propeller'].includes(type))block('hatBrim',c,0,.66,.46,.72,.055,.4);
                if(type==='miner')ball('headlamp','#fff6b0',0,.8,.48,.13,.13,.075);
                if(type==='horn')for(const side of [-1,1])spike('helmetHorn','#ece1b7',side*.58,.84,0,.12,.5,side*-.5);
                if(type==='propeller'){tube('propellerStem',[[0,.84,0],[0,1.05,0]],.025,c);block('propeller','#e9ac46',0,1.06,0,.9,.035,.1);}
                if(type==='santa')ball('hatPom','#ffffff',0,1.42,0,.14,.14,.14);
                if(type==='ninja')for(const side of [-1,1])block('headbandTail',c,side*.2,.45,-.5,.12,.4,.05);
                if(type==='grad')block('mortarboard',c,0,.9,0,.95,.06,.95);
            }
            const pieces=g.children.slice(hatStart),headwear=new THREE.Group();headwear.name='headwear';
            pieces.forEach(mesh=>headwear.add(mesh));g.add(headwear);
            const accessory=['flower','halo','antlers','arrow','headphones','banana'].includes(type);
            if(accessory){headwear.scale.set(type==='headphones'?1.16:1.08,1,1.1);headwear.position.y=.035;}
            else{
                // Fit the hat opening around the rectangular scalp, not the old narrow sprite.
                headwear.scale.set(1.65,1,1.45);headwear.position.y=.065;
                headwear.userData.coversCrown=!['crown','diamond','void','ninja'].includes(type);
            }
            headwear.userData.hatType=type;
        }
        const collar=assets.collar;
        if(collar&&collar.id!=='none'){
            const c=collar.color||'#d34b65',begin=g.children.length;
            const band=geo(mats,g,new THREE.CylinderGeometry(.49,.49,.15,8,1,true),c,0,-.415,0);band.scale.z=.87;band.name='collarBand';
            block('collarBuckle','#e8c55b',0,-.415,.447,.13,.11,.045);
            if(collar.type==='bell'){
                ball('bell','#efc85b',0,-.59,.48,.13,.145,.11);
                block('bellSlot','#69512c',0,-.63,.585,.07,.022,.012);
            }
            if(collar.type==='spiked')for(let i=0;i<8;i++){
                const angle=i*Math.PI/4,dir=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
                const mesh=spike('collarSpike','#e5e5ee',dir.x*.5,-.415,dir.z*.44,.065,.18);
                mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
            }
            if(collar.type==='pearls')for(let i=0;i<10;i++){
                const a=i*Math.PI/5;ball('pearl',c,Math.cos(a)*.49,-.43,Math.sin(a)*.43,.085,.085,.085);
            }
            if(collar.type==='bow'){
                for(const side of [-1,1]){const loop=ball('neckBow',c,side*.17,-.48,.48,.22,.13,.085);loop.rotation.z=side*.2;}
                ball('bowKnot',shade(c,-.2),0,-.48,.55,.09,.1,.06);
            }
            if(collar.type==='bandana'){
                const geometry=new THREE.BufferGeometry();
                geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.3,-.43,.445,.3,-.43,.445,0,-.79,.42],3));geometry.computeVertexNormals();
                const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:c,side:THREE.DoubleSide}));mesh.name='bandana';g.add(mesh);
            }
            if(collar.type==='scarf'){
                block('scarfTail',c,.16,-.72,.43,.19,.53,.085);
                block('scarfTail',shade(c,-.13),-.1,-.65,.455,.16,.39,.075);
                block('scarfFringe',shade(c,.15),.16,-.97,.48,.2,.045,.025);
            }
            const pieces=g.children.slice(begin),neckwear=new THREE.Group();neckwear.name='neckwear';pieces.forEach(mesh=>neckwear.add(mesh));neckwear.position.y=.10;g.add(neckwear);
        }
        if(shirt&&shirt.type==='hoodie')ball('hood',shirt.color,0,-.31,-.36,.38,.19,.16);
        if(shirt&&shirt.type==='coat')block('coatSkirt',shirt.color,0,-1.02,0,.83,.3,.59);
        if(hat?.id==='ht_witch')geo(mats,g,new THREE.CylinderGeometry(.25,.31,.055,7,1,true),'#ec9b41',0,.91,0).name='emberHatBand';
        if(hat?.id==='ht_cap'){
            for(const side of [-1,1])spike('capPumpkinEye','#38233d',side*.11,.82,.41,.045,.06,Math.PI);
            block('capPumpkinGrin','#38233d',0,.73,.44,.18,.025,.015);
        }
        // Lift the complete upper body as one unit so every cosmetic stays fitted.
        // Feet keep their original ground plane; legs now expose room below shirts.
        for(const part of g.children)if(!['leg','foot'].includes(part.name))part.position.y+=proportions.upperLift;
        g.userData.upperLift=proportions.upperLift;
        g.userData.hipY=proportions.hipY;
        // Let world lighting describe the volume of the modeled surfaces.
        const lit=new Map();
        g.traverse(obj=>{
            if(!obj.material)return;
            // This bundled Three.js version uses geometry normals for Lambert facets.
            if(obj.geometry) {
                const original=obj.geometry;
                obj.geometry=original.index?original.toNonIndexed():original;
                if(obj.geometry!==original)original.dispose();
                obj.geometry.computeVertexNormals();
            }
            const convert=old=>{if(!lit.has(old)){lit.set(old,new THREE.MeshLambertMaterial({color:old.color,map:old.map,side:old.side,transparent:old.transparent,opacity:old.opacity,vertexColors:old.vertexColors}));old.dispose();}return lit.get(old);};obj.material=Array.isArray(obj.material)?obj.material.map(convert):convert(obj.material);});
        // Batch static parts by texture/render state. Separate ears, locks and tail
        // markings must not each cost a draw call; colors are baked into vertices.
        g.updateMatrixWorld(true);
        const batches=new Map(),sources=[];
        g.traverse(obj=>{if(obj.isMesh&&obj!==g.userData.mouth)sources.push(obj);});
        // Put all cosmetic surfaces in one atlas: separate CanvasTextures were
        // still forcing a texture bind/draw for every face and hair surface.
        const maps=new Map();
        sources.forEach(obj=>(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(material=>{if(material.map)maps.set(material.map.uuid,material.map);}));
        if(assets.headBlink)maps.set(assets.headBlink.uuid,assets.headBlink);
        const textures=[null,...maps.values()],columns=Math.ceil(Math.sqrt(textures.length));
        const maxWidth=Math.max(4,...textures.slice(1).map(t=>t.image&&t.image.width||1));
        const maxHeight=Math.max(4,...textures.slice(1).map(t=>t.image&&t.image.height||1));
        const cellWidth=maxWidth+2,cellHeight=maxHeight+2;
        const atlasWidth=THREE.MathUtils.ceilPowerOfTwo(columns*cellWidth),atlasHeight=THREE.MathUtils.ceilPowerOfTwo(Math.ceil(textures.length/columns)*cellHeight);
        const pixels=new Uint8Array(atlasWidth*atlasHeight*4),rects=new Map();
        textures.forEach((texture,index)=>{
            const image=texture&&texture.image,w=image&&image.width||1,h=image&&image.height||1;
            let data=image&&image.data;
            if(image&&typeof image.getContext==='function')data=image.getContext('2d').getImageData(0,0,w,h).data;
            const x=(index%columns)*cellWidth+1,y=Math.floor(index/columns)*cellHeight+1;
            for(let row=-1;row<=h;row++)for(let col=-1;col<=w;col++){
                const sourceX=Math.max(0,Math.min(w-1,col)),sourceY=Math.max(0,Math.min(h-1,row));
                const src=((texture&&texture.flipY?h-1-sourceY:sourceY)*w+sourceX)*4,dst=((y+row)*atlasWidth+x+col)*4;
                for(let channel=0;channel<4;channel++)pixels[dst+channel]=data?data[src+channel]:255;
            }
            rects.set(texture?texture.uuid:'solid',{x,y,w,h});
        });
        const atlas=new THREE.DataTexture(pixels,atlasWidth,atlasHeight,THREE.RGBAFormat);
        atlas.magFilter=THREE.NearestFilter;atlas.minFilter=THREE.NearestFilter;atlas.generateMipmaps=false;atlas.needsUpdate=true;
        const vertex=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
        sources.forEach(obj=>{
            const geometry=obj.geometry,position=geometry.attributes.position,normals=geometry.attributes.normal;
            const uv=geometry.attributes.uv,color=geometry.attributes.color;
            const materials=Array.isArray(obj.material)?obj.material:[obj.material];
            const groups=geometry.groups.length?geometry.groups:[{start:0,count:position.count,materialIndex:0}];
            normalMatrix.getNormalMatrix(obj.matrixWorld);
            groups.forEach(group=>{
                const material=materials[Array.isArray(obj.material)?group.materialIndex||0:0];
                const key=[material.side,material.transparent,material.opacity].join('|');
                const rect=rects.get(material.map?material.map.uuid:'solid');
                let batch=batches.get(key);
                if(!batch){batch={material,positions:[],normals:[],uvs:[],colors:[],walkVertices:[],emoteVertices:[],blinkVertices:[]};batches.set(key,batch);}
                for(let index=group.start;index<group.start+group.count;index++){
                    const i=geometry.index?geometry.index.getX(index):index;
                    vertex.fromBufferAttribute(position,i).applyMatrix4(obj.matrixWorld);
                    normal.fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize();
                    if(obj.name==='arm'||obj.name==='paw')batch.emoteVertices.push({index:batch.positions.length/3,side:obj.position.x<0?-1:1,part:obj.name});
                    if(obj.name==='leg'||obj.name==='foot')batch.walkVertices.push({index:batch.positions.length/3,side:obj.position.x<0?-1:1});
                    batch.positions.push(vertex.x,vertex.y,vertex.z);batch.normals.push(normal.x,normal.y,normal.z);
                    if(assets.headBlink&&(obj.name==='head'||obj.name==='protogenScreen')&&material.map===assets.headFront){
                        const closed=rects.get(assets.headBlink.uuid),u=uv?uv.getX(i):.5,v=uv?uv.getY(i):.5;
                        batch.blinkVertices.push({index:batch.uvs.length/2,open:[(rect.x+u*rect.w)/atlasWidth,(rect.y+v*rect.h)/atlasHeight],closed:[(closed.x+u*closed.w)/atlasWidth,(closed.y+v*closed.h)/atlasHeight]});
                    }
                    batch.uvs.push((rect.x+(uv?uv.getX(i):.5)*rect.w)/atlasWidth,(rect.y+(uv?uv.getY(i):.5)*rect.h)/atlasHeight);
                    // Bake restrained PS1-style directional shade once, rather than
                    // introducing dynamic-light shader work to the original sprite path.
                    const light=.78+.22*Math.max(0,normal.x*.3+normal.y*.8+normal.z*.5);
                    batch.colors.push(light*material.color.r*(material.vertexColors&&color?color.getX(i):1),light*material.color.g*(material.vertexColors&&color?color.getY(i):1),light*material.color.b*(material.vertexColors&&color?color.getZ(i):1));
                }
            });
            obj.visible=false;obj.userData.batchedSource=true;
        });
        const sourceRoots=g.children.filter(obj=>obj!==g.userData.mouth);
        batches.forEach(batch=>{
            const geometry=new THREE.BufferGeometry();
            geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.positions,3));
            geometry.setAttribute('normal',new THREE.Float32BufferAttribute(batch.normals,3));
            geometry.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uvs,2));
            geometry.setAttribute('color',new THREE.Float32BufferAttribute(batch.colors,3));
            const material=new THREE.MeshBasicMaterial({map:atlas,vertexColors:true,side:batch.material.side,transparent:batch.material.transparent,opacity:batch.material.opacity});
            const mesh=new THREE.Mesh(geometry,material);mesh.name='characterBatch';
            if(batch.blinkVertices.length){if(!g.userData.blinkBatches)g.userData.blinkBatches=[];g.userData.blinkBatches.push({geometry,vertices:batch.blinkVertices});}
            const pose={geometry,rest:geometry.attributes.position.array.slice(),normals:geometry.attributes.normal.array.slice(),vertices:batch.walkVertices,emoteVertices:batch.emoteVertices};
            pose.standingRoles=new Int8Array(geometry.attributes.position.count);
            for(const v of batch.walkVertices)pose.standingRoles[v.index]=-1;
            for(const v of batch.emoteVertices)pose.standingRoles[v.index]=v.side<0?(v.part==='paw'?2:1):(v.part==='paw'?4:3);
            if(!g.userData.poseBatches)g.userData.poseBatches=[];g.userData.poseBatches.push(pose);
            if(batch.walkVertices.length){
                if(!g.userData.walkBatches)g.userData.walkBatches=[];
                g.userData.walkBatches.push(pose);
            }
            geometry.computeBoundingSphere();geometry.boundingSphere.radius+=.4;
            // Original parts remain available for cosmetic lookups and geometric checks.
            mesh.raycast=function(){};mesh.updateMatrix();mesh.matrixAutoUpdate=false;g.add(mesh);
        });
        // Invisible originals otherwise still receive recursive matrix updates each frame.
        const sourceRoot=new THREE.Group();sourceRoot.name='characterSources';
        sourceRoots.forEach(obj=>sourceRoot.add(obj));g.userData.modelSources=sourceRoot;
        const namedSources=new Map();sourceRoot.traverse(obj=>{if(obj.name&&!namedSources.has(obj.name))namedSources.set(obj.name,obj);});
        const find=THREE.Object3D.prototype.getObjectByProperty;
        g.getObjectByProperty=function(key,value){return find.call(this,key,value)||(key==='name'?namedSources.get(value):sourceRoot.getObjectByProperty(key,value));};
        const mouthMaterial=g.userData.mouth.material;
        g.userData.mouth.material=new THREE.MeshBasicMaterial({color:mouthMaterial.color});mouthMaterial.dispose();
        g.userData.atlas=atlas;
        g.userData.drawCalls=batches.size+1;
        g.name='playerSprite';g.userData.is3D=true;g.userData.cfg=cfg;
        return g;
    }

    function animateWalk(body,moving,dt){
        if(!body?.userData.walkBatches)return;
        const state=body.userData.walkState||(body.userData.walkState={phase:0,weight:0});
        dt=Math.min(Math.max(dt||0,0),.1);
        if(!moving&&state.weight===0)return;
        state.weight=THREE.MathUtils.clamp(state.weight+(moving?1:-1)*dt*8,0,1);
        if(moving)state.phase+=dt*10;
        for(const batch of body.userData.walkBatches){
            const positions=batch.geometry.attributes.position,normals=batch.geometry.attributes.normal;
            for(const v of batch.vertices){
                const i=v.index*3,angle=Math.sin(state.phase)*v.side*.55*state.weight,c=Math.cos(angle),s=Math.sin(angle);
                const hip=body.userData.hipY??-.96,y=batch.rest[i+1]-hip,z=batch.rest[i+2];
                positions.setXYZ(v.index,batch.rest[i],y*c-z*s+hip+Math.abs(s)*.14,y*s+z*c);
                const ny=batch.normals[i+1],nz=batch.normals[i+2];
                normals.setXYZ(v.index,batch.normals[i],ny*c-nz*s,ny*s+nz*c);
            }
            positions.needsUpdate=true;normals.needsUpdate=true;
        }
        if(state.weight===0)state.phase=0;
    }

    // Reused scratch for the standing pose. These were allocated on every frame,
    // which produced a steady young-gen GC churn (visible as periodic hitches
    // while standing and turning the camera).
    const _standPoint = new THREE.Vector3(), _standNormal = new THREE.Vector3();
    const _standTarget = new THREE.Vector3(), _standShoulder = new THREE.Vector3();
    const _standDirection = new THREE.Vector3(), _standCenter = new THREE.Vector3();
    const _standIdlePoint = new THREE.Vector3(), _standIdleNormal = new THREE.Vector3();
    const _standPawRest = new THREE.Vector3(), _standArmRest = new THREE.Vector3();
    const _standUp = new THREE.Vector3(0, -1, 0), _standRotation = new THREE.Quaternion();
    function animateStanding(body,time,idleWeight,thinkingWeight){
        if(!body?.userData.poseBatches)return;
        const lift=body.userData.upperLift||0,hip=body.userData.hipY??-.96;
        const seated=!!body.userData.cfg.sitting;
        const breath=Math.sin(time*(seated?1.7:2))*(seated?.045:.009)*idleWeight,sway=seated?0:Math.sin(time*.8)*.012*idleWeight;
        const angle=Math.sin(time*.65)*(seated?.012:.008)*idleWeight+.035*thinkingWeight,c=Math.cos(angle),s=Math.sin(angle);
        const transform=body.userData.standingTransform||(body.userData.standingTransform=new THREE.Matrix4());
        transform.set(c,-s,0,hip*s+sway,s,c,0,hip*(1-c)+breath,0,0,1,0,0,0,0,1);
        const point=_standPoint,normal=_standNormal;
        const target=_standTarget.set(-.22,-.15+lift+Math.sin(time*2.5)*.008,.6);
        const shoulder=_standShoulder.set(-.53,-.35+lift,0);
        const direction=_standDirection.subVectors(target,shoulder),length=direction.length();
        const center=_standCenter.copy(shoulder).addScaledVector(direction,.5);
        const rotation=_standRotation.setFromUnitVectors(_standUp,direction.normalize());
        const idlePoint=_standIdlePoint,idleNormal=_standIdleNormal;
        const pawRest=_standPawRest.set(-.56,-.92+lift,.03),armRest=_standArmRest.set(-.53,-.65+lift,0);
        body.userData.standingAngle=angle;
        const occupied=body.userData.cfg.holdingRod||body.userData.cfg.holdingFish||body.userData.cfg.holdingTool;
        for(const batch of body.userData.poseBatches){
            const p=batch.geometry.attributes.position,n=batch.geometry.attributes.normal;
            for(let index=0;index<p.count;index++){
                const role=batch.standingRoles[index];if(role===-1)continue;
                const i=index*3;point.fromArray(batch.rest,i);normal.fromArray(batch.normals,i);
                if(role>0&&!(role>=3&&occupied)){
                    const side=role<=2?-1:1;
                    // A short, smooth hand adjustment between long relaxed pauses.
                    const cycle=((time+(side<0?0:2.8))%6+6)%6;
                    const adjustment=cycle<2.4?Math.pow(Math.sin(cycle/2.4*Math.PI),2):0;
                    const armAngle=side*(seated?adjustment*.22:Math.sin(time*1.5)*.035)*idleWeight,ca=Math.cos(armAngle),sa=Math.sin(armAngle);
                    const x=point.x-side*.53,y=point.y+.35-lift;
                    point.set(x*ca-y*sa+side*.53,x*sa+y*ca-.35+lift,point.z);
                    const nx=normal.x,ny=normal.y;normal.set(nx*ca-ny*sa,nx*sa+ny*ca,normal.z);
                    if(role<=2&&thinkingWeight>0){
                        idlePoint.copy(point);idleNormal.copy(normal);point.fromArray(batch.rest,i);
                        if(role===2)point.sub(pawRest).add(target);
                        else{point.sub(armRest);point.y*=length/.7;point.applyQuaternion(rotation).add(center);normal.fromArray(batch.normals,i);normal.y*=.7/length;normal.applyQuaternion(rotation).normalize();}
                        point.lerp(idlePoint,1-thinkingWeight);normal.lerp(idleNormal,1-thinkingWeight).normalize();
                    }
                }
                if(!(seated&&role>=3&&occupied)){
                    point.applyMatrix4(transform);const nx=normal.x,ny=normal.y;normal.set(nx*c-ny*s,nx*s+ny*c,normal.z);
                }
                p.setXYZ(index,point.x,point.y,point.z);n.setXYZ(index,normal.x,normal.y,normal.z);
            }
            p.needsUpdate=true;n.needsUpdate=true;
        }
        const mouth=body.userData.mouth;
        if(mouth){const rest=body.userData.standingMouthRest||(body.userData.standingMouthRest=mouth.position.clone());mouth.position.copy(rest).applyMatrix4(transform);}
    }

    function animateJump(body,airborne,velocity,dt,animateArms=true,cancel=false){
        if(!body?.userData.walkBatches)return null;
        const state=body.userData.jumpState||(body.userData.jumpState={airborne:false,weight:0,age:0,landing:0});
        dt=Math.min(Math.max(dt||0,0),.1);velocity=Number.isFinite(velocity)?velocity:0;
        if(cancel){airborne=false;state.landing=0;}
        else if(state.airborne&&!airborne)state.landing=.22;
        if(!airborne&&!state.airborne&&state.weight===0&&state.landing===0)return null;
        state.age=airborne?(state.airborne?state.age+dt:0):0;
        state.weight=cancel?0:THREE.MathUtils.clamp(state.weight+(airborne?1:-1)*dt*12,0,1);
        state.airborne=airborne;
        let compression=state.landing>0?Math.sin((1-state.landing/.22)*Math.PI)*.11:0;
        state.landing=cancel?0:Math.max(0,state.landing-dt);
        if(state.landing===0)compression=0;
        const lift=body.userData.upperLift||0,hip=body.userData.hipY??-.96;
        // A brief extension on takeoff gives way to a forward leg tuck.
        const tuck=(velocity>0&&state.age<.075?-.10:velocity>=0?.48:.27)*state.weight;
        const c=Math.cos(tuck),s=Math.sin(tuck);
        for(const batch of body.userData.walkBatches){
            const p=batch.geometry.attributes.position,n=batch.geometry.attributes.normal;
            for(const v of batch.vertices){
                const i=v.index*3,y=batch.rest[i+1]-hip,z=batch.rest[i+2];
                p.setXYZ(v.index,batch.rest[i],hip+y*c+z*s+.055*state.weight+compression,-y*s+z*c);
                n.setXYZ(v.index,batch.normals[i],batch.normals[i+1]*c+batch.normals[i+2]*s,-batch.normals[i+1]*s+batch.normals[i+2]*c);
            }
            if(animateArms)for(const v of batch.emoteVertices||[]){
                if(v.side>0&&(body.userData.cfg.holdingRod||body.userData.cfg.holdingFish||body.userData.cfg.holdingTool))continue;
                const i=v.index*3,angle=v.side*-.42*state.weight,ca=Math.cos(angle),sa=Math.sin(angle),x=batch.rest[i]-v.side*.53,y=batch.rest[i+1]+.35-lift;
                p.setXYZ(v.index,x*ca-y*sa+v.side*.53,x*sa+y*ca-.35+lift,batch.rest[i+2]-.07*state.weight);
                n.setXYZ(v.index,batch.normals[i]*ca-batch.normals[i+1]*sa,batch.normals[i]*sa+batch.normals[i+1]*ca,batch.normals[i+2]);
            }
            p.needsUpdate=true;n.needsUpdate=true;
        }
        return cancel?null:compression;
    }

    function animateEmote(body,id,time,weight=1){
        const lift=body.userData.upperLift||0;
        for(const batch of body.userData.walkBatches||[]){
            const p=batch.geometry.attributes.position,n=batch.geometry.attributes.normal;
            for(const v of batch.emoteVertices||[]){
                let angle=0,forward=0,inward=0,liftMotion=0;
                const side=v.side,wave=Math.sin(time*10),beat=Math.sin(time*7);
                switch(id){
                 case 'wave':if(side>0)angle=2.25+wave*.35;break;
                 case 'cheer':angle=side*(2.4+Math.sin(time*8)*.15);break;
                 case 'dance':angle=side*(1.1+Math.sin(time*7+side)*.5);break;
                 case 'clap':forward=-1.45;inward=-side*(.28+.17*Math.abs(Math.sin(time*7)));break;
                 case 'shrug':angle=side*1.55;liftMotion=.06;break;
                 case 'point':if(side>0){forward=-1.65;inward=-.08;}break;
                 case 'salute':if(side>0){angle=2.7;forward=-.4;inward=-.15;}break;
                 case 'facepalm':if(side>0){forward=-2.65;inward=-.45;liftMotion=.12;}break;
                 case 'laugh':forward=-1.1;inward=-side*.28;liftMotion=Math.sin(time*12)*.02;break;
                 case 'cry':forward=-2.6;inward=-side*.3;liftMotion=Math.sin(time*8+side)*.04;break;
                 case 'shiver':forward=-1.4;inward=-side*.34;liftMotion=Math.sin(time*25+side)*.025;break;
                 case 'stretch':angle=side*2.85;forward=-.1;break;
                 case 'yawn':if(side>0){forward=-2.4;inward=-.43;liftMotion=.1;}break;
                 case 'flex':angle=side*2.05;forward=-.35;liftMotion=Math.sin(time*4)*.035;break;
                 case 'heart':forward=-1.7;inward=-side*.39;liftMotion=.1;break;
                 case 'disco':angle=side>0?2.4+beat*.3:.6-beat*.15;break;
                 case 'robot':forward=-1.5+Math.round(Math.sin(time*4+side)*2)*.35;angle=side*.4;break;
                 case 'sway':angle=side*.5+Math.sin(time*2.5)*.25;break;
                 case 'happyhop':angle=side*(1.8+Math.sin(time*6)*.4);break;
                 case 'stomp':angle=side*.5;forward=-.9+Math.sin(time*9+side)*.2;break;
                 case 'tiptoe':forward=-1.2+Math.sin(time*8+side)*.3;angle=side*.35;break;
                 case 'peekaboo':{const hidden=Math.cos(time*4)>0;forward=hidden?-2.7:-1.1;inward=-side*(hidden?.32:0);angle=hidden?0:side*1.5;break;}
                 case 'airplane':angle=side*Math.PI/2;break;
                }
                angle*=weight;forward*=weight;inward*=weight;liftMotion*=weight;
                const i=v.index*3,x=batch.rest[i]-side*.53,y=batch.rest[i+1]+.35-lift,z=batch.rest[i+2];
                const cx=Math.cos(forward),sx=Math.sin(forward),c=Math.cos(angle),s=Math.sin(angle),fy=y*cx-z*sx,fz=y*sx+z*cx;
                p.setXYZ(v.index,x*c-fy*s+side*.53+inward,x*s+fy*c-.35+lift+liftMotion,fz);
                const nx=batch.normals[i],ny=batch.normals[i+1],nz=batch.normals[i+2],fny=ny*cx-nz*sx,fnz=ny*sx+nz*cx;
                n.setXYZ(v.index,nx*c-fny*s,nx*s+fny*c,fnz);
            }
            p.needsUpdate=true;n.needsUpdate=true;
        }
    }
    const _reelTarget = new THREE.Vector3(), _reelShoulder = new THREE.Vector3();
    const _reelDirection = new THREE.Vector3(), _reelCenter = new THREE.Vector3();
    const _reelPoint = new THREE.Vector3(), _reelNormal = new THREE.Vector3();
    const _reelPawRest = new THREE.Vector3(), _reelArmRest = new THREE.Vector3();
    const _reelRotation = new THREE.Quaternion();
    function animateReel(body,phase,weight){
        const lift=body.userData.upperLift||0,seated=body.userData.cfg.sitting;
        const bob=Math.sin(phase*.5)*.025,tilt=1.05+Math.sin(phase*.5)*.035;
        const crankY=-.1-.1*Math.cos(phase),crankZ=-.17-.1*Math.sin(phase);
        const target=_reelTarget.set(.38,-.62+lift+bob+crankY*Math.cos(tilt)-crankZ*Math.sin(tilt),.43+crankY*Math.sin(tilt)+crankZ*Math.cos(tilt));
        const shoulder=_reelShoulder.set(seated?-.51:-.53,(seated?-.33:-.35)+lift,seated?.12:0);
        const direction=_reelDirection.subVectors(target,shoulder),length=direction.length();
        const center=_reelCenter.copy(shoulder).addScaledVector(direction,.5);
        const rotation=_reelRotation.setFromUnitVectors(_standUp,direction.normalize());
        const point=_reelPoint,normal=_reelNormal;
        const pawRest=_reelPawRest.set(seated?-.43:-.56,(seated?-.9:-.92)+lift,seated?.32:.03),armRest=_reelArmRest.set(seated?-.51:-.53,(seated?-.63:-.65)+lift,seated?.12:0);
        for(const batch of body.userData.walkBatches||[]){
            const p=batch.geometry.attributes.position,n=batch.geometry.attributes.normal;
            for(const v of batch.emoteVertices||[]){
                const i=v.index*3;point.fromArray(batch.rest,i);normal.fromArray(batch.normals,i);
                if(v.side>0){point.y+=bob;}
                else if(v.part==='paw'){point.sub(pawRest).add(target);}
                else {point.sub(armRest);point.y*=length/.7;point.applyQuaternion(rotation).add(center);normal.y*=.7/length;normal.applyQuaternion(rotation).normalize();}
                p.setXYZ(v.index,THREE.MathUtils.lerp(batch.rest[i],point.x,weight),THREE.MathUtils.lerp(batch.rest[i+1],point.y,weight),THREE.MathUtils.lerp(batch.rest[i+2],point.z,weight));
                n.setXYZ(v.index,THREE.MathUtils.lerp(batch.normals[i],normal.x,weight),THREE.MathUtils.lerp(batch.normals[i+1],normal.y,weight),THREE.MathUtils.lerp(batch.normals[i+2],normal.z,weight));
            }
            p.needsUpdate=true;n.needsUpdate=true;
        }
    }

    function setBlink(body,closed){
        if(body.userData.blinkClosed===closed)return;body.userData.blinkClosed=closed;
        for(const batch of body.userData.blinkBatches||[]){const uv=batch.geometry.attributes.uv;for(const vertex of batch.vertices){const value=closed?vertex.closed:vertex.open;uv.setXY(vertex.index,value[0],value[1]);}uv.needsUpdate=true;}
    }
    window.Character3D = { animateStanding, animateJump, proportions, animateReel, setBlink, animateEmote, animateWalk, buildTool, buildRod, tailAccentTypes, buildFish: buildFish, buildCharacter: buildCharacter };
})();
