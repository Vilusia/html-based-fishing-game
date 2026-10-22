// --- SCRATCH CARDS ---
// Lucky Lou's booth. A card prints five winning numbers across the top and a
// 5x5 grid of "your numbers", each with its own prize underneath. Physically
// scratch the silver foil off with the mouse (or a finger); every one of your
// numbers that matches a winning number pays the prize printed under it, and a
// single card can hold several matches. The result is only revealed once all
// 25 squares have been scratched.
//
// The foil is a canvas painted over the 25-cell grid. Scratching erases it with
// destination-out, and the reveal check samples the canvas alpha to decide when
// a cell has truly been scratched rather than just clicked once.

const SCRATCH_COLS = 5;
const SCRATCH_ROWS = 5;
const SCRATCH_CELLS = SCRATCH_COLS * SCRATCH_ROWS;

const ScratchGame = {
    tierIndex: -1,
    cells: [],       // the 25 numbers under the foil
    prizes: [],      // prize printed under each of the 25 numbers
    winning: [],     // five winning numbers shown across the top
    done: false,
    revealed: new Array(SCRATCH_CELLS).fill(false),
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

// Split a total prize into `parts` positive whole-dollar amounts. Used so a
// card with two or three matching numbers still pays the same total the card
// was drawn for, just spread across the matches.
function scratchSplitPrize(total, parts) {
    if (parts <= 1 || total < parts) return [total];
    const cuts = [];
    while (cuts.length < parts - 1) {
        const p = 1 + Math.floor(Math.random() * (total - 1));
        if (cuts.indexOf(p) === -1) cuts.push(p);
    }
    cuts.sort((a, b) => a - b);
    const out = [];
    let prev = 0;
    for (const p of cuts) { out.push(p - prev); prev = p; }
    out.push(total - prev);
    return out;
}

// Build a card. A winning card has one to three of "your numbers" matching
// winning numbers, and those matches pay the card's prize split between them.
// Losing cards never contain a winning number. Numbers are drawn from 1-99 so
// the grid reads like a real scratch-off rather than a tic-tac-toe board.
function makeScratchCard(tier) {
    const isWinner = Math.random() < tier.winChance;
    const prize = tier.prizes[Math.floor(Math.random() * tier.prizes.length)];

    const bag = [];
    for (let n = 1; n <= 99; n++) bag.push(n);
    scratchShuffle(bag);
    const winning = bag.slice(0, SCRATCH_COLS);
    const available = bag.slice(SCRATCH_COLS);

    const spotPool = (tier.spots && tier.spots.length) ? tier.spots : tier.prizes;
    const pickSpot = () => spotPool[Math.floor(Math.random() * spotPool.length)];

    let nums, spots;
    if (isWinner) {
        // Most winners have a single match, but two or three are possible.
        const roll = Math.random();
        const wanted = roll < 0.6 ? 1 : (roll < 0.9 ? 2 : 3);
        const shares = scratchSplitPrize(prize, wanted);
        const matchCount = shares.length;
        const matchNums = scratchShuffle(winning.slice()).slice(0, matchCount);

        nums = available.slice(0, SCRATCH_CELLS - matchCount);
        spots = nums.map(pickSpot);
        // Insert the matching numbers with their share of the prize at random
        // positions, then shuffle everything together below.
        for (let m = 0; m < matchCount; m++) {
            const at = Math.floor(Math.random() * (nums.length + 1));
            nums.splice(at, 0, matchNums[m]);
            spots.splice(at, 0, shares[m]);
        }
    } else {
        nums = available.slice(0, SCRATCH_CELLS);
        spots = nums.map(pickSpot);
    }

    // Shuffle number/prize pairs together so matching cells can land anywhere.
    const order = scratchShuffle([...Array(SCRATCH_CELLS).keys()]);
    return {
        cells: order.map(i => nums[i]),
        prizes: order.map(i => spots[i]),
        winning,
        isWinner,
        matchCount: isWinner ? scratchHitTest(order.map(i => nums[i]), winning) : 0
    };
}

// Count how many of the given numbers match the winning set.
function scratchHitTest(cells, winning) {
    let n = 0;
    for (const c of cells) if (winning.indexOf(c) !== -1) n++;
    return n;
}

// Indices of the player's numbers that match a winning number.
function scratchHitCells() {
    const hits = [];
    for (let i = 0; i < SCRATCH_CELLS; i++) {
        if (ScratchGame.winning.indexOf(ScratchGame.cells[i]) !== -1) hits.push(i);
    }
    return hits;
}

// Highlight matching cells and the winning-number chip they matched.
function scratchHighlightHits() {
    const hits = scratchHitCells();
    const gridEls = scratchEl('scratch-grid').querySelectorAll('.scratch-cell');
    const winEls = scratchEl('scratch-winning-nums').querySelectorAll('.win-chip');
    const hitNums = new Set(hits.map(i => ScratchGame.cells[i]));

    hits.forEach(i => { if (gridEls[i]) gridEls[i].classList.add('hit'); });
    winEls.forEach(chip => {
        if (hitNums.has(Number(chip.dataset.num))) chip.classList.add('hit');
    });
    return hits;
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
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.05);
    ctx.fillText('SCRATCH HERE', 0, -10);
    ctx.font = 'bold 15px monospace';
    ctx.fillText('MATCH A WINNING NUMBER', 0, 26);
    ctx.restore();
}

function startScratchCard(index, resuming) {
    const tier = scratchTierOf(index);
    if (!tier) return;

    if (!resuming) {
        const card = makeScratchCard(tier);
        ScratchGame.tierIndex = index;
        ScratchGame.cells = card.cells;
        ScratchGame.prizes = card.prizes;
        ScratchGame.winning = card.winning;
        ScratchGame.done = false;
        ScratchGame.revealed = new Array(SCRATCH_CELLS).fill(false);
        ScratchGame.scratching = false;
        ScratchGame.lastPt = null;

        const winBox = scratchEl('scratch-winning-nums');
        winBox.innerHTML = '';
        card.winning.forEach((num) => {
            const chip = document.createElement('div');
            chip.className = 'win-chip';
            chip.dataset.num = String(num);
            chip.textContent = num;
            winBox.appendChild(chip);
        });

        const grid = scratchEl('scratch-grid');
        const canvas = scratchEl('scratch-canvas');
        grid.querySelectorAll('.scratch-cell').forEach(n => n.remove());
        card.cells.forEach((num, i) => {
            const cell = document.createElement('div');
            cell.className = 'scratch-cell';
            cell.dataset.num = String(num);

            const nEl = document.createElement('span');
            nEl.className = 'n';
            nEl.textContent = num;

            const pEl = document.createElement('span');
            pEl.className = 'p';
            pEl.textContent = '$' + card.prizes[i].toLocaleString();

            cell.appendChild(nEl);
            cell.appendChild(pEl);
            grid.insertBefore(cell, canvas);
        });

        paintScratchFoil();
    }

    const topPrize = Math.max.apply(null, tier.prizes);
    scratchEl('scratch-prize').textContent = `WIN UP TO $${topPrize.toLocaleString()}`;
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
    ctx.lineWidth = 52;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
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
    const cw = w / SCRATCH_COLS, ch = h / SCRATCH_ROWS;
    let changed = false;

    for (let i = 0; i < SCRATCH_CELLS; i++) {
        if (ScratchGame.revealed[i]) continue;
        const col = i % SCRATCH_COLS, row = Math.floor(i / SCRATCH_COLS);
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
    ScratchGame.revealed = new Array(SCRATCH_CELLS).fill(true);
}

function scratchUpdateProgress() {
    let revealed = 0;
    for (let i = 0; i < SCRATCH_CELLS; i++) {
        if (ScratchGame.revealed[i]) revealed++;
    }

    if (!ScratchGame.done) {
        const hint = scratchEl('scratch-hint');
        if (hint) hint.textContent = revealed >= SCRATCH_CELLS
            ? 'All squares scratched — revealing your result...'
            : `Scratched ${revealed} / ${SCRATCH_CELLS} squares. Keep scratching to reveal your result.`;
    }

    // The win is only declared once the whole card is clear, like a real
    // scratch-off: no early payout and no highlights before the final reveal.
    if (revealed >= SCRATCH_CELLS) scratchFinish();
}

function scratchFinish() {
    if (ScratchGame.tierIndex < 0 || ScratchGame.done) return;
    ScratchGame.done = true;
    ScratchGame.scratching = false;
    // Clear any leftover foil so the finished card is fully readable.
    scratchClearFoil();

    const hits = scratchHighlightHits();
    const payout = hits.reduce((sum, i) => sum + ScratchGame.prizes[i], 0);
    const st = scratchStats();
    const result = scratchEl('scratch-result');

    if (payout > 0) {
        saveState.money = (Number(saveState.money) || 0) + payout;
        st.won += 1;
        st.biggest = Math.max(st.biggest, payout);
        const many = hits.length > 1 ? ` (${hits.length} matches)` : '';
        result.textContent = `WINNER! +$${payout.toLocaleString()}${many}`;
        result.style.color = 'var(--p-good)';
        try { Sound.achievement(); } catch (e) { }
        showToast(`Scratch card win: +$${payout.toLocaleString()}${many}`, 'achievement');
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
