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

const createOscGain = (freq, type = 'sine') => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.connect(gain);
    return { osc, gain };
};

const createNoiseGain = (duration) => {
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    noise.buffer = buffer;
    noise.connect(gain);
    return { noise, gain };
};

const createPanner = (pos) => {
    const panner = audioCtx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = 1;
    panner.maxDistance = MAX_VOICE_DISTANCE;
    panner.rolloffFactor = 1;
    if (pos) {
        panner.positionX.value = pos.x;
        panner.positionY.value = pos.y;
        panner.positionZ.value = pos.z;
    }
    return panner;
};

// --- AUDIO LISTENER ---
// Panners place sounds in world space, so the listener has to sit on the local
// player's ears. It was never moved off the origin, which meant distance
// attenuation was measured from (0,0,0): sounds got quieter the farther the
// player was from the map centre, regardless of who made them.
function updateAudioListener(cam) {
    if (!audioCtx || !cam || !cam.position) return;
    const l = audioCtx.listener;
    if (!l) return;
    const now = audioCtx.currentTime;
    // Ears sit on the player (third-person camera hangs behind them), so the
    // player's own footsteps/meows are not attenuated by the camera offset.
    const p = (typeof player !== 'undefined' && player && player.position)
        ? { x: player.position.x, y: player.position.y + 1.5, z: player.position.z }
        : cam.position;
    const m = cam.matrixWorld && cam.matrixWorld.elements;
    // Camera basis: +X right, +Y up, -Z forward.
    const fx = m ? -m[8] : 0, fy = m ? -m[9] : 0, fz = m ? -m[10] : -1;
    const ux = m ? m[4] : 0, uy = m ? m[5] : 1, uz = m ? m[6] : 0;
    if (l.positionX) {
        // Smooth so teleports/quick camera snaps do not click.
        l.positionX.setTargetAtTime(p.x, now, 0.02);
        l.positionY.setTargetAtTime(p.y, now, 0.02);
        l.positionZ.setTargetAtTime(p.z, now, 0.02);
        l.forwardX.setTargetAtTime(fx, now, 0.02);
        l.forwardY.setTargetAtTime(fy, now, 0.02);
        l.forwardZ.setTargetAtTime(fz, now, 0.02);
        l.upX.setTargetAtTime(ux, now, 0.02);
        l.upY.setTargetAtTime(uy, now, 0.02);
        l.upZ.setTargetAtTime(uz, now, 0.02);
    } else {
        l.setPosition(p.x, p.y, p.z);
        l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
}
window.updateAudioListener = updateAudioListener;

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
            const { osc, gain } = createOscGain(150, 'square');
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            nodes = { output: gain };
        }

        else if (soundName === 'footstep') {
            const { noise, gain } = createNoiseGain(0.1);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            noise.start();
            nodes = { output: gain };
        }

        else if (soundName === 'swim') {
            const { noise, gain } = createNoiseGain(0.18);
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 600;
            filter.Q.value = 0.7;
            noise.disconnect();
            noise.connect(filter);
            filter.connect(gain);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            noise.start();
            nodes = { output: gain };
        }

        else if (soundName === 'scratch') {
            // Dry scratch of a coin on card stock: a short band-passed noise
            // burst. `variant` shifts the band so repeated strokes do not sound
            // like a machine gun.
            const { noise, gain } = createNoiseGain(0.07);
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1600 + (variant % 3) * 700;
            filter.Q.value = 0.8;
            noise.disconnect();
            noise.connect(filter);
            filter.connect(gain);
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
            noise.start();
            nodes = { output: gain };
        }

        else if (['jump', 'cast', 'splash', 'meow', 'chat', 'reel', 'sail'].includes(soundName)) {
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
            else if (soundName === 'sail') {
                // A single oar stroke: a soft splash with a short watery tail.
                const { noise, gain } = createNoiseGain(0.4);
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(1100, now);
                filter.frequency.exponentialRampToValueAtTime(250, now + 0.35);
                gain.gain.setValueAtTime(0.14, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                noise.connect(filter);
                noise.start();
                nodes = { output: filter };
            }
        }

        // One syllable of the Animal Crossing-style chat voice. `variant` picks a
        // semitone (0-11) so each speaker keeps a stable voice and each character
        // gets a small melodic wobble. The panner below supplies the distance
        // falloff, so the voice fades with proximity like every other world sound.
        else if (soundName === 'talk') {
            const step = (((Number(variant) || 0) % 12) + 12) % 12;
            const base = 300 * Math.pow(2, step / 12);
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(base * 2.4, now);
            filter.Q.value = 1.4;
            osc.type = 'square';
            osc.frequency.setValueAtTime(base * 1.08, now);
            osc.frequency.exponentialRampToValueAtTime(base * 0.8, now + 0.075);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.06, now + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
            osc.connect(filter);
            filter.connect(gain);
            osc.start(now);
            osc.stop(now + 0.09);
            nodes = { output: gain };
        }

        else if (soundName === 'catch') {
            // The fanfare's four notes share one output node, so it goes through
            // the panner below like every other sound. (It used to connect
            // straight to the SFX bus, which made it audible across the whole
            // map.)
            const out = audioCtx.createGain();
            out.gain.setValueAtTime(1, now);
            [440, 554, 659, 880].forEach((f, i) => {
                const osc = audioCtx.createOscillator(); osc.type = 'triangle'; const gain = audioCtx.createGain();
                osc.frequency.setValueAtTime(f, now + i * 0.1); gain.gain.setValueAtTime(0.1, now + i * 0.1); gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
                osc.connect(gain);
                gain.connect(out);
                osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.3);
            });
            nodes = { output: out };
        }


        if (nodes) {
            if (pos) {
                const panner = createPanner(pos);
                nodes.output.connect(panner);
                panner.connect(targetGain);
            } else {
                nodes.output.connect(targetGain);
            }
        }
    },
    sell: () => {
        const now = audioCtx.currentTime;

        const { osc: o1, gain: g1 } = createOscGain(1000);
        g1.gain.setValueAtTime(0.1, now);
        g1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        g1.connect(sfxGain);
        o1.start();
        o1.stop(now + 0.1);

        const { osc: o2, gain: g2 } = createOscGain(1500);
        g2.gain.setValueAtTime(0.1, now + 0.1);
        g2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        g2.connect(sfxGain);
        o2.start(now + 0.1);
        o2.stop(now + 0.3);
    },
    // Rising three-note fanfare for achievement unlocks.
    achievement: () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        const notes = [659.25, 830.61, 987.77]; // E5, G#5, B5
        notes.forEach((freq, i) => {
            const { osc, gain } = createOscGain(freq);
            const t = now + i * 0.12;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
            gain.connect(sfxGain);
            osc.start(t);
            osc.stop(t + 0.35);
        });
    }
};

// --- CONTINUOUS SAIL AUDIO ---
// A soft looping water sound while the local player is rowing. Created lazily
// on first use, ramped in/out so boarding and stepping ashore never click.
const SailAudio = {
    noise: null, filter: null, gain: null, active: false,

    ensure: () => {
        if (SailAudio.gain) return;
        // Brown-ish noise reads as moving water better than white noise.
        const len = audioCtx.sampleRate * 2;
        const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            last = (last + 0.02 * w) / 1.02;
            d[i] = last * 3.5;
        }
        SailAudio.noise = audioCtx.createBufferSource();
        SailAudio.noise.buffer = buf;
        SailAudio.noise.loop = true;
        SailAudio.filter = audioCtx.createBiquadFilter();
        SailAudio.filter.type = 'lowpass';
        SailAudio.filter.frequency.value = 500;
        SailAudio.gain = audioCtx.createGain();
        SailAudio.gain.gain.value = 0;
        SailAudio.noise.connect(SailAudio.filter);
        SailAudio.filter.connect(SailAudio.gain);
        SailAudio.gain.connect(sfxGain);
        SailAudio.noise.start();
    },

    /** Turn the rowing loop on/off. Safe to call every frame. */
    setActive: (on) => {
        if (on) {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            SailAudio.ensure();
            if (SailAudio.active) return;
            SailAudio.active = true;
            SailAudio.noise.playbackRate.value = 0.9 + Math.random() * 0.2;
            SailAudio.gain.gain.cancelScheduledValues(audioCtx.currentTime);
            SailAudio.gain.gain.setTargetAtTime(0.06, audioCtx.currentTime, 0.4);
        } else if (SailAudio.active) {
            SailAudio.active = false;
            SailAudio.gain.gain.cancelScheduledValues(audioCtx.currentTime);
            SailAudio.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.25);
        }
    }
};

// --- DYNAMIC MUSIC SYSTEM ---
// --- FILE-BASED MUSIC SYSTEM ---
const Music = {
    audio: new Audio(),
    playlist: [
        "cuddle-clouds.ogg",
        "drifting-memories.ogg",
        "evening-harmony.ogg",
        "floating-dream.ogg",
        "forgotten-biomes.ogg",
        "gentle-breeze.ogg",
        "golden-gleam.ogg",
        "gymnopedie-no1.ogg",
        "minuet-slower.ogg",
        "minuet.ogg",
        "polar-lights.ogg",
        "strange-worlds.ogg",
        "sunlight-through-leaves.ogg",
        "tales-from-the-vienna-woods.ogg",
        "wanderers-tale.ogg",
        "whispering-woods.ogg"
    ],
    lastSongIndex: -1,
    isPlaying: false,
    sourceNode: null,

    init: () => {
        if (saveState.musicMuted) return;

        // Connect HTML Audio to Web Audio API for volume control
        // Only do this once
        if (!Music.sourceNode) {
            Music.sourceNode = audioCtx.createMediaElementSource(Music.audio);
            Music.sourceNode.connect(masterGain); // Or create a dedicated musicGain node
        }

        Music.audio.addEventListener('ended', Music.playRandomNext);
        Music.playRandomNext();
        Music.isPlaying = true;
    },

    playRandomNext: () => {
        if (saveState.musicMuted) return;

        let nextIndex;
        // Pick a random song that isn't the last one played
        do {
            nextIndex = Math.floor(Math.random() * Music.playlist.length);
        } while (nextIndex === Music.lastSongIndex && Music.playlist.length > 1);

        Music.lastSongIndex = nextIndex;
        const songName = Music.playlist[nextIndex];

        Music.audio.src = `music/${songName}`;
        Music.audio.volume = 0.2; // Default music volume
        Music.audio.play().catch(e => console.warn("Auto-play blocked or error:", e));
        console.log(`Now Playing: ${songName}`);
    },

    stop: () => {
        Music.isPlaying = false;
        Music.audio.pause();
        Music.audio.currentTime = 0;
    },

    // Resume function called when unmuting
    resume: () => {
        if (Music.isPlaying && Music.audio.paused && !saveState.musicMuted) {
            Music.audio.play();
        } else if (!Music.isPlaying && !saveState.musicMuted) {
            Music.init();
        }
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

    if (isHost) {
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

