// --- AUDIO (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const masterGain = audioCtx.createGain();
masterGain.connect(audioCtx.destination);
const sfxGain = audioCtx.createGain();
sfxGain.connect(masterGain);

const midiGain = audioCtx.createGain();
midiGain.connect(masterGain);
let localStream = null;
let voiceConnections = {};
let voiceAnalysers = {};
let isMicMuted = true;

// --- ANTI-SPAM / RATE LIMITING ---
// Tracks the last timestamp of actions per Peer ID
const rateLimits = {};
const SPAM_THRESHOLDS = {
    chat: 500,      // 500ms between chat messages
    sound: 200,     // 200ms between sounds (meows)

    anim: 300,      // 300ms between punches
    general: 50     // 50ms min between ANY packet (prevents DOS)
};

// --- PROCEDURAL SOUND ENGINE ---
const Sound = {
    playSpatial: (soundName, pos, variant = 0) => {
        if (audioCtx.state === 'suspended') audioCtx.resume();

        let nodes = null;
        const now = audioCtx.currentTime;


        let targetGain = sfxGain;
        if (soundName === 'guitar') targetGain = midiGain;


        if (soundName === 'guitar') {
            if (saveState.midiMuted) return;

            let freq = parseFloat(variant);
            if (!isFinite(freq) || freq <= 0 || freq > 200000) freq = 440;

            const osc = audioCtx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now);

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(3000, now);
            filter.frequency.exponentialRampToValueAtTime(100, now + 0.3);

            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

            osc.connect(filter);
            filter.connect(gain);

            osc.start(now);
            osc.stop(now + 1.5);


            nodes = { output: gain };
        }

        else if (soundName === 'punch') {
            const osc = audioCtx.createOscillator(); osc.type = 'square';
            const gain = audioCtx.createGain();
            osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
            gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.connect(gain); osc.start(now); osc.stop(now + 0.1); nodes = { output: gain };
        }

        else if (soundName === 'footstep') {
            const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.1, audioCtx.sampleRate);
            const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            const noise = audioCtx.createBufferSource(); noise.buffer = buffer;
            const gain = audioCtx.createGain(); gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            noise.connect(gain); noise.start(); nodes = { output: gain };
        }

        else if (['jump', 'cast', 'splash', 'meow', 'chat', 'reel'].includes(soundName)) {
            if (soundName === 'jump') {
                const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
                osc.frequency.setValueAtTime(200, now); osc.frequency.linearRampToValueAtTime(600, now + 0.2);
                gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.2);
                osc.connect(gain); osc.start(); osc.stop(now + 0.2); nodes = { output: gain };
            }
            else if (soundName === 'cast') {
                const osc = audioCtx.createOscillator(); osc.type = 'sine'; const gain = audioCtx.createGain();
                osc.frequency.setValueAtTime(200, now); osc.frequency.linearRampToValueAtTime(600, now + 0.3);
                gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.connect(gain); osc.start(); osc.stop(now + 0.3); nodes = { output: gain };
            }
            else if (soundName === 'splash') {
                const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate);
                const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
                const noise = audioCtx.createBufferSource(); noise.buffer = buffer;
                const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 400;
                const gain = audioCtx.createGain(); gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                noise.connect(filter); filter.connect(gain); noise.start(); nodes = { output: gain };
            }
            else if (soundName === 'meow') {
                const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.type = 'sawtooth'; osc.connect(gain); osc.start(now);
                if (variant === 0) { osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(600, now + 0.1); osc.frequency.exponentialRampToValueAtTime(300, now + 0.4); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0.1, now + 0.3); gain.gain.linearRampToValueAtTime(0, now + 0.5); osc.stop(now + 0.5); }
                else if (variant === 1) { osc.frequency.setValueAtTime(350, now); osc.frequency.linearRampToValueAtTime(550, now + 0.3); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.35); osc.stop(now + 0.35); }
                else { osc.type = 'triangle'; osc.frequency.setValueAtTime(300, now); osc.frequency.linearRampToValueAtTime(320, now + 0.05); osc.frequency.linearRampToValueAtTime(300, now + 0.1); osc.frequency.linearRampToValueAtTime(320, now + 0.15); osc.frequency.linearRampToValueAtTime(300, now + 0.2); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.3); osc.stop(now + 0.3); }
                nodes = { output: gain };
            }
            else if (soundName === 'chat') {
                const osc = audioCtx.createOscillator(); osc.type = 'sine'; const gain = audioCtx.createGain();
                osc.frequency.setValueAtTime(600, now); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.connect(gain); osc.start(); osc.stop(now + 0.1); nodes = { output: gain };
            }
            else if (soundName === 'reel') {
                const osc = audioCtx.createOscillator(); osc.type = 'square'; const gain = audioCtx.createGain();
                osc.frequency.setValueAtTime(800, now); gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                osc.connect(gain); osc.start(); osc.stop(now + 0.05); nodes = { output: gain };
            }
        }

        else if (soundName === 'catch') {
            [440, 554, 659, 880].forEach((f, i) => {
                const osc = audioCtx.createOscillator(); osc.type = 'triangle'; const gain = audioCtx.createGain();
                osc.frequency.setValueAtTime(f, now + i * 0.1); gain.gain.setValueAtTime(0.1, now + i * 0.1); gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
                osc.connect(gain);
                gain.connect(targetGain);
                osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.3);
            });
            return;
        }


        if (nodes && pos) {
            const panner = audioCtx.createPanner();
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'linear';
            panner.refDistance = 1;
            panner.maxDistance = MAX_VOICE_DISTANCE;
            panner.rolloffFactor = 1;

            panner.positionX.value = pos.x;
            panner.positionY.value = pos.y;
            panner.positionZ.value = pos.z;

            nodes.output.connect(panner);
            panner.connect(targetGain);
        } else if (nodes) {
            nodes.output.connect(targetGain);
        }
    },
    sell: () => {

        const now = audioCtx.currentTime;
        const o1 = audioCtx.createOscillator(); const g1 = audioCtx.createGain();
        o1.frequency.setValueAtTime(1000, now); g1.gain.setValueAtTime(0.1, now); g1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        o1.connect(g1); g1.connect(sfxGain); o1.start(); o1.stop(now + 0.1);

        const o2 = audioCtx.createOscillator(); const g2 = audioCtx.createGain();
        o2.frequency.setValueAtTime(1500, now + 0.1); g2.gain.setValueAtTime(0.1, now + 0.1); g2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        o2.connect(g2); g2.connect(sfxGain); o2.start(now + 0.1); o2.stop(now + 0.3);
    }
};

// --- DYNAMIC MUSIC SYSTEM ---
const Music = {
    isPlaying: false,
    nextNoteTimer: null,
    droneNode: null,
    droneGain: null,


    scale: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00],

    init: () => {
        if (saveState.musicMuted) return;
        Music.isPlaying = true;
        Music.startDrone();
        Music.scheduleNextNote();
    },

    stop: () => {
        Music.isPlaying = false;
        clearTimeout(Music.nextNoteTimer);
        if (Music.droneNode) {

            const now = audioCtx.currentTime;
            Music.droneGain.gain.cancelScheduledValues(now);
            Music.droneGain.gain.exponentialRampToValueAtTime(0.001, now + 2);
            Music.droneNode.stop(now + 2);
            Music.droneNode = null;
        }
    },

    startDrone: () => {

        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;

        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 130.81;

        const gain = audioCtx.createGain();
        gain.gain.value = 0;

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start();
        gain.gain.linearRampToValueAtTime(0.05, now + 5);

        Music.droneNode = osc;
        Music.droneGain = gain;
    },

    playRandomNote: () => {
        if (!Music.isPlaying) return;
        const now = audioCtx.currentTime;


        const freq = Music.scale[Math.floor(Math.random() * Music.scale.length)];
        const duration = 2 + Math.random() * 2;

        const osc = audioCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;

        const gain = audioCtx.createGain();
        gain.gain.value = 0;


        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);


        osc.start();
        gain.gain.linearRampToValueAtTime(0.03, now + 1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.stop(now + duration);
    },

    scheduleNextNote: () => {
        if (!Music.isPlaying) return;
        Music.playRandomNote();

        const delay = 2000 + Math.random() * 4000;
        Music.nextNoteTimer = setTimeout(Music.scheduleNextNote, delay);
    }
};

// --- PROCEDURAL RAIN AUDIO ENGINE ---
const RainAudio = {
    source: null,
    gainNode: null,
    filterNode: null,
    isPlaying: false,

    init: () => {
        if (!audioCtx) return;

        // 1. Create Pink Noise Buffer (Sounds like water/rain)
        const bufferSize = 2 * audioCtx.sampleRate;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = buffer.getChannelData(0);
        let b0, b1, b2, b3, b4, b5, b6;
        b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            output[i] *= 0.11; // Lower base volume
            b6 = white * 0.115926;
        }

        RainAudio.buffer = buffer;
    },

    toggle: (shouldPlay) => {
        if (!audioCtx || audioCtx.state === 'suspended') return;

        const now = audioCtx.currentTime;

        if (shouldPlay) {
            if (!RainAudio.isPlaying) {
                // Setup Graph: Source -> Filter -> Gain -> Master
                RainAudio.source = audioCtx.createBufferSource();
                RainAudio.source.buffer = RainAudio.buffer;
                RainAudio.source.loop = true;

                // Lowpass Filter: Makes it sound "muffled" and soft, not harsh static
                RainAudio.filterNode = audioCtx.createBiquadFilter();
                RainAudio.filterNode.type = 'lowpass';
                RainAudio.filterNode.frequency.value = 800; // 800Hz is a nice soft rain sound

                RainAudio.gainNode = audioCtx.createGain();
                RainAudio.gainNode.gain.setValueAtTime(0, now);

                RainAudio.source.connect(RainAudio.filterNode);
                RainAudio.filterNode.connect(RainAudio.gainNode);
                RainAudio.gainNode.connect(sfxGain); // Use SFX slider for volume

                RainAudio.source.start(0);
                RainAudio.isPlaying = true;
            }

            // Fade In
            RainAudio.gainNode.gain.setTargetAtTime(0.3, now, 2); // Target volume 0.3, takes ~2s
        } else {
            if (RainAudio.isPlaying && RainAudio.gainNode) {
                // Fade Out
                RainAudio.gainNode.gain.setTargetAtTime(0, now, 0.5);

                // Fully stop after fade
                setTimeout(() => {
                    if (!isRaining && RainAudio.source) {
                        RainAudio.source.stop();
                        RainAudio.source = null;
                        RainAudio.isPlaying = false;
                    }
                }, 2000);
            }
        }
    }
};

// Initialize buffer immediately
try { RainAudio.init(); } catch (e) { }


function broadcastSound(name, variant = 0) {
    // RATE LIMIT
    if (Date.now() - lastSoundTime < SOUND_COOLDOWN) return;
    lastSoundTime = Date.now();

    if (!player) return;
    Sound.playSpatial(name, player.position, variant);

    const msg = {
        type: 'sound',
        name,
        pos: { x: player.position.x, y: player.position.y, z: player.position.z },
        var: variant
    };

    // Dedicated server takes priority so sounds actually reach it
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify(msg));
    } else if (isHost) {
        // P2P host
        broadcastToClients(msg);
    } else if (hostConn && hostConn.open) {
        // P2P client talking to host
        hostConn.send(msg);
    }
}


// --- IMPORT / EXPORT FUNCTIONS ---

function exportSaveFile() {
    // 1. Force a save to local storage first to ensure data is fresh
    saveGame();

    // 2. Convert saveState to JSON string
    const data = JSON.stringify(saveState, null, 2); // Pretty print
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // 3. Create temporary link to trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = `FisherSave_${saveState.displayName}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();

    // 4. Cleanup
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast("Save file exported!");
}

function importSaveFile(input) {
    if (input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const json = JSON.parse(e.target.result);

            // Basic validation to prevent crashing
            if (json.money === undefined || !Array.isArray(json.inventory)) {
                showToast("Error: Invalid save file format.");
                return;
            }

            // Apply the loaded data
            saveState = json;

            // Save to local storage immediately
            saveGame();

            showToast("Save imported! Reloading...");

            // Reload page to ensure all visuals/logic update correctly
            setTimeout(() => location.reload(), 1000);

        } catch (err) {
            console.error(err);
            showToast("Error reading save file.");
        }
    };

    reader.readAsText(file);

    // Reset input so you can select the same file again if needed
    input.value = '';
}

function mulberry32(a) { return function () { var t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }
function xmur3(str) { for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 3432918353), h = h << 13 | h >>> 19; return function () { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; } }


// --- KEYBIND DEFINITIONS ---
const DEFAULT_KEYBINDS = {
    forward: 'KeyW',
    backward: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    jump: 'Space',
    interact: 'KeyE',
    voice: 'KeyV',
    guitar: 'KeyG',
    glove: 'KeyB',
    meow: 'KeyZ',
    showFish: 'KeyF',
    chat: 'Enter',
    menu: 'Escape'
};

// --- SAVE DATA STRUCTURE & HANDLING ---
let saveState = {
    money: 0,
    inventory: [],
    displayName: "Fisher",
    journal: {},
    unlockedHats: ['none'],
    currentHat: 'none',
    catColor: '#ff6347',
    bellyColor: '#ffffff',
    eyeColor: '#000000',
    baitInventory: {},
    micId: 'default',
    musicMuted: false,
    hasGlove: false,
    species: 'cat',
    masterVolume: 0.5,
    sfxVolume: 1.0,
    midiVolume: 1.0,
    voiceVolume: 1.0,
    autoReelLevel: 0,
    clickPowerLevel: 0, // New Upgrade
    hasGuitar: false,
    midiMuted: false,
    unlockedRods: ['bamboo'], // Add this
    currentRod: 'bamboo',     // Add this
    unlockedHats: ['none'],
    currentHat: 'none', // Duplicated, but harmless.
    unlockedShirts: ['none'],
    currentShirt: 'none',
    unlockedCollars: ['none'],
    currentCollar: 'none',
    unlockedTitles: ['none', 'novice', 'gay', 'lesbian', 'bi', 'trans', 'pan', 'ace', 'aro', 'enby', 'queer', 'fluid', 'agender', 'demi', 'inter', 'mlm', 'wlw', 'bear', 'otter', 'butch', 'femme', 'ally'],
    currentTitle: 'none',
    showTitles: true,
    savedOutfits: [],
    lavaUnlocked: false,
    unlockedPatterns: ['none'],
    currentPattern: 'none',
    keybinds: { ...DEFAULT_KEYBINDS }
};
let activeBaitId = 'none';


let myDeviceID = localStorage.getItem('fish_device_id');
if (!myDeviceID) {
    myDeviceID = 'dev-' + Math.random().toString(36).substr(2, 9) + Date.now();
    localStorage.setItem('fish_device_id', myDeviceID);
}

function loadSave() {
    const s = localStorage.getItem('islandFisherSave');
    if (s) {
        try {
            const d = JSON.parse(s);
            // Basic stats
            if (d.money !== undefined) saveState.money = d.money;
            if (d.inventory) saveState.inventory = d.inventory;
            if (d.displayName) saveState.displayName = d.displayName;
            if (d.journal) saveState.journal = d.journal;

            // Visuals
            if (d.unlockedHats) saveState.unlockedHats = d.unlockedHats;
            if (d.currentHat) saveState.currentHat = d.currentHat;
            if (d.catColor) saveState.catColor = d.catColor;
            if (d.bellyColor) saveState.bellyColor = d.bellyColor;
            if (d.eyeColor) saveState.eyeColor = d.eyeColor;
            if (d.species) saveState.species = d.species;

            // Items
            if (d.baitInventory) saveState.baitInventory = d.baitInventory;
            if (d.hasGlove !== undefined) saveState.hasGlove = d.hasGlove;
            if (d.hasGuitar !== undefined) saveState.hasGuitar = d.hasGuitar;
            if (d.autoReelLevel !== undefined) saveState.autoReelLevel = d.autoReelLevel;
            if (d.clickPowerLevel !== undefined) saveState.clickPowerLevel = d.clickPowerLevel;

            // New Cosmetics (Rods, Shirts, Collars)
            if (d.unlockedRods) saveState.unlockedRods = d.unlockedRods;
            if (d.currentRod) saveState.currentRod = d.currentRod;
            if (d.unlockedShirts) saveState.unlockedShirts = d.unlockedShirts;
            if (d.currentShirt) saveState.currentShirt = d.currentShirt;
            if (d.unlockedCollars) saveState.unlockedCollars = d.unlockedCollars;
            if (d.currentCollar) saveState.currentCollar = d.currentCollar;

            // Patterns (Fur Patterns)
            if (d.unlockedPatterns) saveState.unlockedPatterns = d.unlockedPatterns;
            if (d.currentPattern) saveState.currentPattern = d.currentPattern;

            // Titles
            if (d.unlockedTitles) saveState.unlockedTitles = d.unlockedTitles;
            if (d.currentTitle) saveState.currentTitle = d.currentTitle;
            if (d.showTitles !== undefined) saveState.showTitles = d.showTitles;

            // Audio
            if (d.micId) saveState.micId = d.micId;
            if (d.masterVolume !== undefined) saveState.masterVolume = d.masterVolume;
            if (d.sfxVolume !== undefined) saveState.sfxVolume = d.sfxVolume;
            if (d.midiVolume !== undefined) saveState.midiVolume = d.midiVolume;
            if (d.voiceVolume !== undefined) saveState.voiceVolume = d.voiceVolume;
            if (d.musicMuted !== undefined) saveState.musicMuted = d.musicMuted;
            if (d.midiMuted !== undefined) saveState.midiMuted = d.midiMuted;

            if (d.lavaUnlocked !== undefined) saveState.lavaUnlocked = d.lavaUnlocked;

            // --- WARDROBE FIX HERE ---
            // This tells the game to remember your outfits when you reload!
            if (d.savedOutfits) saveState.savedOutfits = d.savedOutfits;
            else saveState.savedOutfits = [];

            // Keybinds
            if (d.keybinds) {
                saveState.keybinds = { ...DEFAULT_KEYBINDS, ...d.keybinds };
            }
        } catch (e) { console.error("Save Load Error", e); }
    }

    // Sync visual elements
    if (masterGain) masterGain.gain.value = saveState.masterVolume;
    if (sfxGain) sfxGain.gain.value = saveState.sfxVolume;
    if (midiGain) midiGain.gain.value = saveState.midiVolume;

    document.getElementById('username-input').value = saveState.displayName;
    document.getElementById('fur-color-picker').value = saveState.catColor;
    document.getElementById('belly-color-picker').value = saveState.bellyColor;
    document.getElementById('eye-color-picker').value = saveState.eyeColor;
    document.getElementById('species-select').value = saveState.species;

    const volS = document.getElementById('volume-slider'); if (volS) volS.value = saveState.masterVolume;
    const sfxS = document.getElementById('sfx-slider'); if (sfxS) sfxS.value = saveState.sfxVolume;
    const midS = document.getElementById('midi-slider'); if (midS) midS.value = saveState.midiVolume;
    const vocS = document.getElementById('voice-slider'); if (vocS) vocS.value = saveState.voiceVolume;

    myData.name = saveState.displayName;
    myData.color = saveState.catColor;
    myData.belly = saveState.bellyColor;
    myData.eye = saveState.eyeColor;
    myData.hat = saveState.currentHat;
    myData.shirt = saveState.currentShirt;
    myData.collar = saveState.currentCollar;
    myData.rod = saveState.currentRod;
    myData.species = saveState.species;
    myData.pattern = saveState.currentPattern;

    updateBaitSelector();
    updateUI();
    updateMusicUI();
    updateMidiUI();
}

function saveGame() {
    saveState.displayName = document.getElementById('username-input').value.substring(0, 12) || "Fisher";
    saveState.species = document.getElementById('species-select').value;

    myData.name = saveState.displayName;
    myData.species = saveState.species;

    updateUI();
    updateLocalVisuals();

    // --- ADD THIS BLOCK ---
    // Force immediate update to Dedicated Server if connected
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({
            type: 'setName',
            name: saveState.displayName,
            peerId: myPeerId
        }));
    }
    // ---------------------

    try {
        localStorage.setItem('islandFisherSave', JSON.stringify(saveState));
    } catch (e) {
        console.warn("Save failed", e);
    }
}

function updateWeatherVisuals() {
    // 1. Determine active state
    const isRainActive = isRaining && !isInVoid;

    // 2. Handle Particles (Show/Hide only)
    if (rainSystem) {
        rainSystem.visible = isRainActive;
    }

    // 3. Handle Audio
    if (typeof RainAudio !== 'undefined') RainAudio.toggle(isRainActive);

    // Note: Scene background color is handled exclusively by updateDayNightCycle().
}

// --- UI TOGGLE & UPDATE FUNCTIONS ---
window.toggleShowTitles = function () {
    saveState.showTitles = !saveState.showTitles;
    saveGame();
    updateTitleUI();
    refreshAllTitles();
}

function updateTitleUI() {
    const btn = document.getElementById('btn-titles-toggle');
    if (btn) {
        btn.innerText = saveState.showTitles ? "🏷️ Titles: ON" : "🏷️ Titles: OFF";
        btn.style.color = saveState.showTitles ? '#44ff44' : '#ff4444';
    }
}

function refreshAllTitles() {

    if (player) {
        const t = player.getObjectByName('titleSprite');
        if (t) t.visible = saveState.showTitles;
    }

    Object.values(otherPlayers).forEach(p => {
        const t = p.mesh.getObjectByName('titleSprite');
        if (t) t.visible = saveState.showTitles;
    });
}

let chatFadeTimer = null;

function refreshChatFade() {
    const ui = document.getElementById('chat-ui');
    if (!ui) return;

    // 1. Show immediately
    ui.style.opacity = '1';

    // 2. Clear any pending fade
    if (chatFadeTimer) clearTimeout(chatFadeTimer);

    // 3. If typing, KEEP it open. If not typing, schedule fade.
    if (document.activeElement !== document.getElementById('chat-input')) {
        chatFadeTimer = setTimeout(() => {
            // Check again in case user clicked focus during the timer
            if (document.activeElement !== document.getElementById('chat-input')) {
                ui.style.opacity = '0';
            }
        }, 5000); // 5 Seconds
    }
}

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

function toggleShowFish() {
    // 1. If holding something, put it away
    if (localHeldFish) {
        localHeldFish = null;
        if (fishHoldTimer) clearTimeout(fishHoldTimer);
        fishHoldTimer = null;
        updateLocalVisuals();
        return;
    }

    // 2. Check Inventory
    if (saveState.inventory.length === 0) {
        showToast("Your inventory is empty!");
        return;
    }

    // 3. Unequip other items
    if (isGuitarActive) toggleGuitar();
    if (isGloveActive) toggleGlove();
    if (fishingState !== 'idle') stopFishing(false);

    // 4. Get last fish
    const lastFish = saveState.inventory[saveState.inventory.length - 1];

    // 5. Equip it
    localHeldFish = {
        name: lastFish.name,
        color: lastFish.color,
        size: lastFish.size || 1.0 // Default to 1.0 for old saves
    };

    updateLocalVisuals();
    showToast(`Showing off: ${lastFish.name} (${lastFish.sizeLabel || 'Normal'})`);
}

function isFishCatchable(fish, tierId) {
    // 1. Calculate Player CPS (Clicks Per Second)
    // We assume a decent manual click rate of ~10 CPS + AutoReel
    // Multiply manual CPS by Click Power Level
    const power = CLICK_POWER_RATES[saveState.clickPowerLevel] || 1;
    const manualCPS = 10 * power;
    const autoCPS = (AUTO_CLICK_RATES[saveState.autoReelLevel] || 0) * power;
    const totalCPS = manualCPS + autoCPS;

    // 2. Calculate Difficulty (Mirroring startMinigame logic)
    let clicks = 15;
    let time = 5.0;

    const r = fish.rarity;
    if (r === 'Common') { clicks = 15; time = 5.0; }
    else if (r === 'Uncommon') { clicks = 30; time = 4.5; }
    else if (r === 'Rare') { clicks = 55; time = 4.0; }
    else if (r === 'Epic') { clicks = 90; time = 3.5; }
    else if (r === 'Legendary') { clicks = 120; time = 3.0; }

    // Tier Modifiers
    if (tierId === 'glistening') { clicks += 20; time -= 0.2; }
    else if (tierId === 'shining') { clicks += 50; time -= 0.5; }
    else if (tierId === 'opalescent') { clicks += 80; time -= 1.0; }

    // Lava World Modifiers
    if (fish.isLava) {
        clicks *= 2.0;
        time *= 0.7;

        const b = activeBaitId;
        if (b === 'magic' || b === 'shrimp' || b === 'jig') {
            clicks *= 0.6;
            time *= 1.2;
        } else if (b === 'grub' || b === 'spinner') {
            clicks *= 0.8;
        }

        const rod = saveState.currentRod;
        if (rod === 'lava' || rod === 'admin' || rod === 'golden' || rod === 'diamond' || rod === 'omega_milestone') {
            clicks *= 0.85;
            time *= 1.1;
        }
    }

    // Bait Time Bonus
    const bait = BAIT_TYPES.find(b => b.id === activeBaitId);
    const timeBonus = bait ? (bait.power * 0.3) : 0;
    const maxTime = Math.max(0.5, time + timeBonus);

    // 3. Check if possible
    // We add a small safety margin (0.5s) to account for reaction time / lag
    const effectiveTime = Math.max(0, maxTime - 0.5);
    const potentialClicks = totalCPS * effectiveTime;

    return potentialClicks >= clicks;
}

function selectFish() {
    let bait = BAIT_TYPES.find(b => b.id === activeBaitId);
    if (!bait) bait = BAIT_TYPES[0];

    // 1. Filter Pool based on Zone
    let basePool = FISH_TYPES.filter(f => !f.condition);

    if (fishingZone === 'void') {
        // Void logic: mostly void fish
        if (Math.random() < 0.40) basePool = FISH_TYPES.filter(f => f.condition === 'void');
    }
    else if (fishingZone === 'lava') {
        // --- LAVA LOGIC ---
        // Combine Regular Fish + Lava Fish so players can catch both
        // If you want Lava fish to be rarer, you can adjust logic here, 
        // but currently it just adds them to the pool.
        basePool = [...FISH_TYPES, ...LAVA_FISH];
    }
    else if (fishingZone === 'secret') {
        basePool = FISH_TYPES.filter(f => f.condition !== 'void' && f.condition !== 'rain' && f.name !== "Old Boot");
    }
    else if (isRaining && Math.random() < 0.40) {
        basePool = FISH_TYPES.filter(f => f.condition === 'rain');
    }

    // Safety check
    if (basePool.length === 0) basePool = FISH_TYPES.filter(f => !f.condition);

    // 2. BAIT FILTERING & LUCK LOGIC
    let pool = [];
    basePool.forEach(fish => {
        let chance = fish.chance;

        // Filter out lower-tier fish when using better bait
        if (fish.rarity === 'Common') {
            if (['squid', 'spinner', 'grub', 'jig', 'shrimp', 'magic'].includes(bait.id)) {
                if (Math.random() > 0.1) return;
            }
        }

        // --- APPLY RARITY MULTIPLIERS ---
        if (fish.rarity === 'Rare') chance *= (bait.rarityMult * 0.8);
        if (fish.rarity === 'Epic') chance *= (bait.rarityMult * 1.0);
        if (fish.rarity === 'Legendary') chance *= (bait.rarityMult * 1.2);

        pool.push({ ...fish, chance: chance });
    });

    // --- NEW: CATCHABILITY FILTER ---
    // Filter out fish that are impossible even at Normal tier
    const catchablePool = pool.filter(f => isFishCatchable(f, 'normal'));

    // Only apply filter if it doesn't empty the pool (Fallback behavior)
    if (catchablePool.length > 0) {
        pool = catchablePool;
    }
    // --------------------------------

    if (pool.length === 0) pool = basePool; // Safety fallback

    // 3. Pick Fish
    const totalChance = pool.reduce((acc, f) => acc + f.chance, 0);
    let random = Math.random() * totalChance;
    let selectedType = pool[0];
    for (let fish of pool) {
        if (random < fish.chance) { selectedType = fish; break; }
        random -= fish.chance;
    }

    // 4. Tier Logic (Shiny/Gold/Opalescent)
    const totalTierChance = TIERS.reduce((acc, t) => acc + t.chance, 0);
    let tierRandom = Math.random() * totalTierChance;

    if (bait.tierLuck > 1.0) {
        if (tierRandom < 70 && Math.random() < (bait.tierLuck - 1.0)) {
            tierRandom = Math.random() * totalTierChance;
        }
    }

    let selectedTier = TIERS[0];
    for (let tier of TIERS) {
        if (tierRandom < tier.chance) { selectedTier = tier; break; }
        tierRandom -= tier.chance;
    }

    // --- NEW: TIER DOWNGRADE ---
    // If the rolled tier makes the fish uncatchable, downgrade to Normal
    if (!isFishCatchable(selectedType, selectedTier.id)) {
        selectedTier = TIERS.find(t => t.id === 'normal');
    }
    // ---------------------------

    // 5. Size Logic
    let sizeMult = 0.5 + Math.pow(Math.random(), 2) * 2.0;
    if (bait.power > 20) sizeMult += 0.15;

    let sizeLabel = "Normal";
    if (sizeMult < 0.7) sizeLabel = "Tiny";
    else if (sizeMult < 0.9) sizeLabel = "Small";
    else if (sizeMult > 2.2) sizeLabel = "MASSIVE";
    else if (sizeMult > 1.8) sizeLabel = "Huge";
    else if (sizeMult > 1.3) sizeLabel = "Big";

    // 6. Final Calculation
    return {
        name: selectedType.name,
        basePrice: selectedType.price,
        rarity: selectedType.rarity,
        color: selectedType.color,
        drain: selectedType.drain,
        tierId: selectedTier.id,
        tierName: selectedTier.name,
        size: parseFloat(sizeMult.toFixed(2)),
        sizeLabel: sizeLabel,
        price: Math.ceil(selectedType.price * selectedTier.priceMult * sizeMult),
        drainRate: (selectedType.drain * selectedTier.drainMult) * 0.9,
        isLava: selectedType.isLava // Preserve this flag
    };
}

function updateJournal(fish, tierId) {
    if (!saveState.journal[fish.name]) saveState.journal[fish.name] = [];
    if (!saveState.journal[fish.name].includes(tierId)) saveState.journal[fish.name].push(tierId);
}

let isMobileInventoryOpen = false; // Initialize inventory state as closed for both mobile and desktop

window.toggleMobileInventory = function () {
    const ui = document.getElementById('fish-log');

    isMobileInventoryOpen = !isMobileInventoryOpen;

    // Toggle the display property
    ui.style.display = isMobileInventoryOpen ? 'block' : 'none';

    // Ensure content is fresh when opening
    if (isMobileInventoryOpen) {
        updateUI();
        showToast("Inventory opened.");
    } else {
        showToast("Inventory closed.");
    }

    // This is the correct logic now, regardless of screen width.
    // The logic for displaying the button only on mobile must be handled in CSS (see below).
}

// Ensure this stays as the Journal toggle, separate from the Inventory toggle.
window.toggleJournal = function () {
    const ui = document.getElementById('journal-overlay');
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') { document.exitPointerLock(); renderJournal(); }
}

window.toggleOptions = function () {
    const ui = document.getElementById('options-overlay');

    if (ui.style.display === 'flex') {
        ui.style.display = 'none';
        // Cleanup if they closed menu while binding
        document.removeEventListener('keydown', handleRebind);
    } else {
        populateAudioInputs();
        updateMusicUI();
        updateMidiUI();
        updateTitleUI();

        const volSlider = document.getElementById('volume-slider');
        if (volSlider) volSlider.value = saveState.masterVolume;

        // NEW: Render the controls, but only for desktop
        if (!isMobile) { // Keybinds are not relevant on mobile devices.
            renderKeybinds();
        }

        document.exitPointerLock(); // Unlock Mouse
        ui.style.display = 'flex';
    }
}

window.toggleShop = function () {
    const ui = document.getElementById('shop-overlay');
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') { document.exitPointerLock(); renderShop(); }
}

window.toggleBaitShop = function () {
    const ui = document.getElementById('bait-shop-overlay');
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') { document.exitPointerLock(); renderBaitShop(); }
}

window.toggleHostPanel = function () {
    const ui = document.getElementById('host-overlay');
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') { document.exitPointerLock(); updateHostPanel(); }
}

window.changeVolume = function (val) {
    saveState.masterVolume = parseFloat(val);
    if (masterGain) masterGain.gain.setTargetAtTime(saveState.masterVolume, audioCtx.currentTime, 0.1);
    saveGame();
}

window.changeSFXVolume = function (val) {
    saveState.sfxVolume = parseFloat(val);
    if (sfxGain) sfxGain.gain.setTargetAtTime(saveState.sfxVolume, audioCtx.currentTime, 0.1);
    saveGame();
}

window.changeMidiVolume = function (val) {
    saveState.midiVolume = parseFloat(val);
    if (midiGain) midiGain.gain.setTargetAtTime(saveState.midiVolume, audioCtx.currentTime, 0.1);
    saveGame();
}

window.changeVoiceVolume = function (val) {
    saveState.voiceVolume = parseFloat(val);


    saveGame();
}

window.changeSpecies = function (species) {
    saveState.species = species;
    myData.species = species;


    if (player) {
        updateLocalVisuals();
    }


    if (document.getElementById('shop-overlay').style.display === 'flex') {
        renderShop();
    }

    saveGame();
}

window.toggleMusic = function () {
    saveState.musicMuted = !saveState.musicMuted;
    saveGame();
    updateMusicUI();

    if (saveState.musicMuted) Music.stop();
    else Music.init();
}

window.deleteSave = function () {
    if (confirm("⚠️ ARE YOU SURE? ⚠️\n\nThis will PERMANENTLY delete your money, items, and unlocks.\n\nPress OK to wipe your save and restart.")) {
        localStorage.removeItem('islandFisherSave');
        location.reload();
    }
}

window.leaveGame = function () {
    if (confirm("Are you sure you want to leave the room?")) {
        Object.keys(otherPlayers).forEach(pid => removePlayer(pid));

        // FIX: Close dedicated socket
        if (dedicatedSocket) {
            dedicatedSocket.close();
            dedicatedSocket = null;
        }

        if (peer) peer.destroy();
        location.reload();
    }
}

window.changeFurColor = function (c) {
    saveState.catColor = c;
    saveGame();
    updateLocalVisuals();
    renderShop();
}

window.changeBellyColor = function (c) {
    saveState.bellyColor = c;
    updateLocalVisuals();
    renderShop();
    saveGame();
}

window.changeBait = function (val) {

    if (fishingState !== 'idle') {
        showToast("Can't change bait while fishing!");



        updateBaitSelector();
        return;
    }


    activeBaitId = val;
}

window.changeEyeColor = function (c) {
    saveState.eyeColor = c;
    updateLocalVisuals();
    renderShop();
    saveGame();
}
function updateMusicUI() {
    const btn = document.getElementById('btn-music-toggle');
    if (btn) {
        btn.innerText = saveState.musicMuted ? "🎵 Music: OFF" : "🎵 Music: ON";
        btn.style.color = saveState.musicMuted ? '#ff4444' : '#44ff44';
    }
}

function updateLocalVisuals() {
    if (player) {
        const s = player.getObjectByName('playerSprite');

        if (s.userData.matFront.map) disposeTexture(s.userData.matFront.map);
        if (s.userData.matBack.map) disposeTexture(s.userData.matBack.map);

        // Generate textures based on current save state
        const texF = createSpeciesTexture(saveState.species, saveState.catColor, saveState.bellyColor, false, saveState.currentHat, saveState.currentShirt, saveState.currentCollar, saveState.eyeColor, saveState.currentPattern);
        const texB = createSpeciesTexture(saveState.species, saveState.catColor, saveState.bellyColor, true, saveState.currentHat, saveState.currentShirt, saveState.currentCollar, saveState.eyeColor, saveState.currentPattern);

        s.userData.matFront.map = texF;
        s.userData.matBack.map = texB;

        // Force update
        s.userData.matFront.needsUpdate = true;
        s.userData.matBack.needsUpdate = true;

        // Title Update
        const oldT = player.getObjectByName('titleSprite');
        if (oldT) player.remove(oldT);

        const tTex = createTitleTexture(saveState.currentTitle);
        if (tTex) {
            const tMat = new THREE.SpriteMaterial({ map: tTex, depthWrite: false, depthTest: false });
            const tSprite = new THREE.Sprite(tMat);
            tSprite.position.y = 2.5; tSprite.scale.set(3, 0.75, 1); tSprite.name = "titleSprite";
            tSprite.renderOrder = 201; // Higher than remote players (101)
            // Only show if setting is enabled
            tSprite.visible = saveState.showTitles;
            player.add(tSprite);
        }

        // Name Tag Update
        const oldName = player.getObjectByName('nameTag');
        if (oldName) {
            const nameTex = createNameTagTexture(saveState.displayName);
            oldName.material.map.dispose();
            oldName.material.map = nameTex;
            oldName.material.needsUpdate = true;
        }

        // --- HELD ITEMS LOGIC ---
        const oldFish = player.getObjectByName('heldFishSprite');
        if (oldFish) player.remove(oldFish);

        const oldRod = player.getObjectByName('rod');
        if (oldRod) player.remove(oldRod);

        // 1. Showing a Fish?
        if (localHeldFish && !isGuitarActive && !isGloveActive) {
            // FIX: Ensure color fallback and explicit visibility
            const color = localHeldFish.color || '#ffffff';
            const fTex = createFishTexture(localHeldFish.name, color);
            const fMat = new THREE.SpriteMaterial({
                map: fTex,
                transparent: true,
                alphaTest: 0.5
            });

            const fSprite = new THREE.Sprite(fMat);
            fSprite.name = 'heldFishSprite';
            fSprite.position.set(0.6, 1.2, 0.5);
            fSprite.visible = true; // Explicity set visible
            fSprite.renderOrder = 999; // Force on top

            const size = localHeldFish.size || 1.0;
            fSprite.scale.set(1.5 * size, 1.5 * size, 1);

            player.add(fSprite);
        }
        // 2. Holding Rod? (Check isHandsHidden here)
        else if (!isGuitarActive && !isGloveActive && !isHandsHidden) {
            // Create Rod with current skin
            const rodId = saveState.currentRod || 'bamboo';
            const rodTex = createRodTexture(rodId);
            const rodMat = new THREE.MeshBasicMaterial({ map: rodTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });

            const rodGeo = new THREE.PlaneGeometry(3.0, 3.0);
            rodGeo.translate(1.5, 1.5, 0);

            const r = new THREE.Mesh(rodGeo, rodMat);
            r.position.set(0.6, 0.8, 0.1);
            r.rotation.set(-0.2, -Math.PI / 2, 0);
            r.name = "rod";
            player.add(r);
        }
    }
}
function renderJournal() {
    const container = document.getElementById('journal-container');
    container.innerHTML = '';

    const rarityMap = { "Common": 1, "Uncommon": 2, "Rare": 3, "Epic": 4, "Legendary": 5 };

    // --- 1. AGGREGATE ALL FISH LISTS ---
    // We use a Map to ensure unique names (prevents duplicates if Rain/Void are already in FISH_TYPES)
    const fishMap = new Map();

    const addList = (list) => {
        if (list && Array.isArray(list)) {
            list.forEach(f => fishMap.set(f.name, f));
        }
    };

    addList(FISH_TYPES); // Base, Generated, and any manually pushed fish
    if (typeof LAVA_FISH !== 'undefined') addList(LAVA_FISH); // 250+ Lava Variants
    if (typeof RAIN_FISH !== 'undefined') addList(RAIN_FISH); // Rain Exclusives
    if (typeof VOID_FISH !== 'undefined') addList(VOID_FISH); // Void Exclusives

    const allFish = Array.from(fishMap.values());

    // --- 2. SORTING ---
    const sortedFish = allFish.sort((a, b) => {
        const rarityDiff = rarityMap[a.rarity] - rarityMap[b.rarity];
        if (rarityDiff !== 0) return rarityDiff;
        return a.name.localeCompare(b.name);
    });

    // --- 3. PROGRESS HEADER ---
    const totalCount = sortedFish.length;
    const caughtCount = Object.keys(saveState.journal).length;

    const header = document.createElement('div');
    header.style.gridColumn = "1 / -1";
    header.style.textAlign = "center";
    header.style.marginBottom = "15px";
    header.style.color = "#fff";
    header.style.background = "rgba(0,0,0,0.5)";
    header.style.padding = "10px";
    header.style.borderRadius = "8px";
    header.innerHTML = `<h3 style="margin:0">Discovery Progress: ${caughtCount} / ${totalCount}</h3>`;
    container.appendChild(header);

    // --- 4. RENDER GRID (Using Fragment) ---
    const fragment = document.createDocumentFragment();

    sortedFish.forEach(fish => {
        const entry = document.createElement('div');
        const caughtData = saveState.journal[fish.name];
        const isCaught = caughtData && caughtData.length > 0;

        entry.className = isCaught ? 'journal-entry unlocked' : 'journal-entry';

        // Inline CSS for layout
        entry.style.display = 'flex';
        entry.style.flexDirection = 'column';
        entry.style.alignItems = 'center';
        entry.style.justifyContent = 'center';
        entry.style.padding = '10px';
        entry.style.gap = '5px';

        if (isCaught) {
            const tex = createFishTexture(fish.name, fish.color);
            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(tex.image, 0, 0);
            entry.appendChild(canvas);
        } else {
            const placeholder = document.createElement('div');
            placeholder.style.width = '64px';
            placeholder.style.height = '64px';
            placeholder.style.display = 'flex';
            placeholder.style.alignItems = 'center';
            placeholder.style.justifyContent = 'center';
            placeholder.style.fontSize = '32px';
            placeholder.style.color = '#333';
            placeholder.style.fontWeight = 'bold';
            placeholder.innerText = '?';
            entry.appendChild(placeholder);
        }

        let html = `<div class="journal-name" style="color:${isCaught ? fish.color : '#555'}; font-weight:bold; font-size:12px; text-shadow: 1px 1px 0 #000; text-align:center;">${isCaught ? fish.name : "???"}</div>`;
        html += `<div class="journal-rarity" style="font-size:10px; color:#888;">${fish.rarity}</div>`;

        const textContainer = document.createElement('div');
        textContainer.innerHTML = html;

        // Show medals/tiers if caught
        if (isCaught) {
            const medalsDiv = document.createElement('div');
            medalsDiv.className = 'journal-medals';
            medalsDiv.style.justifyContent = 'center';

            TIERS.forEach(tier => {
                const hasTier = caughtData && caughtData.includes(tier.id);
                const m = document.createElement('div');
                m.className = `medal ${hasTier ? 'got-' + tier.id : ''}`;
                m.title = tier.name;
                medalsDiv.appendChild(m);
            });
            textContainer.appendChild(medalsDiv);
        }

        entry.appendChild(textContainer);
        fragment.appendChild(entry);
    });

    container.appendChild(fragment);
}

/**
         * Purges all chat messages sent by a specific peerId from the UI.
         * @param {string} bannedId - The ID of the peer whose messages to remove.
         */
function purgeUserMessages(bannedId) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    // Select all messages and filter down to the ones from the banned user
    const messages = Array.from(chatMessages.children);

    messages.forEach(msg => {
        // We store the sender ID in a data attribute (we'll add this next)
        if (msg.dataset.senderId === bannedId) {
            msg.remove();
        }
    });
    showToast(`Messages by ${bannedId} purged.`);
}


// --- WARDROBE SYSTEM ---

function saveCurrentOutfit() {
    if (saveState.savedOutfits.length >= 10) {
        showToast("Wardrobe full! Delete an outfit first.");
        return;
    }

    const name = prompt("Name this outfit:", `Outfit ${saveState.savedOutfits.length + 1}`);
    if (!name) return;

    const outfit = {
        id: Date.now(), // Unique ID
        name: name.substring(0, 12),
        species: saveState.species,
        color: saveState.catColor,
        belly: saveState.bellyColor,
        eye: saveState.eyeColor,
        hat: saveState.currentHat,
        shirt: saveState.currentShirt,
        collar: saveState.currentCollar,
        rod: saveState.currentRod,
        title: saveState.currentTitle,
        pattern: saveState.currentPattern
    };

    saveState.savedOutfits.push(outfit);
    saveGame();
    renderOutfitList();
    showToast("Outfit Saved!");
}

function loadOutfit(id) {
    const outfit = saveState.savedOutfits.find(o => o.id === id);
    if (!outfit) return;

    // Apply Settings
    saveState.species = outfit.species || 'cat';
    saveState.catColor = outfit.color || '#ff0000';
    saveState.bellyColor = outfit.belly || '#ffffff';
    saveState.eyeColor = outfit.eye || '#000000';

    // Check if we still own the items (in case of weird save data), otherwise default to none
    saveState.currentHat = saveState.unlockedHats.includes(outfit.hat) ? outfit.hat : 'none';
    saveState.currentShirt = saveState.unlockedShirts.includes(outfit.shirt) ? outfit.shirt : 'none';
    saveState.currentCollar = saveState.unlockedCollars.includes(outfit.collar) ? outfit.collar : 'none';
    saveState.currentRod = saveState.unlockedRods.includes(outfit.rod) ? outfit.rod : 'bamboo';
    saveState.currentTitle = saveState.unlockedTitles.includes(outfit.title) ? outfit.title : 'none';
    saveState.currentPattern = saveState.unlockedPatterns.includes(outfit.pattern) ? outfit.pattern : 'none';

    // Update UI Pickers
    document.getElementById('species-select').value = saveState.species;
    document.getElementById('fur-color-picker').value = saveState.catColor;
    document.getElementById('belly-color-picker').value = saveState.bellyColor;
    document.getElementById('eye-color-picker').value = saveState.eyeColor;

    saveGame();
    updateLocalVisuals();
    renderShop(); // Refreshes the "Equipped" status on buttons
    showToast(`Loaded: ${outfit.name}`);
}

function deleteOutfit(id) {
    if (confirm("Delete this outfit?")) {
        saveState.savedOutfits = saveState.savedOutfits.filter(o => o.id !== id);
        saveGame();
        renderOutfitList();
    }
}

function renderOutfitList() {
    const container = document.getElementById('outfit-list');
    if (!container) return;
    container.innerHTML = '';

    if (saveState.savedOutfits.length === 0) {
        container.innerHTML = '<div style="color:#888; text-align:center; font-size:12px; margin-top:20px;">No saved outfits.</div>';
        return;
    }

    saveState.savedOutfits.forEach(outfit => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.background = 'rgba(255,255,255,0.1)';
        row.style.borderRadius = '6px';
        row.style.padding = '5px';
        row.style.gap = '5px';

        // Load Button (The Outfit Name)
        const btnLoad = document.createElement('button');
        btnLoad.className = 'btn-sm';
        btnLoad.style.flex = '1';
        btnLoad.style.textAlign = 'left';
        btnLoad.innerText = outfit.name;
        btnLoad.onclick = () => loadOutfit(outfit.id);

        // Delete Button
        const btnDel = document.createElement('button');
        btnDel.className = 'btn-sm btn-danger';
        btnDel.style.padding = '2px 8px';
        btnDel.innerText = '×';
        btnDel.onclick = () => deleteOutfit(outfit.id);

        row.appendChild(btnLoad);
        row.appendChild(btnDel);
        container.appendChild(row);
    });
}

let shopMode = 'hats';

function renderShop() {
    const container = document.getElementById('shop-container');
    container.innerHTML = '';

    // --- NAVIGATION TABS ---
    const navDiv = document.createElement('div');
    navDiv.style.gridColumn = "1 / -1";
    navDiv.style.width = '100%';
    navDiv.style.display = 'flex';
    navDiv.style.justifyContent = 'center';
    navDiv.style.gap = '5px';
    navDiv.style.marginBottom = '15px';

    const createTab = (id, label) => {
        const btn = document.createElement('button');
        btn.className = 'btn-lg';
        btn.style.fontSize = '12px';
        btn.style.padding = '8px 10px';
        btn.style.flex = '1';
        const isActive = shopMode === id;
        btn.style.background = isActive ? '#44ff44' : '#444';
        btn.style.color = isActive ? '#000' : '#fff';
        btn.style.border = isActive ? '2px solid #fff' : '1px solid #555';
        btn.innerText = label;
        btn.onclick = () => { shopMode = id; renderShop(); };
        navDiv.appendChild(btn);
    };

    createTab('hats', '🎩 Hats');
    createTab('rods', '🎣 Rods');
    createTab('shirts', '👕 Shirts');
    createTab('collars', '🔔 Collars');
    createTab('patterns', '🐾 Patterns');
    createTab('titles', '🏷️ Titles');
    createTab('misc', '🎸 Misc');
    container.appendChild(navDiv);

    // --- COLLAR TAB ---
    if (shopMode === 'collars') {
        const sortedCollars = [...COLLAR_TYPES].sort((a, b) => a.price - b.price);
        sortedCollars.forEach(item => {
            const entry = document.createElement('div');
            const isOwned = saveState.unlockedCollars.includes(item.id);
            const isEquipped = saveState.currentCollar === item.id;
            entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';

            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            drawSpecies(ctx, saveState.species, saveState.catColor, saveState.bellyColor, saveState.eyeColor, false);
            drawShirt(ctx, saveState.currentShirt, false);
            drawCollar(ctx, item.id, false);
            entry.appendChild(canvas);

            const name = document.createElement('div');
            name.style.fontWeight = 'bold'; name.innerText = item.name;
            entry.appendChild(name);

            const btn = document.createElement('button');
            if (isEquipped) {
                btn.innerText = "Equipped";
                btn.disabled = true;
            } else if (isOwned) {
                btn.innerText = "Equip";
                btn.onclick = () => {
                    saveState.currentCollar = item.id;
                    saveGame();
                    updateLocalVisuals();
                    renderShop();
                };
            } else {
                btn.innerText = `$${item.price}`;
                btn.style.color = saveState.money >= item.price ? '#00cc00' : '#ff4444';
                btn.onclick = () => {
                    if (saveState.money >= item.price) {
                        saveState.money -= item.price;
                        saveState.unlockedCollars.push(item.id);
                        Sound.sell();
                        saveGame();
                        renderShop();
                    } else showToast("Not enough money!");
                };
            }
            entry.appendChild(btn);
            container.appendChild(entry);
        });
    }

    // --- PATTERNS TAB ---
    else if (shopMode === 'patterns') {
        const sortedPatterns = [...PATTERN_TYPES].sort((a, b) => a.price - b.price);
        sortedPatterns.forEach(pattern => {
            const entry = document.createElement('div');
            const isOwned = saveState.unlockedPatterns.includes(pattern.id);
            const isEquipped = saveState.currentPattern === pattern.id;
            entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';

            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            drawSpecies(ctx, saveState.species, saveState.catColor, saveState.bellyColor, saveState.eyeColor, false);
            drawPattern(ctx, pattern.id, saveState.catColor, false);
            entry.appendChild(canvas);

            const name = document.createElement('div');
            name.style.fontWeight = 'bold'; name.innerText = pattern.name;
            entry.appendChild(name);

            const btn = document.createElement('button');
            if (isEquipped) {
                btn.innerText = "Equipped";
                btn.disabled = true;
            } else if (isOwned) {
                btn.innerText = "Equip";
                btn.onclick = () => {
                    saveState.currentPattern = pattern.id;
                    saveGame();
                    updateLocalVisuals();
                    renderShop();
                };
            } else {
                btn.innerText = `$${pattern.price}`;
                btn.style.color = saveState.money >= pattern.price ? '#00cc00' : '#ff4444';
                btn.onclick = () => {
                    if (saveState.money >= pattern.price) {
                        saveState.money -= pattern.price;
                        saveState.unlockedPatterns.push(pattern.id);
                        Sound.sell();
                        saveGame();
                        renderShop();
                    } else showToast("Not enough money!");
                };
            }
            entry.appendChild(btn);
            container.appendChild(entry);
        });
    }

    // --- SHIRTS TAB ---
    else if (shopMode === 'shirts') {
        const sortedShirts = [...SHIRT_TYPES].sort((a, b) => a.price - b.price);
        sortedShirts.forEach(shirt => {
            const entry = document.createElement('div');
            const isOwned = saveState.unlockedShirts.includes(shirt.id);
            const isEquipped = saveState.currentShirt === shirt.id;
            entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';

            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            drawSpecies(ctx, saveState.species, saveState.catColor, saveState.bellyColor, saveState.eyeColor, false);
            drawShirt(ctx, shirt.id, false);
            drawCollar(ctx, saveState.currentCollar, false);
            entry.appendChild(canvas);

            const name = document.createElement('div');
            name.style.fontWeight = 'bold'; name.innerText = shirt.name;
            entry.appendChild(name);

            const btn = document.createElement('button');
            if (isEquipped) { btn.innerText = "Equipped"; btn.disabled = true; }
            else if (isOwned) {
                btn.innerText = "Equip";
                btn.onclick = () => {
                    saveState.currentShirt = shirt.id;
                    saveGame();
                    updateLocalVisuals();
                    renderShop();
                };
            } else {
                btn.innerText = `$${shirt.price}`;
                btn.style.color = saveState.money >= shirt.price ? '#00cc00' : '#ff4444';
                btn.onclick = () => {
                    if (saveState.money >= shirt.price) {
                        saveState.money -= shirt.price;
                        saveState.unlockedShirts.push(shirt.id);
                        Sound.sell();
                        saveGame();
                        renderShop();
                    } else showToast("Not enough money!");
                };
            }
            entry.appendChild(btn);
            container.appendChild(entry);
        });
    }

    // --- HATS TAB ---
    else if (shopMode === 'hats') {
        const sortedHats = [...HAT_TYPES].sort((a, b) => a.price - b.price);
        sortedHats.forEach(hat => {
            const entry = document.createElement('div');
            const isOwned = saveState.unlockedHats.includes(hat.id);
            const isEquipped = saveState.currentHat === hat.id;
            entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';

            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            drawSpecies(ctx, saveState.species, saveState.catColor, saveState.bellyColor, saveState.eyeColor, false);
            drawShirt(ctx, saveState.currentShirt, false);
            drawCollar(ctx, saveState.currentCollar, false);
            drawHat(ctx, hat.id, false);
            entry.appendChild(canvas);

            const name = document.createElement('div');
            name.style.fontWeight = 'bold'; name.innerText = hat.name;
            entry.appendChild(name);

            const btn = document.createElement('button');
            if (isEquipped) { btn.innerText = "Equipped"; btn.disabled = true; }
            else if (isOwned) { btn.innerText = "Equip"; btn.onclick = () => equipHat(hat.id); }
            else {
                btn.innerText = `$${hat.price}`;
                btn.style.color = saveState.money >= hat.price ? '#00cc00' : '#ff4444';
                btn.onclick = () => buyHat(hat);
            }
            entry.appendChild(btn);
            container.appendChild(entry);
        });
    }

    // --- RODS TAB ---
    else if (shopMode === 'rods') {
        const uniqueFishCount = Object.keys(saveState.journal).length;
        const sortedRods = [...ROD_TYPES].sort((a, b) => {
            if (a.price === b.price) return (a.unlockCount || 0) - (b.unlockCount || 0);
            return a.price - b.price;
        });

        sortedRods.forEach(item => {
            const entry = document.createElement('div');
            const isOwned = saveState.unlockedRods.includes(item.id);
            const isEquipped = saveState.currentRod === item.id;
            entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';

            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            const rodTex = createRodTexture(item.id);
            ctx.drawImage(rodTex.image, 0, 0);
            entry.appendChild(canvas);

            const name = document.createElement('div');
            name.style.fontWeight = 'bold'; name.innerText = item.name;
            entry.appendChild(name);

            const btn = document.createElement('button');

            if (isEquipped) {
                btn.innerText = "Equipped";
                btn.disabled = true;
            } else if (isOwned) {
                btn.innerText = "Equip";
                btn.onclick = () => {
                    saveState.currentRod = item.id;
                    saveGame();
                    updateLocalVisuals();
                    renderShop();
                };
            } else {
                if (item.unlockCount) {
                    if (uniqueFishCount >= item.unlockCount) {
                        btn.innerText = "Claim Reward!";
                        btn.style.color = '#00ffff';
                        btn.onclick = () => {
                            saveState.unlockedRods.push(item.id);
                            Sound.sell();
                            saveGame();
                            renderShop();
                            showToast(`Unlocked ${item.name}!`);
                        };
                    } else {
                        btn.innerText = `Need ${item.unlockCount} Fish`;
                        btn.style.fontSize = '10px';
                        btn.style.color = '#888';
                        btn.disabled = true;
                        const prog = document.createElement('div');
                        prog.style.fontSize = '9px'; prog.style.color = '#666';
                        prog.innerText = `(${uniqueFishCount} / ${item.unlockCount})`;
                        entry.appendChild(prog);
                    }
                } else {
                    btn.innerText = `$${item.price}`;
                    btn.style.color = saveState.money >= item.price ? '#00cc00' : '#ff4444';
                    btn.onclick = () => {
                        if (saveState.money >= item.price) {
                            saveState.money -= item.price;
                            saveState.unlockedRods.push(item.id);
                            Sound.sell();
                            saveGame();
                            renderShop();
                        } else showToast("Not enough money!");
                    };
                }
            }
            entry.appendChild(btn);
            container.appendChild(entry);
        });
    }

    // --- TITLES & MISC ---
    else if (shopMode === 'titles') {
        const sortedTitles = [...TITLE_TYPES].sort((a, b) => a.price - b.price);
        sortedTitles.forEach(title => {
            const entry = document.createElement('div');
            const isOwned = saveState.unlockedTitles.includes(title.id);
            const isEquipped = saveState.currentTitle === title.id;
            entry.className = isEquipped ? 'grid-entry selected' : 'grid-entry';
            const preview = document.createElement('div');
            preview.innerText = `< ${title.text || "No Title"} >`;
            preview.style.color = title.color || '#87CEEB';
            preview.style.fontWeight = 'bold';
            entry.appendChild(preview);
            const btn = document.createElement('button');
            if (isEquipped) { btn.innerText = "Equipped"; btn.disabled = true; }
            else if (isOwned) {
                btn.innerText = "Equip";
                btn.onclick = () => { saveState.currentTitle = title.id; saveGame(); updateLocalVisuals(); renderShop(); };
            } else {
                btn.innerText = `$${title.price}`;
                btn.onclick = () => { if (saveState.money >= title.price) { saveState.money -= title.price; saveState.unlockedTitles.push(title.id); Sound.sell(); saveGame(); renderShop(); } else showToast("Not enough money!"); };
            }
            entry.appendChild(btn);
            container.appendChild(entry);
        });
    }

    else if (shopMode === 'misc') {
        const gDiv = document.createElement('div');
        gDiv.className = saveState.hasGuitar ? 'grid-entry selected' : 'grid-entry';
        if (saveState.hasGuitar) gDiv.style.borderColor = '#ffaa00';
        const gTitle = document.createElement('div'); gTitle.innerHTML = "<b>🎸 Guitar</b>"; gDiv.appendChild(gTitle);
        const gDesc = document.createElement('div'); gDesc.style.fontSize = '12px'; gDesc.style.color = '#aaa'; gDesc.innerText = "Play MIDI songs!"; gDiv.appendChild(gDesc);
        const gBtn = document.createElement('button');
        if (saveState.hasGuitar) { gBtn.innerText = "Owned (Press G)"; gBtn.disabled = true; } else {
            gBtn.innerText = "Buy ($1500)"; gBtn.style.color = saveState.money >= 1500 ? '#00cc00' : '#ff4444';
            gBtn.onclick = () => { if (saveState.money >= 1500) { saveState.money -= 1500; saveState.hasGuitar = true; saveGame(); Sound.sell(); renderShop(); showToast("Bought Guitar! Press 'G'!"); } else showToast("Not enough cash!"); };
        }
        gDiv.appendChild(gBtn); container.appendChild(gDiv);

        const bDiv = document.createElement('div');
        bDiv.className = saveState.hasGlove ? 'grid-entry selected' : 'grid-entry';
        if (saveState.hasGlove) bDiv.style.borderColor = '#ff4444';
        const bTitle = document.createElement('div'); bTitle.innerHTML = "<b>🥊 Glove</b>"; bDiv.appendChild(bTitle);
        const bDesc = document.createElement('div'); bDesc.style.fontSize = '12px'; bDesc.style.color = '#aaa'; bDesc.innerText = "PvP Punching!"; bDiv.appendChild(bDesc);
        const bBtn = document.createElement('button');
        if (saveState.hasGlove) { bBtn.innerText = "Owned (Press B)"; bBtn.disabled = true; } else {
            bBtn.innerText = "Buy ($10,000)"; bBtn.style.color = saveState.money >= 10000 ? '#00cc00' : '#ff4444';
            bBtn.onclick = () => { if (saveState.money >= 10000) { saveState.money -= 10000; saveState.hasGlove = true; saveGame(); Sound.sell(); renderShop(); showToast("Bought Glove! Press 'B'!"); } else showToast("Not enough cash!"); };
        }
        bDiv.appendChild(bBtn); container.appendChild(bDiv);
    }

    // --- IMPORTANT: RENDER OUTFITS EVERY TIME SHOP UPDATES ---
    renderOutfitList();
}

function renderBaitShop() {
    const container = document.getElementById('bait-shop-container');
    container.innerHTML = '';

    // --- 1. RENDER AUTO-REEL UPGRADE ---
    const lvl = saveState.autoReelLevel;
    const maxLvl = AUTO_CLICK_RATES.length - 1;

    const upgradeDiv = document.createElement('div');
    upgradeDiv.className = 'grid-entry';
    upgradeDiv.style.borderColor = '#00ffff';
    upgradeDiv.style.background = '#002233';

    const upTitle = document.createElement('div');
    upTitle.innerHTML = `<b>🎣 Auto-Reel v${lvl}</b>`;
    upgradeDiv.appendChild(upTitle);

    const upDesc = document.createElement('div');
    upDesc.style.fontSize = '12px';
    upDesc.style.color = '#aaa';
    upDesc.style.margin = '5px 0';

    if (lvl < maxLvl) {
        const nextRate = AUTO_CLICK_RATES[lvl + 1];
        upDesc.innerHTML = `Upgrade to catch faster!<br>Next: ${nextRate} Clicks/Sec`;
        upgradeDiv.appendChild(upDesc);

        const cost = AUTO_CLICK_PRICES[lvl + 1];
        const btn = document.createElement('button');
        btn.innerText = `Upgrade ($${cost})`;
        btn.style.color = saveState.money >= cost ? '#44ff44' : '#ff4444';
        btn.onclick = () => buyAutoReelUpgrade(cost);
        upgradeDiv.appendChild(btn);
    } else {
        upDesc.innerHTML = `MAX LEVEL<br>${AUTO_CLICK_RATES[lvl]} Clicks/Sec`;
        upgradeDiv.appendChild(upDesc);
        const maxed = document.createElement('div');
        maxed.innerText = "COMPLETED";
        maxed.style.color = "#00ffff";
        maxed.style.fontWeight = "bold";
        upgradeDiv.appendChild(maxed);
    }
    container.appendChild(upgradeDiv);

    // --- 2. RENDER CLICK POWER UPGRADE ---
    const cpLvl = saveState.clickPowerLevel || 0;
    const maxCpLvl = CLICK_POWER_RATES.length - 1;

    const cpDiv = document.createElement('div');
    cpDiv.className = 'grid-entry';
    cpDiv.style.borderColor = '#ffaa00';
    cpDiv.style.background = '#331100';

    const cpTitle = document.createElement('div');
    cpTitle.innerHTML = `<b>💪 Click Power v${cpLvl}</b>`;
    cpDiv.appendChild(cpTitle);

    const cpDesc = document.createElement('div');
    cpDesc.style.fontSize = '12px';
    cpDesc.style.color = '#aaa';
    cpDesc.style.margin = '5px 0';

    const currentPower = CLICK_POWER_RATES[cpLvl];

    if (cpLvl < maxCpLvl) {
        const nextPower = CLICK_POWER_RATES[cpLvl + 1];
        cpDesc.innerHTML = `Current: ${currentPower}x<br>Next: ${nextPower}x Power`;
        cpDiv.appendChild(cpDesc);

        const cost = CLICK_POWER_PRICES[cpLvl + 1];
        const btn = document.createElement('button');
        btn.innerText = `Upgrade ($${cost})`;
        btn.style.color = saveState.money >= cost ? '#44ff44' : '#ff4444';
        btn.onclick = () => buyClickPowerUpgrade(cost);
        cpDiv.appendChild(btn);
    } else {
        cpDesc.innerHTML = `MAX LEVEL<br>${currentPower}x Power`;
        cpDiv.appendChild(cpDesc);
        const maxed = document.createElement('div');
        maxed.innerText = "COMPLETED";
        maxed.style.color = '#ffaa00';
        maxed.style.fontWeight = 'bold';
        cpDiv.appendChild(maxed);
    }
    container.appendChild(cpDiv);

    // --- 2. RENDER BAITS ---
    const uniqueCount = Object.keys(saveState.journal).length;

    BAIT_TYPES.forEach(bait => {
        if (bait.id === 'none') return;

        const entry = document.createElement('div');
        entry.className = 'grid-entry';

        // Name
        const name = document.createElement('div');
        name.style.fontWeight = 'bold';
        name.innerText = bait.name;
        entry.appendChild(name);

        // Stats
        const info = document.createElement('div');
        info.style.fontSize = '12px';
        info.style.color = '#aaa';
        info.innerText = `Pwr: ${bait.power} | Luck: ${bait.rarityMult}x`;
        entry.appendChild(info);

        // Lock Logic
        const locked = uniqueCount < bait.unlockFish;

        if (locked) {
            // Locked UI
            const overlay = document.createElement('div');
            overlay.style.color = '#ff4444';
            overlay.style.fontWeight = 'bold';
            overlay.style.marginTop = '10px';
            overlay.style.fontSize = '13px';
            overlay.innerText = `🔒 Need ${bait.unlockFish} Fish`;
            entry.appendChild(overlay);

            // Add progress text
            const progress = document.createElement('div');
            progress.style.fontSize = '10px';
            progress.style.color = '#666';
            progress.innerText = `(${uniqueCount} / ${bait.unlockFish})`;
            entry.appendChild(progress);
        } else {
            // Unlocked UI
            const btn = document.createElement('button');
            const cost = bait.price;
            btn.innerText = `Buy 10 ($${cost})`;
            btn.style.marginTop = '8px';
            btn.style.color = saveState.money >= cost ? '#44ff44' : '#ff4444';
            btn.onclick = () => buyBait(bait);
            entry.appendChild(btn);
        }

        // Owned Count
        const owned = document.createElement('div');
        owned.style.fontSize = '11px';
        owned.style.marginTop = '5px';
        owned.style.color = '#fff';
        owned.innerText = `Owned: ${saveState.baitInventory[bait.id] || 0}`;
        entry.appendChild(owned);

        container.appendChild(entry);
    });
}

// --- NEW STATE VARIABLE ---
let isHandsHidden = false;

function toggleEmptyHands() {
    // 1. Reset all other modes
    if (isGuitarActive) toggleGuitar();
    if (isGloveActive) toggleGlove();

    // 2. Clear held fish
    if (localHeldFish) {
        localHeldFish = null;
        if (fishHoldTimer) clearTimeout(fishHoldTimer);
        fishHoldTimer = null;
    }

    // 3. Toggle the "Hidden" state
    isHandsHidden = !isHandsHidden;

    // 4. Update Visuals
    updateLocalVisuals();

    // 5. Notify
    if (isHandsHidden) showToast("Hands Empty (Screenshot Mode)");
    else showToast("Rod Equipped");
}

function toggleGuitar() {
    if (!saveState.hasGuitar) {
        showToast("You don't own a guitar! Check the Stylist.");
        return;
    }

    if (isGloveActive) {
        isGloveActive = false;
        const g = player.getObjectByName('gloveMesh');
        if (g) g.visible = false;
    }

    if (localHeldFish) {
        localHeldFish = null;
        if (fishHoldTimer) clearTimeout(fishHoldTimer);
        fishHoldTimer = null;
        updateLocalVisuals();
    }

    if (!isGuitarActive && fishingState !== 'idle') {
        stopFishing(false);
    }

    isGuitarActive = !isGuitarActive;

    const ui = document.getElementById('guitar-ui');
    if (ui) ui.style.display = isGuitarActive ? 'block' : 'none';
    if (!isGuitarActive) stopMidi();

    const rod = player.getObjectByName('rod');
    if (rod) rod.visible = !isGuitarActive && !isGloveActive;

    let guitarMesh = player.getObjectByName('guitarMesh');
    if (isGuitarActive) {
        if (!guitarMesh) {
            const c = document.createElement('canvas'); c.width = 64; c.height = 64;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#8B4513'; ctx.beginPath(); ctx.arc(32, 45, 12, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(32, 35, 10, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#222'; ctx.fillRect(30, 10, 4, 30);
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(32, 40, 4, 0, Math.PI * 2); ctx.fill();

            const tex = new THREE.CanvasTexture(c);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;

            // --- FIX: AlphaTest added ---
            const mat = new THREE.SpriteMaterial({
                map: tex,
                transparent: true,
                depthWrite: false,
                depthTest: true,
                alphaTest: 0.5
            });

            guitarMesh = new THREE.Sprite(mat);
            guitarMesh.name = 'guitarMesh';
            guitarMesh.renderOrder = 10;
            guitarMesh.position.set(0.3, 1.0, 0.2);
            guitarMesh.scale.set(1.5, 1.5, 1);
            player.add(guitarMesh);
        }
        guitarMesh.visible = true;
    } else {
        if (guitarMesh) guitarMesh.visible = false;
    }

    showToast(isGuitarActive ? "Guitar Equipped!" : "Guitar Unequipped");
}

function toggleGlove() {
    if (!saveState.hasGlove) {
        showToast("You don't own the Glove! Check the Stylist.");
        return;
    }

    // Unequip other items
    if (isGuitarActive) {
        isGuitarActive = false;
        stopMidi();
        const g = player.getObjectByName('guitarMesh');
        if (g) g.visible = false;
        const ui = document.getElementById('guitar-ui');
        if (ui) ui.style.display = 'none';
    }

    if (localHeldFish) {
        localHeldFish = null;
        if (fishHoldTimer) clearTimeout(fishHoldTimer);
        fishHoldTimer = null;
        updateLocalVisuals();
    }

    if (!isGloveActive && fishingState !== 'idle') {
        stopFishing(false);
    }

    isGloveActive = !isGloveActive;

    const rod = player.getObjectByName('rod');
    if (rod) rod.visible = !isGuitarActive && !isGloveActive;

    let gloveMesh = player.getObjectByName('gloveMesh');
    if (isGloveActive) {
        if (!gloveMesh) {
            const c = document.createElement('canvas'); c.width = 64; c.height = 64;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#cc0000'; ctx.beginPath(); ctx.arc(32, 32, 20, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#990000'; ctx.beginPath(); ctx.arc(20, 40, 10, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.fillRect(35, 20, 10, 2); ctx.fillRect(35, 25, 10, 2); ctx.fillRect(35, 30, 10, 2);

            const tex = new THREE.CanvasTexture(c);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;

            // --- FIX: AlphaTest added ---
            const mat = new THREE.SpriteMaterial({
                map: tex,
                transparent: true,
                alphaTest: 0.5
            });

            gloveMesh = new THREE.Sprite(mat);
            gloveMesh.name = 'gloveMesh';
            gloveMesh.position.set(0.6, 1.0, 0.5);
            gloveMesh.scale.set(1.2, 1.2, 1);
            player.add(gloveMesh);
        }
        gloveMesh.visible = true;
    } else {
        if (gloveMesh) gloveMesh.visible = false;
    }

    showToast(isGloveActive ? "Glove Equipped!" : "Glove Unequipped");
}




// --- MIDI PLAYBACK SYSTEM ---
const MAX_MIDI_NOTES = 200000;
const MAX_NOTES_PER_SEC = 15;

function handleMidiUpload(files) {
    if (files.length === 0) return;
    const file = files[0];

    // 1. SECURITY: File Size Check (Max 512KB)
    // Prevents "Zip Bombs" or massive files crashing the browser memory
    if (file.size > 512 * 1024) {
        showToast("File too large! Max 512KB.");
        return;
    }

    // 2. SECURITY: Basic Extension Check
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.mid') && !fileName.endsWith('.midi')) {
        showToast("Invalid file type. Only .mid allowed.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const arrayBuffer = e.target.result;

            // 3. SECURITY: Magic Number Validation (Deep Check)
            // A real MIDI file MUST start with the hex bytes: 4D 54 68 64 ("MThd")
            // If someone renames 'virus.exe' to 'song.mid', this check will catch it.
            if (arrayBuffer.byteLength < 4) {
                throw new Error("File too small.");
            }

            const view = new DataView(arrayBuffer);
            if (view.getUint8(0) !== 0x4D ||
                view.getUint8(1) !== 0x54 ||
                view.getUint8(2) !== 0x68 ||
                view.getUint8(3) !== 0x64) {

                showToast("Security Block: Not a valid MIDI file.");
                console.warn("Security Alert: User attempted to upload a non-MIDI file.");
                return;
            }

            // 4. Safe Parsing
            // If the structure is corrupted, Tone.js will throw an error, which we catch.
            const midi = new Midi(arrayBuffer);

            let totalNotes = 0;
            midi.tracks.forEach(t => totalNotes += t.notes.length);

            // 5. SECURITY: Complexity Limit
            // Prevents files with millions of notes from freezing the game loop
            if (totalNotes > MAX_MIDI_NOTES) {
                showToast(`Too many notes! (${totalNotes}/${MAX_MIDI_NOTES})`);
                return;
            }

            playMidi(midi);
            document.getElementById('midi-status').innerText = "Playing: " + file.name.substring(0, 20);

        } catch (err) {
            console.error("MIDI Parse Error:", err);
            showToast("Invalid or Corrupted MIDI file.");
        }
    };

    // Read as ArrayBuffer allows us to check the raw bytes securely
    reader.readAsArrayBuffer(file);
}

function playMidi(midi) {
    stopMidi();


    let notes = [];
    midi.tracks.forEach(track => {
        track.notes.forEach(note => {
            notes.push({
                time: note.time,
                freq: Math.pow(2, (note.midi - 69) / 12) * 440
            });
        });
    });


    notes.sort((a, b) => a.time - b.time);

    activeMidiNotes = notes;
    midiStartTime = audioCtx.currentTime;


    midiInterval = setInterval(updateMidiLoop, 20);
}

function updateMidiLoop() {
    if (!isGuitarActive || activeMidiNotes.length === 0) return;
    const now = audioCtx.currentTime;
    const elapsedTime = now - midiStartTime;
    let sentCount = 0;

    for (let i = activeMidiNotes.length - 1; i >= 0; i--) {
        const note = activeMidiNotes[i];
        if (note.time <= elapsedTime) {
            Sound.playSpatial('guitar', player.position, note.freq);

            // Limit to 2 notes per tick to prevent flooding
            if (sentCount < 2) {
                const msg = {
                    type: 'sound',
                    name: 'guitar',
                    pos: { x: player.position.x, y: player.position.y, z: player.position.z },
                    var: note.freq
                };

                // FIX: Prioritize Dedicated Server and check ReadyState
                if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
                    dedicatedSocket.send(JSON.stringify(msg));
                }
                else if (isHost) {
                    broadcastToClients(msg);
                }
                else if (hostConn && hostConn.open) {
                    hostConn.send(msg);
                }

                sentCount++;
            }
            activeMidiNotes.splice(i, 1);
        }
    }

    if (activeMidiNotes.length === 0) {
        stopMidi();
        document.getElementById('midi-status').innerText = "Finished.";
    }
}

function stopMidi() {
    if (midiInterval) clearInterval(midiInterval);
    activeMidiNotes = [];
    document.getElementById('midi-status').innerText = "Stopped.";
}

function buyAutoReelUpgrade(price) {
    if (saveState.money >= price) {
        saveState.money -= price;
        saveState.autoReelLevel++;
        saveGame();
        Sound.sell();
        renderBaitShop();
        showToast(`Upgraded Auto-Reel to Level ${saveState.autoReelLevel}!`);
    } else {
        showToast("Not enough money!");
    }
}

function buyClickPowerUpgrade(cost) {
    if (saveState.money >= cost) {
        saveState.money -= cost;
        saveState.clickPowerLevel++;
        saveGame();
        Sound.sell();
        renderBaitShop();
        showToast(`Click Power Upgraded to Level ${saveState.clickPowerLevel}!`);
    } else {
        showToast("Not enough money!");
    }
}

function buyHat(hat) {
    if (saveState.money >= hat.price) {
        saveState.money -= hat.price;
        saveState.unlockedHats.push(hat.id);
        Sound.sell();
        saveGame();
        renderShop();
    } else { showToast("Not enough money!"); }
}

function buyBait(bait) {
    if (saveState.money >= bait.price) {
        saveState.money -= bait.price;
        if (!saveState.baitInventory[bait.id]) saveState.baitInventory[bait.id] = 0;
        saveState.baitInventory[bait.id] += 10;
        Sound.sell();
        saveGame();
        renderBaitShop();
        updateBaitSelector();
    } else { showToast("Not enough money!"); }
}

function equipHat(hatId) {
    saveState.currentHat = hatId;
    saveGame();
    renderShop();
    updateLocalVisuals();
}

// Handles input from the mobile zoom slider.
window.handleMobileZoom = function (value) {
    // The slider value is 0 to 1. We need to map it to MAX_ZOOM to MIN_ZOOM.
    // Since a lower slider value should mean more zoomed in (smaller cameraDistance), we reverse the mapping.
    const newDist = MAX_ZOOM - (value * (MAX_ZOOM - MIN_ZOOM));
    cameraDistance = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newDist));
}

function updateBaitSelector() {
    const sel = document.getElementById('bait-select');
    sel.innerHTML = '';

    let opt = document.createElement('option');
    opt.value = 'none'; opt.text = "None (Inf)";
    sel.appendChild(opt);

    Object.keys(saveState.baitInventory).forEach(bid => {
        const count = saveState.baitInventory[bid];
        // Keep option if count > 0 OR if it is the currently active bait.
        // This prevents the "mid-air switch" when using the last bait.
        if (count > 0 || bid === activeBaitId) {
            const bType = BAIT_TYPES.find(b => b.id === bid);
            if (bType) {
                let o = document.createElement('option');
                o.value = bid;
                o.text = `${bType.name} (${count})`;
                sel.appendChild(o);
            }
        }
    });
    sel.value = activeBaitId;

    // Fallback: Only reset if the bait is truly invalid/missing.
    if (sel.value === "" && activeBaitId !== 'none') {
        activeBaitId = 'none';
        sel.value = 'none';
    }
}

function createPortalTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');

    const grd = ctx.createRadialGradient(64, 64, 5, 64, 64, 60);
    grd.addColorStop(0, 'black');
    grd.addColorStop(0.5, '#4b0082');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);

    ctx.strokeStyle = '#9400D3';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(64, 64, 10 + i * 8, i, i + Math.PI);
        ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    // --- FILTER FIX ---
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    // ------------------

    return tex;
}

function spawnPortal(x, z, fromNetwork = false) {
    if (voidPortalMesh) scene.remove(voidPortalMesh);

    const tex = createPortalTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    voidPortalMesh = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), mat);
    voidPortalMesh.rotation.x = -Math.PI / 2;
    voidPortalMesh.position.set(x, 0.2, z);
    scene.add(voidPortalMesh);

    portalDespawnTime = Date.now() + 120000;

    showToast("🌌 A Void Portal has opened!");
    broadcastSound('magic', { x: x, y: 0, z: z });

    // FIX: Send to Dedicated Server if connected
    if (!fromNetwork) {
        const msg = { type: 'spawnPortal', x: x, z: z };

        // PRIORITIZE DEDICATED
        if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
            dedicatedSocket.send(JSON.stringify(msg));
        }
        else if (isHost) {
            broadcastToClients(msg);
        }
    }
}

function enterLavaWorld() {
    isInLavaWorld = true;
    isInVoid = false;

    // Teleport Player
    player.position.set(-20000 + 40, 2, 0); // Edge of lava island
    player.lookAt(-20000, 2, 0); // Look at lava lake
    playerVelocity.set(0, 0, 0);

    // Visuals
    scene.background = new THREE.Color(0x220000); // Dark Red Sky
    scene.fog = new THREE.Fog(0x220000, 10, 80);

    showToast("🔥 Welcome to the Lava World!");
    updateWeatherVisuals();
}

function exitLavaWorld() {
    isInLavaWorld = false;
    respawnPlayer(); // Returns to main island
}

function enterVoid() {
    if (isInVoid) return;
    isInVoid = true;

    // Save last position just in case, though Respawn will reset to default
    lastIslandPos.copy(player.position);

    // Teleport to Void
    player.position.set(10000, 2002, 10000);
    playerVelocity.y = 0;

    // Visuals
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 10, 50);

    if (!voidFloorMesh) {
        voidFloorMesh = new THREE.Mesh(
            new THREE.CircleGeometry(40, 32),
            new THREE.MeshBasicMaterial({ color: 0x111111 })
        );
        voidFloorMesh.rotation.x = -Math.PI / 2;
        voidFloorMesh.position.set(10000, 2000, 10000);
        scene.add(voidFloorMesh);
    }

    showToast("Entered the Void.");
    updateWeatherVisuals();
}

window.respawnPlayer = function () {
    // Reset Void State
    isInVoid = false;
    isInLavaWorld = false;

    // Reset Visuals to Island
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

    // Reset Player Physics & Position
    if (player) {
        player.position.set(25, 2, 0); // Default spawn point
        playerVelocity.set(0, 0, 0);
        knockbackVelocity.set(0, 0, 0);
    }

    // Set cooldown so we don't instantly teleport back if a portal is nearby
    portalCooldown = Date.now() + 5000;

    // Close Options Menu
    toggleOptions();
    showToast("Respawned!");
    updateWeatherVisuals();
}

window.exitVoid = function () {
    if (!isInVoid) return;
    isInVoid = false;

    player.position.copy(lastIslandPos);
    player.position.y = 0.5;
    playerVelocity.y = 0;

    portalCooldown = Date.now() + 3000;

    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

    document.getElementById('btn-void-respawn').style.display = 'none';
}

async function promptAdminLogin() {
    const pw = prompt("Enter admin password (obfuscated login).");
    if (!pw) return;

    const ok = await dedicatedAdminLogin(pw);

    if (ok) {
        alert("Admin login successful.");

        // Show the Host Panel Shield
        document.getElementById('btn-host-panel').style.display = 'block';

        // HIDE the Admin Login Button
        document.getElementById('btn-admin-login').style.display = 'none';

        updateHostPanel();
    }
    else {
        alert("Admin login failed.");
    }
}


// New function to handle unbanning
function promptUnbanIP() {
    if (!isConnectedToDedicated || !isAdminOnDedicated) return;
    const ip = prompt("Enter IP address to unban:");
    if (ip) {
        dedicatedSocket.send(JSON.stringify({
            type: 'admin_cmd',
            cmd: 'unban',
            ip: ip.trim()
        }));
    }
}

function togglePlayerList() {
    const ui = document.getElementById('player-list-overlay');
    ui.style.display = ui.style.display === 'flex' ? 'none' : 'flex';
    if (ui.style.display === 'flex') renderPlayerList();
}

function renderPlayerList() {
    const container = document.getElementById('public-player-list');
    container.innerHTML = '';

    // 1. Add Self (Information only)
    const myRow = document.createElement('div');
    myRow.style.background = 'rgba(255, 255, 255, 0.1)';
    myRow.style.padding = '10px'; myRow.style.borderRadius = '8px';
    myRow.style.color = '#44ff44'; myRow.style.fontWeight = 'bold';
    myRow.innerText = `${saveState.displayName} (You)`;
    container.appendChild(myRow);

    // 2. Add Other Players
    Object.keys(otherPlayers).forEach(pid => {
        const p = otherPlayers[pid];
        const row = document.createElement('div');
        row.style.background = 'rgba(255, 255, 255, 0.05)';
        row.style.padding = '10px';
        row.style.borderRadius = '8px';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';

        // Name
        const name = document.createElement('div');
        name.innerText = p.lastData.name || "Unknown";
        name.style.fontWeight = 'bold';

        // Buttons Container
        const actions = document.createElement('div');
        actions.style.display = 'flex'; actions.style.gap = '5px';

        // Voice Mute Button
        const isVoiceMuted = localMutedVoice.includes(pid);
        const btnVoice = document.createElement('button');
        btnVoice.className = 'btn-sm';
        btnVoice.style.backgroundColor = isVoiceMuted ? '#cc0000' : '#444';
        btnVoice.innerText = isVoiceMuted ? "🔇 Voice" : "🎙️ Voice";
        btnVoice.onclick = () => toggleLocalMute(pid, 'voice');

        // Chat Mute Button
        const isChatMuted = localMutedChat.includes(pid);
        const btnChat = document.createElement('button');
        btnChat.className = 'btn-sm';
        btnChat.style.backgroundColor = isChatMuted ? '#cc0000' : '#444';
        btnChat.innerText = isChatMuted ? "🚫 Chat" : "💬 Chat";
        btnChat.onclick = () => toggleLocalMute(pid, 'chat');

        const isMidiMuted = localMutedMidi.includes(pid);
        const btnMidi = document.createElement('button');
        btnMidi.className = 'btn-sm';
        btnMidi.style.backgroundColor = isMidiMuted ? '#cc0000' : '#444';
        btnMidi.innerText = isMidiMuted ? "🔇 MIDI" : "🎸 MIDI";
        btnMidi.onclick = () => toggleLocalMute(pid, 'midi');
        // ----------------------------------

        actions.appendChild(btnVoice);
        actions.appendChild(btnChat);
        actions.appendChild(btnMidi);

        row.appendChild(name);
        row.appendChild(actions);
        container.appendChild(row);
    });

    if (Object.keys(otherPlayers).length === 0) {
        const empty = document.createElement('div');
        empty.innerText = "No other fishers here.";
        empty.style.color = '#888'; empty.style.fontStyle = 'italic';
        container.appendChild(empty);
    }
}

function toggleLocalMute(pid, type) {
    if (type === 'voice') {
        if (localMutedVoice.includes(pid)) localMutedVoice = localMutedVoice.filter(id => id !== pid);
        else localMutedVoice.push(pid);
    } else if (type === 'chat') {
        if (localMutedChat.includes(pid)) localMutedChat = localMutedChat.filter(id => id !== pid);
        else localMutedChat.push(pid);
    }
    // --- ADD THIS ---
    else if (type === 'midi') {
        if (localMutedMidi.includes(pid)) localMutedMidi = localMutedMidi.filter(id => id !== pid);
        else localMutedMidi.push(pid);
    }
    // ----------------
    renderPlayerList();
}

// Updated Host Panel
function updateHostPanel() {
    const container = document.getElementById('host-player-list');
    container.innerHTML = '';

    if (isHost || isAdminOnDedicated) {
        const adminDiv = document.createElement('div');
        adminDiv.style.marginBottom = '15px';
        adminDiv.style.paddingBottom = '10px';
        adminDiv.style.borderBottom = '1px solid #444';
        adminDiv.style.textAlign = 'center';

        const btnMoney = document.createElement('button');
        btnMoney.className = 'btn-lg btn-green';
        btnMoney.innerText = "💰 Give Self $1000";
        btnMoney.style.fontSize = "14px";
        btnMoney.style.width = "100%";
        btnMoney.onclick = () => {
            saveState.money += 1000;
            saveGame();
            Sound.sell();
            updateUI();
            showToast("Admin Abuse: +$1000");
        };
        adminDiv.appendChild(btnMoney);

        const btnPortal = document.createElement('button');
        btnPortal.className = 'btn-lg';
        btnPortal.style.background = '#4b0082';
        btnPortal.style.marginTop = '5px';
        btnPortal.innerText = "🌀 Spawn Portal";
        btnPortal.onclick = () => {
            // Check network mode
            if (isConnectedToDedicated && isAdminOnDedicated) {
                dedicatedSocket.send(JSON.stringify({ type: 'admin_cmd', cmd: 'spawnPortal' }));
            } else {
                const x = player.position.x + 5;
                const z = player.position.z;
                spawnPortal(x, z);
            }
        };
        adminDiv.appendChild(btnPortal);

        // --- NEW UNBAN BUTTON ---
        if (isConnectedToDedicated && isAdminOnDedicated) {
            const btnUnban = document.createElement('button');
            btnUnban.className = 'btn-lg';
            btnUnban.style.background = '#006400';
            btnUnban.style.marginTop = '5px';
            btnUnban.innerText = "🔓 Unban IP";
            btnUnban.onclick = promptUnbanIP;
            adminDiv.appendChild(btnUnban);
        }
        // ------------------------

        container.appendChild(adminDiv);
    }

    // ... (rest of the player list loop remains the same) ...
    Object.keys(otherPlayers).forEach(pid => {
        // ... existing row creation code ...
        const p = otherPlayers[pid];
        const row = document.createElement('div');
        row.className = 'host-player-row';
        const name = document.createElement('div');
        name.className = 'host-player-name';
        name.innerText = p.lastData.name || "Unknown";

        const actions = document.createElement('div');
        actions.className = 'host-actions';

        const btnGhost = document.createElement('button');
        btnGhost.className = 'btn-sm';
        btnGhost.style.background = '#4b0082';
        btnGhost.innerText = "👻 Haunt";
        btnGhost.onclick = () => triggerHaunt(pid);

        const isVM = mutedVoicePeers.includes(pid);
        const btnVoice = document.createElement('button');
        btnVoice.className = isVM ? 'btn-sm btn-danger' : 'btn-sm';
        btnVoice.innerText = isVM ? "🔇 No Voice" : "🎙️ Mute Voice";
        btnVoice.onclick = () => toggleGlobalMute(pid, 'voice');

        const isCM = mutedChatPeers.includes(pid);
        const btnChat = document.createElement('button');
        btnChat.className = isCM ? 'btn-sm btn-danger' : 'btn-sm';
        btnChat.innerText = isCM ? "🚫 No Chat" : "💬 Mute Chat";
        btnChat.onclick = () => toggleGlobalMute(pid, 'chat');

        const isGlobalMidiMuted = p.lastData && p.lastData.isMidiMuted;

        const btnMidi = document.createElement('button');
        btnMidi.className = isGlobalMidiMuted ? 'btn-sm btn-danger' : 'btn-sm';
        btnMidi.innerText = isGlobalMidiMuted ? "🔇 No MIDI" : "🎸 Mute MIDI";
        btnMidi.onclick = () => toggleGlobalMute(pid, 'midi');

        const btnKick = document.createElement('button');
        btnKick.className = 'btn-sm btn-warn';
        btnKick.innerText = "👢 Kick";
        btnKick.onclick = () => kickPeer(pid);

        const btnBan = document.createElement('button');
        btnBan.className = 'btn-sm btn-danger';
        btnBan.innerText = "🔨 Ban";
        btnBan.onclick = () => banPeer(pid);

        actions.appendChild(btnGhost);
        actions.appendChild(btnVoice);
        actions.appendChild(btnChat);
        actions.appendChild(btnMidi);
        actions.appendChild(btnKick);
        actions.appendChild(btnBan);


        row.appendChild(name);
        row.appendChild(actions);
        container.appendChild(row);
    });
}

function kickPeer(pid) {
    // 1. Dedicated Server Logic (PRIORITY)
    // If we are connected to the official server, we MUST send the command there.
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({
            type: 'admin_cmd',
            cmd: 'kick',
            targetId: pid
        }));
        showToast(`Kicking ${pid}...`);
        return;
    }

    // 2. PeerJS (P2P) Host Logic (For private rooms)
    const conn = clientConns[pid];
    if (conn) {
        conn.send({ type: 'error', message: "You have been kicked by the host." });
        setTimeout(() => {
            conn.close();
            removePlayer(pid);
            broadcastPlayerList();
            updateHostPanel();
        }, 500);
    }
}

function banPeer(pid) {
    // 1. Dedicated Server Logic (PRIORITY)
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({
            type: 'admin_cmd',
            cmd: 'ban',
            targetId: pid
        }));
        showToast(`Banning ${pid}...`);
        return;
    }

    // 2. PeerJS (P2P) Host Logic (For private rooms)
    if (!bannedPeers.includes(pid)) bannedPeers.push(pid);

    broadcastToClients({ type: 'purge_chat', targetId: pid });

    const conn = clientConns[pid];
    if (conn) {
        if (conn.deviceID) {
            const list = JSON.parse(sessionStorage.getItem('banned_ids') || '[]');
            if (!list.includes(conn.deviceID)) {
                list.push(conn.deviceID);
                sessionStorage.setItem('banned_ids', JSON.stringify(list));
            }
        }

        conn.send({ type: 'error', message: "You have been banned from this room." });
        setTimeout(() => {
            conn.close();
            removePlayer(pid);
            broadcastPlayerList();
            updateHostPanel();
        }, 500);
    }
}

function toggleGlobalMute(pid, type) {
    // 1. DEDICATED SERVER ADMIN LOGIC
    if (isConnectedToDedicated && isAdminOnDedicated) {
        if (dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {

            // Map 'midi' type to 'mute_midi' command
            let cmd = 'mute_chat';
            if (type === 'voice') cmd = 'mute_voice';
            if (type === 'midi') cmd = 'mute_midi'; // <--- ADD THIS

            dedicatedSocket.send(JSON.stringify({
                type: 'admin_cmd',
                cmd: cmd,
                targetId: pid
            }));
            showToast(`Sent ${type} mute command for ${pid}`);
        }
        return;
    }

    // 2. P2P HOST LOGIC
    if (!isHost) return;

    if (type === 'voice') {
        if (mutedVoicePeers.includes(pid)) mutedVoicePeers = mutedVoicePeers.filter(id => id !== pid);
        else mutedVoicePeers.push(pid);
    } else {
        if (mutedChatPeers.includes(pid)) mutedChatPeers = mutedChatPeers.filter(id => id !== pid);
        else mutedChatPeers.push(pid);
    }

    // Refresh UI and Notify Players
    updateHostPanel();
    broadcastPlayerList(); // Critical: Tells everyone else this person is muted
    showToast(`${type.toUpperCase()} Mute toggled.`);
}

