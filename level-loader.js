// --- CUSTOM LEVEL LOADER ---
// Lets the game play levels built in editor.html.
//
// This runs AFTER ui.js has been parsed but BEFORE window.onload fires, which
// is when the game builds its world — so a level loaded here is already active
// by the time setupThreeJS() runs.
(function () {
    "use strict";

    const KEY = "htmlfishing.level";
    // A level handed over by a multiplayer host lives here for this tab only,
    // so it never overwrites whatever the player saved in their own editor.
    const SESSION_KEY = "htmlfishing.level.session";

    function readStored() {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(KEY);
            return raw ? window.Level.normalize(JSON.parse(raw)) : null;
        } catch (err) {
            return null;
        }
    }

    // Only switch away from the normal island when explicitly asked, so the
    // default game is completely unaffected.
    let active = null;
    try {
        if (new URLSearchParams(location.search).get("custom")) active = readStored();
    } catch (err) { /* ignore */ }
    window.CUSTOM_LEVEL = active;

    function shownLevel() { return window.CUSTOM_LEVEL || readStored(); }

    function refreshUI() {
        const nameEl = document.getElementById("custom-level-name");
        const playBtn = document.getElementById("btn-custom-play");
        const clearBtn = document.getElementById("btn-custom-clear");
        if (!nameEl) return;
        const lv = shownLevel();
        if (lv) {
            const counts = window.Level.countZoneWater(lv);
            let zoned = 0;
            Object.keys(counts).forEach(function (k) { if (+k !== 0) zoned += counts[k]; });
            nameEl.textContent = lv.name + "  ·  " + lv.trees.length + " trees, " +
                lv.rocks.length + " rocks, " + lv.npcs.length + " NPCs" +
                (zoned ? ", " + zoned + " zoned tiles" : "") +
                (window.CUSTOM_LEVEL ? "  (active)" : "");
            nameEl.style.color = window.CUSTOM_LEVEL ? "var(--p-good)" : "var(--p-text-dim)";
        } else {
            nameEl.textContent = "None loaded";
            nameEl.style.color = "var(--p-text-mute)";
        }
        if (playBtn) playBtn.disabled = !lv;
        if (clearBtn) clearBtn.disabled = !lv;
    }

    window.CustomLevel = {
        active: function () { return !!window.CUSTOM_LEVEL; },
        get: function () { return window.CUSTOM_LEVEL; },
        stored: readStored,
        set: function (obj) {
            window.CUSTOM_LEVEL = window.Level.normalize(obj);
            try { localStorage.setItem(KEY, JSON.stringify(window.Level.serialize(window.CUSTOM_LEVEL))); } catch (err) { /* ignore */ }
            refreshUI();
        },
        clear: function () {
            window.CUSTOM_LEVEL = null;
            try {
                localStorage.removeItem(KEY);
                sessionStorage.removeItem(SESSION_KEY);
            } catch (err) { /* ignore */ }
            refreshUI();
        },
        // Key the game uses to hand a level to a joining multiplayer player.
        sessionKey: SESSION_KEY
    };

    function note(msg) {
        const el = document.getElementById("lobby-status");
        if (el) el.textContent = msg;
    }

    function reloadCustom() { location.href = "index.html?custom=1"; }

    function wire() {
        const loadBtn = document.getElementById("btn-custom-load");
        const editBtn = document.getElementById("btn-custom-editor");
        const playBtn = document.getElementById("btn-custom-play");
        const clearBtn = document.getElementById("btn-custom-clear");
        const fileInput = document.getElementById("custom-level-file");

        if (loadBtn && fileInput) loadBtn.onclick = function () { fileInput.click(); };

        if (fileInput) fileInput.onchange = function (e) {
            const f = e.target.files && e.target.files[0];
            e.target.value = "";
            if (!f) return;
            const reader = new FileReader();
            reader.onload = function () {
                try {
                    window.CustomLevel.set(JSON.parse(reader.result));
                    note("Level loaded — switching to it...");
                    setTimeout(reloadCustom, 350);
                } catch (err) {
                    note("That file is not a valid level.");
                }
            };
            reader.readAsText(f);
        };

        if (editBtn) editBtn.onclick = function () { window.open("editor.html", "_blank"); };
        if (playBtn) playBtn.onclick = function () { if (shownLevel()) reloadCustom(); };
        if (clearBtn) clearBtn.onclick = function () {
            window.CustomLevel.clear();
            note("Custom level cleared — reloading the normal island...");
            setTimeout(function () { location.href = "index.html"; }, 300);
        };

        if (window.CUSTOM_LEVEL) note("Playing custom level: " + window.CUSTOM_LEVEL.name);
        refreshUI();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
    else wire();
})();
