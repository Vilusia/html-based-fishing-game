// --- SCRATCH CARDS ---
// Lucky Lou's booth. Buy a card, physically scratch the silver foil off with
// the mouse (or a finger) until the nine numbers underneath are exposed, and
// match three of the same number to win the prize printed on the card.
//
// The foil is a canvas painted over the number grid. Scratching erases it with
// destination-out, and the reveal check samples the canvas alpha to decide when
// a square has truly been scratched rather than just clicked once.

const ScratchGame = {
    tierIndex: -1,
    cells: [],
    prize: 0,
    done: false,
    foundTriple: false,
    revealed: new Array(9).fill(false),
    scratching: false,
    lastPt: null,
    lastSound: 0,
    lastCheck: 0
};

function scratchEl(id) { return document.getElementById(id); }

function scratchTierOf(index) {
    return (index >= 0 && index < SCRATCH_TIERS.length) ? SCRATCH_TIERS[index] : null;
}

function scratchStats() {
    if (!saveState.scratchStats || typeof saveState.scratchStats !== 'object') {
        saveState.scratchStats = { played: 0, won: 0, biggest: 0 };
    }
    const st = saveState.scratchStats;
    st.played = Number(st.played) || 0;
    st.won = Number(st.won) || 0;
    st.biggest = Number(st.biggest) || 0;
    return st;
}

// Fisher-Yates, in place.
function scratchShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
}

function scratchHasTriple(cells) {
    const counts = {};
    for (const n of cells) {
        counts[n] = (counts[n] || 0) + 1;
        if (counts[n] >= 3) return true;
    }
    return false;
}

// Build a card. Winning cards get three matching numbers and a prize; losing
// cards are dealt from a bag holding at most two of each number, so they can
// never accidentally contain a triple.
function makeScratchCard(tier) {
    const cells = new Array(9).fill(0);
    const isWinner = Math.random() < tier.winChance;
    const prize = tier.prizes[Math.floor(Math.random() * tier.prizes.length)];

    if (isWinner) {
        const matchNum = 1 + Math.floor(Math.random() * 9);
        const spots = scratchShuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 3);
        for (const s of spots) cells[s] = matchNum;
        const bag = [];
        for (let n = 1; n <= 9; n++) { if (n !== matchNum) bag.push(n, n); }
        scratchShuffle(bag);
        let bi = 0;
        for (let i = 0; i < 9; i++) if (cells[i] === 0) cells[i] = bag[bi++];
    } else {
        const bag = [];
        for (let n = 1; n <= 9; n++) bag.push(n, n);
        scratchShuffle(bag);
        for (let i = 0; i < 9; i++) cells[i] = bag[i];
    }

    return { cells, prize, isWinner };
}

function scratchBalanceText() {
    return `Balance: $${(Number(saveState.money) || 0).toLocaleString()}`
        + `   •   Played: ${scratchStats().played}`
        + `   •   Won: ${scratchStats().won}`
        + `   •   Biggest: $${scratchStats().biggest.toLocaleString()}`;
}

function updateScratchBalance() {
    const bal = scratchEl('scratch-balance');
    if (bal) bal.textContent = scratchBalanceText();
}

function renderScratchTiers() {
    const box = scratchEl('scratch-tiers');
    if (!box) return;
    const money = Number(saveState.money) || 0;
    box.innerHTML = '';

    SCRATCH_TIERS.forEach((tier, i) => {
        const entry = document.createElement('div');
        entry.className = 'grid-entry';
        entry.style.borderColor = tier.color;

        const name = document.createElement('div');
        name.style.fontWeight = 'bold';
        name.style.color = tier.color;
        name.textContent = tier.name;

        const info = document.createElement('div');
        info.style.fontSize = '15px';
        info.style.color = 'var(--p-text-dim)';
        info.style.margin = '5px 0';
        const top = Math.max.apply(null, tier.prizes);
        info.innerHTML = `Ticket: $${tier.cost.toLocaleString()}<br>Top prize: $${top.toLocaleString()}`;

        const odds = document.createElement('div');
        odds.style.fontSize = '13px';
        odds.style.color = 'var(--p-text-mute)';
        odds.textContent = `Win chance: ${Math.round(tier.winChance * 100)}%`;

        const btn = document.createElement('button');
        btn.textContent = `Buy ($${tier.cost.toLocaleString()})`;
        btn.style.marginTop = 'auto';
        btn.style.color = money >= tier.cost ? 'var(--p-good)' : 'var(--p-bad)';
        btn.onclick = () => buyScratchCard(i);

        entry.appendChild(name);
        entry.appendChild(info);
        entry.appendChild(odds);
        entry.appendChild(btn);
        box.appendChild(entry);
    });
}

function renderScratchShop() {
    updateScratchBalance();
    renderScratchTiers();

    const play = scratchEl('scratch-play');
    const tiers = scratchEl('scratch-tiers');
    if (ScratchGame.tierIndex >= 0 && play && tiers) {
        // Resume the card that is still on the table (the canvas keeps its
        // scratched state because the overlay is only hidden, not rebuilt).
        play.style.display = 'block';
        tiers.style.display = 'none';
    } else if (play && tiers) {
        play.style.display = 'none';
        tiers.style.display = 'grid';
    }
}

window.toggleScratchShop = function () {
    const ui = scratchEl('scratch-overlay');
    if (!ui) return;
    const opening = ui.style.display !== 'flex';
    ui.style.display = opening ? 'flex' : 'none';
    if (opening) {
        document.exitPointerLock();
        renderScratchShop();
    } else {
        // Dropping the pointer outside the canvas can swallow pointerup; make
        // sure the next open starts from a clean, non-scratching state.
        ScratchGame.scratching = false;
        ScratchGame.lastPt = null;
    }
};

function buyScratchCard(index) {
    const tier = scratchTierOf(index);
    if (!tier) return;
    if ((Number(saveState.money) || 0) < tier.cost) {
        showToast('Not enough money!', 'error');
        return;
    }
    saveState.money -= tier.cost;
    scratchStats().played += 1;
    saveGame();
    updateUI();
    try { Sound.sell(); } catch (e) { }
    startScratchCard(index, false);
}

// Paint the opaque foil layer. Anything not painted would read as "already
// scratched", so cover the whole canvas.
function paintScratchFoil() {
    const c = scratchEl('scratch-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);

    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#c9ccd4');
    g.addColorStop(0.35, '#aeb2bb');
    g.addColorStop(0.55, '#e8eaee');
    g.addColorStop(1, '#969ca6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Metallic speckle.
    for (let i = 0; i < 900; i++) {
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.08)';
        const x = Math.random() * w, y = Math.random() * h;
        const r = Math.random() * 2 + 0.4;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#2f333a';
    ctx.font = 'bold 38px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.05);
    ctx.fillText('SCRATCH HERE', 0, -10);
    ctx.font = 'bold 17px monospace';
    ctx.fillText('MATCH 3 NUMBERS TO WIN', 0, 26);
    ctx.restore();
}

function startScratchCard(index, resuming) {
    const tier = scratchTierOf(index);
    if (!tier) return;

    if (!resuming) {
        const card = makeScratchCard(tier);
        ScratchGame.tierIndex = index;
        ScratchGame.cells = card.cells;
        ScratchGame.prize = card.prize;
        ScratchGame.done = false;
        ScratchGame.foundTriple = false;
        ScratchGame.revealed = new Array(9).fill(false);
        ScratchGame.scratching = false;
        ScratchGame.lastPt = null;

        const grid = scratchEl('scratch-grid');
        const canvas = scratchEl('scratch-canvas');
        grid.querySelectorAll('.scratch-num').forEach(n => n.remove());
        card.cells.forEach((num) => {
            const cell = document.createElement('div');
            cell.className = 'scratch-num';
            cell.textContent = num;
            grid.insertBefore(cell, canvas);
        });

        paintScratchFoil();
    }

    scratchEl('scratch-prize').textContent = `WIN $${ScratchGame.prize.toLocaleString()}`;
    const result = scratchEl('scratch-result');
    result.textContent = '';
    result.style.color = 'var(--p-gold)';
    scratchEl('scratch-hint').textContent = ScratchGame.done
        ? 'This card is finished. Buy another or change tier.'
        : 'Scratch every square, or use SCRATCH ALL.';
    scratchEl('scratch-reveal').style.display = ScratchGame.done ? 'none' : 'inline-block';
    scratchEl('scratch-again').style.display = ScratchGame.done ? 'inline-block' : 'none';
    scratchEl('scratch-play').style.display = 'block';
    scratchEl('scratch-tiers').style.display = 'none';

    updateScratchBalance();
    renderScratchTiers();
}

function scratchPoint(evt) {
    const c = scratchEl('scratch-canvas');
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
        x: (evt.clientX - r.left) * (c.width / r.width),
        y: (evt.clientY - r.top) * (c.height / r.height)
    };
}

function scratchStroke(evt) {
    if (ScratchGame.tierIndex < 0 || ScratchGame.done) return;
    const c = scratchEl('scratch-canvas');
    const p = scratchPoint(evt);
    if (!p) return;
    const ctx = c.getContext('2d');
    const prev = ScratchGame.lastPt || p;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 56;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 28, 0, Math.PI * 2);
    ctx.fill();

    ScratchGame.lastPt = p;

    const now = performance.now();
    if (now - ScratchGame.lastSound > 90) {
        ScratchGame.lastSound = now;
        try { Sound.playSpatial('scratch', null, Math.floor(Math.random() * 3)); } catch (e) { }
    }
    if (now - ScratchGame.lastCheck > 120) {
        ScratchGame.lastCheck = now;
        scratchCheck();
    }
}

// Sample the foil canvas: a square counts as revealed once most of its centre
// is transparent. Sampling (rather than counting clicks) means the player must
// actually scrub the mouse across the card.
function scratchCheck() {
    if (ScratchGame.tierIndex < 0 || ScratchGame.done) return;
    const c = scratchEl('scratch-canvas');
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    const cw = w / 3, ch = h / 3;
    let changed = false;

    for (let i = 0; i < 9; i++) {
        if (ScratchGame.revealed[i]) continue;
        const col = i % 3, row = Math.floor(i / 3);
        const x0 = Math.floor(col * cw + cw * 0.18);
        const x1 = Math.ceil(col * cw + cw * 0.82);
        const y0 = Math.floor(row * ch + ch * 0.18);
        const y1 = Math.ceil(row * ch + ch * 0.82);
        let total = 0, clear = 0;
        for (let y = y0; y < y1; y += 2) {
            const base = y * w;
            for (let x = x0; x < x1; x += 2) {
                total++;
                if (data[(base + x) * 4 + 3] < 40) clear++;
            }
        }
        if (total > 0 && clear / total > 0.42) {
            ScratchGame.revealed[i] = true;
            changed = true;
        }
    }

    if (changed) scratchUpdateProgress();
}

function scratchClearFoil() {
    const c = scratchEl('scratch-canvas');
    if (!c) return;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < 9; i++) ScratchGame.revealed[i] = true;
}

function scratchUpdateProgress() {
    const cells = ScratchGame.cells;
    const counts = {};
    let revealed = 0;
    for (let i = 0; i < 9; i++) {
        if (!ScratchGame.revealed[i]) continue;
        revealed++;
        const n = cells[i];
        counts[n] = (counts[n] || 0) + 1;
    }

    // Highlight any number that has three copies showing.
    if (!ScratchGame.done) {
        const hint = scratchEl('scratch-hint');
        if (hint) hint.textContent = `Scratched ${revealed} / 9 squares. Match 3 numbers to win.`;
    }
    const numEls = scratchEl('scratch-grid').querySelectorAll('.scratch-num');
    let triple = false;
    for (const key in counts) {
        if (counts[key] >= 3) {
            triple = true;
            for (let i = 0; i < 9; i++) {
                if (ScratchGame.revealed[i] && cells[i] === Number(key) && numEls[i]) {
                    numEls[i].classList.add('matched');
                }
            }
        }
    }

    if (triple) {
        // Finish immediately and show the player the winning line.
        ScratchGame.foundTriple = true;
        scratchClearFoil();
        scratchFinish();
    } else if (revealed >= 9) {
        scratchFinish();
    }
}

function scratchFinish() {
    if (ScratchGame.tierIndex < 0 || ScratchGame.done) return;
    ScratchGame.done = true;
    ScratchGame.scratching = false;

    const won = scratchHasTriple(ScratchGame.cells);
    const st = scratchStats();
    const result = scratchEl('scratch-result');

    if (won) {
        saveState.money = (Number(saveState.money) || 0) + ScratchGame.prize;
        st.won += 1;
        st.biggest = Math.max(st.biggest, ScratchGame.prize);
        result.textContent = `WINNER! +$${ScratchGame.prize.toLocaleString()}`;
        result.style.color = 'var(--p-good)';
        try { Sound.achievement(); } catch (e) { }
        showToast(`Scratch card win: +$${ScratchGame.prize.toLocaleString()}`, 'achievement');
    } else {
        result.textContent = 'NO MATCH — better luck next card!';
        result.style.color = 'var(--p-bad)';
        showToast('No match. Better luck next card!');
    }

    scratchEl('scratch-hint').textContent = 'This card is finished. Buy another or change tier.';
    scratchEl('scratch-reveal').style.display = 'none';
    scratchEl('scratch-again').style.display = 'inline-block';

    updateScratchBalance();
    renderScratchTiers();
    updateUI();
    saveGame();
}

window.scratchRevealAll = function () {
    if (ScratchGame.tierIndex < 0 || ScratchGame.done) return;
    scratchClearFoil();
    scratchUpdateProgress();
};

window.scratchBuyAgain = function () {
    const idx = ScratchGame.tierIndex;
    if (idx < 0) return;
    buyScratchCard(idx);
};

window.scratchShowTiers = function () {
    if (ScratchGame.tierIndex >= 0 && !ScratchGame.done) {
        if (!confirm('Discard this unscratched card? The ticket price is not refunded.')) return;
    }
    ScratchGame.tierIndex = -1;
    scratchEl('scratch-play').style.display = 'none';
    scratchEl('scratch-tiers').style.display = 'grid';
    renderScratchTiers();
    updateScratchBalance();
};

// --- Pointer plumbing (mouse + touch via Pointer Events) ---
(function setupScratchInput() {
    const c = document.getElementById('scratch-canvas');
    if (!c) return;

    c.addEventListener('pointerdown', (e) => {
        if (ScratchGame.tierIndex < 0 || ScratchGame.done) return;
        e.preventDefault();
        try { c.setPointerCapture(e.pointerId); } catch (err) { }
        ScratchGame.scratching = true;
        ScratchGame.lastPt = null;
        scratchStroke(e);
    });

    c.addEventListener('pointermove', (e) => {
        if (!ScratchGame.scratching) return;
        e.preventDefault();
        scratchStroke(e);
    });

    const endStroke = (e) => {
        if (!ScratchGame.scratching) return;
        ScratchGame.scratching = false;
        ScratchGame.lastPt = null;
        try { c.releasePointerCapture(e.pointerId); } catch (err) { }
        scratchCheck();
    };
    c.addEventListener('pointerup', endStroke);
    c.addEventListener('pointercancel', endStroke);
    c.addEventListener('pointerleave', (e) => {
        // Keep scratching if the pointer is captured; otherwise stop.
        if (ScratchGame.scratching && !c.hasPointerCapture(e.pointerId)) {
            ScratchGame.scratching = false;
            ScratchGame.lastPt = null;
            scratchCheck();
        }
    });
})();
