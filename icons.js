// --- PIXEL ICON SYSTEM ---
// Tiny 16x16 pixel-art icons drawn with hard-edged rectangles so the UI keeps a
// crisp 8-bit look on every platform (emoji render differently per OS).
// Usage:  PX.icon('gear', 16)   -> SVG markup string
//         PX.hydrate(element)   -> swap standalone emoji text nodes for icons
(function () {
    // Each entry is a list of [x, y, w, h] blocks on a 16x16 grid.
    const R = {
        gear: [[7, 0, 2, 2], [7, 14, 2, 2], [0, 7, 2, 2], [14, 7, 2, 2], [2, 2, 2, 2], [12, 2, 2, 2], [2, 12, 2, 2], [12, 12, 2, 2], [5, 5, 6, 2], [5, 9, 6, 2], [5, 7, 2, 2], [9, 7, 2, 2]],
        shield: [[2, 1, 12, 2], [2, 3, 2, 5], [12, 3, 2, 5], [4, 8, 2, 3], [10, 8, 2, 3], [6, 11, 4, 2], [7, 13, 2, 2]],
        users: [[2, 3, 4, 4], [1, 8, 6, 5], [10, 3, 4, 4], [9, 8, 6, 5]],
        book: [[2, 2, 2, 12], [12, 2, 2, 12], [2, 2, 12, 2], [2, 12, 12, 2], [5, 5, 6, 1], [5, 8, 6, 1]],
        fish: [[1, 6, 9, 4], [10, 4, 2, 3], [10, 9, 2, 3], [3, 4, 3, 2], [3, 11, 3, 2]],
        hand: [[3, 6, 2, 3], [5, 4, 2, 5], [7, 2, 2, 7], [9, 4, 2, 5], [3, 9, 8, 3], [1, 9, 2, 3]],
        rod: [[13, 1, 2, 2], [3, 13, 2, 2], [4, 12, 2, 2], [5, 11, 2, 2], [6, 10, 2, 2], [7, 9, 2, 2], [8, 8, 2, 2], [9, 7, 2, 2], [10, 6, 2, 2], [11, 5, 2, 2], [12, 4, 2, 2], [2, 14, 3, 2], [4, 10, 3, 3]],
        axe: [[3, 2, 6, 2], [1, 4, 7, 5], [3, 9, 4, 2], [7, 2, 2, 13], [9, 4, 3, 3]],
        pickaxe: [[7, 3, 2, 13], [1, 4, 14, 2], [2, 2, 3, 2], [11, 2, 3, 2], [4, 6, 8, 1]],
        guitar: [[7, 0, 2, 2], [6, 2, 4, 1], [7, 3, 2, 5], [5, 8, 6, 2], [4, 10, 8, 4], [5, 14, 6, 1]],
        glove: [[3, 2, 10, 8], [2, 4, 1, 4], [13, 5, 1, 4], [5, 10, 6, 4], [6, 14, 4, 1]],
        mic: [[6, 1, 4, 8], [4, 2, 2, 6], [10, 2, 2, 6], [7, 9, 2, 3], [4, 12, 8, 2]],
        micOff: [[6, 1, 4, 8], [4, 2, 2, 4], [10, 2, 2, 4], [7, 9, 2, 3], [4, 12, 8, 2], [1, 1, 2, 2], [3, 3, 2, 2], [5, 5, 2, 2], [8, 8, 2, 2], [10, 10, 2, 2], [12, 12, 2, 2], [14, 14, 2, 2]],
        chat: [[2, 2, 12, 8], [5, 10, 3, 2], [5, 12, 3, 2]],
        chatOff: [[2, 2, 12, 8], [5, 10, 3, 2], [5, 12, 3, 2], [3, 3, 2, 2], [5, 5, 2, 2], [8, 8, 2, 2], [10, 10, 2, 2], [12, 12, 2, 2]],
        trash: [[6, 1, 4, 1], [3, 2, 10, 2], [4, 4, 8, 11], [6, 6, 1, 7], [9, 6, 1, 7], [12, 6, 1, 7]],
        fullscreen: [[1, 1, 5, 2], [1, 1, 2, 5], [10, 1, 5, 2], [14, 1, 2, 5], [1, 13, 5, 2], [1, 10, 2, 5], [10, 13, 5, 2], [14, 10, 2, 5]],
        cat: [[5, 2, 3, 3], [9, 2, 3, 3], [3, 5, 3, 3], [11, 5, 3, 3], [5, 7, 6, 5], [6, 12, 4, 2]],
        money: [[3, 2, 10, 2], [3, 12, 10, 2], [3, 2, 2, 12], [11, 2, 2, 12], [5, 4, 6, 1], [5, 8, 6, 1], [7, 4, 2, 6]],
        chart: [[2, 2, 2, 12], [12, 2, 2, 12], [2, 12, 12, 2], [5, 7, 2, 5], [8, 4, 2, 8], [11, 2, 2, 10]],
        chartUp: [[2, 12, 12, 2], [3, 8, 2, 4], [6, 6, 2, 6], [9, 3, 2, 9], [12, 1, 2, 11]],
        controller: [[1, 4, 14, 7], [3, 11, 2, 2], [11, 11, 2, 2], [4, 5, 2, 4], [7, 5, 1, 1], [8, 6, 2, 1], [12, 5, 2, 2]],
        hammer: [[3, 1, 6, 6], [5, 7, 2, 8], [9, 4, 6, 2], [13, 6, 2, 2]],
        globe: [[5, 0, 6, 2], [3, 2, 2, 12], [11, 2, 2, 12], [5, 14, 6, 2], [7, 2, 2, 12], [3, 7, 10, 2]],
        flower: [[6, 3, 4, 4], [4, 2, 2, 2], [10, 2, 2, 2], [4, 6, 2, 2], [10, 6, 2, 2], [7, 7, 2, 6], [4, 10, 3, 2], [9, 9, 3, 2]],
        lock: [[4, 7, 8, 8], [6, 3, 4, 3], [5, 4, 2, 3], [9, 4, 2, 3], [7, 10, 2, 3]],
        unlock: [[4, 7, 8, 8], [9, 3, 4, 3], [10, 2, 2, 2], [7, 10, 2, 3]],
        star: [[7, 0, 2, 4], [5, 4, 6, 2], [2, 6, 12, 2], [4, 8, 2, 3], [10, 8, 2, 3], [5, 11, 2, 2], [9, 11, 2, 2], [7, 13, 2, 2]],
        warn: [[7, 0, 2, 2], [6, 2, 4, 2], [5, 4, 6, 2], [4, 6, 8, 2], [3, 8, 10, 2], [2, 10, 12, 4], [7, 6, 2, 4], [7, 11, 2, 1]],
        refresh: [[4, 2, 8, 2], [2, 4, 2, 8], [12, 4, 2, 8], [4, 12, 8, 2], [10, 0, 3, 3], [3, 13, 3, 3]],
        save: [[2, 2, 12, 12], [3, 3, 6, 5], [10, 2, 3, 5], [4, 9, 8, 5]],
        folder: [[1, 3, 14, 10], [2, 1, 5, 3], [3, 5, 10, 1]],
        tag: [[3, 3, 10, 10], [6, 6, 4, 4], [1, 1, 3, 3]],
        bug: [[6, 3, 4, 9], [4, 3, 2, 2], [10, 3, 2, 2], [3, 6, 3, 1], [10, 6, 3, 1], [3, 9, 3, 1], [10, 9, 3, 1], [4, 12, 2, 2], [10, 12, 2, 2]],
        music: [[6, 1, 2, 10], [8, 1, 5, 2], [11, 3, 2, 5], [3, 11, 3, 3]],
        // --- PROPS ---
        campfire: [[7, 1, 2, 3], [6, 4, 4, 3], [5, 7, 6, 4], [2, 11, 12, 2], [4, 13, 8, 1]],
        tent: [[7, 1, 2, 14], [5, 4, 2, 11], [9, 4, 2, 11], [3, 7, 2, 8], [11, 7, 2, 8], [1, 10, 2, 5], [13, 10, 2, 5], [6, 12, 4, 3]],
        blanket: [[1, 5, 14, 6], [3, 5, 1, 6], [6, 5, 1, 6], [9, 5, 1, 6], [12, 5, 1, 6], [1, 7, 14, 1]],
        chair: [[4, 1, 8, 2], [4, 3, 2, 8], [10, 3, 2, 8], [4, 11, 8, 2], [4, 13, 2, 2], [10, 13, 2, 2]],
        table: [[1, 4, 14, 2], [3, 6, 2, 8], [11, 6, 2, 8], [5, 6, 6, 1]],
        cooler: [[2, 6, 12, 8], [1, 4, 14, 2], [3, 7, 10, 1], [2, 10, 12, 1]],
        basket: [[1, 5, 14, 2], [2, 7, 12, 7], [4, 3, 8, 2], [5, 9, 1, 5], [8, 9, 1, 5], [11, 9, 1, 5]],
        radio: [[2, 5, 12, 8], [3, 6, 6, 4], [10, 6, 3, 4], [4, 10, 8, 2]],
        lantern: [[7, 0, 2, 2], [5, 2, 6, 2], [4, 4, 8, 9], [3, 13, 10, 1], [6, 6, 4, 5]],
        umbrella: [[7, 0, 2, 3], [2, 3, 12, 2], [4, 5, 8, 2], [6, 7, 4, 3], [7, 10, 2, 4], [5, 13, 4, 1]],
        grill: [[2, 4, 12, 6], [1, 3, 14, 2], [5, 10, 2, 4], [9, 10, 2, 4], [6, 12, 4, 2]],
        hammock: [[1, 3, 2, 10], [13, 3, 2, 10], [3, 6, 10, 5], [3, 8, 10, 1], [3, 10, 10, 1]],
        logbench: [[1, 6, 14, 3], [1, 9, 14, 1], [2, 10, 2, 4], [12, 10, 2, 4]],
        fishsign: [[2, 1, 2, 14], [4, 2, 9, 6], [13, 4, 2, 2], [6, 4, 6, 2]],
        crate: [[2, 3, 12, 11], [2, 3, 12, 2], [2, 12, 12, 2], [4, 5, 1, 8], [11, 5, 1, 8], [5, 6, 6, 1], [5, 8, 6, 1]],
        buoy: [[6, 3, 4, 9], [4, 5, 2, 5], [10, 5, 2, 5], [5, 1, 6, 2], [5, 12, 2, 3], [9, 12, 2, 3], [6, 8, 4, 2]],
        anchor: [[7, 1, 2, 3], [4, 3, 8, 2], [4, 4, 2, 2], [10, 4, 2, 2], [7, 5, 2, 8], [2, 9, 2, 4], [12, 9, 2, 4], [3, 12, 4, 2], [9, 12, 4, 2], [6, 13, 4, 1]],
        flowerpot: [[6, 3, 4, 3], [4, 2, 2, 2], [10, 2, 2, 2], [4, 6, 2, 2], [10, 6, 2, 2], [7, 6, 2, 2], [3, 8, 10, 2], [4, 10, 8, 5]],
        torch: [[7, 5, 2, 9], [6, 2, 3, 4], [5, 0, 6, 2], [6, 13, 4, 1], [5, 14, 6, 1]],
        boat: [[1, 9, 14, 3], [2, 12, 12, 1], [8, 1, 2, 8], [10, 2, 4, 2], [10, 5, 3, 2]],
        tireswing: [[2, 1, 2, 7], [12, 1, 2, 7], [4, 2, 8, 2], [5, 4, 6, 1], [4, 8, 8, 7], [5, 10, 2, 4], [9, 10, 2, 4]],
        hotspring: [[2, 2, 2, 5], [4, 0, 2, 4], [12, 2, 2, 5], [10, 0, 2, 4], [6, 1, 4, 4], [2, 8, 12, 6], [3, 10, 10, 3]],
        windchime: [[7, 0, 2, 3], [4, 3, 8, 2], [5, 5, 2, 6], [9, 5, 2, 6], [7, 5, 2, 8], [5, 12, 2, 3], [9, 12, 2, 3]],
        surfboard: [[7, 0, 2, 1], [6, 1, 4, 14], [5, 3, 2, 10], [9, 3, 2, 10], [6, 15, 4, 1], [7, 6, 2, 4]],
        // YouTube Screen: TV frame with a glowing panel + play button and antennas.
        screen: [[3, 1, 10, 8], [4, 2, 8, 6], [7, 4, 2, 2], [7, 9, 2, 2], [4, 11, 8, 1], [7, 13, 2, 2]],
        dot: [[4, 4, 8, 8]],
        mouse: [[5, 1, 6, 14], [7, 1, 2, 5]],
        // Cooking pot with two handles; steam curls above the rim.
        pot: [[3, 5, 10, 8], [2, 6, 2, 4], [12, 6, 2, 4], [4, 4, 8, 2], [1, 7, 1, 2], [14, 7, 1, 2], [5, 9, 6, 2], [6, 13, 4, 2], [6, 0, 1, 3], [9, 1, 1, 3]],
        // Stacked coins.
        coin: [[4, 8, 8, 2], [3, 10, 10, 2], [4, 12, 8, 2], [5, 6, 6, 2], [4, 4, 8, 2]],
        camera: [[2, 5, 12, 9], [5, 2, 6, 3], [6, 7, 4, 4]],
        trophy: [[5, 1, 6, 3], [3, 3, 2, 4], [11, 3, 2, 4], [5, 7, 6, 3], [7, 10, 2, 1], [4, 11, 8, 2], [3, 13, 10, 2]],
        sun: [[7, 1, 2, 2], [7, 13, 2, 2], [1, 7, 2, 2], [13, 7, 2, 2], [5, 4, 6, 8], [4, 5, 8, 6]],
        moon: [[8, 1, 4, 2], [6, 3, 4, 2], [5, 5, 3, 6], [6, 11, 4, 2], [8, 13, 4, 2], [10, 5, 2, 6]],
        wave: [[1, 8, 4, 2], [5, 6, 4, 2], [9, 8, 4, 2], [5, 12, 4, 2], [9, 10, 4, 2], [1, 12, 4, 2]],
        droplet: [[7, 1, 2, 3], [6, 4, 4, 3], [4, 7, 8, 4], [5, 11, 6, 2]],
        tree: [[7, 1, 2, 3], [5, 4, 6, 3], [3, 7, 10, 3], [2, 10, 12, 2], [7, 12, 2, 3]],
        rock: [[4, 4, 8, 9], [2, 8, 3, 5], [11, 7, 3, 6], [6, 2, 4, 3]],
        home: [[7, 0, 2, 2], [5, 2, 6, 2], [3, 4, 10, 2], [1, 6, 14, 2], [2, 8, 12, 7], [6, 11, 4, 4]],
        cave: [[7, 1, 2, 2], [5, 3, 6, 2], [3, 5, 10, 3], [1, 8, 14, 2], [1, 10, 3, 5], [12, 10, 3, 5], [4, 10, 2, 5], [10, 10, 2, 5]],
        warnBig: [[7, 0, 2, 5], [7, 7, 2, 2]]
    };

    // Aliases so tool ids can be used directly as icon names ("hands" -> "hand").
    R.hands = R.hand;

    // Emoji -> icon name, used to swap standalone emoji in the DOM.
    const EMOJI = {
        '\u2699\uFE0F': 'gear', '\u2699': 'gear',
        '\uD83D\uDEE1\uFE0F': 'shield', '\uD83D\uDEE1': 'shield',
        '\uD83D\uDC65': 'users',
        '\uD83D\uDCD6': 'book',
        '\uD83D\uDC1F': 'fish',
        '\uD83D\uDC21': 'fish',
        '\u270B': 'hand',
        '\uD83C\uDFA3': 'rod',
        '\uD83E\uDE93': 'axe',
        '\u26CF\uFE0F': 'pickaxe', '\u26CF': 'pickaxe',
        '\uD83C\uDFB8': 'guitar',
        '\uD83E\uDD4A': 'glove',
        '\uD83C\uDFA4': 'mic',
        '\uD83D\uDD07': 'micOff',
        '\uD83D\uDCAC': 'chat',
        '\uD83D\uDEAB': 'chatOff',
        '\uD83D\uDDD1\uFE0F': 'trash', '\uD83D\uDDD1': 'trash',
        '\u26F6': 'fullscreen',
        '\uD83D\uDC31': 'cat',
        '\uD83D\uDCB0': 'money',
        '\uD83D\uDCCA': 'chart',
        '\uD83D\uDCC8': 'chartUp',
        '\uD83C\uDFAE': 'controller',
        '\u2692\uFE0F': 'hammer', '\u2692': 'hammer',
        '\uD83C\uDF0D': 'globe',
        '\uD83C\uDF38': 'flower',
        '\uD83D\uDD12': 'lock',
        '\uD83D\uDD13': 'unlock',
        '\u2B50': 'star',
        '\u26A0\uFE0F': 'warn', '\u26A0': 'warn',
        '\u21BB': 'refresh', '\u27F3': 'refresh',
        '\uD83D\uDCBE': 'save',
        '\uD83D\uDCC2': 'folder',
        '\uD83C\uDFF7\uFE0F': 'tag', '\uD83C\uDFF7': 'tag',
        '\uD83D\uDC1B': 'bug',
        '\uD83C\uDFB5': 'music',
        '\uD83D\uDD34': 'dot',
        '\uD83D\uDDB1\uFE0F': 'mouse', '\uD83D\uDDB1': 'mouse',
        '\uD83D\uDCF7': 'camera',
        '\uD83C\uDFC6': 'trophy',
        '\u2600\uFE0F': 'sun', '\u2600': 'sun',
        '\uD83C\uDF19': 'moon',
        '\uD83C\uDF0A': 'wave',
        '\uD83D\uDCA7': 'droplet',
        '\uD83C\uDF32': 'tree',
        '\uD83E\uDEA8': 'rock'
    };

    function icon(name, size, extraStyle) {
        const rects = R[name];
        if (!rects) return '';
        const dim = size ? size + 'px' : '1em';
        const body = rects.map(b => '<rect x="' + b[0] + '" y="' + b[1] + '" width="' + b[2] + '" height="' + b[3] + '"/>').join('');
        return '<svg class="pxi" width="' + dim + '" height="' + dim + '" viewBox="0 0 16 16" fill="currentColor" ' +
            'shape-rendering="crispEdges" aria-hidden="true" style="display:inline-block;vertical-align:-0.14em;' + (extraStyle || '') + '">' + body + '</svg>';
    }

    const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, TITLE: 1, SVG: 1 };

    function swapNode(node) {
        if (!node || !node.parentNode) return;
        const name = EMOJI[node.nodeValue.trim()];
        if (!name) return;
        const span = document.createElement('span');
        span.className = 'pxi-wrap';
        span.innerHTML = icon(name);
        node.parentNode.replaceChild(span, node);
    }

    function hydrate(root) {
        root = root || document.body;
        if (!root) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                const p = n.parentNode;
                if (!p || SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
                if (p.classList && p.classList.contains('no-pxi')) return NodeFilter.FILTER_REJECT;
                return EMOJI[n.nodeValue.trim()] ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        const found = [];
        while (walker.nextNode()) found.push(walker.currentNode);
        found.forEach(swapNode);
        hydratePx(root);
    }

    // Explicit placeholders: <i data-px="axe"></i> or <i data-px="axe:18"></i>
    function hydratePx(root) {
        let els;
        if (root.querySelectorAll) els = root.querySelectorAll('[data-px]');
        else if (root.nodeType === 1 && root.hasAttribute && root.hasAttribute('data-px')) els = [root];
        else els = [];
        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            if (el.dataset.pxDone === '1') continue;
            const parts = String(el.getAttribute('data-px')).split(':');
            const name = parts[0];
            const size = parts[1] ? parseInt(parts[1], 10) : null;
            el.innerHTML = icon(name, size);
            el.dataset.pxDone = '1';
        }
    }

    // Watch for dynamically rendered UI (shop, journal, props, toasts, chat...).
    function observe() {
        const target = document.body;
        if (!target || !window.MutationObserver) return;
        const obs = new MutationObserver(function (muts) {
            for (let i = 0; i < muts.length; i++) {
                const added = muts[i].addedNodes;
                for (let j = 0; j < added.length; j++) {
                    const n = added[j];
                    if (n.nodeType === 1) hydrate(n);
                    else if (n.nodeType === 3) swapNode(n);
                }
            }
        });
        obs.observe(target, { childList: true, subtree: true });
    }

    window.PX = { icon: icon, hydrate: hydrate, has: function (n) { return !!R[n]; } };

    function boot() { hydrate(); observe(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
