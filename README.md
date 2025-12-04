# HTML Fishing 🎣

A 3D multiplayer fishing game built with WebGL (Three.js), supporting both Peer-to-Peer and Dedicated Server networking. Catch fish, trade for cosmetics, play guitar with MIDI support, and hang out with friends in a voxel-style world.

![Game Screenshot](https://via.placeholder.com/800x400?text=HTML+Fishing+Screenshot+Placeholder)

## 🌟 Features

*   **Multiplayer**: Hybrid networking architecture supporting P2P lobbies (via PeerJS) and authoritative Dedicated Servers (WebSocket).
*   **3D World**: Procedurally generated islands, day/night cycles, and dynamic weather (rain/fog).
*   **Fishing Mechanics**: Cast, wait for the bobber, and reel in minigame.
*   **Economy**: Catch varied fish species (Common to Legendary), sell them to the Merchant, and buy equipment/cosmetics.
*   **Voice Chat**: Proximity-based 3D voice chat.
*   **Instruments**: Playable guitar with MIDI file support (drag and drop .mid files).
*   **Admin System**: Robust administration tools for moderation (Kick, Ban, Mute) and fun (Spawn Portals, Haunt players).

## 🛠️ Installation & Development

### Prerequisites
*   Node.js (v16+ recommended)
*   npm

### 1. Client Setup
The client is built with Vite.

```bash
# Install dependencies
npm install

# Run local development server
npm run dev
```
Open `http://localhost:8000` in your browser.

### 2. Dedicated Server Setup
The server is a raw Node.js WebSocket server ensuring authority over the economy and moderation.

```bash
cd server

# Install dependencies (ws, etc.)
npm install

# Start the server (SECURITY: You MUST provide a password)
ADMIN_PW=mySuperSecurePassword npm run server
```
The server runs on port `8080` by default.

## 🕹️ Controls

| Action | Key |
| :--- | :--- |
| **Move** | `W` `A` `S` `D` |
| **Jump** | `Space` |
| **Interact / Fish** | `E` |
| **Reel In** | `Left Click` |
| **Charge Cast** | `Hold Left Click` |
| **Voice Chat (Push-to-Talk)** | `V` |
| **Equip Guitar** | `G` |
| **Toggle Glove (Punch)** | `B` |
| **Chat** | `Enter` |
| **Menu / Close UI** | `Esc` |

## 📂 Project Structure

*   **`src/main.js`**: The core game loop, rendering logic, and input handling. (Legacy "God Object" - currently being refactored).
*   **`src/modules/`**:
    *   `NetworkManager.js`: Handles WebSocket connections and PeerJS signaling.
    *   `GameState.js`: Manages local save data, inventory, and keybindings.
*   **`server/server.js`**: The authoritative game server. Handles economy verification, admin commands, and ban persistence.
*   **`src/data/`**: Configuration files for Fish types, Props, and Items.

## 🔒 Security Notes

*   **Admin Access**: The dedicated server requires an `ADMIN_PW` environment variable. Do not hardcode passwords in `server.js`.
*   **Economy**: Selling fish is validated on the server side to prevent client-side value manipulation.

## 🤝 Contributing

1.  Create a branch for your feature (`git checkout -b feature/amazing-feature`).
2.  Commit your changes (`git commit -m 'Add amazing feature'`).
3.  Push to the branch (`git push origin feature/amazing-feature`).
4.  Open a Pull Request.

## 📜 License

[MIT License](LICENSE) (Assuming standard open source - verify with repo owner).
