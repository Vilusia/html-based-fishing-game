const UICache = { mEl: null, logHeader: null, lEl: null };

function cacheUIElements() {
    UICache.mEl = document.getElementById('money-display');
    UICache.logHeader = document.querySelector('#fish-log b');
    UICache.lEl = document.getElementById('log-content');
}

function updateUI() {
    if (!UICache.mEl) cacheUIElements();

    if (UICache.mEl) UICache.mEl.innerText = `$${saveState.money}`;

    const totalFish = saveState.inventory.length;
    if (UICache.logHeader) UICache.logHeader.innerText = `Inventory (${totalFish}):`;

    if (UICache.lEl) {
        if (totalFish === 0) {
            UICache.lEl.innerHTML = "Empty.";
        } else {
            UICache.lEl.innerHTML = "";
            const fragment = document.createDocumentFragment();

            for (let i = totalFish - 1; i >= 0; i--) {
                const f = saveState.inventory[i];
                const div = document.createElement('div');

                let label = f.name;
                if (f.tierId !== 'normal') label += ` (${f.tierName})`;
                if (f.sizeLabel && f.sizeLabel !== 'Normal') label += ` [${f.sizeLabel}]`;

                div.innerText = label;
                div.style.fontSize = "11px";
                div.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
                fragment.appendChild(div);
            }
            UICache.lEl.appendChild(fragment);
        }
    }
}

function sellFish() {
    if (saveState.inventory.length === 0) { showToast("No fish to sell!"); return; }

    // --- NEW: Server Authority Check ---
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({ type: 'sellFish' }));
        return; // Wait for stateUpdate
    }
    // -----------------------------------

    let totalVal = 0;
    saveState.inventory.forEach(f => totalVal += f.price);
    const count = saveState.inventory.length;
    saveState.money += totalVal;
    saveState.inventory = [];
    saveGame();
    Sound.sell();
    showToast(`Sold ${count} fish for $${totalVal}!`);
    if (npcMerchant) {
        const s = npcMerchant.getObjectByName("playerSprite");
        if (s) { s.scale.set(1.2, 1.2, 1.2); setTimeout(() => { s.scale.set(1, 1, 1); }, 200); }
    }
}

function playSnagSound() {
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start(); osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) { }
}

window.copyRoomId = function () {
    if (!currentRoomId) return;


    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentRoomId)
            .then(() => showToast("Room ID Copied!"))
            .catch(err => {
                console.error("Clipboard API failed, trying fallback...", err);
                copyFallback(currentRoomId);
            });
    } else {

        copyFallback(currentRoomId);
    }
}

function copyFallback(text) {
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;


        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) showToast("Room ID Copied!");
        else showToast("Failed to copy ID.");
    } catch (err) {
        console.error("Fallback copy failed", err);
        showToast("Copy failed. Please select text manually.");
    }
}

function checkMobile() {
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        isMobile = true;


        document.getElementById('mobile-controls').style.display = 'block';

        document.getElementById('instructions').style.display = 'none';


        const baitUI = document.getElementById('bait-ui');
        baitUI.style.bottom = '10px';
        baitUI.style.left = '50%';
        baitUI.style.transform = 'translateX(-50%)';


        document.getElementById('chat-toggle-mobile').onclick = () => {
            const ui = document.getElementById('chat-ui');
            ui.style.display = ui.style.display === 'none' ? 'flex' : 'none';
            if (ui.style.display === 'flex') document.getElementById('chat-input').focus();
        };
        document.getElementById('mic-toggle-mobile').onclick = toggleMic;

        checkOrientation();
        window.addEventListener('resize', checkOrientation);
    }
}

function checkOrientation() {
    const overlay = document.getElementById('rotate-overlay');
    if (!overlay) return;

    // Check if height is greater than width (Portrait Mode)
    if (window.innerHeight > window.innerWidth) {
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

async function initAudio(deviceId = null) {
    try {
        // ADDED NOISE SUPPRESSION AND AUTO GAIN CONTROL in the constraints
        const constraints = {
            audio: deviceId
                ? { deviceId: { exact: deviceId }, noiseSuppression: true, autoGainControl: true }
                : { noiseSuppression: true, autoGainControl: true },
            video: false
        };

        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        localStream = await navigator.mediaDevices.getUserMedia(constraints);

        // --- FIX START: FORCE MUTE STATE IMMEDIATELY ---
        // Browsers open the mic as "enabled" by default. We must
        // sync this with our isMicMuted variable immediately.
        if (isMicMuted) {
            localStream.getAudioTracks().forEach(track => track.enabled = false);
        }
        // --- FIX END -----------------------------------

        // --- PROCESSING STEP ---
        const rawAudioTrack = localStream.getAudioTracks()[0];

        // Determine the audio track to use for broadcasting: processed or raw
        let processedAudioTrack = rawAudioTrack;
        if (typeof applyNoiseFilters === 'function') {
            // Apply Web Audio filters to create a new processed stream's track
            processedAudioTrack = applyNoiseFilters(localStream);
        }

        // --- END PROCESSING STEP ---

        // The processed track is what should be sent via WebRTC
        processedAudioTrack.enabled = !isMicMuted;
        setupVoiceAnalysis(localStream, 'local');

        // Use the processed track for existing connections
        Object.values(voiceConnections).forEach(call => {
            const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'audio');
            if (sender) sender.replaceTrack(processedAudioTrack); // Send the NEW processed track
        });

        // Note: PeerJS uses the track currently inside localStream for new calls.
        // Since PeerJS is simplified here, replacing tracks on existing connections is the primary method.

        updateMicUI();
        console.log("Microphone initialized with Web Audio filters.");
    } catch (err) {
        console.error("Mic Access Failed", err);
        showToast("Mic Error or Denied");
    }
}

function applyNoiseFilters(stream) {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const source = audioCtx.createMediaStreamSource(stream);
    const destination = audioCtx.createMediaStreamDestination();

    // 1. HIGH-PASS FILTER: Removes low-frequency rumble (below 100Hz)
    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 100;

    // 2. LOW-PASS FILTER: Attenuates sharp, high-frequency clicks (above 8000Hz)
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 8000;

    // Chain the nodes: Source -> HighPass -> LowPass -> Destination
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(destination);

    // Return the processed stream's audio track
    return destination.stream.getAudioTracks()[0];
}

async function populateAudioInputs() {
    const select = document.getElementById('mic-select');
    select.innerHTML = '';
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');

        audioInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microphone ${select.length + 1}`;
            select.appendChild(option);
        });

        // Select the previously saved microphone.
        if (saveState.micId) {
            // Check if the saved mic still exists in the list
            const exists = audioInputs.some(d => d.deviceId === saveState.micId);
            if (exists) {
                select.value = saveState.micId;
            } else if (audioInputs.length > 0) {
                // Fallback if saved mic is unplugged
                select.value = audioInputs[0].deviceId;
            }
        }

    } catch (e) { console.error("Error listing devices", e); }
}

window.changeAudioInput = function (deviceId) {
    saveState.micId = deviceId;
    saveGame();
    initAudio(deviceId);
}

function setupVoiceAnalysis(stream, id) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    voiceAnalysers[id] = analyser;
}

function toggleMic() {
    if (!localStream) return;
    isMicMuted = !isMicMuted;
    localStream.getAudioTracks().forEach(track => track.enabled = !isMicMuted);
    updateMicUI();
}

function updateMicUI() {
    const el = document.getElementById('mic-status');
    const mobEl = document.getElementById('mic-toggle-mobile');
    const txt = isMicMuted ? '🔇' : '🎤';
    const col = isMicMuted ? '#ff4444' : '#44ff44';
    if (localStream) {
        if (el) { el.innerText = txt; el.style.color = col; }
        if (mobEl) { mobEl.innerText = txt; mobEl.style.color = col; }
    } else {
        if (el) { el.innerText = '🚫'; el.style.color = '#888'; }
        if (mobEl) { mobEl.innerText = '🚫'; mobEl.style.color = '#888'; }
    }
}

function connectToPeerAudio(remoteId) {
    if (voiceConnections[remoteId]) return;
    if (!localStream) return;
    const call = peer.call(remoteId, localStream);
    handleCall(call);
}

/**
* STRICT SECURITY FIX: Validates image URLs to prevent XSS.
* 1. Forces HTTP/HTTPS protocols (blocks javascript:).
* 2. Uses URL constructor to parse valid URIs.
* 3. Escapes the final output if not an image.
*/
function embedImageIfValid(text) {
    if (!text || typeof text !== 'string') return text;

    try {
        // 1. Attempt to parse as a valid URL
        const url = new URL(text);

        // 2. PROTOCOL WHITELIST: Only allow http and https
        // This blocks 'javascript:', 'data:', 'vbscript:', etc.
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return escapeHTML(text);
        }

        // 3. Extension Check
        const imgPattern = /\.(jpeg|jpg|png|gif|webp)$/i;
        if (url.pathname.match(imgPattern)) {
            // 4. Return safe HTML
            const safeURL = url.href;
            return `<img src="${safeURL}" style="max-width:95%; max-height:200px; display:block; margin:5px auto; border-radius:8px; pointer-events:auto;" loading="lazy" alt="User Image">`;
        }
    } catch (e) {
        // Not a valid URL, treat as standard text
    }

    // Fallback: Return standard escaped text
    return escapeHTML(text);
}

function handleCall(call) {
    const remoteId = call.peer;
    voiceConnections[remoteId] = call;
    call.on('stream', (remoteStream) => {
        let audio = document.getElementById(`audio-${remoteId}`);
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = `audio-${remoteId}`;
            document.body.appendChild(audio);
        }
        audio.srcObject = remoteStream;
        audio.autoplay = true;
        audio.play().catch(e => { });
        setupVoiceAnalysis(remoteStream, remoteId);
    });
    call.on('close', () => {
        const el = document.getElementById(`audio-${remoteId}`);
        if (el) el.remove();
        delete voiceConnections[remoteId];
        delete voiceAnalysers[remoteId];
    });
    call.on('error', (err) => {
        console.error("Call error:", err);
        delete voiceConnections[remoteId];
    });
}

function voiceWatchdog() {
    if (!isConnectedToDedicated) return;

    // 1. WAKE UP AUDIO ENGINE (Fixes silent audio after time)
    if (audioCtx && audioCtx.state === 'suspended') {
        console.log("[Watchdog] Resuming suspended AudioContext...");
        audioCtx.resume();
    }

    // 2. CHECK SIGNALING CONNECTION
    if (peer && peer.disconnected && !peer.destroyed) {
        console.log("[Watchdog] Peer disconnected. Reconnecting...");
        peer.reconnect();
        return; // Wait for reconnect before checking calls
    }

    // 3. CLEAN DEAD CONNECTIONS
    Object.keys(voiceConnections).forEach(peerId => {
        const call = voiceConnections[peerId];
        if (call && call.peerConnection) {
            const state = call.peerConnection.iceConnectionState;
            // Also check for 'closed' signaling state
            if (state === 'failed' || state === 'closed' || state === 'disconnected') {
                console.log(`[Watchdog] Cleaning dead connection: ${peerId} (State: ${state})`);
                try { call.close(); } catch (e) { }
                delete voiceConnections[peerId];

                const playerEntry = Object.values(otherPlayers).find(p => p.voiceId === peerId);
                if (playerEntry) playerEntry.voiceId = null;
            }
        }
    });

    // 4. RETRY MISSING CONNECTIONS
    Object.keys(otherPlayers).forEach(id => {
        const p = otherPlayers[id];
        // Ensure we don't try to call ourselves
        if (p.savedPeerId && p.savedPeerId !== myPeerId) {
            if (!voiceConnections[p.savedPeerId]) {
                console.log(`[Watchdog] Repairing voice to ${p.lastData.name}...`);
                connectToPeerAudio(p.savedPeerId);
                p.voiceId = p.savedPeerId;
            }
        }
    });
}

// Start the watchdog
setInterval(voiceWatchdog, 2000);

function updateVoiceVisuals() {
    const dataArray = new Uint8Array(32);

    // 1. Local Player
    if (voiceAnalysers['local'] && !isMicMuted && player) {
        voiceAnalysers['local'].getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const icon = player.getObjectByName('talkingIcon');
        if (icon) icon.visible = avg > 10;
    } else if (player) {
        const icon = player.getObjectByName('talkingIcon');
        if (icon) icon.visible = false;
    }

    // 2. Remote Players
    Object.keys(otherPlayers).forEach(pid => {
        const p = otherPlayers[pid];
        const analyserId = p.voiceId || pid;

        // CHECK MUTE STATUS
        const isGloballyMuted = p.lastData && p.lastData.isVoiceMuted;
        const isLocallyMuted = localMutedVoice.includes(pid);
        const isMuted = isGloballyMuted || isLocallyMuted;

        let audioEl = document.getElementById(`audio-${analyserId}`);

        if (isMuted) {
            // --- FIX: HARD MUTE ---
            // Setting .muted = true cuts audio instantly, even if stream is active
            if (audioEl) audioEl.muted = true;

            const icon = p.mesh.getObjectByName('talkingIcon');
            if (icon) icon.visible = false;
        }
        else if (voiceAnalysers[analyserId]) {
            // --- UNMUTE IF CLEAN ---
            if (audioEl) audioEl.muted = false;

            voiceAnalysers[analyserId].getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            const icon = p.mesh.getObjectByName('talkingIcon');
            if (icon) icon.visible = avg > 10;

            if (audioEl) {
                const dist = player.position.distanceTo(p.mesh.position);
                if (dist > MAX_VOICE_DISTANCE) {
                    audioEl.volume = 0;
                } else {
                    let vol = 1 - (dist / MAX_VOICE_DISTANCE);
                    vol = vol * saveState.voiceVolume;
                    audioEl.volume = Math.max(0, Math.min(1, vol));
                }
            }
        } else {
            const icon = p.mesh.getObjectByName('talkingIcon');
            if (icon) icon.visible = false;
        }
    });
}

// --- GAME INITIALIZATION & LOBBY ---
window.onload = function () {
    loadSave();
    checkMobile();
    document.getElementById('loading').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';

    setupThreeJS();
    setupInputs();
    animate();
    initAudio();

    document.getElementById('btn-host').onclick = hostGame;
    document.getElementById('btn-join').onclick = joinGame;

    const btnAdmin = document.getElementById('btn-admin-login');
    if (btnAdmin) {
        btnAdmin.style.display = 'none';
        btnAdmin.onclick = toggleHostPanel;
    }

    refreshServerCount();
    setInterval(refreshServerCount, 10000);

    // --- CRITICAL FIX: REMOVED THE 3-SECOND SETNAME INTERVAL ---
    // This interval was causing the "leaving/rejoining" loop.
};

function generateRoomId() { return 'fish-' + Math.floor(1000 + Math.random() * 9000); }
function hostGame() {
    saveGame();
    const roomId = generateRoomId();
    document.getElementById('lobby-status').innerText = "Creating Room...";


    sessionStorage.removeItem('banned_ids');

    peer = new Peer(roomId);
    peer.on('open', (id) => {
        isHost = true; myPeerId = id; currentRoomId = id;

        document.getElementById('room-info-ui').style.display = 'block';
        document.getElementById('room-id-text').innerText = id;
        document.getElementById('start-options').style.display = 'none';
        document.getElementById('host-room-info').style.display = 'block';
        document.getElementById('room-id-display').innerText = id;
        document.getElementById('lobby-screen').style.display = 'none';

        document.getElementById('btn-host-panel').style.display = 'block';

        generateWorld(roomId);
        startGame();
    });

    peer.on('connection', (conn) => {
        // Check if incoming peer is on the ban list for this session.
        const bannedList = JSON.parse(sessionStorage.getItem('banned_ids') || '[]');
        const incomingDeviceID = conn.metadata ? conn.metadata.deviceID : null;

        if ((incomingDeviceID && bannedList.includes(incomingDeviceID)) || bannedPeers.includes(conn.peer)) {
            conn.on('open', () => {
                conn.send({ type: 'error', message: "You are BANNED." });
                setTimeout(() => conn.close(), 500);
            });
            return;
        }

        // Handle "zombie" connections if a player reconnects without the old connection closing properly.
        // If this player is already in the list, it means their old connection died ungracefully.
        if (clientConns[conn.peer]) {
            console.log(`♻️ Replacing stale connection for ${conn.peer}`);
            try {
                clientConns[conn.peer].close();
            } catch (e) { console.warn("Could not close old conn", e); }

            // Remove the old player entity so we can make a fresh one
            removePlayer(conn.peer);
        }

        // Setup new connection handlers.
        conn.on('data', (data) => handleDataFromClient(conn.peer, data));
        conn.on('close', () => {
            // Only remove if this is still the active connection
            if (clientConns[conn.peer] === conn) {

                // --- FIX: P2P HOST PROP REMOVAL ---
                // 1. Find props owned by this peer
                const propsToRemove = activeProps.filter(p => p.owner === conn.peer);

                // 2. Remove them from Host's memory
                activeProps = activeProps.filter(p => p.owner !== conn.peer);

                // 3. Remove visually and tell other clients
                propsToRemove.forEach(p => {
                    removePropFromWorld(p.id); // Remove from Host screen
                    broadcastToClients({ type: 'propRemoved', id: p.id }); // Tell others
                });
                // ----------------------------------

                removePlayer(conn.peer);
                broadcastPlayerList();
                updateHostPanel();
            }
        });


        conn.deviceID = incomingDeviceID;
        clientConns[conn.peer] = conn;

        // Force an immediate update so they don't load into a void
        broadcastPlayerList();
        updateHostPanel();
        showToast("Player Joined!");
    });

    peer.on('call', (call) => {
        if (localStream) call.answer(localStream); else call.answer();
        handleCall(call);
    });
    peer.on('error', (err) => document.getElementById('lobby-status').innerText = "Error: ID taken or Net issue. Try again.");
}

function joinGame() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    saveGame();
    const roomToJoin = document.getElementById('room-id-input').value.trim();
    if (!roomToJoin) return;
    document.getElementById('lobby-status').innerText = "Connecting...";

    // --- FIX: Connection Logic ---
    const connectToHost = () => {
        console.log("Attempting to connect to host:", roomToJoin);
        const conn = peer.connect(roomToJoin);

        conn.on('open', () => {
            console.log("Connected to host!");
            document.getElementById('lobby-status').innerText = "Connected!";
            document.getElementById('lobby-screen').style.display = 'none';

            // Show Room UI
            document.getElementById('room-info-ui').style.display = 'block';
            document.getElementById('room-id-text').innerText = roomToJoin;
            document.getElementById('host-room-info').style.display = 'none'; // Not host

            currentRoomId = roomToJoin;
            isHost = false;
            hostConn = conn;

            // Setup Handlers
            conn.on('data', (data) => handleDataFromHost(data));
            conn.on('close', () => {
                alert("Disconnected from host.");
                location.reload();
            });
            conn.on('error', (err) => console.error("Connection Error:", err));

            // Start Game
            generateWorld(roomToJoin);
            startGame();

            // Send Hello
            conn.send({
                type: 'hello',
                name: saveState.displayName,
                peerId: myPeerId,
                saveState: saveState
            });
            showToast("Joined Room!");
        });

        conn.on('error', (err) => {
            console.error("Peer Connect Error:", err);
            document.getElementById('lobby-status').innerText = "Connection Failed: " + err;
        });
    };

    if (!peer || peer.destroyed) {
        // 1. HARDENED CONFIGURATION
        const peerConfig = {
            debug: 1,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        };

        peer = new Peer(undefined, peerConfig);

        // 2. SIGNALING KEEPALIVE HANDLERS
        peer.on('open', (id) => {
            console.log("My Peer ID is: " + id);
            myPeerId = id;
            if (dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
                dedicatedSocket.send(JSON.stringify({ type: 'setName', name: saveState.displayName, peerId: myPeerId }));
            }
            connectToHost();
        });

        // CRITICAL: Auto-reconnect to signaling server if dropped
        peer.on('disconnected', () => {
            console.log("PeerJS signaling disconnected. Attempting reconnect...");
            peer.reconnect();
        });

        peer.on('error', (err) => {
            console.error("PeerJS Error:", err);
            // If fatal error, try to destroy and recreate after delay
            if (err.type === 'peer-unavailable' || err.type === 'network') {
                setTimeout(() => peer.reconnect(), 5000);
            }
        });

        peer.on('call', (call) => {
            if (localStream) call.answer(localStream); else call.answer();
            handleCall(call);
        });
    } else {
        if (peer.open) connectToHost();
        else peer.on('open', connectToHost);
    }
}

// --- Dedicated Server (WebSocket) client integration ---
// Put this near other networking (after joinGame / hostGame functions)

const DEDICATED_WS_URL = 'wss://invention-attachments-earl-matrix.trycloudflare.com';

let dedicatedSocket = null;
let dedicatedId = null;
let isConnectedToDedicated = false;
let isAdminOnDedicated = false;

async function sha256HexBrowser(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex;
}


function connectToDedicatedServer(customUrl = null) {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    hostConn = null;
    // 1. Reset Sockets
    if (dedicatedSocket) { dedicatedSocket.close(); dedicatedSocket = null; }
    isConnectedToDedicated = false;

    // 2. Initialize PeerJS (Required for Voice Chat)
    if (!peer || peer.destroyed) {
        peer = new Peer();
        peer.on('open', (id) => {
            myPeerId = id;
            // If the socket connects *after* PeerJS is ready, we send the ID then.
            // If socket is already open, send it now.
            if (dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
                dedicatedSocket.send(JSON.stringify({
                    type: 'setName',
                    name: saveState.displayName,
                    peerId: myPeerId,
                    saveState: saveState
                }));
            }
        });
        peer.on('call', (call) => {
            if (localStream) call.answer(localStream); else call.answer();
            handleCall(call);
        });
    }

    // 3. Determine Connection URL
    let url;

    // Logic: Check if customUrl is a valid string (passed from Server Browser)
    // If it's an event object (from a button click) or null, use the default.
    if (customUrl && typeof customUrl === 'string') {
        url = customUrl;
    } else {
        // Fallback to default official server
        url = (window.DEDICATED_SERVER_URL || DEDICATED_WS_URL);
    }

    document.getElementById('lobby-status').innerText = "Connecting...";

    // 4. Create the WebSocket connection
    dedicatedSocket = new WebSocket(url);

    // --- CONNECTION OPEN HANDLER ---
    dedicatedSocket.addEventListener('open', () => {
        isConnectedToDedicated = true;
        document.getElementById('lobby-status').innerText = "Connected!";

        // Send Name AND Voice ID immediately
        const payload = {
            type: 'setName',
            name: saveState.displayName || 'Fisher',
            peerId: myPeerId,
            saveState: saveState
        };
        dedicatedSocket.send(JSON.stringify(payload));

        // UI Setup
        currentRoomId = 'official-server';
        document.getElementById('room-info-ui').style.display = 'block';

        // Update UI Text based on connection type
        const label = (customUrl && typeof customUrl === 'string') ? 'Community' : 'Official';
        document.getElementById('room-id-text').innerText = label;

        document.getElementById('lobby-screen').style.display = 'none';
        isHost = false;

        // Note: generateWorld() and startGame() moved to welcome handler
        showToast("Connected to Server!");
    });

    // --- MESSAGE HANDLER ---
    dedicatedSocket.addEventListener('message', (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }

        // 1. Initial Handshake / Admin Info
        // 1. Initial Handshake / Admin Info
        if (msg.type === 'welcome') {
            dedicatedId = msg.id;
            if (msg.adminSalt) window.lastAdminSalt = msg.adminSalt;
            if (typeof msg.worldTime === 'number') worldTime = msg.worldTime;

            if (msg.activeProps && Array.isArray(msg.activeProps)) {
                // Clear existing remote props to avoid duplicates
                Object.keys(props).forEach(pid => {
                    // Optional: Don't delete your own if you want to keep them local, 
                    // but usually safe to wipe and resync.
                    removePropFromWorld(pid);
                });

                msg.activeProps.forEach(p => spawnPropMesh(p));
            }

            // --- FIX: SYNC RAIN IMMEDIATELY ---
            if (typeof msg.isRaining === 'boolean') {
                isRaining = msg.isRaining;
                updateWeatherVisuals();
                if (isRaining) showToast("It is currently raining.");
            }
            // ----------------------------------

            // FIX: Spawn existing players from server (prevents race condition)
            if (msg.playerList) {
                Object.entries(msg.playerList).forEach(([pid, playerMeta]) => {
                    if (pid !== dedicatedId && !otherPlayers[pid]) {
                        createRemotePlayer(pid, playerMeta);
                    }
                });
            }

            // Start game AFTER worldTime is set
            generateWorld('official');
            generateWorld('official');
            startGame();
        }

        // --- NEW: Handle New Player Joins ---
        else if (msg.type === 'playerJoined') {
            if (msg.id !== dedicatedId && !otherPlayers[msg.id]) {
                createRemotePlayer(msg.id, msg.meta);
                showToast(`${msg.meta.name} joined!`);
            }
        }

        // 2. Player Movement & Visual Updates
        else if (msg.type === 'update') {
            const pid = msg.id;
            if (!pid || pid === dedicatedId) return; // Don't update self

            // FIX: Only update existing players (they should be created by welcome/playerList/playerJoined)
            if (otherPlayers[pid]) {
                updateRemotePlayer(pid, msg.payload);
                otherPlayers[pid].lastSeen = Date.now();
            }
        }

        // 3. Player List Sync (Voice/Mute Status)
        else if (msg.type === 'playerList') {
            const players = Object.values(msg.list || {});
            players.forEach(p => {
                // 1. Create Player if missing (Critical Fix)
                if (p.id !== dedicatedId && !otherPlayers[p.id]) {
                    createRemotePlayer(p.id, p);
                }

                // Voice Chat Logic
                if (p.id !== dedicatedId && p.peerId) {
                    if (otherPlayers[p.id]) {
                        // --- FIX: Save the PeerID for the Watchdog ---
                        // --- FIX: Save the PeerID for the Watchdog ---
                        otherPlayers[p.id].savedPeerId = p.peerId;
                        // ---------------------------------------------

                        // Connect audio if not already connected
                        if (!otherPlayers[p.id].voiceId) {
                            connectToPeerAudio(p.peerId);
                            otherPlayers[p.id].voiceId = p.peerId;
                        }

                        // Sync Mute Flags
                        if (!otherPlayers[p.id].lastData) otherPlayers[p.id].lastData = {};
                        otherPlayers[p.id].lastData.isVoiceMuted = p.isVoiceMuted;
                        otherPlayers[p.id].lastData.isChatMuted = p.isChatMuted;
                        otherPlayers[p.id].lastData.isMidiMuted = p.isMidiMuted;

                        // Immediate Audio Hardware Mute
                        const audioId = otherPlayers[p.id].voiceId;
                        if (audioId) {
                            const el = document.getElementById('audio-' + audioId);
                            if (el && p.isVoiceMuted) el.muted = true;
                        }
                    }
                }

                // Name Tag Update (in case they changed name)
                if (otherPlayers[p.id] && p.name) {
                    const playerEntity = otherPlayers[p.id];
                    if (playerEntity.lastData.name !== p.name) {
                        playerEntity.lastData.name = p.name;
                        const oldNameTag = playerEntity.mesh.getObjectByName('nameTag');
                        if (oldNameTag) {
                            const newTex = createNameTagTexture(p.name);
                            if (oldNameTag.material.map) oldNameTag.material.map.dispose();
                            oldNameTag.material.map = newTex;
                            oldNameTag.material.needsUpdate = true;
                        }
                    }
                }
            });
        }

        // 4. Chat Messages
        else if (msg.type === 'chat') {
            displayChatMessage(msg.name, msg.text, msg.id);
        }

        // 5. Sound Effects (3D Audio)
        else if (msg.type === 'sound') {
            if (msg.name === 'guitar') {
                // Local Mute Check
                if (typeof localMutedMidi !== 'undefined' && localMutedMidi.includes(msg.id)) return;

                // Server Admin Mute Check
                if (otherPlayers[msg.id] && otherPlayers[msg.id].lastData.isMidiMuted) return;
            }
            Sound.playSpatial(msg.name, msg.pos, msg.var);
        }

        // 6. Moderation
        else if (msg.type === 'purge_chat') {
            purgeUserMessages(msg.targetId);
        }

        // 7. Animations (Punching)
        else if (msg.type === 'anim' && msg.anim === 'punch') {
            if (otherPlayers[msg.id]) {
                animatePunch(otherPlayers[msg.id].mesh);
                Sound.playSpatial('punch', otherPlayers[msg.id].mesh.position);
            }
        }
        else if (msg.type === 'punch_hit') {
            handleHit(msg);
        }

        // 8. World Events
        else if (msg.type === 'spawnPortal') spawnPortal(msg.x, msg.z, true);
        else if (msg.type === 'forceGhost') spawnGhostMesh(msg.x, msg.z);

        // 10. Environment (Weather/Time)
        else if (msg.type === 'environment_sync') {
            // Store target time for smooth interpolation in updateDayNightCycle
            if (typeof msg.time === 'number') {
                window._serverTargetTime = msg.time;
            }
            const prevRain = isRaining;
            isRaining = msg.isRaining;
            if (prevRain !== isRaining) {
                updateWeatherVisuals();
                if (isRaining) showToast("It started raining!");
                else showToast("The rain has stopped.");
            }
        }

        // 11. System / Disconnects
        else if (msg.type === 'playerLeft') {
            removePlayer(msg.id);
            updateHostPanel();
            showToast("A fisher has left.");
        }
        else if (msg.type === 'system') {
            displayChatMessage('System', msg.text, 'system');
        }

        // --- ADMIN STATUS HANDLERS ---
        else if (msg.type === 'admin_ok') {
            isHost = true; // Enable admin features client-side
            const btn = document.getElementById('btn-admin-login');
            if (btn) {
                btn.style.display = 'inline-block';
                btn.innerText = "ADMIN MENU";
                btn.classList.remove('btn-danger'); // Make it look normal/active
                btn.classList.add('btn-primary');
            }
            showToast("Admin Privileges Granted");
            updateHostPanel(); // Refresh list to show admin controls
        }
        else if (msg.type === 'admin_fail') {
            isHost = false;
            const btn = document.getElementById('btn-admin-login');
            if (btn) btn.style.display = 'none';
            showToast("Admin Privileges Revoked");
        }

        // --- NEW: Environment Sync (Time/Weather) ---
        else if (msg.type === 'environment_sync') {
            if (typeof msg.time === 'number') {
                // Anti-Jitter: Only hard sync if drift is significant (> 1 minute game time)
                // 1 Game Hour = 25 real seconds.
                // 0.02 Game Hours = 0.5 real seconds.
                if (Math.abs(worldTime - msg.time) > 0.05) {
                    worldTime = msg.time;
                }
            }
            if (typeof msg.isRaining === 'boolean') {
                if (isRaining !== msg.isRaining) {
                    isRaining = msg.isRaining;
                }
            }
        }

        // --- NEW: Fish Caught Confirmation ---
        else if (msg.type === 'fishCaughtConfirmed') {
            const fish = msg.fish;

            // Update Local State (Visuals Only)
            saveState.inventory.push(fish);

            // Update journal with tier (fallback to 'normal' if undefined)
            const tierId = fish.tierId || 'normal';
            updateJournal(fish, tierId);
            saveGame();

            // Show UI with tier and size info
            const tierStr = tierId !== 'normal' ? ` (${fish.tierName || 'Special'})` : '';
            const sizeStr = fish.sizeLabel ? ` [${fish.sizeLabel}]` : '';
            showToast(`Caught ${fish.name}${tierStr}${sizeStr}!`);

            // Play Sound
            Sound.playSpatial('catch');

            // --- FIX: SHOW FISH VISUALLY ON DEDICATED SERVERS ---
            localHeldFish = {
                name: fish.name,
                color: fish.color,
                size: fish.size
            };

            if (fishHoldTimer) clearTimeout(fishHoldTimer);
            fishHoldTimer = setTimeout(() => {
                localHeldFish = null;
                updateLocalVisuals();
            }, 6000);

            updateLocalVisuals();
            // ----------------------------------------------------

            // Trigger Minigame Success Visuals
            if (minigame.active) {
                minigame.active = false;
                document.getElementById('minigame-ui').style.display = 'none';
                // Reset camera or player state if needed
                fishingState = 'idle';
                player.position.y = 1.5; // Reset position if needed
            }
        }

        // --- NEW: State Update (Money/Inventory) ---
        else if (msg.type === 'stateUpdate') {
            if (msg.money !== undefined) saveState.money = msg.money;
            if (msg.inventory !== undefined) saveState.inventory = msg.inventory;

            saveGame();

            if (msg.soldCount && msg.soldValue) {
                showToast(`Sold ${msg.soldCount} fish for $${msg.soldValue}!`);
                Sound.playSpatial('sell');
            }
        }
    });

    // --- CONNECTION CLOSE HANDLER ---
    dedicatedSocket.addEventListener('close', () => {
        isConnectedToDedicated = false;
        dedicatedSocket = null;
        alert("Disconnected from Server.");
        location.reload();
    });
}

const MASTER_SERVER_URL = 'https://html-fishing-master-server.onrender.com'; // Matches Part 1

async function openServerBrowser() {
    const container = document.getElementById('server-list-content');
    container.innerHTML = 'Loading servers...';
    document.getElementById('server-browser-overlay').style.display = 'flex';

    try {
        const res = await fetch(`${MASTER_SERVER_URL}/list`);
        const servers = await res.json();

        container.innerHTML = '';

        if (servers.length === 0) {
            container.innerHTML = '<div style="padding:10px;">No public servers found.</div>';
            return;
        }

        servers.forEach(s => {
            const row = document.createElement('div');
            row.style.background = 'rgba(255,255,255,0.1)';
            row.style.marginBottom = '5px';
            row.style.padding = '10px';
            row.style.borderRadius = '8px';
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';

            const info = document.createElement('div');
            info.innerHTML = `<b>${s.name}</b><br><span style="font-size:12px;color:#aaa;">${s.players} Players</span>`;

            const btn = document.createElement('button');
            btn.className = 'btn-sm';
            btn.innerText = "JOIN";
            btn.style.background = '#44ff44';
            btn.style.color = 'black';

            btn.onclick = () => {
                // --- FIX START: Save Name Before Connecting ---
                saveGame();
                // --- FIX END ----------------------------------

                // --- FIX: Detect HTTPS and force WSS ---
                const isSecure = window.location.protocol === 'https:';
                const protocol = isSecure ? 'wss' : 'ws';

                // --- CLOUDFLARE TUNNEL FIX ---
                let targetPort = s.port;
                if (/[a-zA-Z]/.test(s.ip) && isSecure) {
                    targetPort = 443;
                }

                const wsUrl = `${protocol}://${s.ip}:${targetPort}`;
                console.log("Connecting to:", wsUrl);
                connectToDedicatedServer(wsUrl);
                document.getElementById('server-browser-overlay').style.display = 'none';
            };

            row.appendChild(info);
            row.appendChild(btn);
            container.appendChild(row);
        });

    } catch (e) {
        container.innerText = "Error fetching server list.";
        console.error(e);
    }
}

function closeServerBrowser() {
    document.getElementById('server-browser-overlay').style.display = 'none';
}

// Run after DOM ready to wire up the Official Server button
(function wireOfficialButton() {
    const tryWire = () => {
        const btn = document.getElementById('btn-official-join');
        if (!btn) return setTimeout(tryWire, 200);

        btn.onclick = () => {
            // --- FIX START: Save the name from the input box first! ---
            saveGame();
            // --- FIX END ---

            connectToDedicatedServer();
        };
    };
    tryWire();
})();

// Helper to send admin login to dedicated server (obfuscated): produce sha256(password + salt) and send
async function dedicatedAdminLogin(password) {
    if (!dedicatedSocket || dedicatedSocket.readyState !== WebSocket.OPEN) {
        alert("Connect to Official Server first.");
        return false;
    }
    // ask server for salt by relying on the server to send 'welcome' with adminSalt (we store it)
    // NOTE: server already sends adminSalt in 'welcome'. We'll cache if provided.
    // Implementation: wait briefly for last received welcome to have provided adminSalt:
    // For reliability, we'll request salt via a dummy message - server included salt in welcome so this should work normally.
    // We'll assume server provided 'adminSalt' in the 'welcome' message and the client stored it in lastAdminSalt.
    if (!window.lastAdminSalt) {
        alert("Server hasn't provided salt yet. Try reconnecting.");
        return false;
    }
    const hash = await sha256HexBrowser(password + window.lastAdminSalt);
    dedicatedSocket.send(JSON.stringify({ type: 'admin_login', hash }));
    // server responds with admin_ok or admin_fail — listen for admin_ok to set isAdminOnDedicated
    return new Promise((resolve) => {
        const onMsg = (ev) => {
            try {
                const m = JSON.parse(ev.data);
                if (m.type === 'admin_ok') {
                    isAdminOnDedicated = true;
                    dedicatedSocket.removeEventListener('message', onMsg);
                    resolve(true);
                } else if (m.type === 'admin_fail') {
                    isAdminOnDedicated = false;
                    dedicatedSocket.removeEventListener('message', onMsg);
                    resolve(false);
                }
            } catch (e) { }
        };
        dedicatedSocket.addEventListener('message', onMsg);
        // timeout fallback
        setTimeout(() => { dedicatedSocket.removeEventListener('message', onMsg); resolve(false); }, 4000);
    });
}

// store last admin salt if server sends it
// optionally place this near the earlier message handling to cache welcome.adminSalt:
(function cacheAdminSaltHook() {
    const orig = window.addEventListener;
    // easiest: patch the dedicatedSocket welcome handling above — it will set window.lastAdminSalt if present
})();


// --- WORLD GENERATION ---
// --- TEXTURE GENERATORS ---
function createNoiseTexture(width, height, colorA, colorB, scale = 1, seed = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Helper for pseudo-random based on coordinate
    const random = (x, y) => {
        const sin = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
        return sin - Math.floor(sin);
    };

    // Enhanced noise generation
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    const cA = new THREE.Color(colorA);
    const cB = new THREE.Color(colorB);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nx = x * scale;
            const ny = y * scale;
            // Simple value noise
            const noise = random(nx, ny);

            const r = cA.r + (cB.r - cA.r) * noise;
            const g = cA.g + (cB.g - cA.g) * noise;
            const b = cA.b + (cB.b - cA.b) * noise;

            const index = (x + y * width) * 4;
            data[index] = r * 255;
            data[index + 1] = g * 255;
            data[index + 2] = b * 255;
            data[index + 3] = 255;
        }
    }
    ctx.putImageData(imageData, 0, 0);
    return new THREE.CanvasTexture(canvas);
}

function createLeafTexture() {
    // Pine needles pattern
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');

    // Dark base
    ctx.fillStyle = '#1a472a';
    ctx.fillRect(0, 0, 128, 128);

    // Needles
    for (let i = 0; i < 800; i++) {
        ctx.strokeStyle = Math.random() > 0.5 ? '#2d5a27' : '#3e7038';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const x = Math.random() * 128;
        const y = Math.random() * 128;
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 10, y + 5 + Math.random() * 5);
        ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function generateWorld(seedStr) {
    treeMeshes.forEach(t => scene.remove(t));
    treeMeshes = []; treeColliders = [];
    const seed = xmur3(seedStr.toLowerCase())();
    const rand = mulberry32(seed);

    const cabinPos = new THREE.Vector3(-40, 0, 10);
    const safeZone = 15;

    // Pre-create standard materials
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.9 }); // Darker Wood
    const leafTex = createLeafTexture();
    const leafMat = new THREE.MeshStandardMaterial({
        map: leafTex,
        color: 0xddffdd, // Tint slightly
        roughness: 0.8
    });

    for (let i = 0; i < 100; i++) {
        const angle = rand() * Math.PI * 2;

        const minTreeDist = LAKE_RADIUS + 5;
        const maxTreeDist = ISLAND_RADIUS - 5;

        const dist = minTreeDist + rand() * (maxTreeDist - minTreeDist);

        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;

        if (new THREE.Vector3(x, 0, z).distanceTo(cabinPos) < safeZone) continue;
        if (z < -70 && x > -30 && x < 30) continue;

        // Tree Trunk
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 2.5, 8), trunkMat);
        t.position.set(x, 1.25, z);

        // Tree Leaves (Cone) with Texture
        const l = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4.5, 8), leafMat);
        l.position.set(0, 3, 0);
        t.add(l);

        scene.add(t); treeMeshes.push(t); treeColliders.push({ x, z, radius: 1.5 });
    }
}

function handleDataFromClient(clientId, data) {
    // --- 1. SECURITY: RATE LIMIT CHECK ---
    const now = Date.now();

    // Initialize user in rate limiter if missing
    if (!rateLimits[clientId]) {
        rateLimits[clientId] = { lastGeneral: 0, lastChat: 0, lastSound: 0, lastAnim: 0 };
    }

    const userLimit = rateLimits[clientId];

    // Global Packet Flood Protection (DoS prevention)
    if (now - userLimit.lastGeneral < SPAM_THRESHOLDS.general) {
        return; // Silently drop packets if they are spamming raw data too fast
    }
    userLimit.lastGeneral = now;

    // Specific Action Limits
    if (data.type === 'chat') {
        if (now - userLimit.lastChat < SPAM_THRESHOLDS.chat) return;
        userLimit.lastChat = now;
    }
    else if (data.type === 'sound') {
        if (now - userLimit.lastSound < SPAM_THRESHOLDS.sound) return;
        userLimit.lastSound = now;
    }
    else if (data.type === 'anim') {
        if (now - userLimit.lastAnim < SPAM_THRESHOLDS.anim) return;
        userLimit.lastAnim = now;
    }
    else if (data.type === 'punch_hit') {
        if (!userLimit.lastPunch) userLimit.lastPunch = 0;
        if (now - userLimit.lastPunch < SPAM_THRESHOLDS.anim) return;
        userLimit.lastPunch = now;
    }
    // ----------------------------------------

    try {
        if (otherPlayers[clientId]) {
            otherPlayers[clientId].lastSeen = Date.now();
        }

        if (data.type === 'update') {
            if (!data.payload || !data.payload.pos) return;
            if (isNaN(data.payload.pos.x) || isNaN(data.payload.pos.y) || isNaN(data.payload.pos.z)) return;

            // Boundary Check
            const isIsland = Math.abs(data.payload.pos.x) < ISLAND_RADIUS + 50 && Math.abs(data.payload.pos.z) < ISLAND_RADIUS + 50;
            const isVoid = Math.abs(data.payload.pos.x - 10000) < 500 && Math.abs(data.payload.pos.z - 10000) < 500;
            // Allow Lava world coordinates too
            const isLava = Math.abs(data.payload.pos.x + 20000) < 500;

            if (!isIsland && !isVoid && !isLava) return;

            // If player is not in our list, create them.
            if (!otherPlayers[clientId]) {
                if (data.payload.name) data.payload.name = escapeHTML(data.payload.name).substring(0, 12);
                createRemotePlayer(clientId, data.payload);
                connectToPeerAudio(clientId);
                updateHostPanel();

                // Critical Sync: Send current weather and time to the new player.
                clientConns[clientId].send({
                    type: 'environment_sync',
                    isRaining: isRaining,
                    time: worldTime
                });

                // NEW: Sync Props to New Player
                // Combine Host's local props (myProps) with Remote props (activeProps)
                const hostProps = myProps.map(p => ({ ...p, owner: myPeerId }));
                const allP = [...hostProps, ...activeProps];
                if (allP.length > 0) {
                    clientConns[clientId].send({ type: 'allProps', props: allP });
                }
            }

            if (data.payload.version !== GAME_VERSION) {
                if (clientConns[clientId]) {
                    clientConns[clientId].send({ type: 'error', message: "Version Mismatch!" });
                    setTimeout(() => clientConns[clientId].close(), 100);
                }
                return;
            }

            updateRemotePlayer(clientId, data.payload);

        } else if (data.type === 'chat') {
            if (mutedChatPeers.includes(clientId)) return;
            data.id = clientId;
            data.name = otherPlayers[clientId] ? otherPlayers[clientId].lastData.name : "Unknown";
            if (data.id !== myPeerId) displayChatMessage(data.name, data.text, data.id);
            broadcastToClients(data);

        } else if (data.type === 'sound') {
            // MIDI Mute Check
            if (data.name === 'guitar') {
                if (otherPlayers[clientId] && otherPlayers[clientId].lastData.isMidiMuted) return;
                if (localMutedMidi.includes(clientId)) return;
            }

            Sound.playSpatial(data.name, data.pos, data.var);
            if (isHost) broadcastToClients(data);

        } else if (data.type === 'placeProp') {
            // P2P HOST: Handle Prop Placement Request
            const ownerProps = activeProps.filter(p => p.owner === clientId);
            if (ownerProps.length >= 10) {
                const oldest = ownerProps[0];
                activeProps = activeProps.filter(p => p.id !== oldest.id);
                broadcastToClients({ type: 'propRemoved', id: oldest.id });
                removePropFromWorld(oldest.id); // Remove visually on host
            }

            const newProp = {
                id: Date.now() + "_" + Math.random().toString().substr(2, 5),
                type: data.propType,
                x: data.x,
                z: data.z,
                owner: clientId,
                timestamp: Date.now()
            };
            activeProps.push(newProp);
            spawnPropMesh(newProp); // Spawn visually on host
            broadcastToClients({ type: 'propPlaced', prop: newProp });

        } else if (data.type === 'undoProp') {
            // P2P HOST: Handle Undo Request
            const ownerProps = activeProps.filter(p => p.owner === clientId);
            if (ownerProps.length > 0) {
                ownerProps.sort((a, b) => b.timestamp - a.timestamp);
                const newest = ownerProps[0];
                activeProps = activeProps.filter(p => p.id !== newest.id);
                removePropFromWorld(newest.id);
                broadcastToClients({ type: 'propRemoved', id: newest.id });
            }

        } else if (data.type === 'anim') {
            if (data.anim === 'punch') {
                if (data.id === myPeerId) return;
                const p = otherPlayers[data.id];
                if (p && p.mesh) {
                    animatePunch(p.mesh);
                    Sound.playSpatial('punch', p.mesh.position);
                }
                if (isHost) broadcastToClients(data);
            }
        } else if (data.type === 'punch_hit') {
            handleHit(data);
        } else if (data.type === 'radio_event') {
            handleRadioEvent(data);
            if (isHost) broadcastToClients(data);
        }

    } catch (err) {
        console.warn(`Error handling data from ${clientId}:`, err);
    }
}

function handleDataFromHost(data) {
    if (data.type === 'error') {
        alert(data.message);
        location.reload();
        return;
    }

    // A. Full world state (PeerJS Host usually sends this)
    if (data.type === 'worldState') {
        if (data.gameVersion && data.gameVersion !== GAME_VERSION) {
            alert("Game Version Mismatch! Host is on " + data.gameVersion);
            location.reload();
            return;
        }
        // Sync world time from host
        if (typeof data.worldTime === 'number') worldTime = data.worldTime;

        Object.keys(data.players).forEach(pid => {
            if (pid === myPeerId) return;
            if (!otherPlayers[pid]) {
                createRemotePlayer(pid, data.players[pid]);
                connectToPeerAudio(pid);
            }
            updateRemotePlayer(pid, data.players[pid]);
        });
        Object.keys(otherPlayers).forEach(pid => {
            if (!data.players[pid]) removePlayer(pid);
        });

    }


    // B. Environment sync
    else if (data.type === 'environment_sync') {
        worldTime = data.time;
        const prevRain = isRaining;
        isRaining = data.isRaining;
        if (prevRain !== isRaining) {
            updateWeatherVisuals();
            if (isRaining) showToast("It started raining!");
            else showToast("The rain has stopped.");
        }
    }

    else if (data.type === 'purge_chat') {
        purgeUserMessages(data.targetId);
    }

    // C. Gameplay Events
    else if (data.type === 'forceGhost') spawnGhostMesh(data.x, data.z);
    else if (data.type === 'spawnPortal') spawnPortal(data.x, data.z, true);
    else if (data.type === 'chat' && data.id !== myPeerId) displayChatMessage(data.name, data.text, data.id);
    else if (data.type === 'sound') {
        // --- MIDI MUTE CHECK START ---
        if (data.name === 'guitar') {
            // 1. Check Global/Admin Mute (Server Flag)
            // Note: 'data.id' is the ID of the person playing the guitar
            if (otherPlayers[data.id] && otherPlayers[data.id].lastData.isMidiMuted) return;

            // 2. Check Local Mute (Player List)
            if (localMutedMidi.includes(data.id)) return;
        }
        // --- MIDI MUTE CHECK END ---

        Sound.playSpatial(data.name, data.pos, data.var);
    }
    else if (data.type === 'punch_hit') handleHit(data);
    else if (data.type === 'anim' && data.anim === 'punch') {
        if (otherPlayers[data.id]) {
            animatePunch(otherPlayers[data.id].mesh);
            Sound.playSpatial('punch', otherPlayers[data.id].mesh.position);
        }
    }
    // P2P Prop Sync
    else if (data.type === 'propPlaced') spawnPropMesh(data.prop);
    else if (data.type === 'propRemoved') removePropFromWorld(data.id);
    else if (data.type === 'allProps') data.props.forEach(p => spawnPropMesh(p));
}

function broadcastPlayerList() {
    const worldState = {}; worldState[myPeerId] = myData;
    Object.keys(otherPlayers).forEach(pid => {
        const pData = otherPlayers[pid].lastData;
        pData.isVoiceMuted = mutedVoicePeers.includes(pid);
        pData.isChatMuted = mutedChatPeers.includes(pid);
        // Note: PeerJS host doesn't support MIDI mute enforcement efficiently
        // without complex logic, but we pass the data anyway.
        worldState[pid] = pData;
    });

    broadcastToClients({
        type: 'worldState',
        players: worldState,
        gameVersion: GAME_VERSION,
        worldTime: worldTime
    });
}

function broadcastToClients(msg) { Object.values(clientConns).forEach(conn => { if (conn.open) conn.send(msg); }); }
function sendUpdate() {
    if (!player) return;

    // Prepare local player data
    myData.pos = { x: player.position.x, y: player.position.y, z: player.position.z };
    myData.rot = player.rotation.y;
    myData.bobber = (bobber && fishingState !== 'idle' && fishingState !== 'charging') ? { x: bobber.position.x, y: bobber.position.y, z: bobber.position.z } : null;

    myData.color = saveState.catColor;
    myData.belly = saveState.bellyColor;
    myData.eye = saveState.eyeColor;
    myData.hat = saveState.currentHat;
    myData.species = saveState.species; // Keep for backwards compatibility
    // Modular parts
    myData.ears = saveState.currentEars;
    myData.eyes = saveState.currentEyes;
    myData.nose = saveState.currentNose;
    myData.misc = saveState.currentMisc;
    myData.tail = saveState.currentTail;
    myData.guitar = isGuitarActive;
    myData.glove = isGloveActive;
    myData.title = saveState.currentTitle;
    myData.heldFish = localHeldFish;
    myData.shirt = saveState.currentShirt;
    myData.collar = saveState.currentCollar;
    myData.name = saveState.displayName;
    myData.rod = saveState.currentRod;
    myData.handsEmpty = isHandsHidden;

    myData.version = GAME_VERSION;

    // --- 1. DEDICATED SERVER LOGIC (MOVED TO TOP) ---
    // This check must happen FIRST. If we are an Admin on a dedicated server,
    // 'isHost' is true, but we still need to send data to the server, not broadcast locally.
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify({
            type: 'update',
            id: dedicatedId,
            payload: myData
        }));
    }
    // --- 2. PEERJS HOST LOGIC ---
    else if (isHost) {
        const now = Date.now();
        // Day/Night & Weather Logic
        const date = new Date();
        worldTime = date.getHours() + (date.getMinutes() / 60) + (date.getSeconds() / 3600);

        if (now > nextWeatherChange) {
            if (isRaining) { isRaining = false; nextWeatherChange = now + (480000 + Math.random() * 420000); }
            else {
                if (Math.random() < 0.15) { isRaining = true; nextWeatherChange = now + (180000 + Math.random() * 180000); }
                else { nextWeatherChange = now + (120000 + Math.random() * 120000); }
            }
            updateWeatherVisuals();
        }

        const envMsg = { type: 'environment_sync', isRaining: isRaining, time: worldTime };
        broadcastToClients(envMsg);

        Object.keys(otherPlayers).forEach(id => {
            if (now - otherPlayers[id].lastSeen > 15000) {
                removePlayer(id);
                if (clientConns[id]) { clientConns[id].close(); delete clientConns[id]; }
                broadcastPlayerList();
                updateHostPanel();
            }
        });
        broadcastPlayerList();
    }
    // --- 3. PEERJS CLIENT LOGIC ---
    else if (hostConn && hostConn.open) {
        hostConn.send({ type: 'update', payload: myData });
    }
}
setInterval(sendUpdate, 50);

function createRemotePlayer(id, data) {
    // Ensure we use the name from the data, or fallback to Fisher
    const nameToUse = data.name || "Fisher";

    // Create the mesh with the correct name immediately
    const group = createPlayerMesh(
        data.color || 0xcccccc,
        nameToUse,
        data.hat || 'none',
        data.eye || '#000000',
        data.species || 'cat',
        data.title || 'none',
        data.rod || 'bamboo'
    );

    // Determine if using new parts system or legacy species
    let speciesOrParts;
    if (data.ears) {
        speciesOrParts = { ears: data.ears, eyes: data.eyes, nose: data.nose, misc: data.misc, tail: data.tail };
    } else {
        speciesOrParts = data.species || 'cat';
    }

    // Build partColors object from data
    const partColors = {
        earsColor: data.earsColor || '',
        noseColor: data.noseColor || '',
        miscColor: data.miscColor || '',
        tailColor: data.tailColor || ''
    };

    // Apply specific textures (Shirt, Collar, Pattern, Parts)
    const s = group.getObjectByName('playerSprite');
    const texF = createSpeciesTexture(
        speciesOrParts, data.color, data.belly, false,
        data.hat, data.shirt || 'none', data.collar || 'none', data.eye || '#000000', data.pattern || 'none', partColors
    );
    const texB = createSpeciesTexture(
        speciesOrParts, data.color, data.belly, true,
        data.hat, data.shirt || 'none', data.collar || 'none', data.eye || '#000000', data.pattern || 'none', partColors
    );

    s.userData.matFront.map = texF;
    s.userData.matBack.map = texB;
    s.material = s.userData.matFront;
    s.material.needsUpdate = true;

    scene.add(group);

    // Store the player data
    // FIX: Handle both nested 'pos' (P2P) and flat 'x,y,z' (Dedicated)
    const tx = (data.pos && data.pos.x) || data.x || 0;
    const ty = (data.pos && data.pos.y) || data.y || 0;
    const tz = (data.pos && data.pos.z) || data.z || 0;

    otherPlayers[id] = {
        mesh: group,
        targetPos: new THREE.Vector3(tx, ty, tz),
        targetRot: data.rot || 0,
        bobberMesh: null,
        lineMesh: null,
        lastData: data,
        lastSeen: Date.now()
    };

    // Chat notification
    if (document.getElementById('lobby-screen').style.display === 'none') {
        displayChatMessage(nameToUse, "has joined!", 'system');
    }
}

function updateRemotePlayer(id, data) {
    const p = otherPlayers[id];
    if (!p) return;

    // --- FIX START: Preserve Admin Mute Flags ---
    // We must save these because the incoming 'data' packet is from the client (who sends position)
    // and does not contain the Admin Mute flags sent by the server.
    const wasVoiceMuted = p.lastData ? p.lastData.isVoiceMuted : false;
    const wasChatMuted = p.lastData ? p.lastData.isChatMuted : false;
    const wasMidiMuted = p.lastData ? p.lastData.isMidiMuted : false;
    // --- FIX END ---

    // 1. NAME TAG SYNC
    if (data.name && p.lastData.name !== data.name) {
        p.lastData.name = data.name;
        const oldNameTag = p.mesh.getObjectByName('nameTag');
        if (oldNameTag) {
            const newTex = createNameTagTexture(data.name);
            if (oldNameTag.material.map) oldNameTag.material.map.dispose();
            oldNameTag.material.map = newTex;
            oldNameTag.material.needsUpdate = true;
        }
    }

    // 2. TITLE SYNC
    if (p.lastData.title !== data.title) {
        const oldT = p.mesh.getObjectByName('titleSprite');
        if (oldT) p.mesh.remove(oldT);
        const tTex = createTitleTexture(data.title);
        if (tTex) {
            const tSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tTex }));
            tSprite.position.y = 2.5; tSprite.scale.set(3, 0.75, 1); tSprite.name = "titleSprite";
            tSprite.visible = saveState.showTitles;
            p.mesh.add(tSprite);
        }
    }

    // 3. VISUALS SYNC (Colors, Hat, Shirt, Collar, Pattern, Parts)
    const partsChanged = (p.lastData.ears !== data.ears || p.lastData.eyes !== data.eyes ||
        p.lastData.nose !== data.nose || p.lastData.misc !== data.misc ||
        p.lastData.tail !== data.tail);
    const partColorsChanged = (p.lastData.earsColor !== data.earsColor || p.lastData.noseColor !== data.noseColor ||
        p.lastData.miscColor !== data.miscColor || p.lastData.tailColor !== data.tailColor);
    if (p.lastData.color !== data.color || p.lastData.belly !== data.belly || p.lastData.hat !== data.hat ||
        p.lastData.eye !== data.eye || p.lastData.species !== data.species || p.lastData.shirt !== data.shirt ||
        p.lastData.collar !== data.collar || p.lastData.pattern !== data.pattern || partsChanged || partColorsChanged) {

        // Determine if using new parts system or legacy species
        let speciesOrParts;
        if (data.ears) {
            speciesOrParts = { ears: data.ears, eyes: data.eyes, nose: data.nose, misc: data.misc, tail: data.tail };
        } else {
            speciesOrParts = data.species || 'cat';
        }

        // Build partColors object from data
        const partColors = {
            earsColor: data.earsColor || '',
            noseColor: data.noseColor || '',
            miscColor: data.miscColor || '',
            tailColor: data.tailColor || ''
        };

        const s = p.mesh.getObjectByName('playerSprite');
        const texF = createSpeciesTexture(speciesOrParts, data.color, data.belly, false, data.hat, data.shirt || 'none', data.collar || 'none', data.eye || '#000000', data.pattern || 'none', partColors);
        const texB = createSpeciesTexture(speciesOrParts, data.color, data.belly, true, data.hat, data.shirt || 'none', data.collar || 'none', data.eye || '#000000', data.pattern || 'none', partColors);
        s.userData.matFront.map = texF;
        s.userData.matBack.map = texB;
    }

    // 4. POSITION INTERPOLATION
    p.lastData = data;

    // --- FIX START: Restore Admin Mute Flags ---
    p.lastData.isVoiceMuted = wasVoiceMuted;
    p.lastData.isChatMuted = wasChatMuted;
    p.lastData.isMidiMuted = wasMidiMuted;
    // Update Position
    // FIX: Handle both nested 'pos' and flat 'x,y,z'
    if (data.pos) {
        p.targetPos.set(data.pos.x, data.pos.y, data.pos.z);
    } else if (typeof data.x === 'number') {
        p.targetPos.set(data.x, data.y, data.z);
    }

    // Update Rotation
    if (typeof data.rot === 'number') p.targetRot = data.rot;
    // --- FIX END ---

    // 5. HELD ITEMS (Guitar, Glove, Fish, Rod, Empty)
    const rod = p.mesh.getObjectByName("rod");
    let guitar = p.mesh.getObjectByName("guitarMesh");
    let glove = p.mesh.getObjectByName("gloveMesh");
    let fishSprite = p.mesh.getObjectByName("heldFishSprite");

    // A. Guitar Logic
    if (data.guitar === true) {
        if (!guitar) {
            // ... (keep your existing guitar creation code) ...
            const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d');
            ctx.fillStyle = '#8B4513'; ctx.beginPath(); ctx.arc(32, 45, 12, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(32, 35, 10, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#222'; ctx.fillRect(30, 10, 4, 30);
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(32, 40, 4, 0, Math.PI * 2); ctx.fill();
            const tex = new THREE.CanvasTexture(c);
            tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
            const mat = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 });
            guitar = new THREE.Sprite(mat); guitar.name = 'guitarMesh'; guitar.position.set(0.3, 1.0, 0.2); guitar.scale.set(1.5, 1.5, 1); p.mesh.add(guitar);
        }
        guitar.visible = true;
        if (glove) glove.visible = false;
        if (fishSprite) fishSprite.visible = false;
        if (rod) rod.visible = false;
    }
    // B. Glove Logic
    else if (data.glove === true) {
        if (!glove) {
            // ... (keep your existing glove creation code) ...
            const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d');
            ctx.fillStyle = '#cc0000'; ctx.beginPath(); ctx.arc(32, 32, 20, 0, Math.PI * 2); ctx.fill();
            const tex = new THREE.CanvasTexture(c);
            tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
            const mat = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 });
            glove = new THREE.Sprite(mat); glove.name = 'gloveMesh'; glove.position.set(0.6, 1.0, 0.5); glove.scale.set(1.2, 1.2, 1); p.mesh.add(glove);
        }
        if (glove) glove.visible = true;
        if (guitar) guitar.visible = false;
        if (fishSprite) fishSprite.visible = false;
        if (rod) rod.visible = false;
    }
    // C. Held Fish Logic
    else if (data.heldFish) {
        if (!fishSprite || fishSprite.userData.fishName !== data.heldFish.name) {
            if (fishSprite) p.mesh.remove(fishSprite);
            const fTex = createFishTexture(data.heldFish.name, data.heldFish.color);
            const fMat = new THREE.SpriteMaterial({ map: fTex, transparent: true, alphaTest: 0.5 });
            fishSprite = new THREE.Sprite(fMat);
            fishSprite.name = 'heldFishSprite';
            fishSprite.userData = { fishName: data.heldFish.name };
            fishSprite.position.set(0.6, 1.2, 0.5);
            const s = data.heldFish.size || 1.0;
            fishSprite.scale.set(1.5 * s, 1.5 * s, 1);
            p.mesh.add(fishSprite);
        }
        fishSprite.visible = true;
        if (guitar) guitar.visible = false;
        if (glove) glove.visible = false;
        if (rod) rod.visible = false;
    }
    // D. Empty Hands Logic (NEW)
    else if (data.handsEmpty) {
        // Hide everything
        if (guitar) guitar.visible = false;
        if (glove) glove.visible = false;
        if (fishSprite) fishSprite.visible = false;
        if (rod) rod.visible = false;
    }
    // E. Rod Logic (Default)
    else {
        if (guitar) guitar.visible = false;
        if (glove) glove.visible = false;
        if (fishSprite) fishSprite.visible = false;

        // Ensure rod exists and skin is correct
        if (!rod || (data.rod && rod.userData.rodId !== data.rod)) {
            if (rod) p.mesh.remove(rod);

            const rodId = data.rod || 'bamboo';
            const rodTex = createRodTexture(rodId);
            const rodMat = new THREE.MeshBasicMaterial({ map: rodTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });

            const rodGeo = new THREE.PlaneGeometry(3.0, 3.0);
            rodGeo.translate(1.5, 1.5, 0);

            const newRod = new THREE.Mesh(rodGeo, rodMat);
            newRod.position.set(0.6, 0.8, 0.1);
            newRod.rotation.set(-0.2, -Math.PI / 2, 0);
            newRod.name = "rod";
            newRod.userData.rodId = rodId;
            p.mesh.add(newRod);
        } else {
            rod.visible = true;
        }
    }

    // 6. BOBBER & LINE SYNC
    if (data.bobber) {
        if (!p.bobberMesh) {
            p.bobberMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial({ color: 0xff0000 })); scene.add(p.bobberMesh);
            p.lineMesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff })); p.lineMesh.frustumCulled = false; scene.add(p.lineMesh);
        }
        p.bobberMesh.position.set(data.bobber.x, data.bobber.y, data.bobber.z);

        const activeRod = p.mesh.getObjectByName("rod");
        if (activeRod) {
            // SYNC CAST ANIMATION: Rotate X forward to 0.8
            activeRod.rotation.x = 0.8;
        }
    } else {
        if (p.bobberMesh) { scene.remove(p.bobberMesh); scene.remove(p.lineMesh); p.bobberMesh = null; p.lineMesh = null; }

        // RESET REMOTE ROD (Idle Position)
        const activeRod = p.mesh.getObjectByName("rod");
        if (activeRod) {
            activeRod.rotation.x = -0.2;
        }
    }
}

function initChatPool() {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    box.innerHTML = ''; // Clear initial clutter if any

    for (let i = 0; i < MAX_CHAT_MESSAGES; i++) {
        const line = document.createElement('div');
        line.className = 'chat-msg';
        line.style.display = 'none'; // Initially hidden
        box.appendChild(line);
        chatPool.push(line);
    }
}

function startGame() {
    if (!isMobile) document.getElementById('chat-ui').style.display = 'flex';
    Music.init();
    initChatPool();
} // Called after lobby

function sendChatMessage(text) {
    const now = Date.now();

    // Rate Limit
    if (now - lastChatTime < CHAT_COOLDOWN) {
        showToast("Chatting too fast!", 'error');
        return;
    }
    lastChatTime = now;

    const safeText = text.substring(0, 256);
    if (!safeText.trim()) return;

    const embeddedHtml = safeEmbedImage(safeText);

    // Check if it's actually an image URL (not just different due to escaping)
    const imgRegex = /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)$/i;
    const isImageUrl = imgRegex.test(safeText);

    // 2. Display locally immediately
    displayChatMessage(saveState.displayName, safeText, 'local');
    broadcastSound('chat');
    showChatBubble(player, isImageUrl ? 'Image posted...' : safeText);

    // 3. Prepare Network Message
    const msg = { type: 'chat', text: safeText };

    // --- FIX: PRIORITIZE DEDICATED SERVER CONNECTION ---
    // We check this FIRST. Even if you are Admin (isHost=true), 
    // you must send the chat to the server so it can reach other players.
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify(msg));
    }
    // --- PEERJS HOST LOGIC ---
    else if (isHost) {
        const peerMsg = { ...msg, name: saveState.displayName, id: myPeerId };
        broadcastToClients(peerMsg);
    }
    // --- PEERJS CLIENT LOGIC ---
    else if (hostConn && hostConn.open) {
        const peerMsg = { ...msg, name: saveState.displayName, id: myPeerId };
        hostConn.send(peerMsg);
    }
}

// --- SECURITY FIX: Safe Image Embedding ---
function safeEmbedImage(text) {
    const escaped = escapeHTML(text);
    // Strict check for image URL
    const imgRegex = /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)$/i;
    if (imgRegex.test(text)) {
        return `<img src="${escaped}" class="chat-img" style="max-width:200px; max-height:200px; border-radius:10px; vertical-align:middle;" alt="Image">`;
    }
    return escaped;
}

function displayChatMessage(name, text, id) {
    // 1. MUTE CHECKS
    if (id && id !== 'system' && id !== 'local') {
        if (localMutedChat.includes(id)) return;
        if (otherPlayers[id] && otherPlayers[id].lastData && otherPlayers[id].lastData.isChatMuted) return;
    }

    const box = document.getElementById('chat-messages');

    // --- OBJECT POOLING ---
    // 1. Get next element
    if (chatPool.length === 0) initChatPool(); // Just in case

    const line = chatPool[chatPoolIndex];
    chatPoolIndex = (chatPoolIndex + 1) % MAX_CHAT_MESSAGES;

    // 2. Move to bottom (visually)
    box.appendChild(line);
    line.style.display = 'block';
    line.className = 'chat-msg'; // Reset class
    line.innerHTML = ''; // Clear content
    // ----------------------

    // Store sender ID for moderation (purging)
    if (id) line.dataset.senderId = id;

    const safeName = escapeHTML(name || "Unknown");

    // Truncate length
    const rawText = (text || "").substring(0, 256);
    // Determine the safe version of the text for bubbles/fallbacks
    const safeText = escapeHTML(rawText);

    if (id === 'system') {
        line.innerHTML = `<span style="color:#ffd700; font-style:italic; font-weight:bold; font-size:12px;">${safeName} ${safeText}</span>`;
    } else {

        // --- SECURITY LOGIC ---
        // Replaced 'embedImageIfValid' with 'safeEmbedImage' to ensure XSS protection.
        const content = safeEmbedImage(rawText);

        line.innerHTML = `<span class="chat-name">${safeName}:</span><span class="chat-text">${content}</span>`;
    }

    // --- SCROLL FIX ---
    box.scrollTop = box.scrollHeight;

    // --- IMAGE LOADING SCROLL FIX ---
    const images = line.getElementsByTagName('img');
    if (images.length > 0) {
        images[0].onload = function () {
            box.scrollTop = box.scrollHeight;
        };
        if (images[0].complete) {
            box.scrollTop = box.scrollHeight;
        }
    }

    // --- CHAT BUBBLES ---
    // Check if it's an image URL to decide bubble content
    const imgRegex = /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)$/i;
    const isImageUrl = imgRegex.test(rawText);
    const bubbleContent = isImageUrl ? 'Image posted...' : rawText;

    if (id && id !== 'local' && id !== 'system' && otherPlayers[id]) {
        showChatBubble(otherPlayers[id].mesh, bubbleContent);
    } else if (id === 'local' && player) {
        showChatBubble(player, bubbleContent);
    }

    refreshChatFade();
}

function showChatBubble(parentMesh, text) {

    const existing = parentMesh.getObjectByName("chatBubble");
    if (existing) parentMesh.remove(existing);


    const maxMsgLength = 256;
    const maxCharsPerLine = 24;
    const fontSize = 22;
    const lineHeight = 28;
    const padding = 20;


    let safeText = text.substring(0, maxMsgLength);
    let rawWords = safeText.split(' ');
    let lines = [];
    let currentLine = "";

    rawWords.forEach(word => {

        if (word.length > maxCharsPerLine) {

            if (currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = "";
            }

            for (let i = 0; i < word.length; i += maxCharsPerLine) {
                let chunk = word.substring(i, i + maxCharsPerLine);


                if (chunk.length === maxCharsPerLine && (i + maxCharsPerLine < word.length)) {
                    lines.push(chunk);
                } else {
                    currentLine = chunk;
                }
            }
        }

        else {

            if (currentLine.length + word.length + 1 > maxCharsPerLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {

                currentLine += (currentLine.length > 0 ? " " : "") + word;
            }
        }
    });

    if (currentLine.length > 0) lines.push(currentLine);



    const canvasWidth = 256;
    const canvasHeight = (lines.length * lineHeight) + padding;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');


    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;

    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(2, 2, canvasWidth - 4, canvasHeight - 4, 15);
    } else {
        ctx.rect(2, 2, canvasWidth - 4, canvasHeight - 4);
    }
    ctx.fill();
    ctx.stroke();


    ctx.fillStyle = "white";
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const centerX = canvasWidth / 2;
    let currentY = (canvasHeight - (lines.length * lineHeight)) / 2 + (lineHeight / 2);

    lines.forEach(line => {
        ctx.fillText(line, centerX, currentY);
        currentY += lineHeight;
    });


    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);


    const scaleX = 4;
    const scaleY = scaleX * (canvasHeight / canvasWidth);

    sprite.scale.set(scaleX, scaleY, 1);
    sprite.position.y = 3.2 + (scaleY / 2);
    sprite.name = "chatBubble";

    parentMesh.add(sprite);


    const readTime = 3000 + (safeText.length * 100);
    setTimeout(() => {
        if (parentMesh && parentMesh.getObjectByName("chatBubble") === sprite) {
            parentMesh.remove(sprite);
            mat.dispose();
            tex.dispose();
        }
    }, readTime);
}

async function refreshServerCount() {
    const el = document.getElementById('official-count');
    if (!el) return;

    // Convert WSS URL to HTTPS (e.g. wss://site.com -> https://site.com)
    const wsUrl = (window.DEDICATED_SERVER_URL || DEDICATED_WS_URL);
    const httpUrl = wsUrl.replace('ws://', 'http://').replace('wss://', 'https://');

    try {
        const response = await fetch(httpUrl);
        if (!response.ok) throw new Error("Server Offline");

        const data = await response.json();
        el.innerText = `🟢 ${data.players} Online`;
        el.style.color = '#44ff44';
    } catch (err) {
        console.warn("Server Check Failed:", err);
        el.innerText = "🔴 Offline";
        el.style.color = '#ff4444';
    }
}

function createLavaWorld() {
    // Clear old data
    if (lavaFloorMesh) scene.remove(lavaFloorMesh);
    if (lavaLakeMesh) scene.remove(lavaLakeMesh);
    if (window.lavaRockGroup) {
        window.lavaRockGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        scene.remove(window.lavaRockGroup);
        window.lavaRockGroup = null;
    }
    lavaColliders = [];

    // --- SETUP SEEDED RNG ---
    const seed = xmur3("lava-dimension")();
    const rand = mulberry32(seed);

    // 1. The Ground
    const groundGeo = new THREE.CylinderGeometry(80, 80, 5, 32);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x4E342E });
    lavaFloorMesh = new THREE.Mesh(groundGeo, groundMat);
    lavaFloorMesh.position.set(-20000, -2.5, 0);
    scene.add(lavaFloorMesh);

    // 2. The Lava Lake
    const lakeGeo = new THREE.CircleGeometry(25, 32);
    const lakeMat = new THREE.MeshStandardMaterial({
        color: 0xff4500,
        emissive: 0xcc0000,
        emissiveIntensity: 0.5
    });
    lavaLakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
    lavaLakeMesh.rotation.x = -Math.PI / 2;
    lavaLakeMesh.position.set(-20000, 0.1, 0);
    scene.add(lavaLakeMesh);

    // 3. Lava Rocks (Now Synced & Safe Zone Protected)
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x221111 });

    window.lavaRockGroup = new THREE.Group();
    scene.add(window.lavaRockGroup);

    // Define where the NPCs are so we don't put rocks on them
    const safeZones = [
        { x: -20000 + 35, z: 0 },   // Merchant
        { x: -20000 - 35, z: 0 },   // Stylist
        { x: -20000, z: 35 },       // Bait
    ];
    const safeRadius = 8; // Distance to keep clear around NPCs

    for (let i = 0; i < 40; i++) {
        const angle = rand() * Math.PI * 2;
        const dist = 30 + rand() * 45;

        const x = -20000 + Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;

        // --- CHECK SAFE ZONES ---
        let tooClose = false;
        for (let zone of safeZones) {
            const dx = x - zone.x;
            const dz = z - zone.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < safeRadius) {
                tooClose = true;
                break;
            }
        }

        // If the rock is inside a safe zone, skip creating it
        if (tooClose) continue;
        // ------------------------

        const rock = new THREE.Mesh(rockGeo, rockMat);
        const scale = 1.5 + rand() * 2.5;

        rock.position.set(x, scale / 2, z);
        rock.scale.set(scale, scale, scale);
        rock.rotation.set(rand(), rand(), rand());

        window.lavaRockGroup.add(rock);

        lavaColliders.push({ x: x, z: z, radius: scale * 0.8 });
    }

    // 4. Embers
    const particlesGeo = new THREE.BufferGeometry();
    const particleCount = 200;
    const posArray = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
        posArray[i] = -20000 + (Math.random() - 0.5) * 100;
        posArray[i + 1] = Math.random() * 50;
        posArray[i + 2] = (Math.random() - 0.5) * 100;
    }
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particlesMat = new THREE.PointsMaterial({ color: 0xffaa00, size: 0.5 });
    const embers = new THREE.Points(particlesGeo, particlesMat);
    scene.add(embers);
}


let waterfallMesh;

function createWaterfallZone() {
    const mountainMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });

    const c1 = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 20), mountainMat);
    c1.position.set(-25, 20, -90);
    scene.add(c1);

    staticColliders.push({ minX: -46, maxX: -4, minZ: -100, maxZ: -79 });

    const c2 = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 20), mountainMat);
    c2.position.set(25, 20, -90);
    scene.add(c2);

    staticColliders.push({ minX: 6, maxX: 44, minZ: -100, maxZ: -79 });

    const c3 = new THREE.Mesh(new THREE.BoxGeometry(90, 10, 20), mountainMat);
    c3.position.set(0, 35, -90);
    scene.add(c3);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(90, 40, 10), mountainMat);
    backWall.position.set(0, 20, -105);
    scene.add(backWall);
    staticColliders.push({ minX: -46, maxX: 44, minZ: -110, maxZ: -99 });

    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4fa'; ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 50; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`;
        ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 10);
    }
    const waterTex = new THREE.CanvasTexture(canvas);

    // --- FILTER FIX ---
    waterTex.magFilter = THREE.NearestFilter;
    waterTex.minFilter = THREE.NearestFilter;
    // ------------------

    waterTex.wrapS = THREE.RepeatWrapping;
    waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.repeat.set(2, 6);

    const waterMat = new THREE.MeshStandardMaterial({
        map: waterTex,
        color: 0x00ffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });

    waterfallMesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 50), waterMat);
    waterfallMesh.position.set(0, 10, -81);
    waterfallMesh.rotation.x = 0;
    scene.add(waterfallMesh);

    const caveFloor = new THREE.Mesh(new THREE.CircleGeometry(15, 32), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    caveFloor.rotation.x = -Math.PI / 2;
    caveFloor.position.set(0, 0.1, -95);
    scene.add(caveFloor);

    const secretPool = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshStandardMaterial({ color: 0x0000ff, emissive: 0x0000aa }));
    secretPool.rotation.x = -Math.PI / 2;
    secretPool.position.set(0, 0.15, -95);
    scene.add(secretPool);

    addHotspotParticles(0, 1, -95);
}

function addHotspotParticles(x, y, z) {
    const geo = new THREE.BufferGeometry();
    const pos = [];
    for (let i = 0; i < 10; i++) pos.push(x + (Math.random() - 0.5) * 5, y + Math.random() * 2, z + (Math.random() - 0.5) * 5);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffff00, size: 0.5 });
    const parts = new THREE.Points(geo, mat);
    scene.add(parts);
}

function updateDayNightCycle(dt) {

    // Always run local time simulation for smooth movement
    if (typeof DAY_DURATION !== 'undefined') {
        worldTime += (dt / DAY_DURATION) * 24;
        if (worldTime >= 24) worldTime -= 24;
    }

    // On dedicated servers, smoothly lerp towards server target time
    if (isConnectedToDedicated && typeof window._serverTargetTime === 'number') {
        let diff = window._serverTargetTime - worldTime;

        // Handle day wrap-around (e.g., server at 0.1, client at 23.9)
        if (diff > 12) diff -= 24;
        if (diff < -12) diff += 24;

        // Only correct if drift is noticeable (> 0.01 hours ~ 0.4 seconds game time)
        if (Math.abs(diff) > 0.01) {
            // Lerp towards server time smoothly
            worldTime += diff * 0.1; // 10% correction per frame
            if (worldTime >= 24) worldTime -= 24;
            if (worldTime < 0) worldTime += 24;
        }
    }


    // 1. Calculate Colors
    let lightIntensity = 1.0;

    // --- LAVA WORLD OVERRIDE ---
    if (isInLavaWorld) {
        lightIntensity = 0.8;

        if (sunLight) {
            sunLight.color.setHex(0xffaa00); // Orange light
            sunLight.intensity = 0.8;
        }

        // Apply immediately
        _optColor1.setHex(0x220000);
        scene.background = _optColor1;
        scene.fog.color = _optColor1;
        return; // Skip standard day/night cycle
    }

    // --- VOID OVERRIDE ---
    if (isInVoid) {
        _optColor1.setHex(0x000000);
        lightIntensity = 0.5;
        // Apply immediately
        scene.background = _optColor1;
        scene.fog.color = _optColor1;
        return;
    }

    // --- STANDARD WORLD CYCLE ---
    // Normalize time to 0-24
    // 6 AM to 6 PM = Day
    if (worldTime >= 6 && worldTime < 18) {
        // Sunrise (6am - 7am)
        if (worldTime < 7) {
            _optColor1.copy(NIGHT_COLOR).lerp(DAY_COLOR, (worldTime - 6));
        }
        // Sunset (5pm - 6pm)
        else if (worldTime > 17) {
            _optColor1.copy(DAY_COLOR).lerp(SUNSET_COLOR, (worldTime - 17));
        }
        // Middle of Day
        else {
            _optColor1.copy(DAY_COLOR);
        }
    } else {
        // Night
        lightIntensity = 0.2; // Dim light

        // Dusk (6pm - 7pm)
        if (worldTime >= 18 && worldTime < 19) {
            _optColor1.copy(SUNSET_COLOR).lerp(NIGHT_COLOR, (worldTime - 18));
        }
        // Middle of Night
        else {
            _optColor1.copy(NIGHT_COLOR);
        }
    }

    // Rain Override: Darken the sky if it's raining.
    if (isRaining) {
        const rainColor = new THREE.Color(0x445566);
        _optColor1.lerp(rainColor, 0.9);
        lightIntensity *= 0.5; // Darken light during rain
    }

    // Apply Visuals
    scene.background = _optColor1;
    scene.fog.color = _optColor1;

    // Move Sun/Moon
    const angle = ((worldTime - 6) / 24) * Math.PI * 2;
    const radius = 100;

    if (sunMesh) {
        sunMesh.position.x = Math.cos(angle) * radius;
        sunMesh.position.y = Math.sin(angle) * radius;
    }
    if (moonMesh) {
        moonMesh.position.x = Math.cos(angle + Math.PI) * radius;
        moonMesh.position.y = Math.sin(angle + Math.PI) * radius;
    }

    // Update Light
    if (sunLight) {
        if (worldTime > 6 && worldTime < 18) {
            sunLight.position.copy(sunMesh.position);
            sunLight.intensity = lightIntensity;
            sunLight.color.setHex(0xffffff);
        } else {
            sunLight.position.copy(moonMesh.position);
            sunLight.intensity = lightIntensity * 0.5;
            sunLight.color.setHex(0x4444ff);
        }
    }

    // Stars visibility (fade in at night)
    if (window.starSystem) {
        const isNight = worldTime < 5 || worldTime > 19;
        const targetOpacity = isNight ? 1.0 : 0.0;
        window.starSystem.material.opacity += (targetOpacity - window.starSystem.material.opacity) * 0.05;
    }

    // Clouds visibility and movement (visible during day)
    if (window.cloudSprites) {
        const isDay = worldTime > 6 && worldTime < 18;
        window.cloudSprites.forEach(cloud => {
            const targetOpacity = isDay ? 0.7 : 0.0;
            cloud.material.opacity += (targetOpacity - cloud.material.opacity) * 0.03;
            // Move clouds slowly
            cloud.position.x += cloud.userData.speed * 0.02;
            if (cloud.position.x > 200) cloud.position.x = -200;
        });
    }
}

function createRainSystem() {
    const rainCount = 2000;
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];

    for (let i = 0; i < rainCount; i++) {
        // Random positions above the island
        positions.push((Math.random() - 0.5) * 200); // x
        positions.push(Math.random() * 50 + 10);     // y (height)
        positions.push((Math.random() - 0.5) * 200); // z
        velocities.push(1.5 + Math.random() * 1.0);  // Faster speed for rain
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.userData = { velocities: velocities };

    // Create thin elongated rain streak texture
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Gradient from top (transparent) to bottom (blue-white)
    const gradient = ctx.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, 'rgba(150, 200, 255, 0)');
    gradient.addColorStop(0.2, 'rgba(180, 210, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(220, 235, 255, 0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, 64);

    const rainTexture = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
        color: 0xccddff,
        size: 0.4,
        transparent: true,
        opacity: 0.8,
        map: rainTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    rainSystem = new THREE.Points(geom, mat);
    rainSystem.visible = false; // Start off
    scene.add(rainSystem);
}

// --- THREE.JS SCENE SETUP ---
function setupThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

    // KEEP antialias: false for pixel art style
    renderer = new THREE.WebGLRenderer({ antialias: false });

    // --- PIXEL RATIO FIX ---
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    // -----------------------

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    document.getElementById('game-container').appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemi.name = 'hemiLight';
    scene.add(hemi);

    // The Sun Light (Shadow caster)
    sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    scene.add(sunLight);

    // Sun Sprite (Billboard - always faces camera)
    const sunCanvas = document.createElement('canvas');
    sunCanvas.width = 128; sunCanvas.height = 128;
    const sunCtx = sunCanvas.getContext('2d');
    const sunGradient = sunCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    sunGradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
    sunGradient.addColorStop(0.3, 'rgba(255, 220, 100, 1)');
    sunGradient.addColorStop(0.7, 'rgba(255, 180, 50, 0.6)');
    sunGradient.addColorStop(1, 'rgba(255, 150, 0, 0)');
    sunCtx.fillStyle = sunGradient;
    sunCtx.fillRect(0, 0, 128, 128);
    const sunTexture = new THREE.CanvasTexture(sunCanvas);
    const sunSpriteMat = new THREE.SpriteMaterial({ map: sunTexture, transparent: true, fog: false });
    sunMesh = new THREE.Sprite(sunSpriteMat);
    sunMesh.scale.set(20, 20, 1);
    scene.add(sunMesh);

    // Moon Sprite (Billboard - always faces camera)
    const moonCanvas = document.createElement('canvas');
    moonCanvas.width = 128; moonCanvas.height = 128;
    const moonCtx = moonCanvas.getContext('2d');
    const moonGradient = moonCtx.createRadialGradient(64, 64, 0, 64, 64, 60);
    moonGradient.addColorStop(0, 'rgba(240, 240, 255, 1)');
    moonGradient.addColorStop(0.5, 'rgba(200, 200, 220, 1)');
    moonGradient.addColorStop(0.8, 'rgba(150, 150, 180, 0.5)');
    moonGradient.addColorStop(1, 'rgba(100, 100, 150, 0)');
    moonCtx.fillStyle = moonGradient;
    moonCtx.fillRect(0, 0, 128, 128);
    const moonTexture = new THREE.CanvasTexture(moonCanvas);
    const moonSpriteMat = new THREE.SpriteMaterial({ map: moonTexture, transparent: true, fog: false });
    moonMesh = new THREE.Sprite(moonSpriteMat);
    moonMesh.scale.set(15, 15, 1);
    scene.add(moonMesh);

    // Stars System (visible at night)
    const starCount = 500;
    const starGeom = new THREE.BufferGeometry();
    const starPositions = [];
    for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.4 + 0.1; // Upper hemisphere only
        const r = 150 + Math.random() * 50;
        starPositions.push(Math.sin(phi) * Math.cos(theta) * r);
        starPositions.push(Math.cos(phi) * r);
        starPositions.push(Math.sin(phi) * Math.sin(theta) * r);
    }
    starGeom.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0, fog: false });
    window.starSystem = new THREE.Points(starGeom, starMat);
    scene.add(window.starSystem);

    // Clouds System (visible during day)
    window.cloudSprites = [];
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 256; cloudCanvas.height = 128;
    const cloudCtx = cloudCanvas.getContext('2d');
    cloudCtx.fillStyle = 'rgba(255, 255, 255, 0)';
    cloudCtx.fillRect(0, 0, 256, 128);
    // Draw fluffy cloud shape
    cloudCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    cloudCtx.beginPath();
    cloudCtx.ellipse(80, 70, 50, 35, 0, 0, Math.PI * 2);
    cloudCtx.ellipse(130, 60, 60, 40, 0, 0, Math.PI * 2);
    cloudCtx.ellipse(180, 70, 45, 30, 0, 0, Math.PI * 2);
    cloudCtx.ellipse(105, 50, 35, 25, 0, 0, Math.PI * 2);
    cloudCtx.ellipse(155, 45, 40, 28, 0, 0, Math.PI * 2);
    cloudCtx.fill();
    const cloudTexture = new THREE.CanvasTexture(cloudCanvas);

    for (let i = 0; i < 8; i++) {
        const cloudMat = new THREE.SpriteMaterial({ map: cloudTexture, transparent: true, opacity: 0.7, fog: false });
        const cloud = new THREE.Sprite(cloudMat);
        cloud.scale.set(40 + Math.random() * 30, 20 + Math.random() * 15, 1);
        cloud.position.set(
            (Math.random() - 0.5) * 300,
            60 + Math.random() * 30,
            (Math.random() - 0.5) * 300
        );
        cloud.userData.speed = 0.5 + Math.random() * 0.5;
        scene.add(cloud);
        window.cloudSprites.push(cloud);
    }

    // Create HIGH QUALITY Grass Texture
    const grassTex = createNoiseTexture(256, 256, '#7a9b7a', '#5a7b5a', 0.05, Math.random() * 100);
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(8, 8);

    const isl = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS, 5, 64), new THREE.MeshStandardMaterial({ map: grassTex, color: 0xffffff, roughness: 0.8 }));
    isl.position.y = -2.5; scene.add(isl);

    // Create HIGH QUALITY Water Texture
    const waterTex = createNoiseTexture(128, 128, '#5fbcfe', '#40acfe', 0.03, Math.random() * 100);
    waterTex.wrapS = THREE.RepeatWrapping;
    waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.repeat.set(6, 6);

    const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE_RADIUS, 64), new THREE.MeshStandardMaterial({
        map: waterTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        roughness: 0.2,
        metalness: 0.1
    }));
    lake.rotation.x = -Math.PI / 2; lake.position.y = 0.1; scene.add(lake);

    generateWorld("lobby-world");
    createCabin();

    createNPCs(); createLocalPlayer();
    createWaterfallZone();
    createRainSystem();
    createLavaWorld();

    fishingLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff }));
    fishingLine.frustumCulled = false; fishingLine.visible = false; scene.add(fishingLine);

    castMarker = new THREE.Group();
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const b1 = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.2), barMat); const b2 = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.2), barMat);
    b2.rotation.z = Math.PI / 2; castMarker.add(b1, b2);
    castMarker.rotation.x = -Math.PI / 2; castMarker.visible = false; scene.add(castMarker);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function disposeTexture(texture) {
    if (texture && texture.dispose) {
        texture.dispose();
    }
}

function createSpeakerTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.moveTo(10, 20); ctx.lineTo(25, 20); ctx.lineTo(40, 5); ctx.lineTo(40, 59); ctx.lineTo(25, 44); ctx.lineTo(10, 44); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'white';
    ctx.beginPath(); ctx.arc(40, 32, 10, -Math.PI / 3, Math.PI / 3); ctx.stroke();
    ctx.beginPath(); ctx.arc(40, 32, 20, -Math.PI / 3, Math.PI / 3); ctx.stroke();
    return new THREE.CanvasTexture(c);
}

function createCabin() {
    const grp = new THREE.Group();

    const cx = -40;
    const cz = 10;
    grp.position.set(cx, 0, cz);

    // --- MATERIALS ---
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 0.8 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x8D6E63 });

    // --- HELPER: Create Log ---
    function createLog(length, x, y, z, rotY = 0) {
        const geo = new THREE.CylinderGeometry(0.35, 0.35, length, 8);
        const mesh = new THREE.Mesh(geo, woodMat);
        mesh.rotation.z = Math.PI / 2;
        mesh.rotation.y = rotY;
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        grp.add(mesh);
    }

    // --- 0. BASE FILLERS (Fixes the bottom gap!) ---
    // These fit BETWEEN the side walls at the lowest level
    // Back Wall Base
    createLog(8.2, 0, 0.35, -4.5, 0);
    // Front Wall Base (Left & Right of door)
    createLog(3.5, -3.5, 0.35, 4.5, 0);
    createLog(3.5, 3.5, 0.35, 4.5, 0);

    // --- 1. WALLS (Interlocking) ---
    let y = 0.35;
    const wallHeight = 4.0;

    while (y < wallHeight) {

        // --- LAYER A: SIDE WALLS (Z-Axis) ---
        // These define the corners for this layer
        const isWindow = (y > 1.2 && y < 2.8);

        if (isWindow) {
            createLog(3.5, -4.5, y, -3.5, Math.PI / 2); // Left Back
            createLog(3.5, -4.5, y, 3.5, Math.PI / 2);  // Left Front
            createLog(3.5, 4.5, y, -3.5, Math.PI / 2);  // Right Back
            createLog(3.5, 4.5, y, 3.5, Math.PI / 2);   // Right Front
        } else {
            createLog(11, -4.5, y, 0, Math.PI / 2); // Left Full
            createLog(11, 4.5, y, 0, Math.PI / 2);  // Right Full
        }

        // --- LAYER B: FRONT/BACK WALLS (X-Axis) ---
        // Sits on top of Layer A
        const y2 = y + 0.35;

        // Back Wall
        createLog(11, 0, y2, -4.5, 0);

        // Front Wall (Door logic)
        const isDoor = (y2 < 2.6);
        if (isDoor) {
            createLog(4, -3.5, y2, 4.5, 0);
            createLog(4, 3.5, y2, 4.5, 0);
        } else {
            createLog(11, 0, y2, 4.5, 0); // Header
        }

        // Increment for next Layer A
        y += 0.7;
    }

    // --- 2. ROOF GABLES (The Triangles) ---
    // Tighter spacing (0.4) to prevent holes
    let gableY = 4.0;
    const ridgeHeight = 6.8; // Go slightly into the roof beam
    const maxGableWidth = 10;

    while (gableY < ridgeHeight) {
        gableY += 0.4;

        // Calculate width based on height progress
        const progress = (gableY - 4.0) / (ridgeHeight - 4.0);
        const currentWidth = maxGableWidth * (1.0 - progress);

        // Stop if too small, but ensure we get close to top
        if (currentWidth > 0.2) {
            createLog(currentWidth, 0, gableY, -4.5, 0); // Back
            createLog(currentWidth, 0, gableY, 4.5, 0);  // Front
        }
    }

    // --- 3. FLOOR & ROOF MESHES ---
    const floor = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.4, 9.5), floorMat);
    floor.position.y = 0.2;
    floor.receiveShadow = true;
    grp.add(floor);

    const roofGroup = new THREE.Group();

    // Left Slope
    const slopeGeo = new THREE.BoxGeometry(7.5, 0.4, 12);
    const slope1 = new THREE.Mesh(slopeGeo, roofMat);
    slope1.position.set(-2.8, 5.5, 0);
    slope1.rotation.z = Math.PI / 5;
    slope1.castShadow = true;

    // Right Slope
    const slope2 = new THREE.Mesh(slopeGeo, roofMat);
    slope2.position.set(2.8, 5.5, 0);
    slope2.rotation.z = -Math.PI / 5;
    slope2.castShadow = true;

    // Ridge Log
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 12, 8), woodMat);
    ridge.rotation.x = Math.PI / 2;
    ridge.position.set(0, 6.7, 0);

    roofGroup.add(slope1, slope2, ridge);
    grp.add(roofGroup);

    scene.add(grp);

    // --- 4. PHYSICS COLLIDERS ---
    staticColliders.push({ minX: cx - 5, maxX: cx + 5, minZ: cz - 5, maxZ: cz - 4 }); // Back
    staticColliders.push({ minX: cx - 5, maxX: cx - 4, minZ: cz - 5, maxZ: cz + 5 }); // Left
    staticColliders.push({ minX: cx + 4, maxX: cx + 5, minZ: cz - 5, maxZ: cz + 5 }); // Right
    staticColliders.push({ minX: cx - 5, maxX: cx - 1.5, minZ: cz + 4, maxZ: cz + 5 }); // Front L
    staticColliders.push({ minX: cx + 1.5, maxX: cx + 5, minZ: cz + 4, maxZ: cz + 5 }); // Front R
}


function createNPCs() {
    // --- MAIN WORLD NPCs ---

    // 1. Merchant (East)
    npcMerchant = createPlayerMesh('#E65100', "Merchant", 'tophat', '#000000', 'fox');
    npcMerchant.position.set(LAKE_RADIUS + 3, 0, 0);
    npcMerchant.lookAt(0, 0, 0);
    scene.add(npcMerchant);

    // 2. Stylist (West)
    npcStylist = createPlayerMesh('#FF69B4', "Stylist", 'bow', '#000000', 'bunny');
    npcStylist.position.set(-(LAKE_RADIUS + 3), 0, 0);
    npcStylist.lookAt(0, 0, 0);
    scene.add(npcStylist);

    // 3. Bait Shop (South)
    npcBait = createPlayerMesh('#32CD32', "Bait Shop", 'straw', '#000000', 'frog');
    npcBait.position.set(0, 0, LAKE_RADIUS + 3);
    npcBait.lookAt(0, 0, 0);
    scene.add(npcBait);


    // 5. Inferno Guard (Main World - Waterfall Entrance)
    npcLavaKeeper = createPlayerMesh('#8B0000', "Inferno Guard", 'viking', '#FFD700', 'dragon');
    npcLavaKeeper.position.set(16, 0, 16);
    npcLavaKeeper.lookAt(0, 0, 0);
    scene.add(npcLavaKeeper);

    // Add Icons
    addIcon(npcLavaKeeper, '🌋');
    addIcon(npcMerchant, '$');
    addIcon(npcStylist, '👕');
    addIcon(npcBait, '🪱');

    // --- LAVA WORLD NPCs (Fixed Height) ---
    // Moved Y from -2.5 to 0 so they stand ON the floor

    // Lava Merchant
    npcLavaMerchant = createPlayerMesh('#E65100', "Merchant", 'tophat', '#000000', 'fox');
    npcLavaMerchant.position.set(-20000 + 35, 0, 0);
    npcLavaMerchant.lookAt(-20000, 0, 0);
    scene.add(npcLavaMerchant);

    // Lava Stylist
    npcLavaStylist = createPlayerMesh('#FF69B4', "Stylist", 'bow', '#000000', 'bunny');
    npcLavaStylist.position.set(-20000 - 35, 0, 0);
    npcLavaStylist.lookAt(-20000, 0, 0);
    scene.add(npcLavaStylist);

    // Lava Bait
    npcLavaBait = createPlayerMesh('#32CD32', "Bait Shop", 'straw', '#000000', 'frog');
    npcLavaBait.position.set(-20000, 0, 35);
    npcLavaBait.lookAt(-20000, 0, 0);
    scene.add(npcLavaBait);


    // Add Icons for Lava Versions
    addIcon(npcLavaMerchant, '$');
    addIcon(npcLavaStylist, '👕');
    addIcon(npcLavaBait, '🪱');
}

function addIcon(parent, text) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#FFD700'; ctx.font = '50px Arial'; ctx.textAlign = 'center'; ctx.fillText(text, 32, 50);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c) }));
    s.position.y = 3.2; parent.add(s);
}

// --- DYNAMIC TEXTURE DRAWING FUNCTIONS ---
function drawHat(ctx, hatId, isBack) {
    const hat = HAT_TYPES.find(h => h.id === hatId);
    if (!hat || hat.id === 'none') return;

    ctx.fillStyle = hat.color;


    if (hat.type === 'cap') {
        ctx.fillRect(14, 0, 36, 12); ctx.fillRect(14, 0, 36, 6);
        if (!isBack) ctx.fillRect(14, 12, 40, 4);
    } else if (hat.type === 'wide') {
        ctx.fillRect(10, 8, 44, 4); ctx.fillRect(18, 0, 28, 10);
    } else if (hat.type === 'dome') {
        ctx.beginPath(); ctx.arc(32, 10, 18, Math.PI, 0); ctx.fill();
    } else if (hat.type === 'tall') {
        ctx.fillRect(12, 10, 40, 4); ctx.fillRect(18, -10, 28, 20);
    } else if (hat.type === 'cone') {
        ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(54, 10); ctx.lineTo(32, -15); ctx.fill();
    } else if (hat.type === 'horn') {
        ctx.fillRect(14, 0, 36, 10);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(14, 5); ctx.lineTo(5, -5); ctx.lineTo(14, 0); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 5); ctx.lineTo(59, -5); ctx.lineTo(50, 0); ctx.fill();
    } else if (hat.type === 'crown') {
        ctx.beginPath();
        ctx.moveTo(14, 10); ctx.lineTo(14, -5); ctx.lineTo(20, 5); ctx.lineTo(26, -5);
        ctx.lineTo(32, 5); ctx.lineTo(38, -5); ctx.lineTo(44, 5); ctx.lineTo(50, -5);
        ctx.lineTo(50, 10); ctx.fill();
    }


    else if (hat.type === 'fedora') {
        ctx.fillRect(10, 8, 44, 4);
        ctx.fillRect(16, -2, 32, 10);
        ctx.fillStyle = '#444'; ctx.fillRect(16, 4, 32, 2);
    }
    else if (hat.type === 'beret') {
        ctx.beginPath(); ctx.ellipse(34, 4, 22, 10, -0.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(34, -6); ctx.lineTo(34, -8); ctx.stroke();
    }
    else if (hat.type === 'bucket') {
        ctx.fillRect(14, 0, 36, 10);
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(8, 16); ctx.lineTo(56, 16); ctx.lineTo(50, 10); ctx.fill();
    }
    else if (hat.type === 'headphones') {
        ctx.fillStyle = '#222'; ctx.fillRect(10, 6, 8, 16); ctx.fillRect(46, 6, 8, 16);
        ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(32, 10, 22, Math.PI, 0); ctx.stroke();
    }
    else if (hat.type === 'flower') {
        if (!isBack) {
            ctx.fillStyle = '#fff';
            for (let i = 0; i < 5; i++) {
                const angle = (i / 5) * Math.PI * 2;
                ctx.beginPath(); ctx.arc(44 + Math.cos(angle) * 5, 4 + Math.sin(angle) * 5, 4, 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle = 'yellow'; ctx.beginPath(); ctx.arc(44, 4, 3, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (hat.type === 'miner') {
        ctx.fillStyle = hat.color;
        ctx.beginPath(); ctx.arc(32, 8, 18, Math.PI, 0); ctx.fill();
        if (!isBack) {
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(32, -2, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,200,0.5)'; ctx.beginPath(); ctx.moveTo(32, -2); ctx.lineTo(10, 30); ctx.lineTo(54, 30); ctx.fill();
        }
    }
    else if (hat.type === 'sombrero') {
        ctx.beginPath(); ctx.ellipse(32, 8, 28, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(22, -8, 20, 16);
    }
    else if (hat.type === 'santa') {
        ctx.fillStyle = '#ff0000';
        ctx.beginPath(); ctx.moveTo(12, 10); ctx.lineTo(52, 10); ctx.lineTo(20, -15); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(12, 8, 40, 6);
        ctx.beginPath(); ctx.arc(20, -15, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (hat.type === 'witch') {
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(32, 10, 24, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = hat.color; ctx.beginPath(); ctx.moveTo(20, 10); ctx.lineTo(44, 10); ctx.lineTo(32, -20); ctx.fill();
    }
    else if (hat.type === 'ninja') {
        ctx.fillRect(14, 4, 36, 6);
        ctx.fillStyle = 'red'; ctx.beginPath(); ctx.arc(32, 7, 2, 0, Math.PI * 2); ctx.fill();
        if (isBack) { ctx.fillStyle = hat.color; ctx.fillRect(30, 6, 4, 20); }
    }
    else if (hat.type === 'propeller') {
        ctx.fillStyle = hat.color; ctx.beginPath(); ctx.arc(32, 8, 17, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#555'; ctx.fillRect(31, -10, 2, 6);
        if (!isBack) {
            ctx.fillStyle = 'red'; ctx.beginPath(); ctx.ellipse(32, -10, 10, 2, 0, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (hat.type === 'halo') {
        ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(32, -10, 14, 4, 0, 0, Math.PI * 2); ctx.stroke();
    }
    else if (hat.type === 'antlers') {
        ctx.strokeStyle = '#5D4037'; ctx.lineWidth = 2;

        ctx.beginPath(); ctx.moveTo(20, 5); ctx.lineTo(10, -10); ctx.lineTo(15, -15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(5, -12); ctx.stroke();

        ctx.beginPath(); ctx.moveTo(44, 5); ctx.lineTo(54, -10); ctx.lineTo(49, -15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(54, -10); ctx.lineTo(59, -12); ctx.stroke();
    }
    else if (hat.type === 'police') {
        ctx.fillRect(14, -5, 36, 15);
        ctx.fillStyle = 'black'; ctx.fillRect(14, 8, 36, 4);
        if (!isBack) { ctx.fillStyle = 'gold'; ctx.beginPath(); ctx.arc(32, 0, 3, 0, Math.PI * 2); ctx.fill(); }
    }
    else if (hat.type === 'tv') {
        ctx.fillStyle = '#444'; ctx.fillRect(10, -5, 44, 35);
        if (!isBack) {
            ctx.fillStyle = '#222'; ctx.fillRect(14, 0, 36, 25);
            ctx.fillStyle = '#00ff00'; ctx.fillRect(18, 5, 4, 4); ctx.fillRect(24, 15, 12, 2);
        }

        ctx.strokeStyle = '#888'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(20, -5); ctx.lineTo(10, -15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(44, -5); ctx.lineTo(54, -15); ctx.stroke();
    }
    else if (hat.type === 'plunger') {
        ctx.fillStyle = 'brown'; ctx.fillRect(30, -15, 4, 25);
        ctx.fillStyle = '#cd5c5c'; ctx.beginPath(); ctx.arc(32, 10, 10, Math.PI, 0); ctx.fill();
    }
    else if (hat.type === 'arrow') {
        ctx.fillStyle = '#8B4513';

        if (!isBack) ctx.fillRect(0, 15, 14, 2);
        ctx.fillRect(50, 13, 14, 2);

        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(-5, 10); ctx.lineTo(-5, 20); ctx.fill();

        ctx.fillStyle = 'grey'; ctx.beginPath(); ctx.moveTo(64, 14); ctx.lineTo(70, 14); ctx.lineTo(64, 10); ctx.fill();
    }
    else if (hat.type === 'grad') {
        ctx.fillStyle = hat.color;
        ctx.fillRect(16, 8, 32, 4);
        ctx.beginPath(); ctx.moveTo(32, -5); ctx.lineTo(60, 5); ctx.lineTo(32, 15); ctx.lineTo(4, 5); ctx.fill();
        if (isBack) { ctx.strokeStyle = 'gold'; ctx.beginPath(); ctx.moveTo(32, -5); ctx.lineTo(32, 10); ctx.stroke(); }
    }
    else if (hat.type === 'rainbow') {

        for (let i = 0; i < 20; i++) {
            ctx.fillStyle = `hsl(${i * 18}, 100%, 50%)`;
            const x = 32 + (Math.random() - 0.5) * 40;
            const y = 10 + (Math.random() - 0.5) * 30;
            ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (hat.type === 'void') {

        ctx.fillStyle = '#000'; ctx.fillRect(14, 10, 36, 24);
        if (!isBack) {
            ctx.fillStyle = '#fff';

            ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
            ctx.fillRect(20, 18, 6, 2); ctx.fillRect(38, 18, 6, 2);
            ctx.shadowBlur = 0;
        }
    }
    else if (hat.type === 'diamond') {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(14, 8, 36, 4);

        ctx.fillStyle = '#00ffff';
        ctx.beginPath(); ctx.moveTo(32, 8); ctx.lineTo(32, -5); ctx.lineTo(28, 8); ctx.fill();
        ctx.beginPath(); ctx.moveTo(20, 8); ctx.lineTo(20, 0); ctx.lineTo(16, 8); ctx.fill();
        ctx.beginPath(); ctx.moveTo(44, 8); ctx.lineTo(44, 0); ctx.lineTo(48, 8); ctx.fill();
    }
}

window.toggleMidiMute = function () {
    saveState.midiMuted = !saveState.midiMuted;
    saveGame();
    updateMidiUI();
}

function updateMidiUI() {
    const btn = document.getElementById('btn-midi-toggle');
    if (btn) {
        btn.innerText = saveState.midiMuted ? "🎸 MIDI: OFF" : "🎸 MIDI: ON";
        btn.style.color = saveState.midiMuted ? '#ff4444' : '#44ff44';
    }
}

// --- MODULAR CHARACTER DRAWING FUNCTIONS ---

// Draw the base body and head (shared by all characters)
function drawBody(ctx, col, bellyCol, back) {
    // Body Box
    ctx.fillStyle = col;
    ctx.fillRect(20, 30, 24, 30);

    if (!back) {
        ctx.fillStyle = bellyCol;
        ctx.fillRect(24, 35, 16, 20); // Belly Patch
    }

    // Standard Head (36x24)
    ctx.fillStyle = col;
    ctx.fillRect(14, 10, 36, 24);
}

// Draw ears based on selected type
function drawEars(ctx, earId, col, bellyCol, back) {
    ctx.fillStyle = col;

    if (earId === 'cat') {
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(14, 0); ctx.lineTo(24, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(50, 0); ctx.lineTo(40, 10); ctx.fill();
    }
    else if (earId === 'bunny') {
        ctx.fillRect(18, -4, 8, 16); ctx.fillRect(38, -4, 8, 16);
        if (!back) {
            ctx.fillStyle = bellyCol;
            ctx.fillRect(20, -2, 4, 12); ctx.fillRect(40, -2, 4, 12);
        }
    }
    else if (earId === 'dog') {
        ctx.fillRect(10, 12, 6, 12); ctx.fillRect(48, 12, 6, 12);
    }
    else if (earId === 'bear') {
        ctx.beginPath(); ctx.arc(14, 10, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 10, 5, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'fox') {
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(10, -5); ctx.lineTo(24, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(54, -5); ctx.lineTo(40, 10); ctx.fill();
    }
    else if (earId === 'pig') {
        ctx.beginPath(); ctx.moveTo(14, 12); ctx.lineTo(8, 8); ctx.lineTo(18, 16); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 12); ctx.lineTo(56, 8); ctx.lineTo(46, 16); ctx.fill();
    }
    else if (earId === 'dragon') {
        // Uses custom color (no more hardcoded #eee)
        ctx.beginPath(); ctx.moveTo(18, 10); ctx.lineTo(14, -2); ctx.lineTo(24, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(46, 10); ctx.lineTo(50, -2); ctx.lineTo(40, 10); ctx.fill();
    }
    else if (earId === 'mouse') {
        ctx.beginPath(); ctx.arc(14, 8, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 8, 8, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'raccoon') {
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(10, 0); ctx.lineTo(24, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(54, 0); ctx.lineTo(40, 10); ctx.fill();
    }
    else if (earId === 'koala') {
        // Uses custom color (no more hardcoded #ddd)
        ctx.beginPath(); ctx.arc(12, 14, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(52, 14, 6, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'cow') {
        // Horns use custom color
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(8, 4); ctx.lineTo(18, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(56, 4); ctx.lineTo(46, 10); ctx.fill();
        ctx.fillRect(8, 16, 6, 4); ctx.fillRect(50, 16, 6, 4);
    }
    else if (earId === 'monkey') {
        ctx.beginPath(); ctx.arc(12, 20, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(52, 20, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'protogen') {
        // Robotic angular ears - uses custom color with darker accent
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(8, -6); ctx.lineTo(24, 10); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(56, -6); ctx.lineTo(40, 10); ctx.closePath(); ctx.fill();
        // Accent stripe (slightly darker)
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(12, 4, 2, 4); ctx.fillRect(50, 4, 2, 4);
    }
    // --- NEW 25 SPECIES EARS ---
    else if (earId === 'wolf') {
        // Sharp pointed wolf ears
        ctx.beginPath(); ctx.moveTo(12, 10); ctx.lineTo(8, -4); ctx.lineTo(22, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(52, 10); ctx.lineTo(56, -4); ctx.lineTo(42, 10); ctx.fill();
        // Inner ear
        if (!back) {
            ctx.fillStyle = bellyCol;
            ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(12, 2); ctx.lineTo(20, 10); ctx.fill();
            ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(52, 2); ctx.lineTo(44, 10); ctx.fill();
        }
    }
    else if (earId === 'deer') {
        // Antlers
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(16, 2, 3, 10); ctx.fillRect(45, 2, 3, 10);
        ctx.fillRect(12, 0, 8, 3); ctx.fillRect(44, 0, 8, 3);
        ctx.fillRect(10, -4, 3, 6); ctx.fillRect(51, -4, 3, 6);
    }
    else if (earId === 'owl') {
        // Feather tufts
        ctx.beginPath(); ctx.moveTo(16, 10); ctx.lineTo(14, -2); ctx.lineTo(22, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(48, 10); ctx.lineTo(50, -2); ctx.lineTo(42, 10); ctx.fill();
    }
    else if (earId === 'bat') {
        // Large bat ears
        ctx.beginPath(); ctx.moveTo(10, 14); ctx.lineTo(6, -6); ctx.lineTo(26, 14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(54, 14); ctx.lineTo(58, -6); ctx.lineTo(38, 14); ctx.fill();
        // Inner ear membrane
        if (!back) {
            ctx.fillStyle = bellyCol;
            ctx.beginPath(); ctx.moveTo(12, 12); ctx.lineTo(10, 0); ctx.lineTo(22, 12); ctx.fill();
            ctx.beginPath(); ctx.moveTo(52, 12); ctx.lineTo(54, 0); ctx.lineTo(42, 12); ctx.fill();
        }
    }
    else if (earId === 'shark') {
        // Fin-like ears
        ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(18, 0); ctx.lineTo(22, 14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(42, 14); ctx.lineTo(46, 0); ctx.lineTo(50, 14); ctx.fill();
    }
    else if (earId === 'dolphin' || earId === 'snake') {
        // No visible ears - do nothing
    }
    else if (earId === 'tiger' || earId === 'leopard') {
        // Round cat-like ears
        ctx.beginPath(); ctx.arc(16, 8, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(48, 8, 6, 0, Math.PI * 2); ctx.fill();
        if (!back) {
            ctx.fillStyle = bellyCol;
            ctx.beginPath(); ctx.arc(16, 8, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(48, 8, 3, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'rhino') {
        // Small ears with horn
        ctx.beginPath(); ctx.arc(14, 12, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 12, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'elephant') {
        // Large floppy elephant ears
        ctx.beginPath();
        ctx.ellipse(8, 20, 10, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(56, 20, 10, 14, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    else if (earId === 'hippo') {
        // Small round hippo ears
        ctx.beginPath(); ctx.arc(16, 8, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(48, 8, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'giraffe') {
        // Ossicones (horn-like)
        ctx.fillRect(18, 0, 4, 12); ctx.fillRect(42, 0, 4, 12);
        ctx.beginPath(); ctx.arc(20, 0, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(44, 0, 3, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'zebra') {
        // Upright zebra ears
        ctx.fillRect(14, 0, 6, 12); ctx.fillRect(44, 0, 6, 12);
        if (!back) {
            ctx.fillStyle = bellyCol;
            ctx.fillRect(16, 2, 2, 8); ctx.fillRect(46, 2, 2, 8);
        }
    }
    else if (earId === 'panda') {
        // Round black panda ears
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(14, 8, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 8, 6, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'red_panda') {
        // Fluffy red panda ears
        ctx.beginPath(); ctx.arc(14, 8, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 8, 7, 0, Math.PI * 2); ctx.fill();
        if (!back) {
            ctx.fillStyle = bellyCol;
            ctx.beginPath(); ctx.arc(14, 8, 4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(50, 8, 4, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'skunk') {
        // Pointed skunk ears
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(12, 0); ctx.lineTo(22, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(52, 0); ctx.lineTo(42, 10); ctx.fill();
    }
    else if (earId === 'otter' || earId === 'beaver') {
        // Small round ears
        ctx.beginPath(); ctx.arc(14, 10, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 10, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'hedgehog') {
        // Small spiky ears
        ctx.beginPath(); ctx.moveTo(14, 12); ctx.lineTo(12, 6); ctx.lineTo(18, 12); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 12); ctx.lineTo(52, 6); ctx.lineTo(46, 12); ctx.fill();
    }
    else if (earId === 'squirrel') {
        // Tufted squirrel ears
        ctx.beginPath(); ctx.moveTo(14, 10); ctx.lineTo(10, -2); ctx.lineTo(20, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(54, -2); ctx.lineTo(44, 10); ctx.fill();
        // Tufts
        ctx.fillRect(8, -4, 3, 4); ctx.fillRect(53, -4, 3, 4);
    }
    else if (earId === 'chipmunk') {
        // Small rounded chipmunk ears
        ctx.beginPath(); ctx.arc(14, 10, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 10, 5, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'hamster') {
        // Tiny round hamster ears
        ctx.beginPath(); ctx.arc(16, 10, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(48, 10, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (earId === 'chinchilla') {
        // Large round chinchilla ears
        ctx.beginPath(); ctx.arc(12, 10, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(52, 10, 8, 0, Math.PI * 2); ctx.fill();
        if (!back) {
            ctx.fillStyle = bellyCol;
            ctx.beginPath(); ctx.arc(12, 10, 5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(52, 10, 5, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (earId === 'ferret') {
        // Small rounded ferret ears
        ctx.beginPath(); ctx.arc(14, 12, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(50, 12, 4, 0, Math.PI * 2); ctx.fill();
    }
}

// Draw eyes based on selected type (front only)
function drawEyes(ctx, eyeId, eyeCol) {
    if (eyeId === 'standard') {
        ctx.fillStyle = 'white';
        ctx.fillRect(20, 18, 8, 8); ctx.fillRect(36, 18, 8, 8);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(24, 20, 4, 4); ctx.fillRect(40, 20, 4, 4);
    }
    else if (eyeId === 'dragon') {
        ctx.fillStyle = 'white';
        ctx.fillRect(20, 18, 8, 8); ctx.fillRect(36, 18, 8, 8);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(24, 18, 4, 8); ctx.fillRect(40, 18, 4, 8); // Slit pupils
    }
    else if (eyeId === 'frog') {
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(19, 15, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(45, 15, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(19, 15, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(45, 15, 2, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'cute') {
        // Big round cute eyes
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(24, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(25, 21, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(41, 21, 4, 0, Math.PI * 2); ctx.fill();
        // Shine
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(23, 18, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(39, 18, 2, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'sleepy') {
        // Half-closed sleepy eyes
        ctx.fillStyle = 'white';
        ctx.fillRect(20, 20, 8, 4); ctx.fillRect(36, 20, 8, 4);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(23, 21, 4, 3); ctx.fillRect(39, 21, 4, 3);
        // Eyelids
        ctx.fillStyle = '#333';
        ctx.fillRect(20, 18, 8, 2); ctx.fillRect(36, 18, 8, 2);
    }
    else if (eyeId === 'angry') {
        // Angry eyes with angled brows
        ctx.fillStyle = 'white';
        ctx.fillRect(20, 18, 8, 8); ctx.fillRect(36, 18, 8, 8);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(24, 20, 4, 4); ctx.fillRect(40, 20, 4, 4);
        // Angry brows
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.moveTo(18, 16); ctx.lineTo(28, 18); ctx.lineTo(28, 16); ctx.lineTo(18, 14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(46, 16); ctx.lineTo(36, 18); ctx.lineTo(36, 16); ctx.lineTo(46, 14); ctx.fill();
    }
    else if (eyeId === 'cat_eyes') {
        // Vertical slit cat eyes
        ctx.fillStyle = '#ffffaa'; // Yellow-ish
        ctx.beginPath(); ctx.arc(24, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.fillRect(23, 16, 2, 8); ctx.fillRect(39, 16, 2, 8);
    }
    else if (eyeId === 'sparkle') {
        // Sparkle/star eyes
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(24, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        // Stars
        const drawStar = (cx, cy) => {
            ctx.beginPath();
            ctx.moveTo(cx, cy - 3);
            ctx.lineTo(cx + 1, cy - 1);
            ctx.lineTo(cx + 3, cy);
            ctx.lineTo(cx + 1, cy + 1);
            ctx.lineTo(cx, cy + 3);
            ctx.lineTo(cx - 1, cy + 1);
            ctx.lineTo(cx - 3, cy);
            ctx.lineTo(cx - 1, cy - 1);
            ctx.closePath();
            ctx.fill();
        };
        drawStar(24, 20); drawStar(40, 20);
    }
    else if (eyeId === 'dizzy') {
        // Dizzy spiral eyes
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(24, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = eyeCol; ctx.lineWidth = 1.5;
        // Spirals
        ctx.beginPath(); ctx.arc(24, 20, 2, 0, Math.PI * 3); ctx.stroke();
        ctx.beginPath(); ctx.arc(40, 20, 2, 0, Math.PI * 3); ctx.stroke();
    }
    else if (eyeId === 'heart') {
        // Heart-shaped pupils
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(24, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff4444';
        // Hearts
        const drawHeart = (cx, cy) => {
            ctx.beginPath();
            ctx.moveTo(cx, cy + 2);
            ctx.bezierCurveTo(cx - 3, cy - 1, cx - 3, cy - 3, cx, cy - 1);
            ctx.bezierCurveTo(cx + 3, cy - 3, cx + 3, cy - 1, cx, cy + 2);
            ctx.fill();
        };
        drawHeart(24, 20); drawHeart(40, 20);
    }
    else if (eyeId === 'x_eyes') {
        // X eyes (knocked out)
        ctx.strokeStyle = eyeCol; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(20, 16); ctx.lineTo(28, 24); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(28, 16); ctx.lineTo(20, 24); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(36, 16); ctx.lineTo(44, 24); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(44, 16); ctx.lineTo(36, 24); ctx.stroke();
    }
    else if (eyeId === 'dot') {
        // Simple dot eyes
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(24, 20, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 3, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'protogen') {
        // Glowing visor eyes - angular LED style, uses custom eye color
        ctx.fillStyle = eyeCol;
        // Left eye - angular chevron
        ctx.beginPath(); ctx.moveTo(18, 18); ctx.lineTo(26, 22); ctx.lineTo(18, 26); ctx.lineTo(20, 22); ctx.closePath(); ctx.fill();
        // Right eye - angular chevron
        ctx.beginPath(); ctx.moveTo(46, 18); ctx.lineTo(38, 22); ctx.lineTo(46, 26); ctx.lineTo(44, 22); ctx.closePath(); ctx.fill();
        // Glow effect
        ctx.shadowColor = eyeCol;
        ctx.shadowBlur = 4;
        ctx.fillRect(20, 20, 6, 4);
        ctx.fillRect(38, 20, 6, 4);
        ctx.shadowBlur = 0;
    }
    // --- NEW EYE TYPES ---
    else if (eyeId === 'wolf') {
        // Fierce wolf eyes
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(18, 18, 10, 8); ctx.fillRect(36, 18, 10, 8);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(24, 18, 4, 8); ctx.fillRect(40, 18, 4, 8);
        // Angry brow
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.moveTo(16, 16); ctx.lineTo(28, 18); ctx.lineTo(28, 16); ctx.fill();
        ctx.beginPath(); ctx.moveTo(48, 16); ctx.lineTo(36, 18); ctx.lineTo(36, 16); ctx.fill();
    }
    else if (eyeId === 'owl') {
        // Large round owl eyes
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath(); ctx.arc(22, 20, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 20, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(22, 20, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 20, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'shark') {
        // Dark beady shark eyes
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(22, 20, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 20, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'snake') {
        // Slit snake eyes
        ctx.fillStyle = '#ffffaa';
        ctx.beginPath(); ctx.ellipse(24, 20, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(40, 20, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.fillRect(23, 15, 2, 10); ctx.fillRect(39, 15, 2, 10);
    }
    else if (eyeId === 'tired') {
        // Tired eyes with bags
        ctx.fillStyle = 'white';
        ctx.fillRect(20, 20, 8, 6); ctx.fillRect(36, 20, 8, 6);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(24, 21, 4, 4); ctx.fillRect(40, 21, 4, 4);
        // Bags under eyes
        ctx.fillStyle = 'rgba(100,80,120,0.4)';
        ctx.fillRect(20, 26, 8, 2); ctx.fillRect(36, 26, 8, 2);
    }
    else if (eyeId === 'wink') {
        // One eye open, one winking
        ctx.fillStyle = 'white';
        ctx.fillRect(20, 18, 8, 8);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(24, 20, 4, 4);
        // Wink (closed eye)
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(40, 22, 4, 0, Math.PI); ctx.fill();
    }
    else if (eyeId === 'crying') {
        // Crying eyes with tears
        ctx.fillStyle = 'white';
        ctx.fillRect(20, 18, 8, 8); ctx.fillRect(36, 18, 8, 8);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(24, 20, 4, 4); ctx.fillRect(40, 20, 4, 4);
        // Tears
        ctx.fillStyle = '#88ccff';
        ctx.fillRect(22, 26, 2, 6); ctx.fillRect(42, 26, 2, 6);
    }
    else if (eyeId === 'star') {
        // Star-shaped pupils
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(24, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        const star = (cx, cy) => { ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = (i * 4 * Math.PI) / 5 - Math.PI / 2; ctx.lineTo(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3); } ctx.fill(); };
        star(24, 20); star(40, 20);
    }
    else if (eyeId === 'spiral') {
        // Hypnotic spiral eyes
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(24, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = eyeCol; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(24, 20, 4, 0, Math.PI * 4); ctx.stroke();
        ctx.beginPath(); ctx.arc(40, 20, 4, 0, Math.PI * 4); ctx.stroke();
    }
    else if (eyeId === 'closed') {
        // Happy closed eyes
        ctx.strokeStyle = eyeCol; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(24, 22, 4, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(40, 22, 4, Math.PI, 0); ctx.stroke();
    }
    else if (eyeId === 'wide') {
        // Wide surprised eyes
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(24, 20, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(24, 20, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 3, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'beady') {
        // Small beady eyes
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(24, 22, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 22, 2, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'anime') {
        // Large anime eyes with shine
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(22, 20, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 20, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeCol;
        ctx.beginPath(); ctx.arc(23, 21, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(43, 21, 5, 0, Math.PI * 2); ctx.fill();
        // Shine spots
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(20, 18, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 18, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(24, 23, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(44, 23, 1, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'glasses') {
        // Eyes with glasses
        ctx.fillStyle = 'white';
        ctx.fillRect(18, 18, 10, 8); ctx.fillRect(36, 18, 10, 8);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(22, 20, 4, 4); ctx.fillRect(40, 20, 4, 4);
        // Glasses frames
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.strokeRect(16, 16, 14, 12); ctx.strokeRect(34, 16, 14, 12);
        ctx.beginPath(); ctx.moveTo(30, 22); ctx.lineTo(34, 22); ctx.stroke();
    }
    else if (eyeId === 'sunglasses') {
        // Cool sunglasses
        ctx.fillStyle = '#111';
        ctx.fillRect(16, 16, 14, 10); ctx.fillRect(34, 16, 14, 10);
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.strokeRect(16, 16, 14, 10); ctx.strokeRect(34, 16, 14, 10);
        ctx.beginPath(); ctx.moveTo(30, 20); ctx.lineTo(34, 20); ctx.stroke();
    }
    else if (eyeId === 'monocle') {
        // One eye normal, one with monocle
        ctx.fillStyle = 'white';
        ctx.fillRect(20, 18, 8, 8); ctx.fillRect(36, 18, 8, 8);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(24, 20, 4, 4); ctx.fillRect(40, 20, 4, 4);
        // Monocle on right eye
        ctx.strokeStyle = '#c9a000'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(40, 22, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(46, 26); ctx.lineTo(50, 34); ctx.stroke();
    }
    else if (eyeId === 'eyepatch') {
        // Pirate eyepatch
        ctx.fillStyle = 'white';
        ctx.fillRect(20, 18, 8, 8);
        ctx.fillStyle = eyeCol;
        ctx.fillRect(24, 20, 4, 4);
        // Eyepatch on right eye
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(40, 22, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(34, 18); ctx.lineTo(50, 10); ctx.stroke();
    }
    else if (eyeId === 'cross') {
        // Cross/plus shaped eyes
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(24, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = eyeCol; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(22, 20); ctx.lineTo(26, 20); ctx.moveTo(24, 18); ctx.lineTo(24, 22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(38, 20); ctx.lineTo(42, 20); ctx.moveTo(40, 18); ctx.lineTo(40, 22); ctx.stroke();
    }
    else if (eyeId === 'dollar') {
        // Dollar sign eyes
        ctx.fillStyle = '#44ff44';
        ctx.beginPath(); ctx.arc(24, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = '10px Arial';
        ctx.fillText('$', 21, 24); ctx.fillText('$', 37, 24);
    }
    else if (eyeId === 'fire') {
        // Fiery eyes
        ctx.fillStyle = '#ff4400';
        ctx.beginPath(); ctx.arc(24, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath(); ctx.arc(24, 20, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(24, 20, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 1, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'galaxy') {
        // Galaxy/cosmic eyes
        ctx.fillStyle = '#220044';
        ctx.beginPath(); ctx.arc(24, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff88ff';
        ctx.beginPath(); ctx.arc(22, 18, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(38, 18, 1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8888ff';
        ctx.beginPath(); ctx.arc(26, 22, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 22, 1, 0, Math.PI * 2); ctx.fill();
    }
    else if (eyeId === 'robot') {
        // Robot LED eyes
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(20, 18, 8, 8); ctx.fillRect(36, 18, 8, 8);
        ctx.fillStyle = '#003300';
        ctx.fillRect(22, 20, 2, 4); ctx.fillRect(24, 20, 2, 4);
        ctx.fillRect(38, 20, 2, 4); ctx.fillRect(40, 20, 2, 4);
    }
    else if (eyeId === 'demon') {
        // Demonic red eyes
        ctx.fillStyle = '#ff0000';
        ctx.beginPath(); ctx.arc(24, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 20, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillRect(23, 17, 2, 6); ctx.fillRect(39, 17, 2, 6);
    }
    else if (eyeId === 'alien') {
        // Large black alien eyes
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(22, 20, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(42, 20, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.arc(20, 16, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 16, 2, 0, Math.PI * 2); ctx.fill();
    }
}

// Draw nose/mouth based on selected type (front only)
// noseCol is optional - if empty/null, uses per-nose-type defaults
function drawNose(ctx, noseId, bellyCol, noseCol) {
    // Helper to get color: use custom if provided, otherwise use default
    const getCol = (defaultColor) => (noseCol && noseCol !== '') ? noseCol : defaultColor;

    if (noseId === 'cat') {
        ctx.fillStyle = getCol('pink');
        ctx.fillRect(30, 28, 4, 2);
    }
    else if (noseId === 'dog') {
        ctx.fillStyle = getCol('black');
        ctx.fillRect(29, 26, 6, 4);
        ctx.strokeStyle = 'black'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(32, 30); ctx.lineTo(32, 33); ctx.stroke();
    }
    else if (noseId === 'bear') {
        ctx.fillStyle = getCol('#dcb');
        ctx.beginPath(); ctx.arc(32, 28, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'black';
        ctx.fillRect(30, 26, 4, 3);
    }
    else if (noseId === 'pig') {
        ctx.fillStyle = getCol('#ffaaaa');
        ctx.fillRect(26, 26, 12, 6);
        ctx.fillStyle = '#cc6666';
        ctx.fillRect(28, 28, 2, 2); ctx.fillRect(34, 28, 2, 2);
    }
    else if (noseId === 'duck') {
        ctx.fillStyle = getCol('orange');
        ctx.beginPath(); ctx.ellipse(32, 28, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    else if (noseId === 'dragon') {
        ctx.fillStyle = getCol(bellyCol || '#fff');
        ctx.fillRect(28, 26, 8, 6);
        ctx.fillStyle = 'black';
        ctx.fillRect(29, 28, 2, 2); ctx.fillRect(33, 28, 2, 2);
    }
    else if (noseId === 'mouse') {
        ctx.fillStyle = getCol('pink');
        ctx.fillRect(30, 28, 4, 3);
        ctx.fillStyle = 'black';
        ctx.fillRect(24, 28, 6, 1); ctx.fillRect(34, 28, 6, 1); // Whiskers
    }
    else if (noseId === 'axolotl') {
        ctx.fillStyle = getCol('black');
        ctx.fillRect(30, 28, 4, 1); // Tiny smile
    }
    else if (noseId === 'koala') {
        ctx.fillStyle = getCol('#333');
        ctx.beginPath(); ctx.ellipse(32, 26, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
    }
    else if (noseId === 'cow') {
        ctx.fillStyle = getCol('pink');
        ctx.fillRect(24, 26, 16, 6);
        ctx.fillStyle = 'black';
        ctx.fillRect(26, 28, 2, 2); ctx.fillRect(36, 28, 2, 2);
    }
    else if (noseId === 'frog') {
        ctx.fillStyle = getCol('#003300');
        ctx.fillRect(22, 26, 20, 2);
    }
    else if (noseId === 'penguin') {
        ctx.fillStyle = getCol('orange');
        ctx.beginPath(); ctx.moveTo(28, 28); ctx.lineTo(36, 28); ctx.lineTo(32, 34); ctx.fill();
    }
    else if (noseId === 'monkey') {
        ctx.fillStyle = getCol('#eec');
        ctx.fillRect(26, 26, 12, 6);
        ctx.fillStyle = 'black';
        ctx.fillRect(30, 27, 4, 1);
    }
    else if (noseId === 'protogen') {
        // Visor screen mouth - uses custom color or default cyan
        const col = getCol('#00ffff');
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 3;
        ctx.fillRect(22, 28, 20, 3);
        ctx.shadowBlur = 0;
        // Mouth expression line
        ctx.fillStyle = '#00aaaa';
        ctx.fillRect(26, 29, 12, 1);
    }
    // --- NEW NOSE TYPES ---
    else if (noseId === 'wolf') {
        // Long wolf snout
        ctx.fillStyle = getCol(bellyCol || '#ccc');
        ctx.fillRect(26, 24, 12, 10);
        ctx.fillStyle = 'black';
        ctx.fillRect(30, 24, 4, 3);
    }
    else if (noseId === 'deer') {
        // Small deer nose
        ctx.fillStyle = getCol('black');
        ctx.fillRect(29, 27, 6, 3);
    }
    else if (noseId === 'owl') {
        // Small beak
        ctx.fillStyle = getCol('#cc8800');
        ctx.beginPath(); ctx.moveTo(28, 26); ctx.lineTo(36, 26); ctx.lineTo(32, 32); ctx.fill();
    }
    else if (noseId === 'bat') {
        // Flat bat nose
        ctx.fillStyle = getCol('#666');
        ctx.fillRect(28, 26, 8, 4);
        ctx.fillStyle = '#333';
        ctx.fillRect(29, 27, 2, 2); ctx.fillRect(33, 27, 2, 2);
    }
    else if (noseId === 'shark') {
        // Shark gills/nose
        ctx.fillStyle = getCol('#888');
        ctx.fillRect(28, 28, 8, 2);
        // Gills on side
        ctx.fillStyle = '#555';
        ctx.fillRect(16, 26, 4, 1); ctx.fillRect(16, 28, 4, 1); ctx.fillRect(16, 30, 4, 1);
        ctx.fillRect(44, 26, 4, 1); ctx.fillRect(44, 28, 4, 1); ctx.fillRect(44, 30, 4, 1);
    }
    else if (noseId === 'dolphin') {
        // Long dolphin snout
        ctx.fillStyle = getCol(bellyCol || '#ccc');
        ctx.fillRect(26, 26, 12, 6);
        ctx.fillStyle = '#333';
        ctx.fillRect(26, 30, 12, 1);
    }
    else if (noseId === 'snake') {
        // Forked tongue
        ctx.fillStyle = getCol('#333');
        ctx.fillRect(30, 28, 4, 2);
        ctx.fillStyle = '#ff4466';
        ctx.fillRect(30, 30, 1, 4); ctx.fillRect(33, 30, 1, 4);
    }
    else if (noseId === 'tiger') {
        // Tiger nose with whiskers
        ctx.fillStyle = getCol('black');
        ctx.fillRect(29, 26, 6, 4);
        // Whiskers
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(18, 28); ctx.lineTo(28, 28); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(36, 28); ctx.lineTo(46, 28); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(18, 30); ctx.lineTo(28, 30); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(36, 30); ctx.lineTo(46, 30); ctx.stroke();
    }
    else if (noseId === 'rhino') {
        // Horn on nose
        ctx.fillStyle = getCol('#888');
        ctx.beginPath(); ctx.moveTo(28, 28); ctx.lineTo(32, 18); ctx.lineTo(36, 28); ctx.fill();
        ctx.fillStyle = '#666';
        ctx.fillRect(28, 28, 8, 4);
    }
    else if (noseId === 'elephant') {
        // Trunk
        ctx.fillStyle = getCol(bellyCol || '#ccc');
        ctx.fillRect(30, 26, 4, 12);
        ctx.fillRect(28, 36, 8, 4);
    }
    else if (noseId === 'hippo') {
        // Wide hippo nose
        ctx.fillStyle = getCol('#dca');
        ctx.fillRect(22, 26, 20, 8);
        ctx.fillStyle = '#666';
        ctx.fillRect(26, 28, 3, 3); ctx.fillRect(35, 28, 3, 3);
    }
    else if (noseId === 'giraffe') {
        // Spotted giraffe nose
        ctx.fillStyle = getCol('#b8860b');
        ctx.fillRect(28, 26, 8, 6);
        ctx.fillStyle = '#8b6914';
        ctx.fillRect(29, 27, 2, 2); ctx.fillRect(33, 28, 2, 2);
    }
    else if (noseId === 'zebra') {
        // Striped zebra nose
        ctx.fillStyle = getCol('#333');
        ctx.fillRect(28, 26, 8, 6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(30, 26, 2, 6);
    }
    else if (noseId === 'panda') {
        // Black panda nose
        ctx.fillStyle = getCol('black');
        ctx.fillRect(29, 27, 6, 4);
    }
    else if (noseId === 'skunk') {
        // Pink skunk nose
        ctx.fillStyle = getCol('pink');
        ctx.fillRect(30, 28, 4, 2);
    }
    else if (noseId === 'otter') {
        // Otter nose with whiskers
        ctx.fillStyle = getCol('black');
        ctx.fillRect(29, 27, 6, 3);
        // Whiskers
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(20, 28); ctx.lineTo(28, 28); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(36, 28); ctx.lineTo(44, 28); ctx.stroke();
    }
    else if (noseId === 'beaver') {
        // Beaver with buck teeth
        ctx.fillStyle = getCol('black');
        ctx.fillRect(29, 26, 6, 3);
        ctx.fillStyle = '#fff';
        ctx.fillRect(30, 30, 2, 4); ctx.fillRect(32, 30, 2, 4);
    }
    else if (noseId === 'hedgehog') {
        // Small dark hedgehog nose
        ctx.fillStyle = getCol('#333');
        ctx.fillRect(30, 28, 4, 2);
    }
    else if (noseId === 'squirrel' || noseId === 'hamster') {
        // Tiny pink nose
        ctx.fillStyle = getCol('pink');
        ctx.fillRect(30, 28, 4, 2);
    }
    else if (noseId === 'ferret') {
        // Small pink ferret nose
        ctx.fillStyle = getCol('pink');
        ctx.fillRect(30, 27, 4, 3);
    }
    else if (noseId === 'bird') {
        // Pointed bird beak
        ctx.fillStyle = getCol('orange');
        ctx.beginPath(); ctx.moveTo(26, 28); ctx.lineTo(38, 28); ctx.lineTo(32, 36); ctx.fill();
    }
    else if (noseId === 'smile') {
        // Simple smile
        ctx.strokeStyle = getCol('#333'); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(32, 28, 4, 0, Math.PI); ctx.stroke();
    }
    else if (noseId === 'blep') {
        // Cat nose with tongue sticking out
        ctx.fillStyle = getCol('pink');
        ctx.fillRect(30, 28, 4, 2);
        // Tongue
        ctx.fillStyle = '#ff6688';
        ctx.fillRect(31, 30, 2, 4);
    }
}

// Draw misc extras (wings, gills, mane, mask, etc.)
// col is the custom misc color
function drawMisc(ctx, miscId, col, bellyCol, back) {
    if (miscId === 'none') return;

    if (miscId === 'fox_cheeks') {
        if (!back) {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.moveTo(14, 34); ctx.lineTo(32, 34); ctx.lineTo(14, 24); ctx.fill();
            ctx.beginPath(); ctx.moveTo(50, 34); ctx.lineTo(32, 34); ctx.lineTo(50, 24); ctx.fill();
        }
    }
    else if (miscId === 'dragon_wings') {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(22, 35); ctx.lineTo(6, 25); ctx.lineTo(14, 45); ctx.fill();
        ctx.beginPath(); ctx.moveTo(42, 35); ctx.lineTo(58, 25); ctx.lineTo(50, 45); ctx.fill();
    }
    else if (miscId === 'axolotl_gills') {
        ctx.fillStyle = col;
        ctx.fillRect(8, 14, 6, 2); ctx.fillRect(8, 18, 6, 2); ctx.fillRect(8, 22, 6, 2);
        ctx.fillRect(50, 14, 6, 2); ctx.fillRect(50, 18, 6, 2); ctx.fillRect(50, 22, 6, 2);
    }
    else if (miscId === 'raccoon_mask') {
        if (!back) {
            ctx.fillStyle = col;
            ctx.fillRect(14, 18, 36, 8);
        }
    }
    else if (miscId === 'lion_mane') {
        ctx.fillStyle = col;
        if (!back) {
            ctx.fillRect(10, 8, 4, 28); ctx.fillRect(50, 8, 4, 28);
            ctx.fillRect(14, 6, 36, 4);
        } else {
            ctx.fillRect(10, 8, 44, 28);
        }
    }
    else if (miscId === 'penguin_belly') {
        if (!back) {
            ctx.fillStyle = col;
            ctx.fillRect(24, 35, 16, 20);
        } else {
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(20, 30, 24, 30);
        }
    }
    else if (miscId === 'protogen_visor') {
        // The characteristic protogen visor/helmet - uses custom color
        if (!back) {
            ctx.fillStyle = col;
            ctx.fillRect(14, 10, 36, 24);
            // Visor edge highlights (slightly lighter)
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(14, 10, 36, 24);
            // Side vents (darker)
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(14, 14, 3, 4);
            ctx.fillRect(47, 14, 3, 4);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(14, 19, 3, 2);
            ctx.fillRect(47, 19, 3, 2);
        } else {
            // Back of visor/helmet
            ctx.fillStyle = col;
            ctx.fillRect(14, 10, 36, 24);
            // Back panel lines (lighter)
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(30, 12, 4, 2);
            ctx.fillRect(28, 30, 8, 2);
        }
    }
    // --- NEW MISC TYPES ---
    else if (miscId === 'wolf_ruff') {
        // Fluffy neck ruff
        ctx.fillStyle = col;
        if (!back) {
            ctx.fillRect(18, 32, 28, 6);
        } else {
            ctx.fillRect(16, 30, 32, 8);
        }
    }
    else if (miscId === 'deer_spots') {
        // White spots on body
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.arc(24, 40, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(40, 38, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(30, 48, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(38, 50, 2, 0, Math.PI * 2); ctx.fill();
    }
    else if (miscId === 'owl_feathers') {
        // Feathery chest
        if (!back) {
            ctx.fillStyle = col;
            for (let y = 36; y < 56; y += 4) {
                for (let x = 22; x < 42; x += 4) {
                    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
                }
            }
        }
    }
    else if (miscId === 'bat_wings') {
        // Bat wings
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(20, 35); ctx.lineTo(0, 20); ctx.lineTo(4, 40); ctx.lineTo(10, 35); ctx.lineTo(12, 50); ctx.fill();
        ctx.beginPath(); ctx.moveTo(44, 35); ctx.lineTo(64, 20); ctx.lineTo(60, 40); ctx.lineTo(54, 35); ctx.lineTo(52, 50); ctx.fill();
    }
    else if (miscId === 'shark_fin') {
        // Dorsal fin on back
        if (back) {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.moveTo(28, 40); ctx.lineTo(32, 30); ctx.lineTo(36, 40); ctx.fill();
        }
    }
    else if (miscId === 'dolphin_fin') {
        // Smaller dorsal fin
        if (back) {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.moveTo(30, 42); ctx.lineTo(32, 34); ctx.lineTo(34, 42); ctx.fill();
        }
    }
    else if (miscId === 'snake_scales') {
        // Scale pattern
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        for (let y = 36; y < 58; y += 4) {
            for (let x = 22 + ((y / 4) % 2) * 2; x < 42; x += 4) {
                ctx.fillRect(x, y, 3, 3);
            }
        }
    }
    else if (miscId === 'tiger_stripes') {
        // Orange tiger stripes
        ctx.fillStyle = '#222';
        ctx.fillRect(22, 38, 2, 8); ctx.fillRect(28, 36, 2, 10);
        ctx.fillRect(34, 38, 2, 8); ctx.fillRect(40, 36, 2, 10);
        // Head stripes
        ctx.fillRect(18, 16, 2, 6); ctx.fillRect(44, 16, 2, 6);
    }
    else if (miscId === 'leopard_spots') {
        // Leopard spots
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(26, 40, 3, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(38, 42, 3, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(30, 50, 3, 0, Math.PI * 2); ctx.stroke();
    }
    else if (miscId === 'zebra_stripes') {
        // Black zebra stripes
        ctx.fillStyle = '#000';
        ctx.fillRect(22, 36, 2, 20); ctx.fillRect(28, 36, 2, 20);
        ctx.fillRect(34, 36, 2, 20); ctx.fillRect(40, 36, 2, 20);
    }
    else if (miscId === 'panda_patches') {
        // Black eye patches
        if (!back) {
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.ellipse(22, 20, 6, 5, -0.3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(42, 20, 6, 5, 0.3, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (miscId === 'skunk_stripe') {
        // White stripe down back
        ctx.fillStyle = '#fff';
        ctx.fillRect(30, 10, 4, 50);
    }
    else if (miscId === 'otter_belly') {
        // Light belly patch
        if (!back) {
            ctx.fillStyle = col;
            ctx.fillRect(24, 36, 16, 18);
        }
    }
    else if (miscId === 'hedgehog_spines') {
        // Spiky back
        if (back) {
            ctx.fillStyle = '#8B4513';
            for (let x = 18; x < 46; x += 3) {
                ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x + 1.5, 28); ctx.lineTo(x + 3, 34); ctx.fill();
            }
        }
    }
    else if (miscId === 'squirrel_cheeks' || miscId === 'hamster_cheeks') {
        // Puffy cheeks
        if (!back) {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(16, 26, 5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(48, 26, 5, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (miscId === 'freckles') {
        // Cute freckles
        if (!back) {
            ctx.fillStyle = 'rgba(139,69,19,0.5)';
            ctx.beginPath(); ctx.arc(18, 26, 1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(22, 28, 1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(20, 24, 1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(42, 26, 1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(46, 28, 1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(44, 24, 1, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (miscId === 'blush') {
        // Blushing cheeks
        if (!back) {
            ctx.fillStyle = 'rgba(255,100,150,0.4)';
            ctx.beginPath(); ctx.ellipse(18, 26, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(46, 26, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
        }
    }
    else if (miscId === 'scars') {
        // Battle scars
        if (!back) {
            ctx.strokeStyle = 'rgba(100,50,50,0.6)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(16, 18); ctx.lineTo(22, 26); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(18, 18); ctx.lineTo(24, 26); ctx.stroke();
        }
    }
    else if (miscId === 'bandage') {
        // Bandage on head
        if (!back) {
            ctx.fillStyle = '#f5f5dc';
            ctx.fillRect(40, 14, 10, 6);
            ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(42, 14); ctx.lineTo(42, 20); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(48, 14); ctx.lineTo(48, 20); ctx.stroke();
        }
    }
    else if (miscId === 'whiskers_long') {
        // Long whiskers
        if (!back) {
            ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(10, 24); ctx.lineTo(26, 26); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(10, 28); ctx.lineTo(26, 28); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(10, 32); ctx.lineTo(26, 30); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(54, 24); ctx.lineTo(38, 26); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(54, 28); ctx.lineTo(38, 28); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(54, 32); ctx.lineTo(38, 30); ctx.stroke();
        }
    }
    else if (miscId === 'angel_wings') {
        // White feathered wings
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(20, 38); ctx.lineTo(0, 30); ctx.lineTo(4, 45); ctx.lineTo(10, 40); ctx.lineTo(14, 52); ctx.fill();
        ctx.beginPath(); ctx.moveTo(44, 38); ctx.lineTo(64, 30); ctx.lineTo(60, 45); ctx.lineTo(54, 40); ctx.lineTo(50, 52); ctx.fill();
    }
    else if (miscId === 'demon_horns') {
        // Red demon horns
        ctx.fillStyle = '#aa0000';
        ctx.beginPath(); ctx.moveTo(16, 10); ctx.lineTo(10, -4); ctx.lineTo(22, 10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(48, 10); ctx.lineTo(54, -4); ctx.lineTo(42, 10); ctx.fill();
    }
    else if (miscId === 'halo') {
        // Floating golden halo
        ctx.strokeStyle = '#ffdd00'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(32, -4, 10, 3, 0, 0, Math.PI * 2); ctx.stroke();
    }
}

// Draw tail (back view only)
function drawTail(ctx, tailId, col, bellyCol, back) {
    if (!back || tailId === 'none') return;

    ctx.fillStyle = col;
    // Add subtle outline to all tails for visibility
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;

    // Tails draw at back of body (moved up to avoid ground clipping)
    if (tailId === 'cat') {
        // Simple straight tail with outline
        ctx.fillRect(28, 48, 8, 10);
        ctx.strokeRect(28, 48, 8, 10);
    }
    else if (tailId === 'bunny') {
        // Fluffy puff tail
        ctx.fillStyle = bellyCol || '#fff';
        ctx.beginPath(); ctx.arc(32, 52, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'dog') {
        // Upward wagging tail
        ctx.beginPath(); ctx.moveTo(28, 50); ctx.lineTo(38, 40); ctx.lineTo(42, 43); ctx.lineTo(32, 55); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'bear') {
        // Small round nub
        ctx.beginPath(); ctx.arc(32, 52, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'fox') {
        // Big fluffy fox tail - iconic bushy shape
        ctx.beginPath();
        ctx.moveTo(24, 46);  // Start at body
        ctx.quadraticCurveTo(10, 40, 8, 48);  // Curve out left
        ctx.quadraticCurveTo(6, 56, 20, 54);  // Bottom curve
        ctx.lineTo(24, 50);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // White tip
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.moveTo(8, 46);
        ctx.quadraticCurveTo(4, 48, 8, 52);
        ctx.quadraticCurveTo(12, 50, 10, 47);
        ctx.closePath();
        ctx.fill();
    }
    else if (tailId === 'pig') {
        // Curly corkscrew tail with outline
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(36, 50, 4, 0, Math.PI * 1.5); ctx.stroke();
        // Outline
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(36, 50, 5, 0, Math.PI * 1.5); ctx.stroke();
    }
    else if (tailId === 'dragon') {
        // Simple white triangle tail spike
        ctx.fillStyle = '#eee';
        ctx.beginPath(); ctx.moveTo(28, 48); ctx.lineTo(32, 60); ctx.lineTo(36, 48); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'mouse') {
        // Long thin pink tail
        ctx.strokeStyle = 'pink'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(32, 48); ctx.quadraticCurveTo(40, 56, 32, 62); ctx.stroke();
    }
    else if (tailId === 'duck') {
        // Small feathery tail
        ctx.beginPath(); ctx.moveTo(26, 50); ctx.lineTo(32, 45); ctx.lineTo(38, 50); ctx.lineTo(32, 53); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'axolotl') {
        // Fin-like tail
        ctx.fillStyle = '#ff69b4';
        ctx.beginPath(); ctx.moveTo(28, 48); ctx.lineTo(26, 58); ctx.lineTo(38, 58); ctx.lineTo(36, 48); ctx.closePath(); ctx.fill(); ctx.stroke();
        // Stripes
        ctx.fillStyle = '#ff8da1';
        ctx.fillRect(30, 50, 4, 6);
    }
    else if (tailId === 'raccoon') {
        // Striped bushy tail
        ctx.fillStyle = '#999';
        ctx.fillRect(28, 48, 8, 12);
        ctx.strokeRect(28, 48, 8, 12);
        ctx.fillStyle = '#333';
        ctx.fillRect(28, 50, 8, 3); ctx.fillRect(28, 55, 8, 3);
    }
    else if (tailId === 'lion') {
        // Tail with tuft
        ctx.fillRect(29, 48, 6, 10);
        ctx.strokeRect(29, 48, 6, 10);
        // Tuft at end
        ctx.fillStyle = '#a0522d';
        ctx.beginPath(); ctx.arc(32, 60, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'monkey') {
        // Curly prehensile tail with outline
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(32, 48); ctx.quadraticCurveTo(45, 52, 42, 60); ctx.quadraticCurveTo(40, 65, 46, 62); ctx.stroke();
        // Darker outline
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(32, 48); ctx.quadraticCurveTo(45, 52, 42, 60); ctx.quadraticCurveTo(40, 65, 46, 62); ctx.stroke();
    }
    else if (tailId === 'penguin') {
        // Small wedge tail
        ctx.fillStyle = 'black';
        ctx.beginPath(); ctx.moveTo(28, 50); ctx.lineTo(32, 56); ctx.lineTo(36, 50); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'frog') {
        // Frog has no tail, draw subtle shadow spots
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath(); ctx.arc(26, 52, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(38, 52, 3, 0, Math.PI * 2); ctx.fill();
    }
    else if (tailId === 'protogen') {
        // Mechanical segmented tail
        ctx.fillStyle = '#333';
        // Segments
        ctx.fillRect(28, 48, 8, 4);
        ctx.fillRect(27, 53, 10, 3);
        ctx.fillRect(26, 57, 12, 3);
        // Glowing accents
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(30, 49, 4, 2);
        ctx.fillRect(30, 54, 4, 1);
        ctx.fillRect(30, 58, 4, 1);
        // Outline
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.strokeRect(26, 48, 12, 12);
    }
    // --- NEW TAIL TYPES ---
    else if (tailId === 'wolf') {
        // Bushy wolf tail
        ctx.beginPath();
        ctx.moveTo(26, 48);
        ctx.quadraticCurveTo(20, 45, 18, 52);
        ctx.quadraticCurveTo(16, 58, 26, 56);
        ctx.lineTo(38, 56);
        ctx.quadraticCurveTo(40, 52, 38, 48);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'deer') {
        // Short deer tail
        ctx.fillRect(30, 50, 4, 6);
        ctx.strokeRect(30, 50, 4, 6);
    }
    else if (tailId === 'owl') {
        // Feathered owl tail
        ctx.beginPath(); ctx.moveTo(26, 50); ctx.lineTo(32, 60); ctx.lineTo(38, 50); ctx.fill();
        ctx.beginPath(); ctx.moveTo(28, 52); ctx.lineTo(32, 58); ctx.lineTo(36, 52); ctx.stroke();
    }
    else if (tailId === 'bat') {
        // Bat wing-like tail
        ctx.beginPath(); ctx.moveTo(28, 50); ctx.lineTo(24, 58); ctx.lineTo(32, 54); ctx.lineTo(40, 58); ctx.lineTo(36, 50); ctx.fill();
    }
    else if (tailId === 'shark') {
        // Shark tail fin
        ctx.beginPath(); ctx.moveTo(26, 52); ctx.lineTo(20, 48); ctx.lineTo(20, 58); ctx.lineTo(26, 54); ctx.fill();
        ctx.beginPath(); ctx.moveTo(38, 52); ctx.lineTo(44, 48); ctx.lineTo(44, 58); ctx.lineTo(38, 54); ctx.fill();
    }
    else if (tailId === 'dolphin') {
        // Horizontal dolphin fluke
        ctx.beginPath(); ctx.moveTo(28, 54); ctx.lineTo(16, 50); ctx.lineTo(16, 58); ctx.fill();
        ctx.beginPath(); ctx.moveTo(36, 54); ctx.lineTo(48, 50); ctx.lineTo(48, 58); ctx.fill();
    }
    else if (tailId === 'snake') {
        // Long serpentine tail
        ctx.strokeStyle = col; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.quadraticCurveTo(40, 56, 32, 62); ctx.quadraticCurveTo(24, 68, 32, 74); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.quadraticCurveTo(40, 56, 32, 62); ctx.stroke();
    }
    else if (tailId === 'tiger') {
        // Striped tiger tail
        ctx.fillRect(28, 48, 8, 12); ctx.strokeRect(28, 48, 8, 12);
        ctx.fillStyle = '#222';
        ctx.fillRect(28, 50, 8, 2); ctx.fillRect(28, 54, 8, 2); ctx.fillRect(28, 58, 8, 2);
    }
    else if (tailId === 'leopard') {
        // Spotted leopard tail
        ctx.fillRect(28, 48, 8, 12); ctx.strokeRect(28, 48, 8, 12);
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(30, 52, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(34, 56, 2, 0, Math.PI * 2); ctx.fill();
    }
    else if (tailId === 'rhino') {
        // Short rhino tail
        ctx.fillRect(30, 52, 4, 6);
        ctx.strokeRect(30, 52, 4, 6);
    }
    else if (tailId === 'elephant') {
        // Thin elephant tail with tuft
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.lineTo(32, 62); ctx.stroke();
        ctx.fillStyle = '#444';
        ctx.beginPath(); ctx.arc(32, 64, 3, 0, Math.PI * 2); ctx.fill();
    }
    else if (tailId === 'hippo') {
        // Stubby hippo tail
        ctx.fillRect(30, 52, 4, 4);
        ctx.strokeRect(30, 52, 4, 4);
    }
    else if (tailId === 'giraffe') {
        // Tufted giraffe tail
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.lineTo(32, 60); ctx.stroke();
        ctx.fillStyle = '#8B4513';
        ctx.beginPath(); ctx.arc(32, 62, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (tailId === 'zebra') {
        // Striped zebra tail with tuft
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.lineTo(32, 58); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(32, 60, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillRect(30, 58, 1, 4); ctx.fillRect(33, 58, 1, 4);
    }
    else if (tailId === 'panda') {
        // Short panda tail
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(32, 52, 4, 0, Math.PI * 2); ctx.fill();
    }
    else if (tailId === 'red_panda') {
        // Ringed red panda tail
        ctx.fillRect(28, 48, 8, 14); ctx.strokeRect(28, 48, 8, 14);
        ctx.fillStyle = '#cc6600';
        ctx.fillRect(28, 50, 8, 2); ctx.fillRect(28, 54, 8, 2); ctx.fillRect(28, 58, 8, 2);
    }
    else if (tailId === 'skunk') {
        // Bushy skunk tail with stripe
        ctx.beginPath();
        ctx.moveTo(24, 48);
        ctx.quadraticCurveTo(16, 38, 20, 32);
        ctx.quadraticCurveTo(32, 28, 44, 32);
        ctx.quadraticCurveTo(48, 38, 40, 48);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(30, 32, 4, 18);
    }
    else if (tailId === 'otter') {
        // Flat paddle otter tail
        ctx.beginPath();
        ctx.ellipse(32, 56, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'beaver') {
        // Flat beaver tail
        ctx.beginPath();
        ctx.ellipse(32, 56, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // Scale pattern
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5;
        for (let y = 52; y < 60; y += 2) {
            ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(40, y); ctx.stroke();
        }
    }
    else if (tailId === 'hedgehog') {
        // Stubby hedgehog tail
        ctx.beginPath(); ctx.arc(32, 52, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'squirrel') {
        // Big fluffy squirrel tail
        ctx.beginPath();
        ctx.moveTo(28, 48);
        ctx.quadraticCurveTo(16, 40, 18, 30);
        ctx.quadraticCurveTo(32, 24, 46, 30);
        ctx.quadraticCurveTo(48, 40, 36, 48);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'chipmunk') {
        // Striped chipmunk tail
        ctx.fillRect(28, 46, 8, 12); ctx.strokeRect(28, 46, 8, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(30, 46, 2, 12); ctx.fillRect(34, 46, 2, 12);
    }
    else if (tailId === 'hamster') {
        // Tiny hamster tail
        ctx.beginPath(); ctx.arc(32, 52, 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'chinchilla') {
        // Fluffy chinchilla tail
        ctx.beginPath();
        ctx.moveTo(28, 48);
        ctx.quadraticCurveTo(24, 52, 26, 58);
        ctx.quadraticCurveTo(32, 62, 38, 58);
        ctx.quadraticCurveTo(40, 52, 36, 48);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    }
    else if (tailId === 'ferret') {
        // Long thin ferret tail
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.quadraticCurveTo(38, 56, 34, 64); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(32, 50); ctx.quadraticCurveTo(38, 56, 34, 64); ctx.stroke();
    }
    else if (tailId === 'peacock') {
        // Colorful peacock feathers
        ctx.fillStyle = '#00aa44';
        ctx.beginPath();
        ctx.moveTo(24, 48);
        ctx.quadraticCurveTo(10, 30, 14, 20);
        ctx.lineTo(32, 28);
        ctx.lineTo(50, 20);
        ctx.quadraticCurveTo(54, 30, 40, 48);
        ctx.closePath();
        ctx.fill();
        // Eye spots
        ctx.fillStyle = '#0066aa';
        ctx.beginPath(); ctx.arc(22, 30, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(32, 26, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 30, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(22, 30, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(32, 26, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 30, 2, 0, Math.PI * 2); ctx.fill();
    }
    else if (tailId === 'mermaid') {
        // Mermaid fish tail
        ctx.fillStyle = '#00ccaa';
        ctx.beginPath();
        ctx.moveTo(28, 50);
        ctx.lineTo(24, 56);
        ctx.lineTo(10, 52);
        ctx.lineTo(10, 60);
        ctx.lineTo(24, 56);
        ctx.lineTo(28, 62);
        ctx.lineTo(36, 62);
        ctx.lineTo(40, 56);
        ctx.lineTo(54, 60);
        ctx.lineTo(54, 52);
        ctx.lineTo(40, 56);
        ctx.lineTo(36, 50);
        ctx.closePath();
        ctx.fill();
        // Scales
        ctx.strokeStyle = 'rgba(0,100,80,0.4)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(32, 54, 4, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(28, 58, 3, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(36, 58, 3, 0, Math.PI * 2); ctx.stroke();
    }
}

// Main drawing function - accepts either species string (legacy) or parts object
// partColors is optional: { earsColor, noseColor, miscColor, tailColor }
function drawSpecies(ctx, speciesOrParts, col, bellyCol, eyeCol, back, partColors) {
    ctx.clearRect(0, 0, 64, 64);

    // Determine if we're using legacy species or new parts system
    let parts;
    if (typeof speciesOrParts === 'string') {
        // Legacy: map species to parts for NPC compatibility
        const speciesMapping = {
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
            penguin: { ears: 'none', eyes: 'standard', nose: 'penguin', misc: 'penguin_belly', tail: 'penguin' },
        };
        parts = speciesMapping[speciesOrParts] || speciesMapping.cat;
    } else {
        parts = speciesOrParts;
    }

    // Get part-specific colors (fall back to main fur color, except nose which has per-type defaults)
    const pc = partColors || {};
    const earsCol = pc.earsColor || col;
    const noseCol = pc.noseColor || '';  // Empty = use per-nose-type default
    const miscCol = pc.miscColor || col;
    const tailCol = pc.tailColor || col;

    // Draw in correct order for proper layering
    drawBody(ctx, col, bellyCol, back);
    drawTail(ctx, parts.tail, tailCol, bellyCol, back);
    drawMisc(ctx, parts.misc, miscCol, bellyCol, back);
    drawEars(ctx, parts.ears, earsCol, bellyCol, back);

    if (!back) {
        drawEyes(ctx, parts.eyes, eyeCol);
        drawNose(ctx, parts.nose, bellyCol, noseCol);
    }
}

// Helper to keep face sizes consistent across all species
function drawStandardFace(ctx, eyeCol) {
    ctx.fillStyle = 'white'; ctx.fillRect(20, 18, 8, 8); ctx.fillRect(36, 18, 8, 8);
    ctx.fillStyle = eyeCol; ctx.fillRect(24, 20, 4, 4); ctx.fillRect(40, 20, 4, 4);
}

function drawShirt(ctx, shirtId, isBack, bodyColor) {
    const shirt = SHIRT_TYPES.find(s => s.id === shirtId);
    if (!shirt || shirt.id === 'none') return;

    // BASE BODY FILL
    ctx.fillStyle = shirt.color;
    ctx.fillRect(20, 34, 24, 24); // Body
    ctx.fillRect(18, 35, 28, 6);  // Shoulders

    // --- TYPES LOGIC ---

    // 1. HOODIE
    if (shirt.type === 'hoodie') {
        if (!isBack) {
            ctx.fillStyle = '#cccccc';
            ctx.fillRect(29, 34, 2, 8); // Drawstrings
            ctx.fillRect(33, 34, 2, 8);

            ctx.fillStyle = shirt.secondary || 'rgba(0,0,0,0.1)';
            ctx.beginPath(); // Kangaroo Pocket
            ctx.moveTo(24, 58); ctx.lineTo(40, 58); ctx.lineTo(38, 46); ctx.lineTo(26, 46); ctx.fill();
        } else {
            ctx.fillStyle = shirt.secondary || shirt.color;
            if (!shirt.secondary) ctx.filter = 'brightness(85%)';
            ctx.beginPath(); // Resting Hood
            ctx.moveTo(22, 34); ctx.quadraticCurveTo(32, 52, 42, 34); ctx.fill();
            ctx.filter = 'none';
        }
    }

    // 2. CREW NECK (Fixed)
    else if (shirt.type === 'crew') {
        if (!isBack) {
            ctx.fillStyle = bodyColor; // Paint skin color
            ctx.fillRect(28, 34, 8, 4);
        }
    }

    // 3. COLLARED
    else if (shirt.type === 'collared') {
        if (!isBack) {
            ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(31, 38, 2, 12);
            ctx.fillStyle = shirt.color; ctx.filter = 'brightness(80%)';
            ctx.beginPath(); ctx.moveTo(26, 34); ctx.lineTo(32, 40); ctx.lineTo(38, 34); ctx.fill();
            ctx.filter = 'none';
        }
    }

    // 4. SUIT / TUX
    else if (shirt.type === 'suit' || shirt.type === 'tux') {
        if (!isBack) {
            ctx.fillStyle = 'white';
            ctx.beginPath(); ctx.moveTo(32, 34); ctx.lineTo(26, 48); ctx.lineTo(38, 48); ctx.fill();
            if (shirt.type === 'suit') {
                ctx.fillStyle = '#cc0000';
                ctx.beginPath(); ctx.moveTo(30, 34); ctx.lineTo(34, 34); ctx.lineTo(33, 46); ctx.lineTo(31, 46); ctx.fill();
            } else {
                ctx.fillStyle = 'black';
                ctx.beginPath(); ctx.arc(32, 38, 2, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(29, 36, 6, 4);
            }
        }
    }

    // 5. STRIPED (Fixed)
    else if (shirt.type === 'striped') {
        ctx.fillStyle = shirt.secondary || 'rgba(255,255,255,0.3)';
        for (let i = 36; i < 58; i += 6) ctx.fillRect(20, i, 24, 2);
        if (!isBack) {
            ctx.fillStyle = bodyColor; // Paint skin color
            ctx.fillRect(28, 34, 8, 4);
        }
    }

    // 6. VERTICAL STRIPE (Fixed)
    else if (shirt.type === 'vertical_stripe') {
        ctx.fillStyle = 'black';
        for (let i = 22; i < 44; i += 6) ctx.fillRect(i, 34, 2, 24);
        if (!isBack) {
            ctx.fillStyle = bodyColor;
            ctx.fillRect(28, 34, 8, 4);
        }
    }

    // 7. CHECKERED
    else if (shirt.type === 'checkered') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (let i = 36; i < 58; i += 6) ctx.fillRect(20, i, 24, 2);
        for (let i = 22; i < 44; i += 6) ctx.fillRect(i, 34, 2, 24);
    }

    // 8. OVERALLS
    else if (shirt.type === 'overalls') {
        ctx.fillStyle = shirt.under || 'white';
        ctx.fillRect(20, 34, 24, 24); ctx.fillRect(18, 35, 28, 6);
        ctx.fillStyle = shirt.color;
        ctx.fillRect(20, 48, 24, 10);
        if (!isBack) {
            ctx.fillRect(24, 40, 16, 8); ctx.fillRect(24, 34, 2, 10); ctx.fillRect(38, 34, 2, 10);
            ctx.fillStyle = '#FFD700'; ctx.fillRect(24, 40, 2, 2); ctx.fillRect(38, 40, 2, 2);
        } else {
            ctx.fillRect(24, 42, 16, 6);
            ctx.beginPath(); ctx.moveTo(24, 42); ctx.lineTo(26, 34); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(40, 42); ctx.lineTo(38, 34); ctx.stroke();
        }
    }

    // 9. LOGO TEE (Fixed)
    else if (shirt.type === 'logo') {
        if (!isBack) {
            ctx.fillStyle = bodyColor; // Paint skin color instead of clearing
            ctx.fillRect(28, 34, 8, 4);

            ctx.fillStyle = 'white';
            ctx.font = '14px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(shirt.symbol || '?', 32, 46);
        }
    }

    // 10. CAMO
    else if (shirt.type === 'camo') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(24, 38, 3, 0, Math.PI * 2); ctx.arc(38, 42, 4, 0, Math.PI * 2);
        ctx.arc(28, 52, 3, 0, Math.PI * 2); ctx.arc(36, 50, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // 11. FLORAL (Fixed)
    else if (shirt.type === 'floral') {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        if (!isBack) {
            const df = (x, y) => {
                ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(x + 2, y, 2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(x, y + 2, 2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(x + 2, y + 2, 2, 0, Math.PI * 2); ctx.fill();
            };
            df(24, 40); df(36, 48); df(28, 50);

            ctx.fillStyle = bodyColor; // Paint skin
            ctx.fillRect(28, 34, 8, 4);
        }
    }

    // 12. SPECIALS (Fixed Vest)
    else if (shirt.type === 'coat') {
        if (!isBack) {
            ctx.fillStyle = '#888'; ctx.fillRect(30, 34, 4, 24);
            ctx.fillStyle = '#ccc'; ctx.fillRect(22, 40, 6, 1);
        }
    }
    else if (shirt.type === 'vest') {
        // Draw yellow vest stripes first (since base is already orange)
        ctx.fillStyle = 'yellow'; ctx.fillRect(20, 42, 24, 4);

        if (!isBack) {
            // Paint Grey Undershirt Strip instead of clearing
            ctx.fillStyle = '#888';
            ctx.fillRect(30, 34, 4, 24);
        }
    }
    else if (shirt.type === 'chain') {
        if (!isBack) {
            ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(32, 34, 6, 0, Math.PI); ctx.stroke();
        }
    }
}

function drawCollar(ctx, collarId, isBack) {
    const item = COLLAR_TYPES.find(c => c.id === collarId);
    if (!item || item.id === 'none') return;

    ctx.fillStyle = item.color;

    // --- BASIC / SPIKED / BELL ---
    // Fixed: x=20, width=24 (Matches Body Width)
    if (item.type === 'basic' || item.type === 'spiked' || item.type === 'bell') {
        ctx.fillRect(20, 34, 24, 4);

        if (item.type === 'spiked') {
            ctx.fillStyle = '#ccc';
            // Adjusted loop to cover full width
            for (let i = 20; i < 44; i += 4) {
                ctx.beginPath();
                ctx.moveTo(i, 34);
                ctx.lineTo(i + 2, 31);
                ctx.lineTo(i + 4, 34);
                ctx.fill();
            }
        }
        else if (item.type === 'bell' && !isBack) {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath(); ctx.arc(32, 40, 3, 0, Math.PI * 2); ctx.fill();
        }
    }

    // --- BOW TIE ---
    else if (item.type === 'bow') {
        if (!isBack) {
            ctx.fillStyle = item.color;
            ctx.beginPath(); ctx.arc(32, 36, 3, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(32, 36); ctx.lineTo(24, 32); ctx.lineTo(24, 40); ctx.fill();
            ctx.beginPath(); ctx.moveTo(32, 36); ctx.lineTo(40, 32); ctx.lineTo(40, 40); ctx.fill();
        } else {
            // Strap on back (Fixed Width)
            ctx.fillRect(20, 35, 24, 2);
        }
    }

    // --- BANDANA ---
    else if (item.type === 'bandana') {
        // Neck strap (Fixed Width)
        ctx.fillRect(20, 34, 24, 3);
        if (!isBack) {
            ctx.beginPath(); ctx.moveTo(22, 37); ctx.lineTo(42, 37); ctx.lineTo(32, 49); ctx.fill();
        }
    }

    // --- SCARF ---
    else if (item.type === 'scarf') {
        ctx.fillRect(20, 33, 24, 5);
        if (!isBack) {
            ctx.fillRect(36, 38, 6, 12);
        } else {
            ctx.fillRect(38, 34, 4, 8);
        }
    }

    // --- PEARLS ---
    else if (item.type === 'pearls') {
        ctx.fillStyle = 'white';
        // Adjusted loop for full width
        for (let i = 20; i < 44; i += 4) {
            ctx.beginPath(); ctx.arc(i + 2, 36, 2, 0, Math.PI * 2); ctx.fill();
        }
    }
}

// Draws fur patterns on the body and head (not covered by shirts)
function drawPattern(ctx, patternId, col, back) {
    if (!patternId || patternId === 'none') return;

    const pattern = typeof PATTERN_TYPES !== 'undefined' ? PATTERN_TYPES.find(p => p.id === patternId) : null;
    if (!pattern) return;

    const patternColor = pattern.color || '#000000';
    ctx.fillStyle = patternColor;

    // Only draw on HEAD area (14, 10, 36, 24) to avoid overlapping with shirts on body
    // Head coordinates: x=14, y=10, w=36, h=24

    if (patternId === 'spots') {
        // Spots on body (primary) and head (secondary)
        const bodySpots = [[26, 38], [38, 42], [30, 50], [22, 46], [36, 54]];
        const headSpots = [[20, 18], [44, 20]];
        [...bodySpots, ...headSpots].forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    else if (patternId === 'stripes') {
        // Tiger stripes on body and head
        ctx.fillRect(22, 35, 20, 3);
        ctx.fillRect(22, 42, 20, 3);
        ctx.fillRect(22, 49, 20, 3);
        ctx.fillRect(18, 14, 3, 8);
        ctx.fillRect(43, 14, 3, 8);
    }
    else if (patternId === 'calico') {
        // Calico patches on body (orange and black)
        ctx.fillStyle = '#ff8c00';
        ctx.fillRect(22, 34, 8, 10);
        ctx.fillStyle = '#000000';
        ctx.fillRect(34, 40, 8, 12);
        ctx.fillStyle = '#ff8c00';
        ctx.fillRect(26, 50, 10, 8);
        ctx.fillStyle = '#000000';
        ctx.fillRect(38, 14, 8, 8);
    }
    else if (patternId === 'tuxedo') {
        // White chest (front only)
        if (!back) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(26, 36, 12, 18);
            ctx.fillRect(28, 28, 8, 6);
        }
    }
    else if (patternId === 'tabby') {
        // Tabby stripes on body + M forehead
        ctx.save();
        ctx.translate(32, 45);
        ctx.rotate(0.3);
        ctx.fillRect(-10, -8, 3, 16);
        ctx.fillRect(-4, -10, 3, 20);
        ctx.fillRect(2, -8, 3, 16);
        ctx.fillRect(8, -6, 3, 12);
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(20, 18);
        ctx.lineTo(26, 10);
        ctx.lineTo(32, 16);
        ctx.lineTo(38, 10);
        ctx.lineTo(44, 18);
        ctx.lineWidth = 2;
        ctx.strokeStyle = patternColor;
        ctx.stroke();
    }
    else if (patternId === 'dalmatian') {
        // Black spots on body and head
        const spots = [[26, 36, 4], [38, 40, 3], [30, 48, 5], [24, 54, 3], [40, 52, 4], [20, 16, 3], [42, 18, 4]];
        spots.forEach(([x, y, r]) => {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    else if (patternId === 'cow') {
        // Irregular black patches on body and head
        ctx.beginPath();
        ctx.ellipse(28, 40, 7, 5, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(38, 52, 6, 8, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(40, 18, 5, 4, 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    else if (patternId === 'hearts') {
        // Hearts on body and head
        const drawHeart = (x, y, size) => {
            ctx.beginPath();
            ctx.moveTo(x, y + size / 4);
            ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + size / 4);
            ctx.bezierCurveTo(x - size / 2, y + size / 2, x, y + size * 0.7, x, y + size);
            ctx.bezierCurveTo(x, y + size * 0.7, x + size / 2, y + size / 2, x + size / 2, y + size / 4);
            ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + size / 4);
            ctx.fill();
        };
        drawHeart(28, 38, 8);
        drawHeart(38, 48, 6);
        drawHeart(32, 16, 5);
    }
    else if (patternId === 'stars') {
        // Stars on body and head
        const drawStar = (cx, cy, size) => {
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
                const x = cx + Math.cos(angle) * size;
                const y = cy + Math.sin(angle) * size;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
        };
        drawStar(28, 40, 5);
        drawStar(38, 50, 4);
        drawStar(32, 18, 4);
    }
}

// Main texture compositing function. Combines species, colors, and all cosmetics into one texture.
// partColors is optional: { earsColor, noseColor, miscColor, tailColor }
function createSpeciesTexture(species, hex, bellyHex, back, hatId = 'none', shirtId = 'none', collarId = 'none', eyeHex = '#000000', patternId = 'none', partColors = null) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const col = new THREE.Color(hex).getStyle();
    const bellyCol = new THREE.Color(bellyHex).getStyle();
    const eyeCol = new THREE.Color(eyeHex).getStyle();

    drawSpecies(ctx, species, col, bellyCol, eyeCol, back, partColors);

    // Draw fur pattern AFTER species but BEFORE shirt (so it doesn't cover clothes)
    drawPattern(ctx, patternId, col, back);

    // UPDATE: Pass 'col' (body color) to drawShirt so it can fix necklines
    drawShirt(ctx, shirtId, back, col);

    drawCollar(ctx, collarId, back);
    drawHat(ctx, hatId, back);

    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
}


function createFishTexture(fishName, colorHex) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');

    let fishData = null;
    if (typeof FISH_TYPES !== 'undefined') {
        fishData = FISH_TYPES.find(f => f.name === fishName);
    }
    const rarity = fishData ? fishData.rarity : "Common";
    const name = fishName.toLowerCase();

    // --- 1. Determine Styles ---
    let fillStyle = colorHex;
    let strokeStyle = '#000000';
    let hasScales = false;
    let hasGlitter = false;
    let hasGlow = false;

    if (rarity === 'Rare') {
        hasScales = true;
    } else if (rarity === 'Epic') {
        hasScales = true; strokeStyle = colorHex; hasGlow = true;
    } else if (rarity === 'Legendary') {
        hasGlitter = true; hasGlow = true;
        const grd = ctx.createLinearGradient(10, 10, 54, 54);
        if (name.includes('golden') || name.includes('gold')) {
            grd.addColorStop(0, '#FFFFA0'); grd.addColorStop(0.5, '#FFD700'); grd.addColorStop(1, '#B8860B');
            fillStyle = grd;
        } else if (name.includes('rainbow')) {
            grd.addColorStop(0, 'red'); grd.addColorStop(0.2, 'orange'); grd.addColorStop(0.4, 'yellow');
            grd.addColorStop(0.6, 'green'); grd.addColorStop(0.8, 'blue'); grd.addColorStop(1, 'violet');
            fillStyle = grd;
        } else if (name.includes('void') || name.includes('cosmic')) {
            grd.addColorStop(0, '#000000'); grd.addColorStop(0.5, '#300030'); grd.addColorStop(1, '#000000');
            fillStyle = grd; strokeStyle = '#ffffff';
        } else {
            grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, colorHex); grd.addColorStop(1, '#000000');
            fillStyle = grd;
        }
    }

    // --- 2. Define the Shape (Path2D) ---
    // We use 'p' instead of 'ctx' to define the shape so it doesn't get lost
    const p = new Path2D();

    // TYPE: TURTLE
    if (name.includes('turtle')) {
        p.arc(54, 32, 5, 0, Math.PI * 2); // Head
        p.moveTo(20, 20); p.lineTo(14, 12); p.lineTo(26, 12); // TL
        p.moveTo(20, 44); p.lineTo(14, 52); p.lineTo(26, 52); // BL
        p.moveTo(44, 20); p.lineTo(50, 12); p.lineTo(38, 12); // TR
        p.moveTo(44, 44); p.lineTo(50, 52); p.lineTo(38, 52); // BR
        p.moveTo(14, 32); p.lineTo(6, 28); p.lineTo(6, 36); // Tail
        p.moveTo(50, 32);
        p.ellipse(32, 32, 16, 13, 0, 0, Math.PI * 2); // Shell
    }
    // TYPE: URCHIN
    else if (name.includes('urchin')) {
        p.arc(32, 32, 14, 0, Math.PI * 2);
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const sx = 32 + Math.cos(angle) * 14;
            const sy = 32 + Math.sin(angle) * 14;
            const ex = 32 + Math.cos(angle) * 22;
            const ey = 32 + Math.sin(angle) * 22;
            p.moveTo(sx, sy); p.lineTo(ex, ey);
        }
    }
    // TYPE: SEAHORSE
    else if (name.includes('seahorse')) {
        p.moveTo(54, 18); p.lineTo(48, 18);
        p.bezierCurveTo(48, 10, 38, 10, 38, 20);
        p.bezierCurveTo(38, 30, 46, 35, 38, 45);
        p.bezierCurveTo(30, 55, 24, 50, 28, 45);
        p.lineTo(26, 45);
        p.bezierCurveTo(20, 55, 32, 60, 44, 45);
        p.bezierCurveTo(52, 30, 44, 25, 44, 20);
    }
    // TYPE: CRAB / LOBSTER
    else if (name.includes('crab') || name.includes('lobster')) {
        p.ellipse(32, 35, 16, 11, 0, 0, Math.PI * 2);
        p.moveTo(20, 35); p.lineTo(8, 22); p.lineTo(14, 18); p.lineTo(10, 16); p.lineTo(6, 20);
        p.moveTo(44, 35); p.lineTo(56, 22); p.lineTo(50, 18); p.lineTo(54, 16); p.lineTo(58, 20);
        p.moveTo(18, 40); p.lineTo(8, 45);
        p.moveTo(22, 44); p.lineTo(14, 50);
        p.moveTo(46, 40); p.lineTo(56, 45);
        p.moveTo(42, 44); p.lineTo(50, 50);
    }
    // TYPE: SQUID / JELLY
    else if (name.includes('squid') || name.includes('jelly') || name.includes('kraken')) {
        p.moveTo(20, 45);
        p.bezierCurveTo(20, 10, 44, 10, 44, 45);
        for (let x = 44; x >= 20; x -= 4) {
            p.lineTo(x - 2, 58);
            p.lineTo(x - 4, 45);
        }
        p.closePath();
    }
    // TYPE: EEL / SERPENT
    else if (name.includes('eel') || name.includes('serpent') || name.includes('worm')) {
        p.moveTo(54, 15);
        p.bezierCurveTo(10, 10, 10, 50, 50, 50);
        p.bezierCurveTo(30, 50, 30, 30, 54, 30);
        p.arc(54, 22.5, 7.5, -Math.PI / 2, Math.PI / 2);
    }
    // TYPE: RAY / MANTA
    else if (name.includes('ray') || name.includes('skate') || name.includes('manta')) {
        p.moveTo(32, 10); p.lineTo(60, 32); p.lineTo(32, 54); p.lineTo(4, 32); p.closePath();
        p.moveTo(32, 54); p.lineTo(32, 64); // Tail
    }
    // TYPE: SHARK / WHALE
    else if (name.includes('shark') || name.includes('whale') || name.includes('orca')) {
        const isWhale = name.includes('whale') || name.includes('orca');
        p.moveTo(58, 32);
        p.quadraticCurveTo(32, isWhale ? 10 : 15, 8, 25);
        p.lineTo(2, 15); p.lineTo(2, 45); p.lineTo(8, 35);
        p.quadraticCurveTo(32, 50, 58, 32);
    }
    // TYPE: SWORDFISH
    else if (name.includes('sword') || name.includes('marlin') || name.includes('pike')) {
        p.moveTo(64, 30); p.lineTo(44, 26); p.lineTo(10, 26);
        p.lineTo(4, 20); p.lineTo(4, 40); p.lineTo(10, 34);
        p.lineTo(44, 34); p.lineTo(64, 30);
    }
    // TYPE: STANDARD (Default)
    else {
        p.moveTo(56, 32);
        p.quadraticCurveTo(44, 20, 32, 20);
        p.lineTo(36, 12); p.lineTo(24, 14); p.lineTo(28, 20);
        p.quadraticCurveTo(16, 20, 14, 28);
        p.lineTo(4, 18); p.lineTo(4, 46); p.lineTo(14, 36);
        p.quadraticCurveTo(16, 44, 32, 44);
        p.lineTo(28, 50); p.lineTo(36, 48); p.lineTo(32, 44);
        p.quadraticCurveTo(44, 44, 56, 32);
    }

    // --- 3. Draw the Body (Using the saved 'p') ---
    ctx.fillStyle = fillStyle;
    if (hasGlow) {
        ctx.shadowColor = strokeStyle;
        ctx.shadowBlur = rarity === 'Legendary' ? 15 : 8;
    }
    ctx.fill(p);
    ctx.shadowBlur = 0;

    // --- 4. Apply Effects (Scales, etc) ---
    ctx.save();
    ctx.clip(p); // Clip to the fish shape

    // Draw Scales (FIXED: This no longer destroys the body path)
    if (hasScales || name.includes('dragon')) {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
        for (let y = 10; y < 60; y += 4) {
            for (let x = 10; x < 60; x += 4) {
                ctx.beginPath(); ctx.arc(x + (y % 8 == 0 ? 2 : 0), y, 2, 0, Math.PI); ctx.stroke();
            }
        }
    }

    // Shine
    if (rarity === 'Uncommon' || rarity === 'Epic') {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath(); ctx.ellipse(32, 24, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Glitter
    if (hasGlitter) {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 10; i++) {
            const rx = Math.random() * 64; const ry = Math.random() * 64;
            ctx.beginPath(); ctx.arc(rx, ry, Math.random() * 1.5, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.restore();

    // --- 5. Draw Outline (Last, so it's on top) ---
    ctx.lineWidth = 2;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke(p);

    // --- 6. Draw Eyes (Overlay) ---
    if (!name.includes('urchin') && !name.includes('ray') && !name.includes('manta')) {
        const isSeahorse = name.includes('seahorse');
        const eyeX = isSeahorse ? 48 : (name.includes('sword') ? 42 : 46);
        const eyeY = isSeahorse ? 15 : 28;

        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(eyeX, eyeY, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(eyeX + 1, eyeY, 1, 0, Math.PI * 2); ctx.fill();

        if (name.includes('crab') || name.includes('lobster') || name.includes('squid')) {
            // Draw second eye for these types
            const off = name.includes('squid') ? 8 : 12;
            ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(eyeX - off, eyeY, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(eyeX - off, eyeY, 1, 0, Math.PI * 2); ctx.fill();
        }
    }

    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
}

function createNameTagTexture(n) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d'); x.font = 'bold 32px Arial'; x.textAlign = 'center';
    x.fillStyle = 'black'; x.fillText(n, 128, 44); x.fillStyle = 'white'; x.fillText(n, 126, 42);
    const t = new THREE.CanvasTexture(c);
    // PIXEL FIX
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    return t;
}

function createTitleTexture(titleId) {
    const tObj = TITLE_TYPES.find(t => t.id === titleId) || TITLE_TYPES[0];
    const text = tObj.text;
    if (!text) return null;

    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = 'italic bold 24px Arial'; x.textAlign = 'center';
    x.fillStyle = tObj.color || '#87CEEB'; x.strokeStyle = 'black'; x.lineWidth = 4;
    x.strokeText(`< ${text} >`, 128, 50); x.fillText(`< ${text} >`, 128, 50);
    const t = new THREE.CanvasTexture(c);
    // PIXEL FIX
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    return t;
}

function createRodTexture(rodId) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');

    // Find Rod Data
    let rod = ROD_TYPES.find(r => r.id === rodId);
    if (!rod) rod = ROD_TYPES[0]; // Fallback to bamboo

    // Draw Rod (Diagonal: Bottom-Left to Top-Right)
    ctx.strokeStyle = rod.color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(4, 60); // Handle
    ctx.lineTo(60, 4); // Tip
    ctx.stroke();

    // Fancy Effects for specific rods
    if (rod.id === 'candy' || rod.id === 'rainbow') {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(4, 60); ctx.lineTo(60, 4); ctx.stroke();
        ctx.setLineDash([]);
    }

    // Reel
    ctx.fillStyle = rod.reel;
    ctx.beginPath(); ctx.arc(12, 52, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ccc';
    ctx.beginPath(); ctx.arc(12, 52, 2, 0, Math.PI * 2); ctx.fill();

    // Guides (Rings)
    ctx.fillStyle = '#aaa';
    ctx.fillRect(18, 46, 3, 3);
    ctx.fillRect(32, 32, 3, 3);
    ctx.fillRect(46, 18, 3, 3);

    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
}

function createPlayerMesh(col, name, hatId = 'none', eyeHex = '#000000', species = 'cat', titleId = 'none', rodId = 'bamboo') {
    const g = new THREE.Group();

    // Sprite Layers
    const tf = createSpeciesTexture(species, col, '#ffffff', false, hatId, 'none', 'none', eyeHex);
    const tb = createSpeciesTexture(species, col, '#ffffff', true, hatId, 'none', 'none', eyeHex);
    const m1 = new THREE.MeshBasicMaterial({ map: tf, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
    const m2 = new THREE.MeshBasicMaterial({ map: tb, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m1);
    s.position.y = 1.0; s.name = "playerSprite"; s.userData = { matFront: m1, matBack: m2 };
    g.add(s);

    // Name & Title
    const ntMat = new THREE.SpriteMaterial({ map: createNameTagTexture(name), depthWrite: false, depthTest: false });
    const nt = new THREE.Sprite(ntMat);
    nt.position.y = 2.1; nt.scale.set(3, 0.75, 1); nt.name = "nameTag";
    nt.renderOrder = 100;
    g.add(nt);

    const tTex = createTitleTexture(titleId);
    if (tTex) {
        const titleMat = new THREE.SpriteMaterial({ map: tTex, depthWrite: false, depthTest: false });
        const titleSprite = new THREE.Sprite(titleMat);
        titleSprite.position.y = 2.5; titleSprite.scale.set(3, 0.75, 1);
        titleSprite.name = "titleSprite";
        titleSprite.renderOrder = 101;
        titleSprite.visible = saveState.showTitles;
        g.add(titleSprite);
    }

    const st = createSpeakerTexture();
    const sm = new THREE.SpriteMaterial({ map: st, transparent: true, depthWrite: false, depthTest: false });
    const sp = new THREE.Sprite(sm);
    sp.position.y = 3.0; sp.scale.set(0.5, 0.5, 1); sp.name = "talkingIcon"; sp.visible = false;
    sp.renderOrder = 102;
    g.add(sp);

    // --- ROD LOGIC (FORWARD FACING) ---
    const rodTex = createRodTexture();
    const rodMat = new THREE.MeshBasicMaterial({ map: rodTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.5 });

    // Geometry 3x3
    const rodGeo = new THREE.PlaneGeometry(3.0, 3.0);

    // 1. Shift Pivot to Bottom-Left Corner (The Handle)
    rodGeo.translate(1.5, 1.5, 0);

    const r = new THREE.Mesh(rodGeo, rodMat);

    // 2. Position at Right Hand
    // x=0.6 (Right shoulder), y=0.8 (Hand height), z=0.1 (Slightly forward)
    r.position.set(0.6, 0.8, 0.1);

    // 3. Rotation
    // Y = -90 degrees (-1.57 rad): Points the flat plane forward (Z-axis).
    // The "Diagonal" texture now points Forward and Up.
    // We tilt X slightly (-0.2) to angle it outward.
    r.rotation.set(-0.2, -Math.PI / 2, 0);

    r.name = "rod";
    g.add(r);

    return g;
}

function createLocalPlayer() {
    player = createPlayerMesh(saveState.catColor, saveState.displayName, saveState.currentHat, saveState.eyeColor, saveState.species, saveState.currentTitle);

    // Give local player's UI elements higher renderOrder so they overlap other players
    const nameTag = player.getObjectByName('nameTag');
    if (nameTag) nameTag.renderOrder = 200;
    const titleSprite = player.getObjectByName('titleSprite');
    if (titleSprite) titleSprite.renderOrder = 201;
    const talkingIcon = player.getObjectByName('talkingIcon');
    if (talkingIcon) talkingIcon.renderOrder = 202;

    updateLocalVisuals();
    player.position.set(25, 0, 0); scene.add(player);
}

function renderKeybinds() {
    let container = document.getElementById('keybinds-container');

    // If it doesn't exist yet, create the container inside options-container
    if (!container) {
        const optionsDiv = document.getElementById('options-container');

        // Create separator
        const hr = document.createElement('hr');
        hr.style.border = '0'; hr.style.borderTop = '1px solid #444'; hr.style.margin = '15px 0';
        optionsDiv.insertBefore(hr, optionsDiv.lastElementChild.previousElementSibling); // Insert before buttons

        const h3 = document.createElement('h3');
        h3.innerText = "Key Bindings";
        h3.style.marginTop = '0';
        optionsDiv.insertBefore(h3, optionsDiv.lastElementChild.previousElementSibling);

        container = document.createElement('div');
        container.id = 'keybinds-container';
        container.style.maxHeight = '200px';
        container.style.overflowY = 'auto';
        container.style.marginBottom = '15px';
        container.style.paddingRight = '5px';
        optionsDiv.insertBefore(container, optionsDiv.lastElementChild.previousElementSibling);

        // Reset Button
        const btnReset = document.createElement('button');
        btnReset.className = 'btn-sm btn-danger';
        btnReset.innerText = "Reset Defaults";
        btnReset.style.width = "100%";
        btnReset.style.marginBottom = "10px";
        btnReset.onclick = resetKeybinds;
        optionsDiv.insertBefore(btnReset, optionsDiv.lastElementChild.previousElementSibling);
    }

    container.innerHTML = '';

    Object.keys(saveState.keybinds).forEach(action => {
        const row = document.createElement('div');
        row.className = 'control-row';

        const label = document.createElement('span');
        label.className = 'control-label';
        label.innerText = action;

        const btn = document.createElement('button');
        btn.className = 'key-btn';
        // Clean up the display text (remove 'Key', 'Digit', etc)
        let keyDisplay = saveState.keybinds[action].replace('Key', '').replace('Digit', '');
        if (keyDisplay === 'Space') keyDisplay = 'SPACE';
        btn.innerText = keyDisplay;

        btn.onclick = () => startRebind(action, btn);

        row.appendChild(label);
        row.appendChild(btn);
        container.appendChild(row);
    });
}

function startRebind(action, btnElement) {
    btnElement.innerText = "PRESS KEY";
    btnElement.classList.add('listening');

    // Remove old listeners just in case
    document.removeEventListener('keydown', handleRebind);

    // Define the temporary handler
    window.rebindAction = action;
    window.rebindBtn = btnElement;

    document.addEventListener('keydown', handleRebind);
}

function handleRebind(e) {
    e.preventDefault();
    e.stopPropagation();

    const action = window.rebindAction;
    const btn = window.rebindBtn;

    // Don't bind Escape if it's not the menu action (to allow cancelling)
    if (e.code === 'Escape' && action !== 'menu') {
        document.removeEventListener('keydown', handleRebind);
        renderKeybinds(); // Cancel
        return;
    }

    // Save
    saveState.keybinds[action] = e.code;
    saveGame();

    // Cleanup
    document.removeEventListener('keydown', handleRebind);
    renderKeybinds();
}

function resetKeybinds() {
    if (confirm("Reset all controls to default?")) {
        saveState.keybinds = { ...DEFAULT_KEYBINDS };
        saveGame();
        renderKeybinds();
    }
}

function updateSpriteDirection(obj, targetCamPos) {
    const sprite = obj.getObjectByName("playerSprite");
    if (!sprite || !sprite.userData.matFront) return;

    // OPTIMIZATION: Use reused vectors
    const toCam = _optVec1.copy(targetCamPos).sub(obj.position);
    toCam.y = 0;
    toCam.normalize();

    const facing = _optVec2;
    obj.getWorldDirection(facing);
    facing.y = 0;
    facing.normalize();

    if (toCam.dot(facing) > 0) sprite.material = sprite.userData.matFront;
    else sprite.material = sprite.userData.matBack;
}

function setupInputs() {
    const ci = document.getElementById('chat-input');

    // Chat Fade Logic
    ci.addEventListener('focus', () => {
        const ui = document.getElementById('chat-ui');
        if (ui) ui.style.opacity = '1';
        if (chatFadeTimer) clearTimeout(chatFadeTimer);
    });
    ci.addEventListener('blur', () => {
        refreshChatFade();
    });

    document.onkeydown = e => {
        const k = saveState.keybinds;

        // Chat Focus Logic
        if (document.activeElement === ci) {
            if (e.code === 'Enter' || e.key === 'Enter') {
                sendChatMessage(ci.value);
                ci.value = '';
                ci.blur();
                if (isMobile) document.getElementById('chat-ui').style.display = 'none';
            }
            else if (e.code === 'Escape') {
                ci.blur();
                refreshChatFade();
                return;
            }
            return;
        }

        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
        if (e.code === k.menu) { toggleOptions(); return; }
        if (e.code === 'KeyI') { document.exitPointerLock(); togglePropsUI(); return; }
        if (e.code === 'KeyO') { undoProp(); return; }

        // Movement
        if (e.code === k.forward) controls.forward = true;
        if (e.code === k.backward) controls.backward = true;
        if (e.code === k.left) controls.left = true;
        if (e.code === k.right) controls.right = true;
        if (e.code === k.jump) controls.jump = true;

        // Interaction (Desktop)
        if (e.code === k.interact) {
            if (canSell) sellFish();
            else if (interactTarget === 'stylist') toggleShop();
            else if (interactTarget === 'bait') toggleBaitShop();
            else if (interactTarget === 'lava_keeper') {
                if (saveState.lavaUnlocked) {
                    enterLavaWorld();
                } else {
                    if (saveState.money >= 80000) {
                        if (confirm("Buy Lava World Access for $80,000?")) {
                            saveState.money -= 80000;
                            saveState.lavaUnlocked = true;
                            saveGame();
                            Sound.sell();
                            showToast("Lava World Unlocked!");
                            enterLavaWorld();
                        }
                    } else {
                        showToast("Need $80,000 to unlock!");
                    }
                }
            }
        }

        // --- TOOLS ---
        if (e.code === k.voice) toggleMic();
        if (e.code === k.guitar) toggleGuitar();
        if (e.code === k.glove) toggleGlove();
        if (e.code === k.showFish) toggleShowFish();
        if (e.code === 'KeyN') toggleEmptyHands(); // 'N' for Nothing/Empty
        if (e.code === k.hideHud) toggleHud();

        // Meow
        if (e.code === k.meow && !e.repeat) {
            const variant = Math.floor(Math.random() * 3);
            broadcastSound('meow', variant);
        }

        // Open Chat
        if ((e.code === k.chat || e.key === k.chat) && !isMobile) {
            ci.focus(); e.preventDefault();
        }
    };

    document.onkeyup = e => {
        const k = saveState.keybinds;
        if (e.code === k.forward) controls.forward = false;
        if (e.code === k.backward) controls.backward = false;
        if (e.code === k.left) controls.left = false;
        if (e.code === k.right) controls.right = false;
        if (e.code === k.jump) controls.jump = false;
    };

    document.onmousemove = e => {
        // Check for cameraFrozen to prevent movement when menus are open
        if (cameraFrozen) return;

        if (isRightMouseDown || (isFirstPerson && document.pointerLockElement === renderer.domElement)) {
            cameraRotationY -= e.movementX * 0.002;

            if (isFirstPerson) {
                cameraRotationX -= e.movementY * 0.002; // FP: Mouse Down -> Look Down (Decrease Angle)
            } else {
                cameraRotationX += e.movementY * 0.002; // TP: Mouse Down -> Cam Up (Increase Angle)
            }

            const limit = isFirstPerson ? Math.PI / 2 : Math.PI / 3; // Clamp
            cameraRotationX = Math.max(-limit, Math.min(limit, cameraRotationX)); // Increased range for FP
        }
    };

    document.onmousedown = e => {
        if (isMobile) return;
        if (e.target === ci || e.target.closest('.btn') || e.target.closest('.overlay-screen') || e.target.closest('.stat-row') || e.target.closest('#bait-ui')) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (e.button === 0) { isLeftMouseDown = true; handleAction(true); }
        else if (e.button === 2) { isRightMouseDown = true; renderer.domElement.requestPointerLock(); }
    };

    document.onmouseup = e => {
        if (!isMobile) {
            if (e.button === 0) { isLeftMouseDown = false; handleAction(false); }
            else if (e.button === 2) {
                isRightMouseDown = false;
                if (!isFirstPerson) document.exitPointerLock();
            }
        }
    };

    document.onwheel = (e) => {
        const isMenuOpen = document.querySelector('.overlay-screen[style*="flex"]');
        const isHoveringUI = e.target.closest('#fish-log') || e.target.closest('#chat-messages') || e.target.closest('#host-player-list');
        if (isMenuOpen || isHoveringUI) return;
        cameraDistance += e.deltaY * 0.005;
        cameraDistance = Math.max(0.5, Math.min(MAX_ZOOM, cameraDistance));

        // First Person Toggle
        if (cameraDistance < 2.0 && !isFirstPerson) {
            isFirstPerson = true;
            if (!isMobile) renderer.domElement.requestPointerLock();
        } else if (cameraDistance >= 2.0 && isFirstPerson) {
            isFirstPerson = false;
            if (!isMobile) document.exitPointerLock();
        }
    };

    // --- MOBILE JOYSTICK ---
    const jz = document.getElementById('joystick-zone'); const jk = document.getElementById('joystick-knob');
    let jid = null, jc = { x: 0, y: 0 };

    jz.ontouchstart = e => {
        e.preventDefault(); e.stopPropagation();
        const t = e.changedTouches[0];
        jid = t.identifier;
        const r = jz.getBoundingClientRect();
        jc = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        updateJoy(t.clientX, t.clientY);
    };

    jz.ontouchmove = e => {
        e.preventDefault(); e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === jid) updateJoy(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
        }
    };

    jz.ontouchend = e => {
        e.preventDefault(); e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === jid) {
                jk.style.transform = 'translate(0,0)';
                controls = { forward: false, backward: false, left: false, right: false, jump: false };
                jid = null;
            }
        }
    };

    function updateJoy(x, y) {
        let dx = x - jc.x, dy = y - jc.y; const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 40) { dx = (dx / d) * 40; dy = (dy / d) * 40; }
        jk.style.transform = `translate(${dx}px,${dy}px)`;
        controls.forward = dy < -10;
        controls.backward = dy > 10;
        controls.left = dx < -10;
        controls.right = dx > 10;
    }

    // --- MOBILE CAMERA ---
    let cid = null, lcx = 0, lcy = 0;

    document.body.ontouchstart = e => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (e.target.closest('.touch-zone') || e.target.closest('#room-info-ui') || e.target.closest('.btn') || e.target.tagName === 'INPUT') return;

        if (e.cancelable) e.preventDefault();

        if (cid === null && e.changedTouches.length > 0) {
            const t = e.changedTouches[0];
            cid = t.identifier;
            lcx = t.clientX;
            lcy = t.clientY;
        }
    };

    document.body.ontouchmove = e => {
        if (e.target.closest('.touch-zone')) return;
        if (e.cancelable) e.preventDefault();

        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === cid) {
                const t = e.changedTouches[i];
                cameraRotationY -= (t.clientX - lcx) * 0.005;
                if (isFirstPerson) {
                    cameraRotationX -= (t.clientY - lcy) * 0.005;
                } else {
                    cameraRotationX += (t.clientY - lcy) * 0.005;
                }
                const limit = isFirstPerson ? Math.PI / 2 : Math.PI / 3;
                cameraRotationX = Math.max(-limit, Math.min(limit, cameraRotationX));

                lcx = t.clientX;
                lcy = t.clientY;
            }
        }
    };

    document.body.ontouchend = e => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === cid) {
                cid = null;
            }
        }
    };
    document.body.ontouchcancel = document.body.ontouchend;

    // --- MOBILE BUTTONS ---
    const stopCam = (e) => { e.preventDefault(); e.stopPropagation(); };
    const btnAct = document.getElementById('btn-action');

    // --- UPDATED MOBILE ACTION HANDLER ---
    btnAct.ontouchstart = e => {
        stopCam(e);
        if (canSell) sellFish();
        else if (interactTarget === 'stylist') toggleShop();
        else if (interactTarget === 'bait') toggleBaitShop();

        // --- ADDED LAVA KEEPER CHECK FOR MOBILE ---
        else if (interactTarget === 'lava_keeper') {
            if (saveState.lavaUnlocked) {
                enterLavaWorld();
            } else {
                if (saveState.money >= 80000) {
                    if (confirm("Buy Lava World Access for $80,000?")) {
                        saveState.money -= 80000;
                        saveState.lavaUnlocked = true;
                        saveGame();
                        Sound.sell();
                        showToast("Lava World Unlocked!");
                        enterLavaWorld();
                    }
                } else {
                    showToast("Need $80,000 to unlock!");
                }
            }
        }
        // ------------------------------------------

        else { isLeftMouseDown = true; handleAction(true); }
    };

    btnAct.ontouchend = e => { stopCam(e); isLeftMouseDown = false; if (!canSell && interactTarget === null) handleAction(false); };
    btnAct.ontouchmove = stopCam;

    const btnJump = document.getElementById('btn-jump');
    btnJump.ontouchstart = e => { stopCam(e); controls.jump = true; };
    btnJump.ontouchend = e => { stopCam(e); controls.jump = false; };
    btnJump.ontouchmove = stopCam;

    const btnGuitar = document.getElementById('btn-mobile-guitar');
    if (btnGuitar) { btnGuitar.ontouchstart = e => { stopCam(e); toggleGuitar(); }; btnGuitar.ontouchmove = stopCam; }

    const btnGlove = document.getElementById('btn-mobile-glove');
    if (btnGlove) { btnGlove.ontouchstart = e => { stopCam(e); toggleGlove(); }; btnGlove.ontouchmove = stopCam; }

    const btnShowFish = document.getElementById('btn-mobile-show-fish');
    if (btnShowFish) { btnShowFish.ontouchstart = e => { stopCam(e); toggleShowFish(); }; btnShowFish.ontouchmove = stopCam; }

    // --- PROP BUTTONS ---
    const btnPlace = document.getElementById('btn-mobile-place');
    if (btnPlace) {
        btnPlace.ontouchstart = e => { stopCam(e); requestPlaceProp(); };
        btnPlace.ontouchmove = stopCam;
    }

    const btnUndo = document.getElementById('btn-mobile-undo');
    if (btnUndo) {
        btnUndo.ontouchstart = e => { stopCam(e); requestUndoProp(); };
        btnUndo.ontouchmove = stopCam;
    }

    // --- EMPTY HANDS BUTTON ---
    const btnEmpty = document.getElementById('btn-mobile-empty');
    if (btnEmpty) {
        btnEmpty.ontouchstart = e => { stopCam(e); toggleEmptyHands(); };
        btnEmpty.ontouchmove = stopCam;
    }

    // --- TOGGLES ---
    const btnChatM = document.getElementById('chat-toggle-mobile');
    if (btnChatM) {
        btnChatM.ontouchstart = (e) => {
            stopCam(e);
            const ui = document.getElementById('chat-ui');
            ui.style.display = ui.style.display === 'none' ? 'flex' : 'none';
            if (ui.style.display === 'flex') {
                ui.style.opacity = '1';
                document.getElementById('chat-input').focus();
            }
        };
    }

    const btnMicM = document.getElementById('mic-toggle-mobile');
    if (btnMicM) { btnMicM.ontouchstart = (e) => { stopCam(e); toggleMic(); }; }

    const btnFull = document.getElementById('btn-fullscreen-mobile');
    if (btnFull) {
        btnFull.ontouchstart = (e) => { stopCam(e); toggleFullScreen(); };
    }
}

function handleMobileZoom(val) {
    cameraDistance = MAX_ZOOM - (val * (MAX_ZOOM - MIN_ZOOM));

    // First Person Toggle
    if (cameraDistance < 2.0 && !isFirstPerson) {
        isFirstPerson = true;
    } else if (cameraDistance >= 2.0 && isFirstPerson) {
        isFirstPerson = false;
    }
}

function handleAction(down) {

    // --- NEW: COOLDOWN CHECK ---
    if (Date.now() - lastCatchTime < 500) {
        if (down) showToast("Catch Cooldown Active!");
        return;
    }
    // ---------------------------

    // --- AUTO-EQUIP ROD IF HANDS EMPTY ---
    if (isHandsHidden) {
        if (down) {
            isHandsHidden = false;
            updateLocalVisuals();
            showToast("Rod Equipped");
            return; // Don't fish immediately
        }
        return;
    }

    if (isGuitarActive) {
        if (down) showToast("Can't fish while playing guitar!");
        return;
    }

    if (isGloveActive) {
        if (down) performPunch();
        return;
    }

    if (down) {
        // If holding a fish to show off, clear it when clicking
        // If holding a fish to show off, clear it when clicking
        if (localHeldFish) {
            // FIX: Grace period check (don't clear if just caught < 500ms ago)
            if (Date.now() - lastCatchTime > 500) {
                localHeldFish = null;
                if (fishHoldTimer) clearTimeout(fishHoldTimer);
                fishHoldTimer = null;
                updateLocalVisuals();
            } else {
                // Just ignore the click if it's too soon
                return;
            }
        }

        if (fishingState === 'idle') {
            fishingState = 'charging';
            chargeStart = Date.now();
            castMarker.visible = true;
        }

        else if (fishingState === 'reeling') {
            // Anti-Cheat / Click Rate Limit
            const now = Date.now();
            minigame.clickHistory.push(now);
            minigame.clickHistory = minigame.clickHistory.filter(t => now - t < 1000);

            if (minigame.clickHistory.length > 24) {
                stopFishing(false, "⚠ Anti-Cheat: Clicking too fast!");
                return;
            }

            broadcastSound('reel');

            // --- APPLY CLICK POWER ---
            const power = CLICK_POWER_RATES[saveState.clickPowerLevel] || 1;
            minigame.currentClicks += power;
            // -------------------------

            if (minigame.currentClicks >= minigame.clicksNeeded) {
                stopFishing(true);
            }

            // Shake Effect
            const ui = document.getElementById('minigame-ui');
            ui.style.transform = `translate(-50%, -50%) rotate(${Math.random() * 4 - 2}deg) scale(1.05)`;
            setTimeout(() => ui.style.transform = 'translate(-50%, -50%) scale(1)', 50);

            updateMinigameUI();
        }

        else if (fishingState === 'waiting') stopFishing(false, "Too early!");
        else if (fishingState === 'biting') startMinigame();
    } else {
        if (fishingState === 'charging') releaseCast();
    }
}

function releaseCast() {
    const targetPos = castMarker.position;
    const dist = Math.sqrt(targetPos.x * targetPos.x + targetPos.z * targetPos.z);
    const distToSecret = Math.sqrt(targetPos.x * targetPos.x + (targetPos.z - -95) * (targetPos.z - -95));

    if (isInVoid) {
        fishingZone = 'void';
    }
    else if (isInLavaWorld) {
        // Check if cast is in the lava lake (center: -20000, 0, radius: 25)
        const LAVA_LAKE_CENTER_X = -20000;
        const LAVA_LAKE_CENTER_Z = 0;
        const LAVA_LAKE_RADIUS = 25;
        const distToLavaLake = Math.sqrt(
            Math.pow(targetPos.x - LAVA_LAKE_CENTER_X, 2) +
            Math.pow(targetPos.z - LAVA_LAKE_CENTER_Z, 2)
        );

        if (distToLavaLake < LAVA_LAKE_RADIUS) {
            fishingZone = 'lava';
        } else {
            stopFishing(false, "Cast into the lava lake!");
            return;
        }
    }
    else if (distToSecret < 12) {
        fishingZone = 'secret';
    } else if (dist < LAKE_RADIUS) {
        fishingZone = 'lake';
    } else {
        stopFishing(false, "Can't fish on land!");
        return;
    }

    if (activeBaitId !== 'none') {
        if (saveState.baitInventory[activeBaitId] > 0) {
            saveState.baitInventory[activeBaitId]--;
            saveGame();
            updateBaitSelector();
        } else {
            activeBaitId = 'none';
            updateBaitSelector();
            showToast("Out of bait!");
        }
    }

    broadcastSound('cast');
    fishingState = 'casting'; castMarker.visible = false;
    lastCastPos.copy(targetPos);
    createBobber(targetPos);

    const rod = player.getObjectByName("rod");
    if (rod) {
        // ANIMATION: Rotate X forward to point tip down towards water
        // Base is -0.2. We rotate to +0.8
        rod.rotation.x = 0.8;
    }

    setTimeout(() => { fishingState = 'waiting'; scheduleBite(); }, 500);
}

function createBobber(targetPos) {
    if (bobber) scene.remove(bobber);

    // Create a simple red sphere
    bobber = new THREE.Mesh(
        new THREE.SphereGeometry(0.2),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );

    // Set position
    bobber.position.copy(targetPos);

    // Save initial Y for the bobbing animation in the game loop
    bobberInitialY = targetPos.y;

    scene.add(bobber);
}

// In index.html

function performPunch() {
    // RATE LIMIT (Unified)
    if (Date.now() - lastAnimTime < ANIM_COOLDOWN) return;
    lastAnimTime = Date.now();

    animatePunch(player);
    broadcastSound('punch');

    // 1. Send Animation (FIXED PRIORITY)
    const animMsg = { type: 'anim', anim: 'punch' };

    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify(animMsg));
    }
    else if (isHost) {
        broadcastToClients(animMsg);
    }
    else if (hostConn && hostConn.open) {
        hostConn.send(animMsg);
    }

    // 2. Check Hit Logic
    Object.keys(otherPlayers).forEach(pid => {
        const p = otherPlayers[pid];
        const dist = player.position.distanceTo(p.mesh.position);

        if (dist < 3.5) {
            const los = checkLineOfSight(player.position, p.mesh.position);
            if (los.blocked) return;

            const dir = new THREE.Vector3().subVectors(p.mesh.position, player.position).normalize();

            const hitMsg = {
                type: 'punch_hit',
                targetId: pid,
                force: { x: dir.x * 20, z: dir.z * 20 }
            };

            // Send Hit Event (FIXED PRIORITY)
            // Note: We don't call handleHit locally for remote players; 
            // we send the command and let the server/client logic handle it.
            if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
                dedicatedSocket.send(JSON.stringify(hitMsg));
            }
            else if (isHost) {
                handleHit(hitMsg); // P2P Host handles it directly
            }
            else if (hostConn && hostConn.open) {
                hostConn.send(hitMsg);
            }
        }
    });
}

function handleHit(data) {
    // Check for ID mismatch
    const isMePeer = data.targetId === myPeerId;
    const isMeDedicated = (dedicatedId && data.targetId === dedicatedId);

    // FIX: Simplified check to ensure it works even if connection state flags are desynced
    if (isMePeer || isMeDedicated) {

        knockbackVelocity.x = data.force.x;
        knockbackVelocity.z = data.force.z;
        knockbackVelocity.y = 5;

        showToast("💥 OOF! You got punched!");
        broadcastSound('punch');
    }

    else if (isHost) {
        const conn = clientConns[data.targetId];
        if (conn && conn.open) {
            conn.send(data);
        }
    }
}

// --- ANIMATION TRACKING ---
let punchAnimFrameId = null;

function animatePunch(mesh) {
    const glove = mesh.getObjectByName('gloveMesh');
    if (!glove) return;

    // FIX: Cancel previous animation if active
    if (punchAnimFrameId) cancelAnimationFrame(punchAnimFrameId);

    const originalZ = 0.5;
    const punchZ = 1.5;

    let startTime = Date.now();
    function loop() {
        let p = (Date.now() - startTime) / 100;
        if (p > 2) {
            glove.position.z = originalZ;
            punchAnimFrameId = null; // Clear ID
            return;
        }

        if (p < 1) glove.position.z = originalZ + (punchZ - originalZ) * p;
        else glove.position.z = punchZ - (punchZ - originalZ) * (p - 1);

        glove.position.y = 1.0 + Math.random() * 0.1;

        // Track ID
        punchAnimFrameId = requestAnimationFrame(loop);
    }
    loop();
}

function scheduleBite() { biteTimer = setTimeout(() => { if (fishingState === 'waiting') { fishingState = 'biting'; bobber.material.color.setHex(0xffff00); bobber.position.y = -0.5; playSnagSound(); setTimeout(() => { if (fishingState === 'biting') stopFishing(false, "Got away!"); }, 1500); } }, 2000 + Math.random() * 3000); }
function startMinigame() {
    fishingState = 'reeling';
    minigame.active = true;
    minigame.targetFish = selectFish();

    minigame.clickHistory = [];

    // Base Difficulty (Standard World)
    let clicks = 15;
    let time = 5.0;

    const r = minigame.targetFish.rarity;
    if (r === 'Common') { clicks = 12; time = 5.0; }
    else if (r === 'Uncommon') { clicks = 20; time = 4.5; }
    else if (r === 'Rare') { clicks = 35; time = 4.5; }
    else if (r === 'Epic') { clicks = 55; time = 4.0; }
    else if (r === 'Legendary') { clicks = 80; time = 3.5; }

    // Tier Modifiers (Reduced penalties for better player experience)
    const tier = minigame.targetFish.tierId;
    if (tier === 'glistening') { clicks += 5; }
    else if (tier === 'shining') { clicks += 10; }
    else if (tier === 'opalescent') { clicks += 20; }

    // --- NEW: LAVA WORLD DIFFICULTY MODIFIER ---
    if (minigame.targetFish.isLava) {
        // DEFAULT PENALTY: 
        // Double the clicks needed and reduce time by 30%.
        // This makes it extremely hard with basic gear.
        clicks *= 2.0;
        time *= 0.7;

        // BAIT MITIGATION: 
        // High tier bait neutralizes the penalty significantly.
        // 'jig' ($5000), 'shrimp' ($8000), 'magic' ($15000)
        const b = activeBaitId;
        if (b === 'magic' || b === 'shrimp' || b === 'jig') {
            clicks *= 0.6; // Reduces multiplier to ~1.2x (Manageable)
            time *= 1.2;   // Gathers some time back
        } else if (b === 'grub' || b === 'spinner') {
            clicks *= 0.8; // Reduces multiplier to ~1.6x (Still hard)
        }

        // ROD MITIGATION: 
        // Having the Magma Rod (or better) helps handle the heat.
        const rod = saveState.currentRod;
        if (rod === 'lava' || rod === 'admin' || rod === 'golden' || rod === 'diamond' || rod === 'omega_milestone') {
            clicks *= 0.85;
            time *= 1.1;
        }
    }
    // -------------------------------------------

    const bait = BAIT_TYPES.find(b => b.id === activeBaitId);
    const timeBonus = bait ? (bait.power * 0.4) : 0;

    minigame.clicksNeeded = Math.floor(clicks); // Ensure integer
    minigame.currentClicks = 0;
    minigame.maxTime = Math.max(0.5, time + timeBonus);
    minigame.timeLeft = minigame.maxTime;

    document.getElementById('minigame-ui').style.display = 'flex';
    updateMinigameUI();
}

function stopFishing(success, msg) {
    fishingState = 'idle'; castMarker.visible = false; minigame.active = false; document.getElementById('minigame-ui').style.display = 'none';
    if (bobber) { scene.remove(bobber); bobber = null; }
    if (fishingLine) fishingLine.visible = false;
    clearTimeout(biteTimer);

    const rod = player.getObjectByName("rod");
    if (rod) {
        // RESET: Bring rod back to Up/Back position
        rod.rotation.x = -0.2;
    }

    // --- NEW: APPLY COOLDOWN REGARDLESS OF SUCCESS ---
    // If fishing stops for ANY reason (catch, failed reel, too early, timeout),
    // apply the 500ms cooldown to block the next instant click.
    lastCatchTime = Date.now();
    // --------------------------------------------------

    if (success) {
        // --- NEW: Server Authority Check ---
        if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
            dedicatedSocket.send(JSON.stringify({
                type: 'fishCaught',
                baitId: activeBaitId,
                zone: fishingZone
            }));
            return; // Wait for server confirmation
        }
        // -----------------------------------

        if (minigame.targetFish) {
            broadcastSound('catch');
            saveState.inventory.push(minigame.targetFish);
            updateJournal(minigame.targetFish, minigame.targetFish.tierId);
            saveGame();

            const tierStr = minigame.targetFish.tierId !== 'normal' ? ` (${minigame.targetFish.tierName})` : '';
            const sizeStr = minigame.targetFish.sizeLabel ? ` [${minigame.targetFish.sizeLabel}]` : '';
            showToast(`Caught ${minigame.targetFish.name}${tierStr}${sizeStr}!`);

            localHeldFish = {
                name: minigame.targetFish.name,
                color: minigame.targetFish.color,
                size: minigame.targetFish.size
            };

            if (fishHoldTimer) clearTimeout(fishHoldTimer);
            fishHoldTimer = setTimeout(() => {
                localHeldFish = null;
                updateLocalVisuals();
            }, 6000);

            updateLocalVisuals();

        } else {
            showToast("Error: Fish data lost.");
        }
    }
    else if (msg) showToast(msg);
}

function updateMinigameUI() {
    const f = document.getElementById('bar-fill');
    const t = document.getElementById('minigame-text');


    const pct = (minigame.timeLeft / minigame.maxTime) * 100;
    f.style.width = Math.max(0, pct) + "%";


    f.style.background = pct < 30 ? '#ff4444' : '#44ff44';


    const remaining = minigame.clicksNeeded - minigame.currentClicks;
    t.innerText = `CLICK! (${remaining})`;
    t.style.color = remaining <= 5 ? '#ffff00' : 'white';
}
function showToast(t) { const d = document.createElement('div'); d.className = 'toast'; d.innerText = t; document.getElementById('notification-area').appendChild(d); setTimeout(() => d.remove(), 3000); }

// --- GHOST/HAUNTING MECHANIC ---
// --- GHOST/HAUNTING MECHANIC ---
function spawnGhostMesh(x, z) {
    if (ghostMesh) scene.remove(ghostMesh);

    // Create base mesh and override textures for a ghostly appearance.
    ghostMesh = createPlayerMesh('#000000', ' ', 'none', '#FFFFFF', 'cat');

    const texF = createSpeciesTexture('cat', '#000000', '#000000', false, 'none', 'none', 'none', '#FFFFFF');
    const texB = createSpeciesTexture('cat', '#000000', '#000000', true, 'none', 'none', 'none', '#FFFFFF');

    const s = ghostMesh.getObjectByName('playerSprite');
    s.userData.matFront.map = texF;
    s.userData.matBack.map = texB;
    s.material = s.userData.matFront;
    s.material.needsUpdate = true;

    ghostMesh.position.set(x, 0, z);
    scene.add(ghostMesh);

    ghostDespawnTime = Date.now() + 30000;

    // FIX: Changed 'local' to 'system' so it doesn't put a bubble on YOU
    displayChatMessage("???", " has joined.", 'system');

    // Optional: Manually put a bubble on the GHOST instead
    showChatBubble(ghostMesh, "...");

    broadcastSound('meow', 2);
}

let ghostMesh = null;
let ghostDespawnTime = 0;
let nextGhostSpawn = Date.now() + (60000 + Math.random() * 3540000);

function updateGhost() {
    const now = Date.now();

    if (!ghostMesh && now > nextGhostSpawn) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 35 + Math.random() * 25;
        const x = player.position.x + Math.cos(angle) * dist;
        const z = player.position.z + Math.sin(angle) * dist;
        spawnGhostMesh(x, z);
    }

    if (ghostMesh && now > ghostDespawnTime) {
        scene.remove(ghostMesh);
        ghostMesh = null;

        nextGhostSpawn = now + (60000 + Math.random() * 3540000);

        // FIX: Changed 'local' to 'system' here too
        displayChatMessage("???", " has left.", 'system');
    }

    if (ghostMesh && player) {
        ghostMesh.lookAt(player.position.x, 0, player.position.z);
        updateSpriteDirection(ghostMesh, camera.position);
        const s = ghostMesh.getObjectByName('playerSprite');
        if (s) s.position.y = 1.0 + Math.sin(now * 0.002) * 0.05;
    }
}

// In index.html

function triggerHaunt(targetId) {
    const target = otherPlayers[targetId];
    if (!target) return;

    // Calculate position behind the target
    const angle = target.lastData.rot + Math.PI;
    const dist = 3;
    const pos = {
        x: target.mesh.position.x + Math.cos(angle) * dist,
        z: target.mesh.position.z + Math.sin(angle) * dist
    };

    // 1. Spawn locally immediately (so you see it)
    spawnGhostMesh(pos.x, pos.z);

    // 2. Prepare Message
    const msg = { type: 'forceGhost', x: pos.x, z: pos.z };

    // 3. Send to Network (FIXED PRIORITY)
    // ALWAYS check Dedicated Socket FIRST. Even if isHost is true (Admin), 
    // we must send to the WebSocket if we are connected to it.
    if (isConnectedToDedicated && dedicatedSocket && dedicatedSocket.readyState === WebSocket.OPEN) {
        dedicatedSocket.send(JSON.stringify(msg));
    }
    else if (isHost) {
        broadcastToClients(msg);
    }

    showToast(`Summoned Void Cat on ${target.lastData.name}`);
}

function removePlayer(pid) {
    const p = otherPlayers[pid];
    if (p) {
        // Trigger Leave Message (Must get name before deleting data).
        const name = p.lastData.name || "Fisher";
        // Check if we are in-game to avoid spam during disconnects/reloads
        if (document.getElementById('lobby-screen').style.display === 'none') {
            displayChatMessage(name, "has left.", 'system');
        }

        // Cleanup Visuals.
        if (p.mesh) scene.remove(p.mesh);
        if (p.bobberMesh) scene.remove(p.bobberMesh);
        if (p.lineMesh) scene.remove(p.lineMesh);

        // 3. Cleanup Audio Elements
        const audioEl = document.getElementById(`audio-${pid}`);
        if (audioEl) audioEl.remove();

        // Cleanup Data Structures.
        delete voiceConnections[pid];
        delete voiceAnalysers[pid];
        delete clientConns[pid];

        // Remove from main list.
        delete otherPlayers[pid];

        if (voiceConnections[pid]) {
            voiceConnections[pid].close();
        }

        console.log(`Player ${pid} removed`);
    }
}

// --- MOBILE FPS LIMITER ---
const MOBILE_FPS_INTERVAL = 1000 / 60; // 60 FPS = ~16.67ms per frame
let lastFrameTime = 0;

function animate() {
    requestAnimationFrame(animate);

    // FPS limit on mobile to prevent overheating
    if (isMobile) {
        const now = performance.now();
        if (now - lastFrameTime < MOBILE_FPS_INTERVAL) return;
        lastFrameTime = now;
    }

    const dt = clock.getDelta();

    // --- TIME & VISUALS ---
    updateDayNightCycle(dt);

    // --- UPDATE NPC SPRITES (Face Camera) ---
    if (npcMerchant) updateSpriteDirection(npcMerchant, camera.position);
    if (npcStylist) updateSpriteDirection(npcStylist, camera.position);
    if (npcBait) updateSpriteDirection(npcBait, camera.position);
    if (npcLavaKeeper) updateSpriteDirection(npcLavaKeeper, camera.position);
    // NEW: Update Lava World NPC Sprites
    if (npcLavaMerchant) updateSpriteDirection(npcLavaMerchant, camera.position);
    if (npcLavaStylist) updateSpriteDirection(npcLavaStylist, camera.position);
    if (npcLavaBait) updateSpriteDirection(npcLavaBait, camera.position);

    // --- AUDIO LISTENER ---
    if (audioCtx && camera) {
        // OPTIMIZATION: Reuse vector
        const forward = _optVec1;
        camera.getWorldDirection(forward);
        if (audioCtx.listener.forwardX) {
            audioCtx.listener.positionX.value = camera.position.x;
            audioCtx.listener.positionY.value = camera.position.y;
            audioCtx.listener.positionZ.value = camera.position.z;
            audioCtx.listener.forwardX.value = forward.x;
            audioCtx.listener.forwardY.value = forward.y;
            audioCtx.listener.forwardZ.value = forward.z;
            audioCtx.listener.upX.value = camera.up.x;
            audioCtx.listener.upY.value = camera.up.y;
            audioCtx.listener.upZ.value = camera.up.z;
        } else {
            audioCtx.listener.setPosition(camera.position.x, camera.position.y, camera.position.z);
            audioCtx.listener.setOrientation(forward.x, forward.y, forward.z, camera.up.x, camera.up.y, camera.up.z);
        }
    }

    // --- PORTAL LOGIC ---
    if (voidPortalMesh) {
        voidPortalMesh.rotation.z -= 2.0 * dt;
        // Only allow entering portal if in Main World (not Void or Lava)
        if (!isInVoid && !isInLavaWorld && player) {
            const dist = player.position.distanceTo(voidPortalMesh.position);
            if (dist < 2.0 && Date.now() > portalCooldown) {
                enterVoid();
            }
        }
        if (Date.now() > portalDespawnTime) {
            scene.remove(voidPortalMesh);
            voidPortalMesh = null;
        }
    }

    updateVoiceVisuals();
    updateGhost();

    // --- RAIN PARTICLES ---
    if (rainSystem && rainSystem.visible) {
        const positions = rainSystem.geometry.attributes.position.array;
        const vels = rainSystem.geometry.userData.velocities;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] -= vels[i / 3];
            if (positions[i + 1] < 0) positions[i + 1] = 40;
        }
        rainSystem.geometry.attributes.position.needsUpdate = true;
    }

    // --- WATERFALL ---
    if (waterfallMesh && waterfallMesh.material.map) {
        waterfallMesh.material.map.offset.y += 2 * dt;
    }

    // --- MINIGAME (Auto-Clicker) ---
    if (minigame.active && isLeftMouseDown && saveState.autoReelLevel > 0) {
        const cps = AUTO_CLICK_RATES[saveState.autoReelLevel];
        if (cps > 0) {
            autoClickAccumulator += dt;
            const interval = 1.0 / cps;
            while (autoClickAccumulator >= interval) {
                autoClickAccumulator -= interval;
                // Apply Click Power Multiplier to Auto-Reel
                const power = CLICK_POWER_RATES[saveState.clickPowerLevel] || 1;
                minigame.currentClicks += power;
                if (minigame.currentClicks >= minigame.clicksNeeded) {
                    stopFishing(true);
                    break;
                }
            }
            if (minigame.active) updateMinigameUI();
        }
    } else {
        autoClickAccumulator = 0;
    }

    if (minigame.active) {
        minigame.timeLeft -= dt;
        updateMinigameUI();
        if (minigame.timeLeft <= 0) stopFishing(false, "Time's up!");
    }

    // --- PHYSICS & MOVEMENT ---
    if (player) {
        player.updateMatrixWorld(true);

        // 1. DETERMINE FLOOR HEIGHT
        // Main World & Lava World both use Y=0 as the ground level
        let floorY = 0;
        if (isInVoid) floorY = 2000;

        // 2. KNOCKBACK (PvP)
        if (Math.abs(knockbackVelocity.x) > 0.1 || Math.abs(knockbackVelocity.z) > 0.1) {
            knockbackVelocity.multiplyScalar(0.9);
            const dx = knockbackVelocity.x * dt;
            const dz = knockbackVelocity.z * dt;
            // OPTIMIZATION: Reuse vector
            const testPos = _optVec1.copy(player.position);
            testPos.x += dx; testPos.z += dz;
            let hitWall = false;

            if (!isInVoid && !isInLavaWorld) {
                for (let t of treeColliders) {
                    // OPTIMIZATION: Reuse vector
                    if (testPos.distanceTo(_optVec2.set(t.x, 0, t.z)) < 0.5 + t.radius) hitWall = true;
                }
                for (let b of staticColliders) {
                    if (testPos.x > b.minX - 0.5 && testPos.x < b.maxX + 0.5 &&
                        testPos.z > b.minZ - 0.5 && testPos.z < b.maxZ + 0.5) hitWall = true;
                }
                if (testPos.length() < LAKE_RADIUS + 0.5) hitWall = true;
            }
            // (Simplified knockback checks for other worlds)

            if (!hitWall) {
                player.position.x += dx; player.position.z += dz;
            } else {
                knockbackVelocity.set(0, 0, 0);
            }
        }

        // 3. INPUT MOVEMENT
        // OPTIMIZATION: Reuse vector
        const v = _optVec2.set(0, 0, 0);
        if (document.activeElement !== document.getElementById('chat-input')) {
            const camForward = _optVec3;
            camera.getWorldDirection(camForward);
            camForward.y = 0; camForward.normalize();
            const camRight = _optVec4;
            camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)); // Allocating (0,1,0) is fine/minimal, or we could define UP const.
            camRight.normalize();
            if (controls.forward) v.add(camForward);
            if (controls.backward) v.sub(camForward);
            if (controls.right) v.add(camRight);
            if (controls.left) v.sub(camRight);
        }

        const sprite = player.getObjectByName("playerSprite");
        if (v.length() > 0) {
            v.normalize().multiplyScalar(PLAYER_SPEED * dt);
            // OPTIMIZATION: Reuse vector
            const np = _optVec1.copy(player.position).add(v);
            let col = false;

            // --- COLLISION CHECKS ---
            if (isInLavaWorld) {
                // Check against Lava Rocks
                if (typeof lavaColliders !== 'undefined') {
                    for (let r of lavaColliders) {
                        const dist = Math.sqrt((np.x - r.x) ** 2 + (np.z - r.z) ** 2);
                        if (dist < 0.5 + r.radius) col = true;
                    }
                }
            }
            else if (isInVoid) {
                // Void Edge
                // OPTIMIZATION: Reuse vector
                const voidCenter = _optVec3.set(10000, 2000, 10000);
                if (np.distanceTo(voidCenter) > 38) col = true;
            }
            else {
                // Main World Trees & Walls
                for (let t of treeColliders) {
                    // OPTIMIZATION: Reuse vector
                    if (np.distanceTo(_optVec3.set(t.x, 0, t.z)) < 0.5 + t.radius) col = true;
                }
                for (let b of staticColliders) {
                    if (np.x > b.minX - 0.5 && np.x < b.maxX + 0.5 &&
                        np.z > b.minZ - 0.5 && np.z < b.maxZ + 0.5) col = true;
                }
            }

            if (!col) {
                player.position.add(v);

                // Only rotate player based on movement in third-person mode
                // In first-person, player rotation is set by camera yaw later
                if (!isFirstPerson) {
                    const targetRotation = Math.atan2(v.x, v.z);
                    let rotDiff = targetRotation - player.rotation.y;
                    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
                    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
                    player.rotation.y += rotDiff * 10 * dt;
                }
            }
            if (fishingState !== 'idle' && fishingState !== 'charging') stopFishing(false, "Moved!");

            // Animation
            const time = Date.now() * 0.012;
            if (sprite) {
                sprite.position.y = 1.0 + Math.abs(Math.sin(time)) * 0.2;
                sprite.rotation.z = Math.sin(time) * 0.15;
            }
            if (audioCtx.currentTime - lastFootstepTime > 0.35) {
                broadcastSound('footstep');
                lastFootstepTime = audioCtx.currentTime;
            }
        } else {
            if (sprite) {
                sprite.position.y = THREE.MathUtils.lerp(sprite.position.y, 1.0, 10 * dt);
                sprite.rotation.z = THREE.MathUtils.lerp(sprite.rotation.z, 0, 10 * dt);
            }
        }

        // 4. GRAVITY
        if (player.position.y > floorY) playerVelocity.y -= GRAVITY * dt;
        if (player.position.y <= floorY) {
            if (player.position.y < floorY && playerVelocity.y < 0) broadcastSound('footstep');
            player.position.y = floorY; playerVelocity.y = 0;
            if (controls.jump) {
                playerVelocity.y = JUMP_FORCE;
                broadcastSound('jump');
            }
        }
        player.position.y += playerVelocity.y * dt;

        // 5. BOUNDARIES
        if (isInLavaWorld) {
            // OPTIMIZATION: Reuse vector
            const lavaCenter = _optVec3.set(-20000, -2.5, 0);

            const dx = player.position.x - lavaCenter.x;
            const dz = player.position.z - lavaCenter.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            // Outer Edge (Radius 78)
            if (dist > 78) {
                const angle = Math.atan2(dz, dx);
                player.position.x = lavaCenter.x + Math.cos(angle) * 78;
                player.position.z = lavaCenter.z + Math.sin(angle) * 78;
            }
            // Inner Lake Edge (Radius 26)
            if (dist < 26) {
                const angle = Math.atan2(dz, dx);
                player.position.x = lavaCenter.x + Math.cos(angle) * 26;
                player.position.z = lavaCenter.z + Math.sin(angle) * 26;
            }
        }
        else if (!isInVoid) {
            // Main Island Boundaries
            if (player.position.length() > ISLAND_RADIUS - 1) player.position.setLength(ISLAND_RADIUS - 1);
            if (player.position.length() < LAKE_RADIUS + 0.5) player.position.setLength(LAKE_RADIUS + 0.5);
        }

        if (isFirstPerson) {
            // First Person: Eye Level
            camera.position.copy(player.position);
            camera.position.y += 1.5;
            camera.rotation.set(cameraRotationX, cameraRotationY, 0, 'YXZ');
            player.visible = false; // Hide self locally

            // --- FIX: FORCE ROTATION LOCK ---
            // This ensures your sprite faces where you look, so other players see it correctly
            // Add PI offset because camera looks forward (-Z) but player rotation is based on +Z
            player.rotation.y = cameraRotationY + Math.PI;
            // -------------------------------

        } else {
            // Third Person: Orbit
            player.visible = true;
            camera.position.x = player.position.x + Math.sin(cameraRotationY) * cameraDistance * Math.cos(cameraRotationX);
            camera.position.z = player.position.z + Math.cos(cameraRotationY) * cameraDistance * Math.cos(cameraRotationX);
            camera.position.y = player.position.y + Math.sin(cameraRotationX) * cameraDistance + 3;
            camera.lookAt(player.position.x, player.position.y + 1, player.position.z);
        }

        // Update mobile slider
        if (isMobile) {
            const slider = document.getElementById('mobile-zoom-slider');
            if (slider) slider.value = (MAX_ZOOM - cameraDistance) / (MAX_ZOOM - MIN_ZOOM);
        }

        // 7. CASTING CHARGE VISUALS
        if (fishingState === 'charging') {
            const elapsedTime = Date.now() - chargeStart;
            let chargeRatio = Math.min(elapsedTime / MAX_CHARGE_TIME, 1.0);
            let currentDist = MIN_CAST_DISTANCE + chargeRatio * (MAX_CAST_DISTANCE - MIN_CAST_DISTANCE);
            const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
            const markerPos = player.position.clone().add(forward.multiplyScalar(currentDist));
            markerPos.y = floorY + 0.5;
            castMarker.position.copy(markerPos);

            // Visual feedback for valid casting
            let validCast = false;

            if (isInVoid) {
                const voidCenter = new THREE.Vector3(10000, 2000, 10000);
                if (markerPos.distanceTo(voidCenter) > 40) validCast = true;
            } else if (isInLavaWorld) {
                const lavaCenter = new THREE.Vector3(-20000, -2.5, 0);
                if (markerPos.distanceTo(lavaCenter) < 25) validCast = true;
            } else {
                const distToSecret = Math.sqrt(markerPos.x * markerPos.x + (markerPos.z - -95) * (markerPos.z - -95));
                const distFromLakeCenter = Math.sqrt(markerPos.x * markerPos.x + markerPos.z * markerPos.z);
                if (distToSecret < 12 || distFromLakeCenter < LAKE_RADIUS) validCast = true;
            }

            if (validCast) {
                castMarker.children.forEach(c => c.material.color.setHex(0x00ff00));
            } else {
                castMarker.children.forEach(c => c.material.color.setHex(0xff0000));
            }
        }

        if (sprite) updateSpriteDirection(player, camera.position);

        // --- INTERACTIONS ---
        interactTarget = null;
        canSell = false;

        const prompt = document.getElementById('npc-prompt');
        const btn = isMobile ? document.getElementById('btn-action') : null;
        prompt.style.display = 'none';
        if (btn) btn.innerText = "FISH";

        // --- MAIN WORLD INTERACTIONS ---
        if (!isInVoid && !isInLavaWorld) {
            const dMerchant = player.position.distanceTo(npcMerchant.position);
            const dStylist = player.position.distanceTo(npcStylist.position);
            const dBait = player.position.distanceTo(npcBait.position);
            const dLava = npcLavaKeeper ? player.position.distanceTo(npcLavaKeeper.position) : 999;

            if (dMerchant < 3) {
                canSell = true; interactTarget = 'merchant';
                prompt.innerText = "PRESS E TO SELL"; prompt.style.display = 'block';
                if (btn) btn.innerText = "SELL";
            }
            else if (dStylist < 3) {
                interactTarget = 'stylist';
                prompt.innerText = "PRESS E TO SHOP"; prompt.style.display = 'block';
                if (btn) btn.innerText = "SHOP";
            }
            else if (dBait < 3) {
                interactTarget = 'bait';
                prompt.innerText = "PRESS E FOR BAIT"; prompt.style.display = 'block';
                if (btn) btn.innerText = "BAIT";
            }
            else if (dLava < 3) {
                interactTarget = 'lava_keeper';
                if (saveState.lavaUnlocked) {
                    prompt.innerText = "PRESS E TO ENTER LAVA WORLD";
                    if (btn) btn.innerText = "ENTER";
                } else {
                    prompt.innerText = "PRESS E TO UNLOCK ($80k)";
                    if (btn) btn.innerText = "BUY";
                }
                prompt.style.display = 'block';
            }
        }

        // --- LAVA WORLD INTERACTIONS ---
        else if (isInLavaWorld) {
            // Check distances to the Lava versions of the NPCs
            const dLavaMerch = npcLavaMerchant ? player.position.distanceTo(npcLavaMerchant.position) : 999;
            const dLavaStyle = npcLavaStylist ? player.position.distanceTo(npcLavaStylist.position) : 999;
            const dLavaBait = npcLavaBait ? player.position.distanceTo(npcLavaBait.position) : 999;

            if (dLavaMerch < 3) {
                canSell = true; interactTarget = 'merchant';
                prompt.innerText = "PRESS E TO SELL"; prompt.style.display = 'block';
                if (btn) btn.innerText = "SELL";
            }
            else if (dLavaStyle < 3) {
                interactTarget = 'stylist';
                prompt.innerText = "PRESS E TO SHOP"; prompt.style.display = 'block';
                if (btn) btn.innerText = "SHOP";
            }
            else if (dLavaBait < 3) {
                interactTarget = 'bait';
                prompt.innerText = "PRESS E FOR BAIT"; prompt.style.display = 'block';
                if (btn) btn.innerText = "BAIT";
            }
        }
    }

    // --- REMOTE PLAYERS ---
    Object.keys(otherPlayers).forEach(id => {
        const p = otherPlayers[id];
        const dist = p.mesh.position.distanceTo(p.targetPos);
        const isMoving = dist > 0.1;
        p.mesh.position.lerp(p.targetPos, 6 * dt);
        p.mesh.rotation.y = THREE.MathUtils.lerp(p.mesh.rotation.y, p.targetRot, 6 * dt);
        const s = p.mesh.getObjectByName("playerSprite");
        if (s) {
            updateSpriteDirection(p.mesh, camera.position);
            if (isMoving) {
                const time = Date.now() * 0.012;
                s.position.y = 1.0 + Math.abs(Math.sin(time)) * 0.2;
                s.rotation.z = Math.sin(time) * 0.15;
            } else {
                s.position.y = THREE.MathUtils.lerp(s.position.y, 1.0, 10 * dt);
                s.rotation.z = THREE.MathUtils.lerp(s.rotation.z, 0, 10 * dt);
            }
        }
        if (p.bobberMesh && p.lineMesh) {
            const rod = p.mesh.getObjectByName("rod");
            if (rod) {
                const tip = new THREE.Vector3(3.0, 3.0, 0);
                tip.applyMatrix4(rod.matrixWorld);
                const pArr = p.lineMesh.geometry.attributes.position.array;
                pArr[0] = tip.x; pArr[1] = tip.y; pArr[2] = tip.z;
                pArr[3] = p.bobberMesh.position.x; pArr[4] = p.bobberMesh.position.y; pArr[5] = p.bobberMesh.position.z;
                p.lineMesh.geometry.attributes.position.needsUpdate = true;
            }
        }
    });

    // Bobber Animation (Waiting)
    if (bobber && fishingState === 'waiting') {
        let floorY = 0;
        if (isInVoid) floorY = 2000;
        // Lava/Main floorY is 0, so no offset needed

        // Position bobber to touch water surface (0.2 is bobber radius)
        bobber.position.y = floorY + 0.2 + Math.sin(Date.now() * 0.003) * 0.05;
    }

    // Fishing Line Update
    if (fishingLine && bobber && player) {
        if (fishingState !== 'idle' && fishingState !== 'charging') {
            fishingLine.visible = true;
            const rod = player.getObjectByName("rod");
            const tip = new THREE.Vector3(3.0, 3.0, 0);
            tip.applyMatrix4(rod.matrixWorld);
            const p = fishingLine.geometry.attributes.position.array;
            p[0] = tip.x; p[1] = tip.y; p[2] = tip.z;
            p[3] = bobber.position.x; p[4] = bobber.position.y; p[5] = bobber.position.z;
            fishingLine.geometry.attributes.position.needsUpdate = true;
        } else fishingLine.visible = false;
    }

    renderer.render(scene, camera);
}
clock = new THREE.Clock();

// Gracefully disconnect from peer server on window close.
window.addEventListener('beforeunload', () => {
    if (peer) {
        peer.destroy();
        peer = null;
    }
});

function escapeHTML(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- LINE OF SIGHT MATH HELPERS ---

// 1. Check if a line segment (p1 to p2) intersects a Circle (x, z, radius)
function lineIntersectsCircle(p1, p2, cx, cz, r) {
    // Vector from p1 to p2
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const lenSq = dx * dx + dz * dz;

    // Project circle center onto the line to find closest point
    let t = ((cx - p1.x) * dx + (cz - p1.z) * dz) / lenSq;

    // Clamp t to the segment [0, 1]
    t = Math.max(0, Math.min(1, t));

    // Find coordinates of the closest point on the line
    const closeX = p1.x + t * dx;
    const closeZ = p1.z + t * dz;

    // Check distance from closest point to circle center
    const distSq = (closeX - cx) * (closeX - cx) + (closeZ - cz) * (closeZ - cz);

    return distSq < (r * r);
}

// 2. Check if a line segment intersects an AABB (Box Wall)
function lineIntersectsBox(p1, p2, box) {
    // Simple approach: Check if line clipping against box bounds is valid
    // We expand the box slightly for safety
    const minX = box.minX - 0.5; const maxX = box.maxX + 0.5;
    const minZ = box.minZ - 0.5; const maxZ = box.maxZ + 0.5;

    // Cohen-Sutherland-like trivial rejection
    if ((p1.x < minX && p2.x < minX) || (p1.x > maxX && p2.x > maxX) ||
        (p1.z < minZ && p2.z < minZ) || (p1.z > maxZ && p2.z > maxZ)) {
        return false;
    }

    // If one point is inside and one outside, it intersects
    // (We assume players are never INSIDE a wall, so we just check if the line crosses)
    // Detailed segment-AABB intersection:
    // Check intersections with the 4 infinite lines of the box, then check if on segment
    // Simplified: Just use the Liang-Barsky algorithm logic or similar.

    // Let's use a robust generic logic:
    // Does the line cross X planes?
    const t0 = (minX - p1.x) / (p2.x - p1.x);
    const t1 = (maxX - p1.x) / (p2.x - p1.x);
    const t2 = (minZ - p1.z) / (p2.z - p1.z);
    const t3 = (maxZ - p1.z) / (p2.z - p1.z);

    let tMin = Math.max(Math.min(t0, t1), Math.min(t2, t3));
    let tMax = Math.min(Math.max(t0, t1), Math.max(t2, t3));

    // If tMin <= tMax and tMax >= 0 and tMin <= 1, intersection exists
    if (tMax < 0 || tMin > 1) return false;
    return tMin <= tMax;
}

function checkLineOfSight(start, end) { // Used for PvP punching
    // 1. Check Trees (Cylinders)
    for (let t of treeColliders) {
        // Use a slightly smaller radius (0.8) so we can punch AROUND trees, but not THROUGH the trunk
        if (lineIntersectsCircle(start, end, t.x, t.z, 1.0)) {
            return { blocked: true, type: "Tree" };
        }
    }

    // 2. Check Walls (Cabin, Mountains, Waterfall Cliffs)
    for (let b of staticColliders) {
        if (lineIntersectsBox(start, end, b)) {
            return { blocked: true, type: "Wall" };
        }
    }

    // 3. Check Lake (Center Hole)
    // If the line crosses the center water, you can't punch
    if (lineIntersectsCircle(start, end, 0, 0, LAKE_RADIUS)) {
        return { blocked: true, type: "Water" };
    }

    return { blocked: false };
}

// --- PATREON BANNER SYSTEM ---
// Change this to your Patreon URL
const PATREON_LINK = "https://www.patreon.com/c/HTMLFishing";

function initPatreonBanner() {
    const banner = document.getElementById('patreon-container');
    if (banner) {
        // Show immediately
        banner.style.display = 'flex';
        console.log("Patreon Banner: Active");
    }
}

function closePatreon() {
    const banner = document.getElementById('patreon-container');
    if (banner) {
        // If user closes it, hide it for this session
        banner.style.display = 'none';
        // Optional: Bring it back after 5 minutes if you want
        // setTimeout(() => { banner.style.display = 'flex'; }, 5 * 60 * 1000);
    }
}

function openPatreon() {
    window.open(PATREON_LINK, '_blank');
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPatreonBanner);
} else {
    // DOM is already ready, run immediately
    initPatreonBanner();
}


