// --- NETWORKING (PEERJS) ---
let peer = null, myPeerId = null, currentRoomId = null, hostConn = null, clientConns = {}, isHost = false, otherPlayers = {};
let bannedPeers = []; let mutedVoicePeers = []; let mutedChatPeers = [];
let myData = { pos: { x: 0, y: 0, z: 0 }, rot: 0, bobber: null, name: "Fisher", color: "#ff6347", belly: "#ffffff", hat: "none", species: "cat", earsColor: "", noseColor: "", miscColor: "", tailColor: "" };

