// src/modules/NetworkManager.js
import { Peer } from 'peerjs';
import { saveState } from './GameState.js';

export const DEDICATED_WS_URL = 'ws://localhost:8080';

class NetworkManager {
    constructor() {
        this.socket = null;
        this.peer = null;
        this.myPeerId = null;
        this.isConnected = false;
        this.serverSalt = null;
        
        // Callbacks to interface with main game logic
        this.onConnect = null;
        this.onMessage = null;
        this.onDisconnect = null;
    }

    initPeer() {
        if (!this.peer || this.peer.destroyed) {
            this.peer = new Peer();
            this.peer.on('open', (id) => {
                this.myPeerId = id;
                console.log("[Network] PeerJS ID:", id);
                if (this.isConnected && this.socket) {
                    this.send({ type: 'setName', name: saveState.displayName, peerId: this.myPeerId });
                }
            });
            
            // Note: Call handling logic needs to be injected or handled via events
            // For now we will expose the peer object so main.js can attach handlers
        }
        return this.peer;
    }

    connect(url = DEDICATED_WS_URL) {
        if (this.socket) {
            this.socket.close();
        }

        console.log(`[Network] Connecting to ${url}...`);
        this.socket = new WebSocket(url);

        this.socket.addEventListener('open', () => {
            this.isConnected = true;
            console.log("[Network] Socket Connected");
            
            // Handshake
            this.send({ 
                type: 'setName', 
                name: saveState.displayName || 'Fisher',
                peerId: this.myPeerId 
            });

            if (this.onConnect) this.onConnect();
        });

        this.socket.addEventListener('message', (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch(e) { return; }

            if (msg.type === 'welcome' && msg.adminSalt) {
                this.serverSalt = msg.adminSalt;
            }

            if (this.onMessage) this.onMessage(msg);
        });

        this.socket.addEventListener('close', () => {
            this.isConnected = false;
            this.socket = null;
            if (this.onDisconnect) this.onDisconnect();
        });
    }

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    }

    async adminLogin(password) {
        if (!this.isConnected || !this.serverSalt) {
            console.error("Cannot login: Not connected or no salt received.");
            return false;
        }

        const hash = await this.sha256HexBrowser(password + this.serverSalt);
        this.send({ type: 'admin_login', hash });

        return new Promise((resolve) => {
            const tempListener = (ev) => {
                try {
                    const m = JSON.parse(ev.data);
                    if (m.type === 'admin_ok') {
                        this.socket.removeEventListener('message', tempListener);
                        resolve(true);
                    } else if (m.type === 'admin_fail') {
                        this.socket.removeEventListener('message', tempListener);
                        resolve(false);
                    }
                } catch(e) {}
            };
            this.socket.addEventListener('message', tempListener);
            setTimeout(() => {
                this.socket.removeEventListener('message', tempListener);
                resolve(false);
            }, 4000);
        });
    }

    async sha256HexBrowser(str) {
        const buf = new TextEncoder().encode(str);
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2,'0'))
            .join('');
    }
}

export const networkManager = new NetworkManager();
